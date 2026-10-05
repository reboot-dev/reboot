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
use std::collections::{BTreeMap, HashMap};

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

#[derive(Message)]
struct RawRequest {
    #[prost(message, repeated, tag = "15")]
    files: Vec<RawFile>,
}
#[derive(Message)]
struct RawDescriptorSet {
    #[prost(message, repeated, tag = "1")]
    files: Vec<RawFile>,
}
#[derive(Message)]
struct RawFile {
    #[prost(string, optional, tag = "1")]
    name: Option<String>,
    #[prost(message, repeated, tag = "6")]
    services: Vec<RawService>,
}
#[derive(Message)]
struct RawService {
    #[prost(string, optional, tag = "1")]
    name: Option<String>,
    #[prost(message, repeated, tag = "2")]
    methods: Vec<RawMethod>,
    #[prost(bytes = "vec", optional, tag = "3")]
    options: Option<Vec<u8>>,
}
#[derive(Message)]
struct RawMethod {
    #[prost(string, optional, tag = "1")]
    name: Option<String>,
    #[prost(bytes = "vec", optional, tag = "4")]
    options: Option<Vec<u8>>,
}
#[derive(Message)]
struct ExtensionOptions {
    #[prost(bytes = "vec", optional, tag = "50000")]
    reboot: Option<Vec<u8>>,
}
#[derive(Message)]
struct RebootServiceOptions {
    #[prost(string, tag = "1")]
    state: String,
    #[prost(bool, tag = "2")]
    default_constructible: bool,
}
#[derive(Message)]
struct RebootWriterMethodOptions {
    #[prost(message, optional, tag = "2")]
    constructor: Option<Empty>,
}
#[derive(Message)]
struct RebootMethodOptions {
    #[prost(message, optional, tag = "1")]
    reader: Option<Empty>,
    #[prost(message, optional, tag = "2")]
    writer: Option<RebootWriterMethodOptions>,
    #[prost(message, optional, tag = "3")]
    transaction: Option<RebootTransactionMethodOptions>,
    #[prost(message, optional, tag = "4")]
    workflow: Option<Empty>,
}
#[derive(Message)]
struct Empty {}

#[derive(Message)]
struct RebootTransactionMethodOptions {
    #[prost(message, optional, tag = "2")]
    constructor: Option<Empty>,
    #[prost(message, optional, tag = "3")]
    exclusive: Option<Empty>,
    #[prost(message, optional, tag = "4")]
    shared: Option<Empty>,
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
    let raw = match RawRequest::decode(input) {
        Ok(value) => value,
        Err(error) => return error_response(error.to_string()),
    };
    let annotations = match annotations(raw.files) {
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
    let annotations = match annotations(raw.files) {
        Ok(value) => value,
        Err(error) => return error_response(error),
    };
    respond(generate_inner(
        CodeGeneratorRequest {
            parameter: Some(format!(
                "{MODULE_PARAMETER_PREFIX}{module},{RUNTIME_MODULE_PARAMETER_PREFIX}{runtime_module}"
            )),
            file_to_generate: file_to_generate.to_vec(),
            proto_file: descriptor_set.file,
            ..Default::default()
        },
        annotations,
    ))
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

fn annotations(
    raw_files: Vec<RawFile>,
) -> Result<HashMap<String, HashMap<String, DurableService>>, String> {
    let mut output = HashMap::new();
    for file in raw_files {
        let Some(file_name) = file.name else { continue };
        let mut services = HashMap::new();
        for service in file.services {
            let Some(service_name) = service.name else {
                continue;
            };
            let Some(options) = service.options else {
                continue;
            };
            let extension = ExtensionOptions::decode(options.as_slice())
                .map_err(|error| format!("{file_name}: invalid service options: {error}"))?;
            let Some(bytes) = extension.reboot else {
                continue;
            };
            let service_option =
                RebootServiceOptions::decode(bytes.as_slice()).map_err(|error| {
                    format!("{file_name}: invalid rbt.v1alpha1.service option: {error}")
                })?;
            if service_option.state.is_empty() {
                return Err(format!(
                    "{file_name}: annotated service `{service_name}` is missing rbt.v1alpha1.service.state"
                ));
            }
            let mut methods = HashMap::new();
            for method in service.methods {
                let Some(method_name) = method.name else {
                    continue;
                };
                let Some(options) = method.options else {
                    continue;
                };
                let extension = ExtensionOptions::decode(options.as_slice())
                    .map_err(|error| format!("{file_name}: invalid method options: {error}"))?;
                let Some(bytes) = extension.reboot else {
                    continue;
                };
                let option = RebootMethodOptions::decode(bytes.as_slice()).map_err(|error| {
                    format!("{file_name}: invalid rbt.v1alpha1.method option: {error}")
                })?;
                let kinds = [
                    option.reader.is_some(),
                    option.writer.is_some(),
                    option.transaction.is_some(),
                    option.workflow.is_some(),
                ]
                .into_iter()
                .filter(|value| *value)
                .count();
                if kinds != 1 {
                    return Err(format!(
                        "{file_name}: annotated method `{service_name}.{method_name}` has no recognized Reboot method kind"
                    ));
                }
                let kind = match (
                    option.reader.is_some(),
                    option.writer.is_some(),
                    option.transaction,
                ) {
                    (true, false, None) => DurableKind::Reader,
                    (false, true, None) => DurableKind::Writer(WriterMetadata {
                        constructor: option
                            .writer
                            .expect("writer presence was checked")
                            .constructor
                            .is_some(),
                    }),
                    (false, false, Some(transaction)) => match (
                        transaction.exclusive.is_some(),
                        transaction.shared.is_some(),
                    ) {
                        (true, false) => DurableKind::Transaction(TransactionMetadata {
                            mode: TransactionMode::Exclusive,
                            factory: transaction.constructor.is_some(),
                        }),
                        (false, true) => DurableKind::Transaction(TransactionMetadata {
                            mode: TransactionMode::Shared,
                            factory: transaction.constructor.is_some(),
                        }),
                        _ => {
                            return Err(format!(
                                "{file_name}: transaction `{service_name}.{method_name}` must choose exactly one of exclusive or shared mode"
                            ));
                        }
                    },
                    _ => unreachable!("the oneof kind count was validated above"),
                };
                methods.insert(method_name, kind);
            }
            services.insert(
                service_name,
                DurableService {
                    state: service_option.state,
                    default_constructible: service_option.default_constructible,
                    methods,
                },
            );
        }
        output.insert(file_name, services);
    }
    Ok(output)
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
                service: vec![ServiceDescriptorProto {
                    name: Some("CounterWrites".into()),
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
        assert!(content.contains("CounterWritesHandler"));
        assert!(content.contains("self.handler.increment(request).await"));
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
                "CounterWrites".to_owned(),
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
                    "CounterWrites".to_owned(),
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
            assert!(content.contains("\"tests.reboot.protoc.CounterWrites.Increment\", request"));
            assert!(!content.contains("\"Counter\", request"));
        }
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
                        transaction: Some(RebootTransactionMethodOptions {
                            constructor: factory.then_some(Empty {}),
                            exclusive: (mode == TransactionMode::Exclusive).then_some(Empty {}),
                            shared: (mode == TransactionMode::Shared).then_some(Empty {}),
                        }),
                        ..Default::default()
                    }
                    .encode_to_vec(),
                ),
            }
            .encode_to_vec()
        };
        let parsed = annotations(vec![RawFile {
            name: Some("counter.proto".to_owned()),
            services: vec![RawService {
                name: Some("CounterTransactions".to_owned()),
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
        let methods = &parsed["counter.proto"]["CounterTransactions"].methods;
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
    fn transaction_handlers_require_execution_envelope_and_executable_tonic_adapter() {
        let annotations = HashMap::from([(
            "counter.proto".to_owned(),
            HashMap::from([(
                "CounterWrites".to_owned(),
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
        assert!(content.contains("pub trait CounterWritesTransactionHandler"));
        assert!(content.contains("pub struct CounterWritesClient<R>"));
        assert!(content.contains("pub struct CounterWritesTarget"));
        assert!(content.contains("TransactionalChannelResolver"));
        assert!(content.contains("transactional_outbound_request"));
        assert!(content.contains("CounterWritesClient::new(channel).increment(request).await?"));
        assert!(content.contains("ReturnedParticipants::from_metadata(response.metadata())"));
        assert!(content.contains("TransactionalCallResponse<proto::CounterValue>"));
        assert!(content.contains("context: &reboot_rust_schema::runtime::TransactionContext"));
        assert!(content.contains("state: &mut proto::Counter"));
        assert!(content.contains("pub struct CounterWritesTransactionAdapter<H, P, C, R, F>"));
        assert!(
            content.contains("impl<H, P, C, R, F> proto::counter_writes_server::CounterWrites")
        );
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
        assert!(!content.contains("CounterWritesDatabaseHandler"));
        assert!(!content.contains("CounterWritesExternalClient"));
        assert!(!content.contains("writer_async_for_method::<CounterDurableState"));
        assert!(!content.contains("impl<H: CounterWritesTransactionHandler> proto::"));
    }

    #[test]
    fn shared_transactions_render_distinct_inbound_and_fresh_root_read_only_paths() {
        let annotations = HashMap::from([(
            "counter.proto".to_owned(),
            HashMap::from([(
                "CounterWrites".to_owned(),
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
                "CounterWrites".to_owned(),
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
                "CounterWrites".to_owned(),
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
                    transaction: Some(RebootTransactionMethodOptions::default()),
                    ..Default::default()
                }
                .encode_to_vec(),
            ),
        }
        .encode_to_vec();
        let result = annotations(vec![RawFile {
            name: Some("counter.proto".to_owned()),
            services: vec![RawService {
                name: Some("CounterTransactions".to_owned()),
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
        assert!(error.contains("must choose exactly one of exclusive or shared mode"));
    }

    #[test]
    fn constructor_aware_database_adapters_require_existing_state_and_reject_constructors() {
        let annotations = HashMap::from([(
            "counter.proto".to_owned(),
            HashMap::from([(
                "CounterWrites".to_owned(),
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
                "CounterWrites".to_owned(),
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
        assert!(content.contains("pub trait CounterWritesTransactionHandler"));
        assert!(content.contains("async fn increment(&self, state: &mut proto::Counter"));
        assert!(content.contains("async fn transaction(&self, context:"));
        assert!(content.contains("pub struct CounterWritesTransactionAdapter"));
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
        assert!(error.contains("CounterWrites"));
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
        assert!(error.contains("CounterWrites"));
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
