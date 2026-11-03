// Included inside durable_coordinator::tests to reuse its sidecar fault sources.
// These are SDK ownership/fault-source tests, NOT native or generated acceptance.
mod shared_owned_root {
    use super::*;
    use crate::{
        RebootHeaders,
        application_host::{HostRecovery, RecoveryCancellation},
        explicit_abort::{ExplicitAbortOwner, RegisteredRoot, RootHandlerGuard},
        runtime::{RootTransactionContext, TransactionContext},
        shared_existing_writer_root::SettledSharedWriterRoot,
    };

    struct Fixture {
        context: TransactionContext,
        guard: RootHandlerGuard<InProcessSidecar, MockSidecar, MockResolver>,
        sidecar: Arc<MockSidecar>,
        local_sidecar: Arc<InProcessSidecar>,
        endpoint: Arc<MockEndpoint>,
        owner: ExplicitAbortOwner,
        cancel: RecoveryCancellation,
        supervisor: tokio::task::JoinSet<Result<(), Status>>,
    }
    async fn fixture(decision_error: bool, abort_error: bool) -> Fixture {
        let trace = Arc::new(Mutex::new(Vec::new()));
        let sidecar = Arc::new(MockSidecar {
            trace: trace.clone(),
            decision_error,
            ..Default::default()
        });
        let endpoint = Arc::new(MockEndpoint {
            trace: trace.clone(),
            abort_error,
            ..Default::default()
        });
        let local_sidecar = Arc::new(InProcessSidecar {
            trace,
            load_state: Mutex::new(Some(vec![0])),
            ..Default::default()
        });
        let participant =
            DurableActorParticipant::new(local_sidecar.clone(), "example.Actor", "actor/1");
        let id = Uuid::new_v4();
        let mut context = RootTransactionContext::start(
            RebootHeaders::new("actor/1"),
            "example.Actor",
            TransactionMode::Shared,
            id,
            prost_types::Timestamp::default(),
        )
        .unwrap()
        .transaction()
        .clone();
        let owner = ExplicitAbortOwner::new(4).unwrap();
        let cancel = RecoveryCancellation::new();
        let mut supervisor = tokio::task::JoinSet::new();
        owner
            .recovery_registration()
            .start(&mut supervisor, cancel.clone())
            .await
            .unwrap();
        let registered = RegisteredRoot::admit_shared_existing_writers(
            &participant,
            context.clone(),
            coordinator(sidecar.clone(), endpoint.clone()),
            &owner,
        )
        .unwrap();
        let local = participant
            .start_local(
                ActorTransactionStart {
                    transaction_ids: vec![id],
                    transaction_path: crate::durable_participant::TransactionPathContract::RootOnly,
                    coordinator_state_type: "example.Actor".into(),
                    coordinator_state_ref: "actor/1".into(),
                    mode: TransactionMode::Shared,
                    read_only: false,
                    factory: false,
                    state_type: "example.Actor".into(),
                    state_ref: "actor/1".into(),
                },
                ParticipantStartMode::SharedUpgradeable,
            )
            .await
            .unwrap();
        let guard = registered
            .admitted(local)
            .await
            .unwrap()
            .with_shared_existing_writers(&mut context)
            .await
            .unwrap();
        Fixture {
            context,
            guard,
            sidecar,
            local_sidecar,
            endpoint,
            owner,
            cancel,
            supervisor,
        }
    }
    fn shared_start_for(context: &TransactionContext) -> RootCoordinatorStart {
        let mut s = start(context.transaction_root_id());
        s.mode = TransactionMode::Shared;
        s.read_only = true;
        s
    }
    fn account(name: &str, read_only: bool) -> ReturnedParticipant {
        ReturnedParticipant {
            target: ParticipantTarget {
                state_type: "example.Account".into(),
                state_ref: name.into(),
            },
            read_only,
        }
    }
    async fn stop(f: &mut Fixture) {
        f.cancel.cancel();
        while let Some(result) = f.supervisor.join_next().await {
            let _ = result.unwrap();
        }
    }

    #[tokio::test]
    async fn pre_load_construction_cancel_releases_registration_without_native_control() {
        let mut f = fixture(false, false).await;
        // Pre-handler abort of the real shared root must also be local-only.
        f.guard.abort_explicit().await.unwrap();
        assert_eq!(*f.local_sidecar.calls.lock().unwrap(), vec!["load"]);
        assert!(matches!(
            f.sidecar.calls.lock().unwrap().as_slice(),
            [Call::DecisionPut(_)]
        ));
        assert!(
            f.owner
                .validate_builtin_root(f.context.transaction_root_id())
                .is_err()
        );
        f.cancel.cancel();
        while let Some(result) = f.supervisor.join_next().await {
            result.unwrap().unwrap();
        }
    }

    #[tokio::test]
    async fn dropped_pre_load_registration_does_not_fabricate_abort() {
        let mut f = fixture(false, false).await;
        let local_sidecar = f.local_sidecar.clone();
        let participant = DurableActorParticipant::new(local_sidecar, "example.Actor", "actor/1");
        let root = Uuid::new_v4();
        let context = RootTransactionContext::start(
            RebootHeaders::new("actor/1"),
            "example.Actor",
            TransactionMode::Shared,
            root,
            prost_types::Timestamp::default(),
        )
        .unwrap()
        .transaction()
        .clone();
        let registered = RegisteredRoot::admit_shared_existing_writers(
            &participant,
            context,
            coordinator(f.sidecar.clone(), f.endpoint.clone()),
            &f.owner,
        )
        .unwrap();
        assert!(f.owner.validate_builtin_root(root).is_ok());
        drop(registered);
        assert!(f.owner.validate_builtin_root(root).is_err());
        assert!(f.sidecar.calls.lock().unwrap().is_empty());
        assert_eq!(*f.local_sidecar.calls.lock().unwrap(), vec!["load"]);
        stop(&mut f).await;
    }

    #[tokio::test]
    async fn immutable_shared_root_state_rejects_before_native_io() {
        let mut f = fixture(false, false).await;
        assert!(
            f.guard
                .stage_effects(PendingActorEffects {
                    state: Some(vec![99]),
                    ..Default::default()
                })
                .await
                .is_err()
        );
        assert!(f.context.doomed_status().is_some());
        assert_eq!(*f.local_sidecar.calls.lock().unwrap(), vec!["load"]);
        assert!(f.sidecar.calls.lock().unwrap().is_empty());
        stop(&mut f).await;
    }

    #[tokio::test]
    async fn caller_metadata_cannot_mint_shared_membership() {
        for nested in [false, true] {
            let mut f = fixture(false, false).await;
            let alias = if nested {
                f.context
                    .with_nested_transaction_id(Uuid::new_v4())
                    .unwrap()
            } else {
                f.context.clone()
            };
            let mut status = Status::unknown("forged writer");
            crate::successful_trailers::ParticipantMetadata::classified_single(
                "example.Account",
                "A",
                false,
                true,
            )
            .unwrap()
            .attach_to_status(&mut status);
            let forged =
                crate::successful_trailers::ReturnedParticipants::from_metadata(status.metadata())
                    .unwrap();
            alias.enlist_returned_participants(&forged);
            assert!(f.context.doomed_status().is_some());
            assert!(f.context.returned_participants_snapshot().is_empty());
            assert!(
                SettledSharedWriterRoot::from_guard(
                    shared_start_for(&f.context),
                    f.context.clone(),
                )
                .is_err()
            );
            stop(&mut f).await;
        }
    }

    #[tokio::test]
    async fn member_alias_cannot_drain_confirmed_parent_writer_membership() {
        let mut f = fixture(false, false).await;
        f.context
            .test_shared_confirmed_membership(vec![account("A", false)]);
        for alias in [
            f.context.clone(),
            f.context
                .with_nested_transaction_id(Uuid::new_v4())
                .unwrap(),
        ] {
            let observed = alias.take_returned_participants();
            assert_eq!(observed.len(), 1);
            assert_eq!(observed[0].target, account("A", false).target);
            assert!(!observed[0].read_only);
            let retained = f.context.returned_participants_snapshot();
            assert_eq!(retained.len(), 1);
            assert_eq!(retained[0].target, observed[0].target);
            assert!(!retained[0].read_only);
        }
        assert!(f.context.doomed_status().is_none());
        stop(&mut f).await;
    }

    #[tokio::test]
    async fn shared_policy_does_not_widen_generic_completion_or_exclusive_tree() {
        let mut f = fixture(false, false).await;
        assert!(f.context.validate_tree_scope().is_err());
        let s = shared_start_for(&f.context);
        assert!(
            DurableRootCoordinator::<MockSidecar, MockResolver>::participant_set(
                &s,
                vec![account("A", false)]
            )
            .is_err()
        );
        assert!(
            f.guard
                .test_shared_coordinator()
                .complete_with_classified_returned_participants(s, vec![account("A", false)])
                .await
                .is_err()
        );
        assert!(f.sidecar.calls.lock().unwrap().is_empty());
        stop(&mut f).await;
    }

    #[tokio::test]
    async fn owner_receipt_serializes_full_truthful_membership_before_any_prepare() {
        let mut f = fixture(false, false).await;
        f.context.test_shared_confirmed_membership(vec![
            account("A", true),
            account("A", false),
            account("C", false),
        ]);
        let local = f.guard.test_shared_local();
        local.stage(PendingActorEffects::default()).await.unwrap();
        let receipt =
            SettledSharedWriterRoot::from_guard(shared_start_for(&f.context), f.context.clone())
                .unwrap();
        local.end_execution().await.unwrap();
        f.guard.test_handoff();
        assert!(
            f.guard
                .test_shared_coordinator()
                .complete_shared_writer_outcome(receipt, f.guard.test_shared_local())
                .await
                .unwrap()
        );
        f.guard.test_completed().unwrap();
        {
            let calls = f.sidecar.calls.lock().unwrap();
            let Call::DbPrepare(request) = &calls[0] else {
                panic!("Preparing must precede any Prepare");
            };
            let record = request.transaction_coordinator.as_ref().unwrap();
            assert!(record.preparing);
            let members = record.participants.as_ref().unwrap();
            assert_eq!(
                members.read_only["example.Actor"].state_refs,
                vec!["actor/1"]
            );
            assert_eq!(
                members.should_commit["example.Account"].state_refs,
                vec!["A", "C"]
            );
            assert!(matches!(calls.last(), Some(Call::Cleanup(_))));
        }
        assert_eq!(
            *f.local_sidecar.calls.lock().unwrap(),
            vec!["load"],
            "read-only root never emits actor-only native controls"
        );
        assert_eq!(
            f.endpoint
                .calls
                .lock()
                .unwrap()
                .iter()
                .filter(|c| matches!(c, Call::Prepare(_)))
                .count(),
            2,
            "root must not self-resolve"
        );
        stop(&mut f).await;
    }

    #[tokio::test]
    async fn preparing_ambiguity_retains_full_record_without_abort_or_cleanup() {
        let mut f = fixture(false, false).await;
        f.context
            .test_shared_confirmed_membership(vec![account("A", false), account("C", false)]);
        f.endpoint.prepares.lock().unwrap().extend([
            Ok(database::PrepareResponse {
                abort: true,
                ..Default::default()
            }),
            Err(Status::unavailable("account Prepare ACK lost")),
        ]);
        let local = f.guard.test_shared_local();
        local.stage(PendingActorEffects::default()).await.unwrap();
        let receipt =
            SettledSharedWriterRoot::from_guard(shared_start_for(&f.context), f.context.clone())
                .unwrap();
        local.end_execution().await.unwrap();
        f.guard.test_handoff();
        assert_eq!(
            f.guard
                .test_shared_coordinator()
                .complete_shared_writer_outcome(receipt, f.guard.test_shared_local())
                .await
                .unwrap_err()
                .code(),
            tonic::Code::Unavailable
        );
        assert!(matches!(
            f.sidecar.calls.lock().unwrap().as_slice(),
            [Call::DbPrepare(_)]
        ));
        assert_eq!(
            f.endpoint
                .calls
                .lock()
                .unwrap()
                .iter()
                .filter(|c| matches!(c, Call::Prepare(_)))
                .count(),
            2
        );
        assert_eq!(*f.local_sidecar.calls.lock().unwrap(), vec!["load"]);
        drop(f.guard);
        assert!(
            f.owner
                .validate_builtin_root(f.context.transaction_root_id())
                .is_err()
        );
        f.cancel.cancel();
        while let Some(result) = f.supervisor.join_next().await {
            let _ = result.unwrap();
        }
    }

    #[tokio::test]
    async fn unpolled_coordinator_future_after_handoff_retains_host_obligation() {
        let mut f = fixture(false, false).await;
        let receipt =
            SettledSharedWriterRoot::from_guard(shared_start_for(&f.context), f.context.clone())
                .unwrap();
        f.guard.test_shared_local().end_execution().await.unwrap();
        f.guard.test_handoff();
        // Deliberately do not poll: phase transfer MUST precede construction.
        let future = f
            .guard
            .test_shared_coordinator()
            .complete_shared_writer_outcome(receipt, f.guard.test_shared_local());
        drop(future);
        assert!(f.sidecar.calls.lock().unwrap().is_empty());
        drop(f.guard);
        assert!(
            f.owner
                .validate_builtin_root(f.context.transaction_root_id())
                .is_err()
        );
        f.cancel.cancel();
        while let Some(result) = f.supervisor.join_next().await {
            let _ = result.unwrap();
        }
    }

    #[tokio::test]
    async fn readonly_local_release_before_lost_decision_or_terminal_ack_retains_root_owner() {
        for decision_lost in [true, false] {
            let mut f = fixture(decision_lost, !decision_lost).await;
            f.context
                .test_shared_confirmed_membership(vec![account("A", false)]);
            if !decision_lost {
                f.endpoint
                    .prepares
                    .lock()
                    .unwrap()
                    .push_back(Ok(database::PrepareResponse {
                        abort: true,
                        ..Default::default()
                    }));
            }
            let local = f.guard.test_shared_local();
            local.stage(PendingActorEffects::default()).await.unwrap();
            let receipt = SettledSharedWriterRoot::from_guard(
                shared_start_for(&f.context),
                f.context.clone(),
            )
            .unwrap();
            local.end_execution().await.unwrap();
            f.guard.test_handoff();
            assert!(
                f.guard
                    .test_shared_coordinator()
                    .complete_shared_writer_outcome(receipt, f.guard.test_shared_local())
                    .await
                    .is_err()
            );
            // The legitimate read-only Prepare has released its OWN local slot.
            // Missing local slot is not permission to fabricate actor-native Abort.
            assert!(f.guard.test_shared_local().end_execution().await.is_err());
            assert!(
                f.guard
                    .test_shared_local()
                    .prepare_owned_read_only()
                    .await
                    .is_err()
            );
            assert_eq!(*f.local_sidecar.calls.lock().unwrap(), vec!["load"]);
            assert!(
                !f.sidecar
                    .calls
                    .lock()
                    .unwrap()
                    .iter()
                    .any(|call| matches!(call, Call::Cleanup(_)))
            );
            drop(f.guard);
            assert!(
                f.owner
                    .validate_builtin_root(f.context.transaction_root_id())
                    .is_err()
            );
            assert_eq!(*f.local_sidecar.calls.lock().unwrap(), vec!["load"]);
            f.cancel.cancel();
            while let Some(result) = f.supervisor.join_next().await {
                let _ = result.unwrap();
            }
        }
    }

    #[tokio::test]
    async fn n1_staged_then_failed_next_target_publishes_abort_not_preparing() {
        let f = fixture(false, false).await;
        // The private fault fixture models confirmed successful Account trailers.
        // N1 is staged/uncommitted, never an independently durable Commit.
        f.context
            .test_shared_confirmed_membership(vec![account("A", false)]);
        f.guard.abort_explicit().await.unwrap();
        {
            let calls = f.sidecar.calls.lock().unwrap();
            assert!(
                matches!(calls.as_slice(), [Call::DecisionPut(request)] if request.decision.as_ref().unwrap().outcome == database::transaction_coordinator_decision::Outcome::Abort as i32)
            );
            assert_eq!(*f.endpoint.abort_targets.lock().unwrap(), vec!["A"]);
            assert_eq!(*f.local_sidecar.calls.lock().unwrap(), vec!["load"]);
        }
        f.cancel.cancel();
        let mut supervisor = f.supervisor;
        while let Some(result) = supervisor.join_next().await {
            result.unwrap().unwrap();
        }
    }

    #[tokio::test]
    async fn immutable_abort_ack_loss_retains_registration_and_never_sends_prepare() {
        let f = fixture(true, false).await;
        let root = f.context.transaction_root_id();
        f.context
            .test_shared_confirmed_membership(vec![account("A", false)]);
        assert!(f.guard.abort_explicit().await.is_err());
        assert!(matches!(
            f.sidecar.calls.lock().unwrap().as_slice(),
            [Call::DecisionPut(_)]
        ));
        assert!(f.endpoint.calls.lock().unwrap().is_empty());
        assert!(
            f.owner.validate_builtin_root(root).is_err(),
            "sticky failed host cannot mint new authority"
        );
        f.cancel.cancel();
        let mut supervisor = f.supervisor;
        while let Some(result) = supervisor.join_next().await {
            let _ = result.unwrap();
        }
    }

    #[tokio::test]
    async fn completion_rejects_unexecuted_handler_and_wrong_start_before_io() {
        let mut f = fixture(false, false).await;
        let mut s = shared_start_for(&f.context);
        s.participant.state_ref = "forged".into();
        assert!(
            f.guard
                .test_shared_coordinator()
                .validate_shared_writer_start(&s, f.guard.test_shared_local(), &f.context)
                .is_err()
        );
        assert!(f.sidecar.calls.lock().unwrap().is_empty());
        assert!(f.guard.test_shared_registration().is_err());
        let reconstructed =
            TransactionContext::from_headers(f.context.headers().clone(), TransactionMode::Shared)
                .unwrap();
        assert!(!reconstructed.shared_existing_writer_root());
        stop(&mut f).await;
    }

    #[tokio::test]
    async fn definitive_reject_and_ambiguous_prepare_all_settle_and_ambiguity_wins() {
        struct Endpoint {
            settled: Arc<AtomicUsize>,
        }
        impl ParticipantEndpoint for Endpoint {
            fn prepare(
                &self,
                target: &str,
                _: database::PrepareRequest,
            ) -> CoordinatorFuture<'_, database::PrepareResponse> {
                let target = target.to_owned();
                let settled = self.settled.clone();
                Box::pin(async move {
                    tokio::task::yield_now().await;
                    settled.fetch_add(1, Ordering::SeqCst);
                    if target == "A" {
                        Ok(database::PrepareResponse {
                            abort: true,
                            ..Default::default()
                        })
                    } else {
                        Err(Status::unavailable("Prepare ACK lost"))
                    }
                })
            }
            fn commit(
                &self,
                _: &str,
                _: database::CommitRequest,
            ) -> CoordinatorFuture<'_, database::CommitResponse> {
                Box::pin(async { panic!("ambiguous Prepare must not commit") })
            }
            fn abort(
                &self,
                _: &str,
                _: database::AbortRequest,
            ) -> CoordinatorFuture<'_, database::AbortResponse> {
                Box::pin(async { panic!("ambiguity dominates definitive rejection") })
            }
        }
        struct Resolver(Arc<Endpoint>);
        impl ParticipantResolver for Resolver {
            type Endpoint = Endpoint;
            fn resolve(&self, _: &ParticipantTarget) -> CoordinatorFuture<'_, Arc<Endpoint>> {
                let endpoint = self.0.clone();
                Box::pin(async move { Ok(endpoint) })
            }
        }
        let settled = Arc::new(AtomicUsize::new(0));
        let sidecar = Arc::new(MockSidecar::default());
        let coordinator = DurableRootCoordinator::new(
            sidecar.clone(),
            Arc::new(Resolver(Arc::new(Endpoint {
                settled: settled.clone(),
            }))),
        );
        let targets = [account("A", false).target, account("C", false).target];
        let result = coordinator
            .prepare_participants(Uuid::new_v4(), targets.iter().map(|target| (target, false)))
            .await;
        assert_eq!(result.unwrap_err().code(), tonic::Code::Unavailable);
        assert_eq!(settled.load(Ordering::SeqCst), 2);
        assert!(sidecar.calls.lock().unwrap().is_empty());
    }
}
