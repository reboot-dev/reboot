//! Source-level preparation tests; no native, host lifecycle or WelcomeEmail
//! execution proof. The writer binding models the generated writer association.
use super::*;
use tonic::Code;

struct WriterBinding;
#[tonic::async_trait]
impl ReaderTaskBinding for WriterBinding {
    fn validate(&self, task: &db::Task) -> Result<(), Status> {
        if task.method != "WelcomeEmail" || task.request != b"typed-request" {
            return Err(Status::invalid_argument("writer method/payload"));
        }
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
        Some("type.googleapis.com/test.WelcomeEmailResponse")
    }
    async fn execute(&self, _: &db::Task) -> Result<prost_types::Any, Status> {
        panic!("preparation must never invoke a reader handler")
    }
}
fn owner(reference: &str) -> OneShotTasks {
    OneShotTasks::new(
        DatabaseActorStore::connect_lazy("http://127.0.0.1:1").unwrap(),
        "test.Account".into(),
        reference.into(),
        WriterBinding,
    )
    .unwrap()
}
fn request() -> db::RecoverRequest {
    db::RecoverRequest {
        shard_ids: vec!["shared-shard".into()],
        state_tags_by_state_type: [("test.Account".into(), Default::default())].into(),
        ..Default::default()
    }
}
fn task(reference: &str, number: u128) -> db::Task {
    let mut bytes = number.to_be_bytes();
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    db::Task {
        task_id: Some(db::TaskId {
            state_type: "test.Account".into(),
            state_ref: reference.into(),
            task_uuid: bytes.to_vec(),
        }),
        method: "WelcomeEmail".into(),
        request: b"typed-request".to_vec(),
        status: db::task::Status::Pending as i32,
        ..Default::default()
    }
}
fn batch(tasks: Vec<db::Task>) -> db::RecoverResponse {
    db::RecoverResponse {
        pending_tasks: tasks,
        ..Default::default()
    }
}
fn code<T>(result: Result<T, Status>) -> Code {
    match result {
        Err(error) => error.code(),
        Ok(_) => panic!("expected rejection"),
    }
}

#[tokio::test]
async fn singleton_empty_scope_passes_through_but_shared_scope_stays_strict() {
    let (endpoint, _, server) = crate::runtime::test_support::start_database().await;
    let a = OneShotTasks::new(
        DatabaseActorStore::connect_lazy(&endpoint).unwrap(),
        "test.Account".into(), "a".into(), WriterBinding,
    ).unwrap();
    let empty = db::RecoverRequest::default();
    // Exercise the production singleton entry through the canonical Recover RPC.
    assert!(a.pending(empty.clone()).await.unwrap().is_empty());
    assert_eq!(code(CommittedTaskPartitions::recover([a.clone()], empty.clone()).await), Code::InvalidArgument);
    assert!(empty.shard_ids.is_empty());
    assert!(empty.state_tags_by_state_type.is_empty());
    // Singleton scope is trusted, never the recovered task identity or binding.
    let mut bad_binding = task("a", 2);
    bad_binding.request.clear();
    for tasks in [vec![bad_binding, task("not-supplied", 3)], vec![task("not-supplied", 4)]] {
        let expected = a.validate_recovered(&tasks).unwrap_err();
        let mut scan = CommittedTaskScan::singleton(a.clone());
        scan.push(batch(tasks)).unwrap();
        let actual = match scan.finish(Ok(())) {
            Err(error) => error,
            Ok(_) => panic!("invalid singleton task accepted"),
        };
        assert_eq!(actual.code(), expected.code());
        assert_eq!(actual.message(), expected.message());
    }
    server.abort();
    let _ = server.await;
}

#[tokio::test]
async fn writer_partitions_retain_original_allocations_and_empty_supplied_owners() {
    let a = owner("a");
    let b = owner("b");
    let completed_only = owner("completed-only");
    let mut scan =
        CommittedTaskScan::new([a.clone(), b.clone(), completed_only.clone()], &request()).unwrap();
    // UUID uniqueness is scoped to exact actor, not a shard-global UUID set.
    scan.push(batch(vec![task("b", 1), task("a", 1)])).unwrap();
    let prepared = scan.finish(Ok(())).unwrap();
    prepared.validate_delivery_budgets().unwrap();
    let partitions = prepared.into_partitions().unwrap();
    assert_eq!(partitions.len(), 3);
    for (original, (actual, tasks)) in [a, b, completed_only].iter().zip(&partitions) {
        assert!(Arc::ptr_eq(&original.inner, &actual.inner));
        assert!(actual.inner.binding.writer_capable());
        assert_eq!(actual.contains_writer(tasks), !tasks.is_empty());
        assert!(
            !actual
                .inner
                .active
                .load(std::sync::atomic::Ordering::Acquire)
        );
        assert!(actual.inner.running_owner.lock().unwrap().is_none());
        assert!(actual.inner.recovery_owner.lock().unwrap().is_none());
        assert!(actual.inner.recovery_request.lock().unwrap().is_none());
        assert!(actual.inner.receiver.lock().unwrap().is_some());
        assert_eq!(
            code(actual.validate_staged(tasks).await),
            Code::FailedPrecondition
        );
    }
    assert!(
        partitions[2].1.is_empty(),
        "Recover cannot discover completed-only owners"
    );
}

#[tokio::test]
async fn late_invalid_partition_or_failed_eof_cannot_publish_a_valid_prefix() {
    let a = owner("a");
    let mut scan = CommittedTaskScan::new([a.clone()], &request()).unwrap();
    scan.push(batch(vec![task("a", 1)])).unwrap();
    scan.push(batch(vec![task("not-supplied", 2)])).unwrap();
    assert_eq!(code(scan.finish(Ok(()))), Code::InvalidArgument);
    let mut scan = CommittedTaskScan::new([a.clone()], &request()).unwrap();
    scan.push(batch(vec![task("a", 1)])).unwrap();
    assert_eq!(
        code(scan.finish(Err(Status::unavailable("late stream failure")))),
        Code::Unavailable
    );
    assert!(!a.inner.active.load(std::sync::atomic::Ordering::Acquire));
}

#[tokio::test]
async fn shared_validation_matches_singleton_on_adversarial_task_shapes() {
    let a = owner("a");
    let good = task("a", 1);
    let mut malformed = Vec::new();
    let mut t = good.clone();
    t.task_id = None;
    malformed.push(t);
    let mut t = good.clone();
    t.task_id.as_mut().unwrap().state_type = "other.Type".into();
    malformed.push(t);
    let mut t = good.clone();
    t.task_id.as_mut().unwrap().task_uuid = vec![7; 16];
    malformed.push(t);
    let mut t = good.clone();
    t.status = db::task::Status::Completed as i32;
    malformed.push(t);
    let mut t = good.clone();
    t.response_or_error = Some(db::task::ResponseOrError::Response(Default::default()));
    malformed.push(t);
    let mut t = good.clone();
    t.iteration = 1;
    malformed.push(t);
    let mut t = good.clone();
    t.timestamp = Some(prost_types::Timestamp {
        seconds: 0,
        nanos: -1,
    });
    malformed.push(t);
    let mut t = good.clone();
    t.method = "Unknown".into();
    malformed.push(t);
    let mut t = good.clone();
    t.request.clear();
    malformed.push(t);
    for t in malformed {
        let expected = code(a.validate_recovered(std::slice::from_ref(&t)));
        let mut scan = CommittedTaskScan::new([a.clone()], &request()).unwrap();
        scan.push(batch(vec![t])).unwrap();
        assert_eq!(code(scan.finish(Ok(()))), expected);
    }
    let mut scan = CommittedTaskScan::new([a], &request()).unwrap();
    scan.push(batch(vec![good.clone()])).unwrap();
    scan.push(batch(vec![good])).unwrap();
    assert_eq!(code(scan.finish(Ok(()))), Code::InvalidArgument);
}

#[tokio::test]
async fn provisional_tasks_are_never_committed_and_unrelated_transactions_are_not_a_veto() {
    let a = owner("a");
    for prepared in [false, true] {
        let mut scan = CommittedTaskScan::new([a.clone()], &request()).unwrap();
        scan.push(db::RecoverResponse {
            participant_transactions: vec![db::Transaction {
                state_type: "unrelated.Type".into(),
                state_ref: "other".into(),
                prepared,
                uncommitted_tasks: vec![task("a", 9)],
                ..Default::default()
            }],
            transaction_coordinators: [("unrelated".into(), Default::default())].into(),
            pending_tasks: vec![task("a", 1)],
            ..Default::default()
        })
        .unwrap();
        assert_eq!(
            scan.finish(Ok(())).unwrap().into_pending(),
            vec![task("a", 1)]
        );
    }
}

#[tokio::test]
async fn task_and_delivery_capacity_are_distinct_and_bounded() {
    let a = owner("a");
    a.set_max_live_deliveries(1).unwrap();
    let mut scan = CommittedTaskScan::new([a.clone()], &request()).unwrap();
    scan.push(batch(vec![task("a", 1), task("a", 2)])).unwrap();
    let prepared = scan.finish(Ok(())).unwrap();
    assert_eq!(
        code(prepared.validate_delivery_budgets()),
        Code::ResourceExhausted
    );
    let mut scan = CommittedTaskScan::new([a], &request()).unwrap();
    scan.push(batch(
        (0..MAX_TASKS as u128).map(|n| task("a", n)).collect(),
    ))
    .unwrap();
    assert_eq!(
        code(scan.push(batch(vec![task("a", 9999)]))),
        Code::ResourceExhausted
    );
}

#[tokio::test]
async fn registration_requires_exact_existing_bounded_owners_and_request_scope() {
    let a = owner("a");
    assert_eq!(
        code(CommittedTaskScan::new([a.clone(), a.clone()], &request())),
        Code::AlreadyExists
    );
    assert_eq!(
        code(CommittedTaskScan::new([], &request())),
        Code::InvalidArgument
    );
    let mut no_shards = request();
    no_shards.shard_ids.clear();
    assert_eq!(
        code(CommittedTaskScan::new([a.clone()], &no_shards)),
        Code::InvalidArgument
    );
    let mut no_tags = request();
    no_tags.state_tags_by_state_type.clear();
    assert_eq!(
        code(CommittedTaskScan::new([a.clone()], &no_tags)),
        Code::InvalidArgument
    );
    let other = OneShotTasks::new(
        DatabaseActorStore::connect_lazy("http://127.0.0.1:2").unwrap(),
        "test.Account".into(),
        "b".into(),
        WriterBinding,
    )
    .unwrap();
    assert_eq!(
        code(CommittedTaskScan::new([a, other], &request())),
        Code::InvalidArgument
    );
    assert_eq!(
        code(CommittedTaskScan::new(
            (0..=MAX_TASKS).map(|n| owner(&n.to_string())),
            &request()
        )),
        Code::ResourceExhausted
    );
}

#[tokio::test]
async fn partitioning_preserves_canonical_order_and_existing_reader_writer_boundary() {
    let a = owner("a");
    let b = owner("b");
    assert_eq!(
        code(ReaderTaskRecoveryRegistry::new(
            [a.clone(), b.clone()],
            request()
        )),
        Code::FailedPrecondition
    );
    let mut scan = CommittedTaskScan::new([a, b], &request()).unwrap();
    let expected = vec![task("b", 1), task("a", 2), task("b", 3)];
    scan.push(batch(expected[..2].to_vec())).unwrap();
    scan.push(batch(expected[2..].to_vec())).unwrap();
    assert_eq!(scan.finish(Ok(())).unwrap().into_pending(), expected);
}

struct AccountDeclaration;
impl crate::runtime::DurableStateDeclaration for AccountDeclaration {
    type State = crate::proto::Counter;
    const STATE_TYPE: &'static str = "test.Account";
}
fn declaration() -> TaskMethodDeclaration {
    TaskMethodDeclaration::new::<AccountDeclaration, crate::proto::Counter, crate::proto::Counter>(
        "test.AccountMethods.WelcomeEmail",
        "type.googleapis.com/test.Response",
        vec![],
    )
}

#[tokio::test]
async fn generated_declaration_exclusions_remain_authoritative_for_writer_partitions() {
    for declaration in [
        declaration().constructor_scheduling(),
        declaration().workflow_reader_wait(),
    ] {
        let a = OneShotTasks::new_with_declarations(
            DatabaseActorStore::connect_lazy("http://127.0.0.1:1").unwrap(),
            "test.Account".into(),
            "a".into(),
            WriterBinding,
            vec![declaration],
        )
        .unwrap();
        let mut scan = CommittedTaskScan::new([a], &request()).unwrap();
        scan.push(batch(vec![task("a", 1)])).unwrap();
        assert_eq!(code(scan.finish(Ok(()))), Code::FailedPrecondition);
    }
}
