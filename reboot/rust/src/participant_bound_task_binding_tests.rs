//! Source632 ownership/forwarding fixtures. No native or recovery-composition claim.
use super::*;
use crate::durable_participant::{DurableActorParticipant, ParticipantSidecar};
type SidecarFuture<'a, T> =
    std::pin::Pin<Box<dyn std::future::Future<Output = Result<T, Status>> + Send + 'a>>;

struct Sidecar(String);
macro_rules! unused_rpc {
    ($name:ident, $request:ty, $response:ty) => {
        fn $name(&self, _: $request) -> SidecarFuture<'_, $response> {
            Box::pin(async { panic!("binding fixture must not call sidecar") })
        }
    };
}
impl ParticipantSidecar for Sidecar {
    fn database_endpoint(&self) -> Option<&str> {
        Some(&self.0)
    }
    unused_rpc!(load, db::LoadRequest, db::LoadResponse);
    unused_rpc!(
        prepare,
        db::TransactionParticipantPrepareRequest,
        db::TransactionParticipantPrepareResponse
    );
    unused_rpc!(
        commit,
        db::TransactionParticipantCommitRequest,
        db::TransactionParticipantCommitResponse
    );
    unused_rpc!(
        abort,
        db::TransactionParticipantAbortRequest,
        db::TransactionParticipantAbortResponse
    );
    unused_rpc!(recover, db::RecoverRequest, Vec<db::RecoverResponse>);
    unused_rpc!(
        recover_idempotent_mutations,
        db::RecoverIdempotentMutationsRequest,
        Vec<db::RecoverIdempotentMutationsResponse>
    );
}
fn participant(store: &DatabaseActorStore) -> DurableActorParticipant<Sidecar> {
    DurableActorParticipant::new(
        Arc::new(Sidecar(store.database_endpoint().into())),
        "state",
        "actor",
    )
    .with_database_actor_gate(store)
}
struct Binding;
#[tonic::async_trait]
impl ReaderTaskBinding for Binding {
    fn validate(&self, _: &db::Task) -> Result<(), Status> {
        Err(Status::aborted("validate"))
    }
    async fn execute(&self, _: &db::Task) -> Result<prost_types::Any, Status> {
        Err(Status::aborted("execute"))
    }
    async fn execute_terminal(&self, _: &db::Task) -> Result<db::task::ResponseOrError, Status> {
        Err(Status::aborted("terminal"))
    }
    fn validate_error(&self, _: &db::Task, _: &prost_types::Any) -> Result<(), Status> {
        Err(Status::aborted("error"))
    }
    fn validate_terminal(&self, _: &db::Task, _: &db::task::ResponseOrError) -> Result<(), Status> {
        Err(Status::aborted("validate_terminal"))
    }
    fn validate_response(&self, _: &db::Task, _: &prost_types::Any) -> Result<(), Status> {
        Err(Status::aborted("response"))
    }
    fn writer_method(&self, _: &db::Task) -> Option<&'static str> {
        Some("writer")
    }
    fn writer_response_type(&self, _: &db::Task) -> Option<&'static str> {
        Some("response")
    }
    fn writer_capable(&self) -> bool {
        true
    }
    fn is_writer(&self, _: &db::Task) -> bool {
        true
    }
    async fn execute_writer(&self, _: AdmittedWriterTask<'_>) -> Result<WriterTaskReceipt, Status> {
        Err(Status::aborted("writer"))
    }
    async fn execute_workflow(
        &self,
        context: WorkflowContext<'_>,
    ) -> Result<WorkflowReceipt, Status> {
        assert_eq!(context.iteration, Some(("cursor".into(), 3, 7)));
        Err(Status::aborted("workflow"))
    }
}

#[tokio::test]
async fn retained_actual_participant_accepts_clones_not_same_actor_gate_allocations() {
    let store = DatabaseActorStore::connect_lazy("http://127.0.0.1:1").unwrap();
    let actual = participant(&store);
    let other = participant(&store);
    // Both have the same target, endpoint and exact Database gate.
    other.validate_task_owner(&store, "state", "actor").unwrap();
    let carrier = ParticipantBoundTaskBinding::new(actual.clone(), Binding);
    assert!(carrier.participant.same_owner_allocation(&actual));
    let owner = OneShotTasks::new_with_participant_declarations(
        store.clone(),
        "state".into(),
        "actor".into(),
        carrier,
        vec![],
    )
    .unwrap();
    owner
        .clone()
        .validate_participant_owner(&actual.clone())
        .unwrap();
    assert_eq!(
        owner.validate_participant_owner(&other).unwrap_err().code(),
        tonic::Code::FailedPrecondition
    );
    drop(actual);
    let retained = owner
        .inner
        .participant_owner
        .as_ref()
        .unwrap()
        .downcast_ref::<DurableActorParticipant<Sidecar>>()
        .unwrap();
    owner.validate_participant_owner(retained).unwrap();
    let unbound =
        OneShotTasks::new(store.clone(), "state".into(), "actor".into(), Binding).unwrap();
    assert!(unbound.validate_participant_owner(retained).is_err());
    // Passing a concrete carrier through the legacy erased path does NOT claim ownership.
    let erased = OneShotTasks::new(
        store.clone(),
        "state".into(),
        "actor".into(),
        ParticipantBoundTaskBinding::new(retained.clone(), Binding),
    )
    .unwrap();
    assert!(erased.validate_participant_owner(retained).is_err());
    for (ty, actor) in [("wrong", "actor"), ("state", "wrong")] {
        assert!(
            OneShotTasks::new_with_participant_declarations(
                store.clone(),
                ty.into(),
                actor.into(),
                ParticipantBoundTaskBinding::new(retained.clone(), Binding),
                vec![]
            )
            .is_err()
        );
    }
    // Stores at the same endpoint deliberately share the actor-gate registry.
    let same_endpoint = DatabaseActorStore::connect_lazy("http://127.0.0.1:1").unwrap();
    let same_gate_owner = OneShotTasks::new_with_participant_declarations(
        same_endpoint,
        "state".into(),
        "actor".into(),
        ParticipantBoundTaskBinding::new(retained.clone(), Binding),
        vec![],
    )
    .unwrap();
    same_gate_owner
        .validate_participant_owner(retained)
        .unwrap();
    // An actor-local, unbound participant has genuinely different gate custody.
    let unbound_participant = DurableActorParticipant::new(
        Arc::new(Sidecar(store.database_endpoint().into())),
        "state",
        "actor",
    );
    assert!(
        OneShotTasks::new_with_participant_declarations(
            store.clone(),
            "state".into(),
            "actor".into(),
            ParticipantBoundTaskBinding::new(unbound_participant, Binding),
            vec![]
        )
        .is_err()
    );
    let wrong_store = DatabaseActorStore::connect_lazy("http://127.0.0.1:2").unwrap();
    assert!(
        OneShotTasks::new_with_participant_declarations(
            wrong_store,
            "state".into(),
            "actor".into(),
            ParticipantBoundTaskBinding::new(retained.clone(), Binding),
            vec![]
        )
        .is_err()
    );
}

#[tokio::test]
async fn forwards_every_binding_hook_including_terminal_writer_and_cursor_context() {
    let store = DatabaseActorStore::connect_lazy("http://127.0.0.1:1").unwrap();
    let bound = ParticipantBoundTaskBinding::new(participant(&store), Binding);
    let task = db::Task::default();
    let any = prost_types::Any::default();
    let terminal = db::task::ResponseOrError::Response(any.clone());
    assert_eq!(bound.validate(&task).unwrap_err().message(), "validate");
    assert_eq!(bound.execute(&task).await.unwrap_err().message(), "execute");
    assert_eq!(
        bound.execute_terminal(&task).await.unwrap_err().message(),
        "terminal"
    );
    assert_eq!(
        bound.validate_error(&task, &any).unwrap_err().message(),
        "error"
    );
    assert_eq!(
        bound
            .validate_terminal(&task, &terminal)
            .unwrap_err()
            .message(),
        "validate_terminal"
    );
    assert_eq!(
        bound.validate_response(&task, &any).unwrap_err().message(),
        "response"
    );
    assert_eq!(bound.writer_method(&task), Some("writer"));
    assert_eq!(bound.writer_response_type(&task), Some("response"));
    assert!(bound.writer_capable());
    assert!(bound.is_writer(&task));
    let tasks = OneShotTasks::new(store.clone(), "state".into(), "actor".into(), Binding).unwrap();
    let (cancel, _) = RecoveryCancellation::test_host();
    let attempt = WorkflowAttempt::default();
    let context = WorkflowContext {
        tasks: &tasks,
        task: task.clone(),
        cancel: &cancel,
        generation: Arc::new(()),
        attempt: &attempt,
        iteration: Some(("cursor".into(), 3, 7)),
        parents: vec![],
    };
    assert_eq!(
        bound
            .execute_workflow(context)
            .await
            .err()
            .unwrap()
            .message(),
        "workflow"
    );
    let _dispatch_owner = DispatchOwner::claim(tasks.clone()).unwrap();
    *tasks.inner.recovery_request.lock().unwrap() = Some(db::RecoverRequest::default());
    tasks
        .inner
        .active
        .store(true, std::sync::atomic::Ordering::Release);
    let admission = tasks.local_execution_admission().unwrap();
    let started = std::sync::atomic::AtomicBool::new(false);
    let admitted = AdmittedWriterTask {
        store: &store,
        task: &task,
        method: "writer",
        response_type: "response",
        started: &started,
        admission: &admission,
        cancel: &cancel,
        tasks: &tasks,
    };
    assert_eq!(
        bound
            .execute_writer(admitted)
            .await
            .err()
            .unwrap()
            .message(),
        "writer"
    );
}
