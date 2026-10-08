//! Rust-only local reactive readers. One trusted host owns all mutations to
//! the sidecar; no distributed watch, dependency tracking or Python React wire.
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
    async fn read(&self, request: Request<wire::Query>) -> Result<Vec<u8>, Status>;
}
struct Inner {
    gate: ActorGate,
    state_ref: String,
    state_type: String,
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
#[derive(Clone)]
pub struct LocalReaderService<B> {
    binding: Arc<B>,
    owner: LocalReaderOwner,
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
    trusted: Option<crate::application_host::TrustedApplicationContext>,
    scope: ReaderScope,
    query: wire::Query,
    previous: Option<Vec<u8>>,
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
                    _ = self.scope.revoked() => return (Some(Err(self.scope.check().err().unwrap_or_else(|| Status::unavailable("reader authority revoked")))), self),
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
            let read = async {
                self.scope.check()?;
                let _lease = self.owner.inner.gate.shared().await;
                self.scope.check()?;
                let mut request = Request::new(self.query.clone());
                *request.metadata_mut() = self.metadata.clone();
                if let Some(trusted) = &self.trusted {
                    request.extensions_mut().insert(trusted.clone());
                }
                request.extensions_mut().insert(self.scope.clone());
                self.binding.read(request).await
            };
            let result = tokio::select! {
                biased;
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
#[tonic::async_trait]
impl<B: ReaderBinding> wire::local_readers_server::LocalReaders for LocalReaderService<B> {
    type SubscribeStream = ReaderStream<B>;
    async fn subscribe(
        &self,
        request: Request<wire::Query>,
    ) -> Result<tonic::Response<Self::SubscribeStream>, Status> {
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
            trusted: request
                .extensions()
                .get::<crate::application_host::TrustedApplicationContext>()
                .cloned(),
            scope: ReaderScope::new(lifecycle.clone()),
            query: request.into_inner(),
            previous: None,
            _permit: permit,
        };
        Ok(tonic::Response::new(ReaderStream {
            next: Some(Box::pin(cursor.next())),
        }))
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
include!("reactive_reconnect_tests.rs");
