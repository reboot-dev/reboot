fn main() {
    let repository = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .ancestors()
        .nth(5)
        .unwrap();
    reboot::build::compile_protos_with_runtime(
        &[repository.join("tests/reboot/protoc/transaction_counter.proto")],
        &[repository],
        "crate::proto",
        "reboot",
    )
    .unwrap();
}
