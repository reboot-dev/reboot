// Database-only unary reader companion; deliberately not emitted for mixed
// transaction/workflow services, nor for user-defined streaming RPCs.
fn emit_local_readers(
    output: &mut String,
    service: &str,
    declaration: &str,
    runtime: &str,
    annotation: &DurableService,
    methods: &[&(&DurableKind, String, String, String, String)],
) {
    let readers: Vec<_> = methods
        .iter()
        .filter(|(kind, _, _, _, _)| matches!(kind, DurableKind::Reader))
        .collect();
    if readers.is_empty() {
        return;
    }
    let adapter = format!("{service}DatabaseAdapter");
    let handler = format!("{service}DatabaseHandler");
    output.push_str(&format!("impl<H: {handler}> {adapter}<H> {{\n/// Bind Rust-only local subscriptions to an exact actor. Register the returned owner with ApplicationHost; only one trusted host may mutate this sidecar.\n#[allow(clippy::result_large_err)]\npub fn local_readers(&self, state_ref: &str) -> Result<({runtime}::reactive::LocalReaderOwner, {runtime}::reactive::LocalReaderService<Self>), tonic::Status> {{ let owner = {runtime}::reactive::LocalReaderOwner::for_generated_actor(&self.store, <{declaration} as {runtime}::runtime::DurableStateDeclaration>::STATE_TYPE, state_ref)?; Ok((owner.clone(), {runtime}::reactive::LocalReaderService::new(self.clone(), owner)?)) }}\n}}\n#[tonic::async_trait]\nimpl<H: {handler}> {runtime}::reactive::ReaderBinding for {adapter}<H> {{\nfn validate_owner(&self, owner: &{runtime}::reactive::LocalReaderOwner) -> Result<(), tonic::Status> {{ owner.validate_generated_store(&self.store, <{declaration} as {runtime}::runtime::DurableStateDeclaration>::STATE_TYPE) }}\nasync fn read(&self, request: tonic::Request<{runtime}::reactive::wire::Query>) -> Result<Vec<u8>, tonic::Status> {{ match request.get_ref().method.as_str() {{\n"));
    for (kind, method, request, _response, identity) in &readers {
        let error = if declared_database_errors(annotation, kind, identity).is_empty() {
            ""
        } else {
            ".map_err(|error| error.into_status())"
        };
        output.push_str(&format!("\"{identity}\" => {{ let body = <proto::{request} as prost::Message>::decode(request.get_ref().request.as_slice()).map_err(|_| tonic::Status::invalid_argument(\"malformed typed reader request\"))?; let (metadata, extensions, _) = request.into_parts(); let request = tonic::Request::from_parts(metadata, extensions, body); let handler = self.handler.clone(); let response = self.store.reader_async_for_with_admission_authorized::<{declaration}, _, _, _>(\"{identity}\", {runtime}::runtime::StateAdmission::RequireExisting, &self.authorization, request, move |state, body| Box::pin(async move {{ handler.{method}(state, body).await{error} }})).await?; Ok(prost::Message::encode_to_vec(response.get_ref())) }},\n"));
    }
    output.push_str(
        "_ => Err(tonic::Status::unimplemented(\"not a generated local unary reader\")), } } }\n",
    );
    output.push_str(&format!("/// Typed Rust-only subscription client. No automatic stream retries/reconnect.\npub struct {service}ReactiveClient {{ client: {runtime}::reactive::wire::local_readers_client::LocalReadersClient<tonic::transport::Channel>, context: {runtime}::ExternalContext }}\nimpl {service}ReactiveClient {{ pub fn new(channel: tonic::transport::Channel, context: {runtime}::ExternalContext) -> Self {{ Self {{ client: {runtime}::reactive::wire::local_readers_client::LocalReadersClient::new(channel), context }} }}\n"));
    for (kind, method, request, response, identity) in readers {
        let (error, decode) = if declared_database_errors(annotation, kind, identity).is_empty() {
            (
                "tonic::Status".to_owned(),
                "std::convert::identity".to_owned(),
            )
        } else {
            let error = declared_error_type(service, method);
            (error.clone(), format!("{error}::from_status"))
        };
        let input_error = if error == "tonic::Status" {
            "tonic::Status::invalid_argument(e.to_string())".to_owned()
        } else {
            format!("{decode}(tonic::Status::invalid_argument(e.to_string()))")
        };
        let rpc_map = if error == "tonic::Status" {
            String::new()
        } else {
            format!(".map_err({decode})")
        };
        output.push_str(&format!("pub async fn {method}(&mut self, request: proto::{request}) -> Result<{runtime}::reactive::TypedSubscription<proto::{response}, {error}>, {error}> {{ let request = self.context.reader({runtime}::reactive::wire::Query {{ method: \"{identity}\".to_owned(), request: prost::Message::encode_to_vec(&request) }}).map_err(|e| {input_error})?; let stream = self.client.subscribe(request).await{rpc_map}?.into_inner(); Ok({runtime}::reactive::TypedSubscription::new(stream, {decode})) }}\n"));
    }
    output.push_str("}\n");
}
