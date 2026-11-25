#[test]
#[ignore = "requires REBOOT_NATIVE2PC_CXX_DATABASE real C++ Database/RocksDB"]
fn generated_delayed_reader_task_survives_restart_without_early_delivery_or_starvation() {
    let fixture = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("tests/fixtures/generated_cxx_database_process");
    crate::prepare_generated_host(&fixture);
    let binary = generated_host_binary(&fixture);
    let mut db = CxxDatabase::start(std::env::var("REBOOT_NATIVE2PC_CXX_DATABASE").unwrap());
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
    let marker = markers.path().join("first-delayed-handler");
    let ack = markers.path().join("scheduled-root-ack");
    let seconds = chrono::Utc::now().timestamp() + 5;
    let deadline = chrono::DateTime::from_timestamp(seconds, 0).unwrap();
    let vector = format!("delayed:{seconds}");
    let mut host = task_host(TaskHostOptions {
        binary: &binary,
        database: &db.endpoint(),
        planner: &planner.endpoint,
        port: listen,
        marker: &marker,
        ack: &ack,
        invoke: true,
        block: true,
        recover: false,
        vector: Some(&vector),
    });
    await_marker(&ack, &mut host);
    let pending = runtime.block_on(pending_tasks(&db.endpoint()));
    assert_eq!(pending.len(), 1);
    let delayed = pending[0].clone();
    assert_eq!(
        delayed.timestamp,
        Some(prost_types::Timestamp { seconds, nanos: 0 })
    );
    let id = delayed.task_id.clone().unwrap();
    // A durable immediate record must complete while the future record stays
    // pending, proving the scheduler does not sleep on the first future task.
    let immediate = database::Task {
        task_id: Some(database::TaskId {
            task_uuid: Uuid::new_v4().as_bytes().to_vec(),
            ..id.clone()
        }),
        method: "Query".into(),
        request: TaskQueryRequest { amount: 0 }.encode_to_vec(),
        status: database::task::Status::Pending as i32,
        ..Default::default()
    };
    runtime.block_on(async {
        database::database_client::DatabaseClient::connect(db.endpoint())
            .await
            .unwrap()
            .store(database::StoreRequest {
                task_upserts: vec![immediate.clone()],
                sync: true,
                ..Default::default()
            })
            .await
            .unwrap();
    });
    let mut immediate_done = false;
    for _ in 0..80 {
        let loaded = runtime.block_on(load_task(
            &db.endpoint(),
            immediate.task_id.clone().unwrap(),
        ));
        if loaded.status == database::task::Status::Completed as i32 {
            immediate_done = true;
            break;
        }
        std::thread::sleep(Duration::from_millis(25));
    }
    assert!(
        immediate_done,
        "future task starved live immediate delivery"
    );
    assert!(
        chrono::Utc::now() < deadline,
        "fixture missed its pre-deadline checkpoint"
    );
    assert!(!marker.exists(), "future task invoked before its deadline");
    host.kill().unwrap();
    host.wait().unwrap();
    db.restart();
    assert_eq!(
        runtime.block_on(load_task(&db.endpoint(), id.clone())),
        delayed
    );
    let marker = markers.path().join("recovered-delayed-handler");
    let mut recovered = task_host(TaskHostOptions {
        binary: &binary,
        database: &db.endpoint(),
        planner: &planner.endpoint,
        port: listen,
        marker: &marker,
        ack: &ack,
        invoke: false,
        block: false,
        recover: true,
        vector: None,
    });
    await_marker(&marker, &mut recovered);
    let started: u128 = std::fs::read_to_string(format!("{}.started-at", marker.display()))
        .unwrap()
        .parse()
        .unwrap();
    assert!(
        started >= u128::try_from(deadline.timestamp_nanos_opt().unwrap()).unwrap(),
        "recovered task ran early"
    );
    assert_eq!(std::fs::read_to_string(&marker).unwrap(), "12");
    let mut completed = None;
    for _ in 0..120 {
        let loaded = runtime.block_on(load_task(&db.endpoint(), id.clone()));
        if loaded.status == database::task::Status::Completed as i32 {
            completed = Some(loaded);
            break;
        }
        std::thread::sleep(Duration::from_millis(25));
    }
    let completed = completed.expect("delayed completion did not become durable");
    assert_eq!(completed.timestamp, delayed.timestamp);
    match &completed.response_or_error {
        Some(database::task::ResponseOrError::Response(response)) => assert_eq!(
            TaskQueryResponse::decode(response.value.as_slice())
                .unwrap()
                .value,
            12
        ),
        other => panic!("unexpected delayed result: {other:?}"),
    }
    recovered.kill().unwrap();
    recovered.wait().unwrap();
    db.restart();
    assert_eq!(runtime.block_on(load_task(&db.endpoint(), id)), completed);
    assert!(runtime.block_on(pending_tasks(&db.endpoint())).is_empty());
}
