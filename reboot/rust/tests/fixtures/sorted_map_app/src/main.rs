//! Actual generated canonical EMPTY constructor and admitted same-host map calls.
//! Network inbound/nested and reusable sibling integration remain excluded.
use reboot::{
    database_proto as db,
    durable_coordinator::{
        DurableRootCoordinator, InProcessParticipantEndpoint, ParticipantResolver,
        ParticipantTarget, TonicCoordinatorSidecar,
    },
    durable_participant::{
        DurableActorParticipant, DurableActorParticipantHost, TonicParticipantSidecar,
    },
    runtime::{
        DatabaseActorStore, InboundTransactionStartFactory, RootTransactionStart,
        RootTransactionStartFactory, TransactionContext, TransactionExecution,
    },
    sorted_map_proto as map,
};
use std::{collections::BTreeMap, future::Future, pin::Pin, sync::Arc};
use tonic::Status;
use uuid::Uuid;
pub mod proto {
    tonic::include_proto!("coupled.v1");
}
pub mod generated {
    include!(concat!(env!("OUT_DIR"), "/coupled/v1/app.reboot.rs"));
}
pub mod generated_map {
    include!(concat!(
        env!("OUT_DIR"),
        "/rbt/std/collections/v1/sorted_map.reboot.rs"
    ));
}
const MAP: &str = "rbt.std.collections.v1.SortedMap";
struct Handler {
    map: generated_map::SortedMap,
    retained: Arc<std::sync::Mutex<Option<TransactionContext>>>,
}
#[tonic::async_trait]
impl generated::AppMethodsTransactionHandler for Handler {
    async fn create(
        &self,
        state: &mut proto::App,
        _: proto::Empty,
    ) -> Result<proto::Empty, Status> {
        state.value = 1;
        Ok(proto::Empty {})
    }
    async fn query(&self, state: &proto::App, _: proto::Empty) -> Result<proto::Value, Status> {
        Ok(proto::Value { value: state.value })
    }
    async fn run(
        &self,
        context: &TransactionContext,
        state: &mut proto::App,
        request: proto::Apply,
    ) -> Result<TransactionExecution<proto::Value>, Status> {
        *self.retained.lock().unwrap() = Some(context.clone());
        let guard = self.map.in_transaction(context).await?;
        // Native map participation starts at Range FIRST inside a genuine generated root.
        guard
            .range(map::RangeRequest {
                limit: 20,
                ..Default::default()
            })
            .await?;
        guard
            .insert(map::InsertRequest {
                entries: [
                    ("app".into(), state.value.to_string().into_bytes()),
                    ("empty".into(), vec![]),
                ]
                .into(),
            })
            .await?;
        guard
            .remove(map::RemoveRequest {
                keys: vec!["missing".into()],
            })
            .await?;
        assert_eq!(
            guard
                .get(map::GetRequest {
                    key: "empty".into()
                })
                .await?
                .value,
            Some(vec![])
        );
        assert_eq!(
            guard
                .range(map::RangeRequest {
                    start_key: Some("app".into()),
                    end_key: Some("empty".into()),
                    limit: 20
                })
                .await?
                .entries
                .len(),
            1
        );
        state.value += 1;
        if request.abort {
            let error = guard
                .range(map::RangeRequest {
                    limit: 0,
                    ..Default::default()
                })
                .await
                .unwrap_err();
            assert_eq!(error.code(), tonic::Code::Unknown);
            assert!(
                !error.details().is_empty(),
                "declared InvalidRangeError retained"
            );
            // Deliberately catch the nested map error and return success. The
            // library must doom the root so both eager map/app effects abort.
        }
        Ok(TransactionExecution::new(proto::Value {
            value: state.value,
        }))
    }
}
fn fresh_request(
    context: &reboot::ExternalContext,
    abort: bool,
) -> Result<tonic::Request<proto::Apply>, Box<dyn std::error::Error>> {
    let mut request = context.writer(proto::Apply { abort })?;
    // Bounded eager map roots require registered cancellation ownership, which
    // intentionally excludes automatic root-local idempotency in this slice.
    request.metadata_mut().remove("x-reboot-idempotency-key");
    Ok(request)
}
struct Starts;
impl RootTransactionStartFactory for Starts {
    fn next_root_transaction(&self) -> Result<RootTransactionStart, Status> {
        Ok(RootTransactionStart {
            transaction_id: Uuid::new_v4(),
            timestamp: prost_types::Timestamp::default(),
        })
    }
}
impl InboundTransactionStartFactory for Starts {
    fn next_inbound_transaction(
        &self,
        _: &reboot::runtime::InboundTransactionContext,
    ) -> Result<Uuid, Status> {
        Err(Status::failed_precondition(
            "prerequisite fixture excludes inbound",
        ))
    }
}
struct Routes {
    entries:
        BTreeMap<ParticipantTarget, Arc<InProcessParticipantEndpoint<TonicParticipantSidecar>>>,
}
impl ParticipantResolver for Routes {
    type Endpoint = InProcessParticipantEndpoint<TonicParticipantSidecar>;
    fn resolve(
        &self,
        target: &ParticipantTarget,
    ) -> Pin<Box<dyn Future<Output = Result<Arc<Self::Endpoint>, Status>> + Send + '_>> {
        let result = self
            .entries
            .get(target)
            .cloned()
            .ok_or_else(|| Status::failed_precondition("unregistered participant"));
        Box::pin(async move { result })
    }
}
#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let database = std::env::args().nth(1).expect("Database endpoint");
    let map_ref = std::env::args()
        .nth(2)
        .expect("fresh canonical map reference");
    let app_ref =
        reboot::state_ref::StateRef::from_id("coupled.v1.App", "generated-loop5")?.to_string();
    let store = DatabaseActorStore::connect(database.clone()).await?;
    let sidecar = Arc::new(TonicParticipantSidecar::connect(database.clone()).await?);
    let app_p = DurableActorParticipant::new(sidecar.clone(), "coupled.v1.App", app_ref.clone())
        .with_database_actor_gate(&store);
    let library = reboot::sorted_map::SortedMapLibrary::new(store.clone()).await?;
    let constructor_key = reboot::ExternalContext::new(map_ref.clone()).new_idempotency_key();
    let sorted_map = generated_map::SortedMap::create(&library, &map_ref, constructor_key).await?;
    // Replay the actual generated constructor; a distinct key must reject
    // duplicate construction, never overwrite an existing map.
    generated_map::SortedMap::create(&library, &map_ref, constructor_key).await?;
    assert!(
        generated_map::SortedMap::create(
            &library,
            &map_ref,
            reboot::ExternalContext::new(map_ref.clone()).new_idempotency_key()
        )
        .await
        .is_err()
    );
    let mut native = db::database_client::DatabaseClient::connect(database.clone()).await?;
    let empty = native
        .colocated_range(db::ColocatedRangeRequest {
            state_type: "rbt.std.collections.v1.SortedMapEntry".into(),
            parent_state_ref: map_ref.clone(),
            limit: 10,
            ..Default::default()
        })
        .await?
        .into_inner();
    assert!(
        empty.keys.is_empty(),
        "empty constructor must create readable entry CF"
    );
    let map_p = sorted_map.participant();
    let retained = Arc::new(std::sync::Mutex::new(None));
    let app_target = ParticipantTarget {
        state_type: "coupled.v1.App".into(),
        state_ref: app_ref.clone(),
    };
    let map_target = ParticipantTarget {
        state_type: MAP.into(),
        state_ref: map_ref.clone(),
    };
    let routes = Routes {
        entries: [
            (
                app_target,
                Arc::new(InProcessParticipantEndpoint::new(
                    DurableActorParticipantHost::new(app_p.clone()),
                )),
            ),
            (
                map_target,
                Arc::new(InProcessParticipantEndpoint::new(
                    DurableActorParticipantHost::new(map_p.clone()),
                )),
            ),
        ]
        .into(),
    };
    let coordinator = DurableRootCoordinator::new(
        Arc::new(TonicCoordinatorSidecar::connect(database.clone()).await?),
        Arc::new(routes),
    );
    let adapter = generated::AppMethodsTransactionAdapter::new(
        store,
        app_p,
        coordinator,
        Starts,
        Handler {
            map: sorted_map.clone(),
            retained: retained.clone(),
        },
    ).with_authorization(reboot::auth::AuthorizationPolicy::permissive_for_development())
    .with_explicit_abort_owner(reboot::explicit_abort::ExplicitAbortOwner::new(8)?);
    let listener = std::net::TcpListener::bind("127.0.0.1:0")?;
    let address = listener.local_addr()?;
    let endpoint = format!("http://{address}");
    drop(listener);
    let recovery = adapter.explicit_abort_recovery_registration()?;
    let (stop, stopped) = tokio::sync::oneshot::channel();
    let server = tokio::spawn(async move {
        reboot::application_host::ApplicationHost::new("sorted-map-app")
            .with_host_recovery(recovery)
            .add_public_service(proto::app_methods_server::AppMethodsServer::new(adapter))
            .serve_with_shutdown(address, async {
                let _ = stopped.await;
            })
            .await
    });
    let endpoint = tonic::transport::Endpoint::from_shared(endpoint)?;
    let deadline = tokio::time::Instant::now() + std::time::Duration::from_secs(10);
    let channel = loop {
        match endpoint.connect().await {
            Ok(channel) => break channel,
            Err(error) if tokio::time::Instant::now() < deadline => {
                assert!(
                    !server.is_finished(),
                    "real host must remain running: {error}"
                );
                tokio::time::sleep(std::time::Duration::from_millis(10)).await;
            }
            Err(error) => return Err(error.into()),
        }
    };
    let context = reboot::ExternalContext::new(app_ref);
    let mut transaction_client = proto::app_methods_client::AppMethodsClient::new(channel.clone());
    let mut client = generated::AppMethodsExternalClient::new(channel, context.clone());
    client.create(proto::Empty {}).await?;
    assert_eq!(
        transaction_client
            .run(fresh_request(&context, false)?)
            .await?
            .into_inner()
            .value,
        2
    );
    assert_eq!(client.query(proto::Empty {}).await?.into_inner().value, 2);
    assert!(
        transaction_client
            .run(fresh_request(&context, true)?)
            .await
            .is_err()
    );
    assert_eq!(client.query(proto::Empty {}).await?.into_inner().value, 2);
    let stale = retained.lock().unwrap().take().unwrap();
    assert!(
        sorted_map.in_transaction(&stale).await.is_err(),
        "completed root context must not retain builtin authority"
    );
    let mut native = db::database_client::DatabaseClient::connect(database).await?;
    let rows = native
        .colocated_range(db::ColocatedRangeRequest {
            state_type: "rbt.std.collections.v1.SortedMapEntry".into(),
            parent_state_ref: map_ref,
            limit: 100,
            ..Default::default()
        })
        .await?
        .into_inner();
    let app_key = rows
        .keys
        .iter()
        .position(|key| key.ends_with(":app"))
        .unwrap();
    assert_eq!(rows.values[app_key], b"1");
    stop.send(()).unwrap();
    server.await??;
    println!(
        "generated canonical map EMPTY constructor + CF + replay + duplicate rejection; admitted generated app/map atomic commit and caught declared map abort restores both; Range-first/read-own-writes/stale root fences passed; no network inbound/nested/sibling parity"
    );
    Ok(())
}
