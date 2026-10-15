// Included inside durable_participant::tests; no new public test surface.
#[test]
fn snapshot_reservation_freezes_original_binding_before_any_io() {
    let sidecar = Arc::new(MockSidecar::default());
    let owner = DurableActorParticipant::new(sidecar.clone(), "example.Actor", "actor/1");
    assert!(!owner.lock.binding.lock().unwrap().started);
    let reservation = owner.reserve_recovery_snapshot();
    assert!(owner.lock.binding.lock().unwrap().started);
    assert!(sidecar.calls.lock().unwrap().is_empty());
    drop(reservation);
    // Cancellation does not make rebinding the original generation safe.
    assert!(owner.lock.binding.lock().unwrap().started);
}

#[tokio::test]
async fn snapshot_adoption_preserves_pending_capacity_before_gate_wait() {
    let sidecar = Arc::new(MockSidecar::default());
    let owner = DurableActorParticipant::new(sidecar.clone(), "example.Actor", "actor/1");
    let slots = (0..MAX_PENDING_ROOTS_PER_ACTOR)
        .map(|_| owner.pending.reserve(Uuid::new_v4()).unwrap())
        .collect::<Vec<_>>();
    assert_eq!(slots.len(), MAX_PENDING_ROOTS_PER_ACTOR);
    let scan = vec![database::RecoverResponse {
        participant_transactions: vec![recovered_transaction(Uuid::new_v4(), true)],
        ..Default::default()
    }];
    let snapshot = owner.reserve_recovery_snapshot().validate(&scan).unwrap();
    assert_eq!(snapshot.adopt().await.unwrap_err().code(), tonic::Code::ResourceExhausted);
    assert!(sidecar.calls.lock().unwrap().is_empty());
}

#[tokio::test]
async fn snapshot_adoption_partitions_two_actors_without_recover_io() {
    let sidecar = Arc::new(MockSidecar::default());
    let first = DurableActorParticipant::new(sidecar.clone(), "example.Actor", "actor/1");
    let second = DurableActorParticipant::new(sidecar.clone(), "example.Actor", "actor/2");
    let a = first.reserve_recovery_snapshot();
    let b = second.reserve_recovery_snapshot();
    let root = Uuid::new_v4();
    let one = recovered_transaction(root, true);
    let mut two = recovered_transaction(root, false);
    two.state_ref = "actor/2".into();
    let scan = vec![database::RecoverResponse {
        participant_transactions: vec![one.clone(), two.clone()],
        ..Default::default()
    }];
    let a = a.validate(&scan).unwrap();
    let b = b.validate(&scan).unwrap();
    a.adopt().await.unwrap();
    b.adopt().await.unwrap();
    for (owner, record) in [(&first, one), (&second, two)] {
        let pending = owner.pending.lock_root(root).await;
        let pending = pending.as_ref().unwrap();
        assert_eq!(pending.effects.task_upserts, record.uncommitted_tasks);
        assert_eq!(pending.effects.idempotent_mutations, record.uncommitted_idempotent_mutations);
        assert!(pending.effects.state.is_none());
        assert!(pending.staged && pending.native_started);
        assert!(!pending.native_uncertain && !pending.native_control_started);
        assert_eq!(pending.prepared, record.prepared);
        assert!(!pending.factory && !pending.constructor_child);
    }
    assert!(sidecar.calls.lock().unwrap().is_empty());
    first.terminal(root, true).await.unwrap();
    assert!(second.terminal(root, true).await.is_err());
    assert!(matches!(sidecar.calls.lock().unwrap().as_slice(),
        [Call::Commit(_), Call::Abort(_)]));
}

#[tokio::test]
async fn snapshot_rejects_late_owned_invalid_without_installing_first_record() {
    let sidecar = Arc::new(MockSidecar::default());
    let owner = DurableActorParticipant::new(sidecar.clone(), "example.Actor", "actor/1");
    let root = Uuid::new_v4();
    let scan = vec![
        database::RecoverResponse { participant_transactions: vec![recovered_transaction(root, true)], ..Default::default() },
        database::RecoverResponse { participant_transactions: vec![recovered_transaction(Uuid::new_v4(), false)], ..Default::default() },
    ];
    assert!(owner.reserve_recovery_snapshot().validate(&scan).is_err());
    assert!(owner.pending.snapshot().is_empty());
    assert!(sidecar.calls.lock().unwrap().is_empty());
}

#[test]
fn snapshot_validates_owned_paths_but_ignores_malformed_unrelated_owners() {
    let sidecar = Arc::new(MockSidecar::default());
    let owner = DurableActorParticipant::new(sidecar.clone(), "example.Actor", "actor/1");
    let root = Uuid::new_v4();
    for path in [vec![], vec![vec![1]], vec![root.as_bytes().to_vec(), root.as_bytes().to_vec()]] {
        let mut record = recovered_transaction(root, true);
        record.transaction_ids = path;
        let scan = vec![database::RecoverResponse { participant_transactions: vec![record], ..Default::default() }];
        assert!(owner.reserve_recovery_snapshot().validate(&scan).is_err());
    }
    let mut unrelated = database::Transaction::default();
    unrelated.state_type = "other.Type".into();
    unrelated.state_ref = "actor/1".into();
    let scan = vec![database::RecoverResponse { participant_transactions: vec![unrelated], ..Default::default() }];
    assert!(owner.reserve_recovery_snapshot().validate(&scan).unwrap().recovered.is_none());
    assert!(sidecar.calls.lock().unwrap().is_empty());
}

#[tokio::test]
async fn singleton_eof_error_does_not_adopt_earlier_valid_record() {
    let root = Uuid::new_v4();
    let sidecar = recovered_sidecar(root, true);
    sidecar.recover_responses.lock().unwrap().push_back(Err(Status::unavailable("EOF lost")));
    let owner = DurableActorParticipant::new(sidecar.clone(), "example.Actor", "actor/1");
    assert_eq!(owner.recover(recovery()).await.unwrap_err().code(), tonic::Code::Unavailable);
    assert!(owner.pending.snapshot().is_empty());
    assert!(matches!(sidecar.calls.lock().unwrap().as_slice(), [Call::Recover(_)]));
}
