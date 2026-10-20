// Dedicated canonical transaction tasks; never route through execute_writer.
fn emit_transaction_tasks(
    output: &mut String,
    service: &ServiceDescriptorProto,
    annotation: &DurableService,
    state: &str,
    runtime: &str,
    base_declarations: &str,
    package: &str,
) {
    let name = service.name.as_deref().expect("validated service");
    let mut validations = String::new();
    let mut responses = String::new();
    let mut executions = String::new();
    let mut declarations = String::new();
    for method in &service.method {
        let method_name = method.name.as_deref().expect("validated method");
        if !matches!(annotation.methods.get(method_name), Some(DurableKind::Transaction(metadata)) if metadata.mode == TransactionMode::Exclusive && !metadata.factory)
            || annotation.declared_errors.get(method_name).is_some_and(|errors| !errors.is_empty()) {
            continue;
        }
        let (rust, request, response) = method_types("transaction task", package, name, method).expect("validated method types");
        let identity = format!("{package}.{name}.{method_name}");
        let response_url = format!("type.googleapis.com/{}", method.output_type.as_deref().unwrap().trim_start_matches('.'));
        validations.push_str(&format!("\"{method_name}\" => {{ <proto::{request} as prost::Message>::decode(task.request.as_slice()).map_err(|_|tonic::Status::invalid_argument(\"malformed transaction task\"))?; Ok(()) }},"));
        responses.push_str(&format!("\"{method_name}\" => {{ if response.type_url != \"{response_url}\" {{return Err(tonic::Status::data_loss(\"wrong transaction task response\"));}} <proto::{response} as prost::Message>::decode(response.value.as_slice()).map_err(|_|tonic::Status::data_loss(\"malformed transaction task response\"))?; Ok(()) }},"));
        let (request_prelude, request_expression) = if request == "{{google.protobuf.Empty}}" { ("let () = request;", "()") } else { ("", "request") };
        let (response_prelude, response_expression) = if response == "{{google.protobuf.Empty}}" { ("let () = response;", "()") } else { ("", "response") };
        executions.push_str(&format!("\"{method_name}\" => {{ let request=<proto::{request} as prost::Message>::decode(context.task().request.as_slice()).map_err(|_|tonic::Status::data_loss(\"malformed transaction task request\"))?; {request_prelude} let response=self.target.{rust}(&context,\"canonical-transaction-task.v1\",{request_expression}).await?; {response_prelude} context.finish::<{state}DurableState,proto::{request},proto::{response}>(\"{response_url}\",{response_expression}).await }},"));
        declarations.push_str(&format!("declarations.push({runtime}::one_shot_tasks::TaskMethodDeclaration::new::<{state}DurableState,proto::{request},proto::{response}>(\"{identity}\",\"{response_url}\",vec![]).transaction());"));
    }
    if declarations.is_empty() { return; }
    let binding = format!("{name}CanonicalTransactionTaskBinding");
    output.push_str(&format!(r#"
struct {binding}<H> {{ ordinary: {name}ReaderTaskBinding<H>, target: {name}WorkflowTransactionRef }}
#[tonic::async_trait]
impl<H:{name}TransactionHandler> {runtime}::one_shot_tasks::ReaderTaskBinding for {binding}<H> {{
fn validate(&self,task:&{runtime}::database_proto::Task)->Result<(),tonic::Status> {{ match task.method.as_str() {{ {validations} _=>self.ordinary.validate(task) }} }}
async fn execute(&self,task:&{runtime}::database_proto::Task)->Result<prost_types::Any,tonic::Status> {{self.ordinary.execute(task).await}}
async fn execute_terminal(&self,task:&{runtime}::database_proto::Task)->Result<{runtime}::database_proto::task::ResponseOrError,tonic::Status> {{self.ordinary.execute_terminal(task).await}}
fn validate_response(&self,task:&{runtime}::database_proto::Task,response:&prost_types::Any)->Result<(),tonic::Status> {{match task.method.as_str() {{{responses} _=>self.ordinary.validate_response(task,response)}}}}
fn validate_error(&self,task:&{runtime}::database_proto::Task,error:&prost_types::Any)->Result<(),tonic::Status> {{self.ordinary.validate_error(task,error)}}
fn writer_capable(&self)->bool{{true}}
async fn execute_workflow(&self,context:{runtime}::one_shot_tasks::WorkflowContext<'_>)->Result<{runtime}::one_shot_tasks::WorkflowReceipt,tonic::Status> {{match context.task().method.as_str() {{{executions} _=>Err(tonic::Status::failed_precondition("not transaction executor"))}}}}
}}
impl<H,P,C,R,F> {name}TransactionAdapter<H,P,C,R,F> where H:{name}TransactionHandler,P:{runtime}::durable_participant::ParticipantSidecar,C:{runtime}::durable_coordinator::CoordinatorSidecar,R:{runtime}::durable_coordinator::ParticipantResolver,F:{runtime}::runtime::RootTransactionStartFactory+{runtime}::runtime::InboundTransactionStartFactory {{
/// Register canonical exclusive non-factory transaction targets on the original
/// participant. Route must reach this actor's generated public transaction RPC.
/// Due/running cancellation is deliberately unsupported; future Cancel is CAS.
pub fn with_canonical_transaction_tasks(mut self,channel:tonic::transport::Channel,application:{runtime}::CallerId,bearer:Option<String>)->Result<(Self,{runtime}::one_shot_tasks::OneShotTasks),Box<tonic::Status>> {{
if self.tasks.is_some() {{return Err(Box::new(tonic::Status::failed_precondition("task owner already attached")));}}
let actor=self.participant.actor_target();
self.participant.validate_task_owner(&self.store,<{state}DurableState as {runtime}::runtime::DurableStateDeclaration>::STATE_TYPE,&actor.state_ref)?;
let target={name}WorkflowTransactionRef::new(channel,{runtime}::actor_ref::ActorRef::new(actor.state_type.clone(),{runtime}::state_ref::StateRef::from_maybe_readable(&actor.state_ref).map_err(|error|tonic::Status::invalid_argument(error.to_string()))?),application,bearer)?;
let mut declarations={base_declarations}; {declarations}
let tasks={runtime}::one_shot_tasks::OneShotTasks::new_with_participant_declarations(self.store.clone(),actor.state_type,actor.state_ref,{runtime}::one_shot_tasks::ParticipantBoundTaskBinding::new(self.participant.clone(),{binding}{{ordinary:{name}ReaderTaskBinding{{handler:self.handler.clone(),store:self.store.clone(),writers:false}},target}}),declarations)?;
self.local_registration=None;self.local_incarnation=std::sync::Arc::new(());self.tasks=Some(tasks.clone());Ok((self,tasks))
}}
}}
"#));
}
