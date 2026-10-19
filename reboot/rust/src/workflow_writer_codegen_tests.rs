use super::*;
#[test]
fn writer_reference_uses_descriptor_response_identity_and_excludes_unsupported_services() {
    let descriptor = ServiceDescriptorProto {
        method: vec![MethodDescriptorProto { name: Some("Apply".into()), output_type: Some(".other.pkg.Nested.Result".into()), ..Default::default() }],
        ..Default::default()
    };
    let writer = DurableKind::Writer(WriterMetadata { constructor: false });
    let constructor = DurableKind::Writer(WriterMetadata { constructor: true });
    let entries = [(&writer, "apply".into(), "Q".into(), "R".into(), "test.Target.Apply".into()), (&constructor, "create".into(), "Q".into(), "R".into(), "test.Target.Create".into())];
    let methods: Vec<_> = entries.iter().collect();
    let mut annotation = DurableService { state: ".test.State".into(), default_constructible: false, auto_construct: 0, methods: [("Apply".into(), writer), ("Create".into(), constructor)].into(), declared_errors: HashMap::new() };
    let mut output = String::new();
    emit_workflow_writer_reference(&mut output, &descriptor, "Target", "reboot", &annotation, &methods);
    assert!(output.contains("pub struct TargetWorkflowWriterRef"));
    assert!(output.contains("context.invoke_writer("));
    assert!(output.contains("type.googleapis.com/other.pkg.Nested.Result"));
    assert!(!output.contains("pub async fn create"));
    assert!(!output.contains("new_idempotency_key"));
    assert!(!output.contains("retry_backoff"));
    for unsupported in [DurableKind::Workflow, DurableKind::Transaction(TransactionMetadata { factory: false, mode: TransactionMode::Exclusive })] {
        annotation.methods.insert("Unsupported".into(), unsupported);
        let mut refused = String::new();
        emit_workflow_writer_reference(&mut refused, &descriptor, "Target", "reboot", &annotation, &methods);
        assert!(refused.is_empty());
    }
}
