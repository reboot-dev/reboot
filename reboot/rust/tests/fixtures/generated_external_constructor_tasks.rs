// Included AFTER constructor_child.rs (and optionally SOURCE809 sibling).
// SOURCE ONLY: no build/native acceptance. FakeDatabase is an explicit MODEL.
// Full catalog HTTP/2 vertical remains HOLD; this is not response-only Open.
#[derive(prost::Message)]
struct ExternalTaskCheckpoint {
    #[prost(bytes = "vec", tag = "1")]
    response: Vec<u8>,
    #[prost(message, repeated, tag = "2")]
    tasks: Vec<reboot::database_proto::Task>,
    #[prost(string, tag = "3")]
    response_type: String,
    #[prost(uint32, tag = "4")]
    version: u32,
}
struct ExternalTaskHandler {
    calls: Arc<AtomicUsize>,
}
#[tonic::async_trait]
impl account::AccountMethodsTransactionHandler for ExternalTaskHandler {
    async fn open(
        &self,
        _: &mut bank::Account,
        _: bank::OpenRequest,
    ) -> Result<bank::OpenResponse, tonic::Status> {
        panic!("taskful external Open must use scheduling hook")
    }
    async fn open_with_tasks(
        &self,
        state: &mut bank::Account,
        request: bank::OpenRequest,
        state_ref: String,
    ) -> Result<reboot::runtime::WriterExecution<bank::OpenResponse>, tonic::Status> {
        self.calls.fetch_add(1, Ordering::SeqCst);
        state.customer_name = request.customer_name;
        let task =
            account::AccountMethodsTasks::welcome_email(&state_ref, &bank::WelcomeEmailRequest {});
        let bytes = prost::Message::encode_to_vec(task.task_id.as_ref().unwrap());
        let wire_id =
            <crate::rbt::v1alpha1::TaskId as prost::Message>::decode(bytes.as_slice()).unwrap();
        let mut effect = reboot::runtime::WriterExecution::new(bank::OpenResponse {
            welcome_email_task_id: Some(wire_id),
        });
        effect.task_upserts.push(task);
        Ok(effect)
    }
    async fn balance(
        &self,
        state: &bank::Account,
        _: bank::BalanceRequest,
    ) -> Result<bank::BalanceResponse, tonic::Status> {
        Ok(bank::BalanceResponse {
            balance: state.balance,
        })
    }
    async fn deposit(
        &self,
        _: &mut bank::Account,
        _: bank::DepositRequest,
    ) -> Result<bank::DepositResponse, tonic::Status> {
        panic!("not used")
    }
    async fn withdraw(
        &self,
        _: &mut bank::Account,
        _: bank::WithdrawRequest,
    ) -> Result<bank::WithdrawResponse, account::AccountMethodsWithdrawError> {
        panic!("not used")
    }
    async fn welcome_email(
        &self,
        _: &mut bank::Account,
        _: bank::WelcomeEmailRequest,
    ) -> Result<bank::WelcomeEmailResponse, tonic::Status> {
        // Deliberate delivery barrier BEFORE effects, keeping canonical Pending
        // stable for readback; real task supervisor owns/cancels this future.
        std::future::pending().await
    }
}
#[tonic::async_trait]
impl account::AccountMethodsDatabaseHandler for ExternalTaskHandler {
    async fn open(
        &self,
        state: &mut bank::Account,
        request: bank::OpenRequest,
    ) -> Result<bank::OpenResponse, tonic::Status> {
        account::AccountMethodsTransactionHandler::open(self, state, request).await
    }
    async fn open_with_tasks(
        &self,
        state: &mut bank::Account,
        request: bank::OpenRequest,
        reference: String,
    ) -> Result<reboot::runtime::WriterExecution<bank::OpenResponse>, tonic::Status> {
        account::AccountMethodsTransactionHandler::open_with_tasks(self, state, request, reference)
            .await
    }
    async fn balance(
        &self,
        state: &bank::Account,
        request: bank::BalanceRequest,
    ) -> Result<bank::BalanceResponse, tonic::Status> {
        account::AccountMethodsTransactionHandler::balance(self, state, request).await
    }
    async fn deposit(
        &self,
        state: &mut bank::Account,
        request: bank::DepositRequest,
    ) -> Result<bank::DepositResponse, tonic::Status> {
        account::AccountMethodsTransactionHandler::deposit(self, state, request).await
    }
    async fn withdraw(
        &self,
        state: &mut bank::Account,
        request: bank::WithdrawRequest,
    ) -> Result<bank::WithdrawResponse, account::AccountMethodsWithdrawError> {
        account::AccountMethodsTransactionHandler::withdraw(self, state, request).await
    }
    async fn welcome_email(
        &self,
        state: &mut bank::Account,
        request: bank::WelcomeEmailRequest,
    ) -> Result<bank::WelcomeEmailResponse, tonic::Status> {
        account::AccountMethodsTransactionHandler::welcome_email(self, state, request).await
    }
}
// SOURCE811 MODEL consumer; not native certification.
// Hook suggestion: include this file INSIDE the existing constructor_child module
// in protoc_plugin_counter's downstream fixture, after generated_constructor_child.rs.
// Reuses its original generated Account, actual root/ticket machinery and the
// existing atomic-capability FakeDatabase. No regenerated-output substitution.
struct ExternalTaskRouteProbe {
    receiver: Arc<dyn AccountMethods + Send + Sync>,
    target: ParticipantTarget,
    calls: Arc<AtomicUsize>,
    loads: Arc<AtomicUsize>,
}
#[tonic::async_trait]
impl TicketReceiverProbe for ExternalTaskRouteProbe {
    async fn run(&self, context: &reboot::runtime::TransactionContext) {
        let method = "bank.v1.AccountMethods.Open";
        let message = bank::OpenRequest {
            customer_name: "forbidden child".into(),
        };
        let destination = context
            .lookup_registered_local_destination(&self.target, method)
            .unwrap();
        let scope = context
            .begin_generated_outbound_for(&self.target.state_type, &self.target.state_ref, method)
            .unwrap();
        let ticket = context
            .issue_registered_local_ticket(&scope, &destination, method, &message)
            .unwrap();
        let mut headers = reboot::RebootHeaders::new(&self.target.state_ref);
        headers.transaction_ids = Some(context.transaction_ids().to_vec());
        headers.transaction_coordinator_state_type =
            Some(context.transaction_coordinator_state_type().into());
        headers.transaction_coordinator_state_ref =
            Some(context.transaction_coordinator_state_ref().into());
        headers.coordinator_read_only_aware = context.headers().coordinator_read_only_aware;
        let mut request = tonic::Request::new(message);
        *request.metadata_mut() = headers.to_metadata().unwrap();
        request.extensions_mut().insert(ticket);
        let error = self.receiver.open(request).await.unwrap_err();
        assert_eq!(error.code(), tonic::Code::FailedPrecondition);
        assert!(error.message().contains("configured taskless"));
        assert_eq!(self.calls.load(Ordering::SeqCst), 0);
        assert_eq!(self.loads.load(Ordering::SeqCst), 0);
    }
}
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn external_taskful_constructor_and_same_receiver_real_child_refusal() {
    run_external_fixture(|cleanup| async move {
    use proto::transaction_counter_writes_methods_server::TransactionCounterWritesMethods;
    let (endpoint, database, database_server) = start_database().await;
    cleanup.lock().unwrap().database = Some(database_server);
    let store = DatabaseActorStore::connect_lazy(&endpoint).unwrap();
    let child_ref = reboot::state_ref::StateRef::from_id(
        "bank.v1.Account",
        "external-only-taskful-constructor",
    )
    .unwrap()
    .to_string();
    let loads = Arc::new(AtomicUsize::new(0));
    let sidecar = Arc::new(Sidecar {
        inner: TonicParticipantSidecar::connect(&endpoint).await.unwrap(),
        child: child_ref.clone(),
        case: Case::DefaultRefusal,
        prepared: tokio::sync::Semaphore::new(0),
        aborts: AtomicUsize::new(0),
        loads: loads.clone(),
    });
    let parent = DurableActorParticipant::new(
        sidecar.clone(),
        "tests.reboot.protoc.TransactionCounter",
        "constructor-parent",
    );
    let child = DurableActorParticipant::new(sidecar.clone(), "bank.v1.Account", &child_ref);
    let resolver = Arc::new(
        ExactParticipantResolver::new([parent.clone(), child.clone()].into_iter().map(|p| {
            (
                p.actor_target(),
                Arc::new(InProcessParticipantEndpoint::new(
                    DurableActorParticipantHost::new(p),
                )),
            )
        }))
        .unwrap(),
    );
    let coordinator = DurableRootCoordinator::new(
        Arc::new(TonicCoordinatorSidecar::connect(&endpoint).await.unwrap()),
        resolver,
    );
    let calls = Arc::new(AtomicUsize::new(0));
    let watch = Arc::new(Watch::default());
    cleanup.lock().unwrap().watch = Some(watch.clone());
    let live = reboot::live_participant::LiveParticipantOwner::new(
        4,
        parent.actor_target(),
        watch.clone(),
    )
    .unwrap();
    let abort = reboot::explicit_abort::ExplicitAbortOwner::new(4).unwrap();
    let make_child = || {
        account::AccountMethodsTransactionAdapter::new(
            store.clone(),
            child.clone(),
            coordinator.clone(),
            Starts,
            ExternalTaskHandler {
                calls: calls.clone(),
            },
        )
        .with_authorization(AuthorizationPolicy::permissive_for_development())
        .with_live_participant_owner(live.clone())
    };
    let default = make_child();
    let before = default.local_configuration().unwrap();
    assert!(!before.methods.contains("bank.v1.AccountMethods.Open"));
    let (receiver, tasks) = default
        .with_external_constructors()
        .with_one_shot_writer_tasks(&child_ref)
        .unwrap();
    let after = receiver.local_configuration().unwrap();
    assert!(after.methods.contains("bank.v1.AccountMethods.Open"));
    assert!(!Arc::ptr_eq(&before.incarnation, &after.incarnation));
    assert!(Arc::ptr_eq(
        &after.incarnation,
        &receiver.clone().local_configuration().unwrap().incarnation
    ));
    let root = transaction_generated::TransactionCounterWritesMethodsTransactionAdapter::new(
        store.clone(),
        parent.clone(),
        coordinator,
        Starts,
        TransactionCounter {
            fresh_shared_probe: None,
            trace: Arc::new(std::sync::Mutex::new(Vec::new())),
            fail: false,
            downstream: None,
            final_state_override: None,
        },
    )
    .with_authorization(AuthorizationPolicy::permissive_for_development())
    .with_explicit_abort_owner(abort)
    .with_sequential_root_star();
    let mut seed = tonic::Request::new(proto::TransactionIncrementRequest { amount: 4 });
    let mut headers = reboot::RebootHeaders::new("constructor-parent");
    headers.idempotency_key = Some(Uuid::new_v4());
    *seed.metadata_mut() = headers.to_metadata().unwrap();
    tokio::time::timeout(std::time::Duration::from_secs(3), root.apply(seed))
        .await
        .unwrap()
        .unwrap();
    let stores_before = database.store_requests().len();
    let creates_before = database.create_requests().len();
    let mut application = ApplicationHost::new("explicit-external-constructor-model");
    let (root, _) = application
        .register_local_transaction_service(root)
        .unwrap();
    let (receiver, _) = application
        .register_local_transaction_service(receiver)
        .unwrap();
    // A builder after registration must not preserve that registration, even
    // when it leaves the eligible method set unchanged.
    assert!(
        receiver
            .clone()
            .with_external_constructors()
            .validate_local_registration()
            .is_err()
    );
    receiver.validate_local_registration().unwrap();
    let root_recovery = root.explicit_abort_recovery_registration().unwrap();
    let child_recovery = receiver.live_participant_recovery_registration().unwrap();
    let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
    let address = listener.local_addr().unwrap();
    drop(listener);
    let (stop, stopped) = tokio::sync::oneshot::channel();
    cleanup.lock().unwrap().stop = Some(stop);
    let served = root.clone();
    cleanup.lock().unwrap().host = Some(tokio::spawn(async move {
        application.with_host_recovery(root_recovery).with_host_recovery(child_recovery)
            .with_host_recovery(tasks.recovery(reboot::database_proto::RecoverRequest {
                state_tags_by_state_type: [("bank.v1.Account".into(), "Account".into())].into(),
                shard_ids: vec!["s000000000".into()], skip_idempotent_mutations: true,
            }))
            .add_public_service(proto::transaction_counter_writes_methods_server::TransactionCounterWritesMethodsServer::new(served))
            .serve_with_shutdown(address, async { let _ = stopped.await; }).await
            .map_err(|error| error.to_string())
    }));
    tokio::time::timeout(std::time::Duration::from_secs(3), async {
        while root.require_local_host_ready().is_err() {
            tokio::task::yield_now().await;
        }
    })
    .await
    .unwrap();
    // DIRECT generated entry only: catalog HTTP/2 acceptance explicitly HOLD.
    // No ticket or transaction headers. Uses ORIGINAL participant/store/task owner.
    let key = Uuid::new_v4();
    let mut request = tonic::Request::new(bank::OpenRequest {
        customer_name: "Taskful external".into(),
    });
    let mut headers = reboot::RebootHeaders::new(&child_ref);
    headers.idempotency_key = Some(key);
    *request.metadata_mut() = headers.to_metadata().unwrap();
    let response = tokio::time::timeout(std::time::Duration::from_secs(3), receiver.open(request))
        .await
        .unwrap()
        .unwrap()
        .into_inner();
    assert_eq!(calls.load(Ordering::SeqCst), 1);
    let creates = database.create_requests();
    assert_eq!(creates.len(), creates_before + 1);
    let create = creates.last().unwrap();
    assert!(create.sync);
    let actor = create.actor.as_ref().unwrap();
    assert_eq!(actor.state_type, "bank.v1.Account");
    assert_eq!(actor.state_ref, child_ref);
    let canonical = store
        .load_for_declaration::<account::AccountDurableState>(&child_ref)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(canonical.customer_name, "Taskful external");
    assert_eq!(canonical.balance, 0);
    assert_eq!(create.task_upserts.len(), 1);
    let task = &create.task_upserts[0];
    let id = task.task_id.as_ref().unwrap();
    assert_eq!(
        prost::Message::encode_to_vec(response.welcome_email_task_id.as_ref().unwrap()),
        prost::Message::encode_to_vec(id)
    );
    assert_eq!(task.method, "WelcomeEmail");
    assert_eq!(
        task.status,
        reboot::database_proto::task::Status::Pending as i32
    );
    assert!(task.response_or_error.is_none());
    let mutation = create.idempotent_mutation.as_ref().unwrap();
    assert_eq!(mutation.state_type, actor.state_type);
    assert_eq!(mutation.state_ref, child_ref);
    assert_eq!(mutation.key, key.as_bytes());
    assert_eq!(mutation.task_ids, vec![id.clone()]);
    let checkpoint =
        <ExternalTaskCheckpoint as prost::Message>::decode(mutation.response.as_slice()).unwrap();
    assert_eq!(checkpoint.version, 1);
    assert_eq!(
        checkpoint.response_type,
        "type.googleapis.com/bank.v1.OpenResponse"
    );
    assert_eq!(
        checkpoint.response,
        prost::Message::encode_to_vec(&response)
    );
    assert_eq!(checkpoint.tasks, create.task_upserts);
    // Real canonical task Load, not just inspecting the recorder payload.
    let mut wire =
        reboot::database_proto::database_client::DatabaseClient::connect(endpoint.clone())
            .await
            .unwrap();
    let loaded = wire
        .load(reboot::database_proto::LoadRequest {
            task_ids: vec![id.clone()],
            ..Default::default()
        })
        .await
        .unwrap()
        .into_inner();
    assert_eq!(loaded.tasks, vec![task.clone()]);
    let mut receipts = wire
        .recover_idempotent_mutations(reboot::database_proto::RecoverIdempotentMutationsRequest {
            state_type: "bank.v1.Account".into(),
            state_ref: child_ref.clone(),
            idempotency_key: Some(key.as_bytes().to_vec()),
            ..Default::default()
        })
        .await
        .unwrap()
        .into_inner();
    let canonical_receipts = receipts.message().await.unwrap().unwrap();
    assert_eq!(
        canonical_receipts.idempotent_mutations,
        vec![mutation.clone()]
    );
    assert!(receipts.message().await.unwrap().is_none());
    assert_eq!(database.store_requests().len(), stores_before);
    // Shared FakeDatabase exposes successful create/store recorders downstream,
    // but its attempted-RPC counters are cfg(test) pub(crate), NOT accessible here.
    // Nonempty task_upserts require CreateActorWithTasks in that real MODEL.
    calls.store(0, Ordering::SeqCst);
    loads.store(0, Ordering::SeqCst);
    let probe = Arc::new(ExternalTaskRouteProbe {
        receiver: Arc::new(receiver),
        target: child.actor_target(),
        calls,
        loads,
    });
    let mut request = tonic::Request::new(proto::TransactionIncrementRequest { amount: 7310 });
    *request.metadata_mut() = reboot::RebootHeaders::new("constructor-parent")
        .to_metadata()
        .unwrap();
    assert!(
        tokio::time::timeout(
            std::time::Duration::from_secs(3),
            TICKET_RECEIVER_PROBE.scope(probe, root.increment(request))
        )
        .await
        .unwrap()
        .is_err()
    );
    assert!(database.participant_prepare_requests().is_empty());
    assert!(database.participant_commit_requests().is_empty());
    assert_eq!(database.store_requests().len(), stores_before);
    assert_eq!(database.create_requests().len(), creates_before + 1);
    }).await;
}
