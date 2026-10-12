use super::*;
const STATE: &str = "tests.reboot.protoc.TransactionCounter";

async fn records(endpoint: &str) -> Vec<database::RecoverResponse> {
    let mut client = database::database_client::DatabaseClient::connect(endpoint.to_owned())
        .await
        .unwrap();
    let mut stream = client
        .recover(database::RecoverRequest {
            state_tags_by_state_type: [(STATE.into(), "TransactionCounter".into())].into(),
            shard_ids: vec!["s000000000".into()],
            skip_idempotent_mutations: true,
        })
        .await
        .unwrap()
        .into_inner();
    let mut batches = Vec::new();
    while let Some(batch) = stream.message().await.unwrap() {
        batches.push(batch);
    }
    batches
}
async fn decision(
    endpoint: &str,
    coordinator: &str,
) -> Option<database::TransactionCoordinatorDecision> {
    database::database_client::DatabaseClient::connect(endpoint.to_owned())
        .await
        .unwrap()
        .transaction_coordinator_decision_get(database::TransactionCoordinatorDecisionGetRequest {
            root_transaction_id: Uuid::parse_str("00000000-0000-0000-0000-000000000201")
                .unwrap()
                .as_bytes()
                .to_vec(),
            coordinator_state_ref: coordinator.to_owned(),
        })
        .await
        .unwrap()
        .into_inner()
        .decision
}
async fn crash_snapshot(endpoint: &str, refs: &[String], phase: usize) {
    for reference in refs {
        assert_eq!(load_state(endpoint, reference).await, Some(vec![0x08, 4]));
    }
    let batches = records(endpoint).await;
    let participants: Vec<_> = batches
        .iter()
        .flat_map(|b| &b.participant_transactions)
        .collect();
    assert_eq!(participants.len(), if phase == 2 { 0 } else { refs.len() });
    assert!(participants.iter().all(|p| p.prepared));
    let coordinators: Vec<_> = batches
        .iter()
        .flat_map(|b| b.transaction_coordinators.values())
        .collect();
    assert_eq!(coordinators.len(), 1);
    assert_eq!(coordinators[0].preparing, phase == 2);
    let terminal = decision(endpoint, &refs[0]).await;
    if phase == 3 {
        let terminal = terminal.expect("immutable decision required before crash");
        assert_eq!(
            terminal.outcome,
            database::transaction_coordinator_decision::Outcome::Commit as i32
        );
        let participants = terminal.participants.unwrap();
        let mut actual = participants.should_commit[STATE].state_refs.clone();
        actual.sort();
        let mut expected = refs.to_vec();
        expected.sort();
        assert_eq!(actual, expected);
        assert!(participants.read_only.is_empty());
    } else {
        assert!(
            terminal.is_none(),
            "predecision crash must not already have a terminal decision"
        );
    }
}
fn await_file(path: &std::path::Path, host: &mut WaitHostGuard) {
    let deadline = std::time::Instant::now() + Duration::from_secs(30);
    while !path.exists() {
        assert!(
            host.try_wait().unwrap().is_none(),
            "native fixture exited before {}",
            path.display()
        );
        assert!(
            std::time::Instant::now() < deadline,
            "missing native barrier {}",
            path.display()
        );
        std::thread::sleep(Duration::from_millis(10));
    }
}
fn run(watch: bool, chain: bool, crash_phase: usize, siblings: bool) {
    let crash_prepared = crash_phase != 0;
    let expected_value = if crash_phase == 2 { 4 } else { 5 };
    let fixture = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("tests/fixtures/generated_cxx_database_process");
    prepare_generated_host(&fixture);
    let binary =
        std::env::var("REBOOT_NATIVE2PC_CXX_DATABASE").expect("canonical native Database required");
    assert!(std::path::Path::new(&binary).is_file());
    let mut db = CxxDatabase::start(binary);
    let runtime = tokio::runtime::Runtime::new().unwrap();
    let refs: Vec<_> = ["local-native-a", "local-native-b", "local-native-c"]
        .into_iter()
        .take(if chain || siblings { 3 } else { 2 })
        .map(|id| {
            reboot_rust_schema::state_ref::StateRef::from_id(STATE, id)
                .unwrap()
                .to_string()
        })
        .collect();
    let markers = tempfile::Builder::new()
        .prefix("reboot-rust-local-native-proof-")
        .tempdir()
        .unwrap();
    let markers = markers.keep();
    println!("NATIVE_LOCAL_PROOF {}", markers.display());
    let prepared = markers.join("prepared");
    let decision = markers.join("decision");
    let lookup = markers.join("lookup");
    let terminal = markers.join("terminal");
    let released = markers.join("released");
    let mut command = Command::new(generated_host_binary(&fixture));
    command.args([
        "--registered-same-host",
        "--database",
        &db.endpoint(),
        "--listen",
        &format!("127.0.0.1:{}", port()),
        "--state-ref",
        &refs[0],
        "--local-child-ref",
        &refs[1],
        "--root-id",
        "00000000-0000-0000-0000-000000000201",
    ]);
    if chain {
        command.args(["--local-chain", "--local-grandchild-ref", &refs[2]]);
    }
    if siblings {
        command.args(["--local-siblings", "--local-grandchild-ref", &refs[2]]);
    }
    if crash_prepared {
        match crash_phase {
            1 => {
                command.env("REBOOT_TEST_PAUSE_PREPARED_BEFORE_DECISION", &prepared);
            }
            2 => {
                command.env("REBOOT_TEST_STAR_BEFORE_PREPARE_FANOUT", &prepared);
            }
            3 => {
                command
                    .env("REBOOT_TEST_PAUSE_AFTER_COORDINATOR_PREPARE", &prepared)
                    .env("REBOOT_TEST_LIVE_WATCH_BEFORE_LOOKUP", &lookup);
            }
            _ => panic!("unknown crash phase"),
        }
    }
    if watch {
        command
            .env("REBOOT_TEST_LIVE_WATCH_BEFORE_LOOKUP", &lookup)
            .env("REBOOT_TEST_TARGET_WATCH_TERMINALIZED", &terminal)
            .env("REBOOT_TEST_PAUSE_PREPARED_BEFORE_DECISION", &prepared)
            .env("REBOOT_TEST_PAUSE_AFTER_COORDINATOR_PREPARE", &decision)
            .arg("--local-watch-released-marker")
            .arg(&released);
    }
    let mut host = WaitHostGuard(command.spawn().unwrap());
    if crash_prepared {
        await_file(&prepared, &mut host);
        runtime.block_on(crash_snapshot(&db.endpoint(), &refs, crash_phase));
        // Deliberate process death, not graceful Abort/Watch cleanup. Own only this child.
        host.kill().unwrap();
        assert!(!host.wait().unwrap().success());
        runtime.block_on(async {
            let batches = records(&db.endpoint()).await;
            assert_eq!(
                batches
                    .iter()
                    .map(|b| b.participant_transactions.len())
                    .sum::<usize>(),
                if crash_phase == 2 { 0 } else { refs.len() }
            );
            assert_eq!(
                batches
                    .iter()
                    .map(|b| b.transaction_coordinators.len())
                    .sum::<usize>(),
                1
            );
        });
    }
    if watch {
        await_file(&prepared, &mut host);
        runtime.block_on(async {
            for reference in &refs {
                assert_eq!(
                    load_state(&db.endpoint(), reference).await,
                    Some(vec![0x08, 4])
                );
            }
            let records = records(&db.endpoint()).await;
            let participants: Vec<_> = records
                .iter()
                .flat_map(|batch| &batch.participant_transactions)
                .collect();
            assert_eq!(participants.len(), 2);
            assert!(participants.iter().all(|record| record.prepared));
        });
        std::fs::remove_file(&prepared).unwrap();
        await_file(&decision, &mut host);
        await_file(&lookup, &mut host);
        std::fs::write(lookup.with_extension("release"), b"release Watch").unwrap();
        await_file(&released, &mut host);
        assert_eq!(
            std::fs::read_to_string(&terminal).unwrap(),
            "watch-terminalized\n"
        );
        runtime.block_on(async {
            assert_eq!(
                load_state(&db.endpoint(), &refs[1]).await,
                Some(vec![0x08, 5])
            );
        });
        std::fs::remove_file(&decision).unwrap();
    }
    let deadline = std::time::Instant::now() + Duration::from_secs(35);
    loop {
        if let Some(status) = host.try_wait().unwrap() {
            if !crash_prepared {
                assert!(
                    status.success(),
                    "native same-host fixture failed: {status}"
                );
            }
            break;
        }
        assert!(
            std::time::Instant::now() < deadline,
            "native fixture did not finish"
        );
        std::thread::sleep(Duration::from_millis(10));
    }
    let endpoint = db.endpoint();
    let verify = || {
        runtime.block_on(async {
            for reference in &refs {
                assert_eq!(
                    load_state(&endpoint, reference).await,
                    Some(vec![0x08, expected_value])
                );
            }
            for batch in records(&endpoint).await {
                assert!(
                    batch.participant_transactions.is_empty(),
                    "participant worklist not cleared"
                );
                assert!(
                    batch.transaction_coordinators.is_empty(),
                    "coordinator worklist not cleared"
                );
            }
        })
    };
    if !crash_prepared {
        verify();
    }
    db.restart();
    if crash_prepared {
        runtime.block_on(crash_snapshot(&endpoint, &refs, crash_phase));
    }
    if !crash_prepared {
        verify();
    }
    let recovered = markers.join("recovered");
    let mut command = Command::new(generated_host_binary(&fixture));
    command.args([
        "--registered-same-host",
        "--database",
        &db.endpoint(),
        "--listen",
        &format!("127.0.0.1:{}", port()),
        "--state-ref",
        &refs[0],
        "--local-child-ref",
        &refs[1],
        "--root-id",
        "00000000-0000-0000-0000-000000000301",
        "--local-recovered-marker",
        recovered.to_str().unwrap(),
    ]);
    if chain {
        command.args(["--local-chain", "--local-grandchild-ref", &refs[2]]);
    }
    if siblings {
        command.args(["--local-siblings", "--local-grandchild-ref", &refs[2]]);
    }
    command.args(["--local-recovered-value", &expected_value.to_string()]);
    let mut restarted = WaitHostGuard(command.spawn().unwrap());
    await_file(&recovered, &mut restarted);
    let deadline = std::time::Instant::now() + Duration::from_secs(10);
    loop {
        if let Some(status) = restarted.try_wait().unwrap() {
            assert!(status.success(), "recovery-only host failed: {status}");
            break;
        }
        assert!(
            std::time::Instant::now() < deadline,
            "recovery-only host did not finish"
        );
        std::thread::sleep(Duration::from_millis(10));
    }
    assert_eq!(
        std::fs::read_to_string(recovered).unwrap(),
        "recovered A/B readback without initialization\n"
    );
    verify();
}
#[test]
#[ignore = "requires real C++ Database/RocksDB"]
fn registered_same_host_generated_commit_restart_readback() {
    run(false, false, 0, false);
}
#[test]
#[ignore = "requires real C++ Database/RocksDB"]
fn registered_same_host_generated_chain_restart_readback() {
    run(false, true, 0, false);
}
#[test]
#[ignore = "requires real C++ Database/RocksDB"]
fn registered_same_host_generated_prepared_host_crash_recovery() {
    run(false, false, 1, false);
}
#[test]
#[ignore = "requires real C++ Database/RocksDB"]
fn registered_same_host_generated_siblings_restart_readback() {
    run(false, false, 0, true);
}
#[test]
#[ignore = "requires real C++ Database/RocksDB"]
fn registered_same_host_generated_chain_prepared_host_crash_recovery() {
    run(false, true, 1, false);
}
#[test]
#[ignore = "requires real C++ Database/RocksDB"]
fn registered_same_host_generated_before_prepare_host_crash_abort() {
    run(false, false, 2, false);
}
#[test]
#[ignore = "requires real C++ Database/RocksDB"]
fn registered_same_host_generated_after_commit_host_crash_recovery() {
    run(false, false, 3, false);
}
#[test]
#[ignore = "requires real C++ Database/RocksDB"]
fn registered_same_host_generated_decision_watch_cleanup() {
    run(true, false, 0, false);
}

async fn task_records(endpoint: &str, tasks: &[database::Task]) -> Vec<database::Task> {
    database::database_client::DatabaseClient::connect(endpoint.to_owned())
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
}
#[test]
#[ignore = "requires real C++ Database/RocksDB"]
fn registered_same_host_generated_reusable_reader_pending_restart() {
    let fixture = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("tests/fixtures/generated_cxx_database_process");
    prepare_generated_host(&fixture);
    let mut db = CxxDatabase::start(std::env::var("REBOOT_NATIVE2PC_CXX_DATABASE").unwrap());
    let runtime = tokio::runtime::Runtime::new().unwrap();
    let refs: Vec<_> = ["local-reuse-a", "local-reuse-b"]
        .into_iter()
        .map(|id| {
            reboot_rust_schema::state_ref::StateRef::from_id(STATE, id)
                .unwrap()
                .to_string()
        })
        .collect();
    let proof = tempfile::Builder::new()
        .prefix("reboot-rust-local-reuse-proof-")
        .tempdir()
        .unwrap()
        .keep();
    println!("NATIVE_LOCAL_REUSE_PROOF {}", proof.display());
    let marker = proof.join("tasks");
    let before = proof.join("before");
    let recovered = proof.join("recovered");
    let listen_port = port();
    let listen = format!("127.0.0.1:{listen_port}");
    let mut command = Command::new(generated_host_binary(&fixture));
    command
        .args([
            "--registered-same-host",
            "--sequential-reusable",
            "--database",
            &db.endpoint(),
            "--listen",
            &listen,
            "--state-ref",
            &refs[0],
            "--local-child-ref",
            &refs[1],
            "--root-id",
            "00000000-0000-0000-0000-000000000201",
            "--local-task-marker",
            marker.to_str().unwrap(),
            "--legacy-placement-plan",
            &legacy_plan_for(&[(&refs[1], listen_port)]),
            "--block-task",
        ])
        .env("REBOOT_TEST_STAR_BEFORE_PREPARE_FANOUT", &before);
    let mut host = WaitHostGuard(command.spawn().unwrap());
    await_file(&before, &mut host);
    let tasks: Vec<_> = [7, 11, 13]
        .into_iter()
        .map(|amount| {
            database::Task::decode(
                std::fs::read(format!("{}.task-{amount}", marker.display()))
                    .unwrap()
                    .as_slice(),
            )
            .unwrap()
        })
        .collect();
    let entries = std::fs::read_to_string(format!("{}.entries", marker.display())).unwrap();
    let rows: Vec<_> = entries
        .lines()
        .map(|line| line.split('|').collect::<Vec<_>>())
        .collect();
    assert_eq!(rows.len(), 3);
    assert_eq!(rows[0][2..], ["7", "20"]);
    assert_eq!(rows[1][2..], ["11", "27"]);
    assert_eq!(rows[2][2..], ["13", "27"]);
    assert!(
        rows.iter()
            .all(|row| row[0] == "00000000-0000-0000-0000-000000000201")
    );
    assert_eq!(
        rows.iter()
            .map(|row| row[1])
            .collect::<std::collections::BTreeSet<_>>()
            .len(),
        3
    );
    runtime.block_on(async {
        for (reference, value) in refs.iter().zip([5, 20]) {
            assert_eq!(
                load_state(&db.endpoint(), reference).await,
                Some(vec![8, value])
            );
        }
        assert!(task_records(&db.endpoint(), &tasks).await.is_empty());
        let batches = records(&db.endpoint()).await;
        let coordinators: Vec<_> = batches
            .iter()
            .flat_map(|b| b.transaction_coordinators.values())
            .collect();
        assert_eq!(coordinators.len(), 1);
        let mut actual = coordinators[0].participants.as_ref().unwrap().should_commit[STATE]
            .state_refs
            .clone();
        actual.sort();
        let mut expected = refs.clone();
        expected.sort();
        assert_eq!(actual, expected);
        assert!(
            coordinators[0]
                .participants
                .as_ref()
                .unwrap()
                .read_only
                .is_empty()
        );
    });
    assert!(!std::path::Path::new(&format!("{}.invocations", marker.display())).exists());
    std::fs::write(before.with_extension("release"), b"prepare").unwrap();
    await_file(
        std::path::Path::new(&format!("{}.pending", marker.display())),
        &mut host,
    );
    let snapshot = runtime.block_on(task_records(&db.endpoint(), &tasks));
    assert_eq!(snapshot.len(), 2);
    assert!(
        snapshot
            .iter()
            .all(|t| t.status == database::task::Status::Pending as i32)
    );
    assert!(
        runtime
            .block_on(task_records(&db.endpoint(), &tasks[1..2]))
            .is_empty()
    );
    host.kill().unwrap();
    host.wait().unwrap();
    db.restart();
    assert_eq!(
        runtime.block_on(task_records(&db.endpoint(), &tasks)),
        snapshot
    );
    let launch = || {
        let mut command = Command::new(generated_host_binary(&fixture));
        command.args([
            "--registered-same-host",
            "--sequential-reusable",
            "--database",
            &db.endpoint(),
            "--listen",
            &listen,
            "--state-ref",
            &refs[0],
            "--local-child-ref",
            &refs[1],
            "--root-id",
            "00000000-0000-0000-0000-000000000201",
            "--local-task-marker",
            marker.to_str().unwrap(),
            "--local-recovered-marker",
            recovered.to_str().unwrap(),
            "--legacy-placement-plan",
            &legacy_plan_for(&[(&refs[1], listen_port)]),
        ]);
        WaitHostGuard(command.spawn().unwrap())
    };
    let mut recovery = launch();
    assert!(recovery.wait().unwrap().success());
    assert!(recovered.exists());
    let completed = runtime.block_on(task_records(&db.endpoint(), &tasks));
    assert_eq!(completed.len(), 2);
    assert!(
        completed
            .iter()
            .all(|t| t.status == database::task::Status::Completed as i32)
    );
    let invocations = std::fs::read_to_string(format!("{}.invocations", marker.display())).unwrap();
    assert!(invocations.lines().count() > 2);
    assert!(invocations.lines().all(|line| line == "40"));
    let mut again = launch();
    assert!(again.wait().unwrap().success());
    assert_eq!(
        runtime.block_on(task_records(&db.endpoint(), &tasks)),
        completed
    );
    assert_eq!(
        std::fs::read_to_string(format!("{}.invocations", marker.display())).unwrap(),
        invocations
    );
    assert_eq!(
        std::fs::read_to_string(format!("{}.entries", marker.display())).unwrap(),
        entries,
        "recovery must never rerun mutation handlers"
    );
}
