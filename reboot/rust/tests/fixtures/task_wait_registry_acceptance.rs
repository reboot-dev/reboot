// Multi-actor read-serving proof with independent sidecars/recovery owners.
// Seeded pending records exercise actual generated reader dispatch; this is not
// a shared-shard multi-actor transaction scheduling or migration acceptance.
#[test]
#[ignore = "requires REBOOT_NATIVE2PC_CXX_DATABASE real C++ Database/RocksDB"]
fn generated_reader_task_wait_registry_routes_two_independent_actors() {
    let fixture = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("tests/fixtures/generated_cxx_database_process");
    assert!(Command::new("cargo").args(["build", "--locked"]).current_dir(&fixture).status().unwrap().success());
    let binary = generated_host_binary(&fixture);
    let db = CxxDatabase::start(std::env::var("REBOOT_NATIVE2PC_CXX_DATABASE").unwrap());
    let second_db = CxxDatabase::start(std::env::var("REBOOT_NATIVE2PC_CXX_DATABASE").unwrap());
    let runtime = tokio::runtime::Runtime::new().unwrap();
    let uuid = Uuid::new_v4();
    let make_task = |actor: &str| database::Task {
        task_id: Some(database::TaskId {
            state_type: "tests.reboot.protoc.TransactionCounter".into(),
            state_ref: actor.into(), task_uuid: uuid.as_bytes().to_vec(),
        }),
        method: "Query".into(), status: database::task::Status::Pending as i32,
        request: TaskQueryRequest { amount: 9000 }.encode_to_vec(),
        ..Default::default()
    };
    let first = make_task("root");
    let second = make_task("second");
    runtime.block_on(async {
        for (endpoint, actor, value, task) in [
            (db.endpoint(), "root", 12, first.clone()),
            (second_db.endpoint(), "second", 42, second.clone()),
        ] {
            store_counter(&endpoint, actor, value).await;
            database::database_client::DatabaseClient::connect(endpoint).await.unwrap()
                .store(database::StoreRequest { task_upserts: vec![task], sync: true, ..Default::default() }).await.unwrap();
        }
    });
    let listen = port();
    let plan = placement_proto::ListenForPlanResponse::decode(URL_SAFE_NO_PAD.decode(legacy_plan_for(&[("root", listen)])).unwrap().as_slice()).unwrap();
    let planner = LivePlannerServer::start(&runtime, plan.clone());
    let markers = tempfile::tempdir().unwrap();
    let marker = markers.path().join("first");
    let second_marker = markers.path().join("second");
    let ack = markers.path().join("unused-ack");
    let start_host = || WaitHostGuard(task_host_command(TaskHostOptions {
        binary: &binary, database: &db.endpoint(), planner: &planner.endpoint,
        port: listen, marker: &marker, ack: &ack, invoke: false,
        block: false, recover: true, vector: None,
    }).args(["--second-task-database", &second_db.endpoint(),
        "--second-task-marker", second_marker.to_str().unwrap()]).spawn().unwrap());
    let mut host = start_host();
    await_marker(&marker, &mut host);
    await_marker(&second_marker, &mut host);
    let ids = [first.task_id.clone().unwrap(), second.task_id.clone().unwrap()];
    let completions = runtime.block_on(async {
        let channel = tonic::transport::Endpoint::from_shared(format!("http://127.0.0.1:{listen}")).unwrap().connect_lazy();
        let mut client = database::tasks_client::TasksClient::new(channel);
        let mut completions = Vec::new();
        for (id, endpoint, expected) in [(ids[0].clone(), db.endpoint(), 12), (ids[1].clone(), second_db.endpoint(), 42)] {
            let mut request = tonic::Request::new(database::WaitRequest { task_id: Some(id.clone()) });
            request.metadata_mut().insert("x-reboot-state-ref", id.state_ref.parse().unwrap());
            request.set_timeout(Duration::from_secs(5));
            let response = client.wait(request).await.unwrap().into_inner();
            match response.response_or_error.unwrap().response_or_error.unwrap() {
                database::task_response_or_error::ResponseOrError::Response(response) => assert_eq!(TaskQueryResponse::decode(response.value.as_slice()).unwrap().value, expected),
                other => panic!("unexpected task result: {other:?}"),
            }
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
                        Ok(_) => break,
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
