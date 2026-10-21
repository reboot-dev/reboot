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
    struct TimestampFactory(prost_types::Timestamp);
    impl RootTransactionStartFactory for TimestampFactory {
        fn next_root_transaction(&self) -> Result<RootTransactionStart, Status> {
            Ok(RootTransactionStart {
                transaction_id: Uuid::from_u128(42),
                timestamp: self.0,
            })
        }
    }
    #[tokio::test]
    async fn nonzero_host_timestamps_refuse_before_intent_store() {
        for timestamp in [
            prost_types::Timestamp {
                seconds: 1,
                nanos: 0,
            },
            prost_types::Timestamp {
                seconds: 0,
                nanos: 1,
            },
            prost_types::Timestamp {
                seconds: -1,
                nanos: 0,
            },
        ] {
            let memory = Memory::default();
            let error = start_canonical_root_transaction(
                headers(),
                "test.Root",
                "test.Root.Apply",
                &(),
                &TimestampFactory(timestamp),
                &memory,
            )
            .await
            .unwrap_err();
            assert_eq!(error.code(), tonic::Code::FailedPrecondition);
            assert!(
                error
                    .message()
                    .contains("nonzero timestamp recovery is unsupported")
            );
            assert_eq!(memory.writes.load(std::sync::atomic::Ordering::SeqCst), 0);
            assert!(memory.rows.lock().unwrap().is_empty());
        }
    }
    #[tokio::test]
    async fn unversioned_intent_refuses_without_replacement_factory_or_write() {
        let memory = Arc::new(Memory::default());
        let factory = Factory(std::sync::atomic::AtomicUsize::new(0));
        let mut first = start(headers(), &memory, &factory).await.unwrap();
        bind(&mut first);
        first
            .install_canonical_root_attempt(memory.clone(), &[])
            .await
            .unwrap();
        {
            let mut rows = memory.rows.lock().unwrap();
            let mut record =
                CanonicalRootAttemptRecord::decode(rows[0].response.as_slice()).unwrap();
            record.zero_timestamp_verified = false;
            rows[0].response = record.encode_to_vec();
        }
        let before = memory.rows.lock().unwrap().clone();
        let error = start(headers(), &memory, &factory).await.unwrap_err();
        assert_eq!(error.code(), tonic::Code::FailedPrecondition);
        assert!(error.message().contains("no verified timestamp"));
        assert_eq!(factory.0.load(std::sync::atomic::Ordering::SeqCst), 1);
        assert_eq!(memory.writes.load(std::sync::atomic::Ordering::SeqCst), 1);
        assert_eq!(*memory.rows.lock().unwrap(), before);
    }
    #[tokio::test]
    async fn arbitrary_root_context_cannot_certify_zero_timestamp_intent() {
        let memory = Arc::new(Memory::default());
        let mut context = RootTransactionContext::start(
            headers(),
            "test.Root",
            TransactionMode::Exclusive,
            Uuid::from_u128(42),
            prost_types::Timestamp {
                seconds: 1,
                nanos: 0,
            },
        )
        .unwrap()
        .transaction()
        .clone();
        bind(&mut context);
        let error = context
            .install_canonical_root_attempt(memory.clone(), &[])
            .await
            .unwrap_err();
        assert_eq!(error.code(), tonic::Code::FailedPrecondition);
        assert!(memory.rows.lock().unwrap().is_empty());
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
    async fn startup_claim_blocks_empty_membership_reentry_without_replacement_or_write() {
        for retired in [false, true] {
            let memory = Arc::new(Memory::default());
            let factory = Factory(std::sync::atomic::AtomicUsize::new(0));
            let mut first = start(headers(), &memory, &factory).await.unwrap();
            bind(&mut first);
            first
                .install_canonical_root_attempt(memory.clone(), &[])
                .await
                .unwrap();
            {
                let mut rows = memory.rows.lock().unwrap();
                let mut record =
                    CanonicalRootAttemptRecord::decode(rows[0].response.as_slice()).unwrap();
                assert_eq!(
                    record.receipt_key,
                    headers().idempotency_key.unwrap().as_bytes()
                );
                record.recovery_claimed = true;
                record.recovery_retired = retired;
                rows[0].response = record.encode_to_vec();
            }
            let original = memory.rows.lock().unwrap().clone();
            let writes = memory.writes.load(std::sync::atomic::Ordering::SeqCst);
            let mut recovered = start(headers(), &memory, &factory).await.unwrap();
            assert_eq!(first.transaction_root_id(), recovered.transaction_root_id());
            bind(&mut recovered);
            assert!(
                recovered
                    .install_canonical_root_attempt(memory.clone(), &[])
                    .await
                    .unwrap_err()
                    .message()
                    .contains("owned by startup recovery")
            );
            assert_eq!(*memory.rows.lock().unwrap(), original);
            assert_eq!(
                memory.writes.load(std::sync::atomic::Ordering::SeqCst),
                writes
            );
            assert_eq!(factory.0.load(std::sync::atomic::Ordering::SeqCst), 1);
        }
    }

    #[tokio::test]
    async fn startup_receipt_key_and_retirement_without_claim_fail_closed() {
        for wrong_key in [false, true] {
            let memory = Arc::new(Memory::default());
            let factory = Factory(std::sync::atomic::AtomicUsize::new(0));
            let mut context = start(headers(), &memory, &factory).await.unwrap();
            bind(&mut context);
            context
                .install_canonical_root_attempt(memory.clone(), &[])
                .await
                .unwrap();
            {
                let mut rows = memory.rows.lock().unwrap();
                let mut record =
                    CanonicalRootAttemptRecord::decode(rows[0].response.as_slice()).unwrap();
                if wrong_key {
                    record.receipt_key = Uuid::new_v4().as_bytes().to_vec();
                } else {
                    record.recovery_retired = true;
                }
                rows[0].response = record.encode_to_vec();
            }
            let original = memory.rows.lock().unwrap().clone();
            assert_eq!(
                start(headers(), &memory, &factory)
                    .await
                    .unwrap_err()
                    .code(),
                tonic::Code::DataLoss
            );
            assert_eq!(*memory.rows.lock().unwrap(), original);
            assert_eq!(factory.0.load(std::sync::atomic::Ordering::SeqCst), 1);
        }
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
