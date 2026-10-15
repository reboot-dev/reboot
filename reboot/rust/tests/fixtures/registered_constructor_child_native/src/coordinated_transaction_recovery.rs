//! SOURCE667 source-only native NONEMPTY transaction graph controls.
//! Overlay base: 01a55dcc398786ff5b4326d7a771bb3d47cdbbe7.
//! No generated-handler, constructor CAS, task/checkpoint replay or crash proof.
//! Each case needs its OWN pristine canonical Database/process and ServerInfo:
//! ServerInfo(shard_infos=[ShardInfo(shard_id="s000000000", shard_first_key=b"")]).
//! Parent serializes with actual cached application Python/generated database_pb2;
//! pins per-case interpreter/module/protobuf/binary/source hashes and genuine join.
//! Exact descriptors: bank.v1.Account (tag Account), bank.v1.Bank (tag Bank),
//! existing fixture's unchanged descriptors. No new protobuf/state descriptor.
//! Hook suggestion ONLY in native.rs: #[path = "coordinated_transaction_recovery.rs"]
//! mod coordinated_transaction_recovery;
use super::*;
use reboot::{
    application_host::{HostRecovery, RecoveryCancellation},
    coordinated_local_recovery::{CoordinatedLocalRecovery, LocalCoordinator},
    one_shot_tasks::{
        MultiOwnerTaskRecovery, OneShotTasks, ParticipantBoundTaskBinding, ReaderTaskBinding,
        TaskMethodDeclaration,
    },
    runtime::{DurableStateDeclaration, StateAdmission},
};
use tokio::{sync::oneshot, task::JoinSet};

struct Account;
impl DurableStateDeclaration for Account {
    type State = b::Account;
    const STATE_TYPE: &'static str = "bank.v1.Account";
    const TASK_STATE_ADMISSION: StateAdmission = StateAdmission::RequireExisting;
}
// Trusted handwritten declaration binding, NOT a generated reader proof. No task
// is ever seeded: a callback is a hard failure, not a fabricated Ready signal.
struct EmptyReader;
#[tonic::async_trait]
impl ReaderTaskBinding for EmptyReader {
    fn validate(&self, _: &db::Task) -> Result<(), Status> {
        Err(Status::failed_precondition(
            "SOURCE667 requires empty task inventory",
        ))
    }
    async fn execute(&self, _: &db::Task) -> Result<prost_types::Any, Status> {
        panic!("SOURCE667 empty task owner must never execute")
    }
}
type Phase = CoordinatedLocalRecovery<TonicParticipantSidecar, TonicCoordinatorSidecar>;
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
        self.phase.start(supervisor, cancel).await
    }
}
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
            _ = cancel.cancelled() => Err(Status::cancelled("SOURCE667 gate cancelled")),
            result = release => result.map_err(|_| Status::cancelled("SOURCE667 gate dropped")),
        }
    }
}
fn recovery_request() -> db::RecoverRequest {
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
async fn decision(
    client: &mut db::database_client::DatabaseClient<tonic::transport::Channel>,
    root: Uuid,
    reference: &str,
) -> Option<db::TransactionCoordinatorDecision> {
    bounded(client.transaction_coordinator_decision_get(
        db::TransactionCoordinatorDecisionGetRequest {
            root_transaction_id: root.as_bytes().to_vec(),
            coordinator_state_ref: reference.into(),
        },
    ))
    .await
    .unwrap()
    .into_inner()
    .decision
}
async fn exercise(commit: bool) {
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
    let mut proxy_server = tokio::spawn(async move {
        tonic::transport::Server::builder()
            .add_service(db::database_server::DatabaseServer::new(proxy))
            .serve_with_incoming_shutdown(
                tokio_stream::wrappers::TcpListenerStream::new(listener),
                async {
                    let _ = proxy_stopped.await;
                },
            )
            .await
    });
    let store = DatabaseActorStore::connect_lazy(&endpoint).unwrap();
    let mut seed = bounded(db::database_client::DatabaseClient::connect(
        endpoint.clone(),
    ))
    .await
    .unwrap();
    let mut direct = bounded(db::database_client::DatabaseClient::connect(canonical))
        .await
        .unwrap();
    assert_no_inventory(&mut direct).await;
    let reference = state_ref(ACCOUNT, &format!("source667-{run}-{commit}"));
    let root = Uuid::new_v4();
    let before = b::Account {
        customer_name: "source667-canonical-account".into(),
        balance: 667,
    }
    .encode_to_vec();
    let after = b::Account {
        customer_name: "source667-canonical-account".into(),
        balance: 1667,
    }
    .encode_to_vec();
    assert!(load(&mut direct, ACCOUNT, &reference).await.is_none());
    assert!(decision(&mut direct, root, &reference).await.is_none());
    // Ordinary actor prerequisite only. Transaction/control records are NEVER
    // fabricated or Store-upserted; native APIs create every pending record.
    bounded(seed.store(db::StoreRequest {
        sync: true,
        actor_upserts: vec![db::Actor {
            state_type: ACCOUNT.into(),
            state_ref: reference.clone(),
            state: Some(before.clone()),
        }],
        ..Default::default()
    }))
    .await
    .unwrap();
    let sidecar = Arc::new(
        bounded(TonicParticipantSidecar::connect(&endpoint))
            .await
            .unwrap(),
    );
    let participant =
        DurableActorParticipant::new(sidecar, ACCOUNT, &reference).with_database_actor_gate(&store);
    let resolver = Arc::new(
        ExactParticipantResolver::new([(
            participant.actor_target(),
            Arc::new(InProcessParticipantEndpoint::new(
                DurableActorParticipantHost::new(participant.clone()),
            )),
        )])
        .unwrap(),
    );
    let coordinator_sidecar = Arc::new(
        bounded(TonicCoordinatorSidecar::connect(&endpoint))
            .await
            .unwrap(),
    );
    let watch_service = db::coordinator_server::CoordinatorServer::new(
        reboot::legacy_coordinator::DurableCoordinatorWatchHost::new(
            coordinator_sidecar.clone(),
            ACCOUNT.to_string(),
            reference.clone(),
        )
        .unwrap(),
    );
    let coordinator = DurableRootCoordinator::new(coordinator_sidecar, resolver.clone())
        .with_identity(participant.actor_target());
    let tasks = OneShotTasks::new_with_participant_declarations(
        store.clone(),
        ACCOUNT.into(),
        reference.clone(),
        ParticipantBoundTaskBinding::new(participant.clone(), EmptyReader),
        vec![TaskMethodDeclaration::new::<
            Account,
            b::BalanceRequest,
            b::BalanceResponse,
        >(
            "bank.v1.AccountMethods.Balance",
            "type.googleapis.com/bank.v1.BalanceResponse",
            vec![],
        )],
    )
    .unwrap();
    tasks.set_max_live_deliveries(1).unwrap();
    let members = db::Participants {
        should_commit: [(
            ACCOUNT.into(),
            db::participants::StateRefs {
                state_refs: vec![reference.clone()],
            },
        )]
        .into(),
        read_only: Default::default(),
    };
    let record = db::TransactionCoordinator {
        state_ref: reference.clone(),
        participants: Some(members.clone()),
        preparing: true,
    };
    bounded(
        seed.transaction_coordinator_prepare(db::TransactionCoordinatorPrepareRequest {
            transaction_id: root.as_bytes().to_vec(),
            transaction_coordinator: Some(record.clone()),
        }),
    )
    .await
    .unwrap();
    let transaction = db::Transaction {
        state_type: ACCOUNT.into(),
        state_ref: reference.clone(),
        transaction_ids: vec![root.as_bytes().to_vec()],
        coordinator_state_type: ACCOUNT.into(),
        coordinator_state_ref: reference.clone(),
        prepared: false,
        uncommitted_tasks: vec![],
        uncommitted_idempotent_mutations: vec![],
    };
    if commit {
        // Native deferred-write prepare actually creates and prepares RocksDB tx.
        bounded(
            seed.transaction_participant_prepare(db::TransactionParticipantPrepareRequest {
                state_type: ACCOUNT.into(),
                state_ref: reference.clone(),
                transaction: Some(transaction),
                state: Some(after.clone()),
                task_upserts: vec![],
                idempotent_mutations: vec![],
            }),
        )
        .await
        .unwrap();
        bounded(
            seed.transaction_coordinator_prepared(db::TransactionCoordinatorPreparedRequest {
                transaction_id: root.as_bytes().to_vec(),
                transaction_coordinator: Some(db::TransactionCoordinator {
                    preparing: false,
                    ..record
                }),
                ..Default::default()
            }),
        )
        .await
        .unwrap();
    } else {
        // Actual early transactional Store: native STARTED, never Prepare. On
        // recovery this is canonically unprepared and must vote abort, not resume.
        bounded(seed.store(db::StoreRequest {
            sync: true,
            transaction: Some(transaction),
            actor_upserts: vec![db::Actor {
                state_type: ACCOUNT.into(),
                state_ref: reference.clone(),
                state: Some(after.clone()),
            }],
            ..Default::default()
        }))
        .await
        .unwrap();
    }
    assert_eq!(
        load(&mut direct, ACCOUNT, &reference).await,
        Some(before.clone())
    );
    let initial = recover(&mut direct).await;
    let txs: Vec<_> = initial
        .iter()
        .flat_map(|p| &p.participant_transactions)
        .collect();
    assert_eq!(txs.len(), 1);
    let tx = txs[0];
    assert_eq!(tx.state_type, ACCOUNT);
    assert_eq!(tx.state_ref, reference);
    assert_eq!(tx.transaction_ids, vec![root.as_bytes().to_vec()]);
    assert_eq!(tx.coordinator_state_type, ACCOUNT);
    assert_eq!(tx.coordinator_state_ref, reference);
    assert_eq!(tx.prepared, commit);
    assert!(tx.uncommitted_tasks.is_empty() && tx.uncommitted_idempotent_mutations.is_empty());
    let roots: Vec<_> = initial
        .iter()
        .flat_map(|p| &p.transaction_coordinators)
        .collect();
    assert_eq!(roots.len(), 1);
    assert_eq!(roots[0].0, &root.to_string());
    assert_eq!(roots[0].1.state_ref, reference);
    assert_eq!(roots[0].1.preparing, !commit);
    assert_eq!(roots[0].1.participants.as_ref(), Some(&members));
    assert!(
        initial
            .iter()
            .all(|p| p.pending_tasks.is_empty() && p.idempotent_mutations.is_empty())
    );
    assert!(decision(&mut direct, root, &reference).await.is_none());
    let phase = CoordinatedLocalRecovery::new(
        store,
        recovery_request(),
        [participant.clone()],
        [LocalCoordinator {
            target: participant.actor_target(),
            owner: coordinator,
        }],
        resolver,
        MultiOwnerTaskRecovery::new([tasks], recovery_request()).unwrap(),
    )
    .unwrap();
    let (observed_tx, observed_rx) = oneshot::channel();
    let (entered_tx, entered_rx) = oneshot::channel();
    let (release_tx, release_rx) = oneshot::channel();
    let (stop_tx, stop_rx) = oneshot::channel();
    let host = ApplicationHost::new("source667-app")
        .with_host_recovery(ObservePhase {
            phase: phase.clone(),
            observed: Mutex::new(Some(observed_tx)),
        })
        .with_host_recovery(AfterPhaseGate {
            entered: Mutex::new(Some(entered_tx)),
            release: Mutex::new(Some(release_rx)),
        })
        .add_public_service(watch_service);
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let mut serving = tokio::spawn(host.serve_with_listener_shutdown(listener, async {
        let _ = stop_rx.await;
    }));
    let cancel = tokio::time::timeout(DEADLINE, observed_rx)
        .await
        .unwrap()
        .unwrap();
    tokio::time::timeout(DEADLINE, entered_rx)
        .await
        .unwrap()
        .unwrap();
    assert!(
        tokio::time::timeout(Duration::from_millis(50), cancel.public_ready())
            .await
            .is_err(),
        "real host must withhold Ready behind later recovery"
    );
    assert_no_inventory(&mut direct).await;
    assert_eq!(
        load(&mut direct, ACCOUNT, &reference).await,
        Some(if commit {
            after.clone()
        } else {
            before.clone()
        })
    );
    let outcome = decision(&mut direct, root, &reference)
        .await
        .expect("canonical durable terminal decision");
    assert_eq!(outcome.coordinator_state_ref, reference);
    assert_eq!(
        outcome.outcome,
        if commit {
            db::transaction_coordinator_decision::Outcome::Commit
        } else {
            db::transaction_coordinator_decision::Outcome::Abort
        } as i32
    );
    assert_eq!(
        outcome.participants,
        if commit { Some(members) } else { None }
    );
    release_tx.send(()).unwrap();
    tokio::time::timeout(DEADLINE, cancel.public_ready())
        .await
        .unwrap()
        .unwrap();
    stop_tx.send(()).unwrap();
    tokio::time::timeout(DEADLINE, &mut serving)
        .await
        .unwrap()
        .unwrap()
        .unwrap();
    assert!(cancel.public_ready().await.is_err());
    assert_no_inventory(&mut direct).await;
    assert_eq!(
        load(&mut direct, ACCOUNT, &reference).await,
        Some(if commit { after } else { before })
    );
    assert_eq!(decision(&mut direct, root, &reference).await, Some(outcome));
    // The transparent observer must see successful real canonical terminal RPCs.
    let events = observations.events();
    for method in [
        if commit {
            "TransactionParticipantCommit"
        } else {
            "TransactionParticipantAbort"
        },
        "TransactionCoordinatorDecisionPut",
        "TransactionCoordinatorCleanup",
    ] {
        assert!(
            events
                .iter()
                .any(|e| e.method == method && e.code.is_none() && e.response.is_some()),
            "missing successful native {method}"
        );
    }
    assert!(!events.iter().any(|e| e.method == "CompleteTask"));
    proxy_stop.send(()).unwrap();
    tokio::time::timeout(DEADLINE, &mut proxy_server)
        .await
        .unwrap()
        .unwrap()
        .unwrap();
    drop(phase);
    drop(participant);
    // Sole case marker comes AFTER canonical assertions AND both real joins.
    println!(
        "SOURCE667_NATIVE_NONEMPTY_{}_COMPLETE",
        if commit { "COMMIT" } else { "ABORT" }
    );
}
#[tokio::test]
#[ignore = "parent-owned pristine canonical native Database and per-case serializer receipt required"]
async fn native_nonempty_transaction_graph_commit() {
    exercise(true).await;
}
#[tokio::test]
#[ignore = "parent-owned pristine canonical native Database and per-case serializer receipt required"]
async fn native_nonempty_transaction_graph_abort() {
    exercise(false).await;
}
