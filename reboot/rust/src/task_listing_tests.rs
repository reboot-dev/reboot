use super::*;
use crate::auth::*;
use db::tasks_server::Tasks;

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
struct Admin {
    tasks: OneShotTasks,
    placement: crate::legacy_placement::PlanOnlyLegacyPlacement,
    action: u8,
}
impl TokenVerifier for Admin {
    fn verify<'a>(
        &'a self,
        _: &'a AuthorizationContext,
        token: Option<&'a str>,
    ) -> VerifyFuture<'a> {
        Box::pin(async move {
            if token == Some("test-admin") {
                TokenVerification::Authenticated(Auth::new(serde_json::json!(true)))
            } else {
                TokenVerification::Unauthenticated {
                    message: "denied".into(),
                }
            }
        })
    }
}
impl Authorizer for Admin {
    fn authorize<'a>(
        &'a self,
        context: &'a AuthorizationContext,
        auth: Option<&'a Auth>,
        state: Option<&'a [u8]>,
        request: &'a [u8],
    ) -> AuthorizeFuture<'a> {
        Box::pin(async move {
            use prost::Message;
            assert_eq!(context.method, "rbt.v1alpha1.Tasks.ListTasks");
            assert!(auth.is_some());
            assert!(state.is_none());
            db::ListTasksRequest::decode(request).unwrap();
            tokio::task::yield_now().await;
            match self.action {
                1 => {
                    return AuthorizationDecision::PermissionDenied {
                        message: "denied".into(),
                    };
                }
                2 => {
                    *self.tasks.inner.running_owner.lock().unwrap() = Some(Arc::new(()));
                }
                3 => {
                    self.tasks.inner.uncertain.send_replace(true);
                }
                4 => install(&self.placement, 2, "other"),
                5 => self
                    .tasks
                    .inner
                    .active
                    .store(false, std::sync::atomic::Ordering::Release),
                _ => {}
            }
            AuthorizationDecision::Allow
        })
    }
}
fn install(
    placement: &crate::legacy_placement::PlanOnlyLegacyPlacement,
    version: i64,
    server: &str,
) {
    use crate::placement_proto as p;
    placement
        .install(p::ListenForPlanResponse {
            plan: Some(p::Plan {
                version,
                applications: vec![p::plan::Application {
                    id: "application".into(),
                    services: vec![p::plan::application::Service {
                        full_name: "rbt.v1alpha1.Tasks".into(),
                        state_type_full_name: "test.Actor".into(),
                    }],
                    shards: vec![p::plan::application::Shard {
                        id: "shard".into(),
                        range: Some(p::plan::application::shard::KeyRange { first_key: vec![] }),
                        server_id: server.into(),
                        replica_index: 0,
                    }],
                }],
            }),
            servers: vec![p::Server {
                id: server.into(),
                application_id: "application".into(),
                address: Some(p::server::Address {
                    host: "127.0.0.1".into(),
                    port: 9991,
                }),
                ..Default::default()
            }],
        })
        .unwrap();
}
fn setup(action: u8) -> (ReaderTaskWaitService, DispatchOwner, db::Task) {
    let reference = uuid::Uuid::new_v4().to_string();
    let tasks = OneShotTasks::new(
        DatabaseActorStore::connect_lazy("http://127.0.0.1:1").unwrap(),
        "test.Actor".into(),
        reference.clone(),
        Binding,
    )
    .unwrap();
    let owner = DispatchOwner::claim(tasks.clone()).unwrap();
    tasks
        .inner
        .active
        .store(true, std::sync::atomic::Ordering::Release);
    *tasks.inner.recovery_request.lock().unwrap() = Some(db::RecoverRequest::default());
    let task = db::Task {
        task_id: Some(db::TaskId {
            state_type: "test.Actor".into(),
            state_ref: reference,
            task_uuid: uuid::Uuid::new_v4().as_bytes().to_vec(),
        }),
        method: "Query".into(),
        timestamp: Some(prost_types::Timestamp {
            seconds: 4_000_000_000,
            nanos: 0,
        }),
        ..Default::default()
    };
    tasks.inner.listing.observe(std::slice::from_ref(&task));
    let placement = crate::legacy_placement::PlanOnlyLegacyPlacement::new();
    install(&placement, 1, "server");
    let admin = Arc::new(Admin {
        tasks: tasks.clone(),
        placement: placement.clone(),
        action,
    });
    let service = ReaderTaskWaitService::new(
        [tasks],
        crate::legacy_placement::LegacyApplicationId::new("application").unwrap(),
        "server",
        placement,
    )
    .unwrap()
    .with_admin_authorization(admin.clone(), admin);
    (service, owner, task)
}
fn request(server: Option<&str>, token: bool) -> tonic::Request<db::ListTasksRequest> {
    let mut request = tonic::Request::new(db::ListTasksRequest {
        only_server_id: server.map(str::to_owned),
    });
    if token {
        request
            .metadata_mut()
            .insert("authorization", "Bearer test-admin".parse().unwrap());
    }
    request
}
#[tokio::test]
async fn administrative_listing_requires_explicit_policy_and_both_decisions() {
    let (mut service, owner, _) = setup(0);
    assert_eq!(
        service
            .list_tasks(request(Some("server"), false))
            .await
            .unwrap_err()
            .code(),
        tonic::Code::Unauthenticated
    );
    service.admin = None;
    assert_eq!(
        service
            .list_tasks(request(Some("server"), true))
            .await
            .unwrap_err()
            .code(),
        tonic::Code::PermissionDenied
    );
    drop(owner);
    let (service, _owner2, _) = setup(1);
    assert_eq!(
        service
            .list_tasks(request(Some("server"), true))
            .await
            .unwrap_err()
            .code(),
        tonic::Code::PermissionDenied
    );
}
#[tokio::test]
async fn listing_observes_phases_without_database_load_and_rejects_unsupported_scope() {
    let (service, owner, task) = setup(0);
    let list = service
        .list_tasks(request(Some("server"), true))
        .await
        .unwrap()
        .into_inner()
        .tasks;
    assert_eq!(list.len(), 1);
    assert_eq!(list[0].task_id, task.task_id);
    assert_eq!(list[0].status, db::task_info::Status::Scheduled as i32);
    assert_eq!(list[0].scheduled_at, task.timestamp);
    owner.tasks.inner.listing.started(&task);
    assert_eq!(
        service
            .list_tasks(request(Some("server"), true))
            .await
            .unwrap()
            .into_inner()
            .tasks[0]
            .status,
        db::task_info::Status::Started as i32
    );
    assert_eq!(
        service
            .list_tasks(request(None, true))
            .await
            .unwrap_err()
            .code(),
        tonic::Code::Unimplemented
    );
    assert_eq!(
        service
            .list_tasks(request(Some("other"), true))
            .await
            .unwrap_err()
            .code(),
        tonic::Code::Unavailable
    );
    *owner.tasks.inner.recovery_request.lock().unwrap() = None;
    assert_eq!(
        service
            .list_tasks(request(Some("server"), true))
            .await
            .unwrap_err()
            .code(),
        tonic::Code::Unimplemented
    );
    drop(owner);
    assert_eq!(
        service
            .list_tasks(request(Some("server"), true))
            .await
            .unwrap_err()
            .code(),
        tonic::Code::Unavailable
    );
}
#[tokio::test]
async fn policy_await_cannot_disclose_after_generation_uncertainty_placement_or_stop_change() {
    for action in 2..=5 {
        let (service, _owner, _) = setup(action);
        assert_eq!(
            service
                .list_tasks(request(Some("server"), true))
                .await
                .unwrap_err()
                .code(),
            tonic::Code::Unavailable,
            "action {action}"
        );
    }
}
