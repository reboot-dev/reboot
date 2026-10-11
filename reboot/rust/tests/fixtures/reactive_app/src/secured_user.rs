use crate::{arg, proto};
use reboot::{
    application_host::ApplicationHost,
    auth::{
        Auth, AuthorizationContext, AuthorizationPolicy, TokenVerification, TokenVerifier,
        VerifyFuture,
    },
    runtime::DatabaseActorStore,
};
use std::{io::Write, path::PathBuf, sync::Arc, time::Duration};
#[allow(dead_code)] // Fixture uses only public database/reactive clients.
mod generated {
    include!(concat!(
        env!("OUT_DIR"),
        "/reactive/v1/secured_user.reboot.rs"
    ));
}
const KEY: &str = "00000000-0000-4000-8000-000000000123";
fn reference() -> String {
    reboot::state_ref::StateRef::from_id("reactive.v1.OwnerAccount", "alice")
        .unwrap()
        .to_string()
}
struct Verifier(PathBuf);
impl TokenVerifier for Verifier {
    fn verify<'a>(
        &'a self,
        _: &'a AuthorizationContext,
        token: Option<&'a str>,
    ) -> VerifyFuture<'a> {
        Box::pin(async move {
            match token {
                Some("owner") if !self.0.exists() => TokenVerification::Authenticated(
                    Auth::new("{}".parse().unwrap()).with_user_id("alice"),
                ),
                Some("owner") | Some("other") => TokenVerification::Authenticated(
                    Auth::new("{}".parse().unwrap()).with_user_id("bob"),
                ),
                Some("stable-owner") => TokenVerification::Authenticated(
                    Auth::new("{}".parse().unwrap()).with_user_id("alice"),
                ),
                Some("payload-forgery") => TokenVerification::Authenticated(Auth::new(
                    "{\"user_id\":\"alice\"}".parse().unwrap(),
                )),
                Some("reject") => TokenVerification::Unauthenticated {
                    message: "rejected fixture credential".into(),
                },
                _ => TokenVerification::NoOpinion,
            }
        })
    }
}
struct Handler(PathBuf);
#[tonic::async_trait]
impl generated::OwnerAccountMethodsDatabaseHandler for Handler {
    async fn create(
        &self,
        _: &mut proto::OwnerAccount,
        _: proto::Empty,
    ) -> Result<proto::Empty, tonic::Status> {
        Ok(proto::Empty {})
    }
    async fn increment(
        &self,
        state: &mut proto::OwnerAccount,
        request: proto::Add,
    ) -> Result<proto::Value, tonic::Status> {
        let mut log = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&self.0)
            .map_err(|e| tonic::Status::internal(e.to_string()))?;
        writeln!(log, "increment {}", request.amount)
            .map_err(|e| tonic::Status::internal(e.to_string()))?;
        state.value += request.amount;
        Ok(proto::Value {
            value: state.value,
            padding: vec![],
        })
    }
    async fn query(
        &self,
        state: &proto::OwnerAccount,
        _: proto::Empty,
    ) -> Result<proto::Value, tonic::Status> {
        Ok(proto::Value {
            value: state.value,
            padding: vec![],
        })
    }
    async fn set_claims(
        &self,
        _: &mut proto::OwnerAccount,
        _: proto::Empty,
    ) -> Result<proto::Empty, tonic::Status> {
        panic!("external SetClaims reached handler")
    }
}
async fn client(
    endpoint: &str,
    token: &str,
) -> Result<generated::OwnerAccountMethodsExternalClient, Box<dyn std::error::Error>> {
    let context = reboot::ExternalContext::new(reference()).with_bearer_token(token);
    Ok(generated::OwnerAccountMethodsExternalClient::new(
        context.connect(endpoint.to_owned()).await?,
        context,
    ))
}
async fn subscription(
    endpoint: &str,
    token: &str,
) -> Result<reboot::reactive::TypedSubscription<proto::Value, tonic::Status>, tonic::Status> {
    let context = reboot::ExternalContext::new(reference()).with_bearer_token(token);
    let channel = context
        .connect(endpoint.to_owned())
        .await
        .map_err(|e| tonic::Status::unavailable(e.to_string()))?;
    generated::OwnerAccountMethodsReactiveClient::new(channel, context)
        .query(proto::Empty {})
        .await
}
async fn snapshot(
    stream: &mut reboot::reactive::TypedSubscription<proto::Value, tonic::Status>,
) -> Result<Option<proto::Value>, tonic::Status> {
    tokio::time::timeout(Duration::from_secs(5), stream.message())
        .await
        .expect("subscription response deadline")
}
async fn wait_readers(expected: usize) {
    tokio::time::timeout(Duration::from_secs(5), async {
        loop {
            if std::fs::read_to_string(arg(5))
                .ok()
                .and_then(|s| s.parse::<usize>().ok())
                == Some(expected)
            {
                break;
            }
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
    })
    .await
    .expect("live subscription reclamation deadline");
}
fn effects(path: &str) -> String {
    std::fs::read_to_string(path).unwrap_or_default()
}
fn response(status: u16, body: String) -> axum::response::Response {
    axum::response::Response::builder()
        .status(status)
        .body(axum::body::Body::from(body))
        .unwrap()
}
async fn http(
    context: reboot::http_host::HttpRequestContext,
    request: axum::extract::Request,
    endpoint: String,
) -> axum::response::Response {
    let operation = request.uri().path().to_owned();
    let body = match axum::body::to_bytes(request.into_body(), 1024).await {
        Ok(body) => body,
        Err(_) => return response(400, "bounded body required".into()),
    };
    let mut headers = context.external().headers().clone();
    headers.state_ref = reference();
    let external = reboot::ExternalContext::with_headers(headers);
    let result = tokio::time::timeout(Duration::from_secs(5), async move {
        let channel = external
            .connect(endpoint)
            .await
            .map_err(|e| tonic::Status::unavailable(e.to_string()))?;
        let mut client = generated::OwnerAccountMethodsExternalClient::new(channel, external);
        if operation == "/owner" {
            return client
                .query(proto::Empty {})
                .await
                .map(|r| r.into_inner().value);
        }
        let key = std::str::from_utf8(&body)
            .ok()
            .and_then(|s| s.parse::<uuid::Uuid>().ok())
            .ok_or_else(|| tonic::Status::invalid_argument("body must be UUID"))?;
        if operation == "/owner/setclaims" {
            return client
                .set_claims_with_key(proto::Empty {}, key)
                .await
                .map(|_| 0);
        }
        client
            .increment_with_key(
                proto::Add {
                    amount: 1,
                    fail: false,
                },
                key,
            )
            .await
            .map(|r| r.into_inner().value)
    })
    .await;
    match result {
        Ok(Ok(value)) => response(200, value.to_string()),
        Ok(Err(status)) => response(
            match status.code() {
                tonic::Code::Unauthenticated => 401,
                tonic::Code::PermissionDenied => 403,
                tonic::Code::InvalidArgument => 400,
                _ => 502,
            },
            format!("{:?}", status.code()),
        ),
        Err(_) => response(503, "RPC deadline".into()),
    }
}
pub async fn run(command: &str) -> Result<(), Box<dyn std::error::Error>> {
    match command {
        "user-http" => {
            let endpoint = arg(2);
            let read_endpoint = endpoint.clone();
            let claim_endpoint = endpoint.clone();
            ApplicationHost::new("secured-user-http")
                .http()
                .get_with_request("/owner", move |context, request| {
                    http(context, request, read_endpoint.clone())
                })
                .post_with_request("/owner/increment", move |context, request| {
                    http(context, request, endpoint.clone())
                })
                .post_with_request("/owner/setclaims", move |context, request| {
                    http(context, request, claim_endpoint.clone())
                })
                .serve_with_shutdown(arg(3).parse()?, async move {
                    while !std::path::Path::new(&arg(4)).exists() {
                        tokio::time::sleep(Duration::from_millis(10)).await;
                    }
                })
                .await?;
        }

        "user-serve" => {
            let store = DatabaseActorStore::connect(arg(2)).await?;
            let adapter =
                generated::OwnerAccountMethodsDatabaseAdapter::new(store, Handler(arg(6).into()))
                    .with_authorization(AuthorizationPolicy::new(
                        Some(Arc::new(Verifier(arg(5).into()))),
                        None,
                    ));
            let (owner, readers) = adapter.local_readers(&reference())?;
            let monitor = owner.clone();
            ApplicationHost::new("secured-user-app")
                .with_host_recovery(owner.clone())
                .add_public_service(
                    proto::owner_account_methods_server::OwnerAccountMethodsServer::new(adapter),
                )
                .try_add_local_readers(readers)?
                .serve_with_shutdown(arg(3).parse()?, async move {
                    while !std::path::Path::new(&arg(4)).exists() {
                        std::fs::write(arg(7), monitor.active_subscriptions().to_string())
                            .expect("subscription stats publication");
                        tokio::time::sleep(Duration::from_millis(10)).await;
                    }
                })
                .await?;
            assert_eq!(owner.active_subscriptions(), 0);
        }
        "user-exercise" => {
            let endpoint = arg(2);
            let revoked = arg(3);
            let mutations = arg(4);
            for (token, expected) in [
                ("missing", tonic::Code::Unauthenticated),
                ("payload-forgery", tonic::Code::Unauthenticated),
                ("other", tonic::Code::PermissionDenied),
                ("reject", tonic::Code::Unauthenticated),
            ] {
                let mut denied = client(&endpoint, token).await?;
                assert_eq!(
                    denied.create(proto::Empty {}).await.unwrap_err().code(),
                    expected
                );
                assert_eq!(
                    denied.query(proto::Empty {}).await.unwrap_err().code(),
                    expected
                );
                assert_eq!(
                    denied
                        .increment(proto::Add {
                            amount: 900,
                            fail: false
                        })
                        .await
                        .unwrap_err()
                        .code(),
                    expected
                );
                match subscription(&endpoint, token).await {
                    Err(status) => assert_eq!(status.code(), expected),
                    Ok(mut stream) => {
                        assert_eq!(snapshot(&mut stream).await.unwrap_err().code(), expected)
                    }
                }
            }
            assert!(effects(&mutations).is_empty());
            let mut owner = client(&endpoint, "owner").await?;
            owner.create(proto::Empty {}).await?;
            let mut stream = subscription(&endpoint, "owner").await?;
            assert_eq!(snapshot(&mut stream).await?.unwrap().value, 0);
            wait_readers(1).await;
            assert_eq!(
                owner
                    .increment_with_key(
                        proto::Add {
                            amount: 5,
                            fail: false
                        },
                        KEY.parse()?
                    )
                    .await?
                    .into_inner()
                    .value,
                5
            );
            assert_eq!(snapshot(&mut stream).await?.unwrap().value, 5);
            std::fs::write(&revoked, "revoked")?;
            let before = effects(&mutations);
            assert_eq!(
                owner
                    .increment_with_key(
                        proto::Add {
                            amount: 5,
                            fail: false
                        },
                        KEY.parse()?
                    )
                    .await
                    .unwrap_err()
                    .code(),
                tonic::Code::PermissionDenied
            );
            assert_eq!(effects(&mutations), before);
            let mut stable = client(&endpoint, "stable-owner").await?;
            assert_eq!(
                stable
                    .increment(proto::Add {
                        amount: 1,
                        fail: false
                    })
                    .await?
                    .into_inner()
                    .value,
                6
            );
            assert_eq!(
                snapshot(&mut stream).await.unwrap_err().code(),
                tonic::Code::PermissionDenied
            );
            assert_eq!(
                stable.set_claims(proto::Empty {}).await.unwrap_err().code(),
                tonic::Code::PermissionDenied
            );
            drop(stream);
            wait_readers(0).await;
            println!("secured_user_revoked_snapshot_and_replay=6");
        }
        "user-restart" => {
            let endpoint = arg(2);
            let revoked = arg(3);
            let mutations = arg(4);
            assert!(std::path::Path::new(&revoked).exists());
            let before = effects(&mutations);
            let mut owner = client(&endpoint, "owner").await?;
            assert_eq!(
                owner
                    .increment_with_key(
                        proto::Add {
                            amount: 5,
                            fail: false
                        },
                        KEY.parse()?
                    )
                    .await
                    .unwrap_err()
                    .code(),
                tonic::Code::PermissionDenied
            );
            assert_eq!(effects(&mutations), before);
            std::fs::remove_file(&revoked)?;
            assert_eq!(
                owner
                    .increment_with_key(
                        proto::Add {
                            amount: 5,
                            fail: false
                        },
                        KEY.parse()?
                    )
                    .await?
                    .into_inner()
                    .value,
                5
            );
            assert_eq!(
                effects(&mutations),
                before,
                "replay must not invoke handler after restart"
            );
            assert_eq!(owner.query(proto::Empty {}).await?.into_inner().value, 6);
            let mut stream = subscription(&endpoint, "owner").await?;
            assert_eq!(snapshot(&mut stream).await?.unwrap().value, 6);
            wait_readers(1).await;
            assert_eq!(
                owner
                    .increment(proto::Add {
                        amount: 1,
                        fail: false
                    })
                    .await?
                    .into_inner()
                    .value,
                7
            );
            assert_eq!(snapshot(&mut stream).await?.unwrap().value, 7);
            drop(stream);
            wait_readers(0).await;
            println!("secured_user_restart_replay_no_mutation=7");
        }
        _ => return Err(format!("unknown secured User command {command}").into()),
    }
    Ok(())
}
