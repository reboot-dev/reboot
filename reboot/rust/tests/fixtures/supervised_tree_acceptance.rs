// Three independent canonical Database processes and generated application hosts.
struct SupervisedTree {
    binary: std::path::PathBuf,
    databases: [CxxDatabase; 3],
    ports: [u16; 3],
    runtime: tokio::runtime::Runtime,
    planner: LivePlannerServer,
    markers: tempfile::TempDir,
    root: Uuid,
    children: [Uuid; 2],
}
impl SupervisedTree {
    const REFS: [&'static str; 3] = ["root", "target", "tip"];
    fn new() -> Self {
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
        let database = std::env::var("REBOOT_NATIVE2PC_CXX_DATABASE").unwrap();
        let databases = std::array::from_fn(|_| CxxDatabase::start(database.clone()));
        let ports = std::array::from_fn(|_| port());
        let runtime = tokio::runtime::Runtime::new().unwrap();
        for (i, db) in databases.iter().enumerate() {
            runtime.block_on(store_counter(&db.endpoint(), Self::REFS[i], [5, 20, 40][i]));
        }
        let plan = placement_proto::ListenForPlanResponse::decode(
            URL_SAFE_NO_PAD
                .decode(legacy_plan_for(
                    &Self::REFS
                        .iter()
                        .zip(ports)
                        .map(|(r, p)| (*r, p))
                        .collect::<Vec<_>>(),
                ))
                .unwrap()
                .as_slice(),
        )
        .unwrap();
        let planner = LivePlannerServer::start(&runtime, plan);
        Self {
            binary,
            databases,
            ports,
            runtime,
            planner,
            markers: tempfile::tempdir().unwrap(),
            root: Uuid::new_v4(),
            children: [Uuid::new_v4(), Uuid::new_v4()],
        }
    }
    fn marker(&self, actor: usize, name: &str) -> std::path::PathBuf {
        self.markers.path().join(format!("{actor}-{name}"))
    }
    fn command(&self, actor: usize) -> Command {
        let mut c = Command::new(&self.binary);
        c.args([
            "--role",
            ["root", "tree-branch", "target"][actor],
            "--database",
            &self.databases[actor].endpoint(),
            "--listen",
            &format!("127.0.0.1:{}", self.ports[actor]),
            "--placement-planner",
            &self.planner.endpoint,
            "--root-id",
            &self.root.to_string(),
            "--state-ref",
            Self::REFS[actor],
            "--coordinator-state-ref",
            Self::REFS[actor],
            "--supervised-tree",
            "--tree-path-marker",
            self.marker(actor, "path").to_str().unwrap(),
            "--tree-members-marker",
            self.marker(actor, "members").to_str().unwrap(),
        ]);
        if actor == 0 {
            c.arg("--owned-explicit-abort");
        } else {
            c.args([
                "--live-watch",
                "--watch-coordinator-state-ref",
                "root",
                "--tree-child",
                &self.children[actor - 1].to_string(),
            ]);
            c.env(
                "REBOOT_TEST_TARGET_WATCH_TERMINALIZED",
                self.marker(actor, "terminal"),
            );
        }
        if actor < 2 {
            c.args(["--tree-next", Self::REFS[actor + 1]]);
        }
        c
    }
    fn spawn(&self, actor: usize, command: &mut Command) -> WaitHostGuard {
        command.stderr(std::fs::File::create(self.marker(actor, "stderr")).unwrap());
        let mut host = WaitHostGuard(command.spawn().unwrap());
        let listener_deadline = std::time::Instant::now() + Duration::from_secs(5);
        while std::net::TcpStream::connect(("127.0.0.1", self.ports[actor])).is_err() {
            assert!(
                host.try_wait().unwrap().is_none() && std::time::Instant::now() < listener_deadline,
                "tree host {actor} failed before listen: {}",
                std::fs::read_to_string(self.marker(actor, "stderr")).unwrap()
            );
            std::thread::sleep(Duration::from_millis(10));
        }
        // Only Query retries readiness; tested mutations are issued once.
        let deadline = std::time::Instant::now() + Duration::from_secs(5);
        loop {
            match self.rpc(actor, "Query", 0, Duration::from_millis(500)) {
                Ok(_) => return host,
                Err(error)
                    if error.code() == tonic::Code::Unavailable
                        && std::time::Instant::now() < deadline =>
                {
                    std::thread::sleep(Duration::from_millis(10))
                }
                Err(error) => panic!(
                    "tree host readiness failed: {error}; status={:?}; {}",
                    host.try_wait().unwrap(),
                    std::fs::read_to_string(self.marker(actor, "stderr")).unwrap()
                ),
            }
        }
    }
    fn rpc(
        &self,
        actor: usize,
        method: &str,
        amount: i64,
        timeout: Duration,
    ) -> Result<i64, Box<tonic::Status>> {
        self.runtime
            .block_on(async {
                let mut client = tonic::client::Grpc::new(
                    tonic::transport::Endpoint::from_shared(format!(
                        "http://127.0.0.1:{}",
                        self.ports[actor]
                    ))
                    .unwrap()
                    .connect_lazy(),
                );
                client
                    .ready()
                    .await
                    .map_err(|e| tonic::Status::unavailable(e.to_string()))?;
                let mut request = tonic::Request::new(TaskQueryRequest { amount });
                request
                    .metadata_mut()
                    .insert("x-reboot-state-ref", Self::REFS[actor].parse().unwrap());
                if method == "Apply" {
                    request.metadata_mut().insert(
                        "x-reboot-idempotency-key",
                        Uuid::new_v4().to_string().parse().unwrap(),
                    );
                }
                request.set_timeout(timeout);
                client
                    .unary::<_, TaskQueryResponse, _>(
                        request,
                        format!("/tests.reboot.protoc.TransactionCounterWritesMethods/{method}")
                            .parse()
                            .unwrap(),
                        tonic::codec::ProstCodec::default(),
                    )
                    .await
                    .map(|r| r.into_inner().value)
            })
            .map_err(Box::new)
    }
    fn paths(&self) {
        for actor in 0..3 {
            let actual: Vec<Uuid> = std::fs::read_to_string(self.marker(actor, "path"))
                .unwrap()
                .lines()
                .map(|s| Uuid::parse_str(s).unwrap())
                .collect();
            let mut expected = vec![self.root];
            expected.extend_from_slice(&self.children[..actor]);
            assert_eq!(actual, expected, "actual generated path at actor {actor}");
        }
        assert_eq!(
            std::fs::read_to_string(self.marker(1, "members")).unwrap(),
            "tip",
            "B actually called C"
        );
    }
    fn root_members(&self, expected: &str) {
        assert_eq!(
            std::fs::read_to_string(self.marker(0, "members")).unwrap(),
            expected
        );
    }
    fn states(&self, expected: [u8; 3]) {
        for (actor, value) in expected.into_iter().enumerate() {
            assert_eq!(
                self.runtime.block_on(load_state(
                    &self.databases[actor].endpoint(),
                    Self::REFS[actor]
                )),
                Some(vec![8, value]),
                "actor {actor}"
            );
            assert!(
                self.runtime
                    .block_on(pending_tasks(&self.databases[actor].endpoint()))
                    .is_empty()
            );
        }
    }
    fn decision(&self) -> Option<database::TransactionCoordinatorDecision> {
        self.runtime.block_on(async {
            let mut c =
                database::database_client::DatabaseClient::connect(self.databases[0].endpoint())
                    .await
                    .unwrap();
            c.transaction_coordinator_decision_get(
                database::TransactionCoordinatorDecisionGetRequest {
                    root_transaction_id: self.root.as_bytes().to_vec(),
                    coordinator_state_ref: "root".into(),
                },
            )
            .await
            .unwrap()
            .into_inner()
            .decision
        })
    }
    fn abort_and_readmit(&self, hosts: &mut [WaitHostGuard; 3]) {
        let deadline = std::time::Instant::now() + Duration::from_secs(4);
        while self.decision().is_none() {
            assert!(std::time::Instant::now() < deadline);
            std::thread::sleep(Duration::from_millis(10));
        }
        assert_eq!(
            self.decision().unwrap().outcome,
            database::transaction_coordinator_decision::Outcome::Abort as i32
        );
        for (actor, host) in hosts.iter_mut().enumerate() {
            assert!(
                host.try_wait().unwrap().is_none(),
                "acknowledged tree Abort must keep each host live"
            );
            assert_eq!(
                self.rpc(actor, "Apply", 0, Duration::from_secs(2))
                    .unwrap_or_else(|error| panic!(
                        "tree actor {actor} readmission: {error}; stderr: {}",
                        std::fs::read_to_string(self.marker(actor, "stderr")).unwrap()
                    )),
                [5, 20, 40][actor]
            );
        }
        self.states([5, 20, 40]);
    }
    fn stop(hosts: &mut [WaitHostGuard; 3]) {
        for host in hosts {
            DistributedTasks::stop(host);
        }
    }
    fn restart(&mut self) {
        for db in &mut self.databases {
            db.restart();
        }
    }
}
#[test]
#[ignore = "requires real C++ Database/RocksDB"]
fn supervised_tree_commit_three_independent_sidecars_restart() {
    let mut tree = SupervisedTree::new();
    let c = tree.spawn(2, &mut tree.command(2));
    let b = tree.spawn(1, &mut tree.command(1));
    let a = tree.spawn(0, &mut tree.command(0));
    let mut hosts = [a, b, c];
    assert_eq!(
        tree.rpc(0, "Increment", 7, Duration::from_secs(5)).unwrap(),
        12
    );
    tree.paths();
    tree.root_members("target\ntip");
    tree.states([12, 27, 47]);
    let decision = tree.decision().unwrap();
    assert_eq!(
        decision.outcome,
        database::transaction_coordinator_decision::Outcome::Commit as i32
    );
    SupervisedTree::stop(&mut hosts);
    tree.restart();
    tree.states([12, 27, 47]);
    tree.planner.stop();
}
#[test]
#[ignore = "requires real C++ Database/RocksDB"]
fn supervised_tree_confirmed_root_error_and_deadline_abort_all_live() {
    for deadline in [false, true] {
        let mut tree = SupervisedTree::new();
        let c = tree.spawn(2, &mut tree.command(2));
        let b = tree.spawn(1, &mut tree.command(1));
        let mut command = tree.command(0);
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
        tree.root_members("target\ntip");
        tree.abort_and_readmit(&mut hosts);
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
fn supervised_tree_intermediate_lost_trailers_unknown_c_self_watch() {
    for error in [false, true] {
        let mut tree = SupervisedTree::new();
        let c = tree.spawn(2, &mut tree.command(2));
        let barrier = tree.marker(1, "response");
        let mut command = tree.command(1);
        command.env("REBOOT_TEST_LIVE_INBOUND_RESPONSE", &barrier);
        if error {
            command.env("REBOOT_TEST_LIVE_INBOUND_RESPONSE_ERROR", "1");
        }
        let b = tree.spawn(1, &mut command);
        let a = tree.spawn(0, &mut tree.command(0));
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
fn supervised_tree_commit_decision_target_watch_ready_before_root_recovery() {
    let mut tree = SupervisedTree::new();
    let mut cc = tree.command(2);
    cc.env(
        "REBOOT_TEST_LIVE_WATCH_BEFORE_LOOKUP",
        tree.marker(2, "lookup"),
    );
    let c = tree.spawn(2, &mut cc);
    let mut bc = tree.command(1);
    bc.env(
        "REBOOT_TEST_LIVE_WATCH_BEFORE_LOOKUP",
        tree.marker(1, "lookup"),
    );
    let b = tree.spawn(1, &mut bc);
    let decision = tree.marker(0, "decision");
    let mut ac = tree.command(0);
    ac.env("REBOOT_TEST_PAUSE_AFTER_COORDINATOR_PREPARE", &decision);
    let a = tree.spawn(0, &mut ac);
    let mut hosts = [a, b, c];
    let endpoint = format!("http://127.0.0.1:{}", tree.ports[0]);
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
            .insert("x-reboot-state-ref", "root".parse().unwrap());
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
        assert_eq!(records[0].1.participants.as_ref().unwrap().should_commit["tests.reboot.protoc.TransactionCounter"].state_refs, ["root", "target", "tip"], "full transitive membership must be persisted before terminal fanout");
    });
    tree.paths();
    tree.root_members("target\ntip");
    assert_eq!(
        tree.decision().unwrap().outcome,
        database::transaction_coordinator_decision::Outcome::Commit as i32
    );
    SupervisedTree::stop(&mut hosts);
    tree.runtime.block_on(call).unwrap().unwrap_err();
    tree.restart();
    let mut cc = tree.command(2);
    cc.arg("--recover");
    let mut c = WaitHostGuard(
        cc.stderr(std::fs::File::create(tree.marker(2, "recovery-stderr")).unwrap())
            .spawn()
            .unwrap(),
    );
    wait(tree.ports[2]);
    let mut bc = tree.command(1);
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
    let mut ac = tree.command(0);
    ac.arg("--recover");
    let a = tree.spawn(0, &mut ac);
    let mut hosts = [a, b, c];
    for (actor, host) in hosts.iter_mut().enumerate().skip(1) {
        await_marker(&tree.marker(actor, "terminal"), host);
    }
    tree.states([12, 27, 47]);
    SupervisedTree::stop(&mut hosts);
    tree.restart();
    tree.states([12, 27, 47]);
    tree.planner.stop();
}

#[test]
#[ignore = "requires real C++ Database/RocksDB"]
fn supervised_tree_active_child_blocks_prepare_terminal_and_closed_clone() {
    let tree = SupervisedTree::new();
    let barrier = tree.marker(2, "active-handler");
    let mut cc = tree.command(2);
    cc.env("REBOOT_TEST_TARGET_UNFINISHED_OUTBOUND", &barrier)
        .arg("--release-parked-target");
    let c = tree.spawn(2, &mut cc);
    let mut bc = tree.command(1);
    bc.args([
        "--tree-active-child",
        "--tree-active-marker",
        barrier.to_str().unwrap(),
    ]);
    let b = tree.spawn(1, &mut bc);
    let a = tree.spawn(0, &mut tree.command(0));
    let mut hosts = [a, b, c];
    let error = tree
        .rpc(0, "Increment", 7, Duration::from_secs(3))
        .unwrap_err();
    assert_eq!(error.code(), tonic::Code::FailedPrecondition);
    assert!(
        barrier.exists(),
        "actual generated child future must be active"
    );
    assert!(!tree.marker(0, "members").exists());
    assert_eq!(
        tree.decision().unwrap().outcome,
        database::transaction_coordinator_decision::Outcome::Abort as i32
    );
    tree.runtime.block_on(async {
        let mut client = database::participant_client::ParticipantClient::connect(format!(
            "http://127.0.0.1:{}",
            tree.ports[1]
        ))
        .await
        .unwrap();
        let mut request = tonic::Request::new(database::PrepareRequest {
            transaction_id: tree.root.as_bytes().to_vec(),
            ..Default::default()
        });
        request
            .metadata_mut()
            .insert("x-reboot-state-ref", "target".parse().unwrap());
        request.set_timeout(Duration::from_millis(150));
        let error = client.prepare(request).await.unwrap_err();
        assert!(
            matches!(
                error.code(),
                tonic::Code::Cancelled | tonic::Code::DeadlineExceeded
            ),
            "Prepare bypassed active descendant execution: {error}"
        );
        let mut request = tonic::Request::new(database::AbortRequest {
            transaction_id: tree.root.as_bytes().to_vec(),
        });
        request
            .metadata_mut()
            .insert("x-reboot-state-ref", "target".parse().unwrap());
        request.set_timeout(Duration::from_millis(150));
        let error = client.abort(request).await.unwrap_err();
        assert!(
            matches!(
                error.code(),
                tonic::Code::Cancelled | tonic::Code::DeadlineExceeded
            ),
            "Abort bypassed active descendant execution: {error}"
        );
    });
    let error = tree
        .rpc(1, "Apply", 0, Duration::from_millis(150))
        .unwrap_err();
    assert!(matches!(
        error.code(),
        tonic::Code::Cancelled | tonic::Code::DeadlineExceeded
    ));
    tree.states([5, 20, 40]);
    std::fs::write(
        barrier.with_extension("release"),
        b"actual child handler may finish",
    )
    .unwrap();
    await_marker(
        &std::path::PathBuf::from(format!("{}.child-ended", barrier.display())),
        &mut hosts[1],
    );
    let outcome = std::fs::read_to_string(format!("{}.child-ended", barrier.display())).unwrap();
    assert!(
        outcome.starts_with("Err(Grpc(Status { code: FailedPrecondition"),
        "closed subtree must reject actual late child outcome: {outcome}"
    );
    await_marker(
        &std::path::PathBuf::from(format!("{}.clone-denied", barrier.display())),
        &mut hosts[1],
    );
    tree.abort_and_readmit(&mut hosts);
    SupervisedTree::stop(&mut hosts);
    tree.planner.stop();
}
#[test]
#[ignore = "requires real C++ Database/RocksDB"]
fn supervised_tree_real_owner_missing_inactive_full_and_all_actor_task_denial() {
    for vector in [
        "missing",
        "inactive",
        "full",
        "task-root",
        "task-b",
        "task-c",
    ] {
        let mut tree = SupervisedTree::new();
        eprintln!("tree owner vector {vector}");
        let task_actor = match vector {
            "task-root" => Some(0),
            "task-b" => Some(1),
            "task-c" => Some(2),
            _ => None,
        };
        let mut commands = [tree.command(0), tree.command(1), tree.command(2)];
        match vector {
            "missing" => {
                commands[1].arg("--no-live-owner");
            }
            "inactive" => {
                commands[1].arg("--inactive-live-owner");
            }
            "full" => {
                commands[1].args([
                    "--full-live-owner",
                    "--task-marker",
                    tree.marker(1, "capacity").to_str().unwrap(),
                ]);
            }
            _ => {}
        }
        if let Some(actor) = task_actor {
            commands[actor].args([
                "--tree-task-owner",
                "--negative-task-shape",
                "--negative-shape-marker",
                tree.marker(actor, "task-denied").to_str().unwrap(),
            ]);
        }
        let c = tree.spawn(2, &mut commands[2]);
        let b = tree.spawn(1, &mut commands[1]);
        let a = tree.spawn(0, &mut commands[0]);
        let mut hosts = [a, b, c];
        let error = tree
            .rpc(0, "Increment", 7, Duration::from_secs(3))
            .unwrap_err();
        assert_eq!(
            error.code(),
            if vector == "full" {
                tonic::Code::ResourceExhausted
            } else {
                tonic::Code::FailedPrecondition
            },
            "{vector}: {error}"
        );
        if let Some(actor) = task_actor {
            assert!(
                tree.marker(actor, "task-denied").exists(),
                "actual tree handler task return not reached"
            );
        } else {
            assert!(
                !tree.marker(1, "path").exists(),
                "unsupported Watch owner entered tree handler"
            );
        }
        tree.abort_and_readmit(&mut hosts);
        SupervisedTree::stop(&mut hosts);
        tree.restart();
        tree.states([5, 20, 40]);
        tree.planner.stop();
    }
}
#[test]
#[ignore = "requires real C++ Database/RocksDB"]
fn supervised_tree_c_lost_terminal_ack_retains_actual_actor_entry_once_restart() {
    let mut tree = SupervisedTree::new();
    let ack = tree.marker(2, "ack");
    let release = tree.marker(2, "ack-release");
    let lookup = tree.marker(2, "lookup");
    let entry = tree.marker(2, "actor-entry");
    let mut cc = tree.command(2);
    cc.env("REBOOT_TEST_LOST_PARTICIPANT_COMMIT_ACK", &ack)
        .env("REBOOT_TEST_REMOTE_COMMIT_ACK_RELEASE", &release)
        .env("REBOOT_TEST_LIVE_WATCH_BEFORE_LOOKUP", &lookup)
        .env("REBOOT_TEST_TREE_COMPETITOR_ENTRY", &entry);
    let c = tree.spawn(2, &mut cc);
    let b = tree.spawn(1, &mut tree.command(1));
    let a = tree.spawn(0, &mut tree.command(0));
    let mut hosts = [a, b, c];
    let endpoint = format!("http://127.0.0.1:{}", tree.ports[0]);
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
            .insert("x-reboot-state-ref", "root".parse().unwrap());
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
    await_marker(&ack, &mut hosts[2]);
    await_marker(&lookup, &mut hosts[2]);
    tree.paths();
    tree.root_members("target\ntip");
    let error = tree
        .rpc(2, "Apply", 0, Duration::from_millis(150))
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
    assert!(hosts[2].try_wait().unwrap().is_none());
    assert_eq!(
        tree.runtime
            .block_on(load_state(&tree.databases[2].endpoint(), "tip")),
        Some(vec![8, 47])
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
    await_failure(&mut hosts[2]);
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
    let mut cc = tree.command(2);
    cc.arg("--recover");
    let c = tree.spawn(2, &mut cc);
    let mut bc = tree.command(1);
    bc.arg("--recover");
    let b = tree.spawn(1, &mut bc);
    let mut ac = tree.command(0);
    ac.arg("--recover");
    let a = tree.spawn(0, &mut ac);
    let mut hosts = [a, b, c];
    tree.states([12, 27, 47]);
    assert_eq!(
        tree.decision().unwrap().outcome,
        database::transaction_coordinator_decision::Outcome::Commit as i32
    );
    SupervisedTree::stop(&mut hosts);
    tree.planner.stop();
}

#[test]
#[ignore = "requires real C++ Database/RocksDB"]
fn supervised_tree_caught_uncertain_child_after_c_staging_aborts_whole_root() {
    let mut tree = SupervisedTree::new();
    let barrier = tree.marker(2, "lost-child-response");
    let caught = tree.marker(1, "caught-child");
    let mut cc = tree.command(2);
    cc.env("REBOOT_TEST_LIVE_INBOUND_RESPONSE", &barrier)
        .env("REBOOT_TEST_LIVE_INBOUND_RESPONSE_ERROR", "1");
    let c = tree.spawn(2, &mut cc);
    let mut bc = tree.command(1);
    bc.args(["--catch-outbound-error", "--outbound-error-marker", caught.to_str().unwrap()]);
    let b = tree.spawn(1, &mut bc);
    let a = tree.spawn(0, &mut tree.command(0));
    let mut hosts = [a, b, c];
    let error = tree.rpc(0, "Increment", 7, Duration::from_secs(3)).unwrap_err();
    assert_eq!(error.code(), tonic::Code::Unavailable);
    assert_eq!(std::fs::read_to_string(&caught).unwrap(), "caught uncertain generated outbound, empty membership");
    assert!(barrier.with_extension("future-dropped").exists());
    assert_eq!(std::fs::read_to_string(tree.marker(1, "members")).unwrap(), "");
    assert!(!tree.marker(0, "members").exists(), "caught child uncertainty must not produce success upstream");
    tree.abort_and_readmit(&mut hosts);
    await_marker(&tree.marker(2, "terminal"), &mut hosts[2]);
    SupervisedTree::stop(&mut hosts);
    tree.restart();
    tree.states([5,20,40]);
    assert_eq!(tree.decision().unwrap().outcome, database::transaction_coordinator_decision::Outcome::Abort as i32);
    tree.planner.stop();
}

#[test]
#[ignore = "requires real C++ Database/RocksDB"]
fn supervised_tree_scope_duplicate_depth_shared_factory_idempotent_and_reentrant() {
    for shape in ["duplicate", "depth", "shared", "factory", "idempotent", "self", "reentrant"] {
        eprintln!("explicit tree scope vector {shape}");
        let mut tree = SupervisedTree::new();
        let c = tree.spawn(2, &mut tree.command(2));
        let mut bc = tree.command(1);
        if shape == "reentrant" { bc.arg("--tree-reentrant-root"); }
        // self target is selected by replacing the actual host argument, not a fabricated context.
        if shape == "self" {
            bc = Command::new(&tree.binary);
            bc.args(["--role", "tree-branch", "--database", &tree.databases[1].endpoint(), "--listen", &format!("127.0.0.1:{}",tree.ports[1]), "--placement-planner", &tree.planner.endpoint, "--root-id", &tree.root.to_string(), "--state-ref", "target", "--coordinator-state-ref", "target", "--supervised-tree", "--live-watch", "--watch-coordinator-state-ref", "root", "--tree-child", &tree.children[0].to_string(), "--tree-next", "target", "--tree-path-marker", tree.marker(1,"path").to_str().unwrap()]);
        }
        let b = tree.spawn(1, &mut bc);
        let a = tree.spawn(0, &mut tree.command(0));
        let mut hosts = [a,b,c];
        let error = if matches!(shape, "self" | "reentrant") {
            tree.rpc(0,"Increment",7,Duration::from_secs(3)).unwrap_err()
        } else {
            Box::new(tree.runtime.block_on(async {
                let mut client = tonic::client::Grpc::new(tonic::transport::Endpoint::from_shared(format!("http://127.0.0.1:{}", tree.ports[1])).unwrap().connect_lazy());
                client.ready().await.unwrap();
                let mut headers = reboot_rust_schema::RebootHeaders::new("target");
                if shape != "factory" {
                    headers.transaction_ids = Some(match shape {
                        "duplicate" => vec![tree.root,tree.children[0]],
                        "depth" => std::iter::once(tree.root).chain((0..31).map(|_| Uuid::new_v4())).collect(),
                        _ => vec![tree.root],
                    });
                    headers.transaction_coordinator_state_type = Some("tests.reboot.protoc.TransactionCounter".into());
                    headers.transaction_coordinator_state_ref = Some("root".into());
                }
                if shape == "idempotent" { headers.idempotency_key = Some(Uuid::new_v4()); }
                let method = match shape { "shared" => "SharedRead", "factory" => "FactoryIncrement", _ => "Increment" };
                let mut request = tonic::Request::new(TaskQueryRequest { amount:7 });
                *request.metadata_mut() = headers.to_metadata().unwrap();
                request.set_timeout(Duration::from_secs(2));
                client.unary::<_,TaskQueryResponse,_>(request,format!("/tests.reboot.protoc.TransactionCounterWritesMethods/{method}").parse().unwrap(),tonic::codec::ProstCodec::default()).await.unwrap_err()
            }))
        };
        assert_eq!(error.code(), if shape == "duplicate" { tonic::Code::InvalidArgument } else { tonic::Code::FailedPrecondition }, "{shape}: {error}");
        if matches!(shape, "self" | "reentrant") {
            assert_eq!(error.message(), "tree actors must be distinct and non-reentrant");
            assert!(tree.marker(1,"path").exists(), "supported B handler actually attempted forbidden child");
            assert!(!tree.marker(2,"path").exists());
            tree.abort_and_readmit(&mut hosts);
        } else {
            assert!(!tree.marker(1,"path").exists(), "{shape} entered unsupported handler");
            assert!(tree.decision().is_none(), "{shape} manufactured a root outcome");
            for actor in 0..3 {
                assert_eq!(tree.rpc(actor,"Apply",0,Duration::from_secs(2)).unwrap(), [5,20,40][actor], "{shape}: actor {actor} admission leaked");
            }
            tree.states([5,20,40]);
        }
        SupervisedTree::stop(&mut hosts);
        tree.restart();
        tree.states([5,20,40]);
        tree.planner.stop();
    }
}
