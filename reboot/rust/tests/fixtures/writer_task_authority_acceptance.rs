use reboot_rust_schema::{
    application_host::{ApplicationHost, ApplicationHostError, PlacementPlannerRecovery},
    one_shot_tasks::{AdmittedWriterTask, OneShotTasks, ReaderTaskBinding, WriterTaskReceipt},
    runtime::{DatabaseActorStore, DurableStateDeclaration},
};
use std::sync::Arc;
const METHOD: &str = "tests.reboot.protoc.TransactionCounterWritesMethods.Apply";
const RESPONSE: &str = "type.googleapis.com/tests.reboot.protoc.TransactionCounterValue";
#[derive(Clone, PartialEq, prost::Message)]
struct CompatibleTaskRequest {
    #[prost(int64, tag = "1")]
    value: i64,
}
struct CounterDeclaration;
impl DurableStateDeclaration for CounterDeclaration {
    type State = TaskCounter;
    const STATE_TYPE: &'static str = "tests.reboot.protoc.TransactionCounter";
}
struct CustomWriter {
    mode: &'static str,
    endpoint: String,
    entered: Arc<tokio::sync::Notify>,
    dropped: Arc<std::sync::atomic::AtomicBool>,
    calls: Arc<std::sync::atomic::AtomicUsize>,
    observed: Arc<std::sync::Mutex<Option<database::Task>>>,
}
#[tonic::async_trait]
impl ReaderTaskBinding for CustomWriter {
    fn validate(&self, task: &database::Task) -> Result<(), tonic::Status> {
        if !matches!(task.method.as_str(), "Apply" | "ApplyDeclared") {
            return Err(tonic::Status::invalid_argument("wrong method"));
        }
        TaskCounter::decode(task.request.as_slice())
            .map_err(|_| tonic::Status::invalid_argument("request"))?;
        Ok(())
    }
    async fn execute(&self, _: &database::Task) -> Result<prost_types::Any, tonic::Status> {
        panic!("writer entered reader path")
    }
    fn writer_capable(&self) -> bool {
        true
    }
    fn is_writer(&self, _: &database::Task) -> bool {
        true
    }
    fn writer_method(&self, _: &database::Task) -> Option<&'static str> {
        Some(if self.mode == "declared-wrong-full" {
            "other.Service.ApplyDeclared"
        } else if self.mode.starts_with("declared") {
            "tests.reboot.protoc.TransactionCounterWritesMethods.ApplyDeclared"
        } else {
            METHOD
        })
    }
    fn writer_response_type(&self, _: &database::Task) -> Option<&'static str> {
        Some(RESPONSE)
    }
    fn validate_response(
        &self,
        _: &database::Task,
        response: &prost_types::Any,
    ) -> Result<(), tonic::Status> {
        if response.type_url != RESPONSE {
            return Err(tonic::Status::data_loss("wrong response type"));
        }
        TaskCounter::decode(response.value.as_slice())
            .map_err(|_| tonic::Status::data_loss("response"))?;
        Ok(())
    }
    fn validate_terminal(
        &self,
        _: &database::Task,
        _: &database::task::ResponseOrError,
    ) -> Result<(), tonic::Status> {
        Ok(())
    }
    async fn execute_writer(
        &self,
        admitted: AdmittedWriterTask<'_>,
    ) -> Result<WriterTaskReceipt, tonic::Status> {
        *self.observed.lock().unwrap() = Some(admitted.task().clone());
        if self.mode == "discard" {
            let _ = admitted;
            self.entered.notify_one();
            // There is no public receipt constructor or Any-success escape hatch.
            return Err(tonic::Status::failed_precondition(
                "discarded capability cannot complete",
            ));
        }
        let calls = self.calls.clone();
        if self.mode == "declared-wrong-request" {
            return admitted
                .execute_outcome::<CounterDeclaration, CompatibleTaskRequest, TaskCounter, _>(
                    move |_, _| {
                        Box::pin(async move {
                            panic!("compatible wire types cannot replace registered request type")
                        })
                    },
                )
                .await;
        }
        let mode = self.mode;
        let receipt = if self.mode.starts_with("declared") || self.mode == "forged-declared" {
            admitted.execute_outcome::<CounterDeclaration, TaskCounter, TaskCounter, _>(move |state, request| {
                Box::pin(async move {
                    calls.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
                    assert_eq!(request.value, 3);
                    state.value += 1000;
                    let mut error = reboot_rust_schema::declared_error_status(
                        tonic::Code::Unknown, "declared", if mode == "declared-undeclared" { "type.googleapis.com/other.Error" } else { "type.googleapis.com/tests.reboot.protoc.TransactionLimitExceeded" }, &TaskCounter { value: 4242 });
                    if mode == "declared-malformed" {
                        error = tonic::Status::with_details(tonic::Code::Unknown, "malformed", vec![0xff].into());
                    }
                    Err(reboot_rust_schema::one_shot_tasks::TaskHandlerError::declared(error))
                })
            }).await?
        } else {
            admitted
                .execute::<CounterDeclaration, TaskCounter, TaskCounter, _>(
                    move |state, request| {
                        Box::pin(async move {
                            calls.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
                            assert_eq!(
                                request.value, 3,
                                "decode must use persisted canonical request"
                            );
                            state.value += request.value;
                            Ok(state.clone())
                        })
                    },
                )
                .await?
        };
        if self.mode.starts_with("declared-cas-") {
            let mut competing = self.observed.lock().unwrap().clone().unwrap();
            competing.status = database::task::Status::Completed as i32;
            let status = reboot_rust_schema::declared_error_status(
                tonic::Code::Unknown,
                "declared",
                "type.googleapis.com/tests.reboot.protoc.TransactionLimitExceeded",
                &TaskCounter {
                    value: if self.mode == "declared-cas-equal" {
                        4242
                    } else {
                        999
                    },
                },
            );
            competing.response_or_error =
                Some(database::task::ResponseOrError::Error(prost_types::Any {
                    type_url: "type.googleapis.com/google.rpc.Status".into(),
                    value: status.details().to_vec(),
                }));
            assert!(
                database::database_client::DatabaseClient::connect(self.endpoint.clone())
                    .await
                    .unwrap()
                    .complete_task(database::CompleteTaskRequest {
                        task: Some(competing),
                        sync: true
                    })
                    .await?
                    .into_inner()
                    .completed
            );
        }
        if self.mode == "cas-false" {
            let mut competing = self.observed.lock().unwrap().clone().unwrap();
            competing.status = database::task::Status::Completed as i32;
            competing.response_or_error = Some(database::task::ResponseOrError::Response(
                prost_types::Any {
                    type_url: RESPONSE.into(),
                    value: TaskCounter { value: 999 }.encode_to_vec(),
                },
            ));
            assert!(
                database::database_client::DatabaseClient::connect(self.endpoint.clone())
                    .await
                    .unwrap()
                    .complete_task(database::CompleteTaskRequest {
                        task: Some(competing),
                        sync: true
                    })
                    .await?
                    .into_inner()
                    .completed
            );
        }
        if matches!(self.mode, "park" | "declared-park") {
            struct Dropped(Arc<std::sync::atomic::AtomicBool>);
            impl Drop for Dropped {
                fn drop(&mut self) {
                    self.0.store(true, std::sync::atomic::Ordering::SeqCst);
                }
            }
            let _drop = Dropped(self.dropped.clone());
            self.entered.notify_one();
            std::future::pending::<()>().await;
        }
        self.entered.notify_one();
        Ok(receipt)
    }
}
fn canonical_task(reference: &str) -> database::Task {
    database::Task {
        task_id: Some(database::TaskId {
            state_type: CounterDeclaration::STATE_TYPE.into(),
            state_ref: reference.into(),
            task_uuid: Uuid::new_v4().as_bytes().to_vec(),
        }),
        method: "Apply".into(),
        request: TaskCounter { value: 3 }.encode_to_vec(),
        status: database::task::Status::Pending as i32,
        ..Default::default()
    }
}
async fn seed_task(
    endpoint: &str,
    task: database::Task,
    checkpoint: Option<database::IdempotentMutation>,
) {
    database::database_client::DatabaseClient::connect(endpoint.to_owned())
        .await
        .unwrap()
        .store(database::StoreRequest {
            task_upserts: vec![task],
            idempotent_mutation: checkpoint,
            sync: true,
            ..Default::default()
        })
        .await
        .unwrap();
}
async fn checkpoint_records(
    endpoint: &str,
    id: &database::TaskId,
) -> Vec<database::IdempotentMutation> {
    let mut stream = database::database_client::DatabaseClient::connect(endpoint.to_owned())
        .await
        .unwrap()
        .recover_idempotent_mutations(database::RecoverIdempotentMutationsRequest {
            state_type: id.state_type.clone(),
            state_ref: id.state_ref.clone(),
            idempotency_key: Some(
                reboot_rust_schema::runtime::writer_task_key(id, METHOD)
                    .unwrap()
                    .as_bytes()
                    .to_vec(),
            ),
            ..Default::default()
        })
        .await
        .unwrap()
        .into_inner();
    let mut records = vec![];
    while let Some(batch) = stream.message().await.unwrap() {
        records.extend(batch.idempotent_mutations);
    }
    records
}
#[test]
#[ignore = "requires REBOOT_NATIVE2PC_CXX_DATABASE real C++ Database/RocksDB"]
fn custom_writer_receipt_store_and_replay_binding_drop_fails_graceful_shutdown() {
    for vector in ["discard", "store", "replay", "declared-park"] {
        let mut db = CxxDatabase::start(std::env::var("REBOOT_NATIVE2PC_CXX_DATABASE").unwrap());
        let runtime = tokio::runtime::Runtime::new().unwrap();
        let reference = reboot_rust_schema::state_ref::StateRef::from_id(
            CounterDeclaration::STATE_TYPE,
            vector,
        )
        .unwrap()
        .to_string();
        runtime.block_on(store_counter(&db.endpoint(), &reference, 5));
        let mut task = canonical_task(&reference);
        if vector == "declared-park" {
            task.method = "ApplyDeclared".into();
        }
        let id = task.task_id.clone().unwrap();
        let checkpoint = (vector == "replay").then(|| database::IdempotentMutation {
            state_type: id.state_type.clone(),
            state_ref: reference.clone(),
            key: reboot_rust_schema::runtime::writer_task_key(&id, METHOD)
                .unwrap()
                .as_bytes()
                .to_vec(),
            request_fingerprint: Some(reboot_rust_schema::runtime::request_fingerprint(
                METHOD,
                &TaskCounter { value: 3 },
            )),
            response: TaskCounter { value: 8 }.encode_to_vec(),
            ..Default::default()
        });
        runtime.block_on(seed_task(&db.endpoint(), task.clone(), checkpoint));
        let listen = port();
        let plan = placement_proto::ListenForPlanResponse::decode(
            URL_SAFE_NO_PAD
                .decode(legacy_plan_for(&[(&reference, listen)]))
                .unwrap()
                .as_slice(),
        )
        .unwrap();
        let planner = LivePlannerServer::start(&runtime, plan);
        runtime.block_on(async {
            let entered = Arc::new(tokio::sync::Notify::new());
            let dropped = Arc::new(std::sync::atomic::AtomicBool::new(false));
            let calls = Arc::new(std::sync::atomic::AtomicUsize::new(0));
            let observed = Arc::new(std::sync::Mutex::new(None));
            let store = DatabaseActorStore::connect(db.endpoint()).await.unwrap();
            let gate = store.actor_gate(&id.state_type, &reference);
            let tasks = OneShotTasks::new_with_declarations(store, id.state_type.clone(), reference.clone(), CustomWriter {
                endpoint: db.endpoint(), mode: if vector == "discard" { "discard" } else if vector == "declared-park" { "declared-park" } else { "park" }, entered: entered.clone(), dropped: dropped.clone(), calls: calls.clone(), observed: observed.clone()
            }, if vector == "declared-park" { vec![reboot_rust_schema::one_shot_tasks::TaskMethodDeclaration::new::<CounterDeclaration, TaskCounter, TaskCounter>(
                "tests.reboot.protoc.TransactionCounterWritesMethods.ApplyDeclared", RESPONSE,
                vec![reboot_rust_schema::one_shot_tasks::DeclaredTaskError::new::<TaskCounter>("type.googleapis.com/tests.reboot.protoc.TransactionLimitExceeded")])] } else { vec![] }).unwrap();
            let placement = reboot_rust_schema::legacy_placement::PlanOnlyLegacyPlacement::new();
            let app = reboot_rust_schema::legacy_placement::LegacyApplicationId::new("generated-cxx-database-process").unwrap();
            let host = ApplicationHost::new("generated-cxx-database-process")
                .with_legacy_placement_readiness(placement.clone())
                .with_host_recovery(PlacementPlannerRecovery::new(&planner.endpoint, placement.clone()).unwrap())
                .with_host_recovery(tasks.recovery(database::RecoverRequest { state_tags_by_state_type: [(id.state_type.clone(), "TransactionCounter".into())].into(), shard_ids: vec!["s000000000".into()], skip_idempotent_mutations: true }))
                .add_public_service(tasks.wait_service(app, "server-0", placement));
            let (shutdown, stopped) = tokio::sync::oneshot::channel();
            let serving = tokio::spawn(host.serve_with_shutdown(format!("127.0.0.1:{listen}").parse().unwrap(), async { let _ = stopped.await; }));
            if tokio::time::timeout(Duration::from_secs(5), entered.notified()).await.is_err() {
                panic!("vector {vector}: receipt not reached; host result {:?}", serving.await);
            }
            assert_eq!(*observed.lock().unwrap(), Some(task.clone()));
            if vector != "discard" {
                let before = checkpoint_records(&db.endpoint(), &id).await;
                assert_eq!(before.len(), usize::from(vector != "declared-park"));
                if vector != "declared-park" {
                assert_eq!(before[0].request_fingerprint, Some(reboot_rust_schema::runtime::request_fingerprint(METHOD, &TaskCounter { value: 3 })));
                assert_eq!(before[0].response, TaskCounter { value: 8 }.encode_to_vec());
                }
                assert!(tokio::time::timeout(Duration::from_millis(50), gate.exclusive()).await.is_err(), "whole custom binding still owns exclusive lease after receipt minted");
                let queued_gate = gate.clone(); let queued_tasks = tasks.clone(); let queued_drop = dropped.clone();
                let queued_writer = tokio::spawn(async move {
                    let _admitted = queued_gate.exclusive().await;
                    assert!(queued_drop.load(std::sync::atomic::Ordering::SeqCst), "binding future must drop first");
                    assert!(queued_tasks.has_uncertain_operation(), "actual failure must latch BEFORE queued exclusive readmission");
                });
                shutdown.send(()).unwrap();
                tokio::time::timeout(Duration::from_secs(5), queued_writer).await.unwrap().unwrap();
            }
            let result = tokio::time::timeout(Duration::from_secs(5), serving).await.unwrap().unwrap();
            assert!(matches!(result, Err(ApplicationHostError::RecoveryTask(ref status)) if status.code() == tonic::Code::Unavailable || (vector == "discard" && status.code() == tonic::Code::FailedPrecondition)), "must propagate dropped durable receipt, not successful shutdown: {result:?}");
            assert_eq!(dropped.load(std::sync::atomic::Ordering::SeqCst), vector != "discard");
            assert_eq!(calls.load(std::sync::atomic::Ordering::SeqCst), usize::from(matches!(vector, "store" | "declared-park")));
            let _released = tokio::time::timeout(Duration::from_secs(1), gate.exclusive()).await.unwrap();
            assert_eq!(task_vertical_acceptance::load_task(&db.endpoint(), id.clone()).await, task);
            assert!(tokio::net::TcpStream::connect(format!("127.0.0.1:{listen}")).await.is_err(), "failed host listener must close");
        });
        db.restart();
        assert_eq!(
            runtime.block_on(task_vertical_acceptance::load_task(&db.endpoint(), id)),
            task
        );
        assert_eq!(
            runtime.block_on(load_state(&db.endpoint(), &reference)),
            Some(
                TaskCounter {
                    value: if vector == "store" { 8 } else { 5 }
                }
                .encode_to_vec()
            )
        );
    }
}

#[test]
#[ignore = "requires REBOOT_NATIVE2PC_CXX_DATABASE real C++ Database/RocksDB"]
fn custom_writer_negative_checkpoint_missing_actor_and_losing_cas_preserve_records() {
    for vector in [
        "absent-fingerprint",
        "empty-fingerprint",
        "different-request",
        "different-full-method",
        "malformed-response",
        "task-ids",
        "missing-actor",
        "cas-false",
        "forged-declared",
    ] {
        let mut db = CxxDatabase::start(std::env::var("REBOOT_NATIVE2PC_CXX_DATABASE").unwrap());
        let runtime = tokio::runtime::Runtime::new().unwrap();
        let reference = reboot_rust_schema::state_ref::StateRef::from_id(
            CounterDeclaration::STATE_TYPE,
            vector,
        )
        .unwrap()
        .to_string();
        if vector != "missing-actor" {
            runtime.block_on(store_counter(&db.endpoint(), &reference, 5));
        }
        let task = canonical_task(&reference);
        let id = task.task_id.clone().unwrap();
        let mut checkpoint = database::IdempotentMutation {
            state_type: id.state_type.clone(),
            state_ref: reference.clone(),
            key: reboot_rust_schema::runtime::writer_task_key(&id, METHOD)
                .unwrap()
                .as_bytes()
                .to_vec(),
            request_fingerprint: Some(reboot_rust_schema::runtime::request_fingerprint(
                METHOD,
                &TaskCounter { value: 3 },
            )),
            response: TaskCounter { value: 8 }.encode_to_vec(),
            ..Default::default()
        };
        match vector {
            "absent-fingerprint" => checkpoint.request_fingerprint = None,
            "empty-fingerprint" => checkpoint.request_fingerprint = Some(vec![]),
            "different-request" => {
                checkpoint.request_fingerprint =
                    Some(reboot_rust_schema::runtime::request_fingerprint(
                        METHOD,
                        &TaskCounter { value: 4 },
                    ))
            }
            "different-full-method" => {
                checkpoint.request_fingerprint =
                    Some(reboot_rust_schema::runtime::request_fingerprint(
                        "other.Service.Apply",
                        &TaskCounter { value: 3 },
                    ))
            }
            "malformed-response" => checkpoint.response = vec![0xff],
            "task-ids" => checkpoint.task_ids = vec![id.clone()],
            _ => {}
        }
        runtime.block_on(seed_task(
            &db.endpoint(),
            task.clone(),
            (!matches!(vector, "missing-actor" | "cas-false" | "forged-declared"))
                .then_some(checkpoint),
        ));
        let before = runtime.block_on(checkpoint_records(&db.endpoint(), &id));
        let listen = port();
        let plan = placement_proto::ListenForPlanResponse::decode(
            URL_SAFE_NO_PAD
                .decode(legacy_plan_for(&[(&reference, listen)]))
                .unwrap()
                .as_slice(),
        )
        .unwrap();
        let planner = LivePlannerServer::start(&runtime, plan);
        runtime.block_on(async {
            let calls = Arc::new(std::sync::atomic::AtomicUsize::new(0));
            let tasks = OneShotTasks::new(DatabaseActorStore::connect(db.endpoint()).await.unwrap(), id.state_type.clone(), reference.clone(), CustomWriter {
                endpoint: db.endpoint(), mode: if vector == "cas-false" { "cas-false" } else if vector == "forged-declared" { "forged-declared" } else { "complete" },
                entered: Arc::new(tokio::sync::Notify::new()), dropped: Arc::new(false.into()), calls: calls.clone(), observed: Arc::new(std::sync::Mutex::new(None)),
            }).unwrap();
            let placement = reboot_rust_schema::legacy_placement::PlanOnlyLegacyPlacement::new();
            let app = reboot_rust_schema::legacy_placement::LegacyApplicationId::new("generated-cxx-database-process").unwrap();
            let host = ApplicationHost::new("generated-cxx-database-process")
                .with_legacy_placement_readiness(placement.clone())
                .with_host_recovery(PlacementPlannerRecovery::new(&planner.endpoint, placement.clone()).unwrap())
                .with_host_recovery(tasks.recovery(database::RecoverRequest { state_tags_by_state_type: [(id.state_type.clone(), "TransactionCounter".into())].into(), shard_ids: vec!["s000000000".into()], skip_idempotent_mutations: true }))
                .add_public_service(tasks.wait_service(app, "server-0", placement));
            let result = tokio::time::timeout(Duration::from_secs(5), host.serve_with_shutdown(format!("127.0.0.1:{listen}").parse().unwrap(), std::future::pending::<()>())).await.unwrap();
            assert!(matches!(result, Err(ApplicationHostError::RecoveryTask(ref status)) if status.code() == if vector == "malformed-response" { tonic::Code::DataLoss } else { tonic::Code::FailedPrecondition }), "vector {vector}: {result:?}");
            assert_eq!(calls.load(std::sync::atomic::Ordering::SeqCst), usize::from(matches!(vector, "cas-false" | "forged-declared")));
        });
        let expected = runtime.block_on(task_vertical_acceptance::load_task(
            &db.endpoint(),
            id.clone(),
        ));
        if vector == "cas-false" {
            assert_eq!(expected.status, database::task::Status::Completed as i32);
            assert_eq!(
                expected.response_or_error,
                Some(database::task::ResponseOrError::Response(
                    prost_types::Any {
                        type_url: RESPONSE.into(),
                        value: TaskCounter { value: 999 }.encode_to_vec()
                    }
                ))
            );
        } else {
            assert_eq!(
                expected, task,
                "negative replay may not rewrite any pending field: {vector}"
            );
            assert_eq!(
                runtime.block_on(checkpoint_records(&db.endpoint(), &id)),
                before
            );
        }
        db.restart();
        assert_eq!(
            runtime.block_on(task_vertical_acceptance::load_task(&db.endpoint(), id)),
            expected
        );
        assert_eq!(
            runtime.block_on(load_state(&db.endpoint(), &reference)),
            if vector == "missing-actor" {
                None
            } else {
                Some(
                    TaskCounter {
                        value: if vector == "cas-false" { 8 } else { 5 },
                    }
                    .encode_to_vec(),
                )
            }
        );
    }
}
