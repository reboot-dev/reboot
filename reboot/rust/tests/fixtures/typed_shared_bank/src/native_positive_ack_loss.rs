//! SOURCE-ONLY upgraded-native ACK-loss candidate. No native acceptance.
//! Include as a CHILD of native_positive in a NEW parent snapshot.
//! Real canonical success is held by the existing observer; real TCP teardown
//! prevents that success reaching the SDK. No fabricated Status/ACK/first token.
use super::*;
use reboot::application_host::{ApplicationHostError, HostRecovery, RecoveryCancellation};

struct ObserveRecovery {
    recovery: reboot::one_shot_tasks::OneShotTaskRecovery,
    started: Mutex<Option<tokio::sync::oneshot::Sender<RecoveryCancellation>>>,
}
#[tonic::async_trait]
impl HostRecovery for ObserveRecovery {
    async fn start(
        &self,
        supervisor: &mut tokio::task::JoinSet<Result<(), tonic::Status>>,
        cancel: RecoveryCancellation,
    ) -> Result<(), tonic::Status> {
        self.recovery.start(supervisor, cancel.clone()).await?;
        self.started
            .lock()
            .unwrap()
            .take()
            .unwrap()
            .send(cancel)
            .unwrap();
        Ok(())
    }
}

// Own every accepted socket pair in one JoinSet. A cut closes admission FIRST,
// then aborts and joins every copy future, destroying both socket halves. This
// is actual disconnect, not gRPC status injection or cancelling a public client.
async fn transport_relay(
    backend: String,
) -> (
    String,
    tokio::sync::oneshot::Sender<()>,
    tokio::task::JoinHandle<()>,
) {
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let endpoint = format!("http://{}", listener.local_addr().unwrap());
    let address = backend.strip_prefix("http://").unwrap().to_owned();
    let (cut, mut cut_rx) = tokio::sync::oneshot::channel();
    let relay = tokio::spawn(async move {
        let mut copies = tokio::task::JoinSet::new();
        loop {
            tokio::select! {
                biased;
                _ = &mut cut_rx => break,
                accepted = listener.accept() => {
                    let (mut downstream, _) = accepted.unwrap();
                    let address = address.clone();
                    copies.spawn(async move {
                        let mut upstream = tokio::net::TcpStream::connect(address).await.unwrap();
                        // Actual network errors/EOF are transport facts; no bytes
                        // are interpreted, altered, synthesized or selectively ACKed.
                        let _ = tokio::io::copy_bidirectional(&mut downstream, &mut upstream).await;
                    });
                },
                joined = copies.join_next(), if !copies.is_empty() => { joined.unwrap().unwrap(); },
            }
        }
        drop(listener);
        copies.abort_all();
        while let Some(joined) = copies.join_next().await {
            if let Err(error) = joined {
                assert!(error.is_cancelled(), "relay panicked: {error}");
            }
        }
    });
    (endpoint, cut, relay)
}

struct FaultHosted {
    endpoint: String,
    store: DatabaseActorStore,
    tasks: reboot::one_shot_tasks::OneShotTasks,
    observations: Arc<Observations>,
    stop: Option<tokio::sync::oneshot::Sender<()>>,
    server: tokio::task::JoinHandle<Result<(), ApplicationHostError>>,
    proxy_stop: Option<tokio::sync::oneshot::Sender<()>>,
    proxy_server: tokio::task::JoinHandle<Result<(), tonic::transport::Error>>,
    cut: Option<tokio::sync::oneshot::Sender<()>>,
    relay: tokio::task::JoinHandle<()>,
    cancel: RecoveryCancellation,
}
// Failed attempts cannot detach the three top-level tasks on ordinary panic.
// Abortion is NOT a successful async join; parent must teardown failed processes.
impl Drop for FaultHosted {
    fn drop(&mut self) {
        self.server.abort();
        self.proxy_server.abort();
        self.relay.abort();
    }
}
impl FaultHosted {
    async fn start(
        canonical: &str,
        logical_id: &str,
        observations: Arc<Observations>,
        constructed: bool,
    ) -> Self {
        use reboot::placement_proto as p;
        let reference = reference(logical_id);
        let proxy = ObservedDatabase {
            client: bounded(db::database_client::DatabaseClient::connect(
                canonical.to_owned(),
            ))
            .await
            .unwrap(),
            observations: observations.clone(),
        };
        let proxy_listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let proxy_endpoint = format!("http://{}", proxy_listener.local_addr().unwrap());
        let (proxy_stop, proxy_stopped) = tokio::sync::oneshot::channel();
        let proxy_server = tokio::spawn(async move {
            tonic::transport::Server::builder()
                .add_service(db::database_server::DatabaseServer::new(proxy))
                .serve_with_incoming_shutdown(
                    tokio_stream::wrappers::TcpListenerStream::new(proxy_listener),
                    async {
                        let _ = proxy_stopped.await;
                    },
                )
                .await
        });
        // Raw byte relay is the ONLY fault boundary; canonical client lives behind it.
        let (fault_endpoint, cut, relay) = transport_relay(proxy_endpoint).await;
        let store = bounded(DatabaseActorStore::connect(&fault_endpoint))
            .await
            .unwrap();
        let (adapter, tasks) = g::AccountMethodsDatabaseAdapter::new(
            store.clone(),
            OriginalAccount {
                observations: observations.clone(),
                logical_id: logical_id.into(),
            },
        )
        .with_authorization(reboot::auth::AuthorizationPolicy::permissive_for_development())
        .with_one_shot_writer_tasks(&reference)
        .unwrap();
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = listener.local_addr().unwrap().port();
        let endpoint = format!("http://127.0.0.1:{port}");
        let placement = reboot::legacy_placement::PlanOnlyLegacyPlacement::new();
        placement
            .install(p::ListenForPlanResponse {
                plan: Some(p::Plan {
                    version: 1,
                    applications: vec![p::plan::Application {
                        id: APP.into(),
                        services: vec![
                            p::plan::application::Service {
                                full_name: "bank.v1.AccountMethods".into(),
                                state_type_full_name: TYPE.into(),
                            },
                            p::plan::application::Service {
                                full_name: "rbt.v1alpha1.Tasks".into(),
                                state_type_full_name: String::new(),
                            },
                        ],
                        shards: vec![p::plan::application::Shard {
                            id: "s000000000".into(),
                            range: Some(p::plan::application::shard::KeyRange {
                                first_key: vec![],
                            }),
                            server_id: SERVER.into(),
                            replica_index: 0,
                        }],
                    }],
                }),
                servers: vec![p::Server {
                    id: SERVER.into(),
                    application_id: APP.into(),
                    address: Some(p::server::Address {
                        host: "127.0.0.1".into(),
                        port: port.into(),
                    }),
                    ..Default::default()
                }],
            })
            .unwrap();
        let wait = tasks.wait_service_with_policy(
            reboot::legacy_placement::LegacyApplicationId::new(APP).unwrap(),
            SERVER,
            placement.clone(),
            reboot::auth::AuthorizationPolicy::permissive_for_development(),
        );
        let (started_tx, started_rx) = tokio::sync::oneshot::channel();
        let host = ApplicationHost::new(APP)
            .with_legacy_placement_readiness(placement)
            .with_host_recovery(ObserveRecovery {
                recovery: tasks.recovery(recovery_request()),
                started: Mutex::new(Some(started_tx)),
            })
            .add_public_service(b::account_methods_server::AccountMethodsServer::new(
                adapter,
            ))
            .add_public_service(wait);
        let (stop, stopped) = tokio::sync::oneshot::channel();
        let server = tokio::spawn(host.serve_with_listener_shutdown(listener, async {
            let _ = stopped.await;
        }));
        let mut client = bounded(b::account_methods_client::AccountMethodsClient::connect(
            endpoint.clone(),
        ))
        .await
        .unwrap();
        bounded(async { loop {
            match client.balance(request(&reference, b::BalanceRequest {}, None)).await {
                Ok(reply) if constructed => { assert_eq!(reply.into_inner().balance, 0); break; },
                Err(e) if !constructed && e.code() == tonic::Code::FailedPrecondition && e.message() == "actor state must be constructed before this method can be called" => break,
                Err(e) if e.code() == tonic::Code::Unavailable => tokio::time::sleep(Duration::from_millis(10)).await,
                other => panic!("public readiness without private seeding: {other:?}"),
            }
        }}).await;
        let cancel = bounded(started_rx).await.unwrap();
        Self {
            cut: Some(cut),
            relay,
            cancel,
            endpoint,
            store,
            tasks,
            observations,
            stop: Some(stop),
            server,
            proxy_stop: Some(proxy_stop),
            proxy_server,
        }
    }
}

fn no_effect(observations: &Observations) {
    assert_eq!(observations.welcomes.load(Ordering::SeqCst), 0);
    assert!(observations.bodies.lock().unwrap().is_empty());
    assert!(observations.completions.lock().unwrap().is_empty());
    let calls = observations.calls.lock().unwrap();
    assert!(!calls.contains(&"CompleteTask"));
    assert!(!calls.contains(&"Store"));
    assert!(!calls.contains(&"CreateActor"));
    assert!(!calls.iter().any(|name| name.starts_with("Transaction")));
}
fn retained(tasks: &reboot::one_shot_tasks::OneShotTasks) {
    let status = tasks.constructor_uncertainty_status();
    assert_eq!(status.process_limit, 64);
    assert_eq!(
        status.process_reserved, 1,
        "exact isolated process must retain one actual global64 permit"
    );
    assert!(
        status.actor_sealed && status.actor_retained,
        "original registry lifecycle must retain uncertainty: {status:?}"
    );
}
async fn held(store: &DatabaseActorStore, actor_ref: &str) {
    let gate = store.actor_gate(TYPE, actor_ref);
    // Only a reader probe, never queue our own writer to manufacture exclusion.
    assert!(
        tokio::time::timeout(Duration::from_millis(100), gate.shared())
            .await
            .is_err(),
        "original real constructor ActorGate released despite missing native ACK"
    );
}

struct AbortOpen(tokio::task::AbortHandle);
impl Drop for AbortOpen {
    fn drop(&mut self) {
        self.0.abort();
    }
}

async fn cold_refused(host: &FaultHosted, logical_id: &str) {
    let before_calls = host.observations.calls.lock().unwrap().clone();
    let before_creates = host.observations.creates.lock().unwrap().clone();
    let before_effects = host.observations.effects.lock().unwrap().len();
    // Same exact endpoint identity, with a genuinely NEW adapter and task owner.
    // connect_lazy intentionally does not connect to the deliberately cut relay.
    let cold_store = DatabaseActorStore::connect_lazy(host.store.database_endpoint()).unwrap();
    let (adapter, cold_tasks) = g::AccountMethodsDatabaseAdapter::new(
        cold_store,
        OriginalAccount {
            observations: host.observations.clone(),
            logical_id: logical_id.into(),
        },
    )
    .with_authorization(reboot::auth::AuthorizationPolicy::permissive_for_development())
    .with_one_shot_writer_tasks(&reference(logical_id))
    .unwrap();
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let cold = ApplicationHost::new(APP)
        .with_host_recovery(cold_tasks.recovery(recovery_request()))
        .add_public_service(b::account_methods_server::AccountMethodsServer::new(
            adapter,
        ));
    let mut join =
        tokio::spawn(cold.serve_with_listener_shutdown(listener, std::future::pending()));
    let joined = tokio::time::timeout(DEADLINE, &mut join).await;
    if joined.is_err() {
        join.abort();
        let _ = join.await;
        panic!("cold refusal did not join; no acceptance");
    }
    let error = joined.unwrap().unwrap().unwrap_err();
    assert!(
        matches!(error, ApplicationHostError::Lifecycle { source, .. }
        if source.code() == tonic::Code::AlreadyExists
            && source.message() == "local actor task dispatcher already owned"),
        "cold host must fail at original registry claim, not at disconnected transport"
    );
    // The exact sequence, not just selected totals, must remain unchanged:
    // zero NEW Create/Recover/Load (and zero any proxy RPC) on cold replacement.
    assert_eq!(*host.observations.calls.lock().unwrap(), before_calls);
    assert_eq!(*host.observations.creates.lock().unwrap(), before_creates);
    assert_eq!(
        host.observations.effects.lock().unwrap().len(),
        before_effects
    );
    retained(&host.tasks);
    retained(&cold_tasks);
    held(&host.store, &reference(logical_id)).await;
}

#[tokio::test]
#[ignore = "own exact fresh process + pristine parent-exclusive upgraded CXX state; permanently retains production registry/global64 until process exit"]
async fn original_account_native_ack_transport_loss_retains_uncertainty_failed_host_cold_refusal() {
    let (canonical, run) = prerequisites();
    assert!(
        std::env::var_os("REBOOT_POSITIVE_SAVED_TOKEN").is_none(),
        "ACK-loss test never writes or consumes a saved FIRST public-response token"
    );
    let logical_id = "positive-native-ack-lost";
    let customer = "Original ACK-loss customer";
    let actor_ref = reference(logical_id);
    let mut direct = bounded(db::database_client::DatabaseClient::connect(
        canonical.clone(),
    ))
    .await
    .unwrap();
    absent(&mut direct, &actor_ref).await;
    let observations = Arc::new(Observations::new(true));
    let mut host = FaultHosted::start(&canonical, logical_id, observations.clone(), false).await;
    let baseline = host.tasks.constructor_uncertainty_status();
    assert_eq!(baseline.process_limit, 64);
    assert_eq!(baseline.process_reserved, 0);
    assert!(!baseline.actor_sealed && !baseline.actor_retained);
    bounded(host.cancel.public_ready()).await.unwrap();
    let mut client = bounded(b::account_methods_client::AccountMethodsClient::connect(
        host.endpoint.clone(),
    ))
    .await
    .unwrap();
    let key = uuid::Uuid::new_v4();
    let outgoing = request(
        &actor_ref,
        b::OpenRequest {
            customer_name: customer.into(),
        },
        Some(key),
    );
    let mut open = tokio::spawn(async move { client.open(outgoing).await });
    let _open_cleanup = AbortOpen(open.abort_handle());
    // Do not lose ownership of the public JoinHandle on a failure path.
    let ack = tokio::time::timeout(DEADLINE, async {
        tokio::select! {
            permit = observations.native_ack.acquire() => permit.unwrap().forget(),
            returned = &mut open => panic!("no actual canonical ACK; public/native failure is not an ACK-loss predecessor: {returned:?}"),
        }
    }).await;
    if ack.is_err() {
        open.abort();
        let _ = open.await;
        panic!("native ACK deadline; parent must discard failed attempt state");
    }
    assert!(
        !open.is_finished(),
        "generated public Open response escaped held canonical ACK"
    );
    assert_eq!(observations.creates.lock().unwrap().len(), 1);
    assert_eq!(observations.effects.lock().unwrap().len(), 1);
    let create = observations.creates.lock().unwrap()[0].clone();
    // This typed value is ONLY the genuine handler effect, not a delivered first
    // public response. readback validates exact persisted checkpoint bytes.
    let internal_effect = observations.effects.lock().unwrap()[0].clone();
    assert_eq!(
        create.idempotent_mutation.as_ref().unwrap().key,
        key.as_bytes()
    );
    assert_eq!(create.task_upserts, vec![internal_effect.1.clone()]);
    let actor = create.actor.as_ref().unwrap();
    assert_eq!(actor.state_ref, actor_ref);
    let state = b::Account::decode(actor.state.as_ref().unwrap().as_slice()).unwrap();
    assert_eq!(state.customer_name, customer);
    assert_eq!(state.balance, 0);
    readback(&mut direct, &create, &internal_effect.0, false).await;
    let sealed = host.tasks.constructor_uncertainty_status();
    assert!(sealed.actor_sealed && !sealed.actor_retained);
    assert_eq!(sealed.process_reserved, 1);
    held(&host.store, &actor_ref).await;
    no_effect(&observations);
    assert!(!open.is_finished());
    println!(
        "ACK_LOSS_PREFORWARD run={run} canonical_ack=true canonical_pending_readback=true public_response_delivered=false real_actor_gate_held=true global64_reserved=1"
    );

    // Fault after both canonical Ok and canonical persistence inspection. Do NOT
    // close forward_ack: that parent's error branch would synthesize Status.
    host.cut.take().unwrap().send(()).unwrap();
    bounded(&mut host.relay).await.unwrap();
    // Actual SDK sidecar transport has been destroyed, not a fabricated DB error.
    let public = tokio::time::timeout(DEADLINE, &mut open).await;
    if public.is_err() {
        open.abort();
        let _ = open.await;
        panic!("public Open did not finish after real transport cut; no ACK-loss acceptance");
    }
    let public = public.unwrap().unwrap();
    assert!(
        public.is_err(),
        "missing forwarded ACK must never yield generated public success"
    );
    let public_error = public.unwrap_err();
    println!(
        "ACK_LOSS_PUBLIC_ERROR run={run} actual_status={:?} message={:?} FIRST_RESPONSE_TOKEN_ABSENT=true",
        public_error.code(),
        public_error.message()
    );
    retained(&host.tasks);
    held(&host.store, &actor_ref).await;
    no_effect(&observations);
    readback(&mut direct, &create, &internal_effect.0, false).await;

    // The observer below owns the host's ACTUAL cancellation allocation. Do not
    // cancel it ourselves; demand automatic failed-generation supervision first.
    bounded(host.cancel.cancelled()).await;
    assert_eq!(
        host.cancel.public_ready().await.unwrap_err().code(),
        tonic::Code::Unavailable
    );
    // Keep dispatch CLOSED TO PROGRESS until serving AND recovery have joined.
    // Native Pending must not reach a live dispatcher after its generation failed.
    let joined = tokio::time::timeout(DEADLINE, &mut host.server).await;
    if joined.is_err() {
        panic!("actual failed host did not join; parent must teardown, not accept outer abort");
    }
    let error = joined.unwrap().unwrap().unwrap_err();
    match error {
        ApplicationHostError::RecoveryTask(source) => {
            // Recover work errors are preserved, not normalized by the SDK.
            // Accept only documented tonic/hyper disconnect mappings; causal
            // native ACK, retention, cancellation, no-effects and failed join
            // remain independently required. Never accept arbitrary failures.
            assert!(
                matches!(
                    source.code(),
                    tonic::Code::Unavailable
                        | tonic::Code::Cancelled
                        | tonic::Code::Unknown
                        | tonic::Code::Internal
                ),
                "unexpected failed-host diagnostic: {source}"
            );
            // The real cut also destroys an in-flight periodic Recover. The
            // supervisor preserves a selected work diagnostic ahead of its
            // uncertainty fallback (one_shot_tasks.rs:1900-1917). Therefore an
            // actual documented disconnect diagnostic is valid; never rewrite it to an
            // invented sticky-latch message. Retained registry/gate/capacity and
            // actual cancellation/join are independently asserted above/below.
            println!(
                "ACK_LOSS_FAILED_HOST run={run} actual_status={:?} message={:?}",
                source.code(),
                source.message()
            );
        }
        other => panic!("not actual failed-host uncertainty: {other:?}"),
    }
    let _ = host.stop.take().unwrap().send(());
    retained(&host.tasks);
    held(&host.store, &actor_ref).await;
    no_effect(&observations);
    // Only AFTER original host cancellation + full failed-host join can native
    // Recover handlers be released. Their original SDK streams were disconnected;
    // the joined failed generation cannot dispatch any result or task effect.
    observations.dispatch.close();
    host.proxy_stop.take().unwrap().send(()).unwrap();
    let proxy_join = tokio::time::timeout(DEADLINE, &mut host.proxy_server).await;
    assert!(
        proxy_join.is_ok(),
        "native proxy failed to join after cut; parent must discard failed attempt"
    );
    proxy_join.unwrap().unwrap().unwrap();
    no_effect(&observations);
    readback(&mut direct, &create, &internal_effect.0, false).await;

    // Quiescent proxy has joined: no unrelated late scan can mask cold deltas.
    cold_refused(&host, logical_id).await;
    no_effect(&observations);
    readback(&mut direct, &create, &internal_effect.0, false).await;
    retained(&host.tasks);
    held(&host.store, &actor_ref).await;
    assert_eq!(observations.creates.lock().unwrap().len(), 1);
    assert_eq!(observations.effects.lock().unwrap().len(), 1);
    println!(
        "ACK_LOSS_RETAINED_BEFORE_PROCESS_EXIT run={run} actual_failed_host_joined=true actual_host_cancelled=true original_actor_gate_held=true original_registry_sealed_retained=true global64_limit=64 global64_reserved=1 cold_host_already_exists=true cold_new_create_recover_load=0 canonical_actor_task_checkpoint_pending=true complete_task_calls=0 welcome_body_calls=0 public_first_response_absent=true PARENT_MUST_OBSERVE_EXACT_RUST_EXIT_AND_NATIVE_EXIT_BEFORE_STATE_CLEANUP_NO_LIVE_RESET"
    );
}
