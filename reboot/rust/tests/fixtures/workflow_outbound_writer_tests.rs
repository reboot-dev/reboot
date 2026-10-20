// Included beside the existing private workflow Fixture; fake transport tests
// below are not native or public generated ingress evidence.
fn outbound_target(actor: &str) -> WorkflowWriterTarget {
    WorkflowWriterTarget::new(
        crate::actor_ref::ActorRef::from_id(D::STATE_TYPE, actor).unwrap(),
        crate::CallerId::new("a0000000001", None).unwrap(),
        Some("service-token".into()),
    )
    .unwrap()
}
fn outbound_method() -> WorkflowWriterMethod {
    WorkflowWriterMethod {
        state_type: D::STATE_TYPE,
        method: "tests.Target.Apply",
        response_type: "type.googleapis.com/tests.reboot.protoc.Counter",
        errors: vec![],
    }
}
#[tokio::test]
async fn outbound_writer_intent_ack_replay_metadata_and_changed_payload_destination_reject() {
    let (f, database, server) = fake().await;
    let target = outbound_target("target");
    let calls = AtomicUsize::new(0);
    let keys = std::sync::Mutex::new(Vec::new());
    for pass in 0..3 {
        let attempt = WorkflowAttempt::default();
        let ctx = f.context(&attempt);
        let result = ctx.invoke_writer(&target, "apply", outbound_method(), crate::proto::Counter { value: 7 }, |request| async {
            let headers = crate::RebootHeaders::from_request(&request).unwrap();
            assert_eq!(request.metadata().get("x-reboot-application-id").unwrap(), "a0000000001");
            assert_eq!(headers.application_id, None, "untrusted wire app identity must not become server authority");
            assert_eq!(headers.caller_id.unwrap().application_id(), "a0000000001");
            assert_eq!(headers.bearer_token.as_deref(), Some("service-token"));
            assert_eq!(headers.workflow_id.unwrap().as_bytes().as_slice(), f.task.task_id.as_ref().unwrap().task_uuid);
            assert_eq!(headers.state_ref, target.actor.state_ref().as_str());
            assert!(!headers.internal_call && headers.transaction_ids.is_none());
            keys.lock().unwrap().push(headers.idempotency_key.unwrap());
            assert!(database.store_requests().len() >= 2, "Started intent ACK precedes dispatch");
            let response = f.tasks.inner.store.writer_async_for_method_authorized::<D, crate::proto::Counter, crate::proto::Counter, _>("tests.Target.Apply", &crate::auth::AuthorizationPolicy::permissive_for_development(), request, |state, q| { calls.fetch_add(1, Ordering::SeqCst); Box::pin(async move { state.value += q.value; Ok(*state) }) }).await?;
            // Simulate transport loss after actual target Store ACK, before source
            // result save. Next attempt must redispatch its original key.
            if pass == 0 { return Err(Status::unavailable("lost target response")); }
            Ok(response)
        }).await;
        if pass == 0 {
            assert_eq!(result.unwrap_err().code(), tonic::Code::Unavailable);
            assert!(!attempt.clean());
        } else {
            assert_eq!(result.unwrap().value, 7);
            assert!(attempt.clean());
        }
    }
    assert_eq!(calls.load(Ordering::SeqCst), 1);
    assert!(keys.lock().unwrap().windows(2).all(|w| w[0] == w[1]));
    for changed in [false, true] {
        let attempt = WorkflowAttempt::default();
        let changed_target = outbound_target(if changed { "other" } else { "target" });
        let error = f
            .context(&attempt)
            .invoke_writer(
                &changed_target,
                "apply",
                outbound_method(),
                crate::proto::Counter {
                    value: if changed { 7 } else { 8 },
                },
                |_| async { panic!("changed intent reached target") },
            )
            .await;
        let error: Result<crate::proto::Counter, Status> = error;
        assert_eq!(error.unwrap_err().code(), tonic::Code::FailedPrecondition);
    }
    // Current authorization must run even after source Stored checkpoint.
    let attempt = WorkflowAttempt::default();
    let result: Result<crate::proto::Counter, Status> = f.context(&attempt).invoke_writer(&target, "apply", outbound_method(), crate::proto::Counter { value: 7 }, |request| async {
        f.tasks.inner.store.writer_async_for_method_authorized::<D, crate::proto::Counter, crate::proto::Counter, _>("tests.Target.Apply", &crate::auth::AuthorizationPolicy::default(), request, |_, _| Box::pin(async { panic!("denied replay mutated") })).await
    }).await;
    assert_eq!(result.unwrap_err().code(), tonic::Code::PermissionDenied);
    assert!(!attempt.clean());
    assert_eq!(calls.load(Ordering::SeqCst), 1);
    server.abort();
}
#[tokio::test]
async fn outbound_writer_cancel_and_lost_intent_ack_fail_closed() {
    for during_store in [false, true] {
        let (f, database, server) = fake().await;
        let target = outbound_target("target");
        let attempt = WorkflowAttempt::default();
        let context = f.context(&attempt);
        let parked = if during_store {
            Some(database.park_store())
        } else {
            None
        };
        let (entered_tx, entered_rx) = tokio::sync::oneshot::channel();
        let mut call = Box::pin(context.invoke_writer(
            &target,
            "apply",
            outbound_method(),
            crate::proto::Counter { value: 7 },
            |_| async move {
                entered_tx.send(()).unwrap();
                std::future::pending::<Result<tonic::Response<crate::proto::Counter>, Status>>()
                    .await
            },
        ));
        if let Some((entered, release)) = parked {
            tokio::select! { result = &mut call => panic!("unexpected {result:?}"), result = entered => result.unwrap() }
            drop(call);
            assert!(*f.tasks.inner.uncertain.borrow());
            assert_eq!(
                f.cancel.public_ready().await.unwrap_err().code(),
                tonic::Code::Unavailable
            );
            let _ = release.send(());
        } else {
            tokio::select! { result = &mut call => panic!("unexpected {result:?}"), result = entered_rx => result.unwrap() }
            f.cancel.cancel();
            assert_eq!(call.await.unwrap_err().code(), tonic::Code::Cancelled);
        }
        assert!(!attempt.clean());
        server.abort();
    }
}
