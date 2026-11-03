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
    permit: WatchPermit,
}
struct WatchPermit {
    owner: LiveParticipantOwner,
    permit: Option<OwnedSemaphorePermit>,
    completed: bool,
}
impl Drop for WatchPermit {
    fn drop(&mut self) {
        if !self.completed {
            let mut state = self.owner.state.lock().unwrap();
            if let Some(permit) = self.permit.take() {
                state.retained.push(permit);
            }
            if let Some(cancel) = &state.host_cancel {
                cancel.fail();
            }
        }
    }
}
struct State {
    active: bool,
    receiver: Option<mpsc::Receiver<Job>>,
    host_cancel: Option<RecoveryCancellation>,
    retained: Vec<OwnedSemaphorePermit>,
}
#[derive(Clone)]
pub struct LiveParticipantOwner {
    state: Arc<Mutex<State>>,
    sender: mpsc::Sender<Job>,
    capacity: Arc<Semaphore>,
    limit: usize,
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
                host_cancel: None,
                retained: Vec::new(),
            })),
            sender,
            capacity: Arc::new(Semaphore::new(capacity)),
            watch,
            limit: capacity,
            coordinator,
            failure: tokio::sync::watch::channel(None).0,
        })
    }
    /// Bounded factual observation of this exact owner's retired obligations.
    /// This is NOT an admission/authority reservation or a ledger settlement:
    /// callers must quiesce their producers, and later admission can invalidate
    /// the observation. Replies/actor availability are not retirement evidence.
    /// Checks actual state after captured work and capacity permits have dropped;
    /// never consumes capacity, clears failures, or releases unknown ownership.
    #[cfg(feature = "test-support")]
    pub async fn wait_for_idle_for_test(&self, bound: std::time::Duration) -> Result<(), Status> {
        if bound.is_zero() || bound > std::time::Duration::from_secs(300) {
            return Err(Status::invalid_argument(
                "owner idle bound must be nonzero and <=300 seconds",
            ));
        }
        let deadline = tokio::time::Instant::now() + bound;
        loop {
            {
                // Same mutex as admission/sealing and retained obligation Drop.
                let state = self.state.lock().unwrap();
                if let Some(error) = self.failure.borrow().clone() {
                    return Err(error);
                }
                // Job destruction may latch only the actual host, not the
                // owner's watch Sender. Full restored capacity cannot hide it.
                if state
                    .host_cancel
                    .as_ref()
                    .is_some_and(|cancel| cancel.failure_latched_for_test())
                {
                    return Err(Status::unavailable(
                        "live Watch owner has sticky host failure",
                    ));
                }
                if state.retained.is_empty() && self.capacity.available_permits() == self.limit {
                    return Ok(());
                }
            }
            if tokio::time::Instant::now() >= deadline {
                return Err(Status::deadline_exceeded(
                    "live Watch owner did not retire within bound",
                ));
            }
            // Poll the real predicates, not a decorative completion signal.
            // Yield lets the owned worker perform work/token/permit destruction.
            tokio::task::yield_now().await;
        }
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
        // Admission and the shutdown seal share one lock. A rejected attempt
        // must never transiently consume capacity observed by shutdown.
        let state = self.state.lock().unwrap();
        if !state.active || self.failure.borrow().is_some() {
            return Err(Status::failed_precondition(
                "live participant Watch owner is not active",
            ));
        }
        let permit = self
            .capacity
            .clone()
            .try_acquire_owned()
            .map_err(|_| Status::resource_exhausted("live participant Watch owner is full"))?;
        drop(state);
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
        let owner = self.owner.clone();
        let job = Job {
            work,
            permit: WatchPermit {
                owner: owner.clone(),
                permit: Some(self.permit),
                completed: false,
            },
        };
        let state = owner.state.lock().unwrap();
        let sent = if state.active {
            owner.sender.try_send(job)
        } else {
            Err(mpsc::error::TrySendError::Closed(job))
        };
        drop(state); // rejected work's permit also locks this exact owner on Drop
        if let Err(rejected) = sent {
            drop(rejected);
            owner.failure.send_replace(Some(Status::unavailable(
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
            state.host_cancel = Some(cancel.clone());
            receiver
        };
        let active = Active(self.owner.state.clone());
        let mut failure = self.owner.failure.subscribe();
        let owner = self.owner.clone();
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
                            let mut permit = job.permit;
                            let result = tokio::time::timeout(std::time::Duration::from_secs(300), job.work).await
                                .unwrap_or_else(|_| Err(Status::deadline_exceeded("live Watch deadline; ownership retained")));
                            permit.completed = result.is_ok();
                            result
                        }); },
                        None => break Ok(()),
                    },
                }
            };
            // Seal producer admission before destroying work. Reservations held
            // by handlers, queued jobs and running Watch all count as unresolved;
            // cancellation is NOT an acknowledged terminal outcome. Latch into
            // the host because its shutdown join deliberately discards child Results.
            {
                let mut state = owner.state.lock().unwrap();
                state.active = false;
                if owner.capacity.available_permits() != owner.limit
                    || result.is_err() || owner.failure.borrow().is_some()
                {
                    cancel.fail();
                }
            }
            // No detached watch or terminal delivery outlives the owning host.
            receiver.close();
            while let Ok(job) = receiver.try_recv() { drop(job); }
            workers.abort_all();
            while workers.join_next().await.is_some() {}
            // Cancellation may return Ok to the supervisor's join protocol;
            // the sticky host latch, not that discarded Result, reports failure.
            result
        });
        Ok(())
    }
}

#[cfg(test)]
#[path = "host_watch_uncertainty_shutdown_tests.rs"]
mod host_watch_uncertainty_shutdown_tests;
