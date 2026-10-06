fn reader_task_wait_request(
    task_id: Option<database::TaskId>,
) -> tonic::Request<database::WaitRequest> {
    let mut request = tonic::Request::new(database::WaitRequest { task_id });
    request
        .metadata_mut()
        .insert("x-reboot-state-ref", "root".parse().unwrap());
    request
}
#[test]
#[ignore = "requires REBOOT_NATIVE2PC_CXX_DATABASE real C++ Database/RocksDB"]
fn generated_canonical_reader_task_wait_deadline_and_typed_result() {
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
    let db = CxxDatabase::start(std::env::var("REBOOT_NATIVE2PC_CXX_DATABASE").unwrap());
    let runtime = tokio::runtime::Runtime::new().unwrap();
    runtime.block_on(store_counter(&db.endpoint(), "root", 5));
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
    let marker = markers.path().join("handler");
    let ack = markers.path().join("root-ack");
    let vector = format!("delayed:{}", chrono::Utc::now().timestamp() + 4);
    let mut host = task_host(TaskHostOptions {
        binary: &binary,
        database: &db.endpoint(),
        planner: &planner.endpoint,
        port: listen,
        marker: &marker,
        ack: &ack,
        invoke: true,
        block: false,
        recover: false,
        vector: Some(&vector),
    });
    await_marker(&ack, &mut host);
    let pending = runtime.block_on(pending_tasks(&db.endpoint()));
    assert_eq!(pending.len(), 1);
    let task = pending[0].clone();
    let id = task.task_id.clone().unwrap();
    runtime.block_on(async {
        let channel = tonic::transport::Channel::from_shared(format!("http://127.0.0.1:{listen}"))
            .unwrap()
            .connect()
            .await
            .unwrap();
        let mut client = database::tasks_client::TasksClient::new(channel);
        for (task_id, expected) in [
            (None, tonic::Code::InvalidArgument),
            (
                Some(database::TaskId {
                    state_ref: "other".into(),
                    ..id.clone()
                }),
                tonic::Code::InvalidArgument,
            ),
            (
                Some(database::TaskId {
                    task_uuid: vec![0; 16],
                    ..id.clone()
                }),
                tonic::Code::InvalidArgument,
            ),
            (
                Some(database::TaskId {
                    task_uuid: Uuid::new_v4().as_bytes().to_vec(),
                    ..id.clone()
                }),
                tonic::Code::NotFound,
            ),
        ] {
            assert_eq!(
                client
                    .wait(reader_task_wait_request(task_id))
                    .await
                    .unwrap_err()
                    .code(),
                expected
            );
        }
        let mut mismatched = tonic::Request::new(database::WaitRequest {
            task_id: Some(id.clone()),
        });
        mismatched
            .metadata_mut()
            .insert("x-reboot-state-ref", "other".parse().unwrap());
        assert_eq!(
            client.wait(mismatched).await.unwrap_err().code(),
            tonic::Code::InvalidArgument
        );
        let mut request = tonic::Request::new(database::WaitRequest {
            task_id: Some(id.clone()),
        });
        request
            .metadata_mut()
            .insert("x-reboot-state-ref", "root".parse().unwrap());
        request.set_timeout(Duration::from_millis(100));
        let error = client.wait(request).await.unwrap_err();
        assert!(matches!(
            error.code(),
            tonic::Code::Cancelled | tonic::Code::DeadlineExceeded
        ));
        assert_eq!(
            load_task(&db.endpoint(), id.clone()).await,
            task,
            "Wait deadline mutated task"
        );
        assert_eq!(
            client
                .list_tasks(database::ListTasksRequest::default())
                .await
                .unwrap_err()
                .code(),
            tonic::Code::Unimplemented
        );
        assert_eq!(
            client
                .cancel_task(database::CancelTaskRequest {
                    task_id: Some(id.clone())
                })
                .await
                .unwrap_err()
                .code(),
            tonic::Code::Unimplemented
        );
    });
    let deadline_marker = markers.path().join("typed-deadline");
    let mut deadline_waiter = Command::new(&binary)
        .args([
            "--role",
            "wait-result",
            "--listen",
            &format!("127.0.0.1:{listen}"),
            "--state-ref",
            "root",
            "--task-uuid",
            &Uuid::from_slice(&id.task_uuid).unwrap().to_string(),
            "--result-marker",
            deadline_marker.to_str().unwrap(),
            "--expect-wait-error",
            "Deadline",
            "--wait-timeout-ms",
            "100",
        ])
        .spawn()
        .unwrap();
    await_marker(&deadline_marker, &mut deadline_waiter);
    assert!(deadline_waiter.wait().unwrap().success());
    assert_eq!(
        runtime.block_on(load_task(&db.endpoint(), id.clone())),
        task
    );
    let typed = markers.path().join("typed-result");
    let mut waiter = Command::new(&binary)
        .args([
            "--role",
            "wait-result",
            "--listen",
            &format!("127.0.0.1:{listen}"),
            "--state-ref",
            "root",
            "--task-uuid",
            &Uuid::from_slice(&id.task_uuid).unwrap().to_string(),
            "--result-marker",
            typed.to_str().unwrap(),
        ])
        .spawn()
        .unwrap();
    await_marker(&typed, &mut waiter);
    assert!(waiter.wait().unwrap().success());
    assert_eq!(std::fs::read_to_string(&typed).unwrap(), "12");
    let completed = runtime.block_on(load_task(&db.endpoint(), id.clone()));
    assert_eq!(completed.status, database::task::Status::Completed as i32);
    assert_eq!(completed.timestamp, task.timestamp);
    // A completed task can also be retrieved again without dispatcher execution.
    runtime.block_on(async {
        let channel = tonic::transport::Channel::from_shared(format!("http://127.0.0.1:{listen}"))
            .unwrap()
            .connect()
            .await
            .unwrap();
        let mut client = database::tasks_client::TasksClient::new(channel);
        let result = client
            .wait(reader_task_wait_request(Some(id.clone())))
            .await
            .unwrap()
            .into_inner();
        match result.response_or_error.unwrap().response_or_error.unwrap() {
            database::task_response_or_error::ResponseOrError::Response(response) => assert_eq!(
                TaskQueryResponse::decode(response.value.as_slice())
                    .unwrap()
                    .value,
                12
            ),
            other => panic!("unexpected result: {other:?}"),
        }
    });
    for (suffix, response) in [
        (
            "wrong-type",
            prost_types::Any {
                type_url: "type.googleapis.com/example.Wrong".into(),
                value: vec![],
            },
        ),
        (
            "bad-payload",
            prost_types::Any {
                type_url: "type.googleapis.com/tests.reboot.protoc.TransactionCounterValue".into(),
                value: vec![0xff],
            },
        ),
    ] {
        let malformed_id = database::TaskId {
            task_uuid: Uuid::new_v4().as_bytes().to_vec(),
            ..id.clone()
        };
        let malformed = database::Task {
            task_id: Some(malformed_id.clone()),
            response_or_error: Some(database::task::ResponseOrError::Response(response)),
            ..completed.clone()
        };
        runtime.block_on(async {
            database::database_client::DatabaseClient::connect(db.endpoint())
                .await
                .unwrap()
                .store(database::StoreRequest {
                    task_upserts: vec![malformed],
                    sync: true,
                    ..Default::default()
                })
                .await
                .unwrap();
        });
        let output = markers.path().join(suffix);
        let mut waiter = Command::new(&binary)
            .args([
                "--role",
                "wait-result",
                "--listen",
                &format!("127.0.0.1:{listen}"),
                "--state-ref",
                "root",
                "--task-uuid",
                &Uuid::from_slice(&malformed_id.task_uuid)
                    .unwrap()
                    .to_string(),
                "--result-marker",
                output.to_str().unwrap(),
                "--expect-wait-error",
                "DataLoss",
            ])
            .spawn()
            .unwrap();
        await_marker(&output, &mut waiter);
        assert!(waiter.wait().unwrap().success());
    }
    assert_eq!(runtime.block_on(load_task(&db.endpoint(), id)), completed);
    assert!(
        host.try_wait().unwrap().is_none(),
        "Wait failure killed dispatcher host"
    );
    host.kill().unwrap();
    host.wait().unwrap();
}
