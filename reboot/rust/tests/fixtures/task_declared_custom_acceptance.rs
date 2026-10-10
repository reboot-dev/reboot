#[test]
#[ignore = "requires REBOOT_NATIVE2PC_CXX_DATABASE real C++ Database/RocksDB"]
fn custom_declared_registration_association_and_completion_winners_fail_closed() {
    for vector in [
        "declared-wrong-full",
        "declared-wrong-request",
        "declared-undeclared",
        "declared-malformed",
        "declared-cas-wrong",
        "declared-cas-equal",
    ] {
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
        task.method = "ApplyDeclared".into();
        let id = task.task_id.clone().unwrap();
        runtime.block_on(seed_task(&db.endpoint(), task.clone(), None));
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
            let tasks = OneShotTasks::new_with_declarations(DatabaseActorStore::connect(db.endpoint()).await.unwrap(), id.state_type.clone(), reference.clone(), CustomWriter {
                mode: vector, endpoint: db.endpoint(), calls: calls.clone(), entered: Arc::new(tokio::sync::Notify::new()),
                dropped: Arc::new(false.into()), observed: Arc::new(std::sync::Mutex::new(None))
            }, vec![reboot_rust_schema::one_shot_tasks::TaskMethodDeclaration::new::<CounterDeclaration, TaskCounter, TaskCounter>(
                "tests.reboot.protoc.TransactionCounterWritesMethods.ApplyDeclared", RESPONSE,
                vec![reboot_rust_schema::one_shot_tasks::DeclaredTaskError::new::<TaskCounter>("type.googleapis.com/tests.reboot.protoc.TransactionLimitExceeded")])]).unwrap();
            let placement = reboot_rust_schema::legacy_placement::PlanOnlyLegacyPlacement::new();
            let app = reboot_rust_schema::legacy_placement::LegacyApplicationId::new("generated-cxx-database-process").unwrap();
            let host = ApplicationHost::new("generated-cxx-database-process").with_legacy_placement_readiness(placement.clone())
                .with_host_recovery(PlacementPlannerRecovery::new(&planner.endpoint, placement.clone()).unwrap())
                .with_host_recovery(tasks.recovery(database::RecoverRequest { state_tags_by_state_type: [(id.state_type.clone(), "TransactionCounter".into())].into(), shard_ids: vec!["s000000000".into()], skip_idempotent_mutations: true }))
                .add_public_service(tasks.wait_service(app, "server-0", placement));
            let (shutdown, stopped) = tokio::sync::oneshot::channel();
            let serving = tokio::spawn(host.serve_with_shutdown(format!("127.0.0.1:{listen}").parse().unwrap(), async { let _ = stopped.await; }));
            if vector == "declared-cas-equal" {
                tokio::time::timeout(Duration::from_secs(5), async {
                    loop { if tasks.completed_operations() == 1 { break; }
                        tokio::time::sleep(Duration::from_millis(10)).await; }
                }).await.unwrap();
                // Counter is published only after actual losing-CAS reload and validation.
                assert_eq!(tasks.completed_operations(), 1);
                shutdown.send(()).unwrap();
                assert!(tokio::time::timeout(Duration::from_secs(5), serving).await.unwrap().unwrap().is_ok());
                assert!(!tasks.has_uncertain_operation());
            } else {
                let result = tokio::time::timeout(Duration::from_secs(5), async {
                    tokio::select! {
                        result = serving => result.unwrap(),
                        _ = async { loop {
                            let actual = task_vertical_acceptance::load_task(&db.endpoint(), id.clone()).await;
                            assert_eq!(actual, task, "invalid method/request/error association must never authorize completion: {vector}");
                            tokio::time::sleep(Duration::from_millis(10)).await;
                        } } , if !vector.starts_with("declared-cas-") => unreachable!(),
                    }
                }).await.unwrap();
                let expected = if matches!(vector, "declared-undeclared" | "declared-malformed") { tonic::Code::DataLoss } else { tonic::Code::FailedPrecondition };
                assert!(matches!(result, Err(ApplicationHostError::RecoveryTask(ref status)) if status.code() == expected), "{vector}: {result:?}");
                if vector == "declared-cas-wrong" { assert!(tasks.has_uncertain_operation()); }
            }
            assert_eq!(calls.load(std::sync::atomic::Ordering::SeqCst), usize::from(!matches!(vector, "declared-wrong-full" | "declared-wrong-request")));
            let mut stream = database::database_client::DatabaseClient::connect(db.endpoint()).await.unwrap().recover_idempotent_mutations(database::RecoverIdempotentMutationsRequest {
                state_type: id.state_type.clone(), state_ref: reference.clone(),
                idempotency_key: Some(reboot_rust_schema::runtime::writer_task_key(&id, "tests.reboot.protoc.TransactionCounterWritesMethods.ApplyDeclared").unwrap().as_bytes().to_vec()), ..Default::default() }).await.unwrap().into_inner();
            while let Some(batch) = stream.message().await.unwrap() { assert!(batch.idempotent_mutations.is_empty()); }
        });
        let actual = runtime.block_on(task_vertical_acceptance::load_task(
            &db.endpoint(),
            id.clone(),
        ));
        if vector.starts_with("declared-cas-") {
            assert_eq!(actual.status, database::task::Status::Completed as i32);
            let Some(database::task::ResponseOrError::Error(error)) = &actual.response_or_error
            else {
                panic!("winner must remain an error");
            };
            let rich = reboot_rust_schema::one_shot_tasks::decode_task_error(error).unwrap();
            assert_eq!(
                TaskCounter::decode(rich.details[0].value.as_slice())
                    .unwrap()
                    .value,
                if vector == "declared-cas-equal" {
                    4242
                } else {
                    999
                }
            );
        } else {
            assert_eq!(actual, task);
        }
        db.restart();
        assert_eq!(
            runtime.block_on(task_vertical_acceptance::load_task(&db.endpoint(), id)),
            actual
        );
        assert_eq!(
            runtime.block_on(load_state(&db.endpoint(), &reference)),
            Some(TaskCounter { value: 5 }.encode_to_vec())
        );
    }
}
