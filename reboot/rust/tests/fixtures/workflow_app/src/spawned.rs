use super::*;
fn target() -> reboot::actor_ref::ActorRef {
    reboot::actor_ref::ActorRef::from_id(
        "workflow.v1.Ledger",
        &std::env::var("SPAWN_TARGET_ID").unwrap_or_else(|_| "child".into()),
    )
    .unwrap()
}
// Required generated workflow callback ABI carries rich Status by value.
#[allow(clippy::result_large_err)]
pub async fn run(
    context: &WorkflowContext<'_>,
    request: proto::Step,
) -> Result<proto::Result, reboot::one_shot_tasks::WorkflowBodyError> {
    let channel = tonic::transport::Endpoint::from_shared(std::env::var("SPAWN_ENDPOINT").unwrap())
        .unwrap()
        .connect_lazy();
    let reference = generated::LedgerMethodsWorkflowRef::new(
        channel,
        target(),
        reboot::CallerId::new("a0000000001", None).unwrap(),
        Some("spawn-service".into()),
    )?;
    let amount = std::env::var("SPAWN_AMOUNT")
        .map(|v| v.parse().unwrap())
        .unwrap_or(request.amount);
    let timestamp = std::env::var("SPAWN_AT")
        .ok()
        .map(|v| prost_types::Timestamp {
            seconds: v.parse().unwrap(),
            nanos: 0,
        });
    let request = proto::Step { amount };
    if std::env::var("SPAWN_COMPOSED").as_deref() == Ok("1") {
        let value =
            reference
                .child(context, "child", request)
                .await
                .map_err(|error| match error {
                    generated::LedgerMethodsChildError::Grpc(status) => status,
                    generated::LedgerMethodsChildError::BelowThreshold(_) => {
                        tonic::Status::internal("unexpected composed fixture error")
                    }
                })?;
        let continuation = generated::LedgerMethodsWorkflowSteps::second(
            context,
            Arc::new(Ledger::default()),
            "spawn-continuation",
            proto::Step { amount: 1 },
        )
        .await?;
        event("spawn-returned");
        return Ok(proto::Result {
            first: value.value,
            second: continuation.value,
        });
    }
    let id = if std::env::var("SPAWN_CONCURRENT").as_deref() == Ok("1") {
        let (a, b) = tokio::join!(
            reference.child_spawn(context, "child", request, timestamp),
            reference.child_spawn(context, "child", request, timestamp)
        );
        let a = a?;
        assert_eq!(a, b?);
        a
    } else {
        reference
            .child_spawn(context, "child", request, timestamp)
            .await?
    };
    event(&format!(
        "spawn-ack:{}",
        uuid::Uuid::from_slice(&id.task_uuid).unwrap()
    ));
    let again = reference
        .child_spawn(context, "child", request, timestamp)
        .await?;
    assert_eq!(id, again);
    if let Ok(path) = std::env::var("SPAWN_BEFORE_WAIT") {
        std::fs::write(&path, b"both spawn acknowledgements observed").unwrap();
        while !std::path::Path::new(&format!("{path}.release")).exists() {
            tokio::time::sleep(std::time::Duration::from_millis(5)).await;
        }
    }
    let value = match reference.child_wait(context, id).await {
        Ok(value) => value.value,
        Err(generated::LedgerMethodsChildError::BelowThreshold(error)) => {
            event("child-error-caught");
            error.observed
        }
        Err(generated::LedgerMethodsChildError::Grpc(error)) => return Err(error.into()),
    };
    let continuation = generated::LedgerMethodsWorkflowSteps::second(
        context,
        Arc::new(Ledger::default()),
        "spawn-continuation",
        proto::Step { amount: 1 },
    )
    .await?;
    event("spawn-returned");
    Ok(proto::Result {
        first: value,
        second: continuation.value,
    })
}
pub async fn inspect() -> Result<(), Box<dyn std::error::Error>> {
    let mut database = db::database_client::DatabaseClient::connect(arg(2)).await?;
    let state_ref = reference();
    let loaded = database
        .load(db::LoadRequest {
            actors: vec![db::Actor {
                state_type: "workflow.v1.Ledger".into(),
                state_ref: state_ref.clone(),
                state: None,
            }],
            task_ids: vec![],
        })
        .await?
        .into_inner();
    let state = proto::Ledger::decode(loaded.actors[0].state.as_deref().ok_or("missing state")?)?;
    let mut records = database
        .recover_idempotent_mutations(db::RecoverIdempotentMutationsRequest {
            state_type: "workflow.v1.Ledger".into(),
            state_ref,
            idempotency_key: None,
            workflow_id: None,
            workflow_iteration: None,
        })
        .await?
        .into_inner();
    let mut receipts = Vec::new();
    let mut ids = Vec::new();
    while let Some(batch) = records.message().await? {
        for record in batch.idempotent_mutations {
            ids.extend(record.task_ids.clone());
            receipts.push(format!(
                "\"{}\"",
                record
                    .encode_to_vec()
                    .iter()
                    .map(|b| format!("{b:02x}"))
                    .collect::<String>()
            ));
        }
    }
    let tasks = database
        .load(db::LoadRequest {
            actors: vec![],
            task_ids: ids,
        })
        .await?
        .into_inner()
        .tasks;
    let tasks = tasks
        .iter()
        .map(|task| {
            format!(
                "{{\"id\":\"{}\",\"status\":{},\"wire\":\"{}\"}}",
                uuid::Uuid::from_slice(&task.task_id.as_ref().unwrap().task_uuid).unwrap(),
                task.status,
                task.encode_to_vec()
                    .iter()
                    .map(|b| format!("{b:02x}"))
                    .collect::<String>()
            )
        })
        .collect::<Vec<_>>();
    println!(
        "{{\"first\":{},\"second\":{},\"receipts\":[{}],\"tasks\":[{}]}}",
        state.first,
        state.second,
        receipts.join(","),
        tasks.join(",")
    );
    Ok(())
}

pub async fn probe() -> Result<(), Box<dyn std::error::Error>> {
    let mut body = reboot::workflow_spawn_proto::SpawnRequest {
        method: "workflow.v1.LedgerMethods.Child".into(),
        request: proto::Step { amount: 7 }.encode_to_vec(),
        timestamp: Some(prost_types::Timestamp {
            seconds: 253_402_300_799,
            nanos: 0,
        }),
        response_type: "type.googleapis.com/workflow.v1.Value".into(),
        errors: vec!["type.googleapis.com/workflow.v1.BelowThreshold".into()],
    };
    match arg(3).as_str() {
        "valid" => {}
        "changed-payload" => body.request = proto::Step { amount: 8 }.encode_to_vec(),
        "changed-schedule" => body.timestamp.as_mut().unwrap().seconds -= 1,
        "wrong-schema" => body.response_type = "type.googleapis.com/workflow.v1.Result".into(),
        "constructor" => body.method = "workflow.v1.LedgerMethods.Create".into(),
        "writer" => body.method = "workflow.v1.LedgerMethods.First".into(),
        "bad-request" => body.request = vec![0xff],
        "bad-schedule" => body.timestamp.as_mut().unwrap().nanos = -1,
        other => panic!("unknown probe {other}"),
    }
    let mut request = tonic::Request::new(body);
    let mut headers = reboot::RebootHeaders::new(reference());
    headers.idempotency_key = Some(uuid::Uuid::parse_str(&arg(4))?);
    headers.caller_id = Some(reboot::CallerId::new("a0000000001", None)?);
    headers.bearer_token = Some("spawn-service".into());
    *request.metadata_mut() = headers.to_metadata()?;
    let id = reboot::workflow_spawn_proto::workflow_spawner_client::WorkflowSpawnerClient::connect(
        arg(2),
    )
    .await?
    .spawn(request)
    .await?
    .into_inner();
    println!("{}", uuid::Uuid::from_slice(&id.task_uuid)?);
    Ok(())
}
