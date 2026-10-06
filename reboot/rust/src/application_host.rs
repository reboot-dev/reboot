//! Generic Tonic application host with a server-owned application identity.
//!
//! Python's `ServiceServer` installs `UseApplicationIdInterceptor` for every
//! service it registers.  The Rust host makes the corresponding boundary a
//! mandatory Tower layer: callers cannot select target application identity
//! through `x-reboot-application-id` metadata.

use std::{
    collections::BTreeSet,
    convert::Infallible,
    error::Error,
    fmt,
    future::Future,
    net::SocketAddr,
    pin::Pin,
    sync::Arc,
    task::{Context, Poll},
};

use http::Request as HttpRequest;
use tokio::task::JoinSet;
use tokio_stream::wrappers::TcpListenerStream;
use tonic::{
    Request,
    body::BoxBody,
    codegen::http::Response as HttpResponse,
    server::NamedService,
    transport::{Endpoint, Server, server::Router},
};
use tonic_health::pb::{
    HealthCheckRequest, HealthCheckResponse,
    health_check_response::ServingStatus,
    health_server::{Health, HealthServer},
};
use tower::{
    Layer, Service,
    layer::util::{Identity, Stack},
};

// Keep recovery/identity ingress outermost so it rejects unavailable public
// requests before dispatch. The trailer layer only observes successful
// responses from the generated service and turns their staged metadata into
// wire trailers.
type RecoveryIngressStack = Stack<
    RecoveryIngressLayer,
    Stack<crate::successful_trailers::SuccessfulParticipantTrailerLayer, Identity>,
>;

use crate::{
    APPLICATION_ID_HEADER,
    durable_coordinator::{
        CoordinatorRecovery, CoordinatorSidecar, DurableRootCoordinator, ParticipantResolver,
    },
    durable_participant::{DurableActorParticipant, ParticipantRecovery, ParticipantSidecar},
    legacy_coordinator::CoordinatorWatchEndpoint,
    legacy_placement::{LegacyApplicationId, PlanOnlyLegacyPlacement},
    placement_proto,
};

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum RecoveryState {
    Recovering,
    Ready,
    Failed,
}

#[derive(Clone, Debug)]
pub struct RecoveryReadiness {
    state: tokio::sync::watch::Receiver<RecoveryState>,
}
impl RecoveryReadiness {
    fn state(&self) -> RecoveryState {
        *self.state.borrow()
    }
}

/// The Python health servicer reports the host's lifecycle readiness for any
/// `Check` request. It deliberately does not implement streaming `Watch`.
#[derive(Clone, Debug)]
struct HostHealth {
    readiness: RecoveryReadiness,
}

#[tonic::async_trait]
impl Health for HostHealth {
    async fn check(
        &self,
        _: Request<HealthCheckRequest>,
    ) -> Result<tonic::Response<HealthCheckResponse>, tonic::Status> {
        let status = match self.readiness.state() {
            RecoveryState::Ready => ServingStatus::Serving,
            RecoveryState::Recovering | RecoveryState::Failed => ServingStatus::NotServing,
        };
        Ok(tonic::Response::new(HealthCheckResponse {
            status: status as i32,
        }))
    }

    type WatchStream = Pin<
        Box<
            dyn tokio_stream::Stream<Item = Result<HealthCheckResponse, tonic::Status>>
                + Send
                + 'static,
        >,
    >;

    async fn watch(
        &self,
        _: Request<HealthCheckRequest>,
    ) -> Result<tonic::Response<Self::WatchStream>, tonic::Status> {
        Err(tonic::Status::unimplemented(
            "health watch is not implemented",
        ))
    }
}

/// Host-owned public-ingress gate driven by accepted legacy placement updates.
/// It is true by default so hosts that do not opt in preserve prior behavior.
#[derive(Clone, Debug)]
struct LegacyPlacementGate {
    state: tokio::sync::watch::Receiver<bool>,
    sender: tokio::sync::watch::Sender<bool>,
}

impl LegacyPlacementGate {
    fn new() -> Self {
        let (sender, state) = tokio::sync::watch::channel(true);
        Self { state, sender }
    }

    fn ready(&self) -> bool {
        *self.state.borrow()
    }

    fn require_placement(&self) {
        self.sender.send_replace(false);
    }

    fn set_ready(&self, ready: bool) {
        self.sender.send_replace(ready);
    }
}

#[derive(Clone)]
struct LegacyPlacementRequirement {
    placement: PlanOnlyLegacyPlacement,
    application: LegacyApplicationId,
}

/// Host-owned cancellation root for supervised recovery work.
#[derive(Clone, Debug)]
pub struct RecoveryCancellation {
    state: Arc<tokio::sync::watch::Sender<bool>>,
}
impl RecoveryCancellation {
    fn new() -> Self {
        let (state, _) = tokio::sync::watch::channel(false);
        Self {
            state: Arc::new(state),
        }
    }
    pub fn cancel(&self) {
        self.state.send_replace(true);
    }
    pub async fn cancelled(&self) {
        let mut receiver = self.state.subscribe();
        while !*receiver.borrow() {
            let _ = receiver.changed().await;
        }
    }
}

/// Runs after the host has bound its fixed router. Implementations add all
/// durable background work to this registry; the host cancels and joins it.
#[tonic::async_trait]
pub trait HostRecovery: Send + Sync + 'static {
    async fn start(
        &self,
        supervisor: &mut JoinSet<Result<(), tonic::Status>>,
        cancel: RecoveryCancellation,
    ) -> Result<(), tonic::Status>;
}

/// Host-owned `PlacementPlanner.ListenForPlan` stream lifecycle for the legacy
/// application plane. It retains the last valid snapshot, reconnects only
/// after `Unavailable`, and is always supervised by `RunningApplicationHost`.
#[derive(Clone)]
pub struct PlacementPlannerRecovery {
    endpoint: Endpoint,
    placement: PlanOnlyLegacyPlacement,
    initial_backoff: std::time::Duration,
    max_backoff: std::time::Duration,
}

impl PlacementPlannerRecovery {
    pub fn new(
        planner_endpoint: impl AsRef<str>,
        placement: PlanOnlyLegacyPlacement,
    ) -> Result<Self, tonic::Status> {
        let endpoint =
            Endpoint::from_shared(planner_endpoint.as_ref().to_owned()).map_err(|_| {
                tonic::Status::invalid_argument("placement planner endpoint is not a valid URI")
            })?;
        Ok(Self {
            endpoint,
            placement,
            initial_backoff: std::time::Duration::from_millis(10),
            max_backoff: std::time::Duration::from_secs(1),
        })
    }

    /// Reconnect remains bounded and retries only `Code::Unavailable`.
    pub fn with_reconnect_backoff(
        mut self,
        initial: std::time::Duration,
        maximum: std::time::Duration,
    ) -> Result<Self, tonic::Status> {
        if initial.is_zero() || maximum.is_zero() || initial > maximum {
            return Err(tonic::Status::invalid_argument(
                "placement planner reconnect backoff must be nonzero and ordered",
            ));
        }
        self.initial_backoff = initial;
        self.max_backoff = maximum;
        Ok(self)
    }

    async fn run(
        &self,
        cancel: RecoveryCancellation,
        initial_plan: Option<tokio::sync::oneshot::Sender<Result<(), tonic::Status>>>,
    ) -> Result<(), tonic::Status> {
        let mut initial_plan = initial_plan;
        let mut backoff = self.initial_backoff;
        loop {
            match self.listen_once(cancel.clone(), &mut initial_plan).await {
                Ok(()) => return Ok(()),
                Err(status) if status.code() == tonic::Code::Unavailable => {
                    tokio::select! {
                        _ = cancel.cancelled() => return Ok(()),
                        _ = tokio::time::sleep(backoff) => {}
                    }
                    backoff = backoff.saturating_mul(2).min(self.max_backoff);
                }
                Err(status) => {
                    if let Some(ready) = initial_plan.take() {
                        let _ = ready.send(Err(status.clone()));
                    }
                    return Err(status);
                }
            }
        }
    }

    async fn listen_once(
        &self,
        cancel: RecoveryCancellation,
        initial_plan: &mut Option<tokio::sync::oneshot::Sender<Result<(), tonic::Status>>>,
    ) -> Result<(), tonic::Status> {
        let connect = self.endpoint.connect();
        tokio::pin!(connect);
        let channel = tokio::select! {
            _ = cancel.cancelled() => return Ok(()),
            result = &mut connect => result.map_err(|_| tonic::Status::unavailable("placement planner was unavailable"))?,
        };
        let mut client =
            placement_proto::placement_planner_client::PlacementPlannerClient::new(channel);
        let stream = tokio::select! {
            _ = cancel.cancelled() => return Ok(()),
            result = client.listen_for_plan(placement_proto::ListenForPlanRequest {}) => result?,
        };
        let mut stream = stream.into_inner();
        loop {
            tokio::select! {
                _ = cancel.cancelled() => return Ok(()),
                next = stream.message() => match next? {
                    Some(response) => {
                        // Bad or stale responses leave the last-good snapshot
                        // intact; they are not a fatal stream lifecycle error.
                        if self.placement.install(response).is_ok()
                            && let Some(ready) = initial_plan.take()
                        {
                            let _ = ready.send(Ok(()));
                        }
                    }
                    None => return Err(tonic::Status::unavailable("placement planner stream ended")),
                },
            }
        }
    }
}

#[tonic::async_trait]
impl HostRecovery for PlacementPlannerRecovery {
    async fn start(
        &self,
        supervisor: &mut JoinSet<Result<(), tonic::Status>>,
        cancel: RecoveryCancellation,
    ) -> Result<(), tonic::Status> {
        let recovery = self.clone();
        let task_cancel = cancel.clone();
        let (ready, initial_plan) = tokio::sync::oneshot::channel();
        supervisor.spawn(async move { recovery.run(task_cancel, Some(ready)).await });
        tokio::select! {
            _ = cancel.cancelled() => Ok(()),
            result = initial_plan => match result {
                Ok(result) => result,
                Err(_) => Err(tonic::Status::internal("placement planner ended before installing an initial plan")),
            },
        }
    }
}

/// Exact durable metadata for one generated adapter's injected local actor and
/// coordinator. The application topology supplies it; recovery does not infer
/// actor identity or construct a resolver from a durable record.
#[derive(Clone, Debug)]
pub struct LegacyRecoveryMetadata {
    pub participant: ParticipantRecovery,
    pub coordinator: CoordinatorRecovery,
}

/// Recovers the local participant and coordinator already injected into one
/// generated adapter, then supervises its explicitly supplied Watch route.
///
/// This is intentionally not a registry: the existing participant, coordinator
/// (and its resolver), sidecars, and Watch endpoint remain the only authority.
pub struct LegacyDurableRecovery<P, C, R, W>
where
    P: ParticipantSidecar,
    C: CoordinatorSidecar,
    R: ParticipantResolver,
    W: CoordinatorWatchEndpoint,
{
    participant: DurableActorParticipant<P>,
    coordinator: DurableRootCoordinator<C, R>,
    metadata: LegacyRecoveryMetadata,
    watch: Arc<W>,
}

impl<P, C, R, W> LegacyDurableRecovery<P, C, R, W>
where
    P: ParticipantSidecar,
    C: CoordinatorSidecar,
    R: ParticipantResolver,
    W: CoordinatorWatchEndpoint,
{
    pub fn new(
        participant: DurableActorParticipant<P>,
        coordinator: DurableRootCoordinator<C, R>,
        metadata: LegacyRecoveryMetadata,
        watch: Arc<W>,
    ) -> Result<Self, tonic::Status> {
        if metadata.coordinator.coordinator_state_ref.is_empty() {
            return Err(tonic::Status::invalid_argument(
                "generated recovery requires the exact coordinator state reference",
            ));
        }
        Ok(Self {
            participant,
            coordinator,
            metadata,
            watch,
        })
    }
}

#[tonic::async_trait]
impl<P, C, R, W> HostRecovery for LegacyDurableRecovery<P, C, R, W>
where
    P: ParticipantSidecar,
    C: CoordinatorSidecar,
    R: ParticipantResolver,
    W: CoordinatorWatchEndpoint,
{
    async fn start(
        &self,
        _supervisor: &mut JoinSet<Result<(), tonic::Status>>,
        cancel: RecoveryCancellation,
    ) -> Result<(), tonic::Status> {
        self.participant
            .recover_ownership(self.metadata.participant.clone())
            .await?;
        // A restarted root can reach a peer's fixed control listener before
        // that peer has restored its prepared participant ownership. The
        // coordinator record remains durable, so an Unavailable terminal
        // delivery is non-definitive and must be retried from that record
        // rather than failing the host and stranding recovery.
        let mut retry_delay = std::time::Duration::from_millis(25);
        loop {
            tokio::select! {
                result = self.coordinator.recover(self.metadata.coordinator.clone()) => match result {
                    Ok(()) => break,
                    Err(status) if status.code() == tonic::Code::Unavailable => {}
                    Err(status) => return Err(status),
                },
                _ = cancel.cancelled() => return Ok(()),
            }
            tokio::select! {
                _ = cancel.cancelled() => return Ok(()),
                _ = tokio::time::sleep(retry_delay) => {}
            }
            retry_delay = (retry_delay * 2).min(std::time::Duration::from_secs(1));
        }

        // A public RPC cannot observe a recovered prepared participant before
        // its authoritative Watch has either terminalized it or confirmed that
        // there is no pending durable work. Control routes are already bound by
        // ApplicationHost before it invokes recovery, so this wait never
        // deadlocks a recovering remote coordinator.
        let mut retry_delay = std::time::Duration::from_millis(25);
        loop {
            tokio::select! {
                result = self.participant.watch_recovered(self.watch.as_ref()) => match result {
                    Ok(()) => return Ok(()),
                    Err(status) if status.code() == tonic::Code::Unavailable => {
                        // The remote coordinator may still be binding its
                        // recovery-only control listener. This is non-definitive;
                        // retain ownership and retry without inventing abort.
                    }
                    Err(status) => return Err(status),
                },
                _ = cancel.cancelled() => return Ok(()),
            }
            tokio::select! {
                _ = cancel.cancelled() => return Ok(()),
                _ = tokio::time::sleep(retry_delay) => {}
            }
            retry_delay = (retry_delay * 2).min(std::time::Duration::from_secs(1));
        }
    }
}

#[derive(Clone, Debug)]
pub struct RecoveryIngressLayer {
    context: TrustedApplicationContext,
    readiness: RecoveryReadiness,
    placement_gate: LegacyPlacementGate,
}
impl RecoveryIngressLayer {
    fn new(
        application_id: String,
        readiness: RecoveryReadiness,
        placement_gate: LegacyPlacementGate,
    ) -> Self {
        Self {
            context: TrustedApplicationContext { application_id },
            readiness,
            placement_gate,
        }
    }
}
impl<S> Layer<S> for RecoveryIngressLayer {
    type Service = RecoveryIngressService<S>;
    fn layer(&self, inner: S) -> Self::Service {
        RecoveryIngressService {
            inner,
            context: self.context.clone(),
            readiness: self.readiness.clone(),
            placement_gate: self.placement_gate.clone(),
        }
    }
}
#[derive(Clone, Debug)]
pub struct RecoveryIngressService<S> {
    inner: S,
    context: TrustedApplicationContext,
    readiness: RecoveryReadiness,
    placement_gate: LegacyPlacementGate,
}
impl<S, B> Service<HttpRequest<B>> for RecoveryIngressService<S>
where
    S: Service<HttpRequest<B>, Response = HttpResponse<BoxBody>> + Send + 'static,
    S::Future: Send + 'static,
    B: Send + 'static,
{
    type Response = HttpResponse<BoxBody>;
    type Error = S::Error;
    type Future = Pin<Box<dyn Future<Output = Result<Self::Response, Self::Error>> + Send>>;
    fn poll_ready(&mut self, cx: &mut Context<'_>) -> Poll<Result<(), Self::Error>> {
        self.inner.poll_ready(cx)
    }
    fn call(&mut self, mut request: HttpRequest<B>) -> Self::Future {
        let path = request.uri().path();
        let control = path.starts_with("/rbt.v1alpha1.Participant/")
            || path.starts_with("/rbt.v1alpha1.Coordinator/")
            || path.starts_with("/grpc.health.v1.Health/");
        request.headers_mut().remove(APPLICATION_ID_HEADER);
        request.extensions_mut().insert(self.context.clone());
        if !control
            && (self.readiness.state() != RecoveryState::Ready || !self.placement_gate.ready())
        {
            return Box::pin(async {
                Ok(tonic::Status::unavailable("application recovery in progress").into_http())
            });
        }
        Box::pin(self.inner.call(request))
    }
}

/// Legacy recovery controls and the host-owned health service bypass public
/// readiness. Every caller-added service remains public and must be represented
/// in placement completeness.
fn is_legacy_control_service(service_name: &str) -> bool {
    matches!(
        service_name,
        "rbt.v1alpha1.Participant" | "rbt.v1alpha1.Coordinator" | "grpc.health.v1.Health"
    )
}

/// A host-owned lifecycle component.
///
/// Components run in registration order. The host runs every `initialize`,
/// then every `recover`, before binding the gRPC listener. If either phase
/// fails, it runs `shutdown` for the components that were initialized and does
/// not open the listener. Once a listener has stopped, `shutdown` runs for all
/// initialized components in registration order.
///
/// This is deliberately a generic host hook, not Reboot durable recovery:
/// there is not yet an ApplicationHost connection to the actor sidecar,
/// placement, or generated adapters needed to invoke their recovery APIs.
#[tonic::async_trait]
pub trait ApplicationLifecycle: Send + Sync + 'static {
    /// Construct non-serving application resources.
    async fn initialize(&self) -> Result<(), tonic::Status>;

    /// Complete recovery required before this host accepts RPCs.
    async fn recover(&self) -> Result<(), tonic::Status>;

    /// Release resources after serving has stopped or startup has failed.
    async fn shutdown(&self) -> Result<(), tonic::Status>;
}

/// The lifecycle phase that produced an [`ApplicationHostError`].
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ApplicationLifecyclePhase {
    Initialize,
    Recover,
    Shutdown,
}

/// A failure while starting, serving, or stopping an [`ApplicationHost`].
#[derive(Debug)]
pub enum ApplicationHostError {
    Lifecycle {
        phase: ApplicationLifecyclePhase,
        component: usize,
        source: tonic::Status,
    },
    RecoveryTask(tonic::Status),
    Reflection(tonic_reflection::server::Error),
    Bind(std::io::Error),
    Transport(tonic::transport::Error),
}

impl fmt::Display for ApplicationHostError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Lifecycle {
                phase,
                component,
                source,
            } => write!(
                formatter,
                "application lifecycle component {component} failed during {phase:?}: {source}"
            ),
            Self::RecoveryTask(source) => {
                write!(formatter, "application recovery task failed: {source}")
            }
            Self::Reflection(source) => {
                write!(
                    formatter,
                    "application reflection configuration failed: {source}"
                )
            }
            Self::Bind(source) => write!(
                formatter,
                "application host could not bind listener: {source}"
            ),
            Self::Transport(source) => {
                write!(formatter, "application host transport failed: {source}")
            }
        }
    }
}

impl Error for ApplicationHostError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Lifecycle { source, .. } => Some(source),
            Self::RecoveryTask(source) => Some(source),
            Self::Reflection(source) => Some(source),
            Self::Bind(source) => Some(source),
            Self::Transport(source) => Some(source),
        }
    }
}

/// Server-owned target application identity available to registered handlers.
///
/// The constructor is deliberately private.  A handler may inspect this value
/// only after [`ApplicationHost`] has injected it at gRPC ingress.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TrustedApplicationContext {
    application_id: String,
}

impl TrustedApplicationContext {
    /// The immutable application identity selected by the host owner.
    pub fn application_id(&self) -> &str {
        &self.application_id
    }

    /// Returns the identity injected into this request by an
    /// [`ApplicationHost`].
    pub fn from_request<T>(request: &Request<T>) -> Option<&Self> {
        request.extensions().get()
    }
}

/// Mandatory ingress layer used by [`ApplicationHost`].
///
/// The layer removes a caller-supplied target application header before a
/// generated or handwritten handler can inspect it, then inserts its own
/// immutable context in request extensions.
#[derive(Clone, Debug)]
pub struct TrustedApplicationIngress {
    context: TrustedApplicationContext,
}

impl TrustedApplicationIngress {
    pub fn new(application_id: String) -> Self {
        Self {
            context: TrustedApplicationContext { application_id },
        }
    }
}

impl<S> Layer<S> for TrustedApplicationIngress {
    type Service = TrustedApplicationService<S>;

    fn layer(&self, inner: S) -> Self::Service {
        TrustedApplicationService {
            inner,
            context: self.context.clone(),
        }
    }
}

#[derive(Clone, Debug)]
pub struct TrustedApplicationService<S> {
    inner: S,
    context: TrustedApplicationContext,
}

impl<S, B> Service<HttpRequest<B>> for TrustedApplicationService<S>
where
    S: Service<HttpRequest<B>>,
{
    type Response = S::Response;
    type Error = S::Error;
    type Future = S::Future;

    fn poll_ready(&mut self, cx: &mut Context<'_>) -> Poll<Result<(), Self::Error>> {
        self.inner.poll_ready(cx)
    }

    fn call(&mut self, mut request: HttpRequest<B>) -> Self::Future {
        // This is target/server identity, never caller authority.  Mask all
        // values (including duplicates) before dispatch rather than accepting
        // a spoofed value or leaving it observable to generated handlers.
        request.headers_mut().remove(APPLICATION_ID_HEADER);
        request.extensions_mut().insert(self.context.clone());
        self.inner.call(request)
    }
}

/// First-stage generic host. It owns one immutable application ID and has no
/// service routes until [`Self::add_service`] is called.
pub struct ApplicationHost {
    application_id: String,
    router: Router<RecoveryIngressStack>,
    lifecycle: Vec<Arc<dyn ApplicationLifecycle>>,
    recovery: Vec<Arc<dyn HostRecovery>>,
    readiness: tokio::sync::watch::Sender<RecoveryState>,
    placement_gate: LegacyPlacementGate,
    placement_requirement: Option<LegacyPlacementRequirement>,
    reflection_descriptor_sets: Vec<&'static [u8]>,
}

impl ApplicationHost {
    /// Creates a host whose application identity is selected by the server
    /// owner, not from inbound metadata.
    pub fn new(application_id: impl Into<String>) -> Self {
        let application_id = application_id.into();
        assert!(
            !application_id.is_empty(),
            "application ID must not be empty"
        );
        let (readiness, state) = tokio::sync::watch::channel(RecoveryState::Ready);
        let placement_gate = LegacyPlacementGate::new();
        // Health is host-owned: it is never a generated, placement-routable
        // service and reports lifecycle readiness independently of public ingress.
        let health_service = HealthServer::new(HostHealth {
            readiness: RecoveryReadiness {
                state: state.clone(),
            },
        });
        Self {
            router: Server::builder()
                .layer(crate::successful_trailers::SuccessfulParticipantTrailerLayer)
                .layer(RecoveryIngressLayer::new(
                    application_id.clone(),
                    RecoveryReadiness { state },
                    placement_gate.clone(),
                ))
                .add_service(health_service),
            application_id,
            lifecycle: Vec::new(),
            recovery: Vec::new(),
            readiness,
            placement_gate,
            placement_requirement: None,
            reflection_descriptor_sets: Vec::new(),
        }
    }

    /// The application identity this host injects for every registered route.
    pub fn application_id(&self) -> &str {
        &self.application_id
    }

    /// Adds a component whose initialization and recovery must finish before
    /// this host listens for RPCs.
    pub fn with_lifecycle(mut self, lifecycle: impl ApplicationLifecycle) -> Self {
        self.lifecycle.push(Arc::new(lifecycle));
        self
    }

    pub fn with_host_recovery(mut self, recovery: impl HostRecovery) -> Self {
        self.recovery.push(Arc::new(recovery));
        self.readiness.send_replace(RecoveryState::Recovering);
        self
    }

    /// Serves reflection from this generated descriptor set. The descriptor
    /// remains caller-owned and is never written to placement metadata.
    pub fn with_reflection_descriptor_set(mut self, descriptor_set: &'static [u8]) -> Self {
        self.reflection_descriptor_sets.push(descriptor_set);
        self
    }

    /// Registers authoritative generated descriptor sets for host reflection.
    /// Only actually mounted public service names are advertised.
    pub fn with_reflection_descriptor_sets(
        mut self,
        descriptor_sets: impl IntoIterator<Item = &'static [u8]>,
    ) -> Self {
        self.reflection_descriptor_sets.extend(descriptor_sets);
        self
    }

    /// Requires an accepted legacy snapshot to declare every public generated
    /// Tonic service registered under this host's server-owned application ID.
    /// Hosts that do not opt in retain their recovery-only readiness behavior.
    pub fn with_legacy_placement_readiness(mut self, placement: PlanOnlyLegacyPlacement) -> Self {
        self.placement_gate.require_placement();
        self.placement_requirement = Some(LegacyPlacementRequirement {
            placement,
            application: LegacyApplicationId::new(self.application_id.clone())
                .expect("ApplicationHost rejects empty application IDs"),
        });
        self
    }

    /// Registers the first generated Tonic service and returns a serving host.
    pub fn add_service<S>(self, service: S) -> RunningApplicationHost
    where
        S: Service<http::Request<BoxBody>, Response = HttpResponse<BoxBody>, Error = Infallible>
            + NamedService
            + Clone
            + Send
            + 'static,
        S::Future: Send + 'static,
    {
        let mut public_services = BTreeSet::new();
        public_services.insert(S::NAME.to_owned());
        RunningApplicationHost {
            application_id: self.application_id,
            lifecycle: self.lifecycle,
            recovery: self.recovery,
            readiness: self.readiness,
            placement_gate: self.placement_gate,
            placement_requirement: self.placement_requirement,
            reflection_descriptor_sets: self.reflection_descriptor_sets,
            public_services,
            router: self.router.add_service(service),
        }
    }

    /// Registers a public service, which remains unavailable while recovery is running.
    pub fn add_public_service<S>(self, service: S) -> RunningApplicationHost
    where
        S: Service<http::Request<BoxBody>, Response = HttpResponse<BoxBody>, Error = Infallible>
            + NamedService
            + Clone
            + Send
            + 'static,
        S::Future: Send + 'static,
    {
        self.add_service(service)
    }

    /// Registers a fixed legacy control route reachable during recovery.
    pub fn add_legacy_control_service<S>(self, service: S) -> RunningApplicationHost
    where
        S: Service<http::Request<BoxBody>, Response = HttpResponse<BoxBody>, Error = Infallible>
            + NamedService
            + Clone
            + Send
            + 'static,
        S::Future: Send + 'static,
    {
        let mut public_services = BTreeSet::new();
        if !is_legacy_control_service(S::NAME) {
            public_services.insert(S::NAME.to_owned());
        }
        RunningApplicationHost {
            application_id: self.application_id,
            lifecycle: self.lifecycle,
            recovery: self.recovery,
            readiness: self.readiness,
            placement_gate: self.placement_gate,
            placement_requirement: self.placement_requirement,
            reflection_descriptor_sets: self.reflection_descriptor_sets,
            public_services,
            router: self.router.add_service(service),
        }
    }
}

/// A generic host with at least one registered generated Tonic service.
pub struct RunningApplicationHost {
    application_id: String,
    lifecycle: Vec<Arc<dyn ApplicationLifecycle>>,
    recovery: Vec<Arc<dyn HostRecovery>>,
    readiness: tokio::sync::watch::Sender<RecoveryState>,
    placement_gate: LegacyPlacementGate,
    placement_requirement: Option<LegacyPlacementRequirement>,
    reflection_descriptor_sets: Vec<&'static [u8]>,
    public_services: BTreeSet<String>,
    router: Router<RecoveryIngressStack>,
}

impl RunningApplicationHost {
    /// The immutable application identity used by this server.
    pub fn application_id(&self) -> &str {
        &self.application_id
    }

    /// Registers another generated Tonic service on the same trusted ingress.
    pub fn add_service<S>(mut self, service: S) -> Self
    where
        S: Service<http::Request<BoxBody>, Response = HttpResponse<BoxBody>, Error = Infallible>
            + NamedService
            + Clone
            + Send
            + 'static,
        S::Future: Send + 'static,
    {
        self.public_services.insert(S::NAME.to_owned());
        Self {
            application_id: self.application_id,
            lifecycle: self.lifecycle,
            recovery: self.recovery,
            readiness: self.readiness,
            placement_gate: self.placement_gate,
            placement_requirement: self.placement_requirement,
            reflection_descriptor_sets: self.reflection_descriptor_sets,
            public_services: self.public_services,
            router: self.router.add_service(service),
        }
    }

    pub fn add_public_service<S>(self, service: S) -> Self
    where
        S: Service<http::Request<BoxBody>, Response = HttpResponse<BoxBody>, Error = Infallible>
            + NamedService
            + Clone
            + Send
            + 'static,
        S::Future: Send + 'static,
    {
        self.add_service(service)
    }

    pub fn add_legacy_control_service<S>(mut self, service: S) -> Self
    where
        S: Service<http::Request<BoxBody>, Response = HttpResponse<BoxBody>, Error = Infallible>
            + NamedService
            + Clone
            + Send
            + 'static,
        S::Future: Send + 'static,
    {
        if !is_legacy_control_service(S::NAME) {
            self.public_services.insert(S::NAME.to_owned());
        }
        Self {
            application_id: self.application_id,
            lifecycle: self.lifecycle,
            recovery: self.recovery,
            readiness: self.readiness,
            placement_gate: self.placement_gate,
            placement_requirement: self.placement_requirement,
            reflection_descriptor_sets: self.reflection_descriptor_sets,
            public_services: self.public_services,
            router: self.router.add_service(service),
        }
    }

    /// Starts every registered service. The host consumes itself so its trusted
    /// identity and route registry cannot be changed after serving begins.
    pub async fn serve(self, address: SocketAddr) -> Result<(), ApplicationHostError> {
        self.serve_with_shutdown(address, std::future::pending())
            .await
    }

    /// Starts the lifecycle and registered services, then coordinates graceful
    /// Tonic shutdown with lifecycle cleanup.
    pub async fn serve_with_shutdown<F>(
        self,
        address: SocketAddr,
        shutdown: F,
    ) -> Result<(), ApplicationHostError>
    where
        F: Future<Output = ()> + Send + 'static,
    {
        let RunningApplicationHost {
            lifecycle,
            recovery,
            readiness,
            placement_gate,
            placement_requirement,
            reflection_descriptor_sets,
            public_services,
            router,
            ..
        } = self;
        let router = if reflection_descriptor_sets.is_empty() {
            router
        } else {
            let mut reflection = tonic_reflection::server::Builder::configure();
            for descriptor_set in reflection_descriptor_sets {
                reflection = reflection.register_encoded_file_descriptor_set(descriptor_set);
            }
            for service_name in &public_services {
                reflection = reflection.with_service_name(service_name);
            }
            // Explicit service-name mode requires the standard reflection name
            // to be added separately; its descriptor is supplied by Tonic.
            reflection = reflection.with_service_name("grpc.reflection.v1.ServerReflection");
            router.add_service(
                reflection
                    .build_v1()
                    .map_err(ApplicationHostError::Reflection)?,
            )
        };
        Self::start_lifecycle(&lifecycle).await?;
        // Bind before recovery so peers can reach the fixed Participant and
        // Coordinator control routes while public generated routes remain
        // gated by `RecoveryIngressLayer`.
        let listener = tokio::net::TcpListener::bind(address)
            .await
            .map_err(ApplicationHostError::Bind)?;
        let cancel = RecoveryCancellation::new();
        let serving_cancel = cancel.clone();
        // Poll the fixed router before recovery. Control services were part of
        // that router at construction; public routes remain gated below.
        let mut serving = tokio::spawn(async move {
            router
                .serve_with_incoming_shutdown(TcpListenerStream::new(listener), async move {
                    serving_cancel.cancelled().await
                })
                .await
        });
        tokio::task::yield_now().await;
        let mut supervisor = JoinSet::new();
        for (component, registration) in recovery.iter().enumerate() {
            if let Err(source) = registration.start(&mut supervisor, cancel.clone()).await {
                readiness.send_replace(RecoveryState::Failed);
                cancel.cancel();
                supervisor.abort_all();
                while supervisor.join_next().await.is_some() {}
                let _ = serving.await;
                Self::shutdown_lifecycle(&lifecycle).await?;
                return Err(ApplicationHostError::Lifecycle {
                    phase: ApplicationLifecyclePhase::Recover,
                    component,
                    source,
                });
            }
        }
        if let Some(requirement) = placement_requirement {
            let mut accepted_versions = requirement.placement.accepted_versions();
            let gate = placement_gate.clone();
            let cancel = cancel.clone();
            supervisor.spawn(async move {
                loop {
                    gate.set_ready(
                        requirement
                            .placement
                            .declares_services(&requirement.application, &public_services),
                    );
                    tokio::select! {
                        _ = cancel.cancelled() => return Ok(()),
                        changed = accepted_versions.changed() => {
                            changed.map_err(|_| tonic::Status::internal("legacy placement update channel closed"))?;
                        }
                    }
                }
            });
        }
        readiness.send_replace(RecoveryState::Ready);
        tokio::select! {
            _ = shutdown => cancel.cancel(),
            result = supervisor.join_next(), if !supervisor.is_empty() => {
                let source = match result {
                    Some(Ok(Err(source))) => source,
                    Some(Err(error)) => tonic::Status::internal(format!("application recovery task failed to join: {error}")),
                    Some(Ok(Ok(()))) => tonic::Status::failed_precondition("application recovery task ended unexpectedly"),
                    None => unreachable!("non-empty JoinSet returned no task"),
                };
                readiness.send_replace(RecoveryState::Failed);
                cancel.cancel();
                supervisor.abort_all();
                while supervisor.join_next().await.is_some() {}
                let _ = serving.await;
                Self::shutdown_lifecycle(&lifecycle).await?;
                return Err(ApplicationHostError::RecoveryTask(source));
            }
            result = &mut serving => {
                let result = result.expect("application serving task panicked");
                Self::shutdown_lifecycle(&lifecycle).await?;
                return result.map_err(ApplicationHostError::Transport);
            }
        }
        readiness.send_replace(RecoveryState::Failed);
        supervisor.abort_all();
        while supervisor.join_next().await.is_some() {}
        let serving = serving.await.expect("application serving task panicked");
        Self::shutdown_lifecycle(&lifecycle).await?;
        serving.map_err(ApplicationHostError::Transport)
    }

    async fn start_lifecycle(
        lifecycle: &[Arc<dyn ApplicationLifecycle>],
    ) -> Result<(), ApplicationHostError> {
        let mut initialized = 0;
        for (component, component_lifecycle) in lifecycle.iter().enumerate() {
            if let Err(source) = component_lifecycle.initialize().await {
                Self::shutdown_initialized(lifecycle, initialized).await?;
                return Err(ApplicationHostError::Lifecycle {
                    phase: ApplicationLifecyclePhase::Initialize,
                    component,
                    source,
                });
            }
            initialized += 1;
        }

        for (component, component_lifecycle) in lifecycle.iter().enumerate() {
            if let Err(source) = component_lifecycle.recover().await {
                Self::shutdown_initialized(lifecycle, initialized).await?;
                return Err(ApplicationHostError::Lifecycle {
                    phase: ApplicationLifecyclePhase::Recover,
                    component,
                    source,
                });
            }
        }
        Ok(())
    }

    async fn shutdown_lifecycle(
        lifecycle: &[Arc<dyn ApplicationLifecycle>],
    ) -> Result<(), ApplicationHostError> {
        Self::shutdown_initialized(lifecycle, lifecycle.len()).await
    }

    async fn shutdown_initialized(
        lifecycle: &[Arc<dyn ApplicationLifecycle>],
        initialized: usize,
    ) -> Result<(), ApplicationHostError> {
        for (component, component_lifecycle) in lifecycle.iter().take(initialized).enumerate() {
            component_lifecycle.shutdown().await.map_err(|source| {
                ApplicationHostError::Lifecycle {
                    phase: ApplicationLifecyclePhase::Shutdown,
                    component,
                    source,
                }
            })?;
        }
        Ok(())
    }
}
