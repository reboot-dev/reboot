//! Missing IDs via only faithful public Send/Warning: early Erase removes the
//! message before Send's Warning, and the second early Erase must retry too.
//! No controlled UUIDs, handler replacement, raw Store or fabricated workflow.
use super::*;
async fn actor(reference: &str) -> db::Actor {
    let mut client = db::database_client::DatabaseClient::connect(
        std::env::var("RBT_TEST_DATABASE_URL").unwrap(),
    )
    .await
    .unwrap();
    client
        .load(db::LoadRequest {
            actors: vec![db::Actor {
                state_type: STATE.into(),
                state_ref: reference.into(),
                state: None,
            }],
            task_ids: vec![],
        })
        .await
        .unwrap()
        .into_inner()
        .actors
        .remove(0)
}
fn snapshots(directory: &std::path::Path) -> [db::Task; 2] {
    ["missing-warning.pb", "missing-erase.pb"].map(|name| {
        db::Task::decode(std::fs::read(directory.join(name)).unwrap().as_slice()).unwrap()
    })
}
pub async fn inspect(directory: &std::path::Path) {
    for (i, saved) in snapshots(directory).into_iter().enumerate() {
        assert_eq!(saved.status, db::task::Status::Pending as i32);
        let restored = load(saved.task_id.clone().unwrap()).await;
        assert_eq!(restored, saved, "full pending identity at shutdown");
        std::fs::write(
            directory.join(format!("shutdown-missing-{i}.pb")),
            restored.encode_to_vec(),
        )
        .unwrap();
    }
    println!("MISSING_IDS_PENDING_AT_SHUTDOWN_EXACT");
}
async fn retries(
    channel: tonic::transport::Channel,
    tasks: &[db::Task; 2],
) -> db::ListTasksResponse {
    let mut listing = db::tasks_client::TasksClient::new(channel);
    let deadline = tokio::time::Instant::now() + Duration::from_secs(15);
    loop {
        let mut request = tonic::Request::new(db::ListTasksRequest {
            only_server_id: Some("hello-server".into()),
        });
        request.set_timeout(Duration::from_secs(2));
        let result = listing.list_tasks(request).await.unwrap().into_inner();
        if tasks.iter().all(|task| {
            result.tasks.iter().any(|info| {
                info.task_id == task.task_id
                    && info.status == db::task_info::Status::ScheduledRetry as i32
                    && info.num_runs_failed_recently > 3
            })
        }) {
            return result;
        }
        assert!(
            tokio::time::Instant::now() < deadline,
            "retry listing bound: {result:?}"
        );
        tokio::time::sleep(Duration::from_millis(50)).await;
    }
}
async fn pending_wait(channel: tonic::transport::Channel, tasks: &[db::Task; 2]) {
    let mut warning = tonic::Request::new(tasks[0].task_id.clone().unwrap());
    warning.set_timeout(Duration::from_millis(100));
    let result = tokio::time::timeout(
        Duration::from_secs(2),
        generated::HelloMethodsTasksWait::warning(channel.clone(), warning),
    )
    .await
    .unwrap()
    .unwrap_err();
    // Tonic may surface its deadline as Cancelled; it must not become a result.
    assert!(
        matches!(
            result.code(),
            tonic::Code::Cancelled | tonic::Code::DeadlineExceeded
        ),
        "{result:?}"
    );
    let mut erase = tonic::Request::new(tasks[1].task_id.clone().unwrap());
    erase.set_timeout(Duration::from_millis(100));
    let result = tokio::time::timeout(
        Duration::from_secs(2),
        generated::HelloMethodsTasksWait::erase(channel.clone(), erase),
    )
    .await
    .unwrap()
    .unwrap_err();
    assert!(
        matches!(
            result.code(),
            tonic::Code::Cancelled | tonic::Code::DeadlineExceeded
        ),
        "{result:?}"
    );
    let mut admin = db::tasks_client::TasksClient::new(channel);
    for task in tasks {
        let mut request = tonic::Request::new(db::CancelTaskRequest {
            task_id: task.task_id.clone(),
        });
        request.metadata_mut().insert(
            "x-reboot-state-ref",
            task.task_id.as_ref().unwrap().state_ref.parse().unwrap(),
        );
        request.set_timeout(Duration::from_secs(2));
        let error = admin.cancel_task(request).await.unwrap_err();
        assert_eq!(
            error.code(),
            tonic::Code::FailedPrecondition,
            "ordinary cancellation remains unsupported: {error:?}"
        );
    }
}
pub async fn run(
    command: &str,
    directory: &std::path::Path,
    reference: &str,
    context: &ExternalContext,
    channel: tonic::transport::Channel,
    key_base: uuid::Uuid,
) -> Result<(), Box<dyn std::error::Error>> {
    let mut client = proto::hello_methods_client::HelloMethodsClient::new(channel.clone());
    let tasks = if command == "missing-seed" {
        let sent = client
            .send(context.writer_with_key(
                proto::SendRequest {
                    message: "missing-ID public chain".into(),
                },
                uuid::Uuid::from_u128(key_base.as_u128() + 3),
            )?)
            .await?
            .into_inner();
        let warning = load(id(sent.task_id.as_ref().unwrap())).await;
        let stored = actor(reference).await;
        let state = proto::Hello::decode(stored.state.as_ref().unwrap().as_slice())?;
        assert_eq!(state.messages.len(), 1);
        let message_id = state.messages[0].id.clone();
        let first = client
            .warning(context.writer_with_key(
                proto::WarningRequest {
                    message_id: message_id.clone(),
                },
                uuid::Uuid::from_u128(key_base.as_u128() + 4),
            )?)
            .await?
            .into_inner();
        // Separate due times: first Erase must remove before second tries.
        tokio::time::sleep(Duration::from_millis(200)).await;
        let second = client
            .warning(context.writer_with_key(
                proto::WarningRequest { message_id },
                uuid::Uuid::from_u128(key_base.as_u128() + 5),
            )?)
            .await?
            .into_inner();
        let first_id = id(first.task_id.as_ref().unwrap());
        let second_erase = load(id(second.task_id.as_ref().unwrap())).await;
        tokio::time::timeout(
            Duration::from_secs(10),
            generated::HelloMethodsTasksWait::erase(channel.clone(), tonic::Request::new(first_id)),
        )
        .await??;
        let tasks = [warning, second_erase];
        retries(channel.clone(), &tasks).await;
        // A faithful ordinary Send remains usable during retry. It has no ID
        // input and generates a fresh random v4, not the removed matching ID.
        let unrelated = client
            .send(context.writer_with_key(
                proto::SendRequest {
                    message: "unrelated Send while retries are pending".into(),
                },
                uuid::Uuid::from_u128(key_base.as_u128() + 6),
            )?)
            .await?
            .into_inner();
        let current = actor(reference).await;
        let current = proto::Hello::decode(current.state.as_ref().unwrap().as_slice())?;
        assert_eq!(current.messages.len(), 1);
        let missing_warning = proto::WarningRequest::decode(tasks[0].request.as_slice())?;
        let missing_erase = proto::EraseRequest::decode(tasks[1].request.as_slice())?;
        assert_eq!(missing_warning.message_id, missing_erase.message_id);
        assert_ne!(current.messages[0].id, missing_warning.message_id);
        assert_ne!(current.messages[0].id, missing_erase.message_id);
        let warned = tokio::time::timeout(
            Duration::from_secs(15),
            generated::HelloMethodsTasksWait::warning(
                channel.clone(),
                tonic::Request::new(id(unrelated.task_id.as_ref().unwrap())),
            ),
        )
        .await??;
        tokio::time::timeout(
            Duration::from_secs(8),
            generated::HelloMethodsTasksWait::erase(
                channel.clone(),
                tonic::Request::new(id(warned.task_id.as_ref().unwrap())),
            ),
        )
        .await??;
        println!(
            "FAITHFUL_PUBLIC_SEND_USABLE_DURING_MISSING_RETRY distinct-random-ID typed-chain-completed"
        );
        for (task, name) in tasks.iter().zip(["missing-warning.pb", "missing-erase.pb"]) {
            assert_eq!(load(task.task_id.clone().unwrap()).await, *task);
            std::fs::write(directory.join(name), task.encode_to_vec())?;
        }
        std::fs::write(
            directory.join("missing-actor.pb"),
            actor(reference).await.encode_to_vec(),
        )?;
        std::fs::write(
            directory.join("missing-invocations.log"),
            std::fs::read(std::env::var("RBT_TEST_TASKS_INVOCATIONS")?)?,
        )?;
        tasks
    } else {
        assert_eq!(command, "missing-recover");
        let tasks = snapshots(directory);
        for task in &tasks {
            assert_eq!(load(task.task_id.clone().unwrap()).await, *task);
        }
        tasks
    };
    let before = actor(reference).await;
    let saved = db::Actor::decode(std::fs::read(directory.join("missing-actor.pb"))?.as_slice())?;
    assert_eq!(
        before, saved,
        "full actor state unchanged through rejection/restart"
    );
    let listing = retries(channel.clone(), &tasks).await;
    std::fs::write(
        directory.join(format!("{command}-listing.pb")),
        listing.encode_to_vec(),
    )?;
    pending_wait(channel.clone(), &tasks).await;
    messages(&mut client, context, &["Number of erased messages: 4"]).await;
    assert_eq!(actor(reference).await, saved);
    for task in &tasks {
        assert_eq!(load(task.task_id.clone().unwrap()).await, *task);
    }
    assert_eq!(
        std::fs::read(std::env::var("RBT_TEST_TASKS_INVOCATIONS")?)?,
        std::fs::read(directory.join("missing-invocations.log"))?,
        "precheck rejection never invokes unchanged consumer"
    );
    println!(
        "MISSING_IDS_PUBLIC_PENDING_RETRY_ACCEPTED {command} retry-counts>3 exact-tasks exact-actor no-handler-entry typed-Wait-deadlines CancelTask-rejected"
    );
    Ok(())
}
