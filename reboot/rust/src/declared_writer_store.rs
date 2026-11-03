// Included in runtime.rs. Receipt identity is deliberately distinct from raw
// success protobufs and scheduling receipts; old readers reject rather than
// interpreting a rich error as a successful response.
pub(crate) const DURABLE_DECLARED_WRITER: &str = "x-reboot-durable-declared-writer";
/// Explicit generated ordinary-writer disposition, separate from task terminal
/// errors (whose canonical task protocol intentionally permits only one detail).
pub enum DeclaredWriterError {
    Declared(Status),
    Failed(Status),
}
fn declared_writer_fingerprint(fingerprint: &[u8]) -> Vec<u8> {
    let mut result = b"reboot.ordinary-writer.declared-error.v1\0".to_vec();
    result.extend_from_slice(fingerprint);
    result
}
pub fn is_durable_declared_writer_error(status: &Status) -> bool {
    status
        .metadata()
        .get(DURABLE_DECLARED_WRITER)
        .is_some_and(|value| value == "v1")
}
fn durable_declared_status(bytes: &[u8]) -> Result<Status, Status> {
    let rich = googleapis_tonic_google_rpc::google::rpc::Status::decode(bytes)
        .map_err(|_| Status::data_loss("malformed durable writer error"))?;
    if !(1..=16).contains(&rich.code) || rich.details.is_empty() || bytes.len() > 1048576 {
        return Err(Status::data_loss("invalid durable writer error"));
    }
    let mut status = Status::with_details(
        tonic::Code::from_i32(rich.code),
        rich.message,
        bytes.to_vec().into(),
    );
    status.metadata_mut().insert(
        DURABLE_DECLARED_WRITER,
        "v1".parse().expect("static metadata"),
    );
    Ok(status)
}
impl DatabaseActorStore {
    async fn persist_declared_writer_error(
        &self,
        state_type: &str,
        state_ref: &str,
        key: Uuid,
        fingerprint: &[u8],
        status: &Status,
    ) -> Result<(), Status> {
        let attempt = self.actor_gate(state_type, state_ref).commit_attempt();
        self.database
            .clone()
            .store(database::StoreRequest {
                // Handler state and effects are discarded on a declared failure.
                actor_upserts: vec![],
                task_upserts: vec![],
                colocated_upserts: vec![],
                transaction: None,
                ensure_state_types_created: vec![],
                sync: true,
                idempotent_mutation: Some(database::IdempotentMutation {
                    state_type: state_type.into(),
                    state_ref: state_ref.into(),
                    key: key.as_bytes().to_vec(),
                    response: status.details().to_vec(),
                    request_fingerprint: Some(declared_writer_fingerprint(fingerprint)),
                    task_ids: vec![],
                    workflow_id: None,
                    workflow_iteration: None,
                }),
            })
            .await?;
        attempt.acknowledged();
        Ok(())
    }
}
