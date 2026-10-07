use std::sync::{
    Arc,
    atomic::{AtomicBool, Ordering},
};

use base64::{Engine as _, engine::general_purpose::URL_SAFE_NO_PAD};
use prost::Message;
use reboot::{
    application_host::{ApplicationHost, LegacyRecoveryMetadata, PlacementPlannerRecovery},
    durable_coordinator::{CoordinatorRecovery, TonicCoordinatorSidecar},
    durable_participant::{DurableActorParticipant, ParticipantRecovery, TonicParticipantSidecar},
    legacy_coordinator::LegacyApplicationCoordinatorWatchEndpoint,
    legacy_placement::{
        LegacyApplicationId, LegacyApplicationParticipantResolver, LegacyApplicationResolver,
        PlanOnlyLegacyPlacement,
    },
    runtime::{
        DatabaseActorStore, InboundTransactionStartFactory, RootTransactionStart,
        RootTransactionStartFactory, TransactionContext, TransactionExecution,
    },
};
use uuid::Uuid;

pub mod proto {
    tonic::include_proto!("tests.reboot.protoc");
}
mod generated {
    include!(concat!(
        env!("OUT_DIR"),
        "/tests/reboot/protoc/transaction_counter.reboot.rs"
    ));
}

struct Starts {
    root: Uuid,
    child: Uuid,
}
impl RootTransactionStartFactory for Starts {
    fn next_root_transaction(&self) -> Result<RootTransactionStart, tonic::Status> {
        Ok(RootTransactionStart {
            transaction_id: self.root,
            timestamp: prost_types::Timestamp::default(),
        })
    }
}
impl InboundTransactionStartFactory for Starts {
    fn next_inbound_transaction(
        &self,
        _: &reboot::runtime::InboundTransactionContext,
    ) -> Result<Uuid, tonic::Status> {
        Ok(self.child)
    }
}

enum Handler {
    Target,
    Tasks {
        state_ref: String,
        marker: String,
        block: bool,
        vector: String,
    },
    Root(Root),
}
fn record_rollback_identity(context: &TransactionContext) {
    if let Some(path) = optional_arg("--tree-path-marker") {
        std::fs::write(
            &path,
            context
                .transaction_ids()
                .iter()
                .map(ToString::to_string)
                .collect::<Vec<_>>()
                .join("\n"),
        )
        .unwrap();
        std::fs::write(
            format!("{path}.coordinator"),
            format!(
                "{}\n{}",
                context.transaction_coordinator_state_type(),
                context.transaction_coordinator_state_ref()
            ),
        )
        .unwrap();
    }
}

/// Implements only the legacy Status hook: the generated default typed hook must run.
struct LegacyRollbackHandler(Handler);
#[tonic::async_trait]
impl generated::TransactionCounterWritesMethodsTransactionHandler for LegacyRollbackHandler {
    async fn query_declared(
        &self,
        state: &proto::TransactionCounter,
        request: proto::TransactionIncrementRequest,
    ) -> Result<
        proto::TransactionCounterValue,
        generated::TransactionCounterWritesMethodsQueryDeclaredError,
    > {
        self.0.query_declared(state, request).await
    }
    async fn apply_declared(
        &self,
        state: &mut proto::TransactionCounter,
        request: proto::TransactionIncrementRequest,
    ) -> Result<
        proto::TransactionCounterValue,
        generated::TransactionCounterWritesMethodsApplyDeclaredError,
    > {
        self.0.apply_declared(state, request).await
    }
    async fn query(
        &self,
        state: &proto::TransactionCounter,
        request: proto::TransactionIncrementRequest,
    ) -> Result<proto::TransactionCounterValue, tonic::Status> {
        self.0.query(state, request).await
    }
    async fn apply(
        &self,
        state: &mut proto::TransactionCounter,
        request: proto::TransactionIncrementRequest,
    ) -> Result<proto::TransactionCounterValue, tonic::Status> {
        self.0.apply(state, request).await
    }
    async fn increment(
        &self,
        context: &TransactionContext,
        state: &mut proto::TransactionCounter,
        request: proto::TransactionIncrementRequest,
    ) -> Result<TransactionExecution<proto::TransactionCounterValue>, tonic::Status> {
        record_rollback_identity(context);
        state.value += 1000;
        let mut private =
            TransactionExecution::new(proto::TransactionCounterValue { value: state.value });
        private
            .task_upserts
            .push(generated::TransactionCounterWritesMethodsTasks::query(
                &context.headers().state_ref,
                &request,
            ));
        let marker = arg("--rollback-leaf");
        std::fs::write(&marker, private.task_upserts[0].encode_to_vec()).unwrap();
        std::fs::write(
            format!("{marker}.legacy-handler"),
            b"legacy Status handler invoked; no typed override",
        )
        .unwrap();
        Err(reboot::declared_error_status(
            tonic::Code::Unknown,
            "legacy declared rollback",
            "type.googleapis.com/tests.reboot.protoc.TransactionLimitExceeded",
            &proto::TransactionLimitExceeded { limit: 4242 },
        ))
    }
    async fn factory_increment(
        &self,
        context: &TransactionContext,
        state: &mut proto::TransactionCounter,
        request: proto::TransactionIncrementRequest,
    ) -> Result<
        TransactionExecution<proto::TransactionCounterValue>,
        generated::TransactionCounterWritesMethodsFactoryIncrementError,
    > {
        self.0.factory_increment(context, state, request).await
    }
    async fn factory_increment_target(
        &self,
        context: &TransactionContext,
        state: &mut proto::TransactionCounter,
        request: proto::TransactionIncrementRequest,
    ) -> Result<TransactionExecution<proto::TransactionCounterValue>, tonic::Status> {
        self.0
            .factory_increment_target(context, state, request)
            .await
    }
    async fn shared_read(
        &self,
        context: &TransactionContext,
        state: &mut proto::TransactionCounter,
        request: proto::TransactionIncrementRequest,
    ) -> Result<TransactionExecution<proto::TransactionCounterValue>, tonic::Status> {
        self.0.shared_read(context, state, request).await
    }
    async fn shared_read_fresh_shared(
        &self,
        context: &reboot::runtime::SharedLocalTransactionContext,
        state: &mut proto::TransactionCounter,
        request: proto::TransactionIncrementRequest,
    ) -> Result<proto::TransactionCounterValue, tonic::Status> {
        self.0
            .shared_read_fresh_shared(context, state, request)
            .await
    }
}

#[tonic::async_trait]
impl generated::TransactionCounterWritesMethodsTransactionHandler for Handler {
    async fn query_declared(
        &self,
        state: &proto::TransactionCounter,
        request: proto::TransactionIncrementRequest,
    ) -> Result<
        proto::TransactionCounterValue,
        generated::TransactionCounterWritesMethodsQueryDeclaredError,
    > {
        self.query(state, request)
            .await
            .map_err(generated::TransactionCounterWritesMethodsQueryDeclaredError::Grpc)?;
        Err(
            generated::TransactionCounterWritesMethodsQueryDeclaredError::TransactionLimitExceeded(
                proto::TransactionLimitExceeded { limit: 4242 },
            ),
        )
    }
    async fn apply_declared(
        &self,
        state: &mut proto::TransactionCounter,
        request: proto::TransactionIncrementRequest,
    ) -> Result<
        proto::TransactionCounterValue,
        generated::TransactionCounterWritesMethodsApplyDeclaredError,
    > {
        self.apply(state, request)
            .await
            .map_err(generated::TransactionCounterWritesMethodsApplyDeclaredError::Grpc)?;
        state.value += 1000; // private failed mutation must never be stored
        Err(
            generated::TransactionCounterWritesMethodsApplyDeclaredError::TransactionLimitExceeded(
                proto::TransactionLimitExceeded { limit: 4242 },
            ),
        )
    }
    async fn query(
        &self,
        state: &proto::TransactionCounter,
        request: proto::TransactionIncrementRequest,
    ) -> Result<proto::TransactionCounterValue, tonic::Status> {
        let tree_marker = optional_arg("--tree-local-tasks");
        let reader = if let Some(marker) = &tree_marker {
            Some((marker, has("--block-task")))
        } else {
            match self {
                Self::Tasks { marker, block, .. } => Some((marker, *block)),
                Self::Root(root) => root
                    .task_marker
                    .as_ref()
                    .map(|marker| (marker, root.block_task)),
                Self::Target => None,
            }
        };
        if let Some((marker, block)) = reader {
            if request.amount == 9000 {
                // Append per invocation: an identical overwritten result cannot
                // hide replay across Wait calls or host recovery.
                {
                    use std::io::Write;
                    let mut calls = std::fs::OpenOptions::new()
                        .create(true)
                        .append(true)
                        .open(format!("{marker}.invocations"))
                        .unwrap();
                    writeln!(calls, "query").unwrap();
                }
                std::fs::write(
                    format!("{marker}.started-at"),
                    std::time::SystemTime::now()
                        .duration_since(std::time::UNIX_EPOCH)
                        .unwrap()
                        .as_nanos()
                        .to_string(),
                )
                .unwrap();
                std::fs::write(marker, state.value.to_string()).unwrap();
                if block {
                    struct ReaderDrop(String);
                    impl Drop for ReaderDrop {
                        fn drop(&mut self) {
                            std::fs::write(
                                format!("{}.reader-dropped", self.0),
                                "actual reader future dropped",
                            )
                            .unwrap();
                        }
                    }
                    let _drop = ReaderDrop(marker.clone());
                    std::future::pending::<()>().await;
                }
            }
        }
        Ok(proto::TransactionCounterValue { value: state.value })
    }

    async fn apply(
        &self,
        state: &mut proto::TransactionCounter,
        request: proto::TransactionIncrementRequest,
    ) -> Result<proto::TransactionCounterValue, tonic::Status> {
        if has("--writer-tasks") && request.amount == 3 {
            use std::io::Write;
            let marker = arg("--task-marker");
            let mut log = std::fs::OpenOptions::new()
                .create(true)
                .append(true)
                .open(format!("{marker}.writer-invocations"))
                .unwrap();
            writeln!(log, "apply {}", request.amount).unwrap();
            std::fs::write(
                format!("{marker}.started-at"),
                std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap()
                    .as_nanos()
                    .to_string(),
            )
            .unwrap();
            std::fs::write(&marker, "writer handler entered").unwrap();
            if has("--writer-handler-error") {
                return Err(tonic::Status::invalid_argument(
                    "writer task handler failed",
                ));
            }
            if has("--writer-handler-retry")
                && std::fs::read_to_string(format!("{marker}.writer-invocations"))
                    .unwrap()
                    .lines()
                    .count()
                    < 3
            {
                state.value += 1000;
                return Err(tonic::Status::unavailable(
                    "controlled pre-Store handler failure",
                ));
            }
            if has("--block-task") {
                std::future::pending::<()>().await;
            }
        }
        if has("--writer-tasks") && request.amount == 100 {
            std::fs::write(
                format!("{}.ordinary-entered", arg("--task-marker")),
                b"ordinary exclusive writer admitted",
            )
            .unwrap();
        }
        state.value += request.amount;
        Ok(proto::TransactionCounterValue { value: state.value })
    }

    async fn increment_typed_transaction_result(
        &self,
        context: &TransactionContext,
        state: &mut proto::TransactionCounter,
        request: proto::TransactionIncrementRequest,
    ) -> Result<
        TransactionExecution<proto::TransactionCounterValue>,
        generated::TransactionCounterWritesMethodsIncrementError,
    > {
        if has("--rollback-leaf") {
            record_rollback_identity(context);
            state.value += 1000;
            if let Some(marker) = optional_arg("--rollback-handler-park") {
                std::fs::write(&marker, b"actual private C handler active").unwrap();
                while !std::path::Path::new(&format!("{marker}.release")).exists() {
                    tokio::time::sleep(std::time::Duration::from_millis(5)).await;
                }
            }
            let mut private =
                TransactionExecution::new(proto::TransactionCounterValue { value: state.value });
            private
                .task_upserts
                .push(generated::TransactionCounterWritesMethodsTasks::query(
                    &context.headers().state_ref,
                    &request,
                ));
            std::fs::write(
                arg("--rollback-leaf"),
                private.task_upserts[0].encode_to_vec(),
            )
            .unwrap();
            return Err(
                generated::TransactionCounterWritesMethodsIncrementError::TransactionLimitExceeded(
                    proto::TransactionLimitExceeded { limit: 4242 },
                ),
            );
        }
        let execution = self
            .increment(context, state, request)
            .await
            .map_err(generated::TransactionCounterWritesMethodsIncrementError::Grpc)?;
        if has("--rollback-b-declared-after-catch") {
            return Err(
                generated::TransactionCounterWritesMethodsIncrementError::TransactionLimitExceeded(
                    proto::TransactionLimitExceeded { limit: 4242 },
                ),
            );
        }
        Ok(execution)
    }

    async fn increment(
        &self,
        context: &TransactionContext,
        state: &mut proto::TransactionCounter,
        request: proto::TransactionIncrementRequest,
    ) -> Result<TransactionExecution<proto::TransactionCounterValue>, tonic::Status> {
        if request.amount == -9000 {
            if let Self::Tasks { marker, .. } = self {
                std::fs::write(
                    format!("{marker}.cancel"),
                    "handler entered before durable handoff",
                )
                .unwrap();
                std::future::pending::<()>().await;
            }
        }
        state.value += request.amount;
        if context.supervised_tree_execution()
            && let Some(path) = optional_arg("--tree-path-marker")
        {
            std::fs::write(
                format!("{path}.coordinator"),
                format!(
                    "{}\n{}",
                    context.transaction_coordinator_state_type(),
                    context.transaction_coordinator_state_ref()
                ),
            )
            .unwrap();
            std::fs::write(
                path,
                context
                    .transaction_ids()
                    .iter()
                    .map(ToString::to_string)
                    .collect::<Vec<_>>()
                    .join("\n"),
            )
            .unwrap();
        }
        if let Some(path) = std::env::var_os("REBOOT_TEST_TARGET_UNFINISHED_OUTBOUND") {
            std::fs::write(&path, b"target admitted, no successful trailers").unwrap();
            struct HandlerDrop(std::path::PathBuf);
            impl Drop for HandlerDrop {
                fn drop(&mut self) {
                    std::fs::write(
                        self.0.with_extension("handler-dropped"),
                        b"actual target handler future ended",
                    )
                    .unwrap();
                }
            }
            let path = std::path::PathBuf::from(path);
            let _drop = HandlerDrop(path.clone());
            if has("--unfinished-outbound-error") {
                return Err(tonic::Status::unavailable(
                    "unfinished outbound transport outcome",
                ));
            }
            if has("--release-parked-target") {
                while !path.with_extension("release").exists() {
                    tokio::time::sleep(std::time::Duration::from_millis(10)).await;
                }
            } else {
                std::future::pending::<()>().await;
            }
        }
        if let Self::Root(root) = self {
            // The ordinary legacy recovery acceptance uses the first target.
            // This branch deliberately enlists two independently routed remote
            // actors so the root coordinator's concurrent Prepare fan-out and
            // post-decision recovery retain the whole durable participant set.
            let tree_next = if has("--tree-reentrant-root") {
                Some("root".to_owned())
            } else {
                optional_arg("--tree-next")
            };
            let tree_targets: Vec<&str> = tree_next.as_deref().into_iter().collect();
            let targets: &[&str] = if tree_next.is_some() {
                &tree_targets
            } else if root.multi_participant {
                &["target-a", "target-b"]
            } else {
                &["target"]
            };
            if has("--tree-active-child") {
                let client = root.client.clone();
                let context = context.clone();
                let request = request.clone();
                let child = targets[0].to_owned();
                let marker = arg("--tree-active-marker");
                let child_marker = marker.clone();
                tokio::spawn(async move {
                    let result = client
                        .increment(
                            &context,
                            &generated::TransactionCounterWritesMethodsTarget::new(child),
                            request.clone(),
                        )
                        .await;
                    std::fs::write(format!("{child_marker}.child-ended"), format!("{result:?}"))
                        .unwrap();
                    let error = client
                        .increment(
                            &context,
                            &generated::TransactionCounterWritesMethodsTarget::new(
                                "unregistered-post-close",
                            ),
                            request,
                        )
                        .await
                        .unwrap_err();
                    assert!(
                        matches!(error, generated::TransactionCounterWritesMethodsIncrementError::Grpc(ref status) if status.code() == tonic::Code::FailedPrecondition)
                    );
                    std::fs::write(
                        format!("{child_marker}.clone-denied"),
                        b"closed clone denied generated call before resolution",
                    )
                    .unwrap();
                });
                while !std::path::Path::new(&marker).exists() {
                    tokio::time::sleep(std::time::Duration::from_millis(5)).await;
                }
            } else {
                for target in targets {
                    match root.client
                    .increment(
                        context,
                        &generated::TransactionCounterWritesMethodsTarget::new(*target),
                        request.clone(),
                    )
                    .await
                {
                    Ok(_) => {},
                    Err(error) if has("--catch-outbound-error") => {
                        assert!(context.doomed_status().is_some(), "caught unsupported outcome must doom root: {error:?}");
                        assert!(context.returned_participants_snapshot().is_empty());
                        let marker = arg("--outbound-error-marker");
                        std::fs::write(&marker, b"caught uncertain generated outbound, empty membership").unwrap();
                        std::fs::write(format!("{marker}.variant"), format!("{error:?}")).unwrap();
                    },
                    Err(generated::TransactionCounterWritesMethodsIncrementError::TransactionLimitExceeded(error)) => {
                        if let Some(marker) = optional_arg("--rollback-catch") {
                            assert_eq!(error.limit, 4242);
                            let members = context.returned_participants_snapshot();
                            assert_eq!(members.len(), 1);
                            assert!(members[0].read_only);
                            assert_eq!(members[0].target.state_ref, *target);
                            assert_eq!(members[0].target.state_type, "tests.reboot.protoc.TransactionCounter");
                            assert!(context.doomed_status().is_none());
                            std::fs::write(&marker, b"typed error caught after validated read-only enlistment").unwrap();
                            while !std::path::Path::new(&format!("{marker}.release")).exists() {
                                tokio::time::sleep(std::time::Duration::from_millis(5)).await;
                            }
                            if has("--rollback-root-abort") { return Err(tonic::Status::invalid_argument("root abort after catch")); }
                        }
                    },
                    Err(generated::TransactionCounterWritesMethodsIncrementError::System(error)) if error.is_recoverable() => {}
                    Err(generated::TransactionCounterWritesMethodsIncrementError::System(error)) => return Err(tonic::Status::unavailable(format!("unrecoverable remote system abort: {error:?}"))),
                    Err(generated::TransactionCounterWritesMethodsIncrementError::Grpc(error)) => {
                        if !has("--catch-outbound-error") { return Err(error); }
                        assert!(context.returned_participants_snapshot().is_empty());
                        std::fs::write(arg("--outbound-error-marker"), b"caught uncertain generated outbound, empty membership").unwrap();
                    },
                }
                }
            }
        }
        if context.supervised_tree_execution() {
            if let Some(path) = optional_arg("--tree-members-marker") {
                let members: Vec<_> = context
                    .returned_participants_snapshot()
                    .into_iter()
                    .map(|p| p.target.state_ref)
                    .collect();
                std::fs::write(path, members.join("\n")).unwrap();
            }
            if has("--tree-handler-error") {
                return Err(tonic::Status::invalid_argument(
                    "tree handler rejected after descendant success",
                ));
            }
        }
        if matches!(self, Self::Root(_))
            && let Some(path) = std::env::var_os("REBOOT_TEST_ROOT_AFTER_REMOTE")
        {
            let path = std::path::PathBuf::from(path);
            std::fs::write(
                &path,
                b"actual remote successful trailers received; no Prepare",
            )
            .unwrap();
            while !path.with_extension("release").exists() {
                tokio::time::sleep(std::time::Duration::from_millis(10)).await;
            }
        }
        if let Self::Tasks {
            state_ref,
            vector,
            marker,
            ..
        } = self
        {
            if vector == "descendant" {
                let (placement, _) = crate::placement();
                let client = generated::TransactionCounterWritesMethodsClient::new(
                    LegacyApplicationResolver::new(
                        LegacyApplicationId::new("generated-cxx-database-process").unwrap(),
                        placement,
                    ),
                );
                let error = client
                    .increment(
                        context,
                        &generated::TransactionCounterWritesMethodsTarget::new("root"),
                        request.clone(),
                    )
                    .await
                    .unwrap_err();
                assert!(
                    matches!(error, generated::TransactionCounterWritesMethodsIncrementError::Grpc(ref error) if error.code() == tonic::Code::FailedPrecondition && error.message() == "live inbound leaf cannot call descendants")
                );
                std::fs::write(
                    format!("{marker}.descendant-caught"),
                    "actual generated descendant rejected and caught before resolver",
                )
                .unwrap();
            }
            let mut execution =
                TransactionExecution::new(proto::TransactionCounterValue { value: state.value });
            let mut task = generated::TransactionCounterWritesMethodsTasks::query(
                state_ref,
                &proto::TransactionIncrementRequest { amount: 9000 },
            );
            if has("--writer-tasks") {
                task = generated::TransactionCounterWritesMethodsTasks::apply(
                    state_ref,
                    &proto::TransactionIncrementRequest { amount: 3 },
                );
                if let Some(seconds) = vector.strip_prefix("delayed:") {
                    task = generated::TransactionCounterWritesMethodsTasksAt::apply(
                        state_ref,
                        &proto::TransactionIncrementRequest { amount: 3 },
                        prost_types::Timestamp {
                            seconds: seconds.parse().unwrap(),
                            nanos: 0,
                        },
                    );
                }
            }
            if !has("--writer-tasks")
                && let Some(seconds) = vector.strip_prefix("delayed:")
            {
                task = generated::TransactionCounterWritesMethodsTasksAt::query(
                    state_ref,
                    &proto::TransactionIncrementRequest { amount: 9000 },
                    prost_types::Timestamp {
                        seconds: seconds.parse().unwrap(),
                        nanos: 0,
                    },
                );
            }
            if vector == "declared" {
                task = if has("--writer-tasks") && !has("--declared-reader") {
                    generated::TransactionCounterWritesMethodsTasks::apply_declared(
                        state_ref,
                        &proto::TransactionIncrementRequest { amount: 3 },
                    )
                } else {
                    generated::TransactionCounterWritesMethodsTasks::query_declared(
                        state_ref,
                        &proto::TransactionIncrementRequest { amount: 9000 },
                    )
                };
            }
            if let Some(id) = vector.strip_prefix("reuse:") {
                task.task_id.as_mut().unwrap().task_uuid =
                    uuid::Uuid::parse_str(id).unwrap().as_bytes().to_vec();
            }
            match vector.as_str() {
                "unknown" => task.method = "Missing".into(),
                "writer" => task.method = "Apply".into(),
                "malformed" => task.request = vec![0xff],
                "identity" => task.task_id.as_mut().unwrap().state_ref = "other".into(),
                "foreign-type" => task.task_id.as_mut().unwrap().state_type = "other.Actor".into(),
                "uuid" => task.task_id.as_mut().unwrap().task_uuid = vec![1],
                "uuid-version" => task.task_id.as_mut().unwrap().task_uuid[6] = 0x70,
                "uuid-variant" => task.task_id.as_mut().unwrap().task_uuid[8] = 0,
                "schedule" => {
                    task.timestamp = Some(prost_types::Timestamp {
                        seconds: i64::MAX,
                        nanos: 0,
                    })
                }
                "iteration" => task.iteration = 1,
                _ => {}
            }
            if matches!(vector.as_str(), "saturation" | "saturation-allowed") {
                // Real sidecar seeding occurs while this generated root owns
                // exclusive admission, so the live dispatcher cannot drain the
                // durable records before validate_staged counts them.
                let count = if vector == "saturation" { 1024 } else { 1023 };
                let pending: Vec<_> = (0..count)
                    .map(|_| {
                        let mut task = generated::TransactionCounterWritesMethodsTasks::query(
                            state_ref,
                            &proto::TransactionIncrementRequest { amount: 9000 },
                        );
                        if has("--remote-reader-task") {
                            task.timestamp = Some(prost_types::Timestamp {
                                seconds: i64::try_from(
                                    std::time::SystemTime::now()
                                        .duration_since(std::time::UNIX_EPOCH)
                                        .unwrap()
                                        .as_secs(),
                                )
                                .unwrap()
                                    + 3600,
                                nanos: 0,
                            });
                        }
                        task
                    })
                    .collect();
                let mut database =
                    reboot::database_proto::database_client::DatabaseClient::connect(arg(
                        "--database",
                    ))
                    .await
                    .map_err(|error| tonic::Status::unavailable(error.to_string()))?;
                database
                    .store(reboot::database_proto::StoreRequest {
                        task_upserts: pending.clone(),
                        sync: true,
                        ..Default::default()
                    })
                    .await?;
                if let Self::Tasks { marker, .. } = self {
                    if has("--remote-reader-task") {
                        std::fs::write(
                            format!("{marker}.seeded-records"),
                            reboot::database_proto::LoadResponse {
                                actors: vec![],
                                tasks: pending,
                                ..Default::default()
                            }
                            .encode_to_vec(),
                        )
                        .unwrap();
                    }
                    std::fs::write(
                        format!("{marker}.staged"),
                        Uuid::from_slice(&task.task_id.as_ref().unwrap().task_uuid)
                            .unwrap()
                            .to_string(),
                    )
                    .unwrap();
                }
            }
            if vector == "duplicate" {
                execution.task_upserts.push(task.clone());
            }
            if vector == "capacity" {
                execution.task_upserts = vec![task.clone(); 1024];
            }
            if let Self::Tasks { marker, .. } = self
                && let Ok(id) = Uuid::from_slice(&task.task_id.as_ref().unwrap().task_uuid)
            {
                // Malformed IDs remain untouched for canonical validation;
                // an acceptance marker must not panic before the real gate.
                std::fs::write(format!("{marker}.task-id"), id.to_string()).unwrap();
            }
            execution.task_upserts.push(task);
            return Ok(execution);
        }
        // The generated adapter stages the task with root participant effects,
        // while the remote participant comes from successful generated trailers.
        let mut execution =
            TransactionExecution::new(proto::TransactionCounterValue { value: state.value });
        if let Self::Root(root) = self {
            if root.task_marker.is_some() {
                let mut task = generated::TransactionCounterWritesMethodsTasks::query(
                    &context.headers().state_ref,
                    &proto::TransactionIncrementRequest { amount: 9000 },
                );
                if has("--root-task-invalid") {
                    task.method = "Missing".into();
                }
                let vector = optional_arg("--task-vector").unwrap_or_default();
                if let Some(seconds) = vector.strip_prefix("delayed:") {
                    task.timestamp = Some(prost_types::Timestamp {
                        seconds: seconds.parse().unwrap(),
                        nanos: 0,
                    });
                }
                if let Some(id) = vector.strip_prefix("reuse:") {
                    task.task_id.as_mut().unwrap().task_uuid =
                        Uuid::parse_str(id).unwrap().as_bytes().to_vec();
                }
                match vector.as_str() {
                    "malformed" => task.request = vec![0xff],
                    "identity" => task.task_id.as_mut().unwrap().state_ref = "target".into(),
                    "duplicate" => execution.task_upserts.push(task.clone()),
                    "capacity" => {
                        execution.task_upserts = (0..1024)
                            .map(|_| {
                                generated::TransactionCounterWritesMethodsTasks::query(
                                    &context.headers().state_ref,
                                    &proto::TransactionIncrementRequest { amount: 9000 },
                                )
                            })
                            .collect()
                    }
                    _ => {}
                }
                std::fs::write(
                    format!("{}.task-id", root.task_marker.as_ref().unwrap()),
                    Uuid::from_slice(&task.task_id.as_ref().unwrap().task_uuid)
                        .unwrap()
                        .to_string(),
                )
                .unwrap();
                if let Some(path) = std::env::var_os("REBOOT_TEST_ROOT_HANDLER_PARK") {
                    struct HandlerDrop(std::path::PathBuf);
                    impl Drop for HandlerDrop {
                        fn drop(&mut self) {
                            std::fs::write(
                                self.0.with_extension("handler-dropped"),
                                b"handler future dropped",
                            )
                            .unwrap();
                        }
                    }
                    let path = std::path::PathBuf::from(path);
                    std::fs::write(&path, b"confirmed remote successful enlistment").unwrap();
                    let _drop = HandlerDrop(path);
                    std::future::pending::<()>().await;
                }
                if has("--root-handler-error") {
                    return Err(tonic::Status::invalid_argument(
                        "explicit root handler rejection after successful remote enlistment",
                    ));
                }
                execution.task_upserts.push(task);
            }
        }
        if context.headers().state_ref != "watch-capacity"
            && let Some(marker) = optional_arg("--tree-local-tasks")
        {
            let actor = &context.headers().state_ref;
            let request = proto::TransactionIncrementRequest { amount: 9000 };
            let writer = proto::TransactionIncrementRequest { amount: 3 };
            let at = prost_types::Timestamp {
                seconds: arg("--tree-tasks-at").parse().unwrap(),
                nanos: 0,
            };
            execution.task_upserts.extend([
                generated::TransactionCounterWritesMethodsTasks::query(actor, &request),
                generated::TransactionCounterWritesMethodsTasks::apply(actor, &writer),
                generated::TransactionCounterWritesMethodsTasksAt::query(actor, &request, at),
                generated::TransactionCounterWritesMethodsTasksAt::apply(actor, &writer, at),
            ]);
            if has("--tree-declared-tasks") {
                execution.task_upserts = vec![
                    generated::TransactionCounterWritesMethodsTasks::query_declared(
                        actor, &request,
                    ),
                    generated::TransactionCounterWritesMethodsTasks::apply_declared(actor, &writer),
                ];
            }
            match optional_arg("--tree-task-vector").as_deref() {
                Some("foreign-actor") => {
                    execution.task_upserts[0]
                        .task_id
                        .as_mut()
                        .unwrap()
                        .state_ref = arg("--tree-task-foreign-ref")
                }
                Some("duplicate-staged") => execution
                    .task_upserts
                    .push(execution.task_upserts[0].clone()),
                Some("reuse") => {
                    execution.task_upserts[0]
                        .task_id
                        .as_mut()
                        .unwrap()
                        .task_uuid = Uuid::parse_str(&arg("--tree-task-reuse-uuid"))
                        .unwrap()
                        .as_bytes()
                        .to_vec()
                }
                _ => {}
            }
            std::fs::write(
                format!("{marker}.records"),
                reboot::database_proto::LoadResponse {
                    tasks: execution.task_upserts.clone(),
                    ..Default::default()
                }
                .encode_to_vec(),
            )
            .unwrap();
        }
        if (matches!(self, Self::Target) || has("--supervised-tree"))
            && has("--negative-task-shape")
        {
            execution
                .task_upserts
                .push(generated::TransactionCounterWritesMethodsTasks::query(
                    &context.headers().state_ref,
                    &proto::TransactionIncrementRequest { amount: 9000 },
                ));
            std::fs::write(
                arg("--negative-shape-marker"),
                b"actual inbound handler returned task",
            )
            .unwrap();
        }
        Ok(execution)
    }
    async fn factory_increment(
        &self,
        _: &TransactionContext,
        state: &mut proto::TransactionCounter,
        request: proto::TransactionIncrementRequest,
    ) -> Result<
        TransactionExecution<proto::TransactionCounterValue>,
        generated::TransactionCounterWritesMethodsFactoryIncrementError,
    > {
        if request.amount == 13 {
            return Err(generated::TransactionCounterWritesMethodsFactoryIncrementError::TransactionLimitExceeded(proto::TransactionLimitExceeded { limit: request.amount }));
        }
        if request.amount < 0 {
            return Err(
                generated::TransactionCounterWritesMethodsFactoryIncrementError::Grpc(
                    tonic::Status::invalid_argument("factory handler rejected request"),
                ),
            );
        }
        state.value += request.amount;
        // Deliberately leave final_state unset: the generated factory adapter
        // must durably materialize the state it gave the handler.
        let mut execution =
            TransactionExecution::new(proto::TransactionCounterValue { value: state.value });
        if has("--negative-task-shape") {
            execution
                .task_upserts
                .push(generated::TransactionCounterWritesMethodsTasks::query(
                    &arg("--state-ref"),
                    &proto::TransactionIncrementRequest { amount: 9000 },
                ));
            std::fs::write(
                arg("--negative-shape-marker"),
                b"actual factory handler returned task",
            )
            .unwrap();
        }
        Ok(execution)
    }
    async fn factory_increment_target(
        &self,
        context: &TransactionContext,
        state: &mut proto::TransactionCounter,
        request: proto::TransactionIncrementRequest,
    ) -> Result<TransactionExecution<proto::TransactionCounterValue>, tonic::Status> {
        if request.amount < 0 {
            return Err(tonic::Status::invalid_argument(
                "factory handler rejected request",
            ));
        }
        state.value += request.amount;
        if let Self::Root(root) = self {
            match root.client
                .increment(
                    context,
                    &generated::TransactionCounterWritesMethodsTarget::new("target"),
                    request.clone(),
                )
                .await
            {
                Ok(_) | Err(generated::TransactionCounterWritesMethodsIncrementError::TransactionLimitExceeded(_)) => {}
                Err(generated::TransactionCounterWritesMethodsIncrementError::System(error)) if error.is_recoverable() => {}
                Err(generated::TransactionCounterWritesMethodsIncrementError::System(error)) => return Err(tonic::Status::unavailable(format!("unrecoverable remote system abort: {error:?}"))),
                Err(generated::TransactionCounterWritesMethodsIncrementError::Grpc(error)) => return Err(error),
            }
        }
        Ok(TransactionExecution::new(proto::TransactionCounterValue {
            value: state.value,
        }))
    }
    async fn shared_read(
        &self,
        context: &TransactionContext,
        state: &mut proto::TransactionCounter,
        _: proto::TransactionIncrementRequest,
    ) -> Result<TransactionExecution<proto::TransactionCounterValue>, tonic::Status> {
        shared_barrier(context.transaction_root_id()).await?;
        let mut execution =
            TransactionExecution::new(proto::TransactionCounterValue { value: state.value });
        if has("--negative-task-shape") {
            execution
                .task_upserts
                .push(generated::TransactionCounterWritesMethodsTasks::query(
                    &context.headers().state_ref,
                    &proto::TransactionIncrementRequest { amount: 9000 },
                ));
            std::fs::write(
                arg("--negative-shape-marker"),
                b"actual shared inbound handler returned task",
            )
            .unwrap();
        }
        Ok(execution)
    }

    async fn shared_read_fresh_shared(
        &self,
        _: &reboot::runtime::SharedLocalTransactionContext,
        state: &mut proto::TransactionCounter,
        request: proto::TransactionIncrementRequest,
    ) -> Result<proto::TransactionCounterValue, tonic::Status> {
        if std::env::var_os("REBOOT_TEST_FRESH_SHARED_NOOP").is_some() {
            if let Some(root) = std::env::var_os("REBOOT_TEST_SHARED_BARRIER_ID") {
                let root = root.to_string_lossy().parse().map_err(|error| {
                    tonic::Status::invalid_argument(format!("invalid shared barrier id: {error}"))
                })?;
                shared_barrier(root).await?;
            }
            return Ok(proto::TransactionCounterValue { value: state.value });
        }
        state.value += request.amount;
        Ok(proto::TransactionCounterValue { value: state.value })
    }
}
struct FullWatchProof(
    tokio::sync::Mutex<
        Option<
            std::pin::Pin<Box<dyn std::future::Future<Output = Result<(), tonic::Status>> + Send>>,
        >,
    >,
);
#[tonic::async_trait]
impl reboot::application_host::HostRecovery for FullWatchProof {
    async fn start(
        &self,
        _: &mut tokio::task::JoinSet<Result<(), tonic::Status>>,
        _: reboot::application_host::RecoveryCancellation,
    ) -> Result<(), tonic::Status> {
        self.0.lock().await.take().unwrap().await
    }
}
struct FullRootProof {
    work: tokio::sync::Mutex<
        Option<
            std::pin::Pin<Box<dyn std::future::Future<Output = Result<(), tonic::Status>> + Send>>,
        >,
    >,
    marker: String,
}
#[tonic::async_trait]
impl reboot::application_host::HostRecovery for FullRootProof {
    async fn start(
        &self,
        workers: &mut tokio::task::JoinSet<Result<(), tonic::Status>>,
        _: reboot::application_host::RecoveryCancellation,
    ) -> Result<(), tonic::Status> {
        workers.spawn(self.work.lock().await.take().unwrap());
        tokio::time::timeout(std::time::Duration::from_secs(3), async {
            while !std::path::Path::new(&format!("{}.cancel", self.marker)).exists() {
                tokio::time::sleep(std::time::Duration::from_millis(5)).await;
            }
        })
        .await
        .map_err(|_| {
            tonic::Status::deadline_exceeded("auxiliary root did not hold real owner capacity")
        })?;
        Ok(())
    }
}
struct GaugeTaskHandler {
    marker: String,
}
#[tonic::async_trait]
impl generated::RegistryGaugeMethodsTransactionHandler for GaugeTaskHandler {
    async fn query(
        &self,
        state: &proto::RegistryGauge,
        _: proto::TransactionIncrementRequest,
    ) -> Result<proto::RegistryGaugeValue, tonic::Status> {
        use std::io::Write;
        let mut calls = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(format!("{}.invocations", self.marker))
            .unwrap();
        writeln!(calls, "query").unwrap();
        let reading = format!("gauge:{}", state.value);
        std::fs::write(&self.marker, &reading).unwrap();
        Ok(proto::RegistryGaugeValue { reading })
    }
    async fn increment(
        &self,
        _: &TransactionContext,
        _: &mut proto::RegistryGauge,
        _: proto::TransactionIncrementRequest,
    ) -> Result<TransactionExecution<proto::RegistryGaugeValue>, tonic::Status> {
        Err(tonic::Status::unimplemented(
            "seeded reader-only registry fixture",
        ))
    }
}

struct Root {
    client: generated::TransactionCounterWritesMethodsClient<LegacyApplicationResolver>,
    multi_participant: bool,
    task_marker: Option<String>,
    block_task: bool,
}

/// The direct external-unary acceptance intentionally does not mount legacy
/// placement or transaction control routes. Its generated adapter persists
/// through the real C++ Database sidecar only.
struct ExternalConstructorHandler;

#[tonic::async_trait]
impl generated::ExternalConstructorMethodsDatabaseHandler for ExternalConstructorHandler {
    async fn construct(
        &self,
        state: &mut proto::ExternalConstructorCounter,
        request: proto::ExternalConstructorRequest,
    ) -> Result<proto::ExternalConstructorValue, generated::ExternalConstructorMethodsConstructError>
    {
        if request.amount < 0 {
            return Err(
                generated::ExternalConstructorMethodsConstructError::ExternalConstructorLimitExceeded(
                    proto::ExternalConstructorLimitExceeded { limit: 9 },
                ),
            );
        }
        state.value += request.amount;
        Ok(proto::ExternalConstructorValue { value: state.value })
    }
}

/// Converts the first successful generated adapter response into `Unavailable`.
struct FirstSuccessfulExternalConstructorUnavailable {
    inner: generated::ExternalConstructorMethodsDatabaseAdapter<ExternalConstructorHandler>,
    surfaced: AtomicBool,
}

#[tonic::async_trait]
impl proto::external_constructor_methods_server::ExternalConstructorMethods
    for FirstSuccessfulExternalConstructorUnavailable
{
    async fn construct(
        &self,
        request: tonic::Request<proto::ExternalConstructorRequest>,
    ) -> Result<tonic::Response<proto::ExternalConstructorValue>, tonic::Status> {
        let response = self.inner.construct(request).await?;
        if !self.surfaced.swap(true, Ordering::SeqCst) {
            return Err(tonic::Status::unavailable(
                "first successful generated adapter response",
            ));
        }
        Ok(response)
    }
}

/// A deliberately small, separately hosted service used only by the C++
/// Database process test. The root still calls it through the generated
/// transactional client; this server owns only the remote error wire shape.
struct TransactionRichErrorService;

#[tonic::async_trait]
impl proto::transaction_counter_writes_methods_server::TransactionCounterWritesMethods
    for TransactionRichErrorService
{
    async fn query_declared(
        &self,
        _: tonic::Request<proto::TransactionIncrementRequest>,
    ) -> Result<tonic::Response<proto::TransactionCounterValue>, tonic::Status> {
        Err(tonic::Status::unimplemented("fixture"))
    }
    async fn apply_declared(
        &self,
        _: tonic::Request<proto::TransactionIncrementRequest>,
    ) -> Result<tonic::Response<proto::TransactionCounterValue>, tonic::Status> {
        Err(tonic::Status::unimplemented("fixture"))
    }

    async fn query(
        &self,
        _: tonic::Request<proto::TransactionIncrementRequest>,
    ) -> Result<tonic::Response<proto::TransactionCounterValue>, tonic::Status> {
        Err(tonic::Status::unimplemented("fixture"))
    }
    async fn apply(
        &self,
        _: tonic::Request<proto::TransactionIncrementRequest>,
    ) -> Result<tonic::Response<proto::TransactionCounterValue>, tonic::Status> {
        Err(tonic::Status::unimplemented("fixture"))
    }
    async fn increment(
        &self,
        request: tonic::Request<proto::TransactionIncrementRequest>,
    ) -> Result<tonic::Response<proto::TransactionCounterValue>, tonic::Status> {
        let declared = prost_types::Any {
            type_url: "type.googleapis.com/tests.reboot.protoc.TransactionLimitExceeded".into(),
            value: proto::TransactionLimitExceeded { limit: 9 }.encode_to_vec(),
        };
        let status = match request.into_inner().amount {
            100 => googleapis_tonic_google_rpc::google::rpc::Status {
                code: tonic::Code::InvalidArgument as i32,
                message: "remote fixture".into(),
                details: vec![declared],
            },
            // The rich outer code disagrees with the gRPC status code.
            101 => googleapis_tonic_google_rpc::google::rpc::Status {
                code: tonic::Code::Unknown as i32,
                message: "remote fixture".into(),
                details: vec![declared],
            },
            // A Reboot backend error that Python permits callers to catch
            // while the root transaction continues.
            104 => {
                return Err(
                    reboot::SystemAborted::NotFound(reboot::database_proto::NotFound {})
                        .into_status("remote state is absent"),
                );
            }
            // Reboot sourced this outcome, but it still requires the whole
            // root transaction to retry rather than committing through it.
            105 => {
                return Err(reboot::SystemAborted::TransactionShouldRetry(
                    reboot::database_proto::TransactionShouldRetry {
                        reason: reboot::database_proto::transaction_should_retry::Reason::RestartDetected as i32,
                        retry_age: "fixture".into(),
                    },
                )
                .into_status("remote transaction must retry"));
            }
            // A trailer which cannot decode as google.rpc.Status.
            102 => {
                return Err(tonic::Status::with_details(
                    tonic::Code::InvalidArgument,
                    "remote fixture",
                    vec![0xff].into(),
                ));
            }
            // A normal gRPC error with no rich status trailer.
            _ => return Err(tonic::Status::not_found("remote no trailer")),
        };
        let code = match status.code {
            5 => tonic::Code::NotFound,
            14 => tonic::Code::Unavailable,
            _ => tonic::Code::InvalidArgument,
        };
        let message = status.message.clone();
        Err(tonic::Status::with_details(
            code,
            message,
            status.encode_to_vec().into(),
        ))
    }
    async fn factory_increment(
        &self,
        _: tonic::Request<proto::TransactionIncrementRequest>,
    ) -> Result<tonic::Response<proto::TransactionCounterValue>, tonic::Status> {
        Err(tonic::Status::unimplemented("fixture"))
    }
    async fn factory_increment_target(
        &self,
        _: tonic::Request<proto::TransactionIncrementRequest>,
    ) -> Result<tonic::Response<proto::TransactionCounterValue>, tonic::Status> {
        Err(tonic::Status::unimplemented("fixture"))
    }
    async fn shared_read(
        &self,
        _: tonic::Request<proto::TransactionIncrementRequest>,
    ) -> Result<tonic::Response<proto::TransactionCounterValue>, tonic::Status> {
        Err(tonic::Status::unimplemented("fixture"))
    }
}

fn arg(name: &str) -> String {
    std::env::args()
        .skip_while(|arg| arg != name)
        .nth(1)
        .unwrap_or_else(|| panic!("missing {name}"))
}
fn has(name: &str) -> bool {
    std::env::args().any(|arg| arg == name)
}
fn optional_arg(name: &str) -> Option<String> {
    let mut args = std::env::args();
    while let Some(arg) = args.next() {
        if arg == name {
            return args.next();
        }
    }
    None
}

fn placement() -> (PlanOnlyLegacyPlacement, Option<PlacementPlannerRecovery>) {
    let placement = PlanOnlyLegacyPlacement::new();
    if let Some(endpoint) = optional_arg("--placement-planner") {
        let recovery = PlacementPlannerRecovery::new(endpoint, placement.clone())
            .expect("--placement-planner must be a valid URI");
        return (placement, Some(recovery));
    }
    let encoded = arg("--legacy-placement-plan");
    let bytes = URL_SAFE_NO_PAD
        .decode(encoded)
        .expect("--legacy-placement-plan must be URL-safe base64 without padding");
    let plan = reboot::placement_proto::ListenForPlanResponse::decode(bytes.as_slice())
        .expect("--legacy-placement-plan must contain ListenForPlanResponse bytes");
    placement
        .install(plan)
        .expect("--legacy-placement-plan must be accepted");
    (placement, None)
}

/// Test-only cross-process barrier proving shared handlers overlap before
/// either read-only participant is released at Prepare.
async fn shared_barrier(transaction_id: Uuid) -> Result<(), tonic::Status> {
    let Some(directory) = std::env::var_os("REBOOT_TEST_SHARED_BARRIER_DIR") else {
        return Ok(());
    };
    std::fs::create_dir_all(&directory)
        .map_err(|error| tonic::Status::internal(error.to_string()))?;
    std::fs::write(
        std::path::Path::new(&directory).join(transaction_id.to_string()),
        [],
    )
    .map_err(|error| tonic::Status::internal(error.to_string()))?;
    for _ in 0..400 {
        let arrivals = std::fs::read_dir(&directory)
            .map_err(|error| tonic::Status::internal(error.to_string()))?
            .count();
        if arrivals >= 2 {
            return Ok(());
        }
        tokio::time::sleep(std::time::Duration::from_millis(10)).await;
    }
    Err(tonic::Status::deadline_exceeded(
        "shared transaction barrier did not observe both callers",
    ))
}

#[tokio::main(worker_threads = 4)]
async fn main() {
    let role = arg("--role");
    let listen = arg("--listen");
    if role == "wait-result" {
        let id = reboot::database_proto::TaskId {
            state_type: optional_arg("--wait-state-type")
                .unwrap_or_else(|| "tests.reboot.protoc.TransactionCounter".into()),
            state_ref: arg("--state-ref"),
            task_uuid: uuid::Uuid::parse_str(&arg("--task-uuid"))
                .unwrap()
                .as_bytes()
                .to_vec(),
        };
        let mut request = tonic::Request::new(id.clone());
        request.set_timeout(std::time::Duration::from_millis(
            optional_arg("--wait-timeout-ms")
                .map(|value| value.parse().unwrap())
                .unwrap_or(8000),
        ));
        let result = if let Some(endpoint) = optional_arg("--wait-planner") {
            let placement = PlanOnlyLegacyPlacement::new();
            let client = generated::TransactionCounterWritesMethodsTasksWaitRouted::new(
                LegacyApplicationResolver::new(
                    LegacyApplicationId::new("generated-cxx-database-process").unwrap(),
                    placement.clone(),
                ),
            );
            assert_eq!(
                client
                    .query(tonic::Request::new(id.clone()))
                    .await
                    .unwrap_err()
                    .code(),
                tonic::Code::Unavailable
            );
            let mut wrong = id.clone();
            wrong.state_type = "example.Wrong".into();
            assert_eq!(
                client
                    .query(tonic::Request::new(wrong))
                    .await
                    .unwrap_err()
                    .code(),
                tonic::Code::InvalidArgument
            );
            let mut planner =
                reboot::placement_proto::placement_planner_client::PlacementPlannerClient::connect(
                    endpoint,
                )
                .await
                .unwrap();
            let mut stream = planner
                .listen_for_plan(reboot::placement_proto::ListenForPlanRequest {})
                .await
                .unwrap()
                .into_inner();
            let first = tokio::time::timeout(std::time::Duration::from_secs(3), stream.message())
                .await
                .unwrap()
                .unwrap()
                .unwrap();
            placement.install(first).unwrap();
            if has("--prove-route-refresh") {
                request
                    .metadata_mut()
                    .insert("x-wait-route-proof", "preserved".parse().unwrap());
                assert_eq!(client.query(request).await.unwrap().value, 12);
                std::fs::write(format!("{}.first", arg("--result-marker")), "first route").unwrap();
                let next =
                    tokio::time::timeout(std::time::Duration::from_secs(3), stream.message())
                        .await
                        .unwrap()
                        .unwrap()
                        .unwrap();
                placement.install(next).unwrap();
                let mut request = tonic::Request::new(id);
                request.set_timeout(std::time::Duration::from_secs(2));
                request
                    .metadata_mut()
                    .insert("x-wait-route-proof", "preserved".parse().unwrap());
                client.query(request).await
            } else {
                client.query(request).await
            }
        } else {
            let channel = tonic::transport::Endpoint::from_shared(format!("http://{listen}"))
                .unwrap()
                .connect()
                .await
                .unwrap();
            generated::TransactionCounterWritesMethodsTasksWait::query(channel, request).await
        };
        let output = if let Some(expected) = optional_arg("--expect-wait-error") {
            let error = result.unwrap_err();
            if expected == "Deadline" {
                assert!(matches!(
                    error.code(),
                    tonic::Code::Cancelled | tonic::Code::DeadlineExceeded
                ));
            } else {
                assert_eq!(format!("{:?}", error.code()), expected);
            }
            expected
        } else {
            result.unwrap().value.to_string()
        };
        std::fs::write(arg("--result-marker"), output).unwrap();
        return;
    }
    if role == "error-remote" {
        tonic::transport::Server::builder()
            .add_service(
                proto::transaction_counter_writes_methods_server::TransactionCounterWritesMethodsServer::new(
                    TransactionRichErrorService,
                ),
            )
            .serve(listen.parse().unwrap())
            .await
            .unwrap();
        return;
    }
    if role == "external-constructor" {
        let database_endpoint = arg("--database");
        let state_ref = optional_arg("--state-ref").unwrap_or_else(|| role.clone());
        let store = DatabaseActorStore::connect(&database_endpoint)
            .await
            .unwrap();
        let adapter = generated::ExternalConstructorMethodsDatabaseAdapter::new(
            store,
            ExternalConstructorHandler,
        );
        let address = listen.parse().unwrap();
        let surface_first_success_unavailable = has("--surface-first-success-unavailable");
        let server = tokio::spawn(async move {
            let mut server = tonic::transport::Server::builder();
            if surface_first_success_unavailable {
                server
                    .add_service(proto::external_constructor_methods_server::ExternalConstructorMethodsServer::new(
                        FirstSuccessfulExternalConstructorUnavailable { inner: adapter, surfaced: AtomicBool::new(false) },
                    ))
                    .serve(address)
                    .await
                    .unwrap();
            } else {
                server
                    .add_service(proto::external_constructor_methods_server::ExternalConstructorMethodsServer::new(adapter))
                    .serve(address)
                    .await
                    .unwrap();
            }
        });
        if has("--invoke") {
            let endpoint = format!("http://{listen}");
            let context = reboot::ExternalContext::new(&state_ref);
            let channel = loop {
                match context.connect(endpoint.clone()).await {
                    Ok(channel) => break channel,
                    Err(_) => tokio::time::sleep(std::time::Duration::from_millis(10)).await,
                }
            };
            let mut client =
                generated::ExternalConstructorMethodsExternalClient::new(channel, context);
            let amount = optional_arg("--amount")
                .map(|amount| amount.parse().expect("--amount must be i64"))
                .unwrap_or(7);
            let key = optional_arg("--idempotency-key")
                .expect("external constructor requires --idempotency-key")
                .parse()
                .expect("--idempotency-key must be a UUID");
            match client
                .construct_with_key(proto::ExternalConstructorRequest { amount }, key)
                .await
            {
                Ok(_) if has("--expect-declared-constructor-error") => {
                    panic!("constructor unexpectedly succeeded")
                }
                Ok(_) => {}
                Err(generated::ExternalConstructorMethodsConstructError::ExternalConstructorLimitExceeded(error))
                    if has("--expect-declared-constructor-error") =>
                {
                    assert_eq!(error, proto::ExternalConstructorLimitExceeded { limit: 9 });
                }
                Err(error) => panic!("external constructor invocation failed: {error:?}"),
            }
        }
        if has("--exit-after-invoke") {
            server.abort();
            return;
        }
        server.await.unwrap();
        return;
    }
    let database_endpoint = arg("--database");
    let root_id = Uuid::parse_str(&arg("--root-id")).unwrap();
    let state_ref = optional_arg("--state-ref").unwrap_or_else(|| role.clone());
    let (placement, planner_recovery) = placement();
    let application = LegacyApplicationId::new("generated-cxx-database-process").unwrap();
    let participant_sidecar = Arc::new(
        TonicParticipantSidecar::connect(&database_endpoint)
            .await
            .unwrap(),
    );
    let coordinator_sidecar = Arc::new(
        TonicCoordinatorSidecar::connect(&database_endpoint)
            .await
            .unwrap(),
    );
    let participant = DurableActorParticipant::new(
        participant_sidecar,
        "tests.reboot.protoc.TransactionCounter",
        state_ref.clone(),
    );
    let coordinator = reboot::durable_coordinator::DurableRootCoordinator::new(
        Arc::clone(&coordinator_sidecar),
        Arc::new(LegacyApplicationParticipantResolver::new(
            application.clone(),
            placement.clone(),
        )),
    );
    // Any recovered participant can host the legacy Coordinator route for this
    // configured coordinator identity. The decision itself is read from the
    // real C++ sidecar, not a process-local coordinator map.
    let coordinator_state_ref =
        optional_arg("--coordinator-state-ref").unwrap_or_else(|| "root".into());
    let watch_coordinator_state_ref = optional_arg("--watch-coordinator-state-ref")
        .unwrap_or_else(|| coordinator_state_ref.clone());

    let starts = Starts {
        root: root_id,
        child: optional_arg("--tree-child")
            .map(|value| Uuid::parse_str(&value).unwrap())
            .unwrap_or_else(|| Uuid::from_u128(2)),
    };
    let handler = if role == "tasks" || has("--remote-reader-task") {
        Handler::Tasks {
            state_ref: state_ref.clone(),
            marker: arg("--task-marker"),
            block: has("--block-task"),
            vector: optional_arg("--task-vector").unwrap_or_default(),
        }
    } else if role == "root" || role == "multi-root" || role == "tree-branch" {
        Handler::Root(Root {
            client: generated::TransactionCounterWritesMethodsClient::new(
                LegacyApplicationResolver::new(application.clone(), placement.clone()),
            ),
            multi_participant: role == "multi-root",
            task_marker: optional_arg("--root-reader-task"),
            block_task: has("--block-task"),
        })
    } else {
        Handler::Target
    };
    let store = DatabaseActorStore::connect(&database_endpoint)
        .await
        .unwrap();
    if has("--prove-task-composition") {
        let gate_mismatch = participant
            .validate_task_owner(&store, "tests.reboot.protoc.TransactionCounter", &state_ref)
            .unwrap_err();
        assert_eq!(gate_mismatch.code(), tonic::Code::FailedPrecondition);
        let matched = participant.clone().with_database_actor_gate(&store);
        matched
            .validate_task_owner(&store, "tests.reboot.protoc.TransactionCounter", &state_ref)
            .unwrap();
        let foreign = DatabaseActorStore::connect(arg("--task-foreign-database"))
            .await
            .unwrap();
        let store_mismatch = matched
            .validate_task_owner(
                &foreign,
                "tests.reboot.protoc.TransactionCounter",
                &state_ref,
            )
            .unwrap_err();
        assert_eq!(store_mismatch.code(), tonic::Code::FailedPrecondition);
        // Isolate endpoint mismatch from gate mismatch by binding the foreign gate.
        let endpoint_only = participant.clone().with_database_actor_gate(&foreign);
        assert_eq!(
            endpoint_only
                .validate_task_owner(
                    &foreign,
                    "tests.reboot.protoc.TransactionCounter",
                    &state_ref
                )
                .unwrap_err()
                .code(),
            tonic::Code::FailedPrecondition
        );
        std::fs::write(
            arg("--task-composition-marker"),
            b"matching accepted; independent gate and store rejected",
        )
        .unwrap();
        return;
    }
    if has("--rollback-legacy-handler") {
        // A distinct adapter generic uses a handler with no typed override at all.
        let owner = reboot::live_participant::LiveParticipantOwner::new(
            8,
            reboot::durable_coordinator::ParticipantTarget {
                state_type: "tests.reboot.protoc.TransactionCounter".into(),
                state_ref: watch_coordinator_state_ref.clone(),
            },
            Arc::new(
                LegacyApplicationCoordinatorWatchEndpoint::new(
                    application.clone(),
                    placement.clone(),
                    watch_coordinator_state_ref.clone(),
                )
                .unwrap(),
            ),
        )
        .unwrap();
        let legacy = generated::TransactionCounterWritesMethodsTransactionAdapter::new(
            store,
            participant.clone(),
            coordinator.clone(),
            starts,
            LegacyRollbackHandler(handler),
        )
        .with_live_participant_owner(owner)
        .with_supervised_transaction_tree();
        let mut legacy_host = ApplicationHost::new("generated-cxx-database-process")
            .with_legacy_placement_readiness(placement.clone())
            .with_host_recovery(legacy.live_participant_recovery_registration().unwrap());
        if let Some(recovery) = planner_recovery {
            legacy_host = legacy_host.with_host_recovery(recovery);
        }
        legacy_host.add_legacy_control_service(legacy.legacy_participant_control_service())
            .add_legacy_control_service(legacy.legacy_coordinator_control_service(
                "tests.reboot.protoc.TransactionCounter", coordinator_state_ref,
            ).unwrap())
            .add_public_service(proto::transaction_counter_writes_methods_server::TransactionCounterWritesMethodsServer::new(legacy))
            .serve_with_shutdown(listen.parse().unwrap(), std::future::pending::<()>())
            .await.unwrap();
        return;
    }
    let adapter = generated::TransactionCounterWritesMethodsTransactionAdapter::new(
        store,
        participant.clone(),
        coordinator.clone(),
        starts,
        handler,
    );
    let (adapter, tasks) = if (role == "tasks"
        || has("--root-reader-task")
        || has("--remote-reader-task")
        || has("--tree-task-owner"))
        && !has("--no-task-owner")
    {
        let (adapter, tasks) = if has("--writer-tasks") {
            adapter.with_one_shot_writer_tasks(&state_ref).unwrap()
        } else {
            adapter.with_one_shot_reader_tasks(&state_ref).unwrap()
        };
        (adapter, Some(tasks))
    } else {
        (adapter, None)
    };
    let root_owner = reboot::explicit_abort::ExplicitAbortOwner::new(1).unwrap();
    let adapter = if has("--owned-explicit-abort") && !has("--no-root-owner") {
        adapter.with_explicit_abort_owner(root_owner.clone())
    } else {
        adapter
    };
    let live_owner = if has("--live-watch") && !has("--no-live-owner") {
        Some(
            reboot::live_participant::LiveParticipantOwner::new(
                if has("--full-live-owner") { 1 } else { 8 },
                reboot::durable_coordinator::ParticipantTarget {
                    state_type: "tests.reboot.protoc.TransactionCounter".into(),
                    state_ref: watch_coordinator_state_ref.clone(),
                },
                Arc::new(
                    LegacyApplicationCoordinatorWatchEndpoint::new(
                        application.clone(),
                        placement.clone(),
                        watch_coordinator_state_ref.clone(),
                    )
                    .unwrap(),
                ),
            )
            .unwrap(),
        )
    } else {
        None
    };
    let adapter = if let Some(owner) = &live_owner {
        adapter.with_live_participant_owner(owner.clone())
    } else {
        adapter
    };
    let adapter = if has("--supervised-tree") {
        adapter.with_supervised_transaction_tree()
    } else {
        adapter
    };
    if has("--prove-cancel-before-durable") {
        use proto::transaction_counter_writes_methods_server::TransactionCounterWritesMethods;
        let mut request = tonic::Request::new(proto::TransactionIncrementRequest { amount: -9000 });
        *request.metadata_mut() = reboot::RebootHeaders::new(&state_ref)
            .to_metadata()
            .unwrap();
        assert!(
            tokio::time::timeout(
                std::time::Duration::from_secs(1),
                adapter.increment(request)
            )
            .await
            .is_err()
        );
        assert!(std::path::Path::new(&format!("{}.cancel", arg("--task-marker"))).exists());
        // The next ordinary public root below must admit and commit against the
        // same participant, not a reconstructed or manually released actor.
    }
    let address = listen.parse().unwrap();
    // The generated adapter, rather than fixture-only construction, supplies
    // the exact injected Participant and Coordinator control services. For
    // recovery the host owns their listener-first lifecycle and receives the
    // same explicit C++ Database recovery metadata the old fixture passed by
    // hand: the one configured shard, no state-tag filter, and this actor's
    // exact coordinator state reference.
    let mut host = ApplicationHost::new("generated-cxx-database-process")
        .with_legacy_placement_readiness(placement.clone());
    if let Some(planner_recovery) = planner_recovery {
        host = host.with_host_recovery(planner_recovery);
    }
    if has("--owned-explicit-abort") && !has("--no-root-owner") && !has("--inactive-root-owner") {
        host = host.with_host_recovery(adapter.explicit_abort_recovery_registration().unwrap());
    }
    if live_owner.is_some() && !has("--inactive-live-owner") {
        host = host.with_host_recovery(adapter.live_participant_recovery_registration().unwrap());
    }
    if has("--full-root-owner") {
        let auxiliary = "root-capacity";
        let marker = format!("{}.root-capacity", arg("--task-marker"));
        let mut db = reboot::database_proto::database_client::DatabaseClient::connect(
            database_endpoint.clone(),
        )
        .await
        .unwrap();
        db.store(reboot::database_proto::StoreRequest {
            actor_upserts: vec![reboot::database_proto::Actor {
                state_type: "tests.reboot.protoc.TransactionCounter".into(),
                state_ref: auxiliary.into(),
                state: Some(proto::TransactionCounter { value: 20 }.encode_to_vec()),
                ..Default::default()
            }],
            sync: true,
            ..Default::default()
        })
        .await
        .unwrap();
        let auxiliary_participant = DurableActorParticipant::new(
            Arc::new(
                TonicParticipantSidecar::connect(&database_endpoint)
                    .await
                    .unwrap(),
            ),
            "tests.reboot.protoc.TransactionCounter",
            auxiliary,
        );
        let auxiliary_adapter = generated::TransactionCounterWritesMethodsTransactionAdapter::new(
            DatabaseActorStore::connect(&database_endpoint)
                .await
                .unwrap(),
            auxiliary_participant,
            coordinator.clone(),
            Starts {
                root: Uuid::new_v4(),
                child: Uuid::new_v4(),
            },
            Handler::Tasks {
                state_ref: auxiliary.into(),
                marker: marker.clone(),
                block: false,
                vector: String::new(),
            },
        )
        .with_explicit_abort_owner(root_owner);
        host = host.with_host_recovery(FullRootProof { marker, work: tokio::sync::Mutex::new(Some(Box::pin(async move {
            use proto::transaction_counter_writes_methods_server::TransactionCounterWritesMethods;
            let mut request = tonic::Request::new(proto::TransactionIncrementRequest { amount: -9000 });
            *request.metadata_mut() = reboot::RebootHeaders::new(auxiliary).to_metadata().unwrap();
            auxiliary_adapter.increment(request).await?;
            Err(tonic::Status::internal("held auxiliary root unexpectedly returned"))
        }))) });
    }
    if has("--full-live-owner") {
        let full_watch_coordinator = watch_coordinator_state_ref.clone();
        let auxiliary = "watch-capacity";
        let mut db = reboot::database_proto::database_client::DatabaseClient::connect(
            database_endpoint.clone(),
        )
        .await
        .unwrap();
        db.store(reboot::database_proto::StoreRequest {
            actor_upserts: vec![reboot::database_proto::Actor {
                state_type: "tests.reboot.protoc.TransactionCounter".into(),
                state_ref: auxiliary.into(),
                state: Some(proto::TransactionCounter { value: 20 }.encode_to_vec()),
                ..Default::default()
            }],
            sync: true,
            ..Default::default()
        })
        .await
        .unwrap();
        let auxiliary_participant = DurableActorParticipant::new(
            Arc::new(
                TonicParticipantSidecar::connect(&database_endpoint)
                    .await
                    .unwrap(),
            ),
            "tests.reboot.protoc.TransactionCounter",
            auxiliary,
        );
        let auxiliary_adapter = generated::TransactionCounterWritesMethodsTransactionAdapter::new(
            DatabaseActorStore::connect(&database_endpoint)
                .await
                .unwrap(),
            auxiliary_participant,
            coordinator.clone(),
            Starts {
                root: root_id,
                child: Uuid::from_u128(3),
            },
            Handler::Target,
        )
        .with_live_participant_owner(live_owner.clone().unwrap());
        host = host.with_host_recovery(FullWatchProof(tokio::sync::Mutex::new(Some(Box::pin(async move {
            use proto::transaction_counter_writes_methods_server::TransactionCounterWritesMethods;
            let mut headers = reboot::RebootHeaders::new(auxiliary);
            headers.transaction_ids = Some(vec![root_id]);
            headers.transaction_coordinator_state_type = Some("tests.reboot.protoc.TransactionCounter".into());
            headers.transaction_coordinator_state_ref = Some(full_watch_coordinator);
            let mut request = tonic::Request::new(proto::TransactionIncrementRequest { amount: 0 });
            *request.metadata_mut() = headers.to_metadata().unwrap();
            auxiliary_adapter.increment(request).await?;
            std::fs::write(format!("{}.watch-full", arg("--task-marker")), "real generated auxiliary inbound returned while owning Watch permit").unwrap();
            Ok(())
        })))));
    }
    if has("--recover") {
        let watch = Arc::new(
            LegacyApplicationCoordinatorWatchEndpoint::new(
                application.clone(),
                placement.clone(),
                watch_coordinator_state_ref,
            )
            .unwrap(),
        );
        let recovery = adapter
            .legacy_recovery_registration(
                LegacyRecoveryMetadata {
                    participant: ParticipantRecovery {
                        shard_ids: vec!["s000000000".into()],
                        ..Default::default()
                    },
                    coordinator: CoordinatorRecovery {
                        shard_ids: vec!["s000000000".into()],
                        coordinator_state_ref: coordinator_state_ref.clone(),
                        ..Default::default()
                    },
                },
                watch,
            )
            .unwrap();
        host = host.with_host_recovery(recovery);
    }
    if let Some(task_uuid) = optional_arg("--transition-task-uuid") {
        let owner = tasks
            .as_ref()
            .expect("transition requires generated task owner");
        let (prime_placement, prime_planner) = crate::placement();
        let prime = ApplicationHost::new("generated-cxx-database-process")
            .with_legacy_placement_readiness(prime_placement.clone())
            .with_host_recovery(prime_planner.expect("transition requires live planner"))
            .with_host_recovery(
                owner.recovery(reboot::database_proto::RecoverRequest {
                    state_tags_by_state_type: [(
                        "tests.reboot.protoc.TransactionCounter".into(),
                        "TransactionCounter".into(),
                    )]
                    .into(),
                    shard_ids: vec!["s000000000".into()],
                    skip_idempotent_mutations: true,
                }),
            )
            .add_public_service(owner.wait_service(
                application.clone(),
                "server-0",
                prime_placement,
            ));
        let (shutdown, stopped) = tokio::sync::oneshot::channel();
        let singleton = tokio::spawn(prime.serve_with_shutdown(address, async {
            let _ = stopped.await;
        }));
        let channel = tonic::transport::Endpoint::from_shared(format!("http://{listen}"))
            .unwrap()
            .connect_lazy();
        let mut client = reboot::database_proto::tasks_client::TasksClient::new(channel);
        tokio::time::timeout(std::time::Duration::from_secs(5), async {
            loop {
                let mut request = tonic::Request::new(reboot::database_proto::WaitRequest {
                    task_id: Some(reboot::database_proto::TaskId {
                        state_type: "tests.reboot.protoc.TransactionCounter".into(), state_ref: state_ref.clone(),
                        task_uuid: Uuid::parse_str(&task_uuid).unwrap().as_bytes().to_vec(),
                    }),
                });
                request.metadata_mut().insert("x-reboot-state-ref", state_ref.parse().unwrap());
                request.set_timeout(std::time::Duration::from_secs(1));
                match client.wait(request).await {
                    Ok(response) => {
                        let result = response.into_inner().response_or_error.unwrap().response_or_error.unwrap();
                        let reboot::database_proto::task_response_or_error::ResponseOrError::Response(result) = result else { panic!("singleton task error"); };
                        assert_eq!(result.type_url, "type.googleapis.com/tests.reboot.protoc.TransactionCounterValue");
                        assert_eq!(proto::TransactionCounterValue::decode(result.value.as_slice()).unwrap().value, 12);
                        break;
                    }
                    Err(status) if status.code() == tonic::Code::Unavailable => tokio::time::sleep(std::time::Duration::from_millis(10)).await,
                    Err(status) => panic!("singleton transition Wait: {status}"),
                }
            }
        }).await.expect("singleton task did not complete");
        shutdown.send(()).unwrap();
        tokio::time::timeout(std::time::Duration::from_secs(5), singleton)
            .await
            .unwrap()
            .unwrap()
            .unwrap();
        let marker = arg("--invoke-marker");
        std::fs::write(
            format!("{marker}.singleton-stopped"),
            "real singleton host returned and joined",
        )
        .unwrap();
        tokio::time::timeout(std::time::Duration::from_secs(10), async {
            while !std::path::Path::new(&format!("{marker}.shared-release")).exists() {
                tokio::time::sleep(std::time::Duration::from_millis(10)).await;
            }
        })
        .await
        .expect("shared transition release absent");
        // Reuse the exact owner from above, including its consumed singleton
        // notification receiver. Shared recovery owns its own serial rescan.
    }
    let mut wait_owners: Vec<_> = tasks.iter().cloned().collect();
    if let Some(endpoint) = optional_arg("--second-task-database") {
        // An independently recovered actor/database, not a filtered shared
        // shard stream or a second registration of the primary owner.
        let second_participant = DurableActorParticipant::new(
            Arc::new(TonicParticipantSidecar::connect(&endpoint).await.unwrap()),
            "tests.reboot.protoc.TransactionCounter",
            "second",
        );
        let second_coordinator = reboot::durable_coordinator::DurableRootCoordinator::new(
            Arc::new(TonicCoordinatorSidecar::connect(&endpoint).await.unwrap()),
            Arc::new(LegacyApplicationParticipantResolver::new(
                application.clone(),
                placement.clone(),
            )),
        );
        let second_adapter = generated::TransactionCounterWritesMethodsTransactionAdapter::new(
            DatabaseActorStore::connect(&endpoint).await.unwrap(),
            second_participant,
            second_coordinator,
            Starts {
                root: Uuid::new_v4(),
                child: Uuid::new_v4(),
            },
            Handler::Tasks {
                state_ref: "second".into(),
                marker: arg("--second-task-marker"),
                block: has("--block-task"),
                vector: String::new(),
            },
        );
        let (_, second) = second_adapter.with_one_shot_reader_tasks("second").unwrap();
        if !has("--shared-task-recovery") {
            host = host.with_host_recovery(
                second.recovery(reboot::database_proto::RecoverRequest {
                    state_tags_by_state_type: [(
                        "tests.reboot.protoc.TransactionCounter".into(),
                        "TransactionCounter".into(),
                    )]
                    .into(),
                    shard_ids: vec!["s000000000".into()],
                    skip_idempotent_mutations: true,
                }),
            );
        }
        wait_owners.push(second);
    }
    if let Some(endpoint) = optional_arg("--gauge-task-database") {
        let participant = DurableActorParticipant::new(
            Arc::new(TonicParticipantSidecar::connect(&endpoint).await.unwrap()),
            "tests.reboot.protoc.RegistryGauge",
            "root",
        );
        let coordinator = reboot::durable_coordinator::DurableRootCoordinator::new(
            Arc::new(TonicCoordinatorSidecar::connect(&endpoint).await.unwrap()),
            Arc::new(LegacyApplicationParticipantResolver::new(
                application.clone(),
                placement.clone(),
            )),
        );
        let adapter = generated::RegistryGaugeMethodsTransactionAdapter::new(
            DatabaseActorStore::connect(&endpoint).await.unwrap(),
            participant,
            coordinator,
            Starts {
                root: Uuid::new_v4(),
                child: Uuid::new_v4(),
            },
            GaugeTaskHandler {
                marker: arg("--second-task-marker"),
            },
        );
        let (_, gauge) = adapter.with_one_shot_reader_tasks("root").unwrap();
        if !has("--shared-task-recovery") {
            host = host.with_host_recovery(
                gauge.recovery(reboot::database_proto::RecoverRequest {
                    state_tags_by_state_type: [(
                        "tests.reboot.protoc.RegistryGauge".into(),
                        "RegistryGauge".into(),
                    )]
                    .into(),
                    shard_ids: vec!["s000000000".into()],
                    skip_idempotent_mutations: true,
                }),
            );
        }
        wait_owners.push(gauge);
    }
    if has("--shared-task-recovery") {
        let tags = if has("--gauge-task-database") {
            vec![
                (
                    "tests.reboot.protoc.TransactionCounter".into(),
                    "TransactionCounter".into(),
                ),
                (
                    "tests.reboot.protoc.RegistryGauge".into(),
                    "RegistryGauge".into(),
                ),
            ]
        } else {
            vec![(
                "tests.reboot.protoc.TransactionCounter".into(),
                "TransactionCounter".into(),
            )]
        };
        host = host.with_host_recovery(
            reboot::one_shot_tasks::ReaderTaskRecoveryRegistry::new(
                wait_owners.clone(),
                reboot::database_proto::RecoverRequest {
                    state_tags_by_state_type: tags.into_iter().collect(),
                    shard_ids: vec!["s000000000".into()],
                    skip_idempotent_mutations: true,
                },
            )
            .unwrap(),
        );
    }
    let wait_service = if wait_owners.is_empty() {
        None
    } else {
        Some(reboot::database_proto::tasks_server::TasksServer::new(
            reboot::one_shot_tasks::ReaderTaskWaitService::new(
                wait_owners,
                application.clone(),
                optional_arg("--server-id").unwrap_or_else(|| "server-0".into()),
                placement.clone(),
            )
            .unwrap(),
        ))
    };
    if has("--duplicate-task-registration") {
        host = host.with_host_recovery(
            tasks
                .as_ref()
                .unwrap()
                .recovery(reboot::database_proto::RecoverRequest {
                    state_tags_by_state_type: [(
                        "tests.reboot.protoc.TransactionCounter".into(),
                        "TransactionCounter".into(),
                    )]
                    .into(),
                    shard_ids: vec!["s000000000".into()],
                    skip_idempotent_mutations: true,
                }),
        );
    }
    if let Some(tasks) =
        tasks.filter(|_| !has("--shared-task-recovery") && !has("--inactive-task-owner"))
    {
        host = host.with_host_recovery(
            tasks.recovery(reboot::database_proto::RecoverRequest {
                state_tags_by_state_type: [(
                    "tests.reboot.protoc.TransactionCounter".into(),
                    "TransactionCounter".into(),
                )]
                .into(),
                shard_ids: vec!["s000000000".into()],
                skip_idempotent_mutations: true,
            }),
        );
    }
    let server = tokio::spawn(async move {
        let host = host.add_legacy_control_service(adapter.legacy_participant_control_service())
            .add_legacy_control_service(
                adapter
                    .legacy_coordinator_control_service(
                        "tests.reboot.protoc.TransactionCounter",
                        coordinator_state_ref,
                    )
                    .unwrap(),
            )
            .add_public_service(
                proto::transaction_counter_writes_methods_server::TransactionCounterWritesMethodsServer::new(
                    adapter,
                ),
            );
        let host = if let Some(service) = wait_service {
            host.add_public_service(service)
        } else {
            host
        };
        let result = host
            .serve_with_shutdown(address, async {
                if let Some(path) = optional_arg("--task-shutdown-file") {
                    while !std::path::Path::new(&path).exists() {
                        tokio::time::sleep(std::time::Duration::from_millis(5)).await;
                    }
                } else {
                    std::future::pending::<()>().await;
                }
            })
            .await;
        if let Some(marker) = std::env::var_os("REBOOT_TEST_COMPETING_ADMISSION") {
            assert!(matches!(
                result,
                Err(reboot::application_host::ApplicationHostError::RecoveryTask(_))
            ));
            std::fs::write(
                format!("{}.host-returned", marker.to_string_lossy()),
                "supervised host failure returned with open competing client",
            )
            .unwrap();
            return;
        }
        result.unwrap();
    });
    let competing = std::env::var_os("REBOOT_TEST_COMPETING_ADMISSION").map(|marker| {
        let listen = listen.clone();
        let state_ref = state_ref.clone();
        let ack = std::env::var_os("REBOOT_TEST_LOST_PARTICIPANT_COMMIT_ACK").unwrap();
        tokio::spawn(async move {
            tokio::time::timeout(std::time::Duration::from_secs(3), async {
                while !std::path::Path::new(&ack).exists() { tokio::time::sleep(std::time::Duration::from_millis(5)).await; }
            }).await.unwrap();
            let mut client = proto::transaction_counter_writes_methods_client::TransactionCounterWritesMethodsClient::connect(format!("http://{listen}")).await.unwrap();
            let mut request = tonic::Request::new(proto::TransactionIncrementRequest { amount: 7000 });
            *request.metadata_mut() = reboot::RebootHeaders::new(&state_ref).to_metadata().unwrap();
            // Deliberately no request deadline and no manual client cancellation.
            let status = client.increment(request).await.unwrap_err();
            assert_eq!(status.code(), tonic::Code::Unavailable);
            std::fs::write(format!("{}.released", marker.to_string_lossy()), "already-admitted unary request cancelled by host failure").unwrap();
        })
    });
    if has("--invoke") {
        let endpoint = format!("http://{listen}");
        let mut client = loop {
            match proto::transaction_counter_writes_methods_client::TransactionCounterWritesMethodsClient::connect(
                endpoint.clone(),
            )
            .await
            {
                Ok(client) => break client,
                Err(_) => tokio::time::sleep(std::time::Duration::from_millis(10)).await,
            }
        };
        let amount = optional_arg("--amount")
            .map(|amount| amount.parse().expect("--amount must be i64"))
            .unwrap_or(7);
        let idempotency_key = optional_arg("--idempotency-key")
            .map(|key| Uuid::parse_str(&key).expect("--idempotency-key must be a UUID"));
        let expected_response = optional_arg("--expect-response")
            .map(|value| value.parse::<i64>().expect("--expect-response must be i64"));
        if has("--writer-tasks") {
            tokio::time::timeout(std::time::Duration::from_secs(5), async {
                loop {
                    let mut probe =
                        tonic::Request::new(proto::TransactionIncrementRequest { amount: 0 });
                    *probe.metadata_mut() = reboot::RebootHeaders::new(&state_ref)
                        .to_metadata()
                        .unwrap();
                    match client.query(probe).await {
                        Ok(_) => break,
                        Err(status) if status.code() == tonic::Code::Unavailable => {
                            tokio::time::sleep(std::time::Duration::from_millis(10)).await
                        }
                        Err(status) => panic!("writer readiness probe: {status}"),
                    }
                }
            })
            .await
            .expect("writer host readiness");
            let mut request = tonic::Request::new(proto::TransactionIncrementRequest { amount });
            *request.metadata_mut() = reboot::RebootHeaders::new(&state_ref)
                .to_metadata()
                .unwrap();
            let result = client.increment(request).await;
            if has("--expect-task-error") {
                let error = result.unwrap_err();
                let expected = if has("--inactive-task-owner") || has("--no-task-owner") {
                    tonic::Code::FailedPrecondition
                } else {
                    tonic::Code::InvalidArgument
                };
                assert_eq!(error.code(), expected, "writer scheduling denial");
            } else {
                result.expect("one writer scheduling mutation");
            }
            std::fs::write(arg("--invoke-marker"), "acknowledged").unwrap();
        }
        for attempt in 0..if has("--writer-tasks") { 0 } else { 100 } {
            let mut request = tonic::Request::new(proto::TransactionIncrementRequest { amount });
            let mut headers = reboot::RebootHeaders::new(&state_ref);
            headers.idempotency_key = idempotency_key;
            *request.metadata_mut() = headers.to_metadata().unwrap();
            if let Some(marker) = std::env::var_os("REBOOT_TEST_TASK_ADMISSION_CANCEL") {
                if !std::path::Path::new(&format!("{}.cancelled", marker.to_string_lossy()))
                    .exists()
                    || std::env::var_os("REBOOT_TEST_CANCEL_PARTICIPANT_COMMIT_ACK").is_some()
                {
                    request.set_timeout(std::time::Duration::from_millis(350));
                }
            }
            let result = if has("--shared-invoke") {
                client.shared_read(request).await
            } else if has("--factory-target-invoke") {
                client.factory_increment_target(request).await
            } else if has("--factory-invoke") {
                client.factory_increment(request).await
            } else {
                client.increment(request).await
            };
            match result {
                Err(_)
                    if [
                        "REBOOT_TEST_LOST_PARTICIPANT_COMMIT_ACK",
                        "REBOOT_TEST_CANCEL_PARTICIPANT_COMMIT_ACK",
                    ]
                    .iter()
                    .any(|name| {
                        std::env::var_os(name)
                            .is_some_and(|marker| std::path::Path::new(&marker).exists())
                    }) =>
                {
                    break; // Await supervised host failure, never a manual kill.
                }
                Ok(response) => {
                    assert!(!has("--expect-task-error"));
                    if let Some(marker) = optional_arg("--invoke-marker") {
                        std::fs::write(marker, "acknowledged").unwrap();
                    }
                    if let Some(expected) = expected_response {
                        assert_eq!(response.into_inner().value, expected);
                    }
                    break;
                }
                Err(status)
                    if std::env::var_os("REBOOT_TEST_TASK_ADMISSION_CANCEL").is_some_and(
                        |marker| {
                            std::path::Path::new(&marker).exists()
                                && !std::path::Path::new(&format!(
                                    "{}.cancelled",
                                    marker.to_string_lossy()
                                ))
                                .exists()
                        },
                    ) =>
                {
                    assert!(
                        matches!(
                            status.code(),
                            tonic::Code::Cancelled | tonic::Code::DeadlineExceeded
                        ),
                        "admission should timeout, not fail: {status}"
                    );
                    let mut database =
                        reboot::database_proto::database_client::DatabaseClient::connect(
                            database_endpoint.clone(),
                        )
                        .await
                        .unwrap();
                    let loaded = database
                        .load(reboot::database_proto::LoadRequest {
                            actors: vec![reboot::database_proto::Actor {
                                state_type: "tests.reboot.protoc.TransactionCounter".into(),
                                state_ref: state_ref.clone(),
                                state: None,
                            }],
                            task_ids: vec![],
                        })
                        .await
                        .unwrap()
                        .into_inner();
                    assert_eq!(loaded.actors[0].state, Some(vec![0x08, 5]));
                    let mut recovery = database
                        .recover(reboot::database_proto::RecoverRequest {
                            shard_ids: vec!["s000000000".into()],
                            skip_idempotent_mutations: true,
                            ..Default::default()
                        })
                        .await
                        .unwrap()
                        .into_inner();
                    while let Some(batch) = recovery.message().await.unwrap() {
                        assert!(batch.pending_tasks.is_empty());
                        assert!(batch.participant_transactions.is_empty());
                        assert!(batch.transaction_coordinators.is_empty());
                    }
                    let marker = std::env::var_os("REBOOT_TEST_TASK_ADMISSION_CANCEL").unwrap();
                    std::fs::write(
                        format!("{}.cancelled", marker.to_string_lossy()),
                        "real sidecar unchanged; cancelled before stage/prepare",
                    )
                    .unwrap();
                    // Retry through the same generated participant and host. No reset.
                }
                Err(status)
                    if has("--placement-planner") && status.code() == tonic::Code::Unavailable =>
                {
                    if attempt == 99 {
                        panic!("fixture invocation never became ready: {status}");
                    }
                    tokio::time::sleep(std::time::Duration::from_millis(10)).await;
                }
                Err(status) if has("--expect-task-error") => {
                    let vector = arg("--task-vector");
                    let expected = if matches!(vector.as_str(), "capacity" | "saturation") {
                        tonic::Code::ResourceExhausted
                    } else if vector.starts_with("reuse:") {
                        tonic::Code::AlreadyExists
                    } else if matches!(vector.as_str(), "no-owner" | "writer") {
                        tonic::Code::FailedPrecondition
                    } else {
                        tonic::Code::InvalidArgument
                    };
                    assert_eq!(status.code(), expected, "denial vector {vector}: {status}");
                    if has("--shared-task-recovery") {
                        assert_eq!(status.message(), "no task recovery owner");
                        std::fs::write(
                            arg("--invoke-marker"),
                            "shared reader recovery refuses scheduling",
                        )
                        .unwrap();
                    }
                    if vector == "saturation" {
                        // Probe the same actor in the same live host: a retained
                        // exclusive admission would make this reader time out.
                        let mut probe =
                            tonic::Request::new(proto::TransactionIncrementRequest { amount: 0 });
                        *probe.metadata_mut() = reboot::RebootHeaders::new(&state_ref)
                            .to_metadata()
                            .unwrap();
                        probe.set_timeout(std::time::Duration::from_millis(500));
                        assert_eq!(client.query(probe).await.unwrap().into_inner().value, 5);
                        std::fs::write(
                            arg("--invoke-marker"),
                            "saturation rejected; admission released",
                        )
                        .unwrap();
                    }
                    break;
                }
                Err(status) if has("--expect-declared-factory-error") => {
                    assert_eq!(status.code(), tonic::Code::Unknown);
                    let details = reboot::declared_error_details(&status)
                        .unwrap()
                        .expect("factory declared error must include rich status details");
                    assert_eq!(
                        details.details[0].type_url,
                        "type.googleapis.com/tests.reboot.protoc.TransactionLimitExceeded"
                    );
                    assert_eq!(
                        proto::TransactionLimitExceeded::decode(
                            details.details[0].value.as_slice()
                        )
                        .unwrap(),
                        proto::TransactionLimitExceeded { limit: 13 }
                    );
                    break;
                }
                Err(status) => panic!("fixture invocation failed: {status}"),
            }
        }
        if has("--exit-after-invoke") {
            return;
        }
    }
    if let Some(task_uuid) = optional_arg("--declared-wait") {
        let channel = tonic::transport::Endpoint::from_shared(format!("http://{listen}"))
            .unwrap()
            .connect_lazy();
        let id = reboot::database_proto::TaskId {
            state_type: "tests.reboot.protoc.TransactionCounter".into(),
            state_ref: state_ref.clone(),
            task_uuid: Uuid::parse_str(&task_uuid).unwrap().as_bytes().to_vec(),
        };
        let limit = tokio::time::timeout(std::time::Duration::from_secs(5), async {
            loop {
                let mut request = tonic::Request::new(id.clone()); request.set_timeout(std::time::Duration::from_secs(2));
                let result = if has("--declared-reader") {
                    match generated::TransactionCounterWritesMethodsTasksWait::query_declared(channel.clone(), request).await {
                        Err(generated::TransactionCounterWritesMethodsQueryDeclaredError::TransactionLimitExceeded(error)) => Ok(error.limit),
                        Err(generated::TransactionCounterWritesMethodsQueryDeclaredError::Grpc(status)) => Err(status),
                        other => panic!("unexpected typed reader terminal: {other:?}"),
                    }
                } else {
                    match generated::TransactionCounterWritesMethodsTasksWait::apply_declared(channel.clone(), request).await {
                        Err(generated::TransactionCounterWritesMethodsApplyDeclaredError::TransactionLimitExceeded(error)) => Ok(error.limit),
                        Err(generated::TransactionCounterWritesMethodsApplyDeclaredError::Grpc(status)) => Err(status),
                        other => panic!("unexpected typed writer terminal: {other:?}"),
                    }
                };
                match result { Ok(limit) => break limit, Err(status) if has("--expect-declared-rpc-failure") && status.code() == tonic::Code::Unknown => { assert!(!status.details().is_empty()); break -2; }, Err(status) if has("--expect-declared-wrong-method") && status.code() == tonic::Code::FailedPrecondition => break -3, Err(status) if has("--expect-declared-malformed") && status.code() == tonic::Code::DataLoss => break -1, Err(status) if status.code() == tonic::Code::Unavailable => tokio::time::sleep(std::time::Duration::from_millis(10)).await, Err(status) => panic!("declared Wait failed: {status}") }
            }
        }).await.expect("declared typed Wait timeout");
        assert_eq!(
            limit,
            if has("--expect-declared-rpc-failure") {
                -2
            } else if has("--expect-declared-wrong-method") {
                -3
            } else if has("--expect-declared-malformed") {
                -1
            } else {
                4242
            }
        );
        std::fs::write(arg("--invoke-marker"), limit.to_string()).unwrap();
    }
    if let Some(task_uuid) = optional_arg("--writer-wait") {
        let channel = tonic::transport::Endpoint::from_shared(format!("http://{listen}"))
            .unwrap()
            .connect_lazy();
        let id = reboot::database_proto::TaskId {
            state_type: "tests.reboot.protoc.TransactionCounter".into(),
            state_ref: state_ref.clone(),
            task_uuid: Uuid::parse_str(&task_uuid).unwrap().as_bytes().to_vec(),
        };
        let result = tokio::time::timeout(std::time::Duration::from_secs(5), async {
            loop {
                let mut request = tonic::Request::new(id.clone());
                request.set_timeout(std::time::Duration::from_secs(2));
                match generated::TransactionCounterWritesMethodsTasksWait::apply(
                    channel.clone(),
                    request,
                )
                .await
                {
                    Ok(response) => break response,
                    Err(status) if status.code() == tonic::Code::Unavailable => {
                        tokio::time::sleep(std::time::Duration::from_millis(10)).await
                    }
                    Err(status) => panic!("generated writer typed Wait: {status}"),
                }
            }
        })
        .await
        .expect("typed writer Wait timed out");
        std::fs::write(arg("--invoke-marker"), result.value.to_string()).unwrap();
    }
    if has("--tree-typed-wait") {
        let marker = arg("--tree-local-tasks");
        tokio::time::timeout(std::time::Duration::from_secs(20), async {
            while !std::path::Path::new(&format!("{marker}.wait-ready")).exists() { tokio::time::sleep(std::time::Duration::from_millis(5)).await; }
            let tasks = reboot::database_proto::LoadResponse::decode(std::fs::read(format!("{marker}.records")).unwrap().as_slice()).unwrap().tasks;
            let channel = tonic::transport::Endpoint::from_shared(format!("http://{listen}")).unwrap().connect_lazy();
            let mut values = Vec::new();
            for task in tasks {
                loop {
                    let mut request = tonic::Request::new(task.task_id.clone().unwrap()); request.set_timeout(std::time::Duration::from_secs(15));
                    if task.method == "QueryDeclared" {
                        match generated::TransactionCounterWritesMethodsTasksWait::query_declared(channel.clone(), request).await {
                            Err(generated::TransactionCounterWritesMethodsQueryDeclaredError::TransactionLimitExceeded(error)) => { assert_eq!(error.limit, 4242); values.push(error.limit.to_string()); break; },
                            Err(generated::TransactionCounterWritesMethodsQueryDeclaredError::Grpc(status)) if status.code() == tonic::Code::Unavailable => { tokio::time::sleep(std::time::Duration::from_millis(10)).await; continue; },
                            other => panic!("tree declared reader result: {other:?}"),
                        }
                    }
                    if task.method == "ApplyDeclared" {
                        match generated::TransactionCounterWritesMethodsTasksWait::apply_declared(channel.clone(), request).await {
                            Err(generated::TransactionCounterWritesMethodsApplyDeclaredError::TransactionLimitExceeded(error)) => { assert_eq!(error.limit, 4242); values.push(error.limit.to_string()); break; },
                            Err(generated::TransactionCounterWritesMethodsApplyDeclaredError::Grpc(status)) if status.code() == tonic::Code::Unavailable => { tokio::time::sleep(std::time::Duration::from_millis(10)).await; continue; },
                            other => panic!("tree declared writer result: {other:?}"),
                        }
                    }
                    let result = if task.method == "Apply" { generated::TransactionCounterWritesMethodsTasksWait::apply(channel.clone(), request).await }
                        else { generated::TransactionCounterWritesMethodsTasksWait::query(channel.clone(), request).await };
                    match result { Ok(value) => { values.push(value.value.to_string()); break; }, Err(status) if status.code() == tonic::Code::Unavailable => tokio::time::sleep(std::time::Duration::from_millis(10)).await, Err(status) => panic!("tree typed Wait: {status}") }
                }
            }
            std::fs::write(format!("{marker}.typed-wait"), values.join("\n")).unwrap();
        }).await.expect("tree typed Wait bounded completion");
    }
    server.await.unwrap();
    if let Some(competing) = competing {
        competing.await.unwrap();
        let marker = std::env::var_os("REBOOT_TEST_COMPETING_ADMISSION").unwrap();
        assert!(
            std::path::Path::new(&format!("{}.host-returned", marker.to_string_lossy())).exists()
        );
        panic!("expected supervised host failure returned after cancelling competing admission");
    }
}
