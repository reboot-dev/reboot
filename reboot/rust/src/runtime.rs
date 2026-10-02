//! Process-local Tonic host for the generated EchoMethods test service.
//!
//! This is deliberately a small executable runtime slice: actor state is keyed
//! by `x-reboot-state-ref`, writes require a UUID idempotency key, and reads
//! return the actor's last successfully written message.

use std::collections::HashMap;
use std::fs::{self, File, OpenOptions};
use std::io::{self, Write};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

use prost::Message;
use tonic::{Request, Response, Status};
use uuid::Uuid;

use crate::{InMemoryActor, database_proto as database, proto};

const STATE_REF_HEADER: &str = "x-reboot-state-ref";
const IDEMPOTENCY_KEY_HEADER: &str = "x-reboot-idempotency-key";

type EchoActor = InMemoryActor<proto::Echo, proto::Text>;

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
    completed_writes: HashMap<Uuid, proto::Text>,
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

    fn writer(&self, idempotency_key: Uuid, message: proto::Text) -> io::Result<proto::Text> {
        let mut guard = self.inner.lock().expect("actor state mutex poisoned");
        if let Some(response) = guard.completed_writes.get(&idempotency_key) {
            return Ok(response.clone());
        }

        let checkpoint = guard.clone();
        guard.state.last_message = Some(message.clone());
        guard
            .completed_writes
            .insert(idempotency_key, message.clone());
        if let Err(error) = persist_actor(&self.path, &guard) {
            *guard = checkpoint;
            return Err(error);
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
        if completed_writes.insert(key, response).is_some() {
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
            .map(|(key, response)| PersistedWrite {
                idempotency_key: key.to_string(),
                response: Some(response.clone()),
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

const ECHO_STATE_TYPE: &str = "tests.reboot.protoc.Echo";

/// A durable single-actor Echo host backed by Reboot's existing Database
/// sidecar protocol.
///
/// The sidecar atomically stores actor state and the idempotent response in one
/// `Store(sync=true)` request. This host deliberately does not implement
/// transactions, workflows, tasks, placement, or generic service adaptation.
#[derive(Clone)]
pub struct DatabaseBackedHost {
    database: database::database_client::DatabaseClient<tonic::transport::Channel>,
    actor_locks: Arc<Mutex<HashMap<String, Arc<tokio::sync::Mutex<()>>>>>,
}

impl DatabaseBackedHost {
    /// Connects to an existing Reboot Database sidecar.
    pub async fn connect(endpoint: impl AsRef<str>) -> Result<Self, tonic::transport::Error> {
        Ok(Self {
            database: database::database_client::DatabaseClient::connect(
                endpoint.as_ref().to_owned(),
            )
            .await?,
            actor_locks: Arc::new(Mutex::new(HashMap::new())),
        })
    }

    fn lock_for(&self, state_ref: &str) -> Arc<tokio::sync::Mutex<()>> {
        let mut locks = self
            .actor_locks
            .lock()
            .expect("host actor-lock map mutex poisoned");
        locks
            .entry(state_ref.to_owned())
            .or_insert_with(|| Arc::new(tokio::sync::Mutex::new(())))
            .clone()
    }

    async fn load_echo(&self, state_ref: &str) -> Result<Option<proto::Echo>, Status> {
        let mut database = self.database.clone();
        let response = database
            .load(database::LoadRequest {
                actors: vec![database::Actor {
                    state_type: ECHO_STATE_TYPE.to_owned(),
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
        proto::Echo::decode(state.as_slice())
            .map(Some)
            .map_err(|error| Status::internal(format!("invalid persisted Echo state: {error}")))
    }

    async fn load_completed_reply(
        &self,
        state_ref: &str,
        key: Uuid,
    ) -> Result<Option<proto::Text>, Status> {
        let mut database = self.database.clone();
        let mut stream = database
            .recover_idempotent_mutations(database::RecoverIdempotentMutationsRequest {
                state_type: ECHO_STATE_TYPE.to_owned(),
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
                    return proto::Text::decode(mutation.response.as_slice())
                        .map(Some)
                        .map_err(|error| {
                            Status::internal(format!(
                                "invalid persisted idempotent reply response: {error}"
                            ))
                        });
                }
            }
        }
        Ok(None)
    }

    async fn store_reply(
        &self,
        state_ref: &str,
        key: Uuid,
        state: proto::Echo,
        response: proto::Text,
    ) -> Result<(), Status> {
        let mut database = self.database.clone();
        database
            .store(database::StoreRequest {
                actor_upserts: vec![database::Actor {
                    state_type: ECHO_STATE_TYPE.to_owned(),
                    state_ref: state_ref.to_owned(),
                    state: Some(state.encode_to_vec()),
                }],
                task_upserts: vec![],
                colocated_upserts: vec![],
                transaction: None,
                idempotent_mutation: Some(database::IdempotentMutation {
                    state_type: ECHO_STATE_TYPE.to_owned(),
                    state_ref: state_ref.to_owned(),
                    key: key.as_bytes().to_vec(),
                    response: response.encode_to_vec(),
                    task_ids: vec![],
                    workflow_id: None,
                    workflow_iteration: None,
                }),
                ensure_state_types_created: vec![],
                sync: true,
            })
            .await
            .map_err(database_status)?;
        Ok(())
    }
}

fn database_status(error: tonic::Status) -> Status {
    Status::unavailable(format!("Reboot database sidecar request failed: {error}"))
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

fn idempotency_key(request: &Request<proto::Text>) -> Result<Uuid, Status> {
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
        let message = request.into_inner();
        let response = actor.writer(key, |state| {
            state.last_message = Some(message.clone());
            message
        });
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
        let message = request.into_inner();
        let response = actor
            .writer(key, message)
            .map_err(|error| Status::internal(format!("failed to persist actor state: {error}")))?;
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
impl proto::echo_methods_server::EchoMethods for DatabaseBackedHost {
    async fn reply(&self, request: Request<proto::Text>) -> Result<Response<proto::Text>, Status> {
        let state_ref = required_metadata(&request, STATE_REF_HEADER)?;
        let key = idempotency_key(&request)?;
        let lock = self.lock_for(&state_ref);
        let _guard = lock.lock().await;

        if let Some(response) = self.load_completed_reply(&state_ref, key).await? {
            return Ok(Response::new(response));
        }

        let response = request.into_inner();
        let mut state = self.load_echo(&state_ref).await?.unwrap_or_default();
        state.last_message = Some(response.clone());
        self.store_reply(&state_ref, key, state, response.clone())
            .await?;
        Ok(Response::new(response))
    }

    async fn last_message(
        &self,
        request: Request<proto::Empty>,
    ) -> Result<Response<proto::Text>, Status> {
        let state_ref = required_metadata(&request, STATE_REF_HEADER)?;
        let state = self.load_echo(&state_ref).await?;
        Ok(Response::new(
            state
                .and_then(|state| state.last_message)
                .unwrap_or_default(),
        ))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ExternalContext;

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

    type DatabaseStream<T> = tokio_stream::Iter<std::vec::IntoIter<Result<T, Status>>>;

    /// Minimal durable fake exposed through the generated Database Tonic server.
    /// It implements only the storage semantics this runtime needs, while every
    /// unused generated RPC remains deliberately well-formed and inert.
    #[derive(Clone, Default)]
    struct FakeDatabase {
        state: Arc<Mutex<FakeDatabaseState>>,
    }

    #[derive(Default)]
    struct FakeDatabaseState {
        actors: HashMap<(String, String), Vec<u8>>,
        mutations: HashMap<(String, String, Vec<u8>), database::IdempotentMutation>,
        store_requests: Vec<database::StoreRequest>,
    }

    impl FakeDatabase {
        fn store_requests(&self) -> Vec<database::StoreRequest> {
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

    async fn start_database() -> (String, FakeDatabase, tokio::task::JoinHandle<()>) {
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

    async fn start_database_host(
        host: DatabaseBackedHost,
    ) -> (String, tokio::task::JoinHandle<()>) {
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

    #[tokio::test]
    async fn database_host_recreation_replays_persisted_reply_and_stores_atomically() {
        let (database_address, database, database_server) = start_database().await;
        let context = ExternalContext::new("database-durable-echo");
        let key = Uuid::from_u128(17);

        let (address, host_server) = start_database_host(
            DatabaseBackedHost::connect(&database_address)
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

        let (address, host_server) = start_database_host(
            DatabaseBackedHost::connect(&database_address)
                .await
                .unwrap(),
        )
        .await;
        let mut client = proto::echo_methods_client::EchoMethodsClient::connect(address)
            .await
            .unwrap();
        let replay = client
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
            .unwrap()
            .into_inner();
        assert_eq!(replay.content, "persisted through generated database");
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
        assert_eq!(actor.state_type, ECHO_STATE_TYPE);
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
    async fn database_host_keeps_state_references_isolated() {
        let (database_address, database, database_server) = start_database().await;
        let (address, host_server) = start_database_host(
            DatabaseBackedHost::connect(&database_address)
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

    #[tokio::test]
    async fn file_backed_host_survives_restart_and_replays_writes() {
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
            .unwrap()
            .into_inner();
        assert_eq!(replay.content, "persisted");
        let last = client
            .last_message(context.reader(proto::Empty {}).unwrap())
            .await
            .unwrap()
            .into_inner();
        assert_eq!(last.content, "persisted");
        server.abort();
    }

    #[tokio::test]
    async fn reply_persists_and_replays_by_idempotency_key() {
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
            .reply(
                context
                    .writer_with_key(
                        proto::Text {
                            content: "ignored".into(),
                        },
                        key,
                    )
                    .unwrap(),
            )
            .await
            .unwrap()
            .into_inner();
        assert_eq!(replay.content, "first");

        let last = client
            .last_message(context.reader(proto::Empty {}).unwrap())
            .await
            .unwrap()
            .into_inner();
        assert_eq!(last.content, "first");
        server.abort();
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
