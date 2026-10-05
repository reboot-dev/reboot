//! Durable implementation of the legacy `rbt.v1alpha1.Coordinator.Watch` seam.
//!
//! The host never owns a process-local decision map. It reads the immutable
//! sidecar decision keyed by root UUID and its injected coordinator identity.

use std::{future::Future, pin::Pin, sync::Arc};

use tonic::{Request, Response, Status};
use uuid::Uuid;

use crate::{
    database_proto as proto,
    durable_coordinator::CoordinatorSidecar,
    legacy_placement::{LegacyApplicationId, PlanOnlyLegacyPlacement},
};

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
    /// Selects a Coordinator route without contacting it. This lets an
    /// [`ApplicationHost`](crate::application_host::ApplicationHost) register
    /// recovery before binding its listener; the first `Watch` RPC opens the
    /// connection only after listener-first startup has begun.
    pub fn lazy(endpoint: impl AsRef<str>) -> Result<Self, tonic::transport::Error> {
        Ok(Self {
            client: tokio::sync::Mutex::new(proto::coordinator_client::CoordinatorClient::new(
                tonic::transport::Endpoint::from_shared(endpoint.as_ref().to_owned())?
                    .connect_lazy(),
            )),
        })
    }

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

/// Legacy application-plane routing for Coordinator Watch recovery.
///
/// Every Watch reads the current validated plan using only the raw coordinator
/// state reference and creates a new lazy Tonic client. This deliberately makes
/// no cache, retry, connection, ownership, or Native2pc claim.
#[derive(Clone)]
pub struct LegacyApplicationCoordinatorWatchEndpoint {
    application: LegacyApplicationId,
    placement: PlanOnlyLegacyPlacement,
}

impl LegacyApplicationCoordinatorWatchEndpoint {
    pub fn new(application: LegacyApplicationId, placement: PlanOnlyLegacyPlacement) -> Self {
        Self {
            application,
            placement,
        }
    }
}

impl CoordinatorWatchEndpoint for LegacyApplicationCoordinatorWatchEndpoint {
    fn watch(
        &self,
        request: proto::WatchRequest,
    ) -> CoordinatorWatchFuture<'_, proto::WatchResponse> {
        let result = self
            .placement
            .route(&self.application, &request.state_ref)
            .and_then(|route| {
                tonic::transport::Endpoint::from_shared(format!(
                    "http://{}",
                    route.address.as_str()
                ))
                .map(|endpoint| {
                    proto::coordinator_client::CoordinatorClient::new(endpoint.connect_lazy())
                })
                .map_err(|_| Status::unavailable("legacy placement route has an invalid endpoint"))
            });
        Box::pin(async move { result?.watch(request).await.map(Response::into_inner) })
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

#[cfg(test)]
mod tests {
    use std::sync::{Arc, Mutex};

    use tokio_stream::wrappers::TcpListenerStream;
    use tonic::transport::Server;

    use super::*;

    fn plan(version: i64, address: &str) -> crate::placement_proto::ListenForPlanResponse {
        let (host, port) = address.rsplit_once(':').expect("test address has port");
        crate::placement_proto::ListenForPlanResponse {
            plan: Some(crate::placement_proto::Plan {
                version,
                applications: vec![crate::placement_proto::plan::Application {
                    id: "app".into(),
                    services: vec![],
                    shards: vec![crate::placement_proto::plan::application::Shard {
                        id: "shard".into(),
                        range: Some(crate::placement_proto::plan::application::shard::KeyRange {
                            first_key: vec![],
                        }),
                        server_id: "server".into(),
                        replica_index: 0,
                    }],
                }],
            }),
            servers: vec![crate::placement_proto::Server {
                id: "server".into(),
                application_id: "app".into(),
                revision_number: 0,
                address: Some(crate::placement_proto::server::Address {
                    host: host.into(),
                    port: port.parse().expect("test port"),
                }),
                namespace: String::new(),
                file_descriptor_set: None,
                reboot_version: String::new(),
            }],
        }
    }

    #[derive(Clone)]
    struct RecordingCoordinator {
        name: &'static str,
        calls: Arc<Mutex<Vec<(&'static str, proto::WatchRequest)>>>,
    }

    #[tonic::async_trait]
    impl proto::coordinator_server::Coordinator for RecordingCoordinator {
        async fn watch(
            &self,
            request: Request<proto::WatchRequest>,
        ) -> Result<Response<proto::WatchResponse>, Status> {
            self.calls
                .lock()
                .unwrap()
                .push((self.name, request.into_inner()));
            Ok(Response::new(proto::WatchResponse { aborted: false }))
        }
    }

    async fn serve_coordinator(
        name: &'static str,
    ) -> (
        String,
        Arc<Mutex<Vec<(&'static str, proto::WatchRequest)>>>,
        tokio::task::JoinHandle<()>,
    ) {
        let calls = Arc::new(Mutex::new(Vec::new()));
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let coordinator = RecordingCoordinator {
            name,
            calls: Arc::clone(&calls),
        };
        let task = tokio::spawn(async move {
            Server::builder()
                .add_service(proto::coordinator_server::CoordinatorServer::new(
                    coordinator,
                ))
                .serve_with_incoming(TcpListenerStream::new(listener))
                .await
                .unwrap();
        });
        (address.to_string(), calls, task)
    }

    #[tokio::test]
    async fn legacy_application_watch_endpoint_rejects_invalid_routes_and_reroutes_watch() {
        let placement = PlanOnlyLegacyPlacement::new();
        let endpoint = LegacyApplicationCoordinatorWatchEndpoint::new(
            LegacyApplicationId::new("app").unwrap(),
            placement.clone(),
        );
        let request = proto::WatchRequest {
            transaction_id: vec![7; 16],
            state_type: "intentionally.unrelated.State".into(),
            state_ref: "coordinator/child".into(),
        };

        assert_eq!(
            endpoint.watch(request.clone()).await.unwrap_err().code(),
            tonic::Code::Unavailable
        );

        let (one_address, one_calls, one_task) = serve_coordinator("one").await;
        placement.install(plan(1, &one_address)).unwrap();
        for state_ref in ["", "/child"] {
            let mut malformed = request.clone();
            malformed.state_ref = state_ref.into();
            assert_eq!(
                endpoint.watch(malformed).await.unwrap_err().code(),
                tonic::Code::InvalidArgument
            );
        }
        let unknown = LegacyApplicationCoordinatorWatchEndpoint::new(
            LegacyApplicationId::new("unknown").unwrap(),
            placement.clone(),
        );
        assert_eq!(
            unknown.watch(request.clone()).await.unwrap_err().code(),
            tonic::Code::NotFound
        );

        assert!(!endpoint.watch(request.clone()).await.unwrap().aborted);
        assert_eq!(
            one_calls.lock().unwrap().as_slice(),
            [("one", request.clone())]
        );

        let (two_address, two_calls, two_task) = serve_coordinator("two").await;
        placement.install(plan(2, &two_address)).unwrap();
        assert!(!endpoint.watch(request.clone()).await.unwrap().aborted);
        assert_eq!(
            one_calls.lock().unwrap().as_slice(),
            [("one", request.clone())]
        );
        assert_eq!(two_calls.lock().unwrap().as_slice(), [("two", request)]);

        one_task.abort();
        two_task.abort();
    }
}
