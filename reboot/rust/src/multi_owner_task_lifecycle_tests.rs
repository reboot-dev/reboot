//! Source-only lifecycle regression cases; parent owns compilation/execution.
use super::*;
struct Writer;
#[tonic::async_trait]
impl ReaderTaskBinding for Writer {
    fn validate(&self, task: &db::Task) -> Result<(), Status> {
        if task.method != "WelcomeEmail" {
            return Err(Status::invalid_argument("unknown WelcomeEmail method"));
        }
        <crate::proto::Counter as prost::Message>::decode(task.request.as_slice())
            .map_err(|_| Status::invalid_argument("invalid WelcomeEmail request"))?;
        Ok(())
    }
    fn writer_capable(&self) -> bool {
        true
    }
    fn is_writer(&self, _: &db::Task) -> bool {
        true
    }
    fn writer_method(&self, _: &db::Task) -> Option<&'static str> {
        Some("test.AccountMethods.WelcomeEmail")
    }
    fn writer_response_type(&self, _: &db::Task) -> Option<&'static str> {
        Some("type.googleapis.com/test.Response")
    }
    async fn execute(&self, _: &db::Task) -> Result<prost_types::Any, Status> {
        panic!("no dispatch before actual host Ready")
    }
}
fn owner(endpoint: &str, reference: &str) -> OneShotTasks {
    let tasks = OneShotTasks::new(
        DatabaseActorStore::connect_lazy(endpoint).unwrap(),
        "test.Account".into(),
        reference.into(),
        Writer,
    )
    .unwrap();
    tasks.set_max_live_deliveries(4).unwrap();
    tasks
}
fn request() -> db::RecoverRequest {
    db::RecoverRequest {
        shard_ids: vec!["shared".into()],
        state_tags_by_state_type: [("test.Account".into(), Default::default())].into(),
        ..Default::default()
    }
}
fn task(reference: &str, n: u8) -> db::Task {
    let mut uuid = vec![n; 16];
    uuid[6] = 0x40;
    uuid[8] = 0x80;
    db::Task {
        task_id: Some(db::TaskId {
            state_type: "test.Account".into(),
            state_ref: reference.into(),
            task_uuid: uuid,
        }),
        method: "WelcomeEmail".into(),
        status: db::task::Status::Pending as i32,
        ..Default::default()
    }
}
#[tokio::test]
async fn shared_writer_admission_uses_all_owners_with_future_scheduled_delivery() {
    let (endpoint, database, server) = crate::runtime::test_support::start_database().await;
    database.model_control_only_store();
    let a = owner(&endpoint, "multi585-admission-a");
    let b = owner(&endpoint, "multi585-admission-b");
    let empty = owner(&endpoint, "multi585-completed-only");
    // Same UUID on distinct actors is legal; no singleton validation of peers.
    a.inner
        .store
        .task_database()
        .store(db::StoreRequest {
            sync: true,
            task_upserts: [&a, &b]
                .into_iter()
                .map(|owner| {
                    let mut pending = task(&owner.inner.state_ref, 1);
                    pending.timestamp = Some(prost_types::Timestamp {
                        seconds: 253_402_300_799,
                        nanos: 0,
                    });
                    pending
                })
                .collect(),
            ..Default::default()
        })
        .await
        .unwrap();
    let recovery =
        MultiOwnerTaskRecovery::new([a.clone(), b.clone(), empty.clone()], request()).unwrap();
    let (cancel, _readiness) = RecoveryCancellation::test_host();
    let mut supervisor = JoinSet::new();
    recovery
        .start(&mut supervisor, cancel.clone())
        .await
        .unwrap();
    for tasks in [&a, &b, &empty] {
        assert!(
            tasks
                .inner
                .active
                .load(std::sync::atomic::Ordering::Acquire)
        );
        let actual = tasks.inner.recovery_owner.lock().unwrap().clone().unwrap();
        assert!(actual.same_recovery_owner(&cancel));
    }
    a.validate_staged(&[task(&a.inner.state_ref, 2)])
        .await
        .unwrap();
    b.validate_staged(&[task(&b.inner.state_ref, 3)])
        .await
        .unwrap();
    // A singleton rescan WOULD reject the peer owner in the same canonical stream.
    assert!(a.pending(request()).await.is_err());
    assert!(
        tokio::time::timeout(std::time::Duration::from_millis(20), supervisor.join_next())
            .await
            .is_err()
    );
    cancel.cancel();
    while let Some(result) = supervisor.join_next().await {
        result.unwrap().unwrap();
    }
    for tasks in [&a, &b, &empty] {
        assert!(
            !tasks
                .inner
                .active
                .load(std::sync::atomic::Ordering::Acquire)
        );
        assert!(tasks.inner.shared_recovery.lock().unwrap().is_none());
        assert!(
            tasks
                .validate_staged(&[task(&tasks.inner.state_ref, 4)])
                .await
                .is_err()
        );
        drop(DispatchOwner::claim(tasks.clone()).unwrap());
    }
    server.abort();
    let _ = server.await;
}
#[tokio::test]
async fn every_claim_and_actual_cancel_are_bound_before_canonical_io() {
    let (endpoint, database, server) = crate::runtime::test_support::start_database().await;
    let a = owner(&endpoint, "multi585-claim-a");
    let b = owner(&endpoint, "multi585-claim-b");
    let (entered_rx, release_tx) = database.park_task_recover();
    let recovery = MultiOwnerTaskRecovery::new([a.clone(), b.clone()], request()).unwrap();
    let (cancel, _readiness) = RecoveryCancellation::test_host();
    let mut supervisor = JoinSet::new();
    let start = recovery.start(&mut supervisor, cancel.clone());
    tokio::pin!(start);
    tokio::select! { _ = entered_rx => {}, result = &mut start => panic!("early start: {result:?}") }
    for tasks in [&a, &b] {
        assert!(DispatchOwner::claim(tasks.clone()).is_err());
        assert!(
            tasks
                .inner
                .recovery_owner
                .lock()
                .unwrap()
                .as_ref()
                .unwrap()
                .same_recovery_owner(&cancel)
        );
        assert!(
            !tasks
                .inner
                .active
                .load(std::sync::atomic::Ordering::Acquire)
        );
    }
    cancel.cancel();
    assert_eq!(start.await.unwrap_err().code(), tonic::Code::Cancelled);
    for tasks in [&a, &b] {
        drop(DispatchOwner::claim(tasks.clone()).unwrap());
    }
    drop(release_tx);
    server.abort();
    let _ = server.await;
}
#[tokio::test]
async fn invalid_registration_and_global_budget_fail_without_activation() {
    let a = owner("http://127.0.0.1:1", "multi585-invalid-a");
    assert!(MultiOwnerTaskRecovery::new([], request()).is_err());
    assert!(MultiOwnerTaskRecovery::new([a.clone(), a.clone()], request()).is_err());
    let b = owner("http://127.0.0.1:1", "multi585-invalid-b");
    a.set_max_live_deliveries(MAX_TASKS).unwrap();
    let recovery = MultiOwnerTaskRecovery::new([a.clone(), b.clone()], request()).unwrap();
    let mut supervisor = JoinSet::new();
    let (cancel, _readiness) = RecoveryCancellation::test_host();
    assert_eq!(
        recovery
            .start(&mut supervisor, cancel)
            .await
            .unwrap_err()
            .code(),
        tonic::Code::ResourceExhausted
    );
    assert!(supervisor.is_empty());
    for tasks in [a, b] {
        assert!(
            !tasks
                .inner
                .active
                .load(std::sync::atomic::Ordering::Acquire)
        );
        assert!(tasks.inner.receiver.lock().unwrap().is_some());
        drop(DispatchOwner::claim(tasks).unwrap());
    }
}

#[test]
fn writer_validation_checks_exact_method_and_request() {
    let valid = task("validation", 1);
    assert!(Writer.validate(&valid).is_ok());
    let mut wrong = valid.clone();
    wrong.method = "Other".into();
    assert!(Writer.validate(&wrong).is_err());
    wrong = valid;
    wrong.request = vec![0xff];
    assert!(Writer.validate(&wrong).is_err());
}

struct DestructionProbe {
    tasks: OneShotTasks,
    observed: Option<tokio::sync::oneshot::Sender<(bool, bool)>>,
    release: std::sync::mpsc::Receiver<()>,
}
impl Drop for DestructionProbe {
    fn drop(&mut self) {
        let revoked = self.tasks.inner.running_owner.lock().unwrap().is_none()
            && !self
                .tasks
                .inner
                .active
                .load(std::sync::atomic::Ordering::Acquire);
        let held = DispatchOwner::claim(self.tasks.clone()).is_err();
        let _ = self.observed.take().unwrap().send((revoked, held));
        let _ = self.release.recv_timeout(std::time::Duration::from_secs(5));
    }
}
struct ParkedReader {
    probe: Mutex<Option<DestructionProbe>>,
    entered: Mutex<Option<tokio::sync::oneshot::Sender<()>>>,
}
#[tonic::async_trait]
impl ReaderTaskBinding for ParkedReader {
    fn validate(&self, task: &db::Task) -> Result<(), Status> {
        Writer.validate(task)
    }
    async fn execute(&self, _: &db::Task) -> Result<prost_types::Any, Status> {
        let _probe = self.probe.lock().unwrap().take().unwrap();
        let _ = self.entered.lock().unwrap().take().unwrap().send(());
        std::future::pending().await
    }
}
#[tokio::test(flavor = "multi_thread", worker_threads = 3)]
async fn forced_shared_supervisor_abort_revokes_before_delivery_destruction() {
    let (endpoint, database, server) = crate::runtime::test_support::start_database().await;
    database.model_control_only_store();
    let (entered_tx, entered_rx) = tokio::sync::oneshot::channel();
    let (observed_tx, observed_rx) = tokio::sync::oneshot::channel();
    let (release_tx, release_rx) = std::sync::mpsc::channel();
    let binding = Arc::new(ParkedReader {
        probe: Mutex::new(None),
        entered: Mutex::new(Some(entered_tx)),
    });
    // Bind through a forwarding allocation so the probe can reference the exact owner.
    struct Forward(Arc<ParkedReader>);
    #[tonic::async_trait]
    impl ReaderTaskBinding for Forward {
        fn validate(&self, task: &db::Task) -> Result<(), Status> {
            self.0.validate(task)
        }
        async fn execute(&self, task: &db::Task) -> Result<prost_types::Any, Status> {
            self.0.execute(task).await
        }
    }
    let a = OneShotTasks::new(
        DatabaseActorStore::connect_lazy(&endpoint).unwrap(),
        "test.Account".into(),
        "multi593-drop".into(),
        Forward(binding.clone()),
    )
    .unwrap();
    a.set_max_live_deliveries(4).unwrap();
    *binding.probe.lock().unwrap() = Some(DestructionProbe {
        tasks: a.clone(),
        observed: Some(observed_tx),
        release: release_rx,
    });
    let b = owner(&endpoint, "multi593-peer");
    a.inner
        .store
        .task_database()
        .store(db::StoreRequest {
            sync: true,
            task_upserts: vec![task(&a.inner.state_ref, 1)],
            ..Default::default()
        })
        .await
        .unwrap();
    let recovery = MultiOwnerTaskRecovery::new([a.clone(), b.clone()], request()).unwrap();
    let (cancel, _readiness) = RecoveryCancellation::test_host();
    cancel.public_ready().await.unwrap();
    let mut supervisor = JoinSet::new();
    recovery.start(&mut supervisor, cancel).await.unwrap();
    tokio::time::timeout(std::time::Duration::from_secs(2), entered_rx)
        .await
        .unwrap()
        .unwrap();
    supervisor.abort_all();
    assert!(
        supervisor
            .join_next()
            .await
            .unwrap()
            .unwrap_err()
            .is_cancelled()
    );
    assert_eq!(
        tokio::time::timeout(std::time::Duration::from_secs(2), observed_rx)
            .await
            .unwrap()
            .unwrap(),
        (true, true)
    );
    assert!(b.inner.running_owner.lock().unwrap().is_none());
    assert!(DispatchOwner::claim(a.clone()).is_err());
    release_tx.send(()).unwrap();
    tokio::time::timeout(std::time::Duration::from_secs(2), async {
        loop {
            if let Ok(claim) = DispatchOwner::claim(a.clone()) {
                drop(claim);
                break;
            }
            tokio::task::yield_now().await;
        }
    })
    .await
    .unwrap();
    drop(DispatchOwner::claim(b).unwrap());
    server.abort();
    let _ = server.await;
}
