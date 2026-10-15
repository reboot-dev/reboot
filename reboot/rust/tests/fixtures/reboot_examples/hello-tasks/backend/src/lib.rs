pub mod rbt {
    // Generated Tonic signatures intentionally retain tonic::Status.
    #[allow(clippy::result_large_err)]
    pub mod v1alpha1 {
        tonic::include_proto!("rbt.v1alpha1");
    }
}
pub mod hello_tasks {
    // Generated Tonic signatures intentionally retain tonic::Status.
    #[allow(clippy::result_large_err)]
    pub mod v1 {
        tonic::include_proto!("hello_tasks.v1");
    }
}
pub use hello_tasks::v1 as proto;
// Generated transport APIs intentionally retain tonic::Status; keep handwritten code linted.
#[allow(clippy::result_large_err)]
pub mod tasks_adapter {
    include!(concat!(env!("OUT_DIR"), "/hello_tasks/v1/hello.reboot.rs"));
}
pub use tasks_adapter as generated;
// One consumer implementation shared with the native acceptance; no altered schema.
#[path = "../../../src/hello_tasks.rs"]
pub mod consumer;
pub use consumer::HelloTasks;
