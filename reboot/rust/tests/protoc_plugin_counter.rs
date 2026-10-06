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
    assert!(content.contains("pub trait CounterWritesMethodsDatabaseHandler"));
    assert!(content.contains("pub trait CounterReadsMethodsDatabaseHandler"));
    assert!(
        content.contains("#[tonic::async_trait]\npub trait CounterWritesMethodsDatabaseHandler")
    );
    assert!(content.contains("async fn increment"));
    assert!(content.contains("handler: std::sync::Arc<H>"));
    assert!(content.contains("impl<H> Clone for CounterWritesMethodsDatabaseAdapter<H>"));
    assert!(content.contains("pub struct CounterDurableState;"));
    assert!(content.contains("type State = proto::Counter;"));
    assert!(content.contains("const STATE_TYPE: &'static str = \"tests.reboot.protoc.Counter\";"));
    assert!(content.contains("authorization: reboot::auth::AuthorizationPolicy"));
    assert!(content.contains("pub fn with_authorization("));
    assert!(
        content.contains(
            "store.writer_async_for_method_with_admission_authorized::<CounterDurableState"
        )
    );
    assert!(
        content.contains("store.reader_async_for_with_admission_authorized::<CounterDurableState")
    );
    assert!(content.contains("\"tests.reboot.protoc.CounterWritesMethods.Increment\", reboot::runtime::StateAdmission::DefaultOnAbsent, &self.authorization, request"));
    assert!(content.contains("let handler = self.handler.clone();"));
    assert!(content.contains("Box::pin(async move"));
    assert!(content.contains("reboot::runtime::DatabaseActorStore"));
    assert!(content.contains("pub struct CounterWritesMethodsExternalClient"));
    assert!(content.contains("context: reboot::ExternalContext"));
    assert!(content.contains("self.context.writer(request)"));
    assert!(content.contains("pub async fn increment_with_key"));
    assert!(content.contains("self.context.writer_with_key(request, idempotency_key)"));
    assert!(content.contains("pub struct CounterReadsMethodsExternalClient"));
    assert!(content.contains("self.context.reader(request)"));
    let declared_error = content
        .find("pub enum CounterWritesMethodsIncrementError")
        .unwrap();
    let secondary = content[declared_error..]
        .find("CounterSecondaryExceeded(proto::CounterSecondaryExceeded)")
        .unwrap();
    let limit = content[declared_error..]
        .find("CounterLimitExceeded(proto::CounterLimitExceeded)")
        .unwrap();
    assert!(secondary < limit, "declared errors must retain proto order");
    assert!(content.contains("pub enum CounterReadsMethodsGetError"));
    assert!(content.contains("async fn get(&self, state: &proto::Counter, request: proto::Empty) -> Result<proto::CounterValue, CounterReadsMethodsGetError>;"));
    assert!(content.contains(
        "self.client.get(request).await.map_err(CounterReadsMethodsGetError::from_status)"
    ));
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
    assert!(
        content
            .contains("store.writer_async_for_method_with_admission_authorized::<EchoDurableState")
    );
    assert!(
        content.contains("store.reader_async_for_with_admission_authorized::<EchoDurableState")
    );
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
            "[package]\nname = \"reboot-rust-build-fixture\"\nversion = \"0.0.0\"\nedition = \"2024\"\n\n[build-dependencies]\nreboot = {{ package = \"reboot-rust-schema\", path = \"{}\", features = [\"build\"] }}\n\n[dependencies]\ngoogleapis-tonic-google-rpc = \"0.11\"\nhttp = \"1\"\nprost = \"0.13\"\nprost-types = \"0.13\"\nreboot = {{ package = \"reboot-rust-schema\", path = \"{}\", features = [\"test-support\"] }}\nserde_json = \"1\"\ntokio = {{ version = \"1\", features = [\"macros\", \"rt-multi-thread\"] }}\ntokio-stream = {{ version = \"0.1\", features = [\"net\"] }}\ntonic = \"0.12\"\nuuid = \"1\"\n",
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
        application_host::ApplicationHost,
        auth::{Auth, AuthorizationContext, AuthorizationDecision, AuthorizationPolicy, Authorizer, TokenVerification, TokenVerifier},
        runtime::{test_support::start_database, DatabaseActorStore},
        CallerId, ExternalContext,
    };
use std::sync::atomic::{AtomicUsize, Ordering};
use std::collections::{BTreeMap, VecDeque};
use std::future::Future;
use std::pin::Pin;
use std::sync::Arc;
use uuid::Uuid;

struct Counter;

#[tonic::async_trait]
impl generated::CounterWritesMethodsDatabaseHandler for Counter {
    async fn increment(
        &self,
        state: &mut proto::Counter,
        request: proto::IncrementRequest,
    ) -> Result<proto::CounterValue, generated::CounterWritesMethodsIncrementError> {
        tokio::task::yield_now().await;
        if request.amount < 0 {
            return Err(generated::CounterWritesMethodsIncrementError::CounterLimitExceeded(
                proto::CounterLimitExceeded { limit: state.value },
            ));
        }
        state.value += request.amount;
        Ok(proto::CounterValue { value: state.value })
    }
}

#[tonic::async_trait]
impl generated::CounterReadsMethodsDatabaseHandler for Counter {
    async fn get(
        &self,
        state: &proto::Counter,
        _: proto::Empty,
    ) -> Result<proto::CounterValue, generated::CounterReadsMethodsGetError> {
        tokio::task::yield_now().await;
        if state.value == 0 {
            return Err(generated::CounterReadsMethodsGetError::CounterLimitExceeded(
                proto::CounterLimitExceeded { limit: state.value },
            ));
        }
        Ok(proto::CounterValue { value: state.value })
    }
}

struct AuthProbe {
    verifier_calls: Arc<AtomicUsize>,
    authorizer_calls: Arc<AtomicUsize>,
    handler_calls: Arc<AtomicUsize>,
    decision: AuthorizationDecision,
    contexts: Arc<std::sync::Mutex<Vec<AuthorizationContext>>>,
    snapshots: Arc<std::sync::Mutex<Vec<(Vec<u8>, Vec<u8>)>>>,
}

impl TokenVerifier for AuthProbe {
    fn verify<'a>(&'a self, _: &'a AuthorizationContext, token: Option<&'a str>) -> reboot::auth::VerifyFuture<'a> {
        self.verifier_calls.fetch_add(1, Ordering::SeqCst);
        Box::pin(async move {
            if token == Some("reject") {
                TokenVerification::Unauthenticated { message: "rejected bearer".into() }
            } else {
                TokenVerification::Authenticated(Auth::new(serde_json::json!({"subject": "fixture"})))
            }
        })
    }
}

impl Authorizer for AuthProbe {
    fn authorize<'a>(&'a self, context: &'a AuthorizationContext, _: Option<&'a Auth>, state: Option<&'a [u8]>, request: &'a [u8]) -> reboot::auth::AuthorizeFuture<'a> {
        self.authorizer_calls.fetch_add(1, Ordering::SeqCst);
        self.contexts.lock().unwrap().push(context.clone());
        self.snapshots.lock().unwrap().push((state.unwrap().to_vec(), request.to_vec()));
        let decision = self.decision.clone();
        Box::pin(async move { decision })
    }
}

struct AuthCounter(Arc<AtomicUsize>);

#[tonic::async_trait]
impl generated::CounterWritesMethodsDatabaseHandler for AuthCounter {
    async fn increment(&self, state: &mut proto::Counter, request: proto::IncrementRequest) -> Result<proto::CounterValue, generated::CounterWritesMethodsIncrementError> {
        self.0.fetch_add(1, Ordering::SeqCst);
        state.value += request.amount;
        Ok(proto::CounterValue { value: state.value })
    }
}

#[tonic::async_trait]
impl generated::CounterReadsMethodsDatabaseHandler for AuthCounter {
    async fn get(&self, state: &proto::Counter, _: proto::Empty) -> Result<proto::CounterValue, generated::CounterReadsMethodsGetError> {
        self.0.fetch_add(1, Ordering::SeqCst);
        Ok(proto::CounterValue { value: state.value })
    }
}

struct RichErrorService;

#[tonic::async_trait]
impl proto::counter_writes_methods_server::CounterWritesMethods for RichErrorService {
    async fn increment(&self, request: tonic::Request<proto::IncrementRequest>) -> Result<tonic::Response<proto::CounterValue>, tonic::Status> {
        let known = prost_types::Any { type_url: "type.googleapis.com/tests.reboot.protoc.CounterLimitExceeded".into(), value: proto::CounterLimitExceeded { limit: 9 }.encode_to_vec() };
        let secondary = prost_types::Any { type_url: "type.googleapis.com/tests.reboot.protoc.CounterSecondaryExceeded".into(), value: proto::CounterSecondaryExceeded { limit: 10 }.encode_to_vec() };
        let details = match request.into_inner().amount {
            // The first recognized outer detail wins even though the declaration
            // order is Secondary then Limit.
            1 => vec![known, secondary],
            2 => vec![prost_types::Any { type_url: "type.googleapis.com/tests.reboot.protoc.CounterLimitExceeded".into(), value: vec![0xff] }],
            3 => vec![prost_types::Any { type_url: "type.googleapis.com/example.Unknown".into(), value: vec![1] }],
            4 => return Err(tonic::Status::with_details(tonic::Code::InvalidArgument, "malformed rich status", vec![0xff].into())),
            5 => {
                let status = googleapis_tonic_google_rpc::google::rpc::Status { code: tonic::Code::Unknown as i32, message: "fixture".into(), details: vec![known] };
                return Err(tonic::Status::with_details(tonic::Code::InvalidArgument, "fixture", status.encode_to_vec().into()));
            }
            6 => {
                let status = googleapis_tonic_google_rpc::google::rpc::Status { code: tonic::Code::InvalidArgument as i32, message: "inner fixture".into(), details: vec![known] };
                return Err(tonic::Status::with_details(tonic::Code::InvalidArgument, "fixture", status.encode_to_vec().into()));
            }
            _ => return Err(tonic::Status::not_found("ordinary grpc")),
        };
        let status = googleapis_tonic_google_rpc::google::rpc::Status { code: tonic::Code::InvalidArgument as i32, message: "fixture".into(), details };
        Err(tonic::Status::with_details(tonic::Code::InvalidArgument, "fixture", status.encode_to_vec().into()))
    }
}

struct MapCounter;

#[tonic::async_trait]
impl map_generated::MapCounterWritesMethodsDatabaseHandler for MapCounter {
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
    downstream: Option<transaction_generated::TransactionCounterWritesMethodsClient<FixedChannelResolver>>,
}

#[tonic::async_trait]
impl transaction_generated::TransactionCounterWritesMethodsTransactionHandler for TransactionCounter {
    async fn query(
        &self,
        state: &proto::TransactionCounter,
        _: proto::TransactionIncrementRequest,
    ) -> Result<proto::TransactionCounterValue, tonic::Status> {
        self.trace.lock().unwrap().push("reader handler");
        Ok(proto::TransactionCounterValue { value: state.value })
    }

    async fn apply(
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
        context: &reboot::runtime::TransactionContext,
        state: &mut proto::TransactionCounter,
        request: proto::TransactionIncrementRequest,
    ) -> Result<reboot::runtime::TransactionExecution<proto::TransactionCounterValue>, tonic::Status> {
        self.trace.lock().unwrap().push("handler");
        if self.fail {
            return Err(tonic::Status::invalid_argument("handler rejected request"));
        }
        if let Some(client) = &self.downstream {
            match client.increment(
                context,
                &transaction_generated::TransactionCounterWritesMethodsTarget::new("remote-transaction-counter"),
                request.clone(),
            ).await {
                Err(transaction_generated::TransactionCounterWritesMethodsIncrementError::TransactionLimitExceeded(_)) => self.trace.lock().unwrap().push("caught declared"),
                Err(transaction_generated::TransactionCounterWritesMethodsIncrementError::System(error)) if error.is_recoverable() => self.trace.lock().unwrap().push("caught recoverable system"),
                Err(transaction_generated::TransactionCounterWritesMethodsIncrementError::System(error)) => return Err(tonic::Status::unavailable(format!("unrecoverable system abort: {error:?}"))),
                Err(transaction_generated::TransactionCounterWritesMethodsIncrementError::Grpc(_)) => self.trace.lock().unwrap().push("caught grpc"),
                Ok(_) => return Err(tonic::Status::internal("fixture remote was expected to fail")),
            }
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

    async fn factory_increment_target(
        &self,
        _: &reboot::runtime::TransactionContext,
        state: &mut proto::TransactionCounter,
        request: proto::TransactionIncrementRequest,
    ) -> Result<reboot::runtime::TransactionExecution<proto::TransactionCounterValue>, tonic::Status> {
        self.trace.lock().unwrap().push("factory target handler");
        if self.fail {
            return Err(tonic::Status::invalid_argument("factory handler rejected request"));
        }
        state.value += request.amount;
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

    async fn shared_read_fresh_shared(
        &self,
        _: &reboot::runtime::SharedLocalTransactionContext,
        state: &mut proto::TransactionCounter,
        request: proto::TransactionIncrementRequest,
    ) -> Result<proto::TransactionCounterValue, tonic::Status> {
        self.trace.lock().unwrap().push("fresh shared handler");
        if self.fail || request.amount < 0 {
            return Err(tonic::Status::invalid_argument("fresh shared handler rejected request"));
        }
        state.value += request.amount;
        Ok(proto::TransactionCounterValue { value: state.value })
    }
}

struct TransactionParticipantSidecar {
    trace: Arc<std::sync::Mutex<Vec<&'static str>>>,
    state: Option<proto::TransactionCounter>,
    staged_states: Arc<std::sync::Mutex<Vec<Option<Vec<u8>>>>>,
    idempotent_recovery: Arc<std::sync::Mutex<VecDeque<Result<Vec<reboot::database_proto::RecoverIdempotentMutationsResponse>, tonic::Status>>>>,
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
    fn recover_idempotent_mutations(&self, _: reboot::database_proto::RecoverIdempotentMutationsRequest) -> Pin<Box<dyn Future<Output = Result<Vec<reboot::database_proto::RecoverIdempotentMutationsResponse>, tonic::Status>> + Send + '_>> {
        let response = self.idempotent_recovery.lock().unwrap().pop_front().unwrap_or(Ok(Vec::new()));
        Box::pin(async move { response })
    }
}

struct TransactionCoordinatorSidecar {
    trace: Arc<std::sync::Mutex<Vec<&'static str>>>,
}

struct TransactionRichErrorService;

#[tonic::async_trait]
impl proto::transaction_counter_writes_methods_server::TransactionCounterWritesMethods for TransactionRichErrorService {
    async fn query(&self, _: tonic::Request<proto::TransactionIncrementRequest>) -> Result<tonic::Response<proto::TransactionCounterValue>, tonic::Status> { Err(tonic::Status::unimplemented("fixture")) }
    async fn apply(&self, _: tonic::Request<proto::TransactionIncrementRequest>) -> Result<tonic::Response<proto::TransactionCounterValue>, tonic::Status> { Err(tonic::Status::unimplemented("fixture")) }
    async fn increment(&self, request: tonic::Request<proto::TransactionIncrementRequest>) -> Result<tonic::Response<proto::TransactionCounterValue>, tonic::Status> {
        let declared = prost_types::Any {
            type_url: "type.googleapis.com/tests.reboot.protoc.TransactionLimitExceeded".into(),
            value: proto::TransactionLimitExceeded { limit: 9 }.encode_to_vec(),
        };
        let status = match request.into_inner().amount {
            100 => googleapis_tonic_google_rpc::google::rpc::Status { code: tonic::Code::InvalidArgument as i32, message: "remote fixture".into(), details: vec![declared] },
            101 => googleapis_tonic_google_rpc::google::rpc::Status { code: tonic::Code::Unknown as i32, message: "remote fixture".into(), details: vec![declared] },
            102 => googleapis_tonic_google_rpc::google::rpc::Status { code: tonic::Code::InvalidArgument as i32, message: "remote fixture".into(), details: vec![prost_types::Any { type_url: "type.googleapis.com/example.Unknown".into(), value: vec![1] }] },
            103 => return Err(tonic::Status::with_details(tonic::Code::InvalidArgument, "remote fixture", vec![0xff].into())),
            _ => return Err(tonic::Status::not_found("remote no trailer")),
        };
        Err(tonic::Status::with_details(tonic::Code::InvalidArgument, "remote fixture", status.encode_to_vec().into()))
    }
    async fn factory_increment(&self, _: tonic::Request<proto::TransactionIncrementRequest>) -> Result<tonic::Response<proto::TransactionCounterValue>, tonic::Status> { Err(tonic::Status::unimplemented("fixture")) }
    async fn factory_increment_target(&self, _: tonic::Request<proto::TransactionIncrementRequest>) -> Result<tonic::Response<proto::TransactionCounterValue>, tonic::Status> { Err(tonic::Status::unimplemented("fixture")) }
    async fn shared_read(&self, _: tonic::Request<proto::TransactionIncrementRequest>) -> Result<tonic::Response<proto::TransactionCounterValue>, tonic::Status> { Err(tonic::Status::unimplemented("fixture")) }
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
) -> transaction_generated::TransactionCounterWritesMethodsTransactionAdapter<
    TransactionCounter,
    TransactionParticipantSidecar,
    TransactionCoordinatorSidecar,
    reboot::durable_coordinator::SingleParticipantResolver<TransactionParticipantSidecar>,
    TransactionStartFactory,
> {
    transaction_adapter_with_idempotent_recovery(
        trace,
        fail,
        Arc::new(std::sync::Mutex::new(VecDeque::new())),
    )
}

fn transaction_adapter_with_idempotent_recovery(
    trace: Arc<std::sync::Mutex<Vec<&'static str>>>,
    fail: bool,
    idempotent_recovery: Arc<std::sync::Mutex<VecDeque<Result<Vec<reboot::database_proto::RecoverIdempotentMutationsResponse>, tonic::Status>>>>,
) -> transaction_generated::TransactionCounterWritesMethodsTransactionAdapter<
    TransactionCounter,
    TransactionParticipantSidecar,
    TransactionCoordinatorSidecar,
    reboot::durable_coordinator::SingleParticipantResolver<TransactionParticipantSidecar>,
    TransactionStartFactory,
> {
    transaction_adapter_with_store_and_idempotent_recovery(
        trace,
        fail,
        DatabaseActorStore::connect_lazy("http://127.0.0.1:1").unwrap(),
        idempotent_recovery,
    )
}

fn transaction_adapter_with_store(
    trace: Arc<std::sync::Mutex<Vec<&'static str>>>,
    fail: bool,
    store: DatabaseActorStore,
) -> transaction_generated::TransactionCounterWritesMethodsTransactionAdapter<
    TransactionCounter,
    TransactionParticipantSidecar,
    TransactionCoordinatorSidecar,
    reboot::durable_coordinator::SingleParticipantResolver<TransactionParticipantSidecar>,
    TransactionStartFactory,
> {
    transaction_adapter_with_store_and_idempotent_recovery(
        trace,
        fail,
        store,
        Arc::new(std::sync::Mutex::new(VecDeque::new())),
    )
}

fn transaction_adapter_with_store_and_idempotent_recovery(
    trace: Arc<std::sync::Mutex<Vec<&'static str>>>,
    fail: bool,
    store: DatabaseActorStore,
    idempotent_recovery: Arc<std::sync::Mutex<VecDeque<Result<Vec<reboot::database_proto::RecoverIdempotentMutationsResponse>, tonic::Status>>>>,
) -> transaction_generated::TransactionCounterWritesMethodsTransactionAdapter<
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
            idempotent_recovery,
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
    transaction_generated::TransactionCounterWritesMethodsTransactionAdapter::new(
        store,
        participant,
        coordinator,
        TransactionStartFactory,
        TransactionCounter { trace, fail, downstream: None },
    )
}

fn transaction_adapter_with_downstream(
    trace: Arc<std::sync::Mutex<Vec<&'static str>>>,
    channel: tonic::transport::Channel,
) -> transaction_generated::TransactionCounterWritesMethodsTransactionAdapter<
    TransactionCounter,
    TransactionParticipantSidecar,
    TransactionCoordinatorSidecar,
    reboot::durable_coordinator::SingleParticipantResolver<TransactionParticipantSidecar>,
    TransactionStartFactory,
> {
    let participant = reboot::durable_participant::DurableActorParticipant::new(
        Arc::new(TransactionParticipantSidecar {
            trace: Arc::clone(&trace), state: Some(proto::TransactionCounter { value: 4 }),
            staged_states: Arc::new(std::sync::Mutex::new(Vec::new())),
            idempotent_recovery: Arc::new(std::sync::Mutex::new(VecDeque::new())),
        }),
        "tests.reboot.protoc.TransactionCounter", "transaction-counter",
    );
    let coordinator = reboot::durable_coordinator::DurableRootCoordinator::new(
        Arc::new(TransactionCoordinatorSidecar { trace: Arc::clone(&trace) }),
        Arc::new(reboot::durable_coordinator::SingleParticipantResolver::new(
            reboot::durable_coordinator::ParticipantTarget { state_type: "tests.reboot.protoc.TransactionCounter".into(), state_ref: "transaction-counter".into() },
            reboot::durable_participant::DurableActorParticipantHost::new(participant.clone()),
        ).unwrap()),
    );
    transaction_generated::TransactionCounterWritesMethodsTransactionAdapter::new(
        DatabaseActorStore::connect_lazy("http://127.0.0.1:1").unwrap(), participant, coordinator,
        TransactionStartFactory,
        TransactionCounter { trace, fail: false, downstream: Some(transaction_generated::TransactionCounterWritesMethodsClient::new(FixedChannelResolver(channel))) },
    )
}

fn factory_transaction_adapter(
    trace: Arc<std::sync::Mutex<Vec<&'static str>>>,
    initial_state: Option<proto::TransactionCounter>,
    staged_states: Arc<std::sync::Mutex<Vec<Option<Vec<u8>>>>>,
    fail: bool,
) -> transaction_generated::TransactionCounterWritesMethodsTransactionAdapter<
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
            idempotent_recovery: Arc::new(std::sync::Mutex::new(VecDeque::new())),
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
    transaction_generated::TransactionCounterWritesMethodsTransactionAdapter::new(
        store,
        participant,
        coordinator,
        TransactionStartFactory,
        TransactionCounter { trace, fail, downstream: None },
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
        assert!(matches!(state_ref, "transaction-counter" | "remote-transaction-counter"));
        Ok(self.0.clone())
    }
}

#[tokio::test]
async fn generated_transaction_adapter_executes_in_process_protocol_trace() {
    use proto::transaction_counter_writes_methods_server::TransactionCounterWritesMethods;

    let trace = Arc::new(std::sync::Mutex::new(Vec::new()));
    let mut request = tonic::Request::new(proto::TransactionIncrementRequest { amount: 3 });
    *request.metadata_mut() = reboot::RebootHeaders::new("transaction-counter")
        .to_metadata()
        .unwrap();
    let response = TransactionCounterWritesMethods::increment(
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
    use proto::transaction_counter_writes_methods_server::TransactionCounterWritesMethods;

    let trace = Arc::new(std::sync::Mutex::new(Vec::new()));
    let mut request = tonic::Request::new(proto::TransactionIncrementRequest { amount: 3 });
    *request.metadata_mut() = reboot::RebootHeaders::new("transaction-counter")
        .to_metadata()
        .unwrap();
    let error = TransactionCounterWritesMethods::increment(
        &transaction_adapter(Arc::clone(&trace), true),
        request,
    )
    .await
    .unwrap_err();
    assert_eq!(error.code(), tonic::Code::InvalidArgument);
    assert_eq!(*trace.lock().unwrap(), ["participant load", "handler", "participant abort"]);
}

#[tokio::test]
async fn generated_transaction_declared_downstream_error_commits_and_unrecoverable_shapes_abort() {
    use proto::transaction_counter_writes_methods_server::TransactionCounterWritesMethods;

    let remote_listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let remote_address = remote_listener.local_addr().unwrap();
    let remote_server = tokio::spawn(async move {
        tonic::transport::Server::builder()
            .add_service(proto::transaction_counter_writes_methods_server::TransactionCounterWritesMethodsServer::new(TransactionRichErrorService))
            .serve_with_incoming(tokio_stream::wrappers::TcpListenerStream::new(remote_listener))
            .await
            .unwrap();
    });
    let channel = tonic::transport::Channel::from_shared(format!("http://{remote_address}"))
        .unwrap().connect().await.unwrap();
    let trace = Arc::new(std::sync::Mutex::new(Vec::new()));
    let adapter = transaction_adapter_with_downstream(Arc::clone(&trace), channel);

    let mut declared = tonic::Request::new(proto::TransactionIncrementRequest { amount: 100 });
    *declared.metadata_mut() = reboot::RebootHeaders::new("transaction-counter").to_metadata().unwrap();
    assert_eq!(TransactionCounterWritesMethods::increment(&adapter, declared).await.unwrap().into_inner().value, 104);
    assert_eq!(*trace.lock().unwrap(), [
        "participant load", "handler", "caught declared", "coordinator DB prepare", "participant prepare",
        "coordinator DB prepared", "coordinator DB decision", "participant commit", "coordinator DB cleanup",
    ]);

    for amount in [101, 102, 103, 104] {
        trace.lock().unwrap().clear();
        let mut request = tonic::Request::new(proto::TransactionIncrementRequest { amount });
        *request.metadata_mut() = reboot::RebootHeaders::new("transaction-counter").to_metadata().unwrap();
        assert!(TransactionCounterWritesMethods::increment(&adapter, request).await.is_err());
        assert_eq!(*trace.lock().unwrap(), ["participant load", "handler", "caught grpc", "participant abort"], "amount {amount} must abort before coordinator completion");
    }

    trace.lock().unwrap().clear();
    let mut retry = tonic::Request::new(proto::TransactionIncrementRequest { amount: 100 });
    *retry.metadata_mut() = reboot::RebootHeaders::new("transaction-counter").to_metadata().unwrap();
    assert_eq!(TransactionCounterWritesMethods::increment(&adapter, retry).await.unwrap().into_inner().value, 104);
    assert_eq!(trace.lock().unwrap()[..3], ["participant load", "handler", "caught declared"]);
    remote_server.abort();
}

#[tokio::test]
async fn generated_transaction_adapter_aborts_and_releases_lease_when_post_admission_idempotency_recovery_fails() {
    use proto::transaction_counter_writes_methods_server::TransactionCounterWritesMethods;

    let trace = Arc::new(std::sync::Mutex::new(Vec::new()));
    let idempotent_recovery = Arc::new(std::sync::Mutex::new(VecDeque::from([
        Ok(Vec::new()),
        Err(tonic::Status::unavailable("post-admission idempotency recovery failed")),
    ])));
    let adapter = transaction_adapter_with_idempotent_recovery(
        Arc::clone(&trace),
        false,
        idempotent_recovery,
    );
    let mut headers = reboot::RebootHeaders::new("transaction-counter");
    headers.idempotency_key = Some(Uuid::from_u128(401));
    let mut request = tonic::Request::new(proto::TransactionIncrementRequest { amount: 3 });
    *request.metadata_mut() = headers.to_metadata().unwrap();

    let error = TransactionCounterWritesMethods::increment(&adapter, request).await.unwrap_err();
    assert_eq!(error.code(), tonic::Code::Unavailable);
    assert_eq!(*trace.lock().unwrap(), ["participant load", "participant abort"]);

    trace.lock().unwrap().clear();
    let mut headers = reboot::RebootHeaders::new("transaction-counter");
    headers.idempotency_key = Some(Uuid::from_u128(402));
    let mut request = tonic::Request::new(proto::TransactionIncrementRequest { amount: 3 });
    *request.metadata_mut() = headers.to_metadata().unwrap();
    let response = TransactionCounterWritesMethods::increment(&adapter, request).await.unwrap();
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
async fn generated_factory_transaction_materializes_default_state_and_rejects_existing_actor() {
    use proto::transaction_counter_writes_methods_server::TransactionCounterWritesMethods;

    let trace = Arc::new(std::sync::Mutex::new(Vec::new()));
    let staged_states = Arc::new(std::sync::Mutex::new(Vec::new()));
    let mut request = tonic::Request::new(proto::TransactionIncrementRequest { amount: 3 });
    *request.metadata_mut() = reboot::RebootHeaders::new("transaction-counter")
        .to_metadata()
        .unwrap();
    let response = TransactionCounterWritesMethods::factory_increment(
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
    let error = TransactionCounterWritesMethods::increment(
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
    let error = TransactionCounterWritesMethods::factory_increment(
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
    let error = TransactionCounterWritesMethods::factory_increment(
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
    use proto::transaction_counter_writes_methods_server::TransactionCounterWritesMethods;

    let trace = Arc::new(std::sync::Mutex::new(Vec::new()));
    let mut headers = reboot::RebootHeaders::new("transaction-counter");
    headers.transaction_ids = Some(vec![Uuid::from_u128(201)]);
    headers.transaction_coordinator_state_type = Some("tests.reboot.protoc.Root".into());
    headers.transaction_coordinator_state_ref = Some("root-counter".into());
    let mut request = tonic::Request::new(proto::TransactionIncrementRequest { amount: 3 });
    *request.metadata_mut() = headers.to_metadata().unwrap();

    let response = TransactionCounterWritesMethods::increment(
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
async fn application_host_emits_generated_inbound_participant_only_in_raw_success_trailers() {
    let trace = Arc::new(std::sync::Mutex::new(Vec::new()));
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    drop(listener);
    let adapter = transaction_adapter(Arc::clone(&trace), false);
    let server = tokio::spawn(async move {
        ApplicationHost::new("generated-trailer-host")
            .add_public_service(
                proto::transaction_counter_writes_methods_server::TransactionCounterWritesMethodsServer::new(adapter),
            )
            .serve(address)
            .await
            .unwrap();
    });

    let endpoint = format!("http://{address}");
    let channel = loop {
        match tonic::transport::Channel::from_shared(endpoint.clone())
            .unwrap()
            .connect()
            .await
        {
            Ok(channel) => break channel,
            Err(_) => tokio::time::sleep(std::time::Duration::from_millis(10)).await,
        }
    };
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
                "/tests.reboot.protoc.TransactionCounterWritesMethods/Increment",
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
                proto::transaction_counter_writes_methods_server::TransactionCounterWritesMethodsServer::new(adapter),
            )
            .serve_with_incoming(tokio_stream::wrappers::TcpListenerStream::new(listener))
            .await
            .unwrap();
    });
    let mut client = proto::transaction_counter_writes_methods_client::TransactionCounterWritesMethodsClient::connect(
        format!("http://{address}"),
    )
    .await
    .unwrap();
    let context = ExternalContext::new("transaction-counter");
    assert_eq!(
        client
            .query(context.reader(proto::TransactionIncrementRequest { amount: 0 }).unwrap())
            .await
            .unwrap()
            .into_inner()
            .value,
        0
    );
    assert_eq!(
        client
            .apply(
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
                proto::transaction_counter_writes_methods_server::TransactionCounterWritesMethodsServer::new(adapter),
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
    let client = transaction_generated::TransactionCounterWritesMethodsClient::new(FixedChannelResolver(channel));
    let response = client
        .shared_read(
            context,
            &transaction_generated::TransactionCounterWritesMethodsTarget::new("transaction-counter"),
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
async fn generated_fresh_shared_root_uses_read_only_or_direct_local_promotion() {
    let trace = Arc::new(std::sync::Mutex::new(Vec::new()));
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    let adapter = transaction_adapter(Arc::clone(&trace), false);
    let server = tokio::spawn(async move {
        tonic::transport::Server::builder()
            .add_service(
                proto::transaction_counter_writes_methods_server::TransactionCounterWritesMethodsServer::new(adapter),
            )
            .serve_with_incoming(tokio_stream::wrappers::TcpListenerStream::new(listener))
            .await
            .unwrap();
    });
    let mut client = proto::transaction_counter_writes_methods_client::TransactionCounterWritesMethodsClient::connect(
        format!("http://{address}"),
    )
    .await
    .unwrap();

    let mut unchanged = tonic::Request::new(proto::TransactionIncrementRequest { amount: 0 });
    *unchanged.metadata_mut() = reboot::RebootHeaders::new("transaction-counter").to_metadata().unwrap();
    assert_eq!(client.shared_read(unchanged).await.unwrap().into_inner().value, 4);
    assert_eq!(
        *trace.lock().unwrap(),
        ["participant load", "fresh shared handler", "coordinator DB prepare", "coordinator DB decision", "coordinator DB cleanup"]
    );

    trace.lock().unwrap().clear();
    let mut changed = tonic::Request::new(proto::TransactionIncrementRequest { amount: 3 });
    *changed.metadata_mut() = reboot::RebootHeaders::new("transaction-counter").to_metadata().unwrap();
    assert_eq!(client.shared_read(changed).await.unwrap().into_inner().value, 7);
    assert_eq!(
        *trace.lock().unwrap(),
        ["participant load", "fresh shared handler", "coordinator DB prepare", "participant prepare", "coordinator DB prepared", "coordinator DB decision", "participant commit", "coordinator DB cleanup"]
    );
    server.abort();
}

#[tokio::test]
async fn generated_fresh_shared_handler_error_releases_undurable_lease() {
    let trace = Arc::new(std::sync::Mutex::new(Vec::new()));
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    let adapter = transaction_adapter(Arc::clone(&trace), false);
    let server = tokio::spawn(async move {
        tonic::transport::Server::builder()
            .add_service(proto::transaction_counter_writes_methods_server::TransactionCounterWritesMethodsServer::new(adapter))
            .serve_with_incoming(tokio_stream::wrappers::TcpListenerStream::new(listener))
            .await
            .unwrap();
    });
    let mut client = proto::transaction_counter_writes_methods_client::TransactionCounterWritesMethodsClient::connect(format!("http://{address}")).await.unwrap();
    let mut request = tonic::Request::new(proto::TransactionIncrementRequest { amount: -1 });
    *request.metadata_mut() = reboot::RebootHeaders::new("transaction-counter").to_metadata().unwrap();
    assert_eq!(client.shared_read(request).await.unwrap_err().code(), tonic::Code::InvalidArgument);
    assert_eq!(*trace.lock().unwrap(), ["participant load", "fresh shared handler"]);
    trace.lock().unwrap().clear();
    let mut retry = tonic::Request::new(proto::TransactionIncrementRequest { amount: 0 });
    *retry.metadata_mut() = reboot::RebootHeaders::new("transaction-counter").to_metadata().unwrap();
    assert_eq!(client.shared_read(retry).await.unwrap().into_inner().value, 4);
    assert_eq!(trace.lock().unwrap()[0..2], ["participant load", "fresh shared handler"]);
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
                proto::transaction_counter_writes_methods_server::TransactionCounterWritesMethodsServer::new(adapter),
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
    let client = transaction_generated::TransactionCounterWritesMethodsClient::new(FixedChannelResolver(channel));
    let error = client
        .increment(
            root.transaction(),
            &transaction_generated::TransactionCounterWritesMethodsTarget::new("transaction-counter"),
            proto::TransactionIncrementRequest { amount: 3 },
        )
        .await
        .unwrap_err();
    assert!(matches!(
        error,
        transaction_generated::TransactionCounterWritesMethodsIncrementError::Grpc(status)
            if status.code() == tonic::Code::InvalidArgument
    ));
    assert!(root.transaction().take_returned_participants().is_empty());
    server.abort();
}

async fn start_authorized_counter_adapters(
    database_endpoint: &str,
    authorization: AuthorizationPolicy,
    handler_calls: Arc<AtomicUsize>,
) -> (String, tokio::task::JoinHandle<()>) {
    let writes = generated::CounterWritesMethodsDatabaseAdapter::new(
        DatabaseActorStore::connect(database_endpoint).await.unwrap(),
        AuthCounter(Arc::clone(&handler_calls)),
    )
    .with_authorization(authorization.clone());
    let reads = generated::CounterReadsMethodsDatabaseAdapter::new(
        DatabaseActorStore::connect(database_endpoint).await.unwrap(),
        AuthCounter(handler_calls),
    )
    .with_authorization(authorization);
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    let server = tokio::spawn(async move {
        tonic::transport::Server::builder()
            .add_service(proto::counter_writes_methods_server::CounterWritesMethodsServer::new(writes))
            .add_service(proto::counter_reads_methods_server::CounterReadsMethodsServer::new(reads))
            .serve_with_incoming(tokio_stream::wrappers::TcpListenerStream::new(listener))
            .await
            .unwrap();
    });
    (format!("http://{address}"), server)
}

async fn start_counter_adapters(
    database_endpoint: &str,
) -> (String, tokio::task::JoinHandle<()>) {
    let writes = generated::CounterWritesMethodsDatabaseAdapter::new(
        DatabaseActorStore::connect(database_endpoint).await.unwrap(),
        Counter,
    );
    let reads = generated::CounterReadsMethodsDatabaseAdapter::new(
        DatabaseActorStore::connect(database_endpoint).await.unwrap(),
        Counter,
    );
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    let server = tokio::spawn(async move {
        tonic::transport::Server::builder()
            .add_service(proto::counter_writes_methods_server::CounterWritesMethodsServer::new(writes))
            .add_service(proto::counter_reads_methods_server::CounterReadsMethodsServer::new(reads))
            .serve_with_incoming(tokio_stream::wrappers::TcpListenerStream::new(listener))
            .await
            .unwrap();
    });
    (format!("http://{address}"), server)
}

#[tokio::test]
async fn generated_external_clients_attach_reader_and_writer_context() {
    let (database_endpoint, database, database_server) = start_database().await;
    let (address, server) = start_counter_adapters(&database_endpoint).await;
    let context = ExternalContext::new("generated-external-counter")
        .with_caller_id(CallerId::new("a1234567890", None).unwrap());
    let mut raw = proto::counter_writes_methods_client::CounterWritesMethodsClient::connect(address.clone())
        .await
        .unwrap();
    let status = raw
        .increment(context.writer(proto::IncrementRequest { amount: -1 }).unwrap())
        .await
        .unwrap_err();
    assert_eq!(status.code(), tonic::Code::Unknown);
    let rich_status = googleapis_tonic_google_rpc::google::rpc::Status::decode(status.details()).unwrap();
    assert_eq!(rich_status.code, tonic::Code::Unknown as i32);
    assert_eq!(rich_status.details.len(), 1);
    assert_eq!(
        rich_status.details[0].type_url,
        "type.googleapis.com/tests.reboot.protoc.CounterLimitExceeded"
    );
    assert_eq!(
        proto::CounterLimitExceeded::decode(rich_status.details[0].value.as_slice()).unwrap(),
        proto::CounterLimitExceeded { limit: 0 }
    );
    let automatic_channel = context.connect(address.clone()).await.unwrap();
    let mut writes = generated::CounterWritesMethodsExternalClient::new(automatic_channel, context.clone());
    let reader_channel = context.connect(address.clone()).await.unwrap();
    let mut reads = generated::CounterReadsMethodsExternalClient::new(reader_channel, context.clone());
    assert!(matches!(
        reads.get(proto::Empty {}).await,
        Err(generated::CounterReadsMethodsGetError::CounterLimitExceeded(error))
            if error.limit == 0
    ));
    assert_eq!(
        writes
            .increment(proto::IncrementRequest { amount: 5 })
            .await
            .unwrap()
            .into_inner()
            .value,
        5
    );
    assert!(matches!(
        writes.increment(proto::IncrementRequest { amount: -1 }).await,
        Err(generated::CounterWritesMethodsIncrementError::CounterLimitExceeded(error))
            if error.limit == 5
    ));

    let explicit_key = Uuid::parse_str("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa").unwrap();
    assert_eq!(
        writes
            .increment_with_key(proto::IncrementRequest { amount: 2 }, explicit_key)
            .await
            .unwrap()
            .into_inner()
            .value,
        7
    );
    assert_eq!(
        writes
            .increment_with_key(proto::IncrementRequest { amount: 2 }, explicit_key)
            .await
            .unwrap()
            .into_inner()
            .value,
        7,
        "an explicit idempotency key must replay the first writer response"
    );

    let reader_channel = context.connect(address).await.unwrap();
    let mut reads = generated::CounterReadsMethodsExternalClient::new(reader_channel, context);
    assert_eq!(
        reads.get(proto::Empty {}).await.unwrap().into_inner().value,
        7
    );

    let stores = database.store_requests();
    assert_eq!(stores.len(), 2, "explicit replay must not issue Store");
    let automatic_key = Uuid::from_slice(
        stores[0]
            .idempotent_mutation
            .as_ref()
            .unwrap()
            .key
            .as_slice(),
    )
    .unwrap();
    assert_eq!(automatic_key.get_version_num(), 7);
    assert_eq!(
        stores[1].idempotent_mutation.as_ref().unwrap().key,
        explicit_key.as_bytes()
    );
    server.abort();
    database_server.abort();
}

#[tokio::test]
async fn generated_external_authentication_and_authorization_gate_handlers_and_state() {
    fn probe(decision: AuthorizationDecision) -> Arc<AuthProbe> {
        Arc::new(AuthProbe {
            verifier_calls: Arc::new(AtomicUsize::new(0)),
            authorizer_calls: Arc::new(AtomicUsize::new(0)),
            handler_calls: Arc::new(AtomicUsize::new(0)),
            decision,
            contexts: Arc::new(std::sync::Mutex::new(Vec::new())),
            snapshots: Arc::new(std::sync::Mutex::new(Vec::new())),
        })
    }
    fn policy(probe: Arc<AuthProbe>) -> AuthorizationPolicy {
        AuthorizationPolicy::new(Some(probe.clone()), Some(probe))
    }
    fn writer(state_ref: &str, token: &str) -> tonic::Request<proto::IncrementRequest> {
        let mut headers = reboot::RebootHeaders::new(state_ref);
        headers.bearer_token = Some(token.into());
        headers.idempotency_key = Some(Uuid::new_v4());
        let mut request = tonic::Request::new(proto::IncrementRequest { amount: 5 });
        *request.metadata_mut() = headers.to_metadata().unwrap();
        request
    }
    fn reader(state_ref: &str, token: &str) -> tonic::Request<proto::Empty> {
        let mut headers = reboot::RebootHeaders::new(state_ref);
        headers.bearer_token = Some(token.into());
        let mut request = tonic::Request::new(proto::Empty {});
        *request.metadata_mut() = headers.to_metadata().unwrap();
        request
    }

    let (database_endpoint, database, database_server) = start_database().await;
    let rejected = probe(AuthorizationDecision::Allow);
    let (rejected_address, rejected_server) = start_authorized_counter_adapters(
        &database_endpoint, policy(Arc::clone(&rejected)), Arc::clone(&rejected.handler_calls),
    ).await;
    let mut rejected_client = proto::counter_writes_methods_client::CounterWritesMethodsClient::connect(rejected_address).await.unwrap();
    assert_eq!(rejected_client.increment(writer("auth-rejected", "reject")).await.unwrap_err().code(), tonic::Code::Unauthenticated);
    assert_eq!(rejected.verifier_calls.load(Ordering::SeqCst), 1);
    assert_eq!(rejected.authorizer_calls.load(Ordering::SeqCst), 0);
    assert_eq!(rejected.handler_calls.load(Ordering::SeqCst), 0);
    rejected_server.abort();

    let denied = probe(AuthorizationDecision::PermissionDenied { message: "denied".into() });
    let (denied_address, denied_server) = start_authorized_counter_adapters(
        &database_endpoint, policy(Arc::clone(&denied)), Arc::clone(&denied.handler_calls),
    ).await;
    let mut denied_client = proto::counter_writes_methods_client::CounterWritesMethodsClient::connect(denied_address).await.unwrap();
    assert_eq!(denied_client.increment(writer("auth-denied", "allow")).await.unwrap_err().code(), tonic::Code::PermissionDenied);
    assert_eq!(denied.authorizer_calls.load(Ordering::SeqCst), 1);
    assert_eq!(denied.handler_calls.load(Ordering::SeqCst), 0);
    denied_server.abort();

    let unauthenticated = probe(AuthorizationDecision::Unauthenticated { message: "reauthenticate".into() });
    let (unauthenticated_address, unauthenticated_server) = start_authorized_counter_adapters(
        &database_endpoint, policy(Arc::clone(&unauthenticated)), Arc::clone(&unauthenticated.handler_calls),
    ).await;
    let mut unauthenticated_client = proto::counter_writes_methods_client::CounterWritesMethodsClient::connect(unauthenticated_address).await.unwrap();
    assert_eq!(unauthenticated_client.increment(writer("auth-unauthenticated", "allow")).await.unwrap_err().code(), tonic::Code::Unauthenticated);
    assert_eq!(unauthenticated.authorizer_calls.load(Ordering::SeqCst), 1);
    assert_eq!(unauthenticated.handler_calls.load(Ordering::SeqCst), 0);
    unauthenticated_server.abort();

    let allowed = probe(AuthorizationDecision::Allow);
    let (allowed_address, allowed_server) = start_authorized_counter_adapters(
        &database_endpoint, policy(Arc::clone(&allowed)), Arc::clone(&allowed.handler_calls),
    ).await;
    let mut writes = proto::counter_writes_methods_client::CounterWritesMethodsClient::connect(allowed_address.clone()).await.unwrap();
    assert_eq!(writes.increment(writer("auth-allowed", "allow")).await.unwrap().into_inner().value, 5);
    let mut reads = proto::counter_reads_methods_client::CounterReadsMethodsClient::connect(allowed_address).await.unwrap();
    assert_eq!(reads.get(reader("auth-allowed", "allow")).await.unwrap().into_inner().value, 5);
    assert_eq!(allowed.handler_calls.load(Ordering::SeqCst), 2);
    let contexts = allowed.contexts.lock().unwrap();
    assert_eq!(contexts.len(), 2);
    assert!(contexts.iter().all(|context| context.state_type == "tests.reboot.protoc.Counter"));
    assert!(contexts.iter().any(|context| context.method == "tests.reboot.protoc.CounterWritesMethods.Increment"));
    assert!(contexts.iter().any(|context| context.method == "tests.reboot.protoc.CounterReadsMethods.Get"));
    assert!(contexts.iter().all(|context| context.headers.bearer_token.as_deref() == Some("allow") && !context.headers.internal_call));
    drop(contexts);
    let snapshots = allowed.snapshots.lock().unwrap();
    assert_eq!(snapshots.len(), 2);
    assert_eq!(proto::Counter::decode(snapshots[0].0.as_slice()).unwrap(), proto::Counter { value: 0 });
    assert_eq!(proto::IncrementRequest::decode(snapshots[0].1.as_slice()).unwrap(), proto::IncrementRequest { amount: 5 });
    assert_eq!(proto::Counter::decode(snapshots[1].0.as_slice()).unwrap(), proto::Counter { value: 5 });
    assert_eq!(proto::Empty::decode(snapshots[1].1.as_slice()).unwrap(), proto::Empty {});
    assert_eq!(database.store_requests().len(), 1, "denied writers must not persist state");
    allowed_server.abort();
    database_server.abort();
}


#[tokio::test]
async fn generated_external_client_decodes_ordered_declared_errors_and_preserves_grpc_fallbacks() {
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    let server = tokio::spawn(async move { tonic::transport::Server::builder().add_service(proto::counter_writes_methods_server::CounterWritesMethodsServer::new(RichErrorService)).serve_with_incoming(tokio_stream::wrappers::TcpListenerStream::new(listener)).await.unwrap(); });
    let context = ExternalContext::new("rich-error-counter");
    let channel = context.connect(format!("http://{address}")).await.unwrap();
    let mut client = generated::CounterWritesMethodsExternalClient::new(channel, context);
    assert!(matches!(
        client.increment(proto::IncrementRequest { amount: 1 }).await,
        Err(generated::CounterWritesMethodsIncrementError::CounterLimitExceeded(error))
            if error.limit == 9
    ));
    // A known type URL with malformed message bytes is not a declared error.
    assert!(matches!(
        client.increment(proto::IncrementRequest { amount: 2 }).await,
        Err(generated::CounterWritesMethodsIncrementError::Grpc(status))
            if status.code() == tonic::Code::InvalidArgument
    ));
    // An unknown rich detail falls back to the gRPC status code.
    assert!(matches!(
        client.increment(proto::IncrementRequest { amount: 3 }).await,
        Err(generated::CounterWritesMethodsIncrementError::Grpc(status))
            if status.code() == tonic::Code::InvalidArgument
    ));
    // A malformed grpc-status-details-bin trailer also remains a gRPC error.
    assert!(matches!(
        client.increment(proto::IncrementRequest { amount: 4 }).await,
        Err(generated::CounterWritesMethodsIncrementError::Grpc(status))
            if status.code() == tonic::Code::InvalidArgument
    ));
    // A known declared detail cannot override the outer transport code.
    assert!(matches!(
        client.increment(proto::IncrementRequest { amount: 5 }).await,
        Err(generated::CounterWritesMethodsIncrementError::Grpc(status))
            if status.code() == tonic::Code::InvalidArgument && status.message() == "fixture"
    ));
    // Nor can it override the outer transport message.
    assert!(matches!(
        client.increment(proto::IncrementRequest { amount: 6 }).await,
        Err(generated::CounterWritesMethodsIncrementError::Grpc(status))
            if status.code() == tonic::Code::InvalidArgument && status.message() == "fixture"
    ));
    // No rich trailer preserves the ordinary transport status.
    assert!(matches!(
        client.increment(proto::IncrementRequest { amount: 7 }).await,
        Err(generated::CounterWritesMethodsIncrementError::Grpc(status))
            if status.code() == tonic::Code::NotFound
    ));
    server.abort();
}

async fn start_map_counter_adapters(
    database_endpoint: &str,
) -> (String, tokio::task::JoinHandle<()>) {
    let writes = map_generated::MapCounterWritesMethodsDatabaseAdapter::new(
        DatabaseActorStore::connect(database_endpoint).await.unwrap(),
        MapCounter,
    );
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    let server = tokio::spawn(async move {
        tonic::transport::Server::builder()
            .add_service(
                proto::map_counter_writes_methods_server::MapCounterWritesMethodsServer::new(writes),
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
    let mut writes = proto::map_counter_writes_methods_client::MapCounterWritesMethodsClient::connect(address)
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
    let mut writes = proto::counter_writes_methods_client::CounterWritesMethodsClient::connect(address)
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
    let mut writes = proto::counter_writes_methods_client::CounterWritesMethodsClient::connect(address.clone())
        .await
        .unwrap();
    let mut reads = proto::counter_reads_methods_client::CounterReadsMethodsClient::connect(address)
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

#[tokio::test]
async fn generated_transaction_client_reroutes_through_legacy_application_placement() {
    use reboot::{
        legacy_placement::{LegacyApplicationId, LegacyApplicationResolver, PlanOnlyLegacyPlacement},
        placement_proto,
        runtime::TransactionalChannelResolver,
    };

    #[derive(Clone)]
    struct Endpoint {
        value: i64,
        metadata: Arc<std::sync::Mutex<Vec<tonic::metadata::MetadataMap>>>,
    }

    #[tonic::async_trait]
    impl proto::transaction_counter_writes_methods_server::TransactionCounterWritesMethods for Endpoint {
        async fn query(&self, _: tonic::Request<proto::TransactionIncrementRequest>) -> Result<tonic::Response<proto::TransactionCounterValue>, tonic::Status> { Err(tonic::Status::unimplemented("query")) }
        async fn apply(&self, _: tonic::Request<proto::TransactionIncrementRequest>) -> Result<tonic::Response<proto::TransactionCounterValue>, tonic::Status> { Err(tonic::Status::unimplemented("apply")) }
        async fn increment(&self, request: tonic::Request<proto::TransactionIncrementRequest>) -> Result<tonic::Response<proto::TransactionCounterValue>, tonic::Status> {
            self.metadata.lock().unwrap().push(request.metadata().clone());
            let mut response = tonic::Response::new(proto::TransactionCounterValue { value: self.value });
            reboot::successful_trailers::stage_successful_participants(
                &mut response,
                reboot::successful_trailers::ParticipantMetadata::single(
                    "tests.reboot.protoc.TransactionCounter",
                    "opaque/child",
                )
                .unwrap(),
            );
            Ok(response)
        }
        async fn factory_increment(&self, _: tonic::Request<proto::TransactionIncrementRequest>) -> Result<tonic::Response<proto::TransactionCounterValue>, tonic::Status> { Err(tonic::Status::unimplemented("factory_increment")) }
        async fn factory_increment_target(&self, _: tonic::Request<proto::TransactionIncrementRequest>) -> Result<tonic::Response<proto::TransactionCounterValue>, tonic::Status> { Err(tonic::Status::unimplemented("factory_increment_target")) }
        async fn shared_read(&self, _: tonic::Request<proto::TransactionIncrementRequest>) -> Result<tonic::Response<proto::TransactionCounterValue>, tonic::Status> { Err(tonic::Status::unimplemented("shared_read")) }
    }

    async fn serve(value: i64) -> (std::net::SocketAddr, Arc<std::sync::Mutex<Vec<tonic::metadata::MetadataMap>>>, tokio::task::JoinHandle<()>) {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let metadata = Arc::new(std::sync::Mutex::new(Vec::new()));
        let server_metadata = Arc::clone(&metadata);
        let server = tokio::spawn(async move {
            tonic::transport::Server::builder()
                .layer(reboot::successful_trailers::SuccessfulParticipantTrailerLayer)
                .add_service(proto::transaction_counter_writes_methods_server::TransactionCounterWritesMethodsServer::new(Endpoint { value, metadata: server_metadata }))
                .serve_with_incoming(tokio_stream::wrappers::TcpListenerStream::new(listener))
                .await
                .unwrap();
        });
        (address, metadata, server)
    }

    fn plan(version: i64, address: std::net::SocketAddr) -> placement_proto::ListenForPlanResponse {
        let server = placement_proto::Server {
            id: "server".into(), application_id: "app".into(), revision_number: 0,
            address: Some(placement_proto::server::Address { host: address.ip().to_string(), port: i32::from(address.port()) }),
            namespace: String::new(), file_descriptor_set: None, reboot_version: String::new(),
        };
        placement_proto::ListenForPlanResponse {
            plan: Some(placement_proto::Plan { version, applications: vec![placement_proto::plan::Application {
                id: "app".into(),
                services: vec![placement_proto::plan::application::Service { full_name: "tests.reboot.protoc.TransactionCounterWritesMethods".into(), state_type_full_name: "tests.reboot.protoc.TransactionCounter".into() }],
                // The root range is selected through the raw first-component SHA-1 route.
                shards: vec![placement_proto::plan::application::Shard { id: "hash-root".into(), range: Some(placement_proto::plan::application::shard::KeyRange { first_key: Vec::new() }), server_id: "server".into(), replica_index: 0 }],
            }] }),
            servers: vec![server],
        }
    }

    let (first_address, first_metadata, first_server) = serve(11).await;
    let (second_address, second_metadata, second_server) = serve(22).await;
    let placement = PlanOnlyLegacyPlacement::new();
    let resolver = LegacyApplicationResolver::new(LegacyApplicationId::new("app").unwrap(), placement.clone());
    assert_eq!(resolver.resolve("ignored", "opaque/child").await.unwrap_err().code(), tonic::Code::Unavailable);
    placement.install(plan(1, first_address)).unwrap();
    assert_eq!(resolver.resolve("ignored", "").await.unwrap_err().code(), tonic::Code::InvalidArgument);
    assert_eq!(resolver.resolve("ignored", "/malformed").await.unwrap_err().code(), tonic::Code::InvalidArgument);

    let mut headers = reboot::RebootHeaders::new("source/state");
    headers.idempotency_key = Some(Uuid::from_u128(901));
    headers.traceparent = Some("00-0123456789abcdef0123456789abcdef-0123456789abcdef-01".into());
    headers.internal_call = true;
    let root = reboot::runtime::RootTransactionContext::start(headers, "tests.reboot.protoc.Root", reboot::runtime::TransactionMode::Exclusive, Uuid::from_u128(902), prost_types::Timestamp::default()).unwrap();
    let client = transaction_generated::TransactionCounterWritesMethodsClient::new(resolver);
    let target = transaction_generated::TransactionCounterWritesMethodsTarget::new("opaque/child");
    assert_eq!(client.increment(root.transaction(), &target, proto::TransactionIncrementRequest { amount: 1 }).await.unwrap().response().get_ref().value, 11);
    {
        let received_metadata = first_metadata.lock().unwrap();
        let metadata = received_metadata.first().unwrap();
        assert_eq!(metadata.get("x-reboot-state-ref").unwrap(), "opaque/child");
        assert_eq!(
            metadata
                .get("x-reboot-idempotency-key")
                .unwrap()
                .to_str()
                .unwrap(),
            Uuid::from_u128(901).to_string()
        );
        assert_eq!(metadata.get("traceparent").unwrap(), "00-0123456789abcdef0123456789abcdef-0123456789abcdef-01");
        assert_eq!(metadata.get("x-reboot-internal-call").unwrap(), "true");
        assert_eq!(metadata.get("x-reboot-transaction-coordinator-state-ref").unwrap(), "source/state");
    }

    placement.install(plan(2, second_address)).unwrap();
    assert_eq!(client.increment(root.transaction(), &target, proto::TransactionIncrementRequest { amount: 2 }).await.unwrap().response().get_ref().value, 22);
    assert_eq!(first_metadata.lock().unwrap().len(), 1);
    assert_eq!(second_metadata.lock().unwrap().len(), 1);
    first_server.abort();
    second_server.abort();
}
}
"#,
    )
    .unwrap();

    let status = Command::new("cargo")
        .arg("test")
        .arg("--offline")
        .arg("--")
        .arg("--test-threads=1")
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
    impl generated::CounterWritesMethodsDatabaseHandler for Counter {
        async fn increment(
            &self,
            state: &mut proto::Counter,
            request: proto::IncrementRequest,
        ) -> Result<proto::CounterValue, generated::CounterWritesMethodsIncrementError> {
            state.value += request.amount;
            Ok(proto::CounterValue { value: state.value })
        }
    }

    #[tokio::test]
    async fn default_helper_generated_writer_executes() {
        let (database_endpoint, _, database_server) = start_database().await;
        let adapter = generated::CounterWritesMethodsDatabaseAdapter::new(
            DatabaseActorStore::connect(&database_endpoint).await.unwrap(),
            Counter,
        );
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let server = tokio::spawn(async move {
            tonic::transport::Server::builder()
                .add_service(proto::counter_writes_methods_server::CounterWritesMethodsServer::new(adapter))
                .serve_with_incoming(tokio_stream::wrappers::TcpListenerStream::new(listener))
                .await
                .unwrap();
        });
        let context = ExternalContext::new("default-cargo-helper");
        let mut client = proto::counter_writes_methods_client::CounterWritesMethodsClient::connect(format!("http://{address}"))
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
        .arg("--")
        .arg("--test-threads=1")
        .current_dir(&fixture)
        .status()
        .unwrap();
    assert!(status.success());
}
