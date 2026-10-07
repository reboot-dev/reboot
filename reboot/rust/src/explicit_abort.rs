//! Bounded host ownership of explicit, confirmed pre-handoff Abort work.
//! No retries: an actor-only terminal RPC with a lost ACK is not safe to repeat.
use crate::{
    application_host::{HostRecovery, RecoveryCancellation},
    durable_coordinator::{CoordinatorSidecar, DurableRootCoordinator, ParticipantResolver},
    durable_participant::{ParticipantSidecar, StartedLocalTransaction},
    runtime::TransactionContext,
};
use std::{
    future::Future,
    pin::Pin,
    sync::{Arc, Mutex},
};
use tokio::sync::{OwnedSemaphorePermit, Semaphore, mpsc, oneshot};
use tokio::task::JoinSet;
use tonic::Status;
type Work = Pin<Box<dyn Future<Output = Result<(), Status>> + Send>>;
struct Job {
    work: Work,
    reply: oneshot::Sender<Result<(), Status>>,
    _permit: OwnedSemaphorePermit,
}
struct State {
    active: bool,
    receiver: Option<mpsc::Receiver<Job>>,
    registered_roots: std::collections::HashSet<uuid::Uuid>,
}
#[derive(Clone)]
pub struct ExplicitAbortOwner {
    sender: mpsc::Sender<Job>,
    state: Arc<Mutex<State>>,
    capacity: Arc<Semaphore>,
    timeout: std::time::Duration,
    failure: tokio::sync::watch::Sender<Option<Status>>,
}
pub struct ExplicitAbortRecovery {
    owner: ExplicitAbortOwner,
}
struct Active(Arc<Mutex<State>>);
impl Drop for Active {
    fn drop(&mut self) {
        self.0.lock().unwrap().active = false;
    }
}
impl ExplicitAbortOwner {
    pub fn new(capacity: usize) -> Result<Self, Status> {
        if capacity == 0 || capacity > 1024 {
            return Err(Status::invalid_argument(
                "explicit Abort capacity must be 1..=1024",
            ));
        }
        let (sender, receiver) = mpsc::channel(capacity);
        Ok(Self {
            sender,
            state: Arc::new(Mutex::new(State {
                active: false,
                receiver: Some(receiver),
                registered_roots: Default::default(),
            })),
            capacity: Arc::new(Semaphore::new(capacity)),
            timeout: std::time::Duration::from_secs(30),
            failure: tokio::sync::watch::channel(None).0,
        })
    }
    pub fn with_timeout(mut self, timeout: std::time::Duration) -> Result<Self, Status> {
        if timeout.is_zero() || timeout > std::time::Duration::from_secs(300) {
            return Err(Status::invalid_argument(
                "explicit Abort timeout must be nonzero and <=300 seconds",
            ));
        }
        self.timeout = timeout;
        Ok(self)
    }
    #[cfg(test)]
    pub(crate) fn fail_for_test(&self) {
        self.failure
            .send_replace(Some(Status::unavailable("test sticky owner failure")));
    }

    pub fn recovery_registration(&self) -> ExplicitAbortRecovery {
        ExplicitAbortRecovery {
            owner: self.clone(),
        }
    }
    /// Reserve before sealing. Once sealed, transfer has no further await; queued
    /// work owns a disarmed incarnation even if shutdown drops it without polling.
    pub async fn abort<P: ParticipantSidecar, C: CoordinatorSidecar, R: ParticipantResolver>(
        &self,
        mut local: StartedLocalTransaction<P>,
        context: TransactionContext,
        coordinator: DurableRootCoordinator<C, R>,
    ) -> Result<(), Status> {
        let permit = match self.capacity.clone().try_acquire_owned() {
            Ok(permit) => permit,
            Err(_) => {
                local.handoff_to_durable_recovery();
                self.failure.send_replace(Some(Status::resource_exhausted(
                    "explicit Abort admission failed; ownership retained",
                )));
                return Err(Status::resource_exhausted(
                    "explicit Abort owner is full; ownership retained",
                ));
            }
        };
        if !self.state.lock().unwrap().active {
            local.handoff_to_durable_recovery();
            return Err(Status::failed_precondition(
                "explicit Abort owner is not registered and active; ownership retained",
            ));
        }
        let work = match coordinator.own_explicit_abort(local, context).await {
            Ok(work) => work,
            Err(error) => {
                self.failure.send_replace(Some(error.clone()));
                return Err(error);
            }
        };
        let (reply, observer) = oneshot::channel();
        {
            let state = self.state.lock().unwrap();
            if !state.active {
                return Err(Status::unavailable(
                    "explicit Abort host stopped; ownership retained",
                ));
            }
            self.sender
                .try_send(Job {
                    work,
                    reply,
                    _permit: permit,
                })
                .map_err(|_| {
                    Status::unavailable("explicit Abort host stopped; ownership retained")
                })?;
        }
        #[cfg(feature = "test-support")]
        let _observer_drop = ObserverDrop::new();
        observer.await.map_err(|_| {
            Status::unavailable("explicit Abort stopped before ACK; ownership retained")
        })?
    }
}
/// Pre-Load execution registration, separate from an admitted actor token.
/// Dropping an unfinished Load never fabricates local participant authority.
pub struct RegisteredRoot<C: CoordinatorSidecar, R: ParticipantResolver> {
    context: TransactionContext,
    coordinator: DurableRootCoordinator<C, R>,
    reservation: Option<(ExplicitAbortOwner, OwnedSemaphorePermit)>,
    token: Option<RootRegistrationToken>,
}
struct RootRegistrationToken {
    owner: ExplicitAbortOwner,
    root: uuid::Uuid,
}
impl Drop for RootRegistrationToken {
    fn drop(&mut self) {
        self.owner
            .state
            .lock()
            .unwrap()
            .registered_roots
            .remove(&self.root);
    }
}
impl<C: CoordinatorSidecar, R: ParticipantResolver> RegisteredRoot<C, R> {
    pub fn before_load<P: ParticipantSidecar>(
        participant: &crate::durable_participant::DurableActorParticipant<P>,
        context: TransactionContext,
        coordinator: DurableRootCoordinator<C, R>,
        owner: Option<&ExplicitAbortOwner>,
    ) -> Result<Self, Status> {
        let mut registered = Self {
            context,
            coordinator,
            reservation: None,
            token: None,
        };
        if registered.context.is_fresh_root()
            && registered.context.mode() == crate::runtime::TransactionMode::Exclusive
            && registered.context.headers().idempotency_key.is_none()
            && let Some(owner) = owner
        {
            registered
                .coordinator
                .validate_root_registration(participant, &registered.context)?;
            let permit = owner
                .capacity
                .clone()
                .try_acquire_owned()
                .map_err(|_| Status::resource_exhausted("registered root owner is full"))?;
            let mut state = owner.state.lock().unwrap();
            if !state.active || owner.failure.borrow().is_some() {
                return Err(Status::failed_precondition(
                    "registered root owner is not active",
                ));
            }
            let root = registered.context.transaction_root_id();
            if !state.registered_roots.insert(root) {
                return Err(Status::failed_precondition(
                    "root execution already registered",
                ));
            }
            #[cfg(feature = "test-support")]
            if let Some(path) = std::env::var_os("REBOOT_TEST_REGISTERED_LOAD_PENDING") {
                std::fs::write(
                    std::path::PathBuf::from(path).with_extension("registered"),
                    b"root registered before start_owned Load",
                )
                .unwrap();
            }
            registered.token = Some(RootRegistrationToken {
                owner: owner.clone(),
                root,
            });
            registered.reservation = Some((owner.clone(), permit));
        }
        Ok(registered)
    }

    pub async fn admitted<P: ParticipantSidecar>(
        mut self,
        mut local: StartedLocalTransaction<P>,
    ) -> Result<RootHandlerGuard<P, C, R>, Status> {
        if let Some((owner, _)) = &self.reservation {
            self.coordinator
                .validate_explicit_abort(&local, &self.context)?;
            local.reserve_registered_execution(&self.context).await?;
            if !owner.state.lock().unwrap().active || owner.failure.borrow().is_some() {
                local.handoff_to_durable_recovery();
                return Err(Status::unavailable(
                    "registered root host stopped during admission",
                ));
            }
        }
        Ok(RootHandlerGuard {
            local: Some(local),
            context: self.context.clone(),
            coordinator: self.coordinator.clone(),
            reservation: self.reservation.take(),
            registration: self.token.take(),
            inbound: None,
        })
    }
}

/// Generated pre-handler lifetime. An attached active owner reserves capacity
/// before effects; cancellation submits directly, never recursively queues work.
/// The awaited handler temporary drops before this enclosing lifetime does.
pub struct RootHandlerGuard<P: ParticipantSidecar, C: CoordinatorSidecar, R: ParticipantResolver> {
    local: Option<StartedLocalTransaction<P>>,
    context: TransactionContext,
    coordinator: DurableRootCoordinator<C, R>,
    reservation: Option<(ExplicitAbortOwner, OwnedSemaphorePermit)>,
    registration: Option<RootRegistrationToken>,
    inbound: Option<(
        crate::live_participant::Reservation,
        crate::durable_participant::LiveExecution<P>,
    )>,
}
impl<P: ParticipantSidecar, C: CoordinatorSidecar, R: ParticipantResolver>
    RootHandlerGuard<P, C, R>
{
    #[doc(hidden)]
    pub async fn before_handler(
        mut local: StartedLocalTransaction<P>,
        context: TransactionContext,
        coordinator: DurableRootCoordinator<C, R>,
        owner: Option<&ExplicitAbortOwner>,
    ) -> Result<Self, Status> {
        let reservation = if local.cancellation_eligible(&context)
            && let Some(owner) = owner
        {
            // Rejection here is pre-effect and leaves ordinary local Drop armed.
            let permit =
                owner.capacity.clone().try_acquire_owned().map_err(|_| {
                    Status::resource_exhausted("handler cancellation owner is full")
                })?;
            if !owner.state.lock().unwrap().active || owner.failure.borrow().is_some() {
                return Err(Status::failed_precondition(
                    "handler cancellation owner is not active",
                ));
            }
            coordinator.validate_explicit_abort(&local, &context)?;
            local.reserve_handler_cancellation(&context).await?;
            // Incarnation validation awaited the participant mutex. Host authority
            // must still be live before granting permission for handler effects.
            let state = owner.state.lock().unwrap();
            if !state.active || owner.failure.borrow().is_some() {
                local.handoff_to_durable_recovery();
                return Err(Status::unavailable(
                    "handler cancellation owner stopped during admission; ownership retained",
                ));
            }
            Some((owner.clone(), permit))
        } else {
            None
        };
        Ok(Self {
            local: Some(local),
            context,
            coordinator,
            reservation,
            registration: None,
            inbound: None,
        })
    }
    #[doc(hidden)]
    pub async fn with_live_inbound(
        mut self,
        context: &mut TransactionContext,
        owner: Option<&crate::live_participant::LiveParticipantOwner>,
    ) -> Result<Self, Status> {
        if !context.is_fresh_root()
            && let Some(owner) = owner
        {
            if !context.same_ownership_context(&self.context) {
                return Err(Status::failed_precondition(
                    "live execution context differs from guard",
                ));
            }
            context.enforce_live_leaf()?;
            self.context = context.clone();
            let reservation = owner.reserve(context)?;
            let execution = self
                .local
                .as_mut()
                .unwrap()
                .reserve_live_execution(context)
                .await?;
            self.inbound = Some((reservation, execution));
            self.inbound.as_ref().unwrap().0.validate_active()?;
        }
        Ok(self)
    }
    /// Explicit tree opt-in is not ownership: reserve and install actual execution first.
    #[doc(hidden)]
    pub async fn with_supervised_tree(
        mut self,
        context: &mut TransactionContext,
        owner: Option<&crate::live_participant::LiveParticipantOwner>,
    ) -> Result<Self, Status> {
        if !context.same_ownership_context(&self.context) {
            return Err(Status::failed_precondition(
                "tree context differs from guard",
            ));
        }
        context.validate_tree_scope()?;
        if context.is_fresh_root() {
            if self.registration.is_none() || self.reservation.is_none() {
                return Err(Status::failed_precondition(
                    "tree requires active registered root execution",
                ));
            }
            let token = self.registration.as_ref().unwrap();
            let state = token.owner.state.lock().unwrap();
            if !state.active
                || token.owner.failure.borrow().is_some()
                || !state
                    .registered_roots
                    .contains(&context.transaction_root_id())
            {
                return Err(Status::unavailable("registered tree root owner stopped"));
            }
        } else {
            let owner = owner.ok_or_else(|| {
                Status::failed_precondition("tree requires live participant owner")
            })?;
            let reservation = owner.reserve(context)?;
            let execution = self
                .local
                .as_mut()
                .unwrap()
                .reserve_live_execution(context)
                .await?;
            self.inbound = Some((reservation, execution));
            self.inbound.as_ref().unwrap().0.validate_active()?;
        }
        context.enable_supervised_tree()?;
        self.context = context.clone();
        Ok(self)
    }

    /// Seal descendants and encode the local plus transitive participant union.
    #[doc(hidden)]
    pub fn inbound_participant_metadata(
        &self,
        local: crate::durable_coordinator::ParticipantTarget,
        read_only: bool,
    ) -> Result<crate::successful_trailers::ParticipantMetadata, Status> {
        let mut returned = if self.context.tree_owned() {
            self.context.seal_explicit_abort()?
        } else {
            Vec::new()
        };
        returned.push(crate::durable_coordinator::ReturnedParticipant {
            target: local,
            read_only,
        });
        crate::successful_trailers::ParticipantMetadata::classified_aggregate(
            &returned,
            self.context.headers().coordinator_read_only_aware,
        )
        .map_err(|error| Status::failed_precondition(error.to_string()))
    }

    /// Consuming rollback keeps the exact reserved Watch obligation through return.
    #[doc(hidden)]
    pub async fn rollback_declared_leaf(self, mut status: Status) -> Result<Status, Status> {
        self.context.validate_rollback_leaf_branch()?;
        let (reservation, _) = self.inbound.as_ref().ok_or_else(|| {
            Status::failed_precondition("rollback requires active reserved Watch")
        })?;
        reservation.validate_active()?;
        let metadata = crate::successful_trailers::ParticipantMetadata::classified_single(
            &self.coordinator_state_type_for_leaf(),
            &self.context.headers().state_ref,
            true,
            true,
        )
        .map_err(|error| Status::failed_precondition(error.to_string()))?;
        self.local
            .as_ref()
            .unwrap()
            .rollback_declared_leaf(&self.context)
            .await?;
        reservation.validate_active()?;
        metadata.attach_to_status(&mut status);
        #[cfg(feature = "test-support")]
        if let Ok(vector) = std::env::var("REBOOT_TEST_ROLLBACK_ERROR_VECTOR") {
            use crate::successful_trailers::{
                TRANSACTION_PARTICIPANTS_HEADER as WRITERS,
                TRANSACTION_PARTICIPANTS_READ_ONLY_HEADER as READERS,
            };
            match vector.as_str() {
                "missing" => {
                    status.metadata_mut().remove(READERS);
                }
                "malformed" => {
                    status
                        .metadata_mut()
                        .insert(READERS, "not-json".parse().unwrap());
                }
                "writer" => {
                    let value = status.metadata_mut().remove(READERS).unwrap();
                    status.metadata_mut().insert(WRITERS, value);
                }
                "foreign" => {
                    status.metadata_mut().insert(
                        READERS,
                        "{\"foreign.Actor\":[\"foreign\"]}".parse().unwrap(),
                    );
                }
                "wrong-type" => {
                    status
                        .metadata_mut()
                        .insert(READERS, "{\"foreign.Actor\":[\"target\"]}".parse().unwrap());
                }
                "malformed-rich" => {
                    status = Status::with_details(
                        tonic::Code::Unknown,
                        "malformed rich",
                        vec![0xff].into(),
                    )
                }
                "unknown" => {
                    status = crate::declared_error_status(
                        tonic::Code::Unknown,
                        "unknown declared",
                        "type.googleapis.com/foreign.Unknown",
                        &crate::database_proto::NotFound {},
                    )
                }
                "wrong-ref" => {
                    status.metadata_mut().insert(
                        READERS,
                        "{\"tests.reboot.protoc.TransactionCounter\":[\"wrong-ref\"]}"
                            .parse()
                            .unwrap(),
                    );
                }
                "extra" => {
                    status.metadata_mut().insert(
                        READERS,
                        "{\"tests.reboot.protoc.TransactionCounter\":[\"target\",\"extra\"]}"
                            .parse()
                            .unwrap(),
                    );
                }
                "overlap" => {
                    let value = status.metadata().get(READERS).unwrap().clone();
                    status.metadata_mut().insert(WRITERS, value);
                }
                "multiple" | "conflict" => {
                    use prost::Message;
                    let mut rich = crate::declared_error_details(&status).unwrap().unwrap();
                    if vector == "multiple" {
                        rich.details.push(rich.details[0].clone());
                    } else {
                        rich.code = tonic::Code::InvalidArgument as i32;
                    }
                    status = Status::with_details(
                        tonic::Code::Unknown,
                        rich.message.clone(),
                        rich.encode_to_vec().into(),
                    );
                }
                "system" => {
                    status = crate::SystemAborted::NotFound(crate::database_proto::NotFound {})
                        .into_status("system after rollback")
                }
                "transport" => status = Status::unavailable("transport after rollback"),
                _ => return Err(Status::invalid_argument("unknown rollback test vector")),
            }
        }
        self.finish_inbound()?;
        Ok(status)
    }

    fn coordinator_state_type_for_leaf(&self) -> String {
        self.local.as_ref().unwrap().actor_state_type().to_owned()
    }

    pub fn cancellation_owned(&self) -> bool {
        self.reservation.is_some()
    }
    /// Task eligibility comes from the exact admitted live execution and its
    /// reserved Watch obligation, never from a builder or caller-supplied flag.
    /// Descendant attempts doom the context and cannot regain this authority.
    #[doc(hidden)]
    pub fn live_leaf_tasks_owned(&self) -> Result<bool, Status> {
        let Some((reservation, _execution)) = &self.inbound else {
            return Ok(false);
        };
        reservation.validate_active()?;
        if self.context.tree_owned() {
            return Ok(false);
        }
        if let Some(error) = self.context.doomed_status() {
            return Err(error);
        }
        Ok(true)
    }
    /// Tree task authority is the exact registered root or reserved inbound
    /// execution, composed with the actual dispatcher store and actor gate.
    #[doc(hidden)]
    pub async fn validate_tree_tasks(
        &self,
        tasks: &crate::one_shot_tasks::OneShotTasks,
    ) -> Result<(), Status> {
        if !self.context.tree_owned() {
            return Err(Status::failed_precondition("tree task authority missing"));
        }
        self.context.validate_open_task_branch()?;
        if self.context.is_fresh_root() {
            let token = self
                .registration
                .as_ref()
                .ok_or_else(|| Status::failed_precondition("tree tasks require registered root"))?;
            if self.reservation.is_none() {
                return Err(Status::failed_precondition("tree task reservation missing"));
            }
            let state = token.owner.state.lock().unwrap();
            if !state.active
                || token.owner.failure.borrow().is_some()
                || !state
                    .registered_roots
                    .contains(&self.context.transaction_root_id())
            {
                return Err(Status::unavailable("tree task root owner stopped"));
            }
        } else {
            let (reservation, _) = self
                .inbound
                .as_ref()
                .ok_or_else(|| Status::failed_precondition("tree tasks require reserved Watch"))?;
            reservation.validate_active()?;
        }
        tasks
            .validate_guard_execution(
                self.local
                    .as_ref()
                    .ok_or_else(|| Status::failed_precondition("tree execution closed"))?,
                &self.context,
            )
            .await?;
        // Recheck host authority after the incarnation mutex await.
        if let Some((reservation, _)) = &self.inbound {
            reservation.validate_active()?;
        }
        if let Some(token) = &self.registration {
            let state = token.owner.state.lock().unwrap();
            if !state.active
                || token.owner.failure.borrow().is_some()
                || !state
                    .registered_roots
                    .contains(&self.context.transaction_root_id())
            {
                return Err(Status::unavailable("tree task root owner stopped"));
            }
        }
        self.context.validate_open_task_branch()
    }

    /// Successful completion must also prove quiescence and known membership.
    /// The caller immediately performs synchronous durable handoff afterwards.
    pub(crate) fn seal_for_handoff(
        &self,
    ) -> Result<Option<Vec<crate::durable_coordinator::ReturnedParticipant>>, Status> {
        if self.reservation.is_some() {
            let returned = self.context.seal_explicit_abort()?;
            if returned.len() > 1024 {
                return Err(Status::resource_exhausted(
                    "handler participant limit exceeded",
                ));
            }
            Ok(Some(returned))
        } else {
            Ok(None)
        }
    }

    /// Atomic pre-durable handoff: no await between revoking cancellation
    /// authority and handing off the local transaction. Never Abort a durable root.
    fn handoff_to_durable_recovery(&mut self) {
        self.local.as_mut().unwrap().handoff_to_durable_recovery();
    }
    /// Only an acknowledged successful completion releases durable uncertainty.
    fn completed(&mut self) -> Result<(), Status> {
        if !self
            .local
            .as_ref()
            .is_some_and(|local| local.was_handed_off())
        {
            let error = Status::failed_precondition("completion requires durable handoff");
            if let Some((owner, _)) = &self.reservation {
                owner.failure.send_replace(Some(error.clone()));
            }
            return Err(error);
        }
        self.reservation.take();
        Ok(())
    }
    /// Consuming completion owns the only public handoff path. Membership is
    /// sealed here, and the reservation is released only after actual coordinator
    /// success. Dropping this future after handoff reports fatal uncertainty.
    pub async fn complete_root(
        mut self,
        start: crate::durable_coordinator::RootCoordinatorStart,
        mut returned: Vec<crate::durable_coordinator::ReturnedParticipant>,
    ) -> Result<(), Status> {
        if let Some(status) = self.context.doomed_status() {
            return Err(status);
        }
        if self.inbound.is_some() || self.context.transaction_ids().len() != 1 {
            return Err(Status::failed_precondition(
                "inbound branch cannot drive root completion",
            ));
        }
        if start.transaction_ids != self.context.transaction_ids()
            || start.coordinator_state_type != self.context.transaction_coordinator_state_type()
            || start.coordinator_state_ref != self.context.transaction_coordinator_state_ref()
            || start.participant.state_type != self.context.transaction_coordinator_state_type()
            || start.participant.state_ref != self.context.headers().state_ref
            || start.mode != self.context.mode()
            || (self.reservation.is_some()
                && (start.mode != crate::runtime::TransactionMode::Exclusive
                    || start.read_only
                    || start.factory
                    || start.placement_requested))
        {
            return Err(Status::failed_precondition(
                "root completion does not match admitted cancellation authority",
            ));
        }
        if let Some(sealed) = self.seal_for_handoff()? {
            returned = sealed;
        }
        if self.registration.is_some() {
            self.local.as_ref().unwrap().end_execution().await?;
        }
        self.handoff_to_durable_recovery();
        self.context.take_returned_participants();
        self.coordinator
            .complete_with_classified_returned_participants(start, returned)
            .await?;
        self.completed()
    }

    #[doc(hidden)]
    pub async fn before_inbound_response(&self) -> Result<(), Status> {
        #[cfg(feature = "test-support")]
        if self.inbound.is_some()
            && let Some(path) = std::env::var_os("REBOOT_TEST_LIVE_INBOUND_RESPONSE")
        {
            self.local
                .as_ref()
                .unwrap()
                .assert_staged_for_test()
                .await?;
            struct Dropped(std::path::PathBuf);
            impl Drop for Dropped {
                fn drop(&mut self) {
                    std::fs::write(
                        self.0.with_extension("future-dropped"),
                        b"actual staged response future dropped",
                    )
                    .unwrap();
                }
            }
            let path = std::path::PathBuf::from(path);
            std::fs::write(&path, b"actual remote staging completed; trailers not sent").unwrap();
            let _drop = Dropped(path);
            if std::env::var_os("REBOOT_TEST_LIVE_INBOUND_RESPONSE_ERROR").is_some() {
                return Err(Status::unavailable(
                    "lost successful trailers after real staging",
                ));
            }
            std::future::pending::<()>().await;
        }
        Ok(())
    }

    /// Legacy unsupported/inbound paths cannot discard a supported root's owner.
    pub fn finish_inbound(mut self) -> Result<(), Status> {
        if self.reservation.is_some() {
            return Err(Status::failed_precondition(
                "owned root cannot complete as inbound",
            ));
        }
        self.handoff_to_durable_recovery();
        Ok(())
    }

    pub async fn abort_local(mut self) -> Result<(), Status> {
        if self.inbound.is_some() {
            return Ok(());
        }
        if self.reservation.is_some() {
            return self.abort_explicit().await;
        }
        self.local.as_mut().unwrap().abort_legacy().await
    }

    #[cfg(test)]
    pub(crate) fn test_handoff(&mut self) {
        self.handoff_to_durable_recovery();
    }
    #[cfg(test)]
    pub(crate) fn test_completed(&mut self) -> Result<(), Status> {
        self.completed()
    }

    #[doc(hidden)]
    pub async fn abort_explicit(mut self) -> Result<(), Status> {
        if self
            .local
            .as_ref()
            .is_some_and(|local| local.was_handed_off())
        {
            // Drop reports durable uncertainty; never enqueue Abort after handoff.
            return Err(Status::failed_precondition(
                "Abort requires pre-handoff ownership",
            ));
        }
        let local = self.local.take().unwrap();
        if let Some((owner, permit)) = self.reservation.take() {
            let observer = owner.submit_reserved(
                local,
                self.context.clone(),
                self.coordinator.clone(),
                permit,
                self.registration.take(),
            )?;
            #[cfg(feature = "test-support")]
            let _observer_drop = ObserverDrop::new();
            observer.await.map_err(|_| {
                Status::unavailable("explicit Abort stopped before ACK; ownership retained")
            })?
        } else {
            let mut local = local;
            self.coordinator
                .abort_explicit_root_before_handoff(&mut local, &self.context)
                .await
        }
    }
}
impl<P: ParticipantSidecar, C: CoordinatorSidecar, R: ParticipantResolver> Drop
    for RootHandlerGuard<P, C, R>
{
    fn drop(&mut self) {
        if let Some((reservation, execution)) = self.inbound.take() {
            self.context.close_branch();
            let context = self.context.clone();
            let watch = reservation.endpoint();
            reservation.submit(Box::pin(async move {
                context.wait_branch_quiescent().await;
                execution.watch(watch).await
            }));
        }
        if let Some((owner, permit)) = self.reservation.take() {
            if self
                .local
                .as_ref()
                .is_some_and(|local| local.was_handed_off())
            {
                owner.failure.send_replace(Some(Status::unavailable(
                    "root cancelled or failed after durable handoff; ownership retained",
                )));
                return;
            }
            let local = self.local.take().unwrap();
            let _ = owner.submit_reserved(
                local,
                self.context.clone(),
                self.coordinator.clone(),
                permit,
                self.registration.take(),
            );
            #[cfg(feature = "test-support")]
            drop(ObserverDrop::new());
        }
    }
}
impl ExplicitAbortOwner {
    fn submit_reserved<P: ParticipantSidecar, C: CoordinatorSidecar, R: ParticipantResolver>(
        &self,
        local: StartedLocalTransaction<P>,
        context: TransactionContext,
        coordinator: DurableRootCoordinator<C, R>,
        permit: OwnedSemaphorePermit,
        registration: Option<RootRegistrationToken>,
    ) -> Result<oneshot::Receiver<Result<(), Status>>, Status> {
        // CLOSE synchronously, before queue transfer or any worker await.
        // Unknown/active scopes remain unknown and cannot authorize Commit.
        if local.was_handed_off() {
            let error = Status::unavailable(
                "registered cleanup cannot Abort after durable handoff; ownership retained",
            );
            self.failure.send_replace(Some(error.clone()));
            return Err(error);
        }
        let registered = registration.is_some();
        if registered && let Err(error) = context.close_for_abandonment() {
            // Never silently release a reserved owner when closure fails.
            self.failure.send_replace(Some(error.clone()));
            return Err(error);
        }
        // Own the disarmed capability even before the worker's first poll.
        let work = Box::pin(async move {
            let _registration = registration;
            if registered {
                context.wait_branch_quiescent().await;
                local.end_execution().await?;
            }
            let work = if registered {
                coordinator
                    .own_registered_abandonment(local, context)
                    .await?
            } else {
                coordinator.own_explicit_abort(local, context).await?
            };
            work.await
        });
        let (reply, observer) = oneshot::channel();
        let job = Job {
            work,
            reply,
            _permit: permit,
        };
        let state = self.state.lock().unwrap();
        let result = if state.active && self.failure.borrow().is_none() {
            self.sender.try_send(job)
        } else {
            Err(mpsc::error::TrySendError::Closed(job))
        };
        drop(state);
        if let Err(rejected) = result {
            // Captured root tokens also lock state on Drop.
            drop(rejected);
            let error =
                Status::unavailable("handler cancellation host stopped; ownership retained");
            self.failure.send_replace(Some(error.clone()));
            return Err(error);
        }
        Ok(observer)
    }
}

#[tonic::async_trait]
impl HostRecovery for ExplicitAbortRecovery {
    async fn start(
        &self,
        supervisor: &mut JoinSet<Result<(), Status>>,
        cancel: RecoveryCancellation,
    ) -> Result<(), Status> {
        let mut receiver = {
            let mut state = self.owner.state.lock().unwrap();
            let receiver = state.receiver.take().ok_or_else(|| {
                Status::failed_precondition("explicit Abort owner already registered")
            })?;
            state.active = true;
            receiver
        };
        let active = Active(self.owner.state.clone());
        let timeout = self.owner.timeout;
        let mut failure = self.owner.failure.subscribe();
        supervisor.spawn(async move {
            let _active = active;
            loop {
                if let Some(error) = failure.borrow().clone() { return Err(error); }
                let job = tokio::select! { biased; _ = cancel.cancelled() => return Ok(()), changed = failure.changed() => { let _ = changed; return Err(failure.borrow().clone().unwrap_or_else(|| Status::unavailable("explicit Abort owner failed"))); }, job = receiver.recv() => match job { Some(job) => job, None => return Ok(()) } };
                let result = tokio::select! { biased; _ = cancel.cancelled() => return Ok(()), changed = failure.changed() => { let _ = changed; return Err(failure.borrow().clone().unwrap_or_else(|| Status::unavailable("explicit Abort owner failed"))); }, result = tokio::time::timeout(timeout, job.work) => result.unwrap_or_else(|_| Err(Status::deadline_exceeded("explicit Abort timed out; ownership retained"))) };
                let _ = job.reply.send(result.clone());
                result?;
            }
        });
        Ok(())
    }
}

#[cfg(feature = "test-support")]
pub(crate) struct ObserverDrop(Option<std::path::PathBuf>);
#[cfg(feature = "test-support")]
impl ObserverDrop {
    pub(crate) fn new() -> Self {
        Self(std::env::var_os("REBOOT_TEST_EXPLICIT_ABORT_PARK").map(std::path::PathBuf::from))
    }
}
#[cfg(feature = "test-support")]
impl Drop for ObserverDrop {
    fn drop(&mut self) {
        if let Some(path) = &self.0 {
            std::fs::write(path.with_extension("observer-dropped"), b"dropped").unwrap();
        }
    }
}
#[cfg(feature = "test-support")]
pub(crate) async fn park_after_decision() {
    if let Some(path) = std::env::var_os("REBOOT_TEST_EXPLICIT_ABORT_PARK") {
        let path = std::path::PathBuf::from(path);
        std::fs::write(&path, b"real DecisionPut ACK").unwrap();
        tokio::time::timeout(std::time::Duration::from_secs(20), async {
            while !path.with_extension("release").exists() {
                tokio::time::sleep(std::time::Duration::from_millis(10)).await;
            }
        })
        .await
        .expect("explicit Abort test barrier timed out");
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn enqueue(owner: &ExplicitAbortOwner, work: Work) -> oneshot::Receiver<Result<(), Status>> {
        let permit = owner.capacity.clone().try_acquire_owned().unwrap();
        let (reply, observer) = oneshot::channel();
        owner
            .sender
            .try_send(Job {
                work,
                reply,
                _permit: permit,
            })
            .ok()
            .unwrap();
        observer
    }
    #[tokio::test]
    async fn observer_drop_does_not_cancel_owned_work_and_capacity_counts_running() {
        let owner = ExplicitAbortOwner::new(1).unwrap();
        let mut supervisor = JoinSet::new();
        let cancel = RecoveryCancellation::new();
        owner
            .recovery_registration()
            .start(&mut supervisor, cancel.clone())
            .await
            .unwrap();
        let (release, wait) = oneshot::channel();
        let (done, completed) = oneshot::channel();
        drop(enqueue(
            &owner,
            Box::pin(async move {
                wait.await.unwrap();
                done.send(()).unwrap();
                Ok(())
            }),
        ));
        tokio::task::yield_now().await;
        assert!(owner.capacity.clone().try_acquire_owned().is_err());
        release.send(()).unwrap();
        completed.await.unwrap();
        cancel.cancel();
        assert!(supervisor.join_next().await.unwrap().unwrap().is_ok());
        assert!(!owner.state.lock().unwrap().active);
        assert_eq!(owner.capacity.available_permits(), 1);
    }
    #[tokio::test]
    async fn queued_unpolled_work_is_dropped_and_joined_on_shutdown() {
        struct Dropped(oneshot::Sender<()>);
        impl Drop for Dropped {
            fn drop(&mut self) {
                let _ = &self.0;
            }
        }
        let owner = ExplicitAbortOwner::new(2).unwrap();
        let mut supervisor = JoinSet::new();
        let cancel = RecoveryCancellation::new();
        owner
            .recovery_registration()
            .start(&mut supervisor, cancel.clone())
            .await
            .unwrap();
        let first = enqueue(&owner, Box::pin(std::future::pending()));
        let (sender, dropped) = oneshot::channel();
        let guard = Dropped(sender);
        let second = enqueue(
            &owner,
            Box::pin(async move {
                let _guard = guard;
                panic!("queued work must never be polled");
            }),
        );
        cancel.cancel();
        assert!(supervisor.join_next().await.unwrap().unwrap().is_ok());
        assert!(first.await.is_err());
        assert!(second.await.is_err());
        assert!(dropped.await.is_err());
        assert_eq!(owner.capacity.available_permits(), 2);
    }
    #[tokio::test]
    async fn timeout_and_preexisting_failure_surface_as_host_child_failure() {
        for preexisting in [false, true] {
            let owner = ExplicitAbortOwner::new(1)
                .unwrap()
                .with_timeout(std::time::Duration::from_millis(10))
                .unwrap();
            if preexisting {
                owner
                    .failure
                    .send_replace(Some(Status::resource_exhausted("admission uncertainty")));
            }
            let mut supervisor = JoinSet::new();
            owner
                .recovery_registration()
                .start(&mut supervisor, RecoveryCancellation::new())
                .await
                .unwrap();
            let observer = enqueue(&owner, Box::pin(std::future::pending()));
            let status = supervisor.join_next().await.unwrap().unwrap().unwrap_err();
            assert_eq!(
                status.code(),
                if preexisting {
                    tonic::Code::ResourceExhausted
                } else {
                    tonic::Code::DeadlineExceeded
                }
            );
            let _ = observer.await;
            assert!(!owner.state.lock().unwrap().active);
        }
    }
}
