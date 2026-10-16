//! SOURCE700: admitted generated writer over HTTP/2, storage MODEL only.
//! The original DatabaseAdapter has no GeneratedLocalTransactionService impl.
//! Therefore the catalog must use the original schema's emitted TransactionAdapter
//! (ordinary methods remain DatabaseHandler-shaped, not invented transactions).
//! No constructor, task dispatch, graph adoption or native qualification claim.
use crate::{ResponseOnlyAccount, account_generated as a, bank::v1 as b, semantics};
use prost::Message;
use reboot::{
    application_host::{ApplicationHost, HostRecovery, RecoveryCancellation},
    auth::AuthorizationPolicy,
    database_proto as db,
    durable_coordinator::{
        DurableRootCoordinator, ExactParticipantResolver, InProcessParticipantEndpoint,
        ParticipantResolver, TonicCoordinatorSidecar,
    },
    durable_participant::{
        DurableActorParticipant, DurableActorParticipantHost, TonicParticipantSidecar,
    },
    dynamic_local_catalog::{DynamicLocalCatalog, DynamicLocalOwner},
    registered_local::GeneratedLocalTransactionAdapter,
    runtime::{
        DatabaseActorStore, InboundTransactionContext, InboundTransactionStartFactory,
        RootTransactionStart, RootTransactionStartFactory,
    },
};
use std::{
    future::Future,
    sync::{Arc, Mutex},
    time::Duration,
};
use tokio::{sync::oneshot, task::JoinSet};
use tonic::Status;

async fn bounded<T>(future: impl Future<Output = T>) -> T {
    tokio::time::timeout(Duration::from_secs(10), future)
        .await
        .expect("bounded model test")
}
struct NoStarts;
impl RootTransactionStartFactory for NoStarts {
    fn next_root_transaction(&self) -> Result<RootTransactionStart, Status> {
        panic!("ordinary writer, readers and installation must not allocate a root")
    }
}
impl InboundTransactionStartFactory for NoStarts {
    fn next_inbound_transaction(
        &self,
        _: &InboundTransactionContext,
    ) -> Result<uuid::Uuid, Status> {
        panic!("external ordinary calls must not allocate an inbound transaction")
    }
}
// A real lifecycle barrier: readiness belongs to ApplicationHost, never a test flag.
struct HoldRecovery {
    entered: Mutex<Option<oneshot::Sender<()>>>,
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
            .send(())
            .unwrap();
        tokio::select! {
            result = release => result.map_err(|_| Status::cancelled("recovery release dropped")),
            _ = cancel.cancelled() => Err(Status::cancelled("host cancelled")),
        }
    }
}
type Owner = DynamicLocalOwner<
    TonicParticipantSidecar,
    Arc<ExactParticipantResolver<InProcessParticipantEndpoint<TonicParticipantSidecar>>>,
>;

fn balance_request(reference: &str) -> tonic::Request<b::BalanceRequest> {
    let mut request = tonic::Request::new(b::BalanceRequest {});
    request
        .metadata_mut()
        .insert("x-reboot-state-ref", reference.parse().unwrap());
    request
}

fn deposit_request(reference: &str, key: uuid::Uuid) -> tonic::Request<b::DepositRequest> {
    let mut request = tonic::Request::new(b::DepositRequest { amount: 11 });
    request
        .metadata_mut()
        .insert("x-reboot-state-ref", reference.parse().unwrap());
    request
        .metadata_mut()
        .insert("x-reboot-idempotency-key", key.to_string().parse().unwrap());
    // External ordinary caller: no transaction IDs, local ticket or privileged caller ID.
    request
}

#[tokio::test]
async fn original_generated_catalog_serves_deposit_after_ready_but_excludes_balance() {
    let (database_endpoint, model, database_server) =
        reboot::runtime::test_support::start_database().await;
    let store = DatabaseActorStore::connect_lazy(&database_endpoint).unwrap();
    let reference = reboot::state_ref::StateRef::from_id("bank.v1.Account", "catalog689")
        .unwrap()
        .to_string();
    let sidecar = Arc::new(
        bounded(TonicParticipantSidecar::connect(&database_endpoint))
            .await
            .unwrap(),
    );
    let participant = DurableActorParticipant::new(sidecar, "bank.v1.Account", &reference)
        .with_database_actor_gate(&store);
    let endpoint = Arc::new(InProcessParticipantEndpoint::new(
        DurableActorParticipantHost::new(participant.clone()),
    ));
    let resolver = Arc::new(
        ExactParticipantResolver::new([(participant.actor_target(), endpoint.clone())]).unwrap(),
    );
    let coordinator_sidecar = Arc::new(
        bounded(TonicCoordinatorSidecar::connect(&database_endpoint))
            .await
            .unwrap(),
    );
    let coordinator = DurableRootCoordinator::new(coordinator_sidecar, resolver.clone());
    let (adapter, tasks) = a::AccountMethodsTransactionAdapter::new(
        store.clone(),
        participant.clone(),
        coordinator,
        NoStarts,
        ResponseOnlyAccount {
            logical_state_id: "catalog689".into(),
        },
    )
    .with_authorization(AuthorizationPolicy::permissive_for_development())
    .with_one_shot_writer_tasks(&reference)
    .unwrap();
    // Crucial: derive AFTER every adapter reconfiguration and task attachment.
    let configuration = adapter.local_configuration().unwrap();
    assert_eq!(configuration.target, participant.actor_target());
    assert_eq!(configuration.database_endpoint, store.database_endpoint());
    assert!(
        configuration
            .methods
            .contains("bank.v1.AccountMethods.Deposit")
    );
    assert!(
        !configuration
            .methods
            .contains("bank.v1.AccountMethods.Open")
    );
    assert!(
        !configuration
            .methods
            .contains("bank.v1.AccountMethods.Balance"),
        "reader exclusion is the current generated catalog contract"
    );
    let installation_baseline = model.store_requests().len();
    let owner = DynamicLocalOwner::new(
        configuration.clone(),
        participant.clone(),
        tasks.clone(),
        endpoint.clone(),
        resolver.clone(),
    )
    .unwrap();
    let mut host = ApplicationHost::new("source689-model");
    // Returning a clone preserves the actual generated local_incarnation allocation.
    let captured = adapter.clone();
    // SDK callback requires tonic::Status; boxing would change its contract.
    #[expect(clippy::result_large_err, reason = "catalog factory requires tonic::Status")]
    let catalog = DynamicLocalCatalog::register(
        &mut host,
        configuration.clone(),
        2,
        move |_original: Arc<Owner>| {
            // DynamicLocalOwner::new already validates the private original
            // allocation; this external consumer retains that exact owner Arc.
            Ok(captured.clone())
        },
    )
    .unwrap();
    assert!(catalog.resolve(&configuration.target).await.is_err());
    let destination = catalog.install(owner.clone()).unwrap();
    let (found, installed) = catalog.lookup_installed(&configuration.target).unwrap();
    assert!(Arc::ptr_eq(&found, &owner));
    assert_eq!(
        found.participant().actor_target(),
        participant.actor_target()
    );
    assert!(Arc::ptr_eq(found.custody(), &resolver));
    assert!(Arc::ptr_eq(
        &catalog.resolve(&configuration.target).await.unwrap(),
        &endpoint
    ));
    assert!(destination.binding().same_registration(installed.binding()));
    assert_eq!(
        destination
            .binding()
            .require_host_ready(&configuration)
            .unwrap_err()
            .code(),
        tonic::Code::Unavailable
    );
    assert_eq!(host.registered_transaction_adapter_count(), 1);
    assert_eq!(host.registered_transaction_service_count(), 1);
    assert!(catalog.install(owner.clone()).is_err());
    // Public reconfiguration rotates incarnation even when labels/policy agree.
    let rotated = adapter
        .clone()
        .with_authorization(AuthorizationPolicy::permissive_for_development());
    assert!(
        destination
            .binding()
            .validate_configuration(&rotated.local_configuration().unwrap())
            .is_err()
    );
    let denied_policy = adapter
        .clone()
        .with_authorization(AuthorizationPolicy::default());
    assert!(
        destination
            .binding()
            .validate_configuration(&denied_policy.local_configuration().unwrap())
            .is_err()
    );
    let substitute =
        DurableActorParticipant::new(participant.sidecar(), "bank.v1.Account", &reference)
            .with_database_actor_gate(&store);
    let substitute_endpoint = Arc::new(InProcessParticipantEndpoint::new(
        DurableActorParticipantHost::new(substitute.clone()),
    ));
    assert!(
        DynamicLocalOwner::new(
            configuration.clone(),
            substitute,
            tasks.clone(),
            substitute_endpoint,
            resolver.clone()
        )
        .is_err()
    );
    assert!(
        DynamicLocalOwner::new(
            configuration.clone(),
            participant.clone(),
            tasks,
            Arc::new(InProcessParticipantEndpoint::new(
                DurableActorParticipantHost::new(
                    DurableActorParticipant::new(
                        participant.sidecar(),
                        "bank.v1.Account",
                        &reference
                    )
                    .with_database_actor_gate(&store)
                )
            )),
            resolver.clone()
        )
        .is_err()
    );

    assert_eq!(
        model.store_requests().len(),
        installation_baseline,
        "installation and ownership checks must not issue modeled Store calls"
    );
    // Canonical Database wire state in the explicitly labelled storage model;
    // this is not original SignUp, constructor CAS, or native storage acceptance.
    let mut database = bounded(db::database_client::DatabaseClient::connect(
        database_endpoint,
    ))
    .await
    .unwrap();
    bounded(database.store(db::StoreRequest {
        actor_upserts: vec![db::Actor {
                state_type: "bank.v1.Account".into(),
                state_ref: reference.clone(),
                state: Some(
                    b::Account {
                        customer_name: "Original catalog".into(),
                        balance: 689,
                    }
                    .encode_to_vec(),
                ),
            }],
        idempotent_mutation: Some(db::IdempotentMutation {
            state_type: "bank.v1.Account".into(),
            state_ref: reference.clone(),
            key: uuid::Uuid::new_v4().as_bytes().to_vec(),
            ..Default::default()
        }),
        sync: true,
        ..Default::default()
    }))
    .await
    .unwrap();
    let writes = model.store_requests().len();
    let socket = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
    let address = socket.local_addr().unwrap();
    drop(socket);
    let (entered_tx, entered_rx) = oneshot::channel();
    let (release_tx, release_rx) = oneshot::channel();
    let (stop_tx, stop_rx) = oneshot::channel();
    let frontdoor = catalog.public_frontdoor().unwrap();
    let running = host
        .with_host_recovery(HoldRecovery {
            entered: Mutex::new(Some(entered_tx)),
            release: Mutex::new(Some(release_rx)),
        })
        .add_public_service(frontdoor);
    let server = tokio::spawn(async move {
        running
            .serve_with_shutdown(address, async {
                let _ = stop_rx.await;
            })
            .await
            .unwrap();
    });
    bounded(entered_rx).await.unwrap();
    let mut client = bounded(b::account_methods_client::AccountMethodsClient::connect(
        format!("http://{address}"),
    ))
    .await
    .unwrap();
    assert_eq!(
        bounded(client.balance(balance_request(&reference)))
            .await
            .unwrap_err()
            .code(),
        tonic::Code::Unavailable
    );
    assert!(Arc::ptr_eq(
        &catalog.resolve(&configuration.target).await.unwrap(),
        &endpoint
    ));
    let deposit_key = uuid::Uuid::new_v4();
    assert_eq!(
        bounded(client.deposit(deposit_request(&reference, deposit_key)))
            .await
            .unwrap_err()
            .code(),
        tonic::Code::Unavailable
    );
    assert_eq!(
        model.store_requests().len(),
        writes,
        "host-wide preReady denial must not issue Store"
    );
    release_tx.send(()).unwrap();
    bounded(async {
        loop {
            match destination.binding().require_host_ready(&configuration) {
                Ok(()) => break,
                Err(error) if error.code() == tonic::Code::Unavailable => {
                    tokio::task::yield_now().await
                }
                Err(error) => panic!("unexpected readiness failure: {error}"),
            }
        }
    })
    .await;
    // Also execute the original DatabaseAdapter, not a fabricated adapter or
    // output. It cannot enter this catalog: its generated API deliberately has
    // no local_configuration/incarnation/participant registration surface.
    let database_adapter = a::AccountMethodsDatabaseAdapter::new(
        store.clone(),
        ResponseOnlyAccount {
            logical_state_id: "catalog689".into(),
        },
    )
    .with_authorization(AuthorizationPolicy::permissive_for_development());
    let direct = bounded(b::account_methods_server::AccountMethods::balance(
        &database_adapter,
        balance_request(&reference),
    ))
    .await
    .unwrap()
    .into_inner();
    assert_eq!(direct.balance, 689);
    assert_eq!(
        bounded(client.balance(balance_request(&reference)))
            .await
            .unwrap_err()
            .code(),
        tonic::Code::Unimplemented,
        "Ready does not widen generated catalog admission to readers"
    );
    assert_eq!(
        model.store_requests().len(),
        writes,
        "reader baseline and unsupported reader route must not issue Store"
    );
    let response = bounded(client.deposit(deposit_request(&reference, deposit_key)))
        .await
        .unwrap()
        .into_inner();
    assert_eq!(response.updated_balance, 700);
    let after_deposit = model.store_requests();
    assert_eq!(
        after_deposit.len(),
        writes + 1,
        "one admitted ordinary Deposit must issue exactly one canonical Store"
    );
    let mutation = &after_deposit[writes];
    assert_eq!(mutation.actor_upserts.len(), 1);
    let actor = &mutation.actor_upserts[0];
    assert_eq!(actor.state_type, "bank.v1.Account");
    assert_eq!(actor.state_ref, reference);
    let state = b::Account::decode(actor.state.as_deref().unwrap()).unwrap();
    assert_eq!(state.balance, 700);
    assert_eq!(state.customer_name, "Original catalog");
    let receipt = mutation.idempotent_mutation.as_ref().unwrap();
    assert_eq!(receipt.state_type, "bank.v1.Account");
    assert_eq!(receipt.state_ref, reference);
    assert_eq!(receipt.key, deposit_key.as_bytes().to_vec());
    assert_eq!(
        b::DepositResponse::decode(receipt.response.as_slice()).unwrap(),
        response
    );
    assert!(
        receipt
            .request_fingerprint
            .as_ref()
            .is_some_and(|bytes| !bytes.is_empty())
    );
    assert!(mutation.sync);
    assert!(
        mutation.transaction.is_none(),
        "ordinary writer must not invent a transaction"
    );
    assert!(mutation.task_upserts.is_empty());
    let replay = bounded(client.deposit(deposit_request(&reference, deposit_key)))
        .await
        .unwrap()
        .into_inner();
    assert_eq!(
        replay, response,
        "the generated response must replay unchanged"
    );
    assert_eq!(
        model.store_requests().len(),
        writes + 1,
        "same-key retry must not mutate canonical state a second time"
    );
    let updated = bounded(b::account_methods_server::AccountMethods::balance(
        &database_adapter,
        balance_request(&reference),
    ))
    .await
    .unwrap()
    .into_inner();
    assert_eq!(
        updated.balance, 700,
        "original DatabaseAdapter reads the actual updated canonical state"
    );
    assert_eq!(model.store_requests().len(), writes + 1);
    stop_tx.send(()).unwrap();
    bounded(server).await.unwrap();
    assert!(
        destination
            .binding()
            .validate_configuration(&configuration)
            .is_err()
    );
    database_server.abort();
    let _ = database_server.await;
}

#[tonic::async_trait]
impl a::AccountMethodsTransactionHandler for ResponseOnlyAccount {
    async fn open(
        &self,
        state: &mut b::Account,
        request: b::OpenRequest,
    ) -> Result<b::OpenResponse, tonic::Status> {
        state.customer_name = request.customer_name;
        Ok(b::OpenResponse {
            welcome_email_task_id: None,
        })
    }
    async fn balance(
        &self,
        state: &b::Account,
        _: b::BalanceRequest,
    ) -> Result<b::BalanceResponse, tonic::Status> {
        Ok(semantics::balance(state))
    }
    async fn deposit(
        &self,
        state: &mut b::Account,
        request: b::DepositRequest,
    ) -> Result<b::DepositResponse, tonic::Status> {
        semantics::deposit(state, request).map_err(|error| *error)
    }
    async fn welcome_email(
        &self,
        state: &mut b::Account,
        _: b::WelcomeEmailRequest,
    ) -> Result<b::WelcomeEmailResponse, tonic::Status> {
        Ok(semantics::welcome_email(state, &self.logical_state_id))
    }
    async fn withdraw(
        &self,
        state: &mut b::Account,
        request: b::WithdrawRequest,
    ) -> Result<b::WithdrawResponse, a::AccountMethodsWithdrawError> {
        semantics::withdraw(state, request).map_err(|error| *error)
    }
}

#[tokio::test]
async fn generated_factory_policy_or_incarnation_change_never_publishes() {
    let (database_endpoint, _model, database_server) =
        reboot::runtime::test_support::start_database().await;
    let store = DatabaseActorStore::connect_lazy(&database_endpoint).unwrap();
    let sidecar = Arc::new(
        bounded(TonicParticipantSidecar::connect(&database_endpoint))
            .await
            .unwrap(),
    );
    let coordinator_sidecar = Arc::new(
        bounded(TonicCoordinatorSidecar::connect(&database_endpoint))
            .await
            .unwrap(),
    );
    for changed_policy in [false, true] {
        let reference = reboot::state_ref::StateRef::from_id(
            "bank.v1.Account",
            if changed_policy {
                "policy689"
            } else {
                "incarnation689"
            },
        )
        .unwrap()
        .to_string();
        let participant =
            DurableActorParticipant::new(sidecar.clone(), "bank.v1.Account", &reference)
                .with_database_actor_gate(&store);
        let endpoint = Arc::new(InProcessParticipantEndpoint::new(
            DurableActorParticipantHost::new(participant.clone()),
        ));
        let resolver = Arc::new(
            ExactParticipantResolver::new([(participant.actor_target(), endpoint.clone())])
                .unwrap(),
        );
        let coordinator =
            DurableRootCoordinator::new(coordinator_sidecar.clone(), resolver.clone());
        let (adapter, tasks) = a::AccountMethodsTransactionAdapter::new(
            store.clone(),
            participant.clone(),
            coordinator,
            NoStarts,
            ResponseOnlyAccount {
                logical_state_id: "factory689".into(),
            },
        )
        .with_authorization(AuthorizationPolicy::permissive_for_development())
        .with_one_shot_writer_tasks(&reference)
        .unwrap();
        let configuration = adapter.local_configuration().unwrap();
        let owner = DynamicLocalOwner::new(
            configuration.clone(),
            participant,
            tasks,
            endpoint,
            resolver,
        )
        .unwrap();
        // Same generated handler/participant/tasks, but real public configuration
        // mutation rotates local_incarnation. Never patch a config string to fake it.
        let changed = adapter.with_authorization(if changed_policy {
            AuthorizationPolicy::default()
        } else {
            AuthorizationPolicy::permissive_for_development()
        });
        let mut host = ApplicationHost::new("source689-refusal");
        // SDK callback requires tonic::Status; boxing would change its contract.
        #[expect(clippy::result_large_err, reason = "catalog factory requires tonic::Status")]
        let catalog = DynamicLocalCatalog::register(
            &mut host,
            configuration.clone(),
            1,
            move |_: Arc<Owner>| Ok(changed.clone()),
        )
        .unwrap();
        assert_eq!(
            catalog.install(owner.clone()).err().unwrap().code(),
            tonic::Code::FailedPrecondition
        );
        assert!(catalog.lookup_installed(&configuration.target).is_err());
        assert!(catalog.resolve(&configuration.target).await.is_err());
        assert_eq!(host.registered_transaction_adapter_count(), 0);
        assert_eq!(host.registered_transaction_service_count(), 0);
        // Failed construction consumes retained uncertainty/quota, not retry permission.
        assert!(catalog.install(owner).is_err());
    }
    database_server.abort();
    let _ = database_server.await;
}
