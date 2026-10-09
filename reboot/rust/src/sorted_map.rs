//! Canonical SortedMap library for admitted same-host fresh exclusive roots.
//!
//! This API is in-process, not a public-header-authorized Tonic adapter. A host
//! injects the native store/participant and registers its control route. Only
//! an active generated root with explicit cancellation ownership can join it.
//! Network inbound children, nested sibling paths and distributed placement are
//! deliberately outside this bounded library. Sessions and every call future
//! MUST remain serial and handler-awaited; no escaping/detached calls are
//! supported. Every polled admission/call now reserves root work through its
//! await; unfinished Drop dooms the root and retains membership uncertainty.
use crate::{
    durable_participant::{
        ActorTransactionStart, DurableActorParticipant, ParticipantStartMode,
        StartedLocalTransaction, TonicParticipantSidecar, TransactionPathContract,
    },
    runtime::{DatabaseActorStore, TransactionContext, TransactionMode},
    sorted_map_proto as proto,
};
use std::sync::Arc;
use tonic::Status;
use uuid::Uuid;

pub(crate) type RetainedMapGuard = Arc<StartedLocalTransaction<TonicParticipantSidecar>>;
// Admission-scoped, not handle/global-scoped. No TransactionContext is stored in
// this cache, so retaining the exact participant incarnation creates no cycle.
pub(crate) type RetainedMapSessions = Arc<
    std::sync::Mutex<
        std::collections::BTreeMap<crate::durable_coordinator::ParticipantTarget, RetainedMapGuard>,
    >,
>;

const MAP: &str = "rbt.std.collections.v1.SortedMap";

/// Host-owned builtin registration. No public header conveys this authority.
#[derive(Clone)]
pub struct SortedMapLibrary {
    store: DatabaseActorStore,
    sidecar: Arc<TonicParticipantSidecar>,
}
impl SortedMapLibrary {
    /// Connects the library to the same exact native endpoint as the app store.
    pub async fn new(store: DatabaseActorStore) -> Result<Self, Status> {
        let sidecar = Arc::new(
            TonicParticipantSidecar::connect(store.database_endpoint().to_owned())
                .await
                .map_err(|error| Status::unavailable(error.to_string()))?,
        );
        Ok(Self { store, sidecar })
    }
    /// Constructs EMPTY canonical state, ensuring the entry CF even for an empty
    /// map. Uses native CreateActor uniqueness and durable idempotent replay.
    pub async fn create(&self, state_ref: &str, key: Uuid) -> Result<SortedMapHandle, Status> {
        let handle = self.target(state_ref).map_err(|error| *error)?;
        self.store.create_empty_sorted_map(state_ref, key).await?;
        Ok(handle)
    }
    /// Attaches to a canonical identity. Existence is checked on admission.
    pub fn target(&self, state_ref: &str) -> Result<SortedMapHandle, Box<Status>> {
        let parsed = crate::state_ref::StateRef::from_maybe_readable(state_ref)
            .map_err(|e| Box::new(Status::invalid_argument(e.to_string())))?;
        if !parsed.matches_state_type(MAP) || parsed.as_str() != state_ref {
            return Err(Box::new(Status::invalid_argument(
                "noncanonical SortedMap identity",
            )));
        }
        Ok(SortedMapHandle {
            participant: DurableActorParticipant::new(self.sidecar.clone(), MAP, state_ref)
                .with_database_actor_gate(&self.store),
            endpoint: self.store.database_endpoint().to_owned(),
        })
    }
}

/// Typed canonical map target; callers cannot choose entry CF/raw child keys.
#[derive(Clone)]
pub struct SortedMapHandle {
    participant: DurableActorParticipant<TonicParticipantSidecar>,
    endpoint: String,
}
impl SortedMapHandle {
    /// The host registers this exact participant's control endpoint before use.
    pub fn participant(&self) -> DurableActorParticipant<TonicParticipantSidecar> {
        self.participant.clone()
    }
    /// Join a genuinely admitted generated app root. Validation precedes actor
    /// admission and native IO; map membership is recorded before eager Store.
    /// Serial reopening under this exact admitted root reuses its retained native
    /// participant. It does not introduce a child path, snapshot or rollback scope.
    pub async fn in_transaction(
        &self,
        context: &TransactionContext,
    ) -> Result<SortedMapSession, Status> {
        let mut operation = context
            .begin_builtin_map_operation(&self.endpoint)
            .inspect_err(|status| context.doom(status.clone()))?;
        let result: Result<SortedMapSession, Status> = async {
            let target = self.participant.actor_target();
            if let Some(guard) = context.retained_builtin_map(&self.endpoint, &target)? {
                // Reuse the exact root-owned native participant/owner rather than
                // reentering its actor gate or recreating its eager transaction.
                return Ok(SortedMapSession {
                    guard,
                    context: context.clone(),
                    endpoint: self.endpoint.clone(),
                });
            }
            let cache_target = target.clone();
            let guard = self
                .participant
                .start_local(
                    ActorTransactionStart {
                        transaction_ids: context.transaction_ids().to_vec(),
                        transaction_path: TransactionPathContract::RootOnly,
                        coordinator_state_type: context
                            .transaction_coordinator_state_type()
                            .to_owned(),
                        coordinator_state_ref: context
                            .transaction_coordinator_state_ref()
                            .to_owned(),
                        mode: TransactionMode::Exclusive,
                        read_only: false,
                        factory: false,
                        state_type: target.state_type,
                        state_ref: target.state_ref,
                    },
                    ParticipantStartMode::Exclusive,
                )
                .await?;
            // Validate again after awaited admission; a detached context cannot
            // race its root's terminal handoff and gain new map authority.
            context.validate_builtin_map_admission(&self.endpoint)?;
            guard.enlist_sorted_map(context).await?;
            let guard = Arc::new(guard);
            context.retain_builtin_map(&self.endpoint, cache_target, guard.clone())?;
            Ok(SortedMapSession {
                guard,
                context: context.clone(),
                endpoint: self.endpoint.clone(),
            })
        }
        .await;
        match result {
            Ok(session) => {
                operation
                    .returned(&self.endpoint)
                    .inspect_err(|status| context.doom(status.clone()))?;
                Ok(session)
            }
            Err(status) => {
                context.doom(status.clone());
                Err(status)
            }
        }
    }
}

/// Serial direct map calls sharing the root's single native map participant.
/// Any failed call dooms the root even if an application catches the error.
/// Dropping this session never discards uncertain/eager native ownership.
/// Calls MUST be serial and awaited inside the owning handler. Do not move a
/// session/call into a detached task or let it outlive the handler. Active work
/// blocks root completion; unfinished Drop retains uncertainty. This lifetime
/// fence does not certify task provenance or enable concurrent map operations.
pub struct SortedMapSession {
    guard: RetainedMapGuard,
    context: TransactionContext,
    endpoint: String,
}
impl SortedMapSession {
    async fn call<T>(
        &self,
        future: impl std::future::Future<Output = Result<T, Status>>,
    ) -> Result<T, Status> {
        let result = async {
            let mut operation = self.context.begin_builtin_map_operation(&self.endpoint)?;
            match future.await {
                Ok(response) => {
                    operation.returned(&self.endpoint)?;
                    Ok(response)
                }
                Err(status) => {
                    self.context.doom(status.clone());
                    Err(status)
                }
            }
        }
        .await;
        result.inspect_err(|status| self.context.doom(status.clone()))
    }
    pub async fn insert(
        &self,
        request: proto::InsertRequest,
    ) -> Result<proto::InsertResponse, Status> {
        self.call(self.guard.sorted_map_insert(request)).await
    }
    pub async fn remove(
        &self,
        request: proto::RemoveRequest,
    ) -> Result<proto::RemoveResponse, Status> {
        self.call(self.guard.sorted_map_remove(request)).await
    }
    pub async fn get(&self, request: proto::GetRequest) -> Result<proto::GetResponse, Status> {
        self.call(self.guard.sorted_map_get(request)).await
    }
    pub async fn range(
        &self,
        request: proto::RangeRequest,
    ) -> Result<proto::RangeResponse, Status> {
        self.call(self.guard.sorted_map_range(request)).await
    }
    pub async fn reverse_range(
        &self,
        request: proto::ReverseRangeRequest,
    ) -> Result<proto::ReverseRangeResponse, Status> {
        self.call(self.guard.sorted_map_reverse_range(request))
            .await
    }
}
