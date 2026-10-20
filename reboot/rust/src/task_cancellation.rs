// Canonical local cancellation. Workflow bodies receive post-CAS notification;
// ordinary bodies require an execution-owned pre-CAS quiescence handoff because
// they retain actor admission. Only synchronous terminal ACK authorizes a result.
// Shutdown is not CancelTask.
use prost::Message;

const CANCELLED_TYPE: &str = "type.googleapis.com/rbt.v1alpha1.Cancelled";

// The original execution owns registration lifetime, including cancellation and
// supervisor abort. No detached body and no request-owned replacement token.
struct WorkflowCancellationRegistration {
    tasks: OneShotTasks,
    id: Vec<u8>,
    signal: tokio::sync::watch::Sender<bool>,
}
impl WorkflowCancellationRegistration {
    fn new(tasks: &OneShotTasks, task: &db::Task) -> Result<Self, Status> {
        let id = task
            .task_id
            .as_ref()
            .ok_or_else(|| Status::data_loss("missing workflow ID"))?
            .task_uuid
            .clone();
        let signal = tokio::sync::watch::channel(false).0;
        let mut registrations = tasks
            .inner
            .workflow_cancellations
            .lock()
            .expect("workflow cancellation mutex poisoned");
        if registrations.contains_key(&id) {
            return Err(Status::failed_precondition(
                "workflow already has an execution owner",
            ));
        }
        registrations.insert(id.clone(), signal.clone());
        Ok(Self {
            tasks: tasks.clone(),
            id,
            signal,
        })
    }
}
impl Drop for WorkflowCancellationRegistration {
    fn drop(&mut self) {
        let mut registrations = self
            .tasks
            .inner
            .workflow_cancellations
            .lock()
            .expect("workflow cancellation mutex poisoned");
        if registrations
            .get(&self.id)
            .is_some_and(|signal| signal.same_channel(&self.signal))
        {
            registrations.remove(&self.id);
        }
    }
}

// Ordinary tasks need a pre-CAS quiescence handoff: their bodies hold actor
// admission. This registration is owned by the original dispatcher execution,
// and channel identity plus the retained generation prevent replacement ABA.
struct OrdinaryCancellationOwner {
    generation: std::sync::Arc<()>,
    signal: tokio::sync::watch::Sender<bool>,
}
struct OrdinaryCancellationRegistration {
    tasks: OneShotTasks,
    id: Vec<u8>,
    signal: tokio::sync::watch::Sender<bool>,
}
impl OrdinaryCancellationRegistration {
    fn new(
        tasks: &OneShotTasks,
        task: &db::Task,
        admission: &RunningTaskAdmission,
    ) -> Result<Option<Self>, Status> {
        let _owner = admission.lock_result()?;
        let id = task
            .task_id
            .as_ref()
            .ok_or_else(|| Status::data_loss("missing ordinary task ID"))?
            .task_uuid
            .clone();
        let signal = tokio::sync::watch::channel(false).0;
        let mut registrations = tasks
            .inner
            .ordinary_cancellations
            .lock()
            .expect("ordinary cancellation mutex poisoned");
        if let Some(owner) = registrations.get(&id) {
            if !std::sync::Arc::ptr_eq(&owner.generation, &admission.generation) {
                return Err(Status::failed_precondition(
                    "ordinary cancellation generation changed",
                ));
            }
            // Cancellation publishes even in the absence of an execution. The
            // same mutex linearizes that intent with registration: never turn
            // an absent-owner cancellation into a new, unsignalled body.
            if *owner.signal.borrow() {
                return Ok(None);
            }
            return Err(Status::failed_precondition(
                "ordinary task already has an execution owner",
            ));
        }
        registrations.insert(
            id.clone(),
            OrdinaryCancellationOwner {
                generation: admission.generation.clone(),
                signal: signal.clone(),
            },
        );
        Ok(Some(Self {
            tasks: tasks.clone(),
            id,
            signal,
        }))
    }
}
impl Drop for OrdinaryCancellationRegistration {
    fn drop(&mut self) {
        let mut registrations = self
            .tasks
            .inner
            .ordinary_cancellations
            .lock()
            .expect("ordinary cancellation mutex poisoned");
        if !*self.signal.borrow()
            && registrations
                .get(&self.id)
                .is_some_and(|owner| owner.signal.same_channel(&self.signal))
        {
            registrations.remove(&self.id);
        }
    }
}
async fn ordinary_interrupted(signal: &tokio::sync::watch::Sender<bool>) {
    let mut receiver = signal.subscribe();
    let _ = receiver.wait_for(|cancelled| *cancelled).await;
}

// Process-only barriers observe the real registration/admission path. They do
// not seed records, supply responses, or change actor-gate ordering.
#[cfg(feature = "test-support")]
fn ordinary_race_test_root(id: &db::TaskId) -> Option<std::path::PathBuf> {
    let root =
        std::path::PathBuf::from(std::env::var_os("REBOOT_TEST_ORDINARY_REGISTRATION_RACE")?);
    let selected = std::fs::read_to_string(root.join("target")).ok()?;
    (uuid::Uuid::from_slice(&id.task_uuid).ok()?.to_string() == selected.trim()).then_some(root)
}
#[cfg(feature = "test-support")]
fn ordinary_race_test_marker(id: &db::TaskId, stage: &str) -> Result<(), Status> {
    if let Some(root) = ordinary_race_test_root(id) {
        std::fs::write(
            root.join(stage),
            b"original execution/cancellation observation",
        )
        .map_err(|error| Status::internal(error.to_string()))?;
    }
    Ok(())
}
#[cfg(feature = "test-support")]
async fn ordinary_registration_test_barrier(id: &db::TaskId) -> Result<(), Status> {
    if let Some(root) = ordinary_race_test_root(id) {
        ordinary_race_test_marker(id, "before-registration")?;
        tokio::time::timeout(std::time::Duration::from_secs(30), async {
            while !root.join("register-release").exists() {
                tokio::time::sleep(std::time::Duration::from_millis(5)).await;
            }
        })
        .await
        .map_err(|_| Status::deadline_exceeded("ordinary registration test barrier"))?;
    }
    Ok(())
}
#[cfg(feature = "test-support")]
async fn ordinary_reader_test_lease(
    gate: &crate::runtime::ActorGate,
    id: &db::TaskId,
) -> Result<crate::runtime::SharedActorLease, Status> {
    use std::future::Future;
    let lease = gate.shared();
    tokio::pin!(lease);
    std::future::poll_fn(|cx| {
        let result = lease.as_mut().poll(cx);
        if result.is_pending()
            && let Err(error) = ordinary_race_test_marker(id, "shared-queued")
        {
            return std::task::Poll::Ready(Err(error));
        }
        result.map(Ok)
    })
    .await
}

/// Recognize the exact canonical system cancellation terminal, not a bare code.
/// Non-cancellation terminals return None and still need method-scoped validation.
pub fn task_cancellation_status(error: &prost_types::Any) -> Result<Option<Status>, Status> {
    let rich = decode_task_error(error)?;
    if rich.details[0].type_url != CANCELLED_TYPE {
        return Ok(None);
    }
    if rich.code != tonic::Code::Cancelled as i32 {
        return Err(Status::data_loss("cancellation terminal has wrong code"));
    }
    db::Cancelled::decode(rich.details[0].value.as_slice())
        .map_err(|_| Status::data_loss("malformed cancellation detail"))?;
    Ok(Some(Status::with_details(
        tonic::Code::Cancelled,
        rich.message,
        error.value.clone().into(),
    )))
}
fn cancelled_terminal(method: &str) -> db::task::ResponseOrError {
    db::task::ResponseOrError::Error(prost_types::Any {
        type_url: "type.googleapis.com/google.rpc.Status".into(),
        value: googleapis_tonic_google_rpc::google::rpc::Status {
            code: tonic::Code::Cancelled as i32,
            message: format!("the workflow running '{method}' was cancelled"),
            details: vec![prost_types::Any {
                type_url: CANCELLED_TYPE.into(),
                value: db::Cancelled {}.encode_to_vec(),
            }],
        }
        .encode_to_vec(),
    })
}
// Arm before the only mutating RPC. Cancellation/transport/ACK uncertainty must
// fail the supervised owner before actor admission is released. No detached retry.
struct CancellationWrite<'a> {
    ordinary: Option<(Vec<u8>, tokio::sync::watch::Sender<bool>)>,
    actor: Option<crate::runtime::ActorCommitAttempt>,
    tasks: &'a OneShotTasks,
    acknowledged: bool,
}
impl Drop for CancellationWrite<'_> {
    fn drop(&mut self) {
        // Wait retains this mutex from its uncertainty check through disclosure.
        // Publish uncertainty + clearing the pending-ACK fence under that same
        // lock: otherwise Wait can read clean-before-drop and clear-after-drop.
        let _publication = self
            .tasks
            .inner
            .running_owner
            .lock()
            .expect("task owner mutex poisoned");
        let published = self.actor.is_some();
        if self.acknowledged
            && let Some((id, signal)) = &self.ordinary
        {
            let mut registrations = self
                .tasks
                .inner
                .ordinary_cancellations
                .lock()
                .expect("ordinary cancellation mutex poisoned");
            if registrations
                .get(id)
                .is_some_and(|owner| owner.signal.same_channel(signal))
            {
                registrations.remove(id);
            }
        }
        if !self.acknowledged {
            self.tasks.inner.uncertain.send_replace(true);
            // Retire uncertainty before the actor lease can be released.
            drop(self.actor.take());
        } else if let Some(actor) = self.actor.take() {
            actor.checkpoint_acknowledged();
        }
        let pending = if published {
            let previous = self
                .tasks
                .inner
                .cancellation_writes
                .fetch_sub(1, std::sync::atomic::Ordering::AcqRel);
            debug_assert!(previous > 0);
            previous > 1
        } else {
            self.tasks
                .inner
                .cancellation_writes
                .load(std::sync::atomic::Ordering::Acquire)
                > 0
        };
        self.tasks
            .inner
            .cancellation_in_flight
            .store(pending, std::sync::atomic::Ordering::Release);
    }
}
impl ReaderTaskWaitService {
    async fn cancel_workflow_task(
        &self,
        request: tonic::Request<db::CancelTaskRequest>,
    ) -> Result<tonic::Response<db::CancelTaskResponse>, Status> {
        let policy = self
            .admin
            .as_ref()
            .ok_or_else(|| Status::permission_denied("task administration is not enabled"))?;
        let mut headers = crate::RebootHeaders::from_request(&request)
            .map_err(|error| Status::invalid_argument(error.to_string()))?;
        headers.server_id = Some(self.server_id.clone());
        headers.application_id = Some(self.application.as_str().to_owned());
        let routed_ref = headers.state_ref.clone();
        // Retain the original allocation across every policy/actor/Database await.
        // Defer route/owner/identity errors until policy denial has precedence.
        let id = request.get_ref().task_id.as_ref();
        let admission = id
            .and_then(|id| {
                self.tasks
                    .get(&(id.state_type.clone(), id.state_ref.clone()))
            })
            .map(OneShotTasks::workflow_running_admission);
        let (context, principal) = policy
            .verify(
                headers,
                "rbt.v1alpha1.Tasks",
                "rbt.v1alpha1.Tasks.CancelTask",
            )
            .await?;
        policy
            .authorize(
                &context,
                principal.as_ref(),
                None,
                &request.get_ref().encode_to_vec(),
            )
            .await?;
        let id = id.ok_or_else(|| Status::invalid_argument("missing task ID"))?;
        if id.state_ref != routed_ref
            || uuid::Uuid::from_slice(&id.task_uuid).map_or(true, |uuid| {
                uuid.get_version_num() != 4 || uuid.get_variant() != uuid::Variant::RFC4122
            })
        {
            return Err(Status::invalid_argument(
                "task must match routed actor and UUIDv4",
            ));
        }
        let admission =
            admission.ok_or_else(|| Status::invalid_argument("task actor is not registered"))??;
        self.require_authority(&id.state_ref)?;
        {
            let _owner = admission.lock()?;
        }
        let tasks = &admission.tasks;
        if tasks.inner.declarations.iter().any(|d| d.transaction)
            && let Some(response) = self.cancel_scheduled_transaction(&admission, id).await?
        {
            return Ok(response);
        }
        // Count each execution handoff independently of CAS serialization. Drop after a
        // body-interruption request publishes sticky uncertainty before releasing
        // the fence. Wait uses the same original-owner publication mutex.
        let mut write = CancellationWrite {
            ordinary: None,
            tasks,
            actor: None,
            acknowledged: true,
        };
        {
            let _owner = admission.lock()?;
            let mut registrations = tasks
                .inner
                .ordinary_cancellations
                .lock()
                .expect("ordinary cancellation mutex poisoned");
            // Publish an intent even if the due delivery has not registered yet.
            // Registration and signalling share this mutex and original-owner
            // publication lock, before any wait on terminal CAS serialization.
            let execution = registrations
                .entry(id.task_uuid.clone())
                .or_insert_with(|| OrdinaryCancellationOwner {
                    generation: admission.generation.clone(),
                    signal: tokio::sync::watch::channel(false).0,
                });
            if !std::sync::Arc::ptr_eq(&execution.generation, &admission.generation) {
                return Err(Status::failed_precondition(
                    "ordinary cancellation generation changed",
                ));
            }
            tasks
                .inner
                .cancellation_in_flight
                .store(true, std::sync::atomic::Ordering::Release);
            write.actor = Some(
                tasks
                    .inner
                    .store
                    .actor_gate(&id.state_type, &id.state_ref)
                    .commit_attempt(),
            );
            tasks
                .inner
                .cancellation_writes
                .fetch_add(1, std::sync::atomic::Ordering::AcqRel);
            write.acknowledged = false;
            write.ordinary = Some((id.task_uuid.clone(), execution.signal.clone()));
            execution.signal.send_replace(true);
        }
        #[cfg(feature = "test-support")]
        ordinary_race_test_marker(id, "intent-published")?;
        // Every requested body must receive its handoff before CAS serialization:
        // two shared readers must not wait for each other while holding admission.
        // The counted publication fence remains armed until every handoff retires.
        let _serial = tasks.inner.cancellation_serial.lock().await;
        let gate = tasks.inner.store.actor_gate(&id.state_type, &id.state_ref);
        let _lease = gate.exclusive().await;
        // Move the armed guard after the lease: failure must publish uncertainty
        // before another writer can obtain actor authority.
        let mut write = write;
        self.require_authority(&id.state_ref)?;
        {
            let _owner = admission.lock()?;
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
        self.require_authority(&id.state_ref)?;
        {
            let _owner = admission.lock()?;
        }
        let response = |status: db::cancel_task_response::Status| {
            Ok(tonic::Response::new(db::CancelTaskResponse {
                status: status as i32,
            }))
        };
        if loaded.tasks.is_empty() {
            // The authoritative lookup proves there is no execution to quiesce.
            // Clear this request's exact intent without manufacturing uncertainty.
            write.acknowledged = true;
            return response(db::cancel_task_response::Status::NotFound);
        }
        if loaded.tasks.len() != 1 || loaded.tasks[0].task_id.as_ref() != Some(id) {
            return Err(Status::data_loss(
                "cancellation lookup returned another task",
            ));
        }
        let mut task = loaded.tasks[0].clone();
        if task.status == db::task::Status::Completed as i32 {
            // No dispatch remains to cancel; do not replace any winner.
            write.acknowledged = true;
            return response(db::cancel_task_response::Status::NotFound);
        }
        tasks.validate(std::slice::from_ref(&task))?;
        if tasks.declaration(&task).is_none() {
            return Err(Status::failed_precondition(
                "only registered callable tasks can be cancelled",
            ));
        }
        // Cursor iteration/GC fencing is a distinct protocol. Preserve the old
        // unstarted-only boundary rather than claiming running cursor support.
        if tasks.cursor_declaration(&task).is_some()
            && (schedule_due(&task)?
                || !tasks.inner.listing.snapshot().iter().any(|info| {
                    info.task_id.as_ref() == Some(id)
                        && info.status == db::task_info::Status::Scheduled as i32
                }))
        {
            return Err(Status::failed_precondition(
                "running cursor workflows cannot be cancelled",
            ));
        }
        task.status = db::task::Status::Completed as i32;
        task.response_or_error = Some(cancelled_terminal(&task.method));
        {
            // Linearize the counted disclosure fence with Wait's owner lock.
            let _owner = admission.lock()?;
            if write.actor.is_none() {
                write.actor = Some(gate.commit_attempt());
                tasks
                    .inner
                    .cancellation_writes
                    .fetch_add(1, std::sync::atomic::Ordering::AcqRel);
            }
            tasks
                .inner
                .cancellation_in_flight
                .store(true, std::sync::atomic::Ordering::Release);
        }
        write.acknowledged = false;
        let won = tasks
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
        self.require_authority(&id.state_ref)?;
        // Retain the original generation through notification and the synchronous
        // response decision; never notify a replacement execution allocation.
        let _owner = admission.lock()?;
        if !won {
            // Under the local actor lease, another terminal is unexpected. Keep
            // uncertainty sticky instead of adopting a response or retrying CAS.
            return Err(Status::failed_precondition(
                "cancellation completion lost canonical CAS",
            ));
        }
        write.acknowledged = true;
        if let Some(signal) = tasks
            .inner
            .workflow_cancellations
            .lock()
            .expect("workflow cancellation mutex poisoned")
            .get(&id.task_uuid)
        {
            signal.send_replace(true);
        }
        tasks.inner.sender.try_send(()).ok(); // hint only; canonical rescan owns pruning
        response(db::cancel_task_response::Status::Ok)
    }
}

#[cfg(test)]
#[path = "task_cancellation_tests.rs"]
mod cancellation_tests;
