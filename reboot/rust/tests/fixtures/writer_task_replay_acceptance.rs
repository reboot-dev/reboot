use super::*;
include!("writer_task_authority_acceptance.rs");
include!("writer_task_process_acceptance.rs");
include!("task_declared_result_acceptance.rs");
include!("task_declared_negative_acceptance.rs");
include!("task_declared_custom_acceptance.rs");

#[test]
#[ignore = "requires REBOOT_NATIVE2PC_CXX_DATABASE real C++ Database/RocksDB"]
fn generated_writer_task_store_checkpoint_restart_original_response() {
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
        "tests.reboot.protoc.TransactionCounter",
        "writer/actor",
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
    let stored = markers.path().join("store-ack");
    let launch = |invoke: bool, barrier: bool, wait: Option<&str>| {
        let mut command = Command::new(&binary);
        command.args([
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
            &reference,
            "--coordinator-state-ref",
            &reference,
            "--task-marker",
            handler.to_str().unwrap(),
            "--invoke-marker",
            ack.to_str().unwrap(),
            "--writer-tasks",
            "--recover",
        ]);
        if invoke {
            command.arg("--invoke");
        }
        if barrier {
            command.env("REBOOT_TEST_WRITER_AFTER_STORE", &stored);
        }
        if let Some(uuid) = wait {
            command.args(["--writer-wait", uuid]);
        }
        WaitHostGuard(
            command
                .stdout(Stdio::inherit())
                .stderr(Stdio::inherit())
                .spawn()
                .unwrap(),
        )
    };
    let mut host = launch(true, true, None);
    task_vertical_acceptance::await_marker(&stored, &mut host);
    task_vertical_acceptance::await_marker(&ack, &mut host);
    assert_eq!(
        runtime.block_on(load_state(&db.endpoint(), &reference)),
        Some(TaskCounter { value: 15 }.encode_to_vec())
    );
    let pending = runtime.block_on(task_vertical_acceptance::pending_tasks(&db.endpoint()));
    assert_eq!(pending.len(), 1);
    let original = pending[0].clone();
    assert_eq!(original.method, "Apply");
    assert_eq!(original.status, database::task::Status::Pending as i32);
    let id = original.task_id.clone().unwrap();
    let key = reboot_rust_schema::runtime::writer_task_key(
        &id,
        "tests.reboot.protoc.TransactionCounterWritesMethods.Apply",
    )
    .unwrap();
    let checkpoint = runtime.block_on(async {
        let mut client = database::database_client::DatabaseClient::connect(db.endpoint())
            .await
            .unwrap();
        let mut stream = client
            .recover_idempotent_mutations(database::RecoverIdempotentMutationsRequest {
                state_type: id.state_type.clone(),
                state_ref: id.state_ref.clone(),
                idempotency_key: Some(key.as_bytes().to_vec()),
                workflow_id: None,
                workflow_iteration: None,
            })
            .await
            .unwrap()
            .into_inner();
        let mut records = Vec::new();
        while let Some(batch) = stream.message().await.unwrap() {
            records.extend(batch.idempotent_mutations);
        }
        assert_eq!(records.len(), 1);
        records.remove(0)
    });
    assert_eq!(checkpoint.state_ref, reference);
    assert_eq!(checkpoint.key, key.as_bytes());
    assert!(!checkpoint.request_fingerprint.as_ref().unwrap().is_empty());
    assert_eq!(
        TaskCounter::decode(checkpoint.response.as_slice())
            .unwrap()
            .value,
        15
    );
    assert_eq!(
        std::fs::read_to_string(handler.with_extension("writer-invocations")).unwrap_or_else(
            |_| std::fs::read_to_string(format!("{}.writer-invocations", handler.display()))
                .unwrap()
        ),
        "apply 3\n"
    );
    host.kill().unwrap();
    host.wait().unwrap();
    drop(host);
    // Sidecar restart, then an ordinary admitted writer while dispatcher is absent.
    db.restart();
    runtime.block_on(async {
        let store = reboot_rust_schema::runtime::DatabaseActorStore::connect(db.endpoint())
            .await
            .unwrap();
        let mut request = tonic::Request::new(TaskCounter { value: 100 });
        let mut headers = reboot_rust_schema::RebootHeaders::new(&reference);
        headers.idempotency_key = Some(Uuid::new_v4());
        *request.metadata_mut() = headers.to_metadata().unwrap();
        store
            .writer_async::<TaskCounter, _, _, _>(
                "tests.reboot.protoc.TransactionCounter",
                request,
                |state, request| {
                    Box::pin(async move {
                        state.value += request.value;
                        Ok(state.clone())
                    })
                },
            )
            .await
            .unwrap();
    });
    assert_eq!(
        runtime.block_on(load_state(&db.endpoint(), &reference)),
        Some(TaskCounter { value: 115 }.encode_to_vec())
    );
    assert_eq!(
        runtime.block_on(task_vertical_acceptance::load_task(
            &db.endpoint(),
            id.clone()
        )),
        original
    );
    std::fs::remove_file(&ack).unwrap();
    let uuid = Uuid::from_slice(&id.task_uuid).unwrap().to_string();
    // New launch closure after restarting db (the old closure's borrow is ended).
    let launch_replay = || {
        WaitHostGuard(
            Command::new(&binary)
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
                    &reference,
                    "--coordinator-state-ref",
                    &reference,
                    "--task-marker",
                    handler.to_str().unwrap(),
                    "--invoke-marker",
                    ack.to_str().unwrap(),
                    "--writer-tasks",
                    "--recover",
                    "--writer-wait",
                    &uuid,
                ])
                .stdout(Stdio::inherit())
                .stderr(Stdio::inherit())
                .spawn()
                .unwrap(),
        )
    };
    let mut host = launch_replay();
    task_vertical_acceptance::await_marker(&ack, &mut host);
    assert_eq!(
        std::fs::read_to_string(&ack).unwrap(),
        "15",
        "must return original checkpoint, not intervening state"
    );
    let completed = runtime.block_on(task_vertical_acceptance::load_task(
        &db.endpoint(),
        id.clone(),
    ));
    assert_eq!(completed.status, database::task::Status::Completed as i32);
    assert_eq!(
        runtime.block_on(load_state(&db.endpoint(), &reference)),
        Some(TaskCounter { value: 115 }.encode_to_vec())
    );
    assert_eq!(
        std::fs::read_to_string(format!("{}.writer-invocations", handler.display())).unwrap(),
        "apply 3\n",
        "checkpoint replay must not reenter handler"
    );
    host.kill().unwrap();
    host.wait().unwrap();
    drop(host);
    db.restart();
    std::fs::remove_file(&ack).unwrap();
    let mut host = WaitHostGuard(
        Command::new(&binary)
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
                &reference,
                "--coordinator-state-ref",
                &reference,
                "--task-marker",
                handler.to_str().unwrap(),
                "--invoke-marker",
                ack.to_str().unwrap(),
                "--writer-tasks",
                "--recover",
                "--writer-wait",
                &uuid,
            ])
            .stdout(Stdio::inherit())
            .stderr(Stdio::inherit())
            .spawn()
            .unwrap(),
    );
    task_vertical_acceptance::await_marker(&ack, &mut host);
    assert_eq!(std::fs::read_to_string(&ack).unwrap(), "15");
    assert_eq!(
        runtime.block_on(task_vertical_acceptance::load_task(&db.endpoint(), id)),
        completed
    );
    assert_eq!(
        runtime.block_on(load_state(&db.endpoint(), &reference)),
        Some(TaskCounter { value: 115 }.encode_to_vec())
    );
    assert_eq!(
        std::fs::read_to_string(format!("{}.writer-invocations", handler.display())).unwrap(),
        "apply 3\n"
    );
}

#[derive(Clone, PartialEq, prost::Message)]
struct TaskCounter {
    #[prost(int64, tag = "1")]
    value: i64,
}
impl reboot_rust_schema::runtime::RebootState for TaskCounter {
    const STATE_TYPE: &'static str = "tests.reboot.protoc.TransactionCounter";
}

struct WriterHostOptions<'a> {
    binary: &'a std::path::Path,
    endpoint: &'a str,
    planner: &'a str,
    port: u16,
    reference: &'a str,
    marker: &'a std::path::Path,
    ack: &'a std::path::Path,
}
fn writer_command(options: WriterHostOptions<'_>) -> Command {
    let mut command = Command::new(options.binary);
    command.args([
        "--role",
        "tasks",
        "--database",
        options.endpoint,
        "--listen",
        &format!("127.0.0.1:{}", options.port),
        "--placement-planner",
        options.planner,
        "--root-id",
        &Uuid::new_v4().to_string(),
        "--state-ref",
        options.reference,
        "--coordinator-state-ref",
        options.reference,
        "--task-marker",
        options.marker.to_str().unwrap(),
        "--invoke-marker",
        options.ack.to_str().unwrap(),
        "--writer-tasks",
        "--recover",
    ]);
    command.stdout(Stdio::inherit()).stderr(Stdio::inherit());
    command
}

#[test]
#[ignore = "requires REBOOT_NATIVE2PC_CXX_DATABASE real C++ Database/RocksDB"]
fn generated_writer_task_pre_store_exclusive_and_uncertain_ack_restart() {
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
        "pre-store",
        "store-ack",
        "complete-ack",
        "handler-status",
        "handler-broken-pipe",
        "handler-cancelled",
        "declared-ack",
    ] {
        let runtime = tokio::runtime::Runtime::new().unwrap();
        let mut db = CxxDatabase::start(std::env::var("REBOOT_NATIVE2PC_CXX_DATABASE").unwrap());
        let reference = reboot_rust_schema::state_ref::StateRef::from_id(
            "tests.reboot.protoc.TransactionCounter",
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
        let options = || WriterHostOptions {
            binary: &binary,
            endpoint: "",
            planner: &planner.endpoint,
            port: listen,
            reference: &reference,
            marker: &handler,
            ack: &ack,
        };
        let mut command = writer_command(WriterHostOptions {
            endpoint: &db.endpoint(),
            ..options()
        });
        command.arg("--invoke");
        match vector {
            "pre-store" => {
                command.arg("--block-task");
            }
            "store-ack" => {
                command
                    .env("REBOOT_TEST_WRITER_AFTER_STORE", &boundary)
                    .env("REBOOT_TEST_WRITER_LOST_STORE_ACK", "1");
            }
            "declared-ack" => {
                command
                    .args(["--task-vector", "declared"])
                    .env("REBOOT_TEST_WRITER_AFTER_COMPLETE", &boundary);
            }
            "complete-ack" => {
                command.env("REBOOT_TEST_WRITER_AFTER_COMPLETE", &boundary);
            }
            "handler-status" => {
                command.arg("--writer-handler-error");
            }
            "handler-broken-pipe" => {
                command.arg("--writer-handler-broken-pipe");
            }
            "handler-cancelled" => {
                command.arg("--writer-handler-cancelled");
            }
            _ => unreachable!(),
        }
        let mut host = WaitHostGuard(command.spawn().unwrap());
        task_vertical_acceptance::await_marker(&handler, &mut host);
        if matches!(vector, "store-ack" | "complete-ack" | "declared-ack") {
            task_vertical_acceptance::await_marker(&boundary, &mut host);
        }
        let pending = runtime.block_on(task_vertical_acceptance::pending_tasks(&db.endpoint()));
        if matches!(vector, "complete-ack" | "declared-ack") {
            assert!(pending.is_empty());
        } else {
            assert_eq!(pending.len(), 1);
        }
        let uuid = std::fs::read_to_string(format!("{}.task-id", handler.display())).unwrap();
        let id = database::TaskId {
            state_type: "tests.reboot.protoc.TransactionCounter".into(),
            state_ref: reference.clone(),
            task_uuid: Uuid::parse_str(&uuid).unwrap().as_bytes().to_vec(),
        };
        let before = runtime.block_on(task_vertical_acceptance::load_task(
            &db.endpoint(),
            id.clone(),
        ));
        let expected =
            if vector.starts_with("handler-") || matches!(vector, "pre-store" | "declared-ack") {
                12
            } else {
                15
            };
        assert_eq!(
            runtime.block_on(load_state(&db.endpoint(), &reference)),
            Some(TaskCounter { value: expected }.encode_to_vec())
        );
        if !vector.starts_with("handler-") {
            // Actual generated ordinary Apply must not enter while dispatcher holds its lease.
            let status = runtime.block_on(async {
                let channel =
                    tonic::transport::Endpoint::from_shared(format!("http://127.0.0.1:{listen}"))
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
                request.set_timeout(Duration::from_millis(250));
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
            assert!(
                matches!(
                    status.code(),
                    tonic::Code::Cancelled | tonic::Code::DeadlineExceeded
                ),
                "exclusive task must block ordinary writer, got {status}"
            );
            assert!(
                !std::path::Path::new(&format!("{}.ordinary-entered", handler.display())).exists(),
                "ordinary writer overlapped admitted task"
            );
        }
        if vector == "pre-store" {
            host.kill().unwrap();
            host.wait().unwrap();
        } else {
            if !vector.starts_with("handler-") {
                std::fs::write(boundary.with_extension("release"), b"release ACK failure").unwrap();
            }
            let start = std::time::Instant::now();
            let status = loop {
                if let Some(status) = host.try_wait().unwrap() {
                    break status;
                }
                assert!(
                    start.elapsed() < Duration::from_secs(5),
                    "uncertain writer host must fail, not detach supervision"
                );
                std::thread::sleep(Duration::from_millis(10));
            };
            assert!(
                !status.success(),
                "uncertainty/handler Status must fail host"
            );
        }
        drop(host);
        db.restart();
        assert_eq!(
            runtime.block_on(task_vertical_acceptance::load_task(
                &db.endpoint(),
                id.clone()
            )),
            before,
            "failure must preserve full canonical task record"
        );
        let mut command = writer_command(WriterHostOptions {
            endpoint: &db.endpoint(),
            ..options()
        });
        command.args([
            if vector == "declared-ack" {
                "--declared-wait"
            } else {
                "--writer-wait"
            },
            &uuid,
        ]);
        let mut host = WaitHostGuard(command.spawn().unwrap());
        if ack.exists() {
            std::fs::remove_file(&ack).unwrap();
        }
        task_vertical_acceptance::await_marker(&ack, &mut host);
        assert_eq!(
            std::fs::read_to_string(&ack).unwrap(),
            if vector == "declared-ack" {
                "4242"
            } else {
                "15"
            }
        );
        assert_eq!(
            runtime.block_on(load_state(&db.endpoint(), &reference)),
            Some(
                TaskCounter {
                    value: if vector == "declared-ack" { 12 } else { 15 }
                }
                .encode_to_vec()
            )
        );
        let calls =
            std::fs::read_to_string(format!("{}.writer-invocations", handler.display())).unwrap();
        assert_eq!(
            calls.lines().count(),
            if vector.starts_with("handler-") || vector == "pre-store" {
                2
            } else {
                1
            },
            "one durable attempt, checkpoint replay skips handler: {vector}"
        );
    }
}
