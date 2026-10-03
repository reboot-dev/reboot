//! Durable, actor-local participant runtime for Reboot's native sidecar protocol.
//!
//! This module owns exactly one actor's root, exclusive transaction. It loads
//! that actor and holds its lock from `start` through a sidecar-acknowledged
//! `Commit` or `Abort`. It is not a coordinator and deliberately does not
//! implement nested, shared, read-only, factory, or cross-actor transactions.

use std::future::Future;
use std::pin::Pin;
use std::sync::Arc;

use tonic::{Request, Response, Status};
use uuid::Uuid;

use crate::{database_proto as database, runtime::TransactionMode};

const STATE_REF_HEADER: &str = "x-reboot-state-ref";

type SidecarFuture<'a, T> = Pin<Box<dyn Future<Output = Result<T, Status>> + Send + 'a>>;

/// Minimal sidecar boundary. Production code uses [`TonicParticipantSidecar`];
/// tests may use this trait to verify requests and failure ordering without
/// pretending to be a database.
pub trait ParticipantSidecar: Send + Sync + 'static {
    fn load(&self, request: database::LoadRequest) -> SidecarFuture<'_, database::LoadResponse>;
    fn prepare(
        &self,
        request: database::TransactionParticipantPrepareRequest,
    ) -> SidecarFuture<'_, database::TransactionParticipantPrepareResponse>;
    fn commit(
        &self,
        request: database::TransactionParticipantCommitRequest,
    ) -> SidecarFuture<'_, database::TransactionParticipantCommitResponse>;
    fn abort(
        &self,
        request: database::TransactionParticipantAbortRequest,
    ) -> SidecarFuture<'_, database::TransactionParticipantAbortResponse>;
}

/// Native Tonic implementation of the actor participant's sidecar boundary.
pub struct TonicParticipantSidecar {
    client:
        tokio::sync::Mutex<database::database_client::DatabaseClient<tonic::transport::Channel>>,
}

impl TonicParticipantSidecar {
    pub async fn connect(endpoint: impl AsRef<str>) -> Result<Self, tonic::transport::Error> {
        Ok(Self {
            client: tokio::sync::Mutex::new(
                database::database_client::DatabaseClient::connect(endpoint.as_ref().to_owned())
                    .await?,
            ),
        })
    }
}

impl ParticipantSidecar for TonicParticipantSidecar {
    fn load(&self, request: database::LoadRequest) -> SidecarFuture<'_, database::LoadResponse> {
        Box::pin(async move {
            self.client
                .lock()
                .await
                .load(request)
                .await
                .map(Response::into_inner)
        })
    }

    fn prepare(
        &self,
        request: database::TransactionParticipantPrepareRequest,
    ) -> SidecarFuture<'_, database::TransactionParticipantPrepareResponse> {
        Box::pin(async move {
            self.client
                .lock()
                .await
                .transaction_participant_prepare(request)
                .await
                .map(Response::into_inner)
        })
    }

    fn commit(
        &self,
        request: database::TransactionParticipantCommitRequest,
    ) -> SidecarFuture<'_, database::TransactionParticipantCommitResponse> {
        Box::pin(async move {
            self.client
                .lock()
                .await
                .transaction_participant_commit(request)
                .await
                .map(Response::into_inner)
        })
    }

    fn abort(
        &self,
        request: database::TransactionParticipantAbortRequest,
    ) -> SidecarFuture<'_, database::TransactionParticipantAbortResponse> {
        Box::pin(async move {
            self.client
                .lock()
                .await
                .transaction_participant_abort(request)
                .await
                .map(Response::into_inner)
        })
    }
}

/// Transaction attributes supplied by a future generated transaction adapter.
#[derive(Clone, Debug)]
pub struct ActorTransactionStart {
    pub transaction_ids: Vec<Uuid>,
    pub coordinator_state_type: String,
    pub coordinator_state_ref: String,
    pub mode: TransactionMode,
    pub read_only: bool,
    pub factory: bool,
    pub state_type: String,
    pub state_ref: String,
}

/// Serialized effects which become durable only when the participant prepares.
#[derive(Clone, Debug, Default)]
pub struct PendingActorEffects {
    /// Serialized final protobuf state. `None` deliberately leaves state unset.
    pub state: Option<Vec<u8>>,
    pub task_upserts: Vec<database::Task>,
    pub idempotent_mutations: Vec<database::IdempotentMutation>,
}

struct Pending {
    root_id: Uuid,
    coordinator_state_type: String,
    coordinator_state_ref: String,
    effects: PendingActorEffects,
    // Kept until a terminal sidecar response is acknowledged.
    _lock: tokio::sync::OwnedMutexGuard<()>,
}

/// Only actor-local conflicts are definitive Prepare outcomes. A sidecar RPC
/// failure stays an error because the request may have reached durable storage.
#[derive(Debug)]
enum PrepareOutcome {
    Prepared,
    DefinitiveAbort,
}

/// Actor-local durable transaction participant. Clones address the same actor
/// and pending transaction.
pub struct DurableActorParticipant<C: ParticipantSidecar> {
    sidecar: Arc<C>,
    state_type: String,
    state_ref: String,
    lock: Arc<tokio::sync::Mutex<()>>,
    pending: Arc<tokio::sync::Mutex<Option<Pending>>>,
}

impl<C: ParticipantSidecar> Clone for DurableActorParticipant<C> {
    fn clone(&self) -> Self {
        Self {
            sidecar: Arc::clone(&self.sidecar),
            state_type: self.state_type.clone(),
            state_ref: self.state_ref.clone(),
            lock: Arc::clone(&self.lock),
            pending: Arc::clone(&self.pending),
        }
    }
}

impl<C: ParticipantSidecar> DurableActorParticipant<C> {
    pub fn new(
        sidecar: Arc<C>,
        state_type: impl Into<String>,
        state_ref: impl Into<String>,
    ) -> Self {
        Self {
            sidecar,
            state_type: state_type.into(),
            state_ref: state_ref.into(),
            lock: Arc::new(tokio::sync::Mutex::new(())),
            pending: Arc::new(tokio::sync::Mutex::new(None)),
        }
    }

    /// Acquires the actor's exclusive lock and loads its current state.
    ///
    /// The returned bytes are for the transaction adapter to deserialize; this
    /// runtime never manufactures state or effects itself.
    pub async fn start(&self, start: ActorTransactionStart) -> Result<Option<Vec<u8>>, Status> {
        self.validate_start(&start)?;
        let lock = Arc::clone(&self.lock).lock_owned().await;
        let mut pending = self.pending.lock().await;
        if pending.is_some() {
            return Err(Status::failed_precondition(
                "actor already has a pending transaction",
            ));
        }
        let response = self
            .sidecar
            .load(database::LoadRequest {
                actors: vec![database::Actor {
                    state_type: self.state_type.clone(),
                    state_ref: self.state_ref.clone(),
                    state: None,
                }],
                task_ids: vec![],
            })
            .await?;
        let state = response
            .actors
            .into_iter()
            .next()
            .and_then(|actor| actor.state);
        *pending = Some(Pending {
            root_id: start.transaction_ids[0],
            coordinator_state_type: start.coordinator_state_type,
            coordinator_state_ref: start.coordinator_state_ref,
            effects: PendingActorEffects::default(),
            _lock: lock,
        });
        Ok(state)
    }

    pub async fn stage(
        &self,
        transaction_id: Uuid,
        effects: PendingActorEffects,
    ) -> Result<(), Status> {
        let mut pending = self.pending.lock().await;
        let current = pending
            .as_mut()
            .ok_or_else(|| Status::failed_precondition("actor has no pending transaction"))?;
        if current.root_id != transaction_id {
            return Err(Status::failed_precondition(
                "pending transaction ID differs",
            ));
        }
        current.effects = effects;
        Ok(())
    }

    fn validate_start(&self, start: &ActorTransactionStart) -> Result<(), Status> {
        if start.transaction_ids.len() != 1 {
            return Err(Status::unimplemented(
                "nested or shared transactions are not supported",
            ));
        }
        if start.mode != TransactionMode::Exclusive {
            return Err(Status::unimplemented(
                "shared transactions are not supported",
            ));
        }
        if start.read_only {
            return Err(Status::unimplemented(
                "read-only transactions are not supported",
            ));
        }
        if start.factory {
            return Err(Status::unimplemented(
                "factory transactions are not supported",
            ));
        }
        if start.state_type != self.state_type || start.state_ref != self.state_ref {
            return Err(Status::invalid_argument(
                "cross-actor transactions are not supported",
            ));
        }
        if start.coordinator_state_type.is_empty() || start.coordinator_state_ref.is_empty() {
            return Err(Status::invalid_argument(
                "transaction coordinator must be specified",
            ));
        }
        Ok(())
    }

    async fn prepare(&self, transaction_id: Uuid) -> Result<PrepareOutcome, Status> {
        let mut pending = self.pending.lock().await;
        let Some(current) = pending.as_mut() else {
            return Ok(PrepareOutcome::DefinitiveAbort);
        };
        if current.root_id != transaction_id {
            return Ok(PrepareOutcome::DefinitiveAbort);
        }
        self.sidecar
            .prepare(database::TransactionParticipantPrepareRequest {
                state_type: self.state_type.clone(),
                state_ref: self.state_ref.clone(),
                transaction: Some(database::Transaction {
                    state_type: self.state_type.clone(),
                    state_ref: self.state_ref.clone(),
                    transaction_ids: vec![transaction_id.as_bytes().to_vec()],
                    coordinator_state_type: current.coordinator_state_type.clone(),
                    coordinator_state_ref: current.coordinator_state_ref.clone(),
                    prepared: false,
                    uncommitted_tasks: vec![],
                    uncommitted_idempotent_mutations: vec![],
                }),
                state: current.effects.state.clone(),
                task_upserts: current.effects.task_upserts.clone(),
                idempotent_mutations: current.effects.idempotent_mutations.clone(),
            })
            .await?;
        Ok(PrepareOutcome::Prepared)
    }

    async fn terminal(&self, transaction_id: Uuid, commit: bool) -> Result<(), Status> {
        let mut pending = self.pending.lock().await;
        let current = pending
            .as_ref()
            .ok_or_else(|| Status::failed_precondition("actor has no pending transaction"))?;
        if current.root_id != transaction_id {
            return Err(Status::failed_precondition(
                "pending transaction ID differs",
            ));
        }
        if commit {
            self.sidecar
                .commit(database::TransactionParticipantCommitRequest {
                    state_type: self.state_type.clone(),
                    state_ref: self.state_ref.clone(),
                })
                .await?;
        } else {
            self.sidecar
                .abort(database::TransactionParticipantAbortRequest {
                    state_type: self.state_type.clone(),
                    state_ref: self.state_ref.clone(),
                })
                .await?;
        }
        // Only an acknowledged terminal RPC makes release truthful.
        *pending = None;
        Ok(())
    }
}

/// Tonic Participant service backed by one durable actor-local runtime.
#[derive(Clone)]
pub struct DurableActorParticipantHost<C: ParticipantSidecar> {
    participant: DurableActorParticipant<C>,
}

impl<C: ParticipantSidecar> DurableActorParticipantHost<C> {
    pub fn new(participant: DurableActorParticipant<C>) -> Self {
        Self { participant }
    }

    fn transaction_id<T>(&self, request: &Request<T>) -> Result<Uuid, Status>
    where
        T: TransactionId,
    {
        let state_ref = request
            .metadata()
            .get(STATE_REF_HEADER)
            .ok_or_else(|| Status::invalid_argument("missing metadata `x-reboot-state-ref`"))?
            .to_str()
            .map_err(|_| Status::invalid_argument("invalid metadata `x-reboot-state-ref`"))?;
        if state_ref != self.participant.state_ref {
            return Err(Status::invalid_argument(
                "participant host received another actor",
            ));
        }
        Uuid::from_slice(request.get_ref().transaction_id())
            .map_err(|_| Status::invalid_argument("transaction_id must be a 16-byte UUID"))
    }
}

trait TransactionId {
    fn transaction_id(&self) -> &[u8];
}

impl TransactionId for database::PrepareRequest {
    fn transaction_id(&self) -> &[u8] {
        &self.transaction_id
    }
}
impl TransactionId for database::CommitRequest {
    fn transaction_id(&self) -> &[u8] {
        &self.transaction_id
    }
}
impl TransactionId for database::AbortRequest {
    fn transaction_id(&self) -> &[u8] {
        &self.transaction_id
    }
}

#[tonic::async_trait]
impl<C: ParticipantSidecar> database::participant_server::Participant
    for DurableActorParticipantHost<C>
{
    async fn prepare(
        &self,
        request: Request<database::PrepareRequest>,
    ) -> Result<Response<database::PrepareResponse>, Status> {
        let abort_via_response = request.get_ref().abort_via_response;
        match self
            .participant
            .prepare(self.transaction_id(&request)?)
            .await?
        {
            PrepareOutcome::Prepared => Ok(Response::new(database::PrepareResponse::default())),
            PrepareOutcome::DefinitiveAbort if abort_via_response => {
                Ok(Response::new(database::PrepareResponse {
                    abort: true,
                    restart_detected: false,
                    recovery_timestamp: None,
                }))
            }
            PrepareOutcome::DefinitiveAbort => Err(Status::failed_precondition(
                "actor has no matching pending transaction",
            )),
        }
    }

    async fn commit(
        &self,
        request: Request<database::CommitRequest>,
    ) -> Result<Response<database::CommitResponse>, Status> {
        self.participant
            .terminal(self.transaction_id(&request)?, true)
            .await?;
        Ok(Response::new(database::CommitResponse::default()))
    }

    async fn abort(
        &self,
        request: Request<database::AbortRequest>,
    ) -> Result<Response<database::AbortResponse>, Status> {
        self.participant
            .terminal(self.transaction_id(&request)?, false)
            .await?;
        Ok(Response::new(database::AbortResponse::default()))
    }

    async fn relinquish_ownership(
        &self,
        _: Request<database::RelinquishOwnershipRequest>,
    ) -> Result<Response<database::RelinquishOwnershipResponse>, Status> {
        Err(Status::unimplemented(
            "nested transaction ownership is not supported",
        ))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::VecDeque;
    use std::sync::Mutex;

    #[derive(Clone, Debug, PartialEq)]
    enum Call {
        Load(database::LoadRequest),
        Prepare(Box<database::TransactionParticipantPrepareRequest>),
        Commit(database::TransactionParticipantCommitRequest),
        Abort(database::TransactionParticipantAbortRequest),
    }

    #[derive(Default)]
    struct MockSidecar {
        calls: Mutex<Vec<Call>>,
        prepare_results: Mutex<VecDeque<Result<(), Status>>>,
        terminal_results: Mutex<VecDeque<Result<(), Status>>>,
    }

    impl ParticipantSidecar for MockSidecar {
        fn load(
            &self,
            request: database::LoadRequest,
        ) -> SidecarFuture<'_, database::LoadResponse> {
            self.calls.lock().unwrap().push(Call::Load(request));
            Box::pin(async { Ok(database::LoadResponse::default()) })
        }
        fn prepare(
            &self,
            request: database::TransactionParticipantPrepareRequest,
        ) -> SidecarFuture<'_, database::TransactionParticipantPrepareResponse> {
            self.calls
                .lock()
                .unwrap()
                .push(Call::Prepare(Box::new(request)));
            let result = self
                .prepare_results
                .lock()
                .unwrap()
                .pop_front()
                .unwrap_or(Ok(()));
            Box::pin(async move {
                result.map(|()| database::TransactionParticipantPrepareResponse::default())
            })
        }
        fn commit(
            &self,
            request: database::TransactionParticipantCommitRequest,
        ) -> SidecarFuture<'_, database::TransactionParticipantCommitResponse> {
            self.calls.lock().unwrap().push(Call::Commit(request));
            let result = self
                .terminal_results
                .lock()
                .unwrap()
                .pop_front()
                .unwrap_or(Ok(()));
            Box::pin(async move {
                result.map(|()| database::TransactionParticipantCommitResponse::default())
            })
        }
        fn abort(
            &self,
            request: database::TransactionParticipantAbortRequest,
        ) -> SidecarFuture<'_, database::TransactionParticipantAbortResponse> {
            self.calls.lock().unwrap().push(Call::Abort(request));
            let result = self
                .terminal_results
                .lock()
                .unwrap()
                .pop_front()
                .unwrap_or(Ok(()));
            Box::pin(async move {
                result.map(|()| database::TransactionParticipantAbortResponse::default())
            })
        }
    }

    fn start(id: Uuid) -> ActorTransactionStart {
        ActorTransactionStart {
            transaction_ids: vec![id],
            coordinator_state_type: "example.Coordinator".into(),
            coordinator_state_ref: "coordinator/1".into(),
            mode: TransactionMode::Exclusive,
            read_only: false,
            factory: false,
            state_type: "example.Actor".into(),
            state_ref: "actor/1".into(),
        }
    }

    #[tokio::test]
    async fn stages_exact_sidecar_payload_and_releases_after_commit_acknowledged() {
        let sidecar = Arc::new(MockSidecar::default());
        let participant =
            DurableActorParticipant::new(Arc::clone(&sidecar), "example.Actor", "actor/1");
        let id = Uuid::from_u128(1);
        participant.start(start(id)).await.unwrap();
        let mutation = database::IdempotentMutation {
            key: vec![7],
            response: vec![8],
            ..Default::default()
        };
        participant
            .stage(
                id,
                PendingActorEffects {
                    state: Some(vec![1, 2]),
                    task_upserts: vec![],
                    idempotent_mutations: vec![mutation.clone()],
                },
            )
            .await
            .unwrap();
        let host = DurableActorParticipantHost::new(participant.clone());
        let mut prepare = Request::new(database::PrepareRequest {
            transaction_id: id.as_bytes().to_vec(),
            abort_via_response: true,
            read_only_aware: false,
            read_only: false,
        });
        prepare
            .metadata_mut()
            .insert(STATE_REF_HEADER, "actor/1".parse().unwrap());
        database::participant_server::Participant::prepare(&host, prepare)
            .await
            .unwrap();
        let mut mismatch = Request::new(database::PrepareRequest {
            transaction_id: Uuid::from_u128(99).as_bytes().to_vec(),
            abort_via_response: true,
            read_only_aware: false,
            read_only: false,
        });
        mismatch
            .metadata_mut()
            .insert(STATE_REF_HEADER, "actor/1".parse().unwrap());
        assert!(
            database::participant_server::Participant::prepare(&host, mismatch)
                .await
                .unwrap()
                .into_inner()
                .abort
        );
        let mut commit = Request::new(database::CommitRequest {
            transaction_id: id.as_bytes().to_vec(),
        });
        commit
            .metadata_mut()
            .insert(STATE_REF_HEADER, "actor/1".parse().unwrap());
        database::participant_server::Participant::commit(&host, commit)
            .await
            .unwrap();
        participant.start(start(Uuid::from_u128(2))).await.unwrap();

        let calls = sidecar.calls.lock().unwrap().clone();
        assert_eq!(calls.len(), 4);
        assert!(
            matches!(&calls[0], Call::Load(request) if request.actors == vec![database::Actor { state_type: "example.Actor".into(), state_ref: "actor/1".into(), state: None }])
        );
        assert!(
            matches!(&calls[1], Call::Prepare(request) if request.state_type == "example.Actor" && request.state_ref == "actor/1" && request.transaction.as_ref().is_some_and(|transaction| transaction.transaction_ids == vec![id.as_bytes().to_vec()] && transaction.state_type == "example.Actor" && transaction.state_ref == "actor/1" && transaction.coordinator_state_type == "example.Coordinator" && transaction.coordinator_state_ref == "coordinator/1") && request.state == Some(vec![1, 2]) && request.idempotent_mutations == vec![mutation])
        );
        assert!(
            matches!(&calls[2], Call::Commit(request) if request.state_type == "example.Actor" && request.state_ref == "actor/1")
        );
        assert!(matches!(&calls[3], Call::Load(_)));
    }

    #[tokio::test]
    async fn ambiguous_sidecar_failures_keep_lock_and_pending_transaction() {
        let sidecar = Arc::new(MockSidecar::default());
        sidecar
            .prepare_results
            .lock()
            .unwrap()
            .push_back(Err(Status::unavailable("lost reply")));
        sidecar
            .terminal_results
            .lock()
            .unwrap()
            .push_back(Err(Status::unavailable("lost reply")));
        let participant =
            DurableActorParticipant::new(Arc::clone(&sidecar), "example.Actor", "actor/1");
        let id = Uuid::from_u128(3);
        participant.start(start(id)).await.unwrap();
        assert_eq!(
            participant.prepare(id).await.unwrap_err().code(),
            tonic::Code::Unavailable
        );
        // A retry is the only safe response to an ambiguous prepare failure.
        participant.prepare(id).await.unwrap();
        assert_eq!(
            participant.terminal(id, false).await.unwrap_err().code(),
            tonic::Code::Unavailable
        );
        participant.terminal(id, false).await.unwrap();
        participant.start(start(Uuid::from_u128(4))).await.unwrap();
        assert!(matches!(sidecar.calls.lock().unwrap()[4], Call::Abort(_)));
    }

    #[tokio::test]
    async fn rejects_unsupported_transaction_shapes_before_sidecar_io() {
        let sidecar = Arc::new(MockSidecar::default());
        let participant =
            DurableActorParticipant::new(Arc::clone(&sidecar), "example.Actor", "actor/1");
        let mut nested = start(Uuid::from_u128(5));
        nested.transaction_ids.push(Uuid::from_u128(6));
        assert_eq!(
            participant.start(nested).await.unwrap_err().code(),
            tonic::Code::Unimplemented
        );
        let mut cross_actor = start(Uuid::from_u128(7));
        cross_actor.state_ref = "actor/2".into();
        assert_eq!(
            participant.start(cross_actor).await.unwrap_err().code(),
            tonic::Code::InvalidArgument
        );
        assert!(sidecar.calls.lock().unwrap().is_empty());
    }
}
