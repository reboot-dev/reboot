use std::sync::{
    Arc,
    atomic::{AtomicBool, Ordering},
};

use base64::{Engine as _, engine::general_purpose::URL_SAFE_NO_PAD};
use prost::Message;
use reboot::{
    application_host::{ApplicationHost, LegacyRecoveryMetadata, PlacementPlannerRecovery},
    durable_coordinator::{CoordinatorRecovery, TonicCoordinatorSidecar},
    durable_participant::{DurableActorParticipant, ParticipantRecovery, TonicParticipantSidecar},
    legacy_coordinator::LegacyApplicationCoordinatorWatchEndpoint,
    legacy_placement::{
        LegacyApplicationId, LegacyApplicationParticipantResolver, LegacyApplicationResolver,
        PlanOnlyLegacyPlacement,
    },
    runtime::{
        DatabaseActorStore, InboundTransactionStartFactory, RootTransactionStart,
        RootTransactionStartFactory, TransactionContext, TransactionExecution,
    },
};
use uuid::Uuid;

pub mod proto {
    tonic::include_proto!("tests.reboot.protoc");
}
mod generated {
    include!(concat!(
        env!("OUT_DIR"),
        "/tests/reboot/protoc/transaction_counter.reboot.rs"
    ));
}

struct Starts {
    root: Uuid,
    child: Uuid,
}
impl RootTransactionStartFactory for Starts {
    fn next_root_transaction(&self) -> Result<RootTransactionStart, tonic::Status> {
        Ok(RootTransactionStart {
            transaction_id: self.root,
            timestamp: prost_types::Timestamp::default(),
        })
    }
}
impl InboundTransactionStartFactory for Starts {
    fn next_inbound_transaction(
        &self,
        _: &reboot::runtime::InboundTransactionContext,
    ) -> Result<Uuid, tonic::Status> {
        Ok(self.child)
    }
}

enum Handler {
    Target,
    Tasks { state_ref: String, marker: String, block: bool, vector: String },
    Root(Root),
}
#[tonic::async_trait]
impl generated::TransactionCounterWritesMethodsTransactionHandler for Handler {
    async fn query(
        &self,
        state: &proto::TransactionCounter,
        request: proto::TransactionIncrementRequest,
    ) -> Result<proto::TransactionCounterValue, tonic::Status> {
        if let Self::Tasks { marker, block, .. } = self {
            if request.amount == 9000 {
                std::fs::write(marker, state.value.to_string()).unwrap();
                if *block { std::future::pending::<()>().await; }
            }
        }
        Ok(proto::TransactionCounterValue { value: state.value })
    }

    async fn apply(
        &self,
        state: &mut proto::TransactionCounter,
        request: proto::TransactionIncrementRequest,
    ) -> Result<proto::TransactionCounterValue, tonic::Status> {
        state.value += request.amount;
        Ok(proto::TransactionCounterValue { value: state.value })
    }

    async fn increment(
        &self,
        context: &TransactionContext,
        state: &mut proto::TransactionCounter,
        request: proto::TransactionIncrementRequest,
    ) -> Result<TransactionExecution<proto::TransactionCounterValue>, tonic::Status> {
        if request.amount == -9000 {
            if let Self::Tasks { marker, .. } = self {
                std::fs::write(format!("{marker}.cancel"), "handler entered before durable handoff").unwrap();
                std::future::pending::<()>().await;
            }
        }
        state.value += request.amount;
        if let Self::Root(root) = self {
            // The ordinary legacy recovery acceptance uses the first target.
            // This branch deliberately enlists two independently routed remote
            // actors so the root coordinator's concurrent Prepare fan-out and
            // post-decision recovery retain the whole durable participant set.
            let targets: &[&str] = if root.multi_participant {
                &["target-a", "target-b"]
            } else {
                &["target"]
            };
            for target in targets {
                match root.client
                    .increment(
                        context,
                        &generated::TransactionCounterWritesMethodsTarget::new(*target),
                        request.clone(),
                    )
                    .await
                {
                    Ok(_) | Err(generated::TransactionCounterWritesMethodsIncrementError::TransactionLimitExceeded(_)) => {}
                    Err(generated::TransactionCounterWritesMethodsIncrementError::System(error)) if error.is_recoverable() => {}
                    Err(generated::TransactionCounterWritesMethodsIncrementError::System(error)) => return Err(tonic::Status::unavailable(format!("unrecoverable remote system abort: {error:?}"))),
                    Err(generated::TransactionCounterWritesMethodsIncrementError::Grpc(error)) => return Err(error),
                }
            }
        }
        if let Self::Tasks { state_ref, vector, .. } = self {
            let mut execution = TransactionExecution::new(proto::TransactionCounterValue { value: state.value });
            let mut task = generated::TransactionCounterWritesMethodsTasks::query(state_ref, &proto::TransactionIncrementRequest { amount: 9000 });
            if let Some(id) = vector.strip_prefix("reuse:") { task.task_id.as_mut().unwrap().task_uuid = uuid::Uuid::parse_str(id).unwrap().as_bytes().to_vec(); }
            match vector.as_str() {
                "unknown" => task.method = "Missing".into(),
                "writer" => task.method = "Apply".into(),
                "malformed" => task.request = vec![0xff],
                "identity" => task.task_id.as_mut().unwrap().state_ref = "other".into(),
                "uuid" => task.task_id.as_mut().unwrap().task_uuid = vec![1],
                "uuid-version" => task.task_id.as_mut().unwrap().task_uuid[6] = 0x70,
                "uuid-variant" => task.task_id.as_mut().unwrap().task_uuid[8] = 0,
                "schedule" => task.timestamp = Some(prost_types::Timestamp { seconds: i64::MAX, nanos: 0 }),
                "iteration" => task.iteration = 1,
                _ => {}
            }
            if vector == "duplicate" { execution.task_upserts.push(task.clone()); }
            if vector == "capacity" { execution.task_upserts = vec![task.clone(); 1024]; }
            execution.task_upserts.push(task);
            return Ok(execution);
        }
        // Deliberately leave final_state unset: the fresh exclusive generated
        // adapter must durably materialize the handler-mutated state.
        Ok(TransactionExecution::new(proto::TransactionCounterValue {
            value: state.value,
        }))
    }
    async fn factory_increment(
        &self,
        _: &TransactionContext,
        state: &mut proto::TransactionCounter,
        request: proto::TransactionIncrementRequest,
    ) -> Result<TransactionExecution<proto::TransactionCounterValue>, generated::TransactionCounterWritesMethodsFactoryIncrementError> {
        if request.amount == 13 {
            return Err(generated::TransactionCounterWritesMethodsFactoryIncrementError::TransactionLimitExceeded(proto::TransactionLimitExceeded { limit: request.amount }));
        }
        if request.amount < 0 {
            return Err(generated::TransactionCounterWritesMethodsFactoryIncrementError::Grpc(tonic::Status::invalid_argument(
                "factory handler rejected request",
            )));
        }
        state.value += request.amount;
        // Deliberately leave final_state unset: the generated factory adapter
        // must durably materialize the state it gave the handler.
        Ok(TransactionExecution::new(proto::TransactionCounterValue {
            value: state.value,
        }))
    }
    async fn factory_increment_target(
        &self,
        context: &TransactionContext,
        state: &mut proto::TransactionCounter,
        request: proto::TransactionIncrementRequest,
    ) -> Result<TransactionExecution<proto::TransactionCounterValue>, tonic::Status> {
        if request.amount < 0 {
            return Err(tonic::Status::invalid_argument(
                "factory handler rejected request",
            ));
        }
        state.value += request.amount;
        if let Self::Root(root) = self {
            match root.client
                .increment(
                    context,
                    &generated::TransactionCounterWritesMethodsTarget::new("target"),
                    request.clone(),
                )
                .await
            {
                Ok(_) | Err(generated::TransactionCounterWritesMethodsIncrementError::TransactionLimitExceeded(_)) => {}
                Err(generated::TransactionCounterWritesMethodsIncrementError::System(error)) if error.is_recoverable() => {}
                Err(generated::TransactionCounterWritesMethodsIncrementError::System(error)) => return Err(tonic::Status::unavailable(format!("unrecoverable remote system abort: {error:?}"))),
                Err(generated::TransactionCounterWritesMethodsIncrementError::Grpc(error)) => return Err(error),
            }
        }
        Ok(TransactionExecution::new(proto::TransactionCounterValue {
            value: state.value,
        }))
    }
    async fn shared_read(
        &self,
        context: &TransactionContext,
        state: &mut proto::TransactionCounter,
        _: proto::TransactionIncrementRequest,
    ) -> Result<TransactionExecution<proto::TransactionCounterValue>, tonic::Status> {
        shared_barrier(context.transaction_root_id()).await?;
        Ok(TransactionExecution::new(proto::TransactionCounterValue {
            value: state.value,
        }))
    }

    async fn shared_read_fresh_shared(
        &self,
        _: &reboot::runtime::SharedLocalTransactionContext,
        state: &mut proto::TransactionCounter,
        request: proto::TransactionIncrementRequest,
    ) -> Result<proto::TransactionCounterValue, tonic::Status> {
        if std::env::var_os("REBOOT_TEST_FRESH_SHARED_NOOP").is_some() {
            if let Some(root) = std::env::var_os("REBOOT_TEST_SHARED_BARRIER_ID") {
                let root = root.to_string_lossy().parse().map_err(|error| {
                    tonic::Status::invalid_argument(format!("invalid shared barrier id: {error}"))
                })?;
                shared_barrier(root).await?;
            }
            return Ok(proto::TransactionCounterValue { value: state.value });
        }
        state.value += request.amount;
        Ok(proto::TransactionCounterValue { value: state.value })
    }
}
struct Root {
    client: generated::TransactionCounterWritesMethodsClient<LegacyApplicationResolver>,
    multi_participant: bool,
}

/// The direct external-unary acceptance intentionally does not mount legacy
/// placement or transaction control routes. Its generated adapter persists
/// through the real C++ Database sidecar only.
struct ExternalConstructorHandler;

#[tonic::async_trait]
impl generated::ExternalConstructorMethodsDatabaseHandler for ExternalConstructorHandler {
    async fn construct(
        &self,
        state: &mut proto::ExternalConstructorCounter,
        request: proto::ExternalConstructorRequest,
    ) -> Result<
        proto::ExternalConstructorValue,
        generated::ExternalConstructorMethodsConstructError,
    > {
        if request.amount < 0 {
            return Err(
                generated::ExternalConstructorMethodsConstructError::ExternalConstructorLimitExceeded(
                    proto::ExternalConstructorLimitExceeded { limit: 9 },
                ),
            );
        }
        state.value += request.amount;
        Ok(proto::ExternalConstructorValue { value: state.value })
    }
}

/// Converts the first successful generated adapter response into `Unavailable`.
struct FirstSuccessfulExternalConstructorUnavailable {
    inner: generated::ExternalConstructorMethodsDatabaseAdapter<ExternalConstructorHandler>,
    surfaced: AtomicBool,
}

#[tonic::async_trait]
impl proto::external_constructor_methods_server::ExternalConstructorMethods
    for FirstSuccessfulExternalConstructorUnavailable
{
    async fn construct(
        &self,
        request: tonic::Request<proto::ExternalConstructorRequest>,
    ) -> Result<tonic::Response<proto::ExternalConstructorValue>, tonic::Status> {
        let response = self.inner.construct(request).await?;
        if !self.surfaced.swap(true, Ordering::SeqCst) {
            return Err(tonic::Status::unavailable(
                "first successful generated adapter response",
            ));
        }
        Ok(response)
    }
}

/// A deliberately small, separately hosted service used only by the C++
/// Database process test. The root still calls it through the generated
/// transactional client; this server owns only the remote error wire shape.
struct TransactionRichErrorService;

#[tonic::async_trait]
impl proto::transaction_counter_writes_methods_server::TransactionCounterWritesMethods
    for TransactionRichErrorService
{
    async fn query(
        &self,
        _: tonic::Request<proto::TransactionIncrementRequest>,
    ) -> Result<tonic::Response<proto::TransactionCounterValue>, tonic::Status> {
        Err(tonic::Status::unimplemented("fixture"))
    }
    async fn apply(
        &self,
        _: tonic::Request<proto::TransactionIncrementRequest>,
    ) -> Result<tonic::Response<proto::TransactionCounterValue>, tonic::Status> {
        Err(tonic::Status::unimplemented("fixture"))
    }
    async fn increment(
        &self,
        request: tonic::Request<proto::TransactionIncrementRequest>,
    ) -> Result<tonic::Response<proto::TransactionCounterValue>, tonic::Status> {
        let declared = prost_types::Any {
            type_url: "type.googleapis.com/tests.reboot.protoc.TransactionLimitExceeded".into(),
            value: proto::TransactionLimitExceeded { limit: 9 }.encode_to_vec(),
        };
        let status = match request.into_inner().amount {
            100 => googleapis_tonic_google_rpc::google::rpc::Status {
                code: tonic::Code::InvalidArgument as i32,
                message: "remote fixture".into(),
                details: vec![declared],
            },
            // The rich outer code disagrees with the gRPC status code.
            101 => googleapis_tonic_google_rpc::google::rpc::Status {
                code: tonic::Code::Unknown as i32,
                message: "remote fixture".into(),
                details: vec![declared],
            },
            // A Reboot backend error that Python permits callers to catch
            // while the root transaction continues.
            104 => {
                return Err(
                    reboot::SystemAborted::NotFound(reboot::database_proto::NotFound {})
                        .into_status("remote state is absent"),
                );
            }
            // Reboot sourced this outcome, but it still requires the whole
            // root transaction to retry rather than committing through it.
            105 => {
                return Err(reboot::SystemAborted::TransactionShouldRetry(
                    reboot::database_proto::TransactionShouldRetry {
                        reason: reboot::database_proto::transaction_should_retry::Reason::RestartDetected as i32,
                        retry_age: "fixture".into(),
                    },
                )
                .into_status("remote transaction must retry"));
            }
            // A trailer which cannot decode as google.rpc.Status.
            102 => {
                return Err(tonic::Status::with_details(
                    tonic::Code::InvalidArgument,
                    "remote fixture",
                    vec![0xff].into(),
                ));
            }
            // A normal gRPC error with no rich status trailer.
            _ => return Err(tonic::Status::not_found("remote no trailer")),
        };
        let code = match status.code {
            5 => tonic::Code::NotFound,
            14 => tonic::Code::Unavailable,
            _ => tonic::Code::InvalidArgument,
        };
        let message = status.message.clone();
        Err(tonic::Status::with_details(
            code,
            message,
            status.encode_to_vec().into(),
        ))
    }
    async fn factory_increment(
        &self,
        _: tonic::Request<proto::TransactionIncrementRequest>,
    ) -> Result<tonic::Response<proto::TransactionCounterValue>, tonic::Status> {
        Err(tonic::Status::unimplemented("fixture"))
    }
    async fn factory_increment_target(
        &self,
        _: tonic::Request<proto::TransactionIncrementRequest>,
    ) -> Result<tonic::Response<proto::TransactionCounterValue>, tonic::Status> {
        Err(tonic::Status::unimplemented("fixture"))
    }
    async fn shared_read(
        &self,
        _: tonic::Request<proto::TransactionIncrementRequest>,
    ) -> Result<tonic::Response<proto::TransactionCounterValue>, tonic::Status> {
        Err(tonic::Status::unimplemented("fixture"))
    }
}

fn arg(name: &str) -> String {
    std::env::args()
        .skip_while(|arg| arg != name)
        .nth(1)
        .unwrap_or_else(|| panic!("missing {name}"))
}
fn has(name: &str) -> bool {
    std::env::args().any(|arg| arg == name)
}
fn optional_arg(name: &str) -> Option<String> {
    let mut args = std::env::args();
    while let Some(arg) = args.next() {
        if arg == name {
            return args.next();
        }
    }
    None
}

fn placement() -> (PlanOnlyLegacyPlacement, Option<PlacementPlannerRecovery>) {
    let placement = PlanOnlyLegacyPlacement::new();
    if let Some(endpoint) = optional_arg("--placement-planner") {
        let recovery = PlacementPlannerRecovery::new(endpoint, placement.clone())
            .expect("--placement-planner must be a valid URI");
        return (placement, Some(recovery));
    }
    let encoded = arg("--legacy-placement-plan");
    let bytes = URL_SAFE_NO_PAD
        .decode(encoded)
        .expect("--legacy-placement-plan must be URL-safe base64 without padding");
    let plan = reboot::placement_proto::ListenForPlanResponse::decode(bytes.as_slice())
        .expect("--legacy-placement-plan must contain ListenForPlanResponse bytes");
    placement
        .install(plan)
        .expect("--legacy-placement-plan must be accepted");
    (placement, None)
}

/// Test-only cross-process barrier proving shared handlers overlap before
/// either read-only participant is released at Prepare.
async fn shared_barrier(transaction_id: Uuid) -> Result<(), tonic::Status> {
    let Some(directory) = std::env::var_os("REBOOT_TEST_SHARED_BARRIER_DIR") else {
        return Ok(());
    };
    std::fs::create_dir_all(&directory)
        .map_err(|error| tonic::Status::internal(error.to_string()))?;
    std::fs::write(
        std::path::Path::new(&directory).join(transaction_id.to_string()),
        [],
    )
    .map_err(|error| tonic::Status::internal(error.to_string()))?;
    for _ in 0..400 {
        let arrivals = std::fs::read_dir(&directory)
            .map_err(|error| tonic::Status::internal(error.to_string()))?
            .count();
        if arrivals >= 2 {
            return Ok(());
        }
        tokio::time::sleep(std::time::Duration::from_millis(10)).await;
    }
    Err(tonic::Status::deadline_exceeded(
        "shared transaction barrier did not observe both callers",
    ))
}

#[tokio::main]
async fn main() {
    let role = arg("--role");
    let listen = arg("--listen");
    if role == "error-remote" {
        tonic::transport::Server::builder()
            .add_service(
                proto::transaction_counter_writes_methods_server::TransactionCounterWritesMethodsServer::new(
                    TransactionRichErrorService,
                ),
            )
            .serve(listen.parse().unwrap())
            .await
            .unwrap();
        return;
    }
    if role == "external-constructor" {
        let database_endpoint = arg("--database");
        let state_ref = optional_arg("--state-ref").unwrap_or_else(|| role.clone());
        let store = DatabaseActorStore::connect(&database_endpoint).await.unwrap();
        let adapter = generated::ExternalConstructorMethodsDatabaseAdapter::new(
            store,
            ExternalConstructorHandler,
        );
        let address = listen.parse().unwrap();
        let surface_first_success_unavailable = has("--surface-first-success-unavailable");
        let server = tokio::spawn(async move {
            let mut server = tonic::transport::Server::builder();
            if surface_first_success_unavailable {
                server
                    .add_service(proto::external_constructor_methods_server::ExternalConstructorMethodsServer::new(
                        FirstSuccessfulExternalConstructorUnavailable { inner: adapter, surfaced: AtomicBool::new(false) },
                    ))
                    .serve(address)
                    .await
                    .unwrap();
            } else {
                server
                    .add_service(proto::external_constructor_methods_server::ExternalConstructorMethodsServer::new(adapter))
                    .serve(address)
                    .await
                    .unwrap();
            }
        });
        if has("--invoke") {
            let endpoint = format!("http://{listen}");
            let context = reboot::ExternalContext::new(&state_ref);
            let channel = loop {
                match context.connect(endpoint.clone()).await {
                    Ok(channel) => break channel,
                    Err(_) => tokio::time::sleep(std::time::Duration::from_millis(10)).await,
                }
            };
            let mut client = generated::ExternalConstructorMethodsExternalClient::new(channel, context);
            let amount = optional_arg("--amount")
                .map(|amount| amount.parse().expect("--amount must be i64"))
                .unwrap_or(7);
            let key = optional_arg("--idempotency-key")
                .expect("external constructor requires --idempotency-key")
                .parse()
                .expect("--idempotency-key must be a UUID");
            match client
                .construct_with_key(proto::ExternalConstructorRequest { amount }, key)
                .await
            {
                Ok(_) if has("--expect-declared-constructor-error") => {
                    panic!("constructor unexpectedly succeeded")
                }
                Ok(_) => {}
                Err(generated::ExternalConstructorMethodsConstructError::ExternalConstructorLimitExceeded(error))
                    if has("--expect-declared-constructor-error") =>
                {
                    assert_eq!(error, proto::ExternalConstructorLimitExceeded { limit: 9 });
                }
                Err(error) => panic!("external constructor invocation failed: {error:?}"),
            }
        }
        if has("--exit-after-invoke") {
            server.abort();
            return;
        }
        server.await.unwrap();
        return;
    }
    let database_endpoint = arg("--database");
    let root_id = Uuid::parse_str(&arg("--root-id")).unwrap();
    let state_ref = optional_arg("--state-ref").unwrap_or_else(|| role.clone());
    let (placement, planner_recovery) = placement();
    let application = LegacyApplicationId::new("generated-cxx-database-process").unwrap();
    let participant_sidecar = Arc::new(
        TonicParticipantSidecar::connect(&database_endpoint)
            .await
            .unwrap(),
    );
    let coordinator_sidecar = Arc::new(
        TonicCoordinatorSidecar::connect(&database_endpoint)
            .await
            .unwrap(),
    );
    let participant = DurableActorParticipant::new(
        participant_sidecar,
        "tests.reboot.protoc.TransactionCounter",
        state_ref.clone(),
    );
    let coordinator = reboot::durable_coordinator::DurableRootCoordinator::new(
        Arc::clone(&coordinator_sidecar),
        Arc::new(LegacyApplicationParticipantResolver::new(
            application.clone(),
            placement.clone(),
        )),
    );
    // Any recovered participant can host the legacy Coordinator route for this
    // configured coordinator identity. The decision itself is read from the
    // real C++ sidecar, not a process-local coordinator map.
    let coordinator_state_ref =
        optional_arg("--coordinator-state-ref").unwrap_or_else(|| "root".into());
    let watch_coordinator_state_ref = optional_arg("--watch-coordinator-state-ref")
        .unwrap_or_else(|| coordinator_state_ref.clone());

    let starts = Starts {
        root: root_id,
        child: Uuid::from_u128(2),
    };
    let handler = if role == "tasks" {
        Handler::Tasks { state_ref: state_ref.clone(), marker: arg("--task-marker"), block: has("--block-task"), vector: optional_arg("--task-vector").unwrap_or_default() }
    } else if role == "root" || role == "multi-root" {
        Handler::Root(Root {
            client: generated::TransactionCounterWritesMethodsClient::new(
                LegacyApplicationResolver::new(application.clone(), placement.clone()),
            ),
            multi_participant: role == "multi-root",
        })
    } else {
        Handler::Target
    };
    let store = DatabaseActorStore::connect(&database_endpoint)
        .await
        .unwrap();
    let adapter = generated::TransactionCounterWritesMethodsTransactionAdapter::new(
        store,
        participant.clone(),
        coordinator,
        starts,
        handler,
    );
    let (adapter, tasks) = if role == "tasks" && !has("--no-task-owner") {
        let (adapter, tasks) = adapter.with_one_shot_reader_tasks(&state_ref).unwrap();
        (adapter, Some(tasks))
    } else { (adapter, None) };
    if has("--prove-cancel-before-durable") {
        use proto::transaction_counter_writes_methods_server::TransactionCounterWritesMethods;
        let mut request = tonic::Request::new(proto::TransactionIncrementRequest { amount: -9000 });
        *request.metadata_mut() = reboot::RebootHeaders::new(&state_ref).to_metadata().unwrap();
        assert!(tokio::time::timeout(std::time::Duration::from_secs(1), adapter.increment(request)).await.is_err());
        assert!(std::path::Path::new(&format!("{}.cancel", arg("--task-marker"))).exists());
        // The next ordinary public root below must admit and commit against the
        // same participant, not a reconstructed or manually released actor.
    }
    let address = listen.parse().unwrap();
    // The generated adapter, rather than fixture-only construction, supplies
    // the exact injected Participant and Coordinator control services. For
    // recovery the host owns their listener-first lifecycle and receives the
    // same explicit C++ Database recovery metadata the old fixture passed by
    // hand: the one configured shard, no state-tag filter, and this actor's
    // exact coordinator state reference.
    let mut host = ApplicationHost::new("generated-cxx-database-process")
        .with_legacy_placement_readiness(placement.clone());
    if let Some(planner_recovery) = planner_recovery {
        host = host.with_host_recovery(planner_recovery);
    }
    if has("--recover") {
        let watch = Arc::new(
            LegacyApplicationCoordinatorWatchEndpoint::new(
                application,
                placement,
                watch_coordinator_state_ref,
            )
            .unwrap(),
        );
        let recovery = adapter
            .legacy_recovery_registration(
                LegacyRecoveryMetadata {
                    participant: ParticipantRecovery {
                        shard_ids: vec!["s000000000".into()],
                        ..Default::default()
                    },
                    coordinator: CoordinatorRecovery {
                        shard_ids: vec!["s000000000".into()],
                        coordinator_state_ref: coordinator_state_ref.clone(),
                        ..Default::default()
                    },
                },
                watch,
            )
            .unwrap();
        host = host.with_host_recovery(recovery);
    }
    if let Some(tasks) = tasks {
        host = host.with_host_recovery(tasks.recovery(reboot::database_proto::RecoverRequest {
            state_tags_by_state_type: [("tests.reboot.protoc.TransactionCounter".into(), "TransactionCounter".into())].into(),
            shard_ids: vec!["s000000000".into()], skip_idempotent_mutations: true,
        }));
    }
    let server = tokio::spawn(async move {
        let result = host.add_legacy_control_service(adapter.legacy_participant_control_service())
            .add_legacy_control_service(
                adapter
                    .legacy_coordinator_control_service(
                        "tests.reboot.protoc.TransactionCounter",
                        coordinator_state_ref,
                    )
                    .unwrap(),
            )
            .add_public_service(
                proto::transaction_counter_writes_methods_server::TransactionCounterWritesMethodsServer::new(
                    adapter,
                ),
            )
            .serve(address)
            .await;
        if let Some(marker) = std::env::var_os("REBOOT_TEST_COMPETING_ADMISSION") {
            assert!(matches!(result, Err(reboot::application_host::ApplicationHostError::RecoveryTask(_))));
            std::fs::write(format!("{}.host-returned", marker.to_string_lossy()), "supervised host failure returned with open competing client").unwrap();
            return;
        }
        result.unwrap();
    });
    let competing = std::env::var_os("REBOOT_TEST_COMPETING_ADMISSION").map(|marker| {
        let listen = listen.clone();
        let state_ref = state_ref.clone();
        let ack = std::env::var_os("REBOOT_TEST_LOST_PARTICIPANT_COMMIT_ACK").unwrap();
        tokio::spawn(async move {
            tokio::time::timeout(std::time::Duration::from_secs(3), async {
                while !std::path::Path::new(&ack).exists() { tokio::time::sleep(std::time::Duration::from_millis(5)).await; }
            }).await.unwrap();
            let mut client = proto::transaction_counter_writes_methods_client::TransactionCounterWritesMethodsClient::connect(format!("http://{listen}")).await.unwrap();
            let mut request = tonic::Request::new(proto::TransactionIncrementRequest { amount: 7000 });
            *request.metadata_mut() = reboot::RebootHeaders::new(&state_ref).to_metadata().unwrap();
            // Deliberately no request deadline and no manual client cancellation.
            let status = client.increment(request).await.unwrap_err();
            assert_eq!(status.code(), tonic::Code::Unavailable);
            std::fs::write(format!("{}.released", marker.to_string_lossy()), "already-admitted unary request cancelled by host failure").unwrap();
        })
    });
    if has("--invoke") {
        let endpoint = format!("http://{listen}");
        let mut client = loop {
            match proto::transaction_counter_writes_methods_client::TransactionCounterWritesMethodsClient::connect(
                endpoint.clone(),
            )
            .await
            {
                Ok(client) => break client,
                Err(_) => tokio::time::sleep(std::time::Duration::from_millis(10)).await,
            }
        };
        let amount = optional_arg("--amount")
            .map(|amount| amount.parse().expect("--amount must be i64"))
            .unwrap_or(7);
        let idempotency_key = optional_arg("--idempotency-key")
            .map(|key| Uuid::parse_str(&key).expect("--idempotency-key must be a UUID"));
        let expected_response = optional_arg("--expect-response")
            .map(|value| value.parse::<i64>().expect("--expect-response must be i64"));
        for attempt in 0..100 {
            let mut request = tonic::Request::new(proto::TransactionIncrementRequest { amount });
            let mut headers = reboot::RebootHeaders::new(&state_ref);
            headers.idempotency_key = idempotency_key;
            *request.metadata_mut() = headers.to_metadata().unwrap();
            if let Some(marker) = std::env::var_os("REBOOT_TEST_TASK_ADMISSION_CANCEL") {
                if !std::path::Path::new(&format!("{}.cancelled", marker.to_string_lossy())).exists()
                    || std::env::var_os("REBOOT_TEST_CANCEL_PARTICIPANT_COMMIT_ACK").is_some()
                {
                    request.set_timeout(std::time::Duration::from_millis(350));
                }
            }
            let result = if has("--shared-invoke") {
                client.shared_read(request).await
            } else if has("--factory-target-invoke") {
                client.factory_increment_target(request).await
            } else if has("--factory-invoke") {
                client.factory_increment(request).await
            } else {
                client.increment(request).await
            };
            match result {
                Err(_) if ["REBOOT_TEST_LOST_PARTICIPANT_COMMIT_ACK", "REBOOT_TEST_CANCEL_PARTICIPANT_COMMIT_ACK"].iter().any(|name| std::env::var_os(name).is_some_and(|marker| std::path::Path::new(&marker).exists())) => {
                    break; // Await supervised host failure, never a manual kill.
                }
                Ok(response) => {
                    assert!(!has("--expect-task-error"));
                    if let Some(marker) = optional_arg("--invoke-marker") { std::fs::write(marker, "acknowledged").unwrap(); }
                    if let Some(expected) = expected_response {
                        assert_eq!(response.into_inner().value, expected);
                    }
                    break;
                }
                Err(status) if std::env::var_os("REBOOT_TEST_TASK_ADMISSION_CANCEL").is_some_and(|marker| {
                    std::path::Path::new(&marker).exists() && !std::path::Path::new(&format!("{}.cancelled", marker.to_string_lossy())).exists()
                }) => {
                    assert!(matches!(status.code(), tonic::Code::Cancelled | tonic::Code::DeadlineExceeded), "admission should timeout, not fail: {status}");
                    let mut database = reboot::database_proto::database_client::DatabaseClient::connect(database_endpoint.clone()).await.unwrap();
                    let loaded = database.load(reboot::database_proto::LoadRequest {
                        actors: vec![reboot::database_proto::Actor { state_type: "tests.reboot.protoc.TransactionCounter".into(), state_ref: state_ref.clone(), state: None }],
                        task_ids: vec![],
                    }).await.unwrap().into_inner();
                    assert_eq!(loaded.actors[0].state, Some(vec![0x08, 5]));
                    let mut recovery = database.recover(reboot::database_proto::RecoverRequest {
                        shard_ids: vec!["s000000000".into()], skip_idempotent_mutations: true, ..Default::default()
                    }).await.unwrap().into_inner();
                    while let Some(batch) = recovery.message().await.unwrap() {
                        assert!(batch.pending_tasks.is_empty());
                        assert!(batch.participant_transactions.is_empty());
                        assert!(batch.transaction_coordinators.is_empty());
                    }
                    let marker = std::env::var_os("REBOOT_TEST_TASK_ADMISSION_CANCEL").unwrap();
                    std::fs::write(format!("{}.cancelled", marker.to_string_lossy()), "real sidecar unchanged; cancelled before stage/prepare").unwrap();
                    // Retry through the same generated participant and host. No reset.
                }
                Err(status)
                    if has("--placement-planner") && status.code() == tonic::Code::Unavailable =>
                {
                    if attempt == 99 {
                        panic!("fixture invocation never became ready: {status}");
                    }
                    tokio::time::sleep(std::time::Duration::from_millis(10)).await;
                }
                Err(status) if has("--expect-task-error") => {
                    let vector = arg("--task-vector");
                    let expected = if vector == "capacity" { tonic::Code::ResourceExhausted } else if vector.starts_with("reuse:") { tonic::Code::AlreadyExists } else if vector == "no-owner" { tonic::Code::FailedPrecondition } else { tonic::Code::InvalidArgument };
                    assert_eq!(status.code(), expected, "denial vector {vector}: {status}");
                    break;
                }
                Err(status) if has("--expect-declared-factory-error") => {
                    assert_eq!(status.code(), tonic::Code::Unknown);
                    let details = reboot::declared_error_details(&status)
                        .unwrap()
                        .expect("factory declared error must include rich status details");
                    assert_eq!(
                        details.details[0].type_url,
                        "type.googleapis.com/tests.reboot.protoc.TransactionLimitExceeded"
                    );
                    assert_eq!(
                        proto::TransactionLimitExceeded::decode(details.details[0].value.as_slice())
                            .unwrap(),
                        proto::TransactionLimitExceeded { limit: 13 }
                    );
                    break;
                }
                Err(status) => panic!("fixture invocation failed: {status}"),
            }
        }
        if has("--exit-after-invoke") {
            return;
        }
    }
    server.await.unwrap();
    if let Some(competing) = competing {
        competing.await.unwrap();
        let marker = std::env::var_os("REBOOT_TEST_COMPETING_ADMISSION").unwrap();
        assert!(std::path::Path::new(&format!("{}.host-returned", marker.to_string_lossy())).exists());
        panic!("expected supervised host failure returned after cancelling competing admission");
    }
}
