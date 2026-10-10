use std::process::Command;
#[test]
#[ignore = "requires real CXX/RocksDB REBOOT_NATIVE2PC_CXX_DATABASE"]
fn generated_reactive_readers_follow_commits_cancel_and_reload_after_restart() {
    let fixture =
        std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/reactive_app");
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
    assert!(
        Command::new("python3")
            .arg(fixture.join("prove_restart.py"))
            .arg(target.join("debug/generated-reactive-app"))
            .status()
            .unwrap()
            .success()
    );
}
