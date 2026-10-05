//! Durable root coordinator for root exclusive and read-only actor participants.
//!
//! This is deliberately a narrow 2PC control path. It persists coordinator
//! records in the Database sidecar and reaches participants only through an
//! injected resolver. It does not choose placement, create actors, or support
//! nested, placement, or multi-actor transactions. Root shared
//! transactions are supported only when every participant remains read-only.

use std::collections::BTreeSet;
use std::future::Future;
use std::pin::Pin;
use std::sync::Arc;

use tonic::{Request, Response, Status};
use uuid::Uuid;

use crate::{
    database_proto as database,
    durable_participant::{DurableActorParticipantHost, ParticipantSidecar, SharedPromotion},
    runtime::TransactionMode,
};

const STATE_REF_HEADER: &str = "x-reboot-state-ref";
type CoordinatorFuture<'a, T> = Pin<Box<dyn Future<Output = Result<T, Status>> + Send + 'a>>;

#[derive(Clone, Debug, Eq, Ord, PartialEq, PartialOrd)]
pub struct ParticipantTarget {
    pub state_type: String,
    pub state_ref: String,
}

/// A classification carried by successful participant trailers. A write wins
/// if a target appears in both classifications.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ReturnedParticipant {
    pub target: ParticipantTarget,
    pub read_only: bool,
}

#[derive(Clone, Debug, Default, Eq, PartialEq)]
struct ParticipantSet {
    should_commit: BTreeSet<ParticipantTarget>,
    read_only: BTreeSet<ParticipantTarget>,
}
impl ParticipantSet {
    fn add(&mut self, target: ParticipantTarget, read_only: bool) {
        if read_only {
            if !self.should_commit.contains(&target) {
                self.read_only.insert(target);
            }
        } else {
            self.read_only.remove(&target);
            self.should_commit.insert(target);
        }
    }
    fn prepare(&self) -> impl Iterator<Item = (&ParticipantTarget, bool)> {
        self.should_commit
            .iter()
            .map(|target| (target, false))
            .chain(self.read_only.iter().map(|target| (target, true)))
    }
}

#[derive(Clone, Debug)]
pub struct RootCoordinatorStart {
    pub transaction_ids: Vec<Uuid>,
    pub coordinator_state_type: String,
    pub coordinator_state_ref: String,
    pub participant: ParticipantTarget,
    pub mode: TransactionMode,
    pub read_only: bool,
    pub factory: bool,
    /// Placement is intentionally supplied by neither this coordinator nor its
    /// resolver. `true` means a caller is attempting unsupported placement.
    pub placement_requested: bool,
}

#[derive(Clone, Debug, Default)]
pub struct CoordinatorRecovery {
    pub state_tags_by_state_type: std::collections::BTreeMap<String, String>,
    pub shard_ids: Vec<String>,
    pub coordinator_state_ref: String,
}

/// Database control records, not actor staging. A coordinator must use these
/// three RPCs rather than `Store` or an in-memory substitute.
pub trait CoordinatorSidecar: Send + Sync + 'static {
    fn coordinator_prepare(
        &self,
        request: database::TransactionCoordinatorPrepareRequest,
    ) -> CoordinatorFuture<'_, database::TransactionCoordinatorPrepareResponse>;
    fn coordinator_prepared(
        &self,
        request: database::TransactionCoordinatorPreparedRequest,
    ) -> CoordinatorFuture<'_, database::TransactionCoordinatorPreparedResponse>;
    fn coordinator_cleanup(
        &self,
        request: database::TransactionCoordinatorCleanupRequest,
    ) -> CoordinatorFuture<'_, database::TransactionCoordinatorCleanupResponse>;
    fn decision_put(
        &self,
        _request: database::TransactionCoordinatorDecisionPutRequest,
    ) -> CoordinatorFuture<'_, database::TransactionCoordinatorDecisionPutResponse> {
        Box::pin(async {
            Err(Status::unimplemented(
                "durable Coordinator.Watch decisions are required",
            ))
        })
    }
    fn decision_get(
        &self,
        _request: database::TransactionCoordinatorDecisionGetRequest,
    ) -> CoordinatorFuture<'_, database::TransactionCoordinatorDecisionGetResponse> {
        Box::pin(async {
            Err(Status::unimplemented(
                "durable Coordinator.Watch decisions are required",
            ))
        })
    }
    fn recover(
        &self,
        request: database::RecoverRequest,
    ) -> CoordinatorFuture<'_, Vec<database::RecoverResponse>>;
}

/// A route supplied by the host. Coordinator code never opens a participant
/// connection from a state reference and therefore cannot silently invent
/// routing or placement behavior.
pub trait ParticipantEndpoint: Send + Sync + 'static {
    fn prepare(
        &self,
        state_ref: &str,
        request: database::PrepareRequest,
    ) -> CoordinatorFuture<'_, database::PrepareResponse>;
    fn commit(
        &self,
        state_ref: &str,
        request: database::CommitRequest,
    ) -> CoordinatorFuture<'_, database::CommitResponse>;
    fn abort(
        &self,
        state_ref: &str,
        request: database::AbortRequest,
    ) -> CoordinatorFuture<'_, database::AbortResponse>;
}

pub trait ParticipantResolver: Send + Sync + 'static {
    type Endpoint: ParticipantEndpoint;
    fn resolve(
        &self,
        participant: &ParticipantTarget,
    ) -> CoordinatorFuture<'_, Arc<Self::Endpoint>>;
}

fn participant_request<T>(state_ref: &str, body: T) -> Result<Request<T>, Status> {
    let mut request = Request::new(body);
    request.metadata_mut().insert(
        STATE_REF_HEADER,
        state_ref
            .parse()
            .map_err(|_| Status::invalid_argument("invalid participant state reference"))?,
    );
    Ok(request)
}

/// Native Database implementation for the coordinator's durable control data.
pub struct TonicCoordinatorSidecar {
    client:
        tokio::sync::Mutex<database::database_client::DatabaseClient<tonic::transport::Channel>>,
}

impl TonicCoordinatorSidecar {
    pub async fn connect(endpoint: impl AsRef<str>) -> Result<Self, tonic::transport::Error> {
        Ok(Self {
            client: tokio::sync::Mutex::new(
                database::database_client::DatabaseClient::connect(endpoint.as_ref().to_owned())
                    .await?,
            ),
        })
    }
}

impl CoordinatorSidecar for TonicCoordinatorSidecar {
    fn coordinator_prepare(
        &self,
        request: database::TransactionCoordinatorPrepareRequest,
    ) -> CoordinatorFuture<'_, database::TransactionCoordinatorPrepareResponse> {
        Box::pin(async move {
            self.client
                .lock()
                .await
                .transaction_coordinator_prepare(request)
                .await
                .map(Response::into_inner)
        })
    }
    fn coordinator_prepared(
        &self,
        request: database::TransactionCoordinatorPreparedRequest,
    ) -> CoordinatorFuture<'_, database::TransactionCoordinatorPreparedResponse> {
        Box::pin(async move {
            self.client
                .lock()
                .await
                .transaction_coordinator_prepared(request)
                .await
                .map(Response::into_inner)
        })
    }
    fn coordinator_cleanup(
        &self,
        request: database::TransactionCoordinatorCleanupRequest,
    ) -> CoordinatorFuture<'_, database::TransactionCoordinatorCleanupResponse> {
        Box::pin(async move {
            self.client
                .lock()
                .await
                .transaction_coordinator_cleanup(request)
                .await
                .map(Response::into_inner)
        })
    }
    fn decision_put(
        &self,
        request: database::TransactionCoordinatorDecisionPutRequest,
    ) -> CoordinatorFuture<'_, database::TransactionCoordinatorDecisionPutResponse> {
        Box::pin(async move {
            self.client
                .lock()
                .await
                .transaction_coordinator_decision_put(request)
                .await
                .map(Response::into_inner)
        })
    }
    fn decision_get(
        &self,
        request: database::TransactionCoordinatorDecisionGetRequest,
    ) -> CoordinatorFuture<'_, database::TransactionCoordinatorDecisionGetResponse> {
        Box::pin(async move {
            self.client
                .lock()
                .await
                .transaction_coordinator_decision_get(request)
                .await
                .map(Response::into_inner)
        })
    }
    fn recover(
        &self,
        request: database::RecoverRequest,
    ) -> CoordinatorFuture<'_, Vec<database::RecoverResponse>> {
        Box::pin(async move {
            let mut stream = self
                .client
                .lock()
                .await
                .recover(request)
                .await?
                .into_inner();
            let mut responses = Vec::new();
            while let Some(response) = stream.message().await? {
                responses.push(response);
            }
            Ok(responses)
        })
    }
}

/// A Tonic endpoint is useful when the application already has a resolved
/// participant address. Address selection remains outside this module.
pub struct TonicParticipantEndpoint {
    client: tokio::sync::Mutex<
        database::participant_client::ParticipantClient<tonic::transport::Channel>,
    >,
}
impl TonicParticipantEndpoint {
    pub async fn connect(endpoint: impl AsRef<str>) -> Result<Self, tonic::transport::Error> {
        Ok(Self {
            client: tokio::sync::Mutex::new(
                database::participant_client::ParticipantClient::connect(
                    endpoint.as_ref().to_owned(),
                )
                .await?,
            ),
        })
    }
}
impl ParticipantEndpoint for TonicParticipantEndpoint {
    fn prepare(
        &self,
        state_ref: &str,
        request: database::PrepareRequest,
    ) -> CoordinatorFuture<'_, database::PrepareResponse> {
        let state_ref = state_ref.to_owned();
        Box::pin(async move {
            self.client
                .lock()
                .await
                .prepare(participant_request(&state_ref, request)?)
                .await
                .map(Response::into_inner)
        })
    }
    fn commit(
        &self,
        state_ref: &str,
        request: database::CommitRequest,
    ) -> CoordinatorFuture<'_, database::CommitResponse> {
        let state_ref = state_ref.to_owned();
        Box::pin(async move {
            self.client
                .lock()
                .await
                .commit(participant_request(&state_ref, request)?)
                .await
                .map(Response::into_inner)
        })
    }
    fn abort(
        &self,
        state_ref: &str,
        request: database::AbortRequest,
    ) -> CoordinatorFuture<'_, database::AbortResponse> {
        let state_ref = state_ref.to_owned();
        Box::pin(async move {
            self.client
                .lock()
                .await
                .abort(participant_request(&state_ref, request)?)
                .await
                .map(Response::into_inner)
        })
    }
}

/// An explicitly injected route to a local durable participant host.
///
/// This executes the generated Participant service trait directly while
/// preserving the request metadata and status behavior of the Tonic endpoint.
/// It owns no resolver and does not select actor placement.
#[derive(Clone)]
pub struct InProcessParticipantEndpoint<C: ParticipantSidecar> {
    host: DurableActorParticipantHost<C>,
}

impl<C: ParticipantSidecar> InProcessParticipantEndpoint<C> {
    pub fn new(host: DurableActorParticipantHost<C>) -> Self {
        Self { host }
    }
}

impl<C: ParticipantSidecar> ParticipantEndpoint for InProcessParticipantEndpoint<C> {
    fn prepare(
        &self,
        state_ref: &str,
        request: database::PrepareRequest,
    ) -> CoordinatorFuture<'_, database::PrepareResponse> {
        let state_ref = state_ref.to_owned();
        Box::pin(async move {
            database::participant_server::Participant::prepare(
                &self.host,
                participant_request(&state_ref, request)?,
            )
            .await
            .map(Response::into_inner)
        })
    }

    fn commit(
        &self,
        state_ref: &str,
        request: database::CommitRequest,
    ) -> CoordinatorFuture<'_, database::CommitResponse> {
        let state_ref = state_ref.to_owned();
        Box::pin(async move {
            database::participant_server::Participant::commit(
                &self.host,
                participant_request(&state_ref, request)?,
            )
            .await
            .map(Response::into_inner)
        })
    }

    fn abort(
        &self,
        state_ref: &str,
        request: database::AbortRequest,
    ) -> CoordinatorFuture<'_, database::AbortResponse> {
        let state_ref = state_ref.to_owned();
        Box::pin(async move {
            database::participant_server::Participant::abort(
                &self.host,
                participant_request(&state_ref, request)?,
            )
            .await
            .map(Response::into_inner)
        })
    }
}

/// Resolves exactly one explicitly configured local participant target.
///
/// This is a composition helper for applications with one known actor host. It
/// validates the requested state type and reference before exposing that host;
/// it neither discovers participants nor makes routing or placement decisions.
pub struct SingleParticipantResolver<C: ParticipantSidecar> {
    target: ParticipantTarget,
    endpoint: Arc<InProcessParticipantEndpoint<C>>,
}

impl<C: ParticipantSidecar> SingleParticipantResolver<C> {
    /// Binds an injected local host to one complete participant identity.
    pub fn new(
        target: ParticipantTarget,
        host: DurableActorParticipantHost<C>,
    ) -> Result<Self, Status> {
        Self::validate_target(&target)?;
        Ok(Self {
            target,
            endpoint: Arc::new(InProcessParticipantEndpoint::new(host)),
        })
    }

    fn validate_target(target: &ParticipantTarget) -> Result<(), Status> {
        if target.state_type.is_empty() || target.state_ref.is_empty() {
            return Err(Status::invalid_argument(
                "participant state type and reference must be specified",
            ));
        }
        Ok(())
    }
}

impl<C: ParticipantSidecar> ParticipantResolver for SingleParticipantResolver<C> {
    type Endpoint = InProcessParticipantEndpoint<C>;

    fn resolve(
        &self,
        participant: &ParticipantTarget,
    ) -> CoordinatorFuture<'_, Arc<Self::Endpoint>> {
        let result = (|| {
            Self::validate_target(participant)?;
            if participant != &self.target {
                return Err(Status::unavailable(
                    "configured local participant target is unavailable",
                ));
            }
            Ok(Arc::clone(&self.endpoint))
        })();
        Box::pin(async move { result })
    }
}

pub struct DurableRootCoordinator<C: CoordinatorSidecar, R: ParticipantResolver> {
    sidecar: Arc<C>,
    resolver: Arc<R>,
}

impl<C: CoordinatorSidecar, R: ParticipantResolver> DurableRootCoordinator<C, R> {
    pub fn new(sidecar: Arc<C>, resolver: Arc<R>) -> Self {
        Self { sidecar, resolver }
    }

    /// Returns the injected sidecar so generated Tonic adapters can clone their
    /// coordinator without inventing a transport dependency.
    pub fn sidecar(&self) -> Arc<C> {
        Arc::clone(&self.sidecar)
    }

    /// Returns the injected resolver so generated Tonic adapters preserve the
    /// host's routing and placement policy.
    pub fn resolver(&self) -> Arc<R> {
        Arc::clone(&self.resolver)
    }

    /// Completes a root transaction with no remote transactional calls.
    pub async fn complete(&self, start: RootCoordinatorStart) -> Result<(), Status> {
        self.complete_with_returned_participants(start, Vec::new())
            .await
    }

    /// Completes an exclusive root transaction after its handler has enlisted
    /// participants returned in successful remote-call trailers.
    ///
    /// The full de-duplicated set is persisted before *any* Prepare RPC. RPC
    /// status failures remain ambiguous: the sealed preparing record is left
    /// intact for recovery. A definitive Prepare abort drives Abort to every
    /// recorded participant and is cleaned up only after every acknowledgement.
    pub async fn complete_with_returned_participants(
        &self,
        start: RootCoordinatorStart,
        returned: Vec<ParticipantTarget>,
    ) -> Result<(), Status> {
        self.complete_with_classified_returned_participants(
            start,
            returned
                .into_iter()
                .map(|target| ReturnedParticipant {
                    target,
                    read_only: false,
                })
                .collect(),
        )
        .await
    }

    /// Completes a root transaction with classifications from a read-only-aware
    /// successful trailer. New generated adapters use this path.
    pub async fn complete_with_classified_returned_participants(
        &self,
        start: RootCoordinatorStart,
        returned: Vec<ReturnedParticipant>,
    ) -> Result<(), Status> {
        Self::validate_start(&start)?;
        let participants = Self::participant_set(&start, returned)?;
        self.complete_participants(start, participants).await
    }

    /// Completes the one writer created by a local shared-to-exclusive promotion.
    ///
    /// This intentionally does not broaden the generic completion path: the
    /// opaque proof must match the sole root participant exactly, and no remote
    /// participants can be enlisted through this seam.
    pub async fn complete_shared_local_promotion(
        &self,
        start: RootCoordinatorStart,
        promotion: SharedPromotion,
    ) -> Result<(), Status> {
        Self::validate_shared_local_promotion(&start, &promotion)?;
        let mut participants = ParticipantSet::default();
        participants.add(start.participant.clone(), false);
        self.complete_participants(start, participants).await
    }

    async fn complete_participants(
        &self,
        start: RootCoordinatorStart,
        participants: ParticipantSet,
    ) -> Result<(), Status> {
        let transaction_id = start.transaction_ids[0];
        self.sidecar
            .coordinator_prepare(database::TransactionCoordinatorPrepareRequest {
                transaction_id: transaction_id.as_bytes().to_vec(),
                transaction_coordinator: Some(Self::record(
                    &start.coordinator_state_ref,
                    &participants,
                    true,
                )),
            })
            .await?;
        if self
            .prepare_participants(transaction_id, participants.prepare())
            .await?
        {
            self.persist_abort(transaction_id, &start.coordinator_state_ref)
                .await?;
            self.terminal_all(transaction_id, &participants.should_commit, false)
                .await?;
            return self
                .cleanup(transaction_id, &start.coordinator_state_ref)
                .await;
        }
        self.sidecar
            .coordinator_prepared(database::TransactionCoordinatorPreparedRequest {
                transaction_id: transaction_id.as_bytes().to_vec(),
                transaction_coordinator: Some(Self::record(
                    &start.coordinator_state_ref,
                    &participants,
                    false,
                )),
                ..Default::default()
            })
            .await?;
        self.persist_commit(transaction_id, &start.coordinator_state_ref, &participants)
            .await?;
        #[cfg(feature = "test-support")]
        test_support::pause_after_durable_decision()?;
        self.terminal_all(transaction_id, &participants.should_commit, true)
            .await?;
        self.cleanup(transaction_id, &start.coordinator_state_ref)
            .await
    }

    /// Recovers all matching coordinator records. A preparing record is
    /// re-prepared; a prepared record proceeds directly to terminal commit.
    /// Any non-definitive failure is returned without cleanup so a later call
    /// can retry from the durable record.
    pub async fn recover(&self, recovery: CoordinatorRecovery) -> Result<(), Status> {
        if recovery.shard_ids.is_empty() {
            return Err(Status::invalid_argument(
                "coordinator recovery requires at least one shard ID",
            ));
        }
        if recovery.coordinator_state_ref.is_empty() {
            return Err(Status::invalid_argument(
                "coordinator recovery requires a coordinator state reference",
            ));
        }
        let responses = self
            .sidecar
            .recover(database::RecoverRequest {
                state_tags_by_state_type: recovery.state_tags_by_state_type,
                shard_ids: recovery.shard_ids,
                skip_idempotent_mutations: true,
            })
            .await?;
        for (id, record) in responses
            .into_iter()
            .flat_map(|response| response.transaction_coordinators)
        {
            if record.state_ref != recovery.coordinator_state_ref {
                continue;
            }
            let transaction_id = Uuid::parse_str(&id).map_err(|_| {
                Status::failed_precondition("recovered coordinator key must be a UUID")
            })?;
            let participants = Self::participants_from_record(&record)?;
            if record.preparing {
                // Read-only actors released their lock after the original Prepare;
                // a recovered coordinator must never re-prepare them.
                if self
                    .prepare_participants(
                        transaction_id,
                        participants
                            .should_commit
                            .iter()
                            .map(|participant| (participant, false)),
                    )
                    .await?
                {
                    self.persist_abort(transaction_id, &record.state_ref)
                        .await?;
                    self.terminal_all(transaction_id, &participants.should_commit, false)
                        .await?;
                    self.cleanup(transaction_id, &record.state_ref).await?;
                    continue;
                }
                self.sidecar
                    .coordinator_prepared(database::TransactionCoordinatorPreparedRequest {
                        transaction_id: transaction_id.as_bytes().to_vec(),
                        transaction_coordinator: Some(Self::record(
                            &record.state_ref,
                            &participants,
                            false,
                        )),
                        ..Default::default()
                    })
                    .await?;
            }
            // A recovered prepared record is a commit decision only after the
            // immutable Watch record is durable. Direct terminal delivery can
            // be lost with the coordinator process, so it must remain merely
            // an optimization after this write.
            self.persist_commit(transaction_id, &record.state_ref, &participants)
                .await?;
            self.terminal_all(transaction_id, &participants.should_commit, true)
                .await?;
            self.cleanup(transaction_id, &record.state_ref).await?;
        }
        Ok(())
    }

    async fn persist_abort(
        &self,
        transaction_id: Uuid,
        coordinator_state_ref: &str,
    ) -> Result<(), Status> {
        self.sidecar
            .decision_put(database::TransactionCoordinatorDecisionPutRequest {
                root_transaction_id: transaction_id.as_bytes().to_vec(),
                decision: Some(database::TransactionCoordinatorDecision {
                    coordinator_state_ref: coordinator_state_ref.to_owned(),
                    outcome: database::transaction_coordinator_decision::Outcome::Abort as i32,
                    participants: None,
                }),
            })
            .await?;
        Ok(())
    }
    async fn persist_commit(
        &self,
        transaction_id: Uuid,
        coordinator_state_ref: &str,
        participants: &ParticipantSet,
    ) -> Result<(), Status> {
        self.sidecar
            .decision_put(database::TransactionCoordinatorDecisionPutRequest {
                root_transaction_id: transaction_id.as_bytes().to_vec(),
                decision: Some(database::TransactionCoordinatorDecision {
                    coordinator_state_ref: coordinator_state_ref.to_owned(),
                    outcome: database::transaction_coordinator_decision::Outcome::Commit as i32,
                    // Watch membership is only the terminal commit set. Read-only
                    // actors were released at Prepare and must not be committed.
                    participants: Self::record(
                        coordinator_state_ref,
                        &ParticipantSet {
                            should_commit: participants.should_commit.clone(),
                            read_only: BTreeSet::new(),
                        },
                        false,
                    )
                    .participants,
                }),
            })
            .await?;
        Ok(())
    }

    fn cleanup(
        &self,
        transaction_id: Uuid,
        coordinator_state_ref: &str,
    ) -> CoordinatorFuture<'_, ()> {
        let coordinator_state_ref = coordinator_state_ref.to_owned();
        Box::pin(async move {
            self.sidecar
                .coordinator_cleanup(database::TransactionCoordinatorCleanupRequest {
                    transaction_id: transaction_id.as_bytes().to_vec(),
                    coordinator_state_ref,
                })
                .await?;
            Ok(())
        })
    }
    fn validate_shared_local_promotion(
        start: &RootCoordinatorStart,
        promotion: &SharedPromotion,
    ) -> Result<(), Status> {
        if start.transaction_ids.len() != 1 {
            return Err(Status::unimplemented(
                "nested or multi-ID shared promotions are not supported",
            ));
        }
        if start.mode != TransactionMode::Shared {
            return Err(Status::failed_precondition(
                "shared local promotion requires a shared root transaction",
            ));
        }
        if start.read_only {
            return Err(Status::failed_precondition(
                "shared local promotion must be a writer",
            ));
        }
        if start.factory {
            return Err(Status::unimplemented(
                "factory shared promotions are not supported",
            ));
        }
        if start.placement_requested {
            return Err(Status::unimplemented(
                "placement-selected transactions are not supported",
            ));
        }
        if start.coordinator_state_type.is_empty()
            || start.coordinator_state_ref.is_empty()
            || start.participant.state_type.is_empty()
            || start.participant.state_ref.is_empty()
        {
            return Err(Status::invalid_argument(
                "coordinator and participant identity must be specified",
            ));
        }
        if !promotion.matches(
            start.transaction_ids[0],
            &start.participant.state_type,
            &start.participant.state_ref,
        ) {
            return Err(Status::failed_precondition(
                "shared promotion does not match the root participant",
            ));
        }
        Ok(())
    }

    /// Fans out Prepare only after the Database sidecar has durably recorded
    /// the complete participant set. Every RPC is allowed to settle before a
    /// definitive abort is acted on: a transport failure is ambiguous, so it
    /// leaves the sealed record intact for recovery rather than cancelling
    /// other prepares or converting uncertainty into Abort.
    async fn prepare_participants<'a>(
        &self,
        transaction_id: Uuid,
        participants: impl Iterator<Item = (&'a ParticipantTarget, bool)>,
    ) -> Result<bool, Status> {
        let mut prepares = tokio::task::JoinSet::new();
        for (participant, read_only) in participants {
            let participant = participant.clone();
            let resolver = Arc::clone(&self.resolver);
            prepares.spawn(async move {
                let endpoint = resolver.resolve(&participant).await?;
                endpoint
                    .prepare(
                        &participant.state_ref,
                        database::PrepareRequest {
                            transaction_id: transaction_id.as_bytes().to_vec(),
                            abort_via_response: true,
                            read_only_aware: true,
                            read_only,
                        },
                    )
                    .await
            });
        }

        let mut definitive_abort = false;
        let mut ambiguous_failure = None;
        while let Some(result) = prepares.join_next().await {
            match result {
                Ok(Ok(response)) => definitive_abort |= response.abort,
                Ok(Err(status)) => {
                    ambiguous_failure.get_or_insert(status);
                }
                Err(error) => {
                    ambiguous_failure.get_or_insert_with(|| {
                        Status::internal(format!("Prepare task failed: {error}"))
                    });
                }
            }
        }
        if let Some(status) = ambiguous_failure {
            return Err(status);
        }
        Ok(definitive_abort)
    }

    fn validate_start(start: &RootCoordinatorStart) -> Result<(), Status> {
        if start.transaction_ids.len() != 1 {
            return Err(Status::unimplemented(
                "nested or shared transactions are not supported",
            ));
        }
        if start.mode == TransactionMode::Shared && !start.read_only {
            return Err(Status::failed_precondition(
                "shared root transactions must remain read-only",
            ));
        }

        if start.placement_requested {
            return Err(Status::unimplemented(
                "placement-selected transactions are not supported",
            ));
        }
        if start.coordinator_state_type.is_empty()
            || start.coordinator_state_ref.is_empty()
            || start.participant.state_type.is_empty()
            || start.participant.state_ref.is_empty()
        {
            return Err(Status::invalid_argument(
                "coordinator and participant identity must be specified",
            ));
        }
        Ok(())
    }
    async fn terminal_all(
        &self,
        transaction_id: Uuid,
        participants: &BTreeSet<ParticipantTarget>,
        commit: bool,
    ) -> Result<(), Status> {
        for participant in participants {
            let endpoint = self.resolver.resolve(participant).await?;
            if commit {
                endpoint
                    .commit(
                        &participant.state_ref,
                        database::CommitRequest {
                            transaction_id: transaction_id.as_bytes().to_vec(),
                        },
                    )
                    .await?;
            } else {
                endpoint
                    .abort(
                        &participant.state_ref,
                        database::AbortRequest {
                            transaction_id: transaction_id.as_bytes().to_vec(),
                        },
                    )
                    .await?;
            }
        }
        Ok(())
    }
    fn participant_set(
        start: &RootCoordinatorStart,
        returned: Vec<ReturnedParticipant>,
    ) -> Result<ParticipantSet, Status> {
        let mut participants = ParticipantSet::default();
        participants.add(start.participant.clone(), start.read_only);
        for participant in returned {
            participants.add(participant.target, participant.read_only);
        }
        if participants.prepare().any(|(participant, _)| {
            participant.state_type.is_empty() || participant.state_ref.is_empty()
        }) {
            return Err(Status::invalid_argument(
                "participant identity must be specified",
            ));
        }
        if start.mode == TransactionMode::Shared && !participants.should_commit.is_empty() {
            return Err(Status::failed_precondition(
                "shared root transactions must remain read-only",
            ));
        }
        Ok(participants)
    }
    fn state_ref_map(
        participants: &BTreeSet<ParticipantTarget>,
    ) -> std::collections::BTreeMap<String, database::participants::StateRefs> {
        let mut result = std::collections::BTreeMap::new();
        for participant in participants {
            result
                .entry(participant.state_type.clone())
                .or_insert_with(|| database::participants::StateRefs {
                    state_refs: Vec::new(),
                })
                .state_refs
                .push(participant.state_ref.clone());
        }
        result
    }
    fn record(
        state_ref: &str,
        participants: &ParticipantSet,
        preparing: bool,
    ) -> database::TransactionCoordinator {
        database::TransactionCoordinator {
            state_ref: state_ref.to_owned(),
            participants: Some(database::Participants {
                should_commit: Self::state_ref_map(&participants.should_commit),
                read_only: Self::state_ref_map(&participants.read_only),
            }),
            preparing,
        }
    }
    fn participants_from_record(
        record: &database::TransactionCoordinator,
    ) -> Result<ParticipantSet, Status> {
        let participants = record.participants.as_ref().ok_or_else(|| {
            Status::failed_precondition("recovered coordinator has no participants")
        })?;
        let mut result = ParticipantSet::default();
        for (map, read_only) in [
            (&participants.should_commit, false),
            (&participants.read_only, true),
        ] {
            for (state_type, refs) in map {
                for state_ref in &refs.state_refs {
                    if state_type.is_empty() || state_ref.is_empty() {
                        return Err(Status::failed_precondition(
                            "recovered coordinator contains an invalid participant",
                        ));
                    }
                    result.add(
                        ParticipantTarget {
                            state_type: state_type.clone(),
                            state_ref: state_ref.clone(),
                        },
                        read_only,
                    );
                }
            }
        }
        if result.should_commit.is_empty() && result.read_only.is_empty() {
            return Err(Status::failed_precondition(
                "recovered coordinator has no participants",
            ));
        }
        Ok(result)
    }
}

/// Test-only, cross-process barrier used by the real Database acceptance host.
///
/// A host enables it by setting `REBOOT_TEST_PAUSE_AFTER_COORDINATOR_PREPARE`
/// to a marker path. Once the immutable commit decision is durable but before
/// direct terminal fan-out, the host creates that marker and waits for its
/// removal. This deliberately has no production build surface and lets the
/// acceptance harness kill the coordinator at the Watch recovery boundary.
#[cfg(feature = "test-support")]
#[doc(hidden)]
pub mod test_support {
    use std::{fs, path::Path, thread, time::Duration};

    pub fn pause_after_durable_decision() -> Result<(), tonic::Status> {
        let Ok(marker) = std::env::var("REBOOT_TEST_PAUSE_AFTER_COORDINATOR_PREPARE") else {
            return Ok(());
        };
        fs::write(&marker, b"sealed\n").map_err(|error| {
            tonic::Status::internal(format!("cannot create coordinator test barrier: {error}"))
        })?;
        while Path::new(&marker).exists() {
            thread::sleep(Duration::from_millis(10));
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::VecDeque;
    use std::sync::Mutex;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::time::Duration;

    use tokio::sync::Barrier;

    use crate::durable_participant::{
        ActorTransactionStart, DurableActorParticipant, ParticipantStartMode, PendingActorEffects,
    };

    #[derive(Clone, Debug, PartialEq)]
    enum Call {
        DbPrepare(database::TransactionCoordinatorPrepareRequest),
        Prepare(database::PrepareRequest),
        DbPrepared(database::TransactionCoordinatorPreparedRequest),
        DecisionPut(database::TransactionCoordinatorDecisionPutRequest),
        Commit(database::CommitRequest),
        Cleanup(database::TransactionCoordinatorCleanupRequest),
        Abort(database::AbortRequest),
        Recover(database::RecoverRequest),
    }
    #[derive(Default)]
    struct MockSidecar {
        calls: Mutex<Vec<Call>>,
        trace: Arc<Mutex<Vec<&'static str>>>,
        recover: Mutex<VecDeque<Result<database::RecoverResponse, Status>>>,
    }
    impl CoordinatorSidecar for MockSidecar {
        fn coordinator_prepare(
            &self,
            r: database::TransactionCoordinatorPrepareRequest,
        ) -> CoordinatorFuture<'_, database::TransactionCoordinatorPrepareResponse> {
            self.calls.lock().unwrap().push(Call::DbPrepare(r));
            self.trace.lock().unwrap().push("database.prepare");
            Box::pin(async { Ok(Default::default()) })
        }
        fn coordinator_prepared(
            &self,
            r: database::TransactionCoordinatorPreparedRequest,
        ) -> CoordinatorFuture<'_, database::TransactionCoordinatorPreparedResponse> {
            self.calls.lock().unwrap().push(Call::DbPrepared(r));
            self.trace.lock().unwrap().push("database.prepared");
            Box::pin(async { Ok(Default::default()) })
        }
        fn coordinator_cleanup(
            &self,
            r: database::TransactionCoordinatorCleanupRequest,
        ) -> CoordinatorFuture<'_, database::TransactionCoordinatorCleanupResponse> {
            self.calls.lock().unwrap().push(Call::Cleanup(r));
            self.trace.lock().unwrap().push("database.cleanup");
            Box::pin(async { Ok(Default::default()) })
        }
        fn decision_put(
            &self,
            request: database::TransactionCoordinatorDecisionPutRequest,
        ) -> CoordinatorFuture<'_, database::TransactionCoordinatorDecisionPutResponse> {
            self.calls.lock().unwrap().push(Call::DecisionPut(request));
            self.trace.lock().unwrap().push("database.decision");
            Box::pin(async { Ok(Default::default()) })
        }
        fn recover(
            &self,
            r: database::RecoverRequest,
        ) -> CoordinatorFuture<'_, Vec<database::RecoverResponse>> {
            self.calls.lock().unwrap().push(Call::Recover(r));
            self.trace.lock().unwrap().push("database.recover");
            let v = self
                .recover
                .lock()
                .unwrap()
                .drain(..)
                .collect::<Result<Vec<_>, _>>();
            Box::pin(async move { v })
        }
    }
    #[derive(Default)]
    struct MockEndpoint {
        calls: Mutex<Vec<Call>>,
        trace: Arc<Mutex<Vec<&'static str>>>,
        prepares: Mutex<VecDeque<Result<database::PrepareResponse, Status>>>,
    }
    impl ParticipantEndpoint for MockEndpoint {
        fn prepare(
            &self,
            _: &str,
            r: database::PrepareRequest,
        ) -> CoordinatorFuture<'_, database::PrepareResponse> {
            self.calls.lock().unwrap().push(Call::Prepare(r));
            self.trace.lock().unwrap().push("participant.prepare");
            let response = self
                .prepares
                .lock()
                .unwrap()
                .pop_front()
                .unwrap_or(Ok(Default::default()));
            Box::pin(async move { response })
        }
        fn commit(
            &self,
            _: &str,
            r: database::CommitRequest,
        ) -> CoordinatorFuture<'_, database::CommitResponse> {
            self.calls.lock().unwrap().push(Call::Commit(r));
            self.trace.lock().unwrap().push("participant.commit");
            Box::pin(async { Ok(Default::default()) })
        }
        fn abort(
            &self,
            _: &str,
            r: database::AbortRequest,
        ) -> CoordinatorFuture<'_, database::AbortResponse> {
            self.calls.lock().unwrap().push(Call::Abort(r));
            self.trace.lock().unwrap().push("participant.abort");
            Box::pin(async { Ok(Default::default()) })
        }
    }
    struct MockResolver {
        endpoint: Arc<MockEndpoint>,
    }
    impl ParticipantResolver for MockResolver {
        type Endpoint = MockEndpoint;
        fn resolve(&self, _: &ParticipantTarget) -> CoordinatorFuture<'_, Arc<Self::Endpoint>> {
            let e = Arc::clone(&self.endpoint);
            Box::pin(async move { Ok(e) })
        }
    }

    struct ConcurrentPrepareEndpoint {
        barrier: Arc<Barrier>,
        prepares: AtomicUsize,
    }

    impl ParticipantEndpoint for ConcurrentPrepareEndpoint {
        fn prepare(
            &self,
            _: &str,
            _: database::PrepareRequest,
        ) -> CoordinatorFuture<'_, database::PrepareResponse> {
            self.prepares.fetch_add(1, Ordering::SeqCst);
            let barrier = Arc::clone(&self.barrier);
            Box::pin(async move {
                barrier.wait().await;
                Ok(Default::default())
            })
        }

        fn commit(
            &self,
            _: &str,
            _: database::CommitRequest,
        ) -> CoordinatorFuture<'_, database::CommitResponse> {
            Box::pin(async { Ok(Default::default()) })
        }

        fn abort(
            &self,
            _: &str,
            _: database::AbortRequest,
        ) -> CoordinatorFuture<'_, database::AbortResponse> {
            Box::pin(async { Ok(Default::default()) })
        }
    }

    struct ConcurrentPrepareResolver {
        endpoint: Arc<ConcurrentPrepareEndpoint>,
    }

    impl ParticipantResolver for ConcurrentPrepareResolver {
        type Endpoint = ConcurrentPrepareEndpoint;

        fn resolve(&self, _: &ParticipantTarget) -> CoordinatorFuture<'_, Arc<Self::Endpoint>> {
            let endpoint = Arc::clone(&self.endpoint);
            Box::pin(async move { Ok(endpoint) })
        }
    }

    fn returned(target: ParticipantTarget) -> ReturnedParticipant {
        ReturnedParticipant {
            target,
            read_only: false,
        }
    }
    fn write_set(target: ParticipantTarget) -> ParticipantSet {
        ParticipantSet {
            should_commit: BTreeSet::from([target]),
            read_only: BTreeSet::new(),
        }
    }

    fn start(id: Uuid) -> RootCoordinatorStart {
        RootCoordinatorStart {
            transaction_ids: vec![id],
            coordinator_state_type: "example.Actor".into(),
            coordinator_state_ref: "actor/1".into(),
            participant: ParticipantTarget {
                state_type: "example.Actor".into(),
                state_ref: "actor/1".into(),
            },
            mode: TransactionMode::Exclusive,
            read_only: false,
            factory: false,
            placement_requested: false,
        }
    }
    fn shared_start(id: Uuid) -> RootCoordinatorStart {
        let mut value = start(id);
        value.mode = TransactionMode::Shared;
        value
    }

    async fn shared_promotion(id: Uuid) -> SharedPromotion {
        let sidecar = Arc::new(InProcessSidecar::default());
        *sidecar.load_state.lock().unwrap() = Some(vec![0]);
        let participant =
            DurableActorParticipant::new(Arc::clone(&sidecar), "example.Actor", "actor/1");
        let started = participant
            .start_local(
                ActorTransactionStart {
                    transaction_ids: vec![id],
                    transaction_path: crate::durable_participant::TransactionPathContract::RootOnly,
                    coordinator_state_type: "example.Actor".into(),
                    coordinator_state_ref: "actor/1".into(),
                    mode: TransactionMode::Shared,
                    read_only: false,
                    factory: false,
                    state_type: "example.Actor".into(),
                    state_ref: "actor/1".into(),
                },
                ParticipantStartMode::SharedUpgradeable,
            )
            .await
            .unwrap();
        started
            .stage(PendingActorEffects {
                state: Some(vec![1]),
                ..Default::default()
            })
            .await
            .unwrap()
            .expect("changed shared state must atomically produce a promotion proof")
    }

    fn coordinator(
        sidecar: Arc<MockSidecar>,
        endpoint: Arc<MockEndpoint>,
    ) -> DurableRootCoordinator<MockSidecar, MockResolver> {
        DurableRootCoordinator::new(sidecar, Arc::new(MockResolver { endpoint }))
    }

    #[derive(Default)]
    struct InProcessSidecar {
        calls: Mutex<Vec<&'static str>>,
        load_state: Mutex<Option<Vec<u8>>>,
    }

    impl ParticipantSidecar for InProcessSidecar {
        fn load(&self, _: database::LoadRequest) -> CoordinatorFuture<'_, database::LoadResponse> {
            self.calls.lock().unwrap().push("load");
            let state = self.load_state.lock().unwrap().clone();
            Box::pin(async move {
                Ok(database::LoadResponse {
                    actors: vec![database::Actor {
                        state_type: "example.Actor".into(),
                        state_ref: "actor/1".into(),
                        state,
                    }],
                    ..Default::default()
                })
            })
        }

        fn prepare(
            &self,
            _: database::TransactionParticipantPrepareRequest,
        ) -> CoordinatorFuture<'_, database::TransactionParticipantPrepareResponse> {
            self.calls.lock().unwrap().push("prepare");
            Box::pin(async { Ok(Default::default()) })
        }

        fn commit(
            &self,
            _: database::TransactionParticipantCommitRequest,
        ) -> CoordinatorFuture<'_, database::TransactionParticipantCommitResponse> {
            self.calls.lock().unwrap().push("commit");
            Box::pin(async { Ok(Default::default()) })
        }

        fn abort(
            &self,
            _: database::TransactionParticipantAbortRequest,
        ) -> CoordinatorFuture<'_, database::TransactionParticipantAbortResponse> {
            self.calls.lock().unwrap().push("abort");
            Box::pin(async { Ok(Default::default()) })
        }

        fn recover(
            &self,
            _: database::RecoverRequest,
        ) -> CoordinatorFuture<'_, Vec<database::RecoverResponse>> {
            self.calls.lock().unwrap().push("recover");
            Box::pin(async { Ok(Vec::new()) })
        }
        fn recover_idempotent_mutations(
            &self,
            _: database::RecoverIdempotentMutationsRequest,
        ) -> CoordinatorFuture<'_, Vec<database::RecoverIdempotentMutationsResponse>> {
            Box::pin(async { Ok(Vec::new()) })
        }
    }

    fn local_target() -> ParticipantTarget {
        ParticipantTarget {
            state_type: "example.Actor".into(),
            state_ref: "actor/1".into(),
        }
    }

    fn local_resolver(
        sidecar: Arc<InProcessSidecar>,
    ) -> SingleParticipantResolver<InProcessSidecar> {
        let participant = DurableActorParticipant::new(sidecar, "example.Actor", "actor/1");
        SingleParticipantResolver::new(
            local_target(),
            DurableActorParticipantHost::new(participant),
        )
        .unwrap()
    }

    #[tokio::test]
    async fn single_participant_resolver_resolves_only_its_exact_target_without_sidecar_io() {
        let sidecar = Arc::new(InProcessSidecar::default());
        let resolver = local_resolver(Arc::clone(&sidecar));

        resolver.resolve(&local_target()).await.unwrap();
        assert!(sidecar.calls.lock().unwrap().is_empty());

        for target in [
            ParticipantTarget {
                state_type: "example.OtherActor".into(),
                state_ref: "actor/1".into(),
            },
            ParticipantTarget {
                state_type: "example.Actor".into(),
                state_ref: "actor/2".into(),
            },
        ] {
            assert_eq!(
                resolver
                    .resolve(&target)
                    .await
                    .err()
                    .map(|error| error.code()),
                Some(tonic::Code::Unavailable)
            );
        }
        for target in [
            ParticipantTarget {
                state_type: String::new(),
                state_ref: "actor/1".into(),
            },
            ParticipantTarget {
                state_type: "example.Actor".into(),
                state_ref: String::new(),
            },
        ] {
            assert_eq!(
                resolver
                    .resolve(&target)
                    .await
                    .err()
                    .map(|error| error.code()),
                Some(tonic::Code::InvalidArgument)
            );
        }
        assert_eq!(
            SingleParticipantResolver::new(
                ParticipantTarget {
                    state_type: String::new(),
                    state_ref: "actor/1".into(),
                },
                DurableActorParticipantHost::new(DurableActorParticipant::new(
                    Arc::clone(&sidecar),
                    "example.Actor",
                    "actor/1",
                )),
            )
            .err()
            .map(|error| error.code()),
            Some(tonic::Code::InvalidArgument)
        );
        assert!(sidecar.calls.lock().unwrap().is_empty());
    }

    #[tokio::test]
    async fn coordinator_drives_the_configured_in_process_host_through_prepare_and_commit() {
        let participant_sidecar = Arc::new(InProcessSidecar::default());
        let participant = DurableActorParticipant::new(
            Arc::clone(&participant_sidecar),
            "example.Actor",
            "actor/1",
        );
        let id = Uuid::from_u128(44);
        participant
            .start(ActorTransactionStart {
                transaction_ids: vec![id],
                transaction_path: crate::durable_participant::TransactionPathContract::RootOnly,
                coordinator_state_type: "example.Actor".into(),
                coordinator_state_ref: "actor/1".into(),
                mode: TransactionMode::Exclusive,
                read_only: false,
                factory: false,
                state_type: "example.Actor".into(),
                state_ref: "actor/1".into(),
            })
            .await
            .unwrap();
        participant
            .stage(id, PendingActorEffects::default())
            .await
            .unwrap();
        participant_sidecar.calls.lock().unwrap().clear();

        let resolver = SingleParticipantResolver::new(
            local_target(),
            DurableActorParticipantHost::new(participant),
        )
        .unwrap();
        let coordinator =
            DurableRootCoordinator::new(Arc::new(MockSidecar::default()), Arc::new(resolver));
        coordinator.complete(start(id)).await.unwrap();

        assert_eq!(
            participant_sidecar.calls.lock().unwrap().as_slice(),
            ["prepare", "commit"]
        );
    }
    #[tokio::test]
    async fn persists_and_controls_single_participant_in_exact_order() {
        let trace = Arc::new(Mutex::new(Vec::new()));
        let sidecar = Arc::new(MockSidecar {
            trace: Arc::clone(&trace),
            ..Default::default()
        });
        let endpoint = Arc::new(MockEndpoint {
            trace: Arc::clone(&trace),
            ..Default::default()
        });
        let id = Uuid::from_u128(1);
        coordinator(Arc::clone(&sidecar), Arc::clone(&endpoint))
            .complete(start(id))
            .await
            .unwrap();
        let db = sidecar.calls.lock().unwrap().clone();
        let participant = endpoint.calls.lock().unwrap().clone();
        assert!(
            matches!(&db[0], Call::DbPrepare(r) if r.transaction_id == id.as_bytes() && r.transaction_coordinator.as_ref().is_some_and(|r| r.preparing && r.state_ref == "actor/1"))
        );
        assert!(
            matches!(&participant[0], Call::Prepare(r) if r.abort_via_response && !r.read_only && r.transaction_id == id.as_bytes())
        );
        assert!(
            matches!(&db[1], Call::DbPrepared(r) if r.transaction_coordinator.as_ref().is_some_and(|r| !r.preparing))
        );
        assert!(matches!(&participant[1], Call::Commit(r) if r.transaction_id == id.as_bytes()));
        assert!(matches!(
            &db[2],
            Call::DecisionPut(r)
                if r.root_transaction_id == id.as_bytes()
                    && r.decision.as_ref().is_some_and(|d| d.outcome == database::transaction_coordinator_decision::Outcome::Commit as i32)
        ));
        assert!(
            matches!(&db[3], Call::Cleanup(r) if r.transaction_id == id.as_bytes() && r.coordinator_state_ref == "actor/1")
        );
        assert_eq!(
            trace.lock().unwrap().as_slice(),
            [
                "database.prepare",
                "participant.prepare",
                "database.prepared",
                "database.decision",
                "participant.commit",
                "database.cleanup",
            ]
        );
    }

    #[tokio::test]
    async fn seals_before_concurrently_preparing_every_participant() {
        let sidecar = Arc::new(MockSidecar::default());
        let endpoint = Arc::new(ConcurrentPrepareEndpoint {
            barrier: Arc::new(Barrier::new(2)),
            prepares: AtomicUsize::new(0),
        });
        let coordinator = DurableRootCoordinator::new(
            Arc::clone(&sidecar),
            Arc::new(ConcurrentPrepareResolver {
                endpoint: Arc::clone(&endpoint),
            }),
        );
        let id = Uuid::from_u128(77);
        let remote = ParticipantTarget {
            state_type: "example.Remote".into(),
            state_ref: "remote/1".into(),
        };

        tokio::time::timeout(
            Duration::from_secs(1),
            coordinator.complete_with_returned_participants(start(id), vec![remote]),
        )
        .await
        .expect("both Prepare calls must enter the fan-out together")
        .unwrap();

        assert_eq!(endpoint.prepares.load(Ordering::SeqCst), 2);
        assert!(matches!(
            sidecar.calls.lock().unwrap().first(),
            Some(Call::DbPrepare(request)) if request.transaction_id == id.as_bytes()
        ));
    }

    #[tokio::test]
    async fn shared_local_promotion_persists_and_controls_the_single_writer_in_exact_order() {
        let trace = Arc::new(Mutex::new(Vec::new()));
        let sidecar = Arc::new(MockSidecar {
            trace: Arc::clone(&trace),
            ..Default::default()
        });
        let endpoint = Arc::new(MockEndpoint {
            trace: Arc::clone(&trace),
            ..Default::default()
        });
        let id = Uuid::from_u128(900);

        coordinator(Arc::clone(&sidecar), Arc::clone(&endpoint))
            .complete_shared_local_promotion(shared_start(id), shared_promotion(id).await)
            .await
            .unwrap();

        assert!(matches!(
            sidecar.calls.lock().unwrap().as_slice(),
            [Call::DbPrepare(prepare), Call::DbPrepared(prepared), Call::DecisionPut(decision), Call::Cleanup(cleanup)]
                if prepare.transaction_id == id.as_bytes()
                    && prepare.transaction_coordinator.as_ref().is_some_and(|record|
                        record.preparing
                            && record.participants.as_ref().is_some_and(|participants|
                                participants.read_only.is_empty()
                                    && participants.should_commit["example.Actor"].state_refs == vec!["actor/1"]))
                    && prepared.transaction_coordinator.as_ref().is_some_and(|record| !record.preparing)
                    && decision.decision.as_ref().is_some_and(|decision|
                        decision.outcome == database::transaction_coordinator_decision::Outcome::Commit as i32)
                    && cleanup.transaction_id == id.as_bytes()
        ));
        assert!(matches!(
            endpoint.calls.lock().unwrap().as_slice(),
            [Call::Prepare(prepare), Call::Commit(commit)]
                if !prepare.read_only && prepare.read_only_aware && prepare.transaction_id == id.as_bytes()
                    && commit.transaction_id == id.as_bytes()
        ));
        assert_eq!(
            trace.lock().unwrap().as_slice(),
            [
                "database.prepare",
                "participant.prepare",
                "database.prepared",
                "database.decision",
                "participant.commit",
                "database.cleanup",
            ]
        );
    }

    #[tokio::test]
    async fn shared_local_promotion_rejects_mismatched_and_unsupported_shapes_before_io() {
        let promotion_id = Uuid::from_u128(901);
        let wrong_root = shared_start(Uuid::from_u128(902));
        let mut wrong_type = shared_start(promotion_id);
        wrong_type.participant.state_type = "example.Other".into();
        let mut wrong_ref = shared_start(promotion_id);
        wrong_ref.participant.state_ref = "actor/other".into();
        let mut read_only = shared_start(promotion_id);
        read_only.read_only = true;
        let mut factory = shared_start(promotion_id);
        factory.factory = true;
        let mut placement = shared_start(promotion_id);
        placement.placement_requested = true;
        let mut exclusive = shared_start(promotion_id);
        exclusive.mode = TransactionMode::Exclusive;
        let mut multiple_ids = shared_start(promotion_id);
        multiple_ids.transaction_ids.push(Uuid::from_u128(903));

        for (invalid, expected) in [
            (wrong_root, tonic::Code::FailedPrecondition),
            (wrong_type, tonic::Code::FailedPrecondition),
            (wrong_ref, tonic::Code::FailedPrecondition),
            (read_only, tonic::Code::FailedPrecondition),
            (factory, tonic::Code::Unimplemented),
            (placement, tonic::Code::Unimplemented),
            (exclusive, tonic::Code::FailedPrecondition),
            (multiple_ids, tonic::Code::Unimplemented),
        ] {
            let sidecar = Arc::new(MockSidecar::default());
            let endpoint = Arc::new(MockEndpoint::default());
            assert_eq!(
                coordinator(Arc::clone(&sidecar), endpoint)
                    .complete_shared_local_promotion(invalid, shared_promotion(promotion_id).await)
                    .await
                    .unwrap_err()
                    .code(),
                expected
            );
            assert!(sidecar.calls.lock().unwrap().is_empty());
        }
    }

    #[tokio::test]
    async fn generic_completion_still_rejects_shared_writers_before_io() {
        let sidecar = Arc::new(MockSidecar::default());
        let endpoint = Arc::new(MockEndpoint::default());
        assert_eq!(
            coordinator(Arc::clone(&sidecar), endpoint)
                .complete_with_classified_returned_participants(
                    shared_start(Uuid::from_u128(904)),
                    Vec::new()
                )
                .await
                .unwrap_err()
                .code(),
            tonic::Code::FailedPrecondition
        );
        assert!(sidecar.calls.lock().unwrap().is_empty());
    }

    #[tokio::test]
    async fn factory_seals_deduplicated_remote_participants_before_prepare_and_waits_for_all_terminals()
     {
        let sidecar = Arc::new(MockSidecar::default());
        let endpoint = Arc::new(MockEndpoint::default());
        let id = Uuid::from_u128(6);
        let remote_a = ParticipantTarget {
            state_type: "example.Remote".into(),
            state_ref: "remote/a".into(),
        };
        let remote_b = ParticipantTarget {
            state_type: "example.Remote".into(),
            state_ref: "remote/b".into(),
        };
        let mut factory = start(id);
        factory.factory = true;
        coordinator(Arc::clone(&sidecar), Arc::clone(&endpoint))
            .complete_with_classified_returned_participants(
                factory,
                vec![
                    returned(remote_b.clone()),
                    returned(remote_a.clone()),
                    returned(remote_b.clone()),
                ],
            )
            .await
            .unwrap();

        let calls = sidecar.calls.lock().unwrap().clone();
        let prepared = match &calls[0] {
            Call::DbPrepare(request) => request.transaction_coordinator.as_ref().unwrap(),
            other => panic!("expected durable coordinator prepare, got {other:?}"),
        };
        assert_eq!(
            prepared
                .participants
                .as_ref()
                .unwrap()
                .should_commit
                .get("example.Remote")
                .unwrap()
                .state_refs,
            vec!["remote/a", "remote/b"],
        );
        assert_eq!(
            endpoint
                .calls
                .lock()
                .unwrap()
                .iter()
                .filter(|call| matches!(call, Call::Prepare(_)))
                .count(),
            3,
        );
        assert_eq!(
            endpoint
                .calls
                .lock()
                .unwrap()
                .iter()
                .filter(|call| matches!(call, Call::Commit(_)))
                .count(),
            3,
        );
        assert!(matches!(calls.last(), Some(Call::Cleanup(_))));
    }
    #[tokio::test]
    async fn definitive_abort_waits_for_every_participant_ack_before_cleanup() {
        let sidecar = Arc::new(MockSidecar::default());
        let endpoint = Arc::new(MockEndpoint::default());
        endpoint.prepares.lock().unwrap().extend([
            Ok(database::PrepareResponse::default()),
            Ok(database::PrepareResponse {
                abort: true,
                ..Default::default()
            }),
        ]);
        let id = Uuid::from_u128(7);
        coordinator(Arc::clone(&sidecar), Arc::clone(&endpoint))
            .complete_with_classified_returned_participants(
                start(id),
                vec![returned(ParticipantTarget {
                    state_type: "example.Remote".into(),
                    state_ref: "remote/a".into(),
                })],
            )
            .await
            .unwrap();
        let calls = endpoint.calls.lock().unwrap();
        assert_eq!(
            calls
                .iter()
                .filter(|call| matches!(call, Call::Prepare(_)))
                .count(),
            2
        );
        assert_eq!(
            calls
                .iter()
                .filter(|call| matches!(call, Call::Abort(_)))
                .count(),
            2
        );
        assert!(
            !sidecar
                .calls
                .lock()
                .unwrap()
                .iter()
                .any(|call| matches!(call, Call::DbPrepared(_)))
        );
        assert!(matches!(
            sidecar.calls.lock().unwrap().last(),
            Some(Call::Cleanup(_))
        ));
    }
    #[tokio::test]
    async fn only_prepare_abort_is_definitive_and_other_failures_leave_record() {
        let sidecar = Arc::new(MockSidecar::default());
        let endpoint = Arc::new(MockEndpoint::default());
        endpoint
            .prepares
            .lock()
            .unwrap()
            .push_back(Err(Status::unavailable("lost reply")));
        let id = Uuid::from_u128(2);
        assert_eq!(
            coordinator(Arc::clone(&sidecar), Arc::clone(&endpoint))
                .complete(start(id))
                .await
                .unwrap_err()
                .code(),
            tonic::Code::Unavailable
        );
        assert_eq!(sidecar.calls.lock().unwrap().len(), 1);
        assert_eq!(endpoint.calls.lock().unwrap().len(), 1);
        endpoint
            .prepares
            .lock()
            .unwrap()
            .push_back(Ok(database::PrepareResponse {
                abort: true,
                ..Default::default()
            }));
        let sidecar = Arc::new(MockSidecar::default());
        let endpoint = Arc::new(endpoint);
        coordinator(Arc::clone(&sidecar), Arc::clone(&endpoint))
            .complete(start(Uuid::from_u128(3)))
            .await
            .unwrap();
        assert!(matches!(
            endpoint.calls.lock().unwrap().last(),
            Some(Call::Abort(_))
        ));
        assert!(matches!(
            sidecar.calls.lock().unwrap().last(),
            Some(Call::Cleanup(_))
        ));
    }
    #[tokio::test]
    async fn recovery_reprepares_preparing_record_then_commits_and_cleans_up() {
        let trace = Arc::new(Mutex::new(Vec::new()));
        let sidecar = Arc::new(MockSidecar {
            trace: Arc::clone(&trace),
            ..Default::default()
        });
        let endpoint = Arc::new(MockEndpoint {
            trace: Arc::clone(&trace),
            ..Default::default()
        });
        let id = Uuid::from_u128(4);
        sidecar
            .recover
            .lock()
            .unwrap()
            .push_back(Ok(database::RecoverResponse {
                transaction_coordinators: [(
                    id.to_string(),
                    DurableRootCoordinator::<MockSidecar, MockResolver>::record(
                        "actor/1",
                        &write_set(start(id).participant),
                        true,
                    ),
                )]
                .into(),
                ..Default::default()
            }));
        coordinator(Arc::clone(&sidecar), Arc::clone(&endpoint))
            .recover(CoordinatorRecovery {
                state_tags_by_state_type: [("example.Actor".into(), "actor".into())].into(),
                shard_ids: vec!["a".into()],
                coordinator_state_ref: "actor/1".into(),
            })
            .await
            .unwrap();
        assert!(matches!(
            endpoint.calls.lock().unwrap().as_slice(),
            [Call::Prepare(_), Call::Commit(_)]
        ));
        assert!(matches!(
            sidecar.calls.lock().unwrap().as_slice(),
            [
                Call::Recover(_),
                Call::DbPrepared(_),
                Call::DecisionPut(_),
                Call::Cleanup(_)
            ]
        ));
        assert_eq!(
            trace.lock().unwrap().as_slice(),
            [
                "database.recover",
                "participant.prepare",
                "database.prepared",
                "database.decision",
                "participant.commit",
                "database.cleanup"
            ]
        );
    }
    #[tokio::test]
    async fn recovery_aborts_and_cleans_up_when_a_restarted_participant_has_no_pending_transaction()
    {
        let sidecar = Arc::new(MockSidecar::default());
        let endpoint = Arc::new(MockEndpoint::default());
        let id = Uuid::from_u128(41);
        sidecar
            .recover
            .lock()
            .unwrap()
            .push_back(Ok(database::RecoverResponse {
                transaction_coordinators: [(
                    id.to_string(),
                    DurableRootCoordinator::<MockSidecar, MockResolver>::record(
                        "actor/1",
                        &write_set(start(id).participant),
                        true,
                    ),
                )]
                .into(),
                ..Default::default()
            }));
        endpoint
            .prepares
            .lock()
            .unwrap()
            .push_back(Ok(database::PrepareResponse {
                abort: true,
                ..Default::default()
            }));

        coordinator(Arc::clone(&sidecar), Arc::clone(&endpoint))
            .recover(CoordinatorRecovery {
                state_tags_by_state_type: [("example.Actor".into(), "actor".into())].into(),
                shard_ids: vec!["a".into()],
                coordinator_state_ref: "actor/1".into(),
            })
            .await
            .unwrap();

        assert!(matches!(
            endpoint.calls.lock().unwrap().as_slice(),
            [Call::Prepare(_), Call::Abort(_)]
        ));
        assert!(matches!(
            sidecar.calls.lock().unwrap().as_slice(),
            [Call::Recover(_), Call::DecisionPut(_), Call::Cleanup(_)]
        ));
    }
    #[tokio::test]
    async fn recovery_commits_prepared_record_without_repreparing() {
        let sidecar = Arc::new(MockSidecar::default());
        let endpoint = Arc::new(MockEndpoint::default());
        let id = Uuid::from_u128(5);
        sidecar
            .recover
            .lock()
            .unwrap()
            .push_back(Ok(database::RecoverResponse {
                transaction_coordinators: [(
                    id.to_string(),
                    DurableRootCoordinator::<MockSidecar, MockResolver>::record(
                        "actor/1",
                        &write_set(start(id).participant),
                        false,
                    ),
                )]
                .into(),
                ..Default::default()
            }));
        coordinator(Arc::clone(&sidecar), Arc::clone(&endpoint))
            .recover(CoordinatorRecovery {
                state_tags_by_state_type: [("example.Actor".into(), "actor".into())].into(),
                shard_ids: vec!["a".into()],
                coordinator_state_ref: "actor/1".into(),
            })
            .await
            .unwrap();
        assert!(matches!(
            endpoint.calls.lock().unwrap().as_slice(),
            [Call::Commit(_)]
        ));
        assert!(matches!(
            sidecar.calls.lock().unwrap().as_slice(),
            [Call::Recover(_), Call::DecisionPut(_), Call::Cleanup(_)]
        ));
    }
    #[tokio::test]
    async fn read_only_root_is_prepared_released_and_excluded_from_commit_decision() {
        let sidecar = Arc::new(MockSidecar::default());
        let endpoint = Arc::new(MockEndpoint::default());
        let id = Uuid::from_u128(800);
        let mut root = start(id);
        root.mode = TransactionMode::Shared;
        root.read_only = true;
        coordinator(Arc::clone(&sidecar), Arc::clone(&endpoint))
            .complete_with_classified_returned_participants(
                root,
                vec![
                    ReturnedParticipant {
                        target: ParticipantTarget {
                            state_type: "example.Remote".into(),
                            state_ref: "reader".into(),
                        },
                        read_only: true,
                    },
                    ReturnedParticipant {
                        target: ParticipantTarget {
                            state_type: "example.Remote".into(),
                            state_ref: "writer".into(),
                        },
                        read_only: false,
                    },
                    // Write wins over a duplicate read-only trailer.
                    ReturnedParticipant {
                        target: ParticipantTarget {
                            state_type: "example.Remote".into(),
                            state_ref: "writer".into(),
                        },
                        read_only: true,
                    },
                ],
            )
            .await
            .unwrap_err();
        // A shared root may not acquire a writer from a trailer, and it fails
        // before it seals any durable record.
        assert!(sidecar.calls.lock().unwrap().is_empty());

        let mut root = start(id);
        root.mode = TransactionMode::Shared;
        root.read_only = true;
        coordinator(Arc::clone(&sidecar), Arc::clone(&endpoint))
            .complete_with_classified_returned_participants(
                root,
                vec![ReturnedParticipant {
                    target: ParticipantTarget {
                        state_type: "example.Remote".into(),
                        state_ref: "reader".into(),
                    },
                    read_only: true,
                }],
            )
            .await
            .unwrap();
        let calls = sidecar.calls.lock().unwrap().clone();
        let record = match &calls[0] {
            Call::DbPrepare(request) => request.transaction_coordinator.as_ref().unwrap(),
            other => panic!("expected prepare record, got {other:?}"),
        };
        assert!(
            record
                .participants
                .as_ref()
                .unwrap()
                .should_commit
                .is_empty()
        );
        assert_eq!(
            record.participants.as_ref().unwrap().read_only["example.Actor"].state_refs,
            vec!["actor/1"]
        );
        assert_eq!(
            record.participants.as_ref().unwrap().read_only["example.Remote"].state_refs,
            vec!["reader"]
        );
        let participant = endpoint.calls.lock().unwrap().clone();
        assert_eq!(
            participant
                .iter()
                .filter(|call| matches!(call, Call::Prepare(_)))
                .count(),
            2
        );
        assert!(participant.iter().filter(|call| matches!(call, Call::Prepare(request) if request.read_only_aware && request.read_only)).count() == 2);
        assert_eq!(
            participant
                .iter()
                .filter(|call| matches!(call, Call::Commit(_)))
                .count(),
            0
        );
        assert!(
            matches!(&calls[2], Call::DecisionPut(request) if request.decision.as_ref().is_some_and(|decision| decision.participants.as_ref().is_some_and(|participants| participants.should_commit.is_empty() && participants.read_only.is_empty())))
        );
    }

    #[tokio::test]
    async fn recovery_skips_read_only_participants_and_commits_only_writers() {
        let sidecar = Arc::new(MockSidecar::default());
        let endpoint = Arc::new(MockEndpoint::default());
        let id = Uuid::from_u128(801);
        let mut participants = ParticipantSet::default();
        participants.add(start(id).participant, false);
        participants.add(
            ParticipantTarget {
                state_type: "example.Remote".into(),
                state_ref: "reader".into(),
            },
            true,
        );
        sidecar
            .recover
            .lock()
            .unwrap()
            .push_back(Ok(database::RecoverResponse {
                transaction_coordinators: [(
                    id.to_string(),
                    DurableRootCoordinator::<MockSidecar, MockResolver>::record(
                        "actor/1",
                        &participants,
                        true,
                    ),
                )]
                .into(),
                ..Default::default()
            }));
        coordinator(Arc::clone(&sidecar), Arc::clone(&endpoint))
            .recover(CoordinatorRecovery {
                state_tags_by_state_type: Default::default(),
                shard_ids: vec!["a".into()],
                coordinator_state_ref: "actor/1".into(),
            })
            .await
            .unwrap();
        let calls = endpoint.calls.lock().unwrap().clone();
        assert_eq!(
            calls
                .iter()
                .filter(|call| matches!(call, Call::Prepare(_)))
                .count(),
            1
        );
        assert!(
            matches!(&calls[0], Call::Prepare(request) if request.read_only_aware && !request.read_only)
        );
        assert_eq!(
            calls
                .iter()
                .filter(|call| matches!(call, Call::Commit(_)))
                .count(),
            1
        );
    }

    #[tokio::test]
    async fn recovery_of_all_read_only_root_persists_empty_commit_set_without_fanout() {
        let sidecar = Arc::new(MockSidecar::default());
        let endpoint = Arc::new(MockEndpoint::default());
        let id = Uuid::from_u128(802);
        let mut participants = ParticipantSet::default();
        participants.add(start(id).participant, true);
        participants.add(
            ParticipantTarget {
                state_type: "example.Remote".into(),
                state_ref: "reader".into(),
            },
            true,
        );
        sidecar
            .recover
            .lock()
            .unwrap()
            .push_back(Ok(database::RecoverResponse {
                transaction_coordinators: [(
                    id.to_string(),
                    DurableRootCoordinator::<MockSidecar, MockResolver>::record(
                        "actor/1",
                        &participants,
                        false,
                    ),
                )]
                .into(),
                ..Default::default()
            }));
        coordinator(Arc::clone(&sidecar), Arc::clone(&endpoint))
            .recover(CoordinatorRecovery {
                state_tags_by_state_type: Default::default(),
                shard_ids: vec!["a".into()],
                coordinator_state_ref: "actor/1".into(),
            })
            .await
            .unwrap();
        assert!(endpoint.calls.lock().unwrap().is_empty());
        let calls = sidecar.calls.lock().unwrap().clone();
        assert!(matches!(
            &calls[..],
            [Call::Recover(_), Call::DecisionPut(request), Call::Cleanup(_)]
                if request.decision.as_ref().is_some_and(|decision|
                    decision.outcome == database::transaction_coordinator_decision::Outcome::Commit as i32
                    && decision.participants.as_ref().is_some_and(|participants|
                        participants.should_commit.is_empty() && participants.read_only.is_empty()))
        ));
    }

    #[tokio::test]
    async fn rejects_unsupported_shapes_before_sidecar_io() {
        let sidecar = Arc::new(MockSidecar::default());
        let endpoint = Arc::new(MockEndpoint::default());
        let mut value = start(Uuid::from_u128(5));
        value.transaction_ids.push(Uuid::from_u128(6));
        assert_eq!(
            coordinator(Arc::clone(&sidecar), endpoint)
                .complete(value)
                .await
                .unwrap_err()
                .code(),
            tonic::Code::Unimplemented
        );
        assert!(sidecar.calls.lock().unwrap().is_empty());
    }
}
