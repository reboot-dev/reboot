// Included by sorted_map_participant.rs; boundary tests are not native proofs.
#[cfg(test)]
mod early_sorted_map_ownership_tests {
    use super::*;
    #[derive(Default)]
    struct Boundary {
        stores: std::sync::Mutex<Vec<database::StoreRequest>>,
        prepares: std::sync::Mutex<Vec<database::TransactionParticipantPrepareRequest>>,
        mode: std::sync::atomic::AtomicU8,
    }
    impl ParticipantSidecar for Boundary {
        fn database_endpoint(&self) -> Option<&str> {
            Some("http://127.0.0.1:1234/")
        }
        fn load(&self, mut r: database::LoadRequest) -> SidecarFuture<'_, database::LoadResponse> {
            Box::pin(async move {
                for actor in &mut r.actors {
                    actor.state = Some(vec![]);
                }
                Ok(database::LoadResponse {
                    actors: r.actors,
                    tasks: vec![],
                    timestamp: None,
                })
            })
        }
        fn store(&self, r: database::StoreRequest) -> SidecarFuture<'_, database::StoreResponse> {
            Box::pin(async move {
                self.stores.lock().unwrap().push(r);
                match self.mode.load(std::sync::atomic::Ordering::SeqCst) {
                    1 => Err(Status::unavailable("lost Store ACK")),
                    2 => std::future::pending().await,
                    _ => Ok(database::StoreResponse::default()),
                }
            })
        }
        fn prepare(
            &self,
            r: database::TransactionParticipantPrepareRequest,
        ) -> SidecarFuture<'_, database::TransactionParticipantPrepareResponse> {
            Box::pin(async move {
                self.prepares.lock().unwrap().push(r);
                Ok(database::TransactionParticipantPrepareResponse::default())
            })
        }
        fn commit(
            &self,
            _: database::TransactionParticipantCommitRequest,
        ) -> SidecarFuture<'_, database::TransactionParticipantCommitResponse> {
            Box::pin(async { Ok(database::TransactionParticipantCommitResponse::default()) })
        }
        fn abort(
            &self,
            _: database::TransactionParticipantAbortRequest,
        ) -> SidecarFuture<'_, database::TransactionParticipantAbortResponse> {
            Box::pin(async { Ok(database::TransactionParticipantAbortResponse::default()) })
        }
        fn recover(
            &self,
            _: database::RecoverRequest,
        ) -> SidecarFuture<'_, Vec<database::RecoverResponse>> {
            Box::pin(async { Ok(vec![]) })
        }
        fn recover_idempotent_mutations(
            &self,
            _: database::RecoverIdempotentMutationsRequest,
        ) -> SidecarFuture<'_, Vec<database::RecoverIdempotentMutationsResponse>> {
            Box::pin(async { Ok(vec![]) })
        }
    }
    fn start(root: Uuid, reference: &str) -> ActorTransactionStart {
        ActorTransactionStart {
            transaction_ids: vec![root],
            transaction_path: TransactionPathContract::RootOnly,
            coordinator_state_type: "app.Counter".into(),
            coordinator_state_ref: "app-root".into(),
            mode: TransactionMode::Exclusive,
            read_only: false,
            factory: false,
            state_type: SORTED_MAP_STATE_TYPE.into(),
            state_ref: reference.into(),
        }
    }
    fn insert() -> crate::sorted_map_proto::InsertRequest {
        crate::sorted_map_proto::InsertRequest {
            entries: [("k".into(), vec![])].into(),
        }
    }
    #[tokio::test]
    async fn early_store_ack_preserves_empty_presence_scope_and_prepare_without_restage() {
        let boundary = Arc::new(Boundary::default());
        let reference = crate::state_ref::StateRef::from_id(SORTED_MAP_STATE_TYPE, "map")
            .unwrap()
            .to_string();
        let p = DurableActorParticipant::new(boundary.clone(), SORTED_MAP_STATE_TYPE, &reference);
        let root = Uuid::new_v4();
        let guard = p
            .start_local(start(root, &reference), ParticipantStartMode::Exclusive)
            .await
            .unwrap();
        guard.sorted_map_insert(insert()).await.unwrap();
        let request = boundary.stores.lock().unwrap()[0].clone();
        assert!(request.sync);
        assert_eq!(request.actor_upserts[0].state, Some(vec![]));
        assert_eq!(request.colocated_upserts[0].value, Some(vec![]));
        assert_eq!(
            request.colocated_upserts[0].state_type,
            SORTED_MAP_ENTRY_TYPE
        );
        assert!(
            request.colocated_upserts[0]
                .key
                .starts_with(&format!("{reference}/"))
        );
        assert_eq!(
            request.transaction.unwrap().transaction_ids,
            vec![root.as_bytes().to_vec()]
        );
        assert!(
            guard
                .stage(PendingActorEffects {
                    state: Some(vec![1]),
                    ..Default::default()
                })
                .await
                .is_err()
        );
        p.prepare_for_test(root).await.unwrap();
        let request = boundary.prepares.lock().unwrap()[0].clone();
        assert!(request.transaction.is_none());
        assert!(request.state.is_none());
        assert!(request.task_upserts.is_empty());
        p.terminal(root, true).await.unwrap();
        // Stale same-root guard cannot write to a replacement incarnation.
        let replacement = p
            .start_local(start(root, &reference), ParticipantStartMode::Exclusive)
            .await
            .unwrap();
        assert!(guard.sorted_map_insert(insert()).await.is_err());
        drop(replacement);
    }
    #[tokio::test]
    async fn pre_ack_error_and_cancellation_never_release_or_abort_possibly_native_store() {
        for mode in [1, 2] {
            let boundary = Arc::new(Boundary::default());
            boundary
                .mode
                .store(mode, std::sync::atomic::Ordering::SeqCst);
            let reference = crate::state_ref::StateRef::from_id(SORTED_MAP_STATE_TYPE, "map")
                .unwrap()
                .to_string();
            let p =
                DurableActorParticipant::new(boundary.clone(), SORTED_MAP_STATE_TYPE, &reference);
            let root = Uuid::new_v4();
            let guard = p
                .start_local(start(root, &reference), ParticipantStartMode::Exclusive)
                .await
                .unwrap();
            if mode == 1 {
                assert!(guard.sorted_map_insert(insert()).await.is_err());
            } else {
                assert!(
                    tokio::time::timeout(
                        std::time::Duration::from_millis(10),
                        guard.sorted_map_insert(insert())
                    )
                    .await
                    .is_err()
                );
            }
            drop(guard);
            tokio::task::yield_now().await;
            {
                let pending = p.pending.lock().await;
                let current = pending.as_ref().unwrap();
                assert!(current.native_started && current.native_uncertain && !current.prepared);
            }
            assert!(p.prepare_for_test(root).await.is_err());
            assert!(p.abort(root).await.is_err());
            assert!(
                tokio::time::timeout(
                    std::time::Duration::from_millis(10),
                    p.start_local(
                        start(Uuid::new_v4(), &reference),
                        ParticipantStartMode::Exclusive
                    )
                )
                .await
                .is_err()
            );
        }
    }
    #[tokio::test]
    async fn unsupported_factory_and_nested_maps_fail_before_native_io() {
        for factory in [false, true] {
            let boundary = Arc::new(Boundary::default());
            let reference = crate::state_ref::StateRef::from_id(SORTED_MAP_STATE_TYPE, "map")
                .unwrap()
                .to_string();
            let p =
                DurableActorParticipant::new(boundary.clone(), SORTED_MAP_STATE_TYPE, &reference);
            let mut request = start(Uuid::new_v4(), &reference);
            request.factory = factory;
            if factory {
                request.coordinator_state_type = SORTED_MAP_STATE_TYPE.into();
                request.coordinator_state_ref = reference.clone();
            }
            if !factory {
                request.transaction_ids.push(Uuid::new_v4());
                request.transaction_path = TransactionPathContract::PreserveNested;
            }
            let guard = p
                .start_local(request, ParticipantStartMode::Exclusive)
                .await
                .unwrap();
            assert!(guard.sorted_map_insert(insert()).await.is_err());
            assert!(boundary.stores.lock().unwrap().is_empty());
            drop(guard);
        }
    }
}
