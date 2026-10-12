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
            .declaration(self.task)
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
