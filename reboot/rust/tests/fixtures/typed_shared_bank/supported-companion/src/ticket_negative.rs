//! Ticket negative companion: supported synthetic root, actual pinned Account receiver.
//! Pristine canonical native store; actual existing fixture test constructors only.
use crate::{account_generated as account, bank::v1 as b, probe as p, root_generated as bank};
use prost::Message;
use reboot::durable_coordinator::{
    DurableRootCoordinator, ExactParticipantResolver, InProcessParticipantEndpoint,
    TonicCoordinatorSidecar,
};
use reboot::durable_participant::{
    DurableActorParticipant, DurableActorParticipantHost, ParticipantSidecar,
    TonicParticipantSidecar,
};
use reboot::runtime::{DatabaseActorStore, TransactionContext, TransactionExecution};
use std::sync::{Arc, Mutex};
use uuid::Uuid;
// Real configured callbacks, not header authority or before-effects receipts.
struct CountAuth {
    verified: std::sync::atomic::AtomicUsize,
    authorized: std::sync::atomic::AtomicUsize,
}
impl reboot::auth::TokenVerifier for CountAuth {
    fn verify<'a>(
        &'a self,
        _: &'a reboot::auth::AuthorizationContext,
        _: Option<&'a str>,
    ) -> reboot::auth::VerifyFuture<'a> {
        self.verified
            .fetch_add(1, std::sync::atomic::Ordering::SeqCst);
        Box::pin(async { reboot::auth::TokenVerification::NoOpinion })
    }
}
impl reboot::auth::Authorizer for CountAuth {
    fn authorize<'a>(
        &'a self,
        _: &'a reboot::auth::AuthorizationContext,
        _: Option<&'a reboot::auth::Auth>,
        _: Option<&'a [u8]>,
        _: &'a [u8],
    ) -> reboot::auth::AuthorizeFuture<'a> {
        self.authorized
            .fetch_add(1, std::sync::atomic::Ordering::SeqCst);
        Box::pin(async { reboot::auth::AuthorizationDecision::Allow })
    }
}
struct Starts;
impl reboot::runtime::RootTransactionStartFactory for Starts {
    fn next_root_transaction(
        &self,
    ) -> Result<reboot::runtime::RootTransactionStart, tonic::Status> {
        let _ = ROOT_STARTS.try_with(|count| {
            count.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
        });
        Ok(reboot::runtime::RootTransactionStart {
            transaction_id: Uuid::new_v4(),
            timestamp: prost_types::Timestamp::default(),
        })
    }
}
impl reboot::runtime::InboundTransactionStartFactory for Starts {
    fn next_inbound_transaction(
        &self,
        _: &reboot::runtime::InboundTransactionContext,
    ) -> Result<Uuid, tonic::Status> {
        let _ = INBOUND_STARTS.try_with(|count| {
            count.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
        });
        Ok(Uuid::new_v4())
    }
}
struct Account;
#[tonic::async_trait]
impl account::AccountMethodsTransactionHandler for Account {
    // Exact supported test-constructor scope copied from genuine existing fixture.
    // NOT original Account.Open+WelcomeEmail behavior, no TaskId/scheduling claim.
    async fn open(
        &self,
        s: &mut b::Account,
        r: b::OpenRequest,
    ) -> Result<b::OpenResponse, tonic::Status> {
        s.customer_name = r.customer_name;
        Ok(b::OpenResponse::default())
    }
    async fn balance(
        &self,
        s: &b::Account,
        _: b::BalanceRequest,
    ) -> Result<b::BalanceResponse, tonic::Status> {
        Ok(crate::semantics::balance(s))
    }
    async fn deposit(
        &self,
        s: &mut b::Account,
        r: b::DepositRequest,
    ) -> Result<b::DepositResponse, tonic::Status> {
        crate::semantics::deposit(s, r).map_err(|error| *error)
    }
    async fn withdraw(
        &self,
        s: &mut b::Account,
        r: b::WithdrawRequest,
    ) -> Result<b::WithdrawResponse, account::AccountMethodsWithdrawError> {
        CHILD_HANDLERS.with(|count| count.fetch_add(1, std::sync::atomic::Ordering::SeqCst));
        crate::semantics::withdraw(s, r).map_err(|error| *error)
    }
    async fn welcome_email(
        &self,
        _: &mut b::Account,
        _: b::WelcomeEmailRequest,
    ) -> Result<b::WelcomeEmailResponse, tonic::Status> {
        Err(tonic::Status::failed_precondition(
            "constructor task/Wait combination not admitted by this bounded fixture",
        ))
    }
}
tokio::task_local! { static ROOT_FAULT: u8; }
struct Bank;
#[tonic::async_trait]
impl bank::SharedRootMethodsTransactionHandler for Bank {
    async fn initialize(
        &self,
        s: &mut p::SharedRoot,
        _: p::InitializeRequest,
    ) -> Result<p::InitializeResponse, tonic::Status> {
        s.marker = 7;
        Ok(p::InitializeResponse {})
    }
    async fn transfer(
        &self,
        _: &TransactionContext,
        _: &mut p::SharedRoot,
        _: p::TransferRequest,
    ) -> Result<TransactionExecution<p::TransferResponse>, tonic::Status> {
        SHARED_HANDLERS.with(|count| {
            count.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
        });
        panic!("wrong-target ticket reached ordinary shared Transfer");
        #[allow(unreachable_code)]
        Err(tonic::Status::failed_precondition(
            "Transfer requires registered opt-in shared existing-writer root",
        ))
    }
    async fn transfer_fresh_shared(
        &self,
        _: &reboot::runtime::SharedLocalTransactionContext,
        _: &mut p::SharedRoot,
        _: p::TransferRequest,
    ) -> Result<p::TransferResponse, tonic::Status> {
        SHARED_HANDLERS.with(|count| {
            count.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
        });
        panic!("wrong-target ticket reached fresh shared Transfer");
        #[allow(unreachable_code)]
        Err(tonic::Status::failed_precondition(
            "fresh shared Transfer does not own Account effects",
        ))
    }
    async fn transfer_typed_shared_existing_writers(
        &self,
        c: &TransactionContext,
        s: &p::SharedRoot,
        r: p::TransferRequest,
    ) -> Result<p::TransferResponse, bank::SharedRootMethodsTransferError> {
        SHARED_HANDLERS.with(|count| {
            count.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
        });
        assert_eq!(s.marker, 7);
        assert!(
            r.scenario < 6,
            "wrong-target ticket admitted a typed shared child"
        );
        let receiver = TICKET_RECEIVER.with(Arc::clone);
        let shared = if r.scenario == 2 || r.scenario == 5 {
            DEFAULT_RECEIVER.with(Arc::clone)
        } else {
            SHARED_RECEIVER.with(Arc::clone)
        };
        let mut headers = reboot::RebootHeaders::new(c.transaction_coordinator_state_ref());
        // Inbound metadata describes the actual root, but grants no authority.
        if r.scenario == 0 || r.scenario == 3 || r.scenario == 5 {
            headers.server_id = c.headers().server_id.clone();
            headers.transaction_ids = Some(c.transaction_ids().to_vec());
            headers.transaction_coordinator_state_type =
                Some(c.transaction_coordinator_state_type().into());
            headers.transaction_coordinator_state_ref =
                Some(c.transaction_coordinator_state_ref().into());
            headers.coordinator_read_only_aware = c.headers().coordinator_read_only_aware;
        }
        // No-ticket controls independently exercise the declaration refusal.
        // Never call opt-in ordinary without a ticket: that is a legitimate root.
        let default = DEFAULT_RECEIVER.with(Arc::clone);
        let optin = SHARED_RECEIVER.with(Arc::clone);
        let mut inbound_headers = reboot::RebootHeaders::new(c.transaction_coordinator_state_ref());
        inbound_headers.transaction_ids = Some(c.transaction_ids().to_vec());
        inbound_headers.transaction_coordinator_state_type =
            Some(c.transaction_coordinator_state_type().into());
        inbound_headers.transaction_coordinator_state_ref =
            Some(c.transaction_coordinator_state_ref().into());
        for (receiver, control_headers) in [
            (
                default.clone(),
                reboot::RebootHeaders::new(c.transaction_coordinator_state_ref()),
            ),
            (default, inbound_headers.clone()),
            (optin, inbound_headers),
        ] {
            let mut request = tonic::Request::new(p::TransferRequest {
                scenario: 100,
                ..r.clone()
            });
            *request.metadata_mut() = control_headers.to_metadata().unwrap();
            let error = receiver.transfer(request).await.unwrap_err();
            assert_eq!(error.code(), tonic::Code::FailedPrecondition);
            assert_eq!(
                error.message(),
                "shared declared errors require registered existing-writer root opt-in; inbound and ordinary shared execution remain unsupported"
            );
        }
        let body = p::TransferRequest {
            scenario: 100,
            ..r.clone()
        };
        let result = crate::registered_ticket_probe::shared_receiver_burns_account_ticket(
            c,
            &r.from,
            receiver.as_ref(),
            headers,
            body,
            r.scenario < 3,
            |request| async move { shared.transfer(request).await.map(|_| ()) },
        )
        .await;
        if matches!(&result, Err(status) if status.code() == tonic::Code::Aborted && status.message() == "typed shared ticket burn/replay probe completed; root must abort")
        {
            TICKET_COMPLETED.with(|count| {
                count.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
            });
        }
        result
            .map(|_| p::TransferResponse {})
            .map_err(bank::SharedRootMethodsTransferError::Grpc)
    }
}
fn request<M>(reference: &str, message: M, writer: bool) -> tonic::Request<M> {
    let mut headers = reboot::RebootHeaders::new(reference);
    if writer {
        headers.idempotency_key = Some(Uuid::new_v4());
    }
    let mut request = tonic::Request::new(message);
    *request.metadata_mut() = headers.to_metadata().unwrap();
    request
}
type Rpc<'a, T> =
    std::pin::Pin<Box<dyn std::future::Future<Output = Result<T, tonic::Status>> + Send + 'a>>;
const ABORT_UNCERTAINTY: &str = "late enlistment retained; explicit cleanup is incomplete";
const ABORT_LOSS: &str = "actual native Abort ACK discarded";
const CALL_BOUND: std::time::Duration = std::time::Duration::from_secs(10);
async fn bounded<F: std::future::Future>(f: F) -> F::Output {
    tokio::time::timeout(CALL_BOUND, f)
        .await
        .expect("bounded companion operation")
}
// Catch assertion panics while the host/native owners remain alive, then drain
// the host before resuming the panic. No uncertain slot is cleared for cleanup.
async fn capture_proof<F: std::future::Future>(
    f: F,
) -> Result<F::Output, Box<dyn std::any::Any + Send>> {
    let mut f = Box::pin(f);
    std::future::poll_fn(move |cx| {
        match std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| f.as_mut().poll(cx))) {
            Ok(std::task::Poll::Ready(value)) => std::task::Poll::Ready(Ok(value)),
            Ok(std::task::Poll::Pending) => std::task::Poll::Pending,
            Err(panic) => std::task::Poll::Ready(Err(panic)),
        }
    })
    .await
}
#[derive(Clone, Debug, PartialEq, Eq)]
struct TerminalEvent {
    operation: &'static str,
    state_type: String,
    state_ref: String,
    observation: &'static str,
}
struct AckSidecar {
    inner: TonicParticipantSidecar,
    events: Mutex<Vec<TerminalEvent>>,
    lose_abort_for: Mutex<Option<(String, String)>>,
    loads: std::sync::atomic::AtomicUsize,
}
impl AckSidecar {
    fn record(&self, operation: &'static str, actor: &(String, String), observation: &'static str) {
        self.events.lock().unwrap().push(TerminalEvent {
            operation,
            state_type: actor.0.clone(),
            state_ref: actor.1.clone(),
            observation,
        });
    }
}
impl ParticipantSidecar for AckSidecar {
    fn database_endpoint(&self) -> Option<&str> {
        self.inner.database_endpoint()
    }
    fn load(
        &self,
        r: reboot::database_proto::LoadRequest,
    ) -> Rpc<'_, reboot::database_proto::LoadResponse> {
        self.loads.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
        self.inner.load(r)
    }
    fn prepare(
        &self,
        r: reboot::database_proto::TransactionParticipantPrepareRequest,
    ) -> Rpc<'_, reboot::database_proto::TransactionParticipantPrepareResponse> {
        self.inner.prepare(r)
    }
    fn commit(
        &self,
        r: reboot::database_proto::TransactionParticipantCommitRequest,
    ) -> Rpc<'_, reboot::database_proto::TransactionParticipantCommitResponse> {
        Box::pin(async move {
            let actor = (r.state_type.clone(), r.state_ref.clone());
            let response = self.inner.commit(r).await?;
            self.record("commit", &actor, "native-response");
            self.record("commit", &actor, "delivered-ack");
            Ok(response)
        })
    }
    fn abort(
        &self,
        r: reboot::database_proto::TransactionParticipantAbortRequest,
    ) -> Rpc<'_, reboot::database_proto::TransactionParticipantAbortResponse> {
        Box::pin(async move {
            let actor = (r.state_type.clone(), r.state_ref.clone());
            let response = self.inner.abort(r).await?;
            self.record("abort", &actor, "native-response");
            let lose = {
                let mut arm = self.lose_abort_for.lock().unwrap();
                if arm.as_ref() == Some(&actor) {
                    arm.take();
                    true
                } else {
                    false
                }
            };
            if lose {
                self.record("abort", &actor, "discarded-response");
                return Err(tonic::Status::unavailable(ABORT_LOSS));
            }
            self.record("abort", &actor, "delivered-ack");
            Ok(response)
        })
    }
    fn recover(
        &self,
        r: reboot::database_proto::RecoverRequest,
    ) -> Rpc<'_, Vec<reboot::database_proto::RecoverResponse>> {
        self.inner.recover(r)
    }
    fn recover_idempotent_mutations(
        &self,
        r: reboot::database_proto::RecoverIdempotentMutationsRequest,
    ) -> Rpc<'_, Vec<reboot::database_proto::RecoverIdempotentMutationsResponse>> {
        self.inner.recover_idempotent_mutations(r)
    }
}
#[derive(Clone, Copy, Debug, Default)]
struct WatchCounts {
    created: usize,
    entered: usize,
    dropped: usize,
    active: usize,
    released: usize,
}
struct WatchBoundary {
    inner: reboot::legacy_coordinator::TonicCoordinatorWatchEndpoint,
    parked: std::sync::atomic::AtomicBool,
    wake: tokio::sync::Notify,
    counts: Mutex<WatchCounts>,
}
impl WatchBoundary {
    fn snapshot(&self) -> WatchCounts {
        *self.counts.lock().unwrap()
    }
    fn release(&self) {
        self.parked
            .store(false, std::sync::atomic::Ordering::SeqCst);
        self.wake.notify_waiters();
        println!("COMPANION_WATCH_RELEASE {:?}", self.snapshot());
    }
}
struct WatchCallback<'a> {
    boundary: &'a WatchBoundary,
    entered: bool,
    actor: (String, String),
}
impl Drop for WatchCallback<'_> {
    fn drop(&mut self) {
        let mut counts = self.boundary.counts.lock().unwrap();
        counts.dropped += 1;
        if self.entered {
            counts.active -= 1;
        }
        drop(counts);
        println!(
            "COMPANION_WATCH_DROP actor={}/{} entered={}",
            self.actor.0, self.actor.1, self.entered
        );
        self.boundary.wake.notify_waiters();
    }
}
impl reboot::legacy_coordinator::CoordinatorWatchEndpoint for WatchBoundary {
    fn watch(
        &self,
        r: reboot::database_proto::WatchRequest,
    ) -> Rpc<'_, reboot::database_proto::WatchResponse> {
        self.counts.lock().unwrap().created += 1;
        // Capture Drop before polling: SDK may cancel the returned future without
        // ever entering its body when terminal_attempted is already observed.
        let mut callback = WatchCallback {
            boundary: self,
            entered: false,
            actor: (r.state_type.clone(), r.state_ref.clone()),
        };
        Box::pin(async move {
            let deadline = tokio::time::Instant::now() + CALL_BOUND;
            callback.entered = true;
            {
                let mut counts = self.counts.lock().unwrap();
                counts.entered += 1;
                counts.active += 1;
            }
            println!(
                "COMPANION_WATCH_ENTER actor={}/{}",
                r.state_type, r.state_ref
            );
            loop {
                let notified = self.wake.notified();
                tokio::pin!(notified);
                notified.as_mut().enable(); // arm BEFORE reading: no lost wake
                if !self.parked.load(std::sync::atomic::Ordering::SeqCst) {
                    break;
                }
                tokio::time::timeout_at(deadline, notified)
                    .await
                    .map_err(|_| {
                        tonic::Status::deadline_exceeded("companion Watch barrier deadline")
                    })?;
            }
            self.counts.lock().unwrap().released += 1;
            let response = tokio::time::timeout_at(
                deadline,
                reboot::legacy_coordinator::CoordinatorWatchEndpoint::watch(&self.inner, r),
            )
            .await
            .map_err(|_| {
                tonic::Status::deadline_exceeded("companion actual Watch observer deadline")
            })?;
            drop(callback);
            response
        })
    }
}

struct Native {
    child: std::process::Child,
    _state: tempfile::TempDir,
    endpoint: String,
    port: u16,
}
impl Native {
    fn start() -> Self {
        let binary = std::env::var("REBOOT_NATIVE2PC_CXX_DATABASE")
            .expect("canonical CXX Database required");
        let socket = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let port = socket.local_addr().unwrap().port();
        drop(socket);
        let state = tempfile::tempdir().unwrap();
        std::fs::write(
            state.path().join("server-info.pb"),
            reboot::database_proto::ServerInfo {
                shard_infos: vec![reboot::database_proto::ShardInfo {
                    shard_id: "s000000000".into(),
                    shard_first_key: vec![],
                }],
            }
            .encode_to_vec(),
        )
        .unwrap();
        let child = Self::spawn(&binary, &state, port);
        let mut native = Self {
            child,
            _state: state,
            endpoint: format!("http://127.0.0.1:{port}"),
            port,
        };
        native.ready();
        native
    }
    fn spawn(binary: &str, state: &tempfile::TempDir, port: u16) -> std::process::Child {
        std::process::Command::new(binary)
            .arg(state.path().join("rocksdb"))
            .arg(state.path().join("server-info.pb"))
            .arg(port.to_string())
            .stdout(std::process::Stdio::null())
            .spawn()
            .unwrap()
    }
    fn ready(&mut self) {
        for _ in 0..500 {
            if std::net::TcpStream::connect(("127.0.0.1", self.port)).is_ok() {
                return;
            }
            assert!(
                self.child.try_wait().unwrap().is_none(),
                "CXX Database startup failed"
            );
            std::thread::sleep(std::time::Duration::from_millis(10));
        }
        panic!("CXX startup deadline");
    }
}
impl Drop for Native {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

tokio::task_local! {
    static TICKET_RECEIVER: Arc<dyn b::account_methods_server::AccountMethods + Send + Sync>;
    static SHARED_RECEIVER: Arc<dyn p::shared_root_methods_server::SharedRootMethods + Send + Sync>;
    static DEFAULT_RECEIVER: Arc<dyn p::shared_root_methods_server::SharedRootMethods + Send + Sync>;
    static ROOT_STARTS: Arc<std::sync::atomic::AtomicUsize>;
    static INBOUND_STARTS: Arc<std::sync::atomic::AtomicUsize>;
    static SHARED_HANDLERS: Arc<std::sync::atomic::AtomicUsize>;
    static TICKET_COMPLETED: Arc<std::sync::atomic::AtomicUsize>;
    static CHILD_HANDLERS: Arc<std::sync::atomic::AtomicUsize>;
}
#[test]
fn typed_shared_ticket_malformed_optin_inbound() {
    run_typed_ticket_case(0);
}
#[test]
fn typed_shared_ticket_malformed_optin_ordinary() {
    run_typed_ticket_case(1);
}
#[test]
fn typed_shared_ticket_malformed_default_ordinary() {
    run_typed_ticket_case(2);
}
#[test]
fn typed_shared_ticket_valid_optin_inbound() {
    run_typed_ticket_case(3);
}
#[test]
fn typed_shared_ticket_valid_optin_ordinary() {
    run_typed_ticket_case(4);
}
#[test]
fn typed_shared_ticket_valid_default_inbound() {
    run_typed_ticket_case(5);
}
fn run_typed_ticket_case(scenario: u32) {
    // Declaration order also protects setup/unwind before explicit destruction.
    let mut native = Native::start();
    let runtime = tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()
        .expect("ticket dedicated runtime");
    let mut watch_observer = None;
    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        runtime.block_on(typed_ticket_on_runtime(
            &mut native,
            &mut watch_observer,
            scenario,
        ));
    }));
    // Aggregate destruction before native child/store cleanup. Not bounded for
    // non-yielding/blocking work: parent watchdog must fail hangs, never accept.
    drop(runtime);
    if let Some(watch) = watch_observer {
        let counts = watch.snapshot();
        assert_eq!(
            counts.active, 0,
            "runtime destroyed with active ticket Watch"
        );
        assert_eq!(
            counts.created, counts.dropped,
            "runtime destroyed before Watch callback destruction"
        );
        println!("TYPED_TICKET_RUNTIME_DESTROYED scenario={scenario} watches={counts:?}");
    }
    if let Err(panic) = result {
        std::panic::resume_unwind(panic);
    }
    drop(native);
}
async fn typed_ticket_on_runtime(
    native: &mut Native,
    watch_observer: &mut Option<Arc<WatchBoundary>>,
    scenario: u32,
) {
    use b::account_methods_server::AccountMethods;
    use p::shared_root_methods_server::SharedRootMethods;
    let refs = [
        ("shared.probe.SharedRoot", "root"),
        ("bank.v1.Account", "alice"),
        ("bank.v1.Account", "bob"),
    ]
    .map(|(t, id)| {
        reboot::state_ref::StateRef::from_id(t, id)
            .unwrap()
            .to_string()
    });
    let store = bounded(DatabaseActorStore::connect(&native.endpoint))
        .await
        .unwrap();
    let sidecar = Arc::new(AckSidecar {
        inner: bounded(TonicParticipantSidecar::connect(&native.endpoint))
            .await
            .unwrap(),
        events: Mutex::new(Vec::new()),
        lose_abort_for: Mutex::new(None),
        loads: std::sync::atomic::AtomicUsize::new(0),
    });
    let participants = [
        ("shared.probe.SharedRoot", &refs[0]),
        ("bank.v1.Account", &refs[1]),
        ("bank.v1.Account", &refs[2]),
    ]
    .map(|(t, r)| DurableActorParticipant::new(sidecar.clone(), t, r));
    // Resolver supplies actual exact host endpoints; membership is still populated
    // by generated calls and consuming SDK owner, never returned arbitrary vectors.
    let resolver = Arc::new(
        ExactParticipantResolver::new(participants.iter().map(|a| {
            (
                a.actor_target(),
                Arc::new(InProcessParticipantEndpoint::new(
                    DurableActorParticipantHost::new(a.clone()),
                )),
            )
        }))
        .unwrap(),
    );
    let coordinator = Arc::new(
        bounded(TonicCoordinatorSidecar::connect(&native.endpoint))
            .await
            .unwrap(),
    );
    let coordinators = participants
        .iter()
        .map(|a| {
            DurableRootCoordinator::new(coordinator.clone(), resolver.clone())
                .with_identity(a.actor_target())
        })
        .collect::<Vec<_>>();
    let socket = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
    let address = socket.local_addr().unwrap();
    drop(socket);
    let watch = Arc::new(WatchBoundary {
        inner: reboot::legacy_coordinator::TonicCoordinatorWatchEndpoint::lazy(format!(
            "http://{address}"
        ))
        .unwrap(),
        parked: std::sync::atomic::AtomicBool::new(false),
        wake: tokio::sync::Notify::new(),
        counts: Mutex::new(WatchCounts::default()),
    });
    *watch_observer = Some(watch.clone());
    let auth = Arc::new(CountAuth {
        verified: std::sync::atomic::AtomicUsize::new(0),
        authorized: std::sync::atomic::AtomicUsize::new(0),
    });
    let policy = reboot::auth::AuthorizationPolicy::new(Some(auth.clone()), Some(auth.clone()));
    let mut host =
        reboot::application_host::ApplicationHost::new("original-bank-existing-accounts");
    let default_only = bank::SharedRootMethodsTransactionAdapter::new(
        store.clone(),
        participants[0].clone(),
        coordinators[0].clone(),
        Starts,
        Bank,
    )
    .with_authorization(policy.clone());
    let rejected = bounded(default_only.transfer(request(
        &refs[0],
        p::TransferRequest {
            from: refs[1].clone(),
            to: refs[2].clone(),
            amount: 40,
            scenario: 0,
        },
        false,
    )))
    .await
    .unwrap_err();
    assert_eq!(rejected.code(), tonic::Code::FailedPrecondition);
    assert_eq!(
        sidecar.loads.load(std::sync::atomic::Ordering::SeqCst),
        0,
        "default typed shared mode reached native Load"
    );
    assert!(
        sidecar.events.lock().unwrap().is_empty(),
        "unsupported default shared path reached native mutation"
    );
    let root = bank::SharedRootMethodsTransactionAdapter::new(
        store.clone(),
        participants[0].clone(),
        coordinators[0].clone(),
        Starts,
        Bank,
    )
    .with_authorization(policy.clone())
    .with_explicit_abort_owner(reboot::explicit_abort::ExplicitAbortOwner::new(8).unwrap())
    .with_shared_existing_writers();
    let (root, _) = host.register_local_transaction_service(root).unwrap();
    let mut accounts = Vec::new();
    for i in 1..=2 {
        let adapter = account::AccountMethodsTransactionAdapter::new(
            store.clone(),
            participants[i].clone(),
            coordinators[i].clone(),
            Starts,
            Account,
        )
        .with_authorization(policy.clone())
        .with_live_participant_owner(
            reboot::live_participant::LiveParticipantOwner::new(
                8,
                participants[0].actor_target(),
                watch.clone(),
            )
            .unwrap(),
        );
        let (adapter, _) = host.register_local_transaction_service(adapter).unwrap();
        accounts.push(adapter);
    }
    let metadata = reboot::durable_participant::ParticipantRecovery {
        shard_ids: vec!["s000000000".into()],
        ..Default::default()
    };
    let mut recovery = root
        .legacy_recovery_registration(
            reboot::application_host::LegacyRecoveryMetadata {
                participant: metadata.clone(),
                coordinator: reboot::durable_coordinator::CoordinatorRecovery {
                    shard_ids: vec!["s000000000".into()],
                    coordinator_state_ref: refs[0].clone(),
                    ..Default::default()
                },
            },
            watch.clone(),
        )
        .unwrap();
    for p in participants.iter().skip(1) {
        recovery = recovery
            .with_participant(p.clone(), metadata.clone())
            .unwrap();
    }
    let control = root
        .legacy_coordinator_control_service("shared.probe.SharedRoot", &refs[0])
        .unwrap();
    let mut host = host
        .with_host_recovery(recovery)
        .with_host_recovery(root.explicit_abort_recovery_registration().unwrap());
    for a in &accounts {
        host = host.with_host_recovery(a.live_participant_recovery_registration().unwrap());
    }
    let (stop, stopped) = tokio::sync::oneshot::channel();
    let mut server = tokio::spawn(
        host.add_legacy_control_service(control)
            .add_public_service(p::shared_root_methods_server::SharedRootMethodsServer::new(
                root.clone(),
            ))
            .serve_with_shutdown(address, async {
                let _ = stopped.await;
            }),
    );
    let proof_result = capture_proof(async {
        tokio::time::timeout(std::time::Duration::from_secs(10), async {
            while root.require_local_host_ready().is_err() {
                tokio::task::yield_now().await;
            }
        })
        .await
        .unwrap();
        bounded(root.initialize(request(&refs[0], p::InitializeRequest {}, true)))
            .await
            .unwrap();
        for i in 0..2 {
            bounded(accounts[i].open(request(
                &refs[i + 1],
                b::OpenRequest {
                    customer_name: format!("probe-{i}"),
                },
                true,
            )))
            .await
            .unwrap();
        }
        bounded(accounts[0].deposit(request(&refs[1], b::DepositRequest { amount: 100 }, true)))
            .await
            .unwrap();
        for (i, balance) in [100, 0].into_iter().enumerate() {
            assert_eq!(
                bounded(accounts[i].balance(request(&refs[i + 1], b::BalanceRequest {}, false)))
                    .await
                    .unwrap()
                    .into_inner()
                    .balance,
                balance,
                "pristine supported test constructors must produce Alice=100,Bob=0"
            );
        }
        { // One root per dedicated host: unsettled issuance intentionally latches failure.
            let verify_offset = auth.verified.load(std::sync::atomic::Ordering::SeqCst);
            let auth_offset = auth.authorized.load(std::sync::atomic::Ordering::SeqCst);
            let load_offset = sidecar.loads.load(std::sync::atomic::Ordering::SeqCst);
            let terminal_offset = sidecar.events.lock().unwrap().len();
            let receiver: Arc<dyn b::account_methods_server::AccountMethods + Send + Sync> = Arc::new(accounts[0].clone());
            let shared: Arc<dyn p::shared_root_methods_server::SharedRootMethods + Send + Sync> = Arc::new(root.clone());
            let default: Arc<dyn p::shared_root_methods_server::SharedRootMethods + Send + Sync> = Arc::new(default_only.clone());
            let completed = Arc::new(std::sync::atomic::AtomicUsize::new(0));
            let handlers = Arc::new(std::sync::atomic::AtomicUsize::new(0));
            let shared_handlers = Arc::new(std::sync::atomic::AtomicUsize::new(0));
            let roots = Arc::new(std::sync::atomic::AtomicUsize::new(0));
            let children = Arc::new(std::sync::atomic::AtomicUsize::new(0));
            let call = bounded(root.transfer(request(&refs[0], p::TransferRequest {
                from: refs[1].clone(), to: refs[2].clone(), amount: 40, scenario,
            }, false)));
            let error = ROOT_STARTS.scope(roots.clone(), INBOUND_STARTS.scope(children.clone(),
                SHARED_HANDLERS.scope(shared_handlers.clone(), CHILD_HANDLERS.scope(handlers.clone(),
                TICKET_COMPLETED.scope(completed.clone(), TICKET_RECEIVER.scope(receiver,
                SHARED_RECEIVER.scope(shared, DEFAULT_RECEIVER.scope(default, call)))))))).await.unwrap_err();
            assert_eq!(auth.verified.load(std::sync::atomic::Ordering::SeqCst) - verify_offset, 1, "only issuing root verification; rejected shared receiver/replays must precede authority");
            assert_eq!(auth.authorized.load(std::sync::atomic::Ordering::SeqCst) - auth_offset, 1, "only issuing root authorization; no shared receiver/replay authority entry");
            assert_eq!(completed.load(std::sync::atomic::Ordering::SeqCst), 1, "scenario={scenario}: shared refusal AND both Account alias replays must complete");
            assert_eq!(handlers.load(std::sync::atomic::Ordering::SeqCst), 0, "no Account Withdraw handler entry");
            assert_eq!(shared_handlers.load(std::sync::atomic::Ordering::SeqCst), 1, "only actual issuing root handler; no shared child/ordinary/fresh hook");
            assert_eq!(roots.load(std::sync::atomic::Ordering::SeqCst), 1, "only issuing root may allocate root start");
            assert_eq!(children.load(std::sync::atomic::Ordering::SeqCst), 1, "only legitimate Account ticket issuance allocates; rejected receiver/replays never start a child");
            assert_eq!(error.code(), tonic::Code::FailedPrecondition, "unsettled ticket ownership must fail closed");
            assert_eq!(error.message(), ABORT_UNCERTAINTY, "consuming Abort uncertainty must override raw probe Aborted");
            assert_eq!(sidecar.loads.load(std::sync::atomic::Ordering::SeqCst) - load_offset, 1, "only genuine root admission Load; wrong-target shared receiver and both replays must not Load");
            assert_eq!(sidecar.events.lock().unwrap().len(), terminal_offset, "no native child terminals after rejected shared ticket/replays");
            println!("TYPED_TICKET_CASE scenario={scenario} completed=1 root_loads=1 shared_handlers=1 account_handlers=0 root_starts=1 issue_allocations=1 verifier=1 authorizer=1 child_terminals=0");
        }
    }).await;
    watch.release();
    let _ = stop.send(());
    let joined = tokio::time::timeout(CALL_BOUND, &mut server)
        .await
        .expect("ticket host must join; timeout is not cleanup proof")
        .expect("ticket host join");
    println!("TICKET_NEGATIVE_HOST_JOINED {joined:?}");
    if proof_result.is_ok() {
        assert!(
            matches!(&joined, Err(reboot::application_host::ApplicationHostError::RecoveryTask(status))
            if status.code() == tonic::Code::FailedPrecondition && status.message() == ABORT_UNCERTAINTY),
            "unsettled ticket must retain exact owner uncertainty at host shutdown: {joined:?}"
        );
    }
    assert_eq!(watch.snapshot().active, 0);
    assert_eq!(watch.snapshot().created, watch.snapshot().dropped);
    if let Err(panic) = proof_result {
        std::panic::resume_unwind(panic);
    }
}
