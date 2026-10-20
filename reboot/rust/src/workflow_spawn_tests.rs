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
            response_type: "type.googleapis.com/demo.Result".into(),
            errors: vec!["type.googleapis.com/demo.Failed".into()],
        };
        let fingerprint = spawn_fingerprint(&task, &request);
        assert_eq!(fingerprint, spawn_fingerprint(&task, &request));
        for changed in 0..8 {
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
                _ => request.errors.clear(),
            }
            assert_ne!(
                fingerprint,
                spawn_fingerprint(&task, &request),
                "changed field {changed}"
            );
        }
    }
}
