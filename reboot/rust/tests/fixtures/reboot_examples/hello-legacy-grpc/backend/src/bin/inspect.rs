use prost::Message;
use reboot::database_proto as db;
use upstream_hello_legacy_grpc::{STATE, actor, proto};

#[derive(Clone, PartialEq, Message)]
struct UnitCheckpoint {
    #[prost(uint32, tag = "1")]
    format: u32,
    #[prost(uint32, tag = "2")]
    phase: u32,
    #[prost(bool, tag = "3")]
    unit: bool,
}

#[derive(Clone, PartialEq, Message)]
struct UnitContract {
    #[prost(string, tag = "1")]
    method: String,
    #[prost(bytes = "vec", tag = "2")]
    request: Vec<u8>,
    #[prost(string, tag = "3")]
    alias: String,
    #[prost(uint32, tag = "4")]
    version: u32,
    #[prost(uint64, tag = "5")]
    bound: u64,
    #[prost(string, tag = "6")]
    parent_bounds: String,
    #[prost(string, tag = "7")]
    result_type: String,
}

#[derive(Clone, PartialEq, Message)]
struct FrameworkStatus {
    #[prost(int32, tag = "1")]
    code: i32,
    #[prost(string, tag = "2")]
    message: String,
    #[prost(message, repeated, tag = "3")]
    details: Vec<prost_types::Any>,
}

fn configured_shards(info: db::ServerInfo) -> Result<Vec<String>, Box<dyn std::error::Error>> {
    let mut seen = std::collections::HashSet::new();
    let mut shards = Vec::with_capacity(info.shard_infos.len());
    for shard in info.shard_infos {
        if shard.shard_id.is_empty() || !seen.insert(shard.shard_id.clone()) {
            return Err("empty or duplicate configured shard ID".into());
        }
        shards.push(shard.shard_id);
    }
    if shards.is_empty() {
        return Err("ServerInfo has no configured shards".into());
    }
    Ok(shards)
}

type CheckpointRecord<'a> = (&'a db::IdempotentMutation, &'static str);

fn expected_checkpoint_record<'a>(
    mutations: &'a [db::IdempotentMutation],
    id: &db::TaskId,
    key: &[u8],
    fingerprint: &[u8],
    checkpoint_type: &str,
) -> Result<Option<CheckpointRecord<'a>>, Box<dyn std::error::Error>> {
    // Select by key FIRST, across actors and every exported mutation scope.
    // Filtering by type/workflow/actor before this would turn corruption into
    // "Absent". Even identical records at this key are not a unique checkpoint.
    let mut matches = mutations.iter().filter(|mutation| mutation.key == key);
    let Some(mutation) = matches.next() else {
        return Ok(None);
    };
    assert!(
        matches.next().is_none(),
        "duplicate expected checkpoint key"
    );
    let any = prost_types::Any::decode(mutation.response.as_slice())?;
    assert_eq!(
        any.type_url, checkpoint_type,
        "wrong type at expected checkpoint key"
    );
    assert_eq!(mutation.state_type, id.state_type);
    assert_eq!(mutation.state_ref, id.state_ref);
    assert_eq!(mutation.workflow_id.as_ref(), Some(&id.task_uuid));
    assert_eq!(mutation.workflow_iteration, None);
    assert_eq!(mutation.key, key);
    assert_eq!(mutation.request_fingerprint.as_deref(), Some(fingerprint));
    assert!(mutation.task_ids.is_empty());
    let checkpoint = UnitCheckpoint::decode(any.value.as_slice())?;
    assert_eq!(checkpoint.format, 1);
    let phase = match (checkpoint.phase, checkpoint.unit) {
        (1, false) => "Started",
        (2, true) => "Stored",
        _ => return Err("invalid canonical unit checkpoint".into()),
    };
    Ok(Some((mutation, phase)))
}

pub async fn run(task_uuid: &str) -> Result<(), Box<dyn std::error::Error>> {
    observe(task_uuid, "Completed", "Stored").await
}

// Expectations only validate canonical records; they never manufacture records.
// Failed means a framework failure observed in host.log by the driver, with no
// successful task response. The Database may retain Pending after host failure.
pub async fn observe(
    task_uuid: &str,
    expected_task: &str,
    expected_checkpoint: &str,
) -> Result<(), Box<dyn std::error::Error>> {
    let id = db::TaskId {
        state_type: STATE.into(),
        state_ref: actor()?,
        task_uuid: uuid::Uuid::parse_str(task_uuid)?.as_bytes().to_vec(),
    };
    let mut client =
        db::database_client::DatabaseClient::connect(std::env::var("RBT_TEST_DATABASE_URL")?)
            .await?;
    let loaded = client
        .load(db::LoadRequest {
            actors: vec![db::Actor {
                state_type: STATE.into(),
                state_ref: actor()?,
                state: None,
            }],
            task_ids: vec![id.clone()],
        })
        .await?
        .into_inner();
    assert_eq!(loaded.actors.len(), 1);
    assert_eq!(loaded.tasks.len(), 1);
    let actor = &loaded.actors[0];
    assert_eq!(actor.state_type, id.state_type);
    assert_eq!(actor.state_ref, id.state_ref);
    let task = &loaded.tasks[0];
    assert_eq!(task.task_id.as_ref(), Some(&id));
    assert_eq!(task.method, "Initialize");
    assert!(task.request.is_empty(), "Initialize takes actual Empty");
    <() as Message>::decode(task.request.as_slice())?;
    assert_eq!(task.iteration, 0);
    let status = match db::task::Status::try_from(task.status)? {
        db::task::Status::Pending => "Pending",
        db::task::Status::Completed => "Completed",
        _ => return Err("unknown canonical task status".into()),
    };
    let mut framework_error = None;
    let terminal = match &task.response_or_error {
        None => "Absent",
        Some(db::task::ResponseOrError::Response(response)) => {
            assert_eq!(
                response.type_url,
                "type.googleapis.com/google.protobuf.Empty"
            );
            <() as Message>::decode(response.value.as_slice())?;
            "Response"
        }
        Some(db::task::ResponseOrError::Error(error)) => {
            assert_eq!(error.type_url, "type.googleapis.com/google.rpc.Status");
            let framework = FrameworkStatus::decode(error.value.as_slice())?;
            assert_eq!(framework.code, tonic::Code::FailedPrecondition as i32);
            assert_eq!(
                framework.message,
                "at-most-once block Started without Stored; callback will not run again"
            );
            framework_error = Some((framework.code, framework.message.clone()));
            assert!(
                framework.details.is_empty(),
                "no declared business error details"
            );
            std::fs::create_dir_all(std::env::var("RBT_TEST_LEGACY_INSPECTION")?)?;
            std::fs::write(
                std::path::PathBuf::from(std::env::var("RBT_TEST_LEGACY_INSPECTION")?)
                    .join("framework-error.pb"),
                &error.value,
            )?;
            "FrameworkError"
        }
    };
    match expected_task {
        "Pending" => {
            assert_eq!(status, "Pending");
            assert_eq!(terminal, "Absent");
        }
        "Completed" => {
            assert_eq!(status, "Completed");
            assert_eq!(terminal, "Response");
        }
        "Failed" => {
            assert!(
                (status == "Pending" && terminal == "Absent")
                    || (status == "Completed" && terminal == "FrameworkError"),
                "failed initializer must never have a successful Empty response"
            );
        }
        _ => return Err("expected task must be Pending, Completed, or Failed".into()),
    }
    let state = proto::RebootGreeter::decode(
        actor
            .state
            .as_ref()
            .ok_or("missing actor state")?
            .as_slice(),
    )?;
    // RecoverIdempotentMutations with workflow_id=None only reads non-workflow
    // records. ExportStreamed reads every committed mutation scope, without
    // invoking recovery. Use every shard from this Database's actual ServerInfo,
    // not a guessed shard or an actor/workflow filter that can hide a bad key.
    let server_info = db::ServerInfo::decode(
        std::fs::read(std::env::var("RBT_TEST_DATABASE_SERVER_INFO")?)?.as_slice(),
    )?;
    let shard_ids = configured_shards(server_info)?;
    let mut stream = client
        .export_streamed(db::ExportRequest {
            state_type: STATE.into(),
            shard_ids,
        })
        .await?
        .into_inner();
    let checkpoint_type = "type.googleapis.com/reboot.rust.workflow.AtMostOnceUnitV1";
    let contract = UnitContract {
        // SDK fingerprints the registered fully-qualified method declaration,
        // while the Database Task's method field stores the short RPC name.
        method: "hello_legacy_grpc.v1.RebootGreeterMethods.Initialize".into(),
        request: task.request.clone(),
        alias: "make greetings".into(),
        version: 1,
        bound: 0,
        parent_bounds: String::new(),
        result_type: checkpoint_type.into(),
    };
    let fingerprint =
        reboot::runtime::request_fingerprint("reboot.workflow.at-most-once.unit.v1", &contract);
    let seed = uuid::Uuid::new_v5(
        &uuid::Uuid::from_slice(&id.task_uuid)?,
        b"reboot.at-most-once.unit.v1",
    );
    let namespace = uuid::Uuid::new_v5(&seed, b"reboot.named.wait.v1");
    let alias = b"make greetings";
    let mut encoded = (alias.len() as u64).to_be_bytes().to_vec();
    encoded.extend_from_slice(alias);
    let key = uuid::Uuid::new_v5(&namespace, &encoded);
    let mut mutations = vec![];
    while let Some(batch) = stream.message().await? {
        for item in batch.items {
            if let Some(db::export_item::Item::IdempotentMutation(mutation)) = item.item {
                mutations.push(mutation);
            }
        }
    }
    let checkpoint = expected_checkpoint_record(
        &mutations,
        &id,
        key.as_bytes(),
        &fingerprint,
        checkpoint_type,
    )?;
    let phase = checkpoint.map_or("Absent", |(_, phase)| phase);
    assert_eq!(phase, expected_checkpoint);
    let path = std::path::PathBuf::from(std::env::var("RBT_TEST_LEGACY_INSPECTION")?);
    std::fs::create_dir_all(&path)?;
    std::fs::write(path.join("actor.pb"), actor.encode_to_vec())?;
    std::fs::write(path.join("task.pb"), task.encode_to_vec())?;
    for (i, mutation) in mutations.iter().enumerate() {
        std::fs::write(
            path.join(format!("mutation-{i}.pb")),
            mutation.encode_to_vec(),
        )?;
    }
    if let Some((checkpoint, _)) = checkpoint {
        std::fs::write(path.join("checkpoint.pb"), checkpoint.encode_to_vec())?;
        // Preserve the existing happy/restart inspector's artifact contract.
        if phase == "Stored" {
            std::fs::write(path.join("stored.pb"), checkpoint.encode_to_vec())?;
        }
    }
    let framework_json = match framework_error {
        Some((code, message)) => {
            format!("{{\"code\":{code},\"message\":\"{message}\",\"task_uuid\":\"{task_uuid}\"}}")
        }
        None => "null".into(),
    };
    let summary = format!(
        "{{\"task_uuid\":\"{task_uuid}\",\"status\":\"{status}\",\"terminal\":\"{terminal}\",\"checkpoint\":\"{phase}\",\"framework_error\":{framework_json},\"num_greetings\":{},\"mutations\":{}}}\n",
        state.num_greetings,
        mutations.len()
    );
    std::fs::write(path.join("summary.json"), summary)?;
    if expected_task == "Completed" && phase == "Stored" {
        println!(
            "CANONICAL_INITIALIZER_COMPLETED num={} task={} STORED_UNIT",
            state.num_greetings, task_uuid
        );
    } else {
        println!(
            "CANONICAL_INITIALIZER status={status} terminal={terminal} num={} task={task_uuid} checkpoint={phase}",
            state.num_greetings
        );
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    const TYPE: &str = "type.googleapis.com/reboot.rust.workflow.AtMostOnceUnitV1";
    const KEY: &[u8] = &[7; 16];
    const FINGERPRINT: &[u8] = &[9; 32];

    fn fixture(phase: u32) -> (db::TaskId, db::IdempotentMutation) {
        let id = db::TaskId {
            state_type: STATE.into(),
            state_ref: "inspector-unit-test".into(),
            task_uuid: vec![3; 16],
        };
        let mutation = db::IdempotentMutation {
            state_type: id.state_type.clone(),
            state_ref: id.state_ref.clone(),
            key: KEY.to_vec(),
            workflow_id: Some(id.task_uuid.clone()),
            request_fingerprint: Some(FINGERPRINT.to_vec()),
            response: prost_types::Any {
                type_url: TYPE.into(),
                value: UnitCheckpoint {
                    format: 1,
                    phase,
                    unit: phase == 2,
                }
                .encode_to_vec(),
            }
            .encode_to_vec(),
            ..Default::default()
        };
        (id, mutation)
    }

    #[test]
    fn finds_started_and_stored_by_key_among_other_scopes() {
        for (phase, expected) in [(1, "Started"), (2, "Stored")] {
            let (id, mutation) = fixture(phase);
            let mut unrelated = mutation.clone();
            unrelated.key = vec![8; 16];
            unrelated.workflow_id = None;
            unrelated.response = vec![0xff];
            let records = vec![unrelated, mutation];
            let found = expected_checkpoint_record(&records, &id, KEY, FINGERPRINT, TYPE)
                .unwrap()
                .unwrap();
            assert_eq!(found.0, &records[1]);
            assert_eq!(found.1, expected);
            assert!(
                expected_checkpoint_record(&records[..1], &id, KEY, FINGERPRINT, TYPE)
                    .unwrap()
                    .is_none()
            );
        }
    }

    #[test]
    fn expected_key_rejects_wrong_scope_type_fingerprint_and_duplicates() {
        let (id, mutation) = fixture(2);
        for change in 0..7 {
            let mut wrong = mutation.clone();
            match change {
                0 => wrong.workflow_id = None,
                1 => wrong.workflow_id = Some(vec![4; 16]),
                2 => wrong.workflow_iteration = Some(0),
                3 => wrong.state_ref = "wrong-actor".into(),
                4 => wrong.state_type = "wrong-state-type".into(),
                5 => wrong.request_fingerprint = Some(vec![0; 32]),
                6 => {
                    wrong.response = prost_types::Any {
                        type_url: "type.googleapis.com/google.protobuf.Empty".into(),
                        value: vec![],
                    }
                    .encode_to_vec();
                }
                _ => unreachable!(),
            }
            assert!(
                std::panic::catch_unwind(|| {
                    expected_checkpoint_record(&[wrong], &id, KEY, FINGERPRINT, TYPE)
                        .map(|record| record.is_some())
                })
                .is_err(),
                "wrong record variant {change} must not become Absent"
            );
        }
        assert!(
            std::panic::catch_unwind(|| {
                expected_checkpoint_record(
                    &[mutation.clone(), mutation.clone()],
                    &id,
                    KEY,
                    FINGERPRINT,
                    TYPE,
                )
                .map(|record| record.is_some())
            })
            .is_err()
        );
    }

    #[test]
    fn uses_all_actual_shards_and_rejects_incomplete_configuration() {
        let info = db::ServerInfo {
            shard_infos: ["first", "second", "third"]
                .into_iter()
                .map(|shard_id| db::ShardInfo {
                    shard_id: shard_id.into(),
                    shard_first_key: vec![],
                })
                .collect(),
        };
        assert_eq!(
            configured_shards(info.clone()).unwrap(),
            ["first", "second", "third"]
        );
        assert!(configured_shards(db::ServerInfo::default()).is_err());
        let mut duplicate = info.clone();
        duplicate.shard_infos.push(info.shard_infos[0].clone());
        assert!(configured_shards(duplicate).is_err());
        let mut empty = info;
        empty.shard_infos[0].shard_id.clear();
        assert!(configured_shards(empty).is_err());
    }
}
