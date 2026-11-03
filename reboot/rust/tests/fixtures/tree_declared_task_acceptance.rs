#[test]
#[ignore = "requires real C++ Database/RocksDB"]
fn tree_declared_tasks_publish_only_after_commit_and_abort_discards_staging() {
    for abort in [false, true] {
        let tree = SupervisedTree::with_refs(
            ["declared-tree-a", "declared-tree-b", "declared-tree-c"].map(|id| {
                reboot_rust_schema::state_ref::StateRef::from_id(
                    "tests.reboot.protoc.TransactionCounter",
                    id,
                )
                .unwrap()
                .to_string()
            }),
        );
        let mut commands = std::array::from_fn::<_, 3, _>(|actor| {
            let mut command = tree.task_command(actor, 0);
            command.arg("--tree-declared-tasks");
            if !abort {
                command.arg("--tree-typed-wait");
            }
            command
        });
        let parked = tree.marker(0, "after-remote");
        commands[0].env("REBOOT_TEST_ROOT_AFTER_REMOTE", &parked);
        if abort {
            commands[0].arg("--tree-handler-error");
        }
        let c = tree.spawn(2, &mut commands[2]);
        let b = tree.spawn(1, &mut commands[1]);
        let a = tree.spawn(0, &mut commands[0]);
        let mut hosts = [a, b, c];
        let root_port = tree.ports[0];
        let root_ref = tree.refs[0].clone();
        let call = tree.runtime.spawn(async move {
            let mut client = tonic::client::Grpc::new(
                tonic::transport::Endpoint::from_shared(format!("http://127.0.0.1:{root_port}"))
                    .unwrap()
                    .connect_lazy(),
            );
            client.ready().await.unwrap();
            let mut request = tonic::Request::new(TaskQueryRequest { amount: 7 });
            request
                .metadata_mut()
                .insert("x-reboot-state-ref", root_ref.parse().unwrap());
            request.set_timeout(Duration::from_secs(15));
            client
                .unary::<_, TaskQueryResponse, _>(
                    request,
                    "/tests.reboot.protoc.TransactionCounterWritesMethods/Increment"
                        .parse()
                        .unwrap(),
                    tonic::codec::ProstCodec::default(),
                )
                .await
        });
        // Root handler error happens before this park; abort uses only B/C records.
        if !abort {
            await_marker(&parked, &mut hosts[0]);
            std::thread::sleep(Duration::from_millis(200));
            for actor in 1..3 {
                let tasks = tree.scheduled_records(actor);
                assert_eq!(tasks.len(), 2);
                assert!(tree.records(actor, &tasks).is_empty());
                assert!(!tree.marker(actor, "tasks.invocations").exists());
                assert!(!tree.marker(actor, "tasks.writer-invocations").exists());
            }
            std::fs::write(parked.with_extension("release"), b"release actual root").unwrap();
            assert_eq!(
                tree.runtime
                    .block_on(call)
                    .unwrap()
                    .unwrap()
                    .into_inner()
                    .value,
                12
            );
            for actor in 0..3 {
                std::fs::write(tree.marker(actor, "tasks.wait-ready"), b"actual Commit ACK")
                    .unwrap();
                await_marker(&tree.marker(actor, "tasks.typed-wait"), &mut hosts[actor]);
                assert_eq!(
                    std::fs::read_to_string(tree.marker(actor, "tasks.typed-wait")).unwrap(),
                    "4242\n4242"
                );
                let tasks = tree.scheduled_records(actor);
                let records = tree.records(actor, &tasks);
                assert_eq!(records.len(), 2);
                assert!(records.iter().all(|task| task.status
                    == database::task::Status::Completed as i32
                    && matches!(
                        task.response_or_error,
                        Some(database::task::ResponseOrError::Error(_))
                    )));
                assert_eq!(
                    tree.rpc(actor, "Apply", 100, Duration::from_secs(2))
                        .unwrap(),
                    [112, 127, 147][actor],
                    "actual exclusive readmission after terminal errors"
                );
            }
        } else {
            assert_eq!(
                tree.runtime.block_on(call).unwrap().unwrap_err().code(),
                tonic::Code::InvalidArgument
            );
            tree.states([5, 20, 40]);
            for actor in 1..3 {
                assert!(tree
                    .records(actor, &tree.scheduled_records(actor))
                    .is_empty());
                assert!(!tree.marker(actor, "tasks.invocations").exists());
                assert!(!tree.marker(actor, "tasks.writer-invocations").exists());
            }
        }
        for host in &mut hosts {
            host.kill().unwrap();
            host.wait().unwrap();
        }
    }
}
