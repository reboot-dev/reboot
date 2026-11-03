// Included in dynamic_local_catalog::tests to reuse the installation model.
// These are source/model tests, NOT generated Account/native acceptance.
fn recovery_request() -> db::RecoverRequest {
    db::RecoverRequest {
        shard_ids: vec!["catalog-shard".into()],
        state_tags_by_state_type: [("example.Actor".into(), Default::default())].into(),
        skip_idempotent_mutations: true,
    }
}
fn recovery_resolver(
    owners: &[Arc<Owner>],
) -> Arc<crate::durable_coordinator::ExactParticipantResolver<InProcessParticipantEndpoint<Sidecar>>>
{
    Arc::new(
        crate::durable_coordinator::ExactParticipantResolver::new(
            owners
                .iter()
                .map(|o| (o.participant().actor_target(), o.endpoint().clone())),
        )
        .unwrap(),
    )
}
fn recovery_catalog(
    host: &mut ApplicationHost,
    c: GeneratedLocalAdapterConfig,
) -> DynamicLocalCatalog<Adapter, Sidecar, Arc<()>> {
    DynamicLocalCatalog::register(host, c, 4, |o: Arc<Owner>| {
        Ok(Adapter(o.configuration().clone()))
    })
    .unwrap()
}
#[tokio::test]
async fn catalog_recovery_consumes_installed_generation_and_enters_actual_host_phase() {
    use crate::application_host::{HostRecovery, RecoveryCancellation};
    use crate::durable_coordinator::TonicCoordinatorSidecar;
    let store = DatabaseActorStore::connect_lazy("http://127.0.0.1:1").unwrap();
    let original = owner(&store, config("bridge"));
    let mut host = ApplicationHost::new("catalog-recovery-model");
    let catalog = recovery_catalog(&mut host, original.configuration().clone());
    catalog.install(original.clone()).unwrap();
    let mut public = catalog.public_frontdoor().unwrap();
    let phase = catalog
        .into_recovery::<TonicCoordinatorSidecar>(
            store,
            recovery_request(),
            [original.clone()],
            [],
            recovery_resolver(std::slice::from_ref(&original)),
        )
        .unwrap();
    let mut supervisor = tokio::task::JoinSet::new();
    // No host scope is forged: the REAL delegate rejects this direct invocation
    // before Recover. A second invocation proves its real single-start latch ran.
    let error = phase
        .start(&mut supervisor, RecoveryCancellation::new())
        .await
        .unwrap_err();
    assert!(error.message().contains("requires host cleanup scope"));
    let error = phase
        .start(&mut supervisor, RecoveryCancellation::new())
        .await
        .unwrap_err();
    assert!(error.message().contains("cannot be restarted"));
    assert!(supervisor.is_empty());
    let response = tower::Service::call(
        &mut public,
        http::Request::builder()
            .method(http::Method::POST)
            .uri("/example.ActorMethods/Open")
            .header(
                crate::STATE_REF_HEADER,
                &original.configuration().target.state_ref,
            )
            .body(tonic::body::empty_body())
            .unwrap(),
    )
    .await
    .unwrap();
    assert_eq!(response.headers().get("grpc-status").unwrap(), "14");
    // Genuine production registration API accepts the consuming bridge, not a
    // converge-only receipt. Running/native host integration belongs to parent.
    let _registered_host = host.with_host_recovery(phase);
}
#[tokio::test]
async fn catalog_recovery_rejects_missing_duplicate_extra_and_same_gate_substitution() {
    use crate::durable_coordinator::TonicCoordinatorSidecar;
    let store = DatabaseActorStore::connect_lazy("http://127.0.0.1:1").unwrap();
    for case in 0..4 {
        let original = owner(&store, config(&format!("inventory-{case}")));
        let mut host = ApplicationHost::new("catalog-recovery-rejection");
        let catalog = recovery_catalog(&mut host, original.configuration().clone());
        if case != 0 {
            catalog.install(original.clone()).unwrap();
        }
        let mut supplied = vec![original.clone()];
        if case == 1 {
            supplied.push(original.clone());
        }
        if case == 2 {
            let mut other = original.configuration().clone();
            other.target.state_ref =
                crate::state_ref::StateRef::from_id("example.Actor", "omitted")
                    .unwrap()
                    .to_string();
            other.incarnation = Arc::new(());
            catalog.install(owner(&store, other)).unwrap();
        }
        if case == 3 {
            // Same actor, configuration incarnation and store gate, but different
            // actual participant/task/endpoint/custody and owner allocation.
            supplied = vec![owner(&store, original.configuration().clone())];
        }
        let result = catalog.into_recovery::<TonicCoordinatorSidecar>(
            store.clone(),
            recovery_request(),
            supplied,
            [],
            recovery_resolver(&[original]),
        );
        assert!(
            result.is_err(),
            "inventory case {case} unexpectedly accepted"
        );
    }
}
#[tokio::test]
async fn catalog_recovery_rejects_foreign_family_even_with_original_labels() {
    use crate::durable_coordinator::TonicCoordinatorSidecar;
    let store = DatabaseActorStore::connect_lazy("http://127.0.0.1:1").unwrap();
    let original = owner(&store, config("foreign-family"));
    let mut host = ApplicationHost::new("catalog-recovery-family");
    let catalog = recovery_catalog(&mut host, original.configuration().clone());
    let foreign = recovery_catalog(&mut host, original.configuration().clone());
    foreign.install(original.clone()).unwrap();
    assert!(
        catalog
            .into_recovery::<TonicCoordinatorSidecar>(
                store,
                recovery_request(),
                [original.clone()],
                [],
                recovery_resolver(&[original])
            )
            .is_err()
    );
}

// SOURCE738: actual HostRecovery transport models; no fabricated Ready or native
// acceptance. Empty canonical graph exercises real adoption then final rescan.
mod custody_host_model {
    use super::*;
    use crate::application_host::{HostRecovery, RecoveryCancellation};
    use crate::durable_coordinator::{ExactParticipantResolver, TonicCoordinatorSidecar};
    use crate::durable_participant::TonicParticipantSidecar;
    use std::sync::{
        Mutex,
        atomic::{AtomicUsize, Ordering},
    };
    use std::time::Duration;
    use tonic::{Request, Response};
    const BOUND: Duration = Duration::from_secs(10);
    struct Probe(Arc<AtomicUsize>);
    impl Drop for Probe {
        fn drop(&mut self) {
            self.0.fetch_add(1, Ordering::SeqCst);
        }
    }
    #[derive(Clone)]
    struct ProbeAdapter(GeneratedLocalAdapterConfig, Arc<Probe>);
    impl GeneratedLocalTransactionAdapter for ProbeAdapter {
        fn local_configuration(&self) -> Result<GeneratedLocalAdapterConfig, Status> {
            Ok(self.0.clone())
        }
        fn with_local_registration(self, _: RegisteredAdapterBinding) -> Result<Self, Status> {
            Ok(self)
        }
    }
    #[derive(Clone)]
    struct ProbeService {
        _probe: Arc<Probe>,
    }
    impl tonic::server::NamedService for ProbeService {
        const NAME: &'static str = "example.ActorMethods";
    }
    impl tower::Service<http::Request<tonic::body::BoxBody>> for ProbeService {
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
            panic!("no application RPC in custody model")
        }
    }
    impl GeneratedLocalTransactionService for ProbeAdapter {
        type Service = ProbeService;
        fn local_service(&self) -> ProbeService {
            ProbeService {
                _probe: self.1.clone(),
            }
        }
        fn local_inbound_factory(&self) -> Arc<dyn crate::runtime::InboundTransactionStartFactory> {
            Arc::new(Starts)
        }
    }
    struct ScanState {
        scans: AtomicUsize,
        entered: tokio::sync::Semaphore,
        release: tokio::sync::Semaphore,
        fail: bool,
    }
    #[derive(Clone)]
    struct ScanDatabase {
        client: db::database_client::DatabaseClient<tonic::transport::Channel>,
        state: Arc<ScanState>,
    }
    #[tonic::async_trait]
    impl db::database_server::Database for ScanDatabase {
        type PreloadStream = tonic::Streaming<db::PreloadResponse>;
        type RecoverStream =
            tokio_stream::Iter<std::vec::IntoIter<Result<db::RecoverResponse, Status>>>;
        type RecoverIdempotentMutationsStream =
            tonic::Streaming<db::RecoverIdempotentMutationsResponse>;
        type ExportStreamedStream = tonic::Streaming<db::ExportResponse>;
        async fn get_capabilities(
            &self,
            request: Request<db::DatabaseCapabilitiesRequest>,
        ) -> Result<Response<db::DatabaseCapabilitiesResponse>, Status> {
            self.client.clone().get_capabilities(request).await
        }
        async fn colocated_range(
            &self,
            request: Request<db::ColocatedRangeRequest>,
        ) -> Result<Response<db::ColocatedRangeResponse>, Status> {
            self.client.clone().colocated_range(request).await
        }
        async fn colocated_reverse_range(
            &self,
            request: Request<db::ColocatedReverseRangeRequest>,
        ) -> Result<Response<db::ColocatedReverseRangeResponse>, Status> {
            self.client.clone().colocated_reverse_range(request).await
        }
        async fn find(
            &self,
            request: Request<db::FindRequest>,
        ) -> Result<Response<db::FindResponse>, Status> {
            self.client.clone().find(request).await
        }
        async fn load(
            &self,
            request: Request<db::LoadRequest>,
        ) -> Result<Response<db::LoadResponse>, Status> {
            self.client.clone().load(request).await
        }
        async fn preload(
            &self,
            request: Request<db::PreloadRequest>,
        ) -> Result<Response<Self::PreloadStream>, Status> {
            self.client.clone().preload(request).await
        }
        async fn store(
            &self,
            request: Request<db::StoreRequest>,
        ) -> Result<Response<db::StoreResponse>, Status> {
            self.client.clone().store(request).await
        }
        async fn advance_workflow_cursor(
            &self,
            request: Request<db::AdvanceWorkflowCursorRequest>,
        ) -> Result<Response<db::AdvanceWorkflowCursorResponse>, Status> {
            self.client.clone().advance_workflow_cursor(request).await
        }
        async fn complete_task(
            &self,
            request: Request<db::CompleteTaskRequest>,
        ) -> Result<Response<db::CompleteTaskResponse>, Status> {
            self.client.clone().complete_task(request).await
        }
        async fn create_actor(
            &self,
            request: Request<db::CreateActorRequest>,
        ) -> Result<Response<db::CreateActorResponse>, Status> {
            self.client.clone().create_actor(request).await
        }
        async fn create_actor_with_tasks(
            &self,
            request: Request<db::CreateActorRequest>,
        ) -> Result<Response<db::CreateActorResponse>, Status> {
            self.client.clone().create_actor_with_tasks(request).await
        }
        async fn recover(
            &self,
            request: Request<db::RecoverRequest>,
        ) -> Result<Response<Self::RecoverStream>, Status> {
            let index = self.state.scans.fetch_add(1, Ordering::SeqCst);
            if index == 1 {
                // Final rescan is reached ONLY after original snapshot adoption
                // and convergence; canonical inner Custody is still uncertain.
                self.state.entered.add_permits(1);
                self.state.release.acquire().await.unwrap().forget();
                if self.state.fail {
                    return Err(Status::unavailable("post-adoption rescan failure"));
                }
            }
            let mut stream = self.client.clone().recover(request).await?.into_inner();
            let mut pages = Vec::new();
            while let Some(page) = stream.message().await? {
                pages.push(Ok(page));
            }
            Ok(Response::new(tokio_stream::iter(pages)))
        }
        async fn recover_idempotent_mutations(
            &self,
            request: Request<db::RecoverIdempotentMutationsRequest>,
        ) -> Result<Response<Self::RecoverIdempotentMutationsStream>, Status> {
            self.client
                .clone()
                .recover_idempotent_mutations(request)
                .await
        }
        async fn transaction_participant_prepare(
            &self,
            request: Request<db::TransactionParticipantPrepareRequest>,
        ) -> Result<Response<db::TransactionParticipantPrepareResponse>, Status> {
            self.client
                .clone()
                .transaction_participant_prepare(request)
                .await
        }
        async fn transaction_participant_commit(
            &self,
            request: Request<db::TransactionParticipantCommitRequest>,
        ) -> Result<Response<db::TransactionParticipantCommitResponse>, Status> {
            self.client
                .clone()
                .transaction_participant_commit(request)
                .await
        }
        async fn transaction_participant_abort(
            &self,
            request: Request<db::TransactionParticipantAbortRequest>,
        ) -> Result<Response<db::TransactionParticipantAbortResponse>, Status> {
            self.client
                .clone()
                .transaction_participant_abort(request)
                .await
        }
        async fn transaction_coordinator_prepared(
            &self,
            request: Request<db::TransactionCoordinatorPreparedRequest>,
        ) -> Result<Response<db::TransactionCoordinatorPreparedResponse>, Status> {
            self.client
                .clone()
                .transaction_coordinator_prepared(request)
                .await
        }
        async fn transaction_coordinator_prepare(
            &self,
            request: Request<db::TransactionCoordinatorPrepareRequest>,
        ) -> Result<Response<db::TransactionCoordinatorPrepareResponse>, Status> {
            self.client
                .clone()
                .transaction_coordinator_prepare(request)
                .await
        }
        async fn transaction_coordinator_cleanup(
            &self,
            request: Request<db::TransactionCoordinatorCleanupRequest>,
        ) -> Result<Response<db::TransactionCoordinatorCleanupResponse>, Status> {
            self.client
                .clone()
                .transaction_coordinator_cleanup(request)
                .await
        }
        async fn transaction_coordinator_decision_put(
            &self,
            request: Request<db::TransactionCoordinatorDecisionPutRequest>,
        ) -> Result<Response<db::TransactionCoordinatorDecisionPutResponse>, Status> {
            self.client
                .clone()
                .transaction_coordinator_decision_put(request)
                .await
        }
        async fn transaction_coordinator_decision_get(
            &self,
            request: Request<db::TransactionCoordinatorDecisionGetRequest>,
        ) -> Result<Response<db::TransactionCoordinatorDecisionGetResponse>, Status> {
            self.client
                .clone()
                .transaction_coordinator_decision_get(request)
                .await
        }
        async fn export(
            &self,
            request: Request<db::ExportRequest>,
        ) -> Result<Response<db::ExportResponse>, Status> {
            self.client.clone().export(request).await
        }
        async fn export_streamed(
            &self,
            request: Request<db::ExportRequest>,
        ) -> Result<Response<Self::ExportStreamedStream>, Status> {
            self.client.clone().export_streamed(request).await
        }
        async fn get_application_metadata(
            &self,
            request: Request<db::GetApplicationMetadataRequest>,
        ) -> Result<Response<db::GetApplicationMetadataResponse>, Status> {
            self.client.clone().get_application_metadata(request).await
        }
        async fn store_application_metadata(
            &self,
            request: Request<db::StoreApplicationMetadataRequest>,
        ) -> Result<Response<db::StoreApplicationMetadataResponse>, Status> {
            self.client
                .clone()
                .store_application_metadata(request)
                .await
        }
        async fn refresh_timestamp(
            &self,
            request: Request<db::RefreshTimestampRequest>,
        ) -> Result<Response<db::RefreshTimestampResponse>, Status> {
            self.client.clone().refresh_timestamp(request).await
        }
    }
    struct Observed<T> {
        phase: T,
        observed: Mutex<Option<tokio::sync::oneshot::Sender<RecoveryCancellation>>>,
    }
    #[tonic::async_trait]
    impl<T: HostRecovery> HostRecovery for Observed<T> {
        async fn start(
            &self,
            supervisor: &mut tokio::task::JoinSet<Result<(), Status>>,
            cancel: RecoveryCancellation,
        ) -> Result<(), Status> {
            self.observed
                .lock()
                .unwrap()
                .take()
                .unwrap()
                .send(cancel.clone())
                .ok();
            self.phase.start(supervisor, cancel).await
        }
    }
    async fn exercise(mode: u8) {
        let (upstream, _database, database_server) =
            crate::runtime::test_support::start_database().await;
        let state = Arc::new(ScanState {
            scans: AtomicUsize::new(0),
            entered: tokio::sync::Semaphore::new(0),
            release: tokio::sync::Semaphore::new(0),
            fail: mode == 2,
        });
        let proxy = ScanDatabase {
            client: db::database_client::DatabaseClient::connect(upstream)
                .await
                .unwrap(),
            state: state.clone(),
        };
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let endpoint = format!("http://{}", listener.local_addr().unwrap());
        let proxy_server = tokio::spawn(async move {
            tonic::transport::Server::builder()
                .add_service(db::database_server::DatabaseServer::new(proxy))
                .serve_with_incoming(tokio_stream::wrappers::TcpListenerStream::new(listener))
                .await
                .unwrap();
        });
        let store = DatabaseActorStore::connect_lazy(&endpoint).unwrap();
        let mut c = config(&uuid::Uuid::new_v4().to_string());
        c.database_endpoint = store.database_endpoint().to_owned();
        let participant = DurableActorParticipant::new(
            Arc::new(TonicParticipantSidecar::connect(&endpoint).await.unwrap()),
            "example.Actor",
            &c.target.state_ref,
        )
        .with_database_actor_gate(&store);
        let tasks = OneShotTasks::new_with_participant_declarations(
            store.clone(),
            c.target.state_type.clone(),
            c.target.state_ref.clone(),
            ParticipantBoundTaskBinding::new(participant.clone(), Binding),
            vec![],
        )
        .unwrap();
        let original = DynamicLocalOwner::new(
            c.clone(),
            participant.clone(),
            tasks,
            Arc::new(InProcessParticipantEndpoint::new(
                DurableActorParticipantHost::new(participant),
            )),
            Arc::new(()),
        )
        .unwrap();
        let original_c = Arc::downgrade(original.custody());
        let factory_drops = Arc::new(AtomicUsize::new(0));
        let service_drops = Arc::new(AtomicUsize::new(0));
        let factory = Arc::new(Probe(factory_drops.clone()));
        let service = Arc::new(Probe(service_drops.clone()));
        let factory_weak = Arc::downgrade(&factory);
        let service_weak = Arc::downgrade(&service);
        let mut host = ApplicationHost::new("source738-custody");
        let catalog = DynamicLocalCatalog::register(
            &mut host,
            c,
            1,
            move |o: Arc<DynamicLocalOwner<TonicParticipantSidecar, Arc<()>>>| {
                let _keep_factory_capture = &factory;
                Ok(ProbeAdapter(o.configuration().clone(), service.clone()))
            },
        )
        .unwrap();
        catalog.install(original.clone()).unwrap();
        let frontdoor = catalog.public_frontdoor().unwrap();
        let resolver = Arc::new(
            ExactParticipantResolver::new([(
                original.participant().actor_target(),
                original.endpoint().clone(),
            )])
            .unwrap(),
        );
        let phase = catalog
            .into_recovery::<TonicCoordinatorSidecar>(
                store,
                recovery_request(),
                [original.clone()],
                [],
                resolver,
            )
            .unwrap();
        drop(original);
        let (observed_tx, observed_rx) = tokio::sync::oneshot::channel();
        let (stop_tx, stop_rx) = tokio::sync::oneshot::channel();
        let host = host
            .with_host_recovery(Observed {
                phase,
                observed: Mutex::new(Some(observed_tx)),
            })
            .add_public_service(frontdoor.clone());
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let mut serving = tokio::spawn(host.serve_with_listener_shutdown(listener, async {
            let _ = stop_rx.await;
        }));
        let cancel = tokio::time::timeout(BOUND, observed_rx)
            .await
            .unwrap()
            .unwrap();
        tokio::time::timeout(BOUND, state.entered.acquire())
            .await
            .unwrap()
            .unwrap()
            .forget();
        assert_eq!(
            state.scans.load(Ordering::SeqCst),
            2,
            "real EOF and post-adoption rescan reached"
        );
        assert!(
            tokio::time::timeout(Duration::from_millis(25), cancel.public_ready())
                .await
                .is_err(),
            "host must not publish Ready before canonical rescan"
        );
        if mode == 1 {
            cancel.cancel();
        } else {
            state.release.add_permits(1);
        }
        if mode == 0 {
            tokio::time::timeout(BOUND, cancel.public_ready())
                .await
                .unwrap()
                .unwrap();
            stop_tx.send(()).unwrap();
            tokio::time::timeout(BOUND, &mut serving)
                .await
                .unwrap()
                .unwrap()
                .unwrap();
        } else {
            assert!(
                tokio::time::timeout(BOUND, &mut serving)
                    .await
                    .unwrap()
                    .unwrap()
                    .is_err()
            );
            drop(stop_tx);
        }
        drop(serving);
        drop(frontdoor);
        assert!(
            cancel.public_ready().await.is_err(),
            "revocation survives retained snapshots"
        );
        drop(cancel);
        // ALL outer phase/host/frontdoor and original-owner handles are gone.
        if mode == 0 {
            assert!(factory_weak.upgrade().is_none());
            assert!(service_weak.upgrade().is_none());
            assert_eq!(factory_drops.load(Ordering::SeqCst), 1);
            assert_eq!(service_drops.load(Ordering::SeqCst), 1);
        } else {
            assert!(factory_weak.upgrade().is_some());
            assert!(service_weak.upgrade().is_some());
            assert_eq!(factory_drops.load(Ordering::SeqCst), 0);
            assert_eq!(service_drops.load(Ordering::SeqCst), 0);
        }
        // Explicit foundation limit: original C/owner/permit independently leak
        // even on healthy shutdown. This repair releases ADDITIONAL payload only.
        assert!(original_c.upgrade().is_some());
        proxy_server.abort();
        database_server.abort();
        assert!(proxy_server.await.unwrap_err().is_cancelled());
        assert!(database_server.await.unwrap_err().is_cancelled());
    }
    #[tokio::test]
    async fn actual_host_empty_recovery_releases_additional_payload_after_healthy_shutdown() {
        exercise(0).await;
    }
    #[tokio::test]
    async fn actual_host_post_adoption_cancel_retains_additional_payload_after_all_outer_drops() {
        exercise(1).await;
    }
    #[tokio::test]
    async fn actual_host_post_adoption_error_retains_additional_payload_after_all_outer_drops() {
        exercise(2).await;
    }
}
