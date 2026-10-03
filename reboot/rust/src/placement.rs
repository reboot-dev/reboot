//! Host-fed, plan-only routing for the trusted Native2pc internal plane.
//!
//! This ports Python's `PlanOnlyPlacementClient` lookup rule, but deliberately
//! does not own the planner stream, reconnect policy, shard handoffs, actor
//! construction, execution, authentication, or ownership/fencing semantics.
//! A host supplies complete `ListenForPlanResponse` snapshots.

use std::{
    collections::BTreeMap,
    sync::{Arc, RwLock},
};

use tonic::Status;

use crate::{
    database_proto as proto,
    native_2pc::{Native2pcPlacementPlan, Native2pcRoute, Native2pcShardRoute, NativeActorId},
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
        if host.is_empty() || port <= 0 {
            return Err(Status::invalid_argument(
                "native placement server host and positive port are required",
            ));
        }
        Ok(Self(format!("http://{host}:{port}")))
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
        *self
            .snapshot
            .write()
            .map_err(|_| Status::internal("native placement lock poisoned"))? = Some(snapshot);
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

/// An application-scoped route lookup; it intentionally does not create a
/// Native2pc client or fall back to any legacy service.
#[derive(Clone)]
pub struct ApplicationNative2pcResolver {
    placement: PlanOnlyNative2pcPlacement,
    application: NativeApplicationId,
}

impl ApplicationNative2pcResolver {
    pub fn route(&self, actor: &NativeActorId) -> Result<Native2pcRoute, Status> {
        self.placement.route(&self.application, actor)
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
    use super::*;

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
}
