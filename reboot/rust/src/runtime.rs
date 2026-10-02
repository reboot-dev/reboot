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

use std::collections::HashMap;
use std::fs::{self, File, OpenOptions};
use std::future::Future;
use std::io::{self, Write};
use std::path::{Path, PathBuf};
use std::pin::Pin;
use std::sync::{Arc, LazyLock, Mutex, Weak};

use prost::Message;
use sha2::{Digest, Sha256};
use tonic::{Request, Response, Status};
use uuid::Uuid;

use crate::{IdempotencyCollision, InMemoryActor, database_proto as database, proto};

const STATE_REF_HEADER: &str = "x-reboot-state-ref";
const IDEMPOTENCY_KEY_HEADER: &str = "x-reboot-idempotency-key";
const REQUEST_FINGERPRINT_DOMAIN_V1: &[u8] = b"reboot.idempotency.request-fingerprint.v1\0";

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

static DATABASE_ACTOR_LOCKS: LazyLock<Mutex<HashMap<ActorLockKey, Weak<tokio::sync::Mutex<()>>>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

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
    actor_locks: Arc<Mutex<HashMap<ActorLockKey, Arc<tokio::sync::Mutex<()>>>>>,
}

impl DatabaseActorStore {
    /// Connects to an existing Reboot Database sidecar.
    pub async fn connect(endpoint: impl AsRef<str>) -> Result<Self, tonic::transport::Error> {
        let endpoint = tonic::transport::Endpoint::from_shared(endpoint.as_ref().to_owned())?;
        let endpoint_uri = endpoint.uri().to_string();
        Ok(Self {
            database: database::database_client::DatabaseClient::connect(endpoint).await?,
            endpoint: endpoint_uri,
            actor_locks: Arc::new(Mutex::new(HashMap::new())),
        })
    }

    fn lock_for_type(&self, state_type: &str, state_ref: &str) -> Arc<tokio::sync::Mutex<()>> {
        let key = ActorLockKey {
            endpoint: self.endpoint.clone(),
            state_type: state_type.to_owned(),
            state_ref: state_ref.to_owned(),
        };
        let mut locks = self
            .actor_locks
            .lock()
            .expect("actor-lock map mutex poisoned");
        if let Some(lock) = locks.get(&key) {
            return lock.clone();
        }

        let mut registry = DATABASE_ACTOR_LOCKS
            .lock()
            .expect("database actor-lock registry mutex poisoned");
        registry.retain(|_, lock| lock.strong_count() > 0);
        let lock = match registry.get(&key).and_then(Weak::upgrade) {
            Some(lock) => lock,
            None => {
                let lock = Arc::new(tokio::sync::Mutex::new(()));
                registry.insert(key.clone(), Arc::downgrade(&lock));
                lock
            }
        };
        locks.insert(key, lock.clone());
        lock
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
        let _guard = lock.lock().await;
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
        let fingerprint = request_fingerprint(method_identity, request.get_ref());
        let state_ref = required_metadata(&request, STATE_REF_HEADER)?;
        let key = idempotency_key(&request)?;
        let lock = self.lock_for_type(state_type, &state_ref);
        let _guard = lock.lock().await;
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
}

/// Concrete generated-style adapter for the `EchoMethods` service.
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
    Uuid::parse_str(&value).map_err(|_| {
        Status::invalid_argument(format!(
            "metadata `{IDEMPOTENCY_KEY_HEADER}` must be a UUID"
        ))
    })
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
impl proto::counter_writes_server::CounterWrites for CounterAdapter {
    async fn increment(
        &self,
        request: Request<proto::IncrementRequest>,
    ) -> Result<Response<proto::CounterValue>, Status> {
        self.store
            .writer_async_with_method::<proto::Counter, _, _, _>(
                "tests.reboot.protoc.Counter",
                "tests.reboot.protoc.CounterWrites.Increment",
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
impl proto::counter_reads_server::CounterReads for CounterAdapter {
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
    }

    impl FakeDatabase {
        pub fn store_requests(&self) -> Vec<database::StoreRequest> {
            self.state
                .lock()
                .expect("fake database mutex poisoned")
                .store_requests
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
    use crate::ExternalContext;
    use std::collections::BTreeMap;

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
            request_fingerprint("tests.reboot.protoc.MapCounterWrites.Increment", &first),
            request_fingerprint("tests.reboot.protoc.MapCounterWrites.Increment", &second),
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
                .add_service(proto::counter_writes_server::CounterWritesServer::new(
                    adapter.clone(),
                ))
                .add_service(proto::counter_reads_server::CounterReadsServer::new(
                    adapter,
                ))
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
        let mut writes = proto::counter_writes_client::CounterWritesClient::connect(address)
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
        let mut writes =
            proto::counter_writes_client::CounterWritesClient::connect(address.clone())
                .await
                .unwrap();
        let mut reads = proto::counter_reads_client::CounterReadsClient::connect(address)
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
