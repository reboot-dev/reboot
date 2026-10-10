// Bounded local cancellation: scheduled workflow bodies which have not started.
// Running bodies and ordinary task targets are intentionally not interrupted.
use prost::Message;

const CANCELLED_TYPE: &str = "type.googleapis.com/rbt.v1alpha1.Cancelled";

/// Recognize the exact canonical system cancellation terminal, not a bare code.
/// Non-cancellation terminals return None and still need method-scoped validation.
pub fn task_cancellation_status(error: &prost_types::Any) -> Result<Option<Status>, Status> {
    let rich = decode_task_error(error)?;
    if rich.details[0].type_url != CANCELLED_TYPE {
        return Ok(None);
    }
    if rich.code != tonic::Code::Cancelled as i32 {
        return Err(Status::data_loss("cancellation terminal has wrong code"));
    }
    db::Cancelled::decode(rich.details[0].value.as_slice())
        .map_err(|_| Status::data_loss("malformed cancellation detail"))?;
    Ok(Some(Status::with_details(
        tonic::Code::Cancelled,
        rich.message,
        error.value.clone().into(),
    )))
}
fn cancelled_terminal(method: &str) -> db::task::ResponseOrError {
    db::task::ResponseOrError::Error(prost_types::Any {
        type_url: "type.googleapis.com/google.rpc.Status".into(),
        value: googleapis_tonic_google_rpc::google::rpc::Status {
            code: tonic::Code::Cancelled as i32,
            message: format!("the scheduled workflow running '{method}' was cancelled"),
            details: vec![prost_types::Any {
                type_url: CANCELLED_TYPE.into(),
                value: db::Cancelled {}.encode_to_vec(),
            }],
        }
        .encode_to_vec(),
    })
}
// Arm before the only mutating RPC. Cancellation/transport/ACK uncertainty must
// fail the supervised owner before actor admission is released. No detached retry.
struct CancellationWrite<'a> {
    tasks: &'a OneShotTasks,
    acknowledged: bool,
}
impl Drop for CancellationWrite<'_> {
    fn drop(&mut self) {
        if !self.acknowledged {
            self.tasks.inner.uncertain.send_replace(true);
        }
    }
}
impl ReaderTaskWaitService {
    async fn cancel_scheduled_workflow(
        &self,
        request: tonic::Request<db::CancelTaskRequest>,
    ) -> Result<tonic::Response<db::CancelTaskResponse>, Status> {
        let policy = self
            .admin
            .as_ref()
            .ok_or_else(|| Status::permission_denied("task administration is not enabled"))?;
        let mut headers = crate::RebootHeaders::from_request(&request)
            .map_err(|error| Status::invalid_argument(error.to_string()))?;
        headers.server_id = Some(self.server_id.clone());
        headers.application_id = Some(self.application.as_str().to_owned());
        let routed_ref = headers.state_ref.clone();
        // Retain the original allocation across every policy/actor/Database await.
        // Defer route/owner/identity errors until policy denial has precedence.
        let id = request.get_ref().task_id.as_ref();
        let admission = id
            .and_then(|id| {
                self.tasks
                    .get(&(id.state_type.clone(), id.state_ref.clone()))
            })
            .map(OneShotTasks::workflow_running_admission);
        let (context, principal) = policy
            .verify(
                headers,
                "rbt.v1alpha1.Tasks",
                "rbt.v1alpha1.Tasks.CancelTask",
            )
            .await?;
        policy
            .authorize(
                &context,
                principal.as_ref(),
                None,
                &request.get_ref().encode_to_vec(),
            )
            .await?;
        let id = id.ok_or_else(|| Status::invalid_argument("missing task ID"))?;
        if id.state_ref != routed_ref
            || uuid::Uuid::from_slice(&id.task_uuid).map_or(true, |uuid| {
                uuid.get_version_num() != 4 || uuid.get_variant() != uuid::Variant::RFC4122
            })
        {
            return Err(Status::invalid_argument(
                "task must match routed actor and UUIDv4",
            ));
        }
        let admission =
            admission.ok_or_else(|| Status::invalid_argument("task actor is not registered"))??;
        self.require_authority(&id.state_ref)?;
        {
            let _owner = admission.lock()?;
        }
        let tasks = &admission.tasks;
        let gate = tasks.inner.store.actor_gate(&id.state_type, &id.state_ref);
        let _lease = gate.exclusive().await;
        self.require_authority(&id.state_ref)?;
        {
            let _owner = admission.lock()?;
        }
        let loaded = tasks
            .inner
            .store
            .task_database()
            .load(db::LoadRequest {
                actors: vec![],
                task_ids: vec![id.clone()],
            })
            .await?
            .into_inner();
        self.require_authority(&id.state_ref)?;
        {
            let _owner = admission.lock()?;
        }
        let response = |status: db::cancel_task_response::Status| {
            Ok(tonic::Response::new(db::CancelTaskResponse {
                status: status as i32,
            }))
        };
        if loaded.tasks.is_empty() {
            return response(db::cancel_task_response::Status::NotFound);
        }
        if loaded.tasks.len() != 1 || loaded.tasks[0].task_id.as_ref() != Some(id) {
            return Err(Status::data_loss(
                "cancellation lookup returned another task",
            ));
        }
        let mut task = loaded.tasks[0].clone();
        if task.status == db::task::Status::Completed as i32 {
            // No dispatch remains to cancel; do not replace any winner.
            return response(db::cancel_task_response::Status::NotFound);
        }
        tasks.validate(std::slice::from_ref(&task))?;
        if !tasks.is_workflow(&task)
            || schedule_due(&task)?
            || !tasks.inner.listing.snapshot().iter().any(|info| {
                info.task_id.as_ref() == Some(id)
                    && info.status == db::task_info::Status::Scheduled as i32
            })
        {
            return Err(Status::failed_precondition(
                "only not-yet-due, unstarted workflows can be cancelled",
            ));
        }
        task.status = db::task::Status::Completed as i32;
        task.response_or_error = Some(cancelled_terminal(&task.method));
        let mut write = CancellationWrite {
            tasks,
            acknowledged: false,
        };
        let won = tasks
            .inner
            .store
            .task_database()
            .complete_task(db::CompleteTaskRequest {
                task: Some(task.clone()),
                sync: true,
            })
            .await?
            .into_inner()
            .completed;
        self.require_authority(&id.state_ref)?;
        {
            let _owner = admission.lock()?;
        }
        if !won {
            // Under the local actor lease, another terminal is unexpected. Keep
            // uncertainty sticky instead of adopting a response or retrying CAS.
            return Err(Status::failed_precondition(
                "cancellation completion lost canonical CAS",
            ));
        }
        write.acknowledged = true;
        tasks.inner.sender.try_send(()).ok(); // hint only; canonical rescan owns pruning
        response(db::cancel_task_response::Status::Ok)
    }
}

#[cfg(test)]
#[path = "task_cancellation_tests.rs"]
mod cancellation_tests;
