#[cfg(test)]
mod declared_writer_tests {
    use super::*;
    use crate::one_shot_tasks::DeclaredTaskError;
    fn schema() -> Vec<DeclaredTaskError> {
        vec![DeclaredTaskError::new::<crate::proto::Counter>(
            "type.googleapis.com/tests.reboot.protoc.Counter",
        )]
    }
    fn status() -> Status {
        crate::declared_error_status(
            tonic::Code::FailedPrecondition,
            "refused",
            "type.googleapis.com/tests.reboot.protoc.Counter",
            &crate::proto::Counter { value: 42 },
        )
    }
    #[test]
    fn declared_writer_schema_preserves_full_bytes_and_rejects_non_outcomes() {
        let original = status();
        let mut bytes = original.details().to_vec();
        bytes.extend_from_slice(&[0xa0, 0x06, 0x07]);
        let rich = Status::with_details(
            original.code(),
            original.message().to_owned(),
            bytes.clone().into(),
        );
        DeclaredTaskError::validate_status(&schema(), &rich).unwrap();
        let replay = durable_declared_status(&bytes).unwrap();
        assert_eq!(replay.code(), original.code());
        assert_eq!(replay.message(), original.message());
        assert_eq!(replay.details(), bytes);
        assert!(is_durable_declared_writer_error(&replay));
        for invalid in [
            Status::unavailable("network"),
            Status::cancelled("cancelled"),
            Status::with_details(tonic::Code::Unknown, "malformed", vec![0xff].into()),
            Status::with_details(
                tonic::Code::Ok,
                rich.message().to_owned(),
                bytes.clone().into(),
            ),
            Status::with_details(rich.code(), "conflicting", bytes.clone().into()),
            crate::declared_error_status(
                tonic::Code::Unknown,
                "unknown",
                "type.googleapis.com/Other",
                &crate::proto::Counter::default(),
            ),
            Status::with_details(
                tonic::Code::Unknown,
                "malformed declared",
                googleapis_tonic_google_rpc::google::rpc::Status {
                    code: tonic::Code::Unknown as i32,
                    message: "malformed declared".into(),
                    details: vec![prost_types::Any {
                        type_url: "type.googleapis.com/tests.reboot.protoc.Counter".into(),
                        value: vec![0x08],
                    }],
                }
                .encode_to_vec()
                .into(),
            ),
        ] {
            assert!(
                DeclaredTaskError::validate_status(&schema(), &invalid).is_err(),
                "accepted {invalid:?}"
            );
        }
        assert!(DeclaredTaskError::validate_status(&[], &rich).is_err());
    }
    #[test]
    fn declared_writer_receipt_namespace_is_not_success_or_scheduling() {
        let request =
            request_fingerprint("tests.Target.Reject", &crate::proto::Counter { value: 7 });
        assert_ne!(declared_writer_fingerprint(&request), request);
        assert_ne!(
            declared_writer_fingerprint(&request),
            ordinary_scheduling_fingerprint(&request)
        );
        assert_ne!(
            declared_writer_fingerprint(&request),
            declared_writer_fingerprint(&request_fingerprint(
                "tests.Target.Reject",
                &crate::proto::Counter { value: 8 }
            ))
        );
    }
}
