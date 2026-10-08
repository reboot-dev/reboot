// Unary reader companion for database and standalone workflow services.
// Transaction services and user-defined streaming RPCs remain separate gaps.
fn emit_local_readers(
    output: &mut String,
    service: &str,
    declaration: &str,
    runtime: &str,
    annotation: &DurableService,
    methods: &[&(&DurableKind, String, String, String, String)],
) -> Result<(), String> {
    let readers: Vec<_> = methods
        .iter()
        .filter(|(kind, _, _, _, _)| matches!(kind, DurableKind::Reader))
        .collect();
    if readers.is_empty() {
        return Ok(());
    }
    let mut symbols = HashMap::from([("new".to_owned(), "subscription constructor".to_owned())]);
    for (_, method, _, _, identity) in &readers {
        for symbol in [
            method.clone(),
            format!("{method}_with_timeout"),
            format!("{method}_connect"),
        ] {
            if let Some(previous) = symbols.insert(symbol.clone(), identity.clone()) {
                return Err(format!(
                    "{service}: reactive helper `{symbol}` collides between `{previous}` and `{identity}`"
                ));
            }
        }
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
    output.push_str(&format!("/// Typed Rust-only subscription client. No automatic stream retries/reconnect.\npub struct {service}ReactiveClient {{ channel: tonic::transport::Channel, context: {runtime}::ExternalContext }}\nimpl {service}ReactiveClient {{ pub fn new(channel: tonic::transport::Channel, context: {runtime}::ExternalContext) -> Self {{ Self {{ channel, context }} }}\n"));
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
        output.push_str(&format!("pub async fn {method}(&mut self, request: proto::{request}) -> Result<{runtime}::reactive::TypedSubscription<proto::{response}, {error}>, {error}> {{ self.{method}_connect(request, None).await }}\n pub async fn {method}_with_timeout(&mut self, request: proto::{request}, timeout: std::time::Duration) -> Result<{runtime}::reactive::TypedSubscription<proto::{response}, {error}>, {error}> {{ self.{method}_connect(request, Some(timeout)).await }}\n async fn {method}_connect(&self, request: proto::{request}, timeout: Option<std::time::Duration>) -> Result<{runtime}::reactive::TypedSubscription<proto::{response}, {error}>, {error}> {{ let mut request = self.context.reader({runtime}::reactive::wire::Query {{ method: \"{identity}\".to_owned(), request: prost::Message::encode_to_vec(&request) }}).map_err(|e| {input_error})?; if let Some(timeout) = timeout {{ request.set_timeout(timeout); }} {runtime}::reactive::TypedSubscription::connect(self.channel.clone(), request, {decode}).await }}\n"));
    }
    output.push_str("}\n");
    Ok(())
}

#[cfg(test)]
mod reactive_symbol_tests {
    use super::*;
    #[test]
    fn helper_names_are_rejected_before_emission_for_database_and_workflow_readers() {
        let annotation = DurableService {
            state: "demo.State".into(),
            default_constructible: false,
            methods: HashMap::new(),
            declared_errors: HashMap::new(),
        };
        for conflict in ["observe_with_timeout", "observe_connect"] {
            let methods = [
                (
                    DurableKind::Reader,
                    "observe".to_owned(),
                    "Q".to_owned(),
                    "R".to_owned(),
                    "demo.Methods.Observe".to_owned(),
                ),
                (
                    DurableKind::Reader,
                    conflict.to_owned(),
                    "Q".to_owned(),
                    "R".to_owned(),
                    format!("demo.Methods.{conflict}"),
                ),
            ];
            let references = methods
                .iter()
                .map(|(kind, method, request, response, identity)| {
                    (
                        kind,
                        method.clone(),
                        request.clone(),
                        response.clone(),
                        identity.clone(),
                    )
                })
                .collect::<Vec<_>>();
            let references = references.iter().collect::<Vec<_>>();
            let mut output = String::new();
            let error = emit_local_readers(
                &mut output,
                "Methods",
                "StateDurableState",
                "reboot",
                &annotation,
                &references,
            )
            .unwrap_err();
            assert!(error.contains("reactive helper"));
            assert!(output.is_empty());
        }
    }
}
