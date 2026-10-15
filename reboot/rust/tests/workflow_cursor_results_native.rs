use std::process::Command;
#[test]
#[ignore = "parent builds generated consumer; requires real CXX/RocksDB and CURSOR_STAGE/CURSOR_EVIDENCE"]
fn canonical_cursor_and_typed_cross_actor_result_survive_actual_restarts() {
    let binary =
        std::env::var_os("CURSOR_APP_BIN").expect("parent-built real generated app required");
    let fixture = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("tests/fixtures/workflow_cursor_results_app/prove_cursor.py");
    assert!(Command::new("python3")
        .arg("-E")
        .env_remove("PYTHONOPTIMIZE")
        .arg(fixture)
        .arg(binary)
        .status()
        .unwrap()
        .success());
}
