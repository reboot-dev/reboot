#[cfg(test)]
mod spawn_contract_tests {
    use super::*;
    #[test]
    fn spawn_fingerprint_binds_task_destination_payload_schedule_and_terminal_schema() {
        let task = db::Task {
            task_id: Some(db::TaskId {
                state_type: "demo.State".into(),
                state_ref: "actor".into(),
                task_uuid: vec![7; 16],
            }),
            method: "Child".into(),
            request: vec![8, 7],
            status: db::task::Status::Pending as i32,
            ..Default::default()
        };
        let request = crate::workflow_spawn_proto::SpawnRequest {
            method: "demo.Methods.Child".into(),
            request: task.request.clone(),
            timestamp: None,
            relative_delay: None,
            response_type: "type.googleapis.com/demo.Result".into(),
            errors: vec!["type.googleapis.com/demo.Failed".into()],
        };
        let fingerprint = spawn_fingerprint(&task, &request);
        assert_eq!(fingerprint, spawn_fingerprint(&task, &request));
        for changed in 0..9 {
            let mut task = task.clone();
            let mut request = request.clone();
            match changed {
                0 => task.task_id.as_mut().unwrap().state_ref = "other".into(),
                1 => task.task_id.as_mut().unwrap().task_uuid[0] = 9,
                2 => task.request = vec![8, 8],
                3 => request.method = "demo.Methods.Other".into(),
                4 => request.request = vec![8, 8],
                5 => {
                    request.timestamp = Some(prost_types::Timestamp {
                        seconds: 1,
                        nanos: 0,
                    })
                }
                6 => request.response_type = "type.googleapis.com/demo.OtherResult".into(),
                7 => request.errors.clear(),
                _ => {
                    request.relative_delay = Some(prost_types::Duration {
                        seconds: 1,
                        nanos: 0,
                    })
                }
            }
            assert_ne!(
                fingerprint,
                spawn_fingerprint(&task, &request),
                "changed field {changed}"
            );
        }
    }
    #[test]
    fn relative_schedule_checks_normalization_carry_and_absolute_range() {
        let delay = prost_types::Duration {
            seconds: 0,
            nanos: 1,
        };
        assert_eq!(
            relative_workflow_timestamp(&delay, std::time::Duration::new(10, 999_999_999)).unwrap(),
            prost_types::Timestamp {
                seconds: 11,
                nanos: 0
            }
        );
        for delay in [
            prost_types::Duration {
                seconds: -1,
                nanos: 0,
            },
            prost_types::Duration {
                seconds: 0,
                nanos: -1,
            },
            prost_types::Duration {
                seconds: 0,
                nanos: 1_000_000_000,
            },
            prost_types::Duration {
                seconds: 315_576_000_001,
                nanos: 0,
            },
        ] {
            assert!(relative_workflow_timestamp(&delay, std::time::Duration::ZERO).is_err());
        }
        assert!(
            relative_workflow_timestamp(
                &prost_types::Duration {
                    seconds: 1,
                    nanos: 0
                },
                std::time::Duration::from_secs(253_402_300_799)
            )
            .is_err()
        );
    }
    #[tokio::test]
    async fn relative_schedule_requires_distinct_rpc_before_admission_or_database() {
        use crate::workflow_spawn_proto::workflow_spawner_server::WorkflowSpawner as Service;
        let (service, _owner, _) = task_listing_service_tests::setup(0);
        let tasks = service.tasks.values().next().unwrap().clone();
        let spawner = WorkflowSpawner::new(tasks, crate::auth::AuthorizationPolicy::default());
        let relative = crate::workflow_spawn_proto::SpawnRequest {
            relative_delay: Some(prost_types::Duration {
                seconds: 1,
                nanos: 0,
            }),
            ..Default::default()
        };
        assert_eq!(
            spawner
                .spawn(tonic::Request::new(relative.clone()))
                .await
                .unwrap_err()
                .code(),
            tonic::Code::InvalidArgument
        );
        assert_eq!(
            spawner
                .spawn_after(tonic::Request::new(
                    crate::workflow_spawn_proto::SpawnRequest::default()
                ))
                .await
                .unwrap_err()
                .code(),
            tonic::Code::InvalidArgument
        );
        assert_eq!(
            spawner
                .spawn_after(tonic::Request::new(
                    crate::workflow_spawn_proto::SpawnRequest {
                        timestamp: Some(prost_types::Timestamp::default()),
                        ..relative
                    }
                ))
                .await
                .unwrap_err()
                .code(),
            tonic::Code::InvalidArgument
        );
    }
}
