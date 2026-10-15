//! Same-channel transport model; native/executable acceptance remains separate.
use super::*;
use std::time::Duration;
const BOUND: Duration = Duration::from_secs(5);

fn supported() -> db::DatabaseCapabilitiesResponse {
    db::DatabaseCapabilitiesResponse {
        atomic_constructor_tasks_protocol: "reboot.atomic-constructor-tasks.v1".into(),
        atomic_constructor_tasks_version: 1,
        atomic_constructor_tasks_enabled: true,
    }
}
async fn bounded<T>(future: impl std::future::Future<Output = T>) -> T {
    tokio::time::timeout(BOUND, future).await.expect("capability test deadline")
}
async fn unsealed(f: &Fixture, before: usize) {
    let status = f.tasks.constructor_uncertainty_status();
    assert!(!status.actor_sealed && !status.actor_retained);
    assert_eq!(status.process_reserved, before);
    assert!(!*f.tasks.inner.uncertain.borrow());
    assert_eq!(f.database.constructor_write_calls(), (0, 0));
    assert!(f.database.create_requests().is_empty());
    assert!(f.database.store_requests().is_empty());
    assert!(matches!(
        f.tasks.inner.receiver.lock().unwrap().as_mut().unwrap().try_recv(),
        Err(tokio::sync::mpsc::error::TryRecvError::Empty)
    ), "preflight must not send any dispatch notification");
    let gate = f.store.actor_gate(Account::STATE_TYPE, &f.reference);
    drop(bounded(gate.exclusive()).await);
}

// Exact fresh-process execution keeps the process-global observational gauge
// deterministic without adding any reset API or weakening production ownership.
#[tokio::test]
#[ignore = "run exact test in fresh process; observes process-wide retained64 budget"]
async fn incompatible_preflight_over64_owners_transport_malformed_cancel_and_generation() {
    let sentinel = Fixture::new().await;
    let before = sentinel.tasks.constructor_uncertainty_status().process_reserved;
    for _ in 0..70 {
        let f = Fixture::new().await;
        f.database.set_capabilities(Err(Status::unimplemented("old engine has no GetCapabilities")));
        let error = bounded(f.call(uuid::Uuid::new_v4(), 7, f.task())).await.unwrap_err();
        assert_eq!(error.code(), tonic::Code::FailedPrecondition);
        assert!(error.message().contains("GetCapabilities"));
        unsealed(&f, before).await;
        f.shutdown_owner();
    }
    let mut wrong_protocol = supported();
    wrong_protocol.atomic_constructor_tasks_protocol = "reboot.atomic-constructor-tasks.v2".into();
    let mut wrong_version = supported();
    wrong_version.atomic_constructor_tasks_version = 2;
    let mut disabled = supported();
    disabled.atomic_constructor_tasks_enabled = false;
    for reply in [db::DatabaseCapabilitiesResponse::default(), wrong_protocol, wrong_version, disabled] {
        let f = Fixture::new().await;
        f.database.set_capabilities(Ok(reply));
        assert_eq!(bounded(f.call(uuid::Uuid::new_v4(), 7, f.task())).await.unwrap_err().code(), tonic::Code::FailedPrecondition);
        unsealed(&f, before).await;
        // Same actor is immediately reusable after a compatible engine appears.
        f.database.set_capabilities(Ok(supported()));
        bounded(f.call(uuid::Uuid::new_v4(), 7, f.task())).await.unwrap();
        assert_eq!(f.database.constructor_write_calls(), (1, 0));
        f.shutdown_owner();
    }
    for status in [Status::unavailable("transport down"), Status::deadline_exceeded("transport deadline"), Status::data_loss("malformed protobuf response")] {
        let f = Fixture::new().await;
        f.database.set_capabilities(Err(status.clone()));
        let error = bounded(f.call(uuid::Uuid::new_v4(), 7, f.task())).await.unwrap_err();
        assert_eq!(error.code(), status.code());
        assert_eq!(error.message(), status.message());
        unsealed(&f, before).await;
        f.shutdown_owner();
    }
    for shutdown in [false, true] {
        let f = Fixture::new().await;
        let (entered, release) = f.database.park_capabilities();
        let mut call = Box::pin(f.call(uuid::Uuid::new_v4(), 7, f.task()));
        bounded(async {
            tokio::select! {
                result = &mut call => panic!("preflight did not park: {result:?}"),
                result = entered => result.unwrap(),
            }
        }).await;
        let status = f.tasks.constructor_uncertainty_status();
        assert!(!status.actor_sealed && !status.actor_retained);
        assert_eq!(status.process_reserved, before);
        if shutdown {
            f.shutdown_owner();
            release.send(()).unwrap();
            assert!(bounded(&mut call).await.is_err(), "must not adopt a replacement generation");
        }
        drop(call); // cancellation before write must release the ordinary lease
        unsealed(&f, before).await;
        f.shutdown_owner();
    }
    // Taskless construction must not negotiate capabilities on old engines.
    let taskless = Fixture::new().await;
    taskless.database.set_capabilities(Err(Status::unimplemented("old engine")));
    let mut request = tonic::Request::new(Counter { value: 9 });
    let mut headers = crate::RebootHeaders::new(&taskless.reference);
    headers.idempotency_key = Some(uuid::Uuid::new_v4());
    *request.metadata_mut() = headers.to_metadata().unwrap();
    bounded(taskless.store.scheduling_constructor_async_for_method_authorized::<Account, _, _, _>(
        (OPEN, ID),
        &crate::auth::AuthorizationPolicy::permissive_for_development(),
        Some(&taskless.tasks),
        request,
        |state, request, _| Box::pin(async move {
            state.value = request.value;
            Ok(WriterExecution::new(db::TaskId::default()))
        }),
    )).await.unwrap();
    assert_eq!(taskless.database.constructor_write_calls(), (1, 0));
    assert!(taskless.database.create_requests()[0].task_upserts.is_empty());
    taskless.shutdown_owner();
    // Incompatible owners did not starve unrelated healthy construction/replay.
    let key = uuid::Uuid::new_v4();
    let id = bounded(sentinel.call(key, 7, sentinel.task())).await.unwrap();
    sentinel.database.set_capabilities(Err(Status::unimplemented("engine replaced after commit")));
    assert_eq!(bounded(sentinel.call(key, 7, sentinel.task())).await.unwrap(), id);
    assert_eq!(sentinel.database.constructor_write_calls(), (1, 0));
    assert_eq!(sentinel.tasks.constructor_uncertainty_status().process_reserved, before);
    sentinel.shutdown_owner();
}
