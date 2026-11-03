//! Canonical SortedMap library for admitted same-host fresh exclusive roots.
//!
//! This API is in-process, not a public-header-authorized Tonic adapter. A host
//! injects the native store/participant and registers its control route. Only
//! an active generated root with explicit cancellation ownership can join it.
//! Network inbound children, nested sibling paths and distributed placement are
//! deliberately outside this bounded library. Sessions and every call future
//! MUST remain serial and handler-awaited; no escaping/detached calls are
//! supported. Every polled admission/call now reserves root work through its
//! await; unfinished Drop dooms the root and retains membership uncertainty.
use crate::{
    durable_participant::{
        ActorTransactionStart, DurableActorParticipant, ParticipantStartMode,
        StartedLocalTransaction, TonicParticipantSidecar, TransactionPathContract,
    },
    runtime::{DatabaseActorStore, TransactionContext, TransactionMode},
    sorted_map_proto as proto,
};
use std::sync::Arc;
use tonic::Status;
use uuid::Uuid;

pub(crate) type RetainedMapGuard = Arc<StartedLocalTransaction<TonicParticipantSidecar>>;
// Admission-scoped, not handle/global-scoped. No TransactionContext is stored in
// this cache, so retaining the exact participant incarnation creates no cycle.
pub(crate) type RetainedMapSessions = Arc<
    std::sync::Mutex<
        std::collections::BTreeMap<crate::durable_coordinator::ParticipantTarget, RetainedMapGuard>,
    >,
>;

const MAP: &str = "rbt.std.collections.v1.SortedMap";

/// Host-owned builtin registration. No public header conveys this authority.
#[derive(Clone)]
pub struct SortedMapLibrary {
    store: DatabaseActorStore,
    sidecar: Arc<TonicParticipantSidecar>,
}
impl SortedMapLibrary {
    /// Connects the library to the same exact native endpoint as the app store.
    pub async fn new(store: DatabaseActorStore) -> Result<Self, Status> {
        let sidecar = Arc::new(
            TonicParticipantSidecar::connect(store.database_endpoint().to_owned())
                .await
                .map_err(|error| Status::unavailable(error.to_string()))?,
        );
        Ok(Self { store, sidecar })
    }
    /// Constructs EMPTY canonical state, ensuring the entry CF even for an empty
    /// map. Uses native CreateActor uniqueness and durable idempotent replay.
    pub async fn create(&self, state_ref: &str, key: Uuid) -> Result<SortedMapHandle, Status> {
        let handle = self.target(state_ref).map_err(|error| *error)?;
        self.store.create_empty_sorted_map(state_ref, key).await?;
        Ok(handle)
    }
    /// Attaches to a canonical identity. Existence is checked on admission.
    pub fn target(&self, state_ref: &str) -> Result<SortedMapHandle, Box<Status>> {
        let parsed = crate::state_ref::StateRef::from_maybe_readable(state_ref)
            .map_err(|e| Box::new(Status::invalid_argument(e.to_string())))?;
        if !parsed.matches_state_type(MAP) || parsed.as_str() != state_ref {
            return Err(Box::new(Status::invalid_argument(
                "noncanonical SortedMap identity",
            )));
        }
        Ok(SortedMapHandle {
            participant: DurableActorParticipant::new(self.sidecar.clone(), MAP, state_ref)
                .with_database_actor_gate(&self.store),
            endpoint: self.store.database_endpoint().to_owned(),
        })
    }
}

/// Typed canonical map target; callers cannot choose entry CF/raw child keys.
#[derive(Clone)]
pub struct SortedMapHandle {
    participant: DurableActorParticipant<TonicParticipantSidecar>,
    endpoint: String,
}
impl SortedMapHandle {
    /// The host registers this exact participant's control endpoint before use.
    pub fn participant(&self) -> DurableActorParticipant<TonicParticipantSidecar> {
        self.participant.clone()
    }
    /// Join a genuinely admitted generated app root. Validation precedes actor
    /// admission and native IO; map membership is recorded before eager Store.
    /// Serial reopening under this exact admitted root reuses its retained native
    /// participant. It does not introduce a child path, snapshot or rollback scope.
    pub async fn in_transaction(
        &self,
        context: &TransactionContext,
    ) -> Result<SortedMapSession, Status> {
        let mut operation = context
            .begin_builtin_map_operation(&self.endpoint)
            .inspect_err(|status| context.doom(status.clone()))?;
        let result: Result<SortedMapSession, Status> = async {
            let target = self.participant.actor_target();
            if let Some(guard) = context.retained_builtin_map(&self.endpoint, &target)? {
                // Reuse the exact root-owned native participant/owner rather than
                // reentering its actor gate or recreating its eager transaction.
                return Ok(SortedMapSession {
                    map_ref: target.state_ref.clone(),
                    guard,
                    context: context.clone(),
                    endpoint: self.endpoint.clone(),
                });
            }
            let cache_target = target.clone();
            let guard = self
                .participant
                .start_local(
                    ActorTransactionStart {
                        transaction_ids: context.transaction_ids().to_vec(),
                        transaction_path: TransactionPathContract::RootOnly,
                        coordinator_state_type: context
                            .transaction_coordinator_state_type()
                            .to_owned(),
                        coordinator_state_ref: context
                            .transaction_coordinator_state_ref()
                            .to_owned(),
                        mode: TransactionMode::Exclusive,
                        read_only: false,
                        factory: false,
                        state_type: target.state_type,
                        state_ref: target.state_ref,
                    },
                    ParticipantStartMode::Exclusive,
                )
                .await?;
            // Validate again after awaited admission; a detached context cannot
            // race its root's terminal handoff and gain new map authority.
            context.validate_builtin_map_admission(&self.endpoint)?;
            guard.enlist_sorted_map(context).await?;
            let guard = Arc::new(guard);
            context.retain_builtin_map(&self.endpoint, cache_target, guard.clone())?;
            Ok(SortedMapSession {
                map_ref: self.participant.actor_target().state_ref,
                guard,
                context: context.clone(),
                endpoint: self.endpoint.clone(),
            })
        }
        .await;
        match result {
            Ok(session) => {
                operation
                    .returned(&self.endpoint)
                    .inspect_err(|status| context.doom(status.clone()))?;
                Ok(session)
            }
            Err(status) => {
                context.doom(status.clone());
                Err(status)
            }
        }
    }
}

/// Bounded live keyset query. Continuations are query data, not authorization.
/// Every page runs in its own owning transaction; no cross-RPC snapshot exists.
#[derive(Clone, Debug, Default)]
pub struct PageRequest {
    pub start_key: Option<String>,
    pub end_key: Option<String>,
    pub reverse: bool,
    pub limit: u32,
    pub continuation: Option<String>,
}
#[derive(Debug)]
pub struct PageResponse {
    pub entries: Vec<proto::Entry>,
    pub continuation: Option<String>,
}
struct PageCursor {
    version: u32,
    map_id: String,
    start_key: Option<String>,
    end_key: Option<String>,
    reverse: bool,
    next: String,
}
// Canonical identities can have arbitrarily deep colocation paths. Bind their
// full bytes by fixed-size digest so every emitted token remains resumable.
fn page_map_identity(map_ref: &str) -> String {
    use sha2::Digest;
    format!("{:x}", sha2::Sha256::digest(map_ref.as_bytes()))
}
impl PageCursor {
    fn parse(encoded: &str) -> Result<Self, Status> {
        let invalid = || Status::invalid_argument("invalid page continuation");
        let value: serde_json::Value = serde_json::from_str(encoded).map_err(|_| invalid())?;
        let object = value.as_object().ok_or_else(invalid)?;
        if object.len() != 6
            || ![
                "version",
                "map_id",
                "start_key",
                "end_key",
                "reverse",
                "next",
            ]
            .into_iter()
            .all(|field| object.contains_key(field))
        {
            return Err(invalid());
        }
        let optional = |field: &str| -> Result<Option<String>, Status> {
            match object.get(field) {
                Some(serde_json::Value::Null) => Ok(None),
                Some(serde_json::Value::String(value)) => Ok(Some(value.clone())),
                _ => Err(invalid()),
            }
        };
        Ok(Self {
            version: object
                .get("version")
                .and_then(|v| v.as_u64())
                .and_then(|v| u32::try_from(v).ok())
                .ok_or_else(invalid)?,
            map_id: object
                .get("map_id")
                .and_then(|v| v.as_str())
                .ok_or_else(invalid)?
                .to_owned(),
            start_key: optional("start_key")?,
            end_key: optional("end_key")?,
            reverse: object
                .get("reverse")
                .and_then(|v| v.as_bool())
                .ok_or_else(invalid)?,
            next: object
                .get("next")
                .and_then(|v| v.as_str())
                .ok_or_else(invalid)?
                .to_owned(),
        })
    }
}
fn page_start(map_ref: &str, request: &PageRequest) -> Result<Option<String>, Status> {
    if !(1..=100).contains(&request.limit) {
        return Err(Status::invalid_argument("page limit must be 1..=100"));
    }
    crate::durable_participant::sorted_map_bounds(
        &request.start_key,
        &request.end_key,
        request.limit,
        request.reverse,
    )?;
    let Some(encoded) = request.continuation.as_ref() else {
        return Ok(request.start_key.clone());
    };
    if encoded.len() > 4096 {
        return Err(Status::invalid_argument("page continuation too large"));
    }
    let cursor = PageCursor::parse(encoded)?;
    if cursor.version != 1
        || cursor.map_id != page_map_identity(map_ref)
        || cursor.start_key != request.start_key
        || cursor.end_key != request.end_key
        || cursor.reverse != request.reverse
        || request.start_key.as_ref().is_some_and(|start| {
            if request.reverse {
                cursor.next > *start
            } else {
                cursor.next < *start
            }
        })
        || request.end_key.as_ref().is_some_and(|end| {
            if request.reverse {
                cursor.next <= *end
            } else {
                cursor.next >= *end
            }
        })
    {
        return Err(Status::invalid_argument(
            "page continuation belongs to another query",
        ));
    }
    Ok(Some(cursor.next))
}
fn finish_page(
    map_ref: &str,
    request: &PageRequest,
    mut entries: Vec<proto::Entry>,
) -> Result<PageResponse, Status> {
    let continuation = if entries.len() > request.limit as usize {
        let next = entries[request.limit as usize].key.clone();
        entries.truncate(request.limit as usize);
        Some(
            serde_json::json!({
                "version": 1, "map_id": page_map_identity(map_ref),
                "start_key": request.start_key, "end_key": request.end_key,
                "reverse": request.reverse, "next": next,
            })
            .to_string(),
        )
    } else {
        None
    };
    Ok(PageResponse {
        entries,
        continuation,
    })
}

/// Serial direct map calls sharing the root's single native map participant.
/// Any failed call dooms the root even if an application catches the error.
/// Dropping this session never discards uncertain/eager native ownership.
/// Calls MUST be serial and awaited inside the owning handler. Do not move a
/// session/call into a detached task or let it outlive the handler. Active work
/// blocks root completion; unfinished Drop retains uncertainty. This lifetime
/// fence does not certify task provenance or enable concurrent map operations.
pub struct SortedMapSession {
    map_ref: String,
    guard: RetainedMapGuard,
    context: TransactionContext,
    endpoint: String,
}
impl SortedMapSession {
    async fn call<T>(
        &self,
        future: impl std::future::Future<Output = Result<T, Status>>,
    ) -> Result<T, Status> {
        let result = async {
            let mut operation = self.context.begin_builtin_map_operation(&self.endpoint)?;
            match future.await {
                Ok(response) => {
                    operation.returned(&self.endpoint)?;
                    Ok(response)
                }
                Err(status) => {
                    self.context.doom(status.clone());
                    Err(status)
                }
            }
        }
        .await;
        result.inspect_err(|status| self.context.doom(status.clone()))
    }
    /// Fetch one eligible lookahead key under the existing root-work fence.
    /// The first unreturned key is the next inclusive start; no successor is made.
    pub async fn page(&self, request: PageRequest) -> Result<PageResponse, Status> {
        self.call(async {
            let start_key = page_start(&self.map_ref, &request)?;
            let entries = if request.reverse {
                self.guard
                    .sorted_map_reverse_range(proto::ReverseRangeRequest {
                        start_key,
                        end_key: request.end_key.clone(),
                        limit: request.limit + 1,
                    })
                    .await?
                    .entries
            } else {
                self.guard
                    .sorted_map_range(proto::RangeRequest {
                        start_key,
                        end_key: request.end_key.clone(),
                        limit: request.limit + 1,
                    })
                    .await?
                    .entries
            };
            finish_page(&self.map_ref, &request, entries)
        })
        .await
    }
    pub async fn insert(
        &self,
        request: proto::InsertRequest,
    ) -> Result<proto::InsertResponse, Status> {
        self.call(self.guard.sorted_map_insert(request)).await
    }
    pub async fn remove(
        &self,
        request: proto::RemoveRequest,
    ) -> Result<proto::RemoveResponse, Status> {
        self.call(self.guard.sorted_map_remove(request)).await
    }
    pub async fn get(&self, request: proto::GetRequest) -> Result<proto::GetResponse, Status> {
        self.call(self.guard.sorted_map_get(request)).await
    }
    pub async fn range(
        &self,
        request: proto::RangeRequest,
    ) -> Result<proto::RangeResponse, Status> {
        self.call(self.guard.sorted_map_range(request)).await
    }
    pub async fn reverse_range(
        &self,
        request: proto::ReverseRangeRequest,
    ) -> Result<proto::ReverseRangeResponse, Status> {
        self.call(self.guard.sorted_map_reverse_range(request))
            .await
    }
}

#[cfg(test)]
mod pagination_tests {
    use super::*;
    #[test]
    fn lookahead_is_first_unreturned_key_not_a_successor() {
        let request = PageRequest {
            limit: 1,
            ..PageRequest::default()
        };
        let entries = ["a", &"z".repeat(128)]
            .into_iter()
            .map(|key| proto::Entry {
                key: key.to_owned(),
                value: vec![],
            })
            .collect();
        let page = finish_page("map", &request, entries).unwrap();
        assert_eq!(page.entries.len(), 1);
        let next = PageRequest {
            continuation: page.continuation,
            ..request
        };
        assert_eq!(page_start("map", &next).unwrap(), Some("z".repeat(128)));
    }
    #[test]
    fn cursor_binds_identity_bounds_direction_and_version() {
        let request = PageRequest {
            start_key: Some("a".into()),
            end_key: Some("z".into()),
            limit: 1,
            ..PageRequest::default()
        };
        let entries = ["a", "b"]
            .into_iter()
            .map(|key| proto::Entry {
                key: key.into(),
                value: vec![],
            })
            .collect();
        let page = finish_page("map", &request, entries).unwrap();
        let next = PageRequest {
            continuation: page.continuation,
            ..request
        };
        assert_eq!(page_start("map", &next).unwrap(), Some("b".into()));
        assert!(page_start("foreign", &next).is_err());
        assert!(
            page_start(
                "map",
                &PageRequest {
                    reverse: true,
                    ..next.clone()
                }
            )
            .is_err()
        );
        assert!(
            page_start(
                "map",
                &PageRequest {
                    end_key: Some("b".into()),
                    ..next.clone()
                }
            )
            .is_err()
        );
        assert!(
            page_start(
                "map",
                &PageRequest {
                    limit: 0,
                    ..next.clone()
                }
            )
            .is_err()
        );
        assert!(
            page_start(
                "map",
                &PageRequest {
                    limit: 101,
                    ..next.clone()
                }
            )
            .is_err()
        );
        let changed = next
            .continuation
            .as_ref()
            .unwrap()
            .replace("\"version\":1", "\"version\":2");
        assert!(
            page_start(
                "map",
                &PageRequest {
                    continuation: Some(changed),
                    ..next
                }
            )
            .is_err()
        );
    }
    #[test]
    fn escaped_maximum_ascii_keys_roundtrip_and_zero_limit_is_invalid_argument() {
        let request = PageRequest {
            start_key: Some("\u{3}".repeat(128)),
            end_key: Some("\u{1}".repeat(128)),
            reverse: true,
            limit: 1,
            continuation: None,
        };
        let rows = ["\u{3}".repeat(128), "\u{2}".repeat(128)]
            .into_iter()
            .map(|key| proto::Entry { key, value: vec![] })
            .collect();
        let page = finish_page("map", &request, rows).unwrap();
        assert!(page.continuation.as_ref().unwrap().len() > 2048);
        let continued = PageRequest {
            continuation: page.continuation,
            ..request
        };
        assert_eq!(
            page_start("map", &continued).unwrap(),
            Some("\u{2}".repeat(128))
        );
        assert_eq!(
            page_start(
                "map",
                &PageRequest {
                    limit: 0,
                    ..PageRequest::default()
                }
            )
            .unwrap_err()
            .code(),
            tonic::Code::InvalidArgument
        );
    }
    #[test]
    fn deep_map_identity_is_bounded_and_bound_to_full_bytes() {
        let identity = "nested/".repeat(4096);
        let request = PageRequest {
            limit: 1,
            ..PageRequest::default()
        };
        let rows = ["a", "b"]
            .into_iter()
            .map(|key| proto::Entry {
                key: key.into(),
                value: vec![],
            })
            .collect();
        let page = finish_page(&identity, &request, rows).unwrap();
        assert!(page.continuation.as_ref().unwrap().len() < 4096);
        let continued = PageRequest {
            continuation: page.continuation,
            ..request
        };
        assert_eq!(page_start(&identity, &continued).unwrap(), Some("b".into()));
        assert!(page_start(&(identity + "different"), &continued).is_err());
    }
    #[test]
    fn exact_and_empty_pages_have_no_continuation() {
        let request = PageRequest {
            limit: 1,
            ..PageRequest::default()
        };
        assert!(
            finish_page("map", &request, vec![])
                .unwrap()
                .continuation
                .is_none()
        );
        assert!(
            finish_page(
                "map",
                &request,
                vec![proto::Entry {
                    key: "a".into(),
                    value: vec![]
                }]
            )
            .unwrap()
            .continuation
            .is_none()
        );
    }
}
