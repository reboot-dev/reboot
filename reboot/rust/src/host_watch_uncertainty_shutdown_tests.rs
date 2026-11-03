//! SDK host ownership regressions, not native ACK/restart evidence.
use super::*;
use crate::{
    application_host::{ApplicationHost, ApplicationHostError},
    database_proto as db,
    durable_participant::{
        ActorTransactionStart, DurableActorParticipant, ParticipantSidecar, ParticipantStartMode,
        PendingActorEffects, TransactionPathContract,
    },
    runtime::{TransactionContext, TransactionMode},
};
use std::sync::atomic::{AtomicUsize, Ordering};
use tokio::sync::oneshot;
#[derive(Clone)]
struct Route<S>(S);
impl<S> tonic::server::NamedService for Route<S> {
    const NAME: &'static str = "watch.shutdown.Test";
}
impl<S> tower::Service<http::Request<tonic::body::BoxBody>> for Route<S>
where
    S: tower::Service<http::Request<tonic::body::BoxBody>>,
{
    type Response = S::Response;
    type Error = S::Error;
    type Future = S::Future;
    fn poll_ready(
        &mut self,
        cx: &mut std::task::Context<'_>,
    ) -> std::task::Poll<Result<(), Self::Error>> {
        self.0.poll_ready(cx)
    }
    fn call(&mut self, request: http::Request<tonic::body::BoxBody>) -> Self::Future {
        self.0.call(request)
    }
}

type SidecarFuture<'a, T> = Pin<Box<dyn Future<Output = Result<T, Status>> + Send + 'a>>;

#[derive(Default)]
struct Sidecar {
    loads: AtomicUsize,
    controls: AtomicUsize,
    acknowledge_abort: bool,
}
impl ParticipantSidecar for Sidecar {
    fn load(&self, request: db::LoadRequest) -> SidecarFuture<'_, db::LoadResponse> {
        self.loads.fetch_add(1, Ordering::SeqCst);
        Box::pin(async move {
            Ok(db::LoadResponse {
                actors: request
                    .actors
                    .into_iter()
                    .map(|mut actor| {
                        actor.state = Some(vec![100]);
                        actor
                    })
                    .collect(),
                ..Default::default()
            })
        })
    }
    fn prepare(
        &self,
        _: db::TransactionParticipantPrepareRequest,
    ) -> SidecarFuture<'_, db::TransactionParticipantPrepareResponse> {
        self.controls.fetch_add(1, Ordering::SeqCst);
        Box::pin(async { Err(Status::internal("unexpected native Prepare")) })
    }
    fn commit(
        &self,
        _: db::TransactionParticipantCommitRequest,
    ) -> SidecarFuture<'_, db::TransactionParticipantCommitResponse> {
        self.controls.fetch_add(1, Ordering::SeqCst);
        Box::pin(async { Err(Status::internal("unexpected native Commit")) })
    }
    fn abort(
        &self,
        _: db::TransactionParticipantAbortRequest,
    ) -> SidecarFuture<'_, db::TransactionParticipantAbortResponse> {
        self.controls.fetch_add(1, Ordering::SeqCst);
        let acknowledge = self.acknowledge_abort;
        Box::pin(async move {
            if acknowledge {
                Ok(db::TransactionParticipantAbortResponse::default())
            } else {
                Err(Status::internal("unexpected native Abort"))
            }
        })
    }
    fn recover(&self, _: db::RecoverRequest) -> SidecarFuture<'_, Vec<db::RecoverResponse>> {
        Box::pin(async { Err(Status::unimplemented("unused")) })
    }
    fn recover_idempotent_mutations(
        &self,
        _: db::RecoverIdempotentMutationsRequest,
    ) -> SidecarFuture<'_, Vec<db::RecoverIdempotentMutationsResponse>> {
        Box::pin(async { Err(Status::unimplemented("unused")) })
    }
}
struct ParkedWatch(tokio::sync::Notify);
impl CoordinatorWatchEndpoint for ParkedWatch {
    fn watch(
        &self,
        _: db::WatchRequest,
    ) -> crate::legacy_coordinator::CoordinatorWatchFuture<'_, db::WatchResponse> {
        Box::pin(async {
            self.0.notify_one();
            std::future::pending().await
        })
    }
}
struct Registration {
    owner: LiveParticipantOwner,
    started: Mutex<Option<oneshot::Sender<()>>>,
    revoked: Mutex<Option<oneshot::Sender<()>>>,
}
#[tonic::async_trait]
impl HostRecovery for Registration {
    async fn start(
        &self,
        supervisor: &mut JoinSet<Result<(), Status>>,
        cancel: RecoveryCancellation,
    ) -> Result<(), Status> {
        self.owner
            .recovery_registration()
            .start(supervisor, cancel.clone())
            .await?;
        let revoked = self.revoked.lock().unwrap().take().unwrap();
        supervisor.spawn(async move {
            cancel.cancelled().await;
            let _ = revoked.send(());
            Ok(())
        });
        self.started
            .lock()
            .unwrap()
            .take()
            .unwrap()
            .send(())
            .unwrap();
        Ok(())
    }
}
fn context(root: uuid::Uuid, child: uuid::Uuid) -> TransactionContext {
    let mut headers = crate::RebootHeaders::new("actor/1");
    headers.transaction_ids = Some(vec![root, child]);
    headers.transaction_coordinator_state_type = Some("example.Coordinator".into());
    headers.transaction_coordinator_state_ref = Some("coordinator/1".into());
    headers.coordinator_read_only_aware = true;
    TransactionContext::from_headers(headers, TransactionMode::Exclusive).unwrap()
}
fn start(context: &TransactionContext, state_ref: &str) -> ActorTransactionStart {
    ActorTransactionStart {
        transaction_ids: context.transaction_ids().to_vec(),
        transaction_path: TransactionPathContract::PreserveNested,
        coordinator_state_type: "example.Coordinator".into(),
        coordinator_state_ref: "coordinator/1".into(),
        mode: TransactionMode::Exclusive,
        read_only: false,
        factory: false,
        state_type: "example.Actor".into(),
        state_ref: state_ref.into(),
    }
}
async fn shutdown_case(running: bool) {
    let watch = Arc::new(ParkedWatch(tokio::sync::Notify::new()));
    let owner = LiveParticipantOwner::new(
        1,
        crate::durable_coordinator::ParticipantTarget {
            state_type: "example.Coordinator".into(),
            state_ref: "coordinator/1".into(),
        },
        watch.clone(),
    )
    .unwrap();
    let sidecar = Arc::new(Sidecar::default());
    let store = crate::runtime::DatabaseActorStore::connect_lazy(format!(
        "http://watch-{}.invalid:1",
        uuid::Uuid::new_v4()
    ))
    .unwrap();
    let actor = DurableActorParticipant::new(sidecar.clone(), "example.Actor", "actor/1")
        .with_database_actor_gate(&store);
    let (started, ready) = oneshot::channel();
    let (revoked, revocation) = oneshot::channel();
    let host = ApplicationHost::new("watch-uncertainty").with_host_recovery(Registration {
        owner: owner.clone(),
        started: Mutex::new(Some(started)),
        revoked: Mutex::new(Some(revoked)),
    });
    host.bind_participant_cleanup(&actor).unwrap();
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let (stop, stopped) = oneshot::channel();
    let (_, health) = tonic_health::server::health_reporter();
    let host = host.add_service(Route(health));
    let serving = tokio::spawn(host.serve_with_listener_shutdown(listener, async move {
        let _ = stopped.await;
    }));
    ready.await.unwrap();
    let context = context(uuid::Uuid::new_v4(), uuid::Uuid::new_v4());
    let reservation = owner.reserve(&context).unwrap();
    let mut local = actor
        .start_local(start(&context, "actor/1"), ParticipantStartMode::Exclusive)
        .await
        .unwrap();
    let execution = local.reserve_live_execution(&context).await.unwrap();
    local
        .stage(PendingActorEffects {
            state: Some(vec![60]),
            ..Default::default()
        })
        .await
        .unwrap();
    let mut transfer = Some((reservation, execution));
    if running {
        let (reservation, execution) = transfer.take().unwrap();
        reservation.submit(Box::pin(execution.watch(watch.clone())));
        watch.0.notified().await;
    }
    #[cfg(feature = "test-support")]
    assert_eq!(
        owner
            .wait_for_idle_for_test(std::time::Duration::from_millis(20))
            .await
            .unwrap_err()
            .code(),
        tonic::Code::DeadlineExceeded
    );
    drop(local); // transfer/destroy the host-bound cleanup producer before join
    stop.send(()).unwrap();
    revocation.await.unwrap(); // causal host cancellation, not a timer or invented ACK
    let result = tokio::time::timeout(std::time::Duration::from_secs(2), serving)
        .await
        .unwrap()
        .unwrap();
    assert!(matches!(result, Err(ApplicationHostError::RecoveryTask(_))));
    if let Some((reservation, execution)) = transfer {
        assert!(reservation.validate_active().is_err());
        reservation.submit(Box::pin(execution.watch(watch.clone()))); // after recovery already joined
    }
    assert!(!owner.state.lock().unwrap().active);
    #[cfg(feature = "test-support")]
    assert_eq!(
        owner
            .wait_for_idle_for_test(std::time::Duration::from_secs(1))
            .await
            .unwrap_err()
            .code(),
        tonic::Code::Unavailable
    );
    assert_eq!(
        owner.capacity.available_permits(),
        0,
        "unresolved Watch remains capacity-owned"
    );
    assert!(
        tokio::time::timeout(
            std::time::Duration::from_millis(20),
            store.actor_gate("example.Actor", "actor/1").exclusive()
        )
        .await
        .is_err()
    );
    let independent =
        DurableActorParticipant::new(sidecar.clone(), "example.Actor", "actor/independent")
            .with_database_actor_gate(&store);
    let other = tokio::time::timeout(
        std::time::Duration::from_secs(1),
        independent.start_local(
            start(&context, "actor/independent"),
            ParticipantStartMode::Exclusive,
        ),
    )
    .await
    .unwrap()
    .unwrap();
    assert_eq!(other.state(), Some(&[100][..]));
    assert_eq!(sidecar.loads.load(Ordering::SeqCst), 2);
    assert_eq!(sidecar.controls.load(Ordering::SeqCst), 0);
    drop(other);
}
#[tokio::test]
async fn host_shutdown_running_admitted_watch_fails_and_retains_exact_actor() {
    shutdown_case(true).await;
}
#[tokio::test]
async fn host_shutdown_unsubmitted_admitted_watch_fails_before_late_drop() {
    shutdown_case(false).await;
}
#[tokio::test]
async fn host_shutdown_idle_registered_watch_owner_is_orderly() {
    let owner = LiveParticipantOwner::new(
        1,
        crate::durable_coordinator::ParticipantTarget {
            state_type: "example.Coordinator".into(),
            state_ref: "coordinator/1".into(),
        },
        Arc::new(ParkedWatch(tokio::sync::Notify::new())),
    )
    .unwrap();
    let host = ApplicationHost::new("idle-watch").with_host_recovery(owner.recovery_registration());
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let (_, health) = tonic_health::server::health_reporter();
    host.add_service(Route(health))
        .serve_with_listener_shutdown(listener, async {})
        .await
        .unwrap();
    assert_eq!(owner.capacity.available_permits(), 1);
}

struct AbortedWatch;
impl CoordinatorWatchEndpoint for AbortedWatch {
    fn watch(
        &self,
        _: db::WatchRequest,
    ) -> crate::legacy_coordinator::CoordinatorWatchFuture<'_, db::WatchResponse> {
        Box::pin(async { Ok(db::WatchResponse { aborted: true }) })
    }
}
#[tokio::test]
async fn host_shutdown_settled_terminal_watch_reuses_exact_gate_and_is_orderly() {
    settled_terminal_case(false).await;
}
#[cfg(feature = "test-support")]
#[tokio::test]
async fn real_terminal_callback_retires_parked_watch_without_scripted_reply() {
    settled_terminal_case(true).await;
}
async fn settled_terminal_case(callback: bool) {
    let parked = Arc::new(ParkedWatch(tokio::sync::Notify::new()));
    let watch: Arc<dyn CoordinatorWatchEndpoint> = if callback {
        parked.clone()
    } else {
        Arc::new(AbortedWatch)
    };
    let owner = LiveParticipantOwner::new(
        1,
        crate::durable_coordinator::ParticipantTarget {
            state_type: "example.Coordinator".into(),
            state_ref: "coordinator/1".into(),
        },
        watch.clone(),
    )
    .unwrap();
    let sidecar = Arc::new(Sidecar {
        acknowledge_abort: true,
        ..Default::default()
    });
    let store = crate::runtime::DatabaseActorStore::connect_lazy(format!(
        "http://settled-watch-{}.invalid:1",
        uuid::Uuid::new_v4()
    ))
    .unwrap();
    let actor = DurableActorParticipant::new(sidecar.clone(), "example.Actor", "actor/1")
        .with_database_actor_gate(&store);
    let (started, ready) = oneshot::channel();
    let (revoked, _revocation) = oneshot::channel();
    let host = ApplicationHost::new("settled-watch").with_host_recovery(Registration {
        owner: owner.clone(),
        started: Mutex::new(Some(started)),
        revoked: Mutex::new(Some(revoked)),
    });
    host.bind_participant_cleanup(&actor).unwrap();
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let (stop, stopped) = oneshot::channel();
    let (_, health) = tonic_health::server::health_reporter();
    let serving = tokio::spawn(
        host.add_service(Route(health))
            .serve_with_listener_shutdown(listener, async move {
                let _ = stopped.await;
            }),
    );
    ready.await.unwrap();
    let context = context(uuid::Uuid::new_v4(), uuid::Uuid::new_v4());
    let reservation = owner.reserve(&context).unwrap();
    let mut local = actor
        .start_local(start(&context, "actor/1"), ParticipantStartMode::Exclusive)
        .await
        .unwrap();
    let execution = local.reserve_live_execution(&context).await.unwrap();
    local
        .stage(PendingActorEffects {
            state: Some(vec![60]),
            ..Default::default()
        })
        .await
        .unwrap();
    drop(local);
    reservation.submit(Box::pin(execution.watch(watch)));
    if callback {
        tokio::time::timeout(std::time::Duration::from_secs(2), parked.0.notified())
            .await
            .unwrap();
        #[cfg(feature = "test-support")]
        assert_eq!(
            owner
                .wait_for_idle_for_test(std::time::Duration::from_millis(20))
                .await
                .unwrap_err()
                .code(),
            tonic::Code::DeadlineExceeded
        );
        let host = crate::durable_participant::DurableActorParticipantHost::new(actor.clone());
        let mut request = tonic::Request::new(db::AbortRequest {
            transaction_id: context.transaction_root_id().as_bytes().to_vec(),
        });
        *request.metadata_mut() = crate::RebootHeaders::new("actor/1").to_metadata().unwrap();
        // Actual participant service terminal callback, which invokes the
        // mock sidecar's ACK and notifies the parked LiveExecution ownership
        // check. No fabricated Watch response/ledger-clear or duplicate control.
        tokio::time::timeout(
            std::time::Duration::from_secs(2),
            db::participant_server::Participant::abort(&host, request),
        )
        .await
        .unwrap()
        .unwrap();
    }
    #[cfg(feature = "test-support")]
    owner
        .wait_for_idle_for_test(std::time::Duration::from_secs(2))
        .await
        .unwrap();
    // Full capacity is worker completion, not merely arrival of a mock RPC reply.
    let permit = tokio::time::timeout(
        std::time::Duration::from_secs(2),
        owner.capacity.clone().acquire_owned(),
    )
    .await
    .unwrap()
    .unwrap();
    drop(permit);
    assert_eq!(sidecar.controls.load(Ordering::SeqCst), 1);
    let gate = tokio::time::timeout(
        std::time::Duration::from_secs(2),
        store.actor_gate("example.Actor", "actor/1").exclusive(),
    )
    .await
    .unwrap();
    drop(gate);
    stop.send(()).unwrap();
    tokio::time::timeout(std::time::Duration::from_secs(2), serving)
        .await
        .unwrap()
        .unwrap()
        .unwrap();
    assert_eq!(owner.capacity.available_permits(), 1);
}

#[test]
fn sealed_reserve_checks_admission_before_capacity() {
    let owner = LiveParticipantOwner::new(
        1,
        crate::durable_coordinator::ParticipantTarget {
            state_type: "example.Coordinator".into(),
            state_ref: "coordinator/1".into(),
        },
        Arc::new(AbortedWatch),
    )
    .unwrap();
    let permit = owner.capacity.clone().try_acquire_owned().unwrap();
    let error = owner
        .reserve(&context(uuid::Uuid::new_v4(), uuid::Uuid::new_v4()))
        .err()
        .unwrap();
    assert_eq!(error.code(), tonic::Code::FailedPrecondition);
    drop(permit);
    assert_eq!(owner.capacity.available_permits(), 1);
}

#[cfg(feature = "test-support")]
struct OwnedWatchRetirementBarrier {
    owner: LiveParticipantOwner,
    reply: Option<oneshot::Sender<()>>,
    entered: Option<oneshot::Sender<usize>>,
    release: std::sync::mpsc::Receiver<()>,
}
#[cfg(feature = "test-support")]
impl Future for OwnedWatchRetirementBarrier {
    type Output = Result<(), Status>;
    fn poll(
        mut self: Pin<&mut Self>,
        _: &mut std::task::Context<'_>,
    ) -> std::task::Poll<Self::Output> {
        self.reply.take().unwrap().send(()).unwrap();
        std::task::Poll::Ready(Ok(()))
    }
}
#[cfg(feature = "test-support")]
impl Drop for OwnedWatchRetirementBarrier {
    fn drop(&mut self) {
        self.entered
            .take()
            .unwrap()
            .send(self.owner.capacity.available_permits())
            .unwrap();
        self.release
            .recv_timeout(std::time::Duration::from_secs(2))
            .unwrap();
    }
}
#[cfg(feature = "test-support")]
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn live_owner_idle_requires_owned_work_drop_after_reply() {
    let owner = LiveParticipantOwner::new(
        2,
        crate::durable_coordinator::ParticipantTarget {
            state_type: "example.Coordinator".into(),
            state_ref: "coordinator/1".into(),
        },
        Arc::new(AbortedWatch),
    )
    .unwrap();
    let (cancel, _) = RecoveryCancellation::test_host();
    let mut supervisor = JoinSet::new();
    owner
        .recovery_registration()
        .start(&mut supervisor, cancel.clone())
        .await
        .unwrap();
    let context = context(uuid::Uuid::new_v4(), uuid::Uuid::new_v4());
    let reservation = owner.reserve(&context).unwrap();
    let other = owner.reserve(&context).unwrap();
    let (reply, response) = oneshot::channel();
    let (entered, destruction) = oneshot::channel();
    let (release, resume) = std::sync::mpsc::channel();
    reservation.submit(Box::pin(OwnedWatchRetirementBarrier {
        owner: owner.clone(),
        reply: Some(reply),
        entered: Some(entered),
        release: resume,
    }));
    tokio::time::timeout(std::time::Duration::from_secs(2), response)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(
        tokio::time::timeout(std::time::Duration::from_secs(2), destruction)
            .await
            .unwrap()
            .unwrap(),
        0
    );
    assert_eq!(
        owner
            .wait_for_idle_for_test(std::time::Duration::from_millis(20))
            .await
            .unwrap_err()
            .code(),
        tonic::Code::DeadlineExceeded
    );
    release.send(()).unwrap();
    let capacity = tokio::time::timeout(
        std::time::Duration::from_secs(2),
        owner.capacity.clone().acquire_owned(),
    )
    .await
    .unwrap()
    .unwrap();
    drop(capacity);
    assert_eq!(
        owner
            .wait_for_idle_for_test(std::time::Duration::from_millis(20))
            .await
            .unwrap_err()
            .code(),
        tonic::Code::DeadlineExceeded
    );
    drop(other); // unused actual reservation, not unresolved submitted Watch
    owner
        .wait_for_idle_for_test(std::time::Duration::from_secs(1))
        .await
        .unwrap();
    assert!(!cancel.failure_latched_for_test());
    cancel.cancel();
    tokio::time::timeout(std::time::Duration::from_secs(2), supervisor.join_next())
        .await
        .unwrap()
        .unwrap()
        .unwrap()
        .unwrap();
}

#[cfg(feature = "test-support")]
#[tokio::test]
async fn live_idle_does_not_hide_owner_failure_with_full_capacity() {
    let owner = LiveParticipantOwner::new(
        2,
        crate::durable_coordinator::ParticipantTarget {
            state_type: "example.Coordinator".into(),
            state_ref: "coordinator/1".into(),
        },
        Arc::new(AbortedWatch),
    )
    .unwrap();
    owner
        .wait_for_idle_for_test(std::time::Duration::from_secs(1))
        .await
        .unwrap();
    owner
        .failure
        .send_replace(Some(Status::unavailable("test sticky Watch failure")));
    assert_eq!(owner.capacity.available_permits(), 2);
    let error = owner
        .wait_for_idle_for_test(std::time::Duration::from_secs(1))
        .await
        .unwrap_err();
    assert_eq!(error.code(), tonic::Code::Unavailable);
    assert_eq!(error.message(), "test sticky Watch failure");
}
