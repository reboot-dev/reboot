use std::{collections::HashMap, future::Future, pin::Pin, sync::Arc};

use prost::Message;
use reboot::{
    database_proto as database,
    durable_coordinator::{
        CoordinatorRecovery, ParticipantResolver, ParticipantTarget, TonicCoordinatorSidecar,
        TonicParticipantEndpoint,
    },
    durable_participant::{
        DurableActorParticipant, DurableActorParticipantHost, ParticipantRecovery,
        TonicParticipantSidecar,
    },
    legacy_coordinator::{DurableCoordinatorWatchHost, TonicCoordinatorWatchEndpoint},
    runtime::{
        DatabaseActorStore, InboundTransactionStartFactory, RootTransactionStart,
        RootTransactionStartFactory, TransactionContext, TransactionExecution,
        TransactionalChannelResolver,
    },
};
use tonic::transport::{Channel, Server};
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
impl generated::TransactionCounterWritesTransactionHandler for Handler {
    async fn read(
        &self,
        state: &proto::TransactionCounter,
        _: proto::TransactionIncrementRequest,
    ) -> Result<proto::TransactionCounterValue, tonic::Status> {
        Ok(proto::TransactionCounterValue { value: state.value })
    }

    async fn write(
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
                    &generated::TransactionCounterWritesTarget::new("target"),
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
                    &generated::TransactionCounterWritesTarget::new("target"),
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
        _: &TransactionContext,
        state: &mut proto::TransactionCounter,
        _: proto::TransactionIncrementRequest,
    ) -> Result<TransactionExecution<proto::TransactionCounterValue>, tonic::Status> {
        Ok(TransactionExecution::new(proto::TransactionCounterValue {
            value: state.value,
        }))
    }
}
struct Root {
    client: generated::TransactionCounterWritesClient<Routes>,
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
    let participant_host = DurableActorParticipantHost::new(participant.clone());
    let coordinator = reboot::durable_coordinator::DurableRootCoordinator::new(
        Arc::clone(&coordinator_sidecar),
        Arc::new(routes.clone()),
    );
    // Any recovered participant can host the legacy Coordinator route for this
    // configured coordinator identity. The decision itself is read from the
    // real C++ sidecar, not a process-local coordinator map.
    let coordinator_state_ref =
        optional_arg("--coordinator-state-ref").unwrap_or_else(|| "root".into());
    let coordinator_watch = DurableCoordinatorWatchHost::new(
        coordinator_sidecar,
        "tests.reboot.protoc.TransactionCounter",
        &coordinator_state_ref,
    )
    .unwrap();
    let starts = Starts {
        root: root_id,
        child: Uuid::from_u128(2),
    };
    let handler = if role == "root" {
        Handler::Root(Root {
            client: generated::TransactionCounterWritesClient::new(routes.clone()),
        })
    } else {
        Handler::Target
    };
    let store = DatabaseActorStore::connect(&database_endpoint)
        .await
        .unwrap();
    let adapter = generated::TransactionCounterWritesTransactionAdapter::new(
        store,
        participant.clone(),
        coordinator,
        starts,
        handler,
    );
    let address = listen.parse().unwrap();
    let server = tokio::spawn(async move {
        Server::builder()
            .layer(reboot::successful_trailers::SuccessfulParticipantTrailerLayer)
            .add_service(database::participant_server::ParticipantServer::new(
                participant_host,
            ))
            .add_service(database::coordinator_server::CoordinatorServer::new(
                coordinator_watch,
            ))
            .add_service(
                proto::transaction_counter_writes_server::TransactionCounterWritesServer::new(
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
            match proto::transaction_counter_writes_client::TransactionCounterWritesClient::connect(
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
        *request.metadata_mut() = reboot::RebootHeaders::new(&state_ref)
            .to_metadata()
            .unwrap();
        if has("--factory-target-invoke") {
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
    if has("--recover") {
        // The server task and recovery path start together. Retry our own
        // Coordinator route until the Tonic listener is bound; connection
        // refusal is startup timing, not a terminal Watch result.
        let endpoint = format!("http://{listen}");
        let watch = loop {
            match TonicCoordinatorWatchEndpoint::connect(endpoint.clone()).await {
                Ok(watch) => break watch,
                Err(_) => tokio::time::sleep(std::time::Duration::from_millis(10)).await,
            }
        };
        participant
            .recover_and_watch(
                ParticipantRecovery {
                    shard_ids: vec!["s000000000".into()],
                    ..Default::default()
                },
                &watch,
            )
            .await
            .unwrap();
        if role == "target" {
            reboot::durable_participant::test_support::signal_watch_terminalized().unwrap();
        }
        if role == "root" {
            reboot::durable_coordinator::DurableRootCoordinator::new(
                Arc::new(
                    TonicCoordinatorSidecar::connect(&database_endpoint)
                        .await
                        .unwrap(),
                ),
                Arc::new(routes),
            )
            .recover(CoordinatorRecovery {
                shard_ids: vec!["s000000000".into()],
                coordinator_state_ref: coordinator_state_ref.clone(),
                ..Default::default()
            })
            .await
            .unwrap();
        }
    }
    server.await.unwrap();
}
