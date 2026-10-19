//! Opt-in native acceptance helpers. No fake and no production failpoint.
use prost::Message;
use proto::hello_methods_server::HelloMethods;
use reboot::{ExternalContext, application_host::ApplicationHost, runtime::DatabaseActorStore};
use std::sync::Arc;
use tonic::{Request, Response, Status};
use upstream_hello_constructors::{
    Hello, authorization, generated, proto,
    startup::{Adapter, INITIAL_MESSAGES, Startup},
};
use uuid::Uuid;

struct Park(Arc<Adapter>);
#[tonic::async_trait]
impl HelloMethods for Park {
    async fn create(
        &self,
        r: Request<proto::CreateRequest>,
    ) -> Result<Response<proto::CreateResponse>, Status> {
        self.0.create(r).await
    }
    async fn messages(
        &self,
        r: Request<proto::MessagesRequest>,
    ) -> Result<Response<proto::MessagesResponse>, Status> {
        self.0.messages(r).await
    }
    async fn send(
        &self,
        _: Request<proto::SendRequest>,
    ) -> Result<Response<proto::SendResponse>, Status> {
        std::fs::write(
            std::env::var("HELLO_NATIVE_AFTER_CREATE_MARKER").unwrap(),
            "durable generated Create acknowledged; Send not entered\n",
        )
        .unwrap();
        std::future::pending().await
    }
}
#[tokio::test]
#[ignore = "requires native Database and exact-child owner; intentionally parked until killed"]
async fn native_park_initializer_after_create() {
    let adapter = Arc::new(
        generated::HelloMethodsDatabaseAdapter::new(
            DatabaseActorStore::connect(std::env::var("RBT_RUST_DATABASE_URL").unwrap())
                .await
                .unwrap(),
            Hello,
        )
        .with_authorization(authorization()),
    );
    let startup = Startup::new(
        Arc::new(Park(adapter.clone())),
        &std::env::var("RBT_NAME").unwrap(),
    )
    .unwrap();
    ApplicationHost::new(std::env::var("RBT_NAME").unwrap())
        .with_lifecycle(startup)
        .add_public_service(proto::hello_methods_server::HelloMethodsServer::from_arc(
            adapter,
        ))
        .serve_with_shutdown(
            std::env::var("RBT_RUST_LISTEN_ADDR")
                .unwrap()
                .parse()
                .unwrap(),
            std::future::pending::<()>(),
        )
        .await
        .unwrap();
}
fn detail(error: Status, name: &str) -> prost_types::Any {
    assert_eq!(error.code(), tonic::Code::Aborted);
    let rich = reboot::declared_error_details(&error).unwrap().unwrap();
    assert_eq!(rich.code, tonic::Code::Aborted as i32);
    assert_eq!(rich.details.len(), 1);
    assert_eq!(
        rich.details[0].type_url,
        format!("type.googleapis.com/rbt.v1alpha1.{name}")
    );
    rich.details.into_iter().next().unwrap()
}
#[tokio::test]
#[ignore = "requires running native app; public anonymous transport only"]
async fn native_public_contract() {
    let endpoint = std::env::var("RBT_RUST_URL").unwrap();
    let base = Uuid::parse_str(&std::env::var("RBT_TEST_CONSTRUCTOR_KEY_BASE").unwrap()).unwrap();
    let key = |n| Uuid::from_u128(base.as_u128() + n);
    let context = |id| {
        ExternalContext::new(
            reboot::state_ref::StateRef::from_id("hello_constructors.v1.Hello", id)
                .unwrap()
                .to_string(),
        )
    };
    let c = context("native-feature");
    let channel = c.connect(endpoint).await.unwrap();
    let mut client = generated::HelloMethodsExternalClient::new(channel.clone(), c);
    // This branch is only run against the fresh retained volume, before feature writes.
    if std::env::var_os("HELLO_NATIVE_FRESH").is_some() {
        let e = client
            .messages(proto::MessagesRequest {})
            .await
            .unwrap_err();
        let d = detail(e, "StateNotConstructed");
        assert!(
            reboot::database_proto::StateNotConstructed::decode(d.value.as_slice())
                .unwrap()
                .requires_constructor
        );
        let e = client
            .send_with_key(
                proto::SendRequest {
                    message: "must not create".into(),
                },
                key(90),
            )
            .await
            .unwrap_err();
        let d = detail(e, "StateNotConstructed");
        assert!(
            reboot::database_proto::StateNotConstructed::decode(d.value.as_slice())
                .unwrap()
                .requires_constructor
        );
    }
    let create = proto::CreateRequest {
        initial_message: "first message".into(),
    };
    client
        .create_with_key(create.clone(), key(1))
        .await
        .unwrap();
    client.create_with_key(create, key(1)).await.unwrap();
    let e = client
        .create_with_key(
            proto::CreateRequest {
                initial_message: "do not reset".into(),
            },
            key(91),
        )
        .await
        .unwrap_err();
    let d = detail(e, "StateAlreadyConstructed");
    reboot::database_proto::StateAlreadyConstructed::decode(d.value.as_slice()).unwrap();
    let values = [
        "second message",
        "",
        "雪 🦀",
        "  whitespace\n",
        "duplicate",
        "duplicate",
    ];
    for (i, value) in values.iter().enumerate() {
        let r = proto::SendRequest {
            message: (*value).into(),
        };
        client
            .send_with_key(r.clone(), key(2 + i as u128))
            .await
            .unwrap();
        client.send_with_key(r, key(2 + i as u128)).await.unwrap();
    }
    // Replay after unrelated writes and after full engine restarts.
    client
        .send_with_key(
            proto::SendRequest {
                message: values[0].into(),
            },
            key(2),
        )
        .await
        .unwrap();
    let mut expected = vec!["first message"];
    expected.extend(values);
    assert_eq!(
        client
            .messages(proto::MessagesRequest {})
            .await
            .unwrap()
            .into_inner()
            .messages,
        expected
    );
    let mut initialized =
        generated::HelloMethodsExternalClient::new(channel, context("reboot-hello"));
    assert_eq!(
        initialized
            .messages(proto::MessagesRequest {})
            .await
            .unwrap()
            .into_inner()
            .messages,
        INITIAL_MESSAGES
    );
    println!(
        "NATIVE_PUBLIC_CONTRACT accepted exact fidelity, anonymous RPCs, typed errors and replay"
    );
}
