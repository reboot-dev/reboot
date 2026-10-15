//! Transparent observing proxy: every RPC forwards to actual canonical Database.
//! No synthetic responses; held Prepare only parks an already successful real ACK.
use super::*;
#[derive(Clone)]
pub(super) struct ObservedDatabase { pub(super) client: db::database_client::DatabaseClient<tonic::transport::Channel>, pub(super) observations: Arc<Observations> }
#[tonic::async_trait]
impl db::database_server::Database for ObservedDatabase {
    async fn get_capabilities(&self, request: Request<db::DatabaseCapabilitiesRequest>) -> Result<Response<db::DatabaseCapabilitiesResponse>, Status> {
        let body = request.get_ref().clone();
        let result = self.client.clone().get_capabilities(request).await;
        self.observations.record("GetCapabilities", &body, &result);
        result
    }
    async fn colocated_range(&self, request: Request<db::ColocatedRangeRequest>) -> Result<Response<db::ColocatedRangeResponse>, Status> {
        let body = request.get_ref().clone();
        let result = self.client.clone().colocated_range(request).await;
        self.observations.record("ColocatedRange", &body, &result);
        result
    }
    async fn colocated_reverse_range(&self, request: Request<db::ColocatedReverseRangeRequest>) -> Result<Response<db::ColocatedReverseRangeResponse>, Status> {
        let body = request.get_ref().clone();
        let result = self.client.clone().colocated_reverse_range(request).await;
        self.observations.record("ColocatedReverseRange", &body, &result);
        result
    }
    async fn find(&self, request: Request<db::FindRequest>) -> Result<Response<db::FindResponse>, Status> {
        let body = request.get_ref().clone();
        let result = self.client.clone().find(request).await;
        self.observations.record("Find", &body, &result);
        result
    }
    async fn load(&self, request: Request<db::LoadRequest>) -> Result<Response<db::LoadResponse>, Status> {
        let body = request.get_ref().clone();
        let result = self.client.clone().load(request).await;
        self.observations.record("Load", &body, &result);
        result
    }
    type PreloadStream = tonic::Streaming<db::PreloadResponse>;
    async fn preload(&self, request: Request<db::PreloadRequest>) -> Result<Response<Self::PreloadStream>, Status> {
        let body = request.get_ref().clone();
        let result = self.client.clone().preload(request).await;
        self.observations.record_stream("Preload", &body, &result);
        result
    }
    async fn store(&self, request: Request<db::StoreRequest>) -> Result<Response<db::StoreResponse>, Status> {
        let body = request.get_ref().clone();
        let result = self.client.clone().store(request).await;
        self.observations.record("Store", &body, &result);
        result
    }
    async fn complete_task(&self, request: Request<db::CompleteTaskRequest>) -> Result<Response<db::CompleteTaskResponse>, Status> {
        let body = request.get_ref().clone();
        let result = self.client.clone().complete_task(request).await;
        self.observations.record("CompleteTask", &body, &result);
        result
    }
    async fn create_actor(&self, request: Request<db::CreateActorRequest>) -> Result<Response<db::CreateActorResponse>, Status> {
        let body = request.get_ref().clone();
        let result = self.client.clone().create_actor(request).await;
        self.observations.record("CreateActor", &body, &result);
        result
    }
    async fn create_actor_with_tasks(&self, request: Request<db::CreateActorRequest>) -> Result<Response<db::CreateActorResponse>, Status> {
        let body = request.get_ref().clone();
        let result = self.client.clone().create_actor_with_tasks(request).await;
        self.observations.record("CreateActorWithTasks", &body, &result);
        result
    }
    type RecoverStream = tonic::Streaming<db::RecoverResponse>;
    async fn recover(&self, request: Request<db::RecoverRequest>) -> Result<Response<Self::RecoverStream>, Status> {
        let body = request.get_ref().clone();
        let result = self.client.clone().recover(request).await;
        self.observations.record_stream("Recover", &body, &result);
        result
    }
    type RecoverIdempotentMutationsStream = tonic::Streaming<db::RecoverIdempotentMutationsResponse>;
    async fn recover_idempotent_mutations(&self, request: Request<db::RecoverIdempotentMutationsRequest>) -> Result<Response<Self::RecoverIdempotentMutationsStream>, Status> {
        let body = request.get_ref().clone();
        let result = self.client.clone().recover_idempotent_mutations(request).await;
        self.observations.record_stream("RecoverIdempotentMutations", &body, &result);
        result
    }
    async fn transaction_participant_prepare(&self, request: Request<db::TransactionParticipantPrepareRequest>) -> Result<Response<db::TransactionParticipantPrepareResponse>, Status> {
        let body = request.get_ref().clone();
        let result = self.client.clone().transaction_participant_prepare(request).await;
        self.observations.record("TransactionParticipantPrepare", &body, &result);
        if matches!(self.observations.case, Case::HeldPrepare | Case::LostPrepare) && body.state_ref == self.observations.child_ref && result.is_ok() {
            self.observations.native_prepare_ack.add_permits(1);
            self.observations.forward_prepare_ack.acquire().await.unwrap().forget();
        }
        result
    }
    async fn transaction_participant_commit(&self, request: Request<db::TransactionParticipantCommitRequest>) -> Result<Response<db::TransactionParticipantCommitResponse>, Status> {
        let body = request.get_ref().clone();
        let result = self.client.clone().transaction_participant_commit(request).await;
        self.observations.record("TransactionParticipantCommit", &body, &result);
        result
    }
    async fn transaction_participant_abort(&self, request: Request<db::TransactionParticipantAbortRequest>) -> Result<Response<db::TransactionParticipantAbortResponse>, Status> {
        let body = request.get_ref().clone();
        let result = self.client.clone().transaction_participant_abort(request).await;
        self.observations.record("TransactionParticipantAbort", &body, &result);
        result
    }
    async fn transaction_coordinator_prepared(&self, request: Request<db::TransactionCoordinatorPreparedRequest>) -> Result<Response<db::TransactionCoordinatorPreparedResponse>, Status> {
        let body = request.get_ref().clone();
        let result = self.client.clone().transaction_coordinator_prepared(request).await;
        self.observations.record("TransactionCoordinatorPrepared", &body, &result);
        result
    }
    async fn transaction_coordinator_prepare(&self, request: Request<db::TransactionCoordinatorPrepareRequest>) -> Result<Response<db::TransactionCoordinatorPrepareResponse>, Status> {
        let body = request.get_ref().clone();
        let result = self.client.clone().transaction_coordinator_prepare(request).await;
        self.observations.record("TransactionCoordinatorPrepare", &body, &result);
        result
    }
    async fn transaction_coordinator_cleanup(&self, request: Request<db::TransactionCoordinatorCleanupRequest>) -> Result<Response<db::TransactionCoordinatorCleanupResponse>, Status> {
        let body = request.get_ref().clone();
        let result = self.client.clone().transaction_coordinator_cleanup(request).await;
        self.observations.record("TransactionCoordinatorCleanup", &body, &result);
        result
    }
    async fn transaction_coordinator_decision_put(&self, request: Request<db::TransactionCoordinatorDecisionPutRequest>) -> Result<Response<db::TransactionCoordinatorDecisionPutResponse>, Status> {
        let body = request.get_ref().clone();
        let result = self.client.clone().transaction_coordinator_decision_put(request).await;
        self.observations.record("TransactionCoordinatorDecisionPut", &body, &result);
        result
    }
    async fn transaction_coordinator_decision_get(&self, request: Request<db::TransactionCoordinatorDecisionGetRequest>) -> Result<Response<db::TransactionCoordinatorDecisionGetResponse>, Status> {
        let body = request.get_ref().clone();
        let result = self.client.clone().transaction_coordinator_decision_get(request).await;
        self.observations.record("TransactionCoordinatorDecisionGet", &body, &result);
        result
    }
    async fn export(&self, request: Request<db::ExportRequest>) -> Result<Response<db::ExportResponse>, Status> {
        let body = request.get_ref().clone();
        let result = self.client.clone().export(request).await;
        self.observations.record("Export", &body, &result);
        result
    }
    type ExportStreamedStream = tonic::Streaming<db::ExportResponse>;
    async fn export_streamed(&self, request: Request<db::ExportRequest>) -> Result<Response<Self::ExportStreamedStream>, Status> {
        let body = request.get_ref().clone();
        let result = self.client.clone().export_streamed(request).await;
        self.observations.record_stream("ExportStreamed", &body, &result);
        result
    }
    async fn get_application_metadata(&self, request: Request<db::GetApplicationMetadataRequest>) -> Result<Response<db::GetApplicationMetadataResponse>, Status> {
        let body = *request.get_ref();
        let result = self.client.clone().get_application_metadata(request).await;
        self.observations.record("GetApplicationMetadata", &body, &result);
        result
    }
    async fn store_application_metadata(&self, request: Request<db::StoreApplicationMetadataRequest>) -> Result<Response<db::StoreApplicationMetadataResponse>, Status> {
        let body = request.get_ref().clone();
        let result = self.client.clone().store_application_metadata(request).await;
        self.observations.record("StoreApplicationMetadata", &body, &result);
        result
    }
    async fn refresh_timestamp(&self, request: Request<db::RefreshTimestampRequest>) -> Result<Response<db::RefreshTimestampResponse>, Status> {
        let body = *request.get_ref();
        let result = self.client.clone().refresh_timestamp(request).await;
        self.observations.record("RefreshTimestamp", &body, &result);
        result
    }
}
