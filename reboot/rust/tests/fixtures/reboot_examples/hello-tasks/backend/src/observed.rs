//! Acceptance-only observation: delegates unchanged to the shared faithful consumer.
use reboot::runtime::WriterExecution;
use std::io::Write;
use upstream_hello_tasks::{HelloTasks, generated::HelloMethodsDatabaseHandler, proto};
pub struct ObservedTasks;
// Explicit acceptance administration; never selected by production SDK defaults.
pub struct FixtureAdmin;
impl reboot::auth::TokenVerifier for FixtureAdmin {
    fn verify<'a>(
        &'a self,
        _: &'a reboot::auth::AuthorizationContext,
        _: Option<&'a str>,
    ) -> reboot::auth::VerifyFuture<'a> {
        Box::pin(async { reboot::auth::TokenVerification::NoOpinion })
    }
}
impl reboot::auth::Authorizer for FixtureAdmin {
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
fn record(label: &str) {
    if let Ok(path) = std::env::var("RBT_TEST_TASKS_INVOCATIONS") {
        let time = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let mut file = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(path)
            .unwrap();
        writeln!(file, "{label} {time}").unwrap();
        file.sync_all().unwrap();
    }
}
#[tonic::async_trait]
impl HelloMethodsDatabaseHandler for ObservedTasks {
    fn warning_local_precheck(
        &self,
        state: &proto::Hello,
        request: &proto::WarningRequest,
    ) -> Result<(), reboot::one_shot_tasks::LocalStateNotReady> {
        HelloTasks.warning_local_precheck(state, request)
    }
    fn erase_local_precheck(
        &self,
        state: &proto::Hello,
        request: &proto::EraseRequest,
    ) -> Result<(), reboot::one_shot_tasks::LocalStateNotReady> {
        HelloTasks.erase_local_precheck(state, request)
    }
    async fn messages(
        &self,
        state: &proto::Hello,
        request: proto::MessagesRequest,
    ) -> Result<proto::MessagesResponse, tonic::Status> {
        HelloTasks.messages(state, request).await
    }
    async fn send(
        &self,
        state: &mut proto::Hello,
        request: proto::SendRequest,
    ) -> Result<proto::SendResponse, tonic::Status> {
        HelloTasks.send(state, request).await
    }
    async fn warning(
        &self,
        state: &mut proto::Hello,
        request: proto::WarningRequest,
    ) -> Result<proto::WarningResponse, tonic::Status> {
        HelloTasks.warning(state, request).await
    }
    async fn send_with_tasks(
        &self,
        state: &mut proto::Hello,
        request: proto::SendRequest,
        reference: String,
    ) -> Result<WriterExecution<proto::SendResponse>, tonic::Status> {
        record("Send");
        HelloTasks.send_with_tasks(state, request, reference).await
    }
    async fn warning_with_tasks(
        &self,
        state: &mut proto::Hello,
        request: proto::WarningRequest,
        reference: String,
    ) -> Result<WriterExecution<proto::WarningResponse>, tonic::Status> {
        record("WarningBefore");
        let result = HelloTasks
            .warning_with_tasks(state, request, reference)
            .await;
        record("WarningAfter");
        result
    }
    async fn erase(
        &self,
        state: &mut proto::Hello,
        request: proto::EraseRequest,
    ) -> Result<proto::EraseResponse, tonic::Status> {
        record("Erase");
        HelloTasks.erase(state, request).await
    }
}
