// Included in one_shot_tasks. Generated typed references are the public facade.
/// A generated method's immutable canonical TaskId, explicit destination and
/// terminal schema. A handle does not own or cancel its durable task on Drop.
/// `wait` uses the current dispatcher context, not a retained attempt/context.
pub struct WorkflowTask<R, E = Status> {
    channel: tonic::transport::Channel,
    target: WorkflowWriterTarget,
    id: db::TaskId,
    descriptor: WorkflowWriterMethod,
    error: fn(Status) -> E,
    response: std::marker::PhantomData<fn() -> R>,
}
impl<R, E> Clone for WorkflowTask<R, E> {
    fn clone(&self) -> Self {
        Self {
            channel: self.channel.clone(),
            target: self.target.clone(),
            id: self.id.clone(),
            descriptor: self.descriptor.clone(),
            error: self.error,
            response: std::marker::PhantomData,
        }
    }
}
impl<R: prost::Message + Default + Send, E> WorkflowTask<R, E> {
    #[doc(hidden)]
    pub fn retrieve(
        channel: tonic::transport::Channel,
        target: WorkflowWriterTarget,
        id: db::TaskId,
        descriptor: WorkflowWriterMethod,
        error: fn(Status) -> E,
    ) -> Result<Self, Status> {
        if id.state_type != target.actor.state_type()
            || id.state_ref != target.actor.state_ref().as_str()
            || descriptor.state_type != target.actor.state_type()
            || uuid::Uuid::from_slice(&id.task_uuid).map_or(true, |uuid| {
                uuid.get_version_num() != 4 || uuid.get_variant() != uuid::Variant::RFC4122
            })
        {
            return Err(Status::invalid_argument(
                "task handle target/identity mismatch",
            ));
        }
        Ok(Self {
            channel,
            target,
            id,
            descriptor,
            error,
            response: std::marker::PhantomData,
        })
    }
    pub fn task_id(&self) -> &db::TaskId {
        &self.id
    }
    pub async fn wait(&self, context: &WorkflowContext<'_>) -> Result<R, E> {
        context
            .wait_spawned(
                self.channel.clone(),
                &self.target,
                self.id.clone(),
                self.descriptor.clone(),
            )
            .await
            .map_err(self.error)
    }
    /// Await from outside a durable workflow. No framework attempt/journal is
    /// acknowledged; workflow bodies must use `wait(context)` instead.
    pub async fn wait_external(&self) -> Result<R, E> {
        async {
            let request =
                workflow_task_wait_request(&self.target, self.id.clone(), &self.descriptor)?;
            let terminal = db::tasks_client::TasksClient::new(self.channel.clone())
                .wait(request)
                .await?
                .into_inner();
            decode_workflow_task_terminal(terminal, &self.descriptor)?
        }
        .await
        .map_err(self.error)
    }
    /// Canonical, explicitly authorized administrative RPC. Not a journaled
    /// workflow operation: OK/NOT_FOUND/CANCELLING can differ on replay. This
    /// does not grant permission to catch transport failures in a workflow;
    /// await the durable terminal with `wait` before continuing instead.
    pub async fn cancel(&self) -> Result<db::cancel_task_response::Status, Status> {
        let mut request = tonic::Request::new(db::CancelTaskRequest {
            task_id: Some(self.id.clone()),
        });
        let mut headers = self
            .target
            .headers(uuid::Uuid::nil(), uuid::Uuid::nil(), None);
        headers.idempotency_key = None;
        headers.workflow_id = None;
        *request.metadata_mut() = headers
            .to_metadata()
            .map_err(|e| Status::invalid_argument(e.to_string()))?;
        let response = db::tasks_client::TasksClient::new(self.channel.clone())
            .cancel_task(request)
            .await?
            .into_inner();
        db::cancel_task_response::Status::try_from(response.status)
            .map_err(|_| Status::data_loss("invalid canonical cancellation status"))
    }
}

pub struct WorkflowSpawnMethod {
    pub state_type: &'static str,
    pub method: &'static str,
    pub response_type: &'static str,
    pub errors: Vec<DeclaredTaskError>,
}
fn workflow_task_wait_request(
    target: &WorkflowWriterTarget,
    id: db::TaskId,
    descriptor: &WorkflowWriterMethod,
) -> Result<tonic::Request<db::WaitRequest>, Status> {
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
    Ok(request)
}
// The outer Result is protocol/framework failure, the inner Result is a validated
// durable outcome. Only the latter may acknowledge a parent workflow operation.
fn decode_workflow_task_terminal<R: prost::Message + Default>(
    terminal: db::WaitResponse,
    descriptor: &WorkflowWriterMethod,
) -> Result<Result<R, Status>, Status> {
    match terminal
        .response_or_error
        .and_then(|value| value.response_or_error)
    {
        Some(db::task_response_or_error::ResponseOrError::Response(response))
            if response.type_url == descriptor.response_type =>
        {
            Ok(Ok(R::decode(response.value.as_slice()).map_err(|_| {
                Status::data_loss("malformed spawned result")
            })?))
        }
        Some(db::task_response_or_error::ResponseOrError::Error(error)) => {
            if let Some(cancelled) = task_cancellation_status(&error)? {
                return Ok(Err(cancelled));
            }
            let rich =
                googleapis_tonic_google_rpc::google::rpc::Status::decode(error.value.as_slice())
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
            Ok(Err(status))
        }
        _ => Err(Status::data_loss("wrong spawned terminal")),
    }
}
impl WorkflowContext<'_> {
    /// Canonical application-method admission. The source intent and target UUID
    /// deliberately match legacy absolute Spawn: transport migration must not
    /// mint a second child or rewrite an already acknowledged operation.
    #[doc(hidden)]
    pub async fn spawn_workflow_canonical<Q, R>(
        &self,
        channel: tonic::transport::Channel,
        target: &WorkflowWriterTarget,
        alias: &str,
        descriptor: WorkflowSpawnMethod,
        request: Q,
        timestamp: Option<prost_types::Timestamp>,
    ) -> Result<db::TaskId, Status>
    where
        Q: prost::Message + Default + Send + Sync + 'static,
        R: prost::Message + Default + Send + 'static,
    {
        let expected_type = target.actor.state_type().to_owned();
        let expected_ref = target.actor.state_ref().as_str().to_owned();
        let (service, method) = descriptor
            .method
            .rsplit_once('.')
            .ok_or_else(|| Status::invalid_argument("invalid canonical workflow method"))?;
        let path: http::uri::PathAndQuery = format!("/{service}/{method}")
            .parse()
            .map_err(|_| Status::invalid_argument("invalid canonical workflow RPC path"))?;
        self.invoke_writer(
            target,
            alias,
            WorkflowWriterMethod {
                state_type: descriptor.state_type,
                method: descriptor.method,
                response_type: "type.googleapis.com/rbt.v1alpha1.TaskId",
                errors: vec![],
            },
            crate::workflow_spawn_proto::SpawnRequest {
                method: descriptor.method.into(),
                request: request.encode_to_vec(),
                timestamp,
                relative_delay: None,
                response_type: descriptor.response_type.into(),
                errors: descriptor
                    .errors
                    .iter()
                    .map(|error| error.type_url.to_owned())
                    .collect(),
            },
            move |outbound: tonic::Request<crate::workflow_spawn_proto::SpawnRequest>| async move {
                let key = crate::RebootHeaders::from_request(&outbound)
                    .map_err(|e| Status::invalid_argument(e.to_string()))?
                    .idempotency_key
                    .ok_or_else(|| Status::internal("missing generated spawn key"))?;
                let schedule = match outbound.get_ref().timestamp {
                    None => String::new(),
                    Some(value) => chrono::DateTime::from_timestamp(
                        value.seconds,
                        value
                            .nanos
                            .try_into()
                            .map_err(|_| Status::invalid_argument("invalid workflow timestamp"))?,
                    )
                    .ok_or_else(|| Status::invalid_argument("invalid workflow timestamp"))?
                    .to_rfc3339(),
                };
                let body = Q::decode(outbound.get_ref().request.as_slice())
                    .map_err(|_| Status::internal("invalid generated spawn payload"))?;
                let mut outbound = outbound.map(|_| body);
                outbound.metadata_mut().insert(
                    "x-reboot-task-schedule",
                    schedule
                        .parse()
                        .map_err(|_| Status::invalid_argument("invalid workflow schedule"))?,
                );
                let mut client = tonic::client::Grpc::new(channel);
                client
                    .ready()
                    .await
                    .map_err(|error| Status::unavailable(error.to_string()))?;
                let response: tonic::Response<R> = client
                    .unary(outbound, path, tonic::codec::ProstCodec::default())
                    .await?;
                let mut values = response
                    .metadata()
                    .get_all(crate::successful_trailers::TASK_ID_UUID_HEADER)
                    .iter();
                let value = values.next().ok_or_else(|| {
                    Status::data_loss("canonical admission omitted task UUID trailer")
                })?;
                let id = uuid::Uuid::parse_str(
                    value
                        .to_str()
                        .map_err(|_| Status::data_loss("invalid task UUID trailer"))?,
                )
                .map_err(|_| Status::data_loss("invalid task UUID trailer"))?;
                if values.next().is_some()
                    || id.as_bytes().as_slice()
                        != initializer_uuid("reboot.workflow-spawn.task.v1", &key.to_string())
                {
                    return Err(Status::data_loss(
                        "canonical admission changed target task identity",
                    ));
                }
                Ok(tonic::Response::new(db::TaskId {
                    state_type: expected_type,
                    state_ref: expected_ref,
                    task_uuid: id.as_bytes().to_vec(),
                }))
            },
        )
        .await
    }

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
        let request = workflow_task_wait_request(target, id, &descriptor)?;
        let mut client = db::tasks_client::TasksClient::new(channel);
        let terminal = tokio::select! {
            biased;
            _ = self.cancel.cancelled() => return Err(Status::cancelled("spawned Wait cancelled")),
            terminal = client.wait(request) => terminal?.into_inner(),
        };
        self.validate_scope().await?;
        let outcome = decode_workflow_task_terminal(terminal, &descriptor)?;
        operation.acknowledged();
        outcome
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
        self.spawn_workflow_scheduled(
            channel,
            target,
            alias,
            descriptor,
            request,
            (timestamp, None),
        )
        .await
    }
    #[doc(hidden)]
    pub async fn spawn_workflow_after<Q: prost::Message + Send>(
        &self,
        channel: tonic::transport::Channel,
        target: &WorkflowWriterTarget,
        alias: &str,
        descriptor: WorkflowSpawnMethod,
        request: Q,
        delay: std::time::Duration,
    ) -> Result<db::TaskId, Status> {
        let operation = self.attempt.operation();
        let seconds = i64::try_from(delay.as_secs())
            .map_err(|_| Status::invalid_argument("relative workflow delay overflow"))?;
        let result = self
            .spawn_workflow_scheduled(
                channel,
                target,
                alias,
                descriptor,
                request,
                (
                    None,
                    Some(prost_types::Duration {
                        seconds,
                        nanos: delay.subsec_nanos() as i32,
                    }),
                ),
            )
            .await?;
        operation.acknowledged();
        Ok(result)
    }
    async fn spawn_workflow_scheduled<Q: prost::Message + Send>(
        &self,
        channel: tonic::transport::Channel,
        target: &WorkflowWriterTarget,
        alias: &str,
        descriptor: WorkflowSpawnMethod,
        request: Q,
        schedule: (
            Option<prost_types::Timestamp>,
            Option<prost_types::Duration>,
        ),
    ) -> Result<db::TaskId, Status> {
        let expected_type = target.actor.state_type().to_owned();
        let expected_ref = target.actor.state_ref().as_str().to_owned();
        self.invoke_writer(target, alias, WorkflowWriterMethod {
            state_type: descriptor.state_type,
            method: descriptor.method,
            response_type: "type.googleapis.com/rbt.v1alpha1.TaskId",
            errors: vec![],
        }, crate::workflow_spawn_proto::SpawnRequest {
            method: descriptor.method.into(), request: request.encode_to_vec(), timestamp: schedule.0, relative_delay: schedule.1,
            response_type: descriptor.response_type.into(),
            errors: descriptor.errors.iter().map(|error|error.type_url.to_owned()).collect(),
        }, move |outbound: tonic::Request<crate::workflow_spawn_proto::SpawnRequest>| async move {
            let key = crate::RebootHeaders::from_request(&outbound)
                .map_err(|e| Status::invalid_argument(e.to_string()))?.idempotency_key
                .ok_or_else(|| Status::internal("missing generated spawn key"))?;
            let relative = outbound.get_ref().relative_delay.is_some();
            let mut client = crate::workflow_spawn_proto::workflow_spawner_client::WorkflowSpawnerClient::new(channel);
            let response = if relative { client.spawn_after(outbound).await? } else { client.spawn(outbound).await? };
            let id = response.get_ref();
            if id.state_type != expected_type || id.state_ref != expected_ref || id.task_uuid != initializer_uuid("reboot.workflow-spawn.task.v1", &key.to_string()) {
                return Err(Status::data_loss("spawn response changed target task identity"));
            }
            Ok(response)
        }).await
    }
}
