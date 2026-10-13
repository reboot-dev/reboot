/// Private ordinary-writer effects. State is still owned by the actor envelope;
/// no transaction, arbitrary checkpoint, or participant authority is exposed.
#[derive(Debug)]
pub struct WriterExecution<R> {
    pub response: R,
    pub task_upserts: Vec<database::Task>,
}
impl<R> WriterExecution<R> {
    pub fn new(response: R) -> Self {
        Self {
            response,
            task_upserts: vec![],
        }
    }
}

fn ordinary_scheduling_fingerprint(fingerprint: &[u8]) -> Vec<u8> {
    use sha2::{Digest, Sha256};
    let mut hash = Sha256::new();
    hash.update(b"reboot.ordinary-writer.scheduling-checkpoint.v1\0");
    hash.update(fingerprint);
    let mut result = b"reboot.ordinary-writer.scheduling-checkpoint.v1\0".to_vec();
    result.extend_from_slice(&hash.finalize());
    result
}

impl DatabaseActorStore {
    async fn prepare_ordinary_effects<D, Q, R>(
        &self,
        identity: (&str, &str, &str),
        owner: Option<&crate::one_shot_tasks::OneShotTasks>,
        tasks: &[database::Task],
    ) -> Result<Option<crate::one_shot_tasks::RunningTaskAdmission>, Status>
    where
        D: DurableStateDeclaration + 'static,
        Q: 'static,
        R: 'static,
    {
        if tasks.is_empty() {
            return Ok(None);
        }
        let (state_ref, method, response_type) = identity;
        let owner = owner.ok_or_else(|| {
            Status::failed_precondition("scheduling requires a running task owner")
        })?;
        owner.validate_scheduling_store(self, D::STATE_TYPE, state_ref)?;
        owner.validate_ordinary_writer::<D, Q, R>(method, response_type)?;
        owner.validate_staged_admission(tasks).await.map(Some)
    }

    async fn replay_ordinary_writer<D, Q, R>(
        &self,
        identity: (&str, &str, &str),
        key: Uuid,
        fingerprint: &[u8],
        owner: Option<&crate::one_shot_tasks::OneShotTasks>,
    ) -> Result<Option<R>, Status>
    where
        D: DurableStateDeclaration + 'static,
        Q: 'static,
        R: Message + Default + 'static,
    {
        self.replay_scheduling_writer::<D, Q, R>(identity, key, fingerprint, owner, false, None)
            .await
    }

    async fn replay_scheduling_writer<D, Q, R>(
        &self,
        identity: (&str, &str, &str),
        key: Uuid,
        fingerprint: &[u8],
        owner: Option<&crate::one_shot_tasks::OneShotTasks>,
        constructor: bool,
        original: Option<&crate::one_shot_tasks::RunningTaskAdmission>,
    ) -> Result<Option<R>, Status>
    where
        D: DurableStateDeclaration + 'static,
        Q: 'static,
        R: Message + Default + 'static,
    {
        let (state_ref, method, response_type) = identity;
        let scheduling_fingerprint = ordinary_scheduling_fingerprint(fingerprint);
        let initial_running = owner.and_then(|owner| {
            owner
                .validate_scheduling_store(self, D::STATE_TYPE, state_ref)
                .ok()?;
            if constructor {
                owner
                    .validate_constructor_writer::<D, Q, R>(method, response_type)
                    .ok()?;
            } else {
                owner
                    .validate_ordinary_writer::<D, Q, R>(method, response_type)
                    .ok()?;
            }
            owner.workflow_running_admission().ok()
        });
        let retained_running = if constructor {
            original
        } else {
            initial_running.as_ref()
        };
        let mut stream = self
            .database
            .clone()
            .recover_idempotent_mutations(database::RecoverIdempotentMutationsRequest {
                state_type: D::STATE_TYPE.into(),
                state_ref: state_ref.into(),
                idempotency_key: Some(key.as_bytes().to_vec()),
                workflow_id: None,
                workflow_iteration: None,
            })
            .await?
            .into_inner();
        let mut replay = None;
        // Retain generation authority through the remainder of recovery, not
        // merely through each individual successor Load.
        let mut scheduling_replay = false;
        while let Some(batch) = stream.message().await? {
            if scheduling_replay {
                let _owner = retained_running.expect("retained generation").lock()?;
            }
            for mutation in batch.idempotent_mutations {
                if replay.is_some()
                    || mutation.state_type != D::STATE_TYPE
                    || mutation.state_ref != state_ref
                    || mutation.key != key.as_bytes()
                    || mutation.workflow_id.is_some()
                    || mutation.workflow_iteration.is_some()
                {
                    return Err(Status::failed_precondition(
                        "ordinary writer checkpoint scope collision",
                    ));
                }
                if mutation.request_fingerprint.as_deref()
                    == Some(scheduling_fingerprint.as_slice())
                {
                    let checkpoint =
                        WorkflowSchedulingCheckpoint::decode(mutation.response.as_slice())
                            .map_err(|_| {
                                Status::data_loss("malformed ordinary scheduling checkpoint")
                            })?;
                    if checkpoint.version != 1
                        || checkpoint.response_type != response_type
                        || checkpoint.tasks.is_empty()
                        || checkpoint
                            .tasks
                            .iter()
                            .filter_map(|task| task.task_id.clone())
                            .collect::<Vec<_>>()
                            != mutation.task_ids
                    {
                        return Err(Status::failed_precondition(
                            "incomplete ordinary scheduling checkpoint",
                        ));
                    }
                    let owner = owner.ok_or_else(|| {
                        Status::failed_precondition("scheduling replay requires task owner")
                    })?;
                    owner.validate_scheduling_store(self, D::STATE_TYPE, state_ref)?;
                    if constructor {
                        owner.validate_constructor_writer::<D, Q, R>(method, response_type)?;
                    } else {
                        owner.validate_ordinary_writer::<D, Q, R>(method, response_type)?;
                    }
                    let admission = retained_running.ok_or_else(|| {
                        Status::failed_precondition(
                            "scheduling replay requires original running generation",
                        )
                    })?;
                    {
                        let _owner = admission.lock()?;
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
                        let _owner = admission.lock()?;
                    }
                    owner.validate_ordinary_scheduling_replay(&checkpoint.tasks, &loaded.tasks)?;
                    replay = Some(R::decode(checkpoint.response.as_slice()).map_err(|_| {
                        Status::data_loss("malformed ordinary scheduling response")
                    })?);
                    scheduling_replay = true;
                } else {
                    replay = Some(decode_writer_task_checkpoint::<R>(
                        &mutation,
                        D::STATE_TYPE,
                        state_ref,
                        key,
                        fingerprint,
                    )?);
                }
            }
        }
        if scheduling_replay {
            let _owner = retained_running.expect("retained generation").lock()?;
        }
        Ok(replay)
    }

    async fn persist_ordinary_writer<D, R>(
        &self,
        identity: (&str, &str),
        key: Uuid,
        fingerprint: Vec<u8>,
        state: D::State,
        execution: &WriterExecution<R>,
        admission: Option<&crate::one_shot_tasks::RunningTaskAdmission>,
    ) -> Result<(), Status>
    where
        D: DurableStateDeclaration,
        R: Message + Clone,
    {
        let (state_ref, response_type) = identity;
        if execution.task_upserts.is_empty() {
            return self
                .store_type(
                    D::STATE_TYPE,
                    state_ref,
                    key,
                    state,
                    execution.response.clone(),
                    Some(fingerprint),
                )
                .await;
        }
        let admission = admission
            .ok_or_else(|| Status::failed_precondition("missing retained scheduling admission"))?;
        {
            let _owner = admission.lock()?;
        }
        let owner = &admission.tasks;
        let mut handoff = owner.own_root_handoff();
        let commit_attempt = self.actor_gate(D::STATE_TYPE, state_ref).commit_attempt();
        self.database
            .clone()
            .store(database::StoreRequest {
                actor_upserts: vec![database::Actor {
                    state_type: D::STATE_TYPE.into(),
                    state_ref: state_ref.into(),
                    state: Some(state.encode_to_vec()),
                }],
                task_upserts: execution.task_upserts.clone(),
                idempotent_mutation: Some(database::IdempotentMutation {
                    state_type: D::STATE_TYPE.into(),
                    state_ref: state_ref.into(),
                    key: key.as_bytes().to_vec(),
                    response: WorkflowSchedulingCheckpoint {
                        response: execution.response.encode_to_vec(),
                        tasks: execution.task_upserts.clone(),
                        response_type: response_type.into(),
                        version: 1,
                    }
                    .encode_to_vec(),
                    task_ids: execution
                        .task_upserts
                        .iter()
                        .map(|task| task.task_id.clone().expect("validated ID"))
                        .collect(),
                    request_fingerprint: Some(ordinary_scheduling_fingerprint(&fingerprint)),
                    workflow_id: None,
                    workflow_iteration: None,
                }),
                transaction: None,
                colocated_upserts: vec![],
                ensure_state_types_created: vec![],
                sync: true,
            })
            .await?;
        commit_attempt.acknowledged();
        {
            let _owner = admission.lock()?;
        }
        handoff.completed();
        owner.dispatch_committed(execution.task_upserts.clone());
        Ok(())
    }

    /// Generated ordinary DatabaseAdapter writer envelope. Authorization runs
    /// on current gate-protected state before replay. Empty effects retain the
    /// ordinary writer's actor scope and require no dispatcher ownership.
    pub async fn scheduling_writer_async_for_method_authorized<D, Q, R, F>(
        &self,
        identity: (&str, &str, StateAdmission),
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
            Box<dyn Future<Output = Result<WriterExecution<R>, Status>> + Send + 'a>,
        >,
    {
        let (method, response_type, admission) = identity;
        let (context, auth) = authorization
            .verify(
                crate::RebootHeaders::from_request(&request)
                    .map_err(|error| Status::invalid_argument(error.to_string()))?,
                D::STATE_TYPE,
                method,
            )
            .await?;
        authorization.require_authorizer()?;
        let fingerprint = request_fingerprint(method, request.get_ref());
        let state_ref = required_metadata(&request, STATE_REF_HEADER)?;
        let key = idempotency_key(&request)?;
        let gate = self.actor_gate(D::STATE_TYPE, &state_ref);
        let _lease = gate.exclusive().await;
        let initial_running = owner.and_then(|owner| {
            owner
                .validate_scheduling_store(self, D::STATE_TYPE, &state_ref)
                .ok()?;
            owner
                .validate_ordinary_writer::<D, Q, R>(method, response_type)
                .ok()?;
            owner.workflow_running_admission().ok()
        });
        let snapshot = self
            .load_state_bytes(D::STATE_TYPE, &state_ref)
            .await
            .map_err(|error| {
                if error.code() == tonic::Code::Unavailable {
                    Status::unavailable("actor authorization unavailable")
                } else {
                    Status::permission_denied("actor authorization unavailable")
                }
            })?;
        let default_bytes = D::State::default().encode_to_vec();
        authorization
            .authorize(
                &context,
                auth.as_ref(),
                Some(snapshot.as_deref().unwrap_or(&default_bytes)),
                &request.get_ref().encode_to_vec(),
            )
            .await?;
        if let Some(response) = self
            .replay_ordinary_writer::<D, Q, R>(
                (&state_ref, method, response_type),
                key,
                &fingerprint,
                owner,
            )
            .await?
        {
            return Ok(Response::new(response));
        }
        let mut state = admit_state(
            decode_persisted_state::<D::State>(snapshot, D::STATE_TYPE)?,
            admission,
        )?;
        let execution = invoke(&mut state, request.into_inner(), state_ref.clone()).await?;
        if !execution.task_upserts.is_empty() {
            let _owner = initial_running
                .as_ref()
                .ok_or_else(|| {
                    Status::failed_precondition("scheduling requires original running generation")
                })?
                .lock()?;
        }
        let staged = self
            .prepare_ordinary_effects::<D, Q, R>(
                (&state_ref, method, response_type),
                owner,
                &execution.task_upserts,
            )
            .await?;
        if staged.is_some() {
            let _owner = initial_running
                .as_ref()
                .expect("retained generation")
                .lock()?;
        }
        self.persist_ordinary_writer::<D, R>(
            (&state_ref, response_type),
            key,
            fingerprint,
            state,
            &execution,
            staged.as_ref(),
        )
        .await?;
        Ok(Response::new(execution.response))
    }
}

// Sealed work belongs to the exact DispatchOwner lifecycle registry entry.
// Both in-flight IO and retained uncertainty consume pre-reserved capacity.
struct ConstructorCreateAttempt {
    retained: Option<(
        ExclusiveActorLease,
        crate::one_shot_tasks::RunningTaskAdmission,
        crate::one_shot_tasks::ConstructorReservation,
    )>,
    commit: Option<ActorCommitAttempt>,
    handoff: Option<crate::one_shot_tasks::SchedulingRootHandoff>,
}
impl ConstructorCreateAttempt {
    fn acknowledged(mut self) -> Result<(), Status> {
        let (_, admission, _) = self.retained.as_ref().expect("sealed constructor");
        let owner = admission.lock()?;
        self.commit.take().expect("sealed commit").acknowledged();
        self.handoff.as_mut().expect("host handoff").completed();
        // Keep validation locked through exact registry reservation release.
        // Moving admission requires ending its borrowed guard first; shutdown
        // after this ACK validation is safe, because no native work remains.
        self.retained
            .as_ref()
            .expect("sealed constructor")
            .2
            .lifecycle_acknowledged();
        drop(owner);
        self.retained.take();
        Ok(())
    }
}
impl Drop for ConstructorCreateAttempt {
    fn drop(&mut self) {
        if let Some((lease, admission, reservation)) = self.retained.take() {
            self.handoff.take();
            self.commit.take();
            reservation.retain(lease, admission);
        }
    }
}

impl DatabaseActorStore {
    /// Standalone external writer constructor: absent actor + response checkpoint
    /// + Pending effects use one native CreateActor(sync=true), never Store.
    ///
    /// Constructors remain ineligible as tasks and registered transaction children.
    pub async fn scheduling_constructor_async_for_method_authorized<D, Q, R, F>(
        &self,
        identity: (&str, &str),
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
            Box<dyn Future<Output = Result<WriterExecution<R>, Status>> + Send + 'a>,
        >,
    {
        let (method, response_type) = identity;
        let headers = crate::RebootHeaders::from_request(&request)
            .map_err(|error| Status::invalid_argument(error.to_string()))?;
        if headers.transaction_ids.is_some()
            || request
                .extensions()
                .get::<RegisteredLocalTicket>()
                .is_some()
        {
            return Err(Status::failed_precondition(
                "constructor scheduling requires standalone external admission",
            ));
        }
        let (context, auth) = authorization.verify(headers, D::STATE_TYPE, method).await?;
        authorization.require_authorizer()?;
        let fingerprint = request_fingerprint(method, request.get_ref());
        let state_ref = required_metadata(&request, STATE_REF_HEADER)?;
        let key = idempotency_key(&request)?;
        let gate = self.actor_gate(D::STATE_TYPE, &state_ref);
        let lease = gate.exclusive().await;
        // Capture after token verification/gate admission, before actor
        // authorization, recovery or handler IO. Never adopt a replacement.
        // Ownerless creates have no host lifecycle anchor and must fail closed.
        let owner = owner.ok_or_else(|| {
            Status::failed_precondition("constructor requires host-owned dispatcher lifecycle")
        })?;
        owner.validate_scheduling_store(self, D::STATE_TYPE, &state_ref)?;
        owner.validate_constructor_writer::<D, Q, R>(method, response_type)?;
        let initial_running = owner.workflow_running_admission()?;
        let snapshot = self
            .load_state_bytes(D::STATE_TYPE, &state_ref)
            .await
            .map_err(|error| {
                if error.code() == tonic::Code::Unavailable {
                    Status::unavailable("actor authorization unavailable")
                } else {
                    Status::permission_denied("actor authorization unavailable")
                }
            })?;
        authorization
            .authorize(
                &context,
                auth.as_ref(),
                snapshot.as_deref(),
                &request.get_ref().encode_to_vec(),
            )
            .await?;
        // Authority before response/task ID or duplicate-existence disclosure.
        if let Some(response) = self
            .replay_scheduling_writer::<D, Q, R>(
                (&state_ref, method, response_type),
                key,
                &fingerprint,
                Some(owner),
                true,
                Some(&initial_running),
            )
            .await?
        {
            {
                let _owner = initial_running.lock()?;
            }
            return Ok(Response::new(response));
        }
        if snapshot.is_some() {
            return Err(Status::failed_precondition(
                "actor state has already been constructed",
            ));
        }
        let mut state = D::State::default();
        let execution = invoke(&mut state, request.into_inner(), state_ref.clone()).await?;
        let scheduling = !execution.task_upserts.is_empty();
        if scheduling {
            let admission = &initial_running;
            admission
                .tasks
                .validate_staged_for_admission(&execution.task_upserts, admission)
                .await?;
            let _owner = admission.lock()?;
        }
        let mutation = if scheduling {
            database::IdempotentMutation {
                state_type: D::STATE_TYPE.into(),
                state_ref: state_ref.clone(),
                key: key.as_bytes().to_vec(),
                response: WorkflowSchedulingCheckpoint {
                    response: execution.response.encode_to_vec(),
                    tasks: execution.task_upserts.clone(),
                    response_type: response_type.into(),
                    version: 1,
                }
                .encode_to_vec(),
                task_ids: execution
                    .task_upserts
                    .iter()
                    .map(|t| t.task_id.clone().expect("validated task ID"))
                    .collect(),
                request_fingerprint: Some(ordinary_scheduling_fingerprint(&fingerprint)),
                workflow_id: None,
                workflow_iteration: None,
            }
        } else {
            database::IdempotentMutation {
                state_type: D::STATE_TYPE.into(),
                state_ref: state_ref.clone(),
                key: key.as_bytes().to_vec(),
                response: execution.response.encode_to_vec(),
                task_ids: vec![],
                request_fingerprint: Some(fingerprint),
                workflow_id: None,
                workflow_iteration: None,
            }
        };
        let admission = initial_running;
        // This is the admission linearization point: shutdown after sealing
        // revokes publication but cannot erase ownership of possible native IO.
        // Capacity is reserved before constructing/polling either create RPC.
        let reservation = admission.reserve_constructor()?;
        let handoff = Some(admission.tasks.own_root_handoff());
        let attempt = ConstructorCreateAttempt {
            retained: Some((lease, admission, reservation)),
            commit: Some(gate.commit_attempt()),
            handoff,
        };
        let payload = database::CreateActorRequest {
            actor: Some(database::Actor {
                state_type: D::STATE_TYPE.into(),
                state_ref,
                state: Some(state.encode_to_vec()),
            }),
            idempotent_mutation: Some(mutation),
            sync: true,
            task_upserts: execution.task_upserts.clone(),
        };
        if scheduling {
            // Distinct method is the enforceable old-sidecar fence. Unknown RPC
            // returns UNIMPLEMENTED before writes; NEVER retry the legacy method.
            self.database
                .clone()
                .create_actor_with_tasks(payload)
                .await
                .map_err(database_status)?;
        } else {
            self.database
                .clone()
                .create_actor(payload)
                .await
                .map_err(database_status)?;
        }
        attempt.acknowledged()?;
        if scheduling {
            owner.dispatch_committed(execution.task_upserts);
        }
        Ok(Response::new(execution.response))
    }
}
