use super::*;

fn id(n: u8) -> database::TaskId {
    database::TaskId {
        state_type: "test.Account".into(),
        state_ref: "actor".into(),
        task_uuid: vec![n; 16],
    }
}
fn task(n: u8, completed: bool) -> database::Task {
    database::Task {
        task_id: Some(id(n)),
        method: "Workflow".into(),
        request: vec![8, n],
        status: if completed {
            database::task::Status::Completed
        } else {
            database::task::Status::Pending
        } as i32,
        response_or_error: completed.then(|| {
            database::task::ResponseOrError::Response(prost_types::Any {
                type_url: "type.googleapis.com/test.Response".into(),
                value: vec![],
            })
        }),
        ..Default::default()
    }
}
fn response(tasks: Vec<database::Task>) -> database::LoadResponse {
    database::LoadResponse {
        tasks,
        ..Default::default()
    }
}
#[test]
fn positive_reads_preserve_completed_provenance_and_requested_order() {
    let pending = task(1, false);
    let mut completed = task(2, true);
    completed.iteration = 7;
    assert_eq!(
        resolve(
            &[id(1), id(2)],
            response(vec![completed.clone(), pending.clone()])
        )
        .unwrap(),
        vec![pending, completed]
    );
    let req = request(&[id(1)]).unwrap();
    assert!(req.actors.is_empty());
    assert_eq!(req.task_ids, vec![id(1)]);
}
#[test]
fn every_omission_is_uncertainty_not_absence() {
    for tasks in [vec![], vec![task(1, false)]] {
        assert_eq!(
            resolve(&[id(1), id(2)], response(tasks))
                .unwrap_err()
                .code(),
            tonic::Code::FailedPrecondition
        );
    }
}
#[test]
fn pending_completed_double_record_and_foreign_identity_fail() {
    for tasks in [vec![task(1, false), task(1, true)], vec![task(3, true)]] {
        assert_eq!(
            resolve(&[id(1), id(2)], response(tasks))
                .unwrap_err()
                .code(),
            tonic::Code::DataLoss
        );
    }
}
#[test]
fn malformed_identity_status_and_terminal_fail_closed() {
    for n in 0..7 {
        let mut bad = task(1, false);
        match n {
            0 => bad.task_id = None,
            1 => bad.task_id.as_mut().unwrap().state_ref = "foreign".into(),
            2 => bad.method.clear(),
            3 => bad.status = 999,
            4 => bad.status = database::task::Status::Unknown as i32,
            5 => bad.status = database::task::Status::Completed as i32,
            _ => bad.response_or_error = task(1, true).response_or_error,
        }
        assert_eq!(
            resolve(&[id(1)], response(vec![bad])).unwrap_err().code(),
            tonic::Code::DataLoss,
            "vector {n}"
        );
    }
    let mut unexpected = response(vec![task(1, false)]);
    unexpected.actors.push(database::Actor::default());
    assert!(resolve(&[id(1)], unexpected).is_err());
}
#[test]
fn input_validation_precedes_io_and_preserves_identity_tokens() {
    assert!(request(&[]).is_err());
    assert!(request(&[id(1), id(1)]).is_err());
    assert!(request(&vec![id(1); MAX_IDENTITIES + 1]).is_err());
    for n in 0..3 {
        let mut bad = id(1);
        match n {
            0 => bad.state_type.clear(),
            1 => bad.state_ref.clear(),
            _ => bad.task_uuid.pop().map(|_| ()).unwrap(),
        }
        assert_eq!(
            request(&[bad]).unwrap_err().code(),
            tonic::Code::InvalidArgument
        );
    }
    let mut exact = id(1);
    exact.state_ref = "unmodified opaque token".into();
    assert_eq!(request(&[exact.clone()]).unwrap().task_ids, vec![exact]);
}
