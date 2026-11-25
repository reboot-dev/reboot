//! SOURCE721 source-only native two-original-owner ACK barrier.
//! Hook suggestion in native.rs ONLY (parent-owned):
//! #[path = "coordinated_multiowner_abort.rs"] mod coordinated_multiowner_abort;
//! Each invocation requires a pristine parent-owned canonical native Database.
//! No process is launched by this source handoff. No native acceptance claimed.
//! IMPORTANT: the barrier requires native STARTED/unprepared transactions. Native
//! TransactionParticipantPrepare transitions RocksDB to PREPARED (Recover derives
//! prepared from RocksDB, not the request flag). Accordingly this case uses real
//! transactional Store, as SOURCE667 Abort does, not a fabricated unprepared
//! Prepare result. A successful Prepare seed cannot test the pre-replay all-
//! unprepared Abort barrier. CreateActor and CoordinatorPrepare are real RPCs.
//! Empty task inventories prove no task IO, not taskful replay or constructors.
use super::*;
use reboot::{
    application_host::{HostRecovery, RecoveryCancellation},
    coordinated_local_recovery::{CoordinatedLocalRecovery, LocalCoordinator},
    one_shot_tasks::{MultiOwnerTaskRecovery, OneShotTasks, ParticipantBoundTaskBinding,
        ReaderTaskBinding, TaskMethodDeclaration},
    runtime::{DurableStateDeclaration, StateAdmission},
};
use tokio::{sync::oneshot, task::JoinSet};

struct Account;
impl DurableStateDeclaration for Account {
    type State = b::Account;
    const STATE_TYPE: &'static str = ACCOUNT;
    const TASK_STATE_ADMISSION: StateAdmission = StateAdmission::RequireExisting;
}
struct EmptyReader;
#[tonic::async_trait]
impl ReaderTaskBinding for EmptyReader {
    fn validate(&self, _: &db::Task) -> Result<(), Status> {
        Err(Status::failed_precondition("SOURCE721 requires empty task inventory"))
    }
    async fn execute(&self, _: &db::Task) -> Result<prost_types::Any, Status> {
        panic!("SOURCE721 empty original owner must never execute")
    }
}
type Phase = CoordinatedLocalRecovery<TonicParticipantSidecar, TonicCoordinatorSidecar>;
struct ObservePhase {
    phase: Arc<Phase>,
    observed: Mutex<Option<oneshot::Sender<RecoveryCancellation>>>,
}
#[tonic::async_trait]
impl HostRecovery for ObservePhase {
    async fn start(&self, supervisor: &mut JoinSet<Result<(), Status>>, cancel: RecoveryCancellation) -> Result<(), Status> {
        self.observed.lock().unwrap().take().unwrap().send(cancel.clone()).ok();
        self.phase.start(supervisor, cancel).await
    }
}
fn scope() -> db::RecoverRequest {
    db::RecoverRequest {
        shard_ids: vec!["s000000000".into()],
        state_tags_by_state_type: [(ACCOUNT.into(), "Account".into()), (BANK.into(), "Bank".into())].into(),
        skip_idempotent_mutations: true,
    }
}
async fn scan(client: &mut db::database_client::DatabaseClient<tonic::transport::Channel>) -> Vec<db::RecoverResponse> {
    let mut stream = bounded(client.recover(scope())).await.unwrap().into_inner();
    let mut pages = vec![];
    while let Some(page) = bounded(stream.message()).await.unwrap() { pages.push(page); }
    pages
}
async fn decision(client: &mut db::database_client::DatabaseClient<tonic::transport::Channel>, root: Uuid, reference: &str) -> Option<db::TransactionCoordinatorDecision> {
    bounded(client.transaction_coordinator_decision_get(db::TransactionCoordinatorDecisionGetRequest {
        root_transaction_id: root.as_bytes().to_vec(), coordinator_state_ref: reference.into(),
    })).await.unwrap().into_inner().decision
}
fn no_tasks(pages: &[db::RecoverResponse]) {
    assert!(pages.iter().all(|p| p.pending_tasks.is_empty() && p.participant_transactions.iter().all(|tx| tx.uncommitted_tasks.is_empty() && tx.uncommitted_idempotent_mutations.is_empty())));
}
fn no_transactions(pages: &[db::RecoverResponse]) {
    no_tasks(pages);
    assert!(pages.iter().all(|p| p.participant_transactions.is_empty() && p.transaction_coordinators.is_empty()));
}

#[tokio::test]
#[ignore = "parent-owned pristine native Database, serializer and joins required"]
async fn two_original_native_abort_acks_fence_replay_and_host_ready() {
    let (canonical, run) = prerequisites();
    let observations = Arc::new(Observations::new(Case::Commit, String::new()));
    let proxy = proxy::ObservedDatabase {
        client: bounded(db::database_client::DatabaseClient::connect(canonical.clone())).await.unwrap(),
        observations: observations.clone(),
    };
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let endpoint = format!("http://{}", listener.local_addr().unwrap());
    let (proxy_stop, proxy_stopped) = oneshot::channel();
    // Existing fixture panic-only cleanup, not a new custody/controller layer.
    let mut proxy_guard = ProxyGuard {
        stop: Some(proxy_stop),
        server: tokio::spawn(async move {
            tonic::transport::Server::builder()
                .add_service(db::database_server::DatabaseServer::new(proxy))
                .serve_with_incoming_shutdown(tokio_stream::wrappers::TcpListenerStream::new(listener), async { let _ = proxy_stopped.await; }).await
        }),
    };
    let mut direct = bounded(db::database_client::DatabaseClient::connect(canonical)).await.unwrap();
    assert_no_inventory(&mut direct).await;
    let mut seed = bounded(db::database_client::DatabaseClient::connect(endpoint.clone())).await.unwrap();
    let store = DatabaseActorStore::connect_lazy(&endpoint).unwrap();
    let mut refs = [state_ref(ACCOUNT, &format!("source721-{run}-a")), state_ref(ACCOUNT, &format!("source721-{run}-b"))];
    refs.sort(); // Actual phase BTree owner order, not creation/random UUID order.
    assert_ne!(refs[0], refs[1]);
    let roots = [Uuid::new_v4(), Uuid::new_v4()];
    let mut states = vec![];
    for (i, reference) in refs.iter().enumerate() {
        let before = b::Account { customer_name: format!("source721-original-{i}"), balance: 721 }.encode_to_vec();
        assert!(load(&mut direct, ACCOUNT, reference).await.is_none());
        assert!(decision(&mut direct, roots[i], reference).await.is_none());
        bounded(seed.create_actor(db::CreateActorRequest {
            actor: Some(db::Actor { state_type: ACCOUNT.into(), state_ref: reference.clone(), state: Some(before.clone()) }),
            idempotent_mutation: Some(db::IdempotentMutation {
                state_type: ACCOUNT.into(), state_ref: reference.clone(), key: Uuid::new_v4().as_bytes().to_vec(),
                response: b::OpenResponse { welcome_email_task_id: None }.encode_to_vec(),
                ..Default::default()
            }), sync: true, task_upserts: vec![],
        })).await.unwrap();
        let members = db::Participants {
            should_commit: [(ACCOUNT.into(), db::participants::StateRefs { state_refs: vec![reference.clone()] })].into(),
            read_only: Default::default(),
        };
        bounded(seed.transaction_coordinator_prepare(db::TransactionCoordinatorPrepareRequest {
            transaction_id: roots[i].as_bytes().to_vec(),
            transaction_coordinator: Some(db::TransactionCoordinator { state_ref: reference.clone(), participants: Some(members), preparing: true }),
        })).await.unwrap();
        bounded(seed.store(db::StoreRequest {
            sync: true,
            transaction: Some(db::Transaction { state_type: ACCOUNT.into(), state_ref: reference.clone(), transaction_ids: vec![roots[i].as_bytes().to_vec()], coordinator_state_type: ACCOUNT.into(), coordinator_state_ref: reference.clone(), prepared: false, uncommitted_tasks: vec![], uncommitted_idempotent_mutations: vec![] }),
            actor_upserts: vec![db::Actor { state_type: ACCOUNT.into(), state_ref: reference.clone(), state: Some(b::Account { customer_name: format!("source721-discard-{i}"), balance: 1721 }.encode_to_vec()) }],
            ..Default::default()
        })).await.unwrap();
        assert_eq!(load(&mut direct, ACCOUNT, reference).await, Some(before.clone()));
        states.push(before);
    }
    let initial = scan(&mut direct).await;
    no_tasks(&initial);
    let txs: Vec<_> = initial.iter().flat_map(|p| &p.participant_transactions).collect();
    assert_eq!(txs.len(), 2);
    assert_eq!(initial.iter().map(|p| p.transaction_coordinators.len()).sum::<usize>(), 2);
    for (i, reference) in refs.iter().enumerate() {
        let tx = txs.iter().find(|tx| &tx.state_ref == reference).unwrap();
        assert_eq!(tx.state_type, ACCOUNT);
        assert!(!tx.prepared, "real RocksDB STARTED inventory is essential to this barrier");
        assert_eq!(tx.transaction_ids, vec![roots[i].as_bytes().to_vec()]);
        assert_eq!(tx.coordinator_state_type, ACCOUNT);
        assert_eq!(tx.coordinator_state_ref, *reference);
        let record = initial.iter().find_map(|p| p.transaction_coordinators.get(&roots[i].to_string())).unwrap();
        assert!(record.preparing);
        assert_eq!(record.state_ref, *reference);
        assert_eq!(record.participants.as_ref().unwrap().should_commit.get(ACCOUNT).unwrap().state_refs, vec![reference.clone()]);
    }
    let sidecar = Arc::new(bounded(TonicParticipantSidecar::connect(&endpoint)).await.unwrap());
    let participants: Vec<_> = refs.iter().map(|reference| DurableActorParticipant::new(sidecar.clone(), ACCOUNT, reference).with_database_actor_gate(&store)).collect();
    let mut tasks = vec![];
    for participant in &participants {
        let owner = OneShotTasks::new_with_participant_declarations(store.clone(), ACCOUNT.into(), participant.actor_target().state_ref, ParticipantBoundTaskBinding::new(participant.clone(), EmptyReader), vec![TaskMethodDeclaration::new::<Account, b::BalanceRequest, b::BalanceResponse>("bank.v1.AccountMethods.Balance", "type.googleapis.com/bank.v1.BalanceResponse", vec![])]).unwrap();
        owner.set_max_live_deliveries(1).unwrap();
        tasks.push(owner);
    }
    let resolver = Arc::new(ExactParticipantResolver::new(participants.iter().map(|p| (p.actor_target(), Arc::new(InProcessParticipantEndpoint::new(DurableActorParticipantHost::new(p.clone())))))).unwrap());
    let coordinator_sidecar = Arc::new(bounded(TonicCoordinatorSidecar::connect(&endpoint)).await.unwrap());
    let coordinators: Vec<_> = participants.iter().map(|p| LocalCoordinator { target: p.actor_target(), owner: DurableRootCoordinator::new(coordinator_sidecar.clone(), resolver.clone()).with_identity(p.actor_target()) }).collect();
    let phase = CoordinatedLocalRecovery::new(store.clone(), scope(), participants.clone(), coordinators, resolver, MultiOwnerTaskRecovery::new(tasks.clone(), scope()).unwrap()).unwrap();
    let barrier = Arc::new(proxy::AbortAckBarrier { refs: refs.clone(), native: Mutex::new(vec![]), delivered: AtomicUsize::new(0), parked: tokio::sync::Semaphore::new(0), release: tokio::sync::Semaphore::new(0) });
    proxy::register_abort_barrier(&barrier);
    let (observed_tx, observed_rx) = oneshot::channel();
    let (stop_tx, stop_rx) = oneshot::channel();
    let host = ApplicationHost::new("source721")
        .with_host_recovery(ObservePhase { phase: phase.clone(), observed: Mutex::new(Some(observed_tx)) })
        .add_public_service(db::coordinator_server::CoordinatorServer::new(reboot::legacy_coordinator::DurableCoordinatorWatchHost::new(coordinator_sidecar, ACCOUNT, refs[0].clone()).unwrap()));
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let mut serving = tokio::spawn(host.serve_with_listener_shutdown(listener, async { let _ = stop_rx.await; }));
    let cancel = bounded(observed_rx).await.unwrap();
    tokio::select! {
        _ = async { bounded(barrier.parked.acquire()).await.unwrap().forget(); } => {},
        result = &mut serving => panic!("host exited before second canonical Abort response: {result:?}"),
    }
    assert_eq!(*barrier.native.lock().unwrap(), refs.to_vec());
    assert_eq!(barrier.delivered.load(Ordering::SeqCst), 1);
    // Canonical native state ALREADY rolled back both actors while the SDK has
    // not received ACK #2. A sleep before invocation cannot establish this.
    let parked = scan(&mut direct).await;
    no_tasks(&parked);
    assert!(parked.iter().all(|p| p.participant_transactions.is_empty()));
    assert_eq!(parked.iter().map(|p| p.transaction_coordinators.len()).sum::<usize>(), 2);
    for i in 0..2 {
        assert_eq!(load(&mut direct, ACCOUNT, &refs[i]).await, Some(states[i].clone()));
        assert!(decision(&mut direct, roots[i], &refs[i]).await.is_none());
        assert_eq!(tasks[i].completed_operations(), 0);
    }
    let events = observations.events();
    assert!(!events.iter().any(|e| matches!(e.method, "TransactionCoordinatorDecisionPut" | "TransactionCoordinatorCleanup" | "CompleteTask")));
    assert!(tokio::time::timeout(Duration::from_millis(50), cancel.public_ready()).await.is_err());
    let original_gate = store.actor_gate(ACCOUNT, &refs[1]);
    assert!(tokio::time::timeout(Duration::from_millis(50), original_gate.shared()).await.is_err(), "original second owner gate released before ACK");
    barrier.release.add_permits(1);
    bounded(cancel.public_ready()).await.unwrap();
    assert_eq!(barrier.delivered.load(Ordering::SeqCst), 2);
    no_transactions(&scan(&mut direct).await);
    for i in 0..2 {
        assert_eq!(load(&mut direct, ACCOUNT, &refs[i]).await, Some(states[i].clone()));
        let outcome = decision(&mut direct, roots[i], &refs[i]).await.expect("native durable Abort decision");
        assert_eq!(outcome.coordinator_state_ref, refs[i]);
        assert_eq!(outcome.outcome, db::transaction_coordinator_decision::Outcome::Abort as i32);
        assert!(outcome.participants.is_none());
        // Actual admission through the same original store gate, no replacement.
        drop(bounded(store.actor_gate(ACCOUNT, &refs[i]).shared()).await);
        assert_eq!(tasks[i].completed_operations(), 0);
    }
    let events = observations.events();
    for method in ["TransactionParticipantAbort", "TransactionCoordinatorDecisionPut", "TransactionCoordinatorCleanup"] {
        assert_eq!(events.iter().filter(|e| e.method == method && e.code.is_none() && e.response.is_some()).count(), 2, "exact real canonical successful {method} count");
    }
    assert!(!events.iter().any(|e| e.method == "CompleteTask"));
    stop_tx.send(()).unwrap();
    bounded(&mut serving).await.unwrap().unwrap();
    assert!(cancel.public_ready().await.is_err());
    no_transactions(&scan(&mut direct).await);
    proxy_guard.stop.take().unwrap().send(()).unwrap();
    bounded(&mut proxy_guard.server).await.unwrap().unwrap();
    println!("SOURCE721_NATIVE_TWO_ORIGINAL_ABORT_ACK_BARRIER_COMPLETE");
}
