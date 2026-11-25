//! SOURCE tests only: no executed runtime/native or host-ready qualification.
use super::*;
use crate::runtime::DurableStateDeclaration;
struct Binding;
#[tonic::async_trait]
impl ReaderTaskBinding for Binding {
    fn validate(&self, task: &db::Task) -> Result<(), Status> {
        if task.method != "WelcomeEmail" {
            return Err(Status::invalid_argument("unknown method"));
        }
        Ok(())
    }
    async fn execute(&self, _: &db::Task) -> Result<prost_types::Any, Status> {
        panic!("preparation must not dispatch")
    }
}
struct Account;
impl crate::runtime::DurableStateDeclaration for Account {
    type State = crate::proto::Counter;
    const STATE_TYPE: &'static str = "test.Prepared619";
}
fn owner(reference: &str) -> OneShotTasks {
    let tasks = OneShotTasks::new_with_declarations(
        DatabaseActorStore::connect_lazy("http://127.0.0.1:1").unwrap(),
        Account::STATE_TYPE.into(),
        reference.into(),
        Binding,
        vec![TaskMethodDeclaration::new::<
            Account,
            crate::proto::Counter,
            crate::proto::Counter,
        >(
            "test.PreparedMethods.WelcomeEmail",
            "type.googleapis.com/test.Response",
            vec![],
        )],
    )
    .unwrap();
    tasks.set_max_live_deliveries(4).unwrap();
    tasks
}
fn request() -> db::RecoverRequest {
    db::RecoverRequest {
        shard_ids: vec!["shared".into()],
        skip_idempotent_mutations: true,
        state_tags_by_state_type: [(Account::STATE_TYPE.into(), Default::default())].into(),
    }
}
fn task(reference: &str) -> db::Task {
    db::Task {
        task_id: Some(db::TaskId {
            state_type: Account::STATE_TYPE.into(),
            state_ref: reference.into(),
            task_uuid: uuid::Uuid::new_v4().as_bytes().to_vec(),
        }),
        method: "WelcomeEmail".into(),
        status: db::task::Status::Pending as i32,
        ..Default::default()
    }
}
#[tokio::test]
async fn original_claims_precede_snapshot_and_healthy_validation_does_not_leak() {
    let tasks = owner("pure619");
    let weak = Arc::downgrade(&tasks.inner);
    let recovery = MultiOwnerTaskRecovery::new([tasks.clone()], request()).unwrap();
    let cancel = RecoveryCancellation::new();
    let prepared = recovery.prepare_shared_startup(cancel.clone()).unwrap();
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
    let snapshot = prepared
        .validate_snapshot(&[db::RecoverResponse {
            pending_tasks: vec![task("pure619")],
            ..Default::default()
        }])
        .unwrap();
    assert!(
        !tasks
            .inner
            .active
            .load(std::sync::atomic::Ordering::Acquire)
    );
    assert!(tasks.inner.receiver.lock().unwrap().is_some());
    drop(snapshot);
    drop(prepared);
    assert!(DispatchOwner::claim(tasks.clone()).is_ok());
    drop(recovery);
    drop(tasks);
    assert!(weak.upgrade().is_none());
}
#[tokio::test]
async fn late_invalid_task_and_checkpoint_fail_before_any_activation() {
    let tasks = owner("invalid619");
    let recovery = MultiOwnerTaskRecovery::new([tasks.clone()], request()).unwrap();
    let prepared = recovery
        .prepare_shared_startup(RecoveryCancellation::new())
        .unwrap();
    let good = db::RecoverResponse {
        pending_tasks: vec![task("invalid619")],
        ..Default::default()
    };
    let bad = db::RecoverResponse {
        pending_tasks: vec![task("foreign")],
        ..Default::default()
    };
    assert!(prepared.validate_snapshot(&[good, bad]).is_err());
    let checkpoint = db::RecoverResponse {
        participant_transactions: vec![db::Transaction {
            state_type: Account::STATE_TYPE.into(),
            state_ref: "invalid619".into(),
            uncommitted_idempotent_mutations: vec![db::IdempotentMutation::default()],
            ..Default::default()
        }],
        ..Default::default()
    };
    assert!(prepared.validate_snapshot(&[checkpoint]).is_err());
    assert!(
        !tasks
            .inner
            .active
            .load(std::sync::atomic::Ordering::Acquire)
    );
}
#[tokio::test]
async fn prepared_activation_rejects_replacement_allocation_and_cancelled_host() {
    let original = owner("identity619");
    let recovery = MultiOwnerTaskRecovery::new([original.clone()], request()).unwrap();
    let cancel = RecoveryCancellation::new();
    let prepared = recovery.prepare_shared_startup(cancel.clone()).unwrap();
    let replacement = owner("identity619");
    let snapshot = CommittedTaskScan::new([replacement], &request())
        .unwrap()
        .finish(Ok(()))
        .unwrap();
    let mut supervisor = JoinSet::new();
    assert!(prepared.activate(&mut supervisor, snapshot).is_err());
    assert!(supervisor.is_empty());
    let snapshot = prepared.validate_snapshot(&[]).unwrap();
    cancel.cancel();
    assert!(prepared.activate(&mut supervisor, snapshot).is_err());
    assert!(supervisor.is_empty());
    assert!(
        !original
            .inner
            .active
            .load(std::sync::atomic::Ordering::Acquire)
    );
}
