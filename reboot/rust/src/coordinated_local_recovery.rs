//! Canonical recovery phase for an explicitly supplied, closed LOCAL owner graph.
//!
//! Host recovery validates one canonical snapshot before adoption, retains exact
//! participant/binding/resolver allocations, converges the closed owned graph,
//! and activates the original task supervisor before host Ready. Provisional
//! task/checkpoint graphs and cursor task recovery remain explicitly refused.
//! Calling converge alone does not activate tasks or grant readiness.
//! Completed-only identities must be supplied; Recover is not an actor index.
use crate::{
    application_host::{ParticipantCleanupBinding, RecoveryCancellation},
    database_proto as db,
    durable_coordinator::{
        CoordinatorSidecar, DurableRootCoordinator, ExactParticipantResolver,
        InProcessParticipantEndpoint, ParticipantTarget,
    },
    durable_participant::{DurableActorParticipant, ParticipantSidecar},
    legacy_coordinator::{
        CoordinatorWatchEndpoint, CoordinatorWatchFuture, DurableCoordinatorWatchHost,
    },
    one_shot_tasks::{CommittedTaskPartitions, MultiOwnerTaskRecovery, PreparedSharedTaskStartup},
    runtime::DatabaseActorStore,
};
use prost::Message;
use std::{
    collections::{BTreeMap, BTreeSet},
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
    },
};
use tonic::Status;

const MAX_OWNERS: usize = 1024;
const MAX_RECORDS: usize = 4096;
const MAX_BYTES: usize = 16 * 1024 * 1024;

/// Exact coordinator runtime/resolver already used by the application's adapter.
/// Coordinator records identify state_ref only; ambiguous refs are rejected.
type LocalResolver<P> = ExactParticipantResolver<InProcessParticipantEndpoint<P>>;

pub struct LocalCoordinator<P: ParticipantSidecar, C: CoordinatorSidecar> {
    pub target: ParticipantTarget,
    pub owner: DurableRootCoordinator<C, LocalResolver<P>>,
}

/// Own this phase in the host registration, never in a transient startup future.
/// Original participants (and their gates), coordinator resolver, Watch and task
/// scope are retained together. Canonical records may select only supplied owners.
pub struct CoordinatedLocalRecovery<P: ParticipantSidecar, C: CoordinatorSidecar> {
    store: DatabaseActorStore,
    request: db::RecoverRequest,
    participants: BTreeMap<ParticipantTarget, DurableActorParticipant<P>>,
    coordinators: BTreeMap<String, LocalCoordinator<P, C>>,
    resolver: Arc<LocalResolver<P>>,
    tasks: MultiOwnerTaskRecovery,
    // Retained by the host-owned phase even if the startup future is cancelled.
    prepared_tasks: std::sync::Mutex<Option<Arc<PreparedSharedTaskStartup>>>,
    started: AtomicBool,
}

// The HOST must retain the original phase across cancellation. As a last-resort
// uncertainty fallback, retain process-lifetime custody ONLY if adoption began
// but did not converge. Pure validation and successful convergence do not leak.
struct Custody<T> {
    owner: Option<Arc<T>>,
    uncertain: bool,
}
impl<T> Drop for Custody<T> {
    fn drop(&mut self) {
        if self.uncertain
            && let Some(owner) = self.owner.take()
        {
            std::mem::forget(owner);
        }
    }
}

/// Evidence of graph convergence only. Intentionally exposes no readiness bit,
/// task activation or conversion into HostRecovery.
pub struct ConvergedLocalOwners<P: ParticipantSidecar, C: CoordinatorSidecar> {
    _custody: Custody<CoordinatedLocalRecovery<P, C>>,
    _committed: CommittedTaskPartitions,
}

impl<P: ParticipantSidecar, C: CoordinatorSidecar> CoordinatedLocalRecovery<P, C> {
    pub fn new(
        store: DatabaseActorStore,
        request: db::RecoverRequest,
        participants: impl IntoIterator<Item = DurableActorParticipant<P>>,
        coordinators: impl IntoIterator<Item = LocalCoordinator<P, C>>,
        resolver: Arc<LocalResolver<P>>,
        tasks: MultiOwnerTaskRecovery,
    ) -> Result<Arc<Self>, Status> {
        if request.shard_ids.is_empty() || !request.skip_idempotent_mutations {
            return Err(Status::invalid_argument(
                "exact recovery shards and skip_idempotent_mutations required",
            ));
        }
        let mut exact = BTreeMap::new();
        for participant in participants {
            let target = participant.actor_target();
            if target.state_type.is_empty()
                || target.state_ref.is_empty()
                || !request
                    .state_tags_by_state_type
                    .contains_key(&target.state_type)
                || participant.database_endpoint() != Some(store.database_endpoint())
            {
                return Err(Status::invalid_argument(
                    "participant recovery authority/scope mismatch",
                ));
            }
            if exact.len() >= MAX_OWNERS {
                return Err(Status::resource_exhausted("too many local recovery owners"));
            }
            if exact.insert(target, participant).is_some() {
                return Err(Status::already_exists("duplicate local participant"));
            }
        }
        if exact.is_empty() {
            return Err(Status::invalid_argument(
                "local recovery requires participants",
            ));
        }
        resolver.validate_original_participants(&exact)?;
        let mut roots = BTreeMap::new();
        for coordinator in coordinators {
            coordinator
                .owner
                .validate_local_recovery_identity(&coordinator.target)?;
            if !Arc::ptr_eq(&resolver, &coordinator.owner.resolver())
                || !exact.contains_key(&coordinator.target)
                || coordinator.owner.sidecar().database_endpoint()
                    != Some(store.database_endpoint())
            {
                return Err(Status::invalid_argument(
                    "coordinator recovery authority/owner mismatch",
                ));
            }
            if roots
                .insert(coordinator.target.state_ref.clone(), coordinator)
                .is_some()
            {
                return Err(Status::already_exists(
                    "ambiguous local coordinator state reference",
                ));
            }
        }
        Ok(Arc::new(Self {
            store,
            request,
            participants: exact,
            coordinators: roots,
            resolver,
            tasks,
            prepared_tasks: std::sync::Mutex::new(None),
            started: AtomicBool::new(false),
        }))
    }

    /// Canonical EOF -> complete graph validation -> all participant adoption ->
    /// concurrent coordinator/Watch convergence -> exact-owned convergence rescan.
    /// Register placement recovery first. Caller supplies original task scope,
    /// but this phase deliberately does not activate it or certify its bindings.
    pub async fn converge(
        self: &Arc<Self>,
        cancel: RecoveryCancellation,
    ) -> Result<ConvergedLocalOwners<P, C>, Status> {
        if self.started.swap(true, Ordering::AcqRel) {
            return Err(Status::failed_precondition(
                "local recovery phase cannot be restarted in-process",
            ));
        }
        let mut custody = Custody {
            owner: Some(self.clone()),
            uncertain: false,
        }; // BEFORE binding, freeze or IO.
        // Recheck concrete immutable routes before cleanup binding or any IO.
        self.resolver
            .validate_original_participants(&self.participants)?;
        for coordinator in self.coordinators.values() {
            coordinator
                .owner
                .validate_local_recovery_identity(&coordinator.target)?;
            if !Arc::ptr_eq(&self.resolver, &coordinator.owner.resolver()) {
                return Err(Status::failed_precondition(
                    "coordinator carries foreign resolver",
                ));
            }
        }
        let binding = ParticipantCleanupBinding::current().ok_or_else(|| {
            Status::failed_precondition("local recovery requires host cleanup scope")
        })?;
        for participant in self.participants.values() {
            participant.bind_host_cleanup(&binding)?;
        }
        // Freeze all original dispatch generations and bind the actual host
        // cancellation BEFORE canonical Recover IO. Persist in host phase so a
        // dropped converge future cannot release/replace the task generation.
        let prepared = Arc::new(self.tasks.prepare_shared_startup(cancel.clone())?);
        *self
            .prepared_tasks
            .lock()
            .expect("prepared task custody poisoned") = Some(prepared.clone());
        if prepared.owner_count() != self.participants.len() {
            return Err(Status::failed_precondition("graph/task owner set mismatch"));
        }
        for participant in self.participants.values() {
            prepared.validate_graph_owner(participant, &self.store, &self.request)?;
        }
        let reservations: Vec<_> = self
            .participants
            .values()
            .map(|p| p.reserve_recovery_snapshot())
            .collect();
        let scan = self.scan(&cancel).await?;
        let owned: BTreeSet<_> = self.participants.keys().cloned().collect();
        let roots: BTreeMap<_, _> = self
            .coordinators
            .iter()
            .map(|(key, value)| (key.clone(), value.target.clone()))
            .collect();
        // Pure full task/declaration/provisional validation shares the SAME EOF
        // pages as participant/coordinator validation, before any graph adoption.
        let _initial_tasks = prepared.validate_snapshot(&scan)?;
        validate_graph(&scan, &owned, &roots, false)?;
        let snapshots = reservations
            .into_iter()
            .map(|r| r.validate(&scan))
            .collect::<Result<Vec<_>, _>>()?;
        let coordinators = self
            .coordinators
            .iter()
            .map(|(key, root)| {
                root.owner
                    .validate_recovery_snapshot(key, &scan)
                    .map(|snapshot| (&root.owner, snapshot))
            })
            .collect::<Result<Vec<_>, _>>()?;
        // This route contains membership only, never a cached decision. Each
        // actual Watch below delegates to this coordinator's actual sidecar.
        let watch = ClosedCoordinatorWatch::new(&scan, &owned, &self.coordinators)?;
        // Every synchronous validator above completes before the first adoption.
        custody.uncertain = true;
        for snapshot in snapshots {
            tokio::select! {
                biased;
                _ = cancel.cancelled() => return Err(Status::cancelled("local adoption cancelled")),
                result = snapshot.adopt() => result?,
            }
        }
        // An extant recovered-unprepared owner correctly rejects public Prepare;
        // only canonical native Abort ACK makes its later absence a real vote.
        // Settle ALL such original owners before polling ANY coordinator replay.
        // Prepared owners must still Watch concurrently with replay (otherwise
        // they could wait forever for the decision replay is responsible for).
        for participant in self.participants.values() {
            tokio::select! {
                biased;
                _ = cancel.cancelled() => return Err(Status::cancelled("local unprepared convergence cancelled")),
                result = participant.converge_recovered_unprepared() => result?,
            }
        }
        let replay = async {
            for (owner, snapshot) in coordinators {
                // Do not replay a whole stale preparing snapshot on Unavailable:
                // an earlier record may already have terminalized and cleaned up.
                // Until per-record resumable replay exists, return uncertainty
                // with custody retained and require a fresh process recovery.
                owner.adopt_recovery_snapshot(snapshot).await?;
            }
            Ok::<_, Status>(())
        };
        let watches = async {
            for participant in self.participants.values() {
                let mut delay = std::time::Duration::from_millis(25);
                loop {
                    match participant.watch_recovered(&watch).await {
                        Ok(()) => break,
                        Err(status) if status.code() == tonic::Code::Unavailable => {}
                        Err(status) => return Err(status),
                    }
                    tokio::time::sleep(delay).await;
                    delay = (delay * 2).min(std::time::Duration::from_secs(1));
                }
            }
            Ok::<_, Status>(())
        };
        tokio::select! {
            biased;
            _ = cancel.cancelled() => return Err(Status::cancelled("local convergence cancelled")),
            result = async { tokio::try_join!(replay, watches)?; Ok::<_, Status>(()) } => result?,
        }
        let final_scan = self.scan(&cancel).await?;
        validate_graph(&final_scan, &owned, &roots, true)?;
        let committed = prepared.validate_snapshot(&final_scan)?;
        // All task bindings were checked against original participant allocation
        // before IO. Convergence alone leaves activation to HostRecovery below.
        custody.uncertain = false;
        Ok(ConvergedLocalOwners {
            _custody: custody,
            _committed: committed,
        })
    }

    async fn scan(
        &self,
        cancel: &RecoveryCancellation,
    ) -> Result<Vec<db::RecoverResponse>, Status> {
        let work = async {
            let mut stream = self
                .store
                .task_database()
                .recover(self.request.clone())
                .await?
                .into_inner();
            let mut scan = Vec::new();
            let (mut bytes, mut records) = (0usize, 0usize);
            while let Some(page) = stream.message().await? {
                bytes = bytes.saturating_add(page.encoded_len());
                records = records
                    .saturating_add(1)
                    .saturating_add(page.participant_transactions.len())
                    .saturating_add(page.transaction_coordinators.len())
                    .saturating_add(page.pending_tasks.len());
                if bytes > MAX_BYTES || records > MAX_RECORDS {
                    return Err(Status::resource_exhausted(
                        "canonical local recovery snapshot capacity exceeded",
                    ));
                }
                scan.push(page);
            }
            Ok(scan) // ONLY successful EOF escapes.
        };
        tokio::select! {
            biased;
            _ = cancel.cancelled() => Err(Status::cancelled("canonical local recovery scan cancelled")),
            result = work => result,
        }
    }
}

#[tonic::async_trait]
impl<P: ParticipantSidecar, C: CoordinatorSidecar> crate::application_host::HostRecovery
    for Arc<CoordinatedLocalRecovery<P, C>>
{
    async fn start(
        &self,
        supervisor: &mut tokio::task::JoinSet<Result<(), Status>>,
        cancel: RecoveryCancellation,
    ) -> Result<(), Status> {
        let converged = self.converge(cancel).await?;
        // Retain phase custody until the original supervisor actually owns every
        // dispatch claim. A failed activation never releases it speculatively.
        let prepared = self
            .prepared_tasks
            .lock()
            .expect("prepared task custody poisoned")
            .as_ref()
            .cloned()
            .ok_or_else(|| Status::failed_precondition("converged graph lost startup custody"))?;
        prepared.activate(supervisor, converged._committed)?;
        let transferred = self
            .prepared_tasks
            .lock()
            .expect("prepared task custody poisoned")
            .take();
        // The supervisor retains all original claims; the host may retain this
        // phase indefinitely without preventing healthy dispatcher retirement.
        drop(transferred);
        drop(prepared);
        drop(converged._custody);
        Ok(())
    }
}

// A canonical root may select one supplied coordinator only. The table holds
// immutable membership, not decisions; terminal outcomes always come from
// DurableCoordinatorWatchHost -> actual CoordinatorSidecar::decision_get.
struct WatchMembership {
    coordinator: ParticipantTarget,
    participants: BTreeSet<ParticipantTarget>,
}

fn watch_membership(
    pages: &[db::RecoverResponse],
    owned: &BTreeSet<ParticipantTarget>,
    coordinators: &BTreeMap<String, ParticipantTarget>,
) -> Result<BTreeMap<uuid::Uuid, WatchMembership>, Status> {
    let mut routes = BTreeMap::<uuid::Uuid, WatchMembership>::new();
    for tx in pages.iter().flat_map(|p| &p.participant_transactions) {
        let participant = ParticipantTarget {
            state_type: tx.state_type.clone(),
            state_ref: tx.state_ref.clone(),
        };
        if !owned.contains(&participant) {
            continue;
        }
        let coordinator = coordinators
            .get(&tx.coordinator_state_ref)
            .filter(|c| c.state_type == tx.coordinator_state_type)
            .ok_or_else(|| Status::failed_precondition("foreign Watch coordinator"))?;
        let root = tx
            .transaction_ids
            .first()
            .ok_or_else(|| Status::failed_precondition("Watch root is absent"))?;
        let root = uuid::Uuid::from_slice(root)
            .map_err(|_| Status::failed_precondition("Watch root is not a UUID"))?;
        let route = routes.entry(root).or_insert_with(|| WatchMembership {
            coordinator: coordinator.clone(),
            participants: BTreeSet::new(),
        });
        if route.coordinator != *coordinator {
            return Err(Status::failed_precondition(
                "conflicting canonical Watch coordinators",
            ));
        }
        route.participants.insert(participant);
    }
    for (id, record) in pages.iter().flat_map(|p| &p.transaction_coordinators) {
        // An unrelated coordinator record cannot silently steal an owned root.
        if let Ok(root) = uuid::Uuid::parse_str(id)
            && let Some(route) = routes.get(&root)
            && record.state_ref != route.coordinator.state_ref
        {
            return Err(Status::failed_precondition(
                "canonical root coordinator mismatch",
            ));
        }
    }
    Ok(routes)
}

struct ClosedCoordinatorWatch<C: CoordinatorSidecar> {
    routes: BTreeMap<uuid::Uuid, (WatchMembership, DurableCoordinatorWatchHost<C>)>,
}
impl<C: CoordinatorSidecar> ClosedCoordinatorWatch<C> {
    fn new<P: ParticipantSidecar>(
        pages: &[db::RecoverResponse],
        owned: &BTreeSet<ParticipantTarget>,
        coordinators: &BTreeMap<String, LocalCoordinator<P, C>>,
    ) -> Result<Self, Status> {
        let identities = coordinators
            .iter()
            .map(|(key, c)| (key.clone(), c.target.clone()))
            .collect();
        let mut routes = BTreeMap::new();
        for (root, membership) in watch_membership(pages, owned, &identities)? {
            let coordinator = coordinators
                .get(&membership.coordinator.state_ref)
                .filter(|c| c.target == membership.coordinator)
                .ok_or_else(|| Status::failed_precondition("Watch coordinator is not owned"))?;
            let host = DurableCoordinatorWatchHost::new(
                coordinator.owner.sidecar(),
                membership.coordinator.state_type.clone(),
                membership.coordinator.state_ref.clone(),
            )?;
            routes.insert(root, (membership, host));
        }
        Ok(Self { routes })
    }
}
impl<C: CoordinatorSidecar> CoordinatorWatchEndpoint for ClosedCoordinatorWatch<C> {
    fn watch(&self, request: db::WatchRequest) -> CoordinatorWatchFuture<'_, db::WatchResponse> {
        Box::pin(async move {
            let root = uuid::Uuid::from_slice(&request.transaction_id)
                .map_err(|_| Status::invalid_argument("Watch root is not a UUID"))?;
            let (membership, host) = self
                .routes
                .get(&root)
                .ok_or_else(|| Status::failed_precondition("unknown canonical Watch root"))?;
            if !membership.participants.contains(&ParticipantTarget {
                state_type: request.state_type.clone(),
                state_ref: request.state_ref.clone(),
            }) {
                return Err(Status::failed_precondition(
                    "foreign canonical Watch participant",
                ));
            }
            // UFCS calls the real durable host; no alternate user endpoint exists.
            db::coordinator_server::Coordinator::watch(host, tonic::Request::new(request))
                .await
                .map(tonic::Response::into_inner)
        })
    }
}

fn validate_graph(
    scan: &[db::RecoverResponse],
    owned: &BTreeSet<ParticipantTarget>,
    roots: &BTreeMap<String, ParticipantTarget>,
    terminal: bool,
) -> Result<(), Status> {
    for page in scan {
        for transaction in &page.participant_transactions {
            let target = ParticipantTarget {
                state_type: transaction.state_type.clone(),
                state_ref: transaction.state_ref.clone(),
            };
            if !owned.contains(&target) {
                continue;
            } // Recover includes unrelated actors.
            if terminal {
                return Err(Status::failed_precondition(
                    "owned participant did not converge",
                ));
            }
            let root = roots
                .get(&transaction.coordinator_state_ref)
                .ok_or_else(|| {
                    Status::failed_precondition("unknown coordinator in explicit local graph")
                })?;
            if root.state_type != transaction.coordinator_state_type {
                return Err(Status::failed_precondition(
                    "owned coordinator type mismatch",
                ));
            }
            // Missing shared provisional-effect validator is an explicit HOLD,
            // not permission to adopt unvalidated task/checkpoint effects.
            if !transaction.uncommitted_tasks.is_empty()
                || !transaction.uncommitted_idempotent_mutations.is_empty()
            {
                return Err(Status::failed_precondition(
                    "taskful recovery requires shared pre-adoption effect validation",
                ));
            }
        }
        for record in page.transaction_coordinators.values() {
            if !roots.contains_key(&record.state_ref) {
                continue;
            }
            if terminal {
                return Err(Status::failed_precondition(
                    "owned coordinator did not converge",
                ));
            }
            let participants = record
                .participants
                .as_ref()
                .ok_or_else(|| Status::failed_precondition("owned coordinator lacks membership"))?;
            for (state_type, refs) in participants
                .should_commit
                .iter()
                .chain(&participants.read_only)
            {
                for state_ref in &refs.state_refs {
                    if !owned.contains(&ParticipantTarget {
                        state_type: state_type.clone(),
                        state_ref: state_ref.clone(),
                    }) {
                        return Err(Status::failed_precondition(
                            "unknown participant in explicit local graph",
                        ));
                    }
                }
            }
        }
    }
    Ok(())
}

#[cfg(test)]
#[path = "coordinated_local_recovery_tests.rs"]
mod tests;

#[cfg(test)]
#[path = "coordinated_local_host_tests.rs"]
mod host_tests;
