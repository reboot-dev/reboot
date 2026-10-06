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

use crate::{
    database_proto as database,
    legacy_coordinator::CoordinatorWatchEndpoint,
    runtime::{ActorGate, ExclusiveActorLease, SharedActorLease, TransactionMode},
};

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
    /// Exact normalized Database authority, if this is a real sidecar client.
    fn database_endpoint(&self) -> Option<&str> {
        None
    }
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
    /// Collects completed mutations for root-local idempotency admission.
    fn recover_idempotent_mutations(
        &self,
        request: database::RecoverIdempotentMutationsRequest,
    ) -> SidecarFuture<'_, Vec<database::RecoverIdempotentMutationsResponse>>;
}

/// Native Tonic implementation of the actor participant's sidecar boundary.
pub struct TonicParticipantSidecar {
    endpoint: String,
    client:
        tokio::sync::Mutex<database::database_client::DatabaseClient<tonic::transport::Channel>>,
}

impl TonicParticipantSidecar {
    pub async fn connect(endpoint: impl AsRef<str>) -> Result<Self, tonic::transport::Error> {
        Ok(Self {
            endpoint: tonic::transport::Endpoint::from_shared(endpoint.as_ref().to_owned())?
                .uri()
                .to_string(),
            client: tokio::sync::Mutex::new(
                database::database_client::DatabaseClient::connect(endpoint.as_ref().to_owned())
                    .await?,
            ),
        })
    }
}

impl ParticipantSidecar for TonicParticipantSidecar {
    fn database_endpoint(&self) -> Option<&str> {
        Some(&self.endpoint)
    }
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
            let response = self
                .client
                .lock()
                .await
                .transaction_participant_commit(request)
                .await?
                .into_inner();
            #[cfg(feature = "test-support")]
            if let Some(marker) = std::env::var_os("REBOOT_TEST_LOST_PARTICIPANT_COMMIT_ACK") {
                std::fs::write(marker, "durably committed; ACK lost")
                    .map_err(|error| Status::internal(error.to_string()))?;
                #[cfg(feature = "test-support")]
                if let Some(queued) = std::env::var_os("REBOOT_TEST_COMPETING_ADMISSION") {
                    let queued = std::path::Path::new(&queued);
                    tokio::time::timeout(std::time::Duration::from_secs(2), async {
                        while !queued.exists() {
                            tokio::time::sleep(std::time::Duration::from_millis(5)).await;
                        }
                    })
                    .await
                    .map_err(|_| {
                        Status::internal("competing public request did not reach actor admission")
                    })?;
                }
                return Err(Status::unavailable("injected lost participant Commit ACK"));
            }
            #[cfg(feature = "test-support")]
            if let Some(marker) = std::env::var_os("REBOOT_TEST_CANCEL_PARTICIPANT_COMMIT_ACK") {
                std::fs::write(marker, "durably committed; terminal future parked")
                    .map_err(|error| Status::internal(error.to_string()))?;
                std::future::pending::<()>().await;
            }
            Ok(response)
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

    fn recover_idempotent_mutations(
        &self,
        request: database::RecoverIdempotentMutationsRequest,
    ) -> SidecarFuture<'_, Vec<database::RecoverIdempotentMutationsResponse>> {
        Box::pin(async move {
            let mut stream = self
                .client
                .lock()
                .await
                .recover_idempotent_mutations(request)
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

/// Lock contract for a participant root. This remains distinct from the
/// coordinator's read-only classification.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ParticipantStartMode {
    Exclusive,
    SharedUpgradeable,
}

/// Opaque evidence that a shared participant atomically promoted its gate.
///
/// Only this module can construct the proof. It is consumed by the narrow
/// shared-root coordinator seam and is bound to the exact root and participant
/// identity that upgraded from shared to exclusive ownership.
#[derive(Debug)]
pub struct SharedPromotion {
    root_id: Uuid,
    state_type: String,
    state_ref: String,
}

impl SharedPromotion {
    pub(crate) fn matches(&self, root_id: Uuid, state_type: &str, state_ref: &str) -> bool {
        self.root_id == root_id && self.state_type == state_type && self.state_ref == state_ref
    }
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

enum PendingLock {
    Shared(SharedActorLease),
    Exclusive(ExclusiveActorLease),
}

impl PendingLock {
    fn is_shared(&self) -> bool {
        matches!(self, Self::Shared(_))
    }

    fn shared_mut(&mut self) -> Option<&mut SharedActorLease> {
        match self {
            Self::Shared(lease) => Some(lease),
            Self::Exclusive(lease) => {
                // Keep the exclusive lease observably owned by this pending
                // transaction while reporting that it cannot be promoted.
                let _ = lease;
                None
            }
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum PendingDisposition {
    ReadOnly,
    Commit,
}

struct Pending {
    local_owner: Option<Uuid>,
    root_id: Uuid,
    transaction_ids: Vec<Uuid>,
    coordinator_state_type: String,
    coordinator_state_ref: String,
    effects: PendingActorEffects,
    loaded_state: Option<Vec<u8>>,
    staged: bool,
    prepared: bool,
    disposition: PendingDisposition,
    // Kept until a terminal sidecar response is acknowledged.
    lock: PendingLock,
}

/// Cancellation-safe lifetime for local handler execution. Dropping it before
/// durable Prepare removes only in-memory ownership; it never sends a terminal
/// sidecar RPC. Once Prepare succeeds, normal ambiguous durable semantics win.
pub struct StartedLocalTransaction<C: ParticipantSidecar> {
    participant: DurableActorParticipant<C>,
    transaction_id: Uuid,
    state: Option<Vec<u8>>,
    local_owner: Uuid,
    armed: bool,
}

impl<C: ParticipantSidecar> StartedLocalTransaction<C> {
    pub fn state(&self) -> Option<&[u8]> {
        self.state.as_deref()
    }

    pub fn state_bytes(&self) -> Option<Vec<u8>> {
        self.state.clone()
    }

    pub async fn stage(
        &self,
        effects: PendingActorEffects,
    ) -> Result<Option<SharedPromotion>, Status> {
        self.participant.stage(self.transaction_id, effects).await
    }

    /// Consumes this started transaction into the one-shot direct-local
    /// promotion capability after [`Self::stage`] returned its proof.
    ///
    /// A failed conversion drops the still-armed started transaction, releasing
    /// only undurable local ownership and never issuing a sidecar terminal RPC.
    pub fn into_shared_local_promotion(
        self,
        promotion: SharedPromotion,
    ) -> Result<SharedLocalPromotion<C>, Status> {
        if !promotion.matches(
            self.transaction_id,
            &self.participant.state_type,
            &self.participant.state_ref,
        ) {
            return Err(Status::failed_precondition(
                "shared promotion does not match the started local transaction",
            ));
        }
        Ok(SharedLocalPromotion {
            started: self,
            promotion,
        })
    }

    /// Relinquishes pre-durable Drop cleanup before the first coordinator RPC
    /// can persist a record. The generated scheduling path simultaneously arms
    /// its host-owned uncertainty guard: errors/cancellation require supervised
    /// restart rather than speculative participant release or Abort.
    pub fn handoff_to_durable_recovery(&mut self) {
        self.armed = false;
    }

    /// Marks that a durable Prepare boundary has been crossed. A future
    /// coordinator integration must call this only after Prepare succeeds.
    pub fn disarm_after_durable_prepare(&mut self) {
        self.armed = false;
    }
}

/// One-shot authority to drive the actor already held by a staged shared-local
/// promotion. It cannot be cloned or recreated from actor identity, and its
/// terminal methods consume it so it is unavailable after direct Commit/Abort.
pub struct SharedLocalPromotion<C: ParticipantSidecar> {
    started: StartedLocalTransaction<C>,
    promotion: SharedPromotion,
}

impl<C: ParticipantSidecar> SharedLocalPromotion<C> {
    pub(crate) fn matches(&self, root_id: Uuid, state_type: &str, state_ref: &str) -> bool {
        self.promotion.matches(root_id, state_type, state_ref)
    }

    /// Transfers cancellation handling to durable recovery after coordinator
    /// Prepare has acknowledged the complete participant record.
    pub fn disarm_after_durable_prepare(&mut self) {
        self.started.disarm_after_durable_prepare();
    }

    /// Sends Prepare directly to the actor held by this capability. `true` is
    /// the only definitive local Abort result; RPC errors remain ambiguous.
    pub async fn prepare(&mut self) -> Result<bool, Status> {
        match self
            .started
            .participant
            .prepare(self.started.transaction_id, true, false)
            .await?
        {
            PrepareOutcome::Prepared => Ok(false),
            PrepareOutcome::DefinitiveAbort => Ok(true),
        }
    }

    /// Sends direct Commit and consumes this authority regardless of transport
    /// result. After durable Prepare, a failure intentionally leaves recovery
    /// ownership in the participant rather than converting ambiguity to Abort.
    pub async fn commit(self) -> Result<(), Status> {
        self.started
            .participant
            .terminal(self.started.transaction_id, true)
            .await
    }

    /// Sends direct Abort and consumes this authority. As with Commit, an RPC
    /// failure leaves the durable participant recoverable.
    pub async fn abort(self) -> Result<(), Status> {
        self.started
            .participant
            .terminal(self.started.transaction_id, false)
            .await
    }
}

impl<C: ParticipantSidecar> Drop for StartedLocalTransaction<C> {
    fn drop(&mut self) {
        if !self.armed {
            return;
        }
        let participant = self.participant.clone();
        let transaction_id = self.transaction_id;
        let local_owner = self.local_owner;
        tokio::spawn(async move {
            participant
                .drop_undurable(transaction_id, local_owner)
                .await
        });
    }
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
    lock: ActorGate,
    pending: Arc<tokio::sync::Mutex<Option<Pending>>>,
}

impl<C: ParticipantSidecar> Clone for DurableActorParticipant<C> {
    fn clone(&self) -> Self {
        Self {
            sidecar: Arc::clone(&self.sidecar),
            state_type: self.state_type.clone(),
            state_ref: self.state_ref.clone(),
            lock: self.lock.clone(),
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
        let state_type = state_type.into();
        let state_ref = state_ref.into();
        Self {
            sidecar,
            // A participant may be hosted by a sidecar unrelated to any
            // DatabaseActorStore, so its default gate is actor-local. Mixed
            // generated adapters bind it to their exact store below.
            lock: ActorGate::new(),
            state_type,
            state_ref,
            pending: Arc::new(tokio::sync::Mutex::new(None)),
        }
    }

    /// The injected sidecar boundary for generated root-local admission.
    pub fn sidecar(&self) -> Arc<C> {
        Arc::clone(&self.sidecar)
    }

    /// Binds this not-yet-started participant to normal accesses through one
    /// exact Database sidecar.
    pub fn with_database_actor_gate(mut self, store: &crate::runtime::DatabaseActorStore) -> Self {
        self.lock = store.actor_gate(&self.state_type, &self.state_ref);
        self
    }

    /// Verify the generated task owner shares this exact actor and sidecar.
    pub fn validate_task_owner(
        &self,
        store: &crate::runtime::DatabaseActorStore,
        state_type: &str,
        state_ref: &str,
    ) -> Result<(), Status> {
        if self.state_type != state_type
            || self.state_ref != state_ref
            || self.sidecar.database_endpoint() != Some(store.database_endpoint())
        {
            return Err(Status::failed_precondition(
                "task owner must share participant actor and Database endpoint",
            ));
        }
        Ok(())
    }

    /// Compatibility entrypoint for existing exclusive/read-only callers.
    ///
    /// The returned bytes are for the transaction adapter to deserialize; this
    /// runtime never manufactures state or effects itself.
    pub async fn start(&self, start: ActorTransactionStart) -> Result<Option<Vec<u8>>, Status> {
        self.validate_start(&start)?;
        self.start_with_mode(start, ParticipantStartMode::Exclusive)
            .await
    }

    /// Starts with an explicit local lock contract.
    pub async fn start_with_mode(
        &self,
        start: ActorTransactionStart,
        mode: ParticipantStartMode,
    ) -> Result<Option<Vec<u8>>, Status> {
        self.start_owned(start, mode, None).await
    }

    async fn start_owned(
        &self,
        start: ActorTransactionStart,
        mode: ParticipantStartMode,
        local_owner: Option<Uuid>,
    ) -> Result<Option<Vec<u8>>, Status> {
        self.validate_start_with_mode(&start, mode)?;
        #[cfg(feature = "test-support")]
        if self
            .pending
            .try_lock()
            .map_or(true, |pending| pending.is_some())
            && let Some(marker) = std::env::var_os("REBOOT_TEST_COMPETING_ADMISSION")
        {
            std::fs::write(
                marker,
                "public RPC admitted; waiting for retained actor lease",
            )
            .map_err(|error| Status::internal(error.to_string()))?;
        }
        let lock = match mode {
            ParticipantStartMode::Exclusive => PendingLock::Exclusive(self.lock.exclusive().await),
            ParticipantStartMode::SharedUpgradeable => {
                PendingLock::Shared(self.lock.shared().await)
            }
        };
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
            local_owner,
            root_id: start.transaction_ids[0],
            transaction_ids: start.transaction_ids,
            coordinator_state_type: start.coordinator_state_type,
            coordinator_state_ref: start.coordinator_state_ref,
            effects: PendingActorEffects::default(),
            loaded_state: state.clone(),
            staged: false,
            prepared: false,
            disposition: if start.read_only {
                PendingDisposition::ReadOnly
            } else {
                PendingDisposition::Commit
            },
            lock,
        });
        Ok(state)
    }

    /// Starts a local handler with cancellation-safe pre-durable cleanup.
    pub async fn start_local(
        &self,
        start: ActorTransactionStart,
        mode: ParticipantStartMode,
    ) -> Result<StartedLocalTransaction<C>, Status> {
        let transaction_id = start
            .transaction_ids
            .first()
            .copied()
            .ok_or_else(|| Status::invalid_argument("transaction ID path must not be empty"))?;
        let local_owner = Uuid::new_v4();
        let state = self.start_owned(start, mode, Some(local_owner)).await?;
        Ok(StartedLocalTransaction {
            participant: self.clone(),
            transaction_id,
            state,
            local_owner,
            armed: true,
        })
    }

    pub async fn stage(
        &self,
        transaction_id: Uuid,
        effects: PendingActorEffects,
    ) -> Result<Option<SharedPromotion>, Status> {
        let mut pending = self.pending.lock().await;
        let current = pending
            .as_mut()
            .ok_or_else(|| Status::failed_precondition("actor has no pending transaction"))?;
        if current.root_id != transaction_id {
            return Err(Status::failed_precondition(
                "pending transaction ID differs",
            ));
        }
        let changes_read_only_state = match (&current.loaded_state, &effects.state) {
            (None, Some(_)) => true,
            (Some(initial), Some(final_state)) => initial != final_state,
            _ => false,
        };
        if current.disposition == PendingDisposition::ReadOnly
            && (!effects.task_upserts.is_empty()
                || !effects.idempotent_mutations.is_empty()
                || changes_read_only_state)
        {
            return Err(Status::failed_precondition(
                "read-only transactions cannot stage changed state, tasks, or idempotency mutations",
            ));
        }
        if current.lock.is_shared()
            && (!effects.task_upserts.is_empty() || !effects.idempotent_mutations.is_empty())
        {
            return Err(Status::failed_precondition(
                "shared transactions cannot stage tasks or idempotency mutations",
            ));
        }
        if !current.staged {
            // Only an existing loaded state with different final bytes can
            // promote. Clearing state or attempting to create absent state is
            // classified read-only in this bounded participant slice.
            let changed = matches!(
                (&current.loaded_state, &effects.state),
                (Some(initial), Some(final_state)) if initial != final_state
            );
            let promoted = if changed && current.lock.is_shared() {
                let shared = current
                    .lock
                    .shared_mut()
                    .expect("shared pending lock was checked above");
                let exclusive = shared.upgrade().await.map_err(|error| {
                    Status::aborted(format!("shared participant promotion failed: {error:?}"))
                })?;
                current.lock = PendingLock::Exclusive(exclusive);
                current.disposition = PendingDisposition::Commit;
                Some(SharedPromotion {
                    root_id: current.root_id,
                    state_type: self.state_type.clone(),
                    state_ref: self.state_ref.clone(),
                })
            } else {
                None
            };
            if current.lock.is_shared() {
                current.disposition = PendingDisposition::ReadOnly;
            }
            current.effects = effects;
            current.staged = true;
            Ok(promoted)
        } else if current.effects.matches_staged(&effects) {
            Ok(None)
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
        self.validate_start_with_mode(start, ParticipantStartMode::Exclusive)
    }

    fn validate_start_with_mode(
        &self,
        start: &ActorTransactionStart,
        mode: ParticipantStartMode,
    ) -> Result<(), Status> {
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
        if start.mode == TransactionMode::Shared
            && mode == ParticipantStartMode::Exclusive
            && !start.read_only
        {
            return Err(Status::failed_precondition(
                "shared transactions must remain read-only",
            ));
        }
        if mode == ParticipantStartMode::SharedUpgradeable {
            if start.mode != TransactionMode::Shared {
                return Err(Status::invalid_argument(
                    "SharedUpgradeable requires shared transaction mode",
                ));
            }
            if start.transaction_path != TransactionPathContract::RootOnly
                || start.transaction_ids.len() != 1
            {
                return Err(Status::unimplemented(
                    "SharedUpgradeable requires a fresh root transaction",
                ));
            }
            if start.factory {
                return Err(Status::unimplemented(
                    "SharedUpgradeable does not support factory transactions",
                ));
            }
            if start.read_only {
                return Err(Status::invalid_argument(
                    "SharedUpgradeable requires a writable shared transaction attempt",
                ));
            }
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

    async fn prepare(
        &self,
        transaction_id: Uuid,
        read_only_aware: bool,
        read_only: bool,
    ) -> Result<PrepareOutcome, Status> {
        let mut pending = self.pending.lock().await;
        let Some(current) = pending.as_mut() else {
            return Ok(PrepareOutcome::DefinitiveAbort);
        };
        if current.root_id != transaction_id {
            return Ok(PrepareOutcome::DefinitiveAbort);
        }
        if current.disposition == PendingDisposition::ReadOnly {
            if !(read_only_aware && read_only) {
                return Err(Status::failed_precondition(
                    "read-only participant requires a read-only-aware prepare",
                ));
            }
            // The coordinator has already sealed this participant in its read-only map.
            // No sidecar transaction exists, so release exactly once at Prepare.
            *pending = None;
            return Ok(PrepareOutcome::Prepared);
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
        let lock = self.lock.exclusive().await;
        let mut pending = self.pending.lock().await;
        if pending.is_some() {
            return Err(Status::failed_precondition(
                "actor already has a pending transaction",
            ));
        }
        *pending = Some(Pending {
            local_owner: None,
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
            loaded_state: None,
            // Recovery exposes the durable task and idempotent-mutation
            // effects, so it must never permit a later Stage to replace them.
            staged: true,
            // An unprepared record is retained only to ensure a later Commit
            // is converted to Abort; it can never be committed.
            prepared: transaction.prepared,
            disposition: PendingDisposition::Commit,
            lock: PendingLock::Exclusive(lock),
        });
        Ok(())
    }

    /// Rebuilds ownership and converges it through the legacy Coordinator.Watch
    /// route selected by the host. An unprepared durable participant is
    /// fail-closed locally and cannot accept a commit decision.
    pub async fn recover_and_watch<W: CoordinatorWatchEndpoint>(
        &self,
        recovery: ParticipantRecovery,
        watch: &W,
    ) -> Result<(), Status> {
        self.recover_ownership(recovery).await?;
        self.watch_recovered(watch).await
    }

    /// Rebuild only the durable local ownership. Hosts call this before
    /// publishing recovery readiness, then supervise [`Self::watch_recovered`]
    /// separately so restarting a Watch never repeats the sidecar scan.
    pub async fn recover_ownership(&self, recovery: ParticipantRecovery) -> Result<(), Status> {
        self.recover(recovery).await
    }

    /// Watches a transaction already installed by [`Self::recover_ownership`].
    pub async fn watch_recovered<W: CoordinatorWatchEndpoint>(
        &self,
        watch: &W,
    ) -> Result<(), Status> {
        let pending = self.pending.lock().await;
        let Some(current) = pending.as_ref() else {
            return Ok(());
        };
        let root_id = current.root_id;
        let prepared = current.prepared;
        drop(pending);

        if !prepared {
            return self.terminal(root_id, false).await;
        }

        loop {
            match watch
                .watch(database::WatchRequest {
                    transaction_id: root_id.as_bytes().to_vec(),
                    state_type: self.state_type.clone(),
                    state_ref: self.state_ref.clone(),
                })
                .await
            {
                Ok(response) => {
                    self.terminal(root_id, !response.aborted).await?;
                    #[cfg(feature = "test-support")]
                    test_support::signal_watch_terminalized()?;
                    return Ok(());
                }
                // A status is not an authoritative decision. Mirror Python's
                // Watch loop by retrying every non-validating failure; task
                // cancellation still cancels this future rather than being
                // converted into a terminal participant control.
                Err(status) if !terminal_watch_failure(&status) => {
                    tokio::time::sleep(std::time::Duration::from_millis(10)).await;
                }
                // A validating Watch host deliberately returns membership and
                // malformed-decision failures. No terminal control is allowed
                // before a successful, authoritative Watch response.
                Err(status) => return Err(status),
            }
        }
    }

    async fn drop_undurable(&self, transaction_id: Uuid, local_owner: Uuid) {
        let mut pending = self.pending.lock().await;
        if pending.as_ref().is_some_and(|current| {
            current.root_id == transaction_id
                && current.local_owner == Some(local_owner)
                && !current.prepared
        }) {
            *pending = None;
        }
    }

    async fn terminal(&self, transaction_id: Uuid, commit: bool) -> Result<(), Status> {
        let mut pending = self.pending.lock().await;
        // Terminal delivery is deliberately idempotent.  In particular, a
        // coordinator that recovers a sealed `preparing` record can discover
        // that this process lost an unprepared, in-memory participant and
        // abort the complete set.  There is nothing to persist or release for
        // this actor in that case.  A duplicate terminal RPC after a prior
        // successful terminal response has the same outcome.
        let Some(current) = pending.as_ref() else {
            return Ok(());
        };
        if current.root_id != transaction_id {
            // This actor may already be serving a later root transaction.
            // Never terminalize that transaction for a stale control RPC.
            return Ok(());
        }
        if current.disposition == PendingDisposition::ReadOnly {
            *pending = None;
            return Ok(());
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

fn terminal_watch_failure(status: &Status) -> bool {
    matches!(
        status.code(),
        tonic::Code::InvalidArgument | tonic::Code::FailedPrecondition | tonic::Code::DataLoss
    )
}

/// Test-only cross-process acknowledgement used by the real C++ Database
/// acceptance fixture. It is emitted only after a successful Watch response
/// has caused the recovered prepared participant's terminal RPC to succeed.
#[cfg(feature = "test-support")]
#[doc(hidden)]
pub mod test_support {
    pub fn signal_watch_terminalized() -> Result<(), tonic::Status> {
        let Ok(marker) = std::env::var("REBOOT_TEST_TARGET_WATCH_TERMINALIZED") else {
            return Ok(());
        };
        use std::io::Write as _;

        std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(marker)
            .and_then(|mut marker| marker.write_all(b"watch-terminalized\n"))
            .map_err(|error| {
                tonic::Status::internal(format!(
                    "cannot create Watch recovery test barrier: {error}"
                ))
            })
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
        let read_only_aware = request.get_ref().read_only_aware;
        let read_only = request.get_ref().read_only;
        match self
            .participant
            .prepare(self.transaction_id(&request)?, read_only_aware, read_only)
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
        load_state: Mutex<Option<Vec<u8>>>,
    }

    impl ParticipantSidecar for MockSidecar {
        fn load(
            &self,
            request: database::LoadRequest,
        ) -> SidecarFuture<'_, database::LoadResponse> {
            self.calls.lock().unwrap().push(Call::Load(request));
            let state = self.load_state.lock().unwrap().clone();
            Box::pin(async move {
                Ok(database::LoadResponse {
                    actors: state
                        .into_iter()
                        .map(|state| database::Actor {
                            state_type: "example.Actor".into(),
                            state_ref: "actor/1".into(),
                            state: Some(state),
                        })
                        .collect(),
                    ..Default::default()
                })
            })
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
        fn recover_idempotent_mutations(
            &self,
            _: database::RecoverIdempotentMutationsRequest,
        ) -> SidecarFuture<'_, Vec<database::RecoverIdempotentMutationsResponse>> {
            Box::pin(async { Ok(Vec::new()) })
        }
    }

    #[derive(Default)]
    struct MockWatch {
        requests: Mutex<Vec<database::WatchRequest>>,
        responses: Mutex<VecDeque<Result<database::WatchResponse, Status>>>,
    }

    impl CoordinatorWatchEndpoint for MockWatch {
        fn watch(
            &self,
            request: database::WatchRequest,
        ) -> crate::legacy_coordinator::CoordinatorWatchFuture<'_, database::WatchResponse>
        {
            self.requests.lock().unwrap().push(request);
            let response = self
                .responses
                .lock()
                .unwrap()
                .pop_front()
                .expect("test must provide a Watch response");
            Box::pin(async move { response })
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

        participant.prepare(id, false, false).await.unwrap();
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
            participant
                .prepare(id, false, false)
                .await
                .unwrap_err()
                .code(),
            tonic::Code::Unavailable
        );
        // A retry is the only safe response to an ambiguous prepare failure.
        participant.prepare(id, false, false).await.unwrap();
        assert_eq!(
            participant.terminal(id, false).await.unwrap_err().code(),
            tonic::Code::Unavailable
        );
        participant.terminal(id, false).await.unwrap();
        participant.start(start(Uuid::from_u128(4))).await.unwrap();
        assert!(matches!(sidecar.calls.lock().unwrap()[4], Call::Abort(_)));
    }

    #[tokio::test]
    async fn terminal_control_is_a_noop_without_the_matching_pending_transaction() {
        let sidecar = Arc::new(MockSidecar::default());
        let participant =
            DurableActorParticipant::new(Arc::clone(&sidecar), "example.Actor", "actor/1");
        let id = Uuid::from_u128(31);

        // A recovered coordinator can abort an in-memory participant that was
        // lost before it reached the durable Prepare boundary.  Duplicate
        // commit/abort delivery is also harmless once a terminal RPC won.
        participant.terminal(id, false).await.unwrap();
        participant.terminal(id, true).await.unwrap();

        participant.start(start(Uuid::from_u128(32))).await.unwrap();
        participant.terminal(id, false).await.unwrap();
        participant.terminal(id, true).await.unwrap();

        assert!(
            sidecar
                .calls
                .lock()
                .unwrap()
                .as_slice()
                .iter()
                .all(|call| { matches!(call, Call::Load(_)) })
        );
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
            participant.prepare(child, false, false).await.unwrap(),
            PrepareOutcome::DefinitiveAbort
        ));
        // A stale terminal request for a nested ID must not affect the root
        // transaction and is acknowledged as an idempotent no-op.
        participant.terminal(child, true).await.unwrap();
        participant.prepare(root, false, false).await.unwrap();
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
    async fn root_read_only_prepare_releases_without_sidecar_transaction_or_terminal_rpc() {
        let sidecar = Arc::new(MockSidecar::default());
        let participant =
            DurableActorParticipant::new(Arc::clone(&sidecar), "example.Actor", "actor/1");
        let id = Uuid::from_u128(600);
        let mut read_only = start(id);
        read_only.mode = TransactionMode::Shared;
        read_only.read_only = true;
        participant.start(read_only).await.unwrap();
        participant
            .stage(id, PendingActorEffects::default())
            .await
            .unwrap();
        let host = DurableActorParticipantHost::new(participant.clone());
        let mut request = Request::new(database::PrepareRequest {
            transaction_id: id.as_bytes().to_vec(),
            abort_via_response: true,
            read_only_aware: true,
            read_only: true,
        });
        request
            .metadata_mut()
            .insert(STATE_REF_HEADER, "actor/1".parse().unwrap());
        database::participant_server::Participant::prepare(&host, request)
            .await
            .unwrap();
        participant
            .start(start(Uuid::from_u128(601)))
            .await
            .unwrap();
        assert!(matches!(
            sidecar.calls.lock().unwrap().as_slice(),
            [Call::Load(_), Call::Load(_)]
        ));
    }

    #[tokio::test]
    async fn read_only_root_rejects_changed_state_instead_of_silently_discarding_it() {
        let sidecar = Arc::new(MockSidecar::default());
        *sidecar.load_state.lock().unwrap() = Some(vec![1]);
        let participant =
            DurableActorParticipant::new(Arc::clone(&sidecar), "example.Actor", "actor/1");
        let id = Uuid::from_u128(602);
        let mut read_only = start(id);
        read_only.mode = TransactionMode::Shared;
        read_only.read_only = true;
        participant.start(read_only).await.unwrap();

        let error = participant
            .stage(
                id,
                PendingActorEffects {
                    state: Some(vec![2]),
                    ..Default::default()
                },
            )
            .await
            .unwrap_err();
        assert_eq!(error.code(), tonic::Code::FailedPrecondition);
        assert_eq!(
            error.message(),
            "read-only transactions cannot stage changed state, tasks, or idempotency mutations"
        );
        participant.abort(id).await.unwrap();
        assert!(matches!(
            sidecar.calls.lock().unwrap().as_slice(),
            [Call::Load(_)]
        ));
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

    fn recovered_sidecar(id: Uuid, prepared: bool) -> Arc<MockSidecar> {
        let sidecar = Arc::new(MockSidecar::default());
        sidecar
            .recover_responses
            .lock()
            .unwrap()
            .push_back(Ok(database::RecoverResponse {
                participant_transactions: vec![recovered_transaction(id, prepared)],
                ..Default::default()
            }));
        sidecar
    }

    #[tokio::test]
    async fn recovered_prepared_participant_commits_only_after_watch_commit() {
        let id = Uuid::from_u128(700);
        let sidecar = recovered_sidecar(id, true);
        let participant =
            DurableActorParticipant::new(Arc::clone(&sidecar), "example.Actor", "actor/1");
        let watch = MockWatch::default();
        watch
            .responses
            .lock()
            .unwrap()
            .push_back(Ok(database::WatchResponse { aborted: false }));

        participant
            .recover_and_watch(recovery(), &watch)
            .await
            .unwrap();

        assert!(matches!(
            sidecar.calls.lock().unwrap().as_slice(),
            [Call::Recover(_), Call::Commit(_)]
        ));
        assert_eq!(
            watch.requests.lock().unwrap().as_slice(),
            [database::WatchRequest {
                transaction_id: id.as_bytes().to_vec(),
                state_type: "example.Actor".into(),
                state_ref: "actor/1".into()
            }]
        );
    }

    #[tokio::test]
    async fn recovered_prepared_participant_aborts_after_watch_abort() {
        let id = Uuid::from_u128(701);
        let sidecar = recovered_sidecar(id, true);
        let participant =
            DurableActorParticipant::new(Arc::clone(&sidecar), "example.Actor", "actor/1");
        let watch = MockWatch::default();
        watch
            .responses
            .lock()
            .unwrap()
            .push_back(Ok(database::WatchResponse { aborted: true }));

        participant
            .recover_and_watch(recovery(), &watch)
            .await
            .unwrap();

        assert!(matches!(
            sidecar.calls.lock().unwrap().as_slice(),
            [Call::Recover(_), Call::Abort(_)]
        ));
    }

    #[tokio::test]
    async fn recovered_unprepared_participant_aborts_without_querying_watch() {
        let id = Uuid::from_u128(702);
        let sidecar = recovered_sidecar(id, false);
        let participant =
            DurableActorParticipant::new(Arc::clone(&sidecar), "example.Actor", "actor/1");
        let watch = MockWatch::default();

        participant
            .recover_and_watch(recovery(), &watch)
            .await
            .unwrap();

        assert!(matches!(
            sidecar.calls.lock().unwrap().as_slice(),
            [Call::Recover(_), Call::Abort(_)]
        ));
        assert!(watch.requests.lock().unwrap().is_empty());
    }

    #[tokio::test]
    async fn retries_internal_watch_failure_before_terminal_control() {
        let id = Uuid::from_u128(703);
        let sidecar = recovered_sidecar(id, true);
        let participant =
            DurableActorParticipant::new(Arc::clone(&sidecar), "example.Actor", "actor/1");
        let watch = MockWatch::default();
        watch.responses.lock().unwrap().extend([
            Err(Status::internal("coordinator temporarily failed")),
            Ok(database::WatchResponse { aborted: false }),
        ]);

        participant
            .recover_and_watch(recovery(), &watch)
            .await
            .unwrap();

        assert_eq!(watch.requests.lock().unwrap().len(), 2);
        assert!(matches!(
            sidecar.calls.lock().unwrap().as_slice(),
            [Call::Recover(_), Call::Commit(_)]
        ));
    }

    #[tokio::test]
    async fn missing_or_foreign_watch_membership_does_not_terminalize_recovery() {
        for status in [
            Status::unavailable("decision missing"),
            Status::failed_precondition(
                "participant is not a member of the durable commit decision",
            ),
        ] {
            let id = Uuid::new_v4();
            let sidecar = recovered_sidecar(id, true);
            let participant =
                DurableActorParticipant::new(Arc::clone(&sidecar), "example.Actor", "actor/1");
            let watch = MockWatch::default();
            // Missing is non-definitive, so follow it with foreign membership;
            // foreign membership is definitive and leaves local state intact.
            watch.responses.lock().unwrap().extend([
                Err(status),
                Err(Status::failed_precondition(
                    "participant is not a member of the durable commit decision",
                )),
            ]);
            assert_eq!(
                participant
                    .recover_and_watch(recovery(), &watch)
                    .await
                    .unwrap_err()
                    .code(),
                tonic::Code::FailedPrecondition
            );
            assert!(matches!(
                sidecar.calls.lock().unwrap().as_slice(),
                [Call::Recover(_)]
            ));
        }
    }

    #[tokio::test]
    async fn start_preserves_legacy_shared_rejection_and_upgradeable_shape_validation() {
        let sidecar = Arc::new(MockSidecar::default());
        let participant =
            DurableActorParticipant::new(Arc::clone(&sidecar), "example.Actor", "actor/1");
        let id = Uuid::from_u128(799);
        let mut shared = start(id);
        shared.mode = TransactionMode::Shared;
        assert_eq!(
            participant.start(shared.clone()).await.unwrap_err().code(),
            tonic::Code::FailedPrecondition
        );

        let mut exclusive = shared.clone();
        exclusive.mode = TransactionMode::Exclusive;
        assert_eq!(
            participant
                .start_with_mode(exclusive, ParticipantStartMode::SharedUpgradeable)
                .await
                .unwrap_err()
                .code(),
            tonic::Code::InvalidArgument
        );

        let mut factory = shared.clone();
        factory.factory = true;
        assert_eq!(
            participant
                .start_with_mode(factory, ParticipantStartMode::SharedUpgradeable)
                .await
                .unwrap_err()
                .code(),
            tonic::Code::Unimplemented
        );

        let mut nested = shared;
        nested.transaction_ids.push(Uuid::from_u128(798));
        nested.transaction_path = TransactionPathContract::PreserveNested;
        assert_eq!(
            participant
                .start_with_mode(nested, ParticipantStartMode::SharedUpgradeable)
                .await
                .unwrap_err()
                .code(),
            tonic::Code::Unimplemented
        );
        assert!(sidecar.calls.lock().unwrap().is_empty());
    }

    #[tokio::test]
    async fn shared_changed_state_promotes_and_prepares_durably() {
        let sidecar = Arc::new(MockSidecar::default());
        let participant =
            DurableActorParticipant::new(Arc::clone(&sidecar), "example.Actor", "actor/1");
        let id = Uuid::from_u128(800);
        *sidecar.load_state.lock().unwrap() = Some(vec![0]);
        let mut shared = start(id);
        shared.mode = TransactionMode::Shared;
        let started = participant
            .start_local(shared, ParticipantStartMode::SharedUpgradeable)
            .await
            .unwrap();
        // `stage` returns only after the shared lease's atomic upgrade has
        // completed; before this await no promotion proof exists to hand off.
        let promotion = started
            .stage(PendingActorEffects {
                state: Some(vec![1]),
                ..Default::default()
            })
            .await
            .unwrap()
            .expect("changed shared state must produce a promotion proof");
        assert!(promotion.matches(id, "example.Actor", "actor/1"));
        assert!(!promotion.matches(Uuid::from_u128(999), "example.Actor", "actor/1"));
        participant.prepare(id, false, false).await.unwrap();
        participant.terminal(id, true).await.unwrap();
        assert!(matches!(
            sidecar.calls.lock().unwrap().as_slice(),
            [Call::Load(_), Call::Prepare(_), Call::Commit(_)]
        ));
    }

    #[tokio::test]
    async fn shared_unchanged_releases_at_read_only_prepare_and_rejects_effects() {
        let sidecar = Arc::new(MockSidecar::default());
        let participant =
            DurableActorParticipant::new(Arc::clone(&sidecar), "example.Actor", "actor/1");
        let id = Uuid::from_u128(801);
        let mut shared = start(id);
        shared.mode = TransactionMode::Shared;
        participant
            .start_with_mode(shared, ParticipantStartMode::SharedUpgradeable)
            .await
            .unwrap();
        assert_eq!(
            participant
                .stage(
                    id,
                    PendingActorEffects {
                        task_upserts: vec![database::Task::default()],
                        ..Default::default()
                    }
                )
                .await
                .unwrap_err()
                .code(),
            tonic::Code::FailedPrecondition
        );
        assert!(
            participant
                .stage(id, PendingActorEffects::default())
                .await
                .unwrap()
                .is_none()
        );
        participant.prepare(id, true, true).await.unwrap();
        participant
            .start(start(Uuid::from_u128(802)))
            .await
            .unwrap();
        assert!(matches!(
            sidecar.calls.lock().unwrap().as_slice(),
            [Call::Load(_), Call::Load(_)]
        ));
    }

    #[tokio::test]
    async fn shared_absent_or_cleared_state_stays_read_only() {
        for (id, loaded, final_state) in [
            (Uuid::from_u128(803), None, Some(vec![7])),
            (Uuid::from_u128(804), Some(vec![7]), None),
        ] {
            let sidecar = Arc::new(MockSidecar::default());
            *sidecar.load_state.lock().unwrap() = loaded;
            let participant =
                DurableActorParticipant::new(Arc::clone(&sidecar), "example.Actor", "actor/1");
            let mut shared = start(id);
            shared.mode = TransactionMode::Shared;
            participant
                .start_with_mode(shared, ParticipantStartMode::SharedUpgradeable)
                .await
                .unwrap();
            assert!(
                participant
                    .stage(
                        id,
                        PendingActorEffects {
                            state: final_state,
                            ..Default::default()
                        }
                    )
                    .await
                    .unwrap()
                    .is_none()
            );
            participant.prepare(id, true, true).await.unwrap();
            assert!(matches!(
                sidecar.calls.lock().unwrap().as_slice(),
                [Call::Load(_)]
            ));
        }
    }

    #[tokio::test]
    async fn stale_local_drop_cannot_release_same_uuid_readmission() {
        let sidecar = Arc::new(MockSidecar::default());
        let participant =
            DurableActorParticipant::new(Arc::clone(&sidecar), "example.Actor", "actor/1");
        let id = Uuid::from_u128(805);
        let first = participant
            .start_local(start(id), ParticipantStartMode::Exclusive)
            .await
            .unwrap();
        participant.abort(id).await.unwrap();
        drop(first); // Queue cleanup, but do not let it run before readmission.
        let second = participant
            .start_local(start(id), ParticipantStartMode::Exclusive)
            .await
            .unwrap();
        tokio::task::yield_now().await;
        assert_eq!(
            participant
                .pending
                .lock()
                .await
                .as_ref()
                .unwrap()
                .local_owner,
            Some(second.local_owner)
        );
        assert!(
            tokio::time::timeout(
                std::time::Duration::from_millis(10),
                participant.start(start(Uuid::from_u128(807)))
            )
            .await
            .is_err()
        );
        drop(second);
        tokio::time::timeout(
            std::time::Duration::from_secs(1),
            participant.start(start(Uuid::from_u128(808))),
        )
        .await
        .unwrap()
        .unwrap();
        assert!(matches!(
            sidecar.calls.lock().unwrap().as_slice(),
            [Call::Load(_), Call::Abort(_), Call::Load(_), Call::Load(_)]
        ));
    }

    #[tokio::test]
    async fn dropped_local_guard_releases_undurable_pending_without_terminal_rpc() {
        let sidecar = Arc::new(MockSidecar::default());
        let participant =
            DurableActorParticipant::new(Arc::clone(&sidecar), "example.Actor", "actor/1");
        let id = Uuid::from_u128(805);
        let started = participant
            .start_local(start(id), ParticipantStartMode::Exclusive)
            .await
            .unwrap();
        drop(started);
        tokio::task::yield_now().await;
        participant
            .start(start(Uuid::from_u128(806)))
            .await
            .unwrap();
        assert!(matches!(
            sidecar.calls.lock().unwrap().as_slice(),
            [Call::Load(_), Call::Load(_)]
        ));
    }

    #[tokio::test]
    async fn dropped_local_guard_keeps_durable_prepared_participant_owned() {
        let sidecar = Arc::new(MockSidecar::default());
        let participant =
            DurableActorParticipant::new(Arc::clone(&sidecar), "example.Actor", "actor/1");
        let id = Uuid::from_u128(806);
        let started = participant
            .start_local(start(id), ParticipantStartMode::Exclusive)
            .await
            .unwrap();
        participant.prepare(id, false, false).await.unwrap();
        drop(started);
        tokio::task::yield_now().await;
        assert!(participant.pending.lock().await.is_some());
        assert!(matches!(
            sidecar.calls.lock().unwrap().as_slice(),
            [Call::Load(_), Call::Prepare(_)]
        ));
    }
}
