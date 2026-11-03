//! SOURCE739 SOURCE ONLY: original generated Account + consuming catalog recovery.
//! Parent hook suggestion (DO NOT edit native.rs here):
//! #[path = "dynamic_catalog_recovery.rs"] mod dynamic_catalog_recovery;
//! Depends on SOURCE721 native/proxy.rs weak AbortAckBarrier unchanged and
//! SOURCE727/738 consuming DynamicLocalCatalog::into_recovery API; NOT accepted.
//! Parent owns compile, generated serializer, pristine native authority and execution.
//! Native STARTED uses Store, NOT ParticipantPrepare (which becomes PREPARED).
//! Empty provisional/tasks, no constructors/shared. Balance stays Unimplemented.
use super::*;
use reboot::{
    application_host::{HostRecovery, RecoveryCancellation},
    auth::AuthorizationPolicy,
    coordinated_local_recovery::LocalCoordinator,
    dynamic_local_catalog::{DynamicLocalCatalog, DynamicLocalOwner},
    registered_local::GeneratedLocalTransactionAdapter,
};
use tokio::{sync::oneshot, task::JoinSet};
struct NoStarts;
impl RootTransactionStartFactory for NoStarts {
    fn next_root_transaction(&self) -> Result<RootTransactionStart, Status> {
        panic!("ordinary Deposit must not allocate a transaction root")
    }
}
impl InboundTransactionStartFactory for NoStarts {
    fn next_inbound_transaction(&self, _: &InboundTransactionContext) -> Result<Uuid, Status> {
        panic!("ordinary public Deposit must not allocate an inbound transaction")
    }
}
struct DepositHandler {
    calls: Arc<AtomicUsize>,
}
#[tonic::async_trait]
impl ag::AccountMethodsTransactionHandler for DepositHandler {
    async fn open(&self, _: &mut b::Account, _: b::OpenRequest) -> Result<b::OpenResponse, Status> {
        panic!("no constructor")
    }
    async fn balance(
        &self,
        state: &b::Account,
        _: b::BalanceRequest,
    ) -> Result<b::BalanceResponse, Status> {
        Ok(b::BalanceResponse {
            balance: state.balance,
        })
    }
    async fn deposit(
        &self,
        state: &mut b::Account,
        request: b::DepositRequest,
    ) -> Result<b::DepositResponse, Status> {
        self.calls.fetch_add(1, Ordering::SeqCst);
        assert_eq!(request.amount, 11);
        state.balance = state
            .balance
            .checked_add(request.amount)
            .ok_or_else(|| Status::out_of_range("balance"))?;
        Ok(b::DepositResponse {
            updated_balance: state.balance,
        })
    }
    async fn withdraw(
        &self,
        _: &mut b::Account,
        _: b::WithdrawRequest,
    ) -> Result<b::WithdrawResponse, ag::AccountMethodsWithdrawError> {
        Err(ag::AccountMethodsWithdrawError::Grpc(
            Status::unimplemented("outside vertical"),
        ))
    }
    async fn welcome_email(
        &self,
        _: &mut b::Account,
        _: b::WelcomeEmailRequest,
    ) -> Result<b::WelcomeEmailResponse, Status> {
        panic!("empty task inventory")
    }
}
// The participant-bound task helper also requires the generated database trait.
// Both generated entry paths share the same handler and ordinary-writer effects.
#[tonic::async_trait]
impl ag::AccountMethodsDatabaseHandler for DepositHandler {
    async fn open(
        &self,
        state: &mut b::Account,
        request: b::OpenRequest,
    ) -> Result<b::OpenResponse, Status> {
        ag::AccountMethodsTransactionHandler::open(self, state, request).await
    }
    async fn balance(
        &self,
        state: &b::Account,
        request: b::BalanceRequest,
    ) -> Result<b::BalanceResponse, Status> {
        ag::AccountMethodsTransactionHandler::balance(self, state, request).await
    }
    async fn deposit(
        &self,
        state: &mut b::Account,
        request: b::DepositRequest,
    ) -> Result<b::DepositResponse, Status> {
        ag::AccountMethodsTransactionHandler::deposit(self, state, request).await
    }
    async fn withdraw(
        &self,
        state: &mut b::Account,
        request: b::WithdrawRequest,
    ) -> Result<b::WithdrawResponse, ag::AccountMethodsWithdrawError> {
        ag::AccountMethodsTransactionHandler::withdraw(self, state, request).await
    }
    async fn welcome_email(
        &self,
        state: &mut b::Account,
        request: b::WelcomeEmailRequest,
    ) -> Result<b::WelcomeEmailResponse, Status> {
        ag::AccountMethodsTransactionHandler::welcome_email(self, state, request).await
    }
}
// Later *real HostRecovery* phase: canonical convergence is not global Ready.
struct HoldRecovery {
    entered: Mutex<Option<oneshot::Sender<RecoveryCancellation>>>,
    release: Mutex<Option<oneshot::Receiver<()>>>,
}
#[tonic::async_trait]
impl HostRecovery for HoldRecovery {
    async fn start(
        &self,
        _: &mut JoinSet<Result<(), Status>>,
        cancel: RecoveryCancellation,
    ) -> Result<(), Status> {
        let release = self.release.lock().unwrap().take().unwrap();
        self.entered
            .lock()
            .unwrap()
            .take()
            .unwrap()
            .send(cancel.clone())
            .ok();
        tokio::select! {
            result = release => result.map_err(|_| Status::cancelled("release dropped")),
            _ = cancel.cancelled() => Err(Status::cancelled("host cancelled")),
        }
    }
}
type Owner = DynamicLocalOwner<
    TonicParticipantSidecar,
    Arc<ExactParticipantResolver<InProcessParticipantEndpoint<TonicParticipantSidecar>>>,
>;
fn deposit(reference: &str, key: Uuid) -> Request<b::DepositRequest> {
    let mut r = request(reference, b::DepositRequest { amount: 11 });
    r.metadata_mut()
        .insert("x-reboot-idempotency-key", key.to_string().parse().unwrap());
    r
}
fn scope() -> db::RecoverRequest {
    db::RecoverRequest {
        shard_ids: vec!["s000000000".into()],
        state_tags_by_state_type: [
            (ACCOUNT.into(), "Account".into()),
            (BANK.into(), "Bank".into()),
        ]
        .into(),
        skip_idempotent_mutations: true,
    }
}
async fn scan(
    client: &mut db::database_client::DatabaseClient<tonic::transport::Channel>,
) -> Vec<db::RecoverResponse> {
    let mut stream = bounded(client.recover(scope())).await.unwrap().into_inner();
    let mut pages = vec![];
    while let Some(page) = bounded(stream.message()).await.unwrap() {
        pages.push(page);
    }
    pages
}
async fn decision(
    client: &mut db::database_client::DatabaseClient<tonic::transport::Channel>,
    root: Uuid,
    reference: &str,
) -> Option<db::TransactionCoordinatorDecision> {
    bounded(client.transaction_coordinator_decision_get(
        db::TransactionCoordinatorDecisionGetRequest {
            root_transaction_id: root.as_bytes().to_vec(),
            coordinator_state_ref: reference.into(),
        },
    ))
    .await
    .unwrap()
    .into_inner()
    .decision
}
fn no_tasks(pages: &[db::RecoverResponse]) {
    assert!(pages.iter().all(|p| {
        p.pending_tasks.is_empty()
            && p.participant_transactions.iter().all(|tx| {
                tx.uncommitted_tasks.is_empty() && tx.uncommitted_idempotent_mutations.is_empty()
            })
    }));
}
fn no_transactions(pages: &[db::RecoverResponse]) {
    no_tasks(pages);
    assert!(pages.iter().all(|p| p.participant_transactions.is_empty() && p.transaction_coordinators.is_empty()));
}

#[tokio::test]
#[ignore = "SOURCE ONLY: parent compile, serializer, private native authority and joins required"]
async fn generated_catalog_consuming_recovery_fences_real_deposit_until_global_ready() {
    let (canonical, run) = prerequisites();
    let observations = Arc::new(Observations::new(Case::Commit, String::new()));
    let proxy = proxy::ObservedDatabase {
        client: bounded(db::database_client::DatabaseClient::connect(
            canonical.clone(),
        ))
        .await
        .unwrap(),
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
                .serve_with_incoming_shutdown(
                    tokio_stream::wrappers::TcpListenerStream::new(listener),
                    async {
                        let _ = proxy_stopped.await;
                    },
                )
                .await
        }),
    };
    let mut direct = bounded(db::database_client::DatabaseClient::connect(canonical))
        .await
        .unwrap();
    assert_no_inventory(&mut direct).await;
    let mut seed = bounded(db::database_client::DatabaseClient::connect(
        endpoint.clone(),
    ))
    .await
    .unwrap();
    let store = DatabaseActorStore::connect_lazy(&endpoint).unwrap();
    let mut refs = [
        state_ref(ACCOUNT, &format!("source739-{run}-a")),
        state_ref(ACCOUNT, &format!("source739-{run}-b")),
    ];
    refs.sort(); // Actual phase BTree owner order, not creation/random UUID order.
    assert_ne!(refs[0], refs[1]);
    let roots = [Uuid::new_v4(), Uuid::new_v4()];
    let mut states = vec![];
    for (i, reference) in refs.iter().enumerate() {
        let before = b::Account {
            customer_name: format!("source739-original-{i}"),
            balance: 721,
        }
        .encode_to_vec();
        assert!(load(&mut direct, ACCOUNT, reference).await.is_none());
        assert!(decision(&mut direct, roots[i], reference).await.is_none());
        bounded(
            seed.create_actor(db::CreateActorRequest {
                actor: Some(db::Actor {
                    state_type: ACCOUNT.into(),
                    state_ref: reference.clone(),
                    state: Some(before.clone()),
                }),
                idempotent_mutation: Some(db::IdempotentMutation {
                    state_type: ACCOUNT.into(),
                    state_ref: reference.clone(),
                    key: Uuid::new_v4().as_bytes().to_vec(),
                    response: b::OpenResponse {
                        welcome_email_task_id: None,
                    }
                    .encode_to_vec(),
                    ..Default::default()
                }),
                sync: true,
                task_upserts: vec![],
            }),
        )
        .await
        .unwrap();
        let members = db::Participants {
            should_commit: [(
                ACCOUNT.into(),
                db::participants::StateRefs {
                    state_refs: vec![reference.clone()],
                },
            )]
            .into(),
            read_only: Default::default(),
        };
        bounded(
            seed.transaction_coordinator_prepare(db::TransactionCoordinatorPrepareRequest {
                transaction_id: roots[i].as_bytes().to_vec(),
                transaction_coordinator: Some(db::TransactionCoordinator {
                    state_ref: reference.clone(),
                    participants: Some(members),
                    preparing: true,
                }),
            }),
        )
        .await
        .unwrap();
        bounded(seed.store(db::StoreRequest {
            sync: true,
            transaction: Some(db::Transaction {
                state_type: ACCOUNT.into(),
                state_ref: reference.clone(),
                transaction_ids: vec![roots[i].as_bytes().to_vec()],
                coordinator_state_type: ACCOUNT.into(),
                coordinator_state_ref: reference.clone(),
                prepared: false,
                uncommitted_tasks: vec![],
                uncommitted_idempotent_mutations: vec![],
            }),
            actor_upserts: vec![db::Actor {
                    state_type: ACCOUNT.into(),
                    state_ref: reference.clone(),
                    state: Some(
                        b::Account {
                            customer_name: format!("source739-discard-{i}"),
                            balance: 1721,
                        }
                        .encode_to_vec(),
                    ),
                }],
            ..Default::default()
        }))
        .await
        .unwrap();
        assert_eq!(
            load(&mut direct, ACCOUNT, reference).await,
            Some(before.clone())
        );
        states.push(before);
    }
    let initial = scan(&mut direct).await;
    no_tasks(&initial);
    let txs: Vec<_> = initial
        .iter()
        .flat_map(|p| &p.participant_transactions)
        .collect();
    assert_eq!(txs.len(), 2);
    assert_eq!(
        initial
            .iter()
            .map(|p| p.transaction_coordinators.len())
            .sum::<usize>(),
        2
    );
    for (i, reference) in refs.iter().enumerate() {
        let tx = txs.iter().find(|tx| &tx.state_ref == reference).unwrap();
        assert_eq!(tx.state_type, ACCOUNT);
        assert!(
            !tx.prepared,
            "real RocksDB STARTED inventory is essential to this barrier"
        );
        assert_eq!(tx.transaction_ids, vec![roots[i].as_bytes().to_vec()]);
        assert_eq!(tx.coordinator_state_type, ACCOUNT);
        assert_eq!(tx.coordinator_state_ref, *reference);
        let record = initial
            .iter()
            .find_map(|p| p.transaction_coordinators.get(&roots[i].to_string()))
            .unwrap();
        assert!(record.preparing);
        assert_eq!(record.state_ref, *reference);
        assert_eq!(
            record
                .participants
                .as_ref()
                .unwrap()
                .should_commit
                .get(ACCOUNT)
                .unwrap()
                .state_refs,
            vec![reference.clone()]
        );
    }
    let sidecar = Arc::new(
        bounded(TonicParticipantSidecar::connect(&endpoint))
            .await
            .unwrap(),
    );
    let participants: Vec<_> = refs
        .iter()
        .map(|reference| {
            DurableActorParticipant::new(sidecar.clone(), ACCOUNT, reference)
                .with_database_actor_gate(&store)
        })
        .collect();
    let endpoints: Vec<_> = participants
        .iter()
        .map(|p| {
            Arc::new(InProcessParticipantEndpoint::new(
                DurableActorParticipantHost::new(p.clone()),
            ))
        })
        .collect();
    let resolver = Arc::new(
        ExactParticipantResolver::new(
            participants
                .iter()
                .zip(&endpoints)
                .map(|(p, e)| (p.actor_target(), e.clone())),
        )
        .unwrap(),
    );
    let coordinator_sidecar = Arc::new(
        bounded(TonicCoordinatorSidecar::connect(&endpoint))
            .await
            .unwrap(),
    );
    let calls = Arc::new(AtomicUsize::new(0));
    // All members belong to one fixed service family, including policy identity.
    // Bind once before cloning: generated adapters repeat this exact binding.
    let authorization = AuthorizationPolicy::permissive_for_development()
        .for_declaration::<ag::AccountDurableState>();
    let mut adapters = std::collections::BTreeMap::new();
    let mut owners = vec![];
    let mut coordinators = vec![];
    for (i, participant) in participants.iter().enumerate() {
        let coordinator =
            DurableRootCoordinator::new(coordinator_sidecar.clone(), resolver.clone())
                .with_identity(participant.actor_target());
        coordinators.push(LocalCoordinator {
            target: participant.actor_target(),
            owner: coordinator.clone(),
        });
        // Fully configure original adapter BEFORE configuration/factory clone.
        let (adapter, tasks) = ag::AccountMethodsTransactionAdapter::new(
            store.clone(),
            participant.clone(),
            coordinator,
            NoStarts,
            DepositHandler {
                calls: calls.clone(),
            },
        )
        .with_authorization(authorization.clone())
        .with_one_shot_writer_tasks(&refs[i])
        .unwrap();
        // Shared recovery sums all original owners' configured delivery budgets.
        // This empty-task control needs only one bounded slot per original owner.
        tasks.set_max_live_deliveries(1).unwrap();
        let configuration = adapter.local_configuration().unwrap();
        assert!(
            configuration
                .methods
                .contains("bank.v1.AccountMethods.Deposit")
        );
        assert!(
            !configuration
                .methods
                .contains("bank.v1.AccountMethods.Balance")
        );
        let original = DynamicLocalOwner::new(
            configuration.clone(),
            participant.clone(),
            tasks,
            endpoints[i].clone(),
            resolver.clone(),
        )
        .unwrap();
        assert!(Arc::ptr_eq(original.custody(), &resolver));
        adapters.insert(configuration.target.clone(), adapter.clone());
        owners.push(original);
    }
    let mut host = ApplicationHost::new("source739");
    let catalog = DynamicLocalCatalog::register(
        &mut host,
        owners[0].configuration().clone(),
        2,
        move |original: Arc<Owner>| {
            adapters
                .get(&original.participant().actor_target())
                .cloned()
                .ok_or_else(|| Status::failed_precondition("not an original generated adapter"))
        },
    )
    .unwrap();
    let mut destinations = vec![];
    for (i, original) in owners.iter().enumerate() {
        let destination = catalog.install(original.clone()).unwrap();
        let (retained, installed) = catalog
            .lookup_installed(&original.participant().actor_target())
            .unwrap();
        assert!(Arc::ptr_eq(&retained, original));
        assert!(Arc::ptr_eq(retained.endpoint(), &endpoints[i]));
        assert!(destination.binding().same_registration(installed.binding()));
        destinations.push(destination);
    }
    let frontdoor = catalog.public_frontdoor().unwrap();
    let phase = catalog
        .into_recovery(
            store.clone(),
            scope(),
            owners.clone(),
            coordinators,
            resolver.clone(),
        )
        .unwrap();
    let barrier = Arc::new(proxy::AbortAckBarrier {
        refs: refs.clone(),
        native: Mutex::new(vec![]),
        delivered: AtomicUsize::new(0),
        parked: tokio::sync::Semaphore::new(0),
        release: tokio::sync::Semaphore::new(0),
    });
    proxy::register_abort_barrier(&barrier);
    let (entered_tx, entered_rx) = oneshot::channel();
    let (release_tx, release_rx) = oneshot::channel();
    let (stop_tx, stop_rx) = oneshot::channel();
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let public_endpoint = format!("http://{}", listener.local_addr().unwrap());
    let running = host
        .with_host_recovery(phase)
        .with_host_recovery(HoldRecovery {
            entered: Mutex::new(Some(entered_tx)),
            release: Mutex::new(Some(release_rx)),
        })
        .add_public_service(frontdoor)
        .add_public_service(db::coordinator_server::CoordinatorServer::new(
            reboot::legacy_coordinator::DurableCoordinatorWatchHost::new(
                coordinator_sidecar,
                ACCOUNT,
                refs[0].clone(),
            )
            .unwrap(),
        ));
    let mut serving = tokio::spawn(running.serve_with_listener_shutdown(listener, async {
        let _ = stop_rx.await;
    }));
    tokio::select! {
        _ = async { bounded(barrier.parked.acquire()).await.unwrap().forget(); } => {},
        result = &mut serving => panic!("host exited before second native Abort ACK: {result:?}"),
    }
    assert_eq!(*barrier.native.lock().unwrap(), refs.to_vec());
    assert_eq!(barrier.delivered.load(Ordering::SeqCst), 1);
    let parked = scan(&mut direct).await;
    no_tasks(&parked);
    assert!(parked.iter().all(|p| p.participant_transactions.is_empty()));
    assert_eq!(
        parked
            .iter()
            .map(|p| p.transaction_coordinators.len())
            .sum::<usize>(),
        2
    );
    for i in 0..2 {
        assert_eq!(
            load(&mut direct, ACCOUNT, &refs[i]).await,
            Some(states[i].clone())
        );
        assert!(decision(&mut direct, roots[i], &refs[i]).await.is_none());
        assert_eq!(
            destinations[i]
                .binding()
                .require_host_ready(owners[i].configuration())
                .unwrap_err()
                .code(),
            Code::Unavailable
        );
    }
    assert!(!observations.events().iter().any(|e| matches!(
        e.method,
        "TransactionCoordinatorDecisionPut" | "TransactionCoordinatorCleanup" | "CompleteTask"
    )));
    let original_gate = store.actor_gate(ACCOUNT, &refs[1]);
    assert!(
        tokio::time::timeout(Duration::from_millis(50), original_gate.shared())
            .await
            .is_err()
    );
    let mut client = bounded(b::account_methods_client::AccountMethodsClient::connect(
        public_endpoint,
    ))
    .await
    .unwrap();
    let key = Uuid::new_v4();
    let stores_before = observations
        .events()
        .iter()
        .filter(|e| e.method == "Store")
        .count();
    assert_eq!(
        bounded(client.deposit(deposit(&refs[0], key)))
            .await
            .unwrap_err()
            .code(),
        Code::Unavailable
    );
    assert_eq!(calls.load(Ordering::SeqCst), 0);
    barrier.release.add_permits(1);
    // Entry in the later phase proves canonical recovery.start actually returned.
    let cancel = bounded(entered_rx).await.unwrap();
    assert_eq!(barrier.delivered.load(Ordering::SeqCst), 2);
    no_transactions(&scan(&mut direct).await);
    for i in 0..2 {
        assert_eq!(
            load(&mut direct, ACCOUNT, &refs[i]).await,
            Some(states[i].clone())
        );
        let outcome = decision(&mut direct, roots[i], &refs[i])
            .await
            .expect("durable native Abort");
        assert_eq!(outcome.coordinator_state_ref, refs[i]);
        assert_eq!(
            outcome.outcome,
            db::transaction_coordinator_decision::Outcome::Abort as i32
        );
        assert!(outcome.participants.is_none());
        drop(bounded(store.actor_gate(ACCOUNT, &refs[i]).shared()).await);
        assert_eq!(owners[i].tasks().completed_operations(), 0);
    }
    assert!(
        tokio::time::timeout(Duration::from_millis(50), cancel.public_ready())
            .await
            .is_err()
    );
    assert_eq!(
        bounded(client.deposit(deposit(&refs[0], key)))
            .await
            .unwrap_err()
            .code(),
        Code::Unavailable,
        "canonical convergence is NOT global host Ready"
    );
    assert_eq!(calls.load(Ordering::SeqCst), 0);
    assert_eq!(
        observations
            .events()
            .iter()
            .filter(|e| e.method == "Store")
            .count(),
        stores_before
    );
    release_tx.send(()).unwrap();
    bounded(cancel.public_ready()).await.unwrap();
    for i in 0..2 {
        destinations[i]
            .binding()
            .require_host_ready(owners[i].configuration())
            .unwrap();
    }
    assert_eq!(
        bounded(client.balance(request(&refs[0], b::BalanceRequest {})))
            .await
            .unwrap_err()
            .code(),
        Code::Unimplemented
    );
    let response = bounded(client.deposit(deposit(&refs[0], key)))
        .await
        .unwrap()
        .into_inner();
    assert_eq!(response.updated_balance, 732);
    assert_eq!(calls.load(Ordering::SeqCst), 1);
    let updated_bytes = load(&mut direct, ACCOUNT, &refs[0]).await.unwrap();
    let updated = b::Account::decode(updated_bytes.as_slice()).unwrap();
    assert_eq!(updated.balance, response.updated_balance);
    assert_eq!(updated.customer_name, "source739-original-0");
    assert_eq!(
        load(&mut direct, ACCOUNT, &refs[1]).await,
        Some(states[1].clone())
    );
    // Canonical Recover receipt, not merely proxy request agreement.
    let pages = recover(&mut direct).await;
    no_transactions(&pages);
    let receipts: Vec<_> = pages
        .iter()
        .flat_map(|p| &p.idempotent_mutations)
        .filter(|m| m.key == key.as_bytes().to_vec())
        .collect();
    assert_eq!(receipts.len(), 1);
    let receipt = receipts[0];
    assert_eq!(receipt.state_type, ACCOUNT);
    assert_eq!(receipt.state_ref, refs[0]);
    assert_eq!(
        b::DepositResponse::decode(receipt.response.as_slice()).unwrap(),
        response
    );
    assert!(
        receipt
            .request_fingerprint
            .as_ref()
            .is_some_and(|f| !f.is_empty())
    );
    let events = observations.events();
    let stores: Vec<_> = events.iter().filter(|e| e.method == "Store").collect();
    assert_eq!(stores.len(), stores_before + 1);
    let write = db::StoreRequest::decode(stores.last().unwrap().request.as_slice()).unwrap();
    assert!(stores.last().unwrap().code.is_none() && stores.last().unwrap().response.is_some());
    assert!(write.sync && write.transaction.is_none() && write.task_upserts.is_empty());
    assert_eq!(write.actor_upserts.len(), 1);
    assert_eq!(write.actor_upserts[0].state_ref, refs[0]);
    assert_eq!(write.actor_upserts[0].state.as_ref(), Some(&updated_bytes));
    assert_eq!(write.idempotent_mutation.as_ref(), Some(receipt));
    for method in [
        "TransactionParticipantAbort",
        "TransactionCoordinatorDecisionPut",
        "TransactionCoordinatorCleanup",
    ] {
        assert_eq!(
            events
                .iter()
                .filter(|e| e.method == method && e.code.is_none() && e.response.is_some())
                .count(),
            2
        );
    }
    assert!(!events.iter().any(|e| e.method == "CompleteTask"));
    stop_tx.send(()).unwrap();
    bounded(&mut serving).await.unwrap().unwrap();
    assert!(cancel.public_ready().await.is_err());
    no_transactions(&scan(&mut direct).await);
    assert_eq!(
        load(&mut direct, ACCOUNT, &refs[0]).await,
        Some(updated_bytes)
    );
    assert_eq!(
        load(&mut direct, ACCOUNT, &refs[1]).await,
        Some(states[1].clone())
    );
    proxy_guard.stop.take().unwrap().send(()).unwrap();
    bounded(&mut proxy_guard.server).await.unwrap().unwrap();
    println!("SOURCE739_NATIVE_GENERATED_CATALOG_CONSUMING_RECOVERY_JOINED");
}
