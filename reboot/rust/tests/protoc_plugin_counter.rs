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
            "fn main() {{\n    let repository = std::path::Path::new(\"{}\");\n    reboot::build::compile_protos_with_runtime(\n        &[\n            repository.join(\"tests/reboot/protoc/counter.proto\"),\n            repository.join(\"tests/reboot/protoc/map_counter.proto\"),\n            repository.join(\"tests/reboot/protoc/transaction_counter.proto\"),\n        ],\n        &[repository],\n        \"crate::proto\",\n        \"reboot\",\n    ).unwrap();\n}}\n",
            repository.display()
        ),
    )
    .unwrap();
    std::fs::write(
        fixture.join("Cargo.toml"),
        format!(
            "[package]\nname = \"reboot-rust-build-fixture\"\nversion = \"0.0.0\"\nedition = \"2024\"\n\n[build-dependencies]\nreboot = {{ package = \"reboot-rust-schema\", path = \"{}\", features = [\"build\"] }}\n\n[dependencies]\nhttp = \"1\"\nprost = \"0.13\"\nprost-types = \"0.13\"\nreboot = {{ package = \"reboot-rust-schema\", path = \"{}\", features = [\"test-support\"] }}\ntokio = {{ version = \"1\", features = [\"macros\", \"rt-multi-thread\"] }}\ntokio-stream = {{ version = \"0.1\", features = [\"net\"] }}\ntonic = \"0.12\"\nuuid = \"1\"\n",
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

#[allow(dead_code)]
mod transaction_generated {
    include!(concat!(env!("OUT_DIR"), "/tests/reboot/protoc/transaction_counter.reboot.rs"));
}

#[cfg(test)]
mod tests {
    use super::{generated, map_generated, proto, transaction_generated};
    use prost::Message;
    use reboot::{
        runtime::{test_support::start_database, DatabaseActorStore},
        ExternalContext,
    };
use std::collections::BTreeMap;
use std::future::Future;
use std::pin::Pin;
use std::sync::Arc;
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

struct TransactionCounter {
    trace: Arc<std::sync::Mutex<Vec<&'static str>>>,
    fail: bool,
}

#[tonic::async_trait]
impl transaction_generated::TransactionCounterWritesTransactionHandler for TransactionCounter {
    async fn read(
        &self,
        state: &proto::TransactionCounter,
        _: proto::TransactionIncrementRequest,
    ) -> Result<proto::TransactionCounterValue, tonic::Status> {
        self.trace.lock().unwrap().push("reader handler");
        Ok(proto::TransactionCounterValue { value: state.value })
    }

    async fn write(
        &self,
        state: &mut proto::TransactionCounter,
        request: proto::TransactionIncrementRequest,
    ) -> Result<proto::TransactionCounterValue, tonic::Status> {
        self.trace.lock().unwrap().push("writer handler");
        state.value += request.amount;
        Ok(proto::TransactionCounterValue { value: state.value })
    }

    async fn increment(
        &self,
        _: &reboot::runtime::TransactionContext,
        state: &mut proto::TransactionCounter,
        request: proto::TransactionIncrementRequest,
    ) -> Result<reboot::runtime::TransactionExecution<proto::TransactionCounterValue>, tonic::Status> {
        self.trace.lock().unwrap().push("handler");
        if self.fail {
            return Err(tonic::Status::invalid_argument("handler rejected request"));
        }
        state.value += request.amount;
        let mut execution = reboot::runtime::TransactionExecution::new(
            proto::TransactionCounterValue { value: state.value },
        );
        execution.final_state = Some(state.encode_to_vec());
        Ok(execution)
    }

    async fn factory_increment(
        &self,
        _: &reboot::runtime::TransactionContext,
        state: &mut proto::TransactionCounter,
        request: proto::TransactionIncrementRequest,
    ) -> Result<reboot::runtime::TransactionExecution<proto::TransactionCounterValue>, tonic::Status> {
        self.trace.lock().unwrap().push("factory handler");
        if self.fail {
            return Err(tonic::Status::invalid_argument("factory handler rejected request"));
        }
        state.value += request.amount;
        // Deliberately no final_state: the generated factory adapter must stage
        // the default-initialized state it passed to the handler.
        Ok(reboot::runtime::TransactionExecution::new(
            proto::TransactionCounterValue { value: state.value },
        ))
    }

    async fn shared_read(
        &self,
        _: &reboot::runtime::TransactionContext,
        state: &mut proto::TransactionCounter,
        _: proto::TransactionIncrementRequest,
    ) -> Result<reboot::runtime::TransactionExecution<proto::TransactionCounterValue>, tonic::Status> {
        self.trace.lock().unwrap().push("shared handler");
        Ok(reboot::runtime::TransactionExecution::new(
            proto::TransactionCounterValue { value: state.value },
        ))
    }
}

struct TransactionParticipantSidecar {
    trace: Arc<std::sync::Mutex<Vec<&'static str>>>,
    state: Option<proto::TransactionCounter>,
    staged_states: Arc<std::sync::Mutex<Vec<Option<Vec<u8>>>>>,
}

impl reboot::durable_participant::ParticipantSidecar for TransactionParticipantSidecar {
    fn load(&self, _: reboot::database_proto::LoadRequest) -> Pin<Box<dyn Future<Output = Result<reboot::database_proto::LoadResponse, tonic::Status>> + Send + '_>> {
        self.trace.lock().unwrap().push("participant load");
        let state = self.state.clone().map(|state| state.encode_to_vec());
        Box::pin(async move { Ok(reboot::database_proto::LoadResponse {
            actors: vec![reboot::database_proto::Actor {
                state_type: "tests.reboot.protoc.TransactionCounter".into(),
                state_ref: "transaction-counter".into(),
                state,
            }],
            ..Default::default()
        }) })
    }
    fn prepare(&self, request: reboot::database_proto::TransactionParticipantPrepareRequest) -> Pin<Box<dyn Future<Output = Result<reboot::database_proto::TransactionParticipantPrepareResponse, tonic::Status>> + Send + '_>> {
        self.staged_states.lock().unwrap().push(request.state.clone());
        self.trace.lock().unwrap().push("participant prepare");
        Box::pin(async { Ok(reboot::database_proto::TransactionParticipantPrepareResponse::default()) })
    }
    fn commit(&self, _: reboot::database_proto::TransactionParticipantCommitRequest) -> Pin<Box<dyn Future<Output = Result<reboot::database_proto::TransactionParticipantCommitResponse, tonic::Status>> + Send + '_>> {
        self.trace.lock().unwrap().push("participant commit");
        Box::pin(async { Ok(reboot::database_proto::TransactionParticipantCommitResponse::default()) })
    }
    fn abort(&self, _: reboot::database_proto::TransactionParticipantAbortRequest) -> Pin<Box<dyn Future<Output = Result<reboot::database_proto::TransactionParticipantAbortResponse, tonic::Status>> + Send + '_>> {
        self.trace.lock().unwrap().push("participant abort");
        Box::pin(async { Ok(reboot::database_proto::TransactionParticipantAbortResponse::default()) })
    }
    fn recover(&self, _: reboot::database_proto::RecoverRequest) -> Pin<Box<dyn Future<Output = Result<Vec<reboot::database_proto::RecoverResponse>, tonic::Status>> + Send + '_>> {
        Box::pin(async { Ok(Vec::new()) })
    }
}

struct TransactionCoordinatorSidecar {
    trace: Arc<std::sync::Mutex<Vec<&'static str>>>,
}

impl reboot::durable_coordinator::CoordinatorSidecar for TransactionCoordinatorSidecar {
    fn coordinator_prepare(&self, _: reboot::database_proto::TransactionCoordinatorPrepareRequest) -> Pin<Box<dyn Future<Output = Result<reboot::database_proto::TransactionCoordinatorPrepareResponse, tonic::Status>> + Send + '_>> {
        self.trace.lock().unwrap().push("coordinator DB prepare");
        Box::pin(async { Ok(reboot::database_proto::TransactionCoordinatorPrepareResponse::default()) })
    }
    fn coordinator_prepared(&self, _: reboot::database_proto::TransactionCoordinatorPreparedRequest) -> Pin<Box<dyn Future<Output = Result<reboot::database_proto::TransactionCoordinatorPreparedResponse, tonic::Status>> + Send + '_>> {
        self.trace.lock().unwrap().push("coordinator DB prepared");
        Box::pin(async { Ok(reboot::database_proto::TransactionCoordinatorPreparedResponse::default()) })
    }
    fn coordinator_cleanup(&self, _: reboot::database_proto::TransactionCoordinatorCleanupRequest) -> Pin<Box<dyn Future<Output = Result<reboot::database_proto::TransactionCoordinatorCleanupResponse, tonic::Status>> + Send + '_>> {
        self.trace.lock().unwrap().push("coordinator DB cleanup");
        Box::pin(async { Ok(reboot::database_proto::TransactionCoordinatorCleanupResponse::default()) })
    }
    fn decision_put(&self, _: reboot::database_proto::TransactionCoordinatorDecisionPutRequest) -> Pin<Box<dyn Future<Output = Result<reboot::database_proto::TransactionCoordinatorDecisionPutResponse, tonic::Status>> + Send + '_>> {
        self.trace.lock().unwrap().push("coordinator DB decision");
        Box::pin(async { Ok(reboot::database_proto::TransactionCoordinatorDecisionPutResponse::default()) })
    }
    fn recover(&self, _: reboot::database_proto::RecoverRequest) -> Pin<Box<dyn Future<Output = Result<Vec<reboot::database_proto::RecoverResponse>, tonic::Status>> + Send + '_>> {
        Box::pin(async { Ok(Vec::new()) })
    }
}

struct TransactionStartFactory;

impl reboot::runtime::RootTransactionStartFactory for TransactionStartFactory {
    fn next_root_transaction(&self) -> Result<reboot::runtime::RootTransactionStart, tonic::Status> {
        Ok(reboot::runtime::RootTransactionStart {
            transaction_id: Uuid::from_u128(102),
            timestamp: prost_types::Timestamp::default(),
        })
    }
}

impl reboot::runtime::InboundTransactionStartFactory for TransactionStartFactory {
    fn next_inbound_transaction(
        &self,
        inbound: &reboot::runtime::InboundTransactionContext,
    ) -> Result<Uuid, tonic::Status> {
        assert_eq!(inbound.transaction().transaction_root_id(), Uuid::from_u128(201));
        Ok(Uuid::from_u128(202))
    }
}

fn transaction_adapter(
    trace: Arc<std::sync::Mutex<Vec<&'static str>>>,
    fail: bool,
) -> transaction_generated::TransactionCounterWritesTransactionAdapter<
    TransactionCounter,
    TransactionParticipantSidecar,
    TransactionCoordinatorSidecar,
    reboot::durable_coordinator::SingleParticipantResolver<TransactionParticipantSidecar>,
    TransactionStartFactory,
> {
    transaction_adapter_with_store(
        trace,
        fail,
        DatabaseActorStore::connect_lazy("http://127.0.0.1:1").unwrap(),
    )
}

fn transaction_adapter_with_store(
    trace: Arc<std::sync::Mutex<Vec<&'static str>>>,
    fail: bool,
    store: DatabaseActorStore,
) -> transaction_generated::TransactionCounterWritesTransactionAdapter<
    TransactionCounter,
    TransactionParticipantSidecar,
    TransactionCoordinatorSidecar,
    reboot::durable_coordinator::SingleParticipantResolver<TransactionParticipantSidecar>,
    TransactionStartFactory,
> {
    let participant = reboot::durable_participant::DurableActorParticipant::new(
        Arc::new(TransactionParticipantSidecar {
            trace: Arc::clone(&trace),
            state: Some(proto::TransactionCounter { value: 4 }),
            staged_states: Arc::new(std::sync::Mutex::new(Vec::new())),
        }),
        "tests.reboot.protoc.TransactionCounter",
        "transaction-counter",
    );
    let coordinator = reboot::durable_coordinator::DurableRootCoordinator::new(
        Arc::new(TransactionCoordinatorSidecar { trace: Arc::clone(&trace) }),
        Arc::new(reboot::durable_coordinator::SingleParticipantResolver::new(
            reboot::durable_coordinator::ParticipantTarget {
                state_type: "tests.reboot.protoc.TransactionCounter".into(),
                state_ref: "transaction-counter".into(),
            },
            reboot::durable_participant::DurableActorParticipantHost::new(participant.clone()),
        ).unwrap()),
    );
    transaction_generated::TransactionCounterWritesTransactionAdapter::new(
        store,
        participant,
        coordinator,
        TransactionStartFactory,
        TransactionCounter { trace, fail },
    )
}

fn factory_transaction_adapter(
    trace: Arc<std::sync::Mutex<Vec<&'static str>>>,
    initial_state: Option<proto::TransactionCounter>,
    staged_states: Arc<std::sync::Mutex<Vec<Option<Vec<u8>>>>>,
    fail: bool,
) -> transaction_generated::TransactionCounterWritesTransactionAdapter<
    TransactionCounter,
    TransactionParticipantSidecar,
    TransactionCoordinatorSidecar,
    reboot::durable_coordinator::SingleParticipantResolver<TransactionParticipantSidecar>,
    TransactionStartFactory,
> {
    let store = DatabaseActorStore::connect_lazy("http://127.0.0.1:1").unwrap();
    let participant = reboot::durable_participant::DurableActorParticipant::new(
        Arc::new(TransactionParticipantSidecar {
            trace: Arc::clone(&trace),
            state: initial_state,
            staged_states,
        }),
        "tests.reboot.protoc.TransactionCounter",
        "transaction-counter",
    );
    let coordinator = reboot::durable_coordinator::DurableRootCoordinator::new(
        Arc::new(TransactionCoordinatorSidecar { trace: Arc::clone(&trace) }),
        Arc::new(reboot::durable_coordinator::SingleParticipantResolver::new(
            reboot::durable_coordinator::ParticipantTarget {
                state_type: "tests.reboot.protoc.TransactionCounter".into(),
                state_ref: "transaction-counter".into(),
            },
            reboot::durable_participant::DurableActorParticipantHost::new(participant.clone()),
        ).unwrap()),
    );
    transaction_generated::TransactionCounterWritesTransactionAdapter::new(
        store,
        participant,
        coordinator,
        TransactionStartFactory,
        TransactionCounter { trace, fail },
    )
}

#[derive(Clone)]
struct FixedChannelResolver(tonic::transport::Channel);

#[tonic::async_trait]
impl reboot::runtime::TransactionalChannelResolver for FixedChannelResolver {
    async fn resolve(
        &self,
        state_type: &str,
        state_ref: &str,
    ) -> Result<tonic::transport::Channel, tonic::Status> {
        assert_eq!(state_type, "tests.reboot.protoc.TransactionCounter");
        assert_eq!(state_ref, "transaction-counter");
        Ok(self.0.clone())
    }
}

#[tokio::test]
async fn generated_transaction_adapter_executes_in_process_protocol_trace() {
    use proto::transaction_counter_writes_server::TransactionCounterWrites;

    let trace = Arc::new(std::sync::Mutex::new(Vec::new()));
    let mut request = tonic::Request::new(proto::TransactionIncrementRequest { amount: 3 });
    *request.metadata_mut() = reboot::RebootHeaders::new("transaction-counter")
        .to_metadata()
        .unwrap();
    let response = TransactionCounterWrites::increment(
        &transaction_adapter(Arc::clone(&trace), false),
        request,
    )
    .await
    .unwrap();
    assert_eq!(response.into_inner().value, 7);
    assert_eq!(*trace.lock().unwrap(), [
        "participant load",
        "handler",
        "coordinator DB prepare",
        "participant prepare",
        "coordinator DB prepared",
        "coordinator DB decision",
        "participant commit",
        "coordinator DB cleanup",
    ]);
}

#[tokio::test]
async fn generated_transaction_adapter_aborts_when_handler_rejects() {
    use proto::transaction_counter_writes_server::TransactionCounterWrites;

    let trace = Arc::new(std::sync::Mutex::new(Vec::new()));
    let mut request = tonic::Request::new(proto::TransactionIncrementRequest { amount: 3 });
    *request.metadata_mut() = reboot::RebootHeaders::new("transaction-counter")
        .to_metadata()
        .unwrap();
    let error = TransactionCounterWrites::increment(
        &transaction_adapter(Arc::clone(&trace), true),
        request,
    )
    .await
    .unwrap_err();
    assert_eq!(error.code(), tonic::Code::InvalidArgument);
    assert_eq!(*trace.lock().unwrap(), ["participant load", "handler", "participant abort"]);
}

#[tokio::test]
async fn generated_factory_transaction_materializes_default_state_and_rejects_existing_actor() {
    use proto::transaction_counter_writes_server::TransactionCounterWrites;

    let trace = Arc::new(std::sync::Mutex::new(Vec::new()));
    let staged_states = Arc::new(std::sync::Mutex::new(Vec::new()));
    let mut request = tonic::Request::new(proto::TransactionIncrementRequest { amount: 3 });
    *request.metadata_mut() = reboot::RebootHeaders::new("transaction-counter")
        .to_metadata()
        .unwrap();
    let response = TransactionCounterWrites::factory_increment(
        &factory_transaction_adapter(Arc::clone(&trace), None, Arc::clone(&staged_states), false),
        request,
    )
    .await
    .unwrap();
    assert_eq!(response.into_inner().value, 3);
    assert_eq!(
        proto::TransactionCounter::decode(
            staged_states.lock().unwrap()[0].as_deref().unwrap(),
        )
        .unwrap(),
        proto::TransactionCounter { value: 3 },
        "factory commit must materialize state even when the handler supplies no final_state",
    );
    assert_eq!(*trace.lock().unwrap(), [
        "participant load",
        "factory handler",
        "coordinator DB prepare",
        "participant prepare",
        "coordinator DB prepared",
        "coordinator DB decision",
        "participant commit",
        "coordinator DB cleanup",
    ]);

    let trace = Arc::new(std::sync::Mutex::new(Vec::new()));
    let staged_states = Arc::new(std::sync::Mutex::new(Vec::new()));
    let mut request = tonic::Request::new(proto::TransactionIncrementRequest { amount: 3 });
    *request.metadata_mut() = reboot::RebootHeaders::new("transaction-counter")
        .to_metadata()
        .unwrap();
    let error = TransactionCounterWrites::increment(
        &factory_transaction_adapter(Arc::clone(&trace), None, Arc::clone(&staged_states), false),
        request,
    )
    .await
    .unwrap_err();
    assert_eq!(error.code(), tonic::Code::FailedPrecondition);
    assert!(staged_states.lock().unwrap().is_empty());
    assert_eq!(*trace.lock().unwrap(), ["participant load", "participant abort"]);

    let trace = Arc::new(std::sync::Mutex::new(Vec::new()));
    let staged_states = Arc::new(std::sync::Mutex::new(Vec::new()));
    let mut request = tonic::Request::new(proto::TransactionIncrementRequest { amount: 3 });
    *request.metadata_mut() = reboot::RebootHeaders::new("transaction-counter")
        .to_metadata()
        .unwrap();
    let error = TransactionCounterWrites::factory_increment(
        &factory_transaction_adapter(
            Arc::clone(&trace),
            Some(proto::TransactionCounter { value: 9 }),
            Arc::clone(&staged_states),
            false,
        ),
        request,
    )
    .await
    .unwrap_err();
    assert_eq!(error.code(), tonic::Code::FailedPrecondition);
    assert!(staged_states.lock().unwrap().is_empty());
    assert_eq!(*trace.lock().unwrap(), ["participant load", "participant abort"]);

    let trace = Arc::new(std::sync::Mutex::new(Vec::new()));
    let staged_states = Arc::new(std::sync::Mutex::new(Vec::new()));
    let mut request = tonic::Request::new(proto::TransactionIncrementRequest { amount: 3 });
    *request.metadata_mut() = reboot::RebootHeaders::new("transaction-counter")
        .to_metadata()
        .unwrap();
    let error = TransactionCounterWrites::factory_increment(
        &factory_transaction_adapter(Arc::clone(&trace), None, Arc::clone(&staged_states), true),
        request,
    )
    .await
    .unwrap_err();
    assert_eq!(error.code(), tonic::Code::InvalidArgument);
    assert!(staged_states.lock().unwrap().is_empty(), "aborted factory must not prepare state");
    assert_eq!(*trace.lock().unwrap(), ["participant load", "factory handler", "participant abort"]);
}

#[tokio::test]
async fn generated_transaction_adapter_stages_validated_inbound_participant_in_success_trailer() {
    use proto::transaction_counter_writes_server::TransactionCounterWrites;

    let trace = Arc::new(std::sync::Mutex::new(Vec::new()));
    let mut headers = reboot::RebootHeaders::new("transaction-counter");
    headers.transaction_ids = Some(vec![Uuid::from_u128(201)]);
    headers.transaction_coordinator_state_type = Some("tests.reboot.protoc.Root".into());
    headers.transaction_coordinator_state_ref = Some("root-counter".into());
    let mut request = tonic::Request::new(proto::TransactionIncrementRequest { amount: 3 });
    *request.metadata_mut() = headers.to_metadata().unwrap();

    let response = TransactionCounterWrites::increment(
        &transaction_adapter(Arc::clone(&trace), false),
        request,
    )
    .await
    .unwrap();

    assert_eq!(response.get_ref().value, 7);
    assert!(response
        .extensions()
        .get::<reboot::successful_trailers::SuccessfulParticipantMetadata>()
        .is_some());
    assert_eq!(*trace.lock().unwrap(), ["participant load", "handler"]);
}

#[tokio::test]
async fn generated_transaction_adapter_emits_inbound_participant_only_in_raw_success_trailers() {
    let trace = Arc::new(std::sync::Mutex::new(Vec::new()));
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    let adapter = transaction_adapter(Arc::clone(&trace), false);
    let server = tokio::spawn(async move {
        tonic::transport::Server::builder()
            .layer(reboot::successful_trailers::SuccessfulParticipantTrailerLayer)
            .add_service(
                proto::transaction_counter_writes_server::TransactionCounterWritesServer::new(adapter),
            )
            .serve_with_incoming(tokio_stream::wrappers::TcpListenerStream::new(listener))
            .await
            .unwrap();
    });

    let channel = tonic::transport::Channel::from_shared(format!("http://{address}"))
        .unwrap()
        .connect()
        .await
        .unwrap();
    let mut grpc = tonic::client::Grpc::new(channel);
    grpc.ready().await.unwrap();
    let mut headers = reboot::RebootHeaders::new("transaction-counter");
    headers.transaction_ids = Some(vec![Uuid::from_u128(201)]);
    headers.transaction_coordinator_state_type = Some("tests.reboot.protoc.Root".into());
    headers.transaction_coordinator_state_ref = Some("root-counter".into());
    let mut request = tonic::Request::new(proto::TransactionIncrementRequest { amount: 3 });
    *request.metadata_mut() = headers.to_metadata().unwrap();
    let response: tonic::Response<tonic::Streaming<proto::TransactionCounterValue>> = grpc
        .server_streaming::<
            proto::TransactionIncrementRequest,
            proto::TransactionCounterValue,
            _,
        >(
            request,
            http::uri::PathAndQuery::from_static(
                "/tests.reboot.protoc.TransactionCounterWrites/Increment",
            ),
            tonic::codec::ProstCodec::default(),
        )
        .await
        .unwrap();
    assert!(response
        .metadata()
        .get(reboot::successful_trailers::TRANSACTION_PARTICIPANTS_HEADER)
        .is_none());
    let mut stream = response.into_inner();
    assert_eq!(stream.message().await.unwrap().unwrap().value, 7);
    let trailers = stream.trailers().await.unwrap().unwrap();
    assert_eq!(trailers.get("grpc-status").unwrap(), "0");
    assert_eq!(
        trailers
            .get(reboot::successful_trailers::TRANSACTION_PARTICIPANTS_HEADER)
            .unwrap(),
        "{\"tests.reboot.protoc.TransactionCounter\":[\"transaction-counter\"]}"
    );
    assert_eq!(*trace.lock().unwrap(), ["participant load", "handler"]);
    server.abort();
}

#[tokio::test]
async fn generated_mixed_service_mounts_and_dispatches_database_and_transaction_methods() {
    let (database_endpoint, _, database_server) = start_database().await;
    let trace = Arc::new(std::sync::Mutex::new(Vec::new()));
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    let adapter = transaction_adapter_with_store(
        Arc::clone(&trace),
        false,
        DatabaseActorStore::connect(&database_endpoint).await.unwrap(),
    );
    let server = tokio::spawn(async move {
        tonic::transport::Server::builder()
            .layer(reboot::successful_trailers::SuccessfulParticipantTrailerLayer)
            .add_service(
                proto::transaction_counter_writes_server::TransactionCounterWritesServer::new(adapter),
            )
            .serve_with_incoming(tokio_stream::wrappers::TcpListenerStream::new(listener))
            .await
            .unwrap();
    });
    let mut client = proto::transaction_counter_writes_client::TransactionCounterWritesClient::connect(
        format!("http://{address}"),
    )
    .await
    .unwrap();
    let context = ExternalContext::new("transaction-counter");
    assert_eq!(
        client
            .read(context.reader(proto::TransactionIncrementRequest { amount: 0 }).unwrap())
            .await
            .unwrap()
            .into_inner()
            .value,
        0
    );
    assert_eq!(
        client
            .write(
                context
                    .writer_with_key(proto::TransactionIncrementRequest { amount: 2 }, Uuid::from_u128(301))
                    .unwrap(),
            )
            .await
            .unwrap()
            .into_inner()
            .value,
        2
    );
    let mut transaction = tonic::Request::new(proto::TransactionIncrementRequest { amount: 3 });
    *transaction.metadata_mut() = reboot::RebootHeaders::new("transaction-counter").to_metadata().unwrap();
    assert_eq!(client.increment(transaction).await.unwrap().into_inner().value, 7);
    let mut factory = tonic::Request::new(proto::TransactionIncrementRequest { amount: 3 });
    *factory.metadata_mut() = reboot::RebootHeaders::new("transaction-counter").to_metadata().unwrap();
    assert_eq!(client.factory_increment(factory).await.unwrap_err().code(), tonic::Code::FailedPrecondition);
    assert_eq!(
        *trace.lock().unwrap(),
        ["reader handler", "writer handler", "participant load", "handler", "coordinator DB prepare", "participant prepare", "coordinator DB prepared", "coordinator DB decision", "participant commit", "coordinator DB cleanup", "participant load", "participant abort"]
    );
    server.abort();
    database_server.abort();
}

#[tokio::test]
async fn generated_shared_root_to_remote_read_only_call_returns_classified_participant() {
    let trace = Arc::new(std::sync::Mutex::new(Vec::new()));
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    let adapter = transaction_adapter(Arc::clone(&trace), false);
    let server = tokio::spawn(async move {
        tonic::transport::Server::builder()
            .layer(reboot::successful_trailers::SuccessfulParticipantTrailerLayer)
            .add_service(
                proto::transaction_counter_writes_server::TransactionCounterWritesServer::new(adapter),
            )
            .serve_with_incoming(tokio_stream::wrappers::TcpListenerStream::new(listener))
            .await
            .unwrap();
    });
    let channel = tonic::transport::Channel::from_shared(format!("http://{address}"))
        .unwrap()
        .connect()
        .await
        .unwrap();
    let root = reboot::runtime::RootTransactionContext::start(
        reboot::RebootHeaders::new("caller-state"),
        "tests.reboot.protoc.Root",
        reboot::runtime::TransactionMode::Shared,
        Uuid::from_u128(201),
        prost_types::Timestamp::default(),
    )
    .unwrap();
    let context = root.transaction();
    let client = transaction_generated::TransactionCounterWritesClient::new(FixedChannelResolver(channel));
    let response = client
        .shared_read(
            context,
            &transaction_generated::TransactionCounterWritesTarget::new("transaction-counter"),
            proto::TransactionIncrementRequest { amount: 3 },
        )
        .await
        .unwrap();
    assert_eq!(response.response().get_ref().value, 4);
    assert_eq!(
        response
            .returned_participants()
            .participants()
            .iter()
            .map(|participant| {
                (
                    &participant.target.state_type,
                    &participant.target.state_ref,
                    participant.read_only,
                )
            })
            .collect::<Vec<_>>(),
        vec![(&"tests.reboot.protoc.TransactionCounter".to_owned(), &"transaction-counter".to_owned(), true)]
    );
    assert_eq!(
        root.transaction().take_returned_participants(),
        vec![reboot::durable_coordinator::ReturnedParticipant {
            target: reboot::durable_coordinator::ParticipantTarget {
                state_type: "tests.reboot.protoc.TransactionCounter".into(),
                state_ref: "transaction-counter".into(),
            },
            read_only: true,
        }]
    );
    assert!(root.transaction().take_returned_participants().is_empty());
    assert_eq!(*trace.lock().unwrap(), ["participant load", "shared handler"]);
    server.abort();
}

#[tokio::test]
async fn generated_outbound_client_does_not_enlist_failed_rpc() {
    let trace = Arc::new(std::sync::Mutex::new(Vec::new()));
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    let adapter = transaction_adapter(trace, true);
    let server = tokio::spawn(async move {
        tonic::transport::Server::builder()
            .layer(reboot::successful_trailers::SuccessfulParticipantTrailerLayer)
            .add_service(
                proto::transaction_counter_writes_server::TransactionCounterWritesServer::new(adapter),
            )
            .serve_with_incoming(tokio_stream::wrappers::TcpListenerStream::new(listener))
            .await
            .unwrap();
    });
    let channel = tonic::transport::Channel::from_shared(format!("http://{address}"))
        .unwrap()
        .connect()
        .await
        .unwrap();
    let root = reboot::runtime::RootTransactionContext::start(
        reboot::RebootHeaders::new("caller-state"),
        "tests.reboot.protoc.Root",
        reboot::runtime::TransactionMode::Exclusive,
        Uuid::from_u128(201),
        prost_types::Timestamp::default(),
    )
    .unwrap();
    let client = transaction_generated::TransactionCounterWritesClient::new(FixedChannelResolver(channel));
    let error = client
        .increment(
            root.transaction(),
            &transaction_generated::TransactionCounterWritesTarget::new("transaction-counter"),
            proto::TransactionIncrementRequest { amount: 3 },
        )
        .await
        .unwrap_err();
    assert_eq!(error.code(), tonic::Code::InvalidArgument);
    assert!(root.transaction().take_returned_participants().is_empty());
    server.abort();
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
            "fn main() {{\n    let repository = std::path::Path::new(\"{}\");\n    reboot_rust_schema::build::compile_protos(\n        &[\n            repository.join(\"tests/reboot/protoc/counter.proto\"),\n            repository.join(\"tests/reboot/protoc/snake_case_types.proto\"),\n        ],\n        &[repository],\n        \"crate::proto\",\n    ).unwrap();\n}}\n",
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

#[allow(dead_code)]
mod snake_generated {
    include!(concat!(env!("OUT_DIR"), "/tests/reboot/protoc/snake_case_types.reboot.rs"));
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
