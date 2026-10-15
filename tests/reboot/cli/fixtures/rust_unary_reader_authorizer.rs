// Test-only stateful authorization observer; production authorization paths
// remain generated SDK policy/verifier dispatch, not fixture replacements.
struct UnaryFixtureAuthorizer;
impl reboot::auth::Authorizer for UnaryFixtureAuthorizer {
    fn authorize<'a>(
        &'a self,
        context: &'a reboot::auth::AuthorizationContext,
        _auth: Option<&'a reboot::auth::Auth>,
        state_snapshot: Option<&'a [u8]>,
        request: &'a [u8],
    ) -> reboot::auth::AuthorizeFuture<'a> {
        Box::pin(async move {
            if context.method.ends_with("NumGreetings") && context.headers.cookie.is_some() {
                let denied = context.headers.cookie.as_deref() == Some("deny-beta")
                    && context.headers.state_ref.ends_with(":beta");
                let value = serde_json::json!({
                    "reference": context.headers.state_ref,
                    "method": context.method,
                    "cookie": context.headers.cookie,
                    "application": context.headers.application_id,
                    "internal": context.headers.internal_call,
                    "count": state_snapshot.and_then(|bytes| proto::HelloWorld::decode(bytes).ok()).map(|state| state.number_of_greetings),
                    "request": request,
                    "denied": denied,
                });
                let logged = std::env::var("RUST_DX_UNARY_AUTH_TRACE")
                    .ok()
                    .and_then(|path| {
                        use std::io::Write;
                        std::fs::OpenOptions::new()
                            .create(true)
                            .append(true)
                            .open(path)
                            .and_then(|mut file| writeln!(file, "{value}"))
                            .ok()
                    });
                if denied
                    || logged.is_none()
                    || context.headers.application_id.as_deref() != Some("rust_greetings")
                    || context.headers.internal_call
                {
                    return reboot::auth::AuthorizationDecision::PermissionDenied {
                        message: "unary fixture target denied".into(),
                    };
                }
            }
            reboot::auth::AuthorizationDecision::Allow
        })
    }
}
