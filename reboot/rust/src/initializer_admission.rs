// Canonical initializer admission. No dummy scheduling method or new protobuf
// schema: one synchronous Store atomically publishes the task and its immutable
// alias contract. Singleton owner + both local actor gates serialize first Start;
// Store's native fingerprint collision check is additional protection, not a CAS.
// The initializer namespace is in the registered state type's existing column
// family, independent of the target actor. Changing that anchor state type is an
// explicit migration, not a supported reconfiguration of an existing initializer.
fn initializer_uuid(application: &str, alias: &str) -> Vec<u8> {
    use sha2::{Digest, Sha256};
    let mut hash = Sha256::new();
    hash.update(b"reboot.serving-initializer.task.v1\0");
    for value in [application, alias] {
        hash.update((value.len() as u64).to_be_bytes());
        hash.update(value.as_bytes());
    }
    let mut id = hash.finalize()[..16].to_vec();
    // Preserve the canonical UUID-v4 validation contract. These are deterministic
    // domain-separated identifiers, not claims of random UUID generation.
    id[6] = (id[6] & 0x0f) | 0x40;
    id[8] = (id[8] & 0x3f) | 0x80;
    id
}
fn initializer_fingerprint(task: &db::Task, response_type: &str) -> Vec<u8> {
    use prost::Message;
    use sha2::{Digest, Sha256};
    let mut hash = Sha256::new();
    hash.update(b"reboot.serving-initializer.contract.v1\0");
    hash.update((response_type.len() as u64).to_be_bytes());
    hash.update(response_type.as_bytes());
    hash.update(task.encode_to_vec());
    hash.finalize().to_vec()
}
fn validate_initializer_record(
    mutation: &db::IdempotentMutation,
    anchor: &str,
    key: &[u8],
    task: &db::Task,
    response_type: &str,
) -> Result<(), Status> {
    use prost::Message;
    let id = task.task_id.as_ref().expect("initializer ID");
    let fingerprint = initializer_fingerprint(task, response_type);
    if mutation.state_type != id.state_type
        || mutation.state_ref != anchor
        || mutation.key != key
        || mutation.workflow_id.is_some()
        || mutation.workflow_iteration.is_some()
        || mutation.task_ids != vec![id.clone()]
        || mutation.request_fingerprint.as_deref() != Some(fingerprint.as_slice())
        || mutation.response != task.encode_to_vec()
    {
        return Err(Status::failed_precondition(
            "initializer alias reused with a changed target/method/request/result contract",
        ));
    }
    Ok(())
}
impl OneShotTasks {
    pub(crate) fn require_initializer_owner(
        &self,
        cancel: &RecoveryCancellation,
    ) -> Result<RunningTaskAdmission, Status> {
        let admission = self.workflow_running_admission()?;
        drop(admission.lock_initializer(cancel, self)?);
        if !self.inner.binding.writer_capable() {
            return Err(Status::failed_precondition(
                "initializer needs an exclusive workflow owner",
            ));
        }
        Ok(admission)
    }
    pub(crate) async fn admit_initializer<D, Q, R>(
        &self,
        context: &crate::application_host::ServingInitializeContext,
        method: &'static str,
        response_type: &'static str,
        request: &Q,
    ) -> Result<db::TaskId, Status>
    where
        D: crate::runtime::DurableStateDeclaration + 'static,
        Q: prost::Message + Default + 'static,
        R: prost::Message + Default + 'static,
    {
        use prost::Message;
        context.require_live().await?;
        let admission = context.admission();
        let declaration = self
            .inner
            .declarations
            .iter()
            .find(|d| d.method == method)
            .ok_or_else(|| Status::permission_denied("initializer method not registered"))?;
        if !declaration.workflow || D::STATE_TYPE != self.inner.state_type {
            return Err(Status::permission_denied(
                "initializer target is not this owner's workflow",
            ));
        }
        let id = db::TaskId {
            state_type: self.inner.state_type.clone(),
            state_ref: self.inner.state_ref.clone(),
            task_uuid: initializer_uuid(context.application_id(), context.alias()),
        };
        let task = db::Task {
            task_id: Some(id.clone()),
            method: method.rsplit('.').next().unwrap_or("").to_owned(),
            request: request.encode_to_vec(),
            timestamp: None,
            iteration: 0,
            status: db::task::Status::Pending as i32,
            response_or_error: None,
        };
        self.validate_executor::<D, Q, R>(&task, method, response_type)?;
        self.validate(std::slice::from_ref(&task))?;
        let anchor = crate::state_ref::StateRef::from_id(
            &self.inner.state_type,
            &format!("__reboot_serving_initializer_{}", context.application_id()),
        )
        .map_err(|_| Status::invalid_argument("invalid initializer application identity"))?
        .to_string();
        if anchor == id.state_ref {
            return Err(Status::invalid_argument(
                "initializer target uses reserved admission namespace",
            ));
        }
        let anchor_gate = self.inner.store.actor_gate(&id.state_type, &anchor);
        let _anchor_lease = anchor_gate.exclusive().await;
        let gate = self.inner.store.actor_gate(&id.state_type, &id.state_ref);
        let _lease = gate.exclusive().await;
        context.require_live().await?;
        drop(admission.lock_initializer(context.cancellation(), self)?);
        let key = initializer_uuid(
            context.application_id(),
            &format!("admission:{}", context.alias()),
        );
        let mut stream = self
            .inner
            .store
            .task_database()
            .recover_idempotent_mutations(db::RecoverIdempotentMutationsRequest {
                state_type: id.state_type.clone(),
                state_ref: anchor.clone(),
                idempotency_key: Some(key.clone()),
                workflow_id: None,
                workflow_iteration: None,
            })
            .await?
            .into_inner();
        let mut saved = false;
        while let Some(batch) = stream.message().await? {
            context.require_live().await?;
            drop(admission.lock_initializer(context.cancellation(), self)?);
            for record in batch.idempotent_mutations {
                if saved {
                    return Err(Status::data_loss("duplicate initializer admission record"));
                }
                validate_initializer_record(&record, &anchor, &key, &task, response_type)?;
                saved = true;
            }
        }
        let loaded = self
            .inner
            .store
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
        context.require_live().await?;
        drop(admission.lock_initializer(context.cancellation(), self)?);
        if saved {
            self.validate_scheduling_replay(std::slice::from_ref(&task), &loaded.tasks)?;
            return Ok(id);
        }
        if !loaded.tasks.is_empty() {
            return Err(Status::failed_precondition(
                "initializer task exists without its atomic admission record",
            ));
        }
        // The target lease serializes admission with ordinary scheduling, and
        // the recovered singleton owner's complete pending set enforces budget.
        self.validate_staged_for_admission(std::slice::from_ref(&task), admission)
            .await?;
        context.require_live().await?;
        drop(admission.lock_initializer(context.cancellation(), self)?);
        if loaded.actors.len() > 1
            || loaded.actors.first().is_some_and(|actor| {
                actor.state_type != id.state_type || actor.state_ref != id.state_ref
            })
        {
            return Err(Status::data_loss(
                "initializer actor Load identity mismatch",
            ));
        }
        let state = loaded
            .actors
            .first()
            .and_then(|actor| actor.state.as_deref());
        let actor_upserts = if let Some(state) = state {
            D::State::decode(state)
                .map_err(|_| Status::data_loss("malformed initializer actor state"))?;
            vec![]
        } else {
            if D::TASK_STATE_ADMISSION != crate::runtime::StateAdmission::DefaultOnAbsent {
                return Err(Status::failed_precondition(
                    "initializer workflow requires an existing actor",
                ));
            }
            vec![db::Actor {
                state_type: id.state_type.clone(),
                state_ref: id.state_ref.clone(),
                state: Some(D::State::default().encode_to_vec()),
            }]
        };
        let creates_actor = !actor_upserts.is_empty();
        let mut operation = DurableTaskOperation {
            cancel: context.cancellation(),
            tasks: self,
            acknowledged: false,
            started: None,
        };
        let commit = gate.commit_attempt();
        self.inner
            .store
            .task_database()
            .store(db::StoreRequest {
                actor_upserts,
                task_upserts: vec![task.clone()],
                idempotent_mutation: Some(db::IdempotentMutation {
                    state_type: id.state_type.clone(),
                    state_ref: anchor,
                    key,
                    response: task.encode_to_vec(),
                    task_ids: vec![id.clone()],
                    request_fingerprint: Some(initializer_fingerprint(&task, response_type)),
                    workflow_id: None,
                    workflow_iteration: None,
                }),
                colocated_upserts: vec![],
                transaction: None,
                ensure_state_types_created: vec![id.state_type.clone()],
                sync: true,
            })
            .await?;
        if creates_actor {
            commit.acknowledged();
        } else {
            commit.checkpoint_acknowledged();
        }
        context.require_live().await?;
        drop(admission.lock_initializer(context.cancellation(), self)?);
        operation.acknowledged();
        self.dispatch_committed(vec![task]);
        Ok(id)
    }
    pub(crate) async fn wait_initializer<R: prost::Message + Default + 'static>(
        &self,
        context: &crate::application_host::ServingInitializeContext,
        id: &db::TaskId,
        method: &'static str,
        response_type: &'static str,
    ) -> Result<R, Status> {
        context.require_live().await?;
        if id.state_type != self.inner.state_type
            || id.state_ref != self.inner.state_ref
            || id.task_uuid != initializer_uuid(context.application_id(), context.alias())
        {
            return Err(Status::permission_denied(
                "initializer Wait target mismatch",
            ));
        }
        let declaration = self
            .inner
            .declarations
            .iter()
            .find(|d| d.method == method && d.workflow)
            .ok_or_else(|| Status::permission_denied("initializer Wait method not registered"))?;
        if declaration.response_type != response_type
            || declaration.response != std::any::TypeId::of::<R>()
        {
            return Err(Status::permission_denied(
                "initializer Wait result contract mismatch",
            ));
        }
        let admission = context.admission();
        loop {
            context.require_live().await?;
            drop(admission.lock_initializer(context.cancellation(), self)?);
            let loaded = self
                .inner
                .store
                .task_database()
                .load(db::LoadRequest {
                    actors: vec![],
                    task_ids: vec![id.clone()],
                })
                .await?
                .into_inner();
            context.require_live().await?;
            drop(admission.lock_initializer(context.cancellation(), self)?);
            if loaded.tasks.len() != 1
                || loaded.tasks[0].task_id.as_ref() != Some(id)
                || loaded.tasks[0].method != method.rsplit('.').next().unwrap_or("")
            {
                return Err(Status::data_loss(
                    "initializer Wait canonical identity mismatch",
                ));
            }
            let task = &loaded.tasks[0];
            if task.status == db::task::Status::Completed as i32 {
                let terminal = task
                    .response_or_error
                    .as_ref()
                    .ok_or_else(|| Status::data_loss("initializer terminal missing"))?;
                self.validate_terminal(task, terminal)?;
                return match terminal {
                    db::task::ResponseOrError::Response(any) if any.type_url == response_type => {
                        R::decode(any.value.as_slice())
                            .map_err(|_| Status::data_loss("malformed initializer workflow result"))
                    }
                    db::task::ResponseOrError::Error(any) => {
                        Err(TaskHandlerError::Declared(any.clone()).into_status())
                    }
                    _ => Err(Status::data_loss(
                        "initializer workflow result type mismatch",
                    )),
                };
            }
            if task.status != db::task::Status::Pending as i32 || task.response_or_error.is_some() {
                return Err(Status::data_loss("invalid initializer task phase"));
            }
            tokio::select! {
                biased;
                _ = context.cancellation().cancelled() => return Err(Status::cancelled("initializer Wait stopped")),
                _ = tokio::time::sleep(std::time::Duration::from_millis(25)) => {},
            }
        }
    }
}
