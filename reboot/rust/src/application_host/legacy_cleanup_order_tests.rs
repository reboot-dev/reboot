//! Executable production-path contracts for Legacy cleanup prebinding.
//! Mock sidecars are lifecycle controls, not native durability evidence.
//! Helpers mirror recovery_barrier_tests without changing its existing coverage.
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
    terminal_entered: Arc<tokio::sync::Notify>,
    terminal_release: Arc<tokio::sync::Notify>,
    fail: bool,
    recover_constructed: Arc<std::sync::atomic::AtomicUsize>,
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
                .push(format!("{}-commit-start", self.name));
            self.terminal_entered.notify_one();
            self.terminal_release.notified().await;
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
        // This happens synchronously, before the returned future is polled.
        self.recover_constructed
            .fetch_add(1, std::sync::atomic::Ordering::SeqCst);
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
struct Coordinator(
    Trace,
    Option<Arc<tokio::sync::Notify>>,
    Arc<std::sync::atomic::AtomicUsize>,
);
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
        self.2.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
        Box::pin(async move {
            self.0.lock().unwrap().push("coordinator-recover".into());
            if let Some(release) = &self.1 {
                release.notified().await;
            }
            Ok(vec![])
        })
    }
}
struct Watch(Trace, Arc<tokio::sync::Notify>, Arc<tokio::sync::Notify>);
impl CoordinatorWatchEndpoint for Watch {
    fn watch(&self, request: db::WatchRequest) -> F<'_, db::WatchResponse> {
        Box::pin(async move {
            self.0
                .lock()
                .unwrap()
                .push(format!("{}-watch", request.state_ref));
            self.1.notify_one();
            self.2.notified().await;
            Ok(db::WatchResponse { aborted: false })
        })
    }
}
type Assembly = (
    Arc<tokio::sync::Notify>,
    Arc<tokio::sync::Notify>,
    Arc<std::sync::atomic::AtomicUsize>,
    LegacyDurableRecovery<Participant, Coordinator, SingleParticipantResolver<Participant>, Watch>,
    Trace,
    Arc<tokio::sync::Notify>,
    Arc<tokio::sync::Notify>,
);

fn assembly(fail: bool) -> Assembly {
    assembly_with_gate(fail, None)
}
fn assembly_with_gate(fail: bool, coordinator_gate: Option<Arc<tokio::sync::Notify>>) -> Assembly {
    use crate::durable_participant::DurableActorParticipantHost;
    let terminal_entered = Arc::new(tokio::sync::Notify::new());
    let terminal_release = Arc::new(tokio::sync::Notify::new());
    let constructed = Arc::new(std::sync::atomic::AtomicUsize::new(0));
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
                terminal_entered: terminal_entered.clone(),
                terminal_release: terminal_release.clone(),
                fail,
                recover_constructed: constructed.clone(),
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
    let coordinator = DurableRootCoordinator::new(
        Arc::new(Coordinator(
            trace.clone(),
            coordinator_gate,
            constructed.clone(),
        )),
        Arc::new(resolver),
    );
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
        Arc::new(Watch(
            trace.clone(),
            Arc::new(tokio::sync::Notify::new()),
            Arc::new(tokio::sync::Notify::new()),
        )),
    )
    .unwrap()
    .with_participant(map, metadata)
    .unwrap();
    (
        terminal_entered,
        terminal_release,
        constructed,
        recovery,
        trace,
        entered,
        release,
    )
}

const BOUND: std::time::Duration = std::time::Duration::from_secs(2);

async fn legacy_unbound_graph_converges(additional: bool) {
    let (
        terminal_entered,
        terminal_release,
        constructed,
        mut recovery,
        trace,
        restored,
        restore_release,
    ) = assembly(false);
    if !additional {
        recovery.additional_participants.clear();
    }
    // No generated adapter or registration hook prebinds either participant.
    let primary = recovery.participant.clone();
    let secondary = recovery
        .additional_participants
        .first()
        .map(|(p, _)| p.clone());
    let watch_entered = recovery.watch.1.clone();
    let watch_release = recovery.watch.2.clone();
    let service = crate::proto::echo_methods_server::EchoMethodsServer::new(
        crate::runtime::InMemoryHost::default()
            .with_authorization(crate::auth::AuthorizationPolicy::permissive_for_development()),
    );
    let host = ApplicationHost::new("legacy-cleanup-prebinding").with_host_recovery(recovery);
    let binding = host.participant_cleanup.clone();
    let mut readiness = host.readiness.subscribe();
    let host = host.add_public_service(service);
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let (shutdown, stopped) = tokio::sync::oneshot::channel();
    let running = tokio::spawn(host.serve_with_listener_shutdown(listener, async {
        let _ = stopped.await;
    }));
    if additional {
        // Primary prepared Pending has been restored; additional Recover is held.
        tokio::time::timeout(BOUND, restored.notified())
            .await
            .unwrap();
        assert_eq!(*trace.lock().unwrap(), ["app-restore", "map-restore"]);
        assert_eq!(*readiness.borrow(), RecoveryState::Recovering);
        // Same-owner binding remains legal despite primary recovered Pending.
        // Do not bind the additional participant here while its Recover is held;
        // that would mask missing additional prebinding.
        primary.bind_host_cleanup(&binding).unwrap();
        restore_release.notify_one();
    }
    tokio::time::timeout(BOUND, watch_entered.notified())
        .await
        .unwrap();
    assert_eq!(*readiness.borrow(), RecoveryState::Recovering);
    assert_eq!(trace.lock().unwrap().last().unwrap(), "app-watch");
    assert!(!trace.lock().unwrap().iter().any(|e| e.ends_with("-commit")));
    primary.bind_host_cleanup(&binding).unwrap();
    // Authoritative Watch really terminalizes recovered prepared ownership.
    watch_release.notify_one();
    tokio::time::timeout(BOUND, terminal_entered.notified())
        .await
        .unwrap();
    assert_eq!(*readiness.borrow(), RecoveryState::Recovering);
    assert_eq!(trace.lock().unwrap().last().unwrap(), "app-commit-start");
    terminal_release.notify_one();
    if additional {
        tokio::time::timeout(BOUND, watch_entered.notified())
            .await
            .unwrap();
        assert_eq!(*readiness.borrow(), RecoveryState::Recovering);
        assert_eq!(trace.lock().unwrap().last().unwrap(), "map-watch");
        secondary
            .as_ref()
            .unwrap()
            .bind_host_cleanup(&binding)
            .unwrap();
        assert!(trace.lock().unwrap().iter().any(|e| e == "app-commit"));
        assert!(!trace.lock().unwrap().iter().any(|e| e == "map-commit"));
        watch_release.notify_one();
        tokio::time::timeout(BOUND, terminal_entered.notified())
            .await
            .unwrap();
        assert_eq!(*readiness.borrow(), RecoveryState::Recovering);
        assert_eq!(trace.lock().unwrap().last().unwrap(), "map-commit-start");
        terminal_release.notify_one();
    }
    tokio::time::timeout(BOUND, async {
        while *readiness.borrow_and_update() != RecoveryState::Ready {
            readiness.changed().await.unwrap();
        }
    })
    .await
    .unwrap();
    let expected: Vec<&str> = if additional {
        vec![
            "app-restore",
            "map-restore",
            "coordinator-recover",
            "app-watch",
            "app-commit-start",
            "app-commit",
            "map-watch",
            "map-commit-start",
            "map-commit",
        ]
    } else {
        vec![
            "app-restore",
            "coordinator-recover",
            "app-watch",
            "app-commit-start",
            "app-commit",
        ]
    };
    assert_eq!(*trace.lock().unwrap(), expected);
    assert_eq!(
        constructed.load(std::sync::atomic::Ordering::SeqCst),
        if additional { 3 } else { 2 }
    );
    shutdown.send(()).unwrap();
    tokio::time::timeout(BOUND, running)
        .await
        .unwrap()
        .unwrap()
        .unwrap();
}

#[tokio::test]
async fn legacy_only_unbound_primary_prepared_watch_converges_before_ready() {
    legacy_unbound_graph_converges(false).await;
}

#[tokio::test]
async fn legacy_only_unbound_primary_and_additional_prepared_watch_converge_before_ready() {
    legacy_unbound_graph_converges(true).await;
}

#[tokio::test]
async fn legacy_cross_host_additional_rejected_before_any_recover_construction() {
    let (_, _, constructed, recovery, trace, _, _) = assembly(false);
    let other = ApplicationHost::new("other-cleanup-owner");
    recovery.additional_participants[0]
        .0
        .bind_host_cleanup(&other.participant_cleanup)
        .unwrap();
    let host = ApplicationHost::new("legacy-cleanup-owner");
    let (cancel, _) = RecoveryCancellation::test_host();
    let error = tokio::time::timeout(
        BOUND,
        host.participant_cleanup
            .scope(async { recovery.start(&mut JoinSet::new(), cancel).await }),
    )
    .await
    .unwrap()
    .unwrap_err();
    assert_eq!(error.code(), tonic::Code::FailedPrecondition);
    // The same prepared-record sidecars positively constructed Recover in both
    // success tests. Count at method entry, not inside an unpolled async block.
    assert_eq!(constructed.load(std::sync::atomic::Ordering::SeqCst), 0);
    assert!(trace.lock().unwrap().is_empty());
}
