// SOURCE candidate, not native/Bank certification. Included inside the existing
// downstream protoc fixture. Actual original Account client + configured receiver,
// actual admitted root, real participant slots/gates/Watch. Database is ACK-only.
use super::*;
use crate::{account_generated as account, bank::v1 as bank};
use bank::account_methods_server::AccountMethods;
use reboot::durable_coordinator::{
    DurableRootCoordinator, ExactParticipantResolver, InProcessParticipantEndpoint,
    ParticipantTarget, TonicCoordinatorSidecar,
};
use reboot::durable_participant::{
    DurableActorParticipant, DurableActorParticipantHost, ParticipantSidecar,
    TonicParticipantSidecar,
};
use reboot::registered_local::GeneratedLocalTransactionAdapter;

struct AbortServer<T>(tokio::task::JoinHandle<T>);
impl<T> Drop for AbortServer<T> {
    fn drop(&mut self) {
        self.0.abort();
    }
}
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Case {
    Commit,
    EmptyCommit,
    Abort,
    Deny,
    ExistingDenied,
    ExistingEmpty,
    UnsetLoad,
    MissingTicket,
    Malformed,
    WrongBody,
    WrongMethod,
    MissingMetadata,
    DefaultRefusal,
    IdempotencyMetadata,
    TaskEffects,
    IdempotentEffects,
    RevokedAfterAdmission,
    PrepareUncertainty,
}
tokio::task_local! { static REVOKE: Arc<std::sync::Mutex<Option<tokio::sync::oneshot::Sender<()>>>>; }
pub(crate) async fn after_admission(binding: &reboot::registered_local::RegisteredAdapterBinding) {
    if let Ok(stop) = REVOKE.try_with(Arc::clone) {
        let sender = stop.lock().unwrap().take();
        sender.unwrap().send(()).unwrap();
        binding.host_revoked().await;
    }
}
struct AccountHandler {
    calls: Arc<AtomicUsize>,
    case: Case,
}
#[tonic::async_trait]
impl account::AccountMethodsTransactionHandler for AccountHandler {
    async fn open(
        &self,
        state: &mut bank::Account,
        request: bank::OpenRequest,
    ) -> Result<bank::OpenResponse, tonic::Status> {
        self.calls.fetch_add(1, Ordering::SeqCst);
        state.customer_name = request.customer_name;
        Ok(bank::OpenResponse::default())
    }
    async fn open_constructor_child(
        &self,
        context: &reboot::runtime::TransactionContext,
        state: &mut bank::Account,
        request: bank::OpenRequest,
    ) -> Result<reboot::runtime::TransactionExecution<bank::OpenResponse>, tonic::Status> {
        assert_eq!(
            context.transaction_ids(),
            &[Uuid::from_u128(901), Uuid::from_u128(902)]
        );
        assert_eq!(
            context.transaction_coordinator_state_type(),
            "tests.reboot.protoc.TransactionCounter"
        );
        assert_eq!(
            context.transaction_coordinator_state_ref(),
            "constructor-parent"
        );
        assert!(context.headers().bearer_token.is_none());
        let mut result =
            reboot::runtime::TransactionExecution::new(self.open(state, request).await?);
        if self.case == Case::TaskEffects {
            result
                .task_upserts
                .push(account::AccountMethodsTasks::welcome_email(
                    context.headers().state_ref.as_str(),
                    &bank::WelcomeEmailRequest {},
                ));
        }
        if self.case == Case::IdempotentEffects {
            result.idempotent_mutations.push(Default::default());
        }
        Ok(result)
    }
    async fn open_with_tasks(
        &self,
        _: &mut bank::Account,
        _: bank::OpenRequest,
        _: String,
    ) -> Result<reboot::runtime::WriterExecution<bank::OpenResponse>, tonic::Status> {
        panic!("child must not invoke external scheduling hook")
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
        panic!("wrong ticket must precede effects")
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
        panic!("taskless child cannot dispatch")
    }
}
struct Starts;
impl reboot::runtime::RootTransactionStartFactory for Starts {
    fn next_root_transaction(
        &self,
    ) -> Result<reboot::runtime::RootTransactionStart, tonic::Status> {
        Ok(reboot::runtime::RootTransactionStart {
            transaction_id: Uuid::from_u128(901),
            timestamp: Default::default(),
        })
    }
}
impl reboot::runtime::InboundTransactionStartFactory for Starts {
    fn next_inbound_transaction(
        &self,
        _: &reboot::runtime::InboundTransactionContext,
    ) -> Result<Uuid, tonic::Status> {
        Ok(Uuid::from_u128(902))
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
#[derive(Default)]
struct Watch {
    outcome: std::sync::Mutex<Option<bool>>,
    changed: tokio::sync::Notify,
}
impl Watch {
    fn terminal(&self, aborted: bool) {
        *self.outcome.lock().unwrap() = Some(aborted);
        self.changed.notify_waiters();
    }
}
impl reboot::legacy_coordinator::CoordinatorWatchEndpoint for Watch {
    fn watch(
        &self,
        _: reboot::database_proto::WatchRequest,
    ) -> reboot::legacy_coordinator::CoordinatorWatchFuture<'_, reboot::database_proto::WatchResponse>
    {
        Box::pin(async move {
            loop {
                let changed = self.changed.notified();
                if let Some(aborted) = *self.outcome.lock().unwrap() {
                    return Ok(reboot::database_proto::WatchResponse { aborted });
                }
                changed.await;
            }
        })
    }
}
// Delegates Load/Prepare to the actual test Database. The uncertainty case parks
// AFTER its ACK; it does not fabricate a successful constructor handler outcome.
struct Sidecar {
    inner: TonicParticipantSidecar,
    child: String,
    case: Case,
    prepared: tokio::sync::Semaphore,
    aborts: AtomicUsize,
    loads: Arc<AtomicUsize>,
}
impl ParticipantSidecar for Sidecar {
    fn database_endpoint(&self) -> Option<&str> {
        self.inner.database_endpoint()
    }
    fn load(
        &self,
        r: reboot::database_proto::LoadRequest,
    ) -> Pin<
        Box<
            dyn Future<Output = Result<reboot::database_proto::LoadResponse, tonic::Status>>
                + Send
                + '_,
        >,
    > {
        Box::pin(async move {
            if r.actors
                .iter()
                .any(|actor| actor.state_type == "bank.v1.Account" && actor.state_ref == self.child)
            {
                self.loads.fetch_add(1, Ordering::SeqCst);
            }
            let mut response = self.inner.load(r).await?;
            // EXPLICIT MODEL ADAPTATION: the old shared test Database represents
            // an absent actor as exact Actor{state:None}; canonical native Load
            // omits it. Convert only this child's exact absent fake record to
            // zero actors. This is NOT native absence evidence, and runtime
            // still rejects unset/foreign/multiple actor records unchanged.
            if response.actors.len() == 1
                && response.tasks.is_empty()
                && response.actors[0].state_type == "bank.v1.Account"
                && response.actors[0].state_ref == self.child
                && response.actors[0].state.is_none()
                && self.case != Case::UnsetLoad
            {
                response.actors.clear();
            }
            Ok(response)
        })
    }
    fn prepare(
        &self,
        r: reboot::database_proto::TransactionParticipantPrepareRequest,
    ) -> Pin<
        Box<
            dyn Future<
                    Output = Result<
                        reboot::database_proto::TransactionParticipantPrepareResponse,
                        tonic::Status,
                    >,
                > + Send
                + '_,
        >,
    > {
        Box::pin(async move {
            let park = self.case == Case::PrepareUncertainty && r.state_ref == self.child;
            let response = self.inner.prepare(r).await?;
            if park {
                self.prepared.add_permits(1);
                std::future::pending::<()>().await;
            }
            Ok(response)
        })
    }
    fn commit(
        &self,
        r: reboot::database_proto::TransactionParticipantCommitRequest,
    ) -> Pin<
        Box<
            dyn Future<
                    Output = Result<
                        reboot::database_proto::TransactionParticipantCommitResponse,
                        tonic::Status,
                    >,
                > + Send
                + '_,
        >,
    > {
        self.inner.commit(r)
    }
    fn abort(
        &self,
        r: reboot::database_proto::TransactionParticipantAbortRequest,
    ) -> Pin<
        Box<
            dyn Future<
                    Output = Result<
                        reboot::database_proto::TransactionParticipantAbortResponse,
                        tonic::Status,
                    >,
                > + Send
                + '_,
        >,
    > {
        if r.state_ref == self.child {
            self.aborts.fetch_add(1, Ordering::SeqCst);
        }
        self.inner.abort(r)
    }
    fn recover(
        &self,
        r: reboot::database_proto::RecoverRequest,
    ) -> Pin<
        Box<
            dyn Future<Output = Result<Vec<reboot::database_proto::RecoverResponse>, tonic::Status>>
                + Send
                + '_,
        >,
    > {
        self.inner.recover(r)
    }
    fn recover_idempotent_mutations(
        &self,
        r: reboot::database_proto::RecoverIdempotentMutationsRequest,
    ) -> Pin<
        Box<
            dyn Future<
                    Output = Result<
                        Vec<reboot::database_proto::RecoverIdempotentMutationsResponse>,
                        tonic::Status,
                    >,
                > + Send
                + '_,
        >,
    > {
        self.inner.recover_idempotent_mutations(r)
    }
}
struct Probe {
    case: Case,
    receiver: Arc<dyn AccountMethods + Send + Sync>,
    default_receiver: Arc<dyn AccountMethods + Send + Sync>,
    target: ParticipantTarget,
    calls: Arc<AtomicUsize>,
    gate: reboot::runtime::ActorGate,
    stop: Arc<std::sync::Mutex<Option<tokio::sync::oneshot::Sender<()>>>>,
    loads: Arc<AtomicUsize>,
}
#[tonic::async_trait]
impl TicketReceiverProbe for Probe {
    async fn run(&self, context: &reboot::runtime::TransactionContext) {
        let method = "bank.v1.AccountMethods.Open";
        let message = bank::OpenRequest {
            customer_name: if matches!(self.case, Case::EmptyCommit | Case::PrepareUncertainty) {
                String::new()
            } else {
                "Constructor child".into()
            },
        };
        if matches!(
            self.case,
            Case::MissingTicket
                | Case::Malformed
                | Case::WrongBody
                | Case::WrongMethod
                | Case::MissingMetadata
                | Case::DefaultRefusal
                | Case::IdempotencyMetadata
        ) {
            let destination = context
                .lookup_registered_local_destination(&self.target, method)
                .unwrap();
            let scope = context
                .begin_generated_outbound_for(
                    &self.target.state_type,
                    &self.target.state_ref,
                    method,
                )
                .unwrap();
            let ticket = context
                .issue_registered_local_ticket(&scope, &destination, method, &message)
                .unwrap();
            let replay = ticket.clone();
            let mut headers = reboot::RebootHeaders::new(&self.target.state_ref);
            headers.transaction_ids = Some(context.transaction_ids().to_vec());
            headers.transaction_coordinator_state_type =
                Some(context.transaction_coordinator_state_type().into());
            headers.transaction_coordinator_state_ref =
                Some(context.transaction_coordinator_state_ref().into());
            headers.coordinator_read_only_aware = context.headers().coordinator_read_only_aware;
            let make = |ticket: reboot::runtime::RegisteredLocalTicket| {
                let mut r = tonic::Request::new(message.clone());
                *r.metadata_mut() = headers.to_metadata().unwrap();
                r.extensions_mut().insert(ticket);
                r
            };
            let mut request = make(ticket);
            if self.case == Case::MissingTicket {
                request
                    .extensions_mut()
                    .remove::<reboot::runtime::RegisteredLocalTicket>();
                replay.discard();
            }
            if self.case == Case::Malformed {
                request
                    .metadata_mut()
                    .insert("x-reboot-transaction-ids", "bad".parse().unwrap());
            }
            if self.case == Case::WrongBody {
                request.get_mut().customer_name.push_str("wrong");
            }
            if self.case == Case::MissingMetadata {
                request.metadata_mut().remove("x-reboot-transaction-ids");
            }
            if self.case == Case::IdempotencyMetadata {
                request.metadata_mut().insert(
                    "x-reboot-idempotency-key",
                    Uuid::new_v4().to_string().parse().unwrap(),
                );
            }
            let error = if self.case == Case::WrongMethod {
                let (metadata, extensions, _) = request.into_parts();
                self.receiver
                    .deposit(tonic::Request::from_parts(
                        metadata,
                        extensions,
                        bank::DepositRequest { amount: 1 },
                    ))
                    .await
                    .unwrap_err()
            } else if self.case == Case::DefaultRefusal {
                self.default_receiver.open(request).await.unwrap_err()
            } else {
                self.receiver.open(request).await.unwrap_err()
            };
            assert!(matches!(
                error.code(),
                tonic::Code::FailedPrecondition | tonic::Code::InvalidArgument
            ));
            assert_eq!(self.calls.load(Ordering::SeqCst), 0);
            assert_eq!(
                self.loads.load(Ordering::SeqCst),
                0,
                "wrong/absent/malformed/unsupported tickets must fail before Load"
            );
            let error = self.receiver.open(make(replay)).await.unwrap_err();
            assert!(
                error.message().contains("consumed"),
                "all rejected tickets must burn: {error}"
            );
            assert_eq!(self.calls.load(Ordering::SeqCst), 0);
            assert_eq!(
                self.loads.load(Ordering::SeqCst),
                0,
                "replayed rejected ticket must not Load"
            );
            return;
        }
        let client = account::AccountMethodsClient::new(LocalOnly);
        let target = account::AccountMethodsTarget::new(&self.target.state_ref);
        let call = client.open(context, &target, message);
        let result = if self.case == Case::RevokedAfterAdmission {
            REVOKE.scope(self.stop.clone(), call).await
        } else {
            call.await
        };
        match self.case {
            Case::RevokedAfterAdmission => {
                assert!(result.is_err());
                assert_eq!(self.calls.load(Ordering::SeqCst), 0);
            }
            Case::Deny | Case::ExistingDenied => {
                assert_eq!(result.unwrap_err().code(), tonic::Code::PermissionDenied);
                assert_eq!(self.calls.load(Ordering::SeqCst), 0);
            }
            Case::UnsetLoad => {
                assert_eq!(result.unwrap_err().code(), tonic::Code::DataLoss);
                assert_eq!(self.calls.load(Ordering::SeqCst), 0);
            }
            Case::ExistingEmpty => {
                assert_eq!(result.unwrap_err().code(), tonic::Code::AlreadyExists);
                assert_eq!(self.calls.load(Ordering::SeqCst), 0);
            }
            Case::TaskEffects | Case::IdempotentEffects => {
                assert_eq!(result.unwrap_err().code(), tonic::Code::FailedPrecondition);
                assert_eq!(self.calls.load(Ordering::SeqCst), 1);
            }
            _ => {
                assert!(
                    result
                        .unwrap()
                        .response()
                        .get_ref()
                        .welcome_email_task_id
                        .is_none()
                );
                assert_eq!(self.calls.load(Ordering::SeqCst), 1);
                let members = context.returned_participants_snapshot();
                assert_eq!(members.len(), 1);
                assert_eq!(members[0].target, self.target);
                assert!(!members[0].read_only);
                // Actual competing admission proves lease survives child response
                // while this actual parent handler is still open.
                assert!(
                    tokio::time::timeout(
                        std::time::Duration::from_millis(20),
                        self.gate.exclusive()
                    )
                    .await
                    .is_err()
                );
            }
        }
    }
}

async fn run(case: Case) {
    use proto::transaction_counter_writes_methods_server::TransactionCounterWritesMethods;
    let (endpoint, database, database_server) = start_database().await;
    let store = DatabaseActorStore::connect_lazy(&endpoint).unwrap();
    let child_ref =
        reboot::state_ref::StateRef::from_id("bank.v1.Account", "constructor-child-explicit")
            .unwrap()
            .to_string();
    let loads = Arc::new(AtomicUsize::new(0));
    let sidecar = Arc::new(Sidecar {
        inner: TonicParticipantSidecar::connect(&endpoint).await.unwrap(),
        child: child_ref.clone(),
        case,
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
    let live = reboot::live_participant::LiveParticipantOwner::new(
        4,
        parent.actor_target(),
        watch.clone(),
    )
    .unwrap();
    let abort = reboot::explicit_abort::ExplicitAbortOwner::new(4).unwrap();
    let trace = Arc::new(std::sync::Mutex::new(Vec::new()));
    let make_parent = || {
        transaction_generated::TransactionCounterWritesMethodsTransactionAdapter::new(
            store.clone(),
            parent.clone(),
            coordinator.clone(),
            Starts,
            TransactionCounter {
                fresh_shared_probe: None,
                trace: trace.clone(),
                fail: false,
                downstream: None,
                final_state_override: None,
            },
        )
        .with_authorization(AuthorizationPolicy::permissive_for_development())
        .with_explicit_abort_owner(abort.clone())
        .with_sequential_root_star()
    };
    let make_child = || {
        account::AccountMethodsTransactionAdapter::new(
            store.clone(),
            child.clone(),
            coordinator.clone(),
            Starts,
            AccountHandler {
                calls: calls.clone(),
                case,
            },
        )
        .with_authorization(AuthorizationPolicy::permissive_for_development())
        .with_live_participant_owner(live.clone())
    };
    let default = make_child();
    assert!(
        !default
            .local_configuration()
            .unwrap()
            .methods
            .contains("bank.v1.AccountMethods.Open")
    );
    let mut receiver = make_child().with_taskless_constructor_children();
    let auth = Arc::new(AuthProbe {
        verifier_calls: Arc::new(AtomicUsize::new(0)),
        authorizer_calls: Arc::new(AtomicUsize::new(0)),
        handler_calls: Arc::new(AtomicUsize::new(0)),
        decision: AuthorizationDecision::PermissionDenied {
            message: "constructor policy denied".into(),
        },
        contexts: Arc::new(std::sync::Mutex::new(Vec::new())),
        snapshots: Arc::new(std::sync::Mutex::new(Vec::new())),
    });
    if matches!(case, Case::Deny | Case::ExistingDenied) {
        receiver = receiver.with_authorization(AuthorizationPolicy::new(
            Some(auth.clone()),
            Some(auth.clone()),
        ));
    }
    if matches!(case, Case::ExistingEmpty | Case::ExistingDenied) {
        let mut request = tonic::Request::new(bank::OpenRequest::default());
        let mut headers = reboot::RebootHeaders::new(&child_ref);
        headers.idempotency_key = Some(Uuid::new_v4());
        *request.metadata_mut() = headers.to_metadata().unwrap();
        default.open(request).await.unwrap();
        assert_eq!(
            store
                .load_for_declaration::<account::AccountDurableState>(&child_ref)
                .await
                .unwrap()
                .unwrap()
                .encode_to_vec(),
            Vec::<u8>::new()
        );
        calls.store(0, Ordering::SeqCst);
    }
    // Existing root is established through its public ordinary writer. This is
    // not a missing/default Bank expansion and does not seed the child for success.
    let mut seed = tonic::Request::new(proto::TransactionIncrementRequest { amount: 4 });
    let mut headers = reboot::RebootHeaders::new("constructor-parent");
    headers.idempotency_key = Some(Uuid::new_v4());
    *seed.metadata_mut() = headers.to_metadata().unwrap();
    make_parent().apply(seed).await.unwrap();
    let stores_before = database.store_requests().len();
    let creates_before = database.create_requests().len();
    loads.store(0, Ordering::SeqCst);
    let mut application = ApplicationHost::new("constructor-child-source-fixture");
    let (root, _) = application
        .register_local_transaction_service(make_parent())
        .unwrap();
    let (receiver, _) = application
        .register_local_transaction_service(receiver)
        .unwrap();
    let root_recovery = root.explicit_abort_recovery_registration().unwrap();
    let child_recovery = receiver.live_participant_recovery_registration().unwrap();
    let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
    let address = listener.local_addr().unwrap();
    drop(listener);
    let (stop, stopped) = tokio::sync::oneshot::channel();
    let stop = Arc::new(std::sync::Mutex::new(Some(stop)));
    let served = root.clone();
    let mut server = AbortServer(tokio::spawn(async move {
        application.with_host_recovery(root_recovery).with_host_recovery(child_recovery).add_public_service(proto::transaction_counter_writes_methods_server::TransactionCounterWritesMethodsServer::new(served)).serve_with_shutdown(address, async { let _ = stopped.await; }).await
    }));
    tokio::time::timeout(std::time::Duration::from_secs(3), async {
        loop {
            if root.require_local_host_ready().is_ok() {
                break;
            }
            tokio::task::yield_now().await;
        }
    })
    .await
    .unwrap();
    let gate = store.actor_gate("bank.v1.Account", &child_ref);
    let target = receiver.local_configuration().unwrap().target;
    let probe: Arc<dyn TicketReceiverProbe> = Arc::new(Probe {
        case,
        receiver: Arc::new(receiver),
        default_receiver: Arc::new(default),
        target: target.clone(),
        calls: calls.clone(),
        gate: gate.clone(),
        stop: stop.clone(),
        loads: loads.clone(),
    });
    let commit = matches!(
        case,
        Case::Commit | Case::EmptyCommit | Case::PrepareUncertainty
    );
    let mut request = tonic::Request::new(proto::TransactionIncrementRequest {
        amount: if commit { 7313 } else { 7310 },
    });
    *request.metadata_mut() = reboot::RebootHeaders::new("constructor-parent")
        .to_metadata()
        .unwrap();
    let call = TICKET_RECEIVER_PROBE.scope(probe, root.increment(request));
    if case == Case::PrepareUncertainty {
        let mut call = Box::pin(call);
        tokio::select! { result = &mut call => panic!("Prepare park returned: {result:?}"), entered = sidecar.prepared.acquire() => { entered.unwrap().forget(); } }
        drop(call);
        assert!(
            tokio::time::timeout(std::time::Duration::from_millis(30), gate.exclusive())
                .await
                .is_err(),
            "actual Prepare attempt retains constructor lease"
        );
        let prepares = database.participant_prepare_requests();
        let staged = prepares.iter().find(|p| p.state_ref == child_ref).unwrap();
        assert_eq!(staged.state, Some(Vec::new()));
        assert!(database.participant_commit_requests().is_empty());
        assert_eq!(
            sidecar.aborts.load(Ordering::SeqCst),
            0,
            "transport cancellation must not synthesize native constructor Abort"
        );
        if let Some(stop) = stop.lock().unwrap().take() {
            let _ = stop.send(());
        }
        // Retained uncertainty must not become successful shutdown or new admission.
        let result = tokio::time::timeout(std::time::Duration::from_secs(3), &mut server.0).await;
        assert!(!matches!(result, Ok(Ok(Ok(())))));
        if result.is_err() {
            server.0.abort();
            let _ = (&mut server.0).await;
        }
    } else if case == Case::RevokedAfterAdmission {
        assert!(
            tokio::time::timeout(std::time::Duration::from_secs(5), call)
                .await
                .unwrap()
                .is_err()
        );
        assert_eq!(calls.load(Ordering::SeqCst), 0);
        assert!(database.participant_prepare_requests().is_empty());
        assert!(database.participant_commit_requests().is_empty());
        assert_eq!(database.store_requests().len(), stores_before);
        assert_eq!(database.create_requests().len(), creates_before);
        watch.terminal(true);
        if tokio::time::timeout(std::time::Duration::from_secs(3), &mut server.0)
            .await
            .is_err()
        {
            server.0.abort();
            let _ = (&mut server.0).await;
        }
    } else {
        let result = tokio::time::timeout(std::time::Duration::from_secs(5), call)
            .await
            .unwrap();
        if commit {
            assert_eq!(result.unwrap().get_ref().value, 5);
            let prepares = database.participant_prepare_requests();
            let staged = prepares.iter().find(|p| p.state_ref == child_ref).unwrap();
            let expected = bank::Account {
                customer_name: if case == Case::EmptyCommit {
                    String::new()
                } else {
                    "Constructor child".into()
                },
                balance: 0,
            }
            .encode_to_vec();
            assert_eq!(staged.state, Some(expected));
            let transaction = staged
                .transaction
                .as_ref()
                .expect("real constructor Prepare carries transaction");
            assert_eq!(
                transaction.transaction_ids,
                vec![
                    Uuid::from_u128(901).as_bytes().to_vec(),
                    Uuid::from_u128(902).as_bytes().to_vec()
                ]
            );
            assert_eq!(
                transaction.coordinator_state_type,
                "tests.reboot.protoc.TransactionCounter"
            );
            assert_eq!(transaction.coordinator_state_ref, "constructor-parent");
            assert!(staged.task_upserts.is_empty());
            assert_eq!(database.participant_commit_requests().len(), 2);
            watch.terminal(false);
        } else {
            assert!(result.is_err());
            assert!(database.participant_prepare_requests().is_empty());
            assert!(database.participant_commit_requests().is_empty());
            watch.terminal(true);
        }
        live.wait_for_idle_for_test(std::time::Duration::from_secs(2))
            .await
            .unwrap();
        let lease = tokio::time::timeout(std::time::Duration::from_secs(2), gate.exclusive())
            .await
            .unwrap();
        drop(lease);
        assert_eq!(
            sidecar.aborts.load(Ordering::SeqCst),
            0,
            "pre-Prepare constructor Abort is exact local discard, not actor-only native Abort"
        );
        assert_eq!(
            database.store_requests().len(),
            stores_before,
            "child cannot independently Store"
        );
        assert_eq!(
            database.create_requests().len(),
            creates_before,
            "child cannot independently CreateActor"
        );
        if matches!(case, Case::Deny | Case::ExistingDenied) {
            assert_eq!(auth.verifier_calls.load(Ordering::SeqCst), 1);
            assert_eq!(auth.authorizer_calls.load(Ordering::SeqCst), 1);
            let snapshots = auth.snapshots.lock().unwrap();
            assert_eq!(snapshots.len(), 1);
            assert_eq!(
                snapshots[0].0,
                if case == Case::ExistingDenied {
                    Some(Vec::new())
                } else {
                    None
                }
            );
        }
        if let Some(stop) = stop.lock().unwrap().take() {
            let _ = stop.send(());
        }
        tokio::time::timeout(std::time::Duration::from_secs(3), &mut server.0)
            .await
            .unwrap()
            .unwrap()
            .unwrap();
    }
    database_server.abort();
    let _ = database_server.await;
}
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn original_account_registered_taskless_constructor_child_matrix() {
    for case in [
        Case::Commit,
        Case::EmptyCommit,
        Case::Abort,
        Case::Deny,
        Case::ExistingDenied,
        Case::ExistingEmpty,
        Case::UnsetLoad,
        Case::MissingTicket,
        Case::Malformed,
        Case::WrongBody,
        Case::WrongMethod,
        Case::MissingMetadata,
        Case::DefaultRefusal,
        Case::IdempotencyMetadata,
        Case::TaskEffects,
        Case::IdempotentEffects,
        Case::RevokedAfterAdmission,
        Case::PrepareUncertainty,
    ] {
        tokio::time::timeout(std::time::Duration::from_secs(15), run(case))
            .await
            .unwrap_or_else(|_| panic!("constructor case timed out: {case:?}"));
    }
}
