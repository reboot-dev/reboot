//! Plain generated reader/writer task acceptance (no workflow-bearing service).
use super::*;
pub async fn serve() -> Result<(), Box<dyn std::error::Error>> {
    let store=DatabaseActorStore::connect(arg(2)).await?;
    let address:std::net::SocketAddr=arg(3).parse()?;
    let policy=reboot::auth::AuthorizationPolicy::new(None,Some(Arc::new(GenericPolicy)));
    let (adapter,tasks)=generated::RemoteMethodsDatabaseAdapter::new(store,outbound::Remote)
        .with_authorization(policy.clone())
        .with_one_shot_writer_tasks(outbound::actor().state_ref().as_str())?;
    let wait=reboot::one_shot_tasks::ReaderTaskWaitService::new(
        [tasks.clone()],reboot::legacy_placement::LegacyApplicationId::new(application())?,"server",plan(address.port()))?
        .with_wait_policy(policy)
        .with_admin_authorization(Arc::new(TaskAdminVerifier),Arc::new(GenericPolicy));
    ApplicationHost::new(application())
        .with_host_recovery(tasks.recovery(db::RecoverRequest {
            state_tags_by_state_type:[("workflow.v1.Remote".into(),"Remote".into())].into(),
            shard_ids:vec!["s000000000".into()],skip_idempotent_mutations:true,
        }))
        .add_public_service(proto::remote_methods_server::RemoteMethodsServer::new(adapter))
        .add_public_service(db::tasks_server::TasksServer::new(wait))
        .serve_with_shutdown(address,async {
            while !std::path::Path::new(&arg(4)).exists() {
                tokio::time::sleep(std::time::Duration::from_millis(10)).await;
            }
        }).await?;
    Ok(())
}
struct GenericPolicy;
impl reboot::auth::Authorizer for GenericPolicy {
    fn authorize<'a>(&'a self,context:&'a reboot::auth::AuthorizationContext,_:Option<&'a reboot::auth::Auth>,_:Option<&'a [u8]>,_:&'a [u8])->reboot::auth::AuthorizeFuture<'a> {
        Box::pin(async move {
            event("generic-authorize");
            let path=std::env::var("GENERIC_POLICY").unwrap();
            if std::fs::read_to_string(path).unwrap().trim()=="deny" && !context.method.ends_with(".Query") {
                reboot::auth::AuthorizationDecision::PermissionDenied{message:"generic policy revoked".into()}
            } else { reboot::auth::AuthorizationDecision::Allow }
        })
    }
}
pub async fn inspect()->Result<(),Box<dyn std::error::Error>> {
    let mut database=db::database_client::DatabaseClient::connect(arg(2)).await?;
    let actor=outbound::actor();
    let loaded=database.load(db::LoadRequest{actors:vec![db::Actor{state_type:actor.state_type().into(),state_ref:actor.state_ref().as_str().into(),state:None}],task_ids:vec![]}).await?.into_inner();
    let mut stream=database.recover(db::RecoverRequest{state_tags_by_state_type:[(actor.state_type().into(),"Remote".into())].into(),shard_ids:vec!["s000000000".into()],skip_idempotent_mutations:false}).await?.into_inner();
    let mut ids=Vec::new();let mut mutations=Vec::new();
    while let Some(batch)=stream.message().await? {
        for mutation in &batch.idempotent_mutations {
            for id in &mutation.task_ids {if !ids.contains(id) {ids.push(id.clone());}}
        }
        mutations.extend(batch.idempotent_mutations.into_iter().map(|mutation|hex(&mutation.encode_to_vec())));
    }
    let mut tasks=database.load(db::LoadRequest{actors:vec![],task_ids:ids}).await?.into_inner().tasks.into_iter().map(|task|hex(&task.encode_to_vec())).collect::<Vec<_>>();
    tasks.sort();mutations.sort();
    let state=loaded.actors.first().and_then(|a|a.state.as_ref()).map(|b|proto::Remote::decode(b.as_slice())).transpose()?;
    let value=state.map(|s|s.value.to_string()).unwrap_or_else(||"null".into());
    println!("{{\"value\":{value},\"tasks\":{tasks:?},\"mutations\":{mutations:?}}}");
    Ok(())
}
fn hex(bytes:&[u8])->String {bytes.iter().map(|b|format!("{b:02x}")).collect()}
