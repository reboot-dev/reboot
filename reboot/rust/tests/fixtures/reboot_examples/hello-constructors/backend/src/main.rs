use prost::Message;
use reboot::{application_host::ApplicationHost, runtime::DatabaseActorStore};
use upstream_hello_constructors::{Hello, generated, proto};
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
    let endpoint = std::env::var("RBT_RUST_DATABASE_URL")?;
    let address = std::env::var("RBT_RUST_LISTEN_ADDR")?.parse()?;
    let adapter = generated::HelloMethodsDatabaseAdapter::new(
        DatabaseActorStore::connect(endpoint).await?,
        Hello,
    )
    .with_authorization(
        if std::env::var("RBT_RUST_UNAUTHORIZED_DEVELOPMENT").as_deref() == Ok("1") {
            reboot::auth::AuthorizationPolicy::permissive_for_development()
        } else {
            reboot::auth::AuthorizationPolicy::default()
        },
    );
    ApplicationHost::new(
        std::env::var("RBT_NAME").unwrap_or_else(|_| "upstream_hello_constructors".into()),
    )
    .add_public_service(proto::hello_methods_server::HelloMethodsServer::new(
        adapter,
    ))
    .serve_with_shutdown(address, shutdown())
    .await?;
    Ok(())
}
