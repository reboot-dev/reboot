//! Generated consumer + real SDK + in-process Database fake (NOT native durability proof).
use prost::Message;
use proto::hello_methods_server::{HelloMethods, HelloMethodsServer};
use reboot::{
    ExternalContext,
    application_host::ApplicationHost,
    runtime::{DatabaseActorStore, test_support::FakeDatabase},
};
use std::{sync::Arc, time::Duration};
use tokio::sync::Notify;
use tonic::{Request, Response, Status};
use upstream_hello_constructors::{
    Hello, authorization, generated, proto,
    startup::{Adapter, INITIAL_MESSAGES, Startup, initialization_keys},
};
use uuid::Uuid;

struct Database {
    endpoint: String,
    fake: FakeDatabase,
    server: tokio::task::JoinHandle<()>,
}
impl Drop for Database {
    fn drop(&mut self) {
        self.server.abort();
    }
}
impl Database {
    async fn start() -> Self {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let endpoint = format!("http://{}", listener.local_addr().unwrap());
        let fake = FakeDatabase::default();
        let database = fake.clone();
        let server = tokio::spawn(async move {
            tonic::transport::Server::builder()
                .add_service(reboot::database_proto::database_server::DatabaseServer::new(database))
                .serve_with_incoming(tokio_stream::wrappers::TcpListenerStream::new(listener))
                .await
                .unwrap();
        });
        Self {
            endpoint,
            fake,
            server,
        }
    }
    async fn adapter(&self) -> Arc<Adapter> {
        Arc::new(
            generated::HelloMethodsDatabaseAdapter::new(
                DatabaseActorStore::connect(&self.endpoint).await.unwrap(),
                Hello,
            )
            .with_authorization(authorization()),
        )
    }
}
fn context(id: &str) -> ExternalContext {
    ExternalContext::new(
        reboot::state_ref::StateRef::from_id("hello_constructors.v1.Hello", id)
            .unwrap()
            .to_string(),
    )
}
fn rich(error: Status, name: &str) -> prost_types::Any {
    assert_eq!(error.code(), tonic::Code::Aborted);
    let rich = reboot::declared_error_details(&error).unwrap().unwrap();
    assert_eq!(rich.code, tonic::Code::Aborted as i32);
    assert_eq!(rich.message, error.message());
    assert_eq!(rich.details.len(), 1);
    assert_eq!(
        rich.details[0].type_url,
        format!("type.googleapis.com/rbt.v1alpha1.{name}")
    );
    rich.details.into_iter().next().unwrap()
}

#[test]
fn initializer_identity_is_stable_distinct_nonexpiring_and_application_scoped() {
    let keys = initialization_keys("application-A");
    assert_eq!(keys, initialization_keys("application-A"));
    assert_eq!(
        keys,
        [
            Uuid::parse_str("4cbd371b-5995-5270-a400-8d56c13eff3d").unwrap(),
            Uuid::parse_str("f13a6ff0-7ad2-57c0-813d-3e6a14ac4e4f").unwrap(),
        ]
    );
    assert_ne!(keys[0], keys[1]);
    for key in keys {
        assert_eq!(key.get_version_num(), 5);
    }
    for (a, b) in keys.into_iter().zip(initialization_keys("application-B")) {
        assert_ne!(a, b);
    }
}

#[tokio::test]
async fn generated_taskless_construction_errors_and_replay_preserve_exact_messages() {
    let database = Database::start().await;
    let adapter = database.adapter().await;
    let c = context("feature");
    let error = adapter
        .messages(c.reader(proto::MessagesRequest {}).unwrap())
        .await
        .unwrap_err();
    let detail = rich(error, "StateNotConstructed");
    assert!(
        reboot::database_proto::StateNotConstructed::decode(detail.value.as_slice())
            .unwrap()
            .requires_constructor
    );
    let missing_key = Uuid::new_v4();
    let error = adapter
        .send(
            c.writer_with_key(
                proto::SendRequest {
                    message: "absent".into(),
                },
                missing_key,
            )
            .unwrap(),
        )
        .await
        .unwrap_err();
    let detail = rich(error, "StateNotConstructed");
    assert!(
        reboot::database_proto::StateNotConstructed::decode(detail.value.as_slice())
            .unwrap()
            .requires_constructor
    );
    assert!(database.fake.create_requests().is_empty());
    assert!(database.fake.store_requests().is_empty());
    let create_key = Uuid::new_v4();
    let request = proto::CreateRequest {
        initial_message: "first message".into(),
    };
    adapter
        .create(c.writer_with_key(request.clone(), create_key).unwrap())
        .await
        .unwrap();
    adapter
        .create(c.writer_with_key(request.clone(), create_key).unwrap())
        .await
        .unwrap();
    let error = adapter
        .create(c.writer_with_key(request, Uuid::new_v4()).unwrap())
        .await
        .unwrap_err();
    let detail = rich(error, "StateAlreadyConstructed");
    reboot::database_proto::StateAlreadyConstructed::decode(detail.value.as_slice()).unwrap();
    let mut expected = vec!["first message".to_owned()];
    for message in [
        "second message",
        "",
        "雪 🦀",
        "  whitespace\n",
        "duplicate",
        "duplicate",
    ] {
        let key = Uuid::new_v4();
        let request = proto::SendRequest {
            message: message.into(),
        };
        adapter
            .send(c.writer_with_key(request.clone(), key).unwrap())
            .await
            .unwrap();
        adapter
            .send(c.writer_with_key(request, key).unwrap())
            .await
            .unwrap();
        expected.push(message.to_owned());
    }
    assert_eq!(
        adapter
            .messages(c.reader(proto::MessagesRequest {}).unwrap())
            .await
            .unwrap()
            .into_inner()
            .messages,
        expected
    );
    assert_eq!(database.fake.create_requests().len(), 1);
    assert_eq!(database.fake.store_requests().len(), expected.len() - 1);
    // New adapter/store, same Database fake receipts: not a C++ process restart.
    let restarted = database.adapter().await;
    restarted
        .create(
            c.writer_with_key(
                proto::CreateRequest {
                    initial_message: "first message".into(),
                },
                create_key,
            )
            .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(
        restarted
            .messages(c.reader(proto::MessagesRequest {}).unwrap())
            .await
            .unwrap()
            .into_inner()
            .messages,
        expected
    );
}

/// Park at the real generated entry boundary, after Create's durable fake ACK.
/// This wrapper never implements business/storage behavior.
struct ParkSend {
    adapter: Arc<Adapter>,
    entered: Arc<Notify>,
    dropped: Arc<Notify>,
}
struct DropSignal(Arc<Notify>);
impl Drop for DropSignal {
    fn drop(&mut self) {
        self.0.notify_one();
    }
}
#[tonic::async_trait]
impl HelloMethods for ParkSend {
    async fn create(
        &self,
        request: Request<proto::CreateRequest>,
    ) -> Result<Response<proto::CreateResponse>, Status> {
        self.adapter.create(request).await
    }
    async fn messages(
        &self,
        request: Request<proto::MessagesRequest>,
    ) -> Result<Response<proto::MessagesResponse>, Status> {
        self.adapter.messages(request).await
    }
    async fn send(
        &self,
        _: Request<proto::SendRequest>,
    ) -> Result<Response<proto::SendResponse>, Status> {
        let _drop = DropSignal(self.dropped.clone());
        self.entered.notify_one();
        std::future::pending().await
    }
}

#[tokio::test]
async fn host_owns_cancellation_before_listening_and_next_boot_resumes_send() {
    let database = Database::start().await;
    let adapter = database.adapter().await;
    let entered = Arc::new(Notify::new());
    let dropped = Arc::new(Notify::new());
    let parked = Arc::new(ParkSend {
        adapter: adapter.clone(),
        entered: entered.clone(),
        dropped: dropped.clone(),
    });
    let startup = Startup::new(parked, "startup-test").unwrap();
    // Reserve an address, then release it; lifecycle startup must not bind it yet.
    let reservation = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = reservation.local_addr().unwrap();
    drop(reservation);
    let (stop, stopped) = tokio::sync::oneshot::channel();
    let serving_adapter = adapter.clone();
    let host = tokio::spawn(async move {
        ApplicationHost::new("startup-test")
            .with_lifecycle(startup)
            .add_public_service(HelloMethodsServer::from_arc(serving_adapter))
            .serve_with_shutdown(address, async {
                let _ = stopped.await;
            })
            .await
    });
    tokio::time::timeout(Duration::from_secs(3), entered.notified())
        .await
        .unwrap();
    assert!(tokio::net::TcpStream::connect(address).await.is_err());
    assert_eq!(database.fake.create_requests().len(), 1);
    assert!(database.fake.store_requests().is_empty());
    stop.send(()).unwrap();
    tokio::time::timeout(Duration::from_secs(3), host)
        .await
        .unwrap()
        .unwrap()
        .unwrap();
    tokio::time::timeout(Duration::from_secs(1), dropped.notified())
        .await
        .unwrap();
    // Simulated boot after loss of the callback: fresh SDK store/adapter; retained
    // fake state+receipt. No unpersisted progress marker is used by Startup.
    let restarted = database.adapter().await;
    let startup = Startup::new(restarted.clone(), "startup-test").unwrap();
    assert_eq!(startup.run().await.unwrap(), INITIAL_MESSAGES);
    assert_eq!(startup.run().await.unwrap(), INITIAL_MESSAGES);
    assert_eq!(database.fake.create_requests().len(), 1);
    assert_eq!(database.fake.store_requests().len(), 1);
    let wrong_identity = Startup::new(restarted, "different-application").unwrap();
    rich(
        wrong_identity.run().await.unwrap_err(),
        "StateAlreadyConstructed",
    );
}

#[tokio::test]
async fn startup_is_automatic_and_public_anonymous_access_needs_no_dev_selector() {
    let database = Database::start().await;
    let adapter = database.adapter().await;
    let startup = Startup::new(adapter.clone(), "public-test").unwrap();
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    let (stop, stopped) = tokio::sync::oneshot::channel();
    let host = tokio::spawn(async move {
        ApplicationHost::new("public-test")
            .with_lifecycle(startup)
            .add_public_service(HelloMethodsServer::from_arc(adapter))
            .serve_with_listener_shutdown(listener, async {
                let _ = stopped.await;
            })
            .await
    });
    let channel = tonic::transport::Endpoint::from_shared(format!("http://{address}"))
        .unwrap()
        .connect()
        .await
        .unwrap();
    let mut health = tonic_health::pb::health_client::HealthClient::new(channel.clone());
    tokio::time::timeout(Duration::from_secs(3), async {
        loop {
            if let Ok(response) = health
                .check(tonic_health::pb::HealthCheckRequest {
                    service: String::new(),
                })
                .await
            {
                if response.into_inner().status == 1 {
                    break;
                }
            }
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
    })
    .await
    .unwrap();
    let mut client = generated::HelloMethodsExternalClient::new(channel, context("reboot-hello"));
    assert_eq!(
        client
            .messages(proto::MessagesRequest {})
            .await
            .unwrap()
            .into_inner()
            .messages,
        INITIAL_MESSAGES
    );
    stop.send(()).unwrap();
    tokio::time::timeout(Duration::from_secs(3), host)
        .await
        .unwrap()
        .unwrap()
        .unwrap();
}
