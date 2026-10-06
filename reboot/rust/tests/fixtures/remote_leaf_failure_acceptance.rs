fn leaf_load_records(
    fixture: &DistributedTasks,
    records: &[database::Task],
) -> Vec<database::Task> {
    fixture.runtime.block_on(async {
        database::database_client::DatabaseClient::connect(fixture.target_db.endpoint())
            .await
            .unwrap()
            .load(database::LoadRequest {
                actors: vec![],
                task_ids: records
                    .iter()
                    .map(|task| task.task_id.clone().unwrap())
                    .collect(),
            })
            .await
            .unwrap()
            .into_inner()
            .tasks
    })
}
#[test]
#[ignore = "requires REBOOT_NATIVE2PC_CXX_DATABASE real C++ Database/RocksDB"]
fn remote_leaf_task_rejections_release_both_live_exclusive_actors() {
    for vector in [
        "malformed",
        "unknown",
        "writer",
        "identity",
        "foreign-type",
        "duplicate",
        "capacity",
        "missing-live-owner",
        "inactive-live-owner",
        "full-live-owner",
        "descendant",
        "inactive-owner",
        "no-owner",
        "shared-registry",
        "persisted",
        "saturation",
    ] {
        let mut fixture = DistributedTasks::new();
        let mut preserved = Vec::new();
        let mut target_command = fixture.leaf_command();
        match vector {
            "missing-live-owner" => {
                target_command.arg("--no-live-owner");
            }
            "inactive-live-owner" => {
                target_command.arg("--inactive-live-owner");
            }
            "full-live-owner" => {
                target_command.arg("--full-live-owner");
            }
            "inactive-owner" => {
                target_command.arg("--inactive-task-owner");
            }
            "no-owner" => {
                target_command.arg("--no-task-owner");
            }
            "shared-registry" => {
                target_command.arg("--shared-task-recovery");
            }
            "persisted" => {
                let mut record = database::Task {
                    task_id: Some(database::TaskId {
                        state_type: "tests.reboot.protoc.TransactionCounter".into(),
                        state_ref: "target".into(),
                        task_uuid: Uuid::new_v4().as_bytes().to_vec(),
                    }),
                    method: "Query".into(),
                    request: TaskQueryRequest { amount: 9000 }.encode_to_vec(),
                    status: database::task::Status::Completed as i32,
                    response_or_error: Some(database::task::ResponseOrError::Response(
                        prost_types::Any {
                            type_url:
                                "type.googleapis.com/tests.reboot.protoc.TransactionCounterValue"
                                    .into(),
                            value: TaskQueryResponse { value: 20 }.encode_to_vec(),
                        },
                    )),
                    ..Default::default()
                };
                record.iteration = 0;
                let id = Uuid::from_slice(&record.task_id.as_ref().unwrap().task_uuid).unwrap();
                preserved.push(record.clone());
                fixture.runtime.block_on(async {
                    database::database_client::DatabaseClient::connect(
                        fixture.target_db.endpoint(),
                    )
                    .await
                    .unwrap()
                    .store(database::StoreRequest {
                        task_upserts: vec![record],
                        sync: true,
                        ..Default::default()
                    })
                    .await
                    .unwrap();
                });
                target_command.args(["--task-vector", &format!("reuse:{id}")]);
            }
            other => {
                target_command.args(["--task-vector", other]);
            }
        }
        let terminal = fixture.markers.path().join("remote-terminal");
        target_command.env("REBOOT_TEST_TARGET_WATCH_TERMINALIZED", &terminal);
        let mut target = fixture.spawn(&mut target_command, "leaf-rejection-target-log");
        wait(fixture.target_port);
        assert_eq!(
            fixture
                .rpc(false, "Apply", 0, Duration::from_secs(1))
                .unwrap(),
            20
        );
        let mut root = fixture.spawn(
            &mut fixture.command_with_root_tasks(true, false),
            "leaf-rejection-root-log",
        );
        wait(fixture.root_port);
        assert_eq!(
            fixture
                .rpc(true, "Query", 0, Duration::from_secs(1))
                .unwrap(),
            5
        );
        let error = leaf_mutation_once(fixture.root_port, Duration::from_secs(2)).unwrap_err();
        let expected = match vector {
            "persisted" => tonic::Code::AlreadyExists,
            "capacity" | "saturation" | "full-live-owner" => tonic::Code::ResourceExhausted,
            "malformed" | "identity" | "foreign-type" | "duplicate" | "unknown" | "writer" => {
                tonic::Code::InvalidArgument
            }
            _ => tonic::Code::FailedPrecondition,
        };
        // Unknown outbound errors lose trailers and doom the root. The actual
        // target validation status remains preserved in the root's wire error.
        assert_eq!(error.code(), expected, "{vector}: {error}");
        if !matches!(
            vector,
            "missing-live-owner" | "inactive-live-owner" | "full-live-owner"
        ) {
            await_marker(&terminal, &mut target);
        }
        if vector == "descendant" {
            assert!(
                std::path::Path::new(&format!("{}.descendant-caught", fixture.marker().display()))
                    .exists()
            );
        }
        if vector == "full-live-owner" {
            assert!(
                std::path::Path::new(&format!("{}.watch-full", fixture.marker().display()))
                    .exists()
            );
        }
        assert_eq!(
            fixture.decision().unwrap().outcome,
            database::transaction_coordinator_decision::Outcome::Abort as i32
        );
        assert_eq!(
            fixture
                .rpc(false, "Apply", 0, Duration::from_secs(2))
                .unwrap(),
            20
        );
        assert_eq!(
            fixture
                .rpc(true, "Apply", 0, Duration::from_secs(2))
                .unwrap(),
            5
        );
        fixture.leaf_states(5, 20);
        if vector != "saturation" {
            assert!(
                fixture
                    .runtime
                    .block_on(pending_tasks(&fixture.target_db.endpoint()))
                    .is_empty()
            );
        }
        assert!(
            !fixture.marker().exists(),
            "rejected staged task invoked reader: {vector}"
        );
        assert!(root.try_wait().unwrap().is_none());
        assert!(target.try_wait().unwrap().is_none());
        if vector == "saturation" {
            preserved = database::LoadResponse::decode(
                std::fs::read(format!("{}.seeded-records", fixture.marker().display()))
                    .unwrap()
                    .as_slice(),
            )
            .unwrap()
            .tasks;
            assert_eq!(preserved.len(), 1024);
        }
        assert_eq!(leaf_load_records(&fixture, &preserved), preserved);
        assert!(
            !std::path::Path::new(&format!("{}.invocations", fixture.marker().display())).exists()
        );
        DistributedTasks::stop(&mut root);
        DistributedTasks::stop(&mut target);
        fixture.root_db.restart();
        fixture.target_db.restart();
        fixture.leaf_states(5, 20);
        assert_eq!(leaf_load_records(&fixture, &preserved), preserved);
        assert!(
            !std::path::Path::new(&format!("{}.invocations", fixture.marker().display())).exists()
        );
    }
}
#[test]
#[ignore = "requires REBOOT_NATIVE2PC_CXX_DATABASE real C++ Database/RocksDB"]
fn remote_leaf_task_caught_lost_staged_trailers_and_deadlines_self_watch() {
    for phase in ["caught", "handler", "validation", "staging", "pretrailer"] {
        let mut fixture = DistributedTasks::new();
        let barrier = fixture.markers.path().join("remote-drop");
        let terminal = fixture.markers.path().join("remote-terminal");
        let caught = fixture.markers.path().join("caught");
        let mut command = fixture.leaf_command();
        command.env("REBOOT_TEST_TARGET_WATCH_TERMINALIZED", &terminal);
        match phase {
            "handler" => {
                command.env("REBOOT_TEST_TARGET_UNFINISHED_OUTBOUND", &barrier);
            }
            "validation" => {
                command.env("REBOOT_TEST_TASK_ADMISSION_CANCEL", &barrier);
            }
            "staging" => {
                command.env("REBOOT_TEST_TASK_STAGING_CANCEL", &barrier);
            }
            _ => {
                command.env("REBOOT_TEST_LIVE_INBOUND_RESPONSE", &barrier);
            }
        }
        if phase == "caught" {
            command.env("REBOOT_TEST_LIVE_INBOUND_RESPONSE_ERROR", "1");
        }
        let mut target = fixture.spawn(&mut command, "leaf-drop-target-log");
        wait(fixture.target_port);
        assert_eq!(
            fixture
                .rpc(false, "Apply", 0, Duration::from_secs(1))
                .unwrap(),
            20
        );
        let mut command = fixture.command_with_root_tasks(true, false);
        if phase == "caught" {
            command.args([
                "--catch-outbound-error",
                "--outbound-error-marker",
                caught.to_str().unwrap(),
            ]);
        }
        let mut root = fixture.spawn(&mut command, "leaf-drop-root-log");
        wait(fixture.root_port);
        assert_eq!(
            fixture
                .rpc(true, "Query", 0, Duration::from_secs(1))
                .unwrap(),
            5
        );
        let error = leaf_mutation_once(fixture.root_port, Duration::from_millis(600)).unwrap_err();
        if phase == "caught" {
            assert!(caught.exists(), "actual caught continuation not exercised");
        } else {
            assert!(
                matches!(
                    error.code(),
                    tonic::Code::Cancelled | tonic::Code::DeadlineExceeded
                ),
                "{phase}: {error}"
            );
        }
        assert!(barrier.exists(), "actual {phase} future never entered");
        let dropped = barrier.with_extension(if phase == "handler" {
            "handler-dropped"
        } else {
            "future-dropped"
        });
        await_marker(&dropped, &mut target);
        await_marker(&terminal, &mut target); // producer asserts Drop BEFORE RPC.
        assert_eq!(
            fixture.decision().unwrap().outcome,
            database::transaction_coordinator_decision::Outcome::Abort as i32
        );
        assert_eq!(
            fixture
                .rpc(false, "Apply", 0, Duration::from_secs(2))
                .unwrap(),
            20
        );
        assert_eq!(
            fixture
                .rpc(true, "Apply", 0, Duration::from_secs(2))
                .unwrap(),
            5
        );
        fixture.leaf_states(5, 20);
        assert!(
            fixture
                .runtime
                .block_on(pending_tasks(&fixture.target_db.endpoint()))
                .is_empty()
        );
        assert!(!fixture.marker().exists());
        DistributedTasks::stop(&mut root);
        DistributedTasks::stop(&mut target);
        fixture.root_db.restart();
        fixture.target_db.restart();
        fixture.leaf_states(5, 20);
        assert!(
            fixture
                .runtime
                .block_on(pending_tasks(&fixture.target_db.endpoint()))
                .is_empty()
        );
        assert_eq!(
            fixture.decision().unwrap().outcome,
            database::transaction_coordinator_decision::Outcome::Abort as i32
        );
    }
}
