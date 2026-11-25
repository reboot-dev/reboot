// Bounded A -> B -> C: real generated clients/adapters and three canonical sidecars.
fn descendant_no_private_effects(tree: &SupervisedTree, allow_readmission_probes: bool) {
    let private = database::Task::decode(
        std::fs::read(tree.marker(2, "private-effects"))
            .unwrap()
            .as_slice(),
    )
    .unwrap();
    tree.runtime.block_on(async {
        for actor in 0..3 {
            let mut client = database::database_client::DatabaseClient::connect(
                tree.databases[actor].endpoint(),
            )
            .await
            .unwrap();
            let mut stream = client
                .recover(database::RecoverRequest {
                    shard_ids: vec!["s000000000".into()],
                    skip_idempotent_mutations: false,
                    ..Default::default()
                })
                .await
                .unwrap()
                .into_inner();
            while let Some(batch) = stream.message().await.unwrap() {
                assert!(
                    batch.pending_tasks.is_empty(),
                    "actor {actor}: no canonical pending task leak"
                );
                if !allow_readmission_probes {
                    assert!(batch.idempotent_mutations.is_empty(), "before readmission: actor {actor} has no canonical idempotent effects");
                }
                let probe_fingerprint = reboot_rust_schema::runtime::request_fingerprint(
                    "tests.reboot.protoc.TransactionCounterWritesMethods.Apply", &TaskQueryRequest { amount: 0 });
                for mutation in batch.idempotent_mutations {
                    assert_eq!(mutation.request_fingerprint.as_deref(), Some(probe_fingerprint.as_slice()), "actor {actor}: only legitimate Apply(0) writer-readmission probe may persist; no C error mutation");
                    assert!(mutation.task_ids.is_empty(), "readmission probe must not leak private C tasks");
                }
            }
        }
        let mut client =
            database::database_client::DatabaseClient::connect(tree.databases[2].endpoint())
                .await
                .unwrap();
        let loaded = client
            .load(database::LoadRequest {
                actors: vec![],
                task_ids: vec![private.task_id.unwrap()],
            })
            .await
            .unwrap()
            .into_inner();
        assert!(
            loaded.tasks.is_empty(),
            "C exact private task identity absent (Pending or Completed)"
        );
    });
}

fn descendant_rollback_scenario(legacy: bool) {
    let mut tree = SupervisedTree::new();
    let mut tip = tree.command(2);
    tip.args([
        "--rollback-leaf",
        tree.marker(2, "private-effects").to_str().unwrap(),
    ]);
    if legacy {
        tip.arg("--rollback-legacy-handler");
    }
    let c = tree.spawn(2, &mut tip);
    let caught = tree.marker(1, "caught");
    let mut branch = tree.command(1);
    branch.args(["--rollback-catch", caught.to_str().unwrap()]);
    let b = tree.spawn(1, &mut branch);
    let after = tree.marker(0, "after-b");
    let mut root = tree.command(0);
    root.env("REBOOT_TEST_ROOT_AFTER_REMOTE", &after);
    let durable = tree.marker(0, "durable-classification");
    root.env("REBOOT_TEST_PAUSE_AFTER_COORDINATOR_PREPARE", &durable);
    let a = tree.spawn(0, &mut root);
    let mut hosts = [a, b, c];
    let port = tree.ports[0];
    let call = tree.runtime.spawn(async move {
        let channel = tonic::transport::Endpoint::from_shared(format!("http://127.0.0.1:{port}"))
            .unwrap()
            .connect()
            .await
            .unwrap();
        let mut client = tonic::client::Grpc::new(channel);
        client.ready().await.unwrap();
        let mut request = tonic::Request::new(TaskQueryRequest { amount: 7 });
        request
            .metadata_mut()
            .insert("x-reboot-state-ref", "root".parse().unwrap());
        request.set_timeout(Duration::from_secs(10));
        let response: Result<tonic::Response<TaskQueryResponse>, tonic::Status> = client
            .unary(
                request,
                http::uri::PathAndQuery::from_static(
                    "/tests.reboot.protoc.TransactionCounterWritesMethods/Increment",
                ),
                tonic::codec::ProstCodec::default(),
            )
            .await;
        response.map(|r| r.into_inner().value)
    });
    for (barrier, release) in [
        (
            &caught,
            std::path::PathBuf::from(format!("{}.release", caught.display())),
        ),
        (&after, after.with_extension("release")),
    ] {
        let deadline = std::time::Instant::now() + Duration::from_secs(5);
        while !barrier.exists() {
            assert!(
                std::time::Instant::now() < deadline,
                "descendant barrier missing: {}; A={} B={} C={}",
                barrier.display(),
                std::fs::read_to_string(tree.marker(0, "stderr")).unwrap(),
                std::fs::read_to_string(tree.marker(1, "stderr")).unwrap(),
                std::fs::read_to_string(tree.marker(2, "stderr")).unwrap()
            );
            std::thread::sleep(Duration::from_millis(5));
        }
        assert_eq!(
            std::fs::read_to_string(format!("{}.coordinator", tree.marker(2, "path").display()))
                .unwrap(),
            "tests.reboot.protoc.TransactionCounter\nroot",
            "C must retain original A coordinator before root completion"
        );
        assert_eq!(
            tree.rpc(2, "Query", 0, Duration::from_millis(300)).unwrap(),
            40,
            "admitted C reader must see original canonical state"
        );
        assert_eq!(
            tree.rpc(2, "Apply", 0, Duration::from_millis(100))
                .unwrap_err()
                .code(),
            tonic::Code::Cancelled,
            "C writer must remain excluded until A Prepare"
        );
        assert!(tree.decision().is_none(), "no early A decision");
        tree.states([5, 20, 40]);
        descendant_no_private_effects(&tree, false);
        std::fs::write(release, b"release").unwrap();
    }
    await_marker(&durable, &mut hosts[0]);
    tree.runtime.block_on(async {
        let mut client =
            database::database_client::DatabaseClient::connect(tree.databases[0].endpoint())
                .await
                .unwrap();
        let mut stream = client
            .recover(database::RecoverRequest {
                shard_ids: vec!["s000000000".into()],
                skip_idempotent_mutations: true,
                ..Default::default()
            })
            .await
            .unwrap()
            .into_inner();
        let mut records = Vec::new();
        while let Some(batch) = stream.message().await.unwrap() {
            records.extend(batch.transaction_coordinators);
        }
        assert_eq!(records.len(), 1);
        let participants = records[0].1.participants.as_ref().unwrap();
        assert_eq!(participants.should_commit.len(), 1);
        assert_eq!(participants.read_only.len(), 1);
        assert_eq!(
            participants.should_commit["tests.reboot.protoc.TransactionCounter"].state_refs,
            ["root", "target"],
            "durable A/B writers exact"
        );
        assert_eq!(
            participants.read_only["tests.reboot.protoc.TransactionCounter"].state_refs,
            ["tip"],
            "durable transitive C reader exact"
        );
    });
    tree.paths();
    for actor in 0..3 {
        assert_eq!(
            std::fs::read_to_string(format!(
                "{}.coordinator",
                tree.marker(actor, "path").display()
            ))
            .unwrap(),
            "tests.reboot.protoc.TransactionCounter\nroot",
            "original A coordinator at actor {actor}"
        );
    }
    std::fs::remove_file(durable).unwrap();
    assert_eq!(tree.runtime.block_on(call).unwrap().unwrap(), 12);
    tree.root_members("target\ntip");
    assert_eq!(
        tree.decision().unwrap().outcome,
        database::transaction_coordinator_decision::Outcome::Commit as i32
    );
    assert_eq!(tree.rpc(2, "Apply", 0, Duration::from_secs(2)).unwrap(), 40);
    tree.states([12, 27, 40]);
    let private = database::Task::decode(
        std::fs::read(tree.marker(2, "private-effects"))
            .unwrap()
            .as_slice(),
    )
    .unwrap();
    if legacy {
        assert!(
            std::path::PathBuf::from(format!(
                "{}.legacy-handler",
                tree.marker(2, "private-effects").display()
            ))
            .exists()
        );
    }
    let assert_task_absent = |tree: &SupervisedTree| {
        tree.runtime.block_on(async {
            let mut client =
                database::database_client::DatabaseClient::connect(tree.databases[2].endpoint())
                    .await
                    .unwrap();
            let loaded = client
                .load(database::LoadRequest {
                    actors: vec![],
                    task_ids: vec![private.task_id.clone().unwrap()],
                })
                .await
                .unwrap()
                .into_inner();
            assert!(
                loaded.tasks.is_empty(),
                "C private task identity must not persist"
            );
        })
    };
    assert_task_absent(&tree);
    descendant_no_private_effects(&tree, true);
    SupervisedTree::stop(&mut hosts);
    tree.restart();
    tree.states([12, 27, 40]);
    assert_task_absent(&tree);
    descendant_no_private_effects(&tree, true);
}
#[test]
#[ignore = "requires real C++ Database/RocksDB"]
fn descendant_rollback_typed_catch_commit_restart() {
    descendant_rollback_scenario(false);
}
#[test]
#[ignore = "requires real C++ Database/RocksDB"]
fn descendant_rollback_legacy_catch_commit_restart() {
    descendant_rollback_scenario(true);
}
