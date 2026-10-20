// Included in one_shot_tasks. Generated typed references are the public facade.
pub struct WorkflowSpawnMethod {
    pub state_type: &'static str,
    pub method: &'static str,
    pub response_type: &'static str,
    pub errors: Vec<DeclaredTaskError>,
}
impl WorkflowContext<'_> {
    /// Wait through the canonical authorized Tasks service; only a validated
    /// durable declared terminal permits the workflow to catch and continue.
    #[doc(hidden)]
    pub async fn wait_spawned<R: prost::Message + Default + Send>(
        &self,
        channel: tonic::transport::Channel,
        target: &WorkflowWriterTarget,
        id: db::TaskId,
        descriptor: WorkflowWriterMethod,
    ) -> Result<R, Status> {
        let operation = self.attempt.operation();
        self.validate_scope().await?;
        if id.state_type != target.actor.state_type()
            || id.state_ref != target.actor.state_ref().as_str()
        {
            return Err(Status::invalid_argument("spawned Wait target mismatch"));
        }
        let mut request = tonic::Request::new(db::WaitRequest { task_id: Some(id) });
        let mut headers = target.headers(uuid::Uuid::nil(), uuid::Uuid::nil(), None);
        headers.idempotency_key = None;
        headers.workflow_id = None;
        *request.metadata_mut() = headers
            .to_metadata()
            .map_err(|e| Status::invalid_argument(e.to_string()))?;
        request.metadata_mut().insert(
            "x-reboot-task-method",
            descriptor
                .method
                .parse()
                .map_err(|_| Status::invalid_argument("invalid task method"))?,
        );
        let mut client = db::tasks_client::TasksClient::new(channel);
        let terminal = tokio::select! {
            biased;
            _ = self.cancel.cancelled() => return Err(Status::cancelled("spawned Wait cancelled")),
            terminal = client.wait(request) => terminal?.into_inner(),
        };
        self.validate_scope().await?;
        match terminal
            .response_or_error
            .and_then(|value| value.response_or_error)
        {
            Some(db::task_response_or_error::ResponseOrError::Response(response))
                if response.type_url == descriptor.response_type =>
            {
                let result = R::decode(response.value.as_slice())
                    .map_err(|_| Status::data_loss("malformed spawned result"))?;
                operation.acknowledged();
                Ok(result)
            }
            Some(db::task_response_or_error::ResponseOrError::Error(error)) => {
                if task_cancellation_status(&error)?.is_some() {
                    return Err(task_cancellation_status(&error)?.expect("validated cancellation"));
                }
                let rich = googleapis_tonic_google_rpc::google::rpc::Status::decode(
                    error.value.as_slice(),
                )
                .map_err(|_| Status::data_loss("malformed spawned error"))?;
                if error.type_url != "type.googleapis.com/google.rpc.Status" || rich.code == 0 {
                    return Err(Status::data_loss("invalid spawned error envelope"));
                }
                let status = Status::with_details(
                    tonic::Code::from_i32(rich.code),
                    rich.message,
                    error.value.into(),
                );
                DeclaredTaskError::validate_status(&descriptor.errors, &status)?;
                operation.acknowledged();
                Err(status)
            }
            _ => Err(Status::data_loss("wrong spawned terminal")),
        }
    }
    #[doc(hidden)]
    pub async fn spawn_workflow<Q: prost::Message + Send>(
        &self,
        channel: tonic::transport::Channel,
        target: &WorkflowWriterTarget,
        alias: &str,
        descriptor: WorkflowSpawnMethod,
        request: Q,
        timestamp: Option<prost_types::Timestamp>,
    ) -> Result<db::TaskId, Status> {
        let expected_type = target.actor.state_type().to_owned();
        let expected_ref = target.actor.state_ref().as_str().to_owned();
        self.invoke_writer(target, alias, WorkflowWriterMethod {
            state_type: descriptor.state_type,
            method: descriptor.method,
            response_type: "type.googleapis.com/rbt.v1alpha1.TaskId",
            errors: vec![],
        }, crate::workflow_spawn_proto::SpawnRequest {
            method: descriptor.method.into(), request: request.encode_to_vec(), timestamp,
            response_type: descriptor.response_type.into(),
            errors: descriptor.errors.iter().map(|error|error.type_url.to_owned()).collect(),
        }, move |outbound: tonic::Request<crate::workflow_spawn_proto::SpawnRequest>| async move {
            let key = crate::RebootHeaders::from_request(&outbound)
                .map_err(|e| Status::invalid_argument(e.to_string()))?.idempotency_key
                .ok_or_else(|| Status::internal("missing generated spawn key"))?;
            let response = crate::workflow_spawn_proto::workflow_spawner_client::WorkflowSpawnerClient::new(channel).spawn(outbound).await?;
            let id = response.get_ref();
            if id.state_type != expected_type || id.state_ref != expected_ref || id.task_uuid != initializer_uuid("reboot.workflow-spawn.task.v1", &key.to_string()) {
                return Err(Status::data_loss("spawn response changed target task identity"));
            }
            Ok(response)
        }).await
    }
}
