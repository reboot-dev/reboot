fn descendant_failure(mode: &str) {
    let mut tree = SupervisedTree::new();
    let mut tip = tree.command(2);
    tip.args([
        "--rollback-leaf",
        tree.marker(2, "private-effects").to_str().unwrap(),
    ]);
    let parked = tree.marker(2, "handler-park");
    let probe = tree.marker(2, "prepare-probe");
    let released = tree.marker(2, "read-only-release");
    if mode == "execution" {
        tip.args(["--rollback-handler-park", parked.to_str().unwrap()]);
        tip.env("REBOOT_TEST_PREPARE_PROBE", &probe).env("REBOOT_TEST_READ_ONLY_RELEASE", &released);
    }
    let c = tree.spawn(2, &mut tip);
    let caught = tree.marker(1, "caught");
    let mut branch = tree.command(1);
    branch.args(["--rollback-catch", caught.to_str().unwrap()]);
    if mode == "b-declared" {
        branch.arg("--rollback-b-declared-after-catch");
    }
    if mode == "b-error" {
        branch.arg("--rollback-root-abort");
    }
    let lost = tree.marker(1, "lost-response");
    if mode == "lost-b" {
        branch
            .env("REBOOT_TEST_LIVE_INBOUND_RESPONSE", &lost)
            .env("REBOOT_TEST_LIVE_INBOUND_RESPONSE_ERROR", "1");
    }
    let b = tree.spawn(1, &mut branch);
    let after = tree.marker(0, "after-b");
    let mut root = tree.command(0);
    if matches!(mode, "a-error" | "a-deadline" | "restart-c") {
        root.env("REBOOT_TEST_ROOT_AFTER_REMOTE", &after);
    }
    if mode == "a-error" {
        root.arg("--tree-handler-error");
    }
    if mode == "b-declared" {
        root.args([
            "--catch-outbound-error",
            "--outbound-error-marker",
            tree.marker(0, "uncertain-caught").to_str().unwrap(),
        ]);
    }
    let a = tree.spawn(0, &mut root);
    let mut hosts = [a, b, c];
    let port = tree.ports[0];
    let deadline = matches!(mode, "b-deadline" | "a-deadline");
    let execution = mode == "execution";
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
        // The execution-barrier vector owns root lifetime causally through B's
        // caught/release barrier, not a full-suite scheduling-sensitive 8s timer.
        if !execution {
            request.set_timeout(if deadline { Duration::from_millis(1200) } else { Duration::from_secs(8) });
        }
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
    if mode == "execution" {
        await_marker(&parked, &mut hosts[2]);
        tree.runtime.block_on(async {
            let mut client = database::participant_client::ParticipantClient::connect(format!(
                "http://127.0.0.1:{}",
                tree.ports[2]
            ))
            .await
            .unwrap();
            let mut request = tonic::Request::new(database::PrepareRequest {
                transaction_id: tree.root.as_bytes().to_vec(),
                read_only: true,
                read_only_aware: true,
                ..Default::default()
            });
            request
                .metadata_mut()
                .insert("x-reboot-state-ref", "tip".parse().unwrap());
            request.metadata_mut().insert("x-reboot-test-prepare-probe", "r4".parse().unwrap());
            request.set_timeout(Duration::from_millis(150));
            let error = client.prepare(request).await.unwrap_err();
            assert!(
                matches!(
                    error.code(),
                    tonic::Code::Cancelled | tonic::Code::DeadlineExceeded
                ),
                "Prepare bypassed actual C execution: {error}"
            );
        });
        await_marker(&probe.with_extension("dropped"), &mut hosts[2]);
        assert!(!probe.with_extension("returned").exists(), "probe completed rather than server Drop while C executing");
        assert!(!released.exists(), "timed-out probe released C lease");
        std::fs::write(format!("{}.release", parked.display()), b"release").unwrap();
    }
    await_marker(&caught, &mut hosts[1]);
    if execution {
        assert!(!call.is_finished(), "root request stopped before C writer exclusion probe");
        assert!(tree.decision().is_none(), "actual root decision preceded lease assertion");
        assert!(!tree.marker(2, "terminal").exists());
        assert!(!released.exists(), "ghost Prepare released retained C lease");
    }
    assert_eq!(
        tree.rpc(2, "Query", 0, Duration::from_millis(300)).unwrap(),
        40
    );
    assert_eq!(
        tree.rpc(2, "Apply", 0, Duration::from_millis(100))
            .unwrap_err()
            .code(),
        tonic::Code::Cancelled
    );
    if mode != "b-deadline" {
        std::fs::write(format!("{}.release", caught.display()), b"release").unwrap();
    }
    if matches!(mode, "a-deadline" | "restart-c") {
        await_marker(&after, &mut hosts[0]);
        if mode == "restart-c" {
            hosts[2].kill().unwrap();
            hosts[2].wait().unwrap();
            tree.databases[2].child.kill().unwrap();
            tree.databases[2].child.wait().unwrap();
            tree.databases[2].restart();
            hosts[2] = tree.spawn(2, &mut tree.command(2));
            std::fs::write(after.with_extension("release"), b"release").unwrap();
        }
    }
    let result = tree.runtime.block_on(call).unwrap();
    if mode == "execution" {
        assert_eq!(result.unwrap().into_inner().value, 12);
        tree.states([12, 27, 40]);
    } else {
        let error = result.unwrap_err();
        if mode == "restart-c" {
            assert_eq!(error.code(), tonic::Code::Aborted);
            assert_eq!(error.message(), "participant rejected Prepare");
            assert!(
                hosts[0].try_wait().unwrap().is_none(),
                "acknowledged Abort must not shut down A"
            );
        }
        if mode == "lost-b" {
            assert!(lost.with_extension("future-dropped").exists());
            // A never learns B or C; both must discover the actual A Abort through Watch.
            assert_eq!(
                std::fs::read_to_string(tree.marker(0, "members")).unwrap_or_default(),
                ""
            );
        }
        tree.abort_and_readmit(&mut hosts);
        if mode == "lost-b" {
            assert!(
                tree.marker(2, "terminal").exists(),
                "unknown C must terminalize via actual A Watch"
            );
        }
    }
    descendant_no_private_effects(&tree, true);
    SupervisedTree::stop(&mut hosts);
    tree.restart();
    tree.states(if mode == "execution" {
        [12, 27, 40]
    } else {
        [5, 20, 40]
    });
    descendant_no_private_effects(&tree, true);
}
#[test]
#[ignore = "requires real C++ Database/RocksDB"]
fn descendant_rollback_whole_root_failure_matrix() {
    for mode in [
        "b-declared",
        "b-error",
        "a-error",
        "b-deadline",
        "a-deadline",
        "lost-b",
        "restart-c",
    ] {
        descendant_failure(mode);
    }
}
#[test]
#[ignore = "requires real C++ Database/RocksDB"]
fn descendant_rollback_actual_c_execution_barrier() {
    descendant_failure("execution");
}
#[test]
#[ignore = "requires real C++ Database/RocksDB"]
fn descendant_rollback_unknown_c_actual_a_watch() {
    descendant_failure("lost-b");
}
#[test]
#[ignore = "requires real C++ Database/RocksDB"]
fn descendant_rollback_failclosed_error_matrix_at_b() {
    for vector in [
        "missing",
        "malformed",
        "writer",
        "foreign",
        "wrong-type",
        "wrong-ref",
        "extra",
        "overlap",
        "multiple",
        "conflict",
        "system",
        "malformed-rich",
        "unknown",
        "transport",
    ] {
        let mut tree = SupervisedTree::new();
        let mut tip = tree.command(2);
        tip.args([
            "--rollback-leaf",
            tree.marker(2, "private-effects").to_str().unwrap(),
        ])
        .env("REBOOT_TEST_ROLLBACK_ERROR_VECTOR", vector);
        let c = tree.spawn(2, &mut tip);
        let mut branch = tree.command(1);
        branch.args([
            "--catch-outbound-error",
            "--outbound-error-marker",
            tree.marker(1, "uncertain-caught").to_str().unwrap(),
        ]);
        let b = tree.spawn(1, &mut branch);
        let a = tree.spawn(0, &mut tree.command(0));
        let mut hosts = [a, b, c];
        assert!(
            tree.rpc(0, "Increment", 7, Duration::from_secs(4)).is_err(),
            "{vector} caught variant must not commit"
        );
        assert_eq!(
            std::fs::read_to_string(tree.marker(1, "uncertain-caught")).unwrap(),
            "caught uncertain generated outbound, empty membership"
        );
        let variant = std::fs::read_to_string(format!(
            "{}.variant",
            tree.marker(1, "uncertain-caught").display()
        ))
        .unwrap();
        let expected = match vector {
            "multiple" => "TransactionLimitExceeded(",
            "system" => "System(",
            _ => "Grpc(",
        };
        assert!(
            variant.contains(expected),
            "{vector}: unexpected variant {variant}"
        );
        tree.abort_and_readmit(&mut hosts);
        descendant_no_private_effects(&tree, true);
        SupervisedTree::stop(&mut hosts);
        tree.restart();
        tree.states([5, 20, 40]);
        descendant_no_private_effects(&tree, true);
    }
}
