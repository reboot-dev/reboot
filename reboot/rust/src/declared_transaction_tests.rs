#[cfg(test)]
mod declared_transaction_receipt_tests {
    use super::*;
    use crate::one_shot_tasks::DeclaredTaskError;
    fn receipt() -> TransactionIdempotency {
        TransactionIdempotency {
            key: Uuid::from_u128(71),
            request_fingerprint: vec![17; 32],
        }
    }
    fn schema() -> Vec<DeclaredTaskError> {
        vec![DeclaredTaskError::new::<crate::proto::Counter>(
            "type.googleapis.com/tests.Counter",
        )]
    }
    fn error() -> Status {
        crate::declared_error_status(
            tonic::Code::Unknown,
            "business rejection",
            "type.googleapis.com/tests.Counter",
            &crate::proto::Counter { value: 42 },
        )
    }
    #[test]
    fn forwarded_grpc_error_cannot_forge_this_root_receipt_ack() {
        let original = error();
        let bytes = original.details().to_vec();
        let forged = acknowledged_declared_transaction_status(original);
        assert!(is_durable_declared_transaction_error(&forged));
        let failed = without_declared_transaction_ack(forged);
        assert!(!is_durable_declared_transaction_error(&failed));
        assert_eq!(failed.code(), tonic::Code::Unknown);
        assert_eq!(failed.details(), bytes);
    }
    #[test]
    fn canonical_transaction_error_uses_python_aborted_code_without_changing_typed_payload() {
        let error = error();
        let original = crate::declared_error_details(&error).unwrap().unwrap();
        let normalized = canonical_declared_transaction_status(error, &schema()).unwrap();
        let rich = crate::declared_error_details(&normalized).unwrap().unwrap();
        assert_eq!(normalized.code(), tonic::Code::Aborted);
        assert_eq!(rich.code, 10);
        assert_eq!(rich.details, original.details);
        assert_eq!(rich.message, original.message);
    }
    #[test]
    fn declared_abort_is_a_distinct_schema_bound_outcome_not_success_or_writer_error() {
        let receipt = receipt();
        let schema = schema();
        let error = error();
        let mutation = receipt
            .declared_abort_mutation("State", "actor", &error, &schema)
            .unwrap();
        assert!(
            mutation.task_ids.is_empty()
                && mutation.workflow_id.is_none()
                && mutation.workflow_iteration.is_none()
        );
        assert!(
            receipt
                .replay_bound::<crate::proto::Counter>(&mutation, "State", "actor")
                .is_err()
        );
        let replay = receipt
            .replay_outcome_bound::<crate::proto::Counter>(&mutation, "State", "actor", &schema)
            .unwrap_err();
        assert!(is_durable_declared_transaction_error(&replay));
        assert!(!is_durable_declared_writer_error(&replay));
        assert_eq!(replay.details(), error.details());
        let success = receipt.mutation("State", "actor", &crate::proto::Counter { value: 7 });
        assert_eq!(
            receipt
                .replay_outcome_bound::<crate::proto::Counter>(&success, "State", "actor", &schema)
                .unwrap()
                .unwrap()
                .value,
            7
        );
    }
    #[test]
    fn declared_abort_replay_rejects_actor_request_scope_and_schema_substitution() {
        let receipt = receipt();
        let schema = schema();
        let original = receipt
            .declared_abort_mutation("State", "actor", &error(), &schema)
            .unwrap();
        for n in 0..7 {
            let mut mutation = original.clone();
            match n {
                0 => mutation.state_type = "Other".into(),
                1 => mutation.state_ref = "other".into(),
                2 => mutation.workflow_id = Some(vec![1; 16]),
                3 => mutation.workflow_iteration = Some(0),
                4 => mutation
                    .task_ids
                    .push(crate::database_proto::TaskId::default()),
                5 => mutation.request_fingerprint.as_mut().unwrap().push(0),
                _ => mutation.response = vec![255],
            }
            assert!(
                receipt
                    .replay_outcome_bound::<crate::proto::Counter>(
                        &mutation, "State", "actor", &schema
                    )
                    .is_err(),
                "substitution {n}"
            );
        }
        let changed = TransactionIdempotency {
            request_fingerprint: vec![18; 32],
            ..receipt.clone()
        };
        assert!(
            changed
                .replay_outcome_bound::<crate::proto::Counter>(&original, "State", "actor", &schema)
                .is_err()
        );
        assert!(
            receipt
                .replay_outcome_bound::<crate::proto::Counter>(&original, "State", "actor", &[])
                .is_err()
        );
        let another = vec![DeclaredTaskError::new::<crate::proto::Counter>(
            "type.googleapis.com/tests.Other",
        )];
        assert!(
            receipt
                .replay_outcome_bound::<crate::proto::Counter>(
                    &original, "State", "actor", &another
                )
                .is_err()
        );
        let wrong_key = TransactionIdempotency {
            key: Uuid::from_u128(72),
            ..receipt.clone()
        };
        assert!(
            wrong_key
                .replay_outcome_bound::<crate::proto::Counter>(&original, "State", "actor", &schema)
                .unwrap()
                .is_none()
        );
    }
    #[test]
    fn declared_abort_never_adopts_framework_unknown_or_malformed_status() {
        let receipt = receipt();
        let schema = schema();
        for code in [
            tonic::Code::Ok,
            tonic::Code::Cancelled,
            tonic::Code::DeadlineExceeded,
            tonic::Code::Unavailable,
        ] {
            let error = crate::declared_error_status(
                code,
                "not a terminal",
                "type.googleapis.com/tests.Counter",
                &crate::proto::Counter::default(),
            );
            assert!(
                receipt
                    .declared_abort_mutation("State", "actor", &error, &schema)
                    .is_err()
            );
        }
        assert!(
            receipt
                .declared_abort_mutation("State", "actor", &Status::unknown("transport"), &schema)
                .is_err()
        );
        let rich = googleapis_tonic_google_rpc::google::rpc::Status {
            code: 2,
            message: "malformed detail".into(),
            details: vec![prost_types::Any {
                type_url: "type.googleapis.com/tests.Counter".into(),
                value: vec![255],
            }],
        };
        let status = Status::with_details(
            tonic::Code::Unknown,
            rich.message.clone(),
            rich.encode_to_vec().into(),
        );
        assert!(
            receipt
                .declared_abort_mutation("State", "actor", &status, &schema)
                .is_err()
        );
        let empty = crate::declared_error_status(
            tonic::Code::Unknown,
            "valid empty protobuf",
            "type.googleapis.com/tests.Counter",
            &crate::proto::Counter::default(),
        );
        assert!(
            receipt
                .declared_abort_mutation("State", "actor", &empty, &schema)
                .is_ok()
        );
    }
}
