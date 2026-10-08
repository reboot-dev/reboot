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
    /// Early native visibility is opt-in; older/test boundaries fail closed.
    fn store(
        &self,
        _request: database::StoreRequest,
    ) -> SidecarFuture<'_, database::StoreResponse> {
        Box::pin(async {
            Err(Status::unimplemented(
                "early transactional Store unsupported",
            ))
        })
    }
    fn colocated_range(
        &self,
        _request: database::ColocatedRangeRequest,
    ) -> SidecarFuture<'_, database::ColocatedRangeResponse> {
        Box::pin(async { Err(Status::unimplemented("transactional range unsupported")) })
    }
    fn colocated_reverse_range(
        &self,
        _request: database::ColocatedReverseRangeRequest,
    ) -> SidecarFuture<'_, database::ColocatedReverseRangeResponse> {
        Box::pin(async {
            Err(Status::unimplemented(
                "transactional reverse range unsupported",
            ))
        })
    }
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

    fn store(&self, request: database::StoreRequest) -> SidecarFuture<'_, database::StoreResponse> {
        Box::pin(async move {
            self.client
                .lock()
                .await
                .store(request)
                .await
                .map(Response::into_inner)
        })
    }
    fn colocated_range(
        &self,
        request: database::ColocatedRangeRequest,
    ) -> SidecarFuture<'_, database::ColocatedRangeResponse> {
        Box::pin(async move {
            self.client
                .lock()
                .await
                .colocated_range(request)
                .await
                .map(Response::into_inner)
        })
    }
    fn colocated_reverse_range(
        &self,
        request: database::ColocatedReverseRangeRequest,
    ) -> SidecarFuture<'_, database::ColocatedReverseRangeResponse> {
        Box::pin(async move {
            self.client
                .lock()
                .await
                .colocated_reverse_range(request)
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
            // Park the actual Database Commit, not coordinator fan-out or a
            // task scan. Remote Watch recovery may terminalize independently.
            #[cfg(feature = "test-support")]
            let commit_probe = test_support::park_database_commit(&request).await?;
            #[cfg(feature = "test-support")]
            if let Some(marker) = std::env::var_os("REBOOT_TEST_LOST_PARTICIPANT_COMMIT_ACK") {
                use std::io::Write;
                let mut log = std::fs::OpenOptions::new()
                    .create(true)
                    .append(true)
                    .open(std::path::PathBuf::from(marker).with_extension("attempts"))
                    .unwrap();
                writeln!(log, "actual Commit attempt").unwrap();
            }
            let response = self
                .client
                .lock()
                .await
                .transaction_participant_commit(request)
                .await?
                .into_inner();
            #[cfg(feature = "test-support")]
            if let Some((marker, request_bytes)) = commit_probe {
                std::fs::write(marker.with_extension("ack"), request_bytes)
                    .map_err(|error| Status::internal(error.to_string()))?;
            }
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
                if let Some(release) = std::env::var_os("REBOOT_TEST_REMOTE_COMMIT_ACK_RELEASE") {
                    let release = std::path::PathBuf::from(release);
                    tokio::time::timeout(std::time::Duration::from_secs(3), async {
                        while !release.exists() {
                            tokio::time::sleep(std::time::Duration::from_millis(5)).await;
                        }
                    })
                    .await
                    .map_err(|_| Status::internal("remote Commit ACK hold not released"))?;
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

// In-memory only: crash before Prepare never resumes a nested call.
struct ReusableCalls {
    root_owner: Uuid,
    watch_claimed: bool,
    admitting: bool,
    snapshot: PendingActorEffects,
    snapshot_staged: bool,
    snapshot_disposition: PendingDisposition,
    call_staged: bool,
    completed: std::collections::BTreeMap<Uuid, bool>,
}

struct Pending {
    reusable: Option<ReusableCalls>,
    execution_active: bool,
    terminal_attempted: bool,
    no_terminal_retry: bool,
    local_owner: Option<Uuid>,
    root_id: Uuid,
    transaction_ids: Vec<Uuid>,
    coordinator_state_type: String,
    coordinator_state_ref: String,
    effects: PendingActorEffects,
    loaded_state: Option<Vec<u8>>,
    staged: bool,
    prepared: bool,
    // Set BEFORE an early Store is sent. Cancellation/error retains ownership.
    native_started: bool,
    native_uncertain: bool,
    factory: bool,
    disposition: PendingDisposition,
    // Kept until a terminal sidecar response is acknowledged.
    lock: PendingLock,
}

impl Pending {
    fn matches_live_owner(&self, owner: Uuid) -> bool {
        self.reusable
            .as_ref()
            .map_or(self.local_owner == Some(owner), |calls| {
                calls.root_owner == owner
            })
    }
}

/// Cancellation-safe lifetime for local handler execution. Dropping it before
/// durable Prepare removes only in-memory ownership; it never sends a terminal
/// sidecar RPC. Once Prepare succeeds, normal ambiguous durable semantics win.
pub struct StartedLocalTransaction<C: ParticipantSidecar> {
    participant: DurableActorParticipant<C>,
    transaction_id: Uuid,
    state: Option<Vec<u8>>,
    local_owner: Uuid,
    admitted_explicit_root_scope: bool,
    armed: bool,
    cancellation_authority: bool,
    handed_off: bool,
}

impl<C: ParticipantSidecar> StartedLocalTransaction<C> {
    pub(crate) fn actor_state_type(&self) -> &str {
        &self.participant.state_type
    }

    pub(crate) fn actor_state_ref(&self) -> &str {
        &self.participant.state_ref
    }

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
        self.participant
            .stage_owned(self.transaction_id, effects, Some(self.local_owner), None)
            .await
    }

    #[cfg(test)]
    async fn stage_mock_validated(
        &self,
        effects: PendingActorEffects,
    ) -> Result<Option<SharedPromotion>, Status> {
        let receipt = ValidatedTaskBatch {
            root: self.transaction_id,
            owner: self.local_owner,
            tasks: effects.task_upserts.clone(),
            running: None,
        };
        self.participant
            .stage_owned(
                self.transaction_id,
                effects,
                Some(self.local_owner),
                Some(receipt),
            )
            .await
    }

    pub(crate) async fn stage_validated_tasks(
        &self,
        effects: PendingActorEffects,
        tasks: &crate::one_shot_tasks::OneShotTasks,
        context: &crate::runtime::TransactionContext,
    ) -> Result<Option<SharedPromotion>, Status> {
        tasks.validate_guard_execution(self, context).await?;
        let all = self.retained_tasks(&effects.task_upserts).await?;
        let running = tasks.validate_staged_admission(&all).await?;
        tasks.validate_guard_execution(self, context).await?;
        let receipt = ValidatedTaskBatch {
            root: self.transaction_id,
            owner: self.local_owner,
            tasks: effects.task_upserts.clone(),
            running: Some(running),
        };
        self.participant
            .stage_owned(
                self.transaction_id,
                effects,
                Some(self.local_owner),
                Some(receipt),
            )
            .await
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

    /// Checks the exact live incarnation and seals off speculative Drop release
    /// before an explicit root Abort decision RPC can become ambiguous.
    pub(crate) async fn begin_explicit_root_abort(
        &mut self,
        context: &crate::runtime::TransactionContext,
    ) -> Result<Vec<crate::durable_coordinator::ReturnedParticipant>, Status> {
        self.begin_root_abort(context, false).await
    }

    pub(crate) async fn begin_registered_abandonment(
        &mut self,
        context: &crate::runtime::TransactionContext,
    ) -> Result<Vec<crate::durable_coordinator::ReturnedParticipant>, Status> {
        self.begin_root_abort(context, true).await
    }

    async fn begin_root_abort(
        &mut self,
        context: &crate::runtime::TransactionContext,
        abandonment: bool,
    ) -> Result<Vec<crate::durable_coordinator::ReturnedParticipant>, Status> {
        let pending = self.participant.pending.lock().await;
        if !context.is_fresh_root()
            || !self.admitted_explicit_root_scope
            || self.participant.state_type != context.transaction_coordinator_state_type()
            || self.participant.state_ref != context.transaction_coordinator_state_ref()
            || !(self.armed || self.cancellation_authority)
            || !pending.as_ref().is_some_and(|current| {
                current.root_id == context.transaction_root_id()
                    && current.root_id == self.transaction_id
                    && current.local_owner == Some(self.local_owner)
                    && current.transaction_ids.len() == 1
                    && !current.prepared
                    && current.coordinator_state_type
                        == context.transaction_coordinator_state_type()
                    && current.coordinator_state_ref == context.transaction_coordinator_state_ref()
                    && self.participant.state_ref == context.headers().state_ref
            })
        {
            return Err(Status::failed_precondition(
                "explicit root abort requires live pre-handoff ownership",
            ));
        }
        // Seal atomically while the exact local authority is still locked.
        // Even rejected active-outbound uncertainty must not release local
        // ownership through Drop once explicit cleanup has begun.
        self.armed = false;
        self.cancellation_authority = false;
        let returned = if abandonment {
            context.returned_participants_snapshot()
        } else {
            context.seal_explicit_abort()?
        };
        Ok(returned)
    }

    /// Private cancellation capability: validate the admitted incarnation before
    /// handler effects, then park speculative Drop. This is not durable handoff
    /// authority and cannot be reconstructed from headers or rearmed later.
    pub(crate) async fn reserve_handler_cancellation(
        &mut self,
        context: &crate::runtime::TransactionContext,
    ) -> Result<(), Status> {
        self.reserve_cancellation(context, false).await
    }

    pub(crate) async fn reserve_registered_execution(
        &mut self,
        context: &crate::runtime::TransactionContext,
    ) -> Result<(), Status> {
        self.reserve_cancellation(context, true).await
    }

    async fn reserve_cancellation(
        &mut self,
        context: &crate::runtime::TransactionContext,
        execution: bool,
    ) -> Result<(), Status> {
        let mut pending = self.participant.pending.lock().await;
        if !self.armed
            || !context.is_fresh_root()
            || !self.admitted_explicit_root_scope
            || self.participant.state_type != context.transaction_coordinator_state_type()
            || self.participant.state_ref != context.transaction_coordinator_state_ref()
            || self.participant.state_ref != context.headers().state_ref
            || !pending.as_ref().is_some_and(|current| {
                current.root_id == self.transaction_id
                    && current.root_id == context.transaction_root_id()
                    && current.local_owner == Some(self.local_owner)
                    && current.transaction_ids.len() == 1
                    && !current.prepared
                    && current.coordinator_state_type
                        == context.transaction_coordinator_state_type()
                    && current.coordinator_state_ref == context.transaction_coordinator_state_ref()
            })
        {
            return Err(Status::failed_precondition(
                "handler cancellation requires live fresh root ownership",
            ));
        }
        // One lock transition: there is no disarmed capability awaiting a
        // second mutex acquisition before its execution barrier/guard exists.
        if execution {
            let current = pending.as_mut().unwrap();
            current.execution_active = true;
            current.no_terminal_retry = true;
        }
        self.armed = false;
        self.cancellation_authority = true;
        Ok(())
    }

    pub(crate) fn cancellation_eligible(
        &self,
        context: &crate::runtime::TransactionContext,
    ) -> bool {
        self.admitted_explicit_root_scope
            && context.is_fresh_root()
            && context.mode() == TransactionMode::Exclusive
            && context.transaction_ids().len() == 1
            && context.headers().idempotency_key.is_none()
    }

    pub(crate) async fn abort_legacy(&mut self) -> Result<(), Status> {
        self.handoff_to_durable_recovery();
        self.participant
            .terminal_owned(self.transaction_id, false, Some(self.local_owner))
            .await
    }

    #[cfg(feature = "test-support")]
    pub(crate) async fn assert_staged_for_test(&self) -> Result<(), Status> {
        let pending = self.participant.pending.lock().await;
        if !pending.as_ref().is_some_and(|current| {
            current.root_id == self.transaction_id
                && current.local_owner == Some(self.local_owner)
                && current.staged
        }) {
            return Err(Status::internal(
                "live response hook must follow actual staging",
            ));
        }
        Ok(())
    }

    pub(crate) async fn reserve_live_execution(
        &mut self,
        context: &crate::runtime::TransactionContext,
    ) -> Result<LiveExecution<C>, Status> {
        let mut pending = self.participant.pending.lock().await;
        let current = pending
            .as_mut()
            .ok_or_else(|| Status::failed_precondition("live participant missing"))?;
        if current.local_owner != Some(self.local_owner)
            || current.transaction_ids != context.transaction_ids()
            || current.coordinator_state_type != context.transaction_coordinator_state_type()
            || current.coordinator_state_ref != context.transaction_coordinator_state_ref()
            || self.participant.state_ref != context.headers().state_ref
            || current.disposition == PendingDisposition::ReadOnly
            || current.root_id != self.transaction_id
            || current.prepared
            || (current.execution_active
                && !current
                    .reusable
                    .as_ref()
                    .is_some_and(|calls| calls.admitting))
            || current.terminal_attempted
        {
            return Err(Status::failed_precondition(
                "live participant incarnation unavailable",
            ));
        }
        current.execution_active = true;
        current.no_terminal_retry = true;
        self.armed = false;
        let (owner, watch_new) = if let Some(calls) = current.reusable.as_mut() {
            let new = !calls.watch_claimed;
            calls.watch_claimed = true;
            calls.admitting = false;
            (calls.root_owner, new)
        } else {
            (self.local_owner, true)
        };
        Ok(LiveExecution {
            participant: self.participant.clone(),
            root: self.transaction_id,
            owner,
            call_owner: self.local_owner,
            watch_new,
        })
    }

    /// Scheduling authority remains tied to this admitted incarnation and lease.
    pub(crate) async fn validate_task_execution(
        &self,
        context: &crate::runtime::TransactionContext,
        store: &crate::runtime::DatabaseActorStore,
        state_type: &str,
        state_ref: &str,
    ) -> Result<(), Status> {
        self.participant
            .validate_task_owner(store, state_type, state_ref)?;
        let pending = self.participant.pending.lock().await;
        if self.handed_off
            || context.mode() != TransactionMode::Exclusive
            || context.headers().idempotency_key.is_some()
            || !pending.as_ref().is_some_and(|current| {
                current.root_id == self.transaction_id
                    && current.local_owner == Some(self.local_owner)
                    && current.transaction_ids == context.transaction_ids()
                    && current.coordinator_state_type
                        == context.transaction_coordinator_state_type()
                    && current.coordinator_state_ref == context.transaction_coordinator_state_ref()
                    && current.execution_active
                    && current.disposition == PendingDisposition::Commit
                    && !current.prepared
                    && !current.terminal_attempted
            })
        {
            return Err(Status::failed_precondition(
                "tasks require live exclusive execution incarnation",
            ));
        }
        Ok(())
    }

    /// Roll back a first-touch leaf while retaining observation isolation.
    /// The pending mutex covers validation, effect discard and atomic downgrade;
    /// execution remains active until the reserved Watch owner takes over.
    pub(crate) async fn rollback_declared_leaf(
        &self,
        context: &crate::runtime::TransactionContext,
    ) -> Result<(), Status> {
        let mut pending = self.participant.pending.lock().await;
        if self.handed_off
            || context.mode() != TransactionMode::Exclusive
            || !context.supports_rollback_leaf_path()
            || context.headers().idempotency_key.is_some()
            || !context.headers().coordinator_read_only_aware
            || context.doomed_status().is_some()
            || (self.participant.state_type == context.transaction_coordinator_state_type()
                && self.participant.state_ref == context.transaction_coordinator_state_ref())
            || !pending.as_ref().is_some_and(|current| {
                current.root_id == self.transaction_id
                    && current.root_id == context.transaction_root_id()
                    && current.local_owner == Some(self.local_owner)
                    && current.transaction_ids == context.transaction_ids()
                    && current.coordinator_state_type
                        == context.transaction_coordinator_state_type()
                    && current.coordinator_state_ref == context.transaction_coordinator_state_ref()
                    && self.participant.state_ref == context.headers().state_ref
                    && current.loaded_state.is_some()
                    && current.execution_active
                    && current.no_terminal_retry
                    && !current.prepared
                    && !current.terminal_attempted
                    && !current.staged
                    && current.disposition == PendingDisposition::Commit
                    && !current.lock.is_shared()
            })
        {
            return Err(Status::failed_precondition(
                "rollback requires exact first-touch live leaf",
            ));
        }
        let mut current = pending.take().unwrap();
        let PendingLock::Exclusive(lease) = current.lock else {
            unreachable!()
        };
        current.lock = PendingLock::Shared(lease.downgrade());
        current.effects = PendingActorEffects::default();
        current.disposition = PendingDisposition::ReadOnly;
        *pending = Some(current);
        Ok(())
    }

    pub(crate) async fn retained_tasks(
        &self,
        tasks: &[database::Task],
    ) -> Result<Vec<database::Task>, Status> {
        let pending = self.participant.pending.lock().await;
        let current = pending
            .as_ref()
            .ok_or_else(|| Status::failed_precondition("participant missing"))?;
        if current.root_id != self.transaction_id
            || current.local_owner != Some(self.local_owner)
            || !current.execution_active
        {
            return Err(Status::failed_precondition("task call incarnation differs"));
        }
        let mut all = if current.reusable.is_some() {
            current.effects.task_upserts.clone()
        } else {
            Vec::new()
        };
        all.extend_from_slice(tasks);
        Ok(all)
    }

    pub(crate) async fn relinquish_call(
        &self,
        context: &crate::runtime::TransactionContext,
        aborted: bool,
    ) -> Result<(), Status> {
        if context.transaction_ids().len() != 2
            || context.transaction_root_id() != self.transaction_id
            || context.doomed_status().is_some()
            || !context.reusable_participants()
        {
            return Err(Status::failed_precondition(
                "relinquishment requires exact supported call",
            ));
        }
        self.participant
            .relinquish(
                context.transaction_root_id(),
                context.transaction_ids()[1],
                aborted,
                Some(self.local_owner),
            )
            .await
    }

    pub(crate) async fn end_execution(&self) -> Result<(), Status> {
        let mut pending = self.participant.pending.lock().await;
        let current = pending
            .as_mut()
            .ok_or_else(|| Status::failed_precondition("execution ownership missing"))?;
        if current.root_id != self.transaction_id || current.local_owner != Some(self.local_owner) {
            return Err(Status::failed_precondition("execution incarnation differs"));
        }
        current.execution_active = false;
        self.participant.changed.notify_waiters();
        Ok(())
    }

    pub(crate) fn was_handed_off(&self) -> bool {
        self.handed_off
    }

    pub(crate) fn database_endpoint(&self) -> Option<&str> {
        self.participant.sidecar.database_endpoint()
    }

    pub(crate) async fn acknowledge_explicit_root_abort(&self) -> Result<(), Status> {
        self.participant
            .terminal_owned(self.transaction_id, false, Some(self.local_owner))
            .await
    }

    /// Relinquishes pre-durable Drop cleanup before the first coordinator RPC
    /// can persist a record. The generated scheduling path simultaneously arms
    /// its host-owned uncertainty guard: errors/cancellation require supervised
    /// restart rather than speculative participant release or Abort.
    pub fn handoff_to_durable_recovery(&mut self) {
        self.handed_off = true;
        self.cancellation_authority = false;
        self.armed = false;
    }

    /// Marks that a durable Prepare boundary has been crossed. A future
    /// coordinator integration must call this only after Prepare succeeds.
    pub fn disarm_after_durable_prepare(&mut self) {
        self.handed_off = true;
        self.cancellation_authority = false;
        self.armed = false;
    }
}

struct ValidatedTaskBatch {
    root: Uuid,
    owner: Uuid,
    tasks: Vec<database::Task>,
    running: Option<crate::one_shot_tasks::RunningTaskAdmission>,
}

pub(crate) struct LiveExecution<C: ParticipantSidecar> {
    participant: DurableActorParticipant<C>,
    root: Uuid,
    owner: Uuid,
    call_owner: Uuid,
    watch_new: bool,
}
impl<C: ParticipantSidecar> LiveExecution<C> {
    pub(crate) async fn watch(
        self,
        watch: Arc<dyn CoordinatorWatchEndpoint>,
    ) -> Result<(), Status> {
        let participant = &self.participant;
        #[cfg(feature = "test-support")]
        if let Some(path) = std::env::var_os("REBOOT_TEST_LIVE_INBOUND_RESPONSE") {
            assert!(
                std::path::PathBuf::from(path)
                    .with_extension("future-dropped")
                    .exists(),
                "actual staging/response future must drop before live Watch activation"
            );
        }
        {
            let mut pending = participant.pending.lock().await;
            let Some(current) = pending.as_mut() else {
                return Ok(());
            };
            if current.root_id != self.root || !current.matches_live_owner(self.owner) {
                return Ok(());
            }
            // Old N1 transfer/drop must never end N2's handler execution.
            if current.local_owner == Some(self.call_owner) {
                current.execution_active = false;
                participant.changed.notify_waiters();
            }
        }
        if !self.watch_new {
            return Ok(());
        }
        #[cfg(feature = "test-support")]
        if let Some(path) = std::env::var_os("REBOOT_TEST_LIVE_WATCH_BEFORE_LOOKUP") {
            let path = std::path::PathBuf::from(path);
            std::fs::write(&path, b"live execution ended; Watch lookup parked")
                .map_err(|error| Status::internal(error.to_string()))?;
            tokio::time::timeout(std::time::Duration::from_secs(15), async {
                while !path.with_extension("release").exists() {
                    tokio::time::sleep(std::time::Duration::from_millis(5)).await;
                }
            })
            .await
            .map_err(|_| Status::deadline_exceeded("Watch lookup park not released"))?;
        }
        let mut backoff = std::time::Duration::from_millis(10);
        loop {
            let notified = participant.changed.notified();
            tokio::pin!(notified);
            notified.as_mut().enable();
            {
                let pending = participant.pending.lock().await;
                let Some(current) = pending.as_ref().filter(|current| {
                    current.root_id == self.root && current.matches_live_owner(self.owner)
                }) else {
                    return Ok(());
                };
                // A coordinator control RPC can win terminal delivery before
                // self-Watch. Once its ACK is uncertain, routing/Watch failures
                // must not hide the retained actor-only terminal attempt. The
                // pending mutex excludes an in-progress terminal RPC here.
                if current.terminal_attempted {
                    #[cfg(feature = "test-support")]
                    if let Some(path) =
                        std::env::var_os("REBOOT_TEST_LIVE_WATCH_TERMINAL_UNCERTAINTY")
                    {
                        std::fs::write(
                            path,
                            b"live owner observed retained terminal attempt; no retry",
                        )
                        .map_err(|error| Status::internal(error.to_string()))?;
                    }
                    return Err(Status::unavailable(
                        "terminal ACK uncertain; ownership retained, no retry",
                    ));
                }
            }
            let response = tokio::select! {
                _ = &mut notified => continue,
                response = watch.watch(database::WatchRequest { transaction_id: self.root.as_bytes().to_vec(),
                    state_type: participant.state_type.clone(), state_ref: participant.state_ref.clone() }) => response,
            };
            match response {
                Ok(response) => {
                    let acknowledged = participant
                        .terminal_live(self.root, self.owner, !response.aborted)
                        .await?;
                    #[cfg(feature = "test-support")]
                    if acknowledged {
                        test_support::signal_watch_terminalized()?;
                    }
                    #[cfg(not(feature = "test-support"))]
                    let _ = acknowledged;
                    return Ok(());
                }
                Err(error) if terminal_watch_failure(&error) => return Err(error),
                Err(_) => {
                    tokio::select! { _ = &mut notified => {}, _ = tokio::time::sleep(backoff) => {} }
                    backoff = (backoff * 2).min(std::time::Duration::from_secs(1));
                }
            }
        }
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
            let participant = self.participant.clone();
            let root = self.transaction_id;
            let owner = self.local_owner;
            tokio::spawn(async move {
                let mut pending = participant.pending.lock().await;
                if let Some(current) = pending
                    .as_mut()
                    .filter(|p| p.root_id == root && p.local_owner == Some(owner))
                    && current
                        .reusable
                        .as_ref()
                        .is_some_and(|calls| calls.admitting)
                {
                    let calls = current.reusable.as_mut().unwrap();
                    current.effects = calls.snapshot.clone();
                    current.staged = calls.snapshot_staged;
                    current.disposition = calls.snapshot_disposition;
                    calls.admitting = false;
                    calls.call_staged = false;
                    current.transaction_ids.truncate(1);
                    current.execution_active = false;
                    participant.changed.notify_waiters();
                }
            });
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

include!("sorted_map_participant.rs");

/// Only actor-local conflicts are definitive Prepare outcomes. A sidecar RPC
/// failure stays an error because the request may have reached durable storage.
#[derive(Debug)]
enum PrepareOutcome {
    Prepared,
    DefinitiveAbort,
}

/// Actor-local durable transaction participant. Clones address the same actor
/// and pending transaction.
type AdmissionRoots = Arc<std::sync::Mutex<std::collections::HashMap<Uuid, (usize, bool)>>>;

// Reservation precedes both the asynchronous pending mutex and the actor gate.
// Drop removes only this root's reservation; unrelated roots retain normal gate ordering.
struct AdmissionReservation {
    roots: AdmissionRoots,
    root: Uuid,
}
impl Drop for AdmissionReservation {
    fn drop(&mut self) {
        let mut roots = self.roots.lock().unwrap();
        let entry = roots.get_mut(&self.root).unwrap();
        entry.0 -= 1;
        if entry.0 == 0 {
            roots.remove(&self.root);
        }
    }
}

pub struct DurableActorParticipant<C: ParticipantSidecar> {
    sidecar: Arc<C>,
    state_type: String,
    state_ref: String,
    lock: ActorGate,
    admissions: AdmissionRoots,
    pending: Arc<tokio::sync::Mutex<Option<Pending>>>,
    changed: Arc<tokio::sync::Notify>,
}

impl<C: ParticipantSidecar> Clone for DurableActorParticipant<C> {
    fn clone(&self) -> Self {
        Self {
            sidecar: Arc::clone(&self.sidecar),
            state_type: self.state_type.clone(),
            state_ref: self.state_ref.clone(),
            lock: self.lock.clone(),
            admissions: self.admissions.clone(),
            pending: Arc::clone(&self.pending),
            changed: self.changed.clone(),
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
            admissions: Arc::new(std::sync::Mutex::new(std::collections::HashMap::new())),
            pending: Arc::new(tokio::sync::Mutex::new(None)),
            changed: Arc::new(tokio::sync::Notify::new()),
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
            || !store.owns_actor_gate(&self.lock, state_type, state_ref)
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

    #[doc(hidden)]
    pub fn actor_target(&self) -> crate::durable_coordinator::ParticipantTarget {
        crate::durable_coordinator::ParticipantTarget {
            state_type: self.state_type.clone(),
            state_ref: self.state_ref.clone(),
        }
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
        let _admission = self.reserve_admission(start.transaction_ids[0], false)?;
        {
            let pending = self.pending.lock().await;
            if pending
                .as_ref()
                .is_some_and(|p| p.root_id == start.transaction_ids[0] && p.reusable.is_some())
            {
                return Err(Status::failed_precondition(
                    "same-root retained reusable participant requires reusable admission",
                ));
            }
        }
        self.start_owned_reserved(start, mode, local_owner, false)
            .await
    }

    fn reserve_admission(
        &self,
        root: Uuid,
        reusable: bool,
    ) -> Result<AdmissionReservation, Status> {
        let mut roots = self.admissions.lock().unwrap();
        if roots
            .get(&root)
            .is_some_and(|(_, existing)| reusable || *existing)
        {
            return Err(Status::failed_precondition(
                "same-root reusable admission already in progress",
            ));
        }
        let entry = roots.entry(root).or_insert((0, reusable));
        entry.0 += 1;
        Ok(AdmissionReservation {
            roots: self.admissions.clone(),
            root,
        })
    }

    async fn start_owned_reserved(
        &self,
        start: ActorTransactionStart,
        mode: ParticipantStartMode,
        local_owner: Option<Uuid>,
        reusable: bool,
    ) -> Result<Option<Vec<u8>>, Status> {
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
        #[cfg(feature = "test-support")]
        if let Some(path) = std::env::var_os("REBOOT_TEST_REGISTERED_LOAD_PENDING") {
            struct LoadDrop(std::path::PathBuf);
            impl Drop for LoadDrop {
                fn drop(&mut self) {
                    std::fs::write(
                        self.0.with_extension("future-dropped"),
                        b"actual start_owned Load future dropped before Pending",
                    )
                    .unwrap();
                }
            }
            let path = std::path::PathBuf::from(path);
            std::fs::write(&path, b"real Load ACK; local admission not completed").unwrap();
            let _drop = LoadDrop(path.clone());
            while !path.with_extension("release").exists() {
                tokio::time::sleep(std::time::Duration::from_millis(10)).await;
            }
        }
        let state = response
            .actors
            .into_iter()
            .next()
            .and_then(|actor| actor.state);
        if reusable && state.is_none() {
            return Err(Status::failed_precondition(
                "reusable leaf requires existing actor",
            ));
        }
        *pending = Some(Pending {
            reusable: reusable.then(|| ReusableCalls {
                root_owner: local_owner.expect("reusable admission owns an incarnation"),
                watch_claimed: false,
                admitting: true,
                snapshot: PendingActorEffects::default(),
                snapshot_staged: false,
                snapshot_disposition: PendingDisposition::Commit,
                call_staged: false,
                completed: std::collections::BTreeMap::new(),
            }),
            execution_active: reusable,
            terminal_attempted: false,
            no_terminal_retry: false,
            local_owner,
            root_id: start.transaction_ids[0],
            transaction_ids: start.transaction_ids,
            coordinator_state_type: start.coordinator_state_type,
            coordinator_state_ref: start.coordinator_state_ref,
            effects: PendingActorEffects::default(),
            loaded_state: state.clone(),
            staged: false,
            prepared: false,
            native_started: false,
            native_uncertain: false,
            factory: start.factory,
            disposition: if start.read_only {
                PendingDisposition::ReadOnly
            } else {
                PendingDisposition::Commit
            },
            lock,
        });
        Ok(state)
    }

    async fn relinquish(
        &self,
        root: Uuid,
        nested: Uuid,
        aborted: bool,
        owner: Option<Uuid>,
    ) -> Result<(), Status> {
        if root == nested || root.is_nil() || nested.is_nil() {
            return Err(Status::invalid_argument(
                "relinquishment requires non-root nested UUID",
            ));
        }
        let mut pending = self.pending.lock().await;
        let current = pending
            .as_mut()
            .filter(|p| p.root_id == root)
            .ok_or_else(|| Status::failed_precondition("relinquishment root missing"))?;
        let calls = current
            .reusable
            .as_mut()
            .ok_or_else(|| Status::failed_precondition("reusable policy not admitted"))?;
        if let Some(previous) = calls.completed.get(&nested) {
            return if *previous == aborted {
                Ok(())
            } else {
                Err(Status::failed_precondition(
                    "conflicting relinquishment replay",
                ))
            };
        }
        if current.prepared
            || current.terminal_attempted
            || current.transaction_ids != [root, nested]
            || owner.is_some_and(|token| current.local_owner != Some(token))
            || (owner.is_none() && current.execution_active)
        {
            return Err(Status::failed_precondition(
                "relinquishment call is active, stale or sealed",
            ));
        }
        if aborted {
            current.effects = calls.snapshot.clone();
            current.staged = calls.snapshot_staged;
            current.disposition = calls.snapshot_disposition;
            if !current.staged {
                current.disposition = PendingDisposition::ReadOnly;
                // Retain first-touch observation isolation, as legacy rollback does.
                let old = pending.take().unwrap();
                let PendingLock::Exclusive(lease) = old.lock else {
                    unreachable!()
                };
                let mut old = Pending {
                    lock: PendingLock::Shared(lease.downgrade()),
                    ..old
                };
                old.execution_active = false;
                old.transaction_ids.truncate(1);
                old.reusable
                    .as_mut()
                    .unwrap()
                    .completed
                    .insert(nested, aborted);
                *pending = Some(old);
                self.changed.notify_waiters();
                return Ok(());
            }
        }
        current.execution_active = false;
        current.transaction_ids.truncate(1);
        calls.completed.insert(nested, aborted);
        self.changed.notify_waiters();
        Ok(())
    }

    /// Explicit generated policy. A retained same-root participant is inspected
    /// before gate acquisition, and only a fresh direct sibling can reuse it.
    #[doc(hidden)]
    pub async fn start_local_reusable(
        &self,
        start: ActorTransactionStart,
        mode: ParticipantStartMode,
        reuse: bool,
    ) -> Result<StartedLocalTransaction<C>, Status> {
        if !reuse || start.transaction_ids.len() == 1 {
            return self.start_local(start, mode).await;
        }
        self.validate_start_with_mode(&start, mode)?;
        if mode != ParticipantStartMode::Exclusive
            || start.mode != TransactionMode::Exclusive
            || start.read_only
            || start.factory
            || start.transaction_ids.len() != 2
            || (start.coordinator_state_type == self.state_type
                && start.coordinator_state_ref == self.state_ref)
            || start.transaction_ids[0] == start.transaction_ids[1]
        {
            return Err(Status::failed_precondition(
                "reusable policy requires direct existing exclusive leaf",
            ));
        }
        let root = start.transaction_ids[0];
        let nested = start.transaction_ids[1];
        let owner = Uuid::new_v4();
        let _admission = self.reserve_admission(root, true)?;
        {
            let mut pending = self.pending.lock().await;
            if let Some(current) = pending.as_mut().filter(|p| p.root_id == root) {
                let calls = current.reusable.as_mut().ok_or_else(|| {
                    Status::failed_precondition("retained participant policy differs")
                })?;
                if current.execution_active
                    || current.prepared
                    || current.terminal_attempted
                    || current.coordinator_state_type != start.coordinator_state_type
                    || current.coordinator_state_ref != start.coordinator_state_ref
                    || current.transaction_ids.len() != 1
                    || calls.completed.contains_key(&nested)
                    || calls.completed.len() >= 1024
                    || current.lock.is_shared()
                    || current.disposition != PendingDisposition::Commit
                {
                    return Err(Status::failed_precondition(
                        "retained participant not available for fresh sibling",
                    ));
                }
                calls.snapshot = current.effects.clone();
                calls.snapshot_staged = current.staged;
                calls.snapshot_disposition = current.disposition;
                calls.call_staged = false;
                calls.admitting = true;
                current.execution_active = true;
                current.local_owner = Some(owner);
                current.transaction_ids = start.transaction_ids;
                let state = current
                    .effects
                    .state
                    .clone()
                    .or_else(|| current.loaded_state.clone());
                return Ok(StartedLocalTransaction {
                    participant: self.clone(),
                    transaction_id: root,
                    state,
                    local_owner: owner,
                    admitted_explicit_root_scope: false,
                    armed: false,
                    cancellation_authority: false,
                    handed_off: false,
                });
            }
        }
        let state = self
            .start_owned_reserved(start, mode, Some(owner), true)
            .await?;
        Ok(StartedLocalTransaction {
            participant: self.clone(),
            transaction_id: root,
            state,
            local_owner: owner,
            admitted_explicit_root_scope: false,
            armed: true,
            cancellation_authority: false,
            handed_off: false,
        })
    }

    #[cfg(test)]
    pub(crate) async fn prepare_for_test(&self, id: Uuid) -> Result<(), Status> {
        self.prepare(id, false, false).await.map(|_| ())
    }

    #[cfg(test)]
    pub(crate) async fn hold_pending_for_test(
        &self,
        entered: tokio::sync::oneshot::Sender<()>,
        release: tokio::sync::oneshot::Receiver<()>,
    ) {
        let _pending = self.pending.lock().await;
        entered.send(()).unwrap();
        release.await.unwrap();
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
        let admitted_explicit_root_scope = mode == ParticipantStartMode::Exclusive
            && start.mode == TransactionMode::Exclusive
            && !start.read_only
            && !start.factory
            && start.transaction_ids.len() == 1
            && start.coordinator_state_type == self.state_type
            && start.coordinator_state_ref == self.state_ref;
        let local_owner = Uuid::new_v4();
        let state = self.start_owned(start, mode, Some(local_owner)).await?;
        Ok(StartedLocalTransaction {
            participant: self.clone(),
            transaction_id,
            state,
            local_owner,
            admitted_explicit_root_scope,
            armed: true,
            cancellation_authority: false,
            handed_off: false,
        })
    }

    pub async fn stage(
        &self,
        transaction_id: Uuid,
        effects: PendingActorEffects,
    ) -> Result<Option<SharedPromotion>, Status> {
        self.stage_owned(transaction_id, effects, None, None).await
    }

    async fn stage_owned(
        &self,
        transaction_id: Uuid,
        effects: PendingActorEffects,
        owner: Option<Uuid>,
        receipt: Option<ValidatedTaskBatch>,
    ) -> Result<Option<SharedPromotion>, Status> {
        #[cfg(feature = "test-support")]
        if !effects.task_upserts.is_empty()
            && let Some(path) = std::env::var_os("REBOOT_TEST_TASK_STAGING_CANCEL")
        {
            struct StagingDrop(std::path::PathBuf);
            impl Drop for StagingDrop {
                fn drop(&mut self) {
                    let _ = std::fs::write(
                        self.0.with_extension("future-dropped"),
                        b"actual staging future dropped",
                    );
                }
            }
            let path = std::path::PathBuf::from(path);
            std::fs::write(&path, b"staging entered before effects/Prepare")
                .map_err(|error| Status::internal(error.to_string()))?;
            let _drop = StagingDrop(path);
            std::future::pending::<()>().await;
        }
        let mut pending = self.pending.lock().await;
        let current = pending
            .as_mut()
            .ok_or_else(|| Status::failed_precondition("actor has no pending transaction"))?;
        if current.root_id != transaction_id {
            return Err(Status::failed_precondition(
                "pending transaction ID differs",
            ));
        }
        if current.terminal_attempted || current.prepared || current.native_uncertain {
            return Err(Status::failed_precondition(
                "staging after native uncertainty or Prepare is forbidden",
            ));
        }
        if current.native_started
            && (effects.state.as_ref().is_some_and(|s| !s.is_empty())
                || !effects.task_upserts.is_empty()
                || !effects.idempotent_mutations.is_empty())
        {
            return Err(Status::failed_precondition(
                "eager canonical map cannot mix deferred actor/task/idempotency effects",
            ));
        }
        if let Some(calls) = current.reusable.as_mut() {
            let _running_owner = receipt
                .as_ref()
                .and_then(|receipt| receipt.running.as_ref())
                .map(|running| running.lock())
                .transpose()?;
            if owner.is_none()
                || current.local_owner != owner
                || !current.execution_active
                || calls.admitting
                || !calls.watch_claimed
                || current.transaction_ids.len() != 2
                || !effects.idempotent_mutations.is_empty()
            {
                return Err(Status::failed_precondition(
                    "reusable staging requires exact active call capability",
                ));
            }
            if !effects.task_upserts.is_empty()
                && !receipt.as_ref().is_some_and(|receipt| {
                    receipt.root == transaction_id
                        && Some(receipt.owner) == owner
                        && receipt.tasks == effects.task_upserts
                })
            {
                return Err(Status::failed_precondition(
                    "reusable tasks require consumed actor/incarnation/batch-bound validation",
                ));
            }
            if calls.call_staged {
                return Err(Status::failed_precondition(
                    "reusable call may stage only once",
                ));
            }
            let mut tasks = current.effects.task_upserts.clone();
            tasks.extend(effects.task_upserts);
            if tasks.len() > 1024 {
                return Err(Status::resource_exhausted(
                    "retained staged task capacity exceeded",
                ));
            }
            let mut ids = std::collections::BTreeSet::new();
            for task in &tasks {
                let id = task
                    .task_id
                    .as_ref()
                    .ok_or_else(|| Status::invalid_argument("missing task ID"))?;
                if id.state_type != self.state_type
                    || id.state_ref != self.state_ref
                    || id.task_uuid.len() != 16
                    || !ids.insert(id.task_uuid.clone())
                {
                    return Err(Status::invalid_argument(
                        "duplicate or foreign retained task ID",
                    ));
                }
            }
            if let Some(state) = effects.state {
                current.effects.state = Some(state);
            }
            current.effects.task_upserts = tasks;
            current.staged = true;
            calls.call_staged = true;
            return Ok(None);
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
            {
                let _running_owner = receipt
                    .as_ref()
                    .and_then(|receipt| receipt.running.as_ref())
                    .map(|running| running.lock())
                    .transpose()?;
                current.effects = effects;
                current.staged = true;
            }
            #[cfg(feature = "test-support")]
            if !current.effects.task_upserts.is_empty()
                && let Some(path) = std::env::var_os("REBOOT_TEST_WRITER_TASK_STAGED")
            {
                std::fs::write(path, b"actual participant effects staged; no Prepare")
                    .map_err(|error| Status::internal(error.to_string()))?;
                std::future::pending::<()>().await;
            }
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
        self.prepare_with_deadline(transaction_id, read_only_aware, read_only, None)
            .await
    }

    async fn prepare_with_deadline(
        &self,
        transaction_id: Uuid,
        read_only_aware: bool,
        read_only: bool,
        deadline: Option<tokio::time::Instant>,
    ) -> Result<PrepareOutcome, Status> {
        let mut pending = loop {
            let notified = self.changed.notified();
            tokio::pin!(notified);
            notified.as_mut().enable();
            let pending = self.pending.lock().await;
            if !pending.as_ref().is_some_and(|current| {
                current.root_id == transaction_id && current.execution_active
            }) {
                break pending;
            }
            drop(pending);
            notified.await;
        };
        // Client timeout is not server cancellation acknowledgement. Fence a
        // queued expired control before read-only lease release or durable Prepare.
        if deadline.is_some_and(|deadline| tokio::time::Instant::now() >= deadline) {
            return Err(Status::deadline_exceeded(
                "participant Prepare expired before admission",
            ));
        }
        let Some(current) = pending.as_mut() else {
            return Ok(PrepareOutcome::DefinitiveAbort);
        };
        if current.root_id != transaction_id {
            return Ok(PrepareOutcome::DefinitiveAbort);
        }
        if current.terminal_attempted {
            return Err(Status::unavailable(
                "Prepare after ambiguous terminal ACK is forbidden",
            ));
        }
        if current.native_started && current.loaded_state.is_none() && !current.prepared {
            return Err(Status::failed_precondition(
                "recovered unprepared native participant must abort, never resume",
            ));
        }
        if current.native_uncertain {
            return Err(Status::unavailable(
                "early Store outcome uncertain; root must abort",
            ));
        }
        if current.disposition == PendingDisposition::ReadOnly {
            if !(read_only_aware && read_only) {
                return Err(Status::failed_precondition(
                    "read-only participant requires a read-only-aware prepare",
                ));
            }
            // The coordinator has already sealed this participant in its read-only map.
            // No sidecar transaction exists, so release exactly once at Prepare.
            #[cfg(feature = "test-support")]
            if let Some(marker) = std::env::var_os("REBOOT_TEST_READ_ONLY_RELEASE") {
                std::fs::write(
                    marker,
                    format!("{transaction_id}: read-only Prepare lease release"),
                )
                .map_err(|error| Status::internal(error.to_string()))?;
            }
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
                transaction: (!current.native_started).then(|| database::Transaction {
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
                state: if current.native_started {
                    None
                } else {
                    current.effects.state.clone()
                },
                task_upserts: if current.native_started {
                    vec![]
                } else {
                    current.effects.task_upserts.clone()
                },
                idempotent_mutations: if current.native_started {
                    vec![]
                } else {
                    current.effects.idempotent_mutations.clone()
                },
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
            reusable: None,
            execution_active: false,
            terminal_attempted: false,
            no_terminal_retry: false,
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
            native_started: true,
            native_uncertain: false,
            factory: false,
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

        #[cfg(feature = "test-support")]
        if let Some(path) = std::env::var_os("REBOOT_TEST_TARGET_WATCH_TERMINALIZED") {
            std::fs::write(
                std::path::PathBuf::from(path).with_extension("watch-ready"),
                b"durable prepared ownership restored; Watch obligation active",
            )
            .map_err(|error| Status::internal(error.to_string()))?;
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
                && !current.native_started
        }) {
            *pending = None;
            self.changed.notify_waiters();
        }
    }

    async fn terminal(&self, transaction_id: Uuid, commit: bool) -> Result<(), Status> {
        self.terminal_owned(transaction_id, commit, None).await
    }

    async fn terminal_owned(
        &self,
        transaction_id: Uuid,
        commit: bool,
        expected_local_owner: Option<Uuid>,
    ) -> Result<(), Status> {
        self.terminal_checked(transaction_id, commit, expected_local_owner, false)
            .await
            .map(|_| ())
    }

    async fn terminal_live(&self, root: Uuid, owner: Uuid, commit: bool) -> Result<bool, Status> {
        self.terminal_checked(root, commit, Some(owner), true).await
    }

    async fn terminal_checked(
        &self,
        transaction_id: Uuid,
        commit: bool,
        expected_local_owner: Option<Uuid>,
        live: bool,
    ) -> Result<bool, Status> {
        let mut pending = loop {
            let notified = self.changed.notified();
            tokio::pin!(notified);
            notified.as_mut().enable();
            let pending = self.pending.lock().await;
            if !pending.as_ref().is_some_and(|current| {
                current.root_id == transaction_id
                    && current.execution_active
                    && expected_local_owner.is_none_or(|owner| {
                        if live {
                            current.matches_live_owner(owner)
                        } else {
                            current.local_owner == Some(owner)
                        }
                    })
            }) {
                break pending;
            }
            drop(pending);
            notified.await;
        };
        if live
            && !pending.as_ref().is_some_and(|current| {
                current.root_id == transaction_id
                    && expected_local_owner.is_some_and(|owner| current.matches_live_owner(owner))
            })
        {
            return Ok(false);
        }
        if let Some(owner) = expected_local_owner
            && !pending.as_ref().is_some_and(|current| {
                current.root_id == transaction_id
                    && (if live {
                        current.matches_live_owner(owner)
                    } else {
                        current.local_owner == Some(owner)
                    })
                    && (live || !current.prepared)
            })
        {
            return Err(Status::failed_precondition(
                "explicit abort local incarnation no longer owns the transaction",
            ));
        }
        // This mutex remains held through the sidecar ACK, excluding replacement
        // and concurrent Prepare/terminal controls throughout terminal delivery.
        // Terminal delivery is deliberately idempotent.  In particular, a
        // coordinator that recovers a sealed `preparing` record can discover
        // that this process lost an unprepared, in-memory participant and
        // abort the complete set.  There is nothing to persist or release for
        // this actor in that case.  A duplicate terminal RPC after a prior
        // successful terminal response has the same outcome.
        let Some(current) = pending.as_mut() else {
            return Ok(false);
        };
        if current.root_id != transaction_id {
            // This actor may already be serving a later root transaction.
            // Never terminalize that transaction for a stale control RPC.
            return Ok(false);
        }
        if current.terminal_attempted || current.native_uncertain {
            return Err(Status::unavailable(
                "native ACK uncertain; ownership retained until sidecar restart/recovery",
            ));
        }
        if live && commit && !current.prepared {
            return Err(Status::failed_precondition(
                "live Commit requires exact prepared ownership",
            ));
        }
        if current.disposition == PendingDisposition::ReadOnly {
            *pending = None;
            self.changed.notify_waiters();
            return Ok(true);
        }
        #[cfg(feature = "test-support")]
        if current.no_terminal_retry
            && let Some(path) = std::env::var_os("REBOOT_TEST_TARGET_UNFINISHED_OUTBOUND")
        {
            assert!(
                std::path::PathBuf::from(path)
                    .with_extension("handler-dropped")
                    .exists(),
                "actual handler must finish/drop before terminal RPC"
            );
        }
        #[cfg(feature = "test-support")]
        if current.no_terminal_retry {
            for name in [
                "REBOOT_TEST_TASK_ADMISSION_CANCEL",
                "REBOOT_TEST_TASK_STAGING_CANCEL",
                "REBOOT_TEST_LIVE_INBOUND_RESPONSE",
            ] {
                if let Some(path) = std::env::var_os(name) {
                    let path = std::path::PathBuf::from(path);
                    assert!(
                        path.with_extension("future-dropped").exists(),
                        "actual remote {name} future must drop BEFORE terminal sidecar RPC"
                    );
                }
            }
        }
        current.terminal_attempted = current.no_terminal_retry || current.native_started;
        let force_abort = commit && !current.prepared;
        if commit && !force_abort {
            let commit_gate = match self.sidecar.database_endpoint() {
                Some(endpoint) => {
                    crate::runtime::same_actor_gate(endpoint, &self.state_type, &self.state_ref)
                }
                None => self.lock.clone(),
            };
            let commit_attempt = commit_gate.commit_attempt();
            self.sidecar
                .commit(database::TransactionParticipantCommitRequest {
                    state_type: self.state_type.clone(),
                    state_ref: self.state_ref.clone(),
                })
                .await?;
            commit_attempt.acknowledged();
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
        self.changed.notify_waiters();
        if force_abort {
            return Err(Status::failed_precondition(
                "commit requires the matching prepared transaction; transaction was aborted",
            ));
        }
        Ok(true)
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
    /// Exact protobuf request identity is retained on both entry and successful
    /// native Database ACK. The env is scoped to one acceptance host process.
    pub async fn park_database_commit(
        request: &crate::database_proto::TransactionParticipantCommitRequest,
    ) -> Result<Option<(std::path::PathBuf, Vec<u8>)>, tonic::Status> {
        use prost::Message as _;
        let Some(marker) = std::env::var_os("REBOOT_TEST_DATABASE_COMMIT_PARK") else {
            return Ok(None);
        };
        let marker = std::path::PathBuf::from(marker);
        let bytes = request.encode_to_vec();
        std::fs::write(&marker, &bytes)
            .map_err(|error| tonic::Status::internal(error.to_string()))?;
        tokio::time::timeout(std::time::Duration::from_secs(15), async {
            while !marker.with_extension("release").exists() {
                tokio::time::sleep(std::time::Duration::from_millis(5)).await;
            }
        })
        .await
        .map_err(|_| tonic::Status::internal("actual Database Commit park not released"))?;
        Ok(Some((marker, bytes)))
    }

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

fn prepare_request_deadline<T>(
    request: &Request<T>,
) -> Result<Option<tokio::time::Instant>, Status> {
    let Some(timeout) = request.metadata().get("grpc-timeout") else {
        return Ok(None);
    };
    let timeout = timeout
        .to_str()
        .map_err(|_| Status::invalid_argument("invalid grpc-timeout"))?;
    if !(2..=9).contains(&timeout.len()) {
        return Err(Status::invalid_argument("invalid grpc-timeout"));
    }
    let (digits, unit) = timeout.split_at(timeout.len() - 1);
    if !digits.bytes().all(|c| c.is_ascii_digit()) {
        return Err(Status::invalid_argument("invalid grpc-timeout"));
    }
    let value: u64 = digits
        .parse()
        .map_err(|_| Status::invalid_argument("invalid grpc-timeout"))?;
    let duration = match unit {
        "H" => std::time::Duration::from_secs(value * 3600),
        "M" => std::time::Duration::from_secs(value * 60),
        "S" => std::time::Duration::from_secs(value),
        "m" => std::time::Duration::from_millis(value),
        "u" => std::time::Duration::from_micros(value),
        "n" => std::time::Duration::from_nanos(value),
        _ => return Err(Status::invalid_argument("invalid grpc-timeout")),
    };
    Ok(Some(tokio::time::Instant::now() + duration))
}
#[cfg(feature = "test-support")]
struct PrepareProbe {
    marker: std::path::PathBuf,
    returned: bool,
}
#[cfg(feature = "test-support")]
impl PrepareProbe {
    fn from_request<T>(request: &Request<T>) -> Result<Option<Self>, Status> {
        if request
            .metadata()
            .get("x-reboot-test-prepare-probe")
            .is_none()
        {
            return Ok(None);
        }
        let Some(marker) = std::env::var_os("REBOOT_TEST_PREPARE_PROBE") else {
            return Ok(None);
        };
        let marker = std::path::PathBuf::from(marker);
        std::fs::write(&marker, b"actual participant Prepare entered")
            .map_err(|e| Status::internal(e.to_string()))?;
        Ok(Some(Self {
            marker,
            returned: false,
        }))
    }
    fn returned(&mut self, outcome: &Result<PrepareOutcome, Status>) -> Result<(), Status> {
        std::fs::write(
            self.marker.with_extension("returned"),
            format!("{outcome:?}"),
        )
        .map_err(|e| Status::internal(e.to_string()))?;
        self.returned = true;
        Ok(())
    }
}
#[cfg(feature = "test-support")]
impl Drop for PrepareProbe {
    fn drop(&mut self) {
        if !self.returned {
            let _ = std::fs::write(
                self.marker.with_extension("dropped"),
                b"actual server Prepare future dropped",
            );
        }
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
        let deadline = prepare_request_deadline(&request)?;
        #[cfg(feature = "test-support")]
        let mut probe = PrepareProbe::from_request(&request)?;
        let abort_via_response = request.get_ref().abort_via_response;
        let read_only_aware = request.get_ref().read_only_aware;
        let read_only = request.get_ref().read_only;
        let outcome = self
            .participant
            .prepare_with_deadline(
                self.transaction_id(&request)?,
                read_only_aware,
                read_only,
                deadline,
            )
            .await;
        #[cfg(feature = "test-support")]
        if let Some(probe) = &mut probe {
            probe.returned(&outcome)?;
        }
        match outcome? {
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
        request: Request<database::RelinquishOwnershipRequest>,
    ) -> Result<Response<database::RelinquishOwnershipResponse>, Status> {
        let headers = crate::RebootHeaders::from_request(&request)
            .map_err(|error| Status::invalid_argument(error.to_string()))?;
        if headers.state_ref != self.participant.state_ref {
            return Err(Status::invalid_argument("relinquishment actor differs"));
        }
        let request = request.into_inner();
        let root = Uuid::from_slice(&request.root_transaction_id)
            .map_err(|_| Status::invalid_argument("invalid root UUID"))?;
        let nested = Uuid::from_slice(&request.transaction_id)
            .map_err(|_| Status::invalid_argument("invalid nested UUID"))?;
        self.participant
            .relinquish(root, nested, request.aborted, None)
            .await?;
        Ok(Response::new(
            database::RelinquishOwnershipResponse::default(),
        ))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::VecDeque;
    use std::sync::Mutex;

    use crate::durable_coordinator::{InProcessParticipantEndpoint, ParticipantEndpoint};

    #[tokio::test]
    async fn rollback_leaf_watch_shutdown_retains_at_all_transfer_phases() {
        use crate::application_host::{HostRecovery, RecoveryCancellation};
        struct ParkWatch(Arc<tokio::sync::Semaphore>);
        impl CoordinatorWatchEndpoint for ParkWatch {
            fn watch(
                &self,
                _: database::WatchRequest,
            ) -> crate::legacy_coordinator::CoordinatorWatchFuture<'_, database::WatchResponse>
            {
                self.0.add_permits(1);
                Box::pin(std::future::pending())
            }
        }
        for phase in 0..4 {
            let sidecar = Arc::new(MockSidecar::default());
            *sidecar.load_state.lock().unwrap() = Some(vec![42]);
            let participant =
                DurableActorParticipant::new(sidecar.clone(), "example.Actor", "actor/1");
            let root = Uuid::new_v4();
            let (local, context) = rollback_local(&participant, root, Uuid::new_v4()).await;
            let entered = Arc::new(tokio::sync::Semaphore::new(0));
            let watch = Arc::new(ParkWatch(entered.clone()));
            let owner = crate::live_participant::LiveParticipantOwner::new(
                1,
                crate::durable_coordinator::ParticipantTarget {
                    state_type: "example.Coordinator".into(),
                    state_ref: "coordinator/1".into(),
                },
                watch.clone(),
            )
            .unwrap();
            let mut supervisor = tokio::task::JoinSet::new();
            let cancellation = RecoveryCancellation::new();
            owner
                .recovery_registration()
                .start(&mut supervisor, cancellation.clone())
                .await
                .unwrap();
            let reservation = owner.reserve(&context).unwrap();
            if phase > 0 {
                local.rollback_declared_leaf(&context).await.unwrap();
            }
            if phase < 2 {
                cancellation.cancel();
                supervisor.join_next().await.unwrap().unwrap().unwrap();
                assert!(reservation.validate_active().is_err());
            }
            let execution = LiveExecution {
                participant: participant.clone(),
                root,
                owner: local.local_owner,
                call_owner: local.local_owner,
                watch_new: true,
            };
            reservation.submit(Box::pin(async move { execution.watch(watch).await }));
            if phase == 2 {
                cancellation.cancel();
            } // queued but not polled
            if phase == 3 {
                tokio::time::timeout(std::time::Duration::from_millis(100), entered.acquire())
                    .await
                    .unwrap()
                    .unwrap()
                    .forget();
                cancellation.cancel();
            }
            if phase >= 2 {
                supervisor.join_next().await.unwrap().unwrap().unwrap();
            }
            assert!(
                tokio::time::timeout(
                    std::time::Duration::from_millis(10),
                    participant.lock.exclusive()
                )
                .await
                .is_err(),
                "shutdown phase {phase} released retained observation"
            );
            if phase > 0 {
                tokio::time::timeout(
                    std::time::Duration::from_millis(50),
                    participant.lock.shared(),
                )
                .await
                .unwrap();
            }
            assert!(matches!(
                sidecar.calls.lock().unwrap().as_slice(),
                [Call::Load(_)]
            ));
            // Test teardown alone discards this in-memory retained capability.
            *participant.pending.lock().await = None;
        }
    }

    #[tokio::test]
    async fn rollback_descendant_rejects_full_path_root_coordinator_actor_and_staged_effects() {
        for coordinate in 0..8 {
            let sidecar = Arc::new(MockSidecar::default());
            *sidecar.load_state.lock().unwrap() = Some(vec![42]);
            let participant =
                DurableActorParticipant::new(sidecar.clone(), "example.Actor", "actor/1");
            let root = Uuid::new_v4();
            let (local, context) =
                rollback_descendant_local(&participant, root, Uuid::new_v4()).await;
            let mut headers = context.headers().clone();
            match coordinate {
                0 => headers.transaction_ids.as_mut().unwrap()[0] = Uuid::new_v4(),
                1 => headers.transaction_ids.as_mut().unwrap()[1] = Uuid::new_v4(),
                2 => headers.transaction_ids.as_mut().unwrap()[2] = Uuid::new_v4(),
                3 => headers.transaction_coordinator_state_type = Some("wrong.Type".into()),
                4 => headers.transaction_coordinator_state_ref = Some("wrong-coordinator".into()),
                5 => headers.state_ref = "wrong-C".into(),
                6 => headers
                    .transaction_ids
                    .as_mut()
                    .unwrap()
                    .push(Uuid::new_v4()),
                _ => {
                    local
                        .stage(PendingActorEffects {
                            state: Some(vec![99]),
                            task_upserts: vec![database::Task::default()],
                            ..Default::default()
                        })
                        .await
                        .unwrap();
                }
            }
            let mut changed = crate::runtime::TransactionContext::from_headers(
                headers,
                TransactionMode::Exclusive,
            )
            .unwrap();
            changed.enable_supervised_tree().unwrap();
            changed.mark_supervised_inbound();
            assert!(
                local.rollback_declared_leaf(&changed).await.is_err(),
                "coordinate {coordinate} must retain exact owner"
            );
            let pending = participant.pending.lock().await;
            let current = pending.as_ref().unwrap();
            assert!(current.execution_active);
            assert_eq!(current.disposition, PendingDisposition::Commit);
            assert!(!current.lock.is_shared());
            drop(pending);
            assert!(
                tokio::time::timeout(
                    std::time::Duration::from_millis(10),
                    participant.lock.shared()
                )
                .await
                .is_err()
            );
            local.end_execution().await.unwrap();
            participant.terminal(root, false).await.unwrap();
        }
    }
    fn rollback_descendant_context(root: Uuid, child: Uuid) -> crate::runtime::TransactionContext {
        let mut headers = rollback_context(root, child).headers().clone();
        headers
            .transaction_ids
            .as_mut()
            .unwrap()
            .push(Uuid::from_u128(777));
        let mut context =
            crate::runtime::TransactionContext::from_headers(headers, TransactionMode::Exclusive)
                .unwrap();
        context.enable_supervised_tree().unwrap();
        context.mark_supervised_inbound();
        context
    }
    async fn rollback_descendant_local(
        participant: &DurableActorParticipant<MockSidecar>,
        root: Uuid,
        child: Uuid,
    ) -> (
        StartedLocalTransaction<MockSidecar>,
        crate::runtime::TransactionContext,
    ) {
        let context = rollback_descendant_context(root, child);
        let mut request = start(root);
        request
            .transaction_ids
            .extend([child, Uuid::from_u128(777)]);
        request.transaction_path = TransactionPathContract::PreserveNested;
        let mut local = participant
            .start_local(request, ParticipantStartMode::Exclusive)
            .await
            .unwrap();
        local.reserve_live_execution(&context).await.unwrap();
        (local, context)
    }
    #[tokio::test]
    async fn rollback_descendant_watch_shutdown_retains_at_all_transfer_phases() {
        use crate::application_host::{HostRecovery, RecoveryCancellation};
        struct ParkWatch(Arc<tokio::sync::Semaphore>);
        impl CoordinatorWatchEndpoint for ParkWatch {
            fn watch(
                &self,
                _: database::WatchRequest,
            ) -> crate::legacy_coordinator::CoordinatorWatchFuture<'_, database::WatchResponse>
            {
                self.0.add_permits(1);
                Box::pin(std::future::pending())
            }
        }
        for phase in 0..4 {
            let sidecar = Arc::new(MockSidecar::default());
            *sidecar.load_state.lock().unwrap() = Some(vec![42]);
            let participant =
                DurableActorParticipant::new(sidecar.clone(), "example.Actor", "actor/1");
            let root = Uuid::new_v4();
            let (local, context) =
                rollback_descendant_local(&participant, root, Uuid::new_v4()).await;
            let entered = Arc::new(tokio::sync::Semaphore::new(0));
            let watch = Arc::new(ParkWatch(entered.clone()));
            let owner = crate::live_participant::LiveParticipantOwner::new(
                1,
                crate::durable_coordinator::ParticipantTarget {
                    state_type: "example.Coordinator".into(),
                    state_ref: "coordinator/1".into(),
                },
                watch.clone(),
            )
            .unwrap();
            let mut supervisor = tokio::task::JoinSet::new();
            let cancellation = RecoveryCancellation::new();
            owner
                .recovery_registration()
                .start(&mut supervisor, cancellation.clone())
                .await
                .unwrap();
            let reservation = owner.reserve(&context).unwrap();
            if phase > 0 {
                local.rollback_declared_leaf(&context).await.unwrap();
            }
            if phase < 2 {
                cancellation.cancel();
                supervisor.join_next().await.unwrap().unwrap().unwrap();
                assert!(reservation.validate_active().is_err());
            }
            let execution = LiveExecution {
                participant: participant.clone(),
                root,
                owner: local.local_owner,
                call_owner: local.local_owner,
                watch_new: true,
            };
            reservation.submit(Box::pin(async move { execution.watch(watch).await }));
            if phase == 2 {
                cancellation.cancel();
            } // queued but not polled
            if phase == 3 {
                tokio::time::timeout(std::time::Duration::from_millis(100), entered.acquire())
                    .await
                    .unwrap()
                    .unwrap()
                    .forget();
                cancellation.cancel();
            }
            if phase >= 2 {
                supervisor.join_next().await.unwrap().unwrap().unwrap();
            }
            assert!(
                tokio::time::timeout(
                    std::time::Duration::from_millis(10),
                    participant.lock.exclusive()
                )
                .await
                .is_err(),
                "shutdown phase {phase} released retained observation"
            );
            if phase > 0 {
                tokio::time::timeout(
                    std::time::Duration::from_millis(50),
                    participant.lock.shared(),
                )
                .await
                .unwrap();
            }
            assert!(matches!(
                sidecar.calls.lock().unwrap().as_slice(),
                [Call::Load(_)]
            ));
            // Test teardown alone discards this in-memory retained capability.
            *participant.pending.lock().await = None;
        }
    }

    #[tokio::test]
    async fn rollback_descendant_atomic_downgrade_retains_until_readonly_prepare() {
        let sidecar = Arc::new(MockSidecar::default());
        *sidecar.load_state.lock().unwrap() = Some(vec![42]);
        let participant = DurableActorParticipant::new(sidecar.clone(), "example.Actor", "actor/1");
        let root = Uuid::new_v4();
        let (local, context) = rollback_descendant_local(&participant, root, Uuid::new_v4()).await;
        local.rollback_declared_leaf(&context).await.unwrap();
        assert_eq!(local.state_bytes(), Some(vec![42]));
        let reader = tokio::time::timeout(
            std::time::Duration::from_millis(50),
            participant.lock.shared(),
        )
        .await
        .unwrap();
        assert!(
            tokio::time::timeout(
                std::time::Duration::from_millis(10),
                participant.lock.exclusive()
            )
            .await
            .is_err()
        );
        // Direct Prepare cannot release the downgraded lease while rollback execution is active.
        assert!(
            tokio::time::timeout(
                std::time::Duration::from_millis(10),
                participant.prepare(root, true, true)
            )
            .await
            .is_err()
        );
        local.end_execution().await.unwrap();
        for (read_only, aware) in [(false, false), (false, true), (true, false)] {
            assert!(participant.prepare(root, read_only, aware).await.is_err());
            assert!(participant.pending.lock().await.is_some());
            assert!(
                tokio::time::timeout(
                    std::time::Duration::from_millis(10),
                    participant.lock.exclusive()
                )
                .await
                .is_err(),
                "wrong flags ({read_only}, {aware}) released ownership"
            );
            assert!(matches!(
                sidecar.calls.lock().unwrap().as_slice(),
                [Call::Load(_)]
            ));
        }
        participant.prepare(root, true, true).await.unwrap();
        drop(reader);
        tokio::time::timeout(
            std::time::Duration::from_millis(50),
            participant.lock.exclusive(),
        )
        .await
        .unwrap();
        assert!(matches!(
            sidecar.calls.lock().unwrap().as_slice(),
            [Call::Load(_)]
        ));
    }
    #[tokio::test]
    async fn rollback_descendant_rejects_stale_same_root_exact_incarnation() {
        let sidecar = Arc::new(MockSidecar::default());
        *sidecar.load_state.lock().unwrap() = Some(vec![42]);
        let participant = DurableActorParticipant::new(sidecar.clone(), "example.Actor", "actor/1");
        let root = Uuid::new_v4();
        let child = Uuid::new_v4();
        let (old, context) = rollback_descendant_local(&participant, root, child).await;
        *participant.pending.lock().await = None;
        let (replacement, _) = rollback_descendant_local(&participant, root, child).await;
        assert!(old.rollback_declared_leaf(&context).await.is_err());
        assert!(
            tokio::time::timeout(
                std::time::Duration::from_millis(10),
                participant.lock.shared()
            )
            .await
            .is_err()
        );
        replacement.rollback_declared_leaf(&context).await.unwrap();
        replacement.end_execution().await.unwrap();
        participant.terminal(root, false).await.unwrap();
    }
    #[tokio::test]
    async fn rollback_descendant_old_guard_watch_cannot_release_live_replacement() {
        use crate::application_host::{HostRecovery, RecoveryCancellation};
        use crate::durable_coordinator::{
            CoordinatorSidecar, DurableRootCoordinator, ParticipantResolver, ParticipantTarget,
        };
        struct UnusedCoordinator;
        impl CoordinatorSidecar for UnusedCoordinator {
            fn coordinator_prepare(
                &self,
                _: database::TransactionCoordinatorPrepareRequest,
            ) -> SidecarFuture<'_, database::TransactionCoordinatorPrepareResponse> {
                panic!("stale guard must not coordinate")
            }
            fn coordinator_prepared(
                &self,
                _: database::TransactionCoordinatorPreparedRequest,
            ) -> SidecarFuture<'_, database::TransactionCoordinatorPreparedResponse> {
                panic!("stale guard must not coordinate")
            }
            fn coordinator_cleanup(
                &self,
                _: database::TransactionCoordinatorCleanupRequest,
            ) -> SidecarFuture<'_, database::TransactionCoordinatorCleanupResponse> {
                panic!("stale guard must not coordinate")
            }
            fn recover(
                &self,
                _: database::RecoverRequest,
            ) -> SidecarFuture<'_, Vec<database::RecoverResponse>> {
                panic!("stale guard must not recover")
            }
        }
        struct UnusedResolver;
        impl ParticipantResolver for UnusedResolver {
            type Endpoint = InProcessParticipantEndpoint<MockSidecar>;
            fn resolve(&self, _: &ParticipantTarget) -> SidecarFuture<'_, Arc<Self::Endpoint>> {
                panic!("stale guard must not resolve")
            }
        }
        struct ControlledWatch {
            entered: tokio::sync::Semaphore,
            release: tokio::sync::Notify,
        }
        impl CoordinatorWatchEndpoint for ControlledWatch {
            fn watch(
                &self,
                _: database::WatchRequest,
            ) -> crate::legacy_coordinator::CoordinatorWatchFuture<'_, database::WatchResponse>
            {
                self.entered.add_permits(1);
                Box::pin(async move {
                    self.release.notified().await;
                    Ok(database::WatchResponse { aborted: false })
                })
            }
        }
        // Exercise the actual consuming guard's queued transfer and an already
        // active old Watch receiving Commit after replacement admission.
        for active in [false, true] {
            let sidecar = Arc::new(MockSidecar::default());
            *sidecar.load_state.lock().unwrap() = Some(vec![42]);
            let participant =
                DurableActorParticipant::new(sidecar.clone(), "example.Actor", "actor/1");
            let root = Uuid::new_v4();
            let child = Uuid::new_v4();
            let mut context = rollback_descendant_context(root, child);
            let mut request = start(root);
            request
                .transaction_ids
                .extend([child, Uuid::from_u128(777)]);
            request.transaction_path = TransactionPathContract::PreserveNested;
            let local = participant
                .start_local(request, ParticipantStartMode::Exclusive)
                .await
                .unwrap();
            let watch = Arc::new(ControlledWatch {
                entered: tokio::sync::Semaphore::new(0),
                release: tokio::sync::Notify::new(),
            });
            let owner = crate::live_participant::LiveParticipantOwner::new(
                1,
                ParticipantTarget {
                    state_type: "example.Coordinator".into(),
                    state_ref: "coordinator/1".into(),
                },
                watch.clone(),
            )
            .unwrap();
            let cancellation = RecoveryCancellation::new();
            let mut supervisor = tokio::task::JoinSet::new();
            owner
                .recovery_registration()
                .start(&mut supervisor, cancellation.clone())
                .await
                .unwrap();
            let coordinator =
                DurableRootCoordinator::new(Arc::new(UnusedCoordinator), Arc::new(UnusedResolver));
            let guard = crate::explicit_abort::RootHandlerGuard::before_handler(
                local,
                context.clone(),
                coordinator,
                None,
            )
            .await
            .unwrap()
            .with_supervised_tree(&mut context, Some(&owner))
            .await
            .unwrap();
            let old_guard = if active {
                drop(guard);
                tokio::time::timeout(
                    std::time::Duration::from_millis(100),
                    watch.entered.acquire(),
                )
                .await
                .unwrap()
                .unwrap()
                .forget();
                None
            } else {
                Some(guard)
            };
            // Explicitly simulate replacement of an incarnation, not a terminal
            // replacement that makes the old guard's no-op uninformative.
            *participant.pending.lock().await = None;
            let (replacement, replacement_context) =
                rollback_descendant_local(&participant, root, child).await;
            let replacement_owner = replacement.local_owner;
            drop(old_guard);
            if active {
                watch.release.notify_one();
            }
            // Capacity re-admission acknowledges completion of the queued old
            // guard/Watch work, rather than assuming yield/sleep is sufficient.
            tokio::time::timeout(std::time::Duration::from_millis(100), async {
                loop {
                    if let Ok(reservation) = owner.reserve(&replacement_context) {
                        drop(reservation);
                        break;
                    }
                    tokio::task::yield_now().await;
                }
            })
            .await
            .unwrap();
            {
                let pending = participant.pending.lock().await;
                let current = pending.as_ref().unwrap();
                assert_eq!(current.root_id, root);
                assert_eq!(current.local_owner, Some(replacement_owner));
                assert!(
                    current.execution_active,
                    "old Watch cleared live replacement execution"
                );
                assert!(!current.terminal_attempted);
            }
            assert_eq!(watch.entered.available_permits(), 0);
            assert!(matches!(
                sidecar.calls.lock().unwrap().as_slice(),
                [Call::Load(_), Call::Load(_)]
            ));
            assert!(
                tokio::time::timeout(
                    std::time::Duration::from_millis(10),
                    participant.lock.shared()
                )
                .await
                .is_err()
            );
            assert!(
                tokio::time::timeout(
                    std::time::Duration::from_millis(10),
                    participant.lock.exclusive()
                )
                .await
                .is_err()
            );
            assert!(
                tokio::time::timeout(
                    std::time::Duration::from_millis(10),
                    participant.prepare(root, true, true)
                )
                .await
                .is_err()
            );
            cancellation.cancel();
            supervisor.join_next().await.unwrap().unwrap().unwrap();
            replacement
                .rollback_declared_leaf(&replacement_context)
                .await
                .unwrap();
            replacement.end_execution().await.unwrap();
            participant.prepare(root, true, true).await.unwrap();
        }
    }

    fn rollback_context(root: Uuid, child: Uuid) -> crate::runtime::TransactionContext {
        let mut headers = crate::RebootHeaders::new("actor/1");
        headers.transaction_ids = Some(vec![root, child]);
        headers.transaction_coordinator_state_type = Some("example.Coordinator".into());
        headers.transaction_coordinator_state_ref = Some("coordinator/1".into());
        headers.coordinator_read_only_aware = true;
        crate::runtime::TransactionContext::from_headers(headers, TransactionMode::Exclusive)
            .unwrap()
    }
    async fn rollback_local(
        participant: &DurableActorParticipant<MockSidecar>,
        root: Uuid,
        child: Uuid,
    ) -> (
        StartedLocalTransaction<MockSidecar>,
        crate::runtime::TransactionContext,
    ) {
        let context = rollback_context(root, child);
        let mut request = start(root);
        request.transaction_ids.push(child);
        request.transaction_path = TransactionPathContract::PreserveNested;
        let mut local = participant
            .start_local(request, ParticipantStartMode::Exclusive)
            .await
            .unwrap();
        local.reserve_live_execution(&context).await.unwrap();
        (local, context)
    }
    #[tokio::test]
    async fn rollback_leaf_atomic_downgrade_retains_until_readonly_prepare() {
        let sidecar = Arc::new(MockSidecar::default());
        *sidecar.load_state.lock().unwrap() = Some(vec![42]);
        let participant = DurableActorParticipant::new(sidecar.clone(), "example.Actor", "actor/1");
        let root = Uuid::new_v4();
        let (local, context) = rollback_local(&participant, root, Uuid::new_v4()).await;
        local.rollback_declared_leaf(&context).await.unwrap();
        assert_eq!(local.state_bytes(), Some(vec![42]));
        let reader = tokio::time::timeout(
            std::time::Duration::from_millis(50),
            participant.lock.shared(),
        )
        .await
        .unwrap();
        assert!(
            tokio::time::timeout(
                std::time::Duration::from_millis(10),
                participant.lock.exclusive()
            )
            .await
            .is_err()
        );
        // Direct Prepare cannot release the downgraded lease while rollback execution is active.
        assert!(
            tokio::time::timeout(
                std::time::Duration::from_millis(10),
                participant.prepare(root, true, true)
            )
            .await
            .is_err()
        );
        local.end_execution().await.unwrap();
        for (read_only, aware) in [(false, false), (false, true), (true, false)] {
            assert!(participant.prepare(root, read_only, aware).await.is_err());
            assert!(participant.pending.lock().await.is_some());
            assert!(
                tokio::time::timeout(
                    std::time::Duration::from_millis(10),
                    participant.lock.exclusive()
                )
                .await
                .is_err(),
                "wrong flags ({read_only}, {aware}) released ownership"
            );
            assert!(matches!(
                sidecar.calls.lock().unwrap().as_slice(),
                [Call::Load(_)]
            ));
        }
        participant.prepare(root, true, true).await.unwrap();
        drop(reader);
        tokio::time::timeout(
            std::time::Duration::from_millis(50),
            participant.lock.exclusive(),
        )
        .await
        .unwrap();
        assert!(matches!(
            sidecar.calls.lock().unwrap().as_slice(),
            [Call::Load(_)]
        ));
    }
    #[tokio::test]
    async fn rollback_leaf_rejects_stale_same_root_exact_incarnation() {
        let sidecar = Arc::new(MockSidecar::default());
        *sidecar.load_state.lock().unwrap() = Some(vec![42]);
        let participant = DurableActorParticipant::new(sidecar.clone(), "example.Actor", "actor/1");
        let root = Uuid::new_v4();
        let child = Uuid::new_v4();
        let (old, context) = rollback_local(&participant, root, child).await;
        *participant.pending.lock().await = None;
        let (replacement, _) = rollback_local(&participant, root, child).await;
        assert!(old.rollback_declared_leaf(&context).await.is_err());
        assert!(
            tokio::time::timeout(
                std::time::Duration::from_millis(10),
                participant.lock.shared()
            )
            .await
            .is_err()
        );
        replacement.rollback_declared_leaf(&context).await.unwrap();
        replacement.end_execution().await.unwrap();
        participant.terminal(root, false).await.unwrap();
    }
    #[tokio::test]
    async fn rollback_leaf_old_guard_watch_cannot_release_live_replacement() {
        use crate::application_host::{HostRecovery, RecoveryCancellation};
        use crate::durable_coordinator::{
            CoordinatorSidecar, DurableRootCoordinator, ParticipantResolver, ParticipantTarget,
        };
        struct UnusedCoordinator;
        impl CoordinatorSidecar for UnusedCoordinator {
            fn coordinator_prepare(
                &self,
                _: database::TransactionCoordinatorPrepareRequest,
            ) -> SidecarFuture<'_, database::TransactionCoordinatorPrepareResponse> {
                panic!("stale guard must not coordinate")
            }
            fn coordinator_prepared(
                &self,
                _: database::TransactionCoordinatorPreparedRequest,
            ) -> SidecarFuture<'_, database::TransactionCoordinatorPreparedResponse> {
                panic!("stale guard must not coordinate")
            }
            fn coordinator_cleanup(
                &self,
                _: database::TransactionCoordinatorCleanupRequest,
            ) -> SidecarFuture<'_, database::TransactionCoordinatorCleanupResponse> {
                panic!("stale guard must not coordinate")
            }
            fn recover(
                &self,
                _: database::RecoverRequest,
            ) -> SidecarFuture<'_, Vec<database::RecoverResponse>> {
                panic!("stale guard must not recover")
            }
        }
        struct UnusedResolver;
        impl ParticipantResolver for UnusedResolver {
            type Endpoint = InProcessParticipantEndpoint<MockSidecar>;
            fn resolve(&self, _: &ParticipantTarget) -> SidecarFuture<'_, Arc<Self::Endpoint>> {
                panic!("stale guard must not resolve")
            }
        }
        struct ControlledWatch {
            entered: tokio::sync::Semaphore,
            release: tokio::sync::Notify,
        }
        impl CoordinatorWatchEndpoint for ControlledWatch {
            fn watch(
                &self,
                _: database::WatchRequest,
            ) -> crate::legacy_coordinator::CoordinatorWatchFuture<'_, database::WatchResponse>
            {
                self.entered.add_permits(1);
                Box::pin(async move {
                    self.release.notified().await;
                    Ok(database::WatchResponse { aborted: false })
                })
            }
        }
        // Exercise the actual consuming guard's queued transfer and an already
        // active old Watch receiving Commit after replacement admission.
        for active in [false, true] {
            let sidecar = Arc::new(MockSidecar::default());
            *sidecar.load_state.lock().unwrap() = Some(vec![42]);
            let participant =
                DurableActorParticipant::new(sidecar.clone(), "example.Actor", "actor/1");
            let root = Uuid::new_v4();
            let child = Uuid::new_v4();
            let mut context = rollback_context(root, child);
            let mut request = start(root);
            request.transaction_ids.push(child);
            request.transaction_path = TransactionPathContract::PreserveNested;
            let local = participant
                .start_local(request, ParticipantStartMode::Exclusive)
                .await
                .unwrap();
            let watch = Arc::new(ControlledWatch {
                entered: tokio::sync::Semaphore::new(0),
                release: tokio::sync::Notify::new(),
            });
            let owner = crate::live_participant::LiveParticipantOwner::new(
                1,
                ParticipantTarget {
                    state_type: "example.Coordinator".into(),
                    state_ref: "coordinator/1".into(),
                },
                watch.clone(),
            )
            .unwrap();
            let cancellation = RecoveryCancellation::new();
            let mut supervisor = tokio::task::JoinSet::new();
            owner
                .recovery_registration()
                .start(&mut supervisor, cancellation.clone())
                .await
                .unwrap();
            let coordinator =
                DurableRootCoordinator::new(Arc::new(UnusedCoordinator), Arc::new(UnusedResolver));
            let guard = crate::explicit_abort::RootHandlerGuard::before_handler(
                local,
                context.clone(),
                coordinator,
                None,
            )
            .await
            .unwrap()
            .with_live_inbound(&mut context, Some(&owner))
            .await
            .unwrap();
            let old_guard = if active {
                drop(guard);
                tokio::time::timeout(
                    std::time::Duration::from_millis(100),
                    watch.entered.acquire(),
                )
                .await
                .unwrap()
                .unwrap()
                .forget();
                None
            } else {
                Some(guard)
            };
            // Explicitly simulate replacement of an incarnation, not a terminal
            // replacement that makes the old guard's no-op uninformative.
            *participant.pending.lock().await = None;
            let (replacement, replacement_context) =
                rollback_local(&participant, root, child).await;
            let replacement_owner = replacement.local_owner;
            drop(old_guard);
            if active {
                watch.release.notify_one();
            }
            // Capacity re-admission acknowledges completion of the queued old
            // guard/Watch work, rather than assuming yield/sleep is sufficient.
            tokio::time::timeout(std::time::Duration::from_millis(100), async {
                loop {
                    if let Ok(reservation) = owner.reserve(&replacement_context) {
                        drop(reservation);
                        break;
                    }
                    tokio::task::yield_now().await;
                }
            })
            .await
            .unwrap();
            {
                let pending = participant.pending.lock().await;
                let current = pending.as_ref().unwrap();
                assert_eq!(current.root_id, root);
                assert_eq!(current.local_owner, Some(replacement_owner));
                assert!(
                    current.execution_active,
                    "old Watch cleared live replacement execution"
                );
                assert!(!current.terminal_attempted);
            }
            assert_eq!(watch.entered.available_permits(), 0);
            assert!(matches!(
                sidecar.calls.lock().unwrap().as_slice(),
                [Call::Load(_), Call::Load(_)]
            ));
            assert!(
                tokio::time::timeout(
                    std::time::Duration::from_millis(10),
                    participant.lock.shared()
                )
                .await
                .is_err()
            );
            assert!(
                tokio::time::timeout(
                    std::time::Duration::from_millis(10),
                    participant.lock.exclusive()
                )
                .await
                .is_err()
            );
            assert!(
                tokio::time::timeout(
                    std::time::Duration::from_millis(10),
                    participant.prepare(root, true, true)
                )
                .await
                .is_err()
            );
            cancellation.cancel();
            supervisor.join_next().await.unwrap().unwrap().unwrap();
            replacement
                .rollback_declared_leaf(&replacement_context)
                .await
                .unwrap();
            replacement.end_execution().await.unwrap();
            participant.prepare(root, true, true).await.unwrap();
        }
    }
    #[tokio::test]
    async fn rollback_leaf_rejects_staging_and_changed_path() {
        for staged in [false, true] {
            let sidecar = Arc::new(MockSidecar::default());
            *sidecar.load_state.lock().unwrap() = Some(vec![42]);
            let participant =
                DurableActorParticipant::new(sidecar.clone(), "example.Actor", "actor/1");
            let root = Uuid::new_v4();
            let (local, context) = rollback_local(&participant, root, Uuid::new_v4()).await;
            if staged {
                local
                    .stage(PendingActorEffects {
                        state: Some(vec![99]),
                        task_upserts: vec![database::Task::default()],
                        ..Default::default()
                    })
                    .await
                    .unwrap();
                assert!(local.rollback_declared_leaf(&context).await.is_err());
            } else {
                assert!(
                    local
                        .rollback_declared_leaf(&rollback_context(root, Uuid::new_v4()))
                        .await
                        .is_err()
                );
            }
            assert!(
                tokio::time::timeout(
                    std::time::Duration::from_millis(10),
                    participant.lock.shared()
                )
                .await
                .is_err()
            );
            local.end_execution().await.unwrap();
            participant.terminal(root, false).await.unwrap();
        }
    }

    fn execution_context(id: Uuid) -> crate::runtime::TransactionContext {
        let mut headers = crate::RebootHeaders::new("actor/1");
        headers.transaction_ids = Some(vec![id]);
        headers.transaction_coordinator_state_type = Some("example.Coordinator".into());
        headers.transaction_coordinator_state_ref = Some("coordinator/1".into());
        crate::runtime::TransactionContext::from_headers(headers, TransactionMode::Exclusive)
            .unwrap()
    }
    #[tokio::test]
    async fn live_execution_blocks_all_controls_and_staging_after_prepare() {
        for prepare in [false, true] {
            let sidecar = Arc::new(MockSidecar::default());
            let participant =
                DurableActorParticipant::new(sidecar.clone(), "example.Actor", "actor/1");
            let id = Uuid::new_v4();
            let mut local = participant
                .start_local(start(id), ParticipantStartMode::Exclusive)
                .await
                .unwrap();
            let _execution = local
                .reserve_live_execution(&execution_context(id))
                .await
                .unwrap();
            assert!(
                tokio::time::timeout(std::time::Duration::from_millis(10), async {
                    if prepare {
                        participant.prepare(id, false, false).await.map(|_| ())
                    } else {
                        participant.terminal(id, false).await
                    }
                })
                .await
                .is_err()
            );
            assert!(matches!(
                sidecar.calls.lock().unwrap().as_slice(),
                [Call::Load(_)]
            ));
            local
                .stage(PendingActorEffects {
                    state: Some(vec![7]),
                    ..Default::default()
                })
                .await
                .unwrap();
            local.end_execution().await.unwrap();
            if prepare {
                participant.prepare(id, false, false).await.unwrap();
                assert!(
                    participant
                        .stage(id, PendingActorEffects::default())
                        .await
                        .is_err()
                );
                assert!(
                    matches!(&sidecar.calls.lock().unwrap()[1], Call::Prepare(request) if request.state.as_deref() == Some(&[7]))
                );
            } else {
                participant.terminal(id, false).await.unwrap();
            }
        }
    }
    #[tokio::test]
    async fn live_terminal_lost_ack_is_once_retained_and_prepare_staging_rejected() {
        let sidecar = Arc::new(MockSidecar::default());
        sidecar
            .terminal_results
            .lock()
            .unwrap()
            .push_back(Err(Status::unavailable("lost ACK")));
        let participant = DurableActorParticipant::new(sidecar.clone(), "example.Actor", "actor/1");
        let id = Uuid::new_v4();
        let mut local = participant
            .start_local(start(id), ParticipantStartMode::Exclusive)
            .await
            .unwrap();
        let execution = local
            .reserve_live_execution(&execution_context(id))
            .await
            .unwrap();
        local.end_execution().await.unwrap();
        for _ in 0..2 {
            assert!(
                participant
                    .terminal_live(id, local.local_owner, false)
                    .await
                    .is_err()
            );
        }
        assert!(participant.prepare(id, false, false).await.is_err());
        assert!(
            participant
                .stage(id, PendingActorEffects::default())
                .await
                .is_err()
        );
        assert!(matches!(
            sidecar.calls.lock().unwrap().as_slice(),
            [Call::Load(_), Call::Abort(_)]
        ));
        assert!(
            tokio::time::timeout(
                std::time::Duration::from_millis(10),
                participant.start(start(Uuid::new_v4()))
            )
            .await
            .is_err()
        );
        let watch = Arc::new(MockWatch::default());
        let error = execution.watch(watch.clone()).await.unwrap_err();
        assert_eq!(error.code(), tonic::Code::Unavailable);
        assert_eq!(
            error.message(),
            "terminal ACK uncertain; ownership retained, no retry"
        );
        assert!(watch.requests.lock().unwrap().is_empty());
        assert!(matches!(
            sidecar.calls.lock().unwrap().as_slice(),
            [Call::Load(_), Call::Abort(_)]
        ));
        assert!(participant.pending.lock().await.is_some());
    }
    #[tokio::test]
    async fn stale_live_terminal_does_not_wait_on_same_uuid_active_replacement() {
        let sidecar = Arc::new(MockSidecar::default());
        let participant = DurableActorParticipant::new(sidecar.clone(), "example.Actor", "actor/1");
        let id = Uuid::new_v4();
        let mut old = participant
            .start_local(start(id), ParticipantStartMode::Exclusive)
            .await
            .unwrap();
        let _execution = old
            .reserve_live_execution(&execution_context(id))
            .await
            .unwrap();
        old.end_execution().await.unwrap();
        participant
            .terminal_live(id, old.local_owner, false)
            .await
            .unwrap();
        let mut replacement = participant
            .start_local(start(id), ParticipantStartMode::Exclusive)
            .await
            .unwrap();
        let _execution = replacement
            .reserve_live_execution(&execution_context(id))
            .await
            .unwrap();
        assert!(
            !tokio::time::timeout(
                std::time::Duration::from_millis(10),
                participant.terminal_live(id, old.local_owner, false)
            )
            .await
            .unwrap()
            .unwrap()
        );
        assert!(matches!(
            sidecar.calls.lock().unwrap().as_slice(),
            [Call::Load(_), Call::Abort(_), Call::Load(_)]
        ));
        assert!(
            tokio::time::timeout(
                std::time::Duration::from_millis(10),
                participant.start(start(Uuid::new_v4()))
            )
            .await
            .is_err()
        );
        replacement.end_execution().await.unwrap();
        participant
            .terminal_live(id, replacement.local_owner, false)
            .await
            .unwrap();
    }

    #[tokio::test]
    async fn expired_queued_read_only_prepare_cannot_release_descendant_lease() {
        for fenced in [false, true] {
            let sidecar = Arc::new(MockSidecar::default());
            *sidecar.load_state.lock().unwrap() = Some(vec![40]);
            let participant = DurableActorParticipant::new(sidecar, "example.Actor", "actor/1");
            let root = Uuid::new_v4();
            let nested = Uuid::new_v4();
            let (local, context) = rollback_local(&participant, root, nested).await;
            let deadline = tokio::time::Instant::now() + std::time::Duration::from_millis(10);
            let mut queued = Box::pin(participant.prepare_with_deadline(
                root,
                true,
                true,
                fenced.then_some(deadline),
            ));
            assert!(
                tokio::time::timeout(std::time::Duration::from_millis(20), &mut queued)
                    .await
                    .is_err()
            );
            local.rollback_declared_leaf(&context).await.unwrap();
            local.end_execution().await.unwrap();
            let outcome = queued.await;
            if fenced {
                assert!(
                    matches!(outcome,Err(error) if error.code()==tonic::Code::DeadlineExceeded)
                );
                assert!(participant.pending.lock().await.is_some());
                assert!(
                    tokio::time::timeout(
                        std::time::Duration::from_millis(10),
                        participant.lock.exclusive()
                    )
                    .await
                    .is_err(),
                    "expired probe released C lease"
                );
                participant.prepare(root, true, true).await.unwrap();
            } else {
                assert!(matches!(outcome, Ok(PrepareOutcome::Prepared)));
                assert!(
                    participant.pending.lock().await.is_none(),
                    "unfenced surviving probe must reproduce premature read-only release"
                );
            }
            assert!(
                tokio::time::timeout(
                    std::time::Duration::from_millis(100),
                    participant.lock.exclusive()
                )
                .await
                .is_ok()
            );
        }
    }

    struct AdmissionBinding;
    #[tonic::async_trait]
    impl crate::one_shot_tasks::ReaderTaskBinding for AdmissionBinding {
        fn validate(&self, task: &database::Task) -> Result<(), Status> {
            use prost::Message;
            crate::proto::Counter::decode(task.request.as_slice())
                .map(|_| ())
                .map_err(|_| Status::invalid_argument("malformed test request"))
        }
        async fn execute(&self, _: &database::Task) -> Result<prost_types::Any, Status> {
            panic!("unstaged tasks must not dispatch")
        }
    }
    struct AdmissionResolver;
    impl crate::durable_coordinator::ParticipantResolver for AdmissionResolver {
        type Endpoint = crate::durable_coordinator::TonicParticipantEndpoint;
        fn resolve(
            &self,
            _: &crate::durable_coordinator::ParticipantTarget,
        ) -> SidecarFuture<'_, Arc<Self::Endpoint>> {
            panic!("staging test must not resolve")
        }
    }
    struct AdmissionWatch;
    impl CoordinatorWatchEndpoint for AdmissionWatch {
        fn watch(
            &self,
            _: database::WatchRequest,
        ) -> crate::legacy_coordinator::CoordinatorWatchFuture<'_, database::WatchResponse>
        {
            Box::pin(std::future::pending())
        }
    }
    fn admission_task() -> database::Task {
        use prost::Message;
        database::Task {
            task_id: Some(database::TaskId {
                state_type: "example.Actor".into(),
                state_ref: "actor/1".into(),
                task_uuid: Uuid::new_v4().as_bytes().to_vec(),
            }),
            method: "Query".into(),
            request: crate::proto::Counter { value: 8 }.encode_to_vec(),
            status: database::task::Status::Pending as i32,
            ..Default::default()
        }
    }
    fn admission_recovery() -> database::RecoverRequest {
        database::RecoverRequest {
            shard_ids: vec!["s000000000".into()],
            state_tags_by_state_type: [("example.Actor".into(), "test".into())].into(),
            skip_idempotent_mutations: true,
        }
    }
    #[tokio::test]
    async fn reusable_registered_root_stages_state_and_task_without_inbound_watch() {
        use crate::application_host::{HostRecovery, RecoveryCancellation};
        use crate::durable_coordinator::{DurableRootCoordinator, TonicCoordinatorSidecar};
        for task_bearing in [false, true] {
            let (endpoint, database, server) = crate::runtime::test_support::start_database().await;
            database.seed_actor("example.Actor", "actor/1", vec![0]);
            let store = crate::runtime::DatabaseActorStore::connect_lazy(&endpoint).unwrap();
            let participant = DurableActorParticipant::new(
                Arc::new(TonicParticipantSidecar::connect(&endpoint).await.unwrap()),
                "example.Actor",
                "actor/1",
            )
            .with_database_actor_gate(&store);
            let coordinator = DurableRootCoordinator::new(
                Arc::new(TonicCoordinatorSidecar::connect(&endpoint).await.unwrap()),
                Arc::new(AdmissionResolver),
            );
            let tasks = crate::one_shot_tasks::OneShotTasks::new(
                store,
                "example.Actor".into(),
                "actor/1".into(),
                AdmissionBinding,
            )
            .unwrap();
            let (task_cancel, _readiness) = RecoveryCancellation::test_host();
            let mut task_supervisor = tokio::task::JoinSet::new();
            tasks
                .recovery(admission_recovery())
                .start(&mut task_supervisor, task_cancel.clone())
                .await
                .unwrap();
            let owner = crate::explicit_abort::ExplicitAbortOwner::new(1).unwrap();
            let root_cancel = RecoveryCancellation::new();
            let mut root_supervisor = tokio::task::JoinSet::new();
            owner
                .recovery_registration()
                .start(&mut root_supervisor, root_cancel.clone())
                .await
                .unwrap();
            let root = Uuid::new_v4();
            let mut context = crate::runtime::RootTransactionContext::start(
                crate::RebootHeaders::new("actor/1"),
                "example.Actor",
                TransactionMode::Exclusive,
                root,
                prost_types::Timestamp::default(),
            )
            .unwrap()
            .transaction()
            .clone();
            let coordinator = coordinator.with_identity(participant.actor_target());
            let registration = crate::explicit_abort::RegisteredRoot::before_load(
                &participant,
                context.clone(),
                coordinator.clone(),
                Some(&owner),
            )
            .unwrap();
            let mut request = start(root);
            request.coordinator_state_type = "example.Actor".into();
            request.coordinator_state_ref = "actor/1".into();
            let local = participant
                .start_local_reusable(request, ParticipantStartMode::Exclusive, true)
                .await
                .unwrap();
            let mut guard = registration
                .admitted(local)
                .await
                .unwrap()
                .with_sequential_reusable_participants(&mut context, None)
                .await
                .unwrap();
            let batch = if task_bearing {
                vec![admission_task()]
            } else {
                vec![]
            };
            if task_bearing {
                guard.validate_staged_tasks(&tasks, &batch).await.unwrap();
            }
            guard
                .stage_effects(PendingActorEffects {
                    state: Some(vec![9]),
                    task_upserts: batch.clone(),
                    ..Default::default()
                })
                .await
                .unwrap();
            {
                let pending = participant.pending.lock().await;
                let current = pending.as_ref().unwrap();
                assert!(current.execution_active && current.staged);
                assert_eq!(current.transaction_ids, vec![root]);
                assert!(
                    current.reusable.is_none(),
                    "fresh root must not become a retained leaf"
                );
                assert_eq!(current.effects.state, Some(vec![9]));
                assert_eq!(current.effects.task_upserts, batch);
            }
            guard.test_handoff();
            drop(guard);
            task_cancel.cancel();
            root_cancel.cancel();
            task_supervisor.join_next().await.unwrap().unwrap().unwrap();
            root_supervisor.join_next().await.unwrap().unwrap().unwrap();
            *participant.pending.lock().await = None;
            server.abort();
            let _ = server.await;
        }
    }
    #[tokio::test]
    async fn reusable_task_load_resume_rejects_stopped_dispatcher_with_live_guard() {
        use crate::application_host::{HostRecovery, RecoveryCancellation};
        use crate::durable_coordinator::{
            DurableRootCoordinator, ParticipantTarget, TonicCoordinatorSidecar,
        };
        let (endpoint, database, server) = crate::runtime::test_support::start_database().await;
        database.seed_actor("example.Actor", "actor/1", vec![0]);
        let store = crate::runtime::DatabaseActorStore::connect_lazy(&endpoint).unwrap();
        let participant = DurableActorParticipant::new(
            Arc::new(TonicParticipantSidecar::connect(&endpoint).await.unwrap()),
            "example.Actor",
            "actor/1",
        )
        .with_database_actor_gate(&store);
        let coordinator = DurableRootCoordinator::new(
            Arc::new(TonicCoordinatorSidecar::connect(&endpoint).await.unwrap()),
            Arc::new(AdmissionResolver),
        );
        let tasks = crate::one_shot_tasks::OneShotTasks::new(
            store,
            "example.Actor".into(),
            "actor/1".into(),
            AdmissionBinding,
        )
        .unwrap();
        let (task_cancel, _readiness) = RecoveryCancellation::test_host();
        let mut task_supervisor = tokio::task::JoinSet::new();
        tasks
            .recovery(admission_recovery())
            .start(&mut task_supervisor, task_cancel.clone())
            .await
            .unwrap();
        let root = Uuid::new_v4();
        let nested = Uuid::new_v4();
        let mut context = rollback_context(root, nested);
        let local = participant
            .start_local_reusable(
                reusable_request(root, nested),
                ParticipantStartMode::Exclusive,
                true,
            )
            .await
            .unwrap();
        let owner = crate::live_participant::LiveParticipantOwner::new(
            1,
            ParticipantTarget {
                state_type: "example.Coordinator".into(),
                state_ref: "coordinator/1".into(),
            },
            Arc::new(AdmissionWatch),
        )
        .unwrap();
        let live_cancel = RecoveryCancellation::new();
        let mut live_supervisor = tokio::task::JoinSet::new();
        owner
            .recovery_registration()
            .start(&mut live_supervisor, live_cancel.clone())
            .await
            .unwrap();
        let guard = crate::explicit_abort::RootHandlerGuard::before_handler(
            local,
            context.clone(),
            coordinator,
            None,
        )
        .await
        .unwrap()
        .with_sequential_reusable_participants(&mut context, Some(&owner))
        .await
        .unwrap();
        let task = admission_task();
        guard
            .validate_staged_tasks(&tasks, std::slice::from_ref(&task))
            .await
            .unwrap();
        let (entered, release) = database.park_task_load();
        let mut staging = Box::pin(guard.stage_effects(PendingActorEffects {
            state: Some(vec![99]),
            task_upserts: vec![task],
            ..Default::default()
        }));
        tokio::select! { result = &mut staging => panic!("staging returned before real Load park: {result:?}"), result = entered => result.unwrap() }
        task_cancel.cancel();
        task_supervisor.join_next().await.unwrap().unwrap().unwrap();
        assert!(
            guard.validate_tree_tasks(&tasks).await.is_ok(),
            "participant/live owner must remain independently active"
        );
        release.send(()).unwrap();
        assert_eq!(
            staging.await.unwrap_err().code(),
            tonic::Code::FailedPrecondition
        );
        {
            let pending = participant.pending.lock().await;
            let current = pending.as_ref().unwrap();
            assert!(current.execution_active);
            assert!(!current.staged);
            assert_eq!(current.effects.state, None);
            assert!(current.effects.task_upserts.is_empty());
        }
        drop(guard);
        live_cancel.cancel();
        live_supervisor.join_next().await.unwrap().unwrap().unwrap();
        *participant.pending.lock().await = None;
        server.abort();
        let _ = server.await;
    }

    fn reusable_request(root: Uuid, nested: Uuid) -> ActorTransactionStart {
        let mut request = start(root);
        request.transaction_ids.push(nested);
        request.transaction_path = TransactionPathContract::PreserveNested;
        request
    }

    #[tokio::test]
    async fn reusable_rfix_atomic_publication_blocks_early_controls() {
        for abort in [false, true] {
            let sidecar = Arc::new(MockSidecar::default());
            *sidecar.load_state.lock().unwrap() = Some(vec![0]);
            let (entered_tx, entered_rx) = tokio::sync::oneshot::channel();
            let (release_tx, release_rx) = tokio::sync::oneshot::channel();
            *sidecar.load_park.lock().unwrap() = Some((entered_tx, release_rx));
            let participant =
                DurableActorParticipant::new(sidecar.clone(), "example.Actor", "actor/1");
            let root = Uuid::new_v4();
            let p = participant.clone();
            let admission = tokio::spawn(async move {
                p.start_local_reusable(
                    reusable_request(root, Uuid::new_v4()),
                    ParticipantStartMode::Exclusive,
                    true,
                )
                .await
            });
            entered_rx.await.unwrap();
            let p = participant.clone();
            let mut control = tokio::spawn(async move {
                if abort {
                    p.abort(root).await
                } else {
                    p.prepare_for_test(root).await
                }
            });
            // Poll the queued control while Load owns the actual pending mutex.
            assert!(
                tokio::time::timeout(std::time::Duration::from_millis(20), &mut control)
                    .await
                    .is_err()
            );
            release_tx.send(()).unwrap();
            let local = admission.await;
            let crossed =
                tokio::time::timeout(std::time::Duration::from_millis(30), &mut control).await;
            let protected = crossed.is_err();
            if let Ok(Ok(local)) = local {
                drop(local);
            }
            if protected {
                let _ = tokio::time::timeout(std::time::Duration::from_secs(1), &mut control)
                    .await
                    .unwrap();
            }
            assert!(
                protected,
                "early control crossed original reusable Pending publication before guard admission"
            );
            assert!(
                !sidecar
                    .calls
                    .lock()
                    .unwrap()
                    .iter()
                    .any(|call| matches!(call, Call::Prepare(_))),
                "empty uncertified effects reached Prepare"
            );
            // Cancellation/replacement remains usable and no delayed initializer touches it.
            let replacement = participant
                .start_local(start(Uuid::new_v4()), ParticipantStartMode::Exclusive)
                .await
                .unwrap();
            drop(replacement);
        }
    }

    #[tokio::test]
    async fn reusable_rfix_first_touch_reservation_fences_same_root_legacy_and_reuse() {
        for legacy in [false, true] {
            let sidecar = Arc::new(MockSidecar::default());
            *sidecar.load_state.lock().unwrap() = Some(vec![0]);
            let (entered_tx, entered_rx) = tokio::sync::oneshot::channel();
            let (release_tx, release_rx) = tokio::sync::oneshot::channel();
            *sidecar.load_park.lock().unwrap() = Some((entered_tx, release_rx));
            let participant =
                DurableActorParticipant::new(sidecar.clone(), "example.Actor", "actor/1");
            let root = Uuid::new_v4();
            let p = participant.clone();
            let first = tokio::spawn(async move {
                p.start_local_reusable(
                    reusable_request(root, Uuid::new_v4()),
                    ParticipantStartMode::Exclusive,
                    true,
                )
                .await
            });
            entered_rx.await.unwrap();
            let p = participant.clone();
            let mut second = tokio::spawn(async move {
                let s = reusable_request(root, Uuid::new_v4());
                if legacy {
                    p.start_local(s, ParticipantStartMode::Exclusive).await
                } else {
                    p.start_local_reusable(s, ParticipantStartMode::Exclusive, true)
                        .await
                }
            });
            let early =
                tokio::time::timeout(std::time::Duration::from_millis(50), &mut second).await;
            let rejected = matches!(&early, Ok(Ok(Err(status))) if status.code() == tonic::Code::FailedPrecondition);
            release_tx.send(()).unwrap();
            let first = first.await.unwrap().unwrap();
            let p = participant.clone();
            let mut different = tokio::spawn(async move {
                p.start_local(start(Uuid::new_v4()), ParticipantStartMode::Exclusive)
                    .await
            });
            assert!(
                tokio::time::timeout(std::time::Duration::from_millis(20), &mut different)
                    .await
                    .is_err(),
                "different root lost normal actor serialization"
            );
            drop(first);
            if early.is_err() {
                drop(
                    tokio::time::timeout(std::time::Duration::from_secs(1), &mut second)
                        .await
                        .unwrap()
                        .unwrap(),
                );
            }
            drop(
                tokio::time::timeout(std::time::Duration::from_secs(1), &mut different)
                    .await
                    .unwrap()
                    .unwrap()
                    .unwrap(),
            );
            assert!(
                rejected,
                "same-root contender remained parked behind Load/root-retained lease"
            );
        }
    }

    #[tokio::test]
    async fn reusable_rfix_preguard_cancel_restores_n1_snapshot_and_watch() {
        let sidecar = Arc::new(MockSidecar::default());
        *sidecar.load_state.lock().unwrap() = Some(vec![0]);
        let participant = DurableActorParticipant::new(sidecar.clone(), "example.Actor", "actor/1");
        let root = Uuid::new_v4();
        let n1 = Uuid::new_v4();
        let mut first = participant
            .start_local_reusable(
                reusable_request(root, n1),
                ParticipantStartMode::Exclusive,
                true,
            )
            .await
            .unwrap();
        let execution = first
            .reserve_live_execution(&rollback_context(root, n1))
            .await
            .unwrap();
        first
            .stage(PendingActorEffects {
                state: Some(vec![1]),
                ..Default::default()
            })
            .await
            .unwrap();
        participant
            .relinquish(root, n1, false, Some(first.local_owner))
            .await
            .unwrap();
        let n2 = Uuid::new_v4();
        let second = participant
            .start_local_reusable(
                reusable_request(root, n2),
                ParticipantStartMode::Exclusive,
                true,
            )
            .await
            .unwrap();
        let rejected = second
            .stage(PendingActorEffects {
                state: Some(vec![9]),
                ..Default::default()
            })
            .await
            .is_err();
        drop(second);
        let restored = tokio::time::timeout(std::time::Duration::from_secs(1), async {
            loop {
                let notified = participant.changed.notified();
                tokio::pin!(notified);
                notified.as_mut().enable();
                {
                    let pending = participant.pending.lock().await;
                    let current = pending.as_ref().unwrap();
                    if !current.execution_active {
                        return current.effects.state == Some(vec![1])
                            && current.transaction_ids == vec![root]
                            && current.disposition == PendingDisposition::Commit
                            && current.reusable.as_ref().unwrap().watch_claimed
                            && current.matches_live_owner(execution.owner)
                            && !current.reusable.as_ref().unwrap().admitting;
                    }
                }
                notified.await;
            }
        })
        .await
        .unwrap();
        participant.prepare_for_test(root).await.unwrap();
        let prepared_state = {
            let calls = sidecar.calls.lock().unwrap();
            calls.iter().find_map(|call| match call {
                Call::Prepare(request) => request.state.clone(),
                _ => None,
            })
        };
        participant.abort(root).await.unwrap();
        assert!(rejected, "unguarded admitting N2 obtained effect authority");
        assert!(
            restored,
            "cancelled preguard N2 retained effects/path or lost stable N1 Watch"
        );
        assert_eq!(
            prepared_state,
            Some(vec![1]),
            "uncertified N2 effects reached Prepare"
        );
    }

    #[tokio::test]
    async fn reusable_snapshots_accumulate_and_fence_delayed_calls() {
        for aborted in [false, true] {
            let sidecar = Arc::new(MockSidecar::default());
            *sidecar.load_state.lock().unwrap() = Some(vec![0]);
            let participant =
                DurableActorParticipant::new(sidecar.clone(), "example.Actor", "actor/1");
            let root = Uuid::new_v4();
            let n1 = Uuid::new_v4();
            let n2 = Uuid::new_v4();
            let request = |nested| {
                let mut s = start(root);
                s.transaction_ids.push(nested);
                s.transaction_path = TransactionPathContract::PreserveNested;
                s
            };
            let task = |uuid: Uuid| database::Task {
                task_id: Some(database::TaskId {
                    state_type: "example.Actor".into(),
                    state_ref: "actor/1".into(),
                    task_uuid: uuid.as_bytes().to_vec(),
                }),
                ..Default::default()
            };
            let t1 = task(Uuid::new_v4());
            let t2 = task(Uuid::new_v4());
            let mut first = participant
                .start_local_reusable(request(n1), ParticipantStartMode::Exclusive, true)
                .await
                .unwrap();
            let first_execution = first
                .reserve_live_execution(&rollback_context(root, n1))
                .await
                .unwrap();
            first
                .stage_mock_validated(PendingActorEffects {
                    state: Some(vec![1]),
                    task_upserts: vec![t1.clone()],
                    ..Default::default()
                })
                .await
                .unwrap();
            participant
                .relinquish(root, n1, false, Some(first.local_owner))
                .await
                .unwrap();
            let mut second = participant
                .start_local_reusable(request(n2), ParticipantStartMode::Exclusive, true)
                .await
                .unwrap();
            assert_eq!(second.state(), Some([1].as_slice()));
            let second_execution = second
                .reserve_live_execution(&rollback_context(root, n2))
                .await
                .unwrap();
            assert!(
                participant
                    .start_local_reusable(
                        request(Uuid::new_v4()),
                        ParticipantStartMode::Exclusive,
                        true
                    )
                    .await
                    .is_err()
            );
            participant.relinquish(root, n1, false, None).await.unwrap();
            assert!(participant.relinquish(root, n1, true, None).await.is_err());
            assert!(participant.relinquish(root, n2, true, None).await.is_err());
            // Same-root old Drop can neither end N2 nor release its gate.
            drop(first);
            tokio::task::yield_now().await;
            assert!(
                participant
                    .pending
                    .lock()
                    .await
                    .as_ref()
                    .unwrap()
                    .execution_active
            );
            assert!(
                tokio::time::timeout(
                    std::time::Duration::from_millis(10),
                    participant.prepare(root, true, false)
                )
                .await
                .is_err()
            );
            second
                .stage_mock_validated(PendingActorEffects {
                    state: Some(vec![2]),
                    task_upserts: vec![t2.clone()],
                    ..Default::default()
                })
                .await
                .unwrap();
            assert!(first_execution.watch_new);
            assert!(!second_execution.watch_new);
            participant
                .relinquish(root, n2, aborted, Some(second.local_owner))
                .await
                .unwrap();
            let pending = participant.pending.lock().await;
            let current = pending.as_ref().unwrap();
            assert_eq!(
                current.effects.state,
                Some(vec![if aborted { 1 } else { 2 }])
            );
            assert_eq!(
                current.effects.task_upserts,
                if aborted { vec![t1] } else { vec![t1, t2] }
            );
            assert_eq!(current.disposition, PendingDisposition::Commit);
            assert_eq!(current.transaction_ids, vec![root]);
            assert_eq!(
                sidecar
                    .calls
                    .lock()
                    .unwrap()
                    .iter()
                    .filter(|call| matches!(call, Call::Load(_)))
                    .count(),
                1,
                "N2 never reloads committed state"
            );
            drop(pending);
            participant.abort(root).await.unwrap();
        }
    }

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
        park_abort: bool,
        load_park: Mutex<
            Option<(
                tokio::sync::oneshot::Sender<()>,
                tokio::sync::oneshot::Receiver<()>,
            )>,
        >,
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
            let park = self.load_park.lock().unwrap().take();
            Box::pin(async move {
                if let Some((entered, release)) = park {
                    entered.send(()).unwrap();
                    release.await.unwrap();
                }
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
                if self.park_abort {
                    std::future::pending::<()>().await;
                }
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

    #[tokio::test]
    async fn consuming_local_abort_rejects_same_uuid_replacement_without_terminal_rpc() {
        let sidecar = Arc::new(MockSidecar::default());
        let participant = DurableActorParticipant::new(sidecar.clone(), "example.Actor", "actor/1");
        let id = Uuid::new_v4();
        let mut old = participant
            .start_local(start(id), ParticipantStartMode::Exclusive)
            .await
            .unwrap();
        let replacement = Uuid::new_v4();
        participant
            .pending
            .lock()
            .await
            .as_mut()
            .unwrap()
            .local_owner = Some(replacement);
        assert_eq!(
            old.abort_legacy().await.unwrap_err().code(),
            tonic::Code::FailedPrecondition
        );
        drop(old);
        tokio::task::yield_now().await;
        assert_eq!(
            participant
                .pending
                .lock()
                .await
                .as_ref()
                .unwrap()
                .local_owner,
            Some(replacement)
        );
        assert!(
            sidecar
                .calls
                .lock()
                .unwrap()
                .iter()
                .all(|call| !matches!(call, Call::Abort(_)))
        );
        assert!(
            tokio::time::timeout(
                std::time::Duration::from_millis(20),
                participant.start_local(start(Uuid::new_v4()), ParticipantStartMode::Exclusive)
            )
            .await
            .is_err()
        );
    }

    #[tokio::test]
    async fn handler_cancellation_rejects_stale_incarnation_and_both_handoff_paths() {
        for phase in ["stale", "handoff", "prepare"] {
            let sidecar = Arc::new(MockSidecar::default());
            let participant =
                DurableActorParticipant::new(sidecar.clone(), "example.Actor", "actor/1");
            let id = Uuid::new_v4();
            let mut root_start = start(id);
            root_start.coordinator_state_type = "example.Actor".into();
            root_start.coordinator_state_ref = "actor/1".into();
            let mut local = participant
                .start_local(root_start, ParticipantStartMode::Exclusive)
                .await
                .unwrap();
            let root = crate::runtime::RootTransactionContext::start(
                crate::RebootHeaders::new("actor/1"),
                "example.Actor",
                TransactionMode::Exclusive,
                id,
                prost_types::Timestamp::default(),
            )
            .unwrap();
            let replacement = Uuid::new_v4();
            if phase == "stale" {
                participant
                    .pending
                    .lock()
                    .await
                    .as_mut()
                    .unwrap()
                    .local_owner = Some(replacement);
                assert!(
                    local
                        .reserve_handler_cancellation(root.transaction())
                        .await
                        .is_err()
                );
                drop(local);
                tokio::task::yield_now().await;
                assert_eq!(
                    participant
                        .pending
                        .lock()
                        .await
                        .as_ref()
                        .unwrap()
                        .local_owner,
                    Some(replacement)
                );
            } else {
                local
                    .reserve_handler_cancellation(root.transaction())
                    .await
                    .unwrap();
                if phase == "handoff" {
                    local.handoff_to_durable_recovery();
                } else {
                    local.disarm_after_durable_prepare();
                }
                assert!(!local.cancellation_authority);
                assert!(
                    local
                        .begin_explicit_root_abort(root.transaction())
                        .await
                        .is_err()
                );
                drop(local);
                assert!(participant.pending.lock().await.is_some());
            }
            assert!(
                sidecar
                    .calls
                    .lock()
                    .unwrap()
                    .iter()
                    .all(|call| !matches!(call, Call::Abort(_)))
            );
        }
    }

    #[tokio::test]
    async fn explicit_abort_holds_incarnation_lock_through_ack_or_cancel() {
        let sidecar = Arc::new(MockSidecar {
            park_abort: true,
            ..Default::default()
        });
        let participant =
            DurableActorParticipant::new(Arc::clone(&sidecar), "example.Actor", "actor/1");
        let id = Uuid::new_v4();
        let mut root_start = start(id);
        root_start.coordinator_state_type = "example.Actor".into();
        root_start.coordinator_state_ref = "actor/1".into();
        let mut local = participant
            .start_local(root_start, ParticipantStartMode::Exclusive)
            .await
            .unwrap();
        let root = crate::runtime::RootTransactionContext::start(
            crate::RebootHeaders::new("actor/1"),
            "example.Actor",
            TransactionMode::Exclusive,
            id,
            prost_types::Timestamp::default(),
        )
        .unwrap();
        local
            .begin_explicit_root_abort(root.transaction())
            .await
            .unwrap();
        let mut terminal = Box::pin(local.acknowledge_explicit_root_abort());
        tokio::select! {
            biased;
            result = &mut terminal => panic!("parked terminal returned: {result:?}"),
            _ = tokio::task::yield_now() => {}
        }
        assert!(participant.pending.try_lock().is_err());
        assert!(
            sidecar
                .calls
                .lock()
                .unwrap()
                .iter()
                .any(|call| matches!(call, Call::Abort(_)))
        );
        drop(terminal);
        let owner = local.local_owner;
        drop(local);
        tokio::task::yield_now().await;
        assert_eq!(
            participant
                .pending
                .lock()
                .await
                .as_ref()
                .unwrap()
                .local_owner,
            Some(owner)
        );
    }

    #[tokio::test]
    async fn explicit_abort_rechecks_local_owner_and_preserves_replacement() {
        let sidecar = Arc::new(MockSidecar::default());
        let participant =
            DurableActorParticipant::new(Arc::clone(&sidecar), "example.Actor", "actor/1");
        let id = Uuid::new_v4();
        let mut root_start = start(id);
        root_start.coordinator_state_type = "example.Actor".into();
        root_start.coordinator_state_ref = "actor/1".into();
        let mut local = participant
            .start_local(root_start.clone(), ParticipantStartMode::Exclusive)
            .await
            .unwrap();
        let root = crate::runtime::RootTransactionContext::start(
            crate::RebootHeaders::new("actor/1"),
            "example.Actor",
            TransactionMode::Exclusive,
            id,
            prost_types::Timestamp::default(),
        )
        .unwrap();
        let original = local.local_owner;
        // Simulate a stale capability before admission: no seal or external RPC.
        let replacement = Uuid::new_v4();
        participant
            .pending
            .lock()
            .await
            .as_mut()
            .unwrap()
            .local_owner = Some(replacement);
        assert!(
            local
                .begin_explicit_root_abort(root.transaction())
                .await
                .is_err()
        );
        let mut outbound = root.transaction().begin_generated_outbound().unwrap();
        outbound.test_terminal_state_setup();
        drop(outbound);
        participant
            .pending
            .lock()
            .await
            .as_mut()
            .unwrap()
            .local_owner = Some(original);
        local
            .begin_explicit_root_abort(root.transaction())
            .await
            .unwrap();
        // A terminal control can release the original before the decision await
        // returns, and a same-UUID start can install a different local owner.
        participant.abort(id).await.unwrap();
        let next = participant
            .start_local(root_start, ParticipantStartMode::Exclusive)
            .await
            .unwrap();
        let before = sidecar.calls.lock().unwrap().len();
        assert!(local.acknowledge_explicit_root_abort().await.is_err());
        assert_eq!(sidecar.calls.lock().unwrap().len(), before);
        assert_eq!(
            participant
                .pending
                .lock()
                .await
                .as_ref()
                .unwrap()
                .local_owner,
            Some(next.local_owner)
        );
        drop(local);
        tokio::task::yield_now().await;
        assert_eq!(
            participant
                .pending
                .lock()
                .await
                .as_ref()
                .unwrap()
                .local_owner,
            Some(next.local_owner)
        );
        drop(next);
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
