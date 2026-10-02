use std::process::Command;

#[test]
fn counter_plugin_output_compiles_in_a_downstream_fixture() {
    let directory = tempfile::tempdir().unwrap();
    let generated = directory.path().join("generated");
    std::fs::create_dir_all(&generated).unwrap();

    let repository = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .ancestors()
        .nth(2)
        .unwrap();
    let status = Command::new(protoc_bin_vendored::protoc_bin_path().unwrap())
        .arg(format!("--proto_path={}", repository.display()))
        .arg(format!(
            "--proto_path={}",
            protoc_bin_vendored::include_path().unwrap().display()
        ))
        .arg(format!(
            "--plugin=protoc-gen-reboot_rust={}",
            env!("CARGO_BIN_EXE_protoc-gen-reboot_rust")
        ))
        .arg("--reboot_rust_opt=module=reboot_rust_schema::proto")
        .arg(format!("--reboot_rust_out={}", generated.display()))
        .arg(repository.join("tests/reboot/protoc/counter.proto"))
        .status()
        .unwrap();
    assert!(status.success());

    let generated_source = generated.join("tests/reboot/protoc/counter.reboot.rs");
    assert!(generated_source.is_file());
    let content = std::fs::read_to_string(&generated_source).unwrap();
    assert!(content.contains("pub trait CounterWritesDatabaseHandler"));
    assert!(content.contains("pub trait CounterReadsDatabaseHandler"));
    assert!(content.contains("store.writer::<proto::Counter"));
    assert!(content.contains("store.reader::<proto::Counter"));

    let fixture = directory.path().join("downstream");
    std::fs::create_dir_all(fixture.join("src")).unwrap();
    std::fs::copy(&generated_source, fixture.join("src/generated.rs")).unwrap();
    std::fs::write(
        fixture.join("Cargo.toml"),
        format!(
            "[package]\nname = \"reboot-rust-plugin-fixture\"\nversion = \"0.0.0\"\nedition = \"2024\"\n\n[dependencies]\nreboot-rust-schema = {{ path = \"{}\" }}\ntonic = \"0.12\"\n",
            env!("CARGO_MANIFEST_DIR")
        ),
    )
    .unwrap();
    std::fs::write(
        fixture.join("src/lib.rs"),
        r#"mod generated {
    include!("generated.rs");
}

use reboot_rust_schema::proto;

#[derive(Clone)]
struct Counter;

#[tonic::async_trait]
impl generated::CounterWritesHandler for Counter {
    async fn increment(
        &self,
        request: tonic::Request<proto::IncrementRequest>,
    ) -> Result<tonic::Response<proto::CounterValue>, tonic::Status> {
        Ok(tonic::Response::new(proto::CounterValue {
            value: request.into_inner().amount,
        }))
    }
}

#[tonic::async_trait]
impl generated::CounterReadsHandler for Counter {
    async fn get(
        &self,
        _: tonic::Request<proto::Empty>,
    ) -> Result<tonic::Response<proto::CounterValue>, tonic::Status> {
        Ok(tonic::Response::new(proto::CounterValue { value: 0 }))
    }
}

impl generated::CounterWritesDatabaseHandler for Counter {
    fn increment(
        &self,
        state: &mut proto::Counter,
        request: proto::IncrementRequest,
    ) -> Result<proto::CounterValue, tonic::Status> {
        state.value += request.amount;
        Ok(proto::CounterValue { value: state.value })
    }
}

impl generated::CounterReadsDatabaseHandler for Counter {
    fn get(
        &self,
        state: &proto::Counter,
        _: proto::Empty,
    ) -> Result<proto::CounterValue, tonic::Status> {
        Ok(proto::CounterValue { value: state.value })
    }
}

fn adapters_are_concrete() {
    let writes = generated::CounterWritesAdapter::new(Counter);
    let reads = generated::CounterReadsAdapter::new(Counter);
    let _ = proto::counter_writes_server::CounterWritesServer::new(writes);
    let _ = proto::counter_reads_server::CounterReadsServer::new(reads);
    let _: Option<generated::CounterWritesDatabaseAdapter<Counter>> = None;
    let _: Option<generated::CounterReadsDatabaseAdapter<Counter>> = None;
}
"#,
    )
    .unwrap();

    let status = Command::new("cargo")
        .arg("check")
        .arg("--offline")
        .current_dir(&fixture)
        .status()
        .unwrap();
    assert!(status.success());
}
