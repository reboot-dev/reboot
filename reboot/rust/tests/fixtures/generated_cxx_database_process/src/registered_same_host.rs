//! Native registered A -> B fixture; no manual settlement or Database seeding.
use super::*;
use proto::transaction_counter_writes_methods_server::TransactionCounterWritesMethods;
use reboot::durable_coordinator::{ExactParticipantResolver, InProcessParticipantEndpoint};
use reboot::durable_participant::DurableActorParticipantHost;
const STATE: &str = "tests.reboot.protoc.TransactionCounter";

struct ObservedWatch(reboot::legacy_coordinator::TonicCoordinatorWatchEndpoint);
impl reboot::legacy_coordinator::CoordinatorWatchEndpoint for ObservedWatch {
    fn watch(
        &self,
        request: reboot::database_proto::WatchRequest,
    ) -> reboot::legacy_coordinator::CoordinatorWatchFuture<'_, reboot::database_proto::WatchResponse>
    {
        Box::pin(async move {
            let result = self.0.watch(request).await;
            if let Some(marker) = optional_arg("--local-watch-released-marker") {
                use std::io::Write;
                writeln!(
                    std::fs::OpenOptions::new()
                        .create(true)
                        .append(true)
                        .open(format!("{marker}.rpc"))
                        .unwrap(),
                    "{result:?}"
                )
                .unwrap();
            }
            result
        })
    }
}
struct LocalOnly(String);
#[tonic::async_trait]
impl reboot::runtime::TransactionalChannelResolver for LocalOnly {
    fn transactional_route(
        &self,
        state: &str,
        target: &str,
        _: &str,
    ) -> Result<reboot::runtime::TransactionalRoute, tonic::Status> {
        assert_eq!(state, STATE);
        assert_eq!(target, self.0);
        Ok(reboot::runtime::TransactionalRoute::RegisteredSameHost)
    }
    async fn resolve(&self, _: &str, _: &str) -> Result<tonic::transport::Channel, tonic::Status> {
        panic!("same-host native fixture must not resolve a network channel")
    }
}
struct LocalHandler {
    child: Option<String>,
}
#[tonic::async_trait]
impl generated::TransactionCounterWritesMethodsTransactionHandler for LocalHandler {
    async fn factory_increment(
        &self,
        _: &TransactionContext,
        _: &mut proto::TransactionCounter,
        _: proto::TransactionIncrementRequest,
    ) -> Result<
        TransactionExecution<proto::TransactionCounterValue>,
        generated::TransactionCounterWritesMethodsFactoryIncrementError,
    > {
        Err(
            generated::TransactionCounterWritesMethodsFactoryIncrementError::Grpc(
                tonic::Status::unimplemented("exclusive nonfactory native fixture"),
            ),
        )
    }
    async fn factory_increment_target(
        &self,
        _: &TransactionContext,
        _: &mut proto::TransactionCounter,
        _: proto::TransactionIncrementRequest,
    ) -> Result<TransactionExecution<proto::TransactionCounterValue>, tonic::Status> {
        Err(tonic::Status::unimplemented(
            "exclusive nonfactory native fixture",
        ))
    }
    async fn shared_read(
        &self,
        _: &TransactionContext,
        _: &mut proto::TransactionCounter,
        _: proto::TransactionIncrementRequest,
    ) -> Result<TransactionExecution<proto::TransactionCounterValue>, tonic::Status> {
        Err(tonic::Status::unimplemented(
            "exclusive nonfactory native fixture",
        ))
    }
    async fn shared_read_fresh_shared(
        &self,
        _: &reboot::runtime::SharedLocalTransactionContext,
        _: &mut proto::TransactionCounter,
        _: proto::TransactionIncrementRequest,
    ) -> Result<proto::TransactionCounterValue, tonic::Status> {
        Err(tonic::Status::unimplemented(
            "exclusive nonfactory native fixture",
        ))
    }

    async fn query(
        &self,
        state: &proto::TransactionCounter,
        _: proto::TransactionIncrementRequest,
    ) -> Result<proto::TransactionCounterValue, tonic::Status> {
        Ok(proto::TransactionCounterValue { value: state.value })
    }
    async fn apply(
        &self,
        state: &mut proto::TransactionCounter,
        request: proto::TransactionIncrementRequest,
    ) -> Result<proto::TransactionCounterValue, tonic::Status> {
        state.value += request.amount;
        Ok(proto::TransactionCounterValue { value: state.value })
    }
    async fn query_declared(
        &self,
        state: &proto::TransactionCounter,
        request: proto::TransactionIncrementRequest,
    ) -> Result<
        proto::TransactionCounterValue,
        generated::TransactionCounterWritesMethodsQueryDeclaredError,
    > {
        self.query(state, request)
            .await
            .map_err(generated::TransactionCounterWritesMethodsQueryDeclaredError::Grpc)
    }
    async fn apply_declared(
        &self,
        state: &mut proto::TransactionCounter,
        request: proto::TransactionIncrementRequest,
    ) -> Result<
        proto::TransactionCounterValue,
        generated::TransactionCounterWritesMethodsApplyDeclaredError,
    > {
        self.apply(state, request)
            .await
            .map_err(generated::TransactionCounterWritesMethodsApplyDeclaredError::Grpc)
    }
    async fn increment(
        &self,
        context: &TransactionContext,
        state: &mut proto::TransactionCounter,
        request: proto::TransactionIncrementRequest,
    ) -> Result<TransactionExecution<proto::TransactionCounterValue>, tonic::Status> {
        context.require_registered_outbound()?;
        if let Some(child) = &self.child {
            let client =
                generated::TransactionCounterWritesMethodsClient::new(LocalOnly(child.clone()));
            let target = generated::TransactionCounterWritesMethodsTarget::new(child);
            let context = context.clone();
            // Fixture-only stack separation, awaited; production dispatch remains inline.
            let response = tokio::spawn(async move {
                client
                    .increment(
                        &context,
                        &target,
                        proto::TransactionIncrementRequest { amount: 1 },
                    )
                    .await
            })
            .await
            .unwrap()
            .unwrap();
            assert_eq!(response.response().get_ref().value, 5);
        } else {
            assert_eq!(context.transaction_ids().len(), 2);
            assert!(context.headers().bearer_token.is_none());
            assert!(context.headers().cookie.is_none());
        }
        state.value += request.amount;
        Ok(TransactionExecution::new(proto::TransactionCounterValue {
            value: state.value,
        }))
    }
}
fn request(
    target: &str,
    amount: i64,
    writer: bool,
) -> tonic::Request<proto::TransactionIncrementRequest> {
    let mut headers = reboot::RebootHeaders::new(target);
    if writer {
        headers.idempotency_key = Some(Uuid::new_v4());
    } else {
        headers.bearer_token = Some("native-test-parent-token".into());
        headers.cookie = Some("native-test-cookie".into());
    }
    let mut request = tonic::Request::new(proto::TransactionIncrementRequest { amount });
    *request.metadata_mut() = headers.to_metadata().unwrap();
    request
}
pub async fn run() {
    let endpoint = arg("--database");
    let listen = arg("--listen");
    let refs = [arg("--state-ref"), arg("--local-child-ref")];
    let store = DatabaseActorStore::connect(&endpoint).await.unwrap();
    let sidecar = Arc::new(TonicParticipantSidecar::connect(&endpoint).await.unwrap());
    let participants = refs.each_ref().map(|reference| {
        DurableActorParticipant::new(sidecar.clone(), STATE, reference)
            .with_database_actor_gate(&store)
    });
    let resolver = Arc::new(
        ExactParticipantResolver::new(participants.iter().map(|participant| {
            (
                participant.actor_target(),
                Arc::new(InProcessParticipantEndpoint::new(
                    DurableActorParticipantHost::new(participant.clone()),
                )),
            )
        }))
        .unwrap(),
    );
    let coordinator_sidecar = Arc::new(TonicCoordinatorSidecar::connect(&endpoint).await.unwrap());
    let coordinators = participants.each_ref().map(|participant| {
        reboot::durable_coordinator::DurableRootCoordinator::new(
            coordinator_sidecar.clone(),
            resolver.clone(),
        )
        .with_identity(participant.actor_target())
    });
    let watch = Arc::new(ObservedWatch(
        reboot::legacy_coordinator::TonicCoordinatorWatchEndpoint::lazy(format!("http://{listen}"))
            .unwrap(),
    ));
    let live = reboot::live_participant::LiveParticipantOwner::new(
        2,
        participants[0].actor_target(),
        watch.clone(),
    )
    .unwrap();
    let make = |index: usize| {
        generated::TransactionCounterWritesMethodsTransactionAdapter::new(
            store.clone(),
            participants[index].clone(),
            coordinators[index].clone(),
            Starts {
                root: Uuid::parse_str(&arg("--root-id")).unwrap(),
                child: Uuid::from_u128(202),
            },
            LocalHandler {
                child: (index == 0).then(|| refs[1].clone()),
            },
        )
        .with_authorization(reboot::auth::AuthorizationPolicy::permissive_for_development())
        .with_sequential_root_star()
    };
    let a = make(0)
        .with_explicit_abort_owner(reboot::explicit_abort::ExplicitAbortOwner::new(2).unwrap());
    let b = make(1).with_live_participant_owner(live);
    let mut host = ApplicationHost::new("native-registered-same-host");
    let (a, _) = host.register_local_transaction_service(a).unwrap();
    let (b, _) = host.register_local_transaction_service(b).unwrap();
    let recovery_metadata = ParticipantRecovery {
        shard_ids: vec!["s000000000".into()],
        ..Default::default()
    };
    let recovery = a
        .legacy_recovery_registration(
            LegacyRecoveryMetadata {
                participant: recovery_metadata.clone(),
                coordinator: CoordinatorRecovery {
                    shard_ids: vec!["s000000000".into()],
                    coordinator_state_ref: refs[0].clone(),
                    ..Default::default()
                },
            },
            watch,
        )
        .unwrap()
        .with_participant(participants[1].clone(), recovery_metadata)
        .unwrap();
    let control = a
        .legacy_coordinator_control_service(STATE, &refs[0])
        .unwrap();
    let public = proto::transaction_counter_writes_methods_server::TransactionCounterWritesMethodsServer::new(a.clone());
    let host = host
        .with_host_recovery(recovery)
        .with_host_recovery(a.explicit_abort_recovery_registration().unwrap())
        .with_host_recovery(b.live_participant_recovery_registration().unwrap())
        .add_legacy_control_service(control)
        .add_public_service(public);
    let (stop, stopped) = tokio::sync::oneshot::channel();
    let server = tokio::spawn(host.serve_with_shutdown(listen.parse().unwrap(), async {
        let _ = stopped.await;
    }));
    tokio::time::timeout(std::time::Duration::from_secs(10), async {
        while a.require_local_host_ready().is_err() {
            tokio::task::yield_now().await;
        }
    })
    .await
    .unwrap();
    for (adapter, reference) in [(&a, &refs[0]), (&b, &refs[1])] {
        assert_eq!(
            adapter
                .apply(request(reference, 4, true))
                .await
                .unwrap()
                .get_ref()
                .value,
            4
        );
    }
    let called = a.clone();
    let root_ref = refs[0].clone();
    let call = tokio::spawn(async move { called.increment(request(&root_ref, 1, false)).await });
    if let Some(marker) = optional_arg("--local-watch-released-marker") {
        let terminal = std::env::var("REBOOT_TEST_TARGET_WATCH_TERMINALIZED").unwrap();
        tokio::time::timeout(std::time::Duration::from_secs(20), async {
            while !std::path::Path::new(&terminal).exists() {
                tokio::time::sleep(std::time::Duration::from_millis(5)).await;
            }
        })
        .await
        .unwrap();
        assert_eq!(
            std::fs::read_to_string(terminal).unwrap(),
            "watch-terminalized\n"
        );
        assert_eq!(
            tokio::time::timeout(
                std::time::Duration::from_secs(3),
                b.apply(request(&refs[1], 0, true))
            )
            .await
            .unwrap()
            .unwrap()
            .get_ref()
            .value,
            5
        );
        std::fs::write(marker, b"registered B gate released by Watch").unwrap();
    }
    assert_eq!(
        tokio::time::timeout(std::time::Duration::from_secs(30), call)
            .await
            .unwrap()
            .unwrap()
            .unwrap()
            .get_ref()
            .value,
        5
    );
    stop.send(()).unwrap();
    tokio::time::timeout(std::time::Duration::from_secs(5), server)
        .await
        .unwrap()
        .unwrap()
        .unwrap();
}
