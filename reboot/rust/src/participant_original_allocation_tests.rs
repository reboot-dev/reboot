// Included in durable_participant::tests to inspect real registry allocations.
#[tokio::test]
async fn original_owner_identity_accepts_clones_and_checks_every_shared_allocation() {
    let sidecar = Arc::new(MockSidecar::default());
    let owner = DurableActorParticipant::new(sidecar.clone(), "example.Actor", "actor/1");
    assert!(owner.same_owner_allocation(&owner.clone()));

    let mut altered = owner.clone();
    altered.pending = Arc::new(PendingRegistry::default());
    assert!(!owner.same_owner_allocation(&altered));
    let mut altered = owner.clone();
    altered.admissions = Arc::new(std::sync::Mutex::new(std::collections::HashMap::new()));
    assert!(!owner.same_owner_allocation(&altered));
    let mut altered = owner.clone();
    altered.cleanup_binding = Arc::new(std::sync::Mutex::new((None, false)));
    assert!(!owner.same_owner_allocation(&altered));
    let mut altered = owner.clone();
    altered.sidecar = Arc::new(MockSidecar::default());
    assert!(!owner.same_owner_allocation(&altered));
    let mut altered = owner.clone();
    altered.changed = Arc::new(tokio::sync::Notify::new());
    assert!(!owner.same_owner_allocation(&altered));
    let mut altered = owner.clone();
    altered.lock = ParticipantActorGate::new();
    assert!(!owner.same_owner_allocation(&altered));
    let mut altered = owner.clone();
    altered.state_type = "example.Other".into();
    assert!(!owner.same_owner_allocation(&altered));
    let mut altered = owner.clone();
    altered.state_ref = "actor/2".into();
    assert!(!owner.same_owner_allocation(&altered));
    assert!(sidecar.calls.lock().unwrap().is_empty());
}

#[tokio::test]
async fn independently_created_original_owners_reject_even_on_the_same_store_gate() {
    let endpoint = format!("http://original-owner-{}.invalid:9999", Uuid::new_v4());
    let store = crate::runtime::DatabaseActorStore::connect_lazy(&endpoint).unwrap();
    let sidecar = Arc::new(MockSidecar::default());
    let owner = DurableActorParticipant::new(sidecar.clone(), "example.Actor", "actor/1")
        .with_database_actor_gate(&store);
    let independent = DurableActorParticipant::new(sidecar.clone(), "example.Actor", "actor/1")
        .with_database_actor_gate(&store);
    assert!(store.owns_actor_gate(&owner.lock.gate(), "example.Actor", "actor/1"));
    assert!(store.owns_actor_gate(&independent.lock.gate(), "example.Actor", "actor/1"));
    assert!(!owner.same_owner_allocation(&independent));
    // Even sharing the whole binding cannot turn different registries into aliases.
    let mut independent = independent;
    independent.lock = owner.lock.clone();
    assert!(!Arc::ptr_eq(&owner.pending, &independent.pending));
    assert!(!Arc::ptr_eq(&owner.admissions, &independent.admissions));
    assert!(!owner.same_owner_allocation(&independent));
    assert!(owner.same_owner_allocation(&owner.clone()));
    assert!(sidecar.calls.lock().unwrap().is_empty());
}
