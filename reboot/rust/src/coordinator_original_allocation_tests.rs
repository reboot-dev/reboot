// Included in durable_coordinator::tests; no attestation on arbitrary endpoints.
#[tokio::test]
async fn concrete_original_routes_check_stored_owner_and_exact_membership() {
    use std::collections::BTreeMap;
    let sidecar = Arc::new(InProcessSidecar::default());
    let target = local_target();
    let original =
        DurableActorParticipant::new(sidecar.clone(), &target.state_type, &target.state_ref);
    let endpoint = Arc::new(InProcessParticipantEndpoint::new(
        DurableActorParticipantHost::new(original.clone()),
    ));
    let originals = BTreeMap::from([(target.clone(), original.clone())]);
    let resolver =
        Arc::new(ExactParticipantResolver::new([(target.clone(), endpoint.clone())]).unwrap());
    resolver.validate_original_participants(&originals).unwrap();
    assert!(endpoint.owns_participant(&target, &original.clone()));
    assert!(Arc::ptr_eq(
        &resolver.resolve(&target).await.unwrap(),
        &endpoint
    ));

    // Use the coordinator's actual retained resolver, not a parallel route map.
    let coordinator =
        DurableRootCoordinator::new(Arc::new(MockSidecar::default()), resolver.clone());
    assert!(Arc::ptr_eq(&coordinator.resolver(), &resolver));
    coordinator
        .resolver()
        .validate_original_participants(&originals)
        .unwrap();
    let replacement_resolver =
        Arc::new(ExactParticipantResolver::new([(target.clone(), endpoint.clone())]).unwrap());
    assert!(!Arc::ptr_eq(&coordinator.resolver(), &replacement_resolver));

    let other_target = ParticipantTarget {
        state_ref: "actor/original-other".into(),
        ..target.clone()
    };
    let other = DurableActorParticipant::new(
        sidecar.clone(),
        &other_target.state_type,
        &other_target.state_ref,
    );
    let wrong_actor_endpoint = Arc::new(InProcessParticipantEndpoint::new(
        DurableActorParticipantHost::new(other.clone()),
    ));
    let independent =
        DurableActorParticipant::new(sidecar.clone(), &target.state_type, &target.state_ref);
    let wrong_owner_endpoint = Arc::new(InProcessParticipantEndpoint::new(
        DurableActorParticipantHost::new(independent),
    ));
    for wrong in [wrong_actor_endpoint.clone(), wrong_owner_endpoint] {
        assert!(!wrong.owns_participant(&target, &original));
        let wrong_resolver = ExactParticipantResolver::new([(target.clone(), wrong)]).unwrap();
        assert_eq!(
            wrong_resolver
                .validate_original_participants(&originals)
                .unwrap_err()
                .code(),
            tonic::Code::FailedPrecondition
        );
    }
    // Matching owner alone does not allow a false actor label.
    let mislabeled = BTreeMap::from([(other_target.clone(), original.clone())]);
    let mislabeled_resolver =
        ExactParticipantResolver::new([(other_target.clone(), endpoint.clone())]).unwrap();
    assert!(
        mislabeled_resolver
            .validate_original_participants(&mislabeled)
            .is_err()
    );
    assert!(
        resolver
            .validate_original_participants(&BTreeMap::new())
            .is_err()
    );
    let expanded = BTreeMap::from([(target.clone(), original), (other_target.clone(), other)]);
    assert!(resolver.validate_original_participants(&expanded).is_err());
    let extra_routes = ExactParticipantResolver::new([
        (target.clone(), endpoint),
        (other_target.clone(), wrong_actor_endpoint.clone()),
    ])
    .unwrap();
    assert!(
        extra_routes
            .validate_original_participants(&originals)
            .is_err()
    );
    // Same size but different membership must reject, not just length mismatch.
    let swapped = ExactParticipantResolver::new([(other_target, wrong_actor_endpoint)]).unwrap();
    assert!(swapped.validate_original_participants(&originals).is_err());
    assert!(sidecar.calls.lock().unwrap().is_empty());
}

#[test]
fn closed_recovery_checks_the_coordinators_actual_identity_not_a_supplied_label() {
    let target = local_target();
    let participant = DurableActorParticipant::new(
        Arc::new(InProcessSidecar::default()),
        &target.state_type,
        &target.state_ref,
    );
    let endpoint = Arc::new(InProcessParticipantEndpoint::new(
        DurableActorParticipantHost::new(participant),
    ));
    let resolver = Arc::new(ExactParticipantResolver::new([(target.clone(), endpoint)]).unwrap());
    let anonymous = DurableRootCoordinator::new(Arc::new(MockSidecar::default()), resolver);
    assert!(anonymous.validate_local_recovery_identity(&target).is_err());
    let actual = anonymous.with_identity(target.clone());
    actual.validate_local_recovery_identity(&target).unwrap();
    let foreign = ParticipantTarget {
        state_ref: "foreign-coordinator".into(),
        ..target.clone()
    };
    assert!(actual.validate_local_recovery_identity(&foreign).is_err());
    let unchanged = actual.with_identity(foreign.clone());
    unchanged.validate_local_recovery_identity(&target).unwrap();
    assert!(
        unchanged
            .validate_local_recovery_identity(&foreign)
            .is_err()
    );
}
