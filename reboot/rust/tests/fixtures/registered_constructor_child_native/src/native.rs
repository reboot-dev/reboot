//! Canonical-native SOURCE candidate. Parent owns exclusive native authority and processes.
//! Fixed explicit ID + canonically configured existing Bank + taskless Open are prerequisites,
//! not unchanged original SignUp/WelcomeEmail or implicit/default Bank construction.
use crate::{account_generated as ag, bank_generated as bg, bank::v1 as b};
use prost::Message;
use reboot::{
    application_host::{ApplicationHost, LegacyRecoveryMetadata},
    database_proto as db,
    durable_coordinator::{CoordinatorRecovery, DurableRootCoordinator, ExactParticipantResolver, InProcessParticipantEndpoint, TonicCoordinatorSidecar},
    durable_participant::{DurableActorParticipant, DurableActorParticipantHost, ParticipantRecovery, TonicParticipantSidecar},
    legacy_coordinator::{CoordinatorWatchEndpoint, CoordinatorWatchFuture, TonicCoordinatorWatchEndpoint},
    runtime::{DatabaseActorStore, InboundTransactionContext, InboundTransactionStartFactory, RootTransactionStart, RootTransactionStartFactory, TransactionContext, TransactionExecution},
};
use std::{sync::{Arc, Mutex, atomic::{AtomicUsize, Ordering}}, time::Duration};
use tonic::{Code, Request, Response, Status};
use uuid::Uuid;
mod proxy;
mod tcp_cut;
mod empty_root;
#[path = "coordinated_recovery.rs"]
mod coordinated_recovery;
const ACCOUNT: &str = "bank.v1.Account";
const BANK: &str = "bank.v1.Bank";
const OPEN: &str = "bank.v1.AccountMethods.Open";
const DEADLINE: Duration = Duration::from_secs(15);
async fn bounded<T>(f: impl std::future::Future<Output = T>) -> T {
    tokio::time::timeout(DEADLINE, f).await.expect("fixture operation exceeded deadline; not native acceptance")
}
#[derive(Clone, Copy, Debug, PartialEq)]
enum Case { Commit, DefaultCommit, Abort, Existing, ExistingEmpty, Taskful, WrongTicket, Refused, NoOptIn, HeldPrepare, LostPrepare, EmptyCommit, EmptyAbort, EmptyDenied, EmptyNoOwner }
#[derive(Clone, Debug)]
struct Event { method: &'static str, request: Vec<u8>, response: Option<Vec<u8>>, code: Option<Code> }
struct Observations {
    events: Mutex<Vec<Event>>,
    hooks: AtomicUsize,
    root_hooks: AtomicUsize,
    verifies: AtomicUsize,
    authorizations: Mutex<Vec<Option<Vec<u8>>>>,
    root_identity: Mutex<Option<Uuid>>,
    child_identity: Mutex<Option<Uuid>>,
    watch_requests: Mutex<Vec<db::WatchRequest>>,
    watch_calls: AtomicUsize,
    watch_results: Mutex<Vec<Result<db::WatchResponse, Code>>>,
    task_intents: Mutex<Vec<db::Task>>,
    child_return: tokio::sync::Semaphore,
    parent_continue: tokio::sync::Semaphore,
    native_prepare_ack: tokio::sync::Semaphore,
    forward_prepare_ack: tokio::sync::Semaphore,
    case: Case,
    child_ref: String,
    child_receiver: Mutex<Option<Arc<dyn b::account_methods_server::AccountMethods + Send + Sync>>>,
}
impl Observations {
    fn new(case: Case, child_ref: String) -> Self {
        Self { events: Mutex::new(vec![]), hooks: AtomicUsize::new(0), root_hooks: AtomicUsize::new(0), verifies: AtomicUsize::new(0), authorizations: Mutex::new(vec![]), root_identity: Mutex::new(None), child_identity: Mutex::new(None), watch_requests: Mutex::new(vec![]), watch_calls: AtomicUsize::new(0), watch_results: Mutex::new(vec![]), task_intents: Mutex::new(vec![]), child_return: tokio::sync::Semaphore::new(0), parent_continue: tokio::sync::Semaphore::new(0), native_prepare_ack: tokio::sync::Semaphore::new(0), forward_prepare_ack: tokio::sync::Semaphore::new(0), case, child_ref, child_receiver: Mutex::new(None) }
    }
    fn events(&self) -> Vec<Event> { self.events.lock().unwrap().clone() }
    fn record<Q: Message, S: Message>(&self, method: &'static str, request: &Q, result: &Result<Response<S>, Status>) {
        self.events.lock().unwrap().push(Event { method, request: request.encode_to_vec(), response: result.as_ref().ok().map(|r| r.get_ref().encode_to_vec()), code: result.as_ref().err().map(Status::code) });
    }
    fn record_stream<Q: Message, S>(&self, method: &'static str, request: &Q, result: &Result<Response<S>, Status>) {
        self.events.lock().unwrap().push(Event { method, request: request.encode_to_vec(), response: None, code: result.as_ref().err().map(Status::code) });
    }
}
struct Policy(Arc<Observations>);
impl reboot::auth::TokenVerifier for Policy {
    fn verify<'a>(&'a self, context: &'a reboot::auth::AuthorizationContext, _: Option<&'a str>) -> reboot::auth::VerifyFuture<'a> {
        Box::pin(async move {
            assert_eq!(context.method, OPEN);
            self.0.verifies.fetch_add(1, Ordering::SeqCst);
            reboot::auth::TokenVerification::NoOpinion
        })
    }
}
impl reboot::auth::Authorizer for Policy {
    fn authorize<'a>(&'a self, context: &'a reboot::auth::AuthorizationContext, _: Option<&'a reboot::auth::Auth>, state: Option<&'a [u8]>, _: &'a [u8]) -> reboot::auth::AuthorizeFuture<'a> {
        Box::pin(async move {
            assert_eq!(context.method, OPEN);
            self.0.authorizations.lock().unwrap().push(state.map(<[u8]>::to_vec));
            if self.0.case == Case::Refused {
                reboot::auth::AuthorizationDecision::PermissionDenied { message: "fixture constructor policy denies".into() }
            } else { reboot::auth::AuthorizationDecision::Allow }
        })
    }
}
struct Watch { inner: TonicCoordinatorWatchEndpoint, observations: Arc<Observations> }
impl CoordinatorWatchEndpoint for Watch {
    fn watch(&self, request: db::WatchRequest) -> CoordinatorWatchFuture<'_, db::WatchResponse> {
        Box::pin(async move {
            self.observations.watch_requests.lock().unwrap().push(request.clone());
            self.observations.watch_calls.fetch_add(1, Ordering::SeqCst);
            let result = self.inner.watch(request).await;
            self.observations.watch_results.lock().unwrap().push(result.as_ref().cloned().map_err(|s| s.code()));
            result
        })
    }
}
struct Starts { timestamp: prost_types::Timestamp }
impl RootTransactionStartFactory for Starts {
    fn next_root_transaction(&self) -> Result<RootTransactionStart, Status> {
        Ok(RootTransactionStart { transaction_id: Uuid::new_v4(), timestamp: self.timestamp })
    }
}
impl InboundTransactionStartFactory for Starts {
    fn next_inbound_transaction(&self, _: &InboundTransactionContext) -> Result<Uuid, Status> { Ok(Uuid::new_v4()) }
}
struct LocalOnly(String);
#[tonic::async_trait]
impl reboot::runtime::TransactionalChannelResolver for LocalOnly {
    fn transactional_route(&self, state: &str, target: &str, method: &str) -> Result<reboot::runtime::TransactionalRoute, Status> {
        assert_eq!(state, ACCOUNT); assert_eq!(target, self.0); assert_eq!(method, OPEN);
        Ok(reboot::runtime::TransactionalRoute::RegisteredSameHost)
    }
    async fn resolve(&self, _: &str, _: &str) -> Result<tonic::transport::Channel, Status> { panic!("registered nested Open must not use remote fallback") }
}
struct ChildHandler(Arc<Observations>);
#[tonic::async_trait]
impl ag::AccountMethodsTransactionHandler for ChildHandler {
    async fn open(&self, _: &mut b::Account, _: b::OpenRequest) -> Result<b::OpenResponse, Status> { panic!("child must not take standalone Open hook") }
    async fn open_constructor_child(&self, context: &TransactionContext, state: &mut b::Account, request: b::OpenRequest) -> Result<TransactionExecution<b::OpenResponse>, Status> {
        self.0.hooks.fetch_add(1, Ordering::SeqCst);
        assert_eq!(context.transaction_ids().len(), 2);
        let root_id = self.0.root_identity.lock().unwrap().expect("parent observed actual root before nested Open");
        assert_eq!(context.transaction_ids()[0], root_id);
        assert_ne!(context.transaction_ids()[1], root_id, "nested child UUID must be distinct from root");
        *self.0.child_identity.lock().unwrap() = Some(context.transaction_ids()[1]);
        assert_eq!(context.transaction_coordinator_state_type(), BANK);
        assert_eq!(context.headers().state_ref, self.0.child_ref);
        assert_eq!(*state, b::Account::default(), "default state is initialized only after genuine absent admission");
        state.customer_name = request.customer_name;
        // Original wire response SHAPE, deliberately no scheduled-task success.
        let mut execution = TransactionExecution::new(b::OpenResponse { welcome_email_task_id: None });
        if self.0.case == Case::Taskful {
            // Genuine generated task intent, used only to assert taskless refusal.
            // No arbitrary TaskId or task success is fabricated or returned.
            let intent = ag::AccountMethodsTasks::welcome_email(&context.headers().state_ref, &b::WelcomeEmailRequest {});
            self.0.task_intents.lock().unwrap().push(intent.clone());
            execution.task_upserts.push(intent);
        }
        Ok(execution)
    }
    async fn balance(&self, state: &b::Account, _: b::BalanceRequest) -> Result<b::BalanceResponse, Status> { Ok(b::BalanceResponse { balance: state.balance }) }
    async fn deposit(&self, _: &mut b::Account, _: b::DepositRequest) -> Result<b::DepositResponse, Status> { Err(Status::unimplemented("outside fixture vertical")) }
    async fn withdraw(&self, _: &mut b::Account, _: b::WithdrawRequest) -> Result<b::WithdrawResponse, ag::AccountMethodsWithdrawError> { Err(ag::AccountMethodsWithdrawError::Grpc(Status::unimplemented("outside fixture vertical"))) }
    async fn welcome_email(&self, _: &mut b::Account, _: b::WelcomeEmailRequest) -> Result<b::WelcomeEmailResponse, Status> { panic!("taskless fixture must not dispatch WelcomeEmail") }
}
struct ParentHandler { observations: Arc<Observations>, child_id: String }
#[tonic::async_trait]
impl bg::BankMethodsTransactionHandler for ParentHandler {
    async fn sign_up(&self, context: &TransactionContext, state: &mut b::Bank, request: b::SignUpRequest) -> Result<TransactionExecution<b::SignUpResponse>, Status> {
        self.observations.root_hooks.fetch_add(1, Ordering::SeqCst);
        context.require_registered_outbound()?;
        assert_eq!(context.transaction_ids().len(), 1);
        *self.observations.root_identity.lock().unwrap() = Some(context.transaction_ids()[0]);
        if empty_root::is_empty(self.observations.case) {
            assert_eq!(*state, b::Bank::default(), "genuine absent registered Bank starts at default");
        } else {
            assert_eq!(state.account_ids, vec!["fixture-configured-existing-root".to_string()]);
        }
        if self.observations.case == Case::WrongTicket { return wrong_ticket(context, &self.observations).await.map_err(|status| *status); }
        let client = ag::AccountMethodsClient::new(LocalOnly(self.observations.child_ref.clone()));
        let target = ag::AccountMethodsTarget::new(&self.observations.child_ref);
        let returned = client.open(context, &target, b::OpenRequest { customer_name: request.customer_name }).await?;
        assert!(returned.response().get_ref().welcome_email_task_id.is_none(), "response shape is not task scheduling success");
        let members = context.returned_participants_snapshot();
        assert_eq!(members.len(), 1); assert_eq!(members[0].target.state_type, ACCOUNT); assert_eq!(members[0].target.state_ref, self.observations.child_ref); assert!(!members[0].read_only, "default-byte constructor remains writable");
        self.observations.child_return.add_permits(1);
        self.observations.parent_continue.acquire().await.unwrap().forget();
        if matches!(self.observations.case, Case::Abort | Case::EmptyAbort) { return Err(Status::aborted("fixture root abort after actual child return")); }
        state.account_ids.push(self.child_id.clone());
        Ok(TransactionExecution::new(b::SignUpResponse { account_id: self.child_id.clone() }))
    }
    async fn transfer(&self, _: &TransactionContext, _: &mut b::Bank, _: b::TransferRequest) -> Result<TransactionExecution<b::TransferResponse>, Status> { Err(Status::unimplemented("not full Bank Transfer")) }
    async fn transfer_fresh_shared(&self, _: &reboot::runtime::SharedLocalTransactionContext, _: &mut b::Bank, _: b::TransferRequest) -> Result<b::TransferResponse, Status> { Err(Status::unimplemented("not full Bank Transfer")) }
}
async fn wrong_ticket(context: &TransactionContext, observations: &Observations) -> Result<TransactionExecution<b::SignUpResponse>, Box<Status>> {
    let target = reboot::durable_coordinator::ParticipantTarget { state_type: ACCOUNT.into(), state_ref: observations.child_ref.clone() };
    let scope = context.begin_generated_outbound_for(ACCOUNT, &target.state_ref, OPEN)?;
    let destination = context.lookup_registered_local_destination(&target, OPEN)?;
    let body = b::OpenRequest { customer_name: "exact-ticket-body".into() };
    let ticket = context.issue_registered_local_ticket(&scope, &destination, OPEN, &body)?;
    let receiver = observations.child_receiver.lock().unwrap().as_ref().unwrap().clone();
    let mut headers = reboot::RebootHeaders::new(&target.state_ref);
    headers.server_id = context.headers().server_id.clone();
    headers.transaction_ids = Some(context.transaction_ids().to_vec());
    headers.transaction_coordinator_state_type = Some(context.transaction_coordinator_state_type().into());
    headers.transaction_coordinator_state_ref = Some(context.transaction_coordinator_state_ref().into());
    headers.coordinator_read_only_aware = context.headers().coordinator_read_only_aware;
    headers.traceparent = context.headers().traceparent.clone(); headers.tracestate = context.headers().tracestate.clone();
    let make = |name: &str| { let mut request = Request::new(b::OpenRequest { customer_name: name.into() }); *request.metadata_mut() = headers.to_metadata().unwrap(); request.extensions_mut().insert(ticket.clone()); request };
    let before = observations.events().len();
    assert_eq!(receiver.open(make("different-request")).await.unwrap_err().code(), Code::FailedPrecondition);
    let replay = receiver.open(make("exact-ticket-body")).await.unwrap_err();
    assert_eq!(replay.code(), Code::FailedPrecondition); assert_eq!(replay.message(), "local ticket already consumed");
    assert_eq!(observations.events().len(), before, "incorrect ticket must reject before Database IO");
    assert_eq!(observations.hooks.load(Ordering::SeqCst), 0);
    drop(scope); // The genuine unsettled outbound probe dooms this root; never fake settle.
    Err(Box::new(Status::aborted("incorrect request binding and alias burn asserted; root abort required")))
}
fn request<T>(reference: &str, body: T) -> Request<T> {
    let mut r = Request::new(body); *r.metadata_mut() = reboot::RebootHeaders::new(reference).to_metadata().unwrap(); r.set_timeout(DEADLINE); r
}
fn state_ref(ty: &str, id: &str) -> String { reboot::state_ref::StateRef::from_id(ty, id).unwrap().to_string() }
fn prerequisites() -> (String, String) {
    assert_eq!(std::env::var("REBOOT_CONSTRUCTOR_NATIVE_AUTHORITY").as_deref(), Ok("parent-owned-private-pristine-single-shard"), "parent must really own private native namespace/custodian; declaration alone is not evidence");
    for (key, _) in std::env::vars_os() { assert!(!key.to_string_lossy().starts_with("REBOOT_TEST_"), "production test hooks forbidden: {key:?}"); }
    let endpoint = std::env::var("REBOOT_CONSTRUCTOR_NATIVE_DATABASE_ENDPOINT").expect("explicit canonical DatabaseGrpcSidecar endpoint required; no default");
    let run = std::env::var("REBOOT_CONSTRUCTOR_NATIVE_RUN").expect("parent source/native/process correlation run required");
    assert!(!run.is_empty() && run.chars().all(|c| c.is_ascii_alphanumeric() || c == '-'), "run must be a nonempty identifier");
    assert!(endpoint.starts_with("http://127.0.0.1:"), "only task-owned private loopback authority allowed");
    (endpoint, run)
}
async fn load(client: &mut db::database_client::DatabaseClient<tonic::transport::Channel>, ty: &str, reference: &str) -> Option<Vec<u8>> {
    let r = bounded(client.load(db::LoadRequest { actors: vec![db::Actor { state_type: ty.into(), state_ref: reference.into(), state: None }], task_ids: vec![] })).await.unwrap().into_inner();
    assert!(r.tasks.is_empty()); assert!(r.actors.len() <= 1);
    r.actors.into_iter().next().map(|actor| { assert_eq!(actor.state_type, ty); assert_eq!(actor.state_ref, reference); actor.state.expect("canonical returned actor must have present bytes") })
}
async fn recover(client: &mut db::database_client::DatabaseClient<tonic::transport::Channel>) -> Vec<db::RecoverResponse> {
    let mut stream = bounded(client.recover(db::RecoverRequest { state_tags_by_state_type: [(ACCOUNT.into(), "Account".into()), (BANK.into(), "Bank".into())].into(), shard_ids: vec!["s000000000".into()], skip_idempotent_mutations: false })).await.unwrap().into_inner();
    let mut records = vec![]; while let Some(batch) = bounded(stream.message()).await.unwrap() { records.push(batch); } records
}
// Check actual protobuf UUID bytes against identities observed in generated hooks,
// not just request/Recover equality (which could agree on the same wrong root).
fn assert_child_transaction_ids(observations: &Observations, ids: &[Vec<u8>]) {
    assert_eq!(ids.len(), 2);
    assert!(ids.iter().all(|id| id.len() == 16), "native transaction path must contain two 16-byte UUIDs");
    let root = observations.root_identity.lock().unwrap().expect("actual root identity observed");
    let child = observations.child_identity.lock().unwrap().expect("actual nested child identity observed");
    assert_eq!(ids[0].as_slice(), root.as_bytes().as_slice(), "first native ID must be the exact observed root");
    assert_ne!(ids[1], ids[0], "native child ID must be distinct from root");
    assert_eq!(Uuid::from_slice(&ids[1]).unwrap(), child, "native child ID must match the actual admitted child");
}
async fn assert_no_inventory(client: &mut db::database_client::DatabaseClient<tonic::transport::Channel>) {
    for batch in recover(client).await { assert!(batch.pending_tasks.is_empty() && batch.idempotent_mutations.is_empty() && batch.participant_transactions.is_empty() && batch.transaction_coordinators.is_empty(), "pristine taskless control inventory expected: {batch:?}"); }
}
struct ProxyGuard {
    stop: Option<tokio::sync::oneshot::Sender<()>>,
    server: tokio::task::JoinHandle<Result<(), tonic::transport::Error>>,
}
impl Drop for ProxyGuard {
    fn drop(&mut self) {
        if let Some(stop) = self.stop.take() { let _ = stop.send(()); }
        self.server.abort(); // Panic-only cleanup, not successful shutdown evidence.
    }
}
// Clones share the exact original PendingRegistry/ActorGate allocations. Keeping
// the store, a weak directory entry, or a newly constructed participant is not custody.
struct OriginalParticipants {
    root: DurableActorParticipant<TonicParticipantSidecar>,
    child: DurableActorParticipant<TonicParticipantSidecar>,
}
enum ParticipantCustody {
    Retirable(Option<Box<OriginalParticipants>>),
    // Deliberate process-lifetime allocation, never freed by host/runtime teardown.
    // Only the isolated LostPrepare process may use this disposition. It does not
    // settle native ownership or authorize reuse of the serving authority.
    UntilProcessExit(&'static OriginalParticipants),
}
impl ParticipantCustody {
    fn original(&self) -> &OriginalParticipants {
        match self {
            Self::Retirable(original) => original.as_deref().expect("original custody not retired yet"),
            Self::UntilProcessExit(original) => original,
        }
    }
    fn retire_after_acknowledged_shutdown(&mut self) {
        match self {
            Self::Retirable(original) => drop(original.take().expect("retire originals exactly once")),
            Self::UntilProcessExit(_) => panic!("unresolved process-lifetime custody cannot retire"),
        }
    }
}
impl Drop for ParticipantCustody {
    fn drop(&mut self) {
        // Any early exit/panic in a nominally healthy case is NOT acknowledged
        // retirement. Fail closed: preserve its exact originals too until exit.
        let Self::Retirable(original) = self else { return; };
        if let Some(original) = original.take() { let _ = Box::leak(original); }
    }
}
struct Hosted {
    endpoint: String,
    store: DatabaseActorStore,
    participants: ParticipantCustody,
    explicit_abort_owner: reboot::explicit_abort::ExplicitAbortOwner,
    live_participant_owner: reboot::live_participant::LiveParticipantOwner,
    observations: Arc<Observations>,
    stop: Option<tokio::sync::oneshot::Sender<()>>,
    server: tokio::task::JoinHandle<Result<(), reboot::application_host::ApplicationHostError>>,
    proxy: ProxyGuard,
    tcp_cut: Option<tcp_cut::TcpCut>,
}
impl Drop for Hosted {
    fn drop(&mut self) {
        if let Some(stop) = self.stop.take() { let _ = stop.send(()); }
        // ProxyGuard also owns startup/panic cleanup before Hosted construction.
        // Panic cleanup only, never evidence of joined/normal shutdown.
        self.server.abort();
    }
}
impl Hosted {
    async fn start(canonical: &str, root_ref: &str, child_ref: &str, child_id: &str, observations: Arc<Observations>) -> Self {
        let proxy = proxy::ObservedDatabase { client: bounded(db::database_client::DatabaseClient::connect(canonical.to_owned())).await.unwrap(), observations: observations.clone() };
        let proxy_listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let proxy_endpoint = format!("http://{}", proxy_listener.local_addr().unwrap());
        let (proxy_stop, proxy_stopped) = tokio::sync::oneshot::channel();
        let proxy_server = tokio::spawn(async move { tonic::transport::Server::builder().add_service(db::database_server::DatabaseServer::new(proxy)).serve_with_incoming_shutdown(tokio_stream::wrappers::TcpListenerStream::new(proxy_listener), async { let _ = proxy_stopped.await; }).await });
        let proxy = ProxyGuard { stop: Some(proxy_stop), server: proxy_server };
        let tcp_cut = if observations.case == Case::LostPrepare { Some(tcp_cut::TcpCut::start(proxy_endpoint.clone()).await) } else { None };
        let database_endpoint = tcp_cut.as_ref().map(|relay| relay.endpoint.as_str()).unwrap_or(&proxy_endpoint);
        let store = bounded(DatabaseActorStore::connect(database_endpoint)).await.unwrap();
        let sidecar = Arc::new(bounded(TonicParticipantSidecar::connect(database_endpoint)).await.unwrap());
        let root = DurableActorParticipant::new(sidecar.clone(), BANK, root_ref).with_database_actor_gate(&store);
        let child = DurableActorParticipant::new(sidecar, ACCOUNT, child_ref).with_database_actor_gate(&store);
        // Capture originals before adapters/recovery take clones. LostPrepare's
        // box is intentionally leaked NOW, so even panic or runtime destruction
        // cannot drop its original pending registry and retained lease.
        let original = Box::new(OriginalParticipants { root: root.clone(), child: child.clone() });
        let participants = if observations.case == Case::LostPrepare {
            ParticipantCustody::UntilProcessExit(Box::leak(original))
        } else {
            ParticipantCustody::Retirable(Some(original))
        };
        let resolver = Arc::new(ExactParticipantResolver::new([
            (root.actor_target(), Arc::new(InProcessParticipantEndpoint::new(DurableActorParticipantHost::new(root.clone())))),
            (child.actor_target(), Arc::new(InProcessParticipantEndpoint::new(DurableActorParticipantHost::new(child.clone())))),
        ]).unwrap());
        let coordinator_sidecar = Arc::new(bounded(TonicCoordinatorSidecar::connect(database_endpoint)).await.unwrap());
        let root_coordinator = DurableRootCoordinator::new(coordinator_sidecar.clone(), resolver.clone()).with_identity(root.actor_target());
        let child_coordinator = DurableRootCoordinator::new(coordinator_sidecar, resolver).with_identity(child.actor_target());
        let mut native = bounded(db::database_client::DatabaseClient::connect(canonical.to_owned())).await.unwrap();
        let timestamp = bounded(native.refresh_timestamp(db::RefreshTimestampRequest {})).await.unwrap().into_inner().timestamp.expect("use actual canonical clock, not fabricated timestamp");
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let endpoint = format!("http://{}", listener.local_addr().unwrap());
        let watch = Arc::new(Watch { inner: TonicCoordinatorWatchEndpoint::lazy(endpoint.clone()).unwrap(), observations: observations.clone() });
        let explicit_abort_owner = reboot::explicit_abort::ExplicitAbortOwner::new(2).unwrap();
        let live_participant_owner = reboot::live_participant::LiveParticipantOwner::new(2, root.actor_target(), watch.clone()).unwrap();
        let parent_adapter = bg::BankMethodsTransactionAdapter::new(root.clone(), root_coordinator, Starts { timestamp }, ParentHandler { observations: observations.clone(), child_id: child_id.into() })
            .with_authorization(if observations.case == Case::EmptyDenied {
                reboot::auth::AuthorizationPolicy::new(None, Some(Arc::new(empty_root::DenyRoot)))
            } else { reboot::auth::AuthorizationPolicy::permissive_for_development() }).with_sequential_root_star();
        let parent_adapter = if observations.case == Case::EmptyNoOwner { parent_adapter } else { parent_adapter.with_explicit_abort_owner(explicit_abort_owner.clone()) };
        let policy = Arc::new(Policy(observations.clone()));
        let child_adapter = ag::AccountMethodsTransactionAdapter::new(store.clone(), child.clone(), child_coordinator, Starts { timestamp }, ChildHandler(observations.clone()))
            .with_authorization(reboot::auth::AuthorizationPolicy::new(Some(policy.clone()), Some(policy)))
            .with_sequential_root_star()
            .with_live_participant_owner(live_participant_owner.clone());
        let child_adapter = if observations.case == Case::NoOptIn { child_adapter } else { child_adapter.with_taskless_constructor_children() };
        let mut host = ApplicationHost::new("registered-constructor-child-native-prerequisite");
        let (parent_adapter, _) = host.register_local_transaction_service(parent_adapter).unwrap();
        let (child_adapter, _) = host.register_local_transaction_service(child_adapter).unwrap();
        *observations.child_receiver.lock().unwrap() = Some(Arc::new(child_adapter.clone()));
        let recovery = parent_adapter.legacy_recovery_registration(LegacyRecoveryMetadata {
            participant: ParticipantRecovery { state_tags_by_state_type: [(BANK.into(), "Bank".into())].into(), shard_ids: vec!["s000000000".into()] },
            coordinator: CoordinatorRecovery { state_tags_by_state_type: [(BANK.into(), "Bank".into())].into(), shard_ids: vec!["s000000000".into()], coordinator_state_ref: root_ref.into() },
        }, watch).unwrap().with_participant(child, ParticipantRecovery { state_tags_by_state_type: [(ACCOUNT.into(), "Account".into())].into(), shard_ids: vec!["s000000000".into()] }).unwrap();
        let control = parent_adapter.legacy_coordinator_control_service(BANK, root_ref).unwrap();
        let host = host.with_host_recovery(recovery);
        let host = if observations.case == Case::EmptyNoOwner { host } else { host.with_host_recovery(parent_adapter.explicit_abort_recovery_registration().unwrap()) };
        let host = host.with_host_recovery(child_adapter.live_participant_recovery_registration().unwrap())
            .add_legacy_control_service(control)
            .add_public_service(b::bank_methods_server::BankMethodsServer::new(parent_adapter.clone()))
            .add_public_service(b::account_methods_server::AccountMethodsServer::new(child_adapter));
        let (stop, stopped) = tokio::sync::oneshot::channel();
        let server = tokio::spawn(host.serve_with_listener_shutdown(listener, async { let _ = stopped.await; }));
        let hosted = Self { endpoint, store, participants, explicit_abort_owner, live_participant_owner, observations, stop: Some(stop), server, proxy, tcp_cut };
        bounded(async { while parent_adapter.require_local_host_ready().is_err() { assert!(!hosted.server.is_finished(), "host failed before readiness"); tokio::task::yield_now().await; } }).await;
        hosted
    }
    async fn retained(&self) {
        let original = self.participants.original();
        assert_eq!(original.root.actor_target().state_type, BANK);
        assert_eq!(original.child.actor_target().state_ref, self.observations.child_ref);
        let gate = self.store.actor_gate(ACCOUNT, &self.observations.child_ref);
        // Shared FIRST, so the queued exclusive probe cannot create false exclusion.
        assert!(tokio::time::timeout(Duration::from_millis(100), gate.shared()).await.is_err(), "child return must retain the real exclusive actor gate");
        assert!(tokio::time::timeout(Duration::from_millis(100), gate.exclusive()).await.is_err());
    }
    async fn released(&self) {
        let gate = self.store.actor_gate(ACCOUNT, &self.observations.child_ref);
        drop(bounded(gate.exclusive()).await);
    }
    async fn finish(mut self) {
        assert_ne!(self.observations.case, Case::LostPrepare, "unresolved case must fail host shutdown, never observe healthy idle");
        // The only generated SignUp producer has been awaited/joined in run;
        // the optional forged Open producer and final direct Watch have returned.
        // Remove the remaining direct-adapter alias; this private fixture admits
        // no other producers. Do not send shutdown until ACTUAL owners retire.
        *self.observations.child_receiver.lock().unwrap() = None;
        bounded(self.explicit_abort_owner.wait_for_idle_for_test(DEADLINE)).await
            .expect("exact explicit Abort owner must retire before healthy shutdown");
        bounded(self.live_participant_owner.wait_for_idle_for_test(DEADLINE)).await
            .expect("exact live participant owner must retire before healthy shutdown");
        self.stop.take().unwrap().send(()).unwrap();
        bounded(&mut self.server).await.unwrap().unwrap();
        self.proxy.stop.take().unwrap().send(()).unwrap();
        bounded(&mut self.proxy.server).await.unwrap().unwrap();
        // Retirable custody drops only after acknowledged outcomes, exact owner
        // retirement, and joined healthy host/proxy shutdown. No new lease here.
        self.participants.retire_after_acknowledged_shutdown();
    }
}
async fn run(case: Case) {
    let (canonical, run) = prerequisites();
    let child_id = format!("constructor-{run}-{case:?}");
    let child_ref = state_ref(ACCOUNT, &child_id);
    let root_ref = state_ref(BANK, &format!("bank-{run}-{case:?}"));
    let mut direct = bounded(db::database_client::DatabaseClient::connect(canonical.clone())).await.unwrap();
    assert_no_inventory(&mut direct).await;
    assert!(load(&mut direct, BANK, &root_ref).await.is_none()); assert!(load(&mut direct, ACCOUNT, &child_ref).await.is_none());
    let configured = b::Bank { account_ids: vec!["fixture-configured-existing-root".into()] };
    let existing = if case == Case::ExistingEmpty { b::Account::default() } else { b::Account { customer_name: "already-existing".into(), balance: 19 } };
    let mut actors = vec![db::Actor { state_type: BANK.into(), state_ref: root_ref.clone(), state: Some(configured.encode_to_vec()) }];
    if matches!(case, Case::Existing | Case::ExistingEmpty) { actors.push(db::Actor { state_type: ACCOUNT.into(), state_ref: child_ref.clone(), state: Some(existing.encode_to_vec()) }); }
    // Genuine canonical RPC fixture configuration. NOT public original Bank creation.
    bounded(direct.store(db::StoreRequest { actor_upserts: actors.clone(), task_upserts: vec![], colocated_upserts: vec![], transaction: None, idempotent_mutation: None, ensure_state_types_created: vec![], sync: true })).await.unwrap();
    for actor in &actors { assert_eq!(load(&mut direct, &actor.state_type, &actor.state_ref).await, actor.state); }
    let observations = Arc::new(Observations::new(case, child_ref.clone()));
    let mut hosted = Hosted::start(&canonical, &root_ref, &child_ref, &child_id, observations.clone()).await;
    if case == Case::NoOptIn {
        // Wire transaction metadata is never a ticket, even at a trusted local service.
        let mut account = bounded(b::account_methods_client::AccountMethodsClient::connect(hosted.endpoint.clone())).await.unwrap();
        let before = observations.events().len();
        let mut forged = request(&child_ref, b::OpenRequest { customer_name: "forged".into() });
        let mut headers = reboot::RebootHeaders::new(&child_ref);
        headers.transaction_ids = Some(vec![Uuid::new_v4()]);
        headers.transaction_coordinator_state_type = Some(BANK.into());
        headers.transaction_coordinator_state_ref = Some(root_ref.clone());
        *forged.metadata_mut() = headers.to_metadata().unwrap();
        let refusal = bounded(account.open(forged)).await.unwrap_err();
        assert_eq!(refusal.code(), Code::FailedPrecondition);
        assert_eq!(refusal.message(), "constructor child requires registered local ticket");
        assert_eq!(observations.events().len(), before, "wire-only constructor rejection must precede canonical IO");
    }
    let mut public = bounded(b::bank_methods_client::BankMethodsClient::connect(hosted.endpoint.clone())).await.unwrap();
    let name = if case == Case::DefaultCommit { "" } else { "Taskless fixture customer" };
    let outgoing = request(&root_ref, b::SignUpRequest { customer_name: name.into() });
    let mut call = tokio::spawn(async move { public.sign_up(outgoing).await });
    if matches!(case, Case::Commit | Case::DefaultCommit | Case::Abort | Case::HeldPrepare | Case::LostPrepare) {
        bounded(async { tokio::select! { p = observations.child_return.acquire() => p.unwrap().forget(), result = &mut call => panic!("child did not return through generated nested call: {result:?}"), } }).await;
        assert!(!call.is_finished(), "parent must be parked after actual child return");
        hosted.retained().await;
        assert!(load(&mut direct, ACCOUNT, &child_ref).await.is_none(), "nested response is not actor visibility");
        assert_eq!(load(&mut direct, BANK, &root_ref).await, Some(configured.encode_to_vec()));
        assert!(!observations.events().iter().any(|e| e.method == "TransactionParticipantPrepare" || e.method == "CreateActor" || e.method == "CreateActorWithTasks" || e.method == "Store"), "child may not independently write before root outcome");
        bounded(async { while observations.watch_calls.load(Ordering::SeqCst) == 0 { tokio::task::yield_now().await; } }).await;
        assert!(!observations.watch_results.lock().unwrap().iter().any(Result::is_ok), "actual root Watch cannot report a terminal success before root outcome; genuine nondefinitive Unavailable retries are allowed");
        observations.parent_continue.add_permits(1);
        if matches!(case, Case::HeldPrepare | Case::LostPrepare) {
            bounded(async { tokio::select! { p = observations.native_prepare_ack.acquire() => p.unwrap().forget(), result = &mut call => panic!("root returned before held canonical child Prepare ACK: {result:?}"), } }).await;
            assert!(!call.is_finished()); hosted.retained().await;
            assert!(load(&mut direct, ACCOUNT, &child_ref).await.is_none());
            let prepared: Vec<_> = recover(&mut direct).await.into_iter().flat_map(|b| b.participant_transactions).filter(|t| t.state_ref == child_ref).collect();
            assert_eq!(prepared.len(), 1); assert!(prepared[0].prepared); assert_eq!(prepared[0].state_type, ACCOUNT); assert_eq!(prepared[0].coordinator_state_type, BANK); assert_eq!(prepared[0].coordinator_state_ref, root_ref);
            assert_child_transaction_ids(&observations, &prepared[0].transaction_ids);
            let acked: Vec<_> = observations.events().into_iter().filter(|e| e.method == "TransactionParticipantPrepare")
                .filter_map(|e| { let request = db::TransactionParticipantPrepareRequest::decode(e.request.as_slice()).unwrap(); if request.state_ref == child_ref { Some((request, e)) } else { None } }).collect();
            assert_eq!(acked.len(), 1); assert_eq!(acked[0].1.code, None); assert!(acked[0].1.response.is_some());
            assert_eq!(acked[0].0.state, Some(b::Account { customer_name: name.into(), balance: 0 }.encode_to_vec()));
            assert!(acked[0].0.task_upserts.is_empty() && acked[0].0.idempotent_mutations.is_empty());
            let transaction = acked[0].0.transaction.as_ref().unwrap();
            assert_child_transaction_ids(&observations, &transaction.transaction_ids);
            assert_eq!(transaction.coordinator_state_type, BANK);
            assert_eq!(transaction.coordinator_state_ref, root_ref);
            assert_eq!(transaction.transaction_ids, prepared[0].transaction_ids);
            if case == Case::LostPrepare {
                hosted.tcp_cut.as_mut().unwrap().cut_and_join().await;
                // This releases only the held ACTUAL response into now-closed TCP.
                // No synthetic success/error or native terminal control is substituted.
                observations.forward_prepare_ack.add_permits(1);
                let error = bounded(call).await.unwrap().unwrap_err();
                // Tonic can expose a closed transport through either Unavailable
                // or Unknown with its exact transport diagnostic. Neither is a
                // native outcome; all uncertainty/ownership checks below remain.
                assert!(error.code() == Code::Unavailable
                    || (error.code() == Code::Unknown && error.message() == "transport error"),
                    "actual TCP-loss diagnostic: {error:?}");
                hosted.retained().await;
                assert!(load(&mut direct, ACCOUNT, &child_ref).await.is_none());
                let retained: Vec<_> = recover(&mut direct).await.into_iter().flat_map(|b| b.participant_transactions).filter(|t| t.state_ref == child_ref).collect();
                assert_eq!(retained, prepared, "real prepared constructor must survive sidecar ACK transport loss");
                *observations.child_receiver.lock().unwrap() = None;
                // Request genuine host shutdown: unresolved real Watch/participant work
                // must fail shutdown rather than wait forever or claim a graceful drain.
                let _ = hosted.stop.take().unwrap().send(());
                let failed = bounded(&mut hosted.server).await.unwrap();
                assert!(matches!(&failed,
                    Err(reboot::application_host::ApplicationHostError::RecoveryTask(status) | reboot::application_host::ApplicationHostError::ParticipantCleanup(status)) if status.code() == Code::Unavailable)
                    || matches!(&failed, Err(reboot::application_host::ApplicationHostError::Lifecycle { phase: reboot::application_host::ApplicationLifecyclePhase::Shutdown, source, .. }) if source.code() == Code::Unavailable),
                    "uncertainty must fail genuine shutdown, never normal host completion: {failed:?}");
                hosted.retained().await;
                assert!(matches!(&hosted.participants, ParticipantCustody::UntilProcessExit(_)), "failed host must retain process-lifetime originals, not retirable custody");
                let after_failed_host: Vec<_> = recover(&mut direct).await.into_iter().flat_map(|b| b.participant_transactions).filter(|t| t.state_ref == child_ref).collect();
                assert_eq!(after_failed_host, prepared, "canonical unresolved Prepare must survive actual failed host destruction too");
                assert_eq!(load(&mut direct, BANK, &root_ref).await, Some(configured.encode_to_vec()));
                assert_eq!(observations.hooks.load(Ordering::SeqCst), 1);
                assert_eq!(observations.verifies.load(Ordering::SeqCst), 1);
                assert_eq!(*observations.authorizations.lock().unwrap(), vec![None]);
                assert!(!observations.events().iter().any(|e| {
                    (e.method == "TransactionParticipantCommit" && db::TransactionParticipantCommitRequest::decode(e.request.as_slice()).unwrap().state_ref == child_ref)
                    || (e.method == "TransactionParticipantAbort" && db::TransactionParticipantAbortRequest::decode(e.request.as_slice()).unwrap().state_ref == child_ref)
                }), "uncertain constructor may not synthesize actor-only Commit/Abort after TCP loss");
                hosted.proxy.stop.take().unwrap().send(()).unwrap();
                bounded(&mut hosted.proxy.server).await.unwrap().unwrap();
                println!("CONSTRUCTOR_PREPARE_TCP_LOSS actual_native_ack=true actual_tcp_cut=true canonical_prepared_retained=true original_gate_retained=true host_failed=true PROCESS_EXIT_REQUIRED_NOT_NORMAL_SHUTDOWN");
                return;
            }
            observations.forward_prepare_ack.add_permits(1); // Forward only the actual canonical response.
        }
    }
    let result = bounded(call).await.unwrap();
    let commits = matches!(case, Case::Commit | Case::DefaultCommit | Case::HeldPrepare);
    if commits { assert_eq!(result.unwrap().into_inner().account_id, child_id); }
    else {
        let error = result.unwrap_err();
        assert_eq!(error.code(), match case { Case::Refused => Code::PermissionDenied, Case::Existing | Case::ExistingEmpty => Code::AlreadyExists, Case::Abort | Case::WrongTicket => Code::Aborted, _ => Code::FailedPrecondition }, "actual refusal mapping: {error:?}");
    }
    hosted.released().await;
    let state = load(&mut direct, ACCOUNT, &child_ref).await;
    if commits { assert_eq!(state, Some(b::Account { customer_name: name.into(), balance: 0 }.encode_to_vec())); if case == Case::DefaultCommit { assert_eq!(state, Some(vec![]), "Some(empty) must be canonically committed, not reclassified as absent/read-only"); } }
    else if matches!(case, Case::Existing | Case::ExistingEmpty) { assert_eq!(state, Some(existing.encode_to_vec())); }
    else { assert!(state.is_none(), "root failure must leave constructor invisible"); }
    let mut expected_bank = configured.clone(); if commits { expected_bank.account_ids.push(child_id.clone()); }
    assert_eq!(load(&mut direct, BANK, &root_ref).await, Some(expected_bank.encode_to_vec()));
    assert_no_inventory(&mut direct).await;
    let intents = observations.task_intents.lock().unwrap().clone();
    if case == Case::Taskful {
        assert_eq!(intents.len(), 1);
        let exact = bounded(direct.load(db::LoadRequest { actors: vec![], task_ids: intents.into_iter().map(|task| task.task_id.unwrap()).collect() })).await.unwrap().into_inner();
        assert!(exact.tasks.is_empty() && exact.actors.is_empty(), "actual refused generated task ID must not exist, including completed task records");
    } else { assert!(intents.is_empty()); }
    let events = observations.events();
    assert!(!events.iter().any(|e| matches!(e.method, "CreateActor" | "CreateActorWithTasks" | "Store" | "CompleteTask")), "no standalone constructor or scheduling fallback");
    let loads: Vec<_> = events.iter().filter(|e| e.method == "Load").filter(|e| { let req = db::LoadRequest::decode(e.request.as_slice()).unwrap(); req.actors.iter().any(|a| a.state_ref == child_ref) }).collect();
    if matches!(case, Case::WrongTicket | Case::NoOptIn) { assert!(loads.is_empty()); assert_eq!(observations.verifies.load(Ordering::SeqCst), 0); }
    else {
        assert_eq!(loads.len(), 1, "constructor performs one actual optional snapshot Load");
        assert_eq!(loads[0].code, None);
        let loaded = db::LoadResponse::decode(loads[0].response.as_ref().unwrap().as_slice()).unwrap();
        if matches!(case, Case::Existing | Case::ExistingEmpty) { assert_eq!(loaded.actors.len(), 1); assert_eq!(loaded.actors[0].state, Some(existing.encode_to_vec())); }
        else { assert!(loaded.actors.is_empty() && loaded.tasks.is_empty(), "missing constructor comes from genuine canonical omission"); }
        assert_eq!(observations.verifies.load(Ordering::SeqCst), 1);
        assert_eq!(*observations.authorizations.lock().unwrap(), vec![if matches!(case, Case::Existing | Case::ExistingEmpty) { Some(existing.encode_to_vec()) } else { None }]);
    }
    assert_eq!(observations.hooks.load(Ordering::SeqCst), usize::from(!matches!(case, Case::Existing | Case::ExistingEmpty | Case::WrongTicket | Case::Refused | Case::NoOptIn)));
    let prepares: Vec<_> = events.iter().filter(|e| e.method == "TransactionParticipantPrepare").map(|e| (db::TransactionParticipantPrepareRequest::decode(e.request.as_slice()).unwrap(), e.code)).filter(|(r, _)| r.state_ref == child_ref).collect();
    if commits {
        assert_eq!(prepares.len(), 1); assert_eq!(prepares[0].1, None); assert_eq!(prepares[0].0.state, state);
        assert!(prepares[0].0.task_upserts.is_empty() && prepares[0].0.idempotent_mutations.is_empty());
        let transaction = prepares[0].0.transaction.as_ref().expect("real native constructor registration at Prepare");
        assert_child_transaction_ids(&observations, &transaction.transaction_ids); assert_eq!(transaction.coordinator_state_type, BANK); assert_eq!(transaction.coordinator_state_ref, root_ref);
        assert!(events.iter().any(|e| e.method == "TransactionParticipantCommit" && db::TransactionParticipantCommitRequest::decode(e.request.as_slice()).unwrap().state_ref == child_ref && e.code.is_none()));
    } else {
        assert!(prepares.is_empty());
        assert!(!events.iter().any(|e| e.method == "TransactionParticipantAbort" && db::TransactionParticipantAbortRequest::decode(e.request.as_slice()).unwrap().state_ref == child_ref), "pre-Prepare constructor discard must not issue rootless native actor Abort");
    }
    if matches!(case, Case::Commit | Case::DefaultCommit | Case::Abort | Case::HeldPrepare | Case::LostPrepare) {
        let root_id = observations.root_identity.lock().unwrap().unwrap();
        let requests = observations.watch_requests.lock().unwrap().clone();
        assert!(!requests.is_empty());
        assert!(requests.iter().all(|r| r.transaction_id.as_slice() == root_id.as_bytes().as_slice() && r.state_type == ACCOUNT && r.state_ref == child_ref), "live owner must Watch this actual root for this exact child");
        // Direct coordinator Commit may wake/cancel the live Watch RPC before its
        // terminal reply. Query the SAME real public root Watch service explicitly,
        // not a synthetic watcher and not an invented notification/receipt.
        let outcome = bounded(TonicCoordinatorWatchEndpoint::lazy(hosted.endpoint.clone()).unwrap().watch(db::WatchRequest {
            transaction_id: root_id.as_bytes().to_vec(), state_type: ACCOUNT.into(), state_ref: child_ref.clone(),
        })).await.unwrap();
        assert_eq!(outcome.aborted, case == Case::Abort, "actual root Watch must report exact durable outcome");
    }
    hosted.finish().await;
    println!("CONSTRUCTOR_NATIVE_FIXTURE_CASE_ASSERTIONS_COMPLETED case={case:?} canonical_readback=true no_task_success=true normal_host_and_proxy_join=true prerequisite_only=true");
}
#[tokio::test]
#[ignore = "parent-owned private canonical native authority required"]
async fn constructor_native_commit_nested_return_retains_lease_then_canonical_visibility() { run(Case::Commit).await; }
#[tokio::test]
#[ignore = "parent-owned private canonical native authority required"]
async fn constructor_native_default_bytes_prepare_is_writable_and_commits_present_empty() { run(Case::DefaultCommit).await; }
#[tokio::test]
#[ignore = "parent-owned private canonical native authority required"]
async fn constructor_native_root_abort_after_child_return_leaves_child_invisible() { run(Case::Abort).await; }
#[tokio::test]
#[ignore = "parent-owned private canonical native authority required"]
async fn constructor_native_existing_actor_rejected_before_child_hook() { run(Case::Existing).await; }
#[tokio::test]
#[ignore = "parent-owned private canonical native authority required"]
async fn constructor_native_taskful_effect_refused_without_task_success() { run(Case::Taskful).await; }
#[tokio::test]
#[ignore = "parent-owned private canonical native authority required"]
async fn constructor_native_incorrect_ticket_request_burns_alias_before_load() { run(Case::WrongTicket).await; }
#[tokio::test]
#[ignore = "parent-owned private canonical native authority required"]
async fn constructor_native_authorization_refusal_observes_actual_absence_no_hook() { run(Case::Refused).await; }
#[tokio::test]
#[ignore = "parent-owned private canonical native authority required"]
async fn constructor_native_held_real_prepare_ack_retains_lease_until_root_outcome() { run(Case::HeldPrepare).await; }

#[tokio::test]
#[ignore = "parent-owned private canonical native authority required"]
async fn constructor_native_no_optin_and_forged_metadata_refuse_before_load() { run(Case::NoOptIn).await; }
#[tokio::test]
#[ignore = "parent-owned private canonical native authority required"]
async fn constructor_native_existing_present_empty_actor_is_not_missing() { run(Case::ExistingEmpty).await; }

#[test]
#[ignore = "exact isolated test process and private native custodian required; retains prepared ownership until process exit"]
fn constructor_native_actual_prepare_ack_then_tcp_loss_retains_uncertainty_until_process_exit() {
    let runtime = tokio::runtime::Builder::new_multi_thread().enable_all().build().unwrap();
    runtime.block_on(run(Case::LostPrepare));
    drop(runtime); // Runtime destroyed; leaked ORIGINAL root/child custody is deliberately not dropped.
    // Box::leak has no destructor: original PendingRegistry/lease allocations
    // remain strongly owned until this exact isolated test process exits.
    // Native ownership remains unresolved and the authority must not be reused.
    println!("CONSTRUCTOR_TCP_LOSS_RUNTIME_DESTROYED_PROCESS_EXIT_REQUIRED; not restart reconciliation or normal shutdown");
}

#[path = "coordinated_transaction_recovery.rs"]
mod coordinated_transaction_recovery;

#[path = "coordinated_multiowner_abort.rs"]
mod coordinated_multiowner_abort;

#[path = "dynamic_catalog_recovery.rs"]
mod dynamic_catalog_recovery;
#[path = "committed_welcome_catalog_recovery.rs"]
mod committed_welcome_catalog_recovery;
