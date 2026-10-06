use super::*;

#[test]
#[ignore = "requires REBOOT_NATIVE2PC_CXX_DATABASE real C++ Database/RocksDB"]
fn generated_reader_task_recovery_rejects_entire_malformed_batch_before_dispatch() {
    prove_recovered_batch_boundary(None, None);
}

#[test]
#[ignore = "requires REBOOT_NATIVE2PC_CXX_DATABASE real C++ Database/RocksDB"]
fn generated_reader_task_recovery_accepts_1024_pending_tasks_without_loss() {
    prove_recovered_batch_boundary(Some(1024), None);
}

#[test]
#[ignore = "requires REBOOT_NATIVE2PC_CXX_DATABASE real C++ Database/RocksDB"]
fn generated_reader_task_recovery_rejects_1025_before_any_dispatch_without_loss() {
    prove_recovered_batch_boundary(Some(1025), None);
}

// A state-tag map filters actor/transaction recovery, NOT the shard's pending
// task stream. Both vectors must fail the single-owner startup before dispatch.
#[test]
#[ignore = "requires REBOOT_NATIVE2PC_CXX_DATABASE real C++ Database/RocksDB"]
fn generated_reader_task_recovery_rejects_shared_shard_foreign_ref_before_dispatch() {
    prove_recovered_batch_boundary(None, Some(false));
}
#[test]
#[ignore = "requires REBOOT_NATIVE2PC_CXX_DATABASE real C++ Database/RocksDB"]
fn generated_reader_task_recovery_rejects_shared_shard_foreign_type_before_dispatch() {
    prove_recovered_batch_boundary(None, Some(true));
}

fn prove_recovered_batch_boundary(capacity: Option<usize>, foreign_type: Option<bool>) {
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
    let binary = generated_host_binary(&fixture);
    let mut db = CxxDatabase::start(std::env::var("REBOOT_NATIVE2PC_CXX_DATABASE").unwrap());
    let runtime = tokio::runtime::Runtime::new().unwrap();
    runtime.block_on(store_counter(&db.endpoint(), "root", 5));
    let methods: Vec<&str> = capacity.map_or_else(
        || vec!["Query", "UnknownReader"],
        |count| vec!["Query"; count],
    );
    let mut tasks: Vec<database::Task> = methods
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
                // Enter the observable reader branch in every vector, including
                // malformed batches: an accidentally early valid delivery must
                // leave a marker instead of silently completing unnoticed.
                request: [0x08, 0xa8, 0x46].to_vec(), // TransactionIncrementRequest.amount = 9000
                timestamp: None,
                iteration: 0,
                response_or_error: None,
            }
        })
        .collect();
    if let Some(different_type) = foreign_type {
        tasks[1].method = "Query".into();
        let id = tasks[1].task_id.as_mut().unwrap();
        if different_type {
            id.state_type = "tests.reboot.protoc.RegistryGauge".into();
        } else {
            id.state_ref = "second".into();
        }
    }
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
    if foreign_type.is_some() {
        runtime.block_on(async {
            tokio::time::timeout(Duration::from_secs(5), async {
                let mut stream = database::database_client::DatabaseClient::connect(db.endpoint())
                    .await
                    .unwrap()
                    .recover(database::RecoverRequest {
                        shard_ids: vec!["s000000000".into()],
                        state_tags_by_state_type: [(
                            "tests.reboot.protoc.TransactionCounter".into(),
                            "TransactionCounter".into(),
                        )]
                        .into(),
                        skip_idempotent_mutations: true,
                    })
                    .await
                    .unwrap()
                    .into_inner();
                let mut recovered = Vec::new();
                while let Some(batch) = stream.message().await.unwrap() {
                    recovered.extend(batch.pending_tasks);
                }
                assert_eq!(
                    recovered.len(),
                    tasks.len(),
                    "state tags must not silently partition canonical task recovery"
                );
                for task in &tasks {
                    assert!(
                        recovered.contains(task),
                        "foreign task missing from canonical Recover"
                    );
                }
            })
            .await
            .expect("canonical Recover stream did not terminate within five seconds");
        });
    }
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
    let mut host = WaitHostGuard(
        Command::new(binary)
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
                "--block-task",
            ])
            .stdout(Stdio::inherit())
            .stderr(Stdio::from(
                std::fs::File::create(markers.path().join("host-stderr")).unwrap(),
            ))
            .spawn()
            .unwrap(),
    );
    let mut exit = None;
    for _ in 0..200 {
        exit = host.try_wait().unwrap();
        if exit.is_some() || (capacity == Some(1024) && marker.exists()) {
            break;
        }
        std::thread::sleep(Duration::from_millis(25));
    }
    if capacity == Some(1024) {
        // The real reader cannot begin until complete-batch validation and
        // public readiness pass. Crash it while the first handler is parked;
        // no result may be invented for any of the 1024 pending tasks.
        let accepted = marker.exists() && exit.is_none();
        let _ = host.kill();
        let _ = host.wait();
        assert!(accepted, "1024-task recovery did not admit the real reader");
        assert_eq!(std::fs::read_to_string(&marker).unwrap(), "5");
    } else {
        if exit.is_none() {
            let _ = host.kill();
            let _ = host.wait();
            panic!("host did not reject unsupported recovered batch within five seconds");
        }
        assert!(
            !exit.unwrap().success(),
            "unsupported recovery must fail startup"
        );
        assert!(!marker.exists(), "reader ran before whole batch validation");
        assert!(
            !marker.with_extension("invocations").exists(),
            "handler entered before whole-batch validation"
        );
        if foreign_type.is_some() {
            let stderr = std::fs::read_to_string(markers.path().join("host-stderr")).unwrap();
            assert!(
                stderr.contains("InvalidArgument")
                    && stderr.contains("task must name the registered local actor and a UUID"),
                "wrong startup rejection: {stderr}"
            );
        }
        if capacity == Some(1025) {
            let stderr = std::fs::read_to_string(markers.path().join("host-stderr")).unwrap();
            assert!(
                stderr.contains("ResourceExhausted")
                    && stderr.contains("durable pending task admission exceeds 1024"),
                "startup failed for the wrong reason: {stderr}",
            );
        }
    }
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
        for task in &tasks {
            assert!(
                loaded.contains(task),
                "rejected pending task changed across restart"
            );
        }
    });
    planner.stop();
}
