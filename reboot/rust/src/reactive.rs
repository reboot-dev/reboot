//! Rust-only local reactive readers. One trusted host owns all mutations to
//! the sidecar; optional bounded one-hop local dependencies, no distributed watch
//! or Python React wire.
//! Invalidations follow acknowledged durable commits, not polling. Streams are
//! pull-driven: no spawned subscriber children, one coalescing revision cursor,
//! and a fixed admission limit. Dropping a stream drops its in-flight reader.
#![allow(clippy::result_large_err)]
use crate::{
    application_host::{HostRecovery, RecoveryCancellation},
    runtime::{ActorGate, DatabaseActorStore},
};
use prost::Message;
use std::{
    future::Future,
    pin::Pin,
    sync::{Arc, Mutex},
    task::{Context, Poll},
};
use tonic::{Request, Status};
pub mod wire {
    tonic::include_proto!("reboot.rust.reactive.v1");
}

/// Generated bindings expose only unary immutable reader methods and rerun
/// the existing authentication/authorization envelope for every snapshot.
#[tonic::async_trait]
pub trait ReaderBinding: Send + Sync + 'static {
    fn validate_owner(&self, owner: &LocalReaderOwner) -> Result<(), Status>;
    /// Opaque adapter identity binds ordinary RPC routing to the registered
    /// handler and authorization policy; unsupported bindings cannot opt in.
    fn unary_binding_id(&self) -> Option<Arc<()>> {
        None
    }
    async fn read(&self, request: Request<wire::Query>) -> Result<Vec<u8>, Status>;
    /// Generated database readers can opt into bounded same-host composition.
    async fn read_with_context(
        &self,
        request: Request<wire::Query>,
        _context: LocalReaderContext,
    ) -> Result<Vec<u8>, Status> {
        let _ = request;
        Err(Status::unimplemented(
            "binding does not support composed snapshots",
        ))
    }
}
struct Inner {
    gate: ActorGate,
    state_ref: String,
    state_type: String,
    endpoint: String,
    lifecycle: Mutex<Option<RecoveryCancellation>>,
    slots: Arc<tokio::sync::Semaphore>,
}
/// Lifecycle owner for one exact actor. Install this as ApplicationHost recovery
/// before serving its generated reactive service. No owner means fail closed.
#[derive(Clone)]
pub struct LocalReaderOwner {
    inner: Arc<Inner>,
}
impl LocalReaderOwner {
    #[doc(hidden)]
    pub fn for_generated_actor(
        store: &DatabaseActorStore,
        state_type: &str,
        state_ref: &str,
    ) -> Result<Self, Status> {
        let parsed = crate::state_ref::StateRef::from_maybe_readable(state_ref)
            .map_err(|e| Status::invalid_argument(e.to_string()))?;
        if !parsed.matches_state_type(state_type) || parsed.as_str() != state_ref {
            return Err(Status::invalid_argument(
                "reactive actor state type mismatch",
            ));
        }
        Ok(Self {
            inner: Arc::new(Inner {
                gate: store.actor_gate(state_type, state_ref),
                state_ref: state_ref.to_owned(),
                state_type: state_type.to_owned(),
                endpoint: store.database_endpoint().to_owned(),
                lifecycle: Mutex::new(None),
                slots: Arc::new(tokio::sync::Semaphore::new(64)),
            }),
        })
    }
    #[doc(hidden)]
    pub fn validate_generated_store(
        &self,
        store: &DatabaseActorStore,
        state_type: &str,
    ) -> Result<(), Status> {
        if state_type != self.inner.state_type
            || !store.owns_actor_gate(&self.inner.gate, state_type, &self.inner.state_ref)
        {
            return Err(Status::failed_precondition(
                "reactive binding/owner actor store mismatch",
            ));
        }
        Ok(())
    }
    pub fn active_subscriptions(&self) -> usize {
        64 - self.inner.slots.available_permits()
    }
    fn lifecycle(&self) -> Result<RecoveryCancellation, Status> {
        self.inner
            .lifecycle
            .lock()
            .expect("reader lifecycle poisoned")
            .clone()
            .ok_or_else(|| {
                Status::failed_precondition("reactive reader requires serving host owner")
            })
    }
}
#[tonic::async_trait]
impl HostRecovery for LocalReaderOwner {
    async fn start(
        &self,
        _: &mut tokio::task::JoinSet<Result<(), Status>>,
        cancel: RecoveryCancellation,
    ) -> Result<(), Status> {
        let mut lifecycle = self
            .inner
            .lifecycle
            .lock()
            .expect("reader lifecycle poisoned");
        if lifecycle.is_some() {
            return Err(Status::failed_precondition(
                "reactive owner already started",
            ));
        }
        *lifecycle = Some(cancel);
        Ok(())
    }
}
pub struct LocalReaderService<B> {
    binding: Arc<B>,
    owner: LocalReaderOwner,
}
impl<B> Clone for LocalReaderService<B> {
    fn clone(&self) -> Self {
        Self {
            binding: self.binding.clone(),
            owner: self.owner.clone(),
        }
    }
}
impl<B: ReaderBinding> LocalReaderService<B> {
    pub fn new(binding: B, owner: LocalReaderOwner) -> Result<Self, Status> {
        binding.validate_owner(&owner)?;
        Ok(Self {
            binding: Arc::new(binding),
            owner,
        })
    }
}
/// An immutable-at-installation allowlist of at most 64 exact local actors.
/// Each entry keeps its generated binding, authorization, gate and stream scope.
/// Independent routing by default; opt-in database reader composition tracks
/// at most eight direct same-endpoint dependencies per evaluation.
#[derive(Clone)]
pub struct LocalReaderRegistry {
    entries: std::collections::BTreeMap<String, Arc<dyn RegisteredReader>>,
    slots: Arc<tokio::sync::Semaphore>,
    composition: bool,
}

#[tonic::async_trait]
trait RegisteredReader: Send + Sync {
    fn owner(&self) -> LocalReaderOwner;
    fn unary_binding_id(&self) -> Option<Arc<()>>;
    async fn read_registered(&self, request: Request<wire::Query>) -> Result<Vec<u8>, Status>;
    async fn subscribe_registered(
        &self,
        request: Request<wire::Query>,
        resolver: Option<Arc<ReaderEntries>>,
    ) -> Result<
        Pin<Box<dyn tokio_stream::Stream<Item = Result<wire::Snapshot, Status>> + Send>>,
        Status,
    >;
}
#[tonic::async_trait]
impl<B: ReaderBinding> RegisteredReader for LocalReaderService<B> {
    async fn read_registered(&self, request: Request<wire::Query>) -> Result<Vec<u8>, Status> {
        self.binding.read(request).await
    }
    fn owner(&self) -> LocalReaderOwner {
        self.owner.clone()
    }
    fn unary_binding_id(&self) -> Option<Arc<()>> {
        self.binding.unary_binding_id()
    }
    async fn subscribe_registered(
        &self,
        request: Request<wire::Query>,
        resolver: Option<Arc<ReaderEntries>>,
    ) -> Result<
        Pin<Box<dyn tokio_stream::Stream<Item = Result<wire::Snapshot, Status>> + Send>>,
        Status,
    > {
        Ok(Box::pin(
            self.subscribe_inner(request, resolver).await?.into_inner(),
        ))
    }
}
impl Default for LocalReaderRegistry {
    fn default() -> Self {
        Self::new()
    }
}
impl LocalReaderRegistry {
    pub fn new() -> Self {
        Self {
            entries: std::collections::BTreeMap::new(),
            slots: Arc::new(tokio::sync::Semaphore::new(64)),
            composition: false,
        }
    }
    /// Explicit host configuration only: client metadata cannot register actors.
    pub fn register<B: ReaderBinding>(
        &mut self,
        service: LocalReaderService<B>,
    ) -> Result<(), Status> {
        let key = service.owner.inner.state_ref.clone();
        if self.entries.contains_key(&key) {
            return Err(Status::already_exists(
                "local reactive actor already registered",
            ));
        }
        if self.entries.len() == 64 {
            return Err(Status::resource_exhausted(
                "local reactive registry capacity is 64 actors",
            ));
        }
        self.entries.insert(key, Arc::new(service));
        Ok(())
    }
    /// Enable one-hop reads of registered actors, with at most eight dependencies
    /// per evaluation. This is not an atomic cross-actor snapshot.
    pub fn with_reader_composition(mut self) -> Self {
        self.composition = true;
        self
    }
    /// Attach only to the same generated adapter/authorization version and
    /// exact Database endpoint used to register this type's root actors.
    #[doc(hidden)]
    pub fn validate_unary_binding<D: crate::runtime::DurableStateDeclaration>(
        &self,
        endpoint: &str,
        binding: &Arc<()>,
    ) -> Result<(), Status> {
        if !self.composition {
            return Err(Status::failed_precondition(
                "unary composition requires composed registry",
            ));
        }
        self.owners()?;
        let mut roots = 0;
        for entry in self.entries.values() {
            let owner = entry.owner();
            if owner.inner.endpoint != endpoint {
                return Err(Status::failed_precondition(
                    "unary registry Database endpoint mismatch",
                ));
            }
            if owner.inner.state_type == D::STATE_TYPE {
                roots += 1;
                if !entry
                    .unary_binding_id()
                    .is_some_and(|id| Arc::ptr_eq(&id, binding))
                {
                    return Err(Status::failed_precondition(
                        "unary registry handler/authorization binding mismatch",
                    ));
                }
            }
        }
        if roots == 0 {
            return Err(Status::failed_precondition(
                "unary registry has no roots for this state type",
            ));
        }
        Ok(())
    }
    #[doc(hidden)]
    pub fn validate_unary_metadata<Q>(&self, request: &Request<Q>) -> Result<(), Status> {
        if request
            .metadata()
            .get_all("x-reboot-state-ref")
            .iter()
            .count()
            != 1
        {
            return Err(Status::invalid_argument(
                "unary reader requires one unambiguous root identity",
            ));
        }
        reject_standalone_reader_authority(request)
    }
    #[doc(hidden)]
    pub fn validate_legacy_unary_roots(&self, roots: &[String]) -> Result<(), Status> {
        if roots.len() > 64 {
            return Err(Status::resource_exhausted(
                "legacy unary root allowlist exceeds 64",
            ));
        }
        let mut unique = std::collections::BTreeSet::new();
        for root in roots {
            if root.is_empty()
                || root.len() > 4096
                || !root.bytes().all(|c| (32..=126).contains(&c))
                || !unique.insert(root)
            {
                return Err(Status::invalid_argument(
                    "invalid or duplicate exact legacy unary root",
                ));
            }
            if self.entries.contains_key(root) {
                return Err(Status::failed_precondition(
                    "legacy unary root cannot shadow registered composition",
                ));
            }
        }
        Ok(())
    }
    /// A configured adapter requires an exact registered root. There is no
    /// fallback after routing, authorization, or evaluation failure.
    #[doc(hidden)]
    pub fn contains_unary_root<D: crate::runtime::DurableStateDeclaration, Q>(
        &self,
        request: &Request<Q>,
    ) -> Result<bool, Status> {
        self.validate_unary_metadata(request)?;
        let Some(reference) = request.metadata().get("x-reboot-state-ref") else {
            return Err(Status::failed_precondition(
                "unary reader actor is not registered",
            ));
        };
        let reference = reference
            .to_str()
            .map_err(|_| Status::invalid_argument("invalid state reference metadata"))?;
        let Some(entry) = self.entries.get(reference) else {
            return Err(Status::failed_precondition(
                "unary reader actor is not registered",
            ));
        };
        if entry.owner().inner.state_type != D::STATE_TYPE {
            return Err(Status::failed_precondition(
                "unary registry root state type mismatch",
            ));
        }
        Ok(true)
    }
    /// Evaluate one fresh snapshot through the same authorized, bounded cursor
    /// used for subscriptions. The cursor and all dependency scopes are dropped
    /// before returning; this creates no long-lived watcher or producer task.
    #[doc(hidden)]
    pub async fn evaluate_unary<Q: Message, R: Message + Default>(
        &self,
        request: Request<Q>,
        method: &'static str,
    ) -> Result<tonic::Response<R>, Status> {
        if !self.composition {
            return Err(Status::failed_precondition(
                "unary composition requires composed registry",
            ));
        }
        self.validate_unary_metadata(&request)?;
        let deadline = crate::durable_participant::prepare_request_deadline(&request)?;
        crate::RebootHeaders::from_request(&request)
            .map_err(|e| Status::invalid_argument(e.to_string()))?;
        if deadline.is_some_and(|at| tokio::time::Instant::now() >= at) {
            return Err(Status::deadline_exceeded("unary reader deadline expired"));
        }
        let evaluation = async {
            let query = request.map(|body| wire::Query {
                method: method.to_owned(),
                request: body.encode_to_vec(),
            });
            let mut stream = wire::local_readers_server::LocalReaders::subscribe(self, query)
                .await?
                .into_inner();
            let snapshot = std::future::poll_fn(|cx| {
                tokio_stream::Stream::poll_next(Pin::new(&mut stream), cx)
            })
            .await;
            drop(stream);
            let snapshot = snapshot
                .ok_or_else(|| Status::unavailable("unary reader ended before first snapshot"))??;
            let response = R::decode(snapshot.response.as_slice())
                .map_err(|_| Status::internal("malformed unary composed response"))?;
            Ok(tonic::Response::new(response))
        };
        let result = if let Some(at) = deadline {
            tokio::select! { biased; _ = tokio::time::sleep_until(at) => Err(Status::deadline_exceeded("unary reader deadline expired")), result = evaluation => result }
        } else {
            evaluation.await
        };
        if deadline.is_some_and(|at| tokio::time::Instant::now() >= at) {
            return Err(Status::deadline_exceeded("unary reader deadline expired"));
        }
        result.map_err(|mut status: Status| {
            if status.code() == tonic::Code::Unavailable {
                status.metadata_mut().insert(
                    "x-reboot-terminal-reader-evaluation",
                    "1".parse().expect("static marker"),
                );
            }
            status
        })
    }

    pub fn active_subscriptions(&self) -> usize {
        64 - self.slots.available_permits()
    }
    pub(crate) fn owners(&self) -> Result<Vec<LocalReaderOwner>, Status> {
        if self.entries.is_empty() {
            return Err(Status::failed_precondition(
                "local reactive registry is empty",
            ));
        }
        if self.composition {
            let endpoint = &self.entries.values().next().unwrap().owner().inner.endpoint;
            if self
                .entries
                .values()
                .any(|entry| entry.owner().inner.endpoint != *endpoint)
            {
                return Err(Status::failed_precondition(
                    "composed readers require one exact Database endpoint",
                ));
            }
        }
        Ok(self.entries.values().map(|entry| entry.owner()).collect())
    }
}
/// One routed stream owns both the actor admission and host-wide admission.
/// Dropping it cancels the in-flight read without background fan-out tasks.
pub struct RegisteredReaderStream {
    inner: Pin<Box<dyn tokio_stream::Stream<Item = Result<wire::Snapshot, Status>> + Send>>,
    permit: Option<tokio::sync::OwnedSemaphorePermit>,
}
impl tokio_stream::Stream for RegisteredReaderStream {
    type Item = Result<wire::Snapshot, Status>;
    fn poll_next(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Option<Self::Item>> {
        let result = self.inner.as_mut().poll_next(cx);
        if matches!(&result, Poll::Ready(None) | Poll::Ready(Some(Err(_)))) {
            self.permit.take();
        }
        result
    }
}
#[tonic::async_trait]
impl wire::local_readers_server::LocalReaders for LocalReaderRegistry {
    type SubscribeStream = RegisteredReaderStream;
    async fn subscribe(
        &self,
        request: Request<wire::Query>,
    ) -> Result<tonic::Response<Self::SubscribeStream>, Status> {
        crate::runtime::reject_ambiguous_metadata(&request, "x-reboot-state-ref")?;
        reject_standalone_reader_authority(&request)?;
        let reference = request
            .metadata()
            .get("x-reboot-state-ref")
            .and_then(|value| value.to_str().ok())
            .ok_or_else(|| Status::failed_precondition("local reactive actor is not registered"))?;
        let entry = self
            .entries
            .get(reference)
            .ok_or_else(|| Status::failed_precondition("local reactive actor is not registered"))?;
        let permit = self.slots.clone().try_acquire_owned().map_err(|_| {
            Status::resource_exhausted("local reactive host capacity is 64 subscriptions")
        })?;
        let resolver = self.composition.then(|| Arc::new(self.entries.clone()));
        let inner = entry.subscribe_registered(request, resolver).await?;
        Ok(tonic::Response::new(RegisteredReaderStream {
            inner,
            permit: Some(permit),
        }))
    }
}

/// Distinguishes a terminal evaluated reader failure from a disconnected
/// transport; this must not create an implicit fresh evaluation/retry.
#[doc(hidden)]
pub fn is_terminal_unary_evaluation(status: &Status) -> bool {
    status
        .metadata()
        .get("x-reboot-terminal-reader-evaluation")
        .is_some_and(|value| value == "1")
}

// Standalone local readers never enlist in a caller's mutation, workflow or
// task. Check raw presence before parsing: empty/malformed/repeated values are
// still an attempted authority envelope, not an absent optional field. Internal
// workflow wait/decision helpers retain their distinct checkpointed paths.
fn reject_standalone_reader_authority<Q>(request: &Request<Q>) -> Result<(), Status> {
    for key in [
        crate::TRANSACTION_IDS_HEADER,
        crate::TRANSACTION_COORDINATOR_STATE_TYPE_HEADER,
        crate::TRANSACTION_COORDINATOR_STATE_REF_HEADER,
        crate::TRANSACTION_RETRY_AGE_HEADER,
        crate::WORKFLOW_ID_HEADER,
        crate::WORKFLOW_ITERATION_HEADER,
        crate::IDEMPOTENCY_KEY_HEADER,
        crate::TASK_SCHEDULE_HEADER,
        "x-reboot-task-method",
        crate::TRANSACTION_COORDINATOR_READ_ONLY_AWARE_HEADER,
    ] {
        if request.metadata().contains_key(key) {
            return Err(Status::failed_precondition(
                "standalone reader cannot inherit mutation/workflow/task authority",
            ));
        }
    }
    Ok(())
}

type ReaderEntries = std::collections::BTreeMap<String, Arc<dyn RegisteredReader>>;
#[derive(Clone)]
struct ReadDependency {
    revision: tokio::sync::watch::Receiver<(u64, bool)>,
    scope: ReaderScope,
}
#[derive(Clone)]
#[doc(hidden)]
pub struct SnapshotReader;
/// Evaluation-scoped, one-hop local read capability. It cannot create actors,
/// forward transaction authority, or recursively invoke composed handlers.
#[derive(Default)]
struct EvaluationState {
    closed: bool,
    reads: usize,
    failure: Option<Status>,
}
struct Evaluation {
    state: Mutex<EvaluationState>,
    closed: tokio::sync::watch::Sender<bool>,
}
impl Evaluation {
    fn new() -> Arc<Self> {
        Arc::new(Self {
            state: Mutex::new(EvaluationState::default()),
            closed: tokio::sync::watch::channel(false).0,
        })
    }
    fn finish(&self) -> Result<(), Status> {
        let mut state = self.state.lock().expect("reader evaluation poisoned");
        state.closed = true;
        if state.reads != 0 && state.failure.is_none() {
            state.failure = Some(Status::failed_precondition(
                "composed evaluation has unfinished dependency reads",
            ));
        }
        self.closed.send_replace(true);
        state.failure.clone().map_or(Ok(()), Err)
    }
    async fn cancelled(&self) {
        let mut closed = self.closed.subscribe();
        if !*closed.borrow() {
            let _ = closed.changed().await;
        }
    }
}
struct EvaluationGuard(Arc<Evaluation>);
impl Drop for EvaluationGuard {
    fn drop(&mut self) {
        let _ = self.0.finish();
    }
}
struct DependencyReadGuard {
    evaluation: Arc<Evaluation>,
    active: bool,
}
impl DependencyReadGuard {
    fn admit(evaluation: Arc<Evaluation>) -> Result<Self, Status> {
        {
            let mut state = evaluation.state.lock().expect("reader evaluation poisoned");
            if state.closed {
                return Err(Status::failed_precondition("reader evaluation is closed"));
            }
            if let Some(failure) = &state.failure {
                return Err(failure.clone());
            }
            state.reads += 1;
        }
        Ok(Self {
            evaluation,
            active: true,
        })
    }
    fn complete<T>(mut self, mut result: Result<T, Status>) -> Result<T, Status> {
        let mut state = self
            .evaluation
            .state
            .lock()
            .expect("reader evaluation poisoned");
        if state.closed && result.is_ok() {
            result = Err(Status::failed_precondition("reader evaluation is closed"));
        }
        if let Err(status) = &result
            && state.failure.is_none()
        {
            state.failure = Some(status.clone());
        }
        state.reads -= 1;
        self.active = false;
        result
    }
}
impl Drop for DependencyReadGuard {
    fn drop(&mut self) {
        if self.active {
            let mut state = self
                .evaluation
                .state
                .lock()
                .expect("reader evaluation poisoned");
            if state.failure.is_none() {
                state.failure = Some(Status::failed_precondition("dependency read was cancelled"));
            }
            state.reads -= 1;
        }
    }
}
#[derive(Clone)]
pub struct LocalReaderContext {
    entries: Arc<ReaderEntries>,
    root: String,
    metadata: tonic::metadata::MetadataMap,
    scope: ReaderScope,
    trusted: Option<crate::application_host::TrustedApplicationContext>,
    dependencies: Arc<Mutex<std::collections::BTreeMap<String, ReadDependency>>>,
    evaluation: Arc<Evaluation>,
    dependency_changes: tokio::sync::watch::Sender<u64>,
}
impl LocalReaderContext {
    fn check(&self) -> Result<(), Status> {
        self.scope.check()?;
        let state = self
            .evaluation
            .state
            .lock()
            .expect("reader evaluation poisoned");
        if state.closed {
            return Err(Status::failed_precondition("reader evaluation is closed"));
        }
        state.failure.clone().map_or(Ok(()), Err)
    }
    async fn failed(&self) -> Status {
        let mut changes = self.dependency_changes.subscribe();
        loop {
            let dependencies = self
                .dependencies
                .lock()
                .expect("reader dependencies poisoned")
                .clone();
            tokio::select! { biased;
                _ = self.evaluation.cancelled() => return Status::failed_precondition("reader evaluation is closed"),
                status = dependency_failed(&dependencies) => return status,
                result = changes.changed() => if result.is_err() { return Status::unavailable("reader dependency owner closed"); },
            }
        }
    }
    /// Prefer generated typed helpers. Each call reauthorizes the target against
    /// its current immutable state, using the original external credentials.
    pub async fn read<Q: Message, R: Message + Default>(
        &self,
        state_ref: &str,
        state_type: &str,
        method: &str,
        body: Q,
    ) -> Result<R, Status> {
        let guard = DependencyReadGuard::admit(self.evaluation.clone())?;
        let result = self.read_inner(state_ref, state_type, method, body).await;
        guard.complete(result)
    }
    async fn read_inner<Q: Message, R: Message + Default>(
        &self,
        state_ref: &str,
        state_type: &str,
        method: &str,
        body: Q,
    ) -> Result<R, Status> {
        self.check()?;
        self.check()?;
        if state_ref == self.root {
            return Err(Status::failed_precondition(
                "composed reader cannot read its own root",
            ));
        }
        let entry = self
            .entries
            .get(state_ref)
            .ok_or_else(|| Status::failed_precondition("dependency actor is not registered"))?;
        let owner = entry.owner();
        if owner.inner.state_type != state_type {
            return Err(Status::failed_precondition(
                "typed dependency state type mismatch",
            ));
        }
        let scope = ReaderScope::new(owner.lifecycle()?);
        scope.check()?;
        let mut revision = owner.inner.gate.committed_revisions();
        if revision.borrow_and_update().1 {
            return Err(Status::unavailable("dependency commit outcome uncertain"));
        }
        {
            let mut dependencies = self
                .dependencies
                .lock()
                .expect("reader dependencies poisoned");
            if !dependencies.contains_key(state_ref) && dependencies.len() == 8 {
                return Err(Status::resource_exhausted(
                    "composed reader capacity is eight dependencies",
                ));
            }
            // Retain the first pre-read revision even for repeated reads. A racing
            // commit remains pending; never advance it after evaluating a target.
            dependencies
                .entry(state_ref.to_owned())
                .or_insert(ReadDependency {
                    revision: revision.clone(),
                    scope: scope.clone(),
                });
            self.dependency_changes
                .send_modify(|version| *version = version.wrapping_add(1));
        }
        let payload = body.encode_to_vec();
        if payload.len() > 65536 {
            return Err(Status::resource_exhausted(
                "dependency request exceeds 64KiB",
            ));
        }
        let mut request = Request::new(wire::Query {
            method: method.to_owned(),
            request: payload,
        });
        *request.metadata_mut() = self.metadata.clone();
        // Only substitute the exact admitted target; preserve original caller/token/deadline.
        request.metadata_mut().insert(
            "x-reboot-state-ref",
            state_ref
                .parse()
                .map_err(|_| Status::invalid_argument("invalid dependency actor reference"))?,
        );
        request.extensions_mut().insert(scope.clone());
        if let Some(trusted) = &self.trusted {
            request.extensions_mut().insert(trusted.clone());
        }
        let read = async {
            let _lease = owner.inner.gate.shared().await;
            self.check()?;
            scope.check()?;
            entry.read_registered(request).await
        };
        let used_dependencies = self
            .dependencies
            .lock()
            .expect("reader dependencies poisoned")
            .clone();
        let bytes = tokio::select! { biased;
            _ = self.evaluation.cancelled() => return Err(Status::failed_precondition("reader evaluation is closed")),
            status = dependency_failed(&used_dependencies) => return Err(status),
            _ = actor_uncertain(revision.clone()) => return Err(Status::unavailable("dependency commit outcome uncertain")),
            _ = self.scope.revoked() => return Err(Status::unavailable("root reader authority revoked")),
            _ = scope.revoked() => return Err(Status::unavailable("dependency reader authority revoked")),
            result = read => result?,
        };
        self.check()?;
        scope.check()?;
        if revision.borrow().1 {
            return Err(Status::unavailable("dependency commit outcome uncertain"));
        }
        if bytes.len() > 1048576 {
            return Err(Status::resource_exhausted(
                "dependency snapshot exceeds 1MiB",
            ));
        }
        R::decode(bytes.as_slice())
            .map_err(|_| Status::data_loss("invalid typed dependency snapshot"))
    }
}
async fn context_failed(context: &Option<LocalReaderContext>) -> Status {
    match context {
        Some(context) => context.failed().await,
        None => std::future::pending().await,
    }
}
async fn actor_uncertain(mut revision: tokio::sync::watch::Receiver<(u64, bool)>) {
    loop {
        if revision.borrow().1 {
            return;
        }
        if revision.changed().await.is_err() {
            return;
        }
    }
}
async fn dependency_failed(
    dependencies: &std::collections::BTreeMap<String, ReadDependency>,
) -> Status {
    let mut waits: Vec<Pin<Box<dyn Future<Output=Status> + Send>>> = dependencies.values().cloned().map(|d| Box::pin(async move {
        if let Err(status) = d.scope.check() { return status; }
        tokio::select! { biased;
            _ = d.scope.revoked() => Status::unavailable("dependency reader authority revoked"),
            _ = actor_uncertain(d.revision) => Status::unavailable("dependency commit outcome uncertain"),
        }
    }) as Pin<Box<dyn Future<Output=Status> + Send>>).collect();
    std::future::poll_fn(move |cx| {
        for wait in &mut waits {
            if let Poll::Ready(result) = wait.as_mut().poll(cx) {
                return Poll::Ready(result);
            }
        }
        Poll::Pending
    })
    .await
}
type DependencyWait = Pin<Box<dyn Future<Output = Result<(), Status>> + Send>>;
async fn dependency_changed(
    dependencies: &std::collections::BTreeMap<String, ReadDependency>,
) -> Result<(), Status> {
    let mut waits: Vec<DependencyWait> = dependencies.values().cloned().map(|mut d| Box::pin(async move {
        d.scope.check()?;
        if d.revision.borrow().1 { return Err(Status::unavailable("dependency commit outcome uncertain")); }
        tokio::select! { biased; _ = d.scope.revoked() => Err(Status::unavailable("dependency reader authority revoked")), result = d.revision.changed() => result.map_err(|_| Status::unavailable("dependency revision owner closed")) }
    }) as Pin<Box<dyn Future<Output=Result<(),Status>> + Send>>).collect();
    std::future::poll_fn(move |cx| {
        for wait in &mut waits {
            if let Poll::Ready(result) = wait.as_mut().poll(cx) {
                return Poll::Ready(result);
            }
        }
        Poll::Pending
    })
    .await
}

#[derive(Clone)]
pub(crate) struct ReaderScope {
    lifecycle: RecoveryCancellation,
    revocations: Option<tokio::sync::watch::Receiver<u64>>,
    epoch: u64,
}
impl ReaderScope {
    pub(crate) fn new(lifecycle: RecoveryCancellation) -> Self {
        let revocations = lifecycle.reader_revocations();
        let epoch = revocations.as_ref().map_or(0, |r| *r.borrow());
        Self {
            lifecycle,
            revocations,
            epoch,
        }
    }
    pub(crate) fn check(&self) -> Result<(), Status> {
        self.lifecycle.check_reader_admission()?;
        if self
            .revocations
            .as_ref()
            .is_some_and(|r| *r.borrow() != self.epoch)
        {
            return Err(Status::unavailable("reader placement authority revoked"));
        }
        Ok(())
    }
    pub(crate) async fn revoked(&self) {
        let mut revisions = self.revocations.clone();
        tokio::select! { _ = self.lifecycle.reader_revoked() => {}, _ = async { if let Some(r) = &mut revisions { if *r.borrow() == self.epoch { let _ = r.changed().await; } } else { std::future::pending::<()>().await; } } => {}, }
    }
}
pub(crate) fn check_reader_scope<T>(request: &Request<T>) -> Result<(), Status> {
    request
        .extensions()
        .get::<ReaderScope>()
        .map_or(Ok(()), ReaderScope::check)
}

struct Cursor<B> {
    binding: Arc<B>,
    owner: LocalReaderOwner,
    lifecycle: RecoveryCancellation,
    revision: tokio::sync::watch::Receiver<(u64, bool)>,
    metadata: tonic::metadata::MetadataMap,
    extensions: tonic::Extensions,
    scope: ReaderScope,
    query: wire::Query,
    previous: Option<Vec<u8>>,
    resolver: Option<Arc<ReaderEntries>>,
    dependencies: std::collections::BTreeMap<String, ReadDependency>,
    _permit: tokio::sync::OwnedSemaphorePermit,
}
impl<B: ReaderBinding> Cursor<B> {
    async fn next(mut self) -> (Option<Result<wire::Snapshot, Status>>, Self) {
        loop {
            if self.lifecycle.is_cancelled() {
                return (None, self);
            }
            if self.previous.is_some() {
                tokio::select! {
                    biased;
                    _ = self.lifecycle.cancelled() => return (None, self),
                _ = actor_uncertain(self.revision.clone()) => return (Some(Err(Status::unavailable("actor commit outcome uncertain"))), self),
                    _ = self.scope.revoked() => return (Some(Err(self.scope.check().err().unwrap_or_else(|| Status::unavailable("reader authority revoked")))), self),
                    changed = dependency_changed(&self.dependencies) => if let Err(status) = changed { return (Some(Err(status)), self); },
                    changed = self.revision.changed() => if changed.is_err() { return (None, self); },
                }
            }
            // Mark BEFORE Load, never after: a commit racing baseline evaluation
            // remains pending and forces a fresh snapshot. The shared lease is
            // scoped to the read, never to consumer/network backpressure.
            if self.revision.borrow_and_update().1 {
                return (
                    Some(Err(Status::unavailable(
                        "actor commit outcome uncertain; restart host before subscribing",
                    ))),
                    self,
                );
            }
            for dependency in self.dependencies.values() {
                if let Err(status) = dependency.scope.check() {
                    return (Some(Err(status)), self);
                }
                if dependency.revision.borrow().1 {
                    return (
                        Some(Err(Status::unavailable(
                            "dependency commit outcome uncertain",
                        ))),
                        self,
                    );
                }
            }
            let context = self.resolver.as_ref().map(|entries| LocalReaderContext {
                entries: entries.clone(),
                root: self.owner.inner.state_ref.clone(),
                metadata: self.metadata.clone(),
                scope: self.scope.clone(),
                trusted: self
                    .extensions
                    .get::<crate::application_host::TrustedApplicationContext>()
                    .cloned(),
                dependencies: Arc::new(Mutex::new(std::collections::BTreeMap::new())),
                evaluation: Evaluation::new(),
                dependency_changes: tokio::sync::watch::channel(0).0,
            });
            let _evaluation_guard = context
                .as_ref()
                .map(|c| EvaluationGuard(c.evaluation.clone()));
            let read = async {
                self.scope.check()?;
                let _lease = if context.is_none() {
                    Some(self.owner.inner.gate.shared().await)
                } else {
                    None
                };
                self.scope.check()?;
                let mut request = Request::new(self.query.clone());
                *request.metadata_mut() = self.metadata.clone();
                *request.extensions_mut() = self.extensions.clone();
                request.extensions_mut().insert(self.scope.clone());
                if let Some(context) = &context {
                    request.extensions_mut().insert(SnapshotReader);
                    self.binding
                        .read_with_context(request, context.clone())
                        .await
                } else {
                    self.binding.read(request).await
                }
            };
            let result = tokio::select! {
                biased;
                _ = actor_uncertain(self.revision.clone()) => return (Some(Err(Status::unavailable("actor commit outcome uncertain"))), self),
                status = context_failed(&context) => return (Some(Err(status)), self),
                _ = self.lifecycle.cancelled() => return (None, self),
                    _ = self.scope.revoked() => return (Some(Err(self.scope.check().err().unwrap_or_else(|| Status::unavailable("reader authority revoked")))), self),
                result = read => result,
            };
            if let Err(status) = self.scope.check() {
                return (Some(Err(status)), self);
            }
            if self.revision.borrow().1 {
                return (
                    Some(Err(Status::unavailable("actor commit outcome uncertain"))),
                    self,
                );
            }
            if let Some(context) = context {
                if let Err(failure) = context.evaluation.finish() {
                    return (Some(Err(failure)), self);
                }
                self.dependencies = context
                    .dependencies
                    .lock()
                    .expect("reader dependencies poisoned")
                    .clone();
                for dependency in self.dependencies.values() {
                    if let Err(status) = dependency.scope.check() {
                        return (Some(Err(status)), self);
                    }
                    if dependency.revision.borrow().1 {
                        return (
                            Some(Err(Status::unavailable(
                                "dependency commit outcome uncertain",
                            ))),
                            self,
                        );
                    }
                }
            }
            match result {
                Err(status) => return (Some(Err(status)), self),
                Ok(bytes) if bytes.len() > 1048576 => {
                    return (
                        Some(Err(Status::resource_exhausted(
                            "reactive snapshot exceeds 1MiB",
                        ))),
                        self,
                    );
                }
                Ok(bytes) if self.previous.as_ref() == Some(&bytes) => continue,
                Ok(bytes) => {
                    self.previous = Some(bytes.clone());
                    return (Some(Ok(wire::Snapshot { response: bytes })), self);
                }
            }
        }
    }
}
type NextFuture<B> =
    Pin<Box<dyn Future<Output = (Option<Result<wire::Snapshot, Status>>, Cursor<B>)> + Send>>;
/// Server stream; cancellation and transport drop destroy the cursor directly.
pub struct ReaderStream<B> {
    next: Option<NextFuture<B>>,
}
impl<B: ReaderBinding> tokio_stream::Stream for ReaderStream<B> {
    type Item = Result<wire::Snapshot, Status>;
    fn poll_next(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Option<Self::Item>> {
        let Some(next) = self.next.as_mut() else {
            return Poll::Ready(None);
        };
        match next.as_mut().poll(cx) {
            Poll::Pending => Poll::Pending,
            Poll::Ready((item, cursor)) => {
                self.next = if item.as_ref().is_some_and(Result::is_ok) {
                    Some(Box::pin(cursor.next()))
                } else {
                    None
                };
                Poll::Ready(item)
            }
        }
    }
}
impl<B: ReaderBinding> LocalReaderService<B> {
    async fn subscribe_inner(
        &self,
        request: Request<wire::Query>,
        resolver: Option<Arc<ReaderEntries>>,
    ) -> Result<tonic::Response<ReaderStream<B>>, Status> {
        crate::runtime::reject_ambiguous_metadata(&request, "x-reboot-state-ref")?;
        reject_standalone_reader_authority(&request)?;
        let state_ref = request
            .metadata()
            .get("x-reboot-state-ref")
            .and_then(|v| v.to_str().ok());
        if state_ref != Some(self.owner.inner.state_ref.as_str()) {
            return Err(Status::failed_precondition(
                "reactive reader actor identity mismatch",
            ));
        }
        if request.get_ref().request.len() > 65536 {
            return Err(Status::resource_exhausted("reactive request exceeds 64KiB"));
        }
        let lifecycle = self.owner.lifecycle()?;
        lifecycle.check_reader_admission()?;
        let permit = self
            .owner
            .inner
            .slots
            .clone()
            .try_acquire_owned()
            .map_err(|_| Status::resource_exhausted("reactive reader capacity is 64"))?;
        let cursor = Cursor {
            binding: self.binding.clone(),
            owner: self.owner.clone(),
            lifecycle: lifecycle.clone(),
            revision: self.owner.inner.gate.committed_revisions(),
            metadata: request.metadata().clone(),
            extensions: request.extensions().clone(),
            scope: ReaderScope::new(lifecycle.clone()),
            query: request.into_inner(),
            previous: None,
            resolver,
            dependencies: std::collections::BTreeMap::new(),
            _permit: permit,
        };
        Ok(tonic::Response::new(ReaderStream {
            next: Some(Box::pin(cursor.next())),
        }))
    }
}
#[tonic::async_trait]
impl<B: ReaderBinding> wire::local_readers_server::LocalReaders for LocalReaderService<B> {
    type SubscribeStream = ReaderStream<B>;
    async fn subscribe(
        &self,
        request: Request<wire::Query>,
    ) -> Result<tonic::Response<Self::SubscribeStream>, Status> {
        self.subscribe_inner(request, None).await
    }
}
/// One typed local observation stream with explicit, caller-driven reconnection.
/// Reconnection starts a fresh authenticated scope/baseline, not event replay.
/// There are no automatic retries; terminal errors disconnect the stream.
/// Dropping/cancelling reconnect drops its RPC; the old stream is dropped first.
pub struct TypedSubscription<T, E> {
    stream: Option<tonic::Streaming<wire::Snapshot>>,
    channel: tonic::transport::Channel,
    query: wire::Query,
    metadata: tonic::metadata::MetadataMap,
    deadline: Option<tokio::time::Instant>,
    decode_error: fn(Status) -> E,
    _type: std::marker::PhantomData<T>,
}
impl<T: Message + Default, E> TypedSubscription<T, E> {
    #[doc(hidden)]
    pub async fn connect(
        channel: tonic::transport::Channel,
        request: Request<wire::Query>,
        decode_error: fn(Status) -> E,
    ) -> Result<Self, E> {
        let deadline =
            crate::durable_participant::prepare_request_deadline(&request).map_err(decode_error)?;
        let (metadata, _, query) = request.into_parts();
        let mut subscription = Self {
            stream: None,
            channel,
            query,
            metadata,
            deadline,
            decode_error,
            _type: std::marker::PhantomData,
        };
        subscription.reconnect().await?;
        Ok(subscription)
    }
    /// Drop the current RPC, retaining query, caller metadata and deadline.
    pub fn disconnect(&mut self) {
        self.stream.take();
    }
    /// Close the previous RPC, then issue ONE fresh Subscribe with the original
    /// query/metadata. A failed or cancelled attempt leaves this disconnected.
    /// An original explicit deadline is not reset. Reconnection does not adopt
    /// any old server authority or guarantee delivery of intervening states.
    pub async fn reconnect(&mut self) -> Result<(), E> {
        self.disconnect();
        let mut request = Request::new(self.query.clone());
        *request.metadata_mut() = self.metadata.clone();
        if let Some(deadline) = self.deadline {
            let remaining = deadline
                .checked_duration_since(tokio::time::Instant::now())
                .filter(|duration| !duration.is_zero())
                .ok_or_else(|| {
                    (self.decode_error)(Status::deadline_exceeded("subscription deadline elapsed"))
                })?;
            request.set_timeout(remaining);
        }
        let mut client = wire::local_readers_client::LocalReadersClient::new(self.channel.clone());
        let connect = client.subscribe(request);
        let response = match self.deadline {
            Some(deadline) => tokio::time::timeout_at(deadline, connect)
                .await
                .map_err(|_| {
                    (self.decode_error)(Status::deadline_exceeded("subscription deadline elapsed"))
                })?,
            None => connect.await,
        };
        if self.expired() {
            return Err((self.decode_error)(Status::deadline_exceeded(
                "subscription deadline elapsed",
            )));
        }
        let response = response.map_err(self.decode_error)?;
        self.stream = Some(response.into_inner());
        Ok(())
    }
    fn expired(&self) -> bool {
        self.deadline
            .is_some_and(|deadline| deadline <= tokio::time::Instant::now())
    }
    pub async fn message(&mut self) -> Result<Option<T>, E> {
        if self.stream.is_some() && self.expired() {
            self.disconnect();
            return Err((self.decode_error)(Status::deadline_exceeded(
                "subscription deadline elapsed",
            )));
        }
        let Some(stream) = self.stream.as_mut() else {
            return Ok(None);
        };
        let next = stream.message();
        let received = match self.deadline {
            Some(deadline) => tokio::time::timeout_at(deadline, next)
                .await
                .unwrap_or_else(|_| {
                    Err(Status::deadline_exceeded("subscription deadline elapsed"))
                }),
            None => next.await,
        };
        if self.expired() {
            self.disconnect();
            return Err((self.decode_error)(Status::deadline_exceeded(
                "subscription deadline elapsed",
            )));
        }
        let decoded = received.and_then(|snapshot| {
            snapshot
                .map(|snapshot| {
                    T::decode(snapshot.response.as_slice()).map_err(|e| {
                        Status::data_loss(format!("invalid typed reactive snapshot: {e}"))
                    })
                })
                .transpose()
        });
        if !matches!(decoded, Ok(Some(_))) {
            self.stream.take();
        }
        decoded.map_err(self.decode_error)
    }
}

include!("reactive_tests.rs");
include!("reactive_composition_tests.rs");
include!("reactive_reconnect_tests.rs");
