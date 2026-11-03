#[test]
#[ignore = "requires exact-source WORKFLOW_TASK_BIN, actual native Database, Python with grpcio/grpc_tools and fresh WORKFLOW_TASK_EVIDENCE"]
fn canonical_python_tasks_wire_cancellation_and_retained_replay() {
    use std::{path::PathBuf, process::Command};
    let binary = PathBuf::from(
        std::env::var_os("WORKFLOW_TASK_BIN")
            .expect("build the exact-source generated workflow fixture first"),
    );
    assert!(binary.is_file());
    let python =
        std::env::var_os("WORKFLOW_TASK_PYTHON").expect("set Python with grpcio/grpc_tools");
    let evidence =
        std::env::var_os("WORKFLOW_TASK_EVIDENCE").expect("set a fresh retained evidence path");
    assert!(
        Command::new(python)
            .arg(
                PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                    .join("tests/fixtures/workflow_app/prove_tasks.py")
            )
            .arg(binary)
            .arg(evidence)
            .status()
            .unwrap()
            .success()
    );
}
