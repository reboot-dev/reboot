//! Causal SDK transport/lifecycle models; parent must compile/run these.
//! These drive the actual DispatchSupervisorOwner destructor, not Host::shutdown.
use super::*;

fn lifecycle(f: &Fixture) -> Arc<DispatchLifecycle> {
    let key = (
        f.store.database_endpoint().to_owned(),
        Account::STATE_TYPE.to_owned(),
        f.reference.clone(),
    );
    owners().lock().unwrap().get(&key).unwrap().clone()
}
fn retained_original(f: &Fixture, original: &Arc<()>) {
    let status = f.tasks.constructor_uncertainty_status();
    assert_eq!(status.process_limit, CONSTRUCTOR_UNCERTAINTY_LIMIT);
    assert!(status.actor_sealed && status.actor_retained);
    let life = lifecycle(f);
    let state = life.constructor.lock().unwrap();
    assert!(state.sealed);
    let retained = state
        .retained
        .as_ref()
        .expect("actual lease/admission/budget retained");
    assert!(Arc::ptr_eq(&retained._admission.generation, original));
    assert!(Arc::ptr_eq(&life.generation, original));
}
async fn blocked_and_unclaimable(f: &Fixture) {
    // A genuinely cold allocation, not reuse of the revoked owner's Inner.
    // Same exact endpoint + actor identity must retain the registration fence.
    let cold_store = DatabaseActorStore::connect_lazy(f.store.database_endpoint()).unwrap();
    let cold = OneShotTasks::new_with_declarations(
        cold_store,
        Account::STATE_TYPE.into(),
        f.reference.clone(),
        Binding,
        vec![
            TaskMethodDeclaration::new::<Account, Counter, db::TaskId>(OPEN, ID, vec![])
                .constructor_scheduling(),
            TaskMethodDeclaration::new::<Account, Counter, Counter>(EMAIL, COUNTER, vec![]),
        ],
    )
    .unwrap();
    assert!(!Arc::ptr_eq(&cold.inner, &f.tasks.inner));
    assert!(matches!(DispatchOwner::claim(cold), Err(e) if e.code() == tonic::Code::AlreadyExists));
    assert!(
        matches!(DispatchOwner::claim(f.tasks.clone()), Err(e) if e.code() == tonic::Code::AlreadyExists)
    );
    let gate = f.store.actor_gate(Account::STATE_TYPE, &f.reference);
    assert!(
        tokio::time::timeout(std::time::Duration::from_millis(10), gate.exclusive())
            .await
            .is_err()
    );
}

#[tokio::test]
async fn error_retention_survives_actual_supervisor_owner_destruction() {
    let f = Fixture::new().await;
    let original = f.tasks.inner.running_owner.lock().unwrap().clone().unwrap();
    f.database.reject_task_create();
    assert_eq!(
        f.call(uuid::Uuid::new_v4(), 7, f.task())
            .await
            .unwrap_err()
            .code(),
        tonic::Code::Unimplemented
    );
    retained_original(&f, &original);
    f.shutdown_owner();
    assert!(f.tasks.inner.running_owner.lock().unwrap().is_none());
    retained_original(&f, &original);
    blocked_and_unclaimable(&f).await;
}

#[tokio::test]
async fn shutdown_before_ack_cannot_release_registry_then_cancellation_retains_original() {
    let f = Fixture::new().await;
    let original = f.tasks.inner.running_owner.lock().unwrap().clone().unwrap();
    let (entered, _release) = f.database.park_create();
    let mut call = Box::pin(f.call(uuid::Uuid::new_v4(), 7, f.task()));
    tokio::time::timeout(std::time::Duration::from_secs(2), async {
        tokio::select! { result = &mut call => panic!("unexpected {result:?}"), result = entered => result.unwrap() }
    }).await.unwrap();
    f.shutdown_owner();
    assert!(
        lifecycle(&f).constructor.lock().unwrap().retained.is_none(),
        "IO still owns the actual lease"
    );
    blocked_and_unclaimable(&f).await;
    drop(call);
    retained_original(&f, &original);
    assert!(*f.tasks.inner.uncertain.borrow());
    blocked_and_unclaimable(&f).await;
    assert!(f.database.create_requests().is_empty());
}

#[tokio::test]
async fn canonical_model_batch_without_ack_is_not_reconciliation_after_shutdown() {
    let f = Fixture::new().await;
    let original = f.tasks.inner.running_owner.lock().unwrap().clone().unwrap();
    let (entered, _release) = f.database.park_create_ack();
    let mut call = Box::pin(f.call(uuid::Uuid::new_v4(), 7, f.task()));
    tokio::time::timeout(std::time::Duration::from_secs(2), async {
        tokio::select! { result = &mut call => panic!("unexpected {result:?}"), result = entered => result.unwrap() }
    }).await.unwrap();
    assert_eq!(f.database.create_requests().len(), 1);
    f.shutdown_owner();
    drop(call);
    retained_original(&f, &original);
    blocked_and_unclaimable(&f).await;
    assert!(*f.tasks.inner.uncertain.borrow());
    assert!(f.database.store_requests().is_empty());
}

#[tokio::test]
async fn delivered_ack_after_shutdown_refuses_publication_and_retains_owner() {
    let f = Fixture::new().await;
    let original = f.tasks.inner.running_owner.lock().unwrap().clone().unwrap();
    let (entered, release) = f.database.park_create_ack();
    let mut call = Box::pin(f.call(uuid::Uuid::new_v4(), 7, f.task()));
    tokio::time::timeout(std::time::Duration::from_secs(2), async {
        tokio::select! { result = &mut call => panic!("unexpected {result:?}"), result = entered => result.unwrap() }
    }).await.unwrap();
    f.shutdown_owner();
    assert!(
        matches!(DispatchOwner::claim(f.tasks.clone()), Err(e) if e.code() == tonic::Code::AlreadyExists)
    );
    release.send(()).unwrap();
    let error = tokio::time::timeout(std::time::Duration::from_secs(1), call)
        .await
        .unwrap()
        .unwrap_err();
    assert_eq!(error.code(), tonic::Code::FailedPrecondition);
    retained_original(&f, &original);
    assert!(*f.tasks.inner.uncertain.borrow());
    blocked_and_unclaimable(&f).await;
}

#[tokio::test]
async fn bounded_reservation_counts_inflight_and_retained_and_only_ack_releases() {
    // Isolated budget invokes the same private reservation primitive; it does
    // not drain/reset process-global uncertainty or claim end-to-end exhaustion.
    let budget = Arc::new(tokio::sync::Semaphore::new(1));
    let first = Fixture::new().await;
    let second = Fixture::new().await;
    let admission = first.tasks.workflow_running_admission().unwrap();
    let reservation = admission.reserve_constructor_with_budget(&budget).unwrap();
    assert_eq!(budget.available_permits(), 0);
    let second_admission = second.tasks.workflow_running_admission().unwrap();
    assert!(
        matches!(second_admission.reserve_constructor_with_budget(&budget), Err(e) if e.code() == tonic::Code::ResourceExhausted)
    );
    assert!(!lifecycle(&second).constructor.lock().unwrap().sealed);
    assert!(second.database.create_requests().is_empty());
    // Known ACK is modelled explicitly for this reservation-only unit case.
    reservation.lifecycle_acknowledged();
    drop(reservation);
    assert_eq!(budget.available_permits(), 1);
    let reservation = second_admission
        .reserve_constructor_with_budget(&budget)
        .unwrap();
    let gate = second
        .store
        .actor_gate(Account::STATE_TYPE, &second.reference);
    let lease = gate.exclusive().await;
    let original = second_admission.generation.clone();
    reservation.retain(lease, second_admission);
    second.shutdown_owner();
    assert_eq!(budget.available_permits(), 0);
    retained_original(&second, &original);
    assert!(
        matches!(admission.reserve_constructor_with_budget(&budget), Err(e) if e.code() == tonic::Code::ResourceExhausted)
    );
    blocked_and_unclaimable(&second).await;
}

#[tokio::test]
async fn healthy_ack_releases_actor_and_exact_host_registration() {
    let f = Fixture::new().await;
    let life = lifecycle(&f);
    f.call(uuid::Uuid::new_v4(), 7, f.task()).await.unwrap();
    assert!(!life.constructor.lock().unwrap().sealed);
    assert!(life.constructor.lock().unwrap().retained.is_none());
    assert!(!*f.tasks.inner.uncertain.borrow());
    let gate = f.store.actor_gate(Account::STATE_TYPE, &f.reference);
    drop(
        tokio::time::timeout(std::time::Duration::from_secs(1), gate.exclusive())
            .await
            .unwrap(),
    );
    f.shutdown_owner();
    drop(DispatchOwner::claim(f.tasks.clone()).unwrap());
}

#[tokio::test]
async fn attached_owner_empty_effect_constructor_keeps_legacy_rpc_with_host_reservation() {
    let f = Fixture::new().await;
    let key = uuid::Uuid::new_v4();
    let id = f.task().task_id.unwrap();
    let policy = crate::auth::AuthorizationPolicy::permissive_for_development();
    for _ in 0..2 {
        let mut request = tonic::Request::new(Counter { value: 3 });
        let mut headers = crate::RebootHeaders::new(&f.reference);
        headers.idempotency_key = Some(key);
        *request.metadata_mut() = headers.to_metadata().unwrap();
        let response_id = id.clone();
        let response = f
            .store
            .scheduling_constructor_async_for_method_authorized::<Account, _, db::TaskId, _>(
                (OPEN, ID),
                &policy,
                Some(&f.tasks),
                request,
                move |state, request, _| {
                    Box::pin(async move {
                        state.value = request.value;
                        Ok(WriterExecution::new(response_id))
                    })
                },
            )
            .await
            .unwrap()
            .into_inner();
        assert_eq!(response, id);
    }
    let requests = f.database.create_requests();
    assert_eq!(requests.len(), 1);
    assert!(requests[0].task_upserts.is_empty());
    assert!(
        requests[0]
            .idempotent_mutation
            .as_ref()
            .unwrap()
            .task_ids
            .is_empty()
    );
    assert!(f.database.store_requests().is_empty());
    assert!(!f.tasks.constructor_uncertainty_status().actor_sealed);
    assert!(!*f.tasks.inner.uncertain.borrow());
    f.shutdown_owner();
    drop(DispatchOwner::claim(f.tasks.clone()).unwrap());
}

#[tokio::test]
async fn handler_cancellation_before_seal_releases_gate_without_uncertainty() {
    let f = Fixture::new().await;
    let (entered_tx, entered) = tokio::sync::oneshot::channel();
    let mut request = tonic::Request::new(Counter { value: 3 });
    let mut headers = crate::RebootHeaders::new(&f.reference);
    headers.idempotency_key = Some(uuid::Uuid::new_v4());
    *request.metadata_mut() = headers.to_metadata().unwrap();
    let policy = crate::auth::AuthorizationPolicy::permissive_for_development();
    let mut call = Box::pin(
        f.store
            .scheduling_constructor_async_for_method_authorized::<Account, _, db::TaskId, _>(
                (OPEN, ID),
                &policy,
                Some(&f.tasks),
                request,
                move |_, _, _| {
                    Box::pin(async move {
                        entered_tx.send(()).unwrap();
                        std::future::pending::<Result<WriterExecution<db::TaskId>, Status>>().await
                    })
                },
            ),
    );
    tokio::time::timeout(std::time::Duration::from_secs(2), async {
        tokio::select! { result = &mut call => panic!("unexpected {result:?}"), result = entered => result.unwrap() }
    }).await.unwrap();
    drop(call);
    assert!(!lifecycle(&f).constructor.lock().unwrap().sealed);
    assert!(!*f.tasks.inner.uncertain.borrow());
    assert!(f.database.create_requests().is_empty());
    let gate = f.store.actor_gate(Account::STATE_TYPE, &f.reference);
    drop(
        tokio::time::timeout(std::time::Duration::from_secs(1), gate.exclusive())
            .await
            .unwrap(),
    );
    f.shutdown_owner();
    drop(DispatchOwner::claim(f.tasks.clone()).unwrap());
}
