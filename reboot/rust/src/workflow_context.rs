include!("workflow_at_most_once.rs");

async fn workflow_reader_lease(
    gate: &crate::runtime::ActorGate,
    revisions: &mut tokio::sync::watch::Receiver<(u64, bool)>,
) -> Result<crate::runtime::ExclusiveActorLease, Status> {
    let lease = gate.exclusive().await;
    // A writer can lose its Store ACK while this reader is queued for admission.
    // Recheck under the acquired lease before any scope Load, reader or checkpoint.
    if revisions.borrow_and_update().1 {
        return Err(Status::unavailable("actor commit outcome uncertain"));
    }
    Ok(lease)
}
#[cfg(test)]
mod loop_decision_admission_tests {
    use super::*;
    #[tokio::test]
    async fn queued_reader_cannot_cross_a_preceding_uncertain_commit() {
        let gate = crate::runtime::ActorGate::new();
        let writer = gate.exclusive().await;
        let mut revisions = gate.committed_revisions();
        assert!(!revisions.borrow_and_update().1);
        let reader = workflow_reader_lease(&gate, &mut revisions);
        tokio::pin!(reader);
        std::future::poll_fn(|cx| match reader.as_mut().poll(cx) {
            std::task::Poll::Pending => std::task::Poll::Ready(()),
            std::task::Poll::Ready(_) => panic!("reader bypassed held writer admission"),
        })
        .await;
        drop(gate.commit_attempt());
        drop(writer);
        let error = match reader.await {
            Err(error) => error,
            Ok(_) => panic!("reader admitted after preceding uncertain commit"),
        };
        assert_eq!(error.code(), tonic::Code::Unavailable);
        // The failed admission itself must release its owned lease.
        tokio::time::timeout(std::time::Duration::from_secs(1), gate.exclusive())
            .await
            .unwrap();
    }
}
#[cfg(test)]
mod workflow_admission_tests {
    use super::*;
    use crate::runtime::DurableStateDeclaration;
    struct D;
    impl crate::runtime::DurableStateDeclaration for D {
        type State = crate::proto::Counter;
        const STATE_TYPE: &'static str = "tests.reboot.protoc.Counter";
    }
    #[tokio::test]
    async fn registered_scheduling_policy_observes_raw_state_and_cancel_releases_lease() {
        use crate::ExternalContext;
        use crate::auth::*;
        use crate::runtime::test_support::start_database;
        use prost::Message;
        struct Policy {
            park: bool,
            calls: std::sync::atomic::AtomicUsize,
            snapshots: std::sync::Mutex<Vec<Option<Vec<u8>>>>,
        }
        impl Authorizer for Policy {
            fn authorize<'a>(
                &'a self,
                context: &'a AuthorizationContext,
                _: Option<&'a Auth>,
                state: Option<&'a [u8]>,
                request: &'a [u8],
            ) -> AuthorizeFuture<'a> {
                assert_eq!(request, crate::proto::Counter { value: 7 }.encode_to_vec());
                assert_eq!(context.method, "tests.Service.Step");
                assert_eq!(context.state_type, D::STATE_TYPE);
                assert_eq!(context.headers.state_ref, "workflow-auth");
                self.snapshots
                    .lock()
                    .unwrap()
                    .push(state.map(ToOwned::to_owned));
                Box::pin(async move {
                    let call = self.calls.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
                    if self.park && call == 0 {
                        std::future::pending::<()>().await;
                    }
                    AuthorizationDecision::PermissionDenied {
                        message: "workflow policy denied".into(),
                    }
                })
            }
        }
        for park in [false, true] {
            for raw in [None, Some(vec![255])] {
                let (endpoint, database, server) = start_database().await;
                let store = DatabaseActorStore::connect(&endpoint).await.unwrap();
                let actor = "workflow-auth";
                let method = "tests.Service.Step";
                if let Some(bytes) = &raw {
                    database.seed_actor(D::STATE_TYPE, actor, bytes.clone());
                }
                let tasks = OneShotTasks::new_with_declarations(
                    store.clone(),
                    D::STATE_TYPE.into(),
                    actor.into(),
                    Binding(true),
                    vec![TaskMethodDeclaration::new::<
                        D,
                        crate::proto::Counter,
                        crate::proto::Counter,
                    >(method, "type.googleapis.com/Counter", vec![])
                    .workflow_writer_step()],
                )
                .unwrap();
                let _owner = DispatchOwner::claim(tasks.clone()).unwrap();
                *tasks.inner.recovery_request.lock().unwrap() = Some(db::RecoverRequest::default());
                tasks
                    .inner
                    .active
                    .store(true, std::sync::atomic::Ordering::Release);
                let probe = Arc::new(Policy {
                    park,
                    calls: std::sync::atomic::AtomicUsize::new(0),
                    snapshots: std::sync::Mutex::new(Vec::new()),
                });
                let policy = AuthorizationPolicy::new(None, Some(probe.clone()));
                // Rich failed Load must never enter policy or leak sidecar diagnostics.
                for code in [tonic::Code::Internal, tonic::Code::Unavailable] {
                    let mut fault =
                        Status::with_details(code, "private-sidecar-path", vec![1, 2, 3].into());
                    fault
                        .metadata_mut()
                        .insert("x-private-sidecar", "secret".parse().unwrap());
                    database.fail_actor_load(fault);
                    let before = database.admission_rpc_counts();
                    let error = store.workflow_scheduling_writer::<D, crate::proto::Counter, crate::proto::Counter, _>(method, &policy, Some(&tasks), ExternalContext::new(actor).writer_with_key(crate::proto::Counter { value: 7 }, uuid::Uuid::from_u128(9400)).unwrap(), |_, _, _| Box::pin(async { panic!("failed Load invoked handler") })).await.unwrap_err();
                    assert_eq!(
                        error.code(),
                        if code == tonic::Code::Unavailable {
                            code
                        } else {
                            tonic::Code::PermissionDenied
                        }
                    );
                    assert_eq!(error.message(), "authorization state unavailable");
                    assert!(error.details().is_empty());
                    assert!(error.metadata().get("x-private-sidecar").is_none());
                    assert_eq!(probe.calls.load(std::sync::atomic::Ordering::SeqCst), 0);
                    let after = database.admission_rpc_counts();
                    assert_eq!(after.0 - before.0, 1);
                    assert_eq!(after.1, before.1);
                }
                struct Reject;
                impl TokenVerifier for Reject {
                    fn verify<'a>(
                        &'a self,
                        _: &'a AuthorizationContext,
                        _: Option<&'a str>,
                    ) -> VerifyFuture<'a> {
                        Box::pin(async {
                            TokenVerification::Unauthenticated {
                                message: "workflow credential rejected".into(),
                            }
                        })
                    }
                }
                for configured in [false, true] {
                    let rejected = AuthorizationPolicy::new(
                        Some(Arc::new(Reject)),
                        if configured {
                            Some(probe.clone())
                        } else {
                            None
                        },
                    );
                    let before = database.admission_rpc_counts();
                    let error = store.workflow_scheduling_writer::<D, crate::proto::Counter, crate::proto::Counter, _>(method, &rejected, Some(&tasks), ExternalContext::new(actor).writer_with_key(crate::proto::Counter { value: 7 }, uuid::Uuid::from_u128(9400)).unwrap(), |_, _, _| Box::pin(async { panic!("rejected verifier invoked handler") })).await.unwrap_err();
                    assert_eq!(error.code(), tonic::Code::Unauthenticated);
                    assert_eq!(error.message(), "workflow credential rejected");
                    assert_eq!(database.admission_rpc_counts(), before);
                    assert_eq!(probe.calls.load(std::sync::atomic::Ordering::SeqCst), 0);
                }
                database.clear_actor_load_failure();
                let before = database.admission_rpc_counts();
                for attempt in 0..2 {
                    let future = store.workflow_scheduling_writer::<D, crate::proto::Counter, crate::proto::Counter, _>(method, &policy, Some(&tasks), ExternalContext::new(actor).writer_with_key(crate::proto::Counter { value: 7 }, uuid::Uuid::from_u128(9400)).unwrap(), |_, _, _| Box::pin(async { panic!("pre-Allow failure invoked handler") }));
                    let result =
                        tokio::time::timeout(std::time::Duration::from_millis(100), future).await;
                    if park && attempt == 0 {
                        assert!(result.is_err());
                    } else {
                        let error = result
                            .expect("policy cancellation must release lease")
                            .unwrap_err();
                        assert_eq!(error.code(), tonic::Code::PermissionDenied);
                        assert_eq!(error.message(), "workflow policy denied");
                    }
                    assert_eq!(
                        probe.calls.load(std::sync::atomic::Ordering::SeqCst),
                        attempt + 1
                    );
                    assert!(tasks.workflow_running_admission().is_ok());
                    assert!(!*tasks.inner.uncertain.borrow());
                }
                assert_eq!(*probe.snapshots.lock().unwrap(), vec![raw.clone(), raw]);
                let after = database.admission_rpc_counts();
                assert_eq!(after.0 - before.0, 2);
                assert_eq!(after.1, before.1);
                assert!(database.store_requests().is_empty());
                assert!(database.create_requests().is_empty());
                server.abort();
            }
        }
    }

    struct Binding(bool);
    #[tonic::async_trait]
    impl ReaderTaskBinding for Binding {
        fn validate(&self, _: &db::Task) -> Result<(), Status> {
            Ok(())
        }
        fn validate_error(&self, _: &db::Task, _: &prost_types::Any) -> Result<(), Status> {
            Ok(())
        }
        fn writer_capable(&self) -> bool {
            self.0
        }
        fn is_writer(&self, _: &db::Task) -> bool {
            self.0
        }
        async fn execute(&self, _: &db::Task) -> Result<prost_types::Any, Status> {
            Err(Status::failed_precondition("not reader"))
        }
    }
    #[test]
    fn retry_requires_clean_private_evidence_and_explicit_local_disposition() {
        let attempt = WorkflowAttempt::default();
        assert!(attempt.clean());
        let transport = Status::from(std::io::Error::new(
            std::io::ErrorKind::BrokenPipe,
            "real IO transport conversion",
        ));
        assert_eq!(transport.code(), tonic::Code::Internal);
        assert!(matches!(
            WorkflowBodyError::from(transport),
            WorkflowBodyError::Failed(_)
        ));
        for code in [
            tonic::Code::Cancelled,
            tonic::Code::DeadlineExceeded,
            tonic::Code::Unavailable,
            tonic::Code::Unknown,
            tonic::Code::Aborted,
            tonic::Code::InvalidArgument,
            tonic::Code::FailedPrecondition,
        ] {
            assert!(matches!(
                WorkflowBodyError::from(Status::new(code, "not local")),
                WorkflowBodyError::Failed(_)
            ));
        }
        let operation = attempt.operation();
        assert!(!attempt.clean());
        drop(operation); // failed, cancelled or swallowed framework operation
        assert!(!attempt.clean());
    }
    #[tokio::test]
    async fn declared_writer_checkpoint_requires_exact_descriptor_and_clean_serial_attempt() {
        let tasks = OneShotTasks::new_with_declarations(
            DatabaseActorStore::connect_lazy("http://127.0.0.1:1").unwrap(),
            D::STATE_TYPE.into(),
            "actor".into(),
            Binding(true),
            vec![
                TaskMethodDeclaration::new::<D, crate::proto::Counter, crate::proto::Counter>(
                    "tests.Service.Step",
                    "type.googleapis.com/Counter",
                    vec![DeclaredTaskError::new::<crate::proto::Counter>(
                        "type.googleapis.com/tests.Rejected",
                    )],
                )
                .workflow_writer_step(),
            ],
        )
        .unwrap();
        let attempt = WorkflowAttempt::default();
        let task = db::Task::default();
        let cancel = RecoveryCancellation::new();
        let context = WorkflowContext {
            tasks: &tasks,
            task: task.clone(),
            cancel: &cancel,
            generation: Arc::new(()),
            attempt: &attempt,
            iteration: None,
            parents: Vec::new(),
        };
        let error = |url: &str, value: Vec<u8>| prost_types::Any {
            type_url: "type.googleapis.com/google.rpc.Status".into(),
            value: googleapis_tonic_google_rpc::google::rpc::Status {
                code: tonic::Code::Unknown as i32,
                message: "declined".into(),
                details: vec![prost_types::Any {
                    type_url: url.into(),
                    value,
                }],
            }
            .encode_to_vec(),
        };
        let valid = error(
            "type.googleapis.com/tests.Rejected",
            crate::proto::Counter::default().encode_to_vec(),
        );
        assert!(
            context
                .validate_writer_step_error("tests.Service.Step", &valid)
                .is_err()
        );
        let operation = attempt.operation();
        context
            .validate_writer_step_error("tests.Service.Step", &valid)
            .unwrap();
        assert!(
            context
                .validate_writer_step_error("tests.Service.Foreign", &valid)
                .is_err()
        );
        assert!(
            context
                .validate_writer_step_error(
                    "tests.Service.Step",
                    &error("type.googleapis.com/tests.Foreign", vec![])
                )
                .is_err()
        );
        assert!(
            context
                .validate_writer_step_error(
                    "tests.Service.Step",
                    &error("type.googleapis.com/tests.Rejected", vec![255])
                )
                .is_err()
        );
        let peer = attempt.operation();
        assert!(
            context
                .validate_writer_step_error("tests.Service.Step", &valid)
                .is_err()
        );
        peer.acknowledged();
        let failed = attempt.operation();
        drop(failed);
        assert!(
            context
                .validate_writer_step_error("tests.Service.Step", &valid)
                .is_err()
        );
        operation.acknowledged();
    }
    #[tokio::test]
    async fn declared_reader_checkpoint_requires_exact_descriptor_and_clean_serial_attempt() {
        let tasks = OneShotTasks::new_with_declarations(
            DatabaseActorStore::connect_lazy("http://127.0.0.1:1").unwrap(),
            D::STATE_TYPE.into(),
            "actor".into(),
            Binding(true),
            vec![
                TaskMethodDeclaration::new::<D, crate::proto::Counter, crate::proto::Counter>(
                    "tests.Service.Step",
                    "type.googleapis.com/Counter",
                    vec![DeclaredTaskError::new::<crate::proto::Counter>(
                        "type.googleapis.com/tests.Rejected",
                    )],
                )
                .workflow_reader_wait(),
            ],
        )
        .unwrap();
        let attempt = WorkflowAttempt::default();
        let task = db::Task::default();
        let cancel = RecoveryCancellation::new();
        let context = WorkflowContext {
            tasks: &tasks,
            task: task.clone(),
            cancel: &cancel,
            generation: Arc::new(()),
            attempt: &attempt,
            iteration: None,
            parents: Vec::new(),
        };
        let error = |url: &str, value: Vec<u8>| prost_types::Any {
            type_url: "type.googleapis.com/google.rpc.Status".into(),
            value: googleapis_tonic_google_rpc::google::rpc::Status {
                code: tonic::Code::Unknown as i32,
                message: "declined".into(),
                details: vec![prost_types::Any {
                    type_url: url.into(),
                    value,
                }],
            }
            .encode_to_vec(),
        };
        let valid = error(
            "type.googleapis.com/tests.Rejected",
            crate::proto::Counter::default().encode_to_vec(),
        );
        assert!(
            context
                .validate_reader_step_error("tests.Service.Step", &valid)
                .is_err()
        );
        let operation = attempt.operation();
        context
            .validate_reader_step_error("tests.Service.Step", &valid)
            .unwrap();
        assert!(
            context
                .validate_reader_step_error("tests.Service.Foreign", &valid)
                .is_err()
        );
        assert!(
            context
                .validate_reader_step_error(
                    "tests.Service.Step",
                    &error("type.googleapis.com/tests.Foreign", vec![])
                )
                .is_err()
        );
        assert!(
            context
                .validate_reader_step_error(
                    "tests.Service.Step",
                    &error("type.googleapis.com/tests.Rejected", vec![255])
                )
                .is_err()
        );
        let saved = ReaderOutcomeCheckpoint {
            response_type: "type.googleapis.com/Counter".into(),
            outcome: Some(reader_outcome_checkpoint::Outcome::Error(valid.clone())),
        };
        context
            .validate_reader_outcome(
                "tests.Service.Step",
                "type.googleapis.com/Counter",
                &saved.encode_to_vec(),
            )
            .unwrap();
        assert!(
            context
                .validate_reader_outcome(
                    "tests.Service.Step",
                    "type.googleapis.com/Foreign",
                    &saved.encode_to_vec()
                )
                .is_err()
        );
        assert!(
            context
                .validate_reader_outcome(
                    "tests.Service.Step",
                    "type.googleapis.com/Counter",
                    &ReaderOutcomeCheckpoint {
                        response_type: "type.googleapis.com/Counter".into(),
                        outcome: None
                    }
                    .encode_to_vec()
                )
                .is_err()
        );
        assert!(
            context
                .validate_reader_outcome(
                    "tests.Service.Step",
                    "type.googleapis.com/Counter",
                    &[255]
                )
                .is_err()
        );
        let peer = attempt.operation();
        assert!(
            context
                .validate_reader_step_error("tests.Service.Step", &valid)
                .is_err()
        );
        peer.acknowledged();
        let failed = attempt.operation();
        drop(failed);
        assert!(
            context
                .validate_reader_step_error("tests.Service.Step", &valid)
                .is_err()
        );
        operation.acknowledged();
    }
    #[tokio::test]
    async fn successful_finish_rejects_failed_dropped_and_live_framework_work_before_load() {
        let tasks = OneShotTasks::new(
            DatabaseActorStore::connect_lazy("http://127.0.0.1:1").unwrap(),
            D::STATE_TYPE.into(),
            "actor".into(),
            Binding(true),
        )
        .unwrap();
        for mode in 0..3 {
            let attempt = WorkflowAttempt::default();
            let work = attempt.operation();
            let live = match mode {
                0 => {
                    work.acknowledged();
                    attempt
                        .failed
                        .store(true, std::sync::atomic::Ordering::Release);
                    None
                }
                1 => {
                    drop(work);
                    None
                }
                _ => Some(work),
            };
            let task = db::Task::default();
            let cancel = RecoveryCancellation::new();
            let context = WorkflowContext {
                tasks: &tasks,
                task: task.clone(),
                cancel: &cancel,
                generation: Arc::new(()),
                attempt: &attempt,
                iteration: None,
                parents: Vec::new(),
            };
            let error = context
                .finish::<D, crate::proto::Counter, crate::proto::Counter>(
                    "type.googleapis.com/Counter",
                    crate::proto::Counter::default(),
                )
                .await
                .err()
                .expect("tainted success rejected");
            assert_eq!(error.code(), tonic::Code::FailedPrecondition);
            assert_eq!(
                error.message(),
                "unclean workflow attempt cannot complete successfully"
            );
            drop(live);
        }
    }
    #[tokio::test]
    async fn finite_checkpoint_namespaces_are_disjoint_and_iteration_errors_fence_retry() {
        let store = DatabaseActorStore::connect_lazy("http://127.0.0.1:1").unwrap();
        let tasks =
            OneShotTasks::new(store, D::STATE_TYPE.into(), "actor".into(), Binding(true)).unwrap();
        assert!(tasks.set_max_live_deliveries(0).is_err());
        assert!(tasks.set_max_live_deliveries(1025).is_err());
        tasks.set_max_live_deliveries(2).unwrap();
        let wait_owner = OneShotTasks::new_with_declarations(
            tasks.inner.store.clone(),
            D::STATE_TYPE.into(),
            "actor".into(),
            Binding(false),
            vec![
                TaskMethodDeclaration::new::<D, crate::proto::Counter, crate::proto::Counter>(
                    "tests.Service.Query",
                    "type.googleapis.com/Counter",
                    vec![],
                )
                .workflow_reader_wait(),
            ],
        )
        .unwrap();
        let wait_task = db::Task {
            task_id: Some(db::TaskId {
                state_type: D::STATE_TYPE.into(),
                state_ref: "actor".into(),
                task_uuid: uuid::Uuid::new_v4().as_bytes().to_vec(),
            }),
            method: "Query".into(),
            status: db::task::Status::Pending as i32,
            ..Default::default()
        };
        assert_eq!(
            wait_owner.validate(&[wait_task]).unwrap_err().code(),
            tonic::Code::FailedPrecondition
        );
        let owner = DispatchOwner::claim(tasks.clone()).unwrap();
        assert!(tasks.set_max_live_deliveries(3).is_err());
        drop(owner);
        let task = db::Task::default();
        let cancel = RecoveryCancellation::new();
        let attempt = WorkflowAttempt::default();
        let context = WorkflowContext {
            tasks: &tasks,
            task: task.clone(),
            cancel: &cancel,
            generation: Arc::new(()),
            attempt: &attempt,
            iteration: None,
            parents: Vec::new(),
        };
        let seed = uuid::Uuid::new_v4();
        let scoped = context.iteration("a:1", 0, 3).unwrap();
        let legacy_alias = scoped.checkpoint_alias("gate");
        let keys = [
            context.checkpoint_key(seed, &legacy_alias, None),
            scoped.checkpoint_key(seed, "gate", None),
            scoped.checkpoint_key(seed, "gate", Some("condition.v1")),
            scoped.checkpoint_decision_key(seed, "gate"),
            scoped.checkpoint_reader_outcome_key(seed, "gate"),
            context.checkpoint_reader_outcome_key(seed, "gate"),
            context.checkpoint_key(seed, "gate", Some("condition.v1")),
            context
                .iteration("a", 1, 3)
                .unwrap()
                .checkpoint_key(seed, "gate", None),
            context
                .iteration("a:1", 1, 3)
                .unwrap()
                .checkpoint_key(seed, "gate", None),
        ];
        assert_eq!(keys.iter().collect::<HashSet<_>>().len(), keys.len());
        assert_eq!(
            context.checkpoint_key(seed, "first", None),
            uuid::Uuid::new_v5(&seed, b"first")
        );
        assert_eq!(
            scoped.checkpoint_key(seed, "gate", Some("condition.v1")),
            scoped.checkpoint_key(seed, "gate", Some("changed.v2")),
            "condition changes must collide at same checkpoint key and fail fingerprint validation, never create a fresh decision"
        );
        assert!(attempt.clean());
        let nested = scoped.iteration("nested", 0, 2).unwrap();
        let sibling = context
            .iteration("a:1", 1, 3)
            .unwrap()
            .iteration("nested", 0, 2)
            .unwrap();
        let deeper = nested.iteration("third", 0, 1).unwrap();
        let keys = [
            scoped.checkpoint_key(seed, "gate", None),
            nested.checkpoint_key(seed, "gate", None),
            sibling.checkpoint_key(seed, "gate", None),
            deeper.checkpoint_key(seed, "gate", None),
            nested.checkpoint_key(seed, "gate", Some("v1")),
            nested.checkpoint_decision_key(seed, "gate"),
            nested.checkpoint_reader_outcome_key(seed, "gate"),
            context.checkpoint_key(seed, &nested.checkpoint_alias("gate"), None),
        ];
        assert_eq!(keys.iter().collect::<HashSet<_>>().len(), keys.len());
        // Bound changes hit the existing record, not a fresh key. Its complete
        // parent-bound fingerprint then rejects replay before a callback.
        let changed = context
            .iteration("a:1", 0, 4)
            .unwrap()
            .iteration("nested", 0, 2)
            .unwrap();
        assert_eq!(
            nested.checkpoint_key(seed, "gate", None),
            changed.checkpoint_key(seed, "gate", None)
        );
        assert_ne!(
            nested.checkpoint_parent_bounds(),
            changed.checkpoint_parent_bounds()
        );
        assert_eq!(nested.checkpoint_iteration(), Some(0));
        assert_eq!(nested.checkpoint_bound(), 2);
        // Legacy flat key remains byte-for-byte identical.
        let namespace = uuid::Uuid::new_v5(&seed, b"reboot.finite.writer.v1");
        let mut bytes = 3u64.to_be_bytes().to_vec();
        bytes.extend_from_slice(b"a:1");
        bytes.extend_from_slice(&0u64.to_be_bytes());
        bytes.extend_from_slice(&4u64.to_be_bytes());
        bytes.extend_from_slice(b"gate");
        assert_eq!(
            scoped.checkpoint_key(seed, "gate", None),
            uuid::Uuid::new_v5(&namespace, &bytes)
        );
        let max = context
            .iteration("outer", 0, 32)
            .unwrap()
            .iteration("inner", 0, 32)
            .unwrap();
        assert!(max.iteration("one", 0, 1).is_ok());
        let mut deep = context.iteration("level", 0, 1).unwrap();
        for _ in 1..8 {
            deep = deep.iteration("level", 0, 1).unwrap();
        }
        assert!(attempt.clean());
        assert!(deep.iteration("too-deep", 0, 1).is_err());
        assert!(!attempt.clean());
        assert!(max.iteration("overflow", 0, 2).is_err());
        assert!(max.iteration("zero", 0, 0).is_err());
        assert!(max.iteration("index", 1, 1).is_err());
    }
    #[tokio::test]
    async fn declared_workflow_receipt_rejects_foreign_malformed_and_tainted_terminals_before_load()
    {
        use prost::Message;
        let tasks = OneShotTasks::new_with_declarations(
            DatabaseActorStore::connect_lazy("http://127.0.0.1:1").unwrap(),
            D::STATE_TYPE.into(),
            "actor".into(),
            Binding(true),
            vec![
                TaskMethodDeclaration::new::<D, crate::proto::Counter, crate::proto::Counter>(
                    "tests.Service.Run",
                    "type.googleapis.com/Counter",
                    vec![DeclaredTaskError::new::<crate::proto::Counter>(
                        "type.googleapis.com/tests.Rejected",
                    )],
                )
                .workflow(),
            ],
        )
        .unwrap();
        let task = db::Task {
            method: "Run".into(),
            ..Default::default()
        };
        let cancel = RecoveryCancellation::new();
        let declared = |url: &str, payload: Vec<u8>| {
            let rich = googleapis_tonic_google_rpc::google::rpc::Status {
                code: tonic::Code::Unknown as i32,
                message: "rejected".into(),
                details: vec![prost_types::Any {
                    type_url: url.into(),
                    value: payload,
                }],
            };
            prost_types::Any {
                type_url: "type.googleapis.com/google.rpc.Status".into(),
                value: rich.encode_to_vec(),
            }
        };
        for error in [
            prost_types::Any::default(),
            declared("type.googleapis.com/tests.Foreign", vec![]),
            declared("type.googleapis.com/tests.Rejected", vec![255]),
        ] {
            let attempt = WorkflowAttempt::default();
            let context = WorkflowContext {
                tasks: &tasks,
                task: task.clone(),
                cancel: &cancel,
                generation: Arc::new(()),
                attempt: &attempt,
                iteration: None,
                parents: Vec::new(),
            };
            assert_eq!(
                context
                    .body_failed(WorkflowBodyError::Declared(error))
                    .await
                    .err()
                    .unwrap()
                    .code(),
                tonic::Code::DataLoss
            );
            assert!(
                !attempt.clean(),
                "failed framework validation must fence resumption"
            );
        }
        let error = declared(
            "type.googleapis.com/tests.Rejected",
            crate::proto::Counter { value: 1 }.encode_to_vec(),
        );
        for scoped in [false, true] {
            let attempt = WorkflowAttempt::default();
            if !scoped {
                drop(attempt.operation());
            }
            let context = WorkflowContext {
                tasks: &tasks,
                task: task.clone(),
                cancel: &cancel,
                generation: Arc::new(()),
                attempt: &attempt,
                iteration: scoped.then(|| ("loop".into(), 0, 1)),
                parents: Vec::new(),
            };
            let denied = context
                .body_failed(WorkflowBodyError::Declared(error.clone()))
                .await
                .err()
                .unwrap();
            assert_eq!(denied.code(), tonic::Code::FailedPrecondition);
            assert_eq!(
                denied.message(),
                "declared workflow terminal requires clean outer scope"
            );
        }
        let status = crate::declared_error_status(
            tonic::Code::Unknown,
            "rich but not a typed disposition",
            "type.googleapis.com/tests.Rejected",
            &crate::proto::Counter { value: 1 },
        );
        assert!(
            matches!(
                WorkflowBodyError::from(status),
                WorkflowBodyError::Failed(_)
            ),
            "a rich Status is not typed business-terminal authority"
        );
    }
    #[test]
    fn acknowledged_framework_operations_do_not_taint_body_resumption() {
        let attempt = WorkflowAttempt::default();
        attempt.operation().acknowledged();
        assert!(attempt.clean());
    }
    #[tokio::test]
    async fn immutable_workflow_kind_cannot_extend_readonly_or_one_shot_admission() {
        let store = DatabaseActorStore::connect_lazy("http://127.0.0.1:1").unwrap();
        let owner = |writers| {
            OneShotTasks::new_with_declarations(
                store.clone(),
                D::STATE_TYPE.into(),
                "actor".into(),
                Binding(writers),
                vec![
                    TaskMethodDeclaration::new::<D, crate::proto::Counter, crate::proto::Counter>(
                        "tests.Service.Run",
                        "type.googleapis.com/Counter",
                        vec![],
                    )
                    .workflow(),
                ],
            )
            .unwrap()
        };
        let task = db::Task {
            task_id: Some(db::TaskId {
                state_type: D::STATE_TYPE.into(),
                state_ref: "actor".into(),
                task_uuid: uuid::Uuid::new_v4().as_bytes().to_vec(),
            }),
            method: "Run".into(),
            status: db::task::Status::Pending as i32,
            ..Default::default()
        };
        let rw = owner(true);
        assert!(rw.validate(std::slice::from_ref(&task)).is_ok());
        assert!(rw.contains_writer(std::slice::from_ref(&task)));
        assert!(owner(false).validate(std::slice::from_ref(&task)).is_err());
        for vector in 0..6 {
            let mut bad = task.clone();
            match vector {
                0 => bad.iteration = 1,
                1 => bad.status = db::task::Status::Completed as i32,
                2 => bad.request = vec![255],
                3 => bad.task_id.as_mut().unwrap().state_type = "other".into(),
                4 => bad.task_id.as_mut().unwrap().state_ref = "other".into(),
                _ => {
                    bad.response_or_error =
                        Some(db::task::ResponseOrError::Response(Default::default()))
                }
            };
            assert!(rw.validate(&[bad]).is_err(), "vector {vector}");
        }
        let legacy_reader = OneShotTasks::new_with_declarations(
            store.clone(),
            D::STATE_TYPE.into(),
            "actor".into(),
            Binding(true),
            vec![TaskMethodDeclaration::new::<
                D,
                crate::proto::Counter,
                crate::proto::Counter,
            >(
                "tests.Service.Apply",
                "type.googleapis.com/Counter",
                vec![],
            )],
        )
        .unwrap();
        assert!(
            legacy_reader
                .validate_workflow_writer::<D, crate::proto::Counter, crate::proto::Counter>(
                    "tests.Service.Apply"
                )
                .is_err()
        );
        assert!(rw.workflow_running_admission().is_err());
        assert!(
            rw.validate_workflow_writer::<D, crate::proto::Counter, crate::proto::Counter>(
                "tests.Service.Run"
            )
            .is_err()
        );
    }
}

// Per-body private evidence, never supplied by the handler. Every framework
// operation must finish successfully; a failed or dropped operation irreversibly
// fences resumption, even when the body catches it and returns another error.
#[derive(Default)]
struct WorkflowAttempt {
    failed: std::sync::atomic::AtomicBool,
    active: std::sync::atomic::AtomicUsize,
    admission: std::sync::Mutex<()>,
    serial_reader: std::sync::atomic::AtomicBool,
    cursor_used: std::sync::atomic::AtomicBool,
    cursor_advanced: std::sync::atomic::AtomicBool,
    cursor_closed: std::sync::atomic::AtomicBool,
}
impl WorkflowAttempt {
    fn operation(&self) -> WorkflowAttemptOperation<'_> {
        self.tracked_operation(true)
    }
    // Authority checks are nested framework work inside a helper, not a new
    // competing helper. Their failure/drop evidence must still taint the attempt.
    fn scope_operation(&self) -> WorkflowAttemptOperation<'_> {
        self.tracked_operation(false)
    }
    fn tracked_operation(&self, competing: bool) -> WorkflowAttemptOperation<'_> {
        let _admission = self
            .admission
            .lock()
            .expect("workflow operation admission poisoned");
        if competing
            && self
                .serial_reader
                .load(std::sync::atomic::Ordering::Acquire)
        {
            // A competing helper must not make a saved reader business outcome
            // catchable, even if it finishes before the reader's post-Store check.
            self.failed
                .store(true, std::sync::atomic::Ordering::Release);
        }
        self.active
            .fetch_add(1, std::sync::atomic::Ordering::AcqRel);
        WorkflowAttemptOperation {
            attempt: self,
            acknowledged: false,
            serial: false,
            released: false,
        }
    }
    fn serial_reader_operation(&self) -> Result<WorkflowAttemptOperation<'_>, Status> {
        let _admission = self
            .admission
            .lock()
            .expect("workflow operation admission poisoned");
        if self.failed.load(std::sync::atomic::Ordering::Acquire)
            || self.active.load(std::sync::atomic::Ordering::Acquire) != 0
        {
            self.failed
                .store(true, std::sync::atomic::Ordering::Release);
            return Err(Status::failed_precondition(
                "declared reader requires exclusive serial attempt admission",
            ));
        }
        self.active.store(1, std::sync::atomic::Ordering::Release);
        self.serial_reader
            .store(true, std::sync::atomic::Ordering::Release);
        Ok(WorkflowAttemptOperation {
            attempt: self,
            acknowledged: false,
            serial: true,
            released: false,
        })
    }
    fn clean(&self) -> bool {
        !self.failed.load(std::sync::atomic::Ordering::Acquire)
            && self.active.load(std::sync::atomic::Ordering::Acquire) == 0
    }
}
struct WorkflowAttemptOperation<'a> {
    attempt: &'a WorkflowAttempt,
    acknowledged: bool,
    serial: bool,
    released: bool,
}
impl WorkflowAttemptOperation<'_> {
    fn acknowledged(mut self) {
        self.acknowledged = true;
    }
    fn acknowledged_serial(mut self) -> Result<(), Status> {
        let _admission = self
            .attempt
            .admission
            .lock()
            .expect("workflow operation admission poisoned");
        if !self.serial
            || self
                .attempt
                .failed
                .load(std::sync::atomic::Ordering::Acquire)
            || self
                .attempt
                .active
                .load(std::sync::atomic::Ordering::Acquire)
                != 1
        {
            return Err(Status::failed_precondition(
                "declared reader serial admission was interrupted",
            ));
        }
        // Validate and release atomically with respect to helper creation. A new
        // operation starts either inside this reservation (and taints it), or
        // after this operation is complete. No check/acknowledge gap.
        self.attempt
            .active
            .fetch_sub(1, std::sync::atomic::Ordering::AcqRel);
        self.attempt
            .serial_reader
            .store(false, std::sync::atomic::Ordering::Release);
        self.acknowledged = true;
        self.released = true;
        Ok(())
    }
}
impl Drop for WorkflowAttemptOperation<'_> {
    fn drop(&mut self) {
        if self.released {
            return;
        }
        let _admission = self
            .attempt
            .admission
            .lock()
            .expect("workflow operation admission poisoned");
        if !self.acknowledged {
            self.attempt
                .failed
                .store(true, std::sync::atomic::Ordering::Release);
        }
        self.attempt
            .active
            .fetch_sub(1, std::sync::atomic::Ordering::AcqRel);
        if self.serial {
            self.attempt
                .serial_reader
                .store(false, std::sync::atomic::Ordering::Release);
        }
    }
}
#[cfg(test)]
mod declared_reader_serial_tests {
    use super::*;
    #[test]
    fn reservation_rejects_preexisting_and_transient_overlapping_helpers() {
        let attempt = WorkflowAttempt::default();
        let peer = attempt.operation();
        assert!(attempt.serial_reader_operation().is_err());
        peer.acknowledged();
        assert!(!attempt.clean());
        let attempt = WorkflowAttempt::default();
        let reader = attempt.serial_reader_operation().unwrap();
        let peer = attempt.operation();
        peer.acknowledged();
        assert!(reader.acknowledged_serial().is_err());
        assert!(!attempt.clean());
        assert_eq!(attempt.active.load(std::sync::atomic::Ordering::Acquire), 0);
        assert!(
            !attempt
                .serial_reader
                .load(std::sync::atomic::Ordering::Acquire)
        );
    }
    #[test]
    fn nested_authority_checks_preserve_failure_and_overlap_evidence() {
        let attempt = WorkflowAttempt::default();
        let reader = attempt.serial_reader_operation().unwrap();
        attempt.scope_operation().acknowledged();
        reader.acknowledged_serial().unwrap();
        assert!(attempt.clean());
        let reader = attempt.serial_reader_operation().unwrap();
        drop(attempt.scope_operation());
        assert!(reader.acknowledged_serial().is_err());
        assert!(!attempt.clean());
        assert_eq!(attempt.active.load(std::sync::atomic::Ordering::Acquire), 0);
        let attempt = WorkflowAttempt::default();
        let reader = attempt.serial_reader_operation().unwrap();
        let authority = attempt.scope_operation();
        attempt.operation().acknowledged();
        authority.acknowledged();
        assert!(reader.acknowledged_serial().is_err());
        assert!(!attempt.clean());
        assert_eq!(attempt.active.load(std::sync::atomic::Ordering::Acquire), 0);
    }
    #[test]
    fn complete_serial_reader_releases_admission_without_tainting_later_work() {
        let attempt = WorkflowAttempt::default();
        attempt
            .serial_reader_operation()
            .unwrap()
            .acknowledged_serial()
            .unwrap();
        assert!(attempt.clean());
        attempt.operation().acknowledged();
        assert!(attempt.clean());
        drop(attempt.serial_reader_operation().unwrap());
        assert!(!attempt.clean());
        assert_eq!(attempt.active.load(std::sync::atomic::Ordering::Acquire), 0);
    }
}

#[cfg(test)]
mod cursor_iteration_tests {
    use super::*;
    use crate::runtime::DurableStateDeclaration;
    struct D;
    impl DurableStateDeclaration for D {
        type State = crate::proto::Counter;
        const STATE_TYPE: &'static str = "tests.reboot.protoc.Counter";
    }
    struct Binding(bool);
    #[tonic::async_trait]
    impl ReaderTaskBinding for Binding {
        fn validate(&self, _: &db::Task) -> Result<(), Status> {
            Ok(())
        }
        fn validate_error(&self, _: &db::Task, _: &prost_types::Any) -> Result<(), Status> {
            Ok(())
        }
        fn writer_capable(&self) -> bool {
            self.0
        }
        fn is_writer(&self, _: &db::Task) -> bool {
            self.0
        }
        async fn execute(&self, _: &db::Task) -> Result<prost_types::Any, Status> {
            Err(Status::failed_precondition("not reader"))
        }
    }
    fn make_context(
        iteration: u64,
    ) -> (
        OneShotTasks,
        db::Task,
        RecoveryCancellation,
        WorkflowAttempt,
    ) {
        let tasks = OneShotTasks::new_with_declarations(
            DatabaseActorStore::connect_lazy("http://127.0.0.1:1").unwrap(),
            D::STATE_TYPE.into(),
            "actor".into(),
            Binding(true),
            vec![
                TaskMethodDeclaration::new::<D, crate::proto::Counter, crate::proto::Counter>(
                    "tests.Service.Run",
                    "type.googleapis.com/Counter",
                    vec![],
                )
                .workflow_cursor("unbounded", 1),
            ],
        )
        .unwrap();
        let task = db::Task {
            task_id: Some(db::TaskId {
                state_type: D::STATE_TYPE.into(),
                state_ref: "actor".into(),
                task_uuid: uuid::Uuid::new_v4().as_bytes().to_vec(),
            }),
            method: "Run".into(),
            iteration,
            ..Default::default()
        };
        (
            tasks,
            task,
            RecoveryCancellation::new(),
            WorkflowAttempt::default(),
        )
    }
    #[tokio::test]
    async fn cursor_checkpoint_keys_remain_distinct_across_extreme_iterations() {
        let seed = uuid::Uuid::new_v4();
        let alias = "effect";
        let mut keys = std::collections::HashSet::new();
        for iteration in [0u64, 1, 1024, u64::MAX - 1, u64::MAX] {
            let (tasks, task, cancel, attempt) = make_context(iteration);
            let context = WorkflowContext {
                tasks: &tasks,
                task,
                cancel: &cancel,
                generation: Arc::new(()),
                attempt: &attempt,
                iteration: Some(("unbounded".into(), iteration, u64::MAX)),
                parents: Vec::new(),
            };
            assert!(context.cursor_scope().is_some());
            assert_eq!(context.checkpoint_iteration(), Some(iteration));
            let key = context.checkpoint_key(seed, alias, None);
            assert!(
                keys.insert(key),
                "cursor checkpoint key collision at iteration {iteration}"
            );
            let decision = context.checkpoint_decision_key(seed, alias);
            assert!(
                keys.insert(decision),
                "cursor decision key collision at iteration {iteration}"
            );
        }
    }
    #[tokio::test]
    async fn cursor_key_is_stable_for_replay_at_large_iteration() {
        let seed = uuid::Uuid::new_v4();
        let (tasks1, task1, cancel1, attempt1) = make_context(1024);
        let first = WorkflowContext {
            tasks: &tasks1,
            task: task1,
            cancel: &cancel1,
            generation: Arc::new(()),
            attempt: &attempt1,
            iteration: Some(("unbounded".into(), 1024, u64::MAX)),
            parents: Vec::new(),
        };
        let (tasks2, task2, cancel2, attempt2) = make_context(1024);
        let second = WorkflowContext {
            tasks: &tasks2,
            task: task2,
            cancel: &cancel2,
            generation: Arc::new(()),
            attempt: &attempt2,
            iteration: Some(("unbounded".into(), 1024, u64::MAX)),
            parents: Vec::new(),
        };
        assert_eq!(
            first.checkpoint_key(seed, "effect", None),
            second.checkpoint_key(seed, "effect", None),
            "cursor key must be stable across replay"
        );
    }
}

#[cfg(test)]
mod idempotency_key_scope_tests {
    use super::*;
    use crate::runtime::DurableStateDeclaration;
    struct D;
    impl DurableStateDeclaration for D {
        type State = crate::proto::Counter;
        const STATE_TYPE: &'static str = "tests.reboot.protoc.Counter";
    }
    struct Binding(bool);
    #[tonic::async_trait]
    impl ReaderTaskBinding for Binding {
        fn validate(&self, _: &db::Task) -> Result<(), Status> {
            Ok(())
        }
        fn validate_error(&self, _: &db::Task, _: &prost_types::Any) -> Result<(), Status> {
            Ok(())
        }
        fn writer_capable(&self) -> bool {
            self.0
        }
        fn is_writer(&self, _: &db::Task) -> bool {
            self.0
        }
        async fn execute(&self, _: &db::Task) -> Result<prost_types::Any, Status> {
            Err(Status::failed_precondition("not reader"))
        }
    }
    fn make_scope_context(
        iteration: u64,
        _bound: u64,
        _parents: Vec<(String, u64, u64)>,
    ) -> (OneShotTasks, db::Task, RecoveryCancellation, WorkflowAttempt) {
        let tasks = OneShotTasks::new_with_declarations(
            DatabaseActorStore::connect_lazy("http://127.0.0.1:1").unwrap(),
            D::STATE_TYPE.into(),
            "actor".into(),
            Binding(true),
            vec![
                TaskMethodDeclaration::new::<D, crate::proto::Counter, crate::proto::Counter>(
                    "tests.Service.Run",
                    "type.googleapis.com/Counter",
                    vec![],
                )
                .workflow_cursor("unbounded", 1),
            ],
        )
        .unwrap();
        let task = db::Task {
            task_id: Some(db::TaskId {
                state_type: D::STATE_TYPE.into(),
                state_ref: "actor".into(),
                task_uuid: uuid::Uuid::new_v4().as_bytes().to_vec(),
            }),
            method: "Run".into(),
            iteration,
            ..Default::default()
        };
        (tasks, task, RecoveryCancellation::new(), WorkflowAttempt::default())
    }
    fn build_context<'a>(
        tasks: &'a OneShotTasks,
        task: db::Task,
        cancel: &'a RecoveryCancellation,
        attempt: &'a WorkflowAttempt,
        iteration: Option<(String, u64, u64)>,
        parents: Vec<(String, u64, u64)>,
    ) -> WorkflowContext<'a> {
        WorkflowContext {
            tasks,
            task,
            cancel,
            generation: Arc::new(()),
            attempt,
            iteration,
            parents,
        }
    }
    #[tokio::test]
    async fn unscoped_key_is_stable_per_alias_and_seed() {
        let seed = uuid::Uuid::new_v4();
        let (tasks, task, cancel, attempt) = make_scope_context(0, 1, Vec::new());
        let first = build_context(&tasks, task.clone(), &cancel, &attempt, None, Vec::new());
        let second = build_context(&tasks, task, &cancel, &attempt, None, Vec::new());
        assert_eq!(
            first.checkpoint_key(seed, "charge", None),
            second.checkpoint_key(seed, "charge", None),
            "unscoped key must be stable for replay"
        );
        assert_ne!(
            first.checkpoint_key(seed, "charge", None),
            first.checkpoint_key(seed, "refund", None),
            "different aliases must not collide"
        );
        let other_seed = uuid::Uuid::new_v4();
        assert_ne!(
            first.checkpoint_key(seed, "charge", None),
            first.checkpoint_key(other_seed, "charge", None),
            "different seeds must not collide"
        );
    }
    #[tokio::test]
    async fn finite_iteration_scopes_keys_per_iteration() {
        let seed = uuid::Uuid::new_v4();
        let alias = "effect";
        let bound = 1024u64;
        let mut keys = std::collections::HashSet::new();
        for index in [0u64, 1, 1023] {
            let (tasks, task, cancel, attempt) = make_scope_context(index, bound, Vec::new());
            let context = build_context(
                &tasks,
                task,
                &cancel,
                &attempt,
                Some(("loop".into(), index, bound)),
                Vec::new(),
            );
            assert!(
                keys.insert(context.checkpoint_key(seed, alias, None)),
                "finite iteration key collision at index {index}"
            );
        }
    }
    #[tokio::test]
    async fn finite_iteration_same_index_same_key() {
        let seed = uuid::Uuid::new_v4();
        let (tasks1, task1, cancel1, attempt1) = make_scope_context(7, 100, Vec::new());
        let first = build_context(
            &tasks1,
            task1,
            &cancel1,
            &attempt1,
            Some(("loop".into(), 7, 100)),
            Vec::new(),
        );
        let (tasks2, task2, cancel2, attempt2) = make_scope_context(7, 100, Vec::new());
        let second = build_context(
            &tasks2,
            task2,
            &cancel2,
            &attempt2,
            Some(("loop".into(), 7, 100)),
            Vec::new(),
        );
        assert_eq!(
            first.checkpoint_key(seed, "effect", None),
            second.checkpoint_key(seed, "effect", None),
            "same finite iteration must produce the same key for replay"
        );
    }
    #[tokio::test]
    async fn cursor_scope_is_distinct_from_finite_scope() {
        let seed = uuid::Uuid::new_v4();
        let (tasks1, task1, cancel1, attempt1) = make_scope_context(5, u64::MAX, Vec::new());
        let cursor = build_context(
            &tasks1,
            task1,
            &cancel1,
            &attempt1,
            Some(("unbounded".into(), 5, u64::MAX)),
            Vec::new(),
        );
        assert!(cursor.cursor_scope().is_some());
        let (tasks2, task2, cancel2, attempt2) = make_scope_context(5, 100, Vec::new());
        let finite = build_context(
            &tasks2,
            task2,
            &cancel2,
            &attempt2,
            Some(("unbounded".into(), 5, 100)),
            Vec::new(),
        );
        assert!(finite.cursor_scope().is_none());
        assert_ne!(
            cursor.checkpoint_key(seed, "effect", None),
            finite.checkpoint_key(seed, "effect", None),
            "cursor and finite scopes must not share checkpoint keys"
        );
    }
    #[tokio::test]
    async fn nested_parent_scopes_are_distinct() {
        let seed = uuid::Uuid::new_v4();
        let alias = "effect";
        let (tasks, task, cancel, attempt) = make_scope_context(3, 10, Vec::new());
        let flat = build_context(
            &tasks,
            task.clone(),
            &cancel,
            &attempt,
            Some(("inner".into(), 3, 10)),
            Vec::new(),
        );
        let nested = build_context(
            &tasks,
            task.clone(),
            &cancel,
            &attempt,
            Some(("inner".into(), 3, 10)),
            vec![("outer".into(), 2, 5)],
        );
        assert_ne!(
            flat.checkpoint_key(seed, alias, None),
            nested.checkpoint_key(seed, alias, None),
            "nested parent scopes must produce distinct keys"
        );
        let different_parent = build_context(
            &tasks,
            task.clone(),
            &cancel,
            &attempt,
            Some(("inner".into(), 3, 10)),
            vec![("outer".into(), 1, 5)],
        );
        assert_ne!(
            nested.checkpoint_key(seed, alias, None),
            different_parent.checkpoint_key(seed, alias, None),
            "different parent indices must produce distinct keys"
        );
    }
}

/// Private, dispatcher-minted workflow authority. Explicit named same-actor
/// typed named writer steps and checkpointed immutable-reader waits. Explicit
/// finite indexed replay scopes and named at-most-once unit external blocks;
/// and a separately declared canonical cursor. Finite scopes are unchanged.
/// Construction is private, even to generated application consumers:
/// ```compile_fail
/// use reboot_rust_schema::one_shot_tasks::WorkflowContext;
/// let context = WorkflowContext { tasks: Default::default(), task: Default::default(), cancel: Default::default(), generation: Default::default() };
/// ```
/// The workflow body does not own an actor lease; each writer step owns one.
pub struct WorkflowContext<'a> {
    tasks: &'a OneShotTasks,
    task: db::Task,
    cancel: &'a RecoveryCancellation,
    generation: Arc<()>,
    attempt: &'a WorkflowAttempt,
    iteration: Option<(String, u64, u64)>,
    parents: Vec<(String, u64, u64)>,
}
/// Consumed private receipt: user callbacks cannot manufacture completion.
/// Explicit body disposition. Status propagation is always nonretryable, even
/// for Internal (which Tonic can produce for real transport errors).
pub enum WorkflowBodyError {
    /// Method-declared business terminal, validated by the immutable descriptor.
    Declared(prost_types::Any),
    Failed(Status),
    /// Opt in only for failed local computation, never transport or external
    /// effects. Runtime evidence still rejects failed/dropped framework work.
    RetryLocal(String),
}
impl From<TaskHandlerError> for WorkflowBodyError {
    fn from(error: TaskHandlerError) -> Self {
        match error {
            TaskHandlerError::Declared(error) => Self::Declared(error),
            TaskHandlerError::Failed(error) => Self::Failed(error),
        }
    }
}
impl From<Status> for WorkflowBodyError {
    fn from(error: Status) -> Self {
        Self::Failed(error)
    }
}
/// Explicit versioned pure-condition contract for a durable typed observation.
pub struct WorkflowWaitName<'a> {
    pub alias: &'a str,
    pub condition: &'a str,
}
pub struct WorkflowReceipt {
    task: db::Task,
    outcome: WorkflowOutcome,
}
enum WorkflowOutcome {
    Terminal(db::task::ResponseOrError),
    PreStoreBodyFailure(Status),
}
#[derive(Clone, prost::Message)]
struct LoopDecisionCheckpoint {
    #[prost(bytes = "vec", tag = "1")]
    response: Vec<u8>,
    #[prost(string, tag = "2")]
    response_type: String,
    #[prost(bool, tag = "3")]
    break_loop: bool,
}
#[derive(Clone, prost::Message)]
pub(crate) struct ReaderOutcomeCheckpoint {
    #[prost(string, tag = "1")]
    response_type: String,
    #[prost(oneof = "reader_outcome_checkpoint::Outcome", tags = "2, 3")]
    outcome: Option<reader_outcome_checkpoint::Outcome>,
}
mod reader_outcome_checkpoint {
    #[derive(Clone, prost::Oneof)]
    pub enum Outcome {
        #[prost(bytes, tag = "2")]
        Response(Vec<u8>),
        #[prost(message, tag = "3")]
        Error(prost_types::Any),
    }
}
impl<'a> WorkflowContext<'a> {
    /// Explicit finite replay scope, not an unbounded Task cursor. Restart replays
    /// the bounded body; acknowledged typed decisions/effects are loaded, never
    /// re-evaluated. Use the same loop name, count, indices and named calls on replay.
    /// At most eight levels and 1024 Cartesian leaf positions are admitted.
    /// Parent and leaf names/indices bind distinct replay identities; all bounds
    /// bind fingerprints. This does not advance the canonical Task cursor.
    pub fn iteration(
        &self,
        alias: &str,
        index: u64,
        count: u64,
    ) -> Result<WorkflowContext<'a>, Status> {
        let operation = self.attempt.operation();
        let mut parents = self.parents.clone();
        if let Some(parent) = &self.iteration {
            parents.push(parent.clone());
        }
        let positions = parents
            .iter()
            .try_fold(count, |total, (_, _, bound)| total.checked_mul(*bound));
        if self.cursor_scope().is_some()
            || parents.len() >= 8
            || positions.is_none_or(|total| total > 1024)
            || alias.is_empty()
            || alias.len() > 256
            || alias.chars().any(char::is_control)
            || count == 0
            || count > 1024
            || index >= count
        {
            return Err(Status::invalid_argument(
                "invalid finite workflow iteration scope",
            ));
        }
        let context = WorkflowContext {
            tasks: self.tasks,
            task: self.task.clone(),
            cancel: self.cancel,
            generation: self.generation.clone(),
            attempt: self.attempt,
            iteration: Some((alias.to_owned(), index, count)),
            parents,
        };
        operation.acknowledged();
        Ok(context)
    }
    pub(crate) fn checkpoint_iteration(&self) -> Option<u64> {
        self.iteration.as_ref().map(|(_, index, _)| *index)
    }
    pub(crate) fn checkpoint_bound(&self) -> u64 {
        self.iteration.as_ref().map_or(0, |(_, _, count)| *count)
    }
    pub(crate) fn checkpoint_key(
        &self,
        seed: uuid::Uuid,
        alias: &str,
        condition: Option<&str>,
    ) -> uuid::Uuid {
        if let Some((name, index, _)) = self.cursor_scope() {
            let namespace = uuid::Uuid::new_v5(&seed, b"reboot.workflow.cursor.step.v1");
            let identity = (
                name.clone(),
                *index,
                alias.to_owned(),
                condition.map(str::to_owned),
            );
            return uuid::Uuid::new_v5(&namespace, format!("{identity:?}").as_bytes());
        }
        if self.iteration.is_none() && condition.is_none() {
            return uuid::Uuid::new_v5(&seed, alias.as_bytes());
        }
        let domain = match (self.iteration.is_some(), condition.is_some()) {
            (true, false) => b"reboot.finite.writer.v1".as_slice(),
            (true, true) => b"reboot.finite.wait.v1".as_slice(),
            (false, true) => b"reboot.named.wait.v1".as_slice(),
            (false, false) => unreachable!(),
        };
        let namespace = uuid::Uuid::new_v5(&seed, domain);
        let namespace = if self.parents.is_empty() {
            namespace
        } else {
            uuid::Uuid::new_v5(&namespace, b"reboot.nested.scope.v1")
        };
        let mut encoded = self.parent_identity();
        if let Some((name, index, _)) = &self.iteration {
            encoded.extend_from_slice(&(name.len() as u64).to_be_bytes());
            encoded.extend_from_slice(name.as_bytes());
            encoded.extend_from_slice(&index.to_be_bytes());
        }
        encoded.extend_from_slice(&(alias.len() as u64).to_be_bytes());
        encoded.extend_from_slice(alias.as_bytes());
        uuid::Uuid::new_v5(&namespace, &encoded)
    }
    pub(crate) fn checkpoint_decision_key(&self, seed: uuid::Uuid, alias: &str) -> uuid::Uuid {
        if self.cursor_scope().is_some() {
            return self.checkpoint_key(
                uuid::Uuid::new_v5(&seed, b"reboot.workflow.cursor.decision.v1"),
                alias,
                None,
            );
        }
        let namespace = uuid::Uuid::new_v5(&seed, b"reboot.finite.decision.v1");
        let namespace = if self.parents.is_empty() {
            namespace
        } else {
            uuid::Uuid::new_v5(&namespace, b"reboot.nested.scope.v1")
        };
        let (name, index, _) = self
            .iteration
            .as_ref()
            .expect("decision requires validated finite scope");
        let mut encoded = self.parent_identity();
        encoded.extend_from_slice(&(name.len() as u64).to_be_bytes());
        encoded.extend_from_slice(name.as_bytes());
        encoded.extend_from_slice(&index.to_be_bytes());
        encoded.extend_from_slice(&(alias.len() as u64).to_be_bytes());
        encoded.extend_from_slice(alias.as_bytes());
        uuid::Uuid::new_v5(&namespace, &encoded)
    }
    pub(crate) fn checkpoint_reader_outcome_key(
        &self,
        seed: uuid::Uuid,
        alias: &str,
    ) -> uuid::Uuid {
        let namespace = uuid::Uuid::new_v5(&seed, b"reboot.reader.outcome.v1");
        self.checkpoint_key(namespace, alias, Some("reader-outcome.v1"))
    }
    fn parent_identity(&self) -> Vec<u8> {
        let mut encoded = Vec::new();
        if !self.parents.is_empty() {
            encoded.extend_from_slice(&(self.parents.len() as u64).to_be_bytes());
            for (name, index, _) in &self.parents {
                encoded.extend_from_slice(&(name.len() as u64).to_be_bytes());
                encoded.extend_from_slice(name.as_bytes());
                encoded.extend_from_slice(&index.to_be_bytes());
            }
        }
        encoded
    }
    pub(crate) fn checkpoint_parent_bounds(&self) -> String {
        self.parents
            .iter()
            .map(|(_, _, count)| format!(":{count}"))
            .collect()
    }
    pub(crate) fn checkpoint_alias(&self, alias: &str) -> String {
        if !self.parents.is_empty() {
            let path = self
                .parent_identity()
                .iter()
                .map(|byte| format!("{byte:02x}"))
                .collect::<String>();
            let (name, index, _) = self.iteration.as_ref().expect("nested leaf");
            return format!(
                "reboot.nested:{path}:{}:{name}:{index}:{}:{alias}",
                name.len(),
                alias.len()
            );
        }
        if let Some((name, index, _)) = self.cursor_scope() {
            let version = self
                .tasks
                .cursor_declaration(&self.task)
                .map_or(0, |(_, v)| v);
            return format!("reboot.cursor.v1:{name:?}:{version}:{index}:{alias:?}");
        }
        match &self.iteration {
            None => alias.to_owned(),
            Some((name, index, _)) => format!(
                "reboot.loop:{}:{}:{}:{}:{}",
                name.len(),
                name,
                index,
                alias.len(),
                alias
            ),
        }
    }

    /// Checkpointed same-actor generated immutable reader wait. Subscribe before
    /// checking canonical state; mark before Load. Only a matched typed result is
    /// durably acknowledged. Restart replays that result even if state flaps false.
    /// `condition` names a versioned trusted pure predicate contract; closure
    /// semantics cannot be introspected. Reusing an alias with a different named
    /// condition fails closed. Change its version whenever its meaning changes.
    /// There is no actor lease while parked, and no retry of a failed framework call.
    pub async fn wait_reader<D, Q, R, F, P>(
        &self,
        name: WorkflowWaitName<'_>,
        method: &'static str,
        response_type: &'static str,
        request: Q,
        read: F,
        predicate: P,
    ) -> Result<R, Status>
    where
        D: crate::runtime::DurableStateDeclaration + 'static,
        Q: prost::Message + Default + Clone + Send + 'static,
        R: prost::Message + Default + Clone + Send + 'static,
        F: for<'s> Fn(
                &'s D::State,
                Q,
            ) -> std::pin::Pin<
                Box<dyn std::future::Future<Output = Result<R, Status>> + Send + 's>,
            > + Send
            + Sync
            + 'static,
        P: Fn(&R) -> bool + Send + Sync + 'static,
    {
        let operation = self.attempt.operation();
        let WorkflowWaitName { alias, condition } = name;
        if alias.is_empty()
            || alias.len() > 256
            || alias.chars().any(char::is_control)
            || condition.is_empty()
            || condition.len() > 256
            || condition.chars().any(char::is_control)
        {
            return Err(Status::invalid_argument(
                "wait requires bounded explicit checkpoint and condition names",
            ));
        }
        let id = self
            .task
            .task_id
            .as_ref()
            .ok_or_else(|| Status::failed_precondition("missing workflow ID"))?;
        let declaration = self
            .tasks
            .inner
            .declarations
            .iter()
            .find(|d| d.method == method)
            .ok_or_else(|| Status::failed_precondition("unregistered workflow reader"))?;
        let probe = db::Task {
            method: method.rsplit('.').next().unwrap_or("").to_owned(),
            ..self.task.clone()
        };
        if !declaration.workflow_reader_wait
            || declaration.workflow
            || declaration.workflow_writer_step
            || declaration.declaration != std::any::TypeId::of::<D>()
            || declaration.request != std::any::TypeId::of::<Q>()
            || declaration.response != std::any::TypeId::of::<R>()
            || declaration.response_type != response_type
            || id.state_type != D::STATE_TYPE
            || self.tasks.inner.binding.is_writer(&probe)
        {
            return Err(Status::failed_precondition(
                "workflow reader descriptor mismatch",
            ));
        }
        let gate = self
            .tasks
            .inner
            .store
            .actor_gate(&id.state_type, &id.state_ref);
        let mut revisions = gate.committed_revisions();
        let reader_scope = crate::reactive::ReaderScope::new(self.cancel.clone());
        reader_scope.check()?;
        let read = Arc::new(read);
        let predicate = Arc::new(predicate);
        loop {
            reader_scope.check()?;
            if revisions.borrow_and_update().1 {
                return Err(Status::unavailable("actor commit outcome uncertain"));
            }
            #[cfg(feature = "test-support")]
            self.wait_test_pause("REBOOT_TEST_WORKFLOW_WAIT_BEFORE_READ")
                .await?;
            let result = {
                let _lease = workflow_reader_lease(&gate, &mut revisions).await?;
                reader_scope.check()?;
                self.validate_scope().await?;
                self.tasks
                    .inner
                    .store
                    .workflow_writer_step::<D, Q, R, _>(
                        self,
                        (alias, Some(condition)),
                        method,
                        response_type,
                        request.clone(),
                        {
                            let read = read.clone();
                            let predicate = predicate.clone();
                            move |state, request| {
                                Box::pin(async move {
                                    let response = read(state, request).await?;
                                    Ok(predicate(&response).then_some(response))
                                })
                            }
                        },
                    )
                    .await?
            };
            reader_scope.check()?;
            if let Some(result) = result {
                operation.acknowledged();
                return Ok(result);
            }
            #[cfg(feature = "test-support")]
            self.wait_test_pause("REBOOT_TEST_WORKFLOW_WAIT_AFTER_FALSE")
                .await?;
            // Do not mark after Load: a racing acknowledged commit stays pending.
            tokio::select! {
                biased;
                _=self.cancel.cancelled()=>return Err(Status::cancelled("workflow wait cancelled")),
                _=reader_scope.revoked()=>return Err(Status::unavailable("workflow reader authority revoked")),
                changed=revisions.changed()=>changed.map_err(|_|Status::unavailable("actor revision owner lost"))?,
            }
            self.validate_scope().await?;
        }
    }

    /// Wait for a matching observation or save an exact declared business error.
    /// Only acknowledged outcomes may be caught; framework/authority/Store failures
    /// retain failed operation evidence. Named contract and finite scopes stay stable.
    pub async fn wait_reader_declared<D, Q, R, F, P>(
        &self,
        name: WorkflowWaitName<'_>,
        method: &'static str,
        response_type: &'static str,
        request: Q,
        read: F,
        predicate: P,
    ) -> Result<R, TaskHandlerError>
    where
        D: crate::runtime::DurableStateDeclaration + 'static,
        Q: prost::Message + Default + Clone + Send + 'static,
        R: prost::Message + Default + Clone + Send + 'static,
        F: for<'s> Fn(
                &'s D::State,
                Q,
            ) -> std::pin::Pin<
                Box<dyn std::future::Future<Output = Result<R, TaskHandlerError>> + Send + 's>,
            > + Send
            + Sync
            + 'static,
        P: Fn(&R) -> bool + Send + Sync + 'static,
    {
        let operation = self
            .attempt
            .serial_reader_operation()
            .map_err(TaskHandlerError::Failed)?;
        let result: Result<Result<R, prost_types::Any>, Status> = async {
        let WorkflowWaitName { alias, condition } = name;
        if alias.is_empty()
            || alias.len() > 256
            || alias.chars().any(char::is_control)
            || condition.is_empty()
            || condition.len() > 256
            || condition.chars().any(char::is_control)
        {
            return Err(Status::invalid_argument(
                "wait requires bounded explicit checkpoint and condition names",
            ));
        }
        let id = self
            .task
            .task_id
            .as_ref()
            .ok_or_else(|| Status::failed_precondition("missing workflow ID"))?;
        let declaration = self
            .tasks
            .inner
            .declarations
            .iter()
            .find(|d| d.method == method)
            .ok_or_else(|| Status::failed_precondition("unregistered workflow reader"))?;
        let probe = db::Task {
            method: method.rsplit('.').next().unwrap_or("").to_owned(),
            ..self.task.clone()
        };
        if !declaration.workflow_reader_wait
            || declaration.workflow
            || declaration.workflow_writer_step
            || declaration.declaration != std::any::TypeId::of::<D>()
            || declaration.request != std::any::TypeId::of::<Q>()
            || declaration.response != std::any::TypeId::of::<R>()
            || declaration.response_type != response_type
            || id.state_type != D::STATE_TYPE
            || self.tasks.inner.binding.is_writer(&probe)
        {
            return Err(Status::failed_precondition(
                "workflow reader descriptor mismatch",
            ));
        }
        let gate = self
            .tasks
            .inner
            .store
            .actor_gate(&id.state_type, &id.state_ref);
        let mut revisions = gate.committed_revisions();
        let reader_scope = crate::reactive::ReaderScope::new(self.cancel.clone());
        reader_scope.check()?;
        let read = Arc::new(read);
        let predicate = Arc::new(predicate);
        loop {
            reader_scope.check()?;
            if revisions.borrow_and_update().1 {
                return Err(Status::unavailable("actor commit outcome uncertain"));
            }
            #[cfg(feature = "test-support")]
            self.wait_test_pause("REBOOT_TEST_WORKFLOW_WAIT_BEFORE_READ")
                .await?;
            let result = {
                let _lease = workflow_reader_lease(&gate, &mut revisions).await?;
                reader_scope.check()?;
                self.validate_scope().await?;
                self.tasks
                    .inner
                    .store
                    .workflow_reader_outcome_step::<D, Q, ReaderOutcomeCheckpoint, _>(
                        self,
                        (alias, Some(condition)),
                        method,
                        ("type.googleapis.com/reboot.runtime.ReaderOutcome.v1", response_type),
                        request.clone(),
                        {
                            let read = read.clone();
                            let predicate = predicate.clone();
                            move |state, request| {
                                Box::pin(async move {
                                    match read(state, request).await {
                                        Ok(response) => Ok(predicate(&response).then(|| ReaderOutcomeCheckpoint {
                                            response_type: response_type.to_owned(),
                                            outcome: Some(reader_outcome_checkpoint::Outcome::Response(response.encode_to_vec())),
                                        })),
                                        Err(TaskHandlerError::Declared(error)) => Ok(Some(ReaderOutcomeCheckpoint {
                                            response_type: response_type.to_owned(),
                                            outcome: Some(reader_outcome_checkpoint::Outcome::Error(error)),
                                        })),
                                        Err(TaskHandlerError::Failed(error)) => Err(error),
                                    }
                                })
                            }
                        },
                    )
                    .await?
            };
            reader_scope.check()?;
            if let Some(result) = result {
                self.validate_reader_outcome(method, response_type, &result.encode_to_vec())?;
                return match result.outcome {
                    Some(reader_outcome_checkpoint::Outcome::Response(bytes)) => Ok(Ok(R::decode(bytes.as_slice()).map_err(|_|Status::data_loss("malformed saved reader response"))?)),
                    Some(reader_outcome_checkpoint::Outcome::Error(error)) => Ok(Err(error)),
                    None => Err(Status::data_loss("reader checkpoint omitted outcome")),
                };
            }
            #[cfg(feature = "test-support")]
            self.wait_test_pause("REBOOT_TEST_WORKFLOW_WAIT_AFTER_FALSE")
                .await?;
            // Do not mark after Load: a racing acknowledged commit stays pending.
            tokio::select! {
                biased;
                _=self.cancel.cancelled()=>return Err(Status::cancelled("workflow wait cancelled")),
                _=reader_scope.revoked()=>return Err(Status::unavailable("workflow reader authority revoked")),
                changed=revisions.changed()=>changed.map_err(|_|Status::unavailable("actor revision owner lost"))?,
            }
            self.validate_scope().await?;
        }
        }.await;
        match result {
            Ok(response) => {
                operation
                    .acknowledged_serial()
                    .map_err(TaskHandlerError::Failed)?;
                response.map_err(TaskHandlerError::Declared)
            }
            Err(error) => Err(TaskHandlerError::Failed(error)),
        }
    }

    /// Save a typed same-actor reader result and pure Continue/Break decision
    /// in one acknowledged checkpoint. Replay loads both without invoking the
    /// reader or decision callback. `condition` is the versioned trusted decision
    /// contract: change it if callback semantics change. This requires an explicit
    /// finite iteration, does not advance Task.iteration or garbage-collect records,
    /// and does not implement Python's unbounded control-loop cursor.
    pub async fn decide_reader<D, Q, R, F, P>(
        &self,
        name: WorkflowWaitName<'_>,
        method: &'static str,
        response_type: &'static str,
        request: Q,
        read: F,
        should_break: P,
    ) -> Result<std::ops::ControlFlow<R, R>, Status>
    where
        D: crate::runtime::DurableStateDeclaration + 'static,
        Q: prost::Message + Default + Clone + Send + 'static,
        R: prost::Message + Default + Clone + Send + 'static,
        F: for<'s> Fn(
                &'s D::State,
                Q,
            ) -> std::pin::Pin<
                Box<dyn std::future::Future<Output = Result<R, Status>> + Send + 's>,
            > + Send
            + Sync
            + 'static,
        P: Fn(&R) -> bool + Send + Sync + 'static,
    {
        let operation = self.attempt.operation();
        if self.iteration.is_none() || self.cursor_scope().is_some() {
            return Err(Status::failed_precondition(
                "loop decision requires finite iteration scope",
            ));
        }
        let WorkflowWaitName { alias, condition } = name;
        if alias.is_empty()
            || alias.len() > 256
            || alias.chars().any(char::is_control)
            || condition.is_empty()
            || condition.len() > 256
            || condition.chars().any(char::is_control)
        {
            return Err(Status::invalid_argument(
                "wait requires bounded explicit checkpoint and condition names",
            ));
        }
        let id = self
            .task
            .task_id
            .as_ref()
            .ok_or_else(|| Status::failed_precondition("missing workflow ID"))?;
        let declaration = self
            .tasks
            .inner
            .declarations
            .iter()
            .find(|d| d.method == method)
            .ok_or_else(|| Status::failed_precondition("unregistered workflow reader"))?;
        let probe = db::Task {
            method: method.rsplit('.').next().unwrap_or("").to_owned(),
            ..self.task.clone()
        };
        if !declaration.workflow_reader_wait
            || declaration.workflow
            || declaration.workflow_writer_step
            || declaration.declaration != std::any::TypeId::of::<D>()
            || declaration.request != std::any::TypeId::of::<Q>()
            || declaration.response != std::any::TypeId::of::<R>()
            || declaration.response_type != response_type
            || id.state_type != D::STATE_TYPE
            || self.tasks.inner.binding.is_writer(&probe)
        {
            return Err(Status::failed_precondition(
                "workflow reader descriptor mismatch",
            ));
        }
        let gate = self
            .tasks
            .inner
            .store
            .actor_gate(&id.state_type, &id.state_ref);
        let mut revisions = gate.committed_revisions();
        let reader_scope = crate::reactive::ReaderScope::new(self.cancel.clone());
        reader_scope.check()?;
        let read = Arc::new(read);
        let should_break = Arc::new(should_break);
        {
            reader_scope.check()?;
            if revisions.borrow_and_update().1 {
                return Err(Status::unavailable("actor commit outcome uncertain"));
            }
            #[cfg(feature = "test-support")]
            self.wait_test_pause("REBOOT_TEST_WORKFLOW_WAIT_BEFORE_READ")
                .await?;
            let result = {
                let _lease = workflow_reader_lease(&gate, &mut revisions).await?;
                reader_scope.check()?;
                self.validate_scope().await?;
                self.tasks
                    .inner
                    .store
                    .workflow_reader_decision_step::<D, Q, LoopDecisionCheckpoint, _>(
                        self,
                        (alias, Some(condition)),
                        method,
                        (
                            "type.googleapis.com/reboot.runtime.FiniteLoopDecision.v1",
                            response_type,
                        ),
                        request.clone(),
                        {
                            let read = read.clone();
                            let should_break = should_break.clone();
                            move |state, request| {
                                Box::pin(async move {
                                    let response = read(state, request).await?;
                                    Ok(Some(LoopDecisionCheckpoint {
                                        response: response.encode_to_vec(),
                                        response_type: response_type.to_owned(),
                                        break_loop: should_break(&response),
                                    }))
                                })
                            }
                        },
                    )
                    .await?
            };
            reader_scope.check()?;
            if let Some(result) = result {
                if result.response_type != response_type {
                    return Err(Status::failed_precondition(
                        "loop decision response type collision",
                    ));
                }
                let response = R::decode(result.response.as_slice())
                    .map_err(|_| Status::data_loss("malformed saved loop decision response"))?;
                operation.acknowledged();
                return Ok(if result.break_loop {
                    std::ops::ControlFlow::Break(response)
                } else {
                    std::ops::ControlFlow::Continue(response)
                });
            }
            Err(Status::data_loss(
                "loop decision checkpoint omitted its result",
            ))
        }
    }

    #[cfg(feature = "test-support")]
    async fn wait_test_pause(&self, name: &str) -> Result<(), Status> {
        if let Some(path) = std::env::var_os(name) {
            let path = std::path::PathBuf::from(path);
            // Linux producer/observer share CLOCK_MONOTONIC, not discovery time.
            if !cfg!(target_os = "linux") {
                return Err(Status::internal("observation clock requires Linux"));
            }
            #[repr(C)]
            struct Timespec {
                sec: std::ffi::c_long,
                nsec: std::ffi::c_long,
            }
            unsafe extern "C" {
                fn clock_gettime(clock: std::ffi::c_int, value: *mut Timespec) -> std::ffi::c_int;
            }
            let mut stamp = Timespec { sec: 0, nsec: 0 };
            if unsafe { clock_gettime(1, &mut stamp) } != 0
                || stamp.sec < 0
                || !(0..1_000_000_000).contains(&stamp.nsec)
            {
                return Err(Status::internal("CLOCK_MONOTONIC unavailable"));
            }
            let ns = stamp.sec as u128 * 1_000_000_000 + stamp.nsec as u128;
            let case =
                std::env::var("RBT_TEST_CRASH_CASE").unwrap_or_else(|_| "observation".into());
            let pid = std::process::id();
            let task = self
                .task
                .task_id
                .as_ref()
                .ok_or_else(|| Status::internal("missing task identity"))?;
            let task = uuid::Uuid::from_slice(&task.task_uuid)
                .map_err(|e| Status::internal(e.to_string()))?;
            let payload = serde_json::json!({"version": 1, "clock": "CLOCK_MONOTONIC", "created_ns": ns,
                "hook": name, "case": case, "pid": pid, "task_uuid": task.to_string()});
            let creating = path.with_extension("creating");
            std::fs::write(&creating, payload.to_string())
                .map_err(|e| Status::internal(e.to_string()))?;
            std::fs::rename(&creating, &path).map_err(|e| Status::internal(e.to_string()))?;
            let release = path.with_extension("release");
            tokio::time::timeout(std::time::Duration::from_secs(10),async {
                while !release.exists() {
                    tokio::select! { biased; _=self.cancel.cancelled()=>return Err(Status::cancelled("workflow wait test barrier cancelled")),_=tokio::time::sleep(std::time::Duration::from_millis(5))=>{} }
                }
                self.validate_scope().await
            }).await.map_err(|_|Status::deadline_exceeded("workflow wait test barrier timeout"))??;
        }
        Ok(())
    }
    pub fn task(&self) -> &db::Task {
        &self.task
    }
    /// Generated body boundary: explicit local disposition is only a request,
    /// not retry authority. Recheck canonical scope and private operation evidence.
    pub async fn body_failed(self, error: WorkflowBodyError) -> Result<WorkflowReceipt, Status> {
        let message = match error {
            WorkflowBodyError::Declared(error) => return self.finish_declared(error).await,
            WorkflowBodyError::Failed(error) => return Err(error),
            WorkflowBodyError::RetryLocal(message) => message,
        };
        if !self.attempt.clean() {
            return Err(Status::internal(message));
        }
        self.validate_scope().await?;
        if !self.attempt.clean() {
            return Err(Status::internal(message));
        }
        Ok(WorkflowReceipt {
            task: self.task.clone(),
            outcome: WorkflowOutcome::PreStoreBodyFailure(Status::internal(message)),
        })
    }
    pub(crate) async fn validate_scope(&self) -> Result<(), Status> {
        let operation = self.attempt.scope_operation();
        if !self.tasks.is_workflow(&self.task)
            || (self.task.iteration != 0 && self.tasks.cursor_declaration(&self.task).is_none())
            || self.task.status != db::task::Status::Pending as i32
            || self.task.response_or_error.is_some()
        {
            return Err(Status::failed_precondition(
                "invalid explicit workflow scope",
            ));
        }
        self.cancel.public_ready().await?;
        let admission = RunningTaskAdmission {
            tasks: self.tasks.clone(),
            generation: self.generation.clone(),
        };
        {
            let _owner = admission.lock()?;
        }
        let loaded =
            self.tasks
                .inner
                .store
                .task_database()
                .load(db::LoadRequest {
                    actors: vec![],
                    task_ids: vec![
                        self.task.task_id.clone().ok_or_else(|| {
                            Status::failed_precondition("missing workflow identity")
                        })?,
                    ],
                })
                .await?
                .into_inner();
        {
            let _owner = admission.lock()?;
        }
        self.cancel.public_ready().await?;
        if loaded.tasks.as_slice() != [self.task.clone()] || !schedule_due(&self.task)? {
            return Err(Status::failed_precondition(
                "workflow scope no longer canonical/due",
            ));
        }
        operation.acknowledged();
        Ok(())
    }
    /// Execute an explicit named typed writer step. The alias is stable for the
    /// lifetime of this workflow, matching Python's non-loop UUIDv5 semantics.
    /// A committed step returns its saved typed result without loading state or
    /// calling the handler; method/payload/type/provenance collisions fail closed.
    pub async fn writer_step<D, Q, R, F>(
        &self,
        alias: &str,
        method: &'static str,
        response_type: &'static str,
        request: Q,
        invoke: F,
    ) -> Result<R, Status>
    where
        D: crate::runtime::DurableStateDeclaration + 'static,
        Q: prost::Message + Default + Send + 'static,
        R: prost::Message + Default + Clone + Send + 'static,
        F: for<'s> FnOnce(
            &'s mut D::State,
            Q,
        ) -> std::pin::Pin<
            Box<dyn std::future::Future<Output = Result<R, Status>> + Send + 's>,
        >,
    {
        let operation = self.attempt.operation();
        if alias.is_empty() || alias.len() > 256 || alias.chars().any(char::is_control) {
            return Err(Status::invalid_argument(
                "workflow step requires a bounded explicit name",
            ));
        }
        let id = self
            .task
            .task_id
            .as_ref()
            .ok_or_else(|| Status::failed_precondition("missing workflow ID"))?;
        let declaration = self
            .tasks
            .inner
            .declarations
            .iter()
            .find(|d| d.method == method)
            .ok_or_else(|| Status::failed_precondition("unregistered workflow writer step"))?;
        if declaration.workflow
            || !declaration.workflow_writer_step
            || id.state_type != D::STATE_TYPE
            || declaration.declaration != std::any::TypeId::of::<D>()
            || declaration.request != std::any::TypeId::of::<Q>()
            || declaration.response != std::any::TypeId::of::<R>()
            || declaration.response_type != response_type
        {
            return Err(Status::failed_precondition(
                "workflow writer step descriptor mismatch",
            ));
        }
        let probe = db::Task {
            method: method.rsplit('.').next().unwrap_or("").to_owned(),
            ..self.task.clone()
        };
        if !self.tasks.inner.binding.writer_capable() || !self.tasks.inner.binding.is_writer(&probe)
        {
            return Err(Status::failed_precondition(
                "workflow step is not an ordinary writer",
            ));
        }
        crate::runtime::writer_task_key(id, method)?;
        let gate = self
            .tasks
            .inner
            .store
            .actor_gate(&id.state_type, &id.state_ref);
        let _lease = gate.exclusive().await;
        self.validate_scope().await?;
        let response = self
            .tasks
            .inner
            .store
            .workflow_writer_step::<D, Q, R, _>(
                self,
                (alias, None),
                method,
                response_type,
                request,
                move |state, request| {
                    let future = invoke(state, request);
                    Box::pin(async move { future.await.map(Some) })
                },
            )
            .await?;
        operation.acknowledged();
        response.ok_or_else(|| Status::internal("writer step omitted result"))
    }
    pub async fn writer_step_declared<D, Q, R, F>(
        &self,
        alias: &str,
        method: &'static str,
        response_type: &'static str,
        request: Q,
        invoke: F,
    ) -> Result<R, TaskHandlerError>
    where
        D: crate::runtime::DurableStateDeclaration + 'static,
        Q: prost::Message + Default + Send + 'static,
        R: prost::Message + Default + Clone + Send + 'static,
        F: for<'s> FnOnce(
            &'s mut D::State,
            Q,
        ) -> std::pin::Pin<
            Box<dyn std::future::Future<Output = Result<R, TaskHandlerError>> + Send + 's>,
        >,
    {
        let operation = self.attempt.operation();
        let result: Result<Result<R, prost_types::Any>, Status> = async {
            if alias.is_empty() || alias.len() > 256 || alias.chars().any(char::is_control) {
                return Err(Status::invalid_argument(
                    "workflow step requires a bounded explicit name",
                ));
            }
            let id = self
                .task
                .task_id
                .as_ref()
                .ok_or_else(|| Status::failed_precondition("missing workflow ID"))?;
            let declaration = self
                .tasks
                .inner
                .declarations
                .iter()
                .find(|d| d.method == method)
                .ok_or_else(|| Status::failed_precondition("unregistered workflow writer step"))?;
            if declaration.workflow
                || !declaration.workflow_writer_step
                || id.state_type != D::STATE_TYPE
                || declaration.declaration != std::any::TypeId::of::<D>()
                || declaration.request != std::any::TypeId::of::<Q>()
                || declaration.response != std::any::TypeId::of::<R>()
                || declaration.response_type != response_type
            {
                return Err(Status::failed_precondition(
                    "workflow writer step descriptor mismatch",
                ));
            }
            let probe = db::Task {
                method: method.rsplit('.').next().unwrap_or("").to_owned(),
                ..self.task.clone()
            };
            if !self.tasks.inner.binding.writer_capable()
                || !self.tasks.inner.binding.is_writer(&probe)
            {
                return Err(Status::failed_precondition(
                    "workflow step is not an ordinary writer",
                ));
            }
            crate::runtime::writer_task_key(id, method)?;
            let gate = self
                .tasks
                .inner
                .store
                .actor_gate(&id.state_type, &id.state_ref);
            let _lease = gate.exclusive().await;
            self.validate_scope().await?;
            let response = self
                .tasks
                .inner
                .store
                .workflow_step_outcome::<D, Q, R, _>(
                    self,
                    (alias, None, None),
                    method,
                    response_type,
                    request,
                    move |state, request| {
                        let future = invoke(state, request);
                        Box::pin(async move {
                            match future.await {
                                Ok(response) => Ok(Some(Ok(response))),
                                Err(TaskHandlerError::Declared(error)) => Ok(Some(Err(error))),
                                Err(TaskHandlerError::Failed(error)) => Err(error),
                            }
                        })
                    },
                )
                .await?;
            response.ok_or_else(|| Status::internal("writer step omitted result"))
        }
        .await;
        match result {
            Ok(response) => {
                operation.acknowledged();
                response.map_err(TaskHandlerError::Declared)
            }
            Err(error) => Err(TaskHandlerError::Failed(error)),
        }
    }
    // A saved business decision is admitted only for the exact immutable writer
    // descriptor and a serial, otherwise-clean framework operation.
    pub(crate) fn validate_writer_step_error(
        &self,
        method: &str,
        error: &prost_types::Any,
    ) -> Result<(), Status> {
        if self
            .attempt
            .failed
            .load(std::sync::atomic::Ordering::Acquire)
            || self
                .attempt
                .active
                .load(std::sync::atomic::Ordering::Acquire)
                != 1
        {
            return Err(Status::failed_precondition(
                "declared writer decision requires clean serial attempt",
            ));
        }
        let declaration = self
            .tasks
            .inner
            .declarations
            .iter()
            .find(|d| d.method == method && d.workflow_writer_step)
            .ok_or_else(|| Status::failed_precondition("unregistered declared writer step"))?;
        declaration.validate_terminal(&db::task::ResponseOrError::Error(error.clone()))
    }
    pub(crate) fn validate_reader_outcome(
        &self,
        method: &str,
        response_type: &str,
        bytes: &[u8],
    ) -> Result<(), Status> {
        let value = ReaderOutcomeCheckpoint::decode(bytes)
            .map_err(|_| Status::data_loss("malformed reader outcome checkpoint"))?;
        if value.response_type != response_type {
            return Err(Status::failed_precondition(
                "reader outcome response type collision",
            ));
        }
        match value.outcome {
            Some(reader_outcome_checkpoint::Outcome::Response(_)) => Ok(()),
            Some(reader_outcome_checkpoint::Outcome::Error(error)) => {
                self.validate_reader_step_error(method, &error)
            }
            None => Err(Status::data_loss("reader checkpoint omitted outcome")),
        }
    }
    pub(crate) fn validate_reader_step_error(
        &self,
        method: &str,
        error: &prost_types::Any,
    ) -> Result<(), Status> {
        if self
            .attempt
            .failed
            .load(std::sync::atomic::Ordering::Acquire)
            || self
                .attempt
                .active
                .load(std::sync::atomic::Ordering::Acquire)
                != 1
        {
            return Err(Status::failed_precondition(format!(
                "declared reader decision requires clean serial attempt (active={}, failed={})",
                self.attempt
                    .active
                    .load(std::sync::atomic::Ordering::Acquire),
                self.attempt
                    .failed
                    .load(std::sync::atomic::Ordering::Acquire)
            )));
        }
        let declaration = self
            .tasks
            .inner
            .declarations
            .iter()
            .find(|d| {
                d.method == method
                    && d.workflow_reader_wait
                    && !d.workflow_writer_step
                    && !d.workflow
            })
            .ok_or_else(|| Status::failed_precondition("unregistered declared reader step"))?;
        declaration.validate_terminal(&db::task::ResponseOrError::Error(error.clone()))
    }
    pub(crate) fn durable(&self) -> DurableTaskOperation<'_> {
        DurableTaskOperation {
            cancel: self.cancel,
            tasks: self.tasks,
            acknowledged: false,
            started: None,
        }
    }
    // A declared business outcome is not a failed framework operation or a retry.
    // Already acknowledged checkpoints remain durable; failed/dropped framework
    // work cannot be caught and disguised as a successful declared terminal.
    async fn finish_declared(self, error: prost_types::Any) -> Result<WorkflowReceipt, Status> {
        if self.iteration.is_some()
            || !self.attempt.clean()
            || (self.tasks.cursor_declaration(&self.task).is_some()
                && !self
                    .attempt
                    .cursor_closed
                    .load(std::sync::atomic::Ordering::Acquire))
        {
            return Err(Status::failed_precondition(
                "declared workflow terminal requires clean outer scope",
            ));
        }
        let declaration = self
            .tasks
            .declaration(&self.task)
            .ok_or_else(|| Status::failed_precondition("unregistered workflow"))?;
        if !declaration.workflow {
            return Err(Status::failed_precondition("not workflow authority"));
        }
        let operation = self.attempt.operation();
        let terminal = db::task::ResponseOrError::Error(error);
        // Validate before the canonical Load; malformed/foreign errors disclose
        // no task bytes and never reach the durable completion path.
        self.tasks.validate_terminal(&self.task, &terminal)?;
        self.validate_scope().await?;
        operation.acknowledged();
        Ok(WorkflowReceipt {
            task: self.task.clone(),
            outcome: WorkflowOutcome::Terminal(terminal),
        })
    }
    /// Seal a typed terminal only for the exact registered workflow descriptor.
    pub async fn finish<D, Q, R>(
        self,
        response_type: &'static str,
        response: R,
    ) -> Result<WorkflowReceipt, Status>
    where
        D: crate::runtime::DurableStateDeclaration + 'static,
        Q: prost::Message + Default + 'static,
        R: prost::Message + Default + 'static,
    {
        if !self.attempt.clean() {
            return Err(Status::failed_precondition(
                "unclean workflow attempt cannot complete successfully",
            ));
        }
        let operation = self.attempt.operation();
        if self.iteration.is_some()
            || (self.tasks.cursor_declaration(&self.task).is_some()
                && !self
                    .attempt
                    .cursor_closed
                    .load(std::sync::atomic::Ordering::Acquire))
        {
            return Err(Status::failed_precondition(
                "finish requires outer workflow scope and a closed declared cursor",
            ));
        }
        let declaration = self
            .tasks
            .declaration(&self.task)
            .ok_or_else(|| Status::failed_precondition("unregistered workflow"))?;
        if !declaration.workflow {
            return Err(Status::failed_precondition("not workflow authority"));
        }
        self.tasks
            .validate_executor::<D, Q, R>(&self.task, declaration.method, response_type)?;
        self.validate_scope().await?;
        let terminal = db::task::ResponseOrError::Response(prost_types::Any {
            type_url: response_type.to_owned(),
            value: response.encode_to_vec(),
        });
        self.tasks.validate_terminal(&self.task, &terminal)?;
        operation.acknowledged();
        Ok(WorkflowReceipt {
            task: self.task.clone(),
            outcome: WorkflowOutcome::Terminal(terminal),
        })
    }
}
impl OneShotTasks {
    fn is_workflow(&self, task: &db::Task) -> bool {
        self.declaration(task)
            .is_some_and(|declaration| declaration.workflow)
    }
    async fn execute_workflow_task(
        &self,
        task: db::Task,
        cancel: &RecoveryCancellation,
    ) -> Result<(), Status> {
        let generation = self
            .inner
            .running_owner
            .lock()
            .expect("task owner mutex poisoned")
            .clone()
            .ok_or_else(|| Status::failed_precondition("no workflow host owner"))?;
        // Keep original generation across attempts and delay. Only a local body
        // explicitly typed local disposition with acknowledged operations resumes.
        // Completion never enters this retry branch.
        for retry in 0..3u32 {
            match self
                .execute_workflow_once(task.clone(), cancel, generation.clone())
                .await?
            {
                None => return Ok(()),
                Some(error) if retry == 2 => return Err(error),
                Some(_) => {
                    self.inner
                        .listing
                        .retry(&task, std::time::Duration::from_millis(25 << retry));
                    tokio::select! {
                        biased;
                        _ = cancel.cancelled() => return Err(Status::cancelled("workflow resumption cancelled")),
                        _ = tokio::time::sleep(std::time::Duration::from_millis(25 << retry)) => {},
                    }
                    #[cfg(feature = "test-support")]
                    self.test_workflow_retry_pause(cancel).await?;
                }
            }
        }
        unreachable!("bounded workflow retry")
    }
    // Test-owned barrier on the actual host retry path, after the bounded delay
    // and before next-body admission; no alternate dispatcher or Database facade.
    #[cfg(feature = "test-support")]
    async fn test_workflow_retry_pause(&self, cancel: &RecoveryCancellation) -> Result<(), Status> {
        if let Some(path) = std::env::var_os("REBOOT_TEST_WORKFLOW_RETRY_PAUSE") {
            let path = std::path::PathBuf::from(path);
            std::fs::write(
                &path,
                b"actual host retry delay completed; next body not admitted",
            )
            .map_err(|e| Status::internal(e.to_string()))?;
            let release = path.with_extension("release");
            tokio::time::timeout(std::time::Duration::from_secs(10),async {
                while !release.exists() {
                    tokio::select! {
                        biased;
                        _=cancel.cancelled()=>return Err(Status::cancelled("parked workflow resumption cancelled")),
                        _=tokio::time::sleep(std::time::Duration::from_millis(5))=>{},
                    }
                }
                Ok(())
            }).await.map_err(|_|Status::deadline_exceeded("workflow retry test barrier timeout"))??;
            match std::fs::read_to_string(release)
                .unwrap_or_default()
                .as_str()
            {
                "aba" => {
                    *self
                        .inner
                        .running_owner
                        .lock()
                        .expect("owner mutex poisoned") = Some(Arc::new(()));
                }
                "root-drop" => drop(self.own_root_handoff()),
                _ => {}
            }
        }
        Ok(())
    }
    async fn execute_workflow_once(
        &self,
        mut task: db::Task,
        cancel: &RecoveryCancellation,
        generation: Arc<()>,
    ) -> Result<Option<Status>, Status> {
        let attempt = WorkflowAttempt::default();
        let context = WorkflowContext {
            tasks: self,
            task: task.clone(),
            cancel,
            generation: generation.clone(),
            attempt: &attempt,
            iteration: None,
            parents: Vec::new(),
        };
        {
            let id = task.task_id.clone().expect("validated workflow ID");
            let gate = self.inner.store.actor_gate(&id.state_type, &id.state_ref);
            let _lease = gate.exclusive().await;
            cancel.public_ready().await?;
            let admission = RunningTaskAdmission {
                tasks: self.clone(),
                generation: generation.clone(),
            };
            {
                let _owner = admission.lock()?;
            }
            let loaded = self
                .inner
                .store
                .task_database()
                .load(db::LoadRequest {
                    actors: vec![],
                    task_ids: vec![id],
                })
                .await?
                .into_inner();
            {
                let _owner = admission.lock()?;
            }
            if loaded.tasks.len() == 1
                && loaded.tasks[0].status == db::task::Status::Completed as i32
            {
                let mut expected = task.clone();
                if let Some((alias, version)) = self.cursor_declaration(&task) {
                    self.inner
                        .store
                        .workflow_validate_cursor_binding(
                            &loaded.tasks[0],
                            alias,
                            version,
                            self.declaration(&task).expect("cursor declaration").method,
                        )
                        .await?;
                    expected.iteration = loaded.tasks[0].iteration;
                }
                validate_completed(&expected, &loaded.tasks[0], None)?;
                self.validate_terminal(
                    &loaded.tasks[0],
                    loaded.tasks[0]
                        .response_or_error
                        .as_ref()
                        .expect("validated terminal"),
                )?;
                return Ok(None);
            }
            context.validate_scope().await?;
            context.check_cursor_binding().await?;
            self.inner.listing.started(&task);
        }
        let receipt = self.inner.binding.execute_workflow(context).await?;
        let mut expected = task.clone();
        expected.iteration = receipt.task.iteration;
        if receipt.task != expected
            || (receipt.task.iteration != task.iteration
                && self.cursor_declaration(&task).is_none())
        {
            return Err(Status::failed_precondition(
                "workflow receipt identity mismatch",
            ));
        }
        task = receipt.task;
        let terminal = match receipt.outcome {
            WorkflowOutcome::PreStoreBodyFailure(error) => {
                cancel.public_ready().await?;
                let admission = RunningTaskAdmission {
                    tasks: self.clone(),
                    generation,
                };
                let _owner = admission.lock()?;
                if !attempt.clean()
                    || attempt
                        .cursor_advanced
                        .load(std::sync::atomic::Ordering::Acquire)
                {
                    return Err(error);
                }
                return Ok(Some(error));
            }
            WorkflowOutcome::Terminal(terminal) => {
                if !attempt.clean() {
                    return Err(Status::failed_precondition(
                        "unclean workflow receipt cannot complete",
                    ));
                }
                terminal
            }
        };
        let id = task.task_id.clone().expect("validated workflow ID");
        let gate = self.inner.store.actor_gate(&id.state_type, &id.state_ref);
        let _lease = gate.exclusive().await;
        WorkflowContext {
            tasks: self,
            task: task.clone(),
            cancel,
            generation: generation.clone(),
            attempt: &attempt,
            iteration: None,
            parents: Vec::new(),
        }
        .validate_scope()
        .await?;
        if !attempt.clean() {
            return Err(Status::failed_precondition(
                "unclean workflow receipt cannot complete",
            ));
        }
        self.validate_terminal(&task, &terminal)?;
        task.status = db::task::Status::Completed as i32;
        task.response_or_error = Some(terminal);
        let mut operation = DurableTaskOperation {
            cancel,
            tasks: self,
            acknowledged: false,
            started: None,
        };
        let admission = RunningTaskAdmission {
            tasks: self.clone(),
            generation: generation.clone(),
        };
        {
            let _owner = admission.lock()?;
        }
        let completed = self
            .inner
            .store
            .task_database()
            .complete_task(db::CompleteTaskRequest {
                task: Some(task.clone()),
                sync: true,
            })
            .await?
            .into_inner()
            .completed;
        cancel.public_ready().await?;
        let admission = RunningTaskAdmission {
            tasks: self.clone(),
            generation: generation.clone(),
        };
        {
            let _owner = admission.lock()?;
        }
        if !completed {
            let loaded = self
                .inner
                .store
                .task_database()
                .load(db::LoadRequest {
                    actors: vec![],
                    task_ids: vec![id],
                })
                .await?
                .into_inner();
            cancel.public_ready().await?;
            {
                let _owner = admission.lock()?;
            }
            if loaded.tasks.as_slice() != [task] {
                return Err(Status::failed_precondition("workflow completion conflict"));
            }
        }
        cancel.public_ready().await?;
        let admission = RunningTaskAdmission {
            tasks: self.clone(),
            generation,
        };
        {
            let _owner = admission.lock()?;
        }
        operation.acknowledged();
        Ok(None)
    }
}

// Cancellation or a swallowed driver failure must poison finish/RetryLocal even
// when no helper is outstanding. This guard is deliberately not active work:
// body helpers still get their own exclusive serial admission.
struct CursorDriverGuard<'a> {
    attempt: &'a WorkflowAttempt,
    acknowledged: bool,
}
impl Drop for CursorDriverGuard<'_> {
    fn drop(&mut self) {
        if !self.acknowledged {
            self.attempt
                .failed
                .store(true, std::sync::atomic::Ordering::Release);
        }
    }
}
impl WorkflowContext<'_> {
    fn cursor_scope(&self) -> Option<&(String, u64, u64)> {
        self.iteration
            .as_ref()
            .filter(|(_, _, bound)| *bound == u64::MAX)
    }
    fn cursor_contract(&self, result_type: &str) -> Result<AtMostOnceResultContract, Status> {
        let (alias, version) = self
            .tasks
            .cursor_declaration(&self.task)
            .ok_or_else(|| Status::failed_precondition("workflow has no cursor declaration"))?;
        if alias.is_empty()
            || alias.len() > 256
            || alias.chars().any(char::is_control)
            || version == 0
            || result_type.is_empty()
            || result_type.len() > 512
        {
            return Err(Status::invalid_argument("invalid cursor declaration"));
        }
        Ok(AtMostOnceResultContract {
            method: self
                .tasks
                .declaration(&self.task)
                .ok_or_else(|| Status::failed_precondition("missing workflow declaration"))?
                .method
                .into(),
            request: self.task.request.clone(),
            alias: alias.into(),
            version,
            bound: 0,
            parent_bounds: String::new(),
            result_type: result_type.into(),
            call_contract: b"reboot.workflow.cursor.v1".to_vec(),
        })
    }
    fn cursor_key(&self, domain: &[u8]) -> Result<uuid::Uuid, Status> {
        let id = self
            .task
            .task_id
            .as_ref()
            .ok_or_else(|| Status::failed_precondition("missing cursor task"))?;
        let seed = uuid::Uuid::from_slice(&id.task_uuid)
            .map_err(|_| Status::data_loss("invalid cursor UUID"))?;
        Ok(uuid::Uuid::new_v5(&seed, domain))
    }
    // Check the immutable alias/version binding before delivering a recovered body.
    async fn check_cursor_binding(&self) -> Result<(), Status> {
        if self.tasks.cursor_declaration(&self.task).is_none() {
            return Ok(());
        }
        let contract =
            self.cursor_contract("type.googleapis.com/reboot.rust.workflow.CursorBindingV1")?;
        let saved = self
            .tasks
            .inner
            .store
            .workflow_at_most_once_result_load(
                self,
                self.cursor_key(b"reboot.workflow.cursor.binding.v1")?,
                &contract,
            )
            .await?;
        match saved {
            Some(value)
                if value.phase == 2
                    && value
                        .result
                        .as_ref()
                        .is_some_and(|r| r.value == contract.encode_to_vec()) =>
            {
                Ok(())
            }
            None if self.task.iteration == 0 => Ok(()),
            _ => Err(Status::failed_precondition(
                "cursor binding missing or changed",
            )),
        }
    }
    /// One serial, declared open-ended loop. Continue advances only the canonical
    /// Pending task and atomically reclaims only its prior iteration-scoped
    /// checkpoints; Break is saved at the current cursor.
    pub async fn run_loop<R, F>(
        &mut self,
        alias: &str,
        version: u32,
        result_type: &'static str,
        mut body: F,
    ) -> Result<R, Status>
    where
        R: prost::Message + Default + Send + 'static,
        F: for<'s> FnMut(
                WorkflowContext<'s>,
            ) -> std::pin::Pin<
                Box<
                    dyn std::future::Future<Output = Result<std::ops::ControlFlow<R>, Status>>
                        + Send
                        + 's,
                >,
            > + Send,
    {
        if self.iteration.is_some()
            || !self.parents.is_empty()
            || self.tasks.cursor_declaration(&self.task) != Some((alias, version))
            || self
                .attempt
                .cursor_used
                .swap(true, std::sync::atomic::Ordering::AcqRel)
        {
            return Err(Status::failed_precondition(
                "one matching top-level cursor loop required",
            ));
        }
        let binding =
            self.cursor_contract("type.googleapis.com/reboot.rust.workflow.CursorBindingV1")?;
        let mut decision_contract = self.cursor_contract(result_type)?;
        // Bind the typed Break contract in the binding bytes as well, so changing
        // it after Continue fails before constructing a new iteration body.
        decision_contract.call_contract = result_type.as_bytes().to_vec();
        let binding_key = self.cursor_key(b"reboot.workflow.cursor.binding.v1")?;
        let id = self
            .task
            .task_id
            .clone()
            .ok_or_else(|| Status::failed_precondition("missing cursor task"))?;
        let store = self.tasks.inner.store.clone();
        let capabilities = store
            .task_database()
            .get_capabilities(db::DatabaseCapabilitiesRequest {})
            .await
            .map_err(|status| {
                if status.code() == tonic::Code::Unimplemented {
                    Status::failed_precondition(
                        "Database lacks GetCapabilities: workflow cursors require reboot.workflow-cursor-advance.v1 version 1",
                    )
                } else {
                    status
                }
            })?
            .into_inner();
        if capabilities.workflow_cursor_advance_protocol != "reboot.workflow-cursor-advance.v1"
            || capabilities.workflow_cursor_advance_version != 1
            || !capabilities.workflow_cursor_advance_enabled
        {
            return Err(Status::failed_precondition(
                "Database does not support enabled reboot.workflow-cursor-advance.v1 version 1",
            ));
        }
        let guard = self.attempt.operation();
        let gate = store.actor_gate(&id.state_type, &id.state_ref);
        let mut revisions = gate.committed_revisions();
        {
            let _lease = workflow_reader_lease(&gate, &mut revisions).await?;
            self.validate_scope().await?;
            let existing = store
                .workflow_at_most_once_result_load(self, binding_key, &binding)
                .await?;
            match existing {
                Some(saved)
                    if saved.phase == 2
                        && saved
                            .result
                            .as_ref()
                            .is_some_and(|r| r.value == binding.encode_to_vec()) => {}
                None if self.task.iteration == 0 => {
                    store
                        .workflow_at_most_once_result_save(
                            self,
                            binding_key,
                            &binding,
                            AtMostOnceResultCheckpoint::stored(
                                &binding.result_type,
                                binding.encode_to_vec(),
                            ),
                        )
                        .await?;
                }
                _ => {
                    return Err(Status::failed_precondition(
                        "cursor binding missing or changed",
                    ));
                }
            }
            // A separate invariant typed-result binding shares the root lifetime.
            let typed_key = self.cursor_key(b"reboot.workflow.cursor.result-contract.v1")?;
            match store
                .workflow_at_most_once_result_load(self, typed_key, &decision_contract)
                .await?
            {
                Some(saved) if saved.phase == 1 => {}
                None if self.task.iteration == 0 => {
                    store
                        .workflow_at_most_once_result_save(
                            self,
                            typed_key,
                            &decision_contract,
                            AtMostOnceResultCheckpoint::started(),
                        )
                        .await?
                }
                _ => return Err(Status::failed_precondition("cursor result binding missing")),
            }
        }
        guard.acknowledged();
        let mut driver = CursorDriverGuard {
            attempt: self.attempt,
            acknowledged: false,
        };
        loop {
            if !self.attempt.clean() {
                return Err(Status::failed_precondition("unclean cursor attempt"));
            }
            let scoped = WorkflowContext {
                tasks: self.tasks,
                task: self.task.clone(),
                cancel: self.cancel,
                generation: self.generation.clone(),
                attempt: self.attempt,
                iteration: Some((alias.into(), self.task.iteration, u64::MAX)),
                parents: Vec::new(),
            };
            let key = scoped.checkpoint_key(
                scoped.cursor_key(b"reboot.workflow.cursor.break.v1")?,
                "break",
                None,
            );
            let mut contract =
                AtMostOnceResultContract::decode(decision_contract.encode_to_vec().as_slice())
                    .map_err(|_| Status::internal("cursor contract encoding"))?;
            contract.alias = scoped.checkpoint_alias("break");
            {
                let _lease = workflow_reader_lease(&gate, &mut revisions).await?;
                scoped.validate_scope().await?;
                if let Some(saved) = store
                    .workflow_at_most_once_result_load(&scoped, key, &contract)
                    .await?
                {
                    if saved.phase != 2 {
                        return Err(Status::data_loss("invalid cursor Break"));
                    }
                    let result = saved
                        .result
                        .ok_or_else(|| Status::data_loss("missing cursor Break"))?;
                    let value = R::decode(result.value.as_slice())
                        .map_err(|_| Status::data_loss("malformed cursor Break"))?;
                    self.attempt
                        .cursor_closed
                        .store(true, std::sync::atomic::Ordering::Release);
                    driver.acknowledged = true;
                    return Ok(value);
                }
            }
            let decision = body(scoped).await?;
            // Reserve serial admission after all body helpers have acknowledged.
            let operation = self.attempt.serial_reader_operation()?;
            let _lease = workflow_reader_lease(&gate, &mut revisions).await?;
            self.validate_scope().await?;
            match decision {
                std::ops::ControlFlow::Break(value) => {
                    if value.encoded_len() > 1048576 {
                        return Err(Status::resource_exhausted("cursor Break exceeds 1MiB"));
                    }
                    let scoped = WorkflowContext {
                        tasks: self.tasks,
                        task: self.task.clone(),
                        cancel: self.cancel,
                        generation: self.generation.clone(),
                        attempt: self.attempt,
                        iteration: Some((alias.into(), self.task.iteration, u64::MAX)),
                        parents: Vec::new(),
                    };
                    store
                        .workflow_at_most_once_result_save(
                            &scoped,
                            key,
                            &contract,
                            AtMostOnceResultCheckpoint::stored(result_type, value.encode_to_vec()),
                        )
                        .await?;
                    self.validate_scope().await?;
                    #[cfg(feature = "test-support")]
                    self.wait_test_pause("REBOOT_TEST_CURSOR_AFTER_BREAK_ACK")
                        .await?;
                    operation.acknowledged_serial()?;
                    self.attempt
                        .cursor_closed
                        .store(true, std::sync::atomic::Ordering::Release);
                    driver.acknowledged = true;
                    return Ok(value);
                }
                std::ops::ControlFlow::Continue(()) => {
                    let mut next = self.task.clone();
                    next.iteration = next
                        .iteration
                        .checked_add(1)
                        .ok_or_else(|| Status::out_of_range("workflow cursor overflow"))?;
                    #[cfg(feature = "test-support")]
                    self.wait_test_pause("REBOOT_TEST_CURSOR_BEFORE_STORE")
                        .await?;
                    let mut durable = self.durable();
                    let commit = gate.commit_attempt();
                    let workflow_id = self
                        .task
                        .task_id
                        .as_ref()
                        .ok_or_else(|| Status::failed_precondition("missing cursor task"))?
                        .task_uuid
                        .clone();
                    store
                        .task_database()
                        .advance_workflow_cursor(db::AdvanceWorkflowCursorRequest {
                            successor: Some(next.clone()),
                            workflow_id,
                            completed_iteration: self.task.iteration,
                            sync: true,
                        })
                        .await?;
                    commit.checkpoint_acknowledged();
                    durable.acknowledged();
                    drop(durable);
                    self.task = next;
                    self.attempt
                        .cursor_advanced
                        .store(true, std::sync::atomic::Ordering::Release);
                    self.validate_scope().await?;
                    #[cfg(feature = "test-support")]
                    self.wait_test_pause("REBOOT_TEST_CURSOR_AFTER_ACK").await?;
                    operation.acknowledged_serial()?;
                }
            }
        }
    }
}
