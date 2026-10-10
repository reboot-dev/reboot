use std::{
    future::Future,
    net::{IpAddr, Ipv4Addr, SocketAddr, TcpListener},
    pin::Pin,
    sync::{
        Arc, Mutex,
        atomic::{AtomicUsize, Ordering},
    },
    time::Duration,
};

use tokio::sync::mpsc;
use tonic_health::pb::{
    HealthCheckRequest, health_check_response::ServingStatus, health_client::HealthClient,
};
use tonic_reflection::pb::v1::{
    ServerReflectionRequest, server_reflection_client::ServerReflectionClient,
    server_reflection_request::MessageRequest, server_reflection_response::MessageResponse,
};

use reboot_rust_schema::{
    RBT_V1ALPHA1_DESCRIPTOR_SET, RebootHeaders,
    application_host::{
        ApplicationHost, ApplicationHostError, ApplicationLifecycle, ApplicationLifecyclePhase,
        HostRecovery, RecoveryCancellation, TrustedApplicationContext,
    },
    database_proto as database,
    durable_coordinator::CoordinatorSidecar,
    legacy_coordinator::DurableCoordinatorWatchHost,
    legacy_placement::PlanOnlyLegacyPlacement,
    placement_proto as placement, proto,
};

const APPLICATION_ID_HEADER: &str = "x-reboot-application-id";
const STATE_REF_HEADER: &str = "x-reboot-state-ref";
use tonic::{Request, Response, Status};

struct BlockingRecovery {
    started: Mutex<Option<tokio::sync::oneshot::Sender<()>>>,
    release: tokio::sync::Mutex<Option<tokio::sync::oneshot::Receiver<()>>>,
}

struct FailingRecoveryTask {
    started: Mutex<Option<tokio::sync::oneshot::Sender<()>>>,
}

struct DurableDecisionSidecar;
type SidecarFuture<'a, T> = Pin<Box<dyn Future<Output = Result<T, Status>> + Send + 'a>>;

impl CoordinatorSidecar for DurableDecisionSidecar {
    fn coordinator_prepare(
        &self,
        _: database::TransactionCoordinatorPrepareRequest,
    ) -> SidecarFuture<'_, database::TransactionCoordinatorPrepareResponse> {
        Box::pin(async { Err(Status::unimplemented("not used")) })
    }
    fn coordinator_prepared(
        &self,
        _: database::TransactionCoordinatorPreparedRequest,
    ) -> SidecarFuture<'_, database::TransactionCoordinatorPreparedResponse> {
        Box::pin(async { Err(Status::unimplemented("not used")) })
    }
    fn coordinator_cleanup(
        &self,
        _: database::TransactionCoordinatorCleanupRequest,
    ) -> SidecarFuture<'_, database::TransactionCoordinatorCleanupResponse> {
        Box::pin(async { Err(Status::unimplemented("not used")) })
    }
    fn recover(
        &self,
        _: database::RecoverRequest,
    ) -> SidecarFuture<'_, Vec<database::RecoverResponse>> {
        Box::pin(async { Err(Status::unimplemented("not used")) })
    }
    fn decision_get(
        &self,
        request: database::TransactionCoordinatorDecisionGetRequest,
    ) -> SidecarFuture<'_, database::TransactionCoordinatorDecisionGetResponse> {
        Box::pin(async move {
            if request.coordinator_state_ref != "coordinator/root" {
                return Err(Status::data_loss("wrong coordinator identity"));
            }
            Ok(database::TransactionCoordinatorDecisionGetResponse {
                decision: Some(database::TransactionCoordinatorDecision {
                    coordinator_state_ref: request.coordinator_state_ref,
                    outcome: database::transaction_coordinator_decision::Outcome::Abort as i32,
                    participants: None,
                }),
            })
        })
    }
}

#[tonic::async_trait]
impl HostRecovery for BlockingRecovery {
    async fn start(
        &self,
        _: &mut tokio::task::JoinSet<Result<(), Status>>,
        _: RecoveryCancellation,
    ) -> Result<(), Status> {
        self.started
            .lock()
            .unwrap()
            .take()
            .unwrap()
            .send(())
            .unwrap();
        self.release.lock().await.take().unwrap().await.unwrap();
        Ok(())
    }
}

#[tonic::async_trait]
impl HostRecovery for FailingRecoveryTask {
    async fn start(
        &self,
        supervisor: &mut tokio::task::JoinSet<Result<(), Status>>,
        _: RecoveryCancellation,
    ) -> Result<(), Status> {
        self.started
            .lock()
            .unwrap()
            .take()
            .unwrap()
            .send(())
            .unwrap();
        supervisor.spawn(async { Err(Status::aborted("recovered Watch failed")) });
        Ok(())
    }
}

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
async fn host_reflection_lists_only_mounted_services_and_resolves_their_symbols() {
    let address = unused_local_address();
    let (shutdown_tx, shutdown_rx) = tokio::sync::oneshot::channel();
    let host = ApplicationHost::new("server-owned-app")
        .with_reflection_descriptor_set(RBT_V1ALPHA1_DESCRIPTOR_SET)
        .add_service(proto::echo_methods_server::EchoMethodsServer::new(
            IdentityEcho,
        ));
    let server = tokio::spawn(async move {
        host.serve_with_shutdown(address, async move { shutdown_rx.await.unwrap() })
            .await
            .unwrap()
    });

    tokio::time::timeout(Duration::from_secs(1), async {
        loop {
            if std::net::TcpStream::connect_timeout(&address, Duration::from_millis(10)).is_ok() {
                break;
            }
            tokio::task::yield_now().await;
        }
    })
    .await
    .unwrap();
    let channel = tonic::transport::Endpoint::from_shared(format!("http://{address}"))
        .unwrap()
        .connect()
        .await
        .unwrap();
    let mut reflection = ServerReflectionClient::new(channel);
    let mut listed = reflection
        .server_reflection_info(Request::new(tokio_stream::once(ServerReflectionRequest {
            host: String::new(),
            message_request: Some(MessageRequest::ListServices(String::new())),
        })))
        .await
        .unwrap()
        .into_inner();
    let response = listed.message().await.unwrap().unwrap();
    let MessageResponse::ListServicesResponse(services) = response.message_response.unwrap() else {
        panic!("expected reflection service list");
    };
    let names = services
        .service
        .into_iter()
        .map(|service| service.name)
        .collect::<std::collections::BTreeSet<_>>();
    assert_eq!(
        names,
        std::collections::BTreeSet::from([
            "grpc.reflection.v1.ServerReflection".to_owned(),
            "tests.reboot.protoc.EchoMethods".to_owned(),
        ])
    );

    let mut symbols = reflection
        .server_reflection_info(Request::new(tokio_stream::once(ServerReflectionRequest {
            host: String::new(),
            message_request: Some(MessageRequest::FileContainingSymbol(
                "tests.reboot.protoc.EchoMethods".to_owned(),
            )),
        })))
        .await
        .unwrap()
        .into_inner();
    let response = symbols.message().await.unwrap().unwrap();
    let MessageResponse::FileDescriptorResponse(descriptors) = response.message_response.unwrap()
    else {
        panic!("expected descriptor for mounted service");
    };
    assert!(!descriptors.file_descriptor_proto.is_empty());

    shutdown_tx.send(()).unwrap();
    server.await.unwrap();
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

#[tokio::test]
async fn public_ingress_is_unavailable_until_host_recovery_succeeds() {
    let address = unused_local_address();
    let (started_tx, started_rx) = tokio::sync::oneshot::channel();
    let (release_tx, release_rx) = tokio::sync::oneshot::channel();
    let (shutdown_tx, shutdown_rx) = tokio::sync::oneshot::channel();
    let host = ApplicationHost::new("server-owned-app")
        .with_host_recovery(BlockingRecovery {
            started: Mutex::new(Some(started_tx)),
            release: tokio::sync::Mutex::new(Some(release_rx)),
        })
        .add_public_service(proto::echo_methods_server::EchoMethodsServer::new(
            IdentityEcho,
        ));
    let server = tokio::spawn(async move {
        host.serve_with_shutdown(address, async move { shutdown_rx.await.unwrap() })
            .await
            .unwrap()
    });
    started_rx.await.unwrap();
    let endpoint = format!("http://{address}");
    let mut health = HealthClient::new(
        tonic::transport::Endpoint::from_shared(endpoint.clone())
            .unwrap()
            .connect()
            .await
            .unwrap(),
    );
    assert_eq!(
        health
            .check(HealthCheckRequest {
                service: String::new()
            })
            .await
            .unwrap()
            .into_inner()
            .status,
        ServingStatus::NotServing as i32
    );
    // Python ignores the requested service and reports host readiness, rather
    // than making generated service names part of health/placement discovery.
    assert_eq!(
        health
            .check(HealthCheckRequest {
                service: "not-a-registered-service".into(),
            })
            .await
            .unwrap()
            .into_inner()
            .status,
        ServingStatus::NotServing as i32
    );
    let mut health_watch = health
        .watch(HealthCheckRequest {
            service: "host-wide".into(),
        })
        .await
        .unwrap()
        .into_inner();
    assert_eq!(
        health_watch.message().await.unwrap().unwrap().status,
        ServingStatus::NotServing as i32
    );
    let mut client = proto::echo_methods_client::EchoMethodsClient::connect(endpoint)
        .await
        .unwrap();
    assert_eq!(
        client
            .reply(proto::Text {
                content: "held".into()
            })
            .await
            .unwrap_err()
            .code(),
        tonic::Code::Unavailable
    );
    release_tx.send(()).unwrap();
    tokio::time::sleep(Duration::from_millis(10)).await;
    assert_eq!(
        health
            .check(HealthCheckRequest {
                service: String::new()
            })
            .await
            .unwrap()
            .into_inner()
            .status,
        ServingStatus::Serving as i32
    );
    assert_eq!(
        tokio::time::timeout(Duration::from_secs(2), health_watch.message())
            .await
            .unwrap()
            .unwrap()
            .unwrap()
            .status,
        ServingStatus::Serving as i32
    );
    let mut open = Request::new(proto::Text {
        content: "open".into(),
    });
    open.metadata_mut()
        .insert(STATE_REF_HEADER, "example/identity".parse().unwrap());
    assert_eq!(
        client.reply(open).await.unwrap().into_inner().content,
        "server-owned-app;spoof-visible=false"
    );
    shutdown_tx.send(()).unwrap();
    assert_eq!(
        tokio::time::timeout(Duration::from_secs(2), health_watch.message())
            .await
            .unwrap()
            .unwrap()
            .unwrap()
            .status,
        ServingStatus::NotServing as i32
    );
    assert!(health_watch.message().await.unwrap().is_none());
    tokio::time::timeout(Duration::from_secs(2), server)
        .await
        .unwrap()
        .unwrap();
}

#[tokio::test]
async fn supervised_recovery_task_failure_closes_the_host() {
    let address = unused_local_address();
    let (started_tx, started_rx) = tokio::sync::oneshot::channel();
    let host = ApplicationHost::new("server-owned-app")
        .with_host_recovery(FailingRecoveryTask {
            started: Mutex::new(Some(started_tx)),
        })
        .add_public_service(proto::echo_methods_server::EchoMethodsServer::new(
            IdentityEcho,
        ));
    let server = tokio::spawn(async move { host.serve(address).await });
    started_rx.await.unwrap();
    let result = server.await.unwrap();
    match result {
        Err(ApplicationHostError::RecoveryTask(status)) => {
            assert_eq!(status.code(), tonic::Code::Aborted);
        }
        other => panic!("expected supervised recovery task failure, got {other:?}"),
    }
    assert!(std::net::TcpStream::connect_timeout(&address, Duration::from_millis(50)).is_err());
}

#[tokio::test]
async fn legacy_coordinator_watch_is_reachable_while_public_ingress_is_gated() {
    let address = unused_local_address();
    let (started_tx, started_rx) = tokio::sync::oneshot::channel();
    let (release_tx, release_rx) = tokio::sync::oneshot::channel();
    let (shutdown_tx, shutdown_rx) = tokio::sync::oneshot::channel();
    let placement = PlanOnlyLegacyPlacement::new();
    let coordinator = DurableCoordinatorWatchHost::new(
        Arc::new(DurableDecisionSidecar),
        "tests.Counter",
        "coordinator/root",
    )
    .unwrap();
    let host = ApplicationHost::new("server-owned-app")
        .with_legacy_placement_readiness(placement)
        .with_host_recovery(BlockingRecovery {
            started: Mutex::new(Some(started_tx)),
            release: tokio::sync::Mutex::new(Some(release_rx)),
        })
        .add_legacy_control_service(database::coordinator_server::CoordinatorServer::new(
            coordinator,
        ))
        .add_public_service(proto::echo_methods_server::EchoMethodsServer::new(
            IdentityEcho,
        ));
    let server = tokio::spawn(async move {
        host.serve_with_shutdown(address, async move { shutdown_rx.await.unwrap() })
            .await
            .unwrap()
    });
    started_rx.await.unwrap();
    let endpoint = format!("http://{address}");
    let mut control = database::coordinator_client::CoordinatorClient::connect(endpoint.clone())
        .await
        .unwrap();
    let watched = control
        .watch(database::WatchRequest {
            transaction_id: uuid::Uuid::nil().as_bytes().to_vec(),
            state_type: "tests.Counter".into(),
            state_ref: "counter/1".into(),
        })
        .await
        .unwrap()
        .into_inner();
    assert!(watched.aborted);

    let mut public = proto::echo_methods_client::EchoMethodsClient::connect(endpoint)
        .await
        .unwrap();
    assert_eq!(
        public
            .reply(proto::Text {
                content: "held".into()
            })
            .await
            .unwrap_err()
            .code(),
        tonic::Code::Unavailable
    );
    release_tx.send(()).unwrap();
    shutdown_tx.send(()).unwrap();
    server.await.unwrap();
}

fn planner_snapshot(version: i64, service_name: &str) -> placement::ListenForPlanResponse {
    placement::ListenForPlanResponse {
        plan: Some(placement::Plan {
            version,
            applications: vec![placement::plan::Application {
                id: "server-owned-app".into(),
                services: vec![placement::plan::application::Service {
                    full_name: service_name.into(),
                    state_type_full_name: String::new(),
                }],
                shards: vec![placement::plan::application::Shard {
                    id: "root".into(),
                    range: Some(placement::plan::application::shard::KeyRange {
                        first_key: vec![],
                    }),
                    server_id: "server".into(),
                    replica_index: 0,
                }],
            }],
        }),
        servers: vec![placement::Server {
            id: "server".into(),
            application_id: "server-owned-app".into(),
            revision_number: 0,
            address: Some(placement::server::Address {
                host: "127.0.0.1".into(),
                port: 5001,
            }),
            namespace: String::new(),
            file_descriptor_set: None,
            reboot_version: String::new(),
        }],
    }
}

#[tokio::test]
async fn placement_readiness_waits_for_a_valid_newer_plan_declaring_public_service() {
    let address = unused_local_address();
    let placement = PlanOnlyLegacyPlacement::new();
    let (started_tx, started_rx) = tokio::sync::oneshot::channel();
    let (release_tx, release_rx) = tokio::sync::oneshot::channel();
    let (shutdown_tx, shutdown_rx) = tokio::sync::oneshot::channel();
    let host = ApplicationHost::new("server-owned-app")
        .with_legacy_placement_readiness(placement.clone())
        .with_host_recovery(BlockingRecovery {
            started: Mutex::new(Some(started_tx)),
            release: tokio::sync::Mutex::new(Some(release_rx)),
        })
        // A generic public service cannot escape placement completeness by
        // being passed through the convenience control-route builder.
        .add_legacy_control_service(proto::echo_methods_server::EchoMethodsServer::new(
            IdentityEcho,
        ));
    let server = tokio::spawn(async move {
        host.serve_with_shutdown(address, async move { shutdown_rx.await.unwrap() })
            .await
            .unwrap()
    });
    started_rx.await.unwrap();
    let mut client =
        proto::echo_methods_client::EchoMethodsClient::connect(format!("http://{address}"))
            .await
            .unwrap();
    assert_eq!(
        client
            .reply(proto::Text {
                content: "recovering".into()
            })
            .await
            .unwrap_err()
            .code(),
        tonic::Code::Unavailable
    );
    release_tx.send(()).unwrap();
    tokio::task::yield_now().await;
    assert_eq!(
        client
            .reply(proto::Text {
                content: "no plan".into()
            })
            .await
            .unwrap_err()
            .code(),
        tonic::Code::Unavailable
    );

    let mut invalid = planner_snapshot(1, "tests.reboot.protoc.EchoMethods");
    invalid.plan.as_mut().unwrap().applications[0].shards[0].range = None;
    assert_eq!(
        placement.install(invalid).unwrap_err().code(),
        tonic::Code::InvalidArgument
    );
    assert_eq!(
        client
            .reply(proto::Text {
                content: "invalid".into()
            })
            .await
            .unwrap_err()
            .code(),
        tonic::Code::Unavailable
    );

    placement
        .install(planner_snapshot(2, "other.Service"))
        .unwrap();
    tokio::task::yield_now().await;
    assert_eq!(
        client
            .reply(proto::Text {
                content: "missing".into()
            })
            .await
            .unwrap_err()
            .code(),
        tonic::Code::Unavailable
    );
    assert_eq!(
        placement
            .install(planner_snapshot(2, "tests.reboot.protoc.EchoMethods"))
            .unwrap_err()
            .code(),
        tonic::Code::FailedPrecondition
    );
    assert_eq!(
        client
            .reply(proto::Text {
                content: "stale".into()
            })
            .await
            .unwrap_err()
            .code(),
        tonic::Code::Unavailable
    );

    placement
        .install(planner_snapshot(3, "tests.reboot.protoc.EchoMethods"))
        .unwrap();
    let response = tokio::time::timeout(Duration::from_secs(1), async {
        loop {
            let mut request = Request::new(proto::Text {
                content: "ready".into(),
            });
            request
                .metadata_mut()
                .insert(STATE_REF_HEADER, "example/identity".parse().unwrap());
            if let Ok(response) = client.reply(request).await {
                break response;
            }
            tokio::task::yield_now().await;
        }
    })
    .await
    .unwrap();
    assert_eq!(
        response.into_inner().content,
        "server-owned-app;spoof-visible=false"
    );
    shutdown_tx.send(()).unwrap();
    server.await.unwrap();
}

#[derive(Clone)]
struct ScriptedPlacementPlanner {
    state: Arc<ScriptedPlacementPlannerState>,
}

struct ScriptedPlacementPlannerState {
    sessions:
        Mutex<std::collections::VecDeque<Vec<Result<placement::ListenForPlanResponse, Status>>>>,
    connections: AtomicUsize,
    // Keep an intentionally idle stream alive after the scripted responses.
    held_streams: Mutex<Vec<mpsc::Sender<Result<placement::ListenForPlanResponse, Status>>>>,
}

impl ScriptedPlacementPlanner {
    fn new(sessions: Vec<Vec<Result<placement::ListenForPlanResponse, Status>>>) -> Self {
        Self {
            state: Arc::new(ScriptedPlacementPlannerState {
                sessions: Mutex::new(sessions.into()),
                connections: AtomicUsize::new(0),
                held_streams: Mutex::new(Vec::new()),
            }),
        }
    }

    async fn wait_for_connections(&self, expected: usize) {
        tokio::time::timeout(Duration::from_secs(1), async {
            while self.state.connections.load(Ordering::SeqCst) < expected {
                tokio::task::yield_now().await;
            }
        })
        .await
        .unwrap();
    }
}

#[tonic::async_trait]
impl placement::placement_planner_server::PlacementPlanner for ScriptedPlacementPlanner {
    type ListenForPlanStream = Pin<
        Box<
            dyn tokio_stream::Stream<Item = Result<placement::ListenForPlanResponse, Status>>
                + Send
                + 'static,
        >,
    >;

    async fn listen_for_plan(
        &self,
        _: Request<placement::ListenForPlanRequest>,
    ) -> Result<Response<Self::ListenForPlanStream>, Status> {
        self.state.connections.fetch_add(1, Ordering::SeqCst);
        let session = self
            .state
            .sessions
            .lock()
            .unwrap()
            .pop_front()
            .unwrap_or_default();
        let (sender, receiver) = mpsc::channel(8);
        if session.is_empty() {
            self.state.held_streams.lock().unwrap().push(sender);
        } else {
            tokio::spawn(async move {
                for response in session {
                    if sender.send(response).await.is_err() {
                        break;
                    }
                }
            });
        }
        Ok(Response::new(Box::pin(
            tokio_stream::wrappers::ReceiverStream::new(receiver),
        )))
    }
}

async fn scripted_planner(
    planner: ScriptedPlacementPlanner,
) -> (
    SocketAddr,
    tokio::task::JoinHandle<Result<(), tonic::transport::Error>>,
) {
    let listener = tokio::net::TcpListener::bind((Ipv4Addr::LOCALHOST, 0))
        .await
        .unwrap();
    let address = listener.local_addr().unwrap();
    let incoming = tokio_stream::wrappers::TcpListenerStream::new(listener);
    let server = tokio::spawn(async move {
        tonic::transport::Server::builder()
            .add_service(placement::placement_planner_server::PlacementPlannerServer::new(planner))
            .serve_with_incoming(incoming)
            .await
    });
    (address, server)
}

async fn wait_for_echo_ready(
    client: &mut proto::echo_methods_client::EchoMethodsClient<tonic::transport::Channel>,
) {
    tokio::time::timeout(Duration::from_secs(1), async {
        loop {
            let mut request = Request::new(proto::Text {
                content: "ready".into(),
            });
            request
                .metadata_mut()
                .insert(STATE_REF_HEADER, "example/identity".parse().unwrap());
            if client.reply(request).await.is_ok() {
                return;
            }
            tokio::task::yield_now().await;
        }
    })
    .await
    .unwrap();
}

#[tokio::test]
async fn placement_planner_stream_installs_initial_plan_and_opens_host_ingress() {
    let planner = ScriptedPlacementPlanner::new(vec![vec![Ok(planner_snapshot(
        1,
        "tests.reboot.protoc.EchoMethods",
    ))]]);
    let (planner_address, planner_server) = scripted_planner(planner.clone()).await;
    let address = unused_local_address();
    let placement = PlanOnlyLegacyPlacement::new();
    let (shutdown_tx, shutdown_rx) = tokio::sync::oneshot::channel();
    let recovery = reboot_rust_schema::application_host::PlacementPlannerRecovery::new(
        format!("http://{planner_address}"),
        placement.clone(),
    )
    .unwrap();
    let host = ApplicationHost::new("server-owned-app")
        .with_legacy_placement_readiness(placement.clone())
        .with_host_recovery(recovery)
        .add_public_service(proto::echo_methods_server::EchoMethodsServer::new(
            IdentityEcho,
        ));
    let server = tokio::spawn(async move {
        host.serve_with_shutdown(address, async move { shutdown_rx.await.unwrap() })
            .await
    });

    planner.wait_for_connections(1).await;
    let mut client =
        proto::echo_methods_client::EchoMethodsClient::connect(format!("http://{address}"))
            .await
            .unwrap();
    wait_for_echo_ready(&mut client).await;
    assert_eq!(placement.snapshot().unwrap().version(), 1);

    shutdown_tx.send(()).unwrap();
    assert!(server.await.unwrap().is_ok());
    planner_server.abort();
}

#[tokio::test]
async fn placement_planner_reconnects_unavailable_and_retains_last_good_snapshot() {
    let mut invalid = planner_snapshot(2, "tests.reboot.protoc.EchoMethods");
    invalid.plan.as_mut().unwrap().applications[0].shards[0].range = None;
    let planner = ScriptedPlacementPlanner::new(vec![
        vec![
            Ok(planner_snapshot(1, "tests.reboot.protoc.EchoMethods")),
            Ok(invalid),
            Err(Status::unavailable("planner restarting")),
        ],
        vec![],
    ]);
    let (planner_address, planner_server) = scripted_planner(planner.clone()).await;
    let address = unused_local_address();
    let placement = PlanOnlyLegacyPlacement::new();
    let (shutdown_tx, shutdown_rx) = tokio::sync::oneshot::channel();
    let recovery = reboot_rust_schema::application_host::PlacementPlannerRecovery::new(
        format!("http://{planner_address}"),
        placement.clone(),
    )
    .unwrap()
    .with_reconnect_backoff(Duration::from_millis(1), Duration::from_millis(5))
    .unwrap();
    let host = ApplicationHost::new("server-owned-app")
        .with_legacy_placement_readiness(placement.clone())
        .with_host_recovery(recovery)
        .add_public_service(proto::echo_methods_server::EchoMethodsServer::new(
            IdentityEcho,
        ));
    let server = tokio::spawn(async move {
        host.serve_with_shutdown(address, async move { shutdown_rx.await.unwrap() })
            .await
    });

    planner.wait_for_connections(2).await;
    assert_eq!(placement.snapshot().unwrap().version(), 1);
    let mut client =
        proto::echo_methods_client::EchoMethodsClient::connect(format!("http://{address}"))
            .await
            .unwrap();
    wait_for_echo_ready(&mut client).await;

    shutdown_tx.send(()).unwrap();
    assert!(server.await.unwrap().is_ok());
    planner_server.abort();
}

#[tokio::test]
async fn fatal_placement_planner_status_is_supervised_and_closes_host() {
    let planner = ScriptedPlacementPlanner::new(vec![vec![Err(Status::permission_denied(
        "planner rejected host",
    ))]]);
    let (planner_address, planner_server) = scripted_planner(planner.clone()).await;
    let address = unused_local_address();
    let recovery = reboot_rust_schema::application_host::PlacementPlannerRecovery::new(
        format!("http://{planner_address}"),
        PlanOnlyLegacyPlacement::new(),
    )
    .unwrap();
    let host = ApplicationHost::new("server-owned-app")
        .with_host_recovery(recovery)
        .add_public_service(proto::echo_methods_server::EchoMethodsServer::new(
            IdentityEcho,
        ));
    let server = tokio::spawn(async move { host.serve(address).await });

    planner.wait_for_connections(1).await;
    match server.await.unwrap() {
        Err(ApplicationHostError::Lifecycle {
            phase: ApplicationLifecyclePhase::Recover,
            component: 0,
            source: status,
        }) => {
            assert_eq!(status.code(), tonic::Code::PermissionDenied);
        }
        other => panic!("expected fatal planner status to fail host, got {other:?}"),
    }
    assert_eq!(planner.state.connections.load(Ordering::SeqCst), 1);
    assert!(std::net::TcpStream::connect_timeout(&address, Duration::from_millis(50)).is_err());
    planner_server.abort();
}

struct ControlledStartupFailure {
    fail: tokio::sync::Mutex<Option<tokio::sync::oneshot::Receiver<()>>>,
}
#[tonic::async_trait]
impl HostRecovery for ControlledStartupFailure {
    async fn start(
        &self,
        supervisor: &mut tokio::task::JoinSet<Result<(), Status>>,
        _: RecoveryCancellation,
    ) -> Result<(), Status> {
        let fail = self.fail.lock().await.take().unwrap();
        supervisor.spawn(async move {
            fail.await.unwrap();
            Err(Status::aborted("earlier startup child failed"))
        });
        Ok(())
    }
}
#[tokio::test]
async fn recovery_child_failure_interrupts_later_stalled_start_and_cleans_host() {
    let address = unused_local_address();
    let trace = Arc::new(Mutex::new(Vec::new()));
    let dropped = Arc::new(AtomicUsize::new(0));
    let joined = Arc::new(AtomicUsize::new(0));
    let (fail_tx, fail_rx) = tokio::sync::oneshot::channel();
    let (started_tx, started_rx) = tokio::sync::oneshot::channel();
    let (later_tx, later_rx) = tokio::sync::oneshot::channel();
    let (_release_tx, release_rx) = tokio::sync::oneshot::channel();
    let host = ApplicationHost::new("server-owned-app")
        .with_lifecycle(lifecycle("startup-failure", trace.clone(), false, None))
        .with_host_recovery(ControlledStartupFailure {
            fail: tokio::sync::Mutex::new(Some(fail_rx)),
        })
        .with_host_recovery(StalledStartupRecovery {
            started: Mutex::new(Some(started_tx)),
            future_dropped: dropped.clone(),
            child_joined: joined.clone(),
        })
        .with_host_recovery(BlockingRecovery {
            started: Mutex::new(Some(later_tx)),
            release: tokio::sync::Mutex::new(Some(release_rx)),
        })
        .add_public_service(proto::echo_methods_server::EchoMethodsServer::new(
            IdentityEcho,
        ));
    let mut server = tokio::spawn(async move { host.serve(address).await });
    tokio::time::timeout(Duration::from_secs(2), started_rx)
        .await
        .unwrap()
        .unwrap();
    let mut client =
        proto::echo_methods_client::EchoMethodsClient::connect(format!("http://{address}"))
            .await
            .unwrap();
    let mut request = Request::new(proto::Text {
        content: "must remain gated".into(),
    });
    request
        .metadata_mut()
        .insert(STATE_REF_HEADER, "actor".parse().unwrap());
    assert_eq!(
        client.reply(request).await.unwrap_err().code(),
        tonic::Code::Unavailable
    );
    fail_tx.send(()).unwrap();
    let result = tokio::time::timeout(Duration::from_secs(1), &mut server).await;
    if result.is_err() {
        server.abort();
        let _ = server.await;
        panic!("earlier recovery failure ignored during later stalled start");
    }
    match result.unwrap().unwrap() {
        Err(ApplicationHostError::RecoveryTask(status)) => {
            assert_eq!(status.code(), tonic::Code::Aborted);
            assert_eq!(status.message(), "earlier startup child failed");
        }
        other => panic!("wrong startup failure result: {other:?}"),
    }
    assert_eq!(dropped.load(Ordering::SeqCst), 1);
    assert_eq!(joined.load(Ordering::SeqCst), 1);
    assert!(later_rx.await.is_err());
    assert_eq!(
        *trace.lock().unwrap(),
        vec![
            "initialize:startup-failure",
            "recover:startup-failure",
            "shutdown:startup-failure"
        ]
    );
    assert!(std::net::TcpStream::connect_timeout(&address, Duration::from_millis(50)).is_err());
}

struct StalledStartupRecovery {
    started: Mutex<Option<tokio::sync::oneshot::Sender<()>>>,
    future_dropped: Arc<AtomicUsize>,
    child_joined: Arc<AtomicUsize>,
}
#[tonic::async_trait]
impl HostRecovery for StalledStartupRecovery {
    async fn start(
        &self,
        supervisor: &mut tokio::task::JoinSet<Result<(), Status>>,
        cancel: RecoveryCancellation,
    ) -> Result<(), Status> {
        struct StartupDrop(Arc<AtomicUsize>);
        impl Drop for StartupDrop {
            fn drop(&mut self) {
                self.0.fetch_add(1, Ordering::SeqCst);
            }
        }
        let _owner = StartupDrop(self.future_dropped.clone());
        let child_joined = self.child_joined.clone();
        supervisor.spawn(async move {
            cancel.cancelled().await;
            child_joined.fetch_add(1, Ordering::SeqCst);
            Ok(())
        });
        self.started
            .lock()
            .unwrap()
            .take()
            .unwrap()
            .send(())
            .unwrap();
        std::future::pending().await
    }
}
#[tokio::test]
async fn shutdown_during_recovery_start_drops_owner_joins_child_and_closes_public_ingress() {
    let address = unused_local_address();
    let trace = Arc::new(Mutex::new(Vec::new()));
    let dropped = Arc::new(AtomicUsize::new(0));
    let joined = Arc::new(AtomicUsize::new(0));
    let (started_tx, started_rx) = tokio::sync::oneshot::channel();
    let (later_tx, later_rx) = tokio::sync::oneshot::channel();
    let (_release_tx, release_rx) = tokio::sync::oneshot::channel();
    let (shutdown_tx, shutdown_rx) = tokio::sync::oneshot::channel();
    let host = ApplicationHost::new("server-owned-app")
        .with_lifecycle(lifecycle("startup", trace.clone(), false, None))
        .with_host_recovery(StalledStartupRecovery {
            started: Mutex::new(Some(started_tx)),
            future_dropped: dropped.clone(),
            child_joined: joined.clone(),
        })
        .with_host_recovery(BlockingRecovery {
            started: Mutex::new(Some(later_tx)),
            release: tokio::sync::Mutex::new(Some(release_rx)),
        })
        .add_public_service(proto::echo_methods_server::EchoMethodsServer::new(
            IdentityEcho,
        ));
    let mut server = tokio::spawn(async move {
        host.serve_with_shutdown(address, async { shutdown_rx.await.unwrap() })
            .await
    });
    tokio::time::timeout(Duration::from_secs(2), started_rx)
        .await
        .unwrap()
        .unwrap();
    let mut client =
        proto::echo_methods_client::EchoMethodsClient::connect(format!("http://{address}"))
            .await
            .unwrap();
    let mut request = Request::new(proto::Text {
        content: "must remain gated".into(),
    });
    request
        .metadata_mut()
        .insert(STATE_REF_HEADER, "actor".parse().unwrap());
    assert_eq!(
        client.reply(request).await.unwrap_err().code(),
        tonic::Code::Unavailable
    );
    shutdown_tx.send(()).unwrap();
    let result = tokio::time::timeout(Duration::from_secs(1), &mut server).await;
    if result.is_err() {
        server.abort();
        let _ = server.await;
        panic!("shutdown ignored while recovery start was pending");
    }
    result.unwrap().unwrap().unwrap();
    assert_eq!(dropped.load(Ordering::SeqCst), 1);
    assert_eq!(
        joined.load(Ordering::SeqCst),
        1,
        "owned recovery child was not cooperatively joined"
    );
    assert!(
        later_rx.await.is_err(),
        "later recovery registration must not start"
    );
    assert_eq!(
        *trace.lock().unwrap(),
        vec!["initialize:startup", "recover:startup", "shutdown:startup"]
    );
    assert!(std::net::TcpStream::connect_timeout(&address, Duration::from_millis(50)).is_err());
}

// A genuinely polled hook owns this guard until it returns or is cancelled.
struct LifecycleHookGuard {
    trace: Arc<Mutex<Vec<String>>>,
}
impl Drop for LifecycleHookGuard {
    fn drop(&mut self) {
        self.trace.lock().unwrap().push("drop:parked".into());
    }
}
struct ParkedLifecycle {
    phase: ApplicationLifecyclePhase,
    trace: Arc<Mutex<Vec<String>>>,
    entered: Mutex<Option<tokio::sync::oneshot::Sender<()>>>,
}
impl ParkedLifecycle {
    async fn park(&self) {
        let _guard = LifecycleHookGuard {
            trace: self.trace.clone(),
        };
        self.entered
            .lock()
            .unwrap()
            .take()
            .unwrap()
            .send(())
            .unwrap();
        std::future::pending::<()>().await;
    }
}
#[tonic::async_trait]
impl ApplicationLifecycle for ParkedLifecycle {
    async fn initialize(&self) -> Result<(), Status> {
        self.trace.lock().unwrap().push("initialize:parked".into());
        if self.phase == ApplicationLifecyclePhase::Initialize {
            self.park().await;
        }
        Ok(())
    }
    async fn recover(&self) -> Result<(), Status> {
        self.trace.lock().unwrap().push("recover:parked".into());
        if self.phase == ApplicationLifecyclePhase::Recover {
            self.park().await;
        }
        Ok(())
    }
    async fn shutdown(&self) -> Result<(), Status> {
        // Causal assertion at the cleanup producer, not eventual marker order.
        assert!(
            self.trace
                .lock()
                .unwrap()
                .iter()
                .any(|x| x == "drop:parked")
        );
        self.trace.lock().unwrap().push("shutdown:parked".into());
        Ok(())
    }
}
async fn assert_shutdown_interrupts_lifecycle(phase: ApplicationLifecyclePhase) {
    let address = unused_local_address();
    let trace = Arc::new(Mutex::new(Vec::new()));
    let (entered_tx, entered_rx) = tokio::sync::oneshot::channel();
    let (shutdown_tx, shutdown_rx) = tokio::sync::oneshot::channel();
    let host = ApplicationHost::new("parked-lifecycle")
        .with_lifecycle(lifecycle("first", trace.clone(), false, None))
        .with_lifecycle(ParkedLifecycle {
            phase,
            trace: trace.clone(),
            entered: Mutex::new(Some(entered_tx)),
        })
        .with_lifecycle(lifecycle("later", trace.clone(), false, None))
        .add_public_service(proto::echo_methods_server::EchoMethodsServer::new(
            IdentityEcho,
        ));
    let serving =
        tokio::spawn(host.serve_with_shutdown(address, async { shutdown_rx.await.unwrap() }));
    tokio::time::timeout(Duration::from_secs(2), entered_rx)
        .await
        .unwrap()
        .unwrap();
    assert!(tokio::net::TcpStream::connect(address).await.is_err());
    shutdown_tx.send(()).unwrap();
    tokio::time::timeout(Duration::from_secs(2), serving)
        .await
        .expect("shutdown must interrupt the parked lifecycle hook")
        .unwrap()
        .unwrap();
    let trace = trace.lock().unwrap().clone();
    let expected = if phase == ApplicationLifecyclePhase::Initialize {
        vec![
            "initialize:first",
            "initialize:parked",
            "drop:parked",
            "shutdown:first",
        ]
    } else {
        vec![
            "initialize:first",
            "initialize:parked",
            "initialize:later",
            "recover:first",
            "recover:parked",
            "drop:parked",
            "shutdown:first",
            "shutdown:parked",
            "shutdown:later",
        ]
    };
    assert_eq!(trace, expected);
    assert!(tokio::net::TcpStream::connect(address).await.is_err());
}
#[tokio::test]
async fn lifecycle_initialize_shutdown_drops_parked_hook_before_cleanup_without_listener() {
    assert_shutdown_interrupts_lifecycle(ApplicationLifecyclePhase::Initialize).await;
}
#[tokio::test]
async fn lifecycle_recover_shutdown_drops_parked_hook_and_cleans_all_initialized() {
    assert_shutdown_interrupts_lifecycle(ApplicationLifecyclePhase::Recover).await;
}
struct CleanupFailureLifecycle {
    trace: Arc<Mutex<Vec<String>>>,
}
#[tonic::async_trait]
impl ApplicationLifecycle for CleanupFailureLifecycle {
    async fn initialize(&self) -> Result<(), Status> {
        Ok(())
    }
    async fn recover(&self) -> Result<(), Status> {
        Ok(())
    }
    async fn shutdown(&self) -> Result<(), Status> {
        self.trace.lock().unwrap().push("shutdown:failure".into());
        Err(Status::internal("cleanup failed"))
    }
}
#[tokio::test]
async fn lifecycle_start_error_preserves_primary_error_and_continues_cleanup() {
    let trace = Arc::new(Mutex::new(Vec::new()));
    let address = unused_local_address();
    let host = ApplicationHost::new("cleanup-failure")
        .with_lifecycle(CleanupFailureLifecycle {
            trace: trace.clone(),
        })
        .with_lifecycle(lifecycle("broken", trace.clone(), true, None))
        .add_public_service(proto::echo_methods_server::EchoMethodsServer::new(
            IdentityEcho,
        ));
    let error = host
        .serve_with_shutdown(address, std::future::pending())
        .await
        .unwrap_err();
    match error {
        ApplicationHostError::Lifecycle {
            phase: ApplicationLifecyclePhase::Recover,
            component: 1,
            source,
        } => assert_eq!(source.code(), tonic::Code::FailedPrecondition),
        other => panic!("primary recovery failure was masked: {other:?}"),
    }
    assert_eq!(
        *trace.lock().unwrap(),
        vec![
            "initialize:broken",
            "recover:broken",
            "shutdown:failure",
            "shutdown:broken"
        ]
    );
    assert!(tokio::net::TcpStream::connect(address).await.is_err());
}
#[tokio::test]
async fn lifecycle_bind_failure_cleans_initialized_components_preserving_bind_error() {
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    let trace = Arc::new(Mutex::new(Vec::new()));
    let host = ApplicationHost::new("bind-failure")
        .with_lifecycle(CleanupFailureLifecycle {
            trace: trace.clone(),
        })
        .with_lifecycle(lifecycle("second", trace.clone(), false, None))
        .add_public_service(proto::echo_methods_server::EchoMethodsServer::new(
            IdentityEcho,
        ));
    let error = host
        .serve_with_shutdown(address, std::future::pending())
        .await
        .unwrap_err();
    assert!(matches!(error, ApplicationHostError::Bind(_)));
    assert_eq!(
        *trace.lock().unwrap(),
        vec![
            "initialize:second",
            "recover:second",
            "shutdown:failure",
            "shutdown:second"
        ]
    );
}
#[tokio::test]
async fn lifecycle_precompleted_shutdown_skips_initialization_and_binding() {
    let trace = Arc::new(Mutex::new(Vec::new()));
    let address = unused_local_address();
    let host = ApplicationHost::new("already-stopped")
        .with_lifecycle(lifecycle("unused", trace.clone(), false, None))
        .add_public_service(proto::echo_methods_server::EchoMethodsServer::new(
            IdentityEcho,
        ));
    host.serve_with_shutdown(address, async {}).await.unwrap();
    assert!(trace.lock().unwrap().is_empty());
    assert!(tokio::net::TcpStream::connect(address).await.is_err());
}

struct ShutdownAtRecoverCompletion {
    signal: Mutex<Option<tokio::sync::oneshot::Sender<()>>>,
    cleaned: Arc<AtomicUsize>,
}
#[tonic::async_trait]
impl ApplicationLifecycle for ShutdownAtRecoverCompletion {
    async fn initialize(&self) -> Result<(), Status> {
        Ok(())
    }
    async fn recover(&self) -> Result<(), Status> {
        self.signal
            .lock()
            .unwrap()
            .take()
            .unwrap()
            .send(())
            .unwrap();
        Ok(())
    }
    async fn shutdown(&self) -> Result<(), Status> {
        self.cleaned.fetch_add(1, Ordering::SeqCst);
        Ok(())
    }
}
#[tokio::test]
async fn lifecycle_final_hook_shutdown_is_observed_before_bind() {
    // An occupied address makes an attempted bind distinguishable from cancellation.
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let (tx, rx) = tokio::sync::oneshot::channel();
    let cleaned = Arc::new(AtomicUsize::new(0));
    let host = ApplicationHost::new("final-hook-shutdown")
        .with_lifecycle(ShutdownAtRecoverCompletion {
            signal: Mutex::new(Some(tx)),
            cleaned: cleaned.clone(),
        })
        .add_public_service(proto::echo_methods_server::EchoMethodsServer::new(
            IdentityEcho,
        ));
    host.serve_with_shutdown(listener.local_addr().unwrap(), async { rx.await.unwrap() })
        .await
        .unwrap();
    assert_eq!(cleaned.load(Ordering::SeqCst), 1);
}
#[tokio::test]
async fn lifecycle_empty_registry_precompleted_shutdown_skips_bind() {
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let host = ApplicationHost::new("empty-stopped").add_public_service(
        proto::echo_methods_server::EchoMethodsServer::new(IdentityEcho),
    );
    host.serve_with_shutdown(listener.local_addr().unwrap(), async {})
        .await
        .unwrap();
}
struct FailedStartupRegistration;
#[tonic::async_trait]
impl HostRecovery for FailedStartupRegistration {
    async fn start(
        &self,
        _: &mut tokio::task::JoinSet<Result<(), Status>>,
        _: RecoveryCancellation,
    ) -> Result<(), Status> {
        Err(Status::permission_denied("registration rejected"))
    }
}
#[tokio::test]
async fn lifecycle_cleanup_error_cannot_mask_host_recovery_registration_failure() {
    let trace = Arc::new(Mutex::new(Vec::new()));
    let address = unused_local_address();
    let host = ApplicationHost::new("registration-cleanup-failure")
        .with_lifecycle(CleanupFailureLifecycle {
            trace: trace.clone(),
        })
        .with_host_recovery(FailedStartupRegistration)
        .add_public_service(proto::echo_methods_server::EchoMethodsServer::new(
            IdentityEcho,
        ));
    let error = tokio::time::timeout(
        Duration::from_secs(2),
        host.serve_with_shutdown(address, std::future::pending()),
    )
    .await
    .unwrap()
    .unwrap_err();
    match error {
        ApplicationHostError::Lifecycle {
            phase: ApplicationLifecyclePhase::Recover,
            component: 0,
            source,
        } => assert_eq!(source.code(), tonic::Code::PermissionDenied),
        other => panic!("registration failure masked: {other:?}"),
    }
    assert_eq!(*trace.lock().unwrap(), vec!["shutdown:failure"]);
    assert!(tokio::net::TcpStream::connect(address).await.is_err());
}
#[tokio::test]
async fn lifecycle_cleanup_error_cannot_mask_supervised_child_failure() {
    let trace = Arc::new(Mutex::new(Vec::new()));
    let address = unused_local_address();
    let (tx, _rx) = tokio::sync::oneshot::channel();
    let host = ApplicationHost::new("child-cleanup-failure")
        .with_lifecycle(CleanupFailureLifecycle {
            trace: trace.clone(),
        })
        .with_host_recovery(FailingRecoveryTask {
            started: Mutex::new(Some(tx)),
        })
        .add_public_service(proto::echo_methods_server::EchoMethodsServer::new(
            IdentityEcho,
        ));
    let error = tokio::time::timeout(
        Duration::from_secs(2),
        host.serve_with_shutdown(address, std::future::pending()),
    )
    .await
    .unwrap()
    .unwrap_err();
    match error {
        ApplicationHostError::RecoveryTask(source) => {
            assert_eq!(source.code(), tonic::Code::Aborted)
        }
        other => panic!("child failure masked: {other:?}"),
    }
    assert_eq!(*trace.lock().unwrap(), vec!["shutdown:failure"]);
    assert!(tokio::net::TcpStream::connect(address).await.is_err());
}
