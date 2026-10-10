// Included by sorted_map_native_prerequisite.rs. Real native Store ACK is
// deliberately discarded; Abort MUST NOT release a possibly late operation.
struct LostStoreAck {
    inner: TonicParticipantSidecar,
}
impl reboot_rust_schema::durable_participant::ParticipantSidecar for LostStoreAck {
    fn database_endpoint(&self) -> Option<&str> {
        self.inner.database_endpoint()
    }
    fn load(
        &self,
        r: db::LoadRequest,
    ) -> Pin<Box<dyn Future<Output = Result<db::LoadResponse, Status>> + Send + '_>> {
        self.inner.load(r)
    }
    fn store(
        &self,
        r: db::StoreRequest,
    ) -> Pin<Box<dyn Future<Output = Result<db::StoreResponse, Status>> + Send + '_>> {
        Box::pin(async move {
            self.inner.store(r).await?;
            Err(Status::unavailable("real native early Store ACK discarded"))
        })
    }
    fn prepare(
        &self,
        r: db::TransactionParticipantPrepareRequest,
    ) -> Pin<
        Box<
            dyn Future<Output = Result<db::TransactionParticipantPrepareResponse, Status>>
                + Send
                + '_,
        >,
    > {
        self.inner.prepare(r)
    }
    fn commit(
        &self,
        r: db::TransactionParticipantCommitRequest,
    ) -> Pin<
        Box<
            dyn Future<Output = Result<db::TransactionParticipantCommitResponse, Status>>
                + Send
                + '_,
        >,
    > {
        self.inner.commit(r)
    }
    fn abort(
        &self,
        _: db::TransactionParticipantAbortRequest,
    ) -> Pin<
        Box<
            dyn Future<Output = Result<db::TransactionParticipantAbortResponse, Status>>
                + Send
                + '_,
        >,
    > {
        Box::pin(async { panic!("live uncertain Store cannot be followed by actor-only Abort") })
    }
    fn recover(
        &self,
        r: db::RecoverRequest,
    ) -> Pin<Box<dyn Future<Output = Result<Vec<db::RecoverResponse>, Status>> + Send + '_>> {
        self.inner.recover(r)
    }
    fn recover_idempotent_mutations(
        &self,
        r: db::RecoverIdempotentMutationsRequest,
    ) -> Pin<
        Box<
            dyn Future<Output = Result<Vec<db::RecoverIdempotentMutationsResponse>, Status>>
                + Send
                + '_,
        >,
    > {
        self.inner.recover_idempotent_mutations(r)
    }
}
#[tokio::test]
#[ignore = "requires real C++ Database/RocksDB"]
async fn lost_early_store_ack_retains_until_native_restart() {
    let mut native = Native::start(std::env::var("REBOOT_NATIVE2PC_CXX_DATABASE").unwrap());
    let parent = StateRef::from_id(MAP, "lost-early-ack")
        .unwrap()
        .to_string();
    let app = StateRef::from_id(APP, "lost-early-app")
        .unwrap()
        .to_string();
    let mut client = db::database_client::DatabaseClient::connect(native.endpoint())
        .await
        .unwrap();
    client
        .store(db::StoreRequest {
            actor_upserts: vec![db::Actor {
                state_type: MAP.into(),
                state_ref: parent.clone(),
                state: Some(vec![]),
            }],
            ensure_state_types_created: vec![ENTRY.into()],
            sync: true,
            ..Default::default()
        })
        .await
        .unwrap();
    let p = DurableActorParticipant::new(
        Arc::new(LostStoreAck {
            inner: TonicParticipantSidecar::connect(native.endpoint())
                .await
                .unwrap(),
        }),
        MAP,
        parent.clone(),
    );
    let root = Uuid::new_v4();
    let guard = p
        .start_local(
            start(root, MAP, &parent, &app),
            ParticipantStartMode::Exclusive,
        )
        .await
        .unwrap();
    assert_eq!(
        guard
            .sorted_map_insert(map::InsertRequest {
                entries: [("x".into(), b"unacknowledged".to_vec())].into()
            })
            .await
            .unwrap_err()
            .code(),
        tonic::Code::Unavailable
    );
    drop(guard);
    tokio::time::sleep(Duration::from_millis(30)).await;
    assert_eq!(
        p.abort(root).await.unwrap_err().code(),
        tonic::Code::Unavailable
    );
    let mut queued = Box::pin(p.start_local(
        start(Uuid::new_v4(), MAP, &parent, &app),
        ParticipantStartMode::Exclusive,
    ));
    assert!(
        tokio::time::timeout(Duration::from_millis(30), &mut queued)
            .await
            .is_err()
    );
    drop(queued);
    drop(p);
    native.restart();
    let p = participant(&native.endpoint(), MAP, &parent).await;
    p.recover(ParticipantRecovery {
        state_tags_by_state_type: [(
            MAP.into(),
            reboot_rust_schema::state_ref::state_type_tag_for_name(MAP),
        )]
        .into(),
        shard_ids: vec!["s000000000".into()],
    })
    .await
    .unwrap();
    p.abort(root).await.unwrap();
    let guard = p
        .start_local(
            start(Uuid::new_v4(), MAP, &parent, &app),
            ParticipantStartMode::Exclusive,
        )
        .await
        .unwrap();
    assert_eq!(
        guard
            .sorted_map_get(map::GetRequest { key: "x".into() })
            .await
            .unwrap()
            .value,
        None
    );
    drop(guard);
    println!(
        "real Store lost ACK: Drop/Abort/competitor fail closed; sidecar restart + unprepared recovery Abort resumes admission"
    );
}
