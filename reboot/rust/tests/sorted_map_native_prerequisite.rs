#![allow(clippy::result_large_err)]
#[tokio::test]
#[ignore = "requires real C++ Database/RocksDB and generated downstream fixture"]
async fn generated_app_root_coupled_prerequisite() {
    let native =
        Native::start(std::env::var("REBOOT_NATIVE2PC_CXX_DATABASE").expect("native path"));
    let parent = StateRef::from_id(MAP, "loop5-generated-app-map")
        .unwrap()
        .to_string();
    let fixture =
        std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/sorted_map_app");
    let build = Command::new("cargo")
        .current_dir(&fixture)
        .args(["build", "--locked", "--offline"])
        .output()
        .unwrap();
    assert!(
        build.status.success(),
        "{}",
        String::from_utf8_lossy(&build.stderr)
    );
    let target = std::env::var_os("CARGO_TARGET_DIR")
        .map(std::path::PathBuf::from)
        .unwrap_or_else(|| fixture.join("target"));
    let binary = target.join("debug/generated-sorted-map-prerequisite-app");
    let output = Command::new(&binary)
        .arg(native.endpoint())
        .arg(&parent)
        .output()
        .unwrap();
    assert!(
        output.status.success(),
        "stdout={} stderr={}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );
    println!("{}", String::from_utf8_lossy(&output.stdout));
    if let Ok(path) = std::env::var("SORTED_MAP_APP_EVIDENCE") {
        std::fs::write(path, serde_json::to_vec_pretty(&serde_json::json!({"complete":true,"scope":"generated canonical map constructor + admitted same-host fresh app root; NOT network inbound/nested/sibling parity", "generated_app_constructor":true,"generated_app_coordinator_two_actor_commit":true,"generated_app_root_abort_restores_both":true,"range_first":true,"read_own_writes":true,"map_fixture_native_initialization":false,"generated_map_constructor":true,"empty_constructor_entry_cf":true,"constructor_replay":true,"constructor_duplicate_rejection":true,"caught_declared_map_error_dooms_root":true,"stale_root_provenance_rejected":true,"binary":binary,"native_pid":native.child.id(),"stdout":String::from_utf8_lossy(&output.stdout)})).unwrap()).unwrap();
    }
}

// Exercised coupled prerequisite, not generated Reboot builtin acceptance.
// Canonical Tonic clients exercise scoped map calls; actor initialization below
// is fixture setup, NEVER claimed as a public generated constructor.
use prost::Message;
use reboot_rust_schema::{
    database_proto as db,
    durable_coordinator::{
        DurableRootCoordinator, InProcessParticipantEndpoint, ParticipantResolver,
        ParticipantTarget, RootCoordinatorStart, TonicCoordinatorSidecar,
    },
    durable_participant::{
        ActorTransactionStart, DurableActorParticipant, DurableActorParticipantHost,
        ParticipantRecovery, ParticipantStartMode, PendingActorEffects, StartedLocalTransaction,
        TonicParticipantSidecar, TransactionPathContract,
    },
    runtime::TransactionMode,
    sorted_map_proto as map,
    state_ref::StateRef,
};
use std::{
    collections::BTreeMap,
    future::Future,
    pin::Pin,
    process::{Child, Command, Stdio},
    sync::Arc,
    time::Duration,
};
use tonic::{Request, Response, Status};
use uuid::Uuid;
include!("fixtures/sorted_map_lost_ack.rs");
const MAP: &str = "rbt.std.collections.v1.SortedMap";
const ENTRY: &str = "rbt.std.collections.v1.SortedMapEntry";
const APP: &str = "tests.reboot.protoc.Counter";
struct Native {
    child: Child,
    state: tempfile::TempDir,
    port: u16,
    binary: String,
}
impl Native {
    fn start(binary: String) -> Self {
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        drop(listener);
        let state = tempfile::tempdir().unwrap();
        std::fs::write(
            state.path().join("server-info.pb"),
            db::ServerInfo {
                shard_infos: vec![db::ShardInfo {
                    shard_id: "s000000000".into(),
                    shard_first_key: vec![],
                }],
            }
            .encode_to_vec(),
        )
        .unwrap();
        let child = Self::spawn(&binary, state.path(), port);
        let native = Self {
            child,
            state,
            port,
            binary,
        };
        native.wait();
        native
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
    fn wait(&self) {
        for _ in 0..200 {
            if std::net::TcpStream::connect(("127.0.0.1", self.port)).is_ok() {
                return;
            }
            std::thread::sleep(Duration::from_millis(10));
        }
        panic!("native Database did not listen");
    }
    fn endpoint(&self) -> String {
        format!("http://127.0.0.1:{}", self.port)
    }
    fn restart(&mut self) {
        self.child.kill().unwrap();
        self.child.wait().unwrap();
        self.child = Self::spawn(&self.binary, self.state.path(), self.port);
        self.wait();
    }
}
impl Drop for Native {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

// Scope is installed by fixture host, not synthesized from request headers.
// Not a production auth/placement/construction adapter.
struct ScopedMap {
    guard: Arc<StartedLocalTransaction<TonicParticipantSidecar>>,
}
#[tonic::async_trait]
impl map::sorted_map_methods_server::SortedMapMethods for ScopedMap {
    async fn insert(
        &self,
        r: Request<map::InsertRequest>,
    ) -> Result<Response<map::InsertResponse>, Status> {
        self.guard
            .sorted_map_insert(r.into_inner())
            .await
            .map(Response::new)
    }
    async fn remove(
        &self,
        r: Request<map::RemoveRequest>,
    ) -> Result<Response<map::RemoveResponse>, Status> {
        self.guard
            .sorted_map_remove(r.into_inner())
            .await
            .map(Response::new)
    }
    async fn get(&self, r: Request<map::GetRequest>) -> Result<Response<map::GetResponse>, Status> {
        self.guard
            .sorted_map_get(r.into_inner())
            .await
            .map(Response::new)
    }
    async fn range(
        &self,
        r: Request<map::RangeRequest>,
    ) -> Result<Response<map::RangeResponse>, Status> {
        self.guard
            .sorted_map_range(r.into_inner())
            .await
            .map(Response::new)
    }
    async fn reverse_range(
        &self,
        r: Request<map::ReverseRangeRequest>,
    ) -> Result<Response<map::ReverseRangeResponse>, Status> {
        self.guard
            .sorted_map_reverse_range(r.into_inner())
            .await
            .map(Response::new)
    }
}
struct Routes {
    entries:
        BTreeMap<ParticipantTarget, Arc<InProcessParticipantEndpoint<TonicParticipantSidecar>>>,
}
impl ParticipantResolver for Routes {
    type Endpoint = InProcessParticipantEndpoint<TonicParticipantSidecar>;
    fn resolve(
        &self,
        target: &ParticipantTarget,
    ) -> Pin<Box<dyn Future<Output = Result<Arc<Self::Endpoint>, Status>> + Send + '_>> {
        let result = self
            .entries
            .get(target)
            .cloned()
            .ok_or_else(|| Status::failed_precondition("unregistered target"));
        Box::pin(async move { result })
    }
}
fn start(root: Uuid, ty: &str, reference: &str, app: &str) -> ActorTransactionStart {
    ActorTransactionStart {
        transaction_ids: vec![root],
        transaction_path: TransactionPathContract::RootOnly,
        coordinator_state_type: APP.into(),
        coordinator_state_ref: app.into(),
        mode: TransactionMode::Exclusive,
        read_only: false,
        factory: false,
        state_type: ty.into(),
        state_ref: reference.into(),
    }
}
async fn persisted(
    client: &mut db::database_client::DatabaseClient<tonic::transport::Channel>,
    app: &str,
    parent: &str,
) -> (Vec<u8>, Vec<Vec<u8>>) {
    let actors = client
        .load(db::LoadRequest {
            actors: vec![db::Actor {
                state_type: APP.into(),
                state_ref: app.into(),
                state: None,
            }],
            task_ids: vec![],
        })
        .await
        .unwrap()
        .into_inner()
        .actors;
    let rows = client
        .colocated_range(db::ColocatedRangeRequest {
            state_type: ENTRY.into(),
            parent_state_ref: parent.into(),
            start: None,
            end: None,
            limit: 100,
            transaction: None,
        })
        .await
        .unwrap()
        .into_inner();
    (actors[0].state.clone().unwrap(), rows.values)
}
async fn participant(
    endpoint: &str,
    ty: &str,
    reference: &str,
) -> DurableActorParticipant<TonicParticipantSidecar> {
    DurableActorParticipant::new(
        Arc::new(TonicParticipantSidecar::connect(endpoint).await.unwrap()),
        ty,
        reference,
    )
}

#[tokio::test]
#[ignore = "requires real C++ Database/RocksDB"]
async fn generated_wire_coupled_native_visibility_commit_abort_and_restart_fence() {
    let mut native =
        Native::start(std::env::var("REBOOT_NATIVE2PC_CXX_DATABASE").expect("native path"));
    let app = StateRef::from_id(APP, "loop5-app").unwrap().to_string();
    let parent = StateRef::from_id(MAP, "loop5-map").unwrap().to_string();
    let neighbor = StateRef::from_id(MAP, "loop5-map-neighbor")
        .unwrap()
        .to_string();
    let mut client = db::database_client::DatabaseClient::connect(native.endpoint())
        .await
        .unwrap();
    // Native fixture initialization is explicitly outside public-construction acceptance.
    client
        .store(db::StoreRequest {
            actor_upserts: vec![
                db::Actor {
                    state_type: APP.into(),
                    state_ref: app.clone(),
                    state: Some(vec![8, 1]),
                },
                db::Actor {
                    state_type: MAP.into(),
                    state_ref: parent.clone(),
                    state: Some(vec![]),
                },
                db::Actor {
                    state_type: MAP.into(),
                    state_ref: neighbor.clone(),
                    state: Some(vec![]),
                },
            ],
            ensure_state_types_created: vec![ENTRY.into()],
            sync: true,
            ..Default::default()
        })
        .await
        .unwrap();
    for abort in [false, true] {
        let root = Uuid::new_v4();
        let app_p = participant(&native.endpoint(), APP, &app).await;
        let map_p = participant(&native.endpoint(), MAP, &parent).await;
        let app_guard = app_p
            .start_local(
                start(root, APP, &app, &app),
                ParticipantStartMode::Exclusive,
            )
            .await
            .unwrap();
        let map_guard = Arc::new(
            map_p
                .start_local(
                    start(root, MAP, &parent, &app),
                    ParticipantStartMode::Exclusive,
                )
                .await
                .unwrap(),
        );
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let endpoint = format!("http://{}", listener.local_addr().unwrap());
        let (stop, stopped) = tokio::sync::oneshot::channel();
        let server_guard = map_guard.clone();
        let server = tokio::spawn(async move {
            tonic::transport::Server::builder()
                .add_service(map::sorted_map_methods_server::SortedMapMethodsServer::new(
                    ScopedMap {
                        guard: server_guard,
                    },
                ))
                .serve_with_incoming_shutdown(
                    tokio_stream::wrappers::TcpListenerStream::new(listener),
                    async {
                        let _ = stopped.await;
                    },
                )
                .await
                .unwrap();
        });
        let mut wire = map::sorted_map_methods_client::SortedMapMethodsClient::connect(endpoint)
            .await
            .unwrap();
        let baseline = persisted(&mut client, &app, &parent).await;
        // Range FIRST actually begins native participation before any insertion.
        wire.range(map::RangeRequest {
            start_key: None,
            end_key: None,
            limit: 10,
        })
        .await
        .unwrap();
        wire.insert(map::InsertRequest {
            entries: [
                ("a".into(), b"one".to_vec()),
                ("b".into(), vec![]),
                ("c".into(), b"three".to_vec()),
            ]
            .into(),
        })
        .await
        .unwrap();
        wire.insert(map::InsertRequest {
            entries: [("a".into(), b"overwritten".to_vec())].into(),
        })
        .await
        .unwrap();
        wire.remove(map::RemoveRequest {
            keys: vec!["c".into(), "missing".into()],
        })
        .await
        .unwrap();
        assert_eq!(
            wire.get(map::GetRequest { key: "b".into() })
                .await
                .unwrap()
                .into_inner()
                .value,
            Some(vec![])
        );
        assert_eq!(
            wire.get(map::GetRequest {
                key: "missing".into()
            })
            .await
            .unwrap()
            .into_inner()
            .value,
            None
        );
        let forward = wire
            .range(map::RangeRequest {
                start_key: Some("a".into()),
                end_key: Some("b".into()),
                limit: 1,
            })
            .await
            .unwrap()
            .into_inner();
        assert_eq!(
            forward.entries,
            vec![map::Entry {
                key: "a".into(),
                value: b"overwritten".to_vec()
            }]
        );
        let reverse = wire
            .reverse_range(map::ReverseRangeRequest {
                start_key: Some("b".into()),
                end_key: Some("a".into()),
                limit: 10,
            })
            .await
            .unwrap()
            .into_inner();
        assert_eq!(
            reverse.entries,
            vec![map::Entry {
                key: "b".into(),
                value: vec![]
            }]
        );
        assert!(
            !wire
                .range(map::RangeRequest {
                    limit: 0,
                    ..Default::default()
                })
                .await
                .unwrap_err()
                .details()
                .is_empty()
        );
        assert!(
            wire.insert(map::InsertRequest {
                entries: [("a/b".into(), vec![])].into()
            })
            .await
            .is_err()
        );
        assert_eq!(
            persisted(&mut client, &app, &parent).await,
            baseline,
            "uncommitted entries must be invisible externally"
        );
        app_guard
            .stage(PendingActorEffects {
                state: Some(vec![8, 2]),
                ..Default::default()
            })
            .await
            .unwrap();
        // Both exclusive and shared admissions remain fenced until real terminal ACK.
        let competing = map_p.clone();
        let later = start(Uuid::new_v4(), MAP, &parent, &app);
        let mut queued = tokio::spawn(async move {
            competing
                .start_local(later, ParticipantStartMode::Exclusive)
                .await
        });
        assert!(
            tokio::time::timeout(Duration::from_millis(30), &mut queued)
                .await
                .is_err()
        );
        if abort {
            app_p.abort(root).await.unwrap();
            map_p.abort(root).await.unwrap();
        } else {
            let app_target = ParticipantTarget {
                state_type: APP.into(),
                state_ref: app.clone(),
            };
            let map_target = ParticipantTarget {
                state_type: MAP.into(),
                state_ref: parent.clone(),
            };
            let routes = Routes {
                entries: [
                    (
                        app_target.clone(),
                        Arc::new(InProcessParticipantEndpoint::new(
                            DurableActorParticipantHost::new(app_p.clone()),
                        )),
                    ),
                    (
                        map_target.clone(),
                        Arc::new(InProcessParticipantEndpoint::new(
                            DurableActorParticipantHost::new(map_p.clone()),
                        )),
                    ),
                ]
                .into(),
            };
            let coordinator = DurableRootCoordinator::new(
                Arc::new(
                    TonicCoordinatorSidecar::connect(native.endpoint())
                        .await
                        .unwrap(),
                ),
                Arc::new(routes),
            );
            coordinator
                .complete_with_returned_participants(
                    RootCoordinatorStart {
                        transaction_ids: vec![root],
                        coordinator_state_type: APP.into(),
                        coordinator_state_ref: app.clone(),
                        participant: app_target,
                        mode: TransactionMode::Exclusive,
                        read_only: false,
                        factory: false,
                        placement_requested: false,
                    },
                    vec![map_target],
                )
                .await
                .unwrap();
        }
        let queued_guard = tokio::time::timeout(Duration::from_secs(2), queued)
            .await
            .unwrap()
            .unwrap()
            .unwrap();
        drop(queued_guard);
        stop.send(()).unwrap();
        server.await.unwrap();
        drop(map_guard);
        drop(app_guard);
        let after = persisted(&mut client, &app, &parent).await;
        if abort {
            assert_eq!(after, baseline);
        } else {
            assert_eq!(after, (vec![8, 2], vec![b"overwritten".to_vec(), vec![]]));
        }
        let rows = client
            .colocated_range(db::ColocatedRangeRequest {
                state_type: ENTRY.into(),
                parent_state_ref: neighbor.clone(),
                limit: 100,
                ..Default::default()
            })
            .await
            .unwrap()
            .into_inner();
        assert!(rows.keys.is_empty());
    }
    // Real restart after an ACKed early write. Recover unprepared ownership and abort,
    // never recreate a vanished early transaction during Prepare.
    let root = Uuid::new_v4();
    let p = participant(&native.endpoint(), MAP, &parent).await;
    let guard = p
        .start_local(
            start(root, MAP, &parent, &app),
            ParticipantStartMode::Exclusive,
        )
        .await
        .unwrap();
    guard
        .sorted_map_insert(map::InsertRequest {
            entries: [("z".into(), b"lost-on-abort".to_vec())].into(),
        })
        .await
        .unwrap();
    drop(guard);
    tokio::time::sleep(Duration::from_millis(30)).await;
    let mut blocked = Box::pin(p.start_local(
        start(Uuid::new_v4(), MAP, &parent, &app),
        ParticipantStartMode::Exclusive,
    ));
    assert!(
        tokio::time::timeout(Duration::from_millis(30), &mut blocked)
            .await
            .is_err()
    );
    drop(blocked);
    drop(p);
    native.restart();
    let p = participant(&native.endpoint(), MAP, &parent).await;
    p.recover(ParticipantRecovery {
        state_tags_by_state_type: [
            (
                MAP.into(),
                reboot_rust_schema::state_ref::state_type_tag_for_name(MAP),
            ),
            (
                APP.into(),
                reboot_rust_schema::state_ref::state_type_tag_for_name(APP),
            ),
        ]
        .into(),
        shard_ids: vec!["s000000000".into()],
    })
    .await
    .unwrap();
    p.abort(root).await.unwrap();
    client = db::database_client::DatabaseClient::connect(native.endpoint())
        .await
        .unwrap();
    assert_eq!(
        persisted(&mut client, &app, &parent).await,
        (vec![8, 2], vec![b"overwritten".to_vec(), vec![]])
    );
    if let Ok(path) = std::env::var("SORTED_MAP_EVIDENCE") {
        std::fs::write(path,serde_json::to_vec_pretty(&serde_json::json!({"complete":true,"scope":"coupled early-visibility prerequisite; NOT generated builtin/constructor acceptance","native_pid":native.child.id(),"range_first":true,"read_own_writes":true,"coordinator_commit_two_actors":true,"explicit_both_participant_abort":true,"restart_unprepared_abort":true,"fixture_native_initialization":true})).unwrap()).unwrap();
    }
}
