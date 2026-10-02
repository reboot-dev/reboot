use std::process::Command;

#[test]
fn protoc_plugin_emits_durable_counter_adapters() {
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
        .arg("--reboot_rust_opt=module=reboot_rust_schema::proto,runtime_module=reboot")
        .arg(format!("--reboot_rust_out={}", generated.display()))
        .arg(repository.join("tests/reboot/protoc/counter.proto"))
        .status()
        .unwrap();
    assert!(status.success());

    let content =
        std::fs::read_to_string(generated.join("tests/reboot/protoc/counter.reboot.rs")).unwrap();
    assert!(content.contains("pub trait CounterWritesDatabaseHandler"));
    assert!(content.contains("pub trait CounterReadsDatabaseHandler"));
    assert!(content.contains("#[tonic::async_trait]\npub trait CounterWritesDatabaseHandler"));
    assert!(content.contains("async fn increment"));
    assert!(content.contains("handler: std::sync::Arc<H>"));
    assert!(content.contains("impl<H> Clone for CounterWritesDatabaseAdapter<H>"));
    assert!(content.contains("pub struct CounterDurableState;"));
    assert!(content.contains("type State = proto::Counter;"));
    assert!(content.contains("const STATE_TYPE: &'static str = \"tests.reboot.protoc.Counter\";"));
    assert!(content.contains("store.writer_async_for_method::<CounterDurableState"));
    assert!(content.contains("store.reader_async_for::<CounterDurableState"));
    assert!(content.contains("\"tests.reboot.protoc.CounterWrites.Increment\", request"));
    assert!(content.contains("let handler = self.handler.clone();"));
    assert!(content.contains("Box::pin(async move"));
    assert!(content.contains("reboot::runtime::DatabaseActorStore"));
}

#[test]
fn protoc_plugin_canonicalizes_relative_durable_state_annotation() {
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
        .arg("--reboot_rust_opt=module=reboot_rust_schema::proto,runtime_module=reboot")
        .arg(format!("--reboot_rust_out={}", generated.display()))
        .arg(repository.join("tests/reboot/protoc/explicit_state_annotations_relative.proto"))
        .status()
        .unwrap();
    assert!(status.success());

    let content = std::fs::read_to_string(
        generated.join("tests/reboot/protoc/explicit_state_annotations_relative.reboot.rs"),
    )
    .unwrap();
    assert!(content.contains("pub struct EchoDurableState;"));
    assert!(content.contains("store.writer_async_for_method::<EchoDurableState"));
    assert!(content.contains("store.reader_async_for::<EchoDurableState"));
    assert!(content.contains("const STATE_TYPE: &'static str = \"tests.reboot.protoc.Echo\";"));
    assert!(!content.contains("\"Echo\", request"));
}

#[test]
fn counter_cargo_build_helper_executes_durable_adapters_in_a_downstream_fixture() {
    let directory = tempfile::tempdir().unwrap();
    let repository = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .ancestors()
        .nth(2)
        .unwrap();
    let fixture = directory.path().join("downstream");
    std::fs::create_dir_all(fixture.join("src")).unwrap();
    std::fs::write(
        fixture.join("build.rs"),
        format!(
            "fn main() {{\n    let repository = std::path::Path::new(\"{}\");\n    reboot::build::compile_protos_with_runtime(\n        &[\n            repository.join(\"tests/reboot/protoc/counter.proto\"),\n            repository.join(\"tests/reboot/protoc/map_counter.proto\"),\n        ],\n        &[repository],\n        \"crate::proto\",\n        \"reboot\",\n    ).unwrap();\n}}\n",
            repository.display()
        ),
    )
    .unwrap();
    std::fs::write(
        fixture.join("Cargo.toml"),
        format!(
            "[package]\nname = \"reboot-rust-build-fixture\"\nversion = \"0.0.0\"\nedition = \"2024\"\n\n[build-dependencies]\nreboot = {{ package = \"reboot-rust-schema\", path = \"{}\", features = [\"build\"] }}\n\n[dependencies]\nprost = \"0.13\"\nreboot = {{ package = \"reboot-rust-schema\", path = \"{}\", features = [\"test-support\"] }}\ntokio = {{ version = \"1\", features = [\"macros\", \"rt-multi-thread\"] }}\ntokio-stream = {{ version = \"0.1\", features = [\"net\"] }}\ntonic = \"0.12\"\nuuid = \"1\"\n",
            env!("CARGO_MANIFEST_DIR"),
            env!("CARGO_MANIFEST_DIR")
        ),
    )
    .unwrap();
    std::fs::write(
        fixture.join("src/lib.rs"),
        r#"pub mod proto {
    tonic::include_proto!("tests.reboot.protoc");
}

#[allow(dead_code)]
mod generated {
    include!(concat!(env!("OUT_DIR"), "/tests/reboot/protoc/counter.reboot.rs"));
}

#[allow(dead_code)]
mod map_generated {
    include!(concat!(env!("OUT_DIR"), "/tests/reboot/protoc/map_counter.reboot.rs"));
}

#[cfg(test)]
mod tests {
    use super::{generated, map_generated, proto};
    use prost::Message;
    use reboot::{
        runtime::{test_support::start_database, DatabaseActorStore},
        ExternalContext,
    };
use std::collections::BTreeMap;
use uuid::Uuid;

struct Counter;

#[tonic::async_trait]
impl generated::CounterWritesDatabaseHandler for Counter {
    async fn increment(
        &self,
        state: &mut proto::Counter,
        request: proto::IncrementRequest,
    ) -> Result<proto::CounterValue, tonic::Status> {
        tokio::task::yield_now().await;
        state.value += request.amount;
        Ok(proto::CounterValue { value: state.value })
    }
}

#[tonic::async_trait]
impl generated::CounterReadsDatabaseHandler for Counter {
    async fn get(
        &self,
        state: &proto::Counter,
        _: proto::Empty,
    ) -> Result<proto::CounterValue, tonic::Status> {
        tokio::task::yield_now().await;
        Ok(proto::CounterValue { value: state.value })
    }
}

struct MapCounter;

#[tonic::async_trait]
impl map_generated::MapCounterWritesDatabaseHandler for MapCounter {
    async fn increment(
        &self,
        state: &mut proto::MapCounter,
        request: proto::MapIncrementRequest,
    ) -> Result<proto::MapCounterValue, tonic::Status> {
        state.value += request.amounts.values().sum::<i64>();
        Ok(proto::MapCounterValue { value: state.value })
    }
}

async fn start_counter_adapters(
    database_endpoint: &str,
) -> (String, tokio::task::JoinHandle<()>) {
    let writes = generated::CounterWritesDatabaseAdapter::new(
        DatabaseActorStore::connect(database_endpoint).await.unwrap(),
        Counter,
    );
    let reads = generated::CounterReadsDatabaseAdapter::new(
        DatabaseActorStore::connect(database_endpoint).await.unwrap(),
        Counter,
    );
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    let server = tokio::spawn(async move {
        tonic::transport::Server::builder()
            .add_service(proto::counter_writes_server::CounterWritesServer::new(writes))
            .add_service(proto::counter_reads_server::CounterReadsServer::new(reads))
            .serve_with_incoming(tokio_stream::wrappers::TcpListenerStream::new(listener))
            .await
            .unwrap();
    });
    (format!("http://{address}"), server)
}

async fn start_map_counter_adapters(
    database_endpoint: &str,
) -> (String, tokio::task::JoinHandle<()>) {
    let writes = map_generated::MapCounterWritesDatabaseAdapter::new(
        DatabaseActorStore::connect(database_endpoint).await.unwrap(),
        MapCounter,
    );
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    let server = tokio::spawn(async move {
        tonic::transport::Server::builder()
            .add_service(
                proto::map_counter_writes_server::MapCounterWritesServer::new(writes),
            )
            .serve_with_incoming(tokio_stream::wrappers::TcpListenerStream::new(listener))
            .await
            .unwrap();
    });
    (format!("http://{address}"), server)
}

#[tokio::test]
async fn generated_map_writer_replays_for_equivalent_map_insertion_orders() {
    let (database_endpoint, database, database_server) = start_database().await;
    let context = ExternalContext::new("database-durable-map-counter");
    let key = Uuid::from_u128(21);
    let (address, server) = start_map_counter_adapters(&database_endpoint).await;
    let mut writes = proto::map_counter_writes_client::MapCounterWritesClient::connect(address)
        .await
        .unwrap();

    let first = proto::MapIncrementRequest {
        amounts: BTreeMap::from([("alpha".into(), 2), ("beta".into(), 3)]),
    };
    let second = proto::MapIncrementRequest {
        amounts: BTreeMap::from([("beta".into(), 3), ("alpha".into(), 2)]),
    };
    assert_eq!(
        writes
            .increment(context.writer_with_key(first, key).unwrap())
            .await
            .unwrap()
            .into_inner()
            .value,
        5
    );
    assert_eq!(
        writes
            .increment(context.writer_with_key(second, key).unwrap())
            .await
            .unwrap()
            .into_inner()
            .value,
        5
    );
    assert_eq!(database.store_requests().len(), 1, "replay must not issue Store");
    server.abort();
    database_server.abort();
}

#[tokio::test]
async fn generated_durable_counter_replays_after_service_recreation() {
    let (database_endpoint, database, database_server) = start_database().await;
    let context = ExternalContext::new("database-durable-counter");
    let first_key = Uuid::from_u128(19);

    let (address, server) = start_counter_adapters(&database_endpoint).await;
    let mut writes = proto::counter_writes_client::CounterWritesClient::connect(address)
        .await
        .unwrap();
    assert_eq!(
        writes
            .increment(
                context
                    .writer_with_key(proto::IncrementRequest { amount: 5 }, first_key)
                    .unwrap(),
            )
            .await
            .unwrap()
            .into_inner()
            .value,
        5
    );
    server.abort();

    let (address, server) = start_counter_adapters(&database_endpoint).await;
    let mut writes = proto::counter_writes_client::CounterWritesClient::connect(address.clone())
        .await
        .unwrap();
    let mut reads = proto::counter_reads_client::CounterReadsClient::connect(address)
        .await
        .unwrap();
    assert_eq!(
        writes
            .increment(
                context
                    .writer_with_key(proto::IncrementRequest { amount: 5 }, first_key)
                    .unwrap(),
            )
            .await
            .unwrap()
            .into_inner()
            .value,
        5
    );
    let collision = writes
        .increment(
            context
                .writer_with_key(proto::IncrementRequest { amount: 100 }, first_key)
                .unwrap(),
        )
        .await
        .unwrap_err();
    assert_eq!(collision.code(), tonic::Code::FailedPrecondition);
    assert_eq!(
        reads
            .get(context.reader(proto::Empty {}).unwrap())
            .await
            .unwrap()
            .into_inner()
            .value,
        5
    );
    assert_eq!(
        writes
            .increment(
                context
                    .writer_with_key(proto::IncrementRequest { amount: 2 }, Uuid::from_u128(20))
                    .unwrap(),
            )
            .await
            .unwrap()
            .into_inner()
            .value,
        7
    );

    let stores = database.store_requests();
    assert_eq!(stores.len(), 2, "replay must not issue Store");
    let first = &stores[0];
    assert!(first.sync);
    assert_eq!(first.actor_upserts.len(), 1);
    let actor = &first.actor_upserts[0];
    let mutation = first.idempotent_mutation.as_ref().unwrap();
    assert_eq!(actor.state_type, "tests.reboot.protoc.Counter");
    assert_eq!(actor.state_ref, "database-durable-counter");
    assert_eq!(mutation.state_type, actor.state_type);
    assert_eq!(mutation.state_ref, actor.state_ref);
    assert_eq!(mutation.key, first_key.as_bytes());
    assert_eq!(
        proto::Counter::decode(actor.state.as_deref().unwrap()).unwrap(),
        proto::Counter { value: 5 }
    );
    assert_eq!(
        proto::CounterValue::decode(mutation.response.as_slice()).unwrap(),
        proto::CounterValue { value: 5 }
    );
    server.abort();
    database_server.abort();
}
}
"#,
    )
    .unwrap();

    let status = Command::new("cargo")
        .arg("test")
        .arg("--offline")
        .current_dir(&fixture)
        .status()
        .unwrap();
    assert!(status.success());
}

#[test]
fn default_cargo_build_helper_executes_a_durable_adapter_in_a_downstream_fixture() {
    let directory = tempfile::tempdir().unwrap();
    let repository = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .ancestors()
        .nth(2)
        .unwrap();
    let fixture = directory.path().join("default-downstream");
    std::fs::create_dir_all(fixture.join("src")).unwrap();
    std::fs::write(
        fixture.join("build.rs"),
        format!(
            "fn main() {{\n    let repository = std::path::Path::new(\"{}\");\n    reboot_rust_schema::build::compile_protos(\n        &[repository.join(\"tests/reboot/protoc/counter.proto\")],\n        &[repository],\n        \"crate::proto\",\n    ).unwrap();\n}}\n",
            repository.display()
        ),
    )
    .unwrap();
    std::fs::write(
        fixture.join("Cargo.toml"),
        format!(
            "[package]\nname = \"reboot-rust-default-build-fixture\"\nversion = \"0.0.0\"\nedition = \"2024\"\n\n[build-dependencies]\nreboot-rust-schema = {{ path = \"{}\", features = [\"build\"] }}\n\n[dependencies]\nprost = \"0.13\"\nreboot-rust-schema = {{ path = \"{}\", features = [\"test-support\"] }}\ntokio = {{ version = \"1\", features = [\"macros\", \"rt-multi-thread\"] }}\ntokio-stream = {{ version = \"0.1\", features = [\"net\"] }}\ntonic = \"0.12\"\nuuid = \"1\"\n",
            env!("CARGO_MANIFEST_DIR"),
            env!("CARGO_MANIFEST_DIR")
        ),
    )
    .unwrap();
    std::fs::write(
        fixture.join("src/lib.rs"),
        r#"pub mod proto {
    tonic::include_proto!("tests.reboot.protoc");
}

#[allow(dead_code)]
mod generated {
    include!(concat!(env!("OUT_DIR"), "/tests/reboot/protoc/counter.reboot.rs"));
}

#[cfg(test)]
mod tests {
    use super::{generated, proto};
    use reboot_rust_schema::{
        runtime::{test_support::start_database, DatabaseActorStore},
        ExternalContext,
    };
    use uuid::Uuid;

    struct Counter;

    #[tonic::async_trait]
    impl generated::CounterWritesDatabaseHandler for Counter {
        async fn increment(
            &self,
            state: &mut proto::Counter,
            request: proto::IncrementRequest,
        ) -> Result<proto::CounterValue, tonic::Status> {
            state.value += request.amount;
            Ok(proto::CounterValue { value: state.value })
        }
    }

    #[tokio::test]
    async fn default_helper_generated_writer_executes() {
        let (database_endpoint, _, database_server) = start_database().await;
        let adapter = generated::CounterWritesDatabaseAdapter::new(
            DatabaseActorStore::connect(&database_endpoint).await.unwrap(),
            Counter,
        );
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let server = tokio::spawn(async move {
            tonic::transport::Server::builder()
                .add_service(proto::counter_writes_server::CounterWritesServer::new(adapter))
                .serve_with_incoming(tokio_stream::wrappers::TcpListenerStream::new(listener))
                .await
                .unwrap();
        });
        let context = ExternalContext::new("default-cargo-helper");
        let mut client = proto::counter_writes_client::CounterWritesClient::connect(format!("http://{address}"))
            .await
            .unwrap();
        assert_eq!(
            client
                .increment(
                    context
                        .writer_with_key(proto::IncrementRequest { amount: 7 }, Uuid::from_u128(101))
                        .unwrap(),
                )
                .await
                .unwrap()
                .into_inner()
                .value,
            7
        );
        server.abort();
        database_server.abort();
    }
}
"#,
    )
    .unwrap();

    let status = Command::new("cargo")
        .arg("test")
        .arg("--offline")
        .current_dir(&fixture)
        .status()
        .unwrap();
    assert!(status.success());
}
