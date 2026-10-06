// Multi-actor read-serving/recovery proof over independent or shared sidecars.
// Seeded pending records exercise actual generated reader dispatch; this is not
// a multi-actor transaction scheduling or migration acceptance.
#[test]
#[ignore = "requires REBOOT_NATIVE2PC_CXX_DATABASE real C++ Database/RocksDB"]
fn generated_reader_task_wait_registry_routes_two_independent_actors() {
    run_task_wait_registry(false, false, None, false);
}
#[test]
#[ignore = "requires REBOOT_NATIVE2PC_CXX_DATABASE real C++ Database/RocksDB"]
fn generated_reader_task_wait_registry_routes_heterogeneous_same_ref_and_uuid() {
    run_task_wait_registry(true, false, None, false);
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
#[test]
#[ignore = "requires REBOOT_NATIVE2PC_CXX_DATABASE real C++ Database/RocksDB"]
fn generated_reader_task_wait_registry_recovers_shared_shard_actors() {
    run_task_wait_registry(false, true, None, false);
}
#[test]
#[ignore = "requires REBOOT_NATIVE2PC_CXX_DATABASE real C++ Database/RocksDB"]
fn generated_reader_task_wait_registry_recovers_shared_shard_heterogeneous() {
    run_task_wait_registry(true, true, None, false);
}
#[test]
#[ignore = "requires REBOOT_NATIVE2PC_CXX_DATABASE real C++ Database/RocksDB"]
fn generated_reader_task_shared_registry_rejects_unknown_owner_before_any_dispatch() {
    run_task_wait_registry(true, true, Some(false), false);
}
#[test]
#[ignore = "requires REBOOT_NATIVE2PC_CXX_DATABASE real C++ Database/RocksDB"]
fn generated_reader_task_shared_registry_rejects_malformed_binding_before_any_dispatch() {
    run_task_wait_registry(true, true, Some(true), false);
}
#[test]
#[ignore = "requires REBOOT_NATIVE2PC_CXX_DATABASE real C++ Database/RocksDB"]
fn generated_reader_task_registry_reuses_owner_after_singleton_host_shutdown() {
    run_task_wait_registry(true, true, None, true);
}
fn run_task_wait_registry(heterogeneous: bool, shared: bool, reject: Option<bool>, transition: bool) {
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
            (if shared { db.endpoint() } else { second_db.endpoint() }, if heterogeneous { "root" } else { "second" }, 42, second.clone()),
        ] {
            if transition && task.task_id.as_ref().unwrap().state_type == "tests.reboot.protoc.RegistryGauge" { continue; }
            database::database_client::DatabaseClient::connect(endpoint).await.unwrap()
                .store(database::StoreRequest {
                    actor_upserts: vec![database::Actor {
                        state_type: task.task_id.as_ref().unwrap().state_type.clone(), state_ref: actor.into(),
                        state: Some(TaskQueryResponse { value }.encode_to_vec()),
                    }], task_upserts: vec![task], sync: true, ..Default::default()
                }).await.unwrap();
        }
    });
    let rejected = reject.map(|malformed| {
        let mut task = make_task(if malformed { "tests.reboot.protoc.RegistryGauge" } else { "example.Unregistered" }, "root");
        task.task_id.as_mut().unwrap().task_uuid = Uuid::new_v4().as_bytes().to_vec();
        if malformed { task.method = "UnknownReader".into(); }
        runtime.block_on(async {
            database::database_client::DatabaseClient::connect(db.endpoint()).await.unwrap()
                .store(database::StoreRequest { task_upserts: vec![task.clone()], sync: true, ..Default::default() }).await.unwrap();
        });
        db.restart();
        task
    });
    let listen = port();
    let plan = placement_proto::ListenForPlanResponse::decode(URL_SAFE_NO_PAD.decode(legacy_plan_for(&[("root", listen)])).unwrap().as_slice()).unwrap();
    let planner = LivePlannerServer::start(&runtime, plan.clone());
    let markers = tempfile::tempdir().unwrap();
    let marker = markers.path().join("first");
    let second_marker = markers.path().join("second");
    let ack = markers.path().join("unused-ack");
    let wait_marker = |path: &std::path::Path, host: &mut Child| {
        for _ in 0..200 {
            if path.exists() { return; }
            if let Some(exit) = host.try_wait().unwrap() {
                panic!("registry host exited {exit} before {}: {}", path.display(),
                    std::fs::read_to_string(markers.path().join("stderr")).unwrap());
            }
            std::thread::sleep(Duration::from_millis(25));
        }
        panic!("registry marker {} absent within five seconds: {}", path.display(),
            std::fs::read_to_string(markers.path().join("stderr")).unwrap());
    };
    let first_endpoint = db.endpoint();
    let second_endpoint = if shared { db.endpoint() } else { second_db.endpoint() };
    let start_host = || {
    let mut command = task_host_command(TaskHostOptions {
        binary: &binary, database: &first_endpoint, planner: &planner.endpoint,
        port: listen, marker: &marker, ack: &ack, invoke: false,
        block: false, recover: true, vector: None,
    });
    command.args([if heterogeneous { "--gauge-task-database" } else { "--second-task-database" }, &second_endpoint,
        "--second-task-marker", second_marker.to_str().unwrap()]);
    if shared {
        command.arg("--shared-task-recovery");
        if reject.is_none() { command.args(["--invoke", "--expect-task-error", "--task-vector", "no-owner"]); }
    }
    if transition { command.args(["--transition-task-uuid", &uuid.to_string()]); }
    command.stderr(Stdio::from(std::fs::File::create(markers.path().join("stderr")).unwrap()));
    WaitHostGuard(command.spawn().unwrap())
    };
    let mut host = start_host();
    if transition {
        wait_marker(&ack.with_extension("singleton-stopped"), &mut host);
        runtime.block_on(async {
            database::database_client::DatabaseClient::connect(db.endpoint()).await.unwrap()
                .store(database::StoreRequest {
                    actor_upserts: vec![database::Actor { state_type: second.task_id.as_ref().unwrap().state_type.clone(), state_ref: "root".into(), state: Some(TaskQueryResponse { value: 42 }.encode_to_vec()) }],
                    task_upserts: vec![second.clone()], sync: true, ..Default::default()
                }).await.unwrap();
        });
        std::fs::write(ack.with_extension("shared-release"), "foreign task persisted after singleton joined").unwrap();
    }
    if let Some(rejected) = rejected {
        let exit = (0..200).find_map(|_| {
            let exit = host.try_wait().unwrap();
            if exit.is_none() { std::thread::sleep(Duration::from_millis(25)); }
            exit
        }).expect("shared recovery did not reject within five seconds");
        assert!(!exit.success());
        let stderr = std::fs::read_to_string(markers.path().join("stderr")).unwrap();
        let diagnostic = if reject == Some(true) { "unknown or unsupported reader task method" } else { "unregistered actor in shared task recovery" };
        assert!(stderr.contains(diagnostic), "wrong rejection: {stderr}");
        for path in [&marker, &second_marker] {
            assert!(!path.exists());
            assert!(!path.with_extension("invocations").exists(), "shared registry dispatched before validating all owners");
        }
        db.restart();
        runtime.block_on(async {
            for task in [&first, &second, &rejected] {
                assert_eq!(load_task(&db.endpoint(), task.task_id.clone().unwrap()).await, *task);
            }
        });
        planner.stop();
        return;
    }
    wait_marker(&marker, &mut host);
    wait_marker(&second_marker, &mut host);
    if shared {
        wait_marker(&ack, &mut host);
        assert_eq!(runtime.block_on(load_state(&db.endpoint(), "root")), Some(vec![0x08, 12]), "shared registry accidentally enabled scheduling mutation");
    }
    let ids = [first.task_id.clone().unwrap(), second.task_id.clone().unwrap()];
    let completions = runtime.block_on(async {
        let channel = tonic::transport::Endpoint::from_shared(format!("http://127.0.0.1:{listen}")).unwrap().connect_lazy();
        let mut client = database::tasks_client::TasksClient::new(channel);
        let mut completions = Vec::new();
        for (id, endpoint, expected) in [(ids[0].clone(), db.endpoint(), "12"), (ids[1].clone(), second_endpoint.clone(), if heterogeneous { "gauge:42" } else { "42" })] {
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
        for (state_type, state_ref) in [(ids[0].state_type.clone(), "unknown"), ("example.Wrong".into(), ids[1].state_ref.as_str())] {
            let id = database::TaskId { state_type, state_ref: state_ref.into(), task_uuid: uuid.as_bytes().to_vec() };
            let mut request = tonic::Request::new(database::WaitRequest { task_id: Some(id) });
            request.metadata_mut().insert("x-reboot-state-ref", state_ref.parse().unwrap());
            assert_eq!(client.wait(request).await.unwrap_err().code(), tonic::Code::InvalidArgument);
        }
        completions
    });
    host.kill().unwrap(); host.wait().unwrap();
    if shared { std::fs::remove_file(&ack).unwrap(); }
    if transition {
        std::fs::remove_file(ack.with_extension("singleton-stopped")).unwrap();
        std::fs::remove_file(ack.with_extension("shared-release")).unwrap();
    }
    db.restart();
    second_db.restart();
    let mut host = start_host();
    if transition {
        wait_marker(&ack.with_extension("singleton-stopped"), &mut host);
        std::fs::write(ack.with_extension("shared-release"), "retain completed records after restart").unwrap();
    }
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
        assert_eq!(load_task(&second_endpoint, ids[1].clone()).await, completions[1]);
    });
    if shared {
        wait_marker(&ack, &mut host);
        assert_eq!(runtime.block_on(load_state(&db.endpoint(), "root")), Some(vec![0x08, 12]));
    }
    for path in [&marker, &second_marker] {
        assert_eq!(std::fs::read(path.with_extension("invocations")).unwrap(), b"query\n", "registry recovery/retrieval replayed handler");
    }
    host.kill().unwrap(); host.wait().unwrap();
    planner.stop();
}
