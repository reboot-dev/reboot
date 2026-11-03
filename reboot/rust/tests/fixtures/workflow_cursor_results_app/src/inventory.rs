// Fixture inventory, not a change to the Database recovery protocol.
// C++ RecoverIdempotentMutations uses an UNDELIMITED decimal iteration prefix:
// Some(9) also returns 90..99, 900..999, etc. None reads root keys only.
use std::future::Future;

async fn inventory<T, F, Fut, S>(current: u64, read: F, scope_of: S) -> Result<Vec<T>, String>
where
    F: Fn(Option<u64>) -> Fut,
    Fut: Future<Output = Result<Vec<T>, String>>,
    S: Fn(&T) -> Option<u64>,
{
    let mut records = read(None).await?;
    if records.iter().any(|record| scope_of(record).is_some()) {
        return Err("root inventory returned iteration-scoped record".into());
    }
    // Canonical u64 decimal encodings partition into ten disjoint first-digit
    // prefixes. Scan all ten even when current < 9, so unexpected future records
    // fail closed too. Every persisted iteration is read exactly once, including
    // old nonzero leaks; no filtering, deduplication, or inferred counts.
    for prefix in 0..=9 {
        let batch = read(Some(prefix)).await?;
        for record in &batch {
            let iteration = scope_of(record).ok_or("iteration inventory returned root record")?;
            if !iteration.to_string().starts_with(&prefix.to_string()) {
                return Err(format!(
                    "inventory prefix {prefix} returned wrong iteration scope {iteration}"
                ));
            }
            if iteration > current {
                return Err(format!(
                    "inventory returned future iteration {iteration} beyond task {current}"
                ));
            }
        }
        records.extend(batch);
    }
    Ok(records)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{Arc, Mutex};

    #[tokio::test]
    async fn decimal_prefix_partition_retains_every_actual_returned_record() {
        let scopes = Arc::new(Mutex::new(Vec::new()));
        let rows = vec![
            None,
            Some(0),
            Some(9),
            Some(90),
            Some(999),
            Some(7341),
            Some(9999),
        ];
        let records = inventory(
            9999,
            |scope| {
                scopes.lock().unwrap().push(scope);
                let rows = rows.clone();
                async move {
                    // Model the source-backed lexical prefix, not exact equality.
                    Ok(rows
                        .into_iter()
                        .filter(|row| match (scope, row) {
                            (None, None) => true,
                            (Some(prefix), Some(iteration)) => {
                                iteration.to_string().starts_with(&prefix.to_string())
                            }
                            _ => false,
                        })
                        .collect())
                }
            },
            |row| *row,
        )
        .await
        .unwrap();
        assert_eq!(
            *scopes.lock().unwrap(),
            std::iter::once(None)
                .chain((0..=9).map(Some))
                .collect::<Vec<_>>()
        );
        let mut records = records;
        records.sort();
        assert_eq!(records, rows);
        assert!(records.contains(&Some(7341))); // GC must still reject this leak.
    }

    #[tokio::test]
    async fn invalid_scope_or_failed_read_rejects_partial_inventory() {
        for (requested, returned, expected) in [
            (
                None,
                Some(1),
                "root inventory returned iteration-scoped record",
            ),
            (Some(1), None, "iteration inventory returned root record"),
            (
                Some(1),
                Some(9),
                "inventory prefix 1 returned wrong iteration scope 9",
            ),
            (
                Some(9),
                Some(9999),
                "inventory returned future iteration 9999 beyond task 999",
            ),
        ] {
            let result = inventory(
                999,
                |scope| async move {
                    Ok(if scope == requested {
                        vec![returned]
                    } else {
                        vec![]
                    })
                },
                |row| *row,
            )
            .await;
            assert_eq!(result.unwrap_err(), expected);
        }
        let result = inventory(
            2,
            |scope| async move {
                if scope == Some(1) {
                    Err("inventory read failed".into())
                } else {
                    Ok(vec![])
                }
            },
            |row: &Option<u64>| *row,
        )
        .await;
        assert_eq!(result.unwrap_err(), "inventory read failed");
    }
}
