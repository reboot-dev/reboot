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
    assert!(content.contains(".inspect_err(|status| { context.doom(status.clone()); })?"));
    assert!(!content.contains(".map_err(|status| { context.doom(status.clone()); status })"));
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
    assert!(content.contains(
        "store.declared_scheduling_writer_async_for_method_authorized::<CounterDurableState"
    ));
    assert!(
        content.contains("store.reader_async_for_with_admission_authorized::<CounterDurableState")
    );
    assert!(content.contains("\"tests.reboot.protoc.CounterWritesMethods.Increment\", \"type.googleapis.com/tests.reboot.protoc.CounterValue\", reboot::runtime::StateAdmission::DefaultOnAbsent), &self.authorization, (self.tasks.as_ref(), &[reboot::one_shot_tasks::DeclaredTaskError::new::<proto::CounterSecondaryExceeded>(\"type.googleapis.com/tests.reboot.protoc.CounterSecondaryExceeded\"),reboot::one_shot_tasks::DeclaredTaskError::new::<proto::CounterLimitExceeded>(\"type.googleapis.com/tests.reboot.protoc.CounterLimitExceeded\")]), request"));
    assert!(content.contains("let handler = self.handler.clone();"));
    assert!(content.contains("Box::pin(async move"));
    assert!(content.contains("reboot::runtime::DatabaseActorStore"));
    assert!(content.contains("pub struct CounterWritesMethodsExternalClient"));
    assert!(content.contains("context: reboot::ExternalContext"));
    assert!(content.contains(
        "let original_request = prost::Message::encode_to_vec(&request); let mut retry_backoff"
    ));
    assert!(content.contains(
        "<proto::IncrementRequest as prost::Message>::decode(original_request.as_slice())"
    ));
    assert!(content.contains("ExternalUnaryRetryBackoff::new()"));
    assert!(
        content
            .contains("is_retryable_status(&status) => { retry_backoff.wait().await; continue }")
    );
    assert!(content.contains("let idempotency_key = self.context.new_idempotency_key();"));
    assert!(content.contains("pub async fn increment_with_key"));
    assert!(content.contains("self.context.writer_with_key(request, idempotency_key)"));
    assert!(content.contains("pub struct CounterReadsMethodsExternalClient"));
    assert!(
        content.contains("<proto::Empty as prost::Message>::decode(original_request.as_slice())")
    );
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
    assert!(content.contains("System(reboot::SystemAbort)"));
    assert!(content.contains("system.error.into_status(system.message)"));
    assert!(!content.contains("fn is_recoverable_transaction_abort"));
    assert!(content.contains("fn is_method_declared"));
    assert!(content.contains("SystemAbort { error, message }"));
    assert!(content.contains("async fn get(&self, state: &proto::Counter, request: proto::Empty) -> Result<proto::CounterValue, CounterReadsMethodsGetError>;"));
    assert!(
        content.contains(
            "Err(status) => return Err(CounterReadsMethodsGetError::from_status(status))"
        )
    );
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
        content.contains("store.scheduling_writer_async_for_method_authorized::<EchoDurableState")
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
            "fn main() {{\n    let repository = std::path::Path::new(\"{}\");\n    reboot::build::compile_protos_with_runtime(\n        &[\n            repository.join(\"tests/reboot/protoc/counter.proto\"),\n            repository.join(\"tests/reboot/protoc/constructor_counter.proto\"),\n            repository.join(\"tests/reboot/protoc/map_counter.proto\"),\n            repository.join(\"tests/reboot/protoc/owner_account.proto\"),\n            repository.join(\"tests/reboot/protoc/transaction_counter.proto\"),\n        ],\n        &[repository],\n        \"crate::proto\",\n        \"reboot\",\n    ).unwrap();\n}}\n",
            repository.display()
        ),
    )
    .unwrap();
    let build_script = std::fs::read_to_string(fixture.join("build.rs")).unwrap();
    let build_prefix = build_script.strip_suffix("}\n").unwrap();
    let injection = r##"
    // Unchanged original Account schema; constructor-child tests use its public
    // generated client/receiver, not a relabelled synthetic transaction RPC.
    let api = repository.join("reboot/rust/tests/fixtures/mixed_constructor_original/pinned/api");
    reboot::build::compile_protos_with_runtime(
        &[api.join("bank/v1/account.proto"), api.join("bank/v1/errors.proto")],
        &[api, repository.to_owned()], "crate::bank::v1", "reboot",
    ).unwrap();
    let account_path = std::path::PathBuf::from(std::env::var_os("OUT_DIR").unwrap()).join("bank/v1/account.reboot.rs");
    let account = std::fs::read_to_string(&account_path).unwrap();
    let constructor_anchor = "let request_bytes = <proto::OpenRequest as prost::Message>::encode_to_vec(request.get_ref());";
    assert_eq!(account.matches(constructor_anchor).count(), 1);
    // Fixture-only timing hook AFTER true constructor admission, BEFORE actual
    // registered handler entry. No replacement handler/receipt is fabricated.
    std::fs::write(account_path, account.replace(constructor_anchor, &format!("#[cfg(test)] crate::tests::constructor_child::after_admission(binding).await;\n{constructor_anchor}"))).unwrap();
    let emitted_path = std::path::PathBuf::from(std::env::var_os("OUT_DIR").unwrap()).join("tests/reboot/protoc/transaction_counter.reboot.rs");
    let emitted = std::fs::read_to_string(&emitted_path).unwrap();
    assert!(emitted.contains("reboot::runtime::boxed_generated_future(|| local.abort_local_after_denial()).await?; return Err(error);"));
    assert!(!emitted.contains("reboot_rust_schema::runtime::boxed_generated_future(|| local.abort_local_after_denial()"));
    // A consumed local ticket carries receiver policy; builder flags alone are not authority.
    assert!(emitted.contains("self.sequential_reusable || context.reusable_participants()"));
    assert!(emitted.contains("declared && (self.supervised_tree || context.reusable_participants()) && context.supports_rollback_leaf_path()"));
    let anchor = "let handler_result = match reboot::runtime::boxed_generated_future(|| local.run_registered_authorized_handler(&self.authorization, authorized_entry, &context, (\"tests.reboot.protoc.TransactionCounterWritesMethods.Increment\"";
    // Standalone and mixed-service adapter implementations.
    assert_eq!(emitted.matches(anchor).count(), 2);
    let injected = format!("let handler_request_bytes = crate::fixture_authorized_entry_request(&context, handler_request_bytes);\n{anchor}");
    std::fs::write(emitted_path, emitted.replace(anchor, &injected)).unwrap();
"##;
    std::fs::write(
        fixture.join("build.rs"),
        format!("{build_prefix}{injection}}}\n"),
    )
    .unwrap();
    std::fs::write(
        fixture.join("Cargo.toml"),
        format!(
            "[package]\nname = \"reboot-rust-build-fixture\"\nversion = \"0.0.0\"\nedition = \"2024\"\n\n[build-dependencies]\nreboot = {{ package = \"reboot-rust-schema\", path = \"{}\", features = [\"build\"] }}\n\n[dependencies]\ngoogleapis-tonic-google-rpc = \"0.11\"\nhttp = \"1\"\nhttp-body-util = \"0.1\"\nbytes = \"1\"\ntower = \"0.5\"\nhttp-body = \"1\"\nprost = \"0.13\"\nprost-types = \"0.13\"\nreboot = {{ package = \"reboot-rust-schema\", path = \"{}\", features = [\"test-support\"] }}\nserde_json = \"1\"\ntokio = {{ version = \"1\", features = [\"macros\", \"rt-multi-thread\"] }}\ntokio-stream = {{ version = \"0.1\", features = [\"net\"] }}\ntonic = \"0.12\"\nuuid = \"1\"\n",
            env!("CARGO_MANIFEST_DIR"),
            env!("CARGO_MANIFEST_DIR")
        ),
    )
    .unwrap();
    std::fs::write(
        fixture.join("src/shared_root_slots.rs"),
        include_str!("fixtures/shared_root_slots.rs"),
    )
    .unwrap();
    std::fs::write(
        fixture.join("src/constructor_child.rs"),
        include_str!("fixtures/generated_constructor_child.rs"),
    )
    .unwrap();
    std::fs::write(
        fixture.join("src/external_constructor_route.rs"),
        include_str!("fixtures/generated_external_constructor_route.rs"),
    )
    .unwrap();
    std::fs::write(
        fixture.join("src/external_constructor_tasks.rs"),
        include_str!("fixtures/generated_external_constructor_tasks.rs"),
    )
    .unwrap();
    std::fs::write(
        fixture.join("src/lib.rs"),
        r#"// Generated Tonic APIs intentionally return tonic::Status (including rich details).
// Match the SDK's result_large_err policy without changing the wire/API contract
// or suppressing any lint in the handwritten fixture tests below.
#[allow(clippy::result_large_err)]
pub mod rbt { pub mod v1alpha1 { tonic::include_proto!("rbt.v1alpha1"); } }
#[allow(clippy::result_large_err)]
pub mod bank { pub mod v1 { tonic::include_proto!("bank.v1"); } }
#[allow(clippy::result_large_err)]
pub mod account_generated { include!(concat!(env!("OUT_DIR"), "/bank/v1/account.reboot.rs")); }
#[allow(clippy::result_large_err)]
pub mod proto {
    tonic::include_proto!("tests.reboot.protoc");
}

#[allow(dead_code, clippy::result_large_err)]
mod generated {
    include!(concat!(env!("OUT_DIR"), "/tests/reboot/protoc/counter.reboot.rs"));
}

#[allow(dead_code, clippy::result_large_err)]
mod constructor_generated {
    include!(concat!(env!("OUT_DIR"), "/tests/reboot/protoc/constructor_counter.reboot.rs"));
}

#[allow(dead_code, clippy::result_large_err)]
mod owner_generated {
    include!(concat!(env!("OUT_DIR"), "/tests/reboot/protoc/owner_account.reboot.rs"));
}

#[allow(dead_code, clippy::result_large_err)]
mod map_generated {
    include!(concat!(env!("OUT_DIR"), "/tests/reboot/protoc/map_counter.reboot.rs"));
}

#[allow(dead_code, clippy::result_large_err)]
mod transaction_generated {
    include!(concat!(env!("OUT_DIR"), "/tests/reboot/protoc/transaction_counter.reboot.rs"));
}

#[cfg(test)]
static FIXTURE_AUTH_REJECTION_HITS: std::sync::atomic::AtomicUsize = std::sync::atomic::AtomicUsize::new(0);
#[cfg(test)]
static FIXTURE_ROOT_AUTH_REJECTION_HITS: std::sync::atomic::AtomicUsize = std::sync::atomic::AtomicUsize::new(0);

// Fixture-only binding corruption; the SDK and generated cleanup are unchanged.
fn fixture_authorized_entry_request(context: &reboot::runtime::TransactionContext, bytes: Vec<u8>) -> Vec<u8> {
    #[cfg(test)]
    {
        use prost::Message;
        if (context.transaction_ids() == [uuid::Uuid::from_u128(201), uuid::Uuid::from_u128(203)]
            && proto::TransactionIncrementRequest::decode(bytes.as_slice()).is_ok_and(|request| request.amount == 2))
            || (context.transaction_ids() == [uuid::Uuid::from_u128(102)]
            && proto::TransactionIncrementRequest::decode(bytes.as_slice()).is_ok_and(|request| request.amount == -999))
        {
            if context.transaction_ids().len() == 1 {
                FIXTURE_ROOT_AUTH_REJECTION_HITS.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
            } else {
                FIXTURE_AUTH_REJECTION_HITS.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
            }
            let mut changed = bytes;
            changed.push(0);
            return changed;
        }
    }
    #[cfg(not(test))]
    let _ = context;
    bytes
}

#[cfg(test)]
mod tests {
    use super::{constructor_generated, generated, map_generated, owner_generated, proto, transaction_generated};
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

mod shared_root_slots { include!("shared_root_slots.rs"); }
pub(crate) mod constructor_child { include!("constructor_child.rs"); include!("external_constructor_route.rs"); include!("external_constructor_tasks.rs"); }

struct Counter;

#[tonic::async_trait]
impl generated::CounterWritesMethodsDatabaseHandler for Counter {
    async fn increment(
        &self,
        state: &mut proto::Counter,
        request: proto::IncrementRequest,
    ) -> Result<proto::CounterValue, generated::CounterWritesMethodsIncrementError> {
        tokio::task::yield_now().await;
        if request.amount == -2 {
            return Err(generated::CounterWritesMethodsIncrementError::System(
                reboot::SystemAbort {
                    error: reboot::SystemAborted::NotFound(reboot::database_proto::NotFound {}),
                    message: "counter is absent".into(),
                },
            ));
        }
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
impl generated::CounterWritesMethodsTransactionHandler for Counter {
    async fn increment(&self, state: &mut proto::Counter, request: proto::IncrementRequest) -> Result<proto::CounterValue, generated::CounterWritesMethodsIncrementError> {
        generated::CounterWritesMethodsDatabaseHandler::increment(self, state, request).await
    }
}

#[tokio::test]
async fn writer_only_generated_transaction_adapter_registers_and_keeps_external_writers_usable() {
    use reboot::registered_local::GeneratedLocalTransactionAdapter;
    use proto::counter_writes_methods_server::CounterWritesMethods;
    let (endpoint, _, database_server) = start_database().await;
    let store = DatabaseActorStore::connect_lazy(&endpoint).unwrap();
    let participant = reboot::durable_participant::DurableActorParticipant::new(
        Arc::new(reboot::durable_participant::TonicParticipantSidecar::connect(&endpoint).await.unwrap()),
        "tests.reboot.protoc.Counter", "writer-only-counter");
    let resolver = reboot::durable_coordinator::ExactParticipantResolver::new([(participant.actor_target(), Arc::new(reboot::durable_coordinator::InProcessParticipantEndpoint::new(reboot::durable_participant::DurableActorParticipantHost::new(participant.clone()))))]).unwrap();
    let coordinator = reboot::durable_coordinator::DurableRootCoordinator::new(
        Arc::new(TransactionCoordinatorSidecar { trace: Arc::new(std::sync::Mutex::new(Vec::new())) }), Arc::new(resolver)).with_identity(participant.actor_target());
    let adapter = generated::CounterWritesMethodsTransactionAdapter::new(store, participant, coordinator, TransactionStartFactory, Counter)
        .with_authorization(AuthorizationPolicy::permissive_for_development());
    assert_eq!(adapter.local_configuration().unwrap().methods, std::collections::BTreeSet::from(["tests.reboot.protoc.CounterWritesMethods.Increment".to_owned()]));
    let mut host = reboot::application_host::ApplicationHost::new("writer-only-fixture");
    let (adapter, _) = host.register_local_transaction_service(adapter).unwrap();
    assert_eq!(host.registered_transaction_adapter_count(), 1);
    for expected in [3, 6] {
        let mut headers = reboot::RebootHeaders::new("writer-only-counter");
        headers.idempotency_key = Some(Uuid::new_v4());
        let mut request = tonic::Request::new(proto::IncrementRequest { amount: 3 });
        *request.metadata_mut() = headers.to_metadata().unwrap();
        assert_eq!(adapter.increment(request).await.unwrap().get_ref().value, expected);
        let mut headers = reboot::RebootHeaders::new("writer-only-counter");
        headers.transaction_ids = Some(vec![Uuid::from_u128(201)]);
        headers.transaction_coordinator_state_type = Some("tests.reboot.protoc.Counter".into());
        headers.transaction_coordinator_state_ref = Some("forged-root".into());
        let mut request = tonic::Request::new(proto::IncrementRequest { amount: 1000 });
        *request.metadata_mut() = headers.to_metadata().unwrap();
        assert_eq!(adapter.increment(request).await.unwrap_err().message(), "inbound ordinary writer requires registered local ticket");
    }
    drop(host);
    database_server.abort(); let _ = database_server.await;
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
        if state.value == 50 {
            return Err(generated::CounterReadsMethodsGetError::System(
                reboot::SystemAbort {
                    error: reboot::SystemAborted::NotFound(reboot::database_proto::NotFound {}),
                    message: "reader state is absent".into(),
                },
            ));
        }
        Ok(proto::CounterValue { value: state.value })
    }
}

type AuthorizationSnapshots = Arc<std::sync::Mutex<Vec<(Option<Vec<u8>>, Vec<u8>)>>>;
type RecordedUnaryRequests = Arc<std::sync::Mutex<Vec<(Vec<u8>, reboot::RebootHeaders)>>>;
type IdempotentRecoveryResult = Result<Vec<reboot::database_proto::RecoverIdempotentMutationsResponse>, tonic::Status>;
type IdempotentRecoveryQueue = Arc<std::sync::Mutex<VecDeque<IdempotentRecoveryResult>>>;

struct AuthProbe {
    verifier_calls: Arc<AtomicUsize>,
    authorizer_calls: Arc<AtomicUsize>,
    handler_calls: Arc<AtomicUsize>,
    decision: AuthorizationDecision,
    contexts: Arc<std::sync::Mutex<Vec<AuthorizationContext>>>,
    snapshots: AuthorizationSnapshots,
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
        self.snapshots.lock().unwrap().push((state.map(ToOwned::to_owned), request.to_vec()));
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

struct ConstructorCounter(Arc<AtomicUsize>);

#[tonic::async_trait]
impl constructor_generated::ConstructorCounterWritesMethodsDatabaseHandler for ConstructorCounter {
    async fn create(
        &self,
        state: &mut proto::ConstructorCounter,
        request: proto::ConstructorCreateRequest,
    ) -> Result<
        proto::ConstructorCounterValue,
        constructor_generated::ConstructorCounterWritesMethodsCreateError,
    > {
        self.0.fetch_add(1, Ordering::SeqCst);
        if request.initial_value == -1 {
            return Err(
                constructor_generated::ConstructorCounterWritesMethodsCreateError::ConstructorInitialValueRejected(
                    proto::ConstructorInitialValueRejected {
                        initial_value: request.initial_value,
                    },
                ),
            );
        }
        if request.initial_value == -2 {
            return Err(
                constructor_generated::ConstructorCounterWritesMethodsCreateError::Grpc(
                    tonic::Status::with_details(
                        tonic::Code::InvalidArgument,
                        "malformed rich status",
                        vec![0xff].into(),
                    ),
                ),
            );
        }
        if request.initial_value == -3 {
            return Err(
                constructor_generated::ConstructorCounterWritesMethodsCreateError::Grpc(
                    tonic::Status::invalid_argument("ordinary grpc"),
                ),
            );
        }
        state.value = request.initial_value;
        Ok(proto::ConstructorCounterValue { value: state.value })
    }
}

struct RichErrorService(Arc<AtomicUsize>);

#[tonic::async_trait]
impl proto::counter_writes_methods_server::CounterWritesMethods for RichErrorService {
    async fn increment(&self, request: tonic::Request<proto::IncrementRequest>) -> Result<tonic::Response<proto::CounterValue>, tonic::Status> {
        self.0.fetch_add(1, Ordering::SeqCst);
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

#[derive(Clone)]
struct UnaryRetryScript {
    outcomes: Arc<std::sync::Mutex<VecDeque<tonic::Code>>>,
    requests: RecordedUnaryRequests,
}

impl UnaryRetryScript {
    fn next(&self) -> tonic::Code {
        self.outcomes
            .lock()
            .unwrap()
            .pop_front()
            .expect("script must contain one outcome per RPC attempt")
    }

    fn record<M: prost::Message>(&self, request: &tonic::Request<M>) {
        self.requests.lock().unwrap().push((
            request.get_ref().encode_to_vec(),
            reboot::RebootHeaders::from_metadata(request.metadata()).unwrap(),
        ));
    }
}

#[tonic::async_trait]
impl proto::counter_writes_methods_server::CounterWritesMethods for UnaryRetryScript {
    async fn increment(
        &self,
        request: tonic::Request<proto::IncrementRequest>,
    ) -> Result<tonic::Response<proto::CounterValue>, tonic::Status> {
        self.record(&request);
        match self.next() {
            tonic::Code::Ok => Ok(tonic::Response::new(proto::CounterValue { value: 77 })),
            code => Err(tonic::Status::new(code, "scripted unary status")),
        }
    }
}

#[tonic::async_trait]
impl proto::counter_reads_methods_server::CounterReadsMethods for UnaryRetryScript {
    async fn get(
        &self,
        request: tonic::Request<proto::Empty>,
    ) -> Result<tonic::Response<proto::CounterValue>, tonic::Status> {
        self.record(&request);
        match self.next() {
            tonic::Code::Ok => Ok(tonic::Response::new(proto::CounterValue { value: 78 })),
            code => Err(tonic::Status::new(code, "scripted unary status")),
        }
    }
}

async fn start_unary_retry_server(
    writer: UnaryRetryScript,
    reader: UnaryRetryScript,
) -> (String, tokio::task::JoinHandle<()>) {
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    let server = tokio::spawn(async move {
        tonic::transport::Server::builder()
            .add_service(proto::counter_writes_methods_server::CounterWritesMethodsServer::new(writer))
            .add_service(proto::counter_reads_methods_server::CounterReadsMethodsServer::new(reader))
            .serve_with_incoming(tokio_stream::wrappers::TcpListenerStream::new(listener))
            .await
            .unwrap();
    });
    (format!("http://{address}"), server)
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
    final_state_override: Option<i64>,
    fresh_shared_probe: Option<Arc<shared_root_slots::SharedRootProbe>>,
}

#[tonic::async_trait]
impl transaction_generated::TransactionCounterWritesMethodsTransactionHandler for TransactionCounter {
    async fn query_declared(&self, _: &proto::TransactionCounter, _: proto::TransactionIncrementRequest) -> Result<proto::TransactionCounterValue, transaction_generated::TransactionCounterWritesMethodsQueryDeclaredError> {
        Err(transaction_generated::TransactionCounterWritesMethodsQueryDeclaredError::TransactionLimitExceeded(proto::TransactionLimitExceeded { limit: 4242 }))
    }
    async fn apply_declared(&self, state: &mut proto::TransactionCounter, _: proto::TransactionIncrementRequest) -> Result<proto::TransactionCounterValue, transaction_generated::TransactionCounterWritesMethodsApplyDeclaredError> {
        state.value += 1000;
        Err(transaction_generated::TransactionCounterWritesMethodsApplyDeclaredError::TransactionLimitExceeded(proto::TransactionLimitExceeded { limit: 4242 }))
    }
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

    async fn apply_transaction_result(
        &self,
        context: &reboot::runtime::TransactionContext,
        state: &mut proto::TransactionCounter,
        request: proto::TransactionIncrementRequest,
    ) -> Result<reboot::runtime::TransactionExecution<proto::TransactionCounterValue>, tonic::Status> {
        self.increment(context, state, request).await
    }

    async fn increment(
        &self,
        context: &reboot::runtime::TransactionContext,
        state: &mut proto::TransactionCounter,
        request: proto::TransactionIncrementRequest,
    ) -> Result<reboot::runtime::TransactionExecution<proto::TransactionCounterValue>, tonic::Status> {
        self.trace.lock().unwrap().push("handler");
        if matches!(request.amount, 7310 | 7313) {
            let probe = TICKET_RECEIVER_PROBE.try_with(Arc::clone).unwrap();
            probe.run(context).await;
            if request.amount == 7310 { return Err(tonic::Status::invalid_argument("parent probe complete")); }
            state.value += 1;
            return Ok(reboot::runtime::TransactionExecution::new(proto::TransactionCounterValue { value: state.value }));
        }
        if request.amount == 7314 {
            let probe = LOCAL_CANCELLATION_PROBE.with(Arc::clone);
            *probe.context.lock().unwrap() = Some(context.clone());
            let _drop = LocalCancellationDrop(probe.clone());
            probe.entered.notify_one();
            std::future::pending::<()>().await;
            unreachable!("cancelled child cannot return success");
        }
        if request.amount == 7312 {
            assert_eq!(context.transaction_ids(), &[Uuid::from_u128(201), Uuid::from_u128(202)]);
            assert!(context.headers().bearer_token.is_none());
            assert!(context.headers().cookie.is_none());
            state.value += 1;
            return Ok(reboot::runtime::TransactionExecution::new(proto::TransactionCounterValue { value: state.value }));
        }
        if request.amount == 7311 {
            assert_eq!(context.transaction_ids(), &[Uuid::from_u128(201), Uuid::from_u128(202)]);
            assert!(context.headers().bearer_token.is_none());
            assert!(context.headers().cookie.is_none());
            return Err(tonic::Status::invalid_argument("child probe reached"));
        }
        if request.amount == 7302 {
            assert_eq!(context.require_registered_outbound().unwrap_err().message(), "no registered handler outbound permission");
        }
        if matches!(request.amount, 7301 | 7303) {
            context.require_registered_outbound().expect("real generated registered eligible handler");
        }
        if request.amount == 4242 {
            state.value += 1000;
            return Err(reboot::declared_error_status(tonic::Code::Unknown, "legacy declared", "type.googleapis.com/tests.reboot.protoc.TransactionLimitExceeded", &proto::TransactionLimitExceeded { limit: 4242 }));
        }
        if request.amount == 4243 { return Err(tonic::Status::with_details(tonic::Code::Unknown, "malformed legacy", vec![0xff].into())); }
        if self.fail {
            return Err(tonic::Status::invalid_argument("handler rejected request"));
        }
        if let Some(client) = &self.downstream {
            match client.increment(
                context,
                &transaction_generated::TransactionCounterWritesMethodsTarget::new("remote-transaction-counter"),
                request,
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
        if let Some(value) = self.final_state_override {
            execution.final_state = Some(proto::TransactionCounter { value }.encode_to_vec());
        }
        Ok(execution)
    }

    async fn factory_increment(
        &self,
        _: &reboot::runtime::TransactionContext,
        state: &mut proto::TransactionCounter,
        request: proto::TransactionIncrementRequest,
    ) -> Result<reboot::runtime::TransactionExecution<proto::TransactionCounterValue>, transaction_generated::TransactionCounterWritesMethodsFactoryIncrementError> {
        self.trace.lock().unwrap().push("factory handler");
        if request.amount == -808 { std::future::pending::<()>().await; }
        if request.amount == 13 {
            return Err(transaction_generated::TransactionCounterWritesMethodsFactoryIncrementError::TransactionLimitExceeded(proto::TransactionLimitExceeded { limit: request.amount }));
        }
        if self.fail {
            return Err(transaction_generated::TransactionCounterWritesMethodsFactoryIncrementError::Grpc(tonic::Status::invalid_argument("factory handler rejected request")));
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
        #[cfg(test)]
        if let Some(probe) = shared_root_slots::PROBE.try_with(Arc::clone).ok()
            .or_else(|| self.fresh_shared_probe.clone())
        {
            probe.park(request.amount).await;
            // The concurrency probe deliberately leaves Prost state unchanged.
            return Ok(proto::TransactionCounterValue { value: state.value });
        }
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
    idempotent_recovery: IdempotentRecoveryQueue,
}

impl reboot::durable_participant::ParticipantSidecar for TransactionParticipantSidecar {
    fn load(&self, _: reboot::database_proto::LoadRequest) -> Pin<Box<dyn Future<Output = Result<reboot::database_proto::LoadResponse, tonic::Status>> + Send + '_>> {
        self.trace.lock().unwrap().push("participant load");
        let state = self.state.map(|state| state.encode_to_vec());
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
        let park = response.as_ref().is_err_and(|error| error.code() == tonic::Code::Cancelled && error.message() == "fixture park receipt lookup");
        let trace = Arc::clone(&self.trace);
        Box::pin(async move {
            if park { trace.lock().unwrap().push("participant recovery parked"); std::future::pending::<()>().await; }
            response
        })
    }
}

struct TransactionCoordinatorSidecar {
    trace: Arc<std::sync::Mutex<Vec<&'static str>>>,
}

struct TransactionRichErrorService;

#[tonic::async_trait]
impl proto::transaction_counter_writes_methods_server::TransactionCounterWritesMethods for TransactionRichErrorService {
    async fn query_declared(&self, _: tonic::Request<proto::TransactionIncrementRequest>) -> Result<tonic::Response<proto::TransactionCounterValue>, tonic::Status> { Err(tonic::Status::unimplemented("fixture")) }
    async fn apply_declared(&self, _: tonic::Request<proto::TransactionIncrementRequest>) -> Result<tonic::Response<proto::TransactionCounterValue>, tonic::Status> { Err(tonic::Status::unimplemented("fixture")) }

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

struct AuthorizationCleanupParticipantSidecar {
    trace: Arc<std::sync::Mutex<Vec<&'static str>>>,
    state: Option<proto::TransactionCounter>,
    staged_states: Arc<std::sync::Mutex<Vec<Option<Vec<u8>>>>>,
    idempotent_recovery: IdempotentRecoveryQueue,
    aborts: std::sync::Mutex<Vec<reboot::database_proto::TransactionParticipantAbortRequest>>,
    abort_entered: tokio::sync::Semaphore,
    abort_release: tokio::sync::Notify,
}
struct AuthorizationCleanupCoordinatorSidecar {
    trace: Arc<std::sync::Mutex<Vec<&'static str>>>,
    decisions: std::sync::Mutex<Vec<reboot::database_proto::TransactionCoordinatorDecisionPutRequest>>,
}
impl reboot::durable_participant::ParticipantSidecar for AuthorizationCleanupParticipantSidecar {
    fn database_endpoint(&self) -> Option<&str> { Some("http://127.0.0.1:1/") }
    fn load(&self, _: reboot::database_proto::LoadRequest) -> Pin<Box<dyn Future<Output = Result<reboot::database_proto::LoadResponse, tonic::Status>> + Send + '_>> {
        self.trace.lock().unwrap().push("participant load");
        let state = self.state.map(|state| state.encode_to_vec());
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
    fn abort(&self, request: reboot::database_proto::TransactionParticipantAbortRequest) -> Pin<Box<dyn Future<Output = Result<reboot::database_proto::TransactionParticipantAbortResponse, tonic::Status>> + Send + '_>> {
        self.trace.lock().unwrap().push("participant abort");
        self.aborts.lock().unwrap().push(request);
        self.abort_entered.add_permits(1);
        Box::pin(async move { self.abort_release.notified().await; Ok(Default::default()) })
    }
    fn recover(&self, _: reboot::database_proto::RecoverRequest) -> Pin<Box<dyn Future<Output = Result<Vec<reboot::database_proto::RecoverResponse>, tonic::Status>> + Send + '_>> {
        Box::pin(async { Ok(Vec::new()) })
    }
    fn recover_idempotent_mutations(&self, _: reboot::database_proto::RecoverIdempotentMutationsRequest) -> Pin<Box<dyn Future<Output = Result<Vec<reboot::database_proto::RecoverIdempotentMutationsResponse>, tonic::Status>> + Send + '_>> {
        let response = self.idempotent_recovery.lock().unwrap().pop_front().unwrap_or(Ok(Vec::new()));
        let park = response.as_ref().is_err_and(|error| error.code() == tonic::Code::Cancelled && error.message() == "fixture park receipt lookup");
        let trace = Arc::clone(&self.trace);
        Box::pin(async move {
            if park { trace.lock().unwrap().push("participant recovery parked"); std::future::pending::<()>().await; }
            response
        })
    }
}
impl reboot::durable_coordinator::CoordinatorSidecar for AuthorizationCleanupCoordinatorSidecar {
    fn database_endpoint(&self) -> Option<&str> { Some("http://127.0.0.1:1/") }
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
    fn decision_put(&self, request: reboot::database_proto::TransactionCoordinatorDecisionPutRequest) -> Pin<Box<dyn Future<Output = Result<reboot::database_proto::TransactionCoordinatorDecisionPutResponse, tonic::Status>> + Send + '_>> {
        self.decisions.lock().unwrap().push(request);
        self.trace.lock().unwrap().push("coordinator DB decision");
        Box::pin(async { Ok(reboot::database_proto::TransactionCoordinatorDecisionPutResponse::default()) })
    }
    fn recover(&self, _: reboot::database_proto::RecoverRequest) -> Pin<Box<dyn Future<Output = Result<Vec<reboot::database_proto::RecoverResponse>, tonic::Status>> + Send + '_>> {
        Box::pin(async { Ok(Vec::new()) })
    }
}


// Authored source-only: these generated-adapter tests have NOT been executed.
struct DenialFaultParticipant {
    base: AuthorizationCleanupParticipantSidecar,
    endpoint: String,
    abort_result: Result<reboot::database_proto::TransactionParticipantAbortResponse, tonic::Status>,
}
struct DenialFaultCoordinator {
    base: AuthorizationCleanupCoordinatorSidecar,
    endpoint: String,
    entered: tokio::sync::Semaphore,
    release: tokio::sync::Notify,
    result: Result<reboot::database_proto::TransactionCoordinatorDecisionPutResponse, tonic::Status>,
}
impl reboot::durable_participant::ParticipantSidecar for DenialFaultParticipant {
    fn database_endpoint(&self) -> Option<&str> { Some(&self.endpoint) }
    fn load(&self, _: reboot::database_proto::LoadRequest) -> Pin<Box<dyn Future<Output = Result<reboot::database_proto::LoadResponse, tonic::Status>> + Send + '_>> {
        self.base.trace.lock().unwrap().push("participant load");
        let state = self.base.state.map(|state| state.encode_to_vec());
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
        self.base.staged_states.lock().unwrap().push(request.state.clone());
        self.base.trace.lock().unwrap().push("participant prepare");
        Box::pin(async { Ok(reboot::database_proto::TransactionParticipantPrepareResponse::default()) })
    }
    fn commit(&self, _: reboot::database_proto::TransactionParticipantCommitRequest) -> Pin<Box<dyn Future<Output = Result<reboot::database_proto::TransactionParticipantCommitResponse, tonic::Status>> + Send + '_>> {
        self.base.trace.lock().unwrap().push("participant commit");
        Box::pin(async { Ok(reboot::database_proto::TransactionParticipantCommitResponse::default()) })
    }
    fn abort(&self, request: reboot::database_proto::TransactionParticipantAbortRequest) -> Pin<Box<dyn Future<Output = Result<reboot::database_proto::TransactionParticipantAbortResponse, tonic::Status>> + Send + '_>> {
        self.base.trace.lock().unwrap().push("participant abort");
        self.base.aborts.lock().unwrap().push(request);
        self.base.abort_entered.add_permits(1);
        Box::pin(async move { self.base.abort_release.notified().await; self.abort_result.clone() })
    }
    fn recover(&self, _: reboot::database_proto::RecoverRequest) -> Pin<Box<dyn Future<Output = Result<Vec<reboot::database_proto::RecoverResponse>, tonic::Status>> + Send + '_>> {
        Box::pin(async { Ok(Vec::new()) })
    }
    fn recover_idempotent_mutations(&self, _: reboot::database_proto::RecoverIdempotentMutationsRequest) -> Pin<Box<dyn Future<Output = Result<Vec<reboot::database_proto::RecoverIdempotentMutationsResponse>, tonic::Status>> + Send + '_>> {
        let response = self.base.idempotent_recovery.lock().unwrap().pop_front().unwrap_or(Ok(Vec::new()));
        let park = response.as_ref().is_err_and(|error| error.code() == tonic::Code::Cancelled && error.message() == "fixture park receipt lookup");
        let trace = Arc::clone(&self.base.trace);
        Box::pin(async move {
            if park { trace.lock().unwrap().push("participant recovery parked"); std::future::pending::<()>().await; }
            response
        })
    }
}
impl reboot::durable_coordinator::CoordinatorSidecar for DenialFaultCoordinator {
    fn database_endpoint(&self) -> Option<&str> { Some(&self.endpoint) }
    fn coordinator_prepare(&self, _: reboot::database_proto::TransactionCoordinatorPrepareRequest) -> Pin<Box<dyn Future<Output = Result<reboot::database_proto::TransactionCoordinatorPrepareResponse, tonic::Status>> + Send + '_>> {
        self.base.trace.lock().unwrap().push("coordinator DB prepare");
        Box::pin(async { Ok(reboot::database_proto::TransactionCoordinatorPrepareResponse::default()) })
    }
    fn coordinator_prepared(&self, _: reboot::database_proto::TransactionCoordinatorPreparedRequest) -> Pin<Box<dyn Future<Output = Result<reboot::database_proto::TransactionCoordinatorPreparedResponse, tonic::Status>> + Send + '_>> {
        self.base.trace.lock().unwrap().push("coordinator DB prepared");
        Box::pin(async { Ok(reboot::database_proto::TransactionCoordinatorPreparedResponse::default()) })
    }
    fn coordinator_cleanup(&self, _: reboot::database_proto::TransactionCoordinatorCleanupRequest) -> Pin<Box<dyn Future<Output = Result<reboot::database_proto::TransactionCoordinatorCleanupResponse, tonic::Status>> + Send + '_>> {
        self.base.trace.lock().unwrap().push("coordinator DB cleanup");
        Box::pin(async { Ok(reboot::database_proto::TransactionCoordinatorCleanupResponse::default()) })
    }
    fn decision_put(&self, request: reboot::database_proto::TransactionCoordinatorDecisionPutRequest) -> Pin<Box<dyn Future<Output = Result<reboot::database_proto::TransactionCoordinatorDecisionPutResponse, tonic::Status>> + Send + '_>> {
        self.base.decisions.lock().unwrap().push(request);
        self.base.trace.lock().unwrap().push("coordinator DB decision");
        Box::pin(async move { self.entered.add_permits(1); self.release.notified().await; self.result.clone() })
    }
    fn recover(&self, _: reboot::database_proto::RecoverRequest) -> Pin<Box<dyn Future<Output = Result<Vec<reboot::database_proto::RecoverResponse>, tonic::Status>> + Send + '_>> {
        Box::pin(async { Ok(Vec::new()) })
    }
}


fn denial_rich_status(code: tonic::Code, decision: bool) -> tonic::Status {
    let (message, details, metadata) = if decision {
        ("SECRET_decision_actor_path", &b"SECRET_decision_details"[..], "SECRET_decision_metadata")
    } else {
        ("SECRET_abort_actor_path", &b"SECRET_abort_details"[..], "SECRET_abort_metadata")
    };
    let mut status = tonic::Status::with_details(code, message, details.to_vec().into());
    status.metadata_mut().insert("x-private-cause", metadata.parse().unwrap());
    status.metadata_mut().insert_bin("x-private-cause-bin", tonic::metadata::MetadataValue::from_bytes(details));
    status
}
fn assert_denial_public(status: &tonic::Status) {
    assert_eq!(status.code(), tonic::Code::Unavailable);
    assert_eq!(status.message(), "authorization cleanup unavailable");
    assert!(status.details().is_empty());
    assert!(status.metadata().is_empty());
}
struct DenialWorkerRecovery {
    owner: reboot::explicit_abort::ExplicitAbortOwner,
    ready: std::sync::Mutex<Option<tokio::sync::oneshot::Sender<()>>>,
    failure: std::sync::Mutex<Option<tokio::sync::oneshot::Sender<tonic::Status>>>,
}
#[tonic::async_trait]
impl reboot::application_host::HostRecovery for DenialWorkerRecovery {
    async fn start(&self, supervisor: &mut tokio::task::JoinSet<Result<(), tonic::Status>>, cancel: reboot::application_host::RecoveryCancellation) -> Result<(), tonic::Status> {
        let mut children = tokio::task::JoinSet::new();
        self.owner.recovery_registration().start(&mut children, cancel).await?;
        let failure = self.failure.lock().unwrap().take().unwrap();
        supervisor.spawn(async move {
            let result = children.join_next().await.expect("worker exists").expect("worker joined");
            if let Err(status) = &result { let _ = failure.send(status.clone()); }
            result
        });
        self.ready.lock().unwrap().take().unwrap().send(()).unwrap();
        Ok(())
    }
}
#[tokio::test]
async fn generated_ordinary_denial_redacts_abort_and_decision_faults() {
    use proto::transaction_counter_writes_methods_server::TransactionCounterWritesMethods;
    // Legacy Abort, reserved DecisionPut, reserved Abort-after-decision, and ACK.
    for route in 0..5 {
        for code in [tonic::Code::Internal, tonic::Code::DataLoss, tonic::Code::Unavailable, tonic::Code::PermissionDenied] {
            for unauthenticated in [false, true] {
                let endpoint = format!("http://denial-{}.invalid:1/", Uuid::new_v4());
                let store = DatabaseActorStore::connect_lazy(&endpoint).unwrap();
                let trace = Arc::new(std::sync::Mutex::new(Vec::new()));
                let key = Uuid::new_v4();
                let recovery = Arc::new(std::sync::Mutex::new(VecDeque::from([Ok(vec![reboot::database_proto::RecoverIdempotentMutationsResponse {
                    idempotent_mutations: vec![reboot::database_proto::IdempotentMutation {
                        state_type: "tests.reboot.protoc.TransactionCounter".into(), state_ref: "transaction-counter".into(),
                        key: key.as_bytes().to_vec(), response: proto::TransactionCounterValue { value: 987654321 }.encode_to_vec(),
                        request_fingerprint: Some(reboot::runtime::request_fingerprint("tests.reboot.protoc.TransactionCounterWritesMethods.Increment", &proto::TransactionIncrementRequest { amount: 3 })),
                        ..Default::default()
                    }],
                }])])));
                let rich = denial_rich_status(code, route == 1);
                let sidecar = Arc::new(DenialFaultParticipant {
                    endpoint: endpoint.clone(), abort_result: if route == 3 || route == 4 { Ok(Default::default()) } else { Err(rich.clone()) },
                    base: AuthorizationCleanupParticipantSidecar {
                        trace: trace.clone(), state: Some(proto::TransactionCounter { value: 4 }),
                        staged_states: Arc::new(std::sync::Mutex::new(Vec::new())), idempotent_recovery: recovery.clone(),
                        aborts: std::sync::Mutex::new(Vec::new()), abort_entered: tokio::sync::Semaphore::new(0), abort_release: tokio::sync::Notify::new(),
                    },
                });
                let participant = reboot::durable_participant::DurableActorParticipant::new(sidecar.clone(), "tests.reboot.protoc.TransactionCounter", "transaction-counter").with_database_actor_gate(&store);
                let decisions = Arc::new(DenialFaultCoordinator {
                    endpoint, entered: tokio::sync::Semaphore::new(0), release: tokio::sync::Notify::new(),
                    result: if route == 1 { Err(rich.clone()) } else { Ok(Default::default()) },
                    base: AuthorizationCleanupCoordinatorSidecar { trace: trace.clone(), decisions: std::sync::Mutex::new(Vec::new()) },
                });
                let coordinator = reboot::durable_coordinator::DurableRootCoordinator::new(decisions.clone(), Arc::new(reboot::durable_coordinator::SingleParticipantResolver::new(
                    participant.actor_target(), reboot::durable_participant::DurableActorParticipantHost::new(participant.clone()),
                ).unwrap())).with_identity(participant.actor_target());
                let probe = Arc::new(AuthProbe {
                    verifier_calls: Arc::new(AtomicUsize::new(0)), authorizer_calls: Arc::new(AtomicUsize::new(0)), handler_calls: Arc::new(AtomicUsize::new(0)),
                    decision: if unauthenticated { AuthorizationDecision::Unauthenticated { message: "policy unauthenticated".into() } } else { AuthorizationDecision::PermissionDenied { message: "policy denied".into() } },
                    contexts: Arc::new(std::sync::Mutex::new(Vec::new())), snapshots: Arc::new(std::sync::Mutex::new(Vec::new())),
                });
                let owner = reboot::explicit_abort::ExplicitAbortOwner::new(2).unwrap();
                let mut adapter = transaction_generated::TransactionCounterWritesMethodsTransactionAdapter::new(store.clone(), participant.clone(), coordinator.clone(), TransactionStartFactory,
                    TransactionCounter { fresh_shared_probe: None, trace: trace.clone(), fail: false, downstream: None, final_state_override: None })
                    .with_authorization(AuthorizationPolicy::new(Some(probe.clone()), Some(probe.clone())));
                let (stop, stopped) = tokio::sync::oneshot::channel::<()>();
                let (ready, started) = tokio::sync::oneshot::channel();
                let (failure, failed) = tokio::sync::oneshot::channel();
                let server = if route == 1 || route == 2 || route == 4 {
                    adapter = adapter.with_explicit_abort_owner(owner.clone());
                    let host = reboot::application_host::ApplicationHost::new("denial-fault").with_host_recovery(DenialWorkerRecovery { owner: owner.clone(), ready: std::sync::Mutex::new(Some(ready)), failure: std::sync::Mutex::new(Some(failure)) });
                    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
                    let served = adapter.clone();
                    let server = tokio::spawn(host.add_public_service(proto::transaction_counter_writes_methods_server::TransactionCounterWritesMethodsServer::new(served)).serve_with_listener_shutdown(listener, async { let _ = stopped.await; }));
                    tokio::time::timeout(std::time::Duration::from_secs(2), started).await.unwrap().unwrap();
                    Some(server)
                } else { None };
                let mut headers = reboot::RebootHeaders::new("transaction-counter");
                if route == 0 || route == 3 { headers.idempotency_key = Some(key); }
                let mut request = tonic::Request::new(proto::TransactionIncrementRequest { amount: 3 });
                *request.metadata_mut() = headers.to_metadata().unwrap();
                // One representative case crosses a real generated Tonic server/client.
                let wire = route == 0 && code == tonic::Code::Internal && !unauthenticated;
                let mut wire_server = None;
                let mut rpc: Pin<Box<dyn Future<Output = Result<tonic::Response<proto::TransactionCounterValue>, tonic::Status>> + Send + '_>> = if wire {
                    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
                    let address = listener.local_addr().unwrap();
                    let served = adapter.clone();
                    wire_server = Some(tokio::spawn(async move {
                        tonic::transport::Server::builder().add_service(proto::transaction_counter_writes_methods_server::TransactionCounterWritesMethodsServer::new(served))
                            .serve_with_incoming(tokio_stream::wrappers::TcpListenerStream::new(listener)).await.unwrap();
                    }));
                    let mut client = proto::transaction_counter_writes_methods_client::TransactionCounterWritesMethodsClient::connect(format!("http://{address}")).await.unwrap();
                    Box::pin(async move { client.increment(request).await })
                } else { Box::pin(TransactionCounterWritesMethods::increment(&adapter, request)) };
                let reserved = route == 1 || route == 2 || route == 4;
                // Drive the same generated RPC until cleanup is causally parked.
                if reserved {
                    tokio::select! {
                        entered = tokio::time::timeout(std::time::Duration::from_secs(1), decisions.entered.acquire()) => entered.unwrap().unwrap().forget(),
                        early = &mut rpc => panic!("RPC completed before DecisionPut ACK: {early:?}"),
                    }
                } else {
                    tokio::select! {
                        entered = tokio::time::timeout(std::time::Duration::from_secs(1), sidecar.base.abort_entered.acquire()) => entered.unwrap().unwrap().forget(),
                        early = &mut rpc => panic!("RPC completed before Abort ACK: {early:?}"),
                    }
                }
                let gate = store.actor_gate("tests.reboot.protoc.TransactionCounter", "transaction-counter");
                // Probe reader first: no queued writer can manufacture exclusion.
                assert!(tokio::time::timeout(std::time::Duration::from_millis(30), gate.shared()).await.is_err());
                assert!(tokio::time::timeout(std::time::Duration::from_millis(30), gate.exclusive()).await.is_err());
                assert!(tokio::time::timeout(std::time::Duration::from_millis(30), &mut rpc).await.is_err());
                let disjoint = store.actor_gate("tests.reboot.protoc.TransactionCounter", "disjoint");
                drop(tokio::time::timeout(std::time::Duration::from_secs(1), disjoint.exclusive()).await.unwrap());
                if reserved {
                    decisions.release.notify_one();
                }
                if route != 1 {
                    if reserved {
                        tokio::select! {
                            entered = tokio::time::timeout(std::time::Duration::from_secs(1), sidecar.base.abort_entered.acquire()) => entered.unwrap().unwrap().forget(),
                            early = &mut rpc => panic!("RPC completed before reserved Abort ACK: {early:?}"),
                        }
                    }
                    // DecisionPut ACK must not release the actor before native Abort ACK.
                    assert!(tokio::time::timeout(std::time::Duration::from_millis(30), gate.shared()).await.is_err());
                    assert!(tokio::time::timeout(std::time::Duration::from_millis(30), gate.exclusive()).await.is_err());
                    assert!(tokio::time::timeout(std::time::Duration::from_millis(30), &mut rpc).await.is_err());
                    sidecar.base.abort_release.notify_one();
                }
                let status = tokio::time::timeout(std::time::Duration::from_secs(2), rpc).await.unwrap().unwrap_err();
                if route == 3 || route == 4 {
                    assert_eq!(status.code(), if unauthenticated { tonic::Code::Unauthenticated } else { tonic::Code::PermissionDenied });
                    assert_eq!(status.message(), if unauthenticated { "policy unauthenticated" } else { "policy denied" });
                    assert!(status.details().is_empty()); assert!(status.metadata().is_empty());
                    drop(tokio::time::timeout(std::time::Duration::from_secs(1), gate.exclusive()).await.unwrap());
                } else {
                    if wire {
                        assert_eq!(status.code(), tonic::Code::Unavailable);
                        assert_eq!(status.message(), "authorization cleanup unavailable");
                        assert!(status.details().is_empty());
                        assert!(status.metadata().get("x-private-cause").is_none());
                        assert!(status.metadata().get_bin("x-private-cause-bin").is_none());
                        assert!(status.metadata().get_bin("grpc-status-details-bin").is_none());
                        assert!(!format!("{:?}", status.metadata()).contains("SECRET_"));
                    } else { assert_denial_public(&status); }
                    assert!(tokio::time::timeout(std::time::Duration::from_millis(30), gate.shared()).await.is_err());
                    assert!(tokio::time::timeout(std::time::Duration::from_millis(30), gate.exclusive()).await.is_err());
                }
                if route == 1 || route == 2 {
                    let internal = tokio::time::timeout(std::time::Duration::from_secs(2), failed).await.unwrap().unwrap();
                    assert_eq!(internal.code(), rich.code()); assert_eq!(internal.message(), rich.message()); assert_eq!(internal.details(), rich.details());
                    assert_eq!(internal.metadata().get("x-private-cause"), rich.metadata().get("x-private-cause"));
                    assert_eq!(internal.metadata().get_bin("x-private-cause-bin"), rich.metadata().get_bin("x-private-cause-bin"));
                }
                let decisions_seen = decisions.base.decisions.lock().unwrap().clone();
                assert_eq!(decisions_seen.len(), if route == 1 || route == 2 || route == 4 { 1 } else { 0 });
                for decision in &decisions_seen {
                    assert_eq!(decision.root_transaction_id, Uuid::from_u128(102).as_bytes());
                    assert_eq!(decision.decision.as_ref().unwrap().outcome, reboot::database_proto::transaction_coordinator_decision::Outcome::Abort as i32);
                }
                assert_eq!(sidecar.base.aborts.lock().unwrap().len(), if route == 1 { 0 } else { 1 });
                assert!(sidecar.base.staged_states.lock().unwrap().is_empty());
                if route == 1 || route == 2 {
                    let root = reboot::runtime::RootTransactionContext::start(reboot::RebootHeaders::new("transaction-counter"), "tests.reboot.protoc.TransactionCounter", reboot::runtime::TransactionMode::Exclusive, Uuid::new_v4(), prost_types::Timestamp::default()).unwrap();
                    assert!(reboot::explicit_abort::RegisteredRoot::before_load(&participant, root.transaction().clone(), coordinator.clone(), Some(&owner)).is_err());
                }
                assert_eq!(probe.authorizer_calls.load(Ordering::SeqCst), 1);
                assert_eq!(recovery.lock().unwrap().len(), 1, "no receipt lookup/replay on denial");
                let expected = if route == 1 { vec!["participant load", "coordinator DB decision"] } else if route == 2 || route == 4 { vec!["participant load", "coordinator DB decision", "participant abort"] } else { vec!["participant load", "participant abort"] };
                assert_eq!(*trace.lock().unwrap(), expected, "no handler, Prepare, Commit, or extra Load");
                if route == 4 {
                    owner.wait_for_idle_for_test(std::time::Duration::from_secs(2)).await.unwrap();
                }
                if let Some(server) = wire_server { server.abort(); let _ = server.await; }
                let _ = stop.send(());
                if let Some(server) = server {
                    let joined = tokio::time::timeout(std::time::Duration::from_secs(2), server).await.unwrap().unwrap();
                    if route == 4 { joined.unwrap(); } else { assert!(joined.is_err(), "failed recovery must fail host"); }
                }
            }
        }
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
    idempotent_recovery: IdempotentRecoveryQueue,
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
    idempotent_recovery: IdempotentRecoveryQueue,
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
        TransactionCounter { fresh_shared_probe: None, trace, fail, downstream: None, final_state_override: None },
    ).with_authorization(reboot::auth::AuthorizationPolicy::permissive_for_development())
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
        TransactionCounter { fresh_shared_probe: None, trace, fail: false, downstream: Some(transaction_generated::TransactionCounterWritesMethodsClient::new(FixedChannelResolver(channel))), final_state_override: None },
    ).with_authorization(reboot::auth::AuthorizationPolicy::permissive_for_development())
}

fn factory_transaction_adapter(
    trace: Arc<std::sync::Mutex<Vec<&'static str>>>,
    initial_state: Option<proto::TransactionCounter>,
    staged_states: Arc<std::sync::Mutex<Vec<Option<Vec<u8>>>>>,
    fail: bool,
    final_state_override: Option<i64>,
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
        TransactionCounter { fresh_shared_probe: None, trace, fail, downstream: None, final_state_override },
    ).with_authorization(reboot::auth::AuthorizationPolicy::permissive_for_development())
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

#[tonic::async_trait]
trait TicketReceiverProbe: Send + Sync {
    async fn run(&self, context: &reboot::runtime::TransactionContext);
}
tokio::task_local! { static TICKET_RECEIVER_PROBE: Arc<dyn TicketReceiverProbe>; }
#[derive(Default)]
struct LocalCancellationProbe {
    entered: tokio::sync::Notify,
    dropped: AtomicUsize,
    context: std::sync::Mutex<Option<reboot::runtime::TransactionContext>>,
}
struct LocalCancellationDrop(Arc<LocalCancellationProbe>);
impl Drop for LocalCancellationDrop {
    fn drop(&mut self) { self.0.dropped.fetch_add(1, Ordering::SeqCst); }
}
tokio::task_local! { static LOCAL_CANCELLATION_PROBE: Arc<LocalCancellationProbe>; }

#[derive(Clone)]
struct ParkedLocalAdapter<A> { inner: A, parked: Arc<LocalCancellationProbe>, mode: usize }
impl<A: reboot::registered_local::GeneratedLocalTransactionAdapter> reboot::registered_local::GeneratedLocalTransactionAdapter for ParkedLocalAdapter<A> {
    fn local_configuration(&self) -> Result<reboot::registered_local::GeneratedLocalAdapterConfig, tonic::Status> { self.inner.local_configuration() }
    fn with_local_registration(self, binding: reboot::registered_local::RegisteredAdapterBinding) -> Result<Self, tonic::Status> {
        Ok(Self { inner: self.inner.with_local_registration(binding)?, ..self })
    }
}
#[derive(Clone)]
struct ParkedLocalService<S> { inner: S, parked: Arc<LocalCancellationProbe>, mode: usize }
impl<S> tower::Service<http::Request<tonic::body::BoxBody>> for ParkedLocalService<S>
where S: tower::Service<http::Request<tonic::body::BoxBody>, Response=http::Response<tonic::body::BoxBody>, Error=std::convert::Infallible> + Send + 'static, S::Future: Send + 'static {
    type Response = S::Response;
    type Error = S::Error;
    type Future = reboot::registered_local_service::LocalServiceFuture;
    fn poll_ready(&mut self, cx: &mut std::task::Context<'_>) -> std::task::Poll<Result<(), Self::Error>> {
        if self.mode == 14 { self.parked.entered.notify_one(); std::task::Poll::Pending }
        else { self.inner.poll_ready(cx) }
    }
    fn call(&mut self, request: http::Request<tonic::body::BoxBody>) -> Self::Future {
        self.parked.dropped.fetch_add(1, Ordering::SeqCst); // Receiver call count for readiness case.
        let future = self.inner.call(request);
        let mode = self.mode;
        let probe = self.parked.clone();
        Box::pin(async move {
            let response = future.await?;
            if mode != 15 { return Ok(response); }
            let (parts, body) = response.into_parts();
            use http_body_util::BodyExt;
            Ok(http::Response::from_parts(parts, PendingLocalEof { inner: body, trailers_seen: false, probe }.boxed_unsync()))
        })
    }
}
impl<A> reboot::registered_local_service::GeneratedLocalTransactionService for ParkedLocalAdapter<A>
where A: reboot::registered_local_service::GeneratedLocalTransactionService, <A::Service as tower::Service<http::Request<tonic::body::BoxBody>>>::Future: Send + 'static {
    type Service = ParkedLocalService<reboot::successful_trailers::SuccessfulParticipantTrailerService<A::Service>>;
    fn local_service(&self) -> Self::Service { ParkedLocalService { inner: tower::Layer::layer(&reboot::successful_trailers::SuccessfulParticipantTrailerLayer, self.inner.local_service()), parked: self.parked.clone(), mode: self.mode } }
    fn local_inbound_factory(&self) -> Arc<dyn reboot::runtime::InboundTransactionStartFactory> { self.inner.local_inbound_factory() }
}

struct PendingLocalEof { inner: tonic::body::BoxBody, trailers_seen: bool, probe: Arc<LocalCancellationProbe> }
impl Drop for PendingLocalEof { fn drop(&mut self) { self.probe.dropped.fetch_add(1, Ordering::SeqCst); } }
impl tonic::codegen::Body for PendingLocalEof {
    type Data = bytes::Bytes;
    type Error = tonic::Status;
    fn poll_frame(mut self: Pin<&mut Self>, cx: &mut std::task::Context<'_>) -> std::task::Poll<Option<Result<http_body::Frame<Self::Data>, Self::Error>>> {
        if self.trailers_seen { self.probe.entered.notify_one(); return std::task::Poll::Pending; }
        let frame = Pin::new(&mut self.inner).poll_frame(cx);
        if let std::task::Poll::Ready(Some(Ok(ref frame))) = frame
            && let Some(trailers) = frame.trailers_ref()
        {
            assert!(trailers.contains_key(reboot::successful_trailers::TRANSACTION_PARTICIPANTS_HEADER));
            self.trailers_seen = true;
        }
        frame
    }
    fn is_end_stream(&self) -> bool { false }
}

#[tokio::test]
async fn generated_ticket_receiver_uses_live_parent_child_once_and_burns_replay() {
    for mode in 0..16 { run(mode, false).await; }
    for mode in 0..9 { run(mode, true).await; }
    async fn run(mode: usize, writer: bool) {
    // These are source-derived obligations, not results for unexecuted modes.
    // The raw receiver modes deliberately never call the runtime terminal-ledger
    // completion seam. Burning a ticket/replying/dropping its scope is not that proof.
    let unresolved_b = match (writer, mode) {
        // Actual admitted B handler error leaves an owner-backed Watch; the raw
        // caller never enlists B into A's returned participant ledger.
        (_, 5) => true,
        // Generated dispatch reaches B but has no successful terminal membership:
        // handler error, handler cancellation, or staged response before EOF.
        (false, 8 | 13 | 15) => true,
        // No admitted B handler: invalid receiver/kind/headers/body, policy
        // denial, route rejection, cancelled readiness, or forged writer metadata.
        (false, 0..=4 | 6 | 7 | 9 | 11 | 12 | 14) => false,
        (true, 0..=4 | 6 | 7 | 8) => false,
        // Successful generated terminal membership: known B Prepare/Commit/cleanup.
        (false, 10) => false,
        _ => panic!("unsupported ticket fixture mode={mode} writer={writer}"),
    };
    eprintln!("TICKET_RECEIVER_START mode={mode} writer={writer} unresolved_b={unresolved_b}");
    use proto::transaction_counter_writes_methods_server::TransactionCounterWritesMethods;
    use reboot::registered_local::GeneratedLocalTransactionAdapter;
    use reboot::durable_coordinator::ParticipantTarget;
    struct LocalOnly { context: reboot::runtime::TransactionContext, mode: usize }
    #[tonic::async_trait]
    impl reboot::runtime::TransactionalChannelResolver for LocalOnly {
        fn transactional_route(&self, _: &str, _: &str, _: &str) -> Result<reboot::runtime::TransactionalRoute, tonic::Status> {
            if self.mode == 11 {
                self.context.doom(tonic::Status::cancelled("route callback closed parent"));
            }
            if self.mode == 12 { return Err(tonic::Status::unavailable("route selection rejected")); }
            Ok(reboot::runtime::TransactionalRoute::RegisteredSameHost)
        }
        async fn resolve(&self, _: &str, _: &str) -> Result<tonic::transport::Channel, tonic::Status> {
            panic!("explicit local route must never resolve a network channel")
        }
    }
    struct Starts(Arc<AtomicUsize>);
    impl reboot::runtime::RootTransactionStartFactory for Starts {
        fn next_root_transaction(&self) -> Result<reboot::runtime::RootTransactionStart, tonic::Status> {
            Ok(reboot::runtime::RootTransactionStart { transaction_id: Uuid::from_u128(201), timestamp: prost_types::Timestamp::default() })
        }
    }
    impl reboot::runtime::InboundTransactionStartFactory for Starts {
        fn next_inbound_transaction(&self, _: &reboot::runtime::InboundTransactionContext) -> Result<Uuid, tonic::Status> {
            self.0.fetch_add(1, Ordering::SeqCst);
            Ok(Uuid::from_u128(202))
        }
    }
    struct TicketCoordinatorSidecar {
        trace: Arc<std::sync::Mutex<Vec<&'static str>>>,
        endpoint: String,
    }
impl reboot::durable_coordinator::CoordinatorSidecar for TicketCoordinatorSidecar {
    fn database_endpoint(&self) -> Option<&str> { Some(&self.endpoint) }
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


    struct Watch;
    impl reboot::legacy_coordinator::CoordinatorWatchEndpoint for Watch {
        fn watch(&self, _: reboot::database_proto::WatchRequest) -> reboot::legacy_coordinator::CoordinatorWatchFuture<'_, reboot::database_proto::WatchResponse> {
            Box::pin(std::future::pending())
        }
    }
    struct Probe {
        mode: usize,
        writer: bool,
        auth_probe: Arc<AuthProbe>,
        receiver: Arc<dyn TransactionCounterWritesMethods + Send + Sync>,
        unregistered: Arc<dyn TransactionCounterWritesMethods + Send + Sync>,
        target: ParticipantTarget,
        allocations: Arc<AtomicUsize>,
        trace: Arc<std::sync::Mutex<Vec<&'static str>>>,
        readiness: Arc<LocalCancellationProbe>,
    }
    #[tonic::async_trait]
    impl TicketReceiverProbe for Probe {
        async fn run(&self, context: &reboot::runtime::TransactionContext) {
            context.require_registered_outbound().unwrap();
            if self.writer && self.mode == 8 {
                let mut headers = reboot::RebootHeaders::new(&self.target.state_ref);
                headers.transaction_ids = Some(context.transaction_ids().to_vec());
                headers.transaction_coordinator_state_type = Some(context.transaction_coordinator_state_type().into());
                headers.transaction_coordinator_state_ref = Some(context.transaction_coordinator_state_ref().into());
                let mut request = tonic::Request::new(proto::TransactionIncrementRequest { amount: 7311 });
                *request.metadata_mut() = headers.to_metadata().unwrap();
                let before = self.trace.lock().unwrap().clone();
                let error = self.receiver.apply(request).await.unwrap_err();
                assert_eq!(error.code(), tonic::Code::FailedPrecondition);
                assert_eq!(error.message(), "inbound ordinary writer requires registered local ticket");
                assert_eq!(*self.trace.lock().unwrap(), before, "forged metadata must not load or enter writer");
                assert_eq!(self.allocations.load(Ordering::SeqCst), 0);
                return;
            }
            if matches!(self.mode, 14 | 15) {
                let client = transaction_generated::TransactionCounterWritesMethodsClient::new(LocalOnly { context: context.clone(), mode: self.mode });
                let target = transaction_generated::TransactionCounterWritesMethodsTarget::new(&self.target.state_ref);
                let before = self.trace.lock().unwrap().clone();
                let mut call = Box::pin(client.increment(context, &target, proto::TransactionIncrementRequest { amount: if self.mode == 15 { 7312 } else { 7311 } }));
                tokio::select! {
                    result = &mut call => panic!("parked readiness returned: {result:?}"),
                    _ = self.readiness.entered.notified() => {}
                }
                drop(call);
                if self.mode == 14 {
                    assert_eq!(self.readiness.dropped.load(Ordering::SeqCst), 0, "B service never called");
                    assert_eq!(*self.trace.lock().unwrap(), before, "B never loads or enters handler");
                } else {
                    assert_eq!(self.readiness.dropped.load(Ordering::SeqCst), 2, "B called once and EOF body dropped once");
                }
                assert!(context.returned_participants_snapshot().is_empty());
                assert_eq!(self.allocations.load(Ordering::SeqCst), 1);
                return;
            }
            if self.mode == 13 {
                let probe = Arc::new(LocalCancellationProbe::default());
                let client = transaction_generated::TransactionCounterWritesMethodsClient::new(LocalOnly { context: context.clone(), mode: self.mode });
                let target = transaction_generated::TransactionCounterWritesMethodsTarget::new(&self.target.state_ref);
                LOCAL_CANCELLATION_PROBE.scope(probe.clone(), async {
                    let mut call = Box::pin(client.increment(context, &target, proto::TransactionIncrementRequest { amount: 7314 }));
                    tokio::select! {
                        result = &mut call => panic!("parked child unexpectedly returned: {result:?}"),
                        _ = probe.entered.notified() => {}
                    }
                    drop(call);
                }).await;
                assert_eq!(probe.dropped.load(Ordering::SeqCst), 1);
                assert!(probe.context.lock().unwrap().as_ref().unwrap().require_registered_outbound().is_err());
                assert!(context.returned_participants_snapshot().is_empty(), "cancelled child has no terminal membership");
                assert_eq!(self.allocations.load(Ordering::SeqCst), 1);
                return;
            }
            if self.mode >= 8 {
                let target_ref = if self.mode == 9 { "not-registered" } else { &self.target.state_ref };
                let client = transaction_generated::TransactionCounterWritesMethodsClient::new(LocalOnly { context: context.clone(), mode: self.mode });
                let target = transaction_generated::TransactionCounterWritesMethodsTarget::new(target_ref);
                let context = context.clone();
                // Awaited fixture task separates large debug generated adapter stacks.
                // Production local service dispatch remains inline and cancellation-owned.
                let mode = self.mode;
                let before = self.trace.lock().unwrap().clone();
                let result = tokio::spawn(async move { client.increment(&context,
                    &target, proto::TransactionIncrementRequest { amount: if mode == 10 { 7312 } else { 7311 } },
                ).await }).await.unwrap();
                if mode == 10 {
                    let response = result.unwrap();
                    assert_eq!(response.response().get_ref().value, 5);
                    assert_eq!(self.allocations.load(Ordering::SeqCst), 1);
                    return;
                }
                let error = result.unwrap_err();
                match error {
                    transaction_generated::TransactionCounterWritesMethodsIncrementError::Grpc(status) => {
                        match self.mode {
                            8 => assert_eq!(status.message(), "child probe reached"),
                            11 => { assert_eq!(status.code(), tonic::Code::Cancelled); assert_eq!(status.message(), "route callback closed parent"); }
                            12 => { assert_eq!(status.code(), tonic::Code::Unavailable); assert_eq!(status.message(), "route selection rejected"); }
                            _ => assert_eq!(status.code(), tonic::Code::FailedPrecondition),
                        }
                    }
                    other => panic!("unexpected local outcome: {other:?}"),
                }
                assert_eq!(self.allocations.load(Ordering::SeqCst), usize::from(self.mode == 8));
                if matches!(self.mode, 9 | 11 | 12) {
                    assert_eq!(*self.trace.lock().unwrap(), before, "route rejection must precede B effects");
                }
                return;
            }
            let method = if self.writer { "tests.reboot.protoc.TransactionCounterWritesMethods.Apply" } else { "tests.reboot.protoc.TransactionCounterWritesMethods.Increment" };
            let destination = context.lookup_registered_local_destination(&self.target, method).unwrap();
            let scope = context.begin_generated_outbound_for(&self.target.state_type, &self.target.state_ref, method).unwrap();
            let message = proto::TransactionIncrementRequest { amount: 7311 };
            let ticket = context.issue_registered_local_ticket(&scope, &destination, method, &message).unwrap();
            let replay = ticket.clone();
            let mut headers = reboot::RebootHeaders::new(&self.target.state_ref);
            headers.transaction_ids = Some(context.transaction_ids().to_vec());
            headers.transaction_coordinator_state_type = Some(context.transaction_coordinator_state_type().into());
            headers.transaction_coordinator_state_ref = Some(context.transaction_coordinator_state_ref().into());
            headers.coordinator_read_only_aware = context.headers().coordinator_read_only_aware;
            let make_request = |ticket| {
                let mut request = tonic::Request::new(message);
                *request.metadata_mut() = headers.to_metadata().unwrap();
                request.extensions_mut().insert(ticket);
                request
            };
            let receiver = if self.mode == 0 { self.unregistered.clone() } else { self.receiver.clone() };
            let mut request = make_request(ticket);
            let mode = self.mode;
            let writer = self.writer;
            if mode == 3 { request.metadata_mut().insert("x-reboot-transaction-ids", "malformed".parse().unwrap()); }
            if mode == 4 { request.get_mut().amount += 1; }
            let before = self.trace.lock().unwrap().clone();
            let error = tokio::spawn(async move {
                match mode {
                    1 => receiver.factory_increment(request).await,
                    2 => receiver.shared_read(request).await,
                    _ if writer => receiver.apply(request).await,
                    _ => receiver.increment(request).await,
                }
            }).await.unwrap().unwrap_err();
            if mode == 5 { assert_eq!(error.message(), "child probe reached"); }
            else if mode >= 6 {
                assert_eq!(error.code(), tonic::Code::PermissionDenied);
                assert_eq!(self.auth_probe.verifier_calls.load(Ordering::SeqCst), 1);
                assert_eq!(self.auth_probe.authorizer_calls.load(Ordering::SeqCst), usize::from(mode == 7));
                if mode == 6 { assert!(error.message().contains("no authorizer configured")); }
                else { assert_eq!(error.message(), "ticket policy denial"); }
                assert!(!self.trace.lock().unwrap()[before.len()..].iter().any(|entry| entry.contains("handler")), "denied B must not enter handler");
            }
            else {
                if mode == 3 { assert_eq!(error.code(), tonic::Code::InvalidArgument); }
                else { assert_eq!(error.code(), tonic::Code::FailedPrecondition); }
                assert_eq!(*self.trace.lock().unwrap(), before, "rejection mode {mode} must precede participant/storage/handler");
            }
            assert_eq!(self.allocations.load(Ordering::SeqCst), 1);
            let before = self.trace.lock().unwrap().clone();
            let receiver = self.receiver.clone();
            let request = make_request(replay);
            let error = tokio::spawn(async move { if writer { receiver.apply(request).await } else { receiver.increment(request).await } }).await.unwrap().unwrap_err();
            assert_eq!(error.message(), "local ticket already consumed");
            assert_eq!(*self.trace.lock().unwrap(), before, "replay must fail before participant/storage/handler");
            if mode >= 6 {
                assert_eq!(self.auth_probe.verifier_calls.load(Ordering::SeqCst), 1, "burned replay must not reverify");
                assert_eq!(self.auth_probe.authorizer_calls.load(Ordering::SeqCst), usize::from(mode == 7), "burned replay must not reauthorize");
            }
            assert_eq!(self.allocations.load(Ordering::SeqCst), 1);
            drop(scope); // Private receiver proof deliberately ends in parent abort, not terminal settlement.
        }
    }
    // Real configured Tonic sidecar supplies distinct A/B actor targets.
    let (endpoint, database, database_server) = start_database().await;
    // Retain the exact store/owner, not a fresh actor or replacement owner in
    // teardown. Normal store access and participant aliases share these gates.
    let store = DatabaseActorStore::connect_lazy(&endpoint).unwrap();
    let a_abort_owner = reboot::explicit_abort::ExplicitAbortOwner::new(2).unwrap();
    let trace = Arc::new(std::sync::Mutex::new(Vec::new()));
    let allocations = Arc::new(AtomicUsize::new(0));
    let sidecar = Arc::new(reboot::durable_participant::TonicParticipantSidecar::connect(&endpoint).await.unwrap());
    let participants = ["transaction-counter", "remote-transaction-counter"].map(|state_ref|
        reboot::durable_participant::DurableActorParticipant::new(sidecar.clone(), "tests.reboot.protoc.TransactionCounter", state_ref));
    let make = |state_ref: &str| {
        let participant = participants.iter().find(|p| p.actor_target().state_ref == state_ref).unwrap().clone();
        let coordinator = reboot::durable_coordinator::DurableRootCoordinator::new(
            Arc::new(TicketCoordinatorSidecar { trace: trace.clone(), endpoint: tonic::transport::Endpoint::from_shared(endpoint.clone()).unwrap().uri().to_string() }),
            Arc::new(reboot::durable_coordinator::ExactParticipantResolver::new(participants.iter().map(|p| (
                p.actor_target(), Arc::new(reboot::durable_coordinator::InProcessParticipantEndpoint::new(
                    reboot::durable_participant::DurableActorParticipantHost::new(p.clone())))
            ))).unwrap()),
        ).with_identity(participant.actor_target());
        transaction_generated::TransactionCounterWritesMethodsTransactionAdapter::new(
            store.clone(), participant, coordinator, Starts(allocations.clone()),
            TransactionCounter { fresh_shared_probe: None, trace: trace.clone(), fail: false, downstream: None, final_state_override: None },
        ).with_explicit_abort_owner(if state_ref == "transaction-counter" { a_abort_owner.clone() } else { reboot::explicit_abort::ExplicitAbortOwner::new(2).unwrap() }).with_authorization(AuthorizationPolicy::permissive_for_development()).with_sequential_root_star()
    };
    let mut application = reboot::application_host::ApplicationHost::new("ticket-receiver-fixture");
    let (a, _) = application.register_local_transaction_service(make("transaction-counter")).unwrap();
    let owner = reboot::live_participant::LiveParticipantOwner::new(2, ParticipantTarget { state_type: "tests.reboot.protoc.TransactionCounter".into(), state_ref: "transaction-counter".into() }, Arc::new(Watch)).unwrap();
    let auth_probe = Arc::new(AuthProbe {
        verifier_calls: Arc::new(AtomicUsize::new(0)), authorizer_calls: Arc::new(AtomicUsize::new(0)),
        handler_calls: Arc::new(AtomicUsize::new(0)),
        decision: AuthorizationDecision::PermissionDenied { message: "ticket policy denial".into() },
        contexts: Arc::new(std::sync::Mutex::new(Vec::new())), snapshots: Arc::new(std::sync::Mutex::new(Vec::new())),
    });
    let b = make("remote-transaction-counter").with_live_participant_owner(owner.clone());
    let b = if mode == 6 { b.with_authorization(AuthorizationPolicy::new(Some(auth_probe.clone()), None)) }
        else if mode == 7 { b.with_authorization(AuthorizationPolicy::new(Some(auth_probe.clone()), Some(auth_probe.clone()))) }
        else { b };
    let readiness = Arc::new(LocalCancellationProbe::default());
    let (b, _) = application.register_local_transaction_service(ParkedLocalAdapter { inner: b, parked: readiness.clone(), mode }).unwrap();
    let b = b.inner;
    let target = b.local_configuration().unwrap().target;
    let registration = a.explicit_abort_recovery_registration().unwrap();
    let b_registration = b.live_participant_recovery_registration().unwrap();
    let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap(); let address = listener.local_addr().unwrap(); drop(listener);
    let (stop, stopped) = tokio::sync::oneshot::channel::<()>();
    let served = a.clone();
    let server = tokio::spawn(async move {
        application.with_host_recovery(registration).with_host_recovery(b_registration)
            .add_public_service(proto::transaction_counter_writes_methods_server::TransactionCounterWritesMethodsServer::new(served))
            .serve_with_shutdown(address, async { let _ = stopped.await; }).await
    });
    tokio::time::timeout(std::time::Duration::from_secs(3), async {
        loop { if a.require_local_host_ready().is_ok() { break; } tokio::task::yield_now().await; }
    }).await.unwrap();
    // Establish both actors through the ordinary generated public writer, not private DB seeding.
    let initialization_b = make("remote-transaction-counter");
    for (adapter, target_ref) in [(&a, "transaction-counter"), (&initialization_b, "remote-transaction-counter")] {
        let mut headers = reboot::RebootHeaders::new(target_ref);
        headers.idempotency_key = Some(Uuid::new_v4());
        let mut request = tonic::Request::new(proto::TransactionIncrementRequest { amount: 4 });
        *request.metadata_mut() = headers.to_metadata().unwrap();
        adapter.apply(request).await.unwrap();
    }
    let mut request = tonic::Request::new(proto::TransactionIncrementRequest { amount: if mode == 10 { 7313 } else { 7310 } });
    let mut headers = reboot::RebootHeaders::new("transaction-counter");
    headers.bearer_token = Some("test-only-parent-token".into()); headers.cookie = Some("parent-cookie".into());
    *request.metadata_mut() = headers.to_metadata().unwrap();
    let probe: Arc<dyn TicketReceiverProbe> = Arc::new(Probe { mode, writer, auth_probe, receiver: Arc::new(b), unregistered: Arc::new(make("remote-transaction-counter")), target, allocations: allocations.clone(), trace: trace.clone(), readiness });
    let result = tokio::time::timeout(std::time::Duration::from_secs(5), TICKET_RECEIVER_PROBE.scope(probe, a.increment(request))).await.unwrap();
    if mode == 10 {
        assert_eq!(result.unwrap().get_ref().value, 5);
        // Test Database transaction control is ACK-only; assert actual staged
        // bytes, not fictitious committed readback. Native durability is separate.
        let prepares = database.participant_prepare_requests();
        assert_eq!(prepares.len(), 2);
        let staged = prepares.iter().map(|request| (
            request.state_ref.clone(), proto::TransactionCounter::decode(request.state.as_ref().unwrap().as_slice()).unwrap().value,
        )).collect::<std::collections::BTreeMap<_, _>>();
        let commits = database.participant_commit_requests();
        assert_eq!(commits.len(), 2);
        assert_eq!(commits.iter().map(|request| request.state_ref.clone()).collect::<std::collections::BTreeSet<_>>(),
            std::collections::BTreeSet::from(["transaction-counter".to_owned(), "remote-transaction-counter".to_owned()]));
        assert_eq!(staged, std::collections::BTreeMap::from([
            ("transaction-counter".to_owned(), 5), ("remote-transaction-counter".to_owned(), 5),
        ]));
        assert!(trace.lock().unwrap().contains(&"coordinator DB decision"));
        assert!(trace.lock().unwrap().contains(&"coordinator DB cleanup"));
    } else {
        let error = result.unwrap_err();
        if mode < 8 { assert_eq!(error.message(), "parent probe complete"); }
    }
    assert_eq!(
        allocations.load(Ordering::SeqCst),
        usize::from(!(matches!(mode, 9 | 11 | 12) || writer && mode == 8))
    );
    if matches!(mode, 13..=15) {
        assert!(database.participant_prepare_requests().is_empty());
        assert!(database.participant_commit_requests().is_empty());
        // Owned root abort may persist an abort decision; that is not Commit authority.
    }
    // These probes run AFTER the original replay/allocation/Prepare/Commit
    // assertions, so they cannot hide a changed receiver-side execution count.
    // They acquire the actual endpoint/type/ref gate; load alone is not admission.
    let prepare_count = database.participant_prepare_requests().len();
    let commit_count = database.participant_commit_requests().len();
    let handler_count = trace.lock().unwrap().iter().filter(|entry| entry.contains("handler")).count();
    let a_gate = store.actor_gate("tests.reboot.protoc.TransactionCounter", "transaction-counter");
    let b_gate = store.actor_gate("tests.reboot.protoc.TransactionCounter", "remote-transaction-counter");
    let a_lease = tokio::time::timeout(std::time::Duration::from_secs(2), a_gate.exclusive())
        .await.expect("known A local completion must restore exact actor admission");
    let a_state = tokio::time::timeout(std::time::Duration::from_secs(2),
        store.load_for_declaration::<transaction_generated::TransactionCounterDurableState>("transaction-counter"))
        .await.expect("independent A load must progress while B is retained").unwrap().unwrap();
    // ACK-only mock transaction controls do not publish prepared bytes. This
    // is the existing committed initialization snapshot, not native settlement.
    assert_eq!(a_state.value, 4);
    drop(a_lease);
    eprintln!("TICKET_RECEIVER_A_PROGRESS mode={mode} writer={writer} exact_gate=true value={}", a_state.value);
    if unresolved_b {
        // A timeout of the actual competing exclusive admission, not an arbitrary
        // RPC error, proves the affected B is still excluded. Cancelling this
        // waiter removes only its queue entry; it never terminalizes B's root.
        assert!(tokio::time::timeout(std::time::Duration::from_millis(30), b_gate.exclusive()).await.is_err(),
            "unknown B Watch must retain the affected actor before shutdown: mode={mode} writer={writer}");
    } else {
        let lease = tokio::time::timeout(std::time::Duration::from_secs(2), b_gate.exclusive())
            .await.expect("pristine or known-completed B must restore exact actor admission");
        drop(lease);
    }
    eprintln!("TICKET_RECEIVER_B_ADMISSION mode={mode} writer={writer} excluded={unresolved_b}");
    // Observe the exact retained owners AFTER all request/handler futures have
    // ended. This grants no authority and does not settle raw caller membership.
    // A's known local cleanup must actually retire in every mode, including when
    // unknown B remains excluded; its handler reply/gate alone is insufficient.
    a_abort_owner.wait_for_idle_for_test(std::time::Duration::from_secs(2)).await
        .expect("known A cleanup must retire all registered roots, work and Job permits");
    if !unresolved_b {
        // Mode10's real in-process terminal callback clears the exact participant
        // under its pending mutex and notifies its parked LiveExecution Watch.
        // Watch then returns from the owner-disappearance check, WITHOUT another
        // terminal RPC. ACK-only fixture responses remain distinct from native ACK.
        owner.wait_for_idle_for_test(std::time::Duration::from_secs(2)).await
            .expect("healthy B must retire actual Watch work and all configured permits");
    }
    // Unknown B is deliberately NOT awaited as healthy, released, or supplied a
    // fabricated Watch response. Exact RecoveryTask/exclusion assertions remain.
    stop.send(()).unwrap();
    let shutdown_result = tokio::time::timeout(std::time::Duration::from_secs(3), server)
        .await.expect("ticket host shutdown must finish within its bound").unwrap();
    eprintln!("TICKET_RECEIVER_SHUTDOWN mode={mode} writer={writer} result={shutdown_result:?}");
    if unresolved_b {
        match shutdown_result {
            Err(reboot::application_host::ApplicationHostError::RecoveryTask(status)) => {
                assert_eq!(status.code(), tonic::Code::Unavailable);
                assert_eq!(status.message(), "durable task outcome uncertain during shutdown");
            }
            other => panic!("unresolved B requires exact host RecoveryTask: mode={mode} writer={writer} result={other:?}"),
        }
        assert!(tokio::time::timeout(std::time::Duration::from_millis(30), b_gate.exclusive()).await.is_err(),
            "host cancellation must NOT release unknown B ownership: mode={mode} writer={writer}");
        let lease = tokio::time::timeout(std::time::Duration::from_secs(2), a_gate.exclusive())
            .await.expect("B uncertainty must not prevent independent A gate progress after shutdown");
        drop(lease);
    } else {
        // Healthy cases still require actual hostOk; no Err whitelist.
        shutdown_result.unwrap();
    }
    assert_eq!(database.participant_prepare_requests().len(), prepare_count,
        "teardown admission probes must not manufacture Prepare evidence");
    assert_eq!(database.participant_commit_requests().len(), commit_count,
        "teardown admission probes must not manufacture Commit evidence");
    assert_eq!(trace.lock().unwrap().iter().filter(|entry| entry.contains("handler")).count(), handler_count,
        "teardown admission probes must not enter another handler");
    database_server.abort(); let _ = database_server.await;
    }
}

#[tokio::test]
async fn generated_local_registration_retains_exact_binding_and_invalidates_builders() {
    use reboot::registered_local::GeneratedLocalTransactionAdapter;
    use reboot::registered_local_service::GeneratedLocalTransactionService;
    struct RegistrationStarts(Arc<AtomicUsize>);
    impl reboot::runtime::RootTransactionStartFactory for RegistrationStarts {
        fn next_root_transaction(&self) -> Result<reboot::runtime::RootTransactionStart, tonic::Status> {
            reboot::runtime::RootTransactionStartFactory::next_root_transaction(&TransactionStartFactory)
        }
    }
    impl reboot::runtime::InboundTransactionStartFactory for RegistrationStarts {
        fn next_inbound_transaction(&self, inbound: &reboot::runtime::InboundTransactionContext) -> Result<Uuid, tonic::Status> {
            self.0.fetch_add(1, Ordering::SeqCst);
            reboot::runtime::InboundTransactionStartFactory::next_inbound_transaction(&TransactionStartFactory, inbound)
        }
    }
    let allocations = Arc::new(AtomicUsize::new(0));
    let (endpoint, database, database_server) = start_database().await;
    let trace = Arc::new(std::sync::Mutex::new(Vec::new()));
    let sidecar = Arc::new(reboot::durable_participant::TonicParticipantSidecar::connect(&endpoint).await.unwrap());
    let store = DatabaseActorStore::connect(&endpoint).await.unwrap();
    let make_adapter = |state_type: &str, store: DatabaseActorStore| {
        let participant = reboot::durable_participant::DurableActorParticipant::new(
            sidecar.clone(), state_type, "transaction-counter",
        );
        let coordinator = reboot::durable_coordinator::DurableRootCoordinator::new(
            Arc::new(TransactionCoordinatorSidecar { trace: trace.clone() }),
            Arc::new(reboot::durable_coordinator::SingleParticipantResolver::new(
                participant.actor_target(),
                reboot::durable_participant::DurableActorParticipantHost::new(participant.clone()),
            ).unwrap()),
        );
        transaction_generated::TransactionCounterWritesMethodsTransactionAdapter::new(
            store, participant, coordinator, RegistrationStarts(allocations.clone()),
            TransactionCounter { fresh_shared_probe: None, trace: trace.clone(), fail: false, downstream: None, final_state_override: None },
        ).with_sequential_reusable_participants()
    };
    let mut host = reboot::application_host::ApplicationHost::new("generated-registration");
    for wrong_type in ["tests.reboot.protoc.Other", ".tests.reboot.protoc.TransactionCounter"] {
        assert!(host.register_transaction_adapter(make_adapter(wrong_type, store.clone())).is_err());
        assert_eq!(host.registered_transaction_adapter_count(), 0);
    }
    assert!(host.register_transaction_adapter(make_adapter(
        "tests.reboot.protoc.TransactionCounter", DatabaseActorStore::connect_lazy("http://127.0.0.1:1").unwrap(),
    )).is_err());
    assert_eq!(host.registered_transaction_adapter_count(), 0);
    assert!(host.register_transaction_adapter(transaction_adapter(trace.clone(), false)).is_err());
    assert_eq!(host.registered_transaction_adapter_count(), 0);
    let adapter = make_adapter("tests.reboot.protoc.TransactionCounter", store);
    let config = adapter.local_configuration().unwrap();
    assert_eq!(config.database_endpoint, tonic::transport::Endpoint::from_shared(endpoint.clone()).unwrap().uri().to_string());
    assert_eq!(config.target.state_ref, "transaction-counter");
    assert_eq!(config.target.state_type, "tests.reboot.protoc.TransactionCounter");
    assert_eq!(config.methods, std::collections::BTreeSet::from([
        "tests.reboot.protoc.TransactionCounterWritesMethods.Increment".to_owned(),
        "tests.reboot.protoc.TransactionCounterWritesMethods.Apply".to_owned(),
        "tests.reboot.protoc.TransactionCounterWritesMethods.ApplyDeclared".to_owned(),
    ]));

    let (registered, template) = host.register_local_transaction_service(adapter).unwrap();
    assert_eq!(host.registered_transaction_service_count(), 1);
    let factory = template.inbound_factory().unwrap();
    assert!(Arc::ptr_eq(&factory, &registered.local_inbound_factory()));
    assert!(Arc::ptr_eq(&factory, &template.clone().inbound_factory().unwrap()));
    assert_eq!(allocations.load(Ordering::SeqCst), 0);
    let mut headers = reboot::RebootHeaders::new("transaction-counter");
    headers.transaction_ids = Some(vec![Uuid::from_u128(201)]);
    headers.transaction_coordinator_state_type = Some("tests.reboot.protoc.TransactionCounter".into());
    headers.transaction_coordinator_state_ref = Some("root".into());
    let inbound = reboot::runtime::InboundTransactionContext::from_headers(headers, reboot::runtime::TransactionMode::Exclusive).unwrap();
    assert_eq!(factory.next_inbound_transaction(&inbound).unwrap(), Uuid::from_u128(202));
    assert_eq!(allocations.load(Ordering::SeqCst), 1);
    let mut erased = template.clone_service();
    std::future::poll_fn(|cx| erased.poll_ready(cx)).await.unwrap();
    // The plain erased generated service still enforces its default policy.
    use http_body_util::BodyExt;
    let encoded = proto::TransactionIncrementRequest { amount: 1 }.encode_to_vec();
    let mut frame = vec![0];
    frame.extend_from_slice(&u32::try_from(encoded.len()).unwrap().to_be_bytes());
    frame.extend_from_slice(&encoded);
    let body = http_body_util::Full::new(bytes::Bytes::from(frame))
        .map_err(|never| match never {}).boxed_unsync();
    let request = http::Request::builder()
        .method("POST")
        .uri("/tests.reboot.protoc.TransactionCounterWritesMethods/Increment")
        .header("content-type", "application/grpc")
        .header("te", "trailers")
        .header("x-reboot-state-ref", "transaction-counter")
        .body(body).unwrap();
    let response = erased.call(request).await.unwrap();
    let header_status = response.headers().get("grpc-status").cloned();
    let body = response.into_body().collect().await.unwrap();
    let status = header_status.or_else(|| body.trailers().and_then(|trailers| trailers.get("grpc-status").cloned())).unwrap();
    assert_eq!(status, "7");
    assert_eq!(allocations.load(Ordering::SeqCst), 1, "denied RPC must not allocate another child");
    assert!(trace.lock().unwrap().is_empty());
    assert!(database.store_requests().is_empty());
    assert!(database.create_requests().is_empty());
    registered.validate_local_registration().unwrap();
    registered.clone().validate_local_registration().unwrap();
    assert!(host.register_transaction_adapter(registered.clone()).is_err());
    assert!(registered.clone().with_supervised_transaction_tree().validate_local_registration().is_err());
    assert!(registered.clone().with_sequential_root_star().validate_local_registration().is_err());
    assert!(registered.clone().with_sequential_reusable_participants().validate_local_registration().is_err());
    assert!(registered.clone().with_authorization(reboot::auth::AuthorizationPolicy::default()).validate_local_registration().is_err());
    registered.validate_local_registration().unwrap();
    drop(host);
    assert!(registered.validate_local_registration().is_err());
    // Retained templates remain ordinary Tonic services, not host authority.
    let mut after_drop = template.clone_service();
    std::future::poll_fn(|cx| after_drop.poll_ready(cx)).await.unwrap();
    assert!(registered.validate_local_registration().is_err());
    database_server.abort();
    let _ = database_server.await;
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
async fn generated_fresh_shared_transaction_authorization_precedes_handler_and_releases_denial() {
    use proto::transaction_counter_writes_methods_server::TransactionCounterWritesMethods;

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
    // Read-only allowed calls avoid the fake Store endpoint; native promotion is separate.
    fn request(token: &str) -> tonic::Request<proto::TransactionIncrementRequest> {
        let mut headers = reboot::RebootHeaders::new("transaction-counter");
        headers.bearer_token = Some(token.into());
        let mut request = tonic::Request::new(proto::TransactionIncrementRequest { amount: 0 });
        *request.metadata_mut() = headers.to_metadata().unwrap();
        request
    }

    let rejected_trace = Arc::new(std::sync::Mutex::new(Vec::new()));
    let rejected = probe(AuthorizationDecision::Allow);
    let rejected_adapter = transaction_adapter(Arc::clone(&rejected_trace), false)
        .with_authorization(policy(Arc::clone(&rejected)));
    assert_eq!(
        TransactionCounterWritesMethods::shared_read(&rejected_adapter, request("reject"))
            .await
            .unwrap_err()
            .code(),
        tonic::Code::Unauthenticated
    );
    assert_eq!(rejected.verifier_calls.load(Ordering::SeqCst), 1);
    assert_eq!(rejected.authorizer_calls.load(Ordering::SeqCst), 0);
    assert!(rejected_trace.lock().unwrap().is_empty());

    let denied_trace = Arc::new(std::sync::Mutex::new(Vec::new()));
    let denied = probe(AuthorizationDecision::PermissionDenied { message: "denied".into() });
    let denied_adapter = transaction_adapter(Arc::clone(&denied_trace), false)
        .with_authorization(policy(Arc::clone(&denied)));
    assert_eq!(
        TransactionCounterWritesMethods::shared_read(&denied_adapter, request("allow"))
            .await
            .unwrap_err()
            .code(),
        tonic::Code::PermissionDenied
    );
    assert_eq!(denied.authorizer_calls.load(Ordering::SeqCst), 1);
    assert_eq!(*denied_trace.lock().unwrap(), ["participant load"]);

    // Drop schedules pre-Store cleanup. Observe eventual release, not synchronous Drop.
    // This fixture-only wait retries only the exact known pre-admission conflict;
    // it never retries a handler or a transaction that could have produced effects.
    let read_again = denied_adapter.with_authorization(AuthorizationPolicy::permissive_for_development());
    let recovered = tokio::time::timeout(std::time::Duration::from_secs(2), async {
        loop {
            match TransactionCounterWritesMethods::shared_read(&read_again, request("allow")).await {
                Err(status) if status.code() == tonic::Code::FailedPrecondition
                    && status.message() == "actor already has a pending transaction" => {
                    tokio::task::yield_now().await;
                }
                result => break result,
            }
        }
    }).await.expect("denied participant cleanup did not release ownership").unwrap();
    assert_eq!(recovered.into_inner().value, 4);
    assert_eq!(*denied_trace.lock().unwrap(), ["participant load", "participant load", "fresh shared handler"]);

    let allowed_trace = Arc::new(std::sync::Mutex::new(Vec::new()));
    let allowed = probe(AuthorizationDecision::Allow);
    let allowed_adapter = transaction_adapter(Arc::clone(&allowed_trace), false)
        .with_authorization(policy(Arc::clone(&allowed)));
    assert_eq!(
        TransactionCounterWritesMethods::shared_read(&allowed_adapter, request("allow"))
            .await
            .unwrap()
            .into_inner()
            .value,
        4
    );
    let contexts = allowed.contexts.lock().unwrap();
    assert_eq!(contexts[0].method, "tests.reboot.protoc.TransactionCounterWritesMethods.SharedRead");
    assert_eq!(contexts[0].state_type, "tests.reboot.protoc.TransactionCounter");
    assert_eq!(contexts[0].headers.bearer_token.as_deref(), Some("allow"));
    drop(contexts);
    let snapshots = allowed.snapshots.lock().unwrap();
    assert_eq!(proto::TransactionCounter::decode(snapshots[0].0.as_ref().unwrap().as_slice()).unwrap(), proto::TransactionCounter { value: 4 });
    assert_eq!(proto::TransactionIncrementRequest::decode(snapshots[0].1.as_slice()).unwrap(), proto::TransactionIncrementRequest { amount: 0 });
}


#[tokio::test]
async fn generated_registered_root_authorized_entry_rejection_awaits_abort_ack() {
    use reboot::durable_coordinator::ParticipantTarget;
    use crate::FIXTURE_ROOT_AUTH_REJECTION_HITS;
    use proto::transaction_counter_writes_methods_server::TransactionCounterWritesMethods;
    struct Starts(AtomicUsize);
    impl reboot::runtime::RootTransactionStartFactory for Starts {
        fn next_root_transaction(&self) -> Result<reboot::runtime::RootTransactionStart, tonic::Status> {
            Ok(reboot::runtime::RootTransactionStart { transaction_id: Uuid::from_u128(self.0.fetch_add(1, Ordering::SeqCst) as u128), timestamp: prost_types::Timestamp::default() })
        }
    }
    impl reboot::runtime::InboundTransactionStartFactory for Starts {
        fn next_inbound_transaction(&self, _: &reboot::runtime::InboundTransactionContext) -> Result<Uuid, tonic::Status> { panic!("root fixture cannot admit inbound") }
    }
    let trace = Arc::new(std::sync::Mutex::new(Vec::new()));
    let staged = Arc::new(std::sync::Mutex::new(Vec::new()));
    let sidecar = Arc::new(AuthorizationCleanupParticipantSidecar {
        trace: trace.clone(), state: Some(proto::TransactionCounter { value: 4 }),
        staged_states: staged.clone(), idempotent_recovery: Arc::new(std::sync::Mutex::new(VecDeque::new())),
        aborts: std::sync::Mutex::new(Vec::new()), abort_entered: tokio::sync::Semaphore::new(0), abort_release: tokio::sync::Notify::new(),
    });
    let participant = reboot::durable_participant::DurableActorParticipant::new(sidecar.clone(), "tests.reboot.protoc.TransactionCounter", "transaction-counter");
    let coordinator_sidecar = Arc::new(AuthorizationCleanupCoordinatorSidecar { trace: trace.clone(), decisions: std::sync::Mutex::new(Vec::new()) });
    let coordinator = reboot::durable_coordinator::DurableRootCoordinator::new(coordinator_sidecar.clone(), Arc::new(reboot::durable_coordinator::SingleParticipantResolver::new(
        ParticipantTarget { state_type: "tests.reboot.protoc.TransactionCounter".into(), state_ref: "transaction-counter".into() },
        reboot::durable_participant::DurableActorParticipantHost::new(participant.clone()),
    ).unwrap())).with_identity(ParticipantTarget { state_type: "tests.reboot.protoc.TransactionCounter".into(), state_ref: "transaction-counter".into() });
    let owner = reboot::explicit_abort::ExplicitAbortOwner::new(2).unwrap();
    let probe = Arc::new(AuthProbe { verifier_calls: Arc::new(AtomicUsize::new(0)), authorizer_calls: Arc::new(AtomicUsize::new(0)), handler_calls: Arc::new(AtomicUsize::new(0)), decision: AuthorizationDecision::Allow, contexts: Arc::new(std::sync::Mutex::new(Vec::new())), snapshots: Arc::new(std::sync::Mutex::new(Vec::new())) });
    let adapter = transaction_generated::TransactionCounterWritesMethodsTransactionAdapter::new(DatabaseActorStore::connect_lazy("http://127.0.0.1:1").unwrap(), participant.clone(), coordinator.clone(), Starts(AtomicUsize::new(102)), TransactionCounter { fresh_shared_probe: None, trace: trace.clone(), fail: false, downstream: None, final_state_override: None })
        .with_explicit_abort_owner(owner.clone()).with_authorization(AuthorizationPolicy::new(Some(probe.clone()), Some(probe.clone())));
    let plain = adapter.clone();
    let adapter = adapter.with_sequential_root_star();
    let socket = std::net::TcpListener::bind("127.0.0.1:0").unwrap(); let address=socket.local_addr().unwrap(); drop(socket);
    let (stop, stopped)=tokio::sync::oneshot::channel::<()>();
    let mut application = reboot::application_host::ApplicationHost::new("root-authorized-rejection");
    let adapter = application.register_transaction_adapter(adapter).unwrap();
    let starting = adapter.require_local_host_ready().unwrap_err();
    assert_eq!(starting.code(), tonic::Code::Unavailable);
    assert_eq!(starting.message(), "registered host not ready");
    let registration=adapter.explicit_abort_recovery_registration().unwrap(); let served=adapter.clone();
    let server=tokio::spawn(async move { application.with_host_recovery(registration).add_public_service(proto::transaction_counter_writes_methods_server::TransactionCounterWritesMethodsServer::new(served)).serve_with_shutdown(address,async { let _=stopped.await; }).await });
    tokio::time::timeout(std::time::Duration::from_secs(3),async { loop { if tonic::transport::Endpoint::from_shared(format!("http://{address}")).unwrap().connect().await.is_ok() { break; } tokio::task::yield_now().await; } }).await.unwrap();
    tokio::time::timeout(std::time::Duration::from_secs(3), async {
        loop {
            match adapter.require_local_host_ready() {
                Ok(()) => break,
                Err(error) if error.code() == tonic::Code::Unavailable && error.message() == "registered host not ready" => tokio::task::yield_now().await,
                Err(error) => panic!("registration readiness failed: {error}"),
            }
        }
    }).await.unwrap();
    let request = |amount| { let mut headers = reboot::RebootHeaders::new("transaction-counter"); headers.bearer_token = Some("allow".into()); let mut request = tonic::Request::new(proto::TransactionIncrementRequest { amount }); *request.metadata_mut() = headers.to_metadata().unwrap(); request };
    FIXTURE_ROOT_AUTH_REJECTION_HITS.store(0, Ordering::SeqCst);
    let mut rpc = Box::pin(TransactionCounterWritesMethods::increment(&adapter, request(-999)));
    assert!(tokio::time::timeout(std::time::Duration::from_millis(50), &mut rpc).await.is_err());
    tokio::time::timeout(std::time::Duration::from_secs(1), sidecar.abort_entered.acquire()).await.unwrap().unwrap().forget();
    assert_eq!(FIXTURE_ROOT_AUTH_REJECTION_HITS.load(Ordering::SeqCst), 1);
    assert_eq!(probe.authorizer_calls.load(Ordering::SeqCst), 1);
    assert_eq!(*trace.lock().unwrap(), ["participant load", "coordinator DB decision", "participant abort"]);
    assert!(staged.lock().unwrap().is_empty(), "no Prepare/effects");
    let decisions = coordinator_sidecar.decisions.lock().unwrap().clone();
    assert_eq!(decisions.len(), 1);
    assert_eq!(decisions[0].root_transaction_id, Uuid::from_u128(102).as_bytes());
    assert_eq!(decisions[0].decision.as_ref().unwrap().outcome, reboot::database_proto::transaction_coordinator_decision::Outcome::Abort as i32);
    assert_eq!(sidecar.aborts.lock().unwrap().len(), 1);
    let root_context = |id| reboot::runtime::RootTransactionContext::start(reboot::RebootHeaders::new("transaction-counter"), "tests.reboot.protoc.TransactionCounter", reboot::runtime::TransactionMode::Exclusive, Uuid::from_u128(id), prost_types::Timestamp::default()).unwrap();
    let root = root_context(102);
    let duplicate = reboot::explicit_abort::RegisteredRoot::before_load(&participant, root.transaction().clone(), coordinator.clone(), Some(&owner));
    assert!(matches!(duplicate, Err(error) if error.message() == "root execution already registered"));
    let other_root = root_context(104);
    let spare = reboot::explicit_abort::RegisteredRoot::before_load(&participant, other_root.transaction().clone(), coordinator.clone(), Some(&owner)).unwrap();
    let third_root = root_context(105);
    assert!(matches!(reboot::explicit_abort::RegisteredRoot::before_load(&participant, third_root.transaction().clone(), coordinator.clone(), Some(&owner)), Err(error) if error.code() == tonic::Code::ResourceExhausted));
    drop(spare);
    let actor_request = reboot::durable_participant::ActorTransactionStart {
        transaction_ids: vec![Uuid::from_u128(103)], transaction_path: reboot::durable_participant::TransactionPathContract::RootOnly,
        coordinator_state_type: "tests.reboot.protoc.TransactionCounter".into(), coordinator_state_ref: "transaction-counter".into(),
        mode: reboot::runtime::TransactionMode::Exclusive, read_only: false, factory: false,
        state_type: "tests.reboot.protoc.TransactionCounter".into(), state_ref: "transaction-counter".into(),
    };
    match tokio::time::timeout(std::time::Duration::from_millis(30), participant.start_local(actor_request, reboot::durable_participant::ParticipantStartMode::Exclusive)).await {
        Err(_) => {},
        Ok(Err(error)) => panic!("competing exclusive admission rejected before held Abort ACK: {error}"),
        Ok(Ok(guard)) => panic!("competing exclusive admission acquired before held Abort ACK: {:?}", guard.state()),
    }
    assert!(tokio::time::timeout(std::time::Duration::from_millis(30), &mut rpc).await.is_err(), "RPC must wait for participant Abort ACK");
    sidecar.abort_release.notify_one();
    let error = tokio::time::timeout(std::time::Duration::from_secs(2), rpc).await.unwrap().unwrap_err();
    assert_eq!(error.code(), tonic::Code::FailedPrecondition);
    assert_eq!(error.message(), "authorized handler entry binding differs");
    drop(reboot::explicit_abort::RegisteredRoot::before_load(&participant, root.transaction().clone(), coordinator, Some(&owner)).unwrap());
    let result = tokio::time::timeout(std::time::Duration::from_secs(2), TransactionCounterWritesMethods::increment(&adapter, request(7301))).await.unwrap().unwrap();
    assert_eq!(result.into_inner().value, 7305);
    assert_eq!(trace.lock().unwrap().iter().filter(|event| **event == "handler").count(), 1);
    // Registration alone cannot make plain exclusive execution eligible.
    // This separate host intentionally remains Starting and serves no RPCs.
    let mut unstarted_host = reboot::application_host::ApplicationHost::new("registered-plain-exclusive");
    let cross_host = match unstarted_host.register_transaction_adapter(plain.clone()) {
        Err(error) => error,
        Ok(_) => panic!("one participant allocation cannot bind cleanup to two hosts"),
    };
    assert_eq!(cross_host.code(), tonic::Code::FailedPrecondition);
    // The independent plain-exclusive Starting-host contract needs a fresh
    // participant domain, not a second host adopting the first host's guards.
    let fresh_participant = reboot::durable_participant::DurableActorParticipant::new(sidecar.clone(), "tests.reboot.protoc.TransactionCounter", "transaction-counter");
    let fresh_coordinator = reboot::durable_coordinator::DurableRootCoordinator::new(
        Arc::new(AuthorizationCleanupCoordinatorSidecar { trace: trace.clone(), decisions: std::sync::Mutex::new(Vec::new()) }),
        Arc::new(reboot::durable_coordinator::SingleParticipantResolver::new(
            ParticipantTarget { state_type: "tests.reboot.protoc.TransactionCounter".into(), state_ref: "transaction-counter".into() },
            reboot::durable_participant::DurableActorParticipantHost::new(fresh_participant.clone()),
        ).unwrap()),
    );
    let plain = transaction_generated::TransactionCounterWritesMethodsTransactionAdapter::new(
        DatabaseActorStore::connect_lazy("http://127.0.0.1:1").unwrap(), fresh_participant, fresh_coordinator,
        Starts(AtomicUsize::new(1000)),
        TransactionCounter { fresh_shared_probe: None, trace: trace.clone(), fail: false, downstream: None, final_state_override: None },
    ).with_explicit_abort_owner(owner.clone()).with_authorization(AuthorizationPolicy::permissive_for_development());
    let plain = unstarted_host.register_transaction_adapter(plain).unwrap();
    let result = TransactionCounterWritesMethods::increment(&plain, request(7302)).await.unwrap();
    assert_eq!(result.into_inner().value, 7306);
    stop.send(()).unwrap(); server.await.unwrap().unwrap();
    assert!(adapter.require_local_host_ready().is_err(), "shutdown host cannot remain Ready");
    let changed = plain.clone().with_authorization(AuthorizationPolicy::permissive_for_development());
    assert_eq!(changed.require_local_host_ready().unwrap_err().code(), tonic::Code::FailedPrecondition);
}

#[tokio::test]
async fn generated_fresh_exclusive_transaction_authorization_verifies_before_replay_and_aborts_denial() {
    use proto::transaction_counter_writes_methods_server::TransactionCounterWritesMethods;

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
    fn request(token: &str) -> tonic::Request<proto::TransactionIncrementRequest> {
        let mut headers = reboot::RebootHeaders::new("transaction-counter");
        headers.bearer_token = Some(token.into());
        let mut request = tonic::Request::new(proto::TransactionIncrementRequest { amount: 3 });
        *request.metadata_mut() = headers.to_metadata().unwrap();
        request
    }

    let rejected_trace = Arc::new(std::sync::Mutex::new(Vec::new()));
    let rejected = probe(AuthorizationDecision::Allow);
    let rejected_adapter = transaction_adapter(Arc::clone(&rejected_trace), false)
        .with_authorization(policy(Arc::clone(&rejected)));
    assert_eq!(
        TransactionCounterWritesMethods::increment(&rejected_adapter, request("reject"))
            .await
            .unwrap_err()
            .code(),
        tonic::Code::Unauthenticated
    );
    assert_eq!(rejected.verifier_calls.load(Ordering::SeqCst), 1);
    assert_eq!(rejected.authorizer_calls.load(Ordering::SeqCst), 0);
    assert!(rejected_trace.lock().unwrap().is_empty());

    let denied_trace = Arc::new(std::sync::Mutex::new(Vec::new()));
    let denied = probe(AuthorizationDecision::PermissionDenied { message: "denied".into() });
    let denied_adapter = transaction_adapter(Arc::clone(&denied_trace), false)
        .with_authorization(policy(Arc::clone(&denied)));
    assert_eq!(
        TransactionCounterWritesMethods::increment(&denied_adapter, request("allow"))
            .await
            .unwrap_err()
            .code(),
        tonic::Code::PermissionDenied
    );
    assert_eq!(denied.authorizer_calls.load(Ordering::SeqCst), 1);
    assert_eq!(*denied_trace.lock().unwrap(), ["participant load", "participant abort"]);

    let allowed_trace = Arc::new(std::sync::Mutex::new(Vec::new()));
    let allowed = probe(AuthorizationDecision::Allow);
    let allowed_adapter = transaction_adapter(Arc::clone(&allowed_trace), false)
        .with_authorization(policy(Arc::clone(&allowed)));
    assert_eq!(
        TransactionCounterWritesMethods::increment(&allowed_adapter, request("allow"))
            .await
            .unwrap()
            .into_inner()
            .value,
        7
    );
    let contexts = allowed.contexts.lock().unwrap();
    assert_eq!(contexts[0].method, "tests.reboot.protoc.TransactionCounterWritesMethods.Increment");
    assert_eq!(contexts[0].state_type, "tests.reboot.protoc.TransactionCounter");
    assert_eq!(contexts[0].headers.bearer_token.as_deref(), Some("allow"));
    drop(contexts);
    let snapshots = allowed.snapshots.lock().unwrap();
    assert_eq!(proto::TransactionCounter::decode(snapshots[0].0.as_ref().unwrap().as_slice()).unwrap(), proto::TransactionCounter { value: 4 });
    assert_eq!(proto::TransactionIncrementRequest::decode(snapshots[0].1.as_slice()).unwrap(), proto::TransactionIncrementRequest { amount: 3 });
}

#[tokio::test]
async fn generated_fresh_exclusive_factory_transaction_authorization_uses_absent_state_and_tonic_cleanup() {
    use proto::transaction_counter_writes_methods_client::TransactionCounterWritesMethodsClient;

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
    fn request(token: &str) -> tonic::Request<proto::TransactionIncrementRequest> {
        let mut headers = reboot::RebootHeaders::new("transaction-counter");
        headers.bearer_token = Some(token.into());
        let mut request = tonic::Request::new(proto::TransactionIncrementRequest { amount: 3 });
        *request.metadata_mut() = headers.to_metadata().unwrap();
        request
    }

    let rejected_trace = Arc::new(std::sync::Mutex::new(Vec::new()));
    let rejected = probe(AuthorizationDecision::Allow);
    let adapter = factory_transaction_adapter(
        Arc::clone(&rejected_trace), None, Arc::new(std::sync::Mutex::new(Vec::new())), false, None,
    )
    .with_authorization(AuthorizationPolicy::new(Some(rejected.clone()), Some(rejected.clone())));
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    let server = tokio::spawn(async move {
        tonic::transport::Server::builder()
            .add_service(proto::transaction_counter_writes_methods_server::TransactionCounterWritesMethodsServer::new(adapter))
            .serve_with_incoming(tokio_stream::wrappers::TcpListenerStream::new(listener))
            .await
            .unwrap();
    });
    let mut client = TransactionCounterWritesMethodsClient::connect(format!("http://{address}")).await.unwrap();
    assert_eq!(client.factory_increment(request("reject")).await.unwrap_err().code(), tonic::Code::Unauthenticated);
    assert_eq!(rejected.verifier_calls.load(Ordering::SeqCst), 1);
    assert_eq!(rejected.authorizer_calls.load(Ordering::SeqCst), 0);
    assert!(rejected_trace.lock().unwrap().is_empty());
    server.abort();

    let denied_trace = Arc::new(std::sync::Mutex::new(Vec::new()));
    let denied = probe(AuthorizationDecision::PermissionDenied { message: "denied".into() });
    let adapter = factory_transaction_adapter(
        Arc::clone(&denied_trace), None, Arc::new(std::sync::Mutex::new(Vec::new())), false, None,
    )
    .with_authorization(AuthorizationPolicy::new(Some(denied.clone()), Some(denied.clone())));
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    let server = tokio::spawn(async move {
        tonic::transport::Server::builder()
            .add_service(proto::transaction_counter_writes_methods_server::TransactionCounterWritesMethodsServer::new(adapter))
            .serve_with_incoming(tokio_stream::wrappers::TcpListenerStream::new(listener))
            .await
            .unwrap();
    });
    let mut client = TransactionCounterWritesMethodsClient::connect(format!("http://{address}")).await.unwrap();
    assert_eq!(client.factory_increment(request("allow")).await.unwrap_err().code(), tonic::Code::PermissionDenied);
    assert_eq!(*denied_trace.lock().unwrap(), ["participant load", "participant abort"]);
    assert_eq!(denied.snapshots.lock().unwrap()[0].0, None);
    server.abort();

    let allowed_trace = Arc::new(std::sync::Mutex::new(Vec::new()));
    let allowed = probe(AuthorizationDecision::Allow);
    let adapter = factory_transaction_adapter(
        Arc::clone(&allowed_trace), None, Arc::new(std::sync::Mutex::new(Vec::new())), false, None,
    )
    .with_authorization(AuthorizationPolicy::new(Some(allowed.clone()), Some(allowed.clone())));
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    let server = tokio::spawn(async move {
        tonic::transport::Server::builder()
            .add_service(proto::transaction_counter_writes_methods_server::TransactionCounterWritesMethodsServer::new(adapter))
            .serve_with_incoming(tokio_stream::wrappers::TcpListenerStream::new(listener))
            .await
            .unwrap();
    });
    let mut client = TransactionCounterWritesMethodsClient::connect(format!("http://{address}")).await.unwrap();
    let mut declared = request("allow");
    declared.get_mut().amount = 13;
    let rich_error = client.factory_increment(declared).await.unwrap_err();
    assert_eq!(rich_error.code(), tonic::Code::Unknown);
    let details = reboot::declared_error_details(&rich_error).unwrap().unwrap();
    assert_eq!(details.details[0].type_url, "type.googleapis.com/tests.reboot.protoc.TransactionLimitExceeded");
    assert!(!allowed_trace.lock().unwrap().iter().any(|event| event.contains("prepare")), "declared factory failure must not create or prepare a durable actor");
    assert_eq!(client.factory_increment(request("allow")).await.unwrap().into_inner().value, 3);
    assert_eq!(allowed.contexts.lock().unwrap()[0].method, "tests.reboot.protoc.TransactionCounterWritesMethods.FactoryIncrement");
    assert_eq!(allowed.contexts.lock().unwrap()[0].headers.bearer_token.as_deref(), Some("allow"));
    let snapshots = allowed.snapshots.lock().unwrap();
    assert_eq!(snapshots[0].0, None);
    assert_eq!(
        proto::TransactionIncrementRequest::decode(snapshots[0].1.as_slice()).unwrap(),
        proto::TransactionIncrementRequest { amount: 13 }
    );
    assert_eq!(snapshots[1].0, None);
    assert_eq!(
        proto::TransactionIncrementRequest::decode(snapshots[1].1.as_slice()).unwrap(),
        proto::TransactionIncrementRequest { amount: 3 }
    );
    drop(snapshots);
    assert_eq!(*allowed_trace.lock().unwrap(), [
        "participant load", "factory handler", "participant abort", "participant load", "factory handler", "coordinator DB prepare", "participant prepare",
        "coordinator DB prepared", "coordinator DB decision", "participant commit", "coordinator DB cleanup",
    ]);
    server.abort();
}


#[tokio::test]
async fn generated_factory_authorization_cancellation_releases_pre_handler_incarnation() {
    use proto::transaction_counter_writes_methods_server::TransactionCounterWritesMethods;
    struct ParkFirst(AtomicUsize);
    impl reboot::auth::Authorizer for ParkFirst {
        fn authorize<'a>(&'a self, _: &'a reboot::auth::AuthorizationContext, _: Option<&'a reboot::auth::Auth>, _: Option<&'a [u8]>, _: &'a [u8]) -> reboot::auth::AuthorizeFuture<'a> {
            Box::pin(async move {
                if self.0.fetch_add(1, Ordering::SeqCst) == 0 { std::future::pending::<()>().await; }
                AuthorizationDecision::Allow
            })
        }
    }
    fn request() -> tonic::Request<proto::TransactionIncrementRequest> {
        let mut request = tonic::Request::new(proto::TransactionIncrementRequest { amount: 3 });
        let mut headers = reboot::RebootHeaders::new("transaction-counter");
        headers.idempotency_key = Some(Uuid::from_u128(407));
        *request.metadata_mut() = headers.to_metadata().unwrap();
        request
    }
    let policy = Arc::new(ParkFirst(AtomicUsize::new(0)));
    let trace = Arc::new(std::sync::Mutex::new(Vec::new()));
    let adapter = factory_transaction_adapter(Arc::clone(&trace), None, Arc::new(std::sync::Mutex::new(Vec::new())), false, None)
        .with_authorization(AuthorizationPolicy::new(None, Some(policy.clone())));
    assert!(tokio::time::timeout(std::time::Duration::from_millis(50), TransactionCounterWritesMethods::factory_increment(&adapter, request())).await.is_err());
    assert_eq!(policy.0.load(Ordering::SeqCst), 1, "actual policy await must have been polled");
    assert_eq!(*trace.lock().unwrap(), ["participant load"], "no handler or durable RPC before cancellation");
    let reply = tokio::time::timeout(std::time::Duration::from_secs(2), TransactionCounterWritesMethods::factory_increment(&adapter, request())).await.expect("cancelled pre-handler factory must release actor admission").unwrap();
    assert_eq!(reply.into_inner().value, 3);
    assert_eq!(policy.0.load(Ordering::SeqCst), 2);
    assert_eq!(trace.lock().unwrap().iter().filter(|event| **event == "factory handler").count(), 1);
}

#[tokio::test]
async fn generated_cached_factory_recovery_cancellation_releases_pre_handler_incarnation() {
    use proto::transaction_counter_writes_methods_server::TransactionCounterWritesMethods;
    let key = Uuid::from_u128(408);
    let recovery = reboot::database_proto::RecoverIdempotentMutationsResponse {
        idempotent_mutations: vec![reboot::database_proto::IdempotentMutation {
            state_type: "tests.reboot.protoc.TransactionCounter".into(), state_ref: "transaction-counter".into(),
            key: key.as_bytes().to_vec(), response: proto::TransactionCounterValue { value: 99 }.encode_to_vec(),
            request_fingerprint: Some(reboot::runtime::request_fingerprint("tests.reboot.protoc.TransactionCounterWritesMethods.FactoryIncrement", &proto::TransactionIncrementRequest { amount: 3 })),
            ..Default::default()
        }],
    };
    let recoveries = Arc::new(std::sync::Mutex::new(VecDeque::from([
        Err(tonic::Status::cancelled("fixture park receipt lookup")), Ok(vec![recovery]),
    ])));
    let trace = Arc::new(std::sync::Mutex::new(Vec::new()));
    let adapter = transaction_adapter_with_idempotent_recovery(Arc::clone(&trace), false, Arc::clone(&recoveries));
    let request = || {
        let mut headers = reboot::RebootHeaders::new("transaction-counter"); headers.idempotency_key = Some(key);
        let mut request = tonic::Request::new(proto::TransactionIncrementRequest { amount: 3 });
        *request.metadata_mut() = headers.to_metadata().unwrap(); request
    };
    assert!(tokio::time::timeout(std::time::Duration::from_millis(50), TransactionCounterWritesMethods::factory_increment(&adapter, request())).await.is_err());
    assert_eq!(*trace.lock().unwrap(), ["participant load", "participant recovery parked"]);
    assert_eq!(recoveries.lock().unwrap().len(), 1);
    let reply = tokio::time::timeout(std::time::Duration::from_secs(2), TransactionCounterWritesMethods::factory_increment(&adapter, request())).await.expect("cancelled cached-factory admission must release").unwrap();
    assert_eq!(reply.into_inner().value, 99);
    assert_eq!(*trace.lock().unwrap(), ["participant load", "participant recovery parked", "participant load", "participant abort"]);
}

#[tokio::test]
async fn generated_factory_handler_cancellation_retains_legacy_ownership() {
    use proto::transaction_counter_writes_methods_server::TransactionCounterWritesMethods;
    let trace = Arc::new(std::sync::Mutex::new(Vec::new()));
    let adapter = factory_transaction_adapter(Arc::clone(&trace), None, Arc::new(std::sync::Mutex::new(Vec::new())), false, None);
    let request = |amount| {
        let mut request = tonic::Request::new(proto::TransactionIncrementRequest { amount });
        *request.metadata_mut() = reboot::RebootHeaders::new("transaction-counter").to_metadata().unwrap(); request
    };
    assert!(tokio::time::timeout(std::time::Duration::from_millis(50), TransactionCounterWritesMethods::factory_increment(&adapter, request(-808))).await.is_err());
    assert_eq!(*trace.lock().unwrap(), ["participant load", "factory handler"]);
    assert!(tokio::time::timeout(std::time::Duration::from_millis(100), TransactionCounterWritesMethods::factory_increment(&adapter, request(3))).await.is_err(), "handler cancellation must not reopen unresolved legacy effects");
    assert_eq!(*trace.lock().unwrap(), ["participant load", "factory handler"]);
}

#[tokio::test]
async fn generated_fresh_non_factory_exclusive_transaction_replay_requires_current_authorization_and_admission() {
    use proto::transaction_counter_writes_methods_server::TransactionCounterWritesMethods;

    fn probe() -> Arc<AuthProbe> {
        Arc::new(AuthProbe {
            verifier_calls: Arc::new(AtomicUsize::new(0)),
            authorizer_calls: Arc::new(AtomicUsize::new(0)),
            handler_calls: Arc::new(AtomicUsize::new(0)),
            decision: AuthorizationDecision::Allow,
            contexts: Arc::new(std::sync::Mutex::new(Vec::new())),
            snapshots: Arc::new(std::sync::Mutex::new(Vec::new())),
        })
    }
    fn recovery(key: Uuid) -> reboot::database_proto::RecoverIdempotentMutationsResponse {
        reboot::database_proto::RecoverIdempotentMutationsResponse {
            idempotent_mutations: vec![reboot::database_proto::IdempotentMutation {
                state_type: "tests.reboot.protoc.TransactionCounter".into(),
                state_ref: "transaction-counter".into(),
                key: key.as_bytes().to_vec(),
                response: proto::TransactionCounterValue { value: 99 }.encode_to_vec(),
                request_fingerprint: Some(reboot::runtime::request_fingerprint(
                    "tests.reboot.protoc.TransactionCounterWritesMethods.Increment",
                    &proto::TransactionIncrementRequest { amount: 3 },
                )),
                ..Default::default()
            }],
        }
    }
    fn request(token: &str, key: Uuid) -> tonic::Request<proto::TransactionIncrementRequest> {
        let mut headers = reboot::RebootHeaders::new("transaction-counter");
        headers.bearer_token = Some(token.into());
        headers.idempotency_key = Some(key);
        let mut request = tonic::Request::new(proto::TransactionIncrementRequest { amount: 3 });
        *request.metadata_mut() = headers.to_metadata().unwrap();
        request
    }

    let key = Uuid::from_u128(403);
    let rejected_recovery = Arc::new(std::sync::Mutex::new(VecDeque::from([Ok(vec![recovery(key)])])));
    let rejected_trace = Arc::new(std::sync::Mutex::new(Vec::new()));
    let rejected = probe();
    let rejected_adapter = transaction_adapter_with_idempotent_recovery(
        Arc::clone(&rejected_trace),
        false,
        Arc::clone(&rejected_recovery),
    )
    .with_authorization(AuthorizationPolicy::new(Some(rejected.clone()), Some(rejected.clone())));
    assert_eq!(
        TransactionCounterWritesMethods::increment(&rejected_adapter, request("reject", key))
            .await
            .unwrap_err()
            .code(),
        tonic::Code::Unauthenticated
    );
    assert_eq!(rejected.verifier_calls.load(Ordering::SeqCst), 1);
    assert_eq!(rejected.authorizer_calls.load(Ordering::SeqCst), 0);
    assert_eq!(rejected_recovery.lock().unwrap().len(), 1, "verification must precede recovery");
    assert!(rejected_trace.lock().unwrap().is_empty());

    let replay_recovery = Arc::new(std::sync::Mutex::new(VecDeque::from([Ok(vec![recovery(key)])])));
    let replay_trace = Arc::new(std::sync::Mutex::new(Vec::new()));
    let replay = probe();
    let replay_adapter = transaction_adapter_with_idempotent_recovery(
        Arc::clone(&replay_trace),
        false,
        Arc::clone(&replay_recovery),
    )
    .with_authorization(AuthorizationPolicy::new(Some(replay.clone()), Some(replay.clone())));
    assert_eq!(
        TransactionCounterWritesMethods::increment(&replay_adapter, request("allow", key))
            .await
            .unwrap()
            .into_inner()
            .value,
        99
    );
    let denied_recovery = Arc::new(std::sync::Mutex::new(VecDeque::from([Ok(vec![recovery(key)])])));
    let denied_trace = Arc::new(std::sync::Mutex::new(Vec::new()));
    let mut denied_probe = Arc::try_unwrap(probe()).ok().unwrap();
    denied_probe.decision = AuthorizationDecision::PermissionDenied { message: "revoked".into() };
    let denied = Arc::new(denied_probe);
    let denied_adapter = transaction_adapter_with_idempotent_recovery(Arc::clone(&denied_trace), false, Arc::clone(&denied_recovery))
        .with_authorization(AuthorizationPolicy::new(Some(denied.clone()), Some(denied.clone())));
    assert_eq!(TransactionCounterWritesMethods::increment(&denied_adapter, request("allow", key)).await.unwrap_err().code(), tonic::Code::PermissionDenied);
    assert_eq!(denied.authorizer_calls.load(Ordering::SeqCst), 1);
    assert_eq!(denied_recovery.lock().unwrap().len(), 1, "denial must precede receipt lookup");
    assert_eq!(*denied_trace.lock().unwrap(), ["participant load", "participant abort"]);
    // The allowed retry below must inspect loaded state, never cached response bytes.
    assert_eq!(replay.verifier_calls.load(Ordering::SeqCst), 1);
    assert_eq!(replay.authorizer_calls.load(Ordering::SeqCst), 1);
    assert_eq!(replay.snapshots.lock().unwrap()[0].0, Some(proto::TransactionCounter { value: 4 }.encode_to_vec()));
    assert_eq!(replay.handler_calls.load(Ordering::SeqCst), 0);
    assert!(replay_recovery.lock().unwrap().is_empty(), "matching durable replay must be consumed");
    assert_eq!(*replay_trace.lock().unwrap(), ["participant load", "participant abort"], "replay must release only the newly admitted local participant");
}

struct AdmissionMustNotResolve;

#[tonic::async_trait]
impl reboot::runtime::TransactionalChannelResolver for AdmissionMustNotResolve {
    async fn resolve(&self, _: &str, _: &str) -> Result<tonic::transport::Channel, tonic::Status> {
        panic!("admission rejection must precede channel resolution");
    }
}

#[tokio::test]
async fn generated_admission_observer_preserves_raw_and_declared_status_and_doom() {
    fn context() -> reboot::runtime::TransactionContext {
        let mut headers = reboot::RebootHeaders::new("transaction-counter");
        headers.transaction_ids = Some(vec![Uuid::from_u128(710)]);
        headers.transaction_coordinator_state_type = Some("tests.reboot.protoc.TransactionCounter".into());
        headers.transaction_coordinator_state_ref = Some("root".into());
        reboot::runtime::TransactionContext::from_headers(headers, reboot::runtime::TransactionMode::Exclusive).unwrap()
    }
    fn same_status(actual: &tonic::Status, expected: &tonic::Status) {
        assert_eq!(actual.code(), expected.code());
        assert_eq!(actual.message(), expected.message());
        assert_eq!(actual.details(), expected.details());
        assert_eq!(actual.metadata().clone().into_headers(), expected.metadata().clone().into_headers());
    }
    let client = transaction_generated::TransactionCounterWritesMethodsClient::new(AdmissionMustNotResolve);
    let empty = transaction_generated::TransactionCounterWritesMethodsTarget::new("");
    let raw_context = context();
    let raw = client.query(&raw_context, &empty, proto::TransactionIncrementRequest { amount: 0 }).await.unwrap_err();
    same_status(&raw, &tonic::Status::invalid_argument("outbound target/method must not be empty"));
    same_status(&raw_context.doomed_status().unwrap(), &raw);
    let declared_context = context();
    let declared = client.increment(&declared_context, &empty, proto::TransactionIncrementRequest { amount: 0 }).await.unwrap_err();
    let transaction_generated::TransactionCounterWritesMethodsIncrementError::Grpc(status) = declared else { panic!("admission errors must remain Grpc, not declared errors"); };
    same_status(&status, &raw);
    same_status(&declared_context.doomed_status().unwrap(), &status);

    // A previously doomed context must retain rich protobuf details and metadata
    // unchanged. Admission must not classify even valid declared details.
    let mut rich = reboot::declared_error_status(tonic::Code::Unknown, "sticky rich doom", "type.googleapis.com/tests.reboot.protoc.TransactionLimitExceeded", &proto::TransactionLimitExceeded { limit: 713 });
    rich.metadata_mut().insert("x-admission-proof", "retained".parse().unwrap());
    let target = transaction_generated::TransactionCounterWritesMethodsTarget::new("remote-transaction-counter");
    for declared in [false, true] {
        let context = context();
        context.doom(rich.clone());
        let request = proto::TransactionIncrementRequest { amount: 0 };
        let status = if declared {
            let error = client.factory_increment(&context, &target, request).await.unwrap_err();
            let transaction_generated::TransactionCounterWritesMethodsFactoryIncrementError::Grpc(status) = error else { panic!("sticky admission doom must remain Grpc"); };
            status
        } else {
            client.apply(&context, &target, request).await.unwrap_err()
        };
        same_status(&status, &rich);
        same_status(&context.doomed_status().unwrap(), &rich);
    }
}

#[tokio::test]
async fn generated_typed_transaction_hook_classifies_legacy_declared_and_rejects_malformed() {
    use transaction_generated::TransactionCounterWritesMethodsTransactionHandler;
    let handler = TransactionCounter { fresh_shared_probe: None, trace: Arc::new(std::sync::Mutex::new(Vec::new())), fail: false, downstream: None, final_state_override: None };
    let mut headers = reboot::RebootHeaders::new("transaction-counter");
    headers.transaction_ids = Some(vec![Uuid::new_v4()]);
    headers.transaction_coordinator_state_type = Some("tests.reboot.protoc.TransactionCounter".into());
    headers.transaction_coordinator_state_ref = Some("root".into());
    let context = reboot::runtime::TransactionContext::from_headers(headers, reboot::runtime::TransactionMode::Exclusive).unwrap();
    let mut state = proto::TransactionCounter { value: 20 };
    let error = handler.increment_typed_transaction_result(&context, &mut state, proto::TransactionIncrementRequest { amount: 4242 }).await.unwrap_err();
    assert!(matches!(error, transaction_generated::TransactionCounterWritesMethodsIncrementError::TransactionLimitExceeded(ref error) if error.limit == 4242));
    assert_eq!(state.value, 1020); // still private; adapter owns rollback, not this classifier
    assert!(matches!(handler.increment_typed_transaction_result(&context, &mut state, proto::TransactionIncrementRequest { amount: 4243 }).await.unwrap_err(), transaction_generated::TransactionCounterWritesMethodsIncrementError::Grpc(_)));
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
        &factory_transaction_adapter(Arc::clone(&trace), None, Arc::clone(&staged_states), false, None),
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
        &factory_transaction_adapter(Arc::clone(&trace), None, Arc::clone(&staged_states), false, None),
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
            None,
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
        &factory_transaction_adapter(Arc::clone(&trace), None, Arc::clone(&staged_states), true, None),
        request,
    )
    .await
    .unwrap_err();
    assert_eq!(error.code(), tonic::Code::InvalidArgument);
    assert!(staged_states.lock().unwrap().is_empty(), "aborted factory must not prepare state");
    assert_eq!(*trace.lock().unwrap(), ["participant load", "factory handler", "participant abort"]);
}

#[tokio::test]
async fn generated_tonic_fresh_exclusive_stages_handler_mutation_by_default_and_honors_override() {
    use proto::transaction_counter_writes_methods_server::TransactionCounterWritesMethodsServer;

    for (override_value, expected_state) in [(None, 7), (Some(99), 99)] {
        let trace = Arc::new(std::sync::Mutex::new(Vec::new()));
        let staged_states = Arc::new(std::sync::Mutex::new(Vec::new()));
        let adapter = factory_transaction_adapter(
            Arc::clone(&trace),
            Some(proto::TransactionCounter { value: 4 }),
            Arc::clone(&staged_states),
            false,
            override_value,
        );
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let server = tokio::spawn(async move {
            tonic::transport::Server::builder()
                .add_service(TransactionCounterWritesMethodsServer::new(adapter))
                .serve_with_incoming(tokio_stream::wrappers::TcpListenerStream::new(listener))
                .await
                .unwrap();
        });
        let mut client = proto::transaction_counter_writes_methods_client::TransactionCounterWritesMethodsClient::connect(format!("http://{address}")).await.unwrap();
        let mut request = tonic::Request::new(proto::TransactionIncrementRequest { amount: 3 });
        *request.metadata_mut() = reboot::RebootHeaders::new("transaction-counter")
            .to_metadata()
            .unwrap();
        assert_eq!(client.increment(request).await.unwrap().into_inner().value, 7);
        assert_eq!(
            proto::TransactionCounter::decode(staged_states.lock().unwrap()[0].as_deref().unwrap()).unwrap(),
            proto::TransactionCounter { value: expected_state },
        );
        server.abort();
    }
}

#[tokio::test]
async fn generated_retained_sibling_authorization_preserves_n1_for_n3_and_one_watch() {
    use proto::transaction_counter_writes_methods_server::TransactionCounterWritesMethods;
    use reboot::durable_coordinator::{ParticipantTarget, ParticipantEndpoint, InProcessParticipantEndpoint};
    struct Starts(AtomicUsize);
    impl reboot::runtime::RootTransactionStartFactory for Starts {
        fn next_root_transaction(&self) -> Result<reboot::runtime::RootTransactionStart, tonic::Status> { panic!("inbound only") }
    }
    impl reboot::runtime::InboundTransactionStartFactory for Starts {
        fn next_inbound_transaction(&self, inbound: &reboot::runtime::InboundTransactionContext) -> Result<Uuid, tonic::Status> {
            assert_eq!(inbound.transaction().transaction_root_id(), Uuid::from_u128(201));
            Ok(Uuid::from_u128(self.0.fetch_add(1, Ordering::SeqCst) as u128))
        }
    }
    struct Watch { count: AtomicUsize, release: tokio::sync::Notify }
    impl reboot::legacy_coordinator::CoordinatorWatchEndpoint for Watch {
        fn watch(&self, _: reboot::database_proto::WatchRequest) -> reboot::legacy_coordinator::CoordinatorWatchFuture<'_, reboot::database_proto::WatchResponse> {
            Box::pin(async move { self.count.fetch_add(1, Ordering::SeqCst); self.release.notified().await; Ok(reboot::database_proto::WatchResponse { aborted: false }) })
        }
    }
    struct Policy { park: bool, states: std::sync::Mutex<Vec<i64>> }
    impl Authorizer for Policy {
        fn authorize<'a>(&'a self, _: &'a AuthorizationContext, _: Option<&'a Auth>, state: Option<&'a [u8]>, request: &'a [u8]) -> reboot::auth::AuthorizeFuture<'a> {
            let amount = proto::TransactionIncrementRequest::decode(request).unwrap().amount;
            self.states.lock().unwrap().push(proto::TransactionCounter::decode(state.unwrap()).unwrap().value);
            Box::pin(async move { if amount == 11 { if self.park { std::future::pending::<()>().await; } AuthorizationDecision::PermissionDenied { message: "retained denied".into() } } else { AuthorizationDecision::Allow } })
        }
    }
    fn request(amount: i64) -> tonic::Request<proto::TransactionIncrementRequest> {
        let mut headers = reboot::RebootHeaders::new("transaction-counter");
        headers.transaction_ids = Some(vec![Uuid::from_u128(201)]);
        headers.transaction_coordinator_state_type = Some("tests.reboot.protoc.Root".into());
        headers.transaction_coordinator_state_ref = Some("root-counter".into());
        let mut r=tonic::Request::new(proto::TransactionIncrementRequest { amount }); *r.metadata_mut()=headers.to_metadata().unwrap(); r
    }
    for park in [false, true] {
        let trace = Arc::new(std::sync::Mutex::new(Vec::new()));
        let staged = Arc::new(std::sync::Mutex::new(Vec::new()));
        let participant = reboot::durable_participant::DurableActorParticipant::new(Arc::new(AuthorizationCleanupParticipantSidecar { trace:trace.clone(), state:Some(proto::TransactionCounter { value:4 }), staged_states:staged.clone(), idempotent_recovery:Arc::new(std::sync::Mutex::new(VecDeque::new())), aborts:std::sync::Mutex::new(Vec::new()), abort_entered:tokio::sync::Semaphore::new(0), abort_release:tokio::sync::Notify::new() }), "tests.reboot.protoc.TransactionCounter", "transaction-counter");
        let host = reboot::durable_participant::DurableActorParticipantHost::new(participant.clone());
        let coordinator = reboot::durable_coordinator::DurableRootCoordinator::new(Arc::new(TransactionCoordinatorSidecar { trace:trace.clone() }), Arc::new(reboot::durable_coordinator::SingleParticipantResolver::new(ParticipantTarget { state_type:"tests.reboot.protoc.TransactionCounter".into(), state_ref:"transaction-counter".into() },reboot::durable_participant::DurableActorParticipantHost::new(participant.clone())).unwrap()));
        let watch=Arc::new(Watch { count:AtomicUsize::new(0), release:tokio::sync::Notify::new() });
        let owner=reboot::live_participant::LiveParticipantOwner::new(2,ParticipantTarget { state_type:"tests.reboot.protoc.Root".into(),state_ref:"root-counter".into() },watch.clone()).unwrap();
        let policy=Arc::new(Policy { park, states:std::sync::Mutex::new(Vec::new()) });
        let adapter=transaction_generated::TransactionCounterWritesMethodsTransactionAdapter::new(DatabaseActorStore::connect_lazy("http://127.0.0.1:1").unwrap(),participant,coordinator,Starts(AtomicUsize::new(202)),TransactionCounter { fresh_shared_probe: None, trace:trace.clone(),fail:false,downstream:None,final_state_override:None }).with_sequential_reusable_participants().with_live_participant_owner(owner).with_authorization(AuthorizationPolicy::new(None,Some(policy.clone())));
        let socket=std::net::TcpListener::bind("127.0.0.1:0").unwrap();let address=socket.local_addr().unwrap();drop(socket);
        let (stop, stopped)=tokio::sync::oneshot::channel::<()>();
        let mut application = reboot::application_host::ApplicationHost::new("retained-preguard");
        let adapter = application.register_transaction_adapter(adapter).unwrap();
        let registration=adapter.live_participant_recovery_registration().unwrap();let served=adapter.clone();
        let server=tokio::spawn(async move { application.with_host_recovery(registration).add_public_service(proto::transaction_counter_writes_methods_server::TransactionCounterWritesMethodsServer::new(served)).serve_with_shutdown(address,async { let _=stopped.await; }).await });
        tokio::time::timeout(std::time::Duration::from_secs(3),async { loop { if tonic::transport::Endpoint::from_shared(format!("http://{address}")).unwrap().connect().await.is_ok() { break; } tokio::task::yield_now().await; } }).await.unwrap();
        tokio::time::timeout(std::time::Duration::from_secs(3), async {
            loop {
                match adapter.require_local_host_ready() {
                    Ok(()) => break,
                    Err(error) if error.code() == tonic::Code::Unavailable && error.message() == "registered host not ready" => tokio::task::yield_now().await,
                    Err(error) => panic!("registration readiness failed: {error}"),
                }
            }
        }).await.unwrap();
        assert_eq!(TransactionCounterWritesMethods::increment(&adapter,request(7301)).await.unwrap().into_inner().value,7305);
        tokio::time::timeout(std::time::Duration::from_secs(2),async { while watch.count.load(Ordering::SeqCst)==0 { tokio::task::yield_now().await; } }).await.unwrap();
        let n2=tokio::time::timeout(std::time::Duration::from_millis(50),TransactionCounterWritesMethods::increment(&adapter,request(11))).await;
        if park { assert!(n2.is_err()); } else { assert_eq!(n2.unwrap().unwrap_err().code(),tonic::Code::PermissionDenied); }
        tokio::task::yield_now().await;
        assert_eq!(*trace.lock().unwrap(),["participant load","handler"]);
        assert_eq!(TransactionCounterWritesMethods::increment(&adapter,request(7303)).await.unwrap().into_inner().value,14608);
        assert_eq!(*policy.states.lock().unwrap(),[4,7305,7305]);
        assert_eq!(watch.count.load(Ordering::SeqCst),1);
        assert_eq!(*trace.lock().unwrap(),["participant load","handler","handler"]);
        InProcessParticipantEndpoint::new(host).prepare("transaction-counter",reboot::database_proto::PrepareRequest { transaction_id:Uuid::from_u128(201).as_bytes().to_vec(),..Default::default() }).await.unwrap();
        assert_eq!(staged.lock().unwrap().len(),1);
        assert_eq!(proto::TransactionCounter::decode(staged.lock().unwrap()[0].as_deref().unwrap()).unwrap().value,14608);
        watch.release.notify_one();
        tokio::time::timeout(std::time::Duration::from_secs(2),async { while !trace.lock().unwrap().contains(&"participant commit") { tokio::task::yield_now().await; } }).await.unwrap();
        assert!(!trace.lock().unwrap().contains(&"participant abort"));
        assert_eq!(watch.count.load(Ordering::SeqCst),1);
        stop.send(()).unwrap();server.await.unwrap().unwrap();
    }
}

#[tokio::test]
async fn generated_authorized_entry_rejection_transfers_watch_and_preserves_retained_siblings() {
    use proto::transaction_counter_writes_methods_server::TransactionCounterWritesMethods;
    use reboot::durable_coordinator::{ParticipantTarget, ParticipantEndpoint, InProcessParticipantEndpoint};
    struct Starts(AtomicUsize);
    impl reboot::runtime::RootTransactionStartFactory for Starts {
        fn next_root_transaction(&self) -> Result<reboot::runtime::RootTransactionStart, tonic::Status> { panic!("inbound only") }
    }
    impl reboot::runtime::InboundTransactionStartFactory for Starts {
        fn next_inbound_transaction(&self, inbound: &reboot::runtime::InboundTransactionContext) -> Result<Uuid, tonic::Status> {
            assert_eq!(inbound.transaction().transaction_root_id(), Uuid::from_u128(201));
            Ok(Uuid::from_u128(self.0.fetch_add(1, Ordering::SeqCst) as u128))
        }
    }
    struct Watch { count: AtomicUsize, release: tokio::sync::Notify }
    impl reboot::legacy_coordinator::CoordinatorWatchEndpoint for Watch {
        fn watch(&self, _: reboot::database_proto::WatchRequest) -> reboot::legacy_coordinator::CoordinatorWatchFuture<'_, reboot::database_proto::WatchResponse> {
            Box::pin(async move { self.count.fetch_add(1, Ordering::SeqCst); self.release.notified().await; Ok(reboot::database_proto::WatchResponse { aborted: false }) })
        }
    }
    struct Policy { park: bool, states: std::sync::Mutex<Vec<i64>> }
    impl Authorizer for Policy {
        fn authorize<'a>(&'a self, _: &'a AuthorizationContext, _: Option<&'a Auth>, state: Option<&'a [u8]>, request: &'a [u8]) -> reboot::auth::AuthorizeFuture<'a> {
            let amount = proto::TransactionIncrementRequest::decode(request).unwrap().amount;
            self.states.lock().unwrap().push(proto::TransactionCounter::decode(state.unwrap()).unwrap().value);
            Box::pin(async move { if amount == 11 { if self.park { std::future::pending::<()>().await; } AuthorizationDecision::PermissionDenied { message: "retained denied".into() } } else { AuthorizationDecision::Allow } })
        }
    }
    fn request(amount: i64) -> tonic::Request<proto::TransactionIncrementRequest> {
        let mut headers = reboot::RebootHeaders::new("transaction-counter");
        headers.transaction_ids = Some(vec![Uuid::from_u128(201)]);
        headers.transaction_coordinator_state_type = Some("tests.reboot.protoc.Root".into());
        headers.transaction_coordinator_state_ref = Some("root-counter".into());
        let mut r=tonic::Request::new(proto::TransactionIncrementRequest { amount }); *r.metadata_mut()=headers.to_metadata().unwrap(); r
    }
    for park in [false] {
        let trace = Arc::new(std::sync::Mutex::new(Vec::new()));
        let staged = Arc::new(std::sync::Mutex::new(Vec::new()));
        let participant = reboot::durable_participant::DurableActorParticipant::new(Arc::new(TransactionParticipantSidecar { trace:trace.clone(), state:Some(proto::TransactionCounter { value:4 }), staged_states:staged.clone(), idempotent_recovery:Arc::new(std::sync::Mutex::new(VecDeque::new())) }), "tests.reboot.protoc.TransactionCounter", "transaction-counter");
        let host = reboot::durable_participant::DurableActorParticipantHost::new(participant.clone());
        let coordinator = reboot::durable_coordinator::DurableRootCoordinator::new(Arc::new(TransactionCoordinatorSidecar { trace:trace.clone() }), Arc::new(reboot::durable_coordinator::SingleParticipantResolver::new(ParticipantTarget { state_type:"tests.reboot.protoc.TransactionCounter".into(), state_ref:"transaction-counter".into() },reboot::durable_participant::DurableActorParticipantHost::new(participant.clone())).unwrap()));
        let watch=Arc::new(Watch { count:AtomicUsize::new(0), release:tokio::sync::Notify::new() });
        let owner=reboot::live_participant::LiveParticipantOwner::new(2,ParticipantTarget { state_type:"tests.reboot.protoc.Root".into(),state_ref:"root-counter".into() },watch.clone()).unwrap();
        let policy=Arc::new(Policy { park, states:std::sync::Mutex::new(Vec::new()) });
        let adapter=transaction_generated::TransactionCounterWritesMethodsTransactionAdapter::new(DatabaseActorStore::connect_lazy("http://127.0.0.1:1").unwrap(),participant,coordinator,Starts(AtomicUsize::new(202)),TransactionCounter { fresh_shared_probe: None, trace:trace.clone(),fail:false,downstream:None,final_state_override:None }).with_sequential_reusable_participants().with_live_participant_owner(owner).with_authorization(AuthorizationPolicy::new(None,Some(policy.clone())));
        let socket=std::net::TcpListener::bind("127.0.0.1:0").unwrap();let address=socket.local_addr().unwrap();drop(socket);
        let (stop, stopped)=tokio::sync::oneshot::channel::<()>();
        let registration=adapter.live_participant_recovery_registration().unwrap();let served=adapter.clone();
        let server=tokio::spawn(async move { reboot::application_host::ApplicationHost::new("retained-preguard").with_host_recovery(registration).add_public_service(proto::transaction_counter_writes_methods_server::TransactionCounterWritesMethodsServer::new(served)).serve_with_shutdown(address,async { let _=stopped.await; }).await });
        tokio::time::timeout(std::time::Duration::from_secs(3),async { loop { if tonic::transport::Endpoint::from_shared(format!("http://{address}")).unwrap().connect().await.is_ok() { break; } tokio::task::yield_now().await; } }).await.unwrap();
        assert_eq!(TransactionCounterWritesMethods::increment(&adapter,request(3)).await.unwrap().into_inner().value,7);
        tokio::time::timeout(std::time::Duration::from_secs(2),async { while watch.count.load(Ordering::SeqCst)==0 { tokio::task::yield_now().await; } }).await.unwrap();
        let n2=tokio::time::timeout(std::time::Duration::from_secs(2),TransactionCounterWritesMethods::increment(&adapter,request(2))).await.unwrap().unwrap_err();
        assert_eq!(n2.code(),tonic::Code::FailedPrecondition);
        assert_eq!(n2.message(),"authorized handler entry binding differs");
        assert_eq!(super::FIXTURE_AUTH_REJECTION_HITS.load(Ordering::SeqCst), 1);
        assert!(n2.metadata().get(reboot::successful_trailers::TRANSACTION_PARTICIPANTS_HEADER).is_none());
        assert!(staged.lock().unwrap().is_empty());
        tokio::task::yield_now().await;
        assert_eq!(*trace.lock().unwrap(),["participant load","handler"]);
        assert_eq!(tokio::time::timeout(std::time::Duration::from_secs(2),TransactionCounterWritesMethods::increment(&adapter,request(5))).await.unwrap().unwrap().into_inner().value,12);
        assert_eq!(*policy.states.lock().unwrap(),[4,7,7]);
        assert_eq!(watch.count.load(Ordering::SeqCst),1);
        assert_eq!(*trace.lock().unwrap(),["participant load","handler","handler"]);
        InProcessParticipantEndpoint::new(host).prepare("transaction-counter",reboot::database_proto::PrepareRequest { transaction_id:Uuid::from_u128(201).as_bytes().to_vec(),..Default::default() }).await.unwrap();
        assert_eq!(staged.lock().unwrap().len(),1);
        assert_eq!(proto::TransactionCounter::decode(staged.lock().unwrap()[0].as_deref().unwrap()).unwrap().value,12);
        watch.release.notify_one();
        tokio::time::timeout(std::time::Duration::from_secs(2),async { while !trace.lock().unwrap().contains(&"participant commit") { tokio::task::yield_now().await; } }).await.unwrap();
        assert!(!trace.lock().unwrap().contains(&"participant abort"));
        assert_eq!(watch.count.load(Ordering::SeqCst),1);
        stop.send(()).unwrap();server.await.unwrap().unwrap();
    }
}

#[tokio::test]
async fn generated_root_star_and_reusable_policy_cancellation_releases_same_root() {
    use proto::transaction_counter_writes_methods_server::TransactionCounterWritesMethods;
    struct ParkThenDeny {
        calls: AtomicUsize,
        snapshots: std::sync::Mutex<Vec<Option<Vec<u8>>>>,
    }
    impl Authorizer for ParkThenDeny {
        fn authorize<'a>(&'a self, _: &'a AuthorizationContext, _: Option<&'a Auth>, state: Option<&'a [u8]>, _: &'a [u8]) -> reboot::auth::AuthorizeFuture<'a> {
            self.snapshots.lock().unwrap().push(state.map(ToOwned::to_owned));
            Box::pin(async move {
                if self.calls.fetch_add(1, Ordering::SeqCst) == 0 { std::future::pending::<()>().await; }
                AuthorizationDecision::PermissionDenied { message: "retry policy reached".into() }
            })
        }
    }
    fn request() -> tonic::Request<proto::TransactionIncrementRequest> {
        let mut headers = reboot::RebootHeaders::new("transaction-counter");
        headers.transaction_ids = Some(vec![Uuid::from_u128(201)]);
        headers.transaction_coordinator_state_type = Some("tests.reboot.protoc.Root".into());
        headers.transaction_coordinator_state_ref = Some("root-counter".into());
        let mut request = tonic::Request::new(proto::TransactionIncrementRequest { amount: 1 });
        *request.metadata_mut() = headers.to_metadata().unwrap();
        request
    }
    for reusable in [false, true] {
        for state in [None, Some(proto::TransactionCounter { value: 7 })] {
            let policy = Arc::new(ParkThenDeny { calls: AtomicUsize::new(0), snapshots: std::sync::Mutex::new(Vec::new()) });
            let trace = Arc::new(std::sync::Mutex::new(Vec::new()));
            let staged = Arc::new(std::sync::Mutex::new(Vec::new()));
            let adapter = factory_transaction_adapter(trace.clone(), state, staged.clone(), false, None)
                .with_authorization(AuthorizationPolicy::new(None, Some(policy.clone())));
            let adapter = if reusable { adapter.with_sequential_reusable_participants() }
                else { adapter.with_sequential_root_star() };
            assert!(tokio::time::timeout(std::time::Duration::from_millis(50), TransactionCounterWritesMethods::increment(&adapter, request())).await.is_err());
            assert_eq!(policy.calls.load(Ordering::SeqCst), 1, "cancellation must occur inside actual authorizer");
            assert_eq!(*trace.lock().unwrap(), ["participant load"]);
            // Guard Drop schedules async cleanup; let that task run before
            // probing eventual admission (there is no runtime status retry).
            tokio::task::yield_now().await;
            let error = tokio::time::timeout(std::time::Duration::from_secs(2), TransactionCounterWritesMethods::increment(&adapter, request())).await.expect("same-root admission must release after policy cancellation").unwrap_err();
            assert_eq!(error.code(), tonic::Code::PermissionDenied, "reusable={reusable}, state={state:?}, error={error:?}");
            assert_eq!(error.message(), "retry policy reached");
            assert_eq!(policy.calls.load(Ordering::SeqCst), 2);
            assert_eq!(*policy.snapshots.lock().unwrap(), vec![state.as_ref().map(Message::encode_to_vec); 2]);
            assert_eq!(*trace.lock().unwrap(), ["participant load", "participant load"]);
            assert!(staged.lock().unwrap().is_empty());
        }
    }
}

#[tokio::test]
async fn generated_root_star_and_reusable_allow_absence_releases_post_allow_guard() {
    use proto::transaction_counter_writes_methods_server::TransactionCounterWritesMethods;
    for reusable in [false, true] {
        let trace = Arc::new(std::sync::Mutex::new(Vec::new()));
        let staged = Arc::new(std::sync::Mutex::new(Vec::new()));
        let probe = Arc::new(AuthProbe {
            verifier_calls: Arc::new(AtomicUsize::new(0)),
            authorizer_calls: Arc::new(AtomicUsize::new(0)),
            handler_calls: Arc::new(AtomicUsize::new(0)),
            decision: AuthorizationDecision::Allow,
            contexts: Arc::new(std::sync::Mutex::new(Vec::new())),
            snapshots: Arc::new(std::sync::Mutex::new(Vec::new())),
        });
        let adapter = factory_transaction_adapter(trace.clone(), None, staged.clone(), false, None)
            .with_authorization(AuthorizationPolicy::new(Some(probe.clone()), Some(probe.clone())));
        let adapter = if reusable { adapter.with_sequential_reusable_participants() }
            else { adapter.with_sequential_root_star() };
        for attempt in 0..2 {
            let mut headers = reboot::RebootHeaders::new("transaction-counter");
            headers.transaction_ids = Some(vec![Uuid::from_u128(201)]);
            headers.transaction_coordinator_state_type = Some("tests.reboot.protoc.Root".into());
            headers.transaction_coordinator_state_ref = Some("root-counter".into());
            let mut request = tonic::Request::new(proto::TransactionIncrementRequest { amount: 1 });
            *request.metadata_mut() = headers.to_metadata().unwrap();
            let error = tokio::time::timeout(std::time::Duration::from_secs(2), TransactionCounterWritesMethods::increment(&adapter, request)).await.expect("post-Allow guard must release admission").unwrap_err();
            assert_eq!(error.code(), tonic::Code::FailedPrecondition, "reusable={reusable}, attempt={attempt}, {error:?}");
            assert_eq!(probe.authorizer_calls.load(Ordering::SeqCst), attempt + 1);
            assert_eq!(probe.snapshots.lock().unwrap()[attempt].0, None);
            assert!(staged.lock().unwrap().is_empty());
            tokio::task::yield_now().await;
        }
        assert_eq!(*trace.lock().unwrap(), ["participant load", "participant load"]);
    }
}

#[tokio::test]
async fn generated_root_star_and_reusable_deny_absence_before_execution_handoff() {
    use proto::transaction_counter_writes_methods_server::TransactionCounterWritesMethods;
    for reusable in [false, true] {
        let trace = Arc::new(std::sync::Mutex::new(Vec::new()));
        let staged = Arc::new(std::sync::Mutex::new(Vec::new()));
        let probe = Arc::new(AuthProbe {
            verifier_calls: Arc::new(AtomicUsize::new(0)),
            authorizer_calls: Arc::new(AtomicUsize::new(0)),
            handler_calls: Arc::new(AtomicUsize::new(0)),
            decision: AuthorizationDecision::PermissionDenied { message: "optional snapshot denied".into() },
            contexts: Arc::new(std::sync::Mutex::new(Vec::new())),
            snapshots: Arc::new(std::sync::Mutex::new(Vec::new())),
        });
        let adapter = factory_transaction_adapter(trace.clone(), None, staged.clone(), false, None)
            .with_authorization(AuthorizationPolicy::new(Some(probe.clone()), Some(probe.clone())));
        let adapter = if reusable { adapter.with_sequential_reusable_participants() }
            else { adapter.with_sequential_root_star() };
        let mut headers = reboot::RebootHeaders::new("transaction-counter");
        headers.transaction_ids = Some(vec![Uuid::from_u128(201)]);
        headers.transaction_coordinator_state_type = Some("tests.reboot.protoc.Root".into());
        headers.transaction_coordinator_state_ref = Some("root-counter".into());
        let mut request = tonic::Request::new(proto::TransactionIncrementRequest { amount: 1 });
        *request.metadata_mut() = headers.to_metadata().unwrap();
        let error = TransactionCounterWritesMethods::increment(&adapter, request).await.unwrap_err();
        assert_eq!(error.code(), tonic::Code::PermissionDenied);
        assert_eq!(error.message(), "optional snapshot denied");
        assert_eq!(probe.authorizer_calls.load(Ordering::SeqCst), 1);
        assert_eq!(probe.snapshots.lock().unwrap()[0].0, None);
        assert_eq!(*trace.lock().unwrap(), ["participant load"]);
        assert!(staged.lock().unwrap().is_empty());
    }
}

#[tokio::test]
async fn generated_inbound_transaction_metadata_does_not_bypass_authorization() {
    use proto::transaction_counter_writes_methods_server::TransactionCounterWritesMethods;
    fn request(token: &str) -> tonic::Request<proto::TransactionIncrementRequest> {
        let mut headers = reboot::RebootHeaders::new("transaction-counter");
        headers.transaction_ids = Some(vec![Uuid::from_u128(201)]);
        headers.transaction_coordinator_state_type = Some("tests.reboot.protoc.Root".into());
        headers.transaction_coordinator_state_ref = Some("root-counter".into());
        headers.bearer_token = Some(token.into());
        let mut request = tonic::Request::new(proto::TransactionIncrementRequest { amount: 0 });
        *request.metadata_mut() = headers.to_metadata().unwrap();
        request
    }
    for shared in [false, true] {
        for kind in ["default", "reject", "deny"] {
            let trace = Arc::new(std::sync::Mutex::new(Vec::new()));
            let probe = Arc::new(AuthProbe {
                verifier_calls: Arc::new(AtomicUsize::new(0)),
                authorizer_calls: Arc::new(AtomicUsize::new(0)),
                handler_calls: Arc::new(AtomicUsize::new(0)),
                decision: AuthorizationDecision::PermissionDenied { message: "inbound denied".into() },
                contexts: Arc::new(std::sync::Mutex::new(Vec::new())),
                snapshots: Arc::new(std::sync::Mutex::new(Vec::new())),
            });
            let policy = if kind == "default" { AuthorizationPolicy::default() }
                else { AuthorizationPolicy::new(Some(probe.clone()), Some(probe.clone())) };
            let adapter = transaction_adapter(trace.clone(), false).with_authorization(policy);
            let token = if kind == "reject" { "reject" } else { "app-internal" };
            let result = if shared {
                TransactionCounterWritesMethods::shared_read(&adapter, request(token)).await
            } else {
                TransactionCounterWritesMethods::increment(&adapter, request(token)).await
            };
            assert_eq!(result.unwrap_err().code(), if kind == "reject" { tonic::Code::Unauthenticated } else { tonic::Code::PermissionDenied });
            let expected: Vec<&str> = if kind == "reject" || kind == "default" { vec![] }
                else if shared { vec!["participant load"] }
                else { vec!["participant load", "participant abort"] };
            assert_eq!(*trace.lock().unwrap(), expected, "kind={kind}, shared={shared}");
            assert_eq!(probe.authorizer_calls.load(Ordering::SeqCst), usize::from(kind == "deny"));
            for context in probe.contexts.lock().unwrap().iter() {
                assert!(context.headers.transaction_ids.is_none());
                assert!(context.headers.transaction_coordinator_state_type.is_none());
                assert!(context.headers.transaction_coordinator_state_ref.is_none());
                assert!(!context.headers.internal_call);
            }
            // An allowed read-only root proves denied inbound local ownership
            // released without requiring a root decision or mutation retry.
            let adapter = adapter.with_authorization(AuthorizationPolicy::permissive_for_development());
            let mut fresh = tonic::Request::new(proto::TransactionIncrementRequest { amount: 0 });
            *fresh.metadata_mut() = reboot::RebootHeaders::new("transaction-counter").to_metadata().unwrap();
            assert_eq!(TransactionCounterWritesMethods::shared_read(&adapter, fresh).await.unwrap().into_inner().value, 4);
        }
    }
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
    // Unsupported task metadata must not silently execute a unary mutation or
    // transaction. Exercise the actual generated Tonic front doors, not a parser.
    let scheduled = || {
        let mut request=context.writer_with_key(proto::TransactionIncrementRequest{amount:999},Uuid::from_u128(999)).unwrap();
        request.metadata_mut().insert("x-reboot-task-schedule","".parse().unwrap());
        request
    };
    for (error, expected) in [
        (client.query(scheduled()).await.unwrap_err(), "canonical task admission is unsupported by transaction adapters"),
        (client.apply(scheduled()).await.unwrap_err(), "canonical task admission is unsupported by transaction adapters"),
        (client.increment(scheduled()).await.unwrap_err(), "canonical transaction task requires registered owner"),
        (client.factory_increment(scheduled()).await.unwrap_err(), "canonical task admission is unsupported by transaction adapters"),
    ] {
        assert_eq!(error.code(),tonic::Code::FailedPrecondition);
        assert_eq!(error.message(),expected);
    }
    assert_eq!(
        *trace.lock().unwrap(),
        ["reader handler", "writer handler", "participant load", "handler", "coordinator DB prepare", "participant prepare", "coordinator DB prepared", "coordinator DB decision", "participant commit", "coordinator DB cleanup", "participant load", "participant abort"]
    );
    server.abort();
    database_server.abort();
}

#[tokio::test]
async fn generated_mixed_service_authorizes_external_database_methods_without_changing_transactions() {
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
    fn request(
        context: &ExternalContext,
        token: &str,
        request: proto::TransactionIncrementRequest,
        key: Uuid,
    ) -> tonic::Request<proto::TransactionIncrementRequest> {
        let mut request = context.writer_with_key(request, key).unwrap();
        request
            .metadata_mut()
            .insert("authorization", format!("Bearer {token}").parse().unwrap());
        request
    }

    let (database_endpoint, _, database_server) = start_database().await;
    let trace = Arc::new(std::sync::Mutex::new(Vec::new()));
    let context = ExternalContext::new("transaction-counter");

    let rejected = probe(AuthorizationDecision::Allow);
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    let adapter = transaction_adapter_with_store(
        Arc::clone(&trace), false, DatabaseActorStore::connect(&database_endpoint).await.unwrap(),
    ).with_authorization(AuthorizationPolicy::new(Some(rejected.clone()), Some(rejected.clone())));
    let server = tokio::spawn(async move {
        tonic::transport::Server::builder()
            .add_service(proto::transaction_counter_writes_methods_server::TransactionCounterWritesMethodsServer::new(adapter))
            .serve_with_incoming(tokio_stream::wrappers::TcpListenerStream::new(listener))
            .await
            .unwrap();
    });
    let mut client = proto::transaction_counter_writes_methods_client::TransactionCounterWritesMethodsClient::connect(format!("http://{address}")).await.unwrap();
    assert_eq!(client.apply(request(&context, "reject", proto::TransactionIncrementRequest { amount: 2 }, Uuid::from_u128(401))).await.unwrap_err().code(), tonic::Code::Unauthenticated);
    assert_eq!(rejected.verifier_calls.load(Ordering::SeqCst), 1);
    assert_eq!(rejected.authorizer_calls.load(Ordering::SeqCst), 0);
    server.abort();

    let denied = probe(AuthorizationDecision::PermissionDenied { message: "denied".into() });
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    let adapter = transaction_adapter_with_store(
        Arc::clone(&trace), false, DatabaseActorStore::connect(&database_endpoint).await.unwrap(),
    ).with_authorization(AuthorizationPolicy::new(Some(denied.clone()), Some(denied.clone())));
    let server = tokio::spawn(async move {
        tonic::transport::Server::builder()
            .add_service(proto::transaction_counter_writes_methods_server::TransactionCounterWritesMethodsServer::new(adapter))
            .serve_with_incoming(tokio_stream::wrappers::TcpListenerStream::new(listener))
            .await
            .unwrap();
    });
    let mut client = proto::transaction_counter_writes_methods_client::TransactionCounterWritesMethodsClient::connect(format!("http://{address}")).await.unwrap();
    assert_eq!(client.apply(request(&context, "allow", proto::TransactionIncrementRequest { amount: 2 }, Uuid::from_u128(402))).await.unwrap_err().code(), tonic::Code::PermissionDenied);
    assert_eq!(denied.authorizer_calls.load(Ordering::SeqCst), 1);
    server.abort();

    let allowed = probe(AuthorizationDecision::Allow);
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    let adapter = transaction_adapter_with_store(
        Arc::clone(&trace), false, DatabaseActorStore::connect(&database_endpoint).await.unwrap(),
    ).with_authorization(AuthorizationPolicy::new(Some(allowed.clone()), Some(allowed.clone())));
    let server = tokio::spawn(async move {
        tonic::transport::Server::builder()
            .layer(reboot::successful_trailers::SuccessfulParticipantTrailerLayer)
            .add_service(proto::transaction_counter_writes_methods_server::TransactionCounterWritesMethodsServer::new(adapter))
            .serve_with_incoming(tokio_stream::wrappers::TcpListenerStream::new(listener))
            .await
            .unwrap();
    });
    let mut client = proto::transaction_counter_writes_methods_client::TransactionCounterWritesMethodsClient::connect(format!("http://{address}")).await.unwrap();
    let mut reader = context.reader(proto::TransactionIncrementRequest { amount: 0 }).unwrap();
    reader.metadata_mut().insert("authorization", "Bearer allow".parse().unwrap());
    assert_eq!(client.query(reader).await.unwrap().into_inner().value, 0);
    assert_eq!(client.apply(request(&context, "allow", proto::TransactionIncrementRequest { amount: 2 }, Uuid::from_u128(403))).await.unwrap().into_inner().value, 2);
    let snapshots = allowed.snapshots.lock().unwrap();
    assert_eq!(snapshots.len(), 2);
    assert_eq!(proto::TransactionCounter::decode(snapshots[0].0.as_ref().unwrap().as_slice()).unwrap(), proto::TransactionCounter { value: 0 });
    assert_eq!(proto::TransactionIncrementRequest::decode(snapshots[0].1.as_slice()).unwrap(), proto::TransactionIncrementRequest { amount: 0 });
    assert_eq!(proto::TransactionCounter::decode(snapshots[1].0.as_ref().unwrap().as_slice()).unwrap(), proto::TransactionCounter { value: 0 });
    assert_eq!(proto::TransactionIncrementRequest::decode(snapshots[1].1.as_slice()).unwrap(), proto::TransactionIncrementRequest { amount: 2 });
    drop(snapshots);
    let contexts = allowed.contexts.lock().unwrap();
    assert_eq!(contexts[0].method, "tests.reboot.protoc.TransactionCounterWritesMethods.Query");
    assert_eq!(contexts[1].method, "tests.reboot.protoc.TransactionCounterWritesMethods.Apply");
    assert_eq!(contexts[1].headers.bearer_token.as_deref(), Some("allow"));
    assert!(contexts[1].headers.transaction_ids.is_none());
    drop(contexts);
    // The existing mixed-service fixture above exercises Increment unchanged;
    // this test proves policy applies only to its external database methods.
    assert_eq!(*trace.lock().unwrap(), ["reader handler", "writer handler"]);
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
        ["participant load", "fresh shared handler"]
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
    ).with_authorization(reboot::auth::AuthorizationPolicy::permissive_for_development());
    let reads = generated::CounterReadsMethodsDatabaseAdapter::new(
        DatabaseActorStore::connect(database_endpoint).await.unwrap(),
        Counter,
    ).with_authorization(reboot::auth::AuthorizationPolicy::permissive_for_development());
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
async fn generated_external_unary_clients_retry_only_unavailable_with_canonical_requests_and_metadata() {
    fn script(outcomes: Vec<tonic::Code>) -> UnaryRetryScript {
        UnaryRetryScript {
            outcomes: Arc::new(std::sync::Mutex::new(outcomes.into())),
            requests: Arc::new(std::sync::Mutex::new(Vec::new())),
        }
    }

    let writer = script(vec![tonic::Code::Unavailable, tonic::Code::Ok]);
    let reader = script(vec![tonic::Code::Unavailable, tonic::Code::Ok]);
    let writer_requests = Arc::clone(&writer.requests);
    let reader_requests = Arc::clone(&reader.requests);
    let (address, server) = start_unary_retry_server(writer, reader).await;
    let context = ExternalContext::new("retry-canonical")
        .with_bearer_token("retry-token")
        .with_caller_id(CallerId::new("a1234567890", None).unwrap());
    let mut writes = generated::CounterWritesMethodsExternalClient::new(
        context.connect(address.clone()).await.unwrap(),
        context.clone(),
    );
    assert_eq!(
        writes
            .increment(proto::IncrementRequest { amount: 44 })
            .await
            .unwrap()
            .into_inner()
            .value,
        77
    );
    {
        let writer_requests = writer_requests.lock().unwrap();
        assert_eq!(writer_requests.len(), 2);
        assert_eq!(writer_requests[0], writer_requests[1]);
        let writer_headers = &writer_requests[0].1;
        let writer_key = writer_headers.idempotency_key.expect("automatic writer key");
        assert_eq!(writer_key.get_version_num(), 7);
    }

    let mut reads = generated::CounterReadsMethodsExternalClient::new(
        context.connect(address.clone()).await.unwrap(),
        context,
    );
    assert_eq!(reads.get(proto::Empty {}).await.unwrap().into_inner().value, 78);
    {
        let reader_requests = reader_requests.lock().unwrap();
        assert_eq!(reader_requests.len(), 2);
        assert_eq!(reader_requests[0], reader_requests[1]);
        assert!(
            reader_requests[0].1.idempotency_key.is_none(),
            "readers must not acquire writer idempotency metadata"
        );
    }
    server.abort();

    let writer = script(vec![tonic::Code::InvalidArgument]);
    let reader = script(vec![tonic::Code::Ok]);
    let non_unavailable_requests = Arc::clone(&writer.requests);
    let (address, server) = start_unary_retry_server(writer, reader).await;
    let context = ExternalContext::new("retry-non-unavailable");
    let mut writes = generated::CounterWritesMethodsExternalClient::new(
        context.connect(address).await.unwrap(),
        context,
    );
    assert!(matches!(
        writes.increment(proto::IncrementRequest { amount: 1 }).await,
        Err(generated::CounterWritesMethodsIncrementError::Grpc(status))
            if status.code() == tonic::Code::InvalidArgument
    ));
    assert_eq!(non_unavailable_requests.lock().unwrap().len(), 1);
    server.abort();
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
            .increment(proto::IncrementRequest { amount: 50 })
            .await
            .unwrap()
            .into_inner()
            .value,
        50
    );
    assert!(matches!(
        reads.get(proto::Empty {}).await,
        Err(generated::CounterReadsMethodsGetError::System(system))
            if matches!(system.error, reboot::SystemAborted::NotFound(_))
                && system.message == "reader state is absent"
    ));
    assert!(matches!(
        writes.increment(proto::IncrementRequest { amount: -1 }).await,
        Err(generated::CounterWritesMethodsIncrementError::CounterLimitExceeded(error))
            if error.limit == 50
    ));
    assert!(matches!(
        writes.increment(proto::IncrementRequest { amount: -2 }).await,
        Err(generated::CounterWritesMethodsIncrementError::System(system))
            if matches!(system.error, reboot::SystemAborted::NotFound(_))
                && system.message == "counter is absent"
    ));
    assert_eq!(
        database.store_requests().len(),
        1,
        "a generated writer SystemAbort must not persist mutated state"
    );

    let explicit_key = Uuid::parse_str("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa").unwrap();
    assert_eq!(
        writes
            .increment_with_key(proto::IncrementRequest { amount: 2 }, explicit_key)
            .await
            .unwrap()
            .into_inner()
            .value,
        52
    );
    assert_eq!(
        writes
            .increment_with_key(proto::IncrementRequest { amount: 2 }, explicit_key)
            .await
            .unwrap()
            .into_inner()
            .value,
        52,
        "an explicit idempotency key must replay the first writer response"
    );

    let reader_channel = context.connect(address).await.unwrap();
    let mut reads = generated::CounterReadsMethodsExternalClient::new(reader_channel, context);
    assert_eq!(
        reads.get(proto::Empty {}).await.unwrap().into_inner().value,
        52
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

struct OwnerHandler(Arc<AtomicUsize>);
#[tonic::async_trait]
impl owner_generated::OwnerAccountMethodsDatabaseHandler for OwnerHandler {
    async fn create(&self, state: &mut proto::OwnerAccount, request: proto::OwnerAccountRequest) -> Result<proto::OwnerAccountResponse, tonic::Status> {
        self.0.fetch_add(1, Ordering::SeqCst); state.value = request.value; Ok(proto::OwnerAccountResponse { value: state.value })
    }
    async fn get(&self, state: &proto::OwnerAccount, _: proto::OwnerAccountRequest) -> Result<proto::OwnerAccountResponse, tonic::Status> {
        self.0.fetch_add(1, Ordering::SeqCst); Ok(proto::OwnerAccountResponse { value: state.value })
    }
    async fn update(&self, state: &mut proto::OwnerAccount, request: proto::OwnerAccountRequest) -> Result<proto::OwnerAccountResponse, tonic::Status> {
        self.0.fetch_add(1, Ordering::SeqCst); state.value = request.value; Ok(proto::OwnerAccountResponse { value: state.value })
    }
    async fn set_claims(&self, _: &proto::OwnerAccount, _: proto::OwnerAccountRequest) -> Result<proto::OwnerAccountResponse, tonic::Status> {
        self.0.fetch_add(1, Ordering::SeqCst); panic!("external SetClaims reached handler")
    }
}
struct OwnerVerifier;
impl TokenVerifier for OwnerVerifier {
    fn verify<'a>(&'a self, _: &'a AuthorizationContext, token: Option<&'a str>) -> reboot::auth::VerifyFuture<'a> {
        Box::pin(async move { match token {
            Some("owner-token") => TokenVerification::Authenticated(Auth::new(serde_json::json!({})).with_user_id("alice")),
            Some("other-token") => TokenVerification::Authenticated(Auth::new(serde_json::json!({})).with_user_id("bob")),
            Some("payload-forgery") => TokenVerification::Authenticated(Auth::new(serde_json::json!({"user_id":"alice"}))),
            _ => TokenVerification::NoOpinion,
        } })
    }
}
#[tokio::test]
async fn generated_owner_adapter_gates_constructor_reader_writer_and_custom_allow_setclaims() {
    fn request(token: &str, value: i64) -> tonic::Request<proto::OwnerAccountRequest> {
        let mut headers = reboot::RebootHeaders::new("tests.reboot.protoc.OwnerAccount:alice");
        headers.bearer_token = Some(token.into());
        headers.idempotency_key = Some(Uuid::new_v4());
        let mut request = tonic::Request::new(proto::OwnerAccountRequest { value });
        *request.metadata_mut() = headers.to_metadata().unwrap();
        request.metadata_mut().insert("x-forged-user-id", "alice".parse().unwrap());
        request
    }
    let (endpoint, database, database_server) = start_database().await;
    let calls = Arc::new(AtomicUsize::new(0));
    for custom in [false, true] {
        let authorizer: Option<Arc<dyn Authorizer>> = if custom { Some(Arc::new(AuthProbe {
            verifier_calls: Arc::new(AtomicUsize::new(0)), authorizer_calls: Arc::new(AtomicUsize::new(0)), handler_calls: Arc::clone(&calls), decision: AuthorizationDecision::Allow,
            contexts: Arc::new(std::sync::Mutex::new(Vec::new())), snapshots: Arc::new(std::sync::Mutex::new(Vec::new())),
        })) } else { None };
        let adapter = owner_generated::OwnerAccountMethodsDatabaseAdapter::new(DatabaseActorStore::connect(&endpoint).await.unwrap(), OwnerHandler(Arc::clone(&calls)))
            .with_authorization(AuthorizationPolicy::new(Some(Arc::new(OwnerVerifier)), authorizer));
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let server = tokio::spawn(async move {
            tonic::transport::Server::builder().add_service(proto::owner_account_methods_server::OwnerAccountMethodsServer::new(adapter))
                .serve_with_incoming(tokio_stream::wrappers::TcpListenerStream::new(listener)).await.unwrap();
        });
        let mut client = proto::owner_account_methods_client::OwnerAccountMethodsClient::connect(format!("http://{address}")).await.unwrap();
        if !custom {
            for (token, code) in [("missing", tonic::Code::Unauthenticated), ("payload-forgery", tonic::Code::Unauthenticated), ("other-token", tonic::Code::PermissionDenied)] {
                assert_eq!(client.create(request(token, 10)).await.unwrap_err().code(), code);
                assert_eq!(client.get(request(token, 0)).await.unwrap_err().code(), code);
                assert_eq!(client.update(request(token, 99)).await.unwrap_err().code(), code);
            }
            assert_eq!(calls.load(Ordering::SeqCst), 0);
            assert!(database.store_requests().is_empty());
            assert_eq!(client.create(request("owner-token", 10)).await.unwrap().into_inner().value, 10);
            assert_eq!(client.update(request("owner-token", 20)).await.unwrap().into_inner().value, 20);
            assert_eq!(client.get(request("owner-token", 0)).await.unwrap().into_inner().value, 20);
        } else {
            assert_eq!(client.update(request("other-token", 30)).await.unwrap().into_inner().value, 30);
            assert_eq!(client.get(request("missing", 0)).await.unwrap().into_inner().value, 30);
        }
        let before = calls.load(Ordering::SeqCst);
        let stores = database.store_requests().len();
        assert_eq!(client.set_claims(request("owner-token", 0)).await.unwrap_err().code(), tonic::Code::PermissionDenied);
        assert_eq!(calls.load(Ordering::SeqCst), before);
        assert_eq!(database.store_requests().len(), stores);
        server.abort();
        let _ = server.await;
    }
    database_server.abort();
    let _ = database_server.await;
}

#[tokio::test]
async fn generated_owner_descriptor_selects_policy_without_message_name_heuristic() {
    use reboot::runtime::DurableStateDeclaration;
    assert_eq!(owner_generated::OwnerAccountDurableState::AUTO_CONSTRUCT, 1);
    let policy = AuthorizationPolicy::permissive_for_development().for_declaration::<owner_generated::OwnerAccountDurableState>();
    let context = AuthorizationContext {
        headers: reboot::RebootHeaders::new("tests.reboot.protoc.OwnerAccount:alice"),
        state_type: "tests.reboot.protoc.OwnerAccount".into(),
        method: "tests.reboot.protoc.OwnerAccountMethods.Get".into(),
    };
    assert_eq!(policy.authorize(&context, None, None, &[]).await.unwrap_err().code(), tonic::Code::Unauthenticated);
    let owner = Auth::new(serde_json::json!({})).with_user_id("alice");
    policy.authorize(&context, Some(&owner), None, &[]).await.unwrap();
    let wrong = owner.with_user_id("bob");
    assert_eq!(policy.authorize(&context, Some(&wrong), None, &[]).await.unwrap_err().code(), tonic::Code::PermissionDenied);
    let mut claims = context;
    claims.method = "tests.reboot.protoc.OwnerAccountMethods.SetClaims".into();
    assert_eq!(policy.verify(claims.headers, claims.state_type, claims.method).await.unwrap_err().code(), tonic::Code::PermissionDenied);
}

#[tokio::test]
async fn generated_subscription_binding_rejects_credentials_before_embedded_decode() {
    use reboot::reactive::{ReaderBinding, wire::Query};
    let calls = Arc::new(AtomicUsize::new(0));
    let probe = Arc::new(AuthProbe {
        verifier_calls: Arc::new(AtomicUsize::new(0)),
        authorizer_calls: Arc::new(AtomicUsize::new(0)),
        handler_calls: calls.clone(),
        decision: AuthorizationDecision::Allow,
        contexts: Arc::new(std::sync::Mutex::new(Vec::new())),
        snapshots: Arc::new(std::sync::Mutex::new(Vec::new())),
    });
    // An unreachable store makes any accidental pre-verification Load fail.
    let reader = generated::CounterReadsMethodsDatabaseAdapter::new(
        DatabaseActorStore::connect_lazy("http://127.0.0.1:1").unwrap(),
        AuthCounter(calls.clone()),
    ).with_authorization(AuthorizationPolicy::new(Some(probe.clone()), Some(probe.clone())));
    let mut headers = reboot::RebootHeaders::new("subscription-denied");
    headers.bearer_token = Some("reject".into());
    let mut request = tonic::Request::new(Query {
        method: "tests.reboot.protoc.CounterReadsMethods.Get".into(),
        request: vec![0xff],
    });
    *request.metadata_mut() = headers.to_metadata().unwrap();
    let status = ReaderBinding::read(&reader, request).await.unwrap_err();
    assert_eq!(status.code(), tonic::Code::Unauthenticated);
    assert_eq!(probe.verifier_calls.load(Ordering::SeqCst), 1);
    assert_eq!(probe.authorizer_calls.load(Ordering::SeqCst), 0);
    assert_eq!(calls.load(Ordering::SeqCst), 0);
}

#[tokio::test]
async fn generated_default_policy_denies_database_and_fresh_root_forms_before_effects() {
    use proto::counter_reads_methods_server::CounterReadsMethods;
    use proto::counter_writes_methods_server::CounterWritesMethods;
    use proto::constructor_counter_writes_methods_server::ConstructorCounterWritesMethods;
    use proto::transaction_counter_writes_methods_server::TransactionCounterWritesMethods;

    let (endpoint, database, database_server) = start_database().await;
    let calls = Arc::new(AtomicUsize::new(0));
    let store = DatabaseActorStore::connect(&endpoint).await.unwrap();
    let writer = generated::CounterWritesMethodsDatabaseAdapter::new(store.clone(), AuthCounter(calls.clone()));
    let reader = generated::CounterReadsMethodsDatabaseAdapter::new(store.clone(), AuthCounter(calls.clone()));
    let constructor = constructor_generated::ConstructorCounterWritesMethodsDatabaseAdapter::new(store, ConstructorCounter(calls.clone()));
    let context = ExternalContext::new("default-denied");
    assert_eq!(CounterWritesMethods::increment(&writer, context.writer_with_key(proto::IncrementRequest { amount: 1 }, Uuid::new_v4()).unwrap()).await.unwrap_err().code(), tonic::Code::PermissionDenied);
    assert_eq!(CounterReadsMethods::get(&reader, context.reader(proto::Empty {}).unwrap()).await.unwrap_err().code(), tonic::Code::PermissionDenied);
    assert_eq!(ConstructorCounterWritesMethods::create(&constructor, context.writer_with_key(proto::ConstructorCreateRequest { initial_value: 1 }, Uuid::new_v4()).unwrap()).await.unwrap_err().code(), tonic::Code::PermissionDenied);
    assert_eq!(calls.load(Ordering::SeqCst), 0);
    assert!(database.store_requests().is_empty());
    assert!(database.create_requests().is_empty());

    for mode in ["shared", "exclusive", "factory"] {
        let trace = Arc::new(std::sync::Mutex::new(Vec::new()));
        let adapter = if mode == "factory" {
            factory_transaction_adapter(trace.clone(), None, Arc::new(std::sync::Mutex::new(Vec::new())), false, None)
        } else {
            transaction_adapter(trace.clone(), false)
        }.with_authorization(AuthorizationPolicy::default());
        let mut request = tonic::Request::new(proto::TransactionIncrementRequest { amount: 1 });
        *request.metadata_mut() = reboot::RebootHeaders::new("transaction-counter").to_metadata().unwrap();
        let status = match mode {
            "shared" => TransactionCounterWritesMethods::shared_read(&adapter, request).await.unwrap_err(),
            "exclusive" => TransactionCounterWritesMethods::increment(&adapter, request).await.unwrap_err(),
            _ => TransactionCounterWritesMethods::factory_increment(&adapter, request).await.unwrap_err(),
        };
        assert_eq!(status.code(), tonic::Code::PermissionDenied, "{mode}");
        // Missing policy is rejected before root creation or participant Load.
        let expected: Vec<&str> = vec![];
        assert_eq!(*trace.lock().unwrap(), expected, "{mode}: denial before root/Load/handler/Store/Prepare");
        if mode == "shared" {
            let adapter = adapter.with_authorization(AuthorizationPolicy::permissive_for_development());
            let response = tokio::time::timeout(std::time::Duration::from_secs(2), async {
                loop {
                    let mut request = tonic::Request::new(proto::TransactionIncrementRequest { amount: 0 });
                    *request.metadata_mut() = reboot::RebootHeaders::new("transaction-counter").to_metadata().unwrap();
                    match TransactionCounterWritesMethods::shared_read(&adapter, request).await {
                        Err(status) if status.code() == tonic::Code::FailedPrecondition
                            && status.message() == "actor already has a pending transaction" => {
                            tokio::task::yield_now().await;
                        }
                        result => break result,
                    }
                }
            }).await.expect("default-denied shared ownership did not release").unwrap();
            assert_eq!(response.into_inner().value, 4);
            assert_eq!(*trace.lock().unwrap(), ["participant load", "fresh shared handler"]);
        }
    }
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
    assert_eq!(proto::Counter::decode(snapshots[0].0.as_ref().unwrap().as_slice()).unwrap(), proto::Counter { value: 0 });
    assert_eq!(proto::IncrementRequest::decode(snapshots[0].1.as_slice()).unwrap(), proto::IncrementRequest { amount: 5 });
    assert_eq!(proto::Counter::decode(snapshots[1].0.as_ref().unwrap().as_slice()).unwrap(), proto::Counter { value: 5 });
    assert_eq!(proto::Empty::decode(snapshots[1].1.as_slice()).unwrap(), proto::Empty {});
    assert_eq!(database.store_requests().len(), 1, "denied writers must not persist state");
    allowed_server.abort();
    database_server.abort();
}

#[tokio::test]
async fn generated_external_constructor_authorization_hides_absence_and_authorizes_existing_state() {
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
    fn request(state_ref: &str, token: &str, initial_value: i64) -> tonic::Request<proto::ConstructorCreateRequest> {
        let mut headers = reboot::RebootHeaders::new(state_ref);
        headers.bearer_token = Some(token.into());
        headers.idempotency_key = Some(Uuid::new_v4());
        let mut request = tonic::Request::new(proto::ConstructorCreateRequest { initial_value });
        *request.metadata_mut() = headers.to_metadata().unwrap();
        request
    }
    async fn start(
        database_endpoint: &str,
        authorization: AuthorizationPolicy,
        handler_calls: Arc<AtomicUsize>,
    ) -> (String, tokio::task::JoinHandle<()>) {
        let adapter = constructor_generated::ConstructorCounterWritesMethodsDatabaseAdapter::new(
            DatabaseActorStore::connect(database_endpoint).await.unwrap(),
            ConstructorCounter(handler_calls),
        )
        .with_authorization(authorization);
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let server = tokio::spawn(async move {
            tonic::transport::Server::builder()
                .add_service(proto::constructor_counter_writes_methods_server::ConstructorCounterWritesMethodsServer::new(adapter))
                .serve_with_incoming(tokio_stream::wrappers::TcpListenerStream::new(listener))
                .await
                .unwrap();
        });
        (format!("http://{address}"), server)
    }

    let (database_endpoint, database, database_server) = start_database().await;
    let rejected = probe(AuthorizationDecision::Allow);
    let (address, server) = start(
        &database_endpoint,
        AuthorizationPolicy::new(Some(rejected.clone()), Some(rejected.clone())),
        Arc::clone(&rejected.handler_calls),
    )
    .await;
    let mut client = proto::constructor_counter_writes_methods_client::ConstructorCounterWritesMethodsClient::connect(address).await.unwrap();
    assert_eq!(client.create(request("constructor-rejected", "reject", 3)).await.unwrap_err().code(), tonic::Code::Unauthenticated);
    assert_eq!(rejected.verifier_calls.load(Ordering::SeqCst), 1);
    assert_eq!(rejected.authorizer_calls.load(Ordering::SeqCst), 0);
    assert_eq!(rejected.handler_calls.load(Ordering::SeqCst), 0);
    assert!(database.create_requests().is_empty(), "verifier rejection must not create an actor or idempotency mutation");
    server.abort();

    let denied = probe(AuthorizationDecision::PermissionDenied { message: "denied".into() });
    let (address, server) = start(
        &database_endpoint,
        AuthorizationPolicy::new(Some(denied.clone()), Some(denied.clone())),
        Arc::clone(&denied.handler_calls),
    )
    .await;
    let mut client = proto::constructor_counter_writes_methods_client::ConstructorCounterWritesMethodsClient::connect(address).await.unwrap();
    assert_eq!(client.create(request("constructor-denied", "allow", 5)).await.unwrap_err().code(), tonic::Code::PermissionDenied);
    assert_eq!(denied.authorizer_calls.load(Ordering::SeqCst), 1);
    assert_eq!(denied.handler_calls.load(Ordering::SeqCst), 0);
    assert!(database.create_requests().is_empty(), "absent-state denial must not create an actor or idempotency mutation");
    {
        let denied_snapshots = denied.snapshots.lock().unwrap();
        assert_eq!(denied_snapshots.as_slice(), &[(None, proto::ConstructorCreateRequest { initial_value: 5 }.encode_to_vec())]);
    }
    server.abort();

    let allowed = probe(AuthorizationDecision::Allow);
    let (address, server) = start(
        &database_endpoint,
        AuthorizationPolicy::new(Some(allowed.clone()), Some(allowed.clone())),
        Arc::clone(&allowed.handler_calls),
    )
    .await;
    let mut client = proto::constructor_counter_writes_methods_client::ConstructorCounterWritesMethodsClient::connect(address).await.unwrap();
    assert_eq!(client.create(request("constructor-denied", "allow", 5)).await.unwrap().into_inner().value, 5);
    let duplicate = client.create(request("constructor-denied", "allow", 9)).await.unwrap_err();
    assert_eq!(duplicate.code(), tonic::Code::Aborted);
    let rich = reboot::declared_error_details(&duplicate).unwrap().unwrap();
    assert_eq!(rich.details[0].type_url, "type.googleapis.com/rbt.v1alpha1.StateAlreadyConstructed");
    assert_eq!(allowed.handler_calls.load(Ordering::SeqCst), 1, "denial and existing-actor conflict must not invoke the constructor handler");
    assert_eq!(database.create_requests().len(), 1, "only the allowed constructor may atomically create its actor and idempotency mutation");
    let contexts = allowed.contexts.lock().unwrap();
    assert_eq!(contexts.len(), 2);
    assert!(contexts.iter().all(|context| {
        context.state_type == "tests.reboot.protoc.ConstructorCounter"
            && context.method == "tests.reboot.protoc.ConstructorCounterWritesMethods.Create"
            && context.headers.bearer_token.as_deref() == Some("allow")
            && context.headers.idempotency_key.is_none()
            && !context.headers.internal_call
    }));
    drop(contexts);
    let snapshots = allowed.snapshots.lock().unwrap();
    assert_eq!(snapshots.len(), 2);
    assert_eq!(snapshots[0], (None, proto::ConstructorCreateRequest { initial_value: 5 }.encode_to_vec()));
    assert_eq!(
        proto::ConstructorCounter::decode(snapshots[1].0.as_ref().unwrap().as_slice()).unwrap(),
        proto::ConstructorCounter { value: 5 },
        "the existing actor is authorized from its immutable loaded state before the conflict is disclosed",
    );
    assert_eq!(snapshots[1].1, proto::ConstructorCreateRequest { initial_value: 9 }.encode_to_vec());
    drop(snapshots);
    server.abort();
    database_server.abort();
}

#[tokio::test]
async fn generated_external_constructor_declared_errors_round_trip_without_creation() {
    let (database_endpoint, database, database_server) = start_database().await;
    let handler_calls = Arc::new(AtomicUsize::new(0));
    let adapter = constructor_generated::ConstructorCounterWritesMethodsDatabaseAdapter::new(
        DatabaseActorStore::connect(&database_endpoint).await.unwrap(),
        ConstructorCounter(Arc::clone(&handler_calls)),
    ).with_authorization(reboot::auth::AuthorizationPolicy::permissive_for_development());
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    let server = tokio::spawn(async move {
        tonic::transport::Server::builder()
            .add_service(proto::constructor_counter_writes_methods_server::ConstructorCounterWritesMethodsServer::new(adapter))
            .serve_with_incoming(tokio_stream::wrappers::TcpListenerStream::new(listener))
            .await
            .unwrap();
    });

    let context = ExternalContext::new("constructor-declared-error");
    let channel = context.connect(format!("http://{address}")).await.unwrap();
    let mut client = constructor_generated::ConstructorCounterWritesMethodsExternalClient::new(channel, context);
    assert!(matches!(
        client.create(proto::ConstructorCreateRequest { initial_value: -1 }).await,
        Err(constructor_generated::ConstructorCounterWritesMethodsCreateError::ConstructorInitialValueRejected(error))
            if error == proto::ConstructorInitialValueRejected { initial_value: -1 }
    ));
    assert!(database.create_requests().is_empty(), "a declared constructor error must not create actor or idempotency state");
    assert!(matches!(
        client.create(proto::ConstructorCreateRequest { initial_value: -2 }).await,
        Err(constructor_generated::ConstructorCounterWritesMethodsCreateError::Grpc(status))
            if status.code() == tonic::Code::InvalidArgument && status.message() == "malformed rich status"
    ));
    assert!(matches!(
        client.create(proto::ConstructorCreateRequest { initial_value: -3 }).await,
        Err(constructor_generated::ConstructorCounterWritesMethodsCreateError::Grpc(status))
            if status.code() == tonic::Code::InvalidArgument && status.message() == "ordinary grpc"
    ));
    assert!(database.create_requests().is_empty(), "malformed and ordinary gRPC constructor errors must not create actor or idempotency state");
    assert_eq!(
        client
            .create(proto::ConstructorCreateRequest { initial_value: 42 })
            .await
            .unwrap()
            .into_inner()
            .value,
        42
    );
    assert_eq!(database.create_requests().len(), 1, "the succeeding constructor must create exactly once");
    assert_eq!(handler_calls.load(Ordering::SeqCst), 4);
    server.abort();
    database_server.abort();
}

#[tokio::test]
async fn generated_external_client_decodes_ordered_declared_errors_and_preserves_grpc_fallbacks() {
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    let calls = Arc::new(AtomicUsize::new(0));
    let calls_for_server = Arc::clone(&calls);
    let server = tokio::spawn(async move { tonic::transport::Server::builder().add_service(proto::counter_writes_methods_server::CounterWritesMethodsServer::new(RichErrorService(calls_for_server))).serve_with_incoming(tokio_stream::wrappers::TcpListenerStream::new(listener)).await.unwrap(); });
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
    assert_eq!(calls.load(Ordering::SeqCst), 7, "declared and rich errors must be returned after their first attempt");
    server.abort();
}

async fn start_map_counter_adapters(
    database_endpoint: &str,
) -> (String, tokio::task::JoinHandle<()>) {
    let writes = map_generated::MapCounterWritesMethodsDatabaseAdapter::new(
        DatabaseActorStore::connect(database_endpoint).await.unwrap(),
        MapCounter,
    ).with_authorization(reboot::auth::AuthorizationPolicy::permissive_for_development());
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
    async fn query_declared(&self, _: tonic::Request<proto::TransactionIncrementRequest>) -> Result<tonic::Response<proto::TransactionCounterValue>, tonic::Status> { Err(tonic::Status::unimplemented("fixture")) }
    async fn apply_declared(&self, _: tonic::Request<proto::TransactionIncrementRequest>) -> Result<tonic::Response<proto::TransactionCounterValue>, tonic::Status> { Err(tonic::Status::unimplemented("fixture")) }

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
        .env_remove("CARGO_TARGET_DIR")
        .arg("test")
        .arg("--offline")
        .arg("--")
        .arg("--test-threads=1")
        .current_dir(&fixture)
        .status()
        .unwrap();
    assert!(status.success());

    if std::env::var_os("RBT_STRICT_GENERATED_CLIPPY").as_deref() == Some(std::ffi::OsStr::new("1"))
    {
        let lint = Command::new("cargo")
            .env_remove("CARGO_TARGET_DIR")
            .args([
                "clippy",
                "--locked",
                "--offline",
                "--all-targets",
                "--",
                "-D",
                "warnings",
            ])
            .current_dir(&fixture)
            .status()
            .unwrap();
        assert!(lint.success(), "strict generated-consumer Clippy failed");
    }

    // The matching consumer above uses the real SDK renamed to `reboot`.
    // Change only an emitted guard literal; leave runtime and adapter APIs intact.
    let build_path = fixture.join("build.rs");
    let source = std::fs::read_to_string(&build_path).unwrap();
    let prefix = source.strip_suffix("}\n").unwrap();
    let contract = reboot_rust_schema::versioning::GENERATED_CODE_CONTRACT;
    let guard = format!("check_generated_code_compatible({contract})");
    let mismatch = format!("check_generated_code_compatible({})", contract + 1);
    let mutation = format!(
        r#"
    let path = std::path::PathBuf::from(std::env::var_os("OUT_DIR").unwrap()).join("tests/reboot/protoc/counter.reboot.rs");
    let emitted = std::fs::read_to_string(&path).unwrap();
    assert_eq!(emitted.matches({guard:?}).count(), 1);
    std::fs::write(path, emitted.replacen({guard:?}, {mismatch:?}, 1)).unwrap();
}}
"#
    );
    std::fs::write(&build_path, format!("{prefix}{mutation}")).unwrap();
    let output = Command::new("cargo")
        .env_remove("CARGO_TARGET_DIR")
        .args(["check", "--offline"])
        .current_dir(&fixture)
        .output()
        .unwrap();
    assert!(
        !output.status.success(),
        "mismatched consumer unexpectedly compiled"
    );
    let diagnostics = String::from_utf8_lossy(&output.stderr);
    assert!(
        diagnostics.contains("generated-code contract mismatch"),
        "{diagnostics}"
    );
    assert!(diagnostics.contains("regenerate adapters"), "{diagnostics}");
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
        ).with_authorization(reboot_rust_schema::auth::AuthorizationPolicy::permissive_for_development());
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
        .env_remove("CARGO_TARGET_DIR")
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
fn shared_existing_writer_native_fixture_retains_original_account_schema_and_generated_services() {
    let source = include_str!("fixtures/shared_existing_writer_acceptance.rs");
    let build = include_str!("fixtures/shared_existing_writer/build.rs");
    let schema = include_str!("fixtures/shared_existing_writer/shared/probe/shared_root.proto");
    assert!(build.contains("bank/v1/account.proto"));
    assert!(build.contains("bank/v1/errors.proto"));
    assert!(!build.contains("bank/v1/bank.proto"));
    assert!(!schema.contains("errors:"));
    assert!(schema.contains("transaction = { shared: {} }"));
    assert!(source.contains("root::SharedRootMethodsTransactionAdapter::new"));
    assert!(source.contains("account::AccountMethodsTransactionAdapter::new"));
    assert!(source.contains("with_shared_existing_writers()"));
    assert!(source.contains("OverdraftError"));
    assert!(source.contains("native.restart()"));
    assert!(source.contains("shared_existing_writer_missing_second_target_abort_restart"));
}
