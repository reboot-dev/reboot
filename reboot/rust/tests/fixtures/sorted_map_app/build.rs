fn main() {
    let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .ancestors()
        .nth(5)
        .unwrap();
    reboot::build::compile_protos_with_runtime(
        &[std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("coupled/v1/app.proto")],
        &[std::path::Path::new(env!("CARGO_MANIFEST_DIR")), root],
        "crate::proto",
        "reboot",
    )
    .unwrap();
    reboot::build::compile_protos_with_runtime(
        &[root.join("rbt/std/collections/v1/sorted_map.proto")],
        &[root],
        "reboot::sorted_map_proto",
        "reboot",
    )
    .unwrap();
}
