// Participant-local reader AND ordinary-writer tasks through actual A -> B -> C.
impl SupervisedTree {
    fn task_command(&self, actor: usize, at: i64) -> Command {
        let mut command = self.command(actor);
        command.env("REBOOT_TEST_TASK_DISPATCH_HINT", self.marker(actor, "hint"));
        let mut refs = self.refs.iter().collect::<Vec<_>>();
        refs.sort_by_key(|reference| {
            Sha1::digest(legacy_routing_component(reference).as_bytes()).to_vec()
        });
        let index = refs
            .iter()
            .position(|reference| **reference == self.refs[actor])
            .unwrap();
        command.args([
            "--server-id",
            &format!("server-{index}"),
            "--tree-task-owner",
            "--writer-tasks",
            "--task-marker",
            self.marker(actor, "tasks").to_str().unwrap(),
            "--tree-local-tasks",
            self.marker(actor, "tasks").to_str().unwrap(),
            "--tree-tasks-at",
            &at.to_string(),
        ]);
        command
    }
    fn scheduled_records(&self, actor: usize) -> Vec<database::Task> {
        database::LoadResponse::decode(
            std::fs::read(self.marker(actor, "tasks.records"))
                .unwrap()
                .as_slice(),
        )
        .unwrap()
        .tasks
    }
    fn records(&self, actor: usize, tasks: &[database::Task]) -> Vec<database::Task> {
        self.runtime.block_on(async {
            database::database_client::DatabaseClient::connect(self.databases[actor].endpoint())
                .await
                .unwrap()
                .load(database::LoadRequest {
                    actors: vec![],
                    task_ids: tasks.iter().map(|t| t.task_id.clone().unwrap()).collect(),
                })
                .await
                .unwrap()
                .into_inner()
                .tasks
        })
    }
    fn wait_task(&self, actor: usize, task: &database::Task) -> i64 {
        self.runtime.block_on(async {
            let mut client = database::tasks_client::TasksClient::connect(format!(
                "http://127.0.0.1:{}",
                self.ports[actor]
            ))
            .await
            .unwrap();
            let mut request = reader_task_wait_request(task.task_id.clone());
            request.metadata_mut().insert(
                "x-reboot-state-ref",
                task.task_id.as_ref().unwrap().state_ref.parse().unwrap(),
            );
            request.set_timeout(Duration::from_secs(12));
            let result = client.wait(request).await.unwrap().into_inner();
            let database::task_response_or_error::ResponseOrError::Response(response) =
                result.response_or_error.unwrap().response_or_error.unwrap()
            else {
                panic!("task returned error")
            };
            assert_eq!(
                response.type_url,
                "type.googleapis.com/tests.reboot.protoc.TransactionCounterValue"
            );
            TaskQueryResponse::decode(response.value.as_slice())
                .unwrap()
                .value
        })
    }
    fn task_logs(&self) -> Vec<String> {
        (0..3)
            .flat_map(|actor| {
                ["tasks.invocations", "tasks.writer-invocations"]
                    .map(|name| std::fs::read_to_string(self.marker(actor, name)).unwrap())
            })
            .collect()
    }
}
#[test]
#[ignore = "requires real C++ Database/RocksDB"]
fn tree_participant_reader_writer_staged_commit_delayed_completed_restart() {
    let mut tree =
        SupervisedTree::with_refs(["tree-task-a", "tree-task-b", "tree-task-c"].map(|id| {
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
        + 5;
    let mut commands = std::array::from_fn::<_, 3, _>(|actor| tree.task_command(actor, at));
    let parked = tree.marker(0, "after-remote");
    commands[0].env("REBOOT_TEST_ROOT_AFTER_REMOTE", &parked);
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
    assert_eq!(tree.runtime.block_on(call).unwrap(), 12);
    for actor in 0..3 {
        std::fs::write(
            tree.marker(actor, "tasks.wait-ready"),
            b"actual root Commit ACK",
        )
        .unwrap();
    }
    tree.paths();
    tree.root_members(&format!("{}\n{}", tree.refs[1], tree.refs[2]));
    let tasks: Vec<_> = (0..3).map(|actor| tree.scheduled_records(actor)).collect();
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
    assert!(logs.iter().all(|log| log.lines().count() == 2));
    SupervisedTree::stop(&mut hosts);
    tree.restart();
    let mut commands = std::array::from_fn::<_, 3, _>(|actor| tree.task_command(actor, at));
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
fn tree_participant_tasks_commit_decision_target_watch_ready_before_root_recovery() {
    let mut tree =
        SupervisedTree::with_refs(["tree-task-a", "tree-task-b", "tree-task-c"].map(|id| {
            reboot_rust_schema::state_ref::StateRef::from_id(
                "tests.reboot.protoc.TransactionCounter",
                id,
            )
            .unwrap()
            .to_string()
        }));
    let mut cc = tree.task_command(2, 0);
    cc.env(
        "REBOOT_TEST_LIVE_WATCH_BEFORE_LOOKUP",
        tree.marker(2, "lookup"),
    );
    let c = tree.spawn(2, &mut cc);
    let mut bc = tree.task_command(1, 0);
    bc.env(
        "REBOOT_TEST_LIVE_WATCH_BEFORE_LOOKUP",
        tree.marker(1, "lookup"),
    );
    let b = tree.spawn(1, &mut bc);
    let decision = tree.marker(0, "decision");
    let mut ac = tree.task_command(0, 0);
    ac.env("REBOOT_TEST_PAUSE_AFTER_COORDINATOR_PREPARE", &decision);
    let a = tree.spawn(0, &mut ac);
    let mut hosts = [a, b, c];
    let endpoint = format!("http://127.0.0.1:{}", tree.ports[0]);
    let root_ref = tree.refs[0].clone();
    let call = tree.runtime.spawn(async move {
        let mut client = tonic::client::Grpc::new(
            tonic::transport::Endpoint::from_shared(endpoint)
                .unwrap()
                .connect_lazy(),
        );
        client.ready().await.unwrap();
        let mut request = tonic::Request::new(TaskQueryRequest { amount: 7 });
        request
            .metadata_mut()
            .insert("x-reboot-state-ref", root_ref.parse().unwrap());
        client
            .unary::<_, TaskQueryResponse, _>(
                request,
                "/tests.reboot.protoc.TransactionCounterWritesMethods/Increment"
                    .parse()
                    .unwrap(),
                tonic::codec::ProstCodec::default(),
            )
            .await
    });
    await_marker(&decision, &mut hosts[0]);
    tree.runtime.block_on(async {
        let mut client = database::database_client::DatabaseClient::connect(tree.databases[0].endpoint()).await.unwrap();
        let mut stream = client.recover(database::RecoverRequest { shard_ids: vec!["s000000000".into()], skip_idempotent_mutations: true, ..Default::default() }).await.unwrap().into_inner();
        let mut records = Vec::new(); while let Some(batch) = stream.message().await.unwrap() { records.extend(batch.transaction_coordinators); }
        assert_eq!(records.len(), 1);
        assert_eq!(records[0].1.participants.as_ref().unwrap().should_commit["tests.reboot.protoc.TransactionCounter"].state_refs, tree.refs, "full transitive membership must be persisted before terminal fanout");
    });
    tree.paths();
    tree.root_members(&format!("{}\n{}", tree.refs[1], tree.refs[2]));
    assert_eq!(
        tree.decision().unwrap().outcome,
        database::transaction_coordinator_decision::Outcome::Commit as i32
    );
    for (actor, host) in hosts.iter_mut().enumerate() {
        let expected = tree.scheduled_records(actor);
        let prepared = tree.runtime.block_on(async {
            let mut db = database::database_client::DatabaseClient::connect(
                tree.databases[actor].endpoint(),
            )
            .await
            .unwrap();
            let mut stream = db
                .recover(database::RecoverRequest {
                    shard_ids: vec!["s000000000".into()],
                    skip_idempotent_mutations: true,
                    ..Default::default()
                })
                .await
                .unwrap()
                .into_inner();
            let mut transactions = Vec::new();
            while let Some(batch) = stream.message().await.unwrap() {
                transactions.extend(batch.participant_transactions);
            }
            transactions
        });
        assert_eq!(prepared.len(), 1);
        assert!(prepared[0].prepared);
        let mut actual = prepared[0].uncommitted_tasks.clone();
        let mut expected = expected;
        actual.sort_by_key(|t| t.task_id.as_ref().unwrap().task_uuid.clone());
        expected.sort_by_key(|t| t.task_id.as_ref().unwrap().task_uuid.clone());
        assert_eq!(actual, expected, "exact uncommitted local task batch");
        assert!(
            tree.records(actor, &expected).is_empty(),
            "root decision cannot publish participant tasks"
        );
        assert!(!tree.marker(actor, "tasks.invocations").exists());
        assert!(!tree.marker(actor, "tasks.writer-invocations").exists());
        assert!(host.try_wait().unwrap().is_none());
    }
    SupervisedTree::stop(&mut hosts);
    tree.runtime.block_on(call).unwrap().unwrap_err();
    tree.restart();
    let mut cc = tree.task_command(2, 0);
    cc.arg("--recover");
    let mut c = WaitHostGuard(
        cc.stderr(std::fs::File::create(tree.marker(2, "recovery-stderr")).unwrap())
            .spawn()
            .unwrap(),
    );
    wait(tree.ports[2]);
    let mut bc = tree.task_command(1, 0);
    bc.arg("--recover");
    let mut b = WaitHostGuard(
        bc.stderr(std::fs::File::create(tree.marker(1, "recovery-stderr")).unwrap())
            .spawn()
            .unwrap(),
    );
    wait(tree.ports[1]);
    for (actor, host) in [(1, &mut b), (2, &mut c)] {
        await_marker(
            &tree.marker(actor, "terminal").with_extension("watch-ready"),
            host,
        );
    }
    let mut ac = tree.task_command(0, 0);
    ac.arg("--recover");
    let a = tree.spawn(0, &mut ac);
    let mut hosts = [a, b, c];
    for (actor, host) in hosts.iter_mut().enumerate().skip(1) {
        await_marker(&tree.marker(actor, "terminal"), host);
    }
    for actor in 0..3 {
        for task in tree.scheduled_records(actor) {
            tree.wait_task(actor, &task);
        }
    }
    tree.states([18, 33, 53]);
    SupervisedTree::stop(&mut hosts);
    tree.restart();
    tree.states([18, 33, 53]);
    tree.planner.stop();
}

#[test]
#[ignore = "requires real C++ Database/RocksDB"]
fn tree_participant_tasks_confirmed_root_error_and_deadline_abort_all_live() {
    for deadline in [false, true] {
        let mut tree =
            SupervisedTree::with_refs(["tree-task-a", "tree-task-b", "tree-task-c"].map(|id| {
                reboot_rust_schema::state_ref::StateRef::from_id(
                    "tests.reboot.protoc.TransactionCounter",
                    id,
                )
                .unwrap()
                .to_string()
            }));
        let c = tree.spawn(2, &mut tree.task_command(2, 0));
        let b = tree.spawn(1, &mut tree.task_command(1, 0));
        let mut command = tree.task_command(0, 0);
        let barrier = tree.marker(0, "after-remote");
        if deadline {
            command.env("REBOOT_TEST_ROOT_AFTER_REMOTE", &barrier);
        } else {
            command.arg("--tree-handler-error");
        }
        let a = tree.spawn(0, &mut command);
        let mut hosts = [a, b, c];
        let error = tree
            .rpc(0, "Increment", 7, Duration::from_millis(700))
            .unwrap_err();
        if deadline {
            assert!(barrier.exists());
            assert!(matches!(
                error.code(),
                tonic::Code::Cancelled | tonic::Code::DeadlineExceeded
            ));
        } else {
            assert_eq!(error.code(), tonic::Code::InvalidArgument);
        }
        tree.paths();
        tree.root_members(&format!("{}\n{}", tree.refs[1], tree.refs[2]));
        tree.abort_and_readmit(&mut hosts);
        for actor in 0..3 {
            if tree.marker(actor, "tasks.records").exists() {
                assert!(
                    tree.records(actor, &tree.scheduled_records(actor))
                        .is_empty()
                );
            }
            assert!(
                !tree.marker(actor, "tasks.invocations").exists(),
                "Abort reader effect"
            );
            assert!(
                !tree.marker(actor, "tasks.writer-invocations").exists(),
                "Abort writer effect"
            );
        }
        SupervisedTree::stop(&mut hosts);
        tree.restart();
        tree.states([5, 20, 40]);
        assert_eq!(
            tree.decision().unwrap().outcome,
            database::transaction_coordinator_decision::Outcome::Abort as i32
        );
        tree.planner.stop();
    }
}
#[test]
#[ignore = "requires real C++ Database/RocksDB"]
fn tree_participant_tasks_intermediate_lost_trailers_unknown_c_self_watch() {
    for error in [false, true] {
        let mut tree =
            SupervisedTree::with_refs(["tree-task-a", "tree-task-b", "tree-task-c"].map(|id| {
                reboot_rust_schema::state_ref::StateRef::from_id(
                    "tests.reboot.protoc.TransactionCounter",
                    id,
                )
                .unwrap()
                .to_string()
            }));
        let c = tree.spawn(2, &mut tree.task_command(2, 0));
        let barrier = tree.marker(1, "response");
        let mut command = tree.task_command(1, 0);
        command.env("REBOOT_TEST_LIVE_INBOUND_RESPONSE", &barrier);
        if error {
            command.env("REBOOT_TEST_LIVE_INBOUND_RESPONSE_ERROR", "1");
        }
        let b = tree.spawn(1, &mut command);
        let a = tree.spawn(0, &mut tree.task_command(0, 0));
        let mut hosts = [a, b, c];
        tree.rpc(0, "Increment", 7, Duration::from_millis(700))
            .unwrap_err();
        await_marker(&barrier.with_extension("future-dropped"), &mut hosts[1]);
        tree.paths();
        assert!(
            !tree.marker(0, "members").exists(),
            "A must never learn lost B+C trailers"
        );
        tree.abort_and_readmit(&mut hosts);
        for actor in 0..3 {
            if tree.marker(actor, "tasks.records").exists() {
                assert!(
                    tree.records(actor, &tree.scheduled_records(actor))
                        .is_empty()
                );
            }
            assert!(
                !tree.marker(actor, "tasks.invocations").exists(),
                "Abort reader effect"
            );
            assert!(
                !tree.marker(actor, "tasks.writer-invocations").exists(),
                "Abort writer effect"
            );
        }
        for (actor, host) in hosts.iter_mut().enumerate().skip(1) {
            await_marker(&tree.marker(actor, "terminal"), host);
        }
        SupervisedTree::stop(&mut hosts);
        tree.restart();
        tree.states([5, 20, 40]);
        tree.planner.stop();
    }
}
#[test]
#[ignore = "requires real C++ Database/RocksDB"]
fn tree_participant_tasks_b_c_lost_terminal_ack_retains_actual_actor_entry_once_restart() {
    for fault in [1, 2] {
        let mut tree =
            SupervisedTree::with_refs(["tree-task-a", "tree-task-b", "tree-task-c"].map(|id| {
                reboot_rust_schema::state_ref::StateRef::from_id(
                    "tests.reboot.protoc.TransactionCounter",
                    id,
                )
                .unwrap()
                .to_string()
            }));
        let ack = tree.marker(fault, "ack");
        let release = tree.marker(fault, "ack-release");
        let lookup = tree.marker(fault, "lookup");
        let entry = tree.marker(fault, "actor-entry");
        let mut commands = std::array::from_fn::<_, 3, _>(|actor| tree.task_command(actor, 0));
        commands[fault]
            .env("REBOOT_TEST_LOST_PARTICIPANT_COMMIT_ACK", &ack)
            .env("REBOOT_TEST_REMOTE_COMMIT_ACK_RELEASE", &release)
            .env("REBOOT_TEST_LIVE_WATCH_BEFORE_LOOKUP", &lookup)
            .env("REBOOT_TEST_TREE_COMPETITOR_ENTRY", &entry);
        let c = tree.spawn(2, &mut commands[2]);
        let b = tree.spawn(1, &mut commands[1]);
        let a = tree.spawn(0, &mut commands[0]);
        let mut hosts = [a, b, c];
        let endpoint = format!("http://127.0.0.1:{}", tree.ports[0]);
        let root_ref = tree.refs[0].clone();
        let call = tree.runtime.spawn(async move {
            let mut client = tonic::client::Grpc::new(
                tonic::transport::Endpoint::from_shared(endpoint)
                    .unwrap()
                    .connect_lazy(),
            );
            client.ready().await.unwrap();
            let mut request = tonic::Request::new(TaskQueryRequest { amount: 7 });
            request
                .metadata_mut()
                .insert("x-reboot-state-ref", root_ref.parse().unwrap());
            request.set_timeout(Duration::from_secs(10));
            client
                .unary::<_, TaskQueryResponse, _>(
                    request,
                    "/tests.reboot.protoc.TransactionCounterWritesMethods/Increment"
                        .parse()
                        .unwrap(),
                    tonic::codec::ProstCodec::default(),
                )
                .await
        });
        await_marker(&ack, &mut hosts[fault]);
        await_marker(&lookup, &mut hosts[fault]);
        tree.paths();
        tree.root_members(&format!("{}\n{}", tree.refs[1], tree.refs[2]));
        let error = tree
            .rpc(fault, "Apply", 0, Duration::from_millis(150))
            .unwrap_err();
        assert!(
            entry.exists(),
            "competitor must enter actual exclusive gate while CXX ACK is held"
        );
        assert!(
            matches!(
                error.code(),
                tonic::Code::Cancelled | tonic::Code::DeadlineExceeded
            ),
            "lease released while ACK held: {error}"
        );
        assert!(hosts[fault].try_wait().unwrap().is_none());
        assert_eq!(
            tree.runtime.block_on(load_state(
                &tree.databases[fault].endpoint(),
                &tree.refs[fault]
            )),
            Some(vec![8, [12, 27, 47][fault]])
        );
        let expected = tree.scheduled_records(fault);
        let pending = tree.records(fault, &expected);
        assert_eq!(pending.len(), 4);
        assert!(
            pending
                .iter()
                .all(|task| task.status == database::task::Status::Pending as i32)
        );
        assert!(
            !tree.marker(fault, "tasks.invocations").exists(),
            "reader bypassed retained ACK lease"
        );
        assert!(
            !tree.marker(fault, "tasks.writer-invocations").exists(),
            "writer bypassed retained ACK lease"
        );
        std::fs::write(&release, b"surface lost actual ACK").unwrap();
        let await_failure = |host: &mut WaitHostGuard| {
            let deadline = std::time::Instant::now() + Duration::from_secs(4);
            loop {
                if let Some(status) = host.try_wait().unwrap() {
                    assert!(!status.success());
                    break;
                }
                assert!(
                    std::time::Instant::now() < deadline,
                    "supervised host did not fail independently"
                );
                std::thread::sleep(Duration::from_millis(10));
            }
        };
        await_failure(&mut hosts[0]);
        std::fs::write(
            lookup.with_extension("release"),
            b"inspect retained terminal attempt",
        )
        .unwrap();
        await_failure(&mut hosts[fault]);
        assert_eq!(
            std::fs::read_to_string(ack.with_extension("attempts"))
                .unwrap()
                .lines()
                .count(),
            1,
            "actor-only ACK retried"
        );
        tree.runtime.block_on(call).unwrap().unwrap_err();
        SupervisedTree::stop(&mut hosts);
        tree.restart();
        // C may already be durably committed; restart recovery must not invent Abort.
        let mut cc = tree.task_command(2, 0);
        cc.arg("--recover");
        let c = tree.spawn(2, &mut cc);
        let mut bc = tree.task_command(1, 0);
        bc.arg("--recover");
        let b = tree.spawn(1, &mut bc);
        let mut ac = tree.task_command(0, 0);
        ac.arg("--recover");
        let a = tree.spawn(0, &mut ac);
        let mut hosts = [a, b, c];
        for actor in 0..3 {
            for task in tree.scheduled_records(actor) {
                tree.wait_task(actor, &task);
            }
        }
        tree.states([18, 33, 53]);
        assert_eq!(
            tree.decision().unwrap().outcome,
            database::transaction_coordinator_decision::Outcome::Commit as i32
        );
        SupervisedTree::stop(&mut hosts);
        tree.planner.stop();
    }
}

#[test]
#[ignore = "requires real C++ Database/RocksDB"]
fn tree_participant_tasks_writer_store_cas_crash_intervening_writer_replay() {
    let mut tree =
        SupervisedTree::with_refs(["tree-task-a", "tree-task-b", "tree-task-c"].map(|id| {
            reboot_rust_schema::state_ref::StateRef::from_id(
                "tests.reboot.protoc.TransactionCounter",
                id,
            )
            .unwrap()
            .to_string()
        }));
    let stored = tree.marker(1, "writer-store");
    let mut commands = std::array::from_fn::<_, 3, _>(|actor| tree.task_command(actor, 0));
    commands[1].env("REBOOT_TEST_WRITER_AFTER_STORE", &stored);
    let c = tree.spawn(2, &mut commands[2]);
    let b = tree.spawn(1, &mut commands[1]);
    let a = tree.spawn(0, &mut commands[0]);
    let mut hosts = [a, b, c];
    assert_eq!(
        tree.rpc(0, "Increment", 7, Duration::from_secs(5)).unwrap(),
        12
    );
    await_marker(&stored, &mut hosts[1]);
    let tasks = tree.scheduled_records(1);
    let before = tree.records(1, &tasks);
    let checkpoint = tree.runtime.block_on(async {
        let mut db =
            database::database_client::DatabaseClient::connect(tree.databases[1].endpoint())
                .await
                .unwrap();
        let mut saved = Vec::new();
        for task in tasks.iter().filter(|t| t.method == "Apply") {
            let id = task.task_id.as_ref().unwrap();
            let key = reboot_rust_schema::runtime::writer_task_key(
                id,
                "tests.reboot.protoc.TransactionCounterWritesMethods.Apply",
            )
            .unwrap();
            let mut stream = db
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
            while let Some(batch) = stream.message().await.unwrap() {
                for mutation in batch.idempotent_mutations {
                    saved.push((task.clone(), mutation));
                }
            }
        }
        assert_eq!(saved.len(), 1);
        saved.remove(0)
    });
    assert_eq!(
        TaskQueryResponse::decode(checkpoint.1.response.as_slice())
            .unwrap()
            .value,
        30
    );
    assert_eq!(
        tree.records(1, std::slice::from_ref(&checkpoint.0))[0].status,
        database::task::Status::Pending as i32
    );
    SupervisedTree::stop(&mut hosts);
    tree.restart();
    assert_eq!(tree.records(1, &tasks), before);
    tree.runtime.block_on(async {
        let store =
            reboot_rust_schema::runtime::DatabaseActorStore::connect(tree.databases[1].endpoint())
                .await
                .unwrap();
        let mut request = tonic::Request::new(TaskQueryResponse { value: 100 });
        let mut headers = reboot_rust_schema::RebootHeaders::new(&tree.refs[1]);
        headers.idempotency_key = Some(Uuid::new_v4());
        *request.metadata_mut() = headers.to_metadata().unwrap();
        store
            .writer_async::<TaskQueryResponse, _, _, _>(
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
        tree.runtime
            .block_on(load_state(&tree.databases[1].endpoint(), &tree.refs[1])),
        Some(TaskQueryResponse { value: 130 }.encode_to_vec())
    );
    let mut commands = std::array::from_fn::<_, 3, _>(|actor| {
        let mut c = tree.task_command(actor, 0);
        c.arg("--recover");
        c
    });
    let c = tree.spawn(2, &mut commands[2]);
    let b = tree.spawn(1, &mut commands[1]);
    let a = tree.spawn(0, &mut commands[0]);
    let mut hosts = [a, b, c];
    assert_eq!(
        tree.wait_task(1, &checkpoint.0),
        30,
        "replay must return original durable response"
    );
    for actor in 0..3 {
        for task in tree.scheduled_records(actor) {
            tree.wait_task(actor, &task);
        }
    }
    tree.states([18, 133, 53]);
    assert_eq!(
        std::fs::read_to_string(tree.marker(1, "tasks.writer-invocations"))
            .unwrap()
            .lines()
            .count(),
        2,
        "crashed writer remutated after intervening writer"
    );
    SupervisedTree::stop(&mut hosts);
    tree.planner.stop();
}

impl SupervisedTree {
    fn task_tree() -> Self {
        Self::with_refs(["tree-task-a", "tree-task-b", "tree-task-c"].map(|id| {
            reboot_rust_schema::state_ref::StateRef::from_id("tests.reboot.protoc.TransactionCounter", id).unwrap().to_string()
        }))
    }
    fn task_snapshot(&self, actor: usize, tasks: &[database::Task]) -> database::LoadResponse {
        self.runtime.block_on(async {
            let mut response = database::database_client::DatabaseClient::connect(self.databases[actor].endpoint()).await.unwrap()
                .load(database::LoadRequest {
                    actors: vec![database::Actor { state_type: "tests.reboot.protoc.TransactionCounter".into(), state_ref: self.refs[actor].clone(), ..Default::default() }],
                    task_ids: tasks.iter().map(|t| t.task_id.clone().unwrap()).collect(),
                }).await.unwrap().into_inner();
            response.tasks.sort_by_key(|t| t.task_id.as_ref().unwrap().task_uuid.clone());
            response.tasks.dedup();
            // Load timestamp is the read clock, not any persisted actor/task field.
            response.timestamp = None;
            response
        })
    }
    fn task_rejection_readmit(&self, hosts: &mut [WaitHostGuard; 3], decision_required: bool) {
        if decision_required {
            let deadline = std::time::Instant::now() + Duration::from_secs(4);
            while self.decision().is_none() { assert!(std::time::Instant::now() < deadline, "root Abort missing"); std::thread::sleep(Duration::from_millis(10)); }
            assert_eq!(self.decision().unwrap().outcome, database::transaction_coordinator_decision::Outcome::Abort as i32);
        } else { assert!(self.decision().is_none(), "pre-handler root-owner rejection must not invent a decision"); }
        for (actor, host) in hosts.iter_mut().enumerate() {
            assert!(host.try_wait().unwrap().is_none());
            assert_eq!(self.rpc(actor, "Apply", 0, Duration::from_secs(2)).unwrap_or_else(|error| panic!("tree actor {actor} readmission: {error}")), [5,20,40][actor]);
        }
        // Full persisted actor/task records (including seeded Pending) are checked by caller.
    }
    fn seed_identity_task(&self, actor: usize, completed: bool) -> database::Task {
        let mut task = database::Task {
            task_id: Some(database::TaskId { state_type: "tests.reboot.protoc.TransactionCounter".into(), state_ref: self.refs[actor].clone(), task_uuid: Uuid::new_v4().as_bytes().to_vec() }),
            method: "Query".into(), request: TaskQueryRequest { amount: 9000 }.encode_to_vec(),
            timestamp: Some(prost_types::Timestamp { seconds: 4_000_000_000, nanos: 0 }),
            status: database::task::Status::Pending as i32, ..Default::default()
        };
        if completed {
            task.status = database::task::Status::Completed as i32;
            task.response_or_error = Some(database::task::ResponseOrError::Response(prost_types::Any {
                type_url: "type.googleapis.com/tests.reboot.protoc.TransactionCounterValue".into(), value: TaskQueryResponse { value: 777 }.encode_to_vec()
            }));
        }
        self.runtime.block_on(async {
            database::database_client::DatabaseClient::connect(self.databases[actor].endpoint()).await.unwrap()
                .store(database::StoreRequest { task_upserts: vec![task.clone()], sync: true, ..Default::default() }).await.unwrap();
        });
        task
    }
}

#[test]
#[ignore = "requires real C++ Database/RocksDB"]
fn tree_participant_tasks_full_record_identity_rejections_pending_completed_restart() {
    for actor in 0..3 {
        for vector in ["foreign-actor", "duplicate-staged", "pending", "completed"] {
            let mut tree = SupervisedTree::task_tree();
            let seeds = if vector == "pending" || vector == "completed" { vec![tree.seed_identity_task(actor, vector == "completed")] } else { vec![] };
            let before: Vec<_> = (0..3).map(|a| tree.task_snapshot(a, &seeds)).collect();
            let mut commands = std::array::from_fn::<_, 3, _>(|a| tree.task_command(a, 0));
            if seeds.is_empty() {
                commands[actor].args(["--tree-task-vector", vector, "--tree-task-foreign-ref", &tree.refs[(actor + 1) % 3]]);
            } else {
                commands[actor].args(["--tree-task-vector", "reuse", "--tree-task-reuse-uuid", &Uuid::from_slice(&seeds[0].task_id.as_ref().unwrap().task_uuid).unwrap().to_string()]);
            }
            let c = tree.spawn(2, &mut commands[2]); let b = tree.spawn(1, &mut commands[1]); let a = tree.spawn(0, &mut commands[0]);
            let mut hosts = [a,b,c];
            let error = tree.rpc(0, "Increment", 7, Duration::from_secs(4)).unwrap_err();
            assert_eq!(error.code(), if seeds.is_empty() { tonic::Code::InvalidArgument } else { tonic::Code::AlreadyExists }, "actor={actor} vector={vector}: {error}");
            assert!(tree.marker(actor, "tasks.records").exists(), "actual handler must return rejected batch");
            tree.task_rejection_readmit(&mut hosts, true);
            let mut ids = seeds.clone();
            for a in 0..3 {
                if tree.marker(a, "tasks.records").exists() { ids.extend(tree.scheduled_records(a)); }
                assert!(!tree.marker(a, "tasks.invocations").exists());
                assert!(!tree.marker(a, "tasks.writer-invocations").exists());
            }
            for (a, expected) in before.iter().enumerate() { assert_eq!(tree.task_snapshot(a, &ids), *expected, "full actor/task record changed: {actor}/{vector}/{a}"); }
            SupervisedTree::stop(&mut hosts); tree.restart();
            for (a, expected) in before.iter().enumerate() { assert_eq!(tree.task_snapshot(a, &ids), *expected, "restarted full record changed: {actor}/{vector}/{a}"); }
            tree.planner.stop();
        }
    }
}

#[test]
#[ignore = "requires real C++ Database/RocksDB"]
fn tree_participant_tasks_owner_rejections_independent_full_records_restart() {
    for actor in 0..3 {
        let vectors = if actor == 0 { vec!["task-missing", "task-inactive", "root-missing", "root-inactive", "root-full"] } else { vec!["task-missing", "task-inactive", "watch-missing", "watch-inactive", "watch-full"] };
        for vector in vectors {
            let mut tree = SupervisedTree::task_tree();
            let before: Vec<_> = (0..3).map(|a| tree.task_snapshot(a, &[])).collect();
            let mut commands = std::array::from_fn::<_, 3, _>(|a| tree.task_command(a, 0));
            commands[actor].arg(match vector {
                "task-missing" => "--no-task-owner", "task-inactive" => "--inactive-task-owner",
                "root-missing" => "--no-root-owner", "root-inactive" => "--inactive-root-owner", "root-full" => "--full-root-owner",
                "watch-missing" => "--no-live-owner", "watch-inactive" => "--inactive-live-owner", "watch-full" => "--full-live-owner", _ => unreachable!()
            });
            let c = tree.spawn(2, &mut commands[2]); let b = tree.spawn(1, &mut commands[1]); let a = tree.spawn(0, &mut commands[0]);
            let mut hosts = [a,b,c];
            let error = tree.rpc(0, "Increment", 7, Duration::from_secs(4)).unwrap_err();
            assert_eq!(error.code(), if vector == "watch-full" || vector == "root-full" { tonic::Code::ResourceExhausted } else { tonic::Code::FailedPrecondition }, "actor={actor} vector={vector}: {error}");
            if vector.starts_with("task-") { assert!(tree.marker(actor, "tasks.records").exists(), "task owner must be tested independently after handler"); }
            else { assert!(!tree.marker(actor, "path").exists(), "owner denial must precede handler"); }
            tree.task_rejection_readmit(&mut hosts, !vector.starts_with("root-"));
            let mut ids = vec![];
            for a in 0..3 {
                if tree.marker(a, "tasks.records").exists() { ids.extend(tree.scheduled_records(a)); }
                assert!(!tree.marker(a, "tasks.invocations").exists()); assert!(!tree.marker(a, "tasks.writer-invocations").exists());
            }
            for (a, expected) in before.iter().enumerate() { assert_eq!(tree.task_snapshot(a, &ids), *expected); }
            SupervisedTree::stop(&mut hosts); tree.restart();
            for (a, expected) in before.iter().enumerate() { assert_eq!(tree.task_snapshot(a, &ids), *expected); }
            tree.planner.stop();
        }
    }
}

#[test]
#[ignore = "requires real C++ Database/RocksDB"]
fn tree_participant_tasks_composition_duplicate_registration_full_records_restart() {
    let mut tree = SupervisedTree::task_tree();
    let before: Vec<_> = (0..3).map(|a| tree.task_snapshot(a, &[])).collect();
    for actor in 0..3 {
        let marker = tree.marker(actor, "composition");
        let mut command = tree.task_command(actor, 0);
        command.args(["--prove-task-composition", "--task-foreign-database", &tree.databases[(actor+1)%3].endpoint(), "--task-composition-marker", marker.to_str().unwrap()]);
        assert!(command.status().unwrap().success()); assert!(marker.exists());
        let mut command = tree.task_command(actor, 0); command.arg("--duplicate-task-registration");
        let mut host = WaitHostGuard(command.stderr(std::fs::File::create(tree.marker(actor, "duplicate-stderr")).unwrap()).spawn().unwrap());
        let deadline = std::time::Instant::now() + Duration::from_secs(5);
        loop {
            if let Some(status) = host.try_wait().unwrap() { assert!(!status.success()); break; }
            assert!(std::time::Instant::now()<deadline, "duplicate registration host did not fail"); std::thread::sleep(Duration::from_millis(10));
        }
        let stderr = std::fs::read_to_string(tree.marker(actor, "duplicate-stderr")).unwrap();
        assert!(stderr.contains("AlreadyExists") && stderr.contains("task"), "wrong host failure: {stderr}");
    }
    for (a, expected) in before.iter().enumerate() { assert_eq!(tree.task_snapshot(a, &[]), *expected); }
    tree.restart();
    for (a, expected) in before.iter().enumerate() { assert_eq!(tree.task_snapshot(a, &[]), *expected); }
    tree.planner.stop();
}

#[test]
#[ignore = "requires real C++ Database/RocksDB"]
fn tree_participant_tasks_full_dispatcher_capacity_full_records_restart() {
    for actor in 0..3 {
        let mut tree = SupervisedTree::task_tree();
        let seed = tree.seed_identity_task(actor, false);
        let mut seeds = vec![seed.clone()];
        for _ in 1..1024 {
            let mut task = seed.clone(); task.task_id.as_mut().unwrap().task_uuid = Uuid::new_v4().as_bytes().to_vec(); seeds.push(task);
        }
        tree.runtime.block_on(async {
            database::database_client::DatabaseClient::connect(tree.databases[actor].endpoint()).await.unwrap()
                .store(database::StoreRequest { task_upserts: seeds[1..].to_vec(), sync: true, ..Default::default() }).await.unwrap();
        });
        let before: Vec<_> = (0..3).map(|a| tree.task_snapshot(a, &seeds)).collect();
        let mut commands = std::array::from_fn::<_, 3, _>(|a| tree.task_command(a, 0));
        let c = tree.spawn(2, &mut commands[2]); let b = tree.spawn(1, &mut commands[1]); let a = tree.spawn(0, &mut commands[0]); let mut hosts = [a,b,c];
        let error = tree.rpc(0, "Increment", 7, Duration::from_secs(5)).unwrap_err();
        assert_eq!(error.code(), tonic::Code::ResourceExhausted, "actor={actor}: {error}");
        assert!(tree.marker(actor, "tasks.records").exists());
        tree.task_rejection_readmit(&mut hosts, true);
        let mut ids = seeds;
        for a in 0..3 {
            if tree.marker(a, "tasks.records").exists() { ids.extend(tree.scheduled_records(a)); }
            assert!(!tree.marker(a, "tasks.invocations").exists()); assert!(!tree.marker(a, "tasks.writer-invocations").exists());
        }
        for (a, expected) in before.iter().enumerate() { assert_eq!(tree.task_snapshot(a, &ids), *expected); }
        SupervisedTree::stop(&mut hosts); tree.restart();
        for (a, expected) in before.iter().enumerate() { assert_eq!(tree.task_snapshot(a, &ids), *expected); }
        tree.planner.stop();
    }
}


