#[test]
#[ignore = "requires REBOOT_NATIVE2PC_CXX_DATABASE real C++ Database/RocksDB"]
fn registered_root_lost_staged_trailers_deadline_self_watch_releases_both() {
    live_registered_abandonment(false);
}
#[test]
#[ignore = "requires REBOOT_NATIVE2PC_CXX_DATABASE real C++ Database/RocksDB"]
fn registered_root_caught_lost_staged_trailers_self_watch_releases_both() {
    live_registered_abandonment(true);
}
#[test]
#[ignore = "requires REBOOT_NATIVE2PC_CXX_DATABASE real C++ Database/RocksDB"]
fn registered_root_abort_cannot_release_parked_live_leaf_handler() {
    let fixture = DistributedTasks::new();
    let barrier = fixture.markers.path().join("parked-handler");
    let terminal = fixture.markers.path().join("terminal");
    let mut command = fixture.command(false);
    command.args(["--live-watch", "--watch-coordinator-state-ref", "root", "--release-parked-target"])
        .env("REBOOT_TEST_TARGET_UNFINISHED_OUTBOUND", &barrier)
        .env("REBOOT_TEST_TARGET_WATCH_TERMINALIZED", &terminal);
    let mut target = fixture.spawn(&mut command, "target-log");
    wait(fixture.target_port);
    assert_eq!(fixture.rpc(false, "Apply", 0, Duration::from_secs(1)).unwrap(), 20);
    let address = format!("http://127.0.0.1:{}", fixture.target_port);
    let id = fixture.id;
    // This independent inbound RPC stays alive while root abandonment runs.
    let remote = fixture.runtime.spawn(async move {
        let mut client = tonic::client::Grpc::new(tonic::transport::Endpoint::from_shared(address).unwrap().connect_lazy());
        client.ready().await.unwrap();
        let mut headers = reboot_rust_schema::RebootHeaders::new("target");
        headers.transaction_ids = Some(vec![id]);
        headers.transaction_coordinator_state_type = Some("tests.reboot.protoc.TransactionCounter".into());
        headers.transaction_coordinator_state_ref = Some("root".into());
        let mut request = tonic::Request::new(TaskQueryRequest { amount: 7 });
        *request.metadata_mut() = headers.to_metadata().unwrap();
        request.set_timeout(Duration::from_secs(10));
        client.unary::<_, TaskQueryResponse, _>(request,
            "/tests.reboot.protoc.TransactionCounterWritesMethods/Increment".parse().unwrap(), tonic::codec::ProstCodec::default()).await
    });
    await_marker(&barrier, &mut target);
    let mut root = fixture.spawn(&mut fixture.command(true), "root-log");
    wait(fixture.root_port);
    fixture.rpc(true, "Increment", 1, Duration::from_millis(300)).unwrap_err();
    let deadline = std::time::Instant::now() + Duration::from_secs(2);
    while fixture.decision().is_none() { assert!(std::time::Instant::now() < deadline); std::thread::sleep(Duration::from_millis(10)); }
    assert!(!barrier.with_extension("handler-dropped").exists());
    assert!(!terminal.exists(), "Watch must not activate while handler runs");
    fixture.runtime.block_on(async {
        let mut client = database::participant_client::ParticipantClient::connect(format!("http://127.0.0.1:{}", fixture.target_port)).await.unwrap();
        let mut request = tonic::Request::new(database::AbortRequest { transaction_id: fixture.id.as_bytes().to_vec() });
        request.metadata_mut().insert("x-reboot-state-ref", "target".parse().unwrap());
        request.set_timeout(Duration::from_millis(100));
        assert!(client.abort(request).await.is_err(), "direct Abort bypassed handler barrier");
        let mut request = tonic::Request::new(database::PrepareRequest { transaction_id: fixture.id.as_bytes().to_vec(), ..Default::default() });
        request.metadata_mut().insert("x-reboot-state-ref", "target".parse().unwrap());
        request.set_timeout(Duration::from_millis(100));
        assert!(client.prepare(request).await.is_err(), "direct Prepare bypassed handler barrier");
    });
    assert!(!barrier.with_extension("handler-dropped").exists());
    assert!(fixture.rpc(false, "Apply", 0, Duration::from_millis(100)).is_err(), "parked handler lease released early");
    fixture.states(5, 20);
    std::fs::write(barrier.with_extension("release"), b"finish actual handler").unwrap();
    fixture.runtime.block_on(remote).unwrap().unwrap();
    await_marker(&barrier.with_extension("handler-dropped"), &mut target);
    await_marker(&terminal, &mut target);
    assert_eq!(fixture.rpc(false, "Apply", 0, Duration::from_secs(2)).unwrap(), 20);
    assert_eq!(fixture.rpc(true, "Apply", 0, Duration::from_secs(2)).unwrap(), 5);
    fixture.states(5, 20);
    DistributedTasks::stop(&mut root);
    DistributedTasks::stop(&mut target);
    fixture.planner.stop();
}

#[test]
#[ignore = "requires REBOOT_NATIVE2PC_CXX_DATABASE real C++ Database/RocksDB"]
fn registered_preload_watch_is_unavailable_and_early_drop_has_no_local_capability() {
    let fixture = DistributedTasks::new();
    let barrier = fixture.markers.path().join("load-pending");
    let mut command = fixture.command(true);
    command.env("REBOOT_TEST_REGISTERED_LOAD_PENDING", &barrier);
    let mut root = fixture.spawn(&mut command, "root-log");
    wait(fixture.root_port);
    assert_eq!(fixture.rpc(true, "Query", 0, Duration::from_secs(1)).unwrap(), 5);
    let address = format!("http://127.0.0.1:{}", fixture.root_port);
    let pending = fixture.runtime.spawn(async move {
        let mut client = tonic::client::Grpc::new(tonic::transport::Endpoint::from_shared(address).unwrap().connect_lazy());
        client.ready().await.unwrap();
        let mut request = tonic::Request::new(TaskQueryRequest { amount: 1 });
        request.metadata_mut().insert("x-reboot-state-ref", "root".parse().unwrap());
        request.set_timeout(Duration::from_millis(700));
        client.unary::<_, TaskQueryResponse, _>(request, "/tests.reboot.protoc.TransactionCounterWritesMethods/Increment".parse().unwrap(), tonic::codec::ProstCodec::default()).await
    });
    await_marker(&barrier, &mut root);
    assert!(barrier.with_extension("registered").exists());
    fixture.runtime.block_on(async {
        let mut client = database::coordinator_client::CoordinatorClient::connect(format!("http://127.0.0.1:{}", fixture.root_port)).await.unwrap();
        let error = client.watch(database::WatchRequest { transaction_id: fixture.id.as_bytes().to_vec(),
            state_type: "tests.reboot.protoc.TransactionCounter".into(), state_ref: "root".into() }).await.unwrap_err();
        assert_eq!(error.code(), tonic::Code::Unavailable, "registration is not a terminal decision");
    });
    assert!(fixture.runtime.block_on(pending).unwrap().is_err());
    await_marker(&barrier.with_extension("future-dropped"), &mut root);
    assert!(fixture.decision().is_none(), "unfinished local Load never fabricates admitted capability or Abort");
    std::fs::write(barrier.with_extension("release"), b"later admissions allowed").unwrap();
    assert_eq!(fixture.rpc(true, "Apply", 0, Duration::from_secs(1)).unwrap(), 5);
    assert!(root.try_wait().unwrap().is_none());
    fixture.states(5, 20);
    DistributedTasks::stop(&mut root);
    fixture.planner.stop();
}

fn live_registered_abandonment(caught: bool) {
    let mut fixture = DistributedTasks::new();
    let barrier = fixture.markers.path().join("staged-no-trailers");
    let terminal = fixture.markers.path().join("watched-terminal");
    let caught_marker = fixture.markers.path().join("caught");
    let mut command = fixture.command(false);
    command.args(["--live-watch", "--watch-coordinator-state-ref", "root"])
        .env("REBOOT_TEST_LIVE_INBOUND_RESPONSE", &barrier)
        .env("REBOOT_TEST_TARGET_WATCH_TERMINALIZED", &terminal);
    if caught { command.env("REBOOT_TEST_LIVE_INBOUND_RESPONSE_ERROR", "1"); }
    let mut target = fixture.spawn(&mut command, "target-log");
    wait(fixture.target_port);
    assert_eq!(fixture.rpc(false, "Apply", 0, Duration::from_secs(1)).unwrap(), 20);
    let mut command = fixture.command(true);
    if caught { command.args(["--catch-outbound-error", "--outbound-error-marker", caught_marker.to_str().unwrap()]); }
    let mut root = fixture.spawn(&mut command, "root-log");
    wait(fixture.root_port);
    let error = fixture.rpc(true, "Increment", 7, Duration::from_millis(500)).unwrap_err();
    if !caught { assert!(matches!(error.code(), tonic::Code::Cancelled | tonic::Code::DeadlineExceeded), "{error}"); }
    assert!(barrier.exists(), "remote effects must actually stage before trailers are lost");
    if caught { assert!(caught_marker.exists(), "actual handler catch branch not exercised"); }
    await_marker(&barrier.with_extension("future-dropped"), &mut target);
    await_marker(&terminal, &mut target);
    assert_eq!(fixture.decision().unwrap().outcome, database::transaction_coordinator_decision::Outcome::Abort as i32);
    assert!(root.try_wait().unwrap().is_none(), "acknowledged abandonment must not fail root host");
    assert!(target.try_wait().unwrap().is_none(), "participant Watch must remain supervised and live");
    // One tested exclusive mutation per actor, no generic Unavailable retries.
    assert_eq!(fixture.rpc(false, "Apply", 0, Duration::from_secs(2)).unwrap(), 20);
    assert_eq!(fixture.rpc(true, "Apply", 0, Duration::from_secs(2)).unwrap(), 5);
    fixture.states(5, 20);
    for db in [&fixture.root_db, &fixture.target_db] {
        assert!(fixture.runtime.block_on(pending_tasks(&db.endpoint())).is_empty());
    }
    DistributedTasks::stop(&mut root);
    DistributedTasks::stop(&mut target);
    fixture.root_db.restart();
    fixture.target_db.restart();
    assert_eq!(fixture.decision().unwrap().outcome, database::transaction_coordinator_decision::Outcome::Abort as i32);
    fixture.states(5, 20);
    fixture.planner.stop();
}
