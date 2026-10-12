//! Draft generated contract gate: original pinned Legacy schema, no substitutes.
//! UNVERIFIED: parent must execute against the integrated plugin and downstream.
use std::process::Command;

#[test]
fn unchanged_legacy_emits_opaque_typed_initializer_and_denies_direct_workflow_rpc() {
    let directory = tempfile::tempdir().unwrap();
    let repository = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .ancestors()
        .nth(2)
        .unwrap();
    let api = repository.join("reboot/examples/monorepo/api");
    let status = Command::new(protoc_bin_vendored::protoc_bin_path().unwrap())
        .arg(format!("--proto_path={}", api.display()))
        .arg(format!("--proto_path={}", repository.display()))
        .arg(format!(
            "--proto_path={}",
            protoc_bin_vendored::include_path().unwrap().display()
        ))
        .arg(format!(
            "--plugin=protoc-gen-reboot_rust={}",
            env!("CARGO_BIN_EXE_protoc-gen-reboot_rust")
        ))
        .arg("--reboot_rust_opt=module=crate::proto,runtime_module=reboot_rust_schema")
        .arg(format!("--reboot_rust_out={}", directory.path().display()))
        .arg(api.join("hello_legacy_grpc/v1/greeter.proto"))
        .status()
        .unwrap();
    assert!(
        status.success(),
        "the original google.protobuf.Empty contract must generate"
    );
    let content = std::fs::read_to_string(
        directory
            .path()
            .join("hello_legacy_grpc/v1/greeter.reboot.rs"),
    )
    .unwrap();
    assert!(content.contains("pub struct RebootGreeterMethodsTasksInitialize"));
    assert!(content.contains("pub async fn initialize_spawn(context: &reboot_rust_schema::application_host::ServingInitializeContext"));
    assert!(content.contains("pub async fn initialize_wait(context: &reboot_rust_schema::application_host::ServingInitializeContext"));
    assert!(content.contains("context.spawn_workflow::<RebootGreeterDurableState"));
    assert!(content.contains("context.wait_workflow::<"));
    assert!(content.contains("hello_legacy_grpc.v1.RebootGreeterMethods.Initialize"));
    assert!(content.contains("type.googleapis.com/google.protobuf.Empty"));
    assert!(content.contains("workflows run only through durable generated writer scheduling"));
    assert!(content.contains("pub struct DeprecatedGreeterAdapter"));
    assert!(content.contains("pub struct ProxyGreeterAdapter"));
    assert!(!content.contains("pub trait DeprecatedGreeterDatabaseHandler"));
    assert!(!content.contains("pub trait ProxyGreeterDatabaseHandler"));
}
