// Included in one_shot_tasks: only dispatcher-minted contexts can invoke this path.
/// Explicit host-owned external-unary destination. Credentials are outbound
/// service credentials, NOT recovered workflow-user credentials. One fixed
/// application/channel; no placement, transactions, scheduling or internal bypass.
#[derive(Clone)]
pub struct WorkflowWriterTarget {
    actor: crate::actor_ref::ActorRef,
    application: crate::CallerId,
    bearer: Option<String>,
}
impl WorkflowWriterTarget {
    pub fn new(
        actor: crate::actor_ref::ActorRef,
        application: crate::CallerId,
        bearer: Option<String>,
    ) -> Result<Self, Status> {
        if actor.state_type().is_empty()
            || !actor.state_ref().matches_state_type(actor.state_type())
        {
            return Err(Status::invalid_argument(
                "writer target type/reference mismatch",
            ));
        }
        let target = Self {
            actor,
            application,
            bearer,
        };
        target
            .headers(uuid::Uuid::nil(), uuid::Uuid::nil(), None)
            .to_metadata()
            .map_err(|e| Status::invalid_argument(e.to_string()))?;
        Ok(target)
    }
    fn headers(
        &self,
        key: uuid::Uuid,
        workflow: uuid::Uuid,
        iteration: Option<i64>,
    ) -> crate::RebootHeaders {
        let mut headers = crate::RebootHeaders::new(self.actor.state_ref().as_str());
        headers.application_id = Some(self.application.application_id().into());
        headers.caller_id = Some(self.application.clone());
        headers.bearer_token = self.bearer.clone();
        headers.idempotency_key = Some(key);
        headers.workflow_id = Some(workflow);
        headers.workflow_iteration = iteration;
        headers
    }
}
/// Generated ordinary writer contract. Custom callers/bindings are trusted
/// application code; this descriptor does not certify arbitrary remote servers.
pub struct WorkflowWriterMethod {
    pub state_type: &'static str,
    pub method: &'static str,
    pub response_type: &'static str,
    pub errors: Vec<DeclaredTaskError>,
}
/// A caught declared outcome retains both the generated typed error and the
/// exact acknowledged wire status. Failed never grants permission to continue.
#[derive(Debug)]
pub enum WorkflowWriterError<E> {
    Declared { error: E, status: Status },
    Failed(Status),
}
#[derive(Clone, prost::Message)]
struct OutboundWriterContract {
    #[prost(string, tag = "1")]
    application: String,
    #[prost(string, tag = "2")]
    actor_type: String,
    #[prost(string, tag = "3")]
    actor_ref: String,
    #[prost(string, tag = "4")]
    method: String,
    #[prost(bytes = "vec", tag = "5")]
    request: Vec<u8>,
    #[prost(string, repeated, tag = "6")]
    errors: Vec<String>,
}
impl WorkflowContext<'_> {
    /// Invoke one generated ordinary writer with durable intent and the SAME
    /// target receipt key on recovery. Always consult target authorization on
    /// replay; do not disclose a cached result before the target authorizes it.
    /// Both target Store ACK and source journal ACK precede success. No automatic
    /// in-attempt transport retry or atomic multi-actor commit. Only explicitly
    /// declared, durable target outcomes can be caught without poisoning.
    pub async fn invoke_writer<Q, R, F, Fut>(
        &self,
        target: &WorkflowWriterTarget,
        alias: &str,
        descriptor: WorkflowWriterMethod,
        request: Q,
        invoke: F,
    ) -> Result<R, Status>
    where
        Q: prost::Message + Send,
        R: prost::Message + Default + Send,
        F: FnOnce(tonic::Request<Q>) -> Fut + Send,
        Fut: std::future::Future<Output = Result<tonic::Response<R>, Status>> + Send,
    {
        let operation = self.attempt.operation();
        if self.cursor_scope().is_some() {
            return Err(Status::failed_precondition(
                "outbound writers do not support canonical cursor receipt retention",
            ));
        }
        if alias.is_empty()
            || alias.len() > 256
            || alias.chars().any(char::is_control)
            || descriptor.state_type != target.actor.state_type()
            || descriptor.method.is_empty()
            || descriptor.response_type.is_empty()
            || request.encoded_len() > 1048576
        {
            return Err(Status::invalid_argument(
                "invalid bounded workflow writer call",
            ));
        }
        let id = self
            .task
            .task_id
            .as_ref()
            .ok_or_else(|| Status::failed_precondition("missing workflow identity"))?;
        if id.state_type != self.tasks.inner.state_type
            || id.state_ref != self.tasks.inner.state_ref
        {
            return Err(Status::failed_precondition(
                "workflow writer owner mismatch",
            ));
        }
        let declaration = self
            .tasks
            .declaration(&self.task)
            .filter(|d| d.workflow)
            .ok_or_else(|| Status::failed_precondition("writer requires a registered workflow"))?;
        (declaration.decode_request)(&self.task.request)?;
        let seed = uuid::Uuid::from_slice(&id.task_uuid)
            .map_err(|_| Status::failed_precondition("invalid workflow UUID"))?;
        // Source actor identity separates equal task UUIDs on different actors.
        // Payload/destination deliberately do NOT change the key: alias reuse
        // must reject, not authorize another effect after an interrupted call.
        let source = format!("{}:{}:{}", id.state_type.len(), id.state_type, id.state_ref);
        let namespace = uuid::Uuid::new_v5(&seed, source.as_bytes());
        let namespace = uuid::Uuid::new_v5(&namespace, b"reboot.outbound.writer.v1");
        let key = self.checkpoint_key(namespace, alias, Some("outbound-writer.v1"));
        let contract = AtMostOnceResultContract {
            declared_writer_errors: !descriptor.errors.is_empty(),
            method: declaration.method.into(),
            request: self.task.request.clone(),
            alias: self.checkpoint_alias(alias),
            version: 1,
            bound: self.checkpoint_bound(),
            parent_bounds: self.checkpoint_parent_bounds(),
            result_type: descriptor.response_type.into(),
            call_contract: OutboundWriterContract {
                application: target.application.to_string(),
                actor_type: target.actor.state_type().into(),
                actor_ref: target.actor.state_ref().as_str().into(),
                method: descriptor.method.into(),
                request: request.encode_to_vec(),
                errors: descriptor
                    .errors
                    .iter()
                    .map(|e| e.type_url.to_owned())
                    .collect(),
            }
            .encode_to_vec(),
        };
        let store = &self.tasks.inner.store;
        let gate = store.actor_gate(&id.state_type, &id.state_ref);
        let mut revisions = gate.committed_revisions();
        {
            let _lease = workflow_reader_lease(&gate, &mut revisions).await?;
            self.validate_scope().await?;
            if store
                .workflow_at_most_once_result_load(self, key, &contract)
                .await?
                .is_none()
            {
                store
                    .workflow_at_most_once_result_save(
                        self,
                        key,
                        &contract,
                        AtMostOnceResultCheckpoint::started(),
                    )
                    .await?;
            }
            self.validate_scope().await?;
        }
        #[cfg(feature = "test-support")]
        self.wait_test_pause("REBOOT_TEST_OUTBOUND_WRITER_BEFORE_DISPATCH")
            .await?;
        self.validate_scope().await?;
        let iteration = self
            .cursor_scope()
            .map(|(_, n, _)| *n)
            .or_else(|| self.checkpoint_iteration())
            .map(i64::try_from)
            .transpose()
            .map_err(|_| Status::out_of_range("workflow iteration exceeds wire range"))?;
        let mut outbound = tonic::Request::new(request);
        *outbound.metadata_mut() = target
            .headers(key, seed, iteration)
            .to_metadata()
            .map_err(|e| Status::invalid_argument(e.to_string()))?;
        let result = tokio::select! {
            biased;
            _ = self.cancel.cancelled() => return Err(Status::cancelled("workflow writer cancelled")),
            result = invoke(outbound) => match result {
                Ok(response) => Ok(response.into_inner()),
                Err(status) => {
                    if !crate::runtime::is_durable_declared_writer_error(&status) {
                        return Err(status);
                    }
                    DeclaredTaskError::validate_status(&descriptor.errors, &status)?;
                    Err(status)
                }
            },
        };
        let bytes = match &result {
            Ok(response) => response.encode_to_vec(),
            Err(status) => status.details().to_vec(),
        };
        if bytes.len() > 1048576 {
            return Err(Status::resource_exhausted("writer result exceeds 1MiB"));
        }
        #[cfg(feature = "test-support")]
        self.wait_test_pause("REBOOT_TEST_OUTBOUND_WRITER_AFTER_TARGET_ACK")
            .await?;
        {
            let _lease = workflow_reader_lease(&gate, &mut revisions).await?;
            self.validate_scope().await?;
            let prior = store
                .workflow_at_most_once_result_load(self, key, &contract)
                .await?
                .ok_or_else(|| Status::data_loss("writer intent disappeared"))?;
            let mut saved = AtMostOnceResultCheckpoint::stored(descriptor.response_type, bytes);
            saved.declared_writer_error = result.is_err();
            if prior.phase == 2 && prior != saved {
                return Err(Status::data_loss(
                    "target writer replay changed acknowledged result",
                ));
            }
            if prior.phase != 2 {
                store
                    .workflow_at_most_once_result_save(self, key, &contract, saved)
                    .await?;
            }
            self.validate_scope().await?;
        }
        operation.acknowledged();
        result
    }
}
