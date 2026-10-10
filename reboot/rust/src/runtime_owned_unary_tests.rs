//! Actual Tonic wire terminals, not caller-provided futures or receipts.
use super::*;
use std::collections::VecDeque;
use tonic_health::pb::{
    HealthCheckRequest, HealthCheckResponse,
    health_server::{Health, HealthServer},
};

const METHOD: &str = "grpc.health.v1.Health.Check";
const ERROR_URL: &str = "type.googleapis.com/tests.Declared";

enum Outcome {
    Success(&'static str, bool),
    Error(Status),
    Lost,
}
#[derive(Clone)]
struct WireServer {
    outcomes: Arc<Mutex<VecDeque<Outcome>>>,
    admitted: tokio::sync::mpsc::UnboundedSender<String>,
}
#[tonic::async_trait]
impl Health for WireServer {
    async fn check(
        &self,
        request: Request<HealthCheckRequest>,
    ) -> Result<tonic::Response<HealthCheckResponse>, Status> {
        let target = request
            .metadata()
            .get(STATE_REF_HEADER)
            .unwrap()
            .to_str()
            .unwrap()
            .to_owned();
        assert_eq!(request.get_ref().service, "bound-message");
        let outcome = self
            .outcomes
            .lock()
            .unwrap()
            .pop_front()
            .expect("exactly one wire operation per outcome");
        let _ = self.admitted.send(target);
        match outcome {
            Outcome::Success(target, read_only) => {
                let mut response = tonic::Response::new(HealthCheckResponse { status: 1 });
                let metadata = crate::successful_trailers::ParticipantMetadata::classified_single(
                    "example.Actor",
                    target,
                    read_only,
                    true,
                )
                .unwrap();
                crate::successful_trailers::stage_successful_participants(&mut response, metadata);
                Ok(response)
            }
            Outcome::Error(status) => Err(status),
            Outcome::Lost => std::future::pending().await,
        }
    }
    type WatchStream = tokio_stream::wrappers::ReceiverStream<Result<HealthCheckResponse, Status>>;
    async fn watch(
        &self,
        _: Request<HealthCheckRequest>,
    ) -> Result<tonic::Response<Self::WatchStream>, Status> {
        Err(Status::unimplemented("not used"))
    }
}
struct Resolver {
    channel: tonic::transport::Channel,
    calls: std::sync::atomic::AtomicUsize,
    park: Option<String>,
    entered: Arc<tokio::sync::Semaphore>,
    release: Option<Arc<tokio::sync::Semaphore>>,
}
#[tonic::async_trait]
impl TransactionalChannelResolver for Resolver {
    async fn resolve(
        &self,
        state_type: &str,
        state_ref: &str,
    ) -> Result<tonic::transport::Channel, Status> {
        assert_eq!(state_type, "example.Actor");
        self.calls.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
        if self.park.as_deref() == Some(state_ref) {
            self.entered.add_permits(1);
            if let Some(release) = &self.release {
                release.acquire().await.unwrap().forget();
            } else {
                std::future::pending::<()>().await;
            }
        }
        Ok(self.channel.clone())
    }
}
async fn wire(
    outcomes: Vec<Outcome>,
) -> (
    Arc<Resolver>,
    tokio::sync::mpsc::UnboundedReceiver<String>,
    tokio::task::JoinHandle<()>,
) {
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let endpoint = format!("http://{}", listener.local_addr().unwrap());
    let (admitted, rx) = tokio::sync::mpsc::unbounded_channel();
    let server = WireServer {
        outcomes: Arc::new(Mutex::new(outcomes.into())),
        admitted,
    };
    let task = tokio::spawn(async move {
        tonic::transport::Server::builder()
            .layer(crate::successful_trailers::SuccessfulParticipantTrailerLayer)
            .add_service(HealthServer::new(server))
            .serve_with_incoming(tokio_stream::wrappers::TcpListenerStream::new(listener))
            .await
            .unwrap();
    });
    let channel = tonic::transport::Endpoint::from_shared(endpoint)
        .unwrap()
        .buffer_size(1)
        .connect()
        .await
        .unwrap();
    (
        Arc::new(Resolver {
            channel,
            calls: Default::default(),
            park: None,
            entered: Arc::new(tokio::sync::Semaphore::new(0)),
            release: None,
        }),
        rx,
        task,
    )
}
fn context(supervised: bool) -> TransactionContext {
    let mut headers = RebootHeaders::new("A");
    headers.transaction_ids = Some(vec![Uuid::new_v4()]);
    headers.transaction_coordinator_state_type = Some("example.Actor".into());
    headers.transaction_coordinator_state_ref = Some("A".into());
    headers.coordinator_read_only_aware = true;
    let mut context =
        TransactionContext::from_headers(headers, TransactionMode::Exclusive).unwrap();
    if supervised {
        context.enable_supervised_tree().unwrap();
        context
            .install_actor_authority(
                crate::durable_coordinator::ParticipantTarget {
                    state_type: "example.Actor".into(),
                    state_ref: "A".into(),
                },
                true,
            )
            .unwrap();
    }
    context
}
fn schema() -> [DeclaredTransactionalError; 1] {
    [DeclaredTransactionalError::protobuf::<HealthCheckResponse>(
        ERROR_URL,
    )]
}
async fn call(
    resolver: &Resolver,
    context: &TransactionContext,
    target: &str,
    schema: &[DeclaredTransactionalError],
) -> Result<TransactionalCallResponse<HealthCheckResponse>, Status> {
    let scope = context
        .begin_generated_outbound_for("example.Actor", target, METHOD)
        .unwrap();
    generated_transactional_unary(
        resolver,
        context,
        scope,
        HealthCheckRequest {
            service: "bound-message".into(),
        },
        schema,
    )
    .await
}
fn declared(target: &str) -> Status {
    let mut status = crate::declared_error_status(
        tonic::Code::Unknown,
        "declared wire abort",
        ERROR_URL,
        &HealthCheckResponse { status: 1 },
    );
    crate::successful_trailers::ParticipantMetadata::classified_single(
        "example.Actor",
        target,
        true,
        true,
    )
    .unwrap()
    .attach_to_status(&mut status);
    status
}
fn assert_b(context: &TransactionContext) {
    let members = context.returned_participants_snapshot();
    assert_eq!(members.len(), 1);
    assert_eq!(members[0].target.state_ref, "B");
    assert!(!members[0].read_only);
}
#[tokio::test]
async fn owned_unary_genuine_status_only_and_typed_success_settle_exact_b_c() {
    let (resolver, mut admitted, server) = wire(vec![
        Outcome::Success("B", false),
        Outcome::Success("C", false),
    ])
    .await;
    let root = context(true);
    call(&resolver, &root, "B", &[]).await.unwrap();
    call(&resolver, &root, "C", &schema()).await.unwrap();
    assert_eq!(admitted.recv().await.unwrap(), "B");
    assert_eq!(admitted.recv().await.unwrap(), "C");
    let members = root.seal_explicit_abort().unwrap();
    assert_eq!(members.len(), 2);
    assert!(members.iter().all(|p| !p.read_only));
    assert!(root.doomed_status().is_none());
    server.abort();
}
#[tokio::test]
async fn owned_unary_genuine_declared_first_leaf_settles_but_after_b_dooms() {
    let (resolver, mut admitted, server) = wire(vec![Outcome::Error(declared("B"))]).await;
    let root = context(true);
    let status = call(&resolver, &root, "B", &schema()).await.unwrap_err();
    assert_eq!(status.message(), "declared wire abort");
    assert_eq!(admitted.recv().await.unwrap(), "B");
    assert!(root.doomed_status().is_none());
    let members = root.seal_explicit_abort().unwrap();
    assert_eq!(members.len(), 1);
    assert!(members[0].read_only);
    server.abort();
    let (resolver, _admitted, server) = wire(vec![
        Outcome::Success("B", false),
        Outcome::Error(declared("C")),
    ])
    .await;
    let root = context(true);
    call(&resolver, &root, "B", &schema()).await.unwrap();
    call(&resolver, &root, "C", &schema()).await.unwrap_err();
    assert_b(&root);
    assert!(root.doomed_status().is_some());
    assert!(root.seal_explicit_abort().is_err());
    server.abort();
}
#[tokio::test]
async fn owned_unary_unissued_c_after_real_b_cannot_seal_or_route() {
    let (resolver, _admitted, server) = wire(vec![Outcome::Success("B", false)]).await;
    let root = context(true);
    call(&resolver, &root, "B", &[]).await.unwrap();
    drop(
        root.begin_generated_outbound_for("example.Actor", "C", METHOD)
            .unwrap(),
    );
    assert_b(&root);
    assert_eq!(resolver.calls.load(std::sync::atomic::Ordering::SeqCst), 1);
    assert!(
        root.doomed_status().is_none(),
        "the uncertainty gate, not a caught error, must prevent handoff"
    );
    assert!(root.seal_explicit_abort().is_err());
    server.abort();
}
#[tokio::test]
async fn owned_unary_destroyed_c_response_after_real_b_retains_uncertainty() {
    let (resolver, mut admitted, server) =
        wire(vec![Outcome::Success("B", false), Outcome::Lost]).await;
    let root = context(true);
    call(&resolver, &root, "B", &[]).await.unwrap();
    assert_eq!(admitted.recv().await.unwrap(), "B");
    let child_root = root.clone();
    let child_resolver = resolver.clone();
    let child = tokio::spawn(async move { call(&child_resolver, &child_root, "C", &[]).await });
    assert_eq!(
        admitted.recv().await.unwrap(),
        "C",
        "actual C RPC reached server before response future destruction"
    );
    child.abort();
    assert!(child.await.unwrap_err().is_cancelled());
    assert_b(&root);
    assert!(
        root.doomed_status().is_none(),
        "no generated error or root cancellation masks the gate"
    );
    assert!(root.seal_explicit_abort().is_err());
    server.abort();
}
#[tokio::test]
async fn owned_unary_parked_resolver_fake_membership_is_data_not_terminal_proof() {
    let (resolver, _admitted, server) = wire(vec![Outcome::Success("B", false)]).await;
    let root = context(true);
    call(&resolver, &root, "B", &[]).await.unwrap();
    let entered = Arc::new(tokio::sync::Semaphore::new(0));
    let parked = Arc::new(Resolver {
        channel: resolver.channel.clone(),
        calls: Default::default(),
        park: Some("C".into()),
        entered: entered.clone(),
        release: None,
    });
    let child_root = root.clone();
    let child_resolver = parked.clone();
    let child = tokio::spawn(async move { call(&child_resolver, &child_root, "C", &[]).await });
    entered.acquire().await.unwrap().forget();
    let mut metadata = tonic::metadata::MetadataMap::new();
    metadata.insert(
        crate::successful_trailers::TRANSACTION_PARTICIPANTS_HEADER,
        r#"{"example.Actor":["C"]}"#.parse().unwrap(),
    );
    let fake = crate::successful_trailers::ReturnedParticipants::from_metadata(&metadata).unwrap();
    let _data_only = TransactionalCallResponse::new(
        tonic::Response::new(HealthCheckResponse { status: 1 }),
        fake.clone(),
    );
    root.enlist_returned_participants(&fake);
    assert_eq!(
        root.returned_participants
            .as_ref()
            .unwrap()
            .lock()
            .unwrap()
            .active,
        1
    );
    assert!(root.seal_explicit_abort().is_err());
    child.abort();
    assert!(child.await.unwrap_err().is_cancelled());
    assert_eq!(
        root.returned_participants
            .as_ref()
            .unwrap()
            .lock()
            .unwrap()
            .active,
        0
    );
    assert!(
        root.seal_explicit_abort().is_err(),
        "matching fabricated membership cannot discharge uncertainty"
    );
    server.abort();
}
#[tokio::test]
async fn owned_unary_invalid_success_and_rich_status_never_settle() {
    for vector in 0..8 {
        let mut status = declared("C");
        match vector {
            2 => status = declared("wrong"),
            3 => {
                status =
                    crate::SystemAborted::InvalidArgument(crate::database_proto::InvalidArgument {})
                        .into_status("system")
            }
            4 => status = Status::unknown("ordinary"),
            5 => {
                status = crate::declared_error_status(
                    tonic::Code::Unknown,
                    "unknown",
                    "type.googleapis.com/tests.Unknown",
                    &HealthCheckResponse { status: 1 },
                )
            }
            6 => {
                let rich = googleapis_tonic_google_rpc::google::rpc::Status {
                    code: tonic::Code::Unknown as i32,
                    message: "malformed".into(),
                    details: vec![prost_types::Any {
                        type_url: ERROR_URL.into(),
                        value: vec![0xff],
                    }],
                };
                status = Status::with_details(
                    tonic::Code::Unknown,
                    "malformed",
                    rich.encode_to_vec().into(),
                );
            }
            7 => {
                let mut rich = crate::declared_error_details(&status).unwrap().unwrap();
                rich.details.push(rich.details[0].clone());
                status = Status::with_details(
                    status.code(),
                    status.message(),
                    rich.encode_to_vec().into(),
                );
                crate::successful_trailers::ParticipantMetadata::classified_single(
                    "example.Actor",
                    "C",
                    true,
                    true,
                )
                .unwrap()
                .attach_to_status(&mut status);
            }
            _ => {}
        }
        let outcome = match vector {
            0 => Outcome::Success("wrong", false),
            1 => Outcome::Success("C", true),
            _ => Outcome::Error(status),
        };
        let (resolver, _admitted, server) = wire(vec![outcome]).await;
        let root = context(true);
        call(&resolver, &root, "C", &schema()).await.unwrap_err();
        assert!(root.doomed_status().is_some(), "vector {vector}");
        assert!(
            root.returned_participants_snapshot().is_empty(),
            "vector {vector}"
        );
        assert!(root.seal_explicit_abort().is_err(), "vector {vector}");
        server.abort();
    }
}
fn assert_closed_unsettled_c(root: &TransactionContext) {
    assert_b(root);
    let ledger = root.returned_participants.as_ref().unwrap().lock().unwrap();
    assert!(ledger.sealed);
    assert_eq!(ledger.active, 0, "unsettled C reservation was released");
    assert!(ledger.membership_uncertain, "closure must not certify C");
    assert!(!ledger.late_enlistment);
    drop(ledger);
    assert!(root.seal_explicit_abort().is_err());
}

#[tokio::test]
async fn owned_unary_closed_before_first_poll_never_enters_c_resolver() {
    let (resolver, mut admitted, server) = wire(vec![
        Outcome::Success("B", false),
        Outcome::Success("C", false),
    ])
    .await;
    let (root, abandon, cleanup) =
        crate::durable_coordinator::tests::registered_star_outbound_fixture().await;
    call(&resolver, &root, "B", &[]).await.unwrap();
    assert_eq!(admitted.recv().await.unwrap(), "B");
    let scope = root
        .begin_generated_outbound_for("example.Actor", "C", METHOD)
        .unwrap();
    let future = generated_transactional_unary::<_, _, HealthCheckResponse>(
        &*resolver,
        &root,
        scope,
        HealthCheckRequest {
            service: "bound-message".into(),
        },
        &[],
    );
    // The retained scope/future exists, but has never been polled.
    abandon();
    assert!(root.doomed_status().is_none(), "closure itself is not doom");
    assert_eq!(
        future.await.unwrap_err().code(),
        tonic::Code::FailedPrecondition
    );
    assert_eq!(resolver.calls.load(std::sync::atomic::Ordering::SeqCst), 1);
    assert!(admitted.try_recv().is_err(), "C never reaches the server");
    assert_closed_unsettled_c(&root);
    cleanup.await;
    server.abort();
}

#[tokio::test]
async fn owned_unary_resolver_released_after_closure_never_issues_c_rpc() {
    let (resolver, mut admitted, server) = wire(vec![
        Outcome::Success("B", false),
        Outcome::Success("C", false),
    ])
    .await;
    let (root, abandon, cleanup) =
        crate::durable_coordinator::tests::registered_star_outbound_fixture().await;
    call(&resolver, &root, "B", &[]).await.unwrap();
    assert_eq!(admitted.recv().await.unwrap(), "B");
    let entered = Arc::new(tokio::sync::Semaphore::new(0));
    let release = Arc::new(tokio::sync::Semaphore::new(0));
    let parked = Arc::new(Resolver {
        channel: resolver.channel.clone(),
        calls: Default::default(),
        park: Some("C".into()),
        entered: entered.clone(),
        release: Some(release.clone()),
    });
    let child_root = root.clone();
    let child_resolver = parked.clone();
    let child = tokio::spawn(async move { call(&child_resolver, &child_root, "C", &[]).await });
    tokio::time::timeout(std::time::Duration::from_secs(5), entered.acquire())
        .await
        .unwrap()
        .unwrap()
        .forget();
    abandon();
    assert!(root.doomed_status().is_none());
    release.add_permits(1);
    let status = tokio::time::timeout(std::time::Duration::from_secs(5), child)
        .await
        .unwrap()
        .unwrap()
        .unwrap_err();
    assert_eq!(status.code(), tonic::Code::FailedPrecondition);
    assert_eq!(parked.calls.load(std::sync::atomic::Ordering::SeqCst), 1);
    assert!(
        admitted.try_recv().is_err(),
        "released routing must not issue C"
    );
    assert_closed_unsettled_c(&root);
    cleanup.await;
    server.abort();
}

#[tokio::test]
async fn owned_unary_actual_channel_readiness_released_after_closure_never_issues_c_rpc() {
    use std::{future::Future, task::Poll};
    use tower::Service;
    let (resolver, mut admitted, server) = wire(vec![
        Outcome::Success("B", false),
        Outcome::Success("C", false),
    ])
    .await;
    let (root, abandon, cleanup) =
        crate::durable_coordinator::tests::registered_star_outbound_fixture().await;
    call(&resolver, &root, "B", &[]).await.unwrap();
    assert_eq!(admitted.recv().await.unwrap(), "B");

    // Reserve the real Channel's sole Tower buffer slot. No mock transport,
    // runtime pause hook or caller-supplied terminal certifier is involved.
    let mut reservation = resolver.channel.clone();
    std::future::poll_fn(|cx| reservation.poll_ready(cx))
        .await
        .unwrap();
    let mut child = Box::pin(call(&resolver, &root, "C", &[]));
    std::future::poll_fn(|cx| {
        assert!(child.as_mut().poll(cx).is_pending());
        Poll::Ready(())
    })
    .await;
    assert_eq!(
        resolver.calls.load(std::sync::atomic::Ordering::SeqCst),
        2,
        "C routing finished synchronously; only actual Grpc::ready is parked"
    );
    assert!(admitted.try_recv().is_err());
    assert_eq!(
        root.returned_participants
            .as_ref()
            .unwrap()
            .lock()
            .unwrap()
            .active,
        1
    );
    abandon();
    assert!(root.doomed_status().is_none());
    drop(reservation); // Release actual readiness, do not cancel the C future.
    let status = tokio::time::timeout(std::time::Duration::from_secs(5), child)
        .await
        .unwrap()
        .unwrap_err();
    assert_eq!(status.code(), tonic::Code::FailedPrecondition);
    assert!(
        admitted.try_recv().is_err(),
        "ready-after-close cannot issue C"
    );
    assert_closed_unsettled_c(&root);
    cleanup.await;
    server.abort();
}

#[tokio::test]
async fn owned_unary_default_declared_and_system_recoverability_is_preserved() {
    for status in [
        declared("B"),
        crate::SystemAborted::InvalidArgument(crate::database_proto::InvalidArgument {})
            .into_status("default system"),
    ] {
        let (resolver, _admitted, server) = wire(vec![Outcome::Error(status)]).await;
        let root = context(false);
        call(&resolver, &root, "B", &schema()).await.unwrap_err();
        assert!(root.doomed_status().is_none());
        server.abort();
    }
}
