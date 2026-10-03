//! Isolated Native2pc v1 transport boundary.
//!
//! This module deliberately exposes **no transaction executor**. It validates
//! identity-bound Native2pc requests and offers host-routed Tonic clients plus
//! a bounded recovery materializer for state-only committed journals. It never
//! calls legacy `Database`, `Participant`, `TransactionCoordinator`, or
//! `Recover` RPCs. It does not construct actors, resolve placement, execute
//! opaque effects, or coordinate transactions.
//!
//! The protocol binds an enrollment digest but does not define a digest
//! derivation algorithm. Callers therefore must provide an already-bound,
//! non-empty digest; this module neither invents nor silently substitutes one.

use std::{
    collections::{BTreeMap, BTreeSet},
    future::Future,
    pin::Pin,
    sync::Arc,
};

use prost::Message;
use sha1::{Digest, Sha1};
use tonic::{Response, Status};

use crate::database_proto as proto;

pub const PROTOCOL_ID: &str = "reboot.native-2pc.v1";
pub const RECORD_VERSION: u32 = 1;

pub type NativeFuture<'a, T> = Pin<Box<dyn Future<Output = Result<T, Status>> + Send + 'a>>;

/// A validated immutable root transaction identity.
#[derive(Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub struct NativeTransactionId([u8; 16]);

impl NativeTransactionId {
    pub fn new(value: impl AsRef<[u8]>) -> Result<Self, Status> {
        let value = value.as_ref();
        let root = <[u8; 16]>::try_from(value).map_err(|_| {
            Status::invalid_argument("native root transaction id must be exactly 16 bytes")
        })?;
        Ok(Self(root))
    }

    pub fn bytes(&self) -> Vec<u8> {
        self.0.to_vec()
    }
}

/// A complete actor identity in the Native2pc namespace.
#[derive(Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub struct NativeActorId {
    state_type: String,
    state_ref: String,
}

impl NativeActorId {
    pub fn new(
        state_type: impl Into<String>,
        state_ref: impl Into<String>,
    ) -> Result<Self, Status> {
        let value = Self {
            state_type: state_type.into(),
            state_ref: state_ref.into(),
        };
        if value.state_type.is_empty() || value.state_ref.is_empty() {
            return Err(Status::invalid_argument(
                "native actor state type and reference must not be empty",
            ));
        }
        Ok(value)
    }

    pub fn state_type(&self) -> &str {
        &self.state_type
    }

    pub fn state_ref(&self) -> &str {
        &self.state_ref
    }

    fn to_proto(&self) -> proto::Native2pcActorId {
        proto::Native2pcActorId {
            state_type: self.state_type.clone(),
            state_ref: self.state_ref.clone(),
        }
    }
}

/// A trusted-plan shard boundary for a single application. `first_key` is
/// inclusive; boundaries must be strictly ordered and start with the empty key.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Native2pcShardRoute {
    pub shard_id: String,
    pub first_key: Vec<u8>,
    pub server_id: String,
}

/// A stale-tolerant routing answer, deliberately not an ownership lease or
/// authorization assertion.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Native2pcRoute {
    pub plan_version: i64,
    pub shard_id: String,
    pub server_id: String,
    pub address: String,
}

/// Immutable snapshot of the Python placement model for one application.
///
/// It hashes the first slash-separated state-ref component with SHA-1, chooses
/// the rightmost inclusive shard boundary at or below that hash, then resolves
/// shard -> server -> address. A later plan may supersede this answer; callers
/// must treat it as trusted internal-plane routing only, never as a fence or
/// proof of actor ownership.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Native2pcPlacementPlan {
    application_id: String,
    version: i64,
    shards: Vec<Native2pcShardRoute>,
    addresses: BTreeMap<String, String>,
}

impl Native2pcPlacementPlan {
    pub fn new(
        application_id: impl Into<String>,
        version: i64,
        shards: impl IntoIterator<Item = Native2pcShardRoute>,
        addresses: impl IntoIterator<Item = (String, String)>,
    ) -> Result<Self, Status> {
        let application_id = application_id.into();
        if application_id.is_empty() || version < 0 {
            return Err(invalid(
                "native placement application and version are required",
            ));
        }
        let shards = shards.into_iter().collect::<Vec<_>>();
        if shards.is_empty() || shards[0].first_key != Vec::<u8>::new() {
            return Err(invalid(
                "native placement shards must start with an empty boundary",
            ));
        }
        let addresses = addresses.into_iter().collect::<BTreeMap<_, _>>();
        let mut prior: Option<&[u8]> = None;
        for shard in &shards {
            if shard.shard_id.is_empty() || shard.server_id.is_empty() {
                return Err(invalid(
                    "native placement shard and server ids are required",
                ));
            }
            if prior.is_some_and(|prior| prior >= shard.first_key.as_slice()) {
                return Err(invalid(
                    "native placement shard boundaries must be strictly ordered",
                ));
            }
            if addresses.get(&shard.server_id).is_none_or(String::is_empty) {
                return Err(invalid(
                    "native placement requires a nonempty address for every server",
                ));
            }
            prior = Some(&shard.first_key);
        }
        Ok(Self {
            application_id,
            version,
            shards,
            addresses,
        })
    }

    pub fn application_id(&self) -> &str {
        &self.application_id
    }

    pub fn version(&self) -> i64 {
        self.version
    }

    pub fn route(
        &self,
        application_id: &str,
        actor: &NativeActorId,
    ) -> Result<Native2pcRoute, Status> {
        if application_id != self.application_id {
            return Err(Status::not_found("native placement application is unknown"));
        }
        let component = actor
            .state_ref()
            .split('/')
            .next()
            .filter(|component| !component.is_empty())
            .ok_or_else(|| invalid("native actor state reference has no routing component"))?;
        let hash = Sha1::digest(component.as_bytes());
        let index = self
            .shards
            .partition_point(|shard| shard.first_key.as_slice() <= hash.as_slice())
            .checked_sub(1)
            .expect("validated empty shard boundary");
        let shard = &self.shards[index];
        Ok(Native2pcRoute {
            plan_version: self.version,
            shard_id: shard.shard_id.clone(),
            server_id: shard.server_id.clone(),
            address: self.addresses[&shard.server_id].clone(),
        })
    }
}

/// A complete canonical participant collection, bound by a caller-supplied
/// digest. The digest algorithm is intentionally outside this protocol boundary.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct NativeEnrollment {
    participants: BTreeSet<NativeActorId>,
    digest: Vec<u8>,
}

impl NativeEnrollment {
    pub fn new(
        participants: impl IntoIterator<Item = NativeActorId>,
        digest: impl Into<Vec<u8>>,
    ) -> Result<Self, Status> {
        let participants = participants.into_iter().collect::<BTreeSet<_>>();
        let digest = digest.into();
        if participants.is_empty() {
            return Err(Status::invalid_argument(
                "native enrollment requires at least one participant",
            ));
        }
        if digest.is_empty() {
            return Err(Status::invalid_argument(
                "native enrollment digest must not be empty",
            ));
        }
        Ok(Self {
            participants,
            digest,
        })
    }

    pub fn participants(&self) -> impl Iterator<Item = &NativeActorId> {
        self.participants.iter()
    }

    pub fn digest(&self) -> &[u8] {
        &self.digest
    }

    fn entries(&self) -> Vec<proto::Native2pcEnrollment> {
        self.participants
            .iter()
            .map(|participant| proto::Native2pcEnrollment {
                participant: Some(participant.to_proto()),
                enrollment_digest: self.digest.clone(),
            })
            .collect()
    }
}

fn protocol() -> proto::Native2pcProtocol {
    proto::Native2pcProtocol {
        protocol_id: PROTOCOL_ID.into(),
        record_version: RECORD_VERSION,
    }
}

fn terminal_decision(commit: bool) -> i32 {
    if commit {
        proto::native2pc_terminal_request::Decision::Commit as i32
    } else {
        proto::native2pc_terminal_request::Decision::Abort as i32
    }
}

fn invalid(message: &'static str) -> Status {
    Status::invalid_argument(message)
}

fn validate_protocol(value: Option<&proto::Native2pcProtocol>) -> Result<(), Status> {
    let value = value.ok_or_else(|| invalid("native protocol is required"))?;
    if value.protocol_id != PROTOCOL_ID || value.record_version != RECORD_VERSION {
        return Err(invalid("native protocol must be reboot.native-2pc.v1/1"));
    }
    Ok(())
}

fn validate_actor(
    value: Option<&proto::Native2pcActorId>,
    name: &'static str,
) -> Result<(), Status> {
    let value = value.ok_or_else(|| invalid(name))?;
    if value.state_type.is_empty() || value.state_ref.is_empty() {
        return Err(invalid(name));
    }
    Ok(())
}

fn validate_identity(
    protocol: Option<&proto::Native2pcProtocol>,
    root: &[u8],
    coordinator: Option<&proto::Native2pcActorId>,
    digest: &[u8],
) -> Result<(), Status> {
    validate_protocol(protocol)?;
    NativeTransactionId::new(root)?;
    validate_actor(coordinator, "native coordinator identity is required")?;
    if digest.is_empty() {
        return Err(invalid("native enrollment digest is required"));
    }
    Ok(())
}

fn validate_coordinator_request(
    request: &proto::Native2pcPutCoordinatorRequest,
) -> Result<(), Status> {
    let record = request
        .coordinator
        .as_ref()
        .ok_or_else(|| invalid("native coordinator record is required"))?;
    validate_identity(
        record.protocol.as_ref(),
        &record.root_transaction_id,
        record.coordinator.as_ref(),
        &record.enrollment_digest,
    )?;
    if record.phase != proto::native2pc_coordinator_record::Phase::Preparing as i32
        || record.enrollment.is_empty()
    {
        return Err(invalid(
            "native coordinator must be an enrolled PREPARING record",
        ));
    }
    let mut prior: Option<&proto::Native2pcActorId> = None;
    for enrollment in &record.enrollment {
        validate_actor(
            enrollment.participant.as_ref(),
            "native enrolled participant identity is required",
        )?;
        if enrollment.enrollment_digest != record.enrollment_digest {
            return Err(invalid(
                "native enrollment digest does not match coordinator",
            ));
        }
        let current = enrollment.participant.as_ref().expect("validated above");
        if let Some(prior) = prior
            && (prior.state_type.as_str(), prior.state_ref.as_str())
                >= (current.state_type.as_str(), current.state_ref.as_str())
        {
            return Err(invalid(
                "native enrollment must be sorted and duplicate-free",
            ));
        }
        prior = Some(current);
    }
    Ok(())
}

fn validate_effects(effects: &proto::Native2pcActorEffects) -> Result<(), Status> {
    let mut prior: Option<&[u8]> = None;
    for effect in &effects.effects {
        if effect.key.is_empty() || effect.payload.is_empty() {
            return Err(invalid("native effect keys and payloads must be nonempty"));
        }
        if let Some(prior) = prior
            && prior >= effect.key.as_slice()
        {
            return Err(invalid("native effects must be sorted and duplicate-free"));
        }
        prior = Some(effect.key.as_slice());
    }
    Ok(())
}

fn validate_applied(applied: &proto::Native2pcAppliedActorEffects) -> Result<(), Status> {
    validate_identity(
        applied.protocol.as_ref(),
        &applied.root_transaction_id,
        applied.coordinator.as_ref(),
        &applied.enrollment_digest,
    )?;
    validate_actor(
        applied.participant.as_ref(),
        "native applied participant identity is required",
    )?;
    validate_effects(
        applied
            .effects
            .as_ref()
            .ok_or_else(|| invalid("native applied effects are required"))?,
    )
}

fn validate_state_only_applied(
    applied: &proto::Native2pcAppliedActorEffects,
) -> Result<(), Status> {
    validate_applied(applied)?;
    let effects = applied.effects.as_ref().expect("validated above");
    if effects.state.is_none() || !effects.effects.is_empty() {
        return Err(invalid(
            "native materialization supports exactly one state-only journal",
        ));
    }
    Ok(())
}

fn validate_recovered_coordinator(
    record: &proto::Native2pcCoordinatorRecord,
) -> Result<(), Status> {
    validate_identity(
        record.protocol.as_ref(),
        &record.root_transaction_id,
        record.coordinator.as_ref(),
        &record.enrollment_digest,
    )?;
    if record.enrollment.is_empty()
        || !matches!(
            proto::native2pc_coordinator_record::Phase::try_from(record.phase),
            Ok(proto::native2pc_coordinator_record::Phase::Preparing)
                | Ok(proto::native2pc_coordinator_record::Phase::CommitDecided)
                | Ok(proto::native2pc_coordinator_record::Phase::AbortDecided)
        )
    {
        return Err(invalid("native recovered coordinator is invalid"));
    }
    let mut prior: Option<&proto::Native2pcActorId> = None;
    for enrollment in &record.enrollment {
        validate_actor(
            enrollment.participant.as_ref(),
            "native enrolled participant identity is required",
        )?;
        if enrollment.enrollment_digest != record.enrollment_digest {
            return Err(invalid(
                "native enrollment digest does not match coordinator",
            ));
        }
        let current = enrollment.participant.as_ref().expect("validated above");
        if let Some(prior) = prior
            && (prior.state_type.as_str(), prior.state_ref.as_str())
                >= (current.state_type.as_str(), current.state_ref.as_str())
        {
            return Err(invalid(
                "native enrollment must be sorted and duplicate-free",
            ));
        }
        prior = Some(current);
    }
    Ok(())
}

fn validate_recovered_participant(
    record: &proto::Native2pcParticipantRecord,
) -> Result<(), Status> {
    validate_identity(
        record.protocol.as_ref(),
        &record.root_transaction_id,
        record.coordinator.as_ref(),
        &record.enrollment_digest,
    )?;
    validate_actor(
        record.participant.as_ref(),
        "native recovered participant identity is required",
    )?;
    if !matches!(
        proto::native2pc_participant_record::Phase::try_from(record.phase),
        Ok(proto::native2pc_participant_record::Phase::Staged)
            | Ok(proto::native2pc_participant_record::Phase::Prepared)
            | Ok(proto::native2pc_participant_record::Phase::Committed)
            | Ok(proto::native2pc_participant_record::Phase::Aborted)
    ) {
        return Err(invalid("native recovered participant phase is illegal"));
    }
    validate_effects(
        record
            .effects
            .as_ref()
            .ok_or_else(|| invalid("native recovered participant effects are required"))?,
    )
}

fn validate_recovery_response(response: &proto::Native2pcRecoverResponse) -> Result<(), Status> {
    let entries = usize::from(response.coordinator.is_some())
        + usize::from(response.participant.is_some())
        + usize::from(response.applied.is_some());
    if entries != 1 {
        return Err(invalid(
            "native recovery response must contain exactly one record",
        ));
    }
    if let Some(coordinator) = &response.coordinator {
        return validate_recovered_coordinator(coordinator);
    }
    if let Some(participant) = &response.participant {
        return validate_recovered_participant(participant);
    }
    let applied = response
        .applied
        .as_ref()
        .expect("exactly one response record");
    validate_applied(applied)?;
    if response.applied_journal.is_empty() {
        return Err(invalid(
            "native recovery applied journal bytes are required",
        ));
    }
    let wire_applied =
        proto::Native2pcAppliedActorEffects::decode(response.applied_journal.as_slice())
            .map_err(|_| Status::data_loss("malformed native recovery applied journal bytes"))?;
    validate_applied(&wire_applied)?;
    if wire_applied != *applied {
        return Err(Status::data_loss(
            "native recovery applied journal bytes conflict with journal",
        ));
    }
    Ok(())
}

fn validate_participant_request(
    request: &proto::Native2pcPutParticipantRequest,
) -> Result<(), Status> {
    let record = request
        .participant
        .as_ref()
        .ok_or_else(|| invalid("native participant record is required"))?;
    validate_identity(
        record.protocol.as_ref(),
        &record.root_transaction_id,
        record.coordinator.as_ref(),
        &record.enrollment_digest,
    )?;
    validate_actor(
        record.participant.as_ref(),
        "native participant identity is required",
    )?;
    if !matches!(
        proto::native2pc_participant_record::Phase::try_from(record.phase),
        Ok(proto::native2pc_participant_record::Phase::Staged)
            | Ok(proto::native2pc_participant_record::Phase::Prepared)
    ) {
        return Err(invalid(
            "native participant phase must be STAGED or PREPARED",
        ));
    }
    let effects = record
        .effects
        .as_ref()
        .ok_or_else(|| invalid("native participant effects are required"))?;
    validate_effects(effects)
}

fn validate_decision(
    protocol: Option<&proto::Native2pcProtocol>,
    root: &[u8],
    coordinator: Option<&proto::Native2pcActorId>,
    digest: &[u8],
) -> Result<(), Status> {
    validate_identity(protocol, root, coordinator, digest)
}

fn validate_terminal(terminal: &proto::Native2pcTerminalRequest) -> Result<(), Status> {
    validate_identity(
        terminal.protocol.as_ref(),
        &terminal.root_transaction_id,
        terminal.coordinator.as_ref(),
        &terminal.enrollment_digest,
    )?;
    validate_actor(
        terminal.participant.as_ref(),
        "native participant identity is required",
    )?;
    if !matches!(
        proto::native2pc_terminal_request::Decision::try_from(terminal.decision),
        Ok(proto::native2pc_terminal_request::Decision::Commit)
            | Ok(proto::native2pc_terminal_request::Decision::Abort)
    ) {
        return Err(invalid("native terminal decision must be COMMIT or ABORT"));
    }
    Ok(())
}

fn validate_prepare(request: &proto::Native2pcPrepareRequest) -> Result<(), Status> {
    validate_identity(
        request.protocol.as_ref(),
        &request.root_transaction_id,
        request.coordinator.as_ref(),
        &request.enrollment_digest,
    )?;
    validate_actor(
        request.participant.as_ref(),
        "native participant identity is required",
    )
}

fn validate_watch(request: &proto::Native2pcWatchRequest) -> Result<(), Status> {
    validate_identity(
        request.protocol.as_ref(),
        &request.root_transaction_id,
        request.coordinator.as_ref(),
        &request.enrollment_digest,
    )?;
    validate_actor(
        request.participant.as_ref(),
        "native participant identity is required",
    )
}

/// A pure continuation derived from one durably recovered PREPARED participant.
/// It owns no retry, routing, lock, RPC, or actor execution; a host recovery
/// driver may later execute the identity-bound requests it constructs.
#[derive(Clone, Debug)]
pub struct Native2pcPreparedParticipantRecovery {
    participant: proto::Native2pcParticipantRecord,
}

#[derive(Clone, Debug, PartialEq)]
pub enum Native2pcPreparedParticipantWatch {
    Pending,
    Terminal(proto::Native2pcTerminalParticipantRequest),
}

impl Native2pcPreparedParticipantRecovery {
    pub fn try_from_recovery(
        recovery: &proto::Native2pcRecoverResponse,
    ) -> Result<Option<Self>, Status> {
        validate_recovery_response(recovery)?;
        let Some(participant) = recovery.participant.as_ref() else {
            return Ok(None);
        };
        match proto::native2pc_participant_record::Phase::try_from(participant.phase) {
            Ok(proto::native2pc_participant_record::Phase::Prepared) => Ok(Some(Self {
                participant: participant.clone(),
            })),
            Ok(proto::native2pc_participant_record::Phase::Staged)
            | Ok(proto::native2pc_participant_record::Phase::Committed)
            | Ok(proto::native2pc_participant_record::Phase::Aborted) => Ok(None),
            _ => Err(invalid("native recovered participant phase is illegal")),
        }
    }

    pub fn watch_request(&self) -> proto::Native2pcWatchRequest {
        proto::Native2pcWatchRequest {
            protocol: self.participant.protocol.clone(),
            root_transaction_id: self.participant.root_transaction_id.clone(),
            coordinator: self.participant.coordinator.clone(),
            participant: self.participant.participant.clone(),
            enrollment_digest: self.participant.enrollment_digest.clone(),
        }
    }

    pub fn observe_watch(
        &self,
        watch: proto::Native2pcWatchResponse,
    ) -> Result<Native2pcPreparedParticipantWatch, Status> {
        let decision = match proto::native2pc_coordinator_record::Phase::try_from(watch.phase) {
            Ok(proto::native2pc_coordinator_record::Phase::Preparing) => {
                return Ok(Native2pcPreparedParticipantWatch::Pending);
            }
            Ok(proto::native2pc_coordinator_record::Phase::CommitDecided) => {
                proto::native2pc_terminal_request::Decision::Commit as i32
            }
            Ok(proto::native2pc_coordinator_record::Phase::AbortDecided) => {
                proto::native2pc_terminal_request::Decision::Abort as i32
            }
            _ => return Err(invalid("native recovery watch phase is illegal")),
        };
        Ok(Native2pcPreparedParticipantWatch::Terminal(
            proto::Native2pcTerminalParticipantRequest {
                terminal: Some(proto::Native2pcTerminalRequest {
                    protocol: self.participant.protocol.clone(),
                    root_transaction_id: self.participant.root_transaction_id.clone(),
                    participant: self.participant.participant.clone(),
                    coordinator: self.participant.coordinator.clone(),
                    enrollment_digest: self.participant.enrollment_digest.clone(),
                    decision,
                }),
            },
        ))
    }
}

/// One bounded attempt to continue a durably recovered participant. This has no
/// retry or scheduling semantics: transport errors remain non-definitive, and a
/// caller may retry the exact same recovery record later.
#[derive(Clone, Debug, PartialEq)]
pub enum Native2pcPreparedParticipantRecoveryPass {
    NotPrepared,
    Pending,
    Terminalized(proto::Native2pcTerminalParticipantResponse),
}

fn validate_terminal_response(
    request: &proto::Native2pcTerminalRequest,
    terminal_phase: i32,
) -> Result<(), Status> {
    validate_terminal(request)?;
    let expected = match proto::native2pc_terminal_request::Decision::try_from(request.decision) {
        Ok(proto::native2pc_terminal_request::Decision::Commit) => {
            proto::native2pc_participant_record::Phase::Committed
        }
        Ok(proto::native2pc_terminal_request::Decision::Abort) => {
            proto::native2pc_participant_record::Phase::Aborted
        }
        _ => return Err(invalid("native terminal decision is illegal")),
    };
    if terminal_phase != expected as i32 {
        return Err(Status::data_loss(
            "native terminal response conflicts with decision",
        ));
    }
    Ok(())
}

fn validate_terminal_participant_response(
    request: &proto::Native2pcTerminalParticipantRequest,
    response: &proto::Native2pcTerminalParticipantResponse,
) -> Result<(), Status> {
    validate_terminal_response(
        request
            .terminal
            .as_ref()
            .ok_or_else(|| invalid("native terminal request is required"))?,
        response.terminal_phase,
    )
}

/// Resolves the coordinator recorded by one prepared participant, watches that
/// exact identity-bound decision once, then terminalizes through the native
/// sidecar only when the decision is durable. It owns no retry loop, actor lock,
/// placement policy, legacy fallback, effect interpretation, or materialization.
pub async fn recover_prepared_participant_once<
    S: Native2pcDatabaseSidecar + ?Sized,
    R: Native2pcCoordinatorResolver + ?Sized,
>(
    sidecar: &S,
    coordinator_resolver: &R,
    recovery: &proto::Native2pcRecoverResponse,
) -> Result<Native2pcPreparedParticipantRecoveryPass, Status> {
    let Some(prepared) = Native2pcPreparedParticipantRecovery::try_from_recovery(recovery)? else {
        return Ok(Native2pcPreparedParticipantRecoveryPass::NotPrepared);
    };
    let coordinator = prepared
        .participant
        .coordinator
        .as_ref()
        .expect("validated prepared participant")
        .clone();
    let coordinator = NativeActorId::new(coordinator.state_type, coordinator.state_ref)
        .expect("validated prepared coordinator");
    let endpoint = coordinator_resolver.resolve(&coordinator).await?;
    match prepared.observe_watch(endpoint.watch(prepared.watch_request()).await?)? {
        Native2pcPreparedParticipantWatch::Pending => {
            Ok(Native2pcPreparedParticipantRecoveryPass::Pending)
        }
        Native2pcPreparedParticipantWatch::Terminal(request) => {
            let response = sidecar.terminal_participant(request.clone()).await?;
            validate_terminal_participant_response(&request, &response)?;
            Ok(Native2pcPreparedParticipantRecoveryPass::Terminalized(
                response,
            ))
        }
    }
}

/// A pure continuation derived from one durably recovered STAGED participant.
/// A staged participant cannot be committed: only the sidecar's durable
/// PREPARED record proves it reached the commit barrier. This continuation may
/// therefore issue only an identity-bound abort after observing a durable abort
/// decision; it owns no retry, routing, lock, RPC, or actor execution.
#[derive(Clone, Debug)]
pub struct Native2pcStagedParticipantRecovery {
    participant: proto::Native2pcParticipantRecord,
}

#[derive(Clone, Debug, PartialEq)]
pub enum Native2pcStagedParticipantWatch {
    Pending,
    Abort(proto::Native2pcTerminalParticipantRequest),
}

impl Native2pcStagedParticipantRecovery {
    pub fn try_from_recovery(
        recovery: &proto::Native2pcRecoverResponse,
    ) -> Result<Option<Self>, Status> {
        validate_recovery_response(recovery)?;
        let Some(participant) = recovery.participant.as_ref() else {
            return Ok(None);
        };
        match proto::native2pc_participant_record::Phase::try_from(participant.phase) {
            Ok(proto::native2pc_participant_record::Phase::Staged) => Ok(Some(Self {
                participant: participant.clone(),
            })),
            Ok(proto::native2pc_participant_record::Phase::Prepared)
            | Ok(proto::native2pc_participant_record::Phase::Committed)
            | Ok(proto::native2pc_participant_record::Phase::Aborted) => Ok(None),
            _ => Err(invalid("native recovered participant phase is illegal")),
        }
    }

    pub fn watch_request(&self) -> proto::Native2pcWatchRequest {
        proto::Native2pcWatchRequest {
            protocol: self.participant.protocol.clone(),
            root_transaction_id: self.participant.root_transaction_id.clone(),
            coordinator: self.participant.coordinator.clone(),
            participant: self.participant.participant.clone(),
            enrollment_digest: self.participant.enrollment_digest.clone(),
        }
    }

    pub fn observe_watch(
        &self,
        watch: proto::Native2pcWatchResponse,
    ) -> Result<Native2pcStagedParticipantWatch, Status> {
        match proto::native2pc_coordinator_record::Phase::try_from(watch.phase) {
            Ok(proto::native2pc_coordinator_record::Phase::Preparing) => {
                Ok(Native2pcStagedParticipantWatch::Pending)
            }
            Ok(proto::native2pc_coordinator_record::Phase::AbortDecided) => {
                Ok(Native2pcStagedParticipantWatch::Abort(
                    proto::Native2pcTerminalParticipantRequest {
                        terminal: Some(proto::Native2pcTerminalRequest {
                            protocol: self.participant.protocol.clone(),
                            root_transaction_id: self.participant.root_transaction_id.clone(),
                            participant: self.participant.participant.clone(),
                            coordinator: self.participant.coordinator.clone(),
                            enrollment_digest: self.participant.enrollment_digest.clone(),
                            decision: proto::native2pc_terminal_request::Decision::Abort as i32,
                        }),
                    },
                ))
            }
            Ok(proto::native2pc_coordinator_record::Phase::CommitDecided) => {
                Err(Status::data_loss(
                    "native staged participant conflicts with durable commit decision",
                ))
            }
            _ => Err(invalid("native recovery watch phase is illegal")),
        }
    }
}

/// One bounded attempt to continue a durably recovered staged participant.
#[derive(Clone, Debug, PartialEq)]
pub enum Native2pcStagedParticipantRecoveryPass {
    NotStaged,
    Pending,
    Terminalized(proto::Native2pcTerminalParticipantResponse),
}

fn validate_staged_recovery_terminal_response(
    request: &proto::Native2pcTerminalParticipantRequest,
    response: &proto::Native2pcTerminalParticipantResponse,
) -> Result<(), Status> {
    let terminal = request
        .terminal
        .as_ref()
        .ok_or_else(|| invalid("native terminal request is required"))?;
    if terminal.decision != proto::native2pc_terminal_request::Decision::Abort as i32 {
        return Err(invalid("native staged recovery may only abort"));
    }
    validate_terminal_participant_response(request, response)
}

/// Resolves the coordinator recorded by one staged participant, watches that
/// exact identity-bound decision once, then terminalizes only a durable abort.
/// Commit is an integrity error because this record never crossed PREPARED.
/// This owns no retry loop, actor lock, placement policy, legacy fallback,
/// effect interpretation, or materialization.
pub async fn recover_staged_participant_once<
    S: Native2pcDatabaseSidecar + ?Sized,
    R: Native2pcCoordinatorResolver + ?Sized,
>(
    sidecar: &S,
    coordinator_resolver: &R,
    recovery: &proto::Native2pcRecoverResponse,
) -> Result<Native2pcStagedParticipantRecoveryPass, Status> {
    let Some(staged) = Native2pcStagedParticipantRecovery::try_from_recovery(recovery)? else {
        return Ok(Native2pcStagedParticipantRecoveryPass::NotStaged);
    };
    let coordinator = staged
        .participant
        .coordinator
        .as_ref()
        .expect("validated staged participant")
        .clone();
    let coordinator = NativeActorId::new(coordinator.state_type, coordinator.state_ref)
        .expect("validated staged coordinator");
    let endpoint = coordinator_resolver.resolve(&coordinator).await?;
    match staged.observe_watch(endpoint.watch(staged.watch_request()).await?)? {
        Native2pcStagedParticipantWatch::Pending => {
            Ok(Native2pcStagedParticipantRecoveryPass::Pending)
        }
        Native2pcStagedParticipantWatch::Abort(request) => {
            let response = sidecar.terminal_participant(request.clone()).await?;
            validate_staged_recovery_terminal_response(&request, &response)?;
            Ok(Native2pcStagedParticipantRecoveryPass::Terminalized(
                response,
            ))
        }
    }
}

/// Identity-bound Native2pc request constructors. None of these performs I/O.
#[derive(Clone, Debug)]
pub struct Native2pcRequests {
    root: NativeTransactionId,
    coordinator: NativeActorId,
    enrollment: NativeEnrollment,
}

impl Native2pcRequests {
    pub fn new(
        root: NativeTransactionId,
        coordinator: NativeActorId,
        enrollment: NativeEnrollment,
    ) -> Self {
        Self {
            root,
            coordinator,
            enrollment,
        }
    }

    pub fn put_coordinator_preparing(&self) -> proto::Native2pcPutCoordinatorRequest {
        proto::Native2pcPutCoordinatorRequest {
            coordinator: Some(proto::Native2pcCoordinatorRecord {
                protocol: Some(protocol()),
                root_transaction_id: self.root.bytes(),
                coordinator: Some(self.coordinator.to_proto()),
                enrollment: self.enrollment.entries(),
                enrollment_digest: self.enrollment.digest.clone(),
                phase: proto::native2pc_coordinator_record::Phase::Preparing as i32,
            }),
        }
    }

    /// Builds a native participant record. Effects are an explicit native-v1
    /// envelope; an absent envelope is rejected before transport I/O.
    pub fn stage_participant(
        &self,
        participant: &NativeActorId,
    ) -> proto::Native2pcStageParticipantRequest {
        proto::Native2pcStageParticipantRequest {
            participant: Some(proto::Native2pcParticipantRecord {
                protocol: Some(protocol()),
                root_transaction_id: self.root.bytes(),
                participant: Some(participant.to_proto()),
                coordinator: Some(self.coordinator.to_proto()),
                enrollment_digest: self.enrollment.digest.clone(),
                phase: proto::native2pc_participant_record::Phase::Staged as i32,
                effects: Some(proto::Native2pcActorEffects::default()),
            }),
        }
    }

    /// Builds the exact PREPARED record required by the Native2pc persistence
    /// RPC. Staging uses `stage_participant`; this method intentionally has no
    /// phase toggle so it cannot construct a request the sidecar rejects.
    pub fn put_participant(
        &self,
        participant: &NativeActorId,
    ) -> proto::Native2pcPutParticipantRequest {
        proto::Native2pcPutParticipantRequest {
            participant: Some(proto::Native2pcParticipantRecord {
                protocol: Some(protocol()),
                root_transaction_id: self.root.bytes(),
                participant: Some(participant.to_proto()),
                coordinator: Some(self.coordinator.to_proto()),
                enrollment_digest: self.enrollment.digest.clone(),
                phase: proto::native2pc_participant_record::Phase::Prepared as i32,
                effects: Some(proto::Native2pcActorEffects::default()),
            }),
        }
    }

    pub fn prepare(&self, participant: &NativeActorId) -> proto::Native2pcPrepareRequest {
        proto::Native2pcPrepareRequest {
            protocol: Some(protocol()),
            root_transaction_id: self.root.bytes(),
            participant: Some(participant.to_proto()),
            coordinator: Some(self.coordinator.to_proto()),
            enrollment_digest: self.enrollment.digest.clone(),
        }
    }

    pub fn put_commit_decision(&self) -> proto::Native2pcPutCommitDecisionRequest {
        proto::Native2pcPutCommitDecisionRequest {
            protocol: Some(protocol()),
            root_transaction_id: self.root.bytes(),
            coordinator: Some(self.coordinator.to_proto()),
            enrollment_digest: self.enrollment.digest.clone(),
        }
    }

    pub fn put_abort_decision(&self) -> proto::Native2pcPutAbortDecisionRequest {
        proto::Native2pcPutAbortDecisionRequest {
            protocol: Some(protocol()),
            root_transaction_id: self.root.bytes(),
            coordinator: Some(self.coordinator.to_proto()),
            enrollment_digest: self.enrollment.digest.clone(),
        }
    }

    pub fn terminal(
        &self,
        participant: &NativeActorId,
        commit: bool,
    ) -> proto::Native2pcTerminalParticipantRequest {
        proto::Native2pcTerminalParticipantRequest {
            terminal: Some(proto::Native2pcTerminalRequest {
                protocol: Some(protocol()),
                root_transaction_id: self.root.bytes(),
                participant: Some(participant.to_proto()),
                coordinator: Some(self.coordinator.to_proto()),
                enrollment_digest: self.enrollment.digest.clone(),
                decision: terminal_decision(commit),
            }),
        }
    }

    pub fn watch(&self, participant: &NativeActorId) -> proto::Native2pcWatchRequest {
        proto::Native2pcWatchRequest {
            protocol: Some(protocol()),
            root_transaction_id: self.root.bytes(),
            coordinator: Some(self.coordinator.to_proto()),
            participant: Some(participant.to_proto()),
            enrollment_digest: self.enrollment.digest.clone(),
        }
    }
}

/// Result of one bounded native recovery pass. Coordinator and participant
/// records remain control-plane recovery work; this executor applies only the
/// explicitly supported state-only committed journals. Unsupported journals are
/// returned verbatim for a future native effect interpreter rather than being
/// treated as successful application.
#[derive(Debug, Default)]
pub struct Native2pcRecoveryMaterialization {
    pub recovered_records: usize,
    pub materialized: Vec<proto::Native2pcMaterializeAppliedResponse>,
    pub deferred: Vec<proto::Native2pcRecoverResponse>,
}

/// Runs the state-only portion of native recovery using the same trusted
/// internal-plane assumption as Reboot's Python state manager. It owns no actor
/// construction, placement, coordinator recovery, or opaque-effect execution.
pub struct Native2pcRecoveryMaterializer<S> {
    sidecar: S,
}

impl<S: Native2pcDatabaseSidecar> Native2pcRecoveryMaterializer<S> {
    pub fn new(sidecar: S) -> Self {
        Self { sidecar }
    }

    pub async fn recover_and_materialize(
        &self,
    ) -> Result<Native2pcRecoveryMaterialization, Status> {
        let recovered = self.sidecar.recover().await?;
        // Recovery streams are not ordered by actor version. Until native state
        // carries a durable version/order model, applying either of two distinct
        // journals for one actor would be arbitrary. Validate the full stream
        // before making any sidecar write, then defer every colliding actor.
        let mut state_only_journals = BTreeMap::<NativeActorId, BTreeSet<Vec<u8>>>::new();
        for record in &recovered {
            if let Some(actor) = recovered_state_only_actor(record)? {
                state_only_journals
                    .entry(actor)
                    .or_default()
                    .insert(record.applied_journal.clone());
            }
        }

        let mut result = Native2pcRecoveryMaterialization {
            recovered_records: recovered.len(),
            ..Default::default()
        };
        for record in recovered {
            let state_only_actor = recovered_state_only_actor(&record)?;
            let Some(actor) = state_only_actor else {
                if record.applied.is_some() {
                    result.deferred.push(record);
                }
                continue;
            };
            let actor_has_conflicting_journals = state_only_journals
                .get(&actor)
                .is_some_and(|journals| journals.len() > 1);
            if actor_has_conflicting_journals {
                result.deferred.push(record);
                continue;
            }
            let journal = record.applied_journal.clone();
            let response = self
                .sidecar
                .materialize_applied(proto::Native2pcMaterializeAppliedRequest {
                    applied_journal: journal.clone(),
                })
                .await?;
            validate_materialization_response(&journal, &response)?;
            result.materialized.push(response);
        }
        Ok(result)
    }
}

fn validate_materialization_response(
    journal: &[u8],
    response: &proto::Native2pcMaterializeAppliedResponse,
) -> Result<(), Status> {
    let applied = proto::Native2pcAppliedActorEffects::decode(journal)
        .map_err(|_| invalid("malformed native applied journal bytes"))?;
    validate_state_only_applied(&applied)?;
    let receipt = response
        .receipt
        .as_ref()
        .ok_or_else(|| Status::data_loss("native materialization receipt is required"))?;
    if receipt.applied.as_ref() != Some(&applied)
        || receipt.applied_journal != journal
        || response.state.as_deref()
            != applied
                .effects
                .as_ref()
                .and_then(|effects| effects.state.as_deref())
    {
        return Err(Status::data_loss(
            "native materialization response conflicts with journal",
        ));
    }
    Ok(())
}

fn recovered_state_only_actor(
    record: &proto::Native2pcRecoverResponse,
) -> Result<Option<NativeActorId>, Status> {
    validate_recovery_response(record)?;
    if record.applied.is_none() {
        return Ok(None);
    }
    // Classify from raw retained bytes, never the lossy prost projection. The
    // validator above proves its known fields agree with `record.applied` while
    // leaving additive unknown fields byte-exact for materialization.
    let applied = proto::Native2pcAppliedActorEffects::decode(record.applied_journal.as_slice())
        .map_err(|_| Status::data_loss("malformed native recovery applied journal bytes"))?;
    let effects = applied.effects.as_ref().expect("validated above");
    if effects.state.is_none() || !effects.effects.is_empty() {
        return Ok(None);
    }
    let participant = applied.participant.as_ref().expect("validated above");
    Ok(Some(
        NativeActorId::new(
            participant.state_type.clone(),
            participant.state_ref.clone(),
        )
        .expect("validated above"),
    ))
}

/// Dedicated Native2pc persistence boundary. It is deliberately distinct from
/// the legacy `Database` client and has no fallback implementation.
pub trait Native2pcDatabaseSidecar: Send + Sync + 'static {
    fn put_coordinator(
        &self,
        request: proto::Native2pcPutCoordinatorRequest,
    ) -> NativeFuture<'_, proto::Native2pcPutCoordinatorResponse>;
    fn put_participant(
        &self,
        request: proto::Native2pcPutParticipantRequest,
    ) -> NativeFuture<'_, proto::Native2pcPutParticipantResponse>;
    fn stage_participant(
        &self,
        request: proto::Native2pcStageParticipantRequest,
    ) -> NativeFuture<'_, proto::Native2pcStageParticipantResponse>;
    fn put_commit_decision(
        &self,
        request: proto::Native2pcPutCommitDecisionRequest,
    ) -> NativeFuture<'_, proto::Native2pcPutCommitDecisionResponse>;
    fn put_abort_decision(
        &self,
        request: proto::Native2pcPutAbortDecisionRequest,
    ) -> NativeFuture<'_, proto::Native2pcPutAbortDecisionResponse>;
    fn recover(&self) -> NativeFuture<'_, Vec<proto::Native2pcRecoverResponse>>;
    fn materialize_applied(
        &self,
        request: proto::Native2pcMaterializeAppliedRequest,
    ) -> NativeFuture<'_, proto::Native2pcMaterializeAppliedResponse>;
    fn terminal_participant(
        &self,
        request: proto::Native2pcTerminalParticipantRequest,
    ) -> NativeFuture<'_, proto::Native2pcTerminalParticipantResponse>;
}

/// The negotiated capabilities of one reachable Native2pc participant. This is
/// an observation only: a remote sidecar flag neither grants ownership nor
/// selects this process's sidecar.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct Native2pcParticipantCapabilities {
    pub native_sidecar_enabled: bool,
}

/// Builds the exact protocol/version capability request. Callers must negotiate
/// after resolving an endpoint; neither route nor capability is cacheable here.
pub fn native2pc_capabilities_request() -> proto::Native2pcCapabilitiesRequest {
    proto::Native2pcCapabilitiesRequest {
        required: Some(protocol()),
    }
}

fn validate_participant_capabilities_response(
    response: proto::Native2pcCapabilitiesResponse,
) -> Result<Native2pcParticipantCapabilities, Status> {
    validate_protocol(response.accepted.as_ref())?;
    if !response.native_participant_enabled {
        return Err(Status::failed_precondition(
            "remote endpoint does not enable reboot.native-2pc.v1 participant",
        ));
    }
    Ok(Native2pcParticipantCapabilities {
        native_sidecar_enabled: response.native_sidecar_enabled,
    })
}

/// Requires that this exact, independently resolved endpoint speaks Native2pc
/// v1. Transport errors remain non-definitive and are deliberately propagated;
/// this helper never probes or falls back to legacy services.
pub async fn require_native2pc_participant<E: Native2pcParticipantEndpoint + ?Sized>(
    endpoint: &E,
) -> Result<Native2pcParticipantCapabilities, Status> {
    validate_participant_capabilities_response(
        endpoint
            .capabilities(native2pc_capabilities_request())
            .await?,
    )
}

/// Host-routed native participant endpoint. A resolver owns placement; state
/// references are never interpreted as addresses by this module.
pub trait Native2pcParticipantEndpoint: Send + Sync + 'static {
    fn capabilities(
        &self,
        request: proto::Native2pcCapabilitiesRequest,
    ) -> NativeFuture<'_, proto::Native2pcCapabilitiesResponse>;
    fn prepare(
        &self,
        request: proto::Native2pcPrepareRequest,
    ) -> NativeFuture<'_, proto::Native2pcPrepareResponse>;
    fn terminal(
        &self,
        request: proto::Native2pcTerminalRequest,
    ) -> NativeFuture<'_, proto::Native2pcTerminalResponse>;
}

/// Host-routed coordinator observation endpoint. A future executor must use
/// this only after it has a durable native prepared participant to recover.
pub trait Native2pcCoordinatorEndpoint: Send + Sync + 'static {
    fn watch(
        &self,
        request: proto::Native2pcWatchRequest,
    ) -> NativeFuture<'_, proto::Native2pcWatchResponse>;
}

pub trait Native2pcParticipantResolver: Send + Sync + 'static {
    type Endpoint: Native2pcParticipantEndpoint;
    fn resolve(&self, actor: &NativeActorId) -> NativeFuture<'_, Arc<Self::Endpoint>>;
}

pub trait Native2pcCoordinatorResolver: Send + Sync + 'static {
    type Endpoint: Native2pcCoordinatorEndpoint;
    fn resolve(&self, actor: &NativeActorId) -> NativeFuture<'_, Arc<Self::Endpoint>>;
}

/// A freshly resolved endpoint and its point-in-time Native2pc capability
/// observation. This is sequential call composition, not a lease, ownership
/// proof, authorization decision, distributed atomic operation, or executor
/// safety guarantee. Each call resolves and negotiates again.
pub struct ResolvedNative2pcParticipant<E> {
    endpoint: Arc<E>,
    capabilities: Native2pcParticipantCapabilities,
}

impl<E> ResolvedNative2pcParticipant<E> {
    pub fn endpoint(&self) -> &Arc<E> {
        &self.endpoint
    }

    pub fn capabilities(&self) -> Native2pcParticipantCapabilities {
        self.capabilities
    }
}

/// Resolves one actor once and requires Native2pc v1 on exactly that endpoint.
/// Resolution and capability errors preserve their original status and this
/// helper deliberately performs no caching or legacy fallback.
pub async fn resolve_required_native2pc_participant<R: Native2pcParticipantResolver + ?Sized>(
    resolver: &R,
    actor: &NativeActorId,
) -> Result<ResolvedNative2pcParticipant<R::Endpoint>, Status> {
    let endpoint = resolver.resolve(actor).await?;
    let capabilities = require_native2pc_participant(endpoint.as_ref()).await?;
    Ok(ResolvedNative2pcParticipant {
        endpoint,
        capabilities,
    })
}

/// Tonic transport for the dedicated native sidecar service.
pub struct TonicNative2pcDatabaseSidecar {
    client: tokio::sync::Mutex<
        proto::native2pc_database_client::Native2pcDatabaseClient<tonic::transport::Channel>,
    >,
}

impl TonicNative2pcDatabaseSidecar {
    pub async fn connect(endpoint: impl AsRef<str>) -> Result<Self, tonic::transport::Error> {
        Ok(Self {
            client: tokio::sync::Mutex::new(
                proto::native2pc_database_client::Native2pcDatabaseClient::connect(
                    endpoint.as_ref().to_owned(),
                )
                .await?,
            ),
        })
    }
}

impl Native2pcDatabaseSidecar for TonicNative2pcDatabaseSidecar {
    fn put_coordinator(
        &self,
        request: proto::Native2pcPutCoordinatorRequest,
    ) -> NativeFuture<'_, proto::Native2pcPutCoordinatorResponse> {
        Box::pin(async move {
            validate_coordinator_request(&request)?;
            self.client
                .lock()
                .await
                .put_coordinator(request)
                .await
                .map(Response::into_inner)
        })
    }

    fn put_participant(
        &self,
        request: proto::Native2pcPutParticipantRequest,
    ) -> NativeFuture<'_, proto::Native2pcPutParticipantResponse> {
        Box::pin(async move {
            validate_participant_request(&request)?;
            self.client
                .lock()
                .await
                .put_participant(request)
                .await
                .map(Response::into_inner)
        })
    }

    fn stage_participant(
        &self,
        request: proto::Native2pcStageParticipantRequest,
    ) -> NativeFuture<'_, proto::Native2pcStageParticipantResponse> {
        Box::pin(async move {
            let participant = request
                .participant
                .as_ref()
                .ok_or_else(|| invalid("native participant record is required"))?;
            validate_participant_request(&proto::Native2pcPutParticipantRequest {
                participant: Some(participant.clone()),
            })?;
            if participant.phase != proto::native2pc_participant_record::Phase::Staged as i32 {
                return Err(invalid("native staged participant phase must be STAGED"));
            }
            self.client
                .lock()
                .await
                .stage_participant(request)
                .await
                .map(Response::into_inner)
        })
    }

    fn put_commit_decision(
        &self,
        request: proto::Native2pcPutCommitDecisionRequest,
    ) -> NativeFuture<'_, proto::Native2pcPutCommitDecisionResponse> {
        Box::pin(async move {
            validate_decision(
                request.protocol.as_ref(),
                &request.root_transaction_id,
                request.coordinator.as_ref(),
                &request.enrollment_digest,
            )?;
            self.client
                .lock()
                .await
                .put_commit_decision(request)
                .await
                .map(Response::into_inner)
        })
    }

    fn put_abort_decision(
        &self,
        request: proto::Native2pcPutAbortDecisionRequest,
    ) -> NativeFuture<'_, proto::Native2pcPutAbortDecisionResponse> {
        Box::pin(async move {
            validate_decision(
                request.protocol.as_ref(),
                &request.root_transaction_id,
                request.coordinator.as_ref(),
                &request.enrollment_digest,
            )?;
            self.client
                .lock()
                .await
                .put_abort_decision(request)
                .await
                .map(Response::into_inner)
        })
    }

    fn recover(&self) -> NativeFuture<'_, Vec<proto::Native2pcRecoverResponse>> {
        Box::pin(async move {
            let mut responses = self
                .client
                .lock()
                .await
                .recover_native2pc(proto::Native2pcRecoverRequest {
                    protocol: Some(protocol()),
                })
                .await?
                .into_inner();
            let mut recovered = Vec::new();
            while let Some(response) = responses.message().await? {
                validate_recovery_response(&response)?;
                recovered.push(response);
            }
            Ok(recovered)
        })
    }

    fn materialize_applied(
        &self,
        request: proto::Native2pcMaterializeAppliedRequest,
    ) -> NativeFuture<'_, proto::Native2pcMaterializeAppliedResponse> {
        Box::pin(async move {
            if request.applied_journal.is_empty() {
                return Err(invalid("native applied journal bytes are required"));
            }
            let applied =
                proto::Native2pcAppliedActorEffects::decode(request.applied_journal.as_slice())
                    .map_err(|_| invalid("malformed native applied journal bytes"))?;
            validate_state_only_applied(&applied)?;
            let journal = request.applied_journal.clone();
            let response = self
                .client
                .lock()
                .await
                .materialize_applied(request)
                .await?
                .into_inner();
            validate_materialization_response(&journal, &response)?;
            Ok(response)
        })
    }

    fn terminal_participant(
        &self,
        request: proto::Native2pcTerminalParticipantRequest,
    ) -> NativeFuture<'_, proto::Native2pcTerminalParticipantResponse> {
        Box::pin(async move {
            validate_terminal(
                request
                    .terminal
                    .as_ref()
                    .ok_or_else(|| invalid("native terminal request is required"))?,
            )?;
            let response = self
                .client
                .lock()
                .await
                .terminal_participant(request.clone())
                .await?
                .into_inner();
            validate_terminal_participant_response(&request, &response)?;
            Ok(response)
        })
    }
}

/// Tonic client for a host-resolved native participant endpoint.
pub struct TonicNative2pcParticipantEndpoint {
    client: tokio::sync::Mutex<
        proto::native2pc_participant_client::Native2pcParticipantClient<tonic::transport::Channel>,
    >,
}

impl TonicNative2pcParticipantEndpoint {
    pub fn new(channel: tonic::transport::Channel) -> Self {
        Self {
            client: tokio::sync::Mutex::new(
                proto::native2pc_participant_client::Native2pcParticipantClient::new(channel),
            ),
        }
    }
}

impl Native2pcParticipantEndpoint for TonicNative2pcParticipantEndpoint {
    fn capabilities(
        &self,
        request: proto::Native2pcCapabilitiesRequest,
    ) -> NativeFuture<'_, proto::Native2pcCapabilitiesResponse> {
        Box::pin(async move {
            validate_protocol(request.required.as_ref())?;
            self.client
                .lock()
                .await
                .get_capabilities(request)
                .await
                .map(Response::into_inner)
        })
    }

    fn prepare(
        &self,
        request: proto::Native2pcPrepareRequest,
    ) -> NativeFuture<'_, proto::Native2pcPrepareResponse> {
        Box::pin(async move {
            validate_prepare(&request)?;
            self.client
                .lock()
                .await
                .prepare(request)
                .await
                .map(Response::into_inner)
        })
    }

    fn terminal(
        &self,
        request: proto::Native2pcTerminalRequest,
    ) -> NativeFuture<'_, proto::Native2pcTerminalResponse> {
        Box::pin(async move {
            validate_terminal(&request)?;
            let response = self
                .client
                .lock()
                .await
                .terminal(request.clone())
                .await?
                .into_inner();
            validate_terminal_response(&request, response.terminal_phase)?;
            Ok(response)
        })
    }
}

/// Tonic client for a host-resolved native coordinator observation endpoint.
pub struct TonicNative2pcCoordinatorEndpoint {
    client: tokio::sync::Mutex<
        proto::native2pc_coordinator_client::Native2pcCoordinatorClient<tonic::transport::Channel>,
    >,
}

impl TonicNative2pcCoordinatorEndpoint {
    pub fn new(channel: tonic::transport::Channel) -> Self {
        Self {
            client: tokio::sync::Mutex::new(
                proto::native2pc_coordinator_client::Native2pcCoordinatorClient::new(channel),
            ),
        }
    }
}

impl Native2pcCoordinatorEndpoint for TonicNative2pcCoordinatorEndpoint {
    fn watch(
        &self,
        request: proto::Native2pcWatchRequest,
    ) -> NativeFuture<'_, proto::Native2pcWatchResponse> {
        Box::pin(async move {
            validate_watch(&request)?;
            self.client
                .lock()
                .await
                .watch(request)
                .await
                .map(Response::into_inner)
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn root() -> NativeTransactionId {
        NativeTransactionId::new([7; 16]).unwrap()
    }

    fn coordinator() -> NativeActorId {
        NativeActorId::new("example.Coordinator", "coordinator/1").unwrap()
    }

    fn participant(ref_: &str) -> NativeActorId {
        NativeActorId::new("example.Participant", ref_).unwrap()
    }

    fn requests() -> Native2pcRequests {
        Native2pcRequests::new(
            root(),
            coordinator(),
            NativeEnrollment::new(
                [participant("b"), participant("a"), participant("a")],
                [9, 8],
            )
            .unwrap(),
        )
    }

    #[test]
    fn terminal_response_must_exactly_match_the_requested_decision() {
        let participant = participant("a");
        for (commit, phase, accepted) in [
            (
                true,
                proto::native2pc_participant_record::Phase::Committed as i32,
                true,
            ),
            (
                false,
                proto::native2pc_participant_record::Phase::Aborted as i32,
                true,
            ),
            (
                true,
                proto::native2pc_participant_record::Phase::Aborted as i32,
                false,
            ),
            (
                false,
                proto::native2pc_participant_record::Phase::Committed as i32,
                false,
            ),
            (
                true,
                proto::native2pc_participant_record::Phase::Prepared as i32,
                false,
            ),
            (
                true,
                proto::native2pc_participant_record::Phase::Staged as i32,
                false,
            ),
            (
                true,
                proto::native2pc_participant_record::Phase::Unspecified as i32,
                false,
            ),
            (true, 999, false),
        ] {
            let request = requests().terminal(&participant, commit).terminal.unwrap();
            let result = validate_terminal_response(&request, phase);
            assert_eq!(result.is_ok(), accepted);
            if !accepted {
                assert_eq!(result.unwrap_err().code(), tonic::Code::DataLoss);
            }
        }
    }

    fn placement() -> Native2pcPlacementPlan {
        Native2pcPlacementPlan::new(
            "example-app",
            7,
            [
                Native2pcShardRoute {
                    shard_id: "s0".into(),
                    first_key: vec![],
                    server_id: "server-0".into(),
                },
                Native2pcShardRoute {
                    shard_id: "s1".into(),
                    first_key: vec![0x90],
                    server_id: "server-1".into(),
                },
                Native2pcShardRoute {
                    shard_id: "s2".into(),
                    first_key: vec![0xc0],
                    server_id: "server-2".into(),
                },
            ],
            [
                ("server-0".into(), "127.0.0.1:7000".into()),
                ("server-1".into(), "127.0.0.1:7001".into()),
                ("server-2".into(), "127.0.0.1:7002".into()),
            ],
        )
        .unwrap()
    }

    #[test]
    fn placement_matches_python_first_component_sha1_routing() {
        let plan = placement();
        assert_eq!(
            plan.route(
                "example-app",
                &NativeActorId::new("example.State", "a/colocated-child").unwrap(),
            )
            .unwrap(),
            Native2pcRoute {
                plan_version: 7,
                shard_id: "s0".into(),
                server_id: "server-0".into(),
                address: "127.0.0.1:7000".into(),
            }
        );
        assert_eq!(
            plan.route(
                "example-app",
                &NativeActorId::new("example.State", "first").unwrap(),
            )
            .unwrap()
            .shard_id,
            "s2"
        );
        assert_eq!(
            plan.route("wrong-app", &participant("a"))
                .unwrap_err()
                .code(),
            tonic::Code::NotFound
        );
    }

    #[test]
    fn placement_rejects_incomplete_or_ambiguous_plans() {
        assert!(
            Native2pcPlacementPlan::new(
                "example-app",
                0,
                [Native2pcShardRoute {
                    shard_id: "s".into(),
                    first_key: vec![1],
                    server_id: "server".into(),
                }],
                [("server".into(), "address".into())],
            )
            .is_err()
        );
        assert!(
            Native2pcPlacementPlan::new(
                "example-app",
                0,
                [
                    Native2pcShardRoute {
                        shard_id: "s0".into(),
                        first_key: vec![],
                        server_id: "server".into(),
                    },
                    Native2pcShardRoute {
                        shard_id: "s1".into(),
                        first_key: vec![],
                        server_id: "server".into(),
                    },
                ],
                [("server".into(), "address".into())],
            )
            .is_err()
        );
        assert!(
            Native2pcPlacementPlan::new(
                "example-app",
                0,
                [Native2pcShardRoute {
                    shard_id: "s".into(),
                    first_key: vec![],
                    server_id: "missing".into(),
                }],
                Vec::new(),
            )
            .is_err()
        );
    }

    #[test]
    fn root_identity_and_enrollment_are_validated_and_canonical() {
        assert_eq!(
            NativeTransactionId::new([1; 15]).unwrap_err().code(),
            tonic::Code::InvalidArgument
        );
        assert_eq!(
            NativeActorId::new("", "actor").unwrap_err().code(),
            tonic::Code::InvalidArgument
        );
        assert_eq!(
            NativeEnrollment::new(Vec::<NativeActorId>::new(), [1])
                .unwrap_err()
                .code(),
            tonic::Code::InvalidArgument
        );
        assert_eq!(
            NativeEnrollment::new([participant("a")], Vec::new())
                .unwrap_err()
                .code(),
            tonic::Code::InvalidArgument
        );
        assert_eq!(
            requests()
                .enrollment
                .participants()
                .map(NativeActorId::state_ref)
                .collect::<Vec<_>>(),
            ["a", "b"]
        );
    }

    #[test]
    fn request_builders_preserve_exact_native_identity_and_digest() {
        let requests = requests();
        let put = requests.put_coordinator_preparing();
        let coordinator = put.coordinator.unwrap();
        assert_eq!(coordinator.protocol.unwrap(), protocol());
        assert_eq!(coordinator.root_transaction_id, vec![7; 16]);
        assert_eq!(
            coordinator.coordinator.unwrap(),
            requests.coordinator.to_proto()
        );
        assert_eq!(coordinator.enrollment_digest, vec![9, 8]);
        assert_eq!(coordinator.enrollment.len(), 2);
        assert_eq!(
            coordinator
                .enrollment
                .iter()
                .map(|entry| entry.participant.as_ref().unwrap().state_ref.as_str())
                .collect::<Vec<_>>(),
            ["a", "b"]
        );
        assert!(
            coordinator
                .enrollment
                .iter()
                .all(|entry| entry.enrollment_digest == vec![9, 8])
        );

        let prepared = requests
            .put_participant(&participant("a"))
            .participant
            .unwrap();
        assert_eq!(
            prepared.phase,
            proto::native2pc_participant_record::Phase::Prepared as i32
        );
        assert_eq!(prepared.enrollment_digest, vec![9, 8]);
        assert_eq!(
            prepared.coordinator.unwrap(),
            requests.coordinator.to_proto()
        );
    }

    #[test]
    fn prepared_participant_recovery_builds_only_identity_bound_continuations() {
        let requests = requests();
        let prepared = requests
            .put_participant(&participant("a"))
            .participant
            .unwrap();
        let recovery = Native2pcPreparedParticipantRecovery::try_from_recovery(
            &proto::Native2pcRecoverResponse {
                participant: Some(prepared.clone()),
                ..Default::default()
            },
        )
        .unwrap()
        .expect("prepared participant must continue");
        assert_eq!(recovery.watch_request(), requests.watch(&participant("a")));

        for (phase, expected) in [
            (
                proto::native2pc_coordinator_record::Phase::CommitDecided,
                requests.terminal(&participant("a"), true),
            ),
            (
                proto::native2pc_coordinator_record::Phase::AbortDecided,
                requests.terminal(&participant("a"), false),
            ),
        ] {
            assert_eq!(
                recovery
                    .observe_watch(proto::Native2pcWatchResponse {
                        phase: phase as i32,
                    })
                    .unwrap(),
                Native2pcPreparedParticipantWatch::Terminal(expected)
            );
        }
        assert_eq!(
            recovery
                .observe_watch(proto::Native2pcWatchResponse {
                    phase: proto::native2pc_coordinator_record::Phase::Preparing as i32,
                })
                .unwrap(),
            Native2pcPreparedParticipantWatch::Pending
        );

        for phase in [
            proto::native2pc_coordinator_record::Phase::Unspecified as i32,
            99,
        ] {
            assert_eq!(
                recovery
                    .observe_watch(proto::Native2pcWatchResponse { phase })
                    .unwrap_err()
                    .code(),
                tonic::Code::InvalidArgument
            );
        }

        for phase in [
            proto::native2pc_participant_record::Phase::Committed,
            proto::native2pc_participant_record::Phase::Aborted,
        ] {
            let mut terminal = prepared.clone();
            terminal.phase = phase as i32;
            assert!(
                Native2pcPreparedParticipantRecovery::try_from_recovery(
                    &proto::Native2pcRecoverResponse {
                        participant: Some(terminal),
                        ..Default::default()
                    }
                )
                .unwrap()
                .is_none()
            );
        }

        assert_eq!(
            Native2pcPreparedParticipantRecovery::try_from_recovery(
                &proto::Native2pcRecoverResponse {
                    coordinator: requests.put_coordinator_preparing().coordinator,
                    participant: Some(prepared),
                    ..Default::default()
                }
            )
            .unwrap_err()
            .code(),
            tonic::Code::InvalidArgument
        );
    }

    #[test]
    fn participant_capability_negotiation_requires_exact_native_v1_support() {
        assert_eq!(native2pc_capabilities_request().required, Some(protocol()));
        for response in [
            proto::Native2pcCapabilitiesResponse::default(),
            proto::Native2pcCapabilitiesResponse {
                accepted: Some(proto::Native2pcProtocol {
                    protocol_id: PROTOCOL_ID.into(),
                    record_version: RECORD_VERSION + 1,
                }),
                native_participant_enabled: true,
                native_sidecar_enabled: false,
            },
        ] {
            assert_eq!(
                validate_participant_capabilities_response(response)
                    .unwrap_err()
                    .code(),
                tonic::Code::InvalidArgument
            );
        }
        assert_eq!(
            validate_participant_capabilities_response(proto::Native2pcCapabilitiesResponse {
                accepted: Some(protocol()),
                native_participant_enabled: false,
                native_sidecar_enabled: true,
            })
            .unwrap_err()
            .code(),
            tonic::Code::FailedPrecondition
        );
        for native_sidecar_enabled in [false, true] {
            assert_eq!(
                validate_participant_capabilities_response(proto::Native2pcCapabilitiesResponse {
                    accepted: Some(protocol()),
                    native_participant_enabled: true,
                    native_sidecar_enabled,
                })
                .unwrap(),
                Native2pcParticipantCapabilities {
                    native_sidecar_enabled,
                }
            );
        }
    }

    struct CapabilityEndpoint {
        response: Result<proto::Native2pcCapabilitiesResponse, Status>,
    }

    impl Native2pcParticipantEndpoint for CapabilityEndpoint {
        fn capabilities(
            &self,
            _: proto::Native2pcCapabilitiesRequest,
        ) -> NativeFuture<'_, proto::Native2pcCapabilitiesResponse> {
            Box::pin(async { self.response.clone() })
        }

        fn prepare(
            &self,
            _: proto::Native2pcPrepareRequest,
        ) -> NativeFuture<'_, proto::Native2pcPrepareResponse> {
            Box::pin(async { Err(Status::unimplemented("not used by capability tests")) })
        }

        fn terminal(
            &self,
            _: proto::Native2pcTerminalRequest,
        ) -> NativeFuture<'_, proto::Native2pcTerminalResponse> {
            Box::pin(async { Err(Status::unimplemented("not used by capability tests")) })
        }
    }

    struct RecordingCapabilityResolver {
        endpoint: Arc<CapabilityEndpoint>,
        resolved: std::sync::Mutex<Vec<NativeActorId>>,
    }

    impl Native2pcParticipantResolver for RecordingCapabilityResolver {
        type Endpoint = CapabilityEndpoint;

        fn resolve(&self, actor: &NativeActorId) -> NativeFuture<'_, Arc<Self::Endpoint>> {
            let actor = actor.clone();
            Box::pin(async move {
                self.resolved.lock().unwrap().push(actor);
                Ok(self.endpoint.clone())
            })
        }
    }

    #[tokio::test]
    async fn resolved_participant_negotiates_once_per_resolution_without_a_cache() {
        let endpoint = Arc::new(CapabilityEndpoint {
            response: Ok(proto::Native2pcCapabilitiesResponse {
                accepted: Some(protocol()),
                native_participant_enabled: true,
                native_sidecar_enabled: false,
            }),
        });
        let resolver = RecordingCapabilityResolver {
            endpoint: endpoint.clone(),
            resolved: std::sync::Mutex::new(Vec::new()),
        };
        let actor = participant("a");
        let first = resolve_required_native2pc_participant(&resolver, &actor)
            .await
            .unwrap();
        let second = resolve_required_native2pc_participant(&resolver, &actor)
            .await
            .unwrap();
        assert!(Arc::ptr_eq(first.endpoint(), &endpoint));
        assert!(Arc::ptr_eq(second.endpoint(), &endpoint));
        assert_eq!(
            first.capabilities(),
            Native2pcParticipantCapabilities {
                native_sidecar_enabled: false,
            }
        );
        assert_eq!(
            *resolver.resolved.lock().unwrap(),
            vec![actor.clone(), actor]
        );
    }

    #[tokio::test]
    async fn resolved_participant_does_not_probe_when_resolution_fails() {
        struct FailingResolver;
        impl Native2pcParticipantResolver for FailingResolver {
            type Endpoint = CapabilityEndpoint;

            fn resolve(&self, _: &NativeActorId) -> NativeFuture<'_, Arc<Self::Endpoint>> {
                Box::pin(async { Err(Status::unavailable("placement unavailable")) })
            }
        }
        let error =
            match resolve_required_native2pc_participant(&FailingResolver, &participant("a")).await
            {
                Ok(_) => panic!("failed resolution unexpectedly negotiated a participant"),
                Err(error) => error,
            };
        assert_eq!(error.code(), tonic::Code::Unavailable);
        assert_eq!(error.message(), "placement unavailable");
    }

    #[tokio::test]
    async fn participant_capability_transport_errors_remain_nondefinitive() {
        let endpoint = CapabilityEndpoint {
            response: Err(Status::unavailable("temporary native endpoint failure")),
        };
        let error = require_native2pc_participant(&endpoint).await.unwrap_err();
        assert_eq!(error.code(), tonic::Code::Unavailable);
        assert_eq!(error.message(), "temporary native endpoint failure");
    }

    #[test]
    fn transport_validators_reject_incomplete_generated_messages() {
        assert_eq!(
            validate_coordinator_request(&proto::Native2pcPutCoordinatorRequest::default())
                .unwrap_err()
                .code(),
            tonic::Code::InvalidArgument
        );
        assert_eq!(
            validate_participant_request(&proto::Native2pcPutParticipantRequest::default())
                .unwrap_err()
                .code(),
            tonic::Code::InvalidArgument
        );
        let mut empty_effect = requests().put_participant(&participant("a"));
        empty_effect
            .participant
            .as_mut()
            .unwrap()
            .effects
            .as_mut()
            .unwrap()
            .effects
            .push(proto::Native2pcEffect {
                key: vec![],
                payload: vec![1],
            });
        assert_eq!(
            validate_participant_request(&empty_effect)
                .unwrap_err()
                .code(),
            tonic::Code::InvalidArgument
        );
        let mut unsorted_effects = requests().put_participant(&participant("a"));
        let effects = unsorted_effects
            .participant
            .as_mut()
            .unwrap()
            .effects
            .as_mut()
            .unwrap();
        effects.effects.push(proto::Native2pcEffect {
            key: b"z".to_vec(),
            payload: vec![1],
        });
        effects.effects.push(proto::Native2pcEffect {
            key: b"a".to_vec(),
            payload: vec![1],
        });
        assert_eq!(
            validate_participant_request(&unsorted_effects)
                .unwrap_err()
                .code(),
            tonic::Code::InvalidArgument
        );
        assert_eq!(
            validate_decision(None, &[], None, &[]).unwrap_err().code(),
            tonic::Code::InvalidArgument
        );
        assert_eq!(
            validate_terminal(&proto::Native2pcTerminalRequest::default())
                .unwrap_err()
                .code(),
            tonic::Code::InvalidArgument
        );
        assert_eq!(
            validate_prepare(&proto::Native2pcPrepareRequest::default())
                .unwrap_err()
                .code(),
            tonic::Code::InvalidArgument
        );
        assert_eq!(
            validate_watch(&proto::Native2pcWatchRequest::default())
                .unwrap_err()
                .code(),
            tonic::Code::InvalidArgument
        );
        assert_eq!(
            validate_recovery_response(&proto::Native2pcRecoverResponse::default())
                .unwrap_err()
                .code(),
            tonic::Code::InvalidArgument
        );
        assert_eq!(
            validate_recovery_response(&proto::Native2pcRecoverResponse {
                coordinator: Some(proto::Native2pcCoordinatorRecord::default()),
                ..Default::default()
            })
            .unwrap_err()
            .code(),
            tonic::Code::InvalidArgument
        );
        let coordinator = requests().put_coordinator_preparing().coordinator.unwrap();
        let participant = requests()
            .put_participant(&participant("a"))
            .participant
            .unwrap();
        assert_eq!(
            validate_recovery_response(&proto::Native2pcRecoverResponse {
                coordinator: Some(coordinator),
                participant: Some(participant),
                ..Default::default()
            })
            .unwrap_err()
            .code(),
            tonic::Code::InvalidArgument
        );
        let staged = requests()
            .put_participant(&NativeActorId::new("example.Participant", "a").unwrap())
            .participant
            .unwrap();
        let mut applied = proto::Native2pcAppliedActorEffects {
            protocol: staged.protocol,
            root_transaction_id: staged.root_transaction_id,
            participant: staged.participant,
            coordinator: staged.coordinator,
            enrollment_digest: staged.enrollment_digest,
            effects: staged.effects,
        };
        assert_eq!(
            validate_state_only_applied(&applied).unwrap_err().code(),
            tonic::Code::InvalidArgument
        );
        applied.effects.as_mut().unwrap().state = Some(Vec::new());
        assert!(validate_state_only_applied(&applied).is_ok());
        applied
            .effects
            .as_mut()
            .unwrap()
            .effects
            .push(proto::Native2pcEffect {
                key: b"opaque".to_vec(),
                payload: b"effect".to_vec(),
            });
        assert_eq!(
            validate_state_only_applied(&applied).unwrap_err().code(),
            tonic::Code::InvalidArgument
        );
    }

    struct PreparedRecoverySidecar {
        terminal_response: Result<proto::Native2pcTerminalParticipantResponse, Status>,
        terminal_requests: std::sync::Mutex<Vec<proto::Native2pcTerminalParticipantRequest>>,
    }

    impl Native2pcDatabaseSidecar for PreparedRecoverySidecar {
        fn put_coordinator(
            &self,
            _: proto::Native2pcPutCoordinatorRequest,
        ) -> NativeFuture<'_, proto::Native2pcPutCoordinatorResponse> {
            Box::pin(async { Err(Status::unimplemented("not used")) })
        }
        fn put_participant(
            &self,
            _: proto::Native2pcPutParticipantRequest,
        ) -> NativeFuture<'_, proto::Native2pcPutParticipantResponse> {
            Box::pin(async { Err(Status::unimplemented("not used")) })
        }
        fn stage_participant(
            &self,
            _: proto::Native2pcStageParticipantRequest,
        ) -> NativeFuture<'_, proto::Native2pcStageParticipantResponse> {
            Box::pin(async { Err(Status::unimplemented("not used")) })
        }
        fn put_commit_decision(
            &self,
            _: proto::Native2pcPutCommitDecisionRequest,
        ) -> NativeFuture<'_, proto::Native2pcPutCommitDecisionResponse> {
            Box::pin(async { Err(Status::unimplemented("not used")) })
        }
        fn put_abort_decision(
            &self,
            _: proto::Native2pcPutAbortDecisionRequest,
        ) -> NativeFuture<'_, proto::Native2pcPutAbortDecisionResponse> {
            Box::pin(async { Err(Status::unimplemented("not used")) })
        }
        fn recover(&self) -> NativeFuture<'_, Vec<proto::Native2pcRecoverResponse>> {
            Box::pin(async { Err(Status::unimplemented("not used")) })
        }
        fn materialize_applied(
            &self,
            _: proto::Native2pcMaterializeAppliedRequest,
        ) -> NativeFuture<'_, proto::Native2pcMaterializeAppliedResponse> {
            Box::pin(async { Err(Status::unimplemented("not used")) })
        }
        fn terminal_participant(
            &self,
            request: proto::Native2pcTerminalParticipantRequest,
        ) -> NativeFuture<'_, proto::Native2pcTerminalParticipantResponse> {
            Box::pin(async move {
                self.terminal_requests.lock().unwrap().push(request);
                self.terminal_response.clone()
            })
        }
    }

    struct WatchEndpoint {
        response: Result<proto::Native2pcWatchResponse, Status>,
        requests: std::sync::Mutex<Vec<proto::Native2pcWatchRequest>>,
    }

    impl Native2pcCoordinatorEndpoint for WatchEndpoint {
        fn watch(
            &self,
            request: proto::Native2pcWatchRequest,
        ) -> NativeFuture<'_, proto::Native2pcWatchResponse> {
            Box::pin(async move {
                self.requests.lock().unwrap().push(request);
                self.response.clone()
            })
        }
    }

    struct WatchResolver {
        response: Result<Arc<WatchEndpoint>, Status>,
        actors: std::sync::Mutex<Vec<NativeActorId>>,
    }

    impl Native2pcCoordinatorResolver for WatchResolver {
        type Endpoint = WatchEndpoint;
        fn resolve(&self, actor: &NativeActorId) -> NativeFuture<'_, Arc<Self::Endpoint>> {
            let actor = actor.clone();
            Box::pin(async move {
                self.actors.lock().unwrap().push(actor);
                self.response.clone()
            })
        }
    }

    fn recovered_prepared() -> proto::Native2pcRecoverResponse {
        proto::Native2pcRecoverResponse {
            participant: requests().put_participant(&participant("a")).participant,
            ..Default::default()
        }
    }

    fn recovered_staged() -> proto::Native2pcRecoverResponse {
        proto::Native2pcRecoverResponse {
            participant: requests().stage_participant(&participant("a")).participant,
            ..Default::default()
        }
    }

    #[tokio::test]
    async fn staged_recovery_pass_aborts_only_after_a_durable_abort_decision() {
        let expected_abort = requests().terminal(&participant("a"), false);
        let staged = recovered_staged();
        for (phase, response, expected) in [
            (
                proto::native2pc_coordinator_record::Phase::Preparing,
                Err(Status::internal("must not terminalize pending")),
                Native2pcStagedParticipantRecoveryPass::Pending,
            ),
            (
                proto::native2pc_coordinator_record::Phase::AbortDecided,
                Ok(proto::Native2pcTerminalParticipantResponse {
                    terminal_phase: proto::native2pc_participant_record::Phase::Aborted as i32,
                }),
                Native2pcStagedParticipantRecoveryPass::Terminalized(
                    proto::Native2pcTerminalParticipantResponse {
                        terminal_phase: proto::native2pc_participant_record::Phase::Aborted as i32,
                    },
                ),
            ),
        ] {
            let endpoint = Arc::new(WatchEndpoint {
                response: Ok(proto::Native2pcWatchResponse {
                    phase: phase as i32,
                }),
                requests: std::sync::Mutex::new(Vec::new()),
            });
            let resolver = WatchResolver {
                response: Ok(endpoint.clone()),
                actors: std::sync::Mutex::new(Vec::new()),
            };
            let sidecar = PreparedRecoverySidecar {
                terminal_response: response,
                terminal_requests: std::sync::Mutex::new(Vec::new()),
            };
            assert_eq!(
                recover_staged_participant_once(&sidecar, &resolver, &staged)
                    .await
                    .unwrap(),
                expected
            );
            assert_eq!(*resolver.actors.lock().unwrap(), vec![coordinator()]);
            assert_eq!(
                *endpoint.requests.lock().unwrap(),
                vec![requests().watch(&participant("a"))]
            );
            if phase == proto::native2pc_coordinator_record::Phase::AbortDecided {
                assert_eq!(
                    *sidecar.terminal_requests.lock().unwrap(),
                    vec![expected_abort.clone()]
                );
            } else {
                assert!(sidecar.terminal_requests.lock().unwrap().is_empty());
            }
        }

        let endpoint = Arc::new(WatchEndpoint {
            response: Ok(proto::Native2pcWatchResponse {
                phase: proto::native2pc_coordinator_record::Phase::CommitDecided as i32,
            }),
            requests: std::sync::Mutex::new(Vec::new()),
        });
        let resolver = WatchResolver {
            response: Ok(endpoint),
            actors: std::sync::Mutex::new(Vec::new()),
        };
        let sidecar = PreparedRecoverySidecar {
            terminal_response: Err(Status::internal("must not terminalize commit conflict")),
            terminal_requests: std::sync::Mutex::new(Vec::new()),
        };
        assert_eq!(
            recover_staged_participant_once(&sidecar, &resolver, &staged)
                .await
                .unwrap_err()
                .code(),
            tonic::Code::DataLoss
        );
        assert!(sidecar.terminal_requests.lock().unwrap().is_empty());
    }

    #[tokio::test]
    async fn prepared_recovery_pass_watches_exact_coordinator_and_terminalizes_once() {
        for (phase, terminal_phase, expected) in [
            (
                proto::native2pc_coordinator_record::Phase::CommitDecided,
                proto::native2pc_participant_record::Phase::Committed,
                requests().terminal(&participant("a"), true),
            ),
            (
                proto::native2pc_coordinator_record::Phase::AbortDecided,
                proto::native2pc_participant_record::Phase::Aborted,
                requests().terminal(&participant("a"), false),
            ),
        ] {
            let endpoint = Arc::new(WatchEndpoint {
                response: Ok(proto::Native2pcWatchResponse {
                    phase: phase as i32,
                }),
                requests: std::sync::Mutex::new(Vec::new()),
            });
            let resolver = WatchResolver {
                response: Ok(endpoint.clone()),
                actors: std::sync::Mutex::new(Vec::new()),
            };
            let sidecar = PreparedRecoverySidecar {
                terminal_response: Ok(proto::Native2pcTerminalParticipantResponse {
                    terminal_phase: terminal_phase as i32,
                }),
                terminal_requests: std::sync::Mutex::new(Vec::new()),
            };
            assert_eq!(
                recover_prepared_participant_once(&sidecar, &resolver, &recovered_prepared())
                    .await
                    .unwrap(),
                Native2pcPreparedParticipantRecoveryPass::Terminalized(
                    proto::Native2pcTerminalParticipantResponse {
                        terminal_phase: terminal_phase as i32,
                    }
                )
            );
            assert_eq!(*resolver.actors.lock().unwrap(), vec![coordinator()]);
            assert_eq!(
                *endpoint.requests.lock().unwrap(),
                vec![requests().watch(&participant("a"))]
            );
            assert_eq!(*sidecar.terminal_requests.lock().unwrap(), vec![expected]);
        }
    }

    #[tokio::test]
    async fn prepared_recovery_pass_leaves_pending_and_failures_nonterminal() {
        let endpoint = Arc::new(WatchEndpoint {
            response: Ok(proto::Native2pcWatchResponse {
                phase: proto::native2pc_coordinator_record::Phase::Preparing as i32,
            }),
            requests: std::sync::Mutex::new(Vec::new()),
        });
        let resolver = WatchResolver {
            response: Ok(endpoint),
            actors: std::sync::Mutex::new(Vec::new()),
        };
        let sidecar = PreparedRecoverySidecar {
            terminal_response: Err(Status::internal("must not terminalize pending")),
            terminal_requests: std::sync::Mutex::new(Vec::new()),
        };
        assert_eq!(
            recover_prepared_participant_once(&sidecar, &resolver, &recovered_prepared())
                .await
                .unwrap(),
            Native2pcPreparedParticipantRecoveryPass::Pending
        );
        assert!(sidecar.terminal_requests.lock().unwrap().is_empty());

        let resolver = WatchResolver {
            response: Err(Status::unavailable("coordinator unavailable")),
            actors: std::sync::Mutex::new(Vec::new()),
        };
        assert_eq!(
            recover_prepared_participant_once(&sidecar, &resolver, &recovered_prepared())
                .await
                .unwrap_err()
                .code(),
            tonic::Code::Unavailable
        );
        assert!(sidecar.terminal_requests.lock().unwrap().is_empty());

        let mut terminal = recovered_prepared();
        terminal.participant.as_mut().unwrap().phase =
            proto::native2pc_participant_record::Phase::Committed as i32;
        assert_eq!(
            recover_prepared_participant_once(&sidecar, &resolver, &terminal)
                .await
                .unwrap(),
            Native2pcPreparedParticipantRecoveryPass::NotPrepared
        );
        assert_eq!(resolver.actors.lock().unwrap().len(), 1);
    }

    #[tokio::test]
    async fn prepared_recovery_pass_rejects_terminal_phase_mismatch_after_the_write() {
        let endpoint = Arc::new(WatchEndpoint {
            response: Ok(proto::Native2pcWatchResponse {
                phase: proto::native2pc_coordinator_record::Phase::CommitDecided as i32,
            }),
            requests: std::sync::Mutex::new(Vec::new()),
        });
        let resolver = WatchResolver {
            response: Ok(endpoint),
            actors: std::sync::Mutex::new(Vec::new()),
        };
        let sidecar = PreparedRecoverySidecar {
            terminal_response: Ok(proto::Native2pcTerminalParticipantResponse {
                terminal_phase: proto::native2pc_participant_record::Phase::Aborted as i32,
            }),
            terminal_requests: std::sync::Mutex::new(Vec::new()),
        };
        assert_eq!(
            recover_prepared_participant_once(&sidecar, &resolver, &recovered_prepared())
                .await
                .unwrap_err()
                .code(),
            tonic::Code::DataLoss
        );
        assert_eq!(sidecar.terminal_requests.lock().unwrap().len(), 1);
    }

    struct RecoverySidecar {
        records: Vec<proto::Native2pcRecoverResponse>,
        materialized: std::sync::Mutex<Vec<Vec<u8>>>,
    }

    impl Native2pcDatabaseSidecar for RecoverySidecar {
        fn put_coordinator(
            &self,
            _: proto::Native2pcPutCoordinatorRequest,
        ) -> NativeFuture<'_, proto::Native2pcPutCoordinatorResponse> {
            Box::pin(async { Err(Status::unimplemented("not used by recovery")) })
        }

        fn put_participant(
            &self,
            _: proto::Native2pcPutParticipantRequest,
        ) -> NativeFuture<'_, proto::Native2pcPutParticipantResponse> {
            Box::pin(async { Err(Status::unimplemented("not used by recovery")) })
        }

        fn stage_participant(
            &self,
            _: proto::Native2pcStageParticipantRequest,
        ) -> NativeFuture<'_, proto::Native2pcStageParticipantResponse> {
            Box::pin(async { Err(Status::unimplemented("not used by recovery")) })
        }

        fn put_commit_decision(
            &self,
            _: proto::Native2pcPutCommitDecisionRequest,
        ) -> NativeFuture<'_, proto::Native2pcPutCommitDecisionResponse> {
            Box::pin(async { Err(Status::unimplemented("not used by recovery")) })
        }

        fn put_abort_decision(
            &self,
            _: proto::Native2pcPutAbortDecisionRequest,
        ) -> NativeFuture<'_, proto::Native2pcPutAbortDecisionResponse> {
            Box::pin(async { Err(Status::unimplemented("not used by recovery")) })
        }

        fn recover(&self) -> NativeFuture<'_, Vec<proto::Native2pcRecoverResponse>> {
            Box::pin(async { Ok(self.records.clone()) })
        }

        fn materialize_applied(
            &self,
            request: proto::Native2pcMaterializeAppliedRequest,
        ) -> NativeFuture<'_, proto::Native2pcMaterializeAppliedResponse> {
            Box::pin(async move {
                let applied =
                    proto::Native2pcAppliedActorEffects::decode(request.applied_journal.as_slice())
                        .map_err(|_| Status::invalid_argument("malformed journal"))?;
                let state = applied
                    .effects
                    .as_ref()
                    .and_then(|effects| effects.state.clone())
                    .ok_or_else(|| Status::failed_precondition("state-only journal required"))?;
                self.materialized
                    .lock()
                    .unwrap()
                    .push(request.applied_journal.clone());
                Ok(proto::Native2pcMaterializeAppliedResponse {
                    receipt: Some(proto::Native2pcApplicationReceipt {
                        applied: Some(applied),
                        applied_journal: request.applied_journal,
                    }),
                    state: Some(state),
                })
            })
        }

        fn terminal_participant(
            &self,
            _: proto::Native2pcTerminalParticipantRequest,
        ) -> NativeFuture<'_, proto::Native2pcTerminalParticipantResponse> {
            Box::pin(async { Err(Status::unimplemented("not used by recovery")) })
        }
    }

    fn recovered_applied(state: Option<Vec<u8>>, opaque: bool) -> proto::Native2pcRecoverResponse {
        let participant = requests()
            .put_participant(&participant("a"))
            .participant
            .unwrap();
        let applied = proto::Native2pcAppliedActorEffects {
            protocol: participant.protocol,
            root_transaction_id: participant.root_transaction_id,
            participant: participant.participant,
            coordinator: participant.coordinator,
            enrollment_digest: participant.enrollment_digest,
            effects: Some(proto::Native2pcActorEffects {
                state,
                effects: opaque
                    .then(|| proto::Native2pcEffect {
                        key: b"opaque".to_vec(),
                        payload: b"defer".to_vec(),
                    })
                    .into_iter()
                    .collect(),
            }),
        };
        proto::Native2pcRecoverResponse {
            applied_journal: applied.encode_to_vec(),
            applied: Some(applied),
            ..Default::default()
        }
    }

    #[tokio::test]
    async fn recovery_materializer_validates_entire_stream_before_any_write() {
        let state_only = recovered_applied(Some(b"state".to_vec()), false);
        let sidecar = RecoverySidecar {
            records: vec![state_only, proto::Native2pcRecoverResponse::default()],
            materialized: std::sync::Mutex::new(Vec::new()),
        };
        let executor = Native2pcRecoveryMaterializer::new(sidecar);
        assert_eq!(
            executor.recover_and_materialize().await.unwrap_err().code(),
            tonic::Code::InvalidArgument
        );
        assert!(executor.sidecar.materialized.lock().unwrap().is_empty());
    }

    #[tokio::test]
    async fn recovery_materializer_rejects_raw_journal_projection_conflicts_before_any_write() {
        let mut record = recovered_applied(Some(b"state".to_vec()), false);
        let mut raw =
            proto::Native2pcAppliedActorEffects::decode(record.applied_journal.as_slice()).unwrap();
        let effects = raw.effects.as_mut().unwrap();
        effects.state = None;
        effects.effects.push(proto::Native2pcEffect {
            key: b"opaque".to_vec(),
            payload: b"effect".to_vec(),
        });
        record.applied_journal = raw.encode_to_vec();
        let sidecar = RecoverySidecar {
            records: vec![record],
            materialized: std::sync::Mutex::new(Vec::new()),
        };
        let executor = Native2pcRecoveryMaterializer::new(sidecar);
        assert_eq!(
            executor.recover_and_materialize().await.unwrap_err().code(),
            tonic::Code::DataLoss
        );
        assert!(executor.sidecar.materialized.lock().unwrap().is_empty());
    }

    #[tokio::test]
    async fn recovery_materializer_defers_conflicting_journals_for_one_actor() {
        let first = recovered_applied(Some(b"first".to_vec()), false);
        let mut second = recovered_applied(Some(b"second".to_vec()), false);
        // A valid additive unknown field makes this a distinct exact journal
        // without corrupting the generated response's parsed view.
        second.applied_journal.extend([0xa2, 0x06, 0]);
        let sidecar = RecoverySidecar {
            records: vec![first.clone(), second.clone()],
            materialized: std::sync::Mutex::new(Vec::new()),
        };
        let executor = Native2pcRecoveryMaterializer::new(sidecar);
        let result = executor.recover_and_materialize().await.unwrap();
        assert!(result.materialized.is_empty());
        assert_eq!(result.deferred, vec![first, second]);
        assert!(executor.sidecar.materialized.lock().unwrap().is_empty());
    }

    #[tokio::test]
    async fn recovery_materializer_forwards_additive_unknown_journal_bytes_exactly() {
        let mut state_only = recovered_applied(Some(b"state".to_vec()), false);
        state_only.applied_journal.extend([0xa2, 0x06, 0]);
        let deferred = recovered_applied(Some(b"state".to_vec()), true);
        let sidecar = RecoverySidecar {
            records: vec![state_only.clone(), deferred.clone()],
            materialized: std::sync::Mutex::new(Vec::new()),
        };
        let executor = Native2pcRecoveryMaterializer::new(sidecar);
        let result = executor.recover_and_materialize().await.unwrap();
        assert_eq!(result.recovered_records, 2);
        assert_eq!(result.materialized.len(), 1);
        assert_eq!(result.materialized[0].state, Some(b"state".to_vec()));
        assert_eq!(result.deferred, vec![deferred]);
        assert_eq!(
            *executor.sidecar.materialized.lock().unwrap(),
            vec![state_only.applied_journal]
        );
    }

    #[test]
    fn terminal_retries_and_watch_are_identity_bound() {
        let requests = requests();
        let first = requests.terminal(&participant("a"), true);
        let retry = requests.terminal(&participant("a"), true);
        assert_eq!(first, retry);
        let terminal = first.terminal.unwrap();
        assert_eq!(terminal.protocol.unwrap(), protocol());
        assert_eq!(terminal.root_transaction_id, vec![7; 16]);
        assert_eq!(terminal.participant.unwrap(), participant("a").to_proto());
        assert_eq!(
            terminal.coordinator.unwrap(),
            requests.coordinator.to_proto()
        );
        assert_eq!(terminal.enrollment_digest, vec![9, 8]);
        assert_eq!(
            terminal.decision,
            proto::native2pc_terminal_request::Decision::Commit as i32
        );
        let watch = requests.watch(&participant("b"));
        assert_eq!(watch.protocol.unwrap(), protocol());
        assert_eq!(watch.root_transaction_id, vec![7; 16]);
        assert_eq!(watch.enrollment_digest, vec![9, 8]);
        assert_eq!(watch.participant.unwrap(), participant("b").to_proto());
    }
}
