//! Generic Tonic application host with a server-owned application identity.
//!
//! Python's `ServiceServer` installs `UseApplicationIdInterceptor` for every
//! service it registers.  The Rust host makes the corresponding boundary a
//! mandatory Tower layer: callers cannot select target application identity
//! through `x-reboot-application-id` metadata.

use std::{
    convert::Infallible,
    net::SocketAddr,
    task::{Context, Poll},
};

use http::Request as HttpRequest;
use tonic::{
    Request,
    body::BoxBody,
    codegen::http::Response as HttpResponse,
    server::NamedService,
    transport::{Server, server::Router},
};
use tower::{
    Layer, Service,
    layer::util::{Identity, Stack},
};

type TrustedIngressStack = Stack<TrustedApplicationIngress, Identity>;

use crate::APPLICATION_ID_HEADER;

/// Server-owned target application identity available to registered handlers.
///
/// The constructor is deliberately private.  A handler may inspect this value
/// only after [`ApplicationHost`] has injected it at gRPC ingress.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TrustedApplicationContext {
    application_id: String,
}

impl TrustedApplicationContext {
    /// The immutable application identity selected by the host owner.
    pub fn application_id(&self) -> &str {
        &self.application_id
    }

    /// Returns the identity injected into this request by an
    /// [`ApplicationHost`].
    pub fn from_request<T>(request: &Request<T>) -> Option<&Self> {
        request.extensions().get()
    }
}

/// Mandatory ingress layer used by [`ApplicationHost`].
///
/// The layer removes a caller-supplied target application header before a
/// generated or handwritten handler can inspect it, then inserts its own
/// immutable context in request extensions.
#[derive(Clone, Debug)]
pub struct TrustedApplicationIngress {
    context: TrustedApplicationContext,
}

impl TrustedApplicationIngress {
    fn new(application_id: String) -> Self {
        Self {
            context: TrustedApplicationContext { application_id },
        }
    }
}

impl<S> Layer<S> for TrustedApplicationIngress {
    type Service = TrustedApplicationService<S>;

    fn layer(&self, inner: S) -> Self::Service {
        TrustedApplicationService {
            inner,
            context: self.context.clone(),
        }
    }
}

#[derive(Clone, Debug)]
pub struct TrustedApplicationService<S> {
    inner: S,
    context: TrustedApplicationContext,
}

impl<S, B> Service<HttpRequest<B>> for TrustedApplicationService<S>
where
    S: Service<HttpRequest<B>>,
{
    type Response = S::Response;
    type Error = S::Error;
    type Future = S::Future;

    fn poll_ready(&mut self, cx: &mut Context<'_>) -> Poll<Result<(), Self::Error>> {
        self.inner.poll_ready(cx)
    }

    fn call(&mut self, mut request: HttpRequest<B>) -> Self::Future {
        // This is target/server identity, never caller authority.  Mask all
        // values (including duplicates) before dispatch rather than accepting
        // a spoofed value or leaving it observable to generated handlers.
        request.headers_mut().remove(APPLICATION_ID_HEADER);
        request.extensions_mut().insert(self.context.clone());
        self.inner.call(request)
    }
}

/// First-stage generic host. It owns one immutable application ID and has no
/// service routes until [`Self::add_service`] is called.
#[derive(Debug)]
pub struct ApplicationHost {
    application_id: String,
    server: Server<TrustedIngressStack>,
}

impl ApplicationHost {
    /// Creates a host whose application identity is selected by the server
    /// owner, not from inbound metadata.
    pub fn new(application_id: impl Into<String>) -> Self {
        let application_id = application_id.into();
        assert!(
            !application_id.is_empty(),
            "application ID must not be empty"
        );
        Self {
            server: Server::builder().layer(TrustedApplicationIngress::new(application_id.clone())),
            application_id,
        }
    }

    /// The application identity this host injects for every registered route.
    pub fn application_id(&self) -> &str {
        &self.application_id
    }

    /// Registers the first generated Tonic service and returns a serving host.
    pub fn add_service<S>(mut self, service: S) -> RunningApplicationHost
    where
        S: Service<http::Request<BoxBody>, Response = HttpResponse<BoxBody>, Error = Infallible>
            + NamedService
            + Clone
            + Send
            + 'static,
        S::Future: Send + 'static,
    {
        RunningApplicationHost {
            application_id: self.application_id,
            router: self.server.add_service(service),
        }
    }
}

/// A generic host with at least one registered generated Tonic service.
#[derive(Debug)]
pub struct RunningApplicationHost {
    application_id: String,
    router: Router<TrustedIngressStack>,
}

impl RunningApplicationHost {
    /// The immutable application identity used by this server.
    pub fn application_id(&self) -> &str {
        &self.application_id
    }

    /// Registers another generated Tonic service on the same trusted ingress.
    pub fn add_service<S>(self, service: S) -> Self
    where
        S: Service<http::Request<BoxBody>, Response = HttpResponse<BoxBody>, Error = Infallible>
            + NamedService
            + Clone
            + Send
            + 'static,
        S::Future: Send + 'static,
    {
        Self {
            application_id: self.application_id,
            router: self.router.add_service(service),
        }
    }

    /// Starts every registered service. The host consumes itself so its trusted
    /// identity and route registry cannot be changed after serving begins.
    pub async fn serve(self, address: SocketAddr) -> Result<(), tonic::transport::Error> {
        self.router.serve(address).await
    }
}
