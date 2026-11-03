//! Crate-sealed registration policy and settled ownership receipt.
//! Neither wire metadata nor a caller-supplied participant list constructs these.
use crate::{
    durable_coordinator::{ReturnedParticipant, RootCoordinatorStart},
    explicit_abort::ExplicitAbortOwner,
    runtime::TransactionContext,
};
use tonic::Status;
use uuid::Uuid;

pub(crate) struct SharedWriterRootPolicy {
    root: Uuid,
    owner: ExplicitAbortOwner,
}
impl std::fmt::Debug for SharedWriterRootPolicy {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("SharedWriterRootPolicy")
            .field("root", &self.root)
            .finish_non_exhaustive()
    }
}
impl SharedWriterRootPolicy {
    pub(crate) fn registered(root: Uuid, owner: ExplicitAbortOwner) -> Self {
        Self { root, owner }
    }
    pub(crate) fn validate(&self, root: Uuid) -> Result<(), Status> {
        if self.root != root {
            return Err(Status::failed_precondition(
                "shared writer root policy identity differs",
            ));
        }
        self.owner.validate_builtin_root(root)
    }
}

/// Minted only by the consuming registered guard after exact local incarnation
/// validation, host/policy validation and an atomic certain/quiescent ledger seal.
/// The actual local capability is passed alongside this receipt, never replaced
/// by its copied UUID. Private fields prevent downstream construction.
pub(crate) struct SettledSharedWriterRoot {
    pub(super) start: RootCoordinatorStart,
    pub(super) context: TransactionContext,
    pub(super) returned: Vec<ReturnedParticipant>,
}
impl SettledSharedWriterRoot {
    pub(crate) fn from_guard(
        start: RootCoordinatorStart,
        context: TransactionContext,
    ) -> Result<Self, Status> {
        if !context.shared_existing_writer_root() || !context.tree_owned() {
            return Err(Status::failed_precondition(
                "registered shared writer execution missing",
            ));
        }
        let returned = context.seal_explicit_abort()?;
        Ok(Self {
            start,
            context,
            returned,
        })
    }
}
