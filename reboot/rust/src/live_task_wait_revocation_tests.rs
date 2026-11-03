//! Source regressions; parent owns compilation, execution and native proof.
use super::*;
use db::tasks_server::Tasks;

struct Writer;
#[tonic::async_trait]
impl ReaderTaskBinding for Writer {
    fn writer_capable(&self) -> bool {
        true
    }
    fn validate(&self, task: &db::Task) -> Result<(), Status> {
        if task.method != "WelcomeEmail" {
            return Err(Status::invalid_argument("unknown method"));
        }
        Ok(())
    }
    fn validate_response(&self, _: &db::Task, response: &prost_types::Any) -> Result<(), Status> {
        if response.type_url != "type.googleapis.com/tests.reboot.Counter" {
            return Err(Status::data_loss("wrong response type"));
        }
        <crate::proto::Counter as prost::Message>::decode(response.value.as_slice())
            .map_err(|_| Status::data_loss("wrong response payload"))?;
        Ok(())
    }
    async fn execute(&self, _: &db::Task) -> Result<prost_types::Any, Status> {
        panic!("Wait must never execute")
    }
}
fn placement() -> crate::legacy_placement::PlanOnlyLegacyPlacement {
    use crate::placement_proto as proto;
    let placement = crate::legacy_placement::PlanOnlyLegacyPlacement::new();
    placement
        .install(proto::ListenForPlanResponse {
            plan: Some(proto::Plan {
                version: 1,
                applications: vec![proto::plan::Application {
                    id: "app".into(),
                    services: vec![],
                    shards: vec![proto::plan::application::Shard {
                        id: "shard".into(),
                        range: Some(proto::plan::application::shard::KeyRange {
                            first_key: vec![],
                        }),
                        server_id: "server".into(),
                        replica_index: 0,
                    }],
                }],
            }),
            servers: vec![proto::Server {
                id: "server".into(),
                application_id: "app".into(),
                address: Some(proto::server::Address {
                    host: "localhost".into(),
                    port: 5001,
                }),
                ..Default::default()
            }],
        })
        .unwrap();
    placement
}
fn catalog(
    endpoint: &str,
    capacity: usize,
    policy: crate::auth::AuthorizationPolicy,
) -> LiveTaskWaitCatalog {
    LiveTaskWaitCatalog::new(
        endpoint.into(),
        "test.Live".into(),
        capacity,
        crate::legacy_placement::LegacyApplicationId::new("app").unwrap(),
        "server".into(),
        placement(),
        policy,
    )
    .unwrap()
}
fn owner(endpoint: &str, reference: &str) -> OneShotTasks {
    OneShotTasks::new(
        DatabaseActorStore::connect_lazy(endpoint).unwrap(),
        "test.Live".into(),
        reference.into(),
        Writer,
    )
    .unwrap()
}
fn activate(tasks: &OneShotTasks, host: &RecoveryCancellation) -> DispatchOwner {
    let claim = DispatchOwner::claim(tasks.clone()).unwrap();
    *tasks.inner.recovery_owner.lock().unwrap() = Some(host.clone());
    tasks
        .inner
        .active
        .store(true, std::sync::atomic::Ordering::Release);
    claim
}
fn request(reference: &str) -> tonic::Request<db::WaitRequest> {
    let mut request = tonic::Request::new(db::WaitRequest {
        task_id: Some(db::TaskId {
            state_type: "test.Live".into(),
            state_ref: reference.into(),
            task_uuid: uuid::Uuid::new_v4().as_bytes().to_vec(),
        }),
    });
    request
        .metadata_mut()
        .insert(crate::STATE_REF_HEADER, reference.parse().unwrap());
    request
}

use std::future::{poll_fn, Future};
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::task::Poll;

struct PostLoadPolicy {
    calls: AtomicUsize,
    revoked: AtomicBool,
    entered: tokio::sync::Notify,
    release: tokio::sync::Semaphore,
}
impl crate::auth::Authorizer for PostLoadPolicy {
    fn authorize<'a>(
        &'a self, _: &'a crate::auth::AuthorizationContext,
        _: Option<&'a crate::auth::Auth>, _: Option<&'a [u8]>, _: &'a [u8],
    ) -> crate::auth::AuthorizeFuture<'a> {
        Box::pin(async move {
            // wait_exact: entry policy, pre-Load policy, post-Load policy.
            // Snapshot the allowed decision BEFORE parking this exact RPC.
            let allowed = !self.revoked.load(Ordering::SeqCst);
            if self.calls.fetch_add(1, Ordering::SeqCst) == 2 {
                self.entered.notify_one();
                self.release.acquire().await.unwrap().forget();
            }
            if allowed { crate::auth::AuthorizationDecision::Allow }
            else { crate::auth::AuthorizationDecision::PermissionDenied { message: "revoked".into() } }
        })
    }
}

#[tokio::test]
async fn post_load_allow_cannot_wait_for_placement_and_disclose_after_policy_revocation() {
    use prost::Message;
    for terminal_exists in [true, false] {
        let (endpoint, database, server) = crate::runtime::test_support::start_database().await;
        database.model_control_only_store();
        database.model_task_completion();
        let policy = Arc::new(PostLoadPolicy {
            calls: AtomicUsize::new(0), revoked: AtomicBool::new(false),
            entered: tokio::sync::Notify::new(), release: tokio::sync::Semaphore::new(0),
        });
        let catalog = catalog(&endpoint, 1,
            crate::auth::AuthorizationPolicy::new(None, Some(policy.clone())));
        let (host, _readiness) = RecoveryCancellation::test_host();
        catalog.bind_host(host.clone()).unwrap();
        let tasks = owner(&endpoint, "live620-revocation");
        let _claim = activate(&tasks, &host);
        let request = request("live620-revocation");
        let id = request.get_ref().task_id.clone().unwrap();
        if terminal_exists {
            tasks.inner.store.task_database().store(db::StoreRequest {
                sync: true,
                task_upserts: vec![db::Task {
                    task_id: Some(id.clone()), method: "WelcomeEmail".into(),
                    status: db::task::Status::Pending as i32, ..Default::default()
                }], ..Default::default()
            }).await.unwrap();
            tasks.inner.store.task_database().complete_task(db::CompleteTaskRequest {
                sync: true,
                task: Some(db::Task {
                    task_id: Some(id), method: "WelcomeEmail".into(),
                    status: db::task::Status::Completed as i32,
                    response_or_error: Some(db::task::ResponseOrError::Response(prost_types::Any {
                        type_url: "type.googleapis.com/tests.reboot.Counter".into(),
                        value: crate::proto::Counter { value: 620 }.encode_to_vec(),
                    })), ..Default::default()
                }),
            }).await.unwrap();
        }
        catalog.install(tasks, host.clone()).unwrap();
        let service = LiveTaskWaitService { catalog };
        let mut wait = Box::pin(service.wait(request));
        // Actually drive the RPC through canonical Database Load into policy IO.
        tokio::time::timeout(std::time::Duration::from_secs(10), async {
            tokio::select! {
                biased;
                result = &mut wait => panic!("Wait escaped policy barrier: {result:?}"),
                _ = policy.entered.notified() => {}
            }
        }).await.expect("post-Load policy was never reached");
        assert_eq!(policy.calls.load(Ordering::SeqCst), 3);
        host.test_set_placement_ready(false);
        policy.release.add_permits(1);
        // Poll ONCE after release: fixed path synchronously rejects; old path
        // registers its placement waiter and returns Pending. No scheduler sleep.
        let at_withdrawal = poll_fn(|cx| Poll::Ready(wait.as_mut().poll(cx))).await;
        policy.revoked.store(true, Ordering::SeqCst);
        host.test_set_placement_ready(true);
        let result = match at_withdrawal {
            Poll::Ready(result) => result,
            Poll::Pending => tokio::time::timeout(std::time::Duration::from_secs(10), &mut wait)
                .await.expect("Wait stuck after placement restoration"),
        };
        // Old readiness-await returns a terminal or NotFound here, both leaks.
        assert_eq!(result.unwrap_err().code(), tonic::Code::Unavailable,
            "must reject withdrawn authority, never disclose terminal/existence");
        server.abort();
        let _ = server.await;
    }
}
