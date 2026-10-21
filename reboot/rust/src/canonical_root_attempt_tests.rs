#[cfg(test)]
mod canonical_root_attempt_tests {
    use super::*;
    use crate::durable_participant::ParticipantSidecar;
    type Reply<'a, T> = Pin<Box<dyn Future<Output = Result<T, Status>> + Send + 'a>>;
    #[derive(Default)]
    struct Memory {
        rows: Mutex<Vec<database::IdempotentMutation>>,
        lost_ack: std::sync::atomic::AtomicBool,
        writes: std::sync::atomic::AtomicUsize,
    }
    macro_rules! unused_rpc {
        ($name:ident, $req:ty, $resp:ty) => {
            fn $name(&self, _: $req) -> Reply<'_, $resp> {
                Box::pin(async { panic!("unexpected native RPC") })
            }
        };
    }
    impl ParticipantSidecar for Memory {
        unused_rpc!(load, database::LoadRequest, database::LoadResponse);
        unused_rpc!(
            prepare,
            database::TransactionParticipantPrepareRequest,
            database::TransactionParticipantPrepareResponse
        );
        unused_rpc!(
            commit,
            database::TransactionParticipantCommitRequest,
            database::TransactionParticipantCommitResponse
        );
        unused_rpc!(
            abort,
            database::TransactionParticipantAbortRequest,
            database::TransactionParticipantAbortResponse
        );
        unused_rpc!(
            recover,
            database::RecoverRequest,
            Vec<database::RecoverResponse>
        );
        fn store(&self, request: database::StoreRequest) -> Reply<'_, database::StoreResponse> {
            Box::pin(async move {
                assert!(request.actor_upserts.is_empty());
                assert!(request.task_upserts.is_empty());
                let mutation = request.idempotent_mutation.unwrap();
                let mut rows = self.rows.lock().unwrap();
                rows.retain(|row| row.key != mutation.key);
                rows.push(mutation);
                self.writes
                    .fetch_add(1, std::sync::atomic::Ordering::SeqCst);
                if self
                    .lost_ack
                    .swap(false, std::sync::atomic::Ordering::SeqCst)
                {
                    return Err(Status::unavailable("lost real Store ACK"));
                }
                Ok(Default::default())
            })
        }
        fn recover_idempotent_mutations(
            &self,
            request: database::RecoverIdempotentMutationsRequest,
        ) -> Reply<'_, Vec<database::RecoverIdempotentMutationsResponse>> {
            Box::pin(async move {
                Ok(vec![database::RecoverIdempotentMutationsResponse {
                    idempotent_mutations: self
                        .rows
                        .lock()
                        .unwrap()
                        .iter()
                        .filter(|r| request.idempotency_key.as_deref() == Some(r.key.as_slice()))
                        .cloned()
                        .collect(),
                }])
            })
        }
    }
    struct Factory(std::sync::atomic::AtomicUsize);
    impl RootTransactionStartFactory for Factory {
        fn next_root_transaction(&self) -> Result<RootTransactionStart, Status> {
            let n = self.0.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
            Ok(RootTransactionStart {
                transaction_id: Uuid::from_u128(n as u128 + 42),
                timestamp: Default::default(),
            })
        }
    }
    fn headers() -> RebootHeaders {
        let mut h = RebootHeaders::new("root");
        h.idempotency_key = Some(Uuid::from_u128(8));
        h.workflow_id = Some(Uuid::from_u128(9));
        h
    }
    async fn start(
        h: RebootHeaders,
        memory: &Memory,
        factory: &Factory,
    ) -> Result<TransactionContext, Status> {
        Ok(start_canonical_root_transaction(
            h,
            "test.Root",
            "test.Root.Apply",
            &(),
            factory,
            memory,
        )
        .await?
        .transaction()
        .clone())
    }
    fn bind(context: &mut TransactionContext) {
        let receipt = context.idempotency("test.Root.Apply", &()).unwrap();
        context.bind_generated_root_receipt(&receipt).unwrap();
    }
    #[tokio::test]
    async fn original_root_is_durable_before_effect_and_restored_without_factory() {
        let memory = Arc::new(Memory::default());
        let factory = Factory(std::sync::atomic::AtomicUsize::new(0));
        let mut first = start(headers(), &memory, &factory).await.unwrap();
        bind(&mut first);
        first
            .install_canonical_root_attempt(memory.clone(), &[])
            .await
            .unwrap();
        assert_eq!(memory.writes.load(std::sync::atomic::Ordering::SeqCst), 1);
        let mut recovered = start(headers(), &memory, &factory).await.unwrap();
        assert_eq!(first.transaction_root_id(), recovered.transaction_root_id());
        assert_eq!(factory.0.load(std::sync::atomic::Ordering::SeqCst), 1);
        bind(&mut recovered);
        recovered
            .install_canonical_root_attempt(memory.clone(), &[])
            .await
            .unwrap();
    }
    #[tokio::test]
    async fn remote_intent_survives_lost_ack_and_forbids_reexecution_not_terminal() {
        let memory = Arc::new(Memory::default());
        let factory = Factory(std::sync::atomic::AtomicUsize::new(0));
        let mut first = start(headers(), &memory, &factory).await.unwrap();
        bind(&mut first);
        first
            .install_canonical_root_attempt(memory.clone(), &[])
            .await
            .unwrap();
        memory
            .lost_ack
            .store(true, std::sync::atomic::Ordering::SeqCst);
        let target = crate::durable_coordinator::ParticipantTarget {
            state_type: "test.Child".into(),
            state_ref: "child".into(),
        };
        assert_eq!(
            first
                .canonical_root_attempt
                .as_ref()
                .unwrap()
                .before_remote(&target, "test.Child.Apply")
                .await
                .unwrap_err()
                .code(),
            tonic::Code::Unavailable
        );
        let mut recovered = start(headers(), &memory, &factory).await.unwrap();
        assert_eq!(first.transaction_root_id(), recovered.transaction_root_id());
        bind(&mut recovered);
        assert_eq!(
            recovered
                .install_canonical_root_attempt(memory.clone(), &[])
                .await
                .unwrap_err()
                .code(),
            tonic::Code::Unavailable
        );
        let rows = memory.rows.lock().unwrap();
        assert_eq!(rows.len(), 1);
        assert_ne!(rows[0].key, headers().idempotency_key.unwrap().as_bytes());
        let record = CanonicalRootAttemptRecord::decode(rows[0].response.as_slice()).unwrap();
        assert_eq!(record.members.len(), 1);
        assert_eq!(record.members[0].state_ref, "child");
    }
    #[tokio::test]
    async fn root_intent_rejects_scope_fingerprint_and_duplicate_records() {
        let memory = Arc::new(Memory::default());
        let factory = Factory(std::sync::atomic::AtomicUsize::new(0));
        let mut first = start(headers(), &memory, &factory).await.unwrap();
        bind(&mut first);
        first
            .install_canonical_root_attempt(memory.clone(), &[])
            .await
            .unwrap();
        let mut changed = headers();
        changed.workflow_id = Some(Uuid::from_u128(99));
        assert_eq!(
            start(changed, &memory, &factory).await.unwrap_err().code(),
            tonic::Code::DataLoss
        );
        memory.rows.lock().unwrap()[0].request_fingerprint = None;
        assert_eq!(
            start(headers(), &memory, &factory)
                .await
                .unwrap_err()
                .code(),
            tonic::Code::FailedPrecondition
        );
    }

    #[tokio::test]
    async fn competing_prebinding_context_cannot_replace_saved_original() {
        let memory = Arc::new(Memory::default());
        let factory = Factory(std::sync::atomic::AtomicUsize::new(0));
        let mut first = start(headers(), &memory, &factory).await.unwrap();
        let mut competitor = start(headers(), &memory, &factory).await.unwrap();
        assert_ne!(
            first.transaction_root_id(),
            competitor.transaction_root_id()
        );
        bind(&mut first);
        bind(&mut competitor);
        first
            .install_canonical_root_attempt(memory.clone(), &[])
            .await
            .unwrap();
        let original = memory.rows.lock().unwrap().clone();
        assert_eq!(
            competitor
                .install_canonical_root_attempt(memory.clone(), &[])
                .await
                .unwrap_err()
                .code(),
            tonic::Code::Unavailable
        );
        assert_eq!(*memory.rows.lock().unwrap(), original);
    }

    #[tokio::test]
    async fn duplicate_remote_intent_and_duplicate_rows_fail_closed() {
        let memory = Arc::new(Memory::default());
        let factory = Factory(std::sync::atomic::AtomicUsize::new(0));
        let mut context = start(headers(), &memory, &factory).await.unwrap();
        bind(&mut context);
        context
            .install_canonical_root_attempt(memory.clone(), &[])
            .await
            .unwrap();
        let target = crate::durable_coordinator::ParticipantTarget {
            state_type: "test.Child".into(),
            state_ref: "child".into(),
        };
        let journal = context.canonical_root_attempt.as_ref().unwrap();
        journal
            .before_remote(&target, "test.Child.Apply")
            .await
            .unwrap();
        let writes = memory.writes.load(std::sync::atomic::Ordering::SeqCst);
        assert_eq!(
            journal
                .before_remote(&target, "test.Child.Apply")
                .await
                .unwrap_err()
                .code(),
            tonic::Code::FailedPrecondition
        );
        assert_eq!(
            memory.writes.load(std::sync::atomic::Ordering::SeqCst),
            writes
        );
        let duplicate = memory.rows.lock().unwrap()[0].clone();
        memory.rows.lock().unwrap().push(duplicate);
        assert_eq!(
            start(headers(), &memory, &factory)
                .await
                .unwrap_err()
                .code(),
            tonic::Code::FailedPrecondition
        );
    }
}
