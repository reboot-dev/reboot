use super::*;

#[test]
#[ignore = "requires REBOOT_NATIVE2PC_CXX_DATABASE real C++ Database/RocksDB"]
fn generated_reader_task_recovery_rejects_entire_malformed_batch_before_dispatch() {
    let fixture = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("tests/fixtures/generated_cxx_database_process");
    assert!(
        Command::new("cargo")
            .args(["build", "--locked"])
            .current_dir(&fixture)
            .status()
            .unwrap()
            .success()
    );
    let target = std::env::var_os("CARGO_TARGET_DIR")
        .map(std::path::PathBuf::from)
        .unwrap_or_else(|| fixture.join("target"));
    let binary = target.join("debug/generated-cxx-database-process-host");
    let mut db = CxxDatabase::start(std::env::var("REBOOT_NATIVE2PC_CXX_DATABASE").unwrap());
    let runtime = tokio::runtime::Runtime::new().unwrap();
    runtime.block_on(store_counter(&db.endpoint(), "root", 5));
    let tasks: Vec<database::Task> = ["Query", "UnknownReader"]
        .into_iter()
        .map(|method| {
            database::Task {
                task_id: Some(database::TaskId {
                    state_type: "tests.reboot.protoc.TransactionCounter".into(),
                    state_ref: "root".into(),
                    task_uuid: Uuid::new_v4().as_bytes().to_vec(),
                }),
                method: method.into(),
                status: database::task::Status::Pending as i32,
                // The known Query's empty protobuf request is valid.
                request: vec![],
                timestamp: None,
                iteration: 0,
                response_or_error: None,
            }
        })
        .collect();
    runtime.block_on(async {
        let mut client = database::database_client::DatabaseClient::connect(db.endpoint())
            .await
            .unwrap();
        client
            .store(database::StoreRequest {
                task_upserts: tasks.clone(),
                sync: true,
                ..Default::default()
            })
            .await
            .unwrap();
    });
    db.restart();
    let listen = port();
    let plan = placement_proto::ListenForPlanResponse::decode(
        URL_SAFE_NO_PAD
            .decode(legacy_plan_for(&[("root", listen)]))
            .unwrap()
            .as_slice(),
    )
    .unwrap();
    let planner = LivePlannerServer::start(&runtime, plan);
    let markers = tempfile::tempdir().unwrap();
    let marker = markers.path().join("must-not-dispatch-valid-task");
    let ack = markers.path().join("unused-root-ack");
    let mut host = Command::new(binary)
        .args([
            "--role",
            "tasks",
            "--database",
            &db.endpoint(),
            "--listen",
            &format!("127.0.0.1:{listen}"),
            "--placement-planner",
            &planner.endpoint,
            "--root-id",
            &Uuid::new_v4().to_string(),
            "--state-ref",
            "root",
            "--coordinator-state-ref",
            "root",
            "--task-marker",
            marker.to_str().unwrap(),
            "--invoke-marker",
            ack.to_str().unwrap(),
            "--amount",
            "7",
            "--recover",
        ])
        .stdout(Stdio::inherit())
        .stderr(Stdio::inherit())
        .spawn()
        .unwrap();
    let mut exit = None;
    for _ in 0..200 {
        exit = host.try_wait().unwrap();
        if exit.is_some() {
            break;
        }
        std::thread::sleep(Duration::from_millis(25));
    }
    if exit.is_none() {
        let _ = host.kill();
        let _ = host.wait();
        panic!("host did not reject malformed recovered batch within five seconds");
    }
    assert!(
        !exit.unwrap().success(),
        "unsupported recovery must fail startup"
    );
    assert!(
        !marker.exists(),
        "valid task ran before whole batch validation"
    );
    assert_eq!(
        runtime.block_on(load_state(&db.endpoint(), "root")),
        Some(vec![0x08, 5])
    );
    db.restart();
    runtime.block_on(async {
        let loaded = database::database_client::DatabaseClient::connect(db.endpoint())
            .await
            .unwrap()
            .load(database::LoadRequest {
                actors: vec![],
                task_ids: tasks
                    .iter()
                    .map(|task| task.task_id.clone().unwrap())
                    .collect(),
            })
            .await
            .unwrap()
            .into_inner()
            .tasks;
        assert_eq!(loaded.len(), tasks.len());
        for task in tasks {
            assert!(
                loaded.contains(&task),
                "rejected pending task changed across restart"
            );
        }
    });
}
