//! Owned subprocess crash-window proof. No synthetic task/checkpoint writes.
use super::*;
use generated::HelloMethodsDatabaseHandler;
use reboot::runtime::WriterExecution;
use std::{
    io::Write,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

// Read-only mirror of the SDK's persisted ordinary scheduling envelope
// (workflow_store.rs defines the private wire struct shared by both paths).
#[derive(prost::Message)]
struct OrdinaryCheckpoint {
    #[prost(bytes = "vec", tag = "1")]
    response: Vec<u8>,
    #[prost(message, repeated, tag = "2")]
    tasks: Vec<db::Task>,
    #[prost(string, tag = "3")]
    response_type: String,
    #[prost(uint32, tag = "4")]
    version: u32,
}
pub(super) struct ObservedHelloTasks;
fn observe(method: &str) {
    if let Some(path) = std::env::var_os("HELLO_TASKS_INVOCATIONS") {
        let mut log = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(path)
            .unwrap();
        writeln!(log, "{method} {}", now()).unwrap();
        log.sync_all().unwrap();
    }
}
#[tonic::async_trait]
impl HelloMethodsDatabaseHandler for ObservedHelloTasks {
    fn warning_local_precheck(
        &self,
        state: &proto::Hello,
        req: &proto::WarningRequest,
    ) -> Result<(), reboot::one_shot_tasks::LocalStateNotReady> {
        HelloTasks.warning_local_precheck(state, req)
    }
    fn erase_local_precheck(
        &self,
        state: &proto::Hello,
        req: &proto::EraseRequest,
    ) -> Result<(), reboot::one_shot_tasks::LocalStateNotReady> {
        HelloTasks.erase_local_precheck(state, req)
    }
    async fn messages(
        &self,
        state: &proto::Hello,
        req: proto::MessagesRequest,
    ) -> Result<proto::MessagesResponse, tonic::Status> {
        HelloTasks.messages(state, req).await
    }
    async fn send(
        &self,
        state: &mut proto::Hello,
        req: proto::SendRequest,
    ) -> Result<proto::SendResponse, tonic::Status> {
        HelloTasks.send(state, req).await
    }
    async fn warning(
        &self,
        state: &mut proto::Hello,
        req: proto::WarningRequest,
    ) -> Result<proto::WarningResponse, tonic::Status> {
        observe("Warning");
        HelloTasks.warning(state, req).await
    }
    async fn send_with_tasks(
        &self,
        state: &mut proto::Hello,
        req: proto::SendRequest,
        reference: String,
    ) -> Result<WriterExecution<proto::SendResponse>, tonic::Status> {
        observe("Send");
        HelloTasks.send_with_tasks(state, req, reference).await
    }
    async fn warning_with_tasks(
        &self,
        state: &mut proto::Hello,
        req: proto::WarningRequest,
        reference: String,
    ) -> Result<WriterExecution<proto::WarningResponse>, tonic::Status> {
        observe("Warning");
        HelloTasks.warning_with_tasks(state, req, reference).await
    }
    async fn erase(
        &self,
        state: &mut proto::Hello,
        req: proto::EraseRequest,
    ) -> Result<proto::EraseResponse, tonic::Status> {
        observe("Erase");
        HelloTasks.erase(state, req).await
    }
}
fn now() -> i128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_nanos() as i128
}
fn timestamp(t: &prost_types::Timestamp) -> i128 {
    i128::from(t.seconds) * 1_000_000_000 + i128::from(t.nanos)
}
fn scheduled_between(task: &db::Task, before: i128, after: i128, seconds: i128) {
    let t = task.timestamp.as_ref().unwrap();
    assert!((0..1_000_000_000).contains(&t.nanos));
    assert!(
        (before + seconds * 1_000_000_000..=after + seconds * 1_000_000_000)
            .contains(&timestamp(t)),
        "exact {seconds}s schedule: {t:?}, window={before}..{after}"
    );
}
async fn marker(path: &Path) {
    tokio::time::timeout(Duration::from_secs(15), async {
        while !path.exists() {
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
    })
    .await
    .unwrap_or_else(|_| panic!("missing marker {}", path.display()));
}

// A separate test-harness process isolates test-support environment variables.
// It serves the real ApplicationHost and is owned/reaped by ProcessHost.
#[tokio::test]
#[ignore = "subprocess worker; launched only by the recovery acceptance"]
async fn native_recovery_host_worker() {
    let Ok(directory) = std::env::var("HELLO_TASKS_HOST_DIRECTORY") else {
        return;
    };
    let directory = PathBuf::from(directory);
    let host = Host::start(
        &std::env::var("HELLO_TASKS_DATABASE").unwrap(),
        &std::env::var("HELLO_TASKS_REFERENCE").unwrap(),
    )
    .await;
    std::fs::write(directory.join("endpoint"), &host.endpoint).unwrap();
    tokio::time::timeout(Duration::from_secs(60), async {
        while !directory.join("shutdown").exists() {
            assert!(!host.task.is_finished(), "supervised host failed");
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
    })
    .await
    .unwrap();
    host.finish().await;
    std::fs::write(
        directory.join("stopped"),
        b"successful bounded ApplicationHost shutdown",
    )
    .unwrap();
}
struct ProcessHost {
    child: Child,
    directory: PathBuf,
    endpoint: String,
}
impl ProcessHost {
    async fn start(
        native: &Native,
        reference: &str,
        name: &str,
        hook: Option<(&str, &Path)>,
    ) -> Self {
        let directory = native.directory.join(name);
        std::fs::create_dir_all(&directory).unwrap();
        let log = std::fs::File::create(directory.join("host.log")).unwrap();
        let mut command = Command::new(std::env::current_exe().unwrap());
        command
            .args([
                "--exact",
                "recovery::native_recovery_host_worker",
                "--ignored",
                "--nocapture",
            ])
            .env("HELLO_TASKS_HOST_DIRECTORY", &directory)
            .env("HELLO_TASKS_DATABASE", &native.endpoint)
            .env("HELLO_TASKS_REFERENCE", reference)
            .env(
                "HELLO_TASKS_INVOCATIONS",
                native.directory.join("invocations.log"),
            )
            .env_remove("REBOOT_TEST_WRITER_AFTER_STORE")
            .env_remove("REBOOT_TEST_TASK_DEFER_METHOD")
            .env_remove("REBOOT_TEST_TASK_DEFER_MARKER")
            .stdout(Stdio::from(log.try_clone().unwrap()))
            .stderr(Stdio::from(log));
        if let Some((kind, path)) = hook {
            if kind == "store" {
                command.env("REBOOT_TEST_WRITER_AFTER_STORE", path);
            } else {
                command
                    .env("REBOOT_TEST_TASK_DEFER_METHOD", "Warning")
                    .env("REBOOT_TEST_TASK_DEFER_MARKER", path);
            }
        }
        let child = command.spawn().unwrap();
        let mut host = Self {
            child,
            directory,
            endpoint: String::new(),
        };
        marker(&host.directory.join("endpoint")).await;
        host.endpoint = std::fs::read_to_string(host.directory.join("endpoint")).unwrap();
        eprintln!(
            "owned host started pid={} directory={}",
            host.child.id(),
            host.directory.display()
        );
        host
    }
    fn crash(mut self) {
        self.child.kill().unwrap();
        let status = self.child.wait().unwrap();
        self.evidence(status, "crash");
    }
    async fn finish(mut self) {
        std::fs::write(self.directory.join("shutdown"), b"shutdown").unwrap();
        let status = tokio::time::timeout(Duration::from_secs(10), async {
            loop {
                if let Some(status) = self.child.try_wait().unwrap() {
                    break status;
                }
                tokio::time::sleep(Duration::from_millis(10)).await;
            }
        })
        .await
        .unwrap();
        assert!(
            status.success(),
            "host log: {}",
            std::fs::read_to_string(self.directory.join("host.log")).unwrap()
        );
        assert!(self.directory.join("stopped").exists());
        self.evidence(status, "graceful");
    }
    fn evidence(&self, status: std::process::ExitStatus, mode: &str) {
        assert!(
            !PathBuf::from(format!("/proc/{}", self.child.id())).exists(),
            "owned host still live"
        );
        std::fs::write(
            self.directory.join("cleanup"),
            format!(
                "pid={} mode={mode} status={status} reaped=true proc_absent=true\n",
                self.child.id()
            ),
        )
        .unwrap();
        eprintln!("owned host reaped pid={} mode={mode}", self.child.id());
    }
}
impl Drop for ProcessHost {
    fn drop(&mut self) {
        // Exact owned child only; covers every assertion/startup failure.
        let _ = self.child.kill();
        if let Ok(status) = self.child.wait()
            && !self.directory.join("cleanup").exists()
        {
            self.evidence(status, "drop");
        }
    }
}
async fn checkpoint(
    native: &Native,
    reference: &str,
    warning: &db::TaskId,
) -> db::IdempotentMutation {
    let key =
        reboot::runtime::writer_task_key(warning, "hello_tasks.v1.HelloMethods.Warning").unwrap();
    let mut client = db::database_client::DatabaseClient::connect(native.endpoint.clone())
        .await
        .unwrap();
    let mut stream = client
        .recover_idempotent_mutations(db::RecoverIdempotentMutationsRequest {
            state_type: STATE.into(),
            state_ref: reference.into(),
            idempotency_key: Some(key.as_bytes().to_vec()),
            ..Default::default()
        })
        .await
        .unwrap()
        .into_inner();
    let mut found = Vec::new();
    while let Some(batch) = stream.message().await.unwrap() {
        found.extend(batch.idempotent_mutations);
    }
    assert_eq!(found.len(), 1, "exact Warning response checkpoint");
    found.remove(0)
}
async fn pending(native: &Native) -> Vec<db::Task> {
    let mut client = db::database_client::DatabaseClient::connect(native.endpoint.clone())
        .await
        .unwrap();
    let mut stream = client
        .recover(db::RecoverRequest {
            state_tags_by_state_type: [(STATE.into(), "Hello".into())].into(),
            shard_ids: vec!["s000000000".into()],
            skip_idempotent_mutations: true,
        })
        .await
        .unwrap()
        .into_inner();
    let mut found = Vec::new();
    while let Some(batch) = stream.message().await.unwrap() {
        found.extend(batch.pending_tasks);
    }
    found.sort_by_key(|task| task.task_id.as_ref().unwrap().task_uuid.clone());
    found
}
fn invocations(native: &Native, method: &str) -> Vec<i128> {
    std::fs::read_to_string(native.directory.join("invocations.log"))
        .unwrap()
        .lines()
        .filter_map(|line| {
            line.strip_prefix(&format!("{method} "))
                .map(|time| time.parse().unwrap())
        })
        .collect()
}
async fn wait_warning(
    host: &ProcessHost,
    reference: &str,
    id: db::TaskId,
) -> proto::WarningResponse {
    let channel = tonic::transport::Endpoint::from_shared(host.endpoint.clone())
        .unwrap()
        .connect()
        .await
        .unwrap();
    tokio::time::timeout(
        Duration::from_secs(15),
        generated::HelloMethodsTasksWait::warning(channel, request(reference, id, None)),
    )
    .await
    .unwrap()
    .unwrap()
}
async fn wait_erase(host: &ProcessHost, reference: &str, id: db::TaskId) {
    let channel = tonic::transport::Endpoint::from_shared(host.endpoint.clone())
        .unwrap()
        .connect()
        .await
        .unwrap();
    tokio::time::timeout(
        Duration::from_secs(15),
        generated::HelloMethodsTasksWait::erase(channel, request(reference, id, None)),
    )
    .await
    .unwrap()
    .unwrap();
}
async fn completed_warning_unchanged(
    native: &Native,
    original: &db::Task,
    warned: &proto::WarningResponse,
) -> db::Task {
    let completed = load(&native.endpoint, original.task_id.clone().unwrap()).await;
    let mut expected = original.clone();
    expected.status = db::task::Status::Completed as i32;
    expected.response_or_error = Some(db::task::ResponseOrError::Response(prost_types::Any {
        type_url: "type.googleapis.com/hello_tasks.v1.WarningResponse".into(),
        value: warned.encode_to_vec(),
    }));
    assert_eq!(
        completed, expected,
        "admitted recovered parent completion must use saved response, preserving identity/schedule/request"
    );
    completed
}

#[tokio::test]
#[ignore = "requires real C++ Database/RocksDB and native-test-support"]
async fn pinned_recovered_admitted_warning_post_store_pending_and_completed_successors() {
    // Separate genuine crash windows: no task status resets, fabricated responses,
    // unary Warning replay, workflow schema, or transaction substitute.
    for completed_successor in [false, true] {
        let base = std::env::var_os("HELLO_TASKS_EVIDENCE_ROOT")
            .map(PathBuf::from)
            .unwrap_or_else(std::env::temp_dir);
        let directory = base.join(format!(
            "hello-recovery-{}-{}",
            completed_successor,
            uuid::Uuid::new_v4()
        ));
        let mut native = Native::start(directory).await;
        let reference = reboot::state_ref::StateRef::from_id(STATE, "hello-recovery")
            .unwrap()
            .to_string();
        let stored = native.directory.join("warning-stored");
        let host = ProcessHost::start(
            &native,
            &reference,
            "crash-window",
            Some(("store", &stored)),
        )
        .await;
        let mut client =
            proto::hello_methods_client::HelloMethodsClient::connect(host.endpoint.clone())
                .await
                .unwrap();
        let before_send = now();
        let sent = client
            .send(request(
                &reference,
                proto::SendRequest {
                    message: "recover me".into(),
                },
                Some(uuid::Uuid::new_v4()),
            ))
            .await
            .unwrap()
            .into_inner();
        let after_send = now();
        let warning_id = database_id(sent.task_id.as_ref().unwrap());
        let original_warning = load(&native.endpoint, warning_id.clone()).await;
        scheduled_between(&original_warning, before_send, after_send, 7);
        assert!(
            now() < timestamp(original_warning.timestamp.as_ref().unwrap()),
            "observation before Warning deadline"
        );
        assert_eq!(original_warning.status, db::task::Status::Pending as i32);
        assert_eq!(invocations(&native, "Warning").len(), 0);
        assert_eq!(
            state(&native.endpoint, &reference).await.messages[0].text,
            "recover me"
        );
        marker(&stored).await;
        let after_store = now();
        let mutation = checkpoint(&native, &reference, &warning_id).await;
        let envelope = OrdinaryCheckpoint::decode(mutation.response.as_slice()).unwrap();
        assert_eq!(envelope.version, 1);
        assert_eq!(
            envelope.response_type,
            "type.googleapis.com/hello_tasks.v1.WarningResponse"
        );
        let warned = proto::WarningResponse::decode(envelope.response.as_slice()).unwrap();
        let erase_id = database_id(warned.task_id.as_ref().unwrap());
        assert_eq!(mutation.task_ids, vec![erase_id.clone()]);
        let original_erase = load(&native.endpoint, erase_id.clone()).await;
        assert_eq!(envelope.tasks, vec![original_erase.clone()]);
        let warning_entries = invocations(&native, "Warning");
        assert_eq!(warning_entries.len(), 1);
        assert!(
            warning_entries[0] >= timestamp(original_warning.timestamp.as_ref().unwrap()),
            "no early Warning delivery (nanos)"
        );
        scheduled_between(&original_erase, warning_entries[0], after_store, 3);
        assert!(
            now() < timestamp(original_erase.timestamp.as_ref().unwrap()),
            "observation before Erase deadline"
        );
        let warned_state = state(&native.endpoint, &reference).await;
        assert_eq!(warned_state.messages.len(), 1);
        assert_eq!(
            warned_state.messages[0].text,
            "recover me (Disappearing soon!)"
        );
        assert_eq!(
            pending(&native).await.len(),
            2,
            "only Pending Warning and its Erase"
        );
        std::fs::write(
            native.directory.join("persisted-warning-pending.pb"),
            original_warning.encode_to_vec(),
        )
        .unwrap();
        std::fs::write(
            native.directory.join("persisted-erase-pending.pb"),
            original_erase.encode_to_vec(),
        )
        .unwrap();
        std::fs::write(
            native.directory.join("persisted-warning-checkpoint.pb"),
            mutation.encode_to_vec(),
        )
        .unwrap();
        std::fs::write(
            native.directory.join("persisted-warned-state.pb"),
            warned_state.encode_to_vec(),
        )
        .unwrap();
        host.crash();
        assert_eq!(
            load(&native.endpoint, warning_id.clone()).await,
            original_warning,
            "Warning Pending at shutdown after real Store ACK"
        );
        assert_eq!(
            load(&native.endpoint, erase_id.clone()).await,
            original_erase,
            "Erase Pending at shutdown"
        );
        native.restart().await;
        assert_eq!(
            checkpoint(&native, &reference, &warning_id).await,
            mutation,
            "RocksDB checkpoint survival"
        );
        assert_eq!(
            load(&native.endpoint, warning_id.clone()).await,
            original_warning
        );
        assert_eq!(
            load(&native.endpoint, erase_id.clone()).await,
            original_erase
        );
        assert_eq!(state(&native.endpoint, &reference).await, warned_state);

        let mut later_warning = None;
        let expected_state;
        let expected_erase;
        if completed_successor {
            // Hold only Warning dispatch before actor admission. The real SDK
            // dispatches/admits Erase normally and uses real completion CAS.
            let deferred = native.directory.join("warning-deferred");
            let host = ProcessHost::start(
                &native,
                &reference,
                "complete-successor",
                Some(("defer", &deferred)),
            )
            .await;
            marker(&deferred).await;
            wait_erase(&host, &reference, erase_id.clone()).await;
            assert_eq!(
                load(&native.endpoint, warning_id.clone()).await,
                original_warning
            );
            expected_erase = load(&native.endpoint, erase_id.clone()).await;
            assert_eq!(expected_erase.status, db::task::Status::Completed as i32);
            assert!(
                state(&native.endpoint, &reference)
                    .await
                    .messages
                    .is_empty()
            );
            let mut client =
                proto::hello_methods_client::HelloMethodsClient::connect(host.endpoint.clone())
                    .await
                    .unwrap();
            let changed = client
                .send(request(
                    &reference,
                    proto::SendRequest {
                        message: "later actor change".into(),
                    },
                    Some(uuid::Uuid::new_v4()),
                ))
                .await
                .unwrap()
                .into_inner();
            later_warning = Some(database_id(changed.task_id.as_ref().unwrap()));
            expected_state = state(&native.endpoint, &reference).await;
            assert_eq!(expected_state.num_erased_messages, 1);
            assert_eq!(expected_state.messages[0].text, "later actor change");
            host.finish().await;
            assert_eq!(
                load(&native.endpoint, warning_id.clone()).await,
                original_warning,
                "parent remains Pending after successor Completed and later Send"
            );
            assert_eq!(
                load(&native.endpoint, erase_id.clone()).await,
                expected_erase
            );
            native.restart().await;
        } else {
            expected_state = warned_state;
            expected_erase = original_erase.clone();
        }
        let host = ProcessHost::start(&native, &reference, "admitted-recovery", None).await;
        let replayed = wait_warning(&host, &reference, warning_id.clone()).await;
        assert_eq!(
            replayed, warned,
            "actual recovered admitted Warning, NOT unary replay"
        );
        let completed_parent =
            completed_warning_unchanged(&native, &original_warning, &warned).await;
        std::fs::write(
            native.directory.join("recovered-warning-completed.pb"),
            completed_parent.encode_to_vec(),
        )
        .unwrap();
        std::fs::write(
            native.directory.join("recovery-successor.pb"),
            expected_erase.encode_to_vec(),
        )
        .unwrap();
        assert_eq!(checkpoint(&native, &reference, &warning_id).await, mutation);
        assert_eq!(
            invocations(&native, "Warning").len(),
            1,
            "checkpoint recovery must not reinvoke handler"
        );
        assert_eq!(
            state(&native.endpoint, &reference).await,
            expected_state,
            "no duplicate suffix or remutation after actor change"
        );
        assert_eq!(
            load(&native.endpoint, erase_id.clone()).await,
            expected_erase,
            "no successor upsert or Completed resurrection"
        );
        let found = pending(&native).await;
        let expected_ids = if let Some(id) = &later_warning {
            vec![id.clone()]
        } else {
            vec![erase_id.clone()]
        };
        assert_eq!(
            found
                .iter()
                .map(|task| task.task_id.clone().unwrap())
                .collect::<Vec<_>>(),
            expected_ids,
            "no duplicate successor/task"
        );
        host.finish().await;
        if !completed_successor {
            assert_eq!(
                load(&native.endpoint, erase_id.clone()).await,
                original_erase,
                "Erase still Pending at recovery-host shutdown"
            );
        }
        native.restart().await;
        let host = ProcessHost::start(&native, &reference, "completed-restart", None).await;
        assert_eq!(
            wait_warning(&host, &reference, warning_id.clone()).await,
            warned
        );
        assert_eq!(
            load(&native.endpoint, warning_id.clone()).await,
            completed_parent
        );
        if !completed_successor {
            wait_erase(&host, &reference, erase_id.clone()).await;
            let erased = state(&native.endpoint, &reference).await;
            assert!(erased.messages.is_empty());
            assert_eq!(erased.num_erased_messages, 1);
        } else {
            assert_eq!(state(&native.endpoint, &reference).await, expected_state);
            assert_eq!(
                load(&native.endpoint, erase_id.clone()).await,
                expected_erase
            );
        }
        let erase_entries = invocations(&native, "Erase");
        assert_eq!(
            erase_entries.len(),
            1,
            "no successor redispatch after Completed restart"
        );
        assert!(
            erase_entries[0] >= timestamp(original_erase.timestamp.as_ref().unwrap()),
            "no early Erase delivery (nanos)"
        );
        assert_eq!(invocations(&native, "Warning").len(), 1);
        host.finish().await;
        assert_eq!(checkpoint(&native, &reference, &warning_id).await, mutation);
        let evidence = format!(
            "completed_successor={completed_successor}\nwarning_invocations=1\nerase_invocations=1\ncheckpoint_unchanged=true\nactual_admitted_recovery=true\nno_duplicate_tasks=true\n"
        );
        std::fs::write(native.directory.join("accepted"), evidence).unwrap();
        eprintln!("RECOVERED_WARNING_ACCEPTED {}", native.directory.display());
        drop(native);
    }
}
