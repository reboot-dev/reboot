#[test]
#[ignore = "requires REBOOT_NATIVE2PC_CXX_DATABASE real C++ Database/RocksDB"]
fn remote_leaf_tasks_real_prepare_deadline_and_lost_remote_commit_ack_restart() {
    for scenario in ["prepare-deadline", "lost-commit-ack"] {
        let mut fixture = DistributedTasks::new();
        let barrier = fixture.markers.path().join("uncertainty");
        let retained = fixture.markers.path().join("retained-before-error");
        let observed = fixture
            .markers
            .path()
            .join("live-watch-terminal-uncertainty");
        let lookup = fixture.markers.path().join("live-watch-lookup");
        let mut target_command = fixture.leaf_command();
        if scenario == "lost-commit-ack" {
            target_command
                .env("REBOOT_TEST_LOST_PARTICIPANT_COMMIT_ACK", &barrier)
                .env("REBOOT_TEST_REMOTE_COMMIT_ACK_RELEASE", &retained)
                .env("REBOOT_TEST_LIVE_WATCH_TERMINAL_UNCERTAINTY", &observed)
                .env("REBOOT_TEST_LIVE_WATCH_BEFORE_LOOKUP", &lookup);
        }
        let mut target = fixture.spawn(&mut target_command, "leaf-uncertain-target-log");
        wait(fixture.target_port);
        assert_eq!(
            fixture
                .rpc(false, "Apply", 0, Duration::from_secs(1))
                .unwrap(),
            20
        );
        let mut root_command = fixture.command_with_root_tasks(true, false);
        if scenario == "prepare-deadline" {
            root_command.env("REBOOT_TEST_ROOT_PREPARE_PARK", &barrier);
        }
        let mut root = fixture.spawn(&mut root_command, "leaf-uncertain-root-log");
        wait(fixture.root_port);
        assert_eq!(
            fixture
                .rpc(true, "Query", 0, Duration::from_secs(1))
                .unwrap(),
            5
        );
        let port = fixture.root_port;
        // Only prepare-deadline tests deadline cancellation. Lost ACK must not
        // race an unrelated root deadline before self-Watch observes Commit.
        let timeout = if scenario == "prepare-deadline" {
            Duration::from_millis(800)
        } else {
            Duration::from_secs(10)
        };
        let call = std::thread::spawn(move || leaf_mutation_once(port, timeout));
        await_marker(
            &barrier,
            if scenario == "prepare-deadline" {
                &mut root
            } else {
                &mut target
            },
        );
        assert!(
            !fixture.marker().exists(),
            "reader acquired uncertain actor before terminal ACK"
        );
        if scenario == "lost-commit-ack" {
            let id = fixture.leaf_id();
            assert_eq!(
                fixture
                    .runtime
                    .block_on(load_task(&fixture.target_db.endpoint(), id))
                    .status,
                database::task::Status::Pending as i32
            );
            assert_eq!(
                fixture
                    .runtime
                    .block_on(load_state(&fixture.target_db.endpoint(), "target")),
                Some(vec![8, 27])
            );
            // Explicit exclusive writer, not a read probe, while the actual
            // sidecar Commit ACK is held under retained participant ownership.
            let status = fixture.runtime.block_on(async {
                let channel = tonic::transport::Endpoint::from_shared(format!(
                    "http://127.0.0.1:{}",
                    fixture.target_port
                ))
                .unwrap()
                .connect_lazy();
                let mut client = tonic::client::Grpc::new(channel);
                client.ready().await.unwrap();
                let mut request = tonic::Request::new(TaskQueryRequest { amount: 0 });
                request
                    .metadata_mut()
                    .insert("x-reboot-state-ref", "target".parse().unwrap());
                request.metadata_mut().insert(
                    "x-reboot-idempotency-key",
                    Uuid::new_v4().to_string().parse().unwrap(),
                );
                request.set_timeout(Duration::from_millis(150));
                client
                    .unary::<_, TaskQueryResponse, _>(
                        request,
                        "/tests.reboot.protoc.TransactionCounterWritesMethods/Apply"
                            .parse()
                            .unwrap(),
                        tonic::codec::ProstCodec::default(),
                    )
                    .await
                    .unwrap_err()
            });
            assert!(
                matches!(
                    status.code(),
                    tonic::Code::Cancelled | tonic::Code::DeadlineExceeded
                ),
                "uncertain lease released: {status}"
            );
            assert!(!fixture.marker().exists());
            std::fs::write(
                &retained,
                b"exclusive writer blocked before lost ACK surfaces",
            )
            .unwrap();
            // Force coordinator-driven Commit to win. Root failure is observed
            // BEFORE self-Watch resumes, so no successful root Watch response
            // can accidentally mask missing terminal-uncertainty supervision.
            await_marker(&lookup, &mut target);
            fixture.await_exit(&mut root, "leaf-uncertain-root-log");
            std::fs::write(
                lookup.with_extension("release"),
                b"root stopped; inspect retained terminal attempt",
            )
            .unwrap();
            fixture.await_exit(&mut target, "leaf-uncertain-target-log");
            assert!(
                observed.exists(),
                "target failure did not observe retained terminal attempt"
            );
            assert_eq!(
                std::fs::read_to_string(barrier.with_extension("attempts"))
                    .unwrap()
                    .lines()
                    .count(),
                1,
                "actor-only lost ACK retried"
            );
            assert_eq!(
                fixture.decision().unwrap().outcome,
                database::transaction_coordinator_decision::Outcome::Commit as i32
            );
        } else {
            fixture.await_exit(&mut root, "leaf-uncertain-root-log");
            assert!(barrier.with_extension("future-dropped").exists());
            assert!(
                fixture.decision().is_none(),
                "posthandoff uncertainty manufactured competing Abort"
            );
            fixture.leaf_states(5, 20);
            let records = fixture.runtime.block_on(async {
                let mut client =
                    database::database_client::DatabaseClient::connect(fixture.root_db.endpoint())
                        .await
                        .unwrap();
                let mut stream = client
                    .recover(database::RecoverRequest {
                        shard_ids: vec!["s000000000".into()],
                        skip_idempotent_mutations: true,
                        ..Default::default()
                    })
                    .await
                    .unwrap()
                    .into_inner();
                let mut records = Vec::new();
                while let Some(batch) = stream.message().await.unwrap() {
                    records.extend(batch.transaction_coordinators);
                }
                records
            });
            assert_eq!(records.len(), 1);
            assert_eq!(records[0].1.participants.as_ref().unwrap().should_commit["tests.reboot.protoc.TransactionCounter"].state_refs, ["root", "target"]);
        }
        assert!(call.join().unwrap().is_err());
        DistributedTasks::stop(&mut root);
        DistributedTasks::stop(&mut target);
        fixture.root_db.restart();
        fixture.target_db.restart();
        let mut command = fixture.leaf_command();
        command.arg("--recover");
        target = fixture.spawn(&mut command, "leaf-uncertain-restart-target-log");
        wait(fixture.target_port);
        let mut command = fixture.command_with_root_tasks(true, false);
        command.arg("--recover");
        root = fixture.spawn(&mut command, "leaf-uncertain-restart-root-log");
        wait(fixture.root_port);
        assert_eq!(
            fixture
                .rpc(true, "Query", 0, Duration::from_secs(1))
                .unwrap(),
            if scenario == "prepare-deadline" {
                5
            } else {
                12
            }
        );
        if scenario == "prepare-deadline" {
            assert_eq!(
                fixture
                    .rpc(false, "Apply", 0, Duration::from_secs(2))
                    .unwrap(),
                20
            );
            assert_eq!(
                fixture
                    .rpc(true, "Apply", 0, Duration::from_secs(2))
                    .unwrap(),
                5
            );
            fixture.leaf_states(5, 20);
            assert_eq!(
                fixture.decision().unwrap().outcome,
                database::transaction_coordinator_decision::Outcome::Abort as i32
            );
            assert!(
                fixture
                    .runtime
                    .block_on(pending_tasks(&fixture.target_db.endpoint()))
                    .is_empty()
            );
            assert!(!fixture.marker().exists());
        } else {
            fixture.leaf_wait(&fixture.leaf_id(), 27);
            fixture.leaf_states(12, 27);
            assert_eq!(
                std::fs::read_to_string(format!("{}.invocations", fixture.marker().display()))
                    .unwrap()
                    .lines()
                    .count(),
                1
            );
        }
        DistributedTasks::stop(&mut root);
        DistributedTasks::stop(&mut target);
    }
}
