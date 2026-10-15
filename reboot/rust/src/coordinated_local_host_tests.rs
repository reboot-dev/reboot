//! SOURCE638: real ApplicationHost + generated Tasks transport regression.
//! EMPTY transaction graph control, NOT full transaction replay, native CAS,
//! or public Bank acceptance. Parent owns module registration and execution.
use super::*;
use crate::{
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

const DEADLINE: Duration = Duration::from_secs(10);
const METHOD: &str = "tests.reboot.CounterReadsMethods.Read";
const RESPONSE: &str = "type.googleapis.com/tests.reboot.Counter";
struct Account;
impl DurableStateDeclaration for Account {
    type State = crate::proto::Counter;
    const STATE_TYPE: &'static str = "tests.reboot.Counter";
    const TASK_STATE_ADMISSION: StateAdmission = StateAdmission::DefaultOnAbsent;
}
struct ReadCounter(Arc<AtomicUsize>);
#[tonic::async_trait]
impl ReaderTaskBinding for ReadCounter {
    fn validate(&self, task: &db::Task) -> Result<(), Status> {
        if task.method != "Read" {
            return Err(Status::invalid_argument("method"));
        }
        crate::proto::Counter::decode(task.request.as_slice())
            .map_err(|_| Status::invalid_argument("Counter request"))?;
        Ok(())
    }
    fn validate_response(&self, _: &db::Task, response: &prost_types::Any) -> Result<(), Status> {
        if response.type_url != RESPONSE {
            return Err(Status::data_loss("response type"));
        }
        crate::proto::Counter::decode(response.value.as_slice())
            .map_err(|_| Status::data_loss("Counter response"))?;
        Ok(())
    }
    async fn execute(&self, task: &db::Task) -> Result<prost_types::Any, Status> {
        self.0.fetch_add(1, Ordering::SeqCst);
        let request = crate::proto::Counter::decode(task.request.as_slice()).unwrap();
        Ok(prost_types::Any {
            type_url: RESPONSE.into(),
            value: request.encode_to_vec(),
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
        shard_ids: vec!["source638-shard".into()],
        state_tags_by_state_type: [(Account::STATE_TYPE.into(), "Counter".into())].into(),
        skip_idempotent_mutations: true,
    }
}
fn catalog(endpoint: &str) -> LiveTaskWaitCatalog {
    use crate::placement_proto as p;
    let placement = crate::legacy_placement::PlanOnlyLegacyPlacement::new();
    placement
        .install(p::ListenForPlanResponse {
            plan: Some(p::Plan {
                version: 1,
                applications: vec![p::plan::Application {
                    id: "source638-app".into(),
                    services: vec![],
                    shards: vec![p::plan::application::Shard {
                        id: "source638-shard".into(),
                        range: Some(p::plan::application::shard::KeyRange { first_key: vec![] }),
                        server_id: "source638-server".into(),
                        replica_index: 0,
                    }],
                }],
            }),
            servers: vec![p::Server {
                id: "source638-server".into(),
                application_id: "source638-app".into(),
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
        crate::legacy_placement::LegacyApplicationId::new("source638-app").unwrap(),
        "source638-server".into(),
        placement,
        crate::auth::AuthorizationPolicy::permissive_for_development(),
    )
    .unwrap()
}

async fn exercise_host(wrong_bound_participant: bool) {
    let (endpoint, database, database_server) =
        crate::runtime::test_support::start_database().await;
    database.model_control_only_store();
    database.model_task_completion();
    let store = DatabaseActorStore::connect_lazy(&endpoint).unwrap();
    let reference =
        crate::state_ref::StateRef::from_id(Account::STATE_TYPE, &uuid::Uuid::new_v4().to_string())
            .unwrap()
            .to_string();
    let sidecar = Arc::new(TonicParticipantSidecar::connect(&endpoint).await.unwrap());
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
        ParticipantBoundTaskBinding::new(binding_participant, ReadCounter(calls.clone())),
        vec![TaskMethodDeclaration::new::<
            Account,
            crate::proto::Counter,
            crate::proto::Counter,
        >(METHOD, RESPONSE, vec![])],
    )
    .unwrap();
    tasks.set_max_live_deliveries(1).unwrap();
    let id = db::TaskId {
        state_type: Account::STATE_TYPE.into(),
        state_ref: reference.clone(),
        task_uuid: uuid::Uuid::new_v4().as_bytes().to_vec(),
    };
    // Real canonical Pending Store, never inject a completed response into Store.
    store
        .task_database()
        .store(db::StoreRequest {
            sync: true,
            task_upserts: vec![db::Task {
                task_id: Some(id.clone()),
                method: "Read".into(),
                request: crate::proto::Counter { value: 638 }.encode_to_vec(),
                timestamp: Some(prost_types::Timestamp {
                    seconds: 1,
                    nanos: 0,
                }),
                status: db::task::Status::Pending as i32,
                ..Default::default()
            }],
            ..Default::default()
        })
        .await
        .unwrap();
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
        Arc::new(TonicCoordinatorSidecar::connect(&endpoint).await.unwrap()),
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
    let host = ApplicationHost::new("source638-app")
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
        assert!(
            result.is_err(),
            "actual host must reject foreign binding owner"
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
            .insert(crate::STATE_REF_HEADER, reference.parse().unwrap());
        let result = tokio::time::timeout(DEADLINE, client.wait(wait))
            .await
            .unwrap()
            .unwrap()
            .into_inner();
        let Some(db::task_response_or_error::ResponseOrError::Response(actual)) =
            result.response_or_error.unwrap().response_or_error
        else {
            panic!("typed response expected")
        };
        assert_eq!(actual.type_url, RESPONSE);
        assert_eq!(
            crate::proto::Counter::decode(actual.value.as_slice())
                .unwrap()
                .value,
            638
        );
        assert_eq!(calls.load(Ordering::SeqCst), 1);
        // Read back canonical completion, not only the RPC's typed envelope.
        let loaded = store
            .task_database()
            .load(db::LoadRequest {
                task_ids: vec![id],
                ..Default::default()
            })
            .await
            .unwrap()
            .into_inner();
        assert_eq!(loaded.tasks.len(), 1);
        assert_eq!(loaded.tasks[0].status, db::task::Status::Completed as i32);
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
        assert!(phase.prepared_tasks.lock().unwrap().is_none());
        let replacement = MultiOwnerTaskRecovery::new([tasks.clone()], request()).unwrap();
        let mut supervisor = JoinSet::new();
        let replacement_cancel = RecoveryCancellation::new();
        let error = replacement
            .start(&mut supervisor, replacement_cancel.clone())
            .await
            .unwrap_err();
        // Same owner is single-use: successful claim acquisition must reach the
        // consumed receiver check, rather than failing on a retained claim.
        assert_eq!(error.code(), tonic::Code::FailedPrecondition);
        assert_eq!(error.message(), "task recovery already registered");
        replacement_cancel.cancel();
        supervisor.abort_all();
        while tokio::time::timeout(DEADLINE, supervisor.join_next())
            .await
            .unwrap()
            .is_some()
        {}
        assert_eq!(calls.load(Ordering::SeqCst), 1);
    }
    database_server.abort();
    let _ = tokio::time::timeout(DEADLINE, database_server)
        .await
        .unwrap();
}

#[tokio::test]
async fn empty_graph_actual_host_fences_reader_until_ready_and_releases_phase_claims() {
    exercise_host(false).await;
}
#[tokio::test]
async fn empty_graph_actual_host_rejects_same_gate_foreign_bound_participant() {
    exercise_host(true).await;
}
