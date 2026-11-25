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
#[tokio::test]
async fn late_exact_writer_owners_retained_bounded_revoked_and_host_fenced() {
    let endpoint = "http://127.0.0.1:1";
    let catalog = catalog(
        endpoint,
        2,
        crate::auth::AuthorizationPolicy::permissive_for_development(),
    );
    let service = catalog.service();
    fn named<T: tonic::server::NamedService>(_: &T) {
        assert_eq!(T::NAME, "rbt.v1alpha1.Tasks");
    }
    named(&service);
    let (host, _ready) = RecoveryCancellation::test_host();
    catalog.bind_host(host.clone()).unwrap();
    assert!(catalog.bind_host(host.clone()).is_err());
    let a = owner(endpoint, "live608-a");
    let b = owner(endpoint, "live608-b");
    let c = owner(endpoint, "live608-c");
    let _claims = [
        activate(&a, &host),
        activate(&b, &host),
        activate(&c, &host),
    ];
    catalog.install(a.clone(), host.clone()).unwrap();
    catalog.install(b.clone(), host.clone()).unwrap();
    assert_eq!(
        catalog.install(a.clone(), host.clone()).unwrap_err().code(),
        tonic::Code::AlreadyExists
    );
    assert_eq!(
        catalog.install(c, host.clone()).unwrap_err().code(),
        tonic::Code::ResourceExhausted
    );
    let id = request("live608-a").into_inner().task_id.unwrap();
    let entry = catalog.lookup(&id).unwrap();
    assert!(Arc::ptr_eq(&entry.tasks.inner, &a.inner));
    let weak = Arc::downgrade(&a.inner);
    drop(a);
    assert!(weak.upgrade().is_some());
    catalog.revoke("live608-a").unwrap();
    assert!(entry.check().is_err());
    assert_eq!(catalog.inner.entries.lock().unwrap().len(), 2);
    let (other, _) = RecoveryCancellation::test_host();
    assert!(catalog.install(owner(endpoint, "other"), other).is_err());
    host.cancel();
    let id = request("live608-b").into_inner().task_id.unwrap();
    assert!(catalog.lookup(&id).unwrap().check().is_err());
}
#[tokio::test]
async fn live_unknown_default_policy_and_ref_validation_do_not_load_or_discover() {
    let catalog = catalog(
        "http://127.0.0.1:1",
        2,
        crate::auth::AuthorizationPolicy::default(),
    );
    let service = LiveTaskWaitService {
        catalog: catalog.clone(),
    };
    assert_eq!(
        service.wait(request("unknown")).await.unwrap_err().code(),
        tonic::Code::PermissionDenied
    );
    let mut mismatch = request("unknown");
    mismatch
        .metadata_mut()
        .insert(crate::STATE_REF_HEADER, "different".parse().unwrap());
    assert_eq!(
        service.wait(mismatch).await.unwrap_err().code(),
        tonic::Code::InvalidArgument
    );
    assert!(catalog.inner.entries.lock().unwrap().is_empty());
    assert_eq!(
        service
            .cancel_task(tonic::Request::new(Default::default()))
            .await
            .unwrap_err()
            .code(),
        tonic::Code::PermissionDenied
    );
}

#[tokio::test]
async fn completed_only_late_two_owners_use_canonical_load_and_typed_result() {
    use prost::Message;
    let (endpoint, database, server) = crate::runtime::test_support::start_database().await;
    database.model_control_only_store();
    database.model_task_completion();
    let catalog = catalog(
        &endpoint,
        2,
        crate::auth::AuthorizationPolicy::permissive_for_development(),
    );
    // Bind the actual generated Tasks service before either late owner exists.
    // This exercises real HTTP/2, not ApplicationHost startup qualification.
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    let (stop, stopped) = tokio::sync::oneshot::channel();
    let wait_server = tokio::spawn(tonic::transport::Server::builder()
        .add_service(catalog.service())
        .serve_with_incoming_shutdown(tokio_stream::wrappers::TcpListenerStream::new(listener), async move {
            let _ = stopped.await;
        }));
    let mut service = db::tasks_client::TasksClient::connect(format!("http://{address}")).await.unwrap();
    let (host, _readiness) = RecoveryCancellation::test_host();
    catalog.bind_host(host.clone()).unwrap();
    let a = owner(&endpoint, "live608-completed-a");
    let b = owner(&endpoint, "live608-completed-b");
    let _claims = [activate(&a, &host), activate(&b, &host)];
    // No Recover: both exact identities are supplied by trusted composition.
    // Both install after the fixed service allocation above.
    for tasks in [&a, &b] {
        let request = request(&tasks.inner.state_ref);
        let id = request.get_ref().task_id.clone().unwrap();
        let response = prost_types::Any {
            type_url: "type.googleapis.com/tests.reboot.Counter".into(),
            value: crate::proto::Counter { value: 608 }.encode_to_vec(),
        };
        tasks
            .inner
            .store
            .task_database()
            .store(db::StoreRequest {
                sync: true,
                task_upserts: vec![db::Task {
                    task_id: Some(id.clone()),
                    method: "WelcomeEmail".into(),
                    status: db::task::Status::Pending as i32,
                    response_or_error: None,
                    ..Default::default()
                }],
                ..Default::default()
            })
            .await
            .unwrap();
        tasks.inner.store.task_database().complete_task(db::CompleteTaskRequest {
            task: Some(db::Task {
                task_id: Some(id.clone()), method: "WelcomeEmail".into(),
                status: db::task::Status::Completed as i32,
                response_or_error: Some(db::task::ResponseOrError::Response(response.clone())),
                ..Default::default()
            }), sync: true,
        }).await.unwrap();
        catalog.install(tasks.clone(), host.clone()).unwrap();
        let mut wrong = self::request(&tasks.inner.state_ref);
        wrong.get_mut().task_id = Some(id);
        wrong
            .metadata_mut()
            .insert("x-reboot-task-method", "wrong".parse().unwrap());
        assert_eq!(
            service.wait(wrong).await.unwrap_err().code(),
            tonic::Code::FailedPrecondition
        );
        let result = service.wait(request).await.unwrap().into_inner();
        let Some(db::task_response_or_error::ResponseOrError::Response(actual)) =
            result.response_or_error.unwrap().response_or_error
        else {
            panic!("typed response expected")
        };
        assert_eq!(
            crate::proto::Counter::decode(actual.value.as_slice())
                .unwrap()
                .value,
            608
        );
    }
    let mut wrong_method = request("live608-completed-a");
    // Unknown IDs remain canonical not-found, never manufacture a terminal.
    wrong_method
        .metadata_mut()
        .insert("x-reboot-task-method", "wrong".parse().unwrap());
    assert!(service.wait(wrong_method).await.is_err());
    host.cancel();
    drop(service);
    let _ = stop.send(());
    wait_server.await.unwrap().unwrap();
    server.abort();
    let _ = server.await;
}
