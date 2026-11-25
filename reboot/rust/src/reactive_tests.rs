#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU64, Ordering};
    use tokio_stream::StreamExt;
    use wire::local_readers_server::LocalReaders;
    struct Binding {
        store: DatabaseActorStore,
        value: Arc<AtomicU64>,
    }
    #[tonic::async_trait]
    impl ReaderBinding for Binding {
        fn validate_owner(&self, owner: &LocalReaderOwner) -> Result<(), Status> {
            owner.validate_generated_store(&self.store, "unit.Counter")
        }
        async fn read(&self, _: Request<wire::Query>) -> Result<Vec<u8>, Status> {
            Ok(self.value.load(Ordering::SeqCst).to_le_bytes().to_vec())
        }
    }
    fn setup() -> (
        LocalReaderOwner,
        LocalReaderService<Binding>,
        Arc<AtomicU64>,
    ) {
        let store = DatabaseActorStore::connect_lazy("http://127.0.0.1:9").unwrap();
        let reference =
            crate::state_ref::StateRef::from_id("unit.Counter", &uuid::Uuid::new_v4().to_string())
                .unwrap()
                .to_string();
        let owner =
            LocalReaderOwner::for_generated_actor(&store, "unit.Counter", &reference).unwrap();
        let value = Arc::new(AtomicU64::new(0));
        let service = LocalReaderService::new(
            Binding {
                store,
                value: value.clone(),
            },
            owner.clone(),
        )
        .unwrap();
        (owner, service, value)
    }
    fn request(owner: &LocalReaderOwner) -> Request<wire::Query> {
        let mut r = Request::new(wire::Query {
            method: "query".into(),
            request: vec![],
        });
        r.metadata_mut()
            .insert("x-reboot-state-ref", owner.inner.state_ref.parse().unwrap());
        r
    }
    fn number(s: wire::Snapshot) -> u64 {
        u64::from_le_bytes(s.response.try_into().unwrap())
    }
    #[tokio::test]
    async fn absent_host_and_cross_store_owner_fail_closed() {
        let (owner, service, _) = setup();
        assert_eq!(
            service
                .subscribe(request(&owner))
                .await
                .err()
                .unwrap()
                .code(),
            tonic::Code::FailedPrecondition
        );
        let wrong = DatabaseActorStore::connect_lazy("http://127.0.0.1:10").unwrap();
        assert!(
            LocalReaderService::new(
                Binding {
                    store: wrong,
                    value: Arc::new(AtomicU64::new(0))
                },
                owner.clone()
            )
            .is_err()
        );
        let (cancel, _) = RecoveryCancellation::test_host();
        owner
            .start(&mut tokio::task::JoinSet::new(), cancel)
            .await
            .unwrap();
        let mut wrong = request(&owner);
        wrong
            .metadata_mut()
            .insert("x-reboot-state-ref", "another".parse().unwrap());
        assert_eq!(
            service.subscribe(wrong).await.err().unwrap().code(),
            tonic::Code::FailedPrecondition
        );
    }
    #[tokio::test]
    async fn subscribe_before_baseline_race_and_burst_coalesce_without_lease() {
        let (owner, service, value) = setup();
        let (cancel, _) = RecoveryCancellation::test_host();
        owner
            .start(&mut tokio::task::JoinSet::new(), cancel)
            .await
            .unwrap();
        let mut stream = service
            .subscribe(request(&owner))
            .await
            .unwrap()
            .into_inner();
        value.store(1, Ordering::SeqCst);
        owner.inner.gate.commit_attempt().acknowledged();
        assert_eq!(number(stream.next().await.unwrap().unwrap()), 1);
        for n in 2..1000 {
            value.store(n, Ordering::SeqCst);
            owner.inner.gate.commit_attempt().acknowledged();
        }
        let _exclusive = tokio::time::timeout(
            std::time::Duration::from_millis(100),
            owner.inner.gate.exclusive(),
        )
        .await
        .unwrap();
        drop(_exclusive);
        assert_eq!(number(stream.next().await.unwrap().unwrap()), 999);
        assert_eq!(owner.active_subscriptions(), 1);
        drop(stream);
        assert_eq!(owner.active_subscriptions(), 0);
    }
    #[tokio::test]
    async fn capacity_drop_shutdown_and_uncertain_commit_are_bounded() {
        let (owner, service, _) = setup();
        let (cancel, _) = RecoveryCancellation::test_host();
        owner
            .start(&mut tokio::task::JoinSet::new(), cancel.clone())
            .await
            .unwrap();
        let mut streams = Vec::new();
        for _ in 0..64 {
            streams.push(
                service
                    .subscribe(request(&owner))
                    .await
                    .unwrap()
                    .into_inner(),
            );
        }
        assert_eq!(
            service
                .subscribe(request(&owner))
                .await
                .err()
                .unwrap()
                .code(),
            tonic::Code::ResourceExhausted
        );
        streams.clear();
        assert_eq!(owner.active_subscriptions(), 0);
        let mut stream = service
            .subscribe(request(&owner))
            .await
            .unwrap()
            .into_inner();
        assert!(stream.next().await.unwrap().is_ok());
        drop(owner.inner.gate.commit_attempt());
        assert_eq!(
            stream.next().await.unwrap().unwrap_err().code(),
            tonic::Code::Unavailable
        );
        assert_eq!(owner.active_subscriptions(), 0);
        let mut stream = service
            .subscribe(request(&owner))
            .await
            .unwrap()
            .into_inner();
        cancel.cancel();
        assert!(stream.next().await.is_none());
        assert_eq!(owner.active_subscriptions(), 0);
    }
    #[tokio::test]
    async fn cancellation_during_reader_lease_wait_reclaims_admission() {
        let (owner, service, _) = setup();
        let (cancel, _) = RecoveryCancellation::test_host();
        owner
            .start(&mut tokio::task::JoinSet::new(), cancel.clone())
            .await
            .unwrap();
        let exclusive = owner.inner.gate.exclusive().await;
        let mut stream = service
            .subscribe(request(&owner))
            .await
            .unwrap()
            .into_inner();
        assert!(
            tokio::time::timeout(std::time::Duration::from_millis(10), stream.next())
                .await
                .is_err()
        );
        cancel.cancel();
        assert!(stream.next().await.is_none());
        drop(exclusive);
        assert_eq!(owner.active_subscriptions(), 0);
        let _writer = owner.inner.gate.exclusive().await;
    }
    #[tokio::test]
    async fn idle_revocation_epoch_is_terminal_after_restore() {
        let (cancel, _) = RecoveryCancellation::test_host();
        let (sender, receiver) = tokio::sync::watch::channel(0);
        let scope = ReaderScope {
            lifecycle: cancel,
            revocations: Some(receiver),
            epoch: 0,
        };
        assert!(scope.check().is_ok());
        sender.send_replace(1);
        // Placement can be ready again; the prior scope still cannot revive.
        tokio::time::timeout(std::time::Duration::from_millis(100), scope.revoked())
            .await
            .unwrap();
        assert_eq!(scope.check().unwrap_err().code(), tonic::Code::Unavailable);
    }
    #[tokio::test]
    async fn commit_while_baseline_waits_on_gate_is_not_lost() {
        let (owner, service, value) = setup();
        let (cancel, _) = RecoveryCancellation::test_host();
        owner
            .start(&mut tokio::task::JoinSet::new(), cancel)
            .await
            .unwrap();
        let exclusive = owner.inner.gate.exclusive().await;
        let mut stream = service
            .subscribe(request(&owner))
            .await
            .unwrap()
            .into_inner();
        assert!(
            tokio::time::timeout(std::time::Duration::from_millis(10), stream.next())
                .await
                .is_err()
        );
        value.store(42, Ordering::SeqCst);
        owner.inner.gate.commit_attempt().acknowledged();
        drop(exclusive);
        assert_eq!(number(stream.next().await.unwrap().unwrap()), 42);
        value.store(43, Ordering::SeqCst);
        owner.inner.gate.commit_attempt().acknowledged();
        assert_eq!(number(stream.next().await.unwrap().unwrap()), 43);
        drop(stream);
        assert_eq!(owner.active_subscriptions(), 0);
    }
    #[tokio::test]
    async fn registry_routes_independent_actors_and_reclaims_global_capacity() {
        let (a, service_a, value_a) = setup();
        let (b, service_b, value_b) = setup();
        let (cancel, _) = RecoveryCancellation::test_host();
        for owner in [&a, &b] {
            owner
                .start(&mut tokio::task::JoinSet::new(), cancel.clone())
                .await
                .unwrap();
        }
        let mut registry = LocalReaderRegistry::default();
        registry.register(service_a.clone()).unwrap();
        registry.register(service_b).unwrap();
        assert_eq!(
            registry.register(service_a).unwrap_err().code(),
            tonic::Code::AlreadyExists
        );
        let (unknown, _, _) = setup();
        assert_eq!(
            registry
                .subscribe(request(&unknown))
                .await
                .err()
                .unwrap()
                .code(),
            tonic::Code::FailedPrecondition
        );
        assert_eq!(registry.active_subscriptions(), 0);
        let mut stream_a = registry.subscribe(request(&a)).await.unwrap().into_inner();
        let mut stream_b = registry.subscribe(request(&b)).await.unwrap().into_inner();
        assert_eq!(number(stream_a.next().await.unwrap().unwrap()), 0);
        assert_eq!(number(stream_b.next().await.unwrap().unwrap()), 0);
        value_b.store(11, Ordering::SeqCst);
        b.inner.gate.commit_attempt().acknowledged();
        assert_eq!(number(stream_b.next().await.unwrap().unwrap()), 11);
        assert!(
            tokio::time::timeout(std::time::Duration::from_millis(20), stream_a.next())
                .await
                .is_err()
        );
        value_a.store(7, Ordering::SeqCst);
        a.inner.gate.commit_attempt().acknowledged();
        assert_eq!(number(stream_a.next().await.unwrap().unwrap()), 7);
        // An uncertain actor terminates only that actor's subscriptions.
        drop(a.inner.gate.commit_attempt());
        assert_eq!(
            stream_a.next().await.unwrap().unwrap_err().code(),
            tonic::Code::Unavailable
        );
        assert_eq!(registry.active_subscriptions(), 1);
        value_b.store(12, Ordering::SeqCst);
        b.inner.gate.commit_attempt().acknowledged();
        assert_eq!(number(stream_b.next().await.unwrap().unwrap()), 12);
        let mut streams = Vec::new();
        for _ in 0..63 {
            streams.push(registry.subscribe(request(&b)).await.unwrap().into_inner());
        }
        assert_eq!(registry.active_subscriptions(), 64);
        assert_eq!(
            registry.subscribe(request(&a)).await.err().unwrap().code(),
            tonic::Code::ResourceExhausted
        );
        streams.clear();
        cancel.cancel();
        assert!(stream_b.next().await.is_none());
        assert_eq!(registry.active_subscriptions(), 0);
        assert_eq!(a.active_subscriptions(), 0);
        assert_eq!(b.active_subscriptions(), 0);
    }
    #[tokio::test]
    async fn registry_admission_is_bounded_and_failed_routes_do_not_reserve_slots() {
        let mut registry = LocalReaderRegistry::new();
        assert!(registry.owners().is_err());
        let mut owners = Vec::new();
        for _ in 0..64 {
            let (owner, service, _) = setup();
            registry.register(service).unwrap();
            owners.push(owner);
        }
        assert_eq!(registry.owners().unwrap().len(), 64);
        let (_, extra, _) = setup();
        assert_eq!(
            registry.register(extra).unwrap_err().code(),
            tonic::Code::ResourceExhausted
        );
        // Unstarted lifecycle denial drops the already reserved global permit.
        assert_eq!(
            registry
                .subscribe(request(&owners[0]))
                .await
                .err()
                .unwrap()
                .code(),
            tonic::Code::FailedPrecondition
        );
        assert_eq!(registry.active_subscriptions(), 0);
        let mut missing = request(&owners[0]);
        missing.metadata_mut().remove("x-reboot-state-ref");
        assert!(registry.subscribe(missing).await.is_err());
        assert_eq!(registry.active_subscriptions(), 0);
    }

    struct ProtectedBinding {
        binding: Binding,
        token: &'static str,
    }
    #[tonic::async_trait]
    impl ReaderBinding for ProtectedBinding {
        fn validate_owner(&self, owner: &LocalReaderOwner) -> Result<(), Status> {
            self.binding.validate_owner(owner)
        }
        async fn read(&self, request: Request<wire::Query>) -> Result<Vec<u8>, Status> {
            if request
                .metadata()
                .get("authorization")
                .and_then(|value| value.to_str().ok())
                != Some(self.token)
            {
                return Err(Status::permission_denied("actor-specific policy denied"));
            }
            self.binding.read(request).await
        }
    }
    #[tokio::test]
    async fn registry_preserves_actor_specific_metadata_and_auth_errors() {
        let (a, service_a, _) = setup();
        let (b, service_b, _) = setup();
        let (cancel, _) = RecoveryCancellation::test_host();
        let mut registry = LocalReaderRegistry::new();
        for (owner, service, token) in [(&a, service_a, "alpha"), (&b, service_b, "beta")] {
            owner
                .start(&mut tokio::task::JoinSet::new(), cancel.clone())
                .await
                .unwrap();
            registry
                .register(
                    LocalReaderService::new(
                        ProtectedBinding {
                            binding: Binding {
                                store: service.binding.store.clone(),
                                value: service.binding.value.clone(),
                            },
                            token,
                        },
                        owner.clone(),
                    )
                    .unwrap(),
                )
                .unwrap();
        }
        for (owner, token, allowed) in [
            (&a, "alpha", true),
            (&b, "alpha", false),
            (&b, "beta", true),
        ] {
            let mut query = request(owner);
            query
                .metadata_mut()
                .insert("authorization", token.parse().unwrap());
            let mut stream = registry.subscribe(query).await.unwrap().into_inner();
            let result = stream.next().await.unwrap();
            if allowed {
                assert!(result.is_ok());
            } else {
                assert_eq!(result.unwrap_err().code(), tonic::Code::PermissionDenied);
            }
            drop(stream);
            assert_eq!(registry.active_subscriptions(), 0);
        }
    }
    #[tokio::test]
    async fn host_registry_rejects_empty_and_both_duplicate_route_shapes() {
        use crate::application_host::ApplicationHost;
        let host = || {
            ApplicationHost::new("registry-test").add_public_service(
                crate::proto::echo_methods_server::EchoMethodsServer::new(
                    crate::runtime::InMemoryHost::default().with_authorization(crate::auth::AuthorizationPolicy::permissive_for_development()),
                ),
            )
        };
        assert!(
            host()
                .try_add_local_reader_registry(LocalReaderRegistry::new())
                .is_err()
        );
        let (_, service, _) = setup();
        let mut first = LocalReaderRegistry::new();
        first.register(service.clone()).unwrap();
        let second = first.clone();
        assert!(
            host()
                .try_add_local_reader_registry(first)
                .unwrap()
                .try_add_local_reader_registry(second)
                .is_err()
        );
        let mut registry = LocalReaderRegistry::new();
        registry.register(service.clone()).unwrap();
        assert!(
            host()
                .try_add_local_readers(service.clone())
                .unwrap()
                .try_add_local_reader_registry(registry.clone())
                .is_err()
        );
        assert!(
            host()
                .try_add_local_reader_registry(registry)
                .unwrap()
                .try_add_local_readers(service)
                .is_err()
        );
    }
}
