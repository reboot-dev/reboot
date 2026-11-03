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
            assert!(matches!(
                context.method.as_str(),
                "rbt.v1alpha1.Tasks.ListTasks"
                    | "rbt.v1alpha1.Tasks.ListTasksStream"
                    | "rbt.v1alpha1.Tasks.CancelTask"
            ));
            assert!(auth.is_some());
            assert!(state.is_none());
            if context.method.ends_with("CancelTask") {
                db::CancelTaskRequest::decode(request).unwrap();
            } else {
                db::ListTasksRequest::decode(request).unwrap();
            }
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
pub(super) fn setup(action: u8) -> (ReaderTaskWaitService, DispatchOwner, db::Task) {
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

#[tokio::test]
async fn stream_initial_change_coalescing_and_no_duplicate_observations() {
    use tonic::codegen::tokio_stream::StreamExt;
    let (service, owner, task) = setup(0);
    let mut stream = service
        .list_tasks_stream(request(Some("server"), true))
        .await
        .unwrap()
        .into_inner();
    let initial = stream.next().await.unwrap().unwrap();
    assert_eq!(
        initial.tasks[0].status,
        db::task_info::Status::Scheduled as i32
    );
    assert!(
        tokio::time::timeout(std::time::Duration::from_millis(450), stream.next())
            .await
            .is_err(),
        "unchanged scans must not publish duplicates"
    );
    owner.tasks.inner.listing.started(&task);
    let changed = tokio::time::timeout(std::time::Duration::from_secs(1), stream.next())
        .await
        .unwrap()
        .unwrap()
        .unwrap();
    assert_eq!(
        changed.tasks[0].status,
        db::task_info::Status::Started as i32
    );
    // Two changes without a pull: only the latest observation is returned.
    owner
        .tasks
        .inner
        .listing
        .retry(&task, std::time::Duration::from_millis(20));
    owner.tasks.inner.listing.observe(&[]);
    assert!(stream.next().await.unwrap().unwrap().tasks.is_empty());
    assert!(
        tokio::time::timeout(std::time::Duration::from_millis(450), stream.next())
            .await
            .is_err()
    );
}

#[tokio::test]
async fn stream_auth_scope_and_policy_await_authority_match_unary_fences() {
    for action in 0..=5 {
        let (mut service, _owner, _) = setup(action);
        let result = service
            .list_tasks_stream(request(Some("server"), true))
            .await;
        match action {
            0 => {
                assert!(result.is_ok());
                for (server, expected) in [
                    (None, tonic::Code::Unimplemented),
                    (Some("other"), tonic::Code::Unavailable),
                ] {
                    assert_eq!(
                        service
                            .list_tasks_stream(request(server, true))
                            .await
                            .err()
                            .unwrap()
                            .code(),
                        expected
                    );
                }
                assert_eq!(
                    service
                        .list_tasks_stream(request(Some("server"), false))
                        .await
                        .err()
                        .unwrap()
                        .code(),
                    tonic::Code::Unauthenticated
                );
                service.admin = None;
                assert_eq!(
                    service
                        .list_tasks_stream(request(Some("server"), true))
                        .await
                        .err()
                        .unwrap()
                        .code(),
                    tonic::Code::PermissionDenied
                );
            }
            1 => assert_eq!(result.err().unwrap().code(), tonic::Code::PermissionDenied),
            _ => assert_eq!(result.err().unwrap().code(), tonic::Code::Unavailable),
        }
    }
}

#[tokio::test]
async fn stream_original_generation_and_authority_revoked_even_without_cache_change() {
    use tonic::codegen::tokio_stream::StreamExt;
    for action in 2..=5 {
        let (service, owner, _) = setup(0);
        let mut stream = service
            .list_tasks_stream(request(Some("server"), true))
            .await
            .unwrap()
            .into_inner();
        stream.next().await.unwrap().unwrap();
        match action {
            2 => *owner.tasks.inner.running_owner.lock().unwrap() = Some(Arc::new(())),
            3 => {
                owner.tasks.inner.uncertain.send_replace(true);
            }
            4 => install(&service.placement, 2, "other"),
            5 => owner
                .tasks
                .inner
                .active
                .store(false, std::sync::atomic::Ordering::Release),
            _ => unreachable!(),
        }
        assert_eq!(
            tokio::time::timeout(std::time::Duration::from_secs(1), stream.next())
                .await
                .expect(
                    "revoked stream must terminate within one second even without cache changes"
                )
                .unwrap()
                .unwrap_err()
                .code(),
            tonic::Code::Unavailable
        );
        assert!(
            stream.next().await.is_none(),
            "terminal error must close stream"
        );
    }
}

struct StreamPolicy {
    revoke: Option<OneShotTasks>,
    mode: std::sync::atomic::AtomicU8,
    calls: std::sync::atomic::AtomicUsize,
    entered: tokio::sync::Notify,
    dropped: Arc<std::sync::atomic::AtomicBool>,
}
struct PolicyDrop(Arc<std::sync::atomic::AtomicBool>);
impl Drop for PolicyDrop {
    fn drop(&mut self) {
        self.0.store(true, std::sync::atomic::Ordering::Release);
    }
}
impl TokenVerifier for StreamPolicy {
    fn verify<'a>(&'a self, _: &'a AuthorizationContext, _: Option<&'a str>) -> VerifyFuture<'a> {
        Box::pin(async { TokenVerification::Authenticated(Auth::new(serde_json::json!(true))) })
    }
}
impl Authorizer for StreamPolicy {
    fn authorize<'a>(
        &'a self,
        context: &'a AuthorizationContext,
        _: Option<&'a Auth>,
        _: Option<&'a [u8]>,
        _: &'a [u8],
    ) -> AuthorizeFuture<'a> {
        Box::pin(async move {
            assert_eq!(context.method, "rbt.v1alpha1.Tasks.ListTasksStream");
            self.calls.fetch_add(1, std::sync::atomic::Ordering::AcqRel);
            match self.mode.load(std::sync::atomic::Ordering::Acquire) {
                1 => AuthorizationDecision::PermissionDenied {
                    message: "revoked".into(),
                },
                2 => {
                    let _drop = PolicyDrop(self.dropped.clone());
                    self.entered.notify_one();
                    std::future::pending().await
                }
                3 => {
                    tokio::task::yield_now().await;
                    *self
                        .revoke
                        .as_ref()
                        .expect("revocation fixture owner")
                        .inner
                        .running_owner
                        .lock()
                        .unwrap() = Some(Arc::new(()));
                    AuthorizationDecision::Allow
                }
                _ => AuthorizationDecision::Allow,
            }
        })
    }
}
#[tokio::test]
async fn stream_rechecks_policy_and_drop_cancels_the_owned_policy_future() {
    use std::sync::atomic::{AtomicBool, AtomicU8, AtomicUsize, Ordering};
    use tonic::codegen::tokio_stream::StreamExt;
    let (service, _owner, _) = setup(0);
    let policy = Arc::new(StreamPolicy {
        revoke: None,
        mode: AtomicU8::new(0),
        calls: AtomicUsize::new(0),
        entered: tokio::sync::Notify::new(),
        dropped: Arc::new(AtomicBool::new(false)),
    });
    let service = service.with_admin_authorization(policy.clone(), policy.clone());
    let mut stream = service
        .list_tasks_stream(request(Some("server"), true))
        .await
        .unwrap()
        .into_inner();
    stream.next().await.unwrap().unwrap();
    assert!(
        tokio::time::timeout(std::time::Duration::from_millis(650), stream.next())
            .await
            .is_err()
    );
    assert!(policy.calls.load(Ordering::Acquire) >= 3);
    policy.mode.store(1, Ordering::Release);
    assert_eq!(
        stream.next().await.unwrap().unwrap_err().code(),
        tonic::Code::PermissionDenied
    );
    assert!(stream.next().await.is_none());
    policy.mode.store(0, Ordering::Release);
    let mut stream = service
        .list_tasks_stream(request(Some("server"), true))
        .await
        .unwrap()
        .into_inner();
    stream.next().await.unwrap().unwrap();
    policy.mode.store(2, Ordering::Release);
    {
        let next = stream.next();
        tokio::pin!(next);
        tokio::select! { _ = &mut next => panic!("parked policy returned"), _ = policy.entered.notified() => {} }
    }
    assert!(!policy.dropped.load(Ordering::Acquire));
    drop(stream);
    assert!(
        policy.dropped.load(Ordering::Acquire),
        "stream drop must cancel policy, not detach it"
    );
    let calls = policy.calls.load(Ordering::Acquire);
    tokio::time::sleep(std::time::Duration::from_millis(250)).await;
    assert_eq!(policy.calls.load(Ordering::Acquire), calls);
}

#[tokio::test]
async fn stream_later_policy_await_revalidates_original_generation_before_disclosure() {
    use std::sync::atomic::{AtomicBool, AtomicU8, AtomicUsize, Ordering};
    use tonic::codegen::tokio_stream::StreamExt;
    let (service, owner, _) = setup(0);
    let policy = Arc::new(StreamPolicy {
        revoke: Some(owner.tasks.clone()),
        mode: AtomicU8::new(0),
        calls: AtomicUsize::new(0),
        entered: tokio::sync::Notify::new(),
        dropped: Arc::new(AtomicBool::new(false)),
    });
    let service = service.with_admin_authorization(policy.clone(), policy.clone());
    let mut stream = service
        .list_tasks_stream(request(Some("server"), true))
        .await
        .unwrap()
        .into_inner();
    stream.next().await.unwrap().unwrap();
    policy.mode.store(3, Ordering::Release);
    assert_eq!(
        tokio::time::timeout(std::time::Duration::from_secs(1), stream.next())
            .await
            .expect("post-policy generation revocation must terminate the stream")
            .unwrap()
            .unwrap_err()
            .code(),
        tonic::Code::Unavailable
    );
    assert_eq!(policy.calls.load(Ordering::Acquire), 2);
    assert!(stream.next().await.is_none());
}
