// Included by registered_local.rs. All publication paths share the same lock.
struct LocalRegistrationReservation {
    host: Weak<()>,
    gate: tokio::sync::watch::Receiver<HostLocalState>,
    state: Arc<std::sync::Mutex<LocalRegistryState>>,
    target: ParticipantTarget,
    token: Arc<()>,
}
impl LocalRegistrationReservation {
    fn new(
        host: Weak<()>,
        gate: tokio::sync::watch::Receiver<HostLocalState>,
        state: Arc<std::sync::Mutex<LocalRegistryState>>,
        target: ParticipantTarget,
    ) -> Result<Self, tonic::Status> {
        let token = Arc::new(());
        {
            // Gate before registry is the lock order used by publication too.
            let observed = gate.borrow();
            if host.upgrade().is_none() || *observed == HostLocalState::Revoked {
                return Err(tonic::Status::cancelled("local registration generation revoked"));
            }
            let mut registry = state.lock().expect("local registry poisoned");
            if registry.registrations.contains_key(&target)
                || registry.reservations.contains_key(&target)
            {
                return Err(tonic::Status::already_exists("local adapter target already registered or reserved"));
            }
            if registry.registrations.len() + registry.reservations.len() >= 1024 {
                return Err(tonic::Status::resource_exhausted("local adapter registry capacity exceeded"));
            }
            registry.reservations.insert(target.clone(), token.clone());
        }
        Ok(Self { host, gate, state, target, token })
    }
    fn binding(&self, configuration: GeneratedLocalAdapterConfig) -> RegisteredAdapterBinding {
        RegisteredAdapterBinding {
            host: self.host.clone(), registration: self.token.clone(),
            committed: Arc::new(std::sync::atomic::AtomicBool::new(false)),
            configuration, gate: self.gate.clone(), directory: Arc::downgrade(&self.state),
        }
    }
    fn retain<O: Send + Sync + 'static>(&self, owner: Arc<O>, permit: tokio::sync::OwnedSemaphorePermit, family: Arc<()>) {
        let mut state = self.state.lock().expect("local registry poisoned");
        // This is the first operation after reservation, BEFORE factory or
        // cleanup callbacks. Panic/error/revocation cannot release this owner.
        state.retained.insert(self.target.clone(), RetainedLocalOwner(Some(Arc::new((owner, permit, family)))));
    }
    fn publish(
        self,
        binding: RegisteredAdapterBinding,
        service: Option<crate::registered_local_service::RegisteredServiceTemplate>,
    ) -> Result<(), tonic::Status> {
        let _host = self.host.upgrade().ok_or_else(|| tonic::Status::cancelled("local host absent"))?;
        let observed = self.gate.borrow();
        if *observed == HostLocalState::Revoked {
            return Err(tonic::Status::cancelled("local registration generation revoked"));
        }
        let mut state = self.state.lock().expect("local registry poisoned");
        if !state.reservations.get(&self.target).is_some_and(|token| Arc::ptr_eq(token, &self.token)) {
            return Err(tonic::Status::failed_precondition("local registration reservation changed"));
        }
        if let Some(service) = service {
            state.services.insert(self.target.clone(), RegisteredLocalDestination { binding: binding.clone(), service });
        }
        state.registrations.insert(self.target.clone(), binding.clone());
        state.reservations.remove(&self.target);
        // Escaped bindings cannot validate before BOTH entries and retained
        // owner exist. Readers either see the whole publication or nothing.
        binding.committed.store(true, std::sync::atomic::Ordering::Release);
        Ok(())
    }
}
impl Drop for LocalRegistrationReservation {
    fn drop(&mut self) {
        let mut state = self.state.lock().expect("local registry poisoned");
        if !state.retained.contains_key(&self.target)
            && state.reservations.get(&self.target).is_some_and(|token| Arc::ptr_eq(token, &self.token))
        {
            state.reservations.remove(&self.target);
        }
        // An attached owner, including failed/panicked install, keeps the
        // reservation and global quota. No implicit uncertain-generation reuse.
    }
}
fn local_service_template<A>(adapter: &A) -> crate::registered_local_service::RegisteredServiceTemplate
where
    A: crate::registered_local_service::GeneratedLocalTransactionService,
    <A::Service as tower::Service<http::Request<tonic::body::BoxBody>>>::Future: Send + 'static,
{
    crate::registered_local_service::RegisteredServiceTemplate::new(tower::Layer::layer(
        &crate::successful_trailers::SuccessfulParticipantTrailerLayer, adapter.local_service(),
    )).with_inbound_factory(adapter.local_inbound_factory())
}

/// Trusted host-composition capability, minted before bind. The factory and
/// service family are immutable; incoming requests cannot supply a registrar,
/// policy, database endpoint, method set or adapter incarnation. O is the exact
/// host-supplied bundle, NOT an actor identity reconstructed from strings.
///
/// This primitive does not validate task ownership or adopt recovery state.
/// A taskful catalog must provide its original participant/task bundle through
/// the configured typed factory; registering a service alone never enables
/// constructor children, task dispatch, recovery-control eligibility or Wait.
#[doc(hidden)]
pub struct LateLocalServiceFamily<A, O> {
    host: Weak<()>,
    state: Weak<std::sync::Mutex<LocalRegistryState>>,
    gate: tokio::sync::watch::Receiver<HostLocalState>,
    family: Arc<()>,
    fixed: GeneratedLocalAdapterConfig,
    cleanup: crate::application_host::ParticipantCleanupBinding,
    permits: Arc<tokio::sync::Semaphore>,
    factory: Arc<dyn Fn(Arc<O>) -> Result<A, tonic::Status> + Send + Sync>,
}
impl<A, O> LateLocalServiceFamily<A, O>
where
    A: crate::registered_local_service::GeneratedLocalTransactionService,
    <A::Service as tower::Service<http::Request<tonic::body::BoxBody>>>::Future: Send + 'static,
    O: Send + Sync + 'static,
{
    /// Exact installed bundle and service under one publication lock. Trusted
    /// recovery/control composition only: this does NOT make an unadopted owner
    /// recovery-eligible and does NOT bypass public Ready or generated policy.
    pub fn lookup_installed(&self, target: &ParticipantTarget) -> Result<(Arc<O>, RegisteredLocalDestination), tonic::Status> {
        let _host = self.host.upgrade().ok_or_else(|| tonic::Status::cancelled("local host absent"))?;
        let observed = self.gate.borrow();
        if *observed == HostLocalState::Revoked {
            return Err(tonic::Status::cancelled("local registration generation revoked"));
        }
        let state = self.state.upgrade().ok_or_else(|| tonic::Status::cancelled("local registry absent"))?;
        let state = state.lock().expect("local registry poisoned");
        let destination = state.services.get(target).ok_or_else(|| tonic::Status::unavailable("late local service not installed"))?;
        let retained = state.retained.get(target).and_then(|entry| entry.0.as_ref())
            .and_then(|entry| entry.downcast_ref::<(Arc<O>, tokio::sync::OwnedSemaphorePermit, Arc<()>)>())
            .filter(|entry| Arc::ptr_eq(&entry.2, &self.family))
            .ok_or_else(|| tonic::Status::failed_precondition("late owner belongs to another family"))?;
        let registration = state.registrations.get(target)
            .ok_or_else(|| tonic::Status::failed_precondition("installed registration absent"))?;
        let config = destination.configuration();
        if !Weak::ptr_eq(&self.host, &destination.binding.host)
            || !registration.same_registration(&destination.binding)
            || !registration.configuration.same_identity(config)
            || config.target != *target
            || config.target.state_type != self.fixed.target.state_type
            || config.database_endpoint != self.fixed.database_endpoint
            || config.methods != self.fixed.methods
            || !config.policy.same_entry_identity(&self.fixed.policy)
        {
            return Err(tonic::Status::failed_precondition("installed late family identity changed"));
        }
        destination.binding.validate_configuration(config)?;
        Ok((retained.0.clone(), destination.clone()))
    }

    /// No await/user callback precedes host custody. A factory error or panic
    /// seals this exact target until restart; it is NOT evidence of no effects.
    /// Factory must return an adapter retaining the supplied exact allocations.
    pub fn install(&self, target: ParticipantTarget, owner: Arc<O>) -> Result<RegisteredLocalDestination, tonic::Status> {
        if target.state_type != self.fixed.target.state_type || target.state_ref.is_empty() {
            return Err(tonic::Status::invalid_argument("late local target outside fixed service family"));
        }
        let permit = self.permits.clone().try_acquire_owned().map_err(|_| tonic::Status::resource_exhausted("late local family capacity exceeded"))?;
        let state = self.state.upgrade().ok_or_else(|| tonic::Status::cancelled("local host absent"))?;
        let reservation = LocalRegistrationReservation::new(self.host.clone(), self.gate.clone(), state, target.clone())?;
        reservation.retain(owner.clone(), permit, self.family.clone());
        let adapter = (self.factory)(owner)?;
        adapter.bind_participant_cleanup(&self.cleanup)?;
        let config = adapter.local_configuration()?;
        config.validate()?;
        if config.target != target
            || config.database_endpoint != self.fixed.database_endpoint
            || config.methods != self.fixed.methods
            || !config.policy.same_entry_identity(&self.fixed.policy)
        {
            return Err(tonic::Status::failed_precondition("late adapter differs from fixed service family"));
        }
        let binding = reservation.binding(config.clone());
        let registered = adapter.with_local_registration(binding.clone())?;
        if !config.same_identity(&registered.local_configuration()?) {
            return Err(tonic::Status::failed_precondition("adapter configuration changed during late registration"));
        }
        let service = local_service_template(&registered);
        reservation.publish(binding.clone(), Some(service.clone()))?;
        Ok(RegisteredLocalDestination { binding, service })
    }
}
impl HostLocalRegistry {
    pub(crate) fn late_service_family<A, O>(
        &mut self, fixed: GeneratedLocalAdapterConfig, capacity: usize,
        cleanup: crate::application_host::ParticipantCleanupBinding,
        factory: impl Fn(Arc<O>) -> Result<A, tonic::Status> + Send + Sync + 'static,
    ) -> Result<LateLocalServiceFamily<A, O>, tonic::Status>
    where
        A: crate::registered_local_service::GeneratedLocalTransactionService,
        <A::Service as tower::Service<http::Request<tonic::body::BoxBody>>>::Future: Send + 'static,
        O: Send + Sync + 'static,
    {
        fixed.validate()?;
        if capacity == 0 || capacity > 1024 {
            return Err(tonic::Status::invalid_argument("late local family capacity must be 1..=1024"));
        }
        if *self.gate.borrow() != HostLocalState::Starting {
            return Err(tonic::Status::failed_precondition("late service family must be configured before host readiness"));
        }
        Ok(LateLocalServiceFamily {
            host: Arc::downgrade(&self.identity), state: Arc::downgrade(&self.services),
            gate: self.gate.subscribe(), family: Arc::new(()), fixed, cleanup,
            permits: Arc::new(tokio::sync::Semaphore::new(capacity)), factory: Arc::new(factory),
        })
    }
}

/// Fixed public router for an installed late family. Routing is not authority:
/// the original generated adapter still validates policy, placement, factory,
/// tickets and host readiness. Mount once with ApplicationHost::add_public_service.
#[doc(hidden)]
pub struct LateLocalServiceFrontdoor<A, O> {
    family: Arc<LateLocalServiceFamily<A, O>>,
}
impl<A, O> Clone for LateLocalServiceFrontdoor<A, O> {
    fn clone(&self) -> Self { Self { family: self.family.clone() } }
}
impl<A, O> tonic::server::NamedService for LateLocalServiceFrontdoor<A, O>
where A: crate::registered_local_service::GeneratedLocalTransactionService,
      A::Service: tonic::server::NamedService,
{
    const NAME: &'static str = <A::Service as tonic::server::NamedService>::NAME;
}
impl<A, O> LateLocalServiceFamily<A, O>
where A: crate::registered_local_service::GeneratedLocalTransactionService + 'static,
      A::Service: tonic::server::NamedService,
      <A::Service as tower::Service<http::Request<tonic::body::BoxBody>>>::Future: Send + 'static,
      O: Send + Sync + 'static,
{
    /// Lookup-only public frontdoor. The generated service type supplies its
    /// real name; no fallback name or request-supplied service is accepted.
    pub fn public_frontdoor(&self) -> Result<LateLocalServiceFrontdoor<A, O>, tonic::Status> {
        let name = <A::Service as tonic::server::NamedService>::NAME;
        if name.is_empty() || self.fixed.methods.iter().any(|method| {
            method.strip_prefix(name).and_then(|s| s.strip_prefix('.'))
                .is_none_or(|s| s.is_empty() || !s.bytes().all(|c| c.is_ascii_alphanumeric() || c == b'_'))
        }) {
            return Err(tonic::Status::failed_precondition("fixed methods differ from generated NamedService"));
        }
        Ok(LateLocalServiceFrontdoor { family: Arc::new(LateLocalServiceFamily {
            host: self.host.clone(), state: self.state.clone(), gate: self.gate.clone(),
            family: self.family.clone(), fixed: self.fixed.clone(), cleanup: self.cleanup.clone(),
            permits: self.permits.clone(), factory: self.factory.clone(),
        }) })
    }
}
impl<A, O> tower::Service<http::Request<tonic::body::BoxBody>> for LateLocalServiceFrontdoor<A, O>
where A: crate::registered_local_service::GeneratedLocalTransactionService + 'static,
      A::Service: tonic::server::NamedService,
      <A::Service as tower::Service<http::Request<tonic::body::BoxBody>>>::Future: Send + 'static,
      O: Send + Sync + 'static,
{
    type Response = http::Response<tonic::body::BoxBody>;
    type Error = std::convert::Infallible;
    type Future = crate::registered_local_service::LocalServiceFuture;
    fn poll_ready(&mut self, _: &mut std::task::Context<'_>) -> std::task::Poll<Result<(), Self::Error>> {
        // Destination is selected per request; its own readiness is awaited in call.
        std::task::Poll::Ready(Ok(()))
    }
    fn call(&mut self, request: http::Request<tonic::body::BoxBody>) -> Self::Future {
        let family = self.family.clone();
        Box::pin(async move {
            let result = async {
                let target = crate::registered_local_service::public_route_target(
                    &request, <A::Service as tonic::server::NamedService>::NAME,
                    &family.fixed.target.state_type, &family.fixed.methods,
                )?;
                let (owner, destination) = family.lookup_installed(&target)?;
                destination.binding.require_host_ready(destination.configuration())?;
                let mut service = destination.service.clone_service();
                std::future::poll_fn(|cx| tower::Service::poll_ready(&mut service, cx)).await.unwrap();
                // Readiness can yield. Revalidate exact installed allocation and
                // binding/generation, without retaining a synchronous gate lock.
                let (current_owner, current) = family.lookup_installed(&target)?;
                if !Arc::ptr_eq(&owner, &current_owner)
                    || !destination.binding.same_registration(&current.binding) {
                    return Err(tonic::Status::failed_precondition("late destination changed while awaiting readiness"));
                }
                current.binding.require_host_ready(current.configuration())?;
                // Move the ORIGINAL HTTP request, not reconstructed Tonic metadata.
                // Body, opaque extensions, auth and tickets reach the adapter intact.
                Ok::<_, tonic::Status>(tower::Service::call(&mut service, request).await.unwrap())
            }.await;
            Ok(result.unwrap_or_else(tonic::Status::into_http))
        })
    }
}
#[cfg(test)]
mod frontdoor_tests { include!("registered_local_frontdoor_tests.rs"); }
