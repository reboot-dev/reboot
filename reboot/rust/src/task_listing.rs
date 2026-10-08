// Observations of the current local dispatcher, not durable task history.
// Populate only after complete canonical recovery/validation. Phase timestamps
// describe this server generation (including recovery), as in Python TasksCache.
use std::collections::BTreeMap;

#[derive(Default)]
struct TaskListing(Mutex<BTreeMap<Vec<u8>, db::TaskInfo>>);

fn listing_now() -> prost_types::Timestamp {
    let now = chrono::Utc::now();
    prost_types::Timestamp {
        seconds: now.timestamp(),
        nanos: now.timestamp_subsec_nanos() as i32,
    }
}

impl TaskListing {
    fn observe(&self, pending: &[db::Task]) {
        let mut entries = self.0.lock().expect("task listing mutex poisoned");
        entries.retain(|id, _| {
            pending.iter().any(|task| {
                task.task_id
                    .as_ref()
                    .is_some_and(|task_id| &task_id.task_uuid == id)
            })
        });
        for task in pending {
            let id = task.task_id.as_ref().expect("validated pending task ID");
            entries
                .entry(id.task_uuid.clone())
                .or_insert_with(|| db::TaskInfo {
                    status: db::task_info::Status::Scheduled as i32,
                    task_id: Some(id.clone()),
                    method: task.method.clone(),
                    occurred_at: Some(listing_now()),
                    scheduled_at: task.timestamp,
                    iterations: task.iteration,
                    num_runs_failed_recently: 0,
                });
        }
    }

    fn started(&self, task: &db::Task) {
        if let Some(info) = self
            .0
            .lock()
            .expect("task listing mutex poisoned")
            .get_mut(&task.task_id.as_ref().expect("validated task ID").task_uuid)
        {
            info.status = db::task_info::Status::Started as i32;
            info.occurred_at = Some(listing_now());
            info.scheduled_at = None;
        }
    }

    fn retry(&self, task: &db::Task, delay: std::time::Duration) {
        if let Some(info) = self
            .0
            .lock()
            .expect("task listing mutex poisoned")
            .get_mut(&task.task_id.as_ref().expect("validated task ID").task_uuid)
        {
            info.status = db::task_info::Status::ScheduledRetry as i32;
            info.num_runs_failed_recently += 1;
            info.occurred_at = Some(listing_now());
            let due = chrono::Utc::now()
                + chrono::Duration::from_std(delay).expect("bounded retry delay");
            info.scheduled_at = Some(prost_types::Timestamp {
                seconds: due.timestamp(),
                nanos: due.timestamp_subsec_nanos() as i32,
            });
        }
    }

    fn snapshot(&self) -> Vec<db::TaskInfo> {
        self.0
            .lock()
            .expect("task listing mutex poisoned")
            .values()
            .cloned()
            .collect()
    }

    fn clear(&self) {
        self.0.lock().expect("task listing mutex poisoned").clear();
    }
}

#[cfg(test)]
#[path = "task_listing_tests.rs"]
mod task_listing_service_tests;

#[cfg(test)]
mod listing_tests {
    use super::*;
    fn task(byte: u8) -> db::Task {
        db::Task {
            task_id: Some(db::TaskId {
                state_type: "test.Actor".into(),
                state_ref: "actor".into(),
                task_uuid: vec![byte; 16],
            }),
            method: "Run".into(),
            status: db::task::Status::Pending as i32,
            timestamp: Some(prost_types::Timestamp {
                seconds: 4_000_000_000,
                nanos: 0,
            }),
            ..Default::default()
        }
    }
    #[test]
    fn phases_are_observed_and_rescans_do_not_reset_them() {
        let cache = TaskListing::default();
        let a = task(1);
        let b = task(2);
        cache.observe(&[b.clone(), a.clone()]);
        assert_eq!(cache.snapshot()[0].task_id, a.task_id);
        assert_eq!(
            cache.snapshot()[0].status,
            db::task_info::Status::Scheduled as i32
        );
        cache.started(&a);
        cache.observe(&[a.clone(), b]);
        assert_eq!(
            cache.snapshot()[0].status,
            db::task_info::Status::Started as i32
        );
        assert!(cache.snapshot()[0].scheduled_at.is_none());
        cache.retry(&a, std::time::Duration::from_millis(25));
        assert_eq!(
            cache.snapshot()[0].status,
            db::task_info::Status::ScheduledRetry as i32
        );
        assert_eq!(cache.snapshot()[0].num_runs_failed_recently, 1);
        assert!(cache.snapshot()[0].occurred_at.is_some());
        cache.started(&a);
        cache.observe(&[a]);
        assert_eq!(cache.snapshot().len(), 1);
        assert_eq!(cache.snapshot()[0].num_runs_failed_recently, 1);
        cache.clear();
        assert!(cache.snapshot().is_empty());
    }
}
