// Included in runtime.rs. Aborted-root receipts have an explicit domain and
// schema binding, never the success protobuf/ordinary-writer receipt encoding.
const DECLARED_TRANSACTION: &str = "x-reboot-durable-declared-transaction";
const ABORT_RECEIPT_DOMAIN: &[u8] = b"reboot.transaction.aborted-result.v1\0";
pub fn is_durable_declared_transaction_error(status: &Status) -> bool {
    status
        .metadata()
        .get(DECLARED_TRANSACTION)
        .is_some_and(|v| v == "v1")
}
/// Handler/framework failures cannot forward another target's receipt ACK.
#[doc(hidden)]
pub fn without_declared_transaction_ack(mut status: Status) -> Status {
    status.metadata_mut().remove(DECLARED_TRANSACTION);
    status
}
pub(crate) fn acknowledged_declared_transaction_status(mut status: Status) -> Status {
    status
        .metadata_mut()
        .insert(DECLARED_TRANSACTION, "v1".parse().unwrap());
    status
}
pub(crate) fn canonical_declared_transaction_status(
    status: Status,
    errors: &[crate::one_shot_tasks::DeclaredTaskError],
) -> Result<Status, Status> {
    validate_aborted_status(&status, errors)?;
    let mut rich = crate::declared_error_details(&status)
        .map_err(|_| Status::data_loss("malformed declared transaction status"))?
        .ok_or_else(|| Status::data_loss("missing declared transaction status"))?;
    rich.code = tonic::Code::Aborted as i32;
    Ok(Status::with_details(
        tonic::Code::Aborted,
        rich.message.clone(),
        rich.encode_to_vec().into(),
    ))
}
fn aborted_fingerprint(
    receipt: &TransactionIdempotency,
    errors: &[crate::one_shot_tasks::DeclaredTaskError],
) -> Vec<u8> {
    use sha2::{Digest, Sha256};
    let mut schema = Sha256::new();
    for error in errors {
        let url = error.type_url();
        schema.update((url.len() as u64).to_be_bytes());
        schema.update(url.as_bytes());
    }
    let mut bytes = ABORT_RECEIPT_DOMAIN.to_vec();
    bytes.extend_from_slice(receipt.request_fingerprint());
    bytes.extend_from_slice(&schema.finalize());
    bytes
}
fn validate_aborted_status(
    status: &Status,
    errors: &[crate::one_shot_tasks::DeclaredTaskError],
) -> Result<(), Status> {
    crate::one_shot_tasks::DeclaredTaskError::validate_status(errors, status)?;
    let rich = crate::declared_error_details(status)
        .map_err(|_| Status::data_loss("malformed aborted root status"))?
        .ok_or_else(|| Status::data_loss("missing aborted root status"))?;
    if rich.details.len() != 1 {
        return Err(Status::data_loss(
            "aborted root must have exactly one declared detail",
        ));
    }
    Ok(())
}
impl TransactionIdempotency {
    pub(crate) fn declared_abort_mutation(
        &self,
        state_type: &str,
        state_ref: &str,
        status: &Status,
        errors: &[crate::one_shot_tasks::DeclaredTaskError],
    ) -> Result<database::IdempotentMutation, Status> {
        validate_aborted_status(status, errors)?;
        let mut mutation = self.mutation(state_type, state_ref, &());
        mutation.request_fingerprint = Some(aborted_fingerprint(self, errors));
        mutation.response = status.details().to_vec();
        Ok(mutation)
    }
    /// Replay only after current target authorization and actor admission. Error
    /// bytes cannot be mistaken for a success, or adopted under a changed schema.
    #[doc(hidden)]
    pub fn replay_outcome_bound<R: Message + Default>(
        &self,
        mutation: &database::IdempotentMutation,
        state_type: &str,
        state_ref: &str,
        errors: &[crate::one_shot_tasks::DeclaredTaskError],
    ) -> Result<Option<R>, Status> {
        if mutation.key != self.key.as_bytes() {
            return Ok(None);
        }
        if mutation
            .request_fingerprint
            .as_deref()
            .is_some_and(|fp| fp.starts_with(ABORT_RECEIPT_DOMAIN))
        {
            if mutation.state_type != state_type
                || mutation.state_ref != state_ref
                || mutation.workflow_id.is_some()
                || mutation.workflow_iteration.is_some()
                || !mutation.task_ids.is_empty()
                || mutation.request_fingerprint.as_deref()
                    != Some(aborted_fingerprint(self, errors).as_slice())
            {
                return Err(Status::failed_precondition(
                    "aborted root receipt actor, scope, schema or request binding differs",
                ));
            }
            let rich = googleapis_tonic_google_rpc::google::rpc::Status::decode(
                mutation.response.as_slice(),
            )
            .map_err(|_| Status::data_loss("malformed aborted root receipt"))?;
            let status = Status::with_details(
                tonic::Code::from_i32(rich.code),
                rich.message,
                mutation.response.clone().into(),
            );
            validate_aborted_status(&status, errors)?;
            return Err(acknowledged_declared_transaction_status(status));
        }
        self.replay_bound(mutation, state_type, state_ref)
    }
}
