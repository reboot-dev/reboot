// Sequential distinct root-star, never an intersecting sibling-subtree policy.
impl SupervisedTree {
    fn star_command(&self, actor: usize, at: i64) -> Command {
        let original = self.task_command(actor, at);
        let args: Vec<_> = original.get_args().map(|s| s.to_os_string()).collect();
        let mut c = Command::new(original.get_program());
        let mut i = 0;
        while i < args.len() {
            if args[i] == "--tree-next" { i += 2; continue; }
            if args[i] == "--role" && actor == 1 {
                c.args(["--role", "target"]); i += 2; continue;
            }
            c.arg(&args[i]); i += 1;
        }
        for (key, value) in original.get_envs() {
            if let Some(value) = value { c.env(key, value); }
        }
        c.args(["--sequential-root-star", "--star-resolver-log", self.marker(actor,"resolver").to_str().unwrap()]);
        if actor == 0 { c.args(["--star-first", &self.refs[1], "--star-second", &self.refs[2],
            "--star-confirmed", self.marker(0, "confirmed").to_str().unwrap()]); }
        c
    }
    fn sibling_paths(&self) {
        assert_ne!(self.children[0], self.children[1], "actual host-supplied child IDs differ");
        for actor in 0..3 {
            let actual: Vec<Uuid> = std::fs::read_to_string(self.marker(actor, "path")).unwrap()
                .lines().map(|s| Uuid::parse_str(s).unwrap()).collect();
            let expected = if actor == 0 { vec![self.root] } else { vec![self.root, self.children[actor - 1]] };
            assert_eq!(actual, expected, "actual star inbound path");
            assert_eq!(std::fs::read_to_string(self.marker(actor, "path.coordinator")).unwrap(),
                format!("tests.reboot.protoc.TransactionCounter\n{}", self.refs[0]));
            if actor > 0 { assert!(std::fs::read_to_string(self.marker(actor, "members")).unwrap().is_empty(), "star leaf has descendants"); }
        }
    }
    fn star_preparing_members(&self) {
        self.runtime.block_on(async {
            let mut db = database::database_client::DatabaseClient::connect(self.databases[0].endpoint()).await.unwrap();
            let mut recovery = db.recover(database::RecoverRequest { shard_ids: vec!["s000000000".into()], skip_idempotent_mutations: true, ..Default::default() }).await.unwrap().into_inner();
            let mut records = Vec::new();
            while let Some(batch) = recovery.message().await.unwrap() { records.extend(batch.transaction_coordinators); }
            assert_eq!(records.len(), 1);
            let record = &records[0].1;
            assert!(record.preparing);
            let participants = record.participants.as_ref().unwrap();
            let mut actual = participants.should_commit["tests.reboot.protoc.TransactionCounter"].state_refs.clone();
            actual.sort(); let mut expected = self.refs.to_vec(); expected.sort();
            assert_eq!(actual, expected, "canonical durable preparing membership includes A+B+C writers");
            assert!(participants.read_only.is_empty());
        });
    }
}
#[test]
#[ignore = "requires real C++ Database/RocksDB"]
fn sequential_star_reader_writer_atomic_commit_delayed_completed_restart() {
    let mut tree =
        SupervisedTree::with_refs(["star-task-a", "star-task-b", "star-task-c"].map(|id| {
            reboot_rust_schema::state_ref::StateRef::from_id(
                "tests.reboot.protoc.TransactionCounter",
                id,
            )
            .unwrap()
            .to_string()
        }));
    let at = i64::try_from(
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs(),
    )
    .unwrap()
        + 10;
    let mut commands = std::array::from_fn::<_, 3, _>(|actor| tree.star_command(actor, at));
    let parked = tree.marker(0, "after-remote");
    commands[0].env("REBOOT_TEST_ROOT_AFTER_REMOTE", &parked);
    let preparing = tree.marker(0, "canonical-preparing");
    commands[0].env("REBOOT_TEST_STAR_BEFORE_PREPARE_FANOUT", &preparing);
    for command in &mut commands {
        command.arg("--tree-typed-wait");
    }
    let c = tree.spawn(2, &mut commands[2]);
    let b = tree.spawn(1, &mut commands[1]);
    let a = tree.spawn(0, &mut commands[0]);
    let mut hosts = [a, b, c];
    let runtime = tree.runtime.handle().clone();
    // Keep the tested mutation single-shot and inspect staging while it is live.
    let root_port = tree.ports[0];
    let root_ref = tree.refs[0].clone();
    let call = runtime.spawn(async move {
        let mut client = tonic::client::Grpc::new(
            tonic::transport::Endpoint::from_shared(format!("http://127.0.0.1:{root_port}"))
                .unwrap()
                .connect_lazy(),
        );
        client.ready().await.unwrap();
        let mut request = tonic::Request::new(TaskQueryRequest { amount: 7 });
        request
            .metadata_mut()
            .insert("x-reboot-state-ref", root_ref.parse().unwrap());
        request.set_timeout(Duration::from_secs(15));
        client
            .unary::<_, TaskQueryResponse, _>(
                request,
                "/tests.reboot.protoc.TransactionCounterWritesMethods/Increment"
                    .parse()
                    .unwrap(),
                tonic::codec::ProstCodec::default(),
            )
            .await
            .unwrap()
            .into_inner()
            .value
    });
    await_marker(&parked, &mut hosts[0]);
    for (actor, host) in hosts.iter_mut().enumerate().skip(1) {
        assert!(!tree.marker(actor, "hint").exists(), "premature inbound dispatch hint");
        let tasks = tree.scheduled_records(actor);
        assert_eq!(tasks.len(), 4);
        assert!(
            tree.records(actor, &tasks).is_empty(),
            "staged tasks must not be committed"
        );
        assert!(
            !tree.marker(actor, "tasks.invocations").exists(),
            "staged reader invoked"
        );
        assert!(
            !tree.marker(actor, "tasks.writer-invocations").exists(),
            "staged writer invoked"
        );
        assert!(
            host.try_wait().unwrap().is_none(),
            "staged participant host failed"
        );
    }
    assert!(tree.decision().is_none());
    std::fs::write(parked.with_extension("release"), b"release").unwrap();
    await_marker(&preparing, &mut hosts[0]);
    tree.star_preparing_members();
    for actor in 1..3 {
        assert!(tree.records(actor, &tree.scheduled_records(actor)).is_empty());
        assert!(!tree.marker(actor, "hint").exists());
    }
    std::fs::write(preparing.with_extension("release"), b"release").unwrap();
    assert_eq!(tree.runtime.block_on(call).unwrap(), 12);
    for actor in 0..3 {
        std::fs::write(
            tree.marker(actor, "tasks.wait-ready"),
            b"actual root Commit ACK",
        )
        .unwrap();
    }
    tree.sibling_paths();
    tree.root_members(&format!("{}\n{}", tree.refs[1], tree.refs[2]));
    let tasks: Vec<_> = (0..3).map(|actor| tree.scheduled_records(actor)).collect();
    // Root Commit publishes tasks; it does not acknowledge their completion.
    // This restart covers immediate Completed tasks and delayed Pending tasks,
    // not the replay window between handler entry and durable CompleteTask.
    for (actor, actor_tasks) in tasks.iter().enumerate() {
        for task in actor_tasks.iter().filter(|task| task.timestamp.is_none()) {
            tree.wait_task(actor, task);
        }
    }
    // Check all participants only after every immediate task has completed.
    for (actor, actor_tasks) in tasks.iter().enumerate() {
        let records = tree.records(actor, actor_tasks);
        assert_eq!(
            records.iter().filter(|task| task.timestamp.is_none()
                && task.status == database::task::Status::Completed as i32).count(),
            2,
            "immediate tasks must be durably Completed before restart"
        );
        assert_eq!(records.iter().filter(|t| t.timestamp.is_some() && t.status == database::task::Status::Pending as i32).count(),2,
            "delayed tasks must be Pending before actual host/sidecar restart");
    }
    SupervisedTree::stop(&mut hosts);
    tree.restart();
    let mut pending_commands = std::array::from_fn::<_,3,_>(|actor| tree.star_command(actor,at));
    for command in &mut pending_commands { command.arg("--tree-typed-wait"); }
    let c = tree.spawn(2,&mut pending_commands[2]);
    let b = tree.spawn(1,&mut pending_commands[1]);
    let a = tree.spawn(0,&mut pending_commands[0]);
    let mut hosts = [a,b,c];
    for actor in 0..3 {
        for task in &tasks[actor] {
            let id = task.task_id.as_ref().unwrap();
            assert_eq!(id.state_ref, tree.refs[actor]);
            for other in 0..3 {
                if actor != other {
                    assert!(
                        tree.records(other, std::slice::from_ref(task)).is_empty(),
                        "foreign participant task stored"
                    );
                }
            }
            let value = tree.wait_task(actor, task);
            if task.method == "Apply" {
                assert!([[15, 18], [30, 33], [50, 53]][actor].contains(&value));
            }
            if let Some(timestamp) = task.timestamp {
                assert_eq!(timestamp.seconds, at);
            }
        }
    }
    for (actor, host) in hosts.iter_mut().enumerate() {
        await_marker(&tree.marker(actor, "tasks.typed-wait"), host);
    }
    tree.states([18, 33, 53]);
    let completed: Vec<_> = (0..3)
        .map(|actor| tree.records(actor, &tasks[actor]))
        .collect();
    for records in &completed {
        assert_eq!(records.len(), 4);
        assert!(
            records
                .iter()
                .all(|t| t.status == database::task::Status::Completed as i32)
        );
    }
    let logs = tree.task_logs();
    assert!(logs.iter().all(|log| log.lines().count() == 2),
        "sequential-star POST-RESTART logs (collector order): {:?}",
        logs.iter().enumerate().map(|(index, log)|
            (index, log.lines().count(), log)).collect::<Vec<_>>());
    SupervisedTree::stop(&mut hosts);
    tree.restart();
    let mut commands = std::array::from_fn::<_, 3, _>(|actor| tree.star_command(actor, at));
    let c = tree.spawn(2, &mut commands[2]);
    let b = tree.spawn(1, &mut commands[1]);
    let a = tree.spawn(0, &mut commands[0]);
    let mut hosts = [a, b, c];
    for actor in 0..3 {
        assert_eq!(tree.records(actor, &tasks[actor]), completed[actor]);
        for task in &tasks[actor] {
            tree.wait_task(actor, task);
        }
    }
    std::thread::sleep(Duration::from_millis(350));
    assert_eq!(
        tree.task_logs(),
        logs,
        "Completed tasks replayed after RocksDB/host restart"
    );
    for (actor, host) in hosts.iter_mut().enumerate() {
        await_marker(&tree.marker(actor, "tasks.typed-wait"), host);
    }
    tree.states([18, 33, 53]);
    SupervisedTree::stop(&mut hosts);
    tree.planner.stop();
}

#[test]
#[ignore = "requires real C++ Database/RocksDB"]
fn sequential_star_second_child_declared_caught_aborts_confirmed_b() {
    for legacy in [false, true] {
        let mut tree = SupervisedTree::with_refs(["star-fail-a", "star-fail-b", "star-fail-c"].map(|id|
            reboot_rust_schema::state_ref::StateRef::from_id("tests.reboot.protoc.TransactionCounter", id).unwrap().to_string()));
        let mut cc = tree.star_command(2, 0);
        cc.args(["--rollback-leaf", tree.marker(2, "rollback-private").to_str().unwrap()]);
        if legacy { cc.arg("--rollback-legacy-handler"); }
        let c = tree.spawn(2, &mut cc);
        let b = tree.spawn(1, &mut tree.star_command(1, 0));
        let mut ac = tree.star_command(0, 0);
        ac.args(["--star-catch-second", "--outbound-error-marker", tree.marker(0, "catch").to_str().unwrap()]);
        let a = tree.spawn(0, &mut ac);
        let mut hosts = [a, b, c];
        tree.rpc(0, "Increment", 7, Duration::from_secs(5)).unwrap_err();
        await_marker(&tree.marker(0, "catch"), &mut hosts[0]);
        assert!(std::fs::read_to_string(tree.marker(0, "catch")).unwrap().contains("second-child caught with B retained"));
        assert_eq!(std::fs::read_to_string(tree.marker(0, "members")).unwrap(), tree.refs[1]);
        tree.abort_and_readmit(&mut hosts);
        let b_tasks = tree.scheduled_records(1);
        assert!(tree.records(1, &b_tasks).is_empty(), "confirmed B tasks survived root Abort");
        assert!(!tree.marker(1, "tasks.invocations").exists());
        assert!(!tree.marker(1, "tasks.writer-invocations").exists());
        for actor in 0..3 { assert!(!tree.marker(actor, "hint").exists()); }
        SupervisedTree::stop(&mut hosts); tree.restart(); tree.states([5,20,40]); tree.planner.stop();
    }
}

#[test]
#[ignore = "requires real C++ Database/RocksDB"]
fn sequential_star_unknown_c_lost_success_or_deadline_actual_original_a_watch() {
    for error in [false, true] {
        let mut tree = SupervisedTree::with_refs(["star-fail-a", "star-fail-b", "star-fail-c"].map(|id|
            reboot_rust_schema::state_ref::StateRef::from_id("tests.reboot.protoc.TransactionCounter", id).unwrap().to_string()));
        let response = tree.marker(2, "response");
        let lookup = tree.marker(2, "lookup");
        let mut cc = tree.star_command(2, 0);
        cc.env("REBOOT_TEST_LIVE_INBOUND_RESPONSE", &response);
        cc.env("REBOOT_TEST_LIVE_WATCH_BEFORE_LOOKUP", &lookup);
        if error { cc.env("REBOOT_TEST_LIVE_INBOUND_RESPONSE_ERROR", "1"); }
        let c = tree.spawn(2, &mut cc);
        let b = tree.spawn(1, &mut tree.star_command(1, 0));
        let mut ac = tree.star_command(0, 0);
        if error { ac.args(["--star-catch-second", "--outbound-error-marker", tree.marker(0, "catch").to_str().unwrap()]); }
        let a = tree.spawn(0, &mut ac);
        let mut hosts = [a, b, c];
        tree.rpc(0, "Increment", 7, Duration::from_millis(900)).unwrap_err();
        await_marker(&response.with_extension("future-dropped"), &mut hosts[2]);
        await_marker(&lookup, &mut hosts[2]);
        let deadline = std::time::Instant::now() + Duration::from_secs(4);
        while tree.decision().is_none() { assert!(std::time::Instant::now() < deadline); std::thread::sleep(Duration::from_millis(10)); }
        assert_eq!(tree.decision().unwrap().outcome, database::transaction_coordinator_decision::Outcome::Abort as i32);
        assert!(tree.decision().unwrap().participants.is_none(), "explicit Abort does not fabricate a preparing participant record");
        assert_eq!(std::fs::read_to_string(tree.marker(0,"confirmed")).unwrap(),
            format!("tests.reboot.protoc.TransactionCounter|{}|false",tree.refs[1]),
            "confirmed B retained while unknown C is absent");
        assert!(matches!(tree.rpc(2, "Apply", 0, Duration::from_millis(150)), Err(e) if matches!(e.code(),tonic::Code::Cancelled|tonic::Code::DeadlineExceeded)), "unknown C lease released before actual Watch");
        assert!(tree.records(2, &tree.scheduled_records(2)).is_empty());
        assert!(!tree.marker(2,"tasks.invocations").exists());
        assert!(!tree.marker(2,"tasks.writer-invocations").exists());
        assert_eq!(std::fs::read_to_string(tree.marker(2,"path.coordinator")).unwrap(), format!("tests.reboot.protoc.TransactionCounter\n{}",tree.refs[0]));
        std::fs::write(lookup.with_extension("release"), b"real Watch lookup").unwrap();
        await_marker(&tree.marker(2,"terminal"), &mut hosts[2]);
        tree.abort_and_readmit(&mut hosts);
        for actor in 1..3 { assert!(tree.records(actor, &tree.scheduled_records(actor)).is_empty()); }
        SupervisedTree::stop(&mut hosts); tree.restart(); tree.states([5,20,40]); tree.planner.stop();
    }
}

#[test]
#[ignore = "requires real C++ Database/RocksDB"]
fn sequential_star_actual_repeat_overlap_and_leaf_child_rejected_before_resolver() {
    for vector in ["repeat","overlap","leaf"] {
        let mut tree = SupervisedTree::with_refs(["star-admit-a","star-admit-b","star-admit-c"].map(|id|
            reboot_rust_schema::state_ref::StateRef::from_id("tests.reboot.protoc.TransactionCounter",id).unwrap().to_string()));
        let mut bc = tree.star_command(1,0);
        if vector == "leaf" { bc.args(["--star-leaf-call","--outbound-error-marker",tree.marker(1,"deny").to_str().unwrap()]); }
        let c = tree.spawn(2,&mut tree.star_command(2,0));
        let b = tree.spawn(1,&mut bc);
        let mut ac = tree.star_command(0,0);
        if vector != "leaf" { ac.args([if vector == "repeat" {"--star-repeat-first"} else {"--star-overlap"},
            "--outbound-error-marker",tree.marker(0,"deny").to_str().unwrap()]); }
        let a=tree.spawn(0,&mut ac); let mut hosts=[a,b,c];
        tree.rpc(0,"Increment",7,Duration::from_secs(4)).unwrap_err();
        let actor = usize::from(vector == "leaf"); await_marker(&tree.marker(actor,"deny"),&mut hosts[actor]);
        let calls = std::fs::read_to_string(tree.marker(0,"resolver")).unwrap_or_default();
        assert_eq!(calls.lines().map(str::to_owned).collect::<Vec<_>>(),if vector == "overlap" {vec![]} else {vec![format!("tests.reboot.protoc.TransactionCounter|{}",tree.refs[1])]},
            "repeat or overlap entered resolver");
        assert!(!tree.marker(1,"resolver").exists(),"star leaf descendant entered resolver");
        assert!(!tree.marker(2,"path").exists(),"denied C RPC reached handler");
        tree.abort_and_readmit(&mut hosts);
        if vector == "repeat" { assert!(tree.records(1,&tree.scheduled_records(1)).is_empty()); }
        SupervisedTree::stop(&mut hosts);tree.restart();tree.states([5,20,40]);tree.planner.stop();
    }
}
#[test]
#[ignore = "requires real C++ Database/RocksDB"]
fn sequential_star_cancel_second_resolver_destroys_future_and_retains_b_cleanup() {
    let mut tree=SupervisedTree::with_refs(["star-resolve-a","star-resolve-b","star-resolve-c"].map(|id|
        reboot_rust_schema::state_ref::StateRef::from_id("tests.reboot.protoc.TransactionCounter",id).unwrap().to_string()));
    let c=tree.spawn(2,&mut tree.star_command(2,0));
    let b=tree.spawn(1,&mut tree.star_command(1,0));
    let mut ac=tree.star_command(0,0); let park=tree.marker(0,"resolver-park");
    ac.args(["--star-resolver-park",park.to_str().unwrap()]);
    let a=tree.spawn(0,&mut ac); let mut hosts=[a,b,c];
    tree.rpc(0,"Increment",7,Duration::from_millis(900)).unwrap_err();
    await_marker(&std::path::PathBuf::from(format!("{}.dropped",park.display())),&mut hosts[0]);
    assert!(!tree.marker(2,"path").exists(),"canceled C resolver must not enter C RPC");
    assert_eq!(std::fs::read_to_string(tree.marker(0,"confirmed")).unwrap(),
        format!("tests.reboot.protoc.TransactionCounter|{}|false",tree.refs[1]));
    tree.abort_and_readmit(&mut hosts);
    assert!(tree.records(1,&tree.scheduled_records(1)).is_empty());
    SupervisedTree::stop(&mut hosts);tree.restart();tree.states([5,20,40]);tree.planner.stop();
}

// These controls retain the outer A RPC through handler success/handoff. Root
// client deadline and generated C error disposition are not causes of Abort.
fn supplied_scope_uncertainty_scenario(lost: bool) {
    let mut tree = SupervisedTree::with_refs(["authority-a", "authority-b", "authority-c"].map(|id|
        reboot_rust_schema::state_ref::StateRef::from_id("tests.reboot.protoc.TransactionCounter", id).unwrap().to_string()));
    let response = tree.marker(2, "response");
    let lookup = tree.marker(2, "lookup");
    let mut cc = tree.star_command(2, 0);
    if lost {
        cc.env("REBOOT_TEST_LIVE_INBOUND_RESPONSE", &response);
        cc.env("REBOOT_TEST_LIVE_WATCH_BEFORE_LOOKUP", &lookup);
    }
    let c = tree.spawn(2, &mut cc);
    let b = tree.spawn(1, &mut tree.star_command(1, 0));
    let mut ac = tree.star_command(0, 0);
    ac.args([if lost { "--star-raw-lost-second" } else { "--star-unissued-second" },
        "--outbound-error-marker", tree.marker(0, "success-attempt").to_str().unwrap()]);
    if lost { ac.args(["--star-loss-ready", response.to_str().unwrap()]); }
    let a = tree.spawn(0, &mut ac);
    let mut hosts = [a,b,c];
    let result = tree.rpc(0, "Increment", 7, Duration::from_secs(10));
    // Persist actual decision data in the test log before the safety assertion;
    // the isolated uncertainty mutation must show A+B Commit here, not a marker.
    println!("SUPPLIED_SCOPE lost={lost} rpc={result:?} decision={:?}", tree.decision());
    let error = result.expect_err("unsettled supplied C scope must deny A+B Commit");
    assert!(!matches!(error.code(), tonic::Code::Cancelled | tonic::Code::DeadlineExceeded), "outer client/root cancellation must not cause this rejection");
    await_marker(&tree.marker(0,"success-attempt"), &mut hosts[0]);
    assert_eq!(std::fs::read_to_string(tree.marker(0,"success-attempt")).unwrap(), "handler attempts success without doom; genuine B retained, C unsettled");
    assert_eq!(std::fs::read_to_string(tree.marker(0,"confirmed")).unwrap(), format!("tests.reboot.protoc.TransactionCounter|{}|false",tree.refs[1]));
    if lost {
        await_marker(&response.with_extension("future-dropped"), &mut hosts[2]);
        await_marker(&lookup, &mut hosts[2]);
        assert!(matches!(tree.rpc(2,"Apply",0,Duration::from_millis(150)),Err(e) if matches!(e.code(),tonic::Code::Cancelled|tonic::Code::DeadlineExceeded)), "unknown C lease released before actual Watch");
        assert_eq!(std::fs::read_to_string(tree.marker(2,"path.coordinator")).unwrap(),format!("tests.reboot.protoc.TransactionCounter\n{}",tree.refs[0]));
        assert!(tree.records(2,&tree.scheduled_records(2)).is_empty());
        std::fs::write(lookup.with_extension("release"),b"actual original-A Watch").unwrap();
        await_marker(&tree.marker(2,"terminal"), &mut hosts[2]);
    } else {
        assert!(!tree.marker(2,"path").exists(), "unissued C was routed");
        let calls = std::fs::read_to_string(tree.marker(0,"resolver")).unwrap();
        assert_eq!(calls.lines().collect::<Vec<_>>(),vec![format!("tests.reboot.protoc.TransactionCounter|{}",tree.refs[1])]);
    }
    tree.abort_and_readmit(&mut hosts);
    assert!(tree.decision().unwrap().participants.is_none(), "unknown C not fabricated into root handoff");
    assert!(tree.records(1,&tree.scheduled_records(1)).is_empty());
    for actor in 0..3 { assert!(!tree.marker(actor,"hint").exists()); }
    SupervisedTree::stop(&mut hosts); tree.restart(); tree.states([5,20,40]); tree.planner.stop();
}
#[test]
#[ignore = "requires real C++ Database/RocksDB"]
fn sequential_star_supplied_scope_unissued_c_denies_b_only_commit_without_root_cancel() {
    supplied_scope_uncertainty_scenario(false);
}
#[test]
#[ignore = "requires real C++ Database/RocksDB"]
fn sequential_star_supplied_scope_lost_c_response_denies_b_only_commit_without_root_cancel() {
    supplied_scope_uncertainty_scenario(true);
}
