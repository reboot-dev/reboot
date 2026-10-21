use super::*;
#[test]
fn workflow_task_handles_are_descriptor_typed_and_relative_schedule_is_explicit() {
    let method = |name: &str| MethodDescriptorProto {
        name: Some(name.into()),
        input_type: Some(".test.Request".into()),
        output_type: Some(".test.Result".into()),
        ..Default::default()
    };
    let service = ServiceDescriptorProto {
        name: Some("Target".into()),
        method: vec![method("Child"), method("Query"), method("Create")],
        ..Default::default()
    };
    let annotation = DurableService {
        state: ".test.State".into(),
        default_constructible: false,
        auto_construct: 0,
        methods: [
            ("Child".into(), DurableKind::Workflow),
            ("Query".into(), DurableKind::Reader),
            (
                "Create".into(),
                DurableKind::Writer(WriterMetadata { constructor: true }),
            ),
        ]
        .into(),
        declared_errors: HashMap::new(),
    };
    let mut output = String::new();
    emit_workflow_spawn_reference(
        &mut output,
        &service,
        &annotation,
        "test",
        "Target",
        "reboot",
        "TargetDatabaseAdapter",
    )
    .unwrap();
    for name in [
        "child_task(",
        "child_retrieve(",
        "child_task_after(",
        "child_spawn_after(",
    ] {
        assert!(output.contains(name), "missing helper {name}");
    }
    assert!(output.contains("WorkflowTask<proto::Result,tonic::Status>"));
    assert!(output.contains("method:\"test.Target.Child\""));
    assert!(output.contains("type.googleapis.com/test.Result"));
    assert!(!output.contains("pub async fn query"));
    assert!(!output.contains("pub async fn create"));
    assert!(!output.contains("SystemTime::now")); // Source does not recompute an absolute timestamp.
}

#[test]
fn writer_reference_uses_descriptor_response_identity_and_excludes_unsupported_services() {
    let descriptor = ServiceDescriptorProto {
        method: vec![MethodDescriptorProto {
            name: Some("Apply".into()),
            output_type: Some(".other.pkg.Nested.Result".into()),
            ..Default::default()
        }],
        ..Default::default()
    };
    let writer = DurableKind::Writer(WriterMetadata { constructor: false });
    let constructor = DurableKind::Writer(WriterMetadata { constructor: true });
    let entries = [
        (
            &writer,
            "apply".into(),
            "Q".into(),
            "R".into(),
            "test.Target.Apply".into(),
        ),
        (
            &constructor,
            "create".into(),
            "Q".into(),
            "R".into(),
            "test.Target.Create".into(),
        ),
    ];
    let methods: Vec<_> = entries.iter().collect();
    let mut annotation = DurableService {
        state: ".test.State".into(),
        default_constructible: false,
        auto_construct: 0,
        methods: [("Apply".into(), writer), ("Create".into(), constructor)].into(),
        declared_errors: HashMap::new(),
    };
    let mut output = String::new();
    emit_workflow_writer_reference(
        &mut output,
        &descriptor,
        "Target",
        "reboot",
        &annotation,
        &methods,
    );
    assert!(output.contains("pub struct TargetWorkflowWriterRef"));
    assert!(output.contains("context.invoke_writer("));
    assert!(output.contains("type.googleapis.com/other.pkg.Nested.Result"));
    assert!(!output.contains("pub async fn create"));
    assert!(!output.contains("new_idempotency_key"));
    assert!(!output.contains("retry_backoff"));
    for unsupported in [
        DurableKind::Workflow,
        DurableKind::Transaction(TransactionMetadata {
            factory: false,
            mode: TransactionMode::Exclusive,
        }),
    ] {
        annotation.methods.insert("Unsupported".into(), unsupported);
        let mut refused = String::new();
        emit_workflow_writer_reference(
            &mut refused,
            &descriptor,
            "Target",
            "reboot",
            &annotation,
            &methods,
        );
        assert!(refused.is_empty());
    }
}
