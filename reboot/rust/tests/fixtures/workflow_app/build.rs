fn assert_generated_contract(name: &str) {
    let path = std::path::PathBuf::from(std::env::var_os("OUT_DIR").unwrap()).join(name);
    let emitted = std::fs::read_to_string(path).unwrap();
    let expected = format!(
        "const _: () = reboot::versioning::check_generated_code_compatible({});",
        reboot::versioning::GENERATED_CODE_CONTRACT
    );
    assert_eq!(emitted.matches(&expected).count(), 1, "missing or duplicate guard in {name}");
}

fn main() {
    let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .ancestors()
        .nth(5)
        .unwrap();
    reboot::build::compile_protos_with_runtime(
        &[std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("workflow/v1/workflow.proto")],
        &[std::path::Path::new(env!("CARGO_MANIFEST_DIR")), root],
        "crate::proto",
        "reboot",
    )
    .unwrap();
    assert_generated_contract("workflow/v1/workflow.reboot.rs");
}
