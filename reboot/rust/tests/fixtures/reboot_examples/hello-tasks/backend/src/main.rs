use prost::Message;
use reboot::{database_proto as db, runtime::DatabaseActorStore};
const STATE: &str = "hello_tasks.v1.Hello";
use upstream_hello_tasks::{generated, proto};
mod observed;
use observed::ObservedTasks;
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
    let reference =
        reboot::state_ref::StateRef::from_id("hello_tasks.v1.Hello", "hello-tasks")?.to_string();
    use reboot::placement_proto as p;
    let listener = tokio::net::TcpListener::bind(std::env::var("RBT_RUST_LISTEN_ADDR")?).await?;
    let port = listener.local_addr().unwrap().port();
    let store = DatabaseActorStore::connect(std::env::var("RBT_RUST_DATABASE_URL")?).await?;
    let policy = if std::env::var("RBT_RUST_UNAUTHORIZED_DEVELOPMENT").as_deref() == Ok("1") {
        reboot::auth::AuthorizationPolicy::permissive_for_development()
    } else {
        reboot::auth::AuthorizationPolicy::default()
    };
    let adapter = generated::HelloMethodsDatabaseAdapter::new(store, ObservedTasks)
        .with_authorization(policy.clone());
    let (adapter, tasks) = adapter.with_one_shot_writer_tasks(&reference).unwrap();
    let placement = reboot::legacy_placement::PlanOnlyLegacyPlacement::new();
    placement
        .install(p::ListenForPlanResponse {
            plan: Some(p::Plan {
                version: 1,
                applications: vec![p::plan::Application {
                    id: "hello-tasks".into(),
                    services: vec![
                        p::plan::application::Service {
                            full_name: "hello_tasks.v1.HelloMethods".into(),
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
                        server_id: "hello-server".into(),
                        replica_index: 0,
                    }],
                }],
            }),
            servers: vec![p::Server {
                id: "hello-server".into(),
                application_id: "hello-tasks".into(),
                address: Some(p::server::Address {
                    host: "127.0.0.1".into(),
                    port: port.into(),
                }),
                ..Default::default()
            }],
        })
        .unwrap();
    let wait = tasks.wait_service_with_policy(
        reboot::legacy_placement::LegacyApplicationId::new("hello-tasks").unwrap(),
        "hello-server",
        placement.clone(),
        policy,
    );
    let host = reboot::application_host::ApplicationHost::new("hello-tasks")
        .with_legacy_placement_readiness(placement)
        .with_host_recovery(tasks.recovery(db::RecoverRequest {
            state_tags_by_state_type: [("hello_tasks.v1.Hello".into(), "Hello".into())].into(),
            shard_ids: vec!["s000000000".into()],
            skip_idempotent_mutations: true,
        }))
        .add_public_service(proto::hello_methods_server::HelloMethodsServer::new(
            adapter,
        ))
        .add_public_service(wait);
    host.serve_with_listener_shutdown(listener, shutdown())
        .await?;
    Ok(())
}
