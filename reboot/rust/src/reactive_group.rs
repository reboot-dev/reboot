/// Explicit immutable-reader routing for services sharing one exact actor.
/// Register the finished group once; never separately install its input owners.
/// Each method retains its original handler/policy and opaque binding identity.
pub struct LocalReaderGroup {
    owner: LocalReaderOwner,
    methods: std::collections::BTreeMap<&'static str, Arc<dyn ReaderBinding>>,
    identities: Vec<Arc<()>>,
}
impl LocalReaderGroup {
    pub fn new<B: ReaderBinding>(service: LocalReaderService<B>) -> Result<Self, Status> {
        let mut group = Self {
            owner: service.owner.clone(),
            methods: Default::default(),
            identities: Vec::new(),
        };
        group.add(service)?;
        Ok(group)
    }
    /// Atomic validation: rejection leaves all prior routes unchanged.
    pub fn add<B: ReaderBinding>(&mut self, service: LocalReaderService<B>) -> Result<(), Status> {
        if self.identities.len() == 64 {
            return Err(Status::resource_exhausted(
                "reader group exceeds 64 bindings",
            ));
        }
        let source_started = service
            .owner
            .inner
            .lifecycle
            .lock()
            .expect("reader lifecycle poisoned")
            .is_some();
        let group_started = self
            .owner
            .inner
            .lifecycle
            .lock()
            .expect("reader lifecycle poisoned")
            .is_some();
        if source_started || group_started {
            return Err(Status::failed_precondition(
                "reader groups must be configured before host startup",
            ));
        }
        let owner = &service.owner.inner;
        let canonical = &self.owner.inner;
        if owner.state_ref != canonical.state_ref
            || owner.state_type != canonical.state_type
            || owner.endpoint != canonical.endpoint
        {
            return Err(Status::failed_precondition(
                "reader group requires one exact actor and endpoint",
            ));
        }
        service.binding.validate_owner(&self.owner)?;
        let identity = service.binding.unary_binding_id().ok_or_else(|| {
            Status::failed_precondition("reader group requires generated binding identity")
        })?;
        let names = service.binding.reader_method_names();
        if names.is_empty() || names.len() > 64 || self.methods.len() + names.len() > 64 {
            return Err(Status::resource_exhausted(
                "reader group requires 1..64 exact methods",
            ));
        }
        let mut unique = std::collections::BTreeSet::new();
        for name in names {
            if name.is_empty() || !unique.insert(*name) || self.methods.contains_key(name) {
                return Err(Status::already_exists(
                    "duplicate or invalid reader group method",
                ));
            }
        }
        let binding: Arc<dyn ReaderBinding> = service.binding;
        for name in names {
            self.methods.insert(name, binding.clone());
        }
        self.identities.push(identity);
        Ok(())
    }
    pub fn into_service(self) -> Result<LocalReaderService<Self>, Status> {
        let owner = self.owner.clone();
        LocalReaderService::new(self, owner)
    }
    fn route(&self, method: &str) -> Result<&Arc<dyn ReaderBinding>, Status> {
        self.methods
            .get(method)
            .ok_or_else(|| Status::unimplemented("not a registered grouped reader method"))
    }
}
#[tonic::async_trait]
impl ReaderBinding for LocalReaderGroup {
    fn validate_owner(&self, owner: &LocalReaderOwner) -> Result<(), Status> {
        if !Arc::ptr_eq(&self.owner.inner, &owner.inner) {
            return Err(Status::failed_precondition(
                "reader group owner identity mismatch",
            ));
        }
        for binding in self.methods.values() {
            binding.validate_owner(owner)?;
        }
        Ok(())
    }
    fn supports_unary_binding(&self, identity: &Arc<()>) -> bool {
        self.identities.iter().any(|id| Arc::ptr_eq(id, identity))
    }
    fn matches_unary_methods(&self, identity: &Arc<()>, names: &[&str]) -> bool {
        !names.is_empty()
            && names.iter().all(|name| {
                self.methods
                    .get(name)
                    .is_some_and(|binding| binding.matches_unary_methods(identity, &[*name]))
            })
    }
    async fn read(&self, request: Request<wire::Query>) -> Result<Vec<u8>, Status> {
        self.route(&request.get_ref().method)?.read(request).await
    }
    async fn read_with_context(
        &self,
        request: Request<wire::Query>,
        context: LocalReaderContext,
    ) -> Result<Vec<u8>, Status> {
        self.route(&request.get_ref().method)?
            .read_with_context(request, context)
            .await
    }
}
