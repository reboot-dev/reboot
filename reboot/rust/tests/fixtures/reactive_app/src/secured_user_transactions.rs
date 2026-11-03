use crate::{
    arg, proto,
    secured_user::{Verifier, generated},
};

use reboot::{
    application_host::{ApplicationHost, LegacyRecoveryMetadata},
    auth::AuthorizationPolicy,
    durable_coordinator::{CoordinatorRecovery, DurableRootCoordinator, TonicCoordinatorSidecar},
    durable_participant::{DurableActorParticipant, ParticipantRecovery, TonicParticipantSidecar},
    legacy_coordinator::LegacyApplicationCoordinatorWatchEndpoint,
    legacy_placement::{
        LegacyApplicationId, LegacyApplicationParticipantResolver, PlanOnlyLegacyPlacement,
    },
    runtime::{
        DatabaseActorStore, InboundTransactionContext, InboundTransactionStartFactory,
        RootTransactionStart, RootTransactionStartFactory, SharedLocalTransactionContext,
        TransactionContext, TransactionExecution,
    },
};
use std::{io::Write, path::PathBuf, sync::Arc, time::Duration};
const TYPE: &str = "reactive.v1.OwnerTransactions";
const SERVICE: &str = "reactive.v1.OwnerTransactionsMethods";
const APP: &str = "secured-user-transactions";
const KEY: &str = "00000000-0000-4000-8000-000000000456";
fn reference() -> String {
    reboot::state_ref::StateRef::from_id(TYPE, "alice")
        .unwrap()
        .to_string()
}
struct Starts;
impl RootTransactionStartFactory for Starts {
    fn next_root_transaction(&self) -> Result<RootTransactionStart, tonic::Status> {
        Ok(RootTransactionStart {
            transaction_id: uuid::Uuid::new_v4(),
            timestamp: prost_types::Timestamp::default(),
        })
    }
}
impl InboundTransactionStartFactory for Starts {
    fn next_inbound_transaction(
        &self,
        _: &InboundTransactionContext,
    ) -> Result<uuid::Uuid, tonic::Status> {
        Ok(uuid::Uuid::new_v4())
    }
}
struct Handler(PathBuf);
impl Handler {
    fn event(&self, name: &str) {
        writeln!(
            std::fs::OpenOptions::new()
                .create(true)
                .append(true)
                .open(&self.0)
                .unwrap(),
            "{name}"
        )
        .unwrap();
    }
}
fn value(s: &proto::OwnerTransactions) -> proto::Value {
    proto::Value {
        value: s.value,
        padding: vec![],
    }
}
#[tonic::async_trait]
impl generated::OwnerTransactionsMethodsTransactionHandler for Handler {
    async fn create(
        &self,
        _: &TransactionContext,
        s: &mut proto::OwnerTransactions,
        r: proto::Add,
    ) -> Result<TransactionExecution<proto::Value>, tonic::Status> {
        self.event("create");
        s.value = r.amount;
        Ok(TransactionExecution::new(value(s)))
    }
    async fn apply(
        &self,
        _: &TransactionContext,
        s: &mut proto::OwnerTransactions,
        r: proto::Add,
    ) -> Result<TransactionExecution<proto::Value>, tonic::Status> {
        self.event("apply");
        s.value += r.amount;
        if r.fail {
            return Err(tonic::Status::invalid_argument("requested rollback"));
        }
        Ok(TransactionExecution::new(value(s)))
    }
    async fn inspect(
        &self,
        _: &TransactionContext,
        s: &mut proto::OwnerTransactions,
        _: proto::Empty,
    ) -> Result<TransactionExecution<proto::Value>, tonic::Status> {
        self.event("inspect-inbound");
        Ok(TransactionExecution::new(value(s)))
    }
    async fn inspect_fresh_shared(
        &self,
        _: &SharedLocalTransactionContext,
        s: &mut proto::OwnerTransactions,
        _: proto::Empty,
    ) -> Result<proto::Value, tonic::Status> {
        self.event("inspect-fresh");
        Ok(value(s))
    }
    async fn query(
        &self,
        s: &proto::OwnerTransactions,
        _: proto::Empty,
    ) -> Result<proto::Value, tonic::Status> {
        self.event("query");
        Ok(value(s))
    }
    async fn set_claims(
        &self,
        _: &TransactionContext,
        _: &mut proto::OwnerTransactions,
        _: proto::Empty,
    ) -> Result<TransactionExecution<proto::Empty>, tonic::Status> {
        panic!("SetClaims handler reached")
    }
}
fn placement(address: std::net::SocketAddr) -> PlanOnlyLegacyPlacement {
    use reboot::placement_proto as p;
    let placement = PlanOnlyLegacyPlacement::new();
    placement
        .install(p::ListenForPlanResponse {
            plan: Some(p::Plan {
                version: 1,
                applications: vec![p::plan::Application {
                    id: APP.into(),
                    services: vec![p::plan::application::Service {
                        full_name: SERVICE.into(),
                        state_type_full_name: TYPE.into(),
                    }],
                    shards: vec![p::plan::application::Shard {
                        id: "s000000000".into(),
                        range: Some(p::plan::application::shard::KeyRange { first_key: vec![] }),
                        server_id: "server-0".into(),
                        replica_index: 0,
                    }],
                }],
            }),
            servers: vec![p::Server {
                id: "server-0".into(),
                application_id: APP.into(),
                address: Some(p::server::Address {
                    host: address.ip().to_string(),
                    port: i32::from(address.port()),
                }),
                ..Default::default()
            }],
        })
        .unwrap();
    placement
}
struct Client {
    inner: proto::owner_transactions_methods_client::OwnerTransactionsMethodsClient<
        tonic::transport::Channel,
    >,
    token: String,
}
impl Client {
    fn request<T>(&self, v: T, key: Option<uuid::Uuid>) -> tonic::Request<T> {
        let mut r = tonic::Request::new(v);
        r.metadata_mut()
            .insert("x-reboot-state-ref", reference().parse().unwrap());
        if self.token != "headerless" {
            r.metadata_mut().insert(
                "authorization",
                format!("Bearer {}", self.token).parse().unwrap(),
            );
        }
        if let Some(k) = key {
            r.metadata_mut()
                .insert("x-reboot-idempotency-key", k.to_string().parse().unwrap());
        }
        r.set_timeout(Duration::from_secs(5));
        r
    }
    async fn create(&mut self, amount: i64) -> Result<proto::Value, tonic::Status> {
        let r = self.request(
            proto::Add {
                amount,
                fail: false,
            },
            Some(uuid::Uuid::new_v4()),
        );
        Ok(self.inner.create(r).await?.into_inner())
    }
    async fn apply(
        &mut self,
        amount: i64,
        fail: bool,
        key: uuid::Uuid,
    ) -> Result<proto::Value, tonic::Status> {
        let r = self.request(proto::Add { amount, fail }, Some(key));
        Ok(self.inner.apply(r).await?.into_inner())
    }
    async fn query(&mut self) -> Result<proto::Value, tonic::Status> {
        let r = self.request(proto::Empty {}, None);
        Ok(self.inner.query(r).await?.into_inner())
    }
    async fn inspect(&mut self) -> Result<proto::Value, tonic::Status> {
        let r = self.request(proto::Empty {}, None);
        Ok(self.inner.inspect(r).await?.into_inner())
    }
    async fn claims(&mut self) -> Result<proto::Empty, tonic::Status> {
        let r = self.request(proto::Empty {}, Some(uuid::Uuid::new_v4()));
        Ok(self.inner.set_claims(r).await?.into_inner())
    }
}
async fn client(endpoint: &str, token: &str) -> Result<Client, tonic::transport::Error> {
    Ok(Client {
        inner: proto::owner_transactions_methods_client::OwnerTransactionsMethodsClient::connect(
            endpoint.to_owned(),
        )
        .await?,
        token: token.into(),
    })
}
async fn denial_matrix(endpoint: &str, events: &str) -> Result<(), Box<dyn std::error::Error>> {
    let before = std::fs::read(events).unwrap_or_default();
    for (token, code) in [
        ("headerless", tonic::Code::Unauthenticated),
        ("payload-forgery", tonic::Code::Unauthenticated),
        ("other", tonic::Code::PermissionDenied),
        ("reject", tonic::Code::Unauthenticated),
    ] {
        let mut c = client(endpoint, token).await?;
        assert_eq!(c.create(99).await.unwrap_err().code(), code);
        assert_eq!(
            c.apply(99, false, uuid::Uuid::new_v4())
                .await
                .unwrap_err()
                .code(),
            code
        );
        assert_eq!(c.query().await.unwrap_err().code(), code);
        assert_eq!(c.inspect().await.unwrap_err().code(), code);
    }
    assert_eq!(std::fs::read(events).unwrap_or_default(), before);
    Ok(())
}
pub async fn run(command: &str) -> Result<(), Box<dyn std::error::Error>> {
    if command == "user-txn-serve" {
        let endpoint = arg(2);
        let address: std::net::SocketAddr = arg(3).parse()?;
        let shutdown = arg(4);
        let application = LegacyApplicationId::new(APP)?;
        let placement = placement(address);
        let participant = DurableActorParticipant::new(
            Arc::new(TonicParticipantSidecar::connect(&endpoint).await?),
            TYPE,
            reference(),
        );
        let coordinator = DurableRootCoordinator::new(
            Arc::new(TonicCoordinatorSidecar::connect(&endpoint).await?),
            Arc::new(LegacyApplicationParticipantResolver::new(
                application.clone(),
                placement.clone(),
            )),
        );
        let adapter = generated::OwnerTransactionsMethodsTransactionAdapter::new(
            DatabaseActorStore::connect(&endpoint).await?,
            participant,
            coordinator,
            Starts,
            Handler(arg(6).into()),
        )
        .with_authorization(AuthorizationPolicy::new(
            Some(Arc::new(Verifier(arg(5).into()))),
            None,
        ));
        let watch = Arc::new(LegacyApplicationCoordinatorWatchEndpoint::new(
            application,
            placement.clone(),
            reference(),
        )?);
        let recovery = adapter.legacy_recovery_registration(
            LegacyRecoveryMetadata {
                participant: ParticipantRecovery {
                    shard_ids: vec!["s000000000".into()],
                    ..Default::default()
                },
                coordinator: CoordinatorRecovery {
                    shard_ids: vec!["s000000000".into()],
                    coordinator_state_ref: reference(),
                    ..Default::default()
                },
            },
            watch,
        )?;
        ApplicationHost::new(APP)
            .with_legacy_placement_readiness(placement)
            .with_host_recovery(recovery)
            .add_legacy_control_service(adapter.legacy_participant_control_service())
            .add_legacy_control_service(
                adapter.legacy_coordinator_control_service(TYPE, reference())?,
            )
            .add_public_service(
                proto::owner_transactions_methods_server::OwnerTransactionsMethodsServer::new(
                    adapter,
                ),
            )
            .serve_with_shutdown(address, async move {
                while !std::path::Path::new(&shutdown).exists() {
                    tokio::time::sleep(Duration::from_millis(5)).await;
                }
            })
            .await?;
    } else if command == "user-txn-exercise" {
        denial_matrix(&arg(2), &arg(4)).await?;
        let mut db =
            reboot::database_proto::database_client::DatabaseClient::connect(arg(5)).await?;
        let absent = db
            .load(reboot::database_proto::LoadRequest {
                actors: vec![reboot::database_proto::Actor {
                    state_type: TYPE.into(),
                    state_ref: reference(),
                    state: None,
                }],
                task_ids: vec![],
            })
            .await?
            .into_inner();
        // Canonical CXX Load omits missing keys (database.cc:2543-2553).
        assert!(absent.actors.is_empty(), "denied calls created actor state");
        assert!(absent.tasks.is_empty());
        let mut c = client(&arg(2), "owner").await?;
        assert_eq!(c.create(10).await?.value, 10);
        let present = db
            .load(reboot::database_proto::LoadRequest {
                actors: vec![reboot::database_proto::Actor {
                    state_type: TYPE.into(),
                    state_ref: reference(),
                    state: None,
                }],
                task_ids: vec![],
            })
            .await?
            .into_inner();
        assert_eq!(present.actors.len(), 1);
        assert_eq!(present.actors[0].state_type, TYPE);
        assert_eq!(present.actors[0].state_ref, reference());
        assert_eq!(
            <proto::OwnerTransactions as prost::Message>::decode(
                present.actors[0]
                    .state
                    .as_ref()
                    .ok_or("missing persisted state")?
                    .as_slice()
            )?
            .value,
            10
        );
        denial_matrix(&arg(2), &arg(4)).await?;
        assert_eq!(
            c.claims().await.unwrap_err().code(),
            tonic::Code::PermissionDenied
        );
        assert_eq!(c.inspect().await?.value, 10);
        let k = KEY.parse()?;
        assert_eq!(c.apply(5, false, k).await?.value, 15);
        assert_eq!(c.apply(5, false, k).await?.value, 15);
        assert_eq!(c.apply(3, false, uuid::Uuid::new_v4()).await?.value, 18);
        assert_eq!(
            c.apply(99, true, uuid::Uuid::new_v4())
                .await
                .unwrap_err()
                .code(),
            tonic::Code::InvalidArgument
        );
        assert_eq!(c.query().await?.value, 18);
        std::fs::write(arg(3), [])?;
        let before = std::fs::read(arg(4))?;
        assert_eq!(
            c.apply(5, false, k).await.unwrap_err().code(),
            tonic::Code::PermissionDenied
        );
        assert_eq!(std::fs::read(arg(4))?, before);
        println!("secured_transaction_before_restart=18");
    } else if command == "user-txn-restart" {
        let mut c = client(&arg(2), "owner").await?;
        let k = KEY.parse()?;
        let before = std::fs::read(arg(4))?;
        assert_eq!(
            c.apply(5, false, k).await.unwrap_err().code(),
            tonic::Code::PermissionDenied
        );
        assert_eq!(std::fs::read(arg(4))?, before);
        std::fs::remove_file(arg(3))?;
        assert_eq!(c.apply(5, false, k).await?.value, 15);
        assert_eq!(std::fs::read(arg(4))?, before);
        assert_eq!(c.query().await?.value, 18);
        assert_eq!(c.inspect().await?.value, 18);
        assert_eq!(
            c.claims().await.unwrap_err().code(),
            tonic::Code::PermissionDenied
        );
        println!("secured_transaction_recovered=18,replay=15");
    } else {
        return Err(format!("unknown transaction mode {command}").into());
    }
    Ok(())
}
