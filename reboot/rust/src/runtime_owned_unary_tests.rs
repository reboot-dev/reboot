//! Actual Tonic wire terminals, not caller-provided futures or receipts.
#[path = "runtime_raw_terminal_tests.rs"]
mod raw_terminal_tests;
use super::*;
use std::collections::VecDeque;
use tonic_health::pb::{
    HealthCheckRequest, HealthCheckResponse,
    health_server::{Health, HealthServer},
};

#[test]
fn registered_permission_identity_is_part_of_ownership_not_wire_headers() {
    let (mut admitted, _lifetime) = context(true).with_handler_lifetime().unwrap();
    let configuration = crate::registered_local::GeneratedLocalAdapterConfig {
        target: crate::durable_coordinator::ParticipantTarget {
            state_type: "example.Actor".into(),
            state_ref: "B".into(),
        },
        database_endpoint: "http://ownership-test".into(),
        policy: crate::auth::AuthorizationPolicy::permissive_for_development(),
        methods: std::collections::BTreeSet::from(["example.ActorMethods.Apply".to_owned()]),
        incarnation: Arc::new(()),
    };
    let (_registry, binding) =
        crate::registered_local::ready_binding_for_guard_test(configuration.clone());
    admitted
        .install_registered_outbound(crate::registered_local::RegisteredOutboundPermission {
            identity: Arc::new(()),
            binding,
            configuration,
        })
        .unwrap();
    let clone = admitted.clone();
    assert!(admitted.same_ownership_context(&clone));
    let mut stripped = clone.clone();
    stripped.registered_outbound = None;
    assert!(!admitted.same_ownership_context(&stripped));
    let mut replaced = clone;
    replaced.registered_outbound.as_mut().unwrap().identity = Arc::new(());
    assert!(!admitted.same_ownership_context(&replaced));
    let reconstructed =
        TransactionContext::from_headers(admitted.headers.clone(), admitted.mode).unwrap();
    assert!(reconstructed.registered_outbound.is_none());
}

#[tokio::test]
async fn admitted_handler_revocation_interrupts_routing_and_invalidates_clones() {
    struct Parked {
        entered: tokio::sync::Semaphore,
        dropped: Arc<std::sync::atomic::AtomicBool>,
    }
    struct Dropped(Arc<std::sync::atomic::AtomicBool>);
    impl Drop for Dropped {
        fn drop(&mut self) {
            self.0.store(true, std::sync::atomic::Ordering::SeqCst);
        }
    }
    #[tonic::async_trait]
    impl TransactionalChannelResolver for Parked {
        async fn resolve(&self, _: &str, _: &str) -> Result<tonic::transport::Channel, Status> {
            let _drop = Dropped(self.dropped.clone());
            self.entered.add_permits(1);
            std::future::pending().await
        }
    }
    let original = context(true);
    let (admitted, owner) = original.with_handler_lifetime().unwrap();
    let retained = admitted.clone();
    assert!(
        admitted.with_handler_lifetime().is_err(),
        "live rebinding prohibited"
    );
    assert!(admitted.validate_handler_lifetime().is_ok());
    let resolver = Parked {
        entered: tokio::sync::Semaphore::new(0),
        dropped: Arc::new(std::sync::atomic::AtomicBool::new(false)),
    };
    let scope = admitted
        .begin_generated_outbound_for("example.Actor", "B", METHOD)
        .unwrap();
    let mut call = Box::pin(generated_transactional_unary::<_, _, HealthCheckResponse>(
        &resolver,
        &admitted,
        scope,
        HealthCheckRequest {
            service: "bound-message".into(),
        },
        &[],
    ));
    assert!(
        tokio::time::timeout(std::time::Duration::from_millis(20), &mut call)
            .await
            .is_err()
    );
    resolver.entered.acquire().await.unwrap().forget();
    drop(owner);
    assert_eq!(
        tokio::time::timeout(std::time::Duration::from_secs(1), call)
            .await
            .unwrap()
            .unwrap_err()
            .code(),
        tonic::Code::Cancelled
    );
    assert!(resolver.dropped.load(std::sync::atomic::Ordering::SeqCst));
    assert!(retained.validate_handler_lifetime().is_err());
    assert!(
        retained.with_handler_lifetime().is_err(),
        "revoked rebinding prohibited"
    );
    assert!(
        original.validate_handler_lifetime().is_ok(),
        "unrelated context has no lifetime grant"
    );
    assert!(
        admitted
            .returned_participants
            .as_ref()
            .unwrap()
            .lock()
            .unwrap()
            .membership_uncertain,
        "abandoned outbound scope retains membership uncertainty"
    );
}

#[tokio::test]
async fn revoked_handler_rejects_admission_and_raw_helpers_without_mutation() {
    struct Forbidden;
    #[tonic::async_trait]
    impl TransactionalChannelResolver for Forbidden {
        async fn resolve(&self, _: &str, _: &str) -> Result<tonic::transport::Channel, Status> {
            panic!("revoked context must not enter resolver")
        }
    }
    let original = context(true);
    let (admitted, owner) = original.with_handler_lifetime().unwrap();
    let scope = admitted
        .begin_generated_outbound_for("example.Actor", "B", METHOD)
        .unwrap();
    drop(owner);
    let snapshot = || {
        format!(
            "{:?}",
            original
                .returned_participants
                .as_ref()
                .unwrap()
                .lock()
                .unwrap()
        )
    };
    let before = snapshot();
    assert!(
        admitted
            .begin_generated_outbound_for("example.Actor", "C", METHOD)
            .is_err()
    );
    assert_eq!(snapshot(), before);
    assert_eq!(
        scoped_generated_transactional_outbound_request(
            &Forbidden,
            &admitted,
            &scope,
            "example.Actor",
            "B",
            METHOD,
            HealthCheckRequest::default()
        )
        .await
        .unwrap_err()
        .code(),
        tonic::Code::Cancelled
    );
    assert!(
        scoped_generated_transactional_outbound_request(
            &Forbidden,
            &original,
            &scope,
            "example.Actor",
            "B",
            METHOD,
            HealthCheckRequest::default()
        )
        .await
        .is_err(),
        "unbound source cannot strip scope lifetime"
    );
    assert!(!scope.request_used.load(std::sync::atomic::Ordering::SeqCst));
    assert_eq!(snapshot(), before);
    let raw_original = context(false);
    let (raw, raw_owner) = raw_original.with_handler_lifetime().unwrap();
    drop(raw_owner);
    assert_eq!(
        transactional_outbound_request(
            &Forbidden,
            &raw,
            "example.Actor",
            "B",
            HealthCheckRequest::default()
        )
        .await
        .unwrap_err()
        .code(),
        tonic::Code::Cancelled
    );
    assert!(raw_original.require_outbound_allowed().is_ok());
}

#[tokio::test]
async fn admitted_handler_revocation_interrupts_actual_response_await_without_settlement() {
    let (resolver, mut received, server) = wire(vec![Outcome::Lost]).await;
    let original = context(true);
    let (admitted, owner) = original.with_handler_lifetime().unwrap();
    let mut outbound = Box::pin(call(&resolver, &admitted, "B", &[]));
    tokio::select! {
        _ = &mut outbound => panic!("wire response must stay pending"),
        target = received.recv() => assert_eq!(target.as_deref(), Some("B")),
    }
    drop(owner);
    assert_eq!(
        tokio::time::timeout(std::time::Duration::from_secs(1), outbound)
            .await
            .unwrap()
            .unwrap_err()
            .code(),
        tonic::Code::Cancelled
    );
    {
        let ledger = original
            .returned_participants
            .as_ref()
            .unwrap()
            .lock()
            .unwrap();
        assert!(ledger.membership_uncertain);
        assert_eq!(ledger.active, 0);
        assert!(ledger.participants.is_empty());
    }
    server.abort();
    let _ = server.await;
}

#[tokio::test]
async fn ancestor_revocation_preserves_child_lifetime_and_scope_identity() {
    let source = context(true);
    let (parent, parent_owner) = source.with_handler_lifetime().unwrap();
    // Unit-only transfer setup, not registered-local provenance or authority.
    let mut inbound = context(true);
    inbound.handler_ancestors = Arc::from([parent.handler_lifetime.as_ref().unwrap().clone()]);
    let (child, child_owner) = inbound.with_handler_lifetime().unwrap();
    let nested = child
        .with_nested_transaction_id(uuid::Uuid::new_v4())
        .unwrap();
    assert!(child.validate_handler_lifetime().is_ok());
    assert!(!child.same_ownership_context(&source));
    drop(parent_owner);
    tokio::time::timeout(std::time::Duration::from_secs(1), child.handler_revoked())
        .await
        .unwrap();
    for escaped in [&child, &nested] {
        assert_eq!(
            escaped.validate_handler_lifetime().unwrap_err().code(),
            tonic::Code::Cancelled
        );
        assert!(
            escaped
                .begin_generated_outbound_for("example.Actor", "B", METHOD)
                .is_err()
        );
        assert!(escaped.reserve_handler_settlement().is_err());
    }
    assert!(source.validate_handler_lifetime().is_ok());
    assert!(
        *child.handler_lifetime.as_ref().unwrap().borrow(),
        "child own lifetime still live"
    );
    drop(child_owner);
}

#[tokio::test]
async fn child_return_does_not_revoke_parent_response_settlement() {
    let source = context(true);
    let (parent, parent_owner) = source.with_handler_lifetime().unwrap();
    let mut inbound = context(true);
    inbound.handler_ancestors = Arc::from([parent.handler_lifetime.as_ref().unwrap().clone()]);
    let (child, child_owner) = inbound.with_handler_lifetime().unwrap();
    drop(child_owner);
    assert!(child.validate_handler_lifetime().is_err());
    assert!(parent.validate_handler_lifetime().is_ok());
    assert!(parent.reserve_handler_settlement().is_ok());
    drop(parent_owner);
}

#[tokio::test]
async fn malformed_handler_ancestry_fails_before_reserving_duplicate_channels() {
    let (parent, _owner) = context(true).with_handler_lifetime().unwrap();
    let receiver = parent.handler_lifetime.as_ref().unwrap().clone();
    let mut inbound = context(true);
    inbound.handler_ancestors = Arc::from([receiver.clone(), receiver.clone()]);
    assert_eq!(
        inbound.reserve_handler_settlement().unwrap_err().code(),
        tonic::Code::FailedPrecondition
    );
    assert!(inbound.with_handler_lifetime().is_err());
    tokio::time::timeout(std::time::Duration::from_secs(1), inbound.handler_revoked())
        .await
        .unwrap();
    inbound.handler_ancestors = vec![receiver; 17].into();
    assert_eq!(
        inbound.validate_handler_lifetime().unwrap_err().code(),
        tonic::Code::ResourceExhausted
    );
}

#[tokio::test]
async fn live_ancestry_wait_wakes_for_each_channel_and_can_be_dropped() {
    for revoked_index in 0..3 {
        let mut senders = Vec::new();
        let mut receivers = Vec::new();
        for _ in 0..2 {
            let (ctx, owner) = context(true).with_handler_lifetime().unwrap();
            receivers.push(ctx.handler_lifetime.unwrap());
            senders.push(Some(owner));
        }
        let mut inbound = context(true);
        inbound.handler_ancestors = receivers.into();
        let (child, own) = inbound.with_handler_lifetime().unwrap();
        senders.push(Some(own));
        let mut wait = Box::pin(child.handler_revoked());
        assert!(
            tokio::time::timeout(std::time::Duration::from_millis(10), &mut wait)
                .await
                .is_err()
        );
        drop(wait);
        assert!(
            child.validate_handler_lifetime().is_ok(),
            "dropping waiter never revokes owners"
        );
        let mut wait = Box::pin(child.handler_revoked());
        assert!(
            tokio::time::timeout(std::time::Duration::from_millis(10), &mut wait)
                .await
                .is_err()
        );
        drop(senders[revoked_index].take());
        tokio::time::timeout(std::time::Duration::from_secs(1), wait)
            .await
            .unwrap();
        assert!(child.validate_handler_lifetime().is_err());
    }
}

#[test]
fn ancestry_identity_is_ordered_and_cannot_substitute_scope_owner() {
    let (first, _first_owner) = context(true).with_handler_lifetime().unwrap();
    let (second, _second_owner) = context(true).with_handler_lifetime().unwrap();
    let a = first.handler_lifetime.as_ref().unwrap().clone();
    let b = second.handler_lifetime.as_ref().unwrap().clone();
    let mut base = context(true);
    base.handler_ancestors = Arc::from([a.clone(), b.clone()]);
    let (child, _child_owner) = base.with_handler_lifetime().unwrap();
    let scope = child
        .begin_generated_outbound_for("example.Actor", "B", METHOD)
        .unwrap();
    assert!(child.clone().same_ownership_context(&child));
    assert!(
        child
            .clone()
            .validate_outbound_scope_admission(&scope)
            .is_ok()
    );
    for ancestors in [vec![b.clone(), a.clone()], vec![a.clone()], vec![b.clone()]] {
        let mut substituted = child.clone();
        substituted.handler_ancestors = ancestors.into();
        assert!(!substituted.same_ownership_context(&child));
        assert!(
            substituted
                .validate_outbound_scope_admission(&scope)
                .is_err()
        );
    }
    let mut duplicate_own = child.clone();
    duplicate_own.handler_ancestors = Arc::from([child.handler_lifetime.as_ref().unwrap().clone()]);
    assert_eq!(
        duplicate_own
            .reserve_handler_settlement()
            .unwrap_err()
            .code(),
        tonic::Code::FailedPrecondition
    );
}

#[test]
fn sixteen_distinct_ancestors_reserve_without_exceeding_boundary() {
    let mut owners = Vec::new();
    let mut receivers = Vec::new();
    for _ in 0..16 {
        let (ctx, owner) = context(true).with_handler_lifetime().unwrap();
        receivers.push(ctx.handler_lifetime.unwrap());
        owners.push(owner);
    }
    let mut inbound = context(true);
    inbound.handler_ancestors = receivers.into();
    let (child, child_owner) = inbound.with_handler_lifetime().unwrap();
    {
        let reservation = child.reserve_handler_settlement().unwrap();
        assert_eq!(reservation.len(), 17, "sixteen ancestors plus own handler");
    }
    drop(child_owner);
    assert!(child.validate_handler_lifetime().is_err());
    drop(owners);
}

const METHOD: &str = "grpc.health.v1.Health.Check";
const ERROR_URL: &str = "type.googleapis.com/tests.Declared";

enum Outcome {
    Success(&'static str, bool),
    InitialOnly,
    EmptyStream,
    MultipleMessages,
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
            Outcome::InitialOnly => {
                let mut response = tonic::Response::new(HealthCheckResponse { status: 1 });
                let metadata = crate::successful_trailers::ParticipantMetadata::classified_single(
                    "example.Actor",
                    "B",
                    false,
                    true,
                )
                .unwrap();
                let mut status = Status::failed_precondition("initial metadata only");
                metadata.attach_to_status(&mut status);
                // Valid membership in initial headers, without a terminal marker.
                *response.metadata_mut() = status.metadata().clone();
                Ok(response)
            }
            Outcome::EmptyStream | Outcome::MultipleMessages => unreachable!("streaming fixture"),
            Outcome::Error(status) => Err(status),
            Outcome::Lost => std::future::pending().await,
        }
    }
    type WatchStream = tokio_stream::wrappers::ReceiverStream<Result<HealthCheckResponse, Status>>;
    async fn watch(
        &self,
        request: Request<HealthCheckRequest>,
    ) -> Result<tonic::Response<Self::WatchStream>, Status> {
        let target = request
            .metadata()
            .get(STATE_REF_HEADER)
            .unwrap()
            .to_str()
            .unwrap()
            .to_owned();
        assert_eq!(request.get_ref().service, "bound-message");
        let outcome = self.outcomes.lock().unwrap().pop_front().unwrap();
        let count = match outcome {
            Outcome::EmptyStream => 0,
            Outcome::MultipleMessages => 2,
            _ => unreachable!("unary fixture"),
        };
        let _ = self.admitted.send(target);
        let (tx, rx) = tokio::sync::mpsc::channel(2);
        for _ in 0..count {
            tx.send(Ok(HealthCheckResponse { status: 1 }))
                .await
                .unwrap();
        }
        drop(tx);
        let mut response = tonic::Response::new(tokio_stream::wrappers::ReceiverStream::new(rx));
        let metadata = crate::successful_trailers::ParticipantMetadata::classified_single(
            "example.Actor",
            "B",
            false,
            true,
        )
        .unwrap();
        crate::successful_trailers::stage_successful_participants(&mut response, metadata);
        Ok(response)
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
    call_method(resolver, context, target, METHOD, schema).await
}
async fn call_method(
    resolver: &Resolver,
    context: &TransactionContext,
    target: &str,
    method: &str,
    schema: &[DeclaredTransactionalError],
) -> Result<TransactionalCallResponse<HealthCheckResponse>, Status> {
    let scope = context
        .begin_generated_outbound_for("example.Actor", target, method)
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
// Private transport regression only: this service has no internal authorization
// capability and is not exposed through the public resolver surface.
#[tokio::test]
async fn owned_unary_private_service_consumes_real_tonic_success_and_declared_terminal() {
    use tower::Layer;
    for success in [true, false] {
        let root = context(true);
        let mut scope = root
            .begin_generated_outbound_for("example.Actor", "B", METHOD)
            .unwrap();
        let resolver = Resolver {
            channel: tonic::transport::Endpoint::from_static("http://127.0.0.1:1").connect_lazy(),
            calls: Default::default(),
            park: None,
            entered: Arc::new(tokio::sync::Semaphore::new(0)),
            release: None,
        };
        let (_, request) = scoped_generated_transactional_outbound_request(
            &resolver,
            &root,
            &scope,
            "example.Actor",
            "B",
            METHOD,
            HealthCheckRequest {
                service: "bound-message".into(),
            },
        )
        .await
        .unwrap();
        let (admitted, mut received) = tokio::sync::mpsc::unbounded_channel();
        let outcome = if success {
            Outcome::Success("B", false)
        } else {
            Outcome::Error(declared("B"))
        };
        let service = crate::successful_trailers::SuccessfulParticipantTrailerLayer.layer(
            HealthServer::new(WireServer {
                outcomes: Arc::new(Mutex::new(vec![outcome].into())),
                admitted,
            }),
        );
        let (service, evidence) = terminal_capture::TerminalCaptureService::new(service);
        let target = scope.binding.as_ref().unwrap().0.clone();
        let result = consume_generated_transactional_unary::<_, _, HealthCheckResponse>(
            service,
            evidence,
            request,
            "/grpc.health.v1.Health/Check".parse().unwrap(),
            &root,
            &mut scope,
            &target,
            &schema(),
        )
        .await;
        assert_eq!(received.recv().await.as_deref(), Some("B"));
        assert!(scope.completed);
        assert!(root.doomed_status().is_none());
        if success {
            assert_eq!(result.unwrap().response().get_ref().status, 1);
            assert_b(&root);
        } else {
            assert_eq!(result.unwrap_err().code(), tonic::Code::Unknown);
            assert!(root.returned_participants_snapshot()[0].read_only);
        }
    }
}

#[tokio::test]
async fn owned_unary_rejects_zero_and_multiple_messages_with_valid_terminal_membership() {
    for (outcome, expected) in [
        (Outcome::EmptyStream, "no response message"),
        (Outcome::MultipleMessages, "multiple response messages"),
    ] {
        let (resolver, mut admitted, server) = wire(vec![outcome]).await;
        let root = context(true);
        let error = call_method(&resolver, &root, "B", "grpc.health.v1.Health.Watch", &[])
            .await
            .unwrap_err();
        assert_eq!(error.code(), tonic::Code::FailedPrecondition);
        assert!(error.message().contains(expected), "{error}");
        assert_eq!(admitted.recv().await.as_deref(), Some("B"));
        assert!(root.doomed_status().is_some());
        assert!(root.seal_explicit_abort().is_err());
        assert!(root.returned_participants_snapshot().is_empty());
        server.abort();
        let _ = server.await;
    }
}

#[tokio::test]
async fn owned_unary_initial_membership_is_not_terminal_evidence() {
    let (resolver, mut admitted, server) = wire(vec![Outcome::InitialOnly]).await;
    let root = context(true);
    let error = call(&resolver, &root, "B", &[]).await.unwrap_err();
    assert_eq!(error.code(), tonic::Code::FailedPrecondition);
    assert_eq!(admitted.recv().await.as_deref(), Some("B"));
    assert!(root.doomed_status().is_some());
    assert!(root.seal_explicit_abort().is_err());
    server.abort();
    let _ = server.await;
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
