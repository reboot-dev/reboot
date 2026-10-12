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
    children: Vec<String>,
    depth: usize,
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
        assert_eq!(context.transaction_ids().len(), self.depth);
        for child in &self.children {
            let client =
                generated::TransactionCounterWritesMethodsClient::new(LocalOnly(child.clone()));
            let target = generated::TransactionCounterWritesMethodsTarget::new(child);
            // Inline dispatch on the ordinary outer root-call Tokio worker.
            let response = client
                .increment(
                    context,
                    &target,
                    proto::TransactionIncrementRequest { amount: 1 },
                )
                .await
                .unwrap();
            assert_eq!(response.response().get_ref().value, 5);
        }
        if self.children.is_empty() {
            assert!(context.transaction_ids().len() >= 2);
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
    let chain = has("--local-chain");
    let siblings = has("--local-siblings");
    let mut refs = vec![arg("--state-ref"), arg("--local-child-ref")];
    if chain || siblings {
        refs.push(arg("--local-grandchild-ref"));
    }
    let store = DatabaseActorStore::connect(&endpoint).await.unwrap();
    let sidecar = Arc::new(TonicParticipantSidecar::connect(&endpoint).await.unwrap());
    let participants: Vec<_> = refs
        .iter()
        .map(|reference| {
            DurableActorParticipant::new(sidecar.clone(), STATE, reference)
                .with_database_actor_gate(&store)
        })
        .collect();
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
    let coordinators: Vec<_> = participants
        .iter()
        .map(|participant| {
            reboot::durable_coordinator::DurableRootCoordinator::new(
                coordinator_sidecar.clone(),
                resolver.clone(),
            )
            .with_identity(participant.actor_target())
        })
        .collect();
    let watch = Arc::new(ObservedWatch(
        reboot::legacy_coordinator::TonicCoordinatorWatchEndpoint::lazy(format!("http://{listen}"))
            .unwrap(),
    ));
    let make = |index: usize| {
        let adapter = generated::TransactionCounterWritesMethodsTransactionAdapter::new(
            store.clone(),
            participants[index].clone(),
            coordinators[index].clone(),
            Starts {
                root: Uuid::parse_str(&arg("--root-id")).unwrap(),
                child: Uuid::from_u128(202 + index as u128),
            },
            LocalHandler {
                children: if siblings {
                    if index == 0 {
                        refs[1..].to_vec()
                    } else {
                        vec![]
                    }
                } else {
                    refs.get(index + 1).cloned().into_iter().collect()
                },
                depth: if siblings && index > 0 { 2 } else { index + 1 },
            },
        )
        .with_authorization(reboot::auth::AuthorizationPolicy::permissive_for_development());
        if chain {
            adapter.with_supervised_transaction_tree()
        } else {
            adapter.with_sequential_root_star()
        }
    };
    let mut host = ApplicationHost::new("native-registered-same-host");
    let mut adapters = Vec::new();
    for index in 0..refs.len() {
        let adapter = if index == 0 {
            make(index).with_explicit_abort_owner(
                reboot::explicit_abort::ExplicitAbortOwner::new(2).unwrap(),
            )
        } else {
            make(index).with_live_participant_owner(
                reboot::live_participant::LiveParticipantOwner::new(
                    2,
                    participants[0].actor_target(),
                    watch.clone(),
                )
                .unwrap(),
            )
        };
        let (adapter, _) = host.register_local_transaction_service(adapter).unwrap();
        adapters.push(adapter);
    }
    let a = adapters[0].clone();
    let b = adapters[1].clone();
    let recovery_metadata = ParticipantRecovery {
        shard_ids: vec!["s000000000".into()],
        ..Default::default()
    };
    let mut recovery = a
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
        .unwrap();
    for participant in participants.iter().skip(1) {
        recovery = recovery
            .with_participant(participant.clone(), recovery_metadata.clone())
            .unwrap();
    }
    let control = a
        .legacy_coordinator_control_service(STATE, &refs[0])
        .unwrap();
    let public = proto::transaction_counter_writes_methods_server::TransactionCounterWritesMethodsServer::new(a.clone());
    let mut host = host
        .with_host_recovery(recovery)
        .with_host_recovery(a.explicit_abort_recovery_registration().unwrap());
    for adapter in adapters.iter().skip(1) {
        host = host.with_host_recovery(adapter.live_participant_recovery_registration().unwrap());
    }
    let host = host
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
    if let Some(marker) = optional_arg("--local-recovered-marker") {
        // Recovery-only launch must not initialize or rerun transaction handlers.
        for (adapter, reference) in adapters.iter().zip(&refs) {
            assert_eq!(
                adapter
                    .query(request(reference, 0, false))
                    .await
                    .unwrap()
                    .get_ref()
                    .value,
                5
            );
        }
        stop.send(()).unwrap();
        tokio::time::timeout(std::time::Duration::from_secs(5), server)
            .await
            .unwrap()
            .unwrap()
            .unwrap();
        std::fs::write(marker, b"recovered A/B readback without initialization\n").unwrap();
        return;
    }
    for (adapter, reference) in adapters.iter().zip(&refs) {
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
    let mut client = proto::transaction_counter_writes_methods_client::TransactionCounterWritesMethodsClient::connect(format!("http://{listen}")).await.unwrap();
    let root_ref = refs[0].clone();
    let call = tokio::spawn(async move { client.increment(request(&root_ref, 1, false)).await });
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
