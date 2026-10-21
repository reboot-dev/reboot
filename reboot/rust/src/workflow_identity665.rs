//! Canonical positive task-identity reads for pre-adoption recovery.
//! This is not checkpoint provenance, a same-Recover-EOF snapshot, or permission
//! to dispatch/adopt. In particular Load omits unknown state types as well as
//! absent keys: omission MUST NOT be interpreted as authoritative absence.
use super::*;
use std::collections::{BTreeMap, BTreeSet};

const MAX_IDENTITIES: usize = 1024;
type Identity = (String, String, Vec<u8>);

fn identity(id: &database::TaskId) -> Identity {
    (
        id.state_type.clone(),
        id.state_ref.clone(),
        id.task_uuid.clone(),
    )
}

fn request(ids: &[database::TaskId]) -> Result<database::LoadRequest, Status> {
    if ids.is_empty() || ids.len() > MAX_IDENTITIES {
        return Err(Status::invalid_argument(
            "task identity read requires 1..=1024 IDs",
        ));
    }
    let mut seen = BTreeSet::new();
    for id in ids {
        if id.state_type.is_empty()
            || id.state_ref.is_empty()
            || Uuid::from_slice(&id.task_uuid).is_err()
        {
            return Err(Status::invalid_argument("malformed task read identity"));
        }
        if !seen.insert(identity(id)) {
            return Err(Status::invalid_argument("duplicate task read identity"));
        }
    }
    Ok(database::LoadRequest {
        actors: vec![],
        task_ids: ids.to_vec(),
    })
}

fn resolve(
    ids: &[database::TaskId],
    response: database::LoadResponse,
) -> Result<Vec<database::Task>, Status> {
    // Defense in depth: this decoder is also the unit-test seam.
    request(ids)?;
    if !response.actors.is_empty() || response.tasks.len() > ids.len() {
        return Err(Status::data_loss("unexpected task identity read records"));
    }
    let wanted: BTreeSet<_> = ids.iter().map(identity).collect();
    let mut found = BTreeMap::new();
    for task in response.tasks {
        let id = task
            .task_id
            .as_ref()
            .ok_or_else(|| Status::data_loss("loaded task lacks identity"))?;
        let key = identity(id);
        if !wanted.contains(&key) || found.contains_key(&key) {
            return Err(Status::data_loss(
                "unrequested or duplicate loaded task identity",
            ));
        }
        if task.method.is_empty() {
            return Err(Status::data_loss("loaded task lacks method"));
        }
        match database::task::Status::try_from(task.status) {
            Ok(database::task::Status::Pending) if task.response_or_error.is_none() => {}
            Ok(database::task::Status::Completed) if task.response_or_error.is_some() => {}
            _ => {
                return Err(Status::data_loss(
                    "invalid loaded task status/terminal shape",
                ));
            }
        }
        found.insert(key, task);
    }
    // Load probes BOTH pending and completed keys. Any omission is uncertainty,
    // not a certificate that a provisional ID is fresh or safe to overwrite.
    ids.iter()
        .map(|id| {
            found.remove(&identity(id)).ok_or_else(|| {
                Status::failed_precondition("task identity not returned; absence is not proven")
            })
        })
        .collect()
}

impl DatabaseActorStore {
    /// Read existing durable tasks, including COMPLETED identities omitted by
    /// Recover.pending_tasks. Results preserve requested order and original
    /// method/request/iteration/terminal bytes, without deriving workflow aliases.
    ///
    /// Every requested identity must be returned exactly once. Missing identities
    /// fail closed, since canonical Load also skips unknown state types. This
    /// performs one read-only Database.Load, not a replay or an absence check.
    /// The caller must retain original actor/recovery custody across this await,
    /// revalidate it afterwards, and apply generated method/terminal validation.
    /// A successful read alone authorizes no provisional mutation or activation.
    pub async fn load_existing_workflow_tasks(
        &self,
        ids: &[database::TaskId],
    ) -> Result<Vec<database::Task>, Status> {
        let request = request(ids)?;
        let response = self.database.clone().load(request).await?.into_inner();
        resolve(ids, response)
    }
}

#[cfg(test)]
#[path = "workflow_identity665_tests.rs"]
mod tests;
