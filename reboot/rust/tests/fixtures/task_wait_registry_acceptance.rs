// Multi-actor read-serving proof with independent sidecars/recovery owners.
// Seeded pending records exercise actual generated reader dispatch; this is not
// a shared-shard multi-actor transaction scheduling or migration acceptance.
#[test]
#[ignore = "requires REBOOT_NATIVE2PC_CXX_DATABASE real C++ Database/RocksDB"]
fn generated_reader_task_wait_registry_routes_two_independent_actors() {
    run_task_wait_registry(false);
}
#[test]
#[ignore = "requires REBOOT_NATIVE2PC_CXX_DATABASE real C++ Database/RocksDB"]
fn generated_reader_task_wait_registry_routes_heterogeneous_same_ref_and_uuid() {
    run_task_wait_registry(true);
}
#[derive(Clone, PartialEq, prost::Message)]
struct TaskGaugeResponse {
    #[prost(string, tag = "1")]
    reading: String,
}
fn registry_result(response: database::WaitResponse, id: &database::TaskId) -> String {
    match response.response_or_error.unwrap().response_or_error.unwrap() {
        database::task_response_or_error::ResponseOrError::Response(response) => {
            if id.state_type == "tests.reboot.protoc.RegistryGauge" {
                assert_eq!(response.type_url, "type.googleapis.com/tests.reboot.protoc.RegistryGaugeValue");
                TaskGaugeResponse::decode(response.value.as_slice()).unwrap().reading
            } else {
                assert_eq!(response.type_url, "type.googleapis.com/tests.reboot.protoc.TransactionCounterValue");
                TaskQueryResponse::decode(response.value.as_slice()).unwrap().value.to_string()
            }
        },
        other => panic!("unexpected task result: {other:?}"),
    }
}
fn run_task_wait_registry(heterogeneous: bool) {
    let fixture = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("tests/fixtures/generated_cxx_database_process");
    assert!(Command::new("cargo").args(["build", "--locked"]).current_dir(&fixture).status().unwrap().success());
    let binary = generated_host_binary(&fixture);
    let mut db = CxxDatabase::start(std::env::var("REBOOT_NATIVE2PC_CXX_DATABASE").unwrap());
    let mut second_db = CxxDatabase::start(std::env::var("REBOOT_NATIVE2PC_CXX_DATABASE").unwrap());
    let runtime = tokio::runtime::Runtime::new().unwrap();
    let uuid = Uuid::new_v4();
    let make_task = |state_type: &str, actor: &str| database::Task {
        task_id: Some(database::TaskId {
            state_type: state_type.into(),
            state_ref: actor.into(), task_uuid: uuid.as_bytes().to_vec(),
        }),
        method: "Query".into(), status: database::task::Status::Pending as i32,
        request: TaskQueryRequest { amount: 9000 }.encode_to_vec(),
        ..Default::default()
    };
    let first = make_task("tests.reboot.protoc.TransactionCounter", "root");
    let second = if heterogeneous { make_task("tests.reboot.protoc.RegistryGauge", "root") }
        else { make_task("tests.reboot.protoc.TransactionCounter", "second") };
    runtime.block_on(async {
        for (endpoint, actor, value, task) in [
            (db.endpoint(), "root", 12, first.clone()),
            (second_db.endpoint(), if heterogeneous { "root" } else { "second" }, 42, second.clone()),
        ] {
            database::database_client::DatabaseClient::connect(endpoint).await.unwrap()
                .store(database::StoreRequest {
                    actor_upserts: vec![database::Actor {
                        state_type: task.task_id.as_ref().unwrap().state_type.clone(), state_ref: actor.into(),
                        state: Some(TaskQueryResponse { value }.encode_to_vec()),
                    }], task_upserts: vec![task], sync: true, ..Default::default()
                }).await.unwrap();
        }
    });
    let listen = port();
    let plan = placement_proto::ListenForPlanResponse::decode(URL_SAFE_NO_PAD.decode(legacy_plan_for(&[("root", listen)])).unwrap().as_slice()).unwrap();
    let planner = LivePlannerServer::start(&runtime, plan.clone());
    let markers = tempfile::tempdir().unwrap();
    let marker = markers.path().join("first");
    let second_marker = markers.path().join("second");
    let ack = markers.path().join("unused-ack");
    let first_endpoint = db.endpoint();
    let second_endpoint = second_db.endpoint();
    let start_host = || WaitHostGuard(task_host_command(TaskHostOptions {
        binary: &binary, database: &first_endpoint, planner: &planner.endpoint,
        port: listen, marker: &marker, ack: &ack, invoke: false,
        block: false, recover: true, vector: None,
    }).args([if heterogeneous { "--gauge-task-database" } else { "--second-task-database" }, &second_endpoint,
        "--second-task-marker", second_marker.to_str().unwrap()]).spawn().unwrap());
    let mut host = start_host();
    await_marker(&marker, &mut host);
    await_marker(&second_marker, &mut host);
    let ids = [first.task_id.clone().unwrap(), second.task_id.clone().unwrap()];
    let completions = runtime.block_on(async {
        let channel = tonic::transport::Endpoint::from_shared(format!("http://127.0.0.1:{listen}")).unwrap().connect_lazy();
        let mut client = database::tasks_client::TasksClient::new(channel);
        let mut completions = Vec::new();
        for (id, endpoint, expected) in [(ids[0].clone(), db.endpoint(), "12"), (ids[1].clone(), second_db.endpoint(), if heterogeneous { "gauge:42" } else { "42" })] {
            let mut request = tonic::Request::new(database::WaitRequest { task_id: Some(id.clone()) });
            request.metadata_mut().insert("x-reboot-state-ref", id.state_ref.parse().unwrap());
            request.set_timeout(Duration::from_secs(5));
            let response = client.wait(request).await.unwrap().into_inner();
            assert_eq!(registry_result(response, &id), expected);
            let task = load_task(&endpoint, id).await;
            assert_eq!(task.status, database::task::Status::Completed as i32);
            completions.push(task);
        }
        // Unknown actor and wrong type must not fall back to any registered owner.
        for (state_type, state_ref) in [(ids[0].state_type.clone(), "unknown"), ("example.Wrong".into(), "second")] {
            let id = database::TaskId { state_type, state_ref: state_ref.into(), task_uuid: uuid.as_bytes().to_vec() };
            let mut request = tonic::Request::new(database::WaitRequest { task_id: Some(id) });
            request.metadata_mut().insert("x-reboot-state-ref", state_ref.parse().unwrap());
            assert_eq!(client.wait(request).await.unwrap_err().code(), tonic::Code::InvalidArgument);
        }
        completions
    });
    host.kill().unwrap(); host.wait().unwrap();
    db.restart();
    second_db.restart();
    let mut host = start_host();
    runtime.block_on(async {
        let channel = tonic::transport::Endpoint::from_shared(format!("http://127.0.0.1:{listen}")).unwrap().connect_lazy();
        let mut client = database::tasks_client::TasksClient::new(channel);
        for id in &ids {
            tokio::time::timeout(Duration::from_secs(5), async {
                loop {
                    let mut request = tonic::Request::new(database::WaitRequest { task_id: Some(id.clone()) });
                    request.metadata_mut().insert("x-reboot-state-ref", id.state_ref.parse().unwrap());
                    request.set_timeout(Duration::from_secs(1));
                    match client.wait(request).await {
                        Ok(response) => {
                            let expected = if id == &ids[0] { "12" }
                                else if heterogeneous { "gauge:42" } else { "42" };
                            assert_eq!(registry_result(response.into_inner(), id), expected);
                            break;
                        },
                        Err(error) if error.code() == tonic::Code::Unavailable => tokio::time::sleep(Duration::from_millis(10)).await,
                        Err(error) => panic!("registry restart failed: {error}"),
                    }
                }
            }).await.unwrap();
        }
        assert_eq!(load_task(&db.endpoint(), ids[0].clone()).await, completions[0]);
        assert_eq!(load_task(&second_db.endpoint(), ids[1].clone()).await, completions[1]);
    });
    for path in [&marker, &second_marker] {
        assert_eq!(std::fs::read(path.with_extension("invocations")).unwrap(), b"query\n", "registry recovery/retrieval replayed handler");
    }
    host.kill().unwrap(); host.wait().unwrap();
    planner.stop();
}
