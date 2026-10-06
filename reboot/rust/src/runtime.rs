//! Process-local Tonic host for the generated EchoMethods test service.
//!
//! Tonic service traits require `tonic::Status` as their error type. Boxing it
//! only to satisfy a size lint would break those concrete generated trait
//! signatures, so this module intentionally keeps that public transport error.
#![allow(clippy::result_large_err)]
//!
//! This is deliberately a small executable runtime slice: actor state is keyed
//! by `x-reboot-state-ref`, writes require a UUID idempotency key, and reads
//! return the actor's last successfully written message.

use std::collections::{BTreeMap, HashMap, VecDeque};
use std::fs::{self, File, OpenOptions};
use std::future::Future;
use std::io::{self, Write};
use std::path::{Path, PathBuf};
use std::pin::Pin;
use std::sync::{Arc, LazyLock, Mutex, Weak};
use std::time::{SystemTime, UNIX_EPOCH};

use prost::Message;
use sha2::{Digest, Sha256};
use tonic::{Request, Response, Status};
use uuid::Uuid;

use crate::{
    ContextError, IdempotencyCollision, InMemoryActor, RebootHeaders, database_proto as database,
    proto,
};

const STATE_REF_HEADER: &str = "x-reboot-state-ref";
const IDEMPOTENCY_KEY_HEADER: &str = "x-reboot-idempotency-key";
const REQUEST_FINGERPRINT_DOMAIN_V1: &[u8] = b"reboot.idempotency.request-fingerprint.v1\0";

/// The lock mode declared by a transaction RPC.
///
/// This is descriptive context for generated transaction handlers. It does not
/// acquire locks or coordinate commit/abort; those remain the responsibility of
/// a Reboot transaction runtime.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum TransactionMode {
    Exclusive,
    Shared,
}

/// The complete outcome produced by one transaction handler invocation.
///
/// The handler enlists only identities returned by successful generated
/// transactional clients. The generated root adapter gives that set to the
/// durable coordinator before it sends any Prepare RPC.
#[derive(Clone, Debug)]
pub struct TransactionExecution<Response> {
    pub response: Response,
    /// Serialized final protobuf state. `None` deliberately leaves state unset.
    pub final_state: Option<Vec<u8>>,
    pub task_upserts: Vec<database::Task>,
    pub idempotent_mutations: Vec<database::IdempotentMutation>,
}

impl<Response> TransactionExecution<Response> {
    pub fn new(response: Response) -> Self {
        Self {
            response,
            final_state: None,
            task_upserts: Vec::new(),
            idempotent_mutations: Vec::new(),
        }
    }
}

/// Opaque context passed only to a fresh, single-actor shared-root handler.
///
/// It deliberately exposes no transaction metadata, routing, enlistment,
/// task, idempotency, or returned-participant capability. The generated
/// adapter owns those boundaries and detects a local state change after the
/// handler returns.
#[derive(Debug)]
pub struct SharedLocalTransactionContext {
    _private: (),
}

impl SharedLocalTransactionContext {
    #[doc(hidden)]
    pub fn new_for_generated_adapter() -> Self {
        Self { _private: () }
    }
}

/// Idempotency identity derived from validated transaction metadata for one
/// generated root-exclusive mutation.
///
/// This deliberately has no constructor: generated adapters obtain it from a
/// [`TransactionContext`], which has already decoded the UUID metadata.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TransactionIdempotency {
    key: Uuid,
    request_fingerprint: Vec<u8>,
}

impl TransactionIdempotency {
    /// The validated idempotency UUID from Reboot metadata.
    pub fn key(&self) -> Uuid {
        self.key
    }

    /// The canonical v1 method/request fingerprint.
    pub fn request_fingerprint(&self) -> &[u8] {
        &self.request_fingerprint
    }

    /// Builds the sole local mutation staged for a successful generated
    /// root-exclusive transaction handler.
    pub fn mutation<Response: Message>(
        &self,
        state_type: impl Into<String>,
        state_ref: impl Into<String>,
        response: &Response,
    ) -> database::IdempotentMutation {
        database::IdempotentMutation {
            state_type: state_type.into(),
            state_ref: state_ref.into(),
            key: self.key.as_bytes().to_vec(),
            response: response.encode_to_vec(),
            task_ids: vec![],
            workflow_id: None,
            workflow_iteration: None,
            request_fingerprint: Some(self.request_fingerprint.clone()),
        }
    }

    /// Decodes one completed matching mutation, rejecting a nonempty
    /// fingerprint collision before its response can be replayed.
    pub fn replay<Response: Message + Default>(
        &self,
        mutation: &database::IdempotentMutation,
    ) -> Result<Option<Response>, Status> {
        if mutation.key != self.key.as_bytes() {
            return Ok(None);
        }
        if mutation
            .request_fingerprint
            .as_deref()
            .is_some_and(|stored| !stored.is_empty() && stored != self.request_fingerprint)
        {
            return Err(Status::failed_precondition(
                "idempotency key was reused with a different request",
            ));
        }
        Response::decode(mutation.response.as_slice())
            .map(Some)
            .map_err(|error| {
                Status::internal(format!("invalid persisted idempotent response: {error}"))
            })
    }
}

/// Existing Reboot transaction metadata passed to a generated transaction
/// handler.
///
/// Construct this only from inbound metadata that a transaction coordinator has
/// already established. This SDK intentionally does not start, prepare, commit,
/// or abort a transaction, so it cannot manufacture a root context.
#[derive(Clone, Debug)]
pub struct TransactionContext {
    headers: RebootHeaders,
    mode: TransactionMode,
    /// Present only for a generated fresh root. Inbound contexts deliberately
    /// have no root aggregation authority.
    returned_participants: Option<Arc<Mutex<ReturnedParticipantCollection>>>,
    /// First outbound failure whose transport outcome is not known recoverable.
    /// A handler may catch it, but a root must still abort rather than commit.
    doomed: Arc<Mutex<Option<Status>>>,
}

#[derive(Debug, Default)]
struct ReturnedParticipantCollection {
    participants: BTreeMap<crate::durable_coordinator::ParticipantTarget, bool>,
    sealed: bool,
    active: usize,
    late_enlistment: bool,
}

/// Generated clients retain this guard from before routing through enlistment.
/// It tracks quiescence only; cancellation does not recover unknown trailers.
#[doc(hidden)]
pub struct TransactionalOutboundScope {
    collection: Option<Arc<Mutex<ReturnedParticipantCollection>>>,
}

impl Drop for TransactionalOutboundScope {
    fn drop(&mut self) {
        if let Some(collection) = &self.collection {
            collection
                .lock()
                .expect("returned participant mutex poisoned")
                .active -= 1;
        }
    }
}

impl PartialEq for TransactionContext {
    fn eq(&self, other: &Self) -> bool {
        self.headers == other.headers && self.mode == other.mode
    }
}

impl Eq for TransactionContext {}

impl TransactionContext {
    /// Derives a root transaction's idempotency mutation identity from the
    /// validated UUID metadata and canonical fully-qualified RPC fingerprint.
    pub fn idempotency<RequestBody: Message>(
        &self,
        method_identity: &str,
        request: &RequestBody,
    ) -> Result<TransactionIdempotency, Status> {
        let key = self.headers.idempotency_key.ok_or_else(|| {
            Status::invalid_argument("metadata `x-reboot-idempotency-key` is required")
        })?;
        check_idempotency_key_not_expired(key)?;
        Ok(TransactionIdempotency {
            key,
            request_fingerprint: request_fingerprint(method_identity, request),
        })
    }
}

/// A validated transaction context received from an application RPC.
///
/// This is metadata-only plumbing. It preserves the root coordinator and can
/// derive a child transaction path, but it does not acquire actor ownership,
/// execute a handler, or make any atomicity guarantee.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct InboundTransactionContext {
    transaction: TransactionContext,
}

/// Rejects a child ID which would make a transaction path ambiguous.
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum NestedTransactionPathError {
    DuplicateTransactionId,
}

impl std::fmt::Display for NestedTransactionPathError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::DuplicateTransactionId => {
                write!(
                    f,
                    "nested transaction ID already exists in the transaction path"
                )
            }
        }
    }
}

impl std::error::Error for NestedTransactionPathError {}

/// Host-owned routing for a generated transactional application client.
///
/// The generated client supplies the declared state type and the caller-provided
/// state reference unchanged. Implementations choose the transport endpoint;
/// they must not rely on the SDK to derive an address or placement.
#[tonic::async_trait]
pub trait TransactionalChannelResolver: Send + Sync + 'static {
    async fn resolve(
        &self,
        state_type: &str,
        state_ref: &str,
    ) -> Result<tonic::transport::Channel, Status>;
}

/// Successful result of one generated outbound transactional RPC.
///
/// This joins a unary response with the participant identities returned in its
/// successful transport trailers. It is not a coordinator, does not aggregate
/// results from multiple calls, and makes no atomicity guarantee.
#[derive(Debug)]
pub struct TransactionalCallResponse<T> {
    response: tonic::Response<T>,
    returned_participants: crate::successful_trailers::ReturnedParticipants,
}

impl<T> TransactionalCallResponse<T> {
    /// Constructs a response after the transport trailer decoder succeeds.
    pub fn new(
        response: tonic::Response<T>,
        returned_participants: crate::successful_trailers::ReturnedParticipants,
    ) -> Self {
        Self {
            response,
            returned_participants,
        }
    }

    /// Returns the underlying unary response, including Tonic's merged metadata.
    pub fn response(&self) -> &tonic::Response<T> {
        &self.response
    }

    /// Returns remote participant identities decoded from successful trailers.
    pub fn returned_participants(&self) -> &crate::successful_trailers::ReturnedParticipants {
        &self.returned_participants
    }

    /// Consumes the wrapper into its response and transport-only participant data.
    pub fn into_parts(
        self,
    ) -> (
        tonic::Response<T>,
        crate::successful_trailers::ReturnedParticipants,
    ) {
        (self.response, self.returned_participants)
    }
}

/// Builds one outbound request for a generated transactional application call.
///
/// This preserves only the validated Reboot allowlist held by `context`, swaps
/// its target state reference, and asks the host to route that exact target.
/// It neither creates transaction identity nor interprets the state reference.
/// Returned channels are used by the generated client to invoke its statically
/// declared RPC method. Nested inbound execution and participant collection are
/// deliberately outside this outbound-only foundation.
pub async fn transactional_outbound_request<R, Message>(
    resolver: &R,
    context: &TransactionContext,
    state_type: &str,
    state_ref: &str,
    message: Message,
) -> Result<(tonic::transport::Channel, Request<Message>), Status>
where
    R: TransactionalChannelResolver,
{
    if state_type.is_empty() || state_ref.is_empty() {
        return Err(Status::invalid_argument(
            "target state type and reference must not be empty",
        ));
    }
    let mut headers = context.headers().clone();
    headers.state_ref = state_ref.to_owned();
    let metadata = headers
        .to_metadata()
        .map_err(|error| Status::invalid_argument(error.to_string()))?;
    let channel = resolver.resolve(state_type, state_ref).await?;
    let mut request = Request::new(message);
    *request.metadata_mut() = metadata;
    Ok((channel, request))
}

impl TransactionContext {
    /// Validates coordinator-established transaction metadata for one handler.
    pub fn from_headers(
        headers: RebootHeaders,
        mode: TransactionMode,
    ) -> Result<Self, ContextError> {
        if headers.state_ref.is_empty() {
            return Err(ContextError::EmptyStateRef);
        }
        if headers.transaction_ids.as_ref().is_none_or(Vec::is_empty) {
            return Err(ContextError::MissingTransactionMetadata);
        }
        if headers
            .transaction_coordinator_state_type
            .as_deref()
            .is_none_or(str::is_empty)
            || headers
                .transaction_coordinator_state_ref
                .as_deref()
                .is_none_or(str::is_empty)
        {
            return Err(ContextError::MissingTransactionCoordinatorMetadata);
        }
        Ok(Self {
            headers,
            mode,
            returned_participants: None,
            doomed: Arc::new(Mutex::new(None)),
        })
    }

    /// Records the first non-declared outbound failure. This is sticky so
    /// catching an uncertain RPC error cannot make a transaction committable.
    pub fn doom(&self, status: Status) {
        let mut doomed = self
            .doomed
            .lock()
            .expect("transaction outcome mutex poisoned");
        if doomed.is_none() {
            *doomed = Some(status);
        }
    }

    /// Returns the first latched unrecoverable outbound status, if any.
    pub fn doomed_status(&self) -> Option<Status> {
        self.doomed
            .lock()
            .expect("transaction outcome mutex poisoned")
            .clone()
    }

    fn with_returned_participant_collection(mut self) -> Self {
        self.returned_participants = Some(Arc::new(Mutex::new(
            ReturnedParticipantCollection::default(),
        )));
        self
    }

    pub(crate) fn is_fresh_root(&self) -> bool {
        self.returned_participants.is_some() && self.transaction_ids().len() == 1
    }

    /// Acquires generated outbound admission before any resolver or network call.
    #[doc(hidden)]
    pub fn begin_generated_outbound(&self) -> Result<TransactionalOutboundScope, Status> {
        if let Some(collection) = &self.returned_participants {
            let mut state = collection
                .lock()
                .expect("returned participant mutex poisoned");
            if state.sealed {
                return Err(Status::failed_precondition(
                    "root outbound collection is sealed",
                ));
            }
            state.active += 1;
        }
        Ok(TransactionalOutboundScope {
            collection: self.returned_participants.clone(),
        })
    }

    pub(crate) fn seal_explicit_abort(
        &self,
    ) -> Result<Vec<crate::durable_coordinator::ReturnedParticipant>, Status> {
        let collection = self.returned_participants.as_ref().ok_or_else(|| {
            Status::failed_precondition("explicit abort requires fresh root provenance")
        })?;
        let mut state = collection
            .lock()
            .expect("returned participant mutex poisoned");
        if state.sealed || state.active != 0 {
            return Err(Status::failed_precondition(
                "unsupported explicit-abort uncertainty: collection sealed or generated outbound calls still active; ownership retained",
            ));
        }
        state.sealed = true;
        Ok(state
            .participants
            .iter()
            .map(
                |(target, read_only)| crate::durable_coordinator::ReturnedParticipant {
                    target: target.clone(),
                    read_only: *read_only,
                },
            )
            .collect())
    }

    pub(crate) fn finish_explicit_abort(&self) -> Result<(), Status> {
        let collection = self
            .returned_participants
            .as_ref()
            .expect("fresh root was validated");
        let mut state = collection
            .lock()
            .expect("returned participant mutex poisoned");
        if !state.sealed || state.active != 0 || state.late_enlistment {
            return Err(Status::failed_precondition(
                "late enlistment retained; explicit cleanup is incomplete",
            ));
        }
        state.participants.clear();
        Ok(())
    }

    /// Enlists validated identities from one successful generated outbound RPC.
    ///
    /// This is a no-op for inbound contexts: only a fresh root can aggregate
    /// remote participants for the root coordinator.
    pub fn enlist_returned_participants(
        &self,
        returned: &crate::successful_trailers::ReturnedParticipants,
    ) {
        if let Some(participants) = &self.returned_participants {
            let mut collected = participants
                .lock()
                .expect("returned participant mutex poisoned");
            for participant in returned.participants() {
                // A successful call that classifies a target as a writer wins
                // over any prior read-only classification from another call.
                collected
                    .participants
                    .entry(participant.target.clone())
                    .and_modify(|read_only| *read_only &= participant.read_only)
                    .or_insert(participant.read_only);
            }
            if collected.sealed {
                // Public/manual callers cannot silently discard new ownership.
                collected.late_enlistment = true;
                self.doom(Status::failed_precondition(
                    "participant enlisted after explicit abort seal",
                ));
            }
        }
    }

    /// Copies confirmed enlistments without relinquishing their ownership.
    /// Explicit pre-handoff cleanup must retain this set until terminal ACKs.
    pub fn returned_participants_snapshot(
        &self,
    ) -> Vec<crate::durable_coordinator::ReturnedParticipant> {
        self.returned_participants
            .as_ref()
            .map(|participants| {
                participants
                    .lock()
                    .expect("returned participant mutex poisoned")
                    .participants
                    .iter()
                    .map(
                        |(target, read_only)| crate::durable_coordinator::ReturnedParticipant {
                            target: target.clone(),
                            read_only: *read_only,
                        },
                    )
                    .collect()
            })
            .unwrap_or_default()
    }

    /// Drains the root's generated outbound participant set exactly once.
    ///
    /// Generated root adapters call this immediately before durable coordinator
    /// completion. Inbound contexts return an empty set and never coordinate.
    pub fn take_returned_participants(
        &self,
    ) -> Vec<crate::durable_coordinator::ReturnedParticipant> {
        self.returned_participants
            .as_ref()
            .map(|participants| {
                let mut state = participants
                    .lock()
                    .expect("returned participant mutex poisoned");
                // Explicit abort exclusively owns its sealed set, including on failure.
                if state.sealed {
                    return Vec::new();
                }
                std::mem::take(&mut state.participants)
                    .into_iter()
                    .map(
                        |(target, read_only)| crate::durable_coordinator::ReturnedParticipant {
                            target,
                            read_only,
                        },
                    )
                    .collect()
            })
            .unwrap_or_default()
    }

    pub fn headers(&self) -> &RebootHeaders {
        &self.headers
    }

    pub fn mode(&self) -> TransactionMode {
        self.mode
    }

    /// Marks generated root shared transactions as capable of carrying the
    /// disjoint read-only participant trailers required by durable 2PC.
    pub fn enable_read_only_aware(&mut self) {
        self.headers.coordinator_read_only_aware = true;
    }

    pub fn transaction_ids(&self) -> &[Uuid] {
        self.headers
            .transaction_ids
            .as_deref()
            .expect("TransactionContext validates transaction IDs")
    }

    pub fn transaction_id(&self) -> Uuid {
        *self
            .transaction_ids()
            .last()
            .expect("TransactionContext validates non-empty transaction IDs")
    }

    pub fn transaction_root_id(&self) -> Uuid {
        self.transaction_ids()[0]
    }

    pub fn transaction_coordinator_state_type(&self) -> &str {
        self.headers
            .transaction_coordinator_state_type
            .as_deref()
            .expect("TransactionContext validates coordinator state type")
    }

    pub fn transaction_coordinator_state_ref(&self) -> &str {
        self.headers
            .transaction_coordinator_state_ref
            .as_deref()
            .expect("TransactionContext validates coordinator state reference")
    }

    /// Appends a host-supplied child ID while preserving the root coordinator.
    ///
    /// Native Reboot creates a new ID for every nested context. The Rust SDK
    /// consumes that host-supplied ID rather than manufacturing one, and rejects
    /// a duplicate so a path cannot identify two distinct nesting levels with
    /// the same value.
    pub fn with_nested_transaction_id(
        &self,
        transaction_id: Uuid,
    ) -> Result<Self, NestedTransactionPathError> {
        if self.transaction_ids().contains(&transaction_id) {
            return Err(NestedTransactionPathError::DuplicateTransactionId);
        }
        let mut headers = self.headers.clone();
        headers
            .transaction_ids
            .as_mut()
            .expect("TransactionContext validates transaction IDs")
            .push(transaction_id);
        Ok(Self {
            headers,
            mode: self.mode,
            // Nested inbound contexts must not retain root aggregation state.
            returned_participants: None,
            doomed: Arc::clone(&self.doomed),
        })
    }
}

impl InboundTransactionContext {
    /// Parses and validates an inbound Reboot transaction context.
    pub fn from_metadata(
        metadata: &tonic::metadata::MetadataMap,
        mode: TransactionMode,
    ) -> Result<Self, ContextError> {
        Self::from_headers(RebootHeaders::from_metadata(metadata)?, mode)
    }

    /// Validates headers supplied by a host that already parsed metadata.
    pub fn from_headers(
        headers: RebootHeaders,
        mode: TransactionMode,
    ) -> Result<Self, ContextError> {
        Ok(Self {
            transaction: TransactionContext::from_headers(headers, mode)?,
        })
    }

    pub fn transaction(&self) -> &TransactionContext {
        &self.transaction
    }

    /// Derives the context for a nested transaction without executing it.
    pub fn with_nested_transaction_id(
        &self,
        transaction_id: Uuid,
    ) -> Result<TransactionContext, NestedTransactionPathError> {
        self.transaction.with_nested_transaction_id(transaction_id)
    }
}

/// A root transaction context established from an external call.
///
/// Starting a root transaction must be supplied with an ID and timestamp by
/// the host. The SDK deliberately has no UUID or clock fallback because the
/// choice must remain compatible with the host's database/restart-detection
/// strategy (for example, a database-timestamped UUIDv7 versus its documented
/// fallback). It neither accepts an inbound transaction nor starts a nested
/// transaction.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RootTransactionContext {
    transaction: TransactionContext,
    timestamp: prost_types::Timestamp,
}

/// Host-owned identity for one new root transaction.
///
/// The database sidecar's restart-detection and recovery rules determine how
/// this value is produced. The SDK deliberately only consumes it.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RootTransactionStart {
    pub transaction_id: Uuid,
    pub timestamp: prost_types::Timestamp,
}

/// Supplies the identity for a fresh root transaction.
///
/// Generated Tonic adapters require this dependency instead of creating a UUID
/// or reading a clock themselves.
pub trait RootTransactionStartFactory: Send + Sync + 'static {
    fn next_root_transaction(&self) -> Result<RootTransactionStart, Status>;
}

/// Supplies the host-owned child ID for one validated inbound transaction.
///
/// A generated server adapter calls this only after it has validated the
/// inbound Reboot headers. The SDK never generates this ID: native Reboot's
/// child identity is part of the host's durable transaction/lock contract.
pub trait InboundTransactionStartFactory: Send + Sync + 'static {
    fn next_inbound_transaction(&self, inbound: &InboundTransactionContext)
    -> Result<Uuid, Status>;
}

/// Establishes a fresh root context with host-supplied identity.
pub fn start_root_transaction<F: RootTransactionStartFactory>(
    headers: RebootHeaders,
    coordinator_state_type: impl Into<String>,
    mode: TransactionMode,
    factory: &F,
) -> Result<RootTransactionContext, Status> {
    let coordinator_state_type = coordinator_state_type.into();
    RootTransactionContext::validate_fresh(&headers, &coordinator_state_type)
        .map_err(|error| Status::failed_precondition(error.to_string()))?;
    let start = factory.next_root_transaction()?;
    RootTransactionContext::start(
        headers,
        coordinator_state_type,
        mode,
        start.transaction_id,
        start.timestamp,
    )
    .map_err(|error| Status::failed_precondition(error.to_string()))
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum RootTransactionStartError {
    InboundTransactionContext,
    EmptyCoordinatorStateType,
    EmptyStateRef,
}

impl std::fmt::Display for RootTransactionStartError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::InboundTransactionContext => {
                write!(
                    f,
                    "root transaction start refuses inbound or nested transaction context"
                )
            }
            Self::EmptyCoordinatorStateType => {
                write!(
                    f,
                    "root transaction coordinator state type must not be empty"
                )
            }
            Self::EmptyStateRef => write!(f, "root transaction state reference must not be empty"),
        }
    }
}

impl std::error::Error for RootTransactionStartError {}

impl RootTransactionContext {
    /// Builds a root context using a host-supplied transaction ID and timestamp.
    ///
    /// `transaction_id` and `timestamp` are intentionally explicit arguments;
    /// this SDK does not manufacture them. The coordinator is the state serving
    /// this root call, so its state reference is the inbound state reference.
    pub fn start(
        mut headers: RebootHeaders,
        coordinator_state_type: impl Into<String>,
        mode: TransactionMode,
        transaction_id: Uuid,
        timestamp: prost_types::Timestamp,
    ) -> Result<Self, RootTransactionStartError> {
        let coordinator_state_type = coordinator_state_type.into();
        Self::validate_fresh(&headers, &coordinator_state_type)?;
        headers.transaction_ids = Some(vec![transaction_id]);
        headers.transaction_coordinator_state_type = Some(coordinator_state_type);
        headers.transaction_coordinator_state_ref = Some(headers.state_ref.clone());
        // Shared roots can only complete after every participant is classified
        // read-only, so advertise the two-set trailer contract to remotes.
        headers.coordinator_read_only_aware = mode == TransactionMode::Shared;
        let transaction = TransactionContext::from_headers(headers, mode)
            .expect("RootTransactionContext establishes complete transaction metadata")
            .with_returned_participant_collection();
        Ok(Self {
            transaction,
            timestamp,
        })
    }

    fn validate_fresh(
        headers: &RebootHeaders,
        coordinator_state_type: &str,
    ) -> Result<(), RootTransactionStartError> {
        if headers.transaction_ids.is_some()
            || headers.transaction_coordinator_state_type.is_some()
            || headers.transaction_coordinator_state_ref.is_some()
            || headers.transaction_retry_age.is_some()
            || headers.coordinator_read_only_aware
        {
            return Err(RootTransactionStartError::InboundTransactionContext);
        }
        if headers.state_ref.is_empty() {
            return Err(RootTransactionStartError::EmptyStateRef);
        }
        if coordinator_state_type.is_empty() {
            return Err(RootTransactionStartError::EmptyCoordinatorStateType);
        }
        Ok(())
    }

    pub fn transaction(&self) -> &TransactionContext {
        &self.transaction
    }

    pub fn timestamp(&self) -> &prost_types::Timestamp {
        &self.timestamp
    }
}

#[derive(Debug)]
struct PendingParticipantTransaction {
    root_id: Uuid,
    mode: TransactionMode,
    prepared: bool,
}

type ParticipantSlot = Arc<Mutex<Option<PendingParticipantTransaction>>>;

/// Process-local participant state for actors that are already executing an
/// established transaction context.
///
/// This owns only one actor's pending transaction state. It neither starts a
/// transaction nor contacts a coordinator or database; `Prepare` records the
/// local prepared state and `Commit`/`Abort` clear it.
#[derive(Clone, Default)]
pub struct ActorParticipantHost {
    participants: Arc<Mutex<HashMap<String, ParticipantSlot>>>,
}

impl ActorParticipantHost {
    pub fn new() -> Self {
        Self::default()
    }

    /// Registers an actor that has already accepted an inbound transaction RPC.
    ///
    /// `TransactionContext::from_headers` performs metadata validation before a
    /// context can exist. Registration also binds it to the actor state-ref and
    /// retains the declared mode as participant state; the native Participant
    /// protocol carries only the root transaction ID, not a mode or context.
    pub fn activate(&self, context: TransactionContext) -> Result<(), Status> {
        let state_ref = context.headers().state_ref.clone();
        if state_ref.is_empty() {
            return Err(Status::invalid_argument(
                "metadata `x-reboot-state-ref` must not be empty",
            ));
        }
        let mut participants = self
            .participants
            .lock()
            .expect("participant map mutex poisoned");
        let pending = participants
            .entry(state_ref)
            .or_insert_with(|| Arc::new(Mutex::new(None)))
            .clone();
        let mut pending = pending.lock().expect("participant mutex poisoned");
        if pending.is_some() {
            return Err(Status::failed_precondition(
                "actor already has a pending transaction",
            ));
        }
        *pending = Some(PendingParticipantTransaction {
            root_id: context.transaction_root_id(),
            mode: context.mode(),
            prepared: false,
        });
        Ok(())
    }

    fn participant_for_state_ref(&self, state_ref: &str) -> Option<ParticipantSlot> {
        self.participants
            .lock()
            .expect("participant map mutex poisoned")
            .get(state_ref)
            .cloned()
    }

    fn participant(&self, request: &Request<impl Sized>) -> Result<ParticipantSlot, Status> {
        let state_ref = required_metadata(request, STATE_REF_HEADER)?;
        self.participant_for_state_ref(&state_ref)
            .ok_or_else(|| Status::failed_precondition("actor has no pending transaction"))
    }
}

fn participant_transaction_id(value: &[u8]) -> Result<Uuid, Status> {
    Uuid::from_slice(value)
        .map_err(|_| Status::invalid_argument("transaction_id must be a 16-byte UUID"))
}

fn prepare_failure(
    abort_via_response: bool,
    detail: &'static str,
) -> Result<Response<database::PrepareResponse>, Status> {
    if abort_via_response {
        Ok(Response::new(database::PrepareResponse {
            abort: true,
            restart_detected: false,
            recovery_timestamp: None,
        }))
    } else {
        Err(Status::failed_precondition(detail))
    }
}

#[tonic::async_trait]
impl database::participant_server::Participant for ActorParticipantHost {
    async fn prepare(
        &self,
        request: Request<database::PrepareRequest>,
    ) -> Result<Response<database::PrepareResponse>, Status> {
        let state_ref = required_metadata(&request, STATE_REF_HEADER)?;
        let request = request.into_inner();
        let transaction_id = participant_transaction_id(&request.transaction_id)?;
        let Some(participant) = self.participant_for_state_ref(&state_ref) else {
            return prepare_failure(
                request.abort_via_response,
                "actor has no pending transaction",
            );
        };
        let mut pending = participant.lock().expect("participant mutex poisoned");
        let Some(pending) = pending.as_mut() else {
            return prepare_failure(
                request.abort_via_response,
                "actor has no pending transaction",
            );
        };
        if pending.root_id != transaction_id {
            return prepare_failure(request.abort_via_response, "pending transaction ID differs");
        }
        // Mode was validated when the actor accepted its TransactionContext. It
        // remains participant-local because PrepareRequest does not carry it.
        let _mode = pending.mode;
        pending.prepared = true;
        Ok(Response::new(database::PrepareResponse::default()))
    }

    async fn commit(
        &self,
        request: Request<database::CommitRequest>,
    ) -> Result<Response<database::CommitResponse>, Status> {
        let participant = self.participant(&request)?;
        let transaction_id = participant_transaction_id(&request.get_ref().transaction_id)?;
        let mut pending = participant.lock().expect("participant mutex poisoned");
        let Some(current) = pending.as_ref() else {
            return Err(Status::failed_precondition(
                "actor has no pending transaction",
            ));
        };
        if current.root_id != transaction_id || !current.prepared {
            return Err(Status::failed_precondition(
                "commit requires the matching prepared transaction",
            ));
        }
        *pending = None;
        Ok(Response::new(database::CommitResponse::default()))
    }

    async fn abort(
        &self,
        request: Request<database::AbortRequest>,
    ) -> Result<Response<database::AbortResponse>, Status> {
        let participant = self.participant(&request)?;
        let transaction_id = participant_transaction_id(&request.get_ref().transaction_id)?;
        let mut pending = participant.lock().expect("participant mutex poisoned");
        let Some(current) = pending.as_ref() else {
            return Err(Status::failed_precondition(
                "actor has no pending transaction",
            ));
        };
        if current.root_id != transaction_id {
            return Err(Status::failed_precondition(
                "abort requires the matching transaction",
            ));
        }
        *pending = None;
        Ok(Response::new(database::AbortResponse::default()))
    }

    async fn relinquish_ownership(
        &self,
        _: Request<database::RelinquishOwnershipRequest>,
    ) -> Result<Response<database::RelinquishOwnershipResponse>, Status> {
        Err(Status::unimplemented(
            "nested transaction ownership is not part of this participant foundation",
        ))
    }
}

/// Returns the canonical v1 idempotency fingerprint used by every SDK.
///
/// `method_identity` is the fully-qualified protobuf RPC name for generated
/// adapters (for example, `package.Service.Method`).
pub fn request_fingerprint(method_identity: &str, request: &impl Message) -> Vec<u8> {
    let mut hash = Sha256::new();
    hash.update(REQUEST_FINGERPRINT_DOMAIN_V1);
    hash.update(method_identity.as_bytes());
    hash.update(b"\0");
    hash.update(request.encode_to_vec());
    hash.finalize().to_vec()
}

type EchoActor = InMemoryActor<proto::Echo, proto::Text>;
const ECHO_REPLY_METHOD_IDENTITY: &str = "tests.reboot.protoc.EchoMethods.Reply";

fn idempotency_collision_status(_: IdempotencyCollision) -> Status {
    Status::failed_precondition("idempotency key was reused with a different request")
}

#[derive(Clone, Eq, Hash, PartialEq)]
struct ActorLockKey {
    endpoint: String,
    state_type: String,
    state_ref: String,
}

#[derive(Default)]
struct ActorGateState {
    shared: usize,
    exclusive: bool,
    upgrading: bool,
    waiters: VecDeque<ActorGateWaiter>,
    next_waiter: u64,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum ActorGateWaitMode {
    Shared,
    Exclusive,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
struct ActorGateWaiter {
    ticket: u64,
    mode: ActorGateWaitMode,
}

struct ActorGateInner {
    state: Mutex<ActorGateState>,
    changed: tokio::sync::Notify,
}

/// Process-local reader/writer gate for one durable actor.
///
/// An upgrade keeps its shared lease until it atomically becomes exclusive.
/// Waiters are admitted in FIFO reader/writer cohorts: readers queued before
/// the next writer acquire together, but readers arriving after that writer
/// cannot barge ahead. While an upgrade is waiting, new shared leases cannot
/// barge ahead of it. Exclusive waiters are granted FIFO order.
#[derive(Clone)]
pub struct ActorGate {
    inner: Arc<ActorGateInner>,
}

/// A shared actor lease. No production participant path requests this yet.
pub struct SharedActorLease {
    inner: Arc<ActorGateInner>,
    active: bool,
}

/// An exclusive actor lease held by normal store access and durable participants.
pub struct ExclusiveActorLease {
    inner: Arc<ActorGateInner>,
    active: bool,
}

/// An upgrade could not be completed without giving up the shared lease.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ActorGateUpgradeError {
    UpgradeInProgress,
    TimedOut,
}

impl ActorGateUpgradeError {
    /// A retryable transport status for promotion admission failures.
    pub fn retryable_status(self) -> Status {
        match self {
            Self::UpgradeInProgress => {
                Status::unavailable("actor gate upgrade already in progress")
            }
            Self::TimedOut => Status::unavailable("actor gate upgrade timed out"),
        }
    }
}

impl ActorGate {
    pub(crate) fn new() -> Self {
        Self {
            inner: Arc::new(ActorGateInner {
                state: Mutex::new(ActorGateState::default()),
                changed: tokio::sync::Notify::new(),
            }),
        }
    }

    pub async fn shared(&self) -> SharedActorLease {
        let ticket = {
            let mut state = self.inner.state.lock().expect("actor gate mutex poisoned");
            if !state.exclusive && !state.upgrading && state.waiters.is_empty() {
                state.shared += 1;
                return SharedActorLease {
                    inner: Arc::clone(&self.inner),
                    active: true,
                };
            }
            let ticket = state.next_waiter;
            state.next_waiter = state.next_waiter.wrapping_add(1);
            state.waiters.push_back(ActorGateWaiter {
                ticket,
                mode: ActorGateWaitMode::Shared,
            });
            ticket
        };
        let mut wait = ActorGateWait {
            inner: Arc::clone(&self.inner),
            ticket,
            active: true,
        };
        loop {
            let notified = self.inner.changed.notified();
            {
                let mut state = self.inner.state.lock().expect("actor gate mutex poisoned");
                if !state.exclusive
                    && !state.upgrading
                    && shared_waiter_is_admissible(&state.waiters, ticket)
                {
                    remove_actor_gate_waiter(&mut state.waiters, ticket);
                    state.shared += 1;
                    wait.active = false;
                    return SharedActorLease {
                        inner: Arc::clone(&self.inner),
                        active: true,
                    };
                }
            }
            notified.await;
        }
    }

    pub async fn exclusive(&self) -> ExclusiveActorLease {
        let ticket = {
            let mut state = self.inner.state.lock().expect("actor gate mutex poisoned");
            let ticket = state.next_waiter;
            state.next_waiter = state.next_waiter.wrapping_add(1);
            state.waiters.push_back(ActorGateWaiter {
                ticket,
                mode: ActorGateWaitMode::Exclusive,
            });
            ticket
        };
        let mut wait = ActorGateWait {
            inner: Arc::clone(&self.inner),
            ticket,
            active: true,
        };
        loop {
            let notified = self.inner.changed.notified();
            {
                let mut state = self.inner.state.lock().expect("actor gate mutex poisoned");
                if state.waiters.front()
                    == Some(&ActorGateWaiter {
                        ticket,
                        mode: ActorGateWaitMode::Exclusive,
                    })
                    && !state.exclusive
                    && state.shared == 0
                    && !state.upgrading
                {
                    state.waiters.pop_front();
                    state.exclusive = true;
                    wait.active = false;
                    return ExclusiveActorLease {
                        inner: Arc::clone(&self.inner),
                        active: true,
                    };
                }
            }
            notified.await;
        }
    }
}

impl Drop for SharedActorLease {
    fn drop(&mut self) {
        if self.active {
            let mut state = self.inner.state.lock().expect("actor gate mutex poisoned");
            state.shared -= 1;
            self.inner.changed.notify_waiters();
        }
    }
}

impl Drop for ExclusiveActorLease {
    fn drop(&mut self) {
        if self.active {
            let mut state = self.inner.state.lock().expect("actor gate mutex poisoned");
            state.exclusive = false;
            self.inner.changed.notify_waiters();
        }
    }
}

impl ExclusiveActorLease {
    /// Atomically demotes this exclusive lease to a shared lease.
    ///
    /// Readers already queued before the next writer become eligible together;
    /// later readers remain queued behind that writer. Consuming `self` makes
    /// the mode transition linear: this method cannot leave both lease types
    /// active for one holder.
    pub fn downgrade(mut self) -> SharedActorLease {
        let mut state = self.inner.state.lock().expect("actor gate mutex poisoned");
        assert!(
            state.exclusive,
            "active exclusive lease requires exclusive gate state"
        );
        state.exclusive = false;
        state.shared = 1;
        self.active = false;
        self.inner.changed.notify_waiters();
        SharedActorLease {
            inner: Arc::clone(&self.inner),
            active: true,
        }
    }
}

struct ActorGateWait {
    inner: Arc<ActorGateInner>,
    ticket: u64,
    active: bool,
}

impl Drop for ActorGateWait {
    fn drop(&mut self) {
        if self.active {
            let mut state = self.inner.state.lock().expect("actor gate mutex poisoned");
            remove_actor_gate_waiter(&mut state.waiters, self.ticket);
            self.inner.changed.notify_waiters();
        }
    }
}

fn remove_actor_gate_waiter(waiters: &mut VecDeque<ActorGateWaiter>, ticket: u64) {
    let position = waiters
        .iter()
        .position(|waiter| waiter.ticket == ticket)
        .expect("queued actor-gate waiter must remain registered");
    waiters.remove(position);
}

fn shared_waiter_is_admissible(waiters: &VecDeque<ActorGateWaiter>, ticket: u64) -> bool {
    for waiter in waiters {
        match waiter.mode {
            ActorGateWaitMode::Shared if waiter.ticket == ticket => return true,
            ActorGateWaitMode::Shared => {}
            ActorGateWaitMode::Exclusive => return false,
        }
    }
    false
}

struct UpgradeWait {
    inner: Arc<ActorGateInner>,
    active: bool,
}

impl Drop for UpgradeWait {
    fn drop(&mut self) {
        if self.active {
            let mut state = self.inner.state.lock().expect("actor gate mutex poisoned");
            state.upgrading = false;
            self.inner.changed.notify_waiters();
        }
    }
}

impl SharedActorLease {
    /// Atomically promotes this lease. A second concurrent upgrader is rejected
    /// without releasing its own shared lease.
    pub async fn upgrade(&mut self) -> Result<ExclusiveActorLease, ActorGateUpgradeError> {
        {
            let mut state = self.inner.state.lock().expect("actor gate mutex poisoned");
            // An upgrade keeps its read snapshot, so it cannot wait behind an
            // already queued writer without deadlocking that writer. Reject it
            // retryably instead of letting it bypass FIFO writer admission.
            if state.upgrading || !state.waiters.is_empty() {
                return Err(ActorGateUpgradeError::UpgradeInProgress);
            }
            state.upgrading = true;
        }
        let mut wait = UpgradeWait {
            inner: Arc::clone(&self.inner),
            active: true,
        };
        loop {
            let notified = self.inner.changed.notified();
            {
                let mut state = self.inner.state.lock().expect("actor gate mutex poisoned");
                if !state.exclusive && state.shared == 1 {
                    state.shared = 0;
                    state.upgrading = false;
                    state.exclusive = true;
                    wait.active = false;
                    self.active = false;
                    return Ok(ExclusiveActorLease {
                        inner: Arc::clone(&self.inner),
                        active: true,
                    });
                }
            }
            notified.await;
        }
    }

    /// Promotes atomically, retaining this shared lease if the deadline expires.
    pub async fn upgrade_for(
        &mut self,
        timeout: std::time::Duration,
    ) -> Result<ExclusiveActorLease, ActorGateUpgradeError> {
        tokio::time::timeout(timeout, self.upgrade())
            .await
            .map_err(|_| ActorGateUpgradeError::TimedOut)?
    }
}

static DATABASE_ACTOR_LOCKS: LazyLock<Mutex<HashMap<ActorLockKey, Weak<ActorGateInner>>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

/// Returns the process-local gate shared by normal actor access and an
/// exclusive durable participant for this exact actor identity.
fn same_actor_gate(endpoint: &str, state_type: &str, state_ref: &str) -> ActorGate {
    let key = ActorLockKey {
        endpoint: endpoint.to_owned(),
        state_type: state_type.to_owned(),
        state_ref: state_ref.to_owned(),
    };
    let mut registry = DATABASE_ACTOR_LOCKS
        .lock()
        .expect("database actor-lock registry mutex poisoned");
    registry.retain(|_, gate| gate.strong_count() > 0);
    match registry.get(&key).and_then(Weak::upgrade) {
        Some(inner) => ActorGate { inner },
        None => {
            let gate = ActorGate::new();
            registry.insert(key, Arc::downgrade(&gate.inner));
            gate
        }
    }
}

/// An in-memory host for the generated `EchoMethods` Tonic service.
///
/// Clones share all actors. State is process-local and is lost when the host is
/// dropped; it is not a durable Reboot runtime.
#[derive(Clone, Default)]
pub struct InMemoryHost {
    actors: Arc<Mutex<HashMap<String, Arc<EchoActor>>>>,
}

impl InMemoryHost {
    /// Creates an empty host. An actor is allocated on its first valid request.
    pub fn new() -> Self {
        Self::default()
    }

    fn actor_for(&self, request: &Request<impl Sized>) -> Result<Arc<EchoActor>, Status> {
        let state_ref = required_metadata(request, STATE_REF_HEADER)?;
        let mut actors = self.actors.lock().expect("host actor map mutex poisoned");
        Ok(actors
            .entry(state_ref)
            .or_insert_with(|| Arc::new(InMemoryActor::new(proto::Echo::default())))
            .clone())
    }
}

/// A local-disk-backed host for the generated `EchoMethods` Tonic service.
///
/// State and completed writer responses survive a clean process restart. The
/// store atomically replaces one file per state reference, but is deliberately
/// still single-process: it has no inter-process locking, placement, journal
/// compaction, encryption, or distributed durability.
#[derive(Clone)]
pub struct FileBackedHost {
    root: Arc<PathBuf>,
    actors: Arc<Mutex<HashMap<String, Arc<FileBackedEchoActor>>>>,
}

impl FileBackedHost {
    /// Opens (or creates) a local state directory.
    pub fn open(root: impl Into<PathBuf>) -> io::Result<Self> {
        let root = root.into();
        fs::create_dir_all(&root)?;
        Ok(Self {
            root: Arc::new(root),
            actors: Arc::new(Mutex::new(HashMap::new())),
        })
    }

    fn actor_for(&self, request: &Request<impl Sized>) -> Result<Arc<FileBackedEchoActor>, Status> {
        let state_ref = required_metadata(request, STATE_REF_HEADER)?;
        let mut actors = self.actors.lock().expect("host actor map mutex poisoned");
        if let Some(actor) = actors.get(&state_ref) {
            return Ok(actor.clone());
        }
        let actor =
            FileBackedEchoActor::open(actor_path(&self.root, &state_ref)).map_err(|error| {
                Status::internal(format!("failed to load persisted actor state: {error}"))
            })?;
        let actor = Arc::new(actor);
        actors.insert(state_ref, actor.clone());
        Ok(actor)
    }
}

struct FileBackedEchoActor {
    path: PathBuf,
    inner: Mutex<FileBackedEchoActorState>,
}

#[derive(Clone)]
struct FileBackedEchoActorState {
    state: proto::Echo,
    completed_writes: HashMap<Uuid, PersistedCompletedWrite>,
}

#[derive(Clone)]
struct PersistedCompletedWrite {
    request_fingerprint: Option<Vec<u8>>,
    response: proto::Text,
}

#[derive(Clone, Message)]
struct PersistedEchoActor {
    #[prost(message, optional, tag = "1")]
    state: Option<proto::Echo>,
    #[prost(message, repeated, tag = "2")]
    completed_writes: Vec<PersistedWrite>,
}

#[derive(Clone, Message)]
struct PersistedWrite {
    #[prost(string, tag = "1")]
    idempotency_key: String,
    #[prost(message, optional, tag = "2")]
    response: Option<proto::Text>,
    #[prost(bytes = "vec", optional, tag = "3")]
    request_fingerprint: Option<Vec<u8>>,
}

impl FileBackedEchoActor {
    fn open(path: PathBuf) -> io::Result<Self> {
        let state = if path.exists() {
            decode_actor(&fs::read(&path)?)?
        } else {
            FileBackedEchoActorState {
                state: proto::Echo::default(),
                completed_writes: HashMap::new(),
            }
        };
        Ok(Self {
            path,
            inner: Mutex::new(state),
        })
    }

    fn reader<Value>(&self, read: impl FnOnce(&proto::Echo) -> Value) -> Value {
        let guard = self.inner.lock().expect("actor state mutex poisoned");
        read(&guard.state)
    }

    fn writer(
        &self,
        idempotency_key: Uuid,
        request_fingerprint: Vec<u8>,
        message: proto::Text,
    ) -> Result<proto::Text, Status> {
        let mut guard = self.inner.lock().expect("actor state mutex poisoned");
        if let Some(completed) = guard.completed_writes.get(&idempotency_key) {
            if completed
                .request_fingerprint
                .as_deref()
                .is_some_and(|stored| stored != request_fingerprint)
            {
                return Err(Status::failed_precondition(
                    "idempotency key was reused with a different request",
                ));
            }
            return Ok(completed.response.clone());
        }

        let checkpoint = guard.clone();
        guard.state.last_message = Some(message.clone());
        guard.completed_writes.insert(
            idempotency_key,
            PersistedCompletedWrite {
                request_fingerprint: Some(request_fingerprint),
                response: message.clone(),
            },
        );
        if let Err(error) = persist_actor(&self.path, &guard) {
            *guard = checkpoint;
            return Err(Status::internal(format!(
                "failed to persist actor state: {error}"
            )));
        }
        Ok(message)
    }
}

fn actor_path(root: &Path, state_ref: &str) -> PathBuf {
    let encoded = state_ref
        .as_bytes()
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect::<String>();
    root.join(format!("{encoded}.rbt"))
}

fn decode_actor(bytes: &[u8]) -> io::Result<FileBackedEchoActorState> {
    let persisted = PersistedEchoActor::decode(bytes)
        .map_err(|error| io::Error::new(io::ErrorKind::InvalidData, error))?;
    let mut completed_writes = HashMap::with_capacity(persisted.completed_writes.len());
    for write in persisted.completed_writes {
        let key = Uuid::parse_str(&write.idempotency_key)
            .map_err(|error| io::Error::new(io::ErrorKind::InvalidData, error))?;
        let response = write.response.ok_or_else(|| {
            io::Error::new(
                io::ErrorKind::InvalidData,
                "persisted write has no response",
            )
        })?;
        if completed_writes
            .insert(
                key,
                PersistedCompletedWrite {
                    request_fingerprint: write.request_fingerprint,
                    response,
                },
            )
            .is_some()
        {
            return Err(io::Error::new(
                io::ErrorKind::InvalidData,
                "persisted idempotency key is duplicated",
            ));
        }
    }
    Ok(FileBackedEchoActorState {
        state: persisted.state.unwrap_or_default(),
        completed_writes,
    })
}

fn persist_actor(path: &Path, state: &FileBackedEchoActorState) -> io::Result<()> {
    let persisted = PersistedEchoActor {
        state: Some(state.state.clone()),
        completed_writes: state
            .completed_writes
            .iter()
            .map(|(key, completed)| PersistedWrite {
                idempotency_key: key.to_string(),
                response: Some(completed.response.clone()),
                request_fingerprint: completed.request_fingerprint.clone(),
            })
            .collect(),
    };
    let mut bytes = Vec::new();
    persisted.encode(&mut bytes).map_err(io::Error::other)?;

    let temporary = path.with_extension(format!("{}.tmp", Uuid::new_v4()));
    let result = (|| {
        let mut file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temporary)?;
        file.write_all(&bytes)?;
        file.sync_all()?;
        fs::rename(&temporary, path)?;
        File::open(path.parent().expect("actor path has a parent"))?.sync_all()?;
        Ok(())
    })();
    if result.is_err() {
        let _ = fs::remove_file(&temporary);
    }
    result
}

/// State that can be durably stored through Reboot's Database sidecar.
pub trait RebootState: Message + Default + Clone + Send + Sync + 'static {
    /// Fully-qualified protobuf state type used by the Database protocol.
    const STATE_TYPE: &'static str;
}

/// A generated declaration binding one durable state type to its Database
/// protocol state-type identifier.
///
/// Generated durable adapters use a local marker type implementing this trait
/// so downstream protobuf types do not require a trait implementation.
pub trait DurableStateDeclaration {
    /// Prost message stored for this declaration.
    type State: Message + Default + Clone + Send + Sync + 'static;

    /// Fully-qualified protobuf state type used by the Database protocol.
    const STATE_TYPE: &'static str;
}

/// Controls whether a missing state is implicitly created by a generated call.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum StateAdmission {
    /// Preserve the legacy public API behavior of using `State::default()`.
    DefaultOnAbsent,
    /// Reject calls until a supported constructor has stored the state.
    RequireExisting,
}

fn admit_state<State: Default>(
    state: Option<State>,
    admission: StateAdmission,
) -> Result<State, Status> {
    match (state, admission) {
        (Some(state), _) => Ok(state),
        (None, StateAdmission::DefaultOnAbsent) => Ok(State::default()),
        (None, StateAdmission::RequireExisting) => Err(Status::failed_precondition(
            "actor state must be constructed before this method can be called",
        )),
    }
}

impl RebootState for proto::Echo {
    const STATE_TYPE: &'static str = "tests.reboot.protoc.Echo";
}

impl RebootState for proto::Counter {
    const STATE_TYPE: &'static str = "tests.reboot.protoc.Counter";
}

/// Reusable durable actor storage backed by Reboot's Database sidecar.
///
/// A `Store(sync=true)` atomically persists actor state and a writer's
/// idempotent response. Locks are scoped by normalized endpoint, state type,
/// and state reference within this process.
#[derive(Clone)]
pub struct DatabaseActorStore {
    database: database::database_client::DatabaseClient<tonic::transport::Channel>,
    endpoint: String,
}

impl DatabaseActorStore {
    /// Connects to an existing Reboot Database sidecar.
    pub async fn connect(endpoint: impl AsRef<str>) -> Result<Self, tonic::transport::Error> {
        let endpoint = tonic::transport::Endpoint::from_shared(endpoint.as_ref().to_owned())?;
        let endpoint_uri = endpoint.uri().to_string();
        Ok(Self {
            database: database::database_client::DatabaseClient::connect(endpoint).await?,
            endpoint: endpoint_uri,
        })
    }

    /// Creates a store whose channel connects on its first request.
    pub fn connect_lazy(endpoint: impl AsRef<str>) -> Result<Self, tonic::transport::Error> {
        let endpoint = tonic::transport::Endpoint::from_shared(endpoint.as_ref().to_owned())?;
        let endpoint_uri = endpoint.uri().to_string();
        Ok(Self {
            database: database::database_client::DatabaseClient::new(endpoint.connect_lazy()),
            endpoint: endpoint_uri,
        })
    }

    fn lock_for_type(&self, state_type: &str, state_ref: &str) -> ActorGate {
        same_actor_gate(&self.endpoint, state_type, state_ref)
    }

    /// Returns the exact per-sidecar actor gate used by normal store access.
    ///
    /// Durable transaction participants for this Database sidecar must use the
    /// same gate so an exclusive transaction cannot race a normal method.
    pub fn actor_gate(&self, state_type: &str, state_ref: &str) -> ActorGate {
        self.lock_for_type(state_type, state_ref)
    }

    pub fn database_endpoint(&self) -> &str {
        &self.endpoint
    }

    pub(crate) fn task_database(
        &self,
    ) -> database::database_client::DatabaseClient<tonic::transport::Channel> {
        self.database.clone()
    }

    /// Loads the current state for an actor, if it has been stored.
    pub async fn load<State: RebootState>(&self, state_ref: &str) -> Result<Option<State>, Status> {
        self.load_type(State::STATE_TYPE, state_ref).await
    }

    async fn load_type<State: Message + Default>(
        &self,
        state_type: &str,
        state_ref: &str,
    ) -> Result<Option<State>, Status> {
        let mut database = self.database.clone();
        let response = database
            .load(database::LoadRequest {
                actors: vec![database::Actor {
                    state_type: state_type.to_owned(),
                    state_ref: state_ref.to_owned(),
                    state: None,
                }],
                task_ids: vec![],
            })
            .await
            .map_err(database_status)?
            .into_inner();
        let Some(actor) = response.actors.into_iter().next() else {
            return Ok(None);
        };
        let Some(state) = actor.state else {
            return Ok(None);
        };
        State::decode(state.as_slice()).map(Some).map_err(|error| {
            Status::internal(format!("invalid persisted {state_type} state: {error}"))
        })
    }

    /// Loads a generated state snapshot. The caller owns actor admission.
    pub async fn load_for_declaration<D: DurableStateDeclaration>(
        &self,
        state_ref: &str,
    ) -> Result<Option<D::State>, Status> {
        self.load_type(D::STATE_TYPE, state_ref).await
    }

    /// Returns a completed response for a writer idempotency key, if present.
    pub async fn replay<State: RebootState, Response: Message + Default>(
        &self,
        state_ref: &str,
        key: Uuid,
    ) -> Result<Option<Response>, Status> {
        self.replay_type(State::STATE_TYPE, state_ref, key, None)
            .await
    }

    async fn replay_type<Response: Message + Default>(
        &self,
        state_type: &str,
        state_ref: &str,
        key: Uuid,
        request_fingerprint: Option<&[u8]>,
    ) -> Result<Option<Response>, Status> {
        let mut database = self.database.clone();
        let mut stream = database
            .recover_idempotent_mutations(database::RecoverIdempotentMutationsRequest {
                state_type: state_type.to_owned(),
                state_ref: state_ref.to_owned(),
                idempotency_key: Some(key.as_bytes().to_vec()),
                workflow_id: None,
                workflow_iteration: None,
            })
            .await
            .map_err(database_status)?
            .into_inner();
        while let Some(response) = stream.message().await.map_err(database_status)? {
            for mutation in response.idempotent_mutations {
                if mutation.key == key.as_bytes() {
                    if request_fingerprint.is_some_and(|expected| {
                        mutation
                            .request_fingerprint
                            .as_deref()
                            .is_some_and(|stored| !stored.is_empty() && stored != expected)
                    }) {
                        return Err(Status::failed_precondition(
                            "idempotency key was reused with a different request",
                        ));
                    }
                    return Response::decode(mutation.response.as_slice())
                        .map(Some)
                        .map_err(|error| {
                            Status::internal(format!(
                                "invalid persisted idempotent response for {state_type}: {error}"
                            ))
                        });
                }
            }
        }
        Ok(None)
    }

    /// Atomically stores state and its idempotent writer response.
    pub async fn store<State: RebootState, Response: Message>(
        &self,
        state_ref: &str,
        key: Uuid,
        state: State,
        response: Response,
    ) -> Result<(), Status> {
        self.store_type(State::STATE_TYPE, state_ref, key, state, response, None)
            .await
    }

    async fn store_type<State: Message, Response: Message>(
        &self,
        state_type: &str,
        state_ref: &str,
        key: Uuid,
        state: State,
        response: Response,
        request_fingerprint: Option<Vec<u8>>,
    ) -> Result<(), Status> {
        let mut database = self.database.clone();
        database
            .store(database::StoreRequest {
                actor_upserts: vec![database::Actor {
                    state_type: state_type.to_owned(),
                    state_ref: state_ref.to_owned(),
                    state: Some(state.encode_to_vec()),
                }],
                task_upserts: vec![],
                colocated_upserts: vec![],
                transaction: None,
                idempotent_mutation: Some(database::IdempotentMutation {
                    state_type: state_type.to_owned(),
                    state_ref: state_ref.to_owned(),
                    key: key.as_bytes().to_vec(),
                    response: response.encode_to_vec(),
                    task_ids: vec![],
                    workflow_id: None,
                    workflow_iteration: None,
                    request_fingerprint,
                }),
                ensure_state_types_created: vec![],
                sync: true,
            })
            .await
            .map_err(database_status)?;
        Ok(())
    }

    /// Runs a synchronous writer callback inside the durable actor envelope.
    ///
    /// This compatibility API fingerprints protobuf requests with the stable
    /// synthetic identity `reboot.runtime.writer.v1/<state_type>`. Generated
    /// adapters should use [`Self::writer_async_for_method`] so fingerprints
    /// include the fully-qualified protobuf RPC name.
    pub async fn writer<State, RequestBody, ResponseBody, F>(
        &self,
        state_type: &'static str,
        request: Request<RequestBody>,
        invoke: F,
    ) -> Result<Response<ResponseBody>, Status>
    where
        State: Message + Default + Clone + Send + Sync + 'static,
        RequestBody: Message + Send + 'static,
        ResponseBody: Message + Default + Clone + Send + 'static,
        F: FnOnce(&mut State, RequestBody) -> Result<ResponseBody, Status>,
    {
        let method_identity = format!("reboot.runtime.writer.v1/{state_type}");
        let fingerprint = request_fingerprint(&method_identity, request.get_ref());
        let state_ref = required_metadata(&request, STATE_REF_HEADER)?;
        let key = idempotency_key(&request)?;
        let lock = self.lock_for_type(state_type, &state_ref);
        let _guard = lock.exclusive().await;
        if let Some(response) = self
            .replay_type(state_type, &state_ref, key, Some(&fingerprint))
            .await?
        {
            return Ok(Response::new(response));
        }
        let mut state = self
            .load_type(state_type, &state_ref)
            .await?
            .unwrap_or_default();
        let response = invoke(&mut state, request.into_inner())?;
        self.store_type(
            state_type,
            &state_ref,
            key,
            state,
            response.clone(),
            Some(fingerprint),
        )
        .await?;
        Ok(Response::new(response))
    }

    /// Runs an asynchronous writer callback inside the durable actor envelope.
    ///
    /// This compatibility API uses the deterministic synthetic method identity
    /// documented on [`Self::writer`].
    pub async fn writer_async<State, RequestBody, ResponseBody, F>(
        &self,
        state_type: &'static str,
        request: Request<RequestBody>,
        invoke: F,
    ) -> Result<Response<ResponseBody>, Status>
    where
        State: Message + Default + Clone + Send + Sync + 'static,
        RequestBody: Message + Send + 'static,
        ResponseBody: Message + Default + Clone + Send + 'static,
        F: for<'a> FnOnce(
            &'a mut State,
            RequestBody,
        ) -> Pin<
            Box<dyn Future<Output = Result<ResponseBody, Status>> + Send + 'a>,
        >,
    {
        let method_identity = format!("reboot.runtime.writer.v1/{state_type}");
        self.writer_async_with_method(state_type, &method_identity, request, invoke)
            .await
    }

    /// Runs an asynchronous writer using an explicit method identity.
    ///
    /// `method_identity` must be the fully-qualified protobuf RPC name when
    /// one exists, such as `package.Service.Method`.
    pub async fn writer_async_with_method<State, RequestBody, ResponseBody, F>(
        &self,
        state_type: &'static str,
        method_identity: &str,
        request: Request<RequestBody>,
        invoke: F,
    ) -> Result<Response<ResponseBody>, Status>
    where
        State: Message + Default + Clone + Send + Sync + 'static,
        RequestBody: Message + Send + 'static,
        ResponseBody: Message + Default + Clone + Send + 'static,
        F: for<'a> FnOnce(
            &'a mut State,
            RequestBody,
        ) -> Pin<
            Box<dyn Future<Output = Result<ResponseBody, Status>> + Send + 'a>,
        >,
    {
        self.writer_async_with_method_admission(
            state_type,
            method_identity,
            StateAdmission::DefaultOnAbsent,
            None,
            request,
            invoke,
        )
        .await
    }

    /// Runs a generated writer with bounded external bearer authentication and
    /// authorization. The policy is evaluated before replay and handler work;
    /// authorization receives immutable request/state snapshots.
    pub async fn writer_async_for_method_authorized<Declaration, RequestBody, ResponseBody, F>(
        &self,
        method_identity: &'static str,
        authorization: &crate::auth::AuthorizationPolicy,
        request: Request<RequestBody>,
        invoke: F,
    ) -> Result<Response<ResponseBody>, Status>
    where
        Declaration: DurableStateDeclaration,
        RequestBody: Message + Send + 'static,
        ResponseBody: Message + Default + Clone + Send + 'static,
        F: for<'a> FnOnce(
            &'a mut Declaration::State,
            RequestBody,
        ) -> Pin<
            Box<dyn Future<Output = Result<ResponseBody, Status>> + Send + 'a>,
        >,
    {
        self.writer_async_with_method_admission(
            Declaration::STATE_TYPE,
            method_identity,
            StateAdmission::DefaultOnAbsent,
            Some(authorization),
            request,
            invoke,
        )
        .await
    }

    /// Runs a generated non-constructor writer with bounded external bearer
    /// authentication and authorization. The policy is evaluated before the
    /// handler and persistence; replay remains ahead of state authorization.
    pub async fn writer_async_for_method_with_admission_authorized<
        Declaration,
        RequestBody,
        ResponseBody,
        F,
    >(
        &self,
        method_identity: &str,
        admission: StateAdmission,
        authorization: &crate::auth::AuthorizationPolicy,
        request: Request<RequestBody>,
        invoke: F,
    ) -> Result<Response<ResponseBody>, Status>
    where
        Declaration: DurableStateDeclaration,
        RequestBody: Message + Send + 'static,
        ResponseBody: Message + Default + Clone + Send + 'static,
        F: for<'a> FnOnce(
            &'a mut Declaration::State,
            RequestBody,
        ) -> Pin<
            Box<dyn Future<Output = Result<ResponseBody, Status>> + Send + 'a>,
        >,
    {
        self.writer_async_with_method_admission(
            Declaration::STATE_TYPE,
            method_identity,
            admission,
            Some(authorization),
            request,
            invoke,
        )
        .await
    }

    async fn writer_async_with_method_admission<State, RequestBody, ResponseBody, F>(
        &self,
        state_type: &'static str,
        method_identity: &str,
        admission: StateAdmission,
        authorization: Option<&crate::auth::AuthorizationPolicy>,
        request: Request<RequestBody>,
        invoke: F,
    ) -> Result<Response<ResponseBody>, Status>
    where
        State: Message + Default + Clone + Send + Sync + 'static,
        RequestBody: Message + Send + 'static,
        ResponseBody: Message + Default + Clone + Send + 'static,
        F: for<'a> FnOnce(
            &'a mut State,
            RequestBody,
        ) -> Pin<
            Box<dyn Future<Output = Result<ResponseBody, Status>> + Send + 'a>,
        >,
    {
        let verified = match authorization {
            Some(policy) => Some(
                policy
                    .verify(
                        crate::RebootHeaders::from_request(&request)
                            .map_err(|error| Status::invalid_argument(error.to_string()))?,
                        state_type,
                        method_identity,
                    )
                    .await?,
            ),
            None => None,
        };
        let fingerprint = request_fingerprint(method_identity, request.get_ref());
        let state_ref = required_metadata(&request, STATE_REF_HEADER)?;
        let key = idempotency_key(&request)?;
        let lock = self.lock_for_type(state_type, &state_ref);
        let _guard = lock.exclusive().await;
        if let Some(response) = self
            .replay_type(state_type, &state_ref, key, Some(&fingerprint))
            .await?
        {
            return Ok(Response::new(response));
        }
        let mut state: State =
            admit_state(self.load_type(state_type, &state_ref).await?, admission)?;
        if let (Some(policy), Some((context, auth))) = (authorization, verified.as_ref()) {
            policy
                .authorize(
                    context,
                    auth.as_ref(),
                    Some(&state.encode_to_vec()),
                    &request.get_ref().encode_to_vec(),
                )
                .await?;
        }
        let response = invoke(&mut state, request.into_inner()).await?;
        self.store_type(
            state_type,
            &state_ref,
            key,
            state,
            response.clone(),
            Some(fingerprint),
        )
        .await?;
        Ok(Response::new(response))
    }

    /// Runs an asynchronous writer callback using a durable state declaration.
    ///
    /// This compatibility API uses the deterministic synthetic method identity
    /// documented on [`Self::writer`]. Generated adapters use
    /// [`Self::writer_async_for_method`] instead.
    pub async fn writer_async_for<Declaration, RequestBody, ResponseBody, F>(
        &self,
        request: Request<RequestBody>,
        invoke: F,
    ) -> Result<Response<ResponseBody>, Status>
    where
        Declaration: DurableStateDeclaration,
        RequestBody: Message + Send + 'static,
        ResponseBody: Message + Default + Clone + Send + 'static,
        F: for<'a> FnOnce(
            &'a mut Declaration::State,
            RequestBody,
        ) -> Pin<
            Box<dyn Future<Output = Result<ResponseBody, Status>> + Send + 'a>,
        >,
    {
        self.writer_async::<Declaration::State, _, _, _>(Declaration::STATE_TYPE, request, invoke)
            .await
    }

    /// Runs a generated writer with its fully-qualified protobuf RPC name.
    pub async fn writer_async_for_method<Declaration, RequestBody, ResponseBody, F>(
        &self,
        method_identity: &str,
        request: Request<RequestBody>,
        invoke: F,
    ) -> Result<Response<ResponseBody>, Status>
    where
        Declaration: DurableStateDeclaration,
        RequestBody: Message + Send + 'static,
        ResponseBody: Message + Default + Clone + Send + 'static,
        F: for<'a> FnOnce(
            &'a mut Declaration::State,
            RequestBody,
        ) -> Pin<
            Box<dyn Future<Output = Result<ResponseBody, Status>> + Send + 'a>,
        >,
    {
        self.writer_async_with_method::<Declaration::State, _, _, _>(
            Declaration::STATE_TYPE,
            method_identity,
            request,
            invoke,
        )
        .await
    }

    /// Runs a generated writer with an explicit admission policy.
    pub async fn writer_async_for_method_with_admission<Declaration, RequestBody, ResponseBody, F>(
        &self,
        method_identity: &str,
        admission: StateAdmission,
        request: Request<RequestBody>,
        invoke: F,
    ) -> Result<Response<ResponseBody>, Status>
    where
        Declaration: DurableStateDeclaration,
        RequestBody: Message + Send + 'static,
        ResponseBody: Message + Default + Clone + Send + 'static,
        F: for<'a> FnOnce(
            &'a mut Declaration::State,
            RequestBody,
        ) -> Pin<
            Box<dyn Future<Output = Result<ResponseBody, Status>> + Send + 'a>,
        >,
    {
        self.writer_async_with_method_admission::<Declaration::State, _, _, _>(
            Declaration::STATE_TYPE,
            method_identity,
            admission,
            None,
            request,
            invoke,
        )
        .await
    }

    /// Runs a generated unary constructor writer. Replays are checked before
    /// state existence, then the sidecar atomically creates absent state and
    /// its response record; this is safe across SDK processes sharing a sidecar.
    pub async fn constructor_writer_async_for_method<Declaration, RequestBody, ResponseBody, F>(
        &self,
        method_identity: &str,
        request: Request<RequestBody>,
        invoke: F,
    ) -> Result<Response<ResponseBody>, Status>
    where
        Declaration: DurableStateDeclaration,
        RequestBody: Message + Send + 'static,
        ResponseBody: Message + Default + Clone + Send + 'static,
        F: for<'a> FnOnce(
            &'a mut Declaration::State,
            RequestBody,
        ) -> Pin<
            Box<dyn Future<Output = Result<ResponseBody, Status>> + Send + 'a>,
        >,
    {
        let fingerprint = request_fingerprint(method_identity, request.get_ref());
        let state_ref = required_metadata(&request, STATE_REF_HEADER)?;
        let key = idempotency_key(&request)?;
        // The lock only avoids duplicate handler execution in this process.
        // The CreateActor RPC is the cross-process correctness boundary.
        let lock = self.lock_for_type(Declaration::STATE_TYPE, &state_ref);
        let _guard = lock.exclusive().await;
        if let Some(response) = self
            .replay_type(Declaration::STATE_TYPE, &state_ref, key, Some(&fingerprint))
            .await?
        {
            return Ok(Response::new(response));
        }
        if self
            .load_type::<Declaration::State>(Declaration::STATE_TYPE, &state_ref)
            .await?
            .is_some()
        {
            return Err(Status::failed_precondition(
                "actor state has already been constructed",
            ));
        }
        let mut state = Declaration::State::default();
        let response = invoke(&mut state, request.into_inner()).await?;
        let mut database = self.database.clone();
        database
            .create_actor(database::CreateActorRequest {
                actor: Some(database::Actor {
                    state_type: Declaration::STATE_TYPE.to_owned(),
                    state_ref: state_ref.clone(),
                    state: Some(state.encode_to_vec()),
                }),
                idempotent_mutation: Some(database::IdempotentMutation {
                    state_type: Declaration::STATE_TYPE.to_owned(),
                    state_ref,
                    key: key.as_bytes().to_vec(),
                    response: response.encode_to_vec(),
                    task_ids: vec![],
                    workflow_id: None,
                    workflow_iteration: None,
                    request_fingerprint: Some(fingerprint),
                }),
                sync: true,
            })
            .await
            .map_err(database_status)?;
        Ok(Response::new(response))
    }

    /// Runs a generated external constructor writer with bearer verification
    /// before replay/load and authorization before existence is exposed.
    pub async fn constructor_writer_async_for_method_authorized<
        Declaration,
        RequestBody,
        ResponseBody,
        F,
    >(
        &self,
        method_identity: &str,
        authorization: &crate::auth::AuthorizationPolicy,
        request: Request<RequestBody>,
        invoke: F,
    ) -> Result<Response<ResponseBody>, Status>
    where
        Declaration: DurableStateDeclaration,
        RequestBody: Message + Send + 'static,
        ResponseBody: Message + Default + Clone + Send + 'static,
        F: for<'a> FnOnce(
            &'a mut Declaration::State,
            RequestBody,
        ) -> Pin<
            Box<dyn Future<Output = Result<ResponseBody, Status>> + Send + 'a>,
        >,
    {
        let (context, auth) = authorization
            .verify(
                crate::RebootHeaders::from_request(&request)
                    .map_err(|error| Status::invalid_argument(error.to_string()))?,
                Declaration::STATE_TYPE,
                method_identity,
            )
            .await?;
        let fingerprint = request_fingerprint(method_identity, request.get_ref());
        let state_ref = required_metadata(&request, STATE_REF_HEADER)?;
        let key = idempotency_key(&request)?;
        let lock = self.lock_for_type(Declaration::STATE_TYPE, &state_ref);
        let _guard = lock.exclusive().await;
        if let Some(response) = self
            .replay_type(Declaration::STATE_TYPE, &state_ref, key, Some(&fingerprint))
            .await?
        {
            return Ok(Response::new(response));
        }
        let state = self
            .load_type::<Declaration::State>(Declaration::STATE_TYPE, &state_ref)
            .await?;
        let state_bytes = state.as_ref().map(prost::Message::encode_to_vec);
        authorization
            .authorize(
                &context,
                auth.as_ref(),
                state_bytes.as_deref(),
                &request.get_ref().encode_to_vec(),
            )
            .await?;
        if state.is_some() {
            return Err(Status::failed_precondition(
                "actor state has already been constructed",
            ));
        }
        let mut state = Declaration::State::default();
        let response = invoke(&mut state, request.into_inner()).await?;
        let mut database = self.database.clone();
        database
            .create_actor(database::CreateActorRequest {
                actor: Some(database::Actor {
                    state_type: Declaration::STATE_TYPE.to_owned(),
                    state_ref: state_ref.clone(),
                    state: Some(state.encode_to_vec()),
                }),
                idempotent_mutation: Some(database::IdempotentMutation {
                    state_type: Declaration::STATE_TYPE.to_owned(),
                    state_ref,
                    key: key.as_bytes().to_vec(),
                    response: response.encode_to_vec(),
                    task_ids: vec![],
                    workflow_id: None,
                    workflow_iteration: None,
                    request_fingerprint: Some(fingerprint),
                }),
                sync: true,
            })
            .await
            .map_err(database_status)?;
        Ok(Response::new(response))
    }

    /// Runs a synchronous reader callback after loading the actor state.
    pub async fn reader<State, RequestBody, ResponseBody, F>(
        &self,
        state_type: &'static str,
        request: Request<RequestBody>,
        invoke: F,
    ) -> Result<Response<ResponseBody>, Status>
    where
        State: Message + Default + Clone + Send + Sync + 'static,
        RequestBody: Send + 'static,
        ResponseBody: Message + Default + Send + 'static,
        F: FnOnce(&State, RequestBody) -> Result<ResponseBody, Status>,
    {
        let state_ref = required_metadata(&request, STATE_REF_HEADER)?;
        let state = self
            .load_type(state_type, &state_ref)
            .await?
            .unwrap_or_default();
        Ok(Response::new(invoke(&state, request.into_inner())?))
    }

    /// Runs an asynchronous reader callback after loading the actor state.
    pub async fn reader_async<State, RequestBody, ResponseBody, F>(
        &self,
        state_type: &'static str,
        request: Request<RequestBody>,
        invoke: F,
    ) -> Result<Response<ResponseBody>, Status>
    where
        State: Message + Default + Clone + Send + Sync + 'static,
        RequestBody: Send + 'static,
        ResponseBody: Message + Default + Send + 'static,
        F: for<'a> FnOnce(
            &'a State,
            RequestBody,
        ) -> Pin<
            Box<dyn Future<Output = Result<ResponseBody, Status>> + Send + 'a>,
        >,
    {
        let state_ref = required_metadata(&request, STATE_REF_HEADER)?;
        let state = self
            .load_type(state_type, &state_ref)
            .await?
            .unwrap_or_default();
        Ok(Response::new(invoke(&state, request.into_inner()).await?))
    }

    /// Runs an asynchronous reader callback using a durable state declaration.
    ///
    /// This is equivalent to [`Self::reader_async`] with the declaration's
    /// state type and canonical Database protocol state-type identifier.
    pub async fn reader_async_for<Declaration, RequestBody, ResponseBody, F>(
        &self,
        request: Request<RequestBody>,
        invoke: F,
    ) -> Result<Response<ResponseBody>, Status>
    where
        Declaration: DurableStateDeclaration,
        RequestBody: Send + 'static,
        ResponseBody: Message + Default + Send + 'static,
        F: for<'a> FnOnce(
            &'a Declaration::State,
            RequestBody,
        ) -> Pin<
            Box<dyn Future<Output = Result<ResponseBody, Status>> + Send + 'a>,
        >,
    {
        self.reader_async::<Declaration::State, _, _, _>(Declaration::STATE_TYPE, request, invoke)
            .await
    }

    /// Runs a generated external reader after bearer authentication and
    /// authorization against immutable protobuf snapshots.
    pub async fn reader_async_for_with_admission_authorized<
        Declaration,
        RequestBody,
        ResponseBody,
        F,
    >(
        &self,
        method_identity: &str,
        admission: StateAdmission,
        authorization: &crate::auth::AuthorizationPolicy,
        request: Request<RequestBody>,
        invoke: F,
    ) -> Result<Response<ResponseBody>, Status>
    where
        Declaration: DurableStateDeclaration,
        RequestBody: Message + Send + 'static,
        ResponseBody: Message + Default + Send + 'static,
        F: for<'a> FnOnce(
            &'a Declaration::State,
            RequestBody,
        ) -> Pin<
            Box<dyn Future<Output = Result<ResponseBody, Status>> + Send + 'a>,
        >,
    {
        let (context, auth) = authorization
            .verify(
                crate::RebootHeaders::from_request(&request)
                    .map_err(|error| Status::invalid_argument(error.to_string()))?,
                Declaration::STATE_TYPE,
                method_identity,
            )
            .await?;
        let state_ref = required_metadata(&request, STATE_REF_HEADER)?;
        let state = admit_state(
            self.load_type::<Declaration::State>(Declaration::STATE_TYPE, &state_ref)
                .await?,
            admission,
        )?;
        authorization
            .authorize(
                &context,
                auth.as_ref(),
                Some(&state.encode_to_vec()),
                &request.get_ref().encode_to_vec(),
            )
            .await?;
        Ok(Response::new(invoke(&state, request.into_inner()).await?))
    }

    /// Runs a generated reader with an explicit admission policy.
    pub async fn reader_async_for_with_admission<Declaration, RequestBody, ResponseBody, F>(
        &self,
        admission: StateAdmission,
        request: Request<RequestBody>,
        invoke: F,
    ) -> Result<Response<ResponseBody>, Status>
    where
        Declaration: DurableStateDeclaration,
        RequestBody: Send + 'static,
        ResponseBody: Message + Default + Send + 'static,
        F: for<'a> FnOnce(
            &'a Declaration::State,
            RequestBody,
        ) -> Pin<
            Box<dyn Future<Output = Result<ResponseBody, Status>> + Send + 'a>,
        >,
    {
        let state_ref = required_metadata(&request, STATE_REF_HEADER)?;
        let state = admit_state(
            self.load_type::<Declaration::State>(Declaration::STATE_TYPE, &state_ref)
                .await?,
            admission,
        )?;
        Ok(Response::new(invoke(&state, request.into_inner()).await?))
    }
}
#[derive(Clone)]
pub struct EchoMethodsAdapter {
    store: DatabaseActorStore,
}

impl EchoMethodsAdapter {
    pub fn new(store: DatabaseActorStore) -> Self {
        Self { store }
    }

    pub async fn connect(endpoint: impl AsRef<str>) -> Result<Self, tonic::transport::Error> {
        Ok(Self::new(DatabaseActorStore::connect(endpoint).await?))
    }
}

/// Concrete generated-style adapter shared by Counter's writer and reader services.
#[derive(Clone)]
pub struct CounterAdapter {
    store: DatabaseActorStore,
}

impl CounterAdapter {
    pub fn new(store: DatabaseActorStore) -> Self {
        Self { store }
    }

    pub async fn connect(endpoint: impl AsRef<str>) -> Result<Self, tonic::transport::Error> {
        Ok(Self::new(DatabaseActorStore::connect(endpoint).await?))
    }
}

fn database_status(error: tonic::Status) -> Status {
    Status::with_details_and_metadata(
        error.code(),
        format!("Reboot database sidecar request failed: {error}"),
        error.details().to_vec().into(),
        error.metadata().clone(),
    )
}

fn required_metadata(request: &Request<impl Sized>, name: &'static str) -> Result<String, Status> {
    let value = request
        .metadata()
        .get(name)
        .ok_or_else(|| Status::invalid_argument(format!("missing required metadata `{name}`")))?;
    let value = value
        .to_str()
        .map_err(|_| Status::invalid_argument(format!("metadata `{name}` must be valid ASCII")))?;
    if value.is_empty() {
        return Err(Status::invalid_argument(format!(
            "metadata `{name}` must not be empty"
        )));
    }
    Ok(value.to_owned())
}

fn idempotency_key<T>(request: &Request<T>) -> Result<Uuid, Status> {
    let value = required_metadata(request, IDEMPOTENCY_KEY_HEADER)?;
    let key = Uuid::parse_str(&value).map_err(|_| {
        Status::invalid_argument(format!(
            "metadata `{IDEMPOTENCY_KEY_HEADER}` must be a UUID"
        ))
    })?;
    check_idempotency_key_not_expired(key)?;
    Ok(key)
}

/// Rejects a UUIDv7 idempotency key whose embedded expiry timestamp is already
/// in the past. Other UUID versions intentionally retain Python compatibility.
pub fn check_idempotency_key_not_expired(key: Uuid) -> Result<(), Status> {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|_| Status::internal("system clock predates Unix epoch"))?
        .as_millis();
    check_idempotency_key_not_expired_at(key, now)
}

fn check_idempotency_key_not_expired_at(key: Uuid, now_ms: u128) -> Result<(), Status> {
    if key.get_version_num() != 7 {
        return Ok(());
    }
    let bytes = key.as_bytes();
    let timestamp_ms = bytes[..6].iter().fold(0_u128, |timestamp, byte| {
        (timestamp << 8) | u128::from(*byte)
    });
    if timestamp_ms < now_ms {
        return Err(Status::failed_precondition(
            "UUIDv7 idempotency key has expired",
        ));
    }
    Ok(())
}

#[tonic::async_trait]
impl proto::echo_methods_server::EchoMethods for InMemoryHost {
    async fn reply(&self, request: Request<proto::Text>) -> Result<Response<proto::Text>, Status> {
        let actor = self.actor_for(&request)?;
        let key = idempotency_key(&request)?;
        let fingerprint = request_fingerprint(ECHO_REPLY_METHOD_IDENTITY, request.get_ref());
        let message = request.into_inner();
        let response = actor
            .writer_with_fingerprint(key, fingerprint, |state| {
                state.last_message = Some(message.clone());
                message
            })
            .map_err(idempotency_collision_status)?;
        Ok(Response::new(response))
    }

    async fn last_message(
        &self,
        request: Request<proto::Empty>,
    ) -> Result<Response<proto::Text>, Status> {
        let actor = self.actor_for(&request)?;
        let message = actor.reader(|state| state.last_message.clone().unwrap_or_default());
        Ok(Response::new(message))
    }
}

#[tonic::async_trait]
impl proto::echo_methods_server::EchoMethods for FileBackedHost {
    async fn reply(&self, request: Request<proto::Text>) -> Result<Response<proto::Text>, Status> {
        let actor = self.actor_for(&request)?;
        let key = idempotency_key(&request)?;
        let fingerprint = request_fingerprint(ECHO_REPLY_METHOD_IDENTITY, request.get_ref());
        let message = request.into_inner();
        let response = actor.writer(key, fingerprint, message)?;
        Ok(Response::new(response))
    }

    async fn last_message(
        &self,
        request: Request<proto::Empty>,
    ) -> Result<Response<proto::Text>, Status> {
        let actor = self.actor_for(&request)?;
        let message = actor.reader(|state| state.last_message.clone().unwrap_or_default());
        Ok(Response::new(message))
    }
}

#[tonic::async_trait]
impl proto::echo_methods_server::EchoMethods for EchoMethodsAdapter {
    async fn reply(&self, request: Request<proto::Text>) -> Result<Response<proto::Text>, Status> {
        self.store
            .writer_async_with_method::<proto::Echo, _, _, _>(
                "tests.reboot.protoc.Echo",
                ECHO_REPLY_METHOD_IDENTITY,
                request,
                |state, request| {
                    Box::pin(async move {
                        state.last_message = Some(request.clone());
                        Ok(request)
                    })
                },
            )
            .await
    }

    async fn last_message(
        &self,
        request: Request<proto::Empty>,
    ) -> Result<Response<proto::Text>, Status> {
        let state_ref = required_metadata(&request, STATE_REF_HEADER)?;
        let state = self.store.load::<proto::Echo>(&state_ref).await?;
        Ok(Response::new(
            state
                .and_then(|state| state.last_message)
                .unwrap_or_default(),
        ))
    }
}

#[tonic::async_trait]
impl proto::counter_writes_methods_server::CounterWritesMethods for CounterAdapter {
    async fn increment(
        &self,
        request: Request<proto::IncrementRequest>,
    ) -> Result<Response<proto::CounterValue>, Status> {
        self.store
            .writer_async_with_method::<proto::Counter, _, _, _>(
                "tests.reboot.protoc.Counter",
                "tests.reboot.protoc.CounterWritesMethods.Increment",
                request,
                |state, request| {
                    Box::pin(async move {
                        tokio::task::yield_now().await;
                        state.value = state.value.checked_add(request.amount).ok_or_else(|| {
                            Status::invalid_argument("counter increment overflows int64")
                        })?;
                        Ok(proto::CounterValue { value: state.value })
                    })
                },
            )
            .await
    }
}

#[tonic::async_trait]
impl proto::counter_reads_methods_server::CounterReadsMethods for CounterAdapter {
    async fn get(
        &self,
        request: Request<proto::Empty>,
    ) -> Result<Response<proto::CounterValue>, Status> {
        self.store
            .reader_async::<proto::Counter, _, _, _>(
                "tests.reboot.protoc.Counter",
                request,
                |state, _| {
                    Box::pin(async move {
                        tokio::task::yield_now().await;
                        Ok(proto::CounterValue { value: state.value })
                    })
                },
            )
            .await
    }
}

#[cfg(any(test, feature = "test-support"))]
#[doc(hidden)]
pub mod test_support {
    use super::*;

    type DatabaseStream<T> = tokio_stream::Iter<std::vec::IntoIter<Result<T, Status>>>;

    /// Minimal durable fake exposed through the generated Database Tonic server.
    /// It implements only the storage semantics this runtime needs, while every
    /// unused generated RPC remains deliberately well-formed and inert.
    #[derive(Clone, Default)]
    pub struct FakeDatabase {
        state: Arc<Mutex<FakeDatabaseState>>,
    }

    #[derive(Default)]
    struct FakeDatabaseState {
        actors: HashMap<(String, String), Vec<u8>>,
        mutations: HashMap<(String, String, Vec<u8>), database::IdempotentMutation>,
        store_requests: Vec<database::StoreRequest>,
        create_requests: Vec<database::CreateActorRequest>,
    }

    impl FakeDatabase {
        pub fn store_requests(&self) -> Vec<database::StoreRequest> {
            self.state
                .lock()
                .expect("fake database mutex poisoned")
                .store_requests
                .clone()
        }

        pub fn create_requests(&self) -> Vec<database::CreateActorRequest> {
            self.state
                .lock()
                .expect("fake database mutex poisoned")
                .create_requests
                .clone()
        }
    }

    #[tonic::async_trait]
    impl database::database_server::Database for FakeDatabase {
        type PreloadStream = DatabaseStream<database::PreloadResponse>;
        type RecoverStream = DatabaseStream<database::RecoverResponse>;
        type RecoverIdempotentMutationsStream =
            DatabaseStream<database::RecoverIdempotentMutationsResponse>;
        type ExportStreamedStream = DatabaseStream<database::ExportResponse>;

        async fn colocated_range(
            &self,
            _: Request<database::ColocatedRangeRequest>,
        ) -> Result<Response<database::ColocatedRangeResponse>, Status> {
            Ok(Response::new(database::ColocatedRangeResponse::default()))
        }

        async fn colocated_reverse_range(
            &self,
            _: Request<database::ColocatedReverseRangeRequest>,
        ) -> Result<Response<database::ColocatedReverseRangeResponse>, Status> {
            Ok(Response::new(
                database::ColocatedReverseRangeResponse::default(),
            ))
        }

        async fn find(
            &self,
            _: Request<database::FindRequest>,
        ) -> Result<Response<database::FindResponse>, Status> {
            Ok(Response::new(database::FindResponse::default()))
        }

        async fn load(
            &self,
            request: Request<database::LoadRequest>,
        ) -> Result<Response<database::LoadResponse>, Status> {
            let state = self.state.lock().expect("fake database mutex poisoned");
            let actors = request
                .into_inner()
                .actors
                .into_iter()
                .map(|actor| database::Actor {
                    state: state
                        .actors
                        .get(&(actor.state_type.clone(), actor.state_ref.clone()))
                        .cloned(),
                    ..actor
                })
                .collect();
            Ok(Response::new(database::LoadResponse {
                actors,
                tasks: vec![],
                timestamp: None,
            }))
        }

        async fn preload(
            &self,
            _: Request<database::PreloadRequest>,
        ) -> Result<Response<Self::PreloadStream>, Status> {
            Ok(Response::new(tokio_stream::iter(vec![])))
        }

        async fn complete_task(
            &self,
            _request: Request<database::CompleteTaskRequest>,
        ) -> Result<Response<database::CompleteTaskResponse>, Status> {
            // The RocksDB/gRPC suite owns CAS evidence. This actor-store fake
            // intentionally does not simulate durable task completion.
            Err(Status::unimplemented("task completion is not modeled"))
        }

        async fn store(
            &self,
            request: Request<database::StoreRequest>,
        ) -> Result<Response<database::StoreResponse>, Status> {
            let request = request.into_inner();
            let [actor] = request.actor_upserts.as_slice() else {
                return Err(Status::failed_precondition(
                    "expected exactly one actor upsert",
                ));
            };
            let Some(actor_state) = actor.state.clone() else {
                return Err(Status::failed_precondition("actor upsert has no state"));
            };
            let Some(mutation) = request.idempotent_mutation.clone() else {
                return Err(Status::failed_precondition(
                    "expected idempotent mutation in the same Store request",
                ));
            };
            if !request.sync
                || mutation.state_type != actor.state_type
                || mutation.state_ref != actor.state_ref
            {
                return Err(Status::failed_precondition(
                    "Store must synchronously atomically contain matching state and mutation",
                ));
            }

            // Validate the full request before making either durable value visible.
            let mut state = self.state.lock().expect("fake database mutex poisoned");
            state.actors.insert(
                (actor.state_type.clone(), actor.state_ref.clone()),
                actor_state,
            );
            state.mutations.insert(
                (
                    mutation.state_type.clone(),
                    mutation.state_ref.clone(),
                    mutation.key.clone(),
                ),
                mutation,
            );
            state.store_requests.push(request);
            Ok(Response::new(database::StoreResponse::default()))
        }

        async fn create_actor(
            &self,
            request: Request<database::CreateActorRequest>,
        ) -> Result<Response<database::CreateActorResponse>, Status> {
            let request = request.into_inner();
            let actor = request
                .actor
                .clone()
                .ok_or_else(|| Status::invalid_argument("missing actor"))?;
            let actor_state = actor
                .state
                .clone()
                .ok_or_else(|| Status::invalid_argument("actor has no state"))?;
            let mutation = request
                .idempotent_mutation
                .clone()
                .ok_or_else(|| Status::invalid_argument("missing idempotent mutation"))?;
            if !request.sync
                || mutation.state_type != actor.state_type
                || mutation.state_ref != actor.state_ref
            {
                return Err(Status::invalid_argument(
                    "CreateActor must synchronously contain matching state and mutation",
                ));
            }
            let mut state = self.state.lock().expect("fake database mutex poisoned");
            let actor_key = (actor.state_type.clone(), actor.state_ref.clone());
            if state.actors.contains_key(&actor_key) {
                return Err(Status::failed_precondition("Actor already exists"));
            }
            state.actors.insert(actor_key, actor_state);
            state.mutations.insert(
                (
                    mutation.state_type.clone(),
                    mutation.state_ref.clone(),
                    mutation.key.clone(),
                ),
                mutation,
            );
            state.create_requests.push(request);
            Ok(Response::new(database::CreateActorResponse::default()))
        }

        async fn recover(
            &self,
            _: Request<database::RecoverRequest>,
        ) -> Result<Response<Self::RecoverStream>, Status> {
            Ok(Response::new(tokio_stream::iter(vec![])))
        }

        async fn recover_idempotent_mutations(
            &self,
            request: Request<database::RecoverIdempotentMutationsRequest>,
        ) -> Result<Response<Self::RecoverIdempotentMutationsStream>, Status> {
            let request = request.into_inner();
            let state = self.state.lock().expect("fake database mutex poisoned");
            let idempotent_mutations = state
                .mutations
                .iter()
                .filter(|((state_type, state_ref, key), _)| {
                    state_type == &request.state_type
                        && state_ref == &request.state_ref
                        && request
                            .idempotency_key
                            .as_ref()
                            .is_none_or(|wanted| wanted == key)
                })
                .map(|(_, mutation)| mutation.clone())
                .collect();
            Ok(Response::new(tokio_stream::iter(vec![Ok(
                database::RecoverIdempotentMutationsResponse {
                    idempotent_mutations,
                },
            )])))
        }

        async fn transaction_participant_prepare(
            &self,
            _: Request<database::TransactionParticipantPrepareRequest>,
        ) -> Result<Response<database::TransactionParticipantPrepareResponse>, Status> {
            Ok(Response::new(Default::default()))
        }
        async fn transaction_participant_commit(
            &self,
            _: Request<database::TransactionParticipantCommitRequest>,
        ) -> Result<Response<database::TransactionParticipantCommitResponse>, Status> {
            Ok(Response::new(Default::default()))
        }
        async fn transaction_participant_abort(
            &self,
            _: Request<database::TransactionParticipantAbortRequest>,
        ) -> Result<Response<database::TransactionParticipantAbortResponse>, Status> {
            Ok(Response::new(Default::default()))
        }
        async fn transaction_coordinator_prepared(
            &self,
            _: Request<database::TransactionCoordinatorPreparedRequest>,
        ) -> Result<Response<database::TransactionCoordinatorPreparedResponse>, Status> {
            Ok(Response::new(Default::default()))
        }
        async fn transaction_coordinator_prepare(
            &self,
            _: Request<database::TransactionCoordinatorPrepareRequest>,
        ) -> Result<Response<database::TransactionCoordinatorPrepareResponse>, Status> {
            Ok(Response::new(Default::default()))
        }
        async fn transaction_coordinator_cleanup(
            &self,
            _: Request<database::TransactionCoordinatorCleanupRequest>,
        ) -> Result<Response<database::TransactionCoordinatorCleanupResponse>, Status> {
            Ok(Response::new(Default::default()))
        }
        async fn transaction_coordinator_decision_put(
            &self,
            _: Request<database::TransactionCoordinatorDecisionPutRequest>,
        ) -> Result<Response<database::TransactionCoordinatorDecisionPutResponse>, Status> {
            Ok(Response::new(
                database::TransactionCoordinatorDecisionPutResponse::default(),
            ))
        }

        async fn transaction_coordinator_decision_get(
            &self,
            _: Request<database::TransactionCoordinatorDecisionGetRequest>,
        ) -> Result<Response<database::TransactionCoordinatorDecisionGetResponse>, Status> {
            Ok(Response::new(
                database::TransactionCoordinatorDecisionGetResponse::default(),
            ))
        }

        async fn export(
            &self,
            _: Request<database::ExportRequest>,
        ) -> Result<Response<database::ExportResponse>, Status> {
            Ok(Response::new(Default::default()))
        }
        async fn export_streamed(
            &self,
            _: Request<database::ExportRequest>,
        ) -> Result<Response<Self::ExportStreamedStream>, Status> {
            Ok(Response::new(tokio_stream::iter(vec![])))
        }
        async fn get_application_metadata(
            &self,
            _: Request<database::GetApplicationMetadataRequest>,
        ) -> Result<Response<database::GetApplicationMetadataResponse>, Status> {
            Ok(Response::new(Default::default()))
        }
        async fn store_application_metadata(
            &self,
            _: Request<database::StoreApplicationMetadataRequest>,
        ) -> Result<Response<database::StoreApplicationMetadataResponse>, Status> {
            Ok(Response::new(Default::default()))
        }
        async fn refresh_timestamp(
            &self,
            _: Request<database::RefreshTimestampRequest>,
        ) -> Result<Response<database::RefreshTimestampResponse>, Status> {
            Ok(Response::new(Default::default()))
        }
    }

    pub async fn start_database() -> (String, FakeDatabase, tokio::task::JoinHandle<()>) {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let database = FakeDatabase::default();
        let server_database = database.clone();
        let server = tokio::spawn(async move {
            tonic::transport::Server::builder()
                .add_service(database::database_server::DatabaseServer::new(
                    server_database,
                ))
                .serve_with_incoming(tokio_stream::wrappers::TcpListenerStream::new(listener))
                .await
                .unwrap();
        });
        (format!("http://{address}"), database, server)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn explicit_abort_seal_retains_late_metadata_and_blocks_generated_outbound() {
        let root = RootTransactionContext::start(
            RebootHeaders::new("actor/1"),
            "example.Actor",
            TransactionMode::Exclusive,
            Uuid::new_v4(),
            prost_types::Timestamp::default(),
        )
        .unwrap();
        let context = root.transaction();
        let active = context.begin_generated_outbound().unwrap();
        assert!(context.seal_explicit_abort().is_err());
        drop(active);
        assert!(context.seal_explicit_abort().unwrap().is_empty());
        assert!(context.clone().begin_generated_outbound().is_err());
        let mut metadata = tonic::metadata::MetadataMap::new();
        metadata.insert(
            crate::successful_trailers::TRANSACTION_PARTICIPANTS_HEADER,
            r#"{"example.Remote":["late/1"]}"#.parse().unwrap(),
        );
        let returned =
            crate::successful_trailers::ReturnedParticipants::from_metadata(&metadata).unwrap();
        context.enlist_returned_participants(&returned);
        assert!(context.doomed_status().is_some());
        assert!(context.finish_explicit_abort().is_err());
        assert!(context.take_returned_participants().is_empty());
        assert_eq!(context.returned_participants_snapshot().len(), 1);
    }

    #[test]
    fn explicit_abort_seal_and_outbound_admission_are_atomic() {
        for _ in 0..32 {
            let root = RootTransactionContext::start(
                RebootHeaders::new("actor/1"),
                "example.Actor",
                TransactionMode::Exclusive,
                Uuid::new_v4(),
                prost_types::Timestamp::default(),
            )
            .unwrap();
            let context = root.transaction().clone();
            let barrier = Arc::new(std::sync::Barrier::new(2));
            let worker_context = context.clone();
            let worker_barrier = Arc::clone(&barrier);
            let worker = std::thread::spawn(move || {
                worker_barrier.wait();
                let scope = worker_context.begin_generated_outbound();
                worker_barrier.wait(); // retain the winner until sealing finishes
                scope
            });
            barrier.wait();
            let sealed = context.seal_explicit_abort();
            barrier.wait();
            let outbound = worker.join().unwrap();
            assert_ne!(
                sealed.is_ok(),
                outbound.is_ok(),
                "seal and active outbound must never both win"
            );
            drop(outbound);
            if sealed.is_ok() {
                assert!(context.begin_generated_outbound().is_err());
            } else {
                assert!(context.seal_explicit_abort().is_ok());
            }
        }
    }

    #[test]
    fn admission_requires_existing_or_preserves_default_compatibility() {
        assert_eq!(
            admit_state::<u32>(None, StateAdmission::DefaultOnAbsent).unwrap(),
            0
        );
        assert_eq!(
            admit_state::<u32>(None, StateAdmission::RequireExisting)
                .unwrap_err()
                .code(),
            tonic::Code::FailedPrecondition
        );
        assert_eq!(
            admit_state(Some(7_u32), StateAdmission::RequireExisting).unwrap(),
            7
        );
    }

    #[tokio::test]
    async fn actor_gates_share_only_the_same_normalized_sidecar_endpoint() {
        let first = DatabaseActorStore::connect_lazy("http://127.0.0.1:41001").unwrap();
        let same_sidecar = DatabaseActorStore::connect_lazy("http://127.0.0.1:41001").unwrap();
        let other_sidecar = DatabaseActorStore::connect_lazy("http://127.0.0.1:41002").unwrap();
        let first_gate = first.actor_gate("example.Actor", "actor/1");
        assert!(Arc::ptr_eq(
            &first_gate.inner,
            &same_sidecar.actor_gate("example.Actor", "actor/1").inner,
        ));
        assert!(!Arc::ptr_eq(
            &first_gate.inner,
            &other_sidecar.actor_gate("example.Actor", "actor/1").inner,
        ));
        assert!(!Arc::ptr_eq(
            &first_gate.inner,
            &same_sidecar
                .actor_gate("example.OtherActor", "actor/1")
                .inner,
        ));
        assert!(!Arc::ptr_eq(
            &first_gate.inner,
            &same_sidecar.actor_gate("example.Actor", "actor/2").inner,
        ));
    }

    #[tokio::test]
    async fn actor_gate_upgrade_is_atomic_and_blocks_reader_barge() {
        let gate = ActorGate::new();
        let mut upgrading = gate.shared().await;
        let mut other_reader = gate.shared().await;

        let upgrade = upgrading.upgrade();
        tokio::pin!(upgrade);
        tokio::select! {
            _ = &mut upgrade => panic!("upgrade must wait for the other reader"),
            _ = tokio::time::sleep(std::time::Duration::from_millis(10)) => {}
        }
        assert!(matches!(
            other_reader.upgrade().await,
            Err(ActorGateUpgradeError::UpgradeInProgress)
        ));
        assert!(
            tokio::time::timeout(std::time::Duration::from_millis(10), gate.shared(),)
                .await
                .is_err()
        );

        drop(other_reader);
        let exclusive = upgrade.await.unwrap();
        drop(exclusive);
    }

    #[tokio::test]
    async fn actor_gate_upgrade_timeout_and_cancellation_preserve_shared_lease() {
        let gate = ActorGate::new();
        let mut upgrading = gate.shared().await;
        let blocker = gate.shared().await;

        assert!(matches!(
            upgrading
                .upgrade_for(std::time::Duration::from_millis(10))
                .await,
            Err(ActorGateUpgradeError::TimedOut)
        ));
        assert!(
            tokio::time::timeout(std::time::Duration::from_millis(10), gate.exclusive(),)
                .await
                .is_err()
        );

        {
            let cancelled_upgrade = upgrading.upgrade();
            tokio::pin!(cancelled_upgrade);
            tokio::select! {
                _ = &mut cancelled_upgrade => panic!("upgrade must wait for the other reader"),
                _ = tokio::time::sleep(std::time::Duration::from_millis(10)) => {}
            }
        }
        let additional_reader =
            tokio::time::timeout(std::time::Duration::from_millis(10), gate.shared())
                .await
                .expect("cancelled upgrade must clear the reader barrier");
        drop(additional_reader);
        drop(blocker);
        drop(upgrading);
        drop(gate.exclusive().await);
    }
    async fn assert_pending<F: Future>(mut future: Pin<&mut F>) {
        std::future::poll_fn(|context| {
            assert!(matches!(
                future.as_mut().poll(context),
                std::task::Poll::Pending
            ));
            std::task::Poll::Ready(())
        })
        .await;
    }

    #[tokio::test]
    async fn actor_gate_queues_writers_fifo_and_blocks_reader_barge() {
        let gate = ActorGate::new();
        let holder = gate.shared().await;
        let mut first = Box::pin(gate.exclusive());
        assert_pending(first.as_mut()).await;
        let mut second = Box::pin(gate.exclusive());
        assert_pending(second.as_mut()).await;
        assert_pending(Box::pin(gate.shared()).as_mut()).await;

        drop(holder);
        let first_lease = first.await;
        assert_pending(second.as_mut()).await;
        drop(first_lease);
        drop(second.await);
    }

    #[tokio::test]
    async fn actor_gate_downgrade_admits_earlier_readers_without_reader_barge() {
        let gate = ActorGate::new();
        let holder = gate.exclusive().await;
        let mut earlier_reader = Box::pin(gate.shared());
        assert_pending(earlier_reader.as_mut()).await;
        let mut writer = Box::pin(gate.exclusive());
        assert_pending(writer.as_mut()).await;
        let mut later_reader = Box::pin(gate.shared());
        assert_pending(later_reader.as_mut()).await;

        let shared_holder = holder.downgrade();
        let earlier_lease = earlier_reader.await;
        assert_pending(writer.as_mut()).await;
        assert_pending(later_reader.as_mut()).await;

        drop(earlier_lease);
        drop(shared_holder);
        let writer_lease = writer.await;
        assert_pending(later_reader.as_mut()).await;
        drop(writer_lease);
        drop(later_reader.await);
    }

    #[tokio::test]
    async fn actor_gate_cancellation_removes_a_grant_ready_reader() {
        let gate = ActorGate::new();
        let holder = gate.exclusive().await;
        let mut cancelled_reader = Box::pin(gate.shared());
        assert_pending(cancelled_reader.as_mut()).await;
        let mut writer = Box::pin(gate.exclusive());
        assert_pending(writer.as_mut()).await;

        // Downgrade makes the reader eligible. Dropping its future before it
        // takes the grant must remove its ticket rather than strand the writer.
        let shared_holder = holder.downgrade();
        drop(cancelled_reader);
        drop(shared_holder);
        drop(writer.await);
    }

    #[tokio::test]
    async fn actor_gate_upgrade_never_bypasses_a_queued_writer() {
        let gate = ActorGate::new();
        let mut reader = gate.shared().await;
        let mut writer = Box::pin(gate.exclusive());
        assert_pending(writer.as_mut()).await;

        assert!(matches!(
            reader.upgrade().await,
            Err(ActorGateUpgradeError::UpgradeInProgress)
        ));
        drop(reader);
        drop(writer.await);
    }

    #[tokio::test]
    async fn actor_gate_cancellation_removes_queued_writer_even_when_grant_is_ready() {
        let gate = ActorGate::new();
        let holder = gate.shared().await;
        let mut cancelled = Box::pin(gate.exclusive());
        assert_pending(cancelled.as_mut()).await;

        // Releasing the final reader makes this writer eligible; dropping its
        // future before its next poll must remove the pending grant.
        drop(holder);
        drop(cancelled);
        drop(gate.shared().await);
        drop(gate.exclusive().await);
    }

    use crate::ExternalContext;
    use std::collections::BTreeMap;

    #[test]
    fn transaction_execution_keeps_explicit_actor_local_effects() {
        let mut execution = TransactionExecution::new(proto::Text {
            content: "response".into(),
        });
        execution.final_state = Some(vec![1, 2, 3]);
        execution.task_upserts.push(database::Task::default());
        execution
            .idempotent_mutations
            .push(database::IdempotentMutation::default());

        assert_eq!(execution.response.content, "response");
        assert_eq!(execution.final_state, Some(vec![1, 2, 3]));
        assert_eq!(execution.task_upserts.len(), 1);
        assert_eq!(execution.idempotent_mutations.len(), 1);
    }

    #[test]
    fn only_root_context_enlists_validated_returned_participants_once() {
        let mut metadata = tonic::metadata::MetadataMap::new();
        metadata.append(
            crate::successful_trailers::TRANSACTION_PARTICIPANTS_HEADER,
            "{\"example.Remote\":[\"remote/a\",\"remote/a\",\"remote/b\"]}"
                .parse()
                .unwrap(),
        );
        let returned =
            crate::successful_trailers::ReturnedParticipants::from_metadata(&metadata).unwrap();

        let root = RootTransactionContext::start(
            RebootHeaders::new("root/actor"),
            "example.Root",
            TransactionMode::Exclusive,
            Uuid::from_u128(1),
            prost_types::Timestamp::default(),
        )
        .unwrap();
        root.transaction().enlist_returned_participants(&returned);
        root.transaction().enlist_returned_participants(&returned);
        assert_eq!(
            root.transaction().take_returned_participants(),
            vec![
                crate::durable_coordinator::ReturnedParticipant {
                    target: crate::durable_coordinator::ParticipantTarget {
                        state_type: "example.Remote".into(),
                        state_ref: "remote/a".into(),
                    },
                    read_only: false,
                },
                crate::durable_coordinator::ReturnedParticipant {
                    target: crate::durable_coordinator::ParticipantTarget {
                        state_type: "example.Remote".into(),
                        state_ref: "remote/b".into(),
                    },
                    read_only: false,
                },
            ]
        );
        assert!(root.transaction().take_returned_participants().is_empty());

        let mut inbound_headers = RebootHeaders::new("nested/actor");
        inbound_headers.transaction_ids = Some(vec![Uuid::from_u128(1)]);
        inbound_headers.transaction_coordinator_state_type = Some("example.Root".into());
        inbound_headers.transaction_coordinator_state_ref = Some("root/actor".into());
        let inbound =
            InboundTransactionContext::from_headers(inbound_headers, TransactionMode::Exclusive)
                .unwrap();
        inbound
            .transaction()
            .enlist_returned_participants(&returned);
        assert!(
            inbound
                .transaction()
                .take_returned_participants()
                .is_empty()
        );
    }

    #[tokio::test]
    async fn transactional_outbound_request_preserves_validated_context_and_target_metadata() {
        struct RecordingResolver(std::sync::Mutex<Vec<(String, String)>>);

        #[tonic::async_trait]
        impl TransactionalChannelResolver for RecordingResolver {
            async fn resolve(
                &self,
                state_type: &str,
                state_ref: &str,
            ) -> Result<tonic::transport::Channel, Status> {
                self.0
                    .lock()
                    .unwrap()
                    .push((state_type.to_owned(), state_ref.to_owned()));
                Ok(tonic::transport::Channel::from_static("http://[::1]:50051").connect_lazy())
            }
        }

        let mut headers = RebootHeaders::new("source/actor");
        headers.transaction_ids = Some(vec![Uuid::from_u128(7), Uuid::from_u128(8)]);
        headers.transaction_coordinator_state_type = Some("example.Coordinator".into());
        headers.transaction_coordinator_state_ref = Some("coordinator/42".into());
        headers.idempotency_key = Some(Uuid::from_u128(9));
        headers.traceparent =
            Some("00-0123456789abcdef0123456789abcdef-0123456789abcdef-01".into());
        headers.internal_call = true;
        let context =
            TransactionContext::from_headers(headers, TransactionMode::Exclusive).unwrap();
        let resolver = RecordingResolver(std::sync::Mutex::new(Vec::new()));

        let (_, request) = transactional_outbound_request(
            &resolver,
            &context,
            "example.Target",
            "target/actor",
            proto::Empty {},
        )
        .await
        .unwrap();

        assert_eq!(
            *resolver.0.lock().unwrap(),
            [("example.Target".into(), "target/actor".into())]
        );
        assert_eq!(
            request.metadata().get(STATE_REF_HEADER).unwrap(),
            "target/actor"
        );
        assert_eq!(
            request
                .metadata()
                .get(crate::TRANSACTION_IDS_HEADER)
                .unwrap(),
            "[\"00000000-0000-0000-0000-000000000007\", \"00000000-0000-0000-0000-000000000008\"]"
        );
        assert_eq!(
            request
                .metadata()
                .get(crate::TRANSACTION_COORDINATOR_STATE_TYPE_HEADER)
                .unwrap(),
            "example.Coordinator"
        );
        assert_eq!(
            request
                .metadata()
                .get(crate::TRANSACTION_COORDINATOR_STATE_REF_HEADER)
                .unwrap(),
            "coordinator/42"
        );
        assert_eq!(
            request
                .metadata()
                .get(IDEMPOTENCY_KEY_HEADER)
                .unwrap()
                .to_str()
                .unwrap(),
            Uuid::from_u128(9).to_string()
        );
        assert_eq!(
            request.metadata().get(crate::INTERNAL_CALL_HEADER).unwrap(),
            "true"
        );
        assert!(request.metadata().get("x-example-unknown").is_none());

        for (state_type, state_ref) in [("", "target/actor"), ("example.Target", "")] {
            assert_eq!(
                transactional_outbound_request(
                    &resolver,
                    &context,
                    state_type,
                    state_ref,
                    proto::Empty {},
                )
                .await
                .unwrap_err()
                .code(),
                tonic::Code::InvalidArgument
            );
        }
        assert_eq!(resolver.0.lock().unwrap().len(), 1);
    }

    #[test]
    fn root_transaction_context_requires_host_identity_and_refuses_inbound_context() {
        let transaction_id = Uuid::from_u128(42);
        let timestamp = prost_types::Timestamp {
            seconds: 1_728_000_000,
            nanos: 123,
        };
        let root = RootTransactionContext::start(
            RebootHeaders::new("counter/42"),
            "example.Counter",
            TransactionMode::Exclusive,
            transaction_id,
            timestamp,
        )
        .unwrap();
        assert_eq!(root.transaction().transaction_ids(), &[transaction_id]);
        assert_eq!(root.transaction().transaction_root_id(), transaction_id);
        assert_eq!(
            root.transaction().transaction_coordinator_state_type(),
            "example.Counter"
        );
        assert_eq!(
            root.transaction().transaction_coordinator_state_ref(),
            "counter/42"
        );
        assert_eq!(root.timestamp(), &timestamp);

        let mut inbound = RebootHeaders::new("counter/42");
        inbound.transaction_ids = Some(vec![Uuid::from_u128(41)]);
        assert_eq!(
            RootTransactionContext::start(
                inbound,
                "example.Counter",
                TransactionMode::Exclusive,
                transaction_id,
                timestamp,
            ),
            Err(RootTransactionStartError::InboundTransactionContext)
        );
    }

    #[test]
    fn inbound_context_parses_and_appends_a_child_path_without_executing() {
        let root_id = Uuid::from_u128(51);
        let parent_id = Uuid::from_u128(52);
        let child_id = Uuid::from_u128(53);
        let mut headers = RebootHeaders::new("target/actor");
        headers.transaction_ids = Some(vec![root_id, parent_id]);
        headers.transaction_coordinator_state_type = Some("example.Root".into());
        headers.transaction_coordinator_state_ref = Some("root/actor".into());
        headers.idempotency_key = Some(Uuid::from_u128(54));
        let metadata = headers.to_metadata().unwrap();

        let inbound =
            InboundTransactionContext::from_metadata(&metadata, TransactionMode::Exclusive)
                .unwrap();
        let nested = inbound.with_nested_transaction_id(child_id).unwrap();

        assert_eq!(
            inbound.transaction().transaction_ids(),
            &[root_id, parent_id]
        );
        assert_eq!(nested.transaction_ids(), &[root_id, parent_id, child_id]);
        assert_eq!(nested.transaction_root_id(), root_id);
        assert_eq!(nested.transaction_id(), child_id);
        assert_eq!(nested.transaction_coordinator_state_type(), "example.Root");
        assert_eq!(nested.transaction_coordinator_state_ref(), "root/actor");
        assert_eq!(nested.headers().state_ref, "target/actor");
        assert_eq!(nested.headers().idempotency_key, Some(Uuid::from_u128(54)));
        assert_eq!(
            inbound.with_nested_transaction_id(parent_id),
            Err(NestedTransactionPathError::DuplicateTransactionId)
        );
    }

    #[test]
    fn inbound_context_rejects_incomplete_transaction_metadata() {
        let mut missing_coordinator = RebootHeaders::new("target/actor");
        missing_coordinator.transaction_ids = Some(vec![Uuid::from_u128(61)]);
        assert_eq!(
            InboundTransactionContext::from_headers(
                missing_coordinator,
                TransactionMode::Exclusive,
            ),
            Err(ContextError::MissingTransactionCoordinatorMetadata)
        );

        assert_eq!(
            InboundTransactionContext::from_headers(
                RebootHeaders::new("target/actor"),
                TransactionMode::Exclusive,
            ),
            Err(ContextError::MissingTransactionMetadata)
        );
    }

    async fn start_host() -> (String, tokio::task::JoinHandle<()>) {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let host = InMemoryHost::new();
        let server = tokio::spawn(async move {
            tonic::transport::Server::builder()
                .add_service(proto::echo_methods_server::EchoMethodsServer::new(host))
                .serve_with_incoming(tokio_stream::wrappers::TcpListenerStream::new(listener))
                .await
                .unwrap();
        });
        (format!("http://{address}"), server)
    }

    async fn start_participant_host(
        host: ActorParticipantHost,
    ) -> (String, tokio::task::JoinHandle<()>) {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let server = tokio::spawn(async move {
            tonic::transport::Server::builder()
                .add_service(database::participant_server::ParticipantServer::new(host))
                .serve_with_incoming(tokio_stream::wrappers::TcpListenerStream::new(listener))
                .await
                .unwrap();
        });
        (format!("http://{address}"), server)
    }

    fn participant_context(state_ref: &str, transaction_id: Uuid) -> TransactionContext {
        let mut headers = RebootHeaders::new(state_ref);
        headers.transaction_ids = Some(vec![transaction_id]);
        headers.transaction_coordinator_state_type = Some("example.Coordinator".into());
        headers.transaction_coordinator_state_ref = Some("coordinator/1".into());
        TransactionContext::from_headers(headers, TransactionMode::Exclusive).unwrap()
    }

    fn participant_request<T>(message: T, state_ref: &str) -> Request<T> {
        let mut request = Request::new(message);
        request
            .metadata_mut()
            .insert(STATE_REF_HEADER, state_ref.parse().unwrap());
        request
    }

    #[tokio::test]
    async fn participant_prepare_uses_definitive_abort_only_for_known_outcomes() {
        let host = ActorParticipantHost::new();
        let transaction_id = Uuid::from_u128(700);
        host.activate(participant_context("participant-actor", transaction_id))
            .unwrap();
        let (address, server) = start_participant_host(host.clone()).await;
        let mut client = database::participant_client::ParticipantClient::connect(address)
            .await
            .unwrap();

        let prepared = client
            .prepare(participant_request(
                database::PrepareRequest {
                    transaction_id: transaction_id.as_bytes().to_vec(),
                    abort_via_response: true,
                    read_only_aware: false,
                    read_only: false,
                },
                "participant-actor",
            ))
            .await
            .unwrap()
            .into_inner();
        assert!(!prepared.abort);

        let mismatch = client
            .prepare(participant_request(
                database::PrepareRequest {
                    transaction_id: Uuid::from_u128(701).as_bytes().to_vec(),
                    abort_via_response: true,
                    read_only_aware: false,
                    read_only: false,
                },
                "participant-actor",
            ))
            .await
            .unwrap()
            .into_inner();
        assert!(mismatch.abort);
        assert!(!mismatch.restart_detected);

        let transport_error = client
            .prepare(participant_request(
                database::PrepareRequest {
                    transaction_id: vec![0],
                    abort_via_response: true,
                    read_only_aware: false,
                    read_only: false,
                },
                "participant-actor",
            ))
            .await
            .unwrap_err();
        assert_eq!(transport_error.code(), tonic::Code::InvalidArgument);

        let mismatched_commit = client
            .commit(participant_request(
                database::CommitRequest {
                    transaction_id: Uuid::from_u128(701).as_bytes().to_vec(),
                },
                "participant-actor",
            ))
            .await
            .unwrap_err();
        assert_eq!(mismatched_commit.code(), tonic::Code::FailedPrecondition);
        client
            .commit(participant_request(
                database::CommitRequest {
                    transaction_id: transaction_id.as_bytes().to_vec(),
                },
                "participant-actor",
            ))
            .await
            .unwrap();
        let cleaned_after_commit = client
            .abort(participant_request(
                database::AbortRequest {
                    transaction_id: transaction_id.as_bytes().to_vec(),
                },
                "participant-actor",
            ))
            .await
            .unwrap_err();
        assert_eq!(cleaned_after_commit.code(), tonic::Code::FailedPrecondition);

        let abort_id = Uuid::from_u128(702);
        host.activate(participant_context("participant-actor", abort_id))
            .unwrap();
        let mismatched_abort = client
            .abort(participant_request(
                database::AbortRequest {
                    transaction_id: transaction_id.as_bytes().to_vec(),
                },
                "participant-actor",
            ))
            .await
            .unwrap_err();
        assert_eq!(mismatched_abort.code(), tonic::Code::FailedPrecondition);
        client
            .abort(participant_request(
                database::AbortRequest {
                    transaction_id: abort_id.as_bytes().to_vec(),
                },
                "participant-actor",
            ))
            .await
            .unwrap();
        let cleaned_after_abort = client
            .commit(participant_request(
                database::CommitRequest {
                    transaction_id: abort_id.as_bytes().to_vec(),
                },
                "participant-actor",
            ))
            .await
            .unwrap_err();
        assert_eq!(cleaned_after_abort.code(), tonic::Code::FailedPrecondition);
        server.abort();
    }

    async fn start_file_host(host: FileBackedHost) -> (String, tokio::task::JoinHandle<()>) {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let server = tokio::spawn(async move {
            tonic::transport::Server::builder()
                .add_service(proto::echo_methods_server::EchoMethodsServer::new(host))
                .serve_with_incoming(tokio_stream::wrappers::TcpListenerStream::new(listener))
                .await
                .unwrap();
        });
        (format!("http://{address}"), server)
    }

    use super::test_support::start_database;

    #[test]
    fn database_status_preserves_sidecar_status_code() {
        let status = database_status(Status::invalid_argument("corrupt persisted state"));
        assert_eq!(status.code(), tonic::Code::InvalidArgument);
        assert!(
            status
                .message()
                .contains("Reboot database sidecar request failed")
        );
        assert!(status.message().contains("corrupt persisted state"));
    }

    async fn start_echo_adapter(host: EchoMethodsAdapter) -> (String, tokio::task::JoinHandle<()>) {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let server = tokio::spawn(async move {
            tonic::transport::Server::builder()
                .add_service(proto::echo_methods_server::EchoMethodsServer::new(host))
                .serve_with_incoming(tokio_stream::wrappers::TcpListenerStream::new(listener))
                .await
                .unwrap();
        });
        (format!("http://{address}"), server)
    }

    #[test]
    fn request_fingerprint_matches_cross_language_v1_vector() {
        let fingerprint = request_fingerprint(
            "tests.reboot.protoc.EchoMethods.Reply",
            &proto::Text {
                content: "hello".into(),
            },
        );
        assert_eq!(
            fingerprint,
            vec![
                0xc7, 0xf3, 0x39, 0x49, 0x26, 0x9c, 0x37, 0xa7, 0x53, 0x46, 0xd7, 0x59, 0x7d, 0xce,
                0x05, 0xaf, 0xe4, 0x61, 0x53, 0x5b, 0x94, 0x1d, 0x04, 0xc2, 0xf7, 0x09, 0xcc, 0xab,
                0xa5, 0x0c, 0x2b, 0xa8,
            ]
        );
    }

    fn uuid_v7_with_timestamp(timestamp_ms: u64) -> Uuid {
        let mut bytes = [0_u8; 16];
        bytes[..6].copy_from_slice(&timestamp_ms.to_be_bytes()[2..]);
        bytes[6] = 0x70;
        bytes[8] = 0x80;
        Uuid::from_bytes(bytes)
    }

    #[test]
    fn idempotency_expiry_matches_python_uuid_v7_contract() {
        assert!(check_idempotency_key_not_expired_at(Uuid::new_v4(), 1).is_ok());
        assert!(check_idempotency_key_not_expired_at(uuid_v7_with_timestamp(9), 10).is_err());
        assert!(check_idempotency_key_not_expired_at(uuid_v7_with_timestamp(10), 10).is_ok());
        assert!(check_idempotency_key_not_expired_at(uuid_v7_with_timestamp(11), 10).is_ok());
    }

    #[test]
    fn transaction_idempotency_derives_exact_mutation_and_fails_closed_collision() {
        let mut headers = RebootHeaders::new("actor/42");
        headers.idempotency_key = Some(Uuid::from_u128(42));
        headers.transaction_ids = Some(vec![Uuid::from_u128(1)]);
        headers.transaction_coordinator_state_type = Some("tests.Root".into());
        headers.transaction_coordinator_state_ref = Some("root/1".into());
        let context =
            TransactionContext::from_headers(headers, TransactionMode::Exclusive).unwrap();
        let request = proto::Text {
            content: "request".into(),
        };
        let idempotency = context
            .idempotency("tests.Service.Mutate", &request)
            .unwrap();
        let mutation = idempotency.mutation(
            "tests.Actor",
            "actor/42",
            &proto::Text {
                content: "response".into(),
            },
        );
        assert_eq!(mutation.key, Uuid::from_u128(42).as_bytes());
        assert_eq!(mutation.state_type, "tests.Actor");
        assert_eq!(mutation.state_ref, "actor/42");
        assert_eq!(
            mutation.request_fingerprint.as_deref(),
            Some(idempotency.request_fingerprint())
        );
        assert_eq!(
            idempotency
                .replay::<proto::Text>(&mutation)
                .unwrap()
                .unwrap()
                .content,
            "response"
        );
        let other = context
            .idempotency(
                "tests.Service.Mutate",
                &proto::Text {
                    content: "other".into(),
                },
            )
            .unwrap();
        assert_eq!(
            other.replay::<proto::Text>(&mutation).unwrap_err().code(),
            tonic::Code::FailedPrecondition
        );
    }

    #[test]
    fn request_fingerprint_is_stable_for_cargo_generated_map_bindings() {
        let first = proto::MapIncrementRequest {
            amounts: BTreeMap::from([("alpha".into(), 2), ("beta".into(), 3)]),
        };
        let second = proto::MapIncrementRequest {
            amounts: BTreeMap::from([("beta".into(), 3), ("alpha".into(), 2)]),
        };
        let _: &BTreeMap<String, i64> = &first.amounts;
        assert_eq!(
            request_fingerprint(
                "tests.reboot.protoc.MapCounterWritesMethods.Increment",
                &first
            ),
            request_fingerprint(
                "tests.reboot.protoc.MapCounterWritesMethods.Increment",
                &second
            ),
        );
    }

    #[tokio::test]
    async fn public_replay_returns_fingerprinted_completed_writes() {
        let (database_address, _, database_server) = start_database().await;
        let store = DatabaseActorStore::connect(&database_address)
            .await
            .unwrap();
        let key = Uuid::from_u128(601);
        let request = proto::Text {
            content: "fingerprinted request".into(),
        };
        store
            .store_type(
                <proto::Echo as RebootState>::STATE_TYPE,
                "public-fingerprinted-replay",
                key,
                proto::Echo::default(),
                proto::Text {
                    content: "fingerprinted response".into(),
                },
                Some(request_fingerprint(
                    "tests.reboot.protoc.EchoMethods.Reply",
                    &request,
                )),
            )
            .await
            .unwrap();
        assert_eq!(
            store
                .replay::<proto::Echo, proto::Text>("public-fingerprinted-replay", key)
                .await
                .unwrap(),
            Some(proto::Text {
                content: "fingerprinted response".into(),
            })
        );
        database_server.abort();
    }

    #[tokio::test]
    async fn legacy_mutation_without_fingerprint_remains_replay_compatible() {
        let (database_address, _, database_server) = start_database().await;
        let store = DatabaseActorStore::connect(&database_address)
            .await
            .unwrap();
        let key = Uuid::from_u128(600);
        store
            .store(
                "legacy-fingerprint",
                key,
                proto::Echo::default(),
                proto::Text {
                    content: "legacy response".into(),
                },
            )
            .await
            .unwrap();
        assert_eq!(
            store
                .replay::<proto::Echo, proto::Text>("legacy-fingerprint", key)
                .await
                .unwrap(),
            Some(proto::Text {
                content: "legacy response".into(),
            })
        );
        database_server.abort();
    }

    #[tokio::test]
    async fn echo_adapter_recreation_replays_persisted_reply_and_stores_atomically() {
        let (database_address, database, database_server) = start_database().await;
        let context = ExternalContext::new("database-durable-echo");
        let key = Uuid::from_u128(17);

        let (address, host_server) = start_echo_adapter(
            EchoMethodsAdapter::connect(&database_address)
                .await
                .unwrap(),
        )
        .await;
        let mut client = proto::echo_methods_client::EchoMethodsClient::connect(address)
            .await
            .unwrap();
        let first = client
            .reply(
                context
                    .writer_with_key(
                        proto::Text {
                            content: "persisted through generated database".into(),
                        },
                        key,
                    )
                    .unwrap(),
            )
            .await
            .unwrap()
            .into_inner();
        assert_eq!(first.content, "persisted through generated database");
        host_server.abort();

        let (address, host_server) = start_echo_adapter(
            EchoMethodsAdapter::connect(&database_address)
                .await
                .unwrap(),
        )
        .await;
        let mut client = proto::echo_methods_client::EchoMethodsClient::connect(address)
            .await
            .unwrap();
        let replay = client
            .reply(context.writer_with_key(first.clone(), key).unwrap())
            .await
            .unwrap()
            .into_inner();
        assert_eq!(replay, first);
        let collision = client
            .reply(
                context
                    .writer_with_key(
                        proto::Text {
                            content: "must not overwrite cached reply".into(),
                        },
                        key,
                    )
                    .unwrap(),
            )
            .await
            .unwrap_err();
        assert_eq!(collision.code(), tonic::Code::FailedPrecondition);
        let last = client
            .last_message(context.reader(proto::Empty {}).unwrap())
            .await
            .unwrap()
            .into_inner();
        assert_eq!(last.content, "persisted through generated database");

        let store_requests = database.store_requests();
        assert_eq!(store_requests.len(), 1, "replay must not issue Store");
        let store = &store_requests[0];
        assert!(store.sync);
        assert_eq!(store.actor_upserts.len(), 1);
        let actor = &store.actor_upserts[0];
        let mutation = store.idempotent_mutation.as_ref().unwrap();
        assert_eq!(actor.state_type, <proto::Echo as RebootState>::STATE_TYPE);
        assert_eq!(actor.state_ref, "database-durable-echo");
        assert_eq!(mutation.state_type, actor.state_type);
        assert_eq!(mutation.state_ref, actor.state_ref);
        assert_eq!(mutation.key, key.as_bytes());
        assert_eq!(
            proto::Echo::decode(actor.state.as_deref().unwrap()).unwrap(),
            proto::Echo {
                last_message: Some(first.clone()),
            }
        );
        assert_eq!(
            proto::Text::decode(mutation.response.as_slice()).unwrap(),
            first
        );
        host_server.abort();
        database_server.abort();
    }

    #[tokio::test]
    async fn echo_adapter_keeps_state_references_isolated() {
        let (database_address, database, database_server) = start_database().await;
        let (address, host_server) = start_echo_adapter(
            EchoMethodsAdapter::connect(&database_address)
                .await
                .unwrap(),
        )
        .await;
        let mut client = proto::echo_methods_client::EchoMethodsClient::connect(address)
            .await
            .unwrap();
        let first = ExternalContext::new("database-first");
        let second = ExternalContext::new("database-second");
        let shared_key = Uuid::from_u128(18);

        for (context, content) in [(&first, "one"), (&second, "two")] {
            client
                .reply(
                    context
                        .writer_with_key(
                            proto::Text {
                                content: content.into(),
                            },
                            shared_key,
                        )
                        .unwrap(),
                )
                .await
                .unwrap();
        }
        let first_last = client
            .last_message(first.reader(proto::Empty {}).unwrap())
            .await
            .unwrap()
            .into_inner();
        let second_last = client
            .last_message(second.reader(proto::Empty {}).unwrap())
            .await
            .unwrap()
            .into_inner();
        assert_eq!(first_last.content, "one");
        assert_eq!(second_last.content, "two");
        assert_eq!(database.store_requests().len(), 2);
        host_server.abort();
        database_server.abort();
    }

    async fn start_counter_adapter(
        adapter: CounterAdapter,
    ) -> (String, tokio::task::JoinHandle<()>) {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let server = tokio::spawn(async move {
            tonic::transport::Server::builder()
                .add_service(
                    proto::counter_writes_methods_server::CounterWritesMethodsServer::new(
                        adapter.clone(),
                    ),
                )
                .add_service(
                    proto::counter_reads_methods_server::CounterReadsMethodsServer::new(adapter),
                )
                .serve_with_incoming(tokio_stream::wrappers::TcpListenerStream::new(listener))
                .await
                .unwrap();
        });
        (format!("http://{address}"), server)
    }

    #[tokio::test]
    async fn counter_adapter_recreates_replays_and_persists_across_services() {
        let (database_address, database, database_server) = start_database().await;
        let context = ExternalContext::new("database-durable-counter");
        let first_key = Uuid::from_u128(19);

        let (address, server) =
            start_counter_adapter(CounterAdapter::connect(&database_address).await.unwrap()).await;
        let mut writes =
            proto::counter_writes_methods_client::CounterWritesMethodsClient::connect(address)
                .await
                .unwrap();
        let first = writes
            .increment(
                context
                    .writer_with_key(proto::IncrementRequest { amount: 5 }, first_key)
                    .unwrap(),
            )
            .await
            .unwrap()
            .into_inner();
        assert_eq!(first.value, 5);
        server.abort();

        let (address, server) =
            start_counter_adapter(CounterAdapter::connect(&database_address).await.unwrap()).await;
        let mut writes = proto::counter_writes_methods_client::CounterWritesMethodsClient::connect(
            address.clone(),
        )
        .await
        .unwrap();
        let mut reads =
            proto::counter_reads_methods_client::CounterReadsMethodsClient::connect(address)
                .await
                .unwrap();
        let replay = writes
            .increment(
                context
                    .writer_with_key(proto::IncrementRequest { amount: 5 }, first_key)
                    .unwrap(),
            )
            .await
            .unwrap()
            .into_inner();
        assert_eq!(replay.value, 5);
        let collision = writes
            .increment(
                context
                    .writer_with_key(proto::IncrementRequest { amount: 100 }, first_key)
                    .unwrap(),
            )
            .await
            .unwrap_err();
        assert_eq!(collision.code(), tonic::Code::FailedPrecondition);
        assert_eq!(
            reads
                .get(context.reader(proto::Empty {}).unwrap())
                .await
                .unwrap()
                .into_inner()
                .value,
            5
        );
        let second = writes
            .increment(
                context
                    .writer_with_key(proto::IncrementRequest { amount: 2 }, Uuid::from_u128(20))
                    .unwrap(),
            )
            .await
            .unwrap()
            .into_inner();
        assert_eq!(second.value, 7);

        let store_requests = database.store_requests();
        assert_eq!(store_requests.len(), 2, "replay must not issue Store");
        let first_store = &store_requests[0];
        let actor = first_store.actor_upserts.first().unwrap();
        let mutation = first_store.idempotent_mutation.as_ref().unwrap();
        assert!(first_store.sync);
        assert_eq!(
            actor.state_type,
            <proto::Counter as RebootState>::STATE_TYPE
        );
        assert_eq!(actor.state_ref, "database-durable-counter");
        assert_eq!(
            proto::Counter::decode(actor.state.as_deref().unwrap()).unwrap(),
            proto::Counter { value: 5 }
        );
        assert_eq!(
            proto::CounterValue::decode(mutation.response.as_slice()).unwrap(),
            first
        );
        server.abort();
        database_server.abort();
    }

    #[tokio::test]
    async fn constructor_writer_creates_replays_rejects_duplicates_and_leaves_failures_absent() {
        struct ConstructorCounter;
        impl DurableStateDeclaration for ConstructorCounter {
            type State = proto::Counter;
            const STATE_TYPE: &'static str = "tests.reboot.protoc.Counter";
        }

        let (address, _, server) = start_database().await;
        let store = DatabaseActorStore::connect(&address).await.unwrap();
        let context = ExternalContext::new("constructor-counter");
        let key = Uuid::from_u128(401);
        let calls = Arc::new(std::sync::atomic::AtomicUsize::new(0));
        let success = store
            .constructor_writer_async_for_method::<ConstructorCounter, _, _, _>(
                "tests.reboot.protoc.CounterWritesMethods.Construct",
                context
                    .writer_with_key(proto::IncrementRequest { amount: 7 }, key)
                    .unwrap(),
                {
                    let calls = calls.clone();
                    move |state, request| {
                        calls.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
                        Box::pin(async move {
                            state.value = request.amount;
                            Ok(proto::CounterValue { value: state.value })
                        })
                    }
                },
            )
            .await
            .unwrap()
            .into_inner();
        assert_eq!(success.value, 7);
        assert_eq!(
            store
                .load::<proto::Counter>("constructor-counter")
                .await
                .unwrap()
                .unwrap()
                .value,
            7
        );

        let replay = store
            .constructor_writer_async_for_method::<ConstructorCounter, _, _, _>(
                "tests.reboot.protoc.CounterWritesMethods.Construct",
                context
                    .writer_with_key(proto::IncrementRequest { amount: 7 }, key)
                    .unwrap(),
                move |_, _| Box::pin(async { Ok(proto::CounterValue { value: 999 }) }),
            )
            .await
            .unwrap()
            .into_inner();
        assert_eq!(replay.value, 7);
        assert_eq!(calls.load(std::sync::atomic::Ordering::SeqCst), 1);

        let duplicate = store
            .constructor_writer_async_for_method::<ConstructorCounter, _, _, _>(
                "tests.reboot.protoc.CounterWritesMethods.Construct",
                context
                    .writer_with_key(proto::IncrementRequest { amount: 8 }, Uuid::from_u128(402))
                    .unwrap(),
                move |_, _| Box::pin(async { Ok(proto::CounterValue { value: 8 }) }),
            )
            .await
            .unwrap_err();
        assert_eq!(duplicate.code(), tonic::Code::FailedPrecondition);

        let failed_context = ExternalContext::new("failed-constructor");
        let failed_key = Uuid::from_u128(403);
        let failure = store
            .constructor_writer_async_for_method::<ConstructorCounter, _, _, _>(
                "tests.reboot.protoc.CounterWritesMethods.Construct",
                failed_context
                    .writer_with_key(proto::IncrementRequest { amount: 1 }, failed_key)
                    .unwrap(),
                move |_, _| {
                    Box::pin(async {
                        Err::<proto::CounterValue, _>(Status::internal("handler failed"))
                    })
                },
            )
            .await
            .unwrap_err();
        assert_eq!(failure.code(), tonic::Code::Internal);
        assert!(
            store
                .load::<proto::Counter>("failed-constructor")
                .await
                .unwrap()
                .is_none()
        );
        assert!(
            store
                .replay::<proto::Counter, proto::CounterValue>("failed-constructor", failed_key)
                .await
                .unwrap()
                .is_none()
        );
        server.abort();
    }

    #[tokio::test]
    async fn database_actor_store_async_callbacks_serialize_across_clones_and_read_loaded_state() {
        let (database_address, _, database_server) = start_database().await;
        let store = DatabaseActorStore::connect(&database_address)
            .await
            .unwrap();
        let first_store = store.clone();
        let second_store = store.clone();
        let context = ExternalContext::new("one-store-async-lock");
        let first_entered = Arc::new(tokio::sync::Notify::new());
        let release_first = Arc::new(tokio::sync::Notify::new());
        let second_callback_started = Arc::new(std::sync::atomic::AtomicBool::new(false));

        let first = tokio::spawn({
            let first_entered = first_entered.clone();
            let release_first = release_first.clone();
            let request = context
                .writer_with_key(proto::IncrementRequest { amount: 1 }, Uuid::from_u128(101))
                .unwrap();
            async move {
                first_store
                    .writer_async::<proto::Counter, _, _, _>(
                        "tests.reboot.protoc.Counter",
                        request,
                        move |state, request| {
                            let first_entered = first_entered.clone();
                            let release_first = release_first.clone();
                            Box::pin(async move {
                                first_entered.notify_one();
                                release_first.notified().await;
                                state.value += request.amount;
                                Ok(proto::CounterValue { value: state.value })
                            })
                        },
                    )
                    .await
            }
        });
        first_entered.notified().await;

        let second = tokio::spawn({
            let second_callback_started = second_callback_started.clone();
            let request = context
                .writer_with_key(proto::IncrementRequest { amount: 2 }, Uuid::from_u128(102))
                .unwrap();
            async move {
                second_store
                    .writer_async::<proto::Counter, _, _, _>(
                        "tests.reboot.protoc.Counter",
                        request,
                        move |state, request| {
                            let second_callback_started = second_callback_started.clone();
                            Box::pin(async move {
                                second_callback_started
                                    .store(true, std::sync::atomic::Ordering::SeqCst);
                                state.value += request.amount;
                                Ok(proto::CounterValue { value: state.value })
                            })
                        },
                    )
                    .await
            }
        });
        for _ in 0..10 {
            tokio::task::yield_now().await;
        }
        assert!(
            !second_callback_started.load(std::sync::atomic::Ordering::SeqCst),
            "a clone of the same store must not enter a same-actor writer while it awaits"
        );
        release_first.notify_one();
        assert_eq!(first.await.unwrap().unwrap().into_inner().value, 1);
        assert_eq!(second.await.unwrap().unwrap().into_inner().value, 3);

        let reader_yielded = Arc::new(std::sync::atomic::AtomicBool::new(false));
        let value = store
            .reader_async::<proto::Counter, _, _, _>(
                "tests.reboot.protoc.Counter",
                context.reader(proto::Empty {}).unwrap(),
                {
                    let reader_yielded = reader_yielded.clone();
                    move |state, _| {
                        let reader_yielded = reader_yielded.clone();
                        Box::pin(async move {
                            tokio::task::yield_now().await;
                            reader_yielded.store(true, std::sync::atomic::Ordering::SeqCst);
                            Ok(proto::CounterValue { value: state.value })
                        })
                    }
                },
            )
            .await
            .unwrap()
            .into_inner();
        assert!(reader_yielded.load(std::sync::atomic::Ordering::SeqCst));
        assert_eq!(value.value, 3);
        database_server.abort();
    }

    #[tokio::test]
    async fn database_actor_store_async_callbacks_serialize_across_independent_connections() {
        let (database_address, database, database_server) = start_database().await;
        let first_store = DatabaseActorStore::connect(&database_address)
            .await
            .unwrap();
        let second_store = DatabaseActorStore::connect(&database_address)
            .await
            .unwrap();
        let context = ExternalContext::new("independent-store-async-lock");
        let first_entered = Arc::new(tokio::sync::Notify::new());
        let release_first = Arc::new(tokio::sync::Notify::new());
        let start_second = Arc::new(tokio::sync::Barrier::new(2));
        let second_attempted = Arc::new(tokio::sync::Notify::new());
        let second_callback_started = Arc::new(std::sync::atomic::AtomicBool::new(false));

        let first = tokio::spawn({
            let store = first_store.clone();
            let first_entered = first_entered.clone();
            let release_first = release_first.clone();
            let request = context
                .writer_with_key(proto::IncrementRequest { amount: 1 }, Uuid::from_u128(201))
                .unwrap();
            async move {
                store
                    .writer_async::<proto::Counter, _, _, _>(
                        "tests.reboot.protoc.Counter",
                        request,
                        move |state, request| {
                            let first_entered = first_entered.clone();
                            let release_first = release_first.clone();
                            Box::pin(async move {
                                first_entered.notify_one();
                                release_first.notified().await;
                                state.value += request.amount;
                                Ok(proto::CounterValue { value: state.value })
                            })
                        },
                    )
                    .await
            }
        });
        first_entered.notified().await;

        let second = tokio::spawn({
            let store = second_store.clone();
            let start_second = start_second.clone();
            let second_attempted = second_attempted.clone();
            let second_callback_started = second_callback_started.clone();
            let request = context
                .writer_with_key(proto::IncrementRequest { amount: 2 }, Uuid::from_u128(202))
                .unwrap();
            async move {
                start_second.wait().await;
                second_attempted.notify_one();
                store
                    .writer_async::<proto::Counter, _, _, _>(
                        "tests.reboot.protoc.Counter",
                        request,
                        move |state, request| {
                            let second_callback_started = second_callback_started.clone();
                            Box::pin(async move {
                                second_callback_started
                                    .store(true, std::sync::atomic::Ordering::SeqCst);
                                state.value += request.amount;
                                Ok(proto::CounterValue { value: state.value })
                            })
                        },
                    )
                    .await
            }
        });
        start_second.wait().await;
        second_attempted.notified().await;
        assert!(
            !second_callback_started.load(std::sync::atomic::Ordering::SeqCst),
            "an independently connected store must not enter a same-actor writer while it awaits"
        );

        release_first.notify_one();
        assert_eq!(first.await.unwrap().unwrap().into_inner().value, 1);
        assert_eq!(second.await.unwrap().unwrap().into_inner().value, 3);
        assert_eq!(
            first_store
                .load::<proto::Counter>("independent-store-async-lock")
                .await
                .unwrap(),
            Some(proto::Counter { value: 3 }),
            "both serialized updates must be durably stored"
        );
        assert_eq!(database.store_requests().len(), 2);
        database_server.abort();
    }

    #[tokio::test]
    async fn file_backed_host_survives_restart_and_rejects_collisions() {
        let directory = tempfile::tempdir().unwrap();
        let context = ExternalContext::new("durable-echo");
        let key = Uuid::from_u128(7);

        let (address, server) =
            start_file_host(FileBackedHost::open(directory.path()).unwrap()).await;
        let mut client = proto::echo_methods_client::EchoMethodsClient::connect(address)
            .await
            .unwrap();
        let first = client
            .reply(
                context
                    .writer_with_key(
                        proto::Text {
                            content: "persisted".into(),
                        },
                        key,
                    )
                    .unwrap(),
            )
            .await
            .unwrap()
            .into_inner();
        assert_eq!(first.content, "persisted");
        server.abort();

        let (address, server) =
            start_file_host(FileBackedHost::open(directory.path()).unwrap()).await;
        let mut client = proto::echo_methods_client::EchoMethodsClient::connect(address)
            .await
            .unwrap();
        let replay = client
            .reply(context.writer_with_key(first.clone(), key).unwrap())
            .await
            .unwrap()
            .into_inner();
        assert_eq!(replay.content, "persisted");
        let collision = client
            .reply(
                context
                    .writer_with_key(
                        proto::Text {
                            content: "must not replace persisted response".into(),
                        },
                        key,
                    )
                    .unwrap(),
            )
            .await
            .unwrap_err();
        assert_eq!(collision.code(), tonic::Code::FailedPrecondition);
        let last = client
            .last_message(context.reader(proto::Empty {}).unwrap())
            .await
            .unwrap()
            .into_inner();
        assert_eq!(last.content, "persisted");
        server.abort();
    }

    #[tokio::test]
    async fn reply_replays_matching_requests_and_rejects_collisions() {
        let (address, server) = start_host().await;
        let mut client = proto::echo_methods_client::EchoMethodsClient::connect(address)
            .await
            .unwrap();
        let context = ExternalContext::new("echo-one");
        let key = Uuid::from_u128(1);

        let first = client
            .reply(
                context
                    .writer_with_key(
                        proto::Text {
                            content: "first".into(),
                        },
                        key,
                    )
                    .unwrap(),
            )
            .await
            .unwrap()
            .into_inner();
        assert_eq!(first.content, "first");

        let replay = client
            .reply(context.writer_with_key(first.clone(), key).unwrap())
            .await
            .unwrap()
            .into_inner();
        assert_eq!(replay.content, "first");

        let collision = client
            .reply(
                context
                    .writer_with_key(
                        proto::Text {
                            content: "must not replace first".into(),
                        },
                        key,
                    )
                    .unwrap(),
            )
            .await
            .unwrap_err();
        assert_eq!(collision.code(), tonic::Code::FailedPrecondition);

        let last = client
            .last_message(context.reader(proto::Empty {}).unwrap())
            .await
            .unwrap()
            .into_inner();
        assert_eq!(last.content, "first");
        server.abort();
    }

    #[test]
    fn file_backed_actor_legacy_writes_without_fingerprints_replay() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("legacy.rbt");
        let key = Uuid::from_u128(8);
        let legacy = PersistedEchoActor {
            state: Some(proto::Echo {
                last_message: Some(proto::Text {
                    content: "legacy state".into(),
                }),
            }),
            completed_writes: vec![PersistedWrite {
                idempotency_key: key.to_string(),
                response: Some(proto::Text {
                    content: "legacy response".into(),
                }),
                request_fingerprint: None,
            }],
        };
        std::fs::write(&path, legacy.encode_to_vec()).unwrap();

        let actor = FileBackedEchoActor::open(path).unwrap();
        assert_eq!(
            actor
                .writer(
                    key,
                    request_fingerprint(
                        ECHO_REPLY_METHOD_IDENTITY,
                        &proto::Text {
                            content: "new request".into(),
                        },
                    ),
                    proto::Text {
                        content: "must not replace legacy response".into(),
                    },
                )
                .unwrap()
                .content,
            "legacy response"
        );
        assert_eq!(
            actor
                .reader(|state| state.last_message.clone().unwrap())
                .content,
            "legacy state"
        );
    }

    #[tokio::test]
    async fn state_references_are_isolated() {
        let (address, server) = start_host().await;
        let mut client = proto::echo_methods_client::EchoMethodsClient::connect(address)
            .await
            .unwrap();
        let first = ExternalContext::new("echo-first");
        let second = ExternalContext::new("echo-second");

        client
            .reply(
                first
                    .writer_with_key(
                        proto::Text {
                            content: "one".into(),
                        },
                        Uuid::from_u128(2),
                    )
                    .unwrap(),
            )
            .await
            .unwrap();
        client
            .reply(
                second
                    .writer_with_key(
                        proto::Text {
                            content: "two".into(),
                        },
                        Uuid::from_u128(2),
                    )
                    .unwrap(),
            )
            .await
            .unwrap();

        let first_last = client
            .last_message(first.reader(proto::Empty {}).unwrap())
            .await
            .unwrap()
            .into_inner();
        let second_last = client
            .last_message(second.reader(proto::Empty {}).unwrap())
            .await
            .unwrap()
            .into_inner();
        assert_eq!(first_last.content, "one");
        assert_eq!(second_last.content, "two");
        server.abort();
    }

    #[tokio::test]
    async fn invalid_metadata_is_rejected() {
        let (address, server) = start_host().await;
        let mut client = proto::echo_methods_client::EchoMethodsClient::connect(address)
            .await
            .unwrap();

        let missing_state = client.last_message(proto::Empty {}).await.unwrap_err();
        assert_eq!(missing_state.code(), tonic::Code::InvalidArgument);

        let mut empty_state = Request::new(proto::Empty {});
        empty_state
            .metadata_mut()
            .insert(STATE_REF_HEADER, "".parse().unwrap());
        let empty_state = client.last_message(empty_state).await.unwrap_err();
        assert_eq!(empty_state.code(), tonic::Code::InvalidArgument);

        let mut missing_key = Request::new(proto::Text {
            content: "no key".into(),
        });
        missing_key
            .metadata_mut()
            .insert(STATE_REF_HEADER, "echo".parse().unwrap());
        let missing_key = client.reply(missing_key).await.unwrap_err();
        assert_eq!(missing_key.code(), tonic::Code::InvalidArgument);

        let mut invalid_key = Request::new(proto::Text {
            content: "bad key".into(),
        });
        invalid_key
            .metadata_mut()
            .insert(STATE_REF_HEADER, "echo".parse().unwrap());
        invalid_key
            .metadata_mut()
            .insert(IDEMPOTENCY_KEY_HEADER, "not-a-uuid".parse().unwrap());
        let invalid_key = client.reply(invalid_key).await.unwrap_err();
        assert_eq!(invalid_key.code(), tonic::Code::InvalidArgument);
        server.abort();
    }
}
