use std::process::Command;
#[test]
#[ignore = "requires REBOOT_NATIVE2PC_CXX_DATABASE real CXX/RocksDB"]
fn generated_named_workflow_survives_three_actual_process_restarts() {
    proof("prove_restart.py");
}
#[test]
#[ignore = "requires REBOOT_NATIVE2PC_CXX_DATABASE real CXX/RocksDB"]
fn generated_workflow_body_resumes_without_host_restart_and_fences_unsafe_failures() {
    proof("prove_body_retry.py");
}
#[test]
#[ignore = "requires REBOOT_NATIVE2PC_CXX_DATABASE real CXX/RocksDB"]
fn generated_finite_iterations_and_reactive_decisions_survive_native_restart() {
    proof("prove_control_flow.py");
}
fn proof(script: &str) {
    let fixture =
        std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/workflow_app");
    assert!(
        Command::new("cargo")
            .args(["build", "--locked"])
            .current_dir(&fixture)
            .status()
            .unwrap()
            .success()
    );
    let target = std::env::var_os("CARGO_TARGET_DIR")
        .map(std::path::PathBuf::from)
        .unwrap_or_else(|| fixture.join("target"));
    let target = if target.is_absolute() {
        target
    } else {
        fixture.join(target)
    };
    assert!(
        Command::new("python3")
            .arg(fixture.join(script))
            .arg(target.join("debug/generated-workflow-app"))
            .status()
            .unwrap()
            .success()
    );
}
