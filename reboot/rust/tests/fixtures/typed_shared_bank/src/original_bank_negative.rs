//! Actual generated original Bank receiver; panic sidecars prove refusal precedes IO.
use crate::{bank::v1 as b, bank_generated as g};
use reboot::durable_coordinator::{
    CoordinatorSidecar, DurableRootCoordinator, ExactParticipantResolver,
    InProcessParticipantEndpoint,
};
use reboot::durable_participant::{
    DurableActorParticipant, DurableActorParticipantHost, ParticipantSidecar,
};
use reboot::{
    database_proto as db,
    runtime::{TransactionContext, TransactionExecution},
};
use std::sync::Arc;
struct NoIo;
impl ParticipantSidecar for NoIo {
    fn load(
        &self,
        _: db::LoadRequest,
    ) -> std::pin::Pin<
        Box<dyn std::future::Future<Output = Result<db::LoadResponse, tonic::Status>> + Send + '_>,
    > {
        panic!("refusal reached ParticipantSidecar.load")
    }
    fn prepare(
        &self,
        _: db::TransactionParticipantPrepareRequest,
    ) -> std::pin::Pin<
        Box<
            dyn std::future::Future<
                    Output = Result<db::TransactionParticipantPrepareResponse, tonic::Status>,
                > + Send
                + '_,
        >,
    > {
        panic!("refusal reached ParticipantSidecar.prepare")
    }
    fn commit(
        &self,
        _: db::TransactionParticipantCommitRequest,
    ) -> std::pin::Pin<
        Box<
            dyn std::future::Future<
                    Output = Result<db::TransactionParticipantCommitResponse, tonic::Status>,
                > + Send
                + '_,
        >,
    > {
        panic!("refusal reached ParticipantSidecar.commit")
    }
    fn abort(
        &self,
        _: db::TransactionParticipantAbortRequest,
    ) -> std::pin::Pin<
        Box<
            dyn std::future::Future<
                    Output = Result<db::TransactionParticipantAbortResponse, tonic::Status>,
                > + Send
                + '_,
        >,
    > {
        panic!("refusal reached ParticipantSidecar.abort")
    }
    fn recover(
        &self,
        _: db::RecoverRequest,
    ) -> std::pin::Pin<
        Box<
            dyn std::future::Future<Output = Result<Vec<db::RecoverResponse>, tonic::Status>>
                + Send
                + '_,
        >,
    > {
        panic!("refusal reached ParticipantSidecar.recover")
    }
    fn recover_idempotent_mutations(
        &self,
        _: db::RecoverIdempotentMutationsRequest,
    ) -> std::pin::Pin<
        Box<
            dyn std::future::Future<
                    Output = Result<Vec<db::RecoverIdempotentMutationsResponse>, tonic::Status>,
                > + Send
                + '_,
        >,
    > {
        panic!("refusal reached ParticipantSidecar.recover_idempotent_mutations")
    }
}
impl CoordinatorSidecar for NoIo {
    fn coordinator_prepare(
        &self,
        _: db::TransactionCoordinatorPrepareRequest,
    ) -> std::pin::Pin<
        Box<
            dyn std::future::Future<
                    Output = Result<db::TransactionCoordinatorPrepareResponse, tonic::Status>,
                > + Send
                + '_,
        >,
    > {
        panic!("refusal reached CoordinatorSidecar.coordinator_prepare")
    }
    fn coordinator_prepared(
        &self,
        _: db::TransactionCoordinatorPreparedRequest,
    ) -> std::pin::Pin<
        Box<
            dyn std::future::Future<
                    Output = Result<db::TransactionCoordinatorPreparedResponse, tonic::Status>,
                > + Send
                + '_,
        >,
    > {
        panic!("refusal reached CoordinatorSidecar.coordinator_prepared")
    }
    fn coordinator_cleanup(
        &self,
        _: db::TransactionCoordinatorCleanupRequest,
    ) -> std::pin::Pin<
        Box<
            dyn std::future::Future<
                    Output = Result<db::TransactionCoordinatorCleanupResponse, tonic::Status>,
                > + Send
                + '_,
        >,
    > {
        panic!("refusal reached CoordinatorSidecar.coordinator_cleanup")
    }
    fn recover(
        &self,
        _: db::RecoverRequest,
    ) -> std::pin::Pin<
        Box<
            dyn std::future::Future<Output = Result<Vec<db::RecoverResponse>, tonic::Status>>
                + Send
                + '_,
        >,
    > {
        panic!("refusal reached CoordinatorSidecar.recover")
    }
}
struct NoStart;
impl reboot::runtime::RootTransactionStartFactory for NoStart {
    fn next_root_transaction(
        &self,
    ) -> Result<reboot::runtime::RootTransactionStart, tonic::Status> {
        panic!("refusal started a root")
    }
}
impl reboot::runtime::InboundTransactionStartFactory for NoStart {
    fn next_inbound_transaction(
        &self,
        _: &reboot::runtime::InboundTransactionContext,
    ) -> Result<uuid::Uuid, tonic::Status> {
        panic!("refusal allocated an inbound child")
    }
}
struct NoHandler;
#[tonic::async_trait]
impl g::BankMethodsTransactionHandler for NoHandler {
    async fn sign_up(
        &self,
        _: &TransactionContext,
        _: &mut b::Bank,
        _: b::SignUpRequest,
    ) -> Result<TransactionExecution<b::SignUpResponse>, tonic::Status> {
        panic!("refusal invoked SignUp")
    }
    async fn transfer(
        &self,
        _: &TransactionContext,
        _: &mut b::Bank,
        _: b::TransferRequest,
    ) -> Result<TransactionExecution<b::TransferResponse>, tonic::Status> {
        panic!("refusal invoked Transfer")
    }
    async fn transfer_fresh_shared(
        &self,
        _: &reboot::runtime::SharedLocalTransactionContext,
        _: &mut b::Bank,
        _: b::TransferRequest,
    ) -> Result<b::TransferResponse, tonic::Status> {
        panic!("refusal invoked fresh shared")
    }
}
#[tokio::test]
async fn original_bank_default_nooptin_and_malformed_headers_refuse_without_state() {
    use b::bank_methods_server::BankMethods;
    let reference = reboot::state_ref::StateRef::from_id("bank.v1.Bank", "not-initialized")
        .unwrap()
        .to_string();
    let participant = DurableActorParticipant::new(Arc::new(NoIo), "bank.v1.Bank", &reference);
    let resolver = Arc::new(
        ExactParticipantResolver::new([(
            participant.actor_target(),
            Arc::new(InProcessParticipantEndpoint::new(
                DurableActorParticipantHost::new(participant.clone()),
            )),
        )])
        .unwrap(),
    );
    let coordinator = DurableRootCoordinator::new(Arc::new(NoIo), resolver)
        .with_identity(participant.actor_target());
    // Original Bank contains only transaction methods, so its adapter takes the
    // injected participant/coordinator directly (unlike the mixed Account adapter).
    let adapter =
        g::BankMethodsTransactionAdapter::new(participant, coordinator, NoStart, NoHandler);
    let make = || {
        let mut request = tonic::Request::new(b::TransferRequest {
            from_account_id: "alice".into(),
            to_account_id: "bob".into(),
            amount: 40,
        });
        *request.metadata_mut() = reboot::RebootHeaders::new(&reference)
            .to_metadata()
            .unwrap();
        request
    };
    let refusal = adapter.transfer(make()).await.unwrap_err();
    assert_eq!(refusal.code(), tonic::Code::FailedPrecondition);
    assert_eq!(
        refusal.message(),
        "shared declared errors require registered existing-writer root opt-in; inbound and ordinary shared execution remain unsupported"
    );
    let mut malformed = make();
    malformed
        .metadata_mut()
        .insert("x-reboot-transaction-ids", "not-json".parse().unwrap());
    assert_eq!(
        adapter.transfer(malformed).await.unwrap_err().code(),
        tonic::Code::InvalidArgument
    );
}
#[test]
fn original_bank_overdraft_decoder_preserves_exact_type_and_amount() {
    let status = reboot::declared_error_status(
        tonic::Code::Unknown,
        "declared error",
        "type.googleapis.com/bank.v1.OverdraftError",
        &b::OverdraftError { amount: 17 },
    );
    match g::decode_transfer_error(status) {
        g::BankMethodsTransferError::OverdraftError(error) => assert_eq!(error.amount, 17),
        other => panic!("not original bank.v1.OverdraftError: {other:?}"),
    }
}
