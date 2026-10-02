use reboot_rust_schema::{proto, runtime::InMemoryHost};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let address = std::env::var("REBOOT_RUST_LISTEN_ADDR")
        .unwrap_or_else(|_| "127.0.0.1:50051".to_owned())
        .parse()?;
    tonic::transport::Server::builder()
        .add_service(proto::echo_methods_server::EchoMethodsServer::new(
            InMemoryHost::default(),
        ))
        .serve(address)
        .await?;
    Ok(())
}
