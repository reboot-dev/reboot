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
    trailers_eof: bool,
    invalid: bool,
}
impl RpcTerminalEvidence {
    pub(super) fn validate_success(
        &self,
        trailers: &tonic::metadata::MetadataMap,
    ) -> Result<(), Status> {
        if self.invalid
            || !self.trailers_eof
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
            (false, _, Some(trailers)) if self.trailers_eof => trailers,
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
// One observer for network and host-registered services. Genericity does not
// grant local provenance or expose a caller-created terminal receipt.
pub(super) type TerminalCaptureChannel = TerminalCaptureService<tonic::transport::Channel>;

pub(super) struct TerminalCaptureService<S> {
    inner: S,
    evidence: Arc<Mutex<RpcTerminalEvidence>>,
}
impl<S> TerminalCaptureService<S> {
    pub(super) fn new(inner: S) -> (Self, Arc<Mutex<RpcTerminalEvidence>>) {
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
impl<S> Service<http::Request<BoxBody>> for TerminalCaptureService<S>
where
    S: Service<http::Request<BoxBody>, Response = http::Response<BoxBody>>,
    S::Future: Send + 'static,
    S::Error: 'static,
{
    type Response = http::Response<BoxBody>;
    type Error = S::Error;
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
                pending_terminal: None,
            });
            Ok(http::Response::from_parts(parts, body))
        })
    }
}
struct TerminalCaptureBody {
    inner: BoxBody,
    evidence: Arc<Mutex<RpcTerminalEvidence>>,
    pending_terminal: Option<Frame<bytes::Bytes>>,
}
impl Body for TerminalCaptureBody {
    type Data = bytes::Bytes;
    type Error = Status;
    fn poll_frame(
        mut self: Pin<&mut Self>,
        cx: &mut Context<'_>,
    ) -> Poll<Option<Result<Frame<Self::Data>, Self::Error>>> {
        loop {
            if self.pending_terminal.is_some() {
                // Tonic caches the first trailer and never asks for a later frame.
                // Establish actual EOF before granting that terminal to the decoder.
                return match Pin::new(&mut self.inner).poll_frame(cx) {
                    Poll::Pending => Poll::Pending,
                    Poll::Ready(None) => {
                        self.evidence.lock().unwrap().trailers_eof = true;
                        Poll::Ready(self.pending_terminal.take().map(Ok))
                    }
                    Poll::Ready(Some(_)) => {
                        self.pending_terminal.take();
                        self.evidence.lock().unwrap().invalid = true;
                        Poll::Ready(Some(Err(Status::failed_precondition(
                            "wire body continued after terminal trailers",
                        ))))
                    }
                };
            }
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
                        self.pending_terminal = Some(frame);
                        continue;
                    }
                    return Poll::Ready(Some(Ok(frame)));
                }
                other => return other,
            }
        }
    }
    fn is_end_stream(&self) -> bool {
        self.pending_terminal.is_none() && self.inner.is_end_stream()
    }
    fn size_hint(&self) -> http_body::SizeHint {
        self.inner.size_hint()
    }
}

#[cfg(test)]
mod service_tests {
    use super::*;
    use http_body_util::BodyExt;
    use std::{collections::VecDeque, convert::Infallible};

    struct Frames(VecDeque<Result<Frame<bytes::Bytes>, Status>>);
    impl Body for Frames {
        type Data = bytes::Bytes;
        type Error = Status;
        fn poll_frame(
            mut self: Pin<&mut Self>,
            _: &mut Context<'_>,
        ) -> Poll<Option<Result<Frame<Self::Data>, Self::Error>>> {
            Poll::Ready(self.0.pop_front())
        }
        fn is_end_stream(&self) -> bool {
            self.0.is_empty()
        }
    }
    // Deliberately not Clone: readiness must belong to the called instance.
    struct ReservedService {
        ready: bool,
        response: Option<http::Response<BoxBody>>,
    }
    impl Service<http::Request<BoxBody>> for ReservedService {
        type Response = http::Response<BoxBody>;
        type Error = Infallible;
        type Future = std::future::Ready<Result<Self::Response, Self::Error>>;
        fn poll_ready(&mut self, _: &mut Context<'_>) -> Poll<Result<(), Self::Error>> {
            assert!(!self.ready);
            self.ready = true;
            Poll::Ready(Ok(()))
        }
        fn call(&mut self, _: http::Request<BoxBody>) -> Self::Future {
            assert!(std::mem::replace(&mut self.ready, false));
            std::future::ready(Ok(self.response.take().unwrap()))
        }
    }
    async fn dispatch(
        headers: http::HeaderMap,
        frames: Vec<Result<Frame<bytes::Bytes>, Status>>,
    ) -> (BoxBody, Arc<Mutex<RpcTerminalEvidence>>) {
        let mut response = http::Response::new(tonic::body::boxed(Frames(frames.into())));
        *response.headers_mut() = headers;
        let (mut service, evidence) = TerminalCaptureService::new(ReservedService {
            ready: false,
            response: Some(response),
        });
        std::future::poll_fn(|cx| service.poll_ready(cx))
            .await
            .unwrap();
        let response = service
            .call(http::Request::new(tonic::body::empty_body()))
            .await
            .unwrap();
        (response.into_body(), evidence)
    }
    #[tokio::test]
    async fn registered_service_preserves_readiness_and_original_terminal_frames() {
        let mut terminal = http::HeaderMap::new();
        terminal.insert("grpc-status", "0".parse().unwrap());
        let (mut body, evidence) = dispatch(
            http::HeaderMap::new(),
            vec![
                Ok(Frame::data(bytes::Bytes::from_static(b"payload"))),
                Ok(Frame::trailers(terminal.clone())),
            ],
        )
        .await;
        assert_eq!(
            body.frame().await.unwrap().unwrap().into_data().unwrap(),
            "payload"
        );
        assert_eq!(
            body.frame()
                .await
                .unwrap()
                .unwrap()
                .into_trailers()
                .unwrap(),
            terminal
        );
        assert!(body.frame().await.is_none());
        evidence
            .lock()
            .unwrap()
            .validate_success(&tonic::metadata::MetadataMap::from_headers(terminal))
            .unwrap();
    }
    #[tokio::test]
    async fn registered_service_sanitizes_single_malformed_rich_frame() {
        let mut terminal = http::HeaderMap::new();
        terminal.insert("grpc-status", "2".parse().unwrap());
        terminal.insert("grpc-status-details-bin", "!invalid!".parse().unwrap());
        let (mut body, evidence) =
            dispatch(http::HeaderMap::new(), vec![Ok(Frame::trailers(terminal))]).await;
        let forwarded = body
            .frame()
            .await
            .unwrap()
            .unwrap()
            .into_trailers()
            .unwrap();
        assert!(!forwarded.contains_key("grpc-status-details-bin"));
        let observed = evidence.lock().unwrap();
        assert!(observed.invalid);
        assert!(
            observed
                .trailers
                .as_ref()
                .unwrap()
                .contains_key("grpc-status-details-bin")
        );
        assert!(observed.error_metadata(&Status::unknown("")).is_err());
    }
    async fn tonic_error(
        headers: http::HeaderMap,
        frames: Vec<Result<Frame<bytes::Bytes>, Status>>,
    ) -> (Status, Arc<Mutex<RpcTerminalEvidence>>) {
        let mut response = http::Response::new(tonic::body::boxed(Frames(frames.into())));
        *response.headers_mut() = headers;
        response
            .headers_mut()
            .insert("content-type", "application/grpc".parse().unwrap());
        let (service, evidence) = TerminalCaptureService::new(ReservedService {
            ready: false,
            response: Some(response),
        });
        let mut grpc = tonic::client::Grpc::new(service);
        grpc.ready().await.unwrap();
        let result = grpc
            .server_streaming::<crate::proto::Empty, crate::proto::Empty, _>(
                tonic::Request::new(crate::proto::Empty {}),
                "/test.Service/Call".parse().unwrap(),
                tonic::codec::ProstCodec::default(),
            )
            .await;
        let status = match result {
            Err(status) => status,
            Ok(response) => response.into_inner().message().await.unwrap_err(),
        };
        (status, evidence)
    }
    fn error_headers() -> http::HeaderMap {
        use base64::Engine;
        let mut headers = http::HeaderMap::new();
        headers.insert("grpc-status", "2".parse().unwrap());
        headers.insert("grpc-message", "declared%20failure".parse().unwrap());
        headers.insert(
            "grpc-status-details-bin",
            base64::engine::general_purpose::STANDARD
                .encode(b"rich")
                .parse()
                .unwrap(),
        );
        headers
    }
    #[tokio::test]
    async fn registered_service_tonic_accepts_genuine_header_and_trailer_errors() {
        for initial in [true, false] {
            let terminal = error_headers();
            let (headers, frames) = if initial {
                (terminal.clone(), vec![])
            } else {
                (
                    http::HeaderMap::new(),
                    vec![Ok(Frame::trailers(terminal.clone()))],
                )
            };
            let (status, evidence) = tonic_error(headers, frames).await;
            assert_eq!(status.message(), "declared failure");
            assert_eq!(status.details(), b"rich");
            let captured = evidence.lock().unwrap().error_metadata(&status).unwrap();
            assert_eq!(captured.get("grpc-status").unwrap().as_bytes(), b"2");
        }
    }
    #[tokio::test]
    async fn registered_service_tonic_rejects_valid_terminal_followed_by_more_frames() {
        for extra_data in [false, true] {
            let extra = if extra_data {
                Frame::data(bytes::Bytes::from_static(b"late"))
            } else {
                Frame::trailers(error_headers())
            };
            let (status, evidence) = tonic_error(
                http::HeaderMap::new(),
                vec![Ok(Frame::trailers(error_headers())), Ok(extra)],
            )
            .await;
            assert_eq!(status.code(), tonic::Code::FailedPrecondition);
            assert!(evidence.lock().unwrap().invalid);
            assert!(evidence.lock().unwrap().error_metadata(&status).is_err());
        }
    }
    #[tokio::test]
    async fn registered_service_tonic_sanitizes_malformed_initial_rich_header() {
        let mut headers = error_headers();
        headers.insert("grpc-status-details-bin", "!invalid!".parse().unwrap());
        let (status, evidence) = tonic_error(headers, vec![]).await;
        assert!(status.details().is_empty());
        assert!(evidence.lock().unwrap().error_metadata(&status).is_err());
    }
    struct PendingEof {
        terminal: Option<http::HeaderMap>,
        gate: Arc<Mutex<(bool, Option<std::task::Waker>)>>,
    }
    impl Body for PendingEof {
        type Data = bytes::Bytes;
        type Error = Status;
        fn poll_frame(
            mut self: Pin<&mut Self>,
            cx: &mut Context<'_>,
        ) -> Poll<Option<Result<Frame<Self::Data>, Self::Error>>> {
            if let Some(terminal) = self.terminal.take() {
                return Poll::Ready(Some(Ok(Frame::trailers(terminal))));
            }
            let mut gate = self.gate.lock().unwrap();
            if gate.0 {
                Poll::Ready(None)
            } else {
                gate.1 = Some(cx.waker().clone());
                Poll::Pending
            }
        }
    }
    #[tokio::test]
    async fn registered_service_pending_eof_requires_wakeup_and_drop_never_certifies() {
        for cancel in [false, true] {
            let gate = Arc::new(Mutex::new((false, None)));
            let evidence = Arc::new(Mutex::new(RpcTerminalEvidence {
                headers: Some(http::HeaderMap::new()),
                ..Default::default()
            }));
            let mut body = TerminalCaptureBody {
                inner: tonic::body::boxed(PendingEof {
                    terminal: Some(error_headers()),
                    gate: gate.clone(),
                }),
                evidence: evidence.clone(),
                pending_terminal: None,
            };
            let mut frame = Box::pin(body.frame());
            let pending =
                std::future::poll_fn(|cx| Poll::Ready(frame.as_mut().poll(cx).is_pending())).await;
            assert!(pending);
            drop(frame);
            assert!(!body.is_end_stream());
            let expected = Status::with_details(
                tonic::Code::Unknown,
                "declared failure",
                bytes::Bytes::from_static(b"rich"),
            );
            assert!(evidence.lock().unwrap().error_metadata(&expected).is_err());
            if cancel {
                drop(body);
                assert!(!evidence.lock().unwrap().trailers_eof);
                assert!(evidence.lock().unwrap().error_metadata(&expected).is_err());
            } else {
                let waker = {
                    let mut gate = gate.lock().unwrap();
                    gate.0 = true;
                    gate.1.take().unwrap()
                };
                waker.wake();
                assert!(body.frame().await.unwrap().unwrap().is_trailers());
                assert!(evidence.lock().unwrap().trailers_eof);
                evidence.lock().unwrap().error_metadata(&expected).unwrap();
            }
        }
    }
    #[tokio::test]
    async fn registered_service_tonic_rejects_error_after_trailers() {
        let (status, evidence) = tonic_error(
            http::HeaderMap::new(),
            vec![
                Ok(Frame::trailers(error_headers())),
                Err(Status::unavailable("late body error")),
            ],
        )
        .await;
        assert_eq!(status.code(), tonic::Code::FailedPrecondition);
        assert!(evidence.lock().unwrap().invalid);
        assert!(!evidence.lock().unwrap().trailers_eof);
        assert!(evidence.lock().unwrap().error_metadata(&status).is_err());
    }
    #[tokio::test]
    async fn registered_service_body_error_is_not_a_wire_terminal() {
        let (mut body, evidence) = dispatch(
            http::HeaderMap::new(),
            vec![Err(Status::unavailable("body lost"))],
        )
        .await;
        let error = body.frame().await.unwrap().unwrap_err();
        assert_eq!(error.code(), tonic::Code::Unavailable);
        assert!(evidence.lock().unwrap().error_metadata(&error).is_err());
    }
}
