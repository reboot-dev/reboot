#[cfg(test)]
mod initializer_admission_tests {
    use super::*;
    use prost::Message;

    struct OwnerBinding;
    #[tonic::async_trait]
    impl ReaderTaskBinding for OwnerBinding {
        fn validate(&self, _: &db::Task) -> Result<(), Status> {
            Ok(())
        }
        fn writer_capable(&self) -> bool {
            true
        }
        async fn execute(&self, _: &db::Task) -> Result<prost_types::Any, Status> {
            panic!("no work should be dispatched")
        }
    }
    #[tokio::test]
    async fn initializer_binding_requires_actual_start_and_retains_generation_and_uncertainty_fences()
     {
        let (endpoint, database, server) = crate::runtime::test_support::start_database().await;
        let tasks = OneShotTasks::new(
            DatabaseActorStore::connect_lazy(endpoint).unwrap(),
            "tests.reboot.protoc.Counter".into(),
            "initializer-owner-binding".into(),
            OwnerBinding,
        )
        .unwrap();
        let (actual, _actual_readiness) = RecoveryCancellation::test_host();
        let (foreign, _foreign_readiness) = RecoveryCancellation::test_host();
        assert!(actual.same_recovery_owner(&actual.clone()));
        assert!(!actual.same_recovery_owner(&foreign));
        // Claiming a singleton generation alone must not mint host authority.
        {
            let owner = DispatchOwner::claim(tasks.clone()).unwrap();
            *tasks.inner.recovery_request.lock().unwrap() = Some(db::RecoverRequest::default());
            tasks
                .inner
                .active
                .store(true, std::sync::atomic::Ordering::Release);
            assert_eq!(
                tasks
                    .require_initializer_owner(&actual)
                    .err()
                    .unwrap()
                    .code(),
                tonic::Code::FailedPrecondition
            );
            drop(owner);
        }
        let mut supervisor = JoinSet::new();
        tasks
            .recovery(db::RecoverRequest {
                shard_ids: vec!["test-shard".into()],
                state_tags_by_state_type: [(
                    "tests.reboot.protoc.Counter".into(),
                    "test-tag".into(),
                )]
                .into_iter()
                .collect(),
                ..Default::default()
            })
            .start(&mut supervisor, actual.clone())
            .await
            .unwrap();
        let admission = tasks.require_initializer_owner(&actual).unwrap();
        drop(admission.lock_initializer(&actual.clone(), &tasks).unwrap());
        assert_eq!(
            admission
                .lock_initializer(&foreign, &tasks)
                .err()
                .unwrap()
                .code(),
            tonic::Code::FailedPrecondition
        );
        // Every validation reads the actual generation's binding again: an old
        // retained capability cannot authorize a replacement host or generation.
        {
            let _generation = tasks.inner.running_owner.lock().unwrap();
            *tasks.inner.recovery_owner.lock().unwrap() = Some(foreign.clone());
        }
        assert_eq!(
            admission
                .lock_initializer(&actual, &tasks)
                .err()
                .unwrap()
                .code(),
            tonic::Code::FailedPrecondition
        );
        {
            let mut generation = tasks.inner.running_owner.lock().unwrap();
            *tasks.inner.recovery_owner.lock().unwrap() = Some(actual.clone());
            *generation = Some(Arc::new(()));
        }
        assert_eq!(
            admission
                .lock_initializer(&actual, &tasks)
                .err()
                .unwrap()
                .code(),
            tonic::Code::FailedPrecondition
        );
        let replacement = tasks.require_initializer_owner(&actual).unwrap();
        tasks.inner.uncertain.send_replace(true);
        assert_eq!(
            replacement
                .lock_initializer(&actual, &tasks)
                .err()
                .unwrap()
                .code(),
            tonic::Code::Unavailable
        );
        actual.cancel();
        while let Some(result) = supervisor.join_next().await {
            // Sticky uncertainty remains fatal; it must never be reset to make
            // this ownership test pass or converted to retry authority.
            let error = result.unwrap().unwrap_err();
            assert!(matches!(
                error.code(),
                tonic::Code::Unavailable | tonic::Code::Cancelled
            ));
        }
        assert!(tasks.inner.recovery_owner.lock().unwrap().is_none());
        assert!(tasks.inner.running_owner.lock().unwrap().is_none());
        assert!(database.store_requests().is_empty());
        server.abort();
    }

    #[test]
    fn alias_identity_survives_rebuild_and_does_not_hide_changed_requests() {
        let id = initializer_uuid("legacy-app", "initialize-greeter-v1");
        assert_eq!(id, initializer_uuid("legacy-app", "initialize-greeter-v1"));
        assert_ne!(id, initializer_uuid("legacy-app", "initialize-greeter-v2"));
        assert_ne!(initializer_uuid("ab", "c"), initializer_uuid("a", "bc"));
        let uuid = uuid::Uuid::from_slice(&id).unwrap();
        assert_eq!(uuid.get_version_num(), 4);
        assert_eq!(uuid.get_variant(), uuid::Variant::RFC4122);
        let task = db::Task {
            task_id: Some(db::TaskId {
                state_type: "hello_legacy_grpc.v1.RebootGreeter".into(),
                state_ref: "my-greeter".into(),
                task_uuid: id,
            }),
            method: "Initialize".into(),
            request: vec![],
            status: db::task::Status::Pending as i32,
            ..Default::default()
        };
        let response_type = "type.googleapis.com/google.protobuf.Empty";
        let key = initializer_uuid("legacy-app", "admission:initialize-greeter-v1");
        let record = db::IdempotentMutation {
            state_type: task.task_id.as_ref().unwrap().state_type.clone(),
            state_ref: "anchor".into(),
            key: key.clone(),
            response: task.encode_to_vec(),
            task_ids: vec![task.task_id.clone().unwrap()],
            request_fingerprint: Some(initializer_fingerprint(&task, response_type)),
            workflow_id: None,
            workflow_iteration: None,
        };
        validate_initializer_record(&record, "anchor", &key, &task, response_type).unwrap();
        for changed in 0..6 {
            let mut expected = task.clone();
            let mut url = response_type;
            match changed {
                0 => expected.task_id.as_mut().unwrap().state_ref = "other-greeter".into(),
                1 => expected.method = "OtherWorkflow".into(),
                2 => expected.request = vec![8, 1],
                3 => {
                    expected.timestamp = Some(prost_types::Timestamp {
                        seconds: 1,
                        nanos: 0,
                    })
                }
                4 => expected.iteration = 1,
                _ => url = "type.googleapis.com/OtherResult",
            }
            assert_eq!(
                validate_initializer_record(&record, "anchor", &key, &expected, url)
                    .unwrap_err()
                    .code(),
                tonic::Code::FailedPrecondition
            );
        }
        for corrupted in 0..5 {
            let mut bad = record.clone();
            match corrupted {
                0 => bad.task_ids.clear(),
                1 => bad.workflow_id = Some(vec![1; 16]),
                2 => bad.request_fingerprint = None,
                3 => bad.response.push(255),
                _ => bad.state_ref = "other-anchor".into(),
            }
            assert!(
                validate_initializer_record(&bad, "anchor", &key, &task, response_type).is_err()
            );
        }
    }
}
