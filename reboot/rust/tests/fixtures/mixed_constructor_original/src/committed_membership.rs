//! Identity discovery for Accounts constructed by ONE configured original Bank.
//! This is not ownership, placement, readiness, task recovery or authorization.
//! Call only after the owned transaction graph has converged; retain the same
//! store and gates as the consuming host. Standalone Account.Open is not indexed.
use crate::bank::v1 as b;
use reboot::{
    durable_coordinator::ParticipantTarget, runtime::DatabaseActorStore, state_ref::StateRef,
};
use std::collections::BTreeSet;
use tonic::Status;

const BANK: &str = "bank.v1.Bank";
const ACCOUNT: &str = "bank.v1.Account";
const MAX_OWNERS: usize = 1024;

/// Decode original logical IDs without normalization or invented membership.
/// Bound raw entries before deduplication as well as the final owner set.
pub fn account_targets(
    state: &b::Bank,
    max_owners: usize,
) -> Result<Vec<ParticipantTarget>, Box<Status>> {
    validate_limit(max_owners)?;
    if state.account_ids.len() > max_owners {
        return Err(Box::new(Status::resource_exhausted(
            "Bank membership exceeds configured capacity",
        )));
    }
    let mut references = BTreeSet::new();
    for id in &state.account_ids {
        let reference = StateRef::from_id(ACCOUNT, id)
            .map_err(|_| Status::data_loss("invalid original Bank account ID"))?;
        references.insert(reference.to_string());
    }
    Ok(references
        .into_iter()
        .map(|state_ref| ParticipantTarget {
            state_type: ACCOUNT.into(),
            state_ref,
        })
        .collect())
}

fn validate_limit(max_owners: usize) -> Result<(), Box<Status>> {
    if max_owners == 0 || max_owners > MAX_OWNERS {
        return Err(Box::new(Status::invalid_argument(
            "membership capacity must be in 1..=1024",
        )));
    }
    Ok(())
}

/// Load the committed original Bank index under its ORIGINAL store-owned gate.
/// A missing Bank is a legitimate fresh empty index. Every indexed Account must
/// exist when checked; return no partial index if any member is missing/corrupt.
/// These separate Loads are NOT a cross-actor atomic snapshot. Local cancellation
/// releases the leases but does not attest remote read quiescence. The caller
/// must retain placement, convergence and ownership authority independently.
/// The configured Bank logical ID is trusted composition, not inbound metadata.
/// This function grants no registration, dispatcher, Wait or Ready capability.
pub async fn load_committed_account_targets(
    store: &DatabaseActorStore,
    bank_id: &str,
    max_owners: usize,
) -> Result<Vec<ParticipantTarget>, Box<Status>> {
    validate_limit(max_owners)?;
    let bank_ref = StateRef::from_id(BANK, bank_id)
        .map_err(|_| Status::invalid_argument("invalid configured Bank ID"))?
        .to_string();
    let bank_gate = store.actor_gate(BANK, &bank_ref);
    let _bank_lease = bank_gate.shared().await;
    let Some(bank) = store
        .load_for_declaration::<crate::bank_generated::BankDurableState>(&bank_ref)
        .await?
    else {
        return Ok(vec![]);
    };
    let targets = account_targets(&bank, max_owners)?;
    for target in &targets {
        let gate = store.actor_gate(ACCOUNT, &target.state_ref);
        let _lease = gate.shared().await;
        if store
            .load_for_declaration::<crate::account_generated::AccountDurableState>(
                &target.state_ref,
            )
            .await?
            .is_none()
        {
            return Err(Box::new(Status::failed_precondition(
                "committed Bank index references an absent Account",
            )));
        }
    }
    Ok(targets)
}

#[cfg(test)]
mod tests {
    use super::*;
    use prost::Message;
    use reboot::database_proto as db;

    #[test]
    fn original_ids_are_exact_deduplicated_and_bounded_before_deduplication() {
        let bank = b::Bank {
            account_ids: vec!["alice".into(), "bob".into(), "alice".into()],
        };
        let targets = account_targets(&bank, 3).unwrap();
        assert_eq!(targets.len(), 2);
        for id in ["alice", "bob"] {
            assert!(targets.contains(&ParticipantTarget {
                state_type: ACCOUNT.into(),
                state_ref: StateRef::from_id(ACCOUNT, id).unwrap().to_string()
            }));
        }
        assert_eq!(
            account_targets(&bank, 2).unwrap_err().code(),
            tonic::Code::ResourceExhausted
        );
    }

    #[test]
    fn escaped_original_ids_preserve_identity_without_colocation() {
        let ids = ["a/b", "a:b", "a/b:c", "ab"];
        let bank = b::Bank {
            account_ids: ids.iter().map(|id| (*id).into()).collect(),
        };
        let targets = account_targets(&bank, 4).unwrap();
        assert_eq!(targets.len(), 4);
        for id in ids {
            let expected = StateRef::from_id(ACCOUNT, id).unwrap();
            let target = targets
                .iter()
                .find(|target| target.state_ref == expected.as_str())
                .unwrap();
            let parsed = StateRef::from_maybe_readable(target.state_ref.clone()).unwrap();
            assert_eq!(parsed.id(), id);
            assert_eq!(parsed.components().len(), 1);
            assert!(parsed.matches_state_type(ACCOUNT));
        }
    }

    #[test]
    fn malformed_ids_and_invalid_capacity_never_become_membership() {
        for id in ["", "bad\nline", "bad\\slash", "non-ascii-é"] {
            assert!(
                account_targets(
                    &b::Bank {
                        account_ids: vec![id.into()]
                    },
                    4
                )
                .is_err()
            );
        }
        for cap in [0, 1025] {
            assert_eq!(
                account_targets(&b::Bank::default(), cap)
                    .unwrap_err()
                    .code(),
                tonic::Code::InvalidArgument
            );
        }
    }

    async fn put(
        client: &mut db::database_client::DatabaseClient<tonic::transport::Channel>,
        actors: Vec<db::Actor>,
    ) {
        for actor in actors {
            let mutation = db::IdempotentMutation {
                state_type: actor.state_type.clone(),
                state_ref: actor.state_ref.clone(),
                key: uuid::Uuid::new_v4().as_bytes().to_vec(),
                ..Default::default()
            };
            client
                .store(db::StoreRequest {
                    actor_upserts: vec![actor],
                    idempotent_mutation: Some(mutation),
                    sync: true,
                    ..Default::default()
                })
                .await
                .unwrap();
        }
    }
    fn actor(state_type: &str, id: &str, state: Vec<u8>) -> db::Actor {
        db::Actor {
            state_type: state_type.into(),
            state_ref: StateRef::from_id(state_type, id).unwrap().to_string(),
            state: Some(state),
        }
    }

    #[tokio::test]
    async fn committed_members_without_pending_tasks_are_loaded_from_original_bank() {
        // Explicit storage-model control, NOT native/public SignUp acceptance.
        let (endpoint, database, server) = reboot::runtime::test_support::start_database().await;
        let mut client = db::database_client::DatabaseClient::connect(endpoint.clone())
            .await
            .unwrap();
        put(
            &mut client,
            vec![
                actor(
                    BANK,
                    "configured",
                    b::Bank {
                        account_ids: vec!["completed-only".into(), "no-task".into()],
                    }
                    .encode_to_vec(),
                ),
                actor(
                    ACCOUNT,
                    "completed-only",
                    b::Account::default().encode_to_vec(),
                ),
                actor(ACCOUNT, "no-task", b::Account::default().encode_to_vec()),
                actor(
                    ACCOUNT,
                    "standalone-not-indexed",
                    b::Account::default().encode_to_vec(),
                ),
            ],
        )
        .await;
        let store = DatabaseActorStore::connect_lazy(&endpoint).unwrap();
        let before = database.store_requests().len();
        let members = load_committed_account_targets(&store, "configured", 8)
            .await
            .unwrap();
        assert_eq!(members.len(), 2);
        assert_eq!(
            database.store_requests().len(),
            before,
            "discovery must not write membership"
        );
        assert!(!members.iter().any(|x| {
            x.state_ref
                == StateRef::from_id(ACCOUNT, "standalone-not-indexed")
                    .unwrap()
                    .to_string()
        }));
        server.abort();
        let _ = server.await;
    }

    #[tokio::test]
    async fn absent_bank_is_fresh_empty_but_missing_indexed_account_fails_closed() {
        let (endpoint, _database, server) = reboot::runtime::test_support::start_database().await;
        let store = DatabaseActorStore::connect_lazy(&endpoint).unwrap();
        assert!(
            load_committed_account_targets(&store, "fresh", 8)
                .await
                .unwrap()
                .is_empty()
        );
        let mut client = db::database_client::DatabaseClient::connect(endpoint)
            .await
            .unwrap();
        put(
            &mut client,
            vec![actor(
                BANK,
                "configured",
                b::Bank {
                    account_ids: vec!["missing".into()],
                }
                .encode_to_vec(),
            )],
        )
        .await;
        assert_eq!(
            load_committed_account_targets(&store, "configured", 8)
                .await
                .unwrap_err()
                .code(),
            tonic::Code::FailedPrecondition
        );
        server.abort();
        let _ = server.await;
    }
}
