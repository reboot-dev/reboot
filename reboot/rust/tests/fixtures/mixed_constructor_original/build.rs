// SOURCE TARGET ONLY: never executed in this isolated handoff.
fn main() {
    let here = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
    let api = here.join("pinned/api");
    let proto_root = here.join("../../../../..");
    println!("cargo:rerun-if-changed=pinned/api");
    reboot::build::compile_protos_with_runtime(
        &[
            api.join("bank/v1/account.proto"),
            api.join("bank/v1/bank.proto"),
            api.join("bank/v1/errors.proto"),
        ],
        &[api, proto_root],
        "crate::bank::v1",
        "reboot",
    )
    .expect("actual pinned original descriptors must emit");
    let out = std::path::PathBuf::from(std::env::var_os("OUT_DIR").unwrap());
    let emitted = std::fs::read_to_string(out.join("bank/v1/account.reboot.rs")).unwrap();
    assert!(emitted.contains("pub trait AccountMethodsDatabaseHandler"));
    assert!(emitted.contains("async fn open_with_tasks"));
    assert!(emitted.contains("self.store.scheduling_constructor_async_for_method_authorized"));
    assert!(emitted.contains("handler.open_with_tasks(state, request, state_ref)"));
    assert!(emitted.contains("type.googleapis.com/bank.v1.OpenResponse"));
    assert!(emitted.contains(".constructor_scheduling()"));
    assert!(emitted.contains("AccountMethodsWithdrawError"));
    assert!(!emitted.contains("async fn open_transaction_result"));
    assert!(!emitted.contains("pub fn open(state_ref:"));
    // No error-based promotion: Withdraw retains its ordinary mutable-state signature.
    assert!(emitted.contains("async fn withdraw(&self, state: &mut proto::Account, request: proto::WithdrawRequest) -> Result<proto::WithdrawResponse, AccountMethodsWithdrawError>"));
    let ordinary_handler = emitted
        .split("pub trait AccountMethodsDatabaseHandler")
        .nth(1)
        .unwrap()
        .split("\n}\n")
        .next()
        .unwrap();
    let inbound_handler = emitted
        .split("pub trait AccountMethodsTransactionHandler")
        .nth(1)
        .unwrap()
        .split("\n}\n")
        .next()
        .unwrap();
    assert!(!ordinary_handler.contains("async fn withdraw(&self, context:"));
    assert!(!inbound_handler.contains("async fn withdraw(&self, context:"));
    assert!(!emitted.contains("async fn withdraw_typed_transaction_result"));
    // An additional inbound-writer adapter is emitted even for writer-only services.
    // Its presence is not evidence that the pinned Withdraw is a transaction RPC.
    assert!(emitted.contains("pub trait AccountMethodsTransactionHandler"));
    assert!(emitted.contains("async fn withdraw_transaction_result"));
    // Genuine mixed prerequisite is covered only by separately labelled synthetic tests.
}
