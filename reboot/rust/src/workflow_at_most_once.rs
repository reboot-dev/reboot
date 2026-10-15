// Included in one_shot_tasks through workflow_context.rs: authority stays private.
pub(crate) const AT_MOST_ONCE_UNIT_TYPE: &str =
    "type.googleapis.com/reboot.rust.workflow.AtMostOnceUnitV1";

#[derive(Clone, PartialEq, prost::Message)]
pub(crate) struct AtMostOnceUnitCheckpoint {
    #[prost(uint32, tag = "1")]
    pub format: u32,
    // 1 = Started, 2 = Stored. No Reset transition exists.
    #[prost(uint32, tag = "2")]
    pub phase: u32,
    #[prost(bool, tag = "3")]
    pub unit: bool,
}
impl AtMostOnceUnitCheckpoint {
    pub(crate) fn started() -> Self {
        Self {
            format: 1,
            phase: 1,
            unit: false,
        }
    }
    pub(crate) fn stored() -> Self {
        Self {
            format: 1,
            phase: 2,
            unit: true,
        }
    }
    pub(crate) fn validate(&self) -> Result<(), Status> {
        if self != &Self::started() && self != &Self::stored() {
            return Err(Status::data_loss("invalid at-most-once unit checkpoint"));
        }
        Ok(())
    }
}
#[derive(prost::Message)]
pub(crate) struct AtMostOnceUnitContract {
    #[prost(string, tag = "1")]
    pub method: String,
    #[prost(bytes = "vec", tag = "2")]
    pub request: Vec<u8>,
    #[prost(string, tag = "3")]
    pub alias: String,
    #[prost(uint32, tag = "4")]
    pub version: u32,
    #[prost(uint64, tag = "5")]
    pub bound: u64,
    #[prost(string, tag = "6")]
    pub parent_bounds: String,
    #[prost(string, tag = "7")]
    pub result_type: String,
}

impl WorkflowContext<'_> {
    /// Run a named, versioned external-effect block at most once in this task/scope.
    ///
    /// A synchronous canonical Started ACK precedes even callback construction.
    /// The actor lease is released before the callback, permitting same-actor RPCs.
    /// Stored replays unit; Started without Stored permanently fails closed (zero,
    /// partial, or all effects may have happened). Callback failures are framework
    /// failures, not method-declared business errors, and never reset the block.
    /// Lost Start/Store ACK fails the task owner/host through existing uncertainty
    /// guards. This is singleton-owner storage arbitration, NOT Database CAS or
    /// distributed ownership. Increment `version` when callback meaning changes;
    /// changing it under the same alias rejects, it does not authorize reexecution.
    pub async fn at_most_once_unit<F, Fut>(
        &self,
        alias: &str,
        version: u32,
        callback: F,
    ) -> Result<(), Status>
    where
        F: FnOnce() -> Fut + Send,
        Fut: std::future::Future<Output = Result<(), Status>> + Send,
    {
        let operation = self.attempt.operation();
        if alias.is_empty()
            || alias.len() > 256
            || alias.chars().any(char::is_control)
            || version == 0
        {
            return Err(Status::invalid_argument(
                "at-most-once block requires a bounded name and nonzero version",
            ));
        }
        let id = self
            .task
            .task_id
            .as_ref()
            .ok_or_else(|| Status::failed_precondition("missing workflow identity"))?;
        if id.state_type != self.tasks.inner.state_type
            || id.state_ref != self.tasks.inner.state_ref
        {
            return Err(Status::failed_precondition(
                "at-most-once task actor/owner mismatch",
            ));
        }
        let declaration = self
            .tasks
            .declaration(&self.task)
            .filter(|declaration| declaration.workflow)
            .ok_or_else(|| {
                Status::failed_precondition("at-most-once requires a registered workflow")
            })?;
        (declaration.decode_request)(&self.task.request)?;
        let seed = uuid::Uuid::from_slice(&id.task_uuid)
            .map_err(|_| Status::failed_precondition("invalid workflow UUID"))?;
        // Version is fingerprint-bound, deliberately NOT part of the key.
        let key = self.checkpoint_key(
            uuid::Uuid::new_v5(&seed, b"reboot.at-most-once.unit.v1"),
            alias,
            Some("at-most-once.unit.v1"),
        );
        let contract = AtMostOnceUnitContract {
            method: declaration.method.into(),
            request: self.task.request.clone(),
            alias: self.checkpoint_alias(alias),
            version,
            bound: self.checkpoint_bound(),
            parent_bounds: self.checkpoint_parent_bounds(),
            result_type: AT_MOST_ONCE_UNIT_TYPE.into(),
        };
        let store = &self.tasks.inner.store;
        let gate = store.actor_gate(&id.state_type, &id.state_ref);
        let mut revisions = gate.committed_revisions();
        {
            let _lease = workflow_reader_lease(&gate, &mut revisions).await?;
            self.validate_scope().await?;
            match store
                .workflow_at_most_once_load(self, key, &contract)
                .await?
            {
                Some(saved) if saved.phase == 2 => {
                    operation.acknowledged();
                    return Ok(());
                }
                Some(_) => {
                    return Err(Status::failed_precondition(
                        "at-most-once block Started without Stored; callback will not run again",
                    ));
                }
                None => {}
            }
            #[cfg(feature = "test-support")]
            self.wait_test_pause("REBOOT_TEST_AT_MOST_ONCE_BEFORE_STARTED")
                .await?;
            store
                .workflow_at_most_once_save(
                    self,
                    key,
                    &contract,
                    AtMostOnceUnitCheckpoint::started(),
                )
                .await?;
            self.validate_scope().await?;
        }
        // No actor lease or durable-ACK guard lives across construction or polling.
        // Revocation after this validation is handled by supervisor cancellation;
        // its one-owner lifetime retains ownership until this future is destroyed.
        #[cfg(feature = "test-support")]
        self.wait_test_pause("REBOOT_TEST_AT_MOST_ONCE_AFTER_STARTED_ACK")
            .await?;
        self.validate_scope().await?;
        let future = callback();
        tokio::select! {
            biased;
            _ = self.cancel.cancelled() => return Err(Status::cancelled("at-most-once callback cancelled")),
            result = future => result?,
        }
        #[cfg(feature = "test-support")]
        self.wait_test_pause("REBOOT_TEST_AT_MOST_ONCE_BEFORE_STORED")
            .await?;
        {
            let _lease = workflow_reader_lease(&gate, &mut revisions).await?;
            self.validate_scope().await?;
            let saved = store
                .workflow_at_most_once_load(self, key, &contract)
                .await?
                .ok_or_else(|| Status::data_loss("at-most-once Started checkpoint disappeared"))?;
            if saved != AtMostOnceUnitCheckpoint::started() {
                return Err(Status::failed_precondition(
                    "at-most-once checkpoint changed during callback",
                ));
            }
            // Control-only Store never loads/upserts an actor snapshot, so ordinary
            // writers during the callback cannot be overwritten with stale state.
            store
                .workflow_at_most_once_save(
                    self,
                    key,
                    &contract,
                    AtMostOnceUnitCheckpoint::stored(),
                )
                .await?;
            self.validate_scope().await?;
        }
        #[cfg(feature = "test-support")]
        self.wait_test_pause("REBOOT_TEST_AT_MOST_ONCE_AFTER_STORED_ACK")
            .await?;
        operation.acknowledged();
        Ok(())
    }
}

#[cfg(test)]
mod at_most_once_unit_behavior_tests {
    include!("../tests/fixtures/workflow_at_most_once_tests.rs");
    include!("../tests/fixtures/wait_cursor_binding_race_tests.rs");
    #[tokio::test]
    async fn typed_result_replay_binds_contract_and_never_constructs_callback() {
        let (f, database, server) = fake().await;
        let attempt = WorkflowAttempt::default();
        let context = f.context(&attempt);
        let constructed = AtomicUsize::new(0);
        let url = "type.googleapis.com/tests.reboot.protoc.Counter";
        let value = context
            .at_most_once_result("remote", 1, url, b"B/ref/Full.Method/request", || {
                constructed.fetch_add(1, Ordering::SeqCst);
                assert_eq!(database.store_requests().len(), 2);
                async { Ok(crate::proto::Counter { value: 41 }) }
            })
            .await
            .unwrap();
        assert_eq!(value.value, 41);
        let replay: crate::proto::Counter = context
            .at_most_once_result("remote", 1, url, b"B/ref/Full.Method/request", || {
                panic!("Stored constructed callback");
                #[allow(unreachable_code)]
                async {
                    Ok(crate::proto::Counter { value: 0 })
                }
            })
            .await
            .unwrap();
        assert_eq!(replay, value);
        assert_eq!(constructed.load(Ordering::SeqCst), 1);
        assert!(attempt.clean());
        let error = context
            .at_most_once_result::<crate::proto::Counter, _, _>(
                "remote",
                1,
                url,
                b"different destination",
                || async { panic!("foreign contract ran") },
            )
            .await
            .unwrap_err();
        assert_eq!(error.code(), tonic::Code::FailedPrecondition);
        assert!(!attempt.clean());
        assert!(
            database.store_requests()[1..]
                .iter()
                .all(|r| r.sync && r.actor_upserts.is_empty() && r.task_upserts.is_empty())
        );
        server.abort();
    }
    #[tokio::test]
    async fn malformed_typed_stored_result_taints_finish_and_local_retry() {
        let (f, database, server) = fake().await;
        let attempt = WorkflowAttempt::default();
        let context = f.context(&attempt);
        let url = "type.googleapis.com/tests.reboot.protoc.Counter";
        let call_contract = b"B/ref/Full.Method/request";
        let id = context.task.task_id.as_ref().unwrap();
        let seed = uuid::Uuid::from_slice(&id.task_uuid).unwrap();
        let key = context.checkpoint_key(
            uuid::Uuid::new_v5(&seed, b"reboot.at-most-once.result.v1"),
            "remote",
            Some("at-most-once.result.v1"),
        );
        let contract = AtMostOnceResultContract {
            method: "tests.Effects.Initialize".into(),
            request: context.task.request.clone(),
            alias: context.checkpoint_alias("remote"),
            version: 1,
            bound: context.checkpoint_bound(),
            parent_bounds: context.checkpoint_parent_bounds(),
            result_type: url.into(),
            call_contract: call_contract.to_vec(),
        };
        // Use the real private saver to bind exact key, actor, workflow, URL and
        // fingerprint. Only the concrete Counter protobuf is malformed: a
        // truncated field-one varint, not an invalid outer envelope.
        let malformed = AtMostOnceResultCheckpoint::stored(url, vec![0x08]);
        let store = &f.tasks.inner.store;
        store
            .workflow_at_most_once_result_save(&context, key, &contract, malformed.clone())
            .await
            .unwrap();
        assert_eq!(
            store
                .workflow_at_most_once_result_load(&context, key, &contract)
                .await
                .unwrap(),
            Some(malformed)
        );
        assert!(attempt.clean());
        let stores_before = database.store_requests().len();
        let constructed = AtomicUsize::new(0);
        let error = context
            .at_most_once_result::<crate::proto::Counter, _, _>(
                "remote",
                1,
                url,
                call_contract,
                || {
                    constructed.fetch_add(1, Ordering::SeqCst);
                    async { Ok(crate::proto::Counter { value: 0 }) }
                },
            )
            .await
            .unwrap_err();
        assert_eq!(error.code(), tonic::Code::DataLoss);
        assert_eq!(error.message(), "malformed typed result");
        assert_eq!(constructed.load(Ordering::SeqCst), 0);
        assert!(!attempt.clean());
        // Deliberately swallow the helper error; neither terminal authority nor
        // clean RetryLocal authority may be recovered from this same attempt.
        let finish = context
            .finish::<D, crate::proto::Counter, crate::proto::Counter>(
                url,
                crate::proto::Counter { value: 9 },
            )
            .await;
        assert!(
            matches!(finish, Err(ref error) if error.code() == tonic::Code::FailedPrecondition)
        );
        let retry = f
            .context(&attempt)
            .body_failed(WorkflowBodyError::RetryLocal(
                "swallowed malformed result".into(),
            ))
            .await;
        assert!(matches!(retry, Err(ref error) if error.code() == tonic::Code::Internal));
        assert_eq!(database.store_requests().len(), stores_before);
        server.abort();
    }
    #[tokio::test]
    async fn typed_failure_is_unresolved_on_a_fresh_attempt() {
        let (f, database, server) = fake().await;
        let url = "type.googleapis.com/tests.reboot.protoc.Counter";
        let attempt = WorkflowAttempt::default();
        assert!(
            f.context(&attempt)
                .at_most_once_result::<crate::proto::Counter, _, _>(
                    "remote",
                    1,
                    url,
                    b"call",
                    || async { Err(Status::unavailable("B may have committed")) }
                )
                .await
                .is_err()
        );
        assert!(!attempt.clean());
        let recovered = WorkflowAttempt::default();
        let error = f
            .context(&recovered)
            .at_most_once_result::<crate::proto::Counter, _, _>(
                "remote",
                1,
                url,
                b"call",
                || async { panic!("Started retried") },
            )
            .await
            .unwrap_err();
        assert_eq!(error.code(), tonic::Code::FailedPrecondition);
        assert!(!recovered.clean());
        assert_eq!(database.store_requests().len(), 2);
        server.abort();
    }
    #[tokio::test]
    async fn recovered_cursor_above_finite_bound_replays_break_without_body() {
        let (endpoint, database, server) = crate::runtime::test_support::start_database().await;
        database.model_control_only_store();
        let f = Fixture::new_decl(&endpoint, "cursor", None, true).await;
        let first_attempt = WorkflowAttempt::default();
        let mut first = f.context(&first_attempt);
        let _: crate::proto::Counter = first
            .run_loop(
                "main",
                1,
                "type.googleapis.com/tests.reboot.protoc.Counter",
                |_| {
                    Box::pin(async {
                        Ok(std::ops::ControlFlow::Break(crate::proto::Counter {
                            value: 1,
                        }))
                    })
                },
            )
            .await
            .unwrap();
        // Arrangement only, NOT proof of canonical Continue. The transport fake
        // rejects upserts to existing tasks; parent native fixture owns that proof.
        let mut canonical = f.task.clone();
        canonical.iteration = 1025;
        database.seed_task(canonical.clone());
        let attempt = WorkflowAttempt::default();
        let mut context = f.context(&attempt);
        context.task = canonical;
        let result = context
            .run_loop(
                "main",
                1,
                "type.googleapis.com/tests.reboot.protoc.Counter",
                |iteration| {
                    Box::pin(async move {
                        assert_eq!(iteration.task().iteration, 1025);
                        assert_eq!(iteration.checkpoint_iteration(), Some(1025));
                        Ok(std::ops::ControlFlow::Break(crate::proto::Counter {
                            value: 73,
                        }))
                    })
                },
            )
            .await
            .unwrap();
        assert_eq!(result.value, 73);
        assert!(attempt.clean());
        assert!(f.tasks.validate(&[context.task().clone()]).is_err());
        assert!(
            f.tasks
                .validate_recovered(&[context.task().clone()])
                .is_ok()
        );
        f.tasks
            .inner
            .store
            .workflow_validate_cursor_binding(context.task(), "main", 1, "tests.Effects.Initialize")
            .await
            .unwrap();
        let resumed_attempt = WorkflowAttempt::default();
        let mut resumed = f.context(&resumed_attempt);
        resumed.task = context.task().clone();
        let replay: crate::proto::Counter = resumed
            .run_loop(
                "main",
                1,
                "type.googleapis.com/tests.reboot.protoc.Counter",
                |_| {
                    panic!("saved Break reconstructed body");
                    #[allow(unreachable_code)]
                    Box::pin(async {
                        Ok(std::ops::ControlFlow::Break(crate::proto::Counter {
                            value: 0,
                        }))
                    })
                },
            )
            .await
            .unwrap();
        assert_eq!(replay, result);
        assert!(resumed_attempt.clean());
        server.abort();
    }
}

#[cfg(test)]
mod at_most_once_unit_record_tests {
    use super::*;
    #[test]
    fn only_started_and_explicit_stored_unit_are_valid() {
        assert!(AtMostOnceUnitCheckpoint::started().validate().is_ok());
        assert!(AtMostOnceUnitCheckpoint::stored().validate().is_ok());
        for phase in [0, 1, 2, 3] {
            for unit in [false, true] {
                for format in [0, 1, 2] {
                    let checkpoint = AtMostOnceUnitCheckpoint {
                        format,
                        phase,
                        unit,
                    };
                    assert_eq!(
                        checkpoint.validate().is_ok(),
                        format == 1 && ((phase == 1 && !unit) || (phase == 2 && unit))
                    );
                }
            }
        }
    }
}

pub(crate) const AT_MOST_ONCE_RESULT_TYPE: &str =
    "type.googleapis.com/reboot.rust.workflow.AtMostOnceResultV1";
#[derive(Clone, PartialEq, prost::Message)]
pub(crate) struct AtMostOnceResultCheckpoint {
    #[prost(uint32, tag = "1")]
    pub format: u32,
    #[prost(uint32, tag = "2")]
    pub phase: u32,
    #[prost(message, optional, tag = "3")]
    pub result: Option<prost_types::Any>,
}
impl AtMostOnceResultCheckpoint {
    fn started() -> Self {
        Self {
            format: 1,
            phase: 1,
            result: None,
        }
    }
    fn stored(url: &str, bytes: Vec<u8>) -> Self {
        Self {
            format: 1,
            phase: 2,
            result: Some(prost_types::Any {
                type_url: url.into(),
                value: bytes,
            }),
        }
    }
    pub(crate) fn validate(&self) -> Result<(), Status> {
        if self.format != 1
            || !(self.phase == 1 && self.result.is_none()
                || self.phase == 2
                    && self.result.as_ref().is_some_and(|r| {
                        !r.type_url.is_empty()
                            && r.type_url.len() <= 512
                            && r.value.len() <= 1048576
                    }))
        {
            return Err(Status::data_loss("invalid typed at-most-once envelope"));
        }
        Ok(())
    }
}
#[derive(prost::Message)]
pub(crate) struct AtMostOnceResultContract {
    #[prost(string, tag = "1")]
    pub method: String,
    #[prost(bytes = "vec", tag = "2")]
    pub request: Vec<u8>,
    #[prost(string, tag = "3")]
    pub alias: String,
    #[prost(uint32, tag = "4")]
    pub version: u32,
    #[prost(uint64, tag = "5")]
    pub bound: u64,
    #[prost(string, tag = "6")]
    pub parent_bounds: String,
    #[prost(string, tag = "7")]
    pub result_type: String,
    #[prost(bytes = "vec", tag = "8")]
    pub call_contract: Vec<u8>,
}
impl WorkflowContext<'_> {
    /// Run a named, versioned external-effect block at most once in this task/scope.
    ///
    /// A synchronous canonical Started ACK precedes even callback construction.
    /// The actor lease is released before the callback, permitting same-actor RPCs.
    /// Stored replays the typed protobuf; Started without Stored permanently fails closed (zero,
    /// partial, or all effects may have happened). Callback failures are framework
    /// failures, not method-declared business errors, and never reset the block.
    /// Lost Start/Store ACK fails the task owner/host through existing uncertainty
    /// guards. This is singleton-owner storage arbitration, NOT Database CAS or
    /// distributed ownership. Increment `version` when callback meaning changes;
    /// changing it under the same alias rejects, it does not authorize reexecution.
    /// `call_contract` is canonical caller-supplied provenance: bind destination
    /// state type/ref, full method and encoded request, never endpoint routing.
    /// Only typed success is durable; every Status remains unresolved Started.
    pub async fn at_most_once_result<R, F, Fut>(
        &self,
        alias: &str,
        version: u32,
        result_type: &'static str,
        call_contract: &[u8],
        callback: F,
    ) -> Result<R, Status>
    where
        R: prost::Message + Default + Send,
        F: FnOnce() -> Fut + Send,
        Fut: std::future::Future<Output = Result<R, Status>> + Send,
    {
        let operation = self.attempt.operation();
        if alias.is_empty()
            || alias.len() > 256
            || alias.chars().any(char::is_control)
            || version == 0
            || result_type.is_empty()
            || result_type.len() > 512
            || call_contract.is_empty()
            || call_contract.len() > 1048576
        {
            return Err(Status::invalid_argument(
                "at-most-once block requires a bounded name and nonzero version",
            ));
        }
        let id = self
            .task
            .task_id
            .as_ref()
            .ok_or_else(|| Status::failed_precondition("missing workflow identity"))?;
        if id.state_type != self.tasks.inner.state_type
            || id.state_ref != self.tasks.inner.state_ref
        {
            return Err(Status::failed_precondition(
                "at-most-once task actor/owner mismatch",
            ));
        }
        let declaration = self
            .tasks
            .declaration(&self.task)
            .filter(|declaration| declaration.workflow)
            .ok_or_else(|| {
                Status::failed_precondition("at-most-once requires a registered workflow")
            })?;
        (declaration.decode_request)(&self.task.request)?;
        let seed = uuid::Uuid::from_slice(&id.task_uuid)
            .map_err(|_| Status::failed_precondition("invalid workflow UUID"))?;
        // Version is fingerprint-bound, deliberately NOT part of the key.
        let key = self.checkpoint_key(
            uuid::Uuid::new_v5(&seed, b"reboot.at-most-once.result.v1"),
            alias,
            Some("at-most-once.result.v1"),
        );
        let contract = AtMostOnceResultContract {
            method: declaration.method.into(),
            request: self.task.request.clone(),
            alias: self.checkpoint_alias(alias),
            version,
            bound: self.checkpoint_bound(),
            parent_bounds: self.checkpoint_parent_bounds(),
            result_type: result_type.into(),
            call_contract: call_contract.to_vec(),
        };
        let store = &self.tasks.inner.store;
        let gate = store.actor_gate(&id.state_type, &id.state_ref);
        let mut revisions = gate.committed_revisions();
        {
            let _lease = workflow_reader_lease(&gate, &mut revisions).await?;
            self.validate_scope().await?;
            match store
                .workflow_at_most_once_result_load(self, key, &contract)
                .await?
            {
                Some(saved) if saved.phase == 2 => {
                    let value = saved
                        .result
                        .ok_or_else(|| Status::data_loss("missing typed result"))?;
                    if value.type_url != result_type {
                        return Err(Status::data_loss("typed result URL mismatch"));
                    }
                    let decoded = R::decode(value.value.as_slice())
                        .map_err(|_| Status::data_loss("malformed typed result"))?;
                    operation.acknowledged();
                    return Ok(decoded);
                }
                Some(_) => {
                    return Err(Status::failed_precondition(
                        "at-most-once block Started without Stored; callback will not run again",
                    ));
                }
                None => {}
            }
            #[cfg(feature = "test-support")]
            self.wait_test_pause("REBOOT_TEST_AT_MOST_ONCE_BEFORE_STARTED")
                .await?;
            store
                .workflow_at_most_once_result_save(
                    self,
                    key,
                    &contract,
                    AtMostOnceResultCheckpoint::started(),
                )
                .await?;
            self.validate_scope().await?;
        }
        // No actor lease or durable-ACK guard lives across construction or polling.
        // Revocation after this validation is handled by supervisor cancellation;
        // its one-owner lifetime retains ownership until this future is destroyed.
        #[cfg(feature = "test-support")]
        self.wait_test_pause("REBOOT_TEST_AT_MOST_ONCE_AFTER_STARTED_ACK")
            .await?;
        self.validate_scope().await?;
        let future = callback();
        let result = tokio::select! {
            biased;
            _ = self.cancel.cancelled() => return Err(Status::cancelled("at-most-once callback cancelled")),
            result = future => result?,
        };
        if result.encoded_len() > 1048576 {
            return Err(Status::resource_exhausted("typed result exceeds 1MiB"));
        }
        #[cfg(feature = "test-support")]
        self.wait_test_pause("REBOOT_TEST_AT_MOST_ONCE_BEFORE_STORED")
            .await?;
        {
            let _lease = workflow_reader_lease(&gate, &mut revisions).await?;
            self.validate_scope().await?;
            let saved = store
                .workflow_at_most_once_result_load(self, key, &contract)
                .await?
                .ok_or_else(|| Status::data_loss("at-most-once Started checkpoint disappeared"))?;
            if saved != AtMostOnceResultCheckpoint::started() {
                return Err(Status::failed_precondition(
                    "at-most-once checkpoint changed during callback",
                ));
            }
            // Control-only Store never loads/upserts an actor snapshot, so ordinary
            // writers during the callback cannot be overwritten with stale state.
            store
                .workflow_at_most_once_result_save(
                    self,
                    key,
                    &contract,
                    AtMostOnceResultCheckpoint::stored(result_type, result.encode_to_vec()),
                )
                .await?;
            self.validate_scope().await?;
        }
        #[cfg(feature = "test-support")]
        self.wait_test_pause("REBOOT_TEST_AT_MOST_ONCE_AFTER_STORED_ACK")
            .await?;
        operation.acknowledged();
        Ok(result)
    }
}

#[cfg(test)]
mod typed_result_record_tests {
    use super::*;
    #[test]
    fn typed_envelope_excludes_missing_results_started_payloads_and_oversize() {
        let started = AtMostOnceResultCheckpoint::started();
        assert!(started.validate().is_ok());
        assert!(
            AtMostOnceResultCheckpoint::stored("type.googleapis.com/Counter", vec![])
                .validate()
                .is_ok()
        );
        let mut missing = started.clone();
        missing.phase = 2;
        assert!(missing.validate().is_err());
        let mut payload = AtMostOnceResultCheckpoint::stored("type.googleapis.com/Counter", vec![]);
        payload.phase = 1;
        assert!(payload.validate().is_err());
        assert!(
            AtMostOnceResultCheckpoint::stored("", vec![])
                .validate()
                .is_err()
        );
        assert!(
            AtMostOnceResultCheckpoint::stored("type.googleapis.com/Counter", vec![0; 1048577])
                .validate()
                .is_err()
        );
    }
    #[test]
    fn cancelled_cursor_driver_taints_finish_without_active_helpers() {
        let attempt = WorkflowAttempt::default();
        drop(CursorDriverGuard {
            attempt: &attempt,
            acknowledged: false,
        });
        assert!(!attempt.clean());
        let attempt = WorkflowAttempt::default();
        drop(CursorDriverGuard {
            attempt: &attempt,
            acknowledged: true,
        });
        assert!(attempt.clean());
    }
}
