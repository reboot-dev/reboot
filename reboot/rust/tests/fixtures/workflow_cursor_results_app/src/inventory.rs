// Fixture inventory, not a change to the Database recovery protocol.
// None reads only workflow-root keys; iteration keys require explicit reads.
use std::future::Future;

const INVENTORY_CONCURRENCY: usize = 32;

async fn inventory<T, F, Fut>(current: u64, read: F) -> Result<Vec<T>, String>
where
    T: Send + 'static,
    F: Fn(Option<u64>) -> Fut,
    Fut: Future<Output = Result<Vec<T>, String>> + Send + 'static,
{
    let mut records = read(None).await?;
    let mut pending = tokio::task::JoinSet::new();
    // O(current) bounded RPCs, at most 32 active streams, not O(current)
    // connections/tasks. Retain actual returned records, never inferred counts.
    for iteration in 0..=current {
        pending.spawn(read(Some(iteration)));
        if pending.len() == INVENTORY_CONCURRENCY {
            records.extend(
                pending
                    .join_next()
                    .await
                    .ok_or("missing inventory task")?
                    .map_err(|e| e.to_string())??,
            );
        }
    }
    while let Some(result) = pending.join_next().await {
        records.extend(result.map_err(|e| e.to_string())??);
    }
    Ok(records)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::{Arc, Mutex};

    #[tokio::test]
    async fn root_only_recovery_does_not_hide_old_nonzero_iteration_leak() {
        let scopes = Arc::new(Mutex::new(Vec::new()));
        let active = Arc::new(AtomicUsize::new(0));
        let peak = Arc::new(AtomicUsize::new(0));
        let records = inventory(9999, |scope| {
            let (scopes, active, peak) = (scopes.clone(), active.clone(), peak.clone());
            async move {
                scopes.lock().unwrap().push(scope);
                let n = active.fetch_add(1, Ordering::SeqCst) + 1;
                peak.fetch_max(n, Ordering::SeqCst);
                tokio::task::yield_now().await;
                active.fetch_sub(1, Ordering::SeqCst);
                // Match the C++ split: the None query returns root ONLY.
                Ok(match scope {
                    None => vec![(None, "root")],
                    Some(7341) => vec![(scope, "old-leak")],
                    Some(9999) => vec![(scope, "current")],
                    _ => vec![],
                })
            }
        })
        .await
        .unwrap();
        let mut scopes = scopes.lock().unwrap();
        scopes.sort();
        assert_eq!(scopes.len(), 10001);
        assert_eq!(scopes[0], None);
        assert_eq!(scopes[1..], (0..10000).map(Some).collect::<Vec<_>>());
        assert_eq!(records.len(), 3);
        assert!(records.contains(&(Some(7341), "old-leak")));
        assert!(
            !records
                .iter()
                .all(|(scope, _)| matches!(scope, None | Some(9999)))
        );
        assert!(peak.load(Ordering::SeqCst) <= INVENTORY_CONCURRENCY);
        assert!(peak.load(Ordering::SeqCst) > 1);
    }

    #[tokio::test]
    async fn read_failure_rejects_partial_inventory() {
        let result = inventory(2, |scope| async move {
            if scope == Some(1) {
                Err("inventory read failed".into())
            } else {
                Ok(vec![scope])
            }
        })
        .await;
        assert_eq!(result.unwrap_err(), "inventory read failed");
    }
}
