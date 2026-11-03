//! Consuming bridge from installed catalog owners to canonical host recovery.
//!
//! Bootstrap, not Recover/request labels, supplies the complete finite inventory
//! (including completed-only owners), original exact resolver and coordinators.
//! Obtain the public frontdoor before consuming the catalog, then register this
//! phase with `ApplicationHost::with_host_recovery`. There is no install handle
//! after consumption and no recovery permission is conferred on a later family.
//! Opaque owner custody is retained, not interpreted as provenance attestation.
use crate::{
    application_host::{HostRecovery, RecoveryCancellation},
    coordinated_local_recovery::{CoordinatedLocalRecovery, LocalCoordinator},
    database_proto as db,
    durable_coordinator::{
        CoordinatorSidecar, ExactParticipantResolver, InProcessParticipantEndpoint,
        ParticipantResolver, ParticipantTarget,
    },
    durable_participant::ParticipantSidecar,
    dynamic_local_catalog::{DynamicLocalCatalog, DynamicLocalOwner},
    one_shot_tasks::MultiOwnerTaskRecovery,
    registered_local::RegisteredLocalDestination,
    registered_local_service::GeneratedLocalTransactionService,
    runtime::DatabaseActorStore,
};
use std::{collections::BTreeMap, sync::Arc};
use tonic::Status;

/// The canonical phase retains additional catalog/registration/service custody
/// on uncertain adoption, even after all outer handles are dropped. Healthy phase
/// Drop releases this additional payload. Original owner/C/permit release is NOT
/// promised: the published registry independently leaks retained owners.
/// Only the underlying canonical phase can adopt, converge and activate tasks;
/// this wrapper has no independent Ready bit or terminal-decision authority.
pub struct CatalogLocalRecovery<
    A,
    P: ParticipantSidecar,
    C: Send + Sync + 'static,
    S: CoordinatorSidecar,
> {
    custody: Arc<CatalogCustody<A, P, C>>,
    recovery: Arc<CoordinatedLocalRecovery<P, S>>,
}

// No Arc back to the inner phase. Bindings retain only their original Weak host
// authority; keeping snapshots alive cannot revive a revoked serving generation.
struct CatalogCustody<A, P: ParticipantSidecar, C: Send + Sync + 'static> {
    catalog: DynamicLocalCatalog<A, P, C>,
    installed:
        BTreeMap<ParticipantTarget, (Arc<DynamicLocalOwner<P, C>>, RegisteredLocalDestination)>,
    resolver: Arc<ExactParticipantResolver<InProcessParticipantEndpoint<P>>>,
}

impl<A, P, C> DynamicLocalCatalog<A, P, C>
where
    A: GeneratedLocalTransactionService + Send + Sync + 'static,
    <A::Service as tower::Service<http::Request<tonic::body::BoxBody>>>::Future: Send + 'static,
    P: ParticipantSidecar,
    C: Send + Sync + 'static,
{
    /// Consume the sole installation capability. Supply the ORIGINAL resolver
    /// already retained by the ORIGINAL coordinators/adapters, not a resolver
    /// rebuilt from catalog labels. The trusted factory must use owner custody.
    /// Every supplied owner must already be published in this catalog; extra
    /// installed owners are rejected too. No canonical IO occurs in construction.
    pub fn into_recovery<S: CoordinatorSidecar>(
        self,
        store: DatabaseActorStore,
        request: db::RecoverRequest,
        owners: impl IntoIterator<Item = Arc<DynamicLocalOwner<P, C>>>,
        coordinators: impl IntoIterator<Item = LocalCoordinator<P, S>>,
        resolver: Arc<ExactParticipantResolver<InProcessParticipantEndpoint<P>>>,
    ) -> Result<CatalogLocalRecovery<A, P, C, S>, Status> {
        let mut installed = BTreeMap::new();
        for owner in owners {
            if installed.len() >= 1024 {
                return Err(Status::resource_exhausted(
                    "catalog recovery owner limit exceeded",
                ));
            }
            let target = owner.participant().actor_target();
            if installed.contains_key(&target) {
                return Err(Status::already_exists("duplicate catalog recovery owner"));
            }
            let (actual, destination) = self.lookup_installed(&target)?;
            validate_installed(&owner, &actual, &destination)?;
            installed.insert(target, (owner, destination));
        }
        self.validate_closed_inventory(installed.keys())?;
        // Build tasks ONLY from installed original bundles. No caller-provided
        // replacement task scope, coordinator reconstruction or resolver minting.
        let tasks = MultiOwnerTaskRecovery::new(
            installed.values().map(|(owner, _)| owner.tasks().clone()),
            request.clone(),
        )?;
        let custody = Arc::new(CatalogCustody {
            catalog: self,
            installed,
            resolver,
        });
        let recovery = CoordinatedLocalRecovery::new_with_custody(
            store,
            request,
            custody
                .installed
                .values()
                .map(|(owner, _)| owner.participant().clone()),
            coordinators,
            custody.resolver.clone(),
            tasks,
            Some(custody.clone()),
        )?;
        Ok(CatalogLocalRecovery { custody, recovery })
    }
}

fn validate_installed<P: ParticipantSidecar, C: Send + Sync + 'static>(
    supplied: &Arc<DynamicLocalOwner<P, C>>,
    actual: &Arc<DynamicLocalOwner<P, C>>,
    destination: &RegisteredLocalDestination,
) -> Result<(), Status> {
    if !Arc::ptr_eq(supplied, actual)
        || !supplied
            .configuration()
            .same_identity_for_ticket(destination.configuration())
        || !actual
            .participant()
            .same_owner_allocation(supplied.participant())
        || !Arc::ptr_eq(actual.endpoint(), supplied.endpoint())
        || !actual.endpoint().owns_participant(
            &supplied.participant().actor_target(),
            supplied.participant(),
        )
    {
        return Err(Status::failed_precondition(
            "catalog recovery requires the installed original owner allocation",
        ));
    }
    actual
        .tasks()
        .validate_participant_owner(supplied.participant())?;
    Ok(())
}

#[tonic::async_trait]
impl<A, P, C, S> HostRecovery for CatalogLocalRecovery<A, P, C, S>
where
    A: GeneratedLocalTransactionService + Send + Sync + 'static,
    <A::Service as tower::Service<http::Request<tonic::body::BoxBody>>>::Future: Send + 'static,
    P: ParticipantSidecar,
    C: Send + Sync + 'static,
    S: CoordinatorSidecar,
{
    async fn start(
        &self,
        supervisor: &mut tokio::task::JoinSet<Result<(), Status>>,
        cancel: RecoveryCancellation,
    ) -> Result<(), Status> {
        // Revalidate actual publication/registration before the delegate can
        // claim tasks, issue Recover, adopt or send any native terminal control.
        // Exact resolver lookup is immutable in-process routing, not database IO.
        for (target, (original, registration)) in &self.custody.installed {
            let (actual, destination) = self.custody.catalog.lookup_installed(target)?;
            validate_installed(original, &actual, &destination)?;
            if !registration
                .binding()
                .same_registration(destination.binding())
                || !Arc::ptr_eq(
                    original.endpoint(),
                    &self.custody.resolver.resolve(target).await?,
                )
            {
                return Err(Status::failed_precondition(
                    "catalog recovery endpoint or registration substituted",
                ));
            }
        }
        // Real phase: canonical successful EOF, pure graph validation, adoption,
        // unprepared Abort ACK barrier, durable coordinator replay/Watch, rescan,
        // original task supervisor activation. Host owns the global Ready barrier.
        self.recovery.start(supervisor, cancel).await
    }
}
