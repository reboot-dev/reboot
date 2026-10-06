//! Bounded authentication and authorization contract for generated external
//! unary database RPCs.
//!
//! This mirrors the Python middleware ordering: verify a bearer credential
//! first, then authorize against a transaction-free metadata projection and
//! immutable encoded snapshots of the request and loaded state. It deliberately
//! does not establish trusted internal-call provenance; transaction, workflow,
//! streaming, HTTP/OAuth, and task authorization remain outside this slice.

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
/// the loaded state (default state when absent durably), exactly as their
/// handler will observe it.
pub trait Authorizer: Send + Sync {
    fn authorize<'a>(
        &'a self,
        context: &'a AuthorizationContext,
        auth: Option<&'a Auth>,
        state: Option<&'a [u8]>,
        request: &'a [u8],
    ) -> AuthorizeFuture<'a>;
}

/// Optional verifier/authorizer pair owned by a generated service adapter.
#[derive(Clone, Default)]
pub struct AuthorizationPolicy {
    verifier: Option<Arc<dyn TokenVerifier>>,
    authorizer: Option<Arc<dyn Authorizer>>,
}

impl AuthorizationPolicy {
    pub fn new(
        verifier: Option<Arc<dyn TokenVerifier>>,
        authorizer: Option<Arc<dyn Authorizer>>,
    ) -> Self {
        Self {
            verifier,
            authorizer,
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
            return Ok(());
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
