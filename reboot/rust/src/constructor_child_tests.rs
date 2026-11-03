// Included inside durable_participant::tests; source-only causal lifecycle tests.
// Private admission fixtures are NOT generated ticket/native Bank acceptance.
mod constructor_child {
    use super::*;

    #[derive(Default)]
    struct Boundary {
        inner: MockSidecar,
        endpoint: Option<String>,
        load_response: Mutex<Option<database::LoadResponse>>,
        prepare_park: Mutex<Option<(tokio::sync::oneshot::Sender<()>, tokio::sync::oneshot::Receiver<()>)>>,
    }
    impl ParticipantSidecar for Boundary {
        fn database_endpoint(&self) -> Option<&str> { self.endpoint.as_deref() }
        fn load(&self, request: database::LoadRequest) -> SidecarFuture<'_, database::LoadResponse> {
            if let Some(response) = self.load_response.lock().unwrap().take() {
                self.inner.calls.lock().unwrap().push(Call::Load(request));
                Box::pin(async move { Ok(response) })
            } else {
                self.inner.load(request)
            }
        }
        fn prepare(&self, request: database::TransactionParticipantPrepareRequest) -> SidecarFuture<'_, database::TransactionParticipantPrepareResponse> {
            let park = self.prepare_park.lock().unwrap().take();
            Box::pin(async move {
                if let Some((entered, release)) = park {
                    self.inner.calls.lock().unwrap().push(Call::Prepare(Box::new(request)));
                    entered.send(()).unwrap();
                    let _ = release.await;
                    Ok(database::TransactionParticipantPrepareResponse::default())
                } else {
                    self.inner.prepare(request).await
                }
            })
        }
        fn commit(&self, request: database::TransactionParticipantCommitRequest) -> SidecarFuture<'_, database::TransactionParticipantCommitResponse> {
            self.inner.commit(request)
        }
        fn abort(&self, request: database::TransactionParticipantAbortRequest) -> SidecarFuture<'_, database::TransactionParticipantAbortResponse> {
            self.inner.abort(request)
        }
        fn recover(&self, request: database::RecoverRequest) -> SidecarFuture<'_, Vec<database::RecoverResponse>> {
            self.inner.recover(request)
        }
        fn recover_idempotent_mutations(&self, request: database::RecoverIdempotentMutationsRequest) -> SidecarFuture<'_, Vec<database::RecoverIdempotentMutationsResponse>> {
            self.inner.recover_idempotent_mutations(request)
        }
    }
    fn fixture() -> (Arc<Boundary>, DurableActorParticipant<Boundary>, crate::runtime::TransactionContext) {
        let sidecar = Arc::new(Boundary::default());
        let participant = DurableActorParticipant::new(sidecar.clone(), "example.Actor", "actor/1");
        let context = rollback_context(Uuid::new_v4(), Uuid::new_v4());
        (sidecar, participant, context)
    }
    fn state(bytes: Vec<u8>) -> PendingActorEffects {
        PendingActorEffects { state: Some(bytes), ..Default::default() }
    }
    async fn gated(participant: &DurableActorParticipant<Boundary>) {
        assert!(tokio::time::timeout(std::time::Duration::from_millis(10), participant.lock.shared()).await.is_err(), "actual exclusive actor lease must remain held");
    }

    #[tokio::test]
    async fn absent_default_bytes_are_writable_and_follow_root_prepare_commit() {
        let (sidecar, participant, context) = fixture();
        let root = context.transaction_root_id();
        let mut local = participant.start_constructor_child(&context).await.unwrap();
        assert!(local.state().is_none(), "empty native Load, not manufactured bytes");
        let execution = local.reserve_live_execution(&context).await.unwrap();
        local.stage(state(vec![])).await.unwrap();
        local.end_execution().await.unwrap(); // nested handler response is not commit
        gated(&participant).await;
        assert!(matches!(sidecar.inner.calls.lock().unwrap().as_slice(), [Call::Load(_)]));
        let pending = participant.pending.lock_root(root).await;
        let current = pending.as_ref().unwrap();
        assert!(current.constructor_child && !current.factory);
        assert_eq!(current.disposition, PendingDisposition::Commit);
        assert!(!current.lock.is_shared());
        drop(pending);
        assert!(participant.prepare(root, true, true).await.is_err());
        participant.prepare(root, true, false).await.unwrap();
        participant.prepare(root, true, false).await.unwrap(); // ACKed replay is local
        gated(&participant).await;
        {
            let calls = sidecar.inner.calls.lock().unwrap();
            let Call::Prepare(request) = &calls[1] else { panic!("missing genuine Prepare call") };
            assert_eq!(request.state, Some(vec![]));
            assert!(request.task_upserts.is_empty());
            let transaction = request.transaction.as_ref().unwrap();
            assert_eq!(transaction.transaction_ids, context.transaction_ids().iter().map(|id| id.as_bytes().to_vec()).collect::<Vec<_>>());
            assert_eq!(transaction.coordinator_state_type, "example.Coordinator");
            assert_eq!(transaction.coordinator_state_ref, "coordinator/1");
        }
        assert!(participant.terminal_live(root, execution.owner, true).await.unwrap());
        assert!(participant.pending.lock_root(root).await.is_none());
        assert!(matches!(sidecar.inner.calls.lock().unwrap().as_slice(), [Call::Load(_), Call::Prepare(_), Call::Commit(_)]));
        assert!(tokio::time::timeout(std::time::Duration::from_millis(100), participant.lock.shared()).await.is_ok());
    }

    #[tokio::test]
    async fn root_abort_before_prepare_discards_only_exact_local_constructor() {
        let (sidecar, participant, context) = fixture();
        let mut local = participant.start_constructor_child(&context).await.unwrap();
        let execution = local.reserve_live_execution(&context).await.unwrap();
        local.stage(state(vec![1])).await.unwrap();
        local.end_execution().await.unwrap();
        let root = context.transaction_root_id();
        assert!(!participant.terminal_live(Uuid::new_v4(), execution.owner, false).await.unwrap());
        assert!(!participant.terminal_live(root, Uuid::new_v4(), false).await.unwrap());
        gated(&participant).await;
        assert!(participant.terminal_live(root, execution.owner, false).await.unwrap());
        assert!(participant.pending.lock_root(root).await.is_none());
        assert!(matches!(sidecar.inner.calls.lock().unwrap().as_slice(), [Call::Load(_)]), "no native actor-only Abort on absent undurable actor");
    }

    #[tokio::test]
    async fn prepare_ack_loss_retains_lease_and_unprepared_commit_never_synthesizes_abort() {
        let (sidecar, participant, context) = fixture();
        sidecar.inner.prepare_results.lock().unwrap().push_back(Err(Status::unavailable("lost Prepare ACK")));
        let mut local = participant.start_constructor_child(&context).await.unwrap();
        local.reserve_live_execution(&context).await.unwrap();
        local.stage(state(vec![])).await.unwrap();
        local.end_execution().await.unwrap();
        let root = context.transaction_root_id();
        assert!(participant.prepare(root, true, false).await.is_err());
        assert!(participant.terminal(root, true).await.is_err());
        drop(local);
        tokio::task::yield_now().await;
        let pending = participant.pending.lock_root(root).await;
        let current = pending.as_ref().unwrap();
        assert!(current.native_control_started && !current.prepared);
        assert_eq!(current.effects.state, Some(vec![]));
        drop(pending);
        gated(&participant).await;
        assert!(matches!(sidecar.inner.calls.lock().unwrap().as_slice(), [Call::Load(_), Call::Prepare(_)]));
    }

    #[tokio::test]
    async fn lost_prepare_ack_retries_exact_native_request_without_unprepared_terminal() {
        let (sidecar, participant, context) = fixture();
        sidecar.inner.prepare_results.lock().unwrap().push_back(Err(Status::unavailable("lost Prepare ACK")));
        let mut local = participant.start_constructor_child(&context).await.unwrap();
        let execution = local.reserve_live_execution(&context).await.unwrap();
        local.stage(state(vec![])).await.unwrap();
        local.end_execution().await.unwrap();
        let root = context.transaction_root_id();
        assert!(participant.prepare(root, true, false).await.is_err());
        gated(&participant).await;
        assert!(participant.terminal_live(root, execution.owner, true).await.is_err());
        participant.prepare(root, true, false).await.unwrap();
        participant.prepare(root, true, false).await.unwrap();
        {
            let calls = sidecar.inner.calls.lock().unwrap();
            let [Call::Load(_), Call::Prepare(first), Call::Prepare(second)] = calls.as_slice() else { panic!("expected only two real Prepare attempts") };
            assert_eq!(first, second);
        }
        assert!(participant.terminal_live(root, execution.owner, true).await.unwrap());
        assert!(participant.pending.lock_root(root).await.is_none());
        // This is request/retry plumbing against a fake ACK boundary, NOT proof
        // that native duplicate Prepare after ACK loss has been exercised.
    }

    #[tokio::test]
    async fn prepared_constructor_lost_commit_ack_never_clears_prepared_or_retries_abort() {
        let (sidecar, participant, context) = fixture();
        sidecar.inner.terminal_results.lock().unwrap().push_back(Err(Status::unavailable("lost Commit ACK")));
        let mut local = participant.start_constructor_child(&context).await.unwrap();
        let execution = local.reserve_live_execution(&context).await.unwrap();
        local.stage(state(vec![])).await.unwrap();
        local.end_execution().await.unwrap();
        let root = context.transaction_root_id();
        participant.prepare(root, true, false).await.unwrap();
        assert!(participant.terminal_live(root, execution.owner, true).await.is_err());
        assert!(participant.terminal_live(root, execution.owner, false).await.is_err());
        assert!(participant.prepare(root, true, false).await.is_err());
        drop(local);
        tokio::task::yield_now().await;
        let pending = participant.pending.lock_root(root).await;
        let current = pending.as_ref().unwrap();
        assert!(current.prepared && current.terminal_attempted && current.has_native_ownership());
        assert_eq!(current.effects.state, Some(vec![]));
        drop(pending);
        gated(&participant).await;
        assert!(matches!(sidecar.inner.calls.lock().unwrap().as_slice(), [Call::Load(_), Call::Prepare(_), Call::Commit(_)]));
    }

    #[tokio::test]
    async fn cancelling_actual_prepare_future_retains_original_actor_ownership() {
        let (sidecar, participant, context) = fixture();
        let (entered, observed) = tokio::sync::oneshot::channel();
        let (release, held) = tokio::sync::oneshot::channel();
        *sidecar.prepare_park.lock().unwrap() = Some((entered, held));
        let mut local = participant.start_constructor_child(&context).await.unwrap();
        local.reserve_live_execution(&context).await.unwrap();
        local.stage(state(vec![4])).await.unwrap();
        local.end_execution().await.unwrap();
        let root = context.transaction_root_id();
        let mut prepare = Box::pin(participant.prepare(root, true, false));
        tokio::select! { result = &mut prepare => panic!("Prepare completed before release: {result:?}"), result = observed => result.unwrap(), }
        drop(prepare); // actual sidecar future was entered, then cancelled
        drop(release);
        drop(local);
        tokio::task::yield_now().await;
        let pending = participant.pending.lock_root(root).await;
        let current = pending.as_ref().unwrap();
        assert!(current.native_control_started && !current.prepared);
        assert_eq!(current.effects.state, Some(vec![4]));
        drop(pending);
        gated(&participant).await;
        assert!(matches!(sidecar.inner.calls.lock().unwrap().as_slice(), [Call::Load(_), Call::Prepare(_)]));
    }

    #[tokio::test]
    async fn taskless_constructor_cannot_stage_ownerless_tasks_receipts_or_unset_state() {
        let (sidecar, participant, context) = fixture();
        let mut local = participant.start_constructor_child(&context).await.unwrap();
        local.reserve_live_execution(&context).await.unwrap();
        assert!(local.stage(PendingActorEffects::default()).await.is_err());
        assert!(participant.stage(context.transaction_root_id(), state(vec![])).await.is_err());
        let effects = PendingActorEffects { state: Some(vec![]), task_upserts: vec![database::Task::default()], ..Default::default() };
        assert!(local.stage_mock_validated(effects).await.is_err(), "ordinary validated receipt is not dynamic writer-owner admission");
        assert!(local.stage(PendingActorEffects { state: Some(vec![]), idempotent_mutations: vec![database::IdempotentMutation::default()], ..Default::default() }).await.is_err());
        assert!(!participant.pending.lock_root(context.transaction_root_id()).await.as_ref().unwrap().staged);
        local.stage(state(vec![])).await.unwrap();
        local.end_execution().await.unwrap();
        participant.terminal(context.transaction_root_id(), false).await.unwrap();
        assert!(matches!(sidecar.inner.calls.lock().unwrap().as_slice(), [Call::Load(_)]));
    }

    #[tokio::test]
    async fn malformed_load_is_not_absence_or_construction_authority() {
        let exact = database::Actor { state_type: "example.Actor".into(), state_ref: "actor/1".into(), state: Some(vec![]) };
        let malformed = [
            database::LoadResponse { actors: vec![database::Actor { state: None, ..exact.clone() }], ..Default::default() },
            database::LoadResponse { actors: vec![database::Actor { state_ref: "foreign".into(), ..exact.clone() }], ..Default::default() },
            database::LoadResponse { actors: vec![exact.clone(), exact.clone()], ..Default::default() },
            database::LoadResponse { tasks: vec![database::Task::default()], ..Default::default() },
        ];
        for response in malformed {
            let (sidecar, participant, context) = fixture();
            *sidecar.load_response.lock().unwrap() = Some(response);
            let error = participant.start_constructor_child(&context).await.err().unwrap();
            assert_eq!(error.code(), tonic::Code::DataLoss);
            assert!(participant.pending.lock_root(context.transaction_root_id()).await.is_none());
            assert!(matches!(sidecar.inner.calls.lock().unwrap().as_slice(), [Call::Load(_)]));
            assert!(tokio::time::timeout(std::time::Duration::from_millis(100), participant.lock.exclusive()).await.is_ok());
        }
        // Existing default bytes are retained for policy before existence refusal;
        // even the private pre-policy boundary cannot stage over them.
        let (sidecar, participant, context) = fixture();
        *sidecar.load_response.lock().unwrap() = Some(database::LoadResponse { actors: vec![exact], ..Default::default() });
        let local = participant.start_constructor_child(&context).await.unwrap();
        assert_eq!(local.state(), Some([].as_slice()));
        assert!(local.stage(state(vec![])).await.is_err());
        assert!(matches!(sidecar.inner.calls.lock().unwrap().as_slice(), [Call::Load(_)]));
    }


    #[derive(Clone)]
    struct RegisteredFixture {
        config: crate::registered_local::GeneratedLocalAdapterConfig,
        binding: Option<crate::registered_local::RegisteredAdapterBinding>,
    }
    impl crate::registered_local::GeneratedLocalTransactionAdapter for RegisteredFixture {
        fn local_configuration(&self) -> Result<crate::registered_local::GeneratedLocalAdapterConfig, Status> { Ok(self.config.clone()) }
        fn with_local_registration(mut self, binding: crate::registered_local::RegisteredAdapterBinding) -> Result<Self, Status> { self.binding = Some(binding); Ok(self) }
    }
    #[derive(Clone)]
    struct NeverCalledService;
    impl tower::Service<http::Request<tonic::body::BoxBody>> for NeverCalledService {
        type Response = http::Response<tonic::body::BoxBody>;
        type Error = std::convert::Infallible;
        type Future = std::future::Ready<Result<Self::Response, Self::Error>>;
        fn poll_ready(&mut self, _: &mut std::task::Context<'_>) -> std::task::Poll<Result<(), Self::Error>> { std::task::Poll::Ready(Ok(())) }
        fn call(&mut self, _: http::Request<tonic::body::BoxBody>) -> Self::Future { panic!("composition test must not fabricate transport") }
    }
    struct Starts;
    impl crate::runtime::InboundTransactionStartFactory for Starts {
        fn next_inbound_transaction(&self, _: &crate::runtime::InboundTransactionContext) -> Result<Uuid, Status> { Ok(Uuid::new_v4()) }
    }
    impl crate::registered_local_service::GeneratedLocalTransactionService for RegisteredFixture {
        type Service = NeverCalledService;
        fn local_service(&self) -> Self::Service { NeverCalledService }
        fn local_inbound_factory(&self) -> Arc<dyn crate::runtime::InboundTransactionStartFactory> { Arc::new(Starts) }
    }
    struct PendingWatch;
    impl CoordinatorWatchEndpoint for PendingWatch {
        fn watch(&self, _: database::WatchRequest) -> crate::legacy_coordinator::CoordinatorWatchFuture<'_, database::WatchResponse> {
            Box::pin(std::future::pending())
        }
    }
    struct Policy {
        deny: bool,
        seen: Mutex<Vec<Option<Vec<u8>>>>,
        park: Mutex<Option<(tokio::sync::oneshot::Sender<()>, tokio::sync::oneshot::Receiver<()>)>>,
    }
    impl crate::auth::Authorizer for Policy {
        fn authorize<'a>(&'a self, _: &'a crate::auth::AuthorizationContext, _: Option<&'a crate::auth::Auth>, state: Option<&'a [u8]>, _: &'a [u8]) -> crate::auth::AuthorizeFuture<'a> {
            self.seen.lock().unwrap().push(state.map(<[u8]>::to_vec));
            let park = self.park.lock().unwrap().take();
            Box::pin(async move {
                if let Some((entered, release)) = park {
                    entered.send(()).unwrap();
                    let _ = release.await;
                }
                if self.deny { crate::auth::AuthorizationDecision::PermissionDenied { message: "denied".into() } }
                else { crate::auth::AuthorizationDecision::Allow }
            })
        }
    }

    // Uses the actual registry + issuer/consumer + policy receipt + running Watch
    // owner. Parent permission is trusted test composition (as in ticket tests),
    // not generated ApplicationHost/native parent ownership acceptance.
    #[tokio::test]
    async fn registered_seam_policy_ticket_membership_and_sealed_binding_negatives() {
        use crate::application_host::HostRecovery;
        use crate::durable_coordinator::{CoordinatorSidecar, DurableRootCoordinator, ParticipantResolver, ParticipantTarget};
        // These coordinator/resolver paths must never run for a nested guard.
        // The existing helpers in durable_participant tests are function-local.
        struct UnusedCoordinator;
        impl CoordinatorSidecar for UnusedCoordinator {
            fn coordinator_prepare(&self, _: database::TransactionCoordinatorPrepareRequest) -> SidecarFuture<'_, database::TransactionCoordinatorPrepareResponse> { panic!("constructor child must not coordinate root") }
            fn coordinator_prepared(&self, _: database::TransactionCoordinatorPreparedRequest) -> SidecarFuture<'_, database::TransactionCoordinatorPreparedResponse> { panic!("constructor child must not coordinate root") }
            fn coordinator_cleanup(&self, _: database::TransactionCoordinatorCleanupRequest) -> SidecarFuture<'_, database::TransactionCoordinatorCleanupResponse> { panic!("constructor child must not coordinate root") }
            fn recover(&self, _: database::RecoverRequest) -> SidecarFuture<'_, Vec<database::RecoverResponse>> { panic!("constructor child must not recover root") }
        }
        struct UnusedResolver;
        impl ParticipantResolver for UnusedResolver {
            type Endpoint = InProcessParticipantEndpoint<Boundary>;
            fn resolve(&self, _: &ParticipantTarget) -> SidecarFuture<'_, Arc<Self::Endpoint>> { panic!("constructor child must not resolve root peers") }
        }
        for case in ["deny_absent", "deny_existing", "allow_existing", "cancel_load", "cancel_authorize", "revoked_during_authorization", "binding_none", "revoked", "revoked_during_validation", "wrong_registration", "missing_entry", "valid"] {
            let sidecar = Arc::new(Boundary { endpoint: Some(format!("http://constructor-{}.invalid/", Uuid::new_v4())), ..Default::default() });
            let participant = DurableActorParticipant::new(sidecar.clone(), "example.Actor", "actor/1");
            if case.ends_with("existing") { *sidecar.inner.load_state.lock().unwrap() = Some(vec![]); }
            let policy = Arc::new(Policy { deny: case.starts_with("deny"), seen: Mutex::new(vec![]), park: Mutex::new(None) });
            let mut observed = None;
            let mut release = None;
            if case == "cancel_load" || case == "cancel_authorize" || case == "revoked_during_authorization" {
                let (entered, receiver) = tokio::sync::oneshot::channel();
                let (sender, held) = tokio::sync::oneshot::channel();
                observed = Some(receiver);
                release = Some(sender);
                if case == "cancel_load" { *sidecar.inner.load_park.lock().unwrap() = Some((entered, held)); }
                else { *policy.park.lock().unwrap() = Some((entered, held)); }
            }
            let parent_config = crate::registered_local::GeneratedLocalAdapterConfig {
                target: crate::durable_coordinator::ParticipantTarget { state_type: "example.Coordinator".into(), state_ref: "coordinator/1".into() },
                database_endpoint: sidecar.endpoint.clone().unwrap(),
                policy: crate::auth::AuthorizationPolicy::permissive_for_development(),
                methods: ["example.CoordinatorMethods.Write".into()].into(),
                incarnation: Arc::new(()),
            };
            let (mut registry, parent_binding) = crate::registered_local::ready_binding_for_guard_test(parent_config.clone());
            let method = "example.ActorMethods.Open";
            let child_config = crate::registered_local::GeneratedLocalAdapterConfig {
                target: participant.actor_target(), database_endpoint: sidecar.endpoint.clone().unwrap(),
                policy: crate::auth::AuthorizationPolicy::new(None, Some(policy.clone())), methods: [method.into()].into(), incarnation: Arc::new(()),
            };
            let (child, _) = registry.register_service(RegisteredFixture { config: child_config.clone(), binding: None }).unwrap();
            let child_binding = child.binding.unwrap();
            let root = Uuid::new_v4();
            let mut parent_headers = crate::RebootHeaders::new("coordinator/1");
            parent_headers.transaction_ids = Some(vec![root]);
            parent_headers.transaction_coordinator_state_type = Some("example.Coordinator".into());
            parent_headers.transaction_coordinator_state_ref = Some("coordinator/1".into());
            parent_headers.coordinator_read_only_aware = true;
            let context = crate::runtime::TransactionContext::from_headers(parent_headers, TransactionMode::Exclusive).unwrap().test_ticket_branch_collection();
            let (mut parent, lifetime) = context.with_handler_lifetime().unwrap();
            parent.install_registered_outbound(crate::registered_local::RegisteredOutboundPermission { identity: Arc::new(()), binding: parent_binding.clone(), configuration: parent_config.clone() }).unwrap();
            let scope = parent.begin_generated_outbound_for("example.Actor", "actor/1", method).unwrap();
            let destination = parent.lookup_registered_local_destination(&child_config.target, method).unwrap();
            let request = tonic_health::pb::HealthCheckRequest { service: "constructor".into() };
            let ticket = parent.issue_registered_local_ticket(&scope, &destination, method, &request).unwrap();
            let mut headers = parent.headers().clone();
            headers.state_ref = "actor/1".into();
            let owner = crate::live_participant::LiveParticipantOwner::new(1, parent_config.target.clone(), Arc::new(PendingWatch)).unwrap();
            let cancel = crate::application_host::RecoveryCancellation::new();
            let mut supervisor = tokio::task::JoinSet::new();
            owner.recovery_registration().start(&mut supervisor, cancel.clone()).await.unwrap();
            let coordinator = DurableRootCoordinator::new(Arc::new(UnusedCoordinator), Arc::new(UnusedResolver));
            let mut admission = Box::pin(crate::explicit_abort::RootHandlerGuard::registered_constructor_child(&participant, &ticket, &child_binding, &child_config, method, &headers, &request, coordinator.clone(), &owner));
            if let Some(observed) = observed {
                tokio::select! {
                    _ = &mut admission => panic!("admission completed before actual parked boundary"),
                    result = observed => result.unwrap(),
                }
                if case.starts_with("cancel_") {
                    drop(admission);
                    drop(release.take());
                    // Cancellation before native effects relinquishes only the
                    // real local admission; no synthetic participant Abort.
                    assert!(tokio::time::timeout(std::time::Duration::from_millis(100), participant.lock.shared()).await.is_ok());
                    assert!(owner.reserve(&parent).is_ok(), "pre-admission Watch reservation must retire");
                    assert_eq!(policy.seen.lock().unwrap().len(), usize::from(case == "cancel_authorize"));
                    assert!(matches!(sidecar.inner.calls.lock().unwrap().as_slice(), [Call::Load(_)]));
                    drop(scope);
                    drop(lifetime);
                    cancel.cancel();
                    while let Some(joined) = supervisor.join_next().await { joined.unwrap().unwrap(); }
                    continue;
                }
                registry.revoke();
                release.take().unwrap().send(()).unwrap();
            }
            let result = admission.await;
            if case.starts_with("deny") || case == "allow_existing" || case == "revoked_during_authorization" {
                let error = result.err().unwrap();
                assert_eq!(error.code(), if case.starts_with("deny") { tonic::Code::PermissionDenied } else if case == "revoked_during_authorization" { tonic::Code::Cancelled } else { tonic::Code::AlreadyExists });
                assert_eq!(policy.seen.lock().unwrap().as_slice(), &[if case.ends_with("existing") { Some(vec![]) } else { None }]);
                assert!(matches!(sidecar.inner.calls.lock().unwrap().as_slice(), [Call::Load(_)]));
            } else {
                let (guard, context, entry) = result.unwrap();
                // Consumed ticket replay cannot reverify policy or Load again.
                assert!(crate::explicit_abort::RootHandlerGuard::registered_constructor_child(&participant, &ticket, &child_binding, &child_config, method, &headers, &request, coordinator, &owner).await.is_err());
                assert_eq!(policy.seen.lock().unwrap().len(), 1);
                let request_bytes = request.encode_to_vec();
                assert!(guard.inbound_participant_metadata(participant.actor_target(), true).is_err());
                if case == "binding_none" {
                    assert!(guard.run_authorized_handler(&child_config.policy, Some(entry), &context, method, &request_bytes, |_| async { panic!("missing binding entered handler") }).await.is_err());
                } else {
                    if case == "revoked" { registry.revoke(); }
                    let registration = if case == "wrong_registration" { Some((parent_binding.clone(), parent_config.clone())) } else { Some((child_binding.clone(), child_config.clone())) };
                    let entry = if case == "missing_entry" { None } else { Some(entry) };
                    let entered = Arc::new(std::sync::atomic::AtomicBool::new(false));
                    let mark = entered.clone();
                    let mut held = if case == "revoked_during_validation" { Some(participant.pending.lock_root(root).await) } else { None };
                    let mut run = Box::pin(guard.run_registered_authorized_handler(&child_config.policy, entry, &context, (method, &request_bytes), registration, |_| async move { mark.store(true, std::sync::atomic::Ordering::Release); }));
                    if held.is_some() {
                        assert!(std::future::poll_fn(|cx| std::task::Poll::Ready(run.as_mut().poll(cx))).await.is_pending(), "real execution validation must wait on exact participant slot");
                        registry.revoke();
                        drop(held.take());
                    }
                    let result = run.await;
                    assert_eq!(result.is_ok(), case == "valid");
                    assert_eq!(entered.load(std::sync::atomic::Ordering::Acquire), case == "valid");
                    if case == "valid" {
                        guard.stage_effects(state(vec![])).await.unwrap();
                        guard.inbound_participant_metadata(participant.actor_target(), false).unwrap();
                    }
                }
                drop(guard); // actual live owner takes execution/lease obligation
                gated(&participant).await;
            }
            drop(scope);
            drop(lifetime);
            cancel.cancel();
            while let Some(joined) = supervisor.join_next().await { joined.unwrap().unwrap(); }
        }
    }

    #[tokio::test]
    async fn constructor_shape_does_not_widen_factory_shared_or_root_admission() {
        let (sidecar, participant, context) = fixture();
        let root_headers = crate::RebootHeaders::new("actor/1");
        let root = crate::runtime::RootTransactionContext::start(root_headers, "example.Actor", TransactionMode::Exclusive, Uuid::new_v4(), prost_types::Timestamp::default()).unwrap();
        assert!(participant.start_constructor_child(root.transaction()).await.is_err());
        let mut shared_headers = context.headers().clone();
        shared_headers.transaction_ids = Some(vec![context.transaction_root_id()]);
        let shared = crate::runtime::TransactionContext::from_headers(shared_headers, TransactionMode::Shared).unwrap();
        assert!(participant.start_constructor_child(&shared).await.is_err());
        let mut foreign_headers = context.headers().clone();
        foreign_headers.state_ref = "foreign".into();
        let foreign = crate::runtime::TransactionContext::from_headers(foreign_headers, TransactionMode::Exclusive).unwrap();
        assert!(participant.start_constructor_child(&foreign).await.is_err());
        let mut factory = start(Uuid::new_v4());
        factory.factory = true;
        factory.transaction_ids.push(Uuid::new_v4());
        factory.transaction_path = TransactionPathContract::PreserveNested;
        assert!(participant.start_local(factory, ParticipantStartMode::Exclusive).await.is_err());
        assert!(sidecar.inner.calls.lock().unwrap().is_empty());
    }
}
