// Explicit pre-handoff tree failure; ownerless distributed task staging stays rejected.
#[test]
#[ignore = "requires REBOOT_NATIVE2PC_CXX_DATABASE real C++ Database/RocksDB"]
fn distributed_task_admission_failure_must_release_remote_actor() {
    explicit_distributed_root_failure_acceptance(false, false, false);
}

#[test]
#[ignore = "requires REBOOT_NATIVE2PC_CXX_DATABASE real C++ Database/RocksDB"]
fn distributed_direct_handler_failure_must_release_remote_actor() {
    explicit_distributed_root_failure_acceptance(true, false, false);
}

#[test]
#[ignore = "requires REBOOT_NATIVE2PC_CXX_DATABASE real C++ Database/RocksDB"]
fn owned_explicit_abort_survives_generated_rpc_deadline() {
    explicit_distributed_root_failure_acceptance(true, true, false);
}

#[test]
#[ignore = "requires REBOOT_NATIVE2PC_CXX_DATABASE real C++ Database/RocksDB"]
fn owned_root_handler_cancellation_survives_generated_rpc_deadline() {
    explicit_distributed_root_failure_acceptance(true, true, true);
}

fn explicit_distributed_root_failure_acceptance(
    handler_error: bool,
    cancelled: bool,
    handler_cancelled: bool,
) {
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
    let database_binary = std::env::var("REBOOT_NATIVE2PC_CXX_DATABASE").unwrap();
    let mut root_db = CxxDatabase::start(database_binary.clone());
    let target_db = CxxDatabase::start(database_binary);
    let runtime = tokio::runtime::Runtime::new().unwrap();
    runtime.block_on(store_counter(&root_db.endpoint(), "root", 5));
    runtime.block_on(store_counter(&target_db.endpoint(), "target", 20));
    let root_port = port();
    let target_port = port();
    let plan = placement_proto::ListenForPlanResponse::decode(
        URL_SAFE_NO_PAD
            .decode(legacy_plan_for(&[
                ("root", root_port),
                ("target", target_port),
            ]))
            .unwrap()
            .as_slice(),
    )
    .unwrap();
    let planner = LivePlannerServer::start(&runtime, plan);
    let markers = tempfile::tempdir().unwrap();
    let reader = markers.path().join("reader");
    let ack = markers.path().join("ack");
    let id = Uuid::new_v4().to_string();
    let mut target = WaitHostGuard(
        Command::new(&binary)
            .args([
                "--role",
                "target",
                "--database",
                &target_db.endpoint(),
                "--listen",
                &format!("127.0.0.1:{target_port}"),
                "--placement-planner",
                &planner.endpoint,
                "--root-id",
                &id,
                "--state-ref",
                "target",
                "--coordinator-state-ref",
                "target",
            ])
            .spawn()
            .unwrap(),
    );
    wait(target_port);
    planner.wait_for_connections(1);
    let probe_once = || {
        runtime.block_on(async {
            let channel =
                tonic::transport::Endpoint::from_shared(format!("http://127.0.0.1:{target_port}"))
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
            request.set_timeout(Duration::from_millis(350));
            client
                .unary::<_, TaskQueryResponse, _>(
                    request,
                    "/tests.reboot.protoc.TransactionCounterWritesMethods/Apply"
                        .parse()
                        .unwrap(),
                    tonic::codec::ProstCodec::default(),
                )
                .await
                .map_err(Box::new)
        })
    };
    let probe = || {
        let deadline = std::time::Instant::now() + Duration::from_secs(2);
        loop {
            let result = probe_once();
            if matches!(&result, Err(status) if matches!(status.code(), tonic::Code::Unavailable | tonic::Code::DeadlineExceeded | tonic::Code::Cancelled))
                && std::time::Instant::now() < deadline
            {
                std::thread::sleep(Duration::from_millis(20));
                continue;
            }
            break result;
        }
    };
    assert_eq!(
        probe().unwrap().into_inner().value,
        20,
        "baseline generated target reader"
    );
    let park = markers.path().join("abort-park");
    let handler_park = markers.path().join("handler-park");
    let mut root_command = Command::new(&binary);
    if handler_cancelled {
        root_command.env("REBOOT_TEST_ROOT_HANDLER_PARK", &handler_park);
    }
    if cancelled {
        root_command
            .env("REBOOT_TEST_EXPLICIT_ABORT_PARK", &park)
            .arg("--owned-explicit-abort");
    }
    let mut root = WaitHostGuard(
        root_command
            .args([
                "--role",
                "root",
                "--database",
                &root_db.endpoint(),
                "--listen",
                &format!("127.0.0.1:{root_port}"),
                "--placement-planner",
                &planner.endpoint,
                "--root-id",
                &id,
                "--state-ref",
                "root",
                "--coordinator-state-ref",
                "root",
                "--root-reader-task",
                reader.to_str().unwrap(),
                if handler_error {
                    "--root-handler-error"
                } else {
                    "--root-task-invalid"
                },
                "--task-vector",
                if handler_error {
                    "handler-error"
                } else {
                    "no-owner"
                },
                "--expect-task-error",
                if cancelled {
                    "--no-invoke"
                } else {
                    "--exit-after-invoke"
                },
                if cancelled { "--no-invoke" } else { "--invoke" },
                "--invoke-marker",
                ack.to_str().unwrap(),
            ])
            .spawn()
            .unwrap(),
    );
    if cancelled {
        wait(root_port);
        planner.wait_for_connections(2);
        runtime.block_on(async {
            let channel =
                tonic::transport::Endpoint::from_shared(format!("http://127.0.0.1:{root_port}"))
                    .unwrap()
                    .connect_lazy();
            let mut client = tonic::client::Grpc::new(channel);
            tokio::time::timeout(Duration::from_secs(3), async {
                loop {
                    client.ready().await.unwrap();
                    let mut request = tonic::Request::new(TaskQueryRequest { amount: 1 });
                    request
                        .metadata_mut()
                        .insert("x-reboot-state-ref", "root".parse().unwrap());
                    request.set_timeout(Duration::from_millis(500));
                    let error = client
                        .unary::<_, TaskQueryResponse, _>(
                            request,
                            "/tests.reboot.protoc.TransactionCounterWritesMethods/Increment"
                                .parse()
                                .unwrap(),
                            tonic::codec::ProstCodec::default(),
                        )
                        .await
                        .unwrap_err();
                    if error.code() == tonic::Code::Unavailable && !park.exists() {
                        tokio::time::sleep(Duration::from_millis(20)).await;
                        continue;
                    }
                    assert!(
                        matches!(
                            error.code(),
                            tonic::Code::Cancelled | tonic::Code::DeadlineExceeded
                        ),
                        "expected actual deadline: {error}"
                    );
                    break;
                }
            })
            .await
            .unwrap();
        });
        for _ in 0..100 {
            if park.with_extension("observer-dropped").exists() {
                break;
            }
            std::thread::sleep(Duration::from_millis(10));
        }
        assert!(park.exists(), "real DecisionPut ACK barrier not reached");
        if handler_cancelled {
            assert!(handler_park.exists());
            assert!(
                handler_park.with_extension("handler-dropped").exists(),
                "handler must Drop before owned worker Abort decision"
            );
        }
        assert!(
            park.with_extension("observer-dropped").exists(),
            "actual generated response observer was not dropped by Tonic deadline"
        );
        std::fs::write(park.with_extension("release"), b"release owned cleanup").unwrap();
        assert_eq!(
            probe()
                .expect("owned cleanup did not release remote")
                .into_inner()
                .value,
            20
        );
        runtime.block_on(async {
            let channel =
                tonic::transport::Endpoint::from_shared(format!("http://127.0.0.1:{root_port}"))
                    .unwrap()
                    .connect_lazy();
            let mut client = tonic::client::Grpc::new(channel);
            client.ready().await.unwrap();
            let mut request = tonic::Request::new(TaskQueryRequest { amount: 0 });
            request
                .metadata_mut()
                .insert("x-reboot-state-ref", "root".parse().unwrap());
            request.metadata_mut().insert(
                "x-reboot-idempotency-key",
                Uuid::new_v4().to_string().parse().unwrap(),
            );
            request.set_timeout(Duration::from_secs(1));
            assert_eq!(
                client
                    .unary::<_, TaskQueryResponse, _>(
                        request,
                        "/tests.reboot.protoc.TransactionCounterWritesMethods/Apply"
                            .parse()
                            .unwrap(),
                        tonic::codec::ProstCodec::default()
                    )
                    .await
                    .expect("root exclusive re-admission failed")
                    .into_inner()
                    .value,
                5
            );
        });
        assert!(root.try_wait().unwrap().is_none());
        root.kill().unwrap();
        root.wait().unwrap();
    } else {
        for _ in 0..200 {
            if root.try_wait().unwrap().is_some() {
                break;
            }
            std::thread::sleep(Duration::from_millis(25));
        }
        assert!(
            root.try_wait()
                .unwrap()
                .expect("root denial did not return")
                .success()
        );
    }
    assert!(!reader.exists());
    assert!(
        std::path::Path::new(&format!("{}.task-id", reader.display())).exists(),
        "handler must finish successful remote enlistment before denial"
    );
    assert_eq!(
        probe()
            .expect("remote actor ownership leaked after explicit root rejection")
            .into_inner()
            .value,
        20
    );
    let decision = runtime.block_on(async {
        let mut database = database::database_client::DatabaseClient::connect(root_db.endpoint())
            .await
            .unwrap();
        let decision = database
            .transaction_coordinator_decision_get(
                database::TransactionCoordinatorDecisionGetRequest {
                    root_transaction_id: Uuid::parse_str(&id).unwrap().as_bytes().to_vec(),
                    coordinator_state_ref: "root".into(),
                },
            )
            .await
            .unwrap()
            .into_inner()
            .decision
            .unwrap();
        assert_eq!(
            decision.outcome,
            database::transaction_coordinator_decision::Outcome::Abort as i32
        );
        assert!(decision.participants.is_none());
        // Explicit Abort must not manufacture a preparing coordinator record.
        let mut recovered = database
            .recover(database::RecoverRequest {
                shard_ids: vec!["s000000000".into()],
                skip_idempotent_mutations: true,
                ..Default::default()
            })
            .await
            .unwrap()
            .into_inner();
        while let Some(batch) = recovered.message().await.unwrap() {
            assert!(batch.transaction_coordinators.is_empty());
            assert!(batch.participant_transactions.is_empty());
        }
        decision
    });
    assert!(
        runtime
            .block_on(pending_tasks(&root_db.endpoint()))
            .is_empty()
    );
    assert!(
        runtime
            .block_on(pending_tasks(&target_db.endpoint()))
            .is_empty()
    );
    assert_eq!(
        runtime.block_on(load_state(&root_db.endpoint(), "root")),
        Some(vec![8, 5])
    );
    assert_eq!(
        runtime.block_on(load_state(&target_db.endpoint(), "target")),
        Some(vec![8, 20])
    );
    assert!(
        target.try_wait().unwrap().is_none(),
        "target host should remain alive"
    );
    assert_eq!(
        probe()
            .expect("remote actor ownership leaked after root task admission denial")
            .into_inner()
            .value,
        20
    );
    target.kill().unwrap();
    target.wait().unwrap();
    root_db.restart();
    runtime.block_on(async {
        let mut database = database::database_client::DatabaseClient::connect(root_db.endpoint())
            .await
            .unwrap();
        let request = database::TransactionCoordinatorDecisionGetRequest {
            root_transaction_id: Uuid::parse_str(&id).unwrap().as_bytes().to_vec(),
            coordinator_state_ref: "root".into(),
        };
        assert_eq!(
            database
                .transaction_coordinator_decision_get(request.clone())
                .await
                .unwrap()
                .into_inner()
                .decision,
            Some(decision)
        );
        // A reused UUID cannot turn an aborted tree into a durable Commit.
        assert_eq!(
            database
                .transaction_coordinator_decision_put(
                    database::TransactionCoordinatorDecisionPutRequest {
                        root_transaction_id: request.root_transaction_id,
                        decision: Some(database::TransactionCoordinatorDecision {
                            coordinator_state_ref: "root".into(),
                            outcome: database::transaction_coordinator_decision::Outcome::Commit
                                as i32,
                            participants: Some(database::Participants {
                                should_commit: [(
                                    "tests.reboot.protoc.TransactionCounter".into(),
                                    database::participants::StateRefs {
                                        state_refs: vec!["root".into()]
                                    }
                                )]
                                .into(),
                                ..Default::default()
                            }),
                        }),
                    }
                )
                .await
                .unwrap_err()
                .code(),
            tonic::Code::FailedPrecondition
        );
    });
    planner.stop();
}
