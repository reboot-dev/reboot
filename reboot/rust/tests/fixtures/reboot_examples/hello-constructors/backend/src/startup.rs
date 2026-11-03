//! Application-owned, taskless initialization through the generated durable adapter.
//! No raw handler calls, detached work, loopback connection or already-created fallback.
use std::sync::Arc;

use reboot::{ExternalContext, application_host::ApplicationLifecycle};
use tonic::Status;
use uuid::Uuid;

use crate::{Hello, generated, proto};
use proto::hello_methods_server::HelloMethods;

pub const INITIAL_MESSAGES: [&str; 2] = [
    "Welcome! This message was sent by a constructor.",
    "This message was sent after construction!",
];
pub const INITIAL_ACTOR_ID: &str = "reboot-hello";

pub type Adapter = generated::HelloMethodsDatabaseAdapter<Hello>;

/// Keep RBT_NAME stable with retained storage. Changing the identity intentionally
/// creates different receipts and will fail closed on the existing constructor.
pub struct Startup<T: HelloMethods = Adapter> {
    adapter: Arc<T>,
    context: ExternalContext,
    keys: [Uuid; 2],
}

impl<T: HelloMethods> Startup<T> {
    pub fn new(adapter: Arc<T>, application: &str) -> Result<Self, Box<dyn std::error::Error>> {
        if application.is_empty() {
            return Err("application identity must not be empty".into());
        }
        let reference =
            reboot::state_ref::StateRef::from_id("hello_constructors.v1.Hello", INITIAL_ACTOR_ID)?;
        let mut headers = reboot::RebootHeaders::new(reference.to_string());
        headers.application_id = Some(application.to_owned());
        Ok(Self {
            adapter,
            context: ExternalContext::with_headers(headers),
            keys: initialization_keys(application),
        })
    }

    pub async fn run(&self) -> Result<Vec<String>, Status> {
        // Replaying Create is mandatory even after a partial boot. Only its own
        // durable receipt is success; a fresh AlreadyConstructed error is fatal.
        self.adapter
            .create(
                self.context
                    .writer_with_key(
                        proto::CreateRequest {
                            initial_message: INITIAL_MESSAGES[0].into(),
                        },
                        self.keys[0],
                    )
                    .map_err(|error| Status::invalid_argument(error.to_string()))?,
            )
            .await?;
        self.adapter
            .send(
                self.context
                    .writer_with_key(
                        proto::SendRequest {
                            message: INITIAL_MESSAGES[1].into(),
                        },
                        self.keys[1],
                    )
                    .map_err(|error| Status::invalid_argument(error.to_string()))?,
            )
            .await?;
        Ok(self
            .adapter
            .messages(
                self.context
                    .reader(proto::MessagesRequest {})
                    .map_err(|error| Status::invalid_argument(error.to_string()))?,
            )
            .await?
            .into_inner()
            .messages)
    }
}

/// UUIDv5 is nonexpiring in the SDK, and the two method names are distinct.
/// Domain/version, application and actor are all part of persisted identity.
/// This is app-local identity, not Python InitializeContext key interoperability.
pub fn initialization_keys(application: &str) -> [Uuid; 2] {
    let namespace = Uuid::new_v5(
        &Uuid::NAMESPACE_URL,
        b"reboot-examples/hello-constructors/initialize/v1",
    );
    let application = Uuid::new_v5(&namespace, application.as_bytes());
    let actor = Uuid::new_v5(&application, INITIAL_ACTOR_ID.as_bytes());
    [
        Uuid::new_v5(&actor, b"Create"),
        Uuid::new_v5(&actor, b"Send"),
    ]
}

#[tonic::async_trait]
impl<T: HelloMethods> ApplicationLifecycle for Startup<T> {
    async fn initialize(&self) -> Result<(), Status> {
        // Python run_application_initializer retries application failures, except
        // developer InputError. Our input validation occurs in new(); statuses
        // here are failed RPCs, not successful initialization. Keep the same
        // persisted keys on every attempt, including after ambiguous commits.
        // This future and its backoff belong to ApplicationHost: dropping it on
        // shutdown cancels both work and sleep; no detached task can survive.
        let mut ceiling_ms = 1_000u64;
        let mut delay_ms = 1_000u64;
        loop {
            match self.run().await {
                Ok(messages) => {
                    println!("After initialization, the Hello messages are: {messages:?}");
                    return Ok(());
                }
                Err(status) => {
                    eprintln!("Initialization failed; retrying in {delay_ms}ms: {status}");
                    tokio::time::sleep(std::time::Duration::from_millis(delay_ms)).await;
                    // Full jitter with Python's initial 1s and capped 30s bound.
                    delay_ms = (Uuid::new_v4().as_u128() % u128::from(ceiling_ms + 1)) as u64;
                    ceiling_ms = ceiling_ms.saturating_mul(2).min(30_000);
                }
            }
        }
    }
    async fn recover(&self) -> Result<(), Status> {
        Ok(())
    }
    async fn shutdown(&self) -> Result<(), Status> {
        Ok(())
    }
}
