fn main() -> Result<(), Box<dyn std::error::Error>> {
    let protoc = protoc_bin_vendored::protoc_bin_path()?;
    // Cargo build scripts are single-threaded here; set only for tonic-build's
    // child protoc invocation.
    unsafe { std::env::set_var("PROTOC", protoc) };

    let repository = std::path::PathBuf::from("../..");
    let vendored_include = protoc_bin_vendored::include_path()?;
    let output = std::path::PathBuf::from(std::env::var("OUT_DIR")?);
    let descriptor = output.join("rbt_v1alpha1_descriptor.bin");
    let placement_output = output.join("placement_proto");
    std::fs::create_dir_all(&placement_output)?;
    tonic_build::configure()
        .build_server(true)
        .btree_map(["."])
        .file_descriptor_set_path(descriptor)
        .compile_protos(
            &[
                repository.join("tests/reboot/protoc/explicit_state_annotations_full.proto"),
                repository.join("tests/reboot/protoc/counter.proto"),
                repository.join("tests/reboot/protoc/map_counter.proto"),
                repository.join("tests/reboot/protoc/shared.proto"),
                repository.join("rbt/v1alpha1/database.proto"),
                repository.join("rbt/v1alpha1/transactions.proto"),
                repository.join("rbt/v1alpha1/native_2pc.proto"),
            ],
            &[repository.clone(), vendored_include.clone()],
        )?;
    tonic_build::configure()
        .build_client(true)
        .build_server(true)
        .out_dir(placement_output)
        .compile_protos(
            &[repository.join("rbt/v1alpha1/placement_planner.proto")],
            &[repository, vendored_include],
        )?;
    Ok(())
}
