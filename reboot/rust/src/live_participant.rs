//! Host-owned live participant Watch obligations. No presumed-absence Abort.
use crate::{
    application_host::{HostRecovery, RecoveryCancellation},
    legacy_coordinator::CoordinatorWatchEndpoint,
};
use std::{
    future::Future,
    pin::Pin,
    sync::{Arc, Mutex},
};
use tokio::{
    sync::{OwnedSemaphorePermit, Semaphore, mpsc},
    task::JoinSet,
};
use tonic::Status;
type Work = Pin<Box<dyn Future<Output = Result<(), Status>> + Send>>;
struct Job {
    work: Work,
    _permit: OwnedSemaphorePermit,
}
struct State {
    active: bool,
    receiver: Option<mpsc::Receiver<Job>>,
}
#[derive(Clone)]
pub struct LiveParticipantOwner {
    state: Arc<Mutex<State>>,
    sender: mpsc::Sender<Job>,
    capacity: Arc<Semaphore>,
    watch: Arc<dyn CoordinatorWatchEndpoint>,
    coordinator: crate::durable_coordinator::ParticipantTarget,
    failure: tokio::sync::watch::Sender<Option<Status>>,
}
pub struct LiveParticipantRecovery {
    owner: LiveParticipantOwner,
}
pub(crate) struct Reservation {
    owner: LiveParticipantOwner,
    permit: OwnedSemaphorePermit,
}
impl LiveParticipantOwner {
    pub fn new(
        capacity: usize,
        coordinator: crate::durable_coordinator::ParticipantTarget,
        watch: Arc<dyn CoordinatorWatchEndpoint>,
    ) -> Result<Self, Status> {
        if capacity == 0 || capacity > 1024 {
            return Err(Status::invalid_argument(
                "live Watch capacity must be 1..=1024",
            ));
        }
        if coordinator.state_type.is_empty() || coordinator.state_ref.is_empty() {
            return Err(Status::invalid_argument(
                "live Watch requires exact coordinator identity",
            ));
        }
        let (sender, receiver) = mpsc::channel(capacity);
        Ok(Self {
            state: Arc::new(Mutex::new(State {
                active: false,
                receiver: Some(receiver),
            })),
            sender,
            capacity: Arc::new(Semaphore::new(capacity)),
            watch,
            coordinator,
            failure: tokio::sync::watch::channel(None).0,
        })
    }
    pub fn recovery_registration(&self) -> LiveParticipantRecovery {
        LiveParticipantRecovery {
            owner: self.clone(),
        }
    }
    pub(crate) fn reserve(
        &self,
        context: &crate::runtime::TransactionContext,
    ) -> Result<Reservation, Status> {
        if self.coordinator.state_type != context.transaction_coordinator_state_type()
            || self.coordinator.state_ref != context.transaction_coordinator_state_ref()
        {
            return Err(Status::failed_precondition(
                "live participant coordinator authority differs",
            ));
        }
        let permit = self
            .capacity
            .clone()
            .try_acquire_owned()
            .map_err(|_| Status::resource_exhausted("live participant Watch owner is full"))?;
        if !self.state.lock().unwrap().active || self.failure.borrow().is_some() {
            return Err(Status::failed_precondition(
                "live participant Watch owner is not active",
            ));
        }
        Ok(Reservation {
            owner: self.clone(),
            permit,
        })
    }
}
impl Reservation {
    pub(crate) fn validate_active(&self) -> Result<(), Status> {
        if !self.owner.state.lock().unwrap().active || self.owner.failure.borrow().is_some() {
            return Err(Status::unavailable(
                "live Watch host stopped during admission; ownership retained",
            ));
        }
        Ok(())
    }
    pub(crate) fn endpoint(&self) -> Arc<dyn CoordinatorWatchEndpoint> {
        self.owner.watch.clone()
    }
    pub(crate) fn submit(self, work: Work) {
        let state = self.owner.state.lock().unwrap();
        if !state.active
            || self
                .owner
                .sender
                .try_send(Job {
                    work,
                    _permit: self.permit,
                })
                .is_err()
        {
            self.owner.failure.send_replace(Some(Status::unavailable(
                "live participant Watch host stopped; ownership retained",
            )));
        }
    }
}
struct Active(Arc<Mutex<State>>);
impl Drop for Active {
    fn drop(&mut self) {
        self.0.lock().unwrap().active = false;
    }
}
#[tonic::async_trait]
impl HostRecovery for LiveParticipantRecovery {
    async fn start(
        &self,
        supervisor: &mut JoinSet<Result<(), Status>>,
        cancel: RecoveryCancellation,
    ) -> Result<(), Status> {
        let receiver = {
            let mut state = self.owner.state.lock().unwrap();
            let receiver = state.receiver.take().ok_or_else(|| {
                Status::failed_precondition("live Watch owner already registered")
            })?;
            state.active = true;
            receiver
        };
        let active = Active(self.owner.state.clone());
        let mut failure = self.owner.failure.subscribe();
        supervisor.spawn(async move {
            let _active = active;
            let mut receiver = receiver;
            let mut workers = JoinSet::new();
            let result = loop {
                if let Some(error) = failure.borrow().clone() { break Err(error); }
                tokio::select! { biased;
                    _ = cancel.cancelled() => break Ok(()),
                    _ = failure.changed() => break Err(failure.borrow().clone().unwrap_or_else(|| Status::unavailable("live Watch owner failed"))),
                    completed = workers.join_next(), if !workers.is_empty() => {
                        match completed.unwrap() {
                            Ok(Ok(())) => {}, Ok(Err(error)) => break Err(error),
                            Err(error) => break Err(Status::internal(format!("live Watch worker failed: {error}"))),
                        }
                    },
                    job = receiver.recv() => match job {
                        Some(job) => { workers.spawn(async move {
                            let _permit = job._permit;
                            tokio::time::timeout(std::time::Duration::from_secs(300), job.work).await
                                .unwrap_or_else(|_| Err(Status::deadline_exceeded("live Watch deadline; ownership retained")))
                        }); },
                        None => break Ok(()),
                    },
                }
            };
            // No detached watch or terminal delivery outlives the owning host.
            receiver.close();
            workers.abort_all();
            while workers.join_next().await.is_some() {}
            result
        });
        Ok(())
    }
}
