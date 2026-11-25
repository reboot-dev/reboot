//! Native acceptance: generated calls A -> B -> C and durable generated writers.
use super::*;
use std::sync::atomic::{AtomicU64, Ordering};
pub static QUERY_CALLS: AtomicU64 = AtomicU64::new(0);
fn actor(id: &str) -> String {
    reboot::state_ref::StateRef::from_id("reactive.v1.Counter", id)
        .unwrap()
        .to_string()
}
fn client(channel: tonic::transport::Channel, id: &str) -> generated::CounterMethodsExternalClient {
    generated::CounterMethodsExternalClient::new(channel, reboot::ExternalContext::new(actor(id)))
}
async fn blocked(stream: &mut reboot::reactive::TypedSubscription<proto::Value, tonic::Status>) {
    assert!(
        tokio::time::timeout(Duration::from_millis(150), stream.message())
            .await
            .is_err(),
        "unchanged dependency must remain pending"
    );
}
fn stats(path: &str) -> (usize, u64) {
    let text = std::fs::read_to_string(path).unwrap();
    let (active, calls) = text.split_once(' ').unwrap();
    (active.parse().unwrap(), calls.parse().unwrap())
}
async fn settled(path: &str, active: usize) -> u64 {
    tokio::time::timeout(Duration::from_secs(5), async {
        loop {
            let (n, c) = stats(path);
            if n == active {
                return c;
            }
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
    })
    .await
    .unwrap()
}
pub async fn run(command: &str) -> Result<(), Box<dyn std::error::Error>> {
    if command == "transitive-serve" {
        let store = DatabaseActorStore::connect(arg(2)).await?;
        let adapter = generated::CounterMethodsDatabaseAdapter::new(store, Counter)
            .with_authorization(reboot::auth::AuthorizationPolicy::new(
                None,
                Some(std::sync::Arc::new(RequireHost)),
            ));
        let mut registry = reboot::reactive::LocalReaderRegistry::new().with_reader_composition();
        for id in ["root", "branch", "leaf", "unrelated"] {
            let (_, service) = adapter.local_readers(&actor(id))?;
            registry.register(service)?;
        }
        let monitor = registry.clone();
        let drained = registry.clone();
        let adapter = adapter.with_reader_registry(registry.clone())?;
        ApplicationHost::new("reactive-app")
            .add_public_service(proto::counter_methods_server::CounterMethodsServer::new(
                adapter,
            ))
            .try_add_local_reader_registry(registry)?
            .serve_with_shutdown(arg(3).parse()?, async move {
                while !Path::new(&arg(4)).exists() {
                    let stats = std::path::PathBuf::from(arg(5));
                    let temporary = stats.with_extension("next");
                    std::fs::write(
                        &temporary,
                        format!(
                            "{} {}",
                            monitor.active_subscriptions(),
                            QUERY_CALLS.load(Ordering::SeqCst)
                        ),
                    )
                    .unwrap();
                    std::fs::rename(temporary, stats).unwrap();
                    tokio::time::sleep(Duration::from_millis(5)).await;
                }
            })
            .await?;
        assert_eq!(drained.active_subscriptions(), 0);
        return Ok(());
    }
    let channel = tonic::transport::Endpoint::from_shared(arg(2))?
        .connect()
        .await?;
    let mut root = client(channel.clone(), "root");
    let mut branch = client(channel.clone(), "branch");
    let mut leaf = client(channel.clone(), "leaf");
    let mut unrelated = client(channel.clone(), "unrelated");
    if command == "transitive-exercise" {
        for id in ["root", "branch", "leaf", "unrelated"] {
            client(channel.clone(), id).create(proto::Empty {}).await?;
        }
        root.select_next(proto::Select {
            next: actor("branch"),
        })
        .await?;
        branch
            .select_next(proto::Select {
                next: actor("leaf"),
            })
            .await?;
        leaf.increment(proto::Add {
            amount: 7,
            fail: false,
        })
        .await
        .map_err(|e| format!("increment failed: {e:?}"))?;
    }
    let mut reactive = generated::CounterMethodsReactiveClient::new(
        channel.clone(),
        reboot::ExternalContext::new(actor("root")),
    );
    let mut stream = reactive.query(proto::Empty {}).await?;
    let initial = value(&mut stream).await;
    if command == "transitive-restart" {
        assert_eq!(
            initial, 12,
            "reconnect must reconstruct dependencies from durable actor state"
        );
        leaf.increment(proto::Add {
            amount: 1,
            fail: false,
        })
        .await
        .map_err(|e| format!("increment failed: {e:?}"))?;
        assert_eq!(value(&mut stream).await, 13);
        stream.disconnect();
        settled(&arg(3), 0).await;
        println!("restart_rebuilt_dependencies=13");
        return Ok(());
    }
    assert_eq!(initial, 7);
    blocked(&mut stream).await;
    let before = settled(&arg(3), 1).await;
    unrelated
        .increment(proto::Add {
            amount: 99,
            fail: false,
        })
        .await
        .map_err(|e| format!("increment failed: {e:?}"))?;
    blocked(&mut stream).await;
    assert_eq!(
        settled(&arg(3), 1).await,
        before,
        "unrelated writer must not reevaluate root"
    );
    leaf.increment(proto::Add {
        amount: 1,
        fail: false,
    })
    .await
    .map_err(|e| format!("increment failed: {e:?}"))?;
    assert_eq!(value(&mut stream).await, 8);
    // A committed writer with unchanged output must not emit a new snapshot.
    leaf.increment(proto::Add {
        amount: 0,
        fail: false,
    })
    .await
    .map_err(|e| format!("increment failed: {e:?}"))?;
    blocked(&mut stream).await;
    // Retire the old transitive leaf and bind to the new selected actor.
    branch
        .select_next(proto::Select {
            next: actor("unrelated"),
        })
        .await?;
    assert_eq!(value(&mut stream).await, 99);
    blocked(&mut stream).await;
    let before = settled(&arg(3), 1).await;
    leaf.increment(proto::Add {
        amount: 4,
        fail: false,
    })
    .await
    .map_err(|e| format!("increment failed: {e:?}"))?;
    blocked(&mut stream).await;
    assert_eq!(
        settled(&arg(3), 1).await,
        before,
        "retired transitive dependency must not reevaluate"
    );
    branch
        .select_next(proto::Select {
            next: actor("leaf"),
        })
        .await?;
    assert_eq!(value(&mut stream).await, 12);
    // Transitive reader error closes the root stream and releases admission.
    leaf.increment(proto::Add {
        amount: -13,
        fail: false,
    })
    .await
    .map_err(|e| format!("increment failed: {e:?}"))?;
    assert_eq!(
        stream.message().await.unwrap_err().code(),
        tonic::Code::PermissionDenied
    );
    settled(&arg(3), 0).await;
    leaf.increment(proto::Add {
        amount: 13,
        fail: false,
    })
    .await
    .map_err(|e| format!("increment failed: {e:?}"))?;
    let mut stream = reactive.query(proto::Empty {}).await?;
    assert_eq!(value(&mut stream).await, 12);
    blocked(&mut stream).await;
    stream.disconnect();
    settled(&arg(3), 0).await;
    // A -> B -> C -> B is rejected instead of blocking actor admission.
    leaf.select_next(proto::Select {
        next: actor("branch"),
    })
    .await?;
    let mut cycle = reactive.query(proto::Empty {}).await?;
    assert_eq!(
        cycle.message().await.unwrap_err().code(),
        tonic::Code::FailedPrecondition
    );
    settled(&arg(3), 0).await;
    leaf.select_next(proto::Select {
        next: String::new(),
    })
    .await?;
    assert_eq!(root.query(proto::Empty {}).await?.into_inner().value, 12);
    println!("transitive_native=unchanged,relevant,unrelated,retired,error,cancel,cycle,unary");
    Ok(())
}
