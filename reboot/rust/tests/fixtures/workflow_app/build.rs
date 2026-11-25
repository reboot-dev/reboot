fn assert_generated_contract(name: &str) {
    let path = std::path::PathBuf::from(std::env::var_os("OUT_DIR").unwrap()).join(name);
    let emitted = std::fs::read_to_string(path).unwrap();
    let expected = format!(
        "const _: () = reboot::versioning::check_generated_code_compatible({});",
        reboot::versioning::GENERATED_CODE_CONTRACT
    );
    assert_eq!(
        emitted.matches(&expected).count(),
        1,
        "missing or duplicate guard in {name}"
    );
}

fn main() {
    let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .ancestors()
        .nth(5)
        .unwrap();
    let fixture = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
    let fixture = if std::env::var_os("CARGO_FEATURE_PURE_TRANSACTIONS").is_some() {
        fixture.join("pure")
    } else {
        fixture.to_path_buf()
    };
    reboot::build::compile_protos_with_runtime(
        &[fixture.join("workflow/v1/workflow.proto")],
        &[fixture.as_path(), root],
        "crate::proto",
        "reboot",
    )
    .unwrap();
    assert_generated_contract("workflow/v1/workflow.reboot.rs");
    if std::env::var_os("CARGO_FEATURE_PURE_TRANSACTIONS").is_some() {
        let path = std::path::PathBuf::from(std::env::var_os("OUT_DIR").unwrap())
            .join("workflow/v1/workflow.reboot.rs");
        let generated = std::fs::read_to_string(path).unwrap();
        let adapter = generated
            .split("pub struct AtomicLedgerMethodsTransactionAdapter")
            .nth(1)
            .unwrap()
            .split("impl<H")
            .next()
            .unwrap();
        assert!(
            !adapter.contains("store:"),
            "pure adapter gained an ordinary store field"
        );
        assert!(!generated.contains("struct AtomicLedgerMethodsReaderTaskBinding"));
        assert!(generated.contains("pure transaction requires coordinator execution"));
    }
}
