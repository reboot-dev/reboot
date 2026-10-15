//! SOURCE653: native external-DB closed-host Pending task recovery candidate.
//! Trusted handwritten Balance reader + original schema; not generated adapter,
//! constructor, SignUp, native CAS, transaction replay or public acceptance.
//! Parent must compile/review/freeze/run separately; no native execution performed.
//!
//! Per-case external ServerInfo contract (both ignored cases, separate pristine
//! DB/process/custody each): application Python3.12's generated database_pb2
//! ServerInfo(shard_infos=[ShardInfo(shard_id="s000000000", shard_first_key=b"")]).
//! SerializeToString using actual cached application protobuf, not handwritten
//! bytes. Receipt: exact full test case name, verified=true, actual_protobuf=true,
//! shard_infos=[{shard_id:"s000000000",shard_first_key_hex:""}], protobuf path/hash,
//! pinned application_python and generated_db_module path/hash, serializer_join
//! joined=true/exit=0. Same canonical Account/Bank state descriptors as original
//! 15-case fixture; no additional state type or serializer schema is introduced.
//! Do NOT insert these cases into the existing qualified 15-case worker. Parent
//! must create a separate source freeze, reviewed case inventory and custody run.
//! This directory is a two-file SOURCE OVERLAY, not a standalone Cargo package.
use super::*;
use reboot::{
    application_host::RecoveryCancellation,
    coordinated_local_recovery::{CoordinatedLocalRecovery, LocalCoordinator},
    one_shot_tasks::MultiOwnerTaskRecovery,
};
use reboot::{
    application_host::{ApplicationHost, HostRecovery},
    durable_coordinator::TonicCoordinatorSidecar,
    durable_participant::{DurableActorParticipantHost, TonicParticipantSidecar},
    one_shot_tasks::{
        LiveTaskWaitCatalog, OneShotTasks, ParticipantBoundTaskBinding, ReaderTaskBinding,
        TaskMethodDeclaration,
    },
    runtime::{DurableStateDeclaration, StateAdmission},
};
use std::{
    sync::{Mutex, atomic::AtomicUsize},
    time::Duration,
};
use tokio::{sync::oneshot, task::JoinSet};

const METHOD: &str = "bank.v1.AccountMethods.Balance";
const RESPONSE: &str = "type.googleapis.com/bank.v1.BalanceResponse";
struct Account;
impl DurableStateDeclaration for Account {
    type State = b::Account;
    const STATE_TYPE: &'static str = "bank.v1.Account";
    const TASK_STATE_ADMISSION: StateAdmission = StateAdmission::RequireExisting;
}
struct CanonicalBalanceReader {
    calls: Arc<AtomicUsize>,
    endpoint: String,
}
#[tonic::async_trait]
impl ReaderTaskBinding for CanonicalBalanceReader {
    fn validate(&self, task: &db::Task) -> Result<(), Status> {
        if task.method != "Balance" {
            return Err(Status::invalid_argument("method"));
        }
        b::BalanceRequest::decode(task.request.as_slice())
            .map_err(|_| Status::invalid_argument("Balance request"))?;
        Ok(())
    }
    fn validate_response(&self, _: &db::Task, response: &prost_types::Any) -> Result<(), Status> {
        if response.type_url != RESPONSE {
            return Err(Status::data_loss("response type"));
        }
        b::BalanceResponse::decode(response.value.as_slice())
            .map_err(|_| Status::data_loss("Balance response"))?;
        Ok(())
    }
    async fn execute(&self, task: &db::Task) -> Result<prost_types::Any, Status> {
        // Trusted handwritten binding: NOT generated adapter coverage. The real
        // scheduler holds the original participant gate; read actual canonical bytes.
        self.calls.fetch_add(1, Ordering::SeqCst);
        b::BalanceRequest::decode(task.request.as_slice()).unwrap();
        let id = task.task_id.as_ref().expect("task identity");
        assert_eq!(id.state_type, ACCOUNT);
        let mut client = bounded(db::database_client::DatabaseClient::connect(
            self.endpoint.clone(),
        ))
        .await
        .map_err(|error| Status::unavailable(error.to_string()))?;
        let bytes = load(&mut client, ACCOUNT, &id.state_ref)
            .await
            .expect("pre-existing canonical Account");
        let state = b::Account::decode(bytes.as_slice()).unwrap();
        assert_eq!(state.customer_name, "source653-canonical-account");
        Ok(prost_types::Any {
            type_url: RESPONSE.into(),
            value: b::BalanceResponse {
                balance: state.balance,
            }
            .encode_to_vec(),
        })
    }
}
type Phase = CoordinatedLocalRecovery<TonicParticipantSidecar, TonicCoordinatorSidecar>;

// This registers the SAME Arc phase as HostRecovery, not a replacement recovery
// implementation: only catalog binding/installation is added around its start.
struct CatalogPhase {
    phase: Arc<Phase>,
    catalog: LiveTaskWaitCatalog,
    tasks: OneShotTasks,
    observed: Mutex<Option<oneshot::Sender<RecoveryCancellation>>>,
}
#[tonic::async_trait]
impl HostRecovery for CatalogPhase {
    async fn start(
        &self,
        supervisor: &mut JoinSet<Result<(), Status>>,
        cancel: RecoveryCancellation,
    ) -> Result<(), Status> {
        self.catalog.bind_host(cancel.clone())?;
        self.observed
            .lock()
            .unwrap()
            .take()
            .unwrap()
            .send(cancel.clone())
            .ok();
        self.phase.start(supervisor, cancel.clone()).await?;
        self.catalog.install(self.tasks.clone(), cancel)?;
        Ok(())
    }
}
// Registered AFTER the phase. The host itself must withhold public readiness
// while this start remains pending; the dispatcher is already supervised.
struct AfterPhaseGate {
    entered: Mutex<Option<oneshot::Sender<()>>>,
    release: Mutex<Option<oneshot::Receiver<()>>>,
}
#[tonic::async_trait]
impl HostRecovery for AfterPhaseGate {
    async fn start(
        &self,
        _: &mut JoinSet<Result<(), Status>>,
        cancel: RecoveryCancellation,
    ) -> Result<(), Status> {
        self.entered.lock().unwrap().take().unwrap().send(()).ok();
        let release = self.release.lock().unwrap().take().unwrap();
        tokio::select! {
            _ = cancel.cancelled() => Err(Status::cancelled("gate cancelled")),
            result = release => result.map_err(|_| Status::cancelled("gate dropped")),
        }
    }
}
fn request() -> db::RecoverRequest {
    db::RecoverRequest {
        shard_ids: vec!["s000000000".into()],
        state_tags_by_state_type: [(Account::STATE_TYPE.into(), "Account".into())].into(),
        skip_idempotent_mutations: true,
    }
}
fn catalog(endpoint: &str) -> LiveTaskWaitCatalog {
    use reboot::placement_proto as p;
    let placement = reboot::legacy_placement::PlanOnlyLegacyPlacement::new();
    placement
        .install(p::ListenForPlanResponse {
            plan: Some(p::Plan {
                version: 1,
                applications: vec![p::plan::Application {
                    id: "source653-app".into(),
                    services: vec![],
                    shards: vec![p::plan::application::Shard {
                        id: "s000000000".into(),
                        range: Some(p::plan::application::shard::KeyRange { first_key: vec![] }),
                        server_id: "source653-server".into(),
                        replica_index: 0,
                    }],
                }],
            }),
            servers: vec![p::Server {
                id: "source653-server".into(),
                application_id: "source653-app".into(),
                address: Some(p::server::Address {
                    host: "localhost".into(),
                    port: 5001,
                }),
                ..Default::default()
            }],
        })
        .unwrap();
    LiveTaskWaitCatalog::new(
        endpoint.into(),
        Account::STATE_TYPE.into(),
        1,
        reboot::legacy_placement::LegacyApplicationId::new("source653-app").unwrap(),
        "source653-server".into(),
        placement,
        reboot::auth::AuthorizationPolicy::permissive_for_development(),
    )
    .unwrap()
}

async fn exercise_host(wrong_bound_participant: bool) {
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
    let proxy_listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let endpoint = format!("http://{}", proxy_listener.local_addr().unwrap());
    let (proxy_stop, proxy_stopped) = oneshot::channel();
    let mut database_server = tokio::spawn(async move {
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
    let store = DatabaseActorStore::connect_lazy(&endpoint).unwrap();
    let mut task_client = bounded(db::database_client::DatabaseClient::connect(
        endpoint.clone(),
    ))
    .await
    .unwrap();
    let reference = reboot::state_ref::StateRef::from_id(
        Account::STATE_TYPE,
        &format!("source653-{run}-{wrong_bound_participant}"),
    )
    .unwrap()
    .to_string();
    let sidecar = Arc::new(
        bounded(TonicParticipantSidecar::connect(&endpoint))
            .await
            .unwrap(),
    );
    let participant =
        DurableActorParticipant::new(sidecar.clone(), Account::STATE_TYPE, &reference)
            .with_database_actor_gate(&store);
    // Deliberately identical target/store/gate, but a DISTINCT participant owner.
    let binding_participant = if wrong_bound_participant {
        DurableActorParticipant::new(sidecar, Account::STATE_TYPE, &reference)
            .with_database_actor_gate(&store)
    } else {
        participant.clone()
    };
    let calls = Arc::new(AtomicUsize::new(0));
    let tasks = OneShotTasks::new_with_participant_declarations(
        store.clone(),
        Account::STATE_TYPE.into(),
        reference.clone(),
        ParticipantBoundTaskBinding::new(
            binding_participant,
            CanonicalBalanceReader {
                calls: calls.clone(),
                endpoint: endpoint.clone(),
            },
        ),
        vec![TaskMethodDeclaration::new::<
            Account,
            b::BalanceRequest,
            b::BalanceResponse,
        >(METHOD, RESPONSE, vec![])],
    )
    .unwrap();
    tasks.set_max_live_deliveries(1).unwrap();
    let id = db::TaskId {
        state_type: Account::STATE_TYPE.into(),
        state_ref: reference.clone(),
        task_uuid: uuid::Uuid::new_v4().as_bytes().to_vec(),
    };
    let expected_state = b::Account {
        customer_name: "source653-canonical-account".into(),
        balance: 653,
    };
    let mut direct = bounded(db::database_client::DatabaseClient::connect(
        canonical.clone(),
    ))
    .await
    .unwrap();
    assert_no_inventory(&mut direct).await;
    assert!(load(&mut direct, ACCOUNT, &reference).await.is_none());
    let timestamp = bounded(direct.refresh_timestamp(db::RefreshTimestampRequest {}))
        .await
        .unwrap()
        .into_inner()
        .timestamp
        .unwrap();
    // Same canonical fixture configuration route as existing native cases. This
    // is a pre-existing actor/Pending-task prerequisite, NOT constructor CAS.
    // Never seed Completed and never claim original SignUp/native CAS acceptance.
    bounded(task_client.store(db::StoreRequest {
        sync: true,
        actor_upserts: vec![db::Actor {
            state_type: ACCOUNT.into(),
            state_ref: reference.clone(),
            state: Some(expected_state.encode_to_vec()),
        }],
        task_upserts: vec![db::Task {
            task_id: Some(id.clone()),
            method: "Balance".into(),
            request: b::BalanceRequest {}.encode_to_vec(),
            timestamp: Some(timestamp),
            status: db::task::Status::Pending as i32,
            ..Default::default()
        }],
        ..Default::default()
    }))
    .await
    .unwrap();
    assert_eq!(
        load(&mut direct, ACCOUNT, &reference).await,
        Some(expected_state.encode_to_vec())
    );
    let initial = recover(&mut direct).await;
    assert!(initial.iter().all(|p| p.participant_transactions.is_empty() && p.transaction_coordinators.is_empty()), "EMPTY transaction graph only");
    assert_eq!(
        initial
            .iter()
            .flat_map(|p| &p.pending_tasks)
            .filter(|t| t.task_id.as_ref() == Some(&id))
            .count(),
        1
    );
    let resolver = Arc::new(
        ExactParticipantResolver::new([(
            participant.actor_target(),
            Arc::new(InProcessParticipantEndpoint::new(
                DurableActorParticipantHost::new(participant.clone()),
            )),
        )])
        .unwrap(),
    );
    // EMPTY graph control: real coordinator allocation uses the SAME exact Arc;
    // no transaction records are seeded, so no full replay claim follows.
    let coordinator = DurableRootCoordinator::new(
        Arc::new(
            bounded(TonicCoordinatorSidecar::connect(&endpoint))
                .await
                .unwrap(),
        ),
        resolver.clone(),
    )
    .with_identity(participant.actor_target());
    let phase = CoordinatedLocalRecovery::new(
        store.clone(),
        request(),
        [participant.clone()],
        [LocalCoordinator {
            target: participant.actor_target(),
            owner: coordinator,
        }],
        resolver,
        MultiOwnerTaskRecovery::new([tasks.clone()], request()).unwrap(),
    )
    .unwrap();
    let catalog = catalog(&endpoint);
    let (observed_tx, observed_rx) = oneshot::channel();
    let (entered_tx, mut entered_rx) = oneshot::channel();
    let (release_tx, release_rx) = oneshot::channel();
    let (stop_tx, stop_rx) = oneshot::channel();
    let host = ApplicationHost::new("source653-app")
        .with_host_recovery(CatalogPhase {
            phase: phase.clone(),
            catalog: catalog.clone(),
            tasks: tasks.clone(),
            observed: Mutex::new(Some(observed_tx)),
        })
        .with_host_recovery(AfterPhaseGate {
            entered: Mutex::new(Some(entered_tx)),
            release: Mutex::new(Some(release_rx)),
        })
        .add_public_service(catalog.service());
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    let mut serving = tokio::spawn(host.serve_with_listener_shutdown(listener, async move {
        let _ = stop_rx.await;
    }));
    let cancel = tokio::time::timeout(DEADLINE, observed_rx)
        .await
        .unwrap()
        .unwrap();
    if wrong_bound_participant {
        let result = tokio::time::timeout(DEADLINE, &mut serving)
            .await
            .unwrap()
            .unwrap();
        let error = result.expect_err("actual host must reject foreign binding owner");
        assert!(
            error
                .to_string()
                .contains("task owner belongs to another participant allocation"),
            "unexpected startup error: {error}"
        );
        assert!(cancel.public_ready().await.is_err());
        assert_eq!(calls.load(Ordering::SeqCst), 0);
        assert!(
            entered_rx.try_recv().is_err(),
            "later registration must not start"
        );
        drop(release_tx);
        drop(stop_tx);
    } else {
        tokio::time::timeout(DEADLINE, &mut entered_rx)
            .await
            .unwrap()
            .unwrap();
        assert_eq!(
            calls.load(Ordering::SeqCst),
            0,
            "phase start must not bypass HostReady"
        );
        assert!(
            tokio::time::timeout(Duration::from_millis(50), cancel.public_ready())
                .await
                .is_err(),
            "actual host readiness must remain blocked by later recovery"
        );
        assert_eq!(calls.load(Ordering::SeqCst), 0);
        release_tx.send(()).unwrap();
        tokio::time::timeout(DEADLINE, cancel.public_ready())
            .await
            .unwrap()
            .unwrap();
        let mut client = tokio::time::timeout(
            DEADLINE,
            db::tasks_client::TasksClient::connect(format!("http://{address}")),
        )
        .await
        .unwrap()
        .unwrap();
        let mut wait = tonic::Request::new(db::WaitRequest {
            task_id: Some(id.clone()),
        });
        wait.metadata_mut()
            .insert("x-reboot-state-ref", reference.parse().unwrap());
        let result = tokio::time::timeout(DEADLINE, client.wait(wait))
            .await
            .unwrap()
            .unwrap()
            .into_inner();
        let Some(db::task_response_or_error::ResponseOrError::Response(actual)) =
            result.response_or_error.clone().unwrap().response_or_error
        else {
            panic!("typed response expected")
        };
        assert_eq!(actual.type_url, RESPONSE);
        assert_eq!(
            b::BalanceResponse::decode(actual.value.as_slice())
                .unwrap()
                .balance,
            653
        );
        assert_eq!(calls.load(Ordering::SeqCst), 1);
        // Read back canonical completion, not only the RPC's typed envelope.
        let loaded = bounded(task_client.load(db::LoadRequest {
            task_ids: vec![id.clone()],
            ..Default::default()
        }))
        .await
        .unwrap()
        .into_inner();
        assert_eq!(loaded.tasks.len(), 1);
        assert_eq!(loaded.tasks[0].status, db::task::Status::Completed as i32);
        assert_eq!(loaded.tasks[0].task_id.as_ref(), Some(&id));
        let Some(db::task::ResponseOrError::Response(persisted)) =
            &loaded.tasks[0].response_or_error
        else {
            panic!("canonical Task.Load must carry success payload");
        };
        assert_eq!(persisted.type_url, actual.type_url);
        assert_eq!(persisted.value, actual.value);
        assert_eq!(
            load(&mut direct, ACCOUNT, &reference).await,
            Some(expected_state.encode_to_vec())
        );
        let completions: Vec<_> = observations
            .events()
            .into_iter()
            .filter(|e| e.method == "CompleteTask")
            .collect();
        assert_eq!(
            completions.len(),
            1,
            "real canonical CompleteTask, exactly once"
        );
        assert!(completions[0].code.is_none() && completions[0].response.is_some());
        drop(client);
        stop_tx.send(()).unwrap();
        tokio::time::timeout(DEADLINE, &mut serving)
            .await
            .unwrap()
            .unwrap()
            .unwrap();
        assert!(cancel.public_ready().await.is_err());
        // Hold the strong phase reference across shutdown: it must NOT retain
        // PreparedSharedTaskStartup's dispatch claims after successful activation.
        // Private phase fields intentionally not inspected from external fixture.
        let replacement = MultiOwnerTaskRecovery::new([tasks.clone()], request()).unwrap();
        let replacement_host = ApplicationHost::new("source653-replacement")
            .with_host_recovery(replacement)
            .add_public_service(catalog.service());
        let replacement_listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let error = bounded(
            replacement_host
                .serve_with_listener_shutdown(replacement_listener, std::future::pending::<()>()),
        )
        .await
        .expect_err("one-shot receiver is consumed");
        assert!(
            error
                .to_string()
                .contains("task recovery already registered"),
            "unexpected replacement recovery: {error}"
        );
        assert_eq!(calls.load(Ordering::SeqCst), 1);
    }
    if wrong_bound_participant {
        let loaded = bounded(task_client.load(db::LoadRequest {
            task_ids: vec![id.clone()],
            ..Default::default()
        }))
        .await
        .unwrap()
        .into_inner();
        assert_eq!(loaded.tasks.len(), 1);
        assert_eq!(loaded.tasks[0].status, db::task::Status::Pending as i32);
        assert_eq!(loaded.tasks[0].task_id.as_ref(), Some(&id));
        assert!(loaded.tasks[0].response_or_error.is_none());
        assert_eq!(
            load(&mut direct, ACCOUNT, &reference).await,
            Some(expected_state.encode_to_vec())
        );
        assert!(
            !observations
                .events()
                .iter()
                .any(|event| event.method == "CompleteTask")
        );
    }
    proxy_stop.send(()).unwrap();
    bounded(&mut database_server).await.unwrap().unwrap();
}

#[tokio::test]
#[ignore = "parent-owned exclusive canonical native database and ServerInfo required"]
async fn empty_graph_actual_host_fences_reader_until_ready_and_releases_phase_claims() {
    exercise_host(false).await;
    println!(
        "CLOSED_LOCAL_HOST_NATIVE_ASSERTIONS_COMPLETED case=ReaderReady empty_transaction_graph=true"
    );
}
#[tokio::test]
#[ignore = "parent-owned exclusive canonical native database and ServerInfo required"]
async fn empty_graph_actual_host_rejects_same_gate_foreign_bound_participant() {
    exercise_host(true).await;
    println!(
        "CLOSED_LOCAL_HOST_NATIVE_ASSERTIONS_COMPLETED case=WrongOwner empty_transaction_graph=true"
    );
}
