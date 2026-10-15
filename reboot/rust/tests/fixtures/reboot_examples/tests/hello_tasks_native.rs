//! Real C++ Database/RocksDB happy-path and restart proof, not full Python retry parity.
#[path = "support/hello_tasks_local_retry.rs"]
mod local_retry;
use prost::Message;
use reboot::{database_proto as db, runtime::DatabaseActorStore};
use reboot_rust_upstream_examples::{
    hello_tasks::v1 as proto, hello_tasks_consumer::HelloTasks, tasks_adapter as generated,
};
use std::{
    process::{Child, Command, Stdio},
    time::Duration,
};
const STATE: &str = "hello_tasks.v1.Hello";
#[cfg(feature = "native-test-support")]
#[path = "support/hello_tasks_recovery.rs"]
mod recovery;
#[cfg(not(feature = "native-test-support"))]
use HelloTasks as ObservedHelloTasks;
#[cfg(feature = "native-test-support")]
use recovery::ObservedHelloTasks;
struct Native {
    child: Child,
    endpoint: String,
    directory: std::path::PathBuf,
    binary: String,
}
impl Native {
    async fn start(directory: std::path::PathBuf) -> Self {
        std::fs::create_dir_all(&directory).unwrap();
        std::fs::write(
            directory.join("info.pb"),
            db::ServerInfo {
                shard_infos: vec![db::ShardInfo {
                    shard_id: "s000000000".into(),
                    shard_first_key: vec![],
                }],
            }
            .encode_to_vec(),
        )
        .unwrap();
        let binary = std::env::var("REBOOT_NATIVE2PC_CXX_DATABASE").unwrap();
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        drop(listener);
        let log = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(directory.join("database.log"))
            .unwrap();
        let child = Command::new(&binary)
            .args([
                directory.join("rocksdb").to_str().unwrap(),
                directory.join("info.pb").to_str().unwrap(),
                &port.to_string(),
            ])
            .stdout(Stdio::null())
            .stderr(Stdio::from(log))
            .spawn()
            .unwrap();
        let native = Self {
            child,
            endpoint: format!("http://127.0.0.1:{port}"),
            directory,
            binary,
        };
        eprintln!("native evidence directory: {}", native.directory.display());
        native.process_evidence("started", None);
        native.ready().await;
        native
    }
    fn process_evidence(&self, event: &str, status: Option<std::process::ExitStatus>) {
        use std::io::Write;
        if status.is_some() {
            assert!(!std::path::Path::new(&format!("/proc/{}", self.child.id())).exists());
        }
        let mut log = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(self.directory.join("database-processes.log"))
            .unwrap();
        writeln!(
            log,
            "pid={} event={event} status={status:?} proc_absent={}",
            self.child.id(),
            status.is_some()
        )
        .unwrap();
        eprintln!("owned database pid={} event={event}", self.child.id());
    }
    async fn ready(&self) {
        for _ in 0..200 {
            if db::database_client::DatabaseClient::connect(self.endpoint.clone())
                .await
                .is_ok()
            {
                return;
            }
            tokio::time::sleep(Duration::from_millis(25)).await;
        }
        panic!("native database startup");
    }
    async fn restart(&mut self) {
        self.child.kill().unwrap();
        let status = self.child.wait().unwrap();
        self.process_evidence("restart-reaped", Some(status));
        let port = self.endpoint.rsplit(':').next().unwrap();
        let log = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(self.directory.join("database.log"))
            .unwrap();
        self.child = Command::new(&self.binary)
            .args([
                self.directory.join("rocksdb").to_str().unwrap(),
                self.directory.join("info.pb").to_str().unwrap(),
                port,
            ])
            .stdout(Stdio::null())
            .stderr(Stdio::from(log))
            .spawn()
            .unwrap();
        self.process_evidence("restart-started", None);
        self.ready().await;
    }
}
impl Drop for Native {
    fn drop(&mut self) {
        let _ = self.child.kill();
        if let Ok(status) = self.child.wait() {
            self.process_evidence("drop-reaped", Some(status));
        }
    }
}
struct Host {
    tasks: reboot::one_shot_tasks::OneShotTasks,
    endpoint: String,
    shutdown: tokio::sync::oneshot::Sender<()>,
    task: tokio::task::JoinHandle<Result<(), reboot::application_host::ApplicationHostError>>,
}
impl Host {
    async fn start(database: &str, reference: &str) -> Self {
        use reboot::placement_proto as p;
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = listener.local_addr().unwrap().port();
        let store = DatabaseActorStore::connect(database).await.unwrap();
        let adapter = generated::HelloMethodsDatabaseAdapter::new(store, ObservedHelloTasks)
            .with_authorization(reboot::auth::AuthorizationPolicy::permissive_for_development());
        let (adapter, tasks) = adapter.with_one_shot_writer_tasks(reference).unwrap();
        let placement = reboot::legacy_placement::PlanOnlyLegacyPlacement::new();
        placement
            .install(p::ListenForPlanResponse {
                plan: Some(p::Plan {
                    version: 1,
                    applications: vec![p::plan::Application {
                        id: "hello-tasks".into(),
                        services: vec![
                            p::plan::application::Service {
                                full_name: "hello_tasks.v1.HelloMethods".into(),
                                state_type_full_name: STATE.into(),
                            },
                            p::plan::application::Service {
                                full_name: "rbt.v1alpha1.Tasks".into(),
                                state_type_full_name: String::new(),
                            },
                        ],
                        shards: vec![p::plan::application::Shard {
                            id: "s000000000".into(),
                            range: Some(p::plan::application::shard::KeyRange {
                                first_key: vec![],
                            }),
                            server_id: "hello-server".into(),
                            replica_index: 0,
                        }],
                    }],
                }),
                servers: vec![p::Server {
                    id: "hello-server".into(),
                    application_id: "hello-tasks".into(),
                    address: Some(p::server::Address {
                        host: "127.0.0.1".into(),
                        port: port.into(),
                    }),
                    ..Default::default()
                }],
            })
            .unwrap();
        let wait = db::tasks_server::TasksServer::new(
            reboot::one_shot_tasks::ReaderTaskWaitService::new(
                [tasks.clone()],
                reboot::legacy_placement::LegacyApplicationId::new("hello-tasks").unwrap(),
                "hello-server",
                placement.clone(),
            )
            .unwrap()
            .with_wait_policy(reboot::auth::AuthorizationPolicy::permissive_for_development())
            .with_admin_authorization(
                std::sync::Arc::new(local_retry::FixtureAdmin),
                std::sync::Arc::new(local_retry::FixtureAdmin),
            ),
        );
        let host = reboot::application_host::ApplicationHost::new("hello-tasks")
            .with_legacy_placement_readiness(placement)
            .with_host_recovery(tasks.recovery(db::RecoverRequest {
                state_tags_by_state_type: [(STATE.into(), "Hello".into())].into(),
                shard_ids: vec!["s000000000".into()],
                skip_idempotent_mutations: true,
            }))
            .add_public_service(proto::hello_methods_server::HelloMethodsServer::new(
                adapter,
            ))
            .add_public_service(wait);
        let (shutdown, stopped) = tokio::sync::oneshot::channel();
        let task = tokio::spawn(async move {
            host.serve_with_listener_shutdown(listener, async {
                let _ = stopped.await;
            })
            .await
        });
        let endpoint = format!("http://127.0.0.1:{port}");
        let mut last_error = String::new();
        for _ in 0..200 {
            if let Ok(mut client) =
                proto::hello_methods_client::HelloMethodsClient::connect(endpoint.clone()).await
            {
                match client
                    .messages(request(reference, proto::MessagesRequest {}, None))
                    .await
                {
                    Ok(_) => {
                        return Self {
                            tasks,
                            endpoint,
                            shutdown,
                            task,
                        };
                    }
                    Err(error) if error.code() == tonic::Code::Unavailable => {
                        last_error = error.to_string();
                    }
                    Err(error) => panic!("read-only readiness: {error}"),
                }
            }
            tokio::time::sleep(Duration::from_millis(25)).await;
        }
        if task.is_finished() {
            panic!("host exited before readiness: {:?}", task.await);
        }
        panic!("host readiness: {last_error}");
    }
    async fn finish(self) {
        self.shutdown.send(()).unwrap();
        tokio::time::timeout(Duration::from_secs(8), self.task)
            .await
            .unwrap()
            .unwrap()
            .unwrap();
    }
}
fn request<T>(reference: &str, body: T, key: Option<uuid::Uuid>) -> tonic::Request<T> {
    let mut request = tonic::Request::new(body);
    let mut headers = reboot::RebootHeaders::new(reference);
    headers.idempotency_key = key;
    *request.metadata_mut() = headers.to_metadata().unwrap();
    request
}
fn database_id(id: &reboot_rust_upstream_examples::rbt::v1alpha1::TaskId) -> db::TaskId {
    db::TaskId {
        state_type: id.state_type.clone(),
        state_ref: id.state_ref.clone(),
        task_uuid: id.task_uuid.clone(),
    }
}
async fn load(database: &str, id: db::TaskId) -> db::Task {
    db::database_client::DatabaseClient::connect(database.to_owned())
        .await
        .unwrap()
        .load(db::LoadRequest {
            actors: vec![],
            task_ids: vec![id],
        })
        .await
        .unwrap()
        .into_inner()
        .tasks
        .remove(0)
}
async fn state(database: &str, reference: &str) -> proto::Hello {
    DatabaseActorStore::connect(database)
        .await
        .unwrap()
        .load_for_declaration::<generated::HelloDurableState>(reference)
        .await
        .unwrap()
        .unwrap()
}
#[tokio::test]
#[ignore = "requires REBOOT_NATIVE2PC_CXX_DATABASE real C++ Database/RocksDB"]
async fn pinned_ordinary_send_warning_erase_native_restart_and_completed_successor_replay() {
    let base = std::env::var_os("HELLO_TASKS_EVIDENCE_ROOT")
        .map(std::path::PathBuf::from)
        .unwrap_or_else(std::env::temp_dir);
    let directory = base.join(format!("hello-tasks-native-{}", uuid::Uuid::new_v4()));
    let mut native = Native::start(directory).await;
    let reference = reboot::state_ref::StateRef::from_id(STATE, "hello-native")
        .unwrap()
        .to_string();
    let host = Host::start(&native.endpoint, &reference).await;
    let mut client =
        proto::hello_methods_client::HelloMethodsClient::connect(host.endpoint.clone())
            .await
            .unwrap();
    let key = uuid::Uuid::new_v4();
    let body = proto::SendRequest {
        message: "native message".into(),
    };
    let sent = client
        .send(request(&reference, body.clone(), Some(key)))
        .await
        .unwrap()
        .into_inner();
    let warning_id = database_id(sent.task_id.as_ref().unwrap());
    let warning = load(&native.endpoint, warning_id.clone()).await;
    assert_eq!(warning.method, "Warning");
    assert_eq!(warning.status, db::task::Status::Pending as i32);
    let first = state(&native.endpoint, &reference).await;
    assert_eq!(first.messages.len(), 1);
    assert_eq!(first.messages[0].text, "native message");
    assert_eq!(
        proto::WarningRequest::decode(warning.request.as_slice())
            .unwrap()
            .message_id,
        first.messages[0].id
    );
    let deadline = warning.timestamp.as_ref().unwrap().seconds;
    assert!(
        deadline
            >= std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_secs() as i64
                + 5
    );
    assert_eq!(
        client
            .send(request(&reference, body.clone(), Some(key)))
            .await
            .unwrap()
            .into_inner(),
        sent
    );
    host.finish().await;
    assert_eq!(
        load(&native.endpoint, warning_id.clone()).await.status,
        db::task::Status::Pending as i32,
        "pending at shutdown"
    );
    native.restart().await;
    let host = Host::start(&native.endpoint, &reference).await;
    let channel = tonic::transport::Endpoint::from_shared(host.endpoint.clone())
        .unwrap()
        .connect()
        .await
        .unwrap();
    let warned = tokio::time::timeout(
        Duration::from_secs(15),
        generated::HelloMethodsTasksWait::warning(
            channel.clone(),
            request(&reference, warning_id.clone(), None),
        ),
    )
    .await
    .unwrap()
    .unwrap();
    let erase_id = database_id(warned.task_id.as_ref().unwrap());
    let erase = load(&native.endpoint, erase_id.clone()).await;
    assert_eq!(erase.method, "Erase");
    assert_eq!(erase.status, db::task::Status::Pending as i32);
    assert_eq!(
        state(&native.endpoint, &reference).await.messages[0].text,
        "native message (Disappearing soon!)"
    );
    host.finish().await;
    native.restart().await;
    let host = Host::start(&native.endpoint, &reference).await;
    let channel = tonic::transport::Endpoint::from_shared(host.endpoint.clone())
        .unwrap()
        .connect()
        .await
        .unwrap();
    tokio::time::timeout(
        Duration::from_secs(10),
        generated::HelloMethodsTasksWait::erase(
            channel,
            request(&reference, erase_id.clone(), None),
        ),
    )
    .await
    .unwrap()
    .unwrap();
    let final_state = state(&native.endpoint, &reference).await;
    assert!(final_state.messages.is_empty());
    assert_eq!(final_state.num_erased_messages, 1);
    let completed = load(&native.endpoint, erase_id.clone()).await;
    assert_eq!(completed.status, db::task::Status::Completed as i32);
    // Intervening ordinary writer changes actor state. Reusing the admitted
    // task-seeded key must return the checkpoint even though the message is gone.
    let mut client =
        proto::hello_methods_client::HelloMethodsClient::connect(host.endpoint.clone())
            .await
            .unwrap();
    client
        .send(request(
            &reference,
            proto::SendRequest {
                message: "intervening".into(),
            },
            Some(uuid::Uuid::new_v4()),
        ))
        .await
        .unwrap();
    let warning_key =
        reboot::runtime::writer_task_key(&warning_id, "hello_tasks.v1.HelloMethods.Warning")
            .unwrap();
    let replayed = client
        .warning(request(
            &reference,
            proto::WarningRequest::decode(warning.request.as_slice()).unwrap(),
            Some(warning_key),
        ))
        .await
        .unwrap()
        .into_inner();
    assert_eq!(replayed, warned);
    assert_eq!(
        load(&native.endpoint, erase_id).await,
        completed,
        "replay must not resurrect Erase"
    );
    assert_eq!(
        state(&native.endpoint, &reference).await.messages[0].text,
        "intervening"
    );
    assert_eq!(
        client
            .send(request(&reference, body, Some(key)))
            .await
            .unwrap()
            .into_inner(),
        sent
    );
    host.finish().await;
}
