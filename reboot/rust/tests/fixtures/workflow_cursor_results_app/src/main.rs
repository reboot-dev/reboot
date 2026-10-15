use prost::Message;
use reboot::{
    application_host::ApplicationHost,
    database_proto as db,
    one_shot_tasks::WorkflowContext,
    runtime::{DatabaseActorStore, TransactionExecution},
};
use std::sync::Arc;
pub mod proto {
    tonic::include_proto!("cursor.v1");
}
pub mod generated {
    include!(concat!(env!("OUT_DIR"), "/cursor/v1/cursor.reboot.rs"));
}
include!("placement.rs");
#[derive(Clone)]
struct Source {
    endpoint: String,
}
#[derive(Clone)]
struct Destination;
fn event(name: &str) {
    use std::io::Write;
    static LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());
    let _lock = LOCK.lock().unwrap();
    if let Ok(path) = std::env::var("CURSOR_EVENTS") {
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
async fn barrier(name: &str, iteration: u64) {
    if std::env::var("CURSOR_PAUSE").as_deref() == Ok(name)
        && std::env::var("CURSOR_PAUSE_ITERATION")
            .ok()
            .and_then(|s| s.parse::<u64>().ok())
            .unwrap_or(0)
            == iteration
    {
        event(&format!("park:{name}:{iteration}"));
        let release = format!("{}.release", std::env::var("CURSOR_EVENTS").unwrap());
        while !std::path::Path::new(&release).exists() {
            tokio::time::sleep(std::time::Duration::from_millis(10)).await;
        }
    }
}
fn reference(state: &str) -> String {
    reboot::state_ref::StateRef::from_id(state, "proof")
        .unwrap()
        .to_string()
}
fn request<T>(body: T, state: &str, key: Option<&str>) -> tonic::Request<T> {
    let mut r = tonic::Request::new(body);
    r.metadata_mut()
        .insert("x-reboot-state-ref", reference(state).parse().unwrap());
    if let Some(k) = key {
        r.metadata_mut()
            .insert("x-reboot-idempotency-key", k.parse().unwrap());
    }
    r
}
#[tonic::async_trait]
impl generated::BMethodsDatabaseHandler for Destination {
    async fn create(
        &self,
        _: &mut proto::B,
        _: proto::Empty,
    ) -> Result<proto::Empty, tonic::Status> {
        Ok(proto::Empty {})
    }
    async fn read_state(&self, s: &proto::B, _: proto::Empty) -> Result<proto::B, tonic::Status> {
        Ok(*s)
    }
    async fn effect(
        &self,
        s: &mut proto::B,
        r: proto::EffectRequest,
    ) -> Result<proto::EffectReply, tonic::Status> {
        event(&format!("b-dispatch:{}", r.iteration));
        s.commits += 1;
        Ok(proto::EffectReply {
            ordinal: s.commits,
            iteration: r.iteration,
            proof: format!("committed:{}:{}", r.iteration, s.commits),
        })
    }
}
#[tonic::async_trait]
impl generated::AMethodsDatabaseHandler for Source {
    async fn create(
        &self,
        _: &mut proto::A,
        _: proto::Empty,
    ) -> Result<proto::Empty, tonic::Status> {
        Ok(proto::Empty {})
    }
    async fn read_state(&self, s: &proto::A, _: proto::Empty) -> Result<proto::A, tonic::Status> {
        Ok(*s)
    }
    async fn concurrent(
        &self,
        s: &mut proto::A,
        _: proto::Empty,
    ) -> Result<proto::Value, tonic::Status> {
        s.concurrent += 1;
        Ok(proto::Value {
            value: s.concurrent,
        })
    }
    async fn consume(
        &self,
        s: &mut proto::A,
        r: proto::EffectReply,
    ) -> Result<proto::Value, tonic::Status> {
        // The first run consumes iterations in order; cumulative ordinal also
        // covers a subsequent run without resetting either actor.
        if r.ordinal != s.consumed + 1
            || r.proof != format!("committed:{}:{}", r.iteration, r.ordinal)
        {
            return Err(tonic::Status::data_loss(
                "invalid typed payload at A consume boundary",
            ));
        }
        event(&format!("consume:{}", r.iteration));
        s.consumed += 1;
        Ok(proto::Value { value: s.consumed })
    }
    async fn after(
        &self,
        s: &mut proto::A,
        _: proto::Empty,
    ) -> Result<proto::Value, tonic::Status> {
        s.after += 1;
        event("after-dispatch");
        Ok(proto::Value { value: s.after })
    }
    async fn start_run(
        &self,
        _: &mut proto::A,
        _: proto::RunRequest,
    ) -> Result<proto::Handle, tonic::Status> {
        Err(tonic::Status::failed_precondition(
            "use generated scheduled entry",
        ))
    }
    async fn start_run_scheduled(
        &self,
        _: &mut proto::A,
        r: proto::RunRequest,
        state_ref: String,
    ) -> Result<TransactionExecution<proto::Handle>, tonic::Status> {
        if r.iterations == 0 {
            return Err(tonic::Status::invalid_argument(
                "iterations must be positive",
            ));
        }
        let task = generated::AMethodsTasks::run(&state_ref, &r, None);
        let mut out = TransactionExecution::new(proto::Handle {
            id: task.task_id.as_ref().unwrap().task_uuid.clone(),
        });
        out.task_upserts.push(task);
        Ok(out)
    }
    // Fixed concrete-type selection, captured once by generated with_workflows.
    fn workflow_cursor_run() -> Option<(&'static str, u32)> {
        Some(("cursor-proof", 1))
    }

    // Required shared finite entry must never execute this cursor-only body.
    async fn run(
        &self,
        _: &WorkflowContext<'_>,
        _: proto::RunRequest,
    ) -> Result<proto::Result, tonic::Status> {
        Err(tonic::Status::failed_precondition(
            "cursor-only workflow requires generated cursor dispatch; finite fallback forbidden",
        ))
    }

    async fn run_cursor_attempt(
        &self,
        context: &mut WorkflowContext<'_>,
        r: proto::RunRequest,
    ) -> Result<proto::Result, reboot::one_shot_tasks::WorkflowBodyError> {
        let endpoint = self.endpoint.clone();
        let handler = Arc::new(self.clone());
        let result = context
            .run_loop(
                "cursor-proof",
                1,
                "type.googleapis.com/cursor.v1.Result",
                move |scope| {
                    let endpoint = endpoint.clone();
                    let handler = handler.clone();
                    Box::pin(async move {
                        let i = scope.task().iteration;
                        event(&format!("iteration:{i}"));
                        barrier("entry", i).await; // prior Continue already synchronously acknowledged.
                        let effect = proto::EffectRequest { iteration: i };
                        let contract = proto::CallContract {
                            state_type: "cursor.v1.B".into(),
                            state_ref: reference("cursor.v1.B"),
                            method: "cursor.v1.BMethods.Effect".into(),
                            request: effect.encode_to_vec(),
                        }
                        .encode_to_vec();
                        let reply: proto::EffectReply = scope
                            .at_most_once_result(
                                "b-effect",
                                1,
                                "type.googleapis.com/cursor.v1.EffectReply",
                                &contract,
                                move || {
                                    event(&format!("callback-constructed:{i}"));
                                    async move {
                                        let mut client =
                                            proto::b_methods_client::BMethodsClient::connect(
                                                endpoint,
                                            )
                                            .await
                                            .map_err(
                                                |e| tonic::Status::unavailable(e.to_string()),
                                            )?;
                                        // Writers require transport idempotency metadata. Use a
                                        // fresh key per actual dispatch, never a stable effect/task
                                        // key: accidental redispatch must commit again, not dedupe.
                                        let dispatch_key = uuid::Uuid::new_v4().to_string();
                                        let reply = client
                                            .effect(request(
                                                effect,
                                                "cursor.v1.B",
                                                Some(&dispatch_key),
                                            ))
                                            .await?
                                            .into_inner();
                                        // Real writer response means B adapter has committed; inspect B canonically too.
                                        event(&format!("b-ack:{i}"));
                                        barrier("b-committed", i).await;
                                        if std::env::var("CURSOR_FAIL_AFTER_B").as_deref()
                                            == Ok("1")
                                        {
                                            return Err(tonic::Status::unavailable(
                                                "fixture failure after actual B commit",
                                            ));
                                        }
                                        Ok(reply)
                                    }
                                },
                            )
                            .await?;
                        event(&format!("stored:{i}"));
                        barrier("stored", i).await;
                        if reply.iteration != i
                            || reply.proof != format!("committed:{i}:{}", reply.ordinal)
                        {
                            return Err(tonic::Status::data_loss(
                                "replayed EffectReply fields mismatch",
                            ));
                        }
                        generated::AMethodsWorkflowSteps::consume(
                            &scope,
                            handler,
                            "consume",
                            reply.clone(),
                        )
                        .await?;
                        if i + 1 >= r.iterations {
                            event(&format!("break-evaluate:{i}"));
                            Ok(std::ops::ControlFlow::Break(proto::Result {
                                cursor: i,
                                ordinal: reply.ordinal,
                                proof: reply.proof,
                            }))
                        } else {
                            Ok(std::ops::ControlFlow::Continue(()))
                        }
                    })
                },
            )
            .await?;
        event("break-ack");
        barrier("break", result.cursor).await;
        generated::AMethodsWorkflowSteps::after(
            context,
            Arc::new(self.clone()),
            "after",
            proto::Empty {},
        )
        .await?;
        Ok(result)
    }
}
fn arg(i: usize) -> String {
    std::env::args().nth(i).unwrap()
}
#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let mode = std::env::args()
        .nth(1)
        .unwrap_or_else(|| "public-serve".into());
    if mode == "info" || mode == "--server-info" {
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
    if mode == "serve" || mode == "public-serve" {
        let public = mode == "public-serve";
        let database = if public {
            std::env::var("RBT_RUST_DATABASE_URL")?
        } else {
            arg(2)
        };
        let address: std::net::SocketAddr = if public {
            std::env::var("RBT_RUST_LISTEN_ADDR")?
        } else {
            arg(3)
        }
        .parse()?;
        let store = DatabaseActorStore::connect(database).await?;
        let policy = reboot::auth::AuthorizationPolicy::permissive_for_development();
        let (a, tasks) = generated::AMethodsDatabaseAdapter::new(
            store.clone(),
            Source {
                endpoint: format!("http://{address}"),
            },
        )
        .with_authorization(policy.clone())
        .with_workflows(&reference("cursor.v1.A"))?;
        // Generated registration captures Source::workflow_cursor_run() once;
        // the cursor-only shared entry above fails closed if finite dispatch occurs.
        let b = generated::BMethodsDatabaseAdapter::new(store, Destination)
            .with_authorization(policy.clone());
        let wait = tasks.wait_service_with_policy(
            reboot::legacy_placement::LegacyApplicationId::new("cursor-app")?,
            "server",
            plan(address.port()),
            policy,
        );
        ApplicationHost::new("cursor-app")
            .with_host_recovery(
                tasks.recovery(db::RecoverRequest {
                    state_tags_by_state_type: [
                        ("cursor.v1.A".into(), "A".into()),
                        ("cursor.v1.B".into(), "B".into()),
                    ]
                    .into(),
                    shard_ids: vec!["s000000000".into()],
                    skip_idempotent_mutations: true,
                }),
            )
            .add_public_service(proto::a_methods_server::AMethodsServer::new(a))
            .add_public_service(proto::b_methods_server::BMethodsServer::new(b))
            .add_public_service(wait)
            .serve_with_shutdown(address, async move {
                if public {
                    let mut term =
                        tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
                            .unwrap();
                    tokio::select! { _ = tokio::signal::ctrl_c() => {}, _ = term.recv() => {} }
                } else {
                    while !std::path::Path::new(&arg(4)).exists() {
                        tokio::time::sleep(std::time::Duration::from_millis(10)).await;
                    }
                }
            })
            .await?;
        return Ok(());
    }
    if mode == "inspect" {
        return inspect().await;
    }
    let channel = tonic::transport::Endpoint::from_shared(arg(2))?
        .connect()
        .await?;
    let mut a = proto::a_methods_client::AMethodsClient::new(channel.clone());
    let mut b = proto::b_methods_client::BMethodsClient::new(channel.clone());
    match mode.as_str() {
        "create" => {
            a.create(request(proto::Empty {}, "cursor.v1.A", Some(&arg(3))))
                .await?;
            b.create(request(proto::Empty {}, "cursor.v1.B", Some(&arg(4))))
                .await?;
        }
        "start-run" => {
            let h = a
                .start_run(request(
                    proto::RunRequest {
                        iterations: arg(4).parse()?,
                    },
                    "cursor.v1.A",
                    Some(&arg(3)),
                ))
                .await?
                .into_inner();
            println!("{}", uuid::Uuid::from_slice(&h.id)?);
        }
        "concurrent" => {
            println!(
                "{}",
                a.concurrent(request(proto::Empty {}, "cursor.v1.A", Some(&arg(3))))
                    .await?
                    .into_inner()
                    .value
            );
        }
        "read-state" => {
            let s = a
                .read_state(request(proto::Empty {}, "cursor.v1.A", None))
                .await?
                .into_inner();
            let t = b
                .read_state(request(proto::Empty {}, "cursor.v1.B", None))
                .await?
                .into_inner();
            println!(
                "{{\"consumed\":{},\"concurrent\":{},\"after\":{},\"commits\":{}}}",
                s.consumed, s.concurrent, s.after, t.commits
            );
        }
        "wait" => {
            let mut req = tonic::Request::new(db::TaskId {
                state_type: "cursor.v1.A".into(),
                state_ref: reference("cursor.v1.A"),
                task_uuid: uuid::Uuid::parse_str(&arg(3))?.as_bytes().to_vec(),
            });
            req.set_timeout(std::time::Duration::from_secs(3));
            let r = generated::AMethodsTasksWait::run(channel, req).await?;
            println!(
                "{{\"cursor\":{},\"ordinal\":{},\"proof\":\"{}\"}}",
                r.cursor, r.ordinal, r.proof
            );
        }
        _ => return Err("unknown mode".into()),
    };
    Ok(())
}
include!("inspect.rs");
