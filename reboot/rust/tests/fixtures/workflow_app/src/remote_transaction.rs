//! Two application processes, each owning exactly one native Database actor.
use crate::{
    arg, generated, proto,
    transaction::{Handler, Initialize, Policy, Starts},
};
use reboot::{
    application_host::{ApplicationHost, LegacyRecoveryMetadata, PlacementPlannerRecovery},
    auth::AuthorizationPolicy,
    durable_coordinator::{
        CoordinatorRecovery, DurableRootCoordinator, ParticipantTarget, TonicCoordinatorSidecar,
    },
    durable_participant::{DurableActorParticipant, ParticipantRecovery, TonicParticipantSidecar},
    legacy_coordinator::LegacyApplicationCoordinatorWatchEndpoint,
    legacy_placement::{
        LegacyApplicationId, LegacyApplicationParticipantResolver, PlanOnlyLegacyPlacement,
    },
    runtime::DatabaseActorStore,
};
use std::sync::{Arc, OnceLock};
const TYPE: &str = "workflow.v1.AtomicLedger";
pub fn placement() -> PlanOnlyLegacyPlacement {
    static PLACEMENT: OnceLock<PlanOnlyLegacyPlacement> = OnceLock::new();
    PLACEMENT.get_or_init(PlanOnlyLegacyPlacement::new).clone()
}
pub async fn serve() -> Result<(), Box<dyn std::error::Error>> {
    let endpoint = arg(2);
    let address: std::net::SocketAddr = arg(3).parse()?;
    let shutdown = arg(4);
    let root = reboot::state_ref::StateRef::from_id(TYPE, "atomic")?.to_string();
    let leaf = reboot::state_ref::StateRef::from_id(TYPE, "leaf")?.to_string();
    let is_leaf = std::env::var("PURE_TRANSACTION_ACTOR").as_deref() == Ok("leaf");
    let reference = if is_leaf { &leaf } else { &root };
    let store = DatabaseActorStore::connect(&endpoint).await?;
    let participant = DurableActorParticipant::new(
        Arc::new(TonicParticipantSidecar::connect(&endpoint).await?),
        TYPE,
        reference,
    )
    .with_database_actor_gate(&store);
    let plan = placement();
    let application = LegacyApplicationId::new("workflow-app")?;
    let coordinator = DurableRootCoordinator::new(
        Arc::new(TonicCoordinatorSidecar::connect(&endpoint).await?),
        Arc::new(LegacyApplicationParticipantResolver::new(
            application.clone(),
            plan.clone(),
        )),
    );
    let watch = Arc::new(LegacyApplicationCoordinatorWatchEndpoint::new(
        application.clone(),
        plan.clone(),
        root.clone(),
    )?);
    let adapter = generated::AtomicLedgerMethodsTransactionAdapter::new(
        #[cfg(not(feature = "pure-transactions"))]
        store.clone(),
        participant,
        coordinator,
        Starts,
        Handler {
            child: (!is_leaf).then_some(leaf.clone()),
        },
    )
    .with_authorization(AuthorizationPolicy::new(None, Some(Arc::new(Policy))));
    let adapter = if std::env::var_os("PURE_TRANSACTION_BOOTSTRAP").is_some() {
        adapter.with_external_constructors()
    } else {
        adapter.with_sequential_root_star()
    };
    let adapter = adapter
        .with_explicit_abort_owner(reboot::explicit_abort::ExplicitAbortOwner::new(4)?)
        .with_live_participant_owner(reboot::live_participant::LiveParticipantOwner::new(
            4,
            ParticipantTarget {
                state_type: TYPE.into(),
                state_ref: root.clone(),
            },
            watch.clone(),
        )?);
    let (adapter, tasks) = adapter.with_canonical_transaction_tasks(
        #[cfg(feature = "pure-transactions")]
        store.clone(),
        tonic::transport::Endpoint::from_shared(
            std::env::var("TRANSACTION_TASK_ENDPOINT")
                .unwrap_or_else(|_| format!("http://{address}")),
        )?
        .connect_lazy(),
        reboot::CallerId::new("a0000000001", None)?,
        None,
    )?;
    let wait = reboot::one_shot_tasks::ReaderTaskWaitService::new(
        [tasks.clone()],
        application,
        std::env::var("REMOTE_TRANSACTION_SERVER")?,
        plan.clone(),
    )?
    .with_wait_policy(AuthorizationPolicy::new(None, Some(Arc::new(Policy))))
    .with_admin_authorization(Arc::new(crate::TaskAdminVerifier), Arc::new(Policy));
    let mut host = ApplicationHost::new("workflow-app")
        .with_legacy_placement_readiness(plan.clone())
        .with_host_recovery(PlacementPlannerRecovery::new(
            std::env::var("REMOTE_TRANSACTION_PLANNER")?,
            plan,
        )?);
    let (adapter, _) = host.register_local_transaction_service(adapter)?;
    let recovery = adapter.legacy_recovery_registration(
        LegacyRecoveryMetadata {
            participant: ParticipantRecovery {
                shard_ids: vec!["s000000000".into()],
                ..Default::default()
            },
            coordinator: CoordinatorRecovery {
                shard_ids: vec!["s000000000".into()],
                coordinator_state_ref: reference.clone(),
                ..Default::default()
            },
        },
        watch,
    )?;
    host.with_host_recovery(recovery)
        .with_host_recovery(adapter.explicit_abort_recovery_registration()?)
        .with_host_recovery(adapter.live_participant_recovery_registration()?)
        .with_host_recovery(tasks.recovery(reboot::database_proto::RecoverRequest {
            shard_ids: vec!["s000000000".into()],
            state_tags_by_state_type: [(TYPE.into(), "AtomicLedger".into())].into(),
            skip_idempotent_mutations: true,
        }))
        .add_legacy_control_service(adapter.legacy_participant_control_service())
        .add_legacy_control_service(adapter.legacy_coordinator_control_service(TYPE, reference)?)
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
