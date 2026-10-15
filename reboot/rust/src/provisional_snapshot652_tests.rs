use super::*;
use crate::runtime::DurableStateDeclaration;
struct Account;
impl DurableStateDeclaration for Account {
    type State = crate::proto::Counter;
    const STATE_TYPE: &'static str = "test.Provisional652";
}
struct Binding;
#[tonic::async_trait]
impl ReaderTaskBinding for Binding {
    fn validate(&self, task: &db::Task) -> Result<(), Status> {
        if task.method != "Read" {
            return Err(Status::invalid_argument("unknown method"));
        }
        Ok(())
    }
    async fn execute(&self, _: &db::Task) -> Result<prost_types::Any, Status> {
        panic!("pure validation dispatched")
    }
}
fn fixture() -> (OneShotTasks, MultiOwnerTaskRecovery) {
    let tasks = OneShotTasks::new_with_declarations(
        DatabaseActorStore::connect_lazy("http://127.0.0.1:1").unwrap(),
        Account::STATE_TYPE.into(),
        "owner652".into(),
        Binding,
        vec![TaskMethodDeclaration::new::<
            Account,
            crate::proto::Counter,
            crate::proto::Counter,
        >(
            "test.Methods.Read",
            "type.googleapis.com/test.Response",
            vec![],
        )],
    )
    .unwrap();
    tasks.set_max_live_deliveries(4).unwrap();
    let recovery = MultiOwnerTaskRecovery::new(
        [tasks.clone()],
        db::RecoverRequest {
            shard_ids: vec!["shared".into()],
            skip_idempotent_mutations: true,
            state_tags_by_state_type: [(Account::STATE_TYPE.into(), Default::default())].into(),
        },
    )
    .unwrap();
    (tasks, recovery)
}
fn task() -> db::Task {
    db::Task {
        task_id: Some(db::TaskId {
            state_type: Account::STATE_TYPE.into(),
            state_ref: "owner652".into(),
            task_uuid: uuid::Uuid::new_v4().as_bytes().to_vec(),
        }),
        method: "Read".into(),
        status: db::task::Status::Pending as i32,
        ..Default::default()
    }
}
fn page(tasks: Vec<db::Task>) -> db::RecoverResponse {
    db::RecoverResponse {
        participant_transactions: vec![db::Transaction {
            state_type: Account::STATE_TYPE.into(),
            state_ref: "owner652".into(),
            uncommitted_tasks: tasks,
            ..Default::default()
        }],
        ..Default::default()
    }
}
#[tokio::test]
async fn valid_provisional_tasks_never_become_committed_or_activate() {
    let (owner, recovery) = fixture();
    let prepared = recovery
        .prepare_shared_startup(RecoveryCancellation::new())
        .unwrap();
    let result = prepared.validate_snapshot(&[page(vec![task()])]).unwrap();
    assert!(result.pending.is_empty());
    assert!(
        !owner
            .inner
            .active
            .load(std::sync::atomic::Ordering::Acquire)
    );
    assert!(owner.inner.receiver.lock().unwrap().is_some());
    assert!(DispatchOwner::claim(owner.clone()).is_err());
    drop(prepared);
    assert!(DispatchOwner::claim(owner).is_ok());
}
#[tokio::test]
async fn duplicate_across_transactions_or_committed_snapshot_is_rejected() {
    let (_, recovery) = fixture();
    let prepared = recovery
        .prepare_shared_startup(RecoveryCancellation::new())
        .unwrap();
    let t = task();
    assert!(
        prepared
            .validate_snapshot(&[page(vec![t.clone()]), page(vec![t.clone()])])
            .is_err()
    );
    let committed = db::RecoverResponse {
        pending_tasks: vec![t.clone()],
        ..Default::default()
    };
    assert!(
        prepared
            .validate_snapshot(&[committed, page(vec![t])])
            .is_err()
    );
}
#[tokio::test]
async fn aggregate_bound_applies_across_pages() {
    let (_, recovery) = fixture();
    let prepared = recovery
        .prepare_shared_startup(RecoveryCancellation::new())
        .unwrap();
    let pages: Vec<_> = (0..=MAX_TASKS).map(|_| page(vec![task()])).collect();
    let error = prepared.validate_snapshot(&pages).err().unwrap();
    assert_eq!(error.code(), tonic::Code::ResourceExhausted);
}
#[tokio::test]
async fn canonical_failure_precedes_checkpoint_hold_and_all_mutations_stay_closed() {
    let (_, recovery) = fixture();
    let prepared = recovery
        .prepare_shared_startup(RecoveryCancellation::new())
        .unwrap();
    let mut checkpoint = page(vec![]);
    checkpoint.participant_transactions[0]
        .uncommitted_idempotent_mutations
        .push(db::IdempotentMutation::default());
    let mut bad = task();
    bad.task_id = None;
    let canonical = db::RecoverResponse {
        pending_tasks: vec![bad],
        ..Default::default()
    };
    assert_eq!(
        prepared
            .validate_snapshot(&[checkpoint.clone(), canonical])
            .err()
            .unwrap()
            .code(),
        tonic::Code::InvalidArgument
    );
    let error = prepared.validate_snapshot(&[checkpoint]).err().unwrap();
    assert_eq!(error.code(), tonic::Code::FailedPrecondition);
    assert!(error.message().starts_with("HOLD:"));
}
#[tokio::test]
async fn original_validator_rejects_wrong_actor_iteration_and_terminal() {
    let (_, recovery) = fixture();
    let prepared = recovery
        .prepare_shared_startup(RecoveryCancellation::new())
        .unwrap();
    for kind in 0..3 {
        let mut t = task();
        match kind {
            0 => t.task_id.as_mut().unwrap().state_ref = "foreign".into(),
            1 => t.iteration = 1,
            _ => t.status = db::task::Status::Completed as i32,
        }
        assert_eq!(
            prepared
                .validate_snapshot(&[page(vec![t])])
                .err()
                .unwrap()
                .code(),
            tonic::Code::InvalidArgument
        );
    }
}
