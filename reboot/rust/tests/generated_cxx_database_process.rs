#[path = "fixtures/task_recovery_rejection.rs"]
mod task_recovery_rejection;
#[path = "fixtures/task_vertical_acceptance.rs"]
mod task_vertical_acceptance;

// Own only the fixture child; dropping the guard after an assertion failure
// must not leave a serving host behind. Real sidecars keep their own guards.
struct WaitHostGuard(Child);
impl std::ops::Deref for WaitHostGuard {
    type Target = Child;
    fn deref(&self) -> &Child {
        &self.0
    }
}
impl std::ops::DerefMut for WaitHostGuard {
    fn deref_mut(&mut self) -> &mut Child {
        &mut self.0
    }
}
impl Drop for WaitHostGuard {
    fn drop(&mut self) {
        let _ = self.0.kill();
        let _ = self.0.wait();
    }
}

use std::{
    net::{SocketAddr, TcpListener},
    pin::Pin,
    process::{Child, Command, Stdio},
    sync::{
        Arc, Mutex,
        atomic::{AtomicUsize, Ordering},
    },
    time::Duration,
};

use base64::{Engine as _, engine::general_purpose::URL_SAFE_NO_PAD};
use prost::Message;
use reboot_rust_schema::{database_proto as database, placement_proto};
use sha1::{Digest as _, Sha1};
use uuid::Uuid;

fn generated_host_binary(fixture: &std::path::Path) -> std::path::PathBuf {
    let target = std::env::var_os("CARGO_TARGET_DIR")
        .map(std::path::PathBuf::from)
        .unwrap_or_else(|| fixture.join("target"));
    // A relative Cargo target is resolved from the fixture's build directory.
    let target = if target.is_absolute() {
        target
    } else {
        fixture.join(target)
    };
    target.join("debug/generated-cxx-database-process-host")
}

type PlacementPlanResult = Result<placement_proto::ListenForPlanResponse, tonic::Status>;
type PlannerStreams = Arc<Mutex<Vec<tokio::sync::mpsc::Sender<PlacementPlanResult>>>>;

#[derive(Clone)]
struct LivePlacementPlanner {
    response: placement_proto::ListenForPlanResponse,
    connections: Arc<AtomicUsize>,
    streams: PlannerStreams,
}

#[tonic::async_trait]
impl placement_proto::placement_planner_server::PlacementPlanner for LivePlacementPlanner {
    type ListenForPlanStream = Pin<
        Box<
            dyn tokio_stream::Stream<
                    Item = Result<placement_proto::ListenForPlanResponse, tonic::Status>,
                > + Send
                + 'static,
        >,
    >;

    async fn listen_for_plan(
        &self,
        _: tonic::Request<placement_proto::ListenForPlanRequest>,
    ) -> Result<tonic::Response<Self::ListenForPlanStream>, tonic::Status> {
        self.connections.fetch_add(1, Ordering::SeqCst);
        let (sender, receiver) = tokio::sync::mpsc::channel(1);
        sender
            .send(Ok(self.response.clone()))
            .await
            .expect("fresh planner stream receiver must be open");
        self.streams.lock().unwrap().push(sender);
        Ok(tonic::Response::new(Box::pin(
            tokio_stream::wrappers::ReceiverStream::new(receiver),
        )))
    }
}

struct LivePlannerServer {
    endpoint: String,
    streams: PlannerStreams,
    connections: Arc<AtomicUsize>,
    server: tokio::task::JoinHandle<Result<(), tonic::transport::Error>>,
}

impl LivePlannerServer {
    fn start(
        runtime: &tokio::runtime::Runtime,
        response: placement_proto::ListenForPlanResponse,
    ) -> Self {
        runtime.block_on(Self::start_async(response))
    }
    async fn start_async(response: placement_proto::ListenForPlanResponse) -> Self {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let connections = Arc::new(AtomicUsize::new(0));
        let streams = Arc::new(Mutex::new(Vec::new()));
        let planner = LivePlacementPlanner {
            response,
            connections: Arc::clone(&connections),
            streams: Arc::clone(&streams),
        };
        let server = tokio::spawn(async move {
            tonic::transport::Server::builder()
                .add_service(
                    placement_proto::placement_planner_server::PlacementPlannerServer::new(planner),
                )
                .serve_with_incoming(tokio_stream::wrappers::TcpListenerStream::new(listener))
                .await
        });
        Self {
            endpoint: format!("http://{address}"),
            streams,
            connections,
            server,
        }
    }

    fn wait_for_connections(&self, expected: usize) {
        for _ in 0..100 {
            if self.connections.load(Ordering::SeqCst) >= expected {
                return;
            }
            std::thread::sleep(Duration::from_millis(25));
        }
        panic!("live PlacementPlanner did not receive {expected} host streams");
    }

    async fn publish(&self, plan: placement_proto::ListenForPlanResponse) {
        let streams = self.streams.lock().unwrap().clone();
        assert!(!streams.is_empty(), "no connected planner consumers");
        let mut delivered = 0;
        for sender in streams {
            if tokio::time::timeout(Duration::from_secs(2), sender.send(Ok(plan.clone())))
                .await
                .expect("planner consumer stopped receiving")
                .is_ok()
            {
                delivered += 1;
            }
        }
        assert!(
            delivered > 0,
            "no live planner consumers received the update"
        );
    }

    fn stop(self) {
        self.server.abort();
    }
}

struct CxxDatabase {
    state: tempfile::TempDir,
    port: u16,
    child: Child,
    binary: String,
}
impl CxxDatabase {
    fn start(binary: String) -> Self {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        drop(listener);
        let state = tempfile::tempdir().unwrap();
        let info = database::ServerInfo {
            shard_infos: vec![database::ShardInfo {
                shard_id: "s000000000".into(),
                shard_first_key: vec![],
            }],
        };
        std::fs::write(state.path().join("server-info.pb"), info.encode_to_vec()).unwrap();
        let child = Self::spawn(&binary, state.path(), port);
        let db = Self {
            state,
            port,
            child,
            binary,
        };
        db.wait();
        db
    }
    fn spawn(binary: &str, state: &std::path::Path, port: u16) -> Child {
        Command::new(binary)
            .arg(state.join("rocksdb"))
            .arg(state.join("server-info.pb"))
            .arg(port.to_string())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .unwrap()
    }
    fn endpoint(&self) -> String {
        format!("http://127.0.0.1:{}", self.port)
    }
    fn wait(&self) {
        for _ in 0..100 {
            if std::net::TcpStream::connect(("127.0.0.1", self.port)).is_ok() {
                return;
            }
            std::thread::sleep(Duration::from_millis(25));
        }
        panic!("C++ Database did not listen");
    }
    fn restart(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
        self.child = Self::spawn(&self.binary, self.state.path(), self.port);
        self.wait();
    }
}
impl Drop for CxxDatabase {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}
fn port() -> u16 {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let port = listener.local_addr().unwrap().port();
    drop(listener);
    port
}

fn legacy_routing_component(state_ref: &str) -> &str {
    state_ref
        .split('/')
        .next()
        .filter(|component| !component.is_empty())
        .expect("legacy placement route needs a non-empty first state-reference component")
}

fn legacy_plan_for(routes: &[(&str, u16)]) -> String {
    assert!(!routes.is_empty(), "legacy placement plan needs a route");
    let mut routes = routes.to_vec();
    routes.sort_by_key(|(state_ref, _)| {
        Sha1::digest(legacy_routing_component(state_ref).as_bytes()).to_vec()
    });
    let servers = routes
        .iter()
        .enumerate()
        .map(|(index, (_, port))| placement_proto::Server {
            id: format!("server-{index}"),
            application_id: "generated-cxx-database-process".into(),
            revision_number: 0,
            address: Some(placement_proto::server::Address {
                host: "127.0.0.1".into(),
                port: i32::from(*port),
            }),
            namespace: String::new(),
            file_descriptor_set: None,
            reboot_version: String::new(),
        })
        .collect();
    let shards = routes
        .iter()
        .enumerate()
        .map(
            |(index, (state_ref, _))| placement_proto::plan::application::Shard {
                id: format!("hash-{index}"),
                range: Some(placement_proto::plan::application::shard::KeyRange {
                    first_key: if index == 0 {
                        vec![]
                    } else {
                        Sha1::digest(legacy_routing_component(state_ref).as_bytes()).to_vec()
                    },
                }),
                server_id: format!("server-{index}"),
                replica_index: 0,
            },
        )
        .collect();
    URL_SAFE_NO_PAD.encode(
        placement_proto::ListenForPlanResponse {
            plan: Some(placement_proto::Plan {
                version: 1,
                applications: vec![placement_proto::plan::Application {
                    id: "generated-cxx-database-process".into(),
                    services: vec![
                        placement_proto::plan::application::Service {
                            full_name: "tests.reboot.protoc.TransactionCounterWritesMethods".into(),
                            state_type_full_name: "tests.reboot.protoc.TransactionCounter".into(),
                        },
                        placement_proto::plan::application::Service {
                            full_name: "rbt.v1alpha1.Tasks".into(),
                            state_type_full_name: "tests.reboot.protoc.TransactionCounter".into(),
                        },
                    ],
                    shards,
                }],
            }),
            servers,
        }
        .encode_to_vec(),
    )
}

#[test]
fn legacy_fixture_plan_hashes_only_the_first_opaque_state_ref_component() {
    let encoded = legacy_plan_for(&[("actor/child", 3001), ("zebra", 3002)]);
    let response = placement_proto::ListenForPlanResponse::decode(
        URL_SAFE_NO_PAD.decode(encoded).unwrap().as_slice(),
    )
    .unwrap();
    let shards = &response.plan.unwrap().applications[0].shards;
    let expected = ["actor", "zebra"]
        .into_iter()
        .map(|component| Sha1::digest(component.as_bytes()).to_vec())
        .max()
        .unwrap();
    assert_eq!(
        shards[0].range.as_ref().unwrap().first_key,
        Vec::<u8>::new()
    );
    assert_eq!(shards[1].range.as_ref().unwrap().first_key, expected);
}

fn legacy_plan(root: u16, target: u16) -> String {
    legacy_plan_for(&[("root", root), ("target", target)])
}

fn endpoint_port(endpoint: &str) -> u16 {
    endpoint
        .strip_prefix("http://")
        .expect("fixture target endpoint must use http")
        .parse::<SocketAddr>()
        .expect("fixture target endpoint must be a socket address")
        .port()
}

struct HostOptions<'a> {
    binary: &'a std::path::Path,
    role: &'a str,
    port: u16,
    database: &'a str,
    plan: &'a str,
    root_id: &'a str,
    recover: bool,
    invoke: bool,
    marker: Option<&'a std::path::Path>,
    watch_terminalized: Option<&'a std::path::Path>,
    state_ref: Option<&'a str>,
    coordinator_state_ref: Option<&'a str>,
    watch_coordinator_state_ref: Option<&'a str>,
}

fn spawn_host(options: HostOptions<'_>) -> Child {
    let mut command = Command::new(options.binary);
    command
        .args([
            "--role",
            options.role,
            "--listen",
            &format!("127.0.0.1:{}", options.port),
            "--database",
            options.database,
            "--legacy-placement-plan",
            options.plan,
            "--root-id",
            options.root_id,
        ])
        .stdout(Stdio::inherit())
        .stderr(Stdio::inherit());
    if options.recover {
        command.arg("--recover");
    }
    if options.invoke {
        command.arg("--invoke");
    }
    if let Some(state_ref) = options.state_ref {
        command.args(["--state-ref", state_ref]);
    }
    if let Some(coordinator_state_ref) = options.coordinator_state_ref {
        command.args(["--coordinator-state-ref", coordinator_state_ref]);
    }
    if let Some(coordinator_state_ref) = options.watch_coordinator_state_ref {
        command.args(["--watch-coordinator-state-ref", coordinator_state_ref]);
    }
    if let Some(marker) = options.marker {
        command.env("REBOOT_TEST_PAUSE_AFTER_COORDINATOR_PREPARE", marker);
    }
    if let Some(marker) = options.watch_terminalized {
        command.env("REBOOT_TEST_TARGET_WATCH_TERMINALIZED", marker);
    }
    command.spawn().unwrap()
}

/// Launch configuration for the one acceptance that exercises the host-owned
/// canonical PlacementPlanner stream instead of the fixture's static plan.
struct LiveHostOptions<'a> {
    binary: &'a std::path::Path,
    role: &'a str,
    port: u16,
    database: &'a str,
    planner: &'a str,
    root_id: &'a str,
    recover: bool,
    invoke: bool,
    factory_invoke: bool,
    factory_target_invoke: bool,
    expect_factory_declared_error: bool,
    marker: Option<&'a std::path::Path>,
    watch_terminalized: Option<&'a std::path::Path>,
    state_ref: Option<&'a str>,
    coordinator_state_ref: Option<&'a str>,
    watch_coordinator_state_ref: Option<&'a str>,
}

fn spawn_live_host(options: LiveHostOptions<'_>) -> Child {
    let mut command = Command::new(options.binary);
    command
        .args([
            "--role",
            options.role,
            "--listen",
            &format!("127.0.0.1:{}", options.port),
            "--database",
            options.database,
            "--placement-planner",
            options.planner,
            "--root-id",
            options.root_id,
        ])
        .stdout(Stdio::inherit())
        .stderr(Stdio::inherit());
    if options.recover {
        command.arg("--recover");
    }
    if options.invoke {
        command.arg("--invoke");
    }
    if options.factory_invoke {
        // Factory-process acceptance is one-shot: after either a declared error
        // or a successful replay, terminate so the parent can inspect RocksDB.
        command.args([
            "--factory-invoke",
            "--exit-after-invoke",
            "--idempotency-key",
            "00000000-0000-4000-8000-00000000010a",
        ]);
    }
    if options.factory_target_invoke {
        command.args(["--factory-target-invoke", "--amount", "7"]);
    }
    if options.expect_factory_declared_error {
        command.args(["--expect-declared-factory-error", "--amount", "13"]);
    }
    if let Some(state_ref) = options.state_ref {
        command.args(["--state-ref", state_ref]);
    }
    if let Some(coordinator_state_ref) = options.coordinator_state_ref {
        command.args(["--coordinator-state-ref", coordinator_state_ref]);
    }
    if let Some(coordinator_state_ref) = options.watch_coordinator_state_ref {
        command.args(["--watch-coordinator-state-ref", coordinator_state_ref]);
    }
    if let Some(marker) = options.marker {
        command.env("REBOOT_TEST_PAUSE_AFTER_COORDINATOR_PREPARE", marker);
    }
    if let Some(marker) = options.watch_terminalized {
        command.env("REBOOT_TEST_TARGET_WATCH_TERMINALIZED", marker);
    }
    command.spawn().unwrap()
}

macro_rules! spawn_with_plan {
    ($binary:expr, $role:expr, $port:expr, $database:expr, $root:expr, $target:expr, $plan:expr, $root_id:expr, $recover:expr, $invoke:expr, $marker:expr, $watch:expr, $state_ref:expr, $coordinator_state_ref:expr $(,)?) => {
        spawn_host(HostOptions {
            binary: $binary,
            role: $role,
            port: $port,
            database: $database,
            plan: $plan,
            root_id: $root_id,
            recover: $recover,
            invoke: $invoke,
            marker: $marker,
            watch_terminalized: $watch,
            state_ref: $state_ref,
            coordinator_state_ref: $coordinator_state_ref,
            watch_coordinator_state_ref: None,
        })
    };
}

macro_rules! host {
    ($binary:expr, $role:expr, $port:expr, $database:expr, $root:expr, $target:expr, $root_id:expr, $recover:expr, $invoke:expr, $marker:expr, $watch:expr, $state_ref:expr, $coordinator_state_ref:expr $(,)?) => {{
        let plan = legacy_plan($root, $target);
        spawn_host(HostOptions {
            binary: $binary,
            role: $role,
            port: $port,
            database: $database,
            plan: &plan,
            root_id: $root_id,
            recover: $recover,
            invoke: $invoke,
            marker: $marker,
            watch_terminalized: $watch,
            state_ref: $state_ref,
            coordinator_state_ref: $coordinator_state_ref,
            watch_coordinator_state_ref: None,
        })
    }};
}

fn wait(port: u16) {
    for _ in 0..100 {
        if std::net::TcpStream::connect(("127.0.0.1", port)).is_ok() {
            return;
        }
        std::thread::sleep(Duration::from_millis(25));
    }
    panic!("host did not listen");
}

fn shared_host(
    binary: &std::path::Path,
    database: &str,
    listen: u16,
    root_id: &str,
    barrier: Option<&std::path::Path>,
    decision_marker: Option<&std::path::Path>,
) -> Child {
    let plan = legacy_plan_for(&[("root", listen)]);
    let mut command = Command::new(binary);
    command
        .args([
            "--role",
            "target",
            "--listen",
            &format!("127.0.0.1:{listen}"),
            "--database",
            database,
            "--legacy-placement-plan",
            &plan,
            "--root-id",
            root_id,
            "--state-ref",
            "root",
            "--invoke",
            "--shared-invoke",
            "--exit-after-invoke",
        ])
        .stdout(Stdio::inherit())
        .stderr(Stdio::inherit());
    command.env("REBOOT_TEST_FRESH_SHARED_NOOP", "1");
    command.env("REBOOT_TEST_SHARED_BARRIER_ID", root_id);
    if let Some(barrier) = barrier {
        command.env("REBOOT_TEST_SHARED_BARRIER_DIR", barrier);
    }
    if let Some(marker) = decision_marker {
        command.env("REBOOT_TEST_PAUSE_AFTER_COORDINATOR_PREPARE", marker);
    }
    command.spawn().unwrap()
}

/// Runs the generated fresh shared-root local path in its own process. The
/// handler changes state, requiring the generated adapter to promote its local
/// read lease into a durable writer.
fn fresh_shared_promotion_host(
    binary: &std::path::Path,
    database: &str,
    state_ref: &str,
    root_id: &str,
    pause_after_decision: Option<&std::path::Path>,
) -> Child {
    let listen = port();
    let plan = legacy_plan_for(&[(state_ref, listen)]);
    let mut command = Command::new(binary);
    command
        .args([
            "--role",
            "target",
            "--listen",
            &format!("127.0.0.1:{listen}"),
            "--database",
            database,
            "--legacy-placement-plan",
            &plan,
            "--root-id",
            root_id,
            "--state-ref",
            state_ref,
            "--invoke",
            "--shared-invoke",
            "--exit-after-invoke",
            "--amount",
            "7",
        ])
        .stdout(Stdio::inherit())
        .stderr(Stdio::inherit());
    if let Some(marker) = pause_after_decision {
        command.env("REBOOT_TEST_PAUSE_AFTER_COORDINATOR_PREPARE", marker);
    }
    command.spawn().unwrap()
}

fn exclusive_host(
    binary: &std::path::Path,
    database: &str,
    state_ref: &str,
    amount: i64,
) -> std::process::ExitStatus {
    let listen = port();
    let plan = legacy_plan_for(&[(state_ref, listen)]);
    Command::new(binary)
        .args([
            "--role",
            "target",
            "--listen",
            &format!("127.0.0.1:{listen}"),
            "--database",
            database,
            "--legacy-placement-plan",
            &plan,
            "--root-id",
            "00000000-0000-0000-0000-000000000104",
            "--state-ref",
            state_ref,
            "--invoke",
            "--exit-after-invoke",
            "--amount",
            &amount.to_string(),
            "--expect-response",
            "12",
        ])
        .status()
        .unwrap()
}

fn rich_error_remote_host(binary: &std::path::Path, listen: u16) -> Child {
    Command::new(binary)
        .args([
            "--role",
            "error-remote",
            "--listen",
            &format!("127.0.0.1:{listen}"),
        ])
        .stdout(Stdio::inherit())
        .stderr(Stdio::inherit())
        .spawn()
        .unwrap()
}

fn rich_error_root_host(
    binary: &std::path::Path,
    database: &str,
    state_ref: &str,
    target: &str,
    root_id: Uuid,
    amount: i64,
) -> std::process::ExitStatus {
    let listen = port();
    let plan = legacy_plan_for(&[(state_ref, listen), ("target", endpoint_port(target))]);
    Command::new(binary)
        .args([
            "--role",
            "root",
            "--listen",
            &format!("127.0.0.1:{listen}"),
            "--database",
            database,
            "--legacy-placement-plan",
            &plan,
            "--root-id",
            &root_id.to_string(),
            "--state-ref",
            state_ref,
            "--invoke",
            "--exit-after-invoke",
            "--amount",
            &amount.to_string(),
        ])
        .status()
        .unwrap()
}

/// Invokes the generated root-exclusive adapter in a fresh fixture process
/// with a caller-owned idempotency key. A non-success exit is its fail-closed
/// observable result.
fn idempotent_transaction_host(
    binary: &std::path::Path,
    database: &str,
    state_ref: &str,
    idempotency_key: Uuid,
    amount: i64,
    pause_after_decision: Option<&std::path::Path>,
    factory: bool,
) -> Child {
    let listen = port();
    let plan = legacy_plan_for(&[(state_ref, listen)]);
    let mut command = Command::new(binary);
    command
        .args([
            "--role",
            "target",
            "--listen",
            &format!("127.0.0.1:{listen}"),
            "--database",
            database,
            "--legacy-placement-plan",
            &plan,
            "--root-id",
            "00000000-0000-0000-0000-000000000106",
            "--state-ref",
            state_ref,
            "--invoke",
            "--exit-after-invoke",
            "--idempotency-key",
            &idempotency_key.to_string(),
            "--amount",
            &amount.to_string(),
        ])
        .stdout(Stdio::inherit())
        .stderr(Stdio::inherit());
    if factory {
        command.arg("--factory-invoke");
    }
    if let Some(marker) = pause_after_decision {
        command.env("REBOOT_TEST_PAUSE_AFTER_COORDINATOR_PREPARE", marker);
    }
    command.spawn().unwrap()
}

fn idempotent_exclusive_host(
    binary: &std::path::Path,
    database: &str,
    state_ref: &str,
    idempotency_key: Uuid,
    amount: i64,
    pause_after_decision: Option<&std::path::Path>,
) -> Child {
    idempotent_transaction_host(
        binary,
        database,
        state_ref,
        idempotency_key,
        amount,
        pause_after_decision,
        false,
    )
}

fn idempotent_factory_host(
    binary: &std::path::Path,
    database: &str,
    state_ref: &str,
    idempotency_key: Uuid,
    amount: i64,
    pause_after_decision: Option<&std::path::Path>,
) -> Child {
    idempotent_transaction_host(
        binary,
        database,
        state_ref,
        idempotency_key,
        amount,
        pause_after_decision,
        true,
    )
}

fn external_constructor_host(
    binary: &std::path::Path,
    database: &str,
    state_ref: &str,
    idempotency_key: Uuid,
    amount: i64,
    expect_declared_error: bool,
    surface_first_success_unavailable: bool,
) -> std::process::ExitStatus {
    let listen = port();
    let mut command = Command::new(binary);
    command
        .args([
            "--role",
            "external-constructor",
            "--listen",
            &format!("127.0.0.1:{listen}"),
            "--database",
            database,
            "--root-id",
            "00000000-0000-0000-0000-000000000107",
            "--state-ref",
            state_ref,
            "--invoke",
            "--exit-after-invoke",
            "--idempotency-key",
            &idempotency_key.to_string(),
            "--amount",
            &amount.to_string(),
        ])
        .stdout(Stdio::inherit())
        .stderr(Stdio::inherit());
    if expect_declared_error {
        command.arg("--expect-declared-constructor-error");
    }
    if surface_first_success_unavailable {
        command.arg("--surface-first-success-unavailable");
    }
    command.status().unwrap()
}

#[test]
#[ignore = "requires REBOOT_NATIVE2PC_CXX_DATABASE=path/to/bazel-bin/reboot/server/database"]
fn generated_external_constructor_declared_error_leaves_real_cxx_database_empty_then_creates_once()
{
    let database_binary =
        std::env::var("REBOOT_NATIVE2PC_CXX_DATABASE").expect("Bazel //reboot/server:database");
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
    let mut db = CxxDatabase::start(database_binary);
    let runtime = tokio::runtime::Runtime::new().unwrap();
    let state_ref = "external-constructor-declared-error";
    // C++ Database accepts caller-owned RFC UUIDs; make the version explicit.
    let key = Uuid::parse_str("00000000-0000-4000-8000-000000000108").unwrap();

    assert!(
        external_constructor_host(&binary, &db.endpoint(), state_ref, key, -1, true, false)
            .success(),
        "the generated Tonic client must observe the adapter's declared-error trailer"
    );
    assert_eq!(
        runtime.block_on(load_external_constructor_state(&db.endpoint(), state_ref)),
        None
    );
    assert!(
        runtime
            .block_on(recover_external_constructor_idempotency(
                &db.endpoint(),
                state_ref,
                key
            ))
            .is_empty()
    );

    // Reopen RocksDB before retrying: neither absence assertion can be
    // satisfied by a process-local actor or idempotency registry.
    db.restart();
    assert_eq!(
        runtime.block_on(load_external_constructor_state(&db.endpoint(), state_ref)),
        None
    );
    assert!(
        runtime
            .block_on(recover_external_constructor_idempotency(
                &db.endpoint(),
                state_ref,
                key
            ))
            .is_empty()
    );

    assert!(
        external_constructor_host(&binary, &db.endpoint(), state_ref, key, 7, false, false)
            .success()
    );
    assert_eq!(
        runtime.block_on(load_external_constructor_state(&db.endpoint(), state_ref)),
        Some(vec![0x08, 0x07])
    );
    let mutations = runtime.block_on(recover_external_constructor_idempotency(
        &db.endpoint(),
        state_ref,
        key,
    ));
    assert_eq!(mutations.len(), 1);
    assert_eq!(mutations[0].response, vec![0x08, 0x07]);

    // A same-key replay keeps the one actor and one durable mutation.
    assert!(
        external_constructor_host(&binary, &db.endpoint(), state_ref, key, 7, false, false)
            .success()
    );
    assert_eq!(
        runtime.block_on(load_external_constructor_state(&db.endpoint(), state_ref)),
        Some(vec![0x08, 0x07])
    );
    assert_eq!(
        runtime
            .block_on(recover_external_constructor_idempotency(
                &db.endpoint(),
                state_ref,
                key
            ))
            .len(),
        1
    );
}

#[test]
#[ignore = "requires REBOOT_NATIVE2PC_CXX_DATABASE=path/to/bazel-bin/reboot/server/database"]
fn generated_external_unavailable_retry_replays_once_through_restarted_real_cxx_rocksdb() {
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
    let binary = generated_host_binary(&fixture);
    let mut db = CxxDatabase::start(database_binary);
    let runtime = tokio::runtime::Runtime::new().unwrap();
    let state_ref = "external-unavailable-retry";
    let key = Uuid::parse_str("00000000-0000-4000-8000-000000000109").unwrap();

    assert!(
        external_constructor_host(&binary, &db.endpoint(), state_ref, key, 7, false, true)
            .success()
    );
    assert_eq!(
        runtime.block_on(load_external_constructor_state(&db.endpoint(), state_ref)),
        Some(vec![0x08, 0x07])
    );
    assert_eq!(
        runtime
            .block_on(recover_external_constructor_idempotency(
                &db.endpoint(),
                state_ref,
                key
            ))
            .len(),
        1
    );

    // Restart proves both the adapter's first committed response and its retry
    // record were stored in C++ Database/RocksDB rather than the host process.
    db.restart();
    assert_eq!(
        runtime.block_on(load_external_constructor_state(&db.endpoint(), state_ref)),
        Some(vec![0x08, 0x07])
    );
    let mutations = runtime.block_on(recover_external_constructor_idempotency(
        &db.endpoint(),
        state_ref,
        key,
    ));
    assert_eq!(mutations.len(), 1);
    assert_eq!(mutations[0].response, vec![0x08, 0x07]);
}

#[test]
#[ignore = "requires REBOOT_NATIVE2PC_CXX_DATABASE=path/to/bazel-bin/reboot/server/database"]
fn generated_root_declared_outbound_errors_commit_or_abort_durably_through_real_cxx_database() {
    let database_binary =
        std::env::var("REBOOT_NATIVE2PC_CXX_DATABASE").expect("Bazel //reboot/server:database");
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
    let mut db = CxxDatabase::start(database_binary);
    let runtime = tokio::runtime::Runtime::new().unwrap();
    let remote_port = port();
    let mut remote = rich_error_remote_host(&binary, remote_port);
    wait(remote_port);
    let remote_endpoint = format!("http://127.0.0.1:{remote_port}");

    let committed = "declared-rich-error-commits";
    runtime.block_on(store_counter(&db.endpoint(), committed, 5));
    assert!(
        rich_error_root_host(
            &binary,
            &db.endpoint(),
            committed,
            &remote_endpoint,
            Uuid::from_u128(0x110),
            100,
        )
        .success()
    );
    assert_eq!(
        runtime.block_on(load_state(&db.endpoint(), committed)),
        Some(vec![0x08, 105])
    );

    let recoverable_system = "system-rich-error-commits";
    runtime.block_on(store_counter(&db.endpoint(), recoverable_system, 5));
    assert!(
        rich_error_root_host(
            &binary,
            &db.endpoint(),
            recoverable_system,
            &remote_endpoint,
            Uuid::from_u128(0x111),
            104,
        )
        .success(),
        "a recognized recoverable Reboot backend error may be caught"
    );
    assert_eq!(
        runtime.block_on(load_state(&db.endpoint(), recoverable_system)),
        Some(vec![0x08, 109])
    );

    for (index, amount) in [101_i64, 102, 103, 105].into_iter().enumerate() {
        let state_ref = format!("declared-rich-error-aborts-{amount}");
        runtime.block_on(store_counter(&db.endpoint(), &state_ref, 5));
        assert!(
            !rich_error_root_host(
                &binary,
                &db.endpoint(),
                &state_ref,
                &remote_endpoint,
                Uuid::from_u128(0x120 + index as u128),
                amount,
            )
            .success(),
            "remote shape {amount} must fail the root"
        );
        assert_eq!(
            runtime.block_on(load_state(&db.endpoint(), &state_ref)),
            Some(vec![0x08, 5])
        );
    }

    let transport = "declared-rich-error-transport-aborts";
    runtime.block_on(store_counter(&db.endpoint(), transport, 5));
    assert!(
        !rich_error_root_host(
            &binary,
            &db.endpoint(),
            transport,
            &format!("http://127.0.0.1:{}", port()),
            Uuid::from_u128(0x130),
            100,
        )
        .success()
    );
    assert_eq!(
        runtime.block_on(load_state(&db.endpoint(), transport)),
        Some(vec![0x08, 5])
    );

    // Reopen RocksDB before the final assertions: no in-process state or mock
    // sidecar can satisfy these reads.
    db.restart();
    let recovery_port = port();
    let mut recovered = host!(
        &binary,
        "root",
        recovery_port,
        &db.endpoint(),
        recovery_port,
        recovery_port,
        "00000000-0000-0000-0000-000000000111",
        true,
        false,
        None,
        None,
        Some(committed),
        Some(committed),
    );
    wait(recovery_port);
    assert_eq!(
        runtime.block_on(load_state(&db.endpoint(), committed)),
        Some(vec![0x08, 105])
    );
    for amount in [101_i64, 102, 103, 105] {
        assert_eq!(
            runtime.block_on(load_state(
                &db.endpoint(),
                &format!("declared-rich-error-aborts-{amount}")
            )),
            Some(vec![0x08, 5]),
        );
    }
    assert_eq!(
        runtime.block_on(load_state(&db.endpoint(), recoverable_system)),
        Some(vec![0x08, 109])
    );
    assert_eq!(
        runtime.block_on(load_state(&db.endpoint(), transport)),
        Some(vec![0x08, 5])
    );
    let _ = recovered.kill();
    let _ = recovered.wait();
    let _ = remote.kill();
    let _ = remote.wait();
}

#[test]
#[ignore = "requires REBOOT_NATIVE2PC_CXX_DATABASE=path/to/bazel-bin/reboot/server/database"]
fn generated_root_exclusive_idempotency_is_durable_replayed_and_collision_safe() {
    let database_binary =
        std::env::var("REBOOT_NATIVE2PC_CXX_DATABASE").expect("Bazel //reboot/server:database");
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
    let db = CxxDatabase::start(database_binary);
    let runtime = tokio::runtime::Runtime::new().unwrap();
    let state_ref = "idempotent-root";
    // C++ validates non-v7 keys as RFC UUIDs; use a valid caller-owned v4 key.
    let key = Uuid::new_v4();
    runtime.block_on(store_counter(&db.endpoint(), state_ref, 5));

    assert!(
        idempotent_exclusive_host(&binary, &db.endpoint(), state_ref, key, 7, None)
            .wait()
            .unwrap()
            .success()
    );
    assert_eq!(
        runtime.block_on(load_state(&db.endpoint(), state_ref)),
        Some(vec![0x08, 0x0c])
    );
    let initial = runtime.block_on(recover_idempotent_mutations(&db.endpoint(), state_ref, key));
    assert_eq!(
        initial.len(),
        1,
        "first call must commit exactly one durable response"
    );
    assert_eq!(initial[0].key, key.as_bytes());
    assert_eq!(initial[0].response, vec![0x08, 0x0c]);

    assert!(
        idempotent_exclusive_host(&binary, &db.endpoint(), state_ref, key, 7, None)
            .wait()
            .unwrap()
            .success()
    );
    assert_eq!(
        runtime.block_on(load_state(&db.endpoint(), state_ref)),
        Some(vec![0x08, 0x0c])
    );
    assert_eq!(
        runtime.block_on(recover_idempotent_mutations(&db.endpoint(), state_ref, key)),
        initial,
        "same key and request must replay without a second write"
    );

    assert!(
        !idempotent_exclusive_host(&binary, &db.endpoint(), state_ref, key, 9, None)
            .wait()
            .unwrap()
            .success()
    );
    assert_eq!(
        runtime.block_on(load_state(&db.endpoint(), state_ref)),
        Some(vec![0x08, 0x0c])
    );
    assert_eq!(
        runtime.block_on(recover_idempotent_mutations(&db.endpoint(), state_ref, key)),
        initial,
        "a key collision must fail closed without replacing the durable response"
    );
}

#[test]
#[ignore = "requires REBOOT_NATIVE2PC_CXX_DATABASE=path/to/bazel-bin/reboot/server/database"]
fn generated_application_host_recovers_idempotent_root_exactly_once_after_decision() {
    let database_binary =
        std::env::var("REBOOT_NATIVE2PC_CXX_DATABASE").expect("Bazel //reboot/server:database");
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
    let mut db = CxxDatabase::start(database_binary);
    let runtime = tokio::runtime::Runtime::new().unwrap();
    let state_ref = "idempotent-recovery-root";
    // C++ validates non-v7 keys as RFC UUIDs; use a valid caller-owned v4 key.
    let key = Uuid::new_v4();
    runtime.block_on(store_counter(&db.endpoint(), state_ref, 5));
    let marker_dir = tempfile::tempdir().unwrap();
    let marker = marker_dir.path().join("decision-sealed");
    let mut root =
        idempotent_exclusive_host(&binary, &db.endpoint(), state_ref, key, 7, Some(&marker));
    for _ in 0..100 {
        if marker.exists() {
            break;
        }
        std::thread::sleep(Duration::from_millis(25));
    }
    assert!(
        marker.exists(),
        "root never persisted its decision after prepare"
    );
    let _ = root.kill();
    let _ = root.wait();
    db.restart();

    let recovery_port = port();
    let mut recovered = host!(
        &binary,
        "root",
        recovery_port,
        &db.endpoint(),
        recovery_port,
        recovery_port,
        "00000000-0000-0000-0000-000000000106",
        true,
        false,
        None,
        None,
        Some(state_ref),
        Some(state_ref),
    );
    wait(recovery_port);
    let expected = Some(vec![0x08, 0x0c]);
    for _ in 0..100 {
        if runtime.block_on(load_state(&db.endpoint(), state_ref)) == expected {
            break;
        }
        std::thread::sleep(Duration::from_millis(25));
    }
    assert_eq!(
        runtime.block_on(load_state(&db.endpoint(), state_ref)),
        expected
    );
    let initial = runtime.block_on(recover_idempotent_mutations(&db.endpoint(), state_ref, key));
    assert_eq!(
        initial.len(),
        1,
        "recovery must commit exactly one durable response"
    );
    assert_eq!(initial[0].response, vec![0x08, 0x0c]);
    assert!(
        idempotent_exclusive_host(&binary, &db.endpoint(), state_ref, key, 7, None)
            .wait()
            .unwrap()
            .success()
    );
    assert_eq!(
        runtime.block_on(load_state(&db.endpoint(), state_ref)),
        expected
    );
    assert_eq!(
        runtime.block_on(recover_idempotent_mutations(&db.endpoint(), state_ref, key)),
        initial,
        "post-recovery replay must neither lose nor duplicate the durable response"
    );
    let _ = recovered.kill();
    let _ = recovered.wait();
}

#[test]
#[ignore = "requires REBOOT_NATIVE2PC_CXX_DATABASE=path/to/bazel-bin/reboot/server/database"]
fn generated_factory_root_idempotency_replays_before_absent_state_admission_and_rejects_collisions()
{
    let database_binary =
        std::env::var("REBOOT_NATIVE2PC_CXX_DATABASE").expect("Bazel //reboot/server:database");
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
    let db = CxxDatabase::start(database_binary);
    let runtime = tokio::runtime::Runtime::new().unwrap();
    let state_ref = "idempotent-factory-root";
    // The native sidecar validates caller keys as RFC UUIDs; this is a v4 key.
    let key = Uuid::new_v4();

    assert!(
        idempotent_factory_host(&binary, &db.endpoint(), state_ref, key, 7, None)
            .wait()
            .unwrap()
            .success()
    );
    let expected = Some(vec![0x08, 0x07]);
    assert_eq!(
        runtime.block_on(load_state(&db.endpoint(), state_ref)),
        expected
    );
    let initial = runtime.block_on(recover_idempotent_mutations(&db.endpoint(), state_ref, key));
    assert_eq!(
        initial.len(),
        1,
        "factory creation stages exactly one response"
    );
    assert_eq!(initial[0].response, vec![0x08, 0x07]);

    assert!(
        idempotent_factory_host(&binary, &db.endpoint(), state_ref, key, 7, None)
            .wait()
            .unwrap()
            .success()
    );
    assert_eq!(
        runtime.block_on(load_state(&db.endpoint(), state_ref)),
        expected
    );
    assert_eq!(
        runtime.block_on(recover_idempotent_mutations(&db.endpoint(), state_ref, key)),
        initial,
        "replay must precede factory absent-state admission and not recreate state"
    );

    assert!(
        !idempotent_factory_host(&binary, &db.endpoint(), state_ref, key, 9, None)
            .wait()
            .unwrap()
            .success()
    );
    assert_eq!(
        runtime.block_on(load_state(&db.endpoint(), state_ref)),
        expected
    );
    assert_eq!(
        runtime.block_on(recover_idempotent_mutations(&db.endpoint(), state_ref, key)),
        initial,
        "a factory-key collision must fail closed without replacing the response"
    );
}

#[test]
#[ignore = "requires REBOOT_NATIVE2PC_CXX_DATABASE=path/to/bazel-bin/reboot/server/database"]
fn generated_factory_root_idempotency_recovers_after_post_decision_crash() {
    let database_binary =
        std::env::var("REBOOT_NATIVE2PC_CXX_DATABASE").expect("Bazel //reboot/server:database");
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
    let mut db = CxxDatabase::start(database_binary);
    let runtime = tokio::runtime::Runtime::new().unwrap();
    let state_ref = "idempotent-factory-recovery-root";
    // The native sidecar validates caller keys as RFC UUIDs; this is a v4 key.
    let key = Uuid::new_v4();
    let marker_dir = tempfile::tempdir().unwrap();
    let marker = marker_dir.path().join("factory-decision-sealed");
    let mut root =
        idempotent_factory_host(&binary, &db.endpoint(), state_ref, key, 7, Some(&marker));
    for _ in 0..100 {
        if marker.exists() {
            break;
        }
        std::thread::sleep(Duration::from_millis(25));
    }
    assert!(
        marker.exists(),
        "factory root never persisted its decision after prepare"
    );
    let _ = root.kill();
    let _ = root.wait();
    db.restart();

    let recovery_port = port();
    let mut recovered = host!(
        &binary,
        "root",
        recovery_port,
        &db.endpoint(),
        recovery_port,
        recovery_port,
        "00000000-0000-0000-0000-000000000106",
        true,
        false,
        None,
        None,
        Some(state_ref),
        Some(state_ref),
    );
    wait(recovery_port);
    let expected = Some(vec![0x08, 0x07]);
    for _ in 0..100 {
        if runtime.block_on(load_state(&db.endpoint(), state_ref)) == expected {
            break;
        }
        std::thread::sleep(Duration::from_millis(25));
    }
    assert_eq!(
        runtime.block_on(load_state(&db.endpoint(), state_ref)),
        expected
    );
    let initial = runtime.block_on(recover_idempotent_mutations(&db.endpoint(), state_ref, key));
    assert_eq!(
        initial.len(),
        1,
        "recovery must commit exactly one factory response"
    );
    assert_eq!(initial[0].response, vec![0x08, 0x07]);
    assert!(
        idempotent_factory_host(&binary, &db.endpoint(), state_ref, key, 7, None)
            .wait()
            .unwrap()
            .success()
    );
    assert_eq!(
        runtime.block_on(load_state(&db.endpoint(), state_ref)),
        expected
    );
    assert_eq!(
        runtime.block_on(recover_idempotent_mutations(&db.endpoint(), state_ref, key)),
        initial,
        "post-recovery replay must neither lose nor duplicate factory state or response"
    );
    let _ = recovered.kill();
    let _ = recovered.wait();
}

#[test]
#[ignore = "requires REBOOT_NATIVE2PC_CXX_DATABASE=path/to/bazel-bin/reboot/server/database"]
fn generated_shared_roots_overlap_without_mutation_then_exclusive_works() {
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
    let binary = generated_host_binary(&fixture);
    let db = CxxDatabase::start(database_binary);
    let runtime = tokio::runtime::Runtime::new().unwrap();
    runtime.block_on(async {
        database::database_client::DatabaseClient::connect(db.endpoint())
            .await
            .unwrap()
            .store(database::StoreRequest {
                actor_upserts: vec![database::Actor {
                    state_type: "tests.reboot.protoc.TransactionCounter".into(),
                    state_ref: "root".into(),
                    state: Some(vec![0x08, 0x05]),
                }],
                task_upserts: vec![],
                colocated_upserts: vec![],
                transaction: None,
                idempotent_mutation: None,
                ensure_state_types_created: vec![],
                sync: true,
            })
            .await
            .unwrap();
    });
    let barrier = tempfile::tempdir().unwrap();
    let mut first = shared_host(
        &binary,
        &db.endpoint(),
        port(),
        "00000000-0000-0000-0000-000000000101",
        Some(barrier.path()),
        None,
    );
    let mut second = shared_host(
        &binary,
        &db.endpoint(),
        port(),
        "00000000-0000-0000-0000-000000000102",
        Some(barrier.path()),
        None,
    );
    assert!(first.wait().unwrap().success());
    assert!(second.wait().unwrap().success());
    assert_eq!(
        runtime.block_on(load_state(&db.endpoint(), "root")),
        Some(vec![0x08, 0x05])
    );
    assert!(exclusive_host(&binary, &db.endpoint(), "root", 7).success());
    assert_eq!(
        runtime.block_on(load_state(&db.endpoint(), "root")),
        Some(vec![0x08, 0x0c])
    );
}

#[test]
#[ignore = "requires REBOOT_NATIVE2PC_CXX_DATABASE=path/to/bazel-bin/reboot/server/database"]
fn generated_fresh_shared_noop_releases_without_a_durable_recovery_decision() {
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
    let binary = generated_host_binary(&fixture);
    let mut db = CxxDatabase::start(database_binary);
    let runtime = tokio::runtime::Runtime::new().unwrap();
    runtime.block_on(store_counter(&db.endpoint(), "root", 5));

    // A fresh shared no-op is read-only. It must not manufacture a coordinator
    // decision merely to make a restart fixture look transactional.
    let marker_dir = tempfile::tempdir().unwrap();
    let marker = marker_dir.path().join("unexpected-decision-sealed");
    let mut root = shared_host(
        &binary,
        &db.endpoint(),
        port(),
        "00000000-0000-0000-0000-000000000103",
        None,
        Some(&marker),
    );
    let mut status = None;
    for _ in 0..100 {
        if marker.exists() {
            break;
        }
        status = root.try_wait().unwrap();
        if status.is_some() {
            break;
        }
        std::thread::sleep(Duration::from_millis(25));
    }
    if marker.exists() || status.is_none() {
        let _ = root.kill();
        let _ = root.wait();
        assert!(
            !marker.exists(),
            "fresh shared no-op persisted an unexpected durable coordinator decision"
        );
        panic!("fresh shared no-op did not finish within the acceptance bound");
    }
    assert!(status.unwrap().success());
    assert_eq!(
        runtime.block_on(load_state(&db.endpoint(), "root")),
        Some(vec![0x08, 0x05])
    );

    // Restarting the authoritative sidecar cannot leave an undurable read lease
    // behind: a subsequent exclusive root can admit and commit normally.
    db.restart();
    assert!(exclusive_host(&binary, &db.endpoint(), "root", 7).success());
    assert_eq!(
        runtime.block_on(load_state(&db.endpoint(), "root")),
        Some(vec![0x08, 0x0c])
    );
}

#[test]
#[ignore = "requires REBOOT_NATIVE2PC_CXX_DATABASE=path/to/bazel-bin/reboot/server/database"]
fn generated_fresh_shared_local_promotion_recovers_after_durable_decision() {
    let database_binary =
        std::env::var("REBOOT_NATIVE2PC_CXX_DATABASE").expect("Bazel //reboot/server:database");
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
    let mut db = CxxDatabase::start(database_binary);
    let runtime = tokio::runtime::Runtime::new().unwrap();
    let state_ref = "fresh-shared-promotion-root";
    let root_id = "00000000-0000-0000-0000-000000000107";
    runtime.block_on(store_counter(&db.endpoint(), state_ref, 5));

    let marker_dir = tempfile::tempdir().unwrap();
    let marker = marker_dir.path().join("decision-sealed");
    let mut root =
        fresh_shared_promotion_host(&binary, &db.endpoint(), state_ref, root_id, Some(&marker));
    for _ in 0..100 {
        if marker.exists() {
            break;
        }
        std::thread::sleep(Duration::from_millis(25));
    }
    assert!(
        marker.exists(),
        "fresh shared promotion never persisted its commit decision"
    );
    let _ = root.kill();
    let _ = root.wait();
    db.restart();

    let recovery_port = port();
    let mut recovered = host!(
        &binary,
        "root",
        recovery_port,
        &db.endpoint(),
        recovery_port,
        recovery_port,
        root_id,
        true,
        false,
        None,
        None,
        Some(state_ref),
        Some(state_ref),
    );
    wait(recovery_port);
    let expected = Some(vec![0x08, 0x0c]);
    for _ in 0..100 {
        if runtime.block_on(load_state(&db.endpoint(), state_ref)) == expected {
            break;
        }
        std::thread::sleep(Duration::from_millis(25));
    }
    assert_eq!(
        runtime.block_on(load_state(&db.endpoint(), state_ref)),
        expected
    );
    let _ = recovered.kill();
    let _ = recovered.wait();
}

#[test]
#[ignore = "requires REBOOT_NATIVE2PC_CXX_DATABASE=path/to/bazel-bin/reboot/server/database"]
fn generated_exclusive_cross_actor_recovers_through_real_cxx_database_processes() {
    let database_binary =
        std::env::var("REBOOT_NATIVE2PC_CXX_DATABASE").expect("Bazel //reboot/server:database");
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
    let mut root_db = CxxDatabase::start(database_binary.clone());
    let mut target_db = CxxDatabase::start(database_binary);
    let runtime = tokio::runtime::Runtime::new().unwrap();
    runtime.block_on(store_counter(&root_db.endpoint(), "root", 0));
    runtime.block_on(store_counter(&target_db.endpoint(), "target", 0));

    let root_port = port();
    let target_port = port();
    let plan = legacy_plan(root_port, target_port);
    let root_id = "00000000-0000-0000-0000-000000000001";
    let mut target = spawn_with_plan!(
        &binary,
        "target",
        target_port,
        &target_db.endpoint(),
        root_port,
        target_port,
        &plan,
        root_id,
        false,
        false,
        None,
        None,
        None,
        None,
    );
    wait(target_port);
    let marker_dir = tempfile::tempdir().unwrap();
    let marker = marker_dir.path().join("sealed");
    let mut root = spawn_with_plan!(
        &binary,
        "root",
        root_port,
        &root_db.endpoint(),
        root_port,
        target_port,
        &plan,
        root_id,
        false,
        true,
        Some(&marker),
        None,
        None,
        None,
    );
    wait(root_port);
    for _ in 0..100 {
        if marker.exists() {
            break;
        }
        std::thread::sleep(Duration::from_millis(25));
    }
    assert!(
        marker.exists(),
        "root never sealed its real C++ coordinator record"
    );
    let _ = root.kill();
    let _ = root.wait();
    let _ = target.kill();
    let _ = target.wait();
    root_db.restart();
    target_db.restart();

    // Start the target host first. Its Watch is placement-routed to root and
    // remains pending until the recovered root host begins serving.
    target = spawn_with_plan!(
        &binary,
        "target",
        target_port,
        &target_db.endpoint(),
        root_port,
        target_port,
        &plan,
        root_id,
        true,
        false,
        None,
        None,
        None,
        None,
    );
    wait(target_port);
    root = spawn_with_plan!(
        &binary,
        "root",
        root_port,
        &root_db.endpoint(),
        root_port,
        target_port,
        &plan,
        root_id,
        true,
        false,
        None,
        None,
        None,
        None,
    );
    wait(root_port);

    for _ in 0..100 {
        if runtime.block_on(load_state(&root_db.endpoint(), "root")) == Some(vec![0x08, 0x07])
            && runtime.block_on(load_state(&target_db.endpoint(), "target"))
                == Some(vec![0x08, 0x07])
        {
            break;
        }
        std::thread::sleep(Duration::from_millis(25));
    }
    assert_eq!(
        runtime.block_on(load_state(&root_db.endpoint(), "root")),
        Some(vec![0x08, 0x07])
    );
    assert_eq!(
        runtime.block_on(load_state(&target_db.endpoint(), "target")),
        Some(vec![0x08, 0x07])
    );
    let _ = root.kill();
    let _ = root.wait();
    let _ = target.kill();
    let _ = target.wait();
}

#[test]
#[ignore = "requires REBOOT_NATIVE2PC_CXX_DATABASE=path/to/bazel-bin/reboot/server/database"]
fn generated_exclusive_factory_creates_only_absent_actor_through_real_cxx_database() {
    let database_binary =
        std::env::var("REBOOT_NATIVE2PC_CXX_DATABASE").expect("Bazel //reboot/server:database");
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
    let db = CxxDatabase::start(database_binary);
    // Do not seed this state type or actor. C++ Load deliberately omits an
    // unknown column family, and TransactionParticipantPrepare creates it
    // when applying the first durable state write inside its RocksDB txn.
    let runtime = tokio::runtime::Runtime::new().unwrap();
    assert!(factory_host(&binary, &db.endpoint(), "factory-created", 7).success());
    // TransactionCounter { value: 7 } has canonical protobuf bytes 0x08, 0x07.
    assert_eq!(
        runtime.block_on(load_state(&db.endpoint(), "factory-created")),
        Some(vec![0x08, 0x07])
    );

    // Existing state must reject without overwriting the first construction.
    assert!(!factory_host(&binary, &db.endpoint(), "factory-created", 99).success());
    assert_eq!(
        runtime.block_on(load_state(&db.endpoint(), "factory-created")),
        Some(vec![0x08, 0x07])
    );

    // The fixture's negative amount makes its factory handler fail before
    // coordinator preparation; no actor state may be materialized.
    assert!(!factory_host(&binary, &db.endpoint(), "factory-handler-failed", -1).success());
    assert_eq!(
        runtime.block_on(load_state(&db.endpoint(), "factory-handler-failed")),
        None
    );
}

#[test]
#[ignore = "requires REBOOT_NATIVE2PC_CXX_DATABASE=path/to/bazel-bin/reboot/server/database"]
fn generated_exclusive_factory_creates_root_and_commits_existing_target_through_real_cxx_database()
{
    let database_binary =
        std::env::var("REBOOT_NATIVE2PC_CXX_DATABASE").expect("Bazel //reboot/server:database");
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
    let db = CxxDatabase::start(database_binary);
    let runtime = tokio::runtime::Runtime::new().unwrap();
    runtime.block_on(async {
        database::database_client::DatabaseClient::connect(db.endpoint())
            .await
            .unwrap()
            .store(database::StoreRequest {
                actor_upserts: vec![database::Actor {
                    state_type: "tests.reboot.protoc.TransactionCounter".into(),
                    state_ref: "target".into(),
                    state: Some(vec![0x08, 0x05]),
                }],
                task_upserts: vec![],
                colocated_upserts: vec![],
                transaction: None,
                idempotent_mutation: None,
                ensure_state_types_created: vec![],
                sync: true,
            })
            .await
            .unwrap();
    });
    let root_port = port();
    let target_port = port();
    let mut target = host!(
        &binary,
        "target",
        target_port,
        &db.endpoint(),
        root_port,
        target_port,
        "00000000-0000-0000-0000-000000000004",
        false,
        false,
        None,
        None,
        None,
        None,
    );
    wait(target_port);
    assert!(
        factory_target_host(
            &binary,
            &db.endpoint(),
            root_port,
            target_port,
            "factory-root",
            7
        )
        .success()
    );
    assert_eq!(
        runtime.block_on(load_state(&db.endpoint(), "factory-root")),
        Some(vec![0x08, 0x07])
    );
    assert_eq!(
        runtime.block_on(load_state(&db.endpoint(), "target")),
        Some(vec![0x08, 0x0c])
    );
    assert!(
        !factory_target_host(
            &binary,
            &db.endpoint(),
            root_port,
            target_port,
            "factory-root",
            99
        )
        .success()
    );
    assert_eq!(
        runtime.block_on(load_state(&db.endpoint(), "factory-root")),
        Some(vec![0x08, 0x07])
    );
    assert_eq!(
        runtime.block_on(load_state(&db.endpoint(), "target")),
        Some(vec![0x08, 0x0c])
    );
    let _ = target.kill();
    let _ = target.wait();
}

#[test]
#[ignore = "requires REBOOT_NATIVE2PC_CXX_DATABASE=path/to/bazel-bin/reboot/server/database"]
fn generated_factory_root_recovers_target_across_two_cxx_database_processes() {
    let database_binary =
        std::env::var("REBOOT_NATIVE2PC_CXX_DATABASE").expect("Bazel //reboot/server:database");
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
    // The root factory actor and pre-existing target actor live in separate
    // C++ Database/RocksDB sidecars; no shared sidecar can mask routing.
    let mut root_db = CxxDatabase::start(database_binary.clone());
    let mut target_db = CxxDatabase::start(database_binary);
    let runtime = tokio::runtime::Runtime::new().unwrap();
    runtime.block_on(async {
        database::database_client::DatabaseClient::connect(target_db.endpoint())
            .await
            .unwrap()
            .store(database::StoreRequest {
                actor_upserts: vec![database::Actor {
                    state_type: "tests.reboot.protoc.TransactionCounter".into(),
                    state_ref: "target".into(),
                    state: Some(vec![0x08, 0x05]),
                }],
                task_upserts: vec![],
                colocated_upserts: vec![],
                transaction: None,
                idempotent_mutation: None,
                ensure_state_types_created: vec![],
                sync: true,
            })
            .await
            .unwrap();
    });
    let root_port = port();
    let target_port = port();
    let root_id = "00000000-0000-0000-0000-000000000005";
    let plan = legacy_plan_for(&[("factory-root", root_port), ("target", target_port)]);
    let marker_dir = tempfile::tempdir().unwrap();
    let marker = marker_dir.path().join("sealed");
    let mut target = spawn_with_plan!(
        &binary,
        "target",
        target_port,
        &target_db.endpoint(),
        root_port,
        target_port,
        &plan,
        root_id,
        false,
        false,
        None,
        None,
        None,
        Some("factory-root"),
    );
    wait(target_port);
    let mut root = factory_target_root_host(
        &binary,
        &root_db.endpoint(),
        root_port,
        target_port,
        root_id,
        "factory-root",
        &marker,
    );
    wait(root_port);
    for _ in 0..100 {
        if marker.exists() {
            break;
        }
        std::thread::sleep(Duration::from_millis(25));
    }
    assert!(
        marker.exists(),
        "factory root never sealed its real C++ coordinator record"
    );
    let _ = root.kill();
    let _ = root.wait();
    let _ = target.kill();
    let _ = target.wait();
    root_db.restart();
    target_db.restart();

    let watch_terminalized = marker_dir.path().join("target-watch-terminalized");
    let recovered_root_port = port();
    let recovered_plan = legacy_plan_for(&[
        ("factory-root", recovered_root_port),
        ("target", target_port),
    ]);
    target = spawn_host(HostOptions {
        binary: &binary,
        role: "target",
        port: target_port,
        database: &target_db.endpoint(),
        plan: &recovered_plan,
        root_id,
        recover: true,
        invoke: false,
        marker: None,
        watch_terminalized: Some(&watch_terminalized),
        state_ref: None,
        coordinator_state_ref: Some("target"),
        watch_coordinator_state_ref: Some("factory-root"),
    });
    wait(target_port);
    root = spawn_with_plan!(
        &binary,
        "root",
        recovered_root_port,
        &root_db.endpoint(),
        recovered_root_port,
        target_port,
        &recovered_plan,
        root_id,
        true,
        false,
        None,
        None,
        Some("factory-root"),
        Some("factory-root"),
    );
    wait(recovered_root_port);
    for _ in 0..100 {
        if watch_terminalized.exists() {
            break;
        }
        std::thread::sleep(Duration::from_millis(25));
    }
    // The target's marker is produced by durable_participant only after its
    // placement-routed Watch response has led to successful terminal control.
    assert!(
        watch_terminalized.exists(),
        "target did not Watch the factory-root decision and terminalize"
    );
    for _ in 0..100 {
        if runtime.block_on(load_state(&root_db.endpoint(), "factory-root"))
            == Some(vec![0x08, 0x07])
            && runtime.block_on(load_state(&target_db.endpoint(), "target"))
                == Some(vec![0x08, 0x0c])
        {
            break;
        }
        std::thread::sleep(Duration::from_millis(25));
    }
    assert_eq!(
        runtime.block_on(load_state(&root_db.endpoint(), "factory-root")),
        Some(vec![0x08, 0x07])
    );
    assert_eq!(
        runtime.block_on(load_state(&target_db.endpoint(), "target")),
        Some(vec![0x08, 0x0c])
    );
    assert!(
        !factory_target_host(
            &binary,
            &root_db.endpoint(),
            root_port,
            target_port,
            "factory-root",
            99
        )
        .success()
    );
    assert_eq!(
        runtime.block_on(load_state(&root_db.endpoint(), "factory-root")),
        Some(vec![0x08, 0x07])
    );
    assert_eq!(
        runtime.block_on(load_state(&target_db.endpoint(), "target")),
        Some(vec![0x08, 0x0c])
    );
    let _ = root.kill();
    let _ = root.wait();
    let _ = target.kill();
    let _ = target.wait();
}

#[test]
#[ignore = "requires REBOOT_NATIVE2PC_CXX_DATABASE=path/to/bazel-bin/reboot/server/database"]
fn generated_fresh_exclusive_default_state_persists_through_live_placement_planner() {
    let database_binary =
        std::env::var("REBOOT_NATIVE2PC_CXX_DATABASE").expect("Bazel //reboot/server:database");
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
    let db = CxxDatabase::start(database_binary);
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
    let status = Command::new(&binary)
        .args([
            "--role",
            "target",
            "--listen",
            &format!("127.0.0.1:{listen}"),
            "--database",
            &db.endpoint(),
            "--placement-planner",
            &planner.endpoint,
            "--root-id",
            "00000000-0000-0000-0000-000000000104",
            "--state-ref",
            "root",
            "--invoke",
            "--exit-after-invoke",
            "--amount",
            "7",
            "--expect-response",
            "12",
        ])
        .status()
        .unwrap();
    assert!(status.success());
    for _ in 0..100 {
        if runtime.block_on(load_state(&db.endpoint(), "root")) == Some(vec![0x08, 0x0c]) {
            break;
        }
        std::thread::sleep(Duration::from_millis(25));
    }
    assert_eq!(
        runtime.block_on(load_state(&db.endpoint(), "root")),
        Some(vec![0x08, 0x0c])
    );
    planner.stop();
}

#[test]
#[ignore = "requires REBOOT_NATIVE2PC_CXX_DATABASE=path/to/bazel-bin/reboot/server/database"]
fn generated_factory_declared_error_aborts_then_retries_once_through_live_placement_planner() {
    let database_binary =
        std::env::var("REBOOT_NATIVE2PC_CXX_DATABASE").expect("Bazel //reboot/server:database");
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
    let mut db = CxxDatabase::start(database_binary);
    let runtime = tokio::runtime::Runtime::new().unwrap();
    let state_ref = "factory-declared-error-live-planner";
    let key = Uuid::parse_str("00000000-0000-4000-8000-00000000010a").unwrap();
    let listen = port();
    // This response is served by the canonical PlacementPlanner stream. Hosts
    // below receive only --placement-planner, never --legacy-placement-plan.
    let plan = placement_proto::ListenForPlanResponse::decode(
        URL_SAFE_NO_PAD
            .decode(legacy_plan_for(&[(state_ref, listen)]))
            .unwrap()
            .as_slice(),
    )
    .unwrap();
    let planner = LivePlannerServer::start(&runtime, plan);

    let mut failed = spawn_live_host(LiveHostOptions {
        binary: &binary,
        role: "target",
        port: listen,
        database: &db.endpoint(),
        planner: &planner.endpoint,
        root_id: "00000000-0000-0000-0000-00000000010a",
        recover: false,
        invoke: true,
        factory_invoke: true,
        factory_target_invoke: false,
        expect_factory_declared_error: true,
        marker: None,
        watch_terminalized: None,
        state_ref: Some(state_ref),
        coordinator_state_ref: Some(state_ref),
        watch_coordinator_state_ref: None,
    });
    assert!(failed.wait().unwrap().success());
    planner.wait_for_connections(1);
    assert_eq!(
        runtime.block_on(load_state(&db.endpoint(), state_ref)),
        None
    );
    assert!(
        runtime
            .block_on(recover_idempotent_mutations(&db.endpoint(), state_ref, key))
            .is_empty(),
        "declared factory failure must abort before a durable idempotency record"
    );

    // Reopen RocksDB before retrying so cleanup cannot be attributed to the
    // exited host process.
    db.restart();
    assert_eq!(
        runtime.block_on(load_state(&db.endpoint(), state_ref)),
        None
    );
    assert!(
        runtime
            .block_on(recover_idempotent_mutations(&db.endpoint(), state_ref, key))
            .is_empty()
    );

    let mut created = spawn_live_host(LiveHostOptions {
        binary: &binary,
        role: "target",
        port: listen,
        database: &db.endpoint(),
        planner: &planner.endpoint,
        root_id: "00000000-0000-0000-0000-00000000010a",
        recover: false,
        invoke: true,
        factory_invoke: true,
        factory_target_invoke: false,
        expect_factory_declared_error: false,
        marker: None,
        watch_terminalized: None,
        state_ref: Some(state_ref),
        coordinator_state_ref: Some(state_ref),
        watch_coordinator_state_ref: None,
    });
    assert!(created.wait().unwrap().success());
    planner.wait_for_connections(2);
    assert_eq!(
        runtime.block_on(load_state(&db.endpoint(), state_ref)),
        Some(vec![0x08, 0x07])
    );
    let initial = runtime.block_on(recover_idempotent_mutations(&db.endpoint(), state_ref, key));
    assert_eq!(initial.len(), 1);
    assert_eq!(initial[0].response, vec![0x08, 0x07]);

    let mut replay = spawn_live_host(LiveHostOptions {
        binary: &binary,
        role: "target",
        port: listen,
        database: &db.endpoint(),
        planner: &planner.endpoint,
        root_id: "00000000-0000-0000-0000-00000000010a",
        recover: false,
        invoke: true,
        factory_invoke: true,
        factory_target_invoke: false,
        expect_factory_declared_error: false,
        marker: None,
        watch_terminalized: None,
        state_ref: Some(state_ref),
        coordinator_state_ref: Some(state_ref),
        watch_coordinator_state_ref: None,
    });
    assert!(replay.wait().unwrap().success());
    planner.wait_for_connections(3);
    assert_eq!(
        runtime.block_on(load_state(&db.endpoint(), state_ref)),
        Some(vec![0x08, 0x07])
    );
    assert_eq!(
        runtime.block_on(recover_idempotent_mutations(&db.endpoint(), state_ref, key)),
        initial,
        "valid retry and same-key replay must create exactly once"
    );
    planner.stop();
}

#[test]
#[ignore = "requires REBOOT_NATIVE2PC_CXX_DATABASE=path/to/bazel-bin/reboot/server/database"]
fn generated_factory_root_recovers_target_through_live_placement_planner_across_two_cxx_database_processes()
 {
    let database_binary =
        std::env::var("REBOOT_NATIVE2PC_CXX_DATABASE").expect("Bazel //reboot/server:database");
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
    let mut root_db = CxxDatabase::start(database_binary.clone());
    let mut target_db = CxxDatabase::start(database_binary);
    let runtime = tokio::runtime::Runtime::new().unwrap();
    runtime.block_on(store_counter(&target_db.endpoint(), "target", 5));
    let root_port = port();
    let target_port = port();
    let root_id = "00000000-0000-0000-0000-000000000005";
    let initial_plan = placement_proto::ListenForPlanResponse::decode(
        URL_SAFE_NO_PAD
            .decode(legacy_plan_for(&[
                ("factory-root", root_port),
                ("target", target_port),
            ]))
            .unwrap()
            .as_slice(),
    )
    .unwrap();
    let initial_planner = LivePlannerServer::start(&runtime, initial_plan);
    let marker_dir = tempfile::tempdir().unwrap();
    let marker = marker_dir.path().join("sealed");
    let mut target = spawn_live_host(LiveHostOptions {
        binary: &binary,
        role: "target",
        port: target_port,
        database: &target_db.endpoint(),
        planner: &initial_planner.endpoint,
        root_id,
        recover: false,
        invoke: false,
        factory_invoke: false,
        factory_target_invoke: false,
        expect_factory_declared_error: false,
        marker: None,
        watch_terminalized: None,
        state_ref: None,
        coordinator_state_ref: Some("factory-root"),
        watch_coordinator_state_ref: None,
    });
    wait(target_port);
    initial_planner.wait_for_connections(1);
    let mut root = spawn_live_host(LiveHostOptions {
        binary: &binary,
        role: "root",
        port: root_port,
        database: &root_db.endpoint(),
        planner: &initial_planner.endpoint,
        root_id,
        recover: false,
        invoke: true,
        factory_invoke: false,
        factory_target_invoke: true,
        expect_factory_declared_error: false,
        marker: Some(&marker),
        watch_terminalized: None,
        state_ref: Some("factory-root"),
        coordinator_state_ref: Some("factory-root"),
        watch_coordinator_state_ref: None,
    });
    wait(root_port);
    initial_planner.wait_for_connections(2);
    for _ in 0..100 {
        if marker.exists() {
            break;
        }
        std::thread::sleep(Duration::from_millis(25));
    }
    assert!(
        marker.exists(),
        "factory root never sealed its real C++ coordinator record"
    );
    let _ = root.kill();
    let _ = root.wait();
    let _ = target.kill();
    let _ = target.wait();
    initial_planner.stop();
    root_db.restart();
    target_db.restart();

    let watch_terminalized = marker_dir.path().join("target-watch-terminalized");
    let recovered_root_port = port();
    let recovered_plan = placement_proto::ListenForPlanResponse::decode(
        URL_SAFE_NO_PAD
            .decode(legacy_plan_for(&[
                ("factory-root", recovered_root_port),
                ("target", target_port),
            ]))
            .unwrap()
            .as_slice(),
    )
    .unwrap();
    let recovered_planner = LivePlannerServer::start(&runtime, recovered_plan);
    target = spawn_live_host(LiveHostOptions {
        binary: &binary,
        role: "target",
        port: target_port,
        database: &target_db.endpoint(),
        planner: &recovered_planner.endpoint,
        root_id,
        recover: true,
        invoke: false,
        factory_invoke: false,
        factory_target_invoke: false,
        expect_factory_declared_error: false,
        marker: None,
        watch_terminalized: Some(&watch_terminalized),
        state_ref: None,
        coordinator_state_ref: Some("target"),
        watch_coordinator_state_ref: Some("factory-root"),
    });
    wait(target_port);
    recovered_planner.wait_for_connections(1);
    root = spawn_live_host(LiveHostOptions {
        binary: &binary,
        role: "root",
        port: recovered_root_port,
        database: &root_db.endpoint(),
        planner: &recovered_planner.endpoint,
        root_id,
        recover: true,
        invoke: false,
        factory_invoke: false,
        factory_target_invoke: false,
        expect_factory_declared_error: false,
        marker: None,
        watch_terminalized: None,
        state_ref: Some("factory-root"),
        coordinator_state_ref: Some("factory-root"),
        watch_coordinator_state_ref: Some("factory-root"),
    });
    wait(recovered_root_port);
    recovered_planner.wait_for_connections(2);
    for _ in 0..100 {
        if watch_terminalized.exists() {
            break;
        }
        std::thread::sleep(Duration::from_millis(25));
    }
    assert!(
        watch_terminalized.exists(),
        "target did not Watch the factory-root decision and terminalize"
    );
    for _ in 0..100 {
        if runtime.block_on(load_state(&root_db.endpoint(), "factory-root"))
            == Some(vec![0x08, 0x07])
            && runtime.block_on(load_state(&target_db.endpoint(), "target"))
                == Some(vec![0x08, 0x0c])
        {
            break;
        }
        std::thread::sleep(Duration::from_millis(25));
    }
    assert_eq!(
        runtime.block_on(load_state(&root_db.endpoint(), "factory-root")),
        Some(vec![0x08, 0x07])
    );
    assert_eq!(
        runtime.block_on(load_state(&target_db.endpoint(), "target")),
        Some(vec![0x08, 0x0c])
    );
    let _ = root.kill();
    let _ = root.wait();
    let _ = target.kill();
    let _ = target.wait();
    recovered_planner.stop();
}

#[test]
#[ignore = "requires REBOOT_NATIVE2PC_CXX_DATABASE=path/to/bazel-bin/reboot/server/database"]
fn generated_legacy_root_recovers_two_remote_participants_through_live_placement_planner() {
    let database_binary =
        std::env::var("REBOOT_NATIVE2PC_CXX_DATABASE").expect("Bazel //reboot/server:database");
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
    let mut root_db = CxxDatabase::start(database_binary.clone());
    let mut target_a_db = CxxDatabase::start(database_binary.clone());
    let mut target_b_db = CxxDatabase::start(database_binary);
    let runtime = tokio::runtime::Runtime::new().unwrap();
    for (database, state_ref) in [
        (&root_db, "multi-root"),
        (&target_a_db, "target-a"),
        (&target_b_db, "target-b"),
    ] {
        runtime.block_on(store_counter(&database.endpoint(), state_ref, 0));
    }

    let root_port = port();
    let target_a_port = port();
    let target_b_port = port();
    let root_id = "00000000-0000-0000-0000-000000000006";
    let initial_plan = placement_proto::ListenForPlanResponse::decode(
        URL_SAFE_NO_PAD
            .decode(legacy_plan_for(&[
                ("multi-root", root_port),
                ("target-a", target_a_port),
                ("target-b", target_b_port),
            ]))
            .unwrap()
            .as_slice(),
    )
    .unwrap();
    let initial_planner = LivePlannerServer::start(&runtime, initial_plan);
    let marker_dir = tempfile::tempdir().unwrap();
    let sealed = marker_dir.path().join("sealed");
    let mut target_a = spawn_live_host(LiveHostOptions {
        binary: &binary,
        role: "target",
        port: target_a_port,
        database: &target_a_db.endpoint(),
        planner: &initial_planner.endpoint,
        root_id,
        recover: false,
        invoke: false,
        factory_invoke: false,
        factory_target_invoke: false,
        expect_factory_declared_error: false,
        marker: None,
        watch_terminalized: None,
        state_ref: Some("target-a"),
        coordinator_state_ref: Some("target-a"),
        watch_coordinator_state_ref: None,
    });
    let mut target_b = spawn_live_host(LiveHostOptions {
        binary: &binary,
        role: "target",
        port: target_b_port,
        database: &target_b_db.endpoint(),
        planner: &initial_planner.endpoint,
        root_id,
        recover: false,
        invoke: false,
        factory_invoke: false,
        factory_target_invoke: false,
        expect_factory_declared_error: false,
        marker: None,
        watch_terminalized: None,
        state_ref: Some("target-b"),
        coordinator_state_ref: Some("target-b"),
        watch_coordinator_state_ref: None,
    });
    wait(target_a_port);
    wait(target_b_port);
    let mut root = spawn_live_host(LiveHostOptions {
        binary: &binary,
        role: "multi-root",
        port: root_port,
        database: &root_db.endpoint(),
        planner: &initial_planner.endpoint,
        root_id,
        recover: false,
        invoke: true,
        factory_invoke: false,
        factory_target_invoke: false,
        expect_factory_declared_error: false,
        marker: Some(&sealed),
        watch_terminalized: None,
        state_ref: Some("multi-root"),
        coordinator_state_ref: Some("multi-root"),
        watch_coordinator_state_ref: None,
    });
    wait(root_port);
    initial_planner.wait_for_connections(3);
    for _ in 0..100 {
        if sealed.exists() {
            break;
        }
        std::thread::sleep(Duration::from_millis(25));
    }
    assert!(
        sealed.exists(),
        "root never sealed the two-participant decision"
    );
    let _ = root.kill();
    let _ = root.wait();
    let _ = target_a.kill();
    let _ = target_a.wait();
    let _ = target_b.kill();
    let _ = target_b.wait();
    initial_planner.stop();
    root_db.restart();
    target_a_db.restart();
    target_b_db.restart();

    let recovered_root_port = port();
    let recovered_plan = placement_proto::ListenForPlanResponse::decode(
        URL_SAFE_NO_PAD
            .decode(legacy_plan_for(&[
                ("multi-root", recovered_root_port),
                ("target-a", target_a_port),
                ("target-b", target_b_port),
            ]))
            .unwrap()
            .as_slice(),
    )
    .unwrap();
    let recovered_planner = LivePlannerServer::start(&runtime, recovered_plan);
    let target_a_terminalized = marker_dir.path().join("target-a-watch-terminalized");
    let target_b_terminalized = marker_dir.path().join("target-b-watch-terminalized");
    target_a = spawn_live_host(LiveHostOptions {
        binary: &binary,
        role: "target",
        port: target_a_port,
        database: &target_a_db.endpoint(),
        planner: &recovered_planner.endpoint,
        root_id,
        recover: true,
        invoke: false,
        factory_invoke: false,
        factory_target_invoke: false,
        expect_factory_declared_error: false,
        marker: None,
        watch_terminalized: Some(&target_a_terminalized),
        state_ref: Some("target-a"),
        coordinator_state_ref: Some("target-a"),
        watch_coordinator_state_ref: Some("multi-root"),
    });
    target_b = spawn_live_host(LiveHostOptions {
        binary: &binary,
        role: "target",
        port: target_b_port,
        database: &target_b_db.endpoint(),
        planner: &recovered_planner.endpoint,
        root_id,
        recover: true,
        invoke: false,
        factory_invoke: false,
        factory_target_invoke: false,
        expect_factory_declared_error: false,
        marker: None,
        watch_terminalized: Some(&target_b_terminalized),
        state_ref: Some("target-b"),
        coordinator_state_ref: Some("target-b"),
        watch_coordinator_state_ref: Some("multi-root"),
    });
    wait(target_a_port);
    wait(target_b_port);
    root = spawn_live_host(LiveHostOptions {
        binary: &binary,
        role: "multi-root",
        port: recovered_root_port,
        database: &root_db.endpoint(),
        planner: &recovered_planner.endpoint,
        root_id,
        recover: true,
        invoke: false,
        factory_invoke: false,
        factory_target_invoke: false,
        expect_factory_declared_error: false,
        marker: None,
        watch_terminalized: None,
        state_ref: Some("multi-root"),
        coordinator_state_ref: Some("multi-root"),
        watch_coordinator_state_ref: Some("multi-root"),
    });
    wait(recovered_root_port);
    recovered_planner.wait_for_connections(3);
    for _ in 0..100 {
        if target_a_terminalized.exists() && target_b_terminalized.exists() {
            break;
        }
        std::thread::sleep(Duration::from_millis(25));
    }
    for marker in [&target_a_terminalized, &target_b_terminalized] {
        assert_eq!(
            std::fs::read(marker).unwrap(),
            b"watch-terminalized\n",
            "each recovered participant must terminalize exactly once after Watch"
        );
    }
    for _ in 0..100 {
        if runtime.block_on(load_state(&root_db.endpoint(), "multi-root")) == Some(vec![0x08, 0x07])
            && runtime.block_on(load_state(&target_a_db.endpoint(), "target-a"))
                == Some(vec![0x08, 0x07])
            && runtime.block_on(load_state(&target_b_db.endpoint(), "target-b"))
                == Some(vec![0x08, 0x07])
        {
            break;
        }
        std::thread::sleep(Duration::from_millis(25));
    }
    assert_eq!(
        runtime.block_on(load_state(&root_db.endpoint(), "multi-root")),
        Some(vec![0x08, 0x07])
    );
    assert_eq!(
        runtime.block_on(load_state(&target_a_db.endpoint(), "target-a")),
        Some(vec![0x08, 0x07])
    );
    assert_eq!(
        runtime.block_on(load_state(&target_b_db.endpoint(), "target-b")),
        Some(vec![0x08, 0x07])
    );
    let _ = root.kill();
    let _ = root.wait();
    let _ = target_a.kill();
    let _ = target_a.wait();
    let _ = target_b.kill();
    let _ = target_b.wait();
    recovered_planner.stop();
}

fn factory_target_root_host(
    binary: &std::path::Path,
    database: &str,
    root_port: u16,
    target_port: u16,
    root_id: &str,
    state_ref: &str,
    marker: &std::path::Path,
) -> Child {
    let plan = legacy_plan_for(&[(state_ref, root_port), ("target", target_port)]);
    let mut command = Command::new(binary);
    command
        .args([
            "--role",
            "root",
            "--listen",
            &format!("127.0.0.1:{root_port}"),
            "--database",
            database,
            "--legacy-placement-plan",
            &plan,
            "--root-id",
            root_id,
            "--state-ref",
            state_ref,
            "--coordinator-state-ref",
            state_ref,
            "--invoke",
            "--factory-target-invoke",
            "--amount",
            "7",
        ])
        .env("REBOOT_TEST_PAUSE_AFTER_COORDINATOR_PREPARE", marker)
        .stdout(Stdio::inherit())
        .stderr(Stdio::inherit())
        .spawn()
        .unwrap()
}

fn factory_target_host(
    binary: &std::path::Path,
    database: &str,
    root_port: u16,
    target_port: u16,
    state_ref: &str,
    amount: i64,
) -> std::process::ExitStatus {
    let plan = legacy_plan_for(&[(state_ref, root_port), ("target", target_port)]);
    Command::new(binary)
        .args([
            "--role",
            "root",
            "--listen",
            &format!("127.0.0.1:{root_port}"),
            "--database",
            database,
            "--legacy-placement-plan",
            &plan,
            "--root-id",
            "00000000-0000-0000-0000-000000000004",
            "--state-ref",
            state_ref,
            "--invoke",
            "--factory-target-invoke",
            "--exit-after-invoke",
            "--amount",
            &amount.to_string(),
        ])
        .status()
        .unwrap()
}

fn factory_host(
    binary: &std::path::Path,
    database: &str,
    state_ref: &str,
    amount: i64,
) -> std::process::ExitStatus {
    let listen = port();
    let plan = legacy_plan_for(&[(state_ref, listen)]);
    Command::new(binary)
        .args([
            "--role",
            "root",
            "--listen",
            &format!("127.0.0.1:{listen}"),
            "--database",
            database,
            "--legacy-placement-plan",
            &plan,
            "--root-id",
            "00000000-0000-0000-0000-000000000003",
            "--state-ref",
            state_ref,
            "--invoke",
            "--factory-invoke",
            "--exit-after-invoke",
            "--amount",
            &amount.to_string(),
        ])
        .status()
        .unwrap()
}

async fn load_state(endpoint: &str, state_ref: &str) -> Option<Vec<u8>> {
    database::database_client::DatabaseClient::connect(endpoint.to_owned())
        .await
        .unwrap()
        .load(database::LoadRequest {
            actors: vec![database::Actor {
                state_type: "tests.reboot.protoc.TransactionCounter".into(),
                state_ref: state_ref.into(),
                state: None,
            }],
            task_ids: vec![],
        })
        .await
        .unwrap()
        .into_inner()
        .actors
        .into_iter()
        .next()
        .and_then(|actor| actor.state)
}

async fn store_counter(endpoint: &str, state_ref: &str, value: i64) {
    database::database_client::DatabaseClient::connect(endpoint.to_owned())
        .await
        .unwrap()
        .store(database::StoreRequest {
            actor_upserts: vec![database::Actor {
                state_type: "tests.reboot.protoc.TransactionCounter".into(),
                state_ref: state_ref.into(),
                state: Some(vec![0x08, value as u8]),
            }],
            task_upserts: vec![],
            colocated_upserts: vec![],
            transaction: None,
            idempotent_mutation: None,
            ensure_state_types_created: vec![],
            sync: true,
        })
        .await
        .unwrap();
}

async fn recover_idempotent_mutations(
    endpoint: &str,
    state_ref: &str,
    key: Uuid,
) -> Vec<database::IdempotentMutation> {
    let mut stream = database::database_client::DatabaseClient::connect(endpoint.to_owned())
        .await
        .unwrap()
        .recover_idempotent_mutations(database::RecoverIdempotentMutationsRequest {
            state_type: "tests.reboot.protoc.TransactionCounter".into(),
            state_ref: state_ref.into(),
            idempotency_key: Some(key.as_bytes().to_vec()),
            workflow_id: None,
            workflow_iteration: None,
        })
        .await
        .unwrap()
        .into_inner();
    let mut mutations = Vec::new();
    while let Some(response) = stream.message().await.unwrap() {
        mutations.extend(response.idempotent_mutations);
    }
    mutations
}

async fn load_external_constructor_state(endpoint: &str, state_ref: &str) -> Option<Vec<u8>> {
    database::database_client::DatabaseClient::connect(endpoint.to_owned())
        .await
        .unwrap()
        .load(database::LoadRequest {
            actors: vec![database::Actor {
                state_type: "tests.reboot.protoc.ExternalConstructorCounter".into(),
                state_ref: state_ref.into(),
                state: None,
            }],
            task_ids: vec![],
        })
        .await
        .unwrap()
        .into_inner()
        .actors
        .into_iter()
        .next()
        .and_then(|actor| actor.state)
}

async fn recover_external_constructor_idempotency(
    endpoint: &str,
    state_ref: &str,
    key: Uuid,
) -> Vec<database::IdempotentMutation> {
    let mut stream = database::database_client::DatabaseClient::connect(endpoint.to_owned())
        .await
        .unwrap()
        .recover_idempotent_mutations(database::RecoverIdempotentMutationsRequest {
            state_type: "tests.reboot.protoc.ExternalConstructorCounter".into(),
            state_ref: state_ref.into(),
            idempotency_key: Some(key.as_bytes().to_vec()),
            workflow_id: None,
            workflow_iteration: None,
        })
        .await
        .unwrap()
        .into_inner();
    let mut mutations = Vec::new();
    while let Some(response) = stream.message().await.unwrap() {
        mutations.extend(response.idempotent_mutations);
    }
    mutations
}
