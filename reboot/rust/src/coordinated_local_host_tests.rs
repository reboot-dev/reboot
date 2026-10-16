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

// SOURCE692: canonical-schema MODEL proxy; not native-engine acceptance.
// Non-control RPCs forward to the existing model database. Recover merges its
// canonical Pending tasks with a mutable two-root transaction model. ACK parking
// occurs on the actual Tonic Abort call, never by manufacturing a Prepare vote.
mod source692 {
    use super::*;
    use tonic::{Request, Response};
    struct BarrierModel {
        page: Mutex<db::RecoverResponse>,
        second: String,
        aborts: Mutex<Vec<String>>,
        acks: AtomicUsize,
        decisions: Mutex<Vec<db::TransactionCoordinatorDecisionPutRequest>>,
        parked: tokio::sync::Semaphore,
        abort_ack: tokio::sync::Semaphore,
        cleanup_entered: tokio::sync::Semaphore,
        cleanup_ack: tokio::sync::Semaphore,
    }
    #[derive(Clone)]
    struct BarrierDatabase {
        client: db::database_client::DatabaseClient<tonic::transport::Channel>,
        model: Arc<BarrierModel>,
    }
    #[tonic::async_trait]
    impl db::database_server::Database for BarrierDatabase {
        async fn get_capabilities(
            &self,
            request: Request<db::DatabaseCapabilitiesRequest>,
        ) -> Result<Response<db::DatabaseCapabilitiesResponse>, Status> {
            self.client.clone().get_capabilities(request).await
        }
        async fn colocated_range(
            &self,
            request: Request<db::ColocatedRangeRequest>,
        ) -> Result<Response<db::ColocatedRangeResponse>, Status> {
            self.client.clone().colocated_range(request).await
        }
        async fn colocated_reverse_range(
            &self,
            request: Request<db::ColocatedReverseRangeRequest>,
        ) -> Result<Response<db::ColocatedReverseRangeResponse>, Status> {
            self.client.clone().colocated_reverse_range(request).await
        }
        async fn find(
            &self,
            request: Request<db::FindRequest>,
        ) -> Result<Response<db::FindResponse>, Status> {
            self.client.clone().find(request).await
        }
        async fn load(
            &self,
            request: Request<db::LoadRequest>,
        ) -> Result<Response<db::LoadResponse>, Status> {
            self.client.clone().load(request).await
        }
        type PreloadStream = tonic::Streaming<db::PreloadResponse>;
        async fn preload(
            &self,
            request: Request<db::PreloadRequest>,
        ) -> Result<Response<Self::PreloadStream>, Status> {
            self.client.clone().preload(request).await
        }
        async fn store(
            &self,
            request: Request<db::StoreRequest>,
        ) -> Result<Response<db::StoreResponse>, Status> {
            self.client.clone().store(request).await
        }
        async fn complete_task(
            &self,
            request: Request<db::CompleteTaskRequest>,
        ) -> Result<Response<db::CompleteTaskResponse>, Status> {
            self.client.clone().complete_task(request).await
        }
        async fn create_actor(
            &self,
            request: Request<db::CreateActorRequest>,
        ) -> Result<Response<db::CreateActorResponse>, Status> {
            self.client.clone().create_actor(request).await
        }
        async fn create_actor_with_tasks(
            &self,
            request: Request<db::CreateActorRequest>,
        ) -> Result<Response<db::CreateActorResponse>, Status> {
            self.client.clone().create_actor_with_tasks(request).await
        }
        type RecoverStream =
            tokio_stream::Iter<std::vec::IntoIter<Result<db::RecoverResponse, Status>>>;
        async fn recover(
            &self,
            request: Request<db::RecoverRequest>,
        ) -> Result<Response<Self::RecoverStream>, Status> {
            let mut stream = self.client.clone().recover(request).await?.into_inner();
            let mut pages = Vec::new();
            while let Some(page) = stream.message().await? {
                pages.push(Ok(page));
            }
            pages.push(Ok(self.model.page.lock().unwrap().clone()));
            Ok(Response::new(tokio_stream::iter(pages)))
        }
        type RecoverIdempotentMutationsStream =
            tonic::Streaming<db::RecoverIdempotentMutationsResponse>;
        async fn recover_idempotent_mutations(
            &self,
            request: Request<db::RecoverIdempotentMutationsRequest>,
        ) -> Result<Response<Self::RecoverIdempotentMutationsStream>, Status> {
            self.client
                .clone()
                .recover_idempotent_mutations(request)
                .await
        }
        async fn transaction_participant_prepare(
            &self,
            request: Request<db::TransactionParticipantPrepareRequest>,
        ) -> Result<Response<db::TransactionParticipantPrepareResponse>, Status> {
            self.client
                .clone()
                .transaction_participant_prepare(request)
                .await
        }
        async fn transaction_participant_commit(
            &self,
            request: Request<db::TransactionParticipantCommitRequest>,
        ) -> Result<Response<db::TransactionParticipantCommitResponse>, Status> {
            self.client
                .clone()
                .transaction_participant_commit(request)
                .await
        }
        async fn transaction_participant_abort(
            &self,
            request: Request<db::TransactionParticipantAbortRequest>,
        ) -> Result<Response<db::TransactionParticipantAbortResponse>, Status> {
            let body = request.get_ref().clone();
            self.model
                .aborts
                .lock()
                .unwrap()
                .push(body.state_ref.clone());
            let result = self
                .client
                .clone()
                .transaction_participant_abort(request)
                .await;
            if result.is_ok() {
                if body.state_ref == self.model.second {
                    self.model.parked.add_permits(1);
                    self.model.abort_ack.acquire().await.unwrap().forget();
                }
                self.model
                    .page
                    .lock()
                    .unwrap()
                    .participant_transactions
                    .retain(|tx| tx.state_ref != body.state_ref);
                self.model.acks.fetch_add(1, Ordering::SeqCst);
            }
            result
        }
        async fn transaction_coordinator_prepared(
            &self,
            request: Request<db::TransactionCoordinatorPreparedRequest>,
        ) -> Result<Response<db::TransactionCoordinatorPreparedResponse>, Status> {
            self.client
                .clone()
                .transaction_coordinator_prepared(request)
                .await
        }
        async fn transaction_coordinator_prepare(
            &self,
            request: Request<db::TransactionCoordinatorPrepareRequest>,
        ) -> Result<Response<db::TransactionCoordinatorPrepareResponse>, Status> {
            self.client
                .clone()
                .transaction_coordinator_prepare(request)
                .await
        }
        async fn transaction_coordinator_cleanup(
            &self,
            request: Request<db::TransactionCoordinatorCleanupRequest>,
        ) -> Result<Response<db::TransactionCoordinatorCleanupResponse>, Status> {
            self.model.cleanup_entered.add_permits(1);
            self.model.cleanup_ack.acquire().await.unwrap().forget();
            let root = uuid::Uuid::from_slice(&request.get_ref().transaction_id).unwrap();
            let result = self
                .client
                .clone()
                .transaction_coordinator_cleanup(request)
                .await;
            if result.is_ok() {
                self.model
                    .page
                    .lock()
                    .unwrap()
                    .transaction_coordinators
                    .remove(&root.to_string());
            }
            result
        }
        async fn transaction_coordinator_decision_put(
            &self,
            request: Request<db::TransactionCoordinatorDecisionPutRequest>,
        ) -> Result<Response<db::TransactionCoordinatorDecisionPutResponse>, Status> {
            assert_eq!(
                self.model.acks.load(Ordering::SeqCst),
                2,
                "coordinator replay polled before BOTH original Abort ACKs"
            );
            self.model
                .decisions
                .lock()
                .unwrap()
                .push(request.get_ref().clone());
            self.client
                .clone()
                .transaction_coordinator_decision_put(request)
                .await
        }
        async fn transaction_coordinator_decision_get(
            &self,
            request: Request<db::TransactionCoordinatorDecisionGetRequest>,
        ) -> Result<Response<db::TransactionCoordinatorDecisionGetResponse>, Status> {
            self.client
                .clone()
                .transaction_coordinator_decision_get(request)
                .await
        }
        async fn export(
            &self,
            request: Request<db::ExportRequest>,
        ) -> Result<Response<db::ExportResponse>, Status> {
            self.client.clone().export(request).await
        }
        type ExportStreamedStream = tonic::Streaming<db::ExportResponse>;
        async fn export_streamed(
            &self,
            request: Request<db::ExportRequest>,
        ) -> Result<Response<Self::ExportStreamedStream>, Status> {
            self.client.clone().export_streamed(request).await
        }
        async fn get_application_metadata(
            &self,
            request: Request<db::GetApplicationMetadataRequest>,
        ) -> Result<Response<db::GetApplicationMetadataResponse>, Status> {
            self.client.clone().get_application_metadata(request).await
        }
        async fn store_application_metadata(
            &self,
            request: Request<db::StoreApplicationMetadataRequest>,
        ) -> Result<Response<db::StoreApplicationMetadataResponse>, Status> {
            self.client
                .clone()
                .store_application_metadata(request)
                .await
        }
        async fn refresh_timestamp(
            &self,
            request: Request<db::RefreshTimestampRequest>,
        ) -> Result<Response<db::RefreshTimestampResponse>, Status> {
            self.client.clone().refresh_timestamp(request).await
        }
    }

    // Same real phase, only observes the real host cancellation/readiness handle.
    struct ObservePhase {
        phase: Arc<Phase>,
        observed: Mutex<Option<oneshot::Sender<RecoveryCancellation>>>,
    }
    #[tonic::async_trait]
    impl HostRecovery for ObservePhase {
        async fn start(
            &self,
            supervisor: &mut JoinSet<Result<(), Status>>,
            cancel: RecoveryCancellation,
        ) -> Result<(), Status> {
            self.observed
                .lock()
                .unwrap()
                .take()
                .unwrap()
                .send(cancel.clone())
                .ok();
            let result = self.phase.start(supervisor, cancel).await;
            eprintln!("SOURCE692 actual phase startup result: {result:?}");
            result
        }
    }
    async fn permit(semaphore: &tokio::sync::Semaphore) {
        tokio::time::timeout(DEADLINE, semaphore.acquire())
            .await
            .unwrap()
            .unwrap()
            .forget();
    }
    async fn exercise(cancel_parked: bool) {
        let (database_endpoint, database, database_server) =
            crate::runtime::test_support::start_database().await;
        database.model_control_only_store();
        database.model_task_completion();
        let refs: Vec<String> = [
            "00000000-0000-0000-0000-000000069201",
            "00000000-0000-0000-0000-000000069202",
        ]
        .into_iter()
        .map(|id| {
            crate::state_ref::StateRef::from_id(Account::STATE_TYPE, id)
                .unwrap()
                .to_string()
        })
        .collect();
        assert!(
            refs[0] < refs[1],
            "phase BTree ordering defines the second parked owner"
        );
        let roots = [uuid::Uuid::from_u128(69201), uuid::Uuid::from_u128(69202)];
        let mut page = db::RecoverResponse::default();
        for (reference, root) in refs.iter().zip(roots) {
            page.participant_transactions.push(db::Transaction {
                state_type: Account::STATE_TYPE.into(),
                state_ref: reference.clone(),
                coordinator_state_type: Account::STATE_TYPE.into(),
                coordinator_state_ref: reference.clone(),
                transaction_ids: vec![root.as_bytes().to_vec()],
                prepared: false,
                ..Default::default()
            });
            page.transaction_coordinators.insert(
                root.to_string(),
                db::TransactionCoordinator {
                    state_ref: reference.clone(),
                    preparing: true,
                    participants: Some(db::Participants {
                        should_commit: [(
                            Account::STATE_TYPE.into(),
                            db::participants::StateRefs {
                                state_refs: vec![reference.clone()],
                            },
                        )]
                        .into(),
                        ..Default::default()
                    }),
                },
            );
        }
        let model = Arc::new(BarrierModel {
            page: Mutex::new(page),
            second: refs[1].clone(),
            aborts: Mutex::new(Vec::new()),
            acks: AtomicUsize::new(0),
            decisions: Mutex::new(Vec::new()),
            parked: tokio::sync::Semaphore::new(0),
            abort_ack: tokio::sync::Semaphore::new(0),
            cleanup_entered: tokio::sync::Semaphore::new(0),
            cleanup_ack: tokio::sync::Semaphore::new(0),
        });
        let proxy = BarrierDatabase {
            client: db::database_client::DatabaseClient::connect(database_endpoint)
                .await
                .unwrap(),
            model: model.clone(),
        };
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let endpoint = format!("http://{}", listener.local_addr().unwrap());
        let proxy_server = tokio::spawn(async move {
            tonic::transport::Server::builder()
                .add_service(db::database_server::DatabaseServer::new(proxy))
                .serve_with_incoming(tokio_stream::wrappers::TcpListenerStream::new(listener))
                .await
        });
        let store = DatabaseActorStore::connect_lazy(&endpoint).unwrap();
        let sidecar = Arc::new(TonicParticipantSidecar::connect(&endpoint).await.unwrap());
        let participants: Vec<_> = refs
            .iter()
            .map(|reference| {
                DurableActorParticipant::new(sidecar.clone(), Account::STATE_TYPE, reference)
                    .with_database_actor_gate(&store)
            })
            .collect();
        let calls = Arc::new(AtomicUsize::new(0));
        let mut tasks = Vec::new();
        for participant in &participants {
            let target = participant.actor_target();
            let owner_tasks = OneShotTasks::new_with_participant_declarations(
                store.clone(),
                Account::STATE_TYPE.into(),
                target.state_ref.clone(),
                ParticipantBoundTaskBinding::new(participant.clone(), ReadCounter(calls.clone())),
                vec![TaskMethodDeclaration::new::<
                    Account,
                    crate::proto::Counter,
                    crate::proto::Counter,
                >(METHOD, RESPONSE, vec![])],
            )
            .unwrap();
            owner_tasks.set_max_live_deliveries(1).unwrap();
            store
                .task_database()
                .store(db::StoreRequest {
                    sync: true,
                    task_upserts: vec![db::Task {
                        task_id: Some(db::TaskId {
                            state_type: Account::STATE_TYPE.into(),
                            state_ref: target.state_ref,
                            task_uuid: uuid::Uuid::new_v4().as_bytes().to_vec(),
                        }),
                        method: "Read".into(),
                        request: crate::proto::Counter { value: 692 }.encode_to_vec(),
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
            tasks.push(owner_tasks);
        }
        let resolver = Arc::new(
            ExactParticipantResolver::new(participants.iter().map(|p| {
                (
                    p.actor_target(),
                    Arc::new(InProcessParticipantEndpoint::new(
                        DurableActorParticipantHost::new(p.clone()),
                    )),
                )
            }))
            .unwrap(),
        );
        let coordinator_sidecar =
            Arc::new(TonicCoordinatorSidecar::connect(&endpoint).await.unwrap());
        let coordinators: Vec<_> = participants
            .iter()
            .map(|p| LocalCoordinator {
                target: p.actor_target(),
                owner: DurableRootCoordinator::new(coordinator_sidecar.clone(), resolver.clone())
                    .with_identity(p.actor_target()),
            })
            .collect();
        let phase = CoordinatedLocalRecovery::new(
            store.clone(),
            request(),
            participants.clone(),
            coordinators,
            resolver,
            MultiOwnerTaskRecovery::new(tasks.clone(), request()).unwrap(),
        )
        .unwrap();
        let (observed_tx, observed_rx) = oneshot::channel();
        let (stop_tx, stop_rx) = oneshot::channel();
        // Mount a real canonical Watch service to obtain the host's serving
        // router; the phase still uses its exact closed in-process Watch routes.
        // This does not claim independent public Watch-path execution.
        let host = ApplicationHost::new("source692")
            .with_host_recovery(ObservePhase {
                phase: phase.clone(),
                observed: Mutex::new(Some(observed_tx)),
            })
            .add_public_service(db::coordinator_server::CoordinatorServer::new(
                crate::legacy_coordinator::DurableCoordinatorWatchHost::new(
                    coordinator_sidecar.clone(),
                    Account::STATE_TYPE,
                    refs[0].clone(),
                )
                .unwrap(),
            ));
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let mut serving = tokio::spawn(host.serve_with_listener_shutdown(listener, async move {
            let _ = stop_rx.await;
        }));
        let cancel = tokio::time::timeout(DEADLINE, observed_rx)
            .await
            .unwrap()
            .unwrap();
        tokio::select! {
            _ = permit(&model.parked) => {},
            result = &mut serving => panic!("SOURCE692 host exited before second Abort ACK park: {result:?}"),
        } // actual second Abort entered; first ACK returned
        assert_eq!(model.aborts.lock().unwrap().as_slice(), refs.as_slice());
        assert_eq!(model.acks.load(Ordering::SeqCst), 1);
        assert!(model.decisions.lock().unwrap().is_empty());
        assert_eq!(calls.load(Ordering::SeqCst), 0);
        assert!(
            tokio::time::timeout(Duration::from_millis(50), cancel.public_ready())
                .await
                .is_err()
        );
        // Probe the ORIGINAL owner: its actor gate must remain held while Abort is uncertain.
        let gate = store.actor_gate(Account::STATE_TYPE, &refs[1]);
        assert!(
            tokio::time::timeout(Duration::from_millis(50), gate.shared())
                .await
                .is_err()
        );
        if cancel_parked {
            stop_tx.send(()).unwrap();
            // ApplicationHost treats an explicit pre-Ready stop as graceful.
            // That return value is NOT transaction convergence: the assertions
            // below still require failed Ready and retained uncertain ownership.
            tokio::time::timeout(DEADLINE, &mut serving)
                .await
                .unwrap()
                .unwrap()
                .unwrap();
            assert!(cancel.public_ready().await.is_err());
            // A cancelled phase is single-use and must not issue another Abort/replay.
            let mut supervisor = JoinSet::new();
            assert!(phase.start(&mut supervisor, cancel.clone()).await.is_err());
            assert_eq!(model.aborts.lock().unwrap().as_slice(), refs.as_slice());
            assert_eq!(model.acks.load(Ordering::SeqCst), 1);
            assert!(model.decisions.lock().unwrap().is_empty());
            assert_eq!(calls.load(Ordering::SeqCst), 0);
            assert!(phase.prepared_tasks.lock().unwrap().is_some());
            assert!(
                tokio::time::timeout(Duration::from_millis(50), gate.shared())
                    .await
                    .is_err(),
                "original uncertain actor gate released on startup cancellation"
            );
            let retry = tokio::time::timeout(
                Duration::from_millis(50),
                participants[1].converge_recovered_unprepared(),
            )
            .await;
            if let Ok(result) = retry {
                assert!(
                    result.is_err(),
                    "uncertain original owner must not report convergence"
                );
            }
            assert_eq!(model.aborts.lock().unwrap().len(), 2);
        } else {
            model.abort_ack.add_permits(1);
            permit(&model.cleanup_entered).await;
            assert_eq!(model.acks.load(Ordering::SeqCst), 2);
            assert_eq!(model.decisions.lock().unwrap().len(), 1);
            assert_eq!(calls.load(Ordering::SeqCst), 0);
            assert!(
                tokio::time::timeout(Duration::from_millis(50), cancel.public_ready())
                    .await
                    .is_err()
            );
            model.cleanup_ack.add_permits(1);
            permit(&model.cleanup_entered).await;
            assert_eq!(model.decisions.lock().unwrap().len(), 2);
            assert_eq!(calls.load(Ordering::SeqCst), 0);
            model.cleanup_ack.add_permits(1);
            tokio::time::timeout(DEADLINE, cancel.public_ready())
                .await
                .unwrap()
                .unwrap();
            tokio::time::timeout(DEADLINE, async {
                while calls.load(Ordering::SeqCst) != 2
                    || tasks
                        .iter()
                        .any(|owner| owner.acknowledged_read_operations() != 1)
                {
                    tokio::task::yield_now().await;
                }
            })
            .await
            .unwrap();
            for decision in model.decisions.lock().unwrap().iter() {
                assert_eq!(
                    decision.decision.as_ref().unwrap().outcome,
                    db::transaction_coordinator_decision::Outcome::Abort as i32
                );
            }
            {
                let scan = model.page.lock().unwrap();
                assert!(scan.participant_transactions.is_empty());
                assert!(scan.transaction_coordinators.is_empty());
            }
            stop_tx.send(()).unwrap();
            tokio::time::timeout(DEADLINE, &mut serving)
                .await
                .unwrap()
                .unwrap()
                .unwrap();
        }
        proxy_server.abort();
        let _ = proxy_server.await;
        database_server.abort();
        let _ = database_server.await;
    }
    #[tokio::test]
    async fn both_original_abort_acks_fence_two_root_replay_and_actual_host_ready() {
        exercise(false).await;
    }
    #[tokio::test]
    async fn cancellation_at_second_abort_retains_phase_and_forbids_repeat_replay() {
        exercise(true).await;
    }
}
