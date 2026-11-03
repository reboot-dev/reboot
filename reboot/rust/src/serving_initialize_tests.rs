#[cfg(test)]
mod serving_initialize_behavior_tests {
    use super::*;
    use tokio_stream::StreamExt;
    #[tokio::test]
    async fn recovered_routes_do_not_imply_initializer_startup_success() {
        let (recovery, state) = tokio::sync::watch::channel(RecoveryState::Ready);
        let (placement, placed) = tokio::sync::watch::channel(true);
        let (startup, initialization) =
            tokio::sync::watch::channel(ServingInitializeState::Pending);
        let health = HostHealth {
            readiness: RecoveryReadiness { state },
            placement: placed,
            initialization,
        };
        assert_eq!(health.status(), ServingStatus::NotServing);
        let mut stream = health
            .watch(Request::new(HealthCheckRequest::default()))
            .await
            .unwrap()
            .into_inner();
        assert_eq!(
            stream.next().await.unwrap().unwrap().status,
            ServingStatus::NotServing as i32
        );
        startup.send_replace(ServingInitializeState::Succeeded);
        assert_eq!(
            stream.next().await.unwrap().unwrap().status,
            ServingStatus::Serving as i32
        );
        startup.send_replace(ServingInitializeState::Failed);
        assert_eq!(
            stream.next().await.unwrap().unwrap().status,
            ServingStatus::NotServing as i32
        );
        assert!(stream.next().await.is_none());
        assert_eq!(*recovery.borrow(), RecoveryState::Ready);
        assert!(*placement.borrow());
    }
    struct UnownedWorkflowBinding;
    #[tonic::async_trait]
    impl crate::one_shot_tasks::ReaderTaskBinding for UnownedWorkflowBinding {
        fn validate(&self, _: &crate::database_proto::Task) -> Result<(), tonic::Status> {
            Ok(())
        }
        fn writer_capable(&self) -> bool {
            true
        }
        async fn execute(
            &self,
            _: &crate::database_proto::Task,
        ) -> Result<prost_types::Any, tonic::Status> {
            Err(tonic::Status::permission_denied(
                "workflow requires admission",
            ))
        }
    }
    #[tokio::test]
    async fn listener_does_not_mint_initializer_authority_for_an_unregistered_owner() {
        use crate::legacy_placement::{LegacyApplicationId, PlanOnlyLegacyPlacement};
        let tasks = crate::one_shot_tasks::OneShotTasks::new(
            crate::runtime::DatabaseActorStore::connect_lazy("http://127.0.0.1:1").unwrap(),
            "hello_legacy_grpc.v1.RebootGreeter".into(),
            "unowned-initializer-test".into(),
            UnownedWorkflowBinding,
        )
        .unwrap();
        let called = Arc::new(std::sync::atomic::AtomicUsize::new(0));
        let callback_called = called.clone();
        let host = ApplicationHost::new("unowned-initializer-test")
            .with_serving_initializer("initialize-v1", tasks.clone(), move |_| {
                let called = callback_called.clone();
                async move {
                    called.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
                    Ok(())
                }
            })
            .unwrap();
        let state = host.serving_initialize_state();
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let service = tasks.wait_service(
            LegacyApplicationId::new("unowned-initializer-test").unwrap(),
            "server",
            PlanOnlyLegacyPlacement::new(),
        );
        let error = tokio::time::timeout(
            std::time::Duration::from_secs(2),
            host.add_public_service(service)
                .serve_with_listener_shutdown(listener, std::future::pending()),
        )
        .await
        .unwrap()
        .unwrap_err();
        assert!(
            matches!(error, ApplicationHostError::ServingInitialize(status) if status.code() == tonic::Code::FailedPrecondition)
        );
        assert_eq!(called.load(std::sync::atomic::Ordering::SeqCst), 0);
        assert_eq!(*state.borrow(), ServingInitializeState::Failed);
        assert!(tokio::net::TcpStream::connect(address).await.is_err());
    }

    use crate::database_proto as db;
    use crate::one_shot_tasks::{
        OneShotTaskRecovery, OneShotTasks, ReaderTaskBinding, TaskMethodDeclaration,
        WorkflowContext, WorkflowReceipt,
    };
    use crate::proto::Counter;
    use crate::runtime::{DurableStateDeclaration, StateAdmission};
    use prost::Message;
    use std::sync::atomic::{AtomicUsize, Ordering::SeqCst};
    const METHOD: &str = "tests.reboot.protoc.CounterWritesMethods.Initialize";
    const RESPONSE: &str = "type.googleapis.com/tests.reboot.protoc.Counter";
    struct InitializerState;
    impl DurableStateDeclaration for InitializerState {
        type State = Counter;
        const STATE_TYPE: &'static str = "tests.reboot.protoc.Counter";
        const TASK_STATE_ADMISSION: StateAdmission = StateAdmission::DefaultOnAbsent;
    }
    #[derive(Default)]
    struct DeliveryProbe {
        entered: tokio::sync::Notify,
        active: AtomicUsize,
        dropped: AtomicUsize,
    }
    struct DeliveryLease(Arc<DeliveryProbe>);
    impl Drop for DeliveryLease {
        fn drop(&mut self) {
            self.0.active.fetch_sub(1, SeqCst);
            self.0.dropped.fetch_add(1, SeqCst);
        }
    }
    struct ParkedWorkflow(Arc<DeliveryProbe>);
    #[tonic::async_trait]
    impl ReaderTaskBinding for ParkedWorkflow {
        fn validate(&self, task: &db::Task) -> Result<(), tonic::Status> {
            if task.method != "Initialize" {
                return Err(tonic::Status::invalid_argument("wrong workflow method"));
            }
            Counter::decode(task.request.as_slice())
                .map_err(|_| tonic::Status::invalid_argument("wrong request"))?;
            Ok(())
        }
        fn writer_capable(&self) -> bool {
            true
        }
        async fn execute(&self, _: &db::Task) -> Result<prost_types::Any, tonic::Status> {
            panic!("workflow must use its private executor")
        }
        async fn execute_workflow(
            &self,
            _: WorkflowContext<'_>,
        ) -> Result<WorkflowReceipt, tonic::Status> {
            self.0.active.fetch_add(1, SeqCst);
            let _lease = DeliveryLease(self.0.clone());
            self.0.entered.notify_one();
            std::future::pending().await
        }
    }
    // Deliberately erased wrapper: ownership must derive from the cancellation
    // actually forwarded into start, not a downcast to OneShotTaskRecovery.
    struct WrappedRecovery {
        recovery: OneShotTaskRecovery,
        actual: Arc<std::sync::Mutex<Option<RecoveryCancellation>>>,
    }
    #[tonic::async_trait]
    impl HostRecovery for WrappedRecovery {
        async fn start(
            &self,
            supervisor: &mut JoinSet<Result<(), tonic::Status>>,
            cancel: RecoveryCancellation,
        ) -> Result<(), tonic::Status> {
            *self.actual.lock().unwrap() = Some(cancel.clone());
            self.recovery.start(supervisor, cancel).await
        }
    }
    fn recovery_request() -> db::RecoverRequest {
        db::RecoverRequest {
            shard_ids: vec!["test-shard".into()],
            state_tags_by_state_type: [(InitializerState::STATE_TYPE.into(), "test-tag".into())]
                .into_iter()
                .collect(),
            ..Default::default()
        }
    }
    fn workflow_tasks(endpoint: &str, probe: Arc<DeliveryProbe>) -> (OneShotTasks, String) {
        let reference = crate::state_ref::StateRef::from_id(
            InitializerState::STATE_TYPE,
            &uuid::Uuid::new_v4().to_string(),
        )
        .unwrap()
        .to_string();
        let tasks = OneShotTasks::new_with_declarations(
            crate::runtime::DatabaseActorStore::connect_lazy(endpoint).unwrap(),
            InitializerState::STATE_TYPE.into(),
            reference.clone(),
            ParkedWorkflow(probe),
            vec![
                TaskMethodDeclaration::new::<InitializerState, Counter, Counter>(
                    METHOD,
                    RESPONSE,
                    vec![],
                )
                .workflow(),
            ],
        )
        .unwrap();
        (tasks, reference)
    }
    fn public_service(
        tasks: &OneShotTasks,
    ) -> db::tasks_server::TasksServer<crate::one_shot_tasks::ReaderTaskWaitService> {
        tasks.wait_service(
            crate::legacy_placement::LegacyApplicationId::new("host-binding-test").unwrap(),
            "server",
            crate::legacy_placement::PlanOnlyLegacyPlacement::new(),
        )
    }

    #[tokio::test]
    async fn running_foreign_host_is_rejected_before_callback_construction_and_store() {
        let (endpoint, database, database_server) =
            crate::runtime::test_support::start_database().await;
        let (tasks, _) = workflow_tasks(&endpoint, Arc::new(DeliveryProbe::default()));
        let actual = Arc::new(std::sync::Mutex::new(None));
        let host_a =
            ApplicationHost::new("host-binding-test").with_host_recovery(WrappedRecovery {
                recovery: tasks.recovery(recovery_request()),
                actual: actual.clone(),
            });
        let mut readiness = host_a.readiness.subscribe();
        let listener_a = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let (stop_a, stopped_a) = tokio::sync::oneshot::channel();
        let serving_a = tokio::spawn(
            host_a
                .add_public_service(public_service(&tasks))
                .serve_with_listener_shutdown(listener_a, async {
                    let _ = stopped_a.await;
                }),
        );
        tokio::time::timeout(std::time::Duration::from_secs(2), async {
            while *readiness.borrow_and_update() != RecoveryState::Ready {
                readiness.changed().await.unwrap();
            }
        })
        .await
        .unwrap();
        let cancel_a = actual.lock().unwrap().clone().unwrap();
        assert!(tasks.require_initializer_owner(&cancel_a).is_ok());
        let constructed = Arc::new(AtomicUsize::new(0));
        let callback_constructed = constructed.clone();
        // Same application ID and same tasks, but a distinct actual host root.
        let host_b = ApplicationHost::new("host-binding-test")
            .with_serving_initializer("initialize-v1", tasks.clone(), move |_| {
                callback_constructed.fetch_add(1, SeqCst); // outside returned future
                async { Ok(()) }
            })
            .unwrap();
        let state_b = host_b.serving_initialize_state();
        let listener_b = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address_b = listener_b.local_addr().unwrap();
        let error = tokio::time::timeout(
            std::time::Duration::from_secs(2),
            host_b
                .add_public_service(public_service(&tasks))
                .serve_with_listener_shutdown(listener_b, std::future::pending()),
        )
        .await
        .unwrap()
        .unwrap_err();
        assert!(
            matches!(error, ApplicationHostError::ServingInitialize(status)
            if status.code() == tonic::Code::FailedPrecondition
                && status.message().contains("different recovery host"))
        );
        assert_eq!(constructed.load(SeqCst), 0);
        assert!(database.store_requests().is_empty());
        assert_eq!(*state_b.borrow(), ServingInitializeState::Failed);
        assert!(tokio::net::TcpStream::connect(address_b).await.is_err());
        assert!(!cancel_a.is_cancelled());
        assert!(tasks.require_initializer_owner(&cancel_a).is_ok());
        stop_a.send(()).unwrap();
        tokio::time::timeout(std::time::Duration::from_secs(2), serving_a)
            .await
            .unwrap()
            .unwrap()
            .unwrap();
        assert!(tasks.require_initializer_owner(&cancel_a).is_err());
        database_server.abort();
    }

    #[tokio::test]
    async fn wrapped_same_host_initializer_succeeds_with_live_exact_owner() {
        let (endpoint, database, database_server) =
            crate::runtime::test_support::start_database().await;
        let (tasks, _) = workflow_tasks(&endpoint, Arc::new(DeliveryProbe::default()));
        let actual = Arc::new(std::sync::Mutex::new(None));
        let callback_actual = actual.clone();
        let callback_tasks = tasks.clone();
        let called = Arc::new(AtomicUsize::new(0));
        let callback_called = called.clone();
        let host = ApplicationHost::new("host-binding-test")
            .with_host_recovery(WrappedRecovery {
                recovery: tasks.recovery(recovery_request()),
                actual,
            })
            .with_serving_initializer("initialize-v1", tasks.clone(), move |context| {
                callback_called.fetch_add(1, SeqCst);
                let actual = callback_actual.clone();
                let tasks = callback_tasks.clone();
                async move {
                    context.require_live().await?;
                    let actual = actual.lock().unwrap().clone().unwrap();
                    drop(context.admission().lock_initializer(&actual, &tasks)?);
                    Ok(())
                }
            })
            .unwrap();
        let mut state = host.serving_initialize_state();
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let (stop, stopped) = tokio::sync::oneshot::channel();
        let serving = tokio::spawn(
            host.add_public_service(public_service(&tasks))
                .serve_with_listener_shutdown(listener, async {
                    let _ = stopped.await;
                }),
        );
        tokio::time::timeout(std::time::Duration::from_secs(2), async {
            while *state.borrow_and_update() != ServingInitializeState::Succeeded {
                state.changed().await.unwrap();
            }
        })
        .await
        .unwrap();
        assert_eq!(called.load(SeqCst), 1);
        assert!(database.store_requests().is_empty());
        stop.send(()).unwrap();
        tokio::time::timeout(std::time::Duration::from_secs(2), serving)
            .await
            .unwrap()
            .unwrap()
            .unwrap();
        database_server.abort();
    }

    #[tokio::test]
    async fn wrapped_same_host_fatal_initializer_drains_its_running_workflow_delivery() {
        let (endpoint, database, database_server) =
            crate::runtime::test_support::start_database().await;
        let probe = Arc::new(DeliveryProbe::default());
        let (tasks, reference) = workflow_tasks(&endpoint, probe.clone());
        // Seed canonical pending work via the fake Database's public test model;
        // dispatch, callback construction, cancellation and drain are real hosts.
        // This is an ownership test, not a native Store/CAS certification.
        database.seed_actor(
            InitializerState::STATE_TYPE,
            &reference,
            Counter::default().encode_to_vec(),
        );
        database.seed_task(db::Task {
            task_id: Some(db::TaskId {
                state_type: InitializerState::STATE_TYPE.into(),
                state_ref: reference,
                task_uuid: uuid::Uuid::new_v4().as_bytes().to_vec(),
            }),
            method: "Initialize".into(),
            request: Counter::default().encode_to_vec(),
            status: db::task::Status::Pending as i32,
            ..Default::default()
        });
        let actual = Arc::new(std::sync::Mutex::new(None));
        let callback_probe = probe.clone();
        let host = ApplicationHost::new("host-binding-test")
            .with_host_recovery(WrappedRecovery {
                recovery: tasks.recovery(recovery_request()),
                actual: actual.clone(),
            })
            .with_serving_initializer("initialize-v1", tasks.clone(), move |context| {
                let probe = callback_probe.clone();
                async move {
                    context.require_live().await?;
                    probe.entered.notified().await;
                    assert_eq!(probe.active.load(SeqCst), 1);
                    Err(tonic::Status::internal("fatal exact-owner initializer"))
                }
            })
            .unwrap();
        let state = host.serving_initialize_state();
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let error = tokio::time::timeout(
            std::time::Duration::from_secs(2),
            host.add_public_service(public_service(&tasks))
                .serve_with_listener_shutdown(listener, std::future::pending()),
        )
        .await
        .unwrap()
        .unwrap_err();
        assert!(
            matches!(error, ApplicationHostError::ServingInitialize(status)
            if status.message() == "fatal exact-owner initializer")
        );
        assert_eq!(*state.borrow(), ServingInitializeState::Failed);
        assert_eq!(probe.active.load(SeqCst), 0);
        assert_eq!(probe.dropped.load(SeqCst), 1);
        let cancel = actual.lock().unwrap().clone().unwrap();
        assert!(cancel.is_cancelled());
        assert!(tasks.require_initializer_owner(&cancel).is_err());
        assert!(tokio::net::TcpStream::connect(address).await.is_err());
        database_server.abort();
    }

    #[tokio::test]
    async fn foreign_capability_is_rechecked_before_typed_admission_wait_and_callback() {
        let (endpoint, database, database_server) =
            crate::runtime::test_support::start_database().await;
        let (tasks, reference) = workflow_tasks(&endpoint, Arc::new(DeliveryProbe::default()));
        let (actual, _actual_readiness) = RecoveryCancellation::test_host();
        let (foreign, _foreign_readiness) = RecoveryCancellation::test_host();
        let mut supervisor = JoinSet::new();
        tasks
            .recovery(recovery_request())
            .start(&mut supervisor, actual.clone())
            .await
            .unwrap();
        let owner = tasks.require_initializer_owner(&actual).unwrap();
        // Internal regression fixture only: public callers cannot construct this.
        // Even an accidentally combined context must fail at every use boundary.
        let context = ServingInitializeContext {
            application_id: "host-binding-test".into(),
            alias: "initialize-v1".into(),
            tasks: tasks.clone(),
            cancel: foreign,
            owner,
            live: Arc::new(std::sync::atomic::AtomicBool::new(true)),
        };
        let before = database.admission_rpc_counts();
        let error = context
            .spawn_workflow::<InitializerState, Counter, Counter>(
                METHOD,
                RESPONSE,
                &Counter::default(),
            )
            .await
            .unwrap_err();
        assert_eq!(error.code(), tonic::Code::FailedPrecondition);
        let error = context
            .wait_workflow::<Counter>(
                &db::TaskId {
                    state_type: InitializerState::STATE_TYPE.into(),
                    state_ref: reference,
                    task_uuid: vec![0; 16],
                },
                METHOD,
                RESPONSE,
            )
            .await
            .unwrap_err();
        assert_eq!(error.code(), tonic::Code::FailedPrecondition);
        let constructed = Arc::new(AtomicUsize::new(0));
        let callback_constructed = constructed.clone();
        let callback: Arc<ServingInitializeCallback> = Arc::new(move |_| {
            callback_constructed.fetch_add(1, SeqCst);
            Box::pin(async { Ok(()) })
        });
        let error = await_serving_initializer(&callback, context)
            .await
            .unwrap_err();
        assert_eq!(error.code(), tonic::Code::FailedPrecondition);
        assert_eq!(constructed.load(SeqCst), 0);
        assert_eq!(database.admission_rpc_counts(), before);
        assert!(database.store_requests().is_empty());
        assert!(tasks.require_initializer_owner(&actual).is_ok());
        actual.cancel();
        while let Some(result) = supervisor.join_next().await {
            if let Err(status) = result.unwrap() {
                assert_eq!(status.code(), tonic::Code::Cancelled);
            }
        }
        database_server.abort();
    }

    #[test]
    fn dropping_the_callback_lease_revokes_retained_authority() {
        let live = Arc::new(std::sync::atomic::AtomicBool::new(true));
        let lease = ServingInitializeLease(live.clone());
        assert!(live.load(std::sync::atomic::Ordering::Acquire));
        drop(lease);
        assert!(!live.load(std::sync::atomic::Ordering::Acquire));
    }
}
