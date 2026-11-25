//! SOURCE-ONLY old canonical C++ sidecar fence, not upgraded atomicity/Bank acceptance.
//! Parent owns the canonical Database child AND this exact isolated test process.
//! No subprocesses, private owner fabrication or actor seeds; preflight permits normal shutdown.
use crate::{account_generated as g, bank::v1 as b, semantics};
use prost::Message;
use reboot::{
    application_host::ApplicationHost, database_proto as db, runtime::DatabaseActorStore,
};
use std::{
    sync::{
        Arc, Mutex,
        atomic::{AtomicUsize, Ordering},
    },
    time::Duration,
};

const TYPE: &str = "bank.v1.Account";
const DEADLINE: Duration = Duration::from_secs(10);
async fn bounded<T>(future: impl std::future::Future<Output = T>) -> T {
    tokio::time::timeout(DEADLINE, future)
        .await
        .expect("old SDK negative deadline")
}

#[derive(Default)]
struct Observations {
    calls: Mutex<Vec<&'static str>>,
    creates: Mutex<Vec<db::CreateActorRequest>>,
    native_errors: Mutex<Vec<tonic::Status>>,
    effects: Mutex<Vec<(b::OpenResponse, db::Task)>>,
    welcomes: AtomicUsize,
}
struct OriginalOpen(Arc<Observations>);
#[tonic::async_trait]
impl g::AccountMethodsDatabaseHandler for OriginalOpen {
    async fn open(
        &self,
        _: &mut b::Account,
        _: b::OpenRequest,
    ) -> Result<b::OpenResponse, tonic::Status> {
        panic!("generated adapter must invoke the actual Open_with_tasks hook")
    }
    async fn open_with_tasks(
        &self,
        state: &mut b::Account,
        request: b::OpenRequest,
        reference: String,
    ) -> Result<reboot::runtime::WriterExecution<b::OpenResponse>, tonic::Status> {
        let execution = semantics::open_effect(state, request, &reference);
        assert_eq!(execution.task_upserts.len(), 1);
        self.0.effects.lock().unwrap().push((
            execution.response.clone(),
            execution.task_upserts[0].clone(),
        ));
        Ok(execution)
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
    async fn withdraw(
        &self,
        state: &mut b::Account,
        request: b::WithdrawRequest,
    ) -> Result<b::WithdrawResponse, g::AccountMethodsWithdrawError> {
        semantics::withdraw(state, request).map_err(|error| *error)
    }
    async fn welcome_email(
        &self,
        state: &mut b::Account,
        _: b::WelcomeEmailRequest,
    ) -> Result<b::WelcomeEmailResponse, tonic::Status> {
        self.0.welcomes.fetch_add(1, Ordering::SeqCst);
        Ok(semantics::welcome_email(state, "old-sdk-absent-account"))
    }
}

// Transparent observation ONLY: every method is forwarded to the parent's real
// canonical old Database. In particular UNIMPLEMENTED is NEVER synthesized here.
#[derive(Clone)]
struct ObservedDatabase {
    client: db::database_client::DatabaseClient<tonic::transport::Channel>,
    observations: Arc<Observations>,
}

fn recovery_request() -> db::RecoverRequest {
    db::RecoverRequest {
        state_tags_by_state_type: [(TYPE.into(), "Account".into())].into(),
        shard_ids: vec!["s000000000".into()],
        skip_idempotent_mutations: false,
    }
}
async fn absent(
    client: &mut db::database_client::DatabaseClient<tonic::transport::Channel>,
    reference: &str,
    id: Option<db::TaskId>,
) {
    let loaded = bounded(client.load(db::LoadRequest {
        actors: vec![db::Actor {
            state_type: TYPE.into(),
            state_ref: reference.into(),
            state: None,
        }],
        task_ids: id.into_iter().collect(),
    }))
    .await
    .unwrap()
    .into_inner();
    assert!(
        loaded.actors.is_empty(),
        "canonical actor unexpectedly persisted"
    );
    assert!(
        loaded.tasks.is_empty(),
        "canonical exact task unexpectedly persisted"
    );
    let mut mutations = bounded(client.recover_idempotent_mutations(
        db::RecoverIdempotentMutationsRequest {
            state_type: TYPE.into(),
            state_ref: reference.into(),
            idempotency_key: None,
            workflow_id: None,
            workflow_iteration: None,
        },
    ))
    .await
    .unwrap()
    .into_inner();
    while let Some(batch) = bounded(mutations.message()).await.unwrap() {
        assert!(
            batch.idempotent_mutations.is_empty(),
            "canonical checkpoint unexpectedly persisted"
        );
    }
    let mut recovery = bounded(client.recover(recovery_request()))
        .await
        .unwrap()
        .into_inner();
    while let Some(batch) = bounded(recovery.message()).await.unwrap() {
        // Bounded to the requested pristine shard and the categories Recover
        // actually returns. This is NOT absence of arbitrary completed tasks.
        assert!(
            batch.pending_tasks.is_empty(),
            "pristine canonical shard gained pending tasks"
        );
        assert!(
            batch.participant_transactions.is_empty(),
            "pristine canonical shard gained participant transactions"
        );
        assert!(
            batch.transaction_coordinators.is_empty(),
            "pristine canonical shard gained prepared coordinators"
        );
        assert!(
            batch.idempotent_mutations.is_empty(),
            "pristine canonical shard gained recovered idempotent mutations"
        );
    }
}

#[test]
#[ignore = "parent-owned isolated process and pristine canonical old CXX Database required"]
fn original_account_open_old_sidecar_preflight_cleanly_shutdown() {
    // Isolate the process-global reservation baseline against a pristine old Database.
    // Preflight rejects before mutating native calls or reserving uncertainty capacity.
    let runtime = tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()
        .unwrap();
    runtime.block_on(old_sidecar_negative());
    drop(runtime); // host/proxy shutdown already joined; now destroy the runtime.
    println!("OLD_SDK_RUNTIME_DESTROYED; preflight rejected before mutation; NORMAL SHUTDOWN");
}
async fn old_sidecar_negative() {
    let canonical = std::env::var("REBOOT_OLD_SDK_DATABASE_ENDPOINT")
        .expect("parent RAII/pidfd harness must provide its pristine old CXX endpoint");
    let reference = reboot::state_ref::StateRef::from_id(TYPE, "old-sdk-absent-account")
        .unwrap()
        .to_string();
    let mut canonical_client = bounded(db::database_client::DatabaseClient::connect(
        canonical.clone(),
    ))
    .await
    .unwrap();
    absent(&mut canonical_client, &reference, None).await;
    let observations = Arc::new(Observations::default());
    let proxy = ObservedDatabase {
        client: canonical_client.clone(),
        observations: observations.clone(),
    };
    let proxy_listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let proxy_endpoint = format!("http://{}", proxy_listener.local_addr().unwrap());
    let (proxy_stop, proxy_stopped) = tokio::sync::oneshot::channel::<()>();
    let proxy_server = tokio::spawn(async move {
        tonic::transport::Server::builder()
            .add_service(db::database_server::DatabaseServer::new(proxy))
            .serve_with_incoming_shutdown(
                tokio_stream::wrappers::TcpListenerStream::new(proxy_listener),
                async {
                    let _ = proxy_stopped.await;
                },
            )
            .await
    });
    let store = bounded(DatabaseActorStore::connect(&proxy_endpoint))
        .await
        .unwrap();
    let (adapter, tasks) =
        g::AccountMethodsDatabaseAdapter::new(store.clone(), OriginalOpen(observations.clone()))
            .with_authorization(reboot::auth::AuthorizationPolicy::permissive_for_development())
            .with_one_shot_writer_tasks(&reference)
            .unwrap();
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let endpoint = format!("http://{}", listener.local_addr().unwrap());
    let host = ApplicationHost::new("original-account-old-sidecar-negative")
        .with_host_recovery(tasks.recovery(recovery_request()))
        .add_service(b::account_methods_server::AccountMethodsServer::new(
            adapter,
        ));
    let (host_stop, host_stopped) = tokio::sync::oneshot::channel::<()>();
    let server = tokio::spawn(host.serve_with_listener_shutdown(listener, async {
        let _ = host_stopped.await;
    }));
    let mut client = bounded(b::account_methods_client::AccountMethodsClient::connect(
        endpoint,
    ))
    .await
    .unwrap();
    // Balance FAILED_PRECONDITION proves public readiness through the real host; it is not
    // an actor seed or a counterfeit private task dispatcher activation.
    bounded(async {
        loop {
            let mut request = tonic::Request::new(b::BalanceRequest {});
            *request.metadata_mut() = reboot::RebootHeaders::new(&reference)
                .to_metadata()
                .unwrap();
            match client.balance(request).await {
                Err(status)
                    if status.code() == tonic::Code::FailedPrecondition
                        && status.message()
                            == "actor state must be constructed before this method can be called" =>
                {
                    break;
                }
                Err(status) if status.code() == tonic::Code::Unavailable => {
                    tokio::time::sleep(Duration::from_millis(10)).await
                }
                other => panic!("absent-account host readiness failed: {other:?}"),
            }
        }
    })
    .await;
    let before = tasks.constructor_uncertainty_status();
    assert!(!before.actor_sealed && !before.actor_retained);
    let key = uuid::Uuid::new_v4();
    let mut request = tonic::Request::new(b::OpenRequest {
        customer_name: "Original old SDK customer".into(),
    });
    let mut headers = reboot::RebootHeaders::new(&reference);
    headers.idempotency_key = Some(key);
    *request.metadata_mut() = headers.to_metadata().unwrap();
    let error = bounded(client.open(request)).await.unwrap_err();
    assert_eq!(
        error.code(),
        tonic::Code::FailedPrecondition,
        "old Database must fail read-only preflight before reservation"
    );
    let effects = observations.effects.lock().unwrap().clone();
    assert_eq!(effects.len(), 1);
    let (returned_response, task) = &effects[0];
    let id = task.task_id.clone().unwrap();
    assert_eq!(
        returned_response
            .welcome_email_task_id
            .as_ref()
            .unwrap()
            .encode_to_vec(),
        id.encode_to_vec()
    );
    assert_eq!(id.state_type, TYPE);
    assert_eq!(id.state_ref, reference);
    assert_eq!(task.method, "WelcomeEmail");
    assert_eq!(task.status, db::task::Status::Pending as i32);
    assert!(task.response_or_error.is_none());
    assert!(observations.creates.lock().unwrap().is_empty());
    let native_errors = observations.native_errors.lock().unwrap().clone();
    assert_eq!(native_errors.len(), 1);
    assert_eq!(native_errors[0].code(), tonic::Code::Unimplemented);
    assert!(error.message().contains("GetCapabilities"));
    let status = tasks.constructor_uncertainty_status();
    assert!(!status.actor_sealed && !status.actor_retained);
    assert_eq!(status.process_reserved, before.process_reserved);
    let gate = store.actor_gate(TYPE, &reference);
    let lease = bounded(gate.shared()).await;
    drop(lease);
    absent(&mut canonical_client, &reference, Some(id.clone())).await;
    assert_eq!(observations.welcomes.load(Ordering::SeqCst), 0);
    let calls = observations.calls.lock().unwrap().clone();
    assert!(calls.contains(&"GetCapabilities"));
    for forbidden in ["CreateActorWithTasks", "CreateActor", "Store"] {
        assert!(!calls.contains(&forbidden), "preflight reached {forbidden}");
    }
    // Incompatibility is safe, not an uncertain write: normal shutdown works.
    host_stop.send(()).unwrap();
    bounded(server).await.unwrap().unwrap();
    proxy_stop.send(()).unwrap();
    bounded(proxy_server).await.unwrap().unwrap();
    println!("OLD_SDK_NEGATIVE preflight=FailedPrecondition native=Unimplemented creates_with_tasks=0 legacy_create=0 store=0 actor_absent=true task_absent=true checkpoint_absent=true welcome=0 reservation_unchanged=true normal_shutdown=true");
}

#[tonic::async_trait]
impl db::database_server::Database for ObservedDatabase {
    async fn get_capabilities(
        &self,
        request: tonic::Request<db::DatabaseCapabilitiesRequest>,
    ) -> Result<tonic::Response<db::DatabaseCapabilitiesResponse>, tonic::Status> {
        self.observations.calls.lock().unwrap().push("GetCapabilities");
        let result = self.client.clone().get_capabilities(request).await;
        if let Err(status) = &result {
            self.observations.native_errors.lock().unwrap().push(status.clone());
        }
        result
    }

    async fn colocated_range(
        &self,
        request: tonic::Request<db::ColocatedRangeRequest>,
    ) -> Result<tonic::Response<db::ColocatedRangeResponse>, tonic::Status> {
        self.observations
            .calls
            .lock()
            .unwrap()
            .push("ColocatedRange");
        self.client.clone().colocated_range(request).await
    }
    async fn colocated_reverse_range(
        &self,
        request: tonic::Request<db::ColocatedReverseRangeRequest>,
    ) -> Result<tonic::Response<db::ColocatedReverseRangeResponse>, tonic::Status> {
        self.observations
            .calls
            .lock()
            .unwrap()
            .push("ColocatedReverseRange");
        self.client.clone().colocated_reverse_range(request).await
    }
    async fn find(
        &self,
        request: tonic::Request<db::FindRequest>,
    ) -> Result<tonic::Response<db::FindResponse>, tonic::Status> {
        self.observations.calls.lock().unwrap().push("Find");
        self.client.clone().find(request).await
    }
    async fn load(
        &self,
        request: tonic::Request<db::LoadRequest>,
    ) -> Result<tonic::Response<db::LoadResponse>, tonic::Status> {
        self.observations.calls.lock().unwrap().push("Load");
        self.client.clone().load(request).await
    }
    type PreloadStream = tonic::Streaming<db::PreloadResponse>;
    async fn preload(
        &self,
        request: tonic::Request<db::PreloadRequest>,
    ) -> Result<tonic::Response<Self::PreloadStream>, tonic::Status> {
        self.observations.calls.lock().unwrap().push("Preload");
        self.client.clone().preload(request).await
    }
    async fn store(
        &self,
        request: tonic::Request<db::StoreRequest>,
    ) -> Result<tonic::Response<db::StoreResponse>, tonic::Status> {
        self.observations.calls.lock().unwrap().push("Store");
        self.client.clone().store(request).await
    }
    async fn complete_task(
        &self,
        request: tonic::Request<db::CompleteTaskRequest>,
    ) -> Result<tonic::Response<db::CompleteTaskResponse>, tonic::Status> {
        self.observations.calls.lock().unwrap().push("CompleteTask");
        self.client.clone().complete_task(request).await
    }
    async fn create_actor(
        &self,
        request: tonic::Request<db::CreateActorRequest>,
    ) -> Result<tonic::Response<db::CreateActorResponse>, tonic::Status> {
        self.observations.calls.lock().unwrap().push("CreateActor");
        self.client.clone().create_actor(request).await
    }
    async fn create_actor_with_tasks(
        &self,
        request: tonic::Request<db::CreateActorRequest>,
    ) -> Result<tonic::Response<db::CreateActorResponse>, tonic::Status> {
        self.observations
            .calls
            .lock()
            .unwrap()
            .push("CreateActorWithTasks");
        self.observations
            .creates
            .lock()
            .unwrap()
            .push(request.get_ref().clone());
        let result = self.client.clone().create_actor_with_tasks(request).await;
        if let Err(status) = &result {
            self.observations
                .native_errors
                .lock()
                .unwrap()
                .push(status.clone());
        }
        result
    }
    type RecoverStream = tonic::Streaming<db::RecoverResponse>;
    async fn recover(
        &self,
        request: tonic::Request<db::RecoverRequest>,
    ) -> Result<tonic::Response<Self::RecoverStream>, tonic::Status> {
        self.observations.calls.lock().unwrap().push("Recover");
        self.client.clone().recover(request).await
    }
    type RecoverIdempotentMutationsStream =
        tonic::Streaming<db::RecoverIdempotentMutationsResponse>;
    async fn recover_idempotent_mutations(
        &self,
        request: tonic::Request<db::RecoverIdempotentMutationsRequest>,
    ) -> Result<tonic::Response<Self::RecoverIdempotentMutationsStream>, tonic::Status> {
        self.observations
            .calls
            .lock()
            .unwrap()
            .push("RecoverIdempotentMutations");
        self.client
            .clone()
            .recover_idempotent_mutations(request)
            .await
    }
    async fn transaction_participant_prepare(
        &self,
        request: tonic::Request<db::TransactionParticipantPrepareRequest>,
    ) -> Result<tonic::Response<db::TransactionParticipantPrepareResponse>, tonic::Status> {
        self.observations
            .calls
            .lock()
            .unwrap()
            .push("TransactionParticipantPrepare");
        self.client
            .clone()
            .transaction_participant_prepare(request)
            .await
    }
    async fn transaction_participant_commit(
        &self,
        request: tonic::Request<db::TransactionParticipantCommitRequest>,
    ) -> Result<tonic::Response<db::TransactionParticipantCommitResponse>, tonic::Status> {
        self.observations
            .calls
            .lock()
            .unwrap()
            .push("TransactionParticipantCommit");
        self.client
            .clone()
            .transaction_participant_commit(request)
            .await
    }
    async fn transaction_participant_abort(
        &self,
        request: tonic::Request<db::TransactionParticipantAbortRequest>,
    ) -> Result<tonic::Response<db::TransactionParticipantAbortResponse>, tonic::Status> {
        self.observations
            .calls
            .lock()
            .unwrap()
            .push("TransactionParticipantAbort");
        self.client
            .clone()
            .transaction_participant_abort(request)
            .await
    }
    async fn transaction_coordinator_prepared(
        &self,
        request: tonic::Request<db::TransactionCoordinatorPreparedRequest>,
    ) -> Result<tonic::Response<db::TransactionCoordinatorPreparedResponse>, tonic::Status> {
        self.observations
            .calls
            .lock()
            .unwrap()
            .push("TransactionCoordinatorPrepared");
        self.client
            .clone()
            .transaction_coordinator_prepared(request)
            .await
    }
    async fn transaction_coordinator_prepare(
        &self,
        request: tonic::Request<db::TransactionCoordinatorPrepareRequest>,
    ) -> Result<tonic::Response<db::TransactionCoordinatorPrepareResponse>, tonic::Status> {
        self.observations
            .calls
            .lock()
            .unwrap()
            .push("TransactionCoordinatorPrepare");
        self.client
            .clone()
            .transaction_coordinator_prepare(request)
            .await
    }
    async fn transaction_coordinator_cleanup(
        &self,
        request: tonic::Request<db::TransactionCoordinatorCleanupRequest>,
    ) -> Result<tonic::Response<db::TransactionCoordinatorCleanupResponse>, tonic::Status> {
        self.observations
            .calls
            .lock()
            .unwrap()
            .push("TransactionCoordinatorCleanup");
        self.client
            .clone()
            .transaction_coordinator_cleanup(request)
            .await
    }
    async fn transaction_coordinator_decision_put(
        &self,
        request: tonic::Request<db::TransactionCoordinatorDecisionPutRequest>,
    ) -> Result<tonic::Response<db::TransactionCoordinatorDecisionPutResponse>, tonic::Status> {
        self.observations
            .calls
            .lock()
            .unwrap()
            .push("TransactionCoordinatorDecisionPut");
        self.client
            .clone()
            .transaction_coordinator_decision_put(request)
            .await
    }
    async fn transaction_coordinator_decision_get(
        &self,
        request: tonic::Request<db::TransactionCoordinatorDecisionGetRequest>,
    ) -> Result<tonic::Response<db::TransactionCoordinatorDecisionGetResponse>, tonic::Status> {
        self.observations
            .calls
            .lock()
            .unwrap()
            .push("TransactionCoordinatorDecisionGet");
        self.client
            .clone()
            .transaction_coordinator_decision_get(request)
            .await
    }
    async fn export(
        &self,
        request: tonic::Request<db::ExportRequest>,
    ) -> Result<tonic::Response<db::ExportResponse>, tonic::Status> {
        self.observations.calls.lock().unwrap().push("Export");
        self.client.clone().export(request).await
    }
    type ExportStreamedStream = tonic::Streaming<db::ExportResponse>;
    async fn export_streamed(
        &self,
        request: tonic::Request<db::ExportRequest>,
    ) -> Result<tonic::Response<Self::ExportStreamedStream>, tonic::Status> {
        self.observations
            .calls
            .lock()
            .unwrap()
            .push("ExportStreamed");
        self.client.clone().export_streamed(request).await
    }
    async fn get_application_metadata(
        &self,
        request: tonic::Request<db::GetApplicationMetadataRequest>,
    ) -> Result<tonic::Response<db::GetApplicationMetadataResponse>, tonic::Status> {
        self.observations
            .calls
            .lock()
            .unwrap()
            .push("GetApplicationMetadata");
        self.client.clone().get_application_metadata(request).await
    }
    async fn store_application_metadata(
        &self,
        request: tonic::Request<db::StoreApplicationMetadataRequest>,
    ) -> Result<tonic::Response<db::StoreApplicationMetadataResponse>, tonic::Status> {
        self.observations
            .calls
            .lock()
            .unwrap()
            .push("StoreApplicationMetadata");
        self.client
            .clone()
            .store_application_metadata(request)
            .await
    }
    async fn refresh_timestamp(
        &self,
        request: tonic::Request<db::RefreshTimestampRequest>,
    ) -> Result<tonic::Response<db::RefreshTimestampResponse>, tonic::Status> {
        self.observations
            .calls
            .lock()
            .unwrap()
            .push("RefreshTimestamp");
        self.client.clone().refresh_timestamp(request).await
    }
}
