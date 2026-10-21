// Included in durable_coordinator::tests. Model proof, not native persistence.
fn terminal_recovery_fixture(
    outcome: database::transaction_coordinator_decision::Outcome,
) -> (
    Uuid,
    database::TransactionCoordinator,
    Arc<MockSidecar>,
    Arc<MockEndpoint>,
) {
    let id = Uuid::from_u128(0xacc);
    let members = write_set(start(id).participant);
    let commit = outcome == database::transaction_coordinator_decision::Outcome::Commit;
    let record =
        DurableRootCoordinator::<MockSidecar, MockResolver>::record("actor/1", &members, !commit);
    let sidecar = Arc::new(MockSidecar::default());
    *sidecar.recovered_decision.lock().unwrap() = Some(database::TransactionCoordinatorDecision {
        coordinator_state_ref: "actor/1".into(),
        outcome: outcome as i32,
        participants: if commit {
            record.participants.clone()
        } else {
            None
        },
    });
    let endpoint = Arc::new(MockEndpoint::default());
    endpoint
        .prepares
        .lock()
        .unwrap()
        .push_back(Err(Status::unavailable(
            "Prepare unavailable after durable decision",
        )));
    (id, record, sidecar, endpoint)
}
async fn adopt_terminal_fixture(
    id: Uuid,
    record: database::TransactionCoordinator,
    sidecar: Arc<MockSidecar>,
    endpoint: Arc<MockEndpoint>,
) -> Result<(), Status> {
    let owner = coordinator(sidecar, endpoint);
    let snapshot = owner.validate_recovery_snapshot(
        "actor/1",
        &[database::RecoverResponse {
            transaction_coordinators: [(id.to_string(), record)].into(),
            ..Default::default()
        }],
    )?;
    owner.adopt_recovery_snapshot(snapshot).await
}
#[tokio::test]
async fn original_terminal_decision_resumes_without_prepare_or_republication() {
    for outcome in [
        database::transaction_coordinator_decision::Outcome::Abort,
        database::transaction_coordinator_decision::Outcome::Commit,
    ] {
        let (id, record, sidecar, endpoint) = terminal_recovery_fixture(outcome);
        adopt_terminal_fixture(id, record, sidecar.clone(), endpoint.clone())
            .await
            .unwrap();
        assert_eq!(
            sidecar.decision_reads.lock().unwrap().as_slice(),
            &[database::TransactionCoordinatorDecisionGetRequest {
                root_transaction_id: id.as_bytes().to_vec(),
                coordinator_state_ref: "actor/1".into(),
            }]
        );
        let calls = endpoint.calls.lock().unwrap();
        assert_eq!(calls.len(), 1);
        if outcome == database::transaction_coordinator_decision::Outcome::Abort {
            assert!(matches!(&calls[0], Call::Abort(r) if r.transaction_id == id.as_bytes()));
        } else {
            assert!(matches!(&calls[0], Call::Commit(r) if r.transaction_id == id.as_bytes()));
        }
        assert!(
            matches!(sidecar.calls.lock().unwrap().as_slice(), [Call::Cleanup(r)]
            if r.transaction_id == id.as_bytes() && r.coordinator_state_ref == "actor/1")
        );
    }
}
#[tokio::test]
async fn terminal_recovery_rejects_malformed_or_inconsistent_native_authority() {
    for variant in 0..7 {
        let (id, mut record, sidecar, endpoint) =
            terminal_recovery_fixture(database::transaction_coordinator_decision::Outcome::Commit);
        {
            let mut stored = sidecar.recovered_decision.lock().unwrap();
            let decision = stored.as_mut().unwrap();
            match variant {
                0 => decision.coordinator_state_ref = "other".into(),
                1 => decision.outcome = 0,
                2 => decision.participants = None,
                3 => {
                    decision
                        .participants
                        .as_mut()
                        .unwrap()
                        .should_commit
                        .clear();
                }
                4 => record.preparing = true,
                5 => {
                    decision.participants.as_mut().unwrap().read_only = decision
                        .participants
                        .as_ref()
                        .unwrap()
                        .should_commit
                        .clone();
                }
                _ => {
                    decision.outcome =
                        database::transaction_coordinator_decision::Outcome::Abort as i32
                }
            }
        }
        let error = adopt_terminal_fixture(id, record, sidecar.clone(), endpoint.clone())
            .await
            .unwrap_err();
        assert_eq!(error.code(), tonic::Code::DataLoss, "variant {variant}");
        assert!(endpoint.calls.lock().unwrap().is_empty());
        assert!(
            sidecar.calls.lock().unwrap().is_empty(),
            "no cleanup, Prepare or replacement decision"
        );
    }
}
#[tokio::test]
async fn failed_decision_read_never_falls_back_to_prepare_or_abort() {
    let (id, record, _, endpoint) =
        terminal_recovery_fixture(database::transaction_coordinator_decision::Outcome::Abort);
    let sidecar = Arc::new(MockSidecar {
        decision_read_error: true,
        ..Default::default()
    });
    let error = adopt_terminal_fixture(id, record, sidecar.clone(), endpoint.clone())
        .await
        .unwrap_err();
    assert_eq!(error.code(), tonic::Code::Unavailable);
    assert!(endpoint.calls.lock().unwrap().is_empty());
    assert!(sidecar.calls.lock().unwrap().is_empty());
}
#[tokio::test]
async fn missing_terminal_decision_is_not_abort_authority() {
    let (id, record, sidecar, endpoint) =
        terminal_recovery_fixture(database::transaction_coordinator_decision::Outcome::Abort);
    *sidecar.recovered_decision.lock().unwrap() = None;
    let error = adopt_terminal_fixture(id, record, sidecar.clone(), endpoint.clone())
        .await
        .unwrap_err();
    assert_eq!(error.code(), tonic::Code::Unavailable);
    assert!(
        matches!(endpoint.calls.lock().unwrap().as_slice(), [Call::Prepare(r)] if r.transaction_id == id.as_bytes())
    );
    assert!(sidecar.calls.lock().unwrap().is_empty());
}
#[tokio::test]
async fn lost_terminal_ack_retains_record_and_original_terminal_authority() {
    let (id, record, sidecar, _) =
        terminal_recovery_fixture(database::transaction_coordinator_decision::Outcome::Abort);
    let endpoint = Arc::new(MockEndpoint {
        abort_error: true,
        ..Default::default()
    });
    for _ in 0..2 {
        let error = adopt_terminal_fixture(id, record.clone(), sidecar.clone(), endpoint.clone())
            .await
            .unwrap_err();
        assert_eq!(error.code(), tonic::Code::Unavailable);
    }
    assert!(
        endpoint
            .calls
            .lock()
            .unwrap()
            .iter()
            .all(|call| matches!(call, Call::Abort(r) if r.transaction_id == id.as_bytes()))
    );
    assert_eq!(endpoint.calls.lock().unwrap().len(), 2);
    assert!(
        sidecar.calls.lock().unwrap().is_empty(),
        "uncertain delivery cannot cleanup"
    );
}
