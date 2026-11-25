//! Authored real-Tonic routing/trust/deadline tests; not runtime acceptance.
use std::{sync::Arc, time::Duration};

use reboot_rust_schema::{
    CallerId, RebootHeaders,
    application_host::TrustedApplicationIngress,
    legacy_grpc::{LegacyGrpcContext, LegacyGrpcDirectory},
    proto,
};
use tokio::sync::mpsc;
use tonic::{Code, Request, Response, Status};

const ECHO: &str = "tests.reboot.protoc.EchoMethods";
const HEALTH: &str = "grpc.health.v1.Health";

struct CaptureEcho {
    requests: mpsc::UnboundedSender<Request<proto::Empty>>,
}

#[tonic::async_trait]
impl proto::echo_methods_server::EchoMethods for CaptureEcho {
    async fn reply(&self, request: Request<proto::Text>) -> Result<Response<proto::Text>, Status> {
        Ok(Response::new(request.into_inner()))
    }

    async fn last_message(
        &self,
        request: Request<proto::Empty>,
    ) -> Result<Response<proto::Text>, Status> {
        self.requests
            .send(request)
            .map_err(|_| Status::cancelled("test receiver gone"))?;
        Ok(Response::new(proto::Text {
            content: "echo endpoint".into(),
        }))
    }
}

// Dropping test state also stops the listener when assertions panic.
struct Server(tokio::task::JoinHandle<()>);
impl Drop for Server {
    fn drop(&mut self) {
        self.0.abort();
    }
}

async fn echo_server() -> (
    String,
    mpsc::UnboundedReceiver<Request<proto::Empty>>,
    Server,
) {
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let url = format!("http://{}", listener.local_addr().unwrap());
    let (requests, receiver) = mpsc::unbounded_channel();
    let server = tokio::spawn(async move {
        tonic::transport::Server::builder()
            .layer(TrustedApplicationIngress::new("cloud".into()))
            .add_service(proto::echo_methods_server::EchoMethodsServer::new(
                CaptureEcho { requests },
            ))
            .serve_with_incoming(tokio_stream::wrappers::TcpListenerStream::new(listener))
            .await
            .unwrap();
    });
    (url, receiver, Server(server))
}

async fn health_server() -> (String, Server) {
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let url = format!("http://{}", listener.local_addr().unwrap());
    let (mut reporter, service) = tonic_health::server::health_reporter();
    reporter
        .set_service_status("directory-test", tonic_health::ServingStatus::Serving)
        .await;
    let server = tokio::spawn(async move {
        // Keep the reporter alive for the server's lifetime.
        let _reporter = reporter;
        tonic::transport::Server::builder()
            .add_service(service)
            .serve_with_incoming(tokio_stream::wrappers::TcpListenerStream::new(listener))
            .await
            .unwrap();
    });
    (url, Server(server))
}

async fn capture(
    directory: &LegacyGrpcDirectory,
    receiver: &mut mpsc::UnboundedReceiver<Request<proto::Empty>>,
    request: Request<proto::Empty>,
) -> Request<proto::Empty> {
    let channel = tokio::time::timeout(Duration::from_secs(3), directory.channel(ECHO))
        .await
        .unwrap()
        .unwrap();
    let mut client = proto::echo_methods_client::EchoMethodsClient::new(channel);
    let response = tokio::time::timeout(Duration::from_secs(3), client.last_message(request))
        .await
        .unwrap()
        .unwrap();
    assert_eq!(response.into_inner().content, "echo endpoint");
    tokio::time::timeout(Duration::from_secs(3), receiver.recv())
        .await
        .unwrap()
        .unwrap()
}

#[test]
fn exact_directory_validation_and_method_resolution() {
    let directory = LegacyGrpcDirectory::new([
        (ECHO, "http://127.0.0.1:18001"),
        (HEALTH, "http://127.0.0.1:18002"),
    ])
    .unwrap();
    assert_eq!(
        directory
            .endpoint_for_method(&format!("/{ECHO}/LastMessage"))
            .unwrap()
            .as_str(),
        "http://127.0.0.1:18001"
    );
    assert_eq!(
        directory
            .endpoint_for_method(&format!("/{HEALTH}/Check"))
            .unwrap()
            .as_str(),
        "http://127.0.0.1:18002"
    );
    assert_eq!(
        directory
            .endpoint("grpc.health.v1.health")
            .unwrap_err()
            .code(),
        Code::NotFound
    );
    assert_eq!(
        directory.endpoint("grpc.health.v1").unwrap_err().code(),
        Code::NotFound
    );
    for method in [
        "grpc.health.v1.Health/Check",
        "/grpc.health.v1.Health/",
        "/grpc.health.v1.Health/Check/extra",
        "/grpc.health.v1.Health/Check?x=1",
        "//Check",
    ] {
        assert_eq!(
            directory.endpoint_for_method(method).unwrap_err().code(),
            Code::InvalidArgument
        );
    }
    for service in ["", "a..B", ".B", "a.B.", " a.B", "a/B", "9Bad", "a.B*"] {
        assert!(LegacyGrpcDirectory::new([(service, "http://127.0.0.1:1")]).is_err());
    }
    for url in [
        "127.0.0.1:1",
        "http://127.0.0.1:1/",
        "http://127.0.0.1:1?x=1",
        "ftp://localhost",
    ] {
        assert!(LegacyGrpcDirectory::new([(ECHO, url)]).is_err());
    }
    assert!(
        LegacyGrpcDirectory::new([(ECHO, "http://127.0.0.1:1"), (ECHO, "http://127.0.0.1:2")])
            .is_err()
    );
}

#[test]
fn caller_metadata_cannot_construct_trusted_context() {
    let mut headers = RebootHeaders::new("untrusted state");
    headers.application_id = Some("cloud".into());
    headers.caller_id = Some(CallerId::new("cloud", None).unwrap());
    headers.internal_call = true;
    let mut request = Request::new(());
    *request.metadata_mut() = headers.to_metadata().unwrap();
    assert_eq!(
        LegacyGrpcContext::from_request(&request, Arc::new(LegacyGrpcDirectory::default()))
            .unwrap_err()
            .code(),
        Code::PermissionDenied
    );
}

#[tokio::test]
async fn real_tonic_routes_distinct_services_and_trust_is_host_owned() {
    let (echo_url, mut receiver, _echo) = echo_server().await;
    let (health_url, _health) = health_server().await;
    let directory =
        Arc::new(LegacyGrpcDirectory::new([(ECHO, echo_url), (HEALTH, health_url)]).unwrap());
    let mut headers = RebootHeaders::new("forged actor");
    headers.application_id = Some("a1234567890".into());
    headers.caller_id = Some(CallerId::new("a1234567890", None).unwrap());
    headers.internal_call = true;
    headers.bearer_token = Some("inbound secret".into());
    headers.transaction_ids = Some(vec![uuid::Uuid::new_v4()]);
    headers.transaction_coordinator_state_type = Some("forged.Coordinator".into());
    headers.transaction_coordinator_state_ref = Some("forged coordinator".into());
    headers.idempotency_key = Some(uuid::Uuid::new_v4());
    let mut inbound = Request::new(proto::Empty {});
    *inbound.metadata_mut() = headers.to_metadata().unwrap();
    let inbound = capture(&directory, &mut receiver, inbound).await;
    let context = LegacyGrpcContext::from_request(&inbound, directory.clone()).unwrap();
    assert_eq!(context.application_id(), "cloud");
    let name = "Call into `RebootGreeter`";
    let external = context.external_context(name, "explicit actor");
    assert_eq!(external.name(), Some(name));
    let mut expected = RebootHeaders::new("explicit actor");
    expected.caller_id = Some(CallerId::new("cloud", None).unwrap());
    assert_eq!(external.headers(), &expected);
    assert_eq!(
        external
            .reader(())
            .unwrap()
            .metadata()
            .clone()
            .into_headers(),
        expected.to_metadata().unwrap().into_headers()
    );
    // Name is not a synthetic metadata field; explicit credentials alone opt in.
    assert_eq!(
        external
            .clone()
            .with_bearer_token("outbound secret")
            .headers()
            .bearer_token
            .as_deref(),
        Some("outbound secret")
    );
    let raw = context.request(()).unwrap();
    assert!(raw.metadata().is_empty());
    assert_eq!(
        context
            .legacy_grpc_channel("unknown.Service")
            .await
            .unwrap_err()
            .code(),
        Code::NotFound
    );

    let channel = tokio::time::timeout(
        Duration::from_secs(3),
        context.legacy_grpc_channel_for_method("/grpc.health.v1.Health/Check"),
    )
    .await
    .unwrap()
    .unwrap();
    let mut client = tonic_health::pb::health_client::HealthClient::new(channel);
    let request = context
        .request(tonic_health::pb::HealthCheckRequest {
            service: "directory-test".into(),
        })
        .unwrap();
    let response = tokio::time::timeout(Duration::from_secs(3), client.check(request))
        .await
        .unwrap()
        .unwrap();
    assert_eq!(
        response.into_inner().status,
        tonic_health::pb::health_check_response::ServingStatus::Serving as i32
    );
    // The other service still reaches the Echo listener, not a default listener.
    let channel = context
        .legacy_grpc_channel_for_method(&format!("/{ECHO}/LastMessage"))
        .await
        .unwrap();
    let mut client = proto::echo_methods_client::EchoMethodsClient::new(channel);
    let response = tokio::time::timeout(
        Duration::from_secs(3),
        client.last_message(context.request(proto::Empty {}).unwrap()),
    )
    .await
    .unwrap()
    .unwrap();
    assert_eq!(response.into_inner().content, "echo endpoint");
}

#[tokio::test]
async fn deadlines_shrink_reject_malformed_and_never_reset_on_context_clone() {
    let (url, mut receiver, _server) = echo_server().await;
    let directory = Arc::new(LegacyGrpcDirectory::new([(ECHO, url)]).unwrap());
    let mut inbound = capture(&directory, &mut receiver, Request::new(proto::Empty {})).await;
    for timeout in ["invalid", "1X", "123456789n", "-1S", "S"] {
        inbound
            .metadata_mut()
            .insert("grpc-timeout", timeout.parse().unwrap());
        assert_eq!(
            LegacyGrpcContext::from_request(&inbound, directory.clone())
                .unwrap_err()
                .code(),
            Code::InvalidArgument
        );
    }
    for timeout in ["1H", "1M", "1S", "1m", "1u", "1n"] {
        inbound
            .metadata_mut()
            .insert("grpc-timeout", timeout.parse().unwrap());
        assert!(LegacyGrpcContext::from_request(&inbound, directory.clone()).is_ok());
    }
    inbound.set_timeout(Duration::from_millis(80));
    let context = LegacyGrpcContext::from_request(&inbound, directory.clone()).unwrap();
    let clone = context.clone();
    let initial = context.time_remaining().unwrap();
    tokio::time::sleep(Duration::from_millis(10)).await;
    assert!(clone.time_remaining().unwrap() < initial);
    let mut explicit = Request::new(());
    explicit.set_timeout(Duration::from_millis(1));
    clone.apply_deadline(&mut explicit).unwrap();
    let encoded = explicit
        .metadata()
        .get("grpc-timeout")
        .unwrap()
        .to_str()
        .unwrap();
    // Short explicit deadline is not replaced by the longer inbound deadline.
    assert!(encoded.ends_with('u') || encoded.ends_with('n'));
    tokio::time::sleep(Duration::from_millis(90)).await;
    assert_eq!(clone.time_remaining(), Some(Duration::ZERO));
    assert_eq!(
        clone.request(()).unwrap_err().code(),
        Code::DeadlineExceeded
    );
    assert_eq!(
        clone.legacy_grpc_channel(ECHO).await.unwrap_err().code(),
        Code::DeadlineExceeded
    );
    inbound
        .metadata_mut()
        .insert("grpc-timeout", "0n".parse().unwrap());
    let expired = LegacyGrpcContext::from_request(&inbound, directory).unwrap();
    assert_eq!(
        expired.request(()).unwrap_err().code(),
        Code::DeadlineExceeded
    );
}
