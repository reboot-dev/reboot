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
    user_id: Option<String>,
}

impl Auth {
    pub fn new(payload: serde_json::Value) -> Self {
        Self {
            payload,
            user_id: None,
        }
    }

    /// Attach identity established by the host verifier, never caller metadata.
    pub fn with_user_id(mut self, user_id: impl Into<String>) -> Self {
        self.user_id = Some(user_id.into());
        self
    }

    pub fn user_id(&self) -> Option<&str> {
        self.user_id.as_deref()
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
    declaration: Option<(&'static str, i32)>,
    entry_identity: Arc<()>,
}

/// Opaque, single-use authorization result for a generated handler entry.
/// This is not internal-call authority: only the owning guard can check its
/// snapshot/ownership binding, and no local-call exemption is granted here.
#[doc(hidden)]
pub struct AuthorizedHandlerAdmission {
    pub(crate) owner: uuid::Uuid,
}

#[doc(hidden)]
pub struct AuthorizedHandlerEntry {
    admission_owner: uuid::Uuid,
    policy: Arc<()>,
    transaction: crate::runtime::TransactionContext,
    authorization: AuthorizationContext,
    state: Option<Vec<u8>>,
    request: Vec<u8>,
}

impl AuthorizedHandlerEntry {
    #[allow(clippy::too_many_arguments, clippy::result_large_err)]
    pub(crate) fn validate(
        self,
        policy: &AuthorizationPolicy,
        admission: &AuthorizedHandlerAdmission,
        transaction: &crate::runtime::TransactionContext,
        state_type: &str,
        state_ref: &str,
        method: &str,
        state: Option<&[u8]>,
        request: &[u8],
    ) -> Result<(), tonic::Status> {
        if self.admission_owner != admission.owner
            || !Arc::ptr_eq(&self.policy, &policy.entry_identity)
            || !self.transaction.same_ownership_context(transaction)
            || self.transaction.headers() != transaction.headers()
            || self.authorization.state_type != state_type
            || self.authorization.headers.state_ref != state_ref
            || self.authorization.method != method
            || self.state.as_deref() != state
            || self.request != request
        {
            return Err(tonic::Status::failed_precondition(
                "authorized handler entry binding differs",
            ));
        }
        if let Some(status) = transaction.doomed_status() {
            return Err(status);
        }
        Ok(())
    }
}

impl AuthorizationPolicy {
    pub(crate) fn same_entry_identity(&self, other: &Self) -> bool {
        Arc::ptr_eq(&self.entry_identity, &other.entry_identity)
    }

    /// Execute the existing configured policy once, retaining the exact immutable
    /// inputs across subsequent actor/owner admission. Public construction of a
    /// policy is not a host registration and this receipt is not outbound authority.
    #[doc(hidden)]
    #[allow(clippy::too_many_arguments)]
    pub async fn authorize_handler_entry(
        &self,
        admission: &AuthorizedHandlerAdmission,
        transaction: &crate::runtime::TransactionContext,
        context: &AuthorizationContext,
        auth: Option<&Auth>,
        state: Option<&[u8]>,
        request: &[u8],
    ) -> Result<AuthorizedHandlerEntry, tonic::Status> {
        if context.headers
            != transaction
                .headers()
                .copy_for_token_verification_and_authorization()
        {
            return Err(tonic::Status::failed_precondition(
                "authorization projection differs from transaction",
            ));
        }
        self.authorize(context, auth, state, request).await?;
        Ok(AuthorizedHandlerEntry {
            admission_owner: admission.owner,
            policy: self.entry_identity.clone(),
            transaction: transaction.clone(),
            authorization: context.clone(),
            state: state.map(<[u8]>::to_vec),
            request: request.to_vec(),
        })
    }
    pub fn new(
        verifier: Option<Arc<dyn TokenVerifier>>,
        authorizer: Option<Arc<dyn Authorizer>>,
    ) -> Self {
        Self {
            verifier,
            authorizer,
            allow_missing_authorizer_for_development: false,
            declaration: None,
            entry_identity: Arc::new(()),
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

    /// Bind descriptor policy without granting authenticated internal authority.
    pub fn for_declaration<D: crate::runtime::DurableStateDeclaration>(mut self) -> Self {
        self.declaration = Some((D::STATE_TYPE, D::AUTO_CONSTRUCT));
        self.entry_identity = Arc::new(());
        self
    }

    fn is_user(&self) -> bool {
        self.declaration.is_some_and(|(_, mode)| mode == 1)
    }

    fn guard_method(&self, context: &AuthorizationContext) -> Result<(), tonic::Status> {
        if self.declaration.is_some_and(|(_, mode)| mode != 0)
            && context.method.rsplit('.').next() == Some("SetClaims")
        {
            return Err(tonic::Status::permission_denied(
                "external SetClaims is not supported",
            ));
        }
        Ok(())
    }

    /// Reject a missing host-owned authorizer without accessing actor storage.
    pub fn require_authorizer(&self) -> Result<(), tonic::Status> {
        if self.authorizer.is_none()
            && !self.is_user()
            && !self.allow_missing_authorizer_for_development
        {
            Err(tonic::Status::permission_denied(
                "no authorizer configured; unauthorized development must be explicitly enabled",
            ))
        } else {
            Ok(())
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
        let auth = match &self.verifier {
            None => None,
            Some(verifier) => match verifier
                .verify(&context, context.headers.bearer_token.as_deref())
                .await
            {
                TokenVerification::Authenticated(auth) => Some(auth),
                TokenVerification::NoOpinion => None,
                TokenVerification::Unauthenticated { message } => {
                    return Err(tonic::Status::unauthenticated(message));
                }
            },
        };
        self.guard_method(&context)?;
        Ok((context, auth))
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
        self.guard_method(context)?;
        let Some(authorizer) = &self.authorizer else {
            if self.is_user() {
                let user_id = auth.and_then(Auth::user_id).ok_or_else(|| {
                    tonic::Status::unauthenticated("verified user identity required")
                })?;
                let (state_type, _) = self.declaration.expect("User declaration");
                let target = crate::state_ref::StateRef::from_maybe_readable(
                    context.headers.state_ref.clone(),
                )
                .map_err(|_| tonic::Status::permission_denied("invalid User target"))?;
                if context.state_type != state_type
                    || !target.matches_state_type(state_type)
                    || target.id() != user_id
                {
                    return Err(tonic::Status::permission_denied("User owner mismatch"));
                }
                return Ok(());
            }
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

    fn handler_transaction() -> crate::runtime::TransactionContext {
        let mut headers = RebootHeaders::new("example.Actor:A");
        headers.transaction_ids = Some(vec![uuid::Uuid::new_v4()]);
        headers.transaction_coordinator_state_type = Some("example.Actor".into());
        headers.transaction_coordinator_state_ref = Some("example.Actor:A".into());
        crate::runtime::TransactionContext::from_headers(
            headers,
            crate::runtime::TransactionMode::Exclusive,
        )
        .unwrap()
    }

    #[tokio::test]
    async fn handler_entry_binds_policy_ownership_actor_method_snapshot_and_request() {
        let policy = AuthorizationPolicy::permissive_for_development();
        let transaction = handler_transaction();
        let admission = AuthorizedHandlerAdmission {
            owner: uuid::Uuid::new_v4(),
        };
        let (authorization, auth) = policy
            .verify(
                transaction.headers().clone(),
                "example.Actor",
                "example.ActorMethods.Apply",
            )
            .await
            .unwrap();
        for changed in 0..9 {
            let entry = policy
                .authorize_handler_entry(
                    &admission,
                    &transaction,
                    &authorization,
                    auth.as_ref(),
                    Some(b"snapshot"),
                    b"request",
                )
                .await
                .unwrap();
            let other_policy = AuthorizationPolicy::permissive_for_development();
            let other_transaction = handler_transaction();
            let replacement = AuthorizedHandlerAdmission {
                owner: uuid::Uuid::new_v4(),
            };
            let outcome = entry.validate(
                if changed == 1 { &other_policy } else { &policy },
                if changed == 8 {
                    &replacement
                } else {
                    &admission
                },
                if changed == 2 {
                    &other_transaction
                } else {
                    &transaction
                },
                if changed == 3 {
                    "example.Other"
                } else {
                    "example.Actor"
                },
                if changed == 4 {
                    "example.Actor:B"
                } else {
                    "example.Actor:A"
                },
                if changed == 5 {
                    "example.ActorMethods.Other"
                } else {
                    "example.ActorMethods.Apply"
                },
                if changed == 6 {
                    Some(b"different")
                } else {
                    Some(b"snapshot")
                },
                if changed == 7 {
                    b"different"
                } else {
                    b"request"
                },
            );
            assert_eq!(outcome.is_ok(), changed == 0, "binding vector {changed}");
        }
        let (wrong_projection, _) = policy
            .verify(
                RebootHeaders::new("example.Actor:B"),
                "example.Actor",
                "example.ActorMethods.Apply",
            )
            .await
            .unwrap();
        assert!(
            policy
                .authorize_handler_entry(
                    &admission,
                    &transaction,
                    &wrong_projection,
                    None,
                    Some(b"snapshot"),
                    b"request"
                )
                .await
                .is_err()
        );
        assert!(
            AuthorizationPolicy::default()
                .authorize_handler_entry(
                    &admission,
                    &transaction,
                    &authorization,
                    None,
                    Some(b"snapshot"),
                    b"request"
                )
                .await
                .is_err()
        );
    }

    #[tokio::test]
    async fn handler_entry_executes_configured_authorizer_once_and_validation_does_not_repeat_it() {
        struct Count(std::sync::atomic::AtomicUsize);
        impl Authorizer for Count {
            fn authorize<'a>(
                &'a self,
                _: &'a AuthorizationContext,
                _: Option<&'a Auth>,
                state: Option<&'a [u8]>,
                request: &'a [u8],
            ) -> AuthorizeFuture<'a> {
                Box::pin(async move {
                    assert_eq!(state, Some(b"snapshot".as_slice()));
                    assert_eq!(request, b"request");
                    self.0.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
                    AuthorizationDecision::Allow
                })
            }
        }
        let authorizer = Arc::new(Count(0.into()));
        let policy = AuthorizationPolicy::new(None, Some(authorizer.clone()));
        let transaction = handler_transaction();
        let admission = AuthorizedHandlerAdmission {
            owner: uuid::Uuid::new_v4(),
        };
        let (authorization, auth) = policy
            .verify(
                transaction.headers().clone(),
                "example.Actor",
                "example.ActorMethods.Apply",
            )
            .await
            .unwrap();
        let entry = policy
            .authorize_handler_entry(
                &admission,
                &transaction,
                &authorization,
                auth.as_ref(),
                Some(b"snapshot"),
                b"request",
            )
            .await
            .unwrap();
        entry
            .validate(
                &policy.clone(),
                &admission,
                &transaction,
                "example.Actor",
                "example.Actor:A",
                "example.ActorMethods.Apply",
                Some(b"snapshot"),
                b"request",
            )
            .unwrap();
        assert_eq!(authorizer.0.load(std::sync::atomic::Ordering::SeqCst), 1);
    }

    struct UserDeclaration;
    impl crate::runtime::DurableStateDeclaration for UserDeclaration {
        type State = crate::proto::Empty;
        const STATE_TYPE: &'static str = "example.Account";
        const AUTO_CONSTRUCT: i32 = 1;
    }

    #[tokio::test]
    async fn user_default_owner_and_setclaims_are_not_development_exemptions() {
        let policy =
            AuthorizationPolicy::permissive_for_development().for_declaration::<UserDeclaration>();
        policy.require_authorizer().unwrap();
        let context = AuthorizationContext {
            headers: RebootHeaders::new("example.Account:owner"),
            state_type: "example.Account".into(),
            method: "example.AccountMethods.Get".into(),
        };
        let payload_only = Auth::new(serde_json::json!({"user_id":"owner"}));
        assert_eq!(
            policy
                .authorize(&context, Some(&payload_only), None, &[])
                .await
                .unwrap_err()
                .code(),
            tonic::Code::Unauthenticated
        );
        let wrong = payload_only.clone().with_user_id("other");
        assert_eq!(
            policy
                .authorize(&context, Some(&wrong), None, &[])
                .await
                .unwrap_err()
                .code(),
            tonic::Code::PermissionDenied
        );
        let owner = payload_only.clone().with_user_id("owner");
        assert_eq!(owner.payload(), payload_only.payload());
        policy
            .authorize(&context, Some(&owner), None, &[])
            .await
            .unwrap();
        let mut claims = context.clone();
        claims.method = "example.AccountMethods.SetClaims".into();
        assert_eq!(
            policy
                .authorize(&claims, Some(&owner), None, &[])
                .await
                .unwrap_err()
                .code(),
            tonic::Code::PermissionDenied
        );
        assert_eq!(
            policy
                .verify(claims.headers, claims.state_type, claims.method)
                .await
                .unwrap_err()
                .code(),
            tonic::Code::PermissionDenied
        );
    }

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
