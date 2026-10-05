//! Generic Tonic application host with a server-owned application identity.
//!
//! Python's `ServiceServer` installs `UseApplicationIdInterceptor` for every
//! service it registers.  The Rust host makes the corresponding boundary a
//! mandatory Tower layer: callers cannot select target application identity
//! through `x-reboot-application-id` metadata.

use std::{
    convert::Infallible,
    error::Error,
    fmt,
    future::Future,
    net::SocketAddr,
    sync::Arc,
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

/// A host-owned lifecycle component.
///
/// Components run in registration order. The host runs every `initialize`,
/// then every `recover`, before binding the gRPC listener. If either phase
/// fails, it runs `shutdown` for the components that were initialized and does
/// not open the listener. Once a listener has stopped, `shutdown` runs for all
/// initialized components in registration order.
///
/// This is deliberately a generic host hook, not Reboot durable recovery:
/// there is not yet an ApplicationHost connection to the actor sidecar,
/// placement, or generated adapters needed to invoke their recovery APIs.
#[tonic::async_trait]
pub trait ApplicationLifecycle: Send + Sync + 'static {
    /// Construct non-serving application resources.
    async fn initialize(&self) -> Result<(), tonic::Status>;

    /// Complete recovery required before this host accepts RPCs.
    async fn recover(&self) -> Result<(), tonic::Status>;

    /// Release resources after serving has stopped or startup has failed.
    async fn shutdown(&self) -> Result<(), tonic::Status>;
}

/// The lifecycle phase that produced an [`ApplicationHostError`].
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ApplicationLifecyclePhase {
    Initialize,
    Recover,
    Shutdown,
}

/// A failure while starting, serving, or stopping an [`ApplicationHost`].
#[derive(Debug)]
pub enum ApplicationHostError {
    Lifecycle {
        phase: ApplicationLifecyclePhase,
        component: usize,
        source: tonic::Status,
    },
    Transport(tonic::transport::Error),
}

impl fmt::Display for ApplicationHostError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Lifecycle {
                phase,
                component,
                source,
            } => write!(
                formatter,
                "application lifecycle component {component} failed during {phase:?}: {source}"
            ),
            Self::Transport(source) => {
                write!(formatter, "application host transport failed: {source}")
            }
        }
    }
}

impl Error for ApplicationHostError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Lifecycle { source, .. } => Some(source),
            Self::Transport(source) => Some(source),
        }
    }
}

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
pub struct ApplicationHost {
    application_id: String,
    server: Server<TrustedIngressStack>,
    lifecycle: Vec<Arc<dyn ApplicationLifecycle>>,
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
            lifecycle: Vec::new(),
        }
    }

    /// The application identity this host injects for every registered route.
    pub fn application_id(&self) -> &str {
        &self.application_id
    }

    /// Adds a component whose initialization and recovery must finish before
    /// this host listens for RPCs.
    pub fn with_lifecycle(mut self, lifecycle: impl ApplicationLifecycle) -> Self {
        self.lifecycle.push(Arc::new(lifecycle));
        self
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
            lifecycle: self.lifecycle,
            router: self.server.add_service(service),
        }
    }
}

/// A generic host with at least one registered generated Tonic service.
pub struct RunningApplicationHost {
    application_id: String,
    lifecycle: Vec<Arc<dyn ApplicationLifecycle>>,
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
            lifecycle: self.lifecycle,
            router: self.router.add_service(service),
        }
    }

    /// Starts every registered service. The host consumes itself so its trusted
    /// identity and route registry cannot be changed after serving begins.
    pub async fn serve(self, address: SocketAddr) -> Result<(), ApplicationHostError> {
        self.serve_with_shutdown(address, std::future::pending())
            .await
    }

    /// Starts the lifecycle and registered services, then coordinates graceful
    /// Tonic shutdown with lifecycle cleanup.
    pub async fn serve_with_shutdown<F>(
        self,
        address: SocketAddr,
        shutdown: F,
    ) -> Result<(), ApplicationHostError>
    where
        F: Future<Output = ()> + Send + 'static,
    {
        let RunningApplicationHost {
            lifecycle, router, ..
        } = self;
        Self::start_lifecycle(&lifecycle).await?;
        let serving = router.serve_with_shutdown(address, shutdown).await;
        // Tonic has stopped accepting RPCs before lifecycle resources are torn
        // down. Run cleanup even if serving itself returned an error.
        Self::shutdown_lifecycle(&lifecycle).await?;
        serving.map_err(ApplicationHostError::Transport)
    }

    async fn start_lifecycle(
        lifecycle: &[Arc<dyn ApplicationLifecycle>],
    ) -> Result<(), ApplicationHostError> {
        let mut initialized = 0;
        for (component, component_lifecycle) in lifecycle.iter().enumerate() {
            if let Err(source) = component_lifecycle.initialize().await {
                Self::shutdown_initialized(lifecycle, initialized).await?;
                return Err(ApplicationHostError::Lifecycle {
                    phase: ApplicationLifecyclePhase::Initialize,
                    component,
                    source,
                });
            }
            initialized += 1;
        }

        for (component, component_lifecycle) in lifecycle.iter().enumerate() {
            if let Err(source) = component_lifecycle.recover().await {
                Self::shutdown_initialized(lifecycle, initialized).await?;
                return Err(ApplicationHostError::Lifecycle {
                    phase: ApplicationLifecyclePhase::Recover,
                    component,
                    source,
                });
            }
        }
        Ok(())
    }

    async fn shutdown_lifecycle(
        lifecycle: &[Arc<dyn ApplicationLifecycle>],
    ) -> Result<(), ApplicationHostError> {
        Self::shutdown_initialized(lifecycle, lifecycle.len()).await
    }

    async fn shutdown_initialized(
        lifecycle: &[Arc<dyn ApplicationLifecycle>],
        initialized: usize,
    ) -> Result<(), ApplicationHostError> {
        for (component, component_lifecycle) in lifecycle.iter().take(initialized).enumerate() {
            component_lifecycle.shutdown().await.map_err(|source| {
                ApplicationHostError::Lifecycle {
                    phase: ApplicationLifecyclePhase::Shutdown,
                    component,
                    source,
                }
            })?;
        }
        Ok(())
    }
}
