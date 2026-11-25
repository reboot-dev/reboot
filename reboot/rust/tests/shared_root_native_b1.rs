//! B1 actor-only controls against the canonical C++ Database, not a modeled DB.
//! Fixture Store/Load/Recover are test setup/inspection, not application APIs.
//! Run explicitly with REBOOT_NATIVE2PC_CXX_DATABASE and --ignored.
#![allow(clippy::result_large_err)]

use prost::Message;
use reboot_rust_schema::{
    database_proto as db,
    durable_participant::{
        ActorTransactionStart, DurableActorParticipant, DurableActorParticipantHost,
        ParticipantSidecar, ParticipantStartMode, PendingActorEffects, TonicParticipantSidecar,
        TransactionPathContract,
    },
    runtime::TransactionMode,
    state_ref::{StateRef, state_type_tag_for_name},
};
use std::{
    future::Future,
    pin::Pin,
    process::{Child, Command, Stdio},
    sync::{
        Arc, Mutex,
        atomic::{AtomicU8, Ordering},
    },
    time::Duration,
};
use tonic::{Code, Request, Response, Status};
use uuid::Uuid;

const TYPE: &str = "tests.reboot.protoc.Counter";
const INITIAL: &[u8] = &[8, 1];
const FINAL: &[u8] = &[8, 2];
type Rpc<'a, T> = Pin<Box<dyn Future<Output = Result<T, Status>> + Send + 'a>>;
type Actor = DurableActorParticipant<NativeBoundary>;

struct Native {
    child: Child,
    _state: tempfile::TempDir,
    endpoint: String,
}
impl Native {
    fn start() -> Self {
        let binary = std::env::var("REBOOT_NATIVE2PC_CXX_DATABASE")
            .expect("set canonical C++ Database executable path");
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
        let child = Command::new(binary)
            .arg(state.path().join("rocksdb"))
            .arg(state.path().join("server-info.pb"))
            .arg(port.to_string())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .unwrap();
        // Install RAII before readiness assertions, including panic paths.
        let mut native = Self {
            child,
            _state: state,
            endpoint: format!("http://127.0.0.1:{port}"),
        };
        for _ in 0..200 {
            if std::net::TcpStream::connect(("127.0.0.1", port)).is_ok() {
                return native;
            }
            assert!(
                native.child.try_wait().unwrap().is_none(),
                "native Database exited during startup"
            );
            std::thread::sleep(Duration::from_millis(10));
        }
        panic!("native Database did not listen");
    }
}
impl Drop for Native {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

// Faults are applied ONLY AFTER inner real native RPC returns success.
// No synthetic success, transaction, state, or retry response is produced.
const NO_FAULT: u8 = 0;
const LOSE_PREPARE: u8 = 1;
const PARK_PREPARE: u8 = 2;
const LOSE_COMMIT: u8 = 3;
const LOSE_ABORT: u8 = 4;
#[derive(Clone, Debug, PartialEq, Eq)]
struct Event {
    verb: &'static str,
    result: Result<(), Code>,
}
struct NativeBoundary {
    inner: TonicParticipantSidecar,
    fault: AtomicU8,
    applied_prepare: tokio::sync::Notify,
    events: Mutex<Vec<Event>>,
}
impl NativeBoundary {
    fn events(&self) -> Vec<Event> {
        self.events.lock().unwrap().clone()
    }
    fn record<T>(&self, verb: &'static str, result: &Result<T, Status>) {
        self.events.lock().unwrap().push(Event {
            verb,
            result: result.as_ref().map(|_| ()).map_err(|e| e.code()),
        });
    }
    fn take_fault(&self, fault: u8) -> bool {
        self.fault
            .compare_exchange(fault, NO_FAULT, Ordering::SeqCst, Ordering::SeqCst)
            .is_ok()
    }
}
impl ParticipantSidecar for NativeBoundary {
    fn database_endpoint(&self) -> Option<&str> {
        self.inner.database_endpoint()
    }
    fn load(&self, r: db::LoadRequest) -> Rpc<'_, db::LoadResponse> {
        self.inner.load(r)
    }
    fn prepare(
        &self,
        r: db::TransactionParticipantPrepareRequest,
    ) -> Rpc<'_, db::TransactionParticipantPrepareResponse> {
        Box::pin(async move {
            let result = self.inner.prepare(r).await;
            self.record("prepare", &result);
            let response = result?;
            if self.take_fault(LOSE_PREPARE) {
                return Err(Status::unavailable("real native Prepare ACK discarded"));
            }
            if self.take_fault(PARK_PREPARE) {
                self.applied_prepare.notify_one();
                // The public host Prepare future is actually dropped while
                // holding this already-applied real native response.
                std::future::pending::<()>().await;
            }
            Ok(response)
        })
    }
    fn commit(
        &self,
        r: db::TransactionParticipantCommitRequest,
    ) -> Rpc<'_, db::TransactionParticipantCommitResponse> {
        Box::pin(async move {
            let result = self.inner.commit(r).await;
            self.record("commit", &result);
            let response = result?;
            if self.take_fault(LOSE_COMMIT) {
                return Err(Status::unavailable("real native Commit ACK discarded"));
            }
            Ok(response)
        })
    }
    fn abort(
        &self,
        r: db::TransactionParticipantAbortRequest,
    ) -> Rpc<'_, db::TransactionParticipantAbortResponse> {
        Box::pin(async move {
            let result = self.inner.abort(r).await;
            self.record("abort", &result);
            let response = result?;
            if self.take_fault(LOSE_ABORT) {
                return Err(Status::unavailable("real native Abort ACK discarded"));
            }
            Ok(response)
        })
    }
    fn recover(&self, r: db::RecoverRequest) -> Rpc<'_, Vec<db::RecoverResponse>> {
        self.inner.recover(r)
    }
    fn recover_idempotent_mutations(
        &self,
        r: db::RecoverIdempotentMutationsRequest,
    ) -> Rpc<'_, Vec<db::RecoverIdempotentMutationsResponse>> {
        self.inner.recover_idempotent_mutations(r)
    }
}

struct Fixture {
    native: Native,
    reference: String,
    boundary: Arc<NativeBoundary>,
    actor: Actor,
}
impl Fixture {
    async fn new() -> Self {
        let native = Native::start();
        let reference = StateRef::from_id(TYPE, "shared-root-native-b1")
            .unwrap()
            .to_string();
        let mut client = db::database_client::DatabaseClient::connect(native.endpoint.clone())
            .await
            .unwrap();
        client
            .store(db::StoreRequest {
                actor_upserts: vec![db::Actor {
                    state_type: TYPE.into(),
                    state_ref: reference.clone(),
                    state: Some(INITIAL.to_vec()),
                }],
                sync: true,
                ..Default::default()
            })
            .await
            .unwrap();
        let boundary = Arc::new(NativeBoundary {
            inner: TonicParticipantSidecar::connect(&native.endpoint)
                .await
                .unwrap(),
            fault: AtomicU8::new(NO_FAULT),
            applied_prepare: tokio::sync::Notify::new(),
            events: Mutex::new(vec![]),
        });
        let actor = DurableActorParticipant::new(boundary.clone(), TYPE, reference.clone());
        Self {
            native,
            reference,
            boundary,
            actor,
        }
    }
    fn start(&self, root: Uuid, shared: bool) -> ActorTransactionStart {
        ActorTransactionStart {
            transaction_ids: vec![root],
            transaction_path: TransactionPathContract::RootOnly,
            coordinator_state_type: TYPE.into(),
            coordinator_state_ref: self.reference.clone(),
            state_type: TYPE.into(),
            state_ref: self.reference.clone(),
            mode: if shared {
                TransactionMode::Shared
            } else {
                TransactionMode::Exclusive
            },
            read_only: false,
            factory: false,
        }
    }
    async fn admit(&self, root: Uuid) {
        assert_eq!(
            self.actor
                .start_with_mode(
                    self.start(root, true),
                    ParticipantStartMode::SharedUpgradeable
                )
                .await
                .unwrap(),
            Some(INITIAL.to_vec())
        );
    }
    async fn state(&self) -> Vec<u8> {
        let mut client = db::database_client::DatabaseClient::connect(self.native.endpoint.clone())
            .await
            .unwrap();
        let result = client
            .load(db::LoadRequest {
                actors: vec![db::Actor {
                    state_type: TYPE.into(),
                    state_ref: self.reference.clone(),
                    state: None,
                }],
                task_ids: vec![],
            })
            .await
            .unwrap()
            .into_inner();
        assert_eq!(result.actors.len(), 1);
        result.actors[0].state.clone().unwrap()
    }
    async fn transactions(&self) -> Vec<db::Transaction> {
        self.boundary
            .recover(db::RecoverRequest {
                state_tags_by_state_type: [(TYPE.into(), state_type_tag_for_name(TYPE))].into(),
                shard_ids: vec!["s000000000".into()],
                skip_idempotent_mutations: true,
            })
            .await
            .unwrap()
            .into_iter()
            .flat_map(|r| r.participant_transactions)
            .collect()
    }
    async fn assert_prepared(&self, root: Uuid) {
        let txns = self.transactions().await;
        assert_eq!(txns.len(), 1, "exactly one native actor transaction");
        assert_eq!(txns[0].state_type, TYPE);
        assert_eq!(txns[0].state_ref, self.reference);
        assert_eq!(txns[0].transaction_ids, vec![root.as_bytes().to_vec()]);
        assert!(txns[0].prepared);
        assert_eq!(
            self.state().await,
            INITIAL,
            "prepared effects are not committed"
        );
    }
    // Shared FIRST: a queued exclusive probe must not manufacture exclusion.
    // Each timeout drops its actual admission future before native control.
    async fn assert_exclusive_retained(&self) {
        for mode in [
            ParticipantStartMode::SharedUpgradeable,
            ParticipantStartMode::Exclusive,
        ] {
            let future = self.actor.start_with_mode(
                self.start(
                    Uuid::new_v4(),
                    mode == ParticipantStartMode::SharedUpgradeable,
                ),
                mode,
            );
            assert!(
                tokio::time::timeout(Duration::from_millis(40), future)
                    .await
                    .is_err(),
                "native-owning slot must block {mode:?} admission"
            );
        }
    }
    async fn assert_readmission(&self, expected: &[u8]) {
        let root = Uuid::new_v4();
        let guard = tokio::time::timeout(
            Duration::from_secs(2),
            self.actor
                .start_local(self.start(root, false), ParticipantStartMode::Exclusive),
        )
        .await
        .unwrap()
        .unwrap();
        assert_eq!(guard.state(), Some(expected));
        // Seal execution before host/public control; unchanged effects are safe.
        guard
            .stage(PendingActorEffects {
                state: Some(expected.to_vec()),
                ..Default::default()
            })
            .await
            .unwrap();
        self.actor.abort(root).await.unwrap();
        drop(guard);
        assert!(self.transactions().await.is_empty());
        assert_eq!(self.state().await, expected);
    }
}

async fn prepare(f: &Fixture, root: Uuid, read_only: bool) -> Result<db::PrepareResponse, Status> {
    let host = DurableActorParticipantHost::new(f.actor.clone());
    let mut r = Request::new(db::PrepareRequest {
        transaction_id: root.as_bytes().to_vec(),
        abort_via_response: true,
        read_only_aware: read_only,
        read_only,
    });
    r.metadata_mut()
        .insert("x-reboot-state-ref", f.reference.parse().unwrap());
    db::participant_server::Participant::prepare(&host, r)
        .await
        .map(Response::into_inner)
}
async fn commit(f: &Fixture, root: Uuid) -> Result<(), Status> {
    let host = DurableActorParticipantHost::new(f.actor.clone());
    let mut r = Request::new(db::CommitRequest {
        transaction_id: root.as_bytes().to_vec(),
    });
    r.metadata_mut()
        .insert("x-reboot-state-ref", f.reference.parse().unwrap());
    db::participant_server::Participant::commit(&host, r)
        .await
        .map(|_| ())
}
async fn host_abort(f: &Fixture, root: Uuid) -> Result<(), Status> {
    let host = DurableActorParticipantHost::new(f.actor.clone());
    let mut r = Request::new(db::AbortRequest {
        transaction_id: root.as_bytes().to_vec(),
    });
    r.metadata_mut()
        .insert("x-reboot-state-ref", f.reference.parse().unwrap());
    db::participant_server::Participant::abort(&host, r)
        .await
        .map(|_| ())
}
fn final_effects() -> PendingActorEffects {
    PendingActorEffects {
        state: Some(FINAL.to_vec()),
        ..Default::default()
    }
}
fn success(verb: &'static str) -> Event {
    Event {
        verb,
        result: Ok(()),
    }
}

#[tokio::test]
#[ignore = "requires real canonical C++ Database/RocksDB"]
async fn native_b1_compat_prepare_b_abort_a_stale_controls_preserve_prepared_b() {
    let f = Fixture::new().await;
    let a = Uuid::new_v4();
    let b = Uuid::new_v4();
    f.admit(a).await;
    f.admit(b).await;
    for read_only in [false, true] {
        assert_eq!(
            prepare(&f, b, read_only).await.unwrap_err().code(),
            Code::FailedPrecondition
        );
    }
    assert_eq!(
        commit(&f, a).await.unwrap_err().code(),
        Code::FailedPrecondition
    );
    f.actor.abort(a).await.unwrap();
    assert!(
        f.boundary.events().is_empty(),
        "Abort(A) must be local-only"
    );
    assert!(f.transactions().await.is_empty());
    assert_eq!(f.state().await, INITIAL);
    // A lone shared root is still not exclusive authority.
    assert_eq!(
        prepare(&f, b, false).await.unwrap_err().code(),
        Code::FailedPrecondition
    );
    assert_eq!(
        commit(&f, b).await.unwrap_err().code(),
        Code::FailedPrecondition
    );
    assert!(f.actor.stage(b, final_effects()).await.unwrap().is_some());
    assert!(!prepare(&f, b, false).await.unwrap().abort);
    f.assert_prepared(b).await;
    f.assert_exclusive_retained().await;
    let mut waiting_a = Box::pin(
        f.actor
            .start_with_mode(f.start(a, true), ParticipantStartMode::SharedUpgradeable),
    );
    assert!(
        tokio::time::timeout(Duration::from_millis(40), &mut waiting_a)
            .await
            .is_err()
    );
    let before = f.boundary.events();
    f.actor.abort(a).await.unwrap();
    host_abort(&f, a).await.unwrap();
    commit(&f, a).await.unwrap();
    assert!(prepare(&f, a, false).await.unwrap().abort);
    assert_eq!(
        f.boundary.events(),
        before,
        "stale A controls cannot reach rootless native controls"
    );
    f.assert_prepared(b).await;
    drop(waiting_a);
    commit(&f, b).await.unwrap();
    assert_eq!(
        f.boundary.events(),
        vec![success("prepare"), success("commit")]
    );
    assert!(f.transactions().await.is_empty());
    assert_eq!(f.state().await, FINAL);
    f.assert_readmission(FINAL).await;
}

#[tokio::test]
#[ignore = "requires real canonical C++ Database/RocksDB"]
async fn native_b1_mixed_owner_compat_promotion_waits_for_exact_peer_release() {
    for owner_first in [false, true] {
        let f = Fixture::new().await;
        let c = Uuid::new_v4();
        let o = Uuid::new_v4();
        if !owner_first {
            f.admit(c).await;
        }
        let owner = f
            .actor
            .start_local(f.start(o, true), ParticipantStartMode::SharedUpgradeable)
            .await
            .unwrap();
        if owner_first {
            f.admit(c).await;
        }
        assert_eq!(
            prepare(&f, c, false).await.unwrap_err().code(),
            Code::FailedPrecondition
        );
        assert_eq!(
            commit(&f, c).await.unwrap_err().code(),
            Code::FailedPrecondition
        );
        f.actor.abort(c).await.unwrap();
        assert!(f.boundary.events().is_empty());
        f.admit(c).await;
        let mut promotion = Box::pin(f.actor.stage(c, final_effects()));
        assert!(
            tokio::time::timeout(Duration::from_millis(40), &mut promotion)
                .await
                .is_err()
        );
        assert!(f.boundary.events().is_empty());
        owner.stage(PendingActorEffects::default()).await.unwrap();
        assert!(!prepare(&f, o, true).await.unwrap().abort);
        assert!(
            tokio::time::timeout(Duration::from_secs(2), promotion)
                .await
                .unwrap()
                .unwrap()
                .is_some()
        );
        assert!(!prepare(&f, c, false).await.unwrap().abort);
        f.assert_prepared(c).await;
        f.assert_exclusive_retained().await;
        let before = f.boundary.events();
        host_abort(&f, o).await.unwrap();
        commit(&f, o).await.unwrap();
        assert_eq!(f.boundary.events(), before);
        f.assert_prepared(c).await;
        f.actor.abort(c).await.unwrap();
        assert_eq!(
            f.boundary.events(),
            vec![success("prepare"), success("abort")]
        );
        drop(owner);
        assert!(f.transactions().await.is_empty());
        f.assert_readmission(INITIAL).await;
    }
}

#[tokio::test]
#[ignore = "requires real canonical C++ Database/RocksDB"]
async fn native_b1_prepare_ack_loss_and_actual_future_drop_retain_exclusive_owner() {
    for fault in [LOSE_PREPARE, PARK_PREPARE] {
        let f = Fixture::new().await;
        let root = Uuid::new_v4();
        let guard = f
            .actor
            .start_local(f.start(root, true), ParticipantStartMode::SharedUpgradeable)
            .await
            .unwrap();
        assert!(guard.stage(final_effects()).await.unwrap().is_some());
        f.boundary.fault.store(fault, Ordering::SeqCst);
        if fault == PARK_PREPARE {
            let mut pending = Box::pin(prepare(&f, root, false));
            tokio::time::timeout(Duration::from_secs(3), async {
                tokio::select! {
                    result = &mut pending => panic!("parked host Prepare returned: {result:?}"),
                    _ = f.boundary.applied_prepare.notified() => {},
                }
            })
            .await
            .unwrap();
            drop(pending); // Cancels the actual host Prepare after real native ACK.
        } else {
            assert_eq!(
                prepare(&f, root, false).await.unwrap_err().code(),
                Code::Unavailable
            );
        }
        drop(guard);
        assert_eq!(f.boundary.events(), vec![success("prepare")]);
        f.assert_prepared(root).await;
        f.assert_exclusive_retained().await;
        // A wire read-only hint cannot reclassify this writable native owner.
        // Same-root deferred Prepare retry is still delivered under exclusivity;
        // real RocksDB rejects replay on the already prepared transaction.
        let replay = prepare(&f, root, true).await.unwrap_err();
        assert_eq!(replay.code(), Code::Unknown);
        assert!(
            replay
                .message()
                .starts_with("Failed to prepare transaction:"),
            "{replay}"
        );
        let retained_events = vec![
            success("prepare"),
            Event {
                verb: "prepare",
                result: Err(Code::Unknown),
            },
        ];
        assert_eq!(f.boundary.events(), retained_events);
        f.assert_prepared(root).await;
        f.assert_exclusive_retained().await;
        assert!(
            f.actor
                .stage(root, PendingActorEffects::default())
                .await
                .is_err()
        );
        let stale = Uuid::new_v4();
        host_abort(&f, stale).await.unwrap();
        commit(&f, stale).await.unwrap();
        assert_eq!(f.boundary.events(), retained_events);
        f.assert_prepared(root).await;
        // Native deferred Prepare replay above failed; never call it idempotent. Resolve
        // this prepared, uncommitted transaction with a real native Abort ACK.
        f.actor.abort(root).await.unwrap();
        assert_eq!(
            f.boundary.events(),
            vec![
                success("prepare"),
                Event {
                    verb: "prepare",
                    result: Err(Code::Unknown)
                },
                success("abort")
            ]
        );
        assert!(f.transactions().await.is_empty());
        f.assert_readmission(INITIAL).await;
    }
}

#[tokio::test]
#[ignore = "requires real canonical C++ Database/RocksDB"]
async fn native_b1_terminal_ack_loss_commit_retry_is_native_absence_error_abort_resolves() {
    for fault in [LOSE_COMMIT, LOSE_ABORT] {
        let f = Fixture::new().await;
        let root = Uuid::new_v4();
        let guard = f
            .actor
            .start_local(f.start(root, true), ParticipantStartMode::SharedUpgradeable)
            .await
            .unwrap();
        assert!(guard.stage(final_effects()).await.unwrap().is_some());
        assert!(!prepare(&f, root, false).await.unwrap().abort);
        f.assert_prepared(root).await;
        f.boundary.fault.store(fault, Ordering::SeqCst);
        let lost = if fault == LOSE_COMMIT {
            commit(&f, root).await
        } else {
            host_abort(&f, root).await
        };
        assert_eq!(lost.unwrap_err().code(), Code::Unavailable);
        drop(guard);
        let expected = if fault == LOSE_COMMIT { FINAL } else { INITIAL };
        assert_eq!(
            f.state().await,
            expected,
            "real terminal applied before response loss"
        );
        assert!(
            f.transactions().await.is_empty(),
            "native terminal deleted its transaction"
        );
        f.assert_exclusive_retained().await;
        let before = f.boundary.events();
        let stale = Uuid::new_v4();
        host_abort(&f, stale).await.unwrap();
        commit(&f, stale).await.unwrap();
        assert_eq!(f.boundary.events(), before);
        if fault == LOSE_COMMIT {
            // This is the ACTUAL C++ Commit retry, not a fabricated success.
            let error = commit(&f, root).await.unwrap_err();
            assert_eq!(error.code(), Code::Unknown);
            assert_eq!(
                error.message(),
                format!(
                    "Failed to commit transaction: Missing transaction for state type '{TYPE}' actor '{}'",
                    f.reference
                )
            );
            let events = f.boundary.events();
            assert_eq!(
                events.last(),
                Some(&Event {
                    verb: "commit",
                    result: Err(Code::Unknown)
                })
            );
            f.assert_exclusive_retained().await;
            assert_eq!(f.state().await, FINAL);
            assert!(f.transactions().await.is_empty());
        }
        // Canonical Abort explicitly accepts native absence. This acknowledges
        // cleanup of the retained local slot; after Commit it DOES NOT undo the
        // durable commit and is NOT a coordinator decision reversal claim.
        host_abort(&f, root).await.unwrap();
        let expected_events = if fault == LOSE_COMMIT {
            vec![
                success("prepare"),
                success("commit"),
                Event {
                    verb: "commit",
                    result: Err(Code::Unknown),
                },
                success("abort"),
            ]
        } else {
            vec![success("prepare"), success("abort"), success("abort")]
        };
        assert_eq!(f.boundary.events(), expected_events);
        assert!(f.transactions().await.is_empty());
        assert_eq!(f.state().await, expected);
        f.assert_readmission(expected).await;
    }
}
