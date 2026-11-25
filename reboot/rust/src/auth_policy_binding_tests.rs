//! Source regressions for explicit prebinding and opaque policy receipt identity.
use super::*;
use std::sync::atomic::{AtomicUsize, Ordering};

struct Actor;
impl crate::runtime::DurableStateDeclaration for Actor {
    type State = crate::proto::Empty;
    const STATE_TYPE: &'static str = "example.Actor";
    const AUTO_CONSTRUCT: i32 = 0;
}
struct OtherActor;
impl crate::runtime::DurableStateDeclaration for OtherActor {
    type State = crate::proto::Empty;
    const STATE_TYPE: &'static str = "example.Other";
    const AUTO_CONSTRUCT: i32 = 0;
}
struct UserActor;
impl crate::runtime::DurableStateDeclaration for UserActor {
    type State = crate::proto::Empty;
    const STATE_TYPE: &'static str = "example.Actor";
    const AUTO_CONSTRUCT: i32 = 1;
}
struct Verifier;
impl TokenVerifier for Verifier {
    fn verify<'a>(&'a self, _: &'a AuthorizationContext, _: Option<&'a str>) -> VerifyFuture<'a> {
        Box::pin(async { TokenVerification::NoOpinion })
    }
}
struct Allow(AtomicUsize);
impl Authorizer for Allow {
    fn authorize<'a>(
        &'a self,
        _: &'a AuthorizationContext,
        _: Option<&'a Auth>,
        _: Option<&'a [u8]>,
        _: &'a [u8],
    ) -> AuthorizeFuture<'a> {
        Box::pin(async move {
            self.0.fetch_add(1, Ordering::SeqCst);
            AuthorizationDecision::Allow
        })
    }
}

fn policy() -> AuthorizationPolicy {
    AuthorizationPolicy::new(
        Some(Arc::new(Verifier)),
        Some(Arc::new(Allow(AtomicUsize::new(0)))),
    )
}

#[test]
fn only_prebound_clones_share_the_same_declaration_identity() {
    let original = policy();
    let first_owner = original.clone().for_declaration::<Actor>();
    let independently_bound = original.clone().for_declaration::<Actor>();
    assert!(!first_owner.same_entry_identity(&independently_bound));
    assert!(!first_owner.same_entry_identity(&original));
    // The host prebinds ONCE; generated adapters rebind these bound clones.
    let second_owner = first_owner.clone().for_declaration::<Actor>();
    assert!(first_owner.same_entry_identity(&second_owner));
    assert!(first_owner.same_entry_identity(&first_owner.clone()));
    assert!(!first_owner.same_entry_identity(&first_owner.clone().for_declaration::<OtherActor>()));
    assert!(!first_owner.same_entry_identity(&first_owner.clone().for_declaration::<UserActor>()));
}

fn rejected_policies(
    original: &AuthorizationPolicy,
    bound: &AuthorizationPolicy,
) -> Vec<AuthorizationPolicy> {
    vec![
        // Separately bound siblings of the same UNBOUND policy remain distinct.
        original.clone().for_declaration::<Actor>(),
        // Same exact verifier AND authorizer allocations do not mint lineage.
        AuthorizationPolicy::new(original.verifier.clone(), original.authorizer.clone())
            .for_declaration::<Actor>(),
        // New verifier, retained authorizer.
        AuthorizationPolicy::new(Some(Arc::new(Verifier)), original.authorizer.clone())
            .for_declaration::<Actor>(),
        // Retained verifier, new authorizer.
        AuthorizationPolicy::new(
            original.verifier.clone(),
            Some(Arc::new(Allow(AtomicUsize::new(0)))),
        )
        .for_declaration::<Actor>(),
        AuthorizationPolicy::new(None, original.authorizer.clone()).for_declaration::<Actor>(),
        AuthorizationPolicy::new(original.verifier.clone(), None).for_declaration::<Actor>(),
        AuthorizationPolicy::permissive_for_development().for_declaration::<Actor>(),
        AuthorizationPolicy::default().for_declaration::<Actor>(),
        original.clone(),
        bound.clone().for_declaration::<OtherActor>(),
        bound.clone().for_declaration::<UserActor>(),
        // A -> B -> A must not resurrect an old receipt/family identity.
        bound
            .clone()
            .for_declaration::<OtherActor>()
            .for_declaration::<Actor>(),
        bound
            .clone()
            .for_declaration::<UserActor>()
            .for_declaration::<Actor>(),
    ]
}

#[test]
fn reconfiguration_and_independent_equivalent_policies_do_not_share_identity() {
    let original = policy();
    let bound = original.clone().for_declaration::<Actor>();
    for (index, changed) in rejected_policies(&original, &bound).iter().enumerate() {
        assert!(
            !bound.same_entry_identity(changed),
            "negative policy {index}"
        );
    }
}

#[tokio::test]
async fn handler_receipts_enforce_prebinding_without_authorizer_rerun() {
    let authorizer = Arc::new(Allow(AtomicUsize::new(0)));
    let original = AuthorizationPolicy::new(Some(Arc::new(Verifier)), Some(authorizer.clone()));
    let first_owner = original.clone().for_declaration::<Actor>();
    let second_owner = first_owner.clone().for_declaration::<Actor>();
    let mut headers = RebootHeaders::new("example.Actor:A");
    headers.transaction_ids = Some(vec![uuid::Uuid::new_v4()]);
    headers.transaction_coordinator_state_type = Some("example.Actor".into());
    headers.transaction_coordinator_state_ref = Some("example.Actor:A".into());
    let transaction = crate::runtime::TransactionContext::from_headers(
        headers,
        crate::runtime::TransactionMode::Exclusive,
    )
    .unwrap();
    let admission = AuthorizedHandlerAdmission {
        owner: uuid::Uuid::new_v4(),
    };
    let (context, auth) = first_owner
        .verify(
            transaction.headers().clone(),
            "example.Actor",
            "example.ActorMethods.Apply",
        )
        .await
        .unwrap();
    let mut candidates = vec![first_owner.clone(), second_owner];
    candidates.extend(rejected_policies(&original, &first_owner));
    for (index, candidate) in candidates.iter().enumerate() {
        let before = authorizer.0.load(Ordering::SeqCst);
        let entry = first_owner
            .authorize_handler_entry(
                &admission,
                &transaction,
                &context,
                auth.as_ref(),
                Some(b"snapshot"),
                b"request",
            )
            .await
            .unwrap();
        assert_eq!(authorizer.0.load(Ordering::SeqCst), before + 1);
        let result = entry.validate(
            candidate,
            &admission,
            &transaction,
            "example.Actor",
            "example.Actor:A",
            "example.ActorMethods.Apply",
            Some(b"snapshot"),
            b"request",
        );
        if index < 2 {
            result.unwrap();
        } else {
            assert_eq!(
                result.unwrap_err().code(),
                tonic::Code::FailedPrecondition,
                "negative receipt {}",
                index - 2
            );
        }
        assert_eq!(authorizer.0.load(Ordering::SeqCst), before + 1);
    }
    // Unbound -> bound rotates the Arc, so an old unbound receipt is rejected
    // using the unchanged Arc-only receipt validator.
    let entry = original
        .authorize_handler_entry(
            &admission,
            &transaction,
            &context,
            auth.as_ref(),
            Some(b"snapshot"),
            b"request",
        )
        .await
        .unwrap();
    assert_eq!(
        entry
            .validate(
                &first_owner,
                &admission,
                &transaction,
                "example.Actor",
                "example.Actor:A",
                "example.ActorMethods.Apply",
                Some(b"snapshot"),
                b"request",
            )
            .unwrap_err()
            .code(),
        tonic::Code::FailedPrecondition
    );
}
