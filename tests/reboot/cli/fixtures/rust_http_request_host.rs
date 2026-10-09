// Ordinary generated-consumer acceptance only: HTTP calls the public gRPC API.
use axum::{
    body::{Body, to_bytes},
    extract::Request,
    response::Response,
};
use reboot::{ExternalContext, http_host::HttpRequestContext};
use std::{net::SocketAddr, time::Duration};

struct FixtureVerifier;
impl reboot::auth::TokenVerifier for FixtureVerifier {
    fn verify<'a>(
        &'a self,
        _context: &'a reboot::auth::AuthorizationContext,
        token: Option<&'a str>,
    ) -> reboot::auth::VerifyFuture<'a> {
        Box::pin(async move {
            match token {
                Some("fixture-credential") => reboot::auth::TokenVerification::Authenticated(
                    reboot::auth::Auth::new(serde_json::json!({"fixture_scope":"http"})),
                ),
                None => reboot::auth::TokenVerification::NoOpinion,
                Some(_) => reboot::auth::TokenVerification::Unauthenticated {
                    message: "unverified fixture credential".into(),
                },
            }
        })
    }
}
struct FixtureAuthorizer;
impl reboot::auth::Authorizer for FixtureAuthorizer {
    fn authorize<'a>(
        &'a self,
        context: &'a reboot::auth::AuthorizationContext,
        auth: Option<&'a reboot::auth::Auth>,
        state_snapshot: Option<&'a [u8]>,
        _request: &'a [u8],
    ) -> reboot::auth::AuthorizeFuture<'a> {
        Box::pin(async move {
            if context.headers.state_ref == "http-item" {
                let count = state_snapshot
                    .and_then(|bytes| proto::HelloWorld::decode(bytes).ok())
                    .map(|state| state.number_of_greetings);
                let grant = std::env::var("RUST_DX_HTTP_ROLE_FILE")
                    .ok()
                    .and_then(|path| std::fs::read_to_string(path).ok())
                    .as_deref()
                    == Some("allow");
                if let Ok(path) = std::env::var("RUST_DX_HTTP_AUTH_TRACE_FILE") {
                    use std::io::Write;
                    let value = serde_json::json!({"method":context.method,"count":count,"grant":grant,"authenticated":auth.is_some()});
                    let logged = std::fs::OpenOptions::new()
                        .append(true)
                        .create(true)
                        .open(path)
                        .and_then(|mut file| writeln!(file, "{value}"));
                    if logged.is_err() {
                        return reboot::auth::AuthorizationDecision::PermissionDenied {
                            message: "fixture auth trace failed".into(),
                        };
                    }
                }
                if context.headers.application_id.as_deref() != Some("rust_greetings")
                    || context.headers.caller_id.is_some()
                    || context.headers.internal_call
                    || context.headers.transaction_ids.is_some()
                {
                    return reboot::auth::AuthorizationDecision::PermissionDenied {
                        message: "spoofed identity".into(),
                    };
                }
                if context.method.ends_with("Greet") || context.method.ends_with("Create") {
                    let permitted = auth.is_some_and(|auth| {
                        auth.payload().get("fixture_scope").and_then(|v| v.as_str()) == Some("http")
                    });
                    let granted = std::env::var("RUST_DX_HTTP_ROLE_FILE")
                        .ok()
                        .and_then(|path| std::fs::read_to_string(path).ok())
                        .as_deref()
                        == Some("allow");
                    if !permitted || !granted {
                        return reboot::auth::AuthorizationDecision::PermissionDenied {
                            message: "HTTP actor grant revoked or absent".into(),
                        };
                    }
                }
            }
            reboot::auth::AuthorizationDecision::Allow
        })
    }
}

fn http_response(status: u16, value: serde_json::Value) -> Response {
    Response::builder()
        .status(status)
        .header("content-type", "application/json")
        .body(Body::from(value.to_string()))
        .expect("valid response")
}

async fn http_request(context: HttpRequestContext, request: Request, endpoint: String) -> Response {
    let method = request.method().as_str().to_owned();
    let path = request.uri().path().to_owned();
    let query = request.uri().query().unwrap_or("").to_owned();
    let parts: Vec<&str> = path.split('/').collect();
    let Some(state_ref) = parts.get(2).copied() else {
        return http_response(400, serde_json::json!({"error":"missing actor"}));
    };
    if state_ref.is_empty()
        || !state_ref
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-')
    {
        return http_response(400, serde_json::json!({"error":"invalid actor"}));
    }
    let body =
        match tokio::time::timeout(Duration::from_secs(2), to_bytes(request.into_body(), 1024))
            .await
        {
            Ok(Ok(body)) => body,
            Ok(Err(_)) => return http_response(413, serde_json::json!({"error":"body too large"})),
            Err(_) => return http_response(408, serde_json::json!({"error":"body deadline"})),
        };
    let operation = if method == "GET" {
        "read"
    } else {
        parts.get(3).copied().unwrap_or("")
    };
    let key = if operation == "read" {
        None
    } else {
        let value: serde_json::Value = match serde_json::from_slice(&body) {
            Ok(value) => value,
            Err(_) => return http_response(400, serde_json::json!({"error":"invalid JSON"})),
        };
        match value
            .get("key")
            .and_then(|v| v.as_str())
            .and_then(|v| uuid::Uuid::parse_str(v).ok())
        {
            Some(key) => Some(key),
            None => {
                return http_response(400, serde_json::json!({"error":"invalid idempotency key"}));
            }
        }
    };
    let mut headers = context.external().headers().clone();
    headers.state_ref = state_ref.into();
    let external = ExternalContext::with_headers(headers);
    let result = tokio::time::timeout(Duration::from_secs(5), async move {
        let channel = external
            .connect(endpoint)
            .await
            .map_err(|_| tonic::Status::unavailable("connect failed"))?;
        let mut client = generated::HelloWorldMethodsExternalClient::new(channel, external);
        let count = match operation {
            "create" => {
                client
                    .create_with_key(proto::CreateRequest {}, key.expect("validated key"))
                    .await?
                    .into_inner()
                    .number_of_greetings
            }
            "greet" => {
                client
                    .greet_with_key(proto::GreetRequest {}, key.expect("validated key"))
                    .await?
                    .into_inner()
                    .number_of_greetings
            }
            "read" => {
                client
                    .num_greetings(proto::NumGreetingsRequest {})
                    .await?
                    .into_inner()
                    .number_of_greetings
            }
            _ => return Err(tonic::Status::invalid_argument("unknown operation")),
        };
        Ok::<_, tonic::Status>(count)
    })
    .await;
    match result {
        Ok(Ok(count)) => http_response(
            200,
            serde_json::json!({"count":count, "application":context.application().application_id(), "caller":context.external().headers().caller_id.as_ref().map(|_| "unexpected"), "path":path, "query":query}),
        ),
        Ok(Err(status)) => {
            let http_status = match status.code() {
                tonic::Code::Unauthenticated => 401,
                tonic::Code::PermissionDenied => 403,
                tonic::Code::InvalidArgument => 400,
                _ => 502,
            };
            http_response(
                http_status,
                serde_json::json!({"grpc_code":format!("{:?}",status.code())}),
            )
        }
        Err(_) => http_response(503, serde_json::json!({"error":"RPC deadline"})),
    }
}

async fn http_service(
    application: String,
    grpc_address: SocketAddr,
    mut shutdown: tokio::sync::watch::Receiver<bool>,
) -> Result<(), Box<dyn std::error::Error>> {
    let endpoint = format!("http://{grpc_address}");
    // This fixture owns no application participants. The original public gRPC
    // host alone owns its lifecycle; this listener binds only after SERVING.
    tokio::time::timeout(Duration::from_secs(10), async {
        loop {
            if *shutdown.borrow() {
                return;
            }
            if let Ok(channel) = ExternalContext::new("").connect(endpoint.clone()).await {
                let mut health = tonic_health::pb::health_client::HealthClient::new(channel);
                let mut request = tonic::Request::new(tonic_health::pb::HealthCheckRequest {
                    service: String::new(),
                });
                request.set_timeout(Duration::from_secs(1));
                if let Ok(response) = health.check(request).await
                    && response.into_inner().status
                        == tonic_health::pb::health_check_response::ServingStatus::Serving as i32
                {
                    return;
                }
            }
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
    })
    .await?;
    if *shutdown.borrow() {
        return Ok(());
    }
    let address: SocketAddr = std::env::var("RUST_DX_HTTP_ADDR")?.parse()?;
    let get_endpoint = endpoint.clone();
    let post_endpoint = endpoint;
    ApplicationHost::new(application).http()
        .get_with_request("/actors/:actor", move |context, request| http_request(context, request, get_endpoint.clone()))
        .post_with_request("/actors/:actor/:operation", move |context, request| http_request(context, request, post_endpoint.clone()))
        .options_with_request("/actors/:actor", |context, request| async move {
            http_response(200, serde_json::json!({"method":request.method().as_str(), "query":request.uri().query(), "application":context.application().application_id(), "caller":context.external().headers().caller_id.as_ref().map(|_| "unexpected")}))
        })
        .serve_with_shutdown(address, async move { let _ = shutdown.wait_for(|value| *value).await; }).await?;
    Ok(())
}

#[cfg(test)]
mod http_fixture_tests {
    #[tokio::test]
    async fn fixture_verifier_rejects_unknown_tokens_instead_of_default_allow() {
        let context = reboot::auth::AuthorizationContext {
            headers: reboot::RebootHeaders::new("http-item"),
            state_type: "rust_greetings.v1.HelloWorld".into(),
            method: "Greet".into(),
        };
        assert!(matches!(
            reboot::auth::TokenVerifier::verify(
                &super::FixtureVerifier,
                &context,
                Some("fixture-credential")
            )
            .await,
            reboot::auth::TokenVerification::Authenticated(_)
        ));
        assert!(matches!(
            reboot::auth::TokenVerifier::verify(
                &super::FixtureVerifier,
                &context,
                Some("unverified")
            )
            .await,
            reboot::auth::TokenVerification::Unauthenticated { .. }
        ));
        assert_eq!(
            reboot::auth::TokenVerifier::verify(&super::FixtureVerifier, &context, None).await,
            reboot::auth::TokenVerification::NoOpinion
        );
    }
}
