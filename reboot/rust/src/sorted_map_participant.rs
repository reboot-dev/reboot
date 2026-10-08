include!("sorted_map_ownership_tests.rs");
// Narrow early-native-visibility prerequisite, included in durable_participant.
// This is NOT a generated builtin adapter or public construction path.

const SORTED_MAP_STATE_TYPE: &str = "rbt.std.collections.v1.SortedMap";
const SORTED_MAP_ENTRY_TYPE: &str = "rbt.std.collections.v1.SortedMapEntry";

impl Pending {
    fn native_transaction(&self, state_type: &str, state_ref: &str) -> database::Transaction {
        database::Transaction {
            state_type: state_type.into(),
            state_ref: state_ref.into(),
            transaction_ids: self
                .transaction_ids
                .iter()
                .map(|id| id.as_bytes().to_vec())
                .collect(),
            coordinator_state_type: self.coordinator_state_type.clone(),
            coordinator_state_ref: self.coordinator_state_ref.clone(),
            prepared: false,
            uncommitted_tasks: vec![],
            uncommitted_idempotent_mutations: vec![],
        }
    }
}

fn sorted_map_key(key: &str) -> Result<(), Status> {
    // Slash escaping changes native order. This first slice explicitly rejects it.
    if key.contains('/') {
        return Err(Status::invalid_argument(
            "early SortedMap keys must not contain slash",
        ));
    }
    crate::state_ref::StateRef::from_id(SORTED_MAP_ENTRY_TYPE, key)
        .map(|_| ())
        .map_err(|error| Status::invalid_argument(error.to_string()))
}

fn sorted_map_bounds(
    start: &Option<String>,
    end: &Option<String>,
    limit: u32,
    reverse: bool,
) -> Result<(), Status> {
    let invalid = limit == 0
        || start
            .as_ref()
            .zip(end.as_ref())
            .is_some_and(|(a, b)| if reverse { a <= b } else { a >= b });
    if invalid {
        return Err(crate::declared_error_status(
            tonic::Code::Unknown,
            "invalid SortedMap range",
            "type.googleapis.com/rbt.std.collections.v1.InvalidRangeError",
            &crate::sorted_map_proto::InvalidRangeError {
                message: "limit must be nonzero and bounds strictly ordered".into(),
            },
        ));
    }
    for key in start.iter().chain(end.iter()) {
        sorted_map_key(key)?;
    }
    Ok(())
}

impl<C: ParticipantSidecar> StartedLocalTransaction<C> {
    fn validate_early_map<'a>(
        &self,
        pending: &'a mut Option<Pending>,
    ) -> Result<&'a mut Pending, Status> {
        let current = pending
            .as_mut()
            .filter(|p| p.root_id == self.transaction_id && p.local_owner == Some(self.local_owner))
            .ok_or_else(|| {
                Status::failed_precondition("early map capability incarnation no longer admitted")
            })?;
        let parent =
            crate::state_ref::StateRef::from_maybe_readable(self.participant.state_ref.clone())
                .map_err(|error| Status::invalid_argument(error.to_string()))?;
        if self.participant.state_type != SORTED_MAP_STATE_TYPE
            || !parent.matches_state_type(SORTED_MAP_STATE_TYPE)
            || parent.as_str() != self.participant.state_ref
            || self.participant.sidecar.database_endpoint().is_none()
            || current.transaction_ids != [self.transaction_id]
            || current.reusable.is_some()
            || current.factory
            || current.lock.is_shared()
            || current.disposition != PendingDisposition::Commit
            || current.prepared
            || current.terminal_attempted
            || current.loaded_state.as_deref() != Some(&[])
            || current
                .effects
                .state
                .as_ref()
                .is_some_and(|s| !s.is_empty())
            || !current.effects.task_upserts.is_empty()
            || !current.effects.idempotent_mutations.is_empty()
        {
            return Err(Status::failed_precondition(
                "early map requires existing empty canonical actor, exact endpoint, fresh serial exclusive root; no factory/tasks/shared/nested/reuse",
            ));
        }
        if current.native_uncertain {
            return Err(Status::unavailable(
                "early native call uncertain; abort required",
            ));
        }
        Ok(current)
    }

    async fn early_map_store(
        &self,
        pending: &mut Pending,
        entries: Vec<(String, Option<Vec<u8>>)>,
    ) -> Result<(), Status> {
        let parent =
            crate::state_ref::StateRef::from_maybe_readable(self.participant.state_ref.clone())
                .map_err(|error| Status::invalid_argument(error.to_string()))?;
        let upserts = entries
            .into_iter()
            .map(|(key, value)| {
                sorted_map_key(&key)?;
                Ok(database::ColocatedUpsert {
                    state_type: SORTED_MAP_ENTRY_TYPE.into(),
                    key: parent
                        .colocate(SORTED_MAP_ENTRY_TYPE, &key)
                        .map_err(|error| Status::invalid_argument(error.to_string()))?
                        .to_string(),
                    value,
                })
            })
            .collect::<Result<Vec<_>, Status>>()?;
        let transaction =
            pending.native_transaction(&self.participant.state_type, &self.participant.state_ref);
        // Mark both BEFORE the first await that can send a native mutation.
        // Neither cancellation nor a lost ACK can turn this back into undurable ownership.
        pending.native_started = true;
        pending.native_uncertain = true;
        self.participant
            .sidecar
            .store(database::StoreRequest {
                actor_upserts: vec![database::Actor {
                    state_type: self.participant.state_type.clone(),
                    state_ref: self.participant.state_ref.clone(),
                    state: Some(vec![]),
                }],
                task_upserts: vec![],
                colocated_upserts: upserts,
                transaction: Some(transaction),
                idempotent_mutation: None,
                ensure_state_types_created: vec![SORTED_MAP_ENTRY_TYPE.into()],
                sync: true,
            })
            .await?;
        pending.native_uncertain = false;
        Ok(())
    }

    /// Enlists an already admitted map in a fresh generated application root.
    /// This direct same-host prerequisite is NOT a generated map inbound adapter.
    /// Admission is recorded before native IO so root cancellation/Abort owns it.
    pub async fn enlist_sorted_map(
        &self,
        context: &crate::runtime::TransactionContext,
    ) -> Result<(), Status> {
        let mut pending = self.participant.pending.lock().await;
        let current = self.validate_early_map(&mut pending)?;
        if context.transaction_ids() != current.transaction_ids
            || context.transaction_coordinator_state_type() != current.coordinator_state_type
            || context.transaction_coordinator_state_ref() != current.coordinator_state_ref
            || context.headers().state_ref == self.participant.state_ref
        {
            return Err(Status::failed_precondition(
                "early map does not belong to this separate generated app root",
            ));
        }
        context.enlist_admitted_early_map(crate::durable_coordinator::ParticipantTarget {
            state_type: self.participant.state_type.clone(),
            state_ref: self.participant.state_ref.clone(),
        })
    }

    /// Stages canonical bytes entries in this admitted native transaction.
    /// This low-level prerequisite deliberately has no generated host/constructor contract.
    pub async fn sorted_map_insert(
        &self,
        request: crate::sorted_map_proto::InsertRequest,
    ) -> Result<crate::sorted_map_proto::InsertResponse, Status> {
        let mut pending = self.participant.pending.lock().await;
        let current = self.validate_early_map(&mut pending)?;
        self.early_map_store(
            current,
            request
                .entries
                .into_iter()
                .map(|(k, v)| (k, Some(v)))
                .collect(),
        )
        .await?;
        Ok(crate::sorted_map_proto::InsertResponse {})
    }

    /// Removes canonical keys; absent keys are harmless and empty values remain distinct.
    pub async fn sorted_map_remove(
        &self,
        request: crate::sorted_map_proto::RemoveRequest,
    ) -> Result<crate::sorted_map_proto::RemoveResponse, Status> {
        let mut pending = self.participant.pending.lock().await;
        let current = self.validate_early_map(&mut pending)?;
        self.early_map_store(
            current,
            request.keys.into_iter().map(|k| (k, None)).collect(),
        )
        .await?;
        Ok(crate::sorted_map_proto::RemoveResponse {})
    }

    async fn early_map_scan(
        &self,
        start: Option<String>,
        end: Option<String>,
        limit: u32,
        reverse: bool,
    ) -> Result<Vec<crate::sorted_map_proto::Entry>, Status> {
        sorted_map_bounds(&start, &end, limit, reverse)?;
        let logical_start = start.clone();
        let logical_end = end.clone();
        let mut pending = self.participant.pending.lock().await;
        let current = self.validate_early_map(&mut pending)?;
        if !current.native_started {
            self.early_map_store(current, vec![]).await?;
        }
        let transaction = Some(
            current.native_transaction(&self.participant.state_type, &self.participant.state_ref),
        );
        let encode = |key: String| {
            crate::state_ref::StateRef::from_id(SORTED_MAP_ENTRY_TYPE, &key)
                .map(|s| s.to_string())
                .map_err(|e| Status::invalid_argument(e.to_string()))
        };
        let start = start.map(encode).transpose()?;
        let end = end.map(encode).transpose()?;
        let (keys, values) = if reverse {
            let response = self
                .participant
                .sidecar
                .colocated_reverse_range(database::ColocatedReverseRangeRequest {
                    state_type: SORTED_MAP_ENTRY_TYPE.into(),
                    parent_state_ref: self.participant.state_ref.clone(),
                    start,
                    end,
                    limit,
                    transaction,
                })
                .await?;
            (response.keys, response.values)
        } else {
            let response = self
                .participant
                .sidecar
                .colocated_range(database::ColocatedRangeRequest {
                    state_type: SORTED_MAP_ENTRY_TYPE.into(),
                    parent_state_ref: self.participant.state_ref.clone(),
                    start,
                    end,
                    limit,
                    transaction,
                })
                .await?;
            (response.keys, response.values)
        };
        if keys.len() != values.len() || keys.len() > limit as usize {
            current.native_uncertain = true;
            return Err(Status::data_loss("native range cardinality mismatch"));
        }
        // Database returns full encoded child references. Validate canonical
        // parent, child type and exact re-encoding before exposing logical IDs.
        let prefix = format!("{}/", self.participant.state_ref);
        let entries = keys
            .into_iter()
            .zip(values)
            .map(|(encoded, value)| {
                let child = encoded
                    .strip_prefix(&prefix)
                    .filter(|s| !s.contains('/'))
                    .ok_or_else(|| Status::data_loss("foreign native map child"))?;
                let child = crate::state_ref::StateRef::from_maybe_readable(child)
                    .map_err(|_| Status::data_loss("malformed native child"))?;
                let key = child.id();
                sorted_map_key(&key)
                    .map_err(|_| Status::data_loss("unsupported native child key"))?;
                if crate::state_ref::StateRef::from_id(SORTED_MAP_ENTRY_TYPE, &key)
                    .map(|s| s.to_string())
                    .ok()
                    .as_deref()
                    != Some(child.as_str())
                {
                    return Err(Status::data_loss("noncanonical native child identity"));
                }
                Ok(crate::sorted_map_proto::Entry { key, value })
            })
            .collect::<Result<Vec<_>, Status>>()?;
        if entries.windows(2).any(|pair| {
            if reverse {
                pair[0].key <= pair[1].key
            } else {
                pair[0].key >= pair[1].key
            }
        }) {
            current.native_uncertain = true;
            return Err(Status::data_loss("native range ordering mismatch"));
        }
        // Transaction iterators can expose staged keys at the native lower
        // bound despite iterate_lower_bound; enforce canonical wire bounds too.
        // This is filtering a bounded page, not fabricated pagination/cursor state.
        Ok(entries
            .into_iter()
            .filter(|entry| {
                logical_start.as_ref().is_none_or(|start| {
                    if reverse {
                        entry.key <= *start
                    } else {
                        entry.key >= *start
                    }
                }) && logical_end.as_ref().is_none_or(|end| {
                    if reverse {
                        entry.key > *end
                    } else {
                        entry.key < *end
                    }
                })
            })
            .collect())
    }

    /// Forward inclusive-start/exclusive-end range, under this exact retained lease.
    /// Range-first starts native participation before scanning; no cursor is fabricated.
    pub async fn sorted_map_range(
        &self,
        request: crate::sorted_map_proto::RangeRequest,
    ) -> Result<crate::sorted_map_proto::RangeResponse, Status> {
        Ok(crate::sorted_map_proto::RangeResponse {
            entries: self
                .early_map_scan(request.start_key, request.end_key, request.limit, false)
                .await?,
        })
    }

    /// Reverse inclusive-start/exclusive-end range, under the same native transaction.
    pub async fn sorted_map_reverse_range(
        &self,
        request: crate::sorted_map_proto::ReverseRangeRequest,
    ) -> Result<crate::sorted_map_proto::ReverseRangeResponse, Status> {
        Ok(crate::sorted_map_proto::ReverseRangeResponse {
            entries: self
                .early_map_scan(request.start_key, request.end_key, request.limit, true)
                .await?,
        })
    }

    /// Point lookup preserving missing versus present empty bytes.
    pub async fn sorted_map_get(
        &self,
        request: crate::sorted_map_proto::GetRequest,
    ) -> Result<crate::sorted_map_proto::GetResponse, Status> {
        sorted_map_key(&request.key)?;
        let entries = self
            .early_map_scan(Some(request.key.clone()), None, 1, false)
            .await?;
        Ok(crate::sorted_map_proto::GetResponse {
            value: entries
                .into_iter()
                .next()
                .filter(|entry| entry.key == request.key)
                .map(|entry| entry.value),
        })
    }
}

#[cfg(test)]
mod early_sorted_map_tests {
    use super::*;
    #[test]
    fn canonical_bounds_and_key_scope_fail_closed() {
        for (start, end, reverse) in [("a", "a", false), ("b", "a", false), ("a", "b", true)] {
            let error =
                sorted_map_bounds(&Some(start.into()), &Some(end.into()), 1, reverse).unwrap_err();
            assert!(!error.details().is_empty());
        }
        assert!(sorted_map_bounds(&None, &None, 0, false).is_err());
        assert!(sorted_map_bounds(&Some("a".into()), &Some("b".into()), 1, false).is_ok());
        assert!(sorted_map_key("a/b").is_err());
        assert!(sorted_map_key("").is_err());
    }
}
