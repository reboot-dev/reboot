//! Real generated transaction adapter target for the workflow transaction seam.
use crate::{arg, event, generated, proto};
use reboot::{
    application_host::{ApplicationHost, LegacyRecoveryMetadata},
    auth::AuthorizationPolicy,
    durable_coordinator::{
        CoordinatorRecovery, DurableRootCoordinator, ExactParticipantResolver,
        InProcessParticipantEndpoint, TonicCoordinatorSidecar,
    },
    durable_participant::{
        DurableActorParticipant, DurableActorParticipantHost, ParticipantRecovery,
        TonicParticipantSidecar,
    },
    legacy_coordinator::TonicCoordinatorWatchEndpoint,
    runtime::{
        DatabaseActorStore, InboundTransactionContext, InboundTransactionStartFactory,
        RootTransactionStart, RootTransactionStartFactory, TransactionContext,
        TransactionExecution,
    },
};
use std::sync::Arc;
const TYPE: &str = "workflow.v1.AtomicLedger";
pub fn actor() -> reboot::actor_ref::ActorRef {
    reboot::actor_ref::ActorRef::from_id(TYPE, "atomic").unwrap()
}
struct Starts;
impl RootTransactionStartFactory for Starts {
    fn next_root_transaction(&self) -> Result<RootTransactionStart, tonic::Status> {
        Ok(RootTransactionStart {
            transaction_id: uuid::Uuid::new_v4(),
            timestamp: prost_types::Timestamp::default(),
        })
    }
}
impl InboundTransactionStartFactory for Starts {
    fn next_inbound_transaction(
        &self,
        _: &InboundTransactionContext,
    ) -> Result<uuid::Uuid, tonic::Status> {
        Ok(uuid::Uuid::new_v4())
    }
}
struct Policy;
impl reboot::auth::Authorizer for Policy {
    fn authorize<'a>(
        &'a self,
        context: &'a reboot::auth::AuthorizationContext,
        _: Option<&'a reboot::auth::Auth>,
        _: Option<&'a [u8]>,
        _: &'a [u8],
    ) -> reboot::auth::AuthorizeFuture<'a> {
        Box::pin(async move {
            if context.method.ends_with(".Apply") {
                event("transaction-authorize");
                if std::env::var_os("TRANSACTION_DENY_FILE")
                    .is_some_and(|path| std::path::Path::new(&path).exists())
                {
                    return reboot::auth::AuthorizationDecision::PermissionDenied {
                        message: "transaction policy denied".into(),
                    };
                }
            }
            reboot::auth::AuthorizationDecision::Allow
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
        if state != TYPE || target != self.0 {
            return Err(tonic::Status::failed_precondition(
                "unexpected local transaction destination",
            ));
        }
        Ok(reboot::runtime::TransactionalRoute::RegisteredSameHost)
    }
    async fn resolve(&self, _: &str, _: &str) -> Result<tonic::transport::Channel, tonic::Status> {
        Err(tonic::Status::failed_precondition("no network fallback"))
    }
}
struct Handler {
    child: Option<String>,
}
#[tonic::async_trait]
impl generated::AtomicLedgerMethodsTransactionHandler for Handler {
    async fn create(
        &self,
        _: &TransactionContext,
        state: &mut proto::AtomicLedger,
        r: proto::Step,
    ) -> Result<TransactionExecution<proto::Value>, tonic::Status> {
        event("transaction-create");
        state.value = r.amount;
        Ok(TransactionExecution::new(proto::Value {
            value: state.value,
        }))
    }
    async fn apply(
        &self,
        context: &TransactionContext,
        state: &mut proto::AtomicLedger,
        r: proto::Step,
    ) -> Result<TransactionExecution<proto::Value>, tonic::Status> {
        event(if self.child.is_some() {
            "transaction-apply"
        } else {
            "transaction-child"
        });
        state.value += r.amount;
        if let Some(child) = &self.child {
            let client = generated::AtomicLedgerMethodsClient::new(LocalOnly(child.clone()));
            let target = generated::AtomicLedgerMethodsTarget::new(child);
            client
                .apply(
                    context,
                    &target,
                    proto::Step {
                        amount: r.amount.abs(),
                    },
                )
                .await?;
            event("transaction-child-staged");
        }
        if r.amount < 0 {
            return Err(tonic::Status::invalid_argument("transaction rollback"));
        }
        let mut execution = TransactionExecution::new(proto::Value { value: state.value });
        if self.child.is_some() {
            let mut task = generated::AtomicLedgerMethodsTasks::query(
                context.headers().state_ref.as_str(),
                &proto::Empty {},
            );
            task.timestamp = Some(prost_types::Timestamp {
                seconds: 4102444800,
                nanos: 0,
            });
            execution.task_upserts.push(task);
        }
        Ok(execution)
    }
    async fn query(
        &self,
        state: &proto::AtomicLedger,
        _: proto::Empty,
    ) -> Result<proto::AtomicLedger, tonic::Status> {
        Ok(*state)
    }
}
struct Initialize;
#[tonic::async_trait]
impl generated::AtomicLedgerInitMethodsDatabaseHandler for Initialize {
    async fn open(
        &self,
        state: &mut proto::AtomicLedger,
        r: proto::Step,
    ) -> Result<proto::Value, tonic::Status> {
        state.value = r.amount;
        Ok(proto::Value { value: state.value })
    }
}
pub async fn serve() -> Result<(), Box<dyn std::error::Error>> {
    let endpoint = arg(2);
    let address = arg(3).parse()?;
    let shutdown = arg(4);
    let store = DatabaseActorStore::connect(&endpoint).await?;
    let leaf_ref = reboot::state_ref::StateRef::from_id(TYPE, "leaf")?.to_string();
    let sidecar = Arc::new(TonicParticipantSidecar::connect(&endpoint).await?);
    let participants =
        [actor().state_ref().as_str().to_owned(), leaf_ref.clone()].map(|reference| {
            DurableActorParticipant::new(sidecar.clone(), TYPE, reference)
                .with_database_actor_gate(&store)
        });
    let resolver = Arc::new(ExactParticipantResolver::new(participants.iter().map(
        |p| {
            (
                p.actor_target(),
                Arc::new(InProcessParticipantEndpoint::new(
                    DurableActorParticipantHost::new(p.clone()),
                )),
            )
        },
    ))?);
    let coordinator = DurableRootCoordinator::new(
        Arc::new(TonicCoordinatorSidecar::connect(&endpoint).await?),
        resolver,
    );
    let watch = Arc::new(TonicCoordinatorWatchEndpoint::lazy(format!(
        "http://{address}"
    ))?);
    let make = |i: usize| {
        generated::AtomicLedgerMethodsTransactionAdapter::new(
            store.clone(),
            participants[i].clone(),
            coordinator.clone(),
            Starts,
            Handler {
                child: (i == 0).then(|| leaf_ref.clone()),
            },
        )
        .with_authorization(AuthorizationPolicy::new(None, Some(Arc::new(Policy))))
        .with_external_constructors()
        .with_sequential_root_star()
    };
    let (root, tasks) = make(0)
        .with_explicit_abort_owner(reboot::explicit_abort::ExplicitAbortOwner::new(4)?)
        .with_one_shot_reader_tasks(actor().state_ref().as_str())?;
    let leaf =
        make(1).with_live_participant_owner(reboot::live_participant::LiveParticipantOwner::new(
            4,
            participants[0].actor_target(),
            watch.clone(),
        )?);
    let mut host = ApplicationHost::new("transaction-target-fixture");
    let (adapter, _) = host.register_local_transaction_service(root)?;
    let (leaf, _) = host.register_local_transaction_service(leaf)?;
    let recovery = adapter
        .legacy_recovery_registration(
            LegacyRecoveryMetadata {
                participant: ParticipantRecovery {
                    shard_ids: vec!["s000000000".into()],
                    ..Default::default()
                },
                coordinator: CoordinatorRecovery {
                    shard_ids: vec!["s000000000".into()],
                    coordinator_state_ref: actor().state_ref().as_str().into(),
                    ..Default::default()
                },
            },
            watch,
        )?
        .with_participant(
            participants[1].clone(),
            ParticipantRecovery {
                shard_ids: vec!["s000000000".into()],
                ..Default::default()
            },
        )?;
    host.with_host_recovery(recovery)
        .with_host_recovery(adapter.explicit_abort_recovery_registration()?)
        .with_host_recovery(leaf.live_participant_recovery_registration()?)
        .with_host_recovery(tasks.recovery(reboot::database_proto::RecoverRequest {
            shard_ids: vec!["s000000000".into()],
            state_tags_by_state_type: [(TYPE.into(), "AtomicLedger".into())].into(),
            skip_idempotent_mutations: true,
        }))
        .add_legacy_control_service(adapter.legacy_participant_control_service())
        .add_legacy_control_service(
            adapter.legacy_coordinator_control_service(TYPE, actor().state_ref().as_str())?,
        )
        .add_public_service(
            proto::atomic_ledger_init_methods_server::AtomicLedgerInitMethodsServer::new(
                generated::AtomicLedgerInitMethodsDatabaseAdapter::new(store, Initialize)
                    .with_authorization(AuthorizationPolicy::permissive_for_development()),
            ),
        )
        .add_public_service(
            proto::atomic_ledger_methods_server::AtomicLedgerMethodsServer::new(adapter),
        )
        .serve_with_shutdown(address, async move {
            while !std::path::Path::new(&shutdown).exists() {
                tokio::time::sleep(std::time::Duration::from_millis(5)).await;
            }
        })
        .await?;
    Ok(())
}
pub async fn invoke(
    context: &reboot::one_shot_tasks::WorkflowContext<'_>,
    request: proto::Step,
) -> Result<proto::Value, tonic::Status> {
    let endpoint = std::env::var("TRANSACTION_ENDPOINT")
        .map_err(|_| tonic::Status::failed_precondition("missing transaction target"))?;
    let channel = tonic::transport::Endpoint::from_shared(endpoint)
        .map_err(|e| tonic::Status::invalid_argument(e.to_string()))?
        .connect_lazy();
    let target = generated::AtomicLedgerMethodsWorkflowTransactionRef::new(
        channel,
        actor(),
        reboot::CallerId::new("a0000000001", None).unwrap(),
        None,
    )?;
    let request = match std::env::var("TRANSACTION_AMOUNT") {
        Ok(amount) => proto::Step {
            amount: amount
                .parse()
                .map_err(|_| tonic::Status::invalid_argument("bad transaction override"))?,
        },
        Err(_) => request,
    };
    let response = target.apply(context, "atomic-effect", request).await?;
    event("transaction-returned");
    Ok(response)
}
