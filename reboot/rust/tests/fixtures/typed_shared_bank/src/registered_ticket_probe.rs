//! Requires a REAL registered authorized root handler context; never call before_effects.
//! Caller runs under the genuine consuming root owner and propagates this Aborted outcome.
//! No public ticket constructor exists. See README for original Bank initialization blocker.
use crate::bank::v1 as b;
use reboot::runtime::TransactionContext;
/// Receiver is the actual host-registered generated Account adapter for `account_ref`.
/// Malformed parse must burn both aliases before any child Load or handler invocation.
/// Caller must supply sidecar/handler counters and assert they remain unchanged.
pub async fn malformed_header_and_original_clone_replay(
    context: &TransactionContext,
    account_ref: &str,
    receiver: &(dyn b::account_methods_server::AccountMethods + Send + Sync),
) -> Result<(), Box<tonic::Status>> {
    let method = "bank.v1.AccountMethods.Withdraw";
    let target = reboot::durable_coordinator::ParticipantTarget {
        state_type: "bank.v1.Account".into(),
        state_ref: account_ref.into(),
    };
    context.require_registered_outbound()?;
    let scope =
        context.begin_generated_outbound_for(&target.state_type, &target.state_ref, method)?;
    let destination = context.lookup_registered_local_destination(&target, method)?;
    let body = b::WithdrawRequest { amount: 40 };
    let ticket = context.issue_registered_local_ticket(&scope, &destination, method, &body)?;
    let clone = ticket.clone();
    let mut headers = reboot::RebootHeaders::new(account_ref);
    headers.server_id = context.headers().server_id.clone();
    headers.transaction_ids = Some(context.transaction_ids().to_vec());
    headers.transaction_coordinator_state_type =
        Some(context.transaction_coordinator_state_type().into());
    headers.transaction_coordinator_state_ref =
        Some(context.transaction_coordinator_state_ref().into());
    headers.coordinator_read_only_aware = context.headers().coordinator_read_only_aware;
    headers.traceparent = context.headers().traceparent.clone();
    headers.tracestate = context.headers().tracestate.clone();
    let wire = |alias: reboot::runtime::RegisteredLocalTicket| {
        let mut request = tonic::Request::new(body);
        *request.metadata_mut() = headers.to_metadata().unwrap();
        request.extensions_mut().insert(alias);
        request
    };
    let mut malformed = wire(ticket.clone());
    malformed
        .metadata_mut()
        .insert("x-reboot-transaction-ids", "not-json".parse().unwrap());
    let error = receiver.withdraw(malformed).await.unwrap_err();
    assert_eq!(error.code(), tonic::Code::InvalidArgument);
    for alias in [ticket, clone] {
        let error = receiver.withdraw(wire(alias)).await.unwrap_err();
        assert_eq!(error.code(), tonic::Code::FailedPrecondition);
        assert_eq!(error.message(), "local ticket already consumed");
    }
    drop(scope); // Unsettled probe must Abort under actual reserved owner; never commit.
    Err(Box::new(tonic::Status::aborted(
        "registered ticket malformed-header/replay probe completed; root must abort",
    )))
}

/// The ticket is issued ONLY for the genuine Account Withdraw destination.
/// `shared_call` dispatches its alias to a different typed shared receiver.
/// Caller counts starts, Load, all shared hooks and native terminals externally.
pub async fn shared_receiver_burns_account_ticket<M, F, Fut>(
    context: &TransactionContext,
    account_ref: &str,
    receiver: &(dyn b::account_methods_server::AccountMethods + Send + Sync),
    shared_headers: reboot::RebootHeaders,
    shared_body: M,
    malformed: bool,
    shared_call: F,
) -> Result<(), Box<tonic::Status>>
where
    F: FnOnce(tonic::Request<M>) -> Fut,
    Fut: std::future::Future<Output = Result<(), tonic::Status>>,
{
    let method = "bank.v1.AccountMethods.Withdraw";
    let target = reboot::durable_coordinator::ParticipantTarget {
        state_type: "bank.v1.Account".into(),
        state_ref: account_ref.into(),
    };
    context.require_registered_outbound()?;
    let scope =
        context.begin_generated_outbound_for(&target.state_type, &target.state_ref, method)?;
    let destination = context.lookup_registered_local_destination(&target, method)?;
    let body = b::WithdrawRequest { amount: 40 };
    let ticket = context.issue_registered_local_ticket(&scope, &destination, method, &body)?;
    let clone = ticket.clone();
    let mut headers = reboot::RebootHeaders::new(account_ref);
    headers.server_id = context.headers().server_id.clone();
    headers.transaction_ids = Some(context.transaction_ids().to_vec());
    headers.transaction_coordinator_state_type =
        Some(context.transaction_coordinator_state_type().into());
    headers.transaction_coordinator_state_ref =
        Some(context.transaction_coordinator_state_ref().into());
    headers.coordinator_read_only_aware = context.headers().coordinator_read_only_aware;
    headers.traceparent = context.headers().traceparent.clone();
    headers.tracestate = context.headers().tracestate.clone();
    let mut wrong = tonic::Request::new(shared_body);
    *wrong.metadata_mut() = shared_headers.to_metadata().unwrap();
    wrong.extensions_mut().insert(ticket.clone());
    if malformed {
        wrong
            .metadata_mut()
            .insert("x-reboot-transaction-ids", "not-json".parse().unwrap());
    }
    let error = shared_call(wrong).await.unwrap_err();
    if malformed {
        assert_eq!(error.code(), tonic::Code::InvalidArgument);
    } else {
        assert_eq!(error.code(), tonic::Code::FailedPrecondition);
        assert_eq!(error.message(), "local tickets exclude shared execution");
    }
    for alias in [ticket, clone] {
        let mut request = tonic::Request::new(body);
        *request.metadata_mut() = headers.to_metadata().unwrap();
        request.extensions_mut().insert(alias);
        let error = receiver.withdraw(request).await.unwrap_err();
        assert_eq!(error.code(), tonic::Code::FailedPrecondition);
        assert_eq!(error.message(), "local ticket already consumed");
    }
    drop(scope); // Never settle a rejected probe as successful outbound execution.
    Err(Box::new(tonic::Status::aborted(
        "typed shared ticket burn/replay probe completed; root must abort",
    )))
}
