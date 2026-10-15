fn main() {
    let here = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
    let api = here.parent().unwrap().join("pinned/api");
    let proto_root = here.join("../../../../../..");
    println!("cargo:rerun-if-changed=../pinned/api");
    println!("cargo:rerun-if-changed=shared");
    println!("cargo:rerun-if-changed=../../../../../../rbt/v1alpha1");
    reboot::build::compile_protos_with_runtime(
        &[
            api.join("bank/v1/account.proto"),
            api.join("bank/v1/errors.proto"),
        ],
        &[api, proto_root.clone()],
        "crate::bank::v1",
        "reboot",
    )
    .unwrap();
    reboot::build::compile_protos_with_runtime(
        &[here.join("shared/probe/shared_root.proto")],
        &[here.to_path_buf(), proto_root],
        "crate::probe",
        "reboot",
    )
    .unwrap();
}
