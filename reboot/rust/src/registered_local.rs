//! Host-owned registration identity plumbing. Registration is trusted host
//! composition, not policy admission or internal-call authority. There is no
//! local transport lookup, ticket minting, or missing-authorizer exemption here.
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
    pub fn same_registration(&self, other: &Self) -> bool {
        Weak::ptr_eq(&self.host, &other.host)
            && Arc::ptr_eq(&self.registration, &other.registration)
    }
}

pub(crate) struct HostLocalRegistry {
    identity: Arc<()>,
    registrations: BTreeMap<ParticipantTarget, RegisteredAdapterBinding>,
    gate: Arc<tokio::sync::watch::Sender<HostLocalState>>,
    services:
        BTreeMap<ParticipantTarget, crate::registered_local_service::RegisteredServiceTemplate>,
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
            services: BTreeMap::new(),
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
        let service = crate::registered_local_service::RegisteredServiceTemplate::new(
            registered.local_service(),
        );
        self.services.insert(target, service.clone());
        Ok((registered, service))
    }
    pub(crate) fn service_count(&self) -> usize {
        self.services.len()
    }
    pub(crate) fn len(&self) -> usize {
        self.registrations.len()
    }
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
