use std::{
    net::TcpListener,
    process::{Child, Command, Stdio},
    time::Duration,
};

use prost::Message;
use reboot_rust_schema::database_proto as database;

struct CxxDatabase {
    state: tempfile::TempDir,
    port: u16,
    child: Child,
    binary: String,
}
impl CxxDatabase {
    fn start(binary: String) -> Self {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        drop(listener);
        let state = tempfile::tempdir().unwrap();
        let info = database::ServerInfo {
            shard_infos: vec![database::ShardInfo {
                shard_id: "s000000000".into(),
                shard_first_key: vec![],
            }],
        };
        std::fs::write(state.path().join("server-info.pb"), info.encode_to_vec()).unwrap();
        let child = Self::spawn(&binary, state.path(), port);
        let db = Self {
            state,
            port,
            child,
            binary,
        };
        db.wait();
        db
    }
    fn spawn(binary: &str, state: &std::path::Path, port: u16) -> Child {
        Command::new(binary)
            .arg(state.join("rocksdb"))
            .arg(state.join("server-info.pb"))
            .arg(port.to_string())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .unwrap()
    }
    fn endpoint(&self) -> String {
        format!("http://127.0.0.1:{}", self.port)
    }
    fn wait(&self) {
        for _ in 0..100 {
            if std::net::TcpStream::connect(("127.0.0.1", self.port)).is_ok() {
                return;
            }
            std::thread::sleep(Duration::from_millis(25));
        }
        panic!("C++ Database did not listen");
    }
    fn restart(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
        self.child = Self::spawn(&self.binary, self.state.path(), self.port);
        self.wait();
    }
}
impl Drop for CxxDatabase {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}
fn port() -> u16 {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let port = listener.local_addr().unwrap().port();
    drop(listener);
    port
}
#[allow(clippy::too_many_arguments)]
fn host(
    binary: &std::path::Path,
    role: &str,
    port: u16,
    db: &str,
    root: u16,
    target: u16,
    root_id: &str,
    recover: bool,
    invoke: bool,
    marker: Option<&std::path::Path>,
    watch_terminalized: Option<&std::path::Path>,
) -> Child {
    let mut command = Command::new(binary);
    command
        .args([
            "--role",
            role,
            "--listen",
            &format!("127.0.0.1:{port}"),
            "--database",
            db,
            "--root",
            &format!("http://127.0.0.1:{root}"),
            "--target",
            &format!("http://127.0.0.1:{target}"),
            "--root-id",
            root_id,
        ])
        .stdout(Stdio::inherit())
        .stderr(Stdio::inherit());
    if recover {
        command.arg("--recover");
    }
    if invoke {
        command.arg("--invoke");
    }
    if let Some(marker) = marker {
        command.env("REBOOT_TEST_PAUSE_AFTER_COORDINATOR_PREPARE", marker);
    }
    if let Some(marker) = watch_terminalized {
        command.env("REBOOT_TEST_TARGET_WATCH_TERMINALIZED", marker);
    }
    command.spawn().unwrap()
}
fn wait(port: u16) {
    for _ in 0..100 {
        if std::net::TcpStream::connect(("127.0.0.1", port)).is_ok() {
            return;
        }
        std::thread::sleep(Duration::from_millis(25));
    }
    panic!("host did not listen");
}

#[test]
#[ignore = "requires REBOOT_NATIVE2PC_CXX_DATABASE=path/to/bazel-bin/reboot/server/database"]
fn generated_exclusive_cross_actor_recovers_through_real_cxx_database_processes() {
    let database_binary =
        std::env::var("REBOOT_NATIVE2PC_CXX_DATABASE").expect("Bazel //reboot/server:database");
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
    let binary = fixture.join("target/debug/generated-cxx-database-process-host");
    let mut db = CxxDatabase::start(database_binary);
    // This slice deliberately covers non-factory transactions.  Seed both
    // pre-existing actors through the real C++ sidecar; construction belongs
    // to the separate CreateActor/factory acceptance path.
    tokio::runtime::Runtime::new().unwrap().block_on(async {
        database::database_client::DatabaseClient::connect(db.endpoint())
            .await
            .unwrap()
            .store(database::StoreRequest {
                actor_upserts: ["root", "target"]
                    .into_iter()
                    .map(|state_ref| database::Actor {
                        state_type: "tests.reboot.protoc.TransactionCounter".into(),
                        state_ref: state_ref.into(),
                        state: Some(vec![]),
                    })
                    .collect(),
                task_upserts: vec![],
                colocated_upserts: vec![],
                transaction: None,
                idempotent_mutation: None,
                ensure_state_types_created: vec![],
                sync: true,
            })
            .await
            .unwrap();
    });
    let root_port = port();
    let target_port = port();
    let root_id = "00000000-0000-0000-0000-000000000001";
    let mut target = host(
        &binary,
        "target",
        target_port,
        &db.endpoint(),
        root_port,
        target_port,
        root_id,
        false,
        false,
        None,
        None,
    );
    wait(target_port);
    let marker_dir = tempfile::tempdir().unwrap();
    let marker = marker_dir.path().join("sealed");
    let mut root = host(
        &binary,
        "root",
        root_port,
        &db.endpoint(),
        root_port,
        target_port,
        root_id,
        false,
        true,
        Some(&marker),
        None,
    );
    wait(root_port);
    for _ in 0..100 {
        if marker.exists() {
            break;
        }
        std::thread::sleep(Duration::from_millis(25));
    }
    assert!(
        marker.exists(),
        "root never sealed its real C++ coordinator record"
    );
    let _ = root.kill();
    let _ = root.wait();
    let _ = target.kill();
    let _ = target.wait();
    db.restart();
    let watch_terminalized = marker_dir.path().join("target-watch-terminalized");
    target = host(
        &binary,
        "target",
        target_port,
        &db.endpoint(),
        root_port,
        target_port,
        root_id,
        true,
        false,
        None,
        Some(&watch_terminalized),
    );
    wait(target_port);
    for _ in 0..100 {
        if watch_terminalized.exists() {
            break;
        }
        std::thread::sleep(Duration::from_millis(25));
    }
    assert!(
        watch_terminalized.exists(),
        "target did not receive a Watch decision and terminalize its prepared participant"
    );
    assert!(
        root.try_wait().unwrap().is_some(),
        "root recovery must remain stopped until target Watch recovery terminalizes"
    );
    root = host(
        &binary,
        "root",
        root_port,
        &db.endpoint(),
        root_port,
        target_port,
        root_id,
        true,
        false,
        None,
        None,
    );
    wait(root_port);
    let runtime = tokio::runtime::Runtime::new().unwrap();
    runtime.block_on(async {
        let mut client = database::database_client::DatabaseClient::connect(db.endpoint())
            .await
            .unwrap();
        let result = client
            .load(database::LoadRequest {
                actors: vec![
                    database::Actor {
                        state_type: "tests.reboot.protoc.TransactionCounter".into(),
                        state_ref: "root".into(),
                        state: None,
                    },
                    database::Actor {
                        state_type: "tests.reboot.protoc.TransactionCounter".into(),
                        state_ref: "target".into(),
                        state: None,
                    },
                ],
                task_ids: vec![],
            })
            .await
            .unwrap()
            .into_inner();
        assert_eq!(result.actors.len(), 2);
        let states = result
            .actors
            .into_iter()
            .map(|actor| actor.state.unwrap())
            .collect::<Vec<_>>();
        // The root was killed after persisting the immutable commit decision
        // but before terminal fan-out. The restarted target's Coordinator.Watch
        // host reads that decision from the real C++ RocksDB sidecar and commits
        // its prepared participant without a recovered coordinator process.
        assert!(states.iter().all(|state| !state.is_empty()));
        assert_eq!(states[0], states[1]);
    });
    let _ = root.kill();
    let _ = root.wait();
    let _ = target.kill();
    let _ = target.wait();
}

#[test]
#[ignore = "requires REBOOT_NATIVE2PC_CXX_DATABASE=path/to/bazel-bin/reboot/server/database"]
fn generated_exclusive_factory_creates_only_absent_actor_through_real_cxx_database() {
    let database_binary =
        std::env::var("REBOOT_NATIVE2PC_CXX_DATABASE").expect("Bazel //reboot/server:database");
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
    let binary = fixture.join("target/debug/generated-cxx-database-process-host");
    let db = CxxDatabase::start(database_binary);
    // Do not seed this state type or actor. C++ Load deliberately omits an
    // unknown column family, and TransactionParticipantPrepare creates it
    // when applying the first durable state write inside its RocksDB txn.
    let runtime = tokio::runtime::Runtime::new().unwrap();
    assert!(factory_host(&binary, &db.endpoint(), "factory-created", 7).success());
    // TransactionCounter { value: 7 } has canonical protobuf bytes 0x08, 0x07.
    assert_eq!(
        runtime.block_on(load_state(&db.endpoint(), "factory-created")),
        Some(vec![0x08, 0x07])
    );

    // Existing state must reject without overwriting the first construction.
    assert!(!factory_host(&binary, &db.endpoint(), "factory-created", 99).success());
    assert_eq!(
        runtime.block_on(load_state(&db.endpoint(), "factory-created")),
        Some(vec![0x08, 0x07])
    );

    // The fixture's negative amount makes its factory handler fail before
    // coordinator preparation; no actor state may be materialized.
    assert!(!factory_host(&binary, &db.endpoint(), "factory-handler-failed", -1).success());
    assert_eq!(
        runtime.block_on(load_state(&db.endpoint(), "factory-handler-failed")),
        None
    );
}

fn factory_host(
    binary: &std::path::Path,
    database: &str,
    state_ref: &str,
    amount: i64,
) -> std::process::ExitStatus {
    let listen = port();
    Command::new(binary)
        .args([
            "--role",
            "root",
            "--listen",
            &format!("127.0.0.1:{listen}"),
            "--database",
            database,
            "--root",
            &format!("http://127.0.0.1:{listen}"),
            "--target",
            &format!("http://127.0.0.1:{}", port()),
            "--root-id",
            "00000000-0000-0000-0000-000000000003",
            "--state-ref",
            state_ref,
            "--invoke",
            "--factory-invoke",
            "--exit-after-invoke",
            "--amount",
            &amount.to_string(),
        ])
        .status()
        .unwrap()
}

async fn load_state(endpoint: &str, state_ref: &str) -> Option<Vec<u8>> {
    database::database_client::DatabaseClient::connect(endpoint.to_owned())
        .await
        .unwrap()
        .load(database::LoadRequest {
            actors: vec![database::Actor {
                state_type: "tests.reboot.protoc.TransactionCounter".into(),
                state_ref: state_ref.into(),
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
        .and_then(|actor| actor.state)
}
