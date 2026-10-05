use std::{
    net::TcpListener,
    process::{Child, Command, Stdio},
    time::Duration,
};

use prost::Message;
use reboot_rust_schema::database_proto as database;
use uuid::Uuid;

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
    state_ref: Option<&str>,
    coordinator_state_ref: Option<&str>,
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
    if let Some(state_ref) = state_ref {
        command.args(["--state-ref", state_ref]);
    }
    if let Some(coordinator_state_ref) = coordinator_state_ref {
        command.args(["--coordinator-state-ref", coordinator_state_ref]);
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

fn shared_host(
    binary: &std::path::Path,
    database: &str,
    listen: u16,
    root_id: &str,
    barrier: Option<&std::path::Path>,
    decision_marker: Option<&std::path::Path>,
) -> Child {
    let mut command = Command::new(binary);
    command
        .args([
            "--role",
            "target",
            "--listen",
            &format!("127.0.0.1:{listen}"),
            "--database",
            database,
            "--root",
            &format!("http://127.0.0.1:{listen}"),
            "--target",
            &format!("http://127.0.0.1:{listen}"),
            "--root-id",
            root_id,
            "--state-ref",
            "root",
            "--invoke",
            "--shared-invoke",
            "--exit-after-invoke",
        ])
        .stdout(Stdio::inherit())
        .stderr(Stdio::inherit());
    if let Some(barrier) = barrier {
        command.env("REBOOT_TEST_SHARED_BARRIER_DIR", barrier);
    }
    if let Some(marker) = decision_marker {
        command.env("REBOOT_TEST_PAUSE_AFTER_COORDINATOR_PREPARE", marker);
    }
    command.spawn().unwrap()
}

/// Runs the generated fresh shared-root local path in its own process. The
/// handler changes state, requiring the generated adapter to promote its local
/// read lease into a durable writer.
fn fresh_shared_promotion_host(
    binary: &std::path::Path,
    database: &str,
    state_ref: &str,
    root_id: &str,
    pause_after_decision: Option<&std::path::Path>,
) -> Child {
    let listen = port();
    let mut command = Command::new(binary);
    command
        .args([
            "--role",
            "target",
            "--listen",
            &format!("127.0.0.1:{listen}"),
            "--database",
            database,
            "--root",
            &format!("http://127.0.0.1:{listen}"),
            "--target",
            &format!("http://127.0.0.1:{listen}"),
            "--root-id",
            root_id,
            "--state-ref",
            state_ref,
            "--invoke",
            "--shared-invoke",
            "--exit-after-invoke",
            "--amount",
            "7",
        ])
        .stdout(Stdio::inherit())
        .stderr(Stdio::inherit());
    if let Some(marker) = pause_after_decision {
        command.env("REBOOT_TEST_PAUSE_AFTER_COORDINATOR_PREPARE", marker);
    }
    command.spawn().unwrap()
}

fn exclusive_host(
    binary: &std::path::Path,
    database: &str,
    state_ref: &str,
    amount: i64,
) -> std::process::ExitStatus {
    let listen = port();
    Command::new(binary)
        .args([
            "--role",
            "target",
            "--listen",
            &format!("127.0.0.1:{listen}"),
            "--database",
            database,
            "--root",
            &format!("http://127.0.0.1:{listen}"),
            "--target",
            &format!("http://127.0.0.1:{listen}"),
            "--root-id",
            "00000000-0000-0000-0000-000000000104",
            "--state-ref",
            state_ref,
            "--invoke",
            "--exit-after-invoke",
            "--amount",
            &amount.to_string(),
        ])
        .status()
        .unwrap()
}

/// Invokes the generated root-exclusive adapter in a fresh fixture process
/// with a caller-owned idempotency key. A non-success exit is its fail-closed
/// observable result.
fn idempotent_transaction_host(
    binary: &std::path::Path,
    database: &str,
    state_ref: &str,
    idempotency_key: Uuid,
    amount: i64,
    pause_after_decision: Option<&std::path::Path>,
    factory: bool,
) -> Child {
    let listen = port();
    let mut command = Command::new(binary);
    command
        .args([
            "--role",
            "target",
            "--listen",
            &format!("127.0.0.1:{listen}"),
            "--database",
            database,
            "--root",
            &format!("http://127.0.0.1:{listen}"),
            "--target",
            &format!("http://127.0.0.1:{listen}"),
            "--root-id",
            "00000000-0000-0000-0000-000000000106",
            "--state-ref",
            state_ref,
            "--invoke",
            "--exit-after-invoke",
            "--idempotency-key",
            &idempotency_key.to_string(),
            "--amount",
            &amount.to_string(),
        ])
        .stdout(Stdio::inherit())
        .stderr(Stdio::inherit());
    if factory {
        command.arg("--factory-invoke");
    }
    if let Some(marker) = pause_after_decision {
        command.env("REBOOT_TEST_PAUSE_AFTER_COORDINATOR_PREPARE", marker);
    }
    command.spawn().unwrap()
}

fn idempotent_exclusive_host(
    binary: &std::path::Path,
    database: &str,
    state_ref: &str,
    idempotency_key: Uuid,
    amount: i64,
    pause_after_decision: Option<&std::path::Path>,
) -> Child {
    idempotent_transaction_host(
        binary,
        database,
        state_ref,
        idempotency_key,
        amount,
        pause_after_decision,
        false,
    )
}

fn idempotent_factory_host(
    binary: &std::path::Path,
    database: &str,
    state_ref: &str,
    idempotency_key: Uuid,
    amount: i64,
    pause_after_decision: Option<&std::path::Path>,
) -> Child {
    idempotent_transaction_host(
        binary,
        database,
        state_ref,
        idempotency_key,
        amount,
        pause_after_decision,
        true,
    )
}

#[test]
#[ignore = "requires REBOOT_NATIVE2PC_CXX_DATABASE=path/to/bazel-bin/reboot/server/database"]
fn generated_root_exclusive_idempotency_is_durable_replayed_and_collision_safe() {
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
    let runtime = tokio::runtime::Runtime::new().unwrap();
    let state_ref = "idempotent-root";
    // C++ validates non-v7 keys as RFC UUIDs; use a valid caller-owned v4 key.
    let key = Uuid::new_v4();
    runtime.block_on(store_counter(&db.endpoint(), state_ref, 5));

    assert!(
        idempotent_exclusive_host(&binary, &db.endpoint(), state_ref, key, 7, None)
            .wait()
            .unwrap()
            .success()
    );
    assert_eq!(
        runtime.block_on(load_state(&db.endpoint(), state_ref)),
        Some(vec![0x08, 0x0c])
    );
    let initial = runtime.block_on(recover_idempotent_mutations(&db.endpoint(), state_ref, key));
    assert_eq!(
        initial.len(),
        1,
        "first call must commit exactly one durable response"
    );
    assert_eq!(initial[0].key, key.as_bytes());
    assert_eq!(initial[0].response, vec![0x08, 0x0c]);

    assert!(
        idempotent_exclusive_host(&binary, &db.endpoint(), state_ref, key, 7, None)
            .wait()
            .unwrap()
            .success()
    );
    assert_eq!(
        runtime.block_on(load_state(&db.endpoint(), state_ref)),
        Some(vec![0x08, 0x0c])
    );
    assert_eq!(
        runtime.block_on(recover_idempotent_mutations(&db.endpoint(), state_ref, key)),
        initial,
        "same key and request must replay without a second write"
    );

    assert!(
        !idempotent_exclusive_host(&binary, &db.endpoint(), state_ref, key, 9, None)
            .wait()
            .unwrap()
            .success()
    );
    assert_eq!(
        runtime.block_on(load_state(&db.endpoint(), state_ref)),
        Some(vec![0x08, 0x0c])
    );
    assert_eq!(
        runtime.block_on(recover_idempotent_mutations(&db.endpoint(), state_ref, key)),
        initial,
        "a key collision must fail closed without replacing the durable response"
    );
}

#[test]
#[ignore = "requires REBOOT_NATIVE2PC_CXX_DATABASE=path/to/bazel-bin/reboot/server/database"]
fn generated_application_host_recovers_idempotent_root_exactly_once_after_decision() {
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
    let runtime = tokio::runtime::Runtime::new().unwrap();
    let state_ref = "idempotent-recovery-root";
    // C++ validates non-v7 keys as RFC UUIDs; use a valid caller-owned v4 key.
    let key = Uuid::new_v4();
    runtime.block_on(store_counter(&db.endpoint(), state_ref, 5));
    let marker_dir = tempfile::tempdir().unwrap();
    let marker = marker_dir.path().join("decision-sealed");
    let mut root =
        idempotent_exclusive_host(&binary, &db.endpoint(), state_ref, key, 7, Some(&marker));
    for _ in 0..100 {
        if marker.exists() {
            break;
        }
        std::thread::sleep(Duration::from_millis(25));
    }
    assert!(
        marker.exists(),
        "root never persisted its decision after prepare"
    );
    let _ = root.kill();
    let _ = root.wait();
    db.restart();

    let recovery_port = port();
    let mut recovered = host(
        &binary,
        "root",
        recovery_port,
        &db.endpoint(),
        recovery_port,
        recovery_port,
        "00000000-0000-0000-0000-000000000106",
        true,
        false,
        None,
        None,
        Some(state_ref),
        Some(state_ref),
    );
    wait(recovery_port);
    let expected = Some(vec![0x08, 0x0c]);
    for _ in 0..100 {
        if runtime.block_on(load_state(&db.endpoint(), state_ref)) == expected {
            break;
        }
        std::thread::sleep(Duration::from_millis(25));
    }
    assert_eq!(
        runtime.block_on(load_state(&db.endpoint(), state_ref)),
        expected
    );
    let initial = runtime.block_on(recover_idempotent_mutations(&db.endpoint(), state_ref, key));
    assert_eq!(
        initial.len(),
        1,
        "recovery must commit exactly one durable response"
    );
    assert_eq!(initial[0].response, vec![0x08, 0x0c]);
    assert!(
        idempotent_exclusive_host(&binary, &db.endpoint(), state_ref, key, 7, None)
            .wait()
            .unwrap()
            .success()
    );
    assert_eq!(
        runtime.block_on(load_state(&db.endpoint(), state_ref)),
        expected
    );
    assert_eq!(
        runtime.block_on(recover_idempotent_mutations(&db.endpoint(), state_ref, key)),
        initial,
        "post-recovery replay must neither lose nor duplicate the durable response"
    );
    let _ = recovered.kill();
    let _ = recovered.wait();
}

#[test]
#[ignore = "requires REBOOT_NATIVE2PC_CXX_DATABASE=path/to/bazel-bin/reboot/server/database"]
fn generated_factory_root_idempotency_replays_before_absent_state_admission_and_rejects_collisions()
{
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
    let runtime = tokio::runtime::Runtime::new().unwrap();
    let state_ref = "idempotent-factory-root";
    // The native sidecar validates caller keys as RFC UUIDs; this is a v4 key.
    let key = Uuid::new_v4();

    assert!(
        idempotent_factory_host(&binary, &db.endpoint(), state_ref, key, 7, None)
            .wait()
            .unwrap()
            .success()
    );
    let expected = Some(vec![0x08, 0x07]);
    assert_eq!(
        runtime.block_on(load_state(&db.endpoint(), state_ref)),
        expected
    );
    let initial = runtime.block_on(recover_idempotent_mutations(&db.endpoint(), state_ref, key));
    assert_eq!(
        initial.len(),
        1,
        "factory creation stages exactly one response"
    );
    assert_eq!(initial[0].response, vec![0x08, 0x07]);

    assert!(
        idempotent_factory_host(&binary, &db.endpoint(), state_ref, key, 7, None)
            .wait()
            .unwrap()
            .success()
    );
    assert_eq!(
        runtime.block_on(load_state(&db.endpoint(), state_ref)),
        expected
    );
    assert_eq!(
        runtime.block_on(recover_idempotent_mutations(&db.endpoint(), state_ref, key)),
        initial,
        "replay must precede factory absent-state admission and not recreate state"
    );

    assert!(
        !idempotent_factory_host(&binary, &db.endpoint(), state_ref, key, 9, None)
            .wait()
            .unwrap()
            .success()
    );
    assert_eq!(
        runtime.block_on(load_state(&db.endpoint(), state_ref)),
        expected
    );
    assert_eq!(
        runtime.block_on(recover_idempotent_mutations(&db.endpoint(), state_ref, key)),
        initial,
        "a factory-key collision must fail closed without replacing the response"
    );
}

#[test]
#[ignore = "requires REBOOT_NATIVE2PC_CXX_DATABASE=path/to/bazel-bin/reboot/server/database"]
fn generated_factory_root_idempotency_recovers_after_post_decision_crash() {
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
    let runtime = tokio::runtime::Runtime::new().unwrap();
    let state_ref = "idempotent-factory-recovery-root";
    // The native sidecar validates caller keys as RFC UUIDs; this is a v4 key.
    let key = Uuid::new_v4();
    let marker_dir = tempfile::tempdir().unwrap();
    let marker = marker_dir.path().join("factory-decision-sealed");
    let mut root =
        idempotent_factory_host(&binary, &db.endpoint(), state_ref, key, 7, Some(&marker));
    for _ in 0..100 {
        if marker.exists() {
            break;
        }
        std::thread::sleep(Duration::from_millis(25));
    }
    assert!(
        marker.exists(),
        "factory root never persisted its decision after prepare"
    );
    let _ = root.kill();
    let _ = root.wait();
    db.restart();

    let recovery_port = port();
    let mut recovered = host(
        &binary,
        "root",
        recovery_port,
        &db.endpoint(),
        recovery_port,
        recovery_port,
        "00000000-0000-0000-0000-000000000106",
        true,
        false,
        None,
        None,
        Some(state_ref),
        Some(state_ref),
    );
    wait(recovery_port);
    let expected = Some(vec![0x08, 0x07]);
    for _ in 0..100 {
        if runtime.block_on(load_state(&db.endpoint(), state_ref)) == expected {
            break;
        }
        std::thread::sleep(Duration::from_millis(25));
    }
    assert_eq!(
        runtime.block_on(load_state(&db.endpoint(), state_ref)),
        expected
    );
    let initial = runtime.block_on(recover_idempotent_mutations(&db.endpoint(), state_ref, key));
    assert_eq!(
        initial.len(),
        1,
        "recovery must commit exactly one factory response"
    );
    assert_eq!(initial[0].response, vec![0x08, 0x07]);
    assert!(
        idempotent_factory_host(&binary, &db.endpoint(), state_ref, key, 7, None)
            .wait()
            .unwrap()
            .success()
    );
    assert_eq!(
        runtime.block_on(load_state(&db.endpoint(), state_ref)),
        expected
    );
    assert_eq!(
        runtime.block_on(recover_idempotent_mutations(&db.endpoint(), state_ref, key)),
        initial,
        "post-recovery replay must neither lose nor duplicate factory state or response"
    );
    let _ = recovered.kill();
    let _ = recovered.wait();
}

#[test]
#[ignore = "requires REBOOT_NATIVE2PC_CXX_DATABASE=path/to/bazel-bin/reboot/server/database"]
fn generated_shared_roots_overlap_without_mutation_then_exclusive_works() {
    let database_binary = std::env::var("REBOOT_NATIVE2PC_CXX_DATABASE").unwrap();
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
    let runtime = tokio::runtime::Runtime::new().unwrap();
    runtime.block_on(async {
        database::database_client::DatabaseClient::connect(db.endpoint())
            .await
            .unwrap()
            .store(database::StoreRequest {
                actor_upserts: vec![database::Actor {
                    state_type: "tests.reboot.protoc.TransactionCounter".into(),
                    state_ref: "root".into(),
                    state: Some(vec![0x08, 0x05]),
                }],
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
    let barrier = tempfile::tempdir().unwrap();
    let mut first = shared_host(
        &binary,
        &db.endpoint(),
        port(),
        "00000000-0000-0000-0000-000000000101",
        Some(barrier.path()),
        None,
    );
    let mut second = shared_host(
        &binary,
        &db.endpoint(),
        port(),
        "00000000-0000-0000-0000-000000000102",
        Some(barrier.path()),
        None,
    );
    assert!(first.wait().unwrap().success());
    assert!(second.wait().unwrap().success());
    assert_eq!(
        runtime.block_on(load_state(&db.endpoint(), "root")),
        Some(vec![0x08, 0x05])
    );
    assert!(exclusive_host(&binary, &db.endpoint(), "root", 7).success());
    assert_eq!(
        runtime.block_on(load_state(&db.endpoint(), "root")),
        Some(vec![0x08, 0x0c])
    );
}

#[test]
#[ignore = "requires REBOOT_NATIVE2PC_CXX_DATABASE=path/to/bazel-bin/reboot/server/database"]
fn generated_shared_root_recovers_after_empty_commit_decision_before_cleanup() {
    let database_binary = std::env::var("REBOOT_NATIVE2PC_CXX_DATABASE").unwrap();
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
    let runtime = tokio::runtime::Runtime::new().unwrap();
    runtime.block_on(async {
        database::database_client::DatabaseClient::connect(db.endpoint())
            .await
            .unwrap()
            .store(database::StoreRequest {
                actor_upserts: vec![database::Actor {
                    state_type: "tests.reboot.protoc.TransactionCounter".into(),
                    state_ref: "root".into(),
                    state: Some(vec![0x08, 0x05]),
                }],
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
    let marker_dir = tempfile::tempdir().unwrap();
    let marker = marker_dir.path().join("sealed");
    let mut root = shared_host(
        &binary,
        &db.endpoint(),
        port(),
        "00000000-0000-0000-0000-000000000103",
        None,
        Some(&marker),
    );
    for _ in 0..100 {
        if marker.exists() {
            break;
        }
        std::thread::sleep(Duration::from_millis(25));
    }
    assert!(
        marker.exists(),
        "shared root never persisted its empty commit decision"
    );
    let _ = root.kill();
    let _ = root.wait();
    db.restart();
    let recovery_port = port();
    let mut recovered = host(
        &binary,
        "root",
        recovery_port,
        &db.endpoint(),
        recovery_port,
        recovery_port,
        "00000000-0000-0000-0000-000000000103",
        true,
        false,
        None,
        None,
        Some("root"),
        Some("root"),
    );
    wait(recovery_port);
    std::thread::sleep(Duration::from_millis(100));
    assert_eq!(
        runtime.block_on(load_state(&db.endpoint(), "root")),
        Some(vec![0x08, 0x05])
    );
    let _ = recovered.kill();
    let _ = recovered.wait();
}

#[test]
#[ignore = "requires REBOOT_NATIVE2PC_CXX_DATABASE=path/to/bazel-bin/reboot/server/database"]
fn generated_fresh_shared_local_promotion_recovers_after_durable_decision() {
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
    let runtime = tokio::runtime::Runtime::new().unwrap();
    let state_ref = "fresh-shared-promotion-root";
    let root_id = "00000000-0000-0000-0000-000000000107";
    runtime.block_on(store_counter(&db.endpoint(), state_ref, 5));

    let marker_dir = tempfile::tempdir().unwrap();
    let marker = marker_dir.path().join("decision-sealed");
    let mut root =
        fresh_shared_promotion_host(&binary, &db.endpoint(), state_ref, root_id, Some(&marker));
    for _ in 0..100 {
        if marker.exists() {
            break;
        }
        std::thread::sleep(Duration::from_millis(25));
    }
    assert!(
        marker.exists(),
        "fresh shared promotion never persisted its commit decision"
    );
    let _ = root.kill();
    let _ = root.wait();
    db.restart();

    let recovery_port = port();
    let mut recovered = host(
        &binary,
        "root",
        recovery_port,
        &db.endpoint(),
        recovery_port,
        recovery_port,
        root_id,
        true,
        false,
        None,
        None,
        Some(state_ref),
        Some(state_ref),
    );
    wait(recovery_port);
    let expected = Some(vec![0x08, 0x0c]);
    for _ in 0..100 {
        if runtime.block_on(load_state(&db.endpoint(), state_ref)) == expected {
            break;
        }
        std::thread::sleep(Duration::from_millis(25));
    }
    assert_eq!(
        runtime.block_on(load_state(&db.endpoint(), state_ref)),
        expected
    );
    let _ = recovered.kill();
    let _ = recovered.wait();
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
        None,
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
        None,
        None,
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
        None,
        None,
    );
    wait(root_port);
    let runtime = tokio::runtime::Runtime::new().unwrap();
    let mut client = runtime
        .block_on(database::database_client::DatabaseClient::connect(
            db.endpoint(),
        ))
        .unwrap();
    let states = (0..100)
        .find_map(|_| {
            let result = runtime
                .block_on(client.load(database::LoadRequest {
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
                }))
                .unwrap()
                .into_inner();
            assert_eq!(result.actors.len(), 2);
            let states = result
                .actors
                .into_iter()
                .map(|actor| actor.state.unwrap())
                .collect::<Vec<_>>();
            if states.iter().all(|state| !state.is_empty()) && states[0] == states[1] {
                Some(states)
            } else {
                std::thread::sleep(Duration::from_millis(25));
                None
            }
        })
        .expect("root recovery did not commit both actors after target Watch terminalized");
    // The root was killed after persisting the immutable commit decision but
    // before terminal fan-out. TCP readiness only proves the recovered root
    // listener is bound; wait for its durable recovery to commit as well.
    assert_eq!(states[0], states[1]);
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

#[test]
#[ignore = "requires REBOOT_NATIVE2PC_CXX_DATABASE=path/to/bazel-bin/reboot/server/database"]
fn generated_exclusive_factory_creates_root_and_commits_existing_target_through_real_cxx_database()
{
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
    let runtime = tokio::runtime::Runtime::new().unwrap();
    runtime.block_on(async {
        database::database_client::DatabaseClient::connect(db.endpoint())
            .await
            .unwrap()
            .store(database::StoreRequest {
                actor_upserts: vec![database::Actor {
                    state_type: "tests.reboot.protoc.TransactionCounter".into(),
                    state_ref: "target".into(),
                    state: Some(vec![0x08, 0x05]),
                }],
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
    let mut target = host(
        &binary,
        "target",
        target_port,
        &db.endpoint(),
        root_port,
        target_port,
        "00000000-0000-0000-0000-000000000004",
        false,
        false,
        None,
        None,
        None,
        None,
    );
    wait(target_port);
    assert!(
        factory_target_host(
            &binary,
            &db.endpoint(),
            root_port,
            target_port,
            "factory-root",
            7
        )
        .success()
    );
    assert_eq!(
        runtime.block_on(load_state(&db.endpoint(), "factory-root")),
        Some(vec![0x08, 0x07])
    );
    assert_eq!(
        runtime.block_on(load_state(&db.endpoint(), "target")),
        Some(vec![0x08, 0x0c])
    );
    assert!(
        !factory_target_host(
            &binary,
            &db.endpoint(),
            root_port,
            target_port,
            "factory-root",
            99
        )
        .success()
    );
    assert_eq!(
        runtime.block_on(load_state(&db.endpoint(), "factory-root")),
        Some(vec![0x08, 0x07])
    );
    assert_eq!(
        runtime.block_on(load_state(&db.endpoint(), "target")),
        Some(vec![0x08, 0x0c])
    );
    let _ = target.kill();
    let _ = target.wait();
}

#[test]
#[ignore = "requires REBOOT_NATIVE2PC_CXX_DATABASE=path/to/bazel-bin/reboot/server/database"]
fn generated_exclusive_factory_root_recovers_existing_target_through_real_cxx_database_processes() {
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
    let runtime = tokio::runtime::Runtime::new().unwrap();
    runtime.block_on(async {
        database::database_client::DatabaseClient::connect(db.endpoint())
            .await
            .unwrap()
            .store(database::StoreRequest {
                actor_upserts: vec![database::Actor {
                    state_type: "tests.reboot.protoc.TransactionCounter".into(),
                    state_ref: "target".into(),
                    state: Some(vec![0x08, 0x05]),
                }],
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
    let root_id = "00000000-0000-0000-0000-000000000005";
    let marker_dir = tempfile::tempdir().unwrap();
    let marker = marker_dir.path().join("sealed");
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
        None,
        Some("factory-root"),
    );
    wait(target_port);
    let mut root = factory_target_root_host(
        &binary,
        &db.endpoint(),
        root_port,
        target_port,
        root_id,
        "factory-root",
        &marker,
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
        "factory root never sealed its real C++ coordinator record"
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
        None,
        Some("factory-root"),
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
        "target did not Watch the factory-root decision and terminalize"
    );
    let recovered_root_port = port();
    root = host(
        &binary,
        "root",
        recovered_root_port,
        &db.endpoint(),
        recovered_root_port,
        target_port,
        root_id,
        true,
        false,
        None,
        None,
        Some("factory-root"),
        Some("factory-root"),
    );
    wait(recovered_root_port);
    let (root_state, target_state) = wait_for_states(
        &runtime,
        &db.endpoint(),
        "factory-root",
        vec![0x08, 0x07],
        "target",
        vec![0x08, 0x0c],
    );
    assert_eq!(root_state, Some(vec![0x08, 0x07]));
    assert_eq!(target_state, Some(vec![0x08, 0x0c]));
    assert!(
        !factory_target_host(
            &binary,
            &db.endpoint(),
            root_port,
            target_port,
            "factory-root",
            99
        )
        .success()
    );
    assert_eq!(
        runtime.block_on(load_state(&db.endpoint(), "factory-root")),
        Some(vec![0x08, 0x07])
    );
    assert_eq!(
        runtime.block_on(load_state(&db.endpoint(), "target")),
        Some(vec![0x08, 0x0c])
    );
    let _ = root.kill();
    let _ = root.wait();
    let _ = target.kill();
    let _ = target.wait();
}

fn factory_target_root_host(
    binary: &std::path::Path,
    database: &str,
    root_port: u16,
    target_port: u16,
    root_id: &str,
    state_ref: &str,
    marker: &std::path::Path,
) -> Child {
    let mut command = Command::new(binary);
    command
        .args([
            "--role",
            "root",
            "--listen",
            &format!("127.0.0.1:{root_port}"),
            "--database",
            database,
            "--root",
            &format!("http://127.0.0.1:{root_port}"),
            "--target",
            &format!("http://127.0.0.1:{target_port}"),
            "--root-id",
            root_id,
            "--state-ref",
            state_ref,
            "--coordinator-state-ref",
            state_ref,
            "--invoke",
            "--factory-target-invoke",
            "--amount",
            "7",
        ])
        .env("REBOOT_TEST_PAUSE_AFTER_COORDINATOR_PREPARE", marker)
        .stdout(Stdio::inherit())
        .stderr(Stdio::inherit())
        .spawn()
        .unwrap()
}

fn factory_target_host(
    binary: &std::path::Path,
    database: &str,
    root_port: u16,
    target_port: u16,
    state_ref: &str,
    amount: i64,
) -> std::process::ExitStatus {
    Command::new(binary)
        .args([
            "--role",
            "root",
            "--listen",
            &format!("127.0.0.1:{root_port}"),
            "--database",
            database,
            "--root",
            &format!("http://127.0.0.1:{root_port}"),
            "--target",
            &format!("http://127.0.0.1:{target_port}"),
            "--root-id",
            "00000000-0000-0000-0000-000000000004",
            "--state-ref",
            state_ref,
            "--invoke",
            "--factory-target-invoke",
            "--exit-after-invoke",
            "--amount",
            &amount.to_string(),
        ])
        .status()
        .unwrap()
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

fn wait_for_states(
    runtime: &tokio::runtime::Runtime,
    endpoint: &str,
    first_ref: &str,
    expected_first: Vec<u8>,
    second_ref: &str,
    expected_second: Vec<u8>,
) -> (Option<Vec<u8>>, Option<Vec<u8>>) {
    let mut states = (None, None);
    for _ in 0..100 {
        states = (
            runtime.block_on(load_state(endpoint, first_ref)),
            runtime.block_on(load_state(endpoint, second_ref)),
        );
        if states.0.as_deref() == Some(expected_first.as_slice())
            && states.1.as_deref() == Some(expected_second.as_slice())
        {
            break;
        }
        std::thread::sleep(Duration::from_millis(25));
    }
    states
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

async fn store_counter(endpoint: &str, state_ref: &str, value: i64) {
    database::database_client::DatabaseClient::connect(endpoint.to_owned())
        .await
        .unwrap()
        .store(database::StoreRequest {
            actor_upserts: vec![database::Actor {
                state_type: "tests.reboot.protoc.TransactionCounter".into(),
                state_ref: state_ref.into(),
                state: Some(vec![0x08, value as u8]),
            }],
            task_upserts: vec![],
            colocated_upserts: vec![],
            transaction: None,
            idempotent_mutation: None,
            ensure_state_types_created: vec![],
            sync: true,
        })
        .await
        .unwrap();
}

async fn recover_idempotent_mutations(
    endpoint: &str,
    state_ref: &str,
    key: Uuid,
) -> Vec<database::IdempotentMutation> {
    let mut stream = database::database_client::DatabaseClient::connect(endpoint.to_owned())
        .await
        .unwrap()
        .recover_idempotent_mutations(database::RecoverIdempotentMutationsRequest {
            state_type: "tests.reboot.protoc.TransactionCounter".into(),
            state_ref: state_ref.into(),
            idempotency_key: Some(key.as_bytes().to_vec()),
            workflow_id: None,
            workflow_iteration: None,
        })
        .await
        .unwrap()
        .into_inner();
    let mut mutations = Vec::new();
    while let Some(response) = stream.message().await.unwrap() {
        mutations.extend(response.idempotent_mutations);
    }
    mutations
}
