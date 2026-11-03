//! Actual compiler checks for the checkout-only generated API contract.
use prost::Message;
use prost_types::{FileDescriptorProto, FileDescriptorSet};
use reboot_rust_schema::{codegen, versioning};
use std::process::Command;

fn emitted() -> String {
    let set = FileDescriptorSet {
        file: vec![FileDescriptorProto {
            name: Some("contract/example/empty.proto".into()),
            package: Some("contract.example".into()),
            syntax: Some("proto3".into()),
            ..Default::default()
        }],
    };
    let response = codegen::generate_from_descriptor_set_wire(
        &set.encode_to_vec(),
        &["contract/example/empty.proto".into()],
        "crate::wire",
        "crate::renamed_runtime",
    );
    assert!(response.error.is_none(), "{:?}", response.error);
    response.file.into_iter().next().unwrap().content.unwrap()
}

fn compile(content: &str) -> std::process::Output {
    let dir = tempfile::tempdir().unwrap();
    let runtime = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("src/versioning.rs");
    let source = format!(
        "pub mod wire {{}}\nmod renamed_runtime {{ #[path = {runtime:?}] pub mod versioning; }}\nmod first {{ {content} }}\nmod second {{ {content} }}\nfn main() {{}}\n"
    );
    let file = dir.path().join("consumer.rs");
    std::fs::write(&file, source).unwrap();
    Command::new("rustc")
        .args(["--edition=2024", "--crate-type=bin"])
        .arg(&file)
        .arg("-o")
        .arg(dir.path().join("consumer"))
        .output()
        .unwrap()
}

#[test]
fn matching_generated_contract_compiles_with_alias_and_multiple_includes() {
    let output = compile(&emitted());
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
}

#[test]
fn mismatched_generated_contract_is_actionable_compile_error() {
    let current = versioning::GENERATED_CODE_CONTRACT;
    let content = emitted().replace(
        &format!("check_generated_code_compatible({current})"),
        &format!("check_generated_code_compatible({})", current + 1),
    );
    let output = compile(&content);
    assert!(!output.status.success());
    let error = String::from_utf8_lossy(&output.stderr);
    assert!(
        error.contains("generated-code contract mismatch"),
        "{error}"
    );
    assert!(error.contains("regenerate adapters"), "{error}");
}
