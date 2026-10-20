// Included in codegen; deliberately separate from ordinary writer generation.
fn emit_workflow_transaction_reference(
    output: &mut String,
    descriptor: &ServiceDescriptorProto,
    service: &str,
    runtime: &str,
    annotation: &DurableService,
    package: &str,
) {
    let methods: Vec<_> = descriptor.method.iter().filter(|method| {
        matches!(annotation.methods.get(method.name.as_deref().unwrap_or("")),
            Some(DurableKind::Transaction(metadata)) if metadata.mode == TransactionMode::Exclusive && !metadata.factory)
    }).collect();
    if methods.is_empty() {
        return;
    }
    let name = format!("{service}WorkflowTransactionRef");
    let module = format!("{}_client", snake_case(service));
    let state_type = annotation.state.trim_start_matches('.');
    output.push_str(&format!("/// Fixed-channel exclusive transaction roots invoked by a durable workflow.\n/// Coordinator-backed target commit; source journal is separate. No factories, shared mode, task spawn or durable declared-error authority.\n#[derive(Clone)]\npub struct {name} {{ channel: tonic::transport::Channel, target: {runtime}::one_shot_tasks::WorkflowTransactionTarget }}\nimpl {name} {{ pub fn new(channel: tonic::transport::Channel, actor: {runtime}::actor_ref::ActorRef, application: {runtime}::CallerId, bearer: Option<String>) -> Result<Self, tonic::Status> {{ if actor.state_type() != \"{state_type}\" {{ return Err(tonic::Status::invalid_argument(\"generated transaction reference state type mismatch\")); }} Ok(Self {{ channel, target: {runtime}::one_shot_tasks::WorkflowTransactionTarget::new(actor, application, bearer)? }}) }}\n"));
    for method in methods {
        let original = method.name.as_deref().unwrap();
        let rust_method = snake_case(original);
        let request = method
            .input_type
            .as_deref()
            .unwrap()
            .rsplit('.')
            .next()
            .unwrap()
            .to_upper_camel_case();
        let response_full = method
            .output_type
            .as_deref()
            .unwrap()
            .trim_start_matches('.');
        let response = response_full
            .rsplit('.')
            .next()
            .unwrap()
            .to_upper_camel_case();
        let identity = if package.is_empty() {
            format!("{service}.{original}")
        } else {
            format!("{package}.{service}.{original}")
        };
        output.push_str(&format!("pub async fn {rust_method}(&self, context: &{runtime}::one_shot_tasks::WorkflowContext<'_>, alias: &str, request: proto::{request}) -> Result<proto::{response}, tonic::Status> {{ let mut client = proto::{module}::{service}Client::new(self.channel.clone()); context.invoke_transaction(&self.target, alias, {runtime}::one_shot_tasks::WorkflowTransactionMethod {{ state_type: \"{state_type}\", method: \"{identity}\", response_type: \"type.googleapis.com/{response_full}\" }}, request, move |request| async move {{ client.{rust_method}(request).await }}).await }}\n"));
    }
    output.push_str("}\n\n");
}

#[cfg(test)]
mod transaction_reference_tests {
    use super::*;
    #[test]
    fn transaction_reference_uses_service_package_and_excludes_factory_shared_writer() {
        let method = |name: &str| MethodDescriptorProto {
            name: Some(name.into()),
            input_type: Some(".wire.Request".into()),
            output_type: Some(".wire.Response".into()),
            ..Default::default()
        };
        let descriptor = ServiceDescriptorProto {
            name: Some("Target".into()),
            method: vec![
                method("Apply"),
                method("Create"),
                method("Inspect"),
                method("Write"),
            ],
            ..Default::default()
        };
        let annotation = DurableService {
            state: ".statepkg.State".into(),
            default_constructible: false,
            auto_construct: 0,
            methods: [
                (
                    "Apply".into(),
                    DurableKind::Transaction(TransactionMetadata {
                        factory: false,
                        mode: TransactionMode::Exclusive,
                    }),
                ),
                (
                    "Create".into(),
                    DurableKind::Transaction(TransactionMetadata {
                        factory: true,
                        mode: TransactionMode::Exclusive,
                    }),
                ),
                (
                    "Inspect".into(),
                    DurableKind::Transaction(TransactionMetadata {
                        factory: false,
                        mode: TransactionMode::Shared,
                    }),
                ),
                (
                    "Write".into(),
                    DurableKind::Writer(WriterMetadata { constructor: false }),
                ),
            ]
            .into(),
            declared_errors: [("Apply".into(), vec!["LimitExceeded".into()])].into(),
        };
        let mut output = String::new();
        emit_workflow_transaction_reference(
            &mut output,
            &descriptor,
            "Target",
            "reboot",
            &annotation,
            "rpcpkg",
        );
        assert!(output.contains("pub struct TargetWorkflowTransactionRef"));
        assert!(output.contains("context.invoke_transaction("));
        assert!(output.contains("method: \"rpcpkg.Target.Apply\""));
        assert!(output.contains("type.googleapis.com/wire.Response"));
        assert!(output.contains("Result<proto::Response, tonic::Status>"));
        for forbidden in [
            "pub async fn create",
            "pub async fn inspect",
            "pub async fn write",
            "invoke_writer(",
            "WorkflowWriterError",
            "retry_backoff",
            "new_idempotency_key",
        ] {
            assert!(!output.contains(forbidden), "{forbidden}");
        }
    }
}
