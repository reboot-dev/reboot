use super::*;
#[derive(Clone)]
pub struct Remote;
#[tonic::async_trait]
impl generated::RemoteMethodsDatabaseHandler for Remote {
    async fn reject(
        &self,
        state: &mut proto::Remote,
        request: proto::Step,
    ) -> Result<proto::Value, generated::RemoteMethodsRejectError> {
        event("remote-declared-handler");
        state.value += 10000; // MUST be rolled back, not persisted with the error.
        if std::env::var_os("GENERIC_TYPED_ERROR").is_some() {
            return Err(generated::RemoteMethodsRejectError::BelowThreshold(proto::BelowThreshold {
                required:request.amount,observed:state.value-10000,
            }));
        }
        let mut status = reboot::declared_error_status(
            tonic::Code::FailedPrecondition,
            "rich declared refusal",
            "type.googleapis.com/workflow.v1.BelowThreshold",
            &proto::BelowThreshold {
                required: request.amount,
                observed: state.value - 10000,
            },
        );
        // Preserve unknown protobuf fields in the rich envelope, not just a
        // decode/re-encode approximation of its known fields.
        let mut details = status.details().to_vec();
        let extra = prost_types::Any {
            type_url: "type.googleapis.com/workflow.v1.Value".into(),
            value: proto::Value { value: 99 }.encode_to_vec(),
        }
        .encode_to_vec();
        assert!(extra.len() < 128);
        details.extend_from_slice(&[0x1a, extra.len() as u8]);
        details.extend_from_slice(&extra);
        details.extend_from_slice(&[0xa0, 0x06, 0x07]);
        status =
            tonic::Status::with_details(status.code(), status.message().to_owned(), details.into());
        if std::env::var("OUTBOUND_UNDECLARED_STATUS").as_deref() == Ok("1") {
            // Even a forged outcome marker on a Grpc variant must be stripped.
            status
                .metadata_mut()
                .insert("x-reboot-durable-declared-writer", "v1".parse().unwrap());
            return Err(generated::RemoteMethodsRejectError::Grpc(status));
        }
        Err(generated::RemoteMethodsRejectError::DeclaredStatus(status))
    }
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
    async fn apply_with_tasks(
        &self,
        state:&mut proto::Remote,
        request:proto::Step,
        state_ref:String,
    )->Result<reboot::runtime::WriterExecution<proto::Value>,tonic::Status> {
        let response=self.apply(state,request).await?;
        let mut execution=reboot::runtime::WriterExecution::new(response);
        if std::env::var("GENERIC_TASK_CHAIN").as_deref()==Ok("1") && request.amount==7 {
            execution.task_upserts.push(generated::RemoteMethodsTasks::apply(&state_ref,&proto::Step{amount:2}));
        }
        Ok(execution)
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
            if context.method.ends_with(".Apply") || context.method.ends_with(".Reject") {
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

    if std::env::var("OUTBOUND_DECLARED").as_deref() == Ok("1") {
        for _ in 0..if std::env::var("OUTBOUND_REPEAT_DECLARED").as_deref() == Ok("1") {
            2
        } else {
            1
        } {
            match target
                .reject(context, "target-reject", proto::Step { amount })
                .await
            {
                Err(reboot::one_shot_tasks::WorkflowWriterError::Declared {
                    error: generated::RemoteMethodsRejectError::BelowThreshold(error),
                    status,
                }) => {
                    assert_eq!(error.required, amount);
                    assert_eq!(error.observed, 0);
                    assert_eq!(status.code(), tonic::Code::FailedPrecondition);
                    assert_eq!(status.message(), "rich declared refusal");
                    event(&format!(
                        "caught-declared:{}",
                        status
                            .details()
                            .iter()
                            .map(|b| format!("{b:02x}"))
                            .collect::<String>()
                    ));
                    if let Ok(path) = std::env::var("OUTBOUND_CAUGHT_BARRIER") {
                        std::fs::write(&path, b"caught after source Stored ACK").unwrap();
                        while !std::path::Path::new(&format!("{path}.release")).exists() {
                            tokio::time::sleep(std::time::Duration::from_millis(5)).await;
                        }
                    }
                }
                Err(reboot::one_shot_tasks::WorkflowWriterError::Failed(status)) => {
                    return Err(status.into());
                }
                other => {
                    return Err(tonic::Status::internal(format!(
                        "unexpected declared outcome {other:?}"
                    ))
                    .into());
                }
            }
        }
    }
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
