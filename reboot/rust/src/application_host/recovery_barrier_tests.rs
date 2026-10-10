//! Lifecycle controls, not native durability evidence.
use super::*;
use crate::{database_proto as db, durable_coordinator::SingleParticipantResolver};
use std::{future::Future, pin::Pin, sync::Mutex};
use uuid::Uuid;
type F<'a, T> = Pin<Box<dyn Future<Output = Result<T, tonic::Status>> + Send + 'a>>;
type Trace = Arc<Mutex<Vec<String>>>;
struct Participant {
    name: &'static str,
    trace: Trace,
    entered: Arc<tokio::sync::Notify>,
    release: Arc<tokio::sync::Notify>,
    fail: bool,
}
impl ParticipantSidecar for Participant {
    fn load(&self, _: db::LoadRequest) -> F<'_, db::LoadResponse> {
        Box::pin(async { unreachable!() })
    }
    fn prepare(
        &self,
        _: db::TransactionParticipantPrepareRequest,
    ) -> F<'_, db::TransactionParticipantPrepareResponse> {
        Box::pin(async { unreachable!() })
    }
    fn commit(
        &self,
        _: db::TransactionParticipantCommitRequest,
    ) -> F<'_, db::TransactionParticipantCommitResponse> {
        Box::pin(async move {
            self.trace
                .lock()
                .unwrap()
                .push(format!("{}-commit", self.name));
            Ok(Default::default())
        })
    }
    fn abort(
        &self,
        _: db::TransactionParticipantAbortRequest,
    ) -> F<'_, db::TransactionParticipantAbortResponse> {
        Box::pin(async { unreachable!() })
    }
    fn recover_idempotent_mutations(
        &self,
        _: db::RecoverIdempotentMutationsRequest,
    ) -> F<'_, Vec<db::RecoverIdempotentMutationsResponse>> {
        Box::pin(async { unreachable!() })
    }
    fn recover(&self, _: db::RecoverRequest) -> F<'_, Vec<db::RecoverResponse>> {
        Box::pin(async move {
            self.trace
                .lock()
                .unwrap()
                .push(format!("{}-restore", self.name));
            if self.name == "map" {
                self.entered.notify_one();
                self.release.notified().await;
                if self.fail {
                    return Err(tonic::Status::data_loss("map restoration failed"));
                }
            }
            Ok(vec![db::RecoverResponse {
                participant_transactions: vec![db::Transaction {
                    state_type: "test.Barrier".into(),
                    state_ref: self.name.into(),
                    transaction_ids: vec![Uuid::from_u128(1).as_bytes().to_vec()],
                    coordinator_state_type: "test.Barrier".into(),
                    coordinator_state_ref: "app".into(),
                    prepared: true,
                    ..Default::default()
                }],
                ..Default::default()
            }])
        })
    }
}
struct Coordinator(Trace);
impl CoordinatorSidecar for Coordinator {
    fn coordinator_prepare(
        &self,
        _: db::TransactionCoordinatorPrepareRequest,
    ) -> F<'_, db::TransactionCoordinatorPrepareResponse> {
        Box::pin(async { unreachable!() })
    }
    fn coordinator_prepared(
        &self,
        _: db::TransactionCoordinatorPreparedRequest,
    ) -> F<'_, db::TransactionCoordinatorPreparedResponse> {
        Box::pin(async { unreachable!() })
    }
    fn coordinator_cleanup(
        &self,
        _: db::TransactionCoordinatorCleanupRequest,
    ) -> F<'_, db::TransactionCoordinatorCleanupResponse> {
        Box::pin(async { unreachable!() })
    }
    fn recover(&self, _: db::RecoverRequest) -> F<'_, Vec<db::RecoverResponse>> {
        Box::pin(async move {
            self.0.lock().unwrap().push("coordinator-recover".into());
            Ok(vec![])
        })
    }
}
struct Watch(Trace);
impl CoordinatorWatchEndpoint for Watch {
    fn watch(&self, request: db::WatchRequest) -> F<'_, db::WatchResponse> {
        Box::pin(async move {
            self.0
                .lock()
                .unwrap()
                .push(format!("{}-watch", request.state_ref));
            Ok(db::WatchResponse { aborted: false })
        })
    }
}
type Assembly = (
    LegacyDurableRecovery<Participant, Coordinator, SingleParticipantResolver<Participant>, Watch>,
    Trace,
    Arc<tokio::sync::Notify>,
    Arc<tokio::sync::Notify>,
);

fn assembly(fail: bool) -> Assembly {
    use crate::durable_participant::DurableActorParticipantHost;
    let trace = Arc::new(Mutex::new(Vec::new()));
    let entered = Arc::new(tokio::sync::Notify::new());
    let release = Arc::new(tokio::sync::Notify::new());
    let participant = |name| {
        DurableActorParticipant::new(
            Arc::new(Participant {
                name,
                trace: trace.clone(),
                entered: entered.clone(),
                release: release.clone(),
                fail,
            }),
            "test.Barrier",
            name,
        )
    };
    let app = participant("app");
    let map = participant("map");
    let resolver = SingleParticipantResolver::new(
        app.actor_target(),
        DurableActorParticipantHost::new(app.clone()),
    )
    .unwrap();
    let coordinator =
        DurableRootCoordinator::new(Arc::new(Coordinator(trace.clone())), Arc::new(resolver));
    let metadata = ParticipantRecovery {
        shard_ids: vec!["shard".into()],
        ..Default::default()
    };
    let recovery = LegacyDurableRecovery::new(
        app,
        coordinator,
        LegacyRecoveryMetadata {
            participant: metadata.clone(),
            coordinator: CoordinatorRecovery {
                coordinator_state_ref: "app".into(),
                shard_ids: vec!["shard".into()],
                ..Default::default()
            },
        },
        Arc::new(Watch(trace.clone())),
    )
    .unwrap()
    .with_participant(map, metadata)
    .unwrap();
    (recovery, trace, entered, release)
}
#[tokio::test]
async fn all_ownership_precedes_coordinator_and_all_watches_precede_later_owners() {
    let (recovery, trace, entered, release) = assembly(false);
    let (cancel, _) = RecoveryCancellation::test_host();
    let later = trace.clone();
    let running = tokio::spawn(async move {
        recovery.start(&mut JoinSet::new(), cancel).await.unwrap();
        later.lock().unwrap().push("tasks-readers".into());
    });
    tokio::time::timeout(std::time::Duration::from_secs(2), entered.notified())
        .await
        .unwrap();
    assert_eq!(*trace.lock().unwrap(), ["app-restore", "map-restore"]);
    release.notify_one();
    tokio::time::timeout(std::time::Duration::from_secs(2), running)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(
        *trace.lock().unwrap(),
        [
            "app-restore",
            "map-restore",
            "coordinator-recover",
            "app-watch",
            "app-commit",
            "map-watch",
            "map-commit",
            "tasks-readers"
        ]
    );
}
#[tokio::test]
async fn failed_second_restoration_never_reaches_coordinator_watch_or_tasks() {
    let (recovery, trace, entered, release) = assembly(true);
    let (cancel, _) = RecoveryCancellation::test_host();
    let running = tokio::spawn(async move { recovery.start(&mut JoinSet::new(), cancel).await });
    tokio::time::timeout(std::time::Duration::from_secs(2), entered.notified())
        .await
        .unwrap();
    release.notify_one();
    let error = running.await.unwrap().unwrap_err();
    assert_eq!(error.code(), tonic::Code::DataLoss);
    assert_eq!(*trace.lock().unwrap(), ["app-restore", "map-restore"]);
}
#[test]
fn duplicate_target_is_rejected_before_recovery() {
    let (recovery, _, _, _) = assembly(false);
    let duplicate = recovery.participant.clone();
    assert!(
        recovery
            .with_participant(duplicate, ParticipantRecovery::default())
            .is_err()
    );
}
