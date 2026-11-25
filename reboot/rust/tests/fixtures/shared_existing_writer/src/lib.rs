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
}
#[cfg(test)]
#[path = "../../shared_existing_writer_acceptance.rs"]
mod acceptance;
