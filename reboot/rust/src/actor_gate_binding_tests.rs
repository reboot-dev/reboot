// Included in durable_participant::tests. Parent owns compilation/execution.

#[tokio::test]
async fn actor_gate_binding_race_with_admission_has_one_ordered_authority() {
    for _ in 0..32 {
        let (_, actor) = shared_slot_actor();
        let store = binding_store();
        let barrier = std::sync::Barrier::new(2);
        let (bound, (reservation, admitted_gate)) = std::thread::scope(|scope| {
            let binder = scope.spawn(|| {
                barrier.wait();
                std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                    actor.clone().with_database_actor_gate(&store)
                }))
                .is_ok()
            });
            let admission = scope.spawn(|| {
                barrier.wait();
                let reservation = actor.reserve_admission(Uuid::new_v4(), false).unwrap();
                (reservation, actor.lock.gate())
            });
            (binder.join().unwrap(), admission.join().unwrap())
        });
        assert_eq!(
            store.owns_actor_gate(&admitted_gate, "example.Actor", "actor/1"),
            bound
        );
        assert_eq!(
            store.owns_actor_gate(&actor.lock.gate(), "example.Actor", "actor/1"),
            bound
        );
        // Admission cannot observe a private gate and then silently migrate.
        assert_binding_rejected(&actor, &binding_store());
        drop(reservation);
        if bound {
            drop(actor.clone().with_database_actor_gate(&store));
        } else {
            assert_binding_rejected(&actor, &store);
        }
    }
}

fn binding_store() -> crate::runtime::DatabaseActorStore {
    // A unique endpoint prevents independently running tests from sharing gates;
    // connect_lazy never polls Database IO in these actor-gate contract tests.
    crate::runtime::DatabaseActorStore::connect_lazy(format!(
        "http://gate-{}.invalid:41001",
        Uuid::new_v4()
    ))
    .unwrap()
}

fn assert_binding_rejected<C: ParticipantSidecar>(
    actor: &DurableActorParticipant<C>,
    store: &crate::runtime::DatabaseActorStore,
) {
    assert!(
        std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            actor.clone().with_database_actor_gate(store)
        }))
        .is_err(),
        "different binding must fail synchronously"
    );
}

fn binding_resolver<C: ParticipantSidecar>(
    actor: &DurableActorParticipant<C>,
) -> crate::durable_coordinator::SingleParticipantResolver<C> {
    crate::durable_coordinator::SingleParticipantResolver::new(
        actor.actor_target(),
        DurableActorParticipantHost::new(actor.clone()),
    )
    .unwrap()
}

async fn binding_resolver_abort<C: ParticipantSidecar>(
    resolver: &crate::durable_coordinator::SingleParticipantResolver<C>,
    actor: &DurableActorParticipant<C>,
    root: Uuid,
) {
    use crate::durable_coordinator::{ParticipantEndpoint, ParticipantResolver};
    resolver
        .resolve(&actor.actor_target())
        .await
        .unwrap()
        .abort(
            "actor/1",
            database::AbortRequest {
                transaction_id: root.as_bytes().to_vec(),
            },
        )
        .await
        .unwrap();
}

#[tokio::test]
async fn actor_gate_binding_preexisting_clone_and_resolver_exclude_store_access() {
    let (sidecar, original) = shared_slot_actor();
    let preexisting = original.clone();
    let resolver = binding_resolver(&original); // BEFORE generated-style binding
    let store = binding_store();
    let adapter_participant = original.clone().with_database_actor_gate(&store);
    assert!(Arc::ptr_eq(
        &original.lock.binding,
        &adapter_participant.lock.binding
    ));
    assert!(store.owns_actor_gate(&original.lock.gate(), "example.Actor", "actor/1"));
    let root = Uuid::new_v4();
    adapter_participant.start(start(root)).await.unwrap();
    let gate = store.actor_gate("example.Actor", "actor/1");
    let mut normal_read = Box::pin(gate.shared());
    assert_slot_future_pending(normal_read.as_mut()).await;
    drop(normal_read);
    let mut normal_write = Box::pin(gate.exclusive());
    assert_slot_future_pending(normal_write.as_mut()).await;
    drop(normal_write);
    let next = Uuid::new_v4();
    let mut competing = Box::pin(preexisting.start(start(next)));
    assert_slot_future_pending(competing.as_mut()).await;
    assert_eq!(
        sidecar
            .calls
            .lock()
            .unwrap()
            .iter()
            .filter(|c| matches!(c, Call::Load(_)))
            .count(),
        1
    );
    binding_resolver_abort(&resolver, &original, root).await;
    tokio::time::timeout(std::time::Duration::from_secs(1), competing)
        .await
        .unwrap()
        .unwrap();
    binding_resolver_abort(&resolver, &original, next).await;
    drop(gate.shared().await);
    drop(gate.exclusive().await);
}

#[tokio::test]
async fn actor_gate_binding_shared_aliases_block_store_writer_until_both_release() {
    let (_, original) = shared_slot_actor();
    let preexisting = original.clone();
    let resolver = binding_resolver(&original);
    let store = binding_store();
    let adapter_participant = original.clone().with_database_actor_gate(&store);
    let a = Uuid::new_v4();
    let b = Uuid::new_v4();
    preexisting
        .start_with_mode(
            shared_slot_start(a),
            ParticipantStartMode::SharedUpgradeable,
        )
        .await
        .unwrap();
    adapter_participant
        .start_with_mode(
            shared_slot_start(b),
            ParticipantStartMode::SharedUpgradeable,
        )
        .await
        .unwrap();
    let gate = store.actor_gate("example.Actor", "actor/1");
    drop(gate.shared().await); // real overlapping ordinary reader
    let mut writer = Box::pin(gate.exclusive());
    assert_slot_future_pending(writer.as_mut()).await;
    binding_resolver_abort(&resolver, &original, a).await;
    assert_slot_future_pending(writer.as_mut()).await;
    assert!(
        original
            .pending
            .lock_root(b)
            .await
            .as_ref()
            .unwrap()
            .lock
            .is_shared()
    );
    binding_resolver_abort(&resolver, &original, b).await;
    drop(
        tokio::time::timeout(std::time::Duration::from_secs(1), writer)
            .await
            .unwrap(),
    );
}

#[tokio::test]
async fn actor_gate_binding_same_store_is_idempotent_after_start_and_release() {
    let (_, original) = shared_slot_actor();
    let store = binding_store();
    let equivalent =
        crate::runtime::DatabaseActorStore::connect_lazy(store.database_endpoint()).unwrap();
    let different = binding_store();
    let actor = original.clone().with_database_actor_gate(&store);
    assert_binding_rejected(&original, &different); // bound, not yet started
    let root = Uuid::new_v4();
    actor
        .start_with_mode(
            shared_slot_start(root),
            ParticipantStartMode::SharedUpgradeable,
        )
        .await
        .unwrap();
    let again = original.clone().with_database_actor_gate(&equivalent);
    assert!(Arc::ptr_eq(&again.lock.binding, &original.lock.binding));
    assert!(equivalent.owns_actor_gate(&again.lock.gate(), "example.Actor", "actor/1"));
    assert_binding_rejected(&original, &different);
    assert!(original.pending.lock_root(root).await.is_some());
    actor.abort(root).await.unwrap();
    drop(original.clone().with_database_actor_gate(&equivalent));
    assert_binding_rejected(&original, &different); // permanently frozen
}

#[tokio::test]
async fn actor_gate_binding_unbound_shared_owners_reject_first_binding_without_release() {
    let (_, actor) = shared_slot_actor();
    let alias = actor.clone();
    let store = binding_store();
    let a = Uuid::new_v4();
    let b = Uuid::new_v4();
    actor
        .start_with_mode(
            shared_slot_start(a),
            ParticipantStartMode::SharedUpgradeable,
        )
        .await
        .unwrap();
    alias
        .start_with_mode(
            shared_slot_start(b),
            ParticipantStartMode::SharedUpgradeable,
        )
        .await
        .unwrap();
    assert_binding_rejected(&alias, &store);
    assert!(!store.owns_actor_gate(&actor.lock.gate(), "example.Actor", "actor/1"));
    let old_gate = actor.lock.gate();
    let mut writer = Box::pin(old_gate.exclusive());
    assert_slot_future_pending(writer.as_mut()).await;
    actor.abort(a).await.unwrap();
    assert_slot_future_pending(writer.as_mut()).await;
    assert!(
        alias
            .pending
            .lock_root(b)
            .await
            .as_ref()
            .unwrap()
            .lock
            .is_shared()
    );
    alias.abort(b).await.unwrap();
    drop(
        tokio::time::timeout(std::time::Duration::from_secs(1), writer)
            .await
            .unwrap(),
    );
    assert_binding_rejected(&actor, &store);
}

#[tokio::test]
async fn actor_gate_binding_gate_waiter_rejects_rebind_and_keeps_exact_admission() {
    for bound in [false, true] {
        let (sidecar, original) = shared_slot_actor();
        let store = binding_store();
        let actor = if bound {
            original.clone().with_database_actor_gate(&store)
        } else {
            original.clone()
        };
        let gate = actor.lock.gate();
        let blocker = gate.exclusive().await;
        let root = Uuid::new_v4();
        let mut waiting = Box::pin(original.start(start(root)));
        assert_slot_future_pending(waiting.as_mut()).await;
        assert!(original.admissions.lock().unwrap().contains_key(&root));
        let slot = original.pending.lookup(root);
        assert!(slot.try_lock().unwrap().is_none());
        assert!(sidecar.calls.lock().unwrap().is_empty());
        if bound {
            drop(original.clone().with_database_actor_gate(&store));
            assert_binding_rejected(&actor, &binding_store());
        } else {
            assert_binding_rejected(&actor, &store);
        }
        assert!(Arc::ptr_eq(&slot, &actor.pending.lookup(root)));
        assert_slot_future_pending(waiting.as_mut()).await;
        drop(blocker);
        tokio::time::timeout(std::time::Duration::from_secs(1), waiting)
            .await
            .unwrap()
            .unwrap();
        assert!(slot.lock().await.is_some());
        actor.abort(root).await.unwrap();
    }
}

#[tokio::test]
async fn actor_gate_binding_admission_freezes_before_pending_slot_wait() {
    let (sidecar, actor) = shared_slot_actor();
    let root = Uuid::new_v4();
    let slot = actor.pending.reserve(root).unwrap();
    let blocker = slot.lock().await;
    let mut admission = Box::pin(actor.start(start(root)));
    assert_slot_future_pending(admission.as_mut()).await;
    assert!(actor.admissions.lock().unwrap().contains_key(&root));
    assert_binding_rejected(&actor, &binding_store());
    assert!(sidecar.calls.lock().unwrap().is_empty());
    drop(blocker);
    tokio::time::timeout(std::time::Duration::from_secs(1), admission)
        .await
        .unwrap()
        .unwrap();
    actor.abort(root).await.unwrap();
}

#[tokio::test]
async fn actor_gate_binding_recovery_waiter_and_native_owner_reject_rebind_without_release() {
    for prepared in [false, true] {
        let root = Uuid::new_v4();
        let sidecar = recovered_sidecar(root, prepared);
        let actor = DurableActorParticipant::new(sidecar.clone(), "example.Actor", "actor/1");
        let alias = actor.clone();
        let old_gate = actor.lock.gate();
        let blocker = old_gate.exclusive().await;
        let mut recovering = Box::pin(alias.recover(recovery()));
        assert_slot_future_pending(recovering.as_mut()).await;
        assert!(
            sidecar
                .calls
                .lock()
                .unwrap()
                .iter()
                .any(|c| matches!(c, Call::Recover(_)))
        );
        let slot = actor.pending.lookup(root);
        assert!(slot.try_lock().unwrap().is_none());
        assert_binding_rejected(&actor, &binding_store());
        assert_slot_future_pending(recovering.as_mut()).await;
        drop(blocker);
        tokio::time::timeout(std::time::Duration::from_secs(1), recovering)
            .await
            .unwrap()
            .unwrap();
        assert_binding_rejected(&alias, &binding_store());
        {
            let pending = slot.lock().await;
            let current = pending.as_ref().unwrap();
            assert!(current.native_started);
            assert_eq!(current.prepared, prepared);
            assert_eq!(current.root_id, root);
            assert_eq!(
                current.effects.task_upserts,
                vec![database::Task::default()]
            );
        }
        let mut reader = Box::pin(old_gate.shared());
        assert_slot_future_pending(reader.as_mut()).await;
        sidecar
            .terminal_results
            .lock()
            .unwrap()
            .push_back(Err(Status::unavailable("Abort ACK lost")));
        assert_eq!(
            actor.abort(root).await.unwrap_err().code(),
            tonic::Code::Unavailable
        );
        assert_binding_rejected(&alias, &binding_store());
        assert!(slot.lock().await.is_some());
        assert_slot_future_pending(reader.as_mut()).await;
        // Recovery marks early native ownership: a lost terminal ACK cannot
        // be resolved by speculative in-process retry or builder rebinding.
        let before_retry = sidecar.calls.lock().unwrap().clone();
        let retry = actor.abort(root).await.unwrap_err();
        assert_eq!(retry.code(), tonic::Code::Unavailable);
        assert_eq!(
            retry.message(),
            "native ACK uncertain; ownership retained until sidecar restart/recovery"
        );
        assert_eq!(*sidecar.calls.lock().unwrap(), before_retry);
        assert!(slot.lock().await.is_some());
        assert_slot_future_pending(reader.as_mut()).await;
        assert_binding_rejected(&alias, &binding_store());
        drop(reader);
    }
}

#[tokio::test]
async fn actor_gate_binding_bound_recovered_owner_allows_same_gate_only() {
    let root = Uuid::new_v4();
    let sidecar = recovered_sidecar(root, true);
    let original = DurableActorParticipant::new(sidecar, "example.Actor", "actor/1");
    let store = binding_store();
    let actor = original.clone().with_database_actor_gate(&store);
    original.recover(recovery()).await.unwrap();
    drop(actor.clone().with_database_actor_gate(&store));
    assert_binding_rejected(&actor, &binding_store());
    let gate = store.actor_gate("example.Actor", "actor/1");
    let mut reader = Box::pin(gate.shared());
    assert_slot_future_pending(reader.as_mut()).await;
    actor.abort(root).await.unwrap();
    drop(
        tokio::time::timeout(std::time::Duration::from_secs(1), reader)
            .await
            .unwrap(),
    );
}
