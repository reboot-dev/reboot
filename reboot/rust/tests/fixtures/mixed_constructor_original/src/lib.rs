//! Actual unchanged pinned-original DatabaseHandler consumer. UNCOMPILED source target.
//! Withdraw remains an ordinary declared-error writer; no TransactionContext is invented.
#[allow(clippy::result_large_err)] // External Tonic Status and generated wire signatures.
pub mod rbt {
    pub mod v1alpha1 {
        tonic::include_proto!("rbt.v1alpha1");
    }
}
#[allow(clippy::result_large_err)] // External Tonic Status and generated wire signatures.
pub mod bank {
    pub mod v1 {
        tonic::include_proto!("bank.v1");
    }
}
#[allow(clippy::result_large_err)] // External Tonic Status and generated wire signatures.
pub mod account_generated {
    include!(concat!(env!("OUT_DIR"), "/bank/v1/account.reboot.rs"));
}
#[allow(clippy::result_large_err)] // External Tonic Status and generated wire signatures.
pub mod bank_generated {
    include!(concat!(env!("OUT_DIR"), "/bank/v1/bank.reboot.rs"));
}
pub mod committed_membership;
pub mod semantics;
use account_generated as a;
use bank::v1 as b;

/// Compatibility implementation exercises the default response-only Open hook.
pub struct ResponseOnlyAccount {
    pub logical_state_id: String,
}
#[tonic::async_trait]
impl a::AccountMethodsDatabaseHandler for ResponseOnlyAccount {
    async fn open(
        &self,
        state: &mut b::Account,
        request: b::OpenRequest,
    ) -> Result<b::OpenResponse, tonic::Status> {
        state.customer_name = request.customer_name;
        Ok(b::OpenResponse {
            welcome_email_task_id: None,
        })
    }
    async fn balance(
        &self,
        state: &b::Account,
        _: b::BalanceRequest,
    ) -> Result<b::BalanceResponse, tonic::Status> {
        Ok(semantics::balance(state))
    }
    async fn deposit(
        &self,
        state: &mut b::Account,
        request: b::DepositRequest,
    ) -> Result<b::DepositResponse, tonic::Status> {
        semantics::deposit(state, request).map_err(|error| *error)
    }
    async fn welcome_email(
        &self,
        state: &mut b::Account,
        _: b::WelcomeEmailRequest,
    ) -> Result<b::WelcomeEmailResponse, tonic::Status> {
        Ok(semantics::welcome_email(state, &self.logical_state_id))
    }
    async fn withdraw(
        &self,
        state: &mut b::Account,
        request: b::WithdrawRequest,
    ) -> Result<b::WithdrawResponse, a::AccountMethodsWithdrawError> {
        semantics::withdraw(state, request).map_err(|error| *error)
    }
}
/// Real scheduling override uses canonical generated WelcomeEmail and original TaskId binding.
pub struct SchedulingAccount {
    pub compatibility: ResponseOnlyAccount,
}
#[tonic::async_trait]
impl a::AccountMethodsDatabaseHandler for SchedulingAccount {
    async fn open(
        &self,
        state: &mut b::Account,
        request: b::OpenRequest,
    ) -> Result<b::OpenResponse, tonic::Status> {
        self.compatibility.open(state, request).await
    }
    async fn open_with_tasks(
        &self,
        state: &mut b::Account,
        request: b::OpenRequest,
        state_ref: String,
    ) -> Result<reboot::runtime::WriterExecution<b::OpenResponse>, tonic::Status> {
        Ok(semantics::open_effect(state, request, &state_ref))
    }
    async fn balance(
        &self,
        state: &b::Account,
        request: b::BalanceRequest,
    ) -> Result<b::BalanceResponse, tonic::Status> {
        self.compatibility.balance(state, request).await
    }
    async fn deposit(
        &self,
        state: &mut b::Account,
        request: b::DepositRequest,
    ) -> Result<b::DepositResponse, tonic::Status> {
        self.compatibility.deposit(state, request).await
    }
    async fn welcome_email(
        &self,
        state: &mut b::Account,
        request: b::WelcomeEmailRequest,
    ) -> Result<b::WelcomeEmailResponse, tonic::Status> {
        self.compatibility.welcome_email(state, request).await
    }
    async fn withdraw(
        &self,
        state: &mut b::Account,
        request: b::WithdrawRequest,
    ) -> Result<b::WithdrawResponse, a::AccountMethodsWithdrawError> {
        self.compatibility.withdraw(state, request).await
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    use a::AccountMethodsDatabaseHandler;
    use prost::Message;
    #[tokio::test]
    async fn actual_original_hook_and_response_only_compatibility() {
        let reference = reboot::state_ref::StateRef::from_id("bank.v1.Account", "external-open")
            .unwrap()
            .to_string();
        let mut state = b::Account::default();
        let compatibility = ResponseOnlyAccount {
            logical_state_id: "external-open".into(),
        };
        let scheduling = SchedulingAccount {
            compatibility: ResponseOnlyAccount {
                logical_state_id: "external-open".into(),
            },
        };
        let response_only = compatibility
            .open_with_tasks(
                &mut state,
                b::OpenRequest {
                    customer_name: "Original".into(),
                },
                reference.clone(),
            )
            .await
            .unwrap();
        assert!(response_only.task_upserts.is_empty());
        let execution = scheduling
            .open_with_tasks(
                &mut state,
                b::OpenRequest {
                    customer_name: "Original".into(),
                },
                reference,
            )
            .await
            .unwrap();
        assert_eq!(execution.task_upserts.len(), 1);
        assert_eq!(
            execution
                .response
                .welcome_email_task_id
                .unwrap()
                .encode_to_vec(),
            execution.task_upserts[0]
                .task_id
                .as_ref()
                .unwrap()
                .encode_to_vec()
        );
    }
}
