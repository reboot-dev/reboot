//! Explicit service routing and a host-trusted context for ordinary Tonic handlers.
//!
//! This is a bounded, immutable service directory, not planner placement. A
//! lookup creates a fresh connection; there is no fallback, global cache,
//! retry policy, or transaction authority. Raw generated Tonic stubs consume
//! the returned `Channel` directly.

use std::{collections::BTreeMap, sync::Arc, time::Duration};
use tonic::{Request, Status, transport::Channel};

use crate::{
    CallerId, ExternalContext, ExternalEndpoint, application_host::TrustedApplicationContext,
};

/// Host-selected exact protobuf service names mapped to explicit HTTP(S) URLs.
#[derive(Clone, Debug, Default)]
pub struct LegacyGrpcDirectory {
    endpoints: BTreeMap<String, ExternalEndpoint>,
}

impl LegacyGrpcDirectory {
    /// Validates the whole directory before publication. Duplicate identities
    /// reject (even if their URLs match); nothing is silently overwritten.
    pub fn new<I, S, U>(entries: I) -> Result<Self, Status>
    where
        I: IntoIterator<Item = (S, U)>,
        S: Into<String>,
        U: Into<String>,
    {
        let mut endpoints = BTreeMap::new();
        for (service, url) in entries {
            let service = service.into();
            validate_service(&service)?;
            let endpoint = ExternalEndpoint::parse(url.into())
                .map_err(|e| Status::invalid_argument(e.to_string()))?;
            if endpoints.insert(service, endpoint).is_some() {
                return Err(Status::invalid_argument("duplicate legacy gRPC service"));
            }
        }
        Ok(Self { endpoints })
    }

    /// No normalization, prefix matching, or default endpoint is performed.
    pub fn endpoint(&self, service: &str) -> Result<&ExternalEndpoint, Status> {
        validate_service(service)?;
        self.endpoints.get(service).ok_or_else(|| {
            Status::not_found(format!("unregistered legacy gRPC service `{service}`"))
        })
    }

    /// Resolves precisely `/package.Service/Method`, preserving the service
    /// spelling. The directory routes services, not individual RPC methods.
    pub fn endpoint_for_method(&self, method: &str) -> Result<&ExternalEndpoint, Status> {
        self.endpoint(service_for_method(method)?)
    }

    /// Opens a new connection to exactly the configured endpoint. Connection
    /// errors are returned, never rerouted or transparently retried.
    pub async fn channel(&self, service: &str) -> Result<Channel, Status> {
        let endpoint = self.endpoint(service)?;
        tonic::transport::Endpoint::from_shared(endpoint.as_str().to_owned())
            .map_err(|e| Status::invalid_argument(e.to_string()))?
            .connect()
            .await
            .map_err(|e| Status::unavailable(format!("legacy gRPC connection failed: {e}")))
    }

    pub async fn channel_for_method(&self, method: &str) -> Result<Channel, Status> {
        self.channel(service_for_method(method)?).await
    }
}

fn identifier(value: &str) -> bool {
    let mut bytes = value.bytes();
    bytes
        .next()
        .is_some_and(|b| b.is_ascii_alphabetic() || b == b'_')
        && bytes.all(|b| b.is_ascii_alphanumeric() || b == b'_')
}

fn validate_service(service: &str) -> Result<(), Status> {
    if service.split('.').all(identifier) {
        Ok(())
    } else {
        Err(Status::invalid_argument(
            "expected an exact protobuf service name",
        ))
    }
}

fn service_for_method(method: &str) -> Result<&str, Status> {
    let (service, method) = method
        .strip_prefix('/')
        .and_then(|value| value.split_once('/'))
        .ok_or_else(|| Status::invalid_argument("expected /package.Service/Method"))?;
    validate_service(service)?;
    if !identifier(method) {
        return Err(Status::invalid_argument("invalid protobuf method name"));
    }
    Ok(service)
}

/// Host-trusted application caller identity plus explicit outbound routing.
///
/// Handlers construct this before consuming their inbound request. Trust comes
/// only from `TrustedApplicationContext` in request extensions, never headers.
/// The directory is supplied by the host's handler configuration, not callers.
/// Deadlines are captured once and shrink, rather than resetting per RPC.
#[derive(Clone, Debug)]
pub struct LegacyGrpcContext {
    caller_id: CallerId,
    directory: Arc<LegacyGrpcDirectory>,
    deadline: Option<tokio::time::Instant>,
}

impl LegacyGrpcContext {
    pub fn from_request<T>(
        request: &Request<T>,
        directory: Arc<LegacyGrpcDirectory>,
    ) -> Result<Self, Status> {
        let trusted = TrustedApplicationContext::from_request(request).ok_or_else(|| {
            Status::permission_denied("legacy gRPC context requires host ingress")
        })?;
        let caller_id = CallerId::new(trusted.application_id(), None)
            .map_err(|_| Status::failed_precondition("invalid host application caller identity"))?;
        let deadline = crate::durable_participant::prepare_request_deadline(request)?;
        Ok(Self {
            caller_id,
            directory,
            deadline,
        })
    }

    pub fn application_id(&self) -> &str {
        self.caller_id.application_id()
    }

    /// A fresh named caller context for the generated Reboot external client.
    ///
    /// Python `aio/interceptors.py:32-44` passes the host caller ID and only
    /// explicitly supplied bearer/idempotency options. `aio/external.py:110-137`
    /// stores the name locally; it does not invent a name metadata header.
    /// Here the state reference is explicit, because Rust external contexts are
    /// actor-bound. Names are diagnostic, not authorization/idempotency keys.
    /// No inbound credentials, transaction, internal flag, writer key or state
    /// reference is copied. Use `with_bearer_token` / `writer_with_key` only
    /// when the application deliberately supplies those values.
    pub fn external_context(
        &self,
        name: impl Into<String>,
        state_ref: impl Into<String>,
    ) -> ExternalContext {
        ExternalContext::new(state_ref)
            .with_caller_id(self.caller_id.clone())
            .with_name(name)
    }

    pub fn directory(&self) -> &LegacyGrpcDirectory {
        &self.directory
    }

    /// Remaining inbound RPC budget. Zero means expired, not no deadline.
    pub fn time_remaining(&self) -> Option<Duration> {
        self.deadline
            .map(|deadline| deadline.saturating_duration_since(tokio::time::Instant::now()))
    }

    /// Opens a raw legacy stub channel within the remaining inbound budget.
    /// RPC deadlines are applied separately by `request` / `apply_deadline`.
    pub async fn legacy_grpc_channel(&self, service: &str) -> Result<Channel, Status> {
        // Lookup before awaiting ensures unknown services never initiate I/O.
        self.directory.endpoint(service)?;
        let connect = self.directory.channel(service);
        match self.deadline {
            Some(deadline) => {
                self.ensure_not_expired()?;
                tokio::time::timeout_at(deadline, connect)
                    .await
                    .map_err(|_| {
                        Status::deadline_exceeded("legacy gRPC connection deadline elapsed")
                    })?
            }
            None => connect.await,
        }
    }

    pub async fn legacy_grpc_channel_for_method(&self, method: &str) -> Result<Channel, Status> {
        self.legacy_grpc_channel(service_for_method(method)?).await
    }

    /// Makes a fresh metadata-free legacy request, except for the remaining
    /// deadline. This is the app-consumed API for raw generated legacy stubs.
    pub fn request<T>(&self, message: T) -> Result<Request<T>, Status> {
        let mut request = Request::new(message);
        self.apply_deadline(&mut request)?;
        Ok(request)
    }

    /// Explicitly bounds an application-created request (including a reader or
    /// writer built by `ExternalContext`). Does not copy inbound metadata. A
    /// shorter explicit outbound deadline is retained; malformed ones reject.
    /// Generated convenience clients that construct requests internally do not
    /// inherit this deadline automatically: bound their call future explicitly.
    pub fn apply_deadline<T>(&self, request: &mut Request<T>) -> Result<(), Status> {
        let outbound = crate::durable_participant::prepare_request_deadline(request)?;
        let deadline = match (self.deadline, outbound) {
            (Some(a), Some(b)) => Some(a.min(b)),
            (a, b) => a.or(b),
        };
        if let Some(deadline) = deadline {
            let remaining = deadline.saturating_duration_since(tokio::time::Instant::now());
            if remaining.is_zero() {
                return Err(Status::deadline_exceeded(
                    "legacy gRPC request deadline elapsed",
                ));
            }
            request.set_timeout(remaining);
        }
        Ok(())
    }

    fn ensure_not_expired(&self) -> Result<(), Status> {
        if self
            .time_remaining()
            .is_some_and(|remaining| remaining.is_zero())
        {
            Err(Status::deadline_exceeded(
                "legacy gRPC request deadline elapsed",
            ))
        } else {
            Ok(())
        }
    }
}

impl ExternalContext {
    /// Assigns a diagnostic name, matching Python ExternalContext.name. This
    /// does not emit a new wire header or grant authority. Defined here so the
    /// bridge requires no edits to the existing context representation.
    pub fn with_name(mut self, name: impl Into<String>) -> Self {
        self.name = Some(name.into());
        self
    }
}
