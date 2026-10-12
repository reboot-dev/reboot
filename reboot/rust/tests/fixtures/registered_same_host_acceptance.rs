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
fn run(watch: bool) {
    let fixture = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("tests/fixtures/generated_cxx_database_process");
    prepare_generated_host(&fixture);
    let binary =
        std::env::var("REBOOT_NATIVE2PC_CXX_DATABASE").expect("canonical native Database required");
    assert!(std::path::Path::new(&binary).is_file());
    let mut db = CxxDatabase::start(binary);
    let runtime = tokio::runtime::Runtime::new().unwrap();
    let refs = ["local-native-a", "local-native-b"].map(|id| {
        reboot_rust_schema::state_ref::StateRef::from_id(STATE, id)
            .unwrap()
            .to_string()
    });
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
            assert!(
                status.success(),
                "native same-host fixture failed: {status}"
            );
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
                assert_eq!(load_state(&endpoint, reference).await, Some(vec![0x08, 5]));
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
    verify();
    db.restart();
    verify();
}
#[test]
#[ignore = "requires real C++ Database/RocksDB"]
fn registered_same_host_generated_commit_restart_readback() {
    run(false);
}
#[test]
#[ignore = "requires real C++ Database/RocksDB"]
fn registered_same_host_generated_decision_watch_cleanup() {
    run(true);
}
