//! UNVERIFIED native admission draft. Requires a parent-owned fresh C++ Database
//! (not a mock) with the same RocksDB kept across the two host incarnations.
//! This proves admission/Wait only, not the sample's external-effects acceptance.
use prost::Message;
use reboot_rust_schema::{
    application_host::{ApplicationHost, ServingInitializeState},
    database_proto as db,
    legacy_placement::{LegacyApplicationId, PlanOnlyLegacyPlacement},
    one_shot_tasks::{
        OneShotTasks, ReaderTaskBinding, TaskMethodDeclaration, WorkflowContext, WorkflowReceipt,
    },
    runtime::{DatabaseActorStore, DurableStateDeclaration, StateAdmission},
    state_ref::StateRef,
};
use std::sync::{
    Arc,
    atomic::{AtomicUsize, Ordering},
};
use tonic::Status;
const METHOD: &str = "hello_legacy_grpc.v1.RebootGreeterMethods.Initialize";
const RESULT: &str = "type.googleapis.com/google.protobuf.Empty";
// Wire-identical source contract draft. Generated consumer proof belongs to the
// unchanged-schema plugin gate and parent's full generated Legacy fixture.
#[derive(Clone, PartialEq, Message)]
struct GreeterState {
    #[prost(int32, tag = "1")]
    num_greetings: i32,
}
#[derive(Clone, PartialEq, Message)]
struct Empty {}
struct Greeter;
impl DurableStateDeclaration for Greeter {
    type State = GreeterState;
    const STATE_TYPE: &'static str = "hello_legacy_grpc.v1.RebootGreeter";
    const TASK_STATE_ADMISSION: StateAdmission = StateAdmission::DefaultOnAbsent;
}
struct Binding(Arc<AtomicUsize>);
#[tonic::async_trait]
impl ReaderTaskBinding for Binding {
    fn validate(&self, task: &db::Task) -> Result<(), Status> {
        if task.method != "Initialize" {
            return Err(Status::invalid_argument("not Initialize"));
        }
        Empty::decode(task.request.as_slice()).map_err(|_| Status::data_loss("bad Empty"))?;
        Ok(())
    }
    async fn execute(&self, _: &db::Task) -> Result<prost_types::Any, Status> {
        Err(Status::permission_denied("private workflow dispatch only"))
    }
    fn writer_capable(&self) -> bool {
        true
    }
    fn validate_response(
        &self,
        task: &db::Task,
        response: &prost_types::Any,
    ) -> Result<(), Status> {
        self.validate(task)?;
        if response.type_url != RESULT {
            return Err(Status::data_loss("wrong result type"));
        }
        Empty::decode(response.value.as_slice())
            .map_err(|_| Status::data_loss("bad Empty result"))?;
        Ok(())
    }
    async fn execute_workflow(
        &self,
        context: WorkflowContext<'_>,
    ) -> Result<WorkflowReceipt, Status> {
        self.0.fetch_add(1, Ordering::SeqCst);
        context
            .finish::<Greeter, Empty, Empty>(RESULT, Empty {})
            .await
    }
}
async fn incarnation(endpoint: &str, shard: &str, entries: Arc<AtomicUsize>) -> db::TaskId {
    let store = DatabaseActorStore::connect_lazy(endpoint).unwrap();
    let reference = StateRef::from_id(Greeter::STATE_TYPE, "my-greeter")
        .unwrap()
        .to_string();
    let tasks = OneShotTasks::new_with_declarations(
        store,
        Greeter::STATE_TYPE.into(),
        reference,
        Binding(entries),
        vec![
            TaskMethodDeclaration::new::<Greeter, Empty, Empty>(METHOD, RESULT, vec![]).workflow(),
        ],
    )
    .unwrap();
    let request = db::RecoverRequest {
        shard_ids: vec![shard.into()],
        state_tags_by_state_type: [(Greeter::STATE_TYPE.into(), "RebootGreeter".into())].into(),
        ..Default::default()
    };
    let (observed, mut observation) = tokio::sync::mpsc::channel(1);
    let host = ApplicationHost::new("legacy-native-initializer")
        .with_host_recovery(tasks.recovery(request))
        .with_serving_initializer("initialize-my-greeter-v1", tasks.clone(), move |context| {
            let observed = observed.clone();
            async move {
                let id = context
                    .spawn_workflow::<Greeter, Empty, Empty>(METHOD, RESULT, &Empty {})
                    .await?;
                let _: Empty = context.wait_workflow(&id, METHOD, RESULT).await?;
                observed
                    .send(id)
                    .await
                    .map_err(|_| Status::cancelled("observer closed"))?;
                Ok(())
            }
        })
        .unwrap();
    let mut startup = host.serving_initialize_state();
    let service = tasks.wait_service(
        LegacyApplicationId::new("legacy-native-initializer").unwrap(),
        "local",
        PlanOnlyLegacyPlacement::new(),
    );
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let (stop, stopped) = tokio::sync::oneshot::channel();
    let serving = tokio::spawn(
        host.add_public_service(service)
            .serve_with_listener_shutdown(listener, async {
                let _ = stopped.await;
            }),
    );
    let id = tokio::time::timeout(std::time::Duration::from_secs(10), observation.recv())
        .await
        .unwrap()
        .unwrap();
    tokio::time::timeout(std::time::Duration::from_secs(2), async {
        while *startup.borrow_and_update() != ServingInitializeState::Succeeded {
            startup.changed().await.unwrap();
        }
    })
    .await
    .unwrap();
    stop.send(()).unwrap();
    serving.await.unwrap().unwrap();
    id
}
#[tokio::test]
#[ignore = "parent must provide a fresh owned native Database/RocksDB endpoint and exact shard"]
async fn native_completed_initialize_rebuild_reuses_task_and_typed_empty_without_body_reentry() {
    let endpoint = std::env::var("RBT_RUST_INITIALIZER_DATABASE_URL")
        .expect("native Database URL is required");
    let shard =
        std::env::var("RBT_RUST_INITIALIZER_SHARD").expect("exact native shard is required");
    let entries = Arc::new(AtomicUsize::new(0));
    let first = incarnation(&endpoint, &shard, entries.clone()).await;
    assert_eq!(entries.load(Ordering::SeqCst), 1);
    let second = incarnation(&endpoint, &shard, entries.clone()).await;
    assert_eq!(second, first);
    assert_eq!(entries.load(Ordering::SeqCst), 1);
}
