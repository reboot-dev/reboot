// Included in task_cancellation. Transaction roots may outlive RPC cancellation:
// only a future, still-canonical task is cancellable. No pre-CAS body signal.
impl ReaderTaskWaitService {
    async fn cancel_scheduled_transaction(
        &self,
        admission: &RunningTaskAdmission,
        id: &db::TaskId,
    ) -> Result<Option<tonic::Response<db::CancelTaskResponse>>, Status> {
        let tasks = &admission.tasks;
        let _serial = tasks.inner.cancellation_serial.lock().await;
        let gate = tasks.inner.store.actor_gate(&id.state_type, &id.state_ref);
        let _lease = gate.exclusive().await;
        self.require_authority(&id.state_ref)?;
        { let _owner = admission.lock()?; }
        let loaded = tasks.inner.store.task_database().load(db::LoadRequest {
            actors: vec![], task_ids: vec![id.clone()],
        }).await?.into_inner();
        self.require_authority(&id.state_ref)?;
        { let _owner = admission.lock()?; }
        if loaded.tasks.len() != 1 { return Ok(None); }
        let mut task = loaded.tasks[0].clone();
        if !tasks.declaration(&task).is_some_and(|d| d.transaction) {
            return Ok(None);
        }
        if task.task_id.as_ref() != Some(id) {
            return Err(Status::data_loss("transaction cancellation identity mismatch"));
        }
        let reply = |status| Some(tonic::Response::new(db::CancelTaskResponse { status: status as i32 }));
        if task.status == db::task::Status::Completed as i32 {
            return Ok(reply(db::cancel_task_response::Status::NotFound));
        }
        tasks.validate(std::slice::from_ref(&task))?;
        if schedule_due(&task)? {
            return Err(Status::failed_precondition("due or running transaction tasks cannot be cancelled; coordinator recovery retains commit authority"));
        }
        // The executor must reload under this SAME actor gate before dispatch.
        // Holding it through synchronous CAS prevents a future->due race.
        task.status = db::task::Status::Completed as i32;
        task.response_or_error = Some(cancelled_terminal(&task.method));
        let mut write = CancellationWrite { ordinary: None, actor: None, tasks, acknowledged: false };
        {
            let _owner = admission.lock()?;
            write.actor = Some(gate.commit_attempt());
            tasks.inner.cancellation_writes.fetch_add(1, std::sync::atomic::Ordering::AcqRel);
            tasks.inner.cancellation_in_flight.store(true, std::sync::atomic::Ordering::Release);
        }
        let won = tasks.inner.store.task_database().complete_task(db::CompleteTaskRequest {
            task: Some(task), sync: true,
        }).await?.into_inner().completed;
        self.require_authority(&id.state_ref)?;
        { let _owner = admission.lock()?; }
        if !won { return Err(Status::failed_precondition("transaction cancellation lost canonical CAS")); }
        write.acknowledged = true;
        tasks.inner.sender.try_send(()).ok();
        Ok(reply(db::cancel_task_response::Status::Ok))
    }
}
