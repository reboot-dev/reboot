// Included in durable_participant.rs. A declared-error receipt is staged only
// on the exact original exclusive root, and persisted AFTER acknowledged native
// Abort, while that same participant still retains actor admission.
impl<C: ParticipantSidecar> StartedLocalTransaction<C> {
    pub(crate) async fn has_declared_abort_receipt(&self) -> bool {
        self.participant
            .pending
            .lock_root(self.transaction_id)
            .await
            .as_ref()
            .is_some_and(|current| {
                current.local_owner == Some(self.local_owner) && current.abort_receipt.is_some()
            })
    }
    pub(crate) async fn stage_declared_abort_receipt(
        &self,
        receipt: database::IdempotentMutation,
    ) -> Result<(), Status> {
        if self.was_handed_off() || !self.admitted_explicit_root_scope {
            return Err(Status::failed_precondition(
                "declared Abort receipt requires pre-handoff root",
            ));
        }
        let mut pending = self
            .participant
            .pending
            .lock_root(self.transaction_id)
            .await;
        let current = pending
            .as_mut()
            .ok_or_else(|| Status::failed_precondition("original root missing"))?;
        if current.root_id != self.transaction_id
            || current.local_owner != Some(self.local_owner)
            || current.lock.is_shared()
            || current.prepared
            || current.terminal_attempted
            || current.native_uncertain
            || current.abort_receipt.is_some()
            || receipt.state_type != self.participant.state_type
            || receipt.state_ref != self.participant.state_ref
        {
            return Err(Status::failed_precondition(
                "declared Abort receipt original incarnation differs",
            ));
        }
        current.abort_receipt = Some(receipt);
        Ok(())
    }
}
