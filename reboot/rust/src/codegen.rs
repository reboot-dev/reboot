//! `protoc` plugin support for concrete unary Tonic adapters.
//!
//! The public `generate` entry point retains forwarding-only compatibility.
//! The executable plugin uses `generate_from_wire`, which decodes the real
//! descriptor option extension bytes rather than inferring Reboot semantics.

use heck::ToSnakeCase;
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
    Writer,
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
}
#[derive(Message)]
struct RebootMethodOptions {
    #[prost(message, optional, tag = "1")]
    reader: Option<Empty>,
    #[prost(message, optional, tag = "2")]
    writer: Option<Empty>,
    #[prost(message, optional, tag = "3")]
    transaction: Option<Empty>,
    #[prost(message, optional, tag = "4")]
    workflow: Option<Empty>,
}
#[derive(Message)]
struct Empty {}

#[derive(Clone, Default)]
struct DurableService {
    state: String,
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
                        "{file_name}: annotated method `{service_name}.{method_name}` has no recognized reader/writer kind"
                    ));
                }
                let kind = match (option.reader.is_some(), option.writer.is_some()) {
                    (true, false) => DurableKind::Reader,
                    (false, true) => DurableKind::Writer,
                    _ => {
                        return Err(format!(
                            "{file_name}: annotated method `{service_name}.{method_name}` is unsupported; only reader and writer are supported"
                        ));
                    }
                };
                methods.insert(method_name, kind);
            }
            services.insert(
                service_name,
                DurableService {
                    state: service_option.state,
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

fn emit_forwarding(
    output: &mut String,
    file: &str,
    package: &str,
    service: &ServiceDescriptorProto,
) -> Result<(), String> {
    let name = required(&service.name, "service name")?;
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
    let state = same_package_type(
        file,
        package,
        service_name,
        "<service>",
        "state",
        &Some(format!(
            ".{package}.{}",
            annotation.state.trim_start_matches(&format!("{package}."))
        )),
    )?;
    let state_type = format!("{package}.{state}");
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
    let handler = format!("{service_name}DatabaseHandler");
    let adapter = format!("{service_name}DatabaseAdapter");
    let server = format!("{}_server", snake_case(service_name));
    output.push_str("#[tonic::async_trait]\n");
    output.push_str(&format!("pub trait {handler}: Send + Sync + 'static {{\n"));
    for (kind, method, request, response, _) in &methods {
        output.push_str(&format!("    async fn {method}(&self, state: {}proto::{state}, request: proto::{request}) -> Result<proto::{response}, tonic::Status>;\n", if **kind == DurableKind::Writer { "&mut " } else { "&" }));
    }
    output.push_str("}\n\n");
    output.push_str(&format!("pub struct {adapter}<H> {{ store: {runtime_module}::runtime::DatabaseActorStore, handler: std::sync::Arc<H> }}\nimpl<H> Clone for {adapter}<H> {{ fn clone(&self) -> Self {{ Self {{ store: self.store.clone(), handler: self.handler.clone() }} }} }}\nimpl<H> {adapter}<H> {{ pub fn new(store: {runtime_module}::runtime::DatabaseActorStore, handler: H) -> Self {{ Self {{ store, handler: std::sync::Arc::new(handler) }} }} }}\n\n"));
    output.push_str("#[tonic::async_trait]\n");
    output.push_str(&format!(
        "impl<H: {handler}> proto::{server}::{service_name} for {adapter}<H> {{\n"
    ));
    for (kind, method, request, response, method_identity) in methods {
        let envelope = match kind {
            DurableKind::Reader => "reader_async_for",
            DurableKind::Writer => "writer_async_for_method",
        };
        let method_identity = if *kind == DurableKind::Writer {
            format!("\"{method_identity}\", ")
        } else {
            String::new()
        };
        output.push_str(&format!("    async fn {method}(&self, request: tonic::Request<proto::{request}>) -> Result<tonic::Response<proto::{response}>, tonic::Status> {{\n        let handler = self.handler.clone();\n        self.store.{envelope}::<{declaration}, _, _, _>(\n            {method_identity}request, move |state, request| {{\n                let handler = handler.clone();\n                Box::pin(async move {{ handler.{method}(state, request).await }})\n            }},\n        ).await\n    }}\n"));
    }
    output.push_str("}\n\n");
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
    Ok(name.to_owned())
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
                    methods: HashMap::from([("Increment".to_owned(), DurableKind::Writer)]),
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
        for annotation_state in ["Counter", "tests.reboot.protoc.Counter"] {
            let annotations = HashMap::from([(
                "counter.proto".to_owned(),
                HashMap::from([(
                    "CounterWrites".to_owned(),
                    DurableService {
                        state: annotation_state.to_owned(),
                        methods: HashMap::from([("Increment".to_owned(), DurableKind::Writer)]),
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
    fn rejects_streaming() {
        let mut value = request();
        value.proto_file[0].service[0].method[0].client_streaming = Some(true);
        assert!(generate(value).error.unwrap().contains("only unary"));
    }
}
