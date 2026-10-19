use super::*;
#[derive(Clone)]
pub struct Remote;
#[tonic::async_trait]
impl generated::RemoteMethodsDatabaseHandler for Remote {
    async fn create(
        &self,
        _: &mut proto::Remote,
        _: proto::Empty,
    ) -> Result<proto::Empty, tonic::Status> {
        Ok(proto::Empty {})
    }
    async fn apply(
        &self,
        state: &mut proto::Remote,
        request: proto::Step,
    ) -> Result<proto::Value, tonic::Status> {
        event("remote-handler");
        if request.amount < 0 {
            return Err(tonic::Status::invalid_argument("negative remote amount"));
        }
        if request.amount == 999 {
            event("remote-parked");
            std::future::pending::<()>().await;
        }
        state.value += request.amount;
        Ok(proto::Value { value: state.value })
    }
    async fn query(
        &self,
        state: &proto::Remote,
        _: proto::Empty,
    ) -> Result<proto::Remote, tonic::Status> {
        Ok(*state)
    }
}
pub struct Policy;
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
                event("remote-authorize");
                if context.headers.application_id.as_deref() != Some("a0000000001")
                    || context
                        .headers
                        .caller_id
                        .as_ref()
                        .map(|c| c.application_id())
                        != Some("a0000000001")
                    || context.headers.bearer_token.as_deref()
                        != Some("outbound-service-credential")
                    || context.headers.state_ref != actor().state_ref().as_str()
                {
                    return reboot::auth::AuthorizationDecision::PermissionDenied {
                        message: "outbound metadata denied".into(),
                    };
                }
            }
            reboot::auth::AuthorizationDecision::Allow
        })
    }
}
pub fn actor() -> reboot::actor_ref::ActorRef {
    reboot::actor_ref::ActorRef::from_id(
        "workflow.v1.Remote",
        &std::env::var("OUTBOUND_TARGET_ID").unwrap_or_else(|_| "target".into()),
    )
    .unwrap()
}
// WorkflowBodyError preserves the SDK's rich Status ABI.
#[allow(clippy::result_large_err)]
pub async fn run(
    context: &WorkflowContext<'_>,
    request: proto::Step,
) -> Result<proto::Result, reboot::one_shot_tasks::WorkflowBodyError> {
    let endpoint =
        tonic::transport::Endpoint::from_shared(std::env::var("OUTBOUND_ENDPOINT").unwrap())
            .unwrap();
    let target = generated::RemoteMethodsWorkflowWriterRef::new(
        endpoint.connect_lazy(),
        actor(),
        reboot::CallerId::new("a0000000001", None).unwrap(),
        Some(
            std::env::var("OUTBOUND_BEARER")
                .unwrap_or_else(|_| "outbound-service-credential".into()),
        ),
    )?;
    let amount = std::env::var("OUTBOUND_AMOUNT")
        .ok()
        .map(|s| s.parse().unwrap())
        .unwrap_or(request.amount);
    let result = target
        .apply(context, "target-apply", proto::Step { amount })
        .await?;
    event("outbound-returned");
    if std::env::var("OUTBOUND_RETRY_LOCAL").as_deref() == Ok("1") {
        static RETRIES: std::sync::atomic::AtomicUsize = std::sync::atomic::AtomicUsize::new(0);
        if RETRIES.fetch_add(1, std::sync::atomic::Ordering::SeqCst) == 0 {
            return Err(reboot::one_shot_tasks::WorkflowBodyError::RetryLocal(
                "retry after acknowledged writer".into(),
            ));
        }
    }
    Ok(proto::Result {
        first: result.value,
        second: 0,
    })
}
// Tonic's interceptor contract requires returning its rich Status by value.
#[allow(clippy::result_large_err)]
pub fn wire(request: tonic::Request<()>) -> Result<tonic::Request<()>, tonic::Status> {
    let headers = reboot::RebootHeaders::from_request(&request)
        .map_err(|e| tonic::Status::invalid_argument(e.to_string()))?;
    if let Some(id) = headers.workflow_id {
        event(&format!(
            "remote-wire:{}:{}:{}",
            id,
            headers.idempotency_key.unwrap(),
            headers.state_ref
        ));
        assert!(
            !headers.internal_call
                && headers.transaction_ids.is_none()
                && headers.task_schedule.is_none()
        );
    }
    Ok(request)
}
pub async fn command(
    mode: &str,
    channel: tonic::transport::Channel,
) -> Result<(), Box<dyn std::error::Error>> {
    if mode == "remote-inspect" {
        let mut database = db::database_client::DatabaseClient::new(channel);
        let actor = actor();
        let loaded = database
            .load(db::LoadRequest {
                actors: vec![db::Actor {
                    state_type: actor.state_type().into(),
                    state_ref: actor.state_ref().as_str().into(),
                    state: None,
                }],
                task_ids: vec![],
            })
            .await?
            .into_inner();
        let state = proto::Remote::decode(
            loaded
                .actors
                .first()
                .ok_or("missing target")?
                .state
                .as_deref()
                .ok_or("missing target state")?,
        )?;
        let mut stream = database
            .recover_idempotent_mutations(db::RecoverIdempotentMutationsRequest {
                state_type: actor.state_type().into(),
                state_ref: actor.state_ref().as_str().into(),
                idempotency_key: None,
                workflow_id: None,
                workflow_iteration: None,
            })
            .await?
            .into_inner();
        let mut rows = Vec::new();
        while let Some(batch) = stream.message().await? {
            for record in batch.idempotent_mutations {
                assert!(record.request_fingerprint.is_some());
                rows.push(
                    record
                        .encode_to_vec()
                        .iter()
                        .map(|b| format!("{b:02x}"))
                        .collect::<String>(),
                );
            }
        }
        rows.sort();
        // Hex records are read from actual native receipts, not synthetic data.
        println!(
            "{{\"value\":{},\"records\":[{}]}}",
            state.value,
            rows.iter()
                .map(|s| format!("\"{s}\""))
                .collect::<Vec<_>>()
                .join(",")
        );
        return Ok(());
    }
    let mut client = proto::remote_methods_client::RemoteMethodsClient::new(channel);
    let ctx = reboot::ExternalContext::new(actor().state_ref().as_str());
    if mode == "remote-apply" {
        let mut headers = reboot::RebootHeaders::new(actor().state_ref().as_str());
        headers.caller_id = Some(reboot::CallerId::new("a0000000001", None)?);
        headers.application_id = Some("a0000000001".into());
        headers.bearer_token = Some("outbound-service-credential".into());
        headers.idempotency_key = Some(uuid::Uuid::parse_str(&arg(3))?);
        let mut request = tonic::Request::new(proto::Step {
            amount: arg(4).parse()?,
        });
        *request.metadata_mut() = headers.to_metadata()?;
        println!("{}", client.apply(request).await?.into_inner().value);
    } else if mode == "remote-create" {
        client
            .create(ctx.writer_with_key(proto::Empty {}, uuid::Uuid::parse_str(&arg(3))?)?)
            .await?;
    } else {
        println!(
            "{}",
            client
                .query(ctx.reader(proto::Empty {})?)
                .await?
                .into_inner()
                .value
        );
    }
    Ok(())
}
