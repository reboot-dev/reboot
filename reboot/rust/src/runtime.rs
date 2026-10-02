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

use crate::{InMemoryActor, proto};

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
