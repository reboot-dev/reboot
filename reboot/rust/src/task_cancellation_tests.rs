use super::*;
use crate::runtime::DurableStateDeclaration;
use db::tasks_server::Tasks;
fn request(task: &db::Task, token: bool) -> tonic::Request<db::CancelTaskRequest> {
    let mut request = tonic::Request::new(db::CancelTaskRequest {
        task_id: task.task_id.clone(),
    });
    request.metadata_mut().insert(
        "x-reboot-state-ref",
        task.task_id.as_ref().unwrap().state_ref.parse().unwrap(),
    );
    if token {
        request
            .metadata_mut()
            .insert("authorization", "Bearer test-admin".parse().unwrap());
    }
    request
}
#[tokio::test]
async fn cancellation_requires_policy_and_original_running_authority_before_database() {
    let (mut service, _owner, task) = task_listing_service_tests::setup(0);
    assert_eq!(
        service
            .cancel_task(request(&task, false))
            .await
            .unwrap_err()
            .code(),
        tonic::Code::Unauthenticated
    );
    service.admin = None;
    assert_eq!(
        service
            .cancel_task(request(&task, true))
            .await
            .unwrap_err()
            .code(),
        tonic::Code::PermissionDenied
    );
    for (action, expected) in [
        (1, tonic::Code::PermissionDenied),
        (2, tonic::Code::FailedPrecondition),
        (3, tonic::Code::Unavailable),
        (4, tonic::Code::Unavailable),
        (5, tonic::Code::FailedPrecondition),
    ] {
        let (service, _owner, task) = task_listing_service_tests::setup(action);
        assert_eq!(
            service
                .cancel_task(request(&task, true))
                .await
                .unwrap_err()
                .code(),
            expected,
            "action {action}"
        );
    }
}
#[tokio::test]
async fn cancellation_rejects_wrong_route_uuid_or_actor_without_database() {
    let (service, _owner, mut task) = task_listing_service_tests::setup(0);
    let mut wrong = request(&task, true);
    wrong
        .metadata_mut()
        .insert("x-reboot-state-ref", "other".parse().unwrap());
    assert_eq!(
        service.cancel_task(wrong).await.unwrap_err().code(),
        tonic::Code::InvalidArgument
    );
    task.task_id.as_mut().unwrap().task_uuid =
        uuid::Uuid::new_v5(&uuid::Uuid::NAMESPACE_OID, b"bad")
            .as_bytes()
            .to_vec();
    assert_eq!(
        service
            .cancel_task(request(&task, true))
            .await
            .unwrap_err()
            .code(),
        tonic::Code::InvalidArgument
    );
    task.task_id.as_mut().unwrap().task_uuid = uuid::Uuid::new_v4().as_bytes().to_vec();
    task.task_id.as_mut().unwrap().state_type = "other.Actor".into();
    assert_eq!(
        service
            .cancel_task(request(&task, true))
            .await
            .unwrap_err()
            .code(),
        tonic::Code::InvalidArgument
    );
}
#[test]
fn canonical_cancellation_is_distinct_from_business_or_bare_status_errors() {
    let db::task::ResponseOrError::Error(error) = cancelled_terminal("Run") else {
        unreachable!()
    };
    let status = task_cancellation_status(&error).unwrap().unwrap();
    assert_eq!(status.code(), tonic::Code::Cancelled);
    assert_eq!(status.details(), error.value);
    let mut rich = decode_task_error(&error).unwrap();
    for bad in [0, 2, 3, 10] {
        rich.code = bad;
        let bad = prost_types::Any {
            value: rich.encode_to_vec(),
            ..error.clone()
        };
        assert_eq!(
            task_cancellation_status(&bad).unwrap_err().code(),
            tonic::Code::DataLoss
        );
    }
    rich.code = tonic::Code::Cancelled as i32;
    rich.details[0].value = vec![0xff];
    assert!(
        task_cancellation_status(&prost_types::Any {
            value: rich.encode_to_vec(),
            ..error.clone()
        })
        .is_err()
    );
    rich.details[0].type_url = "type.googleapis.com/demo.BusinessError".into();
    assert!(
        task_cancellation_status(&prost_types::Any {
            value: rich.encode_to_vec(),
            ..error.clone()
        })
        .unwrap()
        .is_none()
    );
    rich.details.push(rich.details[0].clone());
    assert!(
        task_cancellation_status(&prost_types::Any {
            value: rich.encode_to_vec(),
            ..error
        })
        .is_err()
    );
}
struct D;
#[tokio::test]
async fn absent_execution_intent_is_linearized_before_cancellation_serial_wait() {
    use std::future::Future;
    let (service, _owner, task) = task_listing_service_tests::setup(0);
    let tasks = service.tasks.values().next().unwrap();
    let admission = tasks.local_execution_admission().unwrap();
    let serial = tasks.inner.cancellation_serial.lock().await;
    let id = task.task_id.as_ref().unwrap();
    assert!(!tasks.ordinary_interruption_pending(id));
    let mut cancellation = Box::pin(service.cancel_task(request(&task, true)));
    tokio::time::timeout(
        std::time::Duration::from_secs(5),
        std::future::poll_fn(|cx| {
            assert!(cancellation.as_mut().poll(cx).is_pending());
            if tasks.ordinary_interruption_pending(id) {
                std::task::Poll::Ready(())
            } else {
                std::task::Poll::Pending
            }
        }),
    )
    .await
    .unwrap();
    assert!(
        OrdinaryCancellationRegistration::new(tasks, &task, &admission)
            .unwrap()
            .is_none()
    );
    assert_eq!(
        tasks
            .inner
            .cancellation_writes
            .load(std::sync::atomic::Ordering::Acquire),
        1
    );
    // Dropping an absent-owner request still fences Wait and the next writer:
    // its intent may already have suppressed a canonical due delivery.
    drop(cancellation);
    drop(serial);
    assert!(*tasks.inner.uncertain.borrow());
    assert!(tasks.ordinary_interruption_pending(id));
    assert_eq!(
        tasks
            .inner
            .cancellation_writes
            .load(std::sync::atomic::Ordering::Acquire),
        0
    );
    assert!(admission.check_execution().is_err());
    assert!(
        tasks
            .inner
            .store
            .actor_gate(&id.state_type, &id.state_ref)
            .committed_revisions()
            .borrow()
            .1
    );
}
#[tokio::test]
async fn lost_cancellation_ack_publication_cannot_cross_a_wait_disclosure_lock() {
    let (service, _owner, _) = task_listing_service_tests::setup(0);
    let tasks = service.tasks.values().next().unwrap().clone();
    tasks
        .inner
        .cancellation_in_flight
        .store(true, std::sync::atomic::Ordering::Release);
    let publication = tasks.inner.running_owner.lock().unwrap();
    let copy = tasks.clone();
    let (entered, entered_rx) = std::sync::mpsc::channel();
    let (finished, finished_rx) = std::sync::mpsc::channel();
    let dropper = std::thread::spawn(move || {
        entered.send(()).unwrap();
        drop(CancellationWrite {
            ordinary: None,
            actor: None,
            tasks: &copy,
            acknowledged: false,
        });
        finished.send(()).unwrap();
    });
    // Thread startup is not the property under test. Do not impose a one-second
    // scheduler deadline when the full library runs concurrently; the finite
    // outer acceptance owner supplies the overall execution deadline.
    let entered = entered_rx.recv();
    let blocked = finished_rx
        .recv_timeout(std::time::Duration::from_millis(50))
        .is_err();
    let pending_under_disclosure = tasks
        .inner
        .cancellation_in_flight
        .load(std::sync::atomic::Ordering::Acquire);
    let clean_under_disclosure = !*tasks.inner.uncertain.borrow();
    // Always release the held admission and join the original thread before any
    // assertion, including RED, so a failed proof cannot strand its children.
    drop(publication);
    dropper.join().unwrap();
    assert!(
        entered.is_ok() && blocked && pending_under_disclosure && clean_under_disclosure,
        "entered={entered:?} blocked={blocked} pending={pending_under_disclosure} clean={clean_under_disclosure}"
    );
    assert!(*tasks.inner.uncertain.borrow());
    assert!(
        !tasks
            .inner
            .cancellation_in_flight
            .load(std::sync::atomic::Ordering::Acquire)
    );
}

#[tokio::test]
async fn execution_owns_exact_cancellation_registration_and_drop_releases_it() {
    let (service, _owner, task) = task_listing_service_tests::setup(0);
    let tasks = service.tasks.values().next().unwrap();
    let registration = WorkflowCancellationRegistration::new(tasks, &task).unwrap();
    assert!(WorkflowCancellationRegistration::new(tasks, &task).is_err());
    let mut receiver = registration.signal.subscribe();
    tasks
        .inner
        .workflow_cancellations
        .lock()
        .unwrap()
        .get(&task.task_id.as_ref().unwrap().task_uuid)
        .unwrap()
        .send_replace(true);
    assert!(*receiver.wait_for(|value| *value).await.unwrap());
    drop(registration);
    assert!(
        tasks
            .inner
            .workflow_cancellations
            .lock()
            .unwrap()
            .is_empty()
    );
    let next = WorkflowCancellationRegistration::new(tasks, &task).unwrap();
    assert!(!*next.signal.borrow());
    drop(next);
    assert!(
        tasks
            .inner
            .workflow_cancellations
            .lock()
            .unwrap()
            .is_empty()
    );
}

#[tokio::test]
async fn typed_handle_retrieval_binds_actor_uuid_and_does_not_own_task_cancellation() {
    let actor = crate::actor_ref::ActorRef::from_id("demo.State", "child").unwrap();
    let target = WorkflowWriterTarget::new(
        actor.clone(),
        crate::CallerId::new("a0000000001", None).unwrap(),
        None,
    )
    .unwrap();
    let id = db::TaskId {
        state_type: "demo.State".into(),
        state_ref: actor.state_ref().as_str().into(),
        task_uuid: uuid::Uuid::new_v4().as_bytes().to_vec(),
    };
    let descriptor = WorkflowWriterMethod {
        state_type: "demo.State",
        method: "demo.Methods.Child",
        response_type: "type.googleapis.com/demo.Result",
        errors: vec![],
    };
    let channel = tonic::transport::Endpoint::from_static("http://127.0.0.1:1").connect_lazy();
    let retrieve = |id| {
        WorkflowTask::<crate::proto::Counter>::retrieve(
            channel.clone(),
            target.clone(),
            id,
            descriptor.clone(),
            |status| status,
        )
    };
    let handle = retrieve(id.clone()).unwrap();
    assert_eq!(handle.clone().task_id(), &id);
    drop(handle); // No remote cancellation or detached IO on handle drop.
    for field in 0..4 {
        let mut changed = id.clone();
        match field {
            0 => changed.state_type = "other.State".into(),
            1 => changed.state_ref = "other".into(),
            2 => changed.task_uuid.clear(),
            _ => {
                changed.task_uuid = uuid::Uuid::new_v5(&uuid::Uuid::NAMESPACE_OID, b"v5")
                    .as_bytes()
                    .to_vec()
            }
        }
        assert!(retrieve(changed).is_err());
    }
}

#[test]
fn only_validated_canonical_outcomes_cross_the_task_terminal_boundary() {
    let descriptor = WorkflowWriterMethod {
        state_type: "tests.Counter",
        method: "tests.Service.Run",
        response_type: "type.googleapis.com/tests.Counter",
        errors: vec![],
    };
    let terminal = |value| db::WaitResponse {
        response_or_error: Some(db::TaskResponseOrError {
            response_or_error: Some(value),
        }),
    };
    let db::task::ResponseOrError::Error(error) = cancelled_terminal("Run") else {
        unreachable!()
    };
    let valid = terminal(db::task_response_or_error::ResponseOrError::Error(
        error.clone(),
    ));
    let outcome =
        decode_workflow_task_terminal::<crate::proto::Counter>(valid, &descriptor).unwrap();
    assert_eq!(outcome.unwrap_err().code(), tonic::Code::Cancelled);
    for changed in 0..4 {
        let mut error = error.clone();
        let mut rich = decode_task_error(&error).unwrap();
        match changed {
            0 => rich.code = tonic::Code::Unknown as i32,
            1 => rich.details[0].value = vec![255],
            2 => rich.details.push(rich.details[0].clone()),
            _ => error.type_url = "type.googleapis.com/foreign.Status".into(),
        }
        error.value = rich.encode_to_vec();
        assert!(
            decode_workflow_task_terminal::<crate::proto::Counter>(
                terminal(db::task_response_or_error::ResponseOrError::Error(error)),
                &descriptor
            )
            .is_err()
        );
    }
    for (url, bytes) in [
        ("type.googleapis.com/wrong.Result", vec![]),
        (descriptor.response_type, vec![255]),
    ] {
        assert!(
            decode_workflow_task_terminal::<crate::proto::Counter>(
                terminal(db::task_response_or_error::ResponseOrError::Response(
                    prost_types::Any {
                        type_url: url.into(),
                        value: bytes
                    }
                )),
                &descriptor
            )
            .is_err()
        );
    }
    assert!(
        decode_workflow_task_terminal::<crate::proto::Counter>(
            db::WaitResponse::default(),
            &descriptor
        )
        .is_err()
    );
}

impl DurableStateDeclaration for D {
    type State = crate::proto::Counter;
    const STATE_TYPE: &'static str = "tests.Counter";
}
struct Binding;
#[tonic::async_trait]
impl ReaderTaskBinding for Binding {
    fn validate(&self, _: &db::Task) -> Result<(), Status> {
        Ok(())
    }
    async fn execute(&self, _: &db::Task) -> Result<prost_types::Any, Status> {
        unreachable!()
    }
}
#[tokio::test]
async fn cancellation_terminal_requires_callable_and_cannot_be_fabricated_as_declared_error() {
    let make = |kind| {
        let declaration =
            TaskMethodDeclaration::new::<D, crate::proto::Counter, crate::proto::Counter>(
                "tests.Service.Run",
                "type.googleapis.com/tests.Counter",
                vec![],
            );
        OneShotTasks::new_with_declarations(
            DatabaseActorStore::connect_lazy("http://127.0.0.1:1").unwrap(),
            D::STATE_TYPE.into(),
            "actor".into(),
            Binding,
            vec![match kind {
                "workflow" => declaration.workflow(),
                "transaction" => declaration.transaction(),
                "writer" => declaration.workflow_writer_step(),
                "constructor" => declaration.constructor_scheduling(),
                "wait" => declaration.workflow_reader_wait(),
                _ => declaration,
            }],
        )
        .unwrap()
    };
    let task = db::Task {
        task_id: Some(db::TaskId {
            state_type: D::STATE_TYPE.into(),
            state_ref: "actor".into(),
            task_uuid: uuid::Uuid::new_v4().as_bytes().to_vec(),
        }),
        method: "Run".into(),
        ..Default::default()
    };
    let terminal = cancelled_terminal("Run");
    let workflow = make("workflow");
    assert!(workflow.validate_terminal(&task, &terminal).is_ok());
    assert!(make("reader").validate_terminal(&task, &terminal).is_ok());
    assert!(make("transaction").validate_terminal(&task, &terminal).is_ok());
    assert!(make("transaction").validate_scheduling_replay(std::slice::from_ref(&task), std::slice::from_ref(&task)).is_err());
    assert!(make("writer").validate_terminal(&task, &terminal).is_ok());
    assert!(
        make("constructor")
            .validate_terminal(&task, &terminal)
            .is_err()
    );
    assert!(make("wait").validate_terminal(&task, &terminal).is_err());
    let db::task::ResponseOrError::Error(error) = terminal else {
        unreachable!()
    };
    assert!(workflow.validate_declared(&task, &error).is_err());
    assert!(make("reader").validate_declared(&task, &error).is_err());
    assert!(make("writer").validate_declared(&task, &error).is_err());
    {
        let _write = CancellationWrite {
            ordinary: None,
            actor: None,
            tasks: &workflow,
            acknowledged: true,
        };
    }
    assert!(!*workflow.inner.uncertain.borrow());
    {
        let _write = CancellationWrite {
            ordinary: None,
            actor: None,
            tasks: &workflow,
            acknowledged: false,
        };
    }
    assert!(*workflow.inner.uncertain.borrow());
}

#[tokio::test]
async fn transaction_preview_does_not_wait_for_an_ordinary_body_actor_lease() {
    let (service, _service_owner, task) = task_listing_service_tests::setup(0);
    let (endpoint, database, server) = crate::runtime::test_support::start_database().await;
    database.seed_task(task.clone());
    let store = DatabaseActorStore::connect(&endpoint).await.unwrap();
    let id = task.task_id.as_ref().unwrap();
    let tasks = OneShotTasks::new(store.clone(), id.state_type.clone(), id.state_ref.clone(), Binding).unwrap();
    let _owner = DispatchOwner::claim(tasks.clone()).unwrap();
    tasks.inner.active.store(true, std::sync::atomic::Ordering::Release);
    *tasks.inner.recovery_request.lock().unwrap() = Some(db::RecoverRequest::default());
    let admission = tasks.workflow_running_admission().unwrap();
    let gate = store.actor_gate(&id.state_type, &id.state_ref);
    let lease = gate.shared().await;
    let result = tokio::time::timeout(std::time::Duration::from_secs(2), service.cancel_scheduled_transaction(&admission, id)).await;
    drop(lease);
    server.abort();
    let _ = server.await;
    assert!(result.expect("classification must not wait behind the body lease").unwrap().is_none());
    assert!(!*tasks.inner.uncertain.borrow());
    assert!(tasks.inner.ordinary_cancellations.lock().unwrap().is_empty());
}
#[tokio::test]
async fn ordinary_registration_retains_generation_and_does_not_remove_a_replacement() {
    let (service, _owner, task) = task_listing_service_tests::setup(0);
    let tasks = service.tasks.values().next().unwrap();
    let admission = tasks.local_execution_admission().unwrap();
    let registration = OrdinaryCancellationRegistration::new(tasks, &task, &admission)
        .unwrap()
        .unwrap();
    assert!(OrdinaryCancellationRegistration::new(tasks, &task, &admission).is_err());
    let id = task.task_id.as_ref().unwrap().task_uuid.clone();
    let next = tokio::sync::watch::channel(false).0;
    tasks.inner.ordinary_cancellations.lock().unwrap().insert(
        id.clone(),
        OrdinaryCancellationOwner {
            generation: std::sync::Arc::new(()),
            signal: next.clone(),
        },
    );
    drop(registration);
    assert!(
        tasks
            .inner
            .ordinary_cancellations
            .lock()
            .unwrap()
            .get(&id)
            .unwrap()
            .signal
            .same_channel(&next)
    );
    // A stale execution cannot manufacture a replacement registration.
    *tasks.inner.running_owner.lock().unwrap() = Some(std::sync::Arc::new(()));
    assert!(OrdinaryCancellationRegistration::new(tasks, &task, &admission).is_err());
}

#[tokio::test]
async fn dropped_ordinary_handoff_retains_uncertainty_and_pending_signal() {
    let (service, _owner, task) = task_listing_service_tests::setup(0);
    let tasks = service.tasks.values().next().unwrap();
    let admission = tasks.local_execution_admission().unwrap();
    let registration = OrdinaryCancellationRegistration::new(tasks, &task, &admission)
        .unwrap()
        .unwrap();
    tasks
        .inner
        .cancellation_in_flight
        .store(true, std::sync::atomic::Ordering::Release);
    registration.signal.send_replace(true);
    ordinary_interrupted(&registration.signal).await;
    let id = task.task_id.as_ref().unwrap();
    let gate = tasks.inner.store.actor_gate(&id.state_type, &id.state_ref);
    tasks
        .inner
        .cancellation_writes
        .store(1, std::sync::atomic::Ordering::Release);
    drop(CancellationWrite {
        ordinary: None,
        tasks,
        actor: Some(gate.commit_attempt()),
        acknowledged: false,
    });
    assert!(gate.committed_revisions().borrow().1);
    assert!(*registration.signal.borrow());
    assert!(admission.check_execution().is_err());
    assert!(
        !tasks
            .inner
            .cancellation_in_flight
            .load(std::sync::atomic::Ordering::Acquire)
    );
}

#[tokio::test]
async fn concurrent_handoffs_keep_wait_fenced_until_the_last_ack_or_uncertainty() {
    let (service, _owner, task) = task_listing_service_tests::setup(0);
    let tasks = service.tasks.values().next().unwrap();
    let id = task.task_id.as_ref().unwrap();
    let gate = tasks.inner.store.actor_gate(&id.state_type, &id.state_ref);
    tasks
        .inner
        .cancellation_writes
        .store(2, std::sync::atomic::Ordering::Release);
    tasks
        .inner
        .cancellation_in_flight
        .store(true, std::sync::atomic::Ordering::Release);
    let first = CancellationWrite {
        ordinary: None,
        tasks,
        actor: Some(gate.commit_attempt()),
        acknowledged: true,
    };
    let second = CancellationWrite {
        ordinary: None,
        tasks,
        actor: Some(gate.commit_attempt()),
        acknowledged: false,
    };
    drop(first);
    assert!(
        tasks
            .inner
            .cancellation_in_flight
            .load(std::sync::atomic::Ordering::Acquire)
    );
    assert!(!*tasks.inner.uncertain.borrow());
    drop(second);
    assert!(
        !tasks
            .inner
            .cancellation_in_flight
            .load(std::sync::atomic::Ordering::Acquire)
    );
    assert!(*tasks.inner.uncertain.borrow());
    assert!(gate.committed_revisions().borrow().1);
}

#[tokio::test]
async fn retired_ordinary_body_keeps_a_tombstone_until_exact_cancellation_ack() {
    let (service, _owner, task) = task_listing_service_tests::setup(0);
    let tasks = service.tasks.values().next().unwrap();
    let admission = tasks.local_execution_admission().unwrap();
    let registration = OrdinaryCancellationRegistration::new(tasks, &task, &admission)
        .unwrap()
        .unwrap();
    registration.signal.send_replace(true);
    let signal = registration.signal.clone();
    let id = task.task_id.as_ref().unwrap();
    drop(registration);
    assert!(tasks.ordinary_interruption_pending(id));
    let gate = crate::runtime::ActorGate::new();
    tasks
        .inner
        .cancellation_writes
        .store(1, std::sync::atomic::Ordering::Release);
    tasks
        .inner
        .cancellation_in_flight
        .store(true, std::sync::atomic::Ordering::Release);
    drop(CancellationWrite {
        tasks,
        ordinary: Some((id.task_uuid.clone(), signal)),
        actor: Some(gate.commit_attempt()),
        acknowledged: true,
    });
    assert!(!tasks.ordinary_interruption_pending(id));
    assert!(
        !tasks
            .inner
            .cancellation_in_flight
            .load(std::sync::atomic::Ordering::Acquire)
    );
}
