use super::*;
fn target(name: &str) -> ParticipantTarget {
    ParticipantTarget {
        state_type: "Account".into(),
        state_ref: name.into(),
    }
}
fn graph() -> (
    BTreeSet<ParticipantTarget>,
    BTreeMap<String, ParticipantTarget>,
) {
    (
        [target("bank"), target("child")].into(),
        [("bank".into(), target("bank"))].into(),
    )
}
fn transaction(actor: &str, root: &str) -> db::RecoverResponse {
    db::RecoverResponse {
        participant_transactions: vec![db::Transaction {
            state_type: "Account".into(),
            state_ref: actor.into(),
            coordinator_state_type: "Account".into(),
            coordinator_state_ref: root.into(),
            transaction_ids: vec![uuid::Uuid::new_v4().as_bytes().to_vec()],
            ..Default::default()
        }],
        ..Default::default()
    }
}
#[test]
fn unrelated_unresolved_records_do_not_veto_convergence() {
    let (owned, roots) = graph();
    let unrelated = transaction("unrelated", "also-unrelated");
    validate_graph(&[unrelated], &owned, &roots, true).unwrap();
    assert!(validate_graph(&[transaction("child", "bank")], &owned, &roots, true).is_err());
}
#[test]
fn unknown_coordinator_of_owned_participant_is_rejected() {
    let (owned, roots) = graph();
    assert!(validate_graph(&[transaction("child", "unknown")], &owned, &roots, false).is_err());
    validate_graph(&[transaction("child", "bank")], &owned, &roots, false).unwrap();
}
#[test]
fn unknown_member_of_owned_coordinator_is_rejected() {
    let (owned, roots) = graph();
    let page = db::RecoverResponse {
        transaction_coordinators: [(
            uuid::Uuid::new_v4().to_string(),
            db::TransactionCoordinator {
                state_ref: "bank".into(),
                participants: Some(db::Participants {
                    should_commit: [(
                        "Account".into(),
                        db::participants::StateRefs {
                            state_refs: vec!["unknown".into()],
                        },
                    )]
                    .into(),
                    ..Default::default()
                }),
                ..Default::default()
            },
        )]
        .into(),
        ..Default::default()
    };
    assert!(validate_graph(&[page], &owned, &roots, false).is_err());
}
#[test]
fn taskful_effects_fail_closed_before_adoption() {
    let (owned, roots) = graph();
    let mut page = transaction("child", "bank");
    page.participant_transactions[0]
        .uncommitted_tasks
        .push(db::Task::default());
    assert_eq!(
        validate_graph(&[page], &owned, &roots, false)
            .unwrap_err()
            .code(),
        tonic::Code::FailedPrecondition
    );
}
#[test]
fn host_owned_custody_retains_without_global_leak() {
    let owner = Arc::new(());
    let weak = Arc::downgrade(&owner);
    let custody = Custody {
        owner: Some(owner.clone()),
        uncertain: false,
    };
    drop(custody);
    assert!(weak.upgrade().is_some()); // host still owns the original bundle
    drop(owner);
    assert!(weak.upgrade().is_none()); // healthy release does not leak globally
}

#[test]
fn canonical_watch_roots_select_distinct_coordinators_not_a_global_route() {
    let (mut owned, mut coordinators) = graph();
    owned.insert(target("second"));
    coordinators.insert("second".into(), target("second"));
    let first = transaction("child", "bank");
    let second = transaction("second", "second");
    let first_root =
        uuid::Uuid::from_slice(&first.participant_transactions[0].transaction_ids[0]).unwrap();
    let second_root =
        uuid::Uuid::from_slice(&second.participant_transactions[0].transaction_ids[0]).unwrap();
    let routes = watch_membership(&[first, second], &owned, &coordinators).unwrap();
    assert_eq!(routes[&first_root].coordinator, target("bank"));
    assert_eq!(routes[&second_root].coordinator, target("second"));
    assert!(routes[&first_root].participants.contains(&target("child")));
    assert!(!routes[&first_root].participants.contains(&target("second")));
}

#[test]
fn canonical_watch_rejects_foreign_and_conflicting_coordinator_associations() {
    let (owned, mut coordinators) = graph();
    assert!(watch_membership(&[transaction("child", "foreign")], &owned, &coordinators).is_err());
    coordinators.insert("child".into(), target("child"));
    let first = transaction("child", "bank");
    let mut conflicting = first.clone();
    conflicting.participant_transactions[0].coordinator_state_ref = "child".into();
    assert!(watch_membership(&[first, conflicting], &owned, &coordinators).is_err());
}

#[test]
fn canonical_watch_rejects_foreign_coordinator_record_for_owned_root() {
    let (owned, coordinators) = graph();
    let mut page = transaction("child", "bank");
    let root =
        uuid::Uuid::from_slice(&page.participant_transactions[0].transaction_ids[0]).unwrap();
    page.transaction_coordinators.insert(
        root.to_string(),
        db::TransactionCoordinator {
            state_ref: "foreign".into(),
            ..Default::default()
        },
    );
    assert!(watch_membership(&[page], &owned, &coordinators).is_err());
}

#[tokio::test]
async fn real_closed_watch_endpoint_rejects_unknown_root_without_database_io() {
    let watch = ClosedCoordinatorWatch::<crate::durable_coordinator::TonicCoordinatorSidecar> {
        routes: BTreeMap::new(),
    };
    let error = watch
        .watch(db::WatchRequest {
            transaction_id: uuid::Uuid::new_v4().as_bytes().to_vec(),
            state_type: "Account".into(),
            state_ref: "child".into(),
        })
        .await
        .unwrap_err();
    assert_eq!(error.code(), tonic::Code::FailedPrecondition);
}

#[test]
fn checkpoint_effects_still_fail_closed() {
    let (owned, coordinators) = graph();
    let mut page = transaction("child", "bank");
    page.participant_transactions[0]
        .uncommitted_idempotent_mutations
        .push(Default::default());
    assert!(validate_graph(&[page], &owned, &coordinators, false).is_err());
}
