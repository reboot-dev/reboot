//! SDK mock DecisionPut/terminal responses; no native ACK evidence.
use super::*;
use crate::{
    application_host::{ApplicationHost, ApplicationHostError},
    database_proto as db,
    durable_coordinator::{ParticipantEndpoint, ParticipantTarget},
    durable_participant::{
        ActorTransactionStart, DurableActorParticipant, ParticipantStartMode,
        TransactionPathContract,
    },
    runtime::{RootTransactionContext, TransactionMode},
};
use std::sync::atomic::{AtomicUsize, Ordering};
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

struct Sidecar {
    endpoint: String,
    loads: AtomicUsize,
    controls: AtomicUsize,
    acknowledge_abort: bool,
}
impl ParticipantSidecar for Sidecar {
    fn database_endpoint(&self) -> Option<&str> {
        Some(&self.endpoint)
    }
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

struct Decisions {
    endpoint: String,
    entered: tokio::sync::Notify,
    park: bool,
    destruction_probe: Mutex<Option<DestructionProbe>>,
}
// Snapshot taken INSIDE the pending DecisionPut future's destruction, before
// its enclosing ordinary registration and capacity can disappear.
struct DestructionProbe {
    owner: ExplicitAbortOwner,
    root: uuid::Uuid,
    observed: Option<oneshot::Sender<(bool, bool, bool, usize)>>,
}
impl Drop for DestructionProbe {
    fn drop(&mut self) {
        let state = self.owner.state.lock().unwrap();
        let cancel = state.host_cancel.as_ref().unwrap();
        let snapshot = (
            cancel.check_reader_admission().is_err(),
            cancel.is_cancelled(),
            state.registered_roots.contains(&self.root),
            self.owner.capacity.available_permits(),
        );
        if let Some(observed) = self.observed.take() {
            let _ = observed.send(snapshot);
        }
    }
}
impl CoordinatorSidecar for Decisions {
    fn database_endpoint(&self) -> Option<&str> {
        Some(&self.endpoint)
    }
    fn coordinator_prepare(
        &self,
        _: db::TransactionCoordinatorPrepareRequest,
    ) -> SidecarFuture<'_, db::TransactionCoordinatorPrepareResponse> {
        Box::pin(async { Err(Status::internal("unexpected prepare")) })
    }
    fn coordinator_prepared(
        &self,
        _: db::TransactionCoordinatorPreparedRequest,
    ) -> SidecarFuture<'_, db::TransactionCoordinatorPreparedResponse> {
        Box::pin(async { Err(Status::internal("unexpected prepared")) })
    }
    fn coordinator_cleanup(
        &self,
        _: db::TransactionCoordinatorCleanupRequest,
    ) -> SidecarFuture<'_, db::TransactionCoordinatorCleanupResponse> {
        Box::pin(async { Ok(Default::default()) })
    }
    fn decision_put(
        &self,
        _: db::TransactionCoordinatorDecisionPutRequest,
    ) -> SidecarFuture<'_, db::TransactionCoordinatorDecisionPutResponse> {
        Box::pin(async move {
            let _destruction_probe = self.destruction_probe.lock().unwrap().take();
            self.entered.notify_one();
            if self.park {
                std::future::pending().await
            } else {
                Ok(Default::default())
            }
        })
    }
    fn recover(&self, _: db::RecoverRequest) -> SidecarFuture<'_, Vec<db::RecoverResponse>> {
        Box::pin(async { Err(Status::internal("unexpected recover")) })
    }
}
struct NoRemote;
impl ParticipantEndpoint for NoRemote {
    fn prepare(&self, _: &str, _: db::PrepareRequest) -> SidecarFuture<'_, db::PrepareResponse> {
        Box::pin(async { Err(Status::internal("unexpected remote prepare")) })
    }
    fn commit(&self, _: &str, _: db::CommitRequest) -> SidecarFuture<'_, db::CommitResponse> {
        Box::pin(async { Err(Status::internal("unexpected remote commit")) })
    }
    fn abort(&self, _: &str, _: db::AbortRequest) -> SidecarFuture<'_, db::AbortResponse> {
        Box::pin(async { Err(Status::internal("unexpected remote abort")) })
    }
}
impl ParticipantResolver for NoRemote {
    type Endpoint = Self;
    fn resolve(&self, _: &ParticipantTarget) -> SidecarFuture<'_, Arc<Self>> {
        Box::pin(async { Err(Status::internal("unexpected remote resolve")) })
    }
}
type ForcedWorkerRequest = oneshot::Receiver<oneshot::Sender<()>>;
struct Registration {
    owner: ExplicitAbortOwner,
    started: Mutex<Option<oneshot::Sender<()>>>,
    force: Mutex<Option<ForcedWorkerRequest>>,
}
#[tonic::async_trait]
impl HostRecovery for Registration {
    async fn start(
        &self,
        supervisor: &mut JoinSet<Result<(), Status>>,
        cancel: RecoveryCancellation,
    ) -> Result<(), Status> {
        let force = self.force.lock().unwrap().take();
        if let Some(force) = force {
            // Abort the ACTUAL SDK worker, not its observer. Hide its JoinError
            // just like the host's forced fallback: host failure must therefore
            // come from the sticky uncertainty latch, not an abnormal join.
            let mut children = JoinSet::new();
            self.owner
                .recovery_registration()
                .start(&mut children, cancel.clone())
                .await?;
            supervisor.spawn(async move {
                let joined = force.await.unwrap();
                children.abort_all();
                while children.join_next().await.is_some() {}
                let _ = joined.send(());
                cancel.cancelled().await;
                Ok(())
            });
        } else {
            self.owner
                .recovery_registration()
                .start(supervisor, cancel)
                .await?;
        }
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
async fn host_case(shared: bool, park: bool, forced: bool) {
    assert!(!forced || (!shared && park));
    let owner = ExplicitAbortOwner::new(1).unwrap();
    let endpoint = format!("http://abort-{}.invalid:1/", uuid::Uuid::new_v4());
    let sidecar = Arc::new(Sidecar {
        endpoint: endpoint.clone(),
        loads: AtomicUsize::new(0),
        controls: AtomicUsize::new(0),
        acknowledge_abort: !park,
    });
    let store = crate::runtime::DatabaseActorStore::connect_lazy(&endpoint).unwrap();
    let actor = DurableActorParticipant::new(sidecar.clone(), "example.Actor", "actor/1")
        .with_database_actor_gate(&store);
    let decisions = Arc::new(Decisions {
        endpoint,
        entered: tokio::sync::Notify::new(),
        park,
        destruction_probe: Mutex::new(None),
    });
    let coordinator = DurableRootCoordinator::new(decisions.clone(), Arc::new(NoRemote))
        .with_identity(ParticipantTarget {
            state_type: "example.Actor".into(),
            state_ref: "actor/1".into(),
        });
    let (started, ready) = oneshot::channel();
    let (force, forced_rx) = oneshot::channel();
    let host = ApplicationHost::new("explicit-abort-shutdown").with_host_recovery(Registration {
        owner: owner.clone(),
        started: Mutex::new(Some(started)),
        force: Mutex::new(forced.then_some(forced_rx)),
    });
    host.bind_participant_cleanup(&actor).unwrap();
    let listener = bounded(tokio::net::TcpListener::bind("127.0.0.1:0"))
        .await
        .unwrap();
    let (stop, stopped) = oneshot::channel();
    let (_, health) = tonic_health::server::health_reporter();
    let serving = tokio::spawn(
        host.add_service(Route(health))
            .serve_with_listener_shutdown(listener, async move {
                let _ = stopped.await;
            }),
    );
    bounded(ready).await.unwrap();
    let mode = if shared {
        TransactionMode::Shared
    } else {
        TransactionMode::Exclusive
    };
    let context = RootTransactionContext::start(
        crate::RebootHeaders::new("actor/1"),
        "example.Actor",
        mode,
        uuid::Uuid::new_v4(),
        prost_types::Timestamp::default(),
    )
    .unwrap()
    .transaction()
    .clone();
    let root = context.transaction_root_id();
    let (observed, destruction) = oneshot::channel();
    if forced {
        *decisions.destruction_probe.lock().unwrap() = Some(DestructionProbe {
            owner: owner.clone(),
            root,
            observed: Some(observed),
        });
    }
    let registered = if shared {
        RegisteredRoot::admit_shared_existing_writers(&actor, context.clone(), coordinator, &owner)
            .unwrap()
    } else {
        RegisteredRoot::before_load(&actor, context.clone(), coordinator, Some(&owner)).unwrap()
    };
    let local = bounded(actor.start_local(
        ActorTransactionStart {
            transaction_ids: context.transaction_ids().to_vec(),
            transaction_path: TransactionPathContract::RootOnly,
            coordinator_state_type: "example.Actor".into(),
            coordinator_state_ref: "actor/1".into(),
            mode,
            read_only: false,
            factory: false,
            state_type: "example.Actor".into(),
            state_ref: "actor/1".into(),
        },
        if shared {
            ParticipantStartMode::SharedUpgradeable
        } else {
            ParticipantStartMode::Exclusive
        },
    ))
    .await
    .unwrap();
    let mut context = context;
    let guard = bounded(registered.admitted(local)).await.unwrap();
    let guard = if shared {
        bounded(guard.with_shared_existing_writers(&mut context))
            .await
            .unwrap()
    } else {
        guard
    };
    let mut aborting = Some(tokio::spawn(guard.abort_explicit()));
    bounded(decisions.entered.notified()).await; // real worker executing SDK Abort DecisionPut
    if !park {
        bounded(aborting.take().unwrap()).await.unwrap().unwrap();
        #[cfg(feature = "test-support")]
        owner
            .wait_for_idle_for_test(std::time::Duration::from_secs(2))
            .await
            .unwrap();
        let permit = tokio::time::timeout(
            std::time::Duration::from_secs(2),
            owner.capacity.clone().acquire_owned(),
        )
        .await
        .unwrap()
        .unwrap();
        drop(permit);
        assert!(!owner.state.lock().unwrap().registered_roots.contains(&root));
        assert!(
            owner
                .state
                .lock()
                .unwrap()
                .retained_shared_permits
                .is_empty()
        );
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
    } else {
        #[cfg(feature = "test-support")]
        assert_eq!(
            owner
                .wait_for_idle_for_test(std::time::Duration::from_millis(20))
                .await
                .unwrap_err()
                .code(),
            tonic::Code::DeadlineExceeded
        );
        if forced {
            // No host cancellation yet: neither cooperative select branch can
            // produce this failure. Ready authority must be revoked by Drop
            // before the token/permit disappear, not by Active afterwards.
            let cancel = owner.state.lock().unwrap().host_cancel.clone().unwrap();
            assert!(!cancel.is_cancelled());
            bounded(cancel.public_ready()).await.unwrap();
            assert!(cancel.check_reader_admission().is_ok());
            let (joined, worker_destroyed) = oneshot::channel();
            force.send(joined).unwrap();
            assert_eq!(bounded(destruction).await.unwrap(), (true, false, true, 0));
            bounded(worker_destroyed).await.unwrap();
            assert!(bounded(aborting.take().unwrap()).await.unwrap().is_err());
            assert!(!owner.state.lock().unwrap().registered_roots.contains(&root));
            assert_eq!(owner.capacity.available_permits(), 1);
            assert!(!cancel.is_cancelled());
            assert!(cancel.check_reader_admission().is_err());
        }
        stop.send(()).unwrap();
        let result = tokio::time::timeout(std::time::Duration::from_secs(2), serving)
            .await
            .unwrap()
            .unwrap();
        if forced {
            match result {
                Err(ApplicationHostError::RecoveryTask(status)) => {
                    assert_eq!(status.code(), tonic::Code::Unavailable);
                    assert_eq!(
                        status.message(),
                        "durable task outcome uncertain during shutdown"
                    );
                }
                other => panic!("expected sticky uncertainty, got {other:?}"),
            }
        } else {
            assert!(matches!(result, Err(ApplicationHostError::RecoveryTask(_))));
            assert!(bounded(aborting.take().unwrap()).await.unwrap().is_err());
        }
        // Ordinary token/permit have disappeared: only the pre-destruction latch
        // can report uncertainty, while the exact actor must remain excluded.
        assert!(!owner.state.lock().unwrap().registered_roots.contains(&root));
        assert_eq!(owner.capacity.available_permits(), 1);
        #[cfg(feature = "test-support")]
        assert_eq!(
            owner
                .wait_for_idle_for_test(std::time::Duration::from_secs(1))
                .await
                .unwrap_err()
                .code(),
            tonic::Code::Unavailable
        );
        assert!(
            tokio::time::timeout(
                std::time::Duration::from_millis(20),
                store.actor_gate("example.Actor", "actor/1").exclusive()
            )
            .await
            .is_err()
        );
    }
    assert_eq!(
        sidecar.controls.load(Ordering::SeqCst),
        usize::from(!shared && !park)
    );
}
#[tokio::test]
async fn running_nonshared_abort_cancel_latches_host_before_token_drop() {
    host_case(false, true, false).await;
}
#[tokio::test]
async fn forced_nonshared_abort_destruction_latches_before_token_and_capacity_drop() {
    host_case(false, true, true).await;
}
#[tokio::test]
async fn settled_shared_abort_removes_token_and_shuts_host_down_orderly() {
    host_case(true, false, false).await;
}

async fn bounded<T>(future: impl Future<Output = T>) -> T {
    tokio::time::timeout(std::time::Duration::from_secs(2), future)
        .await
        .expect("bounded SDK test progress")
}

#[tokio::test]
async fn settled_ordinary_abort_shuts_host_down_orderly() {
    host_case(false, false, false).await;
}

#[tokio::test]
async fn idle_explicit_abort_host_shuts_down_orderly() {
    let owner = ExplicitAbortOwner::new(1).unwrap();
    let (started, ready) = oneshot::channel();
    let host = ApplicationHost::new("idle-abort-shutdown").with_host_recovery(Registration {
        owner: owner.clone(),
        started: Mutex::new(Some(started)),
        force: Mutex::new(None),
    });
    let listener = bounded(tokio::net::TcpListener::bind("127.0.0.1:0"))
        .await
        .unwrap();
    let (stop, stopped) = oneshot::channel();
    let (_, health) = tonic_health::server::health_reporter();
    let serving = tokio::spawn(
        host.add_service(Route(health))
            .serve_with_listener_shutdown(listener, async move {
                let _ = stopped.await;
            }),
    );
    bounded(ready).await.unwrap();
    #[cfg(feature = "test-support")]
    owner
        .wait_for_idle_for_test(std::time::Duration::from_secs(1))
        .await
        .unwrap();
    stop.send(()).unwrap();
    bounded(serving).await.unwrap().unwrap();
    assert!(!owner.state.lock().unwrap().active);
    assert_eq!(owner.capacity.available_permits(), 1);
}

// An observer, not an ownership guard: it only snapshots the queue latch and
// panics if the queued SDK work is ever polled. Its Drop observes BEFORE the
// actual SDK future's ordinary token and Job's capacity permit are released.
struct NeverPolledAbort {
    probe: Option<DestructionProbe>,
    _work: Work,
}
impl Future for NeverPolledAbort {
    type Output = Result<(), Status>;
    fn poll(self: Pin<&mut Self>, _: &mut std::task::Context<'_>) -> std::task::Poll<Self::Output> {
        panic!("actual queued Abort must not be polled");
    }
}
impl Drop for NeverPolledAbort {
    fn drop(&mut self) {
        drop(self.probe.take());
    }
}

// Construct a real ordinary registered SDK cleanup obligation before starting
// the worker. Only the host registration state/readiness is supplied by the
// test; admission, Load, guard Drop, Job submission and worker are actual SDK.
async fn queued_ordinary_drop_case(worker_abort: bool, reject: bool) {
    assert!(!worker_abort || !reject);
    let owner = ExplicitAbortOwner::new(1).unwrap();
    let (cancel, readiness) = RecoveryCancellation::test_host();
    {
        let mut state = owner.state.lock().unwrap();
        state.active = true;
        state.host_cancel = Some(cancel.clone());
    }
    let endpoint = format!("http://queued-abort-{}.invalid:1/", uuid::Uuid::new_v4());
    let sidecar = Arc::new(Sidecar {
        endpoint: endpoint.clone(),
        loads: AtomicUsize::new(0),
        controls: AtomicUsize::new(0),
        acknowledge_abort: false,
    });
    let store = crate::runtime::DatabaseActorStore::connect_lazy(&endpoint).unwrap();
    let actor = DurableActorParticipant::new(sidecar.clone(), "example.Actor", "actor/1")
        .with_database_actor_gate(&store);
    let decisions = Arc::new(Decisions {
        endpoint,
        entered: tokio::sync::Notify::new(),
        park: true,
        destruction_probe: Mutex::new(None),
    });
    let coordinator = DurableRootCoordinator::new(decisions.clone(), Arc::new(NoRemote))
        .with_identity(ParticipantTarget {
            state_type: "example.Actor".into(),
            state_ref: "actor/1".into(),
        });
    let context = RootTransactionContext::start(
        crate::RebootHeaders::new("actor/1"),
        "example.Actor",
        TransactionMode::Exclusive,
        uuid::Uuid::new_v4(),
        prost_types::Timestamp::default(),
    )
    .unwrap()
    .transaction()
    .clone();
    let root = context.transaction_root_id();
    let registered =
        RegisteredRoot::before_load(&actor, context.clone(), coordinator, Some(&owner)).unwrap();
    let local = bounded(actor.start_local(
        ActorTransactionStart {
            transaction_ids: context.transaction_ids().to_vec(),
            transaction_path: TransactionPathContract::RootOnly,
            coordinator_state_type: "example.Actor".into(),
            coordinator_state_ref: "actor/1".into(),
            mode: TransactionMode::Exclusive,
            read_only: false,
            factory: false,
            state_type: "example.Actor".into(),
            state_ref: "actor/1".into(),
        },
        ParticipantStartMode::Exclusive,
    ))
    .await
    .unwrap();
    let guard = bounded(registered.admitted(local)).await.unwrap();
    assert!(cancel.check_reader_admission().is_ok());
    assert_eq!(owner.capacity.available_permits(), 0);
    assert!(owner.state.lock().unwrap().registered_roots.contains(&root));
    if reject {
        // Actual try_send rejection, with NO Active or worker that could latch
        // instead of the rejected ordinary Job. Leave active true deliberately.
        owner
            .state
            .lock()
            .unwrap()
            .receiver
            .as_mut()
            .unwrap()
            .close();
        drop(guard);
        assert!(owner.failure.borrow().is_some());
    } else {
        drop(guard); // actual SDK submission, synchronous and still unpolled
        let mut job = owner
            .state
            .lock()
            .unwrap()
            .receiver
            .as_mut()
            .unwrap()
            .try_recv()
            .unwrap();
        let (observed, destruction) = oneshot::channel();
        job.work = Some(Box::pin(NeverPolledAbort {
            probe: Some(DestructionProbe {
                owner: owner.clone(),
                root,
                observed: Some(observed),
            }),
            _work: job.work.take().unwrap(),
        }));
        if worker_abort {
            owner.sender.try_send(job).ok().unwrap();
            let mut children = JoinSet::new();
            owner
                .recovery_registration()
                .start(&mut children, cancel.clone())
                .await
                .unwrap();
            // Current-thread runtime + no intervening yield/await suspension:
            // the spawned actual SDK worker cannot have had its first poll.
            children.abort_all();
            while let Some(joined) = bounded(children.join_next()).await {
                assert!(joined.unwrap_err().is_cancelled());
            }
            assert!(!owner.state.lock().unwrap().active);
        } else {
            // Isolate the aggregate from Active/generator field order entirely.
            drop(job);
            assert!(owner.state.lock().unwrap().active);
        }
        assert_eq!(bounded(destruction).await.unwrap(), (true, false, true, 0));
    }
    assert!(!cancel.is_cancelled());
    assert!(cancel.check_reader_admission().is_err());
    assert_eq!(
        *readiness.borrow(),
        crate::application_host::RecoveryState::Failed
    );
    assert!(owner.state.lock().unwrap().registered_roots.is_empty());
    assert_eq!(owner.capacity.available_permits(), 1);
    #[cfg(feature = "test-support")]
    assert_eq!(
        owner
            .wait_for_idle_for_test(std::time::Duration::from_secs(1))
            .await
            .unwrap_err()
            .code(),
        tonic::Code::Unavailable
    );
    assert!(
        owner
            .state
            .lock()
            .unwrap()
            .retained_shared_permits
            .is_empty()
    );
    assert_eq!(sidecar.loads.load(Ordering::SeqCst), 1);
    assert_eq!(sidecar.controls.load(Ordering::SeqCst), 0);
    assert!(
        tokio::time::timeout(
            std::time::Duration::from_millis(20),
            store.actor_gate("example.Actor", "actor/1").exclusive(),
        )
        .await
        .is_err()
    );
    assert!(
        tokio::time::timeout(
            std::time::Duration::from_millis(20),
            decisions.entered.notified(),
        )
        .await
        .is_err()
    );
}

#[tokio::test(flavor = "current_thread")]
async fn actual_worker_aborted_before_first_poll_latches_queued_ordinary_abort() {
    queued_ordinary_drop_case(true, false).await;
}
#[tokio::test]
async fn queued_ordinary_job_drop_latches_before_token_and_permit_without_active() {
    queued_ordinary_drop_case(false, false).await;
}
#[tokio::test]
async fn rejected_ordinary_submission_drop_latches_without_worker_or_active() {
    queued_ordinary_drop_case(false, true).await;
}

#[derive(Clone, Copy)]
enum AdmissionPath {
    PublicAbort,
    BeforeLoad,
    SharedBeforeLoad,
    BeforeHandler,
}

// The probe parks immediately before the common shutdown mutex, not after taking
// capacity. Active::drop really seals the owner while the attempt is parked.
// This is causal pre-admission coverage, not exhaustive scheduler exploration.
async fn rejected_admission_cannot_take_phantom_capacity(path: AdmissionPath) {
    let owner = ExplicitAbortOwner::new(1).unwrap();
    let (cancel, readiness) = RecoveryCancellation::test_host();
    {
        let mut state = owner.state.lock().unwrap();
        state.active = true;
        state.host_cancel = Some(cancel);
    }
    let endpoint = format!("http://rejected-{}.invalid:1/", uuid::Uuid::new_v4());
    let sidecar = Arc::new(Sidecar {
        endpoint: endpoint.clone(),
        loads: AtomicUsize::new(0),
        controls: AtomicUsize::new(0),
        acknowledge_abort: false,
    });
    let actor = DurableActorParticipant::new(sidecar.clone(), "example.Actor", "actor/1");
    let coordinator = DurableRootCoordinator::new(
        Arc::new(Decisions {
            endpoint,
            entered: tokio::sync::Notify::new(),
            park: false,
            destruction_probe: Mutex::new(None),
        }),
        Arc::new(NoRemote),
    )
    .with_identity(ParticipantTarget {
        state_type: "example.Actor".into(),
        state_ref: "actor/1".into(),
    });
    let mode = if matches!(path, AdmissionPath::SharedBeforeLoad) {
        TransactionMode::Shared
    } else {
        TransactionMode::Exclusive
    };
    let context = RootTransactionContext::start(
        crate::RebootHeaders::new("actor/1"),
        "example.Actor",
        mode,
        uuid::Uuid::new_v4(),
        prost_types::Timestamp::default(),
    )
    .unwrap()
    .transaction()
    .clone();
    let local = if matches!(
        path,
        AdmissionPath::PublicAbort | AdmissionPath::BeforeHandler
    ) {
        let mut local = bounded(actor.start_local(
            ActorTransactionStart {
                transaction_ids: context.transaction_ids().to_vec(),
                transaction_path: TransactionPathContract::RootOnly,
                coordinator_state_type: "example.Actor".into(),
                coordinator_state_ref: "actor/1".into(),
                mode,
                read_only: false,
                factory: false,
                state_type: "example.Actor".into(),
                state_ref: "actor/1".into(),
            },
            ParticipantStartMode::Exclusive,
        ))
        .await
        .unwrap();
        assert!(local.cancellation_eligible(&context));
        // Retain the actor obligation independently of pre-admission accounting;
        // this test must not manufacture a terminal ACK via ordinary local Drop.
        local.handoff_to_durable_recovery();
        Some(local)
    } else {
        None
    };
    let (arrived_tx, arrived_rx) = std::sync::mpsc::channel();
    let (resume_tx, resume_rx) = std::sync::mpsc::channel();
    *owner.admission_arrived.lock().unwrap() = Some((arrived_tx, Arc::new(Mutex::new(resume_rx))));
    let attempted_owner = owner.clone();
    let handle = tokio::runtime::Handle::current();
    let (done_tx, done_rx) = oneshot::channel();
    let thread = std::thread::spawn(move || {
        let result = handle.block_on(async move {
            match path {
                AdmissionPath::PublicAbort => {
                    attempted_owner
                        .abort(local.unwrap(), context, coordinator)
                        .await
                }
                AdmissionPath::BeforeLoad => RegisteredRoot::before_load(
                    &actor,
                    context,
                    coordinator,
                    Some(&attempted_owner),
                )
                .map(drop),
                AdmissionPath::SharedBeforeLoad => RegisteredRoot::admit_shared_existing_writers(
                    &actor,
                    context,
                    coordinator,
                    &attempted_owner,
                )
                .map(drop),
                AdmissionPath::BeforeHandler => RootHandlerGuard::before_handler(
                    local.unwrap(),
                    context,
                    coordinator,
                    Some(&attempted_owner),
                )
                .await
                .map(drop),
            }
        });
        let _ = done_tx.send(result);
    });
    arrived_rx
        .recv_timeout(std::time::Duration::from_secs(2))
        .unwrap();
    assert_eq!(
        owner.capacity.available_permits(),
        1,
        "pre-admission stole capacity"
    );
    drop(Active(
        owner.state.clone(),
        owner.capacity.clone(),
        owner.limit,
    ));
    assert!(!owner.state.lock().unwrap().active);
    assert_eq!(
        *readiness.borrow(),
        crate::application_host::RecoveryState::Ready,
        "rejected pre-admission must not fail an idle owner seal"
    );
    resume_tx.send(()).unwrap();
    let error = bounded(done_rx).await.unwrap().unwrap_err();
    thread.join().unwrap();
    assert_eq!(error.code(), tonic::Code::FailedPrecondition);
    assert_eq!(owner.capacity.available_permits(), 1);
    assert!(owner.state.lock().unwrap().registered_roots.is_empty());
    assert!(
        owner
            .state
            .lock()
            .unwrap()
            .retained_shared_permits
            .is_empty()
    );
    assert!(owner.failure.borrow().is_none());
    assert_eq!(
        *readiness.borrow(),
        crate::application_host::RecoveryState::Ready
    );
    assert_eq!(sidecar.controls.load(Ordering::SeqCst), 0);
    assert_eq!(
        sidecar.loads.load(Ordering::SeqCst),
        usize::from(matches!(
            path,
            AdmissionPath::PublicAbort | AdmissionPath::BeforeHandler
        ))
    );
}

#[tokio::test]
async fn public_abort_rejected_preadmission_has_no_phantom_capacity() {
    rejected_admission_cannot_take_phantom_capacity(AdmissionPath::PublicAbort).await;
}
#[tokio::test]
async fn before_load_rejected_preadmission_has_no_phantom_capacity() {
    rejected_admission_cannot_take_phantom_capacity(AdmissionPath::BeforeLoad).await;
}
#[tokio::test]
async fn shared_before_load_rejected_preadmission_has_no_phantom_capacity() {
    rejected_admission_cannot_take_phantom_capacity(AdmissionPath::SharedBeforeLoad).await;
}
#[tokio::test]
async fn before_handler_rejected_preadmission_has_no_phantom_capacity() {
    rejected_admission_cannot_take_phantom_capacity(AdmissionPath::BeforeHandler).await;
}

// The actual worker has sent its observer reply but still owns this future and
// its root token. Park *destruction*, not execution/result or a fake Done flag.
#[cfg(feature = "test-support")]
struct ReplyRetirementBarrier {
    owner: ExplicitAbortOwner,
    entered: Option<oneshot::Sender<(bool, usize)>>,
    release: std::sync::mpsc::Receiver<()>,
    token: RootRegistrationToken,
}
#[cfg(feature = "test-support")]
impl Future for ReplyRetirementBarrier {
    type Output = Result<(), Status>;
    fn poll(self: Pin<&mut Self>, _: &mut std::task::Context<'_>) -> std::task::Poll<Self::Output> {
        std::task::Poll::Ready(Ok(()))
    }
}
#[cfg(feature = "test-support")]
impl Drop for ReplyRetirementBarrier {
    fn drop(&mut self) {
        let present = self
            .owner
            .state
            .lock()
            .unwrap()
            .registered_roots
            .contains(&self.token.root);
        self.entered
            .take()
            .unwrap()
            .send((present, self.owner.capacity.available_permits()))
            .unwrap();
        self.release
            .recv_timeout(std::time::Duration::from_secs(2))
            .unwrap();
        // Actual token field destruction follows this body; Job capacity must
        // not return before either the owned work or that token has retired.
    }
}
#[cfg(feature = "test-support")]
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn owner_idle_requires_work_token_and_all_job_capacity_after_reply() {
    let owner = ExplicitAbortOwner::new(2).unwrap();
    let (cancel, _) = RecoveryCancellation::test_host();
    let mut supervisor = JoinSet::new();
    owner
        .recovery_registration()
        .start(&mut supervisor, cancel.clone())
        .await
        .unwrap();
    let root = uuid::Uuid::new_v4();
    let permit = owner
        .reserve_admission(Some(root), "inactive", "full")
        .unwrap();
    let other = owner.reserve_admission(None, "inactive", "full").unwrap();
    let (reply, observer) = oneshot::channel();
    let (entered, destruction) = oneshot::channel();
    let (release, resume) = std::sync::mpsc::channel();
    let work = Box::pin(ReplyRetirementBarrier {
        owner: owner.clone(),
        entered: Some(entered),
        release: resume,
        token: RootRegistrationToken {
            owner: owner.clone(),
            root,
            shared: false,
            finished: false,
        },
    });
    owner
        .sender
        .try_send(Job::new(&owner, work, reply, Some(permit)))
        .ok()
        .unwrap();
    bounded(observer).await.unwrap().unwrap(); // actual SDK worker reply, not retirement
    assert_eq!(bounded(destruction).await.unwrap(), (true, 0));
    assert_eq!(
        owner
            .wait_for_idle_for_test(std::time::Duration::from_millis(20))
            .await
            .unwrap_err()
            .code(),
        tonic::Code::DeadlineExceeded
    );
    release.send(()).unwrap();
    // Let real work/token/Job destruction progress, while a second *actual*
    // admission still holds capacity. One freed slot is not all configured idle.
    let capacity = bounded(owner.capacity.clone().acquire_owned())
        .await
        .unwrap();
    assert!(owner.state.lock().unwrap().registered_roots.is_empty());
    drop(capacity);
    assert_eq!(
        owner
            .wait_for_idle_for_test(std::time::Duration::from_millis(20))
            .await
            .unwrap_err()
            .code(),
        tonic::Code::DeadlineExceeded
    );
    drop(other);
    owner
        .wait_for_idle_for_test(std::time::Duration::from_secs(1))
        .await
        .unwrap();
    assert!(
        owner
            .state
            .lock()
            .unwrap()
            .retained_shared_permits
            .is_empty()
    );
    assert!(!cancel.failure_latched_for_test());
    cancel.cancel();
    bounded(supervisor.join_next())
        .await
        .unwrap()
        .unwrap()
        .unwrap();
}

#[cfg(feature = "test-support")]
#[tokio::test]
async fn retained_shared_abort_work_never_counts_as_owner_idle() {
    let owner = ExplicitAbortOwner::new(1).unwrap();
    let (cancel, _) = RecoveryCancellation::test_host();
    let mut supervisor = JoinSet::new();
    owner
        .recovery_registration()
        .start(&mut supervisor, cancel.clone())
        .await
        .unwrap();
    let permit = owner.reserve_admission(None, "inactive", "full").unwrap();
    drop(SharedAbortPermit {
        owner: owner.clone(),
        permit: Some(permit),
        completed: false,
    });
    assert!(owner.state.lock().unwrap().registered_roots.is_empty());
    assert_eq!(owner.state.lock().unwrap().retained_shared_permits.len(), 1);
    assert_eq!(
        owner
            .wait_for_idle_for_test(std::time::Duration::from_millis(20))
            .await
            .unwrap_err()
            .code(),
        tonic::Code::DeadlineExceeded
    );
    cancel.cancel();
    bounded(supervisor.join_next())
        .await
        .unwrap()
        .unwrap()
        .unwrap();
    assert_eq!(
        owner
            .wait_for_idle_for_test(std::time::Duration::from_secs(1))
            .await
            .unwrap_err()
            .code(),
        tonic::Code::Unavailable
    );
    assert_eq!(owner.capacity.available_permits(), 0);
}

#[cfg(feature = "test-support")]
#[tokio::test]
async fn explicit_idle_does_not_hide_owner_failure_with_full_capacity() {
    let owner = ExplicitAbortOwner::new(2).unwrap();
    owner
        .wait_for_idle_for_test(std::time::Duration::from_secs(1))
        .await
        .unwrap();
    owner.fail_for_test();
    assert_eq!(owner.capacity.available_permits(), 2);
    let error = owner
        .wait_for_idle_for_test(std::time::Duration::from_secs(1))
        .await
        .unwrap_err();
    assert_eq!(error.code(), tonic::Code::Unavailable);
    assert_eq!(error.message(), "test sticky owner failure");
}

// Shared capacity may be released INSIDE the final poll, before the completed
// work container / Job retire. Use the real SharedAbortPermit + real Job worker;
// no transaction ledger/participant state is created or cleared by this control.
#[cfg(feature = "test-support")]
struct SharedReplyRetirementBarrier {
    owner: ExplicitAbortOwner,
    permit: Option<SharedAbortPermit>,
    entered: Option<oneshot::Sender<usize>>,
    release: std::sync::mpsc::Receiver<()>,
}
#[cfg(feature = "test-support")]
impl Future for SharedReplyRetirementBarrier {
    type Output = Result<(), Status>;
    fn poll(
        mut self: Pin<&mut Self>,
        _: &mut std::task::Context<'_>,
    ) -> std::task::Poll<Self::Output> {
        self.permit.as_mut().unwrap().completed = true;
        drop(self.permit.take()); // factual captured permit restoration at known Work success
        std::task::Poll::Ready(Ok(()))
    }
}
#[cfg(feature = "test-support")]
impl Drop for SharedReplyRetirementBarrier {
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
async fn shared_reply_and_full_capacity_do_not_count_a_live_job_as_idle() {
    let owner = ExplicitAbortOwner::new(1).unwrap();
    let (cancel, _) = RecoveryCancellation::test_host();
    let mut supervisor = JoinSet::new();
    owner
        .recovery_registration()
        .start(&mut supervisor, cancel.clone())
        .await
        .unwrap();
    let permit = owner.reserve_admission(None, "inactive", "full").unwrap();
    let (reply, observer) = oneshot::channel();
    let (entered, destruction) = oneshot::channel();
    let (release, resume) = std::sync::mpsc::channel();
    let work = Box::pin(SharedReplyRetirementBarrier {
        owner: owner.clone(),
        permit: Some(SharedAbortPermit {
            owner: owner.clone(),
            permit: Some(permit),
            completed: false,
        }),
        entered: Some(entered),
        release: resume,
    });
    owner
        .sender
        .try_send(Job::new(&owner, work, reply, None))
        .ok()
        .unwrap();
    bounded(observer).await.unwrap().unwrap();
    assert_eq!(bounded(destruction).await.unwrap(), 1);
    {
        let state = owner.state.lock().unwrap();
        assert!(state.registered_roots.is_empty());
        assert!(state.retained_shared_permits.is_empty());
        assert_eq!(state.owned_jobs, 1);
    }
    assert_eq!(
        owner
            .wait_for_idle_for_test(std::time::Duration::from_millis(20))
            .await
            .unwrap_err()
            .code(),
        tonic::Code::DeadlineExceeded
    );
    release.send(()).unwrap();
    owner
        .wait_for_idle_for_test(std::time::Duration::from_secs(1))
        .await
        .unwrap();
    assert_eq!(owner.state.lock().unwrap().owned_jobs, 0);
    assert!(!cancel.failure_latched_for_test());
    cancel.cancel();
    bounded(supervisor.join_next())
        .await
        .unwrap()
        .unwrap()
        .unwrap();
}
