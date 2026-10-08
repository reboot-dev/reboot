#[cfg(test)]
mod reconnect_tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use wire::local_readers_server::{LocalReaders, LocalReadersServer};
    #[derive(Default)]
    struct Control {
        mode: AtomicUsize,
        calls: AtomicUsize,
        active: AtomicUsize,
        requests: Mutex<Vec<(tonic::metadata::MetadataMap, wire::Query)>>,
        entered: tokio::sync::Notify,
        ready: tokio::sync::Notify,
    }
    struct Guard(Arc<Control>);
    impl Drop for Guard {
        fn drop(&mut self) {
            self.0.active.fetch_sub(1, Ordering::SeqCst);
        }
    }
    struct Stream {
        item: Option<Result<wire::Snapshot, Status>>,
        _guard: Guard,
    }
    impl tokio_stream::Stream for Stream {
        type Item = Result<wire::Snapshot, Status>;
        fn poll_next(mut self: Pin<&mut Self>, _: &mut Context<'_>) -> Poll<Option<Self::Item>> {
            match self.item.take() {
                Some(item) => Poll::Ready(Some(item)),
                None => Poll::Pending,
            }
        }
    }
    #[derive(Clone)]
    struct Service(Arc<Control>);
    #[tonic::async_trait]
    impl LocalReaders for Service {
        type SubscribeStream = Stream;
        async fn subscribe(
            &self,
            request: Request<wire::Query>,
        ) -> Result<tonic::Response<Stream>, Status> {
            self.0.calls.fetch_add(1, Ordering::SeqCst);
            self.0
                .requests
                .lock()
                .unwrap()
                .push((request.metadata().clone(), request.into_inner()));
            self.0.active.fetch_add(1, Ordering::SeqCst);
            let guard = Guard(self.0.clone());
            let item = match self.0.mode.load(Ordering::SeqCst) {
                1 => Err(Status::permission_denied("terminal control")),
                2 => Ok(wire::Snapshot {
                    response: vec![255],
                }),
                3 => return Err(Status::permission_denied("subscribe control")),
                5 => return Err(Status::unavailable("transport control")),
                6 => Err(Status::unavailable("terminal transport control")),
                4 => {
                    self.0.entered.notify_one();
                    std::future::pending::<()>().await;
                    drop(guard);
                    return Err(Status::cancelled("unreachable"));
                }
                7 => {
                    self.0.ready.notify_one();
                    Ok(wire::Snapshot {
                        response: crate::proto::Counter { value: 7 }.encode_to_vec(),
                    })
                }
                _ => Ok(wire::Snapshot {
                    response: crate::proto::Counter { value: 7 }.encode_to_vec(),
                }),
            };
            Ok(tonic::Response::new(Stream {
                item: Some(item),
                _guard: guard,
            }))
        }
    }
    async fn setup() -> (
        tonic::transport::Channel,
        Arc<Control>,
        tokio::sync::oneshot::Sender<()>,
        tokio::task::JoinHandle<()>,
    ) {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        let control = Arc::new(Control::default());
        let service = Service(control.clone());
        let (stop, shutdown) = tokio::sync::oneshot::channel();
        let task = tokio::spawn(async move {
            tonic::transport::Server::builder()
                .add_service(LocalReadersServer::new(service))
                .serve_with_incoming_shutdown(
                    tokio_stream::wrappers::TcpListenerStream::new(listener),
                    async {
                        let _ = shutdown.await;
                    },
                )
                .await
                .unwrap();
        });
        let channel = tonic::transport::Endpoint::from_shared(format!("http://{addr}"))
            .unwrap()
            .connect()
            .await
            .unwrap();
        (channel, control, stop, task)
    }
    fn request(timeout: Option<std::time::Duration>) -> Request<wire::Query> {
        let mut request = Request::new(wire::Query {
            method: "ExactSnapshot".into(),
            request: vec![8, 9],
        });
        request
            .metadata_mut()
            .insert("x-reboot-state-ref", "fixed-actor".parse().unwrap());
        request
            .metadata_mut()
            .insert("authorization", "Bearer unit-context".parse().unwrap());
        request.metadata_mut().insert_bin(
            "x-control-bin",
            tonic::metadata::MetadataValue::from_bytes(&[1, 2, 3]),
        );
        if let Some(timeout) = timeout {
            request.set_timeout(timeout);
        }
        request
    }
    async fn active(control: &Control, expected: usize) {
        tokio::time::timeout(std::time::Duration::from_secs(1), async {
            while control.active.load(Ordering::SeqCst) != expected {
                tokio::task::yield_now().await;
            }
        })
        .await
        .unwrap();
    }
    async fn stop(sender: tokio::sync::oneshot::Sender<()>, task: tokio::task::JoinHandle<()>) {
        sender.send(()).unwrap();
        tokio::time::timeout(std::time::Duration::from_secs(2), task)
            .await
            .unwrap()
            .unwrap();
    }
    #[tokio::test]
    async fn reconnect_preserves_exact_query_metadata_fresh_baseline_and_single_owner() {
        let (channel, control, shutdown, task) = setup().await;
        let mut subscription = TypedSubscription::<crate::proto::Counter, Status>::connect(
            channel,
            request(None),
            std::convert::identity,
        )
        .await
        .unwrap();
        assert_eq!(subscription.message().await.unwrap().unwrap().value, 7);
        subscription.reconnect().await.unwrap();
        assert_eq!(
            subscription.message().await.unwrap().unwrap().value,
            7,
            "equal fresh baseline must not be hidden"
        );
        active(&control, 1).await;
        assert_eq!(control.calls.load(Ordering::SeqCst), 2);
        {
            let requests = control.requests.lock().unwrap();
            assert_eq!(requests[0].1, requests[1].1);
            for name in ["x-reboot-state-ref", "authorization"] {
                assert_eq!(requests[0].0.get(name), requests[1].0.get(name));
            }
            assert_eq!(
                requests[0].0.get_bin("x-control-bin"),
                requests[1].0.get_bin("x-control-bin")
            );
        }
        drop(subscription);
        active(&control, 0).await;
        stop(shutdown, task).await;
    }
    #[tokio::test]
    async fn failed_reconnect_terminal_and_bad_payload_disconnect_without_auto_retry() {
        let (channel, control, shutdown, task) = setup().await;
        let mut subscription = TypedSubscription::<crate::proto::Counter, tonic::Code>::connect(
            channel,
            request(None),
            |e| e.code(),
        )
        .await
        .unwrap();
        subscription.message().await.unwrap();
        let mut expected = 1;
        for (mode, code) in [
            (3, tonic::Code::PermissionDenied),
            (5, tonic::Code::Unavailable),
        ] {
            control.mode.store(mode, Ordering::SeqCst);
            assert_eq!(subscription.reconnect().await.unwrap_err(), code);
            assert!(subscription.message().await.unwrap().is_none());
            active(&control, 0).await;
            expected += 1;
            assert_eq!(control.calls.load(Ordering::SeqCst), expected);
        }
        for (mode, code) in [
            (1, tonic::Code::PermissionDenied),
            (2, tonic::Code::DataLoss),
            (6, tonic::Code::Unavailable),
        ] {
            control.mode.store(mode, Ordering::SeqCst);
            subscription.reconnect().await.unwrap();
            assert_eq!(subscription.message().await.unwrap_err(), code);
            assert!(subscription.message().await.unwrap().is_none());
            active(&control, 0).await;
            expected += 1;
            assert_eq!(control.calls.load(Ordering::SeqCst), expected);
        }
        drop(subscription);
        stop(shutdown, task).await;
    }
    #[tokio::test]
    async fn explicit_deadline_is_absolute_and_expiry_does_not_connect() {
        let (channel, control, shutdown, task) = setup().await;
        let mut subscription = TypedSubscription::<crate::proto::Counter, Status>::connect(
            channel,
            request(Some(std::time::Duration::from_millis(200))),
            std::convert::identity,
        )
        .await
        .unwrap();
        subscription.message().await.unwrap();
        let original = subscription.deadline.unwrap();
        tokio::time::sleep(std::time::Duration::from_millis(20)).await;
        subscription.reconnect().await.unwrap();
        subscription.message().await.unwrap();
        assert_eq!(subscription.deadline.unwrap(), original);
        {
            let requests = control.requests.lock().unwrap();
            assert_ne!(
                requests[0].0.get("grpc-timeout"),
                requests[1].0.get("grpc-timeout")
            );
        }
        assert_eq!(
            subscription.message().await.unwrap_err().code(),
            tonic::Code::DeadlineExceeded
        );
        assert_eq!(
            subscription.reconnect().await.unwrap_err().code(),
            tonic::Code::DeadlineExceeded
        );
        assert_eq!(control.calls.load(Ordering::SeqCst), 2);
        assert!(subscription.message().await.unwrap().is_none());
        active(&control, 0).await;
        stop(shutdown, task).await;
    }
    #[tokio::test]
    async fn buffered_baseline_cannot_escape_expired_absolute_deadline() {
        let (channel, control, shutdown, task) = setup().await;
        let mut subscription = TypedSubscription::<crate::proto::Counter, Status>::connect(
            channel,
            request(Some(std::time::Duration::from_millis(200))),
            std::convert::identity,
        )
        .await
        .unwrap();
        tokio::time::sleep_until(
            subscription.deadline.unwrap() + std::time::Duration::from_millis(20),
        )
        .await;
        assert_eq!(
            subscription.message().await.unwrap_err().code(),
            tonic::Code::DeadlineExceeded
        );
        assert!(subscription.stream.is_none());
        assert!(subscription.message().await.unwrap().is_none());
        assert_eq!(control.calls.load(Ordering::SeqCst), 1);
        active(&control, 0).await;
        stop(shutdown, task).await;
    }
    #[tokio::test]
    async fn ready_reconnect_response_cannot_escape_expired_deadline() {
        let (channel, control, shutdown, task) = setup().await;
        let mut subscription = TypedSubscription::<crate::proto::Counter, Status>::connect(
            channel,
            request(Some(std::time::Duration::from_millis(300))),
            std::convert::identity,
        )
        .await
        .unwrap();
        subscription.message().await.unwrap();
        let original = subscription.deadline.unwrap();
        control.mode.store(7, Ordering::SeqCst);
        {
            let reconnect = subscription.reconnect();
            tokio::pin!(reconnect);
            std::future::poll_fn(|cx| {
                assert!(reconnect.as_mut().poll(cx).is_pending());
                Poll::Ready(())
            })
            .await;
            tokio::time::timeout(std::time::Duration::from_secs(1), control.ready.notified())
                .await
                .unwrap();
            tokio::time::sleep_until(original + std::time::Duration::from_millis(20)).await;
            assert_eq!(
                reconnect.await.unwrap_err().code(),
                tonic::Code::DeadlineExceeded
            );
        }
        assert!(subscription.stream.is_none());
        assert!(subscription.message().await.unwrap().is_none());
        assert_eq!(control.calls.load(Ordering::SeqCst), 2);
        active(&control, 0).await;
        stop(shutdown, task).await;
    }
    #[tokio::test]
    async fn cancelled_reconnect_drops_old_rpc_and_pending_subscribe() {
        let (channel, control, shutdown, task) = setup().await;
        let mut subscription = TypedSubscription::<crate::proto::Counter, Status>::connect(
            channel,
            request(None),
            std::convert::identity,
        )
        .await
        .unwrap();
        subscription.message().await.unwrap();
        control.mode.store(4, Ordering::SeqCst);
        {
            let reconnect = subscription.reconnect();
            tokio::pin!(reconnect);
            tokio::time::timeout(std::time::Duration::from_secs(1), async {
                tokio::select! {
                    _ = control.entered.notified() => {},
                    result = &mut reconnect => panic!("must reach parked Subscribe: {result:?}"),
                }
            })
            .await
            .unwrap();
        }
        assert!(
            subscription.stream.is_none(),
            "cancelled reconnect must destroy old client RPC"
        );
        assert!(subscription.message().await.unwrap().is_none());
        assert_eq!(control.calls.load(Ordering::SeqCst), 2);
        active(&control, 0).await;
        control.mode.store(0, Ordering::SeqCst);
        subscription.reconnect().await.unwrap();
        assert_eq!(subscription.message().await.unwrap().unwrap().value, 7);
        drop(subscription);
        active(&control, 0).await;
        stop(shutdown, task).await;
    }
}
