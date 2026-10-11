// Private pre-Tonic wire evidence; no public receipt setter.
use http_body::{Body, Frame};
use std::{
    future::Future,
    pin::Pin,
    sync::{Arc, Mutex},
    task::{Context, Poll},
};
use tonic::{Status, body::BoxBody};
use tower::Service;

#[derive(Default)]
pub(super) struct RpcTerminalEvidence {
    headers: Option<http::HeaderMap>,
    headers_end_stream: bool,
    trailers: Option<http::HeaderMap>,
    invalid: bool,
}
impl RpcTerminalEvidence {
    pub(super) fn validate_success(
        &self,
        trailers: &tonic::metadata::MetadataMap,
    ) -> Result<(), Status> {
        if self.invalid
            || self
                .headers
                .as_ref()
                .is_none_or(|headers| headers.contains_key("grpc-status"))
            || self.trailers.as_ref() != Some(&trailers.clone().into_headers())
        {
            return Err(Status::failed_precondition(
                "ambiguous successful wire terminal",
            ));
        }
        Ok(())
    }
    pub(super) fn error_metadata(
        &self,
        status: &Status,
    ) -> Result<tonic::metadata::MetadataMap, Status> {
        let reject = || Status::failed_precondition("ambiguous or absent wire error terminal");
        if self.invalid {
            return Err(reject());
        }
        let headers = self.headers.as_ref().ok_or_else(reject)?;
        let initial_status = headers.contains_key("grpc-status");
        let terminal = match (
            initial_status,
            self.headers_end_stream,
            self.trailers.as_ref(),
        ) {
            (true, true, None) => headers,
            (false, _, Some(trailers)) => trailers,
            _ => return Err(reject()),
        };
        let mut statuses = terminal.get_all("grpc-status").iter();
        let expected = (status.code() as i32).to_string();
        if status.code() == tonic::Code::Ok
            || !matches!(statuses.next(), Some(value) if value.as_bytes() == expected.as_bytes())
            || statuses.next().is_some()
        {
            return Err(reject());
        }
        for key in ["grpc-message", "grpc-status-details-bin"] {
            if terminal.get_all(key).iter().count() > 1 {
                return Err(reject());
            }
        }
        let message = terminal
            .get("grpc-message")
            .map(|v| v.as_bytes())
            .unwrap_or_default();
        if decoded_grpc_message(message).as_deref() != Some(status.message()) {
            return Err(reject());
        }
        // Reconstruct only after multiplicity/encoding validation, never as provenance.
        if !safe_rich_encoding(terminal) {
            return Err(reject());
        }
        let decoded = Status::from_header_map(terminal).ok_or_else(reject)?;
        if decoded.code() != status.code()
            || decoded.message() != status.message()
            || decoded.details() != status.details()
        {
            return Err(reject());
        }
        Ok(tonic::metadata::MetadataMap::from_headers(terminal.clone()))
    }
}
fn decoded_grpc_message(input: &[u8]) -> Option<String> {
    let mut decoded = Vec::with_capacity(input.len());
    let mut index = 0;
    fn hex(byte: u8) -> Option<u8> {
        match byte {
            b'0'..=b'9' => Some(byte - b'0'),
            b'a'..=b'f' => Some(byte - b'a' + 10),
            b'A'..=b'F' => Some(byte - b'A' + 10),
            _ => None,
        }
    }
    while index < input.len() {
        if input[index] == b'%'
            && index + 2 < input.len()
            && let (Some(high), Some(low)) = (hex(input[index + 1]), hex(input[index + 2]))
        {
            decoded.push(high * 16 + low);
            index += 3;
        } else {
            decoded.push(input[index]);
            index += 1;
        }
    }
    String::from_utf8(decoded).ok()
}

fn safe_rich_encoding(headers: &http::HeaderMap) -> bool {
    use base64::Engine;
    headers
        .get_all("grpc-status-details-bin")
        .iter()
        .all(|value| {
            base64::engine::general_purpose::GeneralPurpose::new(
                &base64::alphabet::STANDARD,
                base64::engine::general_purpose::GeneralPurposeConfig::new()
                    .with_decode_padding_mode(base64::engine::DecodePaddingMode::Indifferent),
            )
            .decode(value.as_bytes())
            .is_ok()
        })
}
pub(super) struct TerminalCaptureChannel {
    inner: tonic::transport::Channel,
    evidence: Arc<Mutex<RpcTerminalEvidence>>,
}
impl TerminalCaptureChannel {
    pub(super) fn new(inner: tonic::transport::Channel) -> (Self, Arc<Mutex<RpcTerminalEvidence>>) {
        let evidence = Arc::new(Mutex::new(RpcTerminalEvidence::default()));
        (
            Self {
                inner,
                evidence: evidence.clone(),
            },
            evidence,
        )
    }
}
impl Service<http::Request<BoxBody>> for TerminalCaptureChannel {
    type Response = http::Response<BoxBody>;
    type Error = <tonic::transport::Channel as Service<http::Request<BoxBody>>>::Error;
    type Future = Pin<Box<dyn Future<Output = Result<Self::Response, Self::Error>> + Send>>;
    fn poll_ready(&mut self, cx: &mut Context<'_>) -> Poll<Result<(), Self::Error>> {
        self.inner.poll_ready(cx)
    }
    fn call(&mut self, request: http::Request<BoxBody>) -> Self::Future {
        let future = self.inner.call(request); // Same instance whose readiness was reserved.
        let evidence = self.evidence.clone();
        Box::pin(async move {
            let response = future.await?;
            let (parts, body) = response.into_parts();
            let unsafe_encoding = !safe_rich_encoding(&parts.headers);
            {
                let mut observed = evidence.lock().unwrap();
                if observed.headers.is_some() {
                    observed.invalid = true;
                }
                observed.headers = Some(parts.headers.clone());
                observed.headers_end_stream = body.is_end_stream();
                observed.invalid |= unsafe_encoding;
            }
            // Avoid Tonic's malformed rich-status base64 panic. The original map remains
            // captured and invalid; sanitized forwarding can never become recoverable.
            let mut parts = parts;
            if unsafe_encoding {
                parts.headers.remove("grpc-status-details-bin");
            }
            let body = tonic::body::boxed(TerminalCaptureBody {
                inner: body,
                evidence,
            });
            Ok(http::Response::from_parts(parts, body))
        })
    }
}
struct TerminalCaptureBody {
    inner: BoxBody,
    evidence: Arc<Mutex<RpcTerminalEvidence>>,
}
impl Body for TerminalCaptureBody {
    type Data = bytes::Bytes;
    type Error = Status;
    fn poll_frame(
        mut self: Pin<&mut Self>,
        cx: &mut Context<'_>,
    ) -> Poll<Option<Result<Frame<Self::Data>, Self::Error>>> {
        match Pin::new(&mut self.inner).poll_frame(cx) {
            Poll::Ready(Some(Ok(mut frame))) => {
                if let Some(trailers) = frame.trailers_mut() {
                    let malformed = !safe_rich_encoding(trailers);
                    {
                        let mut observed = self.evidence.lock().unwrap();
                        if observed.trailers.is_some() {
                            observed.invalid = true;
                        }
                        observed.trailers = Some(trailers.clone());
                        observed.invalid |= malformed;
                    }
                    if malformed {
                        trailers.remove("grpc-status-details-bin");
                    }
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
