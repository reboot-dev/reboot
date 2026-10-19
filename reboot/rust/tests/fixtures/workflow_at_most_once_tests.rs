// Private SDK behavioral tests, NOT public application-admission acceptance.
// The transport fake is unconditional Store, never a CAS surrogate. The ignored
// native case uses real C++ Database and RocksDB process restart without Cargo.
use super::*;
use crate::runtime::DurableStateDeclaration;
use prost::Message;
use std::sync::atomic::{AtomicUsize, Ordering};
struct D;
impl DurableStateDeclaration for D {
    type State = crate::proto::Counter;
    const STATE_TYPE: &'static str = "tests.reboot.protoc.Counter";
}
struct Binding;
#[tonic::async_trait]
impl ReaderTaskBinding for Binding {
    fn validate(&self, _: &db::Task) -> Result<(), Status> {
        Ok(())
    }
    fn writer_capable(&self) -> bool {
        true
    }
    fn validate_response(&self, task: &db::Task, response: &prost_types::Any) -> Result<(), Status> {
        if task.method != "Initialize" {
            return Err(Status::data_loss("unregistered effects task method"));
        }
        TaskMethodDeclaration::new::<D, crate::proto::Counter, crate::proto::Counter>(
            "tests.Effects.Initialize",
            "type.googleapis.com/tests.reboot.protoc.Counter",
            vec![],
        )
        .workflow()
        .validate_terminal(&db::task::ResponseOrError::Response(response.clone()))
    }
    async fn execute(&self, _: &db::Task) -> Result<prost_types::Any, Status> {
        panic!("effects fixture does not dispatch readers")
    }
}
struct Fixture {
    tasks: OneShotTasks,
    task: db::Task,
    cancel: RecoveryCancellation,
    _owner: DispatchOwner,
}
impl Fixture {
    async fn new(endpoint: &str, actor: &str, task: Option<db::Task>) -> Self {
        Self::new_decl(endpoint, actor, task, false).await
    }
    async fn new_decl(endpoint: &str, actor: &str, task: Option<db::Task>, cursor: bool) -> Self {
        let store = DatabaseActorStore::connect(endpoint).await.unwrap();
        let tasks = OneShotTasks::new_with_declarations(
            store.clone(),
            D::STATE_TYPE.into(),
            actor.into(),
            Binding,
            vec![
                TaskMethodDeclaration::new::<D, crate::proto::Counter, crate::proto::Counter>(
                    "tests.Effects.Initialize",
                    "type.googleapis.com/tests.reboot.protoc.Counter",
                    vec![],
                )
                .workflow()
                .with_test_cursor(cursor),
            ],
        )
        .unwrap();
        let fresh = task.is_none();
        let task = task.unwrap_or_else(|| db::Task {
            task_id: Some(db::TaskId {
                state_type: D::STATE_TYPE.into(),
                state_ref: actor.into(),
                task_uuid: uuid::Uuid::new_v4().as_bytes().to_vec(),
            }),
            method: "Initialize".into(),
            status: db::task::Status::Pending as i32,
            request: crate::proto::Counter { value: 7 }.encode_to_vec(),
            ..Default::default()
        });
        if fresh {
            // Canonical test arrangement only, not supported public scheduling.
            store
                .task_database()
                .store(db::StoreRequest {
                    task_upserts: vec![task.clone()],
                    ensure_state_types_created: vec![D::STATE_TYPE.into()],
                    sync: true,
                    ..Default::default()
                })
                .await
                .unwrap();
        }
        let owner = DispatchOwner::claim(tasks.clone()).unwrap();
        *tasks.inner.recovery_request.lock().unwrap() = Some(db::RecoverRequest::default());
        tasks.inner.active.store(true, Ordering::Release);
        let (cancel, _) = RecoveryCancellation::test_host();
        Self {
            tasks,
            task,
            cancel,
            _owner: owner,
        }
    }
    fn context<'a>(&'a self, attempt: &'a WorkflowAttempt) -> WorkflowContext<'a> {
        WorkflowContext {
            tasks: &self.tasks,
            task: self.task.clone(),
            cancel: &self.cancel,
            generation: self
                .tasks
                .inner
                .running_owner
                .lock()
                .unwrap()
                .clone()
                .unwrap(),
            attempt,
            iteration: None,
            parents: vec![],
        }
    }
}
async fn fake() -> (
    Fixture,
    crate::runtime::test_support::FakeDatabase,
    tokio::task::JoinHandle<()>,
) {
    let (endpoint, database, server) = crate::runtime::test_support::start_database().await;
    database.model_control_only_store();
    (
        Fixture::new(&endpoint, "effects", None).await,
        database,
        server,
    )
}
#[tokio::test]
async fn started_ack_precedes_construction_and_callback_releases_actor_gate() {
    let (f, database, server) = fake().await;
    let attempt = WorkflowAttempt::default();
    let context = f.context(&attempt);
    let constructed = AtomicUsize::new(0);
    let gate = f.tasks.inner.store.actor_gate(D::STATE_TYPE, "effects");
    let (entered, release) = database.park_store();
    let run = context.at_most_once_unit("make greetings", 1, || {
        constructed.fetch_add(1, Ordering::SeqCst);
        assert_eq!(database.store_requests().len(), 2); // seed task + Started
        async {
            let _same_actor_rpc_admission =
                tokio::time::timeout(std::time::Duration::from_secs(1), gate.exclusive())
                    .await
                    .unwrap();
            Ok(())
        }
    });
    tokio::pin!(run);
    tokio::select! { result = &mut run => panic!("premature result: {result:?}"), result = entered => result.unwrap() }
    assert_eq!(constructed.load(Ordering::SeqCst), 0);
    release.send(()).unwrap();
    run.await.unwrap();
    assert_eq!(constructed.load(Ordering::SeqCst), 1);
    assert!(attempt.clean());
    let requests = database.store_requests();
    assert_eq!(requests.len(), 3);
    for request in &requests[1..] {
        assert!(
            request.sync && request.actor_upserts.is_empty() && request.task_upserts.is_empty()
        );
        assert!(request.colocated_upserts.is_empty() && request.transaction.is_none());
    }
    context
        .at_most_once_unit("make greetings", 1, || async { panic!("Stored reentered") })
        .await
        .unwrap();
    assert_eq!(database.store_requests().len(), 3);
    assert_eq!(
        context
            .at_most_once_unit("make greetings", 2, || async {
                panic!("version changed reentered")
            })
            .await
            .unwrap_err()
            .code(),
        tonic::Code::FailedPrecondition
    );
    server.abort();
}
#[tokio::test]
async fn failure_and_cancelled_callback_leave_started_and_taint_local_retry() {
    for cancel_callback in [false, true] {
        let (f, database, server) = fake().await;
        let attempt = WorkflowAttempt::default();
        let context = f.context(&attempt);
        if cancel_callback {
            let (entered_tx, entered_rx) = tokio::sync::oneshot::channel();
            let mut run = Box::pin(context.at_most_once_unit("block", 1, || async {
                entered_tx.send(()).unwrap();
                std::future::pending::<Result<(), Status>>().await
            }));
            tokio::select! { result = &mut run => panic!("premature {result:?}"), result = entered_rx => result.unwrap() }
            drop(run);
        } else {
            assert!(
                context
                    .at_most_once_unit("block", 1, || async {
                        Err(Status::unavailable(
                            "external transport is not retry permission",
                        ))
                    })
                    .await
                    .is_err()
            );
        }
        assert!(!attempt.clean());
        assert!(!*f.tasks.inner.uncertain.borrow()); // ACKed Started, no ACK in flight
        assert_eq!(database.store_requests().len(), 2);
        let replay_attempt = WorkflowAttempt::default();
        assert_eq!(
            f.context(&replay_attempt)
                .at_most_once_unit("block", 1, || async { panic!("Started reentered") })
                .await
                .unwrap_err()
                .code(),
            tonic::Code::FailedPrecondition
        );
        server.abort();
    }
}
#[tokio::test]
async fn lost_start_and_store_ack_are_sticky_and_fail_host_before_gate_release() {
    for at_store in [false, true] {
        let (f, database, server) = fake().await;
        let attempt = WorkflowAttempt::default();
        let context = f.context(&attempt);
        let calls = AtomicUsize::new(0);
        // Retain the actual gate incarnation, as a queued ordinary writer does.
        // The registry is weak: a later lookup after every owner drops is new.
        let gate = f.tasks.inner.store.actor_gate(D::STATE_TYPE, "effects");
        let (parked_tx, parked_rx) = tokio::sync::oneshot::channel();
        let initial = if at_store {
            None
        } else {
            Some(database.park_store())
        };
        let mut run = Box::pin(context.at_most_once_unit("block", 1, || {
            calls.fetch_add(1, Ordering::SeqCst);
            async {
                if at_store {
                    parked_tx.send(database.park_store()).unwrap();
                }
                Ok(())
            }
        }));
        let (entered, release) = if let Some(parked) = initial {
            parked
        } else {
            tokio::select! { result = &mut run => panic!("premature {result:?}"), result = parked_rx => result.unwrap() }
        };
        tokio::select! { result = &mut run => panic!("premature {result:?}"), result = entered => result.unwrap() }
        drop(run); // destroys the real future and its ACK guards
        assert_eq!(calls.load(Ordering::SeqCst), usize::from(at_store));
        assert!(*f.tasks.inner.uncertain.borrow());
        assert_eq!(
            f.cancel.public_ready().await.unwrap_err().code(),
            tonic::Code::Unavailable
        );
        let mut revisions = gate.committed_revisions();
        assert!(workflow_reader_lease(&gate, &mut revisions).await.is_err());
        let replay = WorkflowAttempt::default();
        assert!(
            f.context(&replay)
                .at_most_once_unit("block", 1, || async { panic!("uncertainty reentered") })
                .await
                .is_err()
        );
        let _ = release.send(());
        server.abort();
    }
}
#[tokio::test]
async fn revoked_generation_and_canonical_request_change_reject_before_callback() {
    let (f, database, server) = fake().await;
    let attempt = WorkflowAttempt::default();
    let stale = f.context(&attempt);
    *f.tasks.inner.running_owner.lock().unwrap() = Some(Arc::new(()));
    assert!(
        stale
            .at_most_once_unit("block", 1, || async { panic!("stale owner") })
            .await
            .is_err()
    );
    let attempt = WorkflowAttempt::default();
    let current = f.context(&attempt);
    let mut changed = f.task.clone();
    changed.request = crate::proto::Counter { value: 99 }.encode_to_vec();
    database.seed_task(changed);
    assert!(
        current
            .at_most_once_unit("block", 1, || async { panic!("changed canonical request") })
            .await
            .is_err()
    );
    let mut wrong_actor = f.task.clone();
    wrong_actor.task_id.as_mut().unwrap().state_ref = "wrong-actor".into();
    let attempt = WorkflowAttempt::default();
    let mut context = f.context(&attempt);
    context.task = wrong_actor;
    assert!(
        context
            .at_most_once_unit("block", 1, || async { panic!("wrong actor") })
            .await
            .is_err()
    );
    let mut wrong_method = f.task.clone();
    wrong_method.method = "NotRegistered".into();
    let attempt = WorkflowAttempt::default();
    let mut context = f.context(&attempt);
    context.task = wrong_method;
    assert!(
        context
            .at_most_once_unit("block", 1, || async { panic!("wrong method") })
            .await
            .is_err()
    );
    assert_eq!(database.store_requests().len(), 1);
    server.abort();
}

struct NativeDatabase {
    state: tempfile::TempDir,
    port: u16,
    child: std::process::Child,
    binary: String,
}
impl NativeDatabase {
    fn start() -> Self {
        let binary =
            std::env::var("REBOOT_NATIVE2PC_CXX_DATABASE").expect("real C++ Database binary");
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        drop(listener);
        let state = tempfile::tempdir().unwrap();
        std::fs::write(
            state.path().join("server-info.pb"),
            db::ServerInfo {
                shard_infos: vec![db::ShardInfo {
                    shard_id: "s000000000".into(),
                    shard_first_key: vec![],
                }],
            }
            .encode_to_vec(),
        )
        .unwrap();
        let child = Self::spawn(&binary, state.path(), port);
        let mut database = Self {
            state,
            port,
            child,
            binary,
        };
        database.wait();
        database
    }
    fn spawn(binary: &str, state: &std::path::Path, port: u16) -> std::process::Child {
        std::process::Command::new(binary)
            .arg(state.join("rocksdb"))
            .arg(state.join("server-info.pb"))
            .arg(port.to_string())
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::inherit())
            .spawn()
            .unwrap()
    }
    fn endpoint(&self) -> String {
        format!("http://127.0.0.1:{}", self.port)
    }
    fn wait(&mut self) {
        for _ in 0..200 {
            assert!(
                self.child.try_wait().unwrap().is_none(),
                "C++ Database exited before readiness"
            );
            if std::net::TcpStream::connect(("127.0.0.1", self.port)).is_ok() {
                return;
            }
            std::thread::sleep(std::time::Duration::from_millis(25));
        }
        panic!("C++ Database did not listen");
    }
    fn restart(&mut self) {
        self.child.kill().unwrap();
        self.child.wait().unwrap();
        self.child = Self::spawn(&self.binary, self.state.path(), self.port);
        self.wait();
    }
}
impl Drop for NativeDatabase {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
#[ignore = "requires REBOOT_NATIVE2PC_CXX_DATABASE, real C++/RocksDB; no public host acceptance"]
async fn native_started_and_stored_survive_database_process_restart_and_new_owner() {
    let mut database = NativeDatabase::start();
    for complete in [false, true] {
        let actor = if complete {
            "effects-native-stored"
        } else {
            "effects-native-started"
        };
        let f = Fixture::new(&database.endpoint(), actor, None).await;
        let task = f.task.clone();
        let attempt = WorkflowAttempt::default();
        let calls = AtomicUsize::new(0);
        let context = f.context(&attempt);
        let result = context
            .at_most_once_unit("make greetings", 1, || {
                calls.fetch_add(1, Ordering::SeqCst);
                async {
                    // Real same-actor gate admission and concurrent canonical writer
                    // simulate the external Proxy->Reboot path's actor mutation. This
                    // proves gate/state mechanics, NOT generated gRPC sample routing.
                    let gate = f.tasks.inner.store.actor_gate(D::STATE_TYPE, actor);
                    let _lease =
                        tokio::time::timeout(std::time::Duration::from_secs(1), gate.exclusive())
                            .await
                            .unwrap();
                    f.tasks
                        .inner
                        .store
                        .task_database()
                        .store(db::StoreRequest {
                            actor_upserts: vec![db::Actor {
                                state_type: D::STATE_TYPE.into(),
                                state_ref: actor.into(),
                                state: Some(crate::proto::Counter { value: 42 }.encode_to_vec()),
                            }],
                            sync: true,
                            ..Default::default()
                        })
                        .await?;
                    if complete {
                        Ok(())
                    } else {
                        Err(Status::cancelled("native partial-effect window"))
                    }
                }
            })
            .await;
        assert_eq!(result.is_ok(), complete);
        assert_eq!(calls.load(Ordering::SeqCst), 1);
        drop(f); // release old authority before restarting/rebuilding
        database.restart();
        let f = Fixture::new(&database.endpoint(), actor, Some(task.clone())).await;
        let attempt = WorkflowAttempt::default();
        let result = f
            .context(&attempt)
            .at_most_once_unit("make greetings", 1, || async {
                panic!("native restart reentered callback")
            })
            .await;
        assert_eq!(result.is_ok(), complete);
        if !complete {
            assert_eq!(result.unwrap_err().code(), tonic::Code::FailedPrecondition);
        }
        let loaded = f
            .tasks
            .inner
            .store
            .task_database()
            .load(db::LoadRequest {
                actors: vec![db::Actor {
                    state_type: D::STATE_TYPE.into(),
                    state_ref: actor.into(),
                    state: None,
                }],
                task_ids: vec![task.task_id.clone().unwrap()],
            })
            .await
            .unwrap()
            .into_inner();
        assert_eq!(loaded.tasks, vec![task]);
        assert_eq!(loaded.actors.len(), 1);
        assert_eq!(
            crate::proto::Counter::decode(loaded.actors[0].state.as_ref().unwrap().as_slice())
                .unwrap()
                .value,
            42,
            "Stored must never overwrite the callback's newer actor state"
        );
        // Read durable checkpoint through the production recovery/validation path.
        let seed = uuid::Uuid::from_slice(&f.task.task_id.as_ref().unwrap().task_uuid).unwrap();
        let attempt = WorkflowAttempt::default();
        let context = f.context(&attempt);
        let key = context.checkpoint_key(
            uuid::Uuid::new_v5(&seed, b"reboot.at-most-once.unit.v1"),
            "make greetings",
            Some("at-most-once.unit.v1"),
        );
        let contract = AtMostOnceUnitContract {
            method: "tests.Effects.Initialize".into(),
            request: f.task.request.clone(),
            alias: "make greetings".into(),
            version: 1,
            bound: 0,
            parent_bounds: String::new(),
            result_type: AT_MOST_ONCE_UNIT_TYPE.into(),
        };
        let saved = f
            .tasks
            .inner
            .store
            .workflow_at_most_once_load(&context, key, &contract)
            .await
            .unwrap()
            .unwrap();
        assert_eq!(
            saved,
            if complete {
                AtMostOnceUnitCheckpoint::stored()
            } else {
                AtMostOnceUnitCheckpoint::started()
            }
        );
        drop(f);
    }
}

#[tokio::test]
async fn finite_scope_alias_and_contract_changes_fail_closed_and_distinct_aliases_run() {
    let (f, _, server) = fake().await;
    let attempt = WorkflowAttempt::default();
    let context = f.context(&attempt);
    context
        .iteration("batch", 0, 2)
        .unwrap()
        .at_most_once_unit("block", 1, || async { Ok(()) })
        .await
        .unwrap();
    let replay = WorkflowAttempt::default();
    let context = f.context(&replay);
    assert!(
        context
            .iteration("batch", 0, 3)
            .unwrap()
            .at_most_once_unit("block", 1, || async { panic!("changed bound") })
            .await
            .is_err()
    );
    let independent = WorkflowAttempt::default();
    let context = f.context(&independent);
    context
        .iteration("batch", 1, 2)
        .unwrap()
        .at_most_once_unit("block", 1, || async { Ok(()) })
        .await
        .unwrap();
    context
        .at_most_once_unit("other block", 1, || async { Ok(()) })
        .await
        .unwrap();
    assert!(independent.clean());
    server.abort();
}
#[tokio::test]
async fn corrupt_checkpoint_cannot_invoke_callback() {
    let (f, database, server) = fake().await;
    let attempt = WorkflowAttempt::default();
    f.context(&attempt)
        .at_most_once_unit("block", 1, || async { Ok(()) })
        .await
        .unwrap();
    let mut corrupt = database.store_requests().last().unwrap().clone();
    corrupt.idempotent_mutation.as_mut().unwrap().response = vec![255];
    f.tasks
        .inner
        .store
        .task_database()
        .store(corrupt)
        .await
        .unwrap();
    let replay = WorkflowAttempt::default();
    assert_eq!(
        f.context(&replay)
            .at_most_once_unit("block", 1, || async { panic!("corrupt replay") })
            .await
            .unwrap_err()
            .code(),
        tonic::Code::DataLoss
    );
    server.abort();
}
#[tokio::test]
async fn simultaneous_same_alias_never_constructs_second_callback() {
    let (f, _, server) = fake().await;
    let first_attempt = WorkflowAttempt::default();
    let first = f.context(&first_attempt);
    let second_attempt = WorkflowAttempt::default();
    let second = f.context(&second_attempt);
    let (entered_tx, entered_rx) = tokio::sync::oneshot::channel();
    let (release_tx, release_rx) = tokio::sync::oneshot::channel();
    let mut run = Box::pin(first.at_most_once_unit("block", 1, || async {
        entered_tx.send(()).unwrap();
        release_rx.await.unwrap();
        Ok(())
    }));
    tokio::select! { result = &mut run => panic!("premature {result:?}"), result = entered_rx => result.unwrap() }
    assert_eq!(
        second
            .at_most_once_unit("block", 1, || async { panic!("concurrent duplicate") })
            .await
            .unwrap_err()
            .code(),
        tonic::Code::FailedPrecondition
    );
    release_tx.send(()).unwrap();
    run.await.unwrap();
    server.abort();
}

#[tokio::test]
async fn at_least_once_result_memoizes_and_replays_without_callback() {
    let (f, database, server) = fake().await;
    let attempt = WorkflowAttempt::default();
    let context = f.context(&attempt);
    let constructed = AtomicUsize::new(0);
    let url = "type.googleapis.com/tests.reboot.protoc.Counter";
    let value = context
        .at_least_once_result("remote", 1, url, b"B/ref/Full.Method/request", || {
            constructed.fetch_add(1, Ordering::SeqCst);
            async { Ok(crate::proto::Counter { value: 42 }) }
        })
        .await
        .unwrap();
    assert_eq!(value.value, 42);
    let replay: crate::proto::Counter = context
        .at_least_once_result("remote", 1, url, b"B/ref/Full.Method/request", || {
            panic!("Stored constructed callback");
            #[allow(unreachable_code)]
            async { Ok(crate::proto::Counter { value: 0 }) }
        })
        .await
        .unwrap();
    assert_eq!(replay, value);
    assert_eq!(constructed.load(Ordering::SeqCst), 1);
    assert!(attempt.clean());
    assert!(
        database.store_requests()[1..]
            .iter()
            .all(|r| r.sync && r.actor_upserts.is_empty() && r.task_upserts.is_empty())
    );
    server.abort();
}

#[tokio::test]
async fn at_least_once_result_reruns_callback_after_failure() {
    let (f, _database, server) = fake().await;
    let url = "type.googleapis.com/tests.reboot.protoc.Counter";
    let constructed = AtomicUsize::new(0);
    let first = WorkflowAttempt::default();
    assert!(
        f.context(&first)
            .at_least_once_result::<crate::proto::Counter, _, _>(
                "remote",
                1,
                url,
                b"call",
                || {
                    constructed.fetch_add(1, Ordering::SeqCst);
                    async { Err(Status::unavailable("B may have committed")) }
                },
            )
            .await
            .is_err()
    );
    assert!(!first.clean());
    let second = WorkflowAttempt::default();
    let value = f
        .context(&second)
        .at_least_once_result::<crate::proto::Counter, _, _>(
            "remote",
            1,
            url,
            b"call",
            || {
                constructed.fetch_add(1, Ordering::SeqCst);
                async { Ok(crate::proto::Counter { value: 7 }) }
            },
        )
        .await
        .unwrap();
    assert_eq!(value.value, 7);
    assert_eq!(constructed.load(Ordering::SeqCst), 2);
    assert!(second.clean());
    server.abort();
}

#[tokio::test]
async fn at_least_once_result_scopes_by_finite_iteration() {
    let (f, database, server) = fake().await;
    let url = "type.googleapis.com/tests.reboot.protoc.Counter";
    let constructed = AtomicUsize::new(0);
    for index in [0u64, 1] {
        let attempt = WorkflowAttempt::default();
        let context = f
            .context(&attempt)
            .iteration("batch", index, 2)
            .unwrap();
        let value = context
            .at_least_once_result::<crate::proto::Counter, _, _>(
                "step",
                1,
                url,
                b"call",
                || {
                    constructed.fetch_add(1, Ordering::SeqCst);
                    async { Ok(crate::proto::Counter { value: index as i64 + 1 }) }
                },
            )
            .await
            .unwrap();
        assert_eq!(value.value, index as i64 + 1);
    }
    assert_eq!(constructed.load(Ordering::SeqCst), 2);
    let replay0 = WorkflowAttempt::default();
    let value0 = f
        .context(&replay0)
        .iteration("batch", 0, 2)
        .unwrap()
        .at_least_once_result::<crate::proto::Counter, _, _>(
            "step",
            1,
            url,
            b"call",
            || async { panic!("iteration 0 replay ran") },
        )
        .await
        .unwrap();
    assert_eq!(value0.value, 1);
    assert_eq!(constructed.load(Ordering::SeqCst), 2);
    assert!(database
        .store_requests()
        .iter()
        .all(|r| r.sync && r.actor_upserts.is_empty()));
    server.abort();
}

#[tokio::test]
async fn at_least_once_unit_memoizes_and_replays_without_callback() {
    let (f, _database, server) = fake().await;
    let attempt = WorkflowAttempt::default();
    let context = f.context(&attempt);
    let constructed = AtomicUsize::new(0);
    context
        .at_least_once_unit("unit-effect", 1, || {
            constructed.fetch_add(1, Ordering::SeqCst);
            async { Ok(()) }
        })
        .await
        .unwrap();
    context
        .at_least_once_unit("unit-effect", 1, || {
            panic!("Stored constructed callback");
            #[allow(unreachable_code)]
            async { Ok(()) }
        })
        .await
        .unwrap();
    assert_eq!(constructed.load(Ordering::SeqCst), 1);
    assert!(attempt.clean());
    server.abort();
}

#[tokio::test]
async fn at_least_once_unit_reruns_callback_after_failure() {
    let (f, _database, server) = fake().await;
    let constructed = AtomicUsize::new(0);
    let first = WorkflowAttempt::default();
    assert!(
        f.context(&first)
            .at_least_once_unit("unit-effect", 1, || {
                constructed.fetch_add(1, Ordering::SeqCst);
                async { Err(Status::unavailable("B may have committed")) }
            })
            .await
            .is_err()
    );
    assert!(!first.clean());
    let second = WorkflowAttempt::default();
    f.context(&second)
        .at_least_once_unit("unit-effect", 1, || {
            constructed.fetch_add(1, Ordering::SeqCst);
            async { Ok(()) }
        })
        .await
        .unwrap();
    assert_eq!(constructed.load(Ordering::SeqCst), 2);
    assert!(second.clean());
    server.abort();
}

#[tokio::test]
async fn at_least_once_unit_scopes_by_finite_iteration() {
    let (f, _database, server) = fake().await;
    let constructed = AtomicUsize::new(0);
    for index in [0u64, 1] {
        let attempt = WorkflowAttempt::default();
        let context = f
            .context(&attempt)
            .iteration("batch", index, 2)
            .unwrap();
        context
            .at_least_once_unit("step", 1, || {
                constructed.fetch_add(1, Ordering::SeqCst);
                async { Ok(()) }
            })
            .await
            .unwrap();
    }
    assert_eq!(constructed.load(Ordering::SeqCst), 2);
    let replay0 = WorkflowAttempt::default();
    f.context(&replay0)
        .iteration("batch", 0, 2)
        .unwrap()
        .at_least_once_unit("step", 1, || async { panic!("iteration 0 replay ran") })
        .await
        .unwrap();
    assert_eq!(constructed.load(Ordering::SeqCst), 2);
    assert!(replay0.clean());
    server.abort();
}

trait TestCursorDeclaration {
    fn with_test_cursor(self, enabled: bool) -> Self;
}
impl TestCursorDeclaration for TaskMethodDeclaration {
    fn with_test_cursor(self, enabled: bool) -> Self {
        if enabled {
            self.workflow_cursor("main", 1)
        } else {
            self
        }
    }
}
