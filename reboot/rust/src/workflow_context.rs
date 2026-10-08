#[cfg(test)]
mod workflow_admission_tests {
    use super::*;
    use crate::runtime::DurableStateDeclaration;
    struct D;
    impl crate::runtime::DurableStateDeclaration for D {
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
            task: &task,
            cancel: &cancel,
            generation: Arc::new(()),
            attempt: &attempt,
            iteration: None,
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
                task: &task,
                cancel: &cancel,
                generation: Arc::new(()),
                attempt: &attempt,
                iteration: None,
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
            task: &task,
            cancel: &cancel,
            generation: Arc::new(()),
            attempt: &attempt,
            iteration: None,
        };
        let seed = uuid::Uuid::new_v4();
        let scoped = context.iteration("a:1", 0, 3).unwrap();
        let legacy_alias = scoped.checkpoint_alias("gate");
        let keys = [
            context.checkpoint_key(seed, &legacy_alias, None),
            scoped.checkpoint_key(seed, "gate", None),
            scoped.checkpoint_key(seed, "gate", Some("condition.v1")),
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
        assert!(scoped.iteration("nested", 0, 1).is_err());
        assert!(!attempt.clean());
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
                task: &task,
                cancel: &cancel,
                generation: Arc::new(()),
                attempt: &attempt,
                iteration: None,
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
                task: &task,
                cancel: &cancel,
                generation: Arc::new(()),
                attempt: &attempt,
                iteration: scoped.then(|| ("loop".into(), 0, 1)),
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
}
impl WorkflowAttempt {
    fn operation(&self) -> WorkflowAttemptOperation<'_> {
        self.active
            .fetch_add(1, std::sync::atomic::Ordering::AcqRel);
        WorkflowAttemptOperation {
            attempt: self,
            acknowledged: false,
        }
    }
    fn clean(&self) -> bool {
        !self.failed.load(std::sync::atomic::Ordering::Acquire)
            && self.active.load(std::sync::atomic::Ordering::Acquire) == 0
    }
}
struct WorkflowAttemptOperation<'a> {
    attempt: &'a WorkflowAttempt,
    acknowledged: bool,
}
impl WorkflowAttemptOperation<'_> {
    fn acknowledged(mut self) {
        self.acknowledged = true;
    }
}
impl Drop for WorkflowAttemptOperation<'_> {
    fn drop(&mut self) {
        if !self.acknowledged {
            self.attempt
                .failed
                .store(true, std::sync::atomic::Ordering::Release);
        }
        self.attempt
            .active
            .fetch_sub(1, std::sync::atomic::Ordering::AcqRel);
    }
}

/// Private, dispatcher-minted workflow authority. Explicit named same-actor
/// typed named writer steps and checkpointed immutable-reader waits. Explicit
/// finite indexed replay scopes only; no unbounded Task cursor, external effects
/// or cross-actor/nested calls.
/// Construction is private, even to generated application consumers:
/// ```compile_fail
/// use reboot_rust_schema::one_shot_tasks::WorkflowContext;
/// let context = WorkflowContext { tasks: Default::default(), task: Default::default(), cancel: Default::default(), generation: Default::default() };
/// ```
/// The workflow body does not own an actor lease; each writer step owns one.
pub struct WorkflowContext<'a> {
    tasks: &'a OneShotTasks,
    task: &'a db::Task,
    cancel: &'a RecoveryCancellation,
    generation: Arc<()>,
    attempt: &'a WorkflowAttempt,
    iteration: Option<(String, u64, u64)>,
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
impl<'a> WorkflowContext<'a> {
    /// Explicit finite replay scope, not an unbounded Task cursor. Restart replays
    /// the bounded body; acknowledged typed decisions/effects are loaded, never
    /// re-evaluated. Use the same loop name, count, indices and named calls on replay.
    /// Nested scopes and more than 1024 iterations are rejected.
    pub fn iteration(
        &self,
        alias: &str,
        index: u64,
        count: u64,
    ) -> Result<WorkflowContext<'a>, Status> {
        let operation = self.attempt.operation();
        if self.iteration.is_some()
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
            task: self.task,
            cancel: self.cancel,
            generation: self.generation.clone(),
            attempt: self.attempt,
            iteration: Some((alias.to_owned(), index, count)),
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
        let mut encoded = Vec::new();
        if let Some((name, index, _)) = &self.iteration {
            encoded.extend_from_slice(&(name.len() as u64).to_be_bytes());
            encoded.extend_from_slice(name.as_bytes());
            encoded.extend_from_slice(&index.to_be_bytes());
        }
        encoded.extend_from_slice(&(alias.len() as u64).to_be_bytes());
        encoded.extend_from_slice(alias.as_bytes());
        uuid::Uuid::new_v5(&namespace, &encoded)
    }
    pub(crate) fn checkpoint_alias(&self, alias: &str) -> String {
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
                let _lease = gate.exclusive().await;
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

    #[cfg(feature = "test-support")]
    async fn wait_test_pause(&self, name: &str) -> Result<(), Status> {
        if let Some(path) = std::env::var_os(name) {
            let path = std::path::PathBuf::from(path);
            std::fs::write(&path, name).map_err(|e| Status::internal(e.to_string()))?;
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
        self.task
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
        let operation = self.attempt.operation();
        if !self.tasks.is_workflow(self.task)
            || self.task.iteration != 0
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
        if loaded.tasks.as_slice() != [self.task.clone()] || !schedule_due(self.task)? {
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
                    (alias, None),
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
        if self.iteration.is_some() || !self.attempt.clean() {
            return Err(Status::failed_precondition(
                "declared workflow terminal requires clean outer scope",
            ));
        }
        let declaration = self
            .tasks
            .declaration(self.task)
            .ok_or_else(|| Status::failed_precondition("unregistered workflow"))?;
        if !declaration.workflow {
            return Err(Status::failed_precondition("not workflow authority"));
        }
        let operation = self.attempt.operation();
        let terminal = db::task::ResponseOrError::Error(error);
        // Validate before the canonical Load; malformed/foreign errors disclose
        // no task bytes and never reach the durable completion path.
        self.tasks.validate_terminal(self.task, &terminal)?;
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
        if self.iteration.is_some() {
            return Err(Status::failed_precondition(
                "finish requires outer workflow scope",
            ));
        }
        let declaration = self
            .tasks
            .declaration(self.task)
            .ok_or_else(|| Status::failed_precondition("unregistered workflow"))?;
        if !declaration.workflow {
            return Err(Status::failed_precondition("not workflow authority"));
        }
        self.tasks
            .validate_executor::<D, Q, R>(self.task, declaration.method, response_type)?;
        self.validate_scope().await?;
        let terminal = db::task::ResponseOrError::Response(prost_types::Any {
            type_url: response_type.to_owned(),
            value: response.encode_to_vec(),
        });
        self.tasks.validate_terminal(self.task, &terminal)?;
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
            task: &task,
            cancel,
            generation: generation.clone(),
            attempt: &attempt,
            iteration: None,
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
                validate_completed(&task, &loaded.tasks[0], None)?;
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
            self.inner.listing.started(&task);
        }
        let receipt = self.inner.binding.execute_workflow(context).await?;
        if receipt.task != task {
            return Err(Status::failed_precondition(
                "workflow receipt identity mismatch",
            ));
        }
        let terminal = match receipt.outcome {
            WorkflowOutcome::PreStoreBodyFailure(error) => {
                cancel.public_ready().await?;
                let admission = RunningTaskAdmission {
                    tasks: self.clone(),
                    generation,
                };
                let _owner = admission.lock()?;
                if !attempt.clean() {
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
            task: &task,
            cancel,
            generation: generation.clone(),
            attempt: &attempt,
            iteration: None,
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
