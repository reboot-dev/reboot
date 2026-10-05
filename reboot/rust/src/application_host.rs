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
use tonic::{
    Request,
    body::BoxBody,
    codegen::http::Response as HttpResponse,
    server::NamedService,
    transport::{Server, server::Router},
};
use tower::{
    Layer, Service,
    layer::util::{Identity, Stack},
};

type RecoveryIngressStack = Stack<RecoveryIngressLayer, Identity>;

use crate::{
    APPLICATION_ID_HEADER,
    durable_coordinator::{
        CoordinatorRecovery, CoordinatorSidecar, DurableRootCoordinator, ParticipantResolver,
    },
    durable_participant::{DurableActorParticipant, ParticipantRecovery, ParticipantSidecar},
    legacy_coordinator::CoordinatorWatchEndpoint,
    legacy_placement::{LegacyApplicationId, PlanOnlyLegacyPlacement},
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
        supervisor: &mut JoinSet<Result<(), tonic::Status>>,
        cancel: RecoveryCancellation,
    ) -> Result<(), tonic::Status> {
        self.participant
            .recover_ownership(self.metadata.participant.clone())
            .await?;
        self.coordinator
            .recover(self.metadata.coordinator.clone())
            .await?;

        let participant = self.participant.clone();
        let watch = Arc::clone(&self.watch);
        supervisor.spawn(async move {
            tokio::select! {
                result = participant.watch_recovered(watch.as_ref()) => {
                    // A recovered participant may have no durable pending
                    // record, or its Watch may immediately deliver the
                    // terminal decision. Both are successful convergence, not
                    // supervisor failure; remain owned until host shutdown.
                    result?;
                    cancel.cancelled().await;
                    Ok(())
                },
                _ = cancel.cancelled() => Ok(()),
            }
        });
        Ok(())
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
        let control = request
            .uri()
            .path()
            .starts_with("/rbt.v1alpha1.Participant/")
            || request
                .uri()
                .path()
                .starts_with("/rbt.v1alpha1.Coordinator/");
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
    server: Server<RecoveryIngressStack>,
    lifecycle: Vec<Arc<dyn ApplicationLifecycle>>,
    recovery: Vec<Arc<dyn HostRecovery>>,
    readiness: tokio::sync::watch::Sender<RecoveryState>,
    placement_gate: LegacyPlacementGate,
    placement_requirement: Option<LegacyPlacementRequirement>,
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
        Self {
            server: Server::builder().layer(RecoveryIngressLayer::new(
                application_id.clone(),
                RecoveryReadiness { state },
                placement_gate.clone(),
            )),
            application_id,
            lifecycle: Vec::new(),
            recovery: Vec::new(),
            readiness,
            placement_gate,
            placement_requirement: None,
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
    pub fn add_service<S>(mut self, service: S) -> RunningApplicationHost
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
            public_services,
            router: self.server.add_service(service),
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
    pub fn add_legacy_control_service<S>(mut self, service: S) -> RunningApplicationHost
    where
        S: Service<http::Request<BoxBody>, Response = HttpResponse<BoxBody>, Error = Infallible>
            + NamedService
            + Clone
            + Send
            + 'static,
        S::Future: Send + 'static,
    {
        RunningApplicationHost {
            application_id: self.application_id,
            lifecycle: self.lifecycle,
            recovery: self.recovery,
            readiness: self.readiness,
            placement_gate: self.placement_gate,
            placement_requirement: self.placement_requirement,
            public_services: BTreeSet::new(),
            router: self.server.add_service(service),
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

    pub fn add_legacy_control_service<S>(self, service: S) -> Self
    where
        S: Service<http::Request<BoxBody>, Response = HttpResponse<BoxBody>, Error = Infallible>
            + NamedService
            + Clone
            + Send
            + 'static,
        S::Future: Send + 'static,
    {
        Self {
            application_id: self.application_id,
            lifecycle: self.lifecycle,
            recovery: self.recovery,
            readiness: self.readiness,
            placement_gate: self.placement_gate,
            placement_requirement: self.placement_requirement,
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
            public_services,
            router,
            ..
        } = self;
        Self::start_lifecycle(&lifecycle).await?;
        let cancel = RecoveryCancellation::new();
        let serving_cancel = cancel.clone();
        // Poll the fixed router before recovery. Control services were part of
        // that router at construction; public routes remain gated below.
        let mut serving = tokio::spawn(async move {
            router
                .serve_with_shutdown(address, async move { serving_cancel.cancelled().await })
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
