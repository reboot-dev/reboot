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
fn fixture() -> (OneShotTasks, MultiOwnerTaskRecovery, String) {
    let owner_ref = format!("owner652-{}", uuid::Uuid::new_v4());
    let tasks = OneShotTasks::new_with_declarations(
        DatabaseActorStore::connect_lazy("http://127.0.0.1:1").unwrap(),
        Account::STATE_TYPE.into(),
        owner_ref.clone(),
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
            shard_ids: vec![owner_ref.clone()],
            skip_idempotent_mutations: true,
            state_tags_by_state_type: [(Account::STATE_TYPE.into(), Default::default())].into(),
        },
    )
    .unwrap();
    (tasks, recovery, owner_ref)
}
fn task(owner_ref: &str) -> db::Task {
    db::Task {
        task_id: Some(db::TaskId {
            state_type: Account::STATE_TYPE.into(),
            state_ref: owner_ref.into(),
            task_uuid: uuid::Uuid::new_v4().as_bytes().to_vec(),
        }),
        method: "Read".into(),
        status: db::task::Status::Pending as i32,
        ..Default::default()
    }
}
fn page(tasks: Vec<db::Task>, owner_ref: &str) -> db::RecoverResponse {
    db::RecoverResponse {
        participant_transactions: vec![db::Transaction {
            state_type: Account::STATE_TYPE.into(),
            state_ref: owner_ref.into(),
            uncommitted_tasks: tasks,
            ..Default::default()
        }],
        ..Default::default()
    }
}
#[tokio::test]
async fn valid_provisional_tasks_never_become_committed_or_activate() {
    let (owner, recovery, owner_ref) = fixture();
    let prepared = recovery
        .prepare_shared_startup(RecoveryCancellation::new())
        .unwrap();
    let result = prepared
        .validate_snapshot(&[page(vec![task(&owner_ref)], &owner_ref)])
        .unwrap();
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
    let (_, recovery, owner_ref) = fixture();
    let prepared = recovery
        .prepare_shared_startup(RecoveryCancellation::new())
        .unwrap();
    let t = task(&owner_ref);
    assert!(
        prepared
            .validate_snapshot(&[
                page(vec![t.clone()], &owner_ref),
                page(vec![t.clone()], &owner_ref),
            ])
            .is_err()
    );
    let committed = db::RecoverResponse {
        pending_tasks: vec![t.clone()],
        ..Default::default()
    };
    assert!(
        prepared
            .validate_snapshot(&[committed, page(vec![t], &owner_ref)])
            .is_err()
    );
}
#[tokio::test]
async fn aggregate_bound_applies_across_pages() {
    let (_, recovery, owner_ref) = fixture();
    let prepared = recovery
        .prepare_shared_startup(RecoveryCancellation::new())
        .unwrap();
    let pages: Vec<_> = (0..=MAX_TASKS)
        .map(|_| page(vec![task(&owner_ref)], &owner_ref))
        .collect();
    let error = prepared.validate_snapshot(&pages).err().unwrap();
    assert_eq!(error.code(), tonic::Code::ResourceExhausted);
}
#[tokio::test]
async fn canonical_failure_precedes_checkpoint_hold_and_all_mutations_stay_closed() {
    let (_, recovery, owner_ref) = fixture();
    let prepared = recovery
        .prepare_shared_startup(RecoveryCancellation::new())
        .unwrap();
    let mut checkpoint = page(vec![], &owner_ref);
    checkpoint.participant_transactions[0]
        .uncommitted_idempotent_mutations
        .push(db::IdempotentMutation::default());
    let mut bad = task(&owner_ref);
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
    let (_, recovery, owner_ref) = fixture();
    let prepared = recovery
        .prepare_shared_startup(RecoveryCancellation::new())
        .unwrap();
    for kind in 0..3 {
        let mut t = task(&owner_ref);
        match kind {
            0 => t.task_id.as_mut().unwrap().state_ref = "foreign".into(),
            1 => t.iteration = 1,
            _ => t.status = db::task::Status::Completed as i32,
        }
        assert_eq!(
            prepared
                .validate_snapshot(&[page(vec![t], &owner_ref)])
                .err()
                .unwrap()
                .code(),
            tonic::Code::InvalidArgument
        );
    }
}
