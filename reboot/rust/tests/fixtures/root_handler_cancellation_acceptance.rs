#[test]
#[ignore = "requires REBOOT_NATIVE2PC_CXX_DATABASE real C++ Database/RocksDB"]
fn owned_root_success_commits_confirmed_remote_membership() {
    coupled_root_acceptance("success");
}
#[test]
#[ignore = "requires REBOOT_NATIVE2PC_CXX_DATABASE real C++ Database/RocksDB"]
fn owned_root_postprepare_deadline_retains_without_competing_abort() {
    coupled_root_acceptance("handoff");
}
#[test]
#[ignore = "requires REBOOT_NATIVE2PC_CXX_DATABASE real C++ Database/RocksDB"]
fn owned_root_unfinished_outbound_deadline_publishes_authoritative_abort() {
    coupled_root_acceptance("unknown");
}
#[test]
#[ignore = "requires REBOOT_NATIVE2PC_CXX_DATABASE real C++ Database/RocksDB"]
fn owned_root_caught_outbound_failure_empty_membership_publishes_authoritative_abort() {
    coupled_root_acceptance("caught");
}

fn coupled_root_acceptance(scenario: &str) {
    let fixture = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("tests/fixtures/generated_cxx_database_process");
    crate::prepare_generated_host(&fixture);
    let binary = generated_host_binary(&fixture);
    let database_binary = std::env::var("REBOOT_NATIVE2PC_CXX_DATABASE").unwrap();
    let root_db = CxxDatabase::start(database_binary.clone());
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
    let outbound = markers.path().join("outbound-entered");
    let caught = markers.path().join("outbound-caught");
    let handoff = markers.path().join("handoff-ack");
    let root_log = markers.path().join("root-stderr");
    let id = Uuid::new_v4();
    let mut target_command = Command::new(&binary);
    if matches!(scenario, "unknown" | "caught") {
        target_command.args(["--live-watch", "--watch-coordinator-state-ref", "root"]).env("REBOOT_TEST_TARGET_UNFINISHED_OUTBOUND", &outbound);
    }
    if scenario == "caught" {
        target_command.arg("--unfinished-outbound-error");
    }
    let mut target = WaitHostGuard(
        target_command
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
                &id.to_string(),
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
    // Readiness and real exclusive baseline use Apply, not a shared reader.
    let probe = || {
        runtime.block_on(async {
            let channel =
                tonic::transport::Endpoint::from_shared(format!("http://127.0.0.1:{target_port}"))
                    .unwrap()
                    .connect_lazy();
            let mut client = tonic::client::Grpc::new(channel);
            let deadline = std::time::Instant::now() + Duration::from_secs(2);
            loop {
                client.ready().await.unwrap();
                let mut request = tonic::Request::new(TaskQueryRequest { amount: 0 });
                request
                    .metadata_mut()
                    .insert("x-reboot-state-ref", "target".parse().unwrap());
                request.metadata_mut().insert(
                    "x-reboot-idempotency-key",
                    Uuid::new_v4().to_string().parse().unwrap(),
                );
                request.set_timeout(Duration::from_millis(250));
                let result = client
                    .unary::<_, TaskQueryResponse, _>(
                        request,
                        "/tests.reboot.protoc.TransactionCounterWritesMethods/Apply"
                            .parse()
                            .unwrap(),
                        tonic::codec::ProstCodec::default(),
                    )
                    .await;
                if matches!(&result, Err(error) if error.code() == tonic::Code::Unavailable)
                    && std::time::Instant::now() < deadline
                {
                    tokio::time::sleep(Duration::from_millis(20)).await;
                    continue;
                }
                break result.map_err(Box::new);
            }
        })
    };
    assert_eq!(probe().unwrap().into_inner().value, 20);
    let mut root_command = Command::new(&binary);
    root_command.arg("--owned-explicit-abort");
    if scenario == "handoff" {
        root_command.env("REBOOT_TEST_ROOT_PREPARE_PARK", &handoff);
    }
    if scenario == "caught" {
        root_command.args([
            "--catch-outbound-error",
            "--outbound-error-marker",
            caught.to_str().unwrap(),
        ]);
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
                &id.to_string(),
                "--state-ref",
                "root",
                "--coordinator-state-ref",
                "root",
            ])
            .stderr(std::fs::File::create(&root_log).unwrap())
            .spawn()
            .unwrap(),
    );
    wait(root_port);
    planner.wait_for_connections(2);
    let result = runtime.block_on(async {
        let channel =
            tonic::transport::Endpoint::from_shared(format!("http://127.0.0.1:{root_port}"))
                .unwrap()
                .connect_lazy();
        let mut client = tonic::client::Grpc::new(channel);
        let deadline = std::time::Instant::now() + Duration::from_secs(3);
        loop {
            client.ready().await.unwrap();
            let mut request = tonic::Request::new(TaskQueryRequest { amount: 1 });
            request
                .metadata_mut()
                .insert("x-reboot-state-ref", "root".parse().unwrap());
            request.set_timeout(Duration::from_millis(500));
            let result = client
                .unary::<_, TaskQueryResponse, _>(
                    request,
                    "/tests.reboot.protoc.TransactionCounterWritesMethods/Increment"
                        .parse()
                        .unwrap(),
                    tonic::codec::ProstCodec::default(),
                )
                .await;
            if matches!(&result, Err(error) if error.code() == tonic::Code::Unavailable)
                && !outbound.exists()
                && !handoff.exists()
                && std::time::Instant::now() < deadline
            {
                tokio::time::sleep(Duration::from_millis(20)).await;
                continue;
            }
            break result;
        }
    });
    if scenario == "success" {
        assert_eq!(result.unwrap().into_inner().value, 6);
        assert!(root.try_wait().unwrap().is_none());
        assert_eq!(probe().unwrap().into_inner().value, 21);
    } else if matches!(scenario, "unknown" | "caught") {
        let status = result.unwrap_err();
        if scenario == "caught" { assert!(caught.exists()); }
        else { assert!(matches!(status.code(), tonic::Code::Cancelled | tonic::Code::DeadlineExceeded)); }
        await_marker(&outbound.with_extension("handler-dropped"), &mut target);
        let deadline = std::time::Instant::now() + Duration::from_secs(2);
        loop {
            let decision = runtime.block_on(async {
                database::database_client::DatabaseClient::connect(root_db.endpoint()).await.unwrap()
                    .transaction_coordinator_decision_get(database::TransactionCoordinatorDecisionGetRequest {
                        root_transaction_id: id.as_bytes().to_vec(), coordinator_state_ref: "root".into(),
                    }).await.unwrap().into_inner().decision
            });
            if decision.is_some() { break; }
            assert!(std::time::Instant::now() < deadline); std::thread::sleep(Duration::from_millis(10));
        }
        assert!(root.try_wait().unwrap().is_none());
        assert_eq!(probe().unwrap().into_inner().value, 20);
    } else {
        let status = result.unwrap_err();
        if scenario != "caught" {
            assert!(
                matches!(
                    status.code(),
                    tonic::Code::Cancelled | tonic::Code::DeadlineExceeded
                ),
                "{status}"
            );
        }
        if scenario == "handoff" {
            assert!(
                handoff.exists(),
                "real CoordinatorPrepare was not acknowledged"
            );
        } else {
            assert!(
                outbound.exists(),
                "actual generated outbound did not reach remote handler"
            );
        }
        if scenario == "caught" {
            assert!(
                caught.exists(),
                "handler did not catch uncertain generated call"
            );
        }
        let deadline = std::time::Instant::now() + Duration::from_secs(3);
        let exit = loop {
            if let Some(exit) = root.try_wait().unwrap() {
                break exit;
            }
            assert!(
                std::time::Instant::now() < deadline,
                "host did not fail under supervision: {}",
                std::fs::read_to_string(&root_log).unwrap()
            );
            std::thread::sleep(Duration::from_millis(10));
        };
        assert!(
            !exit.success(),
            "uncertain host must fail, not quietly complete"
        );
        let log = std::fs::read_to_string(&root_log).unwrap();
        assert!(
            log.contains("RecoveryTask"),
            "not a supervised ownership failure: {log}"
        );
        if scenario == "handoff" {
            assert!(log.contains("after durable handoff"), "{log}");
        } else {
            assert!(log.contains("outbound"), "{log}");
        }
        if matches!(scenario, "unknown" | "handoff") {
            assert!(
                matches!(probe(), Err(error) if matches!(error.code(), tonic::Code::Cancelled | tonic::Code::DeadlineExceeded)),
                "remote live exclusive ownership must remain retained"
            );
        } else {
            assert_eq!(probe().unwrap().into_inner().value, 20);
        }
    }
    runtime.block_on(async {
        let mut database = database::database_client::DatabaseClient::connect(root_db.endpoint()).await.unwrap();
        let decision = database.transaction_coordinator_decision_get(database::TransactionCoordinatorDecisionGetRequest {
            root_transaction_id: id.as_bytes().to_vec(), coordinator_state_ref: "root".into(),
        }).await.unwrap().into_inner().decision;
        if scenario == "success" {
            assert_eq!(decision.unwrap().outcome, database::transaction_coordinator_decision::Outcome::Commit as i32);
        } else if matches!(scenario, "unknown" | "caught") {
            assert_eq!(decision.unwrap().outcome, database::transaction_coordinator_decision::Outcome::Abort as i32);
        } else { assert!(decision.is_none(), "post-handoff uncertainty must not manufacture Abort"); }
        let mut recovered = database.recover(database::RecoverRequest {
            shard_ids: vec!["s000000000".into()], skip_idempotent_mutations: true, ..Default::default()
        }).await.unwrap().into_inner();
        let mut coordinators = Vec::new();
        while let Some(batch) = recovered.message().await.unwrap() { coordinators.extend(batch.transaction_coordinators); }
        if scenario == "handoff" {
            assert_eq!(coordinators.len(), 1);
            let record = &coordinators[0].1;
            assert!(record.preparing);
            let refs = &record.participants.as_ref().unwrap().should_commit["tests.reboot.protoc.TransactionCounter"].state_refs;
            assert_eq!(refs, &["root", "target"], "full confirmed membership must survive handoff");
        } else { assert!(coordinators.is_empty()); }
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
    let (root_value, target_value) = if scenario == "success" {
        (6, 21)
    } else {
        (5, 20)
    };
    assert_eq!(
        runtime.block_on(load_state(&root_db.endpoint(), "root")),
        Some(vec![8, root_value])
    );
    assert_eq!(
        runtime.block_on(load_state(&target_db.endpoint(), "target")),
        Some(vec![8, target_value])
    );
    assert!(
        target.try_wait().unwrap().is_none(),
        "target host should remain live"
    );
    root.kill().ok();
    root.wait().unwrap();
    target.kill().unwrap();
    target.wait().unwrap();
    planner.stop();
}
