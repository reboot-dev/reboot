//! Native/generated receiver security matrix. No manufactured transaction context.
//! Raw ticket dispatch intentionally cannot settle the runtime-owned outbound
//! ledger: even the valid-consume case MUST abort, never claim committed membership.
use super::*;
use reboot::auth::{AuthorizationDecision, AuthorizeFuture, TokenVerification, VerifyFuture};
use std::sync::atomic::{AtomicUsize, Ordering};

tokio::task_local! { pub(super) static MATRIX: Arc<Matrix>; }
pub(super) struct Matrix {
    pub receivers: Vec<Arc<dyn b::account_methods_server::AccountMethods + Send + Sync>>,
    pub stop: std::sync::Mutex<Option<tokio::sync::oneshot::Sender<()>>>,
    binding: std::sync::Mutex<Option<reboot::registered_local::RegisteredAdapterBinding>>,
    pub allocations: AtomicUsize,
    pub loads: AtomicUsize,
    pub handlers: AtomicUsize,
    pub handler_successes: AtomicUsize,
    pub verifications: AtomicUsize,
    pub authorizations: AtomicUsize,
    scenario: u32,
    completed_replays: AtomicUsize,
    store: DatabaseActorStore,
    handler_entered: tokio::sync::Notify,
    handler_release: tokio::sync::Notify,
}
impl Matrix {
    pub fn new(
        receivers: Vec<Arc<dyn b::account_methods_server::AccountMethods + Send + Sync>>,
        stop: tokio::sync::oneshot::Sender<()>,
        scenario: u32,
        store: DatabaseActorStore,
    ) -> Self {
        Self {
            receivers,
            stop: std::sync::Mutex::new(Some(stop)),
            binding: std::sync::Mutex::new(None),
            allocations: AtomicUsize::new(0),
            loads: AtomicUsize::new(0),
            handlers: AtomicUsize::new(0),
            handler_successes: AtomicUsize::new(0),
            verifications: AtomicUsize::new(0),
            authorizations: AtomicUsize::new(0),
            scenario,
            completed_replays: AtomicUsize::new(0),
            store,
            handler_entered: tokio::sync::Notify::new(),
            handler_release: tokio::sync::Notify::new(),
        }
    }
    pub async fn suspend_handler_if_selected(&self) {
        if self.scenario == 39 {
            self.handler_entered.notify_one();
            self.handler_release.notified().await;
        }
    }
    pub(super) async fn require_retained_gate(&self, affected: &str, independent: &str) {
        use std::future::Future;
        use std::task::Poll;
        // writer_async has no network/auth await before lock.exclusive().
        // First Pending acknowledges an actual exact-actor gate admission poll.
        let entered = Arc::new(AtomicUsize::new(0));
        let marker = entered.clone();
        let mut competitor = Box::pin(self.store.writer_async::<b::Account, _, _, _>(
            "bank.v1.Account",
            request(affected, b::DepositRequest { amount: 1 }, true),
            move |s, r| {
                Box::pin(async move {
                    marker.fetch_add(1, Ordering::SeqCst);
                    s.balance += r.amount;
                    Ok(b::DepositResponse {
                        updated_balance: s.balance,
                    })
                })
            },
        ));
        std::future::poll_fn(|cx| {
            assert!(
                competitor.as_mut().poll(cx).is_pending(),
                "retained Account must block first writer admission poll"
            );
            Poll::Ready(())
        })
        .await;
        assert_eq!(entered.load(Ordering::SeqCst), 0);
        // Same store, disjoint actor: actual durable progress after revocation.
        tokio::time::timeout(
            std::time::Duration::from_secs(2),
            self.store.writer_async::<b::Account, _, _, _>(
                "bank.v1.Account",
                request(independent, b::DepositRequest { amount: 9 }, true),
                |s, r| {
                    Box::pin(async move {
                        s.balance += r.amount;
                        Ok(b::DepositResponse {
                            updated_balance: s.balance,
                        })
                    })
                },
            ),
        )
        .await
        .unwrap()
        .unwrap();
        assert!(
            tokio::time::timeout(std::time::Duration::from_millis(100), &mut competitor)
                .await
                .is_err(),
            "affected Account ownership must remain excluded after effects/revocation before unsettled root exits"
        );
        assert_eq!(entered.load(Ordering::SeqCst), 0);
        drop(competitor);
    }
    async fn revoke(&self) {
        self.stop.lock().unwrap().take().unwrap().send(()).unwrap();
        let binding = self.binding.lock().unwrap().clone().unwrap();
        tokio::time::timeout(std::time::Duration::from_secs(5), binding.host_revoked())
            .await
            .unwrap();
    }
    pub fn require_replays_completed(&self) {
        assert_eq!(
            self.completed_replays.load(Ordering::SeqCst),
            1,
            "root cancellation must not bypass original/clone replay assertions"
        );
    }
    pub fn check(&self) {
        assert_eq!(
            self.allocations.load(Ordering::SeqCst),
            1,
            "ticket mint allocates exactly once; replay cannot allocate"
        );
        let valid = matches!(self.scenario, 34 | 37);
        assert_eq!(
            self.handler_successes.load(Ordering::SeqCst),
            usize::from(valid || self.scenario == 39),
            "already-invoked handler may resume locally; receiver success and durable settlement remain forbidden after revocation"
        );
        let authorized = valid || matches!(self.scenario, 36 | 39);
        assert_eq!(
            self.verifications.load(Ordering::SeqCst),
            usize::from(authorized)
        );
        assert_eq!(
            self.authorizations.load(Ordering::SeqCst),
            usize::from(authorized)
        );
        assert_eq!(
            self.loads.load(Ordering::SeqCst),
            usize::from(authorized),
            "no second native child Load on original/clone replay"
        );
        assert_eq!(
            self.handlers.load(Ordering::SeqCst),
            usize::from(valid || self.scenario == 39),
            "revoked authorization cannot admit a handler"
        );
    }
}
pub(super) struct Policy;
impl reboot::auth::TokenVerifier for Policy {
    fn verify<'a>(
        &'a self,
        c: &'a reboot::auth::AuthorizationContext,
        _: Option<&'a str>,
    ) -> VerifyFuture<'a> {
        Box::pin(async move {
            if c.state_type == "bank.v1.Account" {
                let _ = MATRIX.try_with(|m| {
                    m.verifications.fetch_add(1, Ordering::SeqCst);
                });
            }
            TokenVerification::NoOpinion
        })
    }
}
impl reboot::auth::Authorizer for Policy {
    fn authorize<'a>(
        &'a self,
        c: &'a reboot::auth::AuthorizationContext,
        _: Option<&'a reboot::auth::Auth>,
        _: Option<&'a [u8]>,
        _: &'a [u8],
    ) -> AuthorizeFuture<'a> {
        Box::pin(async move {
            if c.state_type == "bank.v1.Account"
                && let Ok(m) = MATRIX.try_with(Arc::clone)
            {
                m.authorizations.fetch_add(1, Ordering::SeqCst);
                if m.scenario == 36 {
                    // Genuine receiver authorization is suspended across host shutdown.
                    // Return Allow only after the exact registered generation is revoked.
                    m.revoke().await;
                }
            }
            AuthorizationDecision::Allow
        })
    }
}
fn wire(
    ticket: reboot::runtime::RegisteredLocalTicket,
    h: &reboot::RebootHeaders,
    amount: u64,
) -> tonic::Request<b::WithdrawRequest> {
    let mut r = tonic::Request::new(b::WithdrawRequest { amount });
    *r.metadata_mut() = h.to_metadata().unwrap();
    r.extensions_mut().insert(ticket);
    r
}
pub(super) async fn probe(
    c: &TransactionContext,
    r: &p::TransferRequest,
) -> Result<p::TransferResponse, tonic::Status> {
    let m = MATRIX.with(Arc::clone);
    let method = "bank.v1.AccountMethods.Withdraw";
    let target = reboot::durable_coordinator::ParticipantTarget {
        state_type: "bank.v1.Account".into(),
        state_ref: r.from.clone(),
    };
    let scope = c.begin_generated_outbound_for(&target.state_type, &target.state_ref, method)?;
    let destination = c.lookup_registered_local_destination(&target, method)?;
    *m.binding.lock().unwrap() = Some(destination.binding().clone());
    let ticket = c.issue_registered_local_ticket(
        &scope,
        &destination,
        method,
        &b::WithdrawRequest { amount: 40 },
    )?;
    let clone = ticket.clone();
    let mut h = reboot::RebootHeaders::new(&r.from);
    h.server_id = c.headers().server_id.clone();
    h.transaction_ids = Some(c.transaction_ids().to_vec());
    h.transaction_coordinator_state_type = Some(c.transaction_coordinator_state_type().into());
    h.transaction_coordinator_state_ref = Some(c.transaction_coordinator_state_ref().into());
    h.coordinator_read_only_aware = c.headers().coordinator_read_only_aware;
    h.traceparent = c.headers().traceparent.clone();
    h.tracestate = c.headers().tracestate.clone();
    let first = match r.scenario {
        30 => m.receivers[1]
            .withdraw(wire(ticket.clone(), &h, 40))
            .await
            .map(|_| ()),
        31 => {
            let mut wrong = tonic::Request::new(b::DepositRequest { amount: 40 });
            *wrong.metadata_mut() = h.to_metadata().unwrap();
            wrong.extensions_mut().insert(ticket.clone());
            m.receivers[0].deposit(wrong).await.map(|_| ())
        }
        32 => m.receivers[0]
            .withdraw(wire(ticket.clone(), &h, 41))
            .await
            .map(|_| ()),
        33 => {
            let mut changed = h.clone();
            changed.traceparent = Some("changed-ticket-header".into());
            m.receivers[0]
                .withdraw(wire(ticket.clone(), &changed, 40))
                .await
                .map(|_| ())
        }
        34 | 36 | 37 => m.receivers[0]
            .withdraw(wire(ticket.clone(), &h, 40))
            .await
            .map(|_| ()),
        35 => {
            m.revoke().await;
            m.receivers[0]
                .withdraw(wire(ticket.clone(), &h, 40))
                .await
                .map(|_| ())
        }
        39 => {
            let receiver = m.receivers[0].clone();
            let child_matrix = m.clone();
            let child_wire = wire(ticket.clone(), &h, 40);
            let child = tokio::spawn(async move {
                MATRIX
                    .scope(child_matrix, receiver.withdraw(child_wire))
                    .await
            });
            tokio::time::timeout(
                std::time::Duration::from_secs(5),
                m.handler_entered.notified(),
            )
            .await
            .unwrap();
            // Actual Account handler suspended while holding its writer lease.
            m.revoke().await;
            m.require_retained_gate(&r.from, &r.to).await;
            m.handler_release.notify_one();
            let result = tokio::time::timeout(std::time::Duration::from_secs(5), child)
                .await
                .unwrap()
                .unwrap();
            let error = result.unwrap_err();
            assert!(
                matches!(
                    error.code(),
                    tonic::Code::Cancelled
                        | tonic::Code::FailedPrecondition
                        | tonic::Code::Unavailable
                ),
                "revoked handler cannot return successful staged terminal: {error:?}"
            );
            assert!(
                c.returned_participants_snapshot().is_empty(),
                "revoked raw handler cannot settle terminal membership"
            );
            m.require_retained_gate(&r.from, &r.to).await;
            Err(error)
        }
        _ => unreachable!(),
    };
    if matches!(r.scenario, 34 | 37) {
        first.unwrap();
    } else {
        let error = first.unwrap_err();
        if r.scenario <= 33 {
            assert_eq!(error.code(), tonic::Code::FailedPrecondition);
            assert_eq!(error.message(), "local ticket receiver differs");
        }
    }
    if r.scenario == 37 {
        // The actual child has returned staged effects, but no transport-owned
        // settlement has recorded membership. Revoke before root completion.
        m.revoke().await;
        m.require_retained_gate(&r.from, &r.to).await;
    }
    // Both aliases of the SAME mint, not two fresh failed calls.
    for alias in [ticket, clone] {
        let error = m.receivers[0]
            .withdraw(wire(alias, &h, 40))
            .await
            .unwrap_err();
        assert_eq!(error.code(), tonic::Code::FailedPrecondition);
        assert_eq!(error.message(), "local ticket already consumed");
    }
    m.check();
    m.completed_replays.store(1, Ordering::SeqCst);
    drop(scope); // Unsettled raw dispatch is uncertainty, never commit authority.
    Err(tonic::Status::aborted(
        "raw ticket security probe deliberately leaves settlement to reserved root owner",
    ))
}

macro_rules! ticket_case {
    ($name:ident, $scenario:expr) => {
        #[tokio::test(flavor = "multi_thread", worker_threads = 4)]
        #[ignore = "canonical CXX Database required"]
        async fn $name() {
            run_case(false, $scenario, false).await;
        }
    };
}
ticket_case!(
    shared_ticket_wrong_registered_receiver_burns_original_and_clone,
    30
);
ticket_case!(shared_ticket_wrong_method_burns_original_and_clone, 31);
ticket_case!(shared_ticket_changed_request_burns_original_and_clone, 32);
ticket_case!(shared_ticket_changed_headers_burns_original_and_clone, 33);
ticket_case!(
    shared_ticket_valid_consume_original_clone_replay_one_load_one_handler,
    34
);
ticket_case!(shared_ticket_host_shutdown_between_mint_and_consume, 35);
ticket_case!(
    shared_ticket_host_shutdown_during_receiver_authorization,
    36
);
ticket_case!(
    shared_ticket_host_shutdown_after_child_effects_retains_account_without_commit,
    37
);
ticket_case!(
    shared_ticket_host_shutdown_during_actual_account_handler,
    39
);
