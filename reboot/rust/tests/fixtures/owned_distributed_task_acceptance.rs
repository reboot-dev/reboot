#[test]
#[ignore = "requires REBOOT_NATIVE2PC_CXX_DATABASE real C++ Database/RocksDB"]
fn owned_distributed_reader_task_unsupported_shapes_fail_closed() {
    for shape in ["inbound", "shared-inbound", "factory", "idempotent"] {
        let mut fixture = DistributedTasks::new();
        if shape == "factory" {
            fixture.root_db =
                CxxDatabase::start(std::env::var("REBOOT_NATIVE2PC_CXX_DATABASE").unwrap());
        }
        let marker = fixture.markers.path().join("negative-shape");
        let mut target = fixture.spawn(&mut fixture.command(false), "target-log");
        wait(fixture.target_port);
        assert_eq!(
            fixture
                .rpc(false, "Apply", 0, Duration::from_secs(1))
                .unwrap(),
            20
        );
        let mut command = fixture.command(true);
        // No outbound effects for unsupported inbound/shared/factory shapes;
        // their actual generated handlers deliberately return a reader task.
        if shape != "idempotent" {
            command = Command::new(&fixture.binary);
            command.args([
                "--role",
                "target",
                "--database",
                &fixture.root_db.endpoint(),
                "--listen",
                &format!("127.0.0.1:{}", fixture.root_port),
                "--placement-planner",
                &fixture.planner.endpoint,
                "--root-id",
                &fixture.id.to_string(),
                "--state-ref",
                "root",
                "--coordinator-state-ref",
                "root",
                "--owned-explicit-abort",
                "--root-reader-task",
                fixture.marker().to_str().unwrap(),
                "--negative-task-shape",
                "--negative-shape-marker",
                marker.to_str().unwrap(),
            ]);
        }
        let mut root = fixture.spawn(&mut command, "root-log");
        wait(fixture.root_port);
        if shape != "factory" {
            assert_eq!(
                fixture
                    .rpc(true, "Query", 0, Duration::from_secs(1))
                    .unwrap(),
                5
            );
        }
        let error = fixture.runtime.block_on(async {
            let channel = tonic::transport::Endpoint::from_shared(format!(
                "http://127.0.0.1:{}",
                fixture.root_port
            ))
            .unwrap()
            .connect_lazy();
            let mut client = tonic::client::Grpc::new(channel);
            // Separate benign readiness probe; no mutating RPC retry.
            if shape == "factory" {
                let deadline = std::time::Instant::now() + Duration::from_secs(3);
                loop {
                    client.ready().await.unwrap();
                    let mut probe = tonic::Request::new(TaskQueryRequest { amount: 0 });
                    probe
                        .metadata_mut()
                        .insert("x-reboot-state-ref", "root".parse().unwrap());
                    let result = client
                        .unary::<_, TaskQueryResponse, _>(
                            probe,
                            "/tests.reboot.protoc.TransactionCounterWritesMethods/Query"
                                .parse()
                                .unwrap(),
                            tonic::codec::ProstCodec::default(),
                        )
                        .await;
                    if matches!(&result, Err(error) if error.code() == tonic::Code::Unavailable)
                        && std::time::Instant::now() < deadline
                    {
                        tokio::time::sleep(Duration::from_millis(20)).await;
                        continue;
                    }
                    assert!(
                        !matches!(&result, Err(error) if error.code() == tonic::Code::Unavailable),
                        "factory host never became ready"
                    );
                    break;
                }
            }
            let mut headers = reboot_rust_schema::RebootHeaders::new("root");
            if shape == "idempotent" {
                headers.idempotency_key = Some(Uuid::new_v4());
            }
            if matches!(shape, "inbound" | "shared-inbound") {
                headers.transaction_ids = Some(vec![fixture.id]);
                headers.transaction_coordinator_state_type =
                    Some("tests.reboot.protoc.TransactionCounter".into());
                headers.transaction_coordinator_state_ref = Some("root".into());
            }
            let mut request = tonic::Request::new(TaskQueryRequest { amount: 7 });
            *request.metadata_mut() = headers.to_metadata().unwrap();
            request.set_timeout(Duration::from_secs(2));
            client.ready().await.unwrap();
            let method = match shape {
                "factory" => "FactoryIncrement",
                "shared-inbound" => "SharedRead",
                _ => "Increment",
            };
            client
                .unary::<_, TaskQueryResponse, _>(
                    request,
                    format!("/tests.reboot.protoc.TransactionCounterWritesMethods/{method}")
                        .parse()
                        .unwrap(),
                    tonic::codec::ProstCodec::default(),
                )
                .await
                .unwrap_err()
        });
        assert_eq!(
            error.code(),
            tonic::Code::FailedPrecondition,
            "{shape}: {error}"
        );
        if shape == "idempotent" {
            assert!(
                std::path::Path::new(&format!("{}.task-id", fixture.marker().display())).exists()
            );
        } else {
            assert!(
                marker.exists(),
                "unsupported handler wasn't exercised: {shape}"
            );
        }
        assert!(
            fixture
                .runtime
                .block_on(pending_tasks(&fixture.root_db.endpoint()))
                .is_empty()
        );
        assert!(
            fixture
                .runtime
                .block_on(pending_tasks(&fixture.target_db.endpoint()))
                .is_empty()
        );
        assert_eq!(
            fixture
                .runtime
                .block_on(load_state(&fixture.root_db.endpoint(), "root")),
            if shape == "factory" {
                None
            } else {
                Some(vec![8, 5])
            }
        );
        assert_eq!(
            fixture
                .runtime
                .block_on(load_state(&fixture.target_db.endpoint(), "target")),
            Some(vec![8, 20])
        );
        assert!(!fixture.marker().exists());
        // Unsupported idempotent distributed cleanup is not a guarantee.
        DistributedTasks::stop(&mut root);
        DistributedTasks::stop(&mut target);
        fixture.planner.stop();
    }
}

// Coupled generated root -> successful remote trailers -> real CXX state/task
// commit and canonical recovery. Fixed ownership, independent sidecars only.
struct DistributedTasks {
    binary: std::path::PathBuf,
    root_db: CxxDatabase,
    target_db: CxxDatabase,
    runtime: tokio::runtime::Runtime,
    planner: LivePlannerServer,
    root_port: u16,
    target_port: u16,
    server_id: String,
    markers: tempfile::TempDir,
    id: Uuid,
}
impl DistributedTasks {
    fn new() -> Self {
        let fixture = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("tests/fixtures/generated_cxx_database_process");
        crate::prepare_generated_host(&fixture);
        let binary = generated_host_binary(&fixture);
        let database = std::env::var("REBOOT_NATIVE2PC_CXX_DATABASE").unwrap();
        let root_db = CxxDatabase::start(database.clone());
        let target_db = CxxDatabase::start(database);
        let runtime = tokio::runtime::Runtime::new().unwrap();
        runtime.block_on(store_counter(&root_db.endpoint(), "root", 5));
        runtime.block_on(store_counter(&target_db.endpoint(), "target", 20));
        let root_port = port();
        let target_port = port();
        let plan = placement_proto::ListenForPlanResponse::decode(
            URL_SAFE_NO_PAD
                .decode(legacy_plan_for(&[
                    ("root", root_port),
                    ("target", target_port),
                ]))
                .unwrap()
                .as_slice(),
        )
        .unwrap();
        let server_id = plan
            .servers
            .iter()
            .find(|server| server.address.as_ref().unwrap().port == i32::from(root_port))
            .unwrap()
            .id
            .clone();
        let planner = LivePlannerServer::start(&runtime, plan);
        Self {
            binary,
            root_db,
            target_db,
            runtime,
            planner,
            root_port,
            target_port,
            server_id,
            markers: tempfile::tempdir().unwrap(),
            id: Uuid::new_v4(),
        }
    }
    fn marker(&self) -> std::path::PathBuf {
        self.markers.path().join("reader")
    }
    fn command(&self, root: bool) -> Command {
        self.command_with_root_tasks(root, true)
    }
    fn command_with_root_tasks(&self, root: bool, root_tasks: bool) -> Command {
        let mut command = Command::new(&self.binary);
        command.args([
            "--role",
            if root { "root" } else { "target" },
            "--database",
            &if root {
                self.root_db.endpoint()
            } else {
                self.target_db.endpoint()
            },
            "--listen",
            &format!(
                "127.0.0.1:{}",
                if root {
                    self.root_port
                } else {
                    self.target_port
                }
            ),
            "--placement-planner",
            &self.planner.endpoint,
            "--root-id",
            &self.id.to_string(),
            "--state-ref",
            if root { "root" } else { "target" },
            "--coordinator-state-ref",
            if root { "root" } else { "target" },
        ]);
        if root {
            command.arg("--owned-explicit-abort");
            if root_tasks {
                command.args([
                    "--root-reader-task",
                    self.marker().to_str().unwrap(),
                    "--server-id",
                    &self.server_id,
                ]);
            }
        }
        command
    }
    fn spawn(&self, command: &mut Command, name: &str) -> WaitHostGuard {
        command.stderr(std::fs::File::create(self.markers.path().join(name)).unwrap());
        WaitHostGuard(command.spawn().unwrap())
    }
    fn rpc(
        &self,
        root: bool,
        method: &str,
        amount: i64,
        timeout: Duration,
    ) -> Result<i64, Box<tonic::Status>> {
        if method != "Query" {
            self.rpc(root, "Query", 0, Duration::from_secs(1))?;
        }
        self.runtime.block_on(async {
            let channel = tonic::transport::Endpoint::from_shared(format!(
                "http://127.0.0.1:{}",
                if root {
                    self.root_port
                } else {
                    self.target_port
                }
            ))
            .unwrap()
            .connect_lazy();
            let mut client = tonic::client::Grpc::new(channel);
            let deadline = std::time::Instant::now() + Duration::from_secs(4);
            loop {
                client.ready().await.unwrap();
                let mut request = tonic::Request::new(TaskQueryRequest { amount });
                request.metadata_mut().insert(
                    "x-reboot-state-ref",
                    if root {
                        "root".parse().unwrap()
                    } else {
                        "target".parse().unwrap()
                    },
                );
                if method == "Apply" {
                    request.metadata_mut().insert(
                        "x-reboot-idempotency-key",
                        Uuid::new_v4().to_string().parse().unwrap(),
                    );
                }
                request.set_timeout(timeout);
                let result = client
                    .unary::<_, TaskQueryResponse, _>(
                        request,
                        format!("/tests.reboot.protoc.TransactionCounterWritesMethods/{method}")
                            .parse()
                            .unwrap(),
                        tonic::codec::ProstCodec::default(),
                    )
                    .await;
                if method == "Query"
                    && matches!(&result, Err(error) if error.code() == tonic::Code::Unavailable)
                    && std::time::Instant::now() < deadline
                {
                    tokio::time::sleep(Duration::from_millis(20)).await;
                    continue;
                }
                return result
                    .map(|response| response.into_inner().value)
                    .map_err(Box::new);
            }
        })
    }
    fn task_id(&self) -> database::TaskId {
        database::TaskId {
            state_type: "tests.reboot.protoc.TransactionCounter".into(),
            state_ref: "root".into(),
            task_uuid: Uuid::parse_str(
                &std::fs::read_to_string(format!("{}.task-id", self.marker().display())).unwrap(),
            )
            .unwrap()
            .as_bytes()
            .to_vec(),
        }
    }
    fn typed_wait(&self, id: &database::TaskId, expected: i64) {
        let result = self.markers.path().join("typed-wait");
        let mut child = WaitHostGuard(
            Command::new(&self.binary)
                .args([
                    "--role",
                    "wait-result",
                    "--listen",
                    &format!("127.0.0.1:{}", self.root_port),
                    "--state-ref",
                    "root",
                    "--task-uuid",
                    &Uuid::from_slice(&id.task_uuid).unwrap().to_string(),
                    "--result-marker",
                    result.to_str().unwrap(),
                ])
                .spawn()
                .unwrap(),
        );
        await_marker(&result, &mut child);
        assert!(child.wait().unwrap().success());
        assert_eq!(
            std::fs::read_to_string(result).unwrap(),
            expected.to_string()
        );
    }
    fn states(&self, root: u8, target: u8) {
        assert_eq!(
            self.runtime
                .block_on(load_state(&self.root_db.endpoint(), "root")),
            Some(vec![8, root])
        );
        assert_eq!(
            self.runtime
                .block_on(load_state(&self.target_db.endpoint(), "target")),
            Some(vec![8, target])
        );
        assert!(
            self.runtime
                .block_on(pending_tasks(&self.target_db.endpoint()))
                .is_empty()
        );
    }
    fn stop(host: &mut WaitHostGuard) {
        host.kill().ok();
        host.wait().unwrap();
    }
    fn await_exit(&self, host: &mut WaitHostGuard, log: &str) {
        let deadline = std::time::Instant::now() + Duration::from_secs(4);
        loop {
            if let Some(status) = host.try_wait().unwrap() {
                assert!(!status.success());
                return;
            }
            assert!(
                std::time::Instant::now() < deadline,
                "host did not fail: {}",
                std::fs::read_to_string(self.markers.path().join(log)).unwrap()
            );
            std::thread::sleep(Duration::from_millis(10));
        }
    }
    fn decision(&self) -> Option<database::TransactionCoordinatorDecision> {
        self.runtime.block_on(async {
            database::database_client::DatabaseClient::connect(self.root_db.endpoint())
                .await
                .unwrap()
                .transaction_coordinator_decision_get(
                    database::TransactionCoordinatorDecisionGetRequest {
                        root_transaction_id: self.id.as_bytes().to_vec(),
                        coordinator_state_ref: "root".into(),
                    },
                )
                .await
                .unwrap()
                .into_inner()
                .decision
        })
    }
}

#[test]
#[ignore = "requires REBOOT_NATIVE2PC_CXX_DATABASE real C++ Database/RocksDB"]
fn owned_distributed_reader_tasks_commit_delayed_and_canonical_restart() {
    for scenario in ["immediate", "delayed", "decision-crash"] {
        let mut fixture = DistributedTasks::new();
        let mut target = fixture.spawn(&mut fixture.command(false), "target-log");
        wait(fixture.target_port);
        assert_eq!(
            fixture
                .rpc(false, "Apply", 0, Duration::from_secs(1))
                .unwrap(),
            20
        );
        let mut command = fixture.command(true);
        let decision_marker = fixture.markers.path().join("decision");
        let due = chrono::Utc::now().timestamp() + 3;
        if scenario == "delayed" {
            command.args(["--task-vector", &format!("delayed:{due}")]);
        }
        if scenario == "decision-crash" {
            command
                .env(
                    "REBOOT_TEST_PAUSE_AFTER_COORDINATOR_PREPARE",
                    &decision_marker,
                )
                .args(["--block-task", "--invoke"]);
        }
        let mut root = fixture.spawn(&mut command, "root-log");
        wait(fixture.root_port);
        if scenario == "decision-crash" {
            // The SDK hook blocks its real immutable-Commit ACK branch before
            // terminal delivery. The parent reads authority before killing it.
            await_marker(&decision_marker, &mut root);
            assert_eq!(
                fixture.decision().unwrap().outcome,
                database::transaction_coordinator_decision::Outcome::Commit as i32
            );
            fixture.states(5, 20);
            assert!(!fixture.marker().exists());
            let id = fixture.task_id();
            DistributedTasks::stop(&mut root);
            DistributedTasks::stop(&mut target);
            fixture.root_db.restart();
            fixture.target_db.restart();
            let mut target_command = fixture.command(false);
            target_command.args(["--recover", "--watch-coordinator-state-ref", "root"]);
            target = fixture.spawn(&mut target_command, "target-recovery-log");
            wait(fixture.target_port);
            let mut root_command = fixture.command(true);
            root_command.args(["--recover", "--block-task"]);
            root = fixture.spawn(&mut root_command, "root-recovery-log");
            await_marker(&fixture.marker(), &mut root);
            fixture.states(12, 27);
            let pending = fixture
                .runtime
                .block_on(load_task(&fixture.root_db.endpoint(), id.clone()));
            assert_eq!(pending.status, database::task::Status::Pending as i32);
            assert_eq!(
                std::fs::read_to_string(format!("{}.invocations", fixture.marker().display()))
                    .unwrap()
                    .lines()
                    .count(),
                1
            );
            DistributedTasks::stop(&mut root);
            DistributedTasks::stop(&mut target);
            fixture.root_db.restart();
            fixture.target_db.restart();
            std::fs::remove_file(fixture.marker()).unwrap();
            target = fixture.spawn(&mut target_command, "target-redelivery-log");
            wait(fixture.target_port);
            let mut root_command = fixture.command(true);
            root_command.arg("--recover");
            root = fixture.spawn(&mut root_command, "root-redelivery-log");
            await_marker(&fixture.marker(), &mut root);
            fixture.typed_wait(&id, 12);
            let completed = fixture
                .runtime
                .block_on(load_task(&fixture.root_db.endpoint(), id.clone()));
            assert_eq!(completed.status, database::task::Status::Completed as i32);
            assert_eq!(
                std::fs::read_to_string(format!("{}.invocations", fixture.marker().display()))
                    .unwrap()
                    .lines()
                    .count(),
                2
            );
            DistributedTasks::stop(&mut root);
            DistributedTasks::stop(&mut target);
            fixture.root_db.restart();
            fixture.target_db.restart();
            target = fixture.spawn(&mut target_command, "target-final-log");
            wait(fixture.target_port);
            root = fixture.spawn(&mut root_command, "root-final-log");
            wait(fixture.root_port);
            assert_eq!(
                fixture
                    .rpc(true, "Query", 0, Duration::from_secs(1))
                    .unwrap(),
                12
            );
            fixture.typed_wait(&id, 12);
            assert_eq!(
                fixture
                    .runtime
                    .block_on(load_task(&fixture.root_db.endpoint(), id)),
                completed
            );
            assert_eq!(
                std::fs::read_to_string(format!("{}.invocations", fixture.marker().display()))
                    .unwrap()
                    .lines()
                    .count(),
                2,
                "completed task replayed"
            );
        } else {
            assert_eq!(
                fixture
                    .rpc(true, "Increment", 7, Duration::from_secs(2))
                    .unwrap(),
                12
            );
            fixture.states(12, 27);
            let id = fixture.task_id();
            if scenario == "delayed" {
                assert!(!fixture.marker().exists());
                let pending = fixture
                    .runtime
                    .block_on(load_task(&fixture.root_db.endpoint(), id.clone()));
                assert_eq!(pending.status, database::task::Status::Pending as i32);
                assert_eq!(pending.timestamp.as_ref().unwrap().seconds, due);
            }
            fixture.typed_wait(&id, 12);
            assert_eq!(
                std::fs::read_to_string(format!("{}.invocations", fixture.marker().display()))
                    .unwrap()
                    .lines()
                    .count(),
                1
            );
            if scenario == "delayed" {
                let start: u128 =
                    std::fs::read_to_string(format!("{}.started-at", fixture.marker().display()))
                        .unwrap()
                        .parse()
                        .unwrap();
                assert!(start >= u128::try_from(due).unwrap() * 1_000_000_000);
            }
        }
        DistributedTasks::stop(&mut root);
        DistributedTasks::stop(&mut target);
        fixture.planner.stop();
    }
}

#[test]
#[ignore = "requires REBOOT_NATIVE2PC_CXX_DATABASE real C++ Database/RocksDB"]
fn owned_distributed_reader_task_rejections_release_both_live_exclusive_actors() {
    for vector in [
        "malformed",
        "duplicate",
        "capacity",
        "identity",
        "no-owner",
        "inactive-owner",
        "shared-registry",
        "ownerless",
        "persisted",
        "saturation",
    ] {
        let fixture = DistributedTasks::new();
        let mut target = fixture.spawn(&mut fixture.command(false), "target-log");
        wait(fixture.target_port);
        assert_eq!(
            fixture
                .rpc(false, "Apply", 0, Duration::from_secs(1))
                .unwrap(),
            20
        );
        let mut command = fixture.command(true);
        let mut existing = None;
        let seeded: Vec<database::Task> = if vector == "saturation" {
            (0..1024)
                .map(|_| database::Task {
                    task_id: Some(database::TaskId {
                        state_type: "tests.reboot.protoc.TransactionCounter".into(),
                        state_ref: "root".into(),
                        task_uuid: Uuid::new_v4().as_bytes().to_vec(),
                    }),
                    method: "Query".into(),
                    request: vec![8, 0xa8, 0x46],
                    status: database::task::Status::Pending as i32,
                    timestamp: Some(prost_types::Timestamp {
                        seconds: chrono::Utc::now().timestamp() + 3600,
                        nanos: 0,
                    }),
                    ..Default::default()
                })
                .collect()
        } else {
            vec![]
        };
        if !seeded.is_empty() {
            fixture.runtime.block_on(async {
                database::database_client::DatabaseClient::connect(fixture.root_db.endpoint())
                    .await
                    .unwrap()
                    .store(database::StoreRequest {
                        task_upserts: seeded.clone(),
                        sync: true,
                        ..Default::default()
                    })
                    .await
                    .unwrap();
            });
        }
        let actual_vector = if vector == "persisted" {
            let id = Uuid::new_v4();
            let record = database::Task {
                task_id: Some(database::TaskId {
                    state_type: "tests.reboot.protoc.TransactionCounter".into(),
                    state_ref: "root".into(),
                    task_uuid: id.as_bytes().to_vec(),
                }),
                method: "Query".into(),
                request: vec![8, 0xa8, 0x46],
                status: database::task::Status::Completed as i32,
                response_or_error: Some(database::task::ResponseOrError::Response(
                    prost_types::Any {
                        type_url: "type.googleapis.com/tests.reboot.protoc.TransactionCounterValue"
                            .into(),
                        value: vec![8, 5],
                    },
                )),
                ..Default::default()
            };
            fixture.runtime.block_on(async {
                database::database_client::DatabaseClient::connect(fixture.root_db.endpoint())
                    .await
                    .unwrap()
                    .store(database::StoreRequest {
                        task_upserts: vec![record.clone()],
                        sync: true,
                        ..Default::default()
                    })
                    .await
                    .unwrap();
            });
            existing = Some(record);
            format!("reuse:{id}")
        } else {
            vector.to_owned()
        };
        command.args(["--task-vector", &actual_vector]);
        if vector == "no-owner" {
            command.arg("--no-task-owner");
        }
        if vector == "shared-registry" {
            command.arg("--shared-task-recovery");
        }
        if vector == "inactive-owner" {
            command.arg("--inactive-task-owner");
        }
        if vector == "ownerless" {
            command = Command::new(&fixture.binary);
            command.args([
                "--role",
                "root",
                "--database",
                &fixture.root_db.endpoint(),
                "--listen",
                &format!("127.0.0.1:{}", fixture.root_port),
                "--placement-planner",
                &fixture.planner.endpoint,
                "--root-id",
                &fixture.id.to_string(),
                "--state-ref",
                "root",
                "--coordinator-state-ref",
                "root",
                "--root-reader-task",
                fixture.marker().to_str().unwrap(),
            ]);
        }
        let mut root = fixture.spawn(&mut command, "root-log");
        wait(fixture.root_port);
        let error = fixture
            .rpc(true, "Increment", 7, Duration::from_secs(2))
            .unwrap_err();
        let expected = match vector {
            "capacity" | "saturation" => tonic::Code::ResourceExhausted,
            "persisted" => tonic::Code::AlreadyExists,
            "no-owner" | "inactive-owner" | "shared-registry" | "ownerless" => {
                tonic::Code::FailedPrecondition
            }
            _ => tonic::Code::InvalidArgument,
        };
        assert_eq!(error.code(), expected, "{vector}: {error}");
        assert!(
            std::path::Path::new(&format!("{}.task-id", fixture.marker().display())).exists(),
            "confirmed remote handler branch not reached"
        );
        assert_eq!(
            fixture
                .rpc(false, "Apply", 0, Duration::from_secs(1))
                .unwrap(),
            20,
            "remote exclusive readmission {vector}"
        );
        assert_eq!(
            fixture
                .rpc(true, "Apply", 0, Duration::from_secs(1))
                .unwrap(),
            5,
            "root exclusive readmission {vector}"
        );
        fixture.states(5, 20);
        assert!(!fixture.marker().exists());
        let mut after = fixture
            .runtime
            .block_on(pending_tasks(&fixture.root_db.endpoint()));
        let mut before = seeded;
        let key = |task: &database::Task| task.task_id.as_ref().unwrap().task_uuid.clone();
        after.sort_by_key(key);
        before.sort_by_key(key);
        assert_eq!(
            after, before,
            "pending records changed after owned rejection"
        );
        if let Some(record) = existing {
            assert_eq!(
                fixture.runtime.block_on(load_task(
                    &fixture.root_db.endpoint(),
                    record.task_id.clone().unwrap()
                )),
                record
            );
        }
        assert_eq!(
            fixture.decision().unwrap().outcome,
            database::transaction_coordinator_decision::Outcome::Abort as i32
        );
        DistributedTasks::stop(&mut root);
        DistributedTasks::stop(&mut target);
        fixture.planner.stop();
    }
}

#[test]
#[ignore = "requires REBOOT_NATIVE2PC_CXX_DATABASE real C++ Database/RocksDB"]
fn owned_distributed_reader_task_roots_serialize_before_scheduling_admission() {
    let fixture = DistributedTasks::new();
    let mut target = fixture.spawn(&mut fixture.command(false), "target-log");
    wait(fixture.target_port);
    assert_eq!(
        fixture
            .rpc(false, "Apply", 0, Duration::from_secs(1))
            .unwrap(),
        20
    );
    let barrier = fixture.markers.path().join("handler");
    let mut command = fixture.command(true);
    command.env("REBOOT_TEST_ROOT_HANDLER_PARK", &barrier);
    let mut root = fixture.spawn(&mut command, "root-log");
    wait(fixture.root_port);
    assert_eq!(
        fixture
            .rpc(true, "Query", 0, Duration::from_secs(1))
            .unwrap(),
        5
    );
    fixture.runtime.block_on(async {
        async fn increment(port: u16, timeout: Duration) -> tonic::Status {
            let channel =
                tonic::transport::Endpoint::from_shared(format!("http://127.0.0.1:{port}"))
                    .unwrap()
                    .connect_lazy();
            let mut client = tonic::client::Grpc::new(channel);
            client.ready().await.unwrap();
            let mut request = tonic::Request::new(TaskQueryRequest { amount: 7 });
            request
                .metadata_mut()
                .insert("x-reboot-state-ref", "root".parse().unwrap());
            request.set_timeout(timeout);
            client
                .unary::<_, TaskQueryResponse, _>(
                    request,
                    "/tests.reboot.protoc.TransactionCounterWritesMethods/Increment"
                        .parse()
                        .unwrap(),
                    tonic::codec::ProstCodec::default(),
                )
                .await
                .unwrap_err()
        }
        let first = tokio::spawn(increment(fixture.root_port, Duration::from_secs(2)));
        tokio::time::timeout(Duration::from_secs(1), async {
            while !barrier.exists() {
                tokio::time::sleep(Duration::from_millis(5)).await;
            }
        })
        .await
        .unwrap();
        let id_before =
            std::fs::read_to_string(format!("{}.task-id", fixture.marker().display())).unwrap();
        let second = increment(fixture.root_port, Duration::from_millis(250)).await;
        // The bounded live-root owner now reserves BEFORE actor Load. With
        // capacity one the competitor must fail there, not wait at the actor
        // gate. Retain the handler, decision, state and task invariants below.
        assert_eq!(second.code(), tonic::Code::ResourceExhausted);
        assert_eq!(second.message(), "registered root owner is full");
        assert_eq!(
            std::fs::read_to_string(format!("{}.task-id", fixture.marker().display())).unwrap(),
            id_before,
            "competing handler ran before actor release"
        );
        assert!(
            database::database_client::DatabaseClient::connect(fixture.root_db.endpoint())
                .await
                .unwrap()
                .transaction_coordinator_decision_get(
                    database::TransactionCoordinatorDecisionGetRequest {
                        root_transaction_id: fixture.id.as_bytes().to_vec(),
                        coordinator_state_ref: "root".into()
                    }
                )
                .await
                .unwrap()
                .into_inner()
                .decision
                .is_none()
        );
        let status = first.await.unwrap();
        assert!(matches!(
            status.code(),
            tonic::Code::Cancelled | tonic::Code::DeadlineExceeded
        ));
    });
    await_marker(&barrier.with_extension("handler-dropped"), &mut root);
    assert!(barrier.with_extension("handler-dropped").exists());
    assert_eq!(
        fixture
            .rpc(false, "Apply", 0, Duration::from_secs(1))
            .unwrap(),
        20
    );
    assert_eq!(
        fixture
            .rpc(true, "Apply", 0, Duration::from_secs(1))
            .unwrap(),
        5
    );
    fixture.states(5, 20);
    assert!(
        fixture
            .runtime
            .block_on(pending_tasks(&fixture.root_db.endpoint()))
            .is_empty()
    );
    DistributedTasks::stop(&mut root);
    DistributedTasks::stop(&mut target);
    fixture.planner.stop();
}

#[test]
#[ignore = "requires REBOOT_NATIVE2PC_CXX_DATABASE real C++ Database/RocksDB"]
fn owned_distributed_reader_task_validation_deadline_cleanup_and_postprepare_retention() {
    for scenario in [
        "handler",
        "validation",
        "staging",
        "handoff",
        "unknown",
        "caught",
    ] {
        let mut fixture = DistributedTasks::new();
        let barrier = fixture.markers.path().join("barrier");
        let mut target_command = fixture.command(false);
        if matches!(scenario, "unknown" | "caught") {
            target_command.args(["--live-watch", "--watch-coordinator-state-ref", "root"]).env("REBOOT_TEST_TARGET_UNFINISHED_OUTBOUND", &barrier);
        }
        if scenario == "caught" {
            target_command.arg("--unfinished-outbound-error");
        }
        let mut target = fixture.spawn(&mut target_command, "target-log");
        wait(fixture.target_port);
        assert_eq!(
            fixture
                .rpc(false, "Apply", 0, Duration::from_secs(1))
                .unwrap(),
            20
        );
        let mut root_command = fixture.command(true);
        if scenario == "handler" {
            root_command.env("REBOOT_TEST_ROOT_HANDLER_PARK", &barrier);
        }
        if scenario == "staging" {
            root_command.env("REBOOT_TEST_TASK_STAGING_CANCEL", &barrier);
        }
        if scenario == "validation" {
            root_command.env("REBOOT_TEST_TASK_ADMISSION_CANCEL", &barrier);
        }
        if scenario == "handoff" {
            root_command.env("REBOOT_TEST_ROOT_PREPARE_PARK", &barrier);
        }
        if scenario == "caught" {
            root_command.args([
                "--catch-outbound-error",
                "--outbound-error-marker",
                fixture.markers.path().join("caught").to_str().unwrap(),
            ]);
        }
        let mut root = fixture.spawn(&mut root_command, "root-log");
        wait(fixture.root_port);
        let error = fixture
            .rpc(true, "Increment", 7, Duration::from_millis(500))
            .unwrap_err();
        assert!(barrier.exists());
        if scenario == "caught" {
            assert!(
                fixture.markers.path().join("caught").exists(),
                "handler did not catch the actual uncertain generated outbound"
            );
        }
        if scenario != "caught" {
            assert!(
                matches!(
                    error.code(),
                    tonic::Code::Cancelled | tonic::Code::DeadlineExceeded
                ),
                "{error}"
            );
        }
        if matches!(scenario, "handler" | "validation" | "staging" | "unknown" | "caught") {
            await_marker(
                &barrier.with_extension(if matches!(scenario, "handler" | "unknown" | "caught") {
                    "handler-dropped"
                } else {
                    "future-dropped"
                }),
                &mut root,
            );
            assert!(
                barrier
                    .with_extension(if matches!(scenario, "handler" | "unknown" | "caught") {
                        "handler-dropped"
                    } else {
                        "future-dropped"
                    })
                    .exists(),
                "actual generated awaited future not dropped"
            );
            assert_eq!(
                fixture
                    .rpc(false, "Apply", 0, Duration::from_secs(1))
                    .unwrap(),
                20
            );
            assert_eq!(
                fixture
                    .rpc(true, "Apply", 0, Duration::from_secs(1))
                    .unwrap(),
                5
            );
            assert_eq!(
                fixture.decision().unwrap().outcome,
                database::transaction_coordinator_decision::Outcome::Abort as i32
            );
            assert!(root.try_wait().unwrap().is_none());
        } else {
            fixture.await_exit(&mut root, "root-log");
            let log = std::fs::read_to_string(fixture.markers.path().join("root-log")).unwrap();
            assert!(
                log.contains("RecoveryTask"),
                "not a supervised failure: {log}"
            );
            if scenario != "caught" {
                let error = fixture
                    .rpc(false, "Apply", 0, Duration::from_millis(250))
                    .unwrap_err();
                assert!(
                    matches!(
                        error.code(),
                        tonic::Code::Cancelled | tonic::Code::DeadlineExceeded
                    ),
                    "remote ownership not retained: {error}"
                );
            }
            assert!(fixture.decision().is_none(), "no competing/synthetic Abort");
            if scenario == "handoff" {
                fixture.runtime.block_on(async {
                    let mut stream = database::database_client::DatabaseClient::connect(
                        fixture.root_db.endpoint(),
                    )
                    .await
                    .unwrap()
                    .recover(database::RecoverRequest {
                        shard_ids: vec!["s000000000".into()],
                        skip_idempotent_mutations: true,
                        ..Default::default()
                    })
                    .await
                    .unwrap()
                    .into_inner();
                    let mut coordinators = vec![];
                    while let Some(batch) = stream.message().await.unwrap() {
                        coordinators.extend(batch.transaction_coordinators);
                    }
                    assert_eq!(coordinators.len(), 1);
                    let refs = &coordinators[0]
                        .1
                        .participants
                        .as_ref()
                        .unwrap()
                        .should_commit["tests.reboot.protoc.TransactionCounter"]
                        .state_refs;
                    assert_eq!(refs, &["root", "target"]);
                });
            }
        }
        fixture.states(5, 20);
        assert!(
            fixture
                .runtime
                .block_on(pending_tasks(&fixture.root_db.endpoint()))
                .is_empty()
        );
        DistributedTasks::stop(&mut root);
        DistributedTasks::stop(&mut target);
        if scenario == "handoff" {
            fixture.root_db.restart();
            fixture.target_db.restart();
            let mut target_command = fixture.command(false);
            target_command.args(["--recover", "--watch-coordinator-state-ref", "root"]);
            target = fixture.spawn(&mut target_command, "target-restart-log");
            wait(fixture.target_port);
            let mut root_command = fixture.command(true);
            root_command.arg("--recover");
            root = fixture.spawn(&mut root_command, "root-restart-log");
            wait(fixture.root_port);
            assert_eq!(
                fixture
                    .rpc(true, "Query", 0, Duration::from_secs(1))
                    .unwrap(),
                5
            );
            assert_eq!(
                fixture
                    .rpc(false, "Apply", 0, Duration::from_secs(1))
                    .unwrap(),
                20
            );
            fixture.states(5, 20);
            assert!(
                fixture
                    .runtime
                    .block_on(pending_tasks(&fixture.root_db.endpoint()))
                    .is_empty()
            );
            assert_eq!(
                fixture.decision().unwrap().outcome,
                database::transaction_coordinator_decision::Outcome::Abort as i32
            );
            DistributedTasks::stop(&mut root);
            DistributedTasks::stop(&mut target);
        }
        fixture.planner.stop();
    }
}
