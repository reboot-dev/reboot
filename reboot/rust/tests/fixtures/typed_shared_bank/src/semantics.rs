//! Pure original handler semantics and REAL task effect construction.
//! Producing a WriterExecution is not storing, scheduling, executing, or ACKing it.
use crate::{account_generated as a, bank::v1 as b};
use prost::Message;

pub fn open_effect(
    state: &mut b::Account,
    request: b::OpenRequest,
    state_ref: &str,
) -> reboot::runtime::WriterExecution<b::OpenResponse> {
    state.customer_name = request.customer_name;
    let task = a::AccountMethodsTasks::welcome_email(state_ref, &b::WelcomeEmailRequest {});
    let id = task.task_id.as_ref().expect("generated task identity");
    // Original response refers to rbt/v1alpha1/tasks.proto's TaskId, whereas the
    // effect carries the canonical Database TaskId. Preserve the actual wire schema.
    let wire_id = crate::rbt::v1alpha1::TaskId::decode(id.encode_to_vec().as_slice())
        .expect("TaskId protobuf wire compatibility");
    let mut execution = reboot::runtime::WriterExecution::new(b::OpenResponse {
        welcome_email_task_id: Some(wire_id),
    });
    execution.task_upserts.push(task);
    execution
}
pub fn balance(state: &b::Account) -> b::BalanceResponse {
    b::BalanceResponse {
        balance: state.balance,
    }
}
pub fn deposit(
    state: &mut b::Account,
    request: b::DepositRequest,
) -> Result<b::DepositResponse, Box<tonic::Status>> {
    let next = state
        .balance
        .checked_add(request.amount)
        .ok_or_else(|| tonic::Status::out_of_range("balance overflow"))?;
    state.balance = next;
    Ok(b::DepositResponse {
        updated_balance: next,
    })
}
pub fn withdraw(
    state: &mut b::Account,
    request: b::WithdrawRequest,
) -> Result<b::WithdrawResponse, Box<a::AccountMethodsWithdrawError>> {
    if request.amount > state.balance {
        let deficit = u32::try_from(request.amount - state.balance).map_err(|_| {
            a::AccountMethodsWithdrawError::Grpc(tonic::Status::out_of_range("overdraft amount"))
        })?;
        return Err(Box::new(a::AccountMethodsWithdrawError::OverdraftError(
            b::OverdraftError { amount: deficit },
        )));
    }
    state.balance -= request.amount;
    Ok(b::WithdrawResponse {
        updated_balance: state.balance,
    })
}
pub fn welcome_body(state: &b::Account, state_id: &str) -> String {
    format!(
        "Hello {},\n\nWe are delighted to welcome you as a customer.\nYour new account has been opened, and has ID '{}'.\n\nBest regards,\nYour Bank",
        state.customer_name, state_id
    )
}
/// Production original welcome effect: logs rather than sending an actual email.
/// Host supplies ORIGINAL state ID, not encoded StateRef, and commits task outcome.
pub fn welcome_email(state: &b::Account, state_id: &str) -> b::WelcomeEmailResponse {
    eprintln!(
        "Sending email:\n====\n{}\n====",
        welcome_body(state, state_id)
    );
    b::WelcomeEmailResponse {}
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn original_account_scenario_and_error_payload() {
        let mut state = b::Account::default();
        assert_eq!(balance(&state).balance, 0);
        assert_eq!(
            deposit(&mut state, b::DepositRequest { amount: 100 })
                .unwrap()
                .updated_balance,
            100
        );
        assert_eq!(
            withdraw(&mut state, b::WithdrawRequest { amount: 60 })
                .unwrap()
                .updated_balance,
            40
        );
        match *withdraw(&mut state, b::WithdrawRequest { amount: 65 }).unwrap_err() {
            a::AccountMethodsWithdrawError::OverdraftError(error) => {
                assert_eq!(error.amount, 25);
                assert_eq!(error.encode_to_vec(), vec![8, 25]);
            }
            other => panic!("wrong error: {other:?}"),
        }
        assert_eq!(state.balance, 40);
    }
    #[test]
    fn constructor_effect_preserves_task_response_identity() {
        let reference = reboot::state_ref::StateRef::from_id("bank.v1.Account", "bob")
            .unwrap()
            .to_string();
        let mut state = b::Account::default();
        let effect = open_effect(
            &mut state,
            b::OpenRequest {
                customer_name: "Bob".into(),
            },
            &reference,
        );
        assert_eq!(state.customer_name, "Bob");
        assert_eq!(state.balance, 0);
        assert_eq!(effect.task_upserts.len(), 1);
        let task = &effect.task_upserts[0];
        assert_eq!(task.method, "WelcomeEmail");
        assert_eq!(
            effect
                .response
                .welcome_email_task_id
                .unwrap()
                .encode_to_vec(),
            task.task_id.as_ref().unwrap().encode_to_vec()
        );
        assert!(task.response_or_error.is_none()); // No invented completed task or ACK.
        assert_eq!(
            welcome_body(&state, "bob"),
            "Hello Bob,\n\nWe are delighted to welcome you as a customer.\nYour new account has been opened, and has ID 'bob'.\n\nBest regards,\nYour Bank"
        );
    }
    #[test]
    fn unrepresentable_values_do_not_mutate() {
        let mut state = b::Account {
            customer_name: "Alice".into(),
            balance: u64::MAX,
        };
        assert!(deposit(&mut state, b::DepositRequest { amount: 1 }).is_err());
        assert_eq!(state.balance, u64::MAX);
        state.balance = 0;
        assert!(matches!(
            withdraw(
                &mut state,
                b::WithdrawRequest {
                    amount: u64::from(u32::MAX) + 1
                }
            )
            .map_err(|error| *error),
            Err(a::AccountMethodsWithdrawError::Grpc(_))
        ));
        assert_eq!(state.balance, 0);
    }
}
