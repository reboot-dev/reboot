#[test]
#[ignore = "requires REBOOT_NATIVE2PC_CXX_DATABASE real C++ Database/RocksDB"]
fn generated_writer_task_staged_prepared_no_dispatch_and_at_deadline() {
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
    for vector in ["staged", "prepared", "at"] {
        let runtime = tokio::runtime::Runtime::new().unwrap();
        let mut db = CxxDatabase::start(std::env::var("REBOOT_NATIVE2PC_CXX_DATABASE").unwrap());
        let reference = reboot_rust_schema::state_ref::StateRef::from_id(
            CounterDeclaration::STATE_TYPE,
            vector,
        )
        .unwrap()
        .to_string();
        runtime.block_on(store_counter(&db.endpoint(), &reference, 5));
        let listen = port();
        let plan = placement_proto::ListenForPlanResponse::decode(
            URL_SAFE_NO_PAD
                .decode(legacy_plan_for(&[(&reference, listen)]))
                .unwrap()
                .as_slice(),
        )
        .unwrap();
        let planner = LivePlannerServer::start(&runtime, plan);
        let markers = tempfile::tempdir().unwrap();
        let handler = markers.path().join("handler");
        let ack = markers.path().join("ack");
        let boundary = markers.path().join("boundary");
        let mut command = writer_command(WriterHostOptions {
            binary: &binary,
            endpoint: &db.endpoint(),
            planner: &planner.endpoint,
            port: listen,
            reference: &reference,
            marker: &handler,
            ack: &ack,
        });
        command.arg("--invoke");
        let seconds = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs()
            + 3;
        match vector {
            "staged" => {
                command.env("REBOOT_TEST_WRITER_TASK_STAGED", &boundary);
            }
            "prepared" => {
                command.env("REBOOT_TEST_PAUSE_AFTER_COORDINATOR_PREPARE", &boundary);
            }
            "at" => {
                command.args(["--task-vector", &format!("delayed:{seconds}")]);
            }
            _ => unreachable!(),
        }
        let mut host = WaitHostGuard(command.spawn().unwrap());
        if vector == "at" {
            task_vertical_acceptance::await_marker(&ack, &mut host);
            let pending = runtime.block_on(task_vertical_acceptance::pending_tasks(&db.endpoint()));
            assert_eq!(pending.len(), 1);
            assert_eq!(
                pending[0].timestamp,
                Some(prost_types::Timestamp {
                    seconds: seconds as i64,
                    nanos: 0
                })
            );
            assert!(
                !handler.exists(),
                "future writer task must not execute at commit"
            );
            assert_eq!(
                runtime.block_on(load_state(&db.endpoint(), &reference)),
                Some(TaskCounter { value: 12 }.encode_to_vec())
            );
            task_vertical_acceptance::await_marker(&handler, &mut host);
            let started: u128 =
                std::fs::read_to_string(format!("{}.started-at", handler.display()))
                    .unwrap()
                    .parse()
                    .unwrap();
            assert!(
                started >= u128::from(seconds) * 1_000_000_000,
                "writer At executed before durable UTC deadline"
            );
            let id = pending[0].task_id.clone().unwrap();
            let start = std::time::Instant::now();
            loop {
                if runtime
                    .block_on(task_vertical_acceptance::load_task(
                        &db.endpoint(),
                        id.clone(),
                    ))
                    .status
                    == database::task::Status::Completed as i32
                {
                    break;
                }
                assert!(start.elapsed() < Duration::from_secs(5));
                std::thread::sleep(Duration::from_millis(10));
            }
            assert_eq!(
                runtime.block_on(load_state(&db.endpoint(), &reference)),
                Some(TaskCounter { value: 15 }.encode_to_vec())
            );
        } else {
            task_vertical_acceptance::await_marker(&boundary, &mut host);
            std::thread::sleep(Duration::from_millis(250)); // dispatcher rescan ran while actual root parked
            assert!(
                !handler.exists(),
                "writer dispatched before terminal root commit at {vector}"
            );
            assert!(!ack.exists());
            assert!(
                runtime
                    .block_on(task_vertical_acceptance::pending_tasks(&db.endpoint()))
                    .is_empty()
            );
            assert_eq!(
                runtime.block_on(load_state(&db.endpoint(), &reference)),
                Some(TaskCounter { value: 5 }.encode_to_vec())
            );
            let recovered = runtime.block_on(async {
                let mut stream = database::database_client::DatabaseClient::connect(db.endpoint())
                    .await
                    .unwrap()
                    .recover(database::RecoverRequest {
                        shard_ids: vec!["s000000000".into()],
                        skip_idempotent_mutations: true,
                        ..Default::default()
                    })
                    .await
                    .unwrap()
                    .into_inner();
                let mut participants = 0;
                let mut coordinators = 0;
                while let Some(batch) = stream.message().await.unwrap() {
                    participants += batch.participant_transactions.len();
                    coordinators += batch.transaction_coordinators.len();
                }
                (participants, coordinators)
            });
            assert_eq!(
                recovered,
                if vector == "prepared" { (1, 1) } else { (0, 0) },
                "barrier must represent actual staged/prepared lifecycle"
            );
        }
        host.kill().unwrap();
        host.wait().unwrap();
        drop(host);
        db.restart();
        if vector == "staged" {
            assert!(
                runtime
                    .block_on(task_vertical_acceptance::pending_tasks(&db.endpoint()))
                    .is_empty()
            );
            assert_eq!(
                runtime.block_on(load_state(&db.endpoint(), &reference)),
                Some(TaskCounter { value: 5 }.encode_to_vec())
            );
        }
    }
}

#[test]
#[ignore = "requires REBOOT_NATIVE2PC_CXX_DATABASE real C++ Database/RocksDB"]
fn generated_writer_task_negative_identity_schedule_and_inactive_owner_no_effects() {
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
    for vector in [
        "identity",
        "foreign-type",
        "uuid",
        "uuid-version",
        "uuid-variant",
        "schedule",
        "iteration",
        "malformed",
        "unknown",
        "inactive-owner",
        "no-owner",
    ] {
        let runtime = tokio::runtime::Runtime::new().unwrap();
        let mut db = CxxDatabase::start(std::env::var("REBOOT_NATIVE2PC_CXX_DATABASE").unwrap());
        let reference = reboot_rust_schema::state_ref::StateRef::from_id(
            CounterDeclaration::STATE_TYPE,
            vector,
        )
        .unwrap()
        .to_string();
        runtime.block_on(store_counter(&db.endpoint(), &reference, 5));
        let listen = port();
        let plan = placement_proto::ListenForPlanResponse::decode(
            URL_SAFE_NO_PAD
                .decode(legacy_plan_for(&[(&reference, listen)]))
                .unwrap()
                .as_slice(),
        )
        .unwrap();
        let planner = LivePlannerServer::start(&runtime, plan);
        let markers = tempfile::tempdir().unwrap();
        let handler = markers.path().join("handler");
        let ack = markers.path().join("ack");
        let mut command = writer_command(WriterHostOptions {
            binary: &binary,
            endpoint: &db.endpoint(),
            planner: &planner.endpoint,
            port: listen,
            reference: &reference,
            marker: &handler,
            ack: &ack,
        });
        command.args([
            "--invoke",
            "--expect-task-error",
            "--exit-after-invoke",
            "--task-vector",
            vector,
        ]);
        if vector == "inactive-owner" {
            command.arg("--inactive-task-owner");
        }
        if vector == "no-owner" {
            command.arg("--no-task-owner");
        }
        let mut host = WaitHostGuard(command.spawn().unwrap());
        task_vertical_acceptance::await_marker(&ack, &mut host);
        assert!(
            host.wait().unwrap().success(),
            "writer staging vector {vector}"
        );
        assert!(!handler.exists());
        assert!(
            runtime
                .block_on(task_vertical_acceptance::pending_tasks(&db.endpoint()))
                .is_empty()
        );
        db.restart();
        assert_eq!(
            runtime.block_on(load_state(&db.endpoint(), &reference)),
            Some(TaskCounter { value: 5 }.encode_to_vec())
        );
        assert!(
            runtime
                .block_on(task_vertical_acceptance::pending_tasks(&db.endpoint()))
                .is_empty()
        );
    }
}

#[test]
#[ignore = "requires REBOOT_NATIVE2PC_CXX_DATABASE real C++ Database/RocksDB"]
fn generated_writer_task_failed_ingress_before_exclusive_drop_real_host() {
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
    let runtime = tokio::runtime::Runtime::new().unwrap();
    let mut db = CxxDatabase::start(std::env::var("REBOOT_NATIVE2PC_CXX_DATABASE").unwrap());
    let reference = reboot_rust_schema::state_ref::StateRef::from_id(
        CounterDeclaration::STATE_TYPE,
        "fail-before-drop",
    )
    .unwrap()
    .to_string();
    runtime.block_on(store_counter(&db.endpoint(), &reference, 5));
    let listen = port();
    let plan = placement_proto::ListenForPlanResponse::decode(
        URL_SAFE_NO_PAD
            .decode(legacy_plan_for(&[(&reference, listen)]))
            .unwrap()
            .as_slice(),
    )
    .unwrap();
    let planner = LivePlannerServer::start(&runtime, plan);
    let markers = tempfile::tempdir().unwrap();
    let handler = markers.path().join("handler");
    let ack = markers.path().join("ack");
    let stored = markers.path().join("stored");
    let failed = markers.path().join("failed");
    let mut command = writer_command(WriterHostOptions {
        binary: &binary,
        endpoint: &db.endpoint(),
        planner: &planner.endpoint,
        port: listen,
        reference: &reference,
        marker: &handler,
        ack: &ack,
    });
    command
        .arg("--invoke")
        .env("REBOOT_TEST_WRITER_AFTER_STORE", &stored)
        .env("REBOOT_TEST_WRITER_LOST_STORE_ACK", "1")
        .env("REBOOT_TEST_WRITER_FAILURE_BEFORE_RELEASE", &failed);
    let mut host = WaitHostGuard(command.spawn().unwrap());
    task_vertical_acceptance::await_marker(&stored, &mut host);
    task_vertical_acceptance::await_marker(&ack, &mut host);
    let pending = runtime.block_on(task_vertical_acceptance::pending_tasks(&db.endpoint()));
    assert_eq!(pending.len(), 1);
    // Admit one ordinary writer into public ingress while task retains exclusive
    // admission. It must be revoked by synchronous Failed, not by lease release.
    let status = runtime.block_on(async {
        let channel = tonic::transport::Endpoint::from_shared(format!("http://127.0.0.1:{listen}"))
            .unwrap()
            .connect()
            .await
            .unwrap();
        let mut grpc = tonic::client::Grpc::new(channel);
        grpc.ready().await.unwrap();
        let mut request = tonic::Request::new(TaskCounter { value: 100 });
        let mut headers = reboot_rust_schema::RebootHeaders::new(&reference);
        headers.idempotency_key = Some(Uuid::new_v4());
        *request.metadata_mut() = headers.to_metadata().unwrap();
        request.set_timeout(Duration::from_secs(2));
        let competing = tokio::spawn(async move {
            let result: Result<tonic::Response<TaskCounter>, _> = grpc
                .unary(
                    request,
                    tonic::codegen::http::uri::PathAndQuery::from_static(
                        "/tests.reboot.protoc.TransactionCounterWritesMethods/Apply",
                    ),
                    tonic::codec::ProstCodec::default(),
                )
                .await;
            result.unwrap_err()
        });
        tokio::time::sleep(Duration::from_millis(100)).await;
        assert!(!std::path::Path::new(&format!("{}.ordinary-entered", handler.display())).exists());
        std::fs::write(stored.with_extension("release"), b"lose ACK").unwrap();
        tokio::time::timeout(Duration::from_secs(3), async {
            while !failed.exists() {
                tokio::time::sleep(Duration::from_millis(5)).await;
            }
        })
        .await
        .unwrap();
        // Failure barrier is in actual Store guard Drop; exclusive lease has not
        // been destroyed, and host teardown cannot finish while it is parked.
        let status = tokio::time::timeout(Duration::from_secs(3), competing)
            .await
            .unwrap()
            .unwrap();
        assert!(!failed.with_extension("release").exists());
        status
    });
    assert_eq!(
        status.code(),
        tonic::Code::Unavailable,
        "already-admitted writer must be cancelled before exclusive release, not client deadline"
    );
    assert!(!std::path::Path::new(&format!("{}.ordinary-entered", handler.display())).exists());
    assert_eq!(
        runtime.block_on(task_vertical_acceptance::load_task(
            &db.endpoint(),
            pending[0].task_id.clone().unwrap()
        )),
        pending[0]
    );
    assert_eq!(
        runtime.block_on(load_state(&db.endpoint(), &reference)),
        Some(TaskCounter { value: 15 }.encode_to_vec())
    );
    std::fs::write(failed.with_extension("release"), b"allow lease destruction").unwrap();
    let start = std::time::Instant::now();
    while host.try_wait().unwrap().is_none() {
        assert!(start.elapsed() < Duration::from_secs(5));
        std::thread::sleep(Duration::from_millis(10));
    }
    assert!(!host.wait().unwrap().success());
    db.restart();
    assert_eq!(
        runtime.block_on(task_vertical_acceptance::load_task(
            &db.endpoint(),
            pending[0].task_id.clone().unwrap()
        )),
        pending[0]
    );
}
