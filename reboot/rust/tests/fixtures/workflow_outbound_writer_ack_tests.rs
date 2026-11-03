// Exact new outbound path, not just the underlying generic checkpoint helper.
#[tokio::test]
async fn outbound_writer_cannot_return_before_source_stored_ack() {
    let (f, database, server) = fake().await;
    let attempt = WorkflowAttempt::default();
    let context = f.context(&attempt);
    let target = outbound_target("target");
    let (parked_tx, parked_rx) = tokio::sync::oneshot::channel();
    let mut operation = Box::pin(context.invoke_writer(
        &target, "apply", outbound_method(), crate::proto::Counter { value: 7 },
        |_| async {
            // Source Started has already ACKed; arm only the source Stored
            // control Store. No fake target effect is claimed by this test.
            parked_tx.send(database.park_store()).unwrap();
            Ok(tonic::Response::new(crate::proto::Counter { value: 7 }))
        },
    ));
    let (entered, release) = tokio::select! {
        result = &mut operation => panic!("returned before Stored ACK: {result:?}"),
        parked = parked_rx => parked.unwrap(),
    };
    tokio::select! {
        result = &mut operation => panic!("returned before Stored ACK: {result:?}"),
        entered = entered => entered.unwrap(),
    }
    // Destroy the exact future while its real source Store ACK is outstanding.
    drop(operation);
    assert!(!attempt.clean());
    assert!(*f.tasks.inner.uncertain.borrow());
    assert_eq!(f.cancel.public_ready().await.unwrap_err().code(), tonic::Code::Unavailable);
    let _ = release.send(());
    server.abort();
}
