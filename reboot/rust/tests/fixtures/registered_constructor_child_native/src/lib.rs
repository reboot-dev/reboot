//! SOURCE-only taskless constructor-child prerequisite, not original SignUp/WelcomeEmail acceptance.
pub mod rbt {
    // Tonic-generated wire clients keep their upstream Status error contract.
    #[allow(
        clippy::result_large_err,
        reason = "Generated client Status and declared-error return types preserve the existing public API"
    )]
    pub mod v1alpha1 {
        tonic::include_proto!("rbt.v1alpha1");
    }
}
pub mod bank {
    // Tonic-generated wire clients keep their upstream Status error contract.
    #[allow(
        clippy::result_large_err,
        reason = "Generated client Status and declared-error return types preserve the existing public API"
    )]
    pub mod v1 {
        tonic::include_proto!("bank.v1");
    }
}
// Reboot-generated clients/waits retain source-compatible Status/declared errors.
#[allow(
    clippy::result_large_err,
    reason = "Generated client Status and declared-error return types preserve the existing public API"
)]
pub mod account_generated {
    include!(concat!(env!("OUT_DIR"), "/bank/v1/account.reboot.rs"));
}
#[allow(
    clippy::result_large_err,
    reason = "Generated client Status and declared-error return types preserve the existing public API"
)]
pub mod bank_generated {
    include!(concat!(env!("OUT_DIR"), "/bank/v1/bank.reboot.rs"));
    pub fn decode_transfer_error(status: tonic::Status) -> BankMethodsTransferError {
        BankMethodsTransferError::from_status(status)
    }
}
#[cfg(test)]
mod native;
