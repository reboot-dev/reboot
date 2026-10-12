// Compiled downstream generated-adapter regression source. This deliberately
// uses the existing fresh response-only SharedLocalTransactionContext seam and
// injected sidecars. It is not a Bank/account-writer or native Database proof.
use super::*;

tokio::task_local! {
    pub(super) static PROBE: Arc<SharedRootProbe>;
}

pub(super) struct SharedRootProbe {
    entered: tokio::sync::mpsc::UnboundedSender<i64>,
    releases: std::sync::Mutex<std::collections::BTreeMap<i64, tokio::sync::oneshot::Receiver<()>>>,
    dropped: Arc<std::sync::Mutex<Vec<i64>>>,
}

impl SharedRootProbe {
    pub(super) async fn park(&self, key: i64) {
        struct BodyDrop {
            key: i64,
            dropped: Arc<std::sync::Mutex<Vec<i64>>>,
        }
        impl Drop for BodyDrop {
            fn drop(&mut self) {
                self.dropped.lock().unwrap().push(self.key);
            }
        }
        let release = self
            .releases
            .lock()
            .unwrap()
            .remove(&key)
            .expect("one generated handler per probe key");
        let _drop = BodyDrop {
            key,
            dropped: self.dropped.clone(),
        };
        self.entered.send(key).unwrap();
        release.await.expect("test controls exact body release");
    }
}

struct FreshSharedRoots {
    minted: Arc<std::sync::Mutex<Vec<Uuid>>>,
}
impl reboot::runtime::RootTransactionStartFactory for FreshSharedRoots {
    fn next_root_transaction(
        &self,
    ) -> Result<reboot::runtime::RootTransactionStart, tonic::Status> {
        let root = Uuid::new_v4();
        self.minted.lock().unwrap().push(root);
        Ok(reboot::runtime::RootTransactionStart {
            transaction_id: root,
            timestamp: prost_types::Timestamp::default(),
        })
    }
}
impl reboot::runtime::InboundTransactionStartFactory for FreshSharedRoots {
    fn next_inbound_transaction(
        &self,
        _: &reboot::runtime::InboundTransactionContext,
    ) -> Result<Uuid, tonic::Status> {
        panic!("fresh shared proof must not silently become an inbound/child test")
    }
}

type SharedAdapter = transaction_generated::TransactionCounterWritesMethodsTransactionAdapter<
    TransactionCounter,
    TransactionParticipantSidecar,
    TransactionCoordinatorSidecar,
    reboot::durable_coordinator::SingleParticipantResolver<TransactionParticipantSidecar>,
    FreshSharedRoots,
>;

fn adapter(
    trace: Arc<std::sync::Mutex<Vec<&'static str>>>,
    minted: Arc<std::sync::Mutex<Vec<Uuid>>>,
) -> SharedAdapter {
    adapter_with_probe(trace, minted, None)
}

fn adapter_with_probe(
    trace: Arc<std::sync::Mutex<Vec<&'static str>>>,
    minted: Arc<std::sync::Mutex<Vec<Uuid>>>,
    fresh_shared_probe: Option<Arc<SharedRootProbe>>,
) -> SharedAdapter {
    let participant = reboot::durable_participant::DurableActorParticipant::new(
        Arc::new(TransactionParticipantSidecar {
            trace: trace.clone(),
            state: Some(proto::TransactionCounter { value: 4 }),
            staged_states: Arc::new(std::sync::Mutex::new(Vec::new())),
            idempotent_recovery: Arc::new(std::sync::Mutex::new(VecDeque::new())),
        }),
        "tests.reboot.protoc.TransactionCounter",
        "transaction-counter",
    );
    let coordinator = reboot::durable_coordinator::DurableRootCoordinator::new(
        Arc::new(TransactionCoordinatorSidecar {
            trace: trace.clone(),
        }),
        Arc::new(
            reboot::durable_coordinator::SingleParticipantResolver::new(
                reboot::durable_coordinator::ParticipantTarget {
                    state_type: "tests.reboot.protoc.TransactionCounter".into(),
                    state_ref: "transaction-counter".into(),
                },
                reboot::durable_participant::DurableActorParticipantHost::new(participant.clone()),
            )
            .unwrap(),
        ),
    );
    // Separate identity from the older downstream fixture's process-global gate.
    // No network IO uses this injected sidecar's nominal endpoint.
    static ENDPOINT: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(34000);
    let port = ENDPOINT.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
    SharedAdapter::new(
        DatabaseActorStore::connect_lazy(format!("http://127.0.0.1:{port}")).unwrap(),
        participant,
        coordinator,
        FreshSharedRoots { minted },
        TransactionCounter {
            fresh_shared_probe,
            trace,
            fail: false,
            downstream: None,
            final_state_override: None,
        },
    )
    .with_authorization(reboot::auth::AuthorizationPolicy::permissive_for_development())
}

fn request(amount: i64) -> tonic::Request<proto::TransactionIncrementRequest> {
    let mut request = tonic::Request::new(proto::TransactionIncrementRequest { amount });
    *request.metadata_mut() = reboot::RebootHeaders::new("transaction-counter")
        .to_metadata()
        .unwrap();
    request
}

type ResponseFuture<'a> = Pin<
    Box<
        dyn Future<Output = Result<tonic::Response<proto::TransactionCounterValue>, tonic::Status>>
            + Send
            + 'a,
    >,
>;
fn shared<'a>(
    adapter: &'a SharedAdapter,
    probe: Arc<SharedRootProbe>,
    key: i64,
) -> ResponseFuture<'a> {
    Box::pin(PROBE.scope(probe, async move {
        proto::transaction_counter_writes_methods_server::TransactionCounterWritesMethods::shared_read(adapter, request(key)).await
    }))
}
fn exclusive(adapter: &SharedAdapter) -> ResponseFuture<'_> {
    Box::pin(async move {
        proto::transaction_counter_writes_methods_server::TransactionCounterWritesMethods::increment(adapter, request(1)).await
    })
}
async fn pending(future: &mut ResponseFuture<'_>) {
    std::future::poll_fn(|cx| {
        assert!(
            future.as_mut().poll(cx).is_pending(),
            "must park the actual generated body/admission future"
        );
        std::task::Poll::Ready(())
    })
    .await;
}
fn probe(
    keys: &[i64],
) -> (
    Arc<SharedRootProbe>,
    tokio::sync::mpsc::UnboundedReceiver<i64>,
    std::collections::BTreeMap<i64, tokio::sync::oneshot::Sender<()>>,
) {
    let (entered, receiver) = tokio::sync::mpsc::unbounded_channel();
    let mut releases = std::collections::BTreeMap::new();
    let mut senders = std::collections::BTreeMap::new();
    for key in keys {
        let (sender, release) = tokio::sync::oneshot::channel();
        releases.insert(*key, release);
        senders.insert(*key, sender);
    }
    (
        Arc::new(SharedRootProbe {
            entered,
            releases: std::sync::Mutex::new(releases),
            dropped: Arc::new(std::sync::Mutex::new(Vec::new())),
        }),
        receiver,
        senders,
    )
}

#[tokio::test]
async fn generated_fresh_shared_slots_two_same_actor_bodies_overlap_and_writer_waits_for_both() {
    let trace = Arc::new(std::sync::Mutex::new(Vec::new()));
    let minted = Arc::new(std::sync::Mutex::new(Vec::new()));
    let adapter = adapter(trace.clone(), minted.clone());
    let (probe, mut entered, mut releases) = probe(&[1, 2]);
    let mut first = shared(&adapter, probe.clone(), 1);
    let mut second = shared(&adapter, probe, 2);
    pending(&mut first).await;
    assert_eq!(entered.try_recv().unwrap(), 1);
    pending(&mut second).await;
    assert_eq!(entered.try_recv().unwrap(), 2);
    let roots = minted.lock().unwrap().clone();
    assert_eq!(roots.len(), 2);
    assert_ne!(
        roots[0], roots[1],
        "the old fixed-root test allocator is not a concurrency proof"
    );
    assert_eq!(
        *trace.lock().unwrap(),
        [
            "participant load",
            "fresh shared handler",
            "participant load",
            "fresh shared handler"
        ]
    );
    let mut writer = exclusive(&adapter);
    pending(&mut writer).await;
    releases.remove(&1).unwrap().send(()).unwrap();
    assert_eq!(first.await.unwrap().into_inner().value, 4);
    pending(&mut writer).await;
    assert_eq!(
        trace.lock().unwrap().len(),
        4,
        "one completed no-op must not release the other's shared lease"
    );
    releases.remove(&2).unwrap().send(()).unwrap();
    assert_eq!(second.await.unwrap().into_inner().value, 4);
    assert_eq!(
        tokio::time::timeout(std::time::Duration::from_secs(1), writer)
            .await
            .unwrap()
            .unwrap()
            .into_inner()
            .value,
        5
    );
    assert_eq!(
        trace
            .lock()
            .unwrap()
            .iter()
            .filter(|event| **event == "participant prepare")
            .count(),
        1,
        "only the eventual exclusive writer creates a durable participant"
    );
}

#[tokio::test]
async fn generated_fresh_shared_slots_cancelled_body_futures_drain_exact_ownership() {
    let trace = Arc::new(std::sync::Mutex::new(Vec::new()));
    let adapter = adapter(trace.clone(), Arc::new(std::sync::Mutex::new(Vec::new())));
    let (probe, mut entered, _releases) = probe(&[1, 2]);
    let mut first = shared(&adapter, probe.clone(), 1);
    let mut second = shared(&adapter, probe.clone(), 2);
    pending(&mut first).await;
    pending(&mut second).await;
    assert_eq!(entered.try_recv().unwrap(), 1);
    assert_eq!(entered.try_recv().unwrap(), 2);
    let mut writer = exclusive(&adapter);
    pending(&mut writer).await;
    drop(first); // actual generated future Drop, not mocked registry cleanup
    pending(&mut writer).await;
    assert_eq!(*probe.dropped.lock().unwrap(), [1]);
    drop(second);
    assert_eq!(*probe.dropped.lock().unwrap(), [1, 2]);
    assert_eq!(
        tokio::time::timeout(std::time::Duration::from_secs(1), writer)
            .await
            .unwrap()
            .unwrap()
            .into_inner()
            .value,
        5
    );
    assert!(
        !trace.lock().unwrap().contains(&"participant abort"),
        "undurable response-only root cancellation never fabricates a native Abort"
    );
}

#[tokio::test]
async fn generated_fresh_shared_slots_capacity_denies_before_the_extra_body() {
    let trace = Arc::new(std::sync::Mutex::new(Vec::new()));
    let adapter = adapter(trace.clone(), Arc::new(std::sync::Mutex::new(Vec::new())));
    let capacity = reboot::durable_participant::MAX_PENDING_ROOTS_PER_ACTOR;
    let keys: Vec<i64> = (1..=capacity as i64 + 1).collect();
    let (probe, mut entered, _releases) = probe(&keys);
    let mut futures = Vec::new();
    for key in keys.iter().take(capacity) {
        let mut future = shared(&adapter, probe.clone(), *key);
        pending(&mut future).await;
        assert_eq!(entered.try_recv().unwrap(), *key);
        futures.push(future);
    }
    let error = shared(&adapter, probe.clone(), keys[capacity])
        .await
        .unwrap_err();
    assert_eq!(error.code(), tonic::Code::ResourceExhausted);
    assert!(entered.try_recv().is_err());
    assert_eq!(
        trace
            .lock()
            .unwrap()
            .iter()
            .filter(|event| **event == "fresh shared handler")
            .count(),
        capacity
    );
    assert_eq!(
        trace
            .lock()
            .unwrap()
            .iter()
            .filter(|event| **event == "participant load")
            .count(),
        capacity
    );
    drop(futures);
    assert_eq!(probe.dropped.lock().unwrap().len(), capacity);
    assert_eq!(
        tokio::time::timeout(std::time::Duration::from_secs(1), exclusive(&adapter))
            .await
            .unwrap()
            .unwrap()
            .into_inner()
            .value,
        5
    );
}

async fn wire_server(
    adapter: SharedAdapter,
) -> (
    proto::transaction_counter_writes_methods_client::TransactionCounterWritesMethodsClient<
        tonic::transport::Channel,
    >,
    tokio::task::JoinHandle<()>,
) {
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    let server = tokio::spawn(async move {
        tonic::transport::Server::builder()
            .add_service(proto::transaction_counter_writes_methods_server::TransactionCounterWritesMethodsServer::new(adapter))
            .serve_with_incoming(tokio_stream::wrappers::TcpListenerStream::new(listener)).await.unwrap();
    });
    let client = proto::transaction_counter_writes_methods_client::TransactionCounterWritesMethodsClient::connect(format!("http://{address}")).await.unwrap();
    (client, server)
}

async fn wire_entered(entered: &mut tokio::sync::mpsc::UnboundedReceiver<i64>, expected: i64) {
    assert_eq!(
        tokio::time::timeout(std::time::Duration::from_secs(2), entered.recv())
            .await
            .expect("actual generated Tonic body did not enter")
            .unwrap(),
        expected
    );
}

async fn wire_writer_admitted(minted: &Arc<std::sync::Mutex<Vec<Uuid>>>) {
    tokio::time::timeout(std::time::Duration::from_secs(2), async {
        while minted.lock().unwrap().len() != 3 {
            tokio::task::yield_now().await;
        }
    })
    .await
    .expect("wire writer never reached actual root allocation/admission");
}

#[tokio::test]
async fn generated_fresh_shared_slots_real_tonic_two_parked_bodies_exclude_writer_until_both_return()
 {
    let trace = Arc::new(std::sync::Mutex::new(Vec::new()));
    let minted = Arc::new(std::sync::Mutex::new(Vec::new()));
    let (probe, mut entered, mut releases) = probe(&[1, 2]);
    let (client, server) = wire_server(adapter_with_probe(
        trace.clone(),
        minted.clone(),
        Some(probe),
    ))
    .await;
    let mut first_client = client.clone();
    let first = tokio::spawn(async move { first_client.shared_read(request(1)).await });
    wire_entered(&mut entered, 1).await;
    let mut second_client = client.clone();
    let second = tokio::spawn(async move { second_client.shared_read(request(2)).await });
    wire_entered(&mut entered, 2).await;
    let mut writer_client = client;
    let mut writer = tokio::spawn(async move { writer_client.increment(request(1)).await });
    wire_writer_admitted(&minted).await;
    assert!(
        tokio::time::timeout(std::time::Duration::from_millis(30), &mut writer)
            .await
            .is_err()
    );
    releases.remove(&1).unwrap().send(()).unwrap();
    assert_eq!(first.await.unwrap().unwrap().into_inner().value, 4);
    assert!(
        tokio::time::timeout(std::time::Duration::from_millis(30), &mut writer)
            .await
            .is_err(),
        "wire writer entered after only one shared body finished"
    );
    releases.remove(&2).unwrap().send(()).unwrap();
    assert_eq!(second.await.unwrap().unwrap().into_inner().value, 4);
    assert_eq!(
        tokio::time::timeout(std::time::Duration::from_secs(2), writer)
            .await
            .unwrap()
            .unwrap()
            .unwrap()
            .into_inner()
            .value,
        5
    );
    assert_eq!(
        trace
            .lock()
            .unwrap()
            .iter()
            .filter(|event| **event == "participant prepare")
            .count(),
        1
    );
    assert_eq!(
        trace
            .lock()
            .unwrap()
            .iter()
            .filter(|event| **event == "participant commit")
            .count(),
        1
    );
    assert!(!trace.lock().unwrap().contains(&"participant abort"));
    server.abort();
    let _ = server.await;
}

#[tokio::test]
async fn generated_fresh_shared_slots_real_tonic_client_cancellation_drops_exact_server_bodies() {
    let trace = Arc::new(std::sync::Mutex::new(Vec::new()));
    let minted = Arc::new(std::sync::Mutex::new(Vec::new()));
    let (probe, mut entered, _releases) = probe(&[1, 2]);
    let (client, server) = wire_server(adapter_with_probe(
        trace.clone(),
        minted.clone(),
        Some(probe.clone()),
    ))
    .await;
    let mut first_client = client.clone();
    let first = tokio::spawn(async move { first_client.shared_read(request(1)).await });
    wire_entered(&mut entered, 1).await;
    let mut second_client = client.clone();
    let second = tokio::spawn(async move { second_client.shared_read(request(2)).await });
    wire_entered(&mut entered, 2).await;
    let mut writer_client = client;
    let mut writer = tokio::spawn(async move { writer_client.increment(request(1)).await });
    wire_writer_admitted(&minted).await;
    first.abort();
    assert!(first.await.unwrap_err().is_cancelled());
    tokio::time::timeout(std::time::Duration::from_secs(2), async {
        while !probe.dropped.lock().unwrap().contains(&1) {
            tokio::task::yield_now().await;
        }
    })
    .await
    .expect("client cancellation did not drop first actual generated server body");
    assert!(!probe.dropped.lock().unwrap().contains(&2));
    assert!(
        tokio::time::timeout(std::time::Duration::from_millis(30), &mut writer)
            .await
            .is_err()
    );
    second.abort();
    assert!(second.await.unwrap_err().is_cancelled());
    tokio::time::timeout(std::time::Duration::from_secs(2), async {
        while !probe.dropped.lock().unwrap().contains(&2) {
            tokio::task::yield_now().await;
        }
    })
    .await
    .expect("client cancellation did not drop second actual generated server body");
    assert_eq!(
        tokio::time::timeout(std::time::Duration::from_secs(2), writer)
            .await
            .unwrap()
            .unwrap()
            .unwrap()
            .into_inner()
            .value,
        5
    );
    assert!(
        !trace.lock().unwrap().contains(&"participant abort"),
        "undurable cancellation must not invent a native decision"
    );
    server.abort();
    let _ = server.await;
}
