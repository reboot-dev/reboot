use std::{
    net::{IpAddr, Ipv4Addr, SocketAddr, TcpListener},
    sync::{Arc, Mutex},
    time::Duration,
};

use reboot_rust_schema::{
    RebootHeaders,
    application_host::{
        ApplicationHost, ApplicationHostError, ApplicationLifecycle, ApplicationLifecyclePhase,
        TrustedApplicationContext,
    },
    proto,
};

const APPLICATION_ID_HEADER: &str = "x-reboot-application-id";
const STATE_REF_HEADER: &str = "x-reboot-state-ref";
use tonic::{Request, Response, Status};

struct IdentityEcho;

#[tonic::async_trait]
impl proto::echo_methods_server::EchoMethods for IdentityEcho {
    async fn reply(&self, request: Request<proto::Text>) -> Result<Response<proto::Text>, Status> {
        let application = TrustedApplicationContext::from_request(&request)
            .ok_or_else(|| Status::internal("trusted application context missing"))?;
        let headers = RebootHeaders::from_request(&request)
            .map_err(|error| Status::internal(error.to_string()))?;
        if headers.application_id.as_deref() != Some(application.application_id()) {
            return Err(Status::internal(
                "trusted headers lost application identity",
            ));
        }
        let visible_spoof = request.metadata().get(APPLICATION_ID_HEADER).is_some();
        Ok(Response::new(proto::Text {
            content: format!(
                "{};spoof-visible={visible_spoof}",
                application.application_id()
            ),
        }))
    }

    async fn last_message(
        &self,
        _: Request<proto::Empty>,
    ) -> Result<Response<proto::Text>, Status> {
        Err(Status::unimplemented(
            "unused in application-host acceptance",
        ))
    }
}

struct IdentityCounter;

#[tonic::async_trait]
impl proto::counter_writes_methods_server::CounterWritesMethods for IdentityCounter {
    async fn increment(
        &self,
        request: Request<proto::IncrementRequest>,
    ) -> Result<Response<proto::CounterValue>, Status> {
        let application = TrustedApplicationContext::from_request(&request)
            .ok_or_else(|| Status::internal("trusted application context missing"))?;
        if application.application_id() != "server-owned-app" {
            return Err(Status::internal("wrong application identity"));
        }
        Ok(Response::new(proto::CounterValue {
            value: request.into_inner().amount,
        }))
    }
}

fn unused_local_address() -> SocketAddr {
    let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).unwrap();
    let address = listener.local_addr().unwrap();
    drop(listener);
    SocketAddr::new(IpAddr::V4(Ipv4Addr::LOCALHOST), address.port())
}

struct RecordedLifecycle {
    name: &'static str,
    trace: Arc<Mutex<Vec<String>>>,
    fail_recovery: bool,
    ready: Mutex<Option<tokio::sync::oneshot::Sender<()>>>,
}

#[tonic::async_trait]
impl ApplicationLifecycle for RecordedLifecycle {
    async fn initialize(&self) -> Result<(), Status> {
        self.trace
            .lock()
            .unwrap()
            .push(format!("initialize:{}", self.name));
        Ok(())
    }

    async fn recover(&self) -> Result<(), Status> {
        self.trace
            .lock()
            .unwrap()
            .push(format!("recover:{}", self.name));
        if self.fail_recovery {
            return Err(Status::failed_precondition("recovery failed"));
        }
        if let Some(ready) = self.ready.lock().unwrap().take() {
            ready.send(()).unwrap();
        }
        Ok(())
    }

    async fn shutdown(&self) -> Result<(), Status> {
        self.trace
            .lock()
            .unwrap()
            .push(format!("shutdown:{}", self.name));
        Ok(())
    }
}

fn lifecycle(
    name: &'static str,
    trace: Arc<Mutex<Vec<String>>>,
    fail_recovery: bool,
    ready: Option<tokio::sync::oneshot::Sender<()>>,
) -> RecordedLifecycle {
    RecordedLifecycle {
        name,
        trace,
        fail_recovery,
        ready: Mutex::new(ready),
    }
}

#[tokio::test]
async fn lifecycle_recovers_before_two_generated_services_listen_then_shuts_down_gracefully() {
    let address = unused_local_address();
    let trace = Arc::new(Mutex::new(Vec::new()));
    let (ready_tx, ready_rx) = tokio::sync::oneshot::channel();
    let (shutdown_tx, shutdown_rx) = tokio::sync::oneshot::channel();
    let host = ApplicationHost::new("server-owned-app")
        .with_lifecycle(lifecycle("first", trace.clone(), false, None))
        .with_lifecycle(lifecycle("second", trace.clone(), false, Some(ready_tx)))
        .add_service(proto::echo_methods_server::EchoMethodsServer::new(
            IdentityEcho,
        ))
        .add_service(
            proto::counter_writes_methods_server::CounterWritesMethodsServer::new(IdentityCounter),
        );
    assert_eq!(host.application_id(), "server-owned-app");

    let server = tokio::spawn(async move {
        host.serve_with_shutdown(address, async move { shutdown_rx.await.unwrap() })
            .await
            .unwrap()
    });
    ready_rx.await.unwrap();
    let endpoint = format!("http://{address}");

    let mut echo = proto::echo_methods_client::EchoMethodsClient::connect(endpoint.clone())
        .await
        .unwrap();
    let mut spoofed = Request::new(proto::Text {
        content: "ignored".into(),
    });
    spoofed.metadata_mut().insert(
        APPLICATION_ID_HEADER,
        "caller-selected-app".parse().unwrap(),
    );
    spoofed
        .metadata_mut()
        .insert(STATE_REF_HEADER, "example/identity".parse().unwrap());
    let echoed = echo.reply(spoofed).await.unwrap().into_inner();
    assert_eq!(echoed.content, "server-owned-app;spoof-visible=false");

    let mut counter =
        proto::counter_writes_methods_client::CounterWritesMethodsClient::connect(endpoint)
            .await
            .unwrap();
    assert_eq!(
        counter
            .increment(proto::IncrementRequest { amount: 7 })
            .await
            .unwrap()
            .into_inner()
            .value,
        7
    );

    shutdown_tx.send(()).unwrap();
    server.await.unwrap();
    assert_eq!(
        trace.lock().unwrap().as_slice(),
        [
            "initialize:first",
            "initialize:second",
            "recover:first",
            "recover:second",
            "shutdown:first",
            "shutdown:second",
        ]
    );
}

#[tokio::test]
async fn recovery_failure_closes_initialized_components_without_opening_a_listener() {
    let address = unused_local_address();
    let trace = Arc::new(Mutex::new(Vec::new()));
    let result = ApplicationHost::new("server-owned-app")
        .with_lifecycle(lifecycle("first", trace.clone(), false, None))
        .with_lifecycle(lifecycle("broken", trace.clone(), true, None))
        .add_service(proto::echo_methods_server::EchoMethodsServer::new(
            IdentityEcho,
        ))
        .serve(address)
        .await;

    assert!(matches!(
        result,
        Err(ApplicationHostError::Lifecycle {
            phase: ApplicationLifecyclePhase::Recover,
            component: 1,
            ..
        })
    ));
    assert!(std::net::TcpStream::connect_timeout(&address, Duration::from_millis(50)).is_err());
    assert_eq!(
        trace.lock().unwrap().as_slice(),
        [
            "initialize:first",
            "initialize:broken",
            "recover:first",
            "recover:broken",
            "shutdown:first",
            "shutdown:broken",
        ]
    );
}
