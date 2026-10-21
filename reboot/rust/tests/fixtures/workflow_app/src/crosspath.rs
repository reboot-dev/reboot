//! Regression: taskless Store uncertainty must fence a fresh workflow adapter.
use super::*;
use proto::ledger_methods_server::LedgerMethods;
use reboot::runtime::{StateAdmission, WriterExecution};

pub async fn run() -> Result<(), Box<dyn std::error::Error>> {
    let primary = arg(2);
    let secondary = arg(3);
    let reference = reference();
    let other = format!("{reference}-control");
    let policy = reboot::auth::AuthorizationPolicy::permissive_for_development();
    // No dispatcher exists during the unknown Store ACK. The Store attempt is
    // through the public taskless writer envelope, not a synthetic latch setter.
    {
        for (endpoint, actor) in [
            (&primary, &reference),
            (&primary, &other),
            (&secondary, &reference),
        ] {
            let adapter = generated::LedgerMethodsDatabaseAdapter::new(
                DatabaseActorStore::connect(endpoint).await?,
                Ledger::default(),
            )
            .with_authorization(policy.clone());
            adapter
                .create(
                    reboot::ExternalContext::new(actor)
                        .writer_with_key(proto::Empty {}, uuid::Uuid::new_v4())?,
                )
                .await?;
        }
        let store = DatabaseActorStore::connect(&primary).await?;
        let error = store.scheduling_writer_async_for_method_authorized::<generated::LedgerDurableState, _, _, _>(
            ("workflow.v1.LedgerMethods.First", "type.googleapis.com/workflow.v1.Value", StateAdmission::RequireExisting),
            &policy, None,
            reboot::ExternalContext::new(&reference).writer_with_key(proto::Step { amount: 7 }, uuid::Uuid::new_v4())?,
            |state, request, _| Box::pin(async move {
                event("taskless-handler");
                state.first += request.amount;
                Ok(WriterExecution::new(proto::Value { value: state.first }))
            }),
        ).await.unwrap_err();
        assert_eq!(error.code(), tonic::Code::Unavailable);
        assert!(error.message().contains("injected lost real native ACK"), "{error:?}");
    }
    // All taskless store/adapter/actor-gate handles have now disappeared.
    event("taskless-handles-dropped");
    for (endpoint, actor, rejected) in [
        (&primary, &reference, true),
        (&primary, &other, false),
        (&secondary, &reference, false),
    ] {
        let (adapter, tasks) = generated::LedgerMethodsDatabaseAdapter::new(
            DatabaseActorStore::connect(endpoint).await?,
            Ledger::default(),
        )
        .with_authorization(policy.clone())
        .with_workflows(actor)?;
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await?;
        let address = listener.local_addr()?;
        let (stop, stopped) = tokio::sync::oneshot::channel();
        let host = ApplicationHost::new(application())
            .with_host_recovery(tasks.recovery(db::RecoverRequest {
                state_tags_by_state_type: [("workflow.v1.Ledger".into(), "Ledger".into())].into(),
                shard_ids: vec!["s000000000".into()],
                skip_idempotent_mutations: true,
            }))
            .add_public_service(proto::ledger_methods_server::LedgerMethodsServer::new(
                adapter,
            ));
        let host = tokio::spawn(host.serve_with_listener_shutdown(listener, async {
            let _ = stopped.await;
        }));
        let outcome = async {
            let mut client = proto::ledger_methods_client::LedgerMethodsClient::connect(format!(
                "http://{address}"
            ))
            .await?;
            let context = reboot::ExternalContext::new(actor);
            // Readiness probes are read-only. Never retry the tested mutation.
            tokio::time::timeout(std::time::Duration::from_secs(30), async {
                loop {
                    if client
                        .query(context.reader(proto::Empty {}).unwrap())
                        .await
                        .is_ok()
                    {
                        break;
                    }
                    tokio::time::sleep(std::time::Duration::from_millis(5)).await;
                }
            })
            .await?;
            let result = client
                .first(context.writer_with_key(proto::Step { amount: 1 }, uuid::Uuid::new_v4())?)
                .await;
            if rejected {
                let error = result.unwrap_err();
                assert_eq!(error.code(), tonic::Code::Unavailable);
                assert_eq!(
                    error.message(),
                    "actor commit outcome uncertain; restart host before writing"
                );
                event("workflow-crosspath-rejected");
            } else {
                assert_eq!(result?.into_inner().value, 1);
                event("workflow-crosspath-control");
            }
            Ok::<_, Box<dyn std::error::Error>>(())
        }
        .await;
        let _ = stop.send(());
        host.await??;
        outcome?;
    }
    event("workflow-crosspath-complete");
    Ok(())
}
