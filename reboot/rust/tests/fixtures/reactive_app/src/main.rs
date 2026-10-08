use prost::Message;
use reboot::{
    application_host::ApplicationHost, database_proto as db, runtime::DatabaseActorStore,
};
use std::{path::Path, time::Duration};
pub mod proto {
    tonic::include_proto!("reactive.v1");
}
pub mod generated {
    include!(concat!(env!("OUT_DIR"), "/reactive/v1/counter.reboot.rs"));
}
struct Counter;
struct RequireHost;
impl reboot::auth::Authorizer for RequireHost {
    fn authorize<'a>(
        &'a self,
        context: &'a reboot::auth::AuthorizationContext,
        _: Option<&'a reboot::auth::Auth>,
        _: Option<&'a [u8]>,
        _: &'a [u8],
    ) -> reboot::auth::AuthorizeFuture<'a> {
        Box::pin(async move {
            if context.headers.application_id.as_deref() == Some("reactive-app") {
                reboot::auth::AuthorizationDecision::Allow
            } else {
                reboot::auth::AuthorizationDecision::PermissionDenied {
                    message: "missing trusted host identity".into(),
                }
            }
        })
    }
}

#[tonic::async_trait]
impl generated::CounterMethodsDatabaseHandler for Counter {
    async fn create(
        &self,
        _: &mut proto::Counter,
        _: proto::Empty,
    ) -> Result<proto::Empty, tonic::Status> {
        Ok(proto::Empty {})
    }
    async fn increment(
        &self,
        state: &mut proto::Counter,
        request: proto::Add,
    ) -> Result<proto::Value, generated::CounterMethodsIncrementError> {
        state.value += request.amount;
        if request.fail {
            return Err(generated::CounterMethodsIncrementError::Refused(
                proto::Refused { value: state.value },
            ));
        }
        Ok(proto::Value {
            value: state.value,
            padding: vec![],
        })
    }
    async fn query(
        &self,
        state: &proto::Counter,
        _: proto::Empty,
    ) -> Result<proto::Value, tonic::Status> {
        Ok(proto::Value {
            value: state.value,
            padding: vec![7; 65536],
        })
    }
    async fn refuse(
        &self,
        state: &proto::Counter,
        _: proto::Empty,
    ) -> Result<proto::Value, generated::CounterMethodsRefuseError> {
        Err(generated::CounterMethodsRefuseError::Refused(
            proto::Refused { value: state.value },
        ))
    }
}
fn reference() -> String {
    reboot::state_ref::StateRef::from_id("reactive.v1.Counter", "counter")
        .unwrap()
        .to_string()
}
fn arg(n: usize) -> String {
    std::env::args().nth(n).unwrap()
}
fn context(_: &str) -> reboot::ExternalContext {
    reboot::ExternalContext::new(reference())
}
async fn value(s: &mut reboot::reactive::TypedSubscription<proto::Value, tonic::Status>) -> i64 {
    tokio::time::timeout(Duration::from_secs(5), s.message())
        .await
        .unwrap()
        .unwrap()
        .unwrap()
        .value
}
#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    match arg(1).as_str() {
        "info" => {
            std::fs::write(
                arg(2),
                db::ServerInfo {
                    shard_infos: vec![db::ShardInfo {
                        shard_id: "s000000000".into(),
                        shard_first_key: vec![],
                    }],
                }
                .encode_to_vec(),
            )?;
        }
        "serve" => {
            let store = DatabaseActorStore::connect(arg(2)).await?;
            let adapter = generated::CounterMethodsDatabaseAdapter::new(store, Counter)
                .with_authorization(reboot::auth::AuthorizationPolicy::new(
                    None,
                    Some(std::sync::Arc::new(RequireHost)),
                ));
            let (owner, service) = adapter.local_readers(&reference())?;
            let monitor = owner.clone();
            ApplicationHost::new("reactive-app")
                .with_host_recovery(owner.clone())
                .add_public_service(proto::counter_methods_server::CounterMethodsServer::new(
                    adapter,
                ))
                .try_add_local_readers(service)?
                .serve_with_shutdown(arg(3).parse()?, async move {
                    while !Path::new(&arg(4)).exists() {
                        std::fs::write(arg(5), monitor.active_subscriptions().to_string()).unwrap();
                        tokio::time::sleep(Duration::from_millis(10)).await;
                    }
                })
                .await?;
            assert_eq!(
                owner.active_subscriptions(),
                0,
                "host drain must reclaim readers"
            );
        }
        "read" => {
            let channel = tonic::transport::Endpoint::from_shared(arg(2))?
                .connect()
                .await?;
            let mut client =
                generated::CounterMethodsExternalClient::new(channel, context(&arg(2)));
            println!(
                "{}",
                client.query(proto::Empty {}).await?.into_inner().value
            );
        }
        "exercise" => {
            let endpoint = arg(2);
            let channel = tonic::transport::Endpoint::from_shared(endpoint.clone())?
                .connect()
                .await?;
            let mut client =
                generated::CounterMethodsExternalClient::new(channel.clone(), context(&endpoint));
            client.create(proto::Empty {}).await?;
            let mut reactive =
                generated::CounterMethodsReactiveClient::new(channel.clone(), context(&endpoint));
            let mut stream = reactive.query(proto::Empty {}).await?;
            assert_eq!(value(&mut stream).await, 0);
            for n in 1..=2 {
                assert_eq!(
                    client
                        .increment(proto::Add {
                            amount: 1,
                            fail: false
                        })
                        .await
                        .unwrap()
                        .into_inner()
                        .value,
                    n
                );
                assert_eq!(value(&mut stream).await, n);
            }
            assert!(matches!(
                client
                    .increment(proto::Add {
                        amount: 999,
                        fail: true
                    })
                    .await,
                Err(generated::CounterMethodsIncrementError::Refused(_))
            ));
            assert!(
                tokio::time::timeout(Duration::from_millis(150), stream.message())
                    .await
                    .is_err(),
                "failed writer must not emit"
            );
            assert_eq!(client.query(proto::Empty {}).await?.into_inner().value, 2);
            let mut refused = reactive.refuse(proto::Empty {}).await.unwrap();
            assert!(matches!(
                refused.message().await,
                Err(generated::CounterMethodsRefuseError::Refused(
                    proto::Refused { value: 2 }
                ))
            ));
            // A slow consumer with 64KiB snapshots cannot impede durable writers.
            for _ in 0..100 {
                tokio::time::timeout(
                    Duration::from_secs(2),
                    client.increment(proto::Add {
                        amount: 1,
                        fail: false,
                    }),
                )
                .await
                .unwrap()
                .unwrap();
            }
            loop {
                if value(&mut stream).await == 102 {
                    break;
                }
            }
            drop(stream);
            drop(refused);
            let deadline = tokio::time::Instant::now() + Duration::from_secs(5);
            while std::fs::read_to_string(arg(3))?.trim() != "0" {
                assert!(tokio::time::Instant::now() < deadline);
                tokio::time::sleep(Duration::from_millis(10)).await;
            }
            assert_eq!(
                client
                    .increment(proto::Add {
                        amount: 1,
                        fail: false
                    })
                    .await
                    .unwrap()
                    .into_inner()
                    .value,
                103
            );
            // A new baseline follows persisted committed state, not an in-memory seed.
            let mut shutdown_stream = reactive.query(proto::Empty {}).await?;
            assert_eq!(value(&mut shutdown_stream).await, 103);
            std::fs::write(arg(4), "ready")?;
            assert!(
                tokio::time::timeout(Duration::from_secs(15), shutdown_stream.message())
                    .await
                    .unwrap()?
                    .is_none()
            );
            println!(
                "initial=0 live=1,2 failed_writer=quiet burst=102 drop_reclaimed=true exclusive_after_drop=103 shutdown=closed"
            );
        }
        "restart" => {
            let endpoint = arg(2);
            let channel = tonic::transport::Endpoint::from_shared(endpoint.clone())?
                .connect()
                .await?;
            let mut reactive =
                generated::CounterMethodsReactiveClient::new(channel, context(&endpoint));
            let mut stream = reactive.query(proto::Empty {}).await?;
            assert_eq!(value(&mut stream).await, 103);
            println!("restart_subscription=103");
        }
        _ => panic!("unknown mode"),
    }
    Ok(())
}
