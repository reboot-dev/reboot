fn main() -> Result<(), Box<dyn std::error::Error>> {
    let protoc = protoc_bin_vendored::protoc_bin_path()?;
    // Cargo build scripts are single-threaded here; set only for tonic-build's
    // child protoc invocation.
    unsafe { std::env::set_var("PROTOC", protoc) };

    let repository = std::path::PathBuf::from("../..");
    let vendored_include = protoc_bin_vendored::include_path()?;
    tonic_build::configure()
        .build_server(false)
        .compile_protos(
            &[
                repository.join("tests/reboot/protoc/explicit_state_annotations_full.proto"),
                repository.join("tests/reboot/protoc/shared.proto"),
            ],
            &[repository, vendored_include],
        )?;
    Ok(())
}
