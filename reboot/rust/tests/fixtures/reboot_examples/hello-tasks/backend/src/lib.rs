pub mod rbt {
    pub mod v1alpha1 {
        tonic::include_proto!("rbt.v1alpha1");
    }
}
pub mod hello_tasks {
    pub mod v1 {
        tonic::include_proto!("hello_tasks.v1");
    }
}
pub use hello_tasks::v1 as proto;
pub mod tasks_adapter {
    include!(concat!(env!("OUT_DIR"), "/hello_tasks/v1/hello.reboot.rs"));
}
pub use tasks_adapter as generated;
// One consumer implementation shared with the native acceptance; no altered schema.
#[path = "../../../src/hello_tasks.rs"]
pub mod consumer;
pub use consumer::HelloTasks;
