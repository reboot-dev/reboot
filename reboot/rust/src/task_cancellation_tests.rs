use super::*;
use crate::runtime::DurableStateDeclaration;
use db::tasks_server::Tasks;
fn request(task: &db::Task, token: bool) -> tonic::Request<db::CancelTaskRequest> {
    let mut request = tonic::Request::new(db::CancelTaskRequest {
        task_id: task.task_id.clone(),
    });
    request.metadata_mut().insert(
        "x-reboot-state-ref",
        task.task_id.as_ref().unwrap().state_ref.parse().unwrap(),
    );
    if token {
        request
            .metadata_mut()
            .insert("authorization", "Bearer test-admin".parse().unwrap());
    }
    request
}
#[tokio::test]
async fn cancellation_requires_policy_and_original_running_authority_before_database() {
    let (mut service, _owner, task) = task_listing_service_tests::setup(0);
    assert_eq!(
        service
            .cancel_task(request(&task, false))
            .await
            .unwrap_err()
            .code(),
        tonic::Code::Unauthenticated
    );
    service.admin = None;
    assert_eq!(
        service
            .cancel_task(request(&task, true))
            .await
            .unwrap_err()
            .code(),
        tonic::Code::PermissionDenied
    );
    for (action, expected) in [
        (1, tonic::Code::PermissionDenied),
        (2, tonic::Code::FailedPrecondition),
        (3, tonic::Code::Unavailable),
        (4, tonic::Code::Unavailable),
        (5, tonic::Code::FailedPrecondition),
    ] {
        let (service, _owner, task) = task_listing_service_tests::setup(action);
        assert_eq!(
            service
                .cancel_task(request(&task, true))
                .await
                .unwrap_err()
                .code(),
            expected,
            "action {action}"
        );
    }
}
#[tokio::test]
async fn cancellation_rejects_wrong_route_uuid_or_actor_without_database() {
    let (service, _owner, mut task) = task_listing_service_tests::setup(0);
    let mut wrong = request(&task, true);
    wrong
        .metadata_mut()
        .insert("x-reboot-state-ref", "other".parse().unwrap());
    assert_eq!(
        service.cancel_task(wrong).await.unwrap_err().code(),
        tonic::Code::InvalidArgument
    );
    task.task_id.as_mut().unwrap().task_uuid =
        uuid::Uuid::new_v5(&uuid::Uuid::NAMESPACE_OID, b"bad")
            .as_bytes()
            .to_vec();
    assert_eq!(
        service
            .cancel_task(request(&task, true))
            .await
            .unwrap_err()
            .code(),
        tonic::Code::InvalidArgument
    );
    task.task_id.as_mut().unwrap().task_uuid = uuid::Uuid::new_v4().as_bytes().to_vec();
    task.task_id.as_mut().unwrap().state_type = "other.Actor".into();
    assert_eq!(
        service
            .cancel_task(request(&task, true))
            .await
            .unwrap_err()
            .code(),
        tonic::Code::InvalidArgument
    );
}
#[test]
fn canonical_cancellation_is_distinct_from_business_or_bare_status_errors() {
    let db::task::ResponseOrError::Error(error) = cancelled_terminal("Run") else {
        unreachable!()
    };
    let status = task_cancellation_status(&error).unwrap().unwrap();
    assert_eq!(status.code(), tonic::Code::Cancelled);
    assert_eq!(status.details(), error.value);
    let mut rich = decode_task_error(&error).unwrap();
    for bad in [0, 2, 3, 10] {
        rich.code = bad;
        let bad = prost_types::Any {
            value: rich.encode_to_vec(),
            ..error.clone()
        };
        assert_eq!(
            task_cancellation_status(&bad).unwrap_err().code(),
            tonic::Code::DataLoss
        );
    }
    rich.code = tonic::Code::Cancelled as i32;
    rich.details[0].value = vec![0xff];
    assert!(
        task_cancellation_status(&prost_types::Any {
            value: rich.encode_to_vec(),
            ..error.clone()
        })
        .is_err()
    );
    rich.details[0].type_url = "type.googleapis.com/demo.BusinessError".into();
    assert!(
        task_cancellation_status(&prost_types::Any {
            value: rich.encode_to_vec(),
            ..error.clone()
        })
        .unwrap()
        .is_none()
    );
    rich.details.push(rich.details[0].clone());
    assert!(
        task_cancellation_status(&prost_types::Any {
            value: rich.encode_to_vec(),
            ..error
        })
        .is_err()
    );
}
struct D;
impl DurableStateDeclaration for D {
    type State = crate::proto::Counter;
    const STATE_TYPE: &'static str = "tests.Counter";
}
struct Binding;
#[tonic::async_trait]
impl ReaderTaskBinding for Binding {
    fn validate(&self, _: &db::Task) -> Result<(), Status> {
        Ok(())
    }
    async fn execute(&self, _: &db::Task) -> Result<prost_types::Any, Status> {
        unreachable!()
    }
}
#[tokio::test]
async fn cancellation_terminal_requires_workflow_and_cannot_be_fabricated_as_declared_error() {
    let make = |workflow| {
        let declaration =
            TaskMethodDeclaration::new::<D, crate::proto::Counter, crate::proto::Counter>(
                "tests.Service.Run",
                "type.googleapis.com/tests.Counter",
                vec![],
            );
        OneShotTasks::new_with_declarations(
            DatabaseActorStore::connect_lazy("http://127.0.0.1:1").unwrap(),
            D::STATE_TYPE.into(),
            "actor".into(),
            Binding,
            vec![if workflow {
                declaration.workflow()
            } else {
                declaration
            }],
        )
        .unwrap()
    };
    let task = db::Task {
        task_id: Some(db::TaskId {
            state_type: D::STATE_TYPE.into(),
            state_ref: "actor".into(),
            task_uuid: uuid::Uuid::new_v4().as_bytes().to_vec(),
        }),
        method: "Run".into(),
        ..Default::default()
    };
    let terminal = cancelled_terminal("Run");
    let workflow = make(true);
    assert!(workflow.validate_terminal(&task, &terminal).is_ok());
    assert!(make(false).validate_terminal(&task, &terminal).is_err());
    let db::task::ResponseOrError::Error(error) = terminal else {
        unreachable!()
    };
    assert!(workflow.validate_declared(&task, &error).is_err());
    {
        let _write = CancellationWrite {
            tasks: &workflow,
            acknowledged: true,
        };
    }
    assert!(!*workflow.inner.uncertain.borrow());
    {
        let _write = CancellationWrite {
            tasks: &workflow,
            acknowledged: false,
        };
    }
    assert!(*workflow.inner.uncertain.borrow());
}
