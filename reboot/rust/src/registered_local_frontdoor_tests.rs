// Forwarding regressions, including real Tonic HTTP/2 transport.
// These handwritten adapters do not prove generated authentication or native execution.
use super::*;
use std::convert::Infallible;
use std::task::{Context, Poll};
use tonic::server::NamedService;
use tower::Service;

#[derive(Clone)]
struct Opaque(Arc<()>);
#[derive(Clone)]
struct Adapter {
    config: GeneratedLocalAdapterConfig,
    binding: Option<RegisteredAdapterBinding>,
    calls: Arc<std::sync::atomic::AtomicUsize>,
    opaque: Arc<()>,
    held: Arc<std::sync::atomic::AtomicBool>,
    waiter: Arc<std::sync::Mutex<Option<std::task::Waker>>>,
}
impl GeneratedLocalTransactionAdapter for Adapter {
    fn local_configuration(&self) -> Result<GeneratedLocalAdapterConfig, tonic::Status> {
        Ok(self.config.clone())
    }
    fn with_local_registration(
        mut self,
        binding: RegisteredAdapterBinding,
    ) -> Result<Self, tonic::Status> {
        self.binding = Some(binding);
        Ok(self)
    }
}
struct Wire {
    adapter: Adapter,
    ready: bool,
}
impl Clone for Wire {
    fn clone(&self) -> Self {
        Self {
            adapter: self.adapter.clone(),
            ready: false,
        }
    }
}
impl tonic::server::NamedService for Wire {
    const NAME: &'static str = "example.ActorMethods";
}
impl Service<http::Request<tonic::body::BoxBody>> for Wire {
    type Response = http::Response<tonic::body::BoxBody>;
    type Error = Infallible;
    type Future = crate::registered_local_service::LocalServiceFuture;
    fn poll_ready(&mut self, cx: &mut Context<'_>) -> Poll<Result<(), Self::Error>> {
        if self.adapter.held.load(std::sync::atomic::Ordering::SeqCst) {
            *self.adapter.waiter.lock().unwrap() = Some(cx.waker().clone());
            return Poll::Pending;
        }
        if !self.ready {
            self.ready = true;
            cx.waker().wake_by_ref();
            return Poll::Pending;
        }
        Poll::Ready(Ok(()))
    }
    fn call(&mut self, request: http::Request<tonic::body::BoxBody>) -> Self::Future {
        assert!(
            std::mem::take(&mut self.ready),
            "same clone must be readied"
        );
        let status = self
            .adapter
            .binding
            .as_ref()
            .unwrap()
            .require_host_ready(&self.adapter.config);
        if let Err(status) = status {
            return Box::pin(std::future::ready(Ok(status.into_http())));
        }
        assert_eq!(request.method(), http::Method::POST);
        assert_eq!(request.uri().path(), "/example.ActorMethods/Apply");
        assert_eq!(
            request.headers()[crate::STATE_REF_HEADER],
            self.adapter.config.target.state_ref
        );
        assert_eq!(request.headers()["authorization"], "Bearer original");
        assert_eq!(request.headers()["x-opaque-ticket"], "original-ticket");
        assert!(Arc::ptr_eq(
            &request.extensions().get::<Opaque>().unwrap().0,
            &self.adapter.opaque
        ));
        // Actual inbound policy remains authoritative: routing must not turn this denial into success.
        if request.headers().contains_key("x-test-deny") {
            return Box::pin(std::future::ready(Ok(tonic::Status::permission_denied(
                "adapter policy",
            )
            .into_http())));
        }
        self.adapter
            .calls
            .fetch_add(1, std::sync::atomic::Ordering::SeqCst);
        Box::pin(async move {
            if request.version() == http::Version::HTTP_2 {
                use http_body_util::BodyExt;
                assert!(request.uri().scheme().is_some());
                assert!(request.uri().authority().is_some());
                let bytes = request.into_body().collect().await.unwrap().to_bytes();
                assert_eq!(
                    bytes.as_ref(),
                    &[0, 0, 0, 0, 7, 10, 5, b'h', b'e', b'l', b'l', b'o']
                );
                let mut trailers = http::HeaderMap::new();
                trailers.insert("grpc-status", http::HeaderValue::from_static("0"));
                let body = http_body_util::Full::new(bytes::Bytes::from_static(&[0, 0, 0, 0, 0]))
                    .map_err(|never| match never {})
                    .with_trailers(std::future::ready(Some(Ok(trailers))))
                    .boxed_unsync();
                return Ok(http::Response::builder()
                    .header("content-type", "application/grpc")
                    .body(body)
                    .unwrap());
            }
            Ok(http::Response::new(tonic::body::empty_body()))
        })
    }
}
struct Starts;
impl crate::runtime::InboundTransactionStartFactory for Starts {
    fn next_inbound_transaction(
        &self,
        _: &crate::runtime::InboundTransactionContext,
    ) -> Result<uuid::Uuid, tonic::Status> {
        panic!("frontdoor must never allocate inbound transaction")
    }
}
impl crate::registered_local_service::GeneratedLocalTransactionService for Adapter {
    type Service = Wire;
    fn local_service(&self) -> Wire {
        Wire {
            adapter: self.clone(),
            ready: false,
        }
    }
    fn local_inbound_factory(&self) -> Arc<dyn crate::runtime::InboundTransactionStartFactory> {
        Arc::new(Starts)
    }
}
fn owner(id: &str, policy: crate::auth::AuthorizationPolicy) -> Arc<Adapter> {
    Arc::new(Adapter {
        config: GeneratedLocalAdapterConfig {
            target: ParticipantTarget {
                state_type: "example.Actor".into(),
                state_ref: crate::state_ref::StateRef::from_id("example.Actor", id)
                    .unwrap()
                    .to_string(),
            },
            database_endpoint: "http://127.0.0.1:9999".into(),
            policy,
            methods: BTreeSet::from(["example.ActorMethods.Apply".into()]),
            incarnation: Arc::new(()),
        },
        binding: None,
        calls: Arc::new(std::sync::atomic::AtomicUsize::new(0)),
        opaque: Arc::new(()),
        held: Arc::new(std::sync::atomic::AtomicBool::new(false)),
        waiter: Arc::new(std::sync::Mutex::new(None)),
    })
}
fn request(owner: &Adapter) -> http::Request<tonic::body::BoxBody> {
    let mut request = http::Request::builder()
        .method("POST")
        .uri("/example.ActorMethods/Apply")
        .header(crate::STATE_REF_HEADER, &owner.config.target.state_ref)
        .header("authorization", "Bearer original")
        .header("x-opaque-ticket", "original-ticket")
        .body(tonic::body::empty_body())
        .unwrap();
    request
        .extensions_mut()
        .insert(Opaque(owner.opaque.clone()));
    request
}
async fn send(
    route: &mut LateLocalServiceFrontdoor<Adapter, Adapter>,
    request: http::Request<tonic::body::BoxBody>,
) -> http::Response<tonic::body::BoxBody> {
    std::future::poll_fn(|cx| route.poll_ready(cx))
        .await
        .unwrap();
    route.call(request).await.unwrap()
}
fn code(response: &http::Response<tonic::body::BoxBody>) -> Option<&str> {
    response
        .headers()
        .get("grpc-status")
        .map(|value| value.to_str().unwrap())
}
#[tokio::test]
async fn fixed_frontdoor_selects_two_owners_installed_after_router_creation_and_preserves_request()
{
    let mut host = crate::application_host::ApplicationHost::new("late-wire");
    let a = owner("a", crate::auth::AuthorizationPolicy::default());
    let b = owner("b", a.config.policy.clone());
    let family = host
        .register_late_local_service_family(a.config.clone(), 2, |owner: Arc<Adapter>| {
            Ok((*owner).clone())
        })
        .unwrap();
    let mut route = family.public_frontdoor().unwrap();
    assert_eq!(
        <LateLocalServiceFrontdoor<Adapter, Adapter> as tonic::server::NamedService>::NAME,
        Wire::NAME
    );
    // Exercise actual public mounting API before either install; family stays usable after host moves.
    let _mounted = host.add_public_service(route.clone());
    for owner in [&a, &b] {
        family
            .install(owner.config.target.clone(), owner.clone())
            .unwrap();
    }
    assert_eq!(code(&send(&mut route, request(&a)).await), Some("14"));
    // Private host gate only for this isolated forwarding regression, not production readiness API.
    let state = family.state.upgrade().unwrap();
    let binding = state.lock().unwrap().services[&a.config.target]
        .binding
        .clone();
    // Receiver cannot open readiness. A second test below uses registry's real gate sender.
    assert!(binding.require_host_ready(&a.config).is_err());
}
#[tokio::test]
async fn frontdoor_exact_lookup_denials_and_same_clone_forwarding() {
    let mut registry = HostLocalRegistry::default();
    let host = crate::application_host::ApplicationHost::new("cleanup-source");
    let a = owner("a", crate::auth::AuthorizationPolicy::default());
    let b = owner("b", a.config.policy.clone());
    // Obtain the real cleanup binding through a host family, then use an isolated registry
    // so readiness/revocation transitions are directly controlled without a listener.
    let mut host = host;
    let seed = host
        .register_late_local_service_family(a.config.clone(), 1, |owner: Arc<Adapter>| {
            Ok((*owner).clone())
        })
        .unwrap();
    let family = registry
        .late_service_family(
            a.config.clone(),
            2,
            seed.cleanup.clone(),
            |owner: Arc<Adapter>| Ok((*owner).clone()),
        )
        .unwrap();
    let mut route = family.public_frontdoor().unwrap();
    let unknown = send(&mut route, request(&a)).await;
    assert_eq!(code(&unknown), Some("14"));
    for item in [&a, &b] {
        family
            .install(item.config.target.clone(), item.clone())
            .unwrap();
        assert!(Arc::ptr_eq(
            &family.lookup_installed(&item.config.target).unwrap().0,
            item
        ));
    }
    assert_eq!(code(&send(&mut route, request(&a)).await), Some("14"));
    registry.gate.send_replace(HostLocalState::Ready);
    for item in [&a, &b] {
        assert_eq!(code(&send(&mut route, request(item)).await), None);
        assert_eq!(item.calls.load(std::sync::atomic::Ordering::SeqCst), 1);
    }
    let mut denied = request(&a);
    denied
        .headers_mut()
        .insert("x-test-deny", "1".parse().unwrap());
    assert_eq!(code(&send(&mut route, denied).await), Some("7"));
    for path in [
        "/example.ActorMethods/Unknown",
        "/foreign.Service/Apply",
        "/example.ActorMethods/Apply?x=1",
        "/example.ActorMethods/%41pply",
    ] {
        let mut invalid = request(&a);
        *invalid.uri_mut() = path.parse().unwrap();
        assert!(code(&send(&mut route, invalid).await).is_some());
    }
    // Authority is deliberately not used as actor identity or authorization.
    let mut absolute = request(&b);
    *absolute.uri_mut() = "http://foreign/example.ActorMethods/Apply".parse().unwrap();
    assert_eq!(code(&send(&mut route, absolute).await), None);
    let foreign = crate::state_ref::StateRef::from_id("foreign.Actor", "a")
        .unwrap()
        .to_string();
    for value in ["example.Actor:a", "unknown", foreign.as_str(), "", "AA:a/"] {
        let mut invalid = request(&a);
        invalid
            .headers_mut()
            .insert(crate::STATE_REF_HEADER, value.parse().unwrap());
        assert!(code(&send(&mut route, invalid).await).is_some());
    }
    let mut duplicate = request(&a);
    duplicate.headers_mut().append(
        crate::STATE_REF_HEADER,
        a.config.target.state_ref.parse().unwrap(),
    );
    assert_eq!(code(&send(&mut route, duplicate).await), Some("3"));
    let unknown = owner("not-installed", a.config.policy.clone());
    assert_eq!(code(&send(&mut route, request(&unknown)).await), Some("14"));
    registry.revoke();
    assert_eq!(code(&send(&mut route, request(&a)).await), Some("1"));
    assert_eq!(a.calls.load(std::sync::atomic::Ordering::SeqCst), 1);
}

// Inject a server-local opaque extension before the frontdoor; extensions are not
// serialized over HTTP/2. Its allocation must survive routing unchanged.
#[derive(Clone)]
struct Ingress {
    route: LateLocalServiceFrontdoor<Adapter, Adapter>,
    opaque: Arc<()>,
}
impl NamedService for Ingress {
    const NAME: &'static str = Wire::NAME;
}
impl Service<http::Request<tonic::body::BoxBody>> for Ingress {
    type Response = http::Response<tonic::body::BoxBody>;
    type Error = Infallible;
    type Future = crate::registered_local_service::LocalServiceFuture;
    fn poll_ready(&mut self, cx: &mut Context<'_>) -> Poll<Result<(), Self::Error>> {
        self.route.poll_ready(cx)
    }
    fn call(&mut self, mut request: http::Request<tonic::body::BoxBody>) -> Self::Future {
        assert_eq!(request.version(), http::Version::HTTP_2);
        assert!(request.uri().authority().is_some());
        request.extensions_mut().insert(Opaque(self.opaque.clone()));
        Box::pin(self.route.call(request))
    }
}
#[derive(Clone, PartialEq, prost::Message)]
struct Payload {
    #[prost(string, tag = "1")]
    text: String,
}

#[tokio::test]
async fn real_tonic_http2_authority_reaches_installed_adapter() {
    let mut registry = HostLocalRegistry::default();
    let mut host = crate::application_host::ApplicationHost::new("h2-cleanup");
    let a = owner("h2-a", crate::auth::AuthorizationPolicy::default());
    let b = owner("h2-b", a.config.policy.clone());
    let seed = host
        .register_late_local_service_family(a.config.clone(), 1, |o: Arc<Adapter>| Ok((*o).clone()))
        .unwrap();
    let family = registry
        .late_service_family(
            a.config.clone(),
            2,
            seed.cleanup.clone(),
            |o: Arc<Adapter>| Ok((*o).clone()),
        )
        .unwrap();
    let route = family.public_frontdoor().unwrap();
    for item in [&a, &b] {
        family
            .install(item.config.target.clone(), item.clone())
            .unwrap();
    }
    // Isolated gate exercises forwarding only, not ApplicationHost startup readiness.
    registry.gate.send_replace(HostLocalState::Ready);
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    let (stop, stopped) = tokio::sync::oneshot::channel();
    let server = tokio::spawn(
        tonic::transport::Server::builder()
            .add_service(Ingress {
                route,
                opaque: b.opaque.clone(),
            })
            .serve_with_incoming_shutdown(
                tokio_stream::wrappers::TcpListenerStream::new(listener),
                async move {
                    let _ = stopped.await;
                },
            ),
    );
    let channel = tonic::transport::Endpoint::from_shared(format!("http://{address}"))
        .unwrap()
        .connect()
        .await
        .unwrap();
    let mut client = tonic::client::Grpc::new(channel);
    client.ready().await.unwrap();
    let mut request = tonic::Request::new(Payload {
        text: "hello".into(),
    });
    request.metadata_mut().insert(
        crate::STATE_REF_HEADER,
        b.config.target.state_ref.parse().unwrap(),
    );
    request
        .metadata_mut()
        .insert("authorization", "Bearer original".parse().unwrap());
    request
        .metadata_mut()
        .insert("x-opaque-ticket", "original-ticket".parse().unwrap());
    let result: Result<tonic::Response<Payload>, _> = client
        .unary(
            request,
            http::uri::PathAndQuery::from_static("/example.ActorMethods/Apply"),
            tonic::codec::ProstCodec::default(),
        )
        .await;
    drop(client);
    let _ = stop.send(());
    server.await.unwrap().unwrap();
    assert_eq!(result.unwrap().into_inner().text, "");
    assert_eq!(a.calls.load(std::sync::atomic::Ordering::SeqCst), 0);
    assert_eq!(b.calls.load(std::sync::atomic::Ordering::SeqCst), 1);
}

#[tokio::test]
async fn revocation_while_adapter_readiness_is_pending_prevents_call() {
    let mut registry = HostLocalRegistry::default();
    let mut host = crate::application_host::ApplicationHost::new("pending-cleanup");
    let a = owner("pending", crate::auth::AuthorizationPolicy::default());
    let seed = host
        .register_late_local_service_family(a.config.clone(), 1, |o: Arc<Adapter>| Ok((*o).clone()))
        .unwrap();
    let family = registry
        .late_service_family(
            a.config.clone(),
            1,
            seed.cleanup.clone(),
            |o: Arc<Adapter>| Ok((*o).clone()),
        )
        .unwrap();
    family.install(a.config.target.clone(), a.clone()).unwrap();
    registry.gate.send_replace(HostLocalState::Ready);
    a.held.store(true, std::sync::atomic::Ordering::SeqCst);
    let mut route = family.public_frontdoor().unwrap();
    let mut future = route.call(request(&a));
    // Poll until the selected adapter itself reports Pending, without sleeps or
    // relying on the host gate being Ready as a readiness barrier.
    std::future::poll_fn(|cx| {
        assert!(future.as_mut().poll(cx).is_pending());
        assert!(a.waiter.lock().unwrap().is_some());
        Poll::Ready(())
    })
    .await;
    registry.revoke();
    a.held.store(false, std::sync::atomic::Ordering::SeqCst);
    a.waiter.lock().unwrap().take().unwrap().wake();
    assert_eq!(code(&future.await.unwrap()), Some("1"));
    assert_eq!(a.calls.load(std::sync::atomic::Ordering::SeqCst), 0);
}
