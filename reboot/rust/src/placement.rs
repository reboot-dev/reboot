//! Host-fed, plan-only routing for the trusted Native2pc internal plane.
//!
//! This ports Python's `PlanOnlyPlacementClient` lookup rule, but deliberately
//! does not own the planner stream, reconnect policy, shard handoffs, actor
//! construction, execution, authentication, or ownership/fencing semantics.
//! A host supplies complete `ListenForPlanResponse` snapshots.

use std::{
    collections::BTreeMap,
    net::Ipv6Addr,
    sync::{Arc, RwLock},
};

use tonic::Status;

use crate::{
    native_2pc::{
        Native2pcCoordinatorEndpoint, Native2pcCoordinatorResolver, Native2pcParticipantEndpoint,
        Native2pcParticipantResolver, Native2pcPlacementPlan, Native2pcRoute, Native2pcShardRoute,
        NativeActorId, NativeFuture,
    },
    placement_proto as proto,
};

/// Explicit application selection is required: actor state type does not imply
/// the application that owns a route.
#[derive(Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub struct NativeApplicationId(String);

impl NativeApplicationId {
    pub fn new(value: impl Into<String>) -> Result<Self, Status> {
        let value = value.into();
        if value.is_empty() {
            return Err(Status::invalid_argument(
                "native placement application id is required",
            ));
        }
        Ok(Self(value))
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

/// Validated absolute endpoint appropriate for Tonic's endpoint builder.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct NativeRoutableAddress(String);

impl NativeRoutableAddress {
    pub fn from_host_port(host: &str, port: i32) -> Result<Self, Status> {
        if host.is_empty()
            || host.contains(['/', '?', '#', '@'])
            || host
                .bytes()
                .any(|byte| byte.is_ascii_control() || byte.is_ascii_whitespace())
        {
            return Err(Status::invalid_argument(
                "native placement server host is not a valid authority",
            ));
        }
        if !(1..=65_535).contains(&port) {
            return Err(Status::invalid_argument(
                "native placement server port must be in 1..=65535",
            ));
        }
        let authority = if host.parse::<Ipv6Addr>().is_ok() {
            format!("[{host}]:{port}")
        } else {
            format!("{host}:{port}")
        };
        let authority = authority.parse::<http::uri::Authority>().map_err(|_| {
            Status::invalid_argument("native placement server host is not a valid authority")
        })?;
        let endpoint = format!("http://{authority}");
        endpoint.parse::<http::Uri>().map_err(|_| {
            Status::invalid_argument("native placement server endpoint is not a valid URI")
        })?;
        Ok(Self(endpoint))
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

#[derive(Clone, Debug)]
struct PlacementSnapshot {
    version: i64,
    plans: BTreeMap<NativeApplicationId, Native2pcPlacementPlan>,
}

/// Complete-plan replacement store. A rejected response never mutates the
/// currently routable snapshot.
#[derive(Clone, Default)]
pub struct PlanOnlyNative2pcPlacement {
    snapshot: Arc<RwLock<Option<Arc<PlacementSnapshot>>>>,
}

impl PlanOnlyNative2pcPlacement {
    pub fn new() -> Self {
        Self::default()
    }

    /// Validate and atomically replace every known application route from one
    /// complete planner response. This is routing data only and can be stale.
    pub fn install(&self, response: proto::ListenForPlanResponse) -> Result<i64, Status> {
        let snapshot = Arc::new(snapshot_from_response(response)?);
        let version = snapshot.version;
        let mut current = self
            .snapshot
            .write()
            .map_err(|_| Status::internal("native placement lock poisoned"))?;
        if current
            .as_ref()
            .is_some_and(|current| version <= current.version)
        {
            return Err(Status::failed_precondition(
                "native placement plan version must strictly increase",
            ));
        }
        *current = Some(snapshot);
        Ok(version)
    }

    pub fn route(
        &self,
        application: &NativeApplicationId,
        actor: &NativeActorId,
    ) -> Result<Native2pcRoute, Status> {
        let snapshot = self
            .snapshot
            .read()
            .map_err(|_| Status::internal("native placement lock poisoned"))?
            .clone()
            .ok_or_else(|| Status::unavailable("native placement has no installed plan"))?;
        let plan = snapshot
            .plans
            .get(application)
            .ok_or_else(|| Status::not_found("native placement application is unknown"))?;
        plan.route(application.as_str(), actor)
    }

    /// Bind callers to one explicitly selected application without inferring it
    /// from a state type or other actor fields.
    pub fn application(
        &self,
        application: NativeApplicationId,
    ) -> Result<ApplicationNative2pcResolver, Status> {
        let snapshot = self
            .snapshot
            .read()
            .map_err(|_| Status::internal("native placement lock poisoned"))?;
        if snapshot
            .as_ref()
            .is_none_or(|snapshot| !snapshot.plans.contains_key(&application))
        {
            return Err(Status::not_found("native placement application is unknown"));
        }
        Ok(ApplicationNative2pcResolver {
            placement: self.clone(),
            application,
        })
    }
}

/// Host-owned connector for resolved Native2pc-only endpoints. The connector
/// chooses transport/TLS policy; this placement layer never treats routing as
/// authorization or creates a legacy client.
pub trait Native2pcEndpointConnector: Send + Sync + 'static {
    type ParticipantEndpoint: Native2pcParticipantEndpoint;
    type CoordinatorEndpoint: Native2pcCoordinatorEndpoint;

    fn participant(
        &self,
        address: NativeRoutableAddress,
        actor: NativeActorId,
    ) -> NativeFuture<'_, Arc<Self::ParticipantEndpoint>>;

    fn coordinator(
        &self,
        address: NativeRoutableAddress,
        actor: NativeActorId,
    ) -> NativeFuture<'_, Arc<Self::CoordinatorEndpoint>>;
}

/// An application-scoped route lookup. It intentionally neither creates a
/// Native2pc client nor falls back to any legacy service.
#[derive(Clone)]
pub struct ApplicationNative2pcResolver {
    placement: PlanOnlyNative2pcPlacement,
    application: NativeApplicationId,
}

impl ApplicationNative2pcResolver {
    pub fn route(&self, actor: &NativeActorId) -> Result<Native2pcRoute, Status> {
        self.placement.route(&self.application, actor)
    }

    /// Bind an explicitly host-owned Native2pc transport connector. The
    /// resulting resolver is still routing-only; it does not execute any
    /// transaction or interpret native actor effects.
    pub fn with_connector<C>(self, connector: Arc<C>) -> PlacementNative2pcResolver<C>
    where
        C: Native2pcEndpointConnector,
    {
        PlacementNative2pcResolver {
            placement: self,
            connector,
        }
    }
}

/// Adapter from a selected application's placement snapshot to the already
/// existing Native2pc endpoint-resolver traits.
#[derive(Clone)]
pub struct PlacementNative2pcResolver<C> {
    placement: ApplicationNative2pcResolver,
    connector: Arc<C>,
}

impl<C: Native2pcEndpointConnector> Native2pcParticipantResolver for PlacementNative2pcResolver<C> {
    type Endpoint = C::ParticipantEndpoint;

    fn resolve(&self, actor: &NativeActorId) -> NativeFuture<'_, Arc<Self::Endpoint>> {
        let actor = actor.clone();
        let route = self.placement.route(&actor);
        Box::pin(async move {
            let route = route?;
            self.connector
                .participant(NativeRoutableAddress(route.address), actor)
                .await
        })
    }
}

impl<C: Native2pcEndpointConnector> Native2pcCoordinatorResolver for PlacementNative2pcResolver<C> {
    type Endpoint = C::CoordinatorEndpoint;

    fn resolve(&self, actor: &NativeActorId) -> NativeFuture<'_, Arc<Self::Endpoint>> {
        let actor = actor.clone();
        let route = self.placement.route(&actor);
        Box::pin(async move {
            let route = route?;
            self.connector
                .coordinator(NativeRoutableAddress(route.address), actor)
                .await
        })
    }
}

fn snapshot_from_response(
    response: proto::ListenForPlanResponse,
) -> Result<PlacementSnapshot, Status> {
    let plan = response
        .plan
        .ok_or_else(|| Status::invalid_argument("native placement plan is required"))?;
    if plan.version < 0 {
        return Err(Status::invalid_argument(
            "native placement plan version must be nonnegative",
        ));
    }

    let mut addresses = BTreeMap::<String, BTreeMap<String, String>>::new();
    for server in response.servers {
        if server.id.is_empty() || server.application_id.is_empty() {
            return Err(Status::invalid_argument(
                "native placement server id and application are required",
            ));
        }
        let address = server.address.ok_or_else(|| {
            Status::invalid_argument("native placement server address is required")
        })?;
        let endpoint = NativeRoutableAddress::from_host_port(&address.host, address.port)?;
        let application_servers = addresses.entry(server.application_id).or_default();
        if application_servers.insert(server.id, endpoint.0).is_some() {
            return Err(Status::invalid_argument(
                "native placement server ids must be unique per application",
            ));
        }
    }

    let mut plans = BTreeMap::new();
    for application in plan.applications {
        let application_id = NativeApplicationId::new(application.id)?;
        let server_addresses = addresses
            .remove(application_id.as_str())
            .unwrap_or_default();
        let mut routes = Vec::with_capacity(application.shards.len());
        for shard in application.shards {
            let range = shard.range.ok_or_else(|| {
                Status::invalid_argument("native placement shard range is required")
            })?;
            routes.push(Native2pcShardRoute {
                shard_id: shard.id,
                first_key: range.first_key,
                server_id: shard.server_id,
            });
        }
        let placement = Native2pcPlacementPlan::new(
            application_id.as_str(),
            plan.version,
            routes,
            server_addresses,
        )?;
        if plans.insert(application_id, placement).is_some() {
            return Err(Status::invalid_argument(
                "native placement application ids must be unique",
            ));
        }
    }
    if !addresses.is_empty() {
        return Err(Status::invalid_argument(
            "native placement server references an unknown application",
        ));
    }
    Ok(PlacementSnapshot {
        version: plan.version,
        plans,
    })
}

#[cfg(test)]
mod tests {
    use std::sync::Mutex;

    use crate::database_proto as native;

    use super::*;

    #[derive(Default)]
    struct MockParticipant;

    impl Native2pcParticipantEndpoint for MockParticipant {
        fn capabilities(
            &self,
            _: native::Native2pcCapabilitiesRequest,
        ) -> NativeFuture<'_, native::Native2pcCapabilitiesResponse> {
            Box::pin(async { Err(Status::unimplemented("test endpoint")) })
        }
        fn prepare(
            &self,
            _: native::Native2pcPrepareRequest,
        ) -> NativeFuture<'_, native::Native2pcPrepareResponse> {
            Box::pin(async { Err(Status::unimplemented("test endpoint")) })
        }
        fn terminal(
            &self,
            _: native::Native2pcTerminalRequest,
        ) -> NativeFuture<'_, native::Native2pcTerminalResponse> {
            Box::pin(async { Err(Status::unimplemented("test endpoint")) })
        }
    }

    #[derive(Default)]
    struct MockCoordinator;

    impl Native2pcCoordinatorEndpoint for MockCoordinator {
        fn watch(
            &self,
            _: native::Native2pcWatchRequest,
        ) -> NativeFuture<'_, native::Native2pcWatchResponse> {
            Box::pin(async { Err(Status::unimplemented("test endpoint")) })
        }
    }

    #[derive(Default)]
    struct RecordingConnector {
        calls: Mutex<Vec<(String, String, String)>>,
    }

    impl Native2pcEndpointConnector for RecordingConnector {
        type ParticipantEndpoint = MockParticipant;
        type CoordinatorEndpoint = MockCoordinator;

        fn participant(
            &self,
            address: NativeRoutableAddress,
            actor: NativeActorId,
        ) -> NativeFuture<'_, Arc<Self::ParticipantEndpoint>> {
            self.calls.lock().unwrap().push((
                "participant".into(),
                address.as_str().into(),
                actor.state_ref().into(),
            ));
            Box::pin(async { Ok(Arc::new(MockParticipant)) })
        }

        fn coordinator(
            &self,
            address: NativeRoutableAddress,
            actor: NativeActorId,
        ) -> NativeFuture<'_, Arc<Self::CoordinatorEndpoint>> {
            self.calls.lock().unwrap().push((
                "coordinator".into(),
                address.as_str().into(),
                actor.state_ref().into(),
            ));
            Box::pin(async { Ok(Arc::new(MockCoordinator)) })
        }
    }

    fn response(version: i64, address: &str) -> proto::ListenForPlanResponse {
        let (host, port) = address.split_once(':').unwrap();
        proto::ListenForPlanResponse {
            plan: Some(proto::Plan {
                version,
                applications: vec![proto::plan::Application {
                    id: "app".into(),
                    services: vec![],
                    shards: vec![proto::plan::application::Shard {
                        id: "root".into(),
                        range: Some(proto::plan::application::shard::KeyRange {
                            first_key: vec![],
                        }),
                        server_id: "server".into(),
                        replica_index: 0,
                    }],
                }],
            }),
            servers: vec![proto::Server {
                id: "server".into(),
                application_id: "app".into(),
                revision_number: 0,
                address: Some(proto::server::Address {
                    host: host.into(),
                    port: port.parse().unwrap(),
                }),
                namespace: String::new(),
                file_descriptor_set: None,
                reboot_version: String::new(),
            }],
        }
    }

    #[test]
    fn host_fed_snapshot_routes_only_after_a_complete_valid_plan() {
        let placement = PlanOnlyNative2pcPlacement::new();
        let app = NativeApplicationId::new("app").unwrap();
        let actor = NativeActorId::new("example.State", "first/child").unwrap();
        assert_eq!(
            placement.route(&app, &actor).unwrap_err().code(),
            tonic::Code::Unavailable
        );
        assert_eq!(
            placement
                .install(response(4, "planner.internal:5001"))
                .unwrap(),
            4
        );
        assert_eq!(
            placement
                .application(app)
                .unwrap()
                .route(&actor)
                .unwrap()
                .address,
            "http://planner.internal:5001"
        );
    }

    #[test]
    fn rejected_replacement_preserves_the_prior_atomic_snapshot() {
        let placement = PlanOnlyNative2pcPlacement::new();
        let app = NativeApplicationId::new("app").unwrap();
        let actor = NativeActorId::new("example.State", "actor").unwrap();
        placement.install(response(1, "one.internal:5001")).unwrap();
        let mut invalid = response(2, "two.internal:5002");
        invalid.plan.as_mut().unwrap().applications[0].shards[0].range = None;
        assert_eq!(
            placement.install(invalid).unwrap_err().code(),
            tonic::Code::InvalidArgument
        );
        assert_eq!(
            placement.route(&app, &actor).unwrap().address,
            "http://one.internal:5001"
        );
        placement
            .install(response(3, "three.internal:5003"))
            .unwrap();
        assert_eq!(
            placement.route(&app, &actor).unwrap().address,
            "http://three.internal:5003"
        );
    }

    #[test]
    fn host_fed_plan_rejects_unknown_server_application_and_bad_endpoint() {
        let placement = PlanOnlyNative2pcPlacement::new();
        let mut unknown_application = response(1, "one.internal:5001");
        unknown_application.servers[0].application_id = "other".into();
        assert!(placement.install(unknown_application).is_err());
        let mut bad_endpoint = response(1, "one.internal:5001");
        bad_endpoint.servers[0].address.as_mut().unwrap().port = 0;
        assert!(placement.install(bad_endpoint).is_err());
    }

    #[tokio::test]
    async fn connector_resolvers_forward_the_routed_address_and_original_actor() {
        let placement = PlanOnlyNative2pcPlacement::new();
        let application = NativeApplicationId::new("app").unwrap();
        placement
            .install(response(1, "native.internal:5001"))
            .unwrap();
        let connector = Arc::new(RecordingConnector::default());
        let resolver = placement
            .application(application)
            .unwrap()
            .with_connector(Arc::clone(&connector));
        let actor = NativeActorId::new("example.State", "actor/child").unwrap();
        Native2pcParticipantResolver::resolve(&resolver, &actor)
            .await
            .unwrap();
        Native2pcCoordinatorResolver::resolve(&resolver, &actor)
            .await
            .unwrap();
        assert_eq!(
            connector.calls.lock().unwrap().as_slice(),
            [
                (
                    "participant".into(),
                    "http://native.internal:5001".into(),
                    "actor/child".into(),
                ),
                (
                    "coordinator".into(),
                    "http://native.internal:5001".into(),
                    "actor/child".into(),
                ),
            ]
        );
    }

    #[test]
    fn endpoints_are_uri_validated_and_ipv6_is_bracketed() {
        assert_eq!(
            NativeRoutableAddress::from_host_port("127.0.0.1", 5001)
                .unwrap()
                .as_str(),
            "http://127.0.0.1:5001"
        );
        assert_eq!(
            NativeRoutableAddress::from_host_port("planner.internal", 443)
                .unwrap()
                .as_str(),
            "http://planner.internal:443"
        );
        assert_eq!(
            NativeRoutableAddress::from_host_port("::1", 5001)
                .unwrap()
                .as_str(),
            "http://[::1]:5001"
        );
        for host in ["", "http://planner", "planner/path", "bad host"] {
            assert!(NativeRoutableAddress::from_host_port(host, 5001).is_err());
        }
        assert!(NativeRoutableAddress::from_host_port("planner", 65_536).is_err());
    }

    #[test]
    fn out_of_order_plans_cannot_rollback_a_snapshot() {
        let placement = PlanOnlyNative2pcPlacement::new();
        let app = NativeApplicationId::new("app").unwrap();
        let actor = NativeActorId::new("example.State", "actor").unwrap();
        placement
            .install(response(3, "three.internal:5003"))
            .unwrap();
        for version in [3, 2] {
            assert_eq!(
                placement
                    .install(response(version, "old.internal:5001"))
                    .unwrap_err()
                    .code(),
                tonic::Code::FailedPrecondition
            );
        }
        assert_eq!(
            placement.route(&app, &actor).unwrap().address,
            "http://three.internal:5003"
        );
    }
}
