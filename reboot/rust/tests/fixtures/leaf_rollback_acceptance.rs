// Actual generated adapter -> Tonic rich error -> generated client, real RocksDB.
fn rollback_leaf_command(tree: &SupervisedTree) -> Command {
    let original = tree.command(1);
    let mut command = Command::new(original.get_program());
    let mut args = original.get_args();
    while let Some(arg) = args.next() {
        if arg == "--tree-next" { args.next(); continue; }
        command.arg(arg);
    }
    for (key, value) in original.get_envs() {
        if let Some(value) = value { command.env(key, value); }
    }
    command.args(["--rollback-leaf", tree.marker(1, "private-effects").to_str().unwrap()]);
    command
}
fn leaf_rollback_scenario(abort: bool, deadline: bool) { leaf_rollback_scenario_with_handler(abort, deadline, false); }
fn leaf_rollback_scenario_with_handler(abort: bool, deadline: bool, legacy: bool) {
    let mut tree = SupervisedTree::new();
    let c = tree.spawn(2, &mut tree.command(2));
    let mut leaf = rollback_leaf_command(&tree);
    if legacy { leaf.arg("--rollback-legacy-handler"); }
    let b = tree.spawn(1, &mut leaf);
    let caught = tree.marker(0, "caught");
    let mut root_command = tree.command(0);
    root_command.args(["--rollback-catch", caught.to_str().unwrap()]);
    if abort { root_command.arg("--rollback-root-abort"); }
    let a = tree.spawn(0, &mut root_command);
    let mut hosts = [a, b, c];
    let root_port = tree.ports[0];
    let call = tree.runtime.spawn(async move {
        let channel = tonic::transport::Endpoint::from_shared(format!("http://127.0.0.1:{root_port}")).unwrap().connect().await.unwrap();
        let mut grpc = tonic::client::Grpc::new(channel);
        grpc.ready().await.unwrap();
        let mut request = tonic::Request::new(TaskQueryResponse { value: 7 });
        request.metadata_mut().insert("x-reboot-state-ref", "root".parse().unwrap());
        request.set_timeout(if deadline { Duration::from_millis(700) } else { Duration::from_secs(5) });
        let response: Result<tonic::Response<TaskQueryResponse>, tonic::Status> = grpc.unary(request,
            http::uri::PathAndQuery::from_static("/tests.reboot.protoc.TransactionCounterWritesMethods/Increment"),
            tonic::codec::ProstCodec::default()).await;
        response.map(|r| r.into_inner().value)
    });
    let wait = std::time::Instant::now() + Duration::from_secs(4);
    while !caught.exists() {
        assert!(std::time::Instant::now() < wait, "typed catch missing; root={}, leaf={}",
            std::fs::read_to_string(tree.marker(0, "stderr")).unwrap(),
            std::fs::read_to_string(tree.marker(1, "stderr")).unwrap());
        std::thread::sleep(Duration::from_millis(5));
    }
    assert!(!std::fs::read(tree.marker(1, "private-effects")).unwrap().is_empty());
    if legacy { assert!(std::path::PathBuf::from(format!("{}.legacy-handler", tree.marker(1, "private-effects").display())).exists()); }
    // A genuine reader must be admitted after downgrade, before root Prepare.
    assert_eq!(tree.rpc(1, "Query", 0, Duration::from_millis(300)).unwrap(), 20);
    assert_eq!(tree.rpc(1, "Apply", 0, Duration::from_millis(100)).unwrap_err().code(), tonic::Code::Cancelled);
    assert!(tree.decision().is_none());
    tree.states([5, 20, 40]);
    if !deadline { std::fs::write(format!("{}.release", caught.display()), b"release").unwrap(); }
    let result = tree.runtime.block_on(call).unwrap();
    if abort || deadline {
        assert!(result.is_err());
        tree.abort_and_readmit(&mut hosts);
    } else {
        assert_eq!(result.unwrap(), 12);
        tree.root_members("target");
        let decision = tree.decision().unwrap();
        assert_eq!(decision.outcome, database::transaction_coordinator_decision::Outcome::Commit as i32);
        assert_eq!(tree.rpc(1, "Apply", 0, Duration::from_secs(2)).unwrap(), 20);
        tree.states([12, 20, 40]);
    }
    SupervisedTree::stop(&mut hosts);
    tree.restart();
    tree.states(if abort || deadline { [5, 20, 40] } else { [12, 20, 40] });
}
#[test]
#[ignore = "requires real C++ Database/RocksDB"]
fn leaf_rollback_failclosed_error_matrix() {
    for vector in ["missing", "malformed", "writer", "foreign", "wrong-type", "wrong-ref", "extra", "overlap", "multiple", "conflict", "system", "malformed-rich", "unknown", "transport"] {
        let mut tree = SupervisedTree::new();
        let c = tree.spawn(2, &mut tree.command(2));
        let mut leaf = rollback_leaf_command(&tree);
        leaf.env("REBOOT_TEST_ROLLBACK_ERROR_VECTOR", vector);
        let b = tree.spawn(1, &mut leaf);
        let mut root = tree.command(0);
        root.args(["--catch-outbound-error", "--outbound-error-marker", tree.marker(0, "uncertain-caught").to_str().unwrap()]);
        let a = tree.spawn(0, &mut root);
        let mut hosts = [a, b, c];
        let result = tree.rpc(0, "Increment", 7, Duration::from_secs(3));
        assert!(result.is_err(), "{vector} unexpectedly committed");
        let caught = std::fs::read_to_string(tree.marker(0, "uncertain-caught")).unwrap_or_else(|error| panic!("{vector} did not expose caught failclosed error: {error}"));
        assert_eq!(caught, "caught uncertain generated outbound, empty membership");
        let variant = std::fs::read_to_string(format!("{}.variant", tree.marker(0, "uncertain-caught").display())).unwrap();
        let expected = match vector { "multiple" => "TransactionLimitExceeded(", "system" => "System(", _ => "Grpc(" };
        assert!(variant.contains(expected), "{vector} decoded as unexpected variant: {variant}");
        tree.abort_and_readmit(&mut hosts);
        SupervisedTree::stop(&mut hosts);
        tree.restart();
        tree.states([5, 20, 40]);
    }
}
#[test]
#[ignore = "requires real C++ Database/RocksDB"]
fn leaf_rollback_catch_commit_readers_writers_restart() { leaf_rollback_scenario(false, false); }
#[test]
#[ignore = "requires real C++ Database/RocksDB"]
fn leaf_rollback_legacy_status_catch_commit_readers_writers_restart() { leaf_rollback_scenario_with_handler(false, false, true); }
#[test]
#[ignore = "requires real C++ Database/RocksDB"]
fn leaf_rollback_root_abort_cleanup_restart() { leaf_rollback_scenario(true, false); }
#[test]
#[ignore = "requires real C++ Database/RocksDB"]
fn leaf_rollback_root_deadline_cleanup_restart() { leaf_rollback_scenario(false, true); }
