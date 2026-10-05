//! `protoc` plugin support for concrete unary Tonic adapters.
//!
//! The public `generate` entry point retains forwarding-only compatibility.
//! The executable plugin uses `generate_from_wire`, which decodes the real
//! descriptor option extension bytes rather than inferring Reboot semantics.

use heck::{ToSnakeCase, ToUpperCamelCase};
use prost::Message;
use prost_types::compiler::{CodeGeneratorRequest, CodeGeneratorResponse, code_generator_response};
use prost_types::{
    FileDescriptorProto, FileDescriptorSet, MethodDescriptorProto, ServiceDescriptorProto,
};
use std::collections::{BTreeMap, HashMap, HashSet};

const MODULE_PARAMETER_PREFIX: &str = "module=";
const RUNTIME_MODULE_PARAMETER_PREFIX: &str = "runtime_module=";
const DEFAULT_RUNTIME_MODULE: &str = "reboot_rust_schema";
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum DurableKind {
    Reader,
    Writer(WriterMetadata),
    Transaction(TransactionMetadata),
}

/// The declaration carried by a database writer option.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
struct WriterMetadata {
    constructor: bool,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum TransactionMode {
    Exclusive,
    Shared,
}

/// The complete transaction declaration carried by `TransactionMethodOptions`.
///
/// `constructor` is an optional empty message in the wire schema: its presence,
/// rather than a field within it, is the factory declaration.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
struct TransactionMetadata {
    mode: TransactionMode,
    factory: bool,
}

#[derive(Clone, Message)]
struct RawRequest {
    #[prost(message, repeated, tag = "15")]
    files: Vec<RawFile>,
}
#[derive(Clone, Message)]
struct RawDescriptorSet {
    #[prost(message, repeated, tag = "1")]
    files: Vec<RawFile>,
}
#[derive(Clone, Message)]
struct RawFile {
    #[prost(string, optional, tag = "1")]
    name: Option<String>,
    #[prost(string, optional, tag = "2")]
    package: Option<String>,
    #[prost(message, repeated, tag = "4")]
    messages: Vec<RawMessage>,
    #[prost(message, repeated, tag = "6")]
    services: Vec<RawService>,
}
#[derive(Clone, Message)]
struct RawService {
    #[prost(string, optional, tag = "1")]
    name: Option<String>,
    #[prost(message, repeated, tag = "2")]
    methods: Vec<RawMethod>,
    #[prost(bytes = "vec", optional, tag = "3")]
    options: Option<Vec<u8>>,
}
#[derive(Clone, Message)]
struct RawMethod {
    #[prost(string, optional, tag = "1")]
    name: Option<String>,
    #[prost(bytes = "vec", optional, tag = "4")]
    options: Option<Vec<u8>>,
}
/// The top-level portion of `DescriptorProto` needed for Python's Reboot-state
/// checks. Nested messages are deliberately absent: Python's
/// `file.message_types_by_name` only considers top-level state declarations.
#[derive(Clone, Message)]
struct RawMessage {
    #[prost(string, optional, tag = "1")]
    name: Option<String>,
    #[prost(bytes = "vec", optional, tag = "7")]
    options: Option<Vec<u8>>,
}
#[derive(Message)]
struct ExtensionOptions {
    #[prost(bytes = "vec", optional, tag = "50000")]
    reboot: Option<Vec<u8>>,
}
/// The `google.api.http` MethodOptions extension (field 72295728).
///
/// It deliberately has its own decoder so the existing Reboot-option test
/// vectors stay focused on extension 50000. Reboot needs only its presence.
#[derive(Message)]
struct GoogleApiMethodOptions {
    #[prost(bytes = "vec", optional, tag = "72295728")]
    google_api_http: Option<Vec<u8>>,
}
#[derive(Message)]
struct RebootServiceOptions {
    #[prost(string, tag = "1")]
    state: String,
    #[prost(bool, tag = "2")]
    default_constructible: bool,
}
#[derive(Message)]
struct RebootStateOptions {
    #[prost(string, repeated, tag = "1")]
    implements: Vec<String>,
    #[prost(enumeration = "AutoConstruct", tag = "3")]
    auto_construct: i32,
}

/// Wire values of `rbt.v1alpha1.AutoConstruct` needed by the generic
/// generator's required-method check. Unknown nonzero enum values deliberately
/// take the same branch as Python's `!= AUTO_CONSTRUCT_UNSPECIFIED` comparison.
#[derive(Clone, Copy, Debug, prost::Enumeration)]
enum AutoConstruct {
    Unspecified = 0,
    PerUserId = 1,
}

#[derive(Clone, Message)]
struct RebootWriterMethodOptions {
    #[prost(message, optional, tag = "2")]
    constructor: Option<Empty>,
}
#[derive(Clone, Message)]
struct RebootReaderMethodOptions {
    #[prost(enumeration = "ReaderState", tag = "3")]
    state: i32,
}

/// Wire values of `rbt.v1alpha1.ReaderMethodOptions.State` relevant to the
/// bounded unary Rust generator. Unknown values retain Python's default-state
/// behavior and are not treated as streaming.
#[derive(Clone, Copy, Debug, prost::Enumeration)]
enum ReaderState {
    Default = 0,
    Unary = 1,
    Streaming = 2,
}
#[derive(Message)]
struct RebootMethodOptions {
    // `kind` is a protobuf `oneof`. As with transaction `mode`, malformed
    // wire containing several alternatives retains the final field, exactly
    // as Python's generated `MethodOptions` does.
    #[prost(oneof = "reboot_method_options::Kind", tags = "1, 2, 3, 4")]
    kind: Option<reboot_method_options::Kind>,
}

/// The part of `MethodOptions` used only to derive Python's generic `error`
/// feature. Keep it separate from the `kind` oneof mirror so existing focused
/// option vectors do not need to manufacture irrelevant fields.
#[derive(Message)]
struct RebootMethodErrorOptions {
    #[prost(string, repeated, tag = "7")]
    errors: Vec<String>,
}

mod reboot_method_options {
    #[derive(Clone, prost::Oneof)]
    pub enum Kind {
        #[prost(message, tag = "1")]
        Reader(super::RebootReaderMethodOptions),
        #[prost(message, tag = "2")]
        Writer(super::RebootWriterMethodOptions),
        #[prost(message, tag = "3")]
        Transaction(super::RebootTransactionMethodOptions),
        #[prost(message, tag = "4")]
        Workflow(super::Empty),
    }
}
#[derive(Clone, Message)]
struct Empty {}

#[derive(Clone, Message)]
struct RebootTransactionMethodOptions {
    #[prost(message, optional, tag = "2")]
    constructor: Option<Empty>,
    // This is a protobuf `oneof`, not two independent flags. In particular,
    // when malformed raw wire contains both fields, protobuf keeps the last
    // field; Python's generated options message has that same behavior.
    #[prost(oneof = "reboot_transaction_method_options::Mode", tags = "3, 4")]
    mode: Option<reboot_transaction_method_options::Mode>,
}

mod reboot_transaction_method_options {
    #[derive(Clone, prost::Oneof)]
    pub enum Mode {
        #[prost(message, tag = "3")]
        Exclusive(super::Empty),
        #[prost(message, tag = "4")]
        Shared(super::Empty),
    }
}

#[derive(Clone, Default)]
struct DurableService {
    state: String,
    default_constructible: bool,
    methods: HashMap<String, DurableKind>,
}

/// Generates forwarding adapters without custom descriptor option semantics.
pub fn generate(request: CodeGeneratorRequest) -> CodeGeneratorResponse {
    respond(generate_inner(request, HashMap::new()))
}

/// Generates from the raw protoc request, retaining and decoding custom option
/// field 50000 for `rbt.v1alpha1.service` and `rbt.v1alpha1.method`.
pub fn generate_from_wire(input: &[u8]) -> CodeGeneratorResponse {
    let request = match CodeGeneratorRequest::decode(input) {
        Ok(value) => value,
        Err(error) => return error_response(error.to_string()),
    };
    if let Err(error) = validate_generated_file_syntax_and_package_paths(&request) {
        return error_response(error);
    }
    let raw = match RawRequest::decode(input) {
        Ok(value) => value,
        Err(error) => return error_response(error.to_string()),
    };
    let generated_files: HashSet<_> = request.file_to_generate.iter().cloned().collect();
    let annotations = match annotations_for_generated_files(raw.files, &generated_files) {
        Ok(value) => value,
        Err(error) => return error_response(error),
    };
    respond(generate_inner(request, annotations))
}

/// Generates adapter files from a `FileDescriptorSet` emitted by `protoc`.
///
/// `prost_types` intentionally does not retain unknown extension fields. The
/// second raw decode preserves Reboot option field 50000, so this path has the
/// same durable-adapter semantics as the executable plugin.
pub fn generate_from_descriptor_set_wire(
    input: &[u8],
    file_to_generate: &[String],
    module: &str,
    runtime_module: &str,
) -> CodeGeneratorResponse {
    let descriptor_set = match FileDescriptorSet::decode(input) {
        Ok(value) => value,
        Err(error) => return error_response(error.to_string()),
    };
    let raw = match RawDescriptorSet::decode(input) {
        Ok(value) => value,
        Err(error) => return error_response(error.to_string()),
    };
    let request = CodeGeneratorRequest {
        parameter: Some(format!(
            "{MODULE_PARAMETER_PREFIX}{module},{RUNTIME_MODULE_PARAMETER_PREFIX}{runtime_module}"
        )),
        file_to_generate: file_to_generate.to_vec(),
        proto_file: descriptor_set.file,
        ..Default::default()
    };
    if let Err(error) = validate_generated_file_syntax_and_package_paths(&request) {
        return error_response(error);
    }
    let generated_files: HashSet<_> = file_to_generate.iter().cloned().collect();
    let annotations = match annotations_for_generated_files(raw.files, &generated_files) {
        Ok(value) => value,
        Err(error) => return error_response(error),
    };
    respond(generate_inner(request, annotations))
}

fn respond(result: Result<Vec<code_generator_response::File>, String>) -> CodeGeneratorResponse {
    match result {
        Ok(file) => CodeGeneratorResponse {
            file,
            ..Default::default()
        },
        Err(error) => error_response(error),
    }
}
fn error_response(error: String) -> CodeGeneratorResponse {
    CodeGeneratorResponse {
        error: Some(error),
        ..Default::default()
    }
}

#[cfg(test)]
fn annotations(
    raw_files: Vec<RawFile>,
) -> Result<HashMap<String, HashMap<String, DurableService>>, String> {
    // Unit-level annotation tests intentionally model every supplied file as
    // generated. Plugin entry points use the scoped helper below.
    let generated_files = raw_files
        .iter()
        .filter_map(|file| file.name.clone())
        .collect();
    annotations_for_generated_files(raw_files, &generated_files)
}

fn annotations_for_generated_files(
    raw_files: Vec<RawFile>,
    generated_files: &HashSet<String>,
) -> Result<HashMap<String, HashMap<String, DurableService>>, String> {
    let state_files = raw_files.clone();
    let mut output = HashMap::new();
    for file in raw_files {
        let Some(file_name) = file.name else { continue };
        let mut services = HashMap::new();
        // Python calls `_check_services` only from `process_file` for the
        // descriptor currently being generated. A linked dependency stays
        // opaque to these service-local checks until it is itself listed in
        // `file_to_generate`; relationship lookups below retain their own
        // source-specific pool scope.
        if !generated_files.contains(&file_name) {
            output.insert(file_name, services);
            continue;
        }
        for service in file.services {
            let Some(service_name) = service.name else {
                continue;
            };
            let service_full_name = file
                .package
                .as_deref()
                .filter(|package| !package.is_empty())
                .map(|package| format!("{package}.{service_name}"))
                .unwrap_or_else(|| service_name.clone());
            let service_option = service
                .options
                .as_deref()
                .map(|options| {
                    ExtensionOptions::decode(options)
                        .map_err(|error| format!("{file_name}: invalid service options: {error}"))
                })
                .transpose()?
                .and_then(|extension| extension.reboot);
            let has_method_option = service.methods.iter().try_fold(
                false,
                |found, method| -> Result<bool, String> {
                    let Some(options) = method.options.as_deref() else {
                        return Ok(found);
                    };
                    let extension = ExtensionOptions::decode(options)
                        .map_err(|error| format!("{file_name}: invalid method options: {error}"))?;
                    Ok(found || extension.reboot.is_some())
                },
            )?;
            // Python treats either annotation as sufficient to classify a service
            // as Reboot. A service option is optional because the `Methods`
            // naming convention supplies its state name.
            if service_option.is_none() && !has_method_option {
                continue;
            }
            // `process_file` invokes `_check_services` only for a descriptor
            // requested through `file_to_generate`. A linked dependency may
            // therefore remain malformed until it is generated itself.
            if !service_name.ends_with("Methods") {
                if generated_files.contains(&file_name) {
                    return Err(format!(
                        "Reboot service '{service_full_name}' has illegal name: all Reboot service names must end in 'Methods', since (unlike basic gRPC) they provide methods to Reboot states"
                    ));
                }
                // Python does not inspect linked dependency services until they
                // appear in `file_to_generate`; do not force state derivation
                // for an invalid method-only dependency here.
                continue;
            }
            let service_option = service_option
                .map(|bytes| {
                    RebootServiceOptions::decode(bytes.as_slice()).map_err(|error| {
                        format!("{file_name}: invalid rbt.v1alpha1.service option: {error}")
                    })
                })
                .transpose()?;
            let (state, default_constructible) = match service_option {
                // Method-only services follow Python's `Methods` convention.
                // Keep the established explicit-option path intact until its
                // fixture corpus can migrate as one compatible API change.
                None => {
                    let Some(state) = service_name.strip_suffix("Methods") else {
                        return Err(format!(
                            "{file_name}: Reboot service `{service_name}` has illegal name: all method-only Reboot service names must end in `Methods`"
                        ));
                    };
                    (state.to_owned(), false)
                }
                Some(service_option) if service_option.state.is_empty() => {
                    return Err(format!(
                        "{file_name}: annotated service `{service_name}` is missing rbt.v1alpha1.service.state"
                    ));
                }
                Some(service_option) => {
                    (service_option.state, service_option.default_constructible)
                }
            };
            let mut methods = HashMap::new();
            for method in service.methods {
                let Some(method_name) = method.name else {
                    continue;
                };
                // Python classifies a service with the service option as Reboot,
                // then requires every member to carry a method option
                // (`protoc_gen_reboot_generic.py:_check_services`). Do not emit a
                // partial durable adapter when a descriptor violates that contract.
                let Some(options) = method.options else {
                    return Err(format!(
                        "{file_name}: Missing Reboot method annotation for `{service_name}/{method_name}`"
                    ));
                };
                let extension = ExtensionOptions::decode(options.as_slice())
                    .map_err(|error| format!("{file_name}: invalid method options: {error}"))?;
                let Some(bytes) = extension.reboot else {
                    return Err(format!(
                        "{file_name}: Missing Reboot method annotation for `{service_name}/{method_name}`"
                    ));
                };
                let option = RebootMethodOptions::decode(bytes.as_slice()).map_err(|error| {
                    format!("{file_name}: invalid rbt.v1alpha1.method option: {error}")
                })?;
                // Rust has neither generated declared-error types nor the rich
                // gRPC status/detail boundary they require. Python derives the
                // generic `error` feature from this non-empty declaration, so
                // reject at this generated-file service boundary rather than
                // emitting an adapter that drops the contract.
                if !RebootMethodErrorOptions::decode(bytes.as_slice())
                    .map_err(|error| {
                        format!("{file_name}: invalid rbt.v1alpha1.method option: {error}")
                    })?
                    .errors
                    .is_empty()
                {
                    return Err(format!(
                        "{file_name}: service `{service_name}` method `{method_name}` requests declared errors; this generator supports only methods without declared errors"
                    ));
                }
                if method_name.chars().next().is_some_and(char::is_lowercase) {
                    return Err(format!(
                        "{file_name}: Reboot method `{service_name}/{method_name}` has illegal name: all Reboot RPC method names must start with an uppercase letter."
                    ));
                }
                // Python reserves generated handler member names for every
                // Reboot service except the historical SecretMethods API.
                if service_full_name != "rbt.cloud.v1alpha1.secrets.SecretMethods"
                    && matches!(
                        method_name.as_str(),
                        "Read" | "Write" | "Delete" | "State" | "Schedule" | "Spawn"
                    )
                {
                    return Err(format!(
                        "{file_name}: Reboot method `{service_full_name}/{method_name}` has illegal name: {method_name} is reserved"
                    ));
                }
                // Python rejects `google.api.http` on Reboot methods. It is
                // valid only for legacy gRPC services because a Reboot method
                // has no HTTP adapter surface yet.
                if GoogleApiMethodOptions::decode(options.as_slice())
                    .map_err(|error| format!("{file_name}: invalid method options: {error}"))?
                    .google_api_http
                    .is_some()
                {
                    return Err(format!(
                        "{file_name}: Service `{service_name}` method `{method_name}` has a 'google.api.http' annotation. This is only supported for legacy gRPC services, not for Reboot methods. Let the maintainers know about your use case if you feel this is a limitation!"
                    ));
                }
                let Some(kind) = option.kind else {
                    return Err(format!(
                        "{file_name}: annotated method `{service_name}.{method_name}` has no recognized Reboot method kind"
                    ));
                };
                let kind = match kind {
                    reboot_method_options::Kind::Reader(reader) => {
                        // Python promotes this option to its `streaming`
                        // feature even when the RPC itself is unary. Rust has
                        // no streaming reader adapter, so reject it at the
                        // raw plugin boundary rather than silently emitting a
                        // unary adapter with incompatible state semantics.
                        if reader.state == ReaderState::Streaming as i32 {
                            return Err(format!(
                                "{file_name}: service `{service_name}` method `{method_name}` requests streaming state; only unary methods are supported"
                            ));
                        }
                        DurableKind::Reader
                    }
                    reboot_method_options::Kind::Writer(writer) => {
                        DurableKind::Writer(WriterMetadata {
                            constructor: writer.constructor.is_some(),
                        })
                    }
                    reboot_method_options::Kind::Transaction(transaction) => match transaction.mode
                    {
                        Some(reboot_transaction_method_options::Mode::Exclusive(_)) => {
                            DurableKind::Transaction(TransactionMetadata {
                                mode: TransactionMode::Exclusive,
                                factory: transaction.constructor.is_some(),
                            })
                        }
                        Some(reboot_transaction_method_options::Mode::Shared(_)) => {
                            DurableKind::Transaction(TransactionMetadata {
                                mode: TransactionMode::Shared,
                                factory: transaction.constructor.is_some(),
                            })
                        }
                        None => {
                            return Err(format!(
                                "{file_name}: Transaction '{method_name}' does not say how it holds the lock on its own state while it runs. Every transaction must declare one of:\n  exclusive: {{}} takes the lock exclusive from the start, so that concurrent callers of the same state queue behind it. The choice for a transaction that writes its own state, which is most of them.\n  shared: {{}} takes the lock shared and upgrades it to exclusive only if the transaction writes its own state, so that callers proceed concurrently while none of them writes it. The choice for a transaction that mostly reads its own state while writing others.\nFor example:\n  option (rbt.v1alpha1.method) = {{\n    transaction: {{ exclusive: {{}} }},\n  }};"
                            ));
                        }
                    },
                    reboot_method_options::Kind::Workflow(_) => {
                        return Err(format!(
                            "{file_name}: annotated method `{service_name}.{method_name}` has no recognized Reboot method kind"
                        ));
                    }
                };
                methods.insert(method_name, kind);
            }
            services.insert(
                service_name,
                DurableService {
                    state,
                    default_constructible,
                    methods,
                },
            );
        }
        output.insert(file_name, services);
    }
    check_service_state_annotations(&state_files, generated_files)?;
    check_state_service_consistency(&state_files, generated_files)?;
    check_auto_construct_required_methods(&state_files, generated_files)?;
    check_duplicate_state_methods(&state_files, &output, generated_files)?;
    Ok(output)
}

/// Mirrors Python `_check_no_duplicate_methods`: all services supplying a
/// state share one generated client surface, so an RPC name may occur only
/// once across services for the same state in one generated descriptor file.
/// The state message itself may be outside the descriptor set.
fn check_duplicate_state_methods(
    raw_files: &[RawFile],
    annotations: &HashMap<String, HashMap<String, DurableService>>,
    generated_files: &HashSet<String>,
) -> Result<(), String> {
    for file in raw_files {
        let Some(file_name) = file.name.as_deref() else {
            continue;
        };
        // Python invokes `_base_clients` (and therefore
        // `_check_no_duplicate_methods`) while processing each
        // `file_to_generate`; the descriptor pool supplies linked symbols but
        // does not itself make a dependency a generated client surface.
        if !generated_files.contains(file_name) {
            continue;
        }
        let package = file.package.as_deref().unwrap_or_default();
        let Some(services) = annotations.get(file_name) else {
            continue;
        };
        let mut seen = HashMap::<(String, String), String>::new();
        for service in &file.services {
            let Some(service_name) = service.name.as_deref() else {
                continue;
            };
            let Some(annotation) = services.get(service_name) else {
                continue;
            };
            let state = if annotation.state.contains('.') {
                annotation.state.clone()
            } else {
                qualify(package, &annotation.state)
            };
            let service_full_name = qualify(package, service_name);
            for method in &service.methods {
                let Some(method_name) = method.name.as_deref() else {
                    continue;
                };
                // `annotations` has already established that this is a Reboot
                // method with a recognized kind.
                if !annotation.methods.contains_key(method_name) {
                    continue;
                }
                let key = (state.clone(), method_name.to_owned());
                let method_full_name = format!("{service_full_name}.{method_name}");
                if let Some(previous) = seen.insert(key, method_full_name.clone()) {
                    return Err(format!(
                        "Reboot state '{state}' has conflicting methods named '{method_name}': one from '{previous}', another from '{method_full_name}'. Each method name may only be used once per state type."
                    ));
                }
            }
        }
    }
    Ok(())
}

/// Mirrors Python `_check_services`' optional service-to-state annotation
/// validation. A service may refer to a state compiled outside this descriptor
/// set, but when the message is present it must carry the Reboot state option.
fn check_service_state_annotations(
    raw_files: &[RawFile],
    generated_files: &HashSet<String>,
) -> Result<(), String> {
    let mut states = HashMap::new();
    for file in raw_files {
        let package = file.package.as_deref().unwrap_or_default();
        for message in &file.messages {
            let Some(message_name) = message.name.as_deref() else {
                continue;
            };
            let is_reboot_state = message
                .options
                .as_deref()
                .map(ExtensionOptions::decode)
                .transpose()
                .map_err(|error| {
                    format!(
                        "{}: invalid message options: {error}",
                        file.name.as_deref().unwrap_or("<unnamed>")
                    )
                })?
                .and_then(|extension| extension.reboot)
                .is_some();
            states.insert(qualify(package, message_name), is_reboot_state);
        }
    }

    for file in raw_files {
        let file_name = file.name.as_deref().unwrap_or("<unnamed>");
        // `_check_services` is reached from `_base_data` while processing one
        // requested descriptor. Its linked messages come from the whole pool,
        // but a dependency service is not itself checked until generated.
        if !generated_files.contains(file_name) {
            continue;
        }
        let package = file.package.as_deref().unwrap_or_default();
        for service in &file.services {
            let Some(service_name) = service.name.as_deref() else {
                continue;
            };
            let service_options = service
                .options
                .as_deref()
                .map(ExtensionOptions::decode)
                .transpose()
                .map_err(|error| format!("{file_name}: invalid service options: {error}"))?;
            let has_service_option = service_options
                .as_ref()
                .and_then(|options| options.reboot.as_ref())
                .is_some();
            let has_method_option = service.methods.iter().try_fold(
                false,
                |found, method| -> Result<bool, String> {
                    let Some(options) = method.options.as_deref() else {
                        return Ok(found);
                    };
                    let extension = ExtensionOptions::decode(options)
                        .map_err(|error| format!("{file_name}: invalid method options: {error}"))?;
                    Ok(found || extension.reboot.is_some())
                },
            )?;
            if !has_service_option && !has_method_option {
                continue;
            }
            let explicit_state = service_options
                .and_then(|options| options.reboot)
                .map(|bytes| RebootServiceOptions::decode(bytes.as_slice()))
                .transpose()
                .map_err(|error| {
                    format!("{file_name}: invalid rbt.v1alpha1.service option: {error}")
                })?
                .map(|options| options.state)
                .filter(|state| !state.is_empty());
            let state_name = explicit_state
                .or_else(|| service_name.strip_suffix("Methods").map(ToOwned::to_owned));
            let Some(state_name) = state_name else {
                continue;
            };
            let state_full_name = if state_name.contains('.') {
                state_name
            } else {
                qualify(package, &state_name)
            };
            if matches!(states.get(&state_full_name), Some(false)) {
                return Err(format!(
                    "{file_name}: Reboot service `{}` is linked to state message `{state_full_name}`, but that message is not annotated as a Reboot state; all Reboot states must have the `rbt.v1alpha1.state` annotation.",
                    qualify(package, service_name)
                ));
            }
        }
    }
    Ok(())
}

/// Mirrors Python's descriptor-only `_check_states` relationship validation.
/// Only top-level messages participate, matching `file.message_types_by_name`.
fn check_state_service_consistency(
    raw_files: &[RawFile],
    generated_files: &HashSet<String>,
) -> Result<(), String> {
    let mut services = HashMap::new();
    for file in raw_files {
        let package = file.package.as_deref().unwrap_or_default();
        for service in &file.services {
            let Some(name) = service.name.as_deref() else {
                continue;
            };
            let full_name = qualify(package, name);
            let explicit_state = service
                .options
                .as_deref()
                .map(ExtensionOptions::decode)
                .transpose()
                .map_err(|error| {
                    format!(
                        "{}: invalid service options: {error}",
                        file.name.as_deref().unwrap_or("<unnamed>")
                    )
                })?
                .and_then(|extension| extension.reboot)
                .map(|bytes| RebootServiceOptions::decode(bytes.as_slice()))
                .transpose()
                .map_err(|error| {
                    format!(
                        "{}: invalid rbt.v1alpha1.service option: {error}",
                        file.name.as_deref().unwrap_or("<unnamed>")
                    )
                })?
                .map(|options| options.state);
            let state = match explicit_state {
                Some(state) if !state.is_empty() => {
                    if state.contains('.') {
                        state
                    } else {
                        qualify(package, &state)
                    }
                }
                _ => match name.strip_suffix("Methods") {
                    Some(state) => qualify(package, state),
                    None => continue,
                },
            };
            services.insert(full_name, state);
        }
    }

    for file in raw_files {
        let Some(file_name) = file.name.as_deref() else {
            continue;
        };
        // `_check_states` is also called only while building the generated
        // file's BaseState list. It resolves services through the descriptor
        // pool, without validating state declarations in dependencies.
        if !generated_files.contains(file_name) {
            continue;
        }
        let package = file.package.as_deref().unwrap_or_default();
        for message in &file.messages {
            let Some(message_name) = message.name.as_deref() else {
                continue;
            };
            let Some(options) = message.options.as_deref() else {
                continue;
            };
            let state_options = ExtensionOptions::decode(options)
                .map_err(|error| format!("{file_name}: invalid message options: {error}"))?
                .reboot
                .map(|bytes| RebootStateOptions::decode(bytes.as_slice()))
                .transpose()
                .map_err(|error| {
                    format!("{file_name}: invalid rbt.v1alpha1.state option: {error}")
                })?;
            let Some(state_options) = state_options else {
                continue;
            };
            let state_full_name = qualify(package, message_name);
            let implements = if state_options.implements.is_empty() {
                vec![format!("{state_full_name}Methods")]
            } else {
                state_options
                    .implements
                    .into_iter()
                    .map(|service| {
                        if service.contains('.') {
                            service
                        } else {
                            qualify(package, &service)
                        }
                    })
                    .collect()
            };
            for service_full_name in implements {
                let Some(service_state) = services.get(&service_full_name) else {
                    return Err(format!(
                        "{file_name}: Missing Reboot service named `{service_full_name}`; expected by state message `{state_full_name}` defined in `{file_name}`."
                    ));
                };
                if service_state != &state_full_name {
                    return Err(format!(
                        "{file_name}: Reboot state message `{state_full_name}` is expecting to get methods from service `{service_full_name}`, but that service is providing methods for a state message named `{service_state}` instead."
                    ));
                }
            }
        }
    }
    Ok(())
}

/// Mirrors the required-method portion of Python `_base_services_for_state`.
///
/// Python reaches this while building `BaseState`s for one `file_to_generate`;
/// its descriptor pool supplies the named services, including dependencies.
/// Therefore an auto-constructed state in a dependency is not checked merely
/// because it is linked into this request, while its `Create` and `SetClaims`
/// methods may themselves be declared in dependency files.
fn check_auto_construct_required_methods(
    raw_files: &[RawFile],
    generated_files: &HashSet<String>,
) -> Result<(), String> {
    let mut services = HashMap::<String, &RawService>::new();
    for file in raw_files {
        let package = file.package.as_deref().unwrap_or_default();
        for service in &file.services {
            if let Some(name) = service.name.as_deref() {
                services.insert(qualify(package, name), service);
            }
        }
    }

    for file in raw_files {
        let Some(file_name) = file.name.as_deref() else {
            continue;
        };
        if !generated_files.contains(file_name) {
            continue;
        }
        let package = file.package.as_deref().unwrap_or_default();
        for message in &file.messages {
            let Some(state_name) = message.name.as_deref() else {
                continue;
            };
            let Some(options) = message.options.as_deref() else {
                continue;
            };
            let state_options = ExtensionOptions::decode(options)
                .map_err(|error| format!("{file_name}: invalid message options: {error}"))?
                .reboot
                .map(|bytes| RebootStateOptions::decode(bytes.as_slice()))
                .transpose()
                .map_err(|error| {
                    format!("{file_name}: invalid rbt.v1alpha1.state option: {error}")
                })?;
            let Some(state_options) = state_options else {
                continue;
            };
            if state_options.auto_construct == AutoConstruct::Unspecified as i32 {
                continue;
            }
            let state_full_name = qualify(package, state_name);
            let implements = if state_options.implements.is_empty() {
                vec![format!("{state_full_name}Methods")]
            } else {
                state_options
                    .implements
                    .into_iter()
                    .map(|service| {
                        if service.contains('.') {
                            service
                        } else {
                            qualify(package, &service)
                        }
                    })
                    .collect()
            };
            let method_names: HashSet<&str> = implements
                .iter()
                .filter_map(|service_name| services.get(service_name))
                .flat_map(|service| service.methods.iter())
                .filter_map(|method| method.name.as_deref())
                .collect();
            if !method_names.contains("Create") {
                return Err(format!(
                    "State type '{state_name}' requires a 'Create' Transaction method. Add to your service:\n  rpc Create(google.protobuf.Empty) returns (google.protobuf.Empty) {{\n    option (rbt.v1alpha1.method) = {{ transaction: {{}} }};\n  }}"
                ));
            }
            if !method_names.contains("SetClaims") {
                return Err(format!(
                    "State type '{state_name}' requires a 'SetClaims' Transaction method through which the framework delivers each user's verified identity claims. Add to your service:\n  rpc SetClaims({state_name}SetClaimsRequest) returns (google.protobuf.Empty) {{\n    option (rbt.v1alpha1.method) = {{ transaction: {{}} }};\n  }}\nwhere '{state_name}SetClaimsRequest' is a message with a 'map<string, google.protobuf.Value> claims = 1;' field."
                ));
            }
        }
    }
    Ok(())
}

fn qualify(package: &str, name: &str) -> String {
    if package.is_empty() {
        name.to_owned()
    } else {
        format!("{package}.{name}")
    }
}

fn generate_inner(
    request: CodeGeneratorRequest,
    annotations: HashMap<String, HashMap<String, DurableService>>,
) -> Result<Vec<code_generator_response::File>, String> {
    let (module, runtime_module) = parse_modules(request.parameter.as_deref())?;
    let descriptors: BTreeMap<_, _> = request
        .proto_file
        .iter()
        .filter_map(|file| file.name.as_deref().map(|name| (name, file)))
        .collect();
    request
        .file_to_generate
        .iter()
        .map(|name| {
            let file = descriptors
                .get(name.as_str())
                .ok_or_else(|| format!("missing descriptor for file_to_generate `{name}`"))?;
            generate_file(file, module, runtime_module, annotations.get(name))
        })
        .collect()
}

fn generate_file(
    file: &FileDescriptorProto,
    module: &str,
    runtime_module: &str,
    annotations: Option<&HashMap<String, DurableService>>,
) -> Result<code_generator_response::File, String> {
    let file_name = required(&file.name, "file name")?;
    // Python validates each generated descriptor before inspecting its package
    // or rendering a template. `descriptor.proto` is the one source-backed
    // exception: protoc reports no syntax for it although Reboot accepts it.
    let syntax = file.syntax.as_deref().unwrap_or_default();
    if syntax != "proto3" && file_name != "google/protobuf/descriptor.proto" {
        return Err(format!(
            "Unsupported: not a proto3 file. Reboot only supports proto files that set 'syntax=\"proto3\";', but got 'syntax=\"{syntax}\";'"
        ));
    }
    let package = required(&file.package, "protobuf package")?;
    if package.is_empty() {
        return Err(format!("file `{file_name}` has an empty protobuf package"));
    }
    let mut content = format!(
        "// @generated by protoc-gen-reboot_rust. Do not edit.\nuse {module} as proto;\n\n"
    );
    reject_generated_symbol_collisions(file_name, &file.service, annotations)?;
    let mut durable_states = std::collections::HashSet::new();
    for service in &file.service {
        emit_forwarding(&mut content, file_name, package, service)?;
        if let Some(annotation) =
            annotations.and_then(|value| service.name.as_ref().and_then(|name| value.get(name)))
        {
            // Python's generic `process_file` rejects an empty service only
            // when it produces this file's Reboot client. Keep the check at
            // the same output boundary rather than rejecting dependencies.
            if service.method.is_empty() {
                let service_name = required(&service.name, "service name")?;
                return Err(format!(
                    "Service '{service_name}' has no rpc methods specified. Complete your proto file."
                ));
            }
            emit_durable(
                &mut content,
                file_name,
                package,
                service,
                annotation,
                runtime_module,
                &mut durable_states,
            )?;
        }
    }
    Ok(code_generator_response::File {
        name: Some(output_name(file_name)?),
        content: Some(content),
        ..Default::default()
    })
}

/// Mirrors `RebootProtocPlugin.template_data`'s generated-file package/path
/// contract. Rust's build helper retains proto-relative output names too, so a
/// mismatched descriptor would otherwise generate an adapter at a misleading
/// module path.
///
/// Python invokes `process_file` only for files requested from protoc, not
/// every linked descriptor in its pool. Retain that boundary here.
fn validate_generated_file_syntax_and_package_paths(
    request: &CodeGeneratorRequest,
) -> Result<(), String> {
    let descriptors: BTreeMap<_, _> = request
        .proto_file
        .iter()
        .filter_map(|file| file.name.as_deref().map(|name| (name, file)))
        .collect();
    for file_name in &request.file_to_generate {
        let file = descriptors
            .get(file_name.as_str())
            .ok_or_else(|| format!("missing descriptor for file_to_generate `{file_name}`"))?;
        let syntax = file.syntax.as_deref().unwrap_or_default();
        if syntax != "proto3" && file_name != "google/protobuf/descriptor.proto" {
            return Err(format!(
                "Unsupported: not a proto3 file. Reboot only supports proto files that set 'syntax=\"proto3\";', but got 'syntax=\"{syntax}\";'"
            ));
        }
        validate_proto_file_package_path(file_name, file.package.as_deref())?;
    }
    Ok(())
}

fn validate_proto_file_package_path<'a>(
    file_name: &str,
    package: Option<&'a str>,
) -> Result<&'a str, String> {
    let package = package.filter(|value| !value.is_empty()).ok_or_else(|| {
        format!("Proto file '{file_name}' is missing a (currently) required 'package' statement")
    })?;
    // Python uses `os.path.dirname` and splits that result on `os.path.sep`.
    // The Rust generator runs on the same Linux descriptor-path convention, so
    // retain empty components (for example, in `api//v1/file.proto`) exactly.
    let directory = file_name
        .rsplit_once('/')
        .map(|(directory, _)| directory)
        .unwrap_or_default();
    if directory.split('/').any(|component| {
        !component
            .bytes()
            .all(|byte| byte == b'_' || byte.is_ascii_alphanumeric())
    }) {
        return Err(format!(
            "Proto file '{file_name}' is located in a directory '{directory}' that is not a legal 'proto3' package name component. Legal characters are letters, numbers, and underscore. Reboot requires that the directory structure matches the proto file's package name. Please rename your directory."
        ));
    }
    let expected_directory = package.replace('.', "/");
    if expected_directory != directory {
        return Err(format!(
            "Proto file '{file_name}' has package '{package}', but based on the file's path the expected package was '{}'. 'rbt generate' expects the package to match the directory structure. Check that the API base directory is correct, and if so, adjust either the proto file's location or its package.",
            directory.replace('/', ".")
        ));
    }
    Ok(package)
}

fn reject_generated_symbol_collisions(
    file: &str,
    services: &[ServiceDescriptorProto],
    annotations: Option<&HashMap<String, DurableService>>,
) -> Result<(), String> {
    let mut owners = HashMap::new();
    for service in services {
        let service_name = required(&service.name, "service name")?;
        let mut symbols = vec![
            format!("{service_name}Handler"),
            format!("{service_name}Adapter"),
        ];
        if let Some(annotation) = annotations.and_then(|annotations| annotations.get(service_name))
        {
            let durable_kinds = service.method.iter().filter_map(|method| {
                method
                    .name
                    .as_deref()
                    .and_then(|name| annotation.methods.get(name))
            });
            let durable_kinds: Vec<_> = durable_kinds.collect();
            if durable_kinds
                .iter()
                .any(|kind| !matches!(kind, DurableKind::Transaction(_)))
            {
                symbols.extend([
                    format!("{service_name}DatabaseHandler"),
                    format!("{service_name}DatabaseAdapter"),
                ]);
            }
            if durable_kinds
                .iter()
                .any(|kind| matches!(kind, DurableKind::Transaction(_)))
            {
                symbols.extend([
                    format!("{service_name}TransactionHandler"),
                    format!("{service_name}TransactionAdapter"),
                ]);
            }
            if durable_kinds
                .iter()
                .any(|kind| !matches!(kind, DurableKind::Transaction(_)))
            {
                symbols.push(format!("{service_name}ExternalClient"));
            }
        }
        for symbol in symbols {
            if let Some(previous) = owners.insert(symbol.clone(), service_name) {
                return Err(format!(
                    "{file}: services `{previous}` and `{service_name}` both generate Rust symbol `{symbol}`"
                ));
            }
        }
    }
    Ok(())
}

fn emit_forwarding(
    output: &mut String,
    file: &str,
    package: &str,
    service: &ServiceDescriptorProto,
) -> Result<(), String> {
    let name = required(&service.name, "service name")?;
    if !is_generated_rust_identifier(name) {
        return Err(format!(
            "{file}: service `{name}` is not a valid generated Rust identifier"
        ));
    }
    reject_method_name_collisions(file, name, &service.method)?;
    let handler = format!("{name}Handler");
    let adapter = format!("{name}Adapter");
    let server = format!("{}_server", snake_case(name));
    output.push_str("#[tonic::async_trait]\n");
    output.push_str(&format!("pub trait {handler}: Send + Sync + 'static {{\n"));
    for method in &service.method {
        let (method, request, response) = method_types(file, package, name, method)?;
        output.push_str(&format!("    async fn {method}(&self, request: tonic::Request<proto::{request}>) -> Result<tonic::Response<proto::{response}>, tonic::Status>;\n"));
    }
    output.push_str("}\n\n");
    output.push_str(&format!("pub struct {adapter}<H> {{ handler: H }}\nimpl<H> {adapter}<H> {{ pub fn new(handler: H) -> Self {{ Self {{ handler }} }} }}\n\n"));
    output.push_str("#[tonic::async_trait]\n");
    output.push_str(&format!(
        "impl<H: {handler}> proto::{server}::{name} for {adapter}<H> {{\n"
    ));
    for method in &service.method {
        let (method, request, response) = method_types(file, package, name, method)?;
        output.push_str(&format!("    async fn {method}(&self, request: tonic::Request<proto::{request}>) -> Result<tonic::Response<proto::{response}>, tonic::Status> {{ self.handler.{method}(request).await }}\n"));
    }
    output.push_str("}\n\n");
    Ok(())
}

fn emit_durable(
    output: &mut String,
    file: &str,
    package: &str,
    service: &ServiceDescriptorProto,
    annotation: &DurableService,
    runtime_module: &str,
    durable_states: &mut std::collections::HashSet<String>,
) -> Result<(), String> {
    let service_name = required(&service.name, "service name")?;
    let state_reference = annotation
        .state
        .strip_prefix('.')
        .unwrap_or(&annotation.state);
    let state_reference = Some(format!(
        ".{package}.{}",
        state_reference.trim_start_matches(&format!("{package}."))
    ));
    let state_name = same_package_proto_type(
        file,
        package,
        service_name,
        "<service>",
        "state",
        &state_reference,
    )?;
    let state = state_name.to_upper_camel_case();
    let state_type = format!("{package}.{state_name}");
    let declaration = format!("{state}DurableState");
    let mut methods = Vec::new();
    for method in &service.method {
        let method_name = required(&method.name, "method name")?;
        let Some(kind) = annotation.methods.get(method_name) else {
            continue;
        };
        let method_identity = format!(
            "{package}.{service_name}.{}",
            required(&method.name, "method name")?
        );
        let (method, request, response) = method_types(file, package, service_name, method)?;
        methods.push((kind, method, request, response, method_identity));
    }
    if methods.is_empty() {
        return Ok(());
    }
    if durable_states.insert(declaration.clone()) {
        output.push_str(&format!(
            "/// Durable state declaration generated for `proto::{state}`.\npub struct {declaration};\n\nimpl {runtime_module}::runtime::DurableStateDeclaration for {declaration} {{\n    type State = proto::{state};\n    const STATE_TYPE: &'static str = \"{state_type}\";\n}}\n\n"
        ));
    }
    let database_methods: Vec<_> = methods
        .iter()
        .filter(|(kind, _, _, _, _)| !matches!(kind, DurableKind::Transaction(_)))
        .collect();
    let has_transactions = methods
        .iter()
        .any(|(kind, _, _, _, _)| matches!(kind, DurableKind::Transaction(_)));
    // A mixed durable service has one Tonic trait, therefore it must have one
    // adapter implementing every declared method. Database-only services keep
    // their smaller adapter; mixed services are emitted below.
    if !database_methods.is_empty() && !has_transactions {
        let handler = format!("{service_name}DatabaseHandler");
        let adapter = format!("{service_name}DatabaseAdapter");
        let server = format!("{}_server", snake_case(service_name));
        output.push_str("#[tonic::async_trait]\n");
        output.push_str(&format!("pub trait {handler}: Send + Sync + 'static {{\n"));
        for (kind, method, request, response, _) in &database_methods {
            output.push_str(&format!("    async fn {method}(&self, state: {}proto::{state}, request: proto::{request}) -> Result<proto::{response}, tonic::Status>;\n", if matches!(**kind, DurableKind::Writer(_)) { "&mut " } else { "&" }));
        }
        output.push_str("}\n\n");
        output.push_str(&format!("pub struct {adapter}<H> {{ store: {runtime_module}::runtime::DatabaseActorStore, handler: std::sync::Arc<H> }}\nimpl<H> Clone for {adapter}<H> {{ fn clone(&self) -> Self {{ Self {{ store: self.store.clone(), handler: self.handler.clone() }} }} }}\nimpl<H> {adapter}<H> {{ pub fn new(store: {runtime_module}::runtime::DatabaseActorStore, handler: H) -> Self {{ Self {{ store, handler: std::sync::Arc::new(handler) }} }} }}\n\n"));
        output.push_str("#[tonic::async_trait]\n");
        output.push_str(&format!(
            "impl<H: {handler}> proto::{server}::{service_name} for {adapter}<H> {{\n"
        ));
        let requires_constructor = !annotation.default_constructible
            && database_methods.iter().any(|(kind, _, _, _, _)| {
                matches!(
                    kind,
                    DurableKind::Writer(WriterMetadata { constructor: true })
                )
            });
        for (kind, method, request, response, method_identity) in &database_methods {
            let (envelope, prefix) = match kind {
                DurableKind::Writer(WriterMetadata { constructor: true }) => (
                    "constructor_writer_async_for_method",
                    format!("\"{method_identity}\", "),
                ),
                DurableKind::Reader if requires_constructor => (
                    "reader_async_for_with_admission",
                    format!("{runtime_module}::runtime::StateAdmission::RequireExisting, "),
                ),
                DurableKind::Reader => ("reader_async_for", String::new()),
                DurableKind::Writer(_) if requires_constructor => (
                    "writer_async_for_method_with_admission",
                    format!(
                        "\"{method_identity}\", {runtime_module}::runtime::StateAdmission::RequireExisting, "
                    ),
                ),
                DurableKind::Writer(_) => (
                    "writer_async_for_method",
                    format!("\"{method_identity}\", "),
                ),
                DurableKind::Transaction(_) => unreachable!("transactions are filtered above"),
            };
            output.push_str(&format!("    async fn {method}(&self, request: tonic::Request<proto::{request}>) -> Result<tonic::Response<proto::{response}>, tonic::Status> {{\n        let handler = self.handler.clone();\n        self.store.{envelope}::<{declaration}, _, _, _>(\n            {prefix}request, move |state, request| {{\n                let handler = handler.clone();\n                Box::pin(async move {{ handler.{method}(state, request).await }})\n            }},\n        ).await\n    }}\n"));
        }
        output.push_str("}\n\n");
    }
    emit_transactional_client(output, service_name, &state, runtime_module, &methods)?;
    emit_external_client(output, service_name, runtime_module, &database_methods);
    emit_transactions(
        output,
        service_name,
        &state,
        runtime_module,
        &methods,
        &database_methods,
    )?;
    Ok(())
}

/// Emits a typed external client for declared database reader and writer RPCs.
///
/// Transaction methods deliberately remain on the host-routed `ServiceClient`.
fn emit_external_client(
    output: &mut String,
    service_name: &str,
    runtime_module: &str,
    database_methods: &[&(&DurableKind, String, String, String, String)],
) {
    if database_methods.is_empty() {
        return;
    }
    let client = format!("{service_name}ExternalClient");
    let client_module = format!("{}_client", snake_case(service_name));
    output.push_str(&format!(
        "/// Generated typed external client for database methods on `{service_name}`.\n///\n/// Reader requests use the supplied external context. Writer requests create a\n/// fresh automatic idempotency key unless the caller uses the `_with_key` form.\npub struct {client} {{ client: proto::{client_module}::{service_name}Client<tonic::transport::Channel>, context: {runtime_module}::ExternalContext }}\nimpl {client} {{ pub fn new(channel: tonic::transport::Channel, context: {runtime_module}::ExternalContext) -> Self {{ Self {{ client: proto::{client_module}::{service_name}Client::new(channel), context }} }}\n"
    ));
    for (kind, method, request, response, _) in database_methods {
        match **kind {
            DurableKind::Reader => output.push_str(&format!(
                "    pub async fn {method}(&mut self, request: proto::{request}) -> Result<tonic::Response<proto::{response}>, tonic::Status> {{ let request = self.context.reader(request).map_err(|error| tonic::Status::invalid_argument(error.to_string()))?; self.client.{method}(request).await }}\n"
            )),
            DurableKind::Writer(_) => output.push_str(&format!(
                "    pub async fn {method}(&mut self, request: proto::{request}) -> Result<tonic::Response<proto::{response}>, tonic::Status> {{ let request = self.context.writer(request).map_err(|error| tonic::Status::invalid_argument(error.to_string()))?; self.client.{method}(request).await }}\n    pub async fn {method}_with_key(&mut self, request: proto::{request}, idempotency_key: uuid::Uuid) -> Result<tonic::Response<proto::{response}>, tonic::Status> {{ let request = self.context.writer_with_key(request, idempotency_key).map_err(|error| tonic::Status::invalid_argument(error.to_string()))?; self.client.{method}(request).await }}\n"
            )),
            DurableKind::Transaction(_) => unreachable!("transactions are filtered above"),
        }
    }
    output.push_str("}\n\n");
}

/// Emits a typed outbound client for an annotated Reboot application service.
///
/// The host provides routing; the generated client only calls the statically
/// declared Tonic method after attaching the existing transaction context.
fn emit_transactional_client(
    output: &mut String,
    service_name: &str,
    state: &str,
    runtime_module: &str,
    methods: &[(&DurableKind, String, String, String, String)],
) -> Result<(), String> {
    let client = format!("{service_name}Client");
    let target = format!("{service_name}Target");
    let declaration = format!("{state}DurableState");
    let client_module = format!("{}_client", snake_case(service_name));
    output.push_str(&format!("/// Typed target state reference for `{service_name}`.\n///\n/// This value is passed unchanged to the host-owned resolver; it is not an\n/// address, placement hint, UUID, or SDK-generated identity.\n#[derive(Clone, Debug, Eq, PartialEq)]\npub struct {target} {{ state_ref: String }}\nimpl {target} {{ pub fn new(state_ref: impl Into<String>) -> Self {{ Self {{ state_ref: state_ref.into() }} }} pub fn state_ref(&self) -> &str {{ &self.state_ref }} }}\n\n/// Generated typed outbound client for `{service_name}`.\n///\n/// This is an outbound-only transaction foundation. It preserves the validated\n/// transaction path and coordinator headers, replaces only the target state\n/// reference, and delegates routing to the injected resolver. It does not\n/// execute nested inbound transactions, collect participants, or provide\n/// cross-actor atomicity.\npub struct {client}<R> {{ resolver: std::sync::Arc<R> }}\nimpl<R> Clone for {client}<R> {{ fn clone(&self) -> Self {{ Self {{ resolver: self.resolver.clone() }} }} }}\nimpl<R> {client}<R> where R: {runtime_module}::runtime::TransactionalChannelResolver {{ pub fn new(resolver: R) -> Self {{ Self {{ resolver: std::sync::Arc::new(resolver) }} }}\n"));
    for (_, method, request, response, _) in methods {
        output.push_str(&format!("    pub async fn {method}(&self, context: &{runtime_module}::runtime::TransactionContext, target: &{target}, request: proto::{request}) -> Result<{runtime_module}::runtime::TransactionalCallResponse<proto::{response}>, tonic::Status> {{ let (channel, request) = {runtime_module}::runtime::transactional_outbound_request(self.resolver.as_ref(), context, <{declaration} as {runtime_module}::runtime::DurableStateDeclaration>::STATE_TYPE, target.state_ref(), request).await?; let response = proto::{client_module}::{service_name}Client::new(channel).{method}(request).await?; let returned_participants = {runtime_module}::successful_trailers::ReturnedParticipants::from_metadata(response.metadata()).map_err(|error| tonic::Status::failed_precondition(error.to_string()))?; context.enlist_returned_participants(&returned_participants); Ok({runtime_module}::runtime::TransactionalCallResponse::new(response, returned_participants)) }}\n"));
    }
    output.push_str("}\n\n");
    Ok(())
}

/// Emits the transaction-only handler surface without claiming that the local
/// DatabaseActorStore can coordinate Reboot's multi-participant protocol.
///
/// Keep the generated transaction paths separate. In particular, a future
/// shared-root promotion must not accidentally change inbound shared execution.
fn emit_exclusive_transaction_method(output: &mut String, flow: TransactionFlow<'_>) {
    // This intentionally retains the established combined fresh/inbound
    // exclusive flow. Shared transactions are rendered by their own emitter.
    output.push_str(&format!(
        "    async fn {}(&self, request: tonic::Request<proto::{}>) -> Result<tonic::Response<proto::{}>, tonic::Status> {{\n        let headers = {}::RebootHeaders::from_metadata(request.metadata()).map_err(|error| tonic::Status::invalid_argument(error.to_string()))?;\n        let inbound = headers.transaction_ids.is_some();\n        if inbound && {} {{ return Err(tonic::Status::unimplemented(\"factory transactions must be exclusive root transactions\")); }}\n",
        flow.method, flow.request, flow.response, flow.runtime_module, flow.factory,
    ));
    emit_transaction_flow(output, flow);
    output.push_str("    }\n");
}
fn emit_shared_transaction_method(output: &mut String, flow: TransactionFlow<'_>) {
    output.push_str(&format!(
        "    async fn {}(&self, request: tonic::Request<proto::{}>) -> Result<tonic::Response<proto::{}>, tonic::Status> {{\n        let headers = {}::RebootHeaders::from_metadata(request.metadata()).map_err(|error| tonic::Status::invalid_argument(error.to_string()))?;\n        let inbound = headers.transaction_ids.is_some();\n        if inbound {{\n            // Shared inbound execution remains read-only; it never promotes.\n", flow.method, flow.request, flow.response, flow.runtime_module
    ));
    emit_transaction_flow(
        output,
        TransactionFlow {
            inbound: TransactionInbound::KnownInbound,
            shared_root_ownership_seam: false,
            ..flow
        },
    );
    output.push_str("        } else {\n            // Fresh shared roots are deliberately read-only until the local\n            // ownership seam can use start_local(SharedUpgradeable) together\n            // with a coordinator completion API. Do not promote here.\n");
    emit_transaction_flow(
        output,
        TransactionFlow {
            inbound: TransactionInbound::KnownFreshRoot,
            shared_root_ownership_seam: true,
            ..flow
        },
    );
    output.push_str("        }\n    }\n");
}

#[derive(Clone, Copy)]
enum TransactionInbound {
    Dynamic,
    KnownInbound,
    KnownFreshRoot,
}

#[derive(Clone, Copy)]
struct TransactionFlow<'a> {
    method: &'a str,
    request: &'a str,
    response: &'a str,
    method_identity: &'a str,
    state: &'a str,
    declaration: &'a str,
    runtime_module: &'a str,
    mode: &'a str,
    factory: bool,
    inbound: TransactionInbound,
    shared_root_ownership_seam: bool,
}

/// Renders one complete execution flow. The caller owns the outer method and,
/// for shared methods, selects the already-validated inbound or fresh-root path.
fn emit_transaction_flow(output: &mut String, flow: TransactionFlow<'_>) {
    let TransactionFlow {
        method,
        request: _,
        response,
        method_identity,
        state,
        declaration,
        runtime_module,
        mode,
        factory,
        inbound,
        shared_root_ownership_seam,
    } = flow;
    let (context, transaction_path, automatic_idempotency, participant_metadata, returned_participants, completion) = match inbound {
        TransactionInbound::Dynamic => (
            format!("let mut context = if inbound {{ let inbound_context = {runtime_module}::runtime::InboundTransactionContext::from_headers(headers, {runtime_module}::runtime::TransactionMode::{mode}).map_err(|error| tonic::Status::invalid_argument(error.to_string()))?; let child_id = self.root_start.next_inbound_transaction(&inbound_context)?; inbound_context.with_nested_transaction_id(child_id).map_err(|error| tonic::Status::invalid_argument(error.to_string()))? }} else {{ {runtime_module}::runtime::start_root_transaction(headers, <{declaration} as {runtime_module}::runtime::DurableStateDeclaration>::STATE_TYPE, {runtime_module}::runtime::TransactionMode::{mode}, self.root_start.as_ref())?.transaction().clone() }};"),
            format!("if inbound {{ {runtime_module}::durable_participant::TransactionPathContract::PreserveNested }} else {{ {runtime_module}::durable_participant::TransactionPathContract::RootOnly }}"),
            format!("if !inbound && context.headers().idempotency_key.is_some() && matches!({runtime_module}::runtime::TransactionMode::{mode}, {runtime_module}::runtime::TransactionMode::Exclusive)"),
            format!("inbound.then(|| {runtime_module}::successful_trailers::ParticipantMetadata::classified_single(<{declaration} as {runtime_module}::runtime::DurableStateDeclaration>::STATE_TYPE, &context.headers().state_ref, false, context.headers().coordinator_read_only_aware)).transpose().map_err(|error| tonic::Status::failed_precondition(error.to_string()))?"),
            "if inbound { Vec::new() } else { context.take_returned_participants() }".to_owned(),
            "if let Some(metadata) = participant_metadata { reboot_metadata } else { coordinator_completion }".to_owned(),
        ),
        TransactionInbound::KnownInbound => (
            format!("let mut context = {{ let inbound_context = {runtime_module}::runtime::InboundTransactionContext::from_headers(headers, {runtime_module}::runtime::TransactionMode::{mode}).map_err(|error| tonic::Status::invalid_argument(error.to_string()))?; let child_id = self.root_start.next_inbound_transaction(&inbound_context)?; inbound_context.with_nested_transaction_id(child_id).map_err(|error| tonic::Status::invalid_argument(error.to_string()))? }};"),
            format!("{runtime_module}::durable_participant::TransactionPathContract::PreserveNested"),
            "if false".to_owned(),
            format!("Some({runtime_module}::successful_trailers::ParticipantMetadata::classified_single(<{declaration} as {runtime_module}::runtime::DurableStateDeclaration>::STATE_TYPE, &context.headers().state_ref, true, context.headers().coordinator_read_only_aware).map_err(|error| tonic::Status::failed_precondition(error.to_string()))?)"),
            "Vec::new()".to_owned(),
            "if let Some(metadata) = participant_metadata { reboot_metadata } else { coordinator_completion }".to_owned(),
        ),
        TransactionInbound::KnownFreshRoot => (
            format!("let mut context = {runtime_module}::runtime::start_root_transaction(headers, <{declaration} as {runtime_module}::runtime::DurableStateDeclaration>::STATE_TYPE, {runtime_module}::runtime::TransactionMode::{mode}, self.root_start.as_ref())?.transaction().clone();"),
            format!("{runtime_module}::durable_participant::TransactionPathContract::RootOnly"),
            "if false".to_owned(),
            "None".to_owned(),
            "context.take_returned_participants()".to_owned(),
            "if let Some(metadata) = participant_metadata { reboot_metadata } else { coordinator_completion }".to_owned(),
        ),
    };
    let prefix = if matches!(inbound, TransactionInbound::Dynamic) {
        "        "
    } else {
        "            "
    };
    let read_only = mode == "Shared";
    output.push_str(&format!("{prefix}{context}\n{prefix}if {read_only} {{ context.enable_read_only_aware(); }}\n{prefix}let transaction_id = context.transaction_root_id();\n{prefix}let automatic_idempotency = {automatic_idempotency} {{ Some(context.idempotency(\"{method_identity}\", request.get_ref())?) }} else {{ None }};\n{prefix}if let Some(idempotency) = &automatic_idempotency {{ let recovered = self.participant.sidecar().recover_idempotent_mutations({runtime_module}::database_proto::RecoverIdempotentMutationsRequest {{ state_type: <{declaration} as {runtime_module}::runtime::DurableStateDeclaration>::STATE_TYPE.to_owned(), state_ref: context.headers().state_ref.clone(), idempotency_key: Some(idempotency.key().as_bytes().to_vec()), workflow_id: None, workflow_iteration: None }}).await?; for recovered in recovered {{ for mutation in recovered.idempotent_mutations {{ if let Some(response) = idempotency.replay::<proto::{response}>(&mutation)? {{ return Ok(tonic::Response::new(response)); }} }} }} }}\n"));
    output.push_str(&format!("{prefix}let participant_metadata = {participant_metadata};\n{prefix}let loaded = self.participant.start({runtime_module}::durable_participant::ActorTransactionStart {{ transaction_ids: context.transaction_ids().to_vec(), transaction_path: {transaction_path}, coordinator_state_type: context.transaction_coordinator_state_type().to_owned(), coordinator_state_ref: context.transaction_coordinator_state_ref().to_owned(), mode: {runtime_module}::runtime::TransactionMode::{mode}, read_only: {read_only}, factory: {factory}, state_type: <{declaration} as {runtime_module}::runtime::DurableStateDeclaration>::STATE_TYPE.to_owned(), state_ref: context.headers().state_ref.clone() }}).await?;\n{prefix}// A duplicate may have waited for local actor admission while the original\n{prefix}// root transaction committed. Re-check durable replay before invoking the handler.\n{prefix}if let Some(idempotency) = &automatic_idempotency {{ let replay_after_admission = async {{ let recovered = self.participant.sidecar().recover_idempotent_mutations({runtime_module}::database_proto::RecoverIdempotentMutationsRequest {{ state_type: <{declaration} as {runtime_module}::runtime::DurableStateDeclaration>::STATE_TYPE.to_owned(), state_ref: context.headers().state_ref.clone(), idempotency_key: Some(idempotency.key().as_bytes().to_vec()), workflow_id: None, workflow_iteration: None }}).await?; for recovered in recovered {{ for mutation in recovered.idempotent_mutations {{ if let Some(response) = idempotency.replay::<proto::{response}>(&mutation)? {{ return Ok(Some(response)); }} }} }} Ok::<Option<proto::{response}>, tonic::Status>(None) }}.await; match replay_after_admission {{ Ok(Some(response)) => {{ self.participant.abort(transaction_id).await?; return Ok(tonic::Response::new(response)); }}, Ok(None) => {{}}, Err(error) => {{ self.participant.abort(transaction_id).await?; return Err(error); }} }} }}\n{prefix}let mut state = match loaded {{ Some(_) if {factory} => {{ self.participant.abort(transaction_id).await?; return Err(tonic::Status::failed_precondition(\"factory transaction requires an absent actor state\")); }}, Some(bytes) => match <proto::{state} as prost::Message>::decode(bytes.as_slice()) {{ Ok(state) => state, Err(error) => {{ self.participant.abort(transaction_id).await?; return Err(tonic::Status::failed_precondition(format!(\"stored actor state is not a valid {state}: {{error}}\"))); }} }}, None if {factory} => proto::{state}::default(), None => {{ self.participant.abort(transaction_id).await?; return Err(tonic::Status::failed_precondition(\"non-factory transaction requires an existing actor state\")); }} }};\n"));
    output.push_str(&format!("{prefix}let execution = match self.handler.{method}(&context, &mut state, request.into_inner()).await {{ Ok(execution) => execution, Err(error) => {{ self.participant.abort(transaction_id).await?; return Err(error); }} }};\n{prefix}if automatic_idempotency.is_some() && !execution.idempotent_mutations.is_empty() {{ self.participant.abort(transaction_id).await?; return Err(tonic::Status::failed_precondition(\"root-local idempotency stages exactly one automatic mutation\")); }}\n{prefix}let automatic_mutations = automatic_idempotency.as_ref().map(|idempotency| idempotency.mutation(<{declaration} as {runtime_module}::runtime::DurableStateDeclaration>::STATE_TYPE, context.headers().state_ref.clone(), &execution.response)).into_iter().collect::<Vec<_>>();\n{prefix}if let Err(error) = self.participant.stage(transaction_id, {runtime_module}::durable_participant::PendingActorEffects {{ state: if {factory} {{ execution.final_state.clone().or_else(|| Some(<proto::{state} as prost::Message>::encode_to_vec(&state))) }} else {{ execution.final_state.clone() }}, task_upserts: execution.task_upserts.clone(), idempotent_mutations: if automatic_idempotency.is_some() {{ automatic_mutations }} else {{ execution.idempotent_mutations.clone() }} }}).await {{ self.participant.abort(transaction_id).await?; return Err(error); }}\n"));
    if shared_root_ownership_seam {
        output.push_str(&format!("{prefix}// Local-only shared-root ownership is intentionally not activated: the\n{prefix}// current coordinator accepts only the read-only shared classification.\n"));
    }
    let completion = completion
        .replace(
            "reboot_metadata",
            &format!(
                "{runtime_module}::successful_trailers::stage_successful_participants(&mut response, metadata);"
            ),
        )
        .replace(
            "coordinator_completion",
            &format!(
                "self.coordinator.complete_with_classified_returned_participants({runtime_module}::durable_coordinator::RootCoordinatorStart {{ transaction_ids: context.transaction_ids().to_vec(), coordinator_state_type: context.transaction_coordinator_state_type().to_owned(), coordinator_state_ref: context.transaction_coordinator_state_ref().to_owned(), participant: {runtime_module}::durable_coordinator::ParticipantTarget {{ state_type: <{declaration} as {runtime_module}::runtime::DurableStateDeclaration>::STATE_TYPE.to_owned(), state_ref: context.headers().state_ref.clone() }}, mode: {runtime_module}::runtime::TransactionMode::{mode}, read_only: {read_only}, factory: {factory}, placement_requested: false }}, returned_participants).await?;"
            ),
        );
    output.push_str(&format!("{prefix}let returned_participants = {returned_participants};\n{prefix}let mut response = tonic::Response::new(execution.response);\n{prefix}{completion}\n{prefix}Ok(response)\n"));
}

fn emit_transactions(
    output: &mut String,
    service_name: &str,
    state: &str,
    runtime_module: &str,
    methods: &[(&DurableKind, String, String, String, String)],
    database_methods: &[&(&DurableKind, String, String, String, String)],
) -> Result<(), String> {
    let transactions: Vec<_> = methods
        .iter()
        .filter(|(kind, _, _, _, _)| matches!(kind, DurableKind::Transaction(_)))
        .collect();
    if transactions.is_empty() {
        return Ok(());
    }
    let handler = format!("{service_name}TransactionHandler");
    let adapter = format!("{service_name}TransactionAdapter");
    let declaration = format!("{state}DurableState");
    let server = format!("{}_server", snake_case(service_name));
    output.push_str("#[tonic::async_trait]\n");
    output.push_str(&format!("pub trait {handler}: Send + Sync + 'static {{\n"));
    for (kind, method, request, response, _) in database_methods {
        output.push_str(&format!("    async fn {method}(&self, state: {}proto::{state}, request: proto::{request}) -> Result<proto::{response}, tonic::Status>;\n", if matches!(**kind, DurableKind::Writer(_)) { "&mut " } else { "&" }));
    }
    for (kind, method, request, response, _) in &transactions {
        let metadata = match kind {
            DurableKind::Transaction(metadata) => metadata,
            _ => unreachable!("transactions are filtered above"),
        };
        let mode = match metadata.mode {
            TransactionMode::Exclusive => "Exclusive",
            TransactionMode::Shared => "Shared",
        };
        let factory = if metadata.factory { "yes" } else { "no" };
        output.push_str(&format!("    /// Transaction mode declared by this RPC: {mode}.\n    /// Factory transaction declared by this RPC: {factory}.\n    async fn {method}(&self, context: &{runtime_module}::runtime::TransactionContext, state: &mut proto::{state}, request: proto::{request}) -> Result<{runtime_module}::runtime::TransactionExecution<proto::{response}>, tonic::Status>;\n"));
    }
    output.push_str("}\n\n");
    let (store_field, store_clone, store_argument, store_init, participant_bind) =
        if database_methods.is_empty() {
            (
                String::new(),
                String::new(),
                String::new(),
                String::new(),
                String::new(),
            )
        } else {
            (
                format!("store: {runtime_module}::runtime::DatabaseActorStore, "),
                "store: self.store.clone(), ".to_owned(),
                format!("store: {runtime_module}::runtime::DatabaseActorStore, "),
                "store, ".to_owned(),
                "let participant = participant.with_database_actor_gate(&store); ".to_owned(),
            )
        };
    output.push_str(&format!("/// Executable Tonic adapter for one fresh, same-actor exclusive root transaction or one validated inbound nested transaction.\n///\n/// The host must inject the participant sidecar, coordinator sidecar, resolver,\n/// and transaction-start factory. Inbound calls receive a host-supplied child ID,\n/// stage only their local participant, and return it through the successful trailer seam; they never drive the root coordinator. This adapter does not choose routing, placement, a clock, or a transaction UUID.\npub struct {adapter}<H, P, C, R, F> where P: {runtime_module}::durable_participant::ParticipantSidecar, C: {runtime_module}::durable_coordinator::CoordinatorSidecar, R: {runtime_module}::durable_coordinator::ParticipantResolver, F: {runtime_module}::runtime::RootTransactionStartFactory + {runtime_module}::runtime::InboundTransactionStartFactory {{ {store_field}handler: std::sync::Arc<H>, participant: {runtime_module}::durable_participant::DurableActorParticipant<P>, coordinator: {runtime_module}::durable_coordinator::DurableRootCoordinator<C, R>, root_start: std::sync::Arc<F> }}\nimpl<H, P, C, R, F> Clone for {adapter}<H, P, C, R, F> where P: {runtime_module}::durable_participant::ParticipantSidecar, C: {runtime_module}::durable_coordinator::CoordinatorSidecar, R: {runtime_module}::durable_coordinator::ParticipantResolver, F: {runtime_module}::runtime::RootTransactionStartFactory + {runtime_module}::runtime::InboundTransactionStartFactory {{ fn clone(&self) -> Self {{ Self {{ {store_clone}handler: self.handler.clone(), participant: self.participant.clone(), coordinator: {runtime_module}::durable_coordinator::DurableRootCoordinator::new(self.coordinator.sidecar(), self.coordinator.resolver()), root_start: self.root_start.clone() }} }} }}\nimpl<H, P, C, R, F> {adapter}<H, P, C, R, F> where P: {runtime_module}::durable_participant::ParticipantSidecar, C: {runtime_module}::durable_coordinator::CoordinatorSidecar, R: {runtime_module}::durable_coordinator::ParticipantResolver, F: {runtime_module}::runtime::RootTransactionStartFactory + {runtime_module}::runtime::InboundTransactionStartFactory {{ pub fn new({store_argument}participant: {runtime_module}::durable_participant::DurableActorParticipant<P>, coordinator: {runtime_module}::durable_coordinator::DurableRootCoordinator<C, R>, root_start: F, handler: H) -> Self {{ {participant_bind}Self {{ {store_init}handler: std::sync::Arc::new(handler), participant, coordinator, root_start: std::sync::Arc::new(root_start) }} }} }}\n\n"));
    output.push_str("#[tonic::async_trait]\n");
    output.push_str(&format!("impl<H, P, C, R, F> proto::{server}::{service_name} for {adapter}<H, P, C, R, F> where H: {handler}, P: {runtime_module}::durable_participant::ParticipantSidecar, C: {runtime_module}::durable_coordinator::CoordinatorSidecar, R: {runtime_module}::durable_coordinator::ParticipantResolver, F: {runtime_module}::runtime::RootTransactionStartFactory + {runtime_module}::runtime::InboundTransactionStartFactory {{\n"));
    let requires_constructor = !database_methods.is_empty()
        && database_methods.iter().any(|(kind, _, _, _, _)| {
            matches!(
                **kind,
                DurableKind::Writer(WriterMetadata { constructor: true })
            )
        });
    for (kind, method, request, response, method_identity) in database_methods {
        let (envelope, prefix) = match kind {
            DurableKind::Writer(WriterMetadata { constructor: true }) => (
                "constructor_writer_async_for_method",
                format!("\"{method_identity}\", "),
            ),
            DurableKind::Reader if requires_constructor => (
                "reader_async_for_with_admission",
                format!("{runtime_module}::runtime::StateAdmission::RequireExisting, "),
            ),
            DurableKind::Reader => ("reader_async_for", String::new()),
            DurableKind::Writer(_) if requires_constructor => (
                "writer_async_for_method_with_admission",
                format!(
                    "\"{method_identity}\", {runtime_module}::runtime::StateAdmission::RequireExisting, "
                ),
            ),
            DurableKind::Writer(_) => (
                "writer_async_for_method",
                format!("\"{method_identity}\", "),
            ),
            DurableKind::Transaction(_) => unreachable!("transactions are filtered above"),
        };
        output.push_str(&format!("    async fn {method}(&self, request: tonic::Request<proto::{request}>) -> Result<tonic::Response<proto::{response}>, tonic::Status> {{\n        let handler = self.handler.clone();\n        self.store.{envelope}::<{declaration}, _, _, _>(\n            {prefix}request, move |state, request| {{\n                let handler = handler.clone();\n                Box::pin(async move {{ handler.{method}(state, request).await }})\n            }},\n        ).await\n    }}\n"));
    }
    for (kind, method, request, response, method_identity) in transactions {
        let metadata = match kind {
            DurableKind::Transaction(metadata) => metadata,
            _ => unreachable!("transactions are filtered above"),
        };
        let flow = TransactionFlow {
            method,
            request,
            response,
            method_identity,
            state,
            declaration: &declaration,
            runtime_module,
            mode: match metadata.mode {
                TransactionMode::Exclusive => "Exclusive",
                TransactionMode::Shared => "Shared",
            },
            factory: metadata.factory,
            inbound: TransactionInbound::Dynamic,
            shared_root_ownership_seam: false,
        };
        match metadata.mode {
            TransactionMode::Exclusive => emit_exclusive_transaction_method(output, flow),
            TransactionMode::Shared if metadata.factory => output.push_str(&format!(
                "    async fn {method}(&self, _: tonic::Request<proto::{request}>) -> Result<tonic::Response<proto::{response}>, tonic::Status> {{ Err(tonic::Status::unimplemented(\"factory shared transactions are not supported\")) }}\n"
            )),
            TransactionMode::Shared => emit_shared_transaction_method(output, flow),
        }
    }
    output.push_str("}\n\n");
    Ok(())
}

fn reject_method_name_collisions(
    file: &str,
    service: &str,
    methods: &[MethodDescriptorProto],
) -> Result<(), String> {
    let mut rendered = std::collections::HashMap::new();
    for method in methods {
        let protobuf_name = required(&method.name, "method name")?;
        let rust_name = snake_case(protobuf_name);
        if !is_generated_rust_identifier(&rust_name) {
            return Err(format!(
                "{file}: service `{service}` method `{protobuf_name}` renders as Rust keyword `{rust_name}`"
            ));
        }
        if let Some(previous) = rendered.insert(rust_name.clone(), protobuf_name) {
            return Err(format!(
                "{file}: service `{service}` methods `{previous}` and `{protobuf_name}` both render as Rust method `{rust_name}`"
            ));
        }
    }
    Ok(())
}

fn method_types(
    file: &str,
    package: &str,
    service: &str,
    method: &MethodDescriptorProto,
) -> Result<(String, String, String), String> {
    let name = required(&method.name, "method name")?;
    if method.client_streaming.unwrap_or(false) || method.server_streaming.unwrap_or(false) {
        return Err(format!(
            "{file}: service `{service}` method `{name}` is streaming; only unary methods are supported"
        ));
    }
    Ok((
        snake_case(name),
        same_package_type(file, package, service, name, "request", &method.input_type)?,
        same_package_type(
            file,
            package,
            service,
            name,
            "response",
            &method.output_type,
        )?,
    ))
}
fn same_package_type(
    file: &str,
    package: &str,
    service: &str,
    method: &str,
    kind: &str,
    value: &Option<String>,
) -> Result<String, String> {
    Ok(same_package_proto_type(file, package, service, method, kind, value)?.to_upper_camel_case())
}

fn same_package_proto_type<'a>(
    file: &str,
    package: &str,
    service: &str,
    method: &str,
    kind: &str,
    value: &'a Option<String>,
) -> Result<&'a str, String> {
    let type_name = required(value, "method type")?;
    let prefix = format!(".{package}.");
    let Some(name) = type_name.strip_prefix(&prefix) else {
        return Err(format!(
            "{file}: service `{service}` method `{method}` has {kind} type `{type_name}` outside package `{package}`"
        ));
    };
    if !is_identifier(name) {
        return Err(format!(
            "{file}: service `{service}` method `{method}` has unsupported {kind} type `{type_name}`; nested or invalid types are not supported"
        ));
    }
    Ok(name)
}
fn output_name(file: &str) -> Result<String, String> {
    file.strip_suffix(".proto")
        .map(|stem| format!("{stem}.reboot.rs"))
        .ok_or_else(|| format!("file `{file}` does not end in `.proto`"))
}
fn required<'a>(value: &'a Option<String>, label: &str) -> Result<&'a str, String> {
    value
        .as_deref()
        .filter(|value| !value.is_empty())
        .ok_or_else(|| format!("missing {label}"))
}
fn is_identifier(value: &str) -> bool {
    let mut characters = value.chars();
    matches!(characters.next(), Some(character) if character == '_' || character.is_ascii_alphabetic())
        && characters.all(|character| character == '_' || character.is_ascii_alphanumeric())
}
fn is_generated_rust_identifier(value: &str) -> bool {
    is_identifier(value) && !is_rust_keyword(value)
}

fn is_rust_keyword(value: &str) -> bool {
    matches!(
        value,
        "as" | "async"
            | "await"
            | "break"
            | "const"
            | "continue"
            | "crate"
            | "dyn"
            | "else"
            | "enum"
            | "extern"
            | "false"
            | "fn"
            | "for"
            | "if"
            | "impl"
            | "in"
            | "let"
            | "loop"
            | "match"
            | "mod"
            | "move"
            | "mut"
            | "pub"
            | "ref"
            | "return"
            | "self"
            | "Self"
            | "static"
            | "struct"
            | "super"
            | "trait"
            | "true"
            | "try"
            | "type"
            | "union"
            | "unsafe"
            | "use"
            | "where"
            | "while"
            | "gen"
            | "abstract"
            | "become"
            | "box"
            | "do"
            | "final"
            | "macro"
            | "override"
            | "priv"
            | "typeof"
            | "unsized"
            | "virtual"
            | "yield"
    )
}

pub(crate) fn is_module_path(value: &str) -> bool {
    !value.is_empty() && value.split("::").all(is_identifier)
}
fn parse_modules(parameter: Option<&str>) -> Result<(&str, &str), String> {
    let parameter = parameter.unwrap_or_default();
    let mut module = None;
    let mut runtime_module = None;
    let mut unsupported = None;
    for option in parameter.split(',') {
        if let Some(value) = option.strip_prefix(MODULE_PARAMETER_PREFIX) {
            if module.replace(value).is_some() || !is_module_path(value) {
                return Err(
                    "protoc-gen-reboot_rust requires a valid `module=<Rust path>` parameter"
                        .to_owned(),
                );
            }
        } else if let Some(value) = option.strip_prefix(RUNTIME_MODULE_PARAMETER_PREFIX) {
            if runtime_module.replace(value).is_some() || !is_module_path(value) {
                return Err(
                    "protoc-gen-reboot_rust requires a valid `runtime_module=<Rust path>` parameter"
                        .to_owned(),
                );
            }
        } else {
            unsupported = Some(option);
        }
    }
    let module = module.ok_or_else(|| {
        "protoc-gen-reboot_rust requires a valid `module=<Rust path>` parameter".to_owned()
    })?;
    if let Some(option) = unsupported {
        return Err(format!(
            "protoc-gen-reboot_rust received unsupported parameter `{option}`"
        ));
    }
    Ok((module, runtime_module.unwrap_or(DEFAULT_RUNTIME_MODULE)))
}
fn snake_case(value: &str) -> String {
    value.to_snake_case()
}

#[cfg(test)]
mod tests {
    use super::*;
    use prost_types::{FileDescriptorProto, MethodDescriptorProto, ServiceDescriptorProto};
    fn request() -> CodeGeneratorRequest {
        CodeGeneratorRequest {
            parameter: Some("module=reboot_rust_schema::proto".into()),
            file_to_generate: vec!["counter.proto".into()],
            proto_file: vec![FileDescriptorProto {
                name: Some("counter.proto".into()),
                package: Some("tests.reboot.protoc".into()),
                syntax: Some("proto3".into()),
                service: vec![ServiceDescriptorProto {
                    name: Some("CounterWritesMethods".into()),
                    method: vec![MethodDescriptorProto {
                        name: Some("Increment".into()),
                        input_type: Some(".tests.reboot.protoc.IncrementRequest".into()),
                        output_type: Some(".tests.reboot.protoc.CounterValue".into()),
                        ..Default::default()
                    }],
                    ..Default::default()
                }],
                ..Default::default()
            }],
            ..Default::default()
        }
    }
    #[test]
    fn generates_forwarding_adapter_without_options() {
        let content = generate(request()).file.remove(0).content.unwrap();
        assert!(content.contains("CounterWritesMethodsHandler"));
        assert!(content.contains("self.handler.increment(request).await"));
    }

    #[test]
    fn rejects_non_proto3_generated_files_except_descriptor_proto() {
        let mut proto2 = request();
        proto2.proto_file[0].syntax = Some("proto2".to_owned());
        assert_eq!(
            generate_from_wire(&proto2.encode_to_vec()).error.as_deref(),
            Some(
                "Unsupported: not a proto3 file. Reboot only supports proto files that set 'syntax=\"proto3\";', but got 'syntax=\"proto2\";'"
            )
        );

        let mut descriptor = request();
        descriptor.proto_file[0].name = Some("google/protobuf/descriptor.proto".to_owned());
        descriptor.file_to_generate = vec!["google/protobuf/descriptor.proto".to_owned()];
        descriptor.proto_file[0].package = Some("google.protobuf".to_owned());
        descriptor.proto_file[0].service.clear();
        descriptor.proto_file[0].syntax = None;
        assert!(
            generate_from_wire(&descriptor.encode_to_vec())
                .error
                .is_none()
        );
    }

    #[test]
    fn raw_plugin_validates_package_paths_only_for_files_to_generate() {
        let request = |file_to_generate: &str| CodeGeneratorRequest {
            parameter: Some("module=reboot_rust_schema::proto".to_owned()),
            file_to_generate: vec![file_to_generate.to_owned()],
            proto_file: vec![
                FileDescriptorProto {
                    name: Some("tests/reboot/protoc/main.proto".to_owned()),
                    package: Some("tests.reboot.protoc".to_owned()),
                    syntax: Some("proto3".to_owned()),
                    ..Default::default()
                },
                FileDescriptorProto {
                    name: Some("dependency.proto".to_owned()),
                    package: Some("wrong.package".to_owned()),
                    syntax: Some("proto3".to_owned()),
                    ..Default::default()
                },
            ],
            ..Default::default()
        };

        assert!(
            generate_from_wire(&request("tests/reboot/protoc/main.proto").encode_to_vec())
                .error
                .is_none()
        );
        assert_eq!(
            generate_from_wire(&request("dependency.proto").encode_to_vec())
                .error
                .as_deref(),
            Some(
                "Proto file 'dependency.proto' has package 'wrong.package', but based on the file's path the expected package was ''. 'rbt generate' expects the package to match the directory structure. Check that the API base directory is correct, and if so, adjust either the proto file's location or its package."
            )
        );
    }

    #[test]
    fn raw_plugin_rejects_illegal_package_directory_components() {
        let request = CodeGeneratorRequest {
            parameter: Some("module=reboot_rust_schema::proto".to_owned()),
            file_to_generate: vec!["tests/reboot-v1/counter.proto".to_owned()],
            proto_file: vec![FileDescriptorProto {
                name: Some("tests/reboot-v1/counter.proto".to_owned()),
                package: Some("tests.reboot_v1".to_owned()),
                syntax: Some("proto3".to_owned()),
                ..Default::default()
            }],
            ..Default::default()
        };
        assert_eq!(
            generate_from_wire(&request.encode_to_vec())
                .error
                .as_deref(),
            Some(
                "Proto file 'tests/reboot-v1/counter.proto' is located in a directory 'tests/reboot-v1' that is not a legal 'proto3' package name component. Legal characters are letters, numbers, and underscore. Reboot requires that the directory structure matches the proto file's package name. Please rename your directory."
            )
        );
    }
    #[test]
    fn rejects_missing_or_invalid_module_parameter() {
        for parameter in [
            None,
            Some("module=other::9invalid".to_owned()),
            Some("not-module=downstream::wire".to_owned()),
        ] {
            let mut value = request();
            value.parameter = parameter;
            assert!(
                generate(value)
                    .error
                    .unwrap()
                    .contains("module=<Rust path>")
            );
        }
    }

    #[test]
    fn runtime_module_parameter_controls_durable_import_and_defaults() {
        let annotations = HashMap::from([(
            "counter.proto".to_owned(),
            HashMap::from([(
                "CounterWritesMethods".to_owned(),
                DurableService {
                    state: "Counter".to_owned(),
                    default_constructible: true,
                    methods: HashMap::from([(
                        "Increment".to_owned(),
                        DurableKind::Writer(WriterMetadata { constructor: false }),
                    )]),
                },
            )]),
        )]);
        let mut custom = request();
        custom.parameter = Some("module=crate::proto,runtime_module=reboot".into());
        assert!(
            generate_inner(custom, annotations.clone())
                .unwrap()
                .remove(0)
                .content
                .unwrap()
                .contains("store: reboot::runtime::DatabaseActorStore")
        );
        assert!(
            generate_inner(request(), annotations)
                .unwrap()
                .remove(0)
                .content
                .unwrap()
                .contains("store: reboot_rust_schema::runtime::DatabaseActorStore")
        );
    }

    #[test]
    fn durable_state_type_is_canonical_for_relative_and_qualified_annotations() {
        for annotation_state in [
            "Counter",
            "tests.reboot.protoc.Counter",
            ".tests.reboot.protoc.Counter",
        ] {
            let annotations = HashMap::from([(
                "counter.proto".to_owned(),
                HashMap::from([(
                    "CounterWritesMethods".to_owned(),
                    DurableService {
                        state: annotation_state.to_owned(),
                        default_constructible: true,
                        methods: HashMap::from([(
                            "Increment".to_owned(),
                            DurableKind::Writer(WriterMetadata { constructor: false }),
                        )]),
                    },
                )]),
            )]);
            let content = generate_inner(request(), annotations)
                .unwrap()
                .remove(0)
                .content
                .unwrap();
            assert!(content.contains("pub struct CounterDurableState;"));
            assert!(content.contains("type State = proto::Counter;"));
            assert!(
                content
                    .contains("const STATE_TYPE: &'static str = \"tests.reboot.protoc.Counter\";")
            );
            assert!(content.contains("store.writer_async_for_method::<CounterDurableState"));
            assert!(
                content.contains("\"tests.reboot.protoc.CounterWritesMethods.Increment\", request")
            );
            assert!(!content.contains("\"Counter\", request"));
        }
    }

    #[test]
    fn annotated_service_requires_every_method_to_have_a_reboot_annotation() {
        let service_options = ExtensionOptions {
            reboot: Some(
                RebootServiceOptions {
                    state: "Counter".to_owned(),
                    default_constructible: true,
                }
                .encode_to_vec(),
            ),
        }
        .encode_to_vec();

        for method_options in [
            None,
            Some(ExtensionOptions { reboot: None }.encode_to_vec()),
        ] {
            let error = match annotations(vec![RawFile {
                name: Some("counter.proto".to_owned()),
                package: None,
                messages: vec![],
                services: vec![RawService {
                    name: Some("CounterMethods".to_owned()),
                    options: Some(service_options.clone()),
                    methods: vec![RawMethod {
                        name: Some("Increment".to_owned()),
                        options: method_options,
                    }],
                }],
            }]) {
                Err(error) => error,
                Ok(_) => panic!("unannotated Reboot method unexpectedly accepted"),
            };
            assert_eq!(
                error,
                "counter.proto: Missing Reboot method annotation for `CounterMethods/Increment`"
            );
        }
    }

    #[test]
    fn raw_descriptor_rejects_annotated_reboot_service_without_rpcs() {
        let service_options = ExtensionOptions {
            reboot: Some(
                RebootServiceOptions {
                    state: "Counter".to_owned(),
                    default_constructible: false,
                }
                .encode_to_vec(),
            ),
        }
        .encode_to_vec();
        // Build the raw descriptor field separately: `prost_types` discards
        // custom option extensions, while the executable plugin retains them
        // through its second RawRequest decode.
        let mut wire = CodeGeneratorRequest {
            parameter: Some("module=reboot_rust_schema::proto".to_owned()),
            file_to_generate: vec!["tests/reboot/protoc/counter.proto".to_owned()],
            proto_file: vec![FileDescriptorProto {
                name: Some("tests/reboot/protoc/counter.proto".to_owned()),
                package: Some("tests.reboot.protoc".to_owned()),
                syntax: Some("proto3".to_owned()),
                service: vec![ServiceDescriptorProto {
                    name: Some("CounterMethods".to_owned()),
                    method: vec![],
                    ..Default::default()
                }],
                ..Default::default()
            }],
            ..Default::default()
        }
        .encode_to_vec();
        // The second raw file is also decoded by `CodeGeneratorRequest`; add
        // its standard `FileDescriptorProto.syntax` field so it remains a
        // valid proto3 descriptor rather than shadowing the first descriptor
        // with an unset syntax in this synthetic raw-option fixture.
        let mut raw_file = RawFile {
            name: Some("tests/reboot/protoc/counter.proto".to_owned()),
            package: Some("tests.reboot.protoc".to_owned()),
            messages: vec![],
            services: vec![RawService {
                name: Some("CounterMethods".to_owned()),
                options: Some(service_options),
                methods: vec![],
            }],
        }
        .encode_to_vec();
        raw_file.extend([0x62, 0x06, b'p', b'r', b'o', b't', b'o', b'3']);
        wire.push(0x7a); // CodeGeneratorRequest.proto_file (field 15).
        wire.push(u8::try_from(raw_file.len()).expect("small raw test descriptor"));
        wire.extend(raw_file);
        let error = generate_from_wire(&wire).error.unwrap();
        assert_eq!(
            error,
            "Service 'CounterMethods' has no rpc methods specified. Complete your proto file."
        );
    }

    #[test]
    fn method_annotation_without_service_annotation_uses_methods_convention() {
        let method_options = ExtensionOptions {
            reboot: Some(
                RebootMethodOptions {
                    kind: Some(reboot_method_options::Kind::Writer(
                        RebootWriterMethodOptions::default(),
                    )),
                }
                .encode_to_vec(),
            ),
        }
        .encode_to_vec();
        // Round-trip the raw descriptor representation used by the plugin so
        // this does not rely on reflected extension registration.
        let raw = RawRequest {
            files: vec![RawFile {
                name: Some("counter.proto".to_owned()),
                package: None,
                messages: vec![],
                services: vec![RawService {
                    name: Some("CounterMethods".to_owned()),
                    options: None,
                    methods: vec![RawMethod {
                        name: Some("Increment".to_owned()),
                        options: Some(method_options),
                    }],
                }],
            }],
        }
        .encode_to_vec();
        let annotations = annotations(RawRequest::decode(raw.as_slice()).unwrap().files).unwrap();
        let service = &annotations["counter.proto"]["CounterMethods"];
        assert_eq!(service.state, "Counter");
        assert!(!service.default_constructible);
        assert!(matches!(
            service.methods["Increment"],
            DurableKind::Writer(WriterMetadata { constructor: false })
        ));
    }

    #[test]
    fn method_annotation_without_service_annotation_requires_methods_suffix() {
        let method_options = ExtensionOptions {
            reboot: Some(
                RebootMethodOptions {
                    kind: Some(reboot_method_options::Kind::Reader(
                        RebootReaderMethodOptions::default(),
                    )),
                }
                .encode_to_vec(),
            ),
        }
        .encode_to_vec();
        let error = match annotations(vec![RawFile {
            name: Some("counter.proto".to_owned()),
            package: None,
            messages: vec![],
            services: vec![RawService {
                name: Some("CounterReads".to_owned()),
                options: None,
                methods: vec![RawMethod {
                    name: Some("ReadCounter".to_owned()),
                    options: Some(method_options),
                }],
            }],
        }]) {
            Err(error) => error,
            Ok(_) => panic!("method-annotated non-Methods service unexpectedly accepted"),
        };
        assert_eq!(
            error,
            "Reboot service 'CounterReads' has illegal name: all Reboot service names must end in 'Methods', since (unlike basic gRPC) they provide methods to Reboot states"
        );
    }

    #[test]
    fn raw_plugin_accepts_unary_reader_with_default_state_option() {
        fn push_varint(output: &mut Vec<u8>, mut value: usize) {
            while value >= 0x80 {
                output.push((value as u8 & 0x7f) | 0x80);
                value >>= 7;
            }
            output.push(value as u8);
        }

        let method_options = ExtensionOptions {
            reboot: Some(
                RebootMethodOptions {
                    kind: Some(reboot_method_options::Kind::Reader(
                        RebootReaderMethodOptions {
                            state: ReaderState::Default as i32,
                        },
                    )),
                }
                .encode_to_vec(),
            ),
        }
        .encode_to_vec();
        let mut request = request();
        request.file_to_generate = vec!["tests/reboot/protoc/counter.proto".to_owned()];
        request.proto_file[0].name = Some("tests/reboot/protoc/counter.proto".to_owned());
        let mut wire = request.encode_to_vec();
        let mut raw_method = MethodDescriptorProto {
            name: Some("Increment".to_owned()),
            input_type: Some(".tests.reboot.protoc.IncrementRequest".to_owned()),
            output_type: Some(".tests.reboot.protoc.CounterValue".to_owned()),
            ..Default::default()
        }
        .encode_to_vec();
        raw_method.push(0x22); // MethodDescriptorProto.options (field 4).
        push_varint(&mut raw_method, method_options.len());
        raw_method.extend(method_options);
        let mut raw_service = ServiceDescriptorProto {
            name: Some("CounterWritesMethods".to_owned()),
            ..Default::default()
        }
        .encode_to_vec();
        raw_service.push(0x12); // ServiceDescriptorProto.method (field 2).
        push_varint(&mut raw_service, raw_method.len());
        raw_service.extend(raw_method);
        let mut raw_file = FileDescriptorProto {
            name: Some("tests/reboot/protoc/counter.proto".to_owned()),
            package: Some("tests.reboot.protoc".to_owned()),
            syntax: Some("proto3".to_owned()),
            ..Default::default()
        }
        .encode_to_vec();
        raw_file.push(0x32); // FileDescriptorProto.service (field 6).
        push_varint(&mut raw_file, raw_service.len());
        raw_file.extend(raw_service);
        wire.push(0x7a); // CodeGeneratorRequest.proto_file (field 15).
        push_varint(&mut wire, raw_file.len());
        wire.extend(raw_file);

        assert_eq!(generate_from_wire(&wire).error, None);
    }

    #[test]
    fn raw_plugin_rejects_unary_reader_with_streaming_state_option() {
        let method_options = ExtensionOptions {
            reboot: Some(
                RebootMethodOptions {
                    kind: Some(reboot_method_options::Kind::Reader(
                        RebootReaderMethodOptions {
                            state: ReaderState::Streaming as i32,
                        },
                    )),
                }
                .encode_to_vec(),
            ),
        }
        .encode_to_vec();
        let mut request = request();
        request.file_to_generate = vec!["tests/reboot/protoc/counter.proto".to_owned()];
        request.proto_file[0].name = Some("tests/reboot/protoc/counter.proto".to_owned());
        let mut wire = request.encode_to_vec();
        // Both decoders consume this overlay. The custom option is retained
        // only by RawRequest, while the ordinary syntax field remains proto3.
        let mut raw_file = RawFile {
            name: Some("tests/reboot/protoc/counter.proto".to_owned()),
            package: Some("tests.reboot.protoc".to_owned()),
            messages: vec![],
            services: vec![RawService {
                name: Some("CounterWritesMethods".to_owned()),
                options: None,
                methods: vec![RawMethod {
                    name: Some("Increment".to_owned()),
                    options: Some(method_options),
                }],
            }],
        }
        .encode_to_vec();
        raw_file.extend([0x62, 0x06, b'p', b'r', b'o', b't', b'o', b'3']);
        wire.push(0x7a); // CodeGeneratorRequest.proto_file (field 15).
        wire.push(u8::try_from(raw_file.len()).expect("small raw test descriptor"));
        wire.extend(raw_file);

        assert_eq!(
            generate_from_wire(&wire).error.as_deref(),
            Some(
                "tests/reboot/protoc/counter.proto: service `CounterWritesMethods` method `Increment` requests streaming state; only unary methods are supported"
            )
        );
    }

    #[test]
    fn raw_plugin_method_kind_oneof_keeps_the_last_wire_field() {
        fn push_varint(output: &mut Vec<u8>, mut value: usize) {
            while value >= 0x80 {
                output.push((value as u8 & 0x7f) | 0x80);
                value >>= 7;
            }
            output.push(value as u8);
        }

        // MethodOptions.kind is a oneof in rbt/v1alpha1/options.proto. Build
        // malformed raw bytes with a streaming reader followed by a writer:
        // Python's generated descriptor keeps the final writer declaration.
        let mut reboot_option = RebootMethodOptions {
            kind: Some(reboot_method_options::Kind::Reader(
                RebootReaderMethodOptions {
                    state: ReaderState::Streaming as i32,
                },
            )),
        }
        .encode_to_vec();
        let writer = RebootWriterMethodOptions::default().encode_to_vec();
        reboot_option.push(0x12); // MethodOptions.writer (field 2).
        push_varint(&mut reboot_option, writer.len());
        reboot_option.extend(writer);
        let method_options = ExtensionOptions {
            reboot: Some(reboot_option),
        }
        .encode_to_vec();

        let mut request = request();
        request.file_to_generate = vec!["tests/reboot/protoc/counter.proto".to_owned()];
        request.proto_file[0].name = Some("tests/reboot/protoc/counter.proto".to_owned());
        let mut wire = request.encode_to_vec();
        let mut method = MethodDescriptorProto {
            name: Some("Increment".to_owned()),
            input_type: Some(".tests.reboot.protoc.IncrementRequest".to_owned()),
            output_type: Some(".tests.reboot.protoc.CounterValue".to_owned()),
            ..Default::default()
        }
        .encode_to_vec();
        method.push(0x22); // MethodDescriptorProto.options (field 4).
        push_varint(&mut method, method_options.len());
        method.extend(method_options);
        let mut service = RawService {
            name: Some("CounterWritesMethods".to_owned()),
            methods: vec![],
            options: None,
        }
        .encode_to_vec();
        service.push(0x12); // ServiceDescriptorProto.method (field 2).
        push_varint(&mut service, method.len());
        service.extend(method);
        let mut raw_file = RawFile {
            name: Some("tests/reboot/protoc/counter.proto".to_owned()),
            package: Some("tests.reboot.protoc".to_owned()),
            messages: vec![],
            services: vec![],
        }
        .encode_to_vec();
        raw_file.push(0x32); // FileDescriptorProto.service (field 6).
        push_varint(&mut raw_file, service.len());
        raw_file.extend(service);
        // The overlay is also decoded by CodeGeneratorRequest; preserve the
        // ordinary field used by generated-file syntax validation.
        raw_file.extend([0x62, 0x06, b'p', b'r', b'o', b't', b'o', b'3']);
        wire.push(0x7a); // CodeGeneratorRequest.proto_file (field 15).
        push_varint(&mut wire, raw_file.len());
        wire.extend(raw_file);

        assert!(generate_from_wire(&wire).error.is_none());
    }

    #[test]
    fn annotated_reboot_method_must_start_with_uppercase() {
        let method_options = ExtensionOptions {
            reboot: Some(
                RebootMethodOptions {
                    kind: Some(reboot_method_options::Kind::Writer(
                        RebootWriterMethodOptions::default(),
                    )),
                }
                .encode_to_vec(),
            ),
        }
        .encode_to_vec();
        let error = match annotations(vec![RawFile {
            name: Some("counter.proto".to_owned()),
            package: None,
            messages: vec![],
            services: vec![RawService {
                name: Some("CounterMethods".to_owned()),
                options: Some(
                    ExtensionOptions {
                        reboot: Some(
                            RebootServiceOptions {
                                state: "Counter".to_owned(),
                                default_constructible: true,
                            }
                            .encode_to_vec(),
                        ),
                    }
                    .encode_to_vec(),
                ),
                methods: vec![RawMethod {
                    name: Some("increment".to_owned()),
                    options: Some(method_options),
                }],
            }],
        }]) {
            Err(error) => error,
            Ok(_) => panic!("lowercase Reboot method unexpectedly accepted"),
        };
        assert_eq!(
            error,
            "counter.proto: Reboot method `CounterMethods/increment` has illegal name: all Reboot RPC method names must start with an uppercase letter."
        );
    }

    #[test]
    fn raw_descriptors_reject_reserved_method_names_except_secret_methods() {
        let method_options = ExtensionOptions {
            reboot: Some(
                RebootMethodOptions {
                    kind: Some(reboot_method_options::Kind::Reader(
                        RebootReaderMethodOptions::default(),
                    )),
                }
                .encode_to_vec(),
            ),
        }
        .encode_to_vec();
        let raw = RawRequest {
            files: vec![RawFile {
                name: Some("counter.proto".to_owned()),
                package: Some("tests.reboot.protoc".to_owned()),
                messages: vec![],
                services: vec![RawService {
                    name: Some("CounterMethods".to_owned()),
                    options: None,
                    methods: vec![RawMethod {
                        name: Some("Read".to_owned()),
                        options: Some(method_options.clone()),
                    }],
                }],
            }],
        }
        .encode_to_vec();
        let error = match annotations(RawRequest::decode(raw.as_slice()).unwrap().files) {
            Err(error) => error,
            Ok(_) => panic!("reserved Reboot method unexpectedly accepted"),
        };
        assert_eq!(
            error,
            "counter.proto: Reboot method `tests.reboot.protoc.CounterMethods/Read` has illegal name: Read is reserved"
        );

        let secret_raw = RawRequest {
            files: vec![RawFile {
                name: Some("secrets.proto".to_owned()),
                package: Some("rbt.cloud.v1alpha1.secrets".to_owned()),
                messages: vec![],
                services: vec![RawService {
                    name: Some("SecretMethods".to_owned()),
                    options: None,
                    methods: vec![RawMethod {
                        name: Some("Read".to_owned()),
                        options: Some(method_options),
                    }],
                }],
            }],
        }
        .encode_to_vec();
        let parsed = annotations(RawRequest::decode(secret_raw.as_slice()).unwrap().files).unwrap();
        assert!(matches!(
            parsed["secrets.proto"]["SecretMethods"].methods["Read"],
            DurableKind::Reader
        ));
    }

    #[test]
    fn raw_plugin_rejects_google_api_http_only_on_reboot_methods() {
        fn push_varint(output: &mut Vec<u8>, mut value: usize) {
            while value >= 0x80 {
                output.push((value as u8 & 0x7f) | 0x80);
                value >>= 7;
            }
            output.push(value as u8);
        }

        fn request_with_http_method(reboot: bool) -> Vec<u8> {
            let mut method_options = if reboot {
                ExtensionOptions {
                    reboot: Some(
                        RebootMethodOptions {
                            kind: Some(reboot_method_options::Kind::Reader(
                                RebootReaderMethodOptions::default(),
                            )),
                        }
                        .encode_to_vec(),
                    ),
                }
                .encode_to_vec()
            } else {
                Vec::new()
            };
            // Presence is all Python's HasExtension check needs; the Rust
            // generator intentionally does not parse an HttpRule.
            method_options.extend(
                GoogleApiMethodOptions {
                    google_api_http: Some(vec![
                        0x12, 0x08, b'/', b'c', b'o', b'u', b'n', b't', b'e', b'r',
                    ]),
                }
                .encode_to_vec(),
            );

            let mut method = MethodDescriptorProto {
                name: Some("Get".to_owned()),
                input_type: Some(".tests.reboot.protoc.GetRequest".to_owned()),
                output_type: Some(".tests.reboot.protoc.GetResponse".to_owned()),
                ..Default::default()
            }
            .encode_to_vec();
            method.push(0x22); // MethodDescriptorProto.options (field 4).
            push_varint(&mut method, method_options.len());
            method.extend(method_options);

            let mut service = ServiceDescriptorProto {
                name: Some("CounterMethods".to_owned()),
                ..Default::default()
            }
            .encode_to_vec();
            service.push(0x12); // ServiceDescriptorProto.method (field 2).
            push_varint(&mut service, method.len());
            service.extend(method);

            let mut file = FileDescriptorProto {
                name: Some("tests/reboot/protoc/counter.proto".to_owned()),
                package: Some("tests.reboot.protoc".to_owned()),
                syntax: Some("proto3".to_owned()),
                ..Default::default()
            }
            .encode_to_vec();
            file.push(0x32); // FileDescriptorProto.service (field 6).
            push_varint(&mut file, service.len());
            file.extend(service);

            let mut request = CodeGeneratorRequest {
                parameter: Some("module=reboot_rust_schema::proto".to_owned()),
                file_to_generate: vec!["tests/reboot/protoc/counter.proto".to_owned()],
                ..Default::default()
            }
            .encode_to_vec();
            request.push(0x7a); // CodeGeneratorRequest.proto_file (field 15).
            push_varint(&mut request, file.len());
            request.extend(file);
            request
        }

        assert_eq!(
            generate_from_wire(&request_with_http_method(false)).error,
            None
        );
        assert_eq!(
            generate_from_wire(&request_with_http_method(true))
                .error
                .as_deref(),
            Some(
                "tests/reboot/protoc/counter.proto: Service `CounterMethods` method `Get` has a 'google.api.http' annotation. This is only supported for legacy gRPC services, not for Reboot methods. Let the maintainers know about your use case if you feel this is a limitation!"
            )
        );
    }

    #[test]
    fn raw_descriptors_reject_duplicate_reboot_method_names_for_one_state() {
        let method_options = ExtensionOptions {
            reboot: Some(
                RebootMethodOptions {
                    kind: Some(reboot_method_options::Kind::Reader(
                        RebootReaderMethodOptions::default(),
                    )),
                }
                .encode_to_vec(),
            ),
        }
        .encode_to_vec();
        let service_options = |state: &str| {
            ExtensionOptions {
                reboot: Some(
                    RebootServiceOptions {
                        state: state.to_owned(),
                        default_constructible: false,
                    }
                    .encode_to_vec(),
                ),
            }
            .encode_to_vec()
        };
        let error = match annotations(vec![RawFile {
            name: Some("counter.proto".to_owned()),
            package: Some("tests.reboot.protoc".to_owned()),
            messages: vec![],
            services: vec![
                RawService {
                    name: Some("CounterMethods".to_owned()),
                    options: Some(service_options("Counter")),
                    methods: vec![RawMethod {
                        name: Some("Get".to_owned()),
                        options: Some(method_options.clone()),
                    }],
                },
                RawService {
                    name: Some("CounterAdminMethods".to_owned()),
                    options: Some(service_options("Counter")),
                    methods: vec![RawMethod {
                        name: Some("Get".to_owned()),
                        options: Some(method_options),
                    }],
                },
            ],
        }]) {
            Err(error) => error,
            Ok(_) => panic!("duplicate Reboot state method unexpectedly accepted"),
        };
        assert_eq!(
            error,
            "Reboot state 'tests.reboot.protoc.Counter' has conflicting methods named 'Get': one from 'tests.reboot.protoc.CounterMethods.Get', another from 'tests.reboot.protoc.CounterAdminMethods.Get'. Each method name may only be used once per state type."
        );
    }

    #[test]
    fn raw_duplicate_method_validation_is_scoped_to_generated_files() {
        fn append_raw_file(wire: &mut Vec<u8>, file: RawFile) {
            let mut descriptor = file.encode_to_vec();
            // Preserve the ordinary descriptor field consumed by `generate_file`.
            descriptor.extend([0x62, 0x06, b'p', b'r', b'o', b't', b'o', b'3']);
            wire.push(0x7a); // CodeGeneratorRequest.proto_file (field 15).
            let mut length = descriptor.len();
            while length >= 0x80 {
                wire.push((length as u8 & 0x7f) | 0x80);
                length >>= 7;
            }
            wire.push(length as u8);
            wire.extend(descriptor);
        }

        let method_options = ExtensionOptions {
            reboot: Some(
                RebootMethodOptions {
                    kind: Some(reboot_method_options::Kind::Reader(
                        RebootReaderMethodOptions::default(),
                    )),
                }
                .encode_to_vec(),
            ),
        }
        .encode_to_vec();
        let service_options = |state: &str| {
            ExtensionOptions {
                reboot: Some(
                    RebootServiceOptions {
                        state: state.to_owned(),
                        default_constructible: false,
                    }
                    .encode_to_vec(),
                ),
            }
            .encode_to_vec()
        };
        let dependency = RawFile {
            name: Some("tests/reboot/protoc/dependency.proto".to_owned()),
            package: Some("tests.reboot.protoc".to_owned()),
            messages: vec![],
            services: vec![
                RawService {
                    name: Some("CounterMethods".to_owned()),
                    options: Some(service_options("Counter")),
                    methods: vec![RawMethod {
                        name: Some("Get".to_owned()),
                        options: Some(method_options.clone()),
                    }],
                },
                RawService {
                    name: Some("CounterAdminMethods".to_owned()),
                    options: Some(service_options("Counter")),
                    methods: vec![RawMethod {
                        name: Some("Get".to_owned()),
                        options: Some(method_options),
                    }],
                },
            ],
        };
        let ordinary = |name: &str| FileDescriptorProto {
            name: Some(name.to_owned()),
            package: Some("tests.reboot.protoc".to_owned()),
            syntax: Some("proto3".to_owned()),
            ..Default::default()
        };
        let request = |file_to_generate: &str| CodeGeneratorRequest {
            parameter: Some("module=reboot_rust_schema::proto".to_owned()),
            file_to_generate: vec![file_to_generate.to_owned()],
            proto_file: vec![
                ordinary("tests/reboot/protoc/main.proto"),
                ordinary("tests/reboot/protoc/dependency.proto"),
            ],
            ..Default::default()
        };

        let mut dependency_only = request("tests/reboot/protoc/main.proto").encode_to_vec();
        append_raw_file(&mut dependency_only, dependency.clone());
        assert!(generate_from_wire(&dependency_only).error.is_none());

        let mut generated_dependency =
            request("tests/reboot/protoc/dependency.proto").encode_to_vec();
        append_raw_file(&mut generated_dependency, dependency);
        assert_eq!(
            generate_from_wire(&generated_dependency).error.as_deref(),
            Some(
                "Reboot state 'tests.reboot.protoc.Counter' has conflicting methods named 'Get': one from 'tests.reboot.protoc.CounterMethods.Get', another from 'tests.reboot.protoc.CounterAdminMethods.Get'. Each method name may only be used once per state type."
            )
        );
    }

    #[test]
    fn raw_reboot_service_methods_suffix_validation_is_scoped_to_generated_files() {
        fn append_raw_file(wire: &mut Vec<u8>, file: RawFile) {
            let mut descriptor = file.encode_to_vec();
            // Preserve syntax in the raw descriptor that shadows the ordinary
            // descriptor consumed by the executable plugin.
            descriptor.extend([0x62, 0x06, b'p', b'r', b'o', b't', b'o', b'3']);
            wire.push(0x7a); // CodeGeneratorRequest.proto_file (field 15).
            wire.push(u8::try_from(descriptor.len()).expect("small raw descriptor"));
            wire.extend(descriptor);
        }

        let method_options = ExtensionOptions {
            reboot: Some(
                RebootMethodOptions {
                    kind: Some(reboot_method_options::Kind::Reader(
                        RebootReaderMethodOptions::default(),
                    )),
                }
                .encode_to_vec(),
            ),
        }
        .encode_to_vec();
        let invalid_dependency = RawFile {
            name: Some("tests/reboot/protoc/dependency.proto".to_owned()),
            package: Some("tests.reboot.protoc".to_owned()),
            messages: vec![],
            services: vec![RawService {
                name: Some("CounterApi".to_owned()),
                options: None,
                methods: vec![RawMethod {
                    name: Some("Get".to_owned()),
                    options: Some(method_options),
                }],
            }],
        };
        let request = |file_to_generate: &str| CodeGeneratorRequest {
            parameter: Some("module=reboot_rust_schema::proto".to_owned()),
            file_to_generate: vec![file_to_generate.to_owned()],
            proto_file: vec![
                FileDescriptorProto {
                    name: Some("tests/reboot/protoc/main.proto".to_owned()),
                    package: Some("tests.reboot.protoc".to_owned()),
                    syntax: Some("proto3".to_owned()),
                    ..Default::default()
                },
                FileDescriptorProto {
                    name: Some("tests/reboot/protoc/dependency.proto".to_owned()),
                    package: Some("tests.reboot.protoc".to_owned()),
                    syntax: Some("proto3".to_owned()),
                    ..Default::default()
                },
            ],
            ..Default::default()
        };

        let mut dependency_only = request("tests/reboot/protoc/main.proto").encode_to_vec();
        append_raw_file(&mut dependency_only, invalid_dependency.clone());
        assert!(generate_from_wire(&dependency_only).error.is_none());

        let mut generated_dependency =
            request("tests/reboot/protoc/dependency.proto").encode_to_vec();
        append_raw_file(&mut generated_dependency, invalid_dependency);
        assert_eq!(
            generate_from_wire(&generated_dependency).error.as_deref(),
            Some(
                "Reboot service 'tests.reboot.protoc.CounterApi' has illegal name: all Reboot service names must end in 'Methods', since (unlike basic gRPC) they provide methods to Reboot states"
            )
        );
    }

    #[test]
    fn raw_plugin_scopes_service_local_option_validation_to_generated_files() {
        fn append_raw_file(wire: &mut Vec<u8>, file: RawFile) {
            let mut descriptor = file.encode_to_vec();
            // This raw option overlay is also decoded as a normal descriptor.
            // Keep syntax so it cannot change the ordinary validation subject.
            descriptor.extend([0x62, 0x06, b'p', b'r', b'o', b't', b'o', b'3']);
            wire.push(0x7a); // CodeGeneratorRequest.proto_file (field 15).
            wire.push(u8::try_from(descriptor.len()).expect("small raw descriptor"));
            wire.extend(descriptor);
        }

        let method_options = ExtensionOptions {
            reboot: Some(
                RebootMethodOptions {
                    kind: Some(reboot_method_options::Kind::Writer(
                        RebootWriterMethodOptions::default(),
                    )),
                }
                .encode_to_vec(),
            ),
        }
        .encode_to_vec();
        let dependency = RawFile {
            name: Some("tests/reboot/protoc/dependency.proto".to_owned()),
            package: Some("tests.reboot.protoc".to_owned()),
            messages: vec![],
            services: vec![RawService {
                name: Some("CounterMethods".to_owned()),
                options: None,
                methods: vec![RawMethod {
                    name: Some("increment".to_owned()),
                    options: Some(method_options),
                }],
            }],
        };
        let request = |file_to_generate: &str| CodeGeneratorRequest {
            parameter: Some("module=reboot_rust_schema::proto".to_owned()),
            file_to_generate: vec![file_to_generate.to_owned()],
            proto_file: vec![
                FileDescriptorProto {
                    name: Some("tests/reboot/protoc/main.proto".to_owned()),
                    package: Some("tests.reboot.protoc".to_owned()),
                    syntax: Some("proto3".to_owned()),
                    ..Default::default()
                },
                FileDescriptorProto {
                    name: Some("tests/reboot/protoc/dependency.proto".to_owned()),
                    package: Some("tests.reboot.protoc".to_owned()),
                    syntax: Some("proto3".to_owned()),
                    ..Default::default()
                },
            ],
            ..Default::default()
        };

        let mut dependency_only = request("tests/reboot/protoc/main.proto").encode_to_vec();
        append_raw_file(&mut dependency_only, dependency.clone());
        assert!(generate_from_wire(&dependency_only).error.is_none());

        let mut generated_dependency =
            request("tests/reboot/protoc/dependency.proto").encode_to_vec();
        append_raw_file(&mut generated_dependency, dependency);
        assert_eq!(
            generate_from_wire(&generated_dependency).error.as_deref(),
            Some(
                "tests/reboot/protoc/dependency.proto: Reboot method `CounterMethods/increment` has illegal name: all Reboot RPC method names must start with an uppercase letter."
            )
        );
    }

    #[test]
    fn state_annotations_require_existing_services_that_point_back_to_the_state() {
        let state_options = ExtensionOptions {
            reboot: Some(
                RebootStateOptions {
                    implements: vec!["CounterMethods".to_owned()],
                    auto_construct: 0,
                }
                .encode_to_vec(),
            ),
        }
        .encode_to_vec();
        let state_file = RawFile {
            name: Some("state.proto".to_owned()),
            package: Some("tests.reboot.protoc".to_owned()),
            messages: vec![RawMessage {
                name: Some("Counter".to_owned()),
                options: Some(state_options),
            }],
            services: vec![],
        };
        let method_options = ExtensionOptions {
            reboot: Some(
                RebootMethodOptions {
                    kind: Some(reboot_method_options::Kind::Reader(
                        RebootReaderMethodOptions::default(),
                    )),
                }
                .encode_to_vec(),
            ),
        }
        .encode_to_vec();
        let service_file = |state: &str| RawFile {
            name: Some("methods.proto".to_owned()),
            package: Some("tests.reboot.protoc".to_owned()),
            messages: vec![],
            services: vec![RawService {
                name: Some("CounterMethods".to_owned()),
                options: Some(
                    ExtensionOptions {
                        reboot: Some(
                            RebootServiceOptions {
                                state: state.to_owned(),
                                default_constructible: false,
                            }
                            .encode_to_vec(),
                        ),
                    }
                    .encode_to_vec(),
                ),
                methods: vec![RawMethod {
                    name: Some("Get".to_owned()),
                    options: Some(method_options.clone()),
                }],
            }],
        };

        assert!(annotations(vec![state_file.clone(), service_file("Counter")]).is_ok());
        let default_state_file = RawFile {
            name: Some("default_state.proto".to_owned()),
            package: Some("tests.reboot.protoc".to_owned()),
            messages: vec![RawMessage {
                name: Some("Counter".to_owned()),
                options: Some(
                    ExtensionOptions {
                        reboot: Some(RebootStateOptions::default().encode_to_vec()),
                    }
                    .encode_to_vec(),
                ),
            }],
            services: vec![],
        };
        assert!(annotations(vec![default_state_file, service_file("Counter")]).is_ok());
        let missing = match annotations(vec![state_file.clone()]) {
            Err(error) => error,
            Ok(_) => panic!("state with a missing service unexpectedly accepted"),
        };
        assert_eq!(
            missing,
            "state.proto: Missing Reboot service named `tests.reboot.protoc.CounterMethods`; expected by state message `tests.reboot.protoc.Counter` defined in `state.proto`."
        );
        let mismatch = match annotations(vec![state_file, service_file("Other")]) {
            Err(error) => error,
            Ok(_) => panic!("state with a mismatched service unexpectedly accepted"),
        };
        assert_eq!(
            mismatch,
            "state.proto: Reboot state message `tests.reboot.protoc.Counter` is expecting to get methods from service `tests.reboot.protoc.CounterMethods`, but that service is providing methods for a state message named `tests.reboot.protoc.Other` instead."
        );
    }

    #[test]
    fn reboot_services_require_present_linked_states_to_be_annotated() {
        let method_options = ExtensionOptions {
            reboot: Some(
                RebootMethodOptions {
                    kind: Some(reboot_method_options::Kind::Reader(
                        RebootReaderMethodOptions::default(),
                    )),
                }
                .encode_to_vec(),
            ),
        }
        .encode_to_vec();
        let service_file = RawFile {
            name: Some("methods.proto".to_owned()),
            package: Some("tests.reboot.methods".to_owned()),
            messages: vec![],
            services: vec![RawService {
                name: Some("CounterMethods".to_owned()),
                options: Some(
                    ExtensionOptions {
                        reboot: Some(
                            RebootServiceOptions {
                                state: "tests.reboot.states.Counter".to_owned(),
                                default_constructible: false,
                            }
                            .encode_to_vec(),
                        ),
                    }
                    .encode_to_vec(),
                ),
                methods: vec![RawMethod {
                    name: Some("Get".to_owned()),
                    options: Some(method_options),
                }],
            }],
        };
        let unannotated_state = RawFile {
            name: Some("state.proto".to_owned()),
            package: Some("tests.reboot.states".to_owned()),
            messages: vec![RawMessage {
                name: Some("Counter".to_owned()),
                options: None,
            }],
            services: vec![],
        };
        let error = match annotations(vec![service_file.clone(), unannotated_state]) {
            Err(error) => error,
            Ok(_) => panic!("present linked state without a Reboot annotation was accepted"),
        };
        assert_eq!(
            error,
            "methods.proto: Reboot service `tests.reboot.methods.CounterMethods` is linked to state message `tests.reboot.states.Counter`, but that message is not annotated as a Reboot state; all Reboot states must have the `rbt.v1alpha1.state` annotation."
        );

        let annotated_state = RawFile {
            name: Some("state.proto".to_owned()),
            package: Some("tests.reboot.states".to_owned()),
            messages: vec![RawMessage {
                name: Some("Counter".to_owned()),
                options: Some(
                    ExtensionOptions {
                        reboot: Some(
                            RebootStateOptions {
                                implements: vec!["tests.reboot.methods.CounterMethods".to_owned()],
                                auto_construct: 0,
                            }
                            .encode_to_vec(),
                        ),
                    }
                    .encode_to_vec(),
                ),
            }],
            services: vec![],
        };
        assert!(annotations(vec![service_file.clone(), annotated_state]).is_ok());
        // Python only validates a linked message if it is in the descriptor
        // pool, so a service compiled without its state remains valid.
        assert!(annotations(vec![service_file]).is_ok());
    }

    #[test]
    fn raw_plugin_scopes_linked_state_and_service_relationship_checks_to_generated_files() {
        fn append_raw_file(wire: &mut Vec<u8>, file: RawFile) {
            let mut descriptor = file.encode_to_vec();
            // Raw overlays are also normal descriptors in the first decode.
            // Preserve syntax so the overlay cannot make a dependency appear
            // proto2 while testing only the generic-plugin scope boundary.
            descriptor.extend([0x62, 0x06, b'p', b'r', b'o', b't', b'o', b'3']);
            wire.push(0x7a); // CodeGeneratorRequest.proto_file (field 15).
            let mut length = descriptor.len();
            while length >= 0x80 {
                wire.push((length as u8 & 0x7f) | 0x80);
                length >>= 7;
            }
            wire.push(length as u8);
            wire.extend(descriptor);
        }

        let method_options = ExtensionOptions {
            reboot: Some(
                RebootMethodOptions {
                    kind: Some(reboot_method_options::Kind::Reader(
                        RebootReaderMethodOptions::default(),
                    )),
                }
                .encode_to_vec(),
            ),
        }
        .encode_to_vec();
        let state_options = ExtensionOptions {
            reboot: Some(
                RebootStateOptions {
                    implements: vec!["CounterMethods".to_owned()],
                    auto_construct: 0,
                }
                .encode_to_vec(),
            ),
        }
        .encode_to_vec();
        let service_options = ExtensionOptions {
            reboot: Some(
                RebootServiceOptions {
                    state: "Other".to_owned(),
                    default_constructible: false,
                }
                .encode_to_vec(),
            ),
        }
        .encode_to_vec();
        let dependency = RawFile {
            name: Some("tests/reboot/protoc/dependency.proto".to_owned()),
            package: Some("tests.reboot.protoc".to_owned()),
            messages: vec![
                // A generated service may only link to an annotated state.
                RawMessage {
                    name: Some("Other".to_owned()),
                    options: None,
                },
                // A generated state must agree with its linked service.
                RawMessage {
                    name: Some("Counter".to_owned()),
                    options: Some(state_options.clone()),
                },
            ],
            services: vec![RawService {
                name: Some("CounterMethods".to_owned()),
                options: Some(service_options.clone()),
                methods: vec![RawMethod {
                    name: Some("Get".to_owned()),
                    options: Some(method_options.clone()),
                }],
            }],
        };
        let request = |file_to_generate: &str| CodeGeneratorRequest {
            parameter: Some("module=reboot_rust_schema::proto".to_owned()),
            file_to_generate: vec![file_to_generate.to_owned()],
            proto_file: vec![
                FileDescriptorProto {
                    name: Some("tests/reboot/protoc/main.proto".to_owned()),
                    package: Some("tests.reboot.protoc".to_owned()),
                    syntax: Some("proto3".to_owned()),
                    ..Default::default()
                },
                FileDescriptorProto {
                    name: Some("tests/reboot/protoc/dependency.proto".to_owned()),
                    package: Some("tests.reboot.protoc".to_owned()),
                    syntax: Some("proto3".to_owned()),
                    ..Default::default()
                },
            ],
            ..Default::default()
        };

        let mut dependency_only = request("tests/reboot/protoc/main.proto").encode_to_vec();
        append_raw_file(&mut dependency_only, dependency.clone());
        assert!(generate_from_wire(&dependency_only).error.is_none());

        let mut generated_dependency =
            request("tests/reboot/protoc/dependency.proto").encode_to_vec();
        append_raw_file(&mut generated_dependency, dependency);
        assert_eq!(
            generate_from_wire(&generated_dependency).error.as_deref(),
            Some(
                "tests/reboot/protoc/dependency.proto: Reboot service `tests.reboot.protoc.CounterMethods` is linked to state message `tests.reboot.protoc.Other`, but that message is not annotated as a Reboot state; all Reboot states must have the `rbt.v1alpha1.state` annotation."
            )
        );

        // Keep the service's linked state absent: Python allows that optional
        // service-side lookup, leaving only `_check_states` to reject the
        // state/service back-reference when this descriptor is generated.
        let relationship_mismatch = RawFile {
            name: Some("tests/reboot/protoc/dependency.proto".to_owned()),
            package: Some("tests.reboot.protoc".to_owned()),
            messages: vec![RawMessage {
                name: Some("Counter".to_owned()),
                options: Some(state_options),
            }],
            services: vec![RawService {
                name: Some("CounterMethods".to_owned()),
                options: Some(service_options),
                methods: vec![RawMethod {
                    name: Some("Get".to_owned()),
                    options: Some(method_options),
                }],
            }],
        };
        let mut dependency_only = request("tests/reboot/protoc/main.proto").encode_to_vec();
        append_raw_file(&mut dependency_only, relationship_mismatch.clone());
        assert!(generate_from_wire(&dependency_only).error.is_none());

        let mut generated_dependency =
            request("tests/reboot/protoc/dependency.proto").encode_to_vec();
        append_raw_file(&mut generated_dependency, relationship_mismatch);
        assert_eq!(
            generate_from_wire(&generated_dependency).error.as_deref(),
            Some(
                "tests/reboot/protoc/dependency.proto: Reboot state message `tests.reboot.protoc.Counter` is expecting to get methods from service `tests.reboot.protoc.CounterMethods`, but that service is providing methods for a state message named `tests.reboot.protoc.Other` instead."
            )
        );
    }

    #[test]
    fn raw_auto_construct_states_require_framework_method_names() {
        fn append_raw_file(wire: &mut Vec<u8>, file: RawFile) {
            let mut descriptor = file.encode_to_vec();
            // The raw overlay is also a normal FileDescriptorProto decoded by
            // `generate_from_wire`; preserve its syntax when it shadows the
            // ordinary descriptor used for code emission.
            descriptor.extend([0x62, 0x06, b'p', b'r', b'o', b't', b'o', b'3']);
            wire.push(0x7a); // CodeGeneratorRequest.proto_file (field 15).
            wire.push(u8::try_from(descriptor.len()).expect("small raw descriptor"));
            wire.extend(descriptor);
        }

        let state_options = ExtensionOptions {
            reboot: Some(
                RebootStateOptions {
                    implements: vec!["UserMethods".to_owned()],
                    auto_construct: AutoConstruct::PerUserId as i32,
                }
                .encode_to_vec(),
            ),
        }
        .encode_to_vec();
        let state = RawFile {
            name: Some("tests/reboot/protoc/state.proto".to_owned()),
            package: Some("tests.reboot.protoc".to_owned()),
            messages: vec![RawMessage {
                name: Some("User".to_owned()),
                options: Some(state_options),
            }],
            services: vec![],
        };
        let request = CodeGeneratorRequest {
            parameter: Some("module=reboot_rust_schema::proto".to_owned()),
            file_to_generate: vec!["tests/reboot/protoc/state.proto".to_owned()],
            proto_file: vec![
                FileDescriptorProto {
                    name: Some("tests/reboot/protoc/state.proto".to_owned()),
                    package: Some("tests.reboot.protoc".to_owned()),
                    syntax: Some("proto3".to_owned()),
                    ..Default::default()
                },
                FileDescriptorProto {
                    name: Some("tests/reboot/protoc/methods.proto".to_owned()),
                    package: Some("tests.reboot.protoc".to_owned()),
                    syntax: Some("proto3".to_owned()),
                    ..Default::default()
                },
            ],
            ..Default::default()
        };
        let generate = |methods: &[&str]| {
            let mut wire = request.encode_to_vec();
            append_raw_file(&mut wire, state.clone());
            append_raw_file(
                &mut wire,
                RawFile {
                    name: Some("tests/reboot/protoc/methods.proto".to_owned()),
                    package: Some("tests.reboot.protoc".to_owned()),
                    messages: vec![],
                    services: vec![RawService {
                        name: Some("UserMethods".to_owned()),
                        options: None,
                        methods: methods
                            .iter()
                            .map(|name| RawMethod {
                                name: Some((*name).to_owned()),
                                options: None,
                            })
                            .collect(),
                    }],
                },
            );
            generate_from_wire(&wire)
        };

        assert_eq!(
            generate(&["SetClaims"]).error.as_deref(),
            Some(
                "State type 'User' requires a 'Create' Transaction method. Add to your service:\n  rpc Create(google.protobuf.Empty) returns (google.protobuf.Empty) {\n    option (rbt.v1alpha1.method) = { transaction: {} };\n  }"
            )
        );
        assert_eq!(
            generate(&["Create"]).error.as_deref(),
            Some(
                "State type 'User' requires a 'SetClaims' Transaction method through which the framework delivers each user's verified identity claims. Add to your service:\n  rpc SetClaims(UserSetClaimsRequest) returns (google.protobuf.Empty) {\n    option (rbt.v1alpha1.method) = { transaction: {} };\n  }\nwhere 'UserSetClaimsRequest' is a message with a 'map<string, google.protobuf.Value> claims = 1;' field."
            )
        );
        assert!(generate(&["Create", "SetClaims"]).error.is_none());
    }

    #[test]
    fn transaction_options_preserve_exclusive_and_shared_modes() {
        let service_options = ExtensionOptions {
            reboot: Some(
                RebootServiceOptions {
                    state: "Counter".to_owned(),
                    default_constructible: true,
                }
                .encode_to_vec(),
            ),
        }
        .encode_to_vec();
        let transaction_options = |mode: TransactionMode, factory: bool| {
            ExtensionOptions {
                reboot: Some(
                    RebootMethodOptions {
                        kind: Some(reboot_method_options::Kind::Transaction(
                            RebootTransactionMethodOptions {
                                constructor: factory.then_some(Empty {}),
                                mode: match mode {
                                    TransactionMode::Exclusive => {
                                        Some(reboot_transaction_method_options::Mode::Exclusive(
                                            Empty {},
                                        ))
                                    }
                                    TransactionMode::Shared => Some(
                                        reboot_transaction_method_options::Mode::Shared(Empty {}),
                                    ),
                                },
                            },
                        )),
                    }
                    .encode_to_vec(),
                ),
            }
            .encode_to_vec()
        };
        let parsed = annotations(vec![RawFile {
            name: Some("counter.proto".to_owned()),
            package: None,
            messages: vec![],
            services: vec![RawService {
                name: Some("CounterMethods".to_owned()),
                options: Some(service_options),
                methods: vec![
                    RawMethod {
                        name: Some("Exclusive".to_owned()),
                        options: Some(transaction_options(TransactionMode::Exclusive, false)),
                    },
                    RawMethod {
                        name: Some("Shared".to_owned()),
                        options: Some(transaction_options(TransactionMode::Shared, true)),
                    },
                ],
            }],
        }])
        .unwrap();
        let methods = &parsed["counter.proto"]["CounterMethods"].methods;
        assert_eq!(
            methods["Exclusive"],
            DurableKind::Transaction(TransactionMetadata {
                mode: TransactionMode::Exclusive,
                factory: false,
            })
        );
        assert_eq!(
            methods["Shared"],
            DurableKind::Transaction(TransactionMetadata {
                mode: TransactionMode::Shared,
                factory: true,
            })
        );
    }

    #[test]
    fn raw_plugin_transaction_mode_and_declared_error_options_match_python_features() {
        fn push_length_delimited(output: &mut Vec<u8>, field: u8, value: &[u8]) {
            output.push(field);
            let mut length = value.len();
            while length >= 0x80 {
                output.push((length as u8 & 0x7f) | 0x80);
                length >>= 7;
            }
            output.push(length as u8);
            output.extend(value);
        }

        let raw_request = |mode, errors: Vec<String>| {
            let mut reboot_option = RebootMethodOptions {
                kind: Some(reboot_method_options::Kind::Transaction(
                    RebootTransactionMethodOptions {
                        constructor: Some(Empty {}),
                        mode,
                    },
                )),
            }
            .encode_to_vec();
            reboot_option.extend(RebootMethodErrorOptions { errors }.encode_to_vec());
            let method_option = ExtensionOptions {
                reboot: Some(reboot_option),
            }
            .encode_to_vec();
            // Raw option overlays must remain full ordinary descriptors too:
            // generate_from_wire decodes this request both as prost_types and
            // through the raw mirror retaining extension field 50000.
            let mut method = MethodDescriptorProto {
                name: Some("Increment".to_owned()),
                input_type: Some(".tests.reboot.protoc.IncrementRequest".to_owned()),
                output_type: Some(".tests.reboot.protoc.CounterValue".to_owned()),
                ..Default::default()
            }
            .encode_to_vec();
            push_length_delimited(&mut method, 0x22, &method_option);
            let mut service = RawService {
                name: Some("CounterWritesMethods".to_owned()),
                methods: vec![],
                options: None,
            }
            .encode_to_vec();
            push_length_delimited(&mut service, 0x12, &method);
            let mut descriptor = RawFile {
                name: Some("tests/reboot/protoc/counter.proto".to_owned()),
                package: Some("tests.reboot.protoc".to_owned()),
                messages: vec![],
                services: vec![],
            }
            .encode_to_vec();
            push_length_delimited(&mut descriptor, 0x32, &service);
            descriptor.extend([0x62, 0x06, b'p', b'r', b'o', b't', b'o', b'3']);
            let mut request = request();
            request.file_to_generate = vec!["tests/reboot/protoc/counter.proto".to_owned()];
            request.proto_file[0].name = Some("tests/reboot/protoc/counter.proto".to_owned());
            let mut wire = request.encode_to_vec();
            push_length_delimited(&mut wire, 0x7a, &descriptor);
            wire
        };

        for mode in [
            reboot_transaction_method_options::Mode::Exclusive(Empty {}),
            reboot_transaction_method_options::Mode::Shared(Empty {}),
        ] {
            let response = generate_from_wire(&raw_request(Some(mode), vec![]));
            assert!(response.error.is_none(), "{response:?}");
        }
        assert_eq!(
            generate_from_wire(&raw_request(None, vec![]))
                .error
                .as_deref(),
            Some(
                "tests/reboot/protoc/counter.proto: Transaction 'Increment' does not say how it holds the lock on its own state while it runs. Every transaction must declare one of:\n  exclusive: {} takes the lock exclusive from the start, so that concurrent callers of the same state queue behind it. The choice for a transaction that writes its own state, which is most of them.\n  shared: {} takes the lock shared and upgrades it to exclusive only if the transaction writes its own state, so that callers proceed concurrently while none of them writes it. The choice for a transaction that mostly reads its own state while writing others.\nFor example:\n  option (rbt.v1alpha1.method) = {\n    transaction: { exclusive: {} },\n  };"
            )
        );
        assert_eq!(
            generate_from_wire(&raw_request(
                Some(reboot_transaction_method_options::Mode::Exclusive(Empty {})),
                vec!["CounterError".to_owned()],
            ))
            .error
            .as_deref(),
            Some(
                "tests/reboot/protoc/counter.proto: service `CounterWritesMethods` method `Increment` requests declared errors; this generator supports only methods without declared errors"
            )
        );
    }

    #[test]
    fn transaction_handlers_require_execution_envelope_and_executable_tonic_adapter() {
        let annotations = HashMap::from([(
            "counter.proto".to_owned(),
            HashMap::from([(
                "CounterWritesMethods".to_owned(),
                DurableService {
                    state: "Counter".to_owned(),
                    default_constructible: true,
                    methods: HashMap::from([(
                        "Increment".to_owned(),
                        DurableKind::Transaction(TransactionMetadata {
                            mode: TransactionMode::Exclusive,
                            factory: false,
                        }),
                    )]),
                },
            )]),
        )]);
        let content = generate_inner(request(), annotations)
            .unwrap()
            .remove(0)
            .content
            .unwrap();
        assert!(content.contains("pub trait CounterWritesMethodsTransactionHandler"));
        assert!(content.contains("pub struct CounterWritesMethodsClient<R>"));
        assert!(content.contains("pub struct CounterWritesMethodsTarget"));
        assert!(content.contains("TransactionalChannelResolver"));
        assert!(content.contains("transactional_outbound_request"));
        assert!(
            content.contains("CounterWritesMethodsClient::new(channel).increment(request).await?")
        );
        assert!(content.contains("ReturnedParticipants::from_metadata(response.metadata())"));
        assert!(content.contains("TransactionalCallResponse<proto::CounterValue>"));
        assert!(content.contains("context: &reboot_rust_schema::runtime::TransactionContext"));
        assert!(content.contains("state: &mut proto::Counter"));
        assert!(
            content.contains("pub struct CounterWritesMethodsTransactionAdapter<H, P, C, R, F>")
        );
        assert!(content.contains(
            "impl<H, P, C, R, F> proto::counter_writes_methods_server::CounterWritesMethods"
        ));
        assert!(content.contains("transaction-start factory"));
        assert!(content.contains("start_root_transaction(headers"));
        assert!(content.contains("InboundTransactionStartFactory"));
        assert!(content.contains("InboundTransactionContext::from_headers"));
        assert!(content.contains("next_inbound_transaction(&inbound_context)"));
        assert!(content.contains("TransactionPathContract::PreserveNested"));
        assert!(content.contains("stage_successful_participants(&mut response, metadata)"));
        assert!(content.contains("participant.start("));
        assert!(content.contains("recover_idempotent_mutations("));
        assert!(content.contains("context.idempotency("));
        assert!(content.contains("root-local idempotency stages exactly one automatic mutation"));
        assert!(content.contains("idempotency.replay::<proto::CounterValue>"));
        assert!(content.contains("participant.stage(transaction_id"));
        assert!(content.contains("ParticipantMetadata::classified_single("));
        assert!(content.contains("coordinator.complete_with_classified_returned_participants("));
        assert!(content.contains("context.enlist_returned_participants(&returned_participants)"));
        assert!(content.contains("context.take_returned_participants()"));
        assert!(!content.contains("execution.returned_participants"));
        assert!(content.contains("PendingActorEffects"));
        assert!(content.contains("non-factory transaction requires an existing actor state"));
        assert!(content.contains("Factory transaction declared by this RPC: no."));
        assert!(content.contains("TransactionExecution<proto::CounterValue>"));
        assert!(!content.contains("CounterWritesMethodsDatabaseHandler"));
        assert!(!content.contains("CounterWritesMethodsExternalClient"));
        assert!(!content.contains("writer_async_for_method::<CounterDurableState"));
        assert!(!content.contains("impl<H: CounterWritesMethodsTransactionHandler> proto::"));
    }

    #[test]
    fn shared_transactions_render_distinct_inbound_and_fresh_root_read_only_paths() {
        let annotations = HashMap::from([(
            "counter.proto".to_owned(),
            HashMap::from([(
                "CounterWritesMethods".to_owned(),
                DurableService {
                    state: "Counter".to_owned(),
                    default_constructible: true,
                    methods: HashMap::from([(
                        "Increment".to_owned(),
                        DurableKind::Transaction(TransactionMetadata {
                            mode: TransactionMode::Shared,
                            factory: false,
                        }),
                    )]),
                },
            )]),
        )]);
        let content = generate_inner(request(), annotations)
            .unwrap()
            .remove(0)
            .content
            .unwrap();

        assert!(
            content.contains("// Shared inbound execution remains read-only; it never promotes.")
        );
        assert!(content.contains("transaction_path: reboot_rust_schema::durable_participant::TransactionPathContract::PreserveNested"));
        assert!(
            content.contains("// Fresh shared roots are deliberately read-only until the local")
        );
        assert!(content.contains("ownership seam can use start_local(SharedUpgradeable) together"));
        assert!(content.contains("transaction_path: reboot_rust_schema::durable_participant::TransactionPathContract::RootOnly"));
        assert!(
            content
                .contains("current coordinator accepts only the read-only shared classification")
        );
        assert!(!content.contains("ParticipantStartMode::SharedUpgradeable"));
        assert!(!content.contains("complete_shared_local_promotion"));
    }

    #[test]
    fn exclusive_transactions_keep_the_established_combined_fresh_and_inbound_flow() {
        let annotations = HashMap::from([(
            "counter.proto".to_owned(),
            HashMap::from([(
                "CounterWritesMethods".to_owned(),
                DurableService {
                    state: "Counter".to_owned(),
                    default_constructible: true,
                    methods: HashMap::from([(
                        "Increment".to_owned(),
                        DurableKind::Transaction(TransactionMetadata {
                            mode: TransactionMode::Exclusive,
                            factory: false,
                        }),
                    )]),
                },
            )]),
        )]);
        let content = generate_inner(request(), annotations)
            .unwrap()
            .remove(0)
            .content
            .unwrap();

        assert!(content.contains("let mut context = if inbound { let inbound_context"));
        assert!(content.contains("if inbound { reboot_rust_schema::durable_participant::TransactionPathContract::PreserveNested } else { reboot_rust_schema::durable_participant::TransactionPathContract::RootOnly }"));
        assert!(!content.contains("Fresh shared roots are deliberately read-only"));
    }

    #[test]
    fn exclusive_factory_transaction_generates_root_only_durable_creation_flow() {
        let annotations = HashMap::from([(
            "counter.proto".to_owned(),
            HashMap::from([(
                "CounterWritesMethods".to_owned(),
                DurableService {
                    state: "Counter".to_owned(),
                    default_constructible: false,
                    methods: HashMap::from([(
                        "Increment".to_owned(),
                        DurableKind::Transaction(TransactionMetadata {
                            mode: TransactionMode::Exclusive,
                            factory: true,
                        }),
                    )]),
                },
            )]),
        )]);
        let content = generate_inner(request(), annotations)
            .unwrap()
            .remove(0)
            .content
            .unwrap();
        assert!(content.contains("factory: true"));
        assert!(content.contains("factory transactions must be exclusive root transactions"));
        assert!(content.contains("factory transaction requires an absent actor state"));
        assert!(content.contains(
            "let automatic_idempotency = if !inbound && context.headers().idempotency_key.is_some()"
        ));
        assert_eq!(content.matches("recover_idempotent_mutations(").count(), 2);
        assert!(content.contains("idempotency.replay::<proto::CounterValue>"));
        let first_recovery = content.find("recover_idempotent_mutations(").unwrap();
        let admission = content
            .find("let loaded = self.participant.start(")
            .unwrap();
        let second_recovery = content.rfind("recover_idempotent_mutations(").unwrap();
        let handler = content[second_recovery..]
            .find("self.handler.increment(")
            .map(|offset| second_recovery + offset)
            .unwrap();
        assert!(first_recovery < admission);
        assert!(admission < second_recovery);
        assert!(second_recovery < handler);
        assert!(content[admission..handler].contains("let replay_after_admission = async"));
        assert!(content[second_recovery..handler].contains(
            "Err(error) => { self.participant.abort(transaction_id).await?; return Err(error); }"
        ));
        assert!(content[second_recovery..handler]
            .contains("self.participant.abort(transaction_id).await?; return Ok(tonic::Response::new(response))"));
        assert!(content.contains("root-local idempotency stages exactly one automatic mutation"));
        assert!(content.contains("None if true => proto::Counter::default()"));
        assert!(content.contains("<proto::Counter as prost::Message>::encode_to_vec(&state)"));
        assert!(!content.contains("factory transactions are not supported"));
    }

    #[test]
    fn transaction_without_a_mode_is_rejected() {
        let method_options = ExtensionOptions {
            reboot: Some(
                RebootMethodOptions {
                    kind: Some(reboot_method_options::Kind::Transaction(
                        RebootTransactionMethodOptions::default(),
                    )),
                }
                .encode_to_vec(),
            ),
        }
        .encode_to_vec();
        let result = annotations(vec![RawFile {
            name: Some("counter.proto".to_owned()),
            package: None,
            messages: vec![],
            services: vec![RawService {
                name: Some("CounterMethods".to_owned()),
                options: Some(
                    ExtensionOptions {
                        reboot: Some(
                            RebootServiceOptions {
                                state: "Counter".to_owned(),
                                default_constructible: true,
                            }
                            .encode_to_vec(),
                        ),
                    }
                    .encode_to_vec(),
                ),
                methods: vec![RawMethod {
                    name: Some("Increment".to_owned()),
                    options: Some(method_options),
                }],
            }],
        }]);
        let error = match result {
            Ok(_) => panic!("a transaction without a mode must be rejected"),
            Err(error) => error,
        };
        assert_eq!(
            error,
            "counter.proto: Transaction 'Increment' does not say how it holds the lock on its own state while it runs. Every transaction must declare one of:\n  exclusive: {} takes the lock exclusive from the start, so that concurrent callers of the same state queue behind it. The choice for a transaction that writes its own state, which is most of them.\n  shared: {} takes the lock shared and upgrades it to exclusive only if the transaction writes its own state, so that callers proceed concurrently while none of them writes it. The choice for a transaction that mostly reads its own state while writing others.\nFor example:\n  option (rbt.v1alpha1.method) = {\n    transaction: { exclusive: {} },\n  };"
        );
    }

    #[test]
    fn constructor_aware_database_adapters_require_existing_state_and_reject_constructors() {
        let annotations = HashMap::from([(
            "counter.proto".to_owned(),
            HashMap::from([(
                "CounterWritesMethods".to_owned(),
                DurableService {
                    state: "Counter".to_owned(),
                    default_constructible: false,
                    methods: HashMap::from([
                        (
                            "Increment".to_owned(),
                            DurableKind::Writer(WriterMetadata { constructor: false }),
                        ),
                        (
                            "Construct".to_owned(),
                            DurableKind::Writer(WriterMetadata { constructor: true }),
                        ),
                        ("Read".to_owned(), DurableKind::Reader),
                    ]),
                },
            )]),
        )]);
        let mut value = request();
        value.proto_file[0].service[0].method.extend([
            MethodDescriptorProto {
                name: Some("Construct".to_owned()),
                input_type: Some(".tests.reboot.protoc.IncrementRequest".into()),
                output_type: Some(".tests.reboot.protoc.CounterValue".into()),
                ..Default::default()
            },
            MethodDescriptorProto {
                name: Some("Read".to_owned()),
                input_type: Some(".tests.reboot.protoc.IncrementRequest".into()),
                output_type: Some(".tests.reboot.protoc.CounterValue".into()),
                ..Default::default()
            },
        ]);
        let content = generate_inner(value, annotations)
            .unwrap()
            .remove(0)
            .content
            .unwrap();
        assert!(content.contains("writer_async_for_method_with_admission::<CounterDurableState"));
        assert!(content.contains("reader_async_for_with_admission::<CounterDurableState"));
        assert!(content.contains("StateAdmission::RequireExisting"));
        assert!(content.contains("constructor_writer_async_for_method::<CounterDurableState"));
        assert!(!content.contains("constructor writers are not supported"));
    }

    #[test]
    fn mixed_transaction_and_database_methods_emit_one_complete_tonic_adapter() {
        let annotations = HashMap::from([(
            "counter.proto".to_owned(),
            HashMap::from([(
                "CounterWritesMethods".to_owned(),
                DurableService {
                    state: "Counter".to_owned(),
                    default_constructible: true,
                    methods: HashMap::from([
                        (
                            "Increment".to_owned(),
                            DurableKind::Writer(WriterMetadata { constructor: false }),
                        ),
                        (
                            "Transaction".to_owned(),
                            DurableKind::Transaction(TransactionMetadata {
                                mode: TransactionMode::Shared,
                                factory: false,
                            }),
                        ),
                    ]),
                },
            )]),
        )]);
        let mut value = request();
        value.proto_file[0].service[0]
            .method
            .push(MethodDescriptorProto {
                name: Some("Transaction".to_owned()),
                input_type: Some(".tests.reboot.protoc.IncrementRequest".to_owned()),
                output_type: Some(".tests.reboot.protoc.CounterValue".to_owned()),
                ..Default::default()
            });
        let content = generate_inner(value, annotations)
            .unwrap()
            .remove(0)
            .content
            .unwrap();
        assert!(content.contains("pub trait CounterWritesMethodsTransactionHandler"));
        assert!(content.contains("async fn increment(&self, state: &mut proto::Counter"));
        assert!(content.contains("async fn transaction(&self, context:"));
        assert!(content.contains("pub struct CounterWritesMethodsTransactionAdapter"));
        assert!(content.contains("store: reboot_rust_schema::runtime::DatabaseActorStore"));
    }

    #[test]
    fn rejects_malformed_runtime_module_parameter() {
        let mut value = request();
        value.parameter = Some("module=crate::proto,runtime_module=reboot::9invalid".into());
        assert!(
            generate(value)
                .error
                .unwrap()
                .contains("runtime_module=<Rust path>")
        );
    }

    #[test]
    fn module_parameter_controls_generated_import() {
        let mut value = request();
        value.parameter = Some("module=downstream::wire".into());
        assert!(
            generate(value)
                .file
                .remove(0)
                .content
                .unwrap()
                .contains("use downstream::wire as proto;")
        );
    }

    #[test]
    fn snake_case_matches_protobuf_acronyms() {
        assert_eq!(snake_case("APIService"), "api_service");
        assert_eq!(snake_case("GetURL"), "get_url");
    }

    #[test]
    fn renders_snake_case_protobuf_types_as_prost_type_names() {
        let mut value = request();
        value.proto_file[0].service[0].method[0].input_type =
            Some(".tests.reboot.protoc.get_widget_request".into());
        value.proto_file[0].service[0].method[0].output_type =
            Some(".tests.reboot.protoc.get_widget_response".into());
        let content = generate(value).file.remove(0).content.unwrap();
        assert!(content.contains("proto::GetWidgetRequest"));
        assert!(content.contains("proto::GetWidgetResponse"));
        assert!(!content.contains("proto::get_widget_request"));
        assert!(!content.contains("proto::get_widget_response"));
    }

    #[test]
    fn rejects_cross_service_generated_symbol_collisions() {
        let mut value = request();
        value.proto_file[0].service[0].name = Some("Foo".into());
        value.proto_file[0].service.push(ServiceDescriptorProto {
            name: Some("FooTransaction".into()),
            method: vec![MethodDescriptorProto {
                name: Some("Increment".into()),
                input_type: Some(".tests.reboot.protoc.IncrementRequest".into()),
                output_type: Some(".tests.reboot.protoc.CounterValue".into()),
                ..Default::default()
            }],
            ..Default::default()
        });
        let annotations = HashMap::from([(
            "counter.proto".to_owned(),
            HashMap::from([(
                "Foo".to_owned(),
                DurableService {
                    state: "Counter".to_owned(),
                    default_constructible: true,
                    methods: HashMap::from([(
                        "Increment".to_owned(),
                        DurableKind::Transaction(TransactionMetadata {
                            mode: TransactionMode::Exclusive,
                            factory: false,
                        }),
                    )]),
                },
            )]),
        )]);
        let error = generate_inner(value, annotations).unwrap_err();
        assert!(error.contains("Foo"));
        assert!(error.contains("FooTransaction"));
        assert!(error.contains("FooTransactionHandler"));
    }

    #[test]
    fn rejects_methods_that_render_as_rust_keywords() {
        let mut value = request();
        value.proto_file[0].service[0].method[0].name = Some("Type".into());
        let error = generate(value).error.unwrap();
        assert!(error.contains("CounterWritesMethods"));
        assert!(error.contains("Type"));
        assert!(error.contains("type"));
        assert!(error.contains("Rust keyword"));
    }

    #[test]
    fn rejects_rust_keyword_service_names() {
        let mut value = request();
        value.proto_file[0].service[0].name = Some("Self".into());
        let error = generate(value).error.unwrap();
        assert!(error.contains("counter.proto"));
        assert!(error.contains("Self"));
        assert!(error.contains("valid generated Rust identifier"));
    }

    #[test]
    fn rejects_rust_method_name_collisions() {
        let mut value = request();
        value.proto_file[0].service[0].method = vec![
            MethodDescriptorProto {
                name: Some("GetURL".into()),
                input_type: Some(".tests.reboot.protoc.IncrementRequest".into()),
                output_type: Some(".tests.reboot.protoc.CounterValue".into()),
                ..Default::default()
            },
            MethodDescriptorProto {
                name: Some("GetUrl".into()),
                input_type: Some(".tests.reboot.protoc.IncrementRequest".into()),
                output_type: Some(".tests.reboot.protoc.CounterValue".into()),
                ..Default::default()
            },
        ];
        let error = generate(value).error.unwrap();
        assert!(error.contains("CounterWritesMethods"));
        assert!(error.contains("GetURL"));
        assert!(error.contains("GetUrl"));
        assert!(error.contains("get_url"));
    }

    #[test]
    fn rejects_streaming() {
        let mut value = request();
        value.proto_file[0].service[0].method[0].client_streaming = Some(true);
        assert!(generate(value).error.unwrap().contains("only unary"));
    }
}
