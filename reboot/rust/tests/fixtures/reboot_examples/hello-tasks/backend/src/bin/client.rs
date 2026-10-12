//! Public mutations are sent once, with stable keys; Database access is read-only evidence.
use prost::Message;
use reboot::{ExternalContext, database_proto as db};
use std::{
    path::PathBuf,
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use upstream_hello_tasks::{generated, proto};
const STATE: &str = "hello_tasks.v1.Hello";
fn now() -> i128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_nanos() as i128
}
fn timestamp(task: &db::Task) -> i128 {
    let t = task.timestamp.as_ref().unwrap();
    i128::from(t.seconds) * 1_000_000_000 + i128::from(t.nanos)
}
fn id(id: &upstream_hello_tasks::rbt::v1alpha1::TaskId) -> db::TaskId {
    db::TaskId {
        state_type: id.state_type.clone(),
        state_ref: id.state_ref.clone(),
        task_uuid: id.task_uuid.clone(),
    }
}
async fn load(task_id: db::TaskId) -> db::Task {
    let mut client = db::database_client::DatabaseClient::connect(
        std::env::var("RBT_TEST_DATABASE_URL").unwrap(),
    )
    .await
    .unwrap();
    client
        .load(db::LoadRequest {
            actors: vec![],
            task_ids: vec![task_id],
        })
        .await
        .unwrap()
        .into_inner()
        .tasks
        .remove(0)
}
async fn messages(
    client: &mut proto::hello_methods_client::HelloMethodsClient<tonic::transport::Channel>,
    context: &ExternalContext,
    expected: &[&str],
) {
    let result = client
        .messages(context.reader(proto::MessagesRequest {}).unwrap())
        .await
        .unwrap()
        .into_inner();
    assert_eq!(result.messages, expected);
    println!("EXACT_MESSAGES {:?}", result.messages);
}
#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let command = std::env::args().nth(1).ok_or("missing command")?;
    let directory = PathBuf::from(std::env::var("RBT_TEST_TASKS_EVIDENCE")?);
    let path = directory.join("pending-warning.pb");
    if command == "inspect-pending" {
        let saved = db::Task::decode(std::fs::read(path)?.as_slice())?;
        assert_eq!(saved.status, db::task::Status::Pending as i32);
        let restored = load(saved.task_id.clone().unwrap()).await;
        assert_eq!(
            restored, saved,
            "exact Pending task persisted across public CLI shutdown"
        );
        std::fs::write(
            directory.join("shutdown-pending-warning.pb"),
            restored.encode_to_vec(),
        )?;
        println!("PENDING_AT_SHUTDOWN_EXACT");
        return Ok(());
    }
    let reference = reboot::state_ref::StateRef::from_id(STATE, "hello-tasks")?.to_string();
    let context = ExternalContext::new(&reference);
    let channel = tokio::time::timeout(
        Duration::from_secs(3),
        context.connect(std::env::var("RBT_RUST_URL")?),
    )
    .await??;
    if command == "health" {
        let response = tonic_health::pb::health_client::HealthClient::new(channel)
            .check(tonic::Request::new(tonic_health::pb::HealthCheckRequest {
                service: String::new(),
            }))
            .await?
            .into_inner();
        assert_eq!(
            response.status,
            tonic_health::pb::health_check_response::ServingStatus::Serving as i32
        );
        println!("SERVING");
        return Ok(());
    }
    let mut client = proto::hello_methods_client::HelloMethodsClient::new(channel.clone());
    let key_base = uuid::Uuid::parse_str(&std::env::var("RBT_TEST_TASKS_KEY_BASE")?)?;
    assert_eq!(key_base.get_version_num(), 7);
    let key = uuid::Uuid::from_u128(key_base.as_u128() + if command == "scenario" { 1 } else { 2 });
    let text = if command == "scenario" {
        "public chain"
    } else {
        "recover chain"
    };
    if command == "verify" {
        messages(&mut client, &context, &["Number of erased messages: 2"]).await;
        let saved = proto::SendResponse::decode(
            std::fs::read(directory.join("recovery-send.pb"))?.as_slice(),
        )?;
        let replay = client
            .send(context.writer_with_key(
                proto::SendRequest {
                    message: text.into(),
                },
                key,
            )?)
            .await?
            .into_inner();
        assert_eq!(replay, saved);
        messages(&mut client, &context, &["Number of erased messages: 2"]).await;
        println!("SAME_KEY_COMPLETED_NO_RESURRECTION");
        return Ok(());
    }
    let before = now();
    let sent = client
        .send(context.writer_with_key(
            proto::SendRequest {
                message: text.into(),
            },
            key,
        )?)
        .await?
        .into_inner();
    let after = now();
    let warning_id = id(sent.task_id.as_ref().unwrap());
    let warning = load(warning_id.clone()).await;
    if command == "recover" {
        let saved = proto::SendResponse::decode(
            std::fs::read(directory.join("recovery-send.pb"))?.as_slice(),
        )?;
        assert_eq!(
            sent, saved,
            "restart same-key replay preserves exact scheduled identity"
        );
    } else {
        assert!(
            (before + 7_000_000_000..=after + 7_000_000_000).contains(&timestamp(&warning)),
            "exact seven-second schedule"
        );
        assert_eq!(warning.status, db::task::Status::Pending as i32);
        assert!(now() < timestamp(&warning), "no early warning");
        let count = if command == "scenario" {
            "Number of erased messages: 0"
        } else {
            "Number of erased messages: 1"
        };
        messages(&mut client, &context, &[count, text]).await;
        let replay = client
            .send(context.writer_with_key(
                proto::SendRequest {
                    message: text.into(),
                },
                key,
            )?)
            .await?
            .into_inner();
        assert_eq!(sent, replay);
        messages(&mut client, &context, &[count, text]).await;
    }
    if command == "seed" {
        std::fs::write(&path, warning.encode_to_vec())?;
        std::fs::write(directory.join("recovery-send.pb"), sent.encode_to_vec())?;
        println!("PENDING_BEFORE_SHUTDOWN exact7s same-key-no-duplicate");
        return Ok(());
    }
    assert!(command == "scenario" || command == "recover");
    let warned: proto::WarningResponse = tokio::time::timeout(
        Duration::from_secs(20),
        generated::HelloMethodsTasksWait::warning(
            channel.clone(),
            tonic::Request::new(warning_id.clone()),
        ),
    )
    .await??;
    let warned_at = now();
    assert!(warned_at >= timestamp(&warning), "Warning not early");
    let erase_id = id(warned.task_id.as_ref().unwrap());
    let erase = load(erase_id.clone()).await;
    assert!(
        timestamp(&erase) >= timestamp(&warning) + 3_000_000_000
            && timestamp(&erase) <= warned_at + 3_000_000_000,
        "three-second successor window"
    );
    let invocations = std::fs::read_to_string(std::env::var("RBT_TEST_TASKS_INVOCATIONS")?)?;
    let times = |label: &str| -> Vec<i128> {
        invocations
            .lines()
            .filter_map(|line| {
                line.strip_prefix(&format!("{label} "))
                    .map(|value| value.parse().unwrap())
            })
            .collect()
    };
    let expected_invocations = if command == "scenario" { 1 } else { 2 };
    let starts = times("WarningBefore");
    let ends = times("WarningAfter");
    assert_eq!(
        starts.len(),
        expected_invocations,
        "Warning is never reinvoked by Send replay"
    );
    assert_eq!(ends.len(), expected_invocations);
    assert!(
        starts[expected_invocations - 1] >= timestamp(&warning),
        "no early admitted Warning"
    );
    assert!(
        (starts[expected_invocations - 1] + 3_000_000_000
            ..=ends[expected_invocations - 1] + 3_000_000_000)
            .contains(&timestamp(&erase)),
        "exact three-second schedule in real consumer invocation window"
    );
    assert_eq!(erase.status, db::task::Status::Pending as i32);
    assert!(now() < timestamp(&erase), "no early erase");
    let count = if command == "scenario" {
        "Number of erased messages: 0"
    } else {
        "Number of erased messages: 1"
    };
    let suffixed = format!("{text} (Disappearing soon!)");
    messages(&mut client, &context, &[count, &suffixed]).await;
    let repeated: proto::WarningResponse = generated::HelloMethodsTasksWait::warning(
        channel.clone(),
        tonic::Request::new(warning_id.clone()),
    )
    .await?;
    assert_eq!(repeated, warned);
    let _: proto::EraseResponse = tokio::time::timeout(
        Duration::from_secs(10),
        generated::HelloMethodsTasksWait::erase(
            channel.clone(),
            tonic::Request::new(erase_id.clone()),
        ),
    )
    .await??;
    assert!(now() >= timestamp(&erase));
    let count = if command == "scenario" {
        "Number of erased messages: 1"
    } else {
        "Number of erased messages: 2"
    };
    messages(&mut client, &context, &[count]).await;
    let repeated: proto::WarningResponse = generated::HelloMethodsTasksWait::warning(
        channel.clone(),
        tonic::Request::new(warning_id.clone()),
    )
    .await?;
    assert_eq!(repeated, warned);
    let _: proto::EraseResponse =
        generated::HelloMethodsTasksWait::erase(channel, tonic::Request::new(erase_id.clone()))
            .await?;
    let replay = client
        .send(context.writer_with_key(
            proto::SendRequest {
                message: text.into(),
            },
            key,
        )?)
        .await?
        .into_inner();
    assert_eq!(sent, replay);
    messages(&mut client, &context, &[count]).await;
    let completed_warning = load(warning_id).await;
    let completed_erase = load(erase_id).await;
    assert_eq!(completed_warning.status, db::task::Status::Completed as i32);
    assert_eq!(completed_erase.status, db::task::Status::Completed as i32);
    std::fs::write(
        directory.join(format!("{command}-warning.pb")),
        completed_warning.encode_to_vec(),
    )?;
    std::fs::write(
        directory.join(format!("{command}-erase.pb")),
        completed_erase.encode_to_vec(),
    )?;
    println!(
        "TYPED_WAIT_CHAIN_ACCEPTED {command} exact7s3s suffix-once counter-once same-key-no-duplicate"
    );
    Ok(())
}
