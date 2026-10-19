// Included in idempotency_key_scope_tests; these compare observable identities,
// not an expected value computed through checkpoint_key.
#[tokio::test]
async fn workflow_keys_deduplicate_across_scopes_and_restart() {
    let (tasks, task, cancel, attempt) = make_scope_context(0, 1, Vec::new());
    let root = build_context(&tasks, task.clone(), &cancel, &attempt, None, Vec::new());
    let expected = root.make_idempotency_key("charge", true).unwrap();
    // A recording external endpoint deduplicates on the supplied UUID.
    let mut external = std::collections::HashSet::new();
    external.insert(expected);
    let mut iteration_keys = std::collections::HashSet::new();
    for (name, bound) in [("finite", 10), ("unbounded", u64::MAX)] {
        for index in [0, 1, 7] {
            let restarted_attempt = WorkflowAttempt::default();
            let mut resumed_task = task.clone();
            resumed_task.iteration = index;
            let context = build_context(
                &tasks, resumed_task, &cancel, &restarted_attempt,
                Some((name.into(), index, bound)), vec![("parent".into(), index, 10)],
            );
            let key = context.make_idempotency_key("charge", true).unwrap();
            assert_eq!(key, expected);
            assert!(!external.insert(key), "external charge dispatched twice");
            iteration_keys.insert(context.make_idempotency_key("charge", false).unwrap());
        }
    }
    assert_eq!(external.len(), 1);
    assert_eq!(iteration_keys.len(), 6);
}

#[tokio::test]
async fn effective_seed_maps_ignore_order_and_noop_overrides() {
    let (tasks, task, cancel, attempt) = make_scope_context(0, 1, Vec::new());
    let root = build_context(&tasks, task.clone(), &cancel, &attempt, None, Vec::new());
    let outer = root.with_seeds(&[("tenant", b"acme"), ("region", b"eu")]).unwrap();
    let original = outer.make_idempotency_key("charge", true).unwrap();
    let noop = outer.with_seeds(&[("tenant", b"acme")]).unwrap();
    assert_eq!(noop.make_idempotency_key("charge", true).unwrap(), original);
    let reversed = root.with_seeds(&[("region", b"eu"), ("tenant", b"acme")]).unwrap();
    assert_eq!(reversed.make_idempotency_key("charge", true).unwrap(), original);
    let changed = outer.with_seeds(&[("tenant", b"globex")]).unwrap();
    assert_ne!(changed.make_idempotency_key("charge", true).unwrap(), original);
    drop(changed);
    assert_eq!(outer.make_idempotency_key("charge", true).unwrap(), original);
    let restarted_attempt = WorkflowAttempt::default();
    let restarted = build_context(&tasks, task, &cancel, &restarted_attempt, None, Vec::new())
        .with_seeds(&[("region", b"eu"), ("tenant", b"acme")]).unwrap();
    assert_eq!(restarted.make_idempotency_key("charge", true).unwrap(), original);
    let seed = root.task_id().unwrap();
    assert_eq!(outer.checkpoint_key(seed, "effect", None), restarted.checkpoint_key(seed, "effect", None));
}

#[tokio::test]
async fn invalid_task_identity_fails_closed_without_random_keys_or_panics() {
    let (tasks, task, cancel, attempt) = make_scope_context(0, 1, Vec::new());
    for invalid in ["", "raw-id", "bad/parts", "cursor.v1.A:proof"] {
        let mut bad = task.clone();
        bad.task_id.as_mut().unwrap().state_ref = invalid.into();
        let context = build_context(&tasks, bad, &cancel, &attempt, None, Vec::new());
        assert_eq!(context.state_ref().unwrap_err().code(), tonic::Code::FailedPrecondition);
        assert!(context.actor_ref().is_err());
    }
    let mut missing = task.clone();
    missing.task_id = None;
    let context = build_context(&tasks, missing, &cancel, &attempt, None, Vec::new());
    assert!(context.state_ref().is_err());
    assert!(context.make_idempotency_key("charge", true).is_err());
    let mut bad_uuid = task;
    bad_uuid.task_id.as_mut().unwrap().task_uuid.clear();
    let context = build_context(&tasks, bad_uuid, &cancel, &attempt, None, Vec::new());
    assert!(context.make_idempotency_key("charge", false).is_err());
}

#[tokio::test]
async fn already_cancelled_wait_never_polls_ready_callback() {
    let (tasks, task, cancel, attempt) = make_scope_context(0, 1, Vec::new());
    let context = build_context(&tasks, task, &cancel, &attempt, None, Vec::new());
    cancel.cancel();
    for _ in 0..128 {
        let result = context.wait(async { panic!("cancelled callback was polled") }).await;
        assert_eq!(result.unwrap_err().code(), tonic::Code::Cancelled);
    }
}
