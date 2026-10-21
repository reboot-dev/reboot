// Absent-root protocol regression controls against the explicit sidecar mock.
// These assert real SDK gate/ownership and wire payloads, not native durability.

#[tokio::test]
async fn absent_default_root_stages_empty_writable_state_and_response_together() {
    let sidecar = Arc::new(MockSidecar::default());
    let participant = DurableActorParticipant::new(sidecar.clone(), "example.Actor", "actor/1");
    let id = Uuid::new_v4();
    assert!(participant.start(start(id)).await.unwrap().is_none());
    participant
        .stage(
            id,
            PendingActorEffects {
                state: Some(vec![]),
                idempotent_mutations: vec![database::IdempotentMutation {
                    key: vec![7],
                    response: vec![8],
                    ..Default::default()
                }],
                ..Default::default()
            },
        )
        .await
        .unwrap();
    assert_eq!(
        participant
            .pending
            .lock()
            .await
            .as_ref()
            .unwrap()
            .disposition,
        PendingDisposition::Commit
    );
    participant.prepare(id, false, false).await.unwrap();
    let calls = sidecar.calls.lock().unwrap().clone();
    let Call::Prepare(request) = &calls[1] else {
        panic!("missing durable Prepare")
    };
    assert_eq!(request.state, Some(vec![]));
    assert_eq!(request.idempotent_mutations.len(), 1);
    assert_eq!(request.idempotent_mutations[0].response, vec![8]);
    assert!(request.transaction.is_some());
    participant.terminal(id, true).await.unwrap();
    assert!(participant.pending.lock().await.is_none());
}

#[tokio::test]
async fn absent_default_root_uncertain_terminal_keeps_gate_and_original_owner() {
    for commit in [false, true] {
        let sidecar = Arc::new(MockSidecar::default());
        let participant = DurableActorParticipant::new(sidecar.clone(), "example.Actor", "actor/1");
        let id = Uuid::new_v4();
        assert!(participant.start(start(id)).await.unwrap().is_none());
        participant
            .stage(
                id,
                PendingActorEffects {
                    state: Some(vec![]),
                    ..Default::default()
                },
            )
            .await
            .unwrap();
        participant.prepare(id, false, false).await.unwrap();
        sidecar
            .terminal_results
            .lock()
            .unwrap()
            .push_back(Err(Status::unavailable("lost actual terminal ACK model")));
        assert!(participant.terminal(id, commit).await.is_err());
        assert!(participant.pending.lock().await.as_ref().unwrap().prepared);
        let next = Uuid::new_v4();
        assert!(
            tokio::time::timeout(
                std::time::Duration::from_millis(20),
                participant.start(start(next))
            )
            .await
            .is_err()
        );
        participant.terminal(id, commit).await.unwrap();
        // Model canonical readback only AFTER terminal ACK; this fake does not
        // apply native writes. The second admission must load, never reinitialize.
        *sidecar.load_state.lock().unwrap() = commit.then(Vec::new);
        assert_eq!(
            participant.start(start(next)).await.unwrap(),
            commit.then(Vec::new)
        );
        participant.terminal(next, false).await.unwrap();
    }
}

#[tokio::test]
async fn absent_default_root_abort_before_prepare_never_sends_state() {
    let sidecar = Arc::new(MockSidecar::default());
    let participant = DurableActorParticipant::new(sidecar.clone(), "example.Actor", "actor/1");
    let id = Uuid::new_v4();
    assert!(participant.start(start(id)).await.unwrap().is_none());
    participant
        .stage(
            id,
            PendingActorEffects {
                state: Some(vec![]),
                ..Default::default()
            },
        )
        .await
        .unwrap();
    participant.terminal(id, false).await.unwrap();
    assert!(
        sidecar
            .calls
            .lock()
            .unwrap()
            .iter()
            .all(|call| !matches!(call, Call::Prepare(_) | Call::Commit(_)))
    );
    assert!(sidecar.load_state.lock().unwrap().is_none());
}
