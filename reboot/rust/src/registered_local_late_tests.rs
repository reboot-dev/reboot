// Included inside registered_local::tests; reuse actual generated-service test
// adapter, not a parallel mock registry. Source-only: parent must execute these.
#[test]
fn late_install_publishes_exact_owner_service_and_binding_together() {
    let mut host = crate::application_host::ApplicationHost::new("late-foundation");
    let owner = Arc::new(adapter());
    let config = owner.config.clone();
    let family = host.register_late_local_service_family(config.clone(), 2,
        |owner: Arc<Adapter>| Ok((*owner).clone())).unwrap();
    assert!(family.lookup_installed(&config.target).is_err());
    let destination = family.install(config.target.clone(), owner.clone()).unwrap();
    assert_eq!(host.registered_transaction_adapter_count(), 1);
    assert_eq!(host.registered_transaction_service_count(), 1);
    let (retained, found) = family.lookup_installed(&config.target).unwrap();
    assert!(Arc::ptr_eq(&owner, &retained));
    assert!(found.binding().same_registration(destination.binding()));
    assert!(found.service().inbound_factory().is_some());
    assert_eq!(found.binding().require_host_ready(&config).unwrap_err().code(), tonic::Code::Unavailable);
    assert!(family.install(config.target.clone(), owner).is_err());
    drop(host);
    assert!(family.lookup_installed(&config.target).is_err());
    assert!(destination.binding().validate_configuration(&config).is_err());
}

#[test]
fn failed_late_factory_retains_original_owner_and_both_capacity_permits() {
    let mut host = crate::application_host::ApplicationHost::new("failed-late-foundation");
    let owner = Arc::new(adapter());
    let weak = Arc::downgrade(&owner);
    let config = owner.config.clone();
    let family = host.register_late_local_service_family(config.clone(), 1,
        |_owner: Arc<Adapter>| -> Result<Adapter, tonic::Status> { Err(tonic::Status::aborted("uncertain factory")) }).unwrap();
    assert!(family.install(config.target.clone(), owner).is_err());
    assert!(weak.upgrade().is_some());
    assert_eq!(host.registered_transaction_adapter_count(), 0);
    assert_eq!(host.registered_transaction_service_count(), 0);
    assert!(family.lookup_installed(&config.target).is_err());
    let mut another = adapter();
    another.config.target.state_ref = "another".into();
    assert_eq!(family.install(another.config.target.clone(), Arc::new(another)).err().unwrap().code(), tonic::Code::ResourceExhausted);
    // The same reserved target cannot be replaced by static registration either.
    assert_eq!(host.register_transaction_adapter(adapter()).err().unwrap().code(), tonic::Code::AlreadyExists);
    drop(host);
    assert!(weak.upgrade().is_some(), "uncertainty survives host destruction until process exit");
}

#[test]
fn late_family_rejects_changed_endpoint_and_post_binding_configuration() {
    let mut host = crate::application_host::ApplicationHost::new("identity-late-foundation");
    let original = adapter();
    let config = original.config.clone();
    let family = host.register_late_local_service_family(config.clone(), 2,
        |owner: Arc<Adapter>| Ok((*owner).clone())).unwrap();
    let mut changed = original.clone();
    changed.config.database_endpoint.push_str("/wrong");
    assert!(family.install(config.target.clone(), Arc::new(changed)).is_err());
    assert_eq!(host.registered_transaction_service_count(), 0);
    let mut changed = original;
    changed.config.target.state_ref = "mutated-incarnation".into();
    changed.mutate = true;
    assert!(family.install(changed.config.target.clone(), Arc::new(changed)).is_err());
    assert_eq!(host.registered_transaction_service_count(), 0);
}

#[test]
fn registration_reservation_rollback_duplicate_global_capacity_and_revocation() {
    let registry = HostLocalRegistry::default();
    let target = adapter().config.target;
    let first = registry.reserve(target.clone()).unwrap();
    assert_eq!(registry.reserve(target.clone()).err().unwrap().code(), tonic::Code::AlreadyExists);
    drop(first); // no owner, no effects: reusable
    let mut reservations = Vec::new();
    for i in 0..1024 {
        let mut target = target.clone();
        target.state_ref = format!("reserved-{i}");
        reservations.push(registry.reserve(target).unwrap());
    }
    assert_eq!(registry.reserve(target.clone()).err().unwrap().code(), tonic::Code::ResourceExhausted);
    drop(reservations);
    let reservation = registry.reserve(target.clone()).unwrap();
    let mut config = adapter().config;
    config.target = target;
    let escaped = reservation.binding(config.clone());
    assert!(escaped.validate_configuration(&config).is_err());
    registry.revoke();
    assert_eq!(reservation.publish(escaped.clone(), None).unwrap_err().code(), tonic::Code::Cancelled);
    assert!(escaped.validate_configuration(&config).is_err());
    assert_eq!(registry.len(), 0);
}

#[test]
fn panicking_factory_never_releases_owner_or_publishes_partial_service() {
    let mut host = crate::application_host::ApplicationHost::new("panic-late-foundation");
    let owner = Arc::new(adapter());
    let weak = Arc::downgrade(&owner);
    let target = owner.config.target.clone();
    let family = host.register_late_local_service_family(owner.config.clone(), 1,
        |_owner: Arc<Adapter>| -> Result<Adapter, tonic::Status> { panic!("factory interrupted") }).unwrap();
    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| family.install(target.clone(), owner)));
    assert!(result.is_err());
    assert!(weak.upgrade().is_some());
    assert!(family.lookup_installed(&target).is_err());
    assert_eq!(host.registered_transaction_adapter_count(), 0);
    assert_eq!(host.registered_transaction_service_count(), 0);
    assert!(host.register_transaction_adapter(adapter()).is_err());
}
