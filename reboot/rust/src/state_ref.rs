//! Python-compatible canonical Reboot state-reference encoding.
//!
//! This is an SDK identity codec only. It does not grant ownership, validate
//! placement, or replace the distinct Native2pc actor identity.

use base64::Engine as _;
use sha1::{Digest as _, Sha1};
use std::fmt;

/// Fixed URL-safe, unpadded type-tag length used by Python routing.
pub const STATE_TYPE_TAG_LENGTH: usize = 14;
const MAX_ACTOR_ID_LENGTH: usize = 128;

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum StateRefError {
    EmptyReference,
    InvalidComponent {
        component: String,
        reference: String,
    },
    InvalidId(&'static str),
}

impl fmt::Display for StateRefError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::EmptyReference => f.write_str("cannot create an empty state reference"),
            Self::InvalidComponent {
                component,
                reference,
            } => {
                write!(
                    f,
                    "invalid state reference component `{component}` in `{reference}`"
                )
            }
            Self::InvalidId(reason) => write!(f, "invalid state id: {reason}"),
        }
    }
}

impl std::error::Error for StateRefError {}

/// A canonical Reboot state reference suitable for `x-reboot-state-ref`.
#[derive(Clone, Debug, Eq, Hash, PartialEq)]
pub struct StateRef {
    encoded: String,
    readable: Option<String>,
}

impl StateRef {
    pub fn from_id(state_type: &str, state_id: &str) -> Result<Self, StateRefError> {
        validate_id(state_id, false)?;
        Ok(Self::component(state_type, state_id))
    }

    /// Constructs a range prefix; unlike [`Self::from_id`], an empty id is valid.
    pub fn from_id_prefix(state_type: &str, state_id: &str) -> Result<Self, StateRefError> {
        validate_id(state_id, true)?;
        Ok(Self::component(state_type, state_id))
    }

    /// Parses an encoded reference or normalizes readable `state.type:id` parts.
    pub fn from_maybe_readable(candidate: impl Into<String>) -> Result<Self, StateRefError> {
        let candidate = candidate.into();
        if Self::is_encoded(&candidate) {
            return Ok(Self {
                encoded: candidate,
                readable: None,
            });
        }
        if candidate.is_empty() {
            return Err(StateRefError::EmptyReference);
        }
        let mut parts = Vec::new();
        let mut has_readable_part = false;
        for component in candidate.split('/') {
            let Some((state_type, state_id)) = component.split_once(':') else {
                return Err(StateRefError::InvalidComponent {
                    component: component.into(),
                    reference: candidate,
                });
            };
            if state_type.is_empty() {
                return Err(StateRefError::InvalidComponent {
                    component: component.into(),
                    reference: candidate,
                });
            }
            let tag = state_type_tag_for_name(state_type);
            has_readable_part |= tag != state_type;
            parts.push(format!("{tag}:{state_id}"));
        }
        Ok(Self {
            encoded: parts.join("/"),
            readable: has_readable_part.then_some(candidate),
        })
    }

    /// Python's routing-shape check: validate only the final component's tag.
    pub fn is_encoded(candidate: &str) -> bool {
        let part = candidate.rsplit('/').next().unwrap_or_default();
        if part.len() < STATE_TYPE_TAG_LENGTH + 1
            || part.as_bytes().get(STATE_TYPE_TAG_LENGTH) != Some(&b':')
        {
            return false;
        }
        base64::engine::general_purpose::URL_SAFE_NO_PAD
            .decode(&part[..STATE_TYPE_TAG_LENGTH])
            .ok()
            .is_some_and(|tag| tag.first() == Some(&0))
    }

    pub fn as_str(&self) -> &str {
        &self.encoded
    }
    pub fn friendly_str(&self) -> &str {
        self.readable.as_deref().unwrap_or(&self.encoded)
    }

    pub fn components(&self) -> Vec<Self> {
        self.encoded
            .split('/')
            .map(|encoded| Self {
                encoded: encoded.into(),
                readable: None,
            })
            .collect()
    }

    pub fn state_type_tag(&self) -> &str {
        self.encoded
            .rsplit('/')
            .next()
            .unwrap_or_default()
            .get(..STATE_TYPE_TAG_LENGTH)
            .unwrap_or_default()
    }

    pub fn matches_state_type(&self, state_type: &str) -> bool {
        self.state_type_tag() == state_type_tag_for_name(state_type)
    }

    /// Returns the decoded final id; wire backslashes represent literal slashes.
    pub fn id(&self) -> String {
        self.encoded
            .rsplit('/')
            .next()
            .unwrap_or_default()
            .get(STATE_TYPE_TAG_LENGTH + 1..)
            .unwrap_or_default()
            .replace('\\', "/")
    }

    pub fn colocate(&self, state_type: &str, state_id: &str) -> Result<Self, StateRefError> {
        let child = Self::from_id(state_type, state_id)?;
        Ok(Self {
            encoded: format!("{}/{child}", self.encoded),
            readable: None,
        })
    }

    fn component(state_type: &str, state_id: &str) -> Self {
        Self {
            encoded: format!(
                "{}:{}",
                state_type_tag_for_name(state_type),
                state_id.replace('/', "\\")
            ),
            readable: None,
        }
    }
}

impl fmt::Display for StateRef {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.encoded)
    }
}

/// SHA-1(name), first ten bytes, first byte zeroed, URL-safe base64 without padding.
pub fn state_type_tag_for_name(state_type: &str) -> String {
    let mut hash = Sha1::digest(state_type.as_bytes())[..10].to_vec();
    hash[0] = 0;
    base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(hash)
}

fn validate_id(state_id: &str, permit_empty: bool) -> Result<(), StateRefError> {
    if state_id.is_empty() && !permit_empty {
        return Err(StateRefError::InvalidId("must not be empty"));
    }
    if state_id.len() > MAX_ACTOR_ID_LENGTH {
        return Err(StateRefError::InvalidId("is longer than 128 characters"));
    }
    if !state_id.is_ascii() {
        return Err(StateRefError::InvalidId("must be ASCII"));
    }
    if state_id.contains(['\0', '\n', '\\']) {
        return Err(StateRefError::InvalidId("contains a reserved character"));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tags_match_python_examples() {
        assert_eq!(
            state_type_tag_for_name("com.example.Parent"),
            "AEyp_5wmAiADZg"
        );
        assert_eq!(
            state_type_tag_for_name("com.example.Child"),
            "AAcExYZDHb-mAw"
        );
    }

    #[test]
    fn references_normalize_escape_and_colocate() {
        let parent = StateRef::from_id("com.example.Parent", "parent/one").unwrap();
        assert_eq!(parent.to_string(), "AEyp_5wmAiADZg:parent\\one");
        assert_eq!(parent.id(), "parent/one");
        let child = parent.colocate("com.example.Child", "child:two").unwrap();
        assert_eq!(
            child.to_string(),
            "AEyp_5wmAiADZg:parent\\one/AAcExYZDHb-mAw:child:two"
        );
        assert_eq!(child.components().len(), 2);
        assert!(child.matches_state_type("com.example.Child"));
    }

    #[test]
    fn readable_and_encoded_forms_match_python_routing_contract() {
        let readable = "com.example.Parent:parent/com.example.Child:child:with:colons";
        let reference = StateRef::from_maybe_readable(readable).unwrap();
        assert_eq!(
            reference.as_str(),
            "AEyp_5wmAiADZg:parent/AAcExYZDHb-mAw:child:with:colons"
        );
        assert_eq!(reference.friendly_str(), readable);
        assert!(StateRef::is_encoded(reference.as_str()));
        assert!(matches!(
            StateRef::from_maybe_readable(":id"),
            Err(StateRefError::InvalidComponent { .. })
        ));
        assert!(StateRef::from_id_prefix("example.Actor", "").is_ok());
        assert!(StateRef::from_id("example.Actor", "bad\\id").is_err());
    }
}
