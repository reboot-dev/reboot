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
    let planner = LivePlannerServer::start(&runtime, plan.clone());
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
    // Python tasks_servicer.py:70-83 rejects a nonauthoritative server.
    // Keep public services declared so global host readiness cannot mask the
    // per-actor check. A live pending Wait must also notice the newer plan.
    runtime.block_on(async {
        let pending_id = database::TaskId {
            task_uuid: Uuid::new_v4().as_bytes().to_vec(),
            ..id.clone()
        };
        let pending = database::Task {
            task_id: Some(pending_id.clone()),
            timestamp: Some(prost_types::Timestamp {
                seconds: chrono::Utc::now().timestamp() + 60,
                nanos: 0,
            }),
            ..task.clone()
        };
        database::database_client::DatabaseClient::connect(db.endpoint())
            .await.unwrap().store(database::StoreRequest {
                task_upserts: vec![pending.clone()], sync: true,
                ..Default::default()
            }).await.unwrap();
        let channel = tonic::transport::Channel::from_shared(format!("http://127.0.0.1:{listen}"))
            .unwrap().connect().await.unwrap();
        let mut client = database::tasks_client::TasksClient::new(channel.clone());
        let mut inflight_client = database::tasks_client::TasksClient::new(channel);
        let mut request = reader_task_wait_request(Some(pending_id.clone()));
        request.set_timeout(Duration::from_secs(5));
        let wait = inflight_client.wait(request);
        tokio::pin!(wait);
        tokio::select! {
            result = &mut wait => panic!("pending Wait ended before placement moved: {result:?}"),
            () = tokio::time::sleep(Duration::from_millis(150)) => {}
        }
        let mut moved = plan.clone();
        moved.plan.as_mut().unwrap().version = 2;
        moved.plan.as_mut().unwrap().applications[0].shards[0].server_id = "other-server".into();
        moved.servers[0].id = "other-server".into();
        planner.publish(moved).await;
        assert_eq!(tokio::time::timeout(Duration::from_secs(2), &mut wait)
            .await.expect("pending Wait ignored placement change")
            .unwrap_err().code(), tonic::Code::Unavailable);
        // New requests must not return even an already durable completion.
        assert_eq!(client.wait(reader_task_wait_request(Some(id.clone())))
            .await.unwrap_err().code(), tonic::Code::Unavailable);
        assert_eq!(load_task(&db.endpoint(), pending_id).await, pending);
        assert_eq!(load_task(&db.endpoint(), id.clone()).await, completed);
        // Return authority under a strictly newer snapshot: same host becomes
        // usable without restart, with no task mutation or replay.
        let mut restored = plan.clone();
        restored.plan.as_mut().unwrap().version = 3;
        planner.publish(restored).await;
        tokio::time::timeout(Duration::from_secs(2), async {
            loop {
                match client.wait(reader_task_wait_request(Some(id.clone()))).await {
                    Ok(_) => break,
                    Err(error) if error.code() == tonic::Code::Unavailable =>
                        tokio::time::sleep(Duration::from_millis(10)).await,
                    Err(error) => panic!("restored authority failed: {error}"),
                }
            }
        }).await.unwrap();
    });
    assert_eq!(runtime.block_on(load_task(&db.endpoint(), id.clone())), completed);
    assert!(
        host.try_wait().unwrap().is_none(),
        "Wait failure killed dispatcher host"
    );
    host.kill().unwrap();
    host.wait().unwrap();

    // Deterministic post-Load race: a restarted host pauses a completed-result
    // Wait after its actual C++ Database Load reply. Move authority before
    // releasing it, without changing public service declarations/readiness.
    let loaded = markers.path().join("wait-loaded");
    let mut host = task_host_command(TaskHostOptions {
        binary: &binary, database: &db.endpoint(), planner: &planner.endpoint,
        port: listen, marker: &marker, ack: &ack,
        invoke: false, block: false, recover: true, vector: None,
    }).env("REBOOT_TEST_TASK_WAIT_LOADED", &loaded).spawn().unwrap();
    let marker_before = std::fs::read(&marker).unwrap();
    runtime.block_on(async {
        let channel = tonic::transport::Channel::from_shared(format!("http://127.0.0.1:{listen}"))
            .unwrap().connect_lazy();
        let mut client = database::tasks_client::TasksClient::new(channel.clone());
        let waiting_id = id.clone();
        let waiting_loaded = loaded.clone();
        let mut waiter_client = database::tasks_client::TasksClient::new(channel);
        let waiter = tokio::spawn(async move {
            tokio::time::timeout(Duration::from_secs(8), async {
                loop {
                    let mut request = reader_task_wait_request(Some(waiting_id.clone()));
                    request.set_timeout(Duration::from_secs(5));
                    match waiter_client.wait(request).await {
                        Err(error) if error.code() == tonic::Code::Unavailable => {
                            // Only startup errors are retried. After the Load
                            // marker appears, propagate the final result.
                            if waiting_loaded.exists() { return Err(error); }
                            tokio::time::sleep(Duration::from_millis(10)).await;
                        }
                        result => return result,
                    }
                }
            }).await.unwrap()
        });
        tokio::time::timeout(Duration::from_secs(3), async {
            while !loaded.exists() {
                assert!(!waiter.is_finished(), "Wait ended before the Load barrier");
                tokio::time::sleep(Duration::from_millis(5)).await;
            }
        }).await.expect("Wait did not reach real Database Load");
        let mut moved = plan.clone();
        moved.plan.as_mut().unwrap().version = 4;
        moved.plan.as_mut().unwrap().applications[0].shards[0].server_id = "other-server".into();
        moved.servers[0].id = "other-server".into();
        planner.publish(moved).await;
        // The hook is one-shot: this second request bypasses it and confirms
        // the new plan is installed while the first still owns its loaded data.
        tokio::time::timeout(Duration::from_secs(2), async {
            loop {
                match client.wait(reader_task_wait_request(Some(id.clone()))).await {
                    Err(error) if error.code() == tonic::Code::Unavailable => break,
                    Ok(_) => tokio::time::sleep(Duration::from_millis(10)).await,
                    Err(error) => panic!("unexpected moved authority status: {error}"),
                }
            }
        }).await.unwrap();
        assert!(!waiter.is_finished(), "Load barrier was not retained");
        std::fs::write(loaded.with_extension("release"), "release").unwrap();
        assert_eq!(tokio::time::timeout(Duration::from_secs(2), waiter)
            .await.unwrap().unwrap().unwrap_err().code(), tonic::Code::Unavailable,
            "post-Load authority check returned stale completed result");
        assert_eq!(load_task(&db.endpoint(), id.clone()).await, completed);
    });
    assert_eq!(std::fs::read(&marker).unwrap(), marker_before,
        "Wait replayed a completed task handler");
    assert!(host.try_wait().unwrap().is_none());
    host.kill().unwrap();
    host.wait().unwrap();
}
