// Source-only regression batch: the parent owns compilation/execution.

#[tokio::test]
async fn shared_slots_b1_public_mixed_owner_prestage_controls_wait_then_release_only_owner() {
    for commit in [false, true] {
        let (sidecar, actor) = b1_actor();
        let compat = Uuid::new_v4();
        let owned = Uuid::new_v4();
        actor
            .start_with_mode(
                shared_slot_start(compat),
                ParticipantStartMode::SharedUpgradeable,
            )
            .await
            .unwrap();
        let local = actor
            .start_local(
                shared_slot_start(owned),
                ParticipantStartMode::SharedUpgradeable,
            )
            .await
            .unwrap();
        let mut control = Box::pin(async {
            if commit {
                b1_host_commit(&actor, owned).await
            } else {
                actor.abort(owned).await
            }
        });
        assert_slot_future_pending(control.as_mut()).await;
        assert!(sidecar.events.lock().unwrap().is_empty());
        local.stage(PendingActorEffects::default()).await.unwrap();
        tokio::time::timeout(std::time::Duration::from_secs(1), control)
            .await
            .unwrap()
            .unwrap();
        assert!(actor.pending.lock_root(owned).await.is_none());
        assert!(
            actor
                .pending
                .lock_root(compat)
                .await
                .as_ref()
                .unwrap()
                .lock
                .is_shared()
        );
        assert_eq!(
            b1_host_prepare(&actor, compat, false)
                .await
                .unwrap_err()
                .code(),
            tonic::Code::FailedPrecondition
        );
        assert!(sidecar.events.lock().unwrap().is_empty());
        actor.abort(compat).await.unwrap();
        drop(local);
    }
}

#[tokio::test]
async fn shared_slots_b1_guard_drop_and_readonly_controls_retain_all_native_flags() {
    for fault in 0..5 {
        let (sidecar, actor) = b1_actor();
        let root = Uuid::new_v4();
        let local = actor
            .start_local(
                shared_slot_start(root),
                ParticipantStartMode::SharedUpgradeable,
            )
            .await
            .unwrap();
        local.stage(PendingActorEffects::default()).await.unwrap();
        // Deliberately inject inconsistent native/read-only ownership to prove
        // that neither classification nor Drop is a blanket release authority.
        // Actual early Store and recovery use exclusive leases; their existing
        // sorted-map/native suites remain the parent's required execution path.
        {
            let mut slot = actor.pending.lock_root(root).await;
            let current = slot.as_mut().unwrap();
            match fault {
                0 => current.prepared = true,
                1 => current.native_started = true,
                2 => current.native_uncertain = true,
                3 => current.native_control_started = true,
                4 => current.terminal_attempted = true,
                _ => unreachable!(),
            }
        }
        drop(local);
        tokio::task::yield_now().await;
        assert!(actor.pending.lock_root(root).await.is_some());
        assert!(b1_host_prepare(&actor, root, true).await.is_err());
        assert!(b1_host_commit(&actor, root).await.is_err());
        assert!(actor.abort(root).await.is_err());
        assert!(actor.pending.lock_root(root).await.is_some());
        assert!(sidecar.events.lock().unwrap().is_empty());
    }
}

// B1 uses ONE native transaction per actor. Native Commit/Abort deliberately
// receive no root and unconditionally affect that transaction, just like the
// canonical protobuf service; a root-indexed mock would conceal wrong-root I/O.
struct B1NativeTransaction {
    root: Uuid,
    state: Option<Vec<u8>>,
}

#[derive(Default)]
struct B1ActorOnlySidecar {
    load: MockSidecar,
    gate: Mutex<Option<crate::runtime::ActorGate>>,
    native: Mutex<Option<B1NativeTransaction>>,
    events: Mutex<Vec<(&'static str, Option<Uuid>)>>,
    lose_prepare_ack: std::sync::atomic::AtomicBool,
    lose_terminal_ack: std::sync::atomic::AtomicBool,
    prepare_park: Mutex<
        Option<(
            tokio::sync::oneshot::Sender<()>,
            tokio::sync::oneshot::Receiver<()>,
        )>,
    >,
}

impl B1ActorOnlySidecar {
    fn assert_exclusion_before_io(&self) {
        let gate = self.gate.lock().unwrap().as_ref().unwrap().clone();
        let mut cx = std::task::Context::from_waker(std::task::Waker::noop());
        // Poll shared FIRST so our own exclusive probe cannot queue a writer
        // and manufacture the very exclusion being asserted. These cases have
        // no external queued writer/upgrader at native entry. Both probes are
        // dropped immediately, cancelling their exact admission reservations.
        let mut shared = Box::pin(gate.shared());
        assert!(
            shared.as_mut().poll(&mut cx).is_pending(),
            "native I/O must already exclude a real competing shared lease"
        );
        let mut exclusive = Box::pin(gate.exclusive());
        assert!(
            exclusive.as_mut().poll(&mut cx).is_pending(),
            "native I/O must retain the real exclusive actor lease"
        );
    }

    fn native_root(&self) -> Option<Uuid> {
        self.native.lock().unwrap().as_ref().map(|tx| tx.root)
    }

    fn terminal_actor(&self, op: &'static str) -> Result<(), Status> {
        self.assert_exclusion_before_io();
        // Actor-only operation: NEVER choose a transaction by the caller root.
        let tx = self.native.lock().unwrap().take();
        self.events
            .lock()
            .unwrap()
            .push((op, tx.as_ref().map(|tx| tx.root)));
        if op == "commit"
            && let Some(tx) = tx
        {
            *self.load.load_state.lock().unwrap() = tx.state;
        }
        if self
            .lose_terminal_ack
            .swap(false, std::sync::atomic::Ordering::SeqCst)
        {
            return Err(Status::unavailable("native terminal applied; ACK lost"));
        }
        Ok(())
    }
}

impl ParticipantSidecar for B1ActorOnlySidecar {
    fn load(&self, request: database::LoadRequest) -> SidecarFuture<'_, database::LoadResponse> {
        self.load.load(request)
    }

    fn prepare(
        &self,
        request: database::TransactionParticipantPrepareRequest,
    ) -> SidecarFuture<'_, database::TransactionParticipantPrepareResponse> {
        // Synchronous boundary assertion: production must own exclusion even
        // before constructing the future, not acquire it inside the mock.
        self.assert_exclusion_before_io();
        let park = self.prepare_park.lock().unwrap().take();
        Box::pin(async move {
            let tx = request
                .transaction
                .expect("deferred Prepare carries its root");
            let root = Uuid::from_slice(&tx.transaction_ids[0]).unwrap();
            {
                let mut native = self.native.lock().unwrap();
                if let Some(existing) = native.as_ref() {
                    assert_eq!(existing.root, root, "Prepare must not overwrite a peer");
                    assert_eq!(
                        existing.state, request.state,
                        "exact-owner retry preserves effects"
                    );
                } else {
                    *native = Some(B1NativeTransaction {
                        root,
                        state: request.state,
                    });
                }
            }
            self.events.lock().unwrap().push(("prepare", Some(root)));
            if let Some((entered, release)) = park {
                entered.send(()).unwrap();
                let _ = release.await;
            }
            if self
                .lose_prepare_ack
                .swap(false, std::sync::atomic::Ordering::SeqCst)
            {
                return Err(Status::unavailable("native Prepare applied; ACK lost"));
            }
            Ok(database::TransactionParticipantPrepareResponse::default())
        })
    }

    fn commit(
        &self,
        request: database::TransactionParticipantCommitRequest,
    ) -> SidecarFuture<'_, database::TransactionParticipantCommitResponse> {
        assert_eq!(request.state_type, "example.Actor");
        assert_eq!(request.state_ref, "actor/1");
        Box::pin(async move {
            self.terminal_actor("commit")?;
            Ok(database::TransactionParticipantCommitResponse::default())
        })
    }

    fn abort(
        &self,
        request: database::TransactionParticipantAbortRequest,
    ) -> SidecarFuture<'_, database::TransactionParticipantAbortResponse> {
        assert_eq!(request.state_type, "example.Actor");
        assert_eq!(request.state_ref, "actor/1");
        Box::pin(async move {
            self.terminal_actor("abort")?;
            Ok(database::TransactionParticipantAbortResponse::default())
        })
    }

    fn recover(
        &self,
        request: database::RecoverRequest,
    ) -> SidecarFuture<'_, Vec<database::RecoverResponse>> {
        self.load.recover(request)
    }

    fn recover_idempotent_mutations(
        &self,
        request: database::RecoverIdempotentMutationsRequest,
    ) -> SidecarFuture<'_, Vec<database::RecoverIdempotentMutationsResponse>> {
        self.load.recover_idempotent_mutations(request)
    }
}

fn b1_actor() -> (
    Arc<B1ActorOnlySidecar>,
    DurableActorParticipant<B1ActorOnlySidecar>,
) {
    let sidecar = Arc::new(B1ActorOnlySidecar::default());
    *sidecar.load.load_state.lock().unwrap() = Some(vec![4]);
    let actor = DurableActorParticipant::new(sidecar.clone(), "example.Actor", "actor/1");
    *sidecar.gate.lock().unwrap() = Some(actor.lock.gate());
    (sidecar, actor)
}

async fn b1_host_prepare<C: ParticipantSidecar>(
    actor: &DurableActorParticipant<C>,
    root: Uuid,
    read_only: bool,
) -> Result<database::PrepareResponse, Status> {
    let host = DurableActorParticipantHost::new(actor.clone());
    let mut request = Request::new(database::PrepareRequest {
        transaction_id: root.as_bytes().to_vec(),
        abort_via_response: true,
        read_only_aware: read_only,
        read_only,
    });
    request
        .metadata_mut()
        .insert(STATE_REF_HEADER, "actor/1".parse().unwrap());
    database::participant_server::Participant::prepare(&host, request)
        .await
        .map(Response::into_inner)
}

async fn b1_host_commit<C: ParticipantSidecar>(
    actor: &DurableActorParticipant<C>,
    root: Uuid,
) -> Result<(), Status> {
    let host = DurableActorParticipantHost::new(actor.clone());
    let mut request = Request::new(database::CommitRequest {
        transaction_id: root.as_bytes().to_vec(),
    });
    request
        .metadata_mut()
        .insert(STATE_REF_HEADER, "actor/1".parse().unwrap());
    database::participant_server::Participant::commit(&host, request)
        .await
        .map(|_| ())
}

#[tokio::test]
async fn shared_slots_b1_public_compat_prepare_b_abort_a_protects_prepared_peer() {
    let (sidecar, actor) = b1_actor();
    let a = Uuid::new_v4();
    let b = Uuid::new_v4();
    for root in [a, b] {
        actor
            .start_with_mode(
                shared_slot_start(root),
                ParticipantStartMode::SharedUpgradeable,
            )
            .await
            .unwrap();
    }
    // The precise public-host B1 sequence: no staging, no owner-minted guard.
    assert_eq!(
        b1_host_prepare(&actor, b, false).await.unwrap_err().code(),
        tonic::Code::FailedPrecondition
    );
    assert_eq!(
        b1_host_prepare(&actor, b, true).await.unwrap_err().code(),
        tonic::Code::FailedPrecondition,
        "wire read_only does not classify writable ownership"
    );
    assert_eq!(
        b1_host_commit(&actor, a).await.unwrap_err().code(),
        tonic::Code::FailedPrecondition
    );
    assert!(
        actor.pending.lock_root(a).await.is_some(),
        "failed Commit retains its lease"
    );
    actor.abort(a).await.unwrap();
    assert!(actor.pending.lock_root(a).await.is_none());
    assert!(
        actor
            .pending
            .lock_root(b)
            .await
            .as_ref()
            .unwrap()
            .lock
            .is_shared()
    );
    assert!(
        sidecar.events.lock().unwrap().is_empty(),
        "shared Abort is local, never native"
    );
    // Even with no peer remaining, a single shared lease is not exclusive
    // authority. Registry occupancy must never substitute for gate promotion.
    assert_eq!(
        b1_host_prepare(&actor, b, false).await.unwrap_err().code(),
        tonic::Code::FailedPrecondition
    );
    assert_eq!(
        b1_host_commit(&actor, b).await.unwrap_err().code(),
        tonic::Code::FailedPrecondition
    );
    assert!(sidecar.events.lock().unwrap().is_empty());
    // Now B can actually obtain exclusivity and prepare. A stale root control,
    // including a new A admission waiting at the actor gate, cannot affect B.
    assert!(
        actor
            .stage(
                b,
                PendingActorEffects {
                    state: Some(vec![8]),
                    ..Default::default()
                }
            )
            .await
            .unwrap()
            .is_some()
    );
    assert!(
        !actor
            .pending
            .lock_root(b)
            .await
            .as_ref()
            .unwrap()
            .lock
            .is_shared()
    );
    b1_host_prepare(&actor, b, false).await.unwrap();
    assert_eq!(sidecar.native_root(), Some(b));
    let mut readmit_a = Box::pin(actor.start_with_mode(
        shared_slot_start(a),
        ParticipantStartMode::SharedUpgradeable,
    ));
    assert_slot_future_pending(readmit_a.as_mut()).await;
    let before = sidecar.events.lock().unwrap().clone();
    actor.abort(a).await.unwrap();
    b1_host_commit(&actor, a).await.unwrap();
    assert_eq!(
        sidecar.native_root(),
        Some(b),
        "actor-only peer Prepare survives stale A controls"
    );
    assert_eq!(*sidecar.events.lock().unwrap(), before);
    // Remove the queued probe before native entry so the exclusion assertion is
    // independent of writer queue fairness rather than manufactured by it.
    drop(readmit_a);
    b1_host_commit(&actor, b).await.unwrap();
    assert_eq!(*sidecar.load.load_state.lock().unwrap(), Some(vec![8]));
    assert_eq!(
        *sidecar.events.lock().unwrap(),
        vec![("prepare", Some(b)), ("commit", Some(b))]
    );
}

#[tokio::test]
async fn shared_slots_b1_mixed_compat_owner_roots_promote_only_after_peer_release() {
    for owner_first in [false, true] {
        let (sidecar, actor) = b1_actor();
        let c = Uuid::new_v4();
        let o = Uuid::new_v4();
        if !owner_first {
            actor
                .start_with_mode(
                    shared_slot_start(c),
                    ParticipantStartMode::SharedUpgradeable,
                )
                .await
                .unwrap();
        }
        let owner = actor
            .start_local(
                shared_slot_start(o),
                ParticipantStartMode::SharedUpgradeable,
            )
            .await
            .unwrap();
        if owner_first {
            actor
                .start_with_mode(
                    shared_slot_start(c),
                    ParticipantStartMode::SharedUpgradeable,
                )
                .await
                .unwrap();
        }
        assert_eq!(
            b1_host_prepare(&actor, c, false).await.unwrap_err().code(),
            tonic::Code::FailedPrecondition
        );
        assert_eq!(
            b1_host_commit(&actor, c).await.unwrap_err().code(),
            tonic::Code::FailedPrecondition
        );
        assert!(sidecar.events.lock().unwrap().is_empty());
        // Compatibility Abort cannot send actor-only control at an executing
        // owner-minted peer, and cannot release that peer's lease/incarnation.
        actor.abort(c).await.unwrap();
        assert!(
            actor
                .pending
                .lock_root(o)
                .await
                .as_ref()
                .unwrap()
                .execution_active
        );
        actor
            .start_with_mode(
                shared_slot_start(c),
                ParticipantStartMode::SharedUpgradeable,
            )
            .await
            .unwrap();
        let mut promote = Box::pin(actor.stage(
            c,
            PendingActorEffects {
                state: Some(vec![9]),
                ..Default::default()
            },
        ));
        assert_slot_future_pending(promote.as_mut()).await;
        assert!(
            sidecar.events.lock().unwrap().is_empty(),
            "no Prepare while upgrade awaits peer"
        );
        owner.stage(PendingActorEffects::default()).await.unwrap();
        b1_host_prepare(&actor, o, true).await.unwrap();
        assert!(
            tokio::time::timeout(std::time::Duration::from_secs(1), promote)
                .await
                .unwrap()
                .unwrap()
                .is_some()
        );
        assert!(
            !actor
                .pending
                .lock_root(c)
                .await
                .as_ref()
                .unwrap()
                .lock
                .is_shared()
        );
        b1_host_prepare(&actor, c, false).await.unwrap();
        actor.abort(o).await.unwrap();
        assert_eq!(sidecar.native_root(), Some(c));
        actor.abort(c).await.unwrap();
        assert_eq!(
            *sidecar.events.lock().unwrap(),
            vec![("prepare", Some(c)), ("abort", Some(c))]
        );
        assert_eq!(*sidecar.load.load_state.lock().unwrap(), Some(vec![4]));
        drop(owner);
    }
}

#[tokio::test]
async fn shared_slots_b1_classified_compat_readonly_commit_and_abort_are_local() {
    for commit in [false, true] {
        let (sidecar, actor) = b1_actor();
        let a = Uuid::new_v4();
        let b = Uuid::new_v4();
        for root in [a, b] {
            actor
                .start_with_mode(
                    shared_slot_start(root),
                    ParticipantStartMode::SharedUpgradeable,
                )
                .await
                .unwrap();
        }
        actor
            .stage(
                a,
                PendingActorEffects {
                    state: Some(vec![4]),
                    ..Default::default()
                },
            )
            .await
            .unwrap();
        if commit {
            b1_host_commit(&actor, a).await.unwrap();
        } else {
            actor.abort(a).await.unwrap();
        }
        assert!(actor.pending.lock_root(a).await.is_none());
        assert!(actor.pending.lock_root(b).await.is_some());
        assert!(sidecar.events.lock().unwrap().is_empty());
        actor.abort(b).await.unwrap();
    }
}

#[tokio::test]
async fn shared_slots_b1_unknown_shared_mutations_and_native_ownership_fail_closed() {
    // Fault injection checks fail-closed fences, not an invented public API:
    // public staging cannot publish these states without an exclusive lease.
    for fault in 0..6 {
        let (sidecar, actor) = b1_actor();
        let root = Uuid::new_v4();
        actor
            .start_with_mode(
                shared_slot_start(root),
                ParticipantStartMode::SharedUpgradeable,
            )
            .await
            .unwrap();
        {
            let mut slot = actor.pending.lock_root(root).await;
            let current = slot.as_mut().unwrap();
            match fault {
                0 => current.effects.state = Some(vec![99]), // unclassified mutation
                1 => current.prepared = true,
                2 => current.native_started = true,
                3 => current.native_uncertain = true,
                4 => current.native_control_started = true,
                5 => {
                    current.staged = true;
                    current.disposition = PendingDisposition::ReadOnly;
                    current.effects.state = Some(vec![99]);
                }
                _ => unreachable!(),
            }
        }
        assert!(actor.abort(root).await.is_err());
        assert!(b1_host_commit(&actor, root).await.is_err());
        assert!(b1_host_prepare(&actor, root, false).await.is_err());
        assert!(b1_host_prepare(&actor, root, true).await.is_err());
        assert!(actor.pending.lock_root(root).await.is_some());
        assert!(sidecar.events.lock().unwrap().is_empty());
        let mut competitor = Box::pin(actor.lock.exclusive());
        assert_slot_future_pending(competitor.as_mut()).await;
        drop(competitor);
    }
}

#[tokio::test]
async fn shared_slots_b1_prepare_ack_loss_or_cancel_keeps_promoted_exclusive_owner() {
    for cancel in [false, true] {
        let (sidecar, actor) = b1_actor();
        let root = Uuid::new_v4();
        let local = actor
            .start_local(
                shared_slot_start(root),
                ParticipantStartMode::SharedUpgradeable,
            )
            .await
            .unwrap();
        local
            .stage(PendingActorEffects {
                state: Some(vec![10]),
                ..Default::default()
            })
            .await
            .unwrap();
        if cancel {
            let (entered, mut wait_entered) = tokio::sync::oneshot::channel();
            let (release, wait_release) = tokio::sync::oneshot::channel();
            *sidecar.prepare_park.lock().unwrap() = Some((entered, wait_release));
            let mut prepare = Box::pin(b1_host_prepare(&actor, root, false));
            assert_slot_future_pending(prepare.as_mut()).await;
            assert!(wait_entered.try_recv().is_ok());
            assert_eq!(
                sidecar.native_root(),
                Some(root),
                "native applied before future cancellation"
            );
            drop(prepare);
            drop(release);
        } else {
            sidecar
                .lose_prepare_ack
                .store(true, std::sync::atomic::Ordering::SeqCst);
            assert_eq!(
                b1_host_prepare(&actor, root, false)
                    .await
                    .unwrap_err()
                    .code(),
                tonic::Code::Unavailable
            );
        }
        drop(local); // This was the unsafe speculative-release window in legacy deferred Prepare.
        tokio::task::yield_now().await;
        {
            let slot = actor.pending.lock_root(root).await;
            let current = slot
                .as_ref()
                .expect("uncertain Prepare cannot be guard-Dropped");
            assert!(current.native_control_started && !current.prepared);
            assert!(!current.lock.is_shared());
        }
        assert_eq!(sidecar.native_root(), Some(root));
        assert_eq!(
            actor
                .stage(root, PendingActorEffects::default())
                .await
                .unwrap_err()
                .code(),
            tonic::Code::FailedPrecondition,
            "cannot reclassify uncertain Prepare as read-only"
        );
        let peer = Uuid::new_v4();
        let mut admission = Box::pin(actor.start_with_mode(
            shared_slot_start(peer),
            ParticipantStartMode::SharedUpgradeable,
        ));
        assert_slot_future_pending(admission.as_mut()).await;
        actor.abort(peer).await.unwrap();
        assert_eq!(sidecar.native_root(), Some(root));
        drop(admission);
        // Preserve existing exact-owner retry semantics under retained real
        // exclusivity. Neither loss nor cancellation authorizes a new root.
        b1_host_prepare(&actor, root, false).await.unwrap();
        assert!(
            actor
                .pending
                .lock_root(root)
                .await
                .as_ref()
                .unwrap()
                .prepared
        );
        b1_host_commit(&actor, root).await.unwrap();
        assert_eq!(*sidecar.load.load_state.lock().unwrap(), Some(vec![10]));
        assert_eq!(
            *sidecar.events.lock().unwrap(),
            vec![
                ("prepare", Some(root)),
                ("prepare", Some(root)),
                ("commit", Some(root))
            ]
        );
    }
}

#[tokio::test]
async fn shared_slots_b1_terminal_ack_loss_retains_prepared_and_prestage_exclusive_owner() {
    // Includes both actor-only terminal verbs and the unprepared exclusive
    // Abort case, whose armed guard previously could discard ACK uncertainty.
    for case in 0..3 {
        let (sidecar, actor) = b1_actor();
        let root = Uuid::new_v4();
        let local = if case == 0 {
            actor
                .start_local(start(root), ParticipantStartMode::Exclusive)
                .await
                .unwrap()
        } else {
            actor
                .start_local(
                    shared_slot_start(root),
                    ParticipantStartMode::SharedUpgradeable,
                )
                .await
                .unwrap()
        };
        if case != 0 {
            local
                .stage(PendingActorEffects {
                    state: Some(vec![11]),
                    ..Default::default()
                })
                .await
                .unwrap();
            b1_host_prepare(&actor, root, false).await.unwrap();
        }
        sidecar
            .lose_terminal_ack
            .store(true, std::sync::atomic::Ordering::SeqCst);
        let result = if case == 2 {
            b1_host_commit(&actor, root).await
        } else {
            actor.abort(root).await
        };
        assert_eq!(result.unwrap_err().code(), tonic::Code::Unavailable);
        drop(local);
        tokio::task::yield_now().await;
        {
            let slot = actor.pending.lock_root(root).await;
            let current = slot
                .as_ref()
                .expect("terminal ACK loss must retain actor ownership");
            assert!(current.native_control_started);
            assert!(!current.lock.is_shared());
        }
        let mut peer = Box::pin(actor.start_with_mode(
            shared_slot_start(Uuid::new_v4()),
            ParticipantStartMode::SharedUpgradeable,
        ));
        assert_slot_future_pending(peer.as_mut()).await;
        drop(peer);
        assert!(
            actor
                .stage(root, PendingActorEffects::default())
                .await
                .is_err()
        );
        // Baseline deferred terminal retry remains possible only for the same
        // retained root/exclusive lease; ACK, not guard Drop, releases it.
        if case == 2 {
            b1_host_commit(&actor, root).await.unwrap();
        } else {
            actor.abort(root).await.unwrap();
        }
        assert!(actor.pending.lock_root(root).await.is_none());
        let writer = tokio::time::timeout(
            std::time::Duration::from_secs(1),
            actor.start_local(start(Uuid::new_v4()), ParticipantStartMode::Exclusive),
        )
        .await
        .unwrap()
        .unwrap();
        assert_eq!(
            *sidecar.load.load_state.lock().unwrap(),
            Some(if case == 2 { vec![11] } else { vec![4] })
        );
        drop(writer);
    }
}

// Included in durable_participant::tests to exercise the actual current paths,
// not a synthetic registry implementation or shared-account writer allowance.

fn shared_slot_start(root: Uuid) -> ActorTransactionStart {
    let mut request = start(root);
    request.mode = TransactionMode::Shared;
    request.coordinator_state_type = request.state_type.clone();
    request.coordinator_state_ref = request.state_ref.clone();
    request
}

fn shared_slot_actor() -> (Arc<MockSidecar>, DurableActorParticipant<MockSidecar>) {
    let sidecar = Arc::new(MockSidecar::default());
    *sidecar.load_state.lock().unwrap() = Some(vec![4]);
    let participant = DurableActorParticipant::new(sidecar.clone(), "example.Actor", "actor/1");
    (sidecar, participant)
}

async fn assert_slot_future_pending<F: Future>(future: Pin<&mut F>) {
    let mut future = future;
    std::future::poll_fn(|cx| {
        assert!(
            future.as_mut().poll(cx).is_pending(),
            "must poll the actual blocked future"
        );
        std::task::Poll::Ready(())
    })
    .await;
}

#[tokio::test]
async fn shared_slots_two_parked_noop_roots_hold_exclusive_until_both_finish() {
    let (sidecar, actor) = shared_slot_actor();
    let a = Uuid::new_v4();
    let b = Uuid::new_v4();
    let first = actor
        .start_local(
            shared_slot_start(a),
            ParticipantStartMode::SharedUpgradeable,
        )
        .await
        .unwrap();
    let second = tokio::time::timeout(
        std::time::Duration::from_secs(1),
        actor.start_local(
            shared_slot_start(b),
            ParticipantStartMode::SharedUpgradeable,
        ),
    )
    .await
    .expect("a second fresh shared root must load and enter while the first is parked")
    .unwrap();
    assert_ne!(first.local_owner, second.local_owner);
    for root in [a, b] {
        let slot = actor.pending.lock_root(root).await;
        let current = slot.as_ref().unwrap();
        assert_eq!(current.root_id, root);
        assert!(current.execution_active);
        assert!(current.lock.is_shared());
        assert_eq!(current.loaded_state, Some(vec![4]));
    }
    let mut exclusive =
        Box::pin(actor.start_local(start(Uuid::new_v4()), ParticipantStartMode::Exclusive));
    assert_slot_future_pending(exclusive.as_mut()).await;
    assert!(
        first
            .stage(PendingActorEffects::default())
            .await
            .unwrap()
            .is_none()
    );
    actor.prepare(a, true, true).await.unwrap();
    assert!(actor.pending.lock_root(a).await.is_none());
    assert!(actor.pending.lock_root(b).await.is_some());
    assert_slot_future_pending(exclusive.as_mut()).await;
    assert!(
        second
            .stage(PendingActorEffects::default())
            .await
            .unwrap()
            .is_none()
    );
    actor.prepare(b, true, true).await.unwrap();
    let writer = tokio::time::timeout(std::time::Duration::from_secs(1), exclusive)
        .await
        .unwrap()
        .unwrap();
    drop((first, second, writer));
    assert!(
        sidecar
            .calls
            .lock()
            .unwrap()
            .iter()
            .all(|call| matches!(call, Call::Load(_)))
    );
}

#[tokio::test]
async fn shared_slots_parked_load_does_not_hold_the_global_registry() {
    let (sidecar, actor) = shared_slot_actor();
    let (entered, wait_entered) = tokio::sync::oneshot::channel();
    let (release, wait_release) = tokio::sync::oneshot::channel();
    *sidecar.load_park.lock().unwrap() = Some((entered, wait_release));
    let a = Uuid::new_v4();
    let b = Uuid::new_v4();
    let loading_actor = actor.clone();
    let loading = tokio::spawn(async move {
        loading_actor
            .start_local(
                shared_slot_start(a),
                ParticipantStartMode::SharedUpgradeable,
            )
            .await
    });
    wait_entered.await.unwrap();
    let second = tokio::time::timeout(
        std::time::Duration::from_secs(1),
        actor.start_local(
            shared_slot_start(b),
            ParticipantStartMode::SharedUpgradeable,
        ),
    )
    .await
    .expect("one root's Load cannot serialize the other root's state lock")
    .unwrap();
    assert!(
        second
            .stage(PendingActorEffects::default())
            .await
            .unwrap()
            .is_none()
    );
    actor.prepare(b, true, true).await.unwrap();
    // Cancel while Load, not after a guard was manufactured. The allocation and
    // lease must be reclaimable without publishing a Pending or sending Abort.
    loading.abort();
    assert!(loading.await.err().unwrap().is_cancelled());
    drop(release);
    let writer = tokio::time::timeout(
        std::time::Duration::from_secs(1),
        actor.start_local(start(Uuid::new_v4()), ParticipantStartMode::Exclusive),
    )
    .await
    .unwrap()
    .unwrap();
    drop((second, writer));
    assert!(actor.pending.lock_root(a).await.is_none());
    assert!(
        sidecar
            .calls
            .lock()
            .unwrap()
            .iter()
            .all(|call| matches!(call, Call::Load(_)))
    );
}

#[tokio::test]
async fn shared_slots_bounded_capacity_rejects_before_load_and_reclaims_cancelled_reservations() {
    let phase = std::cell::Cell::new("admitting 64 shared roots");
    tokio::time::timeout(std::time::Duration::from_secs(5), async {
        let (sidecar, actor) = shared_slot_actor();
        let mut roots = Vec::new();
        for _ in 0..MAX_PENDING_ROOTS_PER_ACTOR {
            roots.push(
                actor
                    .start_local(
                        shared_slot_start(Uuid::new_v4()),
                        ParticipantStartMode::SharedUpgradeable,
                    )
                    .await
                    .unwrap(),
            );
        }
        phase.set("overflow after 64 admitted roots");
        let before = sidecar.calls.lock().unwrap().len();
        let error = actor
            .start_local(
                shared_slot_start(Uuid::new_v4()),
                ParticipantStartMode::SharedUpgradeable,
            )
            .await
            .err()
            .unwrap();
        assert_eq!(error.code(), tonic::Code::ResourceExhausted);
        assert_eq!(
            sidecar.calls.lock().unwrap().len(),
            before,
            "capacity rejection precedes Load, authorization and body"
        );
        // Unknown control traffic cannot consume capacity or evict a live slot.
        for _ in 0..MAX_PENDING_ROOTS_PER_ACTOR {
            actor.abort(Uuid::new_v4()).await.unwrap();
        }
        assert_eq!(
            actor.pending.slots.lock().unwrap().len(),
            MAX_PENDING_ROOTS_PER_ACTOR
        );
        phase.set("replacing a dropped shared root");
        drop(roots.pop());
        let replacement = actor
            .start_local(
                shared_slot_start(Uuid::new_v4()),
                ParticipantStartMode::SharedUpgradeable,
            )
            .await
            .unwrap();
        drop((replacement, roots));
        // Bound gate-waiting roots as well as roots already inside their handlers.
        phase.set("exclusive admission after all shared Drop");
        let writer = actor
            .start_local(start(Uuid::new_v4()), ParticipantStartMode::Exclusive)
            .await
            .unwrap();
        let mut waiters = Vec::new();
        for _ in 1..MAX_PENDING_ROOTS_PER_ACTOR {
            let root = Uuid::new_v4();
            let mut waiting = Box::pin(actor.start_local(
                shared_slot_start(root),
                ParticipantStartMode::SharedUpgradeable,
            ));
            // Pending alone can be Tokio cooperative yielding BEFORE reserve.
            // Count a waiter only after its actual bounded root slot exists.
            loop {
                assert_slot_future_pending(waiting.as_mut()).await;
                if actor.pending.slots.lock().unwrap().contains_key(&root) {
                    break;
                }
                tokio::task::yield_now().await;
            }
            waiters.push(waiting);
        }
        assert_eq!(
            actor.pending.slots.lock().unwrap().len(),
            MAX_PENDING_ROOTS_PER_ACTOR
        );
        phase.set("overflow after gate-waiting roots");
        let error = actor
            .start_local(
                shared_slot_start(Uuid::new_v4()),
                ParticipantStartMode::SharedUpgradeable,
            )
            .await
            .err()
            .unwrap();
        assert_eq!(error.code(), tonic::Code::ResourceExhausted);
        drop(waiters);
        // Cancelling empty gate-waiting slots reclaims capacity before admission.
        let mut readmitted = Box::pin(actor.start_local(
            shared_slot_start(Uuid::new_v4()),
            ParticipantStartMode::SharedUpgradeable,
        ));
        assert_slot_future_pending(readmitted.as_mut()).await;
        drop(writer);
        let local = tokio::time::timeout(std::time::Duration::from_secs(1), readmitted)
            .await
            .unwrap()
            .unwrap();
        drop(local);
    })
    .await
    .unwrap_or_else(|_| panic!("capacity lifecycle stalled: {}", phase.get()));
}

#[tokio::test]
async fn shared_slots_promotion_contention_cancel_and_readmission_preserve_each_snapshot() {
    let (sidecar, actor) = shared_slot_actor();
    let a = Uuid::new_v4();
    let b = Uuid::new_v4();
    let first = actor
        .start_local(
            shared_slot_start(a),
            ParticipantStartMode::SharedUpgradeable,
        )
        .await
        .unwrap();
    let second = actor
        .start_local(
            shared_slot_start(b),
            ParticipantStartMode::SharedUpgradeable,
        )
        .await
        .unwrap();
    let changed = PendingActorEffects {
        state: Some(vec![9]),
        ..Default::default()
    };
    let mut promoting = Box::pin(first.stage(changed.clone()));
    assert_slot_future_pending(promoting.as_mut()).await;
    // Another root must reach its own slot and return the conservative gate
    // contention status, not wait forever behind the first root's state mutex.
    let error = tokio::time::timeout(
        std::time::Duration::from_secs(1),
        second.stage(changed.clone()),
    )
    .await
    .unwrap()
    .unwrap_err();
    assert_eq!(error.code(), tonic::Code::Aborted);
    {
        let slot = actor.pending.lock_root(b).await;
        let pending = slot.as_ref().unwrap();
        assert!(pending.lock.is_shared());
        assert!(!pending.staged);
        assert_eq!(pending.loaded_state, Some(vec![4]));
        assert!(pending.effects.state.is_none());
    }
    drop(promoting); // cancels only A's upgrade reservation, not its shared lease
    drop(first);
    let proof = second.stage(changed).await.unwrap().unwrap();
    let mut promoted = second.into_shared_local_promotion(proof).unwrap();
    promoted.prepare().await.unwrap();
    promoted.commit().await.unwrap();
    {
        let calls = sidecar.calls.lock().unwrap();
        let prepares: Vec<_> = calls
            .iter()
            .filter_map(|call| match call {
                Call::Prepare(request) => Some(request),
                _ => None,
            })
            .collect();
        assert_eq!(prepares.len(), 1);
        assert_eq!(prepares[0].state, Some(vec![9]));
        assert_eq!(
            prepares[0].transaction.as_ref().unwrap().transaction_ids,
            vec![b.as_bytes().to_vec()]
        );
    }
    let writer = actor
        .start_local(start(Uuid::new_v4()), ParticipantStartMode::Exclusive)
        .await
        .unwrap();
    drop(writer);
}

#[tokio::test]
async fn shared_slots_queued_exclusive_rejects_promotion_without_effects_then_readmits() {
    let (_sidecar, actor) = shared_slot_actor();
    let local = actor
        .start_local(
            shared_slot_start(Uuid::new_v4()),
            ParticipantStartMode::SharedUpgradeable,
        )
        .await
        .unwrap();
    let mut writer =
        Box::pin(actor.start_local(start(Uuid::new_v4()), ParticipantStartMode::Exclusive));
    assert_slot_future_pending(writer.as_mut()).await;
    let error = local
        .stage(PendingActorEffects {
            state: Some(vec![9]),
            ..Default::default()
        })
        .await
        .unwrap_err();
    assert_eq!(error.code(), tonic::Code::Aborted);
    assert_slot_future_pending(writer.as_mut()).await;
    drop(local);
    let writer = writer.await.unwrap();
    drop(writer);
    let next = actor
        .start_local(
            shared_slot_start(Uuid::new_v4()),
            ParticipantStartMode::SharedUpgradeable,
        )
        .await
        .unwrap();
    let proof = next
        .stage(PendingActorEffects {
            state: Some(vec![9]),
            ..Default::default()
        })
        .await
        .unwrap()
        .unwrap();
    // Rollback after promotion releases exactly this incarnation, not a new root.
    next.into_shared_local_promotion(proof)
        .unwrap()
        .abort()
        .await
        .unwrap();
    let final_writer = actor
        .start_local(start(Uuid::new_v4()), ParticipantStartMode::Exclusive)
        .await
        .unwrap();
    drop(final_writer);
}

#[tokio::test]
async fn shared_slots_independent_staging_releases_peer_while_upgrade_owns_its_slot_mutex() {
    let (_sidecar, actor) = shared_slot_actor();
    let a = Uuid::new_v4();
    let b = Uuid::new_v4();
    let first = actor
        .start_local(
            shared_slot_start(a),
            ParticipantStartMode::SharedUpgradeable,
        )
        .await
        .unwrap();
    let second = actor
        .start_local(
            shared_slot_start(b),
            ParticipantStartMode::SharedUpgradeable,
        )
        .await
        .unwrap();
    let mut promoting = Box::pin(first.stage(PendingActorEffects {
        state: Some(vec![8]),
        ..Default::default()
    }));
    assert_slot_future_pending(promoting.as_mut()).await;
    assert!(
        second
            .stage(PendingActorEffects::default())
            .await
            .unwrap()
            .is_none()
    );
    actor.prepare(b, true, true).await.unwrap();
    let proof = tokio::time::timeout(std::time::Duration::from_secs(1), promoting)
        .await
        .unwrap()
        .unwrap()
        .unwrap();
    first
        .into_shared_local_promotion(proof)
        .unwrap()
        .abort()
        .await
        .unwrap();
    drop(second);
}

#[tokio::test]
async fn shared_slots_execution_seals_control_until_only_that_root_stages_or_drops() {
    let (sidecar, actor) = shared_slot_actor();
    let a = Uuid::new_v4();
    let b = Uuid::new_v4();
    let first = actor
        .start_local(
            shared_slot_start(a),
            ParticipantStartMode::SharedUpgradeable,
        )
        .await
        .unwrap();
    let second = actor
        .start_local(
            shared_slot_start(b),
            ParticipantStartMode::SharedUpgradeable,
        )
        .await
        .unwrap();
    let mut prepare = Box::pin(actor.prepare(a, true, true));
    let mut abort = Box::pin(actor.abort(b));
    assert_slot_future_pending(prepare.as_mut()).await;
    assert_slot_future_pending(abort.as_mut()).await;
    assert_eq!(
        actor
            .stage(a, PendingActorEffects::default())
            .await
            .unwrap_err()
            .code(),
        tonic::Code::FailedPrecondition,
        "root-only compatibility staging cannot impersonate the local incarnation",
    );
    first.stage(PendingActorEffects::default()).await.unwrap();
    assert!(matches!(prepare.await.unwrap(), PrepareOutcome::Prepared));
    assert_slot_future_pending(abort.as_mut()).await;
    drop(second);
    abort.await.unwrap();
    drop(first);
    assert!(
        sidecar
            .calls
            .lock()
            .unwrap()
            .iter()
            .all(|call| matches!(call, Call::Load(_)))
    );
}

#[tokio::test]
async fn shared_slots_stale_stage_drop_and_direct_promotion_cannot_touch_new_incarnation() {
    let (sidecar, actor) = shared_slot_actor();
    let root = Uuid::new_v4();
    let stale = actor
        .start_local(
            shared_slot_start(root),
            ParticipantStartMode::SharedUpgradeable,
        )
        .await
        .unwrap();
    stale.stage(PendingActorEffects::default()).await.unwrap();
    actor.prepare(root, true, true).await.unwrap();
    let next = actor
        .start_local(
            shared_slot_start(root),
            ParticipantStartMode::SharedUpgradeable,
        )
        .await
        .unwrap();
    assert_ne!(stale.local_owner, next.local_owner);
    let before = sidecar.calls.lock().unwrap().len();
    assert_eq!(
        stale
            .stage(PendingActorEffects::default())
            .await
            .unwrap_err()
            .code(),
        tonic::Code::FailedPrecondition
    );
    drop(stale);
    assert_eq!(
        actor
            .pending
            .lock_root(root)
            .await
            .as_ref()
            .unwrap()
            .local_owner,
        Some(next.local_owner)
    );
    assert_eq!(sidecar.calls.lock().unwrap().len(), before);
    let proof = next
        .stage(PendingActorEffects {
            state: Some(vec![7]),
            ..Default::default()
        })
        .await
        .unwrap()
        .unwrap();
    let mut old_promotion = next.into_shared_local_promotion(proof).unwrap();
    actor.abort(root).await.unwrap();
    let replacement = actor
        .start_local(
            shared_slot_start(root),
            ParticipantStartMode::SharedUpgradeable,
        )
        .await
        .unwrap();
    assert_eq!(
        old_promotion.prepare().await.unwrap_err().code(),
        tonic::Code::FailedPrecondition
    );
    assert_eq!(
        old_promotion.abort().await.unwrap_err().code(),
        tonic::Code::FailedPrecondition
    );
    assert_eq!(
        actor
            .pending
            .lock_root(root)
            .await
            .as_ref()
            .unwrap()
            .local_owner,
        Some(replacement.local_owner)
    );
    drop(replacement);
}

#[tokio::test]
async fn shared_slots_host_owned_handler_cancellation_joins_and_drains_only_owned_roots() {
    let (sidecar, actor) = shared_slot_actor();
    let survivor_root = Uuid::new_v4();
    let survivor = actor
        .start_local(
            shared_slot_start(survivor_root),
            ParticipantStartMode::SharedUpgradeable,
        )
        .await
        .unwrap();
    let cancel = crate::application_host::RecoveryCancellation::new();
    let mut handlers = tokio::task::JoinSet::new();
    let mut cancelled_roots = Vec::new();
    for _ in 0..2 {
        let root = Uuid::new_v4();
        let local = actor
            .start_local(
                shared_slot_start(root),
                ParticipantStartMode::SharedUpgradeable,
            )
            .await
            .unwrap();
        cancelled_roots.push(root);
        let cancelled = cancel.clone();
        handlers.spawn(async move {
            cancelled.cancelled().await;
            drop(local); // same guard Drop as a cancelled generated handler
        });
    }
    cancel.cancel();
    while let Some(joined) = handlers.join_next().await {
        joined.unwrap();
    }
    for root in cancelled_roots {
        assert!(actor.pending.lock_root(root).await.is_none());
    }
    assert_eq!(
        actor
            .pending
            .lock_root(survivor_root)
            .await
            .as_ref()
            .unwrap()
            .local_owner,
        Some(survivor.local_owner)
    );
    let mut writer =
        Box::pin(actor.start_local(start(Uuid::new_v4()), ParticipantStartMode::Exclusive));
    assert_slot_future_pending(writer.as_mut()).await;
    drop(survivor);
    let writer = writer.await.unwrap();
    drop(writer);
    assert!(
        sidecar
            .calls
            .lock()
            .unwrap()
            .iter()
            .all(|call| matches!(call, Call::Load(_)))
    );
}

#[tokio::test]
async fn shared_slots_duplicate_root_rejects_without_second_load_or_slot_replacement() {
    let (sidecar, actor) = shared_slot_actor();
    let root = Uuid::new_v4();
    let local = actor
        .start_local(
            shared_slot_start(root),
            ParticipantStartMode::SharedUpgradeable,
        )
        .await
        .unwrap();
    let error = actor
        .start_local(
            shared_slot_start(root),
            ParticipantStartMode::SharedUpgradeable,
        )
        .await
        .err()
        .unwrap();
    assert_eq!(error.code(), tonic::Code::FailedPrecondition);
    assert_eq!(sidecar.calls.lock().unwrap().len(), 1);
    assert_eq!(
        actor
            .pending
            .lock_root(root)
            .await
            .as_ref()
            .unwrap()
            .local_owner,
        Some(local.local_owner)
    );
    drop(local);
}

#[tokio::test]
async fn shared_slots_recovery_still_waits_for_all_shared_leases_and_routes_exact_durable_root() {
    let (sidecar, actor) = shared_slot_actor();
    let a = Uuid::new_v4();
    let b = Uuid::new_v4();
    let restored = Uuid::new_v4();
    let first = actor
        .start_local(
            shared_slot_start(a),
            ParticipantStartMode::SharedUpgradeable,
        )
        .await
        .unwrap();
    let second = actor
        .start_local(
            shared_slot_start(b),
            ParticipantStartMode::SharedUpgradeable,
        )
        .await
        .unwrap();
    sidecar
        .recover_responses
        .lock()
        .unwrap()
        .push_back(Ok(database::RecoverResponse {
            participant_transactions: vec![recovered_transaction(restored, true)],
            ..Default::default()
        }));
    let mut recovering = Box::pin(actor.recover_ownership(recovery()));
    assert_slot_future_pending(recovering.as_mut()).await;
    drop(first);
    assert_slot_future_pending(recovering.as_mut()).await;
    drop(second);
    tokio::time::timeout(std::time::Duration::from_secs(1), recovering)
        .await
        .unwrap()
        .unwrap();
    let mut writer =
        Box::pin(actor.start_local(start(Uuid::new_v4()), ParticipantStartMode::Exclusive));
    assert_slot_future_pending(writer.as_mut()).await;
    actor.abort(a).await.unwrap(); // stale root cannot release the restored owner
    assert_slot_future_pending(writer.as_mut()).await;
    let watch = MockWatch::default();
    watch
        .responses
        .lock()
        .unwrap()
        .push_back(Ok(database::WatchResponse { aborted: false }));
    assert!(
        !sidecar
            .calls
            .lock()
            .unwrap()
            .iter()
            .any(|call| matches!(call, Call::Commit(_)))
    );
    actor.watch_recovered(&watch).await.unwrap();
    assert_eq!(
        watch.requests.lock().unwrap()[0].transaction_id,
        restored.as_bytes().to_vec()
    );
    // Native Commit is actor-only; root identity is established by the Watch
    // request and the retained recovered slot, never by a nonexistent wire field.
    {
        let calls = sidecar.calls.lock().unwrap();
        let commits: Vec<_> = calls
            .iter()
            .filter_map(|call| match call {
                Call::Commit(request) => Some(request),
                _ => None,
            })
            .collect();
        assert_eq!(commits.len(), 1);
        assert_eq!(commits[0].state_type, actor.state_type);
        assert_eq!(commits[0].state_ref, actor.state_ref);
    }
    let writer = tokio::time::timeout(std::time::Duration::from_secs(1), writer)
        .await
        .unwrap()
        .unwrap();
    drop(writer);
}

#[tokio::test]
async fn shared_slots_contended_drop_cleanup_never_blocks_peer_slot_or_releases_peer_owner() {
    let (sidecar, actor) = shared_slot_actor();
    let a = Uuid::new_v4();
    let b = Uuid::new_v4();
    let first = actor
        .start_local(
            shared_slot_start(a),
            ParticipantStartMode::SharedUpgradeable,
        )
        .await
        .unwrap();
    let second = actor
        .start_local(
            shared_slot_start(b),
            ParticipantStartMode::SharedUpgradeable,
        )
        .await
        .unwrap();
    let locked = actor.pending.lock_root(a).await;
    let owner = first.local_owner;
    drop(first); // actual contended Drop path must queue only A's cleanup
    tokio::task::yield_now().await;
    assert_eq!(locked.as_ref().unwrap().local_owner, Some(owner));
    assert!(
        second
            .stage(PendingActorEffects::default())
            .await
            .unwrap()
            .is_none()
    );
    actor.prepare(b, true, true).await.unwrap();
    let mut writer =
        Box::pin(actor.start_local(start(Uuid::new_v4()), ParticipantStartMode::Exclusive));
    assert_slot_future_pending(writer.as_mut()).await;
    drop(locked);
    let writer = tokio::time::timeout(std::time::Duration::from_secs(1), writer)
        .await
        .expect("queued exact-owner Drop stranded its shared lease")
        .unwrap();
    assert!(actor.pending.lock_root(a).await.is_none());
    drop((second, writer));
    assert!(
        sidecar
            .calls
            .lock()
            .unwrap()
            .iter()
            .all(|call| matches!(call, Call::Load(_)))
    );
}

#[tokio::test]
async fn shared_slots_timed_out_stage_preserves_lease_snapshot_and_allows_safe_retry() {
    let (_sidecar, actor) = shared_slot_actor();
    let a = Uuid::new_v4();
    let b = Uuid::new_v4();
    let first = actor
        .start_local(
            shared_slot_start(a),
            ParticipantStartMode::SharedUpgradeable,
        )
        .await
        .unwrap();
    let second = actor
        .start_local(
            shared_slot_start(b),
            ParticipantStartMode::SharedUpgradeable,
        )
        .await
        .unwrap();
    let changed = PendingActorEffects {
        state: Some(vec![6]),
        ..Default::default()
    };
    assert!(
        tokio::time::timeout(
            std::time::Duration::from_millis(10),
            first.stage(changed.clone())
        )
        .await
        .is_err()
    );
    {
        let slot = actor.pending.lock_root(a).await;
        let current = slot.as_ref().unwrap();
        assert!(current.lock.is_shared());
        assert!(!current.staged);
        assert!(current.execution_active);
        assert_eq!(current.loaded_state, Some(vec![4]));
        assert!(current.effects.state.is_none());
    }
    // Timeout cancelled the upgrade reservation, not ownership. The other slot
    // can end independently; retry upgrades the SAME previously loaded snapshot.
    second.stage(PendingActorEffects::default()).await.unwrap();
    actor.prepare(b, true, true).await.unwrap();
    let proof = first.stage(changed).await.unwrap().unwrap();
    first
        .into_shared_local_promotion(proof)
        .unwrap()
        .abort()
        .await
        .unwrap();
    drop(second);
}
