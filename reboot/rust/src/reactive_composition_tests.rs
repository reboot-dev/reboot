#[cfg(test)]
mod composition_tests {
    use super::*;
    use std::sync::atomic::{AtomicU64, Ordering};
    use tokio_stream::StreamExt;
    use wire::local_readers_server::LocalReaders;
    #[derive(Clone, PartialEq, prost::Message)]
    struct Value {
        #[prost(uint64, tag = "1")]
        value: u64,
    }
    struct Binding {
        store: DatabaseActorStore,
        value: Arc<AtomicU64>,
        selected: Arc<Mutex<Vec<String>>>,
        calls: Arc<AtomicU64>,
        race: Arc<Mutex<Option<ActorGate>>>,
        escaped: Arc<Mutex<Option<LocalReaderContext>>>,
    }
    #[tonic::async_trait]
    impl ReaderBinding for Binding {
        fn validate_owner(&self, owner: &LocalReaderOwner) -> Result<(), Status> {
            owner.validate_generated_store(&self.store, "unit.Compose")
        }
        async fn read(&self, request: Request<wire::Query>) -> Result<Vec<u8>, Status> {
            if request
                .metadata()
                .get("authorization")
                .and_then(|v| v.to_str().ok())
                != Some("Bearer test-token")
            {
                return Err(Status::permission_denied("test target credential"));
            }
            if request.get_ref().method != "value" {
                return Err(Status::unimplemented("reader only"));
            }
            self.calls.fetch_add(1, Ordering::SeqCst);
            let value = self.value.load(Ordering::SeqCst);
            if let Some(gate) = self.race.lock().unwrap().take() {
                self.value.store(value + 1, Ordering::SeqCst);
                gate.committed();
            }
            Ok(Value { value }.encode_to_vec())
        }
        async fn read_with_context(
            &self,
            request: Request<wire::Query>,
            context: LocalReaderContext,
        ) -> Result<Vec<u8>, Status> {
            let selected = self.selected.lock().unwrap().clone();
            *self.escaped.lock().unwrap() = Some(context.clone());
            if selected.is_empty() {
                return self.read(request).await;
            }
            let mut value = 0;
            for target in selected {
                value += context
                    .read::<Value, Value>(&target, "unit.Compose", "value", Value::default())
                    .await?
                    .value;
            }
            Ok(Value { value }.encode_to_vec())
        }
    }
    struct Actor {
        owner: LocalReaderOwner,
        service: LocalReaderService<Binding>,
        value: Arc<AtomicU64>,
        selected: Arc<Mutex<Vec<String>>>,
        calls: Arc<AtomicU64>,
        race: Arc<Mutex<Option<ActorGate>>>,
        escaped: Arc<Mutex<Option<LocalReaderContext>>>,
    }
    fn actor(endpoint: &str) -> Actor {
        let store = DatabaseActorStore::connect_lazy(endpoint).unwrap();
        let reference =
            crate::state_ref::StateRef::from_id("unit.Compose", &uuid::Uuid::new_v4().to_string())
                .unwrap()
                .to_string();
        let owner =
            LocalReaderOwner::for_generated_actor(&store, "unit.Compose", &reference).unwrap();
        let value = Arc::new(AtomicU64::new(0));
        let selected = Arc::new(Mutex::new(Vec::new()));
        let calls = Arc::new(AtomicU64::new(0));
        let race = Arc::new(Mutex::new(None));
        let escaped = Arc::new(Mutex::new(None));
        let service = LocalReaderService::new(
            Binding {
                store,
                value: value.clone(),
                selected: selected.clone(),
                calls: calls.clone(),
                race: race.clone(),
                escaped: escaped.clone(),
            },
            owner.clone(),
        )
        .unwrap();
        Actor {
            owner,
            service,
            value,
            selected,
            calls,
            race,
            escaped,
        }
    }
    async fn registry(actors: &[&Actor]) -> (LocalReaderRegistry, RecoveryCancellation) {
        let mut registry = LocalReaderRegistry::new().with_reader_composition();
        for actor in actors {
            registry.register(actor.service.clone()).unwrap();
        }
        let (cancel, _) = RecoveryCancellation::test_host();
        for owner in registry.owners().unwrap() {
            owner
                .start(&mut tokio::task::JoinSet::new(), cancel.clone())
                .await
                .unwrap();
        }
        (registry, cancel)
    }
    fn query(a: &Actor) -> Request<wire::Query> {
        let mut q = Request::new(wire::Query {
            method: "value".into(),
            request: Vec::new(),
        });
        q.metadata_mut().insert(
            "x-reboot-state-ref",
            a.owner.inner.state_ref.parse().unwrap(),
        );
        q.metadata_mut()
            .insert("authorization", "Bearer test-token".parse().unwrap());
        q
    }
    async fn next(s: &mut RegisteredReaderStream) -> Result<u64, Status> {
        let item = tokio::time::timeout(std::time::Duration::from_secs(1), s.next())
            .await
            .unwrap()
            .unwrap()?;
        Ok(Value::decode(item.response.as_slice()).unwrap().value)
    }
    #[tokio::test]
    async fn selection_dependency_changes_retirement_and_closed_scope() {
        let root = actor("http://127.0.0.1:9");
        let a = actor("http://127.0.0.1:9");
        let b = actor("http://127.0.0.1:9");
        a.value.store(10, Ordering::SeqCst);
        b.value.store(20, Ordering::SeqCst);
        *root.selected.lock().unwrap() = vec![a.owner.inner.state_ref.clone()];
        let (registry, _) = registry(&[&root, &a, &b]).await;
        let mut stream = registry.subscribe(query(&root)).await.unwrap().into_inner();
        assert_eq!(next(&mut stream).await.unwrap(), 10);
        a.value.store(11, Ordering::SeqCst);
        a.owner.inner.gate.committed();
        assert_eq!(next(&mut stream).await.unwrap(), 11);
        *root.selected.lock().unwrap() = vec![b.owner.inner.state_ref.clone()];
        root.owner.inner.gate.committed();
        assert_eq!(next(&mut stream).await.unwrap(), 20);
        let before = b.calls.load(Ordering::SeqCst);
        a.value.store(99, Ordering::SeqCst);
        a.owner.inner.gate.committed();
        assert!(
            tokio::time::timeout(std::time::Duration::from_millis(20), stream.next())
                .await
                .is_err()
        );
        assert_eq!(b.calls.load(Ordering::SeqCst), before);
        let escaped = root.escaped.lock().unwrap().clone().unwrap();
        assert_eq!(
            escaped
                .read::<Value, Value>(
                    &a.owner.inner.state_ref,
                    "unit.Compose",
                    "value",
                    Value::default()
                )
                .await
                .unwrap_err()
                .code(),
            tonic::Code::FailedPrecondition
        );
        drop(stream);
        assert_eq!(registry.active_subscriptions(), 0);
    }
    #[tokio::test]
    async fn pre_read_revision_preserves_racing_commit_and_uncertainty_is_terminal() {
        let root = actor("http://127.0.0.1:9");
        let a = actor("http://127.0.0.1:9");
        a.value.store(5, Ordering::SeqCst);
        *a.race.lock().unwrap() = Some(a.owner.inner.gate.clone());
        *root.selected.lock().unwrap() = vec![a.owner.inner.state_ref.clone()];
        let (registry, _) = registry(&[&root, &a]).await;
        let mut stream = registry.subscribe(query(&root)).await.unwrap().into_inner();
        assert_eq!(next(&mut stream).await.unwrap(), 5);
        assert_eq!(next(&mut stream).await.unwrap(), 6);
        drop(a.owner.inner.gate.commit_attempt());
        assert_eq!(
            next(&mut stream).await.unwrap_err().code(),
            tonic::Code::Unavailable
        );
        assert_eq!(registry.active_subscriptions(), 0);
        assert!(stream.next().await.is_none());
    }
    #[tokio::test]
    async fn bounds_unknown_self_and_auth_fail_without_extra_target_reads() {
        let actors = (0..10)
            .map(|_| actor("http://127.0.0.1:9"))
            .collect::<Vec<_>>();
        let refs = actors.iter().collect::<Vec<_>>();
        let root = &actors[0];
        let (registry, _) = registry(&refs).await;
        for targets in [
            vec!["unknown".to_owned()],
            vec![root.owner.inner.state_ref.clone()],
            actors[1..]
                .iter()
                .map(|a| a.owner.inner.state_ref.clone())
                .collect(),
        ] {
            *root.selected.lock().unwrap() = targets;
            let mut stream = registry.subscribe(query(root)).await.unwrap().into_inner();
            let code = next(&mut stream).await.unwrap_err().code();
            assert!(matches!(
                code,
                tonic::Code::FailedPrecondition | tonic::Code::ResourceExhausted
            ));
            assert_eq!(registry.active_subscriptions(), 0);
        }
        assert_eq!(actors[9].calls.load(Ordering::SeqCst), 0);
        *root.selected.lock().unwrap() = vec![actors[1].owner.inner.state_ref.clone()];
        let mut q = query(root);
        q.metadata_mut()
            .insert("authorization", "Bearer denied".parse().unwrap());
        let mut stream = registry.subscribe(q).await.unwrap().into_inner();
        assert_eq!(
            next(&mut stream).await.unwrap_err().code(),
            tonic::Code::PermissionDenied
        );
    }
    #[tokio::test]
    async fn composition_rejects_distinct_database_endpoints_at_installation() {
        let a = actor("http://127.0.0.1:9");
        let b = actor("http://127.0.0.1:10");
        let mut registry = LocalReaderRegistry::new().with_reader_composition();
        registry.register(a.service).unwrap();
        registry.register(b.service).unwrap();
        assert_eq!(
            registry.owners().err().unwrap().code(),
            tonic::Code::FailedPrecondition
        );
    }
    struct CatchingBinding(Binding);
    #[tonic::async_trait]
    impl ReaderBinding for CatchingBinding {
        fn validate_owner(&self, owner: &LocalReaderOwner) -> Result<(), Status> {
            self.0.validate_owner(owner)
        }
        async fn read(&self, request: Request<wire::Query>) -> Result<Vec<u8>, Status> {
            self.0.read(request).await
        }
        async fn read_with_context(
            &self,
            _: Request<wire::Query>,
            context: LocalReaderContext,
        ) -> Result<Vec<u8>, Status> {
            let _caught = context
                .read::<Value, Value>("unregistered", "unit.Compose", "value", Value::default())
                .await;
            Ok(Value { value: 42 }.encode_to_vec())
        }
    }
    #[tokio::test]
    async fn caught_dependency_error_cannot_publish_partial_success() {
        let root = actor("http://127.0.0.1:9");
        let service = LocalReaderService::new(
            CatchingBinding(Binding {
                store: root.service.binding.store.clone(),
                value: root.value.clone(),
                selected: root.selected.clone(),
                calls: root.calls.clone(),
                race: root.race.clone(),
                escaped: root.escaped.clone(),
            }),
            root.owner.clone(),
        )
        .unwrap();
        let mut registry = LocalReaderRegistry::new().with_reader_composition();
        registry.register(service).unwrap();
        let (cancel, _) = RecoveryCancellation::test_host();
        root.owner
            .start(&mut tokio::task::JoinSet::new(), cancel)
            .await
            .unwrap();
        let mut stream = registry.subscribe(query(&root)).await.unwrap().into_inner();
        assert_eq!(
            next(&mut stream).await.unwrap_err().code(),
            tonic::Code::FailedPrecondition
        );
        assert_eq!(registry.active_subscriptions(), 0);
    }
    #[tokio::test]
    async fn dependency_uncertainty_interrupts_queued_lease_without_waiting_for_writer() {
        let root = actor("http://127.0.0.1:9");
        let source = actor("http://127.0.0.1:9");
        *root.selected.lock().unwrap() = vec![source.owner.inner.state_ref.clone()];
        let (registry, _) = registry(&[&root, &source]).await;
        let held = source.owner.inner.gate.exclusive().await;
        let mut stream = registry.subscribe(query(&root)).await.unwrap().into_inner();
        assert!(
            tokio::time::timeout(std::time::Duration::from_millis(20), stream.next())
                .await
                .is_err()
        );
        drop(source.owner.inner.gate.commit_attempt());
        assert_eq!(
            next(&mut stream).await.unwrap_err().code(),
            tonic::Code::Unavailable
        );
        assert_eq!(registry.active_subscriptions(), 0);
        drop(held);
        let _fresh = source.owner.inner.gate.exclusive().await;
    }
    struct CancellingBinding(Binding);
    #[tonic::async_trait]
    impl ReaderBinding for CancellingBinding {
        fn validate_owner(&self, owner: &LocalReaderOwner) -> Result<(), Status> {
            self.0.validate_owner(owner)
        }
        async fn read(&self, request: Request<wire::Query>) -> Result<Vec<u8>, Status> {
            self.0.read(request).await
        }
        async fn read_with_context(
            &self,
            _: Request<wire::Query>,
            context: LocalReaderContext,
        ) -> Result<Vec<u8>, Status> {
            let target = self.0.selected.lock().unwrap()[0].clone();
            let _caught = tokio::time::timeout(
                std::time::Duration::from_millis(20),
                context.read::<Value, Value>(&target, "unit.Compose", "value", Value::default()),
            )
            .await;
            Ok(Value { value: 42 }.encode_to_vec())
        }
    }
    #[tokio::test]
    async fn cancelled_dependency_future_cannot_be_caught_as_fallback_success() {
        let root = actor("http://127.0.0.1:9");
        let source = actor("http://127.0.0.1:9");
        *root.selected.lock().unwrap() = vec![source.owner.inner.state_ref.clone()];
        let service = LocalReaderService::new(
            CancellingBinding(Binding {
                store: root.service.binding.store.clone(),
                value: root.value.clone(),
                selected: root.selected.clone(),
                calls: root.calls.clone(),
                race: root.race.clone(),
                escaped: root.escaped.clone(),
            }),
            root.owner.clone(),
        )
        .unwrap();
        let mut registry = LocalReaderRegistry::new().with_reader_composition();
        registry.register(service).unwrap();
        registry.register(source.service.clone()).unwrap();
        let (cancel, _) = RecoveryCancellation::test_host();
        for owner in registry.owners().unwrap() {
            owner
                .start(&mut tokio::task::JoinSet::new(), cancel.clone())
                .await
                .unwrap();
        }
        let held = source.owner.inner.gate.exclusive().await;
        let mut stream = registry.subscribe(query(&root)).await.unwrap().into_inner();
        assert_eq!(
            next(&mut stream).await.unwrap_err().code(),
            tonic::Code::FailedPrecondition
        );
        assert_eq!(registry.active_subscriptions(), 0);
        drop(held);
        let _fresh = source.owner.inner.gate.exclusive().await;
    }
    #[tokio::test]
    async fn root_uncertainty_interrupts_active_dependency_lease_wait() {
        let root = actor("http://127.0.0.1:9");
        let source = actor("http://127.0.0.1:9");
        *root.selected.lock().unwrap() = vec![source.owner.inner.state_ref.clone()];
        let (registry, _) = registry(&[&root, &source]).await;
        let held = source.owner.inner.gate.exclusive().await;
        let mut stream = registry.subscribe(query(&root)).await.unwrap().into_inner();
        assert!(
            tokio::time::timeout(std::time::Duration::from_millis(20), stream.next())
                .await
                .is_err()
        );
        drop(root.owner.inner.gate.commit_attempt());
        assert_eq!(
            next(&mut stream).await.unwrap_err().code(),
            tonic::Code::Unavailable
        );
        assert_eq!(registry.active_subscriptions(), 0);
        drop(held);
    }
    #[tokio::test]
    async fn evaluation_drop_wakes_escaped_inflight_read_and_reclaims_waiter() {
        let root = actor("http://127.0.0.1:9");
        let source = actor("http://127.0.0.1:9");
        let (registry, _) = registry(&[&root, &source]).await;
        let context = LocalReaderContext {
            entries: Arc::new(registry.entries.clone()),
            root: root.owner.inner.state_ref.clone(),
            metadata: query(&root).metadata().clone(),
            scope: ReaderScope::new(root.owner.lifecycle().unwrap()),
            trusted: None,
            dependencies: Arc::new(Mutex::new(std::collections::BTreeMap::new())),
            evaluation: Evaluation::new(),
            dependency_changes: tokio::sync::watch::channel(0).0,
        };
        let guard = EvaluationGuard(context.evaluation.clone());
        let held = source.owner.inner.gate.exclusive().await;
        let cloned = context.clone();
        let target = source.owner.inner.state_ref.clone();
        let task = tokio::spawn(async move {
            cloned
                .read::<Value, Value>(&target, "unit.Compose", "value", Value::default())
                .await
        });
        tokio::time::timeout(std::time::Duration::from_secs(1), async {
            loop {
                if context.evaluation.state.lock().unwrap().reads == 1 {
                    break;
                }
                tokio::task::yield_now().await;
            }
        })
        .await
        .unwrap();
        drop(guard);
        assert_eq!(
            tokio::time::timeout(std::time::Duration::from_secs(1), task)
                .await
                .unwrap()
                .unwrap()
                .unwrap_err()
                .code(),
            tonic::Code::FailedPrecondition
        );
        assert_eq!(context.evaluation.state.lock().unwrap().reads, 0);
        drop(held);
        let _fresh = source.owner.inner.gate.exclusive().await;
    }
    #[test]
    fn evaluation_finalization_and_failure_completion_share_one_atomic_state() {
        let evaluation = Evaluation::new();
        let guard = DependencyReadGuard::admit(evaluation.clone()).unwrap();
        assert!(evaluation.finish().is_err());
        assert!(DependencyReadGuard::admit(evaluation.clone()).is_err());
        assert!(
            guard
                .complete::<()>(Err(Status::permission_denied("target denied")))
                .is_err()
        );
        let state = evaluation.state.lock().unwrap();
        assert!(state.closed);
        assert_eq!(state.reads, 0);
        assert!(state.failure.is_some());
    }
    #[tokio::test]
    async fn earlier_dependency_uncertainty_interrupts_later_target_admission() {
        let root = actor("http://127.0.0.1:9");
        let first = actor("http://127.0.0.1:9");
        let later = actor("http://127.0.0.1:9");
        *root.selected.lock().unwrap() = vec![
            first.owner.inner.state_ref.clone(),
            later.owner.inner.state_ref.clone(),
        ];
        let (registry, _) = registry(&[&root, &first, &later]).await;
        let held = later.owner.inner.gate.exclusive().await;
        let mut stream = registry.subscribe(query(&root)).await.unwrap().into_inner();
        assert!(
            tokio::time::timeout(std::time::Duration::from_millis(20), stream.next())
                .await
                .is_err()
        );
        assert_eq!(first.calls.load(Ordering::SeqCst), 1);
        drop(first.owner.inner.gate.commit_attempt());
        assert_eq!(
            next(&mut stream).await.unwrap_err().code(),
            tonic::Code::Unavailable
        );
        assert_eq!(registry.active_subscriptions(), 0);
        drop(held);
    }
    #[tokio::test]
    async fn repeated_target_reads_retain_earliest_pre_read_revision() {
        let root = actor("http://127.0.0.1:9");
        let source = actor("http://127.0.0.1:9");
        source.value.store(5, Ordering::SeqCst);
        *source.race.lock().unwrap() = Some(source.owner.inner.gate.clone());
        *root.selected.lock().unwrap() = vec![
            source.owner.inner.state_ref.clone(),
            source.owner.inner.state_ref.clone(),
        ];
        let (registry, _) = registry(&[&root, &source]).await;
        let mut stream = registry.subscribe(query(&root)).await.unwrap().into_inner();
        assert_eq!(next(&mut stream).await.unwrap(), 11);
        assert_eq!(next(&mut stream).await.unwrap(), 12);
        drop(stream);
        assert_eq!(registry.active_subscriptions(), 0);
    }
}
