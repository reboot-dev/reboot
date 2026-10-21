// Included in runtime.rs. This is intent, NOT a successful response receipt or
// terminal decision. An admitted remote call may have happened even without ACK.
const ROOT_ATTEMPT_DOMAIN: &[u8] = b"reboot.canonical.root-attempt.v1\0";
#[derive(Clone, PartialEq, prost::Message)]
struct CanonicalRootAttemptRecord {
    #[prost(bytes = "vec", tag = "1")]
    root: Vec<u8>,
    #[prost(bytes = "vec", tag = "2")]
    workflow: Vec<u8>,
    #[prost(int64, optional, tag = "3")]
    iteration: Option<i64>,
    #[prost(message, repeated, tag = "4")]
    members: Vec<CanonicalRootAttemptMember>,
    #[prost(string, repeated, tag = "5")]
    errors: Vec<String>,
}
#[derive(Clone, PartialEq, prost::Message)]
struct CanonicalRootAttemptMember {
    #[prost(string, tag = "1")]
    state_type: String,
    #[prost(string, tag = "2")]
    state_ref: String,
    #[prost(string, tag = "3")]
    method: String,
}
struct CanonicalRootAttemptJournal {
    sidecar: Arc<dyn crate::durable_participant::ParticipantSidecar>,
    mutation: database::IdempotentMutation,
    record: tokio::sync::Mutex<CanonicalRootAttemptRecord>,
}
impl std::fmt::Debug for CanonicalRootAttemptJournal {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("CanonicalRootAttemptJournal")
            .finish_non_exhaustive()
    }
}
fn root_attempt_mutation(
    receipt: &TransactionIdempotency,
    state_type: &str,
    headers: &RebootHeaders,
) -> database::IdempotentMutation {
    let namespace = Uuid::new_v5(&receipt.key(), ROOT_ATTEMPT_DOMAIN);
    let identity = format!("{}:{}:{}", state_type.len(), state_type, headers.state_ref);
    let mut mutation = receipt.mutation(state_type, &headers.state_ref, &());
    mutation.key = Uuid::new_v5(&namespace, identity.as_bytes())
        .as_bytes()
        .to_vec();
    let mut fingerprint = ROOT_ATTEMPT_DOMAIN.to_vec();
    fingerprint.extend_from_slice(receipt.request_fingerprint());
    mutation.request_fingerprint = Some(fingerprint);
    mutation
}
async fn load_root_attempt(
    sidecar: &dyn crate::durable_participant::ParticipantSidecar,
    expected: &database::IdempotentMutation,
    headers: &RebootHeaders,
) -> Result<Option<CanonicalRootAttemptRecord>, Status> {
    let responses = sidecar
        .recover_idempotent_mutations(database::RecoverIdempotentMutationsRequest {
            state_type: expected.state_type.clone(),
            state_ref: expected.state_ref.clone(),
            idempotency_key: Some(expected.key.clone()),
            workflow_id: None,
            workflow_iteration: None,
        })
        .await?;
    let mut found = None;
    for mutation in responses.into_iter().flat_map(|r| r.idempotent_mutations) {
        if found.is_some()
            || mutation.state_type != expected.state_type
            || mutation.state_ref != expected.state_ref
            || mutation.key != expected.key
            || mutation.request_fingerprint != expected.request_fingerprint
            || mutation.workflow_id.is_some()
            || mutation.workflow_iteration.is_some()
            || !mutation.task_ids.is_empty()
        {
            return Err(Status::failed_precondition(
                "canonical root intent identity differs",
            ));
        }
        let record = CanonicalRootAttemptRecord::decode(mutation.response.as_slice())
            .map_err(|_| Status::data_loss("malformed canonical root intent"))?;
        let root = Uuid::from_slice(&record.root)
            .map_err(|_| Status::data_loss("malformed original root UUID"))?;
        if root.is_nil()
            || record.workflow
                != headers
                    .workflow_id
                    .map(|id| id.as_bytes().to_vec())
                    .unwrap_or_default()
            || record.iteration != headers.workflow_iteration
            || record.members.len() > 1024
            || record
                .members
                .iter()
                .any(|m| m.state_type.is_empty() || m.state_ref.is_empty() || m.method.is_empty())
            || record.members.windows(2).any(|w| {
                (&w[0].state_type, &w[0].state_ref, &w[0].method)
                    >= (&w[1].state_type, &w[1].state_ref, &w[1].method)
            })
        {
            return Err(Status::data_loss(
                "invalid canonical root intent scope or membership",
            ));
        }
        found = Some(record);
    }
    Ok(found)
}
/// Generated canonical root-star only. Lookup selects the original identity but
/// never discloses a result or grants retry/terminal authority. Authorization and
/// a second lookup under original actor admission still precede handler entry.
#[doc(hidden)]
pub async fn start_canonical_root_transaction<F, Q>(
    headers: RebootHeaders,
    state_type: &str,
    method: &str,
    request: &Q,
    factory: &F,
    sidecar: &dyn crate::durable_participant::ParticipantSidecar,
) -> Result<RootTransactionContext, Status>
where
    F: RootTransactionStartFactory,
    Q: Message,
{
    RootTransactionContext::validate_fresh(&headers, state_type)
        .map_err(|e| Status::failed_precondition(e.to_string()))?;
    let key = headers
        .idempotency_key
        .ok_or_else(|| Status::invalid_argument("canonical root requires receipt key"))?;
    check_idempotency_key_not_expired(key)?;
    let receipt = TransactionIdempotency {
        key,
        request_fingerprint: request_fingerprint(method, request),
    };
    let mutation = root_attempt_mutation(&receipt, state_type, &headers);
    let prior = load_root_attempt(sidecar, &mutation, &headers).await?;
    let start = match prior {
        Some(record) => RootTransactionStart {
            transaction_id: Uuid::from_slice(&record.root)
                .map_err(|_| Status::data_loss("invalid original root"))?,
            // Original identity is recovered, never replaced by a fresh factory
            // ID. This legacy path does not use restart-detection timestamps.
            timestamp: prost_types::Timestamp::default(),
        },
        None => factory.next_root_transaction()?,
    };
    RootTransactionContext::start(
        headers,
        state_type,
        TransactionMode::Exclusive,
        start.transaction_id,
        start.timestamp,
    )
    .map_err(|e| Status::failed_precondition(e.to_string()))
}
impl CanonicalRootAttemptJournal {
    async fn persist(&self, record: &CanonicalRootAttemptRecord) -> Result<(), Status> {
        let mut mutation = self.mutation.clone();
        mutation.response = record.encode_to_vec();
        self.sidecar
            .store(database::StoreRequest {
                idempotent_mutation: Some(mutation),
                ..Default::default()
            })
            .await?;
        Ok(())
    }
    async fn before_remote(
        &self,
        target: &crate::durable_coordinator::ParticipantTarget,
        method: &str,
    ) -> Result<(), Status> {
        let mut record = self.record.lock().await;
        let member = CanonicalRootAttemptMember {
            state_type: target.state_type.clone(),
            state_ref: target.state_ref.clone(),
            method: method.into(),
        };
        if record.members.contains(&member) {
            return Err(Status::failed_precondition(
                "canonical root remote member already dispatched",
            ));
        }
        if record.members.len() >= 1024 {
            return Err(Status::resource_exhausted(
                "canonical root membership bound",
            ));
        }
        // Publish the conservative in-memory intent BEFORE polling Store too:
        // dropped/lost ACK cannot let a caught error issue this call again.
        record.members.push(member);
        record.members.sort_by(|a, b| {
            (&a.state_type, &a.state_ref, &a.method).cmp(&(&b.state_type, &b.state_ref, &b.method))
        });
        self.persist(&record).await?;
        #[cfg(feature = "test-support")]
        if let Some(path) = std::env::var_os("REBOOT_TEST_CANONICAL_REMOTE_INTENT") {
            let path = std::path::PathBuf::from(path);
            std::fs::write(
                &path,
                Uuid::from_slice(&record.root)
                    .map_err(|_| Status::data_loss("invalid root intent"))?
                    .to_string(),
            )
            .map_err(|e| Status::internal(e.to_string()))?;
            while !path.with_extension("release").exists() {
                tokio::time::sleep(std::time::Duration::from_millis(10)).await;
            }
        }
        Ok(())
    }
}
impl TransactionContext {
    pub(crate) async fn install_canonical_root_attempt<
        P: crate::durable_participant::ParticipantSidecar,
    >(
        &mut self,
        sidecar: Arc<P>,
        errors: &[crate::one_shot_tasks::DeclaredTaskError],
    ) -> Result<(), Status> {
        let receipt = self
            .root_receipt
            .as_ref()
            .ok_or_else(|| Status::failed_precondition("canonical root receipt missing"))?;
        let mutation = root_attempt_mutation(
            receipt,
            self.transaction_coordinator_state_type(),
            &self.headers,
        );
        let prior = load_root_attempt(sidecar.as_ref(), &mutation, &self.headers).await?;
        let schema: Vec<String> = errors.iter().map(|e| e.type_url().to_owned()).collect();
        let record = match prior {
            Some(record) => {
                if record.root != self.transaction_root_id().as_bytes() || record.errors != schema {
                    return Err(Status::unavailable(
                        "original canonical root binding changed during admission",
                    ));
                }
                if !record.members.is_empty() {
                    // Intent is not Commit/Abort or an acknowledged response.
                    // Recovery needs an outcome bridge before reexecution is safe.
                    return Err(Status::unavailable(
                        "original canonical root has unresolved remote membership",
                    ));
                }
                record
            }
            None => CanonicalRootAttemptRecord {
                root: self.transaction_root_id().as_bytes().to_vec(),
                workflow: self
                    .headers
                    .workflow_id
                    .map(|id| id.as_bytes().to_vec())
                    .unwrap_or_default(),
                iteration: self.headers.workflow_iteration,
                members: vec![],
                errors: schema,
            },
        };
        let journal = Arc::new(CanonicalRootAttemptJournal {
            sidecar,
            mutation,
            record: tokio::sync::Mutex::new(record),
        });
        journal.persist(&*journal.record.lock().await).await?;
        self.canonical_root_attempt = Some(journal);
        #[cfg(feature = "test-support")]
        if let Some(path) = std::env::var_os("REBOOT_TEST_CANONICAL_ROOT_BOUND") {
            let path = std::path::PathBuf::from(path);
            std::fs::write(&path, self.transaction_root_id().to_string())
                .map_err(|e| Status::internal(e.to_string()))?;
            while !path.with_extension("release").exists() {
                tokio::time::sleep(std::time::Duration::from_millis(10)).await;
            }
        }
        Ok(())
    }
}
