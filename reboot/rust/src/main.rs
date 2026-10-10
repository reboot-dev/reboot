use reboot_rust_schema::{
    proto,
    runtime::{EchoMethodsAdapter, FileBackedHost, InMemoryHost},
};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let address = std::env::var("REBOOT_RUST_LISTEN_ADDR")
        .unwrap_or_else(|_| "127.0.0.1:50051".to_owned())
        .parse()?;
    if let Some(database_endpoint) = std::env::var_os("REBOOT_RUST_DATABASE_ENDPOINT") {
        let host = EchoMethodsAdapter::connect(database_endpoint.to_string_lossy()).await?;
        tonic::transport::Server::builder()
            .add_service(proto::echo_methods_server::EchoMethodsServer::new(host))
            .serve(address)
            .await?;
    } else if let Some(state_dir) = std::env::var_os("REBOOT_RUST_STATE_DIR") {
        let host = FileBackedHost::open(state_dir)?;
        tonic::transport::Server::builder()
            .add_service(proto::echo_methods_server::EchoMethodsServer::new(host))
            .serve(address)
            .await?;
    } else {
        tonic::transport::Server::builder()
            .add_service(proto::echo_methods_server::EchoMethodsServer::new(
                InMemoryHost::default(),
            ))
            .serve(address)
            .await?;
    }
    Ok(())
}
