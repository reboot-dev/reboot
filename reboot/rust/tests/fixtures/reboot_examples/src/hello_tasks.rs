//! Pinned hello-tasks happy path: ordinary Send -> Warning -> Erase writers.
//! Missing IDs reject in a pure immutable precheck; admitted tasks retry locally.
use crate::{hello_tasks::v1 as proto, tasks_adapter as generated};
use reboot::runtime::WriterExecution;
pub struct HelloTasks;
fn after(seconds: u64) -> prost_types::Timestamp {
    let time = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        + std::time::Duration::from_secs(seconds);
    prost_types::Timestamp {
        seconds: time.as_secs() as i64,
        nanos: time.subsec_nanos() as i32,
    }
}
fn public_id(task: &reboot::database_proto::Task) -> crate::rbt::v1alpha1::TaskId {
    let id = task.task_id.as_ref().expect("generated task ID");
    crate::rbt::v1alpha1::TaskId {
        state_type: id.state_type.clone(),
        state_ref: id.state_ref.clone(),
        task_uuid: id.task_uuid.clone(),
    }
}
#[tonic::async_trait]
impl generated::HelloMethodsDatabaseHandler for HelloTasks {
    fn warning_local_precheck(
        &self,
        state: &proto::Hello,
        request: &proto::WarningRequest,
    ) -> Result<(), reboot::one_shot_tasks::LocalStateNotReady> {
        if state
            .messages
            .iter()
            .any(|message| message.id == request.message_id)
        {
            Ok(())
        } else {
            Err(reboot::one_shot_tasks::LocalStateNotReady::new(format!(
                "ID {} not found",
                request.message_id
            )))
        }
    }
    fn erase_local_precheck(
        &self,
        state: &proto::Hello,
        request: &proto::EraseRequest,
    ) -> Result<(), reboot::one_shot_tasks::LocalStateNotReady> {
        if state
            .messages
            .iter()
            .any(|message| message.id == request.message_id)
        {
            Ok(())
        } else {
            Err(reboot::one_shot_tasks::LocalStateNotReady::new(format!(
                "ID {} not found",
                request.message_id
            )))
        }
    }
    async fn messages(
        &self,
        state: &proto::Hello,
        _: proto::MessagesRequest,
    ) -> Result<proto::MessagesResponse, tonic::Status> {
        let mut messages = vec![format!(
            "Number of erased messages: {}",
            state.num_erased_messages
        )];
        messages.extend(state.messages.iter().map(|message| message.text.clone()));
        Ok(proto::MessagesResponse { messages })
    }
    async fn send(
        &self,
        _: &mut proto::Hello,
        _: proto::SendRequest,
    ) -> Result<proto::SendResponse, tonic::Status> {
        Err(tonic::Status::failed_precondition(
            "Send requires generated scheduling context",
        ))
    }
    async fn warning(
        &self,
        _: &mut proto::Hello,
        _: proto::WarningRequest,
    ) -> Result<proto::WarningResponse, tonic::Status> {
        Err(tonic::Status::failed_precondition(
            "Warning requires generated scheduling context",
        ))
    }
    async fn send_with_tasks(
        &self,
        state: &mut proto::Hello,
        request: proto::SendRequest,
        state_ref: String,
    ) -> Result<WriterExecution<proto::SendResponse>, tonic::Status> {
        let message = proto::Message {
            id: uuid::Uuid::new_v4().to_string(),
            text: request.message,
        };
        let task = generated::HelloMethodsTasksAt::warning(
            &state_ref,
            &proto::WarningRequest {
                message_id: message.id.clone(),
            },
            after(7),
        );
        state.messages.push(message);
        Ok(WriterExecution {
            response: proto::SendResponse {
                task_id: Some(public_id(&task)),
            },
            task_upserts: vec![task],
        })
    }
    async fn warning_with_tasks(
        &self,
        state: &mut proto::Hello,
        request: proto::WarningRequest,
        state_ref: String,
    ) -> Result<WriterExecution<proto::WarningResponse>, tonic::Status> {
        let message = state
            .messages
            .iter_mut()
            .find(|message| message.id == request.message_id)
            .ok_or_else(|| {
                tonic::Status::failed_precondition(format!("ID {} not found", request.message_id))
            })?;
        message.text.push_str(" (Disappearing soon!)");
        let task = generated::HelloMethodsTasksAt::erase(
            &state_ref,
            &proto::EraseRequest {
                message_id: request.message_id,
            },
            after(3),
        );
        Ok(WriterExecution {
            response: proto::WarningResponse {
                task_id: Some(public_id(&task)),
            },
            task_upserts: vec![task],
        })
    }
    async fn erase(
        &self,
        state: &mut proto::Hello,
        request: proto::EraseRequest,
    ) -> Result<proto::EraseResponse, tonic::Status> {
        let index = state
            .messages
            .iter()
            .position(|message| message.id == request.message_id)
            .ok_or_else(|| {
                tonic::Status::failed_precondition(format!("ID {} not found", request.message_id))
            })?;
        state.messages.remove(index);
        state.num_erased_messages += 1;
        Ok(proto::EraseResponse {})
    }
}
