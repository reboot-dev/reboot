//! Untyped actor reference used as the Rust SDK building block for
//! cross-actor composition.
//!
//! Python exposes a generated `WeakReference` per actor type with typed
//! `read`, `write`, `schedule`, `spawn`, and `reactively` methods. Rust does
//! not yet have generated typed actor references for workflows, but the
//! identity of the target actor (state type + state reference) is already
//! language-agnostic. This module exposes that identity as a public type so
//! future generated code and runtime helpers can build typed wrappers on top
//! of it without inventing a second identity encoding.

use crate::state_ref::StateRef;

/// An untyped reference to a Reboot actor.
///
/// This is the Rust equivalent of the identity portion of Python's generated
/// `WeakReference`: it carries the `state_type` and encoded `state_ref`
/// required to route calls to a specific actor. Method-specific typed
/// wrappers can be generated as thin structs holding an `ActorRef`.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ActorRef {
    state_ref: StateRef,
    state_type: String,
}

impl ActorRef {
    /// Creates an actor reference from its state type and encoded state ref.
    pub fn new(state_type: impl Into<String>, state_ref: StateRef) -> Self {
        Self {
            state_ref,
            state_type: state_type.into(),
        }
    }

    /// The encoded state reference identifying the actor instance.
    pub fn state_ref(&self) -> &StateRef {
        &self.state_ref
    }

    /// The declared state type of the referenced actor.
    pub fn state_type(&self) -> &str {
        &self.state_type
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn actor_ref_round_trips_state_ref_and_type() {
        let state_ref = StateRef::from_id("tests.Service", "actor-123").unwrap();
        let actor_ref = ActorRef::new("tests.Service", state_ref.clone());
        assert_eq!(actor_ref.state_ref(), &state_ref);
        assert_eq!(actor_ref.state_type(), "tests.Service");
    }
}
