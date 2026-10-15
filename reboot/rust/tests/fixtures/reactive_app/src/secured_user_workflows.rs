use crate::{
    arg, proto,
    secured_user::{Verifier, generated},
};
use prost::Message;
use reboot::{
    application_host::ApplicationHost,
    auth::AuthorizationPolicy,
    database_proto as db,
    one_shot_tasks::WorkflowContext,
    runtime::{DatabaseActorStore, TransactionExecution},
};
use std::{io::Write, path::PathBuf, sync::Arc, time::Duration};
const KEY: &str = "00000000-0000-4000-8000-000000000789";
fn reference() -> String {
    reboot::state_ref::StateRef::from_id("reactive.v1.OwnerWorkflows", "alice")
        .unwrap()
        .to_string()
}
#[derive(Clone)]
struct Handler {
    events: PathBuf,
    pause: PathBuf,
}
impl Handler {
    fn event(&self, name: &str) {
        let mut f = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&self.events)
            .unwrap();
        writeln!(f, "{name}").unwrap();
    }
}
#[tonic::async_trait]
impl generated::OwnerWorkflowsMethodsDatabaseHandler for Handler {
    async fn create(
        &self,
        _: &mut proto::OwnerWorkflows,
        _: proto::Empty,
    ) -> Result<proto::Empty, tonic::Status> {
        self.event("create");
        Ok(proto::Empty {})
    }
    async fn query(
        &self,
        s: &proto::OwnerWorkflows,
        _: proto::Empty,
    ) -> Result<proto::OwnerWorkflows, tonic::Status> {
        self.event("query");
        Ok(*s)
    }
    async fn first(
        &self,
        s: &mut proto::OwnerWorkflows,
        r: proto::Add,
    ) -> Result<proto::Value, tonic::Status> {
        self.event("first");
        s.first += r.amount;
        Ok(proto::Value {
            value: s.first,
            padding: vec![],
        })
    }
    async fn second(
        &self,
        s: &mut proto::OwnerWorkflows,
        r: proto::Add,
    ) -> Result<proto::Value, tonic::Status> {
        self.event("second");
        s.second += r.amount;
        Ok(proto::Value {
            value: s.second,
            padding: vec![],
        })
    }
    async fn set_claims(
        &self,
        _: &mut proto::OwnerWorkflows,
        _: proto::Empty,
    ) -> Result<proto::Empty, tonic::Status> {
        panic!("external SetClaims reached workflow handler")
    }
    async fn schedule_work(
        &self,
        _: &mut proto::OwnerWorkflows,
        _: proto::UserSchedule,
    ) -> Result<proto::UserHandle, tonic::Status> {
        Err(tonic::Status::failed_precondition("use scheduling writer"))
    }
    async fn schedule_work_scheduled(
        &self,
        s: &mut proto::OwnerWorkflows,
        r: proto::UserSchedule,
        state_ref: String,
    ) -> Result<TransactionExecution<proto::UserHandle>, tonic::Status> {
        self.event("schedule");
        let task = generated::OwnerWorkflowsMethodsTasks::run(
            &state_ref,
            &proto::Add {
                amount: r.amount,
                fail: false,
            },
            (r.not_before != 0).then_some(prost_types::Timestamp {
                seconds: r.not_before,
                nanos: 0,
            }),
        );
        let mut result = TransactionExecution::new(proto::UserHandle {
            id: task.task_id.as_ref().unwrap().task_uuid.clone(),
        });
        result.task_upserts.push(task);
        s.schedules += 1;
        Ok(result)
    }
    async fn run(
        &self,
        context: &WorkflowContext<'_>,
        r: proto::Add,
    ) -> Result<proto::UserResult, tonic::Status> {
        self.event("body");
        let first = generated::OwnerWorkflowsMethodsWorkflowSteps::first(
            context,
            Arc::new(self.clone()),
            "first-effect",
            r,
        )
        .await?;
        self.event("first-ack");
        while self.pause.exists() {
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
        let second = generated::OwnerWorkflowsMethodsWorkflowSteps::second(
            context,
            Arc::new(self.clone()),
            "second-effect",
            r,
        )
        .await?;
        self.event("second-ack");
        Ok(proto::UserResult {
            first: first.value,
            second: second.value,
        })
    }
}
struct Client {
    inner: proto::owner_workflows_methods_client::OwnerWorkflowsMethodsClient<
        tonic::transport::Channel,
    >,
    token: String,
}
impl Client {
    fn request<T>(&self, value: T, key: Option<uuid::Uuid>) -> tonic::Request<T> {
        let mut r = tonic::Request::new(value);
        r.metadata_mut()
            .insert("x-reboot-state-ref", reference().parse().unwrap());
        if self.token != "headerless" {
            r.metadata_mut().insert(
                "authorization",
                format!("Bearer {}", self.token).parse().unwrap(),
            );
        }
        if let Some(key) = key {
            r.metadata_mut()
                .insert("x-reboot-idempotency-key", key.to_string().parse().unwrap());
        }
        r.set_timeout(Duration::from_secs(5));
        r
    }
    async fn create(
        &mut self,
        v: proto::Empty,
    ) -> Result<tonic::Response<proto::Empty>, tonic::Status> {
        let r = self.request(v, Some(uuid::Uuid::new_v4()));
        self.inner.create(r).await
    }
    async fn query(
        &mut self,
        v: proto::Empty,
    ) -> Result<tonic::Response<proto::OwnerWorkflows>, tonic::Status> {
        let r = self.request(v, None);
        self.inner.query(r).await
    }
    async fn set_claims(
        &mut self,
        v: proto::Empty,
    ) -> Result<tonic::Response<proto::Empty>, tonic::Status> {
        let r = self.request(v, Some(uuid::Uuid::new_v4()));
        self.inner.set_claims(r).await
    }
    async fn schedule_work_with_key(
        &mut self,
        v: proto::UserSchedule,
        key: uuid::Uuid,
    ) -> Result<tonic::Response<proto::UserHandle>, tonic::Status> {
        let r = self.request(v, Some(key));
        self.inner.schedule_work(r).await
    }
}
async fn client(endpoint: &str, token: &str) -> Result<Client, Box<dyn std::error::Error>> {
    Ok(Client {
        inner: proto::owner_workflows_methods_client::OwnerWorkflowsMethodsClient::connect(
            endpoint.to_owned(),
        )
        .await?,
        token: token.to_owned(),
    })
}
fn schedule() -> proto::UserSchedule {
    proto::UserSchedule {
        not_before: 0,
        amount: 5,
    }
}
pub async fn run(command: &str) -> Result<(), Box<dyn std::error::Error>> {
    if command == "user-workflow-serve" {
        let store = DatabaseActorStore::connect(arg(2)).await?;
        let (adapter, tasks) = generated::OwnerWorkflowsMethodsDatabaseAdapter::new(
            store,
            Handler {
                events: arg(6).into(),
                pause: arg(7).into(),
            },
        )
        .with_authorization(AuthorizationPolicy::new(
            Some(Arc::new(Verifier(arg(5).into()))),
            None,
        ))
        .with_workflows(&reference())?;
        ApplicationHost::new("secured-user-workflows")
            .with_host_recovery(tasks.recovery(db::RecoverRequest {
                state_tags_by_state_type:
                    [("reactive.v1.OwnerWorkflows".into(), "OwnerWorkflows".into())].into(),
                shard_ids: vec!["s000000000".into()],
                skip_idempotent_mutations: true,
            }))
            .add_public_service(
                proto::owner_workflows_methods_server::OwnerWorkflowsMethodsServer::new(adapter),
            )
            .serve_with_shutdown(arg(3).parse()?, async {
                while !std::path::Path::new(&arg(4)).exists() {
                    tokio::time::sleep(Duration::from_millis(10)).await;
                }
            })
            .await?;
        return Ok(());
    }
    if command == "user-workflow-inspect" {
        let mut c = db::database_client::DatabaseClient::connect(arg(2)).await?;
        let id = db::TaskId {
            state_type: "reactive.v1.OwnerWorkflows".into(),
            state_ref: reference(),
            task_uuid: uuid::Uuid::parse_str(&arg(3))?.as_bytes().to_vec(),
        };
        let loaded = c
            .load(db::LoadRequest {
                actors: vec![],
                task_ids: vec![id.clone()],
            })
            .await?
            .into_inner();
        assert_eq!(loaded.tasks.len(), 1);
        let task = loaded.tasks.first().ok_or("missing task")?;
        assert_eq!(task.task_id.as_ref(), Some(&id));
        assert_eq!(task.method, "Run");
        assert_eq!(task.iteration, 0);
        assert_eq!(
            proto::Add::decode(task.request.as_slice())?,
            proto::Add {
                amount: 5,
                fail: false
            }
        );
        if let Some(terminal) = &task.response_or_error {
            match terminal {
                db::task::ResponseOrError::Response(any) => {
                    assert_eq!(any.type_url, "type.googleapis.com/reactive.v1.UserResult");
                    assert_eq!(
                        proto::UserResult::decode(any.value.as_slice())?,
                        proto::UserResult {
                            first: 5,
                            second: 5
                        }
                    );
                }
                db::task::ResponseOrError::Error(_) => panic!("workflow terminated with error"),
            }
        }
        let workflow_id = id.task_uuid.clone();
        let mut stream = c
            .recover_idempotent_mutations(db::RecoverIdempotentMutationsRequest {
                state_type: id.state_type,
                state_ref: id.state_ref,
                idempotency_key: None,
                workflow_id: Some(id.task_uuid),
                workflow_iteration: None,
            })
            .await?
            .into_inner();
        let mut count = 0;
        let mut records = Vec::new();
        let mut keys = std::collections::BTreeSet::new();
        let mut methods = std::collections::BTreeSet::new();
        while let Some(batch) = stream.message().await? {
            for m in batch.idempotent_mutations {
                assert_eq!(m.workflow_id.as_ref(), Some(&workflow_id));
                assert_eq!(m.workflow_iteration, None);
                assert!(keys.insert(m.key.clone()), "duplicate checkpoint key");
                let request = proto::Add {
                    amount: 5,
                    fail: false,
                };
                let (alias, method) = [
                    ("first-effect", "reactive.v1.OwnerWorkflowsMethods.First"),
                    ("second-effect", "reactive.v1.OwnerWorkflowsMethods.Second"),
                ]
                .into_iter()
                .find(|(alias, method)| {
                    let identity = format!(
                        "reboot.workflow.named-step.v1:{}:{}:{}:{}:{}",
                        task.method,
                        task.request
                            .iter()
                            .map(|b| format!("{b:02x}"))
                            .collect::<String>(),
                        alias,
                        method,
                        "type.googleapis.com/reactive.v1.Value"
                    );
                    m.request_fingerprint.as_ref()
                        == Some(&reboot::runtime::request_fingerprint(&identity, &request))
                })
                .expect("named checkpoint fingerprint mismatch");
                assert_eq!(
                    m.key,
                    uuid::Uuid::new_v5(&uuid::Uuid::from_slice(&workflow_id)?, alias.as_bytes())
                        .as_bytes()
                        .to_vec()
                );
                assert!(methods.insert(method), "duplicate checkpoint method");
                let any = prost_types::Any::decode(m.response.as_slice())?;
                assert_eq!(any.type_url, "type.googleapis.com/reactive.v1.Value");
                assert_eq!(
                    proto::Value::decode(any.value.as_slice())?,
                    proto::Value {
                        value: 5,
                        padding: vec![]
                    }
                );
                records.push(format!(
                    "\"{}\"",
                    m.encode_to_vec()
                        .iter()
                        .map(|b| format!("{b:02x}"))
                        .collect::<String>()
                ));
                count += 1;
            }
        }
        println!(
            "{{\"status\":{},\"has_terminal\":{},\"checkpoints\":{},\"records\":[{}]}}",
            task.status,
            task.response_or_error.is_some(),
            count,
            records.join(",")
        );
        return Ok(());
    }
    let endpoint = arg(2);
    if command == "user-workflow-exercise" {
        for (token, code) in [
            ("headerless", tonic::Code::Unauthenticated),
            ("missing", tonic::Code::Unauthenticated),
            ("payload-forgery", tonic::Code::Unauthenticated),
            ("other", tonic::Code::PermissionDenied),
            ("reject", tonic::Code::Unauthenticated),
        ] {
            let mut c = client(&endpoint, token).await?;
            assert_eq!(c.create(proto::Empty {}).await.unwrap_err().code(), code);
            assert_eq!(c.query(proto::Empty {}).await.unwrap_err().code(), code);
            assert_eq!(
                c.schedule_work_with_key(schedule(), KEY.parse()?)
                    .await
                    .unwrap_err()
                    .code(),
                code
            );
        }
        assert!(!std::path::Path::new(&arg(4)).exists());
        let mut database = db::database_client::DatabaseClient::connect(arg(5)).await?;
        let absent = database
            .load(db::LoadRequest {
                actors: vec![db::Actor {
                    state_type: "reactive.v1.OwnerWorkflows".into(),
                    state_ref: reference(),
                    state: None,
                }],
                task_ids: vec![],
            })
            .await?
            .into_inner();
        assert!(
            absent.actors.iter().all(|a| a.state.is_none()),
            "denied calls created actor state"
        );
        let mut c = client(&endpoint, "owner").await?;
        assert!(
            c.schedule_work_with_key(schedule(), KEY.parse()?)
                .await
                .is_err(),
            "scheduling must not implicitly construct User"
        );
        assert!(!std::path::Path::new(&arg(4)).exists());
        c.create(proto::Empty {}).await?;
        assert_eq!(
            c.set_claims(proto::Empty {}).await.unwrap_err().code(),
            tonic::Code::PermissionDenied
        );
        let handle = c
            .schedule_work_with_key(schedule(), KEY.parse()?)
            .await?
            .into_inner();
        assert_eq!(
            c.schedule_work_with_key(schedule(), KEY.parse()?)
                .await?
                .into_inner(),
            handle
        );
        std::fs::write(arg(3), "revoked")?;
        assert_eq!(
            c.schedule_work_with_key(schedule(), KEY.parse()?)
                .await
                .unwrap_err()
                .code(),
            tonic::Code::PermissionDenied
        );
        println!("{}", uuid::Uuid::from_slice(&handle.id)?);
    } else if command == "user-workflow-restart" {
        let mut c = client(&endpoint, "owner").await?;
        assert_eq!(
            c.schedule_work_with_key(schedule(), KEY.parse()?)
                .await
                .unwrap_err()
                .code(),
            tonic::Code::PermissionDenied
        );
        std::fs::remove_file(arg(3))?;
        let handle = c
            .schedule_work_with_key(schedule(), KEY.parse()?)
            .await?
            .into_inner();
        assert_eq!(uuid::Uuid::from_slice(&handle.id)?.to_string(), arg(4));
        let s = c.query(proto::Empty {}).await?.into_inner();
        assert_eq!((s.first, s.second, s.schedules), (5, 5, 1));
        println!("secured_workflow_recovered=5,5,1");
    } else {
        return Err(format!("unknown workflow command {command}").into());
    }
    Ok(())
}
