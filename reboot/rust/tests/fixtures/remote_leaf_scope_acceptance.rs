// Unsupported transaction metadata is tested against an active generated task
// owner AND live-Watch owner. These shapes reject before handler entry; this
// proves fail-closed scope, not cleanup/recovery for unsupported transaction trees.
#[test]
#[ignore = "requires REBOOT_NATIVE2PC_CXX_DATABASE real C++ Database/RocksDB"]
fn remote_leaf_task_unsupported_transaction_shapes_fail_before_effects() {
    for shape in ["shared", "factory", "idempotent", "deeper"] {
        let mut fixture = DistributedTasks::new();
        if shape == "factory" {
            fixture.target_db =
                CxxDatabase::start(std::env::var("REBOOT_NATIVE2PC_CXX_DATABASE").unwrap());
        }
        let handler = fixture.markers.path().join("unsupported-handler");
        let mut command = fixture.leaf_command();
        command.args([
            "--negative-task-shape",
            "--negative-shape-marker",
            handler.to_str().unwrap(),
        ]);
        let mut target = fixture.spawn(&mut command, "leaf-scope-target-log");
        wait(fixture.target_port);
        let ready = fixture.rpc(false, "Query", 0, Duration::from_secs(1));
        if shape == "factory" {
            assert_eq!(ready.unwrap(), 0); // generated reader loads absent state as default
        } else {
            assert_eq!(ready.unwrap(), 20);
        }
        let mut root = fixture.spawn(
            &mut fixture.command_with_root_tasks(true, false),
            "leaf-scope-root-log",
        );
        wait(fixture.root_port);
        assert_eq!(
            fixture
                .rpc(true, "Query", 0, Duration::from_secs(1))
                .unwrap(),
            5
        );
        let error = fixture.runtime.block_on(async {
            let channel = tonic::transport::Endpoint::from_shared(format!(
                "http://127.0.0.1:{}",
                fixture.target_port
            ))
            .unwrap()
            .connect_lazy();
            let mut client = tonic::client::Grpc::new(channel);
            client.ready().await.unwrap();
            let mut headers = reboot_rust_schema::RebootHeaders::new("target");
            headers.transaction_ids = Some(if shape == "deeper" {
                vec![fixture.id, Uuid::new_v4()]
            } else {
                vec![fixture.id]
            });
            headers.transaction_coordinator_state_type =
                Some("tests.reboot.protoc.TransactionCounter".into());
            headers.transaction_coordinator_state_ref = Some("root".into());
            if shape == "idempotent" {
                headers.idempotency_key = Some(Uuid::new_v4());
            }
            let mut request = tonic::Request::new(TaskQueryRequest { amount: 7 });
            *request.metadata_mut() = headers.to_metadata().unwrap();
            request.set_timeout(Duration::from_secs(2));
            let method = match shape {
                "factory" => "FactoryIncrement",
                "shared" => "SharedRead",
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
            if shape == "factory" {
                tonic::Code::Unimplemented
            } else {
                tonic::Code::FailedPrecondition
            },
            "{shape}: {error}"
        );
        if shape != "factory" {
            assert_eq!(
                error.message(),
                "live Watch requires a direct-root exclusive non-idempotent leaf",
                "{shape}"
            );
        }
        assert!(
            !handler.exists(),
            "unsupported shape reached task-producing handler: {shape}"
        );
        assert!(!std::path::Path::new(&format!("{}.task-id", fixture.marker().display())).exists());
        assert!(!fixture.marker().exists());
        assert!(
            fixture.decision().is_none(),
            "unsupported shape manufactured root outcome: {shape}"
        );
        for database in [&fixture.root_db, &fixture.target_db] {
            assert!(
                fixture
                    .runtime
                    .block_on(pending_tasks(&database.endpoint()))
                    .is_empty()
            );
        }
        assert!(target.try_wait().unwrap().is_none());
        assert!(root.try_wait().unwrap().is_none());
        DistributedTasks::stop(&mut root);
        DistributedTasks::stop(&mut target);
        fixture.root_db.restart();
        fixture.target_db.restart();
        assert_eq!(
            fixture
                .runtime
                .block_on(load_state(&fixture.root_db.endpoint(), "root")),
            Some(vec![8, 5])
        );
        assert_eq!(
            fixture
                .runtime
                .block_on(load_state(&fixture.target_db.endpoint(), "target")),
            if shape == "factory" {
                None
            } else {
                Some(vec![8, 20])
            }
        );
        for database in [&fixture.root_db, &fixture.target_db] {
            assert!(
                fixture
                    .runtime
                    .block_on(pending_tasks(&database.endpoint()))
                    .is_empty()
            );
        }
    }
}
