use std::process::Command;
#[test]
#[ignore = "requires current CURSOR_APP_BIN and real REBOOT_NATIVE2PC_CXX_DATABASE; runs checked-in gate"]
fn canonical_cursor_and_typed_cross_actor_result_survive_actual_restarts() {
    let binary =
        std::env::var_os("CURSOR_APP_BIN").expect("parent-built real generated app required");
    let fixture = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("tests/fixtures/workflow_cursor_results_app/run_native_gate.py");
    assert!(
        Command::new("python3")
            .arg("-E")
            .env_remove("PYTHONOPTIMIZE")
            .env("CURSOR_ITERATIONS", "1030")
            .arg(fixture)
            .arg(binary)
            .status()
            .unwrap()
            .success()
    );
}

#[test]
#[ignore = "requires current CURSOR_APP_BIN and real REBOOT_NATIVE2PC_CXX_DATABASE; runs checked-in gate"]
fn cursor_gc_survives_ten_thousand_iterations_and_restarts() {
    let binary =
        std::env::var_os("CURSOR_APP_BIN").expect("parent-built real generated app required");
    let fixture = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("tests/fixtures/workflow_cursor_results_app/run_native_gate.py");
    assert!(
        Command::new("python3")
            .arg("-E")
            .env_remove("PYTHONOPTIMIZE")
            .env("CURSOR_ITERATIONS", "10000")
            .arg(fixture)
            .arg(binary)
            .status()
            .unwrap()
            .success()
    );
}
