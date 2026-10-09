use prost::Message;
use reboot::{
    application_host::ApplicationHost,
    database_proto as db,
    one_shot_tasks::WorkflowContext,
    runtime::{DatabaseActorStore, TransactionExecution},
};
use std::sync::Arc;
pub mod proto {
    tonic::include_proto!("workflow.v1");
}
pub mod generated {
    include!(concat!(env!("OUT_DIR"), "/workflow/v1/workflow.reboot.rs"));
}
#[derive(Clone, Default)]
struct Ledger {
    attempts: Arc<std::sync::atomic::AtomicUsize>,
}
fn event(name: &str) {
    // Formatting can issue multiple append writes; serialize concurrent bodies
    // so proof markers remain complete lines, especially during mass recovery.
    static EVENTS: std::sync::Mutex<()> = std::sync::Mutex::new(());
    let _guard = EVENTS.lock().unwrap();
    if let Ok(path) = std::env::var("WORKFLOW_BODY_EVENTS") {
        use std::io::Write;
        writeln!(
            std::fs::OpenOptions::new()
                .create(true)
                .append(true)
                .open(path)
                .unwrap(),
            "{name}"
        )
        .unwrap();
    }
}
async fn database_pause() {
    event("database-pause");
    let release = format!("{}.release", std::env::var("WORKFLOW_BODY_EVENTS").unwrap());
    while !std::path::Path::new(&release).exists() {
        tokio::time::sleep(std::time::Duration::from_millis(5)).await;
    }
}
#[tonic::async_trait]
impl generated::LedgerMethodsDatabaseHandler for Ledger {
    async fn create(
        &self,
        _: &mut proto::Ledger,
        _: proto::Empty,
    ) -> Result<proto::Empty, tonic::Status> {
        Ok(proto::Empty {})
    }
    async fn query_threshold(
        &self,
        state: &proto::Ledger,
        request: proto::Step,
    ) -> Result<proto::Ledger, generated::LedgerMethodsQueryThresholdError> {
        event("reader-threshold-invoked");
        if std::env::var("READER_RICH_FRAMEWORK_ERROR").as_deref() == Ok("1") {
            return Err(generated::LedgerMethodsQueryThresholdError::Grpc(
                reboot::declared_error_status(
                    tonic::Code::Unknown,
                    "declared-looking framework failure",
                    "type.googleapis.com/workflow.v1.BelowThreshold",
                    &proto::BelowThreshold {
                        required: request.amount,
                        observed: state.first,
                    },
                ),
            ));
        }
        if state.first < request.amount {
            return Err(generated::LedgerMethodsQueryThresholdError::BelowThreshold(
                proto::BelowThreshold {
                    required: request.amount,
                    observed: state.first,
                },
            ));
        }
        Ok(*state)
    }
    async fn query(
        &self,
        state: &proto::Ledger,
        _: proto::Empty,
    ) -> Result<proto::Ledger, tonic::Status> {
        Ok(*state)
    }
    async fn first(
        &self,
        state: &mut proto::Ledger,
        request: proto::Step,
    ) -> Result<proto::Value, tonic::Status> {
        event("first-handler");
        state.first += request.amount;
        Ok(proto::Value { value: state.first })
    }
    async fn second(
        &self,
        state: &mut proto::Ledger,
        request: proto::Step,
    ) -> Result<proto::Value, tonic::Status> {
        event("second-handler");
        state.second += request.amount;
        Ok(proto::Value {
            value: state.second,
        })
    }
    async fn schedule_work(
        &self,
        _: &mut proto::Ledger,
        _: proto::Schedule,
    ) -> Result<proto::Handle, tonic::Status> {
        Err(tonic::Status::failed_precondition("use scheduling writer"))
    }
    async fn schedule_work_scheduled(
        &self,
        state: &mut proto::Ledger,
        request: proto::Schedule,
        state_ref: String,
    ) -> Result<TransactionExecution<proto::Handle>, tonic::Status> {
        let timestamp = (request.not_before != 0).then_some(prost_types::Timestamp {
            seconds: request.not_before,
            nanos: 0,
        });
        let task = generated::LedgerMethodsTasks::run(
            &state_ref,
            &proto::Step {
                amount: request.amount,
            },
            timestamp,
        );
        let mut result = TransactionExecution::new(proto::Handle {
            id: task.task_id.as_ref().unwrap().task_uuid.clone(),
        });
        result.task_upserts.push(task);
        state.schedules += 1;
        Ok(result)
    }
    async fn run(
        &self,
        context: &WorkflowContext<'_>,
        request: proto::Step,
    ) -> Result<proto::Result, tonic::Status> {
        self.run_attempt(context, request)
            .await
            .map_err(|e| match e {
                reboot::one_shot_tasks::WorkflowBodyError::Failed(error) => error,
                reboot::one_shot_tasks::WorkflowBodyError::Declared(_) => {
                    tonic::Status::failed_precondition("fixture Run declares no business errors")
                }
                reboot::one_shot_tasks::WorkflowBodyError::RetryLocal(message) => {
                    tonic::Status::internal(message)
                }
            })
    }
    async fn run_attempt(
        &self,
        context: &WorkflowContext<'_>,
        request: proto::Step,
    ) -> Result<proto::Result, reboot::one_shot_tasks::WorkflowBodyError> {
        event("body");
        if std::env::var("WORKFLOW_BODY_MODE").as_deref() == Ok("reader-outcome") {
            let _ = generated::LedgerMethodsWorkflowSteps::first(
                context,
                Arc::new(self.clone()),
                "initial",
                proto::Step { amount: 1 },
            )
            .await?;
            let observed = match generated::LedgerMethodsWorkflowSteps::query_threshold_try_until(
                context,
                Arc::new(self.clone()),
                "threshold",
                &std::env::var("READER_CONDITION_VERSION")
                    .unwrap_or_else(|_| "threshold-required-two.v1".into()),
                proto::Step { amount: 2 },
                |_| {
                    event("reader-threshold-predicate");
                    true
                },
            )
            .await
            {
                Ok(value) => value.first,
                Err(generated::LedgerMethodsQueryThresholdError::BelowThreshold(error)) => {
                    event("reader-error-caught");
                    if std::env::var("READER_PAUSE_AFTER_ERROR").as_deref() == Ok("1") {
                        event("reader-error-parked");
                        std::future::pending::<()>().await;
                    }
                    error.observed
                }
                Err(generated::LedgerMethodsQueryThresholdError::Grpc(error)) => {
                    event("reader-framework-failed");
                    if std::env::var("READER_RICH_FRAMEWORK_ERROR").as_deref() == Ok("1") {
                        event("reader-rich-grpc-caught");
                        // Deliberately bad application code: runtime must reject
                        // false success after a caught framework operation.
                        return Ok(proto::Result {
                            first: 999,
                            second: 999,
                        });
                    }
                    return Err(error.into());
                }
            };
            let after = generated::LedgerMethodsWorkflowSteps::second(
                context,
                Arc::new(self.clone()),
                "reader-fallback",
                proto::Step { amount: 100 },
            )
            .await?;
            event("reader-fallback-ack");
            return Ok(proto::Result {
                first: observed,
                second: after.value,
            });
        }
        if std::env::var("WORKFLOW_BODY_MODE").as_deref() == Ok("decision") {
            let count = u64::try_from(request.amount)
                .map_err(|_| tonic::Status::invalid_argument("negative finite count"))?;
            if !(1..=3).contains(&count) {
                return Err(tonic::Status::invalid_argument(
                    "decision fixture count must be 1..=3",
                )
                .into());
            }
            let mut observed_first = 0;
            for index in 0..count {
                let iteration = context.iteration("decision", index, count)?;
                generated::LedgerMethodsWorkflowSteps::first(
                    &iteration,
                    Arc::new(self.clone()),
                    "effect",
                    proto::Step { amount: 1 },
                )
                .await?;
                let decision = generated::LedgerMethodsWorkflowSteps::query_decide(
                    &iteration,
                    Arc::new(self.clone()),
                    "control",
                    "break-first-at-least-two.v1",
                    proto::Empty {},
                    move |state| {
                        event(&format!("decision-evaluate-{index}"));
                        state.first >= 2
                    },
                )
                .await?;
                event(&format!("decision-{index}-ack"));
                match decision {
                    std::ops::ControlFlow::Continue(state) => {
                        observed_first = state.first;
                    }
                    std::ops::ControlFlow::Break(state) => {
                        observed_first = state.first;
                        event("decision-break");
                        if std::env::var("DECISION_PAUSE_AFTER_BREAK").as_deref() == Ok("1") {
                            event("decision-parked");
                            std::future::pending::<()>().await;
                        }
                        break;
                    }
                }
            }
            let after = generated::LedgerMethodsWorkflowSteps::second(
                context,
                Arc::new(self.clone()),
                "after-loop",
                proto::Step { amount: 100 },
            )
            .await?;
            event("after-loop-ack");
            return Ok(proto::Result {
                first: observed_first,
                second: after.value,
            });
        }
        if std::env::var("WORKFLOW_BODY_MODE").as_deref() == Ok("control") {
            let count = u64::try_from(request.amount)
                .map_err(|_| tonic::Status::invalid_argument("negative finite count"))?;
            if count > 3 {
                return Err(tonic::Status::invalid_argument(
                    "fixture accepts at most three iterations",
                )
                .into());
            }
            let mut result = proto::Result::default();
            for index in 0..count {
                let iteration = context.iteration("settle", index, count)?;
                event(&format!("waiting-{index}"));
                let observed = generated::LedgerMethodsWorkflowSteps::query_until(
                    &iteration,
                    Arc::new(self.clone()),
                    "gate",
                    "first-at-least-index-plus-one.v1",
                    proto::Empty {},
                    move |state| state.first >= (index + 1) as i64,
                )
                .await?;
                event(&format!("wait-{index}-ack"));
                if std::env::var("CONTROL_PAUSE_AFTER_WAIT").ok().as_deref()
                    == Some(&index.to_string())
                {
                    event("control-parked");
                    std::future::pending::<()>().await;
                }
                let effect = generated::LedgerMethodsWorkflowSteps::second(
                    &iteration,
                    Arc::new(self.clone()),
                    "effect",
                    proto::Step { amount: 1 },
                )
                .await?;
                event(&format!("effect-{index}-ack"));
                result = proto::Result {
                    first: observed.first,
                    second: effect.value,
                };
            }
            return Ok(result);
        }
        let attempt = self
            .attempts
            .fetch_add(1, std::sync::atomic::Ordering::AcqRel);
        let first = generated::LedgerMethodsWorkflowSteps::first(
            context,
            Arc::new(self.clone()),
            "first-effect",
            request,
        )
        .await?;
        if let Ok(mode) = std::env::var("WORKFLOW_BODY_MODE") {
            if mode == "load-failure" {
                database_pause().await;
                generated::LedgerMethodsWorkflowSteps::second(
                    context,
                    Arc::new(self.clone()),
                    "second-effect",
                    request,
                )
                .await?;
                panic!("Load unexpectedly succeeded against stopped native Database");
            }
            if mode == "finish-failure" {
                let second = generated::LedgerMethodsWorkflowSteps::second(
                    context,
                    Arc::new(self.clone()),
                    "second-effect",
                    request,
                )
                .await?;
                database_pause().await;
                return Ok(proto::Result {
                    first: first.value,
                    second: second.value,
                });
            }
            if mode == "cancel" {
                event("parked");
                std::future::pending::<()>().await;
            }
            if mode == "swallowed" {
                generated::LedgerMethodsWorkflowSteps::second(
                    context,
                    Arc::new(self.clone()),
                    "first-effect",
                    request,
                )
                .await
                .unwrap_err();
            }
            if mode == "dropped-step" {
                // Poll and drop a real named-step future whose callback parks
                // before Store. This must irreversibly fence body resumption.
                let step = context
                    .writer_step::<generated::LedgerDurableState, proto::Step, proto::Value, _>(
                        "parked-effect",
                        "workflow.v1.LedgerMethods.Second",
                        "type.googleapis.com/workflow.v1.Value",
                        request,
                        |_, _| Box::pin(std::future::pending()),
                    );
                tokio::pin!(step);
                tokio::select! { _ = &mut step => panic!("parked step returned"), _ = tokio::time::sleep(std::time::Duration::from_millis(20)) => {} }
            }
            if mode == "broken-pipe" {
                let error = tonic::Status::from(std::io::Error::new(
                    std::io::ErrorKind::BrokenPipe,
                    "actual tonic IO conversion",
                ));
                assert_eq!(error.code(), tonic::Code::Internal);
                return Err(error.into());
            }
            if mode == "transport" {
                return Err(tonic::Status::unavailable("body transport failure").into());
            }
            if mode == "always"
                || mode == "swallowed"
                || mode == "dropped-step"
                || (mode == "once" && attempt == 0)
            {
                event("body-failure");
                return Err(reboot::one_shot_tasks::WorkflowBodyError::RetryLocal(
                    "controlled local body failure".into(),
                ));
            }
            let second = generated::LedgerMethodsWorkflowSteps::second(
                context,
                Arc::new(self.clone()),
                "second-effect",
                request,
            )
            .await?;
            return Ok(proto::Result {
                first: first.value,
                second: second.value,
            });
        }
        let conflicting = generated::LedgerMethodsWorkflowSteps::second(
            context,
            Arc::new(self.clone()),
            "first-effect",
            request,
        )
        .await
        .unwrap_err();
        assert_eq!(conflicting.code(), tonic::Code::FailedPrecondition);
        let changed = generated::LedgerMethodsWorkflowSteps::first(
            context,
            Arc::new(self.clone()),
            "first-effect",
            proto::Step {
                amount: request.amount + 1,
            },
        )
        .await
        .unwrap_err();
        assert_eq!(changed.code(), tonic::Code::FailedPrecondition);
        let missing = generated::LedgerMethodsWorkflowSteps::first(
            context,
            Arc::new(self.clone()),
            "",
            request,
        )
        .await
        .unwrap_err();
        assert_eq!(missing.code(), tonic::Code::InvalidArgument);
        if let Ok(marker) = std::env::var("WORKFLOW_FIRST_ACK") {
            std::fs::write(
                &marker,
                b"first named step acknowledged; no actor lease held",
            )
            .map_err(|e| tonic::Status::internal(e.to_string()))?;
            while !std::path::Path::new(&format!("{marker}.release")).exists() {
                tokio::time::sleep(std::time::Duration::from_millis(10)).await;
            }
        }
        let second = generated::LedgerMethodsWorkflowSteps::second(
            context,
            Arc::new(self.clone()),
            "second-effect",
            request,
        )
        .await?;
        Ok(proto::Result {
            first: first.value,
            second: second.value,
        })
    }
}
fn arg(index: usize) -> String {
    std::env::args().nth(index).unwrap()
}
fn reference() -> String {
    reboot::state_ref::StateRef::from_id("workflow.v1.Ledger", "ledger")
        .unwrap()
        .to_string()
}
fn request<T>(body: T, key: Option<&str>) -> tonic::Request<T> {
    let mut r = tonic::Request::new(body);
    r.metadata_mut()
        .insert("x-reboot-state-ref", reference().parse().unwrap());
    if let Some(key) = key {
        r.metadata_mut()
            .insert("x-reboot-idempotency-key", key.parse().unwrap());
    }
    r
}
fn plan(port: u16) -> reboot::legacy_placement::PlanOnlyLegacyPlacement {
    use reboot::placement_proto as p;
    let plan = reboot::legacy_placement::PlanOnlyLegacyPlacement::new();
    plan.install(p::ListenForPlanResponse {
        plan: Some(p::Plan {
            version: 1,
            applications: vec![p::plan::Application {
                id: "workflow-app".into(),
                services: vec![
                    p::plan::application::Service {
                        full_name: "workflow.v1.LedgerMethods".into(),
                        state_type_full_name: "workflow.v1.Ledger".into(),
                    },
                    p::plan::application::Service {
                        full_name: "rbt.v1alpha1.Tasks".into(),
                        state_type_full_name: "workflow.v1.Ledger".into(),
                    },
                ],
                shards: vec![p::plan::application::Shard {
                    id: "s000000000".into(),
                    range: Some(p::plan::application::shard::KeyRange { first_key: vec![] }),
                    server_id: "server".into(),
                    replica_index: 0,
                }],
            }],
        }),
        servers: vec![p::Server {
            id: "server".into(),
            application_id: "workflow-app".into(),
            address: Some(p::server::Address {
                host: "127.0.0.1".into(),
                port: i32::from(port),
            }),
            ..Default::default()
        }],
    })
    .unwrap();
    plan
}
#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let mode = arg(1);
    if mode == "info" {
        std::fs::write(
            arg(2),
            db::ServerInfo {
                shard_infos: vec![db::ShardInfo {
                    shard_id: "s000000000".into(),
                    shard_first_key: vec![],
                }],
            }
            .encode_to_vec(),
        )?;
        return Ok(());
    }
    if mode == "serve" {
        let store = DatabaseActorStore::connect(arg(2)).await?;
        let address: std::net::SocketAddr = arg(3).parse()?;
        let (adapter, tasks) =
            generated::LedgerMethodsDatabaseAdapter::new(store, Ledger::default())
                .with_workflows(&reference())?;
        if let Ok(limit) = std::env::var("CONTROL_MAX_LIVE") {
            tasks.set_max_live_deliveries(limit.parse()?)?;
        }
        let wait = tasks.wait_service(
            reboot::legacy_placement::LegacyApplicationId::new("workflow-app")?,
            "server",
            plan(address.port()),
        );
        ApplicationHost::new("workflow-app")
            .with_host_recovery(tasks.recovery(db::RecoverRequest {
                state_tags_by_state_type: [("workflow.v1.Ledger".into(), "Ledger".into())].into(),
                shard_ids: vec!["s000000000".into()],
                skip_idempotent_mutations: true,
            }))
            .add_public_service(proto::ledger_methods_server::LedgerMethodsServer::new(
                adapter,
            ))
            .add_public_service(wait)
            .serve_with_shutdown(address, async {
                while !std::path::Path::new(&arg(4)).exists() {
                    tokio::time::sleep(std::time::Duration::from_millis(10)).await;
                }
            })
            .await?;
        return Ok(());
    }
    if mode == "inspect-state" {
        let mut c = db::database_client::DatabaseClient::connect(arg(2)).await?;
        let loaded = c
            .load(db::LoadRequest {
                actors: vec![db::Actor {
                    state_type: "workflow.v1.Ledger".into(),
                    state_ref: reference(),
                    state: None,
                }],
                task_ids: vec![],
            })
            .await?
            .into_inner();
        let actor = loaded.actors.first().ok_or("missing canonical actor")?;
        let state =
            proto::Ledger::decode(actor.state.as_deref().ok_or("missing canonical state")?)?;
        println!(
            "{{\"first\":{},\"second\":{},\"schedules\":{}}}",
            state.first, state.second, state.schedules
        );
        return Ok(());
    }
    if mode == "inspect" || mode == "inspect-control" || mode == "inspect-reader-outcome" {
        let mut c = db::database_client::DatabaseClient::connect(arg(2)).await?;
        let id = db::TaskId {
            state_type: "workflow.v1.Ledger".into(),
            state_ref: reference(),
            task_uuid: uuid::Uuid::parse_str(&arg(3))?.as_bytes().to_vec(),
        };
        let tasks = c
            .load(db::LoadRequest {
                actors: vec![],
                task_ids: vec![id.clone()],
            })
            .await?
            .into_inner()
            .tasks;
        let task = tasks.first().ok_or("missing canonical task")?;
        let mut stream = c
            .recover_idempotent_mutations(db::RecoverIdempotentMutationsRequest {
                state_type: id.state_type.clone(),
                state_ref: id.state_ref.clone(),
                idempotency_key: None,
                workflow_id: Some(id.task_uuid.clone()),
                workflow_iteration: if mode == "inspect-control" {
                    Some(arg(4).parse()?)
                } else {
                    None
                },
            })
            .await?
            .into_inner();
        let mut count = 0;
        let mut checkpoints = Vec::new();
        while let Some(batch) = stream.message().await? {
            for m in batch.idempotent_mutations {
                assert_eq!(m.workflow_id, Some(id.task_uuid.clone()));
                assert!(m.request_fingerprint.is_some());
                let any = prost_types::Any::decode(m.response.as_slice())?;
                if mode == "inspect-reader-outcome" {
                    assert_eq!(m.workflow_iteration, None);
                    checkpoints.push(format!(
                        "{{\"key\":\"{}\",\"type\":\"{}\",\"record\":\"{}\"}}",
                        uuid::Uuid::from_slice(&m.key)?,
                        any.type_url,
                        m.encode_to_vec()
                            .iter()
                            .map(|b| format!("{b:02x}"))
                            .collect::<String>()
                    ));
                } else if mode == "inspect-control" {
                    checkpoints.push(format!(
                        "{{\"iteration\":{},\"key\":\"{}\",\"type\":\"{}\"}}",
                        m.workflow_iteration.ok_or("missing iteration")?,
                        uuid::Uuid::from_slice(&m.key)?,
                        any.type_url
                    ));
                } else {
                    assert_eq!(m.workflow_iteration, None);
                    assert_eq!(any.type_url, "type.googleapis.com/workflow.v1.Value");
                }
                count += 1;
            }
        }
        if mode == "inspect-control" || mode == "inspect-reader-outcome" {
            checkpoints.sort();
            println!(
                "{{\"status\":{},\"has_terminal\":{},\"checkpoints\":[{}]}}",
                task.status,
                task.response_or_error.is_some(),
                checkpoints.join(",")
            );
            return Ok(());
        }
        println!(
            "{{\"status\":{},\"iteration\":{},\"step_mutations\":{},\"timestamp\":{}}}",
            task.status,
            task.iteration,
            count,
            task.timestamp.as_ref().map_or(0, |t| t.seconds)
        );
        return Ok(());
    }
    let channel = tonic::transport::Endpoint::from_shared(arg(2))?
        .connect()
        .await?;
    let mut client = proto::ledger_methods_client::LedgerMethodsClient::new(channel.clone());
    match mode.as_str() {
        "signal" => {
            let result = client
                .first(request(
                    proto::Step {
                        amount: arg(4).parse()?,
                    },
                    Some(&arg(3)),
                ))
                .await?
                .into_inner();
            println!("{}", result.value);
        }
        "create" => {
            client
                .create(request(proto::Empty {}, Some(&arg(3))))
                .await?;
            println!("created");
        }
        "schedule" => {
            let result = client
                .schedule_work(request(
                    proto::Schedule {
                        not_before: arg(4).parse()?,
                        amount: arg(5).parse()?,
                    },
                    Some(&arg(3)),
                ))
                .await?
                .into_inner();
            println!("{}", uuid::Uuid::from_slice(&result.id)?);
        }
        "read" => {
            let s = client
                .query(request(proto::Empty {}, None))
                .await?
                .into_inner();
            println!(
                "{{\"first\":{},\"second\":{},\"schedules\":{}}}",
                s.first, s.second, s.schedules
            );
        }
        "wait" => {
            let id = db::TaskId {
                state_type: "workflow.v1.Ledger".into(),
                state_ref: reference(),
                task_uuid: uuid::Uuid::parse_str(&arg(3))?.as_bytes().to_vec(),
            };
            let mut req = tonic::Request::new(id);
            req.set_timeout(std::time::Duration::from_secs(10));
            let r = generated::LedgerMethodsTasksWait::run(channel, req).await?;
            println!("{{\"first\":{},\"second\":{}}}", r.first, r.second);
        }
        "method-collision" => {
            let err = client
                .first(request(proto::Step { amount: 7 }, Some(&arg(3))))
                .await
                .unwrap_err();
            assert_eq!(err.code(), tonic::Code::FailedPrecondition);
            println!("collision denied");
        }
        "wrong-scope" => {
            let id = db::TaskId {
                state_type: "wrong.Scope".into(),
                state_ref: reference(),
                task_uuid: uuid::Uuid::new_v4().as_bytes().to_vec(),
            };
            let err = generated::LedgerMethodsTasksWait::run(channel, tonic::Request::new(id))
                .await
                .unwrap_err();
            assert_eq!(err.code(), tonic::Code::InvalidArgument);
            println!("wrong scope denied");
        }
        "direct" => {
            let err = client
                .run(request(proto::Step { amount: 7 }, None))
                .await
                .unwrap_err();
            assert_eq!(err.code(), tonic::Code::PermissionDenied);
            println!("denied");
        }
        _ => return Err("unknown mode".into()),
    }
    Ok(())
}
