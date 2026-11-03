use reboot_rust_schema::{
    proto,
    runtime::{EchoMethodsAdapter, FileBackedHost, InMemoryHost},
};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let address = std::env::var("REBOOT_RUST_LISTEN_ADDR")
        .unwrap_or_else(|_| "127.0.0.1:50051".to_owned())
        .parse()?;
    // Legacy Echo is denied unless the operator explicitly opts into isolated development.
    let authorization = if std::env::var("RBT_RUST_UNAUTHORIZED_DEVELOPMENT").as_deref() == Ok("1")
    {
        reboot_rust_schema::auth::AuthorizationPolicy::permissive_for_development()
    } else {
        reboot_rust_schema::auth::AuthorizationPolicy::default()
    };
    if let Some(database_endpoint) = std::env::var_os("REBOOT_RUST_DATABASE_ENDPOINT") {
        let host = EchoMethodsAdapter::connect(database_endpoint.to_string_lossy())
            .await?
            .with_authorization(authorization);
        tonic::transport::Server::builder()
            .add_service(proto::echo_methods_server::EchoMethodsServer::new(host))
            .serve(address)
            .await?;
    } else if let Some(state_dir) = std::env::var_os("REBOOT_RUST_STATE_DIR") {
        let host = FileBackedHost::open(state_dir)?.with_authorization(authorization);
        tonic::transport::Server::builder()
            .add_service(proto::echo_methods_server::EchoMethodsServer::new(host))
            .serve(address)
            .await?;
    } else {
        tonic::transport::Server::builder()
            .add_service(proto::echo_methods_server::EchoMethodsServer::new(
                InMemoryHost::default().with_authorization(authorization),
            ))
            .serve(address)
            .await?;
    }
    Ok(())
}
