//! Unexecuted source candidate: transport model, NOT native RocksDB acceptance.
#[path = "constructor_lifecycle_tests.rs"]
mod lifecycle;
#[path = "constructor_capability_tests.rs"]
mod capability;
use super::*;
use crate::proto::Counter;
use crate::runtime::{DurableStateDeclaration, StateAdmission, WriterExecution};
use prost::Message;
struct Account;
impl DurableStateDeclaration for Account {
    type State = Counter;
    const STATE_TYPE: &'static str = "tests.reboot.protoc.Counter";
    const TASK_STATE_ADMISSION: StateAdmission = StateAdmission::RequireExisting;
}
const OPEN: &str = "tests.reboot.protoc.Account.Open";
const EMAIL: &str = "tests.reboot.protoc.Account.WelcomeEmail";
const COUNTER: &str = "type.googleapis.com/tests.reboot.protoc.Counter";
const ID: &str = "type.googleapis.com/rbt.v1alpha1.TaskId";
struct Binding;
#[tonic::async_trait]
impl ReaderTaskBinding for Binding {
    fn validate(&self, task: &db::Task) -> Result<(), Status> {
        if task.method != "WelcomeEmail" {
            return Err(Status::invalid_argument("not email"));
        }
        Counter::decode(task.request.as_slice())
            .map_err(|_| Status::invalid_argument("request"))?;
        Ok(())
    }
    async fn execute(&self, _: &db::Task) -> Result<prost_types::Any, Status> {
        panic!("not a dispatcher proof")
    }
    fn writer_capable(&self) -> bool {
        true
    }
    fn is_writer(&self, task: &db::Task) -> bool {
        task.method == "WelcomeEmail"
    }
    fn validate_response(&self, _: &db::Task, response: &prost_types::Any) -> Result<(), Status> {
        if response.type_url != COUNTER {
            return Err(Status::data_loss("response type"));
        }
        Counter::decode(response.value.as_slice()).map_err(|_| Status::data_loss("response"))?;
        Ok(())
    }
}
struct Fixture {
    store: DatabaseActorStore,
    database: crate::runtime::test_support::FakeDatabase,
    tasks: OneShotTasks,
    reference: String,
    _owner: Mutex<Option<Arc<DispatchOwner>>>,
    server: tokio::task::JoinHandle<()>,
}
impl Fixture {
    async fn new() -> Self {
        let (endpoint, database, server) = crate::runtime::test_support::start_database().await;
        let store = DatabaseActorStore::connect_lazy(endpoint).unwrap();
        let reference = crate::state_ref::StateRef::from_id(
            Account::STATE_TYPE,
            &uuid::Uuid::new_v4().to_string(),
        )
        .unwrap()
        .to_string();
        let tasks = OneShotTasks::new_with_declarations(
            store.clone(),
            Account::STATE_TYPE.into(),
            reference.clone(),
            Binding,
            vec![
                TaskMethodDeclaration::new::<Account, Counter, db::TaskId>(OPEN, ID, vec![])
                    .constructor_scheduling(),
                TaskMethodDeclaration::new::<Account, Counter, Counter>(EMAIL, COUNTER, vec![]),
            ],
        )
        .unwrap();
        let owner = DispatchOwner::claim(tasks.clone()).unwrap();
        *tasks.inner.recovery_request.lock().unwrap() = Some(db::RecoverRequest::default());
        tasks
            .inner
            .active
            .store(true, std::sync::atomic::Ordering::Release);
        Self {
            store,
            database,
            tasks,
            reference,
            _owner: Mutex::new(Some(Arc::new(owner))),
            server,
        }
    }
    fn shutdown_owner(&self) {
        if let Some(owner) = self._owner.lock().unwrap().take() {
            drop(DispatchSupervisorOwner(owner));
        }
    }
    fn task(&self) -> db::Task {
        db::Task {
            task_id: Some(db::TaskId {
                state_type: Account::STATE_TYPE.into(),
                state_ref: self.reference.clone(),
                task_uuid: uuid::Uuid::new_v4().as_bytes().to_vec(),
            }),
            method: "WelcomeEmail".into(),
            request: Counter { value: 7 }.encode_to_vec(),
            status: db::task::Status::Pending as i32,
            timestamp: Some(prost_types::Timestamp {
                seconds: 2_000_000_000,
                nanos: 0,
            }),
            ..Default::default()
        }
    }
    async fn call(
        &self,
        key: uuid::Uuid,
        value: i64,
        task: db::Task,
    ) -> Result<db::TaskId, Status> {
        let mut request = tonic::Request::new(Counter { value });
        let mut headers = crate::RebootHeaders::new(&self.reference);
        headers.idempotency_key = Some(key);
        *request.metadata_mut() = headers.to_metadata().unwrap();
        self.store
            .scheduling_constructor_async_for_method_authorized::<Account, _, _, _>(
                (OPEN, ID),
                &crate::auth::AuthorizationPolicy::permissive_for_development(),
                Some(&self.tasks),
                request,
                move |state, request, reference| {
                    Box::pin(async move {
                        assert_eq!(reference, task.task_id.as_ref().unwrap().state_ref);
                        state.value = request.value;
                        Ok(WriterExecution {
                            response: task.task_id.clone().unwrap(),
                            task_upserts: vec![task],
                        })
                    })
                },
            )
            .await
            .map(tonic::Response::into_inner)
    }
}
impl Drop for Fixture {
    fn drop(&mut self) {
        self.server.abort();
    }
}
#[tokio::test]
async fn constructor_atomic_payload_pending_completed_response_and_task_id_replay() {
    let f = Fixture::new().await;
    let key = uuid::Uuid::new_v4();
    let task = f.task();
    let id = f.call(key, 7, task.clone()).await.unwrap();
    assert_eq!(Some(id.clone()), task.task_id);
    let writes = f.database.create_requests();
    assert_eq!(writes.len(), 1);
    assert!(f.database.store_requests().is_empty());
    assert!(writes[0].sync);
    assert_eq!(writes[0].task_upserts, vec![task.clone()]);
    assert_eq!(
        writes[0].idempotent_mutation.as_ref().unwrap().task_ids,
        vec![id.clone()]
    );
    assert_eq!(f.call(key, 7, f.task()).await.unwrap(), id);
    let mut completed = task.clone();
    completed.status = db::task::Status::Completed as i32;
    completed.response_or_error = Some(db::task::ResponseOrError::Response(prost_types::Any {
        type_url: COUNTER.into(),
        value: Counter { value: 8 }.encode_to_vec(),
    }));
    f.database.seed_task(completed);
    assert_eq!(f.call(key, 7, f.task()).await.unwrap(), id);
    assert!(f.call(key, 8, f.task()).await.is_err());
    assert!(f.call(uuid::Uuid::new_v4(), 7, f.task()).await.is_err());
    assert_eq!(f.database.create_requests().len(), 1);
}
#[tokio::test]
async fn constructor_owner_capacity_collision_and_dispatch_target_exclusion() {
    let f = Fixture::new().await;
    let task = f.task();
    assert!(
        f.tasks
            .validate_constructor_writer::<Account, Counter, db::TaskId>(OPEN, ID)
            .is_ok()
    );
    assert!(
        f.tasks
            .validate_ordinary_writer::<Account, Counter, db::TaskId>(OPEN, ID)
            .is_err()
    );
    let mut constructor = task.clone();
    constructor.method = "Open".into();
    assert!(f.tasks.validate(&[constructor]).is_err());
    f.tasks
        .inner
        .max_live
        .store(1, std::sync::atomic::Ordering::Release);
    f.database.seed_task(f.task());
    assert_eq!(
        f.call(uuid::Uuid::new_v4(), 7, task.clone())
            .await
            .unwrap_err()
            .code(),
        tonic::Code::ResourceExhausted
    );
    f.tasks
        .inner
        .max_live
        .store(10, std::sync::atomic::Ordering::Release);
    f.database.seed_task(task.clone());
    assert_eq!(
        f.call(uuid::Uuid::new_v4(), 7, task)
            .await
            .unwrap_err()
            .code(),
        tonic::Code::AlreadyExists
    );
    assert!(f.database.create_requests().is_empty());
    assert!(f.database.store_requests().is_empty());
}
#[tokio::test]
async fn engine_changed_after_successful_preflight_never_falls_back_and_retains_actual_gate() {
    let f = Fixture::new().await;
    f.database.reject_task_create();
    assert_eq!(
        f.call(uuid::Uuid::new_v4(), 7, f.task())
            .await
            .unwrap_err()
            .code(),
        tonic::Code::Unimplemented
    );
    assert!(f.database.create_requests().is_empty());
    assert!(f.database.store_requests().is_empty());
    assert!(*f.tasks.inner.uncertain.borrow());
    let gate = f.store.actor_gate(Account::STATE_TYPE, &f.reference);
    assert!(
        tokio::time::timeout(std::time::Duration::from_millis(10), gate.exclusive())
            .await
            .is_err()
    );
}
#[tokio::test]
async fn cancelled_create_retains_lease_and_original_generation_without_dispatch() {
    let f = Fixture::new().await;
    let (entered, _release) = f.database.park_create();
    let original = f.tasks.inner.running_owner.lock().unwrap().clone().unwrap();
    let mut call = Box::pin(f.call(uuid::Uuid::new_v4(), 7, f.task()));
    tokio::select! { result = &mut call => panic!("unexpected {result:?}"), result = entered => result.unwrap() }
    assert!(f.database.create_requests().is_empty());
    drop(call);
    assert!(*f.tasks.inner.uncertain.borrow());
    assert!(Arc::ptr_eq(
        &original,
        f.tasks
            .inner
            .running_owner
            .lock()
            .unwrap()
            .as_ref()
            .unwrap()
    ));
    assert!(f.tasks.workflow_running_admission().is_err());
    let gate = f.store.actor_gate(Account::STATE_TYPE, &f.reference);
    assert!(
        tokio::time::timeout(std::time::Duration::from_millis(10), gate.exclusive())
            .await
            .is_err()
    );
}

#[tokio::test]
async fn committed_but_unacknowledged_create_does_not_release_actor_or_generation() {
    let f = Fixture::new().await;
    let (entered, _release) = f.database.park_create_ack();
    let mut call = Box::pin(f.call(uuid::Uuid::new_v4(), 7, f.task()));
    tokio::select! { result = &mut call => panic!("unexpected {result:?}"), result = entered => result.unwrap() }
    assert_eq!(
        f.database.create_requests().len(),
        1,
        "modeled batch durable before ACK"
    );
    let gate = f.store.actor_gate(Account::STATE_TYPE, &f.reference);
    assert!(
        tokio::time::timeout(std::time::Duration::from_millis(10), gate.exclusive())
            .await
            .is_err()
    );
    drop(call);
    assert!(*f.tasks.inner.uncertain.borrow());
    assert!(
        tokio::time::timeout(std::time::Duration::from_millis(10), gate.exclusive())
            .await
            .is_err()
    );
    assert!(f.database.store_requests().is_empty());
}

#[tokio::test]
async fn ownerless_constructor_fails_closed_without_native_create() {
    let f = Fixture::new().await;
    let mut request = tonic::Request::new(Counter { value: 3 });
    let mut headers = crate::RebootHeaders::new(&f.reference);
    headers.idempotency_key = Some(uuid::Uuid::new_v4());
    *request.metadata_mut() = headers.to_metadata().unwrap();
    let error = f
        .store
        .scheduling_constructor_async_for_method_authorized::<Account, _, _, _>(
            (OPEN, COUNTER),
            &crate::auth::AuthorizationPolicy::permissive_for_development(),
            None,
            request,
            |_, _, _| {
                Box::pin(async move {
                    panic!("ownerless handler must not run");
                    #[allow(unreachable_code)]
                    Ok(WriterExecution::new(Counter::default()))
                })
            },
        )
        .await
        .unwrap_err();
    assert_eq!(error.code(), tonic::Code::FailedPrecondition);
    assert!(f.database.create_requests().is_empty());
    assert!(f.database.store_requests().is_empty());
    assert!(!*f.tasks.inner.uncertain.borrow());
    let gate = f.store.actor_gate(Account::STATE_TYPE, &f.reference);
    drop(
        tokio::time::timeout(std::time::Duration::from_secs(1), gate.exclusive())
            .await
            .unwrap(),
    );
}

#[path = "constructor_host_lifecycle_tests.rs"]
mod host_lifecycle;
