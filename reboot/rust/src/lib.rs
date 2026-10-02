//! Experimental Rust input to Reboot's language-neutral `.proto` contract.
//!
//! This is intentionally a schema-only spike. It proves that Rust can emit the
//! existing Reboot descriptor format without Python or Node.js. It does not
//! claim to host a Rust servicer: the current `rbt dev run` launcher supports
//! only `--python` and `--nodejs`.

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum FieldType {
    Bool,
    F64,
    I64,
    String,
    /// A named model emitted elsewhere in this application's proto contract.
    Message(&'static str),
}

impl FieldType {
    fn proto(self) -> &'static str {
        match self {
            Self::Bool => "bool",
            Self::F64 => "double",
            Self::I64 => "int64",
            Self::String => "string",
            Self::Message(name) => name,
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

/// A request or response model in the emitted API contract.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct MessageSpec {
    pub name: &'static str,
    pub fields: &'static [FieldSpec],
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
            Self::UnknownMessage(name) => write!(f, "message `{name}` is not declared"),
            Self::ServiceStateMismatch { service, state } => {
                write!(f, "service `{service}` does not target state `{state}`")
            }
        }
    }
}

impl std::error::Error for SchemaError {}

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
        }
        for field in self.state.fields.iter().chain(
            self.messages
                .iter()
                .flat_map(|message| message.fields.iter()),
        ) {
            if let FieldType::Message(name) = field.field_type {
                let declared = name == self.state.name
                    || self.messages.iter().any(|message| message.name == name);
                if !declared {
                    return Err(SchemaError::UnknownMessage(name));
                }
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
            proto.push_str("  optional ");
            proto.push_str(field.field_type.proto());
            proto.push(' ');
            proto.push_str(field.name);
            proto.push_str(" = ");
            proto.push_str(&field.tag.to_string());
            proto.push_str(" [(rbt.v1alpha1.field).required = ");
            proto.push_str(if field.required { "true" } else { "false" });
            proto.push_str("];\n");
        }
        proto.push_str("}\n\n");

        for message in self.messages {
            proto.push_str("message ");
            proto.push_str(message.name);
            proto.push_str(" {\n");
            for field in message.fields {
                proto.push_str("  optional ");
                proto.push_str(field.field_type.proto());
                proto.push(' ');
                proto.push_str(field.name);
                proto.push_str(" = ");
                proto.push_str(&field.tag.to_string());
                proto.push_str(" [(rbt.v1alpha1.field).required = ");
                proto.push_str(if field.required { "true" } else { "false" });
                proto.push_str("];\n");
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
    messages: &[
        MessageSpec {
            name: "RenameRequest",
            fields: &[FieldSpec {
                name: "name",
                tag: 1,
                field_type: FieldType::String,
                required: true,
            }],
        },
        MessageSpec {
            name: "RenameResponse",
            fields: &[],
        },
        MessageSpec {
            name: "DetailsRequest",
            fields: &[],
        },
        MessageSpec {
            name: "PhoneNumber",
            fields: &[FieldSpec {
                name: "value",
                tag: 1,
                field_type: FieldType::String,
                required: true,
            }],
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
            ],
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
