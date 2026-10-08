#[derive(prost::Message)]
struct WorkflowSchedulingCheckpoint {
    #[prost(bytes = "vec", tag = "1")]
    response: Vec<u8>,
    #[prost(message, repeated, tag = "2")]
    tasks: Vec<database::Task>,
    #[prost(string, tag = "3")]
    response_type: String,
    #[prost(uint32, tag = "4")]
    version: u32,
}

fn decode_workflow_checkpoint<R: Message + Default>(
    mutation: &database::IdempotentMutation,
    id: &database::TaskId,
    key: Uuid,
    fingerprint: &[u8],
    response_type: &str,
) -> Result<R, Status> {
    if mutation.state_type != id.state_type
        || mutation.state_ref != id.state_ref
        || mutation.key != key.as_bytes()
        || mutation.workflow_id.as_deref() != Some(id.task_uuid.as_slice())
        || mutation.workflow_iteration.is_some()
        || !mutation.task_ids.is_empty()
        || fingerprint.is_empty()
        || mutation.request_fingerprint.as_deref() != Some(fingerprint)
    {
        return Err(Status::failed_precondition(
            "workflow step checkpoint identity/provenance collision",
        ));
    }
    let any = prost_types::Any::decode(mutation.response.as_slice())
        .map_err(|_| Status::data_loss("malformed workflow step envelope"))?;
    if any.type_url != response_type {
        return Err(Status::data_loss("workflow step result type collision"));
    }
    R::decode(any.value.as_slice()).map_err(|_| Status::data_loss("malformed workflow step result"))
}
#[cfg(test)]
mod workflow_checkpoint_tests {
    use super::*;
    #[test]
    fn workflow_typed_checkpoint_rejects_legacy_scope_and_every_identity_collision() {
        let id = database::TaskId {
            state_type: "tests.reboot.protoc.Counter".into(),
            state_ref: "actor".into(),
            task_uuid: Uuid::new_v4().as_bytes().to_vec(),
        };
        let key = Uuid::new_v5(&Uuid::from_slice(&id.task_uuid).unwrap(), b"first");
        let record = database::IdempotentMutation {
            state_type: id.state_type.clone(),
            state_ref: id.state_ref.clone(),
            key: key.as_bytes().to_vec(),
            workflow_id: Some(id.task_uuid.clone()),
            workflow_iteration: None,
            request_fingerprint: Some(vec![1, 2]),
            task_ids: vec![],
            response: prost_types::Any {
                type_url: "type.googleapis.com/Counter".into(),
                value: proto::Counter { value: 7 }.encode_to_vec(),
            }
            .encode_to_vec(),
        };
        assert_eq!(
            decode_workflow_checkpoint::<proto::Counter>(
                &record,
                &id,
                key,
                &[1, 2],
                "type.googleapis.com/Counter"
            )
            .unwrap()
            .value,
            7
        );
        for vector in 0..10 {
            let mut bad = record.clone();
            match vector {
                0 => bad.state_type = "other".into(),
                1 => bad.state_ref = "other".into(),
                2 => bad.key = vec![1; 16],
                3 => bad.workflow_id = None,
                4 => bad.workflow_id = Some(vec![1; 16]),
                5 => bad.workflow_iteration = Some(0),
                6 => bad.request_fingerprint = None,
                7 => bad.request_fingerprint = Some(vec![3]),
                8 => bad.task_ids.push(id.clone()),
                _ => bad.response = vec![255],
            }
            assert!(
                decode_workflow_checkpoint::<proto::Counter>(
                    &bad,
                    &id,
                    key,
                    &[1, 2],
                    "type.googleapis.com/Counter"
                )
                .is_err(),
                "vector {vector}"
            );
        }
        assert!(
            decode_workflow_checkpoint::<proto::Counter>(
                &record,
                &id,
                key,
                &[],
                "type.googleapis.com/Counter"
            )
            .is_err()
        );
        assert!(
            decode_workflow_checkpoint::<proto::Counter>(
                &record,
                &id,
                key,
                &[1, 2],
                "type.googleapis.com/Other"
            )
            .is_err()
        );
    }
    #[test]
    fn explicit_named_key_matches_python_external_helper_not_typed_rpc_manager() {
        let seed = Uuid::parse_str("40000000-0000-4000-8000-000000000001").unwrap();
        assert_eq!(
            Uuid::new_v5(&seed, b"first").to_string(),
            "7e07973c-03ea-5cf8-8d96-1965823f5201"
        );
        assert_eq!(
            Uuid::new_v5(&seed, b"second").to_string(),
            "50ce4053-2412-5835-80c7-d25cab17dced"
        );
        assert_ne!(
            Uuid::new_v5(&seed, b"first"),
            Uuid::new_v5(&seed, b"first (iteration #0)")
        );
    }
}

impl DatabaseActorStore {
    pub(crate) async fn workflow_writer_step<D, Q, R, F>(
        &self,
        scope: &crate::one_shot_tasks::WorkflowContext<'_>,
        alias: &str,
        method: &'static str,
        response_type: &'static str,
        request: Q,
        invoke: F,
    ) -> Result<R, Status>
    where
        D: DurableStateDeclaration + 'static,
        Q: Message + Default + Send + 'static,
        R: Message + Default + Clone + Send + 'static,
        F: for<'a> FnOnce(
            &'a mut D::State,
            Q,
        ) -> Pin<Box<dyn Future<Output = Result<R, Status>> + Send + 'a>>,
    {
        let task = scope.task();
        let id = task
            .task_id
            .as_ref()
            .ok_or_else(|| Status::failed_precondition("missing workflow task"))?;
        let seed = Uuid::from_slice(&id.task_uuid)
            .map_err(|_| Status::failed_precondition("invalid workflow UUID"))?;
        let key = Uuid::new_v5(&seed, alias.as_bytes());
        // Pin workflow method/request, alias, writer method, response type and
        // canonical writer request. No legacy/incomplete record is accepted.
        let identity = format!(
            "reboot.workflow.named-step.v1:{}:{}:{}:{}:{}",
            task.method,
            task.request
                .iter()
                .map(|b| format!("{b:02x}"))
                .collect::<String>(),
            alias,
            method,
            response_type
        );
        let fingerprint = request_fingerprint(&identity, &request);
        let mut stream = self
            .database
            .clone()
            .recover_idempotent_mutations(database::RecoverIdempotentMutationsRequest {
                state_type: id.state_type.clone(),
                state_ref: id.state_ref.clone(),
                idempotency_key: Some(key.as_bytes().to_vec()),
                workflow_id: Some(id.task_uuid.clone()),
                workflow_iteration: None,
            })
            .await?
            .into_inner();
        scope.validate_scope().await?;
        let mut saved = None;
        while let Some(batch) = stream.message().await? {
            scope.validate_scope().await?;
            for mutation in batch.idempotent_mutations {
                if saved.is_some() {
                    return Err(Status::failed_precondition(
                        "duplicate workflow step checkpoint",
                    ));
                }
                saved = Some(decode_workflow_checkpoint::<R>(
                    &mutation,
                    id,
                    key,
                    &fingerprint,
                    response_type,
                )?);
            }
        }
        scope.validate_scope().await?;
        if let Some(saved) = saved {
            return Ok(saved);
        }
        let mut legacy = self
            .database
            .clone()
            .recover_idempotent_mutations(database::RecoverIdempotentMutationsRequest {
                state_type: id.state_type.clone(),
                state_ref: id.state_ref.clone(),
                idempotency_key: Some(key.as_bytes().to_vec()),
                workflow_id: None,
                workflow_iteration: None,
            })
            .await?
            .into_inner();
        scope.validate_scope().await?;
        while let Some(batch) = legacy.message().await? {
            scope.validate_scope().await?;
            if !batch.idempotent_mutations.is_empty() {
                return Err(Status::failed_precondition(
                    "legacy unscoped workflow checkpoint",
                ));
            }
        }
        scope.validate_scope().await?;
        let mut state = self
            .load_for_declaration::<D>(&id.state_ref)
            .await?
            .ok_or_else(|| Status::failed_precondition("workflow requires existing actor"))?;
        scope.validate_scope().await?;
        let response = invoke(&mut state, request).await?;
        scope.validate_scope().await?;
        let mut operation = scope.durable();
        let commit_attempt = self
            .actor_gate(&id.state_type, &id.state_ref)
            .commit_attempt();
        self.database
            .clone()
            .store(database::StoreRequest {
                actor_upserts: vec![database::Actor {
                    state_type: id.state_type.clone(),
                    state_ref: id.state_ref.clone(),
                    state: Some(state.encode_to_vec()),
                }],
                idempotent_mutation: Some(database::IdempotentMutation {
                    state_type: id.state_type.clone(),
                    state_ref: id.state_ref.clone(),
                    key: key.as_bytes().to_vec(),
                    response: prost_types::Any {
                        type_url: response_type.to_owned(),
                        value: response.encode_to_vec(),
                    }
                    .encode_to_vec(),
                    workflow_id: Some(id.task_uuid.clone()),
                    workflow_iteration: None,
                    request_fingerprint: Some(fingerprint),
                    task_ids: vec![],
                }),
                task_upserts: vec![],
                colocated_upserts: vec![],
                transaction: None,
                ensure_state_types_created: vec![],
                sync: true,
            })
            .await?;
        commit_attempt.acknowledged();
        scope.validate_scope().await?;
        operation.acknowledged();
        Ok(response)
    }
    /// Ordinary generated writer plus atomic durable scheduling. Host owner and
    /// canonical actor identity are mandatory; scheduling never calls task RPCs.
    pub async fn workflow_scheduling_writer<D, Q, R, F>(
        &self,
        method: &str,
        authorization: &crate::auth::AuthorizationPolicy,
        owner: Option<&crate::one_shot_tasks::OneShotTasks>,
        request: Request<Q>,
        invoke: F,
    ) -> Result<Response<R>, Status>
    where
        D: DurableStateDeclaration + 'static,
        Q: Message + Send + 'static,
        R: Message + Default + Clone + Send + 'static,
        F: for<'a> FnOnce(
            &'a mut D::State,
            Q,
            String,
        ) -> Pin<
            Box<dyn Future<Output = Result<TransactionExecution<R>, Status>> + Send + 'a>,
        >,
    {
        let (auth_context, auth) = authorization
            .verify(
                crate::RebootHeaders::from_request(&request)
                    .map_err(|e| Status::invalid_argument(e.to_string()))?,
                D::STATE_TYPE,
                method,
            )
            .await?;
        let state_ref = required_metadata(&request, STATE_REF_HEADER)?;
        let key = idempotency_key(&request)?;
        let fingerprint = request_fingerprint(method, request.get_ref());
        let owner = owner.ok_or_else(|| {
            Status::failed_precondition("scheduling requires registered workflow owner")
        })?;
        owner.validate_scheduling_store(self, D::STATE_TYPE, &state_ref)?;
        owner.validate_workflow_writer::<D, Q, R>(method)?;
        let running = owner.workflow_running_admission()?;
        let gate = self.actor_gate(D::STATE_TYPE, &state_ref);
        let _lease = gate.exclusive().await;
        {
            let _owner = running.lock()?;
        }
        let mut stream = self
            .database
            .clone()
            .recover_idempotent_mutations(database::RecoverIdempotentMutationsRequest {
                state_type: D::STATE_TYPE.to_owned(),
                state_ref: state_ref.clone(),
                idempotency_key: Some(key.as_bytes().to_vec()),
                workflow_id: None,
                workflow_iteration: None,
            })
            .await?
            .into_inner();
        {
            let _owner = running.lock()?;
        }
        let mut replay = None;
        while let Some(batch) = stream.message().await? {
            {
                let _owner = running.lock()?;
            }
            for mutation in batch.idempotent_mutations {
                if replay.is_some()
                    || mutation.state_type != D::STATE_TYPE
                    || mutation.state_ref != state_ref
                    || mutation.key != key.as_bytes()
                    || mutation.workflow_id.is_some()
                    || mutation.workflow_iteration.is_some()
                    || mutation.request_fingerprint.as_deref() != Some(fingerprint.as_slice())
                {
                    return Err(Status::failed_precondition(
                        "scheduling key method/payload collision",
                    ));
                }
                let checkpoint = WorkflowSchedulingCheckpoint::decode(mutation.response.as_slice())
                    .map_err(|_| Status::data_loss("invalid scheduling checkpoint"))?;
                if checkpoint.version != 1
                    || checkpoint.response_type != owner.workflow_writer_response_type(method)?
                    || checkpoint
                        .tasks
                        .iter()
                        .filter_map(|t| t.task_id.clone())
                        .collect::<Vec<_>>()
                        != mutation.task_ids
                {
                    return Err(Status::failed_precondition(
                        "incomplete scheduling replay metadata",
                    ));
                }
                {
                    let _owner = running.lock()?;
                }
                let loaded = self
                    .database
                    .clone()
                    .load(database::LoadRequest {
                        actors: vec![],
                        task_ids: mutation.task_ids,
                    })
                    .await?
                    .into_inner();
                {
                    let _owner = running.lock()?;
                }
                owner.validate_scheduling_replay(&checkpoint.tasks, &loaded.tasks)?;
                replay = Some(
                    R::decode(checkpoint.response.as_slice())
                        .map_err(|_| Status::data_loss("invalid scheduling result"))?,
                );
            }
        }
        {
            let _owner = running.lock()?;
        }
        if let Some(response) = replay {
            return Ok(Response::new(response));
        }
        let mut state = self
            .load_for_declaration::<D>(&state_ref)
            .await?
            .ok_or_else(|| {
                Status::failed_precondition("scheduling writer requires existing actor")
            })?;
        {
            let _owner = running.lock()?;
        }
        authorization
            .authorize(
                &auth_context,
                auth.as_ref(),
                Some(&state.encode_to_vec()),
                &request.get_ref().encode_to_vec(),
            )
            .await?;
        {
            let _owner = running.lock()?;
        }
        let execution = invoke(&mut state, request.into_inner(), state_ref.clone()).await?;
        {
            let _owner = running.lock()?;
        }
        if execution.final_state.is_some() || !execution.idempotent_mutations.is_empty() {
            return Err(Status::failed_precondition(
                "workflow scheduling writer supports only local state and tasks",
            ));
        }
        let admission = owner
            .validate_staged_admission(&execution.task_upserts)
            .await?;
        let mut handoff = owner.own_root_handoff();
        {
            let _owner = running.lock()?;
        }
        {
            let _owner = admission.lock()?;
        }
        let commit_attempt = self.actor_gate(D::STATE_TYPE, &state_ref).commit_attempt();
        self.database
            .clone()
            .store(database::StoreRequest {
                actor_upserts: vec![database::Actor {
                    state_type: D::STATE_TYPE.to_owned(),
                    state_ref: state_ref.clone(),
                    state: Some(state.encode_to_vec()),
                }],
                idempotent_mutation: Some(database::IdempotentMutation {
                    state_type: D::STATE_TYPE.to_owned(),
                    state_ref: state_ref.clone(),
                    key: key.as_bytes().to_vec(),
                    response: WorkflowSchedulingCheckpoint {
                        version: 1,
                        response: execution.response.encode_to_vec(),
                        tasks: execution.task_upserts.clone(),
                        response_type: owner.workflow_writer_response_type(method)?.to_owned(),
                    }
                    .encode_to_vec(),
                    task_ids: execution
                        .task_upserts
                        .iter()
                        .filter_map(|t| t.task_id.clone())
                        .collect(),
                    workflow_id: None,
                    workflow_iteration: None,
                    request_fingerprint: Some(fingerprint),
                }),
                task_upserts: execution.task_upserts.clone(),
                colocated_upserts: vec![],
                transaction: None,
                ensure_state_types_created: vec![],
                sync: true,
            })
            .await?;
        commit_attempt.acknowledged();
        {
            let _owner = admission.lock()?;
        }
        {
            let _owner = running.lock()?;
        }
        handoff.completed();
        owner.dispatch_committed(execution.task_upserts);
        Ok(Response::new(execution.response))
    }
}
