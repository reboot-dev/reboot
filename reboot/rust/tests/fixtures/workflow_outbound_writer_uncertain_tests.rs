#[tokio::test]
async fn outbound_writer_target_uncertain_store_and_cursor_deny() {
    let (f, database, server) = fake().await;
    let target = outbound_target("target");
    let target_gate = f
        .tasks
        .inner
        .store
        .actor_gate(D::STATE_TYPE, target.actor.state_ref().as_str());
    let attempt = WorkflowAttempt::default();
    let context = f.context(&attempt);
    let (parked_tx, parked_rx) = tokio::sync::oneshot::channel();
    let mut call = Box::pin(context.invoke_writer(&target, "apply", outbound_method(), crate::proto::Counter { value: 7 }, |request| async {
        parked_tx.send(database.park_store()).unwrap();
        f.tasks.inner.store.writer_async_for_method_authorized::<D, crate::proto::Counter, crate::proto::Counter, _>("tests.Target.Apply", &crate::auth::AuthorizationPolicy::permissive_for_development(), request, |state, q| Box::pin(async move { state.value += q.value; Ok(*state) })).await
    }));
    let (entered, release) = tokio::select! { result = &mut call => panic!("unexpected {result:?}"), result = parked_rx => result.unwrap() };
    tokio::select! { result = &mut call => panic!("unexpected {result:?}"), result = entered => result.unwrap() }
    drop(call);
    assert!(!attempt.clean());
    assert!(
        target_gate.committed_revisions().borrow().1,
        "target Store cancellation must retain commit uncertainty"
    );
    let _ = release.send(());
    server.abort();

    // Unbounded target receipt retention/GC is not implemented. Do not let a
    // canonical cursor silently claim it. This denial precedes any dispatch.
    let (f, _, server) = fake().await;
    let attempt = WorkflowAttempt::default();
    let mut context = f.context(&attempt);
    context.iteration = Some(("main".into(), 0, u64::MAX));
    let result: Result<crate::proto::Counter, Status> = context
        .invoke_writer(
            &target,
            "apply",
            outbound_method(),
            crate::proto::Counter { value: 7 },
            |_| async { panic!("cursor reached target") },
        )
        .await;
    assert_eq!(result.unwrap_err().code(), tonic::Code::FailedPrecondition);
    assert!(!attempt.clean());
    server.abort();
}
