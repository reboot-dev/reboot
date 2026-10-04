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
    );
    wait(target_port);
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
        // The barrier fires before any participant Prepare.  Those staged
        // effects are intentionally only in actor memory (the native
        // Transaction contract says unprepared records must abort on
        // recovery), so recovery must preserve the initial state rather than
        // manufacture a commit.
        assert!(states.iter().all(Vec::is_empty));
        assert_eq!(states[0], states[1]);
    });
    let _ = root.kill();
    let _ = root.wait();
    let _ = target.kill();
    let _ = target.wait();
}
