// Included inside durable_coordinator::tests.
fn canonical_coordinator_page(id: Uuid, preparing: bool) -> database::RecoverResponse {
    database::RecoverResponse {
        transaction_coordinators: [(id.to_string(),
            DurableRootCoordinator::<MockSidecar, MockResolver>::record(
                "actor/1", &write_set(start(id).participant), preparing,
            ))].into(),
        ..Default::default()
    }
}

#[tokio::test]
async fn coordinator_snapshot_adopts_without_rescan_and_preserves_preparing() {
    for preparing in [false, true] {
        let sidecar = Arc::new(MockSidecar::default());
        let endpoint = Arc::new(MockEndpoint::default());
        let owner = coordinator(sidecar.clone(), endpoint.clone());
        let scan = vec![canonical_coordinator_page(Uuid::new_v4(), preparing)];
        let snapshot = owner.validate_recovery_snapshot("actor/1", &scan).unwrap();
        assert!(sidecar.calls.lock().unwrap().is_empty());
        owner.adopt_recovery_snapshot(snapshot).await.unwrap();
        let calls = sidecar.calls.lock().unwrap();
        assert!(!calls.iter().any(|call| matches!(call, Call::Recover(_))));
        assert!(matches!(calls.last(), Some(Call::Cleanup(_))));
        assert_eq!(calls.iter().filter(|call| matches!(call, Call::DbPrepared(_))).count(), usize::from(preparing));
        let calls = endpoint.calls.lock().unwrap();
        assert_eq!(calls.iter().filter(|call| matches!(call, Call::Prepare(_))).count(), usize::from(preparing));
        assert!(matches!(calls.last(), Some(Call::Commit(_))));
    }
}

#[test]
fn coordinator_snapshot_rejects_late_invalid_and_duplicate_owned_records_before_io() {
    let sidecar = Arc::new(MockSidecar::default());
    let endpoint = Arc::new(MockEndpoint::default());
    let owner = coordinator(sidecar.clone(), endpoint.clone());
    let good = canonical_coordinator_page(Uuid::new_v4(), true);
    let bad = database::RecoverResponse {
        transaction_coordinators: [("not-a-uuid".into(), database::TransactionCoordinator {
            state_ref: "actor/1".into(), ..Default::default()
        })].into(), ..Default::default()
    };
    assert!(owner.validate_recovery_snapshot("actor/1", &[good.clone(), bad]).is_err());
    assert!(owner.validate_recovery_snapshot("actor/1", &[good.clone(), good]).is_err());
    assert!(sidecar.calls.lock().unwrap().is_empty());
    assert!(endpoint.calls.lock().unwrap().is_empty());
}

#[test]
fn coordinator_snapshot_filters_unrelated_malformed_record_and_validates_membership() {
    let sidecar = Arc::new(MockSidecar::default());
    let owner = coordinator(sidecar.clone(), Arc::new(MockEndpoint::default()));
    let scan = vec![database::RecoverResponse {
        transaction_coordinators: [("not-a-uuid".into(), database::TransactionCoordinator {
            state_ref: "unrelated/actor".into(), ..Default::default()
        })].into(), ..Default::default()
    }];
    assert!(owner.validate_recovery_snapshot("actor/1", &scan).unwrap().records.is_empty());
    let bad = database::RecoverResponse {
        transaction_coordinators: [(Uuid::new_v4().to_string(), database::TransactionCoordinator {
            state_ref: "actor/1".into(), ..Default::default()
        })].into(), ..Default::default()
    };
    assert!(owner.validate_recovery_snapshot("actor/1", &[bad]).is_err());
    assert!(sidecar.calls.lock().unwrap().is_empty());
}
