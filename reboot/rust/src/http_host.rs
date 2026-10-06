//! Bounded external HTTP registration owned by [`ApplicationHost`].
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
    application_host::{ApplicationHostError, ApplicationLifecycle, TrustedApplicationContext},
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
type HttpHandler = Arc<dyn Fn(HttpRequestContext) -> BoxHandlerFuture + Send + Sync>;

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

    fn route(mut self, path: &str, method_router: axum::routing::MethodRouter) -> Self {
        self.router = self.router.route(path, method_router);
        self
    }

    /// Runs the host lifecycle before accepting HTTP and shuts it down after
    /// graceful server termination.
    pub async fn serve_with_shutdown<F>(
        self,
        address: SocketAddr,
        shutdown: F,
    ) -> Result<(), ApplicationHostError>
    where
        F: Future<Output = ()> + Send + 'static,
    {
        start_lifecycle(&self.lifecycle).await?;
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
        result.or(cleanup)
    }
}

async fn start_lifecycle(
    lifecycle: &[Arc<dyn ApplicationLifecycle>],
) -> Result<(), ApplicationHostError> {
    let mut initialized = 0;
    for (component, entry) in lifecycle.iter().enumerate() {
        if let Err(source) = entry.initialize().await {
            shutdown_initialized(lifecycle, initialized).await?;
            return Err(ApplicationHostError::Lifecycle {
                phase: crate::application_host::ApplicationLifecyclePhase::Initialize,
                component,
                source,
            });
        }
        initialized += 1;
    }
    for (component, entry) in lifecycle.iter().enumerate() {
        if let Err(source) = entry.recover().await {
            shutdown_initialized(lifecycle, initialized).await?;
            return Err(ApplicationHostError::Lifecycle {
                phase: crate::application_host::ApplicationLifecyclePhase::Recover,
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
    shutdown_initialized(lifecycle, lifecycle.len()).await
}

async fn shutdown_initialized(
    lifecycle: &[Arc<dyn ApplicationLifecycle>],
    initialized: usize,
) -> Result<(), ApplicationHostError> {
    for (component, entry) in lifecycle.iter().take(initialized).enumerate() {
        entry
            .shutdown()
            .await
            .map_err(|source| ApplicationHostError::Lifecycle {
                phase: crate::application_host::ApplicationLifecyclePhase::Shutdown,
                component,
                source,
            })?;
    }
    Ok(())
}

fn wrap_handler<F, Fut>(
    application_id: String,
    handler: F,
) -> impl Fn(Request) -> BoxHandlerFuture + Clone
where
    F: Fn(HttpRequestContext) -> Fut + Send + Sync + 'static,
    Fut: Future<Output = Response> + Send + 'static,
{
    let handler: HttpHandler = Arc::new(move |context| Box::pin(handler(context)));
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
            handler(HttpRequestContext {
                application,
                external: ExternalContext::for_http(&method, &path, bearer_token),
            })
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
