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
/// writer steps only. No loop, subscription, external effects or nested calls.
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
}
/// Consumed private receipt: user callbacks cannot manufacture completion.
/// Explicit body disposition. Status propagation is always nonretryable, even
/// for Internal (which Tonic can produce for real transport errors).
pub enum WorkflowBodyError {
    Failed(Status),
    /// Opt in only for failed local computation, never transport or external
    /// effects. Runtime evidence still rejects failed/dropped framework work.
    RetryLocal(String),
}
impl From<Status> for WorkflowBodyError {
    fn from(error: Status) -> Self {
        Self::Failed(error)
    }
}
pub struct WorkflowReceipt {
    task: db::Task,
    outcome: WorkflowOutcome,
}
enum WorkflowOutcome {
    Terminal(db::task::ResponseOrError),
    PreStoreBodyFailure(Status),
}
impl WorkflowContext<'_> {
    pub fn task(&self) -> &db::Task {
        self.task
    }
    /// Generated body boundary: explicit local disposition is only a request,
    /// not retry authority. Recheck canonical scope and private operation evidence.
    pub async fn body_failed(self, error: WorkflowBodyError) -> Result<WorkflowReceipt, Status> {
        let message = match error {
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
            .workflow_writer_step::<D, Q, R, F>(self, alias, method, response_type, request, invoke)
            .await?;
        operation.acknowledged();
        Ok(response)
    }
    pub(crate) fn durable(&self) -> DurableTaskOperation<'_> {
        DurableTaskOperation {
            cancel: self.cancel,
            tasks: self.tasks,
            acknowledged: false,
            started: None,
        }
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
        let operation = self.attempt.operation();
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
        };
        context.validate_scope().await?;
        {
            let admission = RunningTaskAdmission {
                tasks: self.clone(),
                generation: generation.clone(),
            };
            let _owner = admission.lock()?;
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
            WorkflowOutcome::Terminal(terminal) => terminal,
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
        }
        .validate_scope()
        .await?;
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
