// Included inside durable_participant::tests; model-only, no native acceptance.
type Recovery681Future<'a, T> =
    std::pin::Pin<Box<dyn std::future::Future<Output = Result<T, Status>> + Send + 'a>>;
struct Recovery681Coordinator {
    decisions: Mutex<Vec<database::TransactionCoordinatorDecisionPutRequest>>,
    cleanup: tokio::sync::Semaphore,
    decision_entered: tokio::sync::Notify,
}

impl Default for Recovery681Coordinator {
    fn default() -> Self {
        Self {
            decisions: Mutex::new(Vec::new()),
            cleanup: tokio::sync::Semaphore::new(0),
            decision_entered: tokio::sync::Notify::new(),
        }
    }
}

impl crate::durable_coordinator::CoordinatorSidecar for Recovery681Coordinator {
    fn coordinator_prepare(
        &self,
        _: database::TransactionCoordinatorPrepareRequest,
    ) -> Recovery681Future<'_, database::TransactionCoordinatorPrepareResponse> {
        panic!("recovery must not begin another coordinator transaction")
    }
    fn coordinator_prepared(
        &self,
        _: database::TransactionCoordinatorPreparedRequest,
    ) -> Recovery681Future<'_, database::TransactionCoordinatorPreparedResponse> {
        panic!("unprepared participant must prevent Commit")
    }
    fn coordinator_cleanup(
        &self,
        _: database::TransactionCoordinatorCleanupRequest,
    ) -> Recovery681Future<'_, database::TransactionCoordinatorCleanupResponse> {
        Box::pin(async move {
            self.cleanup.acquire().await.unwrap().forget();
            Ok(Default::default())
        })
    }
    fn decision_put(
        &self,
        request: database::TransactionCoordinatorDecisionPutRequest,
    ) -> Recovery681Future<'_, database::TransactionCoordinatorDecisionPutResponse> {
        self.decisions.lock().unwrap().push(request);
        self.decision_entered.notify_one();
        Box::pin(async { Ok(Default::default()) })
    }
    fn decision_get(
        &self,
        _: database::TransactionCoordinatorDecisionGetRequest,
    ) -> Recovery681Future<'_, database::TransactionCoordinatorDecisionGetResponse> {
        Box::pin(async { Ok(Default::default()) })
    }
    fn recover(
        &self,
        _: database::RecoverRequest,
    ) -> Recovery681Future<'_, Vec<database::RecoverResponse>> {
        panic!("use the same validated EOF, never another scan")
    }
}

fn coordinator681(
    participant: &DurableActorParticipant<MockSidecar>,
    sidecar: Arc<Recovery681Coordinator>,
) -> crate::durable_coordinator::DurableRootCoordinator<
    Recovery681Coordinator,
    crate::durable_coordinator::SingleParticipantResolver<MockSidecar>,
> {
    use crate::durable_coordinator::*;
    DurableRootCoordinator::new(
        sidecar,
        Arc::new(
            SingleParticipantResolver::new(
                ParticipantTarget {
                    state_type: "example.Actor".into(),
                    state_ref: "actor/1".into(),
                },
                DurableActorParticipantHost::new(participant.clone()),
            )
            .unwrap(),
        ),
    )
}

fn page681(id: Uuid) -> database::RecoverResponse {
    database::RecoverResponse {
        participant_transactions: vec![recovered_transaction(id, false)],
        transaction_coordinators: [(
            id.to_string(),
            database::TransactionCoordinator {
                state_ref: "coordinator/1".into(),
                preparing: true,
                participants: Some(database::Participants {
                    should_commit: [(
                        "example.Actor".into(),
                        database::participants::StateRefs {
                            state_refs: vec!["actor/1".into()],
                        },
                    )]
                    .into(),
                    ..Default::default()
                }),
            },
        )]
        .into(),
        ..Default::default()
    }
}

#[tokio::test]
async fn source681_prepare_before_watch_is_not_a_definitive_abort() {
    let id = Uuid::from_u128(68101);
    let sidecar = recovered_sidecar(id, false);
    let participant = DurableActorParticipant::new(sidecar.clone(), "example.Actor", "actor/1");
    participant.recover(recovery()).await.unwrap();
    let control = Arc::new(Recovery681Coordinator::default());
    let coordinator = coordinator681(&participant, control.clone());
    let snapshot = coordinator
        .validate_recovery_snapshot("coordinator/1", &[page681(id)])
        .unwrap();
    // Causally force the replay to complete before Watch is permitted to poll.
    // This is a legal scheduling of the original replay/Watch try_join.
    let (sent, received) = tokio::sync::oneshot::channel();
    let watch = MockWatch::default();
    let replay = async {
        let result = coordinator.adopt_recovery_snapshot(snapshot).await;
        sent.send(()).unwrap();
        result
    };
    let watches = async {
        received.await.unwrap();
        participant.watch_recovered(&watch).await
    };
    let (result, watched) = tokio::join!(replay, watches);
    assert_eq!(result.unwrap_err().code(), tonic::Code::FailedPrecondition);
    watched.unwrap();
    assert!(control.decisions.lock().unwrap().is_empty());
    assert!(watch.requests.lock().unwrap().is_empty());
    assert!(matches!(
        sidecar.calls.lock().unwrap().as_slice(),
        [Call::Recover(_), Call::Abort(_)]
    ));
}

#[tokio::test]
async fn source681_original_abort_ack_precedes_replay_and_join_precedes_completion() {
    use std::{
        future::Future,
        task::{Context, Poll, Waker},
    };
    let waker = Waker::noop();
    let mut cx = Context::from_waker(waker);
    let id = Uuid::from_u128(68102);
    let sidecar = recovered_sidecar(id, false);
    let (entered_tx, mut entered_rx) = tokio::sync::oneshot::channel();
    let (ack_tx, ack_rx) = tokio::sync::oneshot::channel();
    *sidecar.abort_park.lock().unwrap() = Some((entered_tx, ack_rx));
    let participant = DurableActorParticipant::new(sidecar.clone(), "example.Actor", "actor/1");
    participant.recover(recovery()).await.unwrap();
    let control = Arc::new(Recovery681Coordinator::default());
    let coordinator = coordinator681(&participant, control.clone());
    let snapshot = coordinator
        .validate_recovery_snapshot("coordinator/1", &[page681(id)])
        .unwrap();
    let watch = MockWatch::default();
    let work = async {
        participant.converge_recovered_unprepared().await?;
        tokio::try_join!(
            coordinator.adopt_recovery_snapshot(snapshot),
            participant.watch_recovered(&watch)
        )?;
        Ok::<_, Status>(()) // model convergence completion, NOT a Host Ready bit
    };
    tokio::pin!(work);
    assert!(matches!(work.as_mut().poll(&mut cx), Poll::Pending));
    entered_rx.try_recv().unwrap(); // actual Abort entered, ACK withheld
    assert!(control.decisions.lock().unwrap().is_empty());
    assert!(participant.pending.lookup(id).try_lock_owned().is_err());
    let replacement = participant.start(start(Uuid::from_u128(68103)));
    tokio::pin!(replacement);
    assert!(matches!(replacement.as_mut().poll(&mut cx), Poll::Pending));
    // No fabricated vote: public Prepare still waits behind the exact slot ACK.
    let prepare = participant.prepare(id, false, false);
    tokio::pin!(prepare);
    assert!(matches!(prepare.as_mut().poll(&mut cx), Poll::Pending));
    ack_tx.send(()).unwrap();
    // Drive the ACK first, then the queued public Prepare waiter, before driving
    // Watch (Tokio's mutex is FIFO; leaving that waiter unpolled would deadlock).
    assert!(matches!(work.as_mut().poll(&mut cx), Poll::Pending));
    assert!(matches!(
        prepare.as_mut().poll(&mut cx),
        Poll::Ready(Ok(PrepareOutcome::DefinitiveAbort))
    ));
    // Actual replay emits the durable Abort; Cleanup stays causally blocked.
    tokio::select! {
        result = &mut work => panic!("completion before Cleanup join: {result:?}"),
        _ = control.decision_entered.notified() => {},
    }
    let decisions = control.decisions.lock().unwrap().clone();
    assert_eq!(decisions.len(), 1);
    assert_eq!(decisions[0].root_transaction_id, id.as_bytes());
    let decision = decisions[0].decision.as_ref().unwrap();
    assert_eq!(
        decision.outcome,
        database::transaction_coordinator_decision::Outcome::Abort as i32
    );
    assert!(decision.participants.is_none());
    assert!(matches!(work.as_mut().poll(&mut cx), Poll::Pending)); // join not complete
    control.cleanup.add_permits(1);
    work.await.unwrap();
    assert!(participant.pending.lock_root(id).await.is_none());
    assert!(watch.requests.lock().unwrap().is_empty());
    assert!(
        matches!(sidecar.calls.lock().unwrap().as_slice(), [Call::Recover(_), Call::Abort(request)] if request.state_ref == "actor/1")
    );
}

#[tokio::test]
async fn source681_unprepared_abort_ack_loss_retains_owner_and_forbids_replay_retry() {
    let id = Uuid::from_u128(68104);
    let sidecar = recovered_sidecar(id, false);
    sidecar
        .terminal_results
        .lock()
        .unwrap()
        .push_back(Err(Status::unavailable("lost Abort ACK")));
    let participant = DurableActorParticipant::new(sidecar.clone(), "example.Actor", "actor/1");
    participant.recover(recovery()).await.unwrap();
    assert_eq!(
        participant
            .converge_recovered_unprepared()
            .await
            .unwrap_err()
            .code(),
        tonic::Code::Unavailable
    );
    assert_eq!(
        participant
            .converge_recovered_unprepared()
            .await
            .unwrap_err()
            .code(),
        tonic::Code::Unavailable
    );
    assert_eq!(
        participant
            .prepare(id, false, false)
            .await
            .unwrap_err()
            .code(),
        tonic::Code::Unavailable
    );
    assert!(participant.pending.lock_root(id).await.is_some());
    assert!(matches!(
        sidecar.calls.lock().unwrap().as_slice(),
        [Call::Recover(_), Call::Abort(_)]
    ));
}
