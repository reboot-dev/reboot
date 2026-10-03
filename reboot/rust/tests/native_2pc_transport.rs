use std::{net::SocketAddr, pin::Pin};

use reboot_rust_schema::{
    database_proto as proto,
    native_2pc::{
        Native2pcCoordinatorEndpoint, Native2pcDatabaseSidecar, Native2pcParticipantEndpoint,
        Native2pcRequests, NativeActorId, NativeEnrollment, NativeTransactionId, PROTOCOL_ID,
        RECORD_VERSION, TonicNative2pcCoordinatorEndpoint, TonicNative2pcDatabaseSidecar,
        TonicNative2pcParticipantEndpoint,
    },
};
use tokio_stream::{Stream, wrappers::TcpListenerStream};
use tonic::{Request, Response, Status, transport::Server};

#[derive(Default)]
struct NativeDatabase;

#[tonic::async_trait]
impl proto::native2pc_database_server::Native2pcDatabase for NativeDatabase {
    async fn put_coordinator(
        &self,
        request: Request<proto::Native2pcPutCoordinatorRequest>,
    ) -> Result<Response<proto::Native2pcPutCoordinatorResponse>, Status> {
        assert_eq!(
            request
                .into_inner()
                .coordinator
                .unwrap()
                .protocol
                .unwrap()
                .protocol_id,
            PROTOCOL_ID
        );
        Ok(Response::new(Default::default()))
    }

    async fn put_participant(
        &self,
        _: Request<proto::Native2pcPutParticipantRequest>,
    ) -> Result<Response<proto::Native2pcPutParticipantResponse>, Status> {
        Ok(Response::new(Default::default()))
    }

    async fn put_commit_decision(
        &self,
        _: Request<proto::Native2pcPutCommitDecisionRequest>,
    ) -> Result<Response<proto::Native2pcPutCommitDecisionResponse>, Status> {
        Ok(Response::new(Default::default()))
    }

    async fn put_abort_decision(
        &self,
        _: Request<proto::Native2pcPutAbortDecisionRequest>,
    ) -> Result<Response<proto::Native2pcPutAbortDecisionResponse>, Status> {
        Ok(Response::new(Default::default()))
    }

    type RecoverNative2pcStream =
        Pin<Box<dyn Stream<Item = Result<proto::Native2pcRecoverResponse, Status>> + Send>>;

    async fn recover_native2pc(
        &self,
        request: Request<proto::Native2pcRecoverRequest>,
    ) -> Result<Response<Self::RecoverNative2pcStream>, Status> {
        assert_eq!(
            request.into_inner().protocol.unwrap().record_version,
            RECORD_VERSION
        );
        Ok(Response::new(Box::pin(tokio_stream::iter([Ok(
            proto::Native2pcRecoverResponse::default(),
        )]))))
    }

    async fn terminal_participant(
        &self,
        _: Request<proto::Native2pcTerminalParticipantRequest>,
    ) -> Result<Response<proto::Native2pcTerminalParticipantResponse>, Status> {
        Ok(Response::new(proto::Native2pcTerminalParticipantResponse {
            terminal_phase: proto::native2pc_participant_record::Phase::Committed as i32,
        }))
    }
}

#[derive(Default)]
struct NativeParticipant;

#[tonic::async_trait]
impl proto::native2pc_participant_server::Native2pcParticipant for NativeParticipant {
    async fn get_capabilities(
        &self,
        request: Request<proto::Native2pcCapabilitiesRequest>,
    ) -> Result<Response<proto::Native2pcCapabilitiesResponse>, Status> {
        let required = request.into_inner().required.unwrap();
        assert_eq!(required.protocol_id, PROTOCOL_ID);
        Ok(Response::new(proto::Native2pcCapabilitiesResponse {
            accepted: Some(proto::Native2pcProtocol {
                protocol_id: PROTOCOL_ID.into(),
                record_version: RECORD_VERSION,
            }),
            native_participant_enabled: true,
            native_sidecar_enabled: true,
        }))
    }

    async fn prepare(
        &self,
        _: Request<proto::Native2pcPrepareRequest>,
    ) -> Result<Response<proto::Native2pcPrepareResponse>, Status> {
        Ok(Response::new(proto::Native2pcPrepareResponse {
            outcome: proto::native2pc_prepare_response::Outcome::Prepared as i32,
        }))
    }

    async fn terminal(
        &self,
        _: Request<proto::Native2pcTerminalRequest>,
    ) -> Result<Response<proto::Native2pcTerminalResponse>, Status> {
        Ok(Response::new(proto::Native2pcTerminalResponse {
            terminal_phase: proto::native2pc_participant_record::Phase::Committed as i32,
        }))
    }
}

#[derive(Default)]
struct NativeCoordinator;

#[tonic::async_trait]
impl proto::native2pc_coordinator_server::Native2pcCoordinator for NativeCoordinator {
    async fn watch(
        &self,
        request: Request<proto::Native2pcWatchRequest>,
    ) -> Result<Response<proto::Native2pcWatchResponse>, Status> {
        assert_eq!(
            request.into_inner().protocol.unwrap().protocol_id,
            PROTOCOL_ID
        );
        Ok(Response::new(proto::Native2pcWatchResponse {
            phase: proto::native2pc_coordinator_record::Phase::CommitDecided as i32,
        }))
    }
}

async fn serve() -> (SocketAddr, tokio::task::JoinHandle<()>) {
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    let server = tokio::spawn(async move {
        Server::builder()
            .add_service(
                proto::native2pc_database_server::Native2pcDatabaseServer::new(NativeDatabase),
            )
            .add_service(
                proto::native2pc_participant_server::Native2pcParticipantServer::new(
                    NativeParticipant,
                ),
            )
            .add_service(
                proto::native2pc_coordinator_server::Native2pcCoordinatorServer::new(
                    NativeCoordinator,
                ),
            )
            .serve_with_incoming(TcpListenerStream::new(listener))
            .await
            .unwrap();
    });
    (address, server)
}

#[tokio::test]
async fn native_tonic_clients_reach_only_native_services() {
    let (address, server) = serve().await;
    let endpoint = format!("http://{address}");
    let sidecar = TonicNative2pcDatabaseSidecar::connect(&endpoint)
        .await
        .unwrap();
    let coordinator_id = NativeActorId::new("example.Coordinator", "coordinator/1").unwrap();
    let participant_id = NativeActorId::new("example.Participant", "participant/1").unwrap();
    let requests = Native2pcRequests::new(
        NativeTransactionId::new([1; 16]).unwrap(),
        coordinator_id,
        NativeEnrollment::new([participant_id.clone()], [9, 8]).unwrap(),
    );
    sidecar
        .put_coordinator(requests.put_coordinator_preparing())
        .await
        .unwrap();
    sidecar
        .put_participant(requests.put_participant(&participant_id, true))
        .await
        .unwrap();
    sidecar
        .put_commit_decision(requests.put_commit_decision())
        .await
        .unwrap();
    sidecar
        .put_abort_decision(requests.put_abort_decision())
        .await
        .unwrap();
    assert_eq!(sidecar.recover().await.unwrap().len(), 1);
    assert_eq!(
        sidecar
            .terminal_participant(requests.terminal(&participant_id, true))
            .await
            .unwrap()
            .terminal_phase,
        proto::native2pc_participant_record::Phase::Committed as i32
    );

    let channel = tonic::transport::Endpoint::from_shared(endpoint.clone())
        .unwrap()
        .connect()
        .await
        .unwrap();
    let participant = TonicNative2pcParticipantEndpoint::new(channel.clone());
    assert!(
        participant
            .capabilities(proto::Native2pcCapabilitiesRequest {
                required: Some(proto::Native2pcProtocol {
                    protocol_id: PROTOCOL_ID.into(),
                    record_version: RECORD_VERSION,
                }),
            })
            .await
            .unwrap()
            .native_participant_enabled
    );
    assert_eq!(
        participant
            .prepare(requests.prepare(&participant_id))
            .await
            .unwrap()
            .outcome,
        proto::native2pc_prepare_response::Outcome::Prepared as i32
    );
    assert_eq!(
        participant
            .terminal(requests.terminal(&participant_id, true).terminal.unwrap())
            .await
            .unwrap()
            .terminal_phase,
        proto::native2pc_participant_record::Phase::Committed as i32
    );

    let coordinator = TonicNative2pcCoordinatorEndpoint::new(channel);
    assert_eq!(
        coordinator
            .watch(requests.watch(&participant_id))
            .await
            .unwrap()
            .phase,
        proto::native2pc_coordinator_record::Phase::CommitDecided as i32
    );
    server.abort();
}
