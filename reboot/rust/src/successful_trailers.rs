//! Successful gRPC trailer transport for Reboot participant metadata.
//!
//! Generated handlers stage a validated marker in `tonic::Response` extensions.
//! [`SuccessfulParticipantTrailerLayer`] removes that marker and appends it only
//! to the final successful gRPC trailers. This is transport plumbing only: it
//! neither aggregates remote participants nor coordinates transactions.

use std::{
    future::Future,
    pin::Pin,
    task::{Context, Poll},
};

use http::{HeaderMap, HeaderValue, Request, Response};
use http_body::{Body, Frame};
use serde_json::Value;
use tower::{Layer, Service};

/// The Reboot trailer carrying participant identities.
pub const TRANSACTION_PARTICIPANTS_HEADER: &str = "x-reboot-transaction-participants";

/// A validated JSON encoding of Reboot transaction participants.
///
/// The encoding is the native `{"state.type":["state/ref"]}` metadata shape.
/// Validation occurs here, before it can be put in a response extension.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ParticipantMetadata(HeaderValue);

impl ParticipantMetadata {
    /// Validates native participant JSON before it is eligible for transport.
    pub fn try_from_json(value: impl AsRef<str>) -> Result<Self, ParticipantMetadataError> {
        let value = value.as_ref();
        let parsed: Value = serde_json::from_str(value).map_err(ParticipantMetadataError::Json)?;
        let object = parsed
            .as_object()
            .ok_or(ParticipantMetadataError::ExpectedObject)?;
        if object.is_empty() {
            return Err(ParticipantMetadataError::Empty);
        }
        for (state_type, state_refs) in object {
            if state_type.is_empty() {
                return Err(ParticipantMetadataError::EmptyStateType);
            }
            let state_refs = state_refs.as_array().ok_or_else(|| {
                ParticipantMetadataError::ExpectedStateRefArray(state_type.clone())
            })?;
            if state_refs.is_empty() {
                return Err(ParticipantMetadataError::EmptyStateRefArray(
                    state_type.clone(),
                ));
            }
            if state_refs
                .iter()
                .any(|state_ref| state_ref.as_str().is_none_or(str::is_empty))
            {
                return Err(ParticipantMetadataError::InvalidStateRef(
                    state_type.clone(),
                ));
            }
        }
        HeaderValue::from_str(value)
            .map(Self)
            .map_err(ParticipantMetadataError::HeaderValue)
    }

    /// Builds validated metadata for one local participant.
    pub fn single(state_type: &str, state_ref: &str) -> Result<Self, ParticipantMetadataError> {
        Self::try_from_json(serde_json::json!({ state_type: [state_ref] }).to_string())
    }

    fn header_value(&self) -> HeaderValue {
        self.0.clone()
    }
}

/// Validation failure while constructing [`ParticipantMetadata`].
#[derive(Debug)]
pub enum ParticipantMetadataError {
    Json(serde_json::Error),
    ExpectedObject,
    Empty,
    EmptyStateType,
    ExpectedStateRefArray(String),
    EmptyStateRefArray(String),
    InvalidStateRef(String),
    HeaderValue(http::header::InvalidHeaderValue),
}

impl std::fmt::Display for ParticipantMetadataError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Json(error) => write!(f, "invalid participant JSON: {error}"),
            Self::ExpectedObject => write!(f, "participant metadata must be a JSON object"),
            Self::Empty => write!(f, "participant metadata must not be empty"),
            Self::EmptyStateType => write!(f, "participant state type must not be empty"),
            Self::ExpectedStateRefArray(state_type) => {
                write!(
                    f,
                    "participant `{state_type}` must contain a state-reference array"
                )
            }
            Self::EmptyStateRefArray(state_type) => {
                write!(
                    f,
                    "participant `{state_type}` must contain a state reference"
                )
            }
            Self::InvalidStateRef(state_type) => {
                write!(
                    f,
                    "participant `{state_type}` contains an invalid state reference"
                )
            }
            Self::HeaderValue(error) => write!(
                f,
                "participant metadata is not valid gRPC metadata: {error}"
            ),
        }
    }
}

impl std::error::Error for ParticipantMetadataError {}

/// A prevalidated marker consumed by [`SuccessfulParticipantTrailerLayer`].
///
/// Construct this only from [`ParticipantMetadata`], so malformed values cannot
/// reach a response extension.
#[derive(Clone, Debug)]
pub struct SuccessfulParticipantMetadata(ParticipantMetadata);

impl SuccessfulParticipantMetadata {
    pub fn new(metadata: ParticipantMetadata) -> Self {
        Self(metadata)
    }
}

/// Stages local participant metadata for successful trailing transport.
///
/// This mutates only response extensions. Install
/// [`SuccessfulParticipantTrailerLayer`] around the Tonic server to emit it.
pub fn stage_successful_participants<T>(
    response: &mut tonic::Response<T>,
    metadata: ParticipantMetadata,
) {
    response
        .extensions_mut()
        .insert(SuccessfulParticipantMetadata::new(metadata));
}

/// A Tower layer that emits staged participant metadata in successful trailers.
#[derive(Clone, Copy, Debug, Default)]
pub struct SuccessfulParticipantTrailerLayer;

impl<S> Layer<S> for SuccessfulParticipantTrailerLayer {
    type Service = SuccessfulParticipantTrailerService<S>;

    fn layer(&self, inner: S) -> Self::Service {
        SuccessfulParticipantTrailerService { inner }
    }
}

/// Service installed by [`SuccessfulParticipantTrailerLayer`].
#[derive(Clone, Debug)]
pub struct SuccessfulParticipantTrailerService<S> {
    inner: S,
}

impl<S> Service<Request<tonic::body::BoxBody>> for SuccessfulParticipantTrailerService<S>
where
    S: Service<Request<tonic::body::BoxBody>, Response = Response<tonic::body::BoxBody>> + Send,
    S::Future: Send + 'static,
{
    type Response = Response<tonic::body::BoxBody>;
    type Error = S::Error;
    type Future = Pin<Box<dyn Future<Output = Result<Self::Response, Self::Error>> + Send>>;

    fn poll_ready(&mut self, cx: &mut Context<'_>) -> Poll<Result<(), Self::Error>> {
        self.inner.poll_ready(cx)
    }

    fn call(&mut self, request: Request<tonic::body::BoxBody>) -> Self::Future {
        let future = self.inner.call(request);
        Box::pin(async move {
            let response = future.await?;
            let (mut parts, body) = response.into_parts();
            let marker = parts.extensions.remove::<SuccessfulParticipantMetadata>();
            let body = match marker {
                Some(SuccessfulParticipantMetadata(metadata)) => {
                    tonic::body::boxed(ParticipantTrailerBody {
                        inner: body,
                        metadata,
                    })
                }
                None => body,
            };
            Ok(Response::from_parts(parts, body))
        })
    }
}

struct ParticipantTrailerBody {
    inner: tonic::body::BoxBody,
    metadata: ParticipantMetadata,
}

impl Body for ParticipantTrailerBody {
    type Data = bytes::Bytes;
    type Error = tonic::Status;

    fn poll_frame(
        mut self: Pin<&mut Self>,
        cx: &mut Context<'_>,
    ) -> Poll<Option<Result<Frame<Self::Data>, Self::Error>>> {
        match Pin::new(&mut self.inner).poll_frame(cx) {
            Poll::Ready(Some(Ok(mut frame))) => {
                if let Some(trailers) = frame.trailers_mut()
                    && grpc_status_is_ok(trailers)
                {
                    trailers.append(
                        TRANSACTION_PARTICIPANTS_HEADER,
                        self.metadata.header_value(),
                    );
                }
                Poll::Ready(Some(Ok(frame)))
            }
            other => other,
        }
    }

    fn is_end_stream(&self) -> bool {
        self.inner.is_end_stream()
    }

    fn size_hint(&self) -> http_body::SizeHint {
        self.inner.size_hint()
    }
}

fn grpc_status_is_ok(trailers: &HeaderMap) -> bool {
    trailers
        .get("grpc-status")
        .is_some_and(|value| value.as_bytes() == b"0")
}
