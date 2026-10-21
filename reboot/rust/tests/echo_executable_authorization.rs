#![cfg(feature = "test-support")]

use reboot_rust_schema::{ExternalContext, proto, runtime::test_support::start_database};
use std::{
    process::{Child, Command, Stdio},
    time::Duration,
};
use uuid::Uuid;

struct OwnedChild(Child);
impl Drop for OwnedChild {
    fn drop(&mut self) {
        let _ = self.0.kill();
        let _ = self.0.wait();
    }
}

#[tokio::test]
async fn executable_requires_exact_development_opt_in_on_every_echo_mount() {
    let (database_endpoint, _, database_server) = start_database().await;
    for mode in ["memory", "file", "database"] {
        for selector in [
            None,
            Some(""),
            Some("0"),
            Some("true"),
            Some(" 1"),
            Some("1"),
        ] {
            let directory = tempfile::tempdir().unwrap();
            let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
            let address = listener.local_addr().unwrap();
            drop(listener);
            let mut command = Command::new(env!("CARGO_BIN_EXE_reboot-rust-schema"));
            command
                .env("REBOOT_RUST_LISTEN_ADDR", address.to_string())
                .env_remove("REBOOT_RUST_DATABASE_ENDPOINT")
                .env_remove("REBOOT_RUST_STATE_DIR")
                .env_remove("RBT_RUST_UNAUTHORIZED_DEVELOPMENT")
                .stdout(Stdio::null())
                .stderr(Stdio::inherit());
            if let Some(value) = selector {
                command.env("RBT_RUST_UNAUTHORIZED_DEVELOPMENT", value);
            }
            match mode {
                "file" => {
                    command.env("REBOOT_RUST_STATE_DIR", directory.path());
                }
                "database" => {
                    command.env("REBOOT_RUST_DATABASE_ENDPOINT", &database_endpoint);
                }
                _ => {}
            }
            let mut child = OwnedChild(command.spawn().unwrap());
            let endpoint = format!("http://{address}");
            // Retry only connection establishment, never an RPC/effect.
            let mut client = tokio::time::timeout(Duration::from_secs(5), async {
                loop {
                    assert!(
                        child.0.try_wait().unwrap().is_none(),
                        "server exited: {mode}/{selector:?}"
                    );
                    if let Ok(client) =
                        proto::echo_methods_client::EchoMethodsClient::connect(endpoint.clone())
                            .await
                    {
                        break client;
                    }
                    tokio::time::sleep(Duration::from_millis(10)).await;
                }
            })
            .await
            .unwrap();
            let context = ExternalContext::new(format!("selector-{mode}-{}", Uuid::new_v4()));
            let write = client
                .reply(
                    context
                        .writer_with_key(
                            proto::Text {
                                content: "accepted".into(),
                            },
                            Uuid::new_v4(),
                        )
                        .unwrap(),
                )
                .await;
            let read = client
                .last_message(context.reader(proto::Empty {}).unwrap())
                .await;
            if selector == Some("1") {
                assert_eq!(write.unwrap().into_inner().content, "accepted");
                assert_eq!(read.unwrap().into_inner().content, "accepted");
            } else {
                assert_eq!(
                    write.unwrap_err().code(),
                    tonic::Code::PermissionDenied,
                    "{mode}/{selector:?}"
                );
                assert_eq!(
                    read.unwrap_err().code(),
                    tonic::Code::PermissionDenied,
                    "{mode}/{selector:?}"
                );
                if mode == "file" {
                    assert_eq!(std::fs::read_dir(directory.path()).unwrap().count(), 0);
                }
            }
            drop(child);
        }
    }
    database_server.abort();
    assert!(database_server.await.unwrap_err().is_cancelled());
}
