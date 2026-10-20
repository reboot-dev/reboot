#[test]
#[ignore = "requires exact-source CANONICAL_TASK_BIN, reused native Database, Python grpcio and canonical Reboot Python generator/runfiles"]
fn canonical_python_generated_spawn_and_typed_task_retained_replay() {
    run("prove_canonical_admission.py", "CANONICAL_TASK_EVIDENCE");
}

#[test]
#[ignore = "requires pinned CANONICAL_LEGACY_BIN and source commit in addition to canonical native inputs"]
fn legacy_started_intent_migrates_without_new_identity_or_unverified_uuid() {
    run(
        "prove_canonical_migration.py",
        "CANONICAL_MIGRATION_EVIDENCE",
    );
}

fn run(script: &str, evidence_variable: &str) {
    use std::{path::PathBuf, process::Command};
    let binary = PathBuf::from(
        std::env::var_os("CANONICAL_TASK_BIN").expect("build exact-source workflow fixture"),
    );
    assert!(binary.is_file());
    let python = std::env::var_os("CANONICAL_TASK_PYTHON").expect("set qualified Python runtime");
    let evidence = std::env::var_os(evidence_variable).expect("set fresh retained evidence path");
    assert!(
        Command::new(python)
            .arg(
                PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                    .join("tests/fixtures/workflow_app")
                    .join(script)
            )
            .arg(binary)
            .arg(evidence)
            .status()
            .unwrap()
            .success()
    );
}
