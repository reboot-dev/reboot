//! Supported synthetic SharedRoot companion, NOT original Bank acceptance.
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
pub mod probe {
    tonic::include_proto!("shared.probe");
}
pub mod account_generated {
    include!(concat!(env!("OUT_DIR"), "/bank/v1/account.reboot.rs"));
}
pub mod root_generated {
    include!(concat!(
        env!("OUT_DIR"),
        "/shared/probe/shared_root.reboot.rs"
    ));
    pub fn decode_transfer_error(status: tonic::Status) -> SharedRootMethodsTransferError {
        SharedRootMethodsTransferError::from_status(status)
    }
}
#[cfg(test)]
mod native;
#[path = "../../src/semantics.rs"]
pub mod semantics;

#[path = "../../src/registered_ticket_probe.rs"]
pub mod registered_ticket_probe;
#[cfg(test)]
mod ticket_negative;
