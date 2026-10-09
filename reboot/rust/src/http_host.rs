//! Bounded external HTTP registration owned by [`ApplicationHost`](crate::application_host::ApplicationHost).
//!
//! This is intentionally a small external-only surface: GET/POST/OPTIONS
//! handlers receive server-owned application identity and an untrusted
//! [`ExternalContext`]. App-internal routes, mounts, OAuth, websockets,
//! streaming, and static serving remain outside this host.

use std::{future::Future, net::SocketAddr, pin::Pin, sync::Arc};

use axum::{
    Router,
    extract::Request,
    response::Response,
    routing::{get, options, post},
};

use crate::{
    ExternalContext,
    application_host::{
        ApplicationHostError, ApplicationLifecycle, ApplicationLifecyclePhase,
        TrustedApplicationContext,
    },
};

/// Server-owned identity and untrusted external caller context for one HTTP
/// handler invocation.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct HttpRequestContext {
    application: TrustedApplicationContext,
    external: ExternalContext,
}

impl HttpRequestContext {
    /// The immutable application identity selected by the host owner.
    pub fn application(&self) -> &TrustedApplicationContext {
        &self.application
    }

    /// External caller context. Its caller ID is absent; only an exactly
    /// two-token case-insensitive `Authorization: Bearer <token>` is copied.
    pub fn external(&self) -> &ExternalContext {
        &self.external
    }
}

type BoxHandlerFuture = Pin<Box<dyn Future<Output = Response> + Send>>;
type HttpRequestHandler =
    Arc<dyn Fn(HttpRequestContext, Request) -> BoxHandlerFuture + Send + Sync>;

/// An `ApplicationHost` configured with bounded external HTTP routes.
pub struct HttpApplicationHost {
    application_id: String,
    lifecycle: Vec<Arc<dyn ApplicationLifecycle>>,
    router: Router,
}

impl HttpApplicationHost {
    pub(crate) fn new(
        application_id: String,
        lifecycle: Vec<Arc<dyn ApplicationLifecycle>>,
    ) -> Self {
        Self {
            application_id,
            lifecycle,
            router: Router::new(),
        }
    }

    /// Registers an external GET route.
    pub fn get<F, Fut>(self, path: &str, handler: F) -> Self
    where
        F: Fn(HttpRequestContext) -> Fut + Send + Sync + 'static,
        Fut: Future<Output = Response> + Send + 'static,
    {
        let application_id = self.application_id.clone();
        self.route(path, get(wrap_handler(application_id, handler)))
    }

    /// Registers an external POST route.
    pub fn post<F, Fut>(self, path: &str, handler: F) -> Self
    where
        F: Fn(HttpRequestContext) -> Fut + Send + Sync + 'static,
        Fut: Future<Output = Response> + Send + 'static,
    {
        let application_id = self.application_id.clone();
        self.route(path, post(wrap_handler(application_id, handler)))
    }

    /// Registers an external OPTIONS route, for explicit CORS preflight use.
    pub fn options<F, Fut>(self, path: &str, handler: F) -> Self
    where
        F: Fn(HttpRequestContext) -> Fut + Send + Sync + 'static,
        Fut: Future<Output = Response> + Send + 'static,
    {
        let application_id = self.application_id.clone();
        self.route(path, options(wrap_handler(application_id, handler)))
    }

    /// Registers an external GET route with its original request.
    /// Headers, URI, extensions and streaming body remain untrusted. Only the
    /// companion context carries host-selected identity; bound body consumption
    /// explicitly (for example with `axum::body::to_bytes(body, limit)`).
    pub fn get_with_request<F, Fut>(self, path: &str, handler: F) -> Self
    where
        F: Fn(HttpRequestContext, Request) -> Fut + Send + Sync + 'static,
        Fut: Future<Output = Response> + Send + 'static,
    {
        let application_id = self.application_id.clone();
        self.route(path, get(wrap_request_handler(application_id, handler)))
    }

    /// Registers an external POST route with its original request.
    /// Headers, URI, extensions and streaming body remain untrusted. Only the
    /// companion context carries host-selected identity; bound body consumption
    /// explicitly (for example with `axum::body::to_bytes(body, limit)`).
    pub fn post_with_request<F, Fut>(self, path: &str, handler: F) -> Self
    where
        F: Fn(HttpRequestContext, Request) -> Fut + Send + Sync + 'static,
        Fut: Future<Output = Response> + Send + 'static,
    {
        let application_id = self.application_id.clone();
        self.route(path, post(wrap_request_handler(application_id, handler)))
    }

    /// Registers an external OPTIONS route with its original request.
    /// Headers, URI, extensions and streaming body remain untrusted. Only the
    /// companion context carries host-selected identity; bound body consumption
    /// explicitly (for example with `axum::body::to_bytes(body, limit)`).
    pub fn options_with_request<F, Fut>(self, path: &str, handler: F) -> Self
    where
        F: Fn(HttpRequestContext, Request) -> Fut + Send + Sync + 'static,
        Fut: Future<Output = Response> + Send + 'static,
    {
        let application_id = self.application_id.clone();
        self.route(path, options(wrap_request_handler(application_id, handler)))
    }

    fn route(mut self, path: &str, method_router: axum::routing::MethodRouter) -> Self {
        self.router = self.router.route(path, method_router);
        self
    }

    /// Runs cancellable lifecycle startup before accepting HTTP, reusing one
    /// caller shutdown future through graceful server termination. An interrupted
    /// hook is dropped before cleanup; only completed initialization is cleaned.
    /// Hooks must be cancellation-safe and own partial initialization via RAII.
    /// Cleanup visits every initialized component despite returned errors, but
    /// uncooperative cleanup and external abort of this future are not bounded.
    pub async fn serve_with_shutdown<F>(
        self,
        address: SocketAddr,
        shutdown: F,
    ) -> Result<(), ApplicationHostError>
    where
        F: Future<Output = ()> + Send + 'static,
    {
        // Own one pinned caller shutdown future from the first hook through serving.
        let mut shutdown = Box::pin(shutdown);
        if !start_lifecycle(&self.lifecycle, &mut shutdown.as_mut()).await? {
            return Ok(());
        }
        let result = async move {
            let listener = tokio::net::TcpListener::bind(address)
                .await
                .map_err(ApplicationHostError::Bind)?;
            axum::serve(listener, self.router)
                .with_graceful_shutdown(shutdown)
                .await
                .map_err(ApplicationHostError::HttpTransport)
        }
        .await;
        let cleanup = shutdown_lifecycle(&self.lifecycle).await;
        result.and(cleanup)
    }
}

// Returns false after an observed shutdown. Each select owns its hook future:
// interruption drops its RAII resources before any cleanup await begins.
async fn start_lifecycle<F>(
    lifecycle: &[Arc<dyn ApplicationLifecycle>],
    shutdown: &mut std::pin::Pin<&mut F>,
) -> Result<bool, ApplicationHostError>
where
    F: Future<Output = ()> + Send,
{
    // Also honor an already-ready shutdown when there are no lifecycle hooks.
    let stopped = tokio::select! {
        biased;
        _ = shutdown.as_mut() => true,
        _ = std::future::ready(()) => false,
    };
    if stopped {
        return Ok(false);
    }
    let mut initialized = 0;
    for phase in [
        ApplicationLifecyclePhase::Initialize,
        ApplicationLifecyclePhase::Recover,
    ] {
        for (component, component_lifecycle) in lifecycle.iter().enumerate() {
            let result = tokio::select! {
                biased;
                _ = shutdown.as_mut() => None,
                result = async {
                    match phase {
                        ApplicationLifecyclePhase::Initialize => component_lifecycle.initialize().await,
                        ApplicationLifecyclePhase::Recover => component_lifecycle.recover().await,
                        ApplicationLifecyclePhase::Shutdown => unreachable!(),
                    }
                } => Some(result),
            };
            match result {
                None => {
                    shutdown_initialized(lifecycle, initialized).await?;
                    return Ok(false);
                }
                Some(Err(source)) => {
                    // Drain every initialized component, retaining the primary error.
                    let _ = shutdown_initialized(lifecycle, initialized).await;
                    return Err(ApplicationHostError::Lifecycle {
                        phase,
                        component,
                        source,
                    });
                }
                Some(Ok(())) => {
                    if phase == ApplicationLifecyclePhase::Initialize {
                        initialized += 1;
                    }
                }
            }
        }
    }
    // A final hook can make shutdown ready while itself completing. Recheck
    // before binding, including the empty-registration boundary.
    let stopped = tokio::select! {
        biased;
        _ = shutdown.as_mut() => true,
        _ = std::future::ready(()) => false,
    };
    if stopped {
        shutdown_initialized(lifecycle, initialized).await?;
        return Ok(false);
    }
    Ok(true)
}

async fn shutdown_lifecycle(
    lifecycle: &[Arc<dyn ApplicationLifecycle>],
) -> Result<(), ApplicationHostError> {
    shutdown_initialized(lifecycle, lifecycle.len()).await
}

async fn shutdown_initialized(
    lifecycle: &[Arc<dyn ApplicationLifecycle>],
    initialized: usize,
) -> Result<(), ApplicationHostError> {
    let mut first_error = None;
    for (component, component_lifecycle) in lifecycle.iter().take(initialized).enumerate() {
        if let Err(source) = component_lifecycle.shutdown().await {
            first_error.get_or_insert(ApplicationHostError::Lifecycle {
                phase: ApplicationLifecyclePhase::Shutdown,
                component,
                source,
            });
        }
    }
    match first_error {
        Some(error) => Err(error),
        None => Ok(()),
    }
}

fn wrap_handler<F, Fut>(
    application_id: String,
    handler: F,
) -> impl Fn(Request) -> BoxHandlerFuture + Clone
where
    F: Fn(HttpRequestContext) -> Fut + Send + Sync + 'static,
    Fut: Future<Output = Response> + Send + 'static,
{
    wrap_request_handler(application_id, move |context, _request| handler(context))
}

fn wrap_request_handler<F, Fut>(
    application_id: String,
    handler: F,
) -> impl Fn(Request) -> BoxHandlerFuture + Clone
where
    F: Fn(HttpRequestContext, Request) -> Fut + Send + Sync + 'static,
    Fut: Future<Output = Response> + Send + 'static,
{
    let handler: HttpRequestHandler =
        Arc::new(move |context, request| Box::pin(handler(context, request)));
    move |request: Request| {
        let handler = handler.clone();
        let application = TrustedApplicationContext::for_host(application_id.clone());
        let method = request.method().as_str().to_owned();
        let path = request.uri().path().to_owned();
        let bearer_token = request
            .headers()
            .get(http::header::AUTHORIZATION)
            .and_then(|value| value.to_str().ok())
            .and_then(parse_bearer_token);
        Box::pin(async move {
            handler(
                HttpRequestContext {
                    application,
                    external: ExternalContext::for_http(&method, &path, bearer_token),
                },
                request,
            )
            .await
        })
    }
}

/// Python uses `authorization.split()` and accepts only exactly two parts with
/// a case-insensitive bearer scheme. Keep this helper deliberately narrow.
fn parse_bearer_token(value: &str) -> Option<String> {
    let mut parts = value.split_whitespace();
    let scheme = parts.next()?;
    let token = parts.next()?;
    if parts.next().is_none() && scheme.eq_ignore_ascii_case("bearer") {
        Some(token.to_owned())
    } else {
        None
    }
}

#[cfg(test)]
mod tests {
    use std::{
        net::{Ipv4Addr, SocketAddr, TcpListener},
        time::Duration,
    };

    use axum::{body::Body, response::Response};
    use http_body_util::{BodyExt, Empty};
    use hyper::{Request, client::conn::http1};
    use hyper_util::rt::TokioIo;

    use super::parse_bearer_token;
    use crate::application_host::ApplicationHost;

    #[test]
    fn bearer_parsing_matches_python_two_token_rule() {
        assert_eq!(parse_bearer_token("bEaReR token"), Some("token".into()));
        assert_eq!(parse_bearer_token("Bearer token extra"), None);
        assert_eq!(parse_bearer_token("Basic token"), None);
        assert_eq!(parse_bearer_token("Bearer"), None);
    }

    fn unused_local_address() -> SocketAddr {
        let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).unwrap();
        let address = listener.local_addr().unwrap();
        drop(listener);
        address
    }

    async fn request(address: SocketAddr, method: &str, authorization: Option<&str>) -> String {
        let stream = tokio::net::TcpStream::connect(address).await.unwrap();
        let (mut sender, connection) = http1::handshake(TokioIo::new(stream)).await.unwrap();
        tokio::spawn(async move { connection.await.unwrap() });
        let mut request = Request::builder()
            .method(method)
            .uri(format!("http://{address}/context"))
            .body(Empty::<bytes::Bytes>::new())
            .unwrap();
        if let Some(authorization) = authorization {
            request
                .headers_mut()
                .insert("authorization", authorization.parse().unwrap());
        }
        let response = sender.send_request(request).await.unwrap();
        String::from_utf8(
            response
                .into_body()
                .collect()
                .await
                .unwrap()
                .to_bytes()
                .to_vec(),
        )
        .unwrap()
    }

    #[tokio::test]
    async fn external_routes_are_reached_through_http_and_receive_only_external_identity() {
        let address = unused_local_address();
        let (shutdown_tx, shutdown_rx) = tokio::sync::oneshot::channel();
        let host = ApplicationHost::new("server-owned-app")
            .http()
            .get(
                "/context",
                |context| async move { context_response(context) },
            )
            .post(
                "/context",
                |context| async move { context_response(context) },
            )
            .options(
                "/context",
                |context| async move { context_response(context) },
            );
        let server = tokio::spawn(async move {
            host.serve_with_shutdown(address, async move { shutdown_rx.await.unwrap() })
                .await
                .unwrap();
        });
        tokio::time::timeout(Duration::from_secs(1), async {
            loop {
                if tokio::net::TcpStream::connect(address).await.is_ok() {
                    break;
                }
                tokio::task::yield_now().await;
            }
        })
        .await
        .unwrap();
        assert_eq!(
            request(address, "GET", Some("bEaReR token")).await,
            "server-owned-app|HTTP GET '/context'|Some(\"token\")|None"
        );
        assert_eq!(
            request(address, "POST", Some("Bearer token extra")).await,
            "server-owned-app|HTTP POST '/context'|None|None"
        );
        assert_eq!(
            request(address, "OPTIONS", Some("Bearer")).await,
            "server-owned-app|HTTP OPTIONS '/context'|None|None"
        );
        shutdown_tx.send(()).unwrap();
        server.await.unwrap();
    }

    #[tokio::test]
    async fn request_wrapper_preserves_body_uri_extensions_and_identity_snapshot() {
        let wrapped =
            super::wrap_request_handler("real-app".into(), |context, mut request| async move {
                assert_eq!(context.application().application_id(), "real-app");
                assert_eq!(context.external().headers().caller_id, None);
                assert_eq!(
                    context.external().headers().bearer_token.as_deref(),
                    Some("original")
                );
                assert_eq!(request.method(), "POST");
                assert_eq!(request.uri().path(), "/records/item");
                assert_eq!(request.uri().query(), Some("mode=exact"));
                assert_eq!(request.extensions().get::<u32>(), Some(&42));
                request
                    .headers_mut()
                    .insert("authorization", "Bearer replacement".parse().unwrap());
                request
                    .headers_mut()
                    .insert("x-reboot-application-id", "spoof".parse().unwrap());
                assert_eq!(
                    context.external().headers().bearer_token.as_deref(),
                    Some("original")
                );
                assert_eq!(context.application().application_id(), "real-app");
                *request.method_mut() = http::Method::GET;
                *request.uri_mut() = "/spoofed?identity=wrong".parse().unwrap();
                assert_eq!(context.external().name(), Some("HTTP POST '/records/item'"));
                let body = axum::body::to_bytes(request.into_body(), 1024)
                    .await
                    .unwrap();
                assert_eq!(body.as_ref(), b"payload");
                Response::new(Body::from("preserved"))
            });
        let mut request = Request::builder()
            .method("POST")
            .uri("/records/item?mode=exact")
            .header("authorization", "bEaReR original")
            .header("x-reboot-caller-id", "admin")
            .body(Body::from("payload"))
            .unwrap();
        request.extensions_mut().insert(42_u32);
        let response = wrapped(request).await;
        assert_eq!(
            response.into_body().collect().await.unwrap().to_bytes(),
            "preserved"
        );
    }

    #[tokio::test]
    async fn request_aware_routes_reach_get_post_options_and_enforce_explicit_body_bound() {
        let address = unused_local_address();
        let (shutdown_tx, shutdown_rx) = tokio::sync::oneshot::channel();
        let handler = |context: super::HttpRequestContext, request: axum::extract::Request| async move {
            let method = request.method().as_str().to_owned();
            let query = request.uri().query().unwrap_or("").to_owned();
            match axum::body::to_bytes(request.into_body(), 4).await {
                Ok(body) => Response::new(Body::from(format!(
                    "{}|{}|{}|{}",
                    context.application().application_id(),
                    method,
                    query,
                    String::from_utf8_lossy(&body)
                ))),
                Err(_) => Response::builder().status(413).body(Body::empty()).unwrap(),
            }
        };
        let host = ApplicationHost::new("owned")
            .http()
            .get_with_request("/records/:item", handler)
            .post_with_request("/records/:item", handler)
            .options_with_request("/records/:item", handler);
        let server = tokio::spawn(async move {
            host.serve_with_shutdown(address, async move {
                let _ = shutdown_rx.await;
            })
            .await
            .unwrap();
        });
        tokio::time::timeout(Duration::from_secs(2), async {
            while tokio::net::TcpStream::connect(address).await.is_err() {
                tokio::task::yield_now().await;
            }
        })
        .await
        .unwrap();
        for method in ["GET", "POST", "OPTIONS"] {
            let (status, body) =
                request_payload(address, method, "/records/a?view=raw", "data").await;
            assert_eq!(status, 200);
            assert_eq!(body, format!("owned|{method}|view=raw|data"));
        }
        assert_eq!(
            request_payload(address, "POST", "/records/a", "too-large")
                .await
                .0,
            413
        );
        assert_eq!(
            request_payload(address, "DELETE", "/records/a", "").await.0,
            405
        );
        shutdown_tx.send(()).unwrap();
        server.await.unwrap();
    }

    async fn request_payload(
        address: SocketAddr,
        method: &str,
        uri: &str,
        body: &str,
    ) -> (u16, String) {
        let stream = tokio::net::TcpStream::connect(address).await.unwrap();
        let (mut sender, connection) = http1::handshake(TokioIo::new(stream)).await.unwrap();
        tokio::spawn(async move {
            let _ = connection.await;
        });
        let request = Request::builder()
            .method(method)
            .uri(format!("http://{address}{uri}"))
            .body(http_body_util::Full::new(bytes::Bytes::copy_from_slice(
                body.as_bytes(),
            )))
            .unwrap();
        let response = sender.send_request(request).await.unwrap();
        let status = response.status().as_u16();
        let bytes = response.into_body().collect().await.unwrap().to_bytes();
        (status, String::from_utf8(bytes.to_vec()).unwrap())
    }

    fn context_response(context: super::HttpRequestContext) -> Response {
        let external = context.external();
        Response::new(Body::from(format!(
            "{}|{}|{:?}|{:?}",
            context.application().application_id(),
            external.name().unwrap(),
            external.headers().bearer_token,
            external.headers().caller_id
        )))
    }
}
