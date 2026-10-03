//! Experimental Rust input to Reboot's language-neutral `.proto` contract.
//!
//! Tonic generates service traits with `tonic::Status` error values. Those
//! transport signatures are fixed by the generated gRPC contract, so boxing
//! them to satisfy `clippy::result_large_err` would make the bindings invalid.
#![allow(clippy::result_large_err)]
//!
//! This is intentionally a schema-only spike. It proves that Rust can emit the
//! existing Reboot descriptor format without Python or Node.js. It does not
//! claim to host a production Rust servicer: the current `rbt dev run` launcher
//! supports only `--python` and `--nodejs`. The [`runtime`] module provides a
//! deliberately scoped Tonic service adapters for executable testing.

#[cfg(feature = "build")]
pub mod build;
pub mod codegen;
pub mod durable_coordinator;
pub mod durable_participant;
pub mod runtime;
pub mod successful_trailers;

use std::collections::HashMap;
use std::sync::Mutex;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum FieldType {
    Bool,
    Bytes,
    F32,
    F64,
    Fixed32,
    Fixed64,
    I32,
    I64,
    SFixed32,
    SFixed64,
    SInt32,
    SInt64,
    String,
    U32,
    U64,
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
    Fixed32,
    Fixed64,
    I32,
    I64,
    SFixed32,
    SFixed64,
    SInt32,
    SInt64,
    String,
    U32,
    U64,
}

impl MapKeyType {
    fn proto(self) -> &'static str {
        match self {
            Self::Bool => "bool",
            Self::Fixed32 => "fixed32",
            Self::Fixed64 => "fixed64",
            Self::I32 => "int32",
            Self::I64 => "int64",
            Self::SFixed32 => "sfixed32",
            Self::SFixed64 => "sfixed64",
            Self::SInt32 => "sint32",
            Self::SInt64 => "sint64",
            Self::String => "string",
            Self::U32 => "uint32",
            Self::U64 => "uint64",
        }
    }
}

impl FieldType {
    fn proto(self) -> String {
        match self {
            Self::Bool => "bool".into(),
            Self::Bytes => "bytes".into(),
            Self::F32 => "float".into(),
            Self::F64 => "double".into(),
            Self::Fixed32 => "fixed32".into(),
            Self::Fixed64 => "fixed64".into(),
            Self::I32 => "int32".into(),
            Self::I64 => "int64".into(),
            Self::SFixed32 => "sfixed32".into(),
            Self::SFixed64 => "sfixed64".into(),
            Self::SInt32 => "sint32".into(),
            Self::SInt64 => "sint64".into(),
            Self::String => "string".into(),
            Self::U32 => "uint32".into(),
            Self::U64 => "uint64".into(),
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

    fn has_valid_shape(self) -> bool {
        match self {
            Self::Repeated(element) => !matches!(*element, Self::Repeated(_) | Self::Map { .. }),
            Self::Map { value, .. } => !matches!(*value, Self::Repeated(_) | Self::Map { .. }),
            _ => true,
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
pub struct ReservedFields {
    /// Tags that must never be reused after their fields are removed.
    pub tags: &'static [u32],
    /// Names that must never be reused after their fields are removed.
    pub names: &'static [&'static str],
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct StateSpec {
    pub name: &'static str,
    pub fields: &'static [FieldSpec],
    pub reserved: ReservedFields,
}

/// One stable numeric member of an emitted protobuf enum.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct EnumVariantSpec {
    pub name: &'static str,
    pub number: i32,
}

/// A protobuf enum. The first variant must be the zero/default value required
/// by proto3; variant names and numbers remain part of the wire contract.
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
    pub reserved: ReservedFields,
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
    InvalidPackage(&'static str),
    InvalidIdentifier {
        kind: &'static str,
        name: &'static str,
    },
    EmptyName(&'static str),
    InvalidTag {
        field: &'static str,
        tag: u32,
    },
    InvalidReservation,
    InvalidFieldShape(&'static str),
    DuplicateTag(u32),
    DuplicateField(&'static str),
    DuplicateType(&'static str),
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
            Self::InvalidPackage(package) => {
                write!(f, "package `{package}` is not a valid protobuf package")
            }
            Self::InvalidIdentifier { kind, name } => {
                write!(f, "{kind} `{name}` is not a valid protobuf identifier")
            }
            Self::EmptyName(kind) => write!(f, "{kind} name must not be empty"),
            Self::InvalidTag { field, tag } => {
                write!(f, "field `{field}` has invalid protobuf tag {tag}")
            }
            Self::InvalidReservation => write!(
                f,
                "reserved field tags/names must be valid, unique, and unused by active fields"
            ),
            Self::InvalidFieldShape(field) => write!(
                f,
                "field `{field}` nests repeated or map collections in an invalid protobuf shape"
            ),
            Self::DuplicateTag(tag) => write!(f, "protobuf tag {tag} is used more than once"),
            Self::DuplicateField(name) => write!(f, "field `{name}` is declared more than once"),
            Self::DuplicateType(name) => {
                write!(
                    f,
                    "top-level protobuf type `{name}` is declared more than once"
                )
            }
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
    MissingReservedTag {
        model: &'static str,
        tag: u32,
    },
    MissingReservedName {
        model: &'static str,
        name: &'static str,
    },
    MissingEnum(&'static str),
    MissingEnumVariant {
        enum_name: &'static str,
        variant: &'static str,
    },
    ChangedEnumVariant {
        enum_name: &'static str,
        variant: &'static str,
    },
    MissingMessage(&'static str),
    MissingField {
        model: &'static str,
        tag: u32,
    },
    ChangedField {
        model: &'static str,
        tag: u32,
    },
    MissingMethod(&'static str),
    ChangedMethod(&'static str),
}

impl std::fmt::Display for CompatibilityError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::PackageChanged => write!(f, "protobuf package changed"),
            Self::StateChanged => write!(f, "service state type changed"),
            Self::MissingReservedTag { model, tag } => {
                write!(f, "reserved tag {tag} was removed from `{model}`")
            }
            Self::MissingReservedName { model, name } => {
                write!(f, "reserved field name `{name}` was removed from `{model}`")
            }
            Self::MissingEnum(name) => write!(f, "enum `{name}` was removed"),
            Self::MissingEnumVariant { enum_name, variant } => {
                write!(f, "enum variant `{enum_name}.{variant}` was removed")
            }
            Self::ChangedEnumVariant { enum_name, variant } => {
                write!(
                    f,
                    "enum variant `{enum_name}.{variant}` changed its numeric value"
                )
            }
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

fn oneof_for_tag(oneofs: &[OneOfSpec], tag: u32) -> Option<&'static str> {
    oneofs
        .iter()
        .find(|oneof| oneof.fields.iter().any(|field| field.tag == tag))
        .map(|oneof| oneof.name)
}

fn check_model_compatibility(
    model: &'static str,
    previous_fields: &[FieldSpec],
    previous_oneofs: &[OneOfSpec],
    current_fields: &[FieldSpec],
    current_oneofs: &[OneOfSpec],
    previous_reserved: ReservedFields,
    current_reserved: ReservedFields,
) -> Result<(), CompatibilityError> {
    for tag in previous_reserved.tags {
        if !current_reserved.tags.contains(tag) {
            return Err(CompatibilityError::MissingReservedTag { model, tag: *tag });
        }
    }
    for name in previous_reserved.names {
        if !current_reserved.names.contains(name) {
            return Err(CompatibilityError::MissingReservedName { model, name });
        }
    }
    let current = fields_by_tag(current_fields, current_oneofs);
    for previous in fields_by_tag(previous_fields, previous_oneofs).into_values() {
        let Some(next) = current.get(&previous.tag) else {
            if current_reserved.tags.contains(&previous.tag)
                && current_reserved.names.contains(&previous.name)
            {
                continue;
            }
            return Err(CompatibilityError::MissingField {
                model,
                tag: previous.tag,
            });
        };
        if previous.name != next.name
            || previous.field_type != next.field_type
            || previous.required != next.required
            || oneof_for_tag(previous_oneofs, previous.tag)
                != oneof_for_tag(current_oneofs, previous.tag)
        {
            return Err(CompatibilityError::ChangedField {
                model,
                tag: previous.tag,
            });
        }
    }
    Ok(())
}

fn check_enum_compatibility(
    previous: &EnumSpec,
    current: &EnumSpec,
) -> Result<(), CompatibilityError> {
    for previous_variant in previous.variants {
        let Some(next) = current
            .variants
            .iter()
            .find(|variant| variant.name == previous_variant.name)
        else {
            return Err(CompatibilityError::MissingEnumVariant {
                enum_name: previous.name,
                variant: previous_variant.name,
            });
        };
        if next.number != previous_variant.number {
            return Err(CompatibilityError::ChangedEnumVariant {
                enum_name: previous.name,
                variant: previous_variant.name,
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

/// Bindings for Reboot's durable database-sidecar protocol.
pub mod database_proto {
    tonic::include_proto!("rbt.v1alpha1");
}

/// Encoded descriptor set for the generated `rbt.v1alpha1` bindings.
///
/// This is intentionally schema-only: no Native2pc client, adapter, or
/// transaction execution path is exposed by this crate.
pub const RBT_V1ALPHA1_DESCRIPTOR_SET: &[u8] =
    tonic::include_file_descriptor_set!("rbt_v1alpha1_descriptor");

#[derive(Debug, Eq, PartialEq)]
pub enum ContextError {
    EmptyStateRef,
    InvalidMetadata,
    MissingTransactionMetadata,
    MissingTransactionCoordinatorMetadata,
    EmptyTransactionIds,
    InvalidTransactionIds,
    InvalidUuid(&'static str),
}

impl std::fmt::Display for ContextError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::EmptyStateRef => write!(f, "Reboot state reference must not be empty"),
            Self::InvalidMetadata => write!(f, "Reboot metadata value is invalid"),
            Self::MissingTransactionMetadata => {
                write!(f, "transaction context requires transaction metadata")
            }
            Self::MissingTransactionCoordinatorMetadata => write!(
                f,
                "transaction metadata requires coordinator state type and state reference"
            ),
            Self::EmptyTransactionIds => {
                write!(f, "transaction metadata must contain at least one ID")
            }
            Self::InvalidTransactionIds => {
                write!(f, "transaction IDs must be a JSON array of UUIDs")
            }
            Self::InvalidUuid(header) => write!(f, "metadata `{header}` must be a UUID"),
        }
    }
}

impl std::error::Error for ContextError {}

const APPLICATION_ID_HEADER: &str = "x-reboot-application-id";
const STATE_REF_HEADER: &str = "x-reboot-state-ref";
const SERVER_ID_HEADER: &str = "x-reboot-server-id";
const WORKFLOW_ID_HEADER: &str = "x-reboot-workflow-id";
const WORKFLOW_ITERATION_HEADER: &str = "x-reboot-workflow-iteration";
const TRANSACTION_IDS_HEADER: &str = "x-reboot-transaction-ids";
const TRANSACTION_COORDINATOR_STATE_TYPE_HEADER: &str =
    "x-reboot-transaction-coordinator-state-type";
const TRANSACTION_COORDINATOR_STATE_REF_HEADER: &str = "x-reboot-transaction-coordinator-state-ref";
const TRANSACTION_RETRY_AGE_HEADER: &str = "x-reboot-transaction-retry-age";
const IDEMPOTENCY_KEY_HEADER: &str = "x-reboot-idempotency-key";
const AUTHORIZATION_HEADER: &str = "authorization";
const COOKIE_HEADER: &str = "cookie";
const TASK_SCHEDULE_HEADER: &str = "x-reboot-task-schedule";
const CALLER_ID_HEADER: &str = "x-reboot-caller-id";
const TRACEPARENT_HEADER: &str = "traceparent";
const TRACESTATE_HEADER: &str = "tracestate";
const INTERNAL_CALL_HEADER: &str = "x-reboot-internal-call";
const TRANSACTION_COORDINATOR_READ_ONLY_AWARE_HEADER: &str =
    "x-reboot-transaction-coordinator-read-only-aware";

/// Reboot metadata that is safe to forward to a downstream Reboot call.
///
/// This mirrors `reboot.aio.headers.Headers`: unknown inbound metadata is
/// intentionally discarded rather than transitively forwarded. Transaction
/// IDs are encoded as the Python runtime's JSON array of canonical UUID text.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RebootHeaders {
    pub state_ref: String,
    pub application_id: Option<String>,
    pub server_id: Option<String>,
    pub workflow_id: Option<uuid::Uuid>,
    pub workflow_iteration: Option<i64>,
    pub transaction_ids: Option<Vec<uuid::Uuid>>,
    pub transaction_coordinator_state_type: Option<String>,
    pub transaction_coordinator_state_ref: Option<String>,
    pub transaction_retry_age: Option<uuid::Uuid>,
    pub idempotency_key: Option<uuid::Uuid>,
    pub bearer_token: Option<String>,
    pub task_schedule: Option<String>,
    pub cookie: Option<String>,
    pub caller_id: Option<String>,
    pub traceparent: Option<String>,
    pub tracestate: Option<String>,
    pub internal_call: bool,
    pub coordinator_read_only_aware: bool,
}

impl RebootHeaders {
    pub fn new(state_ref: impl Into<String>) -> Self {
        Self {
            state_ref: state_ref.into(),
            application_id: None,
            server_id: None,
            workflow_id: None,
            workflow_iteration: None,
            transaction_ids: None,
            transaction_coordinator_state_type: None,
            transaction_coordinator_state_ref: None,
            transaction_retry_age: None,
            idempotency_key: None,
            bearer_token: None,
            task_schedule: None,
            cookie: None,
            caller_id: None,
            traceparent: None,
            tracestate: None,
            internal_call: false,
            coordinator_read_only_aware: false,
        }
    }

    pub fn from_metadata(metadata: &tonic::metadata::MetadataMap) -> Result<Self, ContextError> {
        fn get(
            metadata: &tonic::metadata::MetadataMap,
            name: &'static str,
        ) -> Result<Option<String>, ContextError> {
            metadata
                .get(name)
                .map(|value| {
                    value
                        .to_str()
                        .map(str::to_owned)
                        .map_err(|_| ContextError::InvalidMetadata)
                })
                .transpose()
        }
        let state_ref = get(metadata, STATE_REF_HEADER)?.ok_or(ContextError::EmptyStateRef)?;
        if state_ref.is_empty() {
            return Err(ContextError::EmptyStateRef);
        }
        let transaction_ids = match get(metadata, TRANSACTION_IDS_HEADER)? {
            None => None,
            Some(value) => {
                let values: Vec<String> = serde_json::from_str(&value)
                    .map_err(|_| ContextError::InvalidTransactionIds)?;
                if values.is_empty() {
                    return Err(ContextError::EmptyTransactionIds);
                }
                Some(
                    values
                        .into_iter()
                        .map(|value| {
                            uuid::Uuid::parse_str(&value)
                                .map_err(|_| ContextError::InvalidTransactionIds)
                        })
                        .collect::<Result<_, _>>()?,
                )
            }
        };
        let transaction_coordinator_state_type =
            get(metadata, TRANSACTION_COORDINATOR_STATE_TYPE_HEADER)?;
        let transaction_coordinator_state_ref =
            get(metadata, TRANSACTION_COORDINATOR_STATE_REF_HEADER)?;
        if transaction_ids.is_some()
            && (transaction_coordinator_state_type.is_none()
                || transaction_coordinator_state_ref.is_none())
        {
            return Err(ContextError::MissingTransactionCoordinatorMetadata);
        }
        let parse_uuid = |name| -> Result<Option<uuid::Uuid>, ContextError> {
            get(metadata, name)?
                .map(|value| {
                    uuid::Uuid::parse_str(&value).map_err(|_| ContextError::InvalidUuid(name))
                })
                .transpose()
        };
        Ok(Self {
            state_ref,
            application_id: get(metadata, APPLICATION_ID_HEADER)?,
            server_id: get(metadata, SERVER_ID_HEADER)?,
            workflow_id: parse_uuid(WORKFLOW_ID_HEADER)?,
            workflow_iteration: get(metadata, WORKFLOW_ITERATION_HEADER)?
                .map(|value| value.parse().map_err(|_| ContextError::InvalidMetadata))
                .transpose()?,
            transaction_ids,
            transaction_coordinator_state_type,
            transaction_coordinator_state_ref,
            transaction_retry_age: parse_uuid(TRANSACTION_RETRY_AGE_HEADER)?,
            idempotency_key: parse_uuid(IDEMPOTENCY_KEY_HEADER)?,
            bearer_token: get(metadata, AUTHORIZATION_HEADER)?
                .map(|value| value.strip_prefix("Bearer ").unwrap_or(&value).to_owned()),
            task_schedule: get(metadata, TASK_SCHEDULE_HEADER)?,
            cookie: get(metadata, COOKIE_HEADER)?,
            caller_id: get(metadata, CALLER_ID_HEADER)?,
            traceparent: get(metadata, TRACEPARENT_HEADER)?,
            tracestate: get(metadata, TRACESTATE_HEADER)?,
            internal_call: get(metadata, INTERNAL_CALL_HEADER)?
                .is_some_and(|value| value == "true"),
            coordinator_read_only_aware: metadata
                .contains_key(TRANSACTION_COORDINATOR_READ_ONLY_AWARE_HEADER),
        })
    }

    pub fn to_metadata(&self) -> Result<tonic::metadata::MetadataMap, ContextError> {
        if self.state_ref.is_empty() {
            return Err(ContextError::EmptyStateRef);
        }
        if self.transaction_ids.as_ref().is_some_and(Vec::is_empty) {
            return Err(ContextError::EmptyTransactionIds);
        }
        if self.transaction_ids.is_some()
            && (self.transaction_coordinator_state_type.is_none()
                || self.transaction_coordinator_state_ref.is_none())
        {
            return Err(ContextError::MissingTransactionCoordinatorMetadata);
        }
        fn insert(
            metadata: &mut tonic::metadata::MetadataMap,
            name: &'static str,
            value: String,
        ) -> Result<(), ContextError> {
            metadata.insert(
                name,
                value.parse().map_err(|_| ContextError::InvalidMetadata)?,
            );
            Ok(())
        }
        let mut metadata = tonic::metadata::MetadataMap::new();
        insert(&mut metadata, STATE_REF_HEADER, self.state_ref.clone())?;
        for (name, value) in [
            (APPLICATION_ID_HEADER, &self.application_id),
            (SERVER_ID_HEADER, &self.server_id),
        ] {
            if let Some(value) = value {
                insert(&mut metadata, name, value.clone())?;
            }
        }
        if let Some(token) = &self.bearer_token {
            insert(
                &mut metadata,
                AUTHORIZATION_HEADER,
                format!("Bearer {token}"),
            )?;
        }
        if let Some(cookie) = &self.cookie {
            insert(&mut metadata, COOKIE_HEADER, cookie.clone())?;
        }
        if let Some(ids) = &self.transaction_ids {
            let encoded = format!(
                "[{}]",
                ids.iter()
                    .map(|id| format!("\"{id}\""))
                    .collect::<Vec<_>>()
                    .join(", ")
            );
            insert(&mut metadata, TRANSACTION_IDS_HEADER, encoded)?;
            insert(
                &mut metadata,
                TRANSACTION_COORDINATOR_STATE_TYPE_HEADER,
                self.transaction_coordinator_state_type.clone().unwrap(),
            )?;
            insert(
                &mut metadata,
                TRANSACTION_COORDINATOR_STATE_REF_HEADER,
                self.transaction_coordinator_state_ref.clone().unwrap(),
            )?;
        }
        if let Some(age) = self.transaction_retry_age {
            insert(&mut metadata, TRANSACTION_RETRY_AGE_HEADER, age.to_string())?;
        }
        if let Some(id) = self.workflow_id {
            insert(&mut metadata, WORKFLOW_ID_HEADER, id.to_string())?;
        }
        if let Some(iteration) = self.workflow_iteration {
            insert(
                &mut metadata,
                WORKFLOW_ITERATION_HEADER,
                iteration.to_string(),
            )?;
        }
        if let Some(key) = self.idempotency_key {
            insert(&mut metadata, IDEMPOTENCY_KEY_HEADER, key.to_string())?;
        }
        for (name, value) in [
            (TRACEPARENT_HEADER, &self.traceparent),
            (TRACESTATE_HEADER, &self.tracestate),
            (CALLER_ID_HEADER, &self.caller_id),
            (TASK_SCHEDULE_HEADER, &self.task_schedule),
        ] {
            if let Some(value) = value {
                insert(&mut metadata, name, value.clone())?;
            }
        }
        if self.internal_call {
            insert(&mut metadata, INTERNAL_CALL_HEADER, "true".into())?;
        }
        if self.coordinator_read_only_aware {
            insert(
                &mut metadata,
                TRANSACTION_COORDINATOR_READ_ONLY_AWARE_HEADER,
                "true".into(),
            )?;
        }
        Ok(metadata)
    }
}

/// The portable subset of Reboot's external-call context.
///
/// `state_ref` must already be a valid encoded Reboot state reference. Encoding
/// state type tags is still owned by the current runtime; this client never
/// guesses or synthesizes them.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ExternalContext {
    headers: RebootHeaders,
}

impl ExternalContext {
    pub fn new(state_ref: impl Into<String>) -> Self {
        Self {
            headers: RebootHeaders::new(state_ref),
        }
    }

    pub fn with_bearer_token(mut self, bearer_token: impl Into<String>) -> Self {
        self.headers.bearer_token = Some(bearer_token.into());
        self
    }

    pub fn with_headers(headers: RebootHeaders) -> Self {
        Self { headers }
    }

    pub fn headers(&self) -> &RebootHeaders {
        &self.headers
    }

    pub fn reader<T>(&self, message: T) -> Result<tonic::Request<T>, ContextError> {
        self.request(message, None)
    }

    /// Starts a new idempotent writer call. Persist the returned metadata key
    /// before retrying across a process boundary; use `writer_with_key` for
    /// subsequent attempts.
    pub fn writer<T>(&self, message: T) -> Result<tonic::Request<T>, ContextError> {
        self.writer_with_key(message, uuid::Uuid::new_v4())
    }

    /// Builds a retry-safe writer call using a caller-owned idempotency key.
    pub fn writer_with_key<T>(
        &self,
        message: T,
        idempotency_key: uuid::Uuid,
    ) -> Result<tonic::Request<T>, ContextError> {
        self.request(message, Some(idempotency_key))
    }

    fn request<T>(
        &self,
        message: T,
        idempotency_key: Option<uuid::Uuid>,
    ) -> Result<tonic::Request<T>, ContextError> {
        let mut headers = self.headers.clone();
        headers.idempotency_key = idempotency_key;
        let mut request = tonic::Request::new(message);
        *request.metadata_mut() = headers.to_metadata()?;
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
    completed_writes: HashMap<uuid::Uuid, CompletedWrite<Response>>,
}

struct CompletedWrite<Response> {
    request_fingerprint: Option<Vec<u8>>,
    response: Response,
}

#[derive(Debug)]
pub(crate) enum IdempotencyCollision {
    DifferentRequest,
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
        if let Some(write) = guard.completed_writes.get(&idempotency_key) {
            return write.response.clone();
        }
        let response = write(&mut guard.state);
        guard.completed_writes.insert(
            idempotency_key,
            CompletedWrite {
                request_fingerprint: None,
                response: response.clone(),
            },
        );
        response
    }

    /// Runs a write once for a canonical request fingerprint. Reusing the key
    /// with a different request fails without invoking the write callback.
    pub(crate) fn writer_with_fingerprint(
        &self,
        idempotency_key: uuid::Uuid,
        request_fingerprint: Vec<u8>,
        write: impl FnOnce(&mut State) -> Response,
    ) -> Result<Response, IdempotencyCollision> {
        let mut guard = self.inner.lock().expect("actor state mutex poisoned");
        if let Some(completed) = guard.completed_writes.get(&idempotency_key) {
            if completed
                .request_fingerprint
                .as_deref()
                .is_some_and(|stored| stored != request_fingerprint)
            {
                return Err(IdempotencyCollision::DifferentRequest);
            }
            return Ok(completed.response.clone());
        }
        let response = write(&mut guard.state);
        guard.completed_writes.insert(
            idempotency_key,
            CompletedWrite {
                request_fingerprint: Some(request_fingerprint),
                response: response.clone(),
            },
        );
        Ok(response)
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
        if let Some(write) = guard.completed_writes.get(&idempotency_key) {
            return Ok(write.response.clone());
        }
        let checkpoint = guard.state.clone();
        match write(&mut guard.state) {
            Ok(response) => {
                guard.completed_writes.insert(
                    idempotency_key,
                    CompletedWrite {
                        request_fingerprint: None,
                        response: response.clone(),
                    },
                );
                Ok(response)
            }
            Err(error) => {
                guard.state = checkpoint;
                Err(error)
            }
        }
    }
}

fn validate_reservations(
    reserved: ReservedFields,
    fields: &[FieldSpec],
    oneofs: &[OneOfSpec],
) -> Result<(), SchemaError> {
    let active_tags = fields_by_tag(fields, oneofs);
    let active_names: std::collections::BTreeSet<_> = fields
        .iter()
        .chain(oneofs.iter().flat_map(|oneof| oneof.fields.iter()))
        .map(|field| field.name)
        .collect();
    let mut tags = std::collections::BTreeSet::new();
    for tag in reserved.tags {
        if *tag == 0
            || (19000..=19999).contains(tag)
            || !tags.insert(*tag)
            || active_tags.contains_key(tag)
        {
            return Err(SchemaError::InvalidReservation);
        }
    }
    let mut names = std::collections::BTreeSet::new();
    for name in reserved.names {
        if name.is_empty() || !names.insert(*name) || active_names.contains(name) {
            return Err(SchemaError::InvalidReservation);
        }
    }
    Ok(())
}

fn emit_reservations(proto: &mut String, reserved: ReservedFields, indent: &str) {
    if !reserved.tags.is_empty() {
        proto.push_str(indent);
        proto.push_str("reserved ");
        proto.push_str(
            &reserved
                .tags
                .iter()
                .map(u32::to_string)
                .collect::<Vec<_>>()
                .join(", "),
        );
        proto.push_str(";\n");
    }
    if !reserved.names.is_empty() {
        proto.push_str(indent);
        proto.push_str("reserved ");
        proto.push_str(
            &reserved
                .names
                .iter()
                .map(|name| format!("\"{name}\""))
                .collect::<Vec<_>>()
                .join(", "),
        );
        proto.push_str(";\n");
    }
}

fn is_protobuf_identifier(value: &str) -> bool {
    let mut characters = value.bytes();
    matches!(characters.next(), Some(b'a'..=b'z' | b'A'..=b'Z' | b'_'))
        && characters
            .all(|character| matches!(character, b'a'..=b'z' | b'A'..=b'Z' | b'0'..=b'9' | b'_'))
}

fn is_protobuf_package(value: &str) -> bool {
    value.split('.').all(is_protobuf_identifier)
}

impl ApplicationSpec {
    pub fn validate(&self) -> Result<(), SchemaError> {
        if self.package.is_empty() {
            return Err(SchemaError::EmptyPackage);
        }
        if !is_protobuf_package(self.package) {
            return Err(SchemaError::InvalidPackage(self.package));
        }
        if self.state.name.is_empty() {
            return Err(SchemaError::EmptyName("state"));
        }
        if !is_protobuf_identifier(self.state.name) {
            return Err(SchemaError::InvalidIdentifier {
                kind: "state",
                name: self.state.name,
            });
        }
        if self.service.name.is_empty() {
            return Err(SchemaError::EmptyName("service"));
        }
        if !is_protobuf_identifier(self.service.name) {
            return Err(SchemaError::InvalidIdentifier {
                kind: "service",
                name: self.service.name,
            });
        }
        if self.service.state != self.state.name {
            return Err(SchemaError::ServiceStateMismatch {
                service: self.service.name,
                state: self.state.name,
            });
        }

        let mut tags = std::collections::BTreeSet::new();
        let mut field_names = std::collections::BTreeSet::new();
        for field in self.state.fields {
            if field.name.is_empty() {
                return Err(SchemaError::EmptyName("field"));
            }
            if !field_names.insert(field.name) {
                return Err(SchemaError::DuplicateField(field.name));
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
        validate_reservations(self.state.reserved, self.state.fields, &[])?;
        let mut type_names = std::collections::BTreeSet::from([self.state.name]);
        let mut enum_names = std::collections::BTreeSet::new();
        for enum_spec in self.enums {
            if enum_spec.name.is_empty() {
                return Err(SchemaError::EmptyName("enum"));
            }
            if !enum_names.insert(enum_spec.name) {
                return Err(SchemaError::DuplicateEnum(enum_spec.name));
            }
            if !type_names.insert(enum_spec.name) {
                return Err(SchemaError::DuplicateType(enum_spec.name));
            }
            let Some(first) = enum_spec.variants.first() else {
                return Err(SchemaError::InvalidEnum(enum_spec.name));
            };
            if first.name.is_empty() || first.number != 0 {
                return Err(SchemaError::InvalidEnum(enum_spec.name));
            }
            let mut numbers = std::collections::BTreeSet::new();
            let mut variant_names = std::collections::BTreeSet::new();
            for variant in enum_spec.variants {
                if variant.name.is_empty()
                    || !variant_names.insert(variant.name)
                    || !numbers.insert(variant.number)
                {
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
            if !type_names.insert(message.name) {
                return Err(SchemaError::DuplicateType(message.name));
            }
            let mut tags = std::collections::BTreeSet::new();
            let mut field_names = std::collections::BTreeSet::new();
            for field in message.fields {
                if field.name.is_empty() {
                    return Err(SchemaError::EmptyName("field"));
                }
                if !field_names.insert(field.name) {
                    return Err(SchemaError::DuplicateField(field.name));
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
                    if !field_names.insert(field.name) {
                        return Err(SchemaError::DuplicateField(field.name));
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
            validate_reservations(message.reserved, message.fields, message.oneofs)?;
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
            if !field.field_type.has_valid_shape() {
                return Err(SchemaError::InvalidFieldShape(field.name));
            }
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
            previous.state.reserved,
            self.state.reserved,
        )?;

        for previous_enum in previous.enums {
            let Some(current_enum) = self
                .enums
                .iter()
                .find(|enum_spec| enum_spec.name == previous_enum.name)
            else {
                return Err(CompatibilityError::MissingEnum(previous_enum.name));
            };
            check_enum_compatibility(previous_enum, current_enum)?;
        }

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
                previous_message.reserved,
                current_message.reserved,
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
        emit_reservations(&mut proto, self.state.reserved, "  ");
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
            emit_reservations(&mut proto, message.reserved, "  ");
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
        reserved: ReservedFields {
            tags: &[],
            names: &[],
        },
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
            reserved: ReservedFields {
                tags: &[],
                names: &[],
            },
        },
        MessageSpec {
            name: "RenameResponse",
            fields: &[],
            oneofs: &[],
            reserved: ReservedFields {
                tags: &[],
                names: &[],
            },
        },
        MessageSpec {
            name: "DetailsRequest",
            fields: &[],
            oneofs: &[],
            reserved: ReservedFields {
                tags: &[],
                names: &[],
            },
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
            reserved: ReservedFields {
                tags: &[],
                names: &[],
            },
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
            reserved: ReservedFields {
                tags: &[],
                names: &[],
            },
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
    use prost::Message;

    #[test]
    fn scalar_field_types_emit_protobuf_scalar_names() {
        for (field_type, proto) in [
            (FieldType::Bool, "bool"),
            (FieldType::Bytes, "bytes"),
            (FieldType::F32, "float"),
            (FieldType::F64, "double"),
            (FieldType::Fixed32, "fixed32"),
            (FieldType::Fixed64, "fixed64"),
            (FieldType::I32, "int32"),
            (FieldType::I64, "int64"),
            (FieldType::SFixed32, "sfixed32"),
            (FieldType::SFixed64, "sfixed64"),
            (FieldType::SInt32, "sint32"),
            (FieldType::SInt64, "sint64"),
            (FieldType::String, "string"),
            (FieldType::U32, "uint32"),
            (FieldType::U64, "uint64"),
        ] {
            assert_eq!(field_type.proto(), proto);
        }
    }

    #[test]
    fn map_key_types_emit_protobuf_eligible_key_names() {
        for (key_type, proto) in [
            (MapKeyType::Bool, "bool"),
            (MapKeyType::Fixed32, "fixed32"),
            (MapKeyType::Fixed64, "fixed64"),
            (MapKeyType::I32, "int32"),
            (MapKeyType::I64, "int64"),
            (MapKeyType::SFixed32, "sfixed32"),
            (MapKeyType::SFixed64, "sfixed64"),
            (MapKeyType::SInt32, "sint32"),
            (MapKeyType::SInt64, "sint64"),
            (MapKeyType::String, "string"),
            (MapKeyType::U32, "uint32"),
            (MapKeyType::U64, "uint64"),
        ] {
            assert_eq!(key_type.proto(), proto);
        }
    }

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

        let retry_key = uuid::Uuid::from_u128(42);
        let retry = context
            .writer_with_key(
                proto::Text {
                    content: "retry".to_owned(),
                },
                retry_key,
            )
            .unwrap();
        assert_eq!(
            retry
                .metadata()
                .get("x-reboot-idempotency-key")
                .unwrap()
                .to_str()
                .unwrap(),
            retry_key.to_string()
        );

        let reader = context.reader(proto::Empty {}).unwrap();
        assert!(reader.metadata().get("x-reboot-idempotency-key").is_none());
    }

    #[test]
    fn reboot_headers_round_trip_known_metadata_and_drop_unknown_headers() {
        let mut headers = RebootHeaders::new("actor/opaque-ref");
        headers.application_id = Some("application-id".into());
        headers.server_id = Some("server-id".into());
        headers.workflow_id = Some(uuid::Uuid::from_u128(1));
        headers.workflow_iteration = Some(7);
        headers.transaction_ids = Some(vec![uuid::Uuid::from_u128(2), uuid::Uuid::from_u128(3)]);
        headers.transaction_coordinator_state_type = Some("example.Coordinator".into());
        headers.transaction_coordinator_state_ref = Some("coordinator/42".into());
        headers.transaction_retry_age = Some(uuid::Uuid::from_u128(4));
        headers.idempotency_key = Some(uuid::Uuid::from_u128(5));
        headers.bearer_token = Some("bearer-token".into());
        headers.task_schedule = Some("2026-10-03T12:00:00+00:00".into());
        headers.cookie = Some("session=abc".into());
        headers.caller_id = Some("caller/application".into());
        headers.traceparent =
            Some("00-0123456789abcdef0123456789abcdef-0123456789abcdef-01".into());
        headers.tracestate = Some("vendor=value".into());
        headers.internal_call = true;
        headers.coordinator_read_only_aware = true;

        let mut inbound = headers.to_metadata().unwrap();
        inbound.insert("x-example-unknown", "must-not-forward".parse().unwrap());
        assert_eq!(
            inbound.get(TRANSACTION_IDS_HEADER).unwrap(),
            "[\"00000000-0000-0000-0000-000000000002\", \"00000000-0000-0000-0000-000000000003\"]"
        );

        let parsed = RebootHeaders::from_metadata(&inbound).unwrap();
        assert_eq!(parsed, headers);
        let emitted = parsed.to_metadata().unwrap();
        assert!(emitted.get("x-example-unknown").is_none());
        assert_eq!(emitted.len(), inbound.len() - 1);
    }

    #[test]
    fn reboot_headers_reject_malformed_transaction_and_identifier_metadata() {
        let mut malformed_transaction = tonic::metadata::MetadataMap::new();
        malformed_transaction.insert(STATE_REF_HEADER, "actor".parse().unwrap());
        malformed_transaction.insert(TRANSACTION_IDS_HEADER, "[\"not-a-uuid\"]".parse().unwrap());
        malformed_transaction.insert(
            TRANSACTION_COORDINATOR_STATE_TYPE_HEADER,
            "example.Coordinator".parse().unwrap(),
        );
        malformed_transaction.insert(
            TRANSACTION_COORDINATOR_STATE_REF_HEADER,
            "coordinator".parse().unwrap(),
        );
        assert_eq!(
            RebootHeaders::from_metadata(&malformed_transaction),
            Err(ContextError::InvalidTransactionIds)
        );

        let mut malformed_retry_age = tonic::metadata::MetadataMap::new();
        malformed_retry_age.insert(STATE_REF_HEADER, "actor".parse().unwrap());
        malformed_retry_age.insert(TRANSACTION_RETRY_AGE_HEADER, "not-a-uuid".parse().unwrap());
        assert_eq!(
            RebootHeaders::from_metadata(&malformed_retry_age),
            Err(ContextError::InvalidUuid(TRANSACTION_RETRY_AGE_HEADER))
        );

        let mut malformed_idempotency_key = tonic::metadata::MetadataMap::new();
        malformed_idempotency_key.insert(STATE_REF_HEADER, "actor".parse().unwrap());
        malformed_idempotency_key.insert(IDEMPOTENCY_KEY_HEADER, "not-a-uuid".parse().unwrap());
        assert_eq!(
            RebootHeaders::from_metadata(&malformed_idempotency_key),
            Err(ContextError::InvalidUuid(IDEMPOTENCY_KEY_HEADER))
        );
    }

    #[test]
    fn external_context_rejects_empty_state_references() {
        assert!(matches!(
            ExternalContext::new("").reader(proto::Empty {}),
            Err(ContextError::EmptyStateRef)
        ));
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
    fn in_memory_actor_rejects_fingerprinted_idempotency_collisions() {
        let actor = InMemoryActor::<i64, i64>::new(0);
        let key = uuid::Uuid::new_v4();
        assert_eq!(
            actor
                .writer_with_fingerprint(key, vec![1], |state| {
                    *state += 1;
                    *state
                })
                .unwrap(),
            1
        );
        assert_eq!(
            actor
                .writer_with_fingerprint(key, vec![1], |state| {
                    *state += 1;
                    *state
                })
                .unwrap(),
            1
        );
        let collision = actor
            .writer_with_fingerprint(key, vec![2], |state| {
                *state += 1;
                *state
            })
            .unwrap_err();
        assert!(matches!(collision, IdempotencyCollision::DifferentRequest));
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
    fn rejects_malformed_state_and_service_identifiers() {
        let mut invalid = CLINIC;
        invalid.state.name = "Clinic-State";
        assert_eq!(
            invalid.validate(),
            Err(SchemaError::InvalidIdentifier {
                kind: "state",
                name: "Clinic-State",
            })
        );

        invalid = CLINIC;
        invalid.service.name = "Clinic Methods";
        assert_eq!(
            invalid.validate(),
            Err(SchemaError::InvalidIdentifier {
                kind: "service",
                name: "Clinic Methods",
            })
        );
    }

    #[test]
    fn rejects_malformed_protobuf_packages() {
        for package in ["clinic..v1", "clinic-v1", "1clinic.v1", ".clinic"] {
            let mut invalid = CLINIC;
            invalid.package = package;
            assert_eq!(
                invalid.validate(),
                Err(SchemaError::InvalidPackage(package))
            );
        }
    }

    #[test]
    fn rejects_duplicate_top_level_type_names() {
        let mut duplicate_state_name = CLINIC;
        duplicate_state_name.enums = &[EnumSpec {
            name: "Clinic",
            variants: &[EnumVariantSpec {
                name: "CLINIC_UNSPECIFIED",
                number: 0,
            }],
        }];
        assert_eq!(
            duplicate_state_name.validate(),
            Err(SchemaError::DuplicateType("Clinic"))
        );

        let mut duplicate_enum_name = CLINIC;
        duplicate_enum_name.messages = &[MessageSpec {
            name: "ClinicStatus",
            fields: &[],
            oneofs: &[],
            reserved: ReservedFields {
                tags: &[],
                names: &[],
            },
        }];
        assert_eq!(
            duplicate_enum_name.validate(),
            Err(SchemaError::DuplicateType("ClinicStatus"))
        );
    }

    #[test]
    fn rejects_duplicate_field_names_across_model_members() {
        let mut duplicate_state_field = CLINIC;
        duplicate_state_field.state.fields = &[
            FieldSpec {
                name: "name",
                tag: 1,
                field_type: FieldType::String,
                required: false,
            },
            FieldSpec {
                name: "name",
                tag: 2,
                field_type: FieldType::String,
                required: false,
            },
        ];
        assert_eq!(
            duplicate_state_field.validate(),
            Err(SchemaError::DuplicateField("name"))
        );

        let mut duplicate_oneof_field = CLINIC;
        duplicate_oneof_field.messages = &[MessageSpec {
            name: "DuplicateFieldName",
            fields: &[FieldSpec {
                name: "contact",
                tag: 1,
                field_type: FieldType::String,
                required: false,
            }],
            oneofs: &[OneOfSpec {
                name: "choice",
                fields: &[FieldSpec {
                    name: "contact",
                    tag: 2,
                    field_type: FieldType::String,
                    required: false,
                }],
            }],
            reserved: ReservedFields {
                tags: &[],
                names: &[],
            },
        }];
        assert_eq!(
            duplicate_oneof_field.validate(),
            Err(SchemaError::DuplicateField("contact"))
        );
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
    fn compatibility_rejects_moving_a_field_into_a_oneof() {
        const FIELD: FieldSpec = FieldSpec {
            name: "contact",
            tag: 1,
            field_type: FieldType::String,
            required: false,
        };
        const FIELDS: &[FieldSpec] = &[FIELD];
        const ONEOFS: &[OneOfSpec] = &[OneOfSpec {
            name: "choice",
            fields: FIELDS,
        }];
        assert_eq!(
            check_model_compatibility(
                "Message",
                FIELDS,
                &[],
                &[],
                ONEOFS,
                ReservedFields {
                    tags: &[],
                    names: &[]
                },
                ReservedFields {
                    tags: &[],
                    names: &[]
                },
            ),
            Err(CompatibilityError::ChangedField {
                model: "Message",
                tag: 1,
            })
        );
    }

    #[test]
    fn compatibility_allows_deleting_a_field_only_when_its_tag_and_name_are_reserved() {
        let mut changed = CLINIC;
        changed.state.fields = &[FieldSpec {
            name: "name",
            tag: 1,
            field_type: FieldType::String,
            required: true,
        }];
        changed.state.reserved = ReservedFields {
            tags: &[2],
            names: &["phone_number"],
        };
        assert_eq!(changed.validate(), Ok(()));
        assert_eq!(changed.check_backward_compatible_with(&CLINIC), Ok(()));
        let proto = changed.to_proto().unwrap();
        assert!(proto.contains("reserved 2;"));
        assert!(proto.contains("reserved \"phone_number\";"));

        let mut later = changed;
        later.state.reserved = ReservedFields {
            tags: &[],
            names: &[],
        };
        assert_eq!(
            later.check_backward_compatible_with(&changed),
            Err(CompatibilityError::MissingReservedTag {
                model: "Clinic",
                tag: 2,
            })
        );
    }

    #[test]
    fn compatibility_rejects_reassigning_a_published_enum_variant() {
        let mut changed = CLINIC;
        changed.enums = &[EnumSpec {
            name: "ClinicStatus",
            variants: &[
                EnumVariantSpec {
                    name: "CLINIC_STATUS_UNSPECIFIED",
                    number: 0,
                },
                EnumVariantSpec {
                    name: "CLINIC_STATUS_OPEN",
                    number: 3,
                },
                EnumVariantSpec {
                    name: "CLINIC_STATUS_CLOSED",
                    number: 2,
                },
            ],
        }];
        assert_eq!(changed.validate(), Ok(()));
        assert_eq!(
            changed.check_backward_compatible_with(&CLINIC),
            Err(CompatibilityError::ChangedEnumVariant {
                enum_name: "ClinicStatus",
                variant: "CLINIC_STATUS_OPEN",
            })
        );
    }

    #[test]
    fn compatibility_rejects_removing_a_published_enum() {
        let mut changed = CLINIC;
        changed.enums = &[];
        assert_eq!(
            changed.check_backward_compatible_with(&CLINIC),
            Err(CompatibilityError::MissingEnum("ClinicStatus"))
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
            reserved: ReservedFields {
                tags: &[],
                names: &[],
            },
        }];
        assert_eq!(invalid.validate(), Err(SchemaError::DuplicateTag(1)));
    }

    #[test]
    fn rejects_invalid_enums() {
        let mut invalid = CLINIC;
        invalid.enums = &[EnumSpec {
            name: "Broken",
            variants: &[EnumVariantSpec {
                name: "BROKEN_ONE",
                number: 1,
            }],
        }];
        assert_eq!(invalid.validate(), Err(SchemaError::InvalidEnum("Broken")));

        invalid.enums = &[EnumSpec {
            name: "DuplicateVariant",
            variants: &[
                EnumVariantSpec {
                    name: "DUPLICATE_UNSPECIFIED",
                    number: 0,
                },
                EnumVariantSpec {
                    name: "DUPLICATE_UNSPECIFIED",
                    number: 1,
                },
            ],
        }];
        assert_eq!(
            invalid.validate(),
            Err(SchemaError::InvalidEnum("DuplicateVariant"))
        );
    }

    #[test]
    fn rejects_nested_protobuf_collection_shapes() {
        const NESTED_MAP: FieldType = FieldType::Map {
            key: MapKeyType::String,
            value: &STRING_FIELD,
        };
        let mut invalid = CLINIC;
        invalid.state.fields = &[FieldSpec {
            name: "invalid_collection",
            tag: 3,
            field_type: FieldType::Repeated(&NESTED_MAP),
            required: false,
        }];
        assert_eq!(
            invalid.validate(),
            Err(SchemaError::InvalidFieldShape("invalid_collection"))
        );
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

    #[test]
    fn native_2pc_generated_bindings_preserve_protocol_and_identity() {
        let record = database_proto::Native2pcParticipantRecord {
            protocol: Some(database_proto::Native2pcProtocol {
                protocol_id: "reboot.native-2pc.v1".into(),
                record_version: 1,
            }),
            root_transaction_id: vec![1, 2, 3],
            participant: Some(database_proto::Native2pcActorId {
                state_type: "example.Participant".into(),
                state_ref: "participant-a".into(),
            }),
            coordinator: Some(database_proto::Native2pcActorId {
                state_type: "example.Coordinator".into(),
                state_ref: "coordinator-a".into(),
            }),
            enrollment_digest: vec![4, 5, 6],
            phase: database_proto::native2pc_participant_record::Phase::Prepared as i32,
        };

        let encoded = record.encode_to_vec();
        let decoded = database_proto::Native2pcParticipantRecord::decode(encoded.as_slice())
            .expect("generated Native2pc record must decode");
        assert_eq!(decoded, record);
    }

    #[test]
    fn native_2pc_descriptor_has_exact_contract_and_distinct_services() {
        use prost_types::{
            FileDescriptorProto, field_descriptor_proto::Label, field_descriptor_proto::Type,
        };

        fn message<'a>(
            file: &'a FileDescriptorProto,
            name: &str,
        ) -> &'a prost_types::DescriptorProto {
            file.message_type
                .iter()
                .find(|message| message.name.as_deref() == Some(name))
                .unwrap_or_else(|| panic!("missing {name} message"))
        }

        fn assert_fields(
            message: &prost_types::DescriptorProto,
            expected: &[(&str, i32, Type, Label)],
        ) {
            let actual: Vec<_> = message
                .field
                .iter()
                .map(|field| {
                    (
                        field.name.as_deref().unwrap(),
                        field.number.unwrap(),
                        Type::try_from(field.r#type.unwrap()).unwrap(),
                        Label::try_from(field.label.unwrap()).unwrap(),
                    )
                })
                .collect();
            assert_eq!(actual, expected);
        }

        let descriptor = prost_types::FileDescriptorSet::decode(RBT_V1ALPHA1_DESCRIPTOR_SET)
            .expect("build script must emit an rbt.v1alpha1 descriptor set");
        let native = descriptor
            .file
            .iter()
            .find(|file| file.name.as_deref() == Some("rbt/v1alpha1/native_2pc.proto"))
            .expect("Native2pc proto must be present in generated descriptor set");

        assert_fields(
            message(native, "Native2pcProtocol"),
            &[
                ("protocol_id", 1, Type::String, Label::Optional),
                ("record_version", 2, Type::Uint32, Label::Optional),
            ],
        );
        assert_fields(
            message(native, "Native2pcActorId"),
            &[
                ("state_type", 1, Type::String, Label::Optional),
                ("state_ref", 2, Type::String, Label::Optional),
            ],
        );
        assert_fields(
            message(native, "Native2pcEnrollment"),
            &[
                ("participant", 1, Type::Message, Label::Optional),
                ("enrollment_digest", 2, Type::Bytes, Label::Optional),
            ],
        );
        assert_fields(
            message(native, "Native2pcCapabilitiesRequest"),
            &[("required", 1, Type::Message, Label::Optional)],
        );
        assert_fields(
            message(native, "Native2pcCapabilitiesResponse"),
            &[
                ("accepted", 1, Type::Message, Label::Optional),
                ("native_participant_enabled", 2, Type::Bool, Label::Optional),
                ("native_sidecar_enabled", 3, Type::Bool, Label::Optional),
            ],
        );
        assert_fields(
            message(native, "Native2pcCoordinatorRecord"),
            &[
                ("protocol", 1, Type::Message, Label::Optional),
                ("root_transaction_id", 2, Type::Bytes, Label::Optional),
                ("coordinator", 3, Type::Message, Label::Optional),
                ("enrollment", 4, Type::Message, Label::Repeated),
                ("enrollment_digest", 5, Type::Bytes, Label::Optional),
                ("phase", 6, Type::Enum, Label::Optional),
            ],
        );
        assert_fields(
            message(native, "Native2pcParticipantRecord"),
            &[
                ("protocol", 1, Type::Message, Label::Optional),
                ("root_transaction_id", 2, Type::Bytes, Label::Optional),
                ("participant", 3, Type::Message, Label::Optional),
                ("coordinator", 4, Type::Message, Label::Optional),
                ("enrollment_digest", 5, Type::Bytes, Label::Optional),
                ("phase", 6, Type::Enum, Label::Optional),
            ],
        );
        assert_eq!(
            message(native, "Native2pcCoordinatorRecord").enum_type[0]
                .value
                .iter()
                .map(|value| (value.name.as_deref().unwrap(), value.number.unwrap()))
                .collect::<Vec<_>>(),
            vec![
                ("UNSPECIFIED", 0),
                ("PREPARING", 1),
                ("COMMIT_DECIDED", 2),
                ("ABORT_DECIDED", 3),
            ]
        );
        assert_eq!(
            message(native, "Native2pcParticipantRecord").enum_type[0]
                .value
                .iter()
                .map(|value| (value.name.as_deref().unwrap(), value.number.unwrap()))
                .collect::<Vec<_>>(),
            vec![
                ("UNSPECIFIED", 0),
                ("ACTIVE", 1),
                ("PREPARED", 2),
                ("COMMITTED", 3),
                ("ABORTED", 4),
            ]
        );
        assert_eq!(
            message(native, "Native2pcPrepareResponse").enum_type[0]
                .value
                .iter()
                .map(|value| (value.name.as_deref().unwrap(), value.number.unwrap()))
                .collect::<Vec<_>>(),
            vec![("UNSPECIFIED", 0), ("PREPARED", 1), ("DEFINITIVE_ABORT", 2)]
        );
        assert_eq!(
            message(native, "Native2pcTerminalRequest").enum_type[0]
                .value
                .iter()
                .map(|value| (value.name.as_deref().unwrap(), value.number.unwrap()))
                .collect::<Vec<_>>(),
            vec![("UNSPECIFIED", 0), ("COMMIT", 1), ("ABORT", 2)]
        );
        assert_fields(
            message(native, "Native2pcPrepareRequest"),
            &[
                ("protocol", 1, Type::Message, Label::Optional),
                ("root_transaction_id", 2, Type::Bytes, Label::Optional),
                ("participant", 3, Type::Message, Label::Optional),
                ("coordinator", 4, Type::Message, Label::Optional),
                ("enrollment_digest", 5, Type::Bytes, Label::Optional),
            ],
        );
        assert_fields(
            message(native, "Native2pcTerminalRequest"),
            &[
                ("protocol", 1, Type::Message, Label::Optional),
                ("root_transaction_id", 2, Type::Bytes, Label::Optional),
                ("participant", 3, Type::Message, Label::Optional),
                ("coordinator", 4, Type::Message, Label::Optional),
                ("enrollment_digest", 5, Type::Bytes, Label::Optional),
                ("decision", 6, Type::Enum, Label::Optional),
            ],
        );
        assert_fields(
            message(native, "Native2pcTerminalResponse"),
            &[("terminal_phase", 1, Type::Enum, Label::Optional)],
        );
        assert_fields(
            message(native, "Native2pcWatchRequest"),
            &[
                ("protocol", 1, Type::Message, Label::Optional),
                ("root_transaction_id", 2, Type::Bytes, Label::Optional),
                ("coordinator", 3, Type::Message, Label::Optional),
                ("participant", 4, Type::Message, Label::Optional),
                ("enrollment_digest", 5, Type::Bytes, Label::Optional),
            ],
        );

        let services: Vec<_> = native
            .service
            .iter()
            .map(|service| {
                (
                    service.name.as_deref().unwrap(),
                    service
                        .method
                        .iter()
                        .map(|method| {
                            (
                                method.name.as_deref().unwrap(),
                                method.input_type.as_deref().unwrap(),
                                method.output_type.as_deref().unwrap(),
                                method.server_streaming.unwrap_or(false),
                            )
                        })
                        .collect::<Vec<_>>(),
                )
            })
            .collect();
        assert_eq!(
            services,
            vec![
                (
                    "Native2pcParticipant",
                    vec![
                        (
                            "GetCapabilities",
                            ".rbt.v1alpha1.Native2pcCapabilitiesRequest",
                            ".rbt.v1alpha1.Native2pcCapabilitiesResponse",
                            false
                        ),
                        (
                            "Prepare",
                            ".rbt.v1alpha1.Native2pcPrepareRequest",
                            ".rbt.v1alpha1.Native2pcPrepareResponse",
                            false
                        ),
                        (
                            "Terminal",
                            ".rbt.v1alpha1.Native2pcTerminalRequest",
                            ".rbt.v1alpha1.Native2pcTerminalResponse",
                            false
                        ),
                    ],
                ),
                (
                    "Native2pcCoordinator",
                    vec![(
                        "Watch",
                        ".rbt.v1alpha1.Native2pcWatchRequest",
                        ".rbt.v1alpha1.Native2pcWatchResponse",
                        false
                    )],
                ),
                (
                    "Native2pcDatabase",
                    vec![
                        (
                            "PutCoordinator",
                            ".rbt.v1alpha1.Native2pcPutCoordinatorRequest",
                            ".rbt.v1alpha1.Native2pcPutCoordinatorResponse",
                            false
                        ),
                        (
                            "PutParticipant",
                            ".rbt.v1alpha1.Native2pcPutParticipantRequest",
                            ".rbt.v1alpha1.Native2pcPutParticipantResponse",
                            false
                        ),
                        (
                            "PutCommitDecision",
                            ".rbt.v1alpha1.Native2pcPutCommitDecisionRequest",
                            ".rbt.v1alpha1.Native2pcPutCommitDecisionResponse",
                            false
                        ),
                        (
                            "PutAbortDecision",
                            ".rbt.v1alpha1.Native2pcPutAbortDecisionRequest",
                            ".rbt.v1alpha1.Native2pcPutAbortDecisionResponse",
                            false
                        ),
                        (
                            "RecoverNative2pc",
                            ".rbt.v1alpha1.Native2pcRecoverRequest",
                            ".rbt.v1alpha1.Native2pcRecoverResponse",
                            true
                        ),
                        (
                            "TerminalParticipant",
                            ".rbt.v1alpha1.Native2pcTerminalParticipantRequest",
                            ".rbt.v1alpha1.Native2pcTerminalParticipantResponse",
                            false
                        ),
                    ],
                ),
            ]
        );
    }
}
