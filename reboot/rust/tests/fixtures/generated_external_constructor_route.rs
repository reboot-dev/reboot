// SOURCE816: test-local custody only. No runtime policy or owner substitution.
// Both included siblings share this helper inside constructor_child.
#[derive(Default)]
struct ExternalFixtureCleanup {
    database: Option<tokio::task::JoinHandle<()>>,
    host: Option<tokio::task::JoinHandle<Result<(), String>>>,
    stop: Option<tokio::sync::oneshot::Sender<()>>,
    watch: Option<Arc<Watch>>,
}
async fn run_external_fixture<F, Fut>(body: F)
where
    F: FnOnce(Arc<std::sync::Mutex<ExternalFixtureCleanup>>) -> Fut,
    Fut: std::future::Future<Output = ()> + Send + 'static,
{
    let cleanup = Arc::new(std::sync::Mutex::new(ExternalFixtureCleanup::default()));
    // Spawn captures panics without a futures dependency. The outer test owns
    // cleanup and the body handle; it never propagates a failure before draining.
    let mut body = tokio::spawn(body(cleanup.clone()));
    let primary = tokio::time::timeout(std::time::Duration::from_secs(20), &mut body).await;
    if primary.is_err() {
        body.abort();
        let _ = body.await;
    }
    let ExternalFixtureCleanup {
        database,
        host,
        stop,
        watch,
    } = std::mem::take(&mut *cleanup.lock().unwrap());
    if let Some(stop) = stop {
        let _ = stop.send(());
    }
    if let Some(watch) = watch {
        watch.terminal(true);
    }
    let mut failures = Vec::new();
    if let Some(mut host) = host {
        // Allow the real host's five-second recovery drain to run first.
        match tokio::time::timeout(std::time::Duration::from_secs(8), &mut host).await {
            Ok(Ok(Ok(()))) => {}
            Ok(Ok(Err(error))) => failures.push(format!("host shutdown: {error}")),
            Ok(Err(error)) => failures.push(format!("host join: {error}")),
            Err(_) => {
                host.abort();
                let joined = host.await;
                failures.push(format!(
                    "host shutdown timed out; forced abort joined: {joined:?}"
                ));
            }
        }
    }
    // Always drain the actual database task, even after body or host failure.
    if let Some(database) = database {
        database.abort();
        if let Err(error) = database.await
            && !error.is_cancelled()
        {
            failures.push(format!("database join: {error}"));
        }
    }
    match primary {
        Ok(Ok(())) => assert!(failures.is_empty(), "fixture teardown failed: {failures:?}"),
        Ok(Err(error)) if error.is_panic() => {
            if !failures.is_empty() {
                eprintln!("fixture teardown also failed: {failures:?}");
            }
            std::panic::resume_unwind(error.into_panic());
        }
        Ok(Err(error)) => panic!("fixture body join failed: {error}; teardown: {failures:?}"),
        Err(error) => panic!("fixture body deadline: {error}; teardown: {failures:?}"),
    }
}

// SOURCE809 MODEL consumer; not native certification.
// Hook suggestion: include this file INSIDE the existing constructor_child module
// in protoc_plugin_counter's downstream fixture, after generated_constructor_child.rs.
// Reuses its original generated Account, actual root/ticket machinery and the
// existing atomic-capability FakeDatabase. No regenerated-output substitution.
struct ExternalRouteProbe {
    receiver: Arc<dyn AccountMethods + Send + Sync>,
    target: ParticipantTarget,
    calls: Arc<AtomicUsize>,
    loads: Arc<AtomicUsize>,
}
#[tonic::async_trait]
impl TicketReceiverProbe for ExternalRouteProbe {
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
async fn explicit_external_constructor_route_does_not_authorize_real_child_ticket() {
    run_external_fixture(|cleanup| async move {
    use proto::transaction_counter_writes_methods_server::TransactionCounterWritesMethods;
    let (endpoint, database, database_server) = start_database().await;
    cleanup.lock().unwrap().database = Some(database_server);
    let store = DatabaseActorStore::connect_lazy(&endpoint).unwrap();
    let child_ref =
        reboot::state_ref::StateRef::from_id("bank.v1.Account", "external-only-constructor")
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
            AccountHandler {
                calls: calls.clone(),
                case: Case::DefaultRefusal,
            },
        )
        .with_authorization(AuthorizationPolicy::permissive_for_development())
        .with_live_participant_owner(live.clone())
    };
    let default = make_child();
    let before = default.local_configuration().unwrap();
    assert!(!before.methods.contains("bank.v1.AccountMethods.Open"));
    let receiver = default.with_external_constructors();
    let after = receiver.local_configuration().unwrap();
    assert!(after.methods.contains("bank.v1.AccountMethods.Open"));
    assert!(!Arc::ptr_eq(&before.incarnation, &after.incarnation));
    assert!(Arc::ptr_eq(
        &after.incarnation,
        &receiver.clone().local_configuration().unwrap().incarnation
    ));
    // Real generated external Tonic entry, without transaction metadata/ticket.
    // Response-only compatibility is intentionally tested here; task-bearing
    // canonical creation remains the separate original-owner native vertical.
    let mut request = tonic::Request::new(bank::OpenRequest {
        customer_name: "External public".into(),
    });
    let mut headers = reboot::RebootHeaders::new(&child_ref);
    headers.idempotency_key = Some(Uuid::new_v4());
    *request.metadata_mut() = headers.to_metadata().unwrap();
    assert!(
        receiver
            .open(request)
            .await
            .unwrap()
            .get_ref()
            .welcome_email_task_id
            .is_none()
    );
    assert_eq!(
        store
            .load_for_declaration::<account::AccountDurableState>(&child_ref)
            .await
            .unwrap()
            .unwrap()
            .customer_name,
        "External public"
    );
    assert_eq!(calls.load(Ordering::SeqCst), 1);
    calls.store(0, Ordering::SeqCst);
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
    root.apply(seed).await.unwrap();
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
    loads.store(0, Ordering::SeqCst);
    let probe = Arc::new(ExternalRouteProbe {
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
    assert_eq!(database.create_requests().len(), creates_before);
    }).await;
}
