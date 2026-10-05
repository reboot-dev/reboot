//! Immutable, host-fed placement snapshots for the legacy application plane.
//!
//! This is deliberately separate from [`crate::placement`], which routes the
//! Native2pc internal plane. It validates complete planner responses and keeps
//! the last valid snapshot, but owns no planner stream, resolver, host wiring,
//! authorization, ownership, or fencing.

use std::{
    collections::{BTreeMap, BTreeSet},
    net::Ipv6Addr,
    sync::{Arc, RwLock},
};

use sha1::{Digest as _, Sha1};
use tokio::sync::watch;
use tonic::{
    Status,
    transport::{Channel, Endpoint},
};

use crate::{placement_proto as proto, runtime::TransactionalChannelResolver};

/// Explicit application identity for legacy application-plane placement.
#[derive(Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub struct LegacyApplicationId(String);

impl LegacyApplicationId {
    pub fn new(value: impl Into<String>) -> Result<Self, Status> {
        let value = value.into();
        if value.is_empty() {
            return Err(Status::invalid_argument(
                "legacy placement application id is required",
            ));
        }
        Ok(Self(value))
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

/// Validated routable `host:port` authority from a planner server record.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct LegacyRoutableAddress(String);

impl LegacyRoutableAddress {
    fn from_host_port(host: &str, port: i32) -> Result<Self, Status> {
        if host.is_empty()
            || host.contains(['/', '?', '#', '@'])
            || host
                .bytes()
                .any(|byte| byte.is_ascii_control() || byte.is_ascii_whitespace())
        {
            return Err(Status::invalid_argument(
                "legacy placement server host is not a valid authority",
            ));
        }
        if !(1..=65_535).contains(&port) {
            return Err(Status::invalid_argument(
                "legacy placement server port must be in 1..=65535",
            ));
        }
        let authority = if host.parse::<Ipv6Addr>().is_ok() {
            format!("[{host}]:{port}")
        } else {
            format!("{host}:{port}")
        };
        authority.parse::<http::uri::Authority>().map_err(|_| {
            Status::invalid_argument("legacy placement server host is not a valid authority")
        })?;
        Ok(Self(authority))
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

/// One selected shard route from a single immutable plan version.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct LegacyRoute {
    pub plan_version: i64,
    pub shard_id: String,
    pub server_id: String,
    pub address: LegacyRoutableAddress,
}

#[derive(Clone, Debug)]
struct LegacyShard {
    id: String,
    first_key: Vec<u8>,
    server_id: String,
}

#[derive(Clone, Debug)]
struct LegacyApplicationPlacement {
    services: BTreeMap<String, String>,
    state_types: BTreeSet<String>,
    shards: Vec<LegacyShard>,
    addresses: BTreeMap<String, LegacyRoutableAddress>,
}

/// A complete, immutable validated legacy planner snapshot.
#[derive(Clone, Debug)]
pub struct LegacyPlacementSnapshot {
    version: i64,
    applications: BTreeMap<LegacyApplicationId, LegacyApplicationPlacement>,
}

impl LegacyPlacementSnapshot {
    pub fn version(&self) -> i64 {
        self.version
    }

    pub fn application_ids(&self) -> impl Iterator<Item = &LegacyApplicationId> {
        self.applications.keys()
    }

    pub fn service_names(&self, application: &LegacyApplicationId) -> Result<Vec<&str>, Status> {
        Ok(self
            .application(application)?
            .services
            .keys()
            .map(String::as_str)
            .collect())
    }

    pub fn state_type_names(&self, application: &LegacyApplicationId) -> Result<Vec<&str>, Status> {
        Ok(self
            .application(application)?
            .state_types
            .iter()
            .map(String::as_str)
            .collect())
    }

    pub fn route(
        &self,
        application: &LegacyApplicationId,
        state_ref: &str,
    ) -> Result<LegacyRoute, Status> {
        let application_placement = self.application(application)?;
        // Legacy transaction state references are existing opaque durable wire
        // identities. Python selects their first wire component; requiring the
        // newer typed StateRef codec here would reject those identities and
        // silently make established actors unroutable.
        let first_component = state_ref
            .split('/')
            .next()
            .filter(|component| !component.is_empty())
            .ok_or_else(|| {
                Status::invalid_argument("legacy state reference has no routing component")
            })?;
        let hash = Sha1::digest(first_component.as_bytes());
        let shard_index = application_placement
            .shards
            .partition_point(|shard| shard.first_key.as_slice() <= hash.as_slice())
            .checked_sub(1)
            .expect("validated legacy placement has an empty root shard boundary");
        let shard = &application_placement.shards[shard_index];
        let address = application_placement
            .addresses
            .get(&shard.server_id)
            .cloned()
            .ok_or_else(|| {
                Status::internal("validated legacy placement route has no server address")
            })?;
        Ok(LegacyRoute {
            plan_version: self.version,
            shard_id: shard.id.clone(),
            server_id: shard.server_id.clone(),
            address,
        })
    }

    fn application(
        &self,
        application: &LegacyApplicationId,
    ) -> Result<&LegacyApplicationPlacement, Status> {
        self.applications
            .get(application)
            .ok_or_else(|| Status::not_found("legacy placement application is unknown"))
    }
}

impl TryFrom<proto::ListenForPlanResponse> for LegacyPlacementSnapshot {
    type Error = Status;

    fn try_from(response: proto::ListenForPlanResponse) -> Result<Self, Self::Error> {
        let plan = response
            .plan
            .ok_or_else(|| Status::invalid_argument("legacy placement plan is required"))?;
        if plan.version < 0 {
            return Err(Status::invalid_argument(
                "legacy placement plan version must be nonnegative",
            ));
        }

        let mut server_addresses =
            BTreeMap::<String, BTreeMap<String, LegacyRoutableAddress>>::new();
        for server in response.servers {
            if server.id.is_empty() || server.application_id.is_empty() {
                return Err(Status::invalid_argument(
                    "legacy placement server id and application are required",
                ));
            }
            let address = server.address.ok_or_else(|| {
                Status::invalid_argument("legacy placement server address is required")
            })?;
            let address = LegacyRoutableAddress::from_host_port(&address.host, address.port)?;
            if server_addresses
                .entry(server.application_id)
                .or_default()
                .insert(server.id, address)
                .is_some()
            {
                return Err(Status::invalid_argument(
                    "legacy placement server ids must be unique per application",
                ));
            }
        }

        let mut applications = BTreeMap::new();
        for application in plan.applications {
            let application_id = LegacyApplicationId::new(application.id)?;
            let mut services = BTreeMap::new();
            let mut state_types = BTreeSet::new();
            for service in application.services {
                if service.full_name.is_empty() {
                    return Err(Status::invalid_argument(
                        "legacy placement service name is required",
                    ));
                }
                if services
                    .insert(service.full_name, service.state_type_full_name.clone())
                    .is_some()
                {
                    return Err(Status::invalid_argument(
                        "legacy placement service names must be unique per application",
                    ));
                }
                state_types.insert(service.state_type_full_name);
            }

            let addresses = server_addresses
                .remove(application_id.as_str())
                .unwrap_or_default();
            if application.shards.is_empty() {
                return Err(Status::invalid_argument(
                    "legacy placement application requires at least one shard",
                ));
            }
            let mut shards = Vec::with_capacity(application.shards.len());
            for shard in application.shards {
                if shard.id.is_empty() || shard.server_id.is_empty() {
                    return Err(Status::invalid_argument(
                        "legacy placement shard id and server id are required",
                    ));
                }
                let range = shard.range.ok_or_else(|| {
                    Status::invalid_argument("legacy placement shard range is required")
                })?;
                if shards
                    .last()
                    .is_some_and(|prior: &LegacyShard| prior.first_key >= range.first_key)
                {
                    return Err(Status::invalid_argument(
                        "legacy placement shard boundaries must be strictly ordered",
                    ));
                }
                shards.push(LegacyShard {
                    id: shard.id,
                    first_key: range.first_key,
                    server_id: shard.server_id,
                });
            }
            if !shards[0].first_key.is_empty() {
                return Err(Status::invalid_argument(
                    "legacy placement first shard boundary must be empty",
                ));
            }
            if shards
                .iter()
                .any(|shard| !addresses.contains_key(&shard.server_id))
            {
                return Err(Status::invalid_argument(
                    "legacy placement requires an address for every shard server",
                ));
            }
            if applications
                .insert(
                    application_id,
                    LegacyApplicationPlacement {
                        services,
                        state_types,
                        shards,
                        addresses,
                    },
                )
                .is_some()
            {
                return Err(Status::invalid_argument(
                    "legacy placement application ids must be unique",
                ));
            }
        }
        if !server_addresses.is_empty() {
            return Err(Status::invalid_argument(
                "legacy placement server references an unknown application",
            ));
        }
        Ok(Self {
            version: plan.version,
            applications,
        })
    }
}

/// Atomically replaces only with complete, valid, strictly newer snapshots.
/// Rejected updates leave the prior last-good snapshot unchanged.
#[derive(Clone)]
pub struct PlanOnlyLegacyPlacement {
    snapshot: Arc<RwLock<Option<Arc<LegacyPlacementSnapshot>>>>,
    accepted_versions: Arc<watch::Sender<i64>>,
}

impl Default for PlanOnlyLegacyPlacement {
    fn default() -> Self {
        let (accepted_versions, _) = watch::channel(-1);
        Self {
            snapshot: Arc::new(RwLock::new(None)),
            accepted_versions: Arc::new(accepted_versions),
        }
    }
}

impl PlanOnlyLegacyPlacement {
    pub fn new() -> Self {
        Self::default()
    }

    /// Receives a new value only after a complete, valid, strictly newer
    /// snapshot has been installed and made visible to readers.
    pub fn accepted_versions(&self) -> watch::Receiver<i64> {
        self.accepted_versions.subscribe()
    }

    pub fn install(&self, response: proto::ListenForPlanResponse) -> Result<i64, Status> {
        let next = Arc::new(LegacyPlacementSnapshot::try_from(response)?);
        let version = next.version();
        let mut current = self
            .snapshot
            .write()
            .map_err(|_| Status::internal("legacy placement lock poisoned"))?;
        if current
            .as_ref()
            .is_some_and(|current| version <= current.version())
        {
            return Err(Status::failed_precondition(
                "legacy placement plan version must strictly increase",
            ));
        }
        *current = Some(next);
        drop(current);
        self.accepted_versions.send_replace(version);
        Ok(version)
    }

    pub fn snapshot(&self) -> Result<Arc<LegacyPlacementSnapshot>, Status> {
        self.snapshot
            .read()
            .map_err(|_| Status::internal("legacy placement lock poisoned"))?
            .clone()
            .ok_or_else(|| Status::unavailable("legacy placement has no installed plan"))
    }

    pub fn route(
        &self,
        application: &LegacyApplicationId,
        state_ref: &str,
    ) -> Result<LegacyRoute, Status> {
        self.snapshot()?.route(application, state_ref)
    }

    /// Checks only whether the last accepted snapshot declares every supplied
    /// service under one application. It is not an ownership check.
    pub fn declares_services(
        &self,
        application: &LegacyApplicationId,
        services: &BTreeSet<String>,
    ) -> bool {
        self.snapshot()
            .and_then(|snapshot| {
                let declared = snapshot.service_names(application)?;
                Ok(services
                    .iter()
                    .all(|service| declared.binary_search(&service.as_str()).is_ok()))
            })
            .unwrap_or(false)
    }
}

/// Generated transaction-client routing over one fixed legacy application.
///
/// Every call is routed against the current last-good application-plane plan.
/// It deliberately does not cache channels, interpret state types, or grant
/// actor ownership: legacy placement selects only the first raw state-reference
/// component under the caller's application.
#[derive(Clone)]
pub struct LegacyApplicationResolver {
    application: LegacyApplicationId,
    placement: PlanOnlyLegacyPlacement,
}

impl LegacyApplicationResolver {
    pub fn new(application: LegacyApplicationId, placement: PlanOnlyLegacyPlacement) -> Self {
        Self {
            application,
            placement,
        }
    }
}

#[tonic::async_trait]
impl TransactionalChannelResolver for LegacyApplicationResolver {
    async fn resolve(&self, _state_type: &str, state_ref: &str) -> Result<Channel, Status> {
        let route = self.placement.route(&self.application, state_ref)?;
        Endpoint::from_shared(format!("http://{}", route.address.as_str()))
            .map(|endpoint| endpoint.connect_lazy())
            .map_err(|_| Status::unavailable("legacy placement route has an invalid endpoint"))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn response(
        version: i64,
        boundaries: Vec<Vec<u8>>,
        address: &str,
    ) -> proto::ListenForPlanResponse {
        let (host, port) = address.rsplit_once(':').expect("test address has port");
        let shards = boundaries
            .into_iter()
            .enumerate()
            .map(|(index, first_key)| proto::plan::application::Shard {
                id: format!("shard-{index}"),
                range: Some(proto::plan::application::shard::KeyRange { first_key }),
                server_id: format!("server-{index}"),
                replica_index: 0,
            })
            .collect::<Vec<_>>();
        let servers = shards
            .iter()
            .map(|shard| proto::Server {
                id: shard.server_id.clone(),
                application_id: "app".into(),
                revision_number: 0,
                address: Some(proto::server::Address {
                    host: host.into(),
                    port: port.parse().expect("test port"),
                }),
                namespace: String::new(),
                file_descriptor_set: None,
                reboot_version: String::new(),
            })
            .collect();
        proto::ListenForPlanResponse {
            plan: Some(proto::Plan {
                version,
                applications: vec![proto::plan::Application {
                    id: "app".into(),
                    services: vec![
                        proto::plan::application::Service {
                            full_name: "example.v1.Counter".into(),
                            state_type_full_name: "example.v1.CounterState".into(),
                        },
                        proto::plan::application::Service {
                            full_name: "example.v1.Legacy".into(),
                            state_type_full_name: String::new(),
                        },
                    ],
                    shards,
                }],
            }),
            servers,
        }
    }

    #[test]
    fn extracts_a_valid_snapshot_and_routes_python_first_component_boundaries() {
        let first = "AEyp_5wmAiADZg:parent";
        let colocated = "AEyp_5wmAiADZg:parent/AAcExYZDHb-mAw:child";
        let hash = Sha1::digest(first.as_bytes()).to_vec();
        let placement = PlanOnlyLegacyPlacement::new();
        placement
            .install(response(
                7,
                vec![vec![], hash.clone()],
                "planner.internal:5001",
            ))
            .unwrap();
        let app = LegacyApplicationId::new("app").unwrap();
        let snapshot = placement.snapshot().unwrap();
        assert_eq!(snapshot.version(), 7);
        assert_eq!(
            snapshot.service_names(&app).unwrap(),
            ["example.v1.Counter", "example.v1.Legacy"]
        );
        assert_eq!(
            snapshot.state_type_names(&app).unwrap(),
            ["", "example.v1.CounterState"]
        );
        let route = placement.route(&app, colocated).unwrap();
        assert_eq!(route.shard_id, "shard-1");
        assert_eq!(route.server_id, "server-1");
        assert_eq!(route.address.as_str(), "planner.internal:5001");

        let before = "AEyp_5wmAiADZg:before";
        let first_hash = Sha1::digest(before.as_bytes()).to_vec();
        let boundary = vec![vec![], first_hash.clone()];
        let boundary_placement = PlanOnlyLegacyPlacement::new();
        boundary_placement
            .install(response(8, boundary, "planner.internal:5002"))
            .unwrap();
        let expected = if hash >= first_hash {
            "shard-1"
        } else {
            "shard-0"
        };
        assert_eq!(
            boundary_placement.route(&app, first).unwrap().shard_id,
            expected
        );
    }

    #[test]
    fn invalid_update_keeps_the_last_good_snapshot() {
        let placement = PlanOnlyLegacyPlacement::new();
        let app = LegacyApplicationId::new("app").unwrap();
        let state_ref = "legacy-transaction-actor";
        placement
            .install(response(1, vec![vec![]], "one.internal:5001"))
            .unwrap();
        let mut invalid = response(2, vec![vec![]], "two.internal:5002");
        invalid.plan.as_mut().unwrap().applications[0].shards[0].range = None;
        assert_eq!(
            placement.install(invalid).unwrap_err().code(),
            tonic::Code::InvalidArgument
        );
        assert_eq!(
            placement.route(&app, state_ref).unwrap().address.as_str(),
            "one.internal:5001"
        );
    }

    #[test]
    fn stale_version_is_rejected_without_rolling_back_last_good_snapshot() {
        let placement = PlanOnlyLegacyPlacement::new();
        let app = LegacyApplicationId::new("app").unwrap();
        let state_ref = "legacy-transaction-actor";
        placement
            .install(response(3, vec![vec![]], "three.internal:5003"))
            .unwrap();
        for version in [3, 2] {
            assert_eq!(
                placement
                    .install(response(version, vec![vec![]], "old.internal:5001"))
                    .unwrap_err()
                    .code(),
                tonic::Code::FailedPrecondition
            );
        }
        assert_eq!(
            placement.route(&app, state_ref).unwrap().address.as_str(),
            "three.internal:5003"
        );
    }

    #[tokio::test]
    async fn application_resolver_reports_missing_and_malformed_routes_and_reads_new_plans() {
        let placement = PlanOnlyLegacyPlacement::new();
        let application = LegacyApplicationId::new("app").unwrap();
        let resolver = LegacyApplicationResolver::new(application.clone(), placement.clone());

        assert_eq!(
            resolver
                .resolve("ignored.state.type", "opaque/child")
                .await
                .unwrap_err()
                .code(),
            tonic::Code::Unavailable
        );
        placement
            .install(response(1, vec![vec![]], "one.internal:5001"))
            .unwrap();
        for malformed in ["", "/child"] {
            assert_eq!(
                resolver
                    .resolve("ignored.state.type", malformed)
                    .await
                    .unwrap_err()
                    .code(),
                tonic::Code::InvalidArgument
            );
        }
        resolver
            .resolve("intentionally.unrelated.State", "opaque/child")
            .await
            .unwrap();
        assert_eq!(
            placement
                .route(&application, "opaque/child")
                .unwrap()
                .plan_version,
            1
        );
        placement
            .install(response(2, vec![vec![]], "two.internal:5002"))
            .unwrap();
        resolver
            .resolve("still.unrelated.State", "opaque/child")
            .await
            .unwrap();
        let route = placement.route(&application, "opaque/child").unwrap();
        assert_eq!(route.plan_version, 2);
        assert_eq!(route.address.as_str(), "two.internal:5002");
    }
}
