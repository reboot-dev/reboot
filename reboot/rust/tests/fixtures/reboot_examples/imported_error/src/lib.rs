pub mod rbt {
    // Generated Tonic signatures intentionally retain tonic::Status.
    #[allow(clippy::result_large_err)]
    pub mod v1alpha1 {
        tonic::include_proto!("rbt.v1alpha1");
    }
}
pub mod bank {
    #[allow(clippy::result_large_err)]
    pub mod v1 {
        tonic::include_proto!("bank.v1");
    }
}
pub mod hello_tasks {
    #[allow(clippy::result_large_err)]
    pub mod v1 {
        tonic::include_proto!("hello_tasks.v1");
    }
}
#[allow(clippy::result_large_err)]
pub mod tasks_adapter {
    include!(concat!(env!("OUT_DIR"), "/hello_tasks/v1/hello.reboot.rs"));
    #[cfg(test)]
    mod tests {
        // Registration-only handler: any execution is a test failure.
        struct RegistrationOnly;
        #[tonic::async_trait]
        impl super::HelloMethodsDatabaseHandler for RegistrationOnly {
            async fn messages(
                &self,
                _: &crate::hello_tasks::v1::Hello,
                _: crate::hello_tasks::v1::MessagesRequest,
            ) -> Result<crate::hello_tasks::v1::MessagesResponse, tonic::Status> {
                panic!("unexpected handler execution")
            }
            async fn send(
                &self,
                _: &mut crate::hello_tasks::v1::Hello,
                _: crate::hello_tasks::v1::SendRequest,
            ) -> Result<crate::hello_tasks::v1::SendResponse, tonic::Status> {
                panic!("unexpected handler execution")
            }
            async fn warning(
                &self,
                _: &mut crate::hello_tasks::v1::Hello,
                _: crate::hello_tasks::v1::WarningRequest,
            ) -> Result<crate::hello_tasks::v1::WarningResponse, tonic::Status> {
                panic!("unexpected handler execution")
            }
            async fn erase(
                &self,
                _: &mut crate::hello_tasks::v1::Hello,
                _: crate::hello_tasks::v1::EraseRequest,
            ) -> Result<crate::hello_tasks::v1::EraseResponse, tonic::Status> {
                panic!("unexpected handler execution")
            }
        }
        #[tokio::test]
        async fn plain_owner_registration_rejects_invalid_identity_and_replacement() {
            assert_eq!(<super::HelloDurableState as reboot::runtime::DurableStateDeclaration>::TASK_STATE_ADMISSION, reboot::runtime::StateAdmission::DefaultOnAbsent);
            assert_eq!(<crate::account_adapter::AccountDurableState as reboot::runtime::DurableStateDeclaration>::TASK_STATE_ADMISSION, reboot::runtime::StateAdmission::RequireExisting);
            let store =
                reboot::runtime::DatabaseActorStore::connect_lazy("http://127.0.0.1:1").unwrap();
            let adapter = super::HelloMethodsDatabaseAdapter::new(store, RegistrationOnly);
            assert!(
                adapter
                    .clone()
                    .with_one_shot_writer_tasks("bad-ref")
                    .is_err()
            );
            let wrong = reboot::state_ref::StateRef::from_id("bank.v1.Account", "hello")
                .unwrap()
                .to_string();
            assert!(adapter.clone().with_one_shot_writer_tasks(&wrong).is_err());
            let state_ref = reboot::state_ref::StateRef::from_id("hello_tasks.v1.Hello", "hello")
                .unwrap()
                .to_string();
            let (attached, _owner) = adapter.with_one_shot_writer_tasks(&state_ref).unwrap();
            assert!(
                attached
                    .clone()
                    .with_one_shot_reader_tasks(&state_ref)
                    .is_err()
            );
            assert!(attached.with_one_shot_writer_tasks(&state_ref).is_err());
        }
        #[test]
        fn original_warning_and_erase_descriptors_keep_task_identity_and_payload() {
            use prost::Message;
            let request = crate::hello_tasks::v1::WarningRequest {
                message_id: "message-37".into(),
            };
            let task = super::HelloMethodsTasksAt::warning(
                "encoded-state-ref",
                &request,
                prost_types::Timestamp {
                    seconds: 7,
                    nanos: 0,
                },
            );
            assert_eq!(task.method, "Warning");
            assert_eq!(task.timestamp.unwrap().seconds, 7);
            let id = task.task_id.unwrap();
            assert_eq!(id.state_type, "hello_tasks.v1.Hello");
            assert_eq!(id.state_ref, "encoded-state-ref");
            assert_eq!(id.task_uuid.len(), 16);
            assert_eq!(
                crate::hello_tasks::v1::WarningRequest::decode(task.request.as_slice()).unwrap(),
                request
            );
            let erase = super::HelloMethodsTasks::erase(
                "encoded-state-ref",
                &crate::hello_tasks::v1::EraseRequest {
                    message_id: "message-37".into(),
                },
            );
            assert_eq!(erase.method, "Erase");
            assert!(erase.timestamp.is_none());
            assert_ne!(erase.task_id.unwrap().task_uuid, id.task_uuid);
        }
    }
}
#[allow(clippy::result_large_err)]
pub mod account_adapter {
    include!(concat!(env!("OUT_DIR"), "/bank/v1/account.reboot.rs"));
    #[cfg(test)]
    mod tests {
        use super::AccountMethodsWithdrawError;
        #[test]
        fn original_imported_overdraft_prost_payload_round_trips() {
            let status =
                AccountMethodsWithdrawError::OverdraftError(crate::bank::v1::OverdraftError {
                    amount: 37,
                })
                .into_status();
            let details = reboot::declared_error_details(&status).unwrap().unwrap();
            assert_eq!(details.details.len(), 1);
            assert_eq!(
                details.details[0].type_url,
                "type.googleapis.com/bank.v1.OverdraftError"
            );
            let AccountMethodsWithdrawError::OverdraftError(payload) =
                AccountMethodsWithdrawError::from_status(status)
            else {
                panic!("typed payload lost");
            };
            assert_eq!(payload.amount, 37);
        }
        #[test]
        fn foreign_url_and_corrupt_payload_fall_back_to_transport_error() {
            let foreign = reboot::declared_error_status(
                tonic::Code::Unknown,
                "foreign",
                "type.googleapis.com/foreign.v1.OverdraftError",
                &crate::bank::v1::OverdraftError { amount: 37 },
            );
            assert!(matches!(
                AccountMethodsWithdrawError::from_status(foreign),
                AccountMethodsWithdrawError::Grpc(_)
            ));
            let status =
                AccountMethodsWithdrawError::OverdraftError(crate::bank::v1::OverdraftError {
                    amount: 37,
                })
                .into_status();
            let mut rich = reboot::declared_error_details(&status).unwrap().unwrap();
            rich.details[0].value = vec![0xff];
            let corrupt = tonic::Status::with_details(
                tonic::Code::Unknown,
                "corrupt",
                prost::Message::encode_to_vec(&rich).into(),
            );
            assert!(matches!(
                AccountMethodsWithdrawError::from_status(corrupt),
                AccountMethodsWithdrawError::Grpc(_)
            ));
        }
    }
}
