fn main() {
    let here = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
    let repository = here.ancestors().nth(5).unwrap();
    let api = here.parent().unwrap().join("reboot_examples/api");
    reboot::build::compile_protos_with_runtime(
        &[here.join("shared/probe/shared_root.proto")],
        &[here.to_owned(), repository.to_owned()],
        "crate::probe",
        "reboot",
    )
    .unwrap();
    reboot::build::compile_protos_with_runtime(
        &[
            api.join("bank/v1/account.proto"),
            api.join("bank/v1/errors.proto"),
        ],
        &[api, repository.to_owned()],
        "crate::bank::v1",
        "reboot",
    )
    .unwrap();
}
