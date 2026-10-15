//! Exact-owner installation over the real host late-registration authority.
//!
//! This is a callable composition foundation, not dynamic graph recovery. It
//! never discovers actors from request labels, adopts Pending state, starts task
//! dispatch, or enables constructor tasks. Control lookup is composition only.
use crate::{
    application_host::ApplicationHost,
    durable_coordinator::{InProcessParticipantEndpoint, ParticipantResolver, ParticipantTarget},
    durable_participant::{DurableActorParticipant, ParticipantSidecar},
    one_shot_tasks::OneShotTasks,
    registered_local::{
        GeneratedLocalAdapterConfig, LateLocalServiceFamily, RegisteredLocalDestination,
    },
    registered_local_service::GeneratedLocalTransactionService,
};
use std::{future::Future, pin::Pin, sync::Arc};
type CatalogFuture<'a, T> = Pin<Box<dyn Future<Output = Result<T, Status>> + Send + 'a>>;
use tonic::Status;

/// Original participant, task allocation and concrete endpoint, retained as one
/// host-owned allocation. C retains the application's original resolver,
/// placement/policy/generation or other lifecycle owners, NOT identity labels.
/// No replacement tasks, gates, endpoints or policies are manufactured here.
pub struct DynamicLocalOwner<P: ParticipantSidecar, C: Send + Sync + 'static> {
    configuration: GeneratedLocalAdapterConfig,
    participant: DurableActorParticipant<P>,
    tasks: OneShotTasks,
    endpoint: Arc<InProcessParticipantEndpoint<P>>,
    custody: C,
}
impl<P: ParticipantSidecar, C: Send + Sync + 'static> DynamicLocalOwner<P, C> {
    pub fn new(
        configuration: GeneratedLocalAdapterConfig,
        participant: DurableActorParticipant<P>,
        tasks: OneShotTasks,
        endpoint: Arc<InProcessParticipantEndpoint<P>>,
        custody: C,
    ) -> Result<Arc<Self>, Status> {
        if configuration.target != participant.actor_target()
            || participant.database_endpoint() != Some(configuration.database_endpoint.as_str())
            || !endpoint.owns_participant(&configuration.target, &participant)
        {
            return Err(Status::failed_precondition(
                "dynamic owner must retain the original participant endpoint",
            ));
        }
        tasks.validate_participant_owner(&participant)?;
        Ok(Arc::new(Self {
            configuration,
            participant,
            tasks,
            endpoint,
            custody,
        }))
    }
    pub fn configuration(&self) -> &GeneratedLocalAdapterConfig {
        &self.configuration
    }
    pub fn participant(&self) -> &DurableActorParticipant<P> {
        &self.participant
    }
    pub fn tasks(&self) -> &OneShotTasks {
        &self.tasks
    }
    pub fn endpoint(&self) -> &Arc<InProcessParticipantEndpoint<P>> {
        &self.endpoint
    }
    pub fn custody(&self) -> &C {
        &self.custody
    }
}

/// A fixed host-configured family. The host's single publication lock publishes
/// retained owner, original binding and actual generated service atomically.
/// Failed/panicked installs retain original owner AND capacity until exit.
/// C is opaque custody: this API does not attest arbitrary callback semantics
/// or certify placement; generated adapters keep all existing admission checks.
/// Public lookup-only frontdoor for the original installed owner bundle.
pub type DynamicLocalFrontdoor<A, P, C> = crate::registered_local::LateLocalServiceFrontdoor<
    CatalogAdapter<A, P, C>,
    DynamicLocalOwner<P, C>,
>;

pub struct DynamicLocalCatalog<A, P: ParticipantSidecar, C: Send + Sync + 'static> {
    family: LateLocalServiceFamily<CatalogAdapter<A, P, C>, DynamicLocalOwner<P, C>>,
}

/// Internal generated-service carrier. Binding cleanup always binds the actual
/// retained participant, even if a custom adapter uses the default no-op hook.
#[doc(hidden)]
pub struct CatalogAdapter<A, P: ParticipantSidecar, C: Send + Sync + 'static> {
    adapter: A,
    owner: Arc<DynamicLocalOwner<P, C>>,
}
impl<A: Clone, P: ParticipantSidecar, C: Send + Sync + 'static> Clone for CatalogAdapter<A, P, C> {
    fn clone(&self) -> Self {
        Self {
            adapter: self.adapter.clone(),
            owner: self.owner.clone(),
        }
    }
}

impl<A, P, C> crate::registered_local::GeneratedLocalTransactionAdapter for CatalogAdapter<A, P, C>
where
    A: GeneratedLocalTransactionService,
    P: ParticipantSidecar,
    C: Send + Sync + 'static,
{
    fn local_configuration(&self) -> Result<GeneratedLocalAdapterConfig, Status> {
        self.adapter.local_configuration()
    }
    fn bind_participant_cleanup(
        &self,
        binding: &crate::application_host::ParticipantCleanupBinding,
    ) -> Result<(), Status> {
        self.owner.participant.bind_host_cleanup(binding)?;
        self.adapter.bind_participant_cleanup(binding)
    }
    fn with_local_registration(
        self,
        binding: crate::registered_local::RegisteredAdapterBinding,
    ) -> Result<Self, Status> {
        Ok(Self {
            adapter: self.adapter.with_local_registration(binding)?,
            owner: self.owner,
        })
    }
}
impl<A, P, C> GeneratedLocalTransactionService for CatalogAdapter<A, P, C>
where
    A: GeneratedLocalTransactionService,
    P: ParticipantSidecar,
    C: Send + Sync + 'static,
{
    type Service = A::Service;
    fn local_service(&self) -> Self::Service {
        self.adapter.local_service()
    }
    fn local_inbound_factory(&self) -> Arc<dyn crate::runtime::InboundTransactionStartFactory> {
        self.adapter.local_inbound_factory()
    }
}
impl<A, P, C> DynamicLocalCatalog<A, P, C>
where
    A: GeneratedLocalTransactionService + 'static,
    <A::Service as tower::Service<http::Request<tonic::body::BoxBody>>>::Future: Send + 'static,
    P: ParticipantSidecar,
    C: Send + Sync + 'static,
{
    /// Call on the real host before bind. The trusted factory must build the
    /// adapter from the supplied participant/tasks, not reconstruct equivalents.
    /// Configuration allocation identity is rechecked before publication.
    pub fn register(
        host: &mut ApplicationHost,
        fixed: GeneratedLocalAdapterConfig,
        capacity: usize,
        factory: impl Fn(Arc<DynamicLocalOwner<P, C>>) -> Result<A, Status> + Send + Sync + 'static,
    ) -> Result<Self, Status> {
        let family = host.register_late_local_service_family(
            fixed,
            capacity,
            move |owner: Arc<DynamicLocalOwner<P, C>>| {
                owner.tasks.validate_participant_owner(&owner.participant)?;
                let adapter = factory(owner.clone())?;
                if !adapter
                    .local_configuration()?
                    .same_identity_for_ticket(&owner.configuration)
                {
                    return Err(Status::failed_precondition(
                        "dynamic adapter changed original owner configuration",
                    ));
                }
                Ok(CatalogAdapter { adapter, owner })
            },
        )?;
        Ok(Self { family })
    }
    /// Exact target is derived from the retained participant, never supplied by
    /// an HTTP/recovery request. Host custody precedes the first user callback.
    pub fn install(
        &self,
        owner: Arc<DynamicLocalOwner<P, C>>,
    ) -> Result<RegisteredLocalDestination, Status> {
        self.family.install(owner.participant.actor_target(), owner)
    }
    /// Available during beforeReady for trusted recovery composition only.
    /// This is NOT recovery-control eligibility or permission to execute tasks.
    pub fn lookup_installed(
        &self,
        target: &ParticipantTarget,
    ) -> Result<(Arc<DynamicLocalOwner<P, C>>, RegisteredLocalDestination), Status> {
        self.family.lookup_installed(target)
    }
    pub fn public_frontdoor(&self) -> Result<DynamicLocalFrontdoor<A, P, C>, Status>
    where
        A::Service: tonic::server::NamedService,
    {
        self.family.public_frontdoor()
    }
}

/// Resolver routes only installed original concrete endpoints. Resolving is
/// composition, not recovery eligibility: callers must perform canonical graph
/// adoption before control calls. Unknown targets fail closed; no lazy creation.
impl<A, P, C> ParticipantResolver for DynamicLocalCatalog<A, P, C>
where
    A: GeneratedLocalTransactionService + Send + Sync + 'static,
    <A::Service as tower::Service<http::Request<tonic::body::BoxBody>>>::Future: Send + 'static,
    P: ParticipantSidecar,
    C: Send + Sync + 'static,
{
    type Endpoint = InProcessParticipantEndpoint<P>;
    fn resolve(&self, target: &ParticipantTarget) -> CatalogFuture<'_, Arc<Self::Endpoint>> {
        let result = self
            .lookup_installed(target)
            .map(|(owner, _)| owner.endpoint.clone());
        Box::pin(async move { result })
    }
}

#[cfg(test)]
#[path = "dynamic_local_catalog_tests.rs"]
mod tests;
