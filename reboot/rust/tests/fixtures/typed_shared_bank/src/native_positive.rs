//! SOURCE CANDIDATE ONLY. Parent owns CXX child, exact test processes and restart.
//! Unchanged original Account schema/semantics; no private seed, model DB or email IO.
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
const APP: &str = "original-account-positive";
const SERVER: &str = "original-account-positive-server";
const DEADLINE: Duration = Duration::from_secs(12);
async fn bounded<T>(f: impl std::future::Future<Output = T>) -> T {
    tokio::time::timeout(DEADLINE, f)
        .await
        .expect("positive candidate bounded operation expired")
}
struct Observations {
    calls: Mutex<Vec<&'static str>>,
    creates: Mutex<Vec<db::CreateActorRequest>>,
    completions: Mutex<Vec<(db::CompleteTaskRequest, db::CompleteTaskResponse)>>,
    effects: Mutex<Vec<(b::OpenResponse, db::Task)>>,
    bodies: Mutex<Vec<String>>,
    welcomes: AtomicUsize,
    recover_calls: AtomicUsize,
    recover_boundary: tokio::sync::Mutex<bool>,
    native_ack: tokio::sync::Semaphore,
    forward_ack: tokio::sync::Semaphore,
    dispatch: tokio::sync::Semaphore,
    hold_create_ack: bool,
}
impl Observations {
    fn new(hold_create_ack: bool) -> Self {
        Self {
            calls: Mutex::new(vec![]),
            creates: Mutex::new(vec![]),
            completions: Mutex::new(vec![]),
            effects: Mutex::new(vec![]),
            bodies: Mutex::new(vec![]),
            welcomes: AtomicUsize::new(0),
            recover_calls: AtomicUsize::new(0),
            recover_boundary: tokio::sync::Mutex::new(false),
            native_ack: tokio::sync::Semaphore::new(0),
            forward_ack: tokio::sync::Semaphore::new(0),
            dispatch: tokio::sync::Semaphore::new(0),
            hold_create_ack,
        }
    }
}
struct OriginalAccount {
    observations: Arc<Observations>,
    logical_id: String,
}
#[tonic::async_trait]
impl g::AccountMethodsDatabaseHandler for OriginalAccount {
    async fn open(
        &self,
        _: &mut b::Account,
        _: b::OpenRequest,
    ) -> Result<b::OpenResponse, tonic::Status> {
        panic!("task-enabled original constructor must call open_with_tasks")
    }
    async fn open_with_tasks(
        &self,
        state: &mut b::Account,
        request: b::OpenRequest,
        reference: String,
    ) -> Result<reboot::runtime::WriterExecution<b::OpenResponse>, tonic::Status> {
        let execution = semantics::open_effect(state, request, &reference);
        assert_eq!(execution.task_upserts.len(), 1);
        self.observations.effects.lock().unwrap().push((
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
        semantics::deposit(state, request).map_err(|e| *e)
    }
    async fn withdraw(
        &self,
        state: &mut b::Account,
        request: b::WithdrawRequest,
    ) -> Result<b::WithdrawResponse, g::AccountMethodsWithdrawError> {
        semantics::withdraw(state, request).map_err(|e| *e)
    }
    async fn welcome_email(
        &self,
        state: &mut b::Account,
        _: b::WelcomeEmailRequest,
    ) -> Result<b::WelcomeEmailResponse, tonic::Status> {
        self.observations.welcomes.fetch_add(1, Ordering::SeqCst);
        self.observations
            .bodies
            .lock()
            .unwrap()
            .push(semantics::welcome_body(state, &self.logical_id));
        // Actual original effect logs the full original body, not an external email.
        Ok(semantics::welcome_email(state, &self.logical_id))
    }
}
// Wire-only decode of the SDK's actual private scheduling checkpoint tags.
// This is inspection, not invocation of private APIs or invented persistence.
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
// Controller handoff contains actual first public response and ACKed wire request.
#[derive(prost::Message, PartialEq)]
struct SavedToken {
    #[prost(bytes = "vec", tag = "1")]
    response: Vec<u8>,
    #[prost(bytes = "vec", tag = "2")]
    key: Vec<u8>,
    #[prost(message, optional, tag = "3")]
    create: Option<db::CreateActorRequest>,
    #[prost(string, tag = "4")]
    logical_id: String,
    #[prost(string, tag = "5")]
    customer: String,
    #[prost(string, tag = "6")]
    source_run: String,
}
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
fn request<T>(reference: &str, body: T, key: Option<uuid::Uuid>) -> tonic::Request<T> {
    let mut request = tonic::Request::new(body);
    let mut headers = reboot::RebootHeaders::new(reference);
    headers.idempotency_key = key;
    *request.metadata_mut() = headers.to_metadata().unwrap();
    request.set_timeout(DEADLINE);
    request
}
fn task_id(response: &b::OpenResponse) -> db::TaskId {
    db::TaskId::decode(
        response
            .welcome_email_task_id
            .as_ref()
            .expect("actual returned task ID")
            .encode_to_vec()
            .as_slice(),
    )
    .unwrap()
}
fn reference(logical_id: &str) -> String {
    reboot::state_ref::StateRef::from_id(TYPE, logical_id)
        .unwrap()
        .to_string()
}
fn prerequisites() -> (String, String) {
    assert_eq!(
        std::env::var("REBOOT_POSITIVE_EXCLUSIVE_AUTHORITY").as_deref(),
        Ok("parent-owned-pristine-single-shard-no-other-producers"),
        "native F3 bounded precondition: parent must actually own this single serving authority; an env declaration alone is not proof"
    );
    for (name, _) in std::env::vars_os() {
        assert!(
            !name.to_string_lossy().starts_with("REBOOT_TEST_"),
            "unrelated SDK test injection forbidden: {name:?}"
        );
    }
    let endpoint = std::env::var("REBOOT_POSITIVE_DATABASE_ENDPOINT")
        .expect("NEW rebuilt canonical CXX endpoint required; no default/old endpoint");
    let run = std::env::var("REBOOT_POSITIVE_CONTROLLER_RUN")
        .expect("parent source-freeze/native-hash/process evidence correlation required");
    for name in [
        "REBOOT_TEST_TASK_DEFER_METHOD",
        "REBOOT_TEST_TASK_BEFORE_COMPLETE",
        "REBOOT_TEST_WRITER_AFTER_COMPLETE",
        "REBOOT_TEST_TASK_WAIT_RPC_ERROR",
        "REBOOT_TEST_TASK_WAIT_LOADED",
    ] {
        assert!(
            std::env::var_os(name).is_none(),
            "unrelated SDK test injection forbidden: {name}"
        );
    }
    (endpoint, run)
}
async fn checkpoint(
    client: &mut db::database_client::DatabaseClient<tonic::transport::Channel>,
    reference: &str,
    key: Option<Vec<u8>>,
) -> Vec<db::IdempotentMutation> {
    let mut stream = bounded(client.recover_idempotent_mutations(
        db::RecoverIdempotentMutationsRequest {
            state_type: TYPE.into(),
            state_ref: reference.into(),
            idempotency_key: key,
            workflow_id: None,
            workflow_iteration: None,
        },
    ))
    .await
    .unwrap()
    .into_inner();
    let mut records = vec![];
    while let Some(batch) = bounded(stream.message()).await.unwrap() {
        records.extend(batch.idempotent_mutations);
    }
    records
}
async fn absent(
    client: &mut db::database_client::DatabaseClient<tonic::transport::Channel>,
    reference: &str,
) {
    let loaded = bounded(client.load(db::LoadRequest {
        actors: vec![db::Actor {
            state_type: TYPE.into(),
            state_ref: reference.into(),
            state: None,
        }],
        task_ids: vec![],
    }))
    .await
    .unwrap()
    .into_inner();
    assert!(loaded.actors.is_empty() && loaded.tasks.is_empty());
    assert!(checkpoint(client, reference, None).await.is_empty());
    let mut stream = bounded(client.recover(recovery_request()))
        .await
        .unwrap()
        .into_inner();
    while let Some(batch) = bounded(stream.message()).await.unwrap() {
        assert!(
            batch.pending_tasks.is_empty(),
            "phase requires pristine pending inventory"
        );
        assert!(
            batch.participant_transactions.is_empty() && batch.transaction_coordinators.is_empty(),
            "F3 cannot serve prepared transaction authority"
        );
        assert!(
            batch.idempotent_mutations.is_empty(),
            "phase requires pristine checkpoint inventory"
        );
    }
}
async fn readback(
    client: &mut db::database_client::DatabaseClient<tonic::transport::Channel>,
    create: &db::CreateActorRequest,
    response: &b::OpenResponse,
    completed: bool,
) -> db::Task {
    let actor = create.actor.as_ref().unwrap();
    let mutation = create.idempotent_mutation.as_ref().unwrap();
    let id = task_id(response);
    assert_eq!(id.state_type, TYPE);
    assert_eq!(id.state_ref, actor.state_ref);
    assert_eq!(create.task_upserts.len(), 1);
    assert_eq!(mutation.task_ids, vec![id.clone()]);
    assert!(create.sync && mutation.request_fingerprint.is_some());
    assert!(mutation.workflow_id.is_none() && mutation.workflow_iteration.is_none());
    let loaded = bounded(client.load(db::LoadRequest {
        actors: vec![db::Actor {
            state: None,
            ..actor.clone()
        }],
        task_ids: vec![id.clone()],
    }))
    .await
    .unwrap()
    .into_inner();
    assert_eq!(
        loaded.actors,
        vec![actor.clone()],
        "no constructor/task remutation"
    );
    assert_eq!(loaded.tasks.len(), 1);
    let task = loaded.tasks.into_iter().next().unwrap();
    let original = &create.task_upserts[0];
    assert_eq!(original.task_id, Some(id.clone()));
    assert_eq!(original.method, "WelcomeEmail");
    assert_eq!(original.status, db::task::Status::Pending as i32);
    assert!(original.response_or_error.is_none());
    assert_eq!(original.request, b::WelcomeEmailRequest {}.encode_to_vec());
    assert_eq!(original.iteration, 0);
    assert!(original.timestamp.is_none());
    assert_eq!(task.task_id, original.task_id);
    assert_eq!(task.method, original.method);
    assert_eq!(task.request, original.request);
    assert_eq!(task.iteration, original.iteration);
    assert_eq!(task.timestamp, original.timestamp);
    if completed {
        assert_eq!(task.status, db::task::Status::Completed as i32);
        match task.response_or_error.as_ref().unwrap() {
            db::task::ResponseOrError::Response(terminal) => {
                assert_eq!(
                    terminal.type_url,
                    "type.googleapis.com/bank.v1.WelcomeEmailResponse"
                );
                assert_eq!(
                    b::WelcomeEmailResponse::decode(terminal.value.as_slice()).unwrap(),
                    b::WelcomeEmailResponse {}
                );
            }
            other => panic!("not actual typed completion: {other:?}"),
        }
    } else {
        assert_eq!(
            &task, original,
            "canonical task must still be exact Pending"
        );
    }
    assert_eq!(
        checkpoint(client, &actor.state_ref, Some(mutation.key.clone())).await,
        vec![mutation.clone()]
    );
    let cp = Checkpoint::decode(mutation.response.as_slice()).unwrap();
    assert_eq!(cp.version, 1);
    assert_eq!(cp.response_type, "type.googleapis.com/bank.v1.OpenResponse");
    assert_eq!(cp.tasks, create.task_upserts);
    assert_eq!(
        b::OpenResponse::decode(cp.response.as_slice()).unwrap(),
        *response
    );
    task
}
struct Hosted {
    endpoint: String,
    store: DatabaseActorStore,
    tasks: reboot::one_shot_tasks::OneShotTasks,
    observations: Arc<Observations>,
    stop: tokio::sync::oneshot::Sender<()>,
    server: tokio::task::JoinHandle<Result<(), reboot::application_host::ApplicationHostError>>,
    proxy_stop: tokio::sync::oneshot::Sender<()>,
    proxy_server: tokio::task::JoinHandle<Result<(), tonic::transport::Error>>,
}
impl Hosted {
    async fn start(
        canonical: &str,
        logical_id: &str,
        observations: Arc<Observations>,
        constructed: bool,
    ) -> Self {
        use reboot::placement_proto as p;
        let reference = reference(logical_id);
        let proxy = ObservedDatabase {
            client: bounded(db::database_client::DatabaseClient::connect(
                canonical.to_owned(),
            ))
            .await
            .unwrap(),
            observations: observations.clone(),
        };
        let proxy_listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let proxy_endpoint = format!("http://{}", proxy_listener.local_addr().unwrap());
        let (proxy_stop, proxy_stopped) = tokio::sync::oneshot::channel();
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
        let (adapter, tasks) = g::AccountMethodsDatabaseAdapter::new(
            store.clone(),
            OriginalAccount {
                observations: observations.clone(),
                logical_id: logical_id.into(),
            },
        )
        .with_authorization(reboot::auth::AuthorizationPolicy::permissive_for_development())
        .with_one_shot_writer_tasks(&reference)
        .unwrap();
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = listener.local_addr().unwrap().port();
        let endpoint = format!("http://127.0.0.1:{port}");
        let placement = reboot::legacy_placement::PlanOnlyLegacyPlacement::new();
        placement
            .install(p::ListenForPlanResponse {
                plan: Some(p::Plan {
                    version: 1,
                    applications: vec![p::plan::Application {
                        id: APP.into(),
                        services: vec![
                            p::plan::application::Service {
                                full_name: "bank.v1.AccountMethods".into(),
                                state_type_full_name: TYPE.into(),
                            },
                            p::plan::application::Service {
                                full_name: "rbt.v1alpha1.Tasks".into(),
                                state_type_full_name: String::new(),
                            },
                        ],
                        shards: vec![p::plan::application::Shard {
                            id: "s000000000".into(),
                            range: Some(p::plan::application::shard::KeyRange {
                                first_key: vec![],
                            }),
                            server_id: SERVER.into(),
                            replica_index: 0,
                        }],
                    }],
                }),
                servers: vec![p::Server {
                    id: SERVER.into(),
                    application_id: APP.into(),
                    address: Some(p::server::Address {
                        host: "127.0.0.1".into(),
                        port: port.into(),
                    }),
                    ..Default::default()
                }],
            })
            .unwrap();
        let wait = tasks.wait_service_with_policy(
            reboot::legacy_placement::LegacyApplicationId::new(APP).unwrap(),
            SERVER,
            placement.clone(),
            reboot::auth::AuthorizationPolicy::permissive_for_development(),
        );
        let host = ApplicationHost::new(APP)
            .with_legacy_placement_readiness(placement)
            .with_host_recovery(tasks.recovery(recovery_request()))
            .add_public_service(b::account_methods_server::AccountMethodsServer::new(
                adapter,
            ))
            .add_public_service(wait);
        let (stop, stopped) = tokio::sync::oneshot::channel();
        let server = tokio::spawn(host.serve_with_listener_shutdown(listener, async {
            let _ = stopped.await;
        }));
        let mut client = bounded(b::account_methods_client::AccountMethodsClient::connect(
            endpoint.clone(),
        ))
        .await
        .unwrap();
        bounded(async { loop {
            match client.balance(request(&reference, b::BalanceRequest {}, None)).await {
                Ok(reply) if constructed => { assert_eq!(reply.into_inner().balance, 0); break; },
                Err(e) if !constructed && e.code() == tonic::Code::FailedPrecondition && e.message() == "actor state must be constructed before this method can be called" => break,
                Err(e) if e.code() == tonic::Code::Unavailable => tokio::time::sleep(Duration::from_millis(10)).await,
                other => panic!("public readiness without private seeding: {other:?}"),
            }
        }}).await;
        Self {
            endpoint,
            store,
            tasks,
            observations,
            stop,
            server,
            proxy_stop,
            proxy_server,
        }
    }
    async fn finish(mut self) {
        self.stop.send(()).unwrap();
        match tokio::time::timeout(DEADLINE, &mut self.server).await {
            Ok(result) => result.unwrap().unwrap(),
            Err(_) => {
                self.server.abort();
                let _ = self.server.await;
                self.observations.dispatch.close();
                let _ = self.proxy_stop.send(());
                self.proxy_server.abort();
                let _ = self.proxy_server.await;
                panic!("host join timed out; cleanup is not accepted native completion");
            }
        }
        // Host has revoked/joined all dispatch before unblocking any leftover
        // transport handler. This can forward read-only Recover, never a body.
        self.observations.dispatch.close();
        self.proxy_stop.send(()).unwrap();
        match tokio::time::timeout(DEADLINE, &mut self.proxy_server).await {
            Ok(result) => result.unwrap().unwrap(),
            Err(_) => {
                self.proxy_server.abort();
                let _ = self.proxy_server.await;
                panic!("proxy join timed out; cleanup is not accepted native completion");
            }
        }
    }
}
async fn replay(
    endpoint: &str,
    reference: &str,
    customer: &str,
    key: uuid::Uuid,
    response: &b::OpenResponse,
    observations: &Observations,
) {
    let effects = observations.effects.lock().unwrap().len();
    let creates = observations.creates.lock().unwrap().len();
    let mut client = bounded(b::account_methods_client::AccountMethodsClient::connect(
        endpoint.to_owned(),
    ))
    .await
    .unwrap();
    let replay = bounded(client.open(request(
        reference,
        b::OpenRequest {
            customer_name: customer.into(),
        },
        Some(key),
    )))
    .await
    .unwrap()
    .into_inner();
    assert_eq!(&replay, response);
    assert_eq!(task_id(&replay), task_id(response));
    assert_eq!(
        observations.effects.lock().unwrap().len(),
        effects,
        "replay invoked constructor body"
    );
    assert_eq!(
        observations.creates.lock().unwrap().len(),
        creates,
        "replay wrote native constructor"
    );
}
async fn completion(
    host: &Hosted,
    observations: &Observations,
    response: &b::OpenResponse,
    customer: &str,
    logical_id: &str,
) {
    let channel = bounded(
        tonic::transport::Endpoint::from_shared(host.endpoint.clone())
            .unwrap()
            .connect(),
    )
    .await
    .unwrap();
    let result = bounded(g::AccountMethodsTasksWait::welcome_email(
        channel.clone(),
        request(&reference(logical_id), task_id(response), None),
    ))
    .await
    .unwrap();
    assert_eq!(result, b::WelcomeEmailResponse {});
    // Public Wait can race the forwarding observer by one poll; join real ACK record.
    bounded(async {
        while observations.completions.lock().unwrap().is_empty() {
            tokio::time::sleep(Duration::from_millis(5)).await;
        }
    })
    .await;
    assert_eq!(observations.welcomes.load(Ordering::SeqCst), 1);
    let expected = format!(
        "Hello {customer},\n\nWe are delighted to welcome you as a customer.\nYour new account has been opened, and has ID '{logical_id}'.\n\nBest regards,\nYour Bank"
    );
    assert_eq!(*observations.bodies.lock().unwrap(), vec![expected]);
    let records = observations.completions.lock().unwrap().clone();
    assert_eq!(records.len(), 1);
    assert!(records[0].0.sync && records[0].1.completed);
    let terminal_task = records[0].0.task.as_ref().unwrap();
    assert_eq!(terminal_task.task_id, Some(task_id(response)));
    assert_eq!(terminal_task.method, "WelcomeEmail");
    assert_eq!(terminal_task.status, db::task::Status::Completed as i32);
    assert!(terminal_task.response_or_error.is_some());
    let again = bounded(g::AccountMethodsTasksWait::welcome_email(
        channel,
        request(&reference(logical_id), task_id(response), None),
    ))
    .await
    .unwrap();
    assert_eq!(again, result);
    assert_eq!(observations.welcomes.load(Ordering::SeqCst), 1);
}
async fn first_phase(pending_exit: bool) {
    let (canonical, run) = prerequisites();
    let logical_id = if pending_exit {
        "positive-pending-at-exit"
    } else {
        "positive-complete"
    };
    let customer = "Original positive customer";
    let reference = reference(logical_id);
    let mut direct = bounded(db::database_client::DatabaseClient::connect(
        canonical.clone(),
    ))
    .await
    .unwrap();
    absent(&mut direct, &reference).await;
    let observations = Arc::new(Observations::new(true));
    let host = Hosted::start(&canonical, logical_id, observations.clone(), false).await;
    let before = host.tasks.constructor_uncertainty_status();
    assert!(!before.actor_sealed && !before.actor_retained);
    let mut client = bounded(b::account_methods_client::AccountMethodsClient::connect(
        host.endpoint.clone(),
    ))
    .await
    .unwrap();
    let key = uuid::Uuid::new_v4();
    let outgoing = request(
        &reference,
        b::OpenRequest {
            customer_name: customer.into(),
        },
        Some(key),
    );
    let mut call = tokio::spawn(async move { client.open(outgoing).await });
    bounded(async {
        tokio::select! {
            permit = observations.native_ack.acquire() => permit.unwrap().forget(),
            returned = &mut call => panic!("actual native CreateActorWithTasks ACK barrier failed; preserve actual public/native diagnostic (including UNIMPLEMENTED), no fallback: {returned:?}"),
        }
    }).await;
    assert!(
        !call.is_finished(),
        "actual native ACK escaped observation barrier"
    );
    let create = observations.creates.lock().unwrap()[0].clone();
    let effect = observations.effects.lock().unwrap()[0].clone();
    assert_eq!(
        create.idempotent_mutation.as_ref().unwrap().key,
        key.as_bytes()
    );
    let state = b::Account::decode(
        create
            .actor
            .as_ref()
            .unwrap()
            .state
            .as_ref()
            .unwrap()
            .as_slice(),
    )
    .unwrap();
    assert_eq!(state.customer_name, customer);
    assert_eq!(state.balance, 0);
    readback(&mut direct, &create, &effect.0, false).await;
    let gate = host.store.actor_gate(TYPE, &reference);
    assert!(
        tokio::time::timeout(Duration::from_millis(100), gate.shared())
            .await
            .is_err(),
        "actual constructor exclusive ActorGate must stay held before forwarded ACK"
    );
    assert_eq!(observations.welcomes.load(Ordering::SeqCst), 0);
    println!(
        "POSITIVE_PREFORWARD_NATIVE_ACK run={run} real_actor_gate_held=true welcome_callbacks=0 canonical_actor_pending_task_checkpoint_readback=true"
    );
    observations.forward_ack.add_permits(1);
    let response = bounded(call).await.unwrap().unwrap().into_inner();
    assert_eq!(response, effect.0);
    assert_eq!(
        task_id(&response),
        create.task_upserts[0].task_id.clone().unwrap()
    );
    let released = host.tasks.constructor_uncertainty_status();
    assert!(!released.actor_sealed && !released.actor_retained);
    assert_eq!(released.process_reserved, before.process_reserved);
    drop(bounded(gate.shared()).await);
    replay(
        &host.endpoint,
        &reference,
        customer,
        key,
        &response,
        &observations,
    )
    .await;
    readback(&mut direct, &create, &response, false).await;
    assert_eq!(observations.welcomes.load(Ordering::SeqCst), 0);
    if pending_exit {
        let path = std::env::var("REBOOT_POSITIVE_SAVED_TOKEN")
            .expect("parent supplies NEW saved-token file outside frozen source");
        let token = SavedToken {
            response: response.encode_to_vec(),
            key: key.as_bytes().to_vec(),
            create: Some(create.clone()),
            logical_id: logical_id.into(),
            customer: customer.into(),
            source_run: run.clone(),
        };
        use std::io::Write;
        let mut file = std::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&path)
            .expect("never overwrite a previous first-response token");
        file.write_all(&token.encode_to_vec()).unwrap();
        file.sync_all().unwrap();
        drop(file);
        let saved = SavedToken::decode(std::fs::read(&path).unwrap().as_slice()).unwrap();
        assert_eq!(
            saved, token,
            "read back exact first-response recovery token"
        );
        host.finish().await;
        readback(&mut direct, &create, &response, false).await;
        assert_eq!(observations.welcomes.load(Ordering::SeqCst), 0);
        assert!(observations.completions.lock().unwrap().is_empty());
        println!(
            "POSITIVE_PENDING_AT_SHUTDOWN run={run} token={path} actual_host_joined=true welcome_callbacks=0 task_pending=true PARENT_MUST_OBSERVE_TEST_PROCESS_EXIT_THEN_CXX_EXIT_AND_RESTART_SAME_STATE"
        );
    } else {
        observations.dispatch.close();
        completion(&host, &observations, &response, customer, logical_id).await;
        readback(&mut direct, &create, &response, true).await;
        replay(
            &host.endpoint,
            &reference,
            customer,
            key,
            &response,
            &observations,
        )
        .await;
        readback(&mut direct, &create, &response, true).await;
        let calls = observations.calls.lock().unwrap().clone();
        assert!(!calls.contains(&"CreateActor"));
        assert!(
            !calls.iter().any(|rpc| rpc.starts_with("Transaction")),
            "bounded F3 authority admits no native transaction producer"
        );
        assert_eq!(observations.creates.lock().unwrap().len(), 1);
        assert_eq!(observations.effects.lock().unwrap().len(), 1);
        host.finish().await;
        println!(
            "POSITIVE_COMPLETED run={run} native_create_with_tasks=1 pending_replay=true completed_replay=true stable_response_task_id=true original_welcome_log=1 canonical_complete_task_ack=true public_typed_wait=true"
        );
    }
}
#[tokio::test]
#[ignore = "parent-owned new CXX source RPC, pristine dedicated shard and exact isolated process required"]
async fn original_account_open_native_ack_pending_completed_public_wait() {
    first_phase(false).await;
}
#[tokio::test]
#[ignore = "separate pristine native state; parent owns saved token, process exit and restart"]
async fn original_account_open_pending_at_shutdown_for_restart() {
    first_phase(true).await;
}
#[tokio::test]
#[ignore = "run ONLY after parent verified prior exact test exit and native restart of SAME persisted state"]
async fn original_account_saved_token_restart_recovery_public_wait() {
    let (canonical, run) = prerequisites();
    assert_eq!(
        std::env::var("REBOOT_POSITIVE_RESTART_EVIDENCE").as_deref(),
        Ok("prior-test-exited-native-exited-same-state-restarted"),
        "controller evidence required; declaration does not replace pidfd/state/native-hash proof"
    );
    let path = std::env::var("REBOOT_POSITIVE_SAVED_TOKEN").unwrap();
    let token = SavedToken::decode(std::fs::read(&path).unwrap().as_slice()).unwrap();
    assert_eq!(
        token.source_run, run,
        "wrong controller/source/native correlation"
    );
    assert_eq!(token.logical_id, "positive-pending-at-exit");
    let response = b::OpenResponse::decode(token.response.as_slice()).unwrap();
    let create = token.create.unwrap();
    let key = uuid::Uuid::from_slice(&token.key).unwrap();
    assert_eq!(create.idempotent_mutation.as_ref().unwrap().key, token.key);
    let mut direct = bounded(db::database_client::DatabaseClient::connect(
        canonical.clone(),
    ))
    .await
    .unwrap();
    // This MUST find the actual saved Pending task BEFORE a new host is created.
    readback(&mut direct, &create, &response, false).await;
    let observations = Arc::new(Observations::new(false));
    // Initial native Recover forwards the actual stream. No fresh ready task seed.
    let host = Hosted::start(&canonical, &token.logical_id, observations.clone(), true).await;
    observations.dispatch.close();
    completion(
        &host,
        &observations,
        &response,
        &token.customer,
        &token.logical_id,
    )
    .await;
    readback(&mut direct, &create, &response, true).await;
    replay(
        &host.endpoint,
        &reference(&token.logical_id),
        &token.customer,
        key,
        &response,
        &observations,
    )
    .await;
    readback(&mut direct, &create, &response, true).await;
    assert!(
        observations.effects.lock().unwrap().is_empty()
            && observations.creates.lock().unwrap().is_empty()
    );
    assert!(!observations.calls.lock().unwrap().contains(&"CreateActor"));
    host.finish().await;
    println!(
        "POSITIVE_RESTART_RECOVERED run={run} actual_saved_first_response_token=true prior_pending_readback=true new_host_recover=true constructor_calls=0 original_welcome_log=1 canonical_complete_task_ack=true public_typed_wait=true completed_open_replay_stable=true"
    );
}

#[tonic::async_trait]
impl db::database_server::Database for ObservedDatabase {
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
        let captured = request.get_ref().clone();
        let result = self.client.clone().complete_task(request).await;
        if let Ok(response) = &result {
            self.observations
                .completions
                .lock()
                .unwrap()
                .push((captured, *response.get_ref()));
        }
        result
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
        // Drain every already-forwarded pre-create Recover before native create.
        // Constructor admission scans stay genuine and unblocked. Once set,
        // all later scans wait before native I/O; no scan-count race exists.
        *self.observations.recover_boundary.lock().await = true;
        // Never synthesize success: hold ONLY the real canonical native ACK.
        let result = self.client.clone().create_actor_with_tasks(request).await;
        if result.is_ok() && self.observations.hold_create_ack {
            self.observations.native_ack.add_permits(1);
            self.observations
                .forward_ack
                .acquire()
                .await
                .map_err(|_| tonic::Status::cancelled("controller ACK gate closed"))?
                .forget();
        }
        result
    }
    type RecoverStream = std::pin::Pin<
        Box<dyn tokio_stream::Stream<Item = Result<db::RecoverResponse, tonic::Status>> + Send>,
    >;
    async fn recover(
        &self,
        request: tonic::Request<db::RecoverRequest>,
    ) -> Result<tonic::Response<Self::RecoverStream>, tonic::Status> {
        self.observations.calls.lock().unwrap().push("Recover");
        self.observations
            .recover_calls
            .fetch_add(1, Ordering::SeqCst);
        let boundary = self.observations.recover_boundary.lock().await;
        if *boundary {
            drop(boundary);
            let _ = self.observations.dispatch.acquire().await;
            return self
                .client
                .clone()
                .recover(request)
                .await
                .map(|response| response.map(|stream| Box::pin(stream) as Self::RecoverStream));
        }
        // Buffer only the authentic pre-create stream under the causal lock.
        // No synthetic empty result, dropped record, or skipped admission scan.
        let response = self.client.clone().recover(request).await?;
        let (metadata, mut stream, extensions) = response.into_parts();
        let mut items = Vec::new();
        loop {
            match stream.message().await {
                Ok(Some(item)) => items.push(Ok(item)),
                Ok(None) => break,
                Err(status) => {
                    items.push(Err(status));
                    break;
                }
            }
        }
        drop(boundary);
        Ok(tonic::Response::from_parts(
            metadata,
            Box::pin(tokio_stream::iter(items)) as Self::RecoverStream,
            extensions,
        ))
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

#[path = "native_positive_ack_loss.rs"]
mod native_positive_ack_loss;
