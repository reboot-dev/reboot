// Remote tasks are owned by the target singleton, never the root dispatcher.
impl DistributedTasks {
    fn leaf_command(&self) -> Command {
        let mut command = self.command_with_root_tasks(false, false);
        let plan = placement_proto::ListenForPlanResponse::decode(
            URL_SAFE_NO_PAD
                .decode(legacy_plan_for(&[
                    ("root", self.root_port),
                    ("target", self.target_port),
                ]))
                .unwrap()
                .as_slice(),
        )
        .unwrap();
        let server = plan
            .servers
            .iter()
            .find(|server| server.address.as_ref().unwrap().port == i32::from(self.target_port))
            .unwrap();
        command.args([
            "--remote-reader-task",
            "--task-marker",
            self.marker().to_str().unwrap(),
            "--live-watch",
            "--watch-coordinator-state-ref",
            "root",
            "--server-id",
            &server.id,
        ]);
        command
    }
    fn leaf_id(&self) -> database::TaskId {
        let mut id = self.task_id();
        id.state_ref = "target".into();
        id
    }
    fn leaf_wait(&self, id: &database::TaskId, expected: i64) {
        let result = self.markers.path().join("leaf-typed-wait");
        let mut child = WaitHostGuard(
            Command::new(&self.binary)
                .args([
                    "--role",
                    "wait-result",
                    "--listen",
                    &format!("127.0.0.1:{}", self.target_port),
                    "--state-ref",
                    "target",
                    "--task-uuid",
                    &Uuid::from_slice(&id.task_uuid).unwrap().to_string(),
                    "--result-marker",
                    result.to_str().unwrap(),
                ])
                .spawn()
                .unwrap(),
        );
        await_marker(&result, &mut child);
        assert!(child.wait().unwrap().success());
        assert_eq!(
            std::fs::read_to_string(result).unwrap(),
            expected.to_string()
        );
    }
    fn leaf_states(&self, root: u8, target: u8) {
        assert_eq!(
            self.runtime
                .block_on(load_state(&self.root_db.endpoint(), "root")),
            Some(vec![8, root])
        );
        assert_eq!(
            self.runtime
                .block_on(load_state(&self.target_db.endpoint(), "target")),
            Some(vec![8, target])
        );
        assert!(
            self.runtime
                .block_on(pending_tasks(&self.root_db.endpoint()))
                .is_empty(),
            "remote task leaked onto root"
        );
    }
}
fn leaf_mutation_once(port: u16, timeout: Duration) -> Result<i64, Box<tonic::Status>> {
    tokio::runtime::Runtime::new().unwrap().block_on(async {
        let channel = tonic::transport::Endpoint::from_shared(format!("http://127.0.0.1:{port}"))
            .unwrap()
            .connect_lazy();
        let mut client = tonic::client::Grpc::new(channel);
        client.ready().await.unwrap();
        let mut request = tonic::Request::new(TaskQueryRequest { amount: 7 });
        request
            .metadata_mut()
            .insert("x-reboot-state-ref", "root".parse().unwrap());
        request.set_timeout(timeout);
        client
            .unary::<_, TaskQueryResponse, _>(
                request,
                "/tests.reboot.protoc.TransactionCounterWritesMethods/Increment"
                    .parse()
                    .unwrap(),
                tonic::codec::ProstCodec::default(),
            )
            .await
            .map(|response| response.into_inner().value)
            .map_err(Box::new)
    })
}
#[test]
#[ignore = "requires REBOOT_NATIVE2PC_CXX_DATABASE real C++ Database/RocksDB"]
fn remote_leaf_reader_tasks_commit_delayed_prepared_restart_and_redelivery() {
    for scenario in ["immediate", "delayed", "prepared-restart"] {
        let mut fixture = DistributedTasks::new();
        let mut target_command = fixture.leaf_command();
        let due = chrono::Utc::now().timestamp() + 4;
        if scenario == "delayed" {
            target_command.args(["--task-vector", &format!("delayed:{due}")]);
        }
        target_command.env(
            "REBOOT_TEST_TASK_DISPATCH_HINT",
            fixture.markers.path().join("inbound-hint"),
        );
        let mut target = fixture.spawn(&mut target_command, "leaf-target-log");
        wait(fixture.target_port);
        assert_eq!(
            fixture
                .rpc(false, "Query", 0, Duration::from_secs(1))
                .unwrap(),
            20
        );
        let decision = fixture.markers.path().join("decision");
        let staged = fixture.markers.path().join("staged-root");
        let hint = fixture.markers.path().join("inbound-hint");
        let mut root_command = fixture.command_with_root_tasks(true, false);
        if scenario == "prepared-restart" {
            root_command
                .env("REBOOT_TEST_PAUSE_AFTER_COORDINATOR_PREPARE", &decision)
                .env("REBOOT_TEST_ROOT_AFTER_REMOTE", &staged);
        }
        let mut root = fixture.spawn(&mut root_command, "leaf-root-log");
        wait(fixture.root_port);
        assert_eq!(
            fixture
                .rpc(true, "Query", 0, Duration::from_secs(1))
                .unwrap(),
            5
        );
        if scenario == "prepared-restart" {
            let port = fixture.root_port;
            let call = std::thread::spawn(move || leaf_mutation_once(port, Duration::from_secs(5)));
            await_marker(&staged, &mut root);
            std::thread::sleep(Duration::from_millis(350));
            assert!(
                !hint.exists(),
                "inbound success emitted a predecision dispatch hint"
            );
            assert!(
                !fixture.marker().exists(),
                "reader ran on staged effects before Prepare"
            );
            assert!(target.try_wait().unwrap().is_none());
            fixture.leaf_states(5, 20);
            assert!(
                fixture
                    .runtime
                    .block_on(pending_tasks(&fixture.target_db.endpoint()))
                    .is_empty()
            );
            std::fs::write(staged.with_extension("release"), b"allow root Prepare").unwrap();
            await_marker(&decision, &mut root);
            assert_eq!(
                fixture.decision().unwrap().outcome,
                database::transaction_coordinator_decision::Outcome::Commit as i32
            );
            fixture.leaf_states(5, 20);
            // Real durable target Prepare includes the actual task before any
            // terminal control; scans cannot deliver the uncommitted record.
            let prepared = fixture.runtime.block_on(async {
                let mut db = database::database_client::DatabaseClient::connect(
                    fixture.target_db.endpoint(),
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
            assert_eq!(prepared[0].uncommitted_tasks.len(), 1);
            let id = fixture.leaf_id();
            assert_eq!(prepared[0].uncommitted_tasks[0].task_id.as_ref(), Some(&id));
            std::thread::sleep(Duration::from_millis(350));
            assert!(
                !fixture.marker().exists(),
                "reader ran before target Commit ACK"
            );
            assert!(
                target.try_wait().unwrap().is_none(),
                "uncommitted hint killed target"
            );
            DistributedTasks::stop(&mut root);
            DistributedTasks::stop(&mut target);
            assert!(call.join().unwrap().is_err());
            fixture.root_db.restart();
            fixture.target_db.restart();
            let mut target_recovery = fixture.leaf_command();
            target_recovery.args(["--recover", "--block-task"]);
            target = fixture.spawn(&mut target_recovery, "leaf-recovery-target-log");
            wait(fixture.target_port); // target recovery begins before root.
            let mut root_recovery = fixture.command_with_root_tasks(true, false);
            root_recovery.arg("--recover");
            root = fixture.spawn(&mut root_recovery, "leaf-recovery-root-log");
            await_marker(&fixture.marker(), &mut target);
            fixture.leaf_states(12, 27);
            assert_eq!(
                fixture
                    .runtime
                    .block_on(load_task(&fixture.target_db.endpoint(), id.clone()))
                    .status,
                database::task::Status::Pending as i32
            );
            assert_eq!(
                std::fs::read_to_string(format!("{}.invocations", fixture.marker().display()))
                    .unwrap()
                    .lines()
                    .count(),
                1
            );
            DistributedTasks::stop(&mut target);
            DistributedTasks::stop(&mut root);
            fixture.root_db.restart();
            fixture.target_db.restart();
            std::fs::remove_file(fixture.marker()).unwrap();
            let mut target_recovery = fixture.leaf_command();
            target_recovery.arg("--recover");
            target = fixture.spawn(&mut target_recovery, "leaf-redelivery-target-log");
            wait(fixture.target_port);
            root = fixture.spawn(&mut root_recovery, "leaf-redelivery-root-log");
            assert_eq!(
                fixture
                    .rpc(false, "Query", 0, Duration::from_secs(1))
                    .unwrap(),
                27
            );
            fixture.leaf_wait(&id, 27);
            let completed = fixture
                .runtime
                .block_on(load_task(&fixture.target_db.endpoint(), id.clone()));
            assert_eq!(completed.status, database::task::Status::Completed as i32);
            assert_eq!(
                std::fs::read_to_string(format!("{}.invocations", fixture.marker().display()))
                    .unwrap()
                    .lines()
                    .count(),
                2
            );
            DistributedTasks::stop(&mut target);
            DistributedTasks::stop(&mut root);
            fixture.root_db.restart();
            fixture.target_db.restart();
            target = fixture.spawn(&mut target_recovery, "leaf-completed-target-log");
            wait(fixture.target_port);
            root = fixture.spawn(&mut root_recovery, "leaf-completed-root-log");
            assert_eq!(
                fixture
                    .rpc(false, "Query", 0, Duration::from_secs(1))
                    .unwrap(),
                27
            );
            fixture.leaf_wait(&id, 27);
            assert_eq!(
                fixture
                    .runtime
                    .block_on(load_task(&fixture.target_db.endpoint(), id)),
                completed
            );
            assert_eq!(
                std::fs::read_to_string(format!("{}.invocations", fixture.marker().display()))
                    .unwrap()
                    .lines()
                    .count(),
                2,
                "completed remote task replayed"
            );
        } else {
            assert_eq!(
                leaf_mutation_once(fixture.root_port, Duration::from_secs(2)).unwrap(),
                12
            );
            fixture.leaf_states(12, 27);
            let id = fixture.leaf_id();
            if scenario == "delayed" {
                assert!(!fixture.marker().exists());
                let task = fixture
                    .runtime
                    .block_on(load_task(&fixture.target_db.endpoint(), id.clone()));
                assert_eq!(task.status, database::task::Status::Pending as i32);
                assert_eq!(task.timestamp.as_ref().unwrap().seconds, due);
            }
            fixture.leaf_wait(&id, 27);
            assert_eq!(
                std::fs::read_to_string(format!("{}.invocations", fixture.marker().display()))
                    .unwrap()
                    .lines()
                    .count(),
                1
            );
            if scenario == "delayed" {
                let started: u128 =
                    std::fs::read_to_string(format!("{}.started-at", fixture.marker().display()))
                        .unwrap()
                        .parse()
                        .unwrap();
                assert!(started >= u128::try_from(due).unwrap() * 1_000_000_000);
            }
        }
        DistributedTasks::stop(&mut root);
        DistributedTasks::stop(&mut target);
        fixture.planner.stop();
    }
}
