//! SOURCE817 assertion repair of SOURCE812; source candidate ONLY; no native/typecheck acceptance.
//! Parent hook in native.rs: #[path = "external_constructor_catalog.rs"] mod external_constructor_catalog;
//! Standalone external construction, not transaction STARTED/all-ACK recovery proof.
//! No restart, lost ACK, cancel, shared/provisional tasks, external mail or exactly-once claim.
use super::*;
use reboot::{
    application_host::{HostRecovery, RecoveryCancellation},
    auth::AuthorizationPolicy,
    coordinated_local_recovery::LocalCoordinator,
    dynamic_local_catalog::{DynamicLocalCatalog, DynamicLocalOwner},
    registered_local::GeneratedLocalTransactionAdapter,
};
use tokio::{sync::oneshot, task::JoinSet};
// Wire-only inspection of the existing SDK scheduling checkpoint, not persistence.
#[derive(prost::Message)]
struct Checkpoint {
    #[prost(bytes = "vec", tag = "1")]
    response: Vec<u8>,
    #[prost(message, repeated, tag = "2")]
    tasks: Vec<db::Task>,
    #[prost(string, tag = "3")]
    response_type: String,
    #[prost(uint32, tag = "4")]
    version: u32,
}
struct NoStarts;
impl RootTransactionStartFactory for NoStarts {
    fn next_root_transaction(&self) -> Result<RootTransactionStart, Status> {
        panic!("external Open must not allocate a transaction root")
    }
}
impl InboundTransactionStartFactory for NoStarts {
    fn next_inbound_transaction(&self, _: &InboundTransactionContext) -> Result<Uuid, Status> {
        panic!("external public Open must not allocate an inbound transaction")
    }
}
struct OriginalAccount {
    calls: Arc<AtomicUsize>,
    state_id: String,
    welcome: Arc<Mutex<Vec<String>>>,
}
#[tonic::async_trait]
impl ag::AccountMethodsTransactionHandler for OriginalAccount {
    async fn open(&self, _: &mut b::Account, _: b::OpenRequest) -> Result<b::OpenResponse, Status> {
        panic!("original taskful constructor must use open_with_tasks")
    }
    async fn open_with_tasks(
        &self,
        state: &mut b::Account,
        request: b::OpenRequest,
        reference: String,
    ) -> Result<reboot::runtime::WriterExecution<b::OpenResponse>, Status> {
        self.calls.fetch_add(1, Ordering::SeqCst);
        assert_eq!(*state, b::Account::default());
        state.customer_name = request.customer_name;
        let task = ag::AccountMethodsTasks::welcome_email(&reference, &b::WelcomeEmailRequest {});
        let wire_id = crate::rbt::v1alpha1::TaskId::decode(
            task.task_id.as_ref().unwrap().encode_to_vec().as_slice(),
        )
        .unwrap();
        let mut execution = reboot::runtime::WriterExecution::new(b::OpenResponse {
            welcome_email_task_id: Some(wire_id),
        });
        execution.task_upserts.push(task);
        Ok(execution)
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
        state: &mut b::Account,
        _: b::WelcomeEmailRequest,
    ) -> Result<b::WelcomeEmailResponse, Status> {
        // Original account_servicer.py:70-96 logs, not external mail.
        let body = welcome_body(state, &self.state_id);
        eprintln!("Sending email:\n====\n{body}\n====");
        self.welcome.lock().unwrap().push(body);
        Ok(b::WelcomeEmailResponse {})
    }
}
// The participant-bound task helper also requires the generated database trait.
// Both generated entry paths share the same handler and ordinary-writer effects.
#[tonic::async_trait]
impl ag::AccountMethodsDatabaseHandler for OriginalAccount {
    async fn open(
        &self,
        state: &mut b::Account,
        request: b::OpenRequest,
    ) -> Result<b::OpenResponse, Status> {
        ag::AccountMethodsTransactionHandler::open(self, state, request).await
    }
    async fn open_with_tasks(
        &self,
        state: &mut b::Account,
        request: b::OpenRequest,
        reference: String,
    ) -> Result<reboot::runtime::WriterExecution<b::OpenResponse>, Status> {
        ag::AccountMethodsTransactionHandler::open_with_tasks(self, state, request, reference).await
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
    wait: reboot::one_shot_tasks::LiveTaskWaitCatalog,
    owners: Vec<Arc<Owner>>,
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
        self.wait.bind_host(cancel.clone())?;
        for owner in &self.owners {
            self.wait.install(owner.tasks().clone(), cancel.clone())?;
        }
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

#[tokio::test]
#[allow(clippy::result_large_err)] // DynamicLocalCatalog's public factory contract returns tonic::Status.
#[ignore = "SOURCE ONLY: parent compile, serializer, native authority and joins required"]
async fn generated_external_constructor_catalog_two_originals_taskful_wait() {
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
    let store = DatabaseActorStore::connect_lazy(&endpoint).unwrap();
    let mut refs = [
        state_ref(ACCOUNT, &format!("source812-{run}-a")),
        state_ref(ACCOUNT, &format!("source812-{run}-b")),
    ];
    refs.sort(); // Actual phase BTree owner order, not creation/random UUID order.
    assert_ne!(refs[0], refs[1]);
    // Actual native capability response only; old native => exact HOLD, never fallback.
    let capability = bounded(direct.get_capabilities(db::DatabaseCapabilitiesRequest {}))
        .await
        .unwrap_or_else(|status| {
            panic!("SOURCE812 HOLD native capability preflight: {status}; no fallback")
        })
        .into_inner();
    assert_eq!(
        capability.atomic_constructor_tasks_protocol, "reboot.atomic-constructor-tasks.v1",
        "SOURCE812 HOLD native atomic constructor protocol"
    );
    assert_eq!(
        capability.atomic_constructor_tasks_version, 1,
        "SOURCE812 HOLD native atomic constructor version"
    );
    assert!(
        capability.atomic_constructor_tasks_enabled,
        "SOURCE812 HOLD native atomic constructor disabled"
    );
    for reference in &refs {
        assert!(load(&mut direct, ACCOUNT, reference).await.is_none());
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
    let welcome: Vec<_> = (0..2)
        .map(|_| Arc::new(Mutex::new(Vec::<String>::new())))
        .collect();
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
            OriginalAccount {
                calls: calls.clone(),
                state_id: reboot::state_ref::StateRef::from_maybe_readable(refs[i].clone())
                    .unwrap()
                    .id(),
                welcome: welcome[i].clone(),
            },
        )
        .with_authorization(authorization.clone())
        .with_external_constructors()
        .with_one_shot_writer_tasks(&refs[i])
        .unwrap();
        // Exactly one committed delivery slot per original owner.
        tasks.set_max_live_deliveries(1).unwrap();
        let configuration = adapter.local_configuration().unwrap();
        assert_eq!(
            configuration.methods,
            std::collections::BTreeSet::from([
                OPEN.to_owned(),
                "bank.v1.AccountMethods.Deposit".to_owned(),
                "bank.v1.AccountMethods.Withdraw".to_owned(),
                "bank.v1.AccountMethods.WelcomeEmail".to_owned(),
            ])
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
    // Original owners exist in memory, but canonical actors/tasks still do not.
    for reference in &refs {
        assert!(load(&mut direct, ACCOUNT, reference).await.is_none());
    }
    assert_no_inventory(&mut direct).await;
    let wait = welcome_wait_catalog(&endpoint);
    let mut host = ApplicationHost::new("source812");
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
    for reference in &refs {
        assert!(load(&mut direct, ACCOUNT, reference).await.is_none());
    }
    assert_no_inventory(&mut direct).await;
    let (entered_tx, entered_rx) = oneshot::channel();
    let (release_tx, release_rx) = oneshot::channel();
    let (stop_tx, stop_rx) = oneshot::channel();
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let public_endpoint = format!("http://{}", listener.local_addr().unwrap());
    let running = host
        .with_host_recovery(phase)
        .with_host_recovery(HoldRecovery {
            wait: wait.clone(),
            owners: owners.clone(),
            entered: Mutex::new(Some(entered_tx)),
            release: Mutex::new(Some(release_rx)),
        })
        .add_public_service(frontdoor)
        .add_public_service(wait.service());
    let mut serving = tokio::spawn(running.serve_with_listener_shutdown(listener, async {
        let _ = stop_rx.await;
    }));
    // HoldRecovery is a genuine later phase, not manufactured Ready.
    let cancel = bounded(entered_rx).await.unwrap();
    for reference in &refs {
        assert!(load(&mut direct, ACCOUNT, reference).await.is_none());
    }
    assert_no_inventory(&mut direct).await;
    assert!(
        tokio::time::timeout(Duration::from_millis(50), cancel.public_ready())
            .await
            .is_err()
    );
    let mut client = bounded(b::account_methods_client::AccountMethodsClient::connect(
        public_endpoint.clone(),
    ))
    .await
    .unwrap();
    assert_eq!(
        bounded(client.open(request(
            &refs[0],
            b::OpenRequest {
                customer_name: "not-admitted".into()
            }
        )))
        .await
        .unwrap_err()
        .code(),
        Code::Unavailable
    );
    assert_eq!(calls.load(Ordering::SeqCst), 0);
    assert!(
        !observations
            .events()
            .iter()
            .any(|e| matches!(e.method, "Store" | "CreateActor" | "CreateActorWithTasks"))
    );
    release_tx.send(()).unwrap();
    bounded(cancel.public_ready()).await.unwrap();
    for i in 0..2 {
        destinations[i]
            .binding()
            .require_host_ready(owners[i].configuration())
            .unwrap();
    }
    let channel = bounded(
        tonic::transport::Endpoint::from_shared(public_endpoint)
            .unwrap()
            .connect(),
    )
    .await
    .unwrap();
    let mut pending = vec![];
    let mut states = vec![];
    let mut constructor_receipts = vec![];
    for i in 0..2 {
        let key = Uuid::new_v4();
        let name = format!("source812-original-{i}");
        let mut open = request(
            &refs[i],
            b::OpenRequest {
                customer_name: name.clone(),
            },
        );
        open.metadata_mut()
            .insert("x-reboot-idempotency-key", key.to_string().parse().unwrap());
        let response = bounded(client.open(open))
            .await
            .unwrap_or_else(|status| {
                panic!("SOURCE812 HOLD actual public taskful Open: {status}; no fallback")
            })
            .into_inner();
        let id = db::TaskId::decode(
            response
                .welcome_email_task_id
                .as_ref()
                .expect("actual public Open task ID")
                .encode_to_vec()
                .as_slice(),
        )
        .unwrap();
        let creates: Vec<_> = observations
            .events()
            .into_iter()
            .filter(|e| e.method == "CreateActorWithTasks")
            .collect();
        let create_event = creates
            .iter()
            .find(|e| {
                db::CreateActorRequest::decode(e.request.as_slice())
                    .unwrap()
                    .actor
                    .as_ref()
                    .unwrap()
                    .state_ref
                    == refs[i]
            })
            .unwrap();
        assert!(create_event.code.is_none());
        db::CreateActorResponse::decode(create_event.response.as_ref().unwrap().as_slice())
            .unwrap();
        let create = db::CreateActorRequest::decode(create_event.request.as_slice()).unwrap();
        assert!(create.sync);
        assert_eq!(create.task_upserts.len(), 1);
        let task = create.task_upserts[0].clone();
        assert_eq!(task.task_id.as_ref(), Some(&id));
        assert_eq!(task, ag_task_shape(&task, &refs[i]));
        let actor = create.actor.as_ref().unwrap();
        assert_eq!(actor.state_type, ACCOUNT);
        assert_eq!(actor.state_ref, refs[i]);
        let expected = b::Account {
            customer_name: name,
            balance: 0,
        }
        .encode_to_vec();
        assert_eq!(actor.state.as_ref(), Some(&expected));
        let receipt = create.idempotent_mutation.as_ref().unwrap();
        assert_eq!(receipt.key, key.as_bytes());
        assert_eq!(receipt.state_type, ACCOUNT);
        assert_eq!(receipt.task_ids, vec![id.clone()]);
        assert_eq!(
            receipt.request_fingerprint,
            Some(expected_open_scheduling_fingerprint(i))
        );
        assert!(receipt.workflow_id.is_none());
        assert!(receipt.workflow_iteration.is_none());
        constructor_receipts.push(receipt.clone());
        let checkpoint = Checkpoint::decode(receipt.response.as_slice()).unwrap();
        assert_eq!(checkpoint.response, response.encode_to_vec());
        assert_eq!(checkpoint.tasks, vec![task.clone()]);
        assert_eq!(
            checkpoint.response_type,
            "type.googleapis.com/bank.v1.OpenResponse"
        );
        assert_eq!(checkpoint.version, 1);
        assert_eq!(id.state_type, ACCOUNT);
        assert_eq!(id.state_ref, refs[i]);
        Uuid::from_slice(&id.task_uuid).unwrap();
        assert_eq!(receipt.state_ref, refs[i]);
        let loaded = load_tasks(&mut direct, std::slice::from_ref(&task)).await;
        assert!(matches!(
            db::task::Status::try_from(loaded[0].status).unwrap(),
            db::task::Status::Pending | db::task::Status::Completed
        ));
        assert_eq!(loaded[0].task_id.as_ref(), Some(&id));
        let result = bounded(ag::AccountMethodsTasksWait::welcome_email(
            channel.clone(),
            Request::new(id),
        ))
        .await
        .unwrap();
        assert_eq!(result, b::WelcomeEmailResponse {});
        let original = b::Account::decode(expected.as_slice()).unwrap();
        let logical_id = reboot::state_ref::StateRef::from_maybe_readable(refs[i].clone())
            .unwrap()
            .id();
        assert_eq!(
            *welcome[i].lock().unwrap(),
            vec![welcome_body(&original, &logical_id)]
        );
        states.push(expected);
        pending.push(task);
    }
    bounded(async {
        while owners.iter().any(|o| o.tasks().completed_operations() != 1) {
            tokio::task::yield_now().await;
        }
    })
    .await;
    assert_eq!(calls.load(Ordering::SeqCst), 2);
    let completed = load_tasks(&mut direct, &pending).await;
    assert_completed(&pending, &completed);
    let events = observations.events();
    assert_eq!(
        events
            .iter()
            .filter(|e| e.method == "CreateActorWithTasks")
            .count(),
        2
    );
    assert!(
        !events
            .iter()
            .any(|e| e.method == "CreateActor" || e.method.starts_with("Transaction")),
        "standalone constructor: no child/root transaction or taskless fallback"
    );
    let completions: Vec<_> = events
        .iter()
        .filter(|e| e.method == "CompleteTask")
        .collect();
    assert_eq!(completions.len(), 2);
    let mut completion_counts = [0usize; 2];
    for event in completions {
        assert!(event.code.is_none());
        let request = db::CompleteTaskRequest::decode(event.request.as_slice()).unwrap();
        assert!(request.sync);
        let task = request.task.as_ref().unwrap();
        assert!(completed.contains(task));
        let i = pending
            .iter()
            .position(|p| p.task_id == task.task_id)
            .unwrap();
        completion_counts[i] += 1;
        let response =
            db::CompleteTaskResponse::decode(event.response.as_ref().unwrap().as_slice()).unwrap();
        assert!(response.completed);
    }
    assert_eq!(
        completion_counts,
        [1, 1],
        "one CompleteTask ACK per actual task ID"
    );
    let task_writes: Vec<_> = events.iter().filter(|e| e.method == "Store").collect();
    assert_eq!(task_writes.len(), 2);
    let mut writer_store_counts = [0usize; 2];
    for event in task_writes {
        assert!(event.code.is_none());
        db::StoreResponse::decode(event.response.as_ref().unwrap().as_slice()).unwrap();
        let write = db::StoreRequest::decode(event.request.as_slice()).unwrap();
        assert!(write.sync && write.transaction.is_none() && write.task_upserts.is_empty());
        assert!(write.colocated_upserts.is_empty());
        assert!(write.ensure_state_types_created.is_empty());
        assert_eq!(write.actor_upserts.len(), 1);
        assert_eq!(write.actor_upserts[0].state_type, ACCOUNT);
        let i = refs
            .iter()
            .position(|r| r == &write.actor_upserts[0].state_ref)
            .unwrap();
        writer_store_counts[i] += 1;
        assert_eq!(write.actor_upserts[0].state.as_ref(), Some(&states[i]));
        let receipt = write
            .idempotent_mutation
            .as_ref()
            .expect("generated writer checkpoint");
        assert_eq!(receipt.state_ref, refs[i]);
        assert_eq!(receipt.state_type, ACCOUNT);
        assert_eq!(
            receipt.key,
            reboot::runtime::writer_task_key(
                pending[i].task_id.as_ref().unwrap(),
                "bank.v1.AccountMethods.WelcomeEmail",
            )
            .unwrap()
            .as_bytes()
            .to_vec()
        );
        assert_eq!(
            receipt.request_fingerprint,
            Some(reboot::runtime::request_fingerprint(
                "bank.v1.AccountMethods.WelcomeEmail",
                &b::WelcomeEmailRequest {},
            ))
        );
        assert!(receipt.task_ids.is_empty());
        assert!(receipt.workflow_id.is_none());
        assert!(receipt.workflow_iteration.is_none());
        let Some(db::task::ResponseOrError::Response(response)) = &completed[i].response_or_error
        else {
            panic!("actual canonical Completed response required");
        };
        assert_eq!(receipt.response, response.value);
        b::WelcomeEmailResponse::decode(receipt.response.as_slice()).unwrap();
        // Canonical receipt, not merely a proxy echo.
        assert!(
            recover(&mut direct)
                .await
                .iter()
                .flat_map(|p| &p.idempotent_mutations)
                .any(|m| m == receipt)
        );
    }
    assert_eq!(
        writer_store_counts,
        [1, 1],
        "one writer Store per original owner"
    );
    stop_tx.send(()).unwrap();
    bounded(&mut serving).await.unwrap().unwrap();
    assert!(cancel.public_ready().await.is_err());
    assert_empty_transactions(&scan(&mut direct).await);
    assert_eq!(load_tasks(&mut direct, &pending).await, completed);
    for i in 0..2 {
        assert_eq!(
            load(&mut direct, ACCOUNT, &refs[i]).await,
            Some(states[i].clone())
        );
    }
    proxy_guard.stop.take().unwrap().send(()).unwrap();
    bounded(&mut proxy_guard.server).await.unwrap().unwrap();
    // Final native authority readback after BOTH host and proxy joins.
    // The settled proxy trace is authoritative only after BOTH joins.
    let final_events = observations.events();
    for (method, expected) in [
        ("CreateActorWithTasks", 2),
        ("Store", 2),
        ("CompleteTask", 2),
    ] {
        let writes: Vec<_> = final_events.iter().filter(|e| e.method == method).collect();
        assert_eq!(writes.len(), expected, "final exact write count: {method}");
        assert_eq!(
            writes
                .iter()
                .filter(|e| e.code.is_none() && e.response.is_some())
                .count(),
            expected,
            "final exact successful ACK count: {method}"
        );
    }
    assert!(
        !final_events
            .iter()
            .any(|e| e.method == "CreateActor" || e.method.starts_with("Transaction")),
        "no late taskless constructor or transaction writes"
    );
    // Same exact mutating records, not just equal totals: no late replacement.
    let write_trace = |trace: &[Event]| -> Vec<_> {
        trace
            .iter()
            .filter(|e| {
                matches!(e.method, "CreateActorWithTasks" | "Store" | "CompleteTask")
                    || e.method.starts_with("Transaction")
                    || e.method == "CreateActor"
            })
            .map(|e| (e.method, e.request.clone(), e.response.clone(), e.code))
            .collect()
    };
    assert_eq!(write_trace(&final_events), write_trace(&events));
    let capability_acks: Vec<_> = final_events
        .iter()
        .filter(|e| e.method == "GetCapabilities")
        .collect();
    assert!(
        !capability_acks.is_empty(),
        "actual proxied runtime capability preflight required"
    );
    for event in capability_acks {
        // Observations::record represents gRPC status 0 as no error, not Some(Ok).
        assert_eq!(event.code.map(|code| code as i32).unwrap_or(0), 0);
        db::DatabaseCapabilitiesRequest::decode(event.request.as_slice()).unwrap();
        let capability =
            db::DatabaseCapabilitiesResponse::decode(event.response.as_ref().unwrap().as_slice())
                .unwrap();
        assert_eq!(
            capability.atomic_constructor_tasks_protocol,
            "reboot.atomic-constructor-tasks.v1"
        );
        assert_eq!(capability.atomic_constructor_tasks_version, 1);
        assert!(capability.atomic_constructor_tasks_enabled);
    }
    let canonical_receipts = recover(&mut direct).await;
    assert_eq!(constructor_receipts.len(), 2);
    for (i, observed) in constructor_receipts.iter().enumerate() {
        let matching_owner_key: Vec<_> = canonical_receipts
            .iter()
            .flat_map(|p| &p.idempotent_mutations)
            .filter(|m| m.state_type == ACCOUNT && m.state_ref == refs[i] && m.key == observed.key)
            .collect();
        assert_eq!(
            matching_owner_key.len(),
            1,
            "exactly one canonical constructor receipt per owner/key"
        );
        assert_eq!(
            matching_owner_key[0], observed,
            "full observed/canonical constructor receipt equality"
        );
    }
    assert_eq!(load_tasks(&mut direct, &pending).await, completed);
    for i in 0..2 {
        assert_eq!(
            load(&mut direct, ACCOUNT, &refs[i]).await,
            Some(states[i].clone())
        );
    }
    assert!(
        scan(&mut direct)
            .await
            .iter()
            .all(|p| p.pending_tasks.is_empty())
    );
    assert_empty_transactions(&scan(&mut direct).await);
    println!(
        "SOURCE812_NATIVE_EXTERNAL_CONSTRUCTOR_CATALOG_TWO_ORIGINALS_TASKFUL_WAIT_COMPLETED_JOINED"
    );
}
fn welcome_body(state: &b::Account, state_id: &str) -> String {
    format!(
        "Hello {},\n\nWe are delighted to welcome you as a customer.\nYour new account has been opened, and has ID '{}'.\n\nBest regards,\nYour Bank",
        state.customer_name, state_id
    )
}
async fn load_tasks(
    client: &mut db::database_client::DatabaseClient<tonic::transport::Channel>,
    tasks: &[db::Task],
) -> Vec<db::Task> {
    let loaded = bounded(client.load(db::LoadRequest {
        actors: vec![],
        task_ids: tasks.iter().map(|t| t.task_id.clone().unwrap()).collect(),
    }))
    .await
    .unwrap()
    .into_inner();
    assert_eq!(loaded.tasks.len(), tasks.len());
    tasks
        .iter()
        .map(|expected| {
            loaded
                .tasks
                .iter()
                .find(|t| t.task_id == expected.task_id)
                .expect("exact canonical task")
                .clone()
        })
        .collect()
}
fn assert_completed(pending: &[db::Task], completed: &[db::Task]) {
    assert_eq!(pending.len(), completed.len());
    for (before, after) in pending.iter().zip(completed) {
        assert_eq!(after.status, db::task::Status::Completed as i32);
        let Some(db::task::ResponseOrError::Response(response)) = &after.response_or_error else {
            panic!("actual generated successful terminal required");
        };
        assert_eq!(
            response.type_url,
            "type.googleapis.com/bank.v1.WelcomeEmailResponse"
        );
        b::WelcomeEmailResponse::decode(response.value.as_slice()).unwrap();
        let mut identity = after.clone();
        identity.status = before.status;
        identity.response_or_error = None;
        assert_eq!(
            &identity, before,
            "only terminal/status changed, not request/schedule/iteration/ID"
        );
    }
}
fn welcome_wait_catalog(endpoint: &str) -> reboot::one_shot_tasks::LiveTaskWaitCatalog {
    use reboot::placement_proto as p;
    let placement = reboot::legacy_placement::PlanOnlyLegacyPlacement::new();
    placement
        .install(p::ListenForPlanResponse {
            plan: Some(p::Plan {
                version: 1,
                applications: vec![p::plan::Application {
                    id: "source812".into(),
                    services: vec![],
                    shards: vec![p::plan::application::Shard {
                        id: "s000000000".into(),
                        range: Some(p::plan::application::shard::KeyRange { first_key: vec![] }),
                        server_id: "source812-server".into(),
                        replica_index: 0,
                    }],
                }],
            }),
            servers: vec![p::Server {
                id: "source812-server".into(),
                application_id: "source812".into(),
                address: Some(p::server::Address {
                    host: "localhost".into(),
                    port: 5001,
                }),
                ..Default::default()
            }],
        })
        .unwrap();
    reboot::one_shot_tasks::LiveTaskWaitCatalog::new(
        endpoint.into(),
        ACCOUNT.into(),
        2,
        reboot::legacy_placement::LegacyApplicationId::new("source812").unwrap(),
        "source812-server".into(),
        placement,
        AuthorizationPolicy::permissive_for_development(), // Explicit finite fixture result policy.
    )
    .unwrap()
}

// Compare generated schedule/type/request shape while preserving the ACTUAL ID.
fn ag_task_shape(actual: &db::Task, reference: &str) -> db::Task {
    let mut generated =
        ag::AccountMethodsTasks::welcome_email(reference, &b::WelcomeEmailRequest {});
    generated.task_id = actual.task_id.clone();
    generated
}
fn assert_empty_transactions(pages: &[db::RecoverResponse]) {
    assert!(pages.iter().all(|p| p.participant_transactions.is_empty() && p.transaction_coordinators.is_empty()));
}

// Exact fixed-request vectors derived from actual 3244ea1b runtime.rs:36,2667-2673
// and ordinary_writer_store.rs:17-24,511,583-603. Constructor scheduling uses
// the ORDINARY-WRITER scheduling domain, not a guessed constructor domain.
// OpenRequest is protobuf field 1 customer_name; preserve SOURCE812 request names.
fn expected_open_scheduling_fingerprint(i: usize) -> Vec<u8> {
    let (inner, outer): (&[u8], &[u8]) = match i {
        0 => (
            &[
                28, 1, 244, 138, 158, 182, 253, 28, 230, 16, 255, 15, 38, 139, 102, 43, 67, 232,
                172, 80, 107, 74, 184, 183, 76, 63, 25, 55, 29, 67, 100, 110,
            ],
            &[
                206, 111, 165, 69, 75, 78, 124, 174, 213, 126, 97, 33, 233, 223, 116, 148, 66, 219,
                245, 53, 107, 163, 43, 81, 159, 153, 186, 220, 160, 175, 19, 9,
            ],
        ),
        1 => (
            &[
                239, 188, 113, 209, 32, 31, 87, 230, 86, 180, 176, 14, 243, 173, 226, 34, 140, 143,
                39, 232, 177, 212, 70, 239, 78, 59, 206, 10, 220, 18, 203, 14,
            ],
            &[
                177, 58, 250, 59, 117, 35, 222, 98, 13, 44, 246, 180, 225, 107, 1, 66, 179, 132,
                119, 33, 216, 24, 71, 130, 128, 106, 143, 230, 222, 139, 242, 14,
            ],
        ),
        _ => panic!("exactly two original requests"),
    };
    assert_eq!(
        reboot::runtime::request_fingerprint(
            OPEN,
            &b::OpenRequest {
                customer_name: format!("source812-original-{i}"),
            }
        ),
        inner
    );
    let mut expected = b"reboot.ordinary-writer.scheduling-checkpoint.v1\0".to_vec();
    expected.extend_from_slice(outer);
    expected
}
