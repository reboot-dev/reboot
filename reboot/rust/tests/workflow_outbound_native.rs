#[test]
#[ignore = "requires actual C++ Database/RocksDB and a fresh WORKFLOW_OUTBOUND_EVIDENCE path"]
fn generated_cross_actor_writer_ack_replay_and_fail_closed_native_restart() {
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
        Command::new("python3")
            .arg(fixture.join("prove_outbound.py"))
            .arg(target.join("debug/generated-workflow-app"))
            .arg(evidence)
            .status()
            .unwrap()
            .success()
    );
}
