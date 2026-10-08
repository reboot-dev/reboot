// Actual generated A -> B -> B calls, independent canonical sidecars.

#[test]
#[ignore = "requires real C++ Database/RocksDB"]
fn reusable_rfix_guard_completed_and_unknown_n2_no_commit() {
    for completed in [true, false] {
        let mut tree = SupervisedTree::with_refs(["rfix-a","rfix-b","rfix-unused"].map(|id| reboot_rust_schema::state_ref::StateRef::from_id("tests.reboot.protoc.TransactionCounter",id).unwrap().to_string()));
        let seed = completed.then(|| tree.seed_identity_task(1, true));
        let marker = tree.marker(1, "direct-guard-completed");
        let mut bc = tree.reusable_command(1,false); bc.arg("--block-task");
        if let Some(seed) = &seed {
            let id = Uuid::from_slice(&seed.task_id.as_ref().unwrap().task_uuid).unwrap().to_string();
            bc.args(["--reuse-completed-uuid", &id]);
            bc.env("REBOOT_TEST_GUARD_COMPLETED_UUID", &id).env("REBOOT_TEST_GUARD_COMPLETED_MARKER", &marker);
        } else { bc.arg("--reuse-unknown"); }
        let b = tree.spawn(1,&mut bc); let a = tree.spawn(0,&mut tree.reusable_command(0,false)); let mut hosts=[a,b];
        let error = tree.rpc(0,"Increment",7,Duration::from_secs(8)).unwrap_err();
        assert_eq!(error.code(), if completed { tonic::Code::AlreadyExists } else { tonic::Code::Unavailable });
        if completed { await_marker(&marker,&mut hosts[1]); assert_eq!(std::fs::read_to_string(&marker).unwrap(),"AlreadyExists","exported live guard staging bypassed durable Completed ID validation"); }
        let tasks = tree.reusable_tasks();
        let deadline=std::time::Instant::now()+Duration::from_secs(5);
        loop { if tree.rpc(1,"Apply",0,Duration::from_millis(100)).is_ok() { break; } assert!(std::time::Instant::now()<deadline,"root Abort/self Watch failed to release retained B"); }
        tree.reusable_states([5,20,40]);
        let records = tree.records(1,&tasks);
        assert_eq!(records,seed.into_iter().collect::<Vec<_>>(),"unknown/rejected N2 committed N1 or reopened Completed task");
        assert!(!tree.marker(1,"tasks.invocations").exists());
        SupervisedTree::stop_reusable(&mut hosts); tree.restart();
        tree.reusable_states([5,20,40]); assert_eq!(tree.records(1,&tasks),records);
        tree.planner.stop();
    }
}

impl SupervisedTree {
    fn reusable_states(&self, expected: [u8; 3]) {
        for (actor,value) in expected.into_iter().enumerate() {
            assert_eq!(self.runtime.block_on(load_state(&self.databases[actor].endpoint(),&self.refs[actor])),Some(TaskQueryResponse { value: i64::from(value) }.encode_to_vec()));
        }
    }
    fn stop_reusable(hosts: &mut [WaitHostGuard; 2]) { for host in hosts { let _ = host.kill(); let _ = host.wait(); } }
    fn reusable_command(&self, actor: usize, declared: bool) -> Command {
        let original = self.star_command(actor, 0);
        let args: Vec<_> = original.get_args().map(|s| s.to_os_string()).collect();
        let mut command = Command::new(original.get_program());
        let mut i = 0;
        while i < args.len() {
            if actor == 0 && args[i] == "--tree-local-tasks" { i += 2; continue; }
            if args[i] == "--sequential-root-star" { i += 1; continue; }
            if args[i] == "--star-second" { command.args(["--star-second", &self.refs[1]]); i += 2; continue; }
            command.arg(&args[i]); i += 1;
        }
        for (key, value) in original.get_envs() { if let Some(value) = value { command.env(key,value); } }
        command.arg("--sequential-reusable");
        if actor == 1 && declared { command.arg("--reuse-declared"); }
        if actor == 0 { command.args(["--outbound-error-marker", self.marker(0,"reuse-catch").to_str().unwrap()]); }
        command
    }
    fn reusable_tasks(&self) -> Vec<database::Task> {
        [7,11].into_iter().map(|amount| database::Task::decode(std::fs::read(self.marker(1,&format!("tasks.reuse-{amount}"))).unwrap().as_slice()).unwrap()).collect()
    }
    fn reusable_members(&self) {
        self.runtime.block_on(async {
            let mut db = database::database_client::DatabaseClient::connect(self.databases[0].endpoint()).await.unwrap();
            let mut stream = db.recover(database::RecoverRequest { shard_ids: vec!["s000000000".into()], skip_idempotent_mutations: true, ..Default::default() }).await.unwrap().into_inner();
            let mut records = Vec::new(); while let Some(batch) = stream.message().await.unwrap() { records.extend(batch.transaction_coordinators); }
            assert_eq!(records.len(),1);
            let participants = records[0].1.participants.as_ref().unwrap();
            let mut actual = participants.should_commit["tests.reboot.protoc.TransactionCounter"].state_refs.clone(); actual.sort();
            let mut expected = vec![self.refs[0].clone(), self.refs[1].clone()]; expected.sort();
            assert_eq!(actual,expected,"A/B writer union, not B read-only or duplicate");
            assert!(participants.read_only.is_empty());
        });
    }
}
#[test]
#[ignore = "requires real C++ Database/RocksDB"]
fn reusable_participant_generated_commit_restart_and_abort() {
    for (declared, abort) in [(true,false),(false,false),(true,true)] {
        let mut tree = SupervisedTree::with_refs(["reuse-a","reuse-b","reuse-unused"].map(|id| reboot_rust_schema::state_ref::StateRef::from_id("tests.reboot.protoc.TransactionCounter",id).unwrap().to_string()));
        let mut bc = tree.reusable_command(1,declared); bc.arg("--block-task");
        let b = tree.spawn(1,&mut bc);
        let parked = tree.marker(0,"reuse-park");
        let mut ac = tree.reusable_command(0,declared);
        ac.env("REBOOT_TEST_ROOT_AFTER_REMOTE",&parked);
        let preparing = tree.marker(0,"reuse-preparing");
        if !abort { ac.env("REBOOT_TEST_STAR_BEFORE_PREPARE_FANOUT",&preparing); }
        if abort { ac.arg("--tree-handler-error"); ac.env_remove("REBOOT_TEST_ROOT_AFTER_REMOTE"); }
        let a = tree.spawn(0,&mut ac);
        let mut hosts = [a,b];
        if abort {
            tree.rpc(0,"Increment",7,Duration::from_secs(5)).unwrap_err();
            await_marker(&tree.marker(0,"reuse-catch"),&mut hosts[0]);
            let tasks = tree.reusable_tasks();
            let deadline = std::time::Instant::now()+Duration::from_secs(5);
            loop {
                if tree.rpc(1,"Apply",0,Duration::from_millis(100)).is_ok() { break; }
                assert!(std::time::Instant::now()<deadline,"Abort did not release B");
            }
            tree.reusable_states([5,20,40]); assert!(tree.records(1,&tasks).is_empty());
            SupervisedTree::stop_reusable(&mut hosts); tree.restart(); tree.reusable_states([5,20,40]); tree.planner.stop(); continue;
        }
        let endpoint = format!("http://127.0.0.1:{}",tree.ports[0]); let root_ref = tree.refs[0].clone();
        let call = tree.runtime.spawn(async move {
            let mut grpc = tonic::client::Grpc::new(tonic::transport::Endpoint::from_shared(endpoint).unwrap().connect_lazy());
            grpc.ready().await.unwrap();
            let mut request = tonic::Request::new(TaskQueryRequest { amount: 7 });
            request.metadata_mut().insert("x-reboot-state-ref",root_ref.parse().unwrap()); request.set_timeout(Duration::from_secs(15));
            grpc.unary::<_,TaskQueryResponse,_>(request,"/tests.reboot.protoc.TransactionCounterWritesMethods/Increment".parse().unwrap(),tonic::codec::ProstCodec::default()).await
        });
        let deadline = std::time::Instant::now()+Duration::from_secs(6);
        while !parked.exists() {
            if call.is_finished() || std::time::Instant::now() >= deadline {
                panic!("reusable did not park; call={:?}; A={} B={}",tree.runtime.block_on(call),std::fs::read_to_string(tree.marker(0,"stderr")).unwrap(),std::fs::read_to_string(tree.marker(1,"stderr")).unwrap());
            }
            std::thread::sleep(Duration::from_millis(10));
        }
        let tasks = tree.reusable_tasks();
        let entries = std::fs::read_to_string(tree.marker(1,"tasks.reuse-entry")).unwrap();
        let entries: Vec<_> = entries.lines().map(|s| s.split('|').collect::<Vec<_>>()).collect();
        assert_eq!(entries.len(),2); assert_ne!(entries[0][0],entries[1][0]);
        assert_eq!(entries[0][1..],["7","20"]); assert_eq!(entries[1][1..],["11","27"],"N2 must see retained private N1 state");
        tree.reusable_states([5,20,40]); assert!(tree.records(1,&tasks).is_empty());
        assert!(!tree.marker(1,"tasks.invocations").exists());
        assert!(tree.rpc(1,"Apply",0,Duration::from_millis(100)).is_err(),"retained B lease released before Prepare");
        if declared { await_marker(&tree.marker(0,"reuse-catch"),&mut hosts[0]); }
        std::fs::write(parked.with_extension("release"),b"continue").unwrap();
        await_marker(&preparing,&mut hosts[0]); tree.reusable_members();
        std::fs::write(preparing.with_extension("release"),b"fanout").unwrap();
        assert_eq!(tree.runtime.block_on(call).unwrap().unwrap().into_inner().value,12);
        let expected_b = if declared {27} else {38}; tree.reusable_states([12,expected_b,40]);
        let surviving = if declared { &tasks[..1] } else { &tasks[..] };
        await_marker(&tree.marker(1,"tasks"),&mut hosts[1]);
        let records = tree.records(1,&tasks); assert_eq!(records.len(),surviving.len());
        assert!(records.iter().all(|t|t.status == database::task::Status::Pending as i32));
        assert!(tree.records(1,&tasks[1..]).is_empty() == declared,"N2 T2 disposition");
        SupervisedTree::stop_reusable(&mut hosts); tree.restart();
        let mut bc = tree.reusable_command(1,declared); bc.arg("--recover");
        let b = tree.spawn(1,&mut bc);
        let mut ac = tree.reusable_command(0,declared); ac.arg("--recover");
        let a = tree.spawn(0,&mut ac); let mut hosts=[a,b];
        for task in surviving { assert_eq!(tree.wait_task(1,task),i64::from(expected_b)); }
        let completed = tree.records(1,&tasks); assert_eq!(completed.len(),surviving.len());
        assert!(completed.iter().all(|t|t.status == database::task::Status::Completed as i32));
        let log = std::fs::read_to_string(tree.marker(1,"tasks.invocations")).unwrap();
        assert!(log.lines().count() > surviving.len(),"actual blocked pre-completion handler must redeliver");
        SupervisedTree::stop_reusable(&mut hosts); tree.restart();
        let b=tree.spawn(1,&mut tree.reusable_command(1,declared)); let a=tree.spawn(0,&mut tree.reusable_command(0,declared)); let mut hosts=[a,b];
        for task in surviving { assert_eq!(tree.wait_task(1,task),i64::from(expected_b)); }
        std::thread::sleep(Duration::from_millis(250));
        assert_eq!(tree.records(1,&tasks),completed); assert_eq!(std::fs::read_to_string(tree.marker(1,"tasks.invocations")).unwrap(),log,"completed tasks redispatched");
        tree.reusable_states([12,expected_b,40]); SupervisedTree::stop_reusable(&mut hosts); tree.planner.stop();
    }
}

#[test]
#[ignore = "requires real C++ Database/RocksDB"]
fn reusable_registered_root_tasks_commit_and_persist_on_restart() {
    let mut tree = SupervisedTree::with_refs(["root-task-a","root-task-b","root-task-unused"].map(|id| reboot_rust_schema::state_ref::StateRef::from_id("tests.reboot.protoc.TransactionCounter",id).unwrap().to_string()));
    let mut bc=tree.reusable_command(1,false); bc.arg("--block-task");
    let b=tree.spawn(1,&mut bc);
    let mut ac=tree.reusable_command(0,false);
    ac.args(["--tree-local-tasks",tree.marker(0,"tasks").to_str().unwrap(),"--block-task"]);
    let a=tree.spawn(0,&mut ac); let mut hosts=[a,b];
    assert_eq!(tree.rpc(0,"Increment",7,Duration::from_secs(15)).unwrap(),12);
    tree.reusable_states([12,38,40]);
    let root_tasks=tree.scheduled_records(0);
    assert_eq!(root_tasks.len(),4);
    for task in &root_tasks { assert_eq!(task.task_id.as_ref().unwrap().state_ref,tree.refs[0]); }
    await_marker(&tree.marker(0,"tasks"),&mut hosts[0]);
    let root_records=tree.records(0,&root_tasks);
    assert_eq!(root_records.len(),4);
    assert!(root_records.iter().all(|task| task.status==database::task::Status::Pending as i32));
    let leaf_tasks=tree.reusable_tasks();
    assert_eq!(tree.records(1,&leaf_tasks).len(),2);
    SupervisedTree::stop_reusable(&mut hosts); tree.restart();
    tree.reusable_states([12,38,40]);
    assert_eq!(tree.records(0,&root_tasks),root_records,"registered reusable ROOT task batch must survive actual sidecar restart");
    assert_eq!(tree.records(1,&leaf_tasks).len(),2);
    tree.planner.stop();
}

