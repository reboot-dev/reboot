//! Bounded generated same-local-actor reader and ordinary-writer tasks.
//! Declared terminals persist canonical method-typed errors; writer handler failures
//! proven before Store receive at most three host-owned attempts. Reader failures,
//! transport/ACK uncertainty and cancellation are not retried.
//! Absolute UTC schedules are durable, with no sleeping child per task.
//! Explicit named workflows have separate immutable admission/execution and
//! per-step leases; explicit clean local body failures receive three host-owned
//! attempts, replaying acknowledged named checkpoints. Other failures fail closed.
//! Declared returns before completion CAS remain explicitly at least once.
use crate::{
    application_host::{HostRecovery, RecoveryCancellation},
    database_proto as db,
    runtime::DatabaseActorStore,
};
use std::{
    collections::HashSet,
    sync::{Arc, Mutex},
};
include!("workflow_context.rs");
const MAX_TASKS: usize = 1024;
use tokio::{sync::mpsc, task::JoinSet};
use tonic::Status;

/// Generated binding owns the typed decoder and reader handler. Execution is
/// called under a shared actor lease and must not recursively acquire it.
#[tonic::async_trait]
pub trait ReaderTaskBinding: Send + Sync + 'static {
    fn validate(&self, task: &db::Task) -> Result<(), Status>;
    async fn execute(&self, task: &db::Task) -> Result<prost_types::Any, Status>;
    async fn execute_terminal(&self, task: &db::Task) -> Result<db::task::ResponseOrError, Status> {
        self.execute(task)
            .await
            .map(db::task::ResponseOrError::Response)
    }
    fn validate_error(&self, _task: &db::Task, _error: &prost_types::Any) -> Result<(), Status> {
        Err(Status::data_loss("task method does not declare errors"))
    }
    fn validate_terminal(
        &self,
        task: &db::Task,
        terminal: &db::task::ResponseOrError,
    ) -> Result<(), Status> {
        match terminal {
            db::task::ResponseOrError::Response(response) => self.validate_response(task, response),
            db::task::ResponseOrError::Error(error) => self.validate_error(task, error),
        }
    }
    /// Reader-only owners and shared recovery remain the default.
    fn validate_response(
        &self,
        _task: &db::Task,
        _response: &prost_types::Any,
    ) -> Result<(), Status> {
        Err(Status::failed_precondition(
            "binding has no typed writer response validator",
        ))
    }
    fn writer_method(&self, _task: &db::Task) -> Option<&'static str> {
        None
    }
    fn writer_response_type(&self, _task: &db::Task) -> Option<&'static str> {
        None
    }
    fn writer_capable(&self) -> bool {
        false
    }
    /// Workflow execution is distinct from reader or one-shot writer execution.
    async fn execute_workflow(
        &self,
        _context: WorkflowContext<'_>,
    ) -> Result<WorkflowReceipt, Status> {
        Err(Status::failed_precondition("no workflow executor"))
    }
    fn is_writer(&self, _task: &db::Task) -> bool {
        false
    }
    async fn execute_writer(
        &self,
        _admitted: AdmittedWriterTask<'_>,
    ) -> Result<WriterTaskReceipt, Status> {
        Err(Status::failed_precondition("reader-only task owner"))
    }
}

/// Exclusive authority minted only by the registered dispatcher, after canonical
/// reload. Not cloneable or constructible by generated/downstream callers.
/// The dispatcher retains the lease until this capability and completion finish.
pub struct AdmittedWriterTask<'a> {
    pub(crate) store: &'a DatabaseActorStore,
    pub(crate) task: &'a db::Task,
    pub(crate) method: &'static str,
    pub(crate) response_type: &'static str,
    pub(crate) started: &'a std::sync::atomic::AtomicBool,
    cancel: &'a RecoveryCancellation,
    pub(crate) tasks: &'a OneShotTasks,
}
impl AdmittedWriterTask<'_> {
    pub fn task(&self) -> &db::Task {
        self.task
    }
    pub(crate) fn durable(&self) -> DurableTaskOperation<'_> {
        self.started
            .store(true, std::sync::atomic::Ordering::Release);
        DurableTaskOperation {
            cancel: self.cancel,
            tasks: self.tasks,
            acknowledged: false,
            started: None,
        }
    }
}

/// A successful acknowledged Store or strict checkpoint replay; private construction.
/// Custom bindings cannot discard admission and manufacture success:
/// ```compile_fail
/// use reboot_rust_schema::one_shot_tasks::WriterTaskReceipt;
/// let receipt = WriterTaskReceipt { task: Default::default(), response: Default::default() };
/// ```
/// Returning an arbitrary `Any` is not completion authority:
/// ```compile_fail
/// use reboot_rust_schema::one_shot_tasks::WriterTaskReceipt;
/// fn bypass() -> Result<WriterTaskReceipt, tonic::Status> {
///     Ok(prost_types::Any::default())
/// }
/// ```
pub struct WriterTaskReceipt {
    pub(crate) task: db::Task,
    pub(crate) outcome: WriterTaskOutcome,
}
/// Handler disposition is accepted only inside the admitted executor, before Store.
/// It does not itself confer durable completion or retry authority.
pub enum TaskHandlerError {
    Declared(prost_types::Any),
    Failed(Status),
}
impl TaskHandlerError {
    pub fn declared(status: Status) -> Self {
        Self::Declared(prost_types::Any {
            type_url: "type.googleapis.com/google.rpc.Status".to_owned(),
            value: status.details().to_vec(),
        })
    }
}
pub(crate) enum WriterTaskOutcome {
    Terminal(db::task::ResponseOrError),
    PreStoreFailure(Status),
}
// Declaration order at call sites matters: this guard drops BEFORE the lease.
// Arm synchronously before the first potentially durable await; no cancellation gap.
pub(crate) struct DurableTaskOperation<'a> {
    cancel: &'a RecoveryCancellation,
    tasks: &'a OneShotTasks,
    acknowledged: bool,
    started: Option<&'a std::sync::atomic::AtomicBool>,
}
impl DurableTaskOperation<'_> {
    pub(crate) fn acknowledged(&mut self) {
        self.acknowledged = true;
    }
}
impl Drop for DurableTaskOperation<'_> {
    fn drop(&mut self) {
        if !self.acknowledged
            && self
                .started
                .is_none_or(|started| started.load(std::sync::atomic::Ordering::Acquire))
        {
            self.tasks.inner.uncertain.send_replace(true);
            self.cancel.fail();
            #[cfg(feature = "test-support")]
            if let Some(path) = std::env::var_os("REBOOT_TEST_WRITER_FAILURE_BEFORE_RELEASE") {
                let path = std::path::PathBuf::from(path);
                if !path.exists() {
                    let _ = std::fs::write(
                        &path,
                        b"actual durable operation Drop before exclusive lease Drop",
                    );
                    // Hand the worker's runnable queue back to Tokio while the
                    // test holds this synchronous destructor boundary.
                    tokio::task::block_in_place(|| {
                        let start = std::time::Instant::now();
                        while !path.with_extension("release").exists()
                            && start.elapsed() < std::time::Duration::from_secs(10)
                        {
                            std::thread::sleep(std::time::Duration::from_millis(5));
                        }
                    });
                }
            }
        }
    }
}

#[derive(Clone)]
pub struct OneShotTasks {
    inner: Arc<Inner>,
}
/// Immutable registration-time method contract. Registration is application-owned;
/// a binding's overridable validators cannot extend this declaration afterwards.
pub struct TaskMethodDeclaration {
    method: &'static str,
    state_type: &'static str,
    declaration: std::any::TypeId,
    request: std::any::TypeId,
    response: std::any::TypeId,
    response_type: &'static str,
    decode_request: fn(&[u8]) -> Result<(), Status>,
    decode_response: fn(&[u8]) -> Result<(), Status>,
    errors: Vec<DeclaredTaskError>,
    workflow: bool,
    workflow_writer_step: bool,
    workflow_reader_wait: bool,
}
pub struct DeclaredTaskError {
    type_url: &'static str,
    decode: fn(&[u8]) -> Result<(), Status>,
}
fn decode_declared_message<M: prost::Message + Default>(bytes: &[u8]) -> Result<(), Status> {
    M::decode(bytes)
        .map(|_| ())
        .map_err(|_| Status::data_loss("malformed registered task payload"))
}
impl DeclaredTaskError {
    pub fn new<M: prost::Message + Default>(type_url: &'static str) -> Self {
        Self {
            type_url,
            decode: decode_declared_message::<M>,
        }
    }
}
impl TaskMethodDeclaration {
    pub fn new<D, Q, R>(
        method: &'static str,
        response_type: &'static str,
        errors: Vec<DeclaredTaskError>,
    ) -> Self
    where
        D: crate::runtime::DurableStateDeclaration + 'static,
        Q: prost::Message + Default + 'static,
        R: prost::Message + Default + 'static,
    {
        Self {
            method,
            state_type: D::STATE_TYPE,
            declaration: std::any::TypeId::of::<D>(),
            request: std::any::TypeId::of::<Q>(),
            response: std::any::TypeId::of::<R>(),
            response_type,
            decode_request: decode_declared_message::<Q>,
            decode_response: decode_declared_message::<R>,
            errors,
            workflow: false,
            workflow_writer_step: false,
            workflow_reader_wait: false,
        }
    }
    /// Immutable explicit workflow kind; never inferred from a reader binding.
    pub fn workflow(mut self) -> Self {
        self.workflow = true;
        self.workflow_writer_step = false;
        self.workflow_reader_wait = false;
        self
    }
    /// Immutable named workflow writer-step contract, distinct from reader bindings.
    pub fn workflow_writer_step(mut self) -> Self {
        self.workflow = false;
        self.workflow_writer_step = true;
        self.workflow_reader_wait = false;
        self
    }
    /// Wait-only reader authority; never an ordinary scheduled task target.
    pub fn workflow_reader_wait(mut self) -> Self {
        self.workflow = false;
        self.workflow_writer_step = false;
        self.workflow_reader_wait = true;
        self
    }
    fn validate_terminal(&self, terminal: &db::task::ResponseOrError) -> Result<(), Status> {
        match terminal {
            db::task::ResponseOrError::Response(response) => {
                if response.type_url != self.response_type {
                    return Err(Status::data_loss("registered task response type mismatch"));
                }
                (self.decode_response)(&response.value)
            }
            db::task::ResponseOrError::Error(error) => {
                let rich = decode_task_error(error)?;
                let detail = &rich.details[0];
                let declared = self
                    .errors
                    .iter()
                    .find(|declared| declared.type_url == detail.type_url)
                    .ok_or_else(|| {
                        Status::data_loss("task error not declared by registered method")
                    })?;
                (declared.decode)(&detail.value)
            }
        }
    }
}
struct Inner {
    store: DatabaseActorStore,
    state_type: String,
    state_ref: String,
    binding: Arc<dyn ReaderTaskBinding>,
    declarations: Vec<TaskMethodDeclaration>,
    sender: mpsc::Sender<()>,
    receiver: Mutex<Option<mpsc::Receiver<()>>>,
    active: std::sync::atomic::AtomicBool,
    recovery_request: Mutex<Option<db::RecoverRequest>>,
    running_owner: Mutex<Option<Arc<()>>>,
    uncertain: tokio::sync::watch::Sender<bool>,
    max_live: std::sync::atomic::AtomicUsize,
    #[cfg(feature = "test-support")]
    completed_operations: std::sync::atomic::AtomicUsize,
}
impl OneShotTasks {
    /// Set the host-owned pending/delivery budget before recovery starts.
    /// Defaults to the durable admission bound (1024). Parked bodies consume
    /// this budget, so scheduling rejects excess Pending rather than accepting
    /// work that cannot run until another workflow's predicate becomes true.
    /// Recovery also rejects a pending set above this budget. RPC admission is
    /// separate; every accepted due ID has a delivery slot.
    pub fn set_max_live_deliveries(&self, limit: usize) -> Result<(), Status> {
        if limit == 0 || limit > MAX_TASKS {
            return Err(Status::invalid_argument("live task limit must be 1..1024"));
        }
        let owner = self
            .inner
            .running_owner
            .lock()
            .expect("task owner mutex poisoned");
        if owner.is_some() || self.inner.active.load(std::sync::atomic::Ordering::Acquire) {
            return Err(Status::failed_precondition(
                "delivery budget is immutable after host recovery starts",
            ));
        }
        self.inner
            .max_live
            .store(limit, std::sync::atomic::Ordering::Release);
        Ok(())
    }
    pub fn new(
        store: DatabaseActorStore,
        state_type: String,
        state_ref: String,
        binding: impl ReaderTaskBinding,
    ) -> Result<Self, Status> {
        Self::new_with_declarations(store, state_type, state_ref, binding, vec![])
    }
    /// Register immutable generated method contracts independently of custom binding hooks.
    /// Empty legacy registrations remain response-only and cannot mint declared receipts.
    pub fn new_with_declarations(
        store: DatabaseActorStore,
        state_type: String,
        state_ref: String,
        binding: impl ReaderTaskBinding,
        declarations: Vec<TaskMethodDeclaration>,
    ) -> Result<Self, Status> {
        let mut methods = HashSet::new();
        for declaration in &declarations {
            if declaration.state_type != state_type
                || !methods.insert(declaration.method.rsplit('.').next())
            {
                return Err(Status::invalid_argument(
                    "ambiguous or wrong-state task declaration",
                ));
            }
        }
        if state_type.is_empty() || state_ref.is_empty() {
            return Err(Status::invalid_argument(
                "task actor identity must be explicit",
            ));
        }
        let (sender, receiver) = mpsc::channel(1);
        Ok(Self {
            inner: Arc::new(Inner {
                store,
                state_type,
                state_ref,
                binding: Arc::new(binding),
                declarations,
                sender,
                receiver: Mutex::new(Some(receiver)),
                active: false.into(),
                recovery_request: Mutex::new(None),
                running_owner: Mutex::new(None),
                uncertain: tokio::sync::watch::channel(false).0,
                max_live: std::sync::atomic::AtomicUsize::new(MAX_TASKS),
                #[cfg(feature = "test-support")]
                completed_operations: 0.into(),
            }),
        })
    }
    #[cfg(feature = "test-support")]
    pub fn completed_operations(&self) -> usize {
        self.inner
            .completed_operations
            .load(std::sync::atomic::Ordering::Acquire)
    }
    #[cfg(feature = "test-support")]
    pub fn has_uncertain_operation(&self) -> bool {
        *self.inner.uncertain.borrow()
    }
    fn declaration(&self, task: &db::Task) -> Option<&TaskMethodDeclaration> {
        self.inner
            .declarations
            .iter()
            .find(|declaration| declaration.method.rsplit('.').next() == Some(task.method.as_str()))
    }
    pub(crate) fn validate_executor<D: 'static, Q: 'static, R: 'static>(
        &self,
        task: &db::Task,
        method: &str,
        response_type: &str,
    ) -> Result<(), Status> {
        if let Some(declaration) = self.declaration(task) {
            if declaration.method != method
                || declaration.response_type != response_type
                || declaration.declaration != std::any::TypeId::of::<D>()
                || declaration.request != std::any::TypeId::of::<Q>()
                || declaration.response != std::any::TypeId::of::<R>()
            {
                return Err(Status::failed_precondition(
                    "registered task executor association mismatch",
                ));
            }
            (declaration.decode_request)(&task.request)?;
        }
        Ok(())
    }
    pub(crate) fn validate_declared(
        &self,
        task: &db::Task,
        error: &prost_types::Any,
    ) -> Result<(), Status> {
        self.declaration(task)
            .ok_or_else(|| {
                Status::failed_precondition(
                    "declared terminal requires registered method authority",
                )
            })?
            .validate_terminal(&db::task::ResponseOrError::Error(error.clone()))
    }
    fn validate_terminal(
        &self,
        task: &db::Task,
        terminal: &db::task::ResponseOrError,
    ) -> Result<(), Status> {
        if let Some(declaration) = self.declaration(task) {
            declaration.validate_terminal(terminal)?;
        } else if matches!(terminal, db::task::ResponseOrError::Error(_)) {
            return Err(Status::failed_precondition(
                "unregistered declared task terminal",
            ));
        }
        self.inner.binding.validate_terminal(task, terminal)
    }
    #[doc(hidden)]
    pub(crate) async fn validate_guard_execution<
        P: crate::durable_participant::ParticipantSidecar,
    >(
        &self,
        local: &crate::durable_participant::StartedLocalTransaction<P>,
        context: &crate::runtime::TransactionContext,
    ) -> Result<(), Status> {
        local
            .validate_task_execution(
                context,
                &self.inner.store,
                &self.inner.state_type,
                &self.inner.state_ref,
            )
            .await
    }

    pub(crate) fn workflow_writer_response_type(
        &self,
        method: &str,
    ) -> Result<&'static str, Status> {
        self.inner
            .declarations
            .iter()
            .find(|d| d.method == method && !d.workflow)
            .map(|d| d.response_type)
            .ok_or_else(|| {
                Status::failed_precondition("missing scheduling writer result declaration")
            })
    }
    pub(crate) fn validate_scheduling_replay(
        &self,
        expected: &[db::Task],
        loaded: &[db::Task],
    ) -> Result<(), Status> {
        self.validate(expected)?;
        if loaded.len() != expected.len() {
            return Err(Status::failed_precondition(
                "scheduling replay task set mismatch",
            ));
        }
        for task in expected {
            let matches: Vec<_> = loaded
                .iter()
                .filter(|t| t.task_id == task.task_id)
                .collect();
            if matches.len() != 1 || !self.is_workflow(task) {
                return Err(Status::failed_precondition(
                    "scheduling replay task authority mismatch",
                ));
            }
            let canonical = matches[0];
            if canonical.status == db::task::Status::Completed as i32 {
                validate_completed(task, canonical, None)?;
                self.validate_terminal(
                    canonical,
                    canonical
                        .response_or_error
                        .as_ref()
                        .expect("validated terminal"),
                )?;
            } else if canonical != task {
                return Err(Status::failed_precondition(
                    "scheduling replay pending method/payload mismatch",
                ));
            }
        }
        Ok(())
    }
    pub(crate) fn workflow_running_admission(&self) -> Result<RunningTaskAdmission, Status> {
        let generation = self
            .inner
            .running_owner
            .lock()
            .expect("task owner mutex poisoned")
            .clone()
            .ok_or_else(|| Status::failed_precondition("workflow owner not running"))?;
        let admission = RunningTaskAdmission {
            tasks: self.clone(),
            generation,
        };
        {
            let _owner = admission.lock()?;
        }
        Ok(admission)
    }
    pub(crate) fn validate_workflow_writer<
        D: crate::runtime::DurableStateDeclaration + 'static,
        Q: 'static,
        R: 'static,
    >(
        &self,
        method: &str,
    ) -> Result<(), Status> {
        let declaration = self
            .inner
            .declarations
            .iter()
            .find(|d| d.method == method)
            .ok_or_else(|| Status::failed_precondition("unregistered scheduling writer"))?;
        if declaration.workflow
            || !declaration.workflow_writer_step
            || declaration.declaration != std::any::TypeId::of::<D>()
            || declaration.request != std::any::TypeId::of::<Q>()
            || declaration.response != std::any::TypeId::of::<R>()
        {
            return Err(Status::failed_precondition(
                "scheduling writer descriptor mismatch",
            ));
        }
        let probe = db::Task {
            method: method.rsplit('.').next().unwrap_or("").to_owned(),
            ..Default::default()
        };
        if !self.inner.binding.is_writer(&probe) {
            return Err(Status::failed_precondition("not ordinary writer"));
        }
        Ok(())
    }
    pub(crate) fn validate_scheduling_store(
        &self,
        store: &DatabaseActorStore,
        state_type: &str,
        state_ref: &str,
    ) -> Result<(), Status> {
        if self.inner.store.database_endpoint() != store.database_endpoint()
            || self.inner.state_type != state_type
            || self.inner.state_ref != state_ref
        {
            return Err(Status::failed_precondition(
                "workflow scheduling owner/store mismatch",
            ));
        }
        Ok(())
    }
    /// Whether the validated batch contains an ordinary writer target.
    pub fn contains_writer(&self, tasks: &[db::Task]) -> bool {
        tasks
            .iter()
            .any(|task| self.inner.binding.is_writer(task) || self.is_workflow(task))
    }
    /// Validate the whole staged set before the participant stages any data.
    pub fn validate(&self, tasks: &[db::Task]) -> Result<(), Status> {
        if tasks.len() > MAX_TASKS {
            return Err(Status::resource_exhausted(
                "one-shot task admission exceeds 1024",
            ));
        }
        let mut ids = HashSet::new();
        for task in tasks {
            let id = task
                .task_id
                .as_ref()
                .ok_or_else(|| Status::invalid_argument("missing task ID"))?;
            if id.state_type != self.inner.state_type
                || id.state_ref != self.inner.state_ref
                || uuid::Uuid::from_slice(&id.task_uuid).map_or(true, |id| {
                    id.get_version_num() != 4 || id.get_variant() != uuid::Variant::RFC4122
                })
            {
                return Err(Status::invalid_argument(
                    "task must name the registered local actor and a UUID",
                ));
            }
            if task.status != db::task::Status::Pending as i32
                || task.response_or_error.is_some()
                || task.iteration != 0
            {
                return Err(Status::invalid_argument(
                    "only pending one-shot tasks are supported",
                ));
            }
            if !ids.insert(id.task_uuid.clone()) {
                return Err(Status::invalid_argument("duplicate task UUID"));
            }
            scheduled_at(task)?;
            if self
                .declaration(task)
                .is_some_and(|d| d.workflow_reader_wait)
            {
                return Err(Status::failed_precondition(
                    "reader wait descriptor cannot be scheduled as a task",
                ));
            }
            if self.is_workflow(task) {
                if !self.inner.binding.writer_capable() {
                    return Err(Status::failed_precondition(
                        "reader-only owner cannot admit workflow",
                    ));
                }
                (self
                    .declaration(task)
                    .expect("registered workflow")
                    .decode_request)(&task.request)?;
            }
            self.inner.binding.validate(task)?;
        }
        Ok(())
    }
    /// Canonical Wait for this registered local actor. Mount as a PUBLIC
    /// service under ApplicationHost readiness; not a recovery/control route.
    /// Supply the host-owned application/server identity and shared accepted
    /// placement. This checks read-serving authority, not dispatcher fencing.
    pub fn wait_service(
        &self,
        application: crate::legacy_placement::LegacyApplicationId,
        server_id: impl Into<String>,
        placement: crate::legacy_placement::PlanOnlyLegacyPlacement,
    ) -> db::tasks_server::TasksServer<ReaderTaskWaitService> {
        db::tasks_server::TasksServer::new(ReaderTaskWaitService {
            tasks: [(
                (self.inner.state_type.clone(), self.inner.state_ref.clone()),
                self.clone(),
            )]
            .into(),
            application,
            server_id: server_id.into(),
            placement,
        })
    }
    // Called only while the registry owns this actor's DispatchOwner claim.
    // A clone may have survived an earlier singleton registration; never carry
    // that admission authority into shared reader-only recovery.
    fn activate_reader_only(&self) {
        *self
            .inner
            .recovery_request
            .lock()
            .expect("task recovery mutex poisoned") = None;
        self.inner
            .active
            .store(true, std::sync::atomic::Ordering::Release);
    }
    /// Scheduling is usable only after host registration has taken ownership.
    pub async fn validate_staged(&self, tasks: &[db::Task]) -> Result<(), Status> {
        self.validate_staged_admission(tasks).await.map(|_| ())
    }

    pub(crate) async fn validate_staged_admission(
        &self,
        tasks: &[db::Task],
    ) -> Result<RunningTaskAdmission, Status> {
        // Preserve the public denial order: stopped owner, malformed batch,
        // then absent scheduling recovery owner. Reader-only registries have
        // an active dispatcher claim but deliberately no Recover request.
        if !self.inner.active.load(std::sync::atomic::Ordering::Acquire) {
            return Err(Status::failed_precondition(
                "task dispatcher has no running host owner",
            ));
        }
        self.validate(tasks)?;
        let admission = RunningTaskAdmission {
            tasks: self.clone(),
            generation: self
                .inner
                .running_owner
                .lock()
                .expect("task owner mutex poisoned")
                .clone()
                .ok_or_else(|| {
                    Status::failed_precondition("task dispatcher has no running host owner")
                })?,
        };
        let request = self
            .inner
            .recovery_request
            .lock()
            .expect("task recovery mutex poisoned")
            .clone()
            .ok_or_else(|| Status::failed_precondition("no task recovery owner"))?;
        {
            // A snapshot is not authority: reject shutdown/restart before
            // Recover, after each await, and again at effect publication.
            let _owner = admission.lock()?;
        }
        let pending = self.pending(request).await?;
        {
            let _owner = admission.lock()?;
        }
        #[cfg(feature = "test-support")]
        if let Some(marker) = std::env::var_os("REBOOT_TEST_TASK_ADMISSION_CANCEL") {
            let marker = std::path::Path::new(&marker);
            if !marker.exists() {
                std::fs::write(
                    marker,
                    "canonical Recover complete; admission Load not staged",
                )
                .map_err(|error| Status::internal(error.to_string()))?;
                struct AdmissionDrop(std::path::PathBuf);
                impl Drop for AdmissionDrop {
                    fn drop(&mut self) {
                        let _ = std::fs::write(
                            self.0.with_extension("future-dropped"),
                            b"actual validation future dropped",
                        );
                    }
                }
                let _drop = AdmissionDrop(marker.to_path_buf());
                std::future::pending::<()>().await;
            }
        }
        let max_live = self
            .inner
            .max_live
            .load(std::sync::atomic::Ordering::Acquire);
        if pending.len().saturating_add(tasks.len()) > max_live {
            return Err(Status::resource_exhausted(
                "pending plus staged tasks exceed live delivery budget",
            ));
        }
        // Caller retains the participant exclusive actor admission until staging.
        let existing = self
            .inner
            .store
            .task_database()
            .load(db::LoadRequest {
                actors: vec![],
                task_ids: tasks
                    .iter()
                    .map(|task| task.task_id.clone().expect("validated ID"))
                    .collect(),
            })
            .await?
            .into_inner();
        if !existing.tasks.is_empty() {
            return Err(Status::already_exists("task UUID already persisted"));
        }
        {
            let _owner = admission.lock()?;
        }
        Ok(admission)
    }

    /// Transfers a scheduling root to host-owned failure supervision before
    /// coordinator Prepare may become durable. Drop never aborts or releases
    /// uncertain participant ownership; the host must restart through recovery.
    pub fn own_root_handoff(&self) -> SchedulingRootHandoff {
        SchedulingRootHandoff {
            tasks: self.clone(),
            completed: false,
        }
    }

    /// Called only after acknowledged root completion released participant
    /// ownership. Failure to queue never manufactures a durable completion.
    pub fn dispatch_committed(&self, _tasks: Vec<db::Task>) {
        #[cfg(feature = "test-support")]
        if let Some(path) = std::env::var_os("REBOOT_TEST_TASK_DISPATCH_HINT") {
            std::fs::write(path, b"actual generated dispatch notification").unwrap();
        }
        if self.inner.active.load(std::sync::atomic::Ordering::Acquire) {
            let _ = self.inner.sender.try_send(());
        }
    }
    /// Recover the complete shard stream before validating or dispatching any
    /// task. Unknown actors/methods fail startup rather than being skipped.
    /// Register once, after planner and participant/coordinator recovery.
    pub fn recovery(&self, request: db::RecoverRequest) -> OneShotTaskRecovery {
        OneShotTaskRecovery {
            tasks: self.clone(),
            request,
        }
    }
    async fn pending(&self, request: db::RecoverRequest) -> Result<Vec<db::Task>, Status> {
        let mut stream = self
            .inner
            .store
            .task_database()
            .recover(request)
            .await?
            .into_inner();
        let mut pending = Vec::new();
        while let Some(batch) = stream.message().await? {
            if pending.len().saturating_add(batch.pending_tasks.len()) > MAX_TASKS {
                return Err(Status::resource_exhausted(
                    "durable pending task admission exceeds 1024",
                ));
            }
            pending.extend(batch.pending_tasks);
        }
        self.validate(&pending)?;
        Ok(pending)
    }
    async fn execute(&self, task: db::Task, cancel: &RecoveryCancellation) -> Result<(), Status> {
        if self.is_workflow(&task) {
            return self.execute_workflow_task(task, cancel).await;
        }
        // Framework-owned bounded retry, only for runtime-sealed pre-Store failure.
        // Each attempt reloads and readmits the same durable identity and schedule.
        for attempt in 0..3u32 {
            match self.execute_once(task.clone(), cancel).await? {
                None => return Ok(()),
                Some(error) if attempt == 2 => return Err(error),
                Some(_) => {
                    tokio::time::sleep(std::time::Duration::from_millis(25 << attempt)).await
                }
            }
        }
        unreachable!("bounded task retry")
    }
    async fn execute_once(
        &self,
        mut task: db::Task,
        cancel: &RecoveryCancellation,
    ) -> Result<Option<Status>, Status> {
        let id = task.task_id.clone().expect("validated task identity");
        let gate = self.inner.store.actor_gate(&id.state_type, &id.state_ref);
        if self.inner.binding.is_writer(&task) {
            let _lease = gate.exclusive().await;
            cancel.public_ready().await?;
            let loaded = self
                .inner
                .store
                .task_database()
                .load(db::LoadRequest {
                    actors: vec![],
                    task_ids: vec![id.clone()],
                })
                .await?
                .into_inner();
            if loaded.tasks.len() != 1 {
                return Err(Status::failed_precondition(
                    "committed writer task missing or ambiguous",
                ));
            }
            let canonical = &loaded.tasks[0];
            if canonical.status == db::task::Status::Completed as i32 {
                validate_completed(&task, canonical, None)?;
                self.validate_terminal(
                    canonical,
                    canonical
                        .response_or_error
                        .as_ref()
                        .expect("validated terminal"),
                )?;
                return Ok(None);
            }
            if canonical != &task {
                return Err(Status::failed_precondition(
                    "committed writer task differs from dispatch",
                ));
            }
            if !schedule_due(canonical)? {
                return Ok(None);
            }
            let started = std::sync::atomic::AtomicBool::new(false);
            let mut whole_execution = DurableTaskOperation {
                cancel,
                tasks: self,
                acknowledged: false,
                started: Some(&started),
            };
            let admitted = AdmittedWriterTask {
                store: &self.inner.store,
                task: &task,
                method: self.inner.binding.writer_method(&task).ok_or_else(|| {
                    Status::failed_precondition("missing generated writer descriptor")
                })?,
                response_type: self
                    .inner
                    .binding
                    .writer_response_type(&task)
                    .ok_or_else(|| {
                        Status::failed_precondition("missing generated writer response descriptor")
                    })?,
                started: &started,
                cancel,
                tasks: self,
            };
            let receipt = match self.inner.binding.execute_writer(admitted).await {
                Ok(response) => response,
                Err(error) => {
                    self.inner.uncertain.send_replace(true);
                    cancel.fail(); // BEFORE exclusive lease release, including handler Status.
                    return Err(error);
                }
            };
            if receipt.task != task {
                return Err(Status::failed_precondition(
                    "durable receipt task identity mismatch",
                ));
            }
            let terminal = match receipt.outcome {
                WriterTaskOutcome::Terminal(terminal) => terminal,
                WriterTaskOutcome::PreStoreFailure(error) => {
                    // Pre-Store does not establish local computation provenance:
                    // handlers can perform external IO. Never implicitly retry
                    // an ordinary writer's arbitrary Status.
                    whole_execution.acknowledged();
                    return Err(error);
                }
            };
            self.validate_terminal(&task, &terminal)?;
            #[cfg(feature = "test-support")]
            if let Some(path) = std::env::var_os("REBOOT_TEST_TASK_BEFORE_COMPLETE") {
                std::fs::write(path, b"handler returned; before completion CAS")
                    .map_err(|error| Status::internal(error.to_string()))?;
                std::future::pending::<()>().await;
            }
            task.status = db::task::Status::Completed as i32;
            task.response_or_error = Some(terminal.clone());
            let mut operation = DurableTaskOperation {
                cancel,
                tasks: self,
                acknowledged: false,
                started: None,
            };
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
            #[cfg(feature = "test-support")]
            if let Some(path) = std::env::var_os("REBOOT_TEST_WRITER_AFTER_COMPLETE") {
                let path = std::path::PathBuf::from(path);
                std::fs::write(&path, b"actual CompleteTask ACK")
                    .map_err(|e| Status::internal(e.to_string()))?;
                while !path.with_extension("release").exists() {
                    tokio::time::sleep(std::time::Duration::from_millis(10)).await;
                }
                return Err(Status::unavailable("lost actual CompleteTask ACK"));
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
                if loaded.tasks.len() != 1 {
                    return Err(Status::failed_precondition(
                        "losing completion has no canonical result",
                    ));
                }
                validate_completed(&task, &loaded.tasks[0], None)?;
                if loaded.tasks[0].response_or_error.as_ref() != Some(&terminal) {
                    return Err(Status::failed_precondition("conflicting completion winner"));
                }
                self.validate_terminal(&loaded.tasks[0], &terminal)?;
            }
            operation.acknowledged();
            whole_execution.acknowledged();
            #[cfg(feature = "test-support")]
            self.inner
                .completed_operations
                .fetch_add(1, std::sync::atomic::Ordering::Release);
            return Ok(None);
        }

        let response = {
            let _lease = gate.shared().await;
            cancel.public_ready().await?;
            // Actor admission may have waited while the wall clock moved back.
            // Recheck before user code, leaving the durable record pending.
            if !schedule_due(&task)? {
                return Ok(None);
            }
            // Do not re-deliver already completed records queued by a duplicate.
            let loaded = self
                .inner
                .store
                .task_database()
                .load(db::LoadRequest {
                    actors: vec![],
                    task_ids: vec![id.clone()],
                })
                .await?
                .into_inner();
            let Some(pending) = loaded.tasks.first() else {
                return Err(Status::not_found("committed task is missing"));
            };
            if loaded.tasks.len() != 1 {
                return Err(Status::failed_precondition(
                    "ambiguous committed reader task",
                ));
            }
            if pending.status == db::task::Status::Completed as i32 {
                validate_completed(&task, pending, None)?;
                self.validate_terminal(
                    pending,
                    pending
                        .response_or_error
                        .as_ref()
                        .expect("validated terminal"),
                )?;
                return Ok(None);
            }
            if pending != &task {
                return Err(Status::failed_precondition(
                    "committed task differs from dispatch",
                ));
            }
            if !schedule_due(&task)? {
                return Ok(None);
            }
            self.inner.binding.execute_terminal(&task).await?
        };
        let _lease = gate.exclusive().await;
        cancel.public_ready().await?;
        self.validate_terminal(&task, &response)?;
        task.status = db::task::Status::Completed as i32;
        task.response_or_error = Some(response.clone());
        let mut operation = DurableTaskOperation {
            cancel,
            tasks: self,
            acknowledged: false,
            started: None,
        };
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
            if loaded.tasks.len() != 1 {
                return Err(Status::failed_precondition(
                    "losing completion has no canonical result",
                ));
            }
            validate_completed(&task, &loaded.tasks[0], None)?;
            if loaded.tasks[0].response_or_error.as_ref() != Some(&response) {
                return Err(Status::failed_precondition("conflicting completion winner"));
            }
            self.validate_terminal(&loaded.tasks[0], &response)?;
        }
        operation.acknowledged();
        Ok(None)
    }
}

fn validate_completed(
    expected: &db::Task,
    canonical: &db::Task,
    response: Option<&prost_types::Any>,
) -> Result<(), Status> {
    let mut pending = canonical.clone();
    pending.status = expected.status;
    pending.response_or_error = expected.response_or_error.clone();
    if pending != *expected || canonical.status != db::task::Status::Completed as i32 {
        return Err(Status::failed_precondition(
            "canonical completion identity/scheduling mismatch",
        ));
    }
    match &canonical.response_or_error {
        Some(db::task::ResponseOrError::Response(saved))
            if !saved.type_url.is_empty()
                && response.is_none_or(|candidate| saved == candidate) =>
        {
            Ok(())
        }
        Some(db::task::ResponseOrError::Error(error)) if response.is_none() => {
            decode_task_error(error)?;
            Ok(())
        }
        _ => Err(Status::failed_precondition(
            "canonical completion response mismatch",
        )),
    }
}

/// Decode the complete canonical google.rpc.Status, not a bare payload or tonic code.
pub fn decode_task_error(
    error: &prost_types::Any,
) -> Result<googleapis_tonic_google_rpc::google::rpc::Status, Status> {
    use prost::Message;
    if error.type_url != "type.googleapis.com/google.rpc.Status" {
        return Err(Status::data_loss(
            "task error is not canonical google.rpc.Status",
        ));
    }
    let status = googleapis_tonic_google_rpc::google::rpc::Status::decode(error.value.as_slice())
        .map_err(|_| Status::data_loss("malformed task error status"))?;
    if !(1..=16).contains(&status.code) || status.details.len() != 1 {
        return Err(Status::data_loss(
            "task error must contain one declared detail and a non-OK code",
        ));
    }
    Ok(status)
}
/// Non-cloneable ownership of a generated scheduling root durable handoff.
pub struct SchedulingRootHandoff {
    tasks: OneShotTasks,
    completed: bool,
}
impl SchedulingRootHandoff {
    pub fn completed(&mut self) {
        self.completed = true;
    }
}
impl Drop for SchedulingRootHandoff {
    fn drop(&mut self) {
        if !self.completed {
            self.tasks.inner.uncertain.send_replace(true);
        }
    }
}

// Private, non-cloneable capability. Arc identity cannot ABA while this
// capability retains the old allocation; no public validation receipt exists.
pub(crate) struct RunningTaskAdmission {
    tasks: OneShotTasks,
    generation: Arc<()>,
}
impl RunningTaskAdmission {
    pub(crate) fn lock(&self) -> Result<std::sync::MutexGuard<'_, Option<Arc<()>>>, Status> {
        let owner = self
            .tasks
            .inner
            .running_owner
            .lock()
            .expect("task owner mutex poisoned");
        if *self.tasks.inner.uncertain.borrow() {
            return Err(Status::unavailable(
                "durable task outcome uncertain; restart required",
            ));
        }
        if !owner
            .as_ref()
            .is_some_and(|current| Arc::ptr_eq(current, &self.generation))
            || !self
                .tasks
                .inner
                .active
                .load(std::sync::atomic::Ordering::Acquire)
            || self
                .tasks
                .inner
                .recovery_request
                .lock()
                .expect("task recovery mutex poisoned")
                .is_none()
        {
            return Err(Status::failed_precondition(
                "task dispatcher running owner changed during admission",
            ));
        }
        Ok(owner)
    }
}

type OwnerKey = (String, String, String);
fn owners() -> &'static Mutex<HashSet<OwnerKey>> {
    static OWNERS: std::sync::OnceLock<Mutex<HashSet<OwnerKey>>> = std::sync::OnceLock::new();
    OWNERS.get_or_init(|| Mutex::new(HashSet::new()))
}
struct DispatchOwner {
    tasks: OneShotTasks,
    key: OwnerKey,
}
impl DispatchOwner {
    fn claim(tasks: OneShotTasks) -> Result<Self, Status> {
        let key = (
            tasks.inner.store.database_endpoint().to_owned(),
            tasks.inner.state_type.clone(),
            tasks.inner.state_ref.clone(),
        );
        if !owners()
            .lock()
            .expect("owner registry poisoned")
            .insert(key.clone())
        {
            return Err(Status::already_exists(
                "local actor task dispatcher already owned",
            ));
        }
        *tasks
            .inner
            .running_owner
            .lock()
            .expect("task owner mutex poisoned") = Some(Arc::new(()));
        Ok(Self { tasks, key })
    }
    fn revoke(&self) {
        // Revoke publication immediately, but retain registry ownership until
        // the last delivery future has actually been destroyed.
        let mut owner = self
            .tasks
            .inner
            .running_owner
            .lock()
            .expect("task owner mutex poisoned");
        *owner = None;
        self.tasks
            .inner
            .active
            .store(false, std::sync::atomic::Ordering::Release);
        *self
            .tasks
            .inner
            .recovery_request
            .lock()
            .expect("task recovery mutex poisoned") = None;
    }
}
struct DispatchSupervisorOwner(Arc<DispatchOwner>);
impl Drop for DispatchSupervisorOwner {
    fn drop(&mut self) {
        self.0.revoke();
    }
}
fn spawn_owned_delivery<T: Send + 'static>(
    deliveries: &mut JoinSet<T>,
    owner: &Arc<DispatchOwner>,
    delivery: impl std::future::Future<Output = T> + Send + 'static,
) {
    // Capture before spawn/first poll: forced supervisor abortion only requests
    // child abortion; a synchronous callback may still be executing elsewhere.
    let owner = owner.clone();
    deliveries.spawn(async move {
        let _owner = owner;
        delivery.await
    });
}
async fn abort_drain_deliveries(
    deliveries: &mut JoinSet<(Vec<u8>, Result<(), Status>)>,
    mut result: Result<(), Status>,
    mut replace_fallback: bool,
) -> Result<(), Status> {
    deliveries.abort_all();
    while let Some(joined) = deliveries.join_next().await {
        if let Ok((_, Err(error))) = joined {
            // A selected owned-work error is primary. Only a supervision
            // fallback (or successful cancellation) may adopt a child error;
            // subsequent readiness failures cannot overwrite that diagnostic.
            if replace_fallback || result.is_ok() {
                result = Err(error);
                replace_fallback = false;
            }
        }
    }
    result
}
impl Drop for DispatchOwner {
    fn drop(&mut self) {
        // Same mutex as final staging consumption: shutdown either precedes
        // admission (rejected) or follows the synchronous effect publication.
        let mut owner = self
            .tasks
            .inner
            .running_owner
            .lock()
            .expect("task owner mutex poisoned");
        *owner = None;
        self.tasks
            .inner
            .active
            .store(false, std::sync::atomic::Ordering::Release);
        *self
            .tasks
            .inner
            .recovery_request
            .lock()
            .expect("task recovery mutex poisoned") = None;
        owners()
            .lock()
            .expect("owner registry poisoned")
            .remove(&self.key);
    }
}
pub struct OneShotTaskRecovery {
    tasks: OneShotTasks,
    request: db::RecoverRequest,
}
#[tonic::async_trait]
impl HostRecovery for OneShotTaskRecovery {
    async fn start(
        &self,
        supervisor: &mut JoinSet<Result<(), Status>>,
        cancel: RecoveryCancellation,
    ) -> Result<(), Status> {
        if self.request.shard_ids.is_empty()
            || !self
                .request
                .state_tags_by_state_type
                .contains_key(&self.tasks.inner.state_type)
        {
            return Err(Status::invalid_argument(
                "task recovery needs exact shard IDs and registered state tag",
            ));
        }
        let owner = DispatchOwner::claim(self.tasks.clone())?;
        let max_live = self
            .tasks
            .inner
            .max_live
            .load(std::sync::atomic::Ordering::Acquire);
        let pending = self.tasks.pending(self.request.clone()).await?;
        if pending.len() > max_live {
            return Err(Status::resource_exhausted(
                "recovered pending tasks exceed live delivery budget",
            ));
        }
        *self
            .tasks
            .inner
            .recovery_request
            .lock()
            .expect("task recovery mutex poisoned") = Some(self.request.clone());
        let mut receiver = self
            .tasks
            .inner
            .receiver
            .lock()
            .expect("task receiver mutex poisoned")
            .take()
            .ok_or_else(|| Status::failed_precondition("task recovery already registered"))?;
        let tasks = self.tasks.clone();
        let request = self.request.clone();
        let mut uncertain = tasks.inner.uncertain.subscribe();
        tasks
            .inner
            .active
            .store(true, std::sync::atomic::Ordering::Release);
        supervisor.spawn(async move {
            let _owner = DispatchSupervisorOwner(Arc::new(owner));
            // One child per admitted ID, bounded by the admission budget.
            // Parked bodies cannot consume slots promised to other accepted IDs.
            // Completed-but-not-yet-joined children can briefly occupy slots;
            // canonical rescans retry after they are joined, without detached work.
            // Exclusive actor admission still serializes durable state operations.
            let mut deliveries = JoinSet::new();
            let work = async {
                cancel.public_ready().await?;
                let mut pending = pending;
                let mut inflight = HashSet::new();
                loop {
                    for task in pending {
                        cancel.public_ready().await?;
                        // Future work does not block immediate tasks later in
                        // this batch. Canonical rescans remain bounded and own
                        // all scheduling; no detached timer is created.
                        let id = task.task_id.clone().ok_or_else(|| Status::data_loss("pending task lacks ID"))?;
                        let key = id.task_uuid.clone();
                        if schedule_due(&task)? && !inflight.contains(&key) {
                            if deliveries.len() >= max_live { continue; }
                            inflight.insert(key.clone());
                            let tasks = tasks.clone();
                            let cancel = cancel.clone();
                            spawn_owned_delivery(&mut deliveries, &_owner.0, async move { (key, tasks.execute(task, &cancel).await) });
                        }
                    }
                    tokio::select! {
                        joined = deliveries.join_next(), if !deliveries.is_empty() => {
                            let (id,result) = joined.expect("nonempty delivery set").map_err(|e| Status::internal(format!("task delivery child failed: {e}")))?;
                            inflight.remove(&id);
                            result?;
                        },
                        _ = tokio::time::sleep(std::time::Duration::from_millis(100)) => {},
                        signal = receiver.recv() => { if signal.is_none() { return Ok(()); } },
                    }
                    cancel.public_ready().await?;
                    pending = tasks.pending(request.clone()).await?;
                }
            };
            let failure = async {
                loop {
                    if *uncertain.borrow_and_update() {
                        return Err(Status::unavailable("scheduling root outcome uncertain; restart host through durable recovery"));
                    }
                    if uncertain.changed().await.is_err() {
                        return Err(Status::unavailable("scheduling ownership supervision lost"));
                    }
                }
            };
            let (result, replace_fallback) = tokio::select! {
                biased;
                result = work => (result, false),
                result = failure => (result, true),
                _ = cancel.cancelled() => (Ok(()), true),
            };
            // Keep an already-selected work diagnostic primary while adopting
            // one completed child error instead of a supervision fallback.
            let result = abort_drain_deliveries(&mut deliveries, result, replace_fallback).await;
            // DispatchOwner Drop revokes active/generation together under the
            // synchronous publication mutex; do not split that linearization.
            if *tasks.inner.uncertain.borrow() {
                cancel.fail();
                if result.is_ok() {
                    return Err(Status::unavailable("durable task operation dropped during shutdown"));
                }
            }
            result
        });
        Ok(())
    }
}

/// Reader-only recovery over one canonical shared-shard Database stream.
/// Register after legacy transaction recovery. Scheduling is deliberately not
/// enabled: cross-actor staged admission needs a separate capacity contract.
#[derive(Clone)]
pub struct ReaderTaskRecoveryRegistry {
    tasks: std::collections::BTreeMap<(String, String), OneShotTasks>,
    request: db::RecoverRequest,
}
impl ReaderTaskRecoveryRegistry {
    pub fn new(
        tasks: impl IntoIterator<Item = OneShotTasks>,
        request: db::RecoverRequest,
    ) -> Result<Self, Status> {
        let mut owners = std::collections::BTreeMap::new();
        let mut endpoint = None;
        for task in tasks {
            if task.inner.binding.writer_capable() {
                return Err(Status::failed_precondition(
                    "shared recovery is reader-only",
                ));
            }
            if endpoint
                .as_ref()
                .is_some_and(|value: &String| value != task.inner.store.database_endpoint())
            {
                return Err(Status::invalid_argument(
                    "shared task recovery requires one Database endpoint",
                ));
            }
            endpoint = Some(task.inner.store.database_endpoint().to_owned());
            if !request
                .state_tags_by_state_type
                .contains_key(&task.inner.state_type)
            {
                return Err(Status::invalid_argument(
                    "shared task recovery needs every registered state tag",
                ));
            }
            if owners
                .insert(
                    (task.inner.state_type.clone(), task.inner.state_ref.clone()),
                    task,
                )
                .is_some()
            {
                return Err(Status::already_exists(
                    "duplicate shared task recovery owner",
                ));
            }
        }
        if owners.is_empty() || owners.len() > MAX_TASKS || request.shard_ids.is_empty() {
            return Err(Status::invalid_argument(
                "shared task recovery needs 1..1024 owners and exact shards",
            ));
        }
        Ok(Self {
            tasks: owners,
            request,
        })
    }
    async fn pending(&self) -> Result<Vec<db::Task>, Status> {
        let store = &self
            .tasks
            .first_key_value()
            .expect("nonempty registry")
            .1
            .inner
            .store;
        let mut stream = store
            .task_database()
            .recover(self.request.clone())
            .await?
            .into_inner();
        let mut pending = Vec::new();
        while let Some(batch) = stream.message().await? {
            if pending.len().saturating_add(batch.pending_tasks.len()) > MAX_TASKS {
                return Err(Status::resource_exhausted(
                    "durable pending task admission exceeds 1024",
                ));
            }
            pending.extend(batch.pending_tasks);
        }
        // No handler runs until the complete stream and every binding validate.
        let mut partitions = std::collections::BTreeMap::<_, Vec<db::Task>>::new();
        for task in &pending {
            let id = task
                .task_id
                .as_ref()
                .ok_or_else(|| Status::invalid_argument("missing task ID"))?;
            let key = (id.state_type.clone(), id.state_ref.clone());
            if !self.tasks.contains_key(&key) {
                return Err(Status::invalid_argument(
                    "unregistered actor in shared task recovery",
                ));
            }
            partitions.entry(key).or_default().push(task.clone());
        }
        for (key, batch) in partitions {
            self.tasks[&key].validate(&batch)?;
        }
        Ok(pending)
    }
}
#[tonic::async_trait]
impl HostRecovery for ReaderTaskRecoveryRegistry {
    async fn start(
        &self,
        supervisor: &mut JoinSet<Result<(), Status>>,
        cancel: RecoveryCancellation,
    ) -> Result<(), Status> {
        let mut owners = Vec::new();
        for tasks in self.tasks.values() {
            // Mixing registrations must fail before consuming any receiver or
            // enabling an actor. RAII releases earlier claims on failure.
            owners.push(DispatchOwner::claim(tasks.clone())?);
        }
        let pending = self.pending().await?;
        let registry = self.clone();
        for tasks in self.tasks.values() {
            tasks.activate_reader_only();
        }
        supervisor.spawn(async move {
            let _owners = owners;
            let mut failures = JoinSet::new();
            for tasks in registry.tasks.values() {
                let mut uncertain = tasks.inner.uncertain.subscribe();
                failures.spawn(async move {
                    loop {
                        if *uncertain.borrow_and_update() {
                            return Status::unavailable("scheduling root outcome uncertain; restart host through durable recovery");
                        }
                        if uncertain.changed().await.is_err() {
                            return Status::unavailable("scheduling ownership supervision lost");
                        }
                    }
                });
            }
            let work = async {
                cancel.public_ready().await?;
                let mut pending = pending;
                loop {
                    for task in pending {
                        cancel.public_ready().await?;
                        if schedule_due(&task)? {
                            let id = task.task_id.as_ref().expect("validated task ID");
                            registry.tasks[&(id.state_type.clone(), id.state_ref.clone())].execute(task, &cancel).await?;
                        }
                    }
                    tokio::time::sleep(std::time::Duration::from_millis(100)).await;
                    cancel.public_ready().await?;
                    pending = registry.pending().await?;
                }
            };
            let result = tokio::select! {
                biased;
                failure = failures.join_next() => Err(match failure {
                    Some(Ok(status)) => status,
                    Some(Err(error)) => Status::internal(error.to_string()),
                    None => Status::unavailable("shared task supervision lost"),
                }),
                _ = cancel.cancelled() => Ok(()),
                result = work => result,
            };
            failures.abort_all();
            while failures.join_next().await.is_some() {}
            result
        });
        Ok(())
    }
}

#[cfg(feature = "test-support")]
struct WaitLoadTestBarrier {
    marker: std::path::PathBuf,
    armed: bool,
}
#[cfg(feature = "test-support")]
impl Drop for WaitLoadTestBarrier {
    fn drop(&mut self) {
        if self.armed {
            // Evidence of the actual server future being dropped while parked,
            // not merely the client ceasing to observe it.
            let _ = std::fs::write(
                self.marker.with_extension("dropped"),
                "server Wait future dropped after real Database Load",
            );
        }
    }
}

/// Read-only canonical task results for explicitly registered host-owned actors.
#[derive(Clone)]
pub struct ReaderTaskWaitService {
    tasks: std::collections::BTreeMap<(String, String), OneShotTasks>,
    application: crate::legacy_placement::LegacyApplicationId,
    server_id: String,
    placement: crate::legacy_placement::PlanOnlyLegacyPlacement,
}
impl ReaderTaskWaitService {
    /// Register exact actor identities once before mounting this PUBLIC service.
    /// Each task owner must separately be registered with ApplicationHost recovery.
    /// This does not partition a shared sidecar's Recover stream or grant dispatch
    /// authority, and performs no dynamic actor discovery.
    pub fn new(
        owners: impl IntoIterator<Item = OneShotTasks>,
        application: crate::legacy_placement::LegacyApplicationId,
        server_id: impl Into<String>,
        placement: crate::legacy_placement::PlanOnlyLegacyPlacement,
    ) -> Result<Self, Status> {
        let mut tasks = std::collections::BTreeMap::new();
        for owner in owners {
            let key = (
                owner.inner.state_type.clone(),
                owner.inner.state_ref.clone(),
            );
            if tasks.insert(key, owner).is_some() {
                return Err(Status::already_exists("duplicate task actor registration"));
            }
        }
        if tasks.is_empty() {
            return Err(Status::invalid_argument("task Wait registry is empty"));
        }
        let server_id = server_id.into();
        if server_id.is_empty() {
            return Err(Status::invalid_argument(
                "task Wait server identity is empty",
            ));
        }
        Ok(Self {
            tasks,
            application,
            server_id,
            placement,
        })
    }
    fn require_authority(&self, state_ref: &str) -> Result<(), Status> {
        let route = self.placement.route(&self.application, state_ref)?;
        if self.server_id.is_empty() || route.server_id != self.server_id {
            return Err(Status::unavailable(
                "server is not authoritative for task actor",
            ));
        }
        Ok(())
    }
}
#[tonic::async_trait]
impl db::tasks_server::Tasks for ReaderTaskWaitService {
    async fn wait(
        &self,
        request: tonic::Request<db::WaitRequest>,
    ) -> Result<tonic::Response<db::WaitResponse>, Status> {
        let headers = crate::RebootHeaders::from_request(&request)
            .map_err(|error| Status::invalid_argument(error.to_string()))?;
        let expected_method = request
            .metadata()
            .get("x-reboot-task-method")
            .map(|value| value.to_str().map(str::to_owned))
            .transpose()
            .map_err(|_| Status::invalid_argument("invalid expected task method"))?;
        let id = request
            .into_inner()
            .task_id
            .ok_or_else(|| Status::invalid_argument("missing task ID"))?;
        if id.state_ref != headers.state_ref {
            return Err(Status::invalid_argument(
                "task ID does not match routed state ref",
            ));
        }
        let tasks = self
            .tasks
            .get(&(id.state_type.clone(), id.state_ref.clone()))
            .ok_or_else(|| Status::invalid_argument("task actor is not registered"))?;
        if uuid::Uuid::from_slice(&id.task_uuid).map_or(true, |id| {
            id.get_version_num() != 4 || id.get_variant() != uuid::Variant::RFC4122
        }) {
            return Err(Status::invalid_argument(
                "task must name the registered local actor and UUIDv4",
            ));
        }
        loop {
            self.require_authority(&id.state_ref)?;
            if !tasks
                .inner
                .active
                .load(std::sync::atomic::Ordering::Acquire)
            {
                return Err(Status::unavailable("task dispatcher is not active"));
            }
            #[cfg(feature = "test-support")]
            if std::env::var_os("REBOOT_TEST_TASK_WAIT_RPC_ERROR").is_some() {
                use prost::Message;
                let rich = googleapis_tonic_google_rpc::google::rpc::Status {
                    code: tonic::Code::Unknown as i32,
                    message: "RPC failure, not a durable terminal".to_owned(),
                    details: vec![
                        prost_types::Any {
                            type_url:
                                "type.googleapis.com/tests.reboot.protoc.TransactionLimitExceeded"
                                    .to_owned(),
                            value: crate::proto::Counter { value: 9 }.encode_to_vec()
                        };
                        2
                    ],
                };
                return Err(Status::with_details(
                    tonic::Code::Unknown,
                    rich.message.clone(),
                    rich.encode_to_vec().into(),
                ));
            }
            let loaded = tasks
                .inner
                .store
                .task_database()
                .load(db::LoadRequest {
                    actors: vec![],
                    task_ids: vec![id.clone()],
                })
                .await?
                .into_inner();
            #[cfg(feature = "test-support")]
            if let Some(marker) = std::env::var_os("REBOOT_TEST_TASK_WAIT_LOADED") {
                let marker = std::path::Path::new(&marker);
                if !marker.exists() {
                    // Test-only barrier after the real Database reply, before
                    // checking the current plan or returning a loaded result.
                    std::fs::write(marker, "real Database Load completed")
                        .map_err(|error| Status::internal(error.to_string()))?;
                    let mut parked = WaitLoadTestBarrier {
                        marker: marker.to_path_buf(),
                        armed: true,
                    };
                    let release = marker.with_extension("release");
                    tokio::time::timeout(std::time::Duration::from_secs(10), async {
                        while !release.exists() {
                            tokio::time::sleep(std::time::Duration::from_millis(5)).await;
                        }
                    })
                    .await
                    .map_err(|_| Status::deadline_exceeded("test Wait Load barrier expired"))?;
                    parked.armed = false;
                }
            }
            // Loading can await while a newer plan moves this actor. Never
            // return a result under the authority checked before that await.
            self.require_authority(&id.state_ref)?;
            if loaded.tasks.is_empty() {
                return Err(Status::not_found("task not found"));
            }
            if loaded.tasks.len() != 1 || loaded.tasks[0].task_id.as_ref() != Some(&id) {
                return Err(Status::data_loss(
                    "task lookup returned a different identity",
                ));
            }
            let task = &loaded.tasks[0];
            if expected_method.as_ref().is_some_and(|expected| {
                tasks
                    .declaration(task)
                    .map(|declaration| declaration.method)
                    != Some(expected.as_str())
            }) {
                return Err(Status::failed_precondition(
                    "task belongs to another generated method",
                ));
            }
            if task.iteration != 0 {
                return Err(Status::failed_precondition(
                    "task iterations are unsupported",
                ));
            }
            scheduled_at(task)?;
            tasks.inner.binding.validate(task)?;
            match db::task::Status::try_from(task.status) {
                Ok(db::task::Status::Pending) => tasks.validate(std::slice::from_ref(task))?,
                Ok(db::task::Status::Completed) => {
                    tasks.validate_terminal(
                        task,
                        task.response_or_error
                            .as_ref()
                            .ok_or_else(|| Status::data_loss("completed task has no result"))?,
                    )?;
                    let result = match task.response_or_error.clone() {
                        Some(db::task::ResponseOrError::Response(response)) => {
                            db::task_response_or_error::ResponseOrError::Response(response)
                        }
                        Some(db::task::ResponseOrError::Error(error)) => {
                            db::task_response_or_error::ResponseOrError::Error(error)
                        }
                        None => return Err(Status::data_loss("completed task has no result")),
                    };
                    return Ok(tonic::Response::new(db::WaitResponse {
                        response_or_error: Some(db::TaskResponseOrError {
                            response_or_error: Some(result),
                        }),
                    }));
                }
                _ => return Err(Status::failed_precondition("unsupported task status")),
            }
            // The RPC future owns this read-only wait. Tonic deadlines and host
            // failed-readiness cancellation drop it; no detached waiter or write.
            tokio::time::sleep(std::time::Duration::from_millis(100)).await;
        }
    }
    async fn list_tasks(
        &self,
        _: tonic::Request<db::ListTasksRequest>,
    ) -> Result<tonic::Response<db::ListTasksResponse>, Status> {
        Err(Status::unimplemented(
            "task listing is outside the reader-only Wait slice",
        ))
    }
    type ListTasksStreamStream = tonic::codegen::tokio_stream::wrappers::ReceiverStream<
        Result<db::ListTasksResponse, Status>,
    >;
    async fn list_tasks_stream(
        &self,
        _: tonic::Request<db::ListTasksRequest>,
    ) -> Result<tonic::Response<Self::ListTasksStreamStream>, Status> {
        Err(Status::unimplemented("task subscriptions are unsupported"))
    }
    async fn cancel_task(
        &self,
        _: tonic::Request<db::CancelTaskRequest>,
    ) -> Result<tonic::Response<db::CancelTaskResponse>, Status> {
        Err(Status::unimplemented("task cancellation is unsupported"))
    }
}

fn scheduled_at(task: &db::Task) -> Result<Option<chrono::DateTime<chrono::Utc>>, Status> {
    task.timestamp
        .as_ref()
        .map(|timestamp| {
            // Canonical google.protobuf.Timestamp range: year 0001 through 9999.
            if !(-62_135_596_800..=253_402_300_799).contains(&timestamp.seconds)
                || !(0..1_000_000_000).contains(&timestamp.nanos)
            {
                return Err(Status::invalid_argument("invalid UTC task schedule"));
            }
            chrono::DateTime::from_timestamp(timestamp.seconds, timestamp.nanos as u32)
                .ok_or_else(|| Status::invalid_argument("invalid UTC task schedule"))
        })
        .transpose()
}
fn schedule_due(task: &db::Task) -> Result<bool, Status> {
    Ok(scheduled_at(task)?.is_none_or(|schedule| schedule <= chrono::Utc::now()))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[tokio::test]
    async fn writer_uncertainty_fails_readiness_before_exclusive_release() {
        let tasks = OneShotTasks::new(
            DatabaseActorStore::connect_lazy("http://127.0.0.1:1").unwrap(),
            "test.WriterFailure".into(),
            "actor".into(),
            Binding,
        )
        .unwrap();
        let (cancel, readiness) = RecoveryCancellation::test_host();
        let gate = tasks.inner.store.actor_gate("test.WriterFailure", "actor");
        let lease = gate.exclusive().await;
        let mut competing = Box::pin(gate.exclusive());
        assert!(
            tokio::time::timeout(std::time::Duration::from_millis(10), &mut competing)
                .await
                .is_err()
        );
        let operation = DurableTaskOperation {
            tasks: &tasks,
            cancel: &cancel,
            acknowledged: false,
            started: None,
        };
        drop(operation); // same producer used for Store/CAS error and future Drop
        assert_eq!(
            *readiness.borrow(),
            crate::application_host::RecoveryState::Failed,
            "Failed must be synchronous BEFORE lease release"
        );
        assert!(
            tokio::time::timeout(std::time::Duration::from_millis(10), &mut competing)
                .await
                .is_err()
        );
        assert!(
            *tasks.inner.uncertain.borrow(),
            "owner failure remains sticky"
        );
        assert_eq!(
            cancel.public_ready().await.unwrap_err().code(),
            tonic::Code::Unavailable
        );
        drop(lease);
        let _competitor = tokio::time::timeout(std::time::Duration::from_secs(1), competing)
            .await
            .unwrap();
        assert_eq!(
            *readiness.borrow(),
            crate::application_host::RecoveryState::Failed
        );
    }
    #[test]
    fn writer_key_matches_python_uuid5_decoded_final_actor_alias() {
        let reference = crate::state_ref::StateRef::from_id("test.Parent", "parent")
            .unwrap()
            .colocate("test.Child", "child/id")
            .unwrap();
        let id = db::TaskId {
            state_type: "test.Child".into(),
            state_ref: reference.to_string(),
            task_uuid: uuid::Uuid::parse_str("00000000-0000-4000-8000-000000000001")
                .unwrap()
                .as_bytes()
                .to_vec(),
        };
        assert_eq!(
            crate::runtime::writer_task_key(&id, "test.Service.Apply")
                .unwrap()
                .to_string(),
            "8cdac126-1097-5300-b18d-b08cd93146bc"
        );
        let mut opaque = id.clone();
        opaque.state_ref = "opaque-reader".into();
        assert_eq!(
            crate::runtime::writer_task_key(&opaque, "test.Service.Apply")
                .unwrap_err()
                .code(),
            tonic::Code::InvalidArgument
        );
        let mut foreign = id;
        foreign.state_type = "test.Other".into();
        assert_eq!(
            crate::runtime::writer_task_key(&foreign, "test.Service.Apply")
                .unwrap_err()
                .code(),
            tonic::Code::InvalidArgument
        );
    }
    #[test]
    fn absolute_task_schedule_validates_and_respects_deadline() {
        let task = |seconds, nanos| db::Task {
            timestamp: Some(prost_types::Timestamp { seconds, nanos }),
            ..Default::default()
        };
        assert!(schedule_due(&db::Task::default()).unwrap());
        assert!(schedule_due(&task(0, 0)).unwrap());
        assert!(!schedule_due(&task(253_402_300_799, 999_999_999)).unwrap());
        assert!(scheduled_at(&task(-62_135_596_800, 0)).is_ok());
        for (seconds, nanos) in [
            (-62_135_596_801, 0),
            (253_402_300_800, 0),
            (0, -1),
            (0, 1_000_000_000),
        ] {
            assert_eq!(
                scheduled_at(&task(seconds, nanos)).unwrap_err().code(),
                tonic::Code::InvalidArgument
            );
        }
    }

    #[tokio::test]
    async fn reader_registry_admission_preserves_shape_and_missing_owner_precedence() {
        // A registry owns a real dispatcher claim but intentionally grants no
        // scheduling Recover request. An unreachable endpoint also ensures
        // every denial happens before any Database Recover/Load is attempted.
        let tasks = OneShotTasks::new(
            DatabaseActorStore::connect_lazy("http://127.0.0.1:1").unwrap(),
            "test.ReaderRegistryPrecedence".into(),
            "actor".into(),
            Binding,
        )
        .unwrap();
        let malformed = db::Task::default();
        let inactive = tasks
            .validate_staged(std::slice::from_ref(&malformed))
            .await
            .unwrap_err();
        assert_eq!(inactive.code(), tonic::Code::FailedPrecondition);
        assert_eq!(
            inactive.message(),
            "task dispatcher has no running host owner"
        );

        let owner = DispatchOwner::claim(tasks.clone()).unwrap();
        tasks.activate_reader_only();
        let valid = db::Task {
            task_id: Some(db::TaskId {
                state_type: "test.ReaderRegistryPrecedence".into(),
                state_ref: "actor".into(),
                task_uuid: uuid::Uuid::new_v4().as_bytes().to_vec(),
            }),
            status: db::task::Status::Pending as i32,
            ..Default::default()
        };
        // This is the exact valid-batch denial exercised by the native shared
        // reader recovery/restart fixtures, including its stable diagnostic.
        let denied = tasks
            .validate_staged(std::slice::from_ref(&valid))
            .await
            .unwrap_err();
        assert_eq!(denied.code(), tonic::Code::FailedPrecondition);
        assert_eq!(denied.message(), "no task recovery owner");
        let mut wrong_actor = valid.clone();
        wrong_actor.task_id.as_mut().unwrap().state_ref = "foreign".into();
        let mut completed = valid.clone();
        completed.status = db::task::Status::Completed as i32;
        let mut invalid_schedule = valid.clone();
        invalid_schedule.timestamp = Some(prost_types::Timestamp {
            seconds: 0,
            nanos: -1,
        });
        for batch in [
            vec![malformed],
            vec![wrong_actor],
            vec![completed],
            vec![invalid_schedule],
            vec![valid.clone(), valid.clone()],
        ] {
            assert_eq!(
                tasks.validate_staged(&batch).await.unwrap_err().code(),
                tonic::Code::InvalidArgument,
                "active reader-only registry must validate shape before scheduling authority"
            );
        }
        drop(owner);
        let stopped = tasks
            .validate_staged(std::slice::from_ref(&valid))
            .await
            .unwrap_err();
        assert_eq!(stopped.code(), tonic::Code::FailedPrecondition);
        assert_eq!(
            stopped.message(),
            "task dispatcher has no running host owner"
        );
    }

    #[tokio::test]
    async fn reusable_running_admission_rejects_recover_aba_before_exact_id_load() {
        let (endpoint, database, server) = crate::runtime::test_support::start_database().await;
        let tasks = OneShotTasks::new(
            DatabaseActorStore::connect_lazy(&endpoint).unwrap(),
            "test.RecoverABA".into(),
            "actor".into(),
            Binding,
        )
        .unwrap();
        let owner = DispatchOwner::claim(tasks.clone()).unwrap();
        *tasks.inner.recovery_request.lock().unwrap() = Some(db::RecoverRequest::default());
        tasks
            .inner
            .active
            .store(true, std::sync::atomic::Ordering::Release);
        let task = db::Task {
            task_id: Some(db::TaskId {
                state_type: "test.RecoverABA".into(),
                state_ref: "actor".into(),
                task_uuid: uuid::Uuid::new_v4().as_bytes().to_vec(),
            }),
            status: db::task::Status::Pending as i32,
            ..Default::default()
        };
        let (entered, release) = database.park_task_recover();
        let (mut load_entered, load_release) = database.park_task_load();
        let mut admission = Box::pin(tasks.validate_staged_admission(std::slice::from_ref(&task)));
        tokio::select! {
            result = &mut admission => panic!("unexpected early admission {}", result.is_ok()),
            result = entered => result.unwrap(),
        }
        drop(owner);
        let replacement = DispatchOwner::claim(tasks.clone()).unwrap();
        *tasks.inner.recovery_request.lock().unwrap() = Some(db::RecoverRequest::default());
        tasks
            .inner
            .active
            .store(true, std::sync::atomic::Ordering::Release);
        release.send(()).unwrap();
        let error = match admission.await {
            Err(error) => error,
            Ok(_) => panic!("Recover from old generation authorized restarted dispatcher"),
        };
        assert_eq!(error.code(), tonic::Code::FailedPrecondition);
        assert_eq!(
            error.message(),
            "task dispatcher running owner changed during admission"
        );
        assert!(
            matches!(
                load_entered.try_recv(),
                Err(tokio::sync::oneshot::error::TryRecvError::Empty)
            ),
            "stale Recover must reject before issuing exact-ID Load"
        );
        drop(load_release);
        drop(replacement);
        server.abort();
        let _ = server.await;
    }

    #[tokio::test]
    async fn reusable_running_admission_rejects_aba_and_cancelled_load_can_retry() {
        let (endpoint, database, server) = crate::runtime::test_support::start_database().await;
        let tasks = OneShotTasks::new(
            DatabaseActorStore::connect_lazy(&endpoint).unwrap(),
            "test.ABA".into(),
            "actor".into(),
            Binding,
        )
        .unwrap();
        let owner = DispatchOwner::claim(tasks.clone()).unwrap();
        *tasks.inner.recovery_request.lock().unwrap() = Some(db::RecoverRequest::default());
        tasks
            .inner
            .active
            .store(true, std::sync::atomic::Ordering::Release);
        let task = db::Task {
            task_id: Some(db::TaskId {
                state_type: "test.ABA".into(),
                state_ref: "actor".into(),
                task_uuid: uuid::Uuid::new_v4().as_bytes().to_vec(),
            }),
            status: db::task::Status::Pending as i32,
            ..Default::default()
        };
        let (entered, release) = database.park_task_load();
        let mut admission = Box::pin(tasks.validate_staged_admission(std::slice::from_ref(&task)));
        tokio::select! { result=&mut admission=>panic!("unexpected early admission {}",result.is_ok()),result=entered=>result.unwrap() }
        drop(owner);
        let replacement = DispatchOwner::claim(tasks.clone()).unwrap();
        *tasks.inner.recovery_request.lock().unwrap() = Some(db::RecoverRequest::default());
        tasks
            .inner
            .active
            .store(true, std::sync::atomic::Ordering::Release);
        release.send(()).unwrap();
        assert!(
            matches!(admission.await,Err(error) if error.code()==tonic::Code::FailedPrecondition),
            "active=true restart must not accept old generation"
        );
        let admitted = tasks
            .validate_staged_admission(std::slice::from_ref(&task))
            .await
            .unwrap();
        drop(replacement);
        let replacement = DispatchOwner::claim(tasks.clone()).unwrap();
        *tasks.inner.recovery_request.lock().unwrap() = Some(db::RecoverRequest::default());
        tasks
            .inner
            .active
            .store(true, std::sync::atomic::Ordering::Release);
        assert!(
            admitted.lock().is_err(),
            "post-validation/pre-consumption ABA must reject"
        );
        let (entered, release) = database.park_task_load();
        let mut admission = Box::pin(tasks.validate_staged_admission(std::slice::from_ref(&task)));
        tokio::select! { result=&mut admission=>panic!("unexpected early admission {}",result.is_ok()),result=entered=>result.unwrap() }
        drop(admission);
        release.send(()).unwrap();
        assert!(
            tasks
                .validate_staged_admission(std::slice::from_ref(&task))
                .await
                .unwrap()
                .lock()
                .is_ok(),
            "cancelled Load must not strand admission"
        );
        drop(replacement);
        server.abort();
        let _ = server.await;
    }

    struct Binding;
    #[tonic::async_trait]
    impl ReaderTaskBinding for Binding {
        fn validate(&self, _: &db::Task) -> Result<(), Status> {
            Ok(())
        }
        async fn execute(&self, _: &db::Task) -> Result<prost_types::Any, Status> {
            unreachable!("ownership-only test")
        }
    }
    #[tokio::test]
    async fn wait_authority_without_plan_fails_closed() {
        let tasks = OneShotTasks::new(
            DatabaseActorStore::connect_lazy("http://127.0.0.1:1").unwrap(),
            "test.WaitAuthority".into(),
            "actor".into(),
            Binding,
        )
        .unwrap();
        let service = ReaderTaskWaitService::new(
            [tasks],
            crate::legacy_placement::LegacyApplicationId::new("application").unwrap(),
            "server",
            crate::legacy_placement::PlanOnlyLegacyPlacement::new(),
        )
        .unwrap();
        assert_eq!(
            service.require_authority("actor").unwrap_err().code(),
            tonic::Code::Unavailable
        );
    }
    #[tokio::test]
    async fn wait_registry_rejects_empty_duplicate_and_empty_server_registrations() {
        let tasks = OneShotTasks::new(
            DatabaseActorStore::connect_lazy("http://127.0.0.1:1").unwrap(),
            "test.Registry".into(),
            "actor".into(),
            Binding,
        )
        .unwrap();
        let application = crate::legacy_placement::LegacyApplicationId::new("application").unwrap();
        let placement = crate::legacy_placement::PlanOnlyLegacyPlacement::new();
        for (owners, server, code) in [
            (vec![], "server", tonic::Code::InvalidArgument),
            (
                vec![tasks.clone(), tasks.clone()],
                "server",
                tonic::Code::AlreadyExists,
            ),
            (vec![tasks], "", tonic::Code::InvalidArgument),
        ] {
            let result =
                ReaderTaskWaitService::new(owners, application.clone(), server, placement.clone());
            assert!(matches!(result, Err(error) if error.code() == code));
        }
    }
    #[tokio::test]
    async fn wait_registry_identity_includes_both_state_type_and_state_ref() {
        let store = DatabaseActorStore::connect_lazy("http://127.0.0.1:1").unwrap();
        let owners = [
            ("test.First", "actor"),
            ("test.Second", "actor"),
            ("test.First", "other"),
        ]
        .into_iter()
        .map(|(state_type, state_ref)| {
            OneShotTasks::new(store.clone(), state_type.into(), state_ref.into(), Binding).unwrap()
        });
        let service = ReaderTaskWaitService::new(
            owners,
            crate::legacy_placement::LegacyApplicationId::new("application").unwrap(),
            "server",
            crate::legacy_placement::PlanOnlyLegacyPlacement::new(),
        )
        .unwrap();
        assert_eq!(service.tasks.len(), 3);
        assert_eq!(
            service
                .tasks
                .get(&("test.Second".into(), "actor".into()))
                .unwrap()
                .inner
                .state_type,
            "test.Second"
        );
    }
    #[tokio::test]
    async fn shared_reader_activation_revokes_stale_singleton_admission() {
        let tasks = OneShotTasks::new(
            DatabaseActorStore::connect_lazy("http://127.0.0.1:1").unwrap(),
            "test.Reused".into(),
            "actor".into(),
            Binding,
        )
        .unwrap();
        let owner = DispatchOwner::claim(tasks.clone()).unwrap();
        // Reproduce the admission metadata left by an earlier singleton host.
        *tasks.inner.recovery_request.lock().unwrap() = Some(db::RecoverRequest {
            shard_ids: vec!["shard".into()],
            ..Default::default()
        });
        tasks.activate_reader_only();
        assert_eq!(
            tasks.validate_staged(&[]).await.unwrap_err().code(),
            tonic::Code::FailedPrecondition
        );
        assert!(tasks.inner.recovery_request.lock().unwrap().is_none());
        // Teardown must independently revoke admission, including singleton
        // metadata installed after activation in this lifecycle regression.
        *tasks.inner.recovery_request.lock().unwrap() = Some(db::RecoverRequest::default());
        drop(owner);
        assert!(
            !tasks
                .inner
                .active
                .load(std::sync::atomic::Ordering::Acquire)
        );
        assert!(tasks.inner.recovery_request.lock().unwrap().is_none());
        assert!(DispatchOwner::claim(tasks).is_ok());
    }
    #[tokio::test]
    async fn shared_recovery_registry_rejects_invalid_registration() {
        let owner = |endpoint: &str, state_type: &str, state_ref: &str| {
            OneShotTasks::new(
                DatabaseActorStore::connect_lazy(endpoint).unwrap(),
                state_type.into(),
                state_ref.into(),
                Binding,
            )
            .unwrap()
        };
        let request = || db::RecoverRequest {
            shard_ids: vec!["shard".into()],
            state_tags_by_state_type: [("test.First".into(), "First".into())].into(),
            ..Default::default()
        };
        let first = owner("http://127.0.0.1:1", "test.First", "actor");
        for (owners, request, code) in [
            (vec![], request(), tonic::Code::InvalidArgument),
            (
                vec![first.clone(), first.clone()],
                request(),
                tonic::Code::AlreadyExists,
            ),
            (
                vec![
                    first.clone(),
                    owner("http://127.0.0.1:2", "test.First", "other"),
                ],
                request(),
                tonic::Code::InvalidArgument,
            ),
            (
                vec![
                    first.clone(),
                    owner("http://127.0.0.1:1", "test.Second", "actor"),
                ],
                request(),
                tonic::Code::InvalidArgument,
            ),
            (
                vec![first.clone()],
                db::RecoverRequest {
                    shard_ids: vec![],
                    ..request()
                },
                tonic::Code::InvalidArgument,
            ),
        ] {
            assert!(
                matches!(ReaderTaskRecoveryRegistry::new(owners, request), Err(error) if error.code() == code)
            );
        }
        assert!(
            ReaderTaskRecoveryRegistry::new(
                [
                    first.clone(),
                    owner("http://127.0.0.1:1", "test.First", "other")
                ],
                request()
            )
            .is_ok()
        );
        assert!(
            !first
                .inner
                .active
                .load(std::sync::atomic::Ordering::Acquire)
        );
        assert!(first.inner.recovery_request.lock().unwrap().is_none());
    }
    #[tokio::test]
    async fn delivery_budget_defaults_to_admission_bound_and_is_frozen_by_owner() {
        let tasks = OneShotTasks::new(
            DatabaseActorStore::connect_lazy("http://127.0.0.1:1").unwrap(),
            "test.DeliveryBudget".into(),
            "actor".into(),
            Binding,
        )
        .unwrap();
        assert_eq!(
            tasks
                .inner
                .max_live
                .load(std::sync::atomic::Ordering::Acquire),
            MAX_TASKS
        );
        for invalid in [0, MAX_TASKS + 1] {
            assert_eq!(
                tasks.set_max_live_deliveries(invalid).unwrap_err().code(),
                tonic::Code::InvalidArgument
            );
        }
        tasks.set_max_live_deliveries(2).unwrap();
        let owner = DispatchOwner::claim(tasks.clone()).unwrap();
        assert_eq!(
            tasks.set_max_live_deliveries(3).unwrap_err().code(),
            tonic::Code::FailedPrecondition
        );
        drop(owner);
        tasks.set_max_live_deliveries(MAX_TASKS).unwrap();
    }
    #[tokio::test(flavor = "multi_thread", worker_threads = 3)]
    async fn forced_supervisor_abort_retains_owner_until_synchronous_delivery_drops() {
        let store = DatabaseActorStore::connect_lazy("http://127.0.0.1:1").unwrap();
        let tasks = OneShotTasks::new(
            store.clone(),
            "test.ForcedOwner".into(),
            "blocked-callback".into(),
            Binding,
        )
        .unwrap();
        let replacement = OneShotTasks::new(
            store,
            "test.ForcedOwner".into(),
            "blocked-callback".into(),
            Binding,
        )
        .unwrap();
        let owner = Arc::new(DispatchOwner::claim(tasks.clone()).unwrap());
        let weak = Arc::downgrade(&owner);
        tasks
            .inner
            .active
            .store(true, std::sync::atomic::Ordering::Release);
        *tasks.inner.recovery_request.lock().unwrap() = Some(db::RecoverRequest::default());
        let (entered_tx, entered_rx) = tokio::sync::oneshot::channel();
        let (release_tx, release_rx) = std::sync::mpsc::channel();
        // Always release the synchronous callback even when an assertion unwinds.
        struct Release(Option<std::sync::mpsc::Sender<()>>);
        impl Drop for Release {
            fn drop(&mut self) {
                if let Some(sender) = self.0.take() {
                    let _ = sender.send(());
                }
            }
        }
        let mut release = Release(Some(release_tx));
        let supervisor = tokio::spawn(async move {
            let owner = DispatchSupervisorOwner(owner);
            let mut deliveries = JoinSet::new();
            spawn_owned_delivery(&mut deliveries, &owner.0, async move {
                // Real synchronous application callback, not a cooperatively parked future.
                let callback = || {
                    let _ = entered_tx.send(());
                    release_rx
                        .recv_timeout(std::time::Duration::from_secs(30))
                        .unwrap();
                };
                callback();
            });
            while deliveries.join_next().await.is_some() {}
        });
        tokio::time::timeout(std::time::Duration::from_secs(2), entered_rx)
            .await
            .unwrap()
            .unwrap();
        supervisor.abort(); // Same destruction policy as host's timeout fallback.
        assert!(supervisor.await.unwrap_err().is_cancelled());
        let retained = weak
            .upgrade()
            .expect("blocked delivery must retain registry owner");
        assert!(
            matches!(DispatchOwner::claim(replacement.clone()), Err(e) if e.code() == tonic::Code::AlreadyExists)
        );
        assert!(
            !tasks
                .inner
                .active
                .load(std::sync::atomic::Ordering::Acquire)
        );
        assert!(tasks.inner.running_owner.lock().unwrap().is_none());
        assert!(tasks.inner.recovery_request.lock().unwrap().is_none());
        assert!(tasks.validate_staged(&[]).await.is_err());
        drop(retained);
        release.0.take().unwrap().send(()).unwrap();
        tokio::time::timeout(std::time::Duration::from_secs(2), async {
            while weak.upgrade().is_some() {
                tokio::task::yield_now().await;
            }
        })
        .await
        .unwrap();
        // Final child destruction, not supervisor abortion, releases the registry.
        drop(DispatchOwner::claim(replacement).unwrap());
    }
    #[tokio::test]
    async fn delivery_drain_preserves_selected_primary_over_readiness_failure() {
        let (cancel, readiness) = RecoveryCancellation::test_host();
        let (uncertain, _) = tokio::sync::watch::channel(false);
        let mut deliveries = JoinSet::new();
        let primary_cancel = cancel.clone();
        let primary_uncertain = uncertain.clone();
        deliveries.spawn(async move {
            primary_uncertain.send_replace(true);
            primary_cancel.fail();
            (
                vec![1],
                Err(Status::failed_precondition("primary writer rejection")),
            )
        });
        // Join the primary before allowing the second delivery to observe its
        // readiness failure; no sleep or scheduler-order assumption is needed.
        let (_, primary) = deliveries.join_next().await.unwrap().unwrap();
        let secondary_cancel = cancel.clone();
        let (finished_tx, finished_rx) = tokio::sync::oneshot::channel();
        deliveries.spawn(async move {
            let secondary = secondary_cancel.public_ready().await;
            assert_eq!(
                secondary.as_ref().unwrap_err().code(),
                tonic::Code::Unavailable
            );
            let _ = finished_tx.send(());
            (vec![2], secondary)
        });
        finished_rx.await.unwrap();
        // On this current-thread runtime, the sender's poll finishes its task
        // before the receiving test resumes. The completed secondary is drained.
        let error = abort_drain_deliveries(&mut deliveries, primary, false)
            .await
            .unwrap_err();
        assert_eq!(
            error.code(),
            tonic::Code::FailedPrecondition,
            "secondary readiness failure must not replace selected primary"
        );
        assert_eq!(error.message(), "primary writer rejection");
        assert!(deliveries.is_empty());
        assert!(*uncertain.borrow());
        assert_eq!(
            *readiness.borrow(),
            crate::application_host::RecoveryState::Failed
        );
        assert_eq!(
            cancel.public_ready().await.unwrap_err().code(),
            tonic::Code::Unavailable
        );
    }
    #[tokio::test]
    async fn delivery_drain_replaces_only_supervision_fallback() {
        let mut deliveries = JoinSet::new();
        let (finished_tx, finished_rx) = tokio::sync::oneshot::channel();
        deliveries.spawn(async move {
            let _ = finished_tx.send(());
            (
                vec![1],
                Err(Status::data_loss("precise checkpoint rejection")),
            )
        });
        finished_rx.await.unwrap();
        let error = abort_drain_deliveries(
            &mut deliveries,
            Err(Status::unavailable("uncertainty supervision fallback")),
            true,
        )
        .await
        .unwrap_err();
        assert_eq!(error.code(), tonic::Code::DataLoss);
        assert_eq!(error.message(), "precise checkpoint rejection");
        assert!(deliveries.is_empty());
    }
    #[tokio::test]
    async fn duplicate_local_owner_rejected_and_drop_releases_registration() {
        let store = DatabaseActorStore::connect_lazy("http://127.0.0.1:1").unwrap();
        let first = OneShotTasks::new(
            store.clone(),
            "test.Owner".into(),
            "ownership-only".into(),
            Binding,
        )
        .unwrap();
        let second =
            OneShotTasks::new(store, "test.Owner".into(), "ownership-only".into(), Binding)
                .unwrap();
        let owner = DispatchOwner::claim(first.clone()).unwrap();
        assert!(
            matches!(DispatchOwner::claim(second.clone()), Err(error) if error.code() == tonic::Code::AlreadyExists)
        );
        first
            .inner
            .active
            .store(true, std::sync::atomic::Ordering::Release);
        drop(owner);
        assert!(
            !first
                .inner
                .active
                .load(std::sync::atomic::Ordering::Acquire)
        );
        assert!(DispatchOwner::claim(second).is_ok());
    }
}

#[cfg(test)]
mod writer_completion_identity_tests {
    use super::*;
    #[test]
    fn completed_writer_identity_and_scheduling_are_exact_and_read_only() {
        let expected = db::Task {
            task_id: Some(db::TaskId {
                state_type: "test.Counter".into(),
                state_ref: "actor".into(),
                task_uuid: uuid::Uuid::new_v4().as_bytes().to_vec(),
            }),
            method: "Apply".into(),
            request: vec![8, 3],
            timestamp: Some(prost_types::Timestamp {
                seconds: 1,
                nanos: 2,
            }),
            status: db::task::Status::Pending as i32,
            ..Default::default()
        };
        let response = prost_types::Any {
            type_url: "type.googleapis.com/test.Value".into(),
            value: vec![8, 5],
        };
        let mut completed = expected.clone();
        completed.status = db::task::Status::Completed as i32;
        completed.response_or_error = Some(db::task::ResponseOrError::Response(response.clone()));
        assert!(validate_completed(&expected, &completed, Some(&response)).is_ok());
        assert!(validate_completed(&expected, &completed, None).is_ok());
        for field in 0..12 {
            let mut invalid = completed.clone();
            match field {
                0 => invalid.task_id.as_mut().unwrap().state_type = "other.Counter".into(),
                1 => invalid.task_id.as_mut().unwrap().state_ref = "other".into(),
                2 => {
                    invalid.task_id.as_mut().unwrap().task_uuid =
                        uuid::Uuid::new_v4().as_bytes().to_vec()
                }
                3 => invalid.task_id = None,
                4 => invalid.method = "Other".into(),
                5 => invalid.request = vec![8, 4],
                6 => invalid.timestamp.as_mut().unwrap().seconds = 2,
                7 => invalid.timestamp.as_mut().unwrap().nanos = 3,
                8 => invalid.iteration = 1,
                9 => invalid.status = db::task::Status::Pending as i32,
                10 => invalid.response_or_error = None,
                11 => {
                    invalid.response_or_error =
                        Some(db::task::ResponseOrError::Response(prost_types::Any {
                            value: vec![8, 6],
                            ..response.clone()
                        }))
                }
                _ => unreachable!(),
            }
            let before = invalid.clone();
            assert_eq!(
                validate_completed(&expected, &invalid, Some(&response))
                    .unwrap_err()
                    .code(),
                tonic::Code::FailedPrecondition,
                "completion vector {field}"
            );
            assert_eq!(invalid, before);
        }
    }
}
