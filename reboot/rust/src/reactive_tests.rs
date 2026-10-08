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
}
