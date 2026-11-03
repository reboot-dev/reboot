// Host-owned local-only cleanup. Included by application_host.rs.
// The bound is on admitted producers PLUS queued/running jobs, not merely a
// channel buffer. Each guard reserves a permit before admission can await or
// publish Pending, and transfers that same permit into its Drop job.
const MAX_HOST_PARTICIPANT_CLEANUPS: usize = 256;
const PARTICIPANT_CLEANUP_DEADLINE: std::time::Duration = std::time::Duration::from_secs(5);
type CleanupJob = Pin<Box<dyn Future<Output = ()> + Send + 'static>>;
type CleanupCommand = (CleanupJob, CleanupProducer);
type CleanupReceiver = tokio::sync::mpsc::UnboundedReceiver<CleanupCommand>;

struct CleanupState {
    permits: Arc<tokio::sync::Semaphore>,
    sender: tokio::sync::mpsc::UnboundedSender<(CleanupJob, CleanupProducer)>,
    receiver: std::sync::Mutex<Option<CleanupReceiver>>,
    changed: tokio::sync::Notify,
    sealed: std::sync::atomic::AtomicBool,
    failed: std::sync::atomic::AtomicBool,
    stop: std::sync::atomic::AtomicBool,
}

/// Opaque host cleanup ownership. Generated registration binds the exact shared
/// participant allocation; ordinary mounted Tonic handlers also bind automatically
/// at admission. A participant cannot migrate to another host or become unbound.
/// Standalone participants which have never entered a host retain legacy Drop.
#[doc(hidden)]
#[derive(Clone)]
pub struct ParticipantCleanupBinding(Arc<CleanupState>);
impl fmt::Debug for ParticipantCleanupBinding {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str("ParticipantCleanupBinding(opaque)")
    }
}
tokio::task_local! {
    static INGRESS_PARTICIPANT_CLEANUP: ParticipantCleanupBinding;
}
impl ParticipantCleanupBinding {
    fn new() -> Self {
        let (sender, receiver) = tokio::sync::mpsc::unbounded_channel();
        Self(Arc::new(CleanupState {
            permits: Arc::new(tokio::sync::Semaphore::new(MAX_HOST_PARTICIPANT_CLEANUPS)),
            sender,
            receiver: std::sync::Mutex::new(Some(receiver)),
            changed: tokio::sync::Notify::new(),
            sealed: std::sync::atomic::AtomicBool::new(false),
            failed: std::sync::atomic::AtomicBool::new(false),
            stop: std::sync::atomic::AtomicBool::new(false),
        }))
    }
    pub(crate) fn current() -> Option<Self> {
        INGRESS_PARTICIPANT_CLEANUP.try_with(Clone::clone).ok()
    }
    pub(crate) fn same_owner(&self, other: &Self) -> bool {
        Arc::ptr_eq(&self.0, &other.0)
    }
    pub(crate) fn reserve(&self) -> Result<CleanupProducer, tonic::Status> {
        let permit = self.0.permits.clone().try_acquire_owned().map_err(|_| {
            tonic::Status::resource_exhausted("host participant cleanup admission closed or full")
        })?;
        Ok(CleanupProducer {
            binding: self.clone(),
            permit: Some(permit),
        })
    }
    async fn scope<F: Future>(&self, future: F) -> F::Output {
        INGRESS_PARTICIPANT_CLEANUP
            .scope(self.clone(), future)
            .await
    }
    fn start(&self) -> CleanupDriver {
        let receiver = self
            .0
            .receiver
            .lock()
            .expect("cleanup receiver poisoned")
            .take()
            .expect("host cleanup started twice");
        let binding = self.clone();
        let task = tokio::spawn(async move { binding.run(receiver).await });
        CleanupDriver {
            binding: self.clone(),
            task: Some(task),
            result: None,
        }
    }
    async fn run(
        &self,
        mut receiver: tokio::sync::mpsc::UnboundedReceiver<(CleanupJob, CleanupProducer)>,
    ) -> Result<(), tonic::Status> {
        let mut children = JoinSet::new();
        // Keep permits in the DRIVER until children are REAPED, including
        // panics. Completed-but-unjoined tasks cannot bypass the host bound.
        let mut tickets = std::collections::HashMap::new();
        let result = loop {
            // Arm before checking permits: Drop notifications cannot be lost.
            let changed = self.0.changed.notified();
            tokio::pin!(changed);
            changed.as_mut().enable();
            if self.0.stop.load(std::sync::atomic::Ordering::Acquire) {
                break Err(tonic::Status::deadline_exceeded(
                    "participant cleanup stopped",
                ));
            }
            if self.0.sealed.load(std::sync::atomic::Ordering::Acquire)
                && self.0.permits.available_permits() == MAX_HOST_PARTICIPANT_CLEANUPS
                && children.is_empty()
            {
                break if self.0.failed.load(std::sync::atomic::Ordering::Acquire) {
                    Err(tonic::Status::internal(
                        "participant cleanup submission failed",
                    ))
                } else {
                    Ok(())
                };
            }
            tokio::select! {
                _ = &mut changed => {},
                command = receiver.recv() => match command {
                    Some((job, producer)) => {
                        let child = children.spawn(job);
                        tickets.insert(child.id(), producer);
                    }
                    None => break Err(tonic::Status::internal("participant cleanup receiver closed")),
                },
                joined = children.join_next_with_id(), if !children.is_empty() => {
                    match joined {
                        Some(Ok((id, ()))) => { tickets.remove(&id); },
                        Some(Err(error)) => {
                            tickets.remove(&error.id());
                            break Err(tonic::Status::internal(format!("participant cleanup child panicked: {error}")));
                        }
                        None => {}
                    }
                }
            }
        };
        // A child panic must not detach siblings. Drain queued producer permits,
        // abort and JOIN every running child; no Pending or native fence is cleared.
        self.0.permits.close();
        receiver.close();
        while receiver.try_recv().is_ok() {}
        children.abort_all();
        while children.join_next().await.is_some() {}
        drop(tickets);
        result
    }
}

pub(crate) struct CleanupProducer {
    binding: ParticipantCleanupBinding,
    permit: Option<tokio::sync::OwnedSemaphorePermit>,
}
impl CleanupProducer {
    pub(crate) fn submit(self, job: impl Future<Output = ()> + Send + 'static) {
        let binding = self.binding.clone();
        // This queue is logically bounded by the already-reserved producer
        // permits. Never spawn a fallback on channel failure.
        if binding.0.sender.send((Box::pin(job), self)).is_err() {
            binding
                .0
                .failed
                .store(true, std::sync::atomic::Ordering::Release);
            binding.0.changed.notify_one();
        }
    }
}
impl Drop for CleanupProducer {
    fn drop(&mut self) {
        drop(self.permit.take());
        self.binding.0.changed.notify_one();
    }
}

struct CleanupDriver {
    binding: ParticipantCleanupBinding,
    task: Option<tokio::task::JoinHandle<Result<(), tonic::Status>>>,
    result: Option<Result<(), tonic::Status>>,
}
impl CleanupDriver {
    async fn finish(&mut self) -> Result<(), ApplicationHostError> {
        if let Some(result) = &self.result {
            return result
                .clone()
                .map_err(ApplicationHostError::ParticipantCleanup);
        }
        // Only invoked AFTER serving/recovery/initializer futures are destroyed.
        // Closing admission is not closing Drop submissions: retained tickets
        // may enqueue until they themselves are destroyed, even after sealing.
        self.binding.0.permits.close();
        self.binding
            .0
            .sealed
            .store(true, std::sync::atomic::Ordering::Release);
        self.binding.0.changed.notify_one();
        let task = self.task.as_mut().expect("cleanup task owned until finish");
        let result = match tokio::time::timeout(PARTICIPANT_CLEANUP_DEADLINE, &mut *task).await {
            Ok(Ok(result)) => result,
            Ok(Err(error)) => Err(tonic::Status::internal(format!(
                "participant cleanup driver panicked: {error}"
            ))),
            Err(_) => {
                // Abort run's owned JoinSet, then join it via a cooperative stop
                // signal rather than aborting the driver (JoinSet Drop does not
                // itself join aborted children).
                self.binding
                    .0
                    .failed
                    .store(true, std::sync::atomic::Ordering::Release);
                self.binding
                    .0
                    .stop
                    .store(true, std::sync::atomic::Ordering::Release);
                self.binding.0.changed.notify_one();
                let _ = (&mut *task).await;
                Err(tonic::Status::deadline_exceeded(
                    "participant cleanup incomplete at host shutdown",
                ))
            }
        };
        self.task.take();
        self.result = Some(result.clone());
        result.map_err(ApplicationHostError::ParticipantCleanup)
    }
}
impl Drop for CleanupDriver {
    fn drop(&mut self) {
        // External cancellation of serve is NOT an orderly shutdown guarantee.
        // No owned task is detached; explicit shutdown must call finish().
        if let Some(task) = &self.task {
            task.abort();
        }
    }
}
