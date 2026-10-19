// Read-only native canonical evidence; no fixture Store seeding.
include!("inventory.rs");
include!("binding.rs");
#[derive(Clone, PartialEq, prost::Message)]
struct ResultEnvelope {
    #[prost(uint32, tag = "1")]
    format: u32,
    #[prost(uint32, tag = "2")]
    phase: u32,
    #[prost(message, optional, tag = "3")]
    result: Option<prost_types::Any>,
}
fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}
async fn inspect() -> Result<(), Box<dyn std::error::Error>> {
    let mut client = db::database_client::DatabaseClient::connect(arg(2)).await?;
    let id = db::TaskId {
        state_type: "cursor.v1.A".into(),
        state_ref: reference("cursor.v1.A"),
        task_uuid: uuid::Uuid::parse_str(&arg(3))?.as_bytes().to_vec(),
    };
    let loaded = client
        .load(db::LoadRequest {
            actors: vec![
                db::Actor {
                    state_type: "cursor.v1.A".into(),
                    state_ref: reference("cursor.v1.A"),
                    state: None,
                },
                db::Actor {
                    state_type: "cursor.v1.B".into(),
                    state_ref: reference("cursor.v1.B"),
                    state: None,
                },
            ],
            task_ids: vec![id.clone()],
        })
        .await?
        .into_inner();
    let task = loaded.tasks.first().ok_or("missing canonical task")?;
    let actor = |name: &str| loaded.actors.iter().find(|a| a.state_type == name);
    let a_bytes = actor("cursor.v1.A")
        .ok_or("missing A actor")?
        .state
        .as_deref()
        .ok_or("missing A state")?;
    let a = proto::A::decode(a_bytes)?;
    let b_bytes = actor("cursor.v1.B")
        .ok_or("missing B actor")?
        .state
        .as_deref()
        .ok_or("missing B state")?;
    let b = proto::B::decode(b_bytes)?;
    // The C++ None query reads only root prefixes, NOT iteration checkpoints.
    // The task is parked or terminal for every all-inventory call in this gate.
    let all = arg(4) == "all";
    let read = |scope| {
        let mut client = client.clone();
        let id = id.clone();
        async move {
            let mut stream = client
                .recover_idempotent_mutations(db::RecoverIdempotentMutationsRequest {
                    state_type: id.state_type,
                    state_ref: id.state_ref,
                    idempotency_key: None,
                    workflow_id: Some(id.task_uuid),
                    workflow_iteration: scope,
                })
                .await
                .map_err(|e| e.to_string())?
                .into_inner();
            let mut mutations = vec![];
            while let Some(batch) = stream.message().await.map_err(|e| e.to_string())? {
                for m in batch.idempotent_mutations {
                    if m.workflow_iteration != scope {
                        return Err("inventory returned wrong iteration scope".to_string());
                    }
                    mutations.push(m);
                }
            }
            Ok(mutations)
        }
    };
    let mutations = if all {
        inventory(task.iteration, read).await?
    } else {
        read(Some(arg(4).parse()?)).await?
    };
    let inventory_count = mutations.len();
    let mut records = vec![];
    for m in mutations {
        assert_eq!(m.workflow_id, Some(id.task_uuid.clone()));
        assert!(m.request_fingerprint.is_some());
        let any = prost_types::Any::decode(m.response.as_slice())?;
        let mut phase = 0;
        let mut result_type = String::new();
        let mut reply = "null".to_string();
        if any.type_url == "type.googleapis.com/reboot.rust.workflow.AtMostOnceResultV1" {
            let envelope = ResultEnvelope::decode(any.value.as_slice())?;
            assert_eq!(envelope.format, 1);
            phase = envelope.phase;
            if phase == 1 {
                assert!(envelope.result.is_none());
            } else {
                assert_eq!(phase, 2);
                let result = envelope.result.ok_or("Stored missing result")?;
                result_type = result.type_url.clone();
                reply = match result_type.as_str() {
                    "type.googleapis.com/cursor.v1.EffectReply" => {
                        let r = proto::EffectReply::decode(result.value.as_slice())?;
                        assert_eq!(r.proof, format!("committed:{}:{}", r.iteration, r.ordinal));
                        format!(
                            "{{\"iteration\":{},\"ordinal\":{},\"proof\":\"{}\"}}",
                            r.iteration, r.ordinal, r.proof
                        )
                    }
                    "type.googleapis.com/cursor.v1.Result" => {
                        let r = proto::Result::decode(result.value.as_slice())?;
                        assert_eq!(r.proof, format!("committed:{}:{}", r.cursor, r.ordinal));
                        format!(
                            "{{\"cursor\":{},\"ordinal\":{},\"proof\":\"{}\"}}",
                            r.cursor, r.ordinal, r.proof
                        )
                    }
                    CURSOR_BINDING_TYPE => {
                        validate_cursor_binding(m.workflow_iteration, &result, task)?;
                        "null".into() // Raw binding bytes remain in the inventory/equality proof.
                    }
                    _ => {
                        return Err(format!(
                            "unexpected Stored result type {} in scope {:?}",
                            result_type, m.workflow_iteration
                        )
                        .into());
                    }
                };
            }
        }
        records.push(format!(
                "{{\"scope_iteration\":{},\"type\":\"{}\",\"phase\":{},\"result_type\":\"{}\",\"reply\":{},\"record\":\"{}\",\"raw_response\":\"{}\"}}",
                m.workflow_iteration.map(|i| i.to_string()).unwrap_or_else(|| "null".into()),
                any.type_url,
                phase,
                result_type,
                reply,
                hex(&m.encode_to_vec()),
                hex(&m.response)
            ));
    }
    records.sort();
    let inventory_through = if all {
        task.iteration.to_string()
    } else {
        "null".into()
    };
    println!(
        "{{\"inventory_through\":{},\"inventory_count\":{},",
        inventory_through, inventory_count
    );
    println!(
        "\"consumed\":{},\"concurrent\":{},\"after\":{},\"a_state\":\"{}\",\"b_state\":\"{}\",",
        a.consumed,
        a.concurrent,
        a.after,
        hex(a_bytes),
        hex(b_bytes)
    );
    println!(
        "\"status\":{},\"iteration\":{},\"terminal\":{},\"task\":\"{}\",\"b_commits\":{},\"records\":[{}]}}",
        task.status,
        task.iteration,
        task.response_or_error.is_some(),
        hex(&task.encode_to_vec()),
        b.commits,
        records.join(",")
    );
    Ok(())
}
