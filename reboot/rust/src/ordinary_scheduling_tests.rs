//! Focused transport-backed fake tests: payload/replay authority, not RocksDB CAS proof.
use super::*;
use crate::proto::Counter;
use crate::runtime::{
    DurableStateDeclaration, StateAdmission, WriterExecution, test_support::FakeDatabase,
};
use prost::Message;
struct Implicit;
impl DurableStateDeclaration for Implicit {
    type State = Counter;
    const STATE_TYPE: &'static str = "tests.reboot.protoc.Counter";
    const TASK_STATE_ADMISSION: StateAdmission = StateAdmission::DefaultOnAbsent;
}
const METHOD: &str = "tests.reboot.protoc.CounterWritesMethods.Increment";
const RESPONSE: &str = "type.googleapis.com/tests.reboot.protoc.Counter";
struct Binding;
#[tonic::async_trait]
impl ReaderTaskBinding for Binding {
    fn validate(&self, task: &db::Task) -> Result<(), Status> {
        if task.method != "Increment" {
            return Err(Status::invalid_argument("method"));
        }
        Counter::decode(task.request.as_slice())
            .map_err(|_| Status::invalid_argument("request"))?;
        Ok(())
    }
    async fn execute(&self, _: &db::Task) -> Result<prost_types::Any, Status> {
        panic!("no dispatcher")
    }
    fn writer_capable(&self) -> bool {
        true
    }
    fn is_writer(&self, task: &db::Task) -> bool {
        task.method == "Increment"
    }
    fn validate_response(&self, _: &db::Task, response: &prost_types::Any) -> Result<(), Status> {
        if response.type_url != RESPONSE {
            return Err(Status::data_loss("response type"));
        }
        Counter::decode(response.value.as_slice()).map_err(|_| Status::data_loss("response"))?;
        Ok(())
    }
}
struct Fixture {
    store: DatabaseActorStore,
    database: FakeDatabase,
    server: tokio::task::JoinHandle<()>,
    reference: String,
    tasks: OneShotTasks,
    _owner: DispatchOwner,
}
impl Fixture {
    async fn new() -> Self {
        let (endpoint, database, server) = crate::runtime::test_support::start_database().await;
        let store = DatabaseActorStore::connect_lazy(endpoint).unwrap();
        let reference = crate::state_ref::StateRef::from_id(
            Implicit::STATE_TYPE,
            &uuid::Uuid::new_v4().to_string(),
        )
        .unwrap()
        .to_string();
        let tasks = OneShotTasks::new_with_declarations(
            store.clone(),
            Implicit::STATE_TYPE.into(),
            reference.clone(),
            Binding,
            vec![TaskMethodDeclaration::new::<Implicit, Counter, Counter>(
                METHOD,
                RESPONSE,
                vec![],
            )],
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
            server,
            reference,
            tasks,
            _owner: owner,
        }
    }
    fn successor(&self) -> db::Task {
        db::Task {
            task_id: Some(db::TaskId {
                state_type: Implicit::STATE_TYPE.into(),
                state_ref: self.reference.clone(),
                task_uuid: uuid::Uuid::new_v4().as_bytes().to_vec(),
            }),
            method: "Increment".into(),
            request: Counter { value: 3 }.encode_to_vec(),
            timestamp: Some(prost_types::Timestamp {
                seconds: 2_000_000_000,
                nanos: 0,
            }),
            status: db::task::Status::Pending as i32,
            ..Default::default()
        }
    }
    fn request(&self, key: uuid::Uuid, reference: &str) -> tonic::Request<Counter> {
        let mut request = tonic::Request::new(Counter { value: 7 });
        let mut headers = crate::RebootHeaders::new(reference);
        headers.idempotency_key = Some(key);
        *request.metadata_mut() = headers.to_metadata().unwrap();
        request
    }
    async fn call(&self, key: uuid::Uuid, effects: Vec<db::Task>) -> Result<Counter, Status> {
        self.store
            .scheduling_writer_async_for_method_authorized::<Implicit, _, _, _>(
                (METHOD, RESPONSE, StateAdmission::DefaultOnAbsent),
                &crate::auth::AuthorizationPolicy::permissive_for_development(),
                Some(&self.tasks),
                self.request(key, &self.reference),
                move |state, request, _| {
                    Box::pin(async move {
                        state.value += request.value;
                        Ok(WriterExecution {
                            response: *state,
                            task_upserts: effects,
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
async fn ordinary_scheduling_atomic_creation_pending_completed_replay_and_legacy_fence() {
    let fixture = Fixture::new().await;
    let key = uuid::Uuid::new_v4();
    let successor = fixture.successor();
    assert_eq!(
        fixture
            .call(key, vec![successor.clone()])
            .await
            .unwrap()
            .value,
        7
    );
    let writes = fixture.database.store_requests();
    assert_eq!(writes.len(), 1);
    let write = &writes[0];
    assert!(write.sync && write.transaction.is_none() && write.colocated_upserts.is_empty());
    assert_eq!(write.task_upserts, vec![successor.clone()]);
    assert_eq!(
        write.idempotent_mutation.as_ref().unwrap().task_ids,
        vec![successor.task_id.clone().unwrap()]
    );
    fixture.database.seed_actor(
        Implicit::STATE_TYPE,
        &fixture.reference,
        Counter { value: 100 }.encode_to_vec(),
    );
    assert_eq!(fixture.call(key, vec![]).await.unwrap().value, 7);
    let mut completed = successor.clone();
    completed.status = db::task::Status::Completed as i32;
    completed.response_or_error = Some(db::task::ResponseOrError::Response(prost_types::Any {
        type_url: RESPONSE.into(),
        value: Counter { value: 10 }.encode_to_vec(),
    }));
    fixture.database.seed_task(completed.clone());
    assert_eq!(fixture.call(key, vec![]).await.unwrap().value, 7);
    assert_eq!(
        fixture.database.store_requests().len(),
        1,
        "replay cannot resurrect completed successor"
    );
    assert_eq!(
        fixture
            .store
            .load_for_declaration::<Implicit>(&fixture.reference)
            .await
            .unwrap()
            .unwrap()
            .value,
        100
    );
    assert!(
        fixture
            .store
            .replay::<Counter, Counter>(&fixture.reference, key)
            .await
            .is_err()
    );
    let mut stripped = write.idempotent_mutation.clone().unwrap();
    stripped.task_ids.clear();
    fixture.database.seed_mutation(stripped);
    assert!(fixture.call(key, vec![]).await.is_err());
    assert!(
        fixture
            .store
            .replay::<Counter, Counter>(&fixture.reference, key)
            .await
            .is_err()
    );
}

#[tokio::test]
async fn admitted_writer_schedules_atomically_and_replays_before_actor_load() {
    let fixture = Fixture::new().await;
    let parent = fixture.successor();
    fixture.database.seed_task(parent.clone());
    let successor = fixture.successor();
    let (cancel, _) = RecoveryCancellation::test_host();
    let started = std::sync::atomic::AtomicBool::new(false);
    let admitted = || AdmittedWriterTask {
        store: &fixture.store,
        task: &parent,
        method: METHOD,
        response_type: RESPONSE,
        started: &started,
        cancel: &cancel,
        tasks: &fixture.tasks,
    };
    let receipt = admitted()
        .execute_scheduling_outcome::<Implicit, Counter, Counter, _>(|state, request, reference| {
            let successor = successor.clone();
            Box::pin(async move {
                assert_eq!(successor.task_id.as_ref().unwrap().state_ref, reference);
                state.value += request.value;
                Ok(WriterExecution {
                    response: *state,
                    task_upserts: vec![successor],
                })
            })
        })
        .await
        .unwrap();
    assert!(matches!(receipt.outcome, WriterTaskOutcome::Terminal(_)));
    let write = fixture.database.store_requests().remove(0);
    assert_eq!(write.task_upserts, vec![successor.clone()]);
    assert!(
        !write
            .task_upserts
            .iter()
            .any(|t| t.task_id == parent.task_id)
    );
    fixture
        .database
        .fail_actor_load(Status::unavailable("actor Load must not run on replay"));
    // The scheduling replay legitimately loads successors only, not actor state.
    fixture.database.clear_actor_load_failure();
    fixture
        .database
        .seed_actor(Implicit::STATE_TYPE, &fixture.reference, vec![255]);
    let replay = admitted()
        .execute_scheduling_outcome::<Implicit, Counter, Counter, _>(|_, _, _| {
            Box::pin(async { panic!("checkpoint replay handler") })
        })
        .await
        .unwrap();
    assert!(matches!(replay.outcome, WriterTaskOutcome::Terminal(_)));
    assert_eq!(fixture.database.store_requests().len(), 1);
}

#[tokio::test]
async fn ordinary_scheduling_rejects_checkpoint_corruption_and_successor_conflicts() {
    let fixture = Fixture::new().await;
    let successor = fixture.successor();
    let key = uuid::Uuid::new_v4();
    fixture.call(key, vec![successor.clone()]).await.unwrap();
    let original = fixture.database.store_requests()[0]
        .idempotent_mutation
        .clone()
        .unwrap();
    for vector in 0..9 {
        let mut bad = original.clone();
        match vector {
            0 => bad.workflow_id = Some(vec![1; 16]),
            1 => bad.workflow_iteration = Some(0),
            2 => bad.request_fingerprint = None,
            3 => bad.request_fingerprint = Some(vec![1]),
            4 => bad.task_ids.clear(),
            5 => bad.task_ids.push(successor.task_id.clone().unwrap()),
            6 => bad.task_ids[0].state_ref = "other".into(),
            7 => bad.response = vec![255],
            _ => bad.task_ids[0].task_uuid = uuid::Uuid::new_v4().as_bytes().to_vec(),
        }
        fixture.database.seed_mutation(bad);
        assert!(fixture.call(key, vec![]).await.is_err(), "vector {vector}");
    }
    fixture.database.seed_mutation(original);
    for vector in 0..5 {
        let mut bad = successor.clone();
        match vector {
            0 => bad.method = "Other".into(),
            1 => bad.request = Counter { value: 9 }.encode_to_vec(),
            2 => bad.timestamp.as_mut().unwrap().seconds += 1,
            3 => {
                bad.status = db::task::Status::Completed as i32;
                bad.response_or_error =
                    Some(db::task::ResponseOrError::Response(prost_types::Any {
                        type_url: "type.googleapis.com/Wrong".into(),
                        value: vec![],
                    }));
            }
            _ => bad.iteration = 1,
        }
        fixture.database.seed_task(bad);
        assert!(
            fixture.call(key, vec![]).await.is_err(),
            "successor vector {vector}"
        );
    }
    fixture
        .database
        .remove_task(successor.task_id.as_ref().unwrap());
    assert!(fixture.call(key, vec![]).await.is_err());
    assert_eq!(fixture.database.store_requests().len(), 1);
}

#[tokio::test]
async fn ordinary_scheduling_owner_budget_collision_and_empty_scope_compatibility() {
    let fixture = Fixture::new().await;
    let successor = fixture.successor();
    fixture
        .tasks
        .inner
        .max_live
        .store(1, std::sync::atomic::Ordering::Release);
    let parent = fixture.successor();
    fixture.database.seed_task(parent.clone());
    assert_eq!(
        fixture
            .call(uuid::Uuid::new_v4(), vec![successor.clone()])
            .await
            .unwrap_err()
            .code(),
        tonic::Code::ResourceExhausted
    );
    fixture
        .tasks
        .inner
        .max_live
        .store(10, std::sync::atomic::Ordering::Release);
    assert_eq!(
        fixture
            .call(uuid::Uuid::new_v4(), vec![parent])
            .await
            .unwrap_err()
            .code(),
        tonic::Code::AlreadyExists
    );
    fixture
        .tasks
        .inner
        .active
        .store(false, std::sync::atomic::Ordering::Release);
    assert!(
        fixture
            .call(uuid::Uuid::new_v4(), vec![successor])
            .await
            .is_err()
    );
    assert!(
        fixture.call(uuid::Uuid::new_v4(), vec![]).await.is_ok(),
        "empty effects do not require running owner"
    );
    let other = crate::state_ref::StateRef::from_id(Implicit::STATE_TYPE, "other-actor")
        .unwrap()
        .to_string();
    fixture
        .store
        .scheduling_writer_async_for_method_authorized::<Implicit, _, _, _>(
            (METHOD, RESPONSE, StateAdmission::DefaultOnAbsent),
            &crate::auth::AuthorizationPolicy::permissive_for_development(),
            Some(&fixture.tasks),
            fixture.request(uuid::Uuid::new_v4(), &other),
            |state, _, _| Box::pin(async move { Ok(WriterExecution::new(*state)) }),
        )
        .await
        .unwrap();
    let key = uuid::Uuid::new_v4();
    fixture
        .store
        .scheduling_writer_async_for_method_authorized::<Implicit, _, _, _>(
            (METHOD, RESPONSE, StateAdmission::DefaultOnAbsent),
            &crate::auth::AuthorizationPolicy::permissive_for_development(),
            None,
            fixture.request(key, &other),
            |state, _, _| Box::pin(async move { Ok(WriterExecution::new(*state)) }),
        )
        .await
        .unwrap();
    let denied = fixture
        .store
        .scheduling_writer_async_for_method_authorized::<Implicit, Counter, Counter, _>(
            (METHOD, RESPONSE, StateAdmission::DefaultOnAbsent),
            &crate::auth::AuthorizationPolicy::default(),
            None,
            fixture.request(key, &other),
            |_, _, _| Box::pin(async { panic!("authorization denial before replay") }),
        )
        .await
        .unwrap_err();
    assert_eq!(denied.code(), tonic::Code::PermissionDenied);
}
