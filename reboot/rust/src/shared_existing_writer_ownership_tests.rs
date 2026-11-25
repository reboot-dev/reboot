#[tokio::test]
async fn sealed_shared_authorized_handler_requires_exact_live_read_only_root() {
    use crate::application_host::{HostRecovery, RecoveryCancellation};
    use crate::durable_coordinator::{DurableRootCoordinator, TonicCoordinatorSidecar};
    use crate::explicit_abort::{ExplicitAbortOwner, RegisteredRoot};
    let (endpoint, database, server) = crate::runtime::test_support::start_database().await;
    database.seed_actor("example.Actor", "actor/1", vec![100]);
    let store = crate::runtime::DatabaseActorStore::connect_lazy(&endpoint).unwrap();
    let participant = DurableActorParticipant::new(
        Arc::new(TonicParticipantSidecar::connect(&endpoint).await.unwrap()),
        "example.Actor",
        "actor/1",
    )
    .with_database_actor_gate(&store);
    let coordinator = DurableRootCoordinator::new(
        Arc::new(TonicCoordinatorSidecar::connect(&endpoint).await.unwrap()),
        Arc::new(AdmissionResolver),
    )
    .with_identity(participant.actor_target());
    let owner = ExplicitAbortOwner::new(1).unwrap();
    let cancellation = RecoveryCancellation::new();
    let mut supervisor = tokio::task::JoinSet::new();
    owner
        .recovery_registration()
        .start(&mut supervisor, cancellation.clone())
        .await
        .unwrap();
    let root = Uuid::new_v4();
    let mut context = crate::runtime::RootTransactionContext::start(
        crate::RebootHeaders::new("actor/1"),
        "example.Actor",
        TransactionMode::Shared,
        root,
        prost_types::Timestamp::default(),
    )
    .unwrap()
    .transaction()
    .clone();
    // Real registration activates this root in the owner's registry. Reproduce
    // its private binding/reservation steps so the exact local capability stays
    // available for causal tampering, without a fabricated owner or lease.
    let registration = RegisteredRoot::admit_shared_existing_writers(
        &participant,
        context.clone(),
        coordinator,
        &owner,
    )
    .unwrap();
    let mut request = start(root);
    request.mode = TransactionMode::Shared;
    request.coordinator_state_type = "example.Actor".into();
    request.coordinator_state_ref = "actor/1".into();
    let mut local = participant
        .start_local(request, ParticipantStartMode::SharedUpgradeable)
        .await
        .unwrap();
    let unsealed = context.clone();
    context
        .bind_shared_writer_root(Arc::new(
            crate::shared_existing_writer_root::SharedWriterRootPolicy::registered(
                root,
                owner.clone(),
            ),
        ))
        .unwrap();
    local.reserve_registered_execution(&context).await.unwrap();
    context
        .install_shared_writer_execution(participant.actor_target())
        .unwrap();
    assert!(
        local
            .validate_authorized_handler_execution(&unsealed)
            .await
            .is_err()
    );
    local
        .validate_authorized_handler_execution(&context)
        .await
        .unwrap();
    local.stage(PendingActorEffects::default()).await.unwrap();
    local
        .validate_authorized_handler_execution(&context)
        .await
        .unwrap();
    assert!(
        participant
            .pending
            .lock_root(root)
            .await
            .as_ref()
            .unwrap()
            .execution_active
    );
    // Each rejection changes ONE fact from the passing classified admission;
    // restoration must pass again, and validation must never release the slot.
    for invalid in 0..17 {
        {
            let mut pending = participant.pending.lock_root(root).await;
            let current = pending.as_mut().unwrap();
            match invalid {
                0 => current.local_owner = Some(Uuid::new_v4()),
                1 => current.transaction_ids.push(Uuid::new_v4()),
                2 => current.loaded_state = Some(vec![101]),
                3 => current.effects.state = Some(vec![101]),
                4 => current.prepared = true,
                5 => current.native_started = true,
                6 => current.native_uncertain = true,
                7 => current.native_control_started = true,
                8 => current.terminal_attempted = true,
                9 => current.execution_active = false,
                10 => current.no_terminal_retry = false,
                11 => current.fresh_shared_local = false,
                12 => current.disposition = PendingDisposition::Commit,
                13 => current.effects.task_upserts.push(database::Task::default()),
                14 => current
                    .effects
                    .idempotent_mutations
                    .push(database::IdempotentMutation::default()),
                15 => current.coordinator_state_ref = "actor/other".into(),
                16 => current.factory = true,
                _ => unreachable!(),
            }
        }
        assert!(
            local
                .validate_authorized_handler_execution(&context)
                .await
                .is_err(),
            "invalid {invalid}"
        );
        {
            let mut pending = participant.pending.lock_root(root).await;
            let current = pending.as_mut().expect("validation must retain ownership");
            current.local_owner = Some(local.local_owner);
            current.transaction_ids = vec![root];
            current.loaded_state = Some(vec![100]);
            current.effects = PendingActorEffects::default();
            current.prepared = false;
            current.native_started = false;
            current.native_uncertain = false;
            current.native_control_started = false;
            current.terminal_attempted = false;
            current.execution_active = true;
            current.no_terminal_retry = true;
            current.fresh_shared_local = true;
            current.disposition = PendingDisposition::ReadOnly;
            current.coordinator_state_ref = "actor/1".into();
            current.factory = false;
        }
        local
            .validate_authorized_handler_execution(&context)
            .await
            .unwrap();
    }
    {
        let mut pending = participant.pending.lock_root(root).await;
        let current = pending.as_mut().unwrap();
        let lease = current.lock.shared_mut().unwrap().upgrade().await.unwrap();
        current.lock = PendingLock::Exclusive(lease);
    }
    assert!(
        local
            .validate_authorized_handler_execution(&context)
            .await
            .is_err()
    );
    {
        let mut pending = participant.pending.lock_root(root).await;
        let mut current = pending.take().unwrap();
        let PendingLock::Exclusive(lease) = current.lock else {
            unreachable!()
        };
        current.lock = PendingLock::Shared(lease.downgrade());
        *pending = Some(current);
    }
    local
        .validate_authorized_handler_execution(&context)
        .await
        .unwrap();
    let slot = local.cleanup_slot.clone();
    local.cleanup_slot = Arc::new(tokio::sync::Mutex::new(None));
    assert!(
        local
            .validate_authorized_handler_execution(&context)
            .await
            .is_err()
    );
    local.cleanup_slot = slot;
    local.handed_off = true;
    assert!(
        local
            .validate_authorized_handler_execution(&context)
            .await
            .is_err()
    );
    local.handed_off = false;
    owner.fail_for_test();
    assert!(
        local
            .validate_authorized_handler_execution(&context)
            .await
            .is_err()
    );
    local.end_execution().await.unwrap();
    assert!(
        local
            .validate_authorized_handler_execution(&context)
            .await
            .is_err()
    );
    local.prepare_owned_read_only().await.unwrap();
    drop(registration);
    cancellation.cancel();
    while let Some(result) = supervisor.join_next().await {
        let _ = result.unwrap();
    }
    server.abort();
}

#[tokio::test]
async fn retained_writer_stale_drop_cannot_restore_reused_root_uuid() {
    let sidecar = Arc::new(MockSidecar::default());
    *sidecar.load_state.lock().unwrap() = Some(vec![100]);
    let participant = DurableActorParticipant::new(sidecar.clone(), "example.Actor", "actor/1");
    let root = Uuid::new_v4();
    let old = retained_writer_first_failure(&participant, root, Uuid::new_v4()).await;
    let old_slot = old.cleanup_slot.clone();
    let old_root_owner = old_slot
        .lock()
        .await
        .as_ref()
        .unwrap()
        .reusable
        .as_ref()
        .unwrap()
        .root_owner;
    assert!(
        participant
            .terminal_live(root, old_root_owner, false)
            .await
            .unwrap()
    );
    let child = Uuid::new_v4();
    let mut replacement = participant
        .start_local_reusable(
            reusable_request(root, child),
            ParticipantStartMode::Exclusive,
            true,
        )
        .await
        .unwrap();
    let execution = replacement
        .reserve_live_execution(&rollback_context(root, child))
        .await
        .unwrap();
    assert_ne!(execution.owner, old_root_owner);
    drop(old);
    tokio::task::yield_now().await;
    let pending = replacement.cleanup_slot.lock().await;
    let current = pending.as_ref().unwrap();
    assert_eq!(current.local_owner, Some(replacement.local_owner));
    assert_eq!(
        current.reusable.as_ref().unwrap().root_owner,
        execution.owner
    );
    assert_eq!(current.transaction_ids, vec![root, child]);
    assert!(current.execution_active);
    assert!(!current.lock.is_shared());
    assert!(!current.reusable.as_ref().unwrap().admitting);
    assert_eq!(sidecar.calls.lock().unwrap().len(), 2);
}

#[tokio::test]
async fn retained_writer_conflicting_upgrader_rejects_before_io() {
    let sidecar = Arc::new(MockSidecar::default());
    *sidecar.load_state.lock().unwrap() = Some(vec![100]);
    let participant = DurableActorParticipant::new(sidecar.clone(), "example.Actor", "actor/1");
    let root = Uuid::new_v4();
    let first = retained_writer_first_failure(&participant, root, Uuid::new_v4()).await;
    let mut observer = participant.lock.shared().await;
    let mut other_upgrade = Box::pin(observer.upgrade());
    std::future::poll_fn(|cx| {
        assert!(std::future::Future::poll(other_upgrade.as_mut(), cx).is_pending());
        std::task::Poll::Ready(())
    })
    .await;
    let error = tokio::time::timeout(
        std::time::Duration::from_secs(1),
        participant.start_local_reusable(
            reusable_request(root, Uuid::new_v4()),
            ParticipantStartMode::Exclusive,
            true,
        ),
    )
    .await
    .unwrap()
    .err()
    .unwrap();
    assert_eq!(error.code(), tonic::Code::Aborted);
    let pending = participant.pending.lock_root(root).await;
    let current = pending.as_ref().unwrap();
    assert!(current.lock.is_shared());
    assert_eq!(current.local_owner, Some(first.local_owner));
    assert!(!current.execution_active);
    assert_eq!(current.disposition, PendingDisposition::ReadOnly);
    assert_eq!(sidecar.calls.lock().unwrap().len(), 1);
    drop(pending);
    drop(other_upgrade);
    drop(observer);
}

#[tokio::test]
async fn owned_shared_root_hooks_reject_unsealed_context_and_writable_prepare() {
    let sidecar = Arc::new(MockSidecar::default());
    *sidecar.load_state.lock().unwrap() = Some(vec![100]);
    let participant = DurableActorParticipant::new(sidecar.clone(), "example.Actor", "actor/1");
    let root = Uuid::new_v4();
    let mut request = start(root);
    request.mode = TransactionMode::Shared;
    request.coordinator_state_type = "example.Actor".into();
    request.coordinator_state_ref = "actor/1".into();
    let mut local = participant
        .start_local(request, ParticipantStartMode::SharedUpgradeable)
        .await
        .unwrap();
    let mut headers = crate::RebootHeaders::new("actor/1");
    headers.transaction_ids = Some(vec![root]);
    headers.transaction_coordinator_state_type = Some("example.Actor".into());
    headers.transaction_coordinator_state_ref = Some("actor/1".into());
    headers.coordinator_read_only_aware = true;
    let context =
        crate::runtime::TransactionContext::from_headers(headers, TransactionMode::Shared).unwrap();
    assert!(
        tokio::time::timeout(
            std::time::Duration::from_secs(2),
            local.reserve_registered_execution(&context)
        )
        .await
        .expect("reserve_registered_execution rejection must be prompt")
        .is_err()
    );
    assert!(
        tokio::time::timeout(
            std::time::Duration::from_secs(2),
            local.reserve_handler_cancellation(&context)
        )
        .await
        .expect("reserve_handler_cancellation rejection must be prompt")
        .is_err()
    );
    assert!(
        tokio::time::timeout(
            std::time::Duration::from_secs(2),
            local.begin_registered_abandonment(&context)
        )
        .await
        .expect("begin_registered_abandonment rejection must be prompt")
        .is_err()
    );
    // Prepare intentionally waits live execution; end it before checking that
    // an unclassified quiescent root is rejected without native control.
    local.end_execution().await.unwrap();
    assert!(
        tokio::time::timeout(
            std::time::Duration::from_secs(2),
            local.prepare_owned_read_only()
        )
        .await
        .expect("unclassified Prepare must reject promptly")
        .is_err()
    );
    assert_eq!(sidecar.calls.lock().unwrap().len(), 1);
    tokio::time::timeout(
        std::time::Duration::from_secs(2),
        local.stage(PendingActorEffects {
            state: Some(vec![100]),
            ..Default::default()
        }),
    )
    .await
    .expect("unchanged shared classification must be prompt")
    .unwrap();
    assert!(
        !tokio::time::timeout(
            std::time::Duration::from_secs(2),
            local.prepare_owned_read_only()
        )
        .await
        .expect("classified local Prepare must finish promptly")
        .unwrap()
    );
    assert!(participant.pending.lock_root(root).await.is_none());
    assert_eq!(
        sidecar.calls.lock().unwrap().len(),
        1,
        "classified shared root never sends native Prepare"
    );
}

#[tokio::test]
async fn owned_read_only_prepare_rejects_stale_same_uuid_and_every_native_flag() {
    for flag in 0..6 {
        let sidecar = Arc::new(MockSidecar::default());
        *sidecar.load_state.lock().unwrap() = Some(vec![100]);
        let participant = DurableActorParticipant::new(sidecar.clone(), "example.Actor", "actor/1");
        let root = Uuid::new_v4();
        let mut request = start(root);
        request.mode = TransactionMode::Shared;
        request.coordinator_state_type = "example.Actor".into();
        request.coordinator_state_ref = "actor/1".into();
        let local = participant
            .start_local(request, ParticipantStartMode::SharedUpgradeable)
            .await
            .unwrap();
        local
            .stage(PendingActorEffects {
                state: Some(vec![100]),
                ..Default::default()
            })
            .await
            .unwrap();
        {
            let mut pending = participant.pending.lock_root(root).await;
            let current = pending.as_mut().unwrap();
            match flag {
                0 => current.local_owner = Some(Uuid::new_v4()),
                1 => current.prepared = true,
                2 => current.native_started = true,
                3 => current.native_uncertain = true,
                4 => current.native_control_started = true,
                5 => current.terminal_attempted = true,
                _ => unreachable!(),
            }
        }
        assert!(
            local.prepare_owned_read_only().await.is_err(),
            "flag {flag}"
        );
        assert!(participant.pending.lock_root(root).await.is_some());
        assert_eq!(sidecar.calls.lock().unwrap().len(), 1);
    }
}

mod retained_writer_native {
    use super::*;
    include!("../tests/fixtures/retained_writer_native_ownership.rs");
}

// Included inside durable_participant::tests: these exercise the real ActorGate
// and participant ownership engine; MockSidecar is only the I/O recorder.

async fn retained_writer_first_failure(
    participant: &DurableActorParticipant<MockSidecar>,
    root: Uuid,
    child: Uuid,
) -> StartedLocalTransaction<MockSidecar> {
    let mut local = participant
        .start_local_reusable(
            reusable_request(root, child),
            ParticipantStartMode::Exclusive,
            true,
        )
        .await
        .unwrap();
    local
        .reserve_live_execution(&rollback_context(root, child))
        .await
        .unwrap();
    participant
        .relinquish(root, child, true, Some(local.local_owner))
        .await
        .unwrap();
    local
}

async fn retained_writer_wait_inactive(
    participant: &DurableActorParticipant<MockSidecar>,
    root: Uuid,
) {
    tokio::time::timeout(std::time::Duration::from_secs(1), async {
        loop {
            let notified = participant.changed.notified();
            tokio::pin!(notified);
            notified.as_mut().enable();
            if !participant
                .pending
                .lock_root(root)
                .await
                .as_ref()
                .unwrap()
                .execution_active
            {
                return;
            }
            notified.await;
        }
    })
    .await
    .unwrap();
}

#[tokio::test]
async fn retained_writer_first_failure_reupgrades_own_lease_without_reload() {
    let sidecar = Arc::new(MockSidecar::default());
    *sidecar.load_state.lock().unwrap() = Some(vec![100]);
    let participant = DurableActorParticipant::new(sidecar.clone(), "example.Actor", "actor/1");
    let root = Uuid::new_v4();
    let n1 = Uuid::new_v4();
    let first = retained_writer_first_failure(&participant, root, n1).await;
    let slot = participant.pending.lookup(root);
    let root_owner = slot
        .lock()
        .await
        .as_ref()
        .unwrap()
        .reusable
        .as_ref()
        .unwrap()
        .root_owner;
    {
        let pending = slot.lock().await;
        let current = pending.as_ref().unwrap();
        assert!(current.lock.is_shared());
        assert_eq!(current.disposition, PendingDisposition::ReadOnly);
        assert!(!current.staged);
    }
    let n2 = Uuid::new_v4();
    let mut second = participant
        .start_local_reusable_preallow(
            reusable_request(root, n2),
            ParticipantStartMode::Exclusive,
            true,
        )
        .await
        .unwrap();
    assert!(Arc::ptr_eq(&slot, &second.cleanup_slot));
    assert_ne!(first.local_owner, second.local_owner);
    assert_eq!(second.state(), Some(&[100][..]));
    let execution = second
        .reserve_live_execution(&rollback_context(root, n2))
        .await
        .unwrap();
    assert_eq!(execution.owner, root_owner);
    assert!(!execution.watch_new);
    drop(first);
    tokio::task::yield_now().await;
    {
        let pending = slot.lock().await;
        let current = pending.as_ref().unwrap();
        assert!(!current.lock.is_shared());
        assert_eq!(current.disposition, PendingDisposition::Commit);
        assert_eq!(current.local_owner, Some(second.local_owner));
        assert!(current.execution_active);
    }
    second
        .stage(PendingActorEffects {
            state: Some(vec![60]),
            ..Default::default()
        })
        .await
        .unwrap();
    participant
        .relinquish(root, n2, false, Some(second.local_owner))
        .await
        .unwrap();
    participant.prepare_for_test(root).await.unwrap();
    participant
        .terminal_live(root, root_owner, true)
        .await
        .unwrap();
    let calls = sidecar.calls.lock().unwrap();
    assert_eq!(
        calls.iter().filter(|c| matches!(c, Call::Load(_))).count(),
        1
    );
    assert!(
        calls
            .iter()
            .any(|c| matches!(c, Call::Prepare(p) if p.state == Some(vec![60])))
    );
}

#[tokio::test]
async fn retained_writer_held_promotion_cancel_restores_exact_observation_and_owner() {
    let sidecar = Arc::new(MockSidecar::default());
    *sidecar.load_state.lock().unwrap() = Some(vec![100]);
    let participant = DurableActorParticipant::new(sidecar.clone(), "example.Actor", "actor/1");
    let root = Uuid::new_v4();
    let first = retained_writer_first_failure(&participant, root, Uuid::new_v4()).await;
    let slot = participant.pending.lookup(root);
    let (root_owner, completed, effects) = {
        let pending = slot.lock().await;
        let current = pending.as_ref().unwrap();
        (
            current.reusable.as_ref().unwrap().root_owner,
            current.reusable.as_ref().unwrap().completed.clone(),
            current.effects.clone(),
        )
    };
    // A real observer is admitted BEFORE promotion; no writer probe creates it.
    let observer = participant.lock.shared().await;
    let mut promotion = Box::pin(participant.start_local_reusable(
        reusable_request(root, Uuid::new_v4()),
        ParticipantStartMode::Exclusive,
        true,
    ));
    std::future::poll_fn(|cx| {
        assert!(std::future::Future::poll(promotion.as_mut(), cx).is_pending());
        std::task::Poll::Ready(())
    })
    .await;
    assert!(
        slot.try_lock().is_err(),
        "promotion holds exact pending slot"
    );
    assert!(participant.admissions.lock().unwrap().contains_key(&root));
    let duplicate = tokio::time::timeout(
        std::time::Duration::from_secs(1),
        participant.start_local_reusable(
            reusable_request(root, Uuid::new_v4()),
            ParticipantStartMode::Exclusive,
            true,
        ),
    )
    .await
    .unwrap();
    assert!(
        duplicate.is_err(),
        "same-root admission must reject before pending mutex"
    );
    assert_eq!(sidecar.calls.lock().unwrap().len(), 1);
    drop(promotion);
    retained_writer_wait_inactive(&participant, root).await;
    {
        let pending = slot.lock().await;
        let current = pending.as_ref().unwrap();
        let calls = current.reusable.as_ref().unwrap();
        assert!(current.lock.is_shared());
        assert_eq!(current.disposition, PendingDisposition::ReadOnly);
        assert_eq!(current.loaded_state, Some(vec![100]));
        assert!(current.effects.matches_staged(&effects));
        assert_eq!(current.local_owner, Some(first.local_owner));
        assert_eq!(calls.root_owner, root_owner);
        assert_eq!(calls.completed, completed);
        assert!(calls.watch_claimed);
        assert!(!calls.admitting);
        assert_eq!(current.transaction_ids, vec![root]);
        assert!(!current.has_native_ownership());
    }
    drop(observer);
    let next = participant
        .start_local_reusable(
            reusable_request(root, Uuid::new_v4()),
            ParticipantStartMode::Exclusive,
            true,
        )
        .await
        .unwrap();
    drop(next); // even cancellation AFTER actual promotion restores Shared.
    retained_writer_wait_inactive(&participant, root).await;
    assert!(slot.lock().await.as_ref().unwrap().lock.is_shared());
    participant
        .terminal_live(root, root_owner, false)
        .await
        .unwrap();
    assert_eq!(
        sidecar.calls.lock().unwrap().len(),
        1,
        "read-only cleanup is local-only"
    );
}

#[tokio::test]
async fn retained_writer_queued_writer_rejects_promotion_without_losing_snapshot() {
    let sidecar = Arc::new(MockSidecar::default());
    *sidecar.load_state.lock().unwrap() = Some(vec![100]);
    let participant = DurableActorParticipant::new(sidecar.clone(), "example.Actor", "actor/1");
    let root = Uuid::new_v4();
    let first = retained_writer_first_failure(&participant, root, Uuid::new_v4()).await;
    let mut writer = Box::pin(participant.lock.exclusive());
    std::future::poll_fn(|cx| {
        assert!(std::future::Future::poll(writer.as_mut(), cx).is_pending());
        std::task::Poll::Ready(())
    })
    .await;
    let result = tokio::time::timeout(
        std::time::Duration::from_secs(1),
        participant.start_local_reusable(
            reusable_request(root, Uuid::new_v4()),
            ParticipantStartMode::Exclusive,
            true,
        ),
    )
    .await
    .unwrap();
    assert_eq!(result.err().unwrap().code(), tonic::Code::Aborted);
    {
        let pending = participant.pending.lock_root(root).await;
        let current = pending.as_ref().unwrap();
        assert!(current.lock.is_shared());
        assert_eq!(current.local_owner, Some(first.local_owner));
        assert_eq!(current.loaded_state, Some(vec![100]));
        assert_eq!(current.disposition, PendingDisposition::ReadOnly);
        assert!(!current.execution_active);
    }
    drop(writer);
    let next = participant
        .start_local_reusable(
            reusable_request(root, Uuid::new_v4()),
            ParticipantStartMode::Exclusive,
            true,
        )
        .await
        .unwrap();
    drop(next);
    retained_writer_wait_inactive(&participant, root).await;
    assert_eq!(sidecar.calls.lock().unwrap().len(), 1);
}

#[tokio::test]
async fn retained_writer_n1_success_n2_declared_failure_n3_success_preserves_effects() {
    let sidecar = Arc::new(MockSidecar::default());
    *sidecar.load_state.lock().unwrap() = Some(vec![100]);
    let participant = DurableActorParticipant::new(sidecar.clone(), "example.Actor", "actor/1");
    let root = Uuid::new_v4();
    let task = database::Task {
        task_id: Some(database::TaskId {
            state_type: "example.Actor".into(),
            state_ref: "actor/1".into(),
            task_uuid: Uuid::new_v4().as_bytes().to_vec(),
        }),
        ..Default::default()
    };
    let mut stable_owner = None;
    for (value, aborted, expected) in [(60, false, 100), (9, true, 60), (100, false, 60)] {
        let child = Uuid::new_v4();
        let mut local = participant
            .start_local_reusable(
                reusable_request(root, child),
                ParticipantStartMode::Exclusive,
                true,
            )
            .await
            .unwrap();
        assert_eq!(local.state(), Some(&[expected][..]));
        let execution = local
            .reserve_live_execution(&rollback_context(root, child))
            .await
            .unwrap();
        if let Some(owner) = stable_owner {
            assert_eq!(execution.owner, owner);
        } else {
            stable_owner = Some(execution.owner);
        }
        local
            .stage_mock_validated(PendingActorEffects {
                state: Some(vec![value]),
                task_upserts: if expected == 100 {
                    vec![task.clone()]
                } else {
                    vec![]
                },
                ..Default::default()
            })
            .await
            .unwrap();
        participant
            .relinquish(root, child, aborted, Some(local.local_owner))
            .await
            .unwrap();
        let pending = participant.pending.lock_root(root).await;
        let current = pending.as_ref().unwrap();
        assert!(!current.lock.is_shared());
        assert!(current.staged);
        assert_eq!(current.disposition, PendingDisposition::Commit);
        assert_eq!(
            current.effects.state,
            Some(vec![if aborted { expected } else { value }])
        );
        assert_eq!(current.effects.task_upserts, vec![task.clone()]);
    }
    participant.prepare_for_test(root).await.unwrap();
    participant
        .terminal_live(root, stable_owner.unwrap(), true)
        .await
        .unwrap();
    let calls = sidecar.calls.lock().unwrap();
    assert_eq!(
        calls.iter().filter(|c| matches!(c, Call::Load(_))).count(),
        1
    );
    assert!(calls.iter().any(|c| matches!(c, Call::Prepare(p) if p.state == Some(vec![100]) && p.task_upserts == vec![task.clone()])));
}

#[tokio::test]
async fn retained_writer_reentry_rejects_each_native_flag_and_stale_coordinator_replay_cap() {
    for flag in 0..10 {
        let sidecar = Arc::new(MockSidecar::default());
        *sidecar.load_state.lock().unwrap() = Some(vec![100]);
        let participant = DurableActorParticipant::new(sidecar.clone(), "example.Actor", "actor/1");
        let root = Uuid::new_v4();
        let first_child = Uuid::new_v4();
        let first = retained_writer_first_failure(&participant, root, first_child).await;
        let mut request = reusable_request(root, Uuid::new_v4());
        {
            let mut pending = participant.pending.lock_root(root).await;
            let current = pending.as_mut().unwrap();
            match flag {
                0 => current.prepared = true,
                1 => current.native_started = true,
                2 => current.native_uncertain = true,
                3 => current.native_control_started = true,
                4 => current.terminal_attempted = true,
                5 => current.execution_active = true,
                6 => request.coordinator_state_ref = "stale/coordinator".into(),
                7 => request.coordinator_state_type = "stale.Coordinator".into(),
                8 => request.transaction_ids[1] = first_child,
                9 => {
                    let calls = current.reusable.as_mut().unwrap();
                    while calls.completed.len() < 1024 {
                        calls.completed.insert(Uuid::new_v4(), true);
                    }
                }
                _ => unreachable!(),
            }
        }
        assert!(
            tokio::time::timeout(
                std::time::Duration::from_secs(1),
                participant.start_local_reusable(request, ParticipantStartMode::Exclusive, true)
            )
            .await
            .unwrap()
            .is_err(),
            "flag {flag}"
        );
        let pending = participant.pending.lock_root(root).await;
        let current = pending.as_ref().unwrap();
        assert_eq!(current.local_owner, Some(first.local_owner));
        assert!(current.lock.is_shared());
        assert_eq!(current.disposition, PendingDisposition::ReadOnly);
        assert_eq!(current.loaded_state, Some(vec![100]));
        assert_eq!(sidecar.calls.lock().unwrap().len(), 1);
    }
}
