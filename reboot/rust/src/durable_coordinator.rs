//! Durable root coordinator for one exclusive actor participant.
//!
//! This is deliberately a narrow 2PC control path. It persists coordinator
//! records in the Database sidecar and reaches participants only through an
//! injected resolver. It does not choose placement, create actors, or support
//! nested, shared, read-only, factory, or multi-actor transactions.

use std::future::Future;
use std::pin::Pin;
use std::sync::Arc;

use tonic::{Request, Response, Status};
use uuid::Uuid;

use crate::{
    database_proto as database,
    durable_participant::{DurableActorParticipantHost, ParticipantSidecar},
    runtime::TransactionMode,
};

const STATE_REF_HEADER: &str = "x-reboot-state-ref";
type CoordinatorFuture<'a, T> = Pin<Box<dyn Future<Output = Result<T, Status>> + Send + 'a>>;

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ParticipantTarget {
    pub state_type: String,
    pub state_ref: String,
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

    pub async fn complete(&self, start: RootCoordinatorStart) -> Result<(), Status> {
        Self::validate_start(&start)?;
        let transaction_id = start.transaction_ids[0];
        let record = Self::record(&start.coordinator_state_ref, &start.participant, true);
        // This must be first: after any later ambiguity Recover has the exact
        // participant and coordinator identity needed to continue safely.
        self.sidecar
            .coordinator_prepare(database::TransactionCoordinatorPrepareRequest {
                transaction_id: transaction_id.as_bytes().to_vec(),
                transaction_coordinator: Some(record.clone()),
            })
            .await?;
        let endpoint = self.resolver.resolve(&start.participant).await?;
        let response = endpoint
            .prepare(
                &start.participant.state_ref,
                database::PrepareRequest {
                    transaction_id: transaction_id.as_bytes().to_vec(),
                    abort_via_response: true,
                    read_only_aware: false,
                    read_only: false,
                },
            )
            .await?;
        // Only this explicit field is definitive. Every RPC status (including
        // unavailable and old-peer behavior) remains ambiguous and leaves the
        // durable preparing record for recovery.
        if response.abort {
            endpoint
                .abort(
                    &start.participant.state_ref,
                    database::AbortRequest {
                        transaction_id: transaction_id.as_bytes().to_vec(),
                    },
                )
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
                    &start.participant,
                    false,
                )),
                ..Default::default()
            })
            .await?;
        endpoint
            .commit(
                &start.participant.state_ref,
                database::CommitRequest {
                    transaction_id: transaction_id.as_bytes().to_vec(),
                },
            )
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
            let participant = Self::participant_from_record(&record)?;
            let endpoint = self.resolver.resolve(&participant).await?;
            if record.preparing {
                let response = endpoint
                    .prepare(
                        &participant.state_ref,
                        database::PrepareRequest {
                            transaction_id: transaction_id.as_bytes().to_vec(),
                            abort_via_response: true,
                            read_only_aware: false,
                            read_only: false,
                        },
                    )
                    .await?;
                if response.abort {
                    endpoint
                        .abort(
                            &participant.state_ref,
                            database::AbortRequest {
                                transaction_id: transaction_id.as_bytes().to_vec(),
                            },
                        )
                        .await?;
                    self.cleanup(transaction_id, &record.state_ref).await?;
                    continue;
                }
                self.sidecar
                    .coordinator_prepared(database::TransactionCoordinatorPreparedRequest {
                        transaction_id: transaction_id.as_bytes().to_vec(),
                        transaction_coordinator: Some(Self::record(
                            &record.state_ref,
                            &participant,
                            false,
                        )),
                        ..Default::default()
                    })
                    .await?;
            }
            endpoint
                .commit(
                    &participant.state_ref,
                    database::CommitRequest {
                        transaction_id: transaction_id.as_bytes().to_vec(),
                    },
                )
                .await?;
            self.cleanup(transaction_id, &record.state_ref).await?;
        }
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
    fn validate_start(start: &RootCoordinatorStart) -> Result<(), Status> {
        if start.transaction_ids.len() != 1 {
            return Err(Status::unimplemented(
                "nested or shared transactions are not supported",
            ));
        }
        if start.mode != TransactionMode::Exclusive {
            return Err(Status::unimplemented(
                "shared transactions are not supported",
            ));
        }
        if start.read_only {
            return Err(Status::unimplemented(
                "read-only transactions are not supported",
            ));
        }
        if start.factory {
            return Err(Status::unimplemented(
                "factory transactions are not supported",
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
        if start.coordinator_state_type != start.participant.state_type
            || start.coordinator_state_ref != start.participant.state_ref
        {
            return Err(Status::unimplemented(
                "multi-actor transactions are not supported",
            ));
        }
        Ok(())
    }
    fn record(
        state_ref: &str,
        participant: &ParticipantTarget,
        preparing: bool,
    ) -> database::TransactionCoordinator {
        database::TransactionCoordinator {
            state_ref: state_ref.to_owned(),
            participants: Some(database::Participants {
                should_commit: [(
                    participant.state_type.clone(),
                    database::participants::StateRefs {
                        state_refs: vec![participant.state_ref.clone()],
                    },
                )]
                .into(),
                read_only: Default::default(),
            }),
            preparing,
        }
    }
    fn participant_from_record(
        record: &database::TransactionCoordinator,
    ) -> Result<ParticipantTarget, Status> {
        if !record
            .participants
            .as_ref()
            .is_none_or(|participants| participants.read_only.is_empty())
        {
            return Err(Status::unimplemented(
                "read-only coordinator recovery is not supported",
            ));
        }
        let participants = record.participants.as_ref().ok_or_else(|| {
            Status::failed_precondition("recovered coordinator has no participants")
        })?;
        if participants.should_commit.len() != 1 {
            return Err(Status::unimplemented(
                "multi-actor coordinator recovery is not supported",
            ));
        }
        let (state_type, refs) = participants
            .should_commit
            .iter()
            .next()
            .expect("len checked");
        if refs.state_refs.len() != 1 || state_type.is_empty() || refs.state_refs[0].is_empty() {
            return Err(Status::failed_precondition(
                "recovered coordinator must have one participant",
            ));
        }
        Ok(ParticipantTarget {
            state_type: state_type.clone(),
            state_ref: refs.state_refs[0].clone(),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::VecDeque;
    use std::sync::Mutex;

    use crate::durable_participant::{
        ActorTransactionStart, DurableActorParticipant, PendingActorEffects,
    };

    #[derive(Clone, Debug, PartialEq)]
    enum Call {
        DbPrepare(database::TransactionCoordinatorPrepareRequest),
        Prepare(database::PrepareRequest),
        DbPrepared(database::TransactionCoordinatorPreparedRequest),
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
    fn coordinator(
        sidecar: Arc<MockSidecar>,
        endpoint: Arc<MockEndpoint>,
    ) -> DurableRootCoordinator<MockSidecar, MockResolver> {
        DurableRootCoordinator::new(sidecar, Arc::new(MockResolver { endpoint }))
    }

    #[derive(Default)]
    struct InProcessSidecar {
        calls: Mutex<Vec<&'static str>>,
    }

    impl ParticipantSidecar for InProcessSidecar {
        fn load(&self, _: database::LoadRequest) -> CoordinatorFuture<'_, database::LoadResponse> {
            self.calls.lock().unwrap().push("load");
            Box::pin(async { Ok(Default::default()) })
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
        assert!(
            matches!(&db[2], Call::Cleanup(r) if r.transaction_id == id.as_bytes() && r.coordinator_state_ref == "actor/1")
        );
        assert_eq!(
            trace.lock().unwrap().as_slice(),
            [
                "database.prepare",
                "participant.prepare",
                "database.prepared",
                "participant.commit",
                "database.cleanup"
            ]
        );
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
                        &start(id).participant,
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
            [Call::Recover(_), Call::DbPrepared(_), Call::Cleanup(_)]
        ));
        assert_eq!(
            trace.lock().unwrap().as_slice(),
            [
                "database.recover",
                "participant.prepare",
                "database.prepared",
                "participant.commit",
                "database.cleanup"
            ]
        );
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
                        &start(id).participant,
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
            [Call::Recover(_), Call::Cleanup(_)]
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
