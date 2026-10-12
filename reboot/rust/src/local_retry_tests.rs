//! Transport-backed fake database proof, not native RocksDB/public parity.
use super::*;
use std::sync::atomic::Ordering::SeqCst;
use std::time::Duration;

fn due(f: &Fixture) -> db::Task {
    let mut task = f.successor();
    task.timestamp = Some(prost_types::Timestamp {
        seconds: 1,
        nanos: 0,
    });
    f.database.seed_task(task.clone());
    task
}
async fn until_checks(f: &Fixture, count: usize) {
    tokio::time::timeout(Duration::from_secs(5), async {
        while f.probe.prechecks.load(SeqCst) < count {
            tokio::time::sleep(Duration::from_millis(1)).await;
        }
    })
    .await
    .unwrap();
}
#[tokio::test]
async fn local_retry_more_than_three_releases_lease_then_ordinary_writer_unblocks() {
    let f = Fixture::new().await;
    let task = due(&f);
    let (cancel, _) = RecoveryCancellation::test_host();
    let execution = f.tasks.execute(task.clone(), &cancel);
    tokio::pin!(execution);
    tokio::select! {
        r = &mut execution => panic!("premature result: {r:?}"),
        _ = until_checks(&f, 5) => {}
    }
    assert_eq!(f.probe.handlers.load(SeqCst), 0);
    assert!(
        f.database.store_requests().is_empty(),
        "no checkpoint/state/successor writes"
    );
    let canonical = f
        .store
        .task_database()
        .load(db::LoadRequest {
            actors: vec![],
            task_ids: vec![task.task_id.clone().unwrap()],
        })
        .await
        .unwrap()
        .into_inner()
        .tasks;
    assert_eq!(
        canonical,
        vec![task.clone()],
        "no CompleteTask on rejection"
    );
    assert_eq!(f.database.complete_calls(), 0);
    // Real ordinary writer admission/Store, not a seed or dummy transaction.
    assert_eq!(
        tokio::time::timeout(Duration::from_secs(2), f.call(uuid::Uuid::new_v4(), vec![]))
            .await
            .unwrap()
            .unwrap()
            .value,
        7
    );
    tokio::time::timeout(Duration::from_secs(5), &mut execution)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(f.probe.handlers.load(SeqCst), 1);
    assert!(f.probe.prechecks.load(SeqCst) > 3);
    let writes = f.database.store_requests();
    assert_eq!(writes.len(), 2);
    assert!(writes.iter().all(|w| w.task_upserts.is_empty()));
    let canonical = f
        .store
        .task_database()
        .load(db::LoadRequest {
            actors: vec![],
            task_ids: vec![task.task_id.clone().unwrap()],
        })
        .await
        .unwrap()
        .into_inner()
        .tasks;
    assert_eq!(canonical[0].status, db::task::Status::Completed as i32);
    let Some(db::task::ResponseOrError::Response(response)) = &canonical[0].response_or_error
    else {
        panic!("typed response")
    };
    assert_eq!(
        Counter::decode(response.value.as_slice()).unwrap().value,
        10
    );
}
#[tokio::test]
async fn local_retry_binding_await_cannot_adopt_replacement_generation() {
    let f = Fixture::new().await;
    let task = due(&f);
    f.probe.replace_before_executor.store(true, SeqCst);
    let (cancel, _) = RecoveryCancellation::test_host();
    assert!(f.tasks.execute(task, &cancel).await.is_err());
    assert_eq!(f.probe.prechecks.load(SeqCst), 0);
    assert_eq!(f.probe.handlers.load(SeqCst), 0);
    assert!(f.database.store_requests().is_empty());
}
#[tokio::test]
async fn local_execution_fencing_preserves_shared_owner_without_scheduling_authority() {
    let f = Fixture::new().await;
    let task = due(&f);
    f.database.seed_actor(
        Implicit::STATE_TYPE,
        &f.reference,
        Counter { value: 1 }.encode_to_vec(),
    );
    *f.tasks.inner.recovery_request.lock().unwrap() = None;
    let (cancel, _) = RecoveryCancellation::test_host();
    f.tasks.execute(task, &cancel).await.unwrap();
    assert_eq!(f.probe.handlers.load(SeqCst), 1);
    assert!(f.tasks.validate_staged(&[f.successor()]).await.is_err());
}
#[tokio::test]
async fn local_retry_same_status_async_errors_never_retry() {
    for error in [1, 2] {
        let f = Fixture::new().await;
        let task = due(&f);
        f.call(uuid::Uuid::new_v4(), vec![]).await.unwrap();
        f.probe.handler_error.store(error, SeqCst);
        let (cancel, _) = RecoveryCancellation::test_host();
        let result = f.tasks.execute(task.clone(), &cancel).await.unwrap_err();
        assert_eq!(
            result.code(),
            if error == 1 {
                tonic::Code::FailedPrecondition
            } else {
                tonic::Code::Unavailable
            }
        );
        assert_eq!(f.probe.prechecks.load(SeqCst), 1);
        assert_eq!(f.probe.handlers.load(SeqCst), 1);
        assert_eq!(f.database.store_requests().len(), 1);
    }
}
#[tokio::test]
async fn local_retry_cancellation_and_generation_replacement_stop_backoff() {
    for replacement in [false, true] {
        let f = Fixture::new().await;
        let task = due(&f);
        let (cancel, _) = RecoveryCancellation::test_host();
        let execution = f.tasks.execute(task, &cancel);
        tokio::pin!(execution);
        tokio::select! {
            r = &mut execution => panic!("premature result: {r:?}"),
            _ = until_checks(&f, 4) => {}
        }
        let count = f.probe.prechecks.load(SeqCst);
        if replacement {
            *f.tasks.inner.running_owner.lock().unwrap() = Some(Arc::new(()));
        } else {
            cancel.cancel();
        }
        let error = tokio::time::timeout(Duration::from_secs(2), &mut execution)
            .await
            .unwrap()
            .unwrap_err();
        assert_eq!(
            error.code(),
            if replacement {
                tonic::Code::FailedPrecondition
            } else {
                tonic::Code::Cancelled
            }
        );
        assert_eq!(f.probe.prechecks.load(SeqCst), count);
        assert_eq!(f.probe.handlers.load(SeqCst), 0);
        assert!(f.database.store_requests().is_empty());
    }
}
#[tokio::test]
async fn local_retry_generation_and_cancel_fenced_after_awaited_admission_and_load() {
    for boundary in [0, 1, 2] {
        for replacement in [false, true] {
            let f = Fixture::new().await;
            let task = due(&f);
            let gate = f.store.actor_gate(Implicit::STATE_TYPE, &f.reference);
            let lease = if boundary == 0 {
                Some(gate.exclusive().await)
            } else {
                None
            };
            let park = match boundary {
                1 => Some(f.database.park_task_load()),
                2 => Some(f.database.park_actor_load()),
                _ => None,
            };
            let (cancel, _) = RecoveryCancellation::test_host();
            let execution = f.tasks.execute(task, &cancel);
            tokio::pin!(execution);
            if let Some((entered, release)) = park {
                tokio::select! { r = &mut execution => panic!("premature {r:?}"), _ = entered => {} }
                if replacement {
                    *f.tasks.inner.running_owner.lock().unwrap() = Some(Arc::new(()));
                } else {
                    cancel.cancel();
                }
                release.send(()).unwrap();
            } else {
                tokio::select! { r = &mut execution => panic!("premature {r:?}"), _ = tokio::time::sleep(Duration::from_millis(20)) => {} }
                if replacement {
                    *f.tasks.inner.running_owner.lock().unwrap() = Some(Arc::new(()));
                } else {
                    cancel.cancel();
                }
            }
            drop(lease);
            assert!(
                tokio::time::timeout(Duration::from_secs(2), &mut execution)
                    .await
                    .unwrap()
                    .is_err()
            );
            assert_eq!(f.probe.prechecks.load(SeqCst), 0);
            assert_eq!(f.probe.handlers.load(SeqCst), 0);
            assert!(f.database.store_requests().is_empty());
        }
    }
}

fn ready(f: &Fixture) {
    f.database.seed_actor(
        Implicit::STATE_TYPE,
        &f.reference,
        Counter { value: 1 }.encode_to_vec(),
    );
}
fn invalidate(f: &Fixture, cancel: &RecoveryCancellation, replacement: bool) {
    if replacement {
        *f.tasks.inner.running_owner.lock().unwrap() = Some(Arc::new(()));
    } else {
        cancel.cancel();
    }
}
async fn fenced(
    f: &Fixture,
    cancel: &RecoveryCancellation,
    replacement: bool,
    execution: impl std::future::Future<Output = Result<(), Status>>,
) {
    let error = tokio::time::timeout(Duration::from_secs(2), execution)
        .await
        .unwrap()
        .unwrap_err();
    assert_eq!(
        error.code(),
        if replacement {
            tonic::Code::FailedPrecondition
        } else {
            tonic::Code::Cancelled
        }
    );
    assert_eq!(f.database.complete_calls(), 0);
    // Failing the host is sticky, even when a pre-Store fence avoids durable IO.
    assert!(*f.tasks.inner.uncertain.borrow());
    assert!(cancel.public_ready().await.is_err());
}
async fn canonical(f: &Fixture, ids: Vec<db::TaskId>) -> Vec<db::Task> {
    f.store
        .task_database()
        .load(db::LoadRequest {
            actors: vec![],
            task_ids: ids,
        })
        .await
        .unwrap()
        .into_inner()
        .tasks
}
#[tokio::test]
async fn local_retry_parked_handler_original_fence_matrix() {
    // Each disposition also has an unfenced positive control so invalid declared
    // envelopes/successors cannot accidentally supply the negative proof.
    for disposition in [0, 1, 2] {
        for invalidation in [None, Some(false), Some(true)] {
            let f = Fixture::new().await;
            ready(&f);
            let task = due(&f);
            let successor = f.successor();
            if disposition == 1 {
                *f.probe.successors.lock().unwrap() = vec![successor.clone()];
            } else if disposition == 2 {
                f.probe.handler_error.store(3, SeqCst);
            }
            let before = f.database.admission_rpc_counts();
            let (entered, release) = park(&f.probe.handler_park);
            let (cancel, _) = RecoveryCancellation::test_host();
            let execution = f.tasks.execute(task.clone(), &cancel);
            tokio::pin!(execution);
            tokio::select! { r = &mut execution => panic!("premature {r:?}"), r = entered => r.unwrap() }
            assert_eq!(f.probe.handlers.load(SeqCst), 1);
            let at_handler = f.database.admission_rpc_counts();
            assert_eq!(at_handler, (before.0 + 2, before.1 + 1));
            if let Some(replacement) = invalidation {
                invalidate(&f, &cancel, replacement);
            }
            release.send(()).unwrap();
            if let Some(replacement) = invalidation {
                fenced(&f, &cancel, replacement, &mut execution).await;
                assert_eq!(
                    f.database.admission_rpc_counts(),
                    at_handler,
                    "no effect preparation IO"
                );
                assert!(
                    f.database.store_requests().is_empty(),
                    "no actor/checkpoint/upsert Store"
                );
                assert_eq!(
                    canonical(
                        &f,
                        vec![
                            task.task_id.clone().unwrap(),
                            successor.task_id.clone().unwrap()
                        ]
                    )
                    .await,
                    vec![task]
                );
            } else {
                tokio::time::timeout(Duration::from_secs(2), &mut execution)
                    .await
                    .unwrap()
                    .unwrap();
                assert_eq!(f.database.complete_calls(), 1);
                assert_eq!(
                    f.database.store_requests().len(),
                    usize::from(disposition != 2)
                );
                let result = canonical(&f, vec![task.task_id.clone().unwrap()]).await;
                assert_eq!(result[0].status, db::task::Status::Completed as i32);
                assert_eq!(
                    matches!(
                        result[0].response_or_error,
                        Some(db::task::ResponseOrError::Error(_))
                    ),
                    disposition == 2
                );
                if disposition == 1 {
                    assert_eq!(
                        canonical(&f, vec![successor.task_id.clone().unwrap()]).await,
                        vec![successor]
                    );
                }
            }
        }
    }
}
#[tokio::test]
async fn local_retry_checkpoint_miss_fenced_before_actor_load() {
    for replacement in [false, true] {
        let f = Fixture::new().await;
        let task = due(&f);
        let (entered, release) = f.database.park_checkpoint_recover();
        let (cancel, _) = RecoveryCancellation::test_host();
        let execution = f.tasks.execute(task.clone(), &cancel);
        tokio::pin!(execution);
        tokio::select! { r = &mut execution => panic!("premature {r:?}"), r = entered => r.unwrap() }
        invalidate(&f, &cancel, replacement);
        release.send(()).unwrap();
        fenced(&f, &cancel, replacement, &mut execution).await;
        assert_eq!(
            f.database.admission_rpc_counts(),
            (1, 1),
            "only canonical task Load, no actor Load"
        );
        assert_eq!(f.probe.prechecks.load(SeqCst), 0);
        assert_eq!(f.probe.handlers.load(SeqCst), 0);
        assert!(f.database.store_requests().is_empty());
        assert_eq!(
            canonical(&f, vec![task.task_id.clone().unwrap()]).await,
            vec![task]
        );
    }
}
#[tokio::test]
async fn local_retry_original_fence_during_successor_preparation() {
    for replacement in [false, true] {
        let f = Fixture::new().await;
        ready(&f);
        let task = due(&f);
        *f.probe.successors.lock().unwrap() = vec![f.successor()];
        let (entered, release) = f.database.park_task_recover();
        let (cancel, _) = RecoveryCancellation::test_host();
        let execution = f.tasks.execute(task, &cancel);
        tokio::pin!(execution);
        tokio::select! { r = &mut execution => panic!("premature {r:?}"), r = entered => r.unwrap() }
        invalidate(&f, &cancel, replacement);
        release.send(()).unwrap();
        fenced(&f, &cancel, replacement, &mut execution).await;
        assert!(f.database.store_requests().is_empty());
        assert_eq!(f.probe.handlers.load(SeqCst), 1);
    }
}
#[tokio::test]
async fn local_retry_receipt_await_cannot_complete_stale_execution() {
    for declared in [false, true] {
        for replacement in [false, true] {
            let f = Fixture::new().await;
            ready(&f);
            let task = due(&f);
            if declared {
                f.probe.handler_error.store(3, SeqCst);
            }
            let (entered, release) = park(&f.probe.receipt_park);
            let (cancel, _) = RecoveryCancellation::test_host();
            let execution = f.tasks.execute(task.clone(), &cancel);
            tokio::pin!(execution);
            tokio::select! { r = &mut execution => panic!("premature {r:?}"), r = entered => r.unwrap() }
            invalidate(&f, &cancel, replacement);
            release.send(()).unwrap();
            fenced(&f, &cancel, replacement, &mut execution).await;
            assert_eq!(f.database.store_requests().len(), usize::from(!declared));
            assert_eq!(
                canonical(&f, vec![task.task_id.clone().unwrap()]).await,
                vec![task]
            );
        }
    }
}
#[tokio::test]
async fn local_retry_durable_ack_awaits_preserve_sticky_uncertainty() {
    for completion in [false, true] {
        for replacement in [false, true] {
            let f = Fixture::new().await;
            ready(&f);
            let task = due(&f);
            let (entered, release) = if completion {
                f.database.park_complete()
            } else {
                f.database.park_store()
            };
            let (cancel, _) = RecoveryCancellation::test_host();
            let execution = f.tasks.execute(task, &cancel);
            tokio::pin!(execution);
            tokio::select! { r = &mut execution => panic!("premature {r:?}"), r = entered => r.unwrap() }
            invalidate(&f, &cancel, replacement);
            release.send(()).unwrap();
            let error = tokio::time::timeout(Duration::from_secs(2), &mut execution)
                .await
                .unwrap()
                .unwrap_err();
            assert_eq!(
                error.code(),
                if replacement {
                    tonic::Code::FailedPrecondition
                } else {
                    tonic::Code::Cancelled
                }
            );
            assert_eq!(f.database.store_requests().len(), 1);
            assert_eq!(f.database.complete_calls(), usize::from(completion));
            assert!(*f.tasks.inner.uncertain.borrow());
            // No acknowledged success on the original or replacement capability.
            assert!(f.tasks.workflow_running_admission().is_err());
            assert!(cancel.public_ready().await.is_err());
        }
    }
}

#[tokio::test]
async fn local_retry_attempt_cannot_resnapshot_replacement_authority() {
    let f = Fixture::new().await;
    let task = due(&f);
    let admission = f.tasks.local_execution_admission().unwrap();
    let (cancel, _) = RecoveryCancellation::test_host();
    invalidate(&f, &cancel, true);
    assert_eq!(
        f.tasks
            .execute_once(task, &cancel, &admission)
            .await
            .unwrap_err()
            .code(),
        tonic::Code::FailedPrecondition
    );
    assert_eq!(f.database.admission_rpc_counts(), (0, 0));
    assert!(f.database.store_requests().is_empty());
    assert_eq!(f.database.complete_calls(), 0);
}
#[tokio::test]
async fn local_retry_checkpoint_hit_fenced_before_terminal_receipt() {
    for invalidation in [None, Some(false), Some(true)] {
        let f = Fixture::new().await;
        let task = due(&f);
        let id = task.task_id.as_ref().unwrap();
        let key = crate::runtime::writer_task_key(id, METHOD).unwrap();
        f.database.seed_mutation(db::IdempotentMutation {
            state_type: id.state_type.clone(),
            state_ref: id.state_ref.clone(),
            key: key.as_bytes().to_vec(),
            response: Counter { value: 4 }.encode_to_vec(),
            request_fingerprint: Some(crate::runtime::request_fingerprint(
                METHOD,
                &Counter { value: 3 },
            )),
            ..Default::default()
        });
        f.database
            .seed_actor(Implicit::STATE_TYPE, &f.reference, vec![255]);
        let (entered, release) = f.database.park_checkpoint_recover();
        let (cancel, _) = RecoveryCancellation::test_host();
        let execution = f.tasks.execute(task.clone(), &cancel);
        tokio::pin!(execution);
        tokio::select! { r = &mut execution => panic!("premature {r:?}"), r = entered => r.unwrap() }
        if let Some(replacement) = invalidation {
            invalidate(&f, &cancel, replacement);
        }
        release.send(()).unwrap();
        if let Some(replacement) = invalidation {
            fenced(&f, &cancel, replacement, &mut execution).await;
        } else {
            tokio::time::timeout(Duration::from_secs(2), &mut execution)
                .await
                .unwrap()
                .unwrap();
            assert_eq!(f.database.complete_calls(), 1);
        }
        assert_eq!(f.database.admission_rpc_counts(), (1, 1));
        assert_eq!(f.probe.prechecks.load(SeqCst), 0);
        assert_eq!(f.probe.handlers.load(SeqCst), 0);
        assert!(f.database.store_requests().is_empty());
    }
}
#[tokio::test]
async fn local_retry_losing_completion_reload_retains_original_fence() {
    for replacement in [false, true] {
        let f = Fixture::new().await;
        ready(&f);
        let task = due(&f);
        let (complete_entered, complete_release) = f.database.park_complete();
        let (cancel, _) = RecoveryCancellation::test_host();
        let execution = f.tasks.execute(task.clone(), &cancel);
        tokio::pin!(execution);
        tokio::select! { r = &mut execution => panic!("premature {r:?}"), r = complete_entered => r.unwrap() }
        // Model a matching competing CAS winner, then park the exact result Load.
        let mut winner = task;
        winner.status = db::task::Status::Completed as i32;
        winner.response_or_error = Some(db::task::ResponseOrError::Response(prost_types::Any {
            type_url: RESPONSE.into(),
            value: Counter { value: 4 }.encode_to_vec(),
        }));
        f.database.seed_task(winner);
        let (entered, release) = f.database.park_task_load();
        complete_release.send(()).unwrap();
        tokio::select! { r = &mut execution => panic!("premature {r:?}"), r = entered => r.unwrap() }
        invalidate(&f, &cancel, replacement);
        release.send(()).unwrap();
        let error = tokio::time::timeout(Duration::from_secs(2), &mut execution)
            .await
            .unwrap()
            .unwrap_err();
        assert_eq!(
            error.code(),
            if replacement {
                tonic::Code::FailedPrecondition
            } else {
                tonic::Code::Cancelled
            }
        );
        assert_eq!(f.database.store_requests().len(), 1);
        assert_eq!(f.database.complete_calls(), 1);
        assert!(*f.tasks.inner.uncertain.borrow());
        assert!(cancel.public_ready().await.is_err());
    }
}
