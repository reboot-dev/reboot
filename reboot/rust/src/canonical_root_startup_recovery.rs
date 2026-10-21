// Included in runtime.rs. Startup owns the ORIGINAL participant allocation and
// admission, not a UUID inferred from a missing child receipt. Missing native
// authority stays owned/Pending; this path NEVER writes a native decision, saved
// response, source journal, or terminal Task CAS.
struct CanonicalStartupAdmission<P: crate::durable_participant::ParticipantSidecar>(
    crate::durable_participant::StartedLocalTransaction<P>,
);
impl<P: crate::durable_participant::ParticipantSidecar> Drop for CanonicalStartupAdmission<P> {
    fn drop(&mut self) {
        // An interrupted native terminal ACK must not trigger speculative Drop
        // cleanup. The participant allocation retains its exact slot and gate.
        self.0.handoff_to_durable_recovery();
    }
}

pub(crate) async fn start_canonical_root_recovery<P, C, R>(
    participant: &crate::durable_participant::DurableActorParticipant<P>,
    coordinator: &crate::durable_coordinator::DurableRootCoordinator<C, R>,
    supervisor: &mut tokio::task::JoinSet<Result<(), Status>>,
    cancel: crate::application_host::RecoveryCancellation,
) -> Result<(), Status>
where
    P: crate::durable_participant::ParticipantSidecar,
    C: crate::durable_coordinator::CoordinatorSidecar,
    R: crate::durable_coordinator::ParticipantResolver,
{
    use crate::durable_participant::{
        ActorTransactionStart, ParticipantStartMode, TransactionPathContract,
    };
    let target = participant.actor_target();
    let sidecar = participant.sidecar();
    if sidecar.database_endpoint().is_none()
        || sidecar.database_endpoint() != coordinator.sidecar().database_endpoint()
        || crate::application_host::ParticipantCleanupBinding::current().is_none()
    {
        return Err(Status::failed_precondition(
            "canonical startup requires original host/Database ownership",
        ));
    }
    let rows = sidecar
        .recover_idempotent_mutations(database::RecoverIdempotentMutationsRequest {
            state_type: target.state_type.clone(),
            state_ref: target.state_ref.clone(),
            idempotency_key: None,
            workflow_id: None,
            workflow_iteration: None,
        })
        .await?;
    let rows: Vec<_> = rows
        .into_iter()
        .flat_map(|page| page.idempotent_mutations)
        .collect();
    if rows.len() > 4096 || rows.iter().map(Message::encoded_len).sum::<usize>() > 16 * 1024 * 1024
    {
        return Err(Status::resource_exhausted(
            "canonical startup snapshot bound",
        ));
    }
    let mut claims = Vec::new();
    let mut roots = std::collections::BTreeSet::new();
    for mutation in &rows {
        let Some(fingerprint) = mutation
            .request_fingerprint
            .as_deref()
            .and_then(|f| f.strip_prefix(ROOT_ATTEMPT_DOMAIN))
        else {
            continue;
        };
        if fingerprint.len() != 32 {
            return Err(Status::data_loss("invalid canonical startup fingerprint"));
        }
        let record = CanonicalRootAttemptRecord::decode(mutation.response.as_slice())
            .map_err(|_| Status::data_loss("malformed canonical startup intent"))?;
        let key = Uuid::from_slice(&record.receipt_key).map_err(|_| {
            Status::failed_precondition("legacy canonical intent lacks startup receipt binding")
        })?;
        let workflow = Uuid::from_slice(&record.workflow)
            .map_err(|_| Status::data_loss("canonical startup workflow missing"))?;
        let headers = RebootHeaders {
            state_ref: target.state_ref.clone(),
            idempotency_key: Some(key),
            workflow_id: Some(workflow),
            workflow_iteration: record.iteration,
            ..RebootHeaders::new(&target.state_ref)
        };
        let receipt = TransactionIdempotency {
            key,
            request_fingerprint: fingerprint.to_vec(),
        };
        let expected = root_attempt_mutation(&receipt, &target.state_type, &headers);
        if mutation.key != expected.key || key.is_nil() || workflow.is_nil() {
            return Err(Status::data_loss("canonical startup key binding differs"));
        }
        let checked = load_root_attempt(sidecar.as_ref(), &expected, &headers)
            .await?
            .ok_or_else(|| Status::unavailable("canonical startup intent disappeared"))?;
        if checked != record {
            return Err(Status::unavailable("canonical startup intent changed"));
        }
        let root = Uuid::from_slice(&record.root)
            .map_err(|_| Status::data_loss("canonical startup root missing"))?;
        if !roots.insert(root) {
            return Err(Status::data_loss("duplicate canonical startup root"));
        }
        // A saved receipt is handled by the generated reauthorization/replay path,
        // not disclosed or translated here. Reconstruct the declared schema bind.
        let mut abort_fingerprint = ABORT_RECEIPT_DOMAIN.to_vec();
        abort_fingerprint.extend_from_slice(fingerprint);
        use sha2::{Digest, Sha256};
        let mut schema = Sha256::new();
        for error in &record.errors {
            schema.update((error.len() as u64).to_be_bytes());
            schema.update(error.as_bytes());
        }
        abort_fingerprint.extend_from_slice(&schema.finalize());
        let receipts: Vec<_> = rows
            .iter()
            .filter(|row| row.key == record.receipt_key)
            .collect();
        if receipts.len() > 1 {
            return Err(Status::data_loss("duplicate canonical terminal receipt"));
        }
        if let Some(row) = receipts.first() {
            if row.state_type != target.state_type
                || row.state_ref != target.state_ref
                || row.workflow_id.is_some()
                || row.workflow_iteration.is_some()
                || !row.task_ids.is_empty()
                || ![fingerprint, abort_fingerprint.as_slice()]
                    .contains(&row.request_fingerprint.as_deref().unwrap_or_default())
            {
                return Err(Status::data_loss(
                    "canonical terminal receipt binding differs",
                ));
            }
            continue;
        }
        if record
            .members
            .iter()
            .any(|m| m.state_type == target.state_type && m.state_ref == target.state_ref)
        {
            return Err(Status::data_loss(
                "canonical startup remote member aliases root",
            ));
        }
        if !record.recovery_retired {
            claims.push((root, expected, headers, record));
        }
    }
    // A single actor cannot have two unresolved exclusive original owners. Do
    // not partially adopt a malformed multi-owner snapshot and deadlock on self.
    if claims.len() > 1 {
        return Err(Status::failed_precondition(
            "multiple unresolved canonical startup roots",
        ));
    }
    for (root, mutation, headers, mut record) in claims {
        let mut admission = CanonicalStartupAdmission(
            participant
                .start_local(
                    ActorTransactionStart {
                        transaction_ids: vec![root],
                        transaction_path: TransactionPathContract::RootOnly,
                        coordinator_state_type: target.state_type.clone(),
                        coordinator_state_ref: target.state_ref.clone(),
                        mode: TransactionMode::Exclusive,
                        read_only: false,
                        factory: false,
                        state_type: target.state_type.clone(),
                        state_ref: target.state_ref.clone(),
                    },
                    ParticipantStartMode::Exclusive,
                )
                .await?,
        );
        // Recheck AFTER admission, using exactly the saved original identity.
        if load_root_attempt(sidecar.as_ref(), &mutation, &headers)
            .await?
            .as_ref()
            != Some(&record)
        {
            return Err(Status::unavailable(
                "canonical startup binding changed under admission",
            ));
        }
        record.recovery_claimed = true;
        let journal = CanonicalRootAttemptJournal {
            sidecar: sidecar.clone(),
            mutation,
            record: tokio::sync::Mutex::new(record.clone()),
        };
        journal.persist(&record).await?;
        #[cfg(feature = "test-support")]
        if let Some(path) = std::env::var_os("REBOOT_TEST_CANONICAL_STARTUP_OWNED") {
            std::fs::write(path, root.to_string()).map_err(|e| Status::internal(e.to_string()))?;
        }
        let coordinator = coordinator.clone();
        let target = target.clone();
        let cancel = cancel.clone();
        supervisor.spawn(async move {
            use crate::durable_coordinator::ParticipantEndpoint;
            loop {
                let decision = coordinator
                    .sidecar()
                    .decision_get(database::TransactionCoordinatorDecisionGetRequest {
                        root_transaction_id: root.as_bytes().to_vec(),
                        coordinator_state_ref: target.state_ref.clone(),
                    })
                    .await?;
                if let Some(decision) = decision.decision {
                    if decision.coordinator_state_ref != target.state_ref {
                        return Err(Status::data_loss(
                            "canonical startup native coordinator differs",
                        ));
                    }
                    match database::transaction_coordinator_decision::Outcome::try_from(
                        decision.outcome,
                    ) {
                        Ok(database::transaction_coordinator_decision::Outcome::Abort) => {
                            if decision.participants.is_some() {
                                return Err(Status::data_loss(
                                    "canonical startup Abort carries participants",
                                ));
                            }
                            let members: std::collections::BTreeSet<_> = record
                                .members
                                .iter()
                                .map(|m| crate::durable_coordinator::ParticipantTarget {
                                    state_type: m.state_type.clone(),
                                    state_ref: m.state_ref.clone(),
                                })
                                .collect();
                            for member in members {
                                if member == target {
                                    return Err(Status::data_loss(
                                        "canonical startup remote member aliases root",
                                    ));
                                }
                                coordinator
                                    .resolver()
                                    .resolve(&member)
                                    .await?
                                    .abort(
                                        &member.state_ref,
                                        database::AbortRequest {
                                            transaction_id: root.as_bytes().to_vec(),
                                        },
                                    )
                                    .await?;
                            }
                            // Retirement records the actual member ACK barrier only.
                            // It is NOT an acknowledged response or source Task result.
                            record.recovery_retired = true;
                            journal.persist(&record).await?;
                            admission.0.release_clean_cached_root().await?;
                            #[cfg(feature = "test-support")]
                            if let Some(path) =
                                std::env::var_os("REBOOT_TEST_CANONICAL_STARTUP_RETIRED")
                            {
                                std::fs::write(path, root.to_string())
                                    .map_err(|e| Status::internal(e.to_string()))?;
                            }
                            // HostRecovery supervisors are persistent obligations.
                            // Successful retirement releases admission, not the host.
                            cancel.cancelled().await;
                            return Ok(());
                        }
                        Ok(database::transaction_coordinator_decision::Outcome::Commit) => {
                            // A decision is not the missing typed result. Do not
                            // repeat the body or synthesize a successful receipt.
                        }
                        _ => {
                            return Err(Status::data_loss(
                                "canonical startup invalid native outcome",
                            ));
                        }
                    }
                }
                tokio::select! {
                    _ = cancel.cancelled() => {
                        // A queued original target RPC may still be waiting on
                        // this gate. Never release unknown ownership into that
                        // queue during shutdown. Drop disarms speculative Abort
                        // and the original participant retains its slot/lease.
                        return Ok(());
                    }
                    _ = tokio::time::sleep(std::time::Duration::from_millis(25)) => {}
                }
            }
        });
    }
    Ok(())
}
