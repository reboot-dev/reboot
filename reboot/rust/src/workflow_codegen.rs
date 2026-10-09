#[cfg(test)]
mod workflow_emission_tests {
    use super::*;
    #[test]
    fn workflow_generated_reader_helpers_reject_writer_collisions() {
        for name in ["ObserveDecide", "ObserveUntil", "ObserveTryUntil"] {
            let method = |name: &str| MethodDescriptorProto {
                name: Some(name.into()),
                input_type: Some(".demo.Q".into()),
                output_type: Some(".demo.R".into()),
                ..Default::default()
            };
            let descriptor = ServiceDescriptorProto {
                name: Some("Methods".into()),
                method: vec![method("Observe"), method(name)],
                ..Default::default()
            };
            let annotation = DurableService {
                state: "demo.State".into(),
                default_constructible: false,
                methods: [
                    ("Observe".into(), DurableKind::Reader),
                    (
                        name.into(),
                        DurableKind::Writer(WriterMetadata { constructor: false }),
                    ),
                ]
                .into(),
                declared_errors: HashMap::new(),
            };
            let error = emit_workflow_service(
                &mut String::new(),
                &descriptor,
                &annotation,
                "Methods",
                "State",
                "reboot",
                "demo",
            )
            .unwrap_err();
            assert!(error.contains("collision"), "{name}: {error}");
        }
    }
    #[test]
    fn workflow_declared_reader_does_not_grant_constructor_errors() {
        let service = ServiceDescriptorProto {
            name: Some("Methods".into()),
            method: vec![MethodDescriptorProto {
                name: Some("Observe".into()),
                input_type: Some(".demo.Q".into()),
                output_type: Some(".demo.R".into()),
                ..Default::default()
            }],
            ..Default::default()
        };
        {
            let kind = DurableKind::Writer(WriterMetadata { constructor: true });
            let annotation = DurableService {
                state: "demo.State".into(),
                default_constructible: false,
                methods: [("Observe".into(), kind)].into(),
                declared_errors: [("Observe".into(), vec!["Rejected".into()])].into(),
            };
            assert!(emit_workflow_service(
                &mut String::new(),
                &service,
                &annotation,
                "Methods",
                "State",
                "reboot",
                "demo"
            )
            .unwrap_err()
            .contains("constructors are unsupported"));
        }
    }
    #[test]
    fn annotated_workflow_emits_distinct_private_execution_and_typed_writer_steps() {
        let method = |name: &str| MethodDescriptorProto {
            name: Some(name.into()),
            input_type: Some(".demo.Q".into()),
            output_type: Some(".demo.R".into()),
            ..Default::default()
        };
        let service = ServiceDescriptorProto {
            name: Some("Methods".into()),
            method: vec![method("Run"), method("Apply")],
            ..Default::default()
        };
        let annotation = DurableService {
            state: "demo.State".into(),
            default_constructible: false,
            methods: [
                ("Run".into(), DurableKind::Workflow),
                (
                    "Apply".into(),
                    DurableKind::Writer(WriterMetadata { constructor: false }),
                ),
            ]
            .into(),
            declared_errors: HashMap::new(),
        };
        let mut output = String::new();
        emit_workflow_service(
            &mut output,
            &service,
            &annotation,
            "Methods",
            "State",
            "reboot",
            "demo",
        )
        .unwrap();
        for expected in [
            "WorkflowContext<'_>",
            "Explicit local retry",
            ".workflow()",
            "with_workflows",
            "writer_step::<StateDurableState,proto::Q,proto::R",
            "workflow_scheduling_writer",
            "permission_denied",
            "MethodsTasksWait",
            "context.finish::<StateDurableState,proto::Q,proto::R",
            "unknown",
        ] {
            if expected != "unknown" {
                assert!(output.contains(expected), "missing {expected}");
            }
        }
        assert!(!output.contains("execute_terminal(&self"));
        assert!(output.contains("task_cancellation_status(&error)?"));
        assert!(!output.contains("wrong workflow state type\").into()"));
        assert!(!output.contains("validated cancellation\").into()"));
        assert!(output.contains("let _ = (task, error); Err"));
        let mut with_errors = annotation.clone();
        with_errors
            .declared_errors
            .insert("Run".into(), vec!["Rejected".into()]);
        let mut typed = String::new();
        emit_workflow_service(
            &mut typed,
            &service,
            &with_errors,
            "Methods",
            "State",
            "reboot",
            "demo",
        )
        .unwrap();
        for expected in [
            "MethodsRunError",
            "DeclaredTaskError::new::<proto::Rejected>",
            "into_task_handler_error().into()",
            "decode_task_error(error)",
            "MethodsRunError::from_status",
        ] {
            assert!(typed.contains(expected), "missing {expected}");
        }
        with_errors
            .declared_errors
            .insert("Apply".into(), vec!["Rejected".into()]);
        let mut declared_writer = String::new();
        emit_workflow_service(
            &mut declared_writer,
            &service,
            &with_errors,
            "Methods",
            "State",
            "reboot",
            "demo",
        )
        .unwrap();
        assert!(declared_writer.contains("writer_step_declared"));
        assert!(declared_writer.contains("DeclaredTaskError::new::<proto::Rejected>"));
        assert!(declared_writer
            .contains("TaskHandlerError::Failed(status)=>MethodsApplyError::Grpc(status)"));
        let mut with_reader = annotation.clone();
        with_reader
            .methods
            .insert("Observe".into(), DurableKind::Reader);
        let mut mixed_service = service.clone();
        mixed_service.method.push(method("Observe"));
        let mut reactive = String::new();
        emit_workflow_service(
            &mut reactive,
            &mixed_service,
            &with_reader,
            "Methods",
            "State",
            "reboot",
            "demo",
        )
        .unwrap();
        assert!(reactive.contains("MethodsReactiveClient"));
        assert!(reactive.contains("pub async fn observe_with_timeout"));
        assert!(reactive.contains("reader_async_for_with_admission_authorized"));
        let dispatch = reactive
            .split("async fn read(&self, request:")
            .nth(1)
            .unwrap()
            .split("_ => Err")
            .next()
            .unwrap();
        assert!(dispatch.contains("demo.Methods.Observe"));
        assert!(!dispatch.contains("demo.Methods.Run"));
        assert!(!dispatch.contains("demo.Methods.Apply"));
        for reserved in ["New", "LocalReaders"] {
            let mut bad_service = mixed_service.clone();
            bad_service.method.push(method(reserved));
            let mut bad = with_reader.clone();
            bad.methods.insert(reserved.into(), DurableKind::Reader);
            let error = emit_workflow_service(
                &mut String::new(),
                &bad_service,
                &bad,
                "Methods",
                "State",
                "reboot",
                "demo",
            )
            .unwrap_err();
            assert!(error.contains("reserved local reader helper"));
        }
        for conflict in ["ObserveUntil", "ObserveDecide", "ObserveTryUntil"] {
            let mut bad_service = mixed_service.clone();
            bad_service.method.push(method(conflict));
            let mut bad = with_reader.clone();
            bad.methods.insert(
                conflict.into(),
                DurableKind::Writer(WriterMetadata { constructor: false }),
            );
            let error = emit_workflow_service(
                &mut String::new(),
                &bad_service,
                &bad,
                "Methods",
                "State",
                "reboot",
                "demo",
            )
            .unwrap_err();
            assert!(error.contains("workflow step helper"), "{error}");
        }
        for conflict in ["ObserveWithTimeout", "ObserveConnect"] {
            let mut conflict_service = mixed_service.clone();
            conflict_service.method.push(method(conflict));
            let mut conflict_annotation = with_reader.clone();
            conflict_annotation
                .methods
                .insert(conflict.into(), DurableKind::Reader);
            assert!(emit_workflow_service(
                &mut String::new(),
                &conflict_service,
                &conflict_annotation,
                "Methods",
                "State",
                "reboot",
                "demo"
            )
            .unwrap_err()
            .contains("reactive helper"));
        }
        with_reader
            .declared_errors
            .insert("Observe".into(), vec!["Rejected".into()]);
        let mut declared_reader = String::new();
        emit_workflow_service(
            &mut declared_reader,
            &mixed_service,
            &with_reader,
            "Methods",
            "State",
            "reboot",
            "demo",
        )
        .unwrap();
        for expected in [
            "state:& proto::State,request:proto::Q)->Result<proto::R,MethodsObserveError>",
            "MethodsObserveError::from_status",
            ".map_err(|error|error.into_status())",
            "Result<reboot::reactive::TypedSubscription<proto::R, MethodsObserveError>, MethodsObserveError>",
            "workflow_reader_wait()",
        ] {
            assert!(declared_reader.contains(expected), "missing {expected}");
        }
        assert!(!declared_reader.contains("async fn apply(&self,state:&mut proto::State,request:proto::Q)->Result<proto::R,MethodsApplyError>"));
        let mut mixed = annotation.clone();
        mixed.methods.insert(
            "Apply".into(),
            DurableKind::Transaction(TransactionMetadata {
                mode: TransactionMode::Exclusive,
                factory: false,
            }),
        );
        assert!(emit_workflow_service(
            &mut String::new(),
            &service,
            &mixed,
            "Methods",
            "State",
            "reboot",
            "demo"
        )
        .is_err());
    }
}
// Bounded standalone workflow services. Mixed transaction/workflow services are
// rejected instead of silently routing workflows through a transaction adapter.
fn emit_workflow_service(
    output: &mut String,
    service: &ServiceDescriptorProto,
    annotation: &DurableService,
    service_name: &str,
    state: &str,
    runtime_module: &str,
    package: &str,
) -> Result<(), String> {
    if annotation
        .methods
        .values()
        .any(|k| matches!(k, DurableKind::Transaction(_)))
    {
        return Err("workflow v1 does not support mixed transaction services".to_owned());
    }
    if annotation.declared_errors.iter().any(|(method, errors)| {
        !errors.is_empty()
            && !matches!(
                annotation.methods.get(method),
                Some(
                    DurableKind::Workflow
                        | DurableKind::Reader
                        | DurableKind::Writer(WriterMetadata { constructor: false })
                )
            )
    }) {
        return Err("declared errors on workflow-service constructors are unsupported".to_owned());
    }
    for method in &service.method {
        let name = method.name.as_deref().unwrap();
        if let Some(errors) = annotation
            .declared_errors
            .get(name)
            .filter(|e| !e.is_empty())
        {
            emit_declared_error_enum(
                output,
                service_name,
                &snake_case(name),
                package,
                errors,
                runtime_module,
                false,
            );
        }
    }
    let handler = format!("{service_name}DatabaseHandler");
    let adapter = format!("{service_name}DatabaseAdapter");
    let binding = format!("{service_name}WorkflowBinding");
    let steps = format!("{service_name}WorkflowSteps");
    let tasks = format!("{service_name}Tasks");
    let server = format!("{}_server", snake_case(service_name));
    let declaration = format!("{state}DurableState");
    let mut generated_steps = std::collections::HashMap::new();
    for method in &service.method {
        let name = method.name.as_deref().unwrap();
        let rust = snake_case(name);
        let names = match annotation.methods.get(name).unwrap() {
            DurableKind::Reader => vec![
                format!("{rust}_until"),
                format!("{rust}_decide"),
                format!("{rust}_try_until"),
            ],
            DurableKind::Writer(WriterMetadata { constructor: false }) => vec![rust],
            _ => vec![],
        };
        for helper in names {
            if let Some(previous) = generated_steps.insert(helper.clone(), name) {
                return Err(format!(
                    "workflow step helper {helper} collision: {previous} and {name}"
                ));
            }
        }
    }
    let mut declarations = String::from("vec![");
    let mut validations = String::new();
    let mut responses = String::new();
    let mut error_validations = String::new();
    let mut executions = String::new();
    let mut writers = String::new();
    let mut scheduling = String::new();
    let mut waits = String::new();
    let mut step_methods = String::new();
    let mut rpc_methods = String::new();
    output.push_str(&format!(
        "#[tonic::async_trait]\npub trait {handler}: Send + Sync + 'static {{\n"
    ));
    for method in &service.method {
        let name = method.name.as_deref().unwrap();
        let kind = annotation.methods.get(name).unwrap();
        let (rust, request, response) = method_types("workflow", package, service_name, method)?;
        let identity = format!("{package}.{service_name}.{name}");
        let response_type = format!(
            "type.googleapis.com/{}",
            method
                .output_type
                .as_deref()
                .unwrap()
                .trim_start_matches('.')
        );
        match kind {
            DurableKind::Workflow => {
                let errors = annotation
                    .declared_errors
                    .get(name)
                    .map(Vec::as_slice)
                    .unwrap_or(&[]);
                let handler_error = if errors.is_empty() {
                    "tonic::Status".to_owned()
                } else {
                    declared_error_type(service_name, &rust)
                };
                let disposition = if errors.is_empty() {
                    "Into::into".to_owned()
                } else {
                    "|error| error.into_task_handler_error().into()".to_owned()
                };
                let error_descriptors = errors.iter().map(|error| format!("{runtime_module}::one_shot_tasks::DeclaredTaskError::new::<proto::{}>(\"type.googleapis.com/{package}.{error}\")", error.to_upper_camel_case())).collect::<Vec<_>>().join(",");
                output.push_str("    /// Explicit local retry receives at most three host-owned attempts.\n    /// Declared business errors are durable terminals; failed framework work never retries.\n");
                output.push_str(&format!("    async fn {rust}(&self, context: &{runtime_module}::one_shot_tasks::WorkflowContext<'_>, request: proto::{request}) -> Result<proto::{response}, {handler_error}>;\n    async fn {rust}_attempt(&self,context:&{runtime_module}::one_shot_tasks::WorkflowContext<'_>,request:proto::{request})->Result<proto::{response},{runtime_module}::one_shot_tasks::WorkflowBodyError> {{self.{rust}(context,request).await.map_err({disposition})}}\n"));
                declarations.push_str(&format!("{runtime_module}::one_shot_tasks::TaskMethodDeclaration::new::<{declaration},proto::{request},proto::{response}>(\"{identity}\",\"{response_type}\",vec![{error_descriptors}]).workflow(),"));
                if !errors.is_empty() {
                    let validation =
                        task_error_validation(annotation, name, package, runtime_module, "");
                    error_validations
                        .push_str(&format!("\"{name}\" => {{ {validation} Ok(()) }},"));
                }
                validations.push_str(&format!("\"{name}\" => {{ let id = task.task_id.as_ref().ok_or_else(|| tonic::Status::invalid_argument(\"missing workflow ID\"))?; {runtime_module}::runtime::writer_task_key(id, \"{identity}\")?; <proto::{request} as prost::Message>::decode(task.request.as_slice()).map_err(|_| tonic::Status::invalid_argument(\"malformed workflow request\"))?; Ok(()) }},"));
                responses.push_str(&format!("\"{name}\" if response.type_url == \"{response_type}\" => {{ <proto::{response} as prost::Message>::decode(response.value.as_slice()).map_err(|_| tonic::Status::data_loss(\"malformed workflow result\"))?; Ok(()) }},"));
                executions.push_str(&format!("\"{name}\" => {{ let request = <proto::{request} as prost::Message>::decode(context.task().request.as_slice()).map_err(|_| tonic::Status::data_loss(\"malformed canonical workflow request\"))?; let response = match self.handler.{rust}_attempt(&context, request).await {{ Ok(response)=>response, Err(error)=>return context.body_failed(error).await }}; context.finish::<{declaration},proto::{request},proto::{response}>(\"{response_type}\",response).await }},"));
                scheduling.push_str(&format!("pub fn {rust}(state_ref: &str, request: &proto::{request}, timestamp: Option<prost_types::Timestamp>) -> {runtime_module}::database_proto::Task {{ {runtime_module}::database_proto::Task {{ task_id: Some({runtime_module}::database_proto::TaskId {{ state_type: <{declaration} as {runtime_module}::runtime::DurableStateDeclaration>::STATE_TYPE.to_owned(), state_ref: state_ref.to_owned(), task_uuid: uuid::Uuid::new_v4().as_bytes().to_vec() }}), method: \"{name}\".to_owned(), request: <proto::{request} as prost::Message>::encode_to_vec(request), timestamp, iteration: 0, status: {runtime_module}::database_proto::task::Status::Pending as i32, response_or_error: None }} }}\n"));
                let conversion = if errors.is_empty() { "" } else { ".into()" };
                let cancellation_terminal = format!(
                    "Some({runtime_module}::database_proto::task_response_or_error::ResponseOrError::Error(error)) if {runtime_module}::one_shot_tasks::task_cancellation_status(&error)?.is_some() => {{ Err({runtime_module}::one_shot_tasks::task_cancellation_status(&error)?.expect(\"validated cancellation\"){conversion}) }},"
                );
                let error_terminal = if errors.is_empty() {
                    cancellation_terminal.clone()
                } else {
                    let validation =
                        task_error_validation(annotation, name, package, runtime_module, ".into()");
                    format!(
                        "{cancellation_terminal}Some({runtime_module}::database_proto::task_response_or_error::ResponseOrError::Error(error)) => {{ let error = &error; {validation} Err({handler_error}::from_status(tonic::Status::with_details(tonic::Code::from_i32(rich.code),rich.message,error.value.clone().into()))) }},"
                    )
                };
                waits.push_str(&format!("pub async fn {rust}(channel: tonic::transport::Channel, mut request: tonic::Request<{runtime_module}::database_proto::TaskId>) -> Result<proto::{response},{handler_error}> {{ if request.get_ref().state_type != <{declaration} as {runtime_module}::runtime::DurableStateDeclaration>::STATE_TYPE {{ return Err(tonic::Status::invalid_argument(\"wrong workflow state type\"){conversion}); }}\n if request.metadata().get(\"x-reboot-state-ref\").is_none() {{ let state_ref = request.get_ref().state_ref.parse().map_err(|_| tonic::Status::invalid_argument(\"invalid workflow StateRef\"))?; request.metadata_mut().insert(\"x-reboot-state-ref\",state_ref); }} request.metadata_mut().insert(\"x-reboot-task-method\",\"{identity}\".parse().unwrap()); let terminal = {runtime_module}::database_proto::tasks_client::TasksClient::new(channel).wait(request.map(|id|{runtime_module}::database_proto::WaitRequest {{task_id:Some(id)}})).await?.into_inner(); match terminal.response_or_error.and_then(|t|t.response_or_error) {{ Some({runtime_module}::database_proto::task_response_or_error::ResponseOrError::Response(response)) if response.type_url == \"{response_type}\" => <proto::{response} as prost::Message>::decode(response.value.as_slice()).map_err(|_|tonic::Status::data_loss(\"malformed workflow result\"){conversion}), {error_terminal} _ => Err(tonic::Status::data_loss(\"wrong workflow terminal\"){conversion}) }} }}\n"));
                rpc_methods.push_str(&format!("async fn {rust}(&self, _: tonic::Request<proto::{request}>) -> Result<tonic::Response<proto::{response}>,tonic::Status> {{ Err(tonic::Status::permission_denied(\"workflows run only through durable generated writer scheduling\")) }}\n"));
            }
            DurableKind::Writer(WriterMetadata { constructor: false }) => {
                let errors = annotation
                    .declared_errors
                    .get(name)
                    .map(Vec::as_slice)
                    .unwrap_or(&[]);
                let declared = !errors.is_empty();
                let handler_error = if declared {
                    declared_error_type(service_name, &rust)
                } else {
                    "tonic::Status".to_owned()
                };
                let error_map = if declared {
                    ".map_err(|error|error.into_status())"
                } else {
                    ""
                };
                let disposition = if declared {
                    ".map_err(|error|error.into_task_handler_error())"
                } else {
                    ""
                };
                let step = if declared {
                    "writer_step_declared"
                } else {
                    "writer_step"
                };
                let decode = if declared {
                    format!(
                        ".map_err(|error|match error {{ {runtime_module}::one_shot_tasks::TaskHandlerError::Declared(error)=>{handler_error}::from_status({runtime_module}::one_shot_tasks::TaskHandlerError::Declared(error).into_status()),{runtime_module}::one_shot_tasks::TaskHandlerError::Failed(status)=>{handler_error}::Grpc(status) }})"
                    )
                } else {
                    String::new()
                };
                let error_descriptors=errors.iter().map(|error|format!("{runtime_module}::one_shot_tasks::DeclaredTaskError::new::<proto::{}>(\"type.googleapis.com/{package}.{error}\")",error.to_upper_camel_case())).collect::<Vec<_>>().join(",");
                output.push_str(&format!("async fn {rust}(&self,state:&mut proto::{state},request:proto::{request})->Result<proto::{response},{handler_error}>;\nasync fn {rust}_scheduled(&self,state:&mut proto::{state},request:proto::{request},_state_ref:String)->Result<{runtime_module}::runtime::TransactionExecution<proto::{response}>,{handler_error}> {{ self.{rust}(state,request).await.map({runtime_module}::runtime::TransactionExecution::new) }}\n"));
                declarations.push_str(&format!("{runtime_module}::one_shot_tasks::TaskMethodDeclaration::new::<{declaration},proto::{request},proto::{response}>(\"{identity}\",\"{response_type}\",vec![{error_descriptors}]).workflow_writer_step(),"));
                writers.push_str(&format!("\"{name}\" | "));
                step_methods.push_str(&format!("pub async fn {rust}<H:{handler}>(context:&{runtime_module}::one_shot_tasks::WorkflowContext<'_>,handler:std::sync::Arc<H>,alias:&str,request:proto::{request})->Result<proto::{response},{handler_error}> {{ context.{step}::<{declaration},proto::{request},proto::{response},_>(alias,\"{identity}\",\"{response_type}\",request,move |state,request|Box::pin(async move {{handler.{rust}(state,request).await{disposition}}})).await{decode} }}\n"));
                rpc_methods.push_str(&format!("async fn {rust}(&self,request:tonic::Request<proto::{request}>)->Result<tonic::Response<proto::{response}>,tonic::Status> {{ let handler=self.handler.clone(); self.store.workflow_scheduling_writer::<{declaration},_,_,_>(\"{identity}\",&self.authorization,self.tasks.as_ref(),request,move |state,request,state_ref|Box::pin(async move {{handler.{rust}_scheduled(state,request,state_ref).await{error_map}}})).await }}\n"));
            }
            DurableKind::Writer(WriterMetadata { constructor: true }) | DurableKind::Reader => {
                let declared = matches!(kind, DurableKind::Reader)
                    && !declared_database_errors(annotation, kind, &identity).is_empty();
                let handler_error = if declared {
                    declared_error_type(service_name, &rust)
                } else {
                    "tonic::Status".to_owned()
                };
                let error_map = if declared {
                    ".map_err(|error|error.into_status())"
                } else {
                    ""
                };
                if matches!(kind, DurableKind::Reader) {
                    let reader_errors = declared_database_errors(annotation, kind, &identity);
                    let error_descriptors=reader_errors.iter().map(|error|format!("{runtime_module}::one_shot_tasks::DeclaredTaskError::new::<proto::{}>(\"type.googleapis.com/{package}.{error}\")",error.to_upper_camel_case())).collect::<Vec<_>>().join(",");
                    declarations.push_str(&format!("{runtime_module}::one_shot_tasks::TaskMethodDeclaration::new::<{declaration},proto::{request},proto::{response}>(\"{identity}\",\"{response_type}\",vec![{error_descriptors}]).workflow_reader_wait(),"));
                    if declared {
                        step_methods.push_str(&format!("pub async fn {rust}_try_until<H:{handler},P:Fn(&proto::{response})->bool+Send+Sync+'static>(context:&{runtime_module}::one_shot_tasks::WorkflowContext<'_>,handler:std::sync::Arc<H>,alias:&str,condition:&str,request:proto::{request},predicate:P)->Result<proto::{response},{handler_error}> {{ context.wait_reader_declared::<{declaration},proto::{request},proto::{response},_,_>({runtime_module}::one_shot_tasks::WorkflowWaitName{{alias,condition}},\"{identity}\",\"{response_type}\",request,move |state,request| {{ let handler=handler.clone(); Box::pin(async move {{handler.{rust}(state,request).await.map_err(|error|error.into_task_handler_error())}}) }},predicate).await.map_err(|error|match error {{ {runtime_module}::one_shot_tasks::TaskHandlerError::Declared(error)=>{handler_error}::from_status({runtime_module}::one_shot_tasks::TaskHandlerError::Declared(error).into_status()),{runtime_module}::one_shot_tasks::TaskHandlerError::Failed(status)=>{handler_error}::Grpc(status) }}) }}\n"));
                    }
                    step_methods.push_str(&format!("pub async fn {rust}_until<H:{handler},P:Fn(&proto::{response})->bool+Send+Sync+'static>(context:&{runtime_module}::one_shot_tasks::WorkflowContext<'_>,handler:std::sync::Arc<H>,alias:&str,condition:&str,request:proto::{request},predicate:P)->Result<proto::{response},tonic::Status> {{ context.wait_reader::<{declaration},proto::{request},proto::{response},_,_>({runtime_module}::one_shot_tasks::WorkflowWaitName{{alias,condition}},\"{identity}\",\"{response_type}\",request,move |state,request| {{ let handler=handler.clone(); Box::pin(async move {{handler.{rust}(state,request).await{error_map}}}) }},predicate).await }}\n"));
                    step_methods.push_str(&format!("pub async fn {rust}_decide<H:{handler},P:Fn(&proto::{response})->bool+Send+Sync+'static>(context:&{runtime_module}::one_shot_tasks::WorkflowContext<'_>,handler:std::sync::Arc<H>,alias:&str,condition:&str,request:proto::{request},should_break:P)->Result<std::ops::ControlFlow<proto::{response},proto::{response}>,tonic::Status> {{ context.decide_reader::<{declaration},proto::{request},proto::{response},_,_>({runtime_module}::one_shot_tasks::WorkflowWaitName{{alias,condition}},\"{identity}\",\"{response_type}\",request,move |state,request| {{ let handler=handler.clone(); Box::pin(async move {{handler.{rust}(state,request).await{error_map}}}) }},should_break).await }}\n"));
                }
                let mutable = matches!(kind, DurableKind::Writer(_));
                let reference = if mutable { "&mut" } else { "&" };
                let envelope = if mutable {
                    "constructor_writer_async_for_method_authorized"
                } else {
                    "reader_async_for_with_admission_authorized"
                };
                let admission = if mutable {
                    String::new()
                } else {
                    format!("{runtime_module}::runtime::StateAdmission::RequireExisting,")
                };
                output.push_str(&format!("async fn {rust}(&self,state:{reference} proto::{state},request:proto::{request})->Result<proto::{response},{handler_error}>;\n"));
                rpc_methods.push_str(&format!("async fn {rust}(&self,request:tonic::Request<proto::{request}>)->Result<tonic::Response<proto::{response}>,tonic::Status> {{ let handler=self.handler.clone(); self.store.{envelope}::<{declaration},_,_,_>(\"{identity}\",{admission}&self.authorization,request,move |state,request|Box::pin(async move {{handler.{rust}(state,request).await{error_map}}})).await }}\n"));
            }
            DurableKind::Transaction(_) => unreachable!(),
        }
    }
    output.push_str("}\n");
    let writers = writers.strip_suffix(" | ").unwrap_or("\"\"");
    declarations.push(']');
    output.push_str(&format!("pub struct {tasks}; impl {tasks} {{ {scheduling} }}\npub struct {tasks}Wait; impl {tasks}Wait {{ {waits} }}\npub struct {steps}; impl {steps} {{ {step_methods} }}\n"));
    output.push_str(&format!("pub struct {adapter}<H> {{store:{runtime_module}::runtime::DatabaseActorStore,handler:std::sync::Arc<H>,authorization:{runtime_module}::auth::AuthorizationPolicy,tasks:Option<{runtime_module}::one_shot_tasks::OneShotTasks>}}\nimpl<H> Clone for {adapter}<H> {{ fn clone(&self)->Self {{ Self {{ store:self.store.clone(),handler:self.handler.clone(),authorization:self.authorization.clone(),tasks:self.tasks.clone() }} }} }}\nimpl<H:{handler}> {adapter}<H> {{ pub fn new(store:{runtime_module}::runtime::DatabaseActorStore,handler:H)->Self {{Self{{store,handler:std::sync::Arc::new(handler),authorization:Default::default(),tasks:None}}}} pub fn with_authorization(mut self,authorization:{runtime_module}::auth::AuthorizationPolicy)->Self {{self.authorization=authorization;self}} #[allow(clippy::result_large_err)] pub fn with_workflows(mut self,state_ref:&str)->Result<(Self,{runtime_module}::one_shot_tasks::OneShotTasks),tonic::Status> {{ let tasks={runtime_module}::one_shot_tasks::OneShotTasks::new_with_declarations(self.store.clone(),<{declaration} as {runtime_module}::runtime::DurableStateDeclaration>::STATE_TYPE.to_owned(),state_ref.to_owned(),{binding}{{handler:self.handler.clone()}},{declarations})?;self.tasks=Some(tasks.clone());Ok((self,tasks)) }} }}\n#[tonic::async_trait]\nimpl<H:{handler}> proto::{server}::{service_name} for {adapter}<H> {{ {rpc_methods} }}\n"));
    let error_dispatch = if error_validations.is_empty() {
        "let _ = (task, error); Err(tonic::Status::data_loss(\"workflow method does not declare errors\"))".to_owned()
    } else {
        format!(
            "let _ = error; match task.method.as_str(){{{error_validations}_=>Err(tonic::Status::data_loss(\"workflow method does not declare errors\"))}}"
        )
    };
    output.push_str(&format!("struct {binding}<H>{{handler:std::sync::Arc<H>}}\n#[tonic::async_trait]\nimpl<H:{handler}> {runtime_module}::one_shot_tasks::ReaderTaskBinding for {binding}<H> {{fn validate(&self,task:&{runtime_module}::database_proto::Task)->Result<(),tonic::Status>{{match task.method.as_str(){{{validations}_=>Err(tonic::Status::invalid_argument(\"not a registered workflow target\"))}}}}\nasync fn execute(&self,_:&{runtime_module}::database_proto::Task)->Result<prost_types::Any,tonic::Status>{{Err(tonic::Status::failed_precondition(\"workflow requires private admission\"))}}\nfn validate_response(&self,task:&{runtime_module}::database_proto::Task,response:&prost_types::Any)->Result<(),tonic::Status>{{match task.method.as_str(){{{responses}_=>Err(tonic::Status::data_loss(\"wrong workflow method/result\"))}}}}\nfn validate_error(&self,task:&{runtime_module}::database_proto::Task,error:&prost_types::Any)->Result<(),tonic::Status>{{{error_dispatch}}}\nfn writer_capable(&self)->bool{{true}}\nfn is_writer(&self,task:&{runtime_module}::database_proto::Task)->bool{{matches!(task.method.as_str(),{writers})}}\nasync fn execute_workflow(&self,context:{runtime_module}::one_shot_tasks::WorkflowContext<'_>)->Result<{runtime_module}::one_shot_tasks::WorkflowReceipt,tonic::Status>{{match context.task().method.as_str(){{{executions}_=>Err(tonic::Status::failed_precondition(\"wrong workflow executor\"))}}}} }}\n"));
    let methods = service
        .method
        .iter()
        .map(|method| {
            let name = method.name.as_deref().unwrap();
            let (rust, request, response) =
                method_types("workflow", package, service_name, method)?;
            Ok((
                annotation.methods.get(name).unwrap(),
                rust,
                request,
                response,
                format!("{package}.{service_name}.{name}"),
            ))
        })
        .collect::<Result<Vec<_>, String>>()?;
    let methods = methods.iter().collect::<Vec<_>>();
    if methods
        .iter()
        .any(|(_, method, _, _, _)| method == "new" || method == "local_readers")
    {
        return Err(format!(
            "{service_name}: method collides with reserved local reader helper"
        ));
    }
    emit_local_readers(
        output,
        service_name,
        &declaration,
        runtime_module,
        annotation,
        &methods,
    )?;
    Ok(())
}
