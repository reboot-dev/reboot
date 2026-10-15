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
