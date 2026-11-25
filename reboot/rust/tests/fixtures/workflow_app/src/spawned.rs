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
    let delay = std::env::var("SPAWN_AFTER_MILLIS")
        .ok()
        .map(|value| std::time::Duration::from_millis(value.parse().unwrap()));
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
        let (a, b) = if let Some(delay) = delay {
            tokio::join!(
                reference.child_spawn_after(context, "child", request, delay),
                reference.child_spawn_after(context, "child", request, delay)
            )
        } else {
            tokio::join!(
                reference.child_spawn(context, "child", request, timestamp),
                reference.child_spawn(context, "child", request, timestamp)
            )
        };
        let a = a?;
        assert_eq!(a, b?);
        a
    } else if let Some(delay) = delay {
        reference
            .child_task_after(context, "child", request, delay)
            .await?
            .task_id()
            .clone()
    } else {
        reference
            .child_task(context, "child", request, timestamp)
            .await?
            .task_id()
            .clone()
    };
    event(&format!(
        "spawn-ack:{}",
        uuid::Uuid::from_slice(&id.task_uuid).unwrap()
    ));
    let again = if let Some(delay) = delay {
        reference
            .child_spawn_after(context, "child", request, delay)
            .await?
    } else {
        reference
            .child_spawn(context, "child", request, timestamp)
            .await?
    };
    assert_eq!(id, again);
    if let Ok(path) = std::env::var("SPAWN_BEFORE_WAIT") {
        std::fs::write(&path, b"both spawn acknowledgements observed").unwrap();
        while !std::path::Path::new(&format!("{path}.release")).exists() {
            tokio::time::sleep(std::time::Duration::from_millis(5)).await;
        }
    }
    let task = reference.child_retrieve(id)?;
    let value = match task.clone().wait(context).await {
        Ok(value) => value.value,
        Err(generated::LedgerMethodsChildError::BelowThreshold(error)) => {
            event("child-error-caught");
            error.observed
        }
        Err(generated::LedgerMethodsChildError::Grpc(error)) => {
            let terminal = prost_types::Any {
                type_url: "type.googleapis.com/google.rpc.Status".into(),
                value: error.details().to_vec(),
            };
            if std::env::var_os("SPAWN_CATCH_CANCEL").is_some()
                && reboot::one_shot_tasks::task_cancellation_status(&terminal)
                    .ok()
                    .flatten()
                    .is_some()
            {
                event("child-cancellation-caught");
                if let Ok(path) = std::env::var("SPAWN_AFTER_CANCEL_CATCH") {
                    std::fs::write(
                        &path,
                        b"validated durable cancellation acknowledged; no continuation yet",
                    )
                    .unwrap();
                    while !std::path::Path::new(&format!("{path}.release")).exists() {
                        tokio::time::sleep(std::time::Duration::from_millis(5)).await;
                    }
                }
                -999
            } else {
                return Err(error.into());
            }
        }
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
        relative_delay: None,
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
        "relative-legacy" | "relative-negative" | "relative-nanos" | "relative-overflow" => {
            body.timestamp = None;
            body.relative_delay = Some(prost_types::Duration {
                seconds: if arg(3) == "relative-negative" {
                    -1
                } else if arg(3) == "relative-overflow" {
                    315_576_000_000
                } else {
                    1
                },
                nanos: if arg(3) == "relative-nanos" {
                    1_000_000_000
                } else {
                    0
                },
            });
        }
        "relative-both" => {
            body.relative_delay = Some(prost_types::Duration {
                seconds: 1,
                nanos: 0,
            })
        }
        "relative-missing" => body.timestamp = None,
        other => panic!("unknown probe {other}"),
    }
    let mut request = tonic::Request::new(body);
    let mut headers = reboot::RebootHeaders::new(reference());
    headers.idempotency_key = Some(uuid::Uuid::parse_str(&arg(4))?);
    headers.caller_id = Some(reboot::CallerId::new("a0000000001", None)?);
    headers.bearer_token = Some("spawn-service".into());
    *request.metadata_mut() = headers.to_metadata()?;
    let mut client =
        reboot::workflow_spawn_proto::workflow_spawner_client::WorkflowSpawnerClient::connect(arg(
            2,
        ))
        .await?;
    let id = if arg(3).starts_with("relative-") && arg(3) != "relative-legacy" {
        client.spawn_after(request).await?
    } else {
        client.spawn(request).await?
    }
    .into_inner();
    println!("{}", uuid::Uuid::from_slice(&id.task_uuid)?);
    Ok(())
}
