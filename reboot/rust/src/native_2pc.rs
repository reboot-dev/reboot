//! Isolated Native2pc v1 transport boundary.
//!
//! This module deliberately exposes **no transaction executor**. It validates
//! identity-bound Native2pc requests and offers only host-routed Tonic clients
//! for the dedicated native services. In particular, it never calls legacy
//! `Database`, `Participant`, `TransactionCoordinator`, or `Recover` RPCs.
//!
//! The protocol binds an enrollment digest but does not define a digest
//! derivation algorithm. Callers therefore must provide an already-bound,
//! non-empty digest; this module neither invents nor silently substitutes one.

use std::{collections::BTreeSet, future::Future, pin::Pin, sync::Arc};

use tonic::{Response, Status};

use crate::database_proto as proto;

pub const PROTOCOL_ID: &str = "reboot.native-2pc.v1";
pub const RECORD_VERSION: u32 = 1;

type NativeFuture<'a, T> = Pin<Box<dyn Future<Output = Result<T, Status>> + Send + 'a>>;

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
        Ok(proto::native2pc_participant_record::Phase::Active)
            | Ok(proto::native2pc_participant_record::Phase::Prepared)
    ) {
        return Err(invalid(
            "native participant phase must be ACTIVE or PREPARED",
        ));
    }
    Ok(())
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

    /// Builds the explicit participant record required before a native terminal
    /// operation. This does not carry or claim staged actor effects.
    pub fn put_participant(
        &self,
        participant: &NativeActorId,
        prepared: bool,
    ) -> proto::Native2pcPutParticipantRequest {
        proto::Native2pcPutParticipantRequest {
            participant: Some(proto::Native2pcParticipantRecord {
                protocol: Some(protocol()),
                root_transaction_id: self.root.bytes(),
                participant: Some(participant.to_proto()),
                coordinator: Some(self.coordinator.to_proto()),
                enrollment_digest: self.enrollment.digest.clone(),
                phase: if prepared {
                    proto::native2pc_participant_record::Phase::Prepared as i32
                } else {
                    proto::native2pc_participant_record::Phase::Active as i32
                },
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
    fn put_commit_decision(
        &self,
        request: proto::Native2pcPutCommitDecisionRequest,
    ) -> NativeFuture<'_, proto::Native2pcPutCommitDecisionResponse>;
    fn put_abort_decision(
        &self,
        request: proto::Native2pcPutAbortDecisionRequest,
    ) -> NativeFuture<'_, proto::Native2pcPutAbortDecisionResponse>;
    fn recover(&self) -> NativeFuture<'_, Vec<proto::Native2pcRecoverResponse>>;
    fn terminal_participant(
        &self,
        request: proto::Native2pcTerminalParticipantRequest,
    ) -> NativeFuture<'_, proto::Native2pcTerminalParticipantResponse>;
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
                recovered.push(response);
            }
            Ok(recovered)
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
            self.client
                .lock()
                .await
                .terminal_participant(request)
                .await
                .map(Response::into_inner)
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
            self.client
                .lock()
                .await
                .terminal(request)
                .await
                .map(Response::into_inner)
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
            .put_participant(&participant("a"), true)
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
