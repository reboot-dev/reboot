//! Source-only acceptance candidate: actual generated root and original Account.
//! Run with the canonical REBOOT_NATIVE2PC_CXX_DATABASE binary and --ignored.
//! This is not Bank.Transfer or Open task scheduling acceptance.
#[path = "shared_existing_writer_ticket_acceptance.rs"]
mod ticket_matrix;
use crate::{account_generated as account, bank::v1 as b, probe as p, root_generated as root};
use prost::Message;
use reboot::durable_coordinator::{
    DurableRootCoordinator, ExactParticipantResolver, InProcessParticipantEndpoint,
    TonicCoordinatorSidecar,
};
use reboot::durable_participant::{
    DurableActorParticipant, DurableActorParticipantHost, ParticipantSidecar,
    TonicParticipantSidecar,
};
use reboot::runtime::{DatabaseActorStore, TransactionContext, TransactionExecution};
use std::sync::Arc;
use uuid::Uuid;

struct Starts;
impl reboot::runtime::RootTransactionStartFactory for Starts {
    fn next_root_transaction(
        &self,
    ) -> Result<reboot::runtime::RootTransactionStart, tonic::Status> {
        Ok(reboot::runtime::RootTransactionStart {
            transaction_id: Uuid::new_v4(),
            timestamp: prost_types::Timestamp::default(),
        })
    }
}
impl reboot::runtime::InboundTransactionStartFactory for Starts {
    fn next_inbound_transaction(
        &self,
        _: &reboot::runtime::InboundTransactionContext,
    ) -> Result<Uuid, tonic::Status> {
        let _ = ticket_matrix::MATRIX.try_with(|m| {
            m.allocations
                .fetch_add(1, std::sync::atomic::Ordering::SeqCst);
        });
        Ok(Uuid::new_v4())
    }
}
struct LocalOnly;
#[tonic::async_trait]
impl reboot::runtime::TransactionalChannelResolver for LocalOnly {
    fn transactional_route(
        &self,
        _: &str,
        _: &str,
        _: &str,
    ) -> Result<reboot::runtime::TransactionalRoute, tonic::Status> {
        Ok(reboot::runtime::TransactionalRoute::RegisteredSameHost)
    }
    async fn resolve(&self, _: &str, _: &str) -> Result<tonic::transport::Channel, tonic::Status> {
        panic!("no remote fallback")
    }
}
struct Account;
#[tonic::async_trait]
impl account::AccountMethodsTransactionHandler for Account {
    // External creation only. No welcome-email scheduling claimed by this probe.
    async fn open(
        &self,
        s: &mut b::Account,
        r: b::OpenRequest,
    ) -> Result<b::OpenResponse, tonic::Status> {
        s.customer_name = r.customer_name;
        Ok(b::OpenResponse::default())
    }
    async fn balance(
        &self,
        s: &b::Account,
        _: b::BalanceRequest,
    ) -> Result<b::BalanceResponse, tonic::Status> {
        Ok(b::BalanceResponse { balance: s.balance })
    }
    async fn deposit(
        &self,
        s: &mut b::Account,
        r: b::DepositRequest,
    ) -> Result<b::DepositResponse, tonic::Status> {
        s.balance = s
            .balance
            .checked_add(r.amount)
            .ok_or_else(|| tonic::Status::out_of_range("balance overflow"))?;
        Ok(b::DepositResponse {
            updated_balance: s.balance,
        })
    }
    async fn withdraw(
        &self,
        s: &mut b::Account,
        r: b::WithdrawRequest,
    ) -> Result<b::WithdrawResponse, account::AccountMethodsWithdrawError> {
        let _ = ticket_matrix::MATRIX.try_with(|m| {
            m.handlers.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
        });
        if let Ok(m) = ticket_matrix::MATRIX.try_with(Arc::clone) {
            m.suspend_handler_if_selected().await;
        }
        if r.amount > s.balance {
            let amount = u32::try_from(r.amount - s.balance).map_err(|_| {
                account::AccountMethodsWithdrawError::Grpc(tonic::Status::out_of_range(
                    "overdraft amount",
                ))
            })?;
            return Err(account::AccountMethodsWithdrawError::OverdraftError(
                b::OverdraftError { amount },
            ));
        }
        s.balance -= r.amount;
        let _ = ticket_matrix::MATRIX.try_with(|m| {
            m.handler_successes
                .fetch_add(1, std::sync::atomic::Ordering::SeqCst);
        });
        Ok(b::WithdrawResponse {
            updated_balance: s.balance,
        })
    }
    async fn welcome_email(
        &self,
        _: &mut b::Account,
        _: b::WelcomeEmailRequest,
    ) -> Result<b::WelcomeEmailResponse, tonic::Status> {
        Err(tonic::Status::unimplemented("tasks outside probe"))
    }
}
#[tonic::async_trait]
impl account::AccountMethodsDatabaseHandler for Account {
    async fn open(
        &self,
        s: &mut b::Account,
        r: b::OpenRequest,
    ) -> Result<b::OpenResponse, tonic::Status> {
        account::AccountMethodsTransactionHandler::open(self, s, r).await
    }
    async fn balance(
        &self,
        s: &b::Account,
        r: b::BalanceRequest,
    ) -> Result<b::BalanceResponse, tonic::Status> {
        account::AccountMethodsTransactionHandler::balance(self, s, r).await
    }
    async fn deposit(
        &self,
        s: &mut b::Account,
        r: b::DepositRequest,
    ) -> Result<b::DepositResponse, tonic::Status> {
        account::AccountMethodsTransactionHandler::deposit(self, s, r).await
    }
    async fn withdraw(
        &self,
        s: &mut b::Account,
        r: b::WithdrawRequest,
    ) -> Result<b::WithdrawResponse, account::AccountMethodsWithdrawError> {
        account::AccountMethodsTransactionHandler::withdraw(self, s, r).await
    }
    async fn welcome_email(
        &self,
        s: &mut b::Account,
        r: b::WelcomeEmailRequest,
    ) -> Result<b::WelcomeEmailResponse, tonic::Status> {
        account::AccountMethodsTransactionHandler::welcome_email(self, s, r).await
    }
}
struct Park {
    entered: tokio::sync::mpsc::UnboundedSender<()>,
    release: tokio::sync::Notify,
}
tokio::task_local! {
    static PARK: Arc<Park>;
    static SPOOF_RECEIVER: Arc<dyn b::account_methods_server::AccountMethods + Send + Sync>;
}
struct RemoteOnly;
#[tonic::async_trait]
impl reboot::runtime::TransactionalChannelResolver for RemoteOnly {
    async fn resolve(&self, _: &str, _: &str) -> Result<tonic::transport::Channel, tonic::Status> {
        panic!("shared owner must reject remote route before network resolution")
    }
}
struct Root {
    handler_entries: Arc<std::sync::atomic::AtomicUsize>,
    successful_withdrawals: Arc<std::sync::atomic::AtomicUsize>,
}
#[tonic::async_trait]
impl root::SharedRootMethodsTransactionHandler for Root {
    async fn initialize(
        &self,
        s: &mut p::SharedRoot,
        _: p::InitializeRequest,
    ) -> Result<p::InitializeResponse, tonic::Status> {
        s.marker = 7;
        Ok(p::InitializeResponse {})
    }
    async fn transfer(
        &self,
        _: &TransactionContext,
        _: &mut p::SharedRoot,
        _: p::TransferRequest,
    ) -> Result<TransactionExecution<p::TransferResponse>, tonic::Status> {
        Err(tonic::Status::unimplemented("legacy shared path not used"))
    }
    async fn transfer_fresh_shared(
        &self,
        _: &reboot::runtime::SharedLocalTransactionContext,
        _: &mut p::SharedRoot,
        _: p::TransferRequest,
    ) -> Result<p::TransferResponse, tonic::Status> {
        Err(tonic::Status::unimplemented("response-only path not used"))
    }
    async fn transfer_shared_existing_writers(
        &self,
        c: &TransactionContext,
        s: &p::SharedRoot,
        r: p::TransferRequest,
    ) -> Result<p::TransferResponse, tonic::Status> {
        assert_eq!(s.marker, 7);
        c.require_registered_outbound()?;
        self.handler_entries
            .fetch_add(1, std::sync::atomic::Ordering::SeqCst);
        if (30..=37).contains(&r.scenario) || r.scenario == 39 {
            return ticket_matrix::probe(c, &r).await;
        }
        if r.scenario == 20 {
            let receiver = SPOOF_RECEIVER.with(Arc::clone);
            let mut headers = reboot::RebootHeaders::new(&r.from);
            headers.transaction_ids = Some(c.transaction_ids().to_vec());
            headers.transaction_coordinator_state_type =
                Some(c.transaction_coordinator_state_type().into());
            headers.transaction_coordinator_state_ref =
                Some(c.transaction_coordinator_state_ref().into());
            headers.coordinator_read_only_aware = true;
            let mut wire = tonic::Request::new(b::WithdrawRequest { amount: 40 });
            *wire.metadata_mut() = headers.to_metadata().unwrap();
            let error = receiver.withdraw(wire).await.unwrap_err();
            assert_eq!(error.code(), tonic::Code::FailedPrecondition);
            assert_eq!(
                error.message(),
                "inbound ordinary writer requires registered local ticket"
            );
            // A genuine root context does not make metadata into local authority.
            return Ok(p::TransferResponse {});
        }
        if r.scenario == 21 {
            let client = root::SharedRootMethodsClient::new(LocalOnly);
            let target = root::SharedRootMethodsTarget::new(&c.headers().state_ref);
            assert!(
                client.transfer(c, &target, r.clone()).await.is_err(),
                "root self-call must reject"
            );
            return Err(tonic::Status::invalid_argument("self-call probe done"));
        }
        if r.scenario == 22 {
            let client = account::AccountMethodsClient::new(RemoteOnly);
            assert!(
                client
                    .withdraw(
                        c,
                        &account::AccountMethodsTarget::new(&r.from),
                        b::WithdrawRequest { amount: 40 }
                    )
                    .await
                    .is_err(),
                "shared owned root cannot choose a remote writer"
            );
            return Err(tonic::Status::invalid_argument("remote probe done"));
        }
        let client = account::AccountMethodsClient::new(LocalOnly);
        let from = account::AccountMethodsTarget::new(&r.from);
        let to = account::AccountMethodsTarget::new(&r.to);
        if r.scenario == 2 {
            // First-touch declared failure must be acknowledged before a real reupgrade.
            match client
                .withdraw(c, &from, b::WithdrawRequest { amount: 101 })
                .await
            {
                Err(account::AccountMethodsWithdrawError::OverdraftError(e)) => {
                    assert_eq!(e.amount, 1)
                }
                other => panic!("expected acknowledged declared failure: {other:?}"),
            }
        }
        client
            .withdraw(c, &from, b::WithdrawRequest { amount: r.amount })
            .await
            .map_err(|error| match error {
                account::AccountMethodsWithdrawError::Grpc(status) => status,
                account::AccountMethodsWithdrawError::System(system) => {
                    system.error.into_status(system.message)
                }
                account::AccountMethodsWithdrawError::OverdraftError(error) => {
                    reboot::declared_error_status(
                        tonic::Code::Unknown,
                        "declared error",
                        "type.googleapis.com/bank.v1.OverdraftError",
                        &error,
                    )
                }
            })?;
        // Record only an acknowledged generated outbound success, not handler entry.
        self.successful_withdrawals
            .fetch_add(1, std::sync::atomic::Ordering::SeqCst);
        if r.scenario == 38 {
            // Populated only by the acknowledged real generated withdrawal.
            let members = c.returned_participants_snapshot();
            assert_eq!(members.len(), 1);
            assert_eq!(members[0].target.state_type, "bank.v1.Account");
            assert_eq!(members[0].target.state_ref, r.from);
            assert!(!members[0].read_only);
            let cloned = c.clone();
            assert_eq!(cloned.take_returned_participants(), members);
            assert_eq!(c.returned_participants_snapshot(), members);
            let nested = c.with_nested_transaction_id(Uuid::new_v4()).unwrap();
            assert_eq!(nested.take_returned_participants(), members);
            assert_eq!(nested.take_returned_participants(), members);
            assert_eq!(cloned.take_returned_participants(), members);
            assert_eq!(c.returned_participants_snapshot(), members);
        }
        if r.scenario == 10 {
            let park = PARK.with(Arc::clone);
            park.entered.send(()).unwrap();
            park.release.notified().await;
        }
        if r.scenario == 1 {
            return Err(tonic::Status::invalid_argument(
                "explicit root failure after staged withdrawal",
            ));
        }
        if r.scenario == 3 {
            // N1 succeeds, N2 fails, N3 must see N1's preserved staged balance.
            match client
                .withdraw(c, &from, b::WithdrawRequest { amount: 101 })
                .await
            {
                Err(account::AccountMethodsWithdrawError::OverdraftError(e)) => {
                    assert_eq!(e.amount, 1 + u32::try_from(r.amount).unwrap())
                }
                other => panic!("expected N2 declared failure: {other:?}"),
            }
        }
        // Distinct N3 durable result prevents preservation of initial state from
        // masquerading as generated Commit/restart acceptance.
        let deposit_amount = if r.scenario == 3 { 20 } else { r.amount };
        client
            .deposit(
                c,
                &to,
                b::DepositRequest {
                    amount: deposit_amount,
                },
            )
            .await?;
        Ok(p::TransferResponse {})
    }
}
fn request<M>(state_ref: &str, message: M, writer: bool) -> tonic::Request<M> {
    let mut headers = reboot::RebootHeaders::new(state_ref);
    if writer {
        headers.idempotency_key = Some(Uuid::new_v4());
    }
    let mut request = tonic::Request::new(message);
    *request.metadata_mut() = headers.to_metadata().unwrap();
    request
}

type Rpc<'a, T> =
    std::pin::Pin<Box<dyn std::future::Future<Output = Result<T, tonic::Status>> + Send + 'a>>;
struct Boundary {
    inner: TonicParticipantSidecar,
    hold: std::sync::Mutex<Option<String>>,
    lost_target: std::sync::Mutex<Option<String>>,
    lose_prepare: std::sync::atomic::AtomicBool,
    lose_commit: std::sync::atomic::AtomicBool,
    entered: tokio::sync::Notify,
    release: tokio::sync::Notify,
    controls: std::sync::Mutex<Vec<(&'static str, String, String)>>,
}
impl ParticipantSidecar for Boundary {
    fn database_endpoint(&self) -> Option<&str> {
        self.inner.database_endpoint()
    }
    fn load(
        &self,
        r: reboot::database_proto::LoadRequest,
    ) -> Rpc<'_, reboot::database_proto::LoadResponse> {
        let _ = ticket_matrix::MATRIX.try_with(|m| {
            if r.actors.iter().any(|a| a.state_type == "bank.v1.Account") {
                m.loads.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
            }
        });
        self.inner.load(r)
    }
    fn prepare(
        &self,
        r: reboot::database_proto::TransactionParticipantPrepareRequest,
    ) -> Rpc<'_, reboot::database_proto::TransactionParticipantPrepareResponse> {
        Box::pin(async move {
            let target = r.state_ref.clone();
            self.controls
                .lock()
                .unwrap()
                .push(("prepare", r.state_type.clone(), target.clone()));
            let response = self.inner.prepare(r).await?;
            let hold = {
                let mut selected = self.hold.lock().unwrap();
                if selected.as_ref() == Some(&target) {
                    selected.take();
                    true
                } else {
                    false
                }
            };
            if hold {
                self.entered.notify_one();
                self.release.notified().await;
            }
            if self
                .lose_prepare
                .swap(false, std::sync::atomic::Ordering::SeqCst)
            {
                *self.lost_target.lock().unwrap() = Some(target);
                return Err(tonic::Status::unavailable(
                    "actual native Prepare ACK discarded",
                ));
            }
            Ok(response) // Actual native ACK, never a synthesized response.
        })
    }
    fn commit(
        &self,
        r: reboot::database_proto::TransactionParticipantCommitRequest,
    ) -> Rpc<'_, reboot::database_proto::TransactionParticipantCommitResponse> {
        self.controls
            .lock()
            .unwrap()
            .push(("commit", r.state_type.clone(), r.state_ref.clone()));
        Box::pin(async move {
            let target = r.state_ref.clone();
            let response = self.inner.commit(r).await?;
            if self
                .lose_commit
                .swap(false, std::sync::atomic::Ordering::SeqCst)
            {
                *self.lost_target.lock().unwrap() = Some(target);
                return Err(tonic::Status::unavailable(
                    "actual native Commit ACK discarded",
                ));
            }
            Ok(response)
        })
    }
    fn abort(
        &self,
        r: reboot::database_proto::TransactionParticipantAbortRequest,
    ) -> Rpc<'_, reboot::database_proto::TransactionParticipantAbortResponse> {
        self.controls
            .lock()
            .unwrap()
            .push(("abort", r.state_type.clone(), r.state_ref.clone()));
        self.inner.abort(r)
    }
    fn recover(
        &self,
        r: reboot::database_proto::RecoverRequest,
    ) -> Rpc<'_, Vec<reboot::database_proto::RecoverResponse>> {
        self.inner.recover(r)
    }
    fn recover_idempotent_mutations(
        &self,
        r: reboot::database_proto::RecoverIdempotentMutationsRequest,
    ) -> Rpc<'_, Vec<reboot::database_proto::RecoverIdempotentMutationsResponse>> {
        self.inner.recover_idempotent_mutations(r)
    }
}

struct WatchBoundary {
    inner: reboot::legacy_coordinator::TonicCoordinatorWatchEndpoint,
    parked: std::sync::atomic::AtomicBool,
}
impl reboot::legacy_coordinator::CoordinatorWatchEndpoint for WatchBoundary {
    fn watch(
        &self,
        r: reboot::database_proto::WatchRequest,
    ) -> Rpc<'_, reboot::database_proto::WatchResponse> {
        Box::pin(async move {
            // Deterministically prevent legitimate recovery from racing the
            // exclusion assertion. No decision or success response is invented.
            if self.parked.load(std::sync::atomic::Ordering::SeqCst) {
                std::future::pending::<()>().await;
            }
            reboot::legacy_coordinator::CoordinatorWatchEndpoint::watch(&self.inner, r).await
        })
    }
}

struct CoordinatorBoundary {
    inner: TonicCoordinatorSidecar,
    lose_decision: std::sync::atomic::AtomicBool,
}
impl reboot::durable_coordinator::CoordinatorSidecar for CoordinatorBoundary {
    fn database_endpoint(&self) -> Option<&str> {
        reboot::durable_coordinator::CoordinatorSidecar::database_endpoint(&self.inner)
    }
    fn coordinator_prepare(
        &self,
        r: reboot::database_proto::TransactionCoordinatorPrepareRequest,
    ) -> Rpc<'_, reboot::database_proto::TransactionCoordinatorPrepareResponse> {
        reboot::durable_coordinator::CoordinatorSidecar::coordinator_prepare(&self.inner, r)
    }
    fn coordinator_prepared(
        &self,
        r: reboot::database_proto::TransactionCoordinatorPreparedRequest,
    ) -> Rpc<'_, reboot::database_proto::TransactionCoordinatorPreparedResponse> {
        reboot::durable_coordinator::CoordinatorSidecar::coordinator_prepared(&self.inner, r)
    }
    fn coordinator_cleanup(
        &self,
        r: reboot::database_proto::TransactionCoordinatorCleanupRequest,
    ) -> Rpc<'_, reboot::database_proto::TransactionCoordinatorCleanupResponse> {
        reboot::durable_coordinator::CoordinatorSidecar::coordinator_cleanup(&self.inner, r)
    }
    fn decision_put(
        &self,
        r: reboot::database_proto::TransactionCoordinatorDecisionPutRequest,
    ) -> Rpc<'_, reboot::database_proto::TransactionCoordinatorDecisionPutResponse> {
        Box::pin(async move {
            let response =
                reboot::durable_coordinator::CoordinatorSidecar::decision_put(&self.inner, r)
                    .await?;
            if self
                .lose_decision
                .swap(false, std::sync::atomic::Ordering::SeqCst)
            {
                return Err(tonic::Status::unavailable(
                    "actual native DecisionPut ACK discarded",
                ));
            }
            Ok(response)
        })
    }
    fn decision_get(
        &self,
        r: reboot::database_proto::TransactionCoordinatorDecisionGetRequest,
    ) -> Rpc<'_, reboot::database_proto::TransactionCoordinatorDecisionGetResponse> {
        reboot::durable_coordinator::CoordinatorSidecar::decision_get(&self.inner, r)
    }
    fn recover(
        &self,
        r: reboot::database_proto::RecoverRequest,
    ) -> Rpc<'_, Vec<reboot::database_proto::RecoverResponse>> {
        reboot::durable_coordinator::CoordinatorSidecar::recover(&self.inner, r)
    }
}

struct Native {
    child: std::process::Child,
    state: tempfile::TempDir,
    endpoint: String,
    port: u16,
    binary: String,
}
impl Native {
    fn start() -> Self {
        let binary = std::env::var("REBOOT_NATIVE2PC_CXX_DATABASE")
            .expect("canonical CXX Database required");
        let socket = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let port = socket.local_addr().unwrap().port();
        drop(socket);
        let state = tempfile::tempdir().unwrap();
        std::fs::write(
            state.path().join("server-info.pb"),
            reboot::database_proto::ServerInfo {
                shard_infos: vec![reboot::database_proto::ShardInfo {
                    shard_id: "s000000000".into(),
                    shard_first_key: vec![],
                }],
            }
            .encode_to_vec(),
        )
        .unwrap();
        let child = Self::spawn(&binary, &state, port);
        let mut native = Self {
            child,
            state,
            endpoint: format!("http://127.0.0.1:{port}"),
            port,
            binary,
        };
        native.ready();
        native
    }
    fn spawn(binary: &str, state: &tempfile::TempDir, port: u16) -> std::process::Child {
        std::process::Command::new(binary)
            .arg(state.path().join("rocksdb"))
            .arg(state.path().join("server-info.pb"))
            .arg(port.to_string())
            .stdout(std::process::Stdio::null())
            .spawn()
            .unwrap()
    }
    fn ready(&mut self) {
        for _ in 0..500 {
            if std::net::TcpStream::connect(("127.0.0.1", self.port)).is_ok() {
                return;
            }
            assert!(
                self.child.try_wait().unwrap().is_none(),
                "CXX Database startup failed"
            );
            std::thread::sleep(std::time::Duration::from_millis(10));
        }
        panic!("CXX startup deadline");
    }
    fn restart(&mut self) {
        self.child.kill().unwrap();
        self.child.wait().unwrap();
        self.child = Self::spawn(&self.binary, &self.state, self.port);
        self.ready();
    }
}
impl Drop for Native {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

async fn run_case(same: bool, scenario: u32, missing: bool) {
    use b::account_methods_server::AccountMethods;
    use p::shared_root_methods_server::SharedRootMethods;
    let mut native = Native::start();
    let store = DatabaseActorStore::connect(&native.endpoint).await.unwrap();
    let sidecar = Arc::new(Boundary {
        inner: TonicParticipantSidecar::connect(&native.endpoint)
            .await
            .unwrap(),
        hold: std::sync::Mutex::new(None),
        lost_target: std::sync::Mutex::new(None),
        lose_prepare: std::sync::atomic::AtomicBool::new(false),
        lose_commit: std::sync::atomic::AtomicBool::new(false),
        entered: tokio::sync::Notify::new(),
        release: tokio::sync::Notify::new(),
        controls: std::sync::Mutex::new(Vec::new()),
    });
    let coordinator_sidecar = Arc::new(CoordinatorBoundary {
        inner: TonicCoordinatorSidecar::connect(&native.endpoint)
            .await
            .unwrap(),
        lose_decision: std::sync::atomic::AtomicBool::new(false),
    });
    let refs = [
        ("shared.probe.SharedRoot", "root"),
        ("bank.v1.Account", "alice"),
        ("bank.v1.Account", "bob"),
        ("bank.v1.Account", "carol"),
        ("bank.v1.Account", "dave"),
        ("bank.v1.Account", "missing"),
    ]
    .map(|(t, id)| {
        reboot::state_ref::StateRef::from_id(t, id)
            .unwrap()
            .to_string()
    });
    let participants = [
        ("shared.probe.SharedRoot", &refs[0]),
        ("bank.v1.Account", &refs[1]),
        ("bank.v1.Account", &refs[2]),
        ("bank.v1.Account", &refs[3]),
        ("bank.v1.Account", &refs[4]),
        ("bank.v1.Account", &refs[5]),
    ]
    .map(|(t, r)| DurableActorParticipant::new(sidecar.clone(), t, r));
    let resolver = Arc::new(
        ExactParticipantResolver::new(participants.iter().map(|a| {
            (
                a.actor_target(),
                Arc::new(InProcessParticipantEndpoint::new(
                    DurableActorParticipantHost::new(a.clone()),
                )),
            )
        }))
        .unwrap(),
    );
    let coordinators = participants
        .iter()
        .map(|a| {
            DurableRootCoordinator::new(coordinator_sidecar.clone(), resolver.clone())
                .with_identity(a.actor_target())
        })
        .collect::<Vec<_>>();
    let socket = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
    let address = socket.local_addr().unwrap();
    drop(socket);
    let watch = Arc::new(WatchBoundary {
        inner: reboot::legacy_coordinator::TonicCoordinatorWatchEndpoint::lazy(format!(
            "http://{address}"
        ))
        .unwrap(),
        parked: std::sync::atomic::AtomicBool::new(false),
    });
    let policy = if (30..=37).contains(&scenario) || scenario == 39 {
        reboot::auth::AuthorizationPolicy::new(
            Some(Arc::new(ticket_matrix::Policy)),
            Some(Arc::new(ticket_matrix::Policy)),
        )
    } else {
        reboot::auth::AuthorizationPolicy::permissive_for_development()
    };
    let mut host =
        reboot::application_host::ApplicationHost::new("generated-shared-existing-writer-probe");
    let handler_entries = Arc::new(std::sync::atomic::AtomicUsize::new(0));
    let successful_withdrawals = Arc::new(std::sync::atomic::AtomicUsize::new(0));
    let root_adapter = root::SharedRootMethodsTransactionAdapter::new(
        store.clone(),
        participants[0].clone(),
        coordinators[0].clone(),
        Starts,
        Root {
            handler_entries: handler_entries.clone(),
            successful_withdrawals: successful_withdrawals.clone(),
        },
    )
    .with_authorization(policy.clone())
    .with_explicit_abort_owner(reboot::explicit_abort::ExplicitAbortOwner::new(8).unwrap())
    .with_shared_existing_writers();
    let (root_adapter, _) = host
        .register_local_transaction_service(root_adapter)
        .unwrap();
    let mut accounts = Vec::new();
    for i in 1..=5 {
        let adapter = account::AccountMethodsTransactionAdapter::new(
            store.clone(),
            participants[i].clone(),
            coordinators[i].clone(),
            Starts,
            Account,
        )
        .with_authorization(policy.clone())
        .with_live_participant_owner(
            reboot::live_participant::LiveParticipantOwner::new(
                8,
                participants[0].actor_target(),
                watch.clone(),
            )
            .unwrap(),
        );
        let (adapter, _) = host.register_local_transaction_service(adapter).unwrap();
        accounts.push(adapter);
    }
    let metadata = reboot::durable_participant::ParticipantRecovery {
        shard_ids: vec!["s000000000".into()],
        ..Default::default()
    };
    let mut recovery = root_adapter
        .legacy_recovery_registration(
            reboot::application_host::LegacyRecoveryMetadata {
                participant: metadata.clone(),
                coordinator: reboot::durable_coordinator::CoordinatorRecovery {
                    shard_ids: vec!["s000000000".into()],
                    coordinator_state_ref: refs[0].clone(),
                    ..Default::default()
                },
            },
            watch.clone(),
        )
        .unwrap();
    for a in participants.iter().skip(1) {
        recovery = recovery
            .with_participant(a.clone(), metadata.clone())
            .unwrap();
    }
    let control = root_adapter
        .legacy_coordinator_control_service("shared.probe.SharedRoot", &refs[0])
        .unwrap();
    let mut host = host
        .with_host_recovery(recovery)
        .with_host_recovery(root_adapter.explicit_abort_recovery_registration().unwrap());
    for a in &accounts {
        host = host.with_host_recovery(a.live_participant_recovery_registration().unwrap());
    }
    let (stop, stopped) = tokio::sync::oneshot::channel();
    let server = tokio::spawn(
        host.add_legacy_control_service(control)
            .add_public_service(p::shared_root_methods_server::SharedRootMethodsServer::new(
                root_adapter.clone(),
            ))
            .serve_with_shutdown(address, async {
                let _ = stopped.await;
            }),
    );
    tokio::time::timeout(std::time::Duration::from_secs(10), async {
        while root_adapter.require_local_host_ready().is_err() {
            tokio::task::yield_now().await;
        }
    })
    .await
    .unwrap();
    root_adapter
        .initialize(request(&refs[0], p::InitializeRequest {}, true))
        .await
        .unwrap();
    for i in 0..4 {
        accounts[i]
            .open(request(
                &refs[i + 1],
                b::OpenRequest {
                    customer_name: format!("account-{i}"),
                },
                true,
            ))
            .await
            .unwrap();
    }
    accounts[0]
        .deposit(request(&refs[1], b::DepositRequest { amount: 100 }, true))
        .await
        .unwrap();
    // Native root/Account construction and seeding are setup, not this root execution.
    let control_offset = sidecar.controls.lock().unwrap().len();
    if (30..=37).contains(&scenario) || scenario == 39 {
        let matrix = Arc::new(ticket_matrix::Matrix::new(
            accounts
                .iter()
                .take(2)
                .map(|a| {
                    Arc::new(a.clone())
                        as Arc<dyn b::account_methods_server::AccountMethods + Send + Sync>
                })
                .collect(),
            stop,
            scenario,
            store.clone(),
        ));
        let result = tokio::time::timeout(
            std::time::Duration::from_secs(10),
            ticket_matrix::MATRIX.scope(
                matrix.clone(),
                root_adapter.transfer(request(
                    &refs[0],
                    p::TransferRequest {
                        from: refs[1].clone(),
                        to: refs[2].clone(),
                        amount: 40,
                        scenario,
                    },
                    false,
                )),
            ),
        )
        .await
        .unwrap();
        assert!(
            result.is_err(),
            "raw ticket probe must never authorize root Commit"
        );
        matrix.check();
        matrix.require_replays_completed();
        if scenario == 39 {
            assert!(
                !sidecar.controls.lock().unwrap()[control_offset..]
                    .iter()
                    .any(|(verb, _, _)| *verb == "prepare"),
                "suspended revoked handler cannot reach native Prepare"
            );
        }
        assert!(
            !sidecar.controls.lock().unwrap()[control_offset..]
                .iter()
                .any(|(verb, _, _)| *verb == "commit")
        );
        if let Some(stop) = matrix.stop.lock().unwrap().take() {
            let _ = stop.send(());
        }
        let shutdown_result = server.await.unwrap();
        assert!(root_adapter.require_local_host_ready().is_err());
        if matches!(scenario, 37 | 39) {
            assert!(
                matches!(
                    shutdown_result,
                    Err(reboot::application_host::ApplicationHostError::RecoveryTask(_))
                ),
                "unresolved admitted Watch must fail host shutdown: {shutdown_result:?}"
            );
            matrix.require_retained_gate(&refs[1], &refs[4]).await;
        } else if matches!(scenario, 35 | 36) {
            // The raw root remains registered with unresolved caller membership:
            // shutdown is triggered INSIDE that active call. Account admission
            // cleanup is separate from terminal settlement of the root. Require
            // the exact fail-closed host outcome AND actual same-store reuse.
            let Err(reboot::application_host::ApplicationHostError::RecoveryTask(error)) =
                shutdown_result
            else {
                panic!("unsettled raw root must fail shutdown");
            };
            assert_eq!(error.code(), tonic::Code::Unavailable);
            assert_eq!(
                error.message(),
                "durable task outcome uncertain during shutdown"
            );
            assert!(
                !sidecar.controls.lock().unwrap()[control_offset..]
                    .iter()
                    .any(|(verb, _, _)| matches!(*verb, "prepare" | "commit" | "abort")),
                "pre-handler revocation must not issue native participant controls"
            );
            let after_cleanup = tokio::time::timeout(
                std::time::Duration::from_secs(2),
                store.writer_async::<b::Account, _, _, _>(
                    "bank.v1.Account",
                    request(&refs[1], b::DepositRequest { amount: 1 }, true),
                    |state, request| {
                        Box::pin(async move {
                            assert_eq!(
                                state.balance, 100,
                                "raw staged mutation must be discarded by orderly cleanup"
                            );
                            state.balance += request.amount;
                            Ok(b::DepositResponse {
                                updated_balance: state.balance,
                            })
                        })
                    },
                ),
            )
            .await
            .unwrap()
            .unwrap();
            assert_eq!(after_cleanup.get_ref().updated_balance, 101);
        } else {
            assert!(
                matches!(
                    shutdown_result,
                    Err(reboot::application_host::ApplicationHostError::RecoveryTask(_))
                ),
                "unsettled root failure must retain failed-host status: {shutdown_result:?}"
            );
        }
        let final_controls = sidecar.controls.lock().unwrap()[control_offset..].to_vec();
        assert!(!final_controls.iter().any(|(verb, _, _)| *verb == "commit"));
        if scenario == 39 {
            assert!(!final_controls.iter().any(|(verb, _, _)| *verb == "prepare"));
        }
        return;
    }
    if matches!(scenario, 12..=14) {
        watch
            .parked
            .store(true, std::sync::atomic::Ordering::SeqCst);
        if scenario == 12 {
            coordinator_sidecar
                .lose_decision
                .store(true, std::sync::atomic::Ordering::SeqCst);
        }
        if scenario == 13 {
            sidecar
                .lose_prepare
                .store(true, std::sync::atomic::Ordering::SeqCst);
        }
        if scenario == 14 {
            sidecar
                .lose_commit
                .store(true, std::sync::atomic::Ordering::SeqCst);
        }
        let result = tokio::time::timeout(
            std::time::Duration::from_secs(10),
            root_adapter.transfer(request(
                &refs[0],
                p::TransferRequest {
                    from: refs[1].clone(),
                    to: refs[2].clone(),
                    amount: 40,
                    scenario: 0,
                },
                false,
            )),
        )
        .await
        .unwrap();
        assert!(
            result.is_err(),
            "actual ACK loss is uncertainty, never fabricated success or replay"
        );
        tokio::time::timeout(std::time::Duration::from_secs(3), async {
            while root_adapter.require_local_host_ready().is_ok() {
                tokio::task::yield_now().await;
            }
        })
        .await
        .unwrap();
        let controls = sidecar.controls.lock().unwrap()[control_offset..].to_vec();
        assert!(
            controls.iter().all(|(_, t, _)| t == "bank.v1.Account"),
            "locally released read-only root must NEVER receive native Abort after decision/terminal uncertainty"
        );
        assert!(
            !controls.iter().any(|(verb, _, _)| *verb == "abort"),
            "lost ACK cannot authorize speculative native Abort"
        );
        let prepared = controls
            .iter()
            .filter(|(verb, _, _)| *verb == "prepare")
            .count();
        assert!(
            prepared > 0,
            "fault boundary must follow real Account Prepare"
        );
        let discarded_target = sidecar.lost_target.lock().unwrap().clone();
        if scenario == 12 {
            assert!(
                !coordinator_sidecar
                    .lose_decision
                    .load(std::sync::atomic::Ordering::SeqCst),
                "successful real DecisionPut ACK discard must actually fire"
            );
            assert_eq!(prepared, 2);
        } else {
            let target = discarded_target
                .as_deref()
                .expect("successful native ACK discard must select an Account");
            assert!(target == refs[1] || target == refs[2]);
            let (arm, verb) = if scenario == 13 {
                (&sidecar.lose_prepare, "prepare")
            } else {
                (&sidecar.lose_commit, "commit")
            };
            assert!(
                !arm.load(std::sync::atomic::Ordering::SeqCst),
                "successful native ACK discard must actually fire"
            );
            assert!(
                controls
                    .iter()
                    .any(|(seen, _, reference)| *seen == verb && reference == target)
            );
        }
        // Watch may converge only through the legitimate recovery path. At this
        // failed host boundary both prepared writer actors must still exclude a
        // competing real actor-store writer; no fake idempotent retry is allowed.
        let lost = sidecar.lost_target.lock().unwrap().clone();
        for i in 0..2 {
            if scenario == 14 && lost.as_deref() != Some(refs[i + 1].as_str()) {
                continue;
            }
            let mut competing = Box::pin(accounts[i].deposit(request(
                &refs[i + 1],
                b::DepositRequest { amount: 1 },
                true,
            )));
            assert!(
                tokio::time::timeout(std::time::Duration::from_millis(100), &mut competing)
                    .await
                    .is_err(),
                "uncertain native ownership retained through ACK loss"
            );
        }
        let _ = stop.send(());
        let _ = server.await.unwrap();
        return;
    }
    if scenario == 11 {
        *sidecar.hold.lock().unwrap() = Some(refs[1].clone());
        let a = root_adapter.clone();
        let x = refs.clone();
        let transfer = tokio::spawn(async move {
            a.transfer(request(
                &x[0],
                p::TransferRequest {
                    from: x[1].clone(),
                    to: x[2].clone(),
                    amount: 40,
                    scenario: 0,
                },
                false,
            ))
            .await
        });
        tokio::time::timeout(
            std::time::Duration::from_secs(5),
            sidecar.entered.notified(),
        )
        .await
        .unwrap();
        let mut competitor =
            Box::pin(accounts[0].deposit(request(&refs[1], b::DepositRequest { amount: 1 }, true)));
        assert!(
            tokio::time::timeout(std::time::Duration::from_millis(100), &mut competitor)
                .await
                .is_err(),
            "actual Prepare ACK held: exclusive account ownership must survive"
        );
        tokio::time::timeout(
            std::time::Duration::from_secs(2),
            accounts[2].deposit(request(&refs[3], b::DepositRequest { amount: 9 }, true)),
        )
        .await
        .unwrap()
        .unwrap();
        assert!(
            !transfer.is_finished(),
            "held real native ACK must stop root completion"
        );
        sidecar.release.notify_one();
        transfer.await.unwrap().unwrap();
        competitor.await.unwrap();
        assert_eq!(
            accounts[0]
                .balance(request(&refs[1], b::BalanceRequest {}, false))
                .await
                .unwrap()
                .get_ref()
                .balance,
            61
        );
        assert_eq!(
            accounts[1]
                .balance(request(&refs[2], b::BalanceRequest {}, false))
                .await
                .unwrap()
                .get_ref()
                .balance,
            40
        );
        assert!(
            sidecar
                .controls
                .lock()
                .unwrap()
                .iter()
                .all(|(_, t, _)| t == "bank.v1.Account"),
            "read-only shared root never emits native actor-only control"
        );
        let _ = stop.send(());
        let shutdown_result = server.await.unwrap();
        eprintln!(
            "SHARED_ROOT_SHUTDOWN scenario={scenario} missing={missing}: {shutdown_result:?}"
        );
        shutdown_result.unwrap();
        return;
    }
    if scenario == 10 {
        accounts[2]
            .deposit(request(&refs[3], b::DepositRequest { amount: 100 }, true))
            .await
            .unwrap();
        let (entered, mut entries) = tokio::sync::mpsc::unbounded_channel();
        let first = Arc::new(Park {
            entered: entered.clone(),
            release: tokio::sync::Notify::new(),
        });
        let second = Arc::new(Park {
            entered,
            release: tokio::sync::Notify::new(),
        });
        let a = root_adapter.clone();
        let x = refs.clone();
        let park = first.clone();
        let one = tokio::spawn(async move {
            PARK.scope(
                park,
                a.transfer(request(
                    &x[0],
                    p::TransferRequest {
                        from: x[1].clone(),
                        to: x[2].clone(),
                        amount: 40,
                        scenario: 10,
                    },
                    false,
                )),
            )
            .await
        });
        tokio::time::timeout(std::time::Duration::from_secs(5), entries.recv())
            .await
            .unwrap()
            .unwrap();
        let a = root_adapter.clone();
        let x = refs.clone();
        let park = second.clone();
        let two = tokio::spawn(async move {
            PARK.scope(
                park,
                a.transfer(request(
                    &x[0],
                    p::TransferRequest {
                        from: x[3].clone(),
                        to: x[4].clone(),
                        amount: 40,
                        scenario: 10,
                    },
                    false,
                )),
            )
            .await
        });
        tokio::time::timeout(std::time::Duration::from_secs(5), entries.recv())
            .await
            .unwrap()
            .unwrap();
        // Both root handlers share the SAME root actor while retaining different
        // actual account writer leases. An exclusive root substitution fails here.
        let mut competitor =
            Box::pin(accounts[0].deposit(request(&refs[1], b::DepositRequest { amount: 1 }, true)));
        assert!(
            tokio::time::timeout(std::time::Duration::from_millis(100), &mut competitor)
                .await
                .is_err(),
            "retained account cannot be independently mutated"
        );
        // A fifth existing actor is independent of both held root cohorts.
        accounts[4]
            .open(request(
                &refs[5],
                b::OpenRequest {
                    customer_name: "independent".into(),
                },
                true,
            ))
            .await
            .unwrap();
        tokio::time::timeout(
            std::time::Duration::from_secs(2),
            accounts[4].deposit(request(&refs[5], b::DepositRequest { amount: 9 }, true)),
        )
        .await
        .unwrap()
        .unwrap();
        first.release.notify_one();
        second.release.notify_one();
        one.await.unwrap().unwrap();
        two.await.unwrap().unwrap();
        competitor.await.unwrap();
        for (i, expected) in [61, 40, 60, 40, 9].into_iter().enumerate() {
            assert_eq!(
                accounts[i]
                    .balance(request(&refs[i + 1], b::BalanceRequest {}, false))
                    .await
                    .unwrap()
                    .get_ref()
                    .balance,
                expected
            );
        }
        let _ = stop.send(());
        let shutdown_result = server.await.unwrap();
        eprintln!(
            "SHARED_ROOT_SHUTDOWN scenario={scenario} missing={missing}: {shutdown_result:?}"
        );
        shutdown_result.unwrap();
        return;
    }
    let destination = if missing {
        refs[5].clone()
    } else {
        refs[if same { 1 } else { 2 }].clone()
    };
    let receiver: Arc<dyn b::account_methods_server::AccountMethods + Send + Sync> =
        Arc::new(accounts[0].clone());
    let result = tokio::time::timeout(
        std::time::Duration::from_secs(10),
        SPOOF_RECEIVER.scope(
            receiver,
            root_adapter.transfer(request(
                &refs[0],
                p::TransferRequest {
                    from: refs[1].clone(),
                    to: destination,
                    amount: 40,
                    scenario,
                },
                false,
            )),
        ),
    )
    .await
    .unwrap();
    assert_eq!(
        handler_entries.load(std::sync::atomic::Ordering::SeqCst),
        1,
        "root authorization rejection is not scenario acceptance"
    );
    if missing || scenario == 1 {
        assert_eq!(
            successful_withdrawals.load(std::sync::atomic::Ordering::SeqCst),
            1,
            "Abort proof requires the first actual Account mutation to have succeeded"
        );
    }
    if scenario == 38 {
        assert_eq!(
            successful_withdrawals.load(std::sync::atomic::Ordering::SeqCst),
            1
        );
    }
    if missing || matches!(scenario, 1 | 21 | 22) {
        assert!(result.is_err());
    } else {
        result.unwrap();
    }
    let controls = sidecar.controls.lock().unwrap()[control_offset..].to_vec();
    assert!(
        controls.iter().all(|(_, t, _)| t == "bank.v1.Account"),
        "root read-only cleanup is local-only"
    );
    if !missing && !matches!(scenario, 1 | 20 | 21 | 22) {
        let prepared = controls
            .iter()
            .filter(|(verb, _, _)| *verb == "prepare")
            .map(|(_, _, r)| r.clone())
            .collect::<std::collections::BTreeSet<_>>();
        assert_eq!(
            prepared.len(),
            if same { 1 } else { 2 },
            "de-duplicated real native writable membership"
        );
        if scenario == 38 {
            let commits = controls
                .iter()
                .filter(|(verb, _, _)| *verb == "commit")
                .map(|(_, _, r)| r.clone())
                .collect::<std::collections::BTreeSet<_>>();
            assert_eq!(
                commits, prepared,
                "public clone/nested take preserves final native Commit membership"
            );
            assert_eq!(
                controls
                    .iter()
                    .filter(|(verb, _, _)| *verb == "commit")
                    .count(),
                2
            );
        }
    }
    let expected = if scenario == 3 {
        [80, 0]
    } else if missing || matches!(scenario, 1 | 20 | 21 | 22) || same {
        [100, 0]
    } else {
        [60, 40]
    };
    for i in 0..2 {
        assert_eq!(
            accounts[i]
                .balance(request(&refs[i + 1], b::BalanceRequest {}, false))
                .await
                .unwrap()
                .get_ref()
                .balance,
            expected[i]
        );
    }
    let _ = stop.send(());
    let shutdown_result = server.await.unwrap();
    if missing || scenario == 22 {
        // A non-declared dispatched rejection (or unsupported routing) has no
        // successful terminal receipt. Do not erase unknown membership merely
        // because known Account balances are unchanged.
        assert!(root_adapter.require_local_host_ready().is_err());
        match shutdown_result {
            Err(reboot::application_host::ApplicationHostError::RecoveryTask(status)) => {
                assert_eq!(status.code(), tonic::Code::FailedPrecondition);
                assert_eq!(
                    status.message(),
                    "late enlistment retained; explicit cleanup is incomplete"
                );
            }
            other => panic!("uncertain membership must fail the host: {other:?}"),
        }
        let final_controls = sidecar.controls.lock().unwrap()[control_offset..].to_vec();
        assert!(!final_controls.iter().any(|(verb, _, _)| *verb == "commit"));
        if missing {
            assert!(
                final_controls
                    .iter()
                    .any(|(verb, kind, reference)| *verb == "abort"
                        && kind == "bank.v1.Account"
                        && reference == &refs[1]),
                "the acknowledged first Account mutation needs an actual Abort ACK"
            );
        } else {
            assert!(
                final_controls.is_empty(),
                "remote rejection before resolve cannot invent actor-native controls"
            );
        }
    } else {
        shutdown_result.unwrap();
    }
    drop(accounts);
    drop(root_adapter);
    drop(store);
    drop(participants);
    drop(coordinators);
    drop(sidecar);
    drop(coordinator_sidecar);
    drop(resolver);
    native.restart();
    let store = DatabaseActorStore::connect(&native.endpoint).await.unwrap();
    let inspector =
        account::AccountMethodsDatabaseAdapter::new(store, Account).with_authorization(policy);
    for i in 0..2 {
        assert_eq!(
            inspector
                .balance(request(&refs[i + 1], b::BalanceRequest {}, false))
                .await
                .unwrap()
                .get_ref()
                .balance,
            expected[i],
            "real RocksDB restart"
        );
    }
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
#[ignore = "canonical CXX Database required"]
async fn shared_existing_writer_accounts_commit_restart() {
    run_case(false, 0, false).await;
}
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
#[ignore = "canonical CXX Database required"]
async fn shared_existing_writer_same_account_commit_restart() {
    run_case(true, 0, false).await;
}
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
#[ignore = "canonical CXX Database required"]
async fn shared_existing_writer_explicit_abort_restart() {
    run_case(false, 1, false).await;
}
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
#[ignore = "canonical CXX Database required"]
async fn shared_existing_writer_missing_second_target_abort_restart() {
    run_case(false, 0, true).await;
}
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
#[ignore = "canonical CXX Database required"]
async fn shared_existing_writer_rollback_reupgrade_restart() {
    run_case(false, 2, false).await;
}
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
#[ignore = "canonical CXX Database required"]
async fn shared_existing_writer_n1_success_n2_fail_n3_success_restart() {
    run_case(true, 3, false).await;
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
#[ignore = "canonical CXX Database required"]
async fn shared_existing_writer_shared_root_cohorts_and_independent_accounts() {
    run_case(false, 10, false).await;
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
#[ignore = "canonical CXX Database required"]
async fn shared_existing_writer_held_native_prepare_ack_retains_account_not_independent_account() {
    run_case(false, 11, false).await;
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
#[ignore = "canonical CXX Database required"]
async fn shared_existing_writer_spoofed_inbound_metadata_is_not_authority() {
    run_case(false, 20, false).await;
}
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
#[ignore = "canonical CXX Database required"]
async fn shared_existing_writer_root_self_call_rejected() {
    run_case(false, 21, false).await;
}
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
#[ignore = "canonical CXX Database required"]
async fn shared_existing_writer_remote_writer_rejected_before_resolve() {
    run_case(false, 22, false).await;
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
#[ignore = "canonical CXX Database required"]
async fn shared_existing_writer_lost_decision_ack_after_readonly_root_local_prepare_fails_host() {
    run_case(false, 12, false).await;
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
#[ignore = "canonical CXX Database required"]
async fn shared_existing_writer_lost_account_native_prepare_ack_retains_peer_exclusion() {
    run_case(false, 13, false).await;
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
#[ignore = "canonical CXX Database required"]
async fn shared_existing_writer_lost_account_native_terminal_ack_retains_peer_exclusion() {
    run_case(false, 14, false).await;
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
#[ignore = "canonical CXX Database required"]
async fn shared_existing_writer_populated_clone_nested_take_commit_restart() {
    run_case(false, 38, false).await;
}
