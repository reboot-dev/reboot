// Generated executable workflow-to-workflow references. The runtime admission
// protocol is explicitly Rust-only; method schemas remain descriptor-derived.
fn emit_workflow_spawn_reference(
    output: &mut String,
    service: &ServiceDescriptorProto,
    annotation: &DurableService,
    package: &str,
    service_name: &str,
    runtime: &str,
    adapter: &str,
) -> Result<(), String> {
    let name = format!("{service_name}WorkflowRef");
    let state_type = annotation.state.trim_start_matches('.');
    output.push_str(&format!("/// Fixed-channel workflow spawn and typed authorized Wait. Root/finite scopes only; no constructor, transaction schedule or implicit credentials.\n#[derive(Clone)]\npub struct {name} {{channel:tonic::transport::Channel,target:{runtime}::one_shot_tasks::WorkflowWriterTarget}}\nimpl {name} {{pub fn new(channel:tonic::transport::Channel,actor:{runtime}::actor_ref::ActorRef,application:{runtime}::CallerId,bearer:Option<String>)->Result<Self,tonic::Status>{{if actor.state_type()!=\"{state_type}\"{{return Err(tonic::Status::invalid_argument(\"workflow reference state type mismatch\"));}}Ok(Self{{channel,target:{runtime}::one_shot_tasks::WorkflowWriterTarget::new(actor,application,bearer)?}})}}\n"));
    for method in &service.method {
        let proto_name = method.name.as_deref().unwrap();
        if !matches!(
            annotation.methods.get(proto_name),
            Some(DurableKind::Workflow)
        ) {
            continue;
        }
        let (rust, request, response) = method_types("workflow", package, service_name, method)?;
        let identity = format!("{package}.{service_name}.{proto_name}");
        let response_type = method
            .output_type
            .as_deref()
            .unwrap()
            .trim_start_matches('.');
        let errors = annotation
            .declared_errors
            .get(proto_name)
            .map(Vec::as_slice)
            .unwrap_or(&[]);
        let error = if errors.is_empty() {
            "tonic::Status".into()
        } else {
            declared_error_type(service_name, &rust)
        };
        let schema = errors.iter().map(|error| format!("{runtime}::one_shot_tasks::DeclaredTaskError::new::<proto::{}>(\"type.googleapis.com/{package}.{error}\")", error.to_upper_camel_case())).collect::<Vec<_>>().join(",");
        let map = if errors.is_empty() {
            String::new()
        } else {
            format!(".map_err({error}::from_status)")
        };
        let spawn_map = if errors.is_empty() {
            String::new()
        } else {
            format!(".map_err({error}::Grpc)")
        };
        output.push_str(&format!("pub async fn {rust}_spawn(&self,context:&{runtime}::one_shot_tasks::WorkflowContext<'_>,alias:&str,request:proto::{request},timestamp:Option<prost_types::Timestamp>)->Result<{runtime}::database_proto::TaskId,tonic::Status>{{context.spawn_workflow(self.channel.clone(),&self.target,alias,{runtime}::one_shot_tasks::WorkflowSpawnMethod{{state_type:\"{state_type}\",method:\"{identity}\",response_type:\"type.googleapis.com/{response_type}\",errors:vec![{schema}]}},request,timestamp).await}}\npub async fn {rust}_wait(&self,context:&{runtime}::one_shot_tasks::WorkflowContext<'_>,id:{runtime}::database_proto::TaskId)->Result<proto::{response},{error}>{{context.wait_spawned(self.channel.clone(),&self.target,id,{runtime}::one_shot_tasks::WorkflowWriterMethod{{state_type:\"{state_type}\",method:\"{identity}\",response_type:\"type.googleapis.com/{response_type}\",errors:vec![{schema}]}}).await{map}}}\npub async fn {rust}(&self,context:&{runtime}::one_shot_tasks::WorkflowContext<'_>,alias:&str,request:proto::{request})->Result<proto::{response},{error}>{{let id=self.{rust}_spawn(context,alias,request,None).await{spawn_map}?;self.{rust}_wait(context,id).await}}\n"));
    }
    output.push_str("}\n");
    output.push_str(&format!("impl<H> {adapter}<H>{{pub fn workflow_spawner(&self)->Result<{runtime}::one_shot_tasks::WorkflowSpawner,tonic::Status>{{let tasks=self.tasks.as_ref().ok_or_else(||tonic::Status::failed_precondition(\"spawn requires generated workflow registration\"))?;Ok({runtime}::one_shot_tasks::WorkflowSpawner::new(tasks.clone(),self.authorization.clone()))}}}}\n"));
    Ok(())
}
