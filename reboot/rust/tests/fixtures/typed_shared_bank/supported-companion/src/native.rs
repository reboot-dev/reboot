//! SUPPORTED SYNTHETIC SHARED ROOT COMPANION, NOT ORIGINAL BANK ACCEPTANCE.
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
struct Starts;
impl reboot::runtime::RootTransactionStartFactory for Starts {
    fn next_root_transaction(
        &self,
    ) -> Result<reboot::runtime::RootTransactionStart, tonic::Status> {
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
        Ok(Uuid::new_v4())
    }
}
struct LocalOnly;
#[tonic::async_trait]
impl reboot::runtime::TransactionalChannelResolver for LocalOnly {
    fn transactional_route(
        &self,
        _: &str,
        _: &str,
        _: &str,
    ) -> Result<reboot::runtime::TransactionalRoute, tonic::Status> {
        Ok(reboot::runtime::TransactionalRoute::RegisteredSameHost)
    }
    async fn resolve(&self, _: &str, _: &str) -> Result<tonic::transport::Channel, tonic::Status> {
        panic!("no remote fallback")
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
        let client = account::AccountMethodsClient::new(LocalOnly);
        let fault = ROOT_FAULT.try_with(|mode| *mode).unwrap_or(0);
        if fault == 1 {
            c.require_registered_outbound()?;
            let amount = r.amount;
            // Await the REAL generated Withdraw result before root-declared failure.
            match client
                .withdraw(
                    c,
                    &account::AccountMethodsTarget::new(r.from),
                    b::WithdrawRequest { amount },
                )
                .await
            {
                Ok(_) => {
                    return Err(bank::SharedRootMethodsTransferError::OverdraftError(
                        p::OverdraftError { amount: 17 },
                    ));
                }
                Err(account::AccountMethodsWithdrawError::OverdraftError(error)) => {
                    return Err(bank::SharedRootMethodsTransferError::OverdraftError(
                        p::OverdraftError {
                            amount: error.amount,
                        },
                    ));
                }
                Err(account::AccountMethodsWithdrawError::Grpc(status)) => {
                    return Err(bank::SharedRootMethodsTransferError::Grpc(status));
                }
                Err(account::AccountMethodsWithdrawError::System(error)) => {
                    return Err(bank::SharedRootMethodsTransferError::Grpc(
                        error.error.into_status(error.message),
                    ));
                }
            }
        }
        match supported_transfer(c, s, &client, r).await {
            Ok(_) if fault == 2 => Err(bank::SharedRootMethodsTransferError::OverdraftError(
                p::OverdraftError { amount: 17 },
            )),
            Ok(response) => Ok(response),
            Err(status) => {
                // This handler returns only a business outcome. Generated consuming
                // root guard must await Abort ACK before exposing it to the caller.
                if let Ok(Some(rich)) = reboot::declared_error_details(&status)
                    && rich.details.len() == 1
                    && rich.details[0].type_url == "type.googleapis.com/shared.probe.OverdraftError"
                    && let Ok(error) = p::OverdraftError::decode(rich.details[0].value.as_slice())
                {
                    return Err(bank::SharedRootMethodsTransferError::OverdraftError(
                        p::OverdraftError {
                            amount: error.amount,
                        },
                    ));
                }
                Err(bank::SharedRootMethodsTransferError::Grpc(status))
            }
        }
    }
}
async fn supported_transfer(
    c: &TransactionContext,
    s: &p::SharedRoot,
    client: &account::AccountMethodsClient<LocalOnly>,
    r: p::TransferRequest,
) -> Result<p::TransferResponse, tonic::Status> {
    c.require_registered_outbound()?;
    assert_eq!(s.marker, 7);
    match client
        .withdraw(
            c,
            &account::AccountMethodsTarget::new(r.from),
            b::WithdrawRequest { amount: r.amount },
        )
        .await
    {
        Ok(_) => {}
        Err(account::AccountMethodsWithdrawError::OverdraftError(error)) => {
            return Err(reboot::declared_error_status(
                tonic::Code::Unknown,
                "declared error",
                "type.googleapis.com/shared.probe.OverdraftError",
                &p::OverdraftError {
                    amount: error.amount,
                },
            ));
        }
        Err(account::AccountMethodsWithdrawError::Grpc(status)) => return Err(status),
        Err(account::AccountMethodsWithdrawError::System(error)) => {
            return Err(error.error.into_status(error.message));
        }
    }
    client
        .deposit(
            c,
            &account::AccountMethodsTarget::new(r.to),
            b::DepositRequest { amount: r.amount },
        )
        .await?;
    Ok(p::TransferResponse {})
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
const ABORT_LOSS: &str = "actual native Abort ACK discarded";
const CALL_BOUND: std::time::Duration = std::time::Duration::from_secs(10);
const PROBE_BOUND: std::time::Duration = std::time::Duration::from_millis(100);
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
// Shared by the native proof and causal wrapper-only failure fixtures.
async fn join_companion_host<T>(server: &mut tokio::task::JoinHandle<T>) -> T {
    match tokio::time::timeout(CALL_BOUND, &mut *server).await {
        Ok(joined) => joined.expect("host join failed"),
        Err(_) => {
            // This joins only the outer host, not its nested serving/supervisor
            // tasks. Failure still propagates; the enclosing dedicated runtime
            // destruction is the aggregate boundary before Native::drop.
            server.abort();
            let cancelled = tokio::time::timeout(CALL_BOUND, &mut *server).await;
            assert!(
                matches!(cancelled, Ok(Err(ref e)) if e.is_cancelled()),
                "host cancellation did not join before native cleanup"
            );
            panic!("host shutdown exceeded existing bounded operation budget");
        }
    }
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
    cases: std::sync::atomic::AtomicUsize,
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
    fn case(&self, label: &str) -> usize {
        let offset = self.events.lock().unwrap().len();
        self.cases.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
        println!("COMPANION_CASE {label} terminal_offset={offset}");
        offset
    }
    // Native controls identify an actor ONLY. Serial case offsets, not invented
    // root IDs, attribute these observations to this fixture's current case.
    fn assert_case(
        &self,
        offset: usize,
        operation: &'static str,
        actors: &[&str],
        discarded: Option<&str>,
    ) {
        let events = self.events.lock().unwrap();
        let events = &events[offset..];
        assert_eq!(
            events.len(),
            actors.len() * 2,
            "unexpected terminal event count: {events:?}"
        );
        for actor in actors {
            let exact = events
                .iter()
                .filter(|e| {
                    e.operation == operation
                        && e.state_type == "bank.v1.Account"
                        && e.state_ref == *actor
                })
                .collect::<Vec<_>>();
            assert_eq!(exact.len(), 2, "exact actor terminal count: {events:?}");
            assert_eq!(exact[0].observation, "native-response");
            assert_eq!(
                exact[1].observation,
                if discarded == Some(*actor) {
                    "discarded-response"
                } else {
                    "delivered-ack"
                }
            );
        }
        println!("COMPANION_TERMINALS offset={offset} events={events:?}");
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
    async fn idle(&self) {
        bounded(async {
            loop {
                let notified = self.wake.notified();
                tokio::pin!(notified);
                notified.as_mut().enable();
                let counts = self.snapshot();
                if counts.active == 0 && counts.created == counts.dropped {
                    break;
                }
                notified.await;
            }
        })
        .await;
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
    state: tempfile::TempDir,
    endpoint: String,
    port: u16,
    binary: String,
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
            state,
            endpoint: format!("http://127.0.0.1:{port}"),
            port,
            binary,
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
    fn restart(&mut self) {
        self.child.kill().unwrap();
        self.child.wait().unwrap();
        self.child = Self::spawn(&self.binary, &self.state, self.port);
        self.ready();
    }
}
impl Drop for Native {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

#[test]
fn supported_typed_shared_commit_restart_and_acknowledged_abort() {
    // Native is declared first: even unwinding drops the dedicated runtime
    // before destroying the canonical Database child/store. No Runtime owner
    // is shared, and all fixture/SDK tokio::spawn calls run in this runtime.
    let mut native = Native::start();
    let runtime = tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()
        .expect("companion dedicated runtime");
    let mut watch_observer = None;
    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        runtime.block_on(supported_typed_shared_on_runtime(
            &mut native,
            &mut watch_observer,
        ));
    }));
    // This is the aggregate destruction boundary, not an outer JoinHandle.
    // Runtime::drop waits for all of its spawned work to stop. Intentionally
    // no shutdown_timeout/background: those may leak work past Native::drop.
    // This final safety boundary is NOT time-bounded for non-yielding work.
    drop(runtime);
    if let Some(watch) = watch_observer {
        let counts = watch.snapshot();
        assert_eq!(
            counts.active, 0,
            "runtime destroyed with active Watch callback"
        );
        assert_eq!(
            counts.created, counts.dropped,
            "runtime destroyed before Watch callback destruction"
        );
        println!("COMPANION_RUNTIME_DESTROYED watches={counts:?}; NOT ORIGINAL BANK ACCEPTANCE");
    }
    if let Err(panic) = result {
        std::panic::resume_unwind(panic);
    }
    drop(native);
}

async fn supported_typed_shared_on_runtime(
    native: &mut Native,
    watch_observer: &mut Option<Arc<WatchBoundary>>,
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
        cases: std::sync::atomic::AtomicUsize::new(0),
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
    // Retain actual counters outside block_on, including its panic path.
    *watch_observer = Some(watch.clone());
    let policy = reboot::auth::AuthorizationPolicy::permissive_for_development();
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
    let mut unknown_watch_offset = None;
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
        let commit_offset = sidecar.case("commit-40");
        let transfer = p::TransferRequest {
            from: refs[1].clone(),
            to: refs[2].clone(),
            amount: 40,
            scenario: 0,
        };
        bounded(root.transfer(request(&refs[0], transfer.clone(), false)))
            .await
            .unwrap();
        for (i, balance) in [60, 40].into_iter().enumerate() {
            assert_eq!(
                bounded(accounts[i].balance(request(&refs[i + 1], b::BalanceRequest {}, false)))
                    .await
                    .unwrap()
                    .into_inner()
                    .balance,
                balance
            );
        }
        sidecar.assert_case(commit_offset, "commit", &[&refs[1], &refs[2]], None);
        watch.idle().await;
        println!(
            "COMPANION_CASE_DONE commit-40 watches={:?}",
            watch.snapshot()
        );
        native.restart(); // Same copied RocksDB store, not reseeding.
        for (i, balance) in [60, 40].into_iter().enumerate() {
            assert_eq!(
                bounded(accounts[i].balance(request(&refs[i + 1], b::BalanceRequest {}, false)))
                    .await
                    .unwrap()
                    .into_inner()
                    .balance,
                balance
            );
        }
        // Original bank.feature failure: Bob's 40 cannot fund a withdrawal of 50.
        let deficit_offset = sidecar.case("typed-deficit-10");
        let original_failure = bounded(root.transfer(request(
            &refs[0],
            p::TransferRequest {
                from: refs[2].clone(),
                to: refs[1].clone(),
                amount: 50,
                scenario: 0,
            },
            false,
        )))
        .await
        .unwrap_err();
        match bank::decode_transfer_error(original_failure) {
            bank::SharedRootMethodsTransferError::OverdraftError(error) => {
                assert_eq!(error.amount, 10)
            }
            other => panic!("original bank.feature error was not typed: {other:?}"),
        }
        sidecar.assert_case(deficit_offset, "abort", &[], None);
        watch.idle().await;
        println!(
            "COMPANION_CASE_DONE typed-deficit-10 watches={:?}",
            watch.snapshot()
        );
        for (i, balance) in [60, 40].into_iter().enumerate() {
            assert_eq!(
                bounded(accounts[i].balance(request(&refs[i + 1], b::BalanceRequest {}, false)))
                    .await
                    .unwrap()
                    .into_inner()
                    .balance,
                balance
            );
        }
        for mode in [1, 2] {
            let ack_offset = sidecar.case(&format!("typed-17-mode-{mode}"));
            let failure = ROOT_FAULT
                .scope(
                    mode,
                    bounded(root.transfer(request(&refs[0], transfer.clone(), false))),
                )
                .await
                .unwrap_err();
            let rich = reboot::declared_error_details(&failure)
                .unwrap()
                .expect("caller typed original payload");
            match bank::decode_transfer_error(failure) {
                bank::SharedRootMethodsTransferError::OverdraftError(error) => {
                    assert_eq!(error.amount, 17)
                }
                other => panic!("generated typed caller lost original payload: {other:?}"),
            }
            assert_eq!(rich.details.len(), 1);
            assert_eq!(
                rich.details[0].type_url,
                "type.googleapis.com/shared.probe.OverdraftError"
            );
            assert_eq!(
                p::OverdraftError::decode(rich.details[0].value.as_slice())
                    .unwrap()
                    .amount,
                17
            );
            for (i, balance) in [60, 40].into_iter().enumerate() {
                assert_eq!(
                    bounded(accounts[i].balance(request(
                        &refs[i + 1],
                        b::BalanceRequest {},
                        false
                    )))
                    .await
                    .unwrap()
                    .into_inner()
                    .balance,
                    balance
                );
            }
            let touched = if mode == 1 {
                vec![refs[1].as_str()]
            } else {
                vec![refs[1].as_str(), refs[2].as_str()]
            };
            sidecar.assert_case(ack_offset, "abort", &touched, None);
            watch.idle().await;
            println!(
                "COMPANION_CASE_DONE typed-17-mode-{mode} watches={:?}",
                watch.snapshot()
            );
            native.restart();
            for (i, balance) in [60, 40].into_iter().enumerate() {
                assert_eq!(
                    bounded(accounts[i].balance(request(
                        &refs[i + 1],
                        b::BalanceRequest {},
                        false
                    )))
                    .await
                    .unwrap()
                    .into_inner()
                    .balance,
                    balance
                );
            }
        }
        // Unknown response is exact transport uncertainty, NOT Bank acceptance.
        let unknown_offset = sidecar.case("unknown-alice-abort-ack");
        watch.idle().await;
        let watch_offset = watch.snapshot();
        unknown_watch_offset = Some(watch_offset);
        assert_eq!(
            watch_offset.active, 0,
            "prior cases still own Watch callbacks"
        );
        watch
            .parked
            .store(true, std::sync::atomic::Ordering::SeqCst);
        assert!(
            sidecar.lose_abort_for.lock().unwrap().is_none(),
            "loss already armed before unknown case"
        );
        *sidecar.lose_abort_for.lock().unwrap() = Some(("bank.v1.Account".into(), refs[1].clone()));
        let uncertain = ROOT_FAULT
            .scope(
                2,
                bounded(root.transfer(request(&refs[0], transfer, false))),
            )
            .await
            .unwrap_err();
        assert_eq!(uncertain.code(), tonic::Code::Unavailable);
        assert_eq!(uncertain.message(), ABORT_LOSS);
        assert!(matches!(bank::decode_transfer_error(uncertain),
        bank::SharedRootMethodsTransferError::Grpc(status)
        if status.code() == tonic::Code::Unavailable && status.message() == ABORT_LOSS));
        assert!(
            sidecar.lose_abort_for.lock().unwrap().is_none(),
            "armed exact Alice loss not consumed"
        );
        // terminal_all is ordered and short-circuits at the discarded Alice response.
        let mut targets = participants[1..]
            .iter()
            .map(|p| p.actor_target())
            .collect::<Vec<_>>();
        targets.sort();
        let mut attempted = Vec::new();
        for target in &targets {
            attempted.push(target.state_ref.as_str());
            if target.state_ref == refs[1] {
                break;
            }
        }
        sidecar.assert_case(unknown_offset, "abort", &attempted, Some(&refs[1]));
        // SAME public store gate used by normal access and participant admission.
        // No competing writer is queued ahead of this independent probe.
        let gate = store.actor_gate("bank.v1.Account", &refs[1]);
        assert!(
            tokio::time::timeout(PROBE_BOUND, gate.exclusive())
                .await
                .is_err(),
            "unknown ACK released actual Alice gate independently of host readiness"
        );
        println!(
            "COMPANION_SAME_GATE_RETAINED actor=bank.v1.Account/{}",
            refs[1]
        );
        let competing = tokio::time::timeout(
            PROBE_BOUND,
            bounded(accounts[0].deposit(request(&refs[1], b::DepositRequest { amount: 1 }, true))),
        )
        .await;
        match competing {
            Err(_) => println!("COMPANION_COMPETITOR pending; same-gate proof is independent"),
            Ok(Err(status)) => {
                assert_eq!(status.code(), tonic::Code::Unavailable);
                assert_eq!(status.message(), "registered host not ready");
                assert!(root.require_local_host_ready().is_err());
                println!("COMPANION_COMPETITOR exact host-readiness refusal; NOT gate evidence");
            }
            Ok(Ok(_)) => panic!("competing writer succeeded despite retained Alice ownership"),
        }
        sidecar.assert_case(unknown_offset, "abort", &attempted, Some(&refs[1]));
        println!(
            "COMPANION_WATCH_CASE before={watch_offset:?} after={:?}",
            watch.snapshot()
        );
    })
    .await;
    // Release/wake BEFORE shutdown/join even when a proof assertion panics.
    watch.release();
    let _ = stop.send(());
    let shutdown_result = join_companion_host(&mut server).await;
    println!("COMPANION_HOST_JOINED {shutdown_result:?}");
    // SDK may never call Watch, or may drop it unpolled after terminal_attempted.
    // Only actual callback counts are asserted, never assumed entry.
    let counts = watch.snapshot();
    assert_eq!(counts.active, 0, "host joined with active Watch callback");
    assert_eq!(
        counts.created, counts.dropped,
        "host joined before Watch destruction"
    );
    assert!(counts.entered <= counts.created);
    assert!(counts.released <= counts.entered);
    if let Some(before) = unknown_watch_offset {
        let created = counts.created - before.created;
        let entered = counts.entered - before.entered;
        let dropped = counts.dropped - before.dropped;
        let released = counts.released - before.released;
        assert_eq!(
            created, dropped,
            "unknown-case callbacks not all retired after host join"
        );
        assert!(entered <= created);
        assert!(released <= entered);
        println!(
            "COMPANION_UNKNOWN_WATCH_COUNTS created={created} entered={entered} dropped={dropped} released={released} unpolled={}",
            created - entered
        );
    }
    if let Err(panic) = proof_result {
        std::panic::resume_unwind(panic);
    }
    assert!(
        matches!(&shutdown_result,
        Err(reboot::application_host::ApplicationHostError::RecoveryTask(status))
        if status.code() == tonic::Code::Unavailable && status.message() == ABORT_LOSS),
        "unknown Abort ACK must retain exact native-loss host failure: {shutdown_result:?}"
    );
    assert_eq!(sidecar.cases.load(std::sync::atomic::Ordering::SeqCst), 5);
    println!("COMPANION_CLEANUP_AFTER_HOST_JOIN watches={counts:?}; NOT ORIGINAL BANK ACCEPTANCE");
}

// These are causal WRAPPER fixtures, not ApplicationHost/native acceptance.
// They execute the SAME join fallback as the Bank proof, but deliberately use
// a task graph and a native-owner surrogate. No Database is started, no actor
// authority is created, no ACK is fabricated and no unknown slot is released.
#[cfg(test)]
mod cleanup_failure_tests {
    use super::*;

    #[derive(Clone, Copy, Debug, PartialEq, Eq)]
    enum Failure {
        ProofPanic,
        OuterJoinTimeout,
        CancellationJoinTimeout,
    }
    type Events = Arc<Mutex<Vec<&'static str>>>;

    struct TaskDrop {
        events: Events,
        label: &'static str,
    }
    impl Drop for TaskDrop {
        fn drop(&mut self) {
            self.events.lock().unwrap().push(self.label);
        }
    }
    // A pending yieldable task normally aborts promptly. Hold its destructor
    // explicitly to exercise the REAL second CALL_BOUND timeout, not a mock
    // JoinHandle, clock advance, shorter deadline or non-yielding async loop.
    #[derive(Default)]
    struct DropGate {
        open: Mutex<bool>,
        wake: std::sync::Condvar,
    }
    impl DropGate {
        fn release(&self) {
            *self.open.lock().unwrap() = true;
            self.wake.notify_all();
        }
    }
    struct ReleaseGate(Arc<DropGate>);
    impl Drop for ReleaseGate {
        fn drop(&mut self) {
            self.0.release();
        }
    }
    struct HeldOuterDrop {
        gate: Arc<DropGate>,
        events: Events,
    }
    impl Drop for HeldOuterDrop {
        fn drop(&mut self) {
            self.events.lock().unwrap().push("outer_destructor_entered");
            let mut open = self.gate.open.lock().unwrap();
            while !*open {
                open = self.gate.wake.wait(open).unwrap();
            }
            self.events
                .lock()
                .unwrap()
                .push("outer_destructor_released");
        }
    }
    fn assert_children_alive(events: &Events, watch: &WatchBoundary) {
        let events = events.lock().unwrap();
        assert!(!events.contains(&"watch_child_dropped"));
        assert!(!events.contains(&"other_child_dropped"));
        assert!(!events.contains(&"native_owner_surrogate_dropped"));
        assert_eq!(watch.snapshot().dropped, 0);
    }

    fn run_failure(failure: Failure) {
        let events: Events = Arc::new(Mutex::new(Vec::new()));
        // Same declaration order as the native wrapper, explicitly NOT Native.
        let native_owner_surrogate = TaskDrop {
            events: events.clone(),
            label: "native_owner_surrogate_dropped",
        };
        let runtime = tokio::runtime::Builder::new_multi_thread()
            .worker_threads(2)
            .enable_all()
            .build()
            .unwrap();
        let gate = Arc::new(DropGate::default());
        // On any unexpected unwind, release the held task destructor BEFORE
        // automatic Runtime Drop. Never abandon or timeout runtime destruction.
        let release_gate = ReleaseGate(gate.clone());
        let watch = runtime.block_on(async {
            Arc::new(WatchBoundary {
                // Lazy endpoint never contacted: callback is retained parked.
                inner: reboot::legacy_coordinator::TonicCoordinatorWatchEndpoint::lazy(
                    "http://127.0.0.1:1",
                )
                .unwrap(),
                parked: std::sync::atomic::AtomicBool::new(true),
                wake: tokio::sync::Notify::new(),
                counts: Mutex::new(WatchCounts::default()),
            })
        });
        let outcome = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            runtime.block_on(async {
                let (watch_ready, watch_started) = tokio::sync::oneshot::channel();
                let (other_ready, other_started) = tokio::sync::oneshot::channel();
                let (outer_ready, outer_started) = tokio::sync::oneshot::channel();
                let (stop, stopped) = tokio::sync::oneshot::channel();
                let outer_events = events.clone();
                let child_watch = watch.clone();
                let child_gate = gate.clone();
                let mut server = tokio::spawn(async move {
                    let outer_guard = TaskDrop {
                        events: outer_events.clone(),
                        label: "outer_dropped",
                    };
                    let held_drop =
                        (failure == Failure::CancellationJoinTimeout).then(|| HeldOuterDrop {
                            gate: child_gate,
                            events: outer_events.clone(),
                        });
                    let watch_events = outer_events.clone();
                    let watch_child = tokio::spawn(async move {
                        let child_guard = TaskDrop {
                            events: watch_events,
                            label: "watch_child_dropped",
                        };
                        let mut callback =
                            reboot::legacy_coordinator::CoordinatorWatchEndpoint::watch(
                                &*child_watch,
                                reboot::database_proto::WatchRequest::default(),
                            );
                        if failure == Failure::ProofPanic {
                            // Exercise the real entered callback once. Then hold
                            // that future without repolling: its existing Watch
                            // deadline is NOT extended or made to control joins.
                            std::future::poll_fn(|cx| {
                                assert!(
                                    std::future::Future::poll(callback.as_mut(), cx).is_pending()
                                );
                                std::task::Poll::Ready(())
                            })
                            .await;
                        }
                        watch_ready.send(()).unwrap();
                        std::future::pending::<()>().await;
                        drop(callback);
                        drop(child_guard);
                    });
                    let other_events = outer_events.clone();
                    let other_child = tokio::spawn(async move {
                        let child_guard = TaskDrop {
                            events: other_events,
                            label: "other_child_dropped",
                        };
                        other_ready.send(()).unwrap();
                        std::future::pending::<()>().await;
                        drop(child_guard);
                    });
                    outer_ready.send(()).unwrap();
                    // Ordinary JoinHandles deliberately detach their children
                    // when the outer task returns or is cancelled.
                    let _ = stopped.await;
                    drop(watch_child);
                    drop(other_child);
                    drop(held_drop);
                    drop(outer_guard);
                });
                bounded(outer_started).await.unwrap();
                bounded(watch_started).await.unwrap();
                bounded(other_started).await.unwrap();
                assert_children_alive(&events, &watch);
                let before = watch.snapshot();
                assert_eq!(before.created, 1);
                assert_eq!(before.entered, usize::from(failure == Failure::ProofPanic));
                assert_eq!(before.active, before.entered);
                assert_eq!(before.released, 0);
                if failure == Failure::ProofPanic {
                    let proof = capture_proof(async {
                        std::panic::panic_any("injected wrapper proof panic");
                    })
                    .await;
                    assert!(proof.is_err());
                    stop.send(()).unwrap();
                    join_companion_host(&mut server).await;
                    assert!(events.lock().unwrap().contains(&"outer_dropped"));
                    // SUCCESSFUL outer join still has live detached callbacks.
                    assert_children_alive(&events, &watch);
                    std::panic::resume_unwind(proof.unwrap_err());
                } else {
                    // Retain stop sender: outer task stays pending throughout
                    // CALL_BOUND, so no elapsed/synthetic scheduling assumption.
                    join_companion_host(&mut server).await;
                    drop(stop);
                    panic!("timeout branch unexpectedly returned success");
                }
            });
        }));
        let panic = outcome.expect_err("failure fixture must propagate a panic");
        let message = panic
            .downcast_ref::<&str>()
            .copied()
            .or_else(|| panic.downcast_ref::<String>().map(String::as_str))
            .expect("unexpected panic payload");
        assert_eq!(
            message,
            match failure {
                Failure::ProofPanic => "injected wrapper proof panic",
                Failure::OuterJoinTimeout =>
                    "host shutdown exceeded existing bounded operation budget",
                Failure::CancellationJoinTimeout =>
                    "host cancellation did not join before native cleanup",
            }
        );
        assert_children_alive(&events, &watch);
        let before = events.lock().unwrap().clone();
        if failure == Failure::CancellationJoinTimeout {
            assert!(before.contains(&"outer_destructor_entered"));
            assert!(!before.contains(&"outer_destructor_released"));
            assert!(!before.contains(&"outer_dropped"));
        } else {
            assert!(before.contains(&"outer_dropped"));
            assert!(!before.contains(&"outer_destructor_entered"));
        }
        drop(release_gate);
        // Actual aggregate destruction, never shutdown_timeout/background.
        drop(runtime);
        events.lock().unwrap().push("runtime_destroyed");
        let counts = watch.snapshot();
        assert_eq!(counts.created, 1);
        assert_eq!(counts.dropped, 1);
        assert_eq!(counts.active, 0);
        assert_eq!(counts.entered, usize::from(failure == Failure::ProofPanic));
        assert_eq!(counts.released, 0);
        drop(native_owner_surrogate);
        let observed = events.lock().unwrap().clone();
        let position = |label| observed.iter().position(|event| *event == label).unwrap();
        for label in [
            "watch_child_dropped",
            "other_child_dropped",
            "outer_dropped",
        ] {
            assert_eq!(observed.iter().filter(|event| **event == label).count(), 1);
            assert!(position(label) < position("runtime_destroyed"));
        }
        assert!(position("runtime_destroyed") < position("native_owner_surrogate_dropped"));
        if failure == Failure::CancellationJoinTimeout {
            assert!(position("outer_destructor_entered") < position("outer_destructor_released"));
            assert!(position("outer_destructor_released") < position("runtime_destroyed"));
        }
        println!(
            "COMPANION_WRAPPER_FAILURE {failure:?} watches={counts:?} events={observed:?}; NO NATIVE/PRODUCTION HOST ACCEPTANCE"
        );
    }

    #[test]
    fn proof_panic_destroys_detached_children_before_owner() {
        run_failure(Failure::ProofPanic);
    }
    #[test]
    fn outer_join_timeout_destroys_detached_children_before_owner() {
        run_failure(Failure::OuterJoinTimeout);
    }
    #[test]
    fn second_cancellation_join_timeout_destroys_children_before_owner() {
        run_failure(Failure::CancellationJoinTimeout);
    }
}
