/// Serving-time startup outcome, distinct from recovery/public-ingress readiness.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ServingInitializeState {
    Disabled,
    Pending,
    Running,
    Succeeded,
    Failed,
    Cancelled,
}

/// Opaque host-issued, exact-owner startup authority. It is neither cloneable nor
/// available from request extensions/metadata. Retaining it after callback return
/// does not retain authority: the host revokes its private lifetime fence.
/// ```compile_fail
/// use reboot_rust_schema::application_host::ServingInitializeContext;
/// let context = ServingInitializeContext {};
/// ```
pub struct ServingInitializeContext {
    application_id: String,
    alias: String,
    tasks: crate::one_shot_tasks::OneShotTasks,
    cancel: RecoveryCancellation,
    owner: crate::one_shot_tasks::RunningTaskAdmission,
    live: Arc<std::sync::atomic::AtomicBool>,
}
impl ServingInitializeContext {
    pub fn application_id(&self) -> &str {
        &self.application_id
    }
    pub fn alias(&self) -> &str {
        &self.alias
    }
    pub(crate) async fn require_live(&self) -> Result<(), tonic::Status> {
        self.cancel.public_ready().await?;
        drop(self.owner.lock_initializer(&self.cancel, &self.tasks)?);
        if !self.live.load(std::sync::atomic::Ordering::Acquire) {
            return Err(tonic::Status::permission_denied(
                "initializer capability revoked",
            ));
        }
        Ok(())
    }
    /// Generated typed admission uses the immutable declaration, not arbitrary
    /// caller-supplied task protobufs. Explicit host registration is authority;
    /// no network credential or internal header can mint this capability.
    #[doc(hidden)]
    pub async fn spawn_workflow<D, Q, R>(
        &self,
        method: &'static str,
        response_type: &'static str,
        request: &Q,
    ) -> Result<crate::database_proto::TaskId, tonic::Status>
    where
        D: crate::runtime::DurableStateDeclaration + 'static,
        Q: prost::Message + Default + 'static,
        R: prost::Message + Default + 'static,
    {
        self.require_live().await?;
        self.tasks
            .admit_initializer::<D, Q, R>(self, method, response_type, request)
            .await
    }
    /// Canonical typed Wait under the same host capability and original owner.
    /// Public Tasks.Wait retains its independent authorization policy.
    #[doc(hidden)]
    pub async fn wait_workflow<R: prost::Message + Default + 'static>(
        &self,
        id: &crate::database_proto::TaskId,
        method: &'static str,
        response_type: &'static str,
    ) -> Result<R, tonic::Status> {
        self.tasks
            .wait_initializer(self, id, method, response_type)
            .await
    }
    pub(crate) fn admission(&self) -> &crate::one_shot_tasks::RunningTaskAdmission {
        &self.owner
    }
    pub(crate) fn cancellation(&self) -> &RecoveryCancellation {
        &self.cancel
    }
}

type ServingInitializeFuture = Pin<Box<dyn Future<Output = Result<(), tonic::Status>> + Send>>;
type ServingInitializeCallback =
    dyn Fn(ServingInitializeContext) -> ServingInitializeFuture + Send + Sync;
async fn await_serving_initializer(
    callback: &Arc<ServingInitializeCallback>,
    context: ServingInitializeContext,
) -> Result<(), tonic::Status> {
    context.require_live().await?;
    let mut future = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| callback(context)))
        .map_err(|_| {
        tonic::Status::internal("serving initializer panicked during construction")
    })?;
    std::future::poll_fn(|cx| {
        std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| future.as_mut().poll(cx)))
            .unwrap_or_else(|_| {
                Poll::Ready(Err(tonic::Status::internal("serving initializer panicked")))
            })
    })
    .await
}

struct ServingInitializer {
    alias: String,
    tasks: crate::one_shot_tasks::OneShotTasks,
    callback: Arc<ServingInitializeCallback>,
}
// Callback lifetime is revoked even on cancellation/panic/future Drop.
struct ServingInitializeLease(Arc<std::sync::atomic::AtomicBool>);
impl Drop for ServingInitializeLease {
    fn drop(&mut self) {
        self.0.store(false, std::sync::atomic::Ordering::Release);
    }
}
impl ApplicationHost {
    /// Install one explicit repeatable startup identity and exact recovered task
    /// owner. Register that owner's HostRecovery separately before serving. The
    /// callback runs only after all recovery owners and required public routes
    /// are usable. Health remains NOT_SERVING until it returns successfully.
    /// Failure is fatal; restart re-admits the same durable task, never a new UUID.
    pub fn with_serving_initializer<F, Fut>(
        mut self,
        alias: impl Into<String>,
        tasks: crate::one_shot_tasks::OneShotTasks,
        callback: F,
    ) -> Result<Self, tonic::Status>
    where
        F: Fn(ServingInitializeContext) -> Fut + Send + Sync + 'static,
        Fut: Future<Output = Result<(), tonic::Status>> + Send + 'static,
    {
        let alias = alias.into();
        if alias.is_empty() || alias.len() > 1024 || self.initializer.is_some() {
            return Err(tonic::Status::invalid_argument(
                "one nonempty initializer alias (<=1024 bytes) is required",
            ));
        }
        self.initializer = Some(ServingInitializer {
            alias,
            tasks,
            callback: Arc::new(move |context| Box::pin(callback(context))),
        });
        self.initialize_state
            .send_replace(ServingInitializeState::Pending);
        Ok(self)
    }
    pub fn serving_initialize_state(&self) -> tokio::sync::watch::Receiver<ServingInitializeState> {
        self.initialize_state.subscribe()
    }
}
impl RunningApplicationHost {
    pub fn serving_initialize_state(&self) -> tokio::sync::watch::Receiver<ServingInitializeState> {
        self.initialize_state.subscribe()
    }
}
