//! Cargo build-script support for concrete Reboot Tonic adapters.
//!
//! Enable the crate's `build` feature in a downstream package's
//! `[build-dependencies]`, then call [`compile_protos`] or
//! [`compile_protos_with_runtime`] from `build.rs`.

use crate::codegen;
use std::env;
use std::fmt;
use std::path::{Component, Path, PathBuf};

/// Failure while compiling protobuf bindings or emitting Reboot adapters.
#[derive(Debug)]
pub struct BuildError(String);

impl fmt::Display for BuildError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(&self.0)
    }
}

impl std::error::Error for BuildError {}

impl BuildError {
    fn new(message: impl Into<String>) -> Self {
        Self(message.into())
    }
}

/// Compiles protobuf bindings and emits matching `*.reboot.rs` adapters.
///
/// Generated protobuf bindings are written by `tonic-build` to `OUT_DIR`; the
/// adapter files retain their proto-relative name below that directory. The
/// supplied module must name the bindings module a consumer will include.
pub fn compile_protos<P, I>(
    protos: &[P],
    includes: &[I],
    proto_module: &str,
) -> Result<(), BuildError>
where
    P: AsRef<Path>,
    I: AsRef<Path>,
{
    compile_protos_with_runtime(protos, includes, proto_module, "reboot_rust_schema")
}

/// Compiles protobuf bindings and emits matching `*.reboot.rs` adapters using
/// the supplied Rust path for the Reboot runtime dependency.
///
/// Use this when the downstream Cargo package renames `reboot-rust-schema`.
/// `proto_module` and `runtime_module` must both be valid Rust paths.
pub fn compile_protos_with_runtime<P, I>(
    protos: &[P],
    includes: &[I],
    proto_module: &str,
    runtime_module: &str,
) -> Result<(), BuildError>
where
    P: AsRef<Path>,
    I: AsRef<Path>,
{
    if !codegen::is_module_path(proto_module) {
        return Err(BuildError::new(
            "protoc-gen-reboot_rust requires a valid `module=<Rust path>` parameter",
        ));
    }
    if !codegen::is_module_path(runtime_module) {
        return Err(BuildError::new(
            "protoc-gen-reboot_rust requires a valid `runtime_module=<Rust path>` parameter",
        ));
    }
    if protos.is_empty() {
        return Err(BuildError::new(
            "compile_protos requires at least one proto file",
        ));
    }

    let out_dir =
        PathBuf::from(env::var_os("OUT_DIR").ok_or_else(|| BuildError::new("OUT_DIR is not set"))?);
    let descriptor_set = out_dir.join("reboot-rust-descriptor-set.bin");
    let protoc = protoc_bin_vendored::protoc_bin_path()
        .map_err(|error| BuildError::new(format!("could not locate vendored protoc: {error}")))?;
    let vendored_include = protoc_bin_vendored::include_path().map_err(|error| {
        BuildError::new(format!(
            "could not locate vendored protoc includes: {error}"
        ))
    })?;

    let old_protoc = env::var_os("PROTOC");
    // tonic-build reads PROTOC only while it starts its compiler child process.
    unsafe { env::set_var("PROTOC", protoc) };
    let compile = tonic_build::configure()
        .build_server(true)
        .btree_map(["."])
        .file_descriptor_set_path(&descriptor_set)
        .compile_protos(protos, &includes_with_vendored(includes, &vendored_include));
    match old_protoc {
        Some(value) => unsafe { env::set_var("PROTOC", value) },
        None => unsafe { env::remove_var("PROTOC") },
    }
    compile.map_err(|error| BuildError::new(format!("protoc compilation failed: {error}")))?;

    let descriptor_bytes = std::fs::read(&descriptor_set).map_err(|error| {
        BuildError::new(format!(
            "could not read descriptor set `{}`: {error}",
            descriptor_set.display()
        ))
    })?;
    let files = protos
        .iter()
        .map(|proto| proto_relative_name(proto.as_ref(), includes))
        .collect::<Result<Vec<_>, _>>()?;
    let response = codegen::generate_from_descriptor_set_wire(
        &descriptor_bytes,
        &files,
        proto_module,
        runtime_module,
    );
    if let Some(error) = response.error {
        return Err(BuildError::new(error));
    }
    for file in response.file {
        let name = file
            .name
            .ok_or_else(|| BuildError::new("code generator returned an unnamed file"))?;
        let path = output_path(&out_dir, &name)?;
        let content = file.content.ok_or_else(|| {
            BuildError::new(format!("code generator returned no content for `{name}`"))
        })?;
        std::fs::create_dir_all(path.parent().expect("output path has parent")).map_err(
            |error| {
                BuildError::new(format!(
                    "could not create output directory for `{name}`: {error}"
                ))
            },
        )?;
        std::fs::write(&path, content).map_err(|error| {
            BuildError::new(format!("could not write `{}`: {error}", path.display()))
        })?;
    }
    Ok(())
}

fn includes_with_vendored<I: AsRef<Path>>(includes: &[I], vendored: &Path) -> Vec<PathBuf> {
    includes
        .iter()
        .map(|include| include.as_ref().to_owned())
        // Reboot annotations are part of the build-helper contract, so a Cargo
        // consumer need not have this SDK repository checked out beside its
        // own proto directory just to import rbt/v1alpha1/options.proto.
        .chain(std::iter::once(sdk_repository_root()))
        .chain(std::iter::once(vendored.to_owned()))
        .collect()
}

fn sdk_repository_root() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .ancestors()
        .nth(2)
        .expect("reboot-rust-schema source is nested below the SDK repository root")
        .to_owned()
}

fn proto_relative_name<I: AsRef<Path>>(proto: &Path, includes: &[I]) -> Result<String, BuildError> {
    includes
        .iter()
        .find_map(|include| proto.strip_prefix(include.as_ref()).ok())
        .and_then(|path| path.to_str())
        .map(str::to_owned)
        .ok_or_else(|| {
            BuildError::new(format!(
                "proto `{}` is not below any supplied include path",
                proto.display()
            ))
        })
}

fn output_path(out_dir: &Path, name: &str) -> Result<PathBuf, BuildError> {
    let path = Path::new(name);
    if path.components().any(|component| {
        matches!(
            component,
            Component::ParentDir | Component::RootDir | Component::Prefix(_)
        )
    }) {
        return Err(BuildError::new(format!(
            "code generator returned unsafe output path `{name}`"
        )));
    }
    Ok(out_dir.join(path))
}
