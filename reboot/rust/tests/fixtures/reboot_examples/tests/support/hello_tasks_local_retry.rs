//! Native controlled-ID ordinary-writer fixture, not unchanged public rbt sample proof.
//! Scheduling and ID choices are fixture-controlled; Warning/Erase handlers are unchanged.
use super::*;
use generated::HelloMethodsDatabaseHandler;
use reboot::runtime::{StateAdmission, WriterExecution};
pub(super) struct FixtureAdmin;
impl reboot::auth::TokenVerifier for FixtureAdmin {
    fn verify<'a>(
        &'a self,
        _: &'a reboot::auth::AuthorizationContext,
        _: Option<&'a str>,
    ) -> reboot::auth::VerifyFuture<'a> {
        Box::pin(async { reboot::auth::TokenVerification::NoOpinion })
    }
}
impl reboot::auth::Authorizer for FixtureAdmin {
    fn authorize<'a>(
        &'a self,
        _: &'a reboot::auth::AuthorizationContext,
        _: Option<&'a reboot::auth::Auth>,
        _: Option<&'a [u8]>,
        _: &'a [u8],
    ) -> reboot::auth::AuthorizeFuture<'a> {
        Box::pin(async { reboot::auth::AuthorizationDecision::Allow })
    }
}

async fn ordinary_send(
    store: &DatabaseActorStore,
    tasks: &reboot::one_shot_tasks::OneShotTasks,
    reference: &str,
    callback: impl for<'a> FnOnce(
        &'a mut proto::Hello,
        proto::SendRequest,
        String,
    ) -> std::pin::Pin<
        Box<
            dyn std::future::Future<
                    Output = Result<WriterExecution<proto::SendResponse>, tonic::Status>,
                > + Send
                + 'a,
        >,
    >,
) -> proto::SendResponse {
    store
        .scheduling_writer_async_for_method_authorized::<generated::HelloDurableState, _, _, _>(
            (
                "hello_tasks.v1.HelloMethods.Send",
                "type.googleapis.com/hello_tasks.v1.SendResponse",
                StateAdmission::DefaultOnAbsent,
            ),
            &reboot::auth::AuthorizationPolicy::permissive_for_development(),
            Some(tasks),
            request(
                reference,
                proto::SendRequest {
                    message: "ordinary insertion".into(),
                },
                Some(uuid::Uuid::new_v4()),
            ),
            callback,
        )
        .await
        .unwrap()
        .into_inner()
}
#[tokio::test]
#[ignore = "requires REBOOT_NATIVE2PC_CXX_DATABASE real C++ Database/RocksDB"]
async fn native_missing_ids_retry_then_ordinary_writer_insertion_completes_once() {
    let base = std::env::var_os("HELLO_TASKS_EVIDENCE_ROOT")
        .map(std::path::PathBuf::from)
        .unwrap_or_else(std::env::temp_dir);
    let directory = base.join(format!("hello-local-retry-{}", uuid::Uuid::new_v4()));
    let mut native = Native::start(directory.clone()).await;
    let reference = reboot::state_ref::StateRef::from_id(STATE, "hello-local-retry")
        .unwrap()
        .to_string();
    let host = Host::start(&native.endpoint, &reference).await;
    let store = DatabaseActorStore::connect(&native.endpoint).await.unwrap();
    let warning_message = uuid::Uuid::new_v4().to_string();
    let erase_message = uuid::Uuid::new_v4().to_string();
    let warning = generated::HelloMethodsTasksAt::warning(
        &reference,
        &proto::WarningRequest {
            message_id: warning_message.clone(),
        },
        prost_types::Timestamp {
            seconds: 1,
            nanos: 0,
        },
    );
    let erase = generated::HelloMethodsTasksAt::erase(
        &reference,
        &proto::EraseRequest {
            message_id: erase_message.clone(),
        },
        prost_types::Timestamp {
            seconds: 1,
            nanos: 0,
        },
    );
    let effects = vec![warning.clone(), erase.clone()];
    // Actual Send ordinary writer persists a real unrelated message and also
    // admits the two generated missing-ID tasks. No raw task seeding/transaction.
    ordinary_send(
        &store,
        &host.tasks,
        &reference,
        move |state, request, reference| {
            Box::pin(async move {
                let mut execution = HelloTasks
                    .send_with_tasks(state, request, reference)
                    .await?;
                execution.task_upserts.extend(effects);
                Ok(execution)
            })
        },
    )
    .await;
    let before = state(&native.endpoint, &reference).await;
    let mut client =
        proto::hello_methods_client::HelloMethodsClient::connect(host.endpoint.clone())
            .await
            .unwrap();
    assert_eq!(
        client
            .warning(request(
                &reference,
                proto::WarningRequest {
                    message_id: warning_message.clone()
                },
                Some(uuid::Uuid::new_v4())
            ))
            .await
            .unwrap_err()
            .code(),
        tonic::Code::FailedPrecondition
    );
    assert_eq!(
        client
            .erase(request(
                &reference,
                proto::EraseRequest {
                    message_id: erase_message.clone()
                },
                Some(uuid::Uuid::new_v4())
            ))
            .await
            .unwrap_err()
            .code(),
        tonic::Code::FailedPrecondition
    );
    // Backoff reaches its fifth rejection by 375ms. Retain Pending and prove
    // the host remains publicly usable while these tasks repeatedly reject.
    tokio::time::sleep(Duration::from_millis(900)).await;
    assert_eq!(
        load(&native.endpoint, warning.task_id.clone().unwrap()).await,
        warning
    );
    assert_eq!(
        load(&native.endpoint, erase.task_id.clone().unwrap()).await,
        erase
    );
    assert_eq!(state(&native.endpoint, &reference).await, before);
    client
        .messages(request(&reference, proto::MessagesRequest {}, None))
        .await
        .unwrap();
    let channel = tonic::transport::Endpoint::from_shared(host.endpoint.clone())
        .unwrap()
        .connect()
        .await
        .unwrap();
    let mut listing = db::tasks_client::TasksClient::new(channel.clone());
    let listed = listing
        .list_tasks(db::ListTasksRequest {
            only_server_id: Some("hello-server".into()),
        })
        .await
        .unwrap()
        .into_inner()
        .tasks;
    for task in [&warning, &erase] {
        let info = listed
            .iter()
            .find(|info| info.task_id == task.task_id)
            .unwrap();
        assert_eq!(info.status, db::task_info::Status::ScheduledRetry as i32);
        assert!(info.num_runs_failed_recently > 3);
    }
    assert!(
        tokio::time::timeout(
            Duration::from_millis(30),
            generated::HelloMethodsTasksWait::warning(
                channel,
                request(&reference, warning.task_id.clone().unwrap(), None)
            )
        )
        .await
        .is_err()
    );
    host.finish().await;
    assert_eq!(
        load(&native.endpoint, warning.task_id.clone().unwrap()).await,
        warning
    );
    assert_eq!(
        load(&native.endpoint, erase.task_id.clone().unwrap()).await,
        erase
    );
    native.restart().await;
    let host = Host::start(&native.endpoint, &reference).await;
    assert_eq!(state(&native.endpoint, &reference).await, before);
    let warning_id = warning.task_id.clone().unwrap();
    let erase_id = erase.task_id.clone().unwrap();
    // Control the normal Send UUID source so the ordinary writer can insert the
    // exact known missing IDs. This is fixture orchestration, not upstream Send API.
    ordinary_send(&store, &host.tasks, &reference, move |state, request, _| {
        Box::pin(async move {
            state.messages.push(proto::Message {
                id: warning_message,
                text: request.message.clone(),
            });
            state.messages.push(proto::Message {
                id: erase_message,
                text: request.message,
            });
            Ok(WriterExecution::new(proto::SendResponse { task_id: None }))
        })
    })
    .await;
    let channel = tonic::transport::Endpoint::from_shared(host.endpoint.clone())
        .unwrap()
        .connect()
        .await
        .unwrap();
    let warned = tokio::time::timeout(
        Duration::from_secs(5),
        generated::HelloMethodsTasksWait::warning(
            channel.clone(),
            request(&reference, warning_id.clone(), None),
        ),
    )
    .await
    .unwrap()
    .unwrap();
    tokio::time::timeout(
        Duration::from_secs(5),
        generated::HelloMethodsTasksWait::erase(
            channel.clone(),
            request(&reference, erase_id.clone(), None),
        ),
    )
    .await
    .unwrap()
    .unwrap();
    let interim = state(&native.endpoint, &reference).await;
    assert_eq!(interim.num_erased_messages, 1);
    assert_eq!(interim.messages.len(), 2);
    assert_eq!(
        interim
            .messages
            .iter()
            .filter(|m| m.text == "ordinary insertion (Disappearing soon!)")
            .count(),
        1
    );
    let successor = database_id(warned.task_id.as_ref().unwrap());
    tokio::time::timeout(
        Duration::from_secs(5),
        generated::HelloMethodsTasksWait::erase(
            channel.clone(),
            request(&reference, successor.clone(), None),
        ),
    )
    .await
    .unwrap()
    .unwrap();
    let final_state = state(&native.endpoint, &reference).await;
    assert_eq!(final_state.num_erased_messages, 2);
    assert_eq!(final_state.messages, before.messages);
    assert_eq!(
        generated::HelloMethodsTasksWait::warning(
            channel.clone(),
            request(&reference, warning_id.clone(), None)
        )
        .await
        .unwrap(),
        warned
    );
    generated::HelloMethodsTasksWait::erase(channel, request(&reference, erase_id.clone(), None))
        .await
        .unwrap();
    assert_eq!(state(&native.endpoint, &reference).await, final_state);
    for id in [warning_id, erase_id, successor] {
        assert_eq!(
            load(&native.endpoint, id).await.status,
            db::task::Status::Completed as i32
        );
    }
    std::fs::write(directory.join("local-retry-proof.txt"), "controlled IDs; generated missing Warning/Erase Pending; public listing retry counts >3; pending Wait usable; pending at shutdown and native restart; unary FailedPrecondition; no durable state mutation during retry; real ordinary Send insertion; typed Wait; one suffix and two erasures; repeated terminal Wait no mutation\n").unwrap();
    host.finish().await;
}
