// Included privately beside workflow_at_most_once_tests.rs; no production hooks.
mod wait_cursor_binding_races {
    use super::*;
    use crate::auth::*;
    use db::tasks_server::Tasks;
    use std::sync::atomic::AtomicBool;
    struct Policy(AtomicBool);
    impl TokenVerifier for Policy {
        fn verify<'a>(
            &'a self,
            _: &'a AuthorizationContext,
            _: Option<&'a str>,
        ) -> VerifyFuture<'a> {
            Box::pin(async { TokenVerification::Authenticated(Auth::new(serde_json::json!(true))) })
        }
    }
    impl Authorizer for Policy {
        fn authorize<'a>(
            &'a self,
            context: &'a AuthorizationContext,
            _: Option<&'a Auth>,
            state: Option<&'a [u8]>,
            request: &'a [u8],
        ) -> AuthorizeFuture<'a> {
            Box::pin(async move {
                assert_eq!(context.method, "rbt.v1alpha1.Tasks.Wait");
                assert!(state.is_none());
                assert_eq!(
                    db::WaitRequest::decode(request)
                        .unwrap()
                        .task_id
                        .unwrap()
                        .state_ref,
                    context.headers.state_ref
                );
                if self.0.load(Ordering::Acquire) {
                    AuthorizationDecision::Allow
                } else {
                    AuthorizationDecision::PermissionDenied {
                        message: "binding-race revoked".into(),
                    }
                }
            })
        }
    }
    fn placement() -> crate::legacy_placement::PlanOnlyLegacyPlacement {
        use crate::placement_proto as p;
        let placement = crate::legacy_placement::PlanOnlyLegacyPlacement::new();
        placement
            .install(p::ListenForPlanResponse {
                plan: Some(p::Plan {
                    version: 1,
                    applications: vec![p::plan::Application {
                        id: "application".into(),
                        services: vec![p::plan::application::Service {
                            full_name: "rbt.v1alpha1.Tasks".into(),
                            state_type_full_name: D::STATE_TYPE.into(),
                        }],
                        shards: vec![p::plan::application::Shard {
                            id: "shard".into(),
                            range: Some(p::plan::application::shard::KeyRange {
                                first_key: vec![],
                            }),
                            server_id: "server".into(),
                            replica_index: 0,
                        }],
                    }],
                }),
                servers: vec![p::Server {
                    id: "server".into(),
                    application_id: "application".into(),
                    address: Some(p::server::Address {
                        host: "127.0.0.1".into(),
                        port: 9991,
                    }),
                    ..Default::default()
                }],
            })
            .unwrap();
        placement
    }
    // action=0 is the live-authority control; 1 policy; 2 genuine owner ABA; 3 sticky uncertainty.
    async fn case(action: u8, binding_error: bool) {
        let (endpoint, database, server) = crate::runtime::test_support::start_database().await;
        database.model_control_only_store();
        let f = Fixture::new_decl(&endpoint, "cursor-wait-race", None, true).await;
        let attempt = WorkflowAttempt::default();
        let mut context = f.context(&attempt);
        let _: crate::proto::Counter = context
            .run_loop(
                "main",
                1,
                "type.googleapis.com/tests.reboot.protoc.Counter",
                |_| {
                    Box::pin(async {
                        Ok(std::ops::ControlFlow::Break(crate::proto::Counter {
                            value: 73,
                        }))
                    })
                },
            )
            .await
            .unwrap();
        // Use a real saved immutable binding. Error cases corrupt only its fingerprint;
        // the RPC still succeeds and the actual validator produces a checkpoint error.
        if binding_error {
            let id = f.task.task_id.as_ref().unwrap();
            database.seed_mutation(db::IdempotentMutation {
                state_type: id.state_type.clone(),
                state_ref: id.state_ref.clone(),
                key: uuid::Uuid::new_v5(
                    &uuid::Uuid::from_slice(&id.task_uuid).unwrap(),
                    b"reboot.workflow.cursor.binding.v1",
                )
                .as_bytes()
                .to_vec(),
                workflow_id: Some(id.task_uuid.clone()),
                workflow_iteration: None,
                request_fingerprint: Some(vec![0]),
                response: vec![],
                task_ids: vec![],
            });
        }
        let mut terminal = f.task.clone();
        terminal.status = db::task::Status::Completed as i32;
        terminal.response_or_error = Some(db::task::ResponseOrError::Response(prost_types::Any {
            type_url: "type.googleapis.com/tests.reboot.protoc.Counter".into(),
            value: crate::proto::Counter { value: 73 }.encode_to_vec(),
        }));
        database.seed_task(terminal.clone());
        // Validate both registry and binding terminal decoders before the race.
        // The cursor-only preflight below cannot establish terminal validity.
        let response = terminal.response_or_error.as_ref().unwrap();
        f.tasks.validate_terminal(&terminal, response).unwrap();
        for invalid in [
            prost_types::Any {
                type_url: "type.googleapis.com/tests.Wrong".into(),
                value: crate::proto::Counter { value: 73 }.encode_to_vec(),
            },
            prost_types::Any {
                type_url: "type.googleapis.com/tests.reboot.protoc.Counter".into(),
                value: vec![0xff],
            },
        ] {
            assert!(Binding.validate_response(&terminal, &invalid).is_err());
        }
        // Establish each fixture's success/error path before installing the barrier.
        let before = f
            .tasks
            .inner
            .store
            .workflow_validate_cursor_binding(&terminal, "main", 1, "tests.Effects.Initialize")
            .await;
        if binding_error {
            assert_eq!(
                before.unwrap_err().message(),
                "workflow step checkpoint identity/provenance collision"
            );
        } else {
            before.unwrap();
        }
        drop(context);
        let tasks = f.tasks.clone();
        let policy = Arc::new(Policy(AtomicBool::new(true)));
        let service = ReaderTaskWaitService::new(
            [tasks.clone()],
            crate::legacy_placement::LegacyApplicationId::new("application").unwrap(),
            "server",
            placement(),
        )
        .unwrap()
        .with_wait_authorization(policy.clone(), policy.clone());
        let mut request = tonic::Request::new(db::WaitRequest {
            task_id: terminal.task_id.clone(),
        });
        request
            .metadata_mut()
            .insert(crate::STATE_REF_HEADER, "cursor-wait-race".parse().unwrap());
        let stores = database.store_requests().len();
        let counts = database.admission_rpc_counts();
        // This hook parks RecoverIdempotentMutations, NOT Load. All setup IO has
        // finished and Wait is the only client future polled while it is armed.
        let (entered, release) = database.park_checkpoint_recover();
        let wait = service.wait(request);
        tokio::pin!(wait);
        tokio::time::timeout(std::time::Duration::from_secs(3), async {
            tokio::select! {
                result = &mut wait => panic!("Wait disclosed before binding RPC parked: {result:?}"),
                result = entered => result.unwrap(),
            }
        }).await.expect("Wait never reached the new cursor-binding await");
        let parked_counts = database.admission_rpc_counts();
        assert_eq!(
            parked_counts.0,
            counts.0 + 1,
            "exact-ID Load must have completed before binding IO"
        );
        assert_eq!(
            parked_counts.1, counts.1,
            "checkpoint recovery remains parked before producing a reply"
        );
        let mut replacement = None;
        match action {
            0 => {}
            1 => policy.0.store(false, Ordering::Release),
            2 => {
                drop(f._owner);
                replacement = Some(DispatchOwner::claim(tasks.clone()).unwrap());
                tasks.inner.active.store(true, Ordering::Release);
            }
            3 => {
                tasks.inner.uncertain.send_replace(true);
            }
            _ => unreachable!(),
        }
        release.send(()).unwrap();
        let result = tokio::time::timeout(std::time::Duration::from_secs(3), &mut wait)
            .await
            .expect("Wait did not finish after binding release");
        if action == 0 && !binding_error {
            let result = result
                .unwrap()
                .into_inner()
                .response_or_error
                .unwrap()
                .response_or_error
                .unwrap();
            assert_eq!(
                result,
                db::task_response_or_error::ResponseOrError::Response(prost_types::Any {
                    type_url: "type.googleapis.com/tests.reboot.protoc.Counter".into(),
                    value: crate::proto::Counter { value: 73 }.encode_to_vec(),
                })
            );
        } else {
            let error = result.unwrap_err();
            if action == 0 {
                assert_eq!(error.code(), tonic::Code::FailedPrecondition);
                assert_eq!(
                    error.message(),
                    "workflow step checkpoint identity/provenance collision"
                );
            } else {
                assert_eq!(
                    error.code(),
                    if action == 1 {
                        tonic::Code::PermissionDenied
                    } else {
                        tonic::Code::Unavailable
                    }
                );
                assert!(!error.message().contains("checkpoint"));
                assert!(!error.message().contains("cursor"));
                assert!(
                    error.details().is_empty(),
                    "no rich terminal/checkpoint disclosure"
                );
                if action == 1 {
                    assert_eq!(error.message(), "binding-race revoked");
                }
            }
        }
        assert_eq!(
            database.store_requests().len(),
            stores,
            "Wait must not mutate"
        );
        assert_eq!(database.complete_calls(), 0, "Wait must not complete tasks");
        drop(replacement);
        server.abort();
    }
    #[tokio::test]
    async fn wait_cursor_binding_controls_terminal_and_checkpoint_error() {
        for error in [false, true] {
            case(0, error).await;
        }
    }
    #[tokio::test]
    async fn wait_cursor_binding_policy_revocation_precedes_success_and_error() {
        for error in [false, true] {
            case(1, error).await;
        }
    }
    #[tokio::test]
    async fn wait_cursor_binding_original_owner_aba_precedes_success_and_error() {
        for error in [false, true] {
            case(2, error).await;
        }
    }
    #[tokio::test]
    async fn wait_cursor_binding_uncertainty_precedes_success_and_error() {
        for error in [false, true] {
            case(3, error).await;
        }
    }
}
