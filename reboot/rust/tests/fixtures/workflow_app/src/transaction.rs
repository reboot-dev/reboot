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
    reboot::actor_ref::ActorRef::from_id(TYPE, &std::env::var("PURE_TRANSACTION_ACTOR").unwrap_or_else(|_| "atomic".into())).unwrap()
}
pub(super) struct Starts;
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
pub(super) struct Policy;
impl reboot::auth::Authorizer for Policy {
    fn authorize<'a>(
        &'a self,
        context: &'a reboot::auth::AuthorizationContext,
        _: Option<&'a reboot::auth::Auth>,
        _: Option<&'a [u8]>,
        _: &'a [u8],
    ) -> reboot::auth::AuthorizeFuture<'a> {
        Box::pin(async move {
            if context.method.ends_with(".Apply") || context.method.ends_with(".Fail") {
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
        if std::env::var_os("REMOTE_TRANSACTION_PLANNER").is_some() {
            return Ok(reboot::runtime::TransactionalRoute::Network);
        }
        Ok(reboot::runtime::TransactionalRoute::RegisteredSameHost)
    }
    async fn resolve(&self, state: &str, target: &str) -> Result<tonic::transport::Channel, tonic::Status> {
        if std::env::var_os("REMOTE_TRANSACTION_PLANNER").is_some() {
            return reboot::legacy_placement::LegacyApplicationResolver::new(
                reboot::legacy_placement::LegacyApplicationId::new("workflow-app")?,
                crate::remote_transaction::placement(),
            ).resolve(state, target).await;
        }
        Err(tonic::Status::failed_precondition("no network fallback"))
    }
}
pub(super) struct Handler {
    pub(super) child: Option<String>,
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
        if r.amount == 11 && std::env::var_os("TRANSACTION_SUCCESSOR_PROOF").is_some() {
            let started = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_secs();
            event(&format!("transaction-successor-enter:{started}"));
        }
        state.value += r.amount;
        if let Some(child) = &self.child {
            let client = generated::AtomicLedgerMethodsClient::new(LocalOnly(child.clone()));
            let target = generated::AtomicLedgerMethodsTarget::new(child);
            let child_result = client
                .apply(
                    context,
                    &target,
                    proto::Step {
                        amount: r.amount.abs(),
                    },
                )
                .await;
            if child_result.is_err() && std::env::var_os("REMOTE_CHILD_CATCH_ERROR").is_some() {
                event("transaction-child-caught-error");
            } else {
                child_result?;
            }
            event("transaction-child-staged");
        }
        if r.amount < 0 {
            return Err(tonic::Status::invalid_argument("transaction rollback"));
        }
        let mut execution = TransactionExecution::new(proto::Value { value: state.value });
        if std::env::var_os("TRANSACTION_SUCCESSOR_PROOF").is_some() {
            if r.amount != 11 && (self.child.is_some() || r.amount == 42042) {
                // Keep successors in the participant's actor scope. The future
                // root task runs the same registered exclusive root-star path.
                let mut task = generated::AtomicLedgerMethodsTasks::apply(
                    &context.headers().state_ref,
                    &proto::Step { amount: 11 },
                );
                let seconds: i64 = std::env::var("TRANSACTION_SUCCESSOR_AT").unwrap().parse().unwrap();
                task.timestamp = Some(prost_types::Timestamp { seconds, nanos: 0 });
                execution.task_upserts.push(task);
            }
        } else if self.child.is_some() || r.amount == 42042 {
            let task_actor = if self.child.is_some() { context.headers().state_ref.clone() } else { reboot::state_ref::StateRef::from_id(TYPE,"leaf").unwrap().to_string() };
            let mut task = generated::AtomicLedgerMethodsTasks::query(
                &task_actor,
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
    async fn fail(&self, context: &TransactionContext, state: &mut proto::AtomicLedger, r: proto::Step) -> Result<TransactionExecution<proto::Value>,tonic::Status> {
        event("transaction-declared");
        state.value += r.amount;
        let child = self.child.as_ref().ok_or_else(||tonic::Status::failed_precondition("Fail requires root"))?;
        generated::AtomicLedgerMethodsClient::new(LocalOnly(child.clone())).apply(context, &generated::AtomicLedgerMethodsTarget::new(child), proto::Step { amount: 42042 }).await?;
        event("transaction-declared-child-staged");
        Err(reboot::declared_error_status(tonic::Code::Unknown,"declared transaction rollback", "type.googleapis.com/workflow.v1.BelowThreshold", &proto::BelowThreshold { required:4242, observed:state.value }))
    }
    #[cfg(not(feature = "pure-transactions"))]
    async fn query(
        &self,
        state: &proto::AtomicLedger,
        _: proto::Empty,
    ) -> Result<proto::AtomicLedger, tonic::Status> {
        Ok(*state)
    }
    #[cfg(feature = "pure-transactions")]
    async fn query(&self, _: &TransactionContext, state: &mut proto::AtomicLedger, _: proto::Empty) -> Result<TransactionExecution<proto::AtomicLedger>, tonic::Status> {
        Ok(TransactionExecution::new(*state))
    }
}
pub(super) struct Initialize;
#[tonic::async_trait]
impl generated::AtomicLedgerInitMethodsDatabaseHandler for Initialize {
    #[cfg(feature = "pure-transactions")]
    async fn probe(&self, state: &proto::AtomicLedger, _: proto::Empty) -> Result<proto::AtomicLedger, tonic::Status> { Ok(*state) }
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
    if std::env::var_os("REMOTE_TRANSACTION_PLANNER").is_some() {
        return crate::remote_transaction::serve().await;
    }
    let endpoint = arg(2);
    let address: std::net::SocketAddr = arg(3).parse()?;
    let shutdown = arg(4);
    let store = DatabaseActorStore::connect(&endpoint).await?;
    let leaf_id = if std::env::var("PURE_TRANSACTION_ACTOR").as_deref() == Ok("leaf") { "atomic" } else { "leaf" };
    let leaf_ref = reboot::state_ref::StateRef::from_id(TYPE, leaf_id)?.to_string();
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
        resolver.clone(),
    );
    let watch = Arc::new(TonicCoordinatorWatchEndpoint::lazy(format!(
        "http://{address}"
    ))?);
    let make = |i: usize| {
        generated::AtomicLedgerMethodsTransactionAdapter::new(
            #[cfg(not(feature = "pure-transactions"))]
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
    };
    let make = |i| {
        let adapter = make(i);
        if std::env::var_os("PURE_TRANSACTION_BOOTSTRAP").is_some() { adapter } else { adapter.with_sequential_root_star() }
    };
    #[cfg(feature = "pure-transactions")]
    {
        let channel = tonic::transport::Endpoint::from_shared(format!("http://{address}"))?.connect_lazy();
        let caller = reboot::CallerId::new("a0000000001", None)?;
        let wrong_store = DatabaseActorStore::connect_lazy("http://127.0.0.1:1")?;
        match make(0).with_canonical_transaction_tasks(wrong_store, channel.clone(), caller.clone(), None) {
            Err(status) => assert_eq!(status.code(), tonic::Code::FailedPrecondition),
            Ok(_) => panic!("pure owner accepted a foreign store"),
        }
        let wrong_coordinator = DurableRootCoordinator::new(
            Arc::new(TonicCoordinatorSidecar::connect(endpoint.replacen("127.0.0.1", "localhost", 1)).await?), resolver.clone());
        let wrong = generated::AtomicLedgerMethodsTransactionAdapter::new(participants[0].clone(), wrong_coordinator, Starts, Handler { child: None });
        match wrong.with_canonical_transaction_tasks(store.clone(), channel.clone(), caller.clone(), None) {
            Err(status) => assert_eq!(status.code(), tonic::Code::FailedPrecondition),
            Ok(_) => panic!("pure owner accepted a foreign coordinator endpoint"),
        }
        let unbound = DurableActorParticipant::new(sidecar.clone(), TYPE, actor().state_ref().as_str());
        let wrong = generated::AtomicLedgerMethodsTransactionAdapter::new(unbound, coordinator.clone(), Starts, Handler { child: None });
        match wrong.with_canonical_transaction_tasks(store.clone(), channel, caller, None) {
            Err(status) => assert_eq!(status.code(), tonic::Code::FailedPrecondition),
            Ok(_) => panic!("pure owner silently rebound an unbound participant"),
        }
        event("pure-owner-validation");
    }
    let root = make(0).with_explicit_abort_owner(reboot::explicit_abort::ExplicitAbortOwner::new(4)?);
    let (root,tasks) = if std::env::var_os("DIRECT_TRANSACTION_TASKS").is_some() {
        root.with_canonical_transaction_tasks(
            #[cfg(feature = "pure-transactions")]
            store.clone(),            tonic::transport::Endpoint::from_shared(std::env::var("TRANSACTION_TASK_ENDPOINT").unwrap_or_else(|_|format!("http://{address}")))?.connect_lazy(),
            reboot::CallerId::new("a0000000001",None)?,None)?
    } else {
        #[cfg(not(feature = "pure-transactions"))]
        { root.with_one_shot_reader_tasks(actor().state_ref().as_str())? }
        #[cfg(feature = "pure-transactions")]
        { return Err("pure fixture requires DIRECT_TRANSACTION_TASKS".into()); }
    };
    let wait = reboot::one_shot_tasks::ReaderTaskWaitService::new(
        [tasks.clone()], reboot::legacy_placement::LegacyApplicationId::new(crate::application())?, "server", crate::plan(address.port()))?
        .with_wait_policy(AuthorizationPolicy::new(None,Some(Arc::new(Policy))))
        .with_admin_authorization(Arc::new(crate::TaskAdminVerifier),Arc::new(Policy));
    let leaf =
        make(1).with_live_participant_owner(reboot::live_participant::LiveParticipantOwner::new(
            4,
            participants[0].actor_target(),
            watch.clone(),
        )?);
    #[cfg(not(feature = "pure-transactions"))]
    let (leaf, leaf_tasks) = if std::env::var_os("TRANSACTION_SUCCESSOR_PROOF").is_some() {
        leaf.with_canonical_transaction_tasks(
            tonic::transport::Endpoint::from_shared(format!("http://{address}"))?.connect_lazy(),
            reboot::CallerId::new("a0000000001", None)?,
            None,
        )?
    } else {
        leaf.with_one_shot_reader_tasks(&leaf_ref)?
    };
    #[cfg(feature = "pure-transactions")]
    let (leaf, leaf_tasks) = leaf.with_canonical_transaction_tasks(store.clone(), tonic::transport::Endpoint::from_shared(format!("http://{address}"))?.connect_lazy(), reboot::CallerId::new("a0000000001",None)?, None)?;
    tasks.set_max_live_deliveries(512)?;
    leaf_tasks.set_max_live_deliveries(512)?;
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
        .with_host_recovery(reboot::one_shot_tasks::MultiOwnerTaskRecovery::new([tasks.clone(),leaf_tasks],reboot::database_proto::RecoverRequest {
            shard_ids:vec!["s000000000".into()],state_tags_by_state_type:[(TYPE.into(),"AtomicLedger".into())].into(),skip_idempotent_mutations:true,
        })?)
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
        .add_public_service(reboot::database_proto::tasks_server::TasksServer::new(wait))
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
) -> Result<proto::Value, Box<tonic::Status>> {
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
