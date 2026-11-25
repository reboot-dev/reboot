// Included by the participant ownership unit module so this native engine
// fixture can use exact local capabilities without adding public test APIs.
// Canonical launch contract matches tests/shared_root_native_b1.rs. Fixture
// Store is setup only, not an application/generated/public-path claim.
struct RetainedNativeDatabase {
    child: std::process::Child,
    directory: tempfile::TempDir,
    binary: String,
    port: u16,
}

impl RetainedNativeDatabase {
    fn start() -> Self {
        let binary = std::env::var("REBOOT_NATIVE2PC_CXX_DATABASE")
            .expect("set canonical C++ Database executable path");
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        drop(listener);
        let directory = tempfile::tempdir().unwrap();
        std::fs::write(
            directory.path().join("server-info.pb"),
            database::ServerInfo {
                shard_infos: vec![database::ShardInfo {
                    shard_id: "s000000000".into(),
                    shard_first_key: vec![],
                }],
            }
            .encode_to_vec(),
        )
        .unwrap();
        let child = Self::spawn(&binary, directory.path(), port);
        let mut native = Self {
            child,
            directory,
            binary,
            port,
        };
        native.ready();
        native
    }
    fn spawn(binary: &str, directory: &std::path::Path, port: u16) -> std::process::Child {
        std::process::Command::new(binary)
            .arg(directory.join("rocksdb"))
            .arg(directory.join("server-info.pb"))
            .arg(port.to_string())
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::inherit())
            .spawn()
            .unwrap()
    }
    fn ready(&mut self) {
        for _ in 0..200 {
            if std::net::TcpStream::connect(("127.0.0.1", self.port)).is_ok() {
                return;
            }
            assert!(
                self.child.try_wait().unwrap().is_none(),
                "canonical Database exited"
            );
            std::thread::sleep(std::time::Duration::from_millis(10));
        }
        panic!("canonical Database did not listen");
    }
    fn endpoint(&self) -> String {
        format!("http://127.0.0.1:{}", self.port)
    }
    fn restart(&mut self) {
        self.child.kill().unwrap();
        self.child.wait().unwrap();
        self.child = Self::spawn(&self.binary, self.directory.path(), self.port);
        self.ready();
    }
}
impl Drop for RetainedNativeDatabase {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

async fn native_retained_state(endpoint: &str, reference: &str) -> Vec<u8> {
    let mut client = database::database_client::DatabaseClient::connect(endpoint.to_owned())
        .await
        .unwrap();
    client
        .load(database::LoadRequest {
            actors: vec![database::Actor {
                state_type: "tests.reboot.protoc.Counter".into(),
                state_ref: reference.into(),
                state: None,
            }],
            task_ids: vec![],
        })
        .await
        .unwrap()
        .into_inner()
        .actors
        .into_iter()
        .next()
        .unwrap()
        .state
        .unwrap()
}

async fn native_retained_writer_flow(first_fails: bool) {
    let mut native = RetainedNativeDatabase::start();
    let reference = crate::state_ref::StateRef::from_id(
        "tests.reboot.protoc.Counter",
        "retained-writer-native",
    )
    .unwrap()
    .to_string();
    let mut client = database::database_client::DatabaseClient::connect(native.endpoint())
        .await
        .unwrap();
    client
        .store(database::StoreRequest {
            actor_upserts: vec![database::Actor {
                state_type: "tests.reboot.protoc.Counter".into(),
                state_ref: reference.clone(),
                state: Some(vec![8, 100]),
            }],
            sync: true,
            ..Default::default()
        })
        .await
        .unwrap();
    let sidecar = Arc::new(
        TonicParticipantSidecar::connect(native.endpoint())
            .await
            .unwrap(),
    );
    let participant =
        DurableActorParticipant::new(sidecar, "tests.reboot.protoc.Counter", reference.clone());
    let root = Uuid::new_v4();
    let coordinator = crate::state_ref::StateRef::from_id(
        "tests.reboot.protoc.Counter",
        "retained-writer-coordinator",
    )
    .unwrap()
    .to_string();
    let request = |child| ActorTransactionStart {
        transaction_ids: vec![root, child],
        transaction_path: TransactionPathContract::PreserveNested,
        coordinator_state_type: "tests.reboot.protoc.Counter".into(),
        coordinator_state_ref: coordinator.clone(),
        mode: TransactionMode::Exclusive,
        read_only: false,
        factory: false,
        state_type: "tests.reboot.protoc.Counter".into(),
        state_ref: reference.clone(),
    };
    let mut stable_owner = None;
    let calls: Vec<(u8, bool, u8)> = if first_fails {
        vec![(9, true, 100), (60, false, 100)]
    } else {
        vec![(60, false, 100), (9, true, 60), (80, false, 60)]
    };
    for (value, aborted, expected) in calls {
        let child = Uuid::new_v4();
        let mut local = participant
            .start_local_reusable(request(child), ParticipantStartMode::Exclusive, true)
            .await
            .unwrap();
        assert_eq!(local.state(), Some(&[8, expected][..]));
        let mut headers = crate::RebootHeaders::new(reference.clone());
        headers.transaction_ids = Some(vec![root, child]);
        headers.transaction_coordinator_state_type = Some("tests.reboot.protoc.Counter".into());
        headers.transaction_coordinator_state_ref = Some(coordinator.clone());
        headers.coordinator_read_only_aware = true;
        let context =
            crate::runtime::TransactionContext::from_headers(headers, TransactionMode::Exclusive)
                .unwrap();
        let execution = local.reserve_live_execution(&context).await.unwrap();
        if let Some(owner) = stable_owner {
            assert_eq!(execution.owner, owner);
        } else {
            stable_owner = Some(execution.owner);
        }
        // First-touch declared failure happens before staging; later failure
        // deliberately stages private bytes to prove exact snapshot restoration.
        if !(first_fails && aborted) {
            local
                .stage(PendingActorEffects {
                    state: Some(vec![8, value]),
                    ..Default::default()
                })
                .await
                .unwrap();
        }
        participant
            .relinquish(root, child, aborted, Some(local.local_owner))
            .await
            .unwrap();
        assert_eq!(
            native_retained_state(&native.endpoint(), &reference).await,
            vec![8, 100],
            "private staging must not Store independently"
        );
        let pending = participant.pending.lock_root(root).await;
        let current = pending.as_ref().unwrap();
        assert_eq!(current.lock.is_shared(), first_fails && aborted);
        assert_eq!(
            current.reusable.as_ref().unwrap().root_owner,
            stable_owner.unwrap()
        );
    }
    participant.prepare_for_test(root).await.unwrap();
    assert_eq!(
        native_retained_state(&native.endpoint(), &reference).await,
        vec![8, 100]
    );
    assert!(
        participant
            .terminal_live(root, stable_owner.unwrap(), true)
            .await
            .unwrap()
    );
    let expected = if first_fails { 60 } else { 80 };
    assert_eq!(
        native_retained_state(&native.endpoint(), &reference).await,
        vec![8, expected]
    );
    drop(participant);
    drop(client);
    native.restart();
    assert_eq!(
        native_retained_state(&native.endpoint(), &reference).await,
        vec![8, expected]
    );
}

#[tokio::test]
#[ignore = "requires real canonical C++ Database/RocksDB; parent executes"]
async fn retained_writer_native_first_failure_reupgrade_commit_restart() {
    native_retained_writer_flow(true).await;
}

#[tokio::test]
#[ignore = "requires real canonical C++ Database/RocksDB; parent executes"]
async fn retained_writer_native_n1_success_n2_failure_n3_success_restart() {
    native_retained_writer_flow(false).await;
}
