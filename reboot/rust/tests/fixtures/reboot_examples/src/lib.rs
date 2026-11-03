#[path = "hello_tasks.rs"]
pub mod hello_tasks_consumer;

pub mod rbt {
    // Generated Tonic signatures intentionally retain tonic::Status.
    #[allow(clippy::result_large_err)]
    pub mod v1alpha1 {
        tonic::include_proto!("rbt.v1alpha1");
    }
}
pub mod hello_constructors {
    // Generated Tonic signatures intentionally retain tonic::Status.
    #[allow(clippy::result_large_err)]
    pub mod v1 {
        tonic::include_proto!("hello_constructors.v1");
    }
}
pub mod hello_tasks {
    // Generated Tonic signatures intentionally retain tonic::Status.
    #[allow(clippy::result_large_err)]
    pub mod v1 {
        tonic::include_proto!("hello_tasks.v1");
    }
}
pub mod bank {
    // Generated Tonic signatures intentionally retain tonic::Status.
    #[allow(clippy::result_large_err)]
    pub mod v1 {
        tonic::include_proto!("bank.v1");
    }
}
// Generated transport APIs intentionally retain tonic::Status; keep handwritten code linted.
#[allow(clippy::result_large_err)]
pub mod constructors_adapter {
    include!(concat!(
        env!("OUT_DIR"),
        "/hello_constructors/v1/hello.reboot.rs"
    ));
}
// Generated transport APIs intentionally retain tonic::Status; keep handwritten code linted.
#[allow(clippy::result_large_err)]
pub mod tasks_adapter {
    include!(concat!(env!("OUT_DIR"), "/hello_tasks/v1/hello.reboot.rs"));
}
#[allow(clippy::result_large_err)]
pub mod account_adapter {
    include!(concat!(env!("OUT_DIR"), "/bank/v1/account.reboot.rs"));
}
#[cfg(feature = "bank-shared")]
#[allow(clippy::result_large_err)]
pub mod bank_adapter {
    include!(concat!(env!("OUT_DIR"), "/bank/v1/bank.reboot.rs"));
}
