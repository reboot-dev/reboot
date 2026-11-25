fn main() {
    let here = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
    let api = here.join("../api");
    let repository = here.ancestors().nth(6).unwrap();
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
    let api = here.join("../api");
    reboot::build::compile_protos_with_runtime(
        &[api.join("hello_tasks/v1/hello.proto")],
        &[api, repository.to_owned()],
        "crate::hello_tasks::v1",
        "reboot",
    )
    .unwrap();
}
