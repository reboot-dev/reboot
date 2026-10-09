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
    live_leaf: bool,
    supervised_tree: bool,
    /// Installed only after actual inbound live reservation/execution admission.
    /// An outbound nested clone is not a newly admitted inbound incarnation.
    supervised_inbound_headers: Option<RebootHeaders>,
    admitted_actor: Option<crate::durable_coordinator::ParticipantTarget>,
    sequential_root_star: bool,
    sequential_reusable: bool,
    builtin_map_admission: Option<BuiltinMapAdmission>,
}

/// In-process authority installed only by an admitted, cancellation-owned
/// generated root guard. Public headers never manufacture this capability.
#[derive(Clone)]
struct BuiltinMapAdmission {
    endpoint: String,
    active: Arc<std::sync::atomic::AtomicBool>,
    owner: crate::explicit_abort::ExplicitAbortOwner,
    maps: crate::sorted_map::RetainedMapSessions,
}

impl std::fmt::Debug for BuiltinMapAdmission {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("BuiltinMapAdmission")
            .field("endpoint", &self.endpoint)
            .finish_non_exhaustive()
    }
}

#[derive(Debug, Default)]
struct ReturnedParticipantCollection {
    participants: BTreeMap<crate::durable_coordinator::ParticipantTarget, bool>,
    sealed: bool,
    active: usize,
    late_enlistment: bool,
    membership_uncertain: bool,
    dispatched: bool,
    attempted: std::collections::BTreeSet<crate::durable_coordinator::ParticipantTarget>,
}

/// One-use outbound authority consumed by the runtime-owned unary transport.
/// Dropping even an unissued scope conservatively retains membership uncertainty.
/// There is no public terminal setter: caller-created responses are only data.
///
/// ```compile_fail
/// fn forge(scope: &mut reboot_rust_schema::runtime::TransactionalOutboundScope) {
///     scope.completed();
/// }
/// ```
///
/// ```compile_fail
/// fn forge(context: &reboot_rust_schema::runtime::TransactionContext,
///          scope: &reboot_rust_schema::runtime::TransactionalOutboundScope,
///          fake: &reboot_rust_schema::successful_trailers::ReturnedParticipants) {
///     context.enlist_generated_returned_participants(scope, fake).unwrap();
/// }
/// ```
#[doc(hidden)]
pub struct TransactionalOutboundScope {
    completed: bool,
    collection: Option<Arc<Mutex<ReturnedParticipantCollection>>>,
    context: TransactionContext,
    binding: Option<(crate::durable_coordinator::ParticipantTarget, String)>,
    request_used: std::sync::atomic::AtomicBool,
}

#[cfg(test)]
impl TransactionalOutboundScope {
    // Unit fixture setup, absent from SDK/downstream builds. This does not
    // provide production completion authority.
    pub(crate) fn test_terminal_state_setup(&mut self) {
        self.completed = true;
    }
}

impl Drop for TransactionalOutboundScope {
    fn drop(&mut self) {
        if let Some(collection) = &self.collection {
            let mut state = collection
                .lock()
                .expect("returned participant mutex poisoned");
            state.active -= 1;
            if !self.completed {
                state.membership_uncertain = true;
            }
        }
    }
}

/// Private lifetime reservation for one same-host builtin operation.
/// Failed or unreturned work retains root membership uncertainty. Only a
/// successful return can settle; native participant uncertainty stays separate.
pub(crate) struct BuiltinMapOperation {
    context: TransactionContext,
    completed: bool,
}
impl BuiltinMapOperation {
    pub(crate) fn returned(&mut self, endpoint: &str) -> Result<(), Status> {
        self.context.validate_builtin_map_admission(endpoint)?;
        self.settle_ledger()
    }
    fn settle_ledger(&mut self) -> Result<(), Status> {
        let ledger = self
            .context
            .returned_participants
            .as_ref()
            .expect("admitted root ledger");
        let state = ledger.lock().expect("returned participant mutex poisoned");
        if state.sealed || state.active != 1 || state.membership_uncertain || state.late_enlistment
        {
            return Err(Status::failed_precondition(
                "builtin operation cannot settle a closed or uncertain root",
            ));
        }
        self.completed = true;
        Ok(())
    }
}
impl Drop for BuiltinMapOperation {
    fn drop(&mut self) {
        {
            let ledger = self
                .context
                .returned_participants
                .as_ref()
                .expect("admitted root ledger");
            let mut state = ledger.lock().expect("returned participant mutex poisoned");
            state.active -= 1;
            if !self.completed {
                state.membership_uncertain = true;
            }
        }
        if !self.completed {
            self.context.doom(Status::failed_precondition(
                "builtin map operation dropped or failed before acknowledged settlement",
            ));
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
    if context.tree_owned() {
        return Err(Status::failed_precondition(
            "tree outbound requires counted generated scope",
        ));
    }
    transactional_outbound_request_inner(resolver, context, state_type, state_ref, message).await
}

/// Builds a request under a caller-retained counted scope from the same branch.
/// This is raw/manual transport plumbing, not terminal authority. Its scope
/// cannot be settled by the caller; dropping it retains uncertainty. Generated
/// clients instead consume the scope in `generated_transactional_unary`.
#[doc(hidden)]
pub async fn scoped_transactional_outbound_request<R: TransactionalChannelResolver, Message>(
    resolver: &R,
    context: &TransactionContext,
    scope: &TransactionalOutboundScope,
    state_type: &str,
    state_ref: &str,
    message: Message,
) -> Result<(tonic::transport::Channel, Request<Message>), Status> {
    context.validate_outbound_scope_admission(scope)?;
    let target = crate::durable_coordinator::ParticipantTarget {
        state_type: state_type.to_owned(),
        state_ref: state_ref.to_owned(),
    };
    if scope
        .binding
        .as_ref()
        .is_some_and(|(bound, _)| bound != &target)
        || (context.sequential_root_star && scope.binding.is_none())
        || scope
            .request_used
            .swap(true, std::sync::atomic::Ordering::AcqRel)
    {
        return Err(Status::failed_precondition(
            "outbound scope target mismatch or request reused",
        ));
    }
    if context.tree_owned()
        && (context.admitted_actor.as_ref().map_or_else(
            || state_ref == context.headers().state_ref,
            |local| local == &target,
        ) || (state_type == context.transaction_coordinator_state_type()
            && state_ref == context.transaction_coordinator_state_ref()))
    {
        return Err(Status::failed_precondition(
            "tree actors must be distinct and non-reentrant",
        ));
    }
    let routed =
        transactional_outbound_request_inner(resolver, context, state_type, state_ref, message)
            .await?;
    context.validate_outbound_scope_admission(scope)?;
    Ok(routed)
}

/// Generated method binding is checked independently of the transport helper.
#[doc(hidden)]
pub async fn scoped_generated_transactional_outbound_request<
    R: TransactionalChannelResolver,
    Message,
>(
    resolver: &R,
    context: &TransactionContext,
    scope: &TransactionalOutboundScope,
    state_type: &str,
    state_ref: &str,
    method: &str,
    message: Message,
) -> Result<(tonic::transport::Channel, Request<Message>), Status> {
    if scope
        .binding
        .as_ref()
        .is_none_or(|(_, bound)| bound != method)
    {
        return Err(Status::failed_precondition(
            "outbound generated method differs from scope",
        ));
    }
    scoped_transactional_outbound_request(resolver, context, scope, state_type, state_ref, message)
        .await
}

/// Generated method-declared error schema. This is trusted composition data,
/// never a transport receipt. A validator only decodes protobuf bytes from the
/// runtime's actual terminal Status; it cannot supply an RPC outcome.
#[doc(hidden)]
pub struct DeclaredTransactionalError {
    type_url: &'static str,
    validate: fn(&[u8]) -> Result<(), prost::DecodeError>,
}
impl DeclaredTransactionalError {
    pub fn protobuf<M: Message + Default>(type_url: &'static str) -> Self {
        Self {
            type_url,
            validate: |bytes| M::decode(bytes).map(|_| ()),
        }
    }
}

/// Performs the actual bound unary RPC and consumes its one-use scope.
/// Only this runtime-owned transport path may settle terminal membership.
/// Cancellation, routing failure and invalid terminal data leave uncertainty.
/// Resolver registration and generated error schemas are trusted host inputs;
/// caller-created Response/Status values are never accepted as evidence.
#[doc(hidden)]
pub async fn generated_transactional_unary<R, Req, Resp>(
    resolver: &R,
    context: &TransactionContext,
    mut scope: TransactionalOutboundScope,
    message: Req,
    declared_errors: &[DeclaredTransactionalError],
) -> Result<TransactionalCallResponse<Resp>, Status>
where
    R: TransactionalChannelResolver,
    Req: Message + Default + Send + 'static,
    Resp: Message + Default + Send + 'static,
{
    let result = generated_transactional_unary_inner(
        resolver,
        context,
        &mut scope,
        message,
        declared_errors,
    )
    .await;
    // Recoverable errors return the actual Status after private settlement.
    // Every other failed outcome dooms even a handler which catches it.
    if let Err(status) = &result
        && !scope.completed
    {
        context.doom(status.clone());
    }
    result
}

async fn generated_transactional_unary_inner<R, Req, Resp>(
    resolver: &R,
    context: &TransactionContext,
    scope: &mut TransactionalOutboundScope,
    message: Req,
    declared_errors: &[DeclaredTransactionalError],
) -> Result<TransactionalCallResponse<Resp>, Status>
where
    R: TransactionalChannelResolver,
    Req: Message + Default + Send + 'static,
    Resp: Message + Default + Send + 'static,
{
    let (target, method) = scope
        .binding
        .clone()
        .ok_or_else(|| Status::failed_precondition("generated unary requires bound scope"))?;
    let path = if method.starts_with('/') {
        method.clone()
    } else {
        let (service, rpc) = method
            .rsplit_once('.')
            .ok_or_else(|| Status::invalid_argument("invalid canonical RPC method"))?;
        format!("/{service}/{rpc}")
    };
    let path = path
        .parse::<http::uri::PathAndQuery>()
        .map_err(|_| Status::invalid_argument("invalid canonical RPC path"))?;
    let (channel, request) = scoped_generated_transactional_outbound_request(
        resolver,
        context,
        scope,
        &target.state_type,
        &target.state_ref,
        &method,
        message,
    )
    .await?;
    let mut client = tonic::client::Grpc::new(channel);
    client
        .ready()
        .await
        .map_err(|error| Status::unknown(format!("Service was not ready: {error}")))?;
    // Readiness is another transport await after routing; a retained scope
    // cannot issue work after its owner closes the branch.
    context.validate_outbound_scope_admission(scope)?;
    let response = client
        .unary::<Req, Resp, _>(request, path, tonic::codec::ProstCodec::default())
        .await;
    context.validate_outbound_scope_admission(scope)?;
    match response {
        Ok(response) => {
            let returned = crate::successful_trailers::ReturnedParticipants::from_metadata(
                response.metadata(),
            )
            .map_err(|error| Status::failed_precondition(error.to_string()))?;
            context.enlist_generated_returned_participants(scope, &returned)?;
            Ok(TransactionalCallResponse::new(response, returned))
        }
        Err(status) => {
            if context.supervised_tree_execution() {
                if !singleton_declared_status(&status, declared_errors) {
                    return Err(status);
                }
                context.enlist_rolled_back_leaf(
                    Some(scope),
                    status.metadata(),
                    &target.state_type,
                    &target.state_ref,
                )?;
            } else if recoverable_unsupervised_status(&status, declared_errors) {
                // Preserve legacy declared/system recoverability; no supervised
                // rollback membership contract is imposed on the default path.
                settle_terminal_scope(context, scope)?;
            }
            Err(status)
        }
    }
}

fn singleton_declared_status(status: &Status, schema: &[DeclaredTransactionalError]) -> bool {
    matches!(crate::declared_error_details(status), Ok(Some(ref rich))
        if rich.details.len() == 1 && schema.iter().any(|entry|
            entry.type_url == rich.details[0].type_url
                && (entry.validate)(&rich.details[0].value).is_ok()))
}

fn recoverable_unsupervised_status(status: &Status, schema: &[DeclaredTransactionalError]) -> bool {
    if schema.is_empty() {
        return false;
    }
    let Ok(Some(rich)) = crate::declared_error_details(status) else {
        return false;
    };
    // Match the legacy generated enum's ordered detail conversion exactly.
    for detail in rich.details {
        for entry in schema {
            if entry.type_url == detail.type_url {
                return (entry.validate)(&detail.value).is_ok();
            }
        }
        match crate::system_aborted_from_detail(&detail) {
            Ok(Some(system)) => return system.is_recoverable(),
            Err(_) => return false,
            Ok(None) => {}
        }
    }
    false
}

// Called only after consuming an actual runtime-owned transport terminal.
// No await separates terminal validation, ledger disposition and settlement.
fn settle_terminal_scope(
    context: &TransactionContext,
    scope: &mut TransactionalOutboundScope,
) -> Result<(), Status> {
    context.require_outbound_allowed()?;
    if let Some(status) = context.doomed_status() {
        return Err(status);
    }
    if scope.completed
        || !context.same_ownership_context(&scope.context)
        || !scope
            .request_used
            .load(std::sync::atomic::Ordering::Acquire)
    {
        return Err(Status::failed_precondition(
            "terminal scope ownership mismatch",
        ));
    }
    if let Some(collection) = &scope.collection {
        let ledger = collection
            .lock()
            .expect("returned participant mutex poisoned");
        if ledger.sealed
            || ledger.active == 0
            || ledger.membership_uncertain
            || ledger.late_enlistment
        {
            return Err(Status::failed_precondition(
                "terminal settlement on closed or uncertain branch",
            ));
        }
        if let Some(status) = context.doomed_status() {
            return Err(status);
        }
        scope.completed = true;
    } else {
        scope.completed = true;
    }
    Ok(())
}

async fn transactional_outbound_request_inner<R: TransactionalChannelResolver, Message>(
    resolver: &R,
    context: &TransactionContext,
    state_type: &str,
    state_ref: &str,
    message: Message,
) -> Result<(tonic::transport::Channel, Request<Message>), Status> {
    if state_type.is_empty() || state_ref.is_empty() {
        return Err(Status::invalid_argument(
            "target state type and reference must not be empty",
        ));
    }
    context.require_outbound_allowed()?;
    let mut headers = context.headers().clone();
    headers.state_ref = state_ref.to_owned();
    let metadata = headers
        .to_metadata()
        .map_err(|error| Status::invalid_argument(error.to_string()))?;
    let channel = resolver.resolve(state_type, state_ref).await?;
    context.require_outbound_allowed()?;
    if let Some(collection) = &context.returned_participants
        && collection
            .lock()
            .expect("returned participant mutex poisoned")
            .sealed
    {
        return Err(Status::failed_precondition(
            "outbound branch closed during routing",
        ));
    }
    if let Some(status) = context.doomed_status() {
        return Err(status);
    }
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
            live_leaf: false,
            supervised_tree: false,
            supervised_inbound_headers: None,
            admitted_actor: None,
            sequential_root_star: false,
            sequential_reusable: false,
            builtin_map_admission: None,
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

    // Called only after the guard installs actual root or live execution ownership.
    #[doc(hidden)]
    pub fn validate_tree_scope(&self) -> Result<(), Status> {
        if self.mode != TransactionMode::Exclusive
            || self.headers.idempotency_key.is_some()
            || self.transaction_ids().len() > 32
        {
            return Err(Status::failed_precondition(
                "tree requires bounded exclusive non-idempotent execution",
            ));
        }
        Ok(())
    }

    pub(crate) fn enable_supervised_tree(&mut self) -> Result<(), Status> {
        self.validate_tree_scope()?;
        if self.returned_participants.is_none() {
            self.returned_participants = Some(Arc::new(Mutex::new(
                ReturnedParticipantCollection::default(),
            )));
        }
        self.supervised_tree = true;
        if self.is_fresh_root() {
            self.enable_read_only_aware();
        }
        Ok(())
    }

    pub(crate) fn mark_supervised_inbound(&mut self) {
        debug_assert!(self.supervised_tree && self.returned_participants.is_some());
        self.supervised_inbound_headers = Some(self.headers.clone());
    }

    pub(crate) fn install_actor_authority(
        &mut self,
        actor: crate::durable_coordinator::ParticipantTarget,
        sequential_root_star: bool,
    ) -> Result<(), Status> {
        if actor.state_ref != self.headers.state_ref || !self.supervised_tree {
            return Err(Status::failed_precondition(
                "tree actor authority differs from admitted execution",
            ));
        }
        if sequential_root_star && !self.is_fresh_root() {
            self.enforce_live_leaf()?;
        }
        self.admitted_actor = Some(actor);
        self.sequential_root_star = sequential_root_star;
        Ok(())
    }

    pub(crate) fn install_reusable_policy(&mut self) -> Result<(), Status> {
        if !self.supervised_tree
            || self.mode != TransactionMode::Exclusive
            || self.headers.idempotency_key.is_some()
            || self.transaction_ids().len() > 2
        {
            return Err(Status::failed_precondition(
                "reusable policy requires registered root or direct leaf",
            ));
        }
        self.sequential_reusable = true;
        self.sequential_root_star = true;
        Ok(())
    }

    #[doc(hidden)]
    pub fn reusable_participants(&self) -> bool {
        self.sequential_reusable
    }

    fn supervised_inbound_at_depth(&self, depth: usize) -> bool {
        self.supervised_tree
            && self.returned_participants.is_some()
            && self.transaction_ids().len() == depth
            && self.supervised_inbound_headers.as_ref() == Some(&self.headers)
    }

    /// Bounded first-touch recovery dispatch; ledger and participant checks remain independent.
    #[doc(hidden)]
    pub fn supports_rollback_leaf_path(&self) -> bool {
        self.transaction_ids().len() == 2 || self.supervised_inbound_at_depth(3)
    }

    pub(crate) fn same_ownership_context(&self, other: &Self) -> bool {
        self == other
            && self.admitted_actor == other.admitted_actor
            && self.sequential_root_star == other.sequential_root_star
            && self.sequential_reusable == other.sequential_reusable
            && self.supervised_inbound_headers == other.supervised_inbound_headers
            && self.supervised_tree == other.supervised_tree
            && self.live_leaf == other.live_leaf
            && Arc::ptr_eq(&self.doomed, &other.doomed)
            && match (&self.returned_participants, &other.returned_participants) {
                (Some(a), Some(b)) => Arc::ptr_eq(a, b),
                (None, None) => true,
                _ => false,
            }
    }

    /// Whether an actual supervising guard has installed tree execution authority.
    pub fn supervised_tree_execution(&self) -> bool {
        self.supervised_tree
    }

    pub(crate) fn tree_owned(&self) -> bool {
        self.supervised_tree
    }

    pub(crate) fn validate_open_task_branch(&self) -> Result<(), Status> {
        self.validate_tree_scope()?;
        if let Some(error) = self.doomed_status() {
            return Err(error);
        }
        let collection = self
            .returned_participants
            .as_ref()
            .ok_or_else(|| Status::failed_precondition("tree task branch missing"))?;
        let branch = collection
            .lock()
            .expect("returned participant mutex poisoned");
        if branch.sealed
            || branch.active != 0
            || branch.membership_uncertain
            || branch.late_enlistment
        {
            return Err(Status::failed_precondition(
                "tree tasks require open quiescent branch",
            ));
        }
        Ok(())
    }

    pub(crate) fn close_branch(&self) {
        if self.supervised_tree
            && let Some(collection) = &self.returned_participants
        {
            collection
                .lock()
                .expect("returned participant mutex poisoned")
                .sealed = true;
        }
    }

    pub(crate) async fn wait_branch_quiescent(&self) {
        loop {
            let active = self
                .returned_participants
                .as_ref()
                .map(|collection| {
                    collection
                        .lock()
                        .expect("returned participant mutex poisoned")
                        .active
                })
                .unwrap_or(0);
            if active == 0 {
                return;
            }
            tokio::time::sleep(std::time::Duration::from_millis(5)).await;
        }
    }

    /// A live participant owner permits only a direct-root exclusive leaf.
    /// Restriction is monotonic and survives context cloning/nesting.
    #[doc(hidden)]
    pub fn enforce_live_leaf(&mut self) -> Result<(), Status> {
        if self.is_fresh_root()
            || self.mode != TransactionMode::Exclusive
            || self.transaction_ids().len() != 2
            || self.headers.idempotency_key.is_some()
        {
            return Err(Status::failed_precondition(
                "live Watch requires a direct-root exclusive non-idempotent leaf",
            ));
        }
        self.live_leaf = true;
        Ok(())
    }
    fn require_outbound_allowed(&self) -> Result<(), Status> {
        if self.live_leaf {
            let status = Status::failed_precondition("live inbound leaf cannot call descendants");
            self.doom(status.clone());
            return Err(status);
        }
        Ok(())
    }

    /// Admission only, never terminal authority. Recheck retained reservations
    /// at every outbound await boundary; terminal disposition independently
    /// validates the ledger under the same lock as its mutation and settlement.
    fn validate_outbound_scope_admission(
        &self,
        scope: &TransactionalOutboundScope,
    ) -> Result<(), Status> {
        self.require_outbound_allowed()?;
        if let Some(status) = self.doomed_status() {
            return Err(status);
        }
        let same_collection = match (&self.returned_participants, &scope.collection) {
            (Some(a), Some(b)) => Arc::ptr_eq(a, b),
            (None, None) => true,
            _ => false,
        };
        if scope.completed || !same_collection || !self.same_ownership_context(&scope.context) {
            return Err(Status::failed_precondition(
                "outbound scope differs from branch",
            ));
        }
        if let Some(collection) = &scope.collection {
            let ledger = collection
                .lock()
                .expect("returned participant mutex poisoned");
            if ledger.sealed
                || ledger.active == 0
                || (self.sequential_root_star && ledger.active != 1)
                || ledger.membership_uncertain
                || ledger.late_enlistment
            {
                return Err(Status::failed_precondition(
                    "outbound scope on closed, inactive or uncertain branch",
                ));
            }
        }
        Ok(())
    }

    /// Acquires generated outbound admission before any resolver or network call.
    #[doc(hidden)]
    pub fn begin_generated_outbound(&self) -> Result<TransactionalOutboundScope, Status> {
        if self.sequential_root_star {
            return Err(Status::failed_precondition(
                "root-star requires target-bound generated admission",
            ));
        }
        self.begin_outbound_bound(None)
    }

    /// One generated canonical method/target, reserved before resolver entry.
    #[doc(hidden)]
    pub fn begin_generated_outbound_for(
        &self,
        state_type: &str,
        state_ref: &str,
        method: &str,
    ) -> Result<TransactionalOutboundScope, Status> {
        if state_type.is_empty() || state_ref.is_empty() || method.is_empty() {
            return Err(Status::invalid_argument(
                "outbound target/method must not be empty",
            ));
        }
        self.begin_outbound_bound(Some((
            crate::durable_coordinator::ParticipantTarget {
                state_type: state_type.to_owned(),
                state_ref: state_ref.to_owned(),
            },
            method.to_owned(),
        )))
    }

    fn begin_outbound_bound(
        &self,
        binding: Option<(crate::durable_coordinator::ParticipantTarget, String)>,
    ) -> Result<TransactionalOutboundScope, Status> {
        self.require_outbound_allowed()?;
        if let Some(status) = self.doomed_status() {
            return Err(status);
        }
        if self.sequential_root_star && (!self.is_fresh_root() || self.admitted_actor.is_none()) {
            return Err(Status::failed_precondition(
                "root-star requires exact admitted root context",
            ));
        }
        if let Some(collection) = &self.returned_participants {
            let mut state = collection
                .lock()
                .expect("returned participant mutex poisoned");
            if state.sealed {
                return Err(Status::failed_precondition(
                    "root outbound collection is sealed",
                ));
            }
            if state.active >= 1024 || state.attempted.len() >= 1024 {
                return Err(Status::resource_exhausted(
                    "outbound branch capacity exceeded",
                ));
            }
            if self.sequential_root_star
                && (state.active != 0 || state.membership_uncertain || state.late_enlistment)
            {
                return Err(Status::failed_precondition(
                    "root-star requires quiescent certain branch",
                ));
            }
            if self.supervised_tree && !self.sequential_root_star && state.dispatched {
                return Err(Status::failed_precondition(
                    "tree branch admits only one child",
                ));
            }
            if self.sequential_root_star {
                let (target, _) = binding.as_ref().ok_or_else(|| {
                    Status::failed_precondition("root-star target binding missing")
                })?;
                if self.admitted_actor.as_ref() == Some(target)
                    || (target.state_type == self.transaction_coordinator_state_type()
                        && target.state_ref == self.transaction_coordinator_state_ref())
                    || (!self.sequential_reusable
                        && (state.attempted.contains(target)
                            || state.participants.contains_key(target)))
                {
                    return Err(Status::failed_precondition(
                        "root-star actor repeated or reentrant",
                    ));
                }
                state.attempted.insert(target.clone());
            }
            state.dispatched = true;
            state.active += 1;
        }
        Ok(TransactionalOutboundScope {
            completed: false,
            collection: self.returned_participants.clone(),
            context: self.clone(),
            binding,
            request_used: std::sync::atomic::AtomicBool::new(false),
        })
    }

    /// Validate the complete leaf response before authorizing another sibling.
    #[doc(hidden)]
    fn enlist_generated_returned_participants(
        &self,
        scope: &mut TransactionalOutboundScope,
        returned: &crate::successful_trailers::ReturnedParticipants,
    ) -> Result<(), Status> {
        if scope.completed
            || !self.same_ownership_context(&scope.context)
            || !scope
                .request_used
                .load(std::sync::atomic::Ordering::Acquire)
        {
            return Err(Status::failed_precondition(
                "success differs from active generated request",
            ));
        }
        if self.sequential_root_star {
            let (target, _) = scope
                .binding
                .as_ref()
                .ok_or_else(|| Status::failed_precondition("success lacks target binding"))?;
            let entries = returned.participants();
            if entries.len() != 1 || &entries[0].target != target || entries[0].read_only {
                return Err(Status::failed_precondition(
                    "root-star success requires exact singleton writer leaf",
                ));
            }
        }
        self.require_outbound_allowed()?;
        if let Some(status) = self.doomed_status() {
            return Err(status);
        }
        if let Some(collection) = &self.returned_participants {
            let mut ledger = collection
                .lock()
                .expect("returned participant mutex poisoned");
            if ledger.sealed
                || ledger.active == 0
                || ledger.membership_uncertain
                || ledger.late_enlistment
            {
                return Err(Status::failed_precondition(
                    "terminal response on closed or uncertain branch",
                ));
            }
            if let Some(status) = self.doomed_status() {
                return Err(status);
            }
            let new_count = returned
                .participants()
                .iter()
                .filter(|p| !ledger.participants.contains_key(&p.target))
                .count();
            if ledger.participants.len().saturating_add(new_count) > 1024 {
                ledger.membership_uncertain = true;
                return Err(Status::resource_exhausted(
                    "returned participant aggregate exceeded",
                ));
            }
            for participant in returned.participants() {
                ledger
                    .participants
                    .entry(participant.target.clone())
                    .and_modify(|read_only| *read_only &= participant.read_only)
                    .or_insert(participant.read_only);
            }
            // Exact terminal disposition and settlement share the ledger lock.
            scope.completed = true;
        } else {
            scope.completed = true;
        }
        Ok(())
    }

    /// Validate error-path membership before the generated scope completes.
    #[doc(hidden)]
    fn enlist_rolled_back_leaf(
        &self,
        scope: Option<&mut TransactionalOutboundScope>,
        metadata: &tonic::metadata::MetadataMap,
        state_type: &str,
        state_ref: &str,
    ) -> Result<(), Status> {
        if !self.supervised_tree
            || !(self.is_fresh_root() || self.supervised_inbound_at_depth(2))
            || self.mode != TransactionMode::Exclusive
            || self.headers.idempotency_key.is_some()
            || !self.headers.coordinator_read_only_aware
            || self.doomed_status().is_some()
        {
            return Err(Status::failed_precondition(
                "recoverable error requires supervised root or exact admitted inbound branch",
            ));
        }
        let returned = crate::successful_trailers::ReturnedParticipants::from_metadata(metadata)
            .map_err(|error| Status::failed_precondition(error.to_string()))?;
        let entries = returned.participants();
        if entries.len() != 1
            || !entries[0].read_only
            || entries[0].target.state_type != state_type
            || entries[0].target.state_ref != state_ref
        {
            return Err(Status::failed_precondition(
                "error must retain exact read-only leaf membership",
            ));
        }
        let collection = self.returned_participants.as_ref().ok_or_else(|| {
            Status::failed_precondition("recoverable error requires initialized branch")
        })?;
        let mut ledger = collection
            .lock()
            .expect("returned participant mutex poisoned");
        if ledger.sealed
            || ledger.active != 1
            || ledger.membership_uncertain
            || ledger.late_enlistment
            || (!self.sequential_reusable && !ledger.participants.is_empty())
        {
            return Err(Status::failed_precondition(
                "recoverable error requires first outbound leaf",
            ));
        }
        if let Some(status) = self.doomed_status() {
            return Err(status);
        }
        if let Some(scope) = scope {
            if scope.completed
                || !self.same_ownership_context(&scope.context)
                || !scope
                    .request_used
                    .load(std::sync::atomic::Ordering::Acquire)
                || scope
                    .binding
                    .as_ref()
                    .is_none_or(|(target, _)| target != &entries[0].target)
            {
                return Err(Status::failed_precondition(
                    "rollback terminal scope ownership mismatch",
                ));
            }
            ledger
                .participants
                .entry(entries[0].target.clone())
                .or_insert(true);
            scope.completed = true;
        } else {
            // Private unit provenance setup only; no production call uses None.
            ledger.participants.insert(entries[0].target.clone(), true);
        }
        Ok(())
    }

    pub(crate) fn validate_rollback_leaf_branch(&self) -> Result<(), Status> {
        if !self.supervised_tree
            || !self.supports_rollback_leaf_path()
            || self.mode != TransactionMode::Exclusive
            || self.headers.idempotency_key.is_some()
            || !self.headers.coordinator_read_only_aware
            || self.doomed_status().is_some()
        {
            return Err(Status::failed_precondition(
                "rollback excludes unsupported branches",
            ));
        }
        let collection = self
            .returned_participants
            .as_ref()
            .ok_or_else(|| Status::failed_precondition("rollback requires initialized branch"))?;
        let ledger = collection
            .lock()
            .expect("returned participant mutex poisoned");
        if ledger.sealed
            || ledger.active != 0
            || ledger.dispatched
            || ledger.membership_uncertain
            || ledger.late_enlistment
            || !ledger.participants.is_empty()
        {
            return Err(Status::failed_precondition(
                "rollback excludes descendants and prior effects",
            ));
        }
        Ok(())
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
        if state.sealed || state.active != 0 || state.membership_uncertain {
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

    /// Abandonment closes generated outbound admission atomically. Unlike a
    /// Commit seal, this does not assert complete membership or clear uncertainty.
    pub(crate) fn close_for_abandonment(
        &self,
    ) -> Result<Vec<crate::durable_coordinator::ReturnedParticipant>, Status> {
        let collection = self.returned_participants.as_ref().ok_or_else(|| {
            Status::failed_precondition("abandonment requires fresh root provenance")
        })?;
        let mut state = collection
            .lock()
            .expect("returned participant mutex poisoned");
        // A successful Commit seal may precede the cancellable execution-mutex
        // wait. The actual registered, pre-handoff owner may still abandon it.
        // This is admission closure, not durable handoff authority: the caller
        // must retain the registration and reject a handed-off local capability.
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
    /// Default inbound contexts do not collect membership. Supervised inbound
    /// trees collect descendants in their own branch ledger; only a fresh root
    /// can drive root coordinator completion.
    pub fn enlist_returned_participants(
        &self,
        returned: &crate::successful_trailers::ReturnedParticipants,
    ) {
        if self.live_leaf {
            self.doom(Status::failed_precondition(
                "live inbound leaf cannot enlist descendants",
            ));
            return;
        }
        if let Some(participants) = &self.returned_participants {
            let mut collected = participants
                .lock()
                .expect("returned participant mutex poisoned");
            let new_count = returned
                .participants()
                .iter()
                .filter(|participant| !collected.participants.contains_key(&participant.target))
                .count();
            if collected.participants.len().saturating_add(new_count) > 1024 {
                collected.membership_uncertain = true;
                self.doom(Status::resource_exhausted(
                    "returned participant aggregate exceeded",
                ));
                return;
            }
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

    pub(crate) fn install_builtin_map_admission(
        &mut self,
        endpoint: &str,
        active: Arc<std::sync::atomic::AtomicBool>,
        owner: crate::explicit_abort::ExplicitAbortOwner,
    ) {
        self.builtin_map_admission = Some(BuiltinMapAdmission {
            endpoint: endpoint.to_owned(),
            active,
            owner,
            maps: Default::default(),
        });
    }

    pub(crate) fn retained_builtin_map(
        &self,
        endpoint: &str,
        target: &crate::durable_coordinator::ParticipantTarget,
    ) -> Result<Option<crate::sorted_map::RetainedMapGuard>, Status> {
        self.validate_builtin_map_admission(endpoint)?;
        Ok(self
            .builtin_map_admission
            .as_ref()
            .unwrap()
            .maps
            .lock()
            .expect("retained map mutex poisoned")
            .get(target)
            .cloned())
    }
    pub(crate) fn retain_builtin_map(
        &self,
        endpoint: &str,
        target: crate::durable_coordinator::ParticipantTarget,
        guard: crate::sorted_map::RetainedMapGuard,
    ) -> Result<(), Status> {
        self.validate_builtin_map_admission(endpoint)?;
        let mut maps = self
            .builtin_map_admission
            .as_ref()
            .unwrap()
            .maps
            .lock()
            .expect("retained map mutex poisoned");
        if maps.contains_key(&target) || maps.len() >= 1024 {
            return Err(Status::failed_precondition(
                "duplicate or excessive retained map admission",
            ));
        }
        maps.insert(target, guard);
        Ok(())
    }

    pub(crate) fn begin_builtin_map_operation(
        &self,
        endpoint: &str,
    ) -> Result<BuiltinMapOperation, Status> {
        self.validate_builtin_map_admission(endpoint)?;
        self.reserve_builtin_map_operation()
    }

    fn reserve_builtin_map_operation(&self) -> Result<BuiltinMapOperation, Status> {
        let ledger = self
            .returned_participants
            .as_ref()
            .ok_or_else(|| Status::failed_precondition("missing admitted root ledger"))?;
        let mut state = ledger.lock().expect("returned participant mutex poisoned");
        if state.sealed
            || state.active != 0
            || state.membership_uncertain
            || state.late_enlistment
            || state.dispatched
            || self.doomed_status().is_some()
        {
            return Err(Status::failed_precondition(
                "builtin map operation requires a quiescent certain root",
            ));
        }
        state.active = 1;
        Ok(BuiltinMapOperation {
            context: self.clone(),
            completed: false,
        })
    }

    pub(crate) fn validate_builtin_map_admission(&self, endpoint: &str) -> Result<(), Status> {
        let admitted = self
            .builtin_map_admission
            .as_ref()
            .is_some_and(|admission| {
                admission.endpoint == endpoint
                    && admission.active.load(std::sync::atomic::Ordering::Acquire)
                    && admission
                        .owner
                        .validate_builtin_root(self.transaction_root_id())
                        .is_ok()
            });
        if !admitted
            || !self.is_fresh_root()
            || self.mode != TransactionMode::Exclusive
            || self.supervised_tree
            || self.sequential_root_star
            || self.sequential_reusable
            || self.doomed_status().is_some()
        {
            return Err(Status::failed_precondition(
                "SortedMap requires active admitted app-internal fresh exclusive root at the same native endpoint",
            ));
        }
        let ledger = self
            .returned_participants
            .as_ref()
            .ok_or_else(|| Status::failed_precondition("missing generated root ledger"))?
            .lock()
            .unwrap();
        if ledger.sealed
            || ledger.membership_uncertain
            || ledger.late_enlistment
            || ledger.dispatched
        {
            return Err(Status::failed_precondition(
                "SortedMap root is sealed or uncertain",
            ));
        }
        Ok(())
    }

    pub(crate) fn enlist_admitted_early_map(
        &self,
        target: crate::durable_coordinator::ParticipantTarget,
    ) -> Result<(), Status> {
        if !self.is_fresh_root()
            || self.mode != TransactionMode::Exclusive
            || self.returned_participants.is_none()
        {
            return Err(Status::failed_precondition(
                "early map requires fresh generated exclusive root ledger",
            ));
        }
        let mut ledger = self.returned_participants.as_ref().unwrap().lock().unwrap();
        if ledger.sealed || ledger.membership_uncertain || ledger.late_enlistment {
            return Err(Status::failed_precondition(
                "early map root ledger is sealed or uncertain",
            ));
        }
        if !ledger.participants.contains_key(&target) && ledger.participants.len() >= 1024 {
            // This target has not performed native IO. Reject before Store and
            // preserve complete existing membership for explicit Abort cleanup.
            let error = Status::resource_exhausted("returned participant aggregate exceeded");
            self.doom(error.clone());
            return Err(error);
        }
        ledger.participants.insert(target, false);
        Ok(())
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
    /// Legacy generated root adapters consume this immediately before durable
    /// completion. Supervised trees return a non-draining snapshot, including
    /// inbound descendant ledgers; inbound capabilities never coordinate roots.
    pub fn take_returned_participants(
        &self,
    ) -> Vec<crate::durable_coordinator::ReturnedParticipant> {
        if self.supervised_tree {
            return self.returned_participants_snapshot();
        }
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
            // A locally derived path shares its branch, never root coordinator authority.
            returned_participants: self.returned_participants.clone(),
            doomed: Arc::clone(&self.doomed),
            live_leaf: self.live_leaf,
            supervised_tree: self.supervised_tree,
            supervised_inbound_headers: None,
            admitted_actor: self.admitted_actor.clone(),
            sequential_root_star: self.sequential_root_star,
            sequential_reusable: self.sequential_reusable,
            builtin_map_admission: None,
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
    committed: tokio::sync::watch::Sender<(u64, bool)>,
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

/// A durable RPC in flight. Cancellation/error latches uncertainty so live
/// subscriptions fail closed rather than silently retaining a stale baseline.
pub(crate) struct ActorCommitAttempt {
    gate: ActorGate,
    acknowledged: bool,
}
impl ActorCommitAttempt {
    /// A durable control checkpoint changed no actor state; disarm uncertainty
    /// without fabricating a reader invalidation.
    pub(crate) fn checkpoint_acknowledged(mut self) {
        self.acknowledged = true;
    }
    pub(crate) fn acknowledged(mut self) {
        self.gate.committed();
        self.acknowledged = true;
    }
}
impl Drop for ActorCommitAttempt {
    fn drop(&mut self) {
        if !self.acknowledged {
            self.gate.inner.committed.send_modify(|event| {
                event.0 = event.0.wrapping_add(1);
                event.1 = true;
            });
        }
    }
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
                committed: tokio::sync::watch::channel((0, false)).0,
            }),
        }
    }

    pub(crate) fn committed_revisions(&self) -> tokio::sync::watch::Receiver<(u64, bool)> {
        self.inner.committed.subscribe()
    }

    pub(crate) fn committed(&self) {
        self.inner
            .committed
            .send_modify(|revision| revision.0 = revision.0.wrapping_add(1));
    }

    pub(crate) fn commit_attempt(&self) -> ActorCommitAttempt {
        ActorCommitAttempt {
            gate: self.clone(),
            acknowledged: false,
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
        #[cfg(feature = "test-support")]
        if let Some(path) = std::env::var_os("REBOOT_TEST_TREE_COMPETITOR_ENTRY") {
            std::fs::write(
                path,
                b"actual exclusive actor gate entered before lease acquisition",
            )
            .unwrap();
        }
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
pub(crate) fn same_actor_gate(endpoint: &str, state_type: &str, state_ref: &str) -> ActorGate {
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

fn decode_persisted_state<State: Message + Default>(
    state: Option<Vec<u8>>,
    state_type: &str,
) -> Result<Option<State>, Status> {
    state
        .map(|bytes| {
            State::decode(bytes.as_slice()).map_err(|error| {
                Status::internal(format!("invalid persisted {state_type} state: {error}"))
            })
        })
        .transpose()
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

impl crate::one_shot_tasks::AdmittedWriterTask<'_> {
    /// Execute once under dispatcher-minted exclusive admission. A durable
    /// checkpoint returns before state Load/handler/Store, even after another
    /// ordinary writer changed state. Completion remains a separate CAS.
    /// Method identity and request bytes are dispatcher-bound, not callback arguments.
    /// ```compile_fail
    /// use reboot_rust_schema::one_shot_tasks::AdmittedWriterTask;
    /// async fn replace(admitted: AdmittedWriterTask<'_>) {
    ///     admitted.execute("other.Service.Apply", prost_types::Any::default(), |_| async {}).await;
    /// }
    /// ```
    pub async fn execute<Declaration, RequestBody, ResponseBody, F>(
        self,
        invoke: F,
    ) -> Result<crate::one_shot_tasks::WriterTaskReceipt, Status>
    where
        Declaration: DurableStateDeclaration + 'static,
        RequestBody: Message + Default + Send + 'static,
        ResponseBody: Message + Default + Clone + Send + 'static,
        F: for<'a> FnOnce(
            &'a mut Declaration::State,
            RequestBody,
        ) -> Pin<
            Box<dyn Future<Output = Result<ResponseBody, Status>> + Send + 'a>,
        >,
    {
        self.execute_outcome::<Declaration, RequestBody, ResponseBody, _>(move |state, request| {
            let future = invoke(state, request);
            Box::pin(async move {
                future
                    .await
                    .map_err(crate::one_shot_tasks::TaskHandlerError::Failed)
            })
        })
        .await
    }

    /// The runtime seals only handler-returned dispositions, before any Store.
    /// Failed private state is dropped, never checkpointed. Transport uncertainty
    /// from Load, replay, Store or completion is not a handler disposition.
    pub async fn execute_outcome<Declaration, RequestBody, ResponseBody, F>(
        self,
        invoke: F,
    ) -> Result<crate::one_shot_tasks::WriterTaskReceipt, Status>
    where
        Declaration: DurableStateDeclaration + 'static,
        RequestBody: Message + Default + Send + 'static,
        ResponseBody: Message + Default + Clone + Send + 'static,
        F: for<'a> FnOnce(
            &'a mut Declaration::State,
            RequestBody,
        ) -> Pin<
            Box<
                dyn Future<Output = Result<ResponseBody, crate::one_shot_tasks::TaskHandlerError>>
                    + Send
                    + 'a,
            >,
        >,
    {
        let id = self
            .task
            .task_id
            .as_ref()
            .ok_or_else(|| Status::invalid_argument("missing task identity"))?;
        if id.state_type != Declaration::STATE_TYPE
            || self.method.rsplit('.').next() != Some(self.task.method.as_str())
        {
            return Err(Status::failed_precondition(
                "admitted task method/state identity mismatch",
            ));
        }
        self.tasks
            .validate_executor::<Declaration, RequestBody, ResponseBody>(
                self.task,
                self.method,
                self.response_type,
            )?;
        let request = RequestBody::decode(self.task.request.as_slice())
            .map_err(|_| Status::invalid_argument("malformed canonical writer task request"))?;
        let key = writer_task_key(id, self.method)?;
        let fingerprint = request_fingerprint(self.method, &request);
        if let Some(response) = self
            .store
            .replay_task_checkpoint::<ResponseBody>(
                &id.state_type,
                &id.state_ref,
                key,
                &fingerprint,
            )
            .await?
        {
            self.started
                .store(true, std::sync::atomic::Ordering::Release);
            return Ok(crate::one_shot_tasks::WriterTaskReceipt {
                task: self.task.clone(),
                outcome: crate::one_shot_tasks::WriterTaskOutcome::Terminal(
                    database::task::ResponseOrError::Response(prost_types::Any {
                        type_url: self.response_type.to_owned(),
                        value: response.encode_to_vec(),
                    }),
                ),
            });
        }
        let mut state = self
            .store
            .load_for_declaration::<Declaration>(&id.state_ref)
            .await?
            .ok_or_else(|| Status::failed_precondition("writer task requires existing actor"))?;
        let response = match invoke(&mut state, request).await {
            Ok(response) => response,
            Err(error) => {
                // No durable operation has started; this private state is discarded.
                let outcome = match error {
                    crate::one_shot_tasks::TaskHandlerError::Declared(error) => {
                        self.tasks.validate_declared(self.task, &error)?;
                        self.started
                            .store(true, std::sync::atomic::Ordering::Release);
                        crate::one_shot_tasks::WriterTaskOutcome::Terminal(
                            database::task::ResponseOrError::Error(error),
                        )
                    }
                    crate::one_shot_tasks::TaskHandlerError::Failed(error) => {
                        crate::one_shot_tasks::WriterTaskOutcome::PreStoreFailure(error)
                    }
                };
                return Ok(crate::one_shot_tasks::WriterTaskReceipt {
                    task: self.task.clone(),
                    outcome,
                });
            }
        };
        let mut operation = self.durable();
        self.store
            .store_type(
                &id.state_type,
                &id.state_ref,
                key,
                state,
                response.clone(),
                Some(fingerprint),
            )
            .await?;
        #[cfg(feature = "test-support")]
        if let Some(path) = std::env::var_os("REBOOT_TEST_WRITER_AFTER_STORE") {
            let path = std::path::PathBuf::from(path);
            std::fs::write(&path, b"actual writer Store ACK; task still Pending")
                .map_err(|e| Status::internal(e.to_string()))?;
            while !path.with_extension("release").exists() {
                tokio::time::sleep(std::time::Duration::from_millis(10)).await;
            }
            if std::env::var_os("REBOOT_TEST_WRITER_LOST_STORE_ACK").is_some() {
                return Err(Status::unavailable("lost actual writer Store ACK"));
            }
        }
        operation.acknowledged();
        Ok(crate::one_shot_tasks::WriterTaskReceipt {
            task: self.task.clone(),
            outcome: crate::one_shot_tasks::WriterTaskOutcome::Terminal(
                database::task::ResponseOrError::Response(prost_types::Any {
                    type_url: self.response_type.to_owned(),
                    value: response.encode_to_vec(),
                }),
            ),
        })
    }
}

fn decode_writer_task_checkpoint<Response: Message + Default>(
    mutation: &database::IdempotentMutation,
    state_type: &str,
    state_ref: &str,
    key: Uuid,
    fingerprint: &[u8],
) -> Result<Response, Status> {
    if mutation.state_type != state_type
        || mutation.state_ref != state_ref
        || mutation.key != key.as_bytes()
        || mutation.workflow_id.is_some()
        || mutation.workflow_iteration.is_some()
        || mutation.request_fingerprint.as_deref() != Some(fingerprint)
        || fingerprint.is_empty()
        || !mutation.task_ids.is_empty()
    {
        return Err(Status::failed_precondition(
            "writer task checkpoint identity/fingerprint mismatch",
        ));
    }
    Response::decode(mutation.response.as_slice())
        .map_err(|_| Status::data_loss("malformed writer task checkpoint response"))
}

/// Source-faithful Python task-seeded alias. Does not normalize durable tokens.
pub fn writer_task_key(id: &database::TaskId, method_identity: &str) -> Result<Uuid, Status> {
    let uuid = Uuid::from_slice(&id.task_uuid)
        .map_err(|_| Status::invalid_argument("invalid task UUID"))?;
    if !crate::state_ref::StateRef::is_encoded(&id.state_ref) {
        return Err(Status::invalid_argument(
            "writer task requires canonical StateRef",
        ));
    }
    let reference = crate::state_ref::StateRef::from_maybe_readable(id.state_ref.clone())
        .map_err(|_| Status::invalid_argument("invalid writer StateRef"))?;
    if !reference.matches_state_type(&id.state_type) {
        return Err(Status::invalid_argument(
            "writer task StateRef type mismatch",
        ));
    }
    let actor_id = reference.id();
    crate::state_ref::StateRef::from_id(&id.state_type, &actor_id)
        .map_err(|_| Status::invalid_argument("invalid writer actor ID"))?;
    Ok(Uuid::new_v5(
        &uuid,
        format!("'{method_identity}'@{actor_id}: Task {uuid}").as_bytes(),
    ))
}

include!("workflow_store.rs");

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

    pub(crate) fn owns_actor_gate(
        &self,
        gate: &ActorGate,
        state_type: &str,
        state_ref: &str,
    ) -> bool {
        Arc::ptr_eq(&gate.inner, &self.actor_gate(state_type, state_ref).inner)
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
        decode_persisted_state(
            self.load_state_bytes(state_type, state_ref).await?,
            state_type,
        )
    }

    // Authorization consumes the immutable persisted wire snapshot before
    // admission or decoding can disclose actor existence/schema diagnostics.
    async fn load_state_bytes(
        &self,
        state_type: &str,
        state_ref: &str,
    ) -> Result<Option<Vec<u8>>, Status> {
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
        Ok(response
            .actors
            .into_iter()
            .next()
            .and_then(|actor| actor.state))
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

    async fn replay_task_checkpoint<Response: Message + Default>(
        &self,
        state_type: &str,
        state_ref: &str,
        key: Uuid,
        fingerprint: &[u8],
    ) -> Result<Option<Response>, Status> {
        let mut stream = self
            .database
            .clone()
            .recover_idempotent_mutations(database::RecoverIdempotentMutationsRequest {
                state_type: state_type.to_owned(),
                state_ref: state_ref.to_owned(),
                idempotency_key: Some(key.as_bytes().to_vec()),
                workflow_id: None,
                workflow_iteration: None,
            })
            .await?
            .into_inner();
        let mut result = None;
        while let Some(batch) = stream.message().await? {
            for mutation in batch.idempotent_mutations {
                if result.is_some() {
                    return Err(Status::failed_precondition(
                        "duplicate writer task checkpoint",
                    ));
                }
                result = Some(decode_writer_task_checkpoint::<Response>(
                    &mutation,
                    state_type,
                    state_ref,
                    key,
                    fingerprint,
                )?);
            }
        }
        Ok(result)
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
        let commit_attempt = self.actor_gate(state_type, state_ref).commit_attempt();
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
        commit_attempt.acknowledged();
        Ok(())
    }

    /// Host-only canonical builtin constructor, invoked by generated SortedMap.
    /// Schema creation precedes native unique CreateActor; neither path can
    /// write nonempty map state or choose arbitrary colocated columns.
    pub(crate) async fn create_empty_sorted_map(
        &self,
        state_ref: &str,
        key: Uuid,
    ) -> Result<(), Status> {
        const MAP: &str = "rbt.std.collections.v1.SortedMap";
        const ENTRY: &str = "rbt.std.collections.v1.SortedMapEntry";
        check_idempotency_key_not_expired(key)?;
        let lock = self.lock_for_type(MAP, state_ref);
        let _guard = lock.exclusive().await;
        let fingerprint = request_fingerprint(
            "rbt.std.collections.v1.SortedMap.Create",
            &crate::sorted_map_proto::SortedMap {},
        );
        if self
            .replay_type::<crate::sorted_map_proto::SortedMap>(
                MAP,
                state_ref,
                key,
                Some(&fingerprint),
            )
            .await?
            .is_some()
        {
            return Ok(());
        }
        if self
            .load_type::<crate::sorted_map_proto::SortedMap>(MAP, state_ref)
            .await?
            .is_some()
        {
            return Err(Status::failed_precondition(
                "SortedMap has already been constructed",
            ));
        }
        let commit_attempt = self.actor_gate(MAP, state_ref).commit_attempt();
        let mut database = self.database.clone();
        database
            .store(database::StoreRequest {
                actor_upserts: vec![],
                task_upserts: vec![],
                colocated_upserts: vec![],
                transaction: None,
                idempotent_mutation: None,
                ensure_state_types_created: vec![ENTRY.to_owned()],
                sync: true,
            })
            .await
            .map_err(database_status)?;
        database
            .create_actor(database::CreateActorRequest {
                actor: Some(database::Actor {
                    state_type: MAP.to_owned(),
                    state_ref: state_ref.to_owned(),
                    state: Some(vec![]),
                }),
                idempotent_mutation: Some(database::IdempotentMutation {
                    state_type: MAP.to_owned(),
                    state_ref: state_ref.to_owned(),
                    key: key.as_bytes().to_vec(),
                    response: vec![],
                    task_ids: vec![],
                    workflow_id: None,
                    workflow_iteration: None,
                    request_fingerprint: Some(fingerprint),
                }),
                sync: true,
            })
            .await
            .map_err(database_status)?;
        commit_attempt.acknowledged();
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
    /// authentication and authorization. Current state authorization precedes
    /// receipt replay, handler execution and persistence under the same gate.
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
        // Replayed receipts are data disclosure too. Evaluate current policy
        // against a freshly loaded immutable state while holding the same gate.
        // Unauthenticated compatibility calls retain their historical replay path.
        let authorized_state =
            if let (Some(policy), Some((context, auth))) = (authorization, verified.as_ref()) {
                let state_bytes = self.load_state_bytes(state_type, &state_ref).await?;
                let default_bytes = State::default().encode_to_vec();
                policy
                    .authorize(
                        context,
                        auth.as_ref(),
                        Some(state_bytes.as_deref().unwrap_or(&default_bytes)),
                        &request.get_ref().encode_to_vec(),
                    )
                    .await?;
                Some(admit_state(
                    decode_persisted_state::<State>(state_bytes, state_type)?,
                    admission,
                )?)
            } else {
                None
            };
        if let Some(response) = self
            .replay_type(state_type, &state_ref, key, Some(&fingerprint))
            .await?
        {
            return Ok(Response::new(response));
        }
        let mut state: State = match authorized_state {
            Some(state) => state,
            None => admit_state(self.load_type(state_type, &state_ref).await?, admission)?,
        };
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
        let commit_attempt = self
            .actor_gate(Declaration::STATE_TYPE, &state_ref)
            .commit_attempt();
        database
            .create_actor(database::CreateActorRequest {
                actor: Some(database::Actor {
                    state_type: Declaration::STATE_TYPE.to_owned(),
                    state_ref: state_ref.clone(),
                    state: Some(state.encode_to_vec()),
                }),
                idempotent_mutation: Some(database::IdempotentMutation {
                    state_type: Declaration::STATE_TYPE.to_owned(),
                    state_ref: state_ref.clone(),
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
        commit_attempt.acknowledged();
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
        let state_bytes = self
            .load_state_bytes(Declaration::STATE_TYPE, &state_ref)
            .await?;
        authorization
            .authorize(
                &context,
                auth.as_ref(),
                state_bytes.as_deref(),
                &request.get_ref().encode_to_vec(),
            )
            .await?;
        if let Some(response) = self
            .replay_type(Declaration::STATE_TYPE, &state_ref, key, Some(&fingerprint))
            .await?
        {
            return Ok(Response::new(response));
        }
        if state_bytes.is_some() {
            return Err(Status::failed_precondition(
                "actor state has already been constructed",
            ));
        }
        let mut state = Declaration::State::default();
        let response = invoke(&mut state, request.into_inner()).await?;
        let mut database = self.database.clone();
        let commit_attempt = self
            .actor_gate(Declaration::STATE_TYPE, &state_ref)
            .commit_attempt();
        database
            .create_actor(database::CreateActorRequest {
                actor: Some(database::Actor {
                    state_type: Declaration::STATE_TYPE.to_owned(),
                    state_ref: state_ref.clone(),
                    state: Some(state.encode_to_vec()),
                }),
                idempotent_mutation: Some(database::IdempotentMutation {
                    state_type: Declaration::STATE_TYPE.to_owned(),
                    state_ref: state_ref.clone(),
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
        commit_attempt.acknowledged();
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
        crate::reactive::check_reader_scope(&request)?;
        let (context, auth) = authorization
            .verify(
                crate::RebootHeaders::from_request(&request)
                    .map_err(|error| Status::invalid_argument(error.to_string()))?,
                Declaration::STATE_TYPE,
                method_identity,
            )
            .await?;
        crate::reactive::check_reader_scope(&request)?;
        let state_ref = required_metadata(&request, STATE_REF_HEADER)?;
        // Composed callbacks receive an owned immutable snapshot, not a lease.
        // Hold shared admission through Load+authorization, then release before
        // any dependency call so FIFO writers cannot form cross-actor cycles.
        let snapshot_lease = if request
            .extensions()
            .get::<crate::reactive::SnapshotReader>()
            .is_some()
        {
            Some(
                self.actor_gate(Declaration::STATE_TYPE, &state_ref)
                    .shared()
                    .await,
            )
        } else {
            None
        };
        let state_bytes = self
            .load_state_bytes(Declaration::STATE_TYPE, &state_ref)
            .await?;
        let default_bytes = Declaration::State::default().encode_to_vec();
        crate::reactive::check_reader_scope(&request)?;
        authorization
            .authorize(
                &context,
                auth.as_ref(),
                Some(state_bytes.as_deref().unwrap_or(&default_bytes)),
                &request.get_ref().encode_to_vec(),
            )
            .await?;
        crate::reactive::check_reader_scope(&request)?;
        let state = admit_state(
            decode_persisted_state::<Declaration::State>(state_bytes, Declaration::STATE_TYPE)?,
            admission,
        )?;
        let scope = request
            .extensions()
            .get::<crate::reactive::ReaderScope>()
            .cloned();
        drop(snapshot_lease);
        let response = invoke(&state, request.into_inner()).await?;
        if let Some(scope) = scope {
            scope.check()?;
        }
        Ok(Response::new(response))
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
    #[cfg(test)]
    type TaskRpcPark = Arc<
        Mutex<
            Option<(
                tokio::sync::oneshot::Sender<()>,
                tokio::sync::oneshot::Receiver<()>,
            )>,
        >,
    >;

    /// Minimal durable fake exposed through the generated Database Tonic server.
    /// It implements only the storage semantics this runtime needs, while every
    /// unused generated RPC remains deliberately well-formed and inert.
    #[derive(Clone, Default)]
    pub struct FakeDatabase {
        state: Arc<Mutex<FakeDatabaseState>>,
        #[cfg(test)]
        task_load_park: TaskRpcPark,
        #[cfg(test)]
        task_recover_park: TaskRpcPark,
    }

    #[derive(Default)]
    struct FakeDatabaseState {
        actors: HashMap<(String, String), Vec<u8>>,
        mutations: HashMap<(String, String, Vec<u8>), database::IdempotentMutation>,
        store_requests: Vec<database::StoreRequest>,
        create_requests: Vec<database::CreateActorRequest>,
    }

    impl FakeDatabase {
        #[cfg(test)]
        pub(crate) fn seed_actor(&self, state_type: &str, state_ref: &str, bytes: Vec<u8>) {
            self.state
                .lock()
                .unwrap()
                .actors
                .insert((state_type.into(), state_ref.into()), bytes);
        }
        #[cfg(test)]
        pub(crate) fn park_task_load(
            &self,
        ) -> (
            tokio::sync::oneshot::Receiver<()>,
            tokio::sync::oneshot::Sender<()>,
        ) {
            let (entered_tx, entered_rx) = tokio::sync::oneshot::channel();
            let (release_tx, release_rx) = tokio::sync::oneshot::channel();
            *self.task_load_park.lock().unwrap() = Some((entered_tx, release_rx));
            (entered_rx, release_tx)
        }
        #[cfg(test)]
        pub(crate) fn park_task_recover(
            &self,
        ) -> (
            tokio::sync::oneshot::Receiver<()>,
            tokio::sync::oneshot::Sender<()>,
        ) {
            let (entered_tx, entered_rx) = tokio::sync::oneshot::channel();
            let (release_tx, release_rx) = tokio::sync::oneshot::channel();
            *self.task_recover_park.lock().unwrap() = Some((entered_tx, release_rx));
            (entered_rx, release_tx)
        }
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
            #[cfg(test)]
            if !request.get_ref().task_ids.is_empty() {
                let park = self.task_load_park.lock().unwrap().take();
                if let Some((entered, release)) = park {
                    let _ = entered.send(());
                    let _ = release.await;
                }
            }
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
            #[cfg(test)]
            {
                let park = self.task_recover_park.lock().unwrap().take();
                if let Some((entered, release)) = park {
                    let _ = entered.send(());
                    let _ = release.await;
                }
            }
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
#[path = "runtime_owned_unary_tests.rs"]
mod owned_unary_tests;

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
        let mut active = context.begin_generated_outbound().unwrap();
        assert!(context.seal_explicit_abort().is_err());
        active.completed = true; // Test-only terminal state setup; no public certification API.
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
    fn mixed_ordinary_and_direct_maps_share_aggregate_bound_before_native_io() {
        let root = RootTransactionContext::start(
            RebootHeaders::new("actor/1"),
            "example.Actor",
            TransactionMode::Exclusive,
            Uuid::new_v4(),
            prost_types::Timestamp::default(),
        )
        .unwrap();
        let context = root.transaction();
        for i in 0..1023 {
            let state_ref =
                crate::state_ref::StateRef::from_id("example.Actor", &format!("ordinary-{i}"))
                    .unwrap()
                    .to_string();
            // Match Tonic's merged successful trailer transport representation;
            // stage_successful_participants only installs a server extension.
            let wire = serde_json::json!({ "example.Actor": [state_ref] }).to_string();
            let mut metadata = tonic::metadata::MetadataMap::new();
            metadata.insert(
                crate::successful_trailers::TRANSACTION_PARTICIPANTS_HEADER,
                wire.parse().unwrap(),
            );
            let returned =
                crate::successful_trailers::ReturnedParticipants::from_metadata(&metadata).unwrap();
            context.enlist_returned_participants(&returned);
        }
        let map = crate::durable_coordinator::ParticipantTarget {
            state_type: "rbt.std.collections.v1.SortedMap".to_owned(),
            state_ref: crate::state_ref::StateRef::from_id(
                "rbt.std.collections.v1.SortedMap",
                "at-limit",
            )
            .unwrap()
            .to_string(),
        };
        context.enlist_admitted_early_map(map.clone()).unwrap();
        context.enlist_admitted_early_map(map).unwrap(); // duplicate does not consume capacity
        assert_eq!(context.returned_participants_snapshot().len(), 1024);
        let excess = crate::durable_coordinator::ParticipantTarget {
            state_type: "rbt.std.collections.v1.SortedMap".to_owned(),
            state_ref: crate::state_ref::StateRef::from_id(
                "rbt.std.collections.v1.SortedMap",
                "excess",
            )
            .unwrap()
            .to_string(),
        };
        assert_eq!(
            context
                .enlist_admitted_early_map(excess.clone())
                .unwrap_err()
                .code(),
            tonic::Code::ResourceExhausted
        );
        assert_eq!(
            context.doomed_status().unwrap().code(),
            tonic::Code::ResourceExhausted
        );
        let retained = context.returned_participants_snapshot();
        assert_eq!(retained.len(), 1024);
        assert!(
            retained
                .iter()
                .all(|participant| participant.target != excess)
        );
        assert_eq!(
            context.seal_explicit_abort().unwrap().len(),
            1024,
            "known prior ownership must remain abortable"
        );
    }

    #[test]
    fn public_internal_headers_and_manual_root_do_not_grant_builtin_map_authority() {
        let mut headers = RebootHeaders::new("actor/1");
        headers.internal_call = true;
        let root = RootTransactionContext::start(
            headers,
            "example.Actor",
            TransactionMode::Exclusive,
            Uuid::new_v4(),
            prost_types::Timestamp::default(),
        )
        .unwrap();
        assert!(
            root.transaction()
                .validate_builtin_map_admission("http://native")
                .is_err()
        );
        let mut context = root.transaction().clone();
        let active = Arc::new(std::sync::atomic::AtomicBool::new(true));
        let inactive_owner = crate::explicit_abort::ExplicitAbortOwner::new(1).unwrap();
        context.install_builtin_map_admission("http://native", active.clone(), inactive_owner);
        assert!(
            context
                .validate_builtin_map_admission("http://native")
                .is_err(),
            "unregistered host flag is not active root authority"
        );
        assert!(
            context
                .validate_builtin_map_admission("http://other")
                .is_err()
        );
        active.store(false, std::sync::atomic::Ordering::Release);
        assert!(
            context
                .validate_builtin_map_admission("http://native")
                .is_err()
        );
    }

    fn map_work_context() -> TransactionContext {
        RootTransactionContext::start(
            RebootHeaders::new("actor/1"),
            "example.Actor",
            TransactionMode::Exclusive,
            Uuid::new_v4(),
            prost_types::Timestamp::default(),
        )
        .unwrap()
        .transaction()
        .clone()
    }
    #[test]
    fn builtin_map_active_work_blocks_commit_and_abort_seals() {
        let context = map_work_context();
        let operation = context.reserve_builtin_map_operation().unwrap();
        assert!(context.seal_explicit_abort().is_err());
        assert!(context.reserve_builtin_map_operation().is_err());
        drop(operation);
        assert!(context.doomed_status().is_some());
        assert!(
            context
                .returned_participants
                .as_ref()
                .unwrap()
                .lock()
                .unwrap()
                .membership_uncertain
        );
        assert!(context.seal_explicit_abort().is_err());
    }
    #[test]
    fn builtin_map_failed_work_retains_uncertainty_with_original_doom() {
        let context = map_work_context();
        let operation = context.reserve_builtin_map_operation().unwrap();
        context.doom(Status::invalid_argument("original map failure"));
        drop(operation);
        assert_eq!(
            context.doomed_status().unwrap().message(),
            "original map failure"
        );
        let state = context
            .returned_participants
            .as_ref()
            .unwrap()
            .lock()
            .unwrap();
        assert_eq!(state.active, 0);
        assert!(state.membership_uncertain);
        drop(state);
        assert!(context.seal_explicit_abort().is_err());
    }
    #[test]
    fn builtin_map_returned_work_allows_serial_reuse_without_dispatch_authority() {
        let context = map_work_context();
        for _ in 0..3 {
            let mut operation = context.reserve_builtin_map_operation().unwrap();
            operation.settle_ledger().unwrap();
            drop(operation);
        }
        assert!(context.doomed_status().is_none());
        let state = context
            .returned_participants
            .as_ref()
            .unwrap()
            .lock()
            .unwrap();
        assert_eq!(state.active, 0);
        assert!(!state.dispatched && !state.membership_uncertain);
        drop(state);
        assert!(context.seal_explicit_abort().is_ok());
        assert!(context.reserve_builtin_map_operation().is_err());
    }
    #[test]
    fn builtin_map_abandonment_cannot_acknowledge_live_work_or_forget_known_membership() {
        let context = map_work_context();
        let mut operation = context.reserve_builtin_map_operation().unwrap();
        let target = crate::durable_coordinator::ParticipantTarget {
            state_type: "rbt.std.collections.v1.SortedMap".into(),
            state_ref: "map/known".into(),
        };
        context
            .returned_participants
            .as_ref()
            .unwrap()
            .lock()
            .unwrap()
            .participants
            .insert(target.clone(), false);
        assert_eq!(context.close_for_abandonment().unwrap()[0].target, target);
        assert!(operation.settle_ledger().is_err());
        drop(operation);
        let state = context
            .returned_participants
            .as_ref()
            .unwrap()
            .lock()
            .unwrap();
        assert_eq!(state.active, 0);
        assert!(state.membership_uncertain && state.participants.contains_key(&target));
        assert!(context.doomed_status().is_some());
    }
    #[test]
    fn unfinished_outbound_drop_retains_membership_uncertainty() {
        let root = RootTransactionContext::start(
            RebootHeaders::new("actor/1"),
            "example.Actor",
            TransactionMode::Exclusive,
            Uuid::new_v4(),
            prost_types::Timestamp::default(),
        )
        .unwrap();
        let context = root.transaction();
        drop(context.begin_generated_outbound().unwrap());
        assert_eq!(
            context
                .returned_participants
                .as_ref()
                .unwrap()
                .lock()
                .unwrap()
                .active,
            0
        );
        assert!(context.seal_explicit_abort().is_err());
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
            let mut outbound = worker.join().unwrap();
            assert_ne!(
                sealed.is_ok(),
                outbound.is_ok(),
                "seal and active outbound must never both win"
            );
            if let Ok(scope) = &mut outbound {
                scope.completed = true; // Test-only terminal state setup; no public certification API.
            }
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
    fn descendant_error_admission_requires_exact_initialized_inbound_provenance() {
        let root = Uuid::new_v4();
        let branch_id = Uuid::new_v4();
        let tip_id = Uuid::new_v4();
        let mut headers = RebootHeaders::new("B");
        headers.transaction_ids = Some(vec![root, branch_id]);
        headers.transaction_coordinator_state_type = Some("example.Actor".into());
        headers.transaction_coordinator_state_ref = Some("A".into());
        headers.coordinator_read_only_aware = true;
        let metadata = crate::successful_trailers::ParticipantMetadata::classified_single(
            "example.Actor",
            "C",
            true,
            true,
        )
        .unwrap();
        let mut status = Status::unknown("declared");
        metadata.attach_to_status(&mut status);
        let mut branch =
            TransactionContext::from_headers(headers.clone(), TransactionMode::Exclusive).unwrap();
        assert!(
            branch
                .enlist_rolled_back_leaf(None, status.metadata(), "example.Actor", "C")
                .is_err()
        );
        branch.enable_supervised_tree().unwrap();
        let mut scope = branch.begin_generated_outbound().unwrap();
        assert!(
            branch
                .enlist_rolled_back_leaf(None, status.metadata(), "example.Actor", "C")
                .is_err(),
            "opt-in without actual inbound provenance must fail"
        );
        branch.mark_supervised_inbound();
        assert!(
            branch
                .enlist_rolled_back_leaf(None, status.metadata(), "wrong.Type", "C")
                .is_err()
        );
        assert!(
            branch
                .enlist_rolled_back_leaf(None, status.metadata(), "example.Actor", "wrong-ref")
                .is_err()
        );
        branch
            .enlist_rolled_back_leaf(None, status.metadata(), "example.Actor", "C")
            .unwrap();
        scope.completed = true; // Test-only terminal state setup; no public certification API.
        drop(scope);
        assert!(!branch.is_fresh_root());
        assert_eq!(branch.returned_participants_snapshot().len(), 1);
        assert!(
            branch.begin_generated_outbound().is_err(),
            "siblings/retries stay forbidden"
        );
        assert!(
            branch.validate_rollback_leaf_branch().is_err(),
            "B cannot roll back its caught C subtree"
        );
        let mut derived = branch.with_nested_transaction_id(tip_id).unwrap();
        assert!(
            !derived.supports_rollback_leaf_path(),
            "derived clone is not admitted C"
        );
        derived.enable_supervised_tree().unwrap();
        assert!(
            !derived.supports_rollback_leaf_path(),
            "enabling cannot forge C provenance"
        );
        let mut tip_headers = headers.clone();
        tip_headers.state_ref = "C".into();
        tip_headers.transaction_ids.as_mut().unwrap().push(tip_id);
        let mut tip =
            TransactionContext::from_headers(tip_headers, TransactionMode::Exclusive).unwrap();
        tip.enable_supervised_tree().unwrap();
        tip.mark_supervised_inbound();
        tip.validate_rollback_leaf_branch().unwrap();
        assert!(!tip.is_fresh_root());
        for coordinate in 0..4 {
            let mut changed = tip.clone();
            match coordinate {
                0 => changed.headers.transaction_ids.as_mut().unwrap()[0] = Uuid::new_v4(),
                1 => changed.headers.transaction_ids.as_mut().unwrap()[1] = Uuid::new_v4(),
                2 => changed.headers.transaction_coordinator_state_ref = Some("B".into()),
                _ => changed.headers.state_ref = "wrong-C".into(),
            }
            assert!(!changed.supports_rollback_leaf_path());
            assert!(changed.validate_rollback_leaf_branch().is_err());
        }
        tip.doom(Status::unavailable("uncertain"));
        assert!(tip.validate_rollback_leaf_branch().is_err());
        let reconstructed =
            TransactionContext::from_headers(headers, TransactionMode::Exclusive).unwrap();
        assert!(
            reconstructed
                .enlist_rolled_back_leaf(None, status.metadata(), "example.Actor", "C")
                .is_err()
        );
    }

    #[tokio::test]
    async fn sequential_star_scopes_bind_method_target_full_context_and_serialize() {
        #[derive(Default)]
        struct Resolver(std::sync::atomic::AtomicUsize);
        #[tonic::async_trait]
        impl TransactionalChannelResolver for Resolver {
            async fn resolve(&self, _: &str, _: &str) -> Result<tonic::transport::Channel, Status> {
                self.0.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
                Ok(tonic::transport::Endpoint::from_static("http://127.0.0.1:1").connect_lazy())
            }
        }
        let mut headers = RebootHeaders::new("A");
        headers.transaction_ids = Some(vec![Uuid::new_v4()]);
        headers.transaction_coordinator_state_type = Some("example.Actor".into());
        headers.transaction_coordinator_state_ref = Some("A".into());
        let mut root =
            TransactionContext::from_headers(headers, TransactionMode::Exclusive).unwrap();
        root.enable_supervised_tree().unwrap();
        root.install_actor_authority(
            crate::durable_coordinator::ParticipantTarget {
                state_type: "example.Actor".into(),
                state_ref: "A".into(),
            },
            true,
        )
        .unwrap();
        let resolver = Resolver::default();
        assert!(
            root.begin_generated_outbound_for("example.Actor", "A", "/example.Service/Write")
                .is_err()
        );
        let mut scope = root
            .begin_generated_outbound_for("example.Actor", "B", "/example.Service/Write")
            .unwrap();
        assert!(
            root.clone()
                .begin_generated_outbound_for("example.Actor", "C", "/example.Service/Write")
                .is_err(),
            "no overlapping sibling"
        );
        let foreign = root.with_nested_transaction_id(Uuid::new_v4()).unwrap();
        assert!(
            scoped_generated_transactional_outbound_request(
                &resolver,
                &foreign,
                &scope,
                "example.Actor",
                "B",
                "/example.Service/Write",
                proto::Empty {}
            )
            .await
            .is_err()
        );
        for coordinate in 0..5 {
            let mut changed = root.clone();
            match coordinate {
                0 => changed.headers.transaction_coordinator_state_type = Some("wrong.Type".into()),
                1 => changed.headers.transaction_coordinator_state_ref = Some("wrong-ref".into()),
                2 => changed.headers.transaction_ids.as_mut().unwrap()[0] = Uuid::new_v4(),
                3 => changed.mode = TransactionMode::Shared,
                _ => changed.admitted_actor.as_mut().unwrap().state_type = "wrong.Local".into(),
            }
            assert!(
                scoped_generated_transactional_outbound_request(
                    &resolver,
                    &changed,
                    &scope,
                    "example.Actor",
                    "B",
                    "/example.Service/Write",
                    proto::Empty {}
                )
                .await
                .is_err()
            );
        }
        assert!(
            scoped_generated_transactional_outbound_request(
                &resolver,
                &root,
                &scope,
                "example.Actor",
                "C",
                "/example.Service/Write",
                proto::Empty {}
            )
            .await
            .is_err()
        );
        assert!(
            scoped_generated_transactional_outbound_request(
                &resolver,
                &root,
                &scope,
                "example.Actor",
                "B",
                "/example.Service/Other",
                proto::Empty {}
            )
            .await
            .is_err()
        );
        assert_eq!(
            resolver.0.load(std::sync::atomic::Ordering::SeqCst),
            0,
            "denials must precede resolver"
        );
        scoped_generated_transactional_outbound_request(
            &resolver,
            &root,
            &scope,
            "example.Actor",
            "B",
            "/example.Service/Write",
            proto::Empty {},
        )
        .await
        .unwrap();
        assert!(
            scoped_generated_transactional_outbound_request(
                &resolver,
                &root,
                &scope,
                "example.Actor",
                "B",
                "/example.Service/Write",
                proto::Empty {}
            )
            .await
            .is_err()
        );
        let mut metadata = tonic::metadata::MetadataMap::new();
        assert!(
            crate::successful_trailers::ReturnedParticipants::from_metadata(&metadata).is_err(),
            "missing successful membership is not proof"
        );
        metadata.insert(
            crate::successful_trailers::TRANSACTION_PARTICIPANTS_HEADER,
            r#"{"example.Actor":["wrong-target"]}"#.parse().unwrap(),
        );
        assert!(
            root.enlist_generated_returned_participants(
                &mut scope,
                &crate::successful_trailers::ReturnedParticipants::from_metadata(&metadata)
                    .unwrap()
            )
            .is_err()
        );
        metadata.insert(
            crate::successful_trailers::TRANSACTION_PARTICIPANTS_HEADER,
            r#"{"example.Actor":["B"]}"#.parse().unwrap(),
        );
        root.enlist_generated_returned_participants(
            &mut scope,
            &crate::successful_trailers::ReturnedParticipants::from_metadata(&metadata).unwrap(),
        )
        .unwrap();
        scope.completed = true; // Test-only terminal state setup; no public certification API.
        drop(scope);
        assert!(
            root.begin_generated_outbound_for("example.Actor", "B", "/example.Service/Write")
                .is_err(),
            "confirmed repeat before resolver"
        );
        let second = root
            .begin_generated_outbound_for("different.Type", "A", "/example.Service/Write")
            .unwrap();
        // Unissued scopes must never become certain.
        drop(second);
        assert!(
            root.seal_explicit_abort().is_err(),
            "unissued C prevents B-only Commit"
        );
        root.close_branch();
        assert!(
            root.clone()
                .begin_generated_outbound_for("example.Actor", "C", "/example.Service/Write")
                .is_err(),
            "post-seal clone"
        );
        assert_eq!(resolver.0.load(std::sync::atomic::Ordering::SeqCst), 1);
    }

    #[test]
    fn sequential_star_leaf_and_uncertainty_gate_tasks_and_children() {
        let mut headers = RebootHeaders::new("B");
        headers.transaction_ids = Some(vec![Uuid::new_v4(), Uuid::new_v4()]);
        headers.transaction_coordinator_state_type = Some("example.Actor".into());
        headers.transaction_coordinator_state_ref = Some("A".into());
        let mut leaf =
            TransactionContext::from_headers(headers, TransactionMode::Exclusive).unwrap();
        leaf.enable_supervised_tree().unwrap();
        leaf.mark_supervised_inbound();
        leaf.install_actor_authority(
            crate::durable_coordinator::ParticipantTarget {
                state_type: "example.Actor".into(),
                state_ref: "B".into(),
            },
            true,
        )
        .unwrap();
        assert!(
            leaf.begin_generated_outbound_for("example.Actor", "C", "/example.Service/Write")
                .is_err()
        );
        assert!(
            leaf.with_nested_transaction_id(Uuid::new_v4())
                .unwrap()
                .begin_generated_outbound_for("example.Actor", "C", "/example.Service/Write")
                .is_err()
        );
        let mut root_headers = leaf.headers.clone();
        root_headers.state_ref = "A".into();
        root_headers.transaction_ids.as_mut().unwrap().truncate(1);
        let mut root =
            TransactionContext::from_headers(root_headers, TransactionMode::Exclusive).unwrap();
        root.enable_supervised_tree().unwrap();
        root.install_actor_authority(
            crate::durable_coordinator::ParticipantTarget {
                state_type: "example.Actor".into(),
                state_ref: "A".into(),
            },
            true,
        )
        .unwrap();
        drop(
            root.begin_generated_outbound_for("example.Actor", "B", "/example.Service/Write")
                .unwrap(),
        );
        assert!(
            root.begin_generated_outbound_for("example.Actor", "C", "/example.Service/Write")
                .is_err()
        );
        assert!(root.validate_open_task_branch().is_err());
    }

    #[tokio::test]
    async fn supervised_tree_branch_ledger_scoped_helper_and_identity_are_not_caller_flags() {
        #[derive(Default)]
        struct Resolver(std::sync::atomic::AtomicUsize);
        #[tonic::async_trait]
        impl TransactionalChannelResolver for Resolver {
            async fn resolve(&self, _: &str, _: &str) -> Result<tonic::transport::Channel, Status> {
                self.0.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
                Ok(tonic::transport::Endpoint::from_static("http://127.0.0.1:1").connect_lazy())
            }
        }
        let root = Uuid::new_v4();
        let child = Uuid::new_v4();
        let mut headers = RebootHeaders::new("branch");
        headers.transaction_ids = Some(vec![root, child]);
        headers.transaction_coordinator_state_type = Some("example.Actor".into());
        headers.transaction_coordinator_state_ref = Some("root".into());
        let mut context =
            TransactionContext::from_headers(headers.clone(), TransactionMode::Exclusive).unwrap();
        context.enable_supervised_tree().unwrap();
        assert!(
            !context.is_fresh_root(),
            "branch collection never grants coordinator authority"
        );
        let clone = context.clone();
        assert!(context.same_ownership_context(&clone));
        let reconstructed =
            TransactionContext::from_headers(headers, TransactionMode::Exclusive).unwrap();
        assert_eq!(context, reconstructed);
        assert!(
            !context.same_ownership_context(&reconstructed),
            "matching headers are not branch ownership"
        );
        let mut metadata = tonic::metadata::MetadataMap::new();
        metadata.insert(
            crate::successful_trailers::TRANSACTION_PARTICIPANTS_HEADER,
            r#"{"example.Actor":["tip"]}"#.parse().unwrap(),
        );
        context.enlist_returned_participants(
            &crate::successful_trailers::ReturnedParticipants::from_metadata(&metadata).unwrap(),
        );
        assert_eq!(clone.take_returned_participants().len(), 1);
        assert_eq!(
            context.returned_participants_snapshot().len(),
            1,
            "public drain cannot erase ownership ledger"
        );
        let nested = clone.with_nested_transaction_id(Uuid::new_v4()).unwrap();
        assert!(Arc::ptr_eq(
            context.returned_participants.as_ref().unwrap(),
            nested.returned_participants.as_ref().unwrap()
        ));
        assert!(clone.with_nested_transaction_id(child).is_err());
        let resolver = Resolver::default();
        assert_eq!(
            transactional_outbound_request(
                &resolver,
                &context,
                "example.Actor",
                "other",
                proto::Empty {}
            )
            .await
            .unwrap_err()
            .code(),
            tonic::Code::FailedPrecondition
        );
        assert_eq!(
            resolver.0.load(std::sync::atomic::Ordering::SeqCst),
            0,
            "manual helper must not resolve uncounted tree work"
        );
        let mut scope = context.begin_generated_outbound().unwrap();
        assert!(
            context.seal_explicit_abort().is_err(),
            "active scope forbids successful return"
        );
        let (_, request) = scoped_transactional_outbound_request(
            &resolver,
            &context,
            &scope,
            "example.Actor",
            "tip",
            proto::Empty {},
        )
        .await
        .unwrap();
        assert_eq!(request.metadata().get(STATE_REF_HEADER).unwrap(), "tip");
        scope.completed = true; // Test-only terminal state setup; no public certification API.
        drop(scope);
        assert_eq!(context.seal_explicit_abort().unwrap().len(), 1);
        assert!(
            clone.begin_generated_outbound().is_err(),
            "clones share sealed admission"
        );
        assert_eq!(
            transactional_outbound_request(
                &resolver,
                &clone,
                "example.Actor",
                "other",
                proto::Empty {}
            )
            .await
            .unwrap_err()
            .code(),
            tonic::Code::FailedPrecondition
        );
        assert_eq!(resolver.0.load(std::sync::atomic::Ordering::SeqCst), 1);
        assert_eq!(
            clone.take_returned_participants().len(),
            1,
            "seal does not discard ownership"
        );
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

#[cfg(test)]
mod writer_checkpoint_tests {
    use super::*;
    #[test]
    fn strict_checkpoint_rejects_every_noncanonical_field() {
        let key = Uuid::new_v4();
        let record = database::IdempotentMutation {
            state_type: "test.Counter".into(),
            state_ref: "actor".into(),
            key: key.as_bytes().to_vec(),
            request_fingerprint: Some(vec![1]),
            response: proto::Counter::default().encode_to_vec(),
            ..Default::default()
        };
        assert!(
            decode_writer_task_checkpoint::<proto::Counter>(
                &record,
                "test.Counter",
                "actor",
                key,
                &[1]
            )
            .is_ok()
        );
        for field in 0..10 {
            let mut invalid = record.clone();
            match field {
                0 => invalid.state_type = "other.Counter".into(),
                1 => invalid.state_ref = "other".into(),
                2 => invalid.key = Uuid::new_v4().as_bytes().to_vec(),
                3 => invalid.workflow_id = Some(vec![1]),
                4 => invalid.workflow_iteration = Some(1),
                5 => invalid.request_fingerprint = None,
                6 => invalid.request_fingerprint = Some(vec![]),
                7 => invalid.request_fingerprint = Some(vec![2]),
                8 => invalid.task_ids = vec![database::TaskId::default()],
                9 => invalid.response = vec![0xff],
                _ => unreachable!(),
            }
            let before = invalid.clone();
            let error = decode_writer_task_checkpoint::<proto::Counter>(
                &invalid,
                "test.Counter",
                "actor",
                key,
                &[1],
            )
            .unwrap_err();
            assert_eq!(
                error.code(),
                if field == 9 {
                    tonic::Code::DataLoss
                } else {
                    tonic::Code::FailedPrecondition
                }
            );
            assert_eq!(invalid, before);
        }
        assert_eq!(
            decode_writer_task_checkpoint::<proto::Counter>(
                &record,
                "test.Counter",
                "actor",
                key,
                &[]
            )
            .unwrap_err()
            .code(),
            tonic::Code::FailedPrecondition
        );
    }
}
