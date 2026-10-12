//! Unit coverage of admitted execution against the SDK's explicit storage fake.
//! This does not certify dispatcher admission, CompleteTask CAS, or native restart.
use super::*;
use crate::proto::Counter;
use crate::runtime::{DurableStateDeclaration, StateAdmission, test_support::FakeDatabase};
use prost::Message;

struct Implicit;
impl DurableStateDeclaration for Implicit {
    type State = Counter;
    const STATE_TYPE: &'static str = "tests.reboot.protoc.Counter";
    const TASK_STATE_ADMISSION: StateAdmission = StateAdmission::DefaultOnAbsent;
}
struct Explicit;
impl DurableStateDeclaration for Explicit {
    type State = Counter;
    const STATE_TYPE: &'static str = Implicit::STATE_TYPE;
}
struct Unused;
#[tonic::async_trait]
impl ReaderTaskBinding for Unused {
    fn validate(&self, _: &db::Task) -> Result<(), Status> {
        Ok(())
    }
    async fn execute(&self, _: &db::Task) -> Result<prost_types::Any, Status> {
        panic!("dispatcher not under test")
    }
    fn validate_response(&self, _: &db::Task, _: &prost_types::Any) -> Result<(), Status> {
        Ok(())
    }
}
const METHOD: &str = "tests.reboot.protoc.CounterWritesMethods.Increment";
const RESPONSE: &str = "type.googleapis.com/tests.reboot.protoc.Counter";

#[tokio::test]
async fn admitted_implicit_creation_failure_success_and_checkpoint_replay() {
    let database = FakeDatabase::default();
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    let (stop, stopped) = tokio::sync::oneshot::channel();
    let server = tokio::spawn(
        tonic::transport::Server::builder()
            .add_service(db::database_server::DatabaseServer::new(database.clone()))
            .serve_with_incoming_shutdown(
                tokio_stream::wrappers::TcpListenerStream::new(listener),
                async {
                    let _ = stopped.await;
                },
            ),
    );
    let store = DatabaseActorStore::connect(format!("http://{address}"))
        .await
        .unwrap();
    let reference = crate::state_ref::StateRef::from_id(Implicit::STATE_TYPE, "implicit-task")
        .unwrap()
        .to_string();
    let task = db::Task {
        task_id: Some(db::TaskId {
            state_type: Implicit::STATE_TYPE.into(),
            state_ref: reference.clone(),
            task_uuid: uuid::Uuid::new_v4().as_bytes().to_vec(),
        }),
        method: "Increment".into(),
        request: Counter { value: 5 }.encode_to_vec(),
        status: db::task::Status::Pending as i32,
        ..Default::default()
    };
    let owner = OneShotTasks::new_with_declarations(
        store.clone(),
        Implicit::STATE_TYPE.into(),
        reference.clone(),
        Unused,
        vec![TaskMethodDeclaration::new::<Implicit, Counter, Counter>(
            METHOD,
            RESPONSE,
            vec![],
        )],
    )
    .unwrap();
    let (cancel, _) = RecoveryCancellation::test_host();
    let started = std::sync::atomic::AtomicBool::new(false);
    let admitted = || AdmittedWriterTask {
        store: &store,
        task: &task,
        method: METHOD,
        response_type: RESPONSE,
        started: &started,
        cancel: &cancel,
        tasks: &owner,
    };
    let failure = admitted()
        .execute_outcome::<Implicit, Counter, Counter, _>(|state, _| {
            Box::pin(async move {
                state.value = 99;
                Err(TaskHandlerError::Failed(Status::invalid_argument(
                    "private handler failure",
                )))
            })
        })
        .await
        .unwrap();
    assert!(matches!(
        failure.outcome,
        WriterTaskOutcome::PreStoreFailure(_)
    ));
    assert!(!started.load(std::sync::atomic::Ordering::Acquire));
    assert!(database.store_requests().is_empty());
    assert!(
        store
            .load_for_declaration::<Implicit>(&reference)
            .await
            .unwrap()
            .is_none()
    );
    let success = admitted()
        .execute_outcome::<Implicit, Counter, Counter, _>(|state, request| {
            Box::pin(async move {
                assert_eq!(state.value, 0);
                state.value += request.value;
                Ok(*state)
            })
        })
        .await
        .unwrap();
    let WriterTaskOutcome::Terminal(db::task::ResponseOrError::Response(payload)) = success.outcome
    else {
        panic!("missing terminal");
    };
    assert_eq!(Counter::decode(payload.value.as_slice()).unwrap().value, 5);
    let writes = database.store_requests();
    assert_eq!(writes.len(), 1);
    assert!(writes[0].sync);
    assert_eq!(writes[0].actor_upserts.len(), 1);
    assert!(writes[0].idempotent_mutation.is_some());
    assert!(writes[0].task_upserts.is_empty());
    assert_eq!(
        store
            .load_for_declaration::<Implicit>(&reference)
            .await
            .unwrap()
            .unwrap()
            .value,
        5
    );
    let replay = admitted()
        .execute_outcome::<Implicit, Counter, Counter, _>(|_, _| {
            Box::pin(async { panic!("replay must not invoke handler") })
        })
        .await
        .unwrap();
    assert!(matches!(replay.outcome, WriterTaskOutcome::Terminal(_)));
    assert_eq!(database.store_requests().len(), 1);
    // A declaration substitution must not relax constructor-required admission.
    assert!(
        admitted()
            .execute_outcome::<Explicit, Counter, Counter, _>(|_, _| Box::pin(async {
                panic!("wrong declaration must not execute")
            }))
            .await
            .is_err()
    );
    let explicit_reference =
        crate::state_ref::StateRef::from_id(Explicit::STATE_TYPE, "constructor-required-task")
            .unwrap()
            .to_string();
    let mut explicit_task = task.clone();
    explicit_task.task_id.as_mut().unwrap().state_ref = explicit_reference.clone();
    let explicit_owner = OneShotTasks::new_with_declarations(
        store.clone(),
        Explicit::STATE_TYPE.into(),
        explicit_reference.clone(),
        Unused,
        vec![TaskMethodDeclaration::new::<Explicit, Counter, Counter>(
            METHOD,
            RESPONSE,
            vec![],
        )],
    )
    .unwrap();
    let explicit_admitted = AdmittedWriterTask {
        store: &store,
        task: &explicit_task,
        method: METHOD,
        response_type: RESPONSE,
        started: &started,
        cancel: &cancel,
        tasks: &explicit_owner,
    };
    let error = explicit_admitted
        .execute_outcome::<Explicit, Counter, Counter, _>(|_, _| {
            Box::pin(async { panic!("absent constructor-required actor must not execute") })
        })
        .await
        .err()
        .unwrap();
    assert_eq!(error.code(), tonic::Code::FailedPrecondition);
    assert!(
        store
            .load_for_declaration::<Explicit>(&explicit_reference)
            .await
            .unwrap()
            .is_none()
    );
    assert_eq!(database.store_requests().len(), 1);
    stop.send(()).unwrap();
    server.await.unwrap().unwrap();
}
