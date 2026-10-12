#[path = "hello_tasks.rs"]
pub mod hello_tasks_consumer;

pub mod rbt {
    pub mod v1alpha1 {
        tonic::include_proto!("rbt.v1alpha1");
    }
}
pub mod hello_constructors {
    pub mod v1 {
        tonic::include_proto!("hello_constructors.v1");
    }
}
pub mod hello_tasks {
    pub mod v1 {
        tonic::include_proto!("hello_tasks.v1");
    }
}
pub mod bank {
    pub mod v1 {
        tonic::include_proto!("bank.v1");
    }
}
pub mod constructors_adapter {
    include!(concat!(
        env!("OUT_DIR"),
        "/hello_constructors/v1/hello.reboot.rs"
    ));
}
pub mod tasks_adapter {
    include!(concat!(env!("OUT_DIR"), "/hello_tasks/v1/hello.reboot.rs"));
}
pub mod account_adapter {
    include!(concat!(env!("OUT_DIR"), "/bank/v1/account.reboot.rs"));
}
#[cfg(feature = "bank-shared")]
pub mod bank_adapter {
    include!(concat!(env!("OUT_DIR"), "/bank/v1/bank.reboot.rs"));
}
