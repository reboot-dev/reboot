use prost::Message;
use reboot::{application_host::ApplicationHost, runtime::DatabaseActorStore};
use std::sync::Arc;
use upstream_hello_constructors::{Hello, authorization, generated, proto, startup::Startup};
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
    let application =
        std::env::var("RBT_NAME").unwrap_or_else(|_| "upstream_hello_constructors".into());
    let adapter = Arc::new(
        generated::HelloMethodsDatabaseAdapter::new(
            DatabaseActorStore::connect(endpoint).await?,
            Hello,
        )
        .with_authorization(authorization()),
    );
    let startup = Startup::new(adapter.clone(), &application)?;
    ApplicationHost::new(application)
        .with_lifecycle(startup)
        .add_public_service(proto::hello_methods_server::HelloMethodsServer::from_arc(
            adapter,
        ))
        .serve_with_shutdown(address, shutdown())
        .await?;
    Ok(())
}
