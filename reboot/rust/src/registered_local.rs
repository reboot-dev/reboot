//! Host-owned registration identity plumbing. Registration is trusted host
//! composition, not policy admission or internal-call authority. There is no
//! ticket minting or missing-authorizer exemption here. Directory lookup is trusted
//! composition only, not dispatch authority.
use crate::auth::AuthorizationPolicy;
use crate::durable_coordinator::ParticipantTarget;
use std::collections::{BTreeMap, BTreeSet};
use std::sync::{Arc, Weak};

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum HostLocalState {
    Starting,
    Ready,
    Revoked,
}

/// Immutable generated adapter description. Only eligible descriptor-derived
/// methods belong here; the implementing host composition is trusted Rust code.
#[doc(hidden)]
#[derive(Clone)]
pub struct GeneratedLocalAdapterConfig {
    pub target: ParticipantTarget,
    pub database_endpoint: String,
    pub policy: AuthorizationPolicy,
    pub methods: BTreeSet<String>,
    pub incarnation: Arc<()>,
}

impl GeneratedLocalAdapterConfig {
    fn validate(&self) -> Result<(), tonic::Status> {
        if self.target.state_type.is_empty()
            || self.target.state_ref.is_empty()
            || self.database_endpoint.is_empty()
            || self.methods.is_empty()
            || self.methods.len() > 1024
            || self.methods.iter().any(|method| method.is_empty())
        {
            return Err(tonic::Status::invalid_argument(
                "incomplete local adapter configuration",
            ));
        }
        Ok(())
    }
    pub(crate) fn same_identity_for_ticket(&self, other: &Self) -> bool {
        self.same_identity(other)
    }
    fn same_identity(&self, other: &Self) -> bool {
        self.target == other.target
            && self.database_endpoint == other.database_endpoint
            && self.methods == other.methods
            && Arc::ptr_eq(&self.incarnation, &other.incarnation)
            && self.policy.same_entry_identity(&other.policy)
    }
}

/// Downstream-generated adapters implement this trusted composition interface.
/// Implementing it does not let callers mint registration bindings. Generated
/// configuration-changing builders must invalidate a previously stored binding.
#[doc(hidden)]
pub trait GeneratedLocalTransactionAdapter: Sized {
    fn local_configuration(&self) -> Result<GeneratedLocalAdapterConfig, tonic::Status>;
    fn bind_participant_cleanup(
        &self,
        _binding: &crate::application_host::ParticipantCleanupBinding,
    ) -> Result<(), tonic::Status> {
        Ok(())
    }
    fn with_local_registration(
        self,
        binding: RegisteredAdapterBinding,
    ) -> Result<Self, tonic::Status>;
}

/// Opaque identity minted only by the ApplicationHost's registry. A binding's
/// existence proves registration, not readiness, authorization or permission to
/// issue calls. It cannot keep a dropped host alive.
#[doc(hidden)]
#[derive(Clone)]
pub struct RegisteredAdapterBinding {
    host: Weak<()>,
    registration: Arc<()>,
    committed: Arc<std::sync::atomic::AtomicBool>,
    configuration: GeneratedLocalAdapterConfig,
    gate: tokio::sync::watch::Receiver<HostLocalState>,
    directory: Weak<std::sync::Mutex<BTreeMap<ParticipantTarget, RegisteredLocalDestination>>>,
}
/// Exact registered service snapshot. Lookup supplies composition, not a ticket,
/// authorization or readiness reservation across later execution.
#[doc(hidden)]
#[derive(Clone)]
pub struct RegisteredLocalDestination {
    binding: RegisteredAdapterBinding,
    service: crate::registered_local_service::RegisteredServiceTemplate,
}
impl RegisteredLocalDestination {
    pub fn binding(&self) -> &RegisteredAdapterBinding {
        &self.binding
    }
    pub fn configuration(&self) -> &GeneratedLocalAdapterConfig {
        &self.binding.configuration
    }
    pub fn service(&self) -> &crate::registered_local_service::RegisteredServiceTemplate {
        &self.service
    }
}

/// Short synchronous reservation against the observed local host gate.
/// Never retain this guard across an await or while dropping/revoking its host.
/// Do not reacquire any gate read on the same host (including cloned bindings):
/// reserve_host_ready, require_host_ready and polling host_revoked can deadlock
/// behind a queued watch writer while this read reservation is held.
/// Source readiness remains asynchronous.
#[doc(hidden)]
pub struct RegisteredHostReservation<'a> {
    _gate: tokio::sync::watch::Ref<'a, HostLocalState>,
    _host: Arc<()>,
}
impl RegisteredAdapterBinding {
    pub fn validate_configuration(
        &self,
        configuration: &GeneratedLocalAdapterConfig,
    ) -> Result<(), tonic::Status> {
        if self.host.upgrade().is_none()
            || !self.committed.load(std::sync::atomic::Ordering::Acquire)
            || !self.configuration.same_identity(configuration)
        {
            return Err(tonic::Status::failed_precondition(
                "local registration absent or configuration changed",
            ));
        }
        Ok(())
    }
    /// Readiness observation only, not a mutation reservation or execution ticket.
    pub fn require_host_ready(
        &self,
        configuration: &GeneratedLocalAdapterConfig,
    ) -> Result<(), tonic::Status> {
        self.validate_configuration(configuration)?;
        match *self.gate.borrow() {
            HostLocalState::Ready => Ok(()),
            HostLocalState::Starting => {
                Err(tonic::Status::unavailable("registered host not ready"))
            }
            HostLocalState::Revoked => Err(tonic::Status::cancelled(
                "registered host generation revoked",
            )),
        }
    }
    /// Reserve the observed Ready generation for a short synchronous mutation.
    /// This does not authorize a call or reserve source recovery/placement state.
    pub fn reserve_host_ready(
        &self,
        configuration: &GeneratedLocalAdapterConfig,
    ) -> Result<RegisteredHostReservation<'_>, tonic::Status> {
        self.validate_configuration(configuration)?;
        let host = self
            .host
            .upgrade()
            .ok_or_else(|| tonic::Status::failed_precondition("registered host absent"))?;
        let gate = self.gate.borrow();
        match *gate {
            HostLocalState::Ready => Ok(RegisteredHostReservation {
                _gate: gate,
                _host: host,
            }),
            HostLocalState::Starting => {
                Err(tonic::Status::unavailable("registered host not ready"))
            }
            HostLocalState::Revoked => Err(tonic::Status::cancelled(
                "registered host generation revoked",
            )),
        }
    }
    /// Wait for observed generation revocation, host destruction or gate closure.
    /// Each waiter owns its receiver; dropping it leaves the host untouched.
    pub async fn host_revoked(&self) {
        let mut gate = self.gate.clone();
        loop {
            if self.host.upgrade().is_none()
                || !self.committed.load(std::sync::atomic::Ordering::Acquire)
                || *gate.borrow_and_update() == HostLocalState::Revoked
            {
                return;
            }
            if gate.changed().await.is_err() {
                return;
            }
        }
    }
    /// Trusted same-host composition lookup only. Never call while holding a
    /// same-host reservation; no child allocation or execution authority minted.
    pub fn lookup_local_destination(
        &self,
        configuration: &GeneratedLocalAdapterConfig,
        target: &ParticipantTarget,
        method: &str,
    ) -> Result<RegisteredLocalDestination, tonic::Status> {
        self.require_host_ready(configuration)?;
        let directory = self
            .directory
            .upgrade()
            .ok_or_else(|| tonic::Status::failed_precondition("local service directory absent"))?;
        let destination = directory
            .lock()
            .expect("local service directory poisoned")
            .get(target)
            .cloned()
            .ok_or_else(|| {
                tonic::Status::failed_precondition("local destination service absent")
            })?;
        if !Weak::ptr_eq(&self.host, &destination.binding.host)
            || destination.configuration().database_endpoint != configuration.database_endpoint
            || !destination.configuration().methods.contains(method)
        {
            return Err(tonic::Status::failed_precondition(
                "local destination configuration or method differs",
            ));
        }
        destination
            .binding
            .require_host_ready(destination.configuration())?;
        Ok(destination)
    }
    pub fn same_registration(&self, other: &Self) -> bool {
        Weak::ptr_eq(&self.host, &other.host)
            && Arc::ptr_eq(&self.registration, &other.registration)
    }
}

#[derive(Clone)]
pub(crate) struct RegisteredOutboundPermission {
    pub(crate) identity: Arc<()>,
    pub(crate) binding: RegisteredAdapterBinding,
    pub(crate) configuration: GeneratedLocalAdapterConfig,
}
impl std::fmt::Debug for RegisteredOutboundPermission {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("RegisteredOutboundPermission(opaque)")
    }
}

pub(crate) struct HostLocalRegistry {
    identity: Arc<()>,
    registrations: BTreeMap<ParticipantTarget, RegisteredAdapterBinding>,
    gate: Arc<tokio::sync::watch::Sender<HostLocalState>>,
    services: Arc<std::sync::Mutex<BTreeMap<ParticipantTarget, RegisteredLocalDestination>>>,
}
impl Drop for HostLocalRegistry {
    fn drop(&mut self) {
        self.revoke();
    }
}
impl HostLocalRegistry {
    pub(crate) fn revoke(&self) {
        self.gate.send_replace(HostLocalState::Revoked);
    }
    pub(crate) fn supervise_readiness(
        &self,
        mut readiness: tokio::sync::watch::Receiver<crate::application_host::RecoveryState>,
        mut placement: tokio::sync::watch::Receiver<bool>,
        mut revocations: tokio::sync::watch::Receiver<u64>,
        cancel: crate::application_host::RecoveryCancellation,
        supervisor: &mut tokio::task::JoinSet<Result<(), tonic::Status>>,
    ) {
        let gate = self.gate.clone();
        // Capture synchronously at installation, before the task can be delayed.
        let epoch = *revocations.borrow_and_update();
        supervisor.spawn(async move {
            // No gate mutation can transition out of Revoked. Epoch tracking
            // also catches a placement loss restored between monitor polls.
            loop {
                let current_epoch = *revocations.borrow_and_update();
                let ready = *readiness.borrow_and_update() == crate::application_host::RecoveryState::Ready
                    && *placement.borrow_and_update();
                let failed = cancel.is_cancelled()
                    || *readiness.borrow() == crate::application_host::RecoveryState::Failed;
                gate.send_if_modified(|state| {
                    let next = match *state {
                        HostLocalState::Revoked => HostLocalState::Revoked,
                        _ if failed || current_epoch != epoch => HostLocalState::Revoked,
                        HostLocalState::Ready if !ready || current_epoch != epoch => HostLocalState::Revoked,
                        HostLocalState::Starting if ready => HostLocalState::Ready,
                        state => state,
                    };
                    if next == *state { false } else { *state = next; true }
                });
                if cancel.is_cancelled() { return Ok(()); }
                tokio::select! {
                    _ = cancel.cancelled() => { gate.send_replace(HostLocalState::Revoked); return Ok(()); }
                    result = readiness.changed() => if result.is_err() { gate.send_replace(HostLocalState::Revoked); cancel.cancelled().await; return Ok(()); },
                    result = placement.changed() => if result.is_err() { gate.send_replace(HostLocalState::Revoked); cancel.cancelled().await; return Ok(()); },
                    result = revocations.changed() => if result.is_err() { gate.send_replace(HostLocalState::Revoked); cancel.cancelled().await; return Ok(()); },
                }
            }
        });
    }
}

impl Default for HostLocalRegistry {
    fn default() -> Self {
        Self {
            identity: Arc::new(()),
            gate: Arc::new(tokio::sync::watch::channel(HostLocalState::Starting).0),
            registrations: BTreeMap::new(),
            services: Arc::new(std::sync::Mutex::new(BTreeMap::new())),
        }
    }
}
impl HostLocalRegistry {
    pub(crate) fn register<A: GeneratedLocalTransactionAdapter>(
        &mut self,
        adapter: A,
    ) -> Result<A, tonic::Status> {
        let config = adapter.local_configuration()?;
        config.validate()?;
        if self.registrations.contains_key(&config.target) {
            return Err(tonic::Status::already_exists(
                "local adapter target already registered",
            ));
        }
        if self.registrations.len() >= 1024 {
            return Err(tonic::Status::resource_exhausted(
                "local adapter registry capacity exceeded",
            ));
        }
        let binding = RegisteredAdapterBinding {
            host: Arc::downgrade(&self.identity),
            registration: Arc::new(()),
            configuration: config.clone(),
            committed: Arc::new(std::sync::atomic::AtomicBool::new(false)),
            gate: self.gate.subscribe(),
            directory: Arc::downgrade(&self.services),
        };
        let registered = adapter.with_local_registration(binding.clone())?;
        if !config.same_identity(&registered.local_configuration()?) {
            return Err(tonic::Status::failed_precondition(
                "adapter configuration changed during registration",
            ));
        }
        self.registrations.insert(config.target, binding.clone());
        binding
            .committed
            .store(true, std::sync::atomic::Ordering::Release);
        Ok(registered)
    }
    pub(crate) fn register_service<A>(
        &mut self,
        adapter: A,
    ) -> Result<
        (
            A,
            crate::registered_local_service::RegisteredServiceTemplate,
        ),
        tonic::Status,
    >
    where
        A: crate::registered_local_service::GeneratedLocalTransactionService,
        <A::Service as tower::Service<http::Request<tonic::body::BoxBody>>>::Future: Send + 'static,
    {
        let target = adapter.local_configuration()?.target;
        let registered = self.register(adapter)?;
        let service =
            crate::registered_local_service::RegisteredServiceTemplate::new(tower::Layer::layer(
                &crate::successful_trailers::SuccessfulParticipantTrailerLayer,
                registered.local_service(),
            ))
            .with_inbound_factory(registered.local_inbound_factory());
        let binding = self
            .registrations
            .get(&target)
            .expect("registered service binding absent")
            .clone();
        self.services
            .lock()
            .expect("local service directory poisoned")
            .insert(
                target,
                RegisteredLocalDestination {
                    binding,
                    service: service.clone(),
                },
            );
        Ok((registered, service))
    }
    pub(crate) fn service_count(&self) -> usize {
        self.services
            .lock()
            .expect("local service directory poisoned")
            .len()
    }
    pub(crate) fn len(&self) -> usize {
        self.registrations.len()
    }
}

#[cfg(test)]
pub(crate) fn ready_binding_for_guard_test(
    configuration: GeneratedLocalAdapterConfig,
) -> (HostLocalRegistry, RegisteredAdapterBinding) {
    struct TestAdapter(
        GeneratedLocalAdapterConfig,
        Option<RegisteredAdapterBinding>,
    );
    impl GeneratedLocalTransactionAdapter for TestAdapter {
        fn local_configuration(&self) -> Result<GeneratedLocalAdapterConfig, tonic::Status> {
            Ok(self.0.clone())
        }
        fn with_local_registration(
            mut self,
            binding: RegisteredAdapterBinding,
        ) -> Result<Self, tonic::Status> {
            self.1 = Some(binding);
            Ok(self)
        }
    }
    let mut registry = HostLocalRegistry::default();
    let adapter = registry.register(TestAdapter(configuration, None)).unwrap();
    registry.gate.send_replace(HostLocalState::Ready);
    (registry, adapter.1.unwrap())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[derive(Clone)]
    struct Adapter {
        config: GeneratedLocalAdapterConfig,
        binding: Option<RegisteredAdapterBinding>,
        mutate: bool,
    }
    impl GeneratedLocalTransactionAdapter for Adapter {
        fn local_configuration(&self) -> Result<GeneratedLocalAdapterConfig, tonic::Status> {
            Ok(self.config.clone())
        }
        fn with_local_registration(
            mut self,
            binding: RegisteredAdapterBinding,
        ) -> Result<Self, tonic::Status> {
            self.binding = Some(binding);
            if self.mutate {
                self.config.database_endpoint.push_str("/changed");
            }
            Ok(self)
        }
    }
    #[derive(Clone)]
    struct StagedService;
    impl tower::Service<http::Request<tonic::body::BoxBody>> for StagedService {
        type Response = http::Response<tonic::body::BoxBody>;
        type Error = std::convert::Infallible;
        type Future = std::future::Ready<Result<Self::Response, Self::Error>>;
        fn poll_ready(
            &mut self,
            _: &mut std::task::Context<'_>,
        ) -> std::task::Poll<Result<(), Self::Error>> {
            std::task::Poll::Ready(Ok(()))
        }
        fn call(&mut self, request: http::Request<tonic::body::BoxBody>) -> Self::Future {
            let mut trailers = http::HeaderMap::new();
            trailers.insert(
                "grpc-status",
                if request.uri().path() == "/success" {
                    "0"
                } else {
                    "7"
                }
                .parse()
                .unwrap(),
            );
            let body =
                http_body_util::StreamBody::new(tokio_stream::iter([Ok::<_, tonic::Status>(
                    http_body::Frame::<bytes::Bytes>::trailers(trailers),
                )]));
            let mut response = http::Response::new(tonic::body::boxed(body));
            response.extensions_mut().insert(
                crate::successful_trailers::SuccessfulParticipantMetadata::new(
                    crate::successful_trailers::ParticipantMetadata::single("example.Actor", "B")
                        .unwrap(),
                ),
            );
            std::future::ready(Ok(response))
        }
    }
    struct Starts;
    impl crate::runtime::InboundTransactionStartFactory for Starts {
        fn next_inbound_transaction(
            &self,
            _: &crate::runtime::InboundTransactionContext,
        ) -> Result<uuid::Uuid, tonic::Status> {
            Ok(uuid::Uuid::from_u128(202))
        }
    }
    impl crate::registered_local_service::GeneratedLocalTransactionService for Adapter {
        type Service = StagedService;
        fn local_service(&self) -> Self::Service {
            StagedService
        }
        fn local_inbound_factory(&self) -> Arc<dyn crate::runtime::InboundTransactionStartFactory> {
            Arc::new(Starts)
        }
    }
    #[tokio::test]
    async fn registered_template_emits_only_success_terminal_participants() {
        use http_body_util::BodyExt;
        use tower::Service;
        let mut registry = HostLocalRegistry::default();
        let (registered, template) = registry.register_service(adapter()).unwrap();
        assert!(template.inbound_factory().is_some());
        assert_eq!(registry.service_count(), 1);
        for path in ["/success", "/denied"] {
            let mut service = template.clone_service();
            std::future::poll_fn(|cx| service.poll_ready(cx))
                .await
                .unwrap();
            let response = service
                .call(
                    http::Request::builder()
                        .uri(path)
                        .body(tonic::body::empty_body())
                        .unwrap(),
                )
                .await
                .unwrap();
            assert!(
                response
                    .headers()
                    .get(crate::successful_trailers::TRANSACTION_PARTICIPANTS_HEADER)
                    .is_none()
            );
            assert!(
                response
                    .extensions()
                    .get::<crate::successful_trailers::SuccessfulParticipantMetadata>()
                    .is_none()
            );
            let collected = response.into_body().collect().await.unwrap();
            let trailers = collected.trailers().unwrap();
            let participants =
                trailers.get(crate::successful_trailers::TRANSACTION_PARTICIPANTS_HEADER);
            if path == "/success" {
                assert_eq!(
                    serde_json::from_slice::<serde_json::Value>(participants.unwrap().as_bytes())
                        .unwrap(),
                    serde_json::json!({"example.Actor": ["B"]})
                );
            } else {
                assert!(participants.is_none());
            }
        }
        drop(registry);
        assert!(
            registered
                .binding
                .as_ref()
                .unwrap()
                .validate_configuration(&registered.config)
                .is_err()
        );
        assert!(template.inbound_factory().is_some());
    }

    fn adapter() -> Adapter {
        Adapter {
            config: GeneratedLocalAdapterConfig {
                target: ParticipantTarget {
                    state_type: "example.Actor".into(),
                    state_ref: "B".into(),
                },
                database_endpoint: "http://127.0.0.1:9999".into(),
                policy: AuthorizationPolicy::default(),
                methods: BTreeSet::from(["example.ActorMethods.Apply".into()]),
                incarnation: Arc::new(()),
            },
            binding: None,
            mutate: false,
        }
    }
    #[test]
    fn local_ticket_allocates_once_burns_replay_and_strips_credentials() {
        thread_local! {
            static FACTORY_HOOK: std::cell::RefCell<Option<Box<dyn FnOnce()>>> = const { std::cell::RefCell::new(None) };
            static SERIALIZER_HOOK: std::cell::RefCell<Option<Box<dyn FnOnce()>>> = const { std::cell::RefCell::new(None) };
        }
        #[derive(Debug)]
        struct HookMessage(tonic_health::pb::HealthCheckRequest);
        impl prost::Message for HookMessage {
            fn encode_raw(&self, buf: &mut impl prost::bytes::BufMut) {
                SERIALIZER_HOOK.with(|h| {
                    if let Some(f) = h.borrow_mut().take() {
                        f();
                    }
                });
                self.0.encode_raw(buf);
            }
            fn merge_field(
                &mut self,
                tag: u32,
                wire: prost::encoding::WireType,
                buf: &mut impl prost::bytes::Buf,
                ctx: prost::encoding::DecodeContext,
            ) -> Result<(), prost::DecodeError> {
                self.0.merge_field(tag, wire, buf, ctx)
            }
            fn encoded_len(&self) -> usize {
                self.0.encoded_len()
            }
            fn clear(&mut self) {
                self.0.clear();
            }
        }
        #[derive(Clone)]
        struct CountingAdapter(Adapter, Arc<std::sync::atomic::AtomicUsize>);
        impl GeneratedLocalTransactionAdapter for CountingAdapter {
            fn local_configuration(&self) -> Result<GeneratedLocalAdapterConfig, tonic::Status> {
                self.0.local_configuration()
            }
            fn with_local_registration(
                self,
                b: RegisteredAdapterBinding,
            ) -> Result<Self, tonic::Status> {
                Ok(Self(self.0.with_local_registration(b)?, self.1))
            }
        }
        struct Count(Arc<std::sync::atomic::AtomicUsize>);
        impl crate::runtime::InboundTransactionStartFactory for Count {
            fn next_inbound_transaction(
                &self,
                _: &crate::runtime::InboundTransactionContext,
            ) -> Result<uuid::Uuid, tonic::Status> {
                self.0.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
                FACTORY_HOOK.with(|h| {
                    if let Some(f) = h.borrow_mut().take() {
                        f();
                    }
                });
                Ok(uuid::Uuid::from_u128(202))
            }
        }
        impl crate::registered_local_service::GeneratedLocalTransactionService for CountingAdapter {
            type Service = StagedService;
            fn local_service(&self) -> Self::Service {
                StagedService
            }
            fn local_inbound_factory(
                &self,
            ) -> Arc<dyn crate::runtime::InboundTransactionStartFactory> {
                Arc::new(Count(self.1.clone()))
            }
        }
        for failure in 0..28 {
            let mut registry = HostLocalRegistry::default();
            let mut a = adapter();
            a.config.target.state_ref = "A".into();
            let a = registry.register(a).unwrap();
            let count = Arc::new(std::sync::atomic::AtomicUsize::new(0));
            let (b, _) = registry
                .register_service(CountingAdapter(adapter(), count.clone()))
                .unwrap();
            registry.gate.send_replace(HostLocalState::Ready);
            let mut headers = crate::RebootHeaders::new("A");
            headers.transaction_ids = Some(vec![uuid::Uuid::from_u128(101)]);
            headers.transaction_coordinator_state_type = Some("example.Actor".into());
            headers.transaction_coordinator_state_ref = Some("A".into());
            headers.coordinator_read_only_aware = true;
            headers.bearer_token = Some("test-only-secret".into());
            headers.cookie = Some("test-cookie".into());
            headers.internal_call = true;
            let context = crate::runtime::TransactionContext::from_headers(
                headers,
                crate::runtime::TransactionMode::Exclusive,
            )
            .unwrap();
            let context = if (21..23).contains(&failure) || failure >= 26 {
                context
            } else {
                context.test_ticket_branch_collection()
            };
            let context = if failure == 25 {
                context.test_ticket_supervised()
            } else {
                context
            };
            let (mut parent, lifetime) = context.with_handler_lifetime().unwrap();
            let mut lifetime = Some(lifetime);
            parent
                .install_registered_outbound(RegisteredOutboundPermission {
                    identity: Arc::new(()),
                    binding: a.binding.clone().unwrap(),
                    configuration: a.config.clone(),
                })
                .unwrap();
            let method = "example.ActorMethods.Apply";
            let destination = a
                .binding
                .as_ref()
                .unwrap()
                .lookup_local_destination(&a.config, &b.0.config.target, method)
                .unwrap();
            let mut scope = parent
                .begin_generated_outbound_for("example.Actor", "B", method)
                .unwrap();
            let request = HookMessage(tonic_health::pb::HealthCheckRequest {
                service: "bound".into(),
            });
            if (3..9).contains(&failure) {
                let context = parent.clone();
                let extra = if failure % 3 == 2 {
                    Some(
                        parent
                            .begin_generated_outbound_for("example.Actor", "C", method)
                            .unwrap(),
                    )
                } else {
                    None
                };
                let action: Box<dyn FnOnce()> = Box::new(move || match failure % 3 {
                    0 => context.doom(tonic::Status::aborted("test callback doom")),
                    1 => {
                        context.close_for_abandonment().unwrap();
                    }
                    _ => drop(extra),
                });
                if failure < 6 {
                    FACTORY_HOOK.with(|h| *h.borrow_mut() = Some(action));
                } else {
                    SERIALIZER_HOOK.with(|h| *h.borrow_mut() = Some(action));
                }
                assert!(
                    parent
                        .issue_registered_local_ticket(&scope, &destination, method, &request)
                        .is_err()
                );
                assert!(
                    parent
                        .issue_registered_local_ticket(&scope, &destination, method, &request)
                        .is_err()
                );
                assert_eq!(count.load(std::sync::atomic::Ordering::SeqCst), 1);
                continue;
            }
            if (15..19).contains(&failure) {
                let action: Box<dyn FnOnce()> = if failure % 2 == 1 {
                    let gate = registry.gate.clone();
                    Box::new(move || {
                        gate.send_replace(HostLocalState::Revoked);
                    })
                } else {
                    let lifetime = lifetime.take();
                    Box::new(move || drop(lifetime))
                };
                if failure < 17 {
                    FACTORY_HOOK.with(|h| *h.borrow_mut() = Some(action));
                } else {
                    SERIALIZER_HOOK.with(|h| *h.borrow_mut() = Some(action));
                }
                assert!(
                    parent
                        .issue_registered_local_ticket(&scope, &destination, method, &request)
                        .is_err()
                );
                assert!(
                    parent
                        .issue_registered_local_ticket(&scope, &destination, method, &request)
                        .is_err()
                );
                assert_eq!(count.load(std::sync::atomic::Ordering::SeqCst), 1);
                continue;
            }
            let ticket = parent
                .issue_registered_local_ticket(&scope, &destination, method, &request)
                .unwrap();
            assert!(
                parent
                    .issue_registered_local_ticket(&scope, &destination, method, &request)
                    .is_err()
            );
            assert_eq!(count.load(std::sync::atomic::Ordering::SeqCst), 1);
            let mut clean = crate::RebootHeaders::new("B");
            clean.transaction_ids = Some(vec![uuid::Uuid::from_u128(101)]);
            clean.transaction_coordinator_state_type = Some("example.Actor".into());
            clean.transaction_coordinator_state_ref = Some("A".into());
            clean.coordinator_read_only_aware = true;
            if (9..15).contains(&failure) {
                let context = parent.clone();
                let extra = if failure % 3 == 2 {
                    Some(
                        parent
                            .begin_generated_outbound_for("example.Actor", "C", method)
                            .unwrap(),
                    )
                } else {
                    None
                };
                let action: Box<dyn FnOnce()> = Box::new(move || match failure % 3 {
                    0 => context.doom(tonic::Status::aborted("consume callback doom")),
                    1 => {
                        context.close_for_abandonment().unwrap();
                    }
                    _ => drop(extra),
                });
                if failure < 12 {
                    action();
                } else {
                    SERIALIZER_HOOK.with(|h| *h.borrow_mut() = Some(action));
                }
            }
            if (19..21).contains(&failure) {
                let action: Box<dyn FnOnce()> = if failure == 19 {
                    let gate = registry.gate.clone();
                    Box::new(move || {
                        gate.send_replace(HostLocalState::Revoked);
                    })
                } else {
                    let lifetime = lifetime.take();
                    Box::new(move || drop(lifetime))
                };
                SERIALIZER_HOOK.with(|h| *h.borrow_mut() = Some(action));
            }
            let _sibling = if (23..25).contains(&failure) {
                Some(
                    parent
                        .begin_generated_outbound_for("example.Actor", "C", method)
                        .unwrap(),
                )
            } else {
                None
            };
            if (23..26).contains(&failure) {
                parent.test_ticket_complete(&mut scope, failure - 23);
            }
            let clone = ticket.clone();
            let mut scope = Some(scope);
            if failure == 2 || failure == 22 {
                drop(scope.take());
            }
            let mut drop_after_consume = None;
            let mut drop_worker = None;
            if failure >= 26 {
                let scope = scope.take().unwrap();
                let (start_tx, start_rx) = std::sync::mpsc::channel();
                let (done_tx, done_rx) = std::sync::mpsc::channel();
                drop_worker = Some(std::thread::spawn(move || {
                    start_rx
                        .recv_timeout(std::time::Duration::from_secs(5))
                        .unwrap();
                    drop(scope);
                    done_tx.send(()).unwrap();
                }));
                if failure == 26 {
                    SERIALIZER_HOOK.with(|h| {
                        *h.borrow_mut() = Some(Box::new(move || {
                            start_tx.send(()).unwrap();
                            done_rx
                                .recv_timeout(std::time::Duration::from_secs(5))
                                .unwrap();
                        }))
                    });
                } else {
                    drop_after_consume = Some((start_tx, done_rx));
                }
            }
            let result = ticket.consume(
                b.0.binding.as_ref().unwrap(),
                &b.0.config,
                if failure == 1 { "wrong" } else { method },
                &clean,
                &request,
            );
            if let Some((start, done)) = drop_after_consume {
                start.send(()).unwrap();
                done.recv_timeout(std::time::Duration::from_secs(5))
                    .unwrap();
            }
            if let Some(worker) = drop_worker {
                worker.join().unwrap();
            }
            if failure != 0 && failure != 21 && failure != 27 {
                assert!(result.is_err());
            } else {
                let child = result.unwrap();
                assert_eq!(
                    child.headers().transaction_ids.as_ref().unwrap(),
                    &vec![uuid::Uuid::from_u128(101), uuid::Uuid::from_u128(202)]
                );
                assert!(child.headers().bearer_token.is_none());
                assert!(child.headers().cookie.is_none());
                assert!(!child.headers().internal_call);
                assert!(child.require_registered_outbound().is_err());
                drop(lifetime);
                assert_eq!(
                    child.with_handler_lifetime().err().unwrap().code(),
                    tonic::Code::Cancelled
                );
            }
            assert!(
                clone
                    .consume(
                        b.0.binding.as_ref().unwrap(),
                        &b.0.config,
                        method,
                        &clean,
                        &request
                    )
                    .is_err()
            );
            assert_eq!(count.load(std::sync::atomic::Ordering::SeqCst), 1);
        }
    }

    #[test]
    fn same_host_service_directory_is_exact_weak_and_fail_closed() {
        let mut registry = HostLocalRegistry::default();
        let mut source = adapter();
        source.config.target.state_ref = "A".into();
        let source = registry.register(source).unwrap();
        let (destination, template) = registry.register_service(adapter()).unwrap();
        let source_binding = source.binding.as_ref().unwrap();
        let target = destination.config.target.clone();
        let method = "example.ActorMethods.Apply";
        assert_eq!(
            source_binding
                .lookup_local_destination(&source.config, &target, method)
                .err()
                .unwrap()
                .code(),
            tonic::Code::Unavailable
        );
        registry.gate.send_replace(HostLocalState::Ready);
        let found = source_binding
            .lookup_local_destination(&source.config, &target, method)
            .unwrap();
        assert!(
            found
                .binding()
                .same_registration(destination.binding.as_ref().unwrap())
        );
        assert!(found.configuration().same_identity(&destination.config));
        assert!(Arc::ptr_eq(
            &found.service().inbound_factory().unwrap(),
            &template.inbound_factory().unwrap()
        ));
        assert!(
            source_binding
                .lookup_local_destination(&source.config, &target, "example.ActorMethods.Other")
                .is_err()
        );
        let missing = ParticipantTarget {
            state_type: "example.Actor".into(),
            state_ref: "absent".into(),
        };
        assert!(
            source_binding
                .lookup_local_destination(&source.config, &missing, method)
                .is_err()
        );
        let mut wrong = source.config.clone();
        wrong.incarnation = Arc::new(());
        assert!(
            source_binding
                .lookup_local_destination(&wrong, &target, method)
                .is_err()
        );
        let mut other_endpoint = adapter();
        other_endpoint.config.target.state_ref = "C".into();
        other_endpoint.config.database_endpoint = "http://different".into();
        let (other_endpoint, _) = registry.register_service(other_endpoint).unwrap();
        assert!(
            source_binding
                .lookup_local_destination(&source.config, &other_endpoint.config.target, method)
                .is_err()
        );
        let mut foreign_host = HostLocalRegistry::default();
        let (foreign, foreign_service) = foreign_host.register_service(adapter()).unwrap();
        foreign_host.gate.send_replace(HostLocalState::Ready);
        registry.services.lock().unwrap().insert(
            target.clone(),
            RegisteredLocalDestination {
                binding: foreign.binding.unwrap(),
                service: foreign_service,
            },
        );
        assert!(
            source_binding
                .lookup_local_destination(&source.config, &target, method)
                .is_err()
        );
        registry
            .services
            .lock()
            .unwrap()
            .insert(target.clone(), found.clone());
        registry.revoke();
        assert_eq!(
            source_binding
                .lookup_local_destination(&source.config, &target, method)
                .err()
                .unwrap()
                .code(),
            tonic::Code::Cancelled
        );
        let weak_directory = Arc::downgrade(&registry.services);
        drop(registry);
        assert!(weak_directory.upgrade().is_none());
        assert!(
            found
                .binding()
                .validate_configuration(found.configuration())
                .is_err()
        );
        assert!(
            source_binding
                .lookup_local_destination(&source.config, &target, method)
                .is_err()
        );
        assert!(found.service().inbound_factory().is_some());
    }

    #[test]
    fn observed_host_reservation_serializes_revocation_and_validates_identity() {
        let registry = HostLocalRegistry::default();
        let mut registry = registry;
        let registered = registry.register(adapter()).unwrap();
        let binding = registered.binding.as_ref().unwrap();
        assert_eq!(
            binding
                .reserve_host_ready(&registered.config)
                .err()
                .unwrap()
                .code(),
            tonic::Code::Unavailable
        );
        registry.gate.send_replace(HostLocalState::Ready);
        let mut wrong = registered.config.clone();
        wrong.incarnation = Arc::new(());
        assert_eq!(
            binding.reserve_host_ready(&wrong).err().unwrap().code(),
            tonic::Code::FailedPrecondition
        );
        let reservation = binding.reserve_host_ready(&registered.config).unwrap();
        let gate = registry.gate.clone();
        let (entered_tx, entered_rx) = std::sync::mpsc::channel();
        let (done_tx, done_rx) = std::sync::mpsc::channel();
        let writer = std::thread::spawn(move || {
            entered_tx.send(()).unwrap();
            gate.send_replace(HostLocalState::Revoked);
            done_tx.send(()).unwrap();
        });
        entered_rx.recv().unwrap();
        assert!(done_rx.try_recv().is_err());
        drop(reservation);
        done_rx
            .recv_timeout(std::time::Duration::from_secs(5))
            .unwrap();
        writer.join().unwrap();
        assert_eq!(
            binding
                .reserve_host_ready(&registered.config)
                .err()
                .unwrap()
                .code(),
            tonic::Code::Cancelled
        );
    }
    #[tokio::test]
    async fn host_revocation_waiters_wake_and_drop_without_revoking_owner() {
        let mut registry = HostLocalRegistry::default();
        let registered = registry.register(adapter()).unwrap();
        let binding = registered.binding.as_ref().unwrap();
        let mut first = Box::pin(binding.host_revoked());
        let mut second = Box::pin(binding.host_revoked());
        std::future::poll_fn(|cx| {
            assert!(std::future::Future::poll(first.as_mut(), cx).is_pending());
            std::task::Poll::Ready(())
        })
        .await;
        std::future::poll_fn(|cx| {
            assert!(std::future::Future::poll(second.as_mut(), cx).is_pending());
            std::task::Poll::Ready(())
        })
        .await;
        drop(first);
        assert_eq!(*registry.gate.borrow(), HostLocalState::Starting);
        registry.gate.send_replace(HostLocalState::Ready);
        std::future::poll_fn(|cx| {
            assert!(std::future::Future::poll(second.as_mut(), cx).is_pending());
            std::task::Poll::Ready(())
        })
        .await;
        registry.revoke();
        tokio::time::timeout(std::time::Duration::from_secs(5), second)
            .await
            .unwrap();
        binding.host_revoked().await;
        drop(registry);
        binding.host_revoked().await;
    }

    #[tokio::test]
    async fn pending_host_waiter_observes_destruction_without_prior_revocation() {
        let mut registry = HostLocalRegistry::default();
        let registered = registry.register(adapter()).unwrap();
        let binding = registered.binding.as_ref().unwrap();
        let mut waiter = Box::pin(binding.host_revoked());
        std::future::poll_fn(|cx| {
            assert!(std::future::Future::poll(waiter.as_mut(), cx).is_pending());
            std::task::Poll::Ready(())
        })
        .await;
        assert_eq!(*registry.gate.borrow(), HostLocalState::Starting);
        drop(registry);
        tokio::time::timeout(std::time::Duration::from_secs(5), waiter)
            .await
            .unwrap();
    }
    #[tokio::test]
    async fn pending_host_waiter_observes_gate_closure_with_live_host_identity() {
        let mut registry = HostLocalRegistry::default();
        let registered = registry.register(adapter()).unwrap();
        let mut binding = registered.binding.clone().unwrap();
        let (sender, receiver) = tokio::sync::watch::channel(HostLocalState::Ready);
        binding.gate = receiver;
        let mut waiter = Box::pin(binding.host_revoked());
        std::future::poll_fn(|cx| {
            assert!(std::future::Future::poll(waiter.as_mut(), cx).is_pending());
            std::task::Poll::Ready(())
        })
        .await;
        drop(sender);
        tokio::time::timeout(std::time::Duration::from_secs(5), waiter)
            .await
            .unwrap();
        assert!(binding.host.upgrade().is_some());
        assert_eq!(*binding.gate.borrow(), HostLocalState::Ready);
    }
    #[tokio::test]
    async fn uncommitted_binding_revocation_wait_returns_without_gate_change() {
        for mode in 0..8 {
            let mut registry = HostLocalRegistry::default();
            let escaped = Arc::new(std::sync::Mutex::new(None));
            assert!(
                registry
                    .register(Probe {
                        config: adapter().config,
                        escaped: escaped.clone(),
                        mode,
                        bound: false
                    })
                    .is_err()
            );
            let binding = escaped.lock().unwrap().take().unwrap();
            assert!(!binding.committed.load(std::sync::atomic::Ordering::Acquire));
            std::future::poll_fn(|cx| {
                let mut waiter = std::pin::pin!(binding.host_revoked());
                assert!(std::future::Future::poll(waiter.as_mut(), cx).is_ready());
                std::task::Poll::Ready(())
            })
            .await;
            assert!(binding.host.upgrade().is_some());
            assert_eq!(*registry.gate.borrow(), HostLocalState::Starting);
        }
    }

    #[test]
    fn binding_is_exact_weak_and_host_owned() {
        let mut registry = HostLocalRegistry::default();
        let registered = registry.register(adapter()).unwrap();
        let binding = registered.binding.as_ref().unwrap();
        binding.validate_configuration(&registered.config).unwrap();
        assert!(binding.same_registration(&binding.clone()));
        assert!(registry.register(registered.clone()).is_err());
        let mut changed = registered.config.clone();
        changed.policy = AuthorizationPolicy::default();
        assert!(binding.validate_configuration(&changed).is_err());
        let other = HostLocalRegistry::default().register(adapter()).unwrap();
        assert!(!binding.same_registration(other.binding.as_ref().unwrap()));
        drop(registry);
        assert!(binding.validate_configuration(&registered.config).is_err());
    }
    #[test]
    fn application_host_owns_registration_and_revokes_on_drop() {
        let mut host = crate::application_host::ApplicationHost::new("registration-fixture");
        let registered = host.register_transaction_adapter(adapter()).unwrap();
        assert_eq!(host.registered_transaction_adapter_count(), 1);
        registered
            .binding
            .as_ref()
            .unwrap()
            .validate_configuration(&registered.config)
            .unwrap();
        drop(host);
        assert!(
            registered
                .binding
                .as_ref()
                .unwrap()
                .validate_configuration(&registered.config)
                .is_err()
        );
    }

    fn change(config: &mut GeneratedLocalAdapterConfig, field: usize) {
        match field {
            0 => config.target.state_type.push_str("Changed"),
            1 => config.target.state_ref.push_str("Changed"),
            2 => config.database_endpoint.push_str("/changed"),
            3 => {
                config.methods.insert("example.ActorMethods.Other".into());
            }
            4 => config.policy = AuthorizationPolicy::default(),
            5 => config.incarnation = Arc::new(()),
            _ => unreachable!(),
        }
    }
    struct Probe {
        config: GeneratedLocalAdapterConfig,
        escaped: Arc<std::sync::Mutex<Option<RegisteredAdapterBinding>>>,
        mode: usize,
        bound: bool,
    }
    impl GeneratedLocalTransactionAdapter for Probe {
        fn local_configuration(&self) -> Result<GeneratedLocalAdapterConfig, tonic::Status> {
            if self.bound && self.mode == 1 {
                return Err(tonic::Status::internal("post-binding lookup failure"));
            }
            Ok(self.config.clone())
        }
        fn with_local_registration(
            mut self,
            binding: RegisteredAdapterBinding,
        ) -> Result<Self, tonic::Status> {
            assert!(binding.validate_configuration(&self.config).is_err());
            *self.escaped.lock().unwrap() = Some(binding);
            self.bound = true;
            if self.mode == 0 {
                return Err(tonic::Status::internal("callback failure"));
            }
            if self.mode >= 2 {
                change(&mut self.config, self.mode - 2);
            }
            Ok(self)
        }
    }
    #[test]
    fn escaped_provisional_bindings_never_commit_on_any_failure() {
        for mode in 0..8 {
            let original = adapter().config;
            let escaped = Arc::new(std::sync::Mutex::new(None));
            let mut registry = HostLocalRegistry::default();
            assert!(
                registry
                    .register(Probe {
                        config: original.clone(),
                        escaped: escaped.clone(),
                        mode,
                        bound: false
                    })
                    .is_err()
            );
            assert_eq!(registry.len(), 0);
            let binding = escaped.lock().unwrap().take().unwrap();
            assert!(binding.validate_configuration(&original).is_err());
            let retry = registry.register(adapter()).unwrap();
            assert_eq!(registry.len(), 1);
            retry
                .binding
                .as_ref()
                .unwrap()
                .validate_configuration(&retry.config)
                .unwrap();
            assert!(binding.validate_configuration(&original).is_err());
            assert!(!binding.same_registration(retry.binding.as_ref().unwrap()));
        }
    }
    #[test]
    fn exact_identity_matrix_rejects_each_independent_change() {
        let mut registry = HostLocalRegistry::default();
        let registered = registry.register(adapter()).unwrap();
        let clone = registered.clone();
        let binding = registered.binding.as_ref().unwrap();
        binding.validate_configuration(&clone.config).unwrap();
        assert!(binding.same_registration(clone.binding.as_ref().unwrap()));
        for field in 0..6 {
            let mut config = registered.config.clone();
            change(&mut config, field);
            assert!(binding.validate_configuration(&config).is_err());
            binding.validate_configuration(&registered.config).unwrap();
        }
    }
    #[test]
    fn external_http_conversion_revokes_grpc_registration() {
        let mut host = crate::application_host::ApplicationHost::new("registration-http-fixture");
        let registered = host.register_transaction_adapter(adapter()).unwrap();
        let _http = host.http();
        assert!(
            registered
                .binding
                .as_ref()
                .unwrap()
                .validate_configuration(&registered.config)
                .is_err()
        );
    }

    #[derive(Clone)]
    struct Route<const CONTROL: bool>;
    impl<const CONTROL: bool> tonic::server::NamedService for Route<CONTROL> {
        const NAME: &'static str = if CONTROL {
            "reboot.Participant"
        } else {
            "example.Registration"
        };
    }
    impl<const CONTROL: bool> tower::Service<http::Request<tonic::body::BoxBody>> for Route<CONTROL> {
        type Response = http::Response<tonic::body::BoxBody>;
        type Error = std::convert::Infallible;
        type Future = std::future::Ready<Result<Self::Response, Self::Error>>;
        fn poll_ready(
            &mut self,
            _: &mut std::task::Context<'_>,
        ) -> std::task::Poll<Result<(), Self::Error>> {
            std::task::Poll::Ready(Ok(()))
        }
        fn call(&mut self, _: http::Request<tonic::body::BoxBody>) -> Self::Future {
            std::future::ready(Ok(http::Response::new(tonic::body::empty_body())))
        }
    }
    #[tokio::test]
    async fn host_transfers_preserve_binding_and_dropped_serving_future_revokes() {
        let mut host =
            crate::application_host::ApplicationHost::new("registration-transfer-fixture");
        let registered = host.register_transaction_adapter(adapter()).unwrap();
        let running = host
            .add_service(Route::<false>)
            .add_legacy_control_service(Route::<true>);
        assert_eq!(running.registered_transaction_adapter_count(), 1);
        let binding = registered.binding.as_ref().unwrap();
        binding.validate_configuration(&registered.config).unwrap();
        let mut future = Box::pin(
            running.serve_with_shutdown("127.0.0.1:0".parse().unwrap(), std::future::pending()),
        );
        tokio::select! {
            biased;
            result = &mut future => panic!("server unexpectedly ended: {result:?}"),
            _ = tokio::task::yield_now() => {}
        }
        binding.validate_configuration(&registered.config).unwrap();
        drop(future);
        assert!(binding.validate_configuration(&registered.config).is_err());
    }
    #[tokio::test]
    async fn early_reflection_failure_revokes_binding() {
        let mut host =
            crate::application_host::ApplicationHost::new("registration-failure-fixture");
        let registered = host.register_transaction_adapter(adapter()).unwrap();
        let running = host
            .with_reflection_descriptor_set(b"invalid")
            .add_service(Route::<false>);
        assert!(
            running
                .serve_with_shutdown("127.0.0.1:0".parse().unwrap(), std::future::pending())
                .await
                .is_err()
        );
        assert!(
            registered
                .binding
                .as_ref()
                .unwrap()
                .validate_configuration(&registered.config)
                .is_err()
        );
    }

    struct CleanupProbe {
        entered: Arc<tokio::sync::Semaphore>,
        release: Arc<tokio::sync::Semaphore>,
        binding: RegisteredAdapterBinding,
        configuration: GeneratedLocalAdapterConfig,
        failure: usize,
        recovering: Arc<tokio::sync::Semaphore>,
    }
    #[tonic::async_trait]
    impl crate::application_host::ApplicationLifecycle for CleanupProbe {
        async fn initialize(&self) -> Result<(), tonic::Status> {
            self.binding.validate_configuration(&self.configuration)?;
            if self.failure == 2 {
                return Err(tonic::Status::internal("initialize fixture failure"));
            }
            Ok(())
        }
        async fn recover(&self) -> Result<(), tonic::Status> {
            self.binding.validate_configuration(&self.configuration)?;
            if self.failure == 4 {
                self.recovering.add_permits(1);
                std::future::pending::<()>().await;
            }
            if self.failure == 3 {
                return Err(tonic::Status::internal("recover fixture failure"));
            }
            Ok(())
        }
        async fn shutdown(&self) -> Result<(), tonic::Status> {
            self.binding.validate_configuration(&self.configuration)?;
            self.entered.add_permits(1);
            self.release.acquire().await.unwrap().forget();
            self.binding.validate_configuration(&self.configuration)?;
            Ok(())
        }
    }
    struct Started(Arc<tokio::sync::Semaphore>);
    #[tonic::async_trait]
    impl crate::application_host::HostRecovery for Started {
        async fn start(
            &self,
            _: &mut tokio::task::JoinSet<Result<(), tonic::Status>>,
            _: crate::application_host::RecoveryCancellation,
        ) -> Result<(), tonic::Status> {
            self.0.add_permits(1);
            Ok(())
        }
    }
    #[tokio::test]
    async fn registration_survives_cleanup_then_revokes_on_graceful_and_failed_exits() {
        for failure in 0..5 {
            let occupied = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
            let address = if failure == 1 {
                occupied.local_addr().unwrap()
            } else {
                "127.0.0.1:0".parse().unwrap()
            };
            let mut host =
                crate::application_host::ApplicationHost::new("registration-cleanup-fixture");
            let registered = host.register_transaction_adapter(adapter()).unwrap();
            let binding = registered.binding.as_ref().unwrap().clone();
            let entered = Arc::new(tokio::sync::Semaphore::new(0));
            let release = Arc::new(tokio::sync::Semaphore::new(0));
            let started = Arc::new(tokio::sync::Semaphore::new(0));
            let recovering = Arc::new(tokio::sync::Semaphore::new(0));
            let host = host
                .with_lifecycle(CleanupProbe {
                    entered: entered.clone(),
                    release: release.clone(),
                    binding: binding.clone(),
                    configuration: registered.config.clone(),
                    failure,
                    recovering: recovering.clone(),
                })
                .with_host_recovery(Started(started.clone()))
                .add_service(Route::<false>);
            let (stop, stopped) = tokio::sync::oneshot::channel();
            let serving = tokio::spawn(host.serve_with_shutdown(address, async {
                let _ = stopped.await;
            }));
            if failure == 4 {
                tokio::time::timeout(std::time::Duration::from_secs(5), recovering.acquire())
                    .await
                    .unwrap()
                    .unwrap()
                    .forget();
                stop.send(()).unwrap();
            } else if failure == 0 {
                tokio::time::timeout(std::time::Duration::from_secs(5), started.acquire())
                    .await
                    .unwrap()
                    .unwrap()
                    .forget();
                binding.validate_configuration(&registered.config).unwrap();
                stop.send(()).unwrap();
            }
            if failure != 2 {
                tokio::time::timeout(std::time::Duration::from_secs(5), entered.acquire())
                    .await
                    .unwrap()
                    .unwrap()
                    .forget();
                assert!(!serving.is_finished());
                binding.validate_configuration(&registered.config).unwrap();
                assert_eq!(
                    binding
                        .require_host_ready(&registered.config)
                        .unwrap_err()
                        .code(),
                    tonic::Code::Cancelled
                );
                release.add_permits(1);
            }
            let result = tokio::time::timeout(std::time::Duration::from_secs(5), serving)
                .await
                .unwrap()
                .unwrap();
            assert_eq!(result.is_ok(), failure == 0 || failure == 4);
            assert!(binding.validate_configuration(&registered.config).is_err());
        }
    }

    #[tokio::test]
    async fn host_gate_waits_for_recovery_and_placement_and_never_reactivates() {
        use crate::application_host::{RecoveryCancellation, RecoveryState};
        for placement_loss in [false, true] {
            let mut registry = HostLocalRegistry::default();
            let registered = registry.register(adapter()).unwrap();
            let binding = registered.binding.as_ref().unwrap();
            assert_eq!(
                binding
                    .require_host_ready(&registered.config)
                    .unwrap_err()
                    .code(),
                tonic::Code::Unavailable
            );
            let (readiness, recovered) = tokio::sync::watch::channel(RecoveryState::Recovering);
            let (placement, placed) = tokio::sync::watch::channel(false);
            let (epochs, revoked) = tokio::sync::watch::channel(0);
            let cancel = RecoveryCancellation::new();
            let mut supervisor = tokio::task::JoinSet::new();
            registry.supervise_readiness(
                recovered,
                placed,
                revoked,
                cancel.clone(),
                &mut supervisor,
            );
            readiness.send_replace(RecoveryState::Ready);
            tokio::task::yield_now().await;
            assert!(binding.require_host_ready(&registered.config).is_err());
            placement.send_replace(true);
            let mut gate = binding.gate.clone();
            tokio::time::timeout(
                std::time::Duration::from_secs(5),
                gate.wait_for(|state| *state == HostLocalState::Ready),
            )
            .await
            .unwrap()
            .unwrap();
            binding.require_host_ready(&registered.config).unwrap();
            if placement_loss {
                // Coalesced loss/restoration must not resurrect this generation.
                placement.send_replace(false);
                epochs.send_replace(1);
                placement.send_replace(true);
            } else {
                readiness.send_replace(RecoveryState::Failed);
            }
            tokio::time::timeout(
                std::time::Duration::from_secs(5),
                gate.wait_for(|state| *state == HostLocalState::Revoked),
            )
            .await
            .unwrap()
            .unwrap();
            readiness.send_replace(RecoveryState::Ready);
            placement.send_replace(true);
            tokio::task::yield_now().await;
            assert_eq!(
                binding
                    .require_host_ready(&registered.config)
                    .unwrap_err()
                    .code(),
                tonic::Code::Cancelled
            );
            binding.validate_configuration(&registered.config).unwrap();
            cancel.cancel();
            assert!(
                tokio::time::timeout(std::time::Duration::from_secs(5), supervisor.join_next())
                    .await
                    .unwrap()
                    .unwrap()
                    .unwrap()
                    .is_ok()
            );
            assert!(supervisor.is_empty());
        }
    }

    #[tokio::test]
    async fn epoch_loss_before_first_monitor_poll_revokes_starting_generation() {
        use crate::application_host::{RecoveryCancellation, RecoveryState};
        let mut registry = HostLocalRegistry::default();
        let registered = registry.register(adapter()).unwrap();
        let binding = registered.binding.as_ref().unwrap();
        let (readiness, recovered) = tokio::sync::watch::channel(RecoveryState::Recovering);
        let (placement, placed) = tokio::sync::watch::channel(false);
        let (epochs, revoked) = tokio::sync::watch::channel(0);
        let cancel = RecoveryCancellation::new();
        let mut supervisor = tokio::task::JoinSet::new();
        registry.supervise_readiness(recovered, placed, revoked, cancel.clone(), &mut supervisor);
        // No await: this current-thread executor cannot poll the spawned task.
        readiness.send_replace(RecoveryState::Ready);
        placement.send_replace(true);
        placement.send_replace(false);
        epochs.send_replace(1);
        placement.send_replace(true);
        let mut gate = binding.gate.clone();
        tokio::time::timeout(
            std::time::Duration::from_secs(5),
            gate.wait_for(|state| *state == HostLocalState::Revoked),
        )
        .await
        .unwrap()
        .unwrap();
        assert_eq!(
            binding
                .require_host_ready(&registered.config)
                .unwrap_err()
                .code(),
            tonic::Code::Cancelled
        );
        cancel.cancel();
        assert!(supervisor.join_next().await.unwrap().unwrap().is_ok());
        assert!(supervisor.is_empty());
    }

    #[test]
    fn failed_registration_publishes_nothing() {
        let mut registry = HostLocalRegistry::default();
        let mut bad = adapter();
        bad.mutate = true;
        assert!(registry.register(bad).is_err());
        assert_eq!(registry.len(), 0);
        let mut bad = adapter();
        bad.config.methods.clear();
        assert!(registry.register(bad).is_err());
        assert_eq!(registry.len(), 0);
        registry.register(adapter()).unwrap();
        assert_eq!(registry.len(), 1);
    }
}
