use std::{
    net::{SocketAddr, TcpListener},
    pin::Pin,
    process::{Child, Command, Stdio},
    sync::Arc,
    time::Duration,
};

use prost::Message;
use reboot_rust_schema::{
    database_proto as proto,
    native_2pc::{
        Native2pcCoordinatorDecision, Native2pcCoordinatorEndpoint, Native2pcCoordinatorResolver,
        Native2pcDatabaseSidecar, Native2pcParticipantEndpoint, Native2pcParticipantResolver,
        Native2pcPreparedParticipantRecoveryPass, Native2pcPreparingCoordinatorRecoveryPass,
        Native2pcRequests, Native2pcStagedParticipantRecoveryPass, NativeActorId, NativeEnrollment,
        NativeFuture, NativeTransactionId, PROTOCOL_ID, RECORD_VERSION,
        TonicNative2pcCoordinatorEndpoint, TonicNative2pcDatabaseSidecar,
        TonicNative2pcParticipantEndpoint, commit_and_materialize_singleton_initial_state_once,
        decide_native2pc_coordinator_once, recover_and_materialize_committed_singleton_state_once,
        recover_and_materialize_singleton_initial_state_once, recover_prepared_participant_once,
        recover_preparing_native2pc_coordinator_once, recover_staged_participant_once,
        require_native2pc_participant,
    },
};
use tokio_stream::{Stream, wrappers::TcpListenerStream};
use tonic::{Request, Response, Status, transport::Server};

#[derive(Default)]
struct NativeDatabase {
    recovery: proto::Native2pcRecoverResponse,
}

fn valid_recovery() -> proto::Native2pcRecoverResponse {
    let applied = proto::Native2pcAppliedActorEffects {
        protocol: Some(proto::Native2pcProtocol {
            protocol_id: PROTOCOL_ID.into(),
            record_version: RECORD_VERSION,
        }),
        root_transaction_id: vec![1; 16],
        participant: Some(proto::Native2pcActorId {
            state_type: "example.Participant".into(),
            state_ref: "participant/1".into(),
        }),
        coordinator: Some(proto::Native2pcActorId {
            state_type: "example.Coordinator".into(),
            state_ref: "coordinator/1".into(),
        }),
        enrollment_digest: vec![9, 8],
        effects: Some(proto::Native2pcActorEffects {
            state: Some(b"materialized-state".to_vec()),
            ..Default::default()
        }),
    };
    proto::Native2pcRecoverResponse {
        applied_journal: applied.encode_to_vec(),
        applied: Some(applied),
        ..Default::default()
    }
}

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

    async fn stage_participant(
        &self,
        request: Request<proto::Native2pcStageParticipantRequest>,
    ) -> Result<Response<proto::Native2pcStageParticipantResponse>, Status> {
        let participant = request.into_inner().participant.unwrap();
        assert_eq!(
            participant.phase,
            proto::native2pc_participant_record::Phase::Staged as i32
        );
        assert!(participant.effects.is_some());
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
        Ok(Response::new(Box::pin(tokio_stream::iter([Ok(self
            .recovery
            .clone())]))))
    }

    async fn materialize_applied(
        &self,
        request: Request<proto::Native2pcMaterializeAppliedRequest>,
    ) -> Result<Response<proto::Native2pcMaterializeAppliedResponse>, Status> {
        let journal = request.into_inner().applied_journal;
        let applied = proto::Native2pcAppliedActorEffects::decode(journal.as_slice())
            .map_err(|_| Status::invalid_argument("applied journal is malformed"))?;
        let state = applied
            .effects
            .as_ref()
            .and_then(|effects| effects.state.clone())
            .ok_or_else(|| Status::unimplemented("state-only journal required"))?;
        if !applied.effects.as_ref().unwrap().effects.is_empty() {
            return Err(Status::unimplemented(
                "opaque effects are not materializable",
            ));
        }
        Ok(Response::new(proto::Native2pcMaterializeAppliedResponse {
            receipt: Some(proto::Native2pcApplicationReceipt {
                applied: Some(applied),
                applied_journal: journal,
            }),
            state: Some(state),
        }))
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

struct NativeParticipant {
    prepare_outcome: i32,
}

impl Default for NativeParticipant {
    fn default() -> Self {
        Self {
            prepare_outcome: proto::native2pc_prepare_response::Outcome::Prepared as i32,
        }
    }
}

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
            outcome: self.prepare_outcome,
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

async fn serve(
    recovery: proto::Native2pcRecoverResponse,
) -> (SocketAddr, tokio::task::JoinHandle<()>) {
    serve_with_prepare_outcome(
        recovery,
        proto::native2pc_prepare_response::Outcome::Prepared as i32,
    )
    .await
}

async fn serve_with_prepare_outcome(
    recovery: proto::Native2pcRecoverResponse,
    prepare_outcome: i32,
) -> (SocketAddr, tokio::task::JoinHandle<()>) {
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    let server = tokio::spawn(async move {
        Server::builder()
            .add_service(
                proto::native2pc_database_server::Native2pcDatabaseServer::new(NativeDatabase {
                    recovery,
                }),
            )
            .add_service(
                proto::native2pc_participant_server::Native2pcParticipantServer::new(
                    NativeParticipant { prepare_outcome },
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

struct StaticParticipantResolver {
    actor: NativeActorId,
    endpoint: Arc<TonicNative2pcParticipantEndpoint>,
}

impl Native2pcParticipantResolver for StaticParticipantResolver {
    type Endpoint = TonicNative2pcParticipantEndpoint;

    fn resolve(&self, actor: &NativeActorId) -> NativeFuture<'_, Arc<Self::Endpoint>> {
        if actor != &self.actor {
            return Box::pin(async { Err(Status::not_found("unexpected participant")) });
        }
        let endpoint = Arc::clone(&self.endpoint);
        Box::pin(async move { Ok(endpoint) })
    }
}

#[tokio::test]
async fn native_tonic_clients_reach_only_native_services() {
    let mut recovery = valid_recovery();
    // A future sidecar may retain additive fields Rust does not understand.
    // The raw journal must still survive recovery → materialization unchanged.
    recovery.applied_journal.extend([0xA2, 0x06, 0x00]);
    let (address, server) = serve(recovery).await;
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
        .stage_participant(requests.stage_participant(&participant_id))
        .await
        .unwrap();
    sidecar
        .put_participant(requests.put_participant(&participant_id))
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
    let recovered = sidecar.recover().await.unwrap();
    assert_eq!(recovered.len(), 1);
    assert_eq!(
        recovered[0]
            .applied
            .as_ref()
            .unwrap()
            .participant
            .as_ref()
            .unwrap()
            .state_ref,
        "participant/1"
    );
    let applied = recovered[0].applied.clone().unwrap();
    let journal = recovered[0].applied_journal.clone();
    let materialized = sidecar
        .materialize_applied(proto::Native2pcMaterializeAppliedRequest {
            applied_journal: journal.clone(),
        })
        .await
        .unwrap();
    assert_eq!(materialized.receipt.unwrap().applied, Some(applied));
    assert_eq!(materialized.state, Some(b"materialized-state".to_vec()));
    assert_eq!(
        sidecar
            .terminal_participant(requests.terminal(&participant_id, true))
            .await
            .unwrap()
            .terminal_phase,
        proto::native2pc_participant_record::Phase::Committed as i32
    );
    let mismatch = sidecar
        .terminal_participant(requests.terminal(&participant_id, false))
        .await
        .unwrap_err();
    assert_eq!(mismatch.code(), tonic::Code::DataLoss);

    let channel = tonic::transport::Endpoint::from_shared(endpoint.clone())
        .unwrap()
        .connect()
        .await
        .unwrap();
    let participant = TonicNative2pcParticipantEndpoint::new(channel.clone());
    assert!(
        require_native2pc_participant(&participant)
            .await
            .unwrap()
            .native_sidecar_enabled
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
    let mismatch = participant
        .terminal(requests.terminal(&participant_id, false).terminal.unwrap())
        .await
        .unwrap_err();
    assert_eq!(mismatch.code(), tonic::Code::DataLoss);

    let coordinator_pass_endpoint =
        Arc::new(TonicNative2pcParticipantEndpoint::new(channel.clone()));
    let coordinator_pass_resolver = StaticParticipantResolver {
        actor: participant_id.clone(),
        endpoint: coordinator_pass_endpoint,
    };
    assert_eq!(
        decide_native2pc_coordinator_once(&sidecar, &coordinator_pass_resolver, &requests)
            .await
            .unwrap(),
        Native2pcCoordinatorDecision::Committed
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

#[tokio::test]
async fn native_tonic_participant_rejects_malformed_prepare_outcomes() {
    for outcome in [
        proto::native2pc_prepare_response::Outcome::Unspecified as i32,
        999,
    ] {
        let (address, server) = serve_with_prepare_outcome(Default::default(), outcome).await;
        let channel = tonic::transport::Endpoint::from_shared(format!("http://{address}"))
            .unwrap()
            .connect()
            .await
            .unwrap();
        let participant = TonicNative2pcParticipantEndpoint::new(channel);
        let coordinator =
            NativeActorId::new("example.Coordinator", "coordinator/malformed").unwrap();
        let actor = NativeActorId::new("example.Participant", "participant/malformed").unwrap();
        let requests = Native2pcRequests::new(
            NativeTransactionId::new([42; 16]).unwrap(),
            coordinator,
            NativeEnrollment::new([actor.clone()], [4, 2]).unwrap(),
        );
        assert_eq!(
            participant
                .prepare(requests.prepare(&actor))
                .await
                .unwrap_err()
                .code(),
            tonic::Code::DataLoss
        );
        server.abort();
    }
}

#[tokio::test]
async fn native_tonic_coordinator_aborts_only_after_a_definitive_prepare_abort() {
    let (address, server) = serve_with_prepare_outcome(
        Default::default(),
        proto::native2pc_prepare_response::Outcome::DefinitiveAbort as i32,
    )
    .await;
    let endpoint = format!("http://{address}");
    let sidecar = TonicNative2pcDatabaseSidecar::connect(&endpoint)
        .await
        .unwrap();
    let actor = NativeActorId::new("example.Participant", "participant/abort").unwrap();
    let requests = Native2pcRequests::new(
        NativeTransactionId::new([24; 16]).unwrap(),
        NativeActorId::new("example.Coordinator", "coordinator/abort").unwrap(),
        NativeEnrollment::new([actor.clone()], [2, 4]).unwrap(),
    );
    let channel = tonic::transport::Endpoint::from_shared(endpoint)
        .unwrap()
        .connect()
        .await
        .unwrap();
    let resolver = StaticParticipantResolver {
        actor,
        endpoint: Arc::new(TonicNative2pcParticipantEndpoint::new(channel)),
    };
    assert_eq!(
        decide_native2pc_coordinator_once(&sidecar, &resolver, &requests)
            .await
            .unwrap(),
        Native2pcCoordinatorDecision::Aborted
    );
    server.abort();
}

#[tokio::test]
async fn native_tonic_coordinator_leaves_malformed_prepare_nondefinitive() {
    let (address, server) = serve_with_prepare_outcome(Default::default(), 999).await;
    let endpoint = format!("http://{address}");
    let sidecar = TonicNative2pcDatabaseSidecar::connect(&endpoint)
        .await
        .unwrap();
    let actor = NativeActorId::new("example.Participant", "participant/pending").unwrap();
    let requests = Native2pcRequests::new(
        NativeTransactionId::new([25; 16]).unwrap(),
        NativeActorId::new("example.Coordinator", "coordinator/pending").unwrap(),
        NativeEnrollment::new([actor.clone()], [2, 5]).unwrap(),
    );
    let channel = tonic::transport::Endpoint::from_shared(endpoint)
        .unwrap()
        .connect()
        .await
        .unwrap();
    let resolver = StaticParticipantResolver {
        actor,
        endpoint: Arc::new(TonicNative2pcParticipantEndpoint::new(channel)),
    };
    assert_eq!(
        decide_native2pc_coordinator_once(&sidecar, &resolver, &requests)
            .await
            .unwrap_err()
            .code(),
        tonic::Code::DataLoss
    );
    server.abort();
}

#[tokio::test]
async fn native_tonic_recovery_rejects_malformed_journal_response() {
    let (address, server) = serve(proto::Native2pcRecoverResponse::default()).await;
    let sidecar = TonicNative2pcDatabaseSidecar::connect(format!("http://{address}"))
        .await
        .unwrap();
    assert_eq!(
        sidecar.recover().await.unwrap_err().code(),
        tonic::Code::InvalidArgument
    );
    server.abort();
}

struct CxxDatabase {
    _state: tempfile::TempDir,
    child: Child,
    endpoint: String,
}

impl Drop for CxxDatabase {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

async fn spawn_cxx_database() -> CxxDatabase {
    let binary = std::env::var("REBOOT_NATIVE2PC_CXX_DATABASE")
        .expect("REBOOT_NATIVE2PC_CXX_DATABASE must name Bazel's //reboot/server:database");
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let port = listener.local_addr().unwrap().port();
    drop(listener);
    let state = tempfile::tempdir().unwrap();
    let server_info = proto::ServerInfo {
        shard_infos: vec![proto::ShardInfo {
            shard_id: "s000000000".into(),
            shard_first_key: vec![],
        }],
    };
    let server_info_path = state.path().join("server-info.pb");
    std::fs::write(&server_info_path, server_info.encode_to_vec()).unwrap();
    let mut child = Command::new(binary)
        .arg(state.path().join("rocksdb"))
        .arg(server_info_path)
        .arg(port.to_string())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .unwrap();
    let endpoint = format!("http://127.0.0.1:{port}");
    for _ in 0..100 {
        if TonicNative2pcDatabaseSidecar::connect(endpoint.clone())
            .await
            .is_ok()
        {
            return CxxDatabase {
                _state: state,
                child,
                endpoint,
            };
        }
        std::thread::sleep(Duration::from_millis(25));
    }
    let _ = child.kill();
    let _ = child.wait();
    panic!("C++ native sidecar did not start");
}

struct StaticCxxCoordinator {
    actor: NativeActorId,
    endpoint: Arc<TonicNative2pcCoordinatorEndpoint>,
}

impl Native2pcCoordinatorResolver for StaticCxxCoordinator {
    type Endpoint = TonicNative2pcCoordinatorEndpoint;

    fn resolve(&self, actor: &NativeActorId) -> NativeFuture<'_, Arc<Self::Endpoint>> {
        if actor != &self.actor {
            return Box::pin(async { Err(tonic::Status::not_found("unexpected coordinator")) });
        }
        let endpoint = self.endpoint.clone();
        Box::pin(async move { Ok(endpoint) })
    }
}

#[tokio::test]
#[ignore = "requires REBOOT_NATIVE2PC_CXX_DATABASE=path/to/bazel-bin/reboot/server/database"]
async fn native_singleton_initial_state_materializes_once_through_the_real_cxx_sidecar() {
    let database = spawn_cxx_database().await;
    let sidecar = TonicNative2pcDatabaseSidecar::connect(database.endpoint.clone())
        .await
        .unwrap();
    let coordinator = NativeActorId::new("example.Coordinator", "coordinator/initial").unwrap();
    let participant = NativeActorId::new("example.Participant", "participant/initial").unwrap();
    let requests = Native2pcRequests::new(
        NativeTransactionId::new([82; 16]).unwrap(),
        coordinator,
        NativeEnrollment::new([participant.clone()], [8, 2]).unwrap(),
    );
    let first = commit_and_materialize_singleton_initial_state_once(
        &sidecar,
        &requests,
        Some(b"initial-state".to_vec()),
    )
    .await
    .unwrap();
    let replay = sidecar
        .materialize_applied(proto::Native2pcMaterializeAppliedRequest {
            applied_journal: first.applied_journal.clone(),
        })
        .await
        .unwrap();
    assert_eq!(first.materialization, replay);
    assert_eq!(first.materialization.state, Some(b"initial-state".to_vec()));
}

/// The committed-singleton recovery primitive must admit only an exact C++
/// durable snapshot and reject state/opaque mismatches before materialization.
#[tokio::test]
#[ignore = "requires REBOOT_NATIVE2PC_CXX_DATABASE=path/to/bazel-bin/reboot/server/database"]
async fn native_committed_singleton_recovery_conforms_to_real_cxx_sidecar() {
    let database = spawn_cxx_database().await;
    let sidecar = TonicNative2pcDatabaseSidecar::connect(database.endpoint.clone())
        .await
        .unwrap();

    let state_participant =
        NativeActorId::new("example.Participant", "participant/materialize").unwrap();
    let state_requests = Native2pcRequests::new(
        NativeTransactionId::new([84; 16]).unwrap(),
        NativeActorId::new("example.Coordinator", "coordinator/materialize").unwrap(),
        NativeEnrollment::new([state_participant.clone()], [8, 4]).unwrap(),
    );
    let (staged, prepared) = state_requests
        .singleton_state_only_initial_participant(Some(b"recovery-state".to_vec()))
        .unwrap();
    sidecar
        .put_coordinator(state_requests.put_coordinator_preparing())
        .await
        .unwrap();
    sidecar.stage_participant(staged).await.unwrap();
    sidecar.put_participant(prepared).await.unwrap();
    sidecar
        .put_commit_decision(state_requests.put_commit_decision())
        .await
        .unwrap();
    sidecar
        .terminal_participant(state_requests.terminal(&state_participant, true))
        .await
        .unwrap();

    let opaque_participant =
        NativeActorId::new("example.Participant", "participant/opaque").unwrap();
    let opaque_requests = Native2pcRequests::new(
        NativeTransactionId::new([85; 16]).unwrap(),
        NativeActorId::new("example.Coordinator", "coordinator/opaque").unwrap(),
        NativeEnrollment::new([opaque_participant.clone()], [8, 5]).unwrap(),
    );
    let mut opaque_stage = opaque_requests.stage_participant(&opaque_participant);
    opaque_stage
        .participant
        .as_mut()
        .unwrap()
        .effects
        .as_mut()
        .unwrap()
        .effects
        .push(proto::Native2pcEffect {
            key: b"opaque-key".to_vec(),
            payload: b"opaque-payload".to_vec(),
        });
    let mut opaque_prepared = proto::Native2pcPutParticipantRequest {
        participant: opaque_stage.participant.clone(),
    };
    opaque_prepared.participant.as_mut().unwrap().phase =
        proto::native2pc_participant_record::Phase::Prepared as i32;
    sidecar
        .put_coordinator(opaque_requests.put_coordinator_preparing())
        .await
        .unwrap();
    sidecar.stage_participant(opaque_stage).await.unwrap();
    sidecar.put_participant(opaque_prepared).await.unwrap();
    sidecar
        .put_commit_decision(opaque_requests.put_commit_decision())
        .await
        .unwrap();
    sidecar
        .terminal_participant(opaque_requests.terminal(&opaque_participant, true))
        .await
        .unwrap();

    let recovered = sidecar.recover().await.unwrap();
    let state_journal = recovered
        .iter()
        .find(|record| {
            record.applied.as_ref().is_some_and(|applied| {
                applied.participant.as_ref().is_some_and(|participant| {
                    participant.state_ref == state_participant.state_ref()
                })
            })
        })
        .unwrap()
        .applied_journal
        .clone();
    let opaque_journal = recovered
        .iter()
        .find(|record| {
            record.applied.as_ref().is_some_and(|applied| {
                applied.participant.as_ref().is_some_and(|participant| {
                    participant.state_ref == opaque_participant.state_ref()
                })
            })
        })
        .unwrap()
        .applied_journal
        .clone();

    let result = recover_and_materialize_committed_singleton_state_once(
        &sidecar,
        &state_requests,
        &state_participant,
        Some(b"recovery-state".to_vec()),
    )
    .await
    .unwrap();
    assert_eq!(
        result.materialization.state,
        Some(b"recovery-state".to_vec())
    );
    assert_eq!(
        result
            .materialization
            .receipt
            .as_ref()
            .unwrap()
            .applied_journal,
        state_journal
    );
    assert_eq!(
        recover_and_materialize_committed_singleton_state_once(
            &sidecar,
            &state_requests,
            &state_participant,
            Some(b"wrong-state".to_vec()),
        )
        .await
        .unwrap_err()
        .code(),
        tonic::Code::DataLoss
    );
    assert_eq!(
        recover_and_materialize_committed_singleton_state_once(
            &sidecar,
            &opaque_requests,
            &opaque_participant,
            Some(b"opaque-state".to_vec()),
        )
        .await
        .unwrap_err()
        .code(),
        tonic::Code::DataLoss
    );
    let recovered_after = sidecar.recover().await.unwrap();
    assert!(
        recovered_after
            .iter()
            .any(|record| record.applied_journal == opaque_journal)
    );
}

/// A process crash after durable commit/terminal but before materialization
/// must resume only the retained exact journal, never rerun the transaction.
#[tokio::test]
#[ignore = "requires REBOOT_NATIVE2PC_CXX_DATABASE=path/to/bazel-bin/reboot/server/database"]
async fn native_singleton_initial_state_recovery_materializes_the_real_cxx_journal() {
    let database = spawn_cxx_database().await;
    let sidecar = TonicNative2pcDatabaseSidecar::connect(database.endpoint.clone())
        .await
        .unwrap();
    let coordinator = NativeActorId::new("example.Coordinator", "coordinator/recovery").unwrap();
    let participant = NativeActorId::new("example.Participant", "participant/recovery").unwrap();
    let requests = Native2pcRequests::new(
        NativeTransactionId::new([83; 16]).unwrap(),
        coordinator,
        NativeEnrollment::new([participant.clone()], [8, 3]).unwrap(),
    );
    let (staged, prepared) = requests
        .singleton_state_only_initial_participant(Some(b"recovered-state".to_vec()))
        .unwrap();
    sidecar
        .put_coordinator(requests.put_coordinator_preparing())
        .await
        .unwrap();
    sidecar.stage_participant(staged).await.unwrap();
    sidecar.put_participant(prepared).await.unwrap();
    sidecar
        .put_commit_decision(requests.put_commit_decision())
        .await
        .unwrap();
    sidecar
        .terminal_participant(requests.terminal(&participant, true))
        .await
        .unwrap();

    let first = recover_and_materialize_singleton_initial_state_once(
        &sidecar,
        &requests,
        Some(b"recovered-state".to_vec()),
    )
    .await
    .unwrap();
    let replay = sidecar
        .materialize_applied(proto::Native2pcMaterializeAppliedRequest {
            applied_journal: first.applied_journal.clone(),
        })
        .await
        .unwrap();
    assert_eq!(first.materialization, replay);
    assert_eq!(
        first.materialization.state,
        Some(b"recovered-state".to_vec())
    );
}

/// This explicit C++ sidecar proof binds recovery to the durable commit guard:
/// the recovery continuation can decide only because the exact sealed
/// participant record was already persisted as PREPARED.
#[tokio::test]
#[ignore = "requires REBOOT_NATIVE2PC_CXX_DATABASE=path/to/bazel-bin/reboot/server/database"]
async fn native_preparing_coordinator_recovery_crosses_the_real_cxx_sidecar_boundary() {
    let database = spawn_cxx_database().await;
    let sidecar = TonicNative2pcDatabaseSidecar::connect(database.endpoint.clone())
        .await
        .unwrap();
    let (participant_address, participant_server) = serve(Default::default()).await;
    let coordinator = NativeActorId::new("example.Coordinator", "coordinator/decision").unwrap();
    let participant = NativeActorId::new("example.Participant", "participant/decision").unwrap();
    let requests = Native2pcRequests::new(
        NativeTransactionId::new([81; 16]).unwrap(),
        coordinator.clone(),
        NativeEnrollment::new([participant.clone()], [8, 1]).unwrap(),
    );
    sidecar
        .put_coordinator(requests.put_coordinator_preparing())
        .await
        .unwrap();
    sidecar
        .stage_participant(requests.stage_participant(&participant))
        .await
        .unwrap();
    sidecar
        .put_participant(requests.put_participant(&participant))
        .await
        .unwrap();
    let recovered = sidecar
        .recover()
        .await
        .unwrap()
        .into_iter()
        .find(|record| record.coordinator.is_some())
        .expect("C++ sidecar must recover the durable PREPARING coordinator");
    let channel = tonic::transport::Endpoint::from_shared(format!("http://{participant_address}"))
        .unwrap()
        .connect()
        .await
        .unwrap();
    let resolver = StaticParticipantResolver {
        actor: participant,
        endpoint: Arc::new(TonicNative2pcParticipantEndpoint::new(channel)),
    };
    assert_eq!(
        recover_preparing_native2pc_coordinator_once(&sidecar, &resolver, &recovered)
            .await
            .unwrap(),
        Native2pcPreparingCoordinatorRecoveryPass::Decided(Native2pcCoordinatorDecision::Committed)
    );
    assert!(sidecar.recover().await.unwrap().iter().any(|record| {
        record.coordinator.as_ref().is_some_and(|record| {
            record.coordinator.as_ref().is_some_and(|identity| {
                identity.state_type == coordinator.state_type()
                    && identity.state_ref == coordinator.state_ref()
            }) && record.phase == proto::native2pc_coordinator_record::Phase::CommitDecided as i32
        })
    }));
    participant_server.abort();
}

/// This ignored test is deliberately process-bound: Bazel builds the C++ server
/// and supplies its path, while Cargo drives only the published native protobuf
/// boundary. It proves the Rust recovery executor cannot terminalize before the
/// real C++ durable Watch decision exists.
#[tokio::test]
#[ignore = "requires REBOOT_NATIVE2PC_CXX_DATABASE=path/to/bazel-bin/reboot/server/database"]
async fn native_prepared_recovery_crosses_the_real_cxx_sidecar_boundary() {
    enum Decision {
        Preparing,
        Commit,
        Abort,
    }
    for (index, decision) in [Decision::Preparing, Decision::Commit, Decision::Abort]
        .into_iter()
        .enumerate()
    {
        let database = spawn_cxx_database().await;
        let sidecar = TonicNative2pcDatabaseSidecar::connect(database.endpoint.clone())
            .await
            .unwrap();
        let coordinator =
            NativeActorId::new("example.Coordinator", format!("coordinator/{index}")).unwrap();
        let participant =
            NativeActorId::new("example.Participant", format!("participant/{index}")).unwrap();
        let requests = Native2pcRequests::new(
            NativeTransactionId::new([index as u8 + 1; 16]).unwrap(),
            coordinator.clone(),
            NativeEnrollment::new([participant.clone()], [9, 8]).unwrap(),
        );
        sidecar
            .put_coordinator(requests.put_coordinator_preparing())
            .await
            .unwrap();
        sidecar
            .stage_participant(requests.stage_participant(&participant))
            .await
            .unwrap();
        sidecar
            .put_participant(requests.put_participant(&participant))
            .await
            .unwrap();
        match decision {
            Decision::Preparing => {}
            Decision::Commit => {
                sidecar
                    .put_commit_decision(requests.put_commit_decision())
                    .await
                    .unwrap();
            }
            Decision::Abort => {
                sidecar
                    .put_abort_decision(requests.put_abort_decision())
                    .await
                    .unwrap();
            }
        }
        let prepared = sidecar
            .recover()
            .await
            .unwrap()
            .into_iter()
            .find(|record| record.participant.is_some())
            .unwrap();
        // A locally valid recovered participant with a forged enrollment digest
        // must fail at the real C++ Watch boundary and cannot terminalize it.
        if index == 0 {
            let mut wrong_digest = prepared.clone();
            wrong_digest.participant.as_mut().unwrap().enrollment_digest = b"wrong-digest".to_vec();
            let channel = tonic::transport::Endpoint::from_shared(database.endpoint.clone())
                .unwrap()
                .connect()
                .await
                .unwrap();
            let resolver = StaticCxxCoordinator {
                actor: coordinator.clone(),
                endpoint: Arc::new(TonicNative2pcCoordinatorEndpoint::new(channel)),
            };
            assert_eq!(
                recover_prepared_participant_once(&sidecar, &resolver, &wrong_digest)
                    .await
                    .unwrap_err()
                    .code(),
                tonic::Code::FailedPrecondition
            );
            assert!(sidecar.recover().await.unwrap().iter().any(|record| {
                record.participant.as_ref().is_some_and(|participant| {
                    participant.phase == proto::native2pc_participant_record::Phase::Prepared as i32
                })
            }));
        }
        let channel = tonic::transport::Endpoint::from_shared(database.endpoint.clone())
            .unwrap()
            .connect()
            .await
            .unwrap();
        let resolver = StaticCxxCoordinator {
            actor: coordinator,
            endpoint: Arc::new(TonicNative2pcCoordinatorEndpoint::new(channel)),
        };
        let pass = recover_prepared_participant_once(&sidecar, &resolver, &prepared)
            .await
            .unwrap();
        let recovered = sidecar.recover().await.unwrap();
        match decision {
            Decision::Preparing => {
                assert_eq!(pass, Native2pcPreparedParticipantRecoveryPass::Pending);
                assert!(recovered.iter().any(|record| {
                    record.participant.as_ref().is_some_and(|participant| {
                        participant.phase
                            == proto::native2pc_participant_record::Phase::Prepared as i32
                    })
                }));
            }
            Decision::Commit => {
                assert!(matches!(
                    pass,
                    Native2pcPreparedParticipantRecoveryPass::Terminalized(response)
                    if response.terminal_phase
                        == proto::native2pc_participant_record::Phase::Committed as i32
                ));
                assert!(recovered.iter().any(|record| record.applied.is_some()));
            }
            Decision::Abort => {
                assert!(matches!(
                    pass,
                    Native2pcPreparedParticipantRecoveryPass::Terminalized(response)
                    if response.terminal_phase
                        == proto::native2pc_participant_record::Phase::Aborted as i32
                ));
                assert!(!recovered.iter().any(|record| record.applied.is_some()));
            }
        }
    }
}

/// The staged recovery seam is deliberately narrower than prepared recovery:
/// it may observe a durable abort and consume the staged record, but can never
/// turn staging into a commit or infer an abort from a pending coordinator.
#[tokio::test]
#[ignore = "requires REBOOT_NATIVE2PC_CXX_DATABASE=path/to/bazel-bin/reboot/server/database"]
async fn native_staged_recovery_crosses_the_real_cxx_sidecar_boundary() {
    for (index, abort) in [(0, false), (1, true)] {
        let database = spawn_cxx_database().await;
        let sidecar = TonicNative2pcDatabaseSidecar::connect(database.endpoint.clone())
            .await
            .unwrap();
        let coordinator =
            NativeActorId::new("example.Coordinator", format!("staged-coordinator/{index}"))
                .unwrap();
        let participant =
            NativeActorId::new("example.Participant", format!("staged-participant/{index}"))
                .unwrap();
        let requests = Native2pcRequests::new(
            NativeTransactionId::new([index as u8 + 31; 16]).unwrap(),
            coordinator.clone(),
            NativeEnrollment::new([participant.clone()], [7, 6]).unwrap(),
        );
        sidecar
            .put_coordinator(requests.put_coordinator_preparing())
            .await
            .unwrap();
        sidecar
            .stage_participant(requests.stage_participant(&participant))
            .await
            .unwrap();
        if abort {
            sidecar
                .put_abort_decision(requests.put_abort_decision())
                .await
                .unwrap();
        }
        let staged = sidecar
            .recover()
            .await
            .unwrap()
            .into_iter()
            .find(|record| {
                record.participant.as_ref().is_some_and(|participant| {
                    participant.phase == proto::native2pc_participant_record::Phase::Staged as i32
                })
            })
            .expect("C++ NativeRecover must expose a durable staged participant");
        // A locally well-formed staged record with a forged enrollment digest
        // must fail at C++ Watch before it can issue an abort terminal request.
        if abort {
            let mut wrong_digest = staged.clone();
            wrong_digest.participant.as_mut().unwrap().enrollment_digest = b"wrong-digest".to_vec();
            let channel = tonic::transport::Endpoint::from_shared(database.endpoint.clone())
                .unwrap()
                .connect()
                .await
                .unwrap();
            let resolver = StaticCxxCoordinator {
                actor: coordinator.clone(),
                endpoint: Arc::new(TonicNative2pcCoordinatorEndpoint::new(channel)),
            };
            assert_eq!(
                recover_staged_participant_once(&sidecar, &resolver, &wrong_digest)
                    .await
                    .unwrap_err()
                    .code(),
                tonic::Code::FailedPrecondition
            );
            assert!(sidecar.recover().await.unwrap().iter().any(|record| {
                record.participant.as_ref().is_some_and(|participant| {
                    participant.phase == proto::native2pc_participant_record::Phase::Staged as i32
                })
            }));
        }
        let channel = tonic::transport::Endpoint::from_shared(database.endpoint.clone())
            .unwrap()
            .connect()
            .await
            .unwrap();
        let resolver = StaticCxxCoordinator {
            actor: coordinator,
            endpoint: Arc::new(TonicNative2pcCoordinatorEndpoint::new(channel)),
        };
        let pass = recover_staged_participant_once(&sidecar, &resolver, &staged)
            .await
            .unwrap();
        let recovered = sidecar.recover().await.unwrap();
        if abort {
            assert!(matches!(
                pass,
                Native2pcStagedParticipantRecoveryPass::Terminalized(response)
                if response.terminal_phase
                    == proto::native2pc_participant_record::Phase::Aborted as i32
            ));
            assert!(recovered.iter().any(|record| {
                record.participant.as_ref().is_some_and(|participant| {
                    participant.phase == proto::native2pc_participant_record::Phase::Aborted as i32
                })
            }));
        } else {
            assert_eq!(pass, Native2pcStagedParticipantRecoveryPass::Pending);
            assert!(recovered.iter().any(|record| {
                record.participant.as_ref().is_some_and(|participant| {
                    participant.phase == proto::native2pc_participant_record::Phase::Staged as i32
                })
            }));
        }
        assert!(!recovered.iter().any(|record| record.applied.is_some()));
    }
}
