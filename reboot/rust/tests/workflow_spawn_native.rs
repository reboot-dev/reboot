#[test]
#[ignore = "requires prebuilt exact-source WORKFLOW_SPAWN_BIN, native Database, grpcio Python and a fresh WORKFLOW_SPAWN_EVIDENCE path"]
fn generated_workflow_spawn_native_admission_replay_and_unknown_ack() {
    use std::{path::PathBuf, process::Command};
    let binary = PathBuf::from(
        std::env::var_os("WORKFLOW_SPAWN_BIN")
            .expect("build the exact-source generated workflow fixture first"),
    );
    assert!(binary.is_file());
    let python = std::env::var_os("WORKFLOW_SPAWN_PYTHON").expect("set Python with grpcio");
    let evidence =
        std::env::var_os("WORKFLOW_SPAWN_EVIDENCE").expect("set a fresh retained evidence path");
    assert!(
        Command::new(python)
            .arg(
                PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                    .join("tests/fixtures/workflow_app/prove_spawn.py")
            )
            .arg(binary)
            .arg(evidence)
            .status()
            .unwrap()
            .success()
    );
}
