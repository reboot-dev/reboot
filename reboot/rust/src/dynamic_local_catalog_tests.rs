use super::*;
use crate::{
    database_proto as db,
    durable_participant::DurableActorParticipantHost,
    one_shot_tasks::{ParticipantBoundTaskBinding, ReaderTaskBinding},
    registered_local::{GeneratedLocalTransactionAdapter, RegisteredAdapterBinding},
    runtime::DatabaseActorStore,
};
struct Sidecar;
macro_rules! unused_rpc {
    ($name:ident, $request:ty, $response:ty) => {
        fn $name(
            &self,
            _: $request,
        ) -> std::pin::Pin<
            Box<dyn std::future::Future<Output = Result<$response, Status>> + Send + '_>,
        > {
            Box::pin(async { panic!("installation must not perform database IO") })
        }
    };
}
impl ParticipantSidecar for Sidecar {
    fn database_endpoint(&self) -> Option<&str> {
        Some("http://127.0.0.1:1/")
    }
    unused_rpc!(load, db::LoadRequest, db::LoadResponse);
    unused_rpc!(
        prepare,
        db::TransactionParticipantPrepareRequest,
        db::TransactionParticipantPrepareResponse
    );
    unused_rpc!(
        commit,
        db::TransactionParticipantCommitRequest,
        db::TransactionParticipantCommitResponse
    );
    unused_rpc!(
        abort,
        db::TransactionParticipantAbortRequest,
        db::TransactionParticipantAbortResponse
    );
    unused_rpc!(recover, db::RecoverRequest, Vec<db::RecoverResponse>);
    unused_rpc!(
        recover_idempotent_mutations,
        db::RecoverIdempotentMutationsRequest,
        Vec<db::RecoverIdempotentMutationsResponse>
    );
}
struct Binding;
#[tonic::async_trait]
impl ReaderTaskBinding for Binding {
    fn validate(&self, _: &db::Task) -> Result<(), Status> {
        Ok(())
    }
    async fn execute(&self, _: &db::Task) -> Result<prost_types::Any, Status> {
        panic!("no dispatch before Ready")
    }
}
#[derive(Clone)]
struct Adapter(GeneratedLocalAdapterConfig);
impl GeneratedLocalTransactionAdapter for Adapter {
    fn local_configuration(&self) -> Result<GeneratedLocalAdapterConfig, Status> {
        Ok(self.0.clone())
    }
    fn with_local_registration(self, _: RegisteredAdapterBinding) -> Result<Self, Status> {
        Ok(self)
    }
}
#[derive(Clone)]
struct Service;
impl tonic::server::NamedService for Service {
    const NAME: &'static str = "example.ActorMethods";
}
impl tower::Service<http::Request<tonic::body::BoxBody>> for Service {
    type Response = http::Response<tonic::body::BoxBody>;
    type Error = std::convert::Infallible;
    type Future = std::future::Ready<Result<Self::Response, Self::Error>>;
    fn poll_ready(
        &mut self,
        _: &mut std::task::Context<'_>,
    ) -> std::task::Poll<Result<(), Self::Error>> {
        std::task::Poll::Ready(Ok(()))
    }
    fn call(&mut self, _: http::Request<tonic::body::BoxBody>) -> Self::Future {
        panic!("frontdoor must gate before Ready")
    }
}
struct Starts;
impl crate::runtime::InboundTransactionStartFactory for Starts {
    fn next_inbound_transaction(
        &self,
        _: &crate::runtime::InboundTransactionContext,
    ) -> Result<uuid::Uuid, Status> {
        panic!("no inbound allocation during install")
    }
}
impl GeneratedLocalTransactionService for Adapter {
    type Service = Service;
    fn local_service(&self) -> Service {
        Service
    }
    fn local_inbound_factory(&self) -> Arc<dyn crate::runtime::InboundTransactionStartFactory> {
        Arc::new(Starts)
    }
}
type Owner = DynamicLocalOwner<Sidecar, Arc<()>>;
fn participant(store: &DatabaseActorStore, id: &str) -> DurableActorParticipant<Sidecar> {
    DurableActorParticipant::new(Arc::new(Sidecar), "example.Actor", id)
        .with_database_actor_gate(store)
}
fn config(id: &str) -> GeneratedLocalAdapterConfig {
    GeneratedLocalAdapterConfig {
        target: ParticipantTarget {
            state_type: "example.Actor".into(),
            state_ref: crate::state_ref::StateRef::from_id("example.Actor", id)
                .unwrap()
                .to_string(),
        },
        database_endpoint: "http://127.0.0.1:1/".into(),
        policy: crate::auth::AuthorizationPolicy::default(),
        methods: ["example.ActorMethods.Open".into()].into_iter().collect(),
        incarnation: Arc::new(()),
    }
}
fn endpoint(p: DurableActorParticipant<Sidecar>) -> Arc<InProcessParticipantEndpoint<Sidecar>> {
    Arc::new(InProcessParticipantEndpoint::new(
        DurableActorParticipantHost::new(p),
    ))
}
fn owner(store: &DatabaseActorStore, c: GeneratedLocalAdapterConfig) -> Arc<Owner> {
    let p = participant(store, &c.target.state_ref);
    let tasks = OneShotTasks::new_with_participant_declarations(
        store.clone(),
        c.target.state_type.clone(),
        c.target.state_ref.clone(),
        ParticipantBoundTaskBinding::new(p.clone(), Binding),
        vec![],
    )
    .unwrap();
    DynamicLocalOwner::new(c, p.clone(), tasks, endpoint(p), Arc::new(())).unwrap()
}

#[tokio::test]
async fn production_install_resolves_original_owner_before_ready_without_dispatch() {
    let store = DatabaseActorStore::connect_lazy("http://127.0.0.1:1").unwrap();
    let config = config("B");
    let original = owner(&store, config.clone());
    let mut host = ApplicationHost::new("dynamic-owner");
    let catalog =
        DynamicLocalCatalog::register(&mut host, config.clone(), 2, |owner: Arc<Owner>| {
            Ok(Adapter(owner.configuration().clone()))
        })
        .unwrap();
    assert!(catalog.resolve(&config.target).await.is_err());
    let installed = catalog.install(original.clone()).unwrap();
    let (found, destination) = catalog.lookup_installed(&config.target).unwrap();
    assert!(Arc::ptr_eq(&original, &found));
    assert!(
        found
            .participant()
            .same_owner_allocation(original.participant())
    );
    found
        .tasks()
        .validate_participant_owner(original.participant())
        .unwrap();
    assert!(Arc::ptr_eq(original.custody(), found.custody()));
    assert!(Arc::ptr_eq(
        original.endpoint(),
        &catalog.resolve(&config.target).await.unwrap()
    ));
    assert!(installed.binding().same_registration(destination.binding()));
    assert_eq!(
        destination
            .binding()
            .require_host_ready(&config)
            .unwrap_err()
            .code(),
        tonic::Code::Unavailable
    );
    assert_eq!(host.registered_transaction_adapter_count(), 1);
    assert_eq!(host.registered_transaction_service_count(), 1);
    let mut frontdoor = catalog.public_frontdoor().unwrap();
    let response = tower::Service::call(
        &mut frontdoor,
        http::Request::builder()
            .method(http::Method::POST)
            .uri("/example.ActorMethods/Open")
            .header(crate::STATE_REF_HEADER, &config.target.state_ref)
            .body(tonic::body::empty_body())
            .unwrap(),
    )
    .await
    .unwrap();
    assert_eq!(
        response.headers().get("grpc-status").unwrap(),
        "14",
        "real public frontdoor stays gated before Ready"
    );
    let mut second_config = config.clone();
    second_config.target.state_ref = crate::state_ref::StateRef::from_id("example.Actor", "C")
        .unwrap()
        .to_string();
    second_config.incarnation = Arc::new(());
    let second = owner(&store, second_config.clone());
    catalog.install(second.clone()).unwrap();
    assert!(Arc::ptr_eq(
        second.endpoint(),
        &catalog.resolve(&second_config.target).await.unwrap()
    ));
    assert!(!Arc::ptr_eq(original.endpoint(), second.endpoint()));
    assert_eq!(host.registered_transaction_adapter_count(), 2);
    assert!(catalog.install(original.clone()).is_err());
    let weak = Arc::downgrade(&original);
    drop(original);
    drop(found);
    drop(host);
    drop(catalog);
    assert!(
        weak.upgrade().is_some(),
        "original task/gate/custody survives host teardown"
    );
    assert!(
        destination
            .binding()
            .validate_configuration(&config)
            .is_err()
    );
}

#[tokio::test]
async fn same_labels_and_shared_store_gate_do_not_substitute_participant_ownership() {
    let store = DatabaseActorStore::connect_lazy("http://127.0.0.1:1").unwrap();
    let original = owner(&store, config("B"));
    let other = participant(&store, &original.configuration().target.state_ref);
    assert!(
        DynamicLocalOwner::new(
            config("B"),
            other.clone(),
            original.tasks().clone(),
            endpoint(other.clone()),
            Arc::new(())
        )
        .is_err()
    );
    assert!(
        DynamicLocalOwner::new(
            config("B"),
            original.participant().clone(),
            original.tasks().clone(),
            endpoint(other),
            Arc::new(())
        )
        .is_err()
    );
    let mut changed = original.configuration().clone();
    changed.target.state_ref = "C".into();
    assert!(
        DynamicLocalOwner::new(
            changed,
            original.participant().clone(),
            original.tasks().clone(),
            original.endpoint().clone(),
            Arc::new(())
        )
        .is_err()
    );
}

#[tokio::test]
async fn changed_incarnation_factory_seals_original_bundle_and_capacity_without_partial_publication()
 {
    let store = DatabaseActorStore::connect_lazy("http://127.0.0.1:1").unwrap();
    let original = owner(&store, config("B"));
    let weak = Arc::downgrade(&original);
    let mut host = ApplicationHost::new("dynamic-uncertainty");
    let catalog = DynamicLocalCatalog::register(
        &mut host,
        original.configuration().clone(),
        1,
        |owner: Arc<Owner>| {
            let mut c = owner.configuration().clone();
            c.incarnation = Arc::new(());
            Ok(Adapter(c))
        },
    )
    .unwrap();
    assert_eq!(
        catalog.install(original).err().unwrap().code(),
        tonic::Code::FailedPrecondition
    );
    assert!(weak.upgrade().is_some());
    assert_eq!(host.registered_transaction_adapter_count(), 0);
    assert_eq!(host.registered_transaction_service_count(), 0);
    assert!(catalog.resolve(&config("B").target).await.is_err());
    assert_eq!(
        catalog
            .install(owner(&store, config("C")))
            .err()
            .unwrap()
            .code(),
        tonic::Code::ResourceExhausted
    );
    drop(host);
    drop(catalog);
    assert!(weak.upgrade().is_some());
}
