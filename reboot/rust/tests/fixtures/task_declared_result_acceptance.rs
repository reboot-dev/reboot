#[test]
#[ignore = "requires REBOOT_NATIVE2PC_CXX_DATABASE real C++ Database/RocksDB"]
fn generated_declared_reader_writer_restart_and_sealed_handler_retry() {
    let fixture = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("tests/fixtures/generated_cxx_database_process");
    assert!(Command::new("cargo")
        .args(["build", "--locked"])
        .current_dir(&fixture)
        .status()
        .unwrap()
        .success());
    let binary = generated_host_binary(&fixture);
    for vector in ["reader", "writer", "retry", "before-cas"] {
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
        let boundary = markers.path().join("before-cas");
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
        if vector == "retry" {
            command.arg("--writer-handler-retry");
        } else {
            command.args(["--task-vector", "declared"]);
        }
        if vector == "reader" {
            command.arg("--declared-reader");
        }
        if vector == "before-cas" {
            command.env("REBOOT_TEST_TASK_BEFORE_COMPLETE", &boundary);
        }
        let mut host = WaitHostGuard(command.spawn().unwrap());
        task_vertical_acceptance::await_marker(&handler, &mut host);
        let uuid = std::fs::read_to_string(format!("{}.task-id", handler.display())).unwrap();
        let id = database::TaskId {
            state_type: CounterDeclaration::STATE_TYPE.into(),
            state_ref: reference.clone(),
            task_uuid: Uuid::parse_str(&uuid).unwrap().as_bytes().to_vec(),
        };
        let await_completed = || {
            let start = std::time::Instant::now();
            loop {
                let task = runtime.block_on(task_vertical_acceptance::load_task(
                    &db.endpoint(),
                    id.clone(),
                ));
                if task.status == database::task::Status::Completed as i32 {
                    break task;
                }
                assert!(
                    start.elapsed() < Duration::from_secs(5),
                    "durable completion timeout: {vector}"
                );
                std::thread::sleep(Duration::from_millis(10));
            }
        };
        let terminal = if vector == "before-cas" {
            task_vertical_acceptance::await_marker(&boundary, &mut host);
            assert_eq!(
                runtime.block_on(load_state(&db.endpoint(), &reference)),
                Some(TaskCounter { value: 12 }.encode_to_vec())
            );
            assert_eq!(
                runtime
                    .block_on(task_vertical_acceptance::load_task(
                        &db.endpoint(),
                        id.clone()
                    ))
                    .status,
                database::task::Status::Pending as i32
            );
            None
        } else {
            Some(await_completed())
        };
        let calls_path = if vector == "reader" {
            format!("{}.invocations", handler.display())
        } else {
            format!("{}.writer-invocations", handler.display())
        };
        assert_eq!(
            std::fs::read_to_string(&calls_path)
                .unwrap()
                .lines()
                .count(),
            if vector == "retry" { 3 } else { 1 }
        );
        assert_eq!(
            runtime.block_on(load_state(&db.endpoint(), &reference)),
            Some(
                TaskCounter {
                    value: if vector == "retry" { 15 } else { 12 }
                }
                .encode_to_vec()
            )
        );
        if vector != "retry" {
            let mut stream = runtime.block_on(async {
                database::database_client::DatabaseClient::connect(db.endpoint())
                    .await
                    .unwrap()
                    .recover_idempotent_mutations(database::RecoverIdempotentMutationsRequest {
                        state_type: id.state_type.clone(),
                        state_ref: reference.clone(),
                        idempotency_key: Some(
                            reboot_rust_schema::runtime::writer_task_key(
                                &id,
                                "tests.reboot.protoc.TransactionCounterWritesMethods.ApplyDeclared",
                            )
                            .unwrap()
                            .as_bytes()
                            .to_vec(),
                        ),
                        ..Default::default()
                    })
                    .await
                    .unwrap()
                    .into_inner()
            });
            while let Some(batch) = runtime.block_on(stream.message()).unwrap() {
                assert!(
                    batch.idempotent_mutations.is_empty(),
                    "declared failed private state must not checkpoint"
                );
            }
        }
        if let Some(task) = terminal.as_ref().filter(|_| vector != "retry") {
            let Some(database::task::ResponseOrError::Error(error)) = &task.response_or_error
            else {
                panic!("declared task not durably Error");
            };
            let rich = reboot_rust_schema::one_shot_tasks::decode_task_error(error).unwrap();
            assert_eq!(
                rich.details[0].type_url,
                "type.googleapis.com/tests.reboot.protoc.TransactionLimitExceeded"
            );
            assert_eq!(
                TaskCounter::decode(rich.details[0].value.as_slice())
                    .unwrap()
                    .value,
                4242
            );
        }
        host.kill().unwrap();
        host.wait().unwrap();
        drop(host);
        db.restart();
        std::fs::remove_file(&ack).unwrap();
        let mut command = writer_command(WriterHostOptions {
            endpoint: &db.endpoint(),
            ..options()
        });
        if vector == "retry" {
            command.args(["--writer-wait", &uuid]);
        } else {
            command.args(["--declared-wait", &uuid]);
        }
        if vector == "reader" {
            command.arg("--declared-reader");
        }
        let mut host = WaitHostGuard(command.spawn().unwrap());
        task_vertical_acceptance::await_marker(&ack, &mut host);
        assert_eq!(
            std::fs::read_to_string(&ack).unwrap(),
            if vector == "retry" { "15" } else { "4242" }
        );
        assert_eq!(std::fs::read_to_string(&calls_path).unwrap().lines().count(), if vector == "retry" { 3 } else if vector == "before-cas" { 2 } else { 1 }, "Completed replay must skip handler; pre-CAS declared return is explicitly at least once");
        if let Some(terminal) = terminal {
            assert_eq!(
                runtime.block_on(task_vertical_acceptance::load_task(&db.endpoint(), id)),
                terminal
            );
        }
        assert_eq!(
            runtime.block_on(load_state(&db.endpoint(), &reference)),
            Some(
                TaskCounter {
                    value: if vector == "retry" { 15 } else { 12 }
                }
                .encode_to_vec()
            )
        );
        host.kill().unwrap();
        host.wait().unwrap();
    }
}
