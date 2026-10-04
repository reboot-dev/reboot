//! Durable, actor-local participant runtime for Reboot's native sidecar protocol.
//!
//! This module owns exactly one actor's exclusive transaction. It loads that
//! actor and holds its lock from `start` through a sidecar-acknowledged
//! `Commit` or `Abort`. A caller which explicitly opts in may preserve a
//! nested transaction-ID path in the sidecar record, but this module neither
//! executes nested RPCs nor coordinates multiple participants. It deliberately
//! does not implement shared, read-only, or cross-actor transactions. Factory
//! transactions are limited to one exclusive root actor.

use std::future::Future;
use std::pin::Pin;
use std::sync::Arc;

use prost::Message;
use tonic::{Request, Response, Status};
use uuid::Uuid;

use crate::{database_proto as database, runtime::TransactionMode};

const STATE_REF_HEADER: &str = "x-reboot-state-ref";

type SidecarFuture<'a, T> = Pin<Box<dyn Future<Output = Result<T, Status>> + Send + 'a>>;

/// Input needed to recover the one actor owned by this participant.
///
/// Recovery is intentionally participant-only: it reconstructs local durable
/// ownership so that an already-running coordinator can send terminal control.
/// It neither recovers nor watches a coordinator.
#[derive(Clone, Debug, Default)]
pub struct ParticipantRecovery {
    pub state_tags_by_state_type: std::collections::BTreeMap<String, String>,
    pub shard_ids: Vec<String>,
}

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
    /// Collects every response from the native server-streaming `Database.Recover` RPC.
    fn recover(
        &self,
        request: database::RecoverRequest,
    ) -> SidecarFuture<'_, Vec<database::RecoverResponse>>;
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

    fn recover(
        &self,
        request: database::RecoverRequest,
    ) -> SidecarFuture<'_, Vec<database::RecoverResponse>> {
        Box::pin(async move {
            let mut stream = self
                .client
                .lock()
                .await
                .recover(request)
                .await?
                .into_inner();
            let mut responses = Vec::new();
            while let Some(response) = stream.message().await? {
                responses.push(response);
            }
            Ok(responses)
        })
    }
}

/// Transaction attributes supplied by a future generated transaction adapter.
#[derive(Clone, Debug)]
pub struct ActorTransactionStart {
    pub transaction_ids: Vec<Uuid>,
    /// The caller's contract for the transaction-ID path. Preserving a nested
    /// path is storage/recovery plumbing only: terminal Participant RPCs still
    /// identify the root transaction ID, as required by `transactions.proto`.
    pub transaction_path: TransactionPathContract,
    pub coordinator_state_type: String,
    pub coordinator_state_ref: String,
    pub mode: TransactionMode,
    pub read_only: bool,
    pub factory: bool,
    pub state_type: String,
    pub state_ref: String,
}

/// Whether a caller has explicitly opted into preserving a nested ID path.
///
/// Generated root adapters use [`Self::RootOnly`]. A future generated inbound
/// nested adapter must select [`Self::PreserveNested`] after it has validated
/// its inbound transaction context; accepting a multi-ID path by default would
/// falsely imply that every current caller implements nested execution.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum TransactionPathContract {
    RootOnly,
    PreserveNested,
}

/// Serialized effects which become durable only when the participant prepares.
#[derive(Clone, Debug, Default)]
pub struct PendingActorEffects {
    /// Serialized final protobuf state. `None` deliberately leaves state unset.
    pub state: Option<Vec<u8>>,
    pub task_upserts: Vec<database::Task>,
    pub idempotent_mutations: Vec<database::IdempotentMutation>,
}

impl PendingActorEffects {
    /// Compares effects using their canonical Prost encodings. State is already
    /// serialized, so preserve its bytes (and the distinction between unset and
    /// an empty state) exactly. Repeated effects retain their ordering because
    /// the sidecar receives them in that order.
    fn matches_staged(&self, other: &Self) -> bool {
        self.state == other.state
            && self.task_upserts.len() == other.task_upserts.len()
            && self.idempotent_mutations.len() == other.idempotent_mutations.len()
            && self
                .task_upserts
                .iter()
                .zip(&other.task_upserts)
                .all(|(left, right)| left.encode_to_vec() == right.encode_to_vec())
            && self
                .idempotent_mutations
                .iter()
                .zip(&other.idempotent_mutations)
                .all(|(left, right)| left.encode_to_vec() == right.encode_to_vec())
    }
}

struct Pending {
    root_id: Uuid,
    transaction_ids: Vec<Uuid>,
    coordinator_state_type: String,
    coordinator_state_ref: String,
    effects: PendingActorEffects,
    staged: bool,
    prepared: bool,
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
            transaction_ids: start.transaction_ids,
            coordinator_state_type: start.coordinator_state_type,
            coordinator_state_ref: start.coordinator_state_ref,
            effects: PendingActorEffects::default(),
            staged: false,
            prepared: false,
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
        if !current.staged {
            current.effects = effects;
            current.staged = true;
            Ok(())
        } else if current.effects.matches_staged(&effects) {
            Ok(())
        } else {
            Err(Status::failed_precondition(
                "staged effects differ from the pending transaction",
            ))
        }
    }

    /// Aborts a started transaction before a coordinator has been driven.
    ///
    /// Callers use this when decoding or invoking a local handler fails. As
    /// with every terminal sidecar operation, an RPC failure is ambiguous and
    /// keeps the lock and pending transaction in place for recovery/retry.
    pub async fn abort(&self, transaction_id: Uuid) -> Result<(), Status> {
        self.terminal(transaction_id, false).await
    }

    fn validate_start(&self, start: &ActorTransactionStart) -> Result<(), Status> {
        if start.transaction_ids.is_empty() {
            return Err(Status::invalid_argument(
                "transaction ID path must not be empty",
            ));
        }
        if has_duplicate_transaction_ids(&start.transaction_ids) {
            return Err(Status::invalid_argument(
                "transaction ID path must not contain duplicate UUIDs",
            ));
        }
        if start.transaction_path == TransactionPathContract::RootOnly
            && start.transaction_ids.len() != 1
        {
            return Err(Status::unimplemented(
                "nested transaction paths require the PreserveNested caller contract",
            ));
        }
        if start.transaction_path == TransactionPathContract::PreserveNested
            && start.transaction_ids.len() == 1
        {
            return Err(Status::invalid_argument(
                "PreserveNested caller contract requires a nested transaction ID path",
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
        if start.factory && start.transaction_path != TransactionPathContract::RootOnly {
            return Err(Status::unimplemented(
                "factory transactions must be exclusive root transactions",
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
        // `Database.Recover` restores a durable prepared RocksDB transaction.
        // A recovering coordinator replays Prepare, which must acknowledge that
        // state instead of attempting a second sidecar prepare.
        if current.prepared {
            return Ok(PrepareOutcome::Prepared);
        }
        self.sidecar
            .prepare(database::TransactionParticipantPrepareRequest {
                state_type: self.state_type.clone(),
                state_ref: self.state_ref.clone(),
                transaction: Some(database::Transaction {
                    state_type: self.state_type.clone(),
                    state_ref: self.state_ref.clone(),
                    transaction_ids: current
                        .transaction_ids
                        .iter()
                        .map(|id| id.as_bytes().to_vec())
                        .collect(),
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
        current.prepared = true;
        Ok(PrepareOutcome::Prepared)
    }

    /// Rebuilds this actor's durable participant ownership after a restart.
    ///
    /// The sidecar's prepared transaction already owns the staged state. The
    /// native recovery record contains only task and idempotent-mutation
    /// effects, so state deliberately remains unset here; recovery serves only
    /// the matching terminal control RPC and never restages or manufactures it.
    pub async fn recover(&self, recovery: ParticipantRecovery) -> Result<(), Status> {
        if recovery.shard_ids.is_empty() {
            return Err(Status::invalid_argument(
                "participant recovery requires at least one shard ID",
            ));
        }
        let responses = self
            .sidecar
            .recover(database::RecoverRequest {
                state_tags_by_state_type: recovery.state_tags_by_state_type,
                shard_ids: recovery.shard_ids,
                skip_idempotent_mutations: true,
            })
            .await?;
        let mut recovered = None;
        for transaction in responses
            .into_iter()
            .flat_map(|response| response.participant_transactions)
            .filter(|transaction| {
                transaction.state_type == self.state_type && transaction.state_ref == self.state_ref
            })
        {
            if recovered.is_some() {
                return Err(Status::failed_precondition(
                    "multiple durable transactions recovered for one actor",
                ));
            }
            if transaction.transaction_ids.is_empty() {
                return Err(Status::failed_precondition(
                    "recovered transaction ID path must not be empty",
                ));
            }
            let transaction_ids = transaction
                .transaction_ids
                .iter()
                .map(|id| {
                    Uuid::from_slice(id).map_err(|_| {
                        Status::failed_precondition(
                            "recovered transaction ID path must contain 16-byte UUIDs",
                        )
                    })
                })
                .collect::<Result<Vec<_>, _>>()?;
            if has_duplicate_transaction_ids(&transaction_ids) {
                return Err(Status::failed_precondition(
                    "recovered transaction ID path must not contain duplicate UUIDs",
                ));
            }
            let root_id = transaction_ids[0];
            if transaction.coordinator_state_type.is_empty()
                || transaction.coordinator_state_ref.is_empty()
            {
                return Err(Status::failed_precondition(
                    "recovered transaction must identify its coordinator",
                ));
            }
            recovered = Some((root_id, transaction_ids, transaction));
        }
        let Some((root_id, transaction_ids, transaction)) = recovered else {
            return Ok(());
        };

        // Acquire before publishing ownership, so no terminal request can be
        // served without this actor's exclusive lock.
        let lock = Arc::clone(&self.lock).lock_owned().await;
        let mut pending = self.pending.lock().await;
        if pending.is_some() {
            return Err(Status::failed_precondition(
                "actor already has a pending transaction",
            ));
        }
        *pending = Some(Pending {
            root_id,
            transaction_ids,
            coordinator_state_type: transaction.coordinator_state_type,
            coordinator_state_ref: transaction.coordinator_state_ref,
            effects: PendingActorEffects {
                // The native recovery contract does not expose staged state.
                state: None,
                task_upserts: transaction.uncommitted_tasks,
                idempotent_mutations: transaction.uncommitted_idempotent_mutations,
            },
            // Recovery exposes the durable task and idempotent-mutation
            // effects, so it must never permit a later Stage to replace them.
            staged: true,
            // An unprepared record is retained only to ensure a later Commit
            // is converted to Abort; it can never be committed.
            prepared: transaction.prepared,
            _lock: lock,
        });
        Ok(())
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
        let force_abort = commit && !current.prepared;
        if commit && !force_abort {
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
        if force_abort {
            return Err(Status::failed_precondition(
                "commit requires the matching prepared transaction; transaction was aborted",
            ));
        }
        Ok(())
    }
}

fn has_duplicate_transaction_ids(transaction_ids: &[Uuid]) -> bool {
    transaction_ids
        .iter()
        .enumerate()
        .any(|(index, id)| transaction_ids[..index].contains(id))
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

    use crate::durable_coordinator::{InProcessParticipantEndpoint, ParticipantEndpoint};

    #[derive(Clone, Debug, PartialEq)]
    enum Call {
        Load(database::LoadRequest),
        Prepare(Box<database::TransactionParticipantPrepareRequest>),
        Commit(database::TransactionParticipantCommitRequest),
        Abort(database::TransactionParticipantAbortRequest),
        Recover(database::RecoverRequest),
    }

    #[derive(Default)]
    struct MockSidecar {
        calls: Mutex<Vec<Call>>,
        prepare_results: Mutex<VecDeque<Result<(), Status>>>,
        terminal_results: Mutex<VecDeque<Result<(), Status>>>,
        recover_responses: Mutex<VecDeque<Result<database::RecoverResponse, Status>>>,
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
        fn recover(
            &self,
            request: database::RecoverRequest,
        ) -> SidecarFuture<'_, Vec<database::RecoverResponse>> {
            self.calls.lock().unwrap().push(Call::Recover(request));
            let responses = self
                .recover_responses
                .lock()
                .unwrap()
                .drain(..)
                .collect::<Result<Vec<_>, _>>();
            Box::pin(async move { responses })
        }
    }

    fn start(id: Uuid) -> ActorTransactionStart {
        ActorTransactionStart {
            transaction_ids: vec![id],
            transaction_path: TransactionPathContract::RootOnly,
            coordinator_state_type: "example.Coordinator".into(),
            coordinator_state_ref: "coordinator/1".into(),
            mode: TransactionMode::Exclusive,
            read_only: false,
            factory: false,
            state_type: "example.Actor".into(),
            state_ref: "actor/1".into(),
        }
    }

    fn recovery() -> ParticipantRecovery {
        ParticipantRecovery {
            state_tags_by_state_type: [("example.Actor".into(), "actor".into())].into(),
            shard_ids: vec!["shard-a".into()],
        }
    }

    fn recovered_transaction(id: Uuid, prepared: bool) -> database::Transaction {
        database::Transaction {
            state_type: "example.Actor".into(),
            state_ref: "actor/1".into(),
            transaction_ids: vec![id.as_bytes().to_vec()],
            coordinator_state_type: "example.Coordinator".into(),
            coordinator_state_ref: "coordinator/1".into(),
            prepared,
            uncommitted_tasks: vec![database::Task::default()],
            uncommitted_idempotent_mutations: vec![database::IdempotentMutation {
                key: vec![9],
                response: vec![10],
                ..Default::default()
            }],
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
        let task = database::Task {
            method: "example.Task".into(),
            request: vec![3, 4],
            ..Default::default()
        };
        participant
            .stage(
                id,
                PendingActorEffects {
                    state: Some(vec![1, 2]),
                    task_upserts: vec![task.clone()],
                    idempotent_mutations: vec![mutation.clone()],
                },
            )
            .await
            .unwrap();
        participant
            .stage(
                id,
                PendingActorEffects {
                    state: Some(vec![1, 2]),
                    task_upserts: vec![task.clone()],
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
            matches!(&calls[1], Call::Prepare(request) if request.state_type == "example.Actor" && request.state_ref == "actor/1" && request.transaction.as_ref().is_some_and(|transaction| transaction.transaction_ids == vec![id.as_bytes().to_vec()] && transaction.state_type == "example.Actor" && transaction.state_ref == "actor/1" && transaction.coordinator_state_type == "example.Coordinator" && transaction.coordinator_state_ref == "coordinator/1") && request.state == Some(vec![1, 2]) && request.task_upserts == vec![task] && request.idempotent_mutations == vec![mutation])
        );
        assert!(
            matches!(&calls[2], Call::Commit(request) if request.state_type == "example.Actor" && request.state_ref == "actor/1")
        );
        assert!(matches!(&calls[3], Call::Load(_)));
    }

    #[tokio::test]
    async fn rejects_different_staged_effects_without_overwriting_pending_effects() {
        let sidecar = Arc::new(MockSidecar::default());
        let participant =
            DurableActorParticipant::new(Arc::clone(&sidecar), "example.Actor", "actor/1");
        let id = Uuid::from_u128(101);
        let effects = PendingActorEffects {
            state: Some(vec![1, 2]),
            task_upserts: vec![database::Task {
                method: "example.Task".into(),
                request: vec![3, 4],
                ..Default::default()
            }],
            idempotent_mutations: vec![database::IdempotentMutation {
                key: vec![5],
                response: vec![6],
                ..Default::default()
            }],
        };
        participant.start(start(id)).await.unwrap();
        participant.stage(id, effects.clone()).await.unwrap();

        let mut different_state = effects.clone();
        different_state.state = Some(vec![9]);
        let mut different_task = effects.clone();
        different_task.task_upserts[0].request = vec![9];
        let mut different_mutation = effects.clone();
        different_mutation.idempotent_mutations[0].response = vec![9];
        for different_effects in [different_state, different_task, different_mutation] {
            assert_eq!(
                participant
                    .stage(id, different_effects)
                    .await
                    .unwrap_err()
                    .code(),
                tonic::Code::FailedPrecondition
            );
        }

        participant.prepare(id).await.unwrap();
        participant.terminal(id, false).await.unwrap();
        participant
            .start(start(Uuid::from_u128(102)))
            .await
            .unwrap();

        let calls = sidecar.calls.lock().unwrap().clone();
        assert!(matches!(
            &calls[1],
            Call::Prepare(request)
                if request.state == effects.state
                    && request.task_upserts == effects.task_upserts
                    && request.idempotent_mutations == effects.idempotent_mutations
        ));
        assert!(matches!(&calls[2], Call::Abort(_)));
        assert!(matches!(&calls[3], Call::Load(_)));
    }

    #[tokio::test]
    async fn in_process_endpoint_prepares_and_commits_the_injected_pending_participant() {
        let sidecar = Arc::new(MockSidecar::default());
        let participant =
            DurableActorParticipant::new(Arc::clone(&sidecar), "example.Actor", "actor/1");
        let id = Uuid::from_u128(12);
        participant.start(start(id)).await.unwrap();
        let endpoint = InProcessParticipantEndpoint::new(DurableActorParticipantHost::new(
            participant.clone(),
        ));

        endpoint
            .prepare(
                "actor/1",
                database::PrepareRequest {
                    transaction_id: id.as_bytes().to_vec(),
                    abort_via_response: true,
                    read_only_aware: false,
                    read_only: false,
                },
            )
            .await
            .unwrap();
        endpoint
            .commit(
                "actor/1",
                database::CommitRequest {
                    transaction_id: id.as_bytes().to_vec(),
                },
            )
            .await
            .unwrap();
        participant.start(start(Uuid::from_u128(13))).await.unwrap();

        assert!(matches!(
            sidecar.calls.lock().unwrap().as_slice(),
            [
                Call::Load(_),
                Call::Prepare(_),
                Call::Commit(_),
                Call::Load(_)
            ]
        ));
    }

    #[tokio::test]
    async fn in_process_endpoint_rejects_invalid_or_mismatched_state_references() {
        let sidecar = Arc::new(MockSidecar::default());
        let participant =
            DurableActorParticipant::new(Arc::clone(&sidecar), "example.Actor", "actor/1");
        let id = Uuid::from_u128(14);
        participant.start(start(id)).await.unwrap();
        let endpoint =
            InProcessParticipantEndpoint::new(DurableActorParticipantHost::new(participant));
        let request = || database::PrepareRequest {
            transaction_id: id.as_bytes().to_vec(),
            abort_via_response: true,
            read_only_aware: false,
            read_only: false,
        };

        assert_eq!(
            endpoint
                .prepare("actor/2", request())
                .await
                .unwrap_err()
                .code(),
            tonic::Code::InvalidArgument
        );
        assert_eq!(
            endpoint
                .prepare("actor\n2", request())
                .await
                .unwrap_err()
                .code(),
            tonic::Code::InvalidArgument
        );
        assert!(matches!(
            sidecar.calls.lock().unwrap().as_slice(),
            [Call::Load(_)]
        ));
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
    async fn preserves_an_explicit_nested_path_but_terminal_control_still_uses_root() {
        let sidecar = Arc::new(MockSidecar::default());
        let participant =
            DurableActorParticipant::new(Arc::clone(&sidecar), "example.Actor", "actor/1");
        let root = Uuid::from_u128(5);
        let child = Uuid::from_u128(6);
        let mut uncontracted = start(root);
        uncontracted.transaction_ids.push(child);
        assert_eq!(
            participant.start(uncontracted).await.unwrap_err().code(),
            tonic::Code::Unimplemented
        );

        let mut nested = start(root);
        nested.transaction_ids.push(child);
        nested.transaction_path = TransactionPathContract::PreserveNested;
        participant.start(nested).await.unwrap();
        participant
            .stage(root, PendingActorEffects::default())
            .await
            .unwrap();
        assert!(matches!(
            participant.prepare(child).await.unwrap(),
            PrepareOutcome::DefinitiveAbort
        ));
        assert_eq!(
            participant.terminal(child, true).await.unwrap_err().code(),
            tonic::Code::FailedPrecondition
        );
        participant.prepare(root).await.unwrap();
        participant.terminal(root, true).await.unwrap();

        let calls = sidecar.calls.lock().unwrap().clone();
        assert!(matches!(
            &calls[1],
            Call::Prepare(request)
                if request.transaction.as_ref().is_some_and(|transaction|
                    transaction.transaction_ids
                        == vec![root.as_bytes().to_vec(), child.as_bytes().to_vec()])
        ));
        assert!(matches!(&calls[2], Call::Commit(_)));
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

    #[tokio::test]
    async fn permits_factory_only_for_an_exclusive_root_transaction() {
        let sidecar = Arc::new(MockSidecar::default());
        let participant =
            DurableActorParticipant::new(Arc::clone(&sidecar), "example.Actor", "actor/1");
        let mut root_factory = start(Uuid::from_u128(70));
        root_factory.factory = true;
        participant.start(root_factory).await.unwrap();
        participant.abort(Uuid::from_u128(70)).await.unwrap();

        let mut nested_factory = start(Uuid::from_u128(71));
        nested_factory.factory = true;
        nested_factory.transaction_ids.push(Uuid::from_u128(72));
        nested_factory.transaction_path = TransactionPathContract::PreserveNested;
        assert_eq!(
            participant.start(nested_factory).await.unwrap_err().code(),
            tonic::Code::Unimplemented
        );
    }

    #[tokio::test]
    async fn recovered_prepared_participant_accepts_matching_terminal_commit_from_stream() {
        let sidecar = Arc::new(MockSidecar::default());
        let id = Uuid::from_u128(8);
        sidecar.recover_responses.lock().unwrap().extend([
            Ok(database::RecoverResponse::default()),
            Ok(database::RecoverResponse {
                participant_transactions: vec![recovered_transaction(id, true)],
                ..Default::default()
            }),
        ]);
        let participant =
            DurableActorParticipant::new(Arc::clone(&sidecar), "example.Actor", "actor/1");
        participant.recover(recovery()).await.unwrap();
        let host = DurableActorParticipantHost::new(participant.clone());
        // A recovering coordinator retries Prepare. The recovered durable
        // transaction must acknowledge it locally, not prepare RocksDB twice.
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
        let mut commit = Request::new(database::CommitRequest {
            transaction_id: id.as_bytes().to_vec(),
        });
        commit
            .metadata_mut()
            .insert(STATE_REF_HEADER, "actor/1".parse().unwrap());
        database::participant_server::Participant::commit(&host, commit)
            .await
            .unwrap();
        participant.start(start(Uuid::from_u128(9))).await.unwrap();

        let calls = sidecar.calls.lock().unwrap().clone();
        assert!(matches!(
            &calls[0],
            Call::Recover(request)
                if request.shard_ids == vec!["shard-a"]
                    && request.skip_idempotent_mutations
                    && request.state_tags_by_state_type["example.Actor"] == "actor"
        ));
        assert!(matches!(&calls[1], Call::Commit(request) if request.state_ref == "actor/1"));
        assert!(matches!(&calls[2], Call::Load(_)));
    }

    #[tokio::test]
    async fn recovered_unprepared_participant_aborts_and_fails_closed_on_commit() {
        let sidecar = Arc::new(MockSidecar::default());
        let id = Uuid::from_u128(10);
        sidecar
            .recover_responses
            .lock()
            .unwrap()
            .push_back(Ok(database::RecoverResponse {
                participant_transactions: vec![recovered_transaction(id, false)],
                ..Default::default()
            }));
        let participant =
            DurableActorParticipant::new(Arc::clone(&sidecar), "example.Actor", "actor/1");
        participant.recover(recovery()).await.unwrap();
        let host = DurableActorParticipantHost::new(participant.clone());
        let mut commit = Request::new(database::CommitRequest {
            transaction_id: id.as_bytes().to_vec(),
        });
        commit
            .metadata_mut()
            .insert(STATE_REF_HEADER, "actor/1".parse().unwrap());
        assert_eq!(
            database::participant_server::Participant::commit(&host, commit)
                .await
                .unwrap_err()
                .code(),
            tonic::Code::FailedPrecondition
        );
        participant.start(start(Uuid::from_u128(11))).await.unwrap();

        let calls = sidecar.calls.lock().unwrap().clone();
        assert!(matches!(&calls[0], Call::Recover(_)));
        assert!(matches!(&calls[1], Call::Abort(request) if request.state_ref == "actor/1"));
        assert!(matches!(&calls[2], Call::Load(_)));
    }
}
