//! Bounded generated same-local-actor unary reader tasks. No retries, writer
//! effects, workflow iterations, or task cancellation API. Absolute UTC schedules
//! are durable; the host rescans without spawning a sleeping child per task.
//! Handler failures and host cancellation leave durable tasks pending.
use crate::{
    application_host::{HostRecovery, RecoveryCancellation},
    database_proto as db,
    runtime::DatabaseActorStore,
};
use std::{
    collections::HashSet,
    sync::{Arc, Mutex},
};
const MAX_TASKS: usize = 1024;
use tokio::{sync::mpsc, task::JoinSet};
use tonic::Status;

/// Generated binding owns the typed decoder and reader handler. Execution is
/// called under a shared actor lease and must not recursively acquire it.
#[tonic::async_trait]
pub trait ReaderTaskBinding: Send + Sync + 'static {
    fn validate(&self, task: &db::Task) -> Result<(), Status>;
    async fn execute(&self, task: &db::Task) -> Result<prost_types::Any, Status>;
}

#[derive(Clone)]
pub struct OneShotTasks {
    inner: Arc<Inner>,
}
struct Inner {
    store: DatabaseActorStore,
    state_type: String,
    state_ref: String,
    binding: Arc<dyn ReaderTaskBinding>,
    sender: mpsc::Sender<()>,
    receiver: Mutex<Option<mpsc::Receiver<()>>>,
    active: std::sync::atomic::AtomicBool,
    recovery_request: Mutex<Option<db::RecoverRequest>>,
    uncertain: tokio::sync::watch::Sender<bool>,
}
impl OneShotTasks {
    pub fn new(
        store: DatabaseActorStore,
        state_type: String,
        state_ref: String,
        binding: impl ReaderTaskBinding,
    ) -> Result<Self, Status> {
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
                sender,
                receiver: Mutex::new(Some(receiver)),
                active: false.into(),
                recovery_request: Mutex::new(None),
                uncertain: tokio::sync::watch::channel(false).0,
            }),
        })
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
            self.inner.binding.validate(task)?;
        }
        Ok(())
    }
    /// Scheduling is usable only after host registration has taken ownership.
    pub async fn validate_staged(&self, tasks: &[db::Task]) -> Result<(), Status> {
        if !self.inner.active.load(std::sync::atomic::Ordering::Acquire) {
            return Err(Status::failed_precondition(
                "task dispatcher has no running host owner",
            ));
        }
        self.validate(tasks)?;
        let request = self
            .inner
            .recovery_request
            .lock()
            .expect("task recovery mutex poisoned")
            .clone()
            .ok_or_else(|| Status::failed_precondition("no task recovery owner"))?;
        let pending = self.pending(request).await?;
        #[cfg(feature = "test-support")]
        if let Some(marker) = std::env::var_os("REBOOT_TEST_TASK_ADMISSION_CANCEL") {
            let marker = std::path::Path::new(&marker);
            if !marker.exists() {
                std::fs::write(
                    marker,
                    "canonical Recover complete; admission Load not staged",
                )
                .map_err(|error| Status::internal(error.to_string()))?;
                std::future::pending::<()>().await;
            }
        }
        if pending.len().saturating_add(tasks.len()) > MAX_TASKS {
            return Err(Status::resource_exhausted(
                "pending plus staged tasks exceed 1024",
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
        Ok(())
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
    async fn execute(
        &self,
        mut task: db::Task,
        cancel: &RecoveryCancellation,
    ) -> Result<(), Status> {
        let id = task.task_id.clone().expect("validated task identity");
        let gate = self.inner.store.actor_gate(&id.state_type, &id.state_ref);
        let response = {
            let _lease = gate.shared().await;
            cancel.public_ready().await?;
            // Actor admission may have waited while the wall clock moved back.
            // Recheck before user code, leaving the durable record pending.
            if !schedule_due(&task)? {
                return Ok(());
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
            if pending.status == db::task::Status::Completed as i32 {
                return Ok(());
            }
            if pending != &task {
                return Err(Status::failed_precondition(
                    "committed task differs from dispatch",
                ));
            }
            if !schedule_due(&task)? {
                return Ok(());
            }
            self.inner.binding.execute(&task).await?
        };
        let _lease = gate.exclusive().await;
        task.status = db::task::Status::Completed as i32;
        task.response_or_error = Some(db::task::ResponseOrError::Response(response));
        self.inner
            .store
            .task_database()
            .complete_task(db::CompleteTaskRequest {
                task: Some(task),
                sync: true,
            })
            .await?;
        Ok(())
    }
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
        Ok(Self { tasks, key })
    }
}
impl Drop for DispatchOwner {
    fn drop(&mut self) {
        self.tasks
            .inner
            .active
            .store(false, std::sync::atomic::Ordering::Release);
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
        let pending = self.tasks.pending(self.request.clone()).await?;
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
            let _owner = owner;
            // A single owner serializes handler deliveries. Notifications are
            // coalesced hints, never task payloads; durable scans cover ambiguous
            // notifications lost after acknowledged participant release. A root
            // with an uncertain durable handoff fails the supervised host instead.
            let work = async {
                cancel.public_ready().await?;
                let mut pending = pending;
                loop {
                    for task in pending {
                        cancel.public_ready().await?;
                        // Future work does not block immediate tasks later in
                        // this batch. Canonical rescans remain bounded and own
                        // all scheduling; no detached timer is created.
                        if schedule_due(&task)? { tasks.execute(task, &cancel).await?; }
                    }
                    tokio::select! {
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
            let result = tokio::select! {
                biased;
                result = failure => result,
                _ = cancel.cancelled() => Ok(()),
                result = work => result,
            };
            tasks
                .inner
                .active
                .store(false, std::sync::atomic::Ordering::Release);
            result
        });
        Ok(())
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
