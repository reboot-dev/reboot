use std::{collections::HashMap, future::Future, pin::Pin, sync::Arc};

use prost::Message;
use reboot::{
    application_host::{ApplicationHost, LegacyRecoveryMetadata},

    durable_coordinator::{
        CoordinatorRecovery, ParticipantResolver, ParticipantTarget, TonicCoordinatorSidecar,
        TonicParticipantEndpoint,
    },
    durable_participant::{DurableActorParticipant, ParticipantRecovery, TonicParticipantSidecar},
    legacy_coordinator::TonicCoordinatorWatchEndpoint,
    runtime::{
        DatabaseActorStore, InboundTransactionStartFactory, RootTransactionStart,
        RootTransactionStartFactory, TransactionContext, TransactionExecution,
        TransactionalChannelResolver,
    },
};
use tonic::transport::Channel;
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

#[derive(Clone)]
struct Routes {
    participants: Arc<HashMap<String, String>>,
}
#[tonic::async_trait]
impl TransactionalChannelResolver for Routes {
    async fn resolve(&self, _: &str, state_ref: &str) -> Result<Channel, tonic::Status> {
        let endpoint = self
            .participants
            .get(state_ref)
            .cloned()
            .ok_or_else(|| tonic::Status::not_found("unexpected application route"))?;
        Channel::from_shared(endpoint)
            .unwrap()
            .connect()
            .await
            .map_err(|error| tonic::Status::unavailable(error.to_string()))
    }
}
impl ParticipantResolver for Routes {
    type Endpoint = TonicParticipantEndpoint;
    fn resolve(
        &self,
        participant: &ParticipantTarget,
    ) -> Pin<Box<dyn Future<Output = Result<Arc<Self::Endpoint>, tonic::Status>> + Send + '_>> {
        let endpoint = self.participants.get(&participant.state_ref).cloned();
        Box::pin(async move {
            let endpoint =
                endpoint.ok_or_else(|| tonic::Status::not_found("unexpected participant route"))?;
            TonicParticipantEndpoint::connect(endpoint)
                .await
                .map(Arc::new)
                .map_err(|error| tonic::Status::unavailable(error.to_string()))
        })
    }
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
    Root(Root),
}
#[tonic::async_trait]
impl generated::TransactionCounterWritesMethodsTransactionHandler for Handler {
    async fn query(
        &self,
        state: &proto::TransactionCounter,
        _: proto::TransactionIncrementRequest,
    ) -> Result<proto::TransactionCounterValue, tonic::Status> {
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
        state.value += request.amount;
        if let Self::Root(root) = self {
            root.client
                .increment(
                    context,
                    &generated::TransactionCounterWritesMethodsTarget::new("target"),
                    request.clone(),
                )
                .await?;
        }
        let mut result =
            TransactionExecution::new(proto::TransactionCounterValue { value: state.value });
        result.final_state = Some(state.encode_to_vec());
        Ok(result)
    }
    async fn factory_increment(
        &self,
        _: &TransactionContext,
        state: &mut proto::TransactionCounter,
        request: proto::TransactionIncrementRequest,
    ) -> Result<TransactionExecution<proto::TransactionCounterValue>, tonic::Status> {
        if request.amount < 0 {
            return Err(tonic::Status::invalid_argument(
                "factory handler rejected request",
            ));
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
            root.client
                .increment(
                    context,
                    &generated::TransactionCounterWritesMethodsTarget::new("target"),
                    request.clone(),
                )
                .await?;
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
        state.value += request.amount;
        Ok(proto::TransactionCounterValue { value: state.value })
    }
}
struct Root {
    client: generated::TransactionCounterWritesMethodsClient<Routes>,
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
    let database_endpoint = arg("--database");
    let root_endpoint = arg("--root");
    let target_endpoint = arg("--target");
    let root_id = Uuid::parse_str(&arg("--root-id")).unwrap();
    let state_ref = optional_arg("--state-ref").unwrap_or_else(|| role.clone());
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
    let mut endpoints = HashMap::new();
    endpoints.insert("root".into(), root_endpoint.clone());
    endpoints.insert(state_ref.clone(), root_endpoint);
    endpoints.insert("target".into(), target_endpoint.clone());
    let routes = Routes {
        participants: Arc::new(endpoints),
    };
    let participant = DurableActorParticipant::new(
        participant_sidecar,
        "tests.reboot.protoc.TransactionCounter",
        state_ref.clone(),
    );
    let coordinator = reboot::durable_coordinator::DurableRootCoordinator::new(
        Arc::clone(&coordinator_sidecar),
        Arc::new(routes.clone()),
    );
    // Any recovered participant can host the legacy Coordinator route for this
    // configured coordinator identity. The decision itself is read from the
    // real C++ sidecar, not a process-local coordinator map.
    let coordinator_state_ref =
        optional_arg("--coordinator-state-ref").unwrap_or_else(|| "root".into());

    let starts = Starts {
        root: root_id,
        child: Uuid::from_u128(2),
    };
    let handler = if role == "root" {
        Handler::Root(Root {
            client: generated::TransactionCounterWritesMethodsClient::new(routes.clone()),
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
    let address = listen.parse().unwrap();
    // The generated adapter, rather than fixture-only construction, supplies
    // the exact injected Participant and Coordinator control services. For
    // recovery the host owns their listener-first lifecycle and receives the
    // same explicit C++ Database recovery metadata the old fixture passed by
    // hand: the one configured shard, no state-tag filter, and this actor's
    // exact coordinator state reference.
    let mut host = ApplicationHost::new("generated-cxx-database-process");
    if has("--recover") {
        let endpoint = format!("http://{listen}");
        let watch = Arc::new(TonicCoordinatorWatchEndpoint::lazy(endpoint).unwrap());
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
    let server = tokio::spawn(async move {
        host.add_legacy_control_service(adapter.legacy_participant_control_service())
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
            .await
            .unwrap();
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
        let mut request = tonic::Request::new(proto::TransactionIncrementRequest { amount });
        let mut headers = reboot::RebootHeaders::new(&state_ref);
        headers.idempotency_key = optional_arg("--idempotency-key")
            .map(|key| Uuid::parse_str(&key).expect("--idempotency-key must be a UUID"));
        *request.metadata_mut() = headers.to_metadata().unwrap();
        if has("--shared-invoke") {
            client.shared_read(request).await.unwrap();
        } else if has("--factory-target-invoke") {
            client.factory_increment_target(request).await.unwrap();
        } else if has("--factory-invoke") {
            client.factory_increment(request).await.unwrap();
        } else {
            client.increment(request).await.unwrap();
        }
        if has("--exit-after-invoke") {
            return;
        }
    }
    server.await.unwrap();
}
