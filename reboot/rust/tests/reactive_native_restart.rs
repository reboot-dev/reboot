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
#[test]
#[ignore = "requires real CXX/RocksDB REBOOT_NATIVE2PC_CXX_DATABASE"]
fn generated_user_owner_policy_revokes_subscription_and_replay_across_native_restart() {
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
            .arg(fixture.join("prove_secured_user.py"))
            .arg(target.join("debug/generated-reactive-app"))
            .status()
            .unwrap()
            .success()
    );
}

#[test]
#[ignore = "requires real CXX/RocksDB REBOOT_NATIVE2PC_CXX_DATABASE"]
fn generated_user_workflow_owner_scheduling_and_checkpoints_recover_across_native_restart() {
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
            .arg(fixture.join("prove_secured_workflow.py"))
            .arg(target.join("debug/generated-reactive-app"))
            .status()
            .unwrap()
            .success()
    );
}
