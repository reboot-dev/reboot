//! One-use local capability for registered generated receiver and transport dispatch.
use super::*;
use crate::registered_local::{
    GeneratedLocalAdapterConfig, RegisteredAdapterBinding, RegisteredLocalDestination,
};

#[doc(hidden)]
#[derive(Clone)]
pub struct RegisteredLocalTicket(Arc<Mutex<Option<TicketState>>>);
struct TicketState {
    parent: TransactionContext,
    lease: Arc<std::sync::atomic::AtomicBool>,
    destination: RegisteredAdapterBinding,
    configuration: GeneratedLocalAdapterConfig,
    method: String,
    request: Vec<u8>,
    headers: RebootHeaders,
    child: TransactionContext,
}

// Explicit allowlist: credentials/assertions, caller ID, workflow/task,
// idempotency and retry age are intentionally not forwarded. No internal flag.
pub(super) fn local_headers(parent: &RebootHeaders, target: &str) -> RebootHeaders {
    RebootHeaders {
        state_ref: target.to_owned(),
        // Host-injected identity is not a wire assertion: the receiver discards
        // application metadata unless its own trusted extension supplies it.
        application_id: None,
        server_id: parent.server_id.clone(),
        workflow_id: None,
        workflow_iteration: None,
        transaction_ids: parent.transaction_ids.clone(),
        transaction_coordinator_state_type: parent.transaction_coordinator_state_type.clone(),
        transaction_coordinator_state_ref: parent.transaction_coordinator_state_ref.clone(),
        transaction_retry_age: None,
        idempotency_key: None,
        bearer_token: None,
        task_schedule: None,
        cookie: None,
        caller_id: None,
        traceparent: parent.traceparent.clone(),
        tracestate: parent.tracestate.clone(),
        internal_call: false,
        coordinator_read_only_aware: parent.coordinator_read_only_aware,
    }
}
#[cfg(test)]
impl TransactionContext {
    pub(crate) fn test_ticket_branch_collection(self) -> Self {
        self.with_returned_participant_collection()
    }
    pub(crate) fn test_ticket_supervised(mut self) -> Self {
        self.enable_supervised_tree().unwrap();
        self
    }
    pub(crate) fn test_ticket_complete(
        &self,
        scope: &mut TransactionalOutboundScope,
        disposition: usize,
    ) {
        let mut status = Status::unknown("private ticket terminal fixture");
        crate::successful_trailers::ParticipantMetadata::classified_single(
            "example.Actor",
            "B",
            disposition == 2,
            true,
        )
        .unwrap()
        .attach_to_status(&mut status);
        let returned =
            crate::successful_trailers::ReturnedParticipants::from_metadata(status.metadata())
                .unwrap();
        match disposition {
            0 => self.enlist_generated_returned_participants(scope, &returned),
            1 => settle_terminal_scope(self, scope),
            _ => self.enlist_rolled_back_leaf(Some(scope), status.metadata(), "example.Actor", "B"),
        }
        .unwrap();
        assert!(scope.completed);
        assert!(
            !scope
                .admission_lease
                .load(std::sync::atomic::Ordering::Acquire)
        );
        if let Some(ledger) = &self.returned_participants {
            assert!(ledger.lock().unwrap().active > 0);
        }
    }
}
impl TransactionContext {
    fn reserve_local_ticket_branch<'a>(
        &'a self,
        lease: &std::sync::atomic::AtomicBool,
    ) -> Result<Option<std::sync::MutexGuard<'a, ReturnedParticipantCollection>>, Status> {
        let ledger = self
            .returned_participants
            .as_ref()
            .map(|c| c.lock().expect("returned participant mutex poisoned"));
        if !lease.load(std::sync::atomic::Ordering::Acquire)
            || ledger.as_ref().is_some_and(|l| {
                l.sealed || l.active == 0 || l.membership_uncertain || l.late_enlistment
            })
        {
            return Err(Status::failed_precondition(
                "local ticket scope or branch inactive",
            ));
        }
        if let Some(status) = self.doomed_status() {
            return Err(status);
        }
        Ok(ledger)
    }

    /// Exact same-host destination snapshot, available only to an admitted handler.
    /// A snapshot is not execution authority; issuance validates it again.
    #[doc(hidden)]
    pub fn lookup_registered_local_destination(
        &self,
        target: &crate::durable_coordinator::ParticipantTarget,
        method: &str,
    ) -> Result<RegisteredLocalDestination, Status> {
        self.require_registered_outbound()?;
        let permission = self.registered_outbound.as_ref().unwrap();
        permission
            .binding
            .lookup_local_destination(&permission.configuration, target, method)
    }

    /// Capability primitive only; callers cannot mint from metadata alone.
    /// The actual registered allocator runs once outside gate reservations.
    /// This is not local transport dispatch or a B authorization exemption.
    #[doc(hidden)]
    pub fn issue_registered_local_ticket<Req: Message>(
        &self,
        scope: &TransactionalOutboundScope,
        destination: &RegisteredLocalDestination,
        method: &str,
        request: &Req,
    ) -> Result<RegisteredLocalTicket, Status> {
        self.require_registered_outbound()?;
        self.validate_outbound_scope_admission(scope)?;
        let permission = self.registered_outbound.as_ref().unwrap();
        let config = destination.configuration();
        let expected = permission.binding.lookup_local_destination(
            &permission.configuration,
            &config.target,
            method,
        )?;
        if !expected.binding().same_registration(destination.binding())
            || !expected.configuration().same_identity_for_ticket(config)
            || scope.binding.as_ref().is_none_or(|(target, bound_method)| {
                target != &config.target || bound_method != method
            })
        {
            return Err(Status::failed_precondition(
                "local ticket destination differs",
            ));
        }
        self.validate_handler_ancestry()?;
        let mut ancestors = self.handler_ancestors.to_vec();
        ancestors.push(
            self.handler_lifetime.clone().ok_or_else(|| {
                Status::failed_precondition("local ticket parent lifetime absent")
            })?,
        );
        if ancestors.len() > 16 {
            return Err(Status::resource_exhausted(
                "handler ancestry capacity exceeded",
            ));
        }
        let headers = local_headers(self.headers(), &config.target.state_ref);
        let inbound =
            InboundTransactionContext::from_headers(headers.clone(), TransactionMode::Exclusive)
                .map_err(|e| Status::failed_precondition(e.to_string()))?;
        let factory = destination
            .service()
            .inbound_factory()
            .ok_or_else(|| Status::failed_precondition("local destination allocator absent"))?;
        if scope
            .request_used
            .swap(true, std::sync::atomic::Ordering::AcqRel)
        {
            return Err(Status::failed_precondition("local scope already issued"));
        }
        let id = factory.next_inbound_transaction(&inbound)?;
        let mut child = inbound
            .with_nested_transaction_id(id)
            .map_err(|e| Status::failed_precondition(e.to_string()))?;
        child.handler_ancestors = ancestors.into();
        // Factory is user code: revalidate after it, before the short mint region.
        let request = request.encode_to_vec();
        self.require_registered_outbound()?;
        destination.binding().validate_configuration(config)?;
        let _host = self.reserve_registered_host_settlement()?;
        let _lifetime = self.reserve_handler_settlement()?;
        let _ledger = self.reserve_local_ticket_branch(&scope.admission_lease)?;
        Ok(RegisteredLocalTicket(Arc::new(Mutex::new(Some(
            TicketState {
                parent: self.clone(),
                lease: scope.admission_lease.clone(),
                destination: destination.binding().clone(),
                configuration: config.clone(),
                method: method.to_owned(),
                request,
                headers,
                child,
            },
        )))))
    }
}
impl RegisteredLocalTicket {
    /// Burn every clone when a receiver rejects before full validation.
    #[doc(hidden)]
    pub fn discard(&self) {
        self.0.lock().expect("local ticket mutex poisoned").take();
    }

    /// Consume before any validation; all clones share one consuming state.
    /// Generated exclusive non-factory receivers invoke before verifier/storage
    /// and replace their ordinary allocator path with the actual child.
    #[doc(hidden)]
    pub fn consume<Req: Message>(
        &self,
        binding: &RegisteredAdapterBinding,
        configuration: &GeneratedLocalAdapterConfig,
        method: &str,
        headers: &RebootHeaders,
        request: &Req,
    ) -> Result<TransactionContext, Status> {
        let state = self
            .0
            .lock()
            .expect("local ticket mutex poisoned")
            .take()
            .ok_or_else(|| Status::failed_precondition("local ticket already consumed"))?;
        if !state.destination.same_registration(binding)
            || !state.configuration.same_identity_for_ticket(configuration)
            || state.method != method
            || state.headers != *headers
            || state.request != request.encode_to_vec()
        {
            return Err(Status::failed_precondition("local ticket receiver differs"));
        }
        state.parent.require_registered_outbound()?;
        binding.validate_configuration(configuration)?;
        let _host = state.parent.reserve_registered_host_settlement()?;
        let _lifetime = state.parent.reserve_handler_settlement()?;
        let _ledger = state.parent.reserve_local_ticket_branch(&state.lease)?;
        Ok(state.child)
    }
}

#[cfg(test)]
mod local_header_tests {
    use super::*;
    #[test]
    fn local_wire_headers_do_not_reencode_host_injected_application_identity() {
        let mut parent = RebootHeaders::new("parent");
        parent.application_id = Some("trusted-parent-application".into());
        parent.server_id = Some("server".into());
        parent.bearer_token = Some("parent-token".into());
        parent.cookie = Some("parent-cookie".into());
        let child = local_headers(&parent, "child");
        assert!(child.application_id.is_none());
        assert!(child.bearer_token.is_none());
        assert!(child.cookie.is_none());
        assert_eq!(
            RebootHeaders::from_metadata(&child.to_metadata().unwrap()).unwrap(),
            child
        );
    }
}
