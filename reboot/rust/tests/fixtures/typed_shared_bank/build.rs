fn main() {
    let here = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
    let api = here.join("pinned/api");
    let proto_root = here.join("../../../../..");
    println!("cargo:rerun-if-changed=pinned/api");
    println!("cargo:rerun-if-changed=../../../../../rbt/v1alpha1");
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
    .expect("unchanged original Bank and Account must generate, not silently skip Bank");
}
