// Actual ApplicationHost/Tonic boundary; local-only MockSidecar does not certify native B1.
mod host_participant_cleanup {
    use super::*;
    use crate::application_host::ApplicationHost;
    use tonic_health::pb::{
        HealthCheckRequest, HealthCheckResponse,
        health_server::{Health, HealthServer},
    };
    use tower::Service;

    struct HandlerGuard {
        local: Option<StartedLocalTransaction<MockSidecar>>,
        destroyed: Option<tokio::sync::oneshot::Sender<()>>,
    }
    impl Drop for HandlerGuard {
        fn drop(&mut self) {
            drop(self.local.take());
            if let Some(destroyed) = self.destroyed.take() {
                let _ = destroyed.send(());
            }
        }
    }
    struct Handler {
        actor: DurableActorParticipant<MockSidecar>,
        root: Uuid,
        admitted: Mutex<Option<tokio::sync::oneshot::Sender<()>>>,
        destroyed: Mutex<Option<tokio::sync::oneshot::Sender<()>>>,
        response: Mutex<Option<tokio::sync::oneshot::Receiver<()>>>,
    }
    #[tonic::async_trait]
    impl Health for Handler {
        async fn check(
            &self,
            _: tonic::Request<HealthCheckRequest>,
        ) -> Result<tonic::Response<HealthCheckResponse>, Status> {
            // Admission binds AUTOMATICALLY through mandatory ingress, without
            // optional LegacyDurableRecovery or a prebound test-only tracker.
            let local = self
                .actor
                .start_local(
                    shared_slot_start(self.root),
                    ParticipantStartMode::SharedUpgradeable,
                )
                .await?;
            local.stage(PendingActorEffects::default()).await?;
            let _guard = HandlerGuard {
                local: Some(local),
                destroyed: self.destroyed.lock().unwrap().take(),
            };
            self.admitted
                .lock()
                .unwrap()
                .take()
                .unwrap()
                .send(())
                .unwrap();
            let response = self.response.lock().unwrap().take().unwrap();
            let _ = response.await;
            Ok(tonic::Response::new(HealthCheckResponse { status: 1 }))
        }
        type WatchStream = tokio_stream::Empty<Result<HealthCheckResponse, Status>>;
        async fn watch(
            &self,
            _: tonic::Request<HealthCheckRequest>,
        ) -> Result<tonic::Response<Self::WatchStream>, Status> {
            Ok(tonic::Response::new(tokio_stream::empty()))
        }
    }
    #[derive(Clone)]
    struct Route(HealthServer<Handler>);
    impl tonic::server::NamedService for Route {
        const NAME: &'static str = "cleanup.Test";
    }
    impl Service<http::Request<tonic::body::BoxBody>> for Route {
        type Response = http::Response<tonic::body::BoxBody>;
        type Error = std::convert::Infallible;
        type Future =
            <HealthServer<Handler> as Service<http::Request<tonic::body::BoxBody>>>::Future;
        fn poll_ready(
            &mut self,
            cx: &mut std::task::Context<'_>,
        ) -> std::task::Poll<Result<(), Self::Error>> {
            <HealthServer<Handler> as Service<http::Request<tonic::body::BoxBody>>>::poll_ready(
                &mut self.0,
                cx,
            )
        }
        fn call(&mut self, mut request: http::Request<tonic::body::BoxBody>) -> Self::Future {
            *request.uri_mut() = http::Uri::from_static("/grpc.health.v1.Health/Check");
            self.0.call(request)
        }
    }

    async fn contended_host(noop: bool, timeout: bool) {
        let sidecar = Arc::new(MockSidecar::default());
        let actor = DurableActorParticipant::new(sidecar.clone(), "example.Actor", "actor/1");
        let root = Uuid::new_v4();
        let (admit, admitted) = tokio::sync::oneshot::channel();
        let (destroy, destroyed) = tokio::sync::oneshot::channel();
        let (respond, response) = tokio::sync::oneshot::channel();
        let handler = Handler {
            actor: actor.clone(),
            root,
            admitted: Mutex::new(Some(admit)),
            destroyed: Mutex::new(Some(destroy)),
            response: Mutex::new(Some(response)),
        };
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let (stop, stopped) = tokio::sync::oneshot::channel();
        let host =
            ApplicationHost::new("cleanup-app").add_service(Route(HealthServer::new(handler)));
        let mut serving = tokio::spawn(host.serve_with_listener_shutdown(listener, async {
            let _ = stopped.await;
        }));
        let channel = tonic::transport::Endpoint::from_shared(format!("http://{address}"))
            .unwrap()
            .connect()
            .await
            .unwrap();
        let mut health = tonic_health::pb::health_client::HealthClient::new(channel.clone());
        loop {
            let status = health
                .check(HealthCheckRequest {
                    service: String::new(),
                })
                .await
                .unwrap()
                .into_inner()
                .status;
            if status == 1 {
                break;
            }
        }
        let request = tokio::spawn(async move {
            let mut client = tonic::client::Grpc::new(channel);
            client.ready().await.unwrap();
            client
                .unary::<HealthCheckRequest, HealthCheckResponse, _>(
                    tonic::Request::new(HealthCheckRequest {
                        service: String::new(),
                    }),
                    http::uri::PathAndQuery::from_static("/cleanup.Test/Check"),
                    tonic::codec::ProstCodec::default(),
                )
                .await
        });
        admitted.await.unwrap();
        let slot = actor.pending.lookup(root);
        let locked = slot.clone().lock_owned().await;
        let owner = locked.as_ref().unwrap().local_owner;
        let mut writer = Box::pin(actor.lock.exclusive());
        assert_slot_future_pending(writer.as_mut()).await;
        if noop {
            respond.send(()).unwrap();
            request.await.unwrap().unwrap();
            destroyed.await.unwrap();
            assert_eq!(locked.as_ref().unwrap().local_owner, owner);
            stop.send(()).unwrap();
        } else {
            stop.send(()).unwrap();
            // Readiness revocation destroys the actual held handler while the
            // server is joining. Its reserved producer remains allowed to submit.
            destroyed.await.unwrap();
            let _ = request.await.unwrap();
            drop(respond);
        }
        assert_slot_future_pending(std::pin::Pin::new(&mut serving)).await;
        assert_slot_future_pending(writer.as_mut()).await;
        if timeout {
            let error = tokio::time::timeout(std::time::Duration::from_secs(7), &mut serving)
                .await
                .unwrap()
                .unwrap()
                .unwrap_err();
            assert!(
                matches!(error, crate::application_host::ApplicationHostError::ParticipantCleanup(ref status) if status.code() == tonic::Code::DeadlineExceeded)
            );
            assert_eq!(locked.as_ref().unwrap().local_owner, owner);
            drop(locked);
            assert!(slot.lock_owned().await.is_some());
            assert_slot_future_pending(writer.as_mut()).await;
            return;
        }
        drop(locked);
        tokio::time::timeout(std::time::Duration::from_secs(2), &mut serving)
            .await
            .unwrap()
            .unwrap()
            .unwrap();
        assert!(slot.lock_owned().await.is_none());
        let _readmitted = tokio::time::timeout(std::time::Duration::from_secs(1), writer)
            .await
            .unwrap();
        assert!(
            sidecar
                .calls
                .lock()
                .unwrap()
                .iter()
                .all(|call| matches!(call, Call::Load(_)))
        );
    }
    #[tokio::test]
    async fn application_host_contended_cancel_joins_late_guard_cleanup_then_readmits_writer() {
        contended_host(false, false).await;
    }
    #[tokio::test]
    async fn application_host_contended_noop_response_does_not_finish_cleanup_but_shutdown_does() {
        contended_host(true, false).await;
    }

    #[tokio::test]
    async fn application_host_tonic_contended_slot_deadline_retains_pending_and_gate() {
        contended_host(false, true).await;
    }

    #[derive(Clone)]
    struct Idle;
    impl tonic::server::NamedService for Idle {
        const NAME: &'static str = "cleanup.Idle";
    }
    impl Service<http::Request<tonic::body::BoxBody>> for Idle {
        type Response = http::Response<tonic::body::BoxBody>;
        type Error = std::convert::Infallible;
        type Future = std::future::Ready<Result<Self::Response, Self::Error>>;
        fn poll_ready(
            &mut self,
            _: &mut std::task::Context<'_>,
        ) -> std::task::Poll<Result<(), Self::Error>> {
            std::task::Poll::Ready(Ok(()))
        }
        fn call(&mut self, _: http::Request<tonic::body::BoxBody>) -> Self::Future {
            std::future::ready(Ok(Status::unimplemented("unused").into_http()))
        }
    }

    #[tokio::test]
    async fn application_host_early_shutdown_joins_contended_native_fenced_cleanup_as_retain_noop()
    {
        for flag in 0..5 {
            let (sidecar, actor) = shared_slot_actor();
            let host = ApplicationHost::new("native-fences");
            host.bind_participant_cleanup(&actor).unwrap();
            let root = Uuid::new_v4();
            let local = actor
                .start_local(
                    shared_slot_start(root),
                    ParticipantStartMode::SharedUpgradeable,
                )
                .await
                .unwrap();
            let slot = actor.pending.lookup(root);
            let mut locked = slot.clone().lock_owned().await;
            let current = locked.as_mut().unwrap();
            match flag {
                0 => current.prepared = true,
                1 => current.native_started = true,
                2 => current.native_uncertain = true,
                3 => current.native_control_started = true,
                4 => {
                    current.terminal_attempted = true;
                    current.no_terminal_retry = true;
                }
                _ => unreachable!(),
            }
            let owner = current.local_owner;
            drop(local);
            // Already-ready shutdown exercises the before-bind/startup exit,
            // not just the normal bottom-of-serving path.
            let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
            let mut serving = tokio::spawn(
                host.add_service(Idle)
                    .serve_with_listener_shutdown(listener, async {}),
            );
            assert_slot_future_pending(std::pin::Pin::new(&mut serving)).await;
            drop(locked);
            serving.await.unwrap().unwrap();
            let retained = slot.lock_owned().await;
            let current = retained.as_ref().unwrap();
            assert_eq!(current.local_owner, owner);
            assert!(current.has_native_ownership());
            assert_eq!(current.prepared, flag == 0);
            assert_eq!(current.native_started, flag == 1);
            assert_eq!(current.native_uncertain, flag == 2);
            assert_eq!(current.native_control_started, flag == 3);
            assert_eq!(current.terminal_attempted, flag == 4);
            assert_eq!(current.no_terminal_retry, flag == 4);
            let mut writer = Box::pin(actor.lock.exclusive());
            assert_slot_future_pending(writer.as_mut()).await;
            assert!(
                sidecar
                    .calls
                    .lock()
                    .unwrap()
                    .iter()
                    .all(|call| matches!(call, Call::Load(_)))
            );
        }
    }

    #[tokio::test]
    async fn application_host_joins_contended_unarmed_reusable_snapshot_restore() {
        let (sidecar, actor) = shared_slot_actor();
        let host = ApplicationHost::new("reusable-cleanup");
        host.bind_participant_cleanup(&actor).unwrap();
        let root = Uuid::new_v4();
        let nested = Uuid::new_v4();
        let mut first = actor
            .start_local_reusable(
                reusable_request(root, nested),
                ParticipantStartMode::Exclusive,
                true,
            )
            .await
            .unwrap();
        let _execution = first
            .reserve_live_execution(&rollback_context(root, nested))
            .await
            .unwrap();
        first
            .stage(PendingActorEffects {
                state: Some(vec![1]),
                ..Default::default()
            })
            .await
            .unwrap();
        actor
            .relinquish(root, nested, false, Some(first.local_owner))
            .await
            .unwrap();
        let prior_owner = actor
            .pending
            .lock_root(root)
            .await
            .as_ref()
            .unwrap()
            .local_owner;
        drop(first); // queued stale-owner command must not modify the next call.
        let second = actor
            .start_local_reusable(
                reusable_request(root, Uuid::new_v4()),
                ParticipantStartMode::Exclusive,
                true,
            )
            .await
            .unwrap();
        assert!(!second.armed);
        let slot = actor.pending.lookup(root);
        let locked = slot.clone().lock_owned().await;
        let owner = locked.as_ref().unwrap().local_owner;
        drop(second);
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let mut serving = tokio::spawn(
            host.add_service(Idle)
                .serve_with_listener_shutdown(listener, async {}),
        );
        assert_slot_future_pending(std::pin::Pin::new(&mut serving)).await;
        drop(locked);
        serving.await.unwrap().unwrap();
        let pending = slot.lock_owned().await;
        let current = pending.as_ref().unwrap();
        assert_eq!(current.local_owner, prior_owner);
        assert_ne!(current.local_owner, owner);
        assert_eq!(current.effects.state, Some(vec![1]));
        assert_eq!(current.transaction_ids, vec![root]);
        assert!(!current.execution_active);
        assert!(!current.reusable.as_ref().unwrap().admitting);
        assert!(
            sidecar
                .calls
                .lock()
                .unwrap()
                .iter()
                .all(|call| matches!(call, Call::Load(_)))
        );
    }

    #[tokio::test]
    async fn application_host_binding_rejects_cross_host_and_prior_standalone_admission() {
        let actor = DurableActorParticipant::new(
            Arc::new(MockSidecar::default()),
            "example.Actor",
            "actor/1",
        );
        let first = ApplicationHost::new("first");
        first.bind_participant_cleanup(&actor).unwrap();
        first.bind_participant_cleanup(&actor.clone()).unwrap();
        assert!(
            ApplicationHost::new("second")
                .bind_participant_cleanup(&actor)
                .is_err()
        );
        let standalone = DurableActorParticipant::new(
            Arc::new(MockSidecar::default()),
            "example.Actor",
            "actor/2",
        );
        let mut standalone_start = shared_slot_start(Uuid::new_v4());
        standalone_start.state_ref = "actor/2".into();
        standalone_start.coordinator_state_ref = "actor/2".into();
        let local = standalone
            .start_local(standalone_start, ParticipantStartMode::SharedUpgradeable)
            .await
            .unwrap();
        drop(local);
        assert!(first.bind_participant_cleanup(&standalone).is_err());
    }
}
