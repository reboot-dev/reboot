// Included in durable_participant::tests: causal pre-Recover construction fence.
struct BindingRecoveryProbe {
    inner: MockSidecar,
    binding: std::sync::Mutex<Option<ParticipantActorGate>>,
    constructed: std::sync::atomic::AtomicUsize,
    release: tokio::sync::Notify,
}
impl ParticipantSidecar for BindingRecoveryProbe {
    fn load(&self, request: database::LoadRequest) -> SidecarFuture<'_, database::LoadResponse> {
        self.inner.load(request)
    }
    fn prepare(
        &self,
        request: database::TransactionParticipantPrepareRequest,
    ) -> SidecarFuture<'_, database::TransactionParticipantPrepareResponse> {
        self.inner.prepare(request)
    }
    fn commit(
        &self,
        request: database::TransactionParticipantCommitRequest,
    ) -> SidecarFuture<'_, database::TransactionParticipantCommitResponse> {
        self.inner.commit(request)
    }
    fn abort(
        &self,
        request: database::TransactionParticipantAbortRequest,
    ) -> SidecarFuture<'_, database::TransactionParticipantAbortResponse> {
        self.inner.abort(request)
    }
    fn recover(
        &self,
        request: database::RecoverRequest,
    ) -> SidecarFuture<'_, Vec<database::RecoverResponse>> {
        // Inspect synchronously before even constructing the sidecar future.
        let binding = self.binding.lock().unwrap().as_ref().unwrap().clone();
        assert!(
            binding.binding.lock().unwrap().started,
            "binding must freeze before Recover construction"
        );
        self.constructed
            .fetch_add(1, std::sync::atomic::Ordering::SeqCst);
        Box::pin(async move {
            self.release.notified().await;
            self.inner.recover(request).await
        })
    }
    fn recover_idempotent_mutations(
        &self,
        request: database::RecoverIdempotentMutationsRequest,
    ) -> SidecarFuture<'_, Vec<database::RecoverIdempotentMutationsResponse>> {
        self.inner.recover_idempotent_mutations(request)
    }
}

#[tokio::test]
async fn actor_gate_binding_recovery_freezes_before_io_and_survives_cancel_error_empty() {
    for outcome in ["cancel", "error", "empty"] {
        let sidecar = Arc::new(BindingRecoveryProbe {
            inner: MockSidecar::default(),
            binding: std::sync::Mutex::new(None),
            constructed: std::sync::atomic::AtomicUsize::new(0),
            release: tokio::sync::Notify::new(),
        });
        if outcome == "error" {
            sidecar
                .inner
                .recover_responses
                .lock()
                .unwrap()
                .push_back(Err(Status::unavailable("held recovery failed")));
        }
        let actor = DurableActorParticipant::new(sidecar.clone(), "example.Actor", "actor/1");
        *sidecar.binding.lock().unwrap() = Some(actor.lock.clone());
        let initial_gate = actor.lock.gate();
        let mut pending = Box::pin(actor.recover(recovery()));
        assert_slot_future_pending(pending.as_mut()).await;
        assert_eq!(
            sidecar
                .constructed
                .load(std::sync::atomic::Ordering::SeqCst),
            1
        );
        let store = binding_store();
        // Generic equivalent of assert_binding_rejected for this probe boundary.
        assert!(
            std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| actor
                .clone()
                .with_database_actor_gate(&store)))
            .is_err()
        );
        assert_slot_future_pending(pending.as_mut()).await;
        if outcome == "cancel" {
            drop(pending);
        } else {
            sidecar.release.notify_one();
            let result = tokio::time::timeout(std::time::Duration::from_secs(1), pending)
                .await
                .unwrap();
            if outcome == "error" {
                let error = result.unwrap_err();
                assert_eq!(error.code(), tonic::Code::Unavailable);
                assert_eq!(error.message(), "held recovery failed");
            } else {
                result.unwrap();
            }
        }
        assert!(actor.pending.snapshot().is_empty());
        assert!(!store.owns_actor_gate(&actor.lock.gate(), "example.Actor", "actor/1"));
        // Cancellation/error/empty recovery never opens an unsafe rebind window.
        assert!(
            std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| actor
                .clone()
                .with_database_actor_gate(&store)))
            .is_err()
        );
        assert_eq!(
            sidecar
                .constructed
                .load(std::sync::atomic::Ordering::SeqCst),
            1
        );
        // The retained private binding remains usable and was not poisoned.
        let reader = tokio::time::timeout(std::time::Duration::from_secs(1), initial_gate.shared())
            .await
            .unwrap();
        let peer = tokio::time::timeout(std::time::Duration::from_secs(1), actor.lock.shared())
            .await
            .unwrap();
        drop((reader, peer));
    }
}
