//! Bounded authentication and authorization contract for generated external
//! unary database RPCs.
//!
//! This mirrors the Python middleware ordering: verify a bearer credential
//! first, then authorize against a transaction-free metadata projection and
//! immutable encoded snapshots of the request and loaded state. It deliberately
//! does not establish trusted internal-call provenance; transaction, workflow,
//! streaming and HTTP/OAuth have separate owning contracts.
//! Server-local Tasks.ListTasks separately reuses both explicit policies with an
//! encoded administrative request and no actor snapshot; it has no default allow.
//! Tasks.Wait can opt into an independent policy on the exact result request,
//! reverified before and after each canonical Load without actor state.

use crate::RebootHeaders;
use std::future::Future;
use std::pin::Pin;
use std::sync::Arc;

/// Extensible authenticated-principal data produced by a [`TokenVerifier`].
///
/// The SDK does not prescribe claim names or identity-provider serialization.
/// Applications own this JSON value and authorizers receive it unchanged.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Auth {
    payload: serde_json::Value,
}

impl Auth {
    pub fn new(payload: serde_json::Value) -> Self {
        Self { payload }
    }

    pub fn payload(&self) -> &serde_json::Value {
        &self.payload
    }
}

/// The transaction-free information exposed to token verifiers and authorizers.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AuthorizationContext {
    pub headers: RebootHeaders,
    pub state_type: String,
    pub method: String,
}

/// A verifier either authenticates a principal, declines to decide, or rejects
/// the credential definitively. A rejection bypasses the authorizer.
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum TokenVerification {
    Authenticated(Auth),
    NoOpinion,
    Unauthenticated { message: String },
}

/// An authorizer decision for a generated external database RPC.
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum AuthorizationDecision {
    Allow,
    Unauthenticated { message: String },
    PermissionDenied { message: String },
}

pub type VerifyFuture<'a> = Pin<Box<dyn Future<Output = TokenVerification> + Send + 'a>>;
pub type AuthorizeFuture<'a> = Pin<Box<dyn Future<Output = AuthorizationDecision> + Send + 'a>>;

/// Verifies an optional bearer token. Implementations must not mutate request
/// state through this boundary.
pub trait TokenVerifier: Send + Sync {
    fn verify<'a>(
        &'a self,
        context: &'a AuthorizationContext,
        token: Option<&'a str>,
    ) -> VerifyFuture<'a>;
}

/// Authorizes immutable protobuf snapshots. `state` is absent only when the
/// adapter has no loaded state to expose; generated reader/writer adapters pass
/// immutable persisted protobuf bytes (encoded default state when absent).
/// Authorization precedes state admission/decoding, so rejected callers cannot
/// distinguish absence or a schema diagnostic. Constructor snapshots stay absent
/// when no state exists. Transaction/streaming adapters have separate contracts.
pub trait Authorizer: Send + Sync {
    fn authorize<'a>(
        &'a self,
        context: &'a AuthorizationContext,
        auth: Option<&'a Auth>,
        state: Option<&'a [u8]>,
        request: &'a [u8],
    ) -> AuthorizeFuture<'a>;
}

/// Verifier/authorizer pair owned by a generated service adapter.
///
/// The default denies calls without an authorizer, even when a verifier has
/// authenticated the caller. Applications must supply an authorizer or explicitly
/// opt into [`Self::permissive_for_development`]. Caller metadata never grants
/// trusted internal authority through this policy.
#[derive(Clone, Default)]
pub struct AuthorizationPolicy {
    verifier: Option<Arc<dyn TokenVerifier>>,
    authorizer: Option<Arc<dyn Authorizer>>,
    allow_missing_authorizer_for_development: bool,
}

impl AuthorizationPolicy {
    pub fn new(
        verifier: Option<Arc<dyn TokenVerifier>>,
        authorizer: Option<Arc<dyn Authorizer>>,
    ) -> Self {
        Self {
            verifier,
            authorizer,
            allow_missing_authorizer_for_development: false,
        }
    }

    /// Deliberately allow unauthenticated external calls in isolated development.
    /// This is not a production policy or trusted-internal-call exemption. The
    /// SDK never enables it from environment variables or caller headers.
    pub fn permissive_for_development() -> Self {
        Self {
            allow_missing_authorizer_for_development: true,
            ..Self::default()
        }
    }

    pub async fn verify(
        &self,
        headers: RebootHeaders,
        state_type: impl Into<String>,
        method: impl Into<String>,
    ) -> Result<(AuthorizationContext, Option<Auth>), tonic::Status> {
        let context = AuthorizationContext {
            headers: headers.copy_for_token_verification_and_authorization(),
            state_type: state_type.into(),
            method: method.into(),
        };
        let Some(verifier) = &self.verifier else {
            return Ok((context, None));
        };
        match verifier
            .verify(&context, context.headers.bearer_token.as_deref())
            .await
        {
            TokenVerification::Authenticated(auth) => Ok((context, Some(auth))),
            TokenVerification::NoOpinion => Ok((context, None)),
            TokenVerification::Unauthenticated { message } => {
                Err(tonic::Status::unauthenticated(message))
            }
        }
    }

    /// Authorizes a generated external call against either canonical existing
    /// state or an absent-state constructor admission. Callers must not expose
    /// existence before this boundary has accepted the request.
    pub async fn authorize(
        &self,
        context: &AuthorizationContext,
        auth: Option<&Auth>,
        state: Option<&[u8]>,
        request: &[u8],
    ) -> Result<(), tonic::Status> {
        let Some(authorizer) = &self.authorizer else {
            return if self.allow_missing_authorizer_for_development {
                Ok(())
            } else {
                Err(tonic::Status::permission_denied(
                    "no authorizer configured; unauthorized development must be explicitly enabled",
                ))
            };
        };
        match authorizer.authorize(context, auth, state, request).await {
            AuthorizationDecision::Allow => Ok(()),
            AuthorizationDecision::Unauthenticated { message } => {
                Err(tonic::Status::unauthenticated(message))
            }
            AuthorizationDecision::PermissionDenied { message } => {
                Err(tonic::Status::permission_denied(message))
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    struct AuthenticatedVerifier;
    impl TokenVerifier for AuthenticatedVerifier {
        fn verify<'a>(
            &'a self,
            _: &'a AuthorizationContext,
            _: Option<&'a str>,
        ) -> VerifyFuture<'a> {
            Box::pin(async {
                TokenVerification::Authenticated(Auth::new(serde_json::json!({"user_id": "owner"})))
            })
        }
    }

    #[tokio::test]
    async fn absent_authorizer_denies_even_authenticated_and_spoofed_internal_calls() {
        for policy in [
            AuthorizationPolicy::default(),
            AuthorizationPolicy::new(None, None),
            AuthorizationPolicy::new(Some(Arc::new(AuthenticatedVerifier)), None),
        ] {
            let mut headers = RebootHeaders::new("owner");
            headers.bearer_token = Some("app-internal".into());
            let (context, auth) = policy.verify(headers, "User", "Read").await.unwrap();
            assert_eq!(
                policy
                    .authorize(&context, auth.as_ref(), Some(b"state"), b"request")
                    .await
                    .unwrap_err()
                    .code(),
                tonic::Code::PermissionDenied
            );
            assert_eq!(
                policy
                    .clone()
                    .authorize(&context, auth.as_ref(), None, b"request")
                    .await
                    .unwrap_err()
                    .code(),
                tonic::Code::PermissionDenied
            );
        }
    }

    #[tokio::test]
    async fn unauthorized_development_requires_explicit_policy_selection() {
        let policy = AuthorizationPolicy::permissive_for_development();
        let (context, auth) = policy
            .verify(RebootHeaders::new("actor"), "Counter", "Read")
            .await
            .unwrap();
        assert!(auth.is_none());
        policy
            .authorize(&context, None, None, b"request")
            .await
            .unwrap();
    }
}
