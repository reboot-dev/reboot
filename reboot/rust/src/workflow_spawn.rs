// Included in one_shot_tasks. The generated adapter provides the exact recovered
// owner and policy; this transport cannot discover/adopt actors or mint authority.
fn spawn_fingerprint(
    task: &db::Task,
    request: &crate::workflow_spawn_proto::SpawnRequest,
) -> Vec<u8> {
    use prost::Message;
    use sha2::{Digest, Sha256};
    let mut hash = Sha256::new();
    hash.update(b"reboot.workflow-spawn.contract.v1\0");
    for bytes in [task.encode_to_vec(), request.encode_to_vec()] {
        hash.update((bytes.len() as u64).to_be_bytes());
        hash.update(bytes);
    }
    hash.finalize().to_vec()
}
#[derive(Clone)]
pub struct WorkflowSpawner {
    tasks: OneShotTasks,
    authorization: crate::auth::AuthorizationPolicy,
}
impl WorkflowSpawner {
    #[doc(hidden)]
    pub fn new(tasks: OneShotTasks, authorization: crate::auth::AuthorizationPolicy) -> Self {
        Self {
            tasks,
            authorization,
        }
    }
    pub fn into_service(
        self,
    ) -> crate::workflow_spawn_proto::workflow_spawner_server::WorkflowSpawnerServer<Self> {
        crate::workflow_spawn_proto::workflow_spawner_server::WorkflowSpawnerServer::new(self)
    }
}
#[tonic::async_trait]
impl crate::workflow_spawn_proto::workflow_spawner_server::WorkflowSpawner for WorkflowSpawner {
    async fn spawn(
        &self,
        request: tonic::Request<crate::workflow_spawn_proto::SpawnRequest>,
    ) -> Result<tonic::Response<db::TaskId>, Status> {
        if request.get_ref().relative_delay.is_some() {
            return Err(Status::invalid_argument(
                "relative scheduling requires SpawnAfter",
            ));
        }
        self.admit(request, false).await
    }
    async fn spawn_after(
        &self,
        request: tonic::Request<crate::workflow_spawn_proto::SpawnRequest>,
    ) -> Result<tonic::Response<db::TaskId>, Status> {
        let body = request.get_ref();
        if body.relative_delay.is_none() || body.timestamp.is_some() {
            return Err(Status::invalid_argument(
                "SpawnAfter requires only a relative delay",
            ));
        }
        validate_relative_delay(body.relative_delay.as_ref().expect("checked delay"))?;
        self.admit(request, false).await
    }
}
fn validate_relative_delay(delay: &prost_types::Duration) -> Result<(), Status> {
    if delay.seconds < 0
        || delay.seconds > 315_576_000_000
        || !(0..1_000_000_000).contains(&delay.nanos)
    {
        return Err(Status::invalid_argument(
            "relative workflow delay is out of range",
        ));
    }
    Ok(())
}
fn relative_workflow_timestamp(
    delay: &prost_types::Duration,
    now: std::time::Duration,
) -> Result<prost_types::Timestamp, Status> {
    validate_relative_delay(delay)?;
    let absolute = now
        .checked_add(std::time::Duration::new(
            delay.seconds as u64,
            delay.nanos as u32,
        ))
        .ok_or_else(|| Status::invalid_argument("relative workflow timestamp overflow"))?;
    if absolute.as_secs() > 253_402_300_799 {
        return Err(Status::invalid_argument(
            "relative workflow timestamp exceeds protobuf range",
        ));
    }
    Ok(prost_types::Timestamp {
        seconds: absolute.as_secs() as i64,
        nanos: absolute.subsec_nanos() as i32,
    })
}
impl WorkflowSpawner {
    /// Canonical Python TasksStub admission uses the application's original RPC,
    /// the task-schedule metadata and an acknowledged UUID in successful trailers.
    /// No method body runs during admission; no new Tasks.Spawn RPC is invented.
    #[doc(hidden)]
    pub async fn schedule<Q: prost::Message, R: Default>(
        &self,
        method: &'static str,
        request: tonic::Request<Q>,
    ) -> Result<tonic::Response<R>, Status> {
        let schedule = request
            .metadata()
            // Match RebootHeaders::from_metadata and Python: the last value
            // determines both immediate/absolute admission and its timestamp.
            .get_all("x-reboot-task-schedule")
            .iter()
            .next_back()
            .ok_or_else(|| {
                Status::permission_denied("workflow RPC requires task schedule metadata")
            })?
            .to_str()
            .map_err(|_| Status::invalid_argument("invalid task schedule metadata"))?;
        // An empty header means immediate admission, not a newly fingerprinted
        // clock on every retry. Explicit Python datetime/timedelta values arrive
        // as absolute timestamps and remain bound to the original intent.
        let timestamp = if schedule.is_empty() {
            None
        } else {
            let headers = crate::RebootHeaders::from_request(&request)
                .map_err(|error| Status::invalid_argument(error.to_string()))?;
            let value = headers
                .task_schedule
                .ok_or_else(|| Status::invalid_argument("missing task timestamp"))?;
            Some(prost_types::Timestamp {
                seconds: value.timestamp(),
                nanos: value.timestamp_subsec_nanos() as i32,
            })
        };
        let declaration = self
            .tasks
            .inner
            .declarations
            .iter()
            .find(|d| d.method == method && !d.constructor_scheduling && !d.workflow_reader_wait)
            .ok_or_else(|| Status::permission_denied("task target is not a registered callable"))?;
        let body = crate::workflow_spawn_proto::SpawnRequest {
            method: method.into(),
            request: request.get_ref().encode_to_vec(),
            timestamp,
            response_type: declaration.response_type.into(),
            errors: declaration
                .errors
                .iter()
                .map(|error| error.type_url.to_owned())
                .collect(),
            relative_delay: None,
        };
        let id = self.admit(request.map(|_| body), true).await?.into_inner();
        let uuid = uuid::Uuid::from_slice(&id.task_uuid)
            .map_err(|_| Status::data_loss("invalid admitted task UUID"))?;
        let mut response = tonic::Response::new(R::default());
        crate::successful_trailers::stage_successful_task(&mut response, uuid);
        Ok(response)
    }

    async fn admit(
        &self,
        request: tonic::Request<crate::workflow_spawn_proto::SpawnRequest>,
        canonical_callable: bool,
    ) -> Result<tonic::Response<db::TaskId>, Status> {
        use prost::Message;
        let headers = crate::RebootHeaders::from_request(&request)
            .map_err(|error| Status::invalid_argument(error.to_string()))?;
        let key = headers
            .idempotency_key
            .ok_or_else(|| Status::invalid_argument("workflow spawn requires idempotency key"))?;
        if headers.state_ref != self.tasks.inner.state_ref || headers.transaction_ids.is_some() {
            return Err(Status::permission_denied(
                "workflow spawn requires exact nontransactional owner",
            ));
        }
        let body = request.get_ref();
        let declaration = self
            .tasks
            .inner
            .declarations
            .iter()
            .find(|d| d.method == body.method && (d.workflow || canonical_callable)
                && !d.constructor_scheduling && !d.workflow_reader_wait)
            .ok_or_else(|| {
                Status::permission_denied("spawn target is not a registered workflow")
            })?;
        if body.request.len() > 1048576 {
            return Err(Status::resource_exhausted(
                "workflow spawn request exceeds 1MiB",
            ));
        }
        (declaration.decode_request)(&body.request)?;
        if body.response_type != declaration.response_type
            || body.errors
                != declaration
                    .errors
                    .iter()
                    .map(|error| error.type_url.to_owned())
                    .collect::<Vec<_>>()
        {
            return Err(Status::failed_precondition(
                "spawn result/error schema changed",
            ));
        }
        let (context, auth) = self
            .authorization
            .verify(headers, &self.tasks.inner.state_type, declaration.method)
            .await?;
        self.authorization.require_authorizer()?;
        let running = self.tasks.workflow_running_admission()?;
        let id = db::TaskId {
            state_type: self.tasks.inner.state_type.clone(),
            state_ref: self.tasks.inner.state_ref.clone(),
            task_uuid: initializer_uuid("reboot.workflow-spawn.task.v1", &key.to_string()),
        };
        let mut task = db::Task {
            task_id: Some(id.clone()),
            method: body.method.rsplit('.').next().unwrap_or("").into(),
            request: body.request.clone(),
            timestamp: body.timestamp,
            iteration: 0,
            status: db::task::Status::Pending as i32,
            response_or_error: None,
        };
        self.tasks.validate(std::slice::from_ref(&task))?;
        // Cursor admission has an additional binding journal. Do not silently
        // bypass that foundation, or promise cross-actor cursor receipt GC.
        if self.tasks.cursor_declaration(&task).is_some() {
            return Err(Status::failed_precondition(
                "spawn does not support cursor workflow targets",
            ));
        }
        let store = &self.tasks.inner.store;
        let gate = store.actor_gate(&id.state_type, &id.state_ref);
        let _lease = gate.exclusive().await;
        if gate.committed_revisions().borrow().1 {
            return Err(Status::unavailable(
                "spawn actor commit outcome uncertain; restart host",
            ));
        }
        drop(running.lock()?);
        let loaded = store
            .task_database()
            .load(db::LoadRequest {
                actors: vec![db::Actor {
                    state_type: id.state_type.clone(),
                    state_ref: id.state_ref.clone(),
                    state: None,
                }],
                task_ids: vec![id.clone()],
            })
            .await?
            .into_inner();
        drop(running.lock()?);
        if loaded.actors.len() != 1
            || loaded.actors[0].state_type != id.state_type
            || loaded.actors[0].state_ref != id.state_ref
        {
            return Err(Status::permission_denied(
                "spawn authorization state unavailable",
            ));
        }
        self.authorization
            .authorize(
                &context,
                auth.as_ref(),
                loaded.actors[0].state.as_deref(),
                &body.request,
            )
            .await?;
        drop(running.lock()?);
        if loaded.actors[0].state.is_none() {
            return Err(Status::failed_precondition("spawn requires existing actor"));
        }
        let mut stream = store
            .task_database()
            .recover_idempotent_mutations(db::RecoverIdempotentMutationsRequest {
                state_type: id.state_type.clone(),
                state_ref: id.state_ref.clone(),
                idempotency_key: Some(key.as_bytes().to_vec()),
                workflow_id: None,
                workflow_iteration: None,
            })
            .await?
            .into_inner();
        let mut replay = false;
        while let Some(batch) = stream.message().await? {
            drop(running.lock()?);
            for record in batch.idempotent_mutations {
                if replay {
                    return Err(Status::data_loss("duplicate workflow spawn receipt"));
                }
                if body.relative_delay.is_some() {
                    let saved = db::Task::decode(record.response.as_slice())
                        .map_err(|_| Status::data_loss("malformed relative scheduling receipt"))?;
                    task.timestamp =
                        Some(saved.timestamp.ok_or_else(|| {
                            Status::data_loss("relative receipt omitted timestamp")
                        })?);
                    self.tasks.validate(std::slice::from_ref(&task))?;
                }
                if record.state_type != id.state_type
                    || record.state_ref != id.state_ref
                    || record.key != key.as_bytes()
                    || record.workflow_id.is_some()
                    || record.workflow_iteration.is_some()
                    || record.task_ids != vec![id.clone()]
                    || record.request_fingerprint.as_deref()
                        != Some(spawn_fingerprint(&task, body).as_slice())
                    || record.response != task.encode_to_vec()
                {
                    return Err(Status::failed_precondition(
                        "spawn key reused with changed task/payload/schedule/schema contract",
                    ));
                }
                replay = true;
            }
        }
        drop(running.lock()?);
        if replay {
            if canonical_callable {
                self.tasks.validate_ordinary_scheduling_replay(std::slice::from_ref(&task), &loaded.tasks)?;
            } else {
                self.tasks.validate_scheduling_replay(std::slice::from_ref(&task), &loaded.tasks)?;
            }
            return Ok(tonic::Response::new(id));
        }
        if !loaded.tasks.is_empty() {
            return Err(Status::failed_precondition(
                "spawn task exists without atomic admission receipt",
            ));
        }
        if let Some(delay) = &body.relative_delay {
            // Resolve only for fresh admission under the actor lease. On replay
            // adopt only the timestamp validated against the atomic receipt.
            let now = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map_err(|_| Status::internal("system clock is before Unix epoch"))?;
            task.timestamp = Some(relative_workflow_timestamp(delay, now)?);
            self.tasks.validate(std::slice::from_ref(&task))?;
        }
        let admission = self
            .tasks
            .validate_staged_admission(std::slice::from_ref(&task))
            .await?;
        let mut handoff = self.tasks.own_root_handoff();
        drop(running.lock()?);
        drop(admission.lock()?);
        let commit = gate.commit_attempt();
        store
            .task_database()
            .store(db::StoreRequest {
                actor_upserts: vec![],
                task_upserts: vec![task.clone()],
                idempotent_mutation: Some(db::IdempotentMutation {
                    state_type: id.state_type.clone(),
                    state_ref: id.state_ref.clone(),
                    key: key.as_bytes().to_vec(),
                    response: task.encode_to_vec(),
                    task_ids: vec![id.clone()],
                    request_fingerprint: Some(spawn_fingerprint(&task, body)),
                    workflow_id: None,
                    workflow_iteration: None,
                }),
                colocated_upserts: vec![],
                transaction: None,
                ensure_state_types_created: vec![],
                sync: true,
            })
            .await?;
        commit.checkpoint_acknowledged();
        drop(admission.lock()?);
        drop(running.lock()?);
        handoff.completed();
        self.tasks.dispatch_committed(vec![task]);
        Ok(tonic::Response::new(id))
    }
}
