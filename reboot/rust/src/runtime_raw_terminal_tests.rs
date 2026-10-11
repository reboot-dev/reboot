// Raw HTTP/2 terminals through runtime-owned outbound RPCs.
use super::*;
use http_body_util::BodyExt;
use std::convert::Infallible;
use std::future::Future;
use std::pin::Pin;
use std::task::{Context, Poll};

#[derive(Clone)]
struct RawTerminalServer {
    statuses: Vec<&'static str>,
    admitted: tokio::sync::mpsc::UnboundedSender<String>,
    pause: Option<RawPause>,
    error_terminal: Option<(bool, bool, u8)>,
}
#[derive(Clone)]
struct RawPause {
    before_data: bool,
    entered: tokio::sync::mpsc::UnboundedSender<()>,
    release: Arc<Mutex<Option<tokio::sync::oneshot::Receiver<()>>>>,
}
impl tonic::server::NamedService for RawTerminalServer {
    const NAME: &'static str = "grpc.health.v1.Health";
}
struct RawTerminalBody {
    frames: std::collections::VecDeque<http_body::Frame<bytes::Bytes>>,
    pause: Option<RawPause>,
    release: Option<tokio::sync::oneshot::Receiver<()>>,
}
impl http_body::Body for RawTerminalBody {
    type Data = bytes::Bytes;
    type Error = Status;
    fn poll_frame(
        mut self: Pin<&mut Self>,
        cx: &mut Context<'_>,
    ) -> Poll<Option<Result<http_body::Frame<Self::Data>, Self::Error>>> {
        if self
            .pause
            .as_ref()
            .is_some_and(|pause| self.frames.len() == if pause.before_data { 2 } else { 1 })
        {
            let pause = self.pause.take().unwrap();
            self.release = pause.release.lock().unwrap().take();
            assert!(self.release.is_some());
            pause.entered.send(()).unwrap();
        }
        if let Some(release) = self.release.as_mut() {
            if Pin::new(release).poll(cx).is_pending() {
                return Poll::Pending;
            }
            self.release = None;
        }
        Poll::Ready(self.frames.pop_front().map(Ok))
    }
    fn is_end_stream(&self) -> bool {
        self.frames.is_empty()
    }
}
impl tower::Service<http::Request<tonic::body::BoxBody>> for RawTerminalServer {
    type Response = http::Response<tonic::body::BoxBody>;
    type Error = Infallible;
    type Future = Pin<Box<dyn Future<Output = Result<Self::Response, Self::Error>> + Send>>;
    fn poll_ready(&mut self, _: &mut Context<'_>) -> Poll<Result<(), Self::Error>> {
        Poll::Ready(Ok(()))
    }
    fn call(&mut self, request: http::Request<tonic::body::BoxBody>) -> Self::Future {
        let statuses = self.statuses.clone();
        let admitted = self.admitted.clone();
        let pause = self.pause.clone();
        let error_terminal = self.error_terminal;
        Box::pin(async move {
            assert_eq!(request.uri().path(), "/grpc.health.v1.Health/Check");
            let target = request
                .headers()
                .get(STATE_REF_HEADER)
                .unwrap()
                .to_str()
                .unwrap()
                .to_owned();
            let encoded = request.into_body().collect().await.unwrap().to_bytes();
            assert!(encoded.len() >= 5);
            assert_eq!(encoded[0], 0);
            let length = u32::from_be_bytes(encoded[1..5].try_into().unwrap()) as usize;
            assert_eq!(encoded.len(), 5 + length);
            assert_eq!(
                HealthCheckRequest::decode(&encoded[5..]).unwrap().service,
                "bound-message"
            );
            admitted.send(target.clone()).unwrap();
            let payload = HealthCheckResponse { status: 1 }.encode_to_vec();
            let mut envelope = vec![0];
            envelope.extend_from_slice(&(payload.len() as u32).to_be_bytes());
            envelope.extend_from_slice(&payload);
            let mut trailers = http::HeaderMap::new();
            if let Some((_, _, fault)) = error_terminal {
                let mut declared_status = declared(&target);
                if fault == 2 || fault == 5 {
                    let message = if fault == 2 {
                        let mut malformed = http::HeaderMap::new();
                        malformed.insert("grpc-status", "2".parse().unwrap());
                        malformed.insert("grpc-message", "%FF".parse().unwrap());
                        Status::from_header_map(&malformed)
                            .unwrap()
                            .message()
                            .to_owned()
                    } else {
                        "different inner message".to_owned()
                    };
                    declared_status = crate::declared_error_status(
                        tonic::Code::Unknown,
                        &message,
                        ERROR_URL,
                        &HealthCheckResponse { status: 1 },
                    );
                    crate::successful_trailers::ParticipantMetadata::classified_single(
                        "example.Actor",
                        &target,
                        true,
                        true,
                    )
                    .unwrap()
                    .attach_to_status(&mut declared_status);
                }
                declared_status.add_header(&mut trailers).unwrap();
                match fault {
                    2 => {
                        trailers.insert("grpc-message", "%FF".parse().unwrap());
                    }
                    3 => {
                        trailers.insert("grpc-status-details-bin", "%%%".parse().unwrap());
                    }
                    4 => {
                        let value = trailers.get("grpc-message").unwrap().clone();
                        trailers.append("grpc-message", value);
                    }
                    5 => {
                        trailers.insert("grpc-message", "declared wire abort".parse().unwrap());
                    }
                    _ => {}
                }
                trailers.remove("grpc-status");
                if fault == 1 {
                    let details = trailers.get("grpc-status-details-bin").unwrap().clone();
                    trailers.append("grpc-status-details-bin", details);
                }
            }
            for status in statuses {
                trailers.append("grpc-status", status.parse().unwrap());
            }
            if error_terminal.is_none() {
                trailers.insert(
                    crate::successful_trailers::TRANSACTION_PARTICIPANTS_HEADER,
                    serde_json::json!({"example.Actor": [target]})
                        .to_string()
                        .parse()
                        .unwrap(),
                );
                trailers.insert(
                    crate::successful_trailers::TRANSACTION_PARTICIPANTS_READ_ONLY_HEADER,
                    "{}".parse().unwrap(),
                );
            }
            if error_terminal.is_some_and(|(headers_only, _, _)| headers_only) {
                let body = if error_terminal.is_some_and(|(_, with_message, _)| with_message) {
                    tonic::body::boxed(RawTerminalBody {
                        frames: [http_body::Frame::data(bytes::Bytes::from(envelope.clone()))]
                            .into(),
                        pause: None,
                        release: None,
                    })
                } else {
                    tonic::body::empty_body()
                };
                let mut response = http::Response::builder()
                    .status(200)
                    .header("content-type", "application/grpc")
                    .body(body)
                    .unwrap();
                response.headers_mut().extend(trailers);
                return Ok(response);
            }
            let mut body = RawTerminalBody {
                pause,
                release: None,
                frames: [
                    http_body::Frame::data(bytes::Bytes::from(envelope)),
                    http_body::Frame::trailers(trailers),
                ]
                .into(),
            };
            if error_terminal.is_some_and(|(_, with_message, _)| !with_message) {
                body.frames.pop_front();
            }
            Ok(http::Response::builder()
                .status(200)
                .header("content-type", "application/grpc")
                .body(tonic::body::boxed(body))
                .unwrap())
        })
    }
}
async fn raw_terminal_wire_with_pause(
    statuses: Vec<&'static str>,
    pause: Option<RawPause>,
    error_terminal: Option<(bool, bool, u8)>,
) -> (
    Arc<Resolver>,
    tokio::sync::mpsc::UnboundedReceiver<String>,
    tokio::task::JoinHandle<()>,
) {
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let endpoint = format!("http://{}", listener.local_addr().unwrap());
    let (admitted, rx) = tokio::sync::mpsc::unbounded_channel();
    let server = RawTerminalServer {
        statuses,
        admitted,
        pause,
        error_terminal,
    };
    let task = tokio::spawn(async move {
        tonic::transport::Server::builder()
            .add_service(server)
            .serve_with_incoming(tokio_stream::wrappers::TcpListenerStream::new(listener))
            .await
            .unwrap();
    });
    let channel = tonic::transport::Endpoint::from_shared(endpoint)
        .unwrap()
        .buffer_size(1)
        .connect()
        .await
        .unwrap();
    (
        Arc::new(Resolver {
            channel,
            calls: Default::default(),
            park: None,
            entered: Arc::new(tokio::sync::Semaphore::new(0)),
            release: None,
        }),
        rx,
        task,
    )
}
async fn raw_terminal_wire(
    statuses: Vec<&'static str>,
) -> (
    Arc<Resolver>,
    tokio::sync::mpsc::UnboundedReceiver<String>,
    tokio::task::JoinHandle<()>,
) {
    raw_terminal_wire_with_pause(statuses, None, None).await
}

// These gates observe server body production, not client consumption.
#[tokio::test]
async fn owned_unary_raw_body_cancellation_and_closure_cannot_late_enlist() {
    for before_data in [true, false] {
        for close_owner in [false, true] {
            let (good, mut good_admitted, good_server) = raw_terminal_wire(vec!["0"]).await;
            let (root, abandon, cleanup) =
                crate::durable_coordinator::tests::registered_star_outbound_fixture().await;
            call(&good, &root, "B", &[]).await.unwrap();
            assert_eq!(good_admitted.recv().await.as_deref(), Some("B"));
            let (entered, mut phase) = tokio::sync::mpsc::unbounded_channel();
            let (release, receiver) = tokio::sync::oneshot::channel();
            let pause = RawPause {
                before_data,
                entered,
                release: Arc::new(Mutex::new(Some(receiver))),
            };
            let (parked, mut admitted, server) =
                raw_terminal_wire_with_pause(vec!["0"], Some(pause), None).await;
            let child_root = root.clone();
            let child_resolver = parked.clone();
            let child =
                tokio::spawn(async move { call(&child_resolver, &child_root, "C", &[]).await });
            tokio::time::timeout(std::time::Duration::from_secs(5), phase.recv())
                .await
                .unwrap()
                .unwrap();
            assert_eq!(admitted.recv().await.as_deref(), Some("C"));
            assert_b(&root);
            if close_owner {
                abandon();
                let _ = release.send(());
                let error = tokio::time::timeout(std::time::Duration::from_secs(5), child)
                    .await
                    .unwrap()
                    .unwrap()
                    .unwrap_err();
                assert_eq!(error.code(), tonic::Code::FailedPrecondition);
                assert_closed_unsettled_c(&root);
            } else {
                child.abort();
                assert!(child.await.unwrap_err().is_cancelled());
                let _ = release.send(());
                assert_b(&root);
                assert!(root.doomed_status().is_none());
                assert!(root.seal_explicit_abort().is_err());
                abandon();
            }
            cleanup.await;
            good_server.abort();
            server.abort();
            let _ = good_server.await;
            let _ = server.await;
        }
    }
}

#[tokio::test]
async fn owned_unary_raw_error_requires_unambiguous_original_terminal() {
    for (headers_only, with_message) in [(true, false), (true, true), (false, false), (false, true)]
    {
        for (statuses, fault, recover) in [
            (vec!["2"], 0, true),
            (vec![], 0, false),
            (vec!["2", "0"], 0, false),
            (vec!["2", "2"], 0, false),
            (vec!["02"], 0, false),
            (vec!["2"], 1, false),
            (vec!["2"], 2, false),
            (vec!["2"], 3, false),
            (vec!["2"], 4, false),
            (vec!["2"], 5, false),
        ] {
            for supervised in [true, false] {
                let (resolver, mut admitted, server) = raw_terminal_wire_with_pause(
                    statuses.clone(),
                    None,
                    Some((headers_only, with_message, fault)),
                )
                .await;
                let root = context(supervised);
                let status = call(&resolver, &root, "B", &schema()).await.unwrap_err();
                assert_eq!(admitted.recv().await.as_deref(), Some("B"));
                if recover && !(headers_only && with_message) {
                    assert_eq!(status.code(), tonic::Code::Unknown);
                    assert_eq!(status.message(), "declared wire abort");
                    assert!(root.doomed_status().is_none());
                    if supervised {
                        let members = root.seal_explicit_abort().unwrap();
                        assert_eq!(members.len(), 1);
                        assert_eq!(members[0].target.state_ref, "B");
                        assert!(members[0].read_only);
                    }
                } else {
                    assert!(root.doomed_status().is_some(), "{status}");
                    assert!(root.returned_participants_snapshot().is_empty());
                    assert!(root.seal_explicit_abort().is_err());
                }
                server.abort();
                let _ = server.await;
            }
        }
    }
}

#[tokio::test]
async fn owned_unary_raw_success_requires_one_definitive_terminal_status() {
    for statuses in [vec![], vec!["0", "0"], vec!["0", "2"]] {
        let (good, mut good_admitted, good_server) = raw_terminal_wire(vec!["0"]).await;
        let root = context(true);
        call(&good, &root, "B", &[]).await.unwrap();
        assert_eq!(good_admitted.recv().await.as_deref(), Some("B"));
        let (bad, mut bad_admitted, bad_server) = raw_terminal_wire(statuses).await;
        let error = call(&bad, &root, "C", &[]).await.unwrap_err();
        assert_eq!(error.code(), tonic::Code::FailedPrecondition);
        assert_eq!(bad_admitted.recv().await.as_deref(), Some("C"));
        assert_b(&root);
        assert!(root.doomed_status().is_some());
        assert!(root.seal_explicit_abort().is_err());
        good_server.abort();
        bad_server.abort();
        let _ = good_server.await;
        let _ = bad_server.await;
    }
}
