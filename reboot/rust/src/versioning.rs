//! Experimental checkout-only generated adapter compatibility.
//!
//! Keep the runtime, generator, CLI and canonical Database on the verified
//! source snapshot. This contract covers generated Rust API compatibility only:
//! it does not certify native wire compatibility, state migration or packaging.

/// Increment when an incompatible generated/runtime API change requires users
/// to regenerate adapters. Package version `0.0.0` is not a snapshot identity.
pub const GENERATED_CODE_CONTRACT: u32 = 1;

/// Reject adapters generated for another declared Rust API contract.
///
/// Newly generated adapters call this in an anonymous constant, so mismatch is
/// a compile error. Older unstamped adapters must be regenerated explicitly.
pub const fn check_generated_code_compatible(generated: u32) {
    assert!(
        generated == GENERATED_CODE_CONTRACT,
        "Reboot Rust generated-code contract mismatch: regenerate adapters with the runtime checkout"
    );
}
