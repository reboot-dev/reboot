fn main() {
    let here = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
    let api = here.join("../../api");
    let repository = here.join("../../../../../../..");
    reboot::build::compile_protos_with_runtime(
        &[api.join("hello_constructors/v1/hello.proto")],
        &[api, repository],
        "crate::proto",
        "reboot",
    )
    .unwrap();
}
