//! Experimental Rust input to Reboot's language-neutral `.proto` contract.
//!
//! This is intentionally a schema-only spike. It proves that Rust can emit the
//! existing Reboot descriptor format without Python or Node.js. It does not
//! claim to host a Rust servicer: the current `rbt dev run` launcher supports
//! only `--python` and `--nodejs`.

use std::collections::HashMap;
use std::sync::Mutex;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum FieldType {
    Bool,
    F64,
    I64,
    String,
    /// A named model emitted elsewhere in this application's proto contract.
    Message(&'static str),
    /// A named enum emitted elsewhere in this application's proto contract.
    Enum(&'static str),
    /// A protobuf `repeated` field. The element descriptor is shared so schema
    /// declarations remain `const`-friendly.
    Repeated(&'static FieldType),
    /// A protobuf map. Proto only permits scalar keys, so this cannot produce
    /// an invalid `map<Message, Value>` declaration.
    Map {
        key: MapKeyType,
        value: &'static FieldType,
    },
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum MapKeyType {
    Bool,
    I64,
    String,
}

impl MapKeyType {
    fn proto(self) -> &'static str {
        match self {
            Self::Bool => "bool",
            Self::I64 => "int64",
            Self::String => "string",
        }
    }
}

impl FieldType {
    fn proto(self) -> String {
        match self {
            Self::Bool => "bool".into(),
            Self::F64 => "double".into(),
            Self::I64 => "int64".into(),
            Self::String => "string".into(),
            Self::Message(name) | Self::Enum(name) => name.into(),
            Self::Repeated(element) => element.proto(),
            Self::Map { key, value } => format!("map<{}, {}>", key.proto(), value.proto()),
        }
    }

    fn label(self) -> &'static str {
        match self {
            Self::Repeated(_) => "repeated ",
            Self::Map { .. } => "",
            _ => "optional ",
        }
    }

    fn referenced_type(self) -> Option<&'static str> {
        match self {
            Self::Message(name) | Self::Enum(name) => Some(name),
            Self::Repeated(element) => element.referenced_type(),
            Self::Map { value, .. } => value.referenced_type(),
            _ => None,
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct FieldSpec {
    pub name: &'static str,
    pub tag: u32,
    pub field_type: FieldType,
    pub required: bool,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum MethodKind {
    Reader,
    Writer,
    TransactionExclusive,
    TransactionShared,
    Workflow,
}

impl MethodKind {
    fn proto_option(self) -> &'static str {
        match self {
            Self::Reader => "reader: {}",
            Self::Writer => "writer: {}",
            Self::TransactionExclusive => "transaction: { exclusive: {} }",
            Self::TransactionShared => "transaction: { shared: {} }",
            Self::Workflow => "workflow: {}",
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct MethodSpec {
    pub name: &'static str,
    pub request: &'static str,
    pub response: &'static str,
    pub kind: MethodKind,
    pub description: Option<&'static str>,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct StateSpec {
    pub name: &'static str,
    pub fields: &'static [FieldSpec],
}

/// One stable numeric member of an emitted protobuf enum.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct EnumVariantSpec {
    pub name: &'static str,
    pub number: i32,
}

/// A protobuf enum. The first variant must be the zero/default value required
/// by proto3; its number remains part of the wire contract.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct EnumSpec {
    pub name: &'static str,
    pub variants: &'static [EnumVariantSpec],
}

/// Mutually exclusive protobuf fields. Each member keeps its own stable tag.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct OneOfSpec {
    pub name: &'static str,
    pub fields: &'static [FieldSpec],
}

/// A request or response model in the emitted API contract.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct MessageSpec {
    pub name: &'static str,
    pub fields: &'static [FieldSpec],
    pub oneofs: &'static [OneOfSpec],
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct ServiceSpec {
    pub name: &'static str,
    pub state: &'static str,
    pub methods: &'static [MethodSpec],
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct ApplicationSpec {
    pub package: &'static str,
    pub state: StateSpec,
    /// Enums used by state, request, and response models.
    pub enums: &'static [EnumSpec],
    /// Request and response models used by this service.
    pub messages: &'static [MessageSpec],
    pub service: ServiceSpec,
}

#[derive(Debug, Eq, PartialEq)]
pub enum SchemaError {
    EmptyPackage,
    EmptyName(&'static str),
    InvalidTag {
        field: &'static str,
        tag: u32,
    },
    DuplicateTag(u32),
    DuplicateMessage(&'static str),
    DuplicateEnum(&'static str),
    DuplicateOneOf(&'static str),
    DuplicateMethod(&'static str),
    UnknownMethodMessage(&'static str),
    InvalidEnum(&'static str),
    UnknownMessage(&'static str),
    ServiceStateMismatch {
        service: &'static str,
        state: &'static str,
    },
}

impl std::fmt::Display for SchemaError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::EmptyPackage => write!(f, "package must not be empty"),
            Self::EmptyName(kind) => write!(f, "{kind} name must not be empty"),
            Self::InvalidTag { field, tag } => {
                write!(f, "field `{field}` has invalid protobuf tag {tag}")
            }
            Self::DuplicateTag(tag) => write!(f, "protobuf tag {tag} is used more than once"),
            Self::DuplicateMessage(name) => {
                write!(f, "message `{name}` is declared more than once")
            }
            Self::DuplicateEnum(name) => write!(f, "enum `{name}` is declared more than once"),
            Self::DuplicateOneOf(name) => write!(f, "oneof `{name}` is declared more than once"),
            Self::DuplicateMethod(name) => write!(f, "method `{name}` is declared more than once"),
            Self::UnknownMethodMessage(name) => {
                write!(
                    f,
                    "method request/response message `{name}` is not declared"
                )
            }
            Self::InvalidEnum(name) => write!(
                f,
                "enum `{name}` must have a named zero-valued first variant and unique variant numbers"
            ),
            Self::UnknownMessage(name) => write!(f, "message `{name}` is not declared"),
            Self::ServiceStateMismatch { service, state } => {
                write!(f, "service `{service}` does not target state `{state}`")
            }
        }
    }
}

impl std::error::Error for SchemaError {}

/// A backward-incompatible edit to Reboot's language-neutral wire contract.
///
/// This intentionally errs on the safe side: removing an old field is rejected
/// until a future SDK can emit an explicit protobuf `reserved` declaration.
#[derive(Debug, Eq, PartialEq)]
pub enum CompatibilityError {
    PackageChanged,
    StateChanged,
    MissingMessage(&'static str),
    MissingField { model: &'static str, tag: u32 },
    ChangedField { model: &'static str, tag: u32 },
    MissingMethod(&'static str),
    ChangedMethod(&'static str),
}

impl std::fmt::Display for CompatibilityError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::PackageChanged => write!(f, "protobuf package changed"),
            Self::StateChanged => write!(f, "service state type changed"),
            Self::MissingMessage(name) => write!(f, "message `{name}` was removed"),
            Self::MissingField { model, tag } => {
                write!(f, "field tag {tag} was removed from `{model}`")
            }
            Self::ChangedField { model, tag } => {
                write!(f, "field tag {tag} changed in `{model}`")
            }
            Self::MissingMethod(name) => write!(f, "method `{name}` was removed"),
            Self::ChangedMethod(name) => write!(f, "method `{name}` changed its wire contract"),
        }
    }
}

impl std::error::Error for CompatibilityError {}

fn fields_by_tag<'a>(
    fields: &'a [FieldSpec],
    oneofs: &'a [OneOfSpec],
) -> std::collections::BTreeMap<u32, &'a FieldSpec> {
    fields
        .iter()
        .chain(oneofs.iter().flat_map(|oneof| oneof.fields.iter()))
        .map(|field| (field.tag, field))
        .collect()
}

fn check_model_compatibility(
    model: &'static str,
    previous_fields: &[FieldSpec],
    previous_oneofs: &[OneOfSpec],
    current_fields: &[FieldSpec],
    current_oneofs: &[OneOfSpec],
) -> Result<(), CompatibilityError> {
    let current = fields_by_tag(current_fields, current_oneofs);
    for previous in fields_by_tag(previous_fields, previous_oneofs).into_values() {
        let Some(next) = current.get(&previous.tag) else {
            return Err(CompatibilityError::MissingField {
                model,
                tag: previous.tag,
            });
        };
        if previous.name != next.name
            || previous.field_type != next.field_type
            || previous.required != next.required
        {
            return Err(CompatibilityError::ChangedField {
                model,
                tag: previous.tag,
            });
        }
    }
    Ok(())
}

/// Generated directly from Reboot's existing cross-language test protocol.
///
/// This intentionally bypasses schema reflection and generated Reboot servicer
/// classes. It proves the public protobuf/gRPC client boundary from Rust.
pub mod proto {
    tonic::include_proto!("tests.reboot.protoc");
}

#[derive(Debug, Eq, PartialEq)]
pub enum ContextError {
    InvalidMetadata,
}

impl std::fmt::Display for ContextError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::InvalidMetadata => write!(f, "Reboot metadata value is invalid"),
        }
    }
}

impl std::error::Error for ContextError {}

/// The portable subset of Reboot's external-call context.
///
/// `state_ref` must already be a valid encoded Reboot state reference. Encoding
/// state type tags is still owned by the current runtime; this client never
/// guesses or synthesizes them.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ExternalContext {
    state_ref: String,
    bearer_token: Option<String>,
}

impl ExternalContext {
    pub fn new(state_ref: impl Into<String>) -> Self {
        Self {
            state_ref: state_ref.into(),
            bearer_token: None,
        }
    }

    pub fn with_bearer_token(mut self, bearer_token: impl Into<String>) -> Self {
        self.bearer_token = Some(bearer_token.into());
        self
    }

    pub fn reader<T>(&self, message: T) -> Result<tonic::Request<T>, ContextError> {
        self.request(message, None)
    }

    pub fn writer<T>(&self, message: T) -> Result<tonic::Request<T>, ContextError> {
        self.request(message, Some(uuid::Uuid::new_v4()))
    }

    fn request<T>(
        &self,
        message: T,
        idempotency_key: Option<uuid::Uuid>,
    ) -> Result<tonic::Request<T>, ContextError> {
        let mut request = tonic::Request::new(message);
        request.metadata_mut().insert(
            "x-reboot-state-ref",
            self.state_ref
                .parse()
                .map_err(|_| ContextError::InvalidMetadata)?,
        );
        if let Some(key) = idempotency_key {
            request.metadata_mut().insert(
                "x-reboot-idempotency-key",
                key.to_string()
                    .parse()
                    .map_err(|_| ContextError::InvalidMetadata)?,
            );
        }
        if let Some(token) = &self.bearer_token {
            request.metadata_mut().insert(
                "authorization",
                format!("Bearer {token}")
                    .parse()
                    .map_err(|_| ContextError::InvalidMetadata)?,
            );
        }
        Ok(request)
    }
}

/// Small, executable runtime slice: serialized actor state plus write
/// idempotency. It intentionally uses process-local memory; durable storage,
/// distributed locks, and multi-actor transactions remain separate layers.
pub struct InMemoryActor<State, Response> {
    inner: Mutex<InMemoryActorState<State, Response>>,
}

struct InMemoryActorState<State, Response> {
    state: State,
    completed_writes: HashMap<uuid::Uuid, Response>,
}

impl<State, Response> InMemoryActor<State, Response>
where
    Response: Clone,
{
    pub fn new(state: State) -> Self {
        Self {
            inner: Mutex::new(InMemoryActorState {
                state,
                completed_writes: HashMap::new(),
            }),
        }
    }

    /// Reads one consistent state snapshot while excluding concurrent writers.
    pub fn reader<Value>(&self, read: impl FnOnce(&State) -> Value) -> Value {
        let guard = self.inner.lock().expect("actor state mutex poisoned");
        read(&guard.state)
    }

    /// Runs a write exactly once for one idempotency key and returns the cached
    /// response on replay. State and cached response become visible together.
    pub fn writer(
        &self,
        idempotency_key: uuid::Uuid,
        write: impl FnOnce(&mut State) -> Response,
    ) -> Response {
        let mut guard = self.inner.lock().expect("actor state mutex poisoned");
        if let Some(response) = guard.completed_writes.get(&idempotency_key) {
            return response.clone();
        }
        let response = write(&mut guard.state);
        guard
            .completed_writes
            .insert(idempotency_key, response.clone());
        response
    }
}

impl<State, Response> InMemoryActor<State, Response>
where
    State: Clone,
    Response: Clone,
{
    /// Runs a fallible write atomically. A returned error restores the complete
    /// pre-write state and is deliberately not cached: a retry with the same
    /// idempotency key gets another execution attempt.
    pub fn writer_transactional<Error>(
        &self,
        idempotency_key: uuid::Uuid,
        write: impl FnOnce(&mut State) -> Result<Response, Error>,
    ) -> Result<Response, Error> {
        let mut guard = self.inner.lock().expect("actor state mutex poisoned");
        if let Some(response) = guard.completed_writes.get(&idempotency_key) {
            return Ok(response.clone());
        }
        let checkpoint = guard.state.clone();
        match write(&mut guard.state) {
            Ok(response) => {
                guard
                    .completed_writes
                    .insert(idempotency_key, response.clone());
                Ok(response)
            }
            Err(error) => {
                guard.state = checkpoint;
                Err(error)
            }
        }
    }
}

impl ApplicationSpec {
    pub fn validate(&self) -> Result<(), SchemaError> {
        if self.package.is_empty() {
            return Err(SchemaError::EmptyPackage);
        }
        if self.state.name.is_empty() {
            return Err(SchemaError::EmptyName("state"));
        }
        if self.service.name.is_empty() {
            return Err(SchemaError::EmptyName("service"));
        }
        if self.service.state != self.state.name {
            return Err(SchemaError::ServiceStateMismatch {
                service: self.service.name,
                state: self.state.name,
            });
        }

        let mut tags = std::collections::BTreeSet::new();
        for field in self.state.fields {
            if field.name.is_empty() {
                return Err(SchemaError::EmptyName("field"));
            }
            if field.tag == 0 || (19000..=19999).contains(&field.tag) {
                return Err(SchemaError::InvalidTag {
                    field: field.name,
                    tag: field.tag,
                });
            }
            if !tags.insert(field.tag) {
                return Err(SchemaError::DuplicateTag(field.tag));
            }
        }
        let mut enum_names = std::collections::BTreeSet::new();
        for enum_spec in self.enums {
            if enum_spec.name.is_empty() {
                return Err(SchemaError::EmptyName("enum"));
            }
            if !enum_names.insert(enum_spec.name) {
                return Err(SchemaError::DuplicateEnum(enum_spec.name));
            }
            let Some(first) = enum_spec.variants.first() else {
                return Err(SchemaError::InvalidEnum(enum_spec.name));
            };
            if first.name.is_empty() || first.number != 0 {
                return Err(SchemaError::InvalidEnum(enum_spec.name));
            }
            let mut numbers = std::collections::BTreeSet::new();
            for variant in enum_spec.variants {
                if variant.name.is_empty() || !numbers.insert(variant.number) {
                    return Err(SchemaError::InvalidEnum(enum_spec.name));
                }
            }
        }

        let mut message_names = std::collections::BTreeSet::new();
        for message in self.messages {
            if message.name.is_empty() {
                return Err(SchemaError::EmptyName("message"));
            }
            if !message_names.insert(message.name) {
                return Err(SchemaError::DuplicateMessage(message.name));
            }
            let mut tags = std::collections::BTreeSet::new();
            for field in message.fields {
                if field.name.is_empty() {
                    return Err(SchemaError::EmptyName("field"));
                }
                if field.tag == 0 || (19000..=19999).contains(&field.tag) {
                    return Err(SchemaError::InvalidTag {
                        field: field.name,
                        tag: field.tag,
                    });
                }
                if !tags.insert(field.tag) {
                    return Err(SchemaError::DuplicateTag(field.tag));
                }
            }
            let mut oneof_names = std::collections::BTreeSet::new();
            for oneof in message.oneofs {
                if oneof.name.is_empty() {
                    return Err(SchemaError::EmptyName("oneof"));
                }
                if !oneof_names.insert(oneof.name) {
                    return Err(SchemaError::DuplicateOneOf(oneof.name));
                }
                if oneof.fields.is_empty() {
                    return Err(SchemaError::EmptyName("oneof field"));
                }
                for field in oneof.fields {
                    if field.name.is_empty() {
                        return Err(SchemaError::EmptyName("field"));
                    }
                    if field.tag == 0 || (19000..=19999).contains(&field.tag) {
                        return Err(SchemaError::InvalidTag {
                            field: field.name,
                            tag: field.tag,
                        });
                    }
                    if !tags.insert(field.tag) {
                        return Err(SchemaError::DuplicateTag(field.tag));
                    }
                }
            }
        }

        let mut method_names = std::collections::BTreeSet::new();
        for method in self.service.methods {
            if method.name.is_empty() {
                return Err(SchemaError::EmptyName("method"));
            }
            if !method_names.insert(method.name) {
                return Err(SchemaError::DuplicateMethod(method.name));
            }
            for message in [method.request, method.response] {
                if message.is_empty()
                    || !self
                        .messages
                        .iter()
                        .any(|declared| declared.name == message)
                {
                    return Err(SchemaError::UnknownMethodMessage(message));
                }
            }
        }

        for field in self.state.fields.iter().chain(
            self.messages
                .iter()
                .flat_map(|message| message.fields.iter())
                .chain(self.messages.iter().flat_map(|message| {
                    message.oneofs.iter().flat_map(|oneof| oneof.fields.iter())
                })),
        ) {
            if let Some(name) = field.field_type.referenced_type() {
                let declared = name == self.state.name
                    || self.messages.iter().any(|message| message.name == name)
                    || self.enums.iter().any(|enum_spec| enum_spec.name == name);
                if !declared {
                    return Err(SchemaError::UnknownMessage(name));
                }
            }
        }
        Ok(())
    }

    /// Rejects edits that would change the already-published Reboot wire API.
    /// Both specs should pass [`Self::validate`] before this comparison.
    pub fn check_backward_compatible_with(
        &self,
        previous: &ApplicationSpec,
    ) -> Result<(), CompatibilityError> {
        if self.package != previous.package {
            return Err(CompatibilityError::PackageChanged);
        }
        if self.state.name != previous.state.name || self.service.state != previous.service.state {
            return Err(CompatibilityError::StateChanged);
        }
        check_model_compatibility(
            previous.state.name,
            previous.state.fields,
            &[],
            self.state.fields,
            &[],
        )?;

        for previous_message in previous.messages {
            let Some(current_message) = self
                .messages
                .iter()
                .find(|message| message.name == previous_message.name)
            else {
                return Err(CompatibilityError::MissingMessage(previous_message.name));
            };
            check_model_compatibility(
                previous_message.name,
                previous_message.fields,
                previous_message.oneofs,
                current_message.fields,
                current_message.oneofs,
            )?;
        }

        for previous_method in previous.service.methods {
            let Some(current_method) = self
                .service
                .methods
                .iter()
                .find(|method| method.name == previous_method.name)
            else {
                return Err(CompatibilityError::MissingMethod(previous_method.name));
            };
            if current_method.request != previous_method.request
                || current_method.response != previous_method.response
                || current_method.kind != previous_method.kind
            {
                return Err(CompatibilityError::ChangedMethod(previous_method.name));
            }
        }
        Ok(())
    }

    /// Emits source compatible with Reboot's existing `rbt/v1alpha1/options.proto`.
    pub fn to_proto(&self) -> Result<String, SchemaError> {
        self.validate()?;
        let mut proto =
            String::from("syntax = \"proto3\";\n\nimport \"rbt/v1alpha1/options.proto\";\n\n");
        proto.push_str("package ");
        proto.push_str(self.package);
        proto.push_str(";\n\n");

        proto.push_str("message ");
        proto.push_str(self.state.name);
        proto.push_str(" {\n  option (rbt.v1alpha1.state) = {};\n");
        for field in self.state.fields {
            proto.push_str("  ");
            proto.push_str(field.field_type.label());
            proto.push_str(&field.field_type.proto());
            proto.push(' ');
            proto.push_str(field.name);
            proto.push_str(" = ");
            proto.push_str(&field.tag.to_string());
            proto.push_str(" [(rbt.v1alpha1.field).required = ");
            proto.push_str(if field.required { "true" } else { "false" });
            proto.push_str("];\n");
        }
        proto.push_str("}\n\n");

        for enum_spec in self.enums {
            proto.push_str("enum ");
            proto.push_str(enum_spec.name);
            proto.push_str(" {\n");
            for variant in enum_spec.variants {
                proto.push_str("  ");
                proto.push_str(variant.name);
                proto.push_str(" = ");
                proto.push_str(&variant.number.to_string());
                proto.push_str(";\n");
            }
            proto.push_str("}\n\n");
        }

        for message in self.messages {
            proto.push_str("message ");
            proto.push_str(message.name);
            proto.push_str(" {\n");
            for field in message.fields {
                proto.push_str("  ");
                proto.push_str(field.field_type.label());
                proto.push_str(&field.field_type.proto());
                proto.push(' ');
                proto.push_str(field.name);
                proto.push_str(" = ");
                proto.push_str(&field.tag.to_string());
                proto.push_str(" [(rbt.v1alpha1.field).required = ");
                proto.push_str(if field.required { "true" } else { "false" });
                proto.push_str("];\n");
            }
            for oneof in message.oneofs {
                proto.push_str("  oneof ");
                proto.push_str(oneof.name);
                proto.push_str(" {\n");
                for field in oneof.fields {
                    proto.push_str("    ");
                    proto.push_str(&field.field_type.proto());
                    proto.push(' ');
                    proto.push_str(field.name);
                    proto.push_str(" = ");
                    proto.push_str(&field.tag.to_string());
                    proto.push_str(" [(rbt.v1alpha1.field).required = ");
                    proto.push_str(if field.required { "true" } else { "false" });
                    proto.push_str("];\n");
                }
                proto.push_str("  }\n");
            }
            proto.push_str("}\n\n");
        }

        proto.push_str("service ");
        proto.push_str(self.service.name);
        proto.push_str(" {\n  option (rbt.v1alpha1.service) = { state: \"");
        proto.push_str(self.service.state);
        proto.push_str("\" };\n");
        for method in self.service.methods {
            proto.push_str("  rpc ");
            proto.push_str(method.name);
            proto.push('(');
            proto.push_str(method.request);
            proto.push_str(") returns (");
            proto.push_str(method.response);
            proto.push_str(") {\n    option (rbt.v1alpha1.method) = { ");
            proto.push_str(method.kind.proto_option());
            if let Some(description) = method.description {
                proto.push_str(", description: \"");
                proto.push_str(description);
                proto.push('"');
            }
            proto.push_str(" };\n  }\n");
        }
        proto.push_str("}\n");
        Ok(proto)
    }
}

const STRING_FIELD: FieldType = FieldType::String;
const PHONE_NUMBER_FIELD: FieldType = FieldType::Message("PhoneNumber");

pub const CLINIC: ApplicationSpec = ApplicationSpec {
    package: "clinic.v1",
    state: StateSpec {
        name: "Clinic",
        fields: &[
            FieldSpec {
                name: "name",
                tag: 1,
                field_type: FieldType::String,
                required: true,
            },
            FieldSpec {
                name: "phone_number",
                tag: 2,
                field_type: FieldType::String,
                required: false,
            },
        ],
    },
    enums: &[EnumSpec {
        name: "ClinicStatus",
        variants: &[
            EnumVariantSpec {
                name: "CLINIC_STATUS_UNSPECIFIED",
                number: 0,
            },
            EnumVariantSpec {
                name: "CLINIC_STATUS_OPEN",
                number: 1,
            },
            EnumVariantSpec {
                name: "CLINIC_STATUS_CLOSED",
                number: 2,
            },
        ],
    }],
    messages: &[
        MessageSpec {
            name: "RenameRequest",
            fields: &[FieldSpec {
                name: "name",
                tag: 1,
                field_type: FieldType::String,
                required: true,
            }],
            oneofs: &[],
        },
        MessageSpec {
            name: "RenameResponse",
            fields: &[],
            oneofs: &[],
        },
        MessageSpec {
            name: "DetailsRequest",
            fields: &[],
            oneofs: &[],
        },
        MessageSpec {
            name: "PhoneNumber",
            fields: &[FieldSpec {
                name: "value",
                tag: 1,
                field_type: FieldType::String,
                required: true,
            }],
            oneofs: &[],
        },
        MessageSpec {
            name: "DetailsResponse",
            fields: &[
                FieldSpec {
                    name: "name",
                    tag: 1,
                    field_type: FieldType::String,
                    required: true,
                },
                FieldSpec {
                    name: "phone",
                    tag: 2,
                    field_type: FieldType::Message("PhoneNumber"),
                    required: false,
                },
                FieldSpec {
                    name: "aliases",
                    tag: 3,
                    field_type: FieldType::Repeated(&STRING_FIELD),
                    required: false,
                },
                FieldSpec {
                    name: "phone_book",
                    tag: 4,
                    field_type: FieldType::Map {
                        key: MapKeyType::String,
                        value: &PHONE_NUMBER_FIELD,
                    },
                    required: false,
                },
                FieldSpec {
                    name: "status",
                    tag: 5,
                    field_type: FieldType::Enum("ClinicStatus"),
                    required: false,
                },
            ],
            oneofs: &[OneOfSpec {
                name: "preferred_contact",
                fields: &[
                    FieldSpec {
                        name: "email",
                        tag: 6,
                        field_type: FieldType::String,
                        required: false,
                    },
                    FieldSpec {
                        name: "pager",
                        tag: 7,
                        field_type: FieldType::String,
                        required: false,
                    },
                ],
            }],
        },
    ],
    service: ServiceSpec {
        name: "ClinicMethods",
        state: "Clinic",
        methods: &[
            MethodSpec {
                name: "Rename",
                request: "RenameRequest",
                response: "RenameResponse",
                kind: MethodKind::Writer,
                description: Some("Renames the clinic."),
            },
            MethodSpec {
                name: "Details",
                request: "DetailsRequest",
                response: "DetailsResponse",
                kind: MethodKind::Reader,
                description: Some("Reads clinic details."),
            },
        ],
    },
};

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn clinic_emits_reboot_compatible_proto() {
        let proto = CLINIC.to_proto().unwrap();
        assert!(proto.contains("import \"rbt/v1alpha1/options.proto\";"));
        assert!(proto.contains("option (rbt.v1alpha1.state) = {};"));
        assert!(
            proto.contains(
                "optional string phone_number = 2 [(rbt.v1alpha1.field).required = false];"
            )
        );
        assert!(proto.contains("message RenameRequest {\n  optional string name = 1"));
        assert!(proto.contains("optional PhoneNumber phone = 2"));
        assert!(proto.contains("repeated string aliases = 3"));
        assert!(proto.contains("map<string, PhoneNumber> phone_book = 4"));
        assert!(proto.contains("enum ClinicStatus {\n  CLINIC_STATUS_UNSPECIFIED = 0;"));
        assert!(proto.contains("optional ClinicStatus status = 5"));
        assert!(proto.contains("oneof preferred_contact {\n    string email = 6"));
        assert!(proto.contains(
            "option (rbt.v1alpha1.method) = { writer: {}, description: \"Renames the clinic.\" };"
        ));
    }

    #[test]
    fn emitted_proto_compiles_against_reboots_options() {
        let directory = tempfile::tempdir().unwrap();
        let source = directory.path().join("clinic.proto");
        let descriptor = directory.path().join("clinic.pb");
        std::fs::write(&source, CLINIC.to_proto().unwrap()).unwrap();

        let repository = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .ancestors()
            .nth(2)
            .unwrap();
        let status = std::process::Command::new(protoc_bin_vendored::protoc_bin_path().unwrap())
            .arg(format!("--proto_path={}", repository.display()))
            .arg(format!("--proto_path={}", directory.path().display()))
            .arg(format!("--descriptor_set_out={}", descriptor.display()))
            .arg(&source)
            .status()
            .unwrap();
        assert!(status.success());
        assert!(descriptor.is_file());
    }

    #[test]
    fn external_context_attaches_reboot_metadata() {
        let context = ExternalContext::new("opaque-state-ref").with_bearer_token("test-token");
        let request = context
            .writer(proto::Text {
                content: "hello from rust".to_owned(),
            })
            .unwrap();
        let metadata = request.metadata();
        assert_eq!(
            metadata.get("x-reboot-state-ref").unwrap(),
            "opaque-state-ref"
        );
        assert!(
            uuid::Uuid::parse_str(
                metadata
                    .get("x-reboot-idempotency-key")
                    .unwrap()
                    .to_str()
                    .unwrap()
            )
            .is_ok()
        );
        assert_eq!(metadata.get("authorization").unwrap(), "Bearer test-token");

        let reader = context.reader(proto::Empty {}).unwrap();
        assert!(reader.metadata().get("x-reboot-idempotency-key").is_none());
    }

    #[tokio::test]
    async fn generated_client_reaches_a_tonic_service_with_reboot_context() {
        #[derive(Default)]
        struct Echo;

        #[tonic::async_trait]
        impl proto::echo_methods_server::EchoMethods for Echo {
            async fn reply(
                &self,
                request: tonic::Request<proto::Text>,
            ) -> Result<tonic::Response<proto::Text>, tonic::Status> {
                let metadata = request.metadata();
                if metadata
                    .get("x-reboot-state-ref")
                    .and_then(|value| value.to_str().ok())
                    != Some("echo-42")
                    || metadata.get("x-reboot-idempotency-key").is_none()
                    || metadata
                        .get("authorization")
                        .and_then(|value| value.to_str().ok())
                        != Some("Bearer integration-token")
                {
                    return Err(tonic::Status::unauthenticated("missing Reboot context"));
                }
                Ok(tonic::Response::new(request.into_inner()))
            }

            async fn last_message(
                &self,
                _request: tonic::Request<proto::Empty>,
            ) -> Result<tonic::Response<proto::Text>, tonic::Status> {
                Ok(tonic::Response::new(proto::Text {
                    content: "last message".to_owned(),
                }))
            }
        }

        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let server = tokio::spawn(async move {
            tonic::transport::Server::builder()
                .add_service(proto::echo_methods_server::EchoMethodsServer::new(Echo))
                .serve_with_incoming(tokio_stream::wrappers::TcpListenerStream::new(listener))
                .await
                .unwrap();
        });

        let mut client =
            proto::echo_methods_client::EchoMethodsClient::connect(format!("http://{address}"))
                .await
                .unwrap();
        let context = ExternalContext::new("echo-42").with_bearer_token("integration-token");
        let reply = client
            .reply(
                context
                    .writer(proto::Text {
                        content: "hello from rust".to_owned(),
                    })
                    .unwrap(),
            )
            .await
            .unwrap()
            .into_inner();
        assert_eq!(reply.content, "hello from rust");
        server.abort();
    }

    #[test]
    fn in_memory_actor_serializes_and_deduplicates_writes() {
        let actor = InMemoryActor::<i64, i64>::new(0);
        let key = uuid::Uuid::new_v4();
        assert_eq!(
            actor.writer(key, |state| {
                *state += 1;
                *state
            }),
            1
        );
        assert_eq!(
            actor.writer(key, |state| {
                *state += 1;
                *state
            }),
            1
        );
        assert_eq!(actor.reader(|state| *state), 1);
    }

    #[test]
    fn in_memory_actor_rolls_back_failed_transactional_writes() {
        let actor = InMemoryActor::<i64, i64>::new(0);
        let key = uuid::Uuid::new_v4();
        assert_eq!(
            actor.writer_transactional(key, |state| {
                *state += 1;
                Err::<i64, _>("rollback")
            }),
            Err("rollback")
        );
        assert_eq!(actor.reader(|state| *state), 0);

        assert_eq!(
            actor.writer_transactional(key, |state| {
                *state += 1;
                Ok::<i64, &str>(*state)
            }),
            Ok(1)
        );
        assert_eq!(
            actor.writer_transactional(key, |state| {
                *state += 1;
                Ok::<i64, &str>(*state)
            }),
            Ok(1)
        );
        assert_eq!(actor.reader(|state| *state), 1);
    }

    #[test]
    fn rejects_an_undeclared_nested_model() {
        let mut invalid = CLINIC;
        invalid.state.fields = &[FieldSpec {
            name: "address",
            tag: 1,
            field_type: FieldType::Message("Address"),
            required: false,
        }];
        assert_eq!(
            invalid.validate(),
            Err(SchemaError::UnknownMessage("Address"))
        );
    }

    #[test]
    fn compatibility_rejects_reusing_a_published_field_tag() {
        assert_eq!(CLINIC.check_backward_compatible_with(&CLINIC), Ok(()));

        let mut changed = CLINIC;
        changed.state.fields = &[
            FieldSpec {
                name: "renamed",
                tag: 1,
                field_type: FieldType::String,
                required: true,
            },
            FieldSpec {
                name: "phone_number",
                tag: 2,
                field_type: FieldType::String,
                required: false,
            },
        ];
        assert_eq!(
            changed.check_backward_compatible_with(&CLINIC),
            Err(CompatibilityError::ChangedField {
                model: "Clinic",
                tag: 1,
            })
        );
    }

    #[test]
    fn rejects_methods_with_undeclared_messages() {
        let mut invalid = CLINIC;
        invalid.service.methods = &[MethodSpec {
            name: "Broken",
            request: "MissingRequest",
            response: "RenameResponse",
            kind: MethodKind::Reader,
            description: None,
        }];
        assert_eq!(
            invalid.validate(),
            Err(SchemaError::UnknownMethodMessage("MissingRequest"))
        );
    }

    #[test]
    fn rejects_oneof_tags_that_collide_with_ordinary_fields() {
        let mut invalid = CLINIC;
        invalid.messages = &[MessageSpec {
            name: "Message",
            fields: &[FieldSpec {
                name: "ordinary",
                tag: 1,
                field_type: FieldType::String,
                required: false,
            }],
            oneofs: &[OneOfSpec {
                name: "choice",
                fields: &[FieldSpec {
                    name: "alternative",
                    tag: 1,
                    field_type: FieldType::String,
                    required: false,
                }],
            }],
        }];
        assert_eq!(invalid.validate(), Err(SchemaError::DuplicateTag(1)));
    }

    #[test]
    fn rejects_enums_without_a_zero_default() {
        let mut invalid = CLINIC;
        invalid.enums = &[EnumSpec {
            name: "Broken",
            variants: &[EnumVariantSpec {
                name: "BROKEN_ONE",
                number: 1,
            }],
        }];
        assert_eq!(invalid.validate(), Err(SchemaError::InvalidEnum("Broken")));
    }

    #[test]
    fn rejects_duplicate_or_reserved_tags() {
        let mut invalid = CLINIC;
        invalid.state.fields = &[
            FieldSpec {
                name: "first",
                tag: 1,
                field_type: FieldType::String,
                required: true,
            },
            FieldSpec {
                name: "second",
                tag: 1,
                field_type: FieldType::String,
                required: true,
            },
        ];
        assert_eq!(invalid.validate(), Err(SchemaError::DuplicateTag(1)));

        invalid.state.fields = &[FieldSpec {
            name: "bad",
            tag: 19000,
            field_type: FieldType::String,
            required: true,
        }];
        assert_eq!(
            invalid.validate(),
            Err(SchemaError::InvalidTag {
                field: "bad",
                tag: 19000
            })
        );
    }
}
