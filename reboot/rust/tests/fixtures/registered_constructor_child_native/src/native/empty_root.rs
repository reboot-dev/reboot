//! Empty-root additions only. No Store/preseed and no WelcomeEmail acceptance.
use super::*;
pub(super) fn is_empty(case: Case) -> bool {
    matches!(case, Case::EmptyCommit | Case::EmptyAbort | Case::EmptyDenied | Case::EmptyNoOwner)
}
pub(super) struct DenyRoot;
impl reboot::auth::Authorizer for DenyRoot {
    fn authorize<'a>(&'a self, context: &'a reboot::auth::AuthorizationContext, _: Option<&'a reboot::auth::Auth>, state: Option<&'a [u8]>, _: &'a [u8]) -> reboot::auth::AuthorizeFuture<'a> {
        Box::pin(async move {
            assert_eq!(context.method, "bank.v1.BankMethods.SignUp");
            assert!(state.is_none(), "root policy must see canonical absence");
            reboot::auth::AuthorizationDecision::PermissionDenied { message: "empty Bank root denied".into() }
        })
    }
}
async fn run_empty(case: Case) {
    assert!(is_empty(case));
    let (canonical, run) = prerequisites();
    let child_id = format!("empty-child-{run}-{case:?}");
    let child_ref = state_ref(ACCOUNT, &child_id);
    let root_ref = state_ref(BANK, &format!("empty-bank-{run}-{case:?}"));
    let mut direct = bounded(db::database_client::DatabaseClient::connect(canonical.clone())).await.unwrap();
    assert_no_inventory(&mut direct).await;
    assert!(load(&mut direct, BANK, &root_ref).await.is_none());
    assert!(load(&mut direct, ACCOUNT, &child_ref).await.is_none());
    // Existing exact owner/binding/participant harness, never native substitutes.
    let observations = Arc::new(Observations::new(case, child_ref.clone()));
    let hosted = Hosted::start(&canonical, &root_ref, &child_ref, &child_id, observations.clone()).await;
    let mut public = bounded(b::bank_methods_client::BankMethodsClient::connect(hosted.endpoint.clone())).await.unwrap();
    let outgoing = request(&root_ref, b::SignUpRequest { customer_name: "Empty-root taskless customer".into() });
    let mut call = tokio::spawn(async move { public.sign_up(outgoing).await });
    let enters = matches!(case, Case::EmptyCommit | Case::EmptyAbort);
    if enters {
        bounded(async { tokio::select! {
            p = observations.child_return.acquire() => p.unwrap().forget(),
            result = &mut call => panic!("HOLD: registered absent root/child contract did not admit: {result:?}"),
        } }).await;
        hosted.retained().await;
        assert!(!call.is_finished());
        assert!(load(&mut direct, BANK, &root_ref).await.is_none());
        assert!(load(&mut direct, ACCOUNT, &child_ref).await.is_none());
        assert!(!observations.events().iter().any(|e| e.method == "TransactionParticipantPrepare"));
        observations.parent_continue.add_permits(1);
    }
    let result = bounded(call).await.unwrap();
    if case == Case::EmptyCommit {
        assert_eq!(result.unwrap().into_inner().account_id, child_id);
    } else {
        assert_eq!(result.unwrap_err().code(), match case {
            Case::EmptyAbort => Code::Aborted,
            Case::EmptyDenied => Code::PermissionDenied,
            Case::EmptyNoOwner => Code::FailedPrecondition,
            _ => unreachable!(),
        });
    }
    assert_eq!(observations.root_hooks.load(Ordering::SeqCst), usize::from(enters), "no-owner/policy must reject BEFORE handler, not at require_registered_outbound");
    assert_eq!(observations.hooks.load(Ordering::SeqCst), usize::from(enters));
    hosted.released().await;
    let bank = load(&mut direct, BANK, &root_ref).await;
    let account = load(&mut direct, ACCOUNT, &child_ref).await;
    let events = observations.events();
    assert!(!events.iter().any(|e| matches!(e.method, "Store" | "CreateActor" | "CreateActorWithTasks" | "CompleteTask")));
    assert!(observations.task_intents.lock().unwrap().is_empty());
    if case == Case::EmptyCommit {
        assert_eq!(bank, Some(b::Bank { account_ids: vec![child_id] }.encode_to_vec()));
        assert_eq!(account, Some(b::Account { customer_name: "Empty-root taskless customer".into(), balance: 0 }.encode_to_vec()));
        for (reference, expected) in [(&root_ref, &bank), (&child_ref, &account)] {
            let prepares: Vec<_> = events.iter().filter(|e| e.method == "TransactionParticipantPrepare")
                .map(|e| (db::TransactionParticipantPrepareRequest::decode(e.request.as_slice()).unwrap(), e))
                .filter(|(r, _)| &r.state_ref == reference).collect();
            assert_eq!(prepares.len(), 1);
            assert_eq!(prepares[0].0.state, *expected);
            assert!(prepares[0].0.task_upserts.is_empty());
            assert_eq!(prepares[0].1.code, None);
            assert!(prepares[0].1.response.is_some());
            assert!(events.iter().any(|e| e.method == "TransactionParticipantCommit" && e.code.is_none() && e.response.is_some()
                && &db::TransactionParticipantCommitRequest::decode(e.request.as_slice()).unwrap().state_ref == reference), "actual canonical Commit ACK for each actor required");
        }
    } else {
        assert!(bank.is_none() && account.is_none(), "failure must leave BOTH actors canonically absent");
        assert!(!events.iter().any(|e| matches!(e.method, "TransactionParticipantPrepare" | "TransactionParticipantCommit")));
    }
    if enters {
        let root_id = observations.root_identity.lock().unwrap().unwrap();
        let outcome = bounded(TonicCoordinatorWatchEndpoint::lazy(hosted.endpoint.clone()).unwrap().watch(db::WatchRequest {
            transaction_id: root_id.as_bytes().to_vec(), state_type: ACCOUNT.into(), state_ref: child_ref,
        })).await.unwrap();
        assert_eq!(outcome.aborted, case == Case::EmptyAbort);
    }
    assert_no_inventory(&mut direct).await;
    hosted.finish().await;
    println!("EMPTY_ROOT_NATIVE_ASSERTIONS_COMPLETED case={case:?} no_preseed=true taskless_only=true");
}
#[tokio::test]
#[ignore = "parent-owned private canonical native authority; lane 556 registration fix required"]
async fn empty_bank_registered_signup_commit_creates_root_and_child() { run_empty(Case::EmptyCommit).await; }
#[tokio::test]
#[ignore = "parent-owned private canonical native authority; lane 556 registration fix required"]
async fn empty_bank_abort_after_child_keeps_both_absent() { run_empty(Case::EmptyAbort).await; }
#[tokio::test]
#[ignore = "parent-owned private canonical native authority; lane 556 registration fix required"]
async fn empty_bank_policy_denial_before_handler_keeps_both_absent() { run_empty(Case::EmptyDenied).await; }
#[tokio::test]
#[ignore = "parent-owned private canonical native authority; lane 556 registration fix required"]
async fn empty_bank_no_owner_rejected_before_handler() { run_empty(Case::EmptyNoOwner).await; }
