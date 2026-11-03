// Generated Tonic signatures intentionally retain tonic::Status.
#[allow(clippy::result_large_err)]
pub mod proto {
    tonic::include_proto!("hello_constructors.v1");
}
// Generated transport APIs intentionally retain tonic::Status; keep handwritten code linted.
#[allow(clippy::result_large_err)]
pub mod generated {
    include!(concat!(
        env!("OUT_DIR"),
        "/hello_constructors/v1/hello.reboot.rs"
    ));
}
pub struct Hello;
#[tonic::async_trait]
impl generated::HelloMethodsDatabaseHandler for Hello {
    async fn create(
        &self,
        state: &mut proto::Hello,
        request: proto::CreateRequest,
    ) -> Result<proto::CreateResponse, tonic::Status> {
        state.messages.push(request.initial_message);
        Ok(proto::CreateResponse {})
    }
    async fn send(
        &self,
        state: &mut proto::Hello,
        request: proto::SendRequest,
    ) -> Result<proto::SendResponse, tonic::Status> {
        state.messages.push(request.message);
        Ok(proto::SendResponse {})
    }
    async fn messages(
        &self,
        state: &proto::Hello,
        _: proto::MessagesRequest,
    ) -> Result<proto::MessagesResponse, tonic::Status> {
        Ok(proto::MessagesResponse {
            messages: state.messages.clone(),
        })
    }
}

pub mod startup;

/// The upstream application explicitly returns allow(), without a verifier.
/// Keep this app policy separate from the SDK's fail-closed default.
struct Allow;
impl reboot::auth::Authorizer for Allow {
    fn authorize<'a>(
        &'a self,
        _: &'a reboot::auth::AuthorizationContext,
        _: Option<&'a reboot::auth::Auth>,
        _: Option<&'a [u8]>,
        _: &'a [u8],
    ) -> reboot::auth::AuthorizeFuture<'a> {
        Box::pin(async { reboot::auth::AuthorizationDecision::Allow })
    }
}
pub fn authorization() -> reboot::auth::AuthorizationPolicy {
    reboot::auth::AuthorizationPolicy::new(None, Some(std::sync::Arc::new(Allow)))
}
