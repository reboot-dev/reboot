//! Original pinned schemas/semantics; Bank refusal is not full Bank acceptance.
pub mod rbt {
    pub mod v1alpha1 {
        tonic::include_proto!("rbt.v1alpha1");
    }
}
pub mod bank {
    pub mod v1 {
        tonic::include_proto!("bank.v1");
    }
}
pub mod account_generated {
    include!(concat!(env!("OUT_DIR"), "/bank/v1/account.reboot.rs"));
}
pub mod bank_generated {
    include!(concat!(env!("OUT_DIR"), "/bank/v1/bank.reboot.rs"));
    pub fn decode_transfer_error(status: tonic::Status) -> BankMethodsTransferError {
        BankMethodsTransferError::from_status(status)
    }
}
#[cfg(test)]
mod original_bank_negative;
pub mod registered_ticket_probe;
pub mod semantics;
