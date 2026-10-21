//! Rust-only port of the pinned hello-legacy-grpc sample.
use rand::Rng;
use reboot::legacy_grpc::{LegacyGrpcContext, LegacyGrpcDirectory};
use std::sync::Arc;
use tonic::{Request, Response, Status};
// Generated Tonic transport signatures retain tonic::Status, matching the SDK ABI policy.
#[allow(clippy::result_large_err)]
pub mod proto {
    tonic::include_proto!("hello_legacy_grpc.v1");
}
// Generated Reboot adapters retain the same tonic::Status transport contract.
#[allow(clippy::result_large_err)]
pub mod generated {
    include!(concat!(
        env!("OUT_DIR"),
        "/hello_legacy_grpc/v1/greeter.reboot.rs"
    ));
}
pub const STATE: &str = "hello_legacy_grpc.v1.RebootGreeter";
pub const DEPRECATED: &str = "hello_legacy_grpc.v1.DeprecatedGreeter";
pub const PROXY: &str = "hello_legacy_grpc.v1.ProxyGreeter";
pub const REBOOT: &str = "hello_legacy_grpc.v1.RebootGreeterMethods";
pub const SALUTATIONS: [&str; 5] = ["Hello", "Hi", "Ahoy there", "Greetings", "Bonjour"];
pub fn actor() -> Result<String, reboot::state_ref::StateRefError> {
    Ok(reboot::state_ref::StateRef::from_id(STATE, "my-greeter")?.to_string())
}
pub struct Deprecated;
#[tonic::async_trait]
impl proto::deprecated_greeter_server::DeprecatedGreeter for Deprecated {
    async fn get_salutation(
        &self,
        _: Request<()>,
    ) -> Result<Response<proto::GetSalutationResponse>, Status> {
        let i = rand::thread_rng().gen_range(0..SALUTATIONS.len());
        Ok(Response::new(proto::GetSalutationResponse {
            salutation: SALUTATIONS[i].into(),
        }))
    }
    async fn greet(
        &self,
        request: Request<proto::GreetRequest>,
    ) -> Result<Response<proto::GreetResponse>, Status> {
        let salutation = self
            .get_salutation(Request::new(()))
            .await?
            .into_inner()
            .salutation;
        Ok(Response::new(proto::GreetResponse {
            message: format!("{salutation}, {}!", request.into_inner().name),
        }))
    }
}
pub struct Proxy {
    pub directory: Arc<LegacyGrpcDirectory>,
}
#[tonic::async_trait]
impl proto::proxy_greeter_server::ProxyGreeter for Proxy {
    async fn greet(
        &self,
        request: Request<proto::GreetRequest>,
    ) -> Result<Response<proto::GreetResponse>, Status> {
        let context = LegacyGrpcContext::from_request(&request, self.directory.clone())?;
        let input = request.into_inner();
        let reboot_branch = rand::thread_rng().gen_bool(0.5);
        if reboot_branch {
            let external = context.external_context(
                "Call into `RebootGreeter`",
                actor().map_err(|e| Status::internal(e.to_string()))?,
            );
            let channel = context.legacy_grpc_channel(REBOOT).await?;
            let mut client = generated::RebootGreeterMethodsExternalClient::new(channel, external);
            let call = client.greet(input);
            match context.time_remaining() {
                Some(remaining) => tokio::time::timeout(remaining, call)
                    .await
                    .map_err(|_| Status::deadline_exceeded("proxy Reboot call deadline"))?,
                None => call.await,
            }
        } else {
            let channel = context.legacy_grpc_channel(DEPRECATED).await?;
            proto::deprecated_greeter_client::DeprecatedGreeterClient::new(channel)
                .greet(context.request(input)?)
                .await
        }
    }
}
pub struct RebootGreeter {
    pub directory: Arc<LegacyGrpcDirectory>,
}
impl RebootGreeter {
    // Preserve the tonic::Status error API used by the generated service handlers.
    #[allow(clippy::result_large_err)]
    async fn salutation(&self) -> Result<proto::GetSalutationResponse, Status> {
        let channel = self.directory.channel(DEPRECATED).await?;
        Ok(
            proto::deprecated_greeter_client::DeprecatedGreeterClient::new(channel)
                .get_salutation(())
                .await?
                .into_inner(),
        )
    }
}
#[tonic::async_trait]
impl generated::RebootGreeterMethodsDatabaseHandler for RebootGreeter {
    async fn initialize(
        &self,
        context: &reboot::one_shot_tasks::WorkflowContext<'_>,
        _: (),
    ) -> Result<(), Status> {
        let directory = self.directory.clone();
        #[cfg(feature = "native-test-support")]
        let task_uuid = uuid::Uuid::from_slice(
            &context
                .task()
                .task_id
                .as_ref()
                .ok_or_else(|| Status::internal("missing task identity"))?
                .task_uuid,
        )
        .map_err(|e| Status::internal(e.to_string()))?;
        context
            .at_most_once_unit("make greetings", 1, move || async move {
                println!("LEGACY_CALLBACK_ENTER");
                let channel = directory.channel(PROXY).await?;
                let mut client = proto::proxy_greeter_client::ProxyGreeterClient::new(channel);
                for i in 0..10 {
                    let result = client
                        .greet(proto::GreetRequest {
                            name: "legacy gRPC".into(),
                        })
                        .await?
                        .into_inner();
                    println!("LEGACY_GREETING {i} {}", result.message);
                    #[cfg(feature = "native-test-support")]
                    if std::env::var("RBT_TEST_LEGACY_PREFIX_COUNT")
                        .ok()
                        .and_then(|v| v.parse::<usize>().ok())
                        == Some(i + 1)
                        && let Ok(path) = std::env::var("RBT_TEST_LEGACY_PREFIX_MARKER")
                    {
                        // Observation-only barrier after real acknowledged RPCs.
                        // Default sample has no test-support hooks compiled in.
                        let path = std::path::PathBuf::from(path);
                        // Linux producer/observer share CLOCK_MONOTONIC, not discovery time.
                        if !cfg!(target_os = "linux") {
                            return Err(Status::internal("observation clock requires Linux"));
                        }
                        #[repr(C)]
                        struct Timespec { sec: std::ffi::c_long, nsec: std::ffi::c_long }
                        unsafe extern "C" { fn clock_gettime(clock: std::ffi::c_int, value: *mut Timespec) -> std::ffi::c_int; }
                        let mut stamp = Timespec { sec: 0, nsec: 0 };
                        if unsafe { clock_gettime(1, &mut stamp) } != 0 || stamp.sec < 0 || !(0..1_000_000_000).contains(&stamp.nsec) {
                            return Err(Status::internal("CLOCK_MONOTONIC unavailable"));
                        }
                        let ns = stamp.sec as u128 * 1_000_000_000 + stamp.nsec as u128;
                        let case = std::env::var("RBT_TEST_CRASH_CASE").map_err(|_| Status::internal("missing crash case identity"))?;
                        let pid = std::process::id();
                        if !case.chars().all(|c| c.is_ascii_alphanumeric() || c == '-') {
                            return Err(Status::internal("invalid crash case identity"));
                        }
                        let payload = format!("{{\"version\":1,\"clock\":\"CLOCK_MONOTONIC\",\"created_ns\":{ns},\"hook\":\"RBT_TEST_LEGACY_PREFIX_MARKER\",\"case\":\"{case}\",\"pid\":{pid},\"task_uuid\":\"{task_uuid}\"}}");
                        let creating = path.with_extension("creating");
                        std::fs::write(&creating, payload).map_err(|e| Status::internal(e.to_string()))?;
                        std::fs::rename(&creating, &path).map_err(|e| Status::internal(e.to_string()))?;
                        let release = path.with_extension("release");
                        tokio::time::timeout(std::time::Duration::from_secs(10), async {
                            while !release.exists() {
                                tokio::time::sleep(std::time::Duration::from_millis(10)).await;
                            }
                        })
                        .await
                        .map_err(|_| Status::deadline_exceeded("prefix observation timeout"))?;
                    }
                }
                Ok(())
            })
            .await
    }
    async fn greet(
        &self,
        state: &mut proto::RebootGreeter,
        request: proto::GreetRequest,
    ) -> Result<proto::GreetResponse, Status> {
        let salutation = self.salutation().await?.salutation;
        state.num_greetings += 1;
        let n = state.num_greetings;
        let people = if n == 1 { "person has" } else { "people have" };
        Ok(proto::GreetResponse {
            message: format!(
                "{salutation}, {}! {n} {people} been greeted today by the Reboot service.",
                request.name
            ),
        })
    }
    async fn get_salutation(
        &self,
        _: &proto::RebootGreeter,
        _: (),
    ) -> Result<proto::GetSalutationResponse, Status> {
        self.salutation().await
    }
}
