use prost::Message;
use reboot::{database_proto as db, runtime::DatabaseActorStore};
const STATE: &str = "hello_legacy_grpc.v1.RebootGreeter";
use reboot::legacy_grpc::LegacyGrpcDirectory;
use std::sync::Arc;
use upstream_hello_legacy_grpc::{DEPRECATED, Deprecated, PROXY, Proxy, REBOOT, RebootGreeter};
use upstream_hello_legacy_grpc::{generated, proto};
async fn shutdown() {
    let mut term =
        tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate()).unwrap();
    tokio::select! { _ = tokio::signal::ctrl_c() => {}, _ = term.recv() => {} }
}
#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<_> = std::env::args().collect();
    if args.get(1).map(String::as_str) == Some("--server-info") {
        let path = std::path::Path::new(args.get(2).ok_or("missing server-info path")?);
        let info = reboot::database_proto::ServerInfo {
            shard_infos: vec![reboot::database_proto::ShardInfo {
                shard_id: "s000000000".into(),
                shard_first_key: vec![],
            }],
        };
        if path.exists() {
            if reboot::database_proto::ServerInfo::decode(std::fs::read(path)?.as_slice())? != info
            {
                return Err("incompatible server-info".into());
            }
        } else {
            std::fs::write(path, info.encode_to_vec())?;
        }
        return Ok(());
    }
    let reference = upstream_hello_legacy_grpc::actor()?;
    use reboot::placement_proto as p;
    let listener = tokio::net::TcpListener::bind(std::env::var("RBT_RUST_LISTEN_ADDR")?).await?;
    let port = listener.local_addr().unwrap().port();
    let store = DatabaseActorStore::connect(std::env::var("RBT_RUST_DATABASE_URL")?).await?;
    let policy = if std::env::var("RBT_RUST_UNAUTHORIZED_DEVELOPMENT").as_deref() == Ok("1") {
        reboot::auth::AuthorizationPolicy::permissive_for_development()
    } else {
        reboot::auth::AuthorizationPolicy::default()
    };
    let url = format!("http://127.0.0.1:{port}");
    let directory = Arc::new(LegacyGrpcDirectory::new([
        (DEPRECATED, url.clone()),
        (PROXY, url.clone()),
        (REBOOT, url),
    ])?);
    let adapter = generated::RebootGreeterMethodsDatabaseAdapter::new(
        store,
        RebootGreeter {
            directory: directory.clone(),
        },
    )
    .with_authorization(policy.clone());
    let (adapter, tasks) = adapter.with_workflows(&reference).unwrap();
    let placement = reboot::legacy_placement::PlanOnlyLegacyPlacement::new();
    placement
        .install(p::ListenForPlanResponse {
            plan: Some(p::Plan {
                version: 1,
                applications: vec![p::plan::Application {
                    id: "a0000000000".into(),
                    services: vec![
                        p::plan::application::Service {
                            full_name: DEPRECATED.into(),
                            state_type_full_name: String::new(),
                        },
                        p::plan::application::Service {
                            full_name: PROXY.into(),
                            state_type_full_name: String::new(),
                        },
                        p::plan::application::Service {
                            full_name: "hello_legacy_grpc.v1.RebootGreeterMethods".into(),
                            state_type_full_name: STATE.into(),
                        },
                        p::plan::application::Service {
                            full_name: "rbt.v1alpha1.Tasks".into(),
                            state_type_full_name: String::new(),
                        },
                    ],
                    shards: vec![p::plan::application::Shard {
                        id: "s000000000".into(),
                        range: Some(p::plan::application::shard::KeyRange { first_key: vec![] }),
                        server_id: "legacy-server".into(),
                        replica_index: 0,
                    }],
                }],
            }),
            servers: vec![p::Server {
                id: "legacy-server".into(),
                application_id: "a0000000000".into(),
                address: Some(p::server::Address {
                    host: "127.0.0.1".into(),
                    port: port.into(),
                }),
                ..Default::default()
            }],
        })
        .unwrap();
    let wait = reboot::database_proto::tasks_server::TasksServer::new(
        reboot::one_shot_tasks::ReaderTaskWaitService::new(
            [tasks.clone()],
            reboot::legacy_placement::LegacyApplicationId::new("a0000000000").unwrap(),
            "legacy-server",
            placement.clone(),
        )?
        .with_wait_policy(policy),
    );
    let host = reboot::application_host::ApplicationHost::new("a0000000000")
        .with_legacy_placement_readiness(placement)
        .with_host_recovery(
            tasks.recovery(db::RecoverRequest {
                state_tags_by_state_type: [(
                    "hello_legacy_grpc.v1.RebootGreeter".into(),
                    "RebootGreeter".into(),
                )]
                .into(),
                shard_ids: vec!["s000000000".into()],
                skip_idempotent_mutations: true,
            }),
        )
        .with_serving_initializer(
            "initialize-my-greeter-v1",
            tasks.clone(),
            |context| async move {
                let id =
                    generated::RebootGreeterMethodsTasksInitialize::initialize_spawn(&context, &())
                        .await?;
                println!(
                    "LEGACY_INITIALIZE_TASK {}",
                    uuid::Uuid::from_slice(&id.task_uuid)
                        .map_err(|e| tonic::Status::internal(e.to_string()))?
                );
                generated::RebootGreeterMethodsTasksInitialize::initialize_wait(&context, &id)
                    .await?;
                println!("LEGACY_INITIALIZE_COMPLETE");
                Ok(())
            },
        )?
        .add_public_service(
            proto::reboot_greeter_methods_server::RebootGreeterMethodsServer::new(adapter),
        )
        .add_public_service(
            proto::deprecated_greeter_server::DeprecatedGreeterServer::new(Deprecated),
        )
        .add_public_service(proto::proxy_greeter_server::ProxyGreeterServer::new(
            Proxy { directory },
        ))
        .add_public_service(wait);
    host.serve_with_listener_shutdown(listener, shutdown())
        .await?;
    Ok(())
}
