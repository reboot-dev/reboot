//! Durable implementation of the legacy `rbt.v1alpha1.Coordinator.Watch` seam.
//!
//! The host never owns a process-local decision map. It reads the immutable
//! sidecar decision keyed by root UUID and its injected coordinator identity.

use std::{future::Future, pin::Pin, sync::Arc};

use tonic::{Request, Response, Status};
use uuid::Uuid;

use crate::{database_proto as proto, durable_coordinator::CoordinatorSidecar};

/// Host-routed legacy Coordinator transport used only after a participant has
/// reconstructed a durable prepared record. It is deliberately separate from
/// the Database sidecar: the Coordinator endpoint is an application route,
/// not something the SDK derives from a state reference.
pub type CoordinatorWatchFuture<'a, T> =
    Pin<Box<dyn Future<Output = Result<T, Status>> + Send + 'a>>;

pub trait CoordinatorWatchEndpoint: Send + Sync + 'static {
    fn watch(
        &self,
        request: proto::WatchRequest,
    ) -> CoordinatorWatchFuture<'_, proto::WatchResponse>;
}

/// Tonic implementation for a Coordinator route already selected by the host.
pub struct TonicCoordinatorWatchEndpoint {
    client:
        tokio::sync::Mutex<proto::coordinator_client::CoordinatorClient<tonic::transport::Channel>>,
}

impl TonicCoordinatorWatchEndpoint {
    pub async fn connect(endpoint: impl AsRef<str>) -> Result<Self, tonic::transport::Error> {
        Ok(Self {
            client: tokio::sync::Mutex::new(
                proto::coordinator_client::CoordinatorClient::connect(endpoint.as_ref().to_owned())
                    .await?,
            ),
        })
    }
}

impl CoordinatorWatchEndpoint for TonicCoordinatorWatchEndpoint {
    fn watch(
        &self,
        request: proto::WatchRequest,
    ) -> CoordinatorWatchFuture<'_, proto::WatchResponse> {
        Box::pin(async move {
            self.client
                .lock()
                .await
                .watch(request)
                .await
                .map(Response::into_inner)
        })
    }
}

#[derive(Clone)]
pub struct DurableCoordinatorWatchHost<C: CoordinatorSidecar> {
    sidecar: Arc<C>,
    coordinator_state_type: String,
    coordinator_state_ref: String,
}

impl<C: CoordinatorSidecar> DurableCoordinatorWatchHost<C> {
    pub fn new(
        sidecar: Arc<C>,
        coordinator_state_type: impl Into<String>,
        coordinator_state_ref: impl Into<String>,
    ) -> Result<Self, Status> {
        let result = Self {
            sidecar,
            coordinator_state_type: coordinator_state_type.into(),
            coordinator_state_ref: coordinator_state_ref.into(),
        };
        if result.coordinator_state_type.is_empty() || result.coordinator_state_ref.is_empty() {
            return Err(Status::invalid_argument(
                "coordinator state identity must be specified",
            ));
        }
        Ok(result)
    }

    fn commit_includes(
        decision: &proto::TransactionCoordinatorDecision,
        state_type: &str,
        state_ref: &str,
    ) -> bool {
        decision
            .participants
            .as_ref()
            .and_then(|participants| participants.should_commit.get(state_type))
            .is_some_and(|refs| {
                refs.state_refs
                    .iter()
                    .any(|candidate| candidate == state_ref)
            })
    }
}

#[tonic::async_trait]
impl<C: CoordinatorSidecar> proto::coordinator_server::Coordinator
    for DurableCoordinatorWatchHost<C>
{
    async fn watch(
        &self,
        request: Request<proto::WatchRequest>,
    ) -> Result<Response<proto::WatchResponse>, Status> {
        let request = request.into_inner();
        let root = Uuid::from_slice(&request.transaction_id)
            .map_err(|_| Status::invalid_argument("transaction_id must be a 16-byte UUID"))?;
        if request.state_type.is_empty() || request.state_ref.is_empty() {
            return Err(Status::invalid_argument(
                "participant state type and reference must be specified",
            ));
        }
        let response = self
            .sidecar
            .decision_get(proto::TransactionCoordinatorDecisionGetRequest {
                root_transaction_id: root.as_bytes().to_vec(),
                coordinator_state_ref: self.coordinator_state_ref.clone(),
            })
            .await?;
        let decision = response.decision.ok_or_else(|| {
            // No terminal record is deliberately non-definitive. Do not turn
            // it into an abort: callers must retry after transport/lifecycle races.
            Status::unavailable("durable coordinator decision is not available")
        })?;
        if decision.coordinator_state_ref != self.coordinator_state_ref {
            return Err(Status::data_loss(
                "durable decision coordinator identity mismatch",
            ));
        }
        match proto::transaction_coordinator_decision::Outcome::try_from(decision.outcome) {
            Ok(proto::transaction_coordinator_decision::Outcome::Abort) => {
                Ok(Response::new(proto::WatchResponse { aborted: true }))
            }
            Ok(proto::transaction_coordinator_decision::Outcome::Commit) => {
                if !Self::commit_includes(&decision, &request.state_type, &request.state_ref) {
                    return Err(Status::failed_precondition(
                        "participant is not a member of the durable commit decision",
                    ));
                }
                Ok(Response::new(proto::WatchResponse { aborted: false }))
            }
            _ => Err(Status::data_loss(
                "durable coordinator decision outcome is invalid",
            )),
        }
    }
}
