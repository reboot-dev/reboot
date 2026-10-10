#[test]
#[ignore = "requires REBOOT_NATIVE2PC_CXX_DATABASE real C++ Database/RocksDB"]
fn generated_declared_task_malformed_wrong_method_terminals_fail_closed() {
    let fixture = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("tests/fixtures/generated_cxx_database_process");
    assert!(Command::new("cargo")
        .args(["build", "--locked"])
        .current_dir(&fixture)
        .status()
        .unwrap()
        .success());
    let binary = generated_host_binary(&fixture);
    for vector in [
        "url",
        "status-bytes",
        "ok",
        "detail-url",
        "detail-bytes",
        "wrong-method",
        "cross-reader",
        "cross-writer",
        "rpc-failure",
        "multiple-durable-details",
        "raw-ordinary-method",
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
        let mut rich = googleapis_tonic_google_rpc::google::rpc::Status {
            code: 2,
            message: "original".into(),
            details: vec![prost_types::Any {
                type_url: "type.googleapis.com/tests.reboot.protoc.TransactionLimitExceeded".into(),
                value: TaskCounter { value: 4242 }.encode_to_vec(),
            }],
        };
        if vector == "multiple-durable-details" {
            rich.details.push(rich.details[0].clone());
        }
        if vector == "ok" {
            rich.code = 0;
        }
        if vector == "detail-url" {
            rich.details[0].type_url = "type.googleapis.com/other.Error".into();
        }
        if vector == "detail-bytes" {
            rich.details[0].value = vec![0xff];
        }
        let error = prost_types::Any {
            type_url: if vector == "url" {
                "type.googleapis.com/other.Status"
            } else {
                "type.googleapis.com/google.rpc.Status"
            }
            .into(),
            value: if vector == "status-bytes" {
                vec![0xff]
            } else {
                rich.encode_to_vec()
            },
        };
        let uuid = Uuid::new_v4();
        let task = database::Task {
            task_id: Some(database::TaskId {
                state_type: CounterDeclaration::STATE_TYPE.into(),
                state_ref: reference.clone(),
                task_uuid: uuid.as_bytes().to_vec(),
            }),
            method: if matches!(vector, "wrong-method" | "raw-ordinary-method") {
                "Query"
            } else if vector == "cross-writer" {
                "QueryDeclared"
            } else {
                "ApplyDeclared"
            }
            .into(),
            status: database::task::Status::Completed as i32,
            request: TaskCounter { value: 3 }.encode_to_vec(),
            response_or_error: Some(database::task::ResponseOrError::Error(error)),
            ..Default::default()
        };
        runtime.block_on(async {
            database::database_client::DatabaseClient::connect(db.endpoint())
                .await
                .unwrap()
                .store(database::StoreRequest {
                    task_upserts: vec![task.clone()],
                    sync: true,
                    ..Default::default()
                })
                .await
                .unwrap();
        });
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
        if vector != "raw-ordinary-method" {
            command.args([
                "--declared-wait",
                &uuid.to_string(),
                "--expect-declared-malformed",
            ]);
        }
        if matches!(vector, "wrong-method" | "cross-reader" | "cross-writer") {
            command.arg("--expect-declared-wrong-method");
        }
        if vector == "cross-reader" {
            command.arg("--declared-reader");
        }
        if vector == "rpc-failure" {
            command
                .arg("--expect-declared-rpc-failure")
                .env("REBOOT_TEST_TASK_WAIT_RPC_ERROR", "1");
        }
        let mut host = WaitHostGuard(command.spawn().unwrap());
        if vector == "raw-ordinary-method" {
            runtime.block_on(async {
                let channel = tonic::transport::Endpoint::from_shared(format!("http://127.0.0.1:{listen}")).unwrap().connect_lazy();
                let mut client = database::tasks_client::TasksClient::new(channel);
                let status = tokio::time::timeout(Duration::from_secs(5), async {
                    loop {
                        let mut request = tonic::Request::new(database::WaitRequest { task_id: task.task_id.clone() });
                        *request.metadata_mut() = reboot_rust_schema::RebootHeaders::new(&reference).to_metadata().unwrap();
                        assert!(request.metadata().get("x-reboot-task-method").is_none());
                        request.set_timeout(Duration::from_secs(1));
                        match client.wait(request).await {
                            Err(status) if status.code() == tonic::Code::Unavailable => tokio::time::sleep(Duration::from_millis(10)).await,
                            result => break result.unwrap_err(),
                        }
                    }
                }).await.unwrap();
                assert_eq!(status.code(), tonic::Code::DataLoss, "raw public Wait must validate stored ordinary method terminal, without expected-method metadata");
            });
        } else {
            task_vertical_acceptance::await_marker(&ack, &mut host);
            assert_eq!(
            std::fs::read_to_string(&ack).unwrap(),
            if vector == "rpc-failure" {
                "-2"
            } else if matches!(vector, "wrong-method" | "cross-reader" | "cross-writer") {
                "-3"
            } else {
                "-1"
            },
            "malformed terminal must remain DataLoss / rich RPC failure must remain Grpc: {vector}"
        );
        }
        assert!(
            !handler.exists(),
            "Completed malformed result must never dispatch"
        );
        assert_eq!(
            runtime.block_on(task_vertical_acceptance::load_task(
                &db.endpoint(),
                task.task_id.clone().unwrap()
            )),
            task
        );
        assert_eq!(
            runtime.block_on(load_state(&db.endpoint(), &reference)),
            Some(TaskCounter { value: 5 }.encode_to_vec())
        );
        host.kill().unwrap();
        host.wait().unwrap();
        drop(host);
        db.restart();
        assert_eq!(
            runtime.block_on(task_vertical_acceptance::load_task(
                &db.endpoint(),
                task.task_id.clone().unwrap()
            )),
            task
        );
    }
}
