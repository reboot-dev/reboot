fn main() {
    let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .ancestors()
        .nth(5)
        .unwrap();
    reboot::build::compile_protos_with_runtime(
        &[std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("reactive/v1/counter.proto")],
        &[std::path::Path::new(env!("CARGO_MANIFEST_DIR")), root],
        "crate::proto",
        "reboot",
    )
    .unwrap();
}
