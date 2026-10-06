use super::*;
include!("task_schedule_acceptance.rs");
include!("task_wait_acceptance.rs");
#[derive(Clone, PartialEq, prost::Message)]
struct TaskQueryRequest {
    #[prost(int64, tag = "1")]
    amount: i64,
}
#[derive(Clone, PartialEq, prost::Message)]
struct TaskQueryResponse {
    #[prost(int64, tag = "1")]
    value: i64,
}

struct TaskHostOptions<'a> {
    binary: &'a std::path::Path,
    database: &'a str,
    planner: &'a str,
    port: u16,
    marker: &'a std::path::Path,
    ack: &'a std::path::Path,
    invoke: bool,
    block: bool,
    recover: bool,
    vector: Option<&'a str>,
}
fn task_host(options: TaskHostOptions<'_>) -> Child {
    task_host_command(options).spawn().unwrap()
}
fn task_host_command(options: TaskHostOptions<'_>) -> Command {
    let mut command = Command::new(options.binary);
    command.args([
        "--role",
        "tasks",
        "--database",
        options.database,
        "--listen",
        &format!("127.0.0.1:{}", options.port),
        "--placement-planner",
        options.planner,
        "--root-id",
        &Uuid::new_v4().to_string(),
        "--state-ref",
        "root",
        "--coordinator-state-ref",
        "root",
        "--task-marker",
        options.marker.to_str().unwrap(),
        "--invoke-marker",
        options.ack.to_str().unwrap(),
        "--amount",
        "7",
    ]);
    if options.invoke {
        command.arg("--invoke");
    }
    if options.block {
        command.arg("--block-task");
    }
    if options.recover {
        command.arg("--recover");
    }
    if options.vector == Some("ownership-competing") {
        command.env("REBOOT_TEST_LOST_PARTICIPANT_COMMIT_ACK", options.ack);
        command.env(
            "REBOOT_TEST_COMPETING_ADMISSION",
            format!("{}.queued", options.ack.display()),
        );
    } else if matches!(options.vector, Some("ownership" | "ownership-cancel")) {
        command.arg("--prove-cancel-before-durable");
        command.env(
            "REBOOT_TEST_TASK_ADMISSION_CANCEL",
            format!("{}.admission", options.ack.display()),
        );
        let fault = if options.vector == Some("ownership-cancel") {
            "REBOOT_TEST_CANCEL_PARTICIPANT_COMMIT_ACK"
        } else {
            "REBOOT_TEST_LOST_PARTICIPANT_COMMIT_ACK"
        };
        command.env(fault, options.ack);
    } else if options
        .vector
        .is_some_and(|vector| vector.starts_with("delayed:"))
    {
        command.args(["--task-vector", options.vector.unwrap()]);
    } else if options.vector == Some("saturation-allowed") {
        command.args(["--task-vector", "saturation-allowed", "--exit-after-invoke"]);
    } else if let Some(vector) = options.vector {
        command.args([
            "--task-vector",
            vector,
            "--expect-task-error",
            "--exit-after-invoke",
        ]);
        if vector == "no-owner" {
            command.arg("--no-task-owner");
        }
    }
    command.stdout(Stdio::inherit()).stderr(Stdio::inherit());
    command
}
fn await_marker(path: &std::path::Path, child: &mut Child) {
    for _ in 0..200 {
        if path.exists() {
            return;
        }
        assert!(
            child.try_wait().unwrap().is_none(),
            "task host exited before marker {}",
            path.display()
        );
        std::thread::sleep(Duration::from_millis(25));
    }
    panic!("task host never reached marker {}", path.display());
}
async fn pending_tasks(endpoint: &str) -> Vec<database::Task> {
    let mut client = database::database_client::DatabaseClient::connect(endpoint.to_owned())
        .await
        .unwrap();
    let mut stream = client
        .recover(database::RecoverRequest {
            state_tags_by_state_type: [(
                "tests.reboot.protoc.TransactionCounter".into(),
                "TransactionCounter".into(),
            )]
            .into(),
            shard_ids: vec!["s000000000".into()],
            skip_idempotent_mutations: true,
        })
        .await
        .unwrap()
        .into_inner();
    let mut tasks = vec![];
    while let Some(batch) = stream.message().await.unwrap() {
        tasks.extend(batch.pending_tasks);
    }
    tasks
}
async fn load_task(endpoint: &str, id: database::TaskId) -> database::Task {
    database::database_client::DatabaseClient::connect(endpoint.to_owned())
        .await
        .unwrap()
        .load(database::LoadRequest {
            actors: vec![],
            task_ids: vec![id],
        })
        .await
        .unwrap()
        .into_inner()
        .tasks
        .remove(0)
}

#[test]
#[ignore = "requires REBOOT_NATIVE2PC_CXX_DATABASE real C++ Database/RocksDB"]
fn generated_reader_task_live_pending_plus_staged_capacity_boundary() {
    let fixture = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("tests/fixtures/generated_cxx_database_process");
    assert!(
        Command::new("cargo")
            .args(["build", "--locked"])
            .current_dir(&fixture)
            .status()
            .unwrap()
            .success()
    );
    let binary = generated_host_binary(&fixture);
    for (vector, expected_state, staged_present) in
        [("saturation-allowed", 12, true), ("saturation", 5, false)]
    {
        let mut db = CxxDatabase::start(std::env::var("REBOOT_NATIVE2PC_CXX_DATABASE").unwrap());
        let runtime = tokio::runtime::Runtime::new().unwrap();
        runtime.block_on(store_counter(&db.endpoint(), "root", 5));
        let listen = port();
        let plan = placement_proto::ListenForPlanResponse::decode(
            URL_SAFE_NO_PAD
                .decode(legacy_plan_for(&[("root", listen)]))
                .unwrap()
                .as_slice(),
        )
        .unwrap();
        let planner = LivePlannerServer::start(&runtime, plan);
        let markers = tempfile::tempdir().unwrap();
        let marker = markers.path().join("task-entry");
        let ack = markers.path().join("invoke-result");
        let mut host = task_host(TaskHostOptions {
            binary: &binary,
            database: &db.endpoint(),
            planner: &planner.endpoint,
            port: listen,
            marker: &marker,
            ack: &ack,
            invoke: true,
            block: true,
            recover: false,
            vector: Some(vector),
        });
        await_marker(&ack, &mut host);
        assert!(
            host.wait().unwrap().success(),
            "live capacity vector {vector}"
        );
        assert_eq!(
            std::fs::read_to_string(&ack).unwrap(),
            if staged_present {
                "acknowledged"
            } else {
                "saturation rejected; admission released"
            }
        );
        assert_eq!(
            runtime.block_on(load_state(&db.endpoint(), "root")),
            Some(vec![0x08, expected_state])
        );
        let staged_id = database::TaskId {
            state_type: "tests.reboot.protoc.TransactionCounter".into(),
            state_ref: "root".into(),
            task_uuid: Uuid::parse_str(
                &std::fs::read_to_string(format!("{}.staged", marker.display())).unwrap(),
            )
            .unwrap()
            .as_bytes()
            .to_vec(),
        };
        let mut before = runtime.block_on(pending_tasks(&db.endpoint()));
        assert_eq!(before.len(), 1024);
        assert_eq!(
            before
                .iter()
                .any(|task| task.task_id.as_ref() == Some(&staged_id)),
            staged_present
        );
        assert!(before.iter().all(|task| task.response_or_error.is_none()));
        runtime.block_on(async {
            let loaded = database::database_client::DatabaseClient::connect(db.endpoint())
                .await
                .unwrap()
                .load(database::LoadRequest {
                    actors: vec![],
                    task_ids: vec![staged_id],
                })
                .await
                .unwrap()
                .into_inner();
            assert_eq!(loaded.tasks.len(), usize::from(staged_present));
        });
        db.restart();
        let mut after = runtime.block_on(pending_tasks(&db.endpoint()));
        let order = |a: &database::Task, b: &database::Task| {
            a.task_id
                .as_ref()
                .unwrap()
                .task_uuid
                .cmp(&b.task_id.as_ref().unwrap().task_uuid)
        };
        before.sort_by(order);
        after.sort_by(order);
        assert_eq!(
            after, before,
            "live capacity outcome lost tasks across RocksDB restart"
        );
        assert_eq!(
            runtime.block_on(load_state(&db.endpoint(), "root")),
            Some(vec![0x08, expected_state])
        );
    }
}

#[test]
#[ignore = "requires REBOOT_NATIVE2PC_CXX_DATABASE real C++ Database/RocksDB"]
fn generated_task_cancellation_and_lost_commit_ack_fail_host_then_restart_completes() {
    prove_cancellation_ownership("ownership");
}

#[test]
#[ignore = "requires REBOOT_NATIVE2PC_CXX_DATABASE real C++ Database/RocksDB"]
fn generated_task_admission_and_post_durable_future_cancellation_restart_completes() {
    prove_cancellation_ownership("ownership-cancel");
}

#[test]
#[ignore = "requires REBOOT_NATIVE2PC_CXX_DATABASE real C++ Database/RocksDB"]
fn generated_task_uncertainty_cancels_competing_admitted_rpc_then_restart_completes() {
    prove_cancellation_ownership("ownership-competing");
}

fn prove_cancellation_ownership(vector: &str) {
    let fixture = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("tests/fixtures/generated_cxx_database_process");
    assert!(
        Command::new("cargo")
            .args(["build", "--locked"])
            .current_dir(&fixture)
            .status()
            .unwrap()
            .success()
    );
    let binary = std::path::PathBuf::from(std::env::var_os("CARGO_TARGET_DIR").unwrap())
        .join("debug/generated-cxx-database-process-host");
    let mut db = CxxDatabase::start(std::env::var("REBOOT_NATIVE2PC_CXX_DATABASE").unwrap());
    let runtime = tokio::runtime::Runtime::new().unwrap();
    runtime.block_on(store_counter(&db.endpoint(), "root", 5));
    let listen = port();
    let plan = placement_proto::ListenForPlanResponse::decode(
        URL_SAFE_NO_PAD
            .decode(legacy_plan_for(&[("root", listen)]))
            .unwrap()
            .as_slice(),
    )
    .unwrap();
    let planner = LivePlannerServer::start(&runtime, plan);
    let markers = tempfile::tempdir().unwrap();
    let marker = markers.path().join("reader");
    let ack = markers.path().join("lost-commit-ack");
    let mut host = task_host(TaskHostOptions {
        binary: &binary,
        database: &db.endpoint(),
        planner: &planner.endpoint,
        port: listen,
        marker: &marker,
        ack: &ack,
        invoke: true,
        block: false,
        recover: false,
        vector: Some(vector),
    });
    // The host itself must fail under supervision, not be killed to un-wedge it.
    let status = (0..240).find_map(|_| {
        let status = host.try_wait().unwrap();
        if status.is_none() {
            std::thread::sleep(Duration::from_millis(25));
        }
        status
    });
    if status.is_none() {
        host.kill().unwrap();
        host.wait().unwrap();
    }
    assert!(
        status.is_some(),
        "uncertain root did not fail supervised host"
    );
    assert!(!status.unwrap().success());
    if vector == "ownership-competing" {
        assert!(
            std::path::Path::new(&format!("{}.queued", ack.display())).exists(),
            "second RPC must pass ingress and reach actor admission"
        );
        assert!(
            std::path::Path::new(&format!("{}.queued.released", ack.display())).exists(),
            "host failure must cancel already-admitted RPC without a client deadline"
        );
    } else {
        assert!(
            std::path::Path::new(&format!("{}.cancel", marker.display())).exists(),
            "pre-durable cancellation must reach handler"
        );
        assert!(
            std::path::Path::new(&format!("{}.admission.cancelled", ack.display())).exists(),
            "admission cancellation must leave real sidecar unchanged before retry"
        );
    }
    assert!(
        !marker.exists(),
        "uncertain participant lease must not release to task reader"
    );
    assert!(
        ack.exists(),
        "next root must admit and really commit before ACK loss/cancellation"
    );
    assert_eq!(
        runtime.block_on(load_state(&db.endpoint(), "root")),
        Some(vec![0x08, 12])
    );
    let pending = runtime.block_on(pending_tasks(&db.endpoint()));
    assert_eq!(pending.len(), 1);
    let id = pending[0].task_id.clone().unwrap();
    db.restart();
    let mut recovered = task_host(TaskHostOptions {
        binary: &binary,
        database: &db.endpoint(),
        planner: &planner.endpoint,
        port: listen,
        marker: &marker,
        ack: &ack,
        invoke: false,
        block: false,
        recover: true,
        vector: None,
    });
    await_marker(&marker, &mut recovered);
    let completed = (0..200).find_map(|_| {
        let task = runtime.block_on(load_task(&db.endpoint(), id.clone()));
        if task.status == database::task::Status::Completed as i32 {
            Some(task)
        } else {
            std::thread::sleep(Duration::from_millis(25));
            None
        }
    });
    recovered.kill().unwrap();
    recovered.wait().unwrap();
    let completed = completed.expect("restarted supervised host must complete task");
    assert!(matches!(
        completed.response_or_error,
        Some(database::task::ResponseOrError::Response(_))
    ));
    assert_eq!(std::fs::read_to_string(&marker).unwrap(), "12");
}

#[test]
#[ignore = "requires REBOOT_NATIVE2PC_CXX_DATABASE real C++ Database/RocksDB"]
fn generated_one_shot_reader_task_commit_restart_redelivery_completion_no_redispatch() {
    let database_binary = std::env::var("REBOOT_NATIVE2PC_CXX_DATABASE").unwrap();
    let fixture = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("tests/fixtures/generated_cxx_database_process");
    assert!(
        Command::new("cargo")
            .args(["build", "--locked"])
            .current_dir(&fixture)
            .status()
            .unwrap()
            .success()
    );
    let target = std::env::var_os("CARGO_TARGET_DIR")
        .map(std::path::PathBuf::from)
        .unwrap_or_else(|| fixture.join("target"));
    let binary = target.join("debug/generated-cxx-database-process-host");
    let mut db = CxxDatabase::start(database_binary);
    let runtime = tokio::runtime::Runtime::new().unwrap();
    runtime.block_on(store_counter(&db.endpoint(), "root", 5));
    let listen = port();
    let plan = placement_proto::ListenForPlanResponse::decode(
        URL_SAFE_NO_PAD
            .decode(legacy_plan_for(&[("root", listen)]))
            .unwrap()
            .as_slice(),
    )
    .unwrap();
    let planner = LivePlannerServer::start(&runtime, plan);
    let markers = tempfile::tempdir().unwrap();
    // Every unsupported staged vector must abort admission before staging,
    // leaving no pending task and unchanged real-sidecar actor state.
    for vector in [
        "no-owner",
        "unknown",
        "writer",
        "malformed",
        "identity",
        "uuid",
        "uuid-version",
        "uuid-variant",
        "duplicate",
        "capacity",
        "schedule",
        "iteration",
    ] {
        let marker = markers.path().join(format!("denied-{vector}"));
        let ack = markers.path().join(format!("denied-ack-{vector}"));
        let mut host = task_host(TaskHostOptions {
            binary: &binary,
            database: &db.endpoint(),
            planner: &planner.endpoint,
            port: listen,
            marker: &marker,
            ack: &ack,
            invoke: true,
            block: false,
            recover: false,
            vector: Some(vector),
        });
        assert!(host.wait().unwrap().success(), "denial vector {vector}");
        assert_eq!(
            runtime.block_on(load_state(&db.endpoint(), "root")),
            Some(vec![0x08, 5])
        );
        assert!(runtime.block_on(pending_tasks(&db.endpoint())).is_empty());
        assert!(!marker.exists());
    }
    let started = markers.path().join("started-before-crash");
    let ack = markers.path().join("committed-root-response");
    let mut host = task_host(TaskHostOptions {
        binary: &binary,
        database: &db.endpoint(),
        planner: &planner.endpoint,
        port: listen,
        marker: &started,
        ack: &ack,
        invoke: true,
        block: true,
        recover: false,
        vector: None,
    });
    await_marker(&ack, &mut host);
    await_marker(&started, &mut host);
    // The generated reader observed the committed mutation, never the held
    // root participant lease. Its response is deliberately suspended.
    assert_eq!(std::fs::read_to_string(&started).unwrap(), "12");
    assert_eq!(
        runtime.block_on(load_state(&db.endpoint(), "root")),
        Some(vec![0x08, 12])
    );
    let pending = runtime.block_on(pending_tasks(&db.endpoint()));
    assert_eq!(pending.len(), 1);
    assert_eq!(pending[0].method, "Query");
    assert!(pending[0].timestamp.is_none());
    assert_eq!(pending[0].iteration, 0);
    assert_eq!(
        Uuid::from_slice(&pending[0].task_id.as_ref().unwrap().task_uuid)
            .unwrap()
            .get_version_num(),
        4
    );
    let id = pending[0].task_id.clone().unwrap();
    host.kill().unwrap();
    host.wait().unwrap();
    db.restart();
    assert_eq!(
        runtime.block_on(load_task(&db.endpoint(), id.clone())),
        pending[0]
    );
    assert_eq!(
        runtime.block_on(load_state(&db.endpoint(), "root")),
        Some(vec![0x08, 12])
    );
    let redelivered = markers.path().join("redelivered-after-restart");
    let mut recovered = task_host(TaskHostOptions {
        binary: &binary,
        database: &db.endpoint(),
        planner: &planner.endpoint,
        port: listen,
        marker: &redelivered,
        ack: &ack,
        invoke: false,
        block: false,
        recover: true,
        vector: None,
    });
    await_marker(&redelivered, &mut recovered);
    let mut completed = runtime.block_on(load_task(&db.endpoint(), id.clone()));
    for _ in 0..200 {
        if completed.status == database::task::Status::Completed as i32 {
            break;
        }
        assert!(recovered.try_wait().unwrap().is_none());
        std::thread::sleep(Duration::from_millis(25));
        completed = runtime.block_on(load_task(&db.endpoint(), id.clone()));
    }
    assert_eq!(completed.status, database::task::Status::Completed as i32);
    assert_eq!(completed.request, pending[0].request);
    assert_eq!(completed.method, pending[0].method);
    match completed.response_or_error.as_ref().unwrap() {
        database::task::ResponseOrError::Response(response) => {
            assert_eq!(
                response.type_url,
                "type.googleapis.com/tests.reboot.protoc.TransactionCounterValue"
            );
            assert_eq!(response.value, vec![0x08, 12]);
        }
        _ => panic!("reader response must be terminal response Any"),
    }
    recovered.kill().unwrap();
    recovered.wait().unwrap();
    db.restart();
    assert_eq!(runtime.block_on(load_task(&db.endpoint(), id)), completed);
    assert!(runtime.block_on(pending_tasks(&db.endpoint())).is_empty());
    let reused = format!(
        "reuse:{}",
        Uuid::from_slice(&completed.task_id.as_ref().unwrap().task_uuid).unwrap()
    );
    let mut denied_reuse = task_host(TaskHostOptions {
        binary: &binary,
        database: &db.endpoint(),
        planner: &planner.endpoint,
        port: listen,
        marker: &redelivered,
        ack: &ack,
        invoke: true,
        block: false,
        recover: true,
        vector: Some(&reused),
    });
    assert!(denied_reuse.wait().unwrap().success());
    assert_eq!(
        runtime.block_on(load_task(
            &db.endpoint(),
            completed.task_id.clone().unwrap()
        )),
        completed
    );
    assert_eq!(
        runtime.block_on(load_state(&db.endpoint(), "root")),
        Some(vec![0x08, 12])
    );
    let no_redispatch = markers.path().join("must-not-redispatch");
    let mut final_host = task_host(TaskHostOptions {
        binary: &binary,
        database: &db.endpoint(),
        planner: &planner.endpoint,
        port: listen,
        marker: &no_redispatch,
        ack: &ack,
        invoke: false,
        block: false,
        recover: true,
        vector: None,
    });
    wait(listen);
    // Public ingress must pass the real host readiness barrier, not just TCP.
    runtime.block_on(async {
        let channel = tonic::transport::Channel::from_shared(format!("http://127.0.0.1:{listen}"))
            .unwrap()
            .connect()
            .await
            .unwrap();
        let mut client = tonic::client::Grpc::new(channel);
        for attempt in 0..200 {
            let mut request = tonic::Request::new(TaskQueryRequest { amount: 0 });
            *request.metadata_mut() = reboot_rust_schema::RebootHeaders::new("root")
                .to_metadata()
                .unwrap();
            client.ready().await.unwrap();
            let result: Result<tonic::Response<TaskQueryResponse>, tonic::Status> = client
                .unary(
                    request,
                    tonic::codegen::http::uri::PathAndQuery::from_static(
                        "/tests.reboot.protoc.TransactionCounterWritesMethods/Query",
                    ),
                    tonic::codec::ProstCodec::default(),
                )
                .await;
            match result {
                Ok(response) => {
                    assert_eq!(response.into_inner().value, 12);
                    break;
                }
                Err(error) if error.code() == tonic::Code::Unavailable && attempt < 199 => {
                    tokio::time::sleep(Duration::from_millis(25)).await
                }
                Err(error) => panic!("final host did not become ready: {error}"),
            }
        }
    });
    assert!(!no_redispatch.exists());
    let mut discovered = pending[0].clone();
    discovered.task_id.as_mut().unwrap().task_uuid = Uuid::new_v4().as_bytes().to_vec();
    runtime.block_on(async {
        database::database_client::DatabaseClient::connect(db.endpoint())
            .await
            .unwrap()
            .store(database::StoreRequest {
                task_upserts: vec![discovered.clone()],
                sync: true,
                ..Default::default()
            })
            .await
            .unwrap();
    });
    await_marker(&no_redispatch, &mut final_host);
    let mut terminal = runtime.block_on(load_task(
        &db.endpoint(),
        discovered.task_id.clone().unwrap(),
    ));
    for _ in 0..200 {
        if terminal.status == database::task::Status::Completed as i32 {
            break;
        }
        std::thread::sleep(Duration::from_millis(25));
        terminal = runtime.block_on(load_task(
            &db.endpoint(),
            discovered.task_id.clone().unwrap(),
        ));
    }
    assert_eq!(terminal.status, database::task::Status::Completed as i32);
    final_host.kill().unwrap();
    final_host.wait().unwrap();
    planner.stop();
}
