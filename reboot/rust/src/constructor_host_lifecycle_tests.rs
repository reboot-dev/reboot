//! SOURCE ONLY: actual host supervision with the SDK's model Database service.
//! Not native-sidecar/public Bank acceptance. Run each ignored case in a fresh
//! exact-test process: production uncertainty reservations cannot be reset.
use super::*;
use crate::application_host::{
    ApplicationHost, ApplicationHostError, HostRecovery, RecoveryCancellation,
};
use std::time::Duration;

const DEADLINE: Duration = Duration::from_secs(5);

// Observe the real host cancellation allocation; never manufacture readiness.
struct ObserveRecovery {
    recovery: OneShotTaskRecovery,
    started: Mutex<Option<tokio::sync::oneshot::Sender<RecoveryCancellation>>>,
}
#[tonic::async_trait]
impl HostRecovery for ObserveRecovery {
    async fn start(
        &self,
        supervisor: &mut tokio::task::JoinSet<Result<(), Status>>,
        cancel: RecoveryCancellation,
    ) -> Result<(), Status> {
        self.recovery.start(supervisor, cancel.clone()).await?;
        self.started
            .lock()
            .unwrap()
            .take()
            .unwrap()
            .send(cancel)
            .unwrap();
        Ok(())
    }
}

async fn joined_host(
    mut join: tokio::task::JoinHandle<Result<(), ApplicationHostError>>,
) -> Result<(), ApplicationHostError> {
    match tokio::time::timeout(Duration::from_secs(15), &mut join).await {
        Ok(result) => result.expect("actual host task panicked"),
        Err(_) => {
            join.abort();
            let cleanup = tokio::time::timeout(DEADLINE, &mut join).await;
            panic!(
                "actual host join deadline expired; aborted outer task cleanup: {cleanup:?}; NOT joined host acceptance"
            );
        }
    }
}

struct Hosted {
    fixture: Fixture,
    cancel: RecoveryCancellation,
    shutdown: Option<tokio::sync::oneshot::Sender<()>>,
    join: Option<tokio::task::JoinHandle<Result<(), ApplicationHostError>>>,
}
fn declarations() -> Vec<TaskMethodDeclaration> {
    vec![
        TaskMethodDeclaration::new::<Account, Counter, db::TaskId>(OPEN, ID, vec![])
            .constructor_scheduling(),
        TaskMethodDeclaration::new::<Account, Counter, Counter>(EMAIL, COUNTER, vec![]),
    ]
}
fn recovery_request() -> db::RecoverRequest {
    db::RecoverRequest {
        shard_ids: vec!["constructor-host-proof-shard".into()],
        state_tags_by_state_type: [(Account::STATE_TYPE.into(), "Counter".into())].into(),
        ..Default::default()
    }
}
impl Hosted {
    async fn new() -> Self {
        let (endpoint, database, server) = crate::runtime::test_support::start_database().await;
        let store = DatabaseActorStore::connect_lazy(endpoint).unwrap();
        let reference = crate::state_ref::StateRef::from_id(
            Account::STATE_TYPE,
            &uuid::Uuid::new_v4().to_string(),
        )
        .unwrap()
        .to_string();
        let tasks = OneShotTasks::new_with_declarations(
            store.clone(),
            Account::STATE_TYPE.into(),
            reference.clone(),
            Binding,
            declarations(),
        )
        .unwrap();
        // No manual claim, active flag, recovery_request assignment or test_host.
        let fixture = Fixture {
            store,
            database,
            tasks,
            reference,
            _owner: Mutex::new(None),
            server,
        };
        let (started_tx, started_rx) = tokio::sync::oneshot::channel();
        let (shutdown_tx, shutdown_rx) = tokio::sync::oneshot::channel();
        let host = ApplicationHost::new(format!("constructor-host-proof-{}", uuid::Uuid::new_v4()))
            .with_host_recovery(ObserveRecovery {
                recovery: fixture.tasks.recovery(recovery_request()),
                started: Mutex::new(Some(started_tx)),
            })
            // A real Tonic service, no placeholder router or duplicate Health route.
            .add_service(db::database_server::DatabaseServer::new(
                fixture.database.clone(),
            ));
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let join = tokio::spawn(host.serve_with_listener_shutdown(listener, async move {
            let _ = shutdown_rx.await;
        }));
        let cancel = tokio::time::timeout(DEADLINE, started_rx)
            .await
            .unwrap()
            .unwrap();
        tokio::time::timeout(DEADLINE, cancel.public_ready())
            .await
            .unwrap()
            .unwrap();
        Self {
            fixture,
            cancel,
            shutdown: Some(shutdown_tx),
            join: Some(join),
        }
    }
    async fn finish(&mut self, request_shutdown: bool) -> Result<(), ApplicationHostError> {
        if request_shutdown {
            let _ = self.shutdown.take().unwrap().send(());
        }
        let result = joined_host(self.join.take().unwrap()).await;
        assert_eq!(
            self.cancel.public_ready().await.unwrap_err().code(),
            tonic::Code::Unavailable
        );
        assert!(
            self.fixture
                .tasks
                .inner
                .running_owner
                .lock()
                .unwrap()
                .is_none()
        );
        result
    }
}
fn life(f: &Fixture) -> Arc<DispatchLifecycle> {
    owners()
        .lock()
        .unwrap()
        .get(&(
            f.store.database_endpoint().to_owned(),
            Account::STATE_TYPE.into(),
            f.reference.clone(),
        ))
        .unwrap()
        .clone()
}
async fn retained_and_cold_host_rejected(f: &Fixture, original: &Arc<()>) {
    let entry = life(f);
    let status = f.tasks.constructor_uncertainty_status();
    assert!(status.actor_sealed && status.actor_retained);
    {
        let state = entry.constructor.lock().unwrap();
        let retained = state.retained.as_ref().unwrap();
        assert!(Arc::ptr_eq(&retained._admission.generation, original));
        assert!(Arc::ptr_eq(
            &retained._admission.tasks.inner,
            &f.tasks.inner
        ));
        assert!(Arc::ptr_eq(&entry.generation, original));
    }
    cold_host_rejected(f).await;
}
async fn cold_host_rejected(f: &Fixture) {
    let entry = life(f);
    let gate = f.store.actor_gate(Account::STATE_TYPE, &f.reference);
    assert!(
        tokio::time::timeout(Duration::from_millis(20), gate.exclusive())
            .await
            .is_err()
    );
    // Exact original endpoint/typed owner domain, genuinely cold allocations.
    let cold_store = DatabaseActorStore::connect_lazy(f.store.database_endpoint()).unwrap();
    let cold = OneShotTasks::new_with_declarations(
        cold_store,
        Account::STATE_TYPE.into(),
        f.reference.clone(),
        Binding,
        declarations(),
    )
    .unwrap();
    assert!(!Arc::ptr_eq(&cold.inner, &f.tasks.inner));
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let host = ApplicationHost::new(format!("cold-constructor-host-{}", uuid::Uuid::new_v4()))
        .with_host_recovery(cold.recovery(recovery_request()))
        .add_service(db::database_server::DatabaseServer::new(f.database.clone()));
    let cold_join =
        tokio::spawn(host.serve_with_listener_shutdown(listener, std::future::pending()));
    let error = joined_host(cold_join).await.unwrap_err();
    assert!(
        matches!(error, ApplicationHostError::Lifecycle { source, .. } if source.code() == tonic::Code::AlreadyExists)
    );
    assert!(
        Arc::ptr_eq(&entry, &life(f)),
        "cold host must not replace exact registry entry"
    );
}

#[tokio::test]
#[ignore = "requires fresh exact-test process; intentionally retains global reservation"]
async fn actual_host_uncertainty_failure_joins_and_cold_host_cannot_adopt() {
    let mut hosted = Hosted::new().await;
    let f = &hosted.fixture;
    assert_eq!(f.tasks.constructor_uncertainty_status().process_reserved, 0);
    let original = f.tasks.inner.running_owner.lock().unwrap().clone().unwrap();
    let entry = life(f);
    let (entered, _release) = f.database.park_create();
    let mut call = Box::pin(f.call(uuid::Uuid::new_v4(), 7, f.task()));
    tokio::time::timeout(DEADLINE, async {
        tokio::select! { result = &mut call => panic!("constructor unexpectedly finished: {result:?}"), result = entered => result.unwrap() }
    }).await.unwrap();
    assert!(entry.constructor.lock().unwrap().sealed);
    assert!(entry.constructor.lock().unwrap().retained.is_none());
    assert!(f.database.create_requests().is_empty());
    drop(call); // actual attempt destructor latches uncertainty, real supervisor fails
    let result = hosted.finish(false).await;
    assert!(
        matches!(result, Err(ApplicationHostError::RecoveryTask(source)) if source.code() == tonic::Code::Unavailable)
    );
    assert!(Arc::ptr_eq(&entry, &life(&hosted.fixture)));
    retained_and_cold_host_rejected(&hosted.fixture, &original).await;
    assert_eq!(
        hosted
            .fixture
            .tasks
            .constructor_uncertainty_status()
            .process_reserved,
        1
    );
}

#[tokio::test]
#[ignore = "requires fresh exact-test process; intentionally retains global reservation"]
async fn actual_host_joined_shutdown_preserves_pre_ack_seal_then_late_cancellation() {
    let mut hosted = Hosted::new().await;
    let f = &hosted.fixture;
    let original = f.tasks.inner.running_owner.lock().unwrap().clone().unwrap();
    let entry = life(f);
    let (entered, _release) = f.database.park_create();
    let mut call = Box::pin(f.call(uuid::Uuid::new_v4(), 7, f.task()));
    tokio::time::timeout(DEADLINE, async {
        tokio::select! { result = &mut call => panic!("constructor unexpectedly finished: {result:?}"), result = entered => result.unwrap() }
    }).await.unwrap();
    let _ = hosted.shutdown.take().unwrap().send(());
    // Borrow disjoint control fields while the original constructor stays parked.
    let result = joined_host(hosted.join.take().unwrap()).await;
    assert!(
        result.is_ok(),
        "direct SDK future is not host ingress-owned; late uncertainty cannot retroactively fail an already joined host"
    );
    assert_eq!(
        hosted.cancel.public_ready().await.unwrap_err().code(),
        tonic::Code::Unavailable
    );
    assert!(f.tasks.inner.running_owner.lock().unwrap().is_none());
    assert!(Arc::ptr_eq(&entry, &life(f)));
    assert!(entry.constructor.lock().unwrap().sealed);
    assert!(entry.constructor.lock().unwrap().retained.is_none());
    cold_host_rejected(f).await; // fence must hold BEFORE attempt destruction too
    drop(call);
    retained_and_cold_host_rejected(f, &original).await;
    assert_eq!(f.tasks.constructor_uncertainty_status().process_reserved, 1);
}

#[tokio::test]
#[ignore = "MUST run alone in a fresh exact-test process; exhausts production global64"]
async fn actual_global64_exhaustion_ack_release_and_cancelled_permit_not_recycled() {
    // No private semaphore, direct reservation calls, reset or drain API.
    let mut hosted = Vec::new();
    for _ in 0..65 {
        hosted.push(Hosted::new().await);
    }
    assert_eq!(
        hosted[0]
            .fixture
            .tasks
            .constructor_uncertainty_status()
            .process_limit,
        64
    );
    assert_eq!(
        hosted[0]
            .fixture
            .tasks
            .constructor_uncertainty_status()
            .process_reserved,
        0
    );
    let mut calls = Vec::new();
    let mut releases = Vec::new();
    for h in &hosted[..64] {
        let f = &h.fixture;
        let (entered, release) = f.database.park_create();
        let mut call = Box::pin(f.call(uuid::Uuid::new_v4(), 7, f.task()));
        tokio::time::timeout(DEADLINE, async {
            tokio::select! { result = &mut call => panic!("unexpected constructor result: {result:?}"), result = entered => result.unwrap() }
        }).await.unwrap();
        calls.push(call);
        releases.push(release);
    }
    assert_eq!(
        hosted[0]
            .fixture
            .tasks
            .constructor_uncertainty_status()
            .process_reserved,
        64
    );
    let overflow = &hosted[64].fixture;
    let (mut overflow_entered, _overflow_release) = overflow.database.park_create();
    assert_eq!(
        tokio::time::timeout(
            DEADLINE,
            overflow.call(uuid::Uuid::new_v4(), 7, overflow.task())
        )
        .await
        .unwrap()
        .unwrap_err()
        .code(),
        tonic::Code::ResourceExhausted
    );
    assert!(
        tokio::time::timeout(Duration::from_millis(20), &mut overflow_entered)
            .await
            .is_err(),
        "65th must not enter native-create model, even before durable batch"
    );
    assert!(overflow.database.create_requests().is_empty());
    assert!(!overflow.tasks.constructor_uncertainty_status().actor_sealed);
    for (index, (call, release)) in calls.into_iter().zip(releases).enumerate() {
        release.send(()).unwrap();
        tokio::time::timeout(DEADLINE, call).await.unwrap().unwrap();
        assert_eq!(
            hosted[0]
                .fixture
                .tasks
                .constructor_uncertainty_status()
                .process_reserved,
            63 - index
        );
    }
    assert_eq!(
        hosted
            .iter()
            .map(|h| h.fixture.database.create_requests().len())
            .sum::<usize>(),
        64
    );
    for h in &mut hosted {
        h.finish(true).await.unwrap();
    }
    drop(hosted);

    // Refill the actual global after healthy ACK released all64, then cancel
    // one actual constructor and ACK the other63. The retained slot stays used.
    let mut hosted = Vec::new();
    for _ in 0..65 {
        hosted.push(Hosted::new().await);
    }
    let mut calls = Vec::new();
    let mut releases = Vec::new();
    for h in &hosted[..64] {
        let f = &h.fixture;
        let (entered, release) = f.database.park_create();
        let mut call = Box::pin(f.call(uuid::Uuid::new_v4(), 7, f.task()));
        tokio::time::timeout(DEADLINE, async {
            tokio::select! { result = &mut call => panic!("unexpected constructor result: {result:?}"), result = entered => result.unwrap() }
        }).await.unwrap();
        calls.push(call);
        releases.push(release);
    }
    let original = hosted[63]
        .fixture
        .tasks
        .inner
        .running_owner
        .lock()
        .unwrap()
        .clone()
        .unwrap();
    drop(calls.pop().unwrap());
    drop(releases.pop().unwrap());
    assert_eq!(
        hosted[0]
            .fixture
            .tasks
            .constructor_uncertainty_status()
            .process_reserved,
        64
    );
    let overflow = &hosted[64].fixture;
    let (mut entered, _release) = overflow.database.park_create();
    assert_eq!(
        tokio::time::timeout(
            DEADLINE,
            overflow.call(uuid::Uuid::new_v4(), 7, overflow.task())
        )
        .await
        .unwrap()
        .unwrap_err()
        .code(),
        tonic::Code::ResourceExhausted
    );
    assert!(
        tokio::time::timeout(Duration::from_millis(20), &mut entered)
            .await
            .is_err()
    );
    assert!(overflow.database.create_requests().is_empty());
    for (index, (call, release)) in calls.into_iter().zip(releases).enumerate() {
        release.send(()).unwrap();
        tokio::time::timeout(DEADLINE, call).await.unwrap().unwrap();
        assert_eq!(
            hosted[0]
                .fixture
                .tasks
                .constructor_uncertainty_status()
                .process_reserved,
            63 - index
        );
    }
    for h in &mut hosted[..63] {
        h.finish(true).await.unwrap();
    }
    assert!(matches!(
        hosted[63].finish(false).await,
        Err(ApplicationHostError::RecoveryTask(_))
    ));
    hosted[64].finish(true).await.unwrap();
    retained_and_cold_host_rejected(&hosted[63].fixture, &original).await;
    assert_eq!(
        hosted[0]
            .fixture
            .tasks
            .constructor_uncertainty_status()
            .process_reserved,
        1
    );
}
