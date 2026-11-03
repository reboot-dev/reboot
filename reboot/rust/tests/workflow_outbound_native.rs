#[test]
#[ignore = "requires actual C++ Database/RocksDB and a fresh WORKFLOW_OUTBOUND_EVIDENCE path"]
fn generated_cross_actor_writer_ack_replay_and_fail_closed_native_restart() {
    prove("prove_outbound.py", "python3");
}

#[test]
#[ignore = "requires actual C++ Database/RocksDB, grpcio Python and fresh WORKFLOW_OUTBOUND_EVIDENCE"]
fn generated_writer_real_store_ack_loss_target_started_stored() {
    let python = std::env::var("WORKFLOW_ACK_PROXY_PYTHON")
        .expect("set WORKFLOW_ACK_PROXY_PYTHON to a Python with grpcio");
    prove("prove_ack_loss.py", &python);
}

fn prove(script: &str, python: &str) {
    use std::{path::PathBuf, process::Command};
    let fixture = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/workflow_app");
    assert!(
        Command::new("cargo")
            .args(["build", "--locked"])
            .current_dir(&fixture)
            .status()
            .unwrap()
            .success()
    );
    let target = std::env::var_os("CARGO_TARGET_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|| fixture.join("target"));
    let target = if target.is_absolute() {
        target
    } else {
        fixture.join(target)
    };
    let evidence = std::env::var_os("WORKFLOW_OUTBOUND_EVIDENCE")
        .expect("set a fresh retained WORKFLOW_OUTBOUND_EVIDENCE directory");
    assert!(
        Command::new(python)
            .arg(fixture.join(script))
            .arg(target.join("debug/generated-workflow-app"))
            .arg(evidence)
            .status()
            .unwrap()
            .success()
    );
}
