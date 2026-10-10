use reboot_rust_schema::application_host::{
    ApplicationHost, ApplicationHostError, ApplicationLifecycle, ApplicationLifecyclePhase,
};
use std::{
    net::{SocketAddr, TcpListener},
    sync::{
        Arc, Mutex,
        atomic::{AtomicUsize, Ordering},
    },
    time::Duration,
};
use tonic::Status;
fn unused_local_address() -> SocketAddr {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    listener.local_addr().unwrap()
}
struct RecordedLifecycle {
    name: &'static str,
    trace: Arc<Mutex<Vec<String>>>,
    fail_recovery: bool,
    ready: Mutex<Option<tokio::sync::oneshot::Sender<()>>>,
}

#[tonic::async_trait]
impl ApplicationLifecycle for RecordedLifecycle {
    async fn initialize(&self) -> Result<(), Status> {
        self.trace
            .lock()
            .unwrap()
            .push(format!("initialize:{}", self.name));
        Ok(())
    }

    async fn recover(&self) -> Result<(), Status> {
        self.trace
            .lock()
            .unwrap()
            .push(format!("recover:{}", self.name));
        if self.fail_recovery {
            return Err(Status::failed_precondition("recovery failed"));
        }
        if let Some(ready) = self.ready.lock().unwrap().take() {
            ready.send(()).unwrap();
        }
        Ok(())
    }

    async fn shutdown(&self) -> Result<(), Status> {
        self.trace
            .lock()
            .unwrap()
            .push(format!("shutdown:{}", self.name));
        Ok(())
    }
}

fn lifecycle(
    name: &'static str,
    trace: Arc<Mutex<Vec<String>>>,
    fail_recovery: bool,
    ready: Option<tokio::sync::oneshot::Sender<()>>,
) -> RecordedLifecycle {
    RecordedLifecycle {
        name,
        trace,
        fail_recovery,
        ready: Mutex::new(ready),
    }
}

// A genuinely polled hook owns this guard until it returns or is cancelled.
struct LifecycleHookGuard {
    trace: Arc<Mutex<Vec<String>>>,
}
impl Drop for LifecycleHookGuard {
    fn drop(&mut self) {
        self.trace.lock().unwrap().push("drop:parked".into());
    }
}
struct ParkedLifecycle {
    phase: ApplicationLifecyclePhase,
    trace: Arc<Mutex<Vec<String>>>,
    entered: Mutex<Option<tokio::sync::oneshot::Sender<()>>>,
}
impl ParkedLifecycle {
    async fn park(&self) {
        let _guard = LifecycleHookGuard {
            trace: self.trace.clone(),
        };
        self.entered
            .lock()
            .unwrap()
            .take()
            .unwrap()
            .send(())
            .unwrap();
        std::future::pending::<()>().await;
    }
}
#[tonic::async_trait]
impl ApplicationLifecycle for ParkedLifecycle {
    async fn initialize(&self) -> Result<(), Status> {
        self.trace.lock().unwrap().push("initialize:parked".into());
        if self.phase == ApplicationLifecyclePhase::Initialize {
            self.park().await;
        }
        Ok(())
    }
    async fn recover(&self) -> Result<(), Status> {
        self.trace.lock().unwrap().push("recover:parked".into());
        if self.phase == ApplicationLifecyclePhase::Recover {
            self.park().await;
        }
        Ok(())
    }
    async fn shutdown(&self) -> Result<(), Status> {
        // Causal assertion at the cleanup producer, not eventual marker order.
        assert!(
            self.trace
                .lock()
                .unwrap()
                .iter()
                .any(|x| x == "drop:parked")
        );
        self.trace.lock().unwrap().push("shutdown:parked".into());
        Ok(())
    }
}
async fn assert_shutdown_interrupts_lifecycle(phase: ApplicationLifecyclePhase) {
    let address = unused_local_address();
    let trace = Arc::new(Mutex::new(Vec::new()));
    let (entered_tx, entered_rx) = tokio::sync::oneshot::channel();
    let (shutdown_tx, shutdown_rx) = tokio::sync::oneshot::channel();
    let host = ApplicationHost::new("parked-lifecycle")
        .with_lifecycle(lifecycle("first", trace.clone(), false, None))
        .with_lifecycle(ParkedLifecycle {
            phase,
            trace: trace.clone(),
            entered: Mutex::new(Some(entered_tx)),
        })
        .with_lifecycle(lifecycle("later", trace.clone(), false, None))
        .http();
    let serving =
        tokio::spawn(host.serve_with_shutdown(address, async { shutdown_rx.await.unwrap() }));
    tokio::time::timeout(Duration::from_secs(2), entered_rx)
        .await
        .unwrap()
        .unwrap();
    assert!(tokio::net::TcpStream::connect(address).await.is_err());
    shutdown_tx.send(()).unwrap();
    tokio::time::timeout(Duration::from_secs(2), serving)
        .await
        .expect("shutdown must interrupt the parked lifecycle hook")
        .unwrap()
        .unwrap();
    let trace = trace.lock().unwrap().clone();
    let expected = if phase == ApplicationLifecyclePhase::Initialize {
        vec![
            "initialize:first",
            "initialize:parked",
            "drop:parked",
            "shutdown:first",
        ]
    } else {
        vec![
            "initialize:first",
            "initialize:parked",
            "initialize:later",
            "recover:first",
            "recover:parked",
            "drop:parked",
            "shutdown:first",
            "shutdown:parked",
            "shutdown:later",
        ]
    };
    assert_eq!(trace, expected);
    assert!(tokio::net::TcpStream::connect(address).await.is_err());
}
#[tokio::test]
async fn lifecycle_initialize_shutdown_drops_parked_hook_before_cleanup_without_listener() {
    assert_shutdown_interrupts_lifecycle(ApplicationLifecyclePhase::Initialize).await;
}
#[tokio::test]
async fn lifecycle_recover_shutdown_drops_parked_hook_and_cleans_all_initialized() {
    assert_shutdown_interrupts_lifecycle(ApplicationLifecyclePhase::Recover).await;
}
struct CleanupFailureLifecycle {
    trace: Arc<Mutex<Vec<String>>>,
}
#[tonic::async_trait]
impl ApplicationLifecycle for CleanupFailureLifecycle {
    async fn initialize(&self) -> Result<(), Status> {
        Ok(())
    }
    async fn recover(&self) -> Result<(), Status> {
        Ok(())
    }
    async fn shutdown(&self) -> Result<(), Status> {
        self.trace.lock().unwrap().push("shutdown:failure".into());
        Err(Status::internal("cleanup failed"))
    }
}
#[tokio::test]
async fn lifecycle_start_error_preserves_primary_error_and_continues_cleanup() {
    let trace = Arc::new(Mutex::new(Vec::new()));
    let address = unused_local_address();
    let host = ApplicationHost::new("cleanup-failure")
        .with_lifecycle(CleanupFailureLifecycle {
            trace: trace.clone(),
        })
        .with_lifecycle(lifecycle("broken", trace.clone(), true, None))
        .http();
    let error = host
        .serve_with_shutdown(address, std::future::pending())
        .await
        .unwrap_err();
    match error {
        ApplicationHostError::Lifecycle {
            phase: ApplicationLifecyclePhase::Recover,
            component: 1,
            source,
        } => assert_eq!(source.code(), tonic::Code::FailedPrecondition),
        other => panic!("primary recovery failure was masked: {other:?}"),
    }
    assert_eq!(
        *trace.lock().unwrap(),
        vec![
            "initialize:broken",
            "recover:broken",
            "shutdown:failure",
            "shutdown:broken"
        ]
    );
    assert!(tokio::net::TcpStream::connect(address).await.is_err());
}
#[tokio::test]
async fn lifecycle_bind_failure_cleans_initialized_components_preserving_bind_error() {
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    let trace = Arc::new(Mutex::new(Vec::new()));
    let host = ApplicationHost::new("bind-failure")
        .with_lifecycle(CleanupFailureLifecycle {
            trace: trace.clone(),
        })
        .with_lifecycle(lifecycle("second", trace.clone(), false, None))
        .http();
    let error = host
        .serve_with_shutdown(address, std::future::pending())
        .await
        .unwrap_err();
    assert!(matches!(error, ApplicationHostError::Bind(_)));
    assert_eq!(
        *trace.lock().unwrap(),
        vec![
            "initialize:second",
            "recover:second",
            "shutdown:failure",
            "shutdown:second"
        ]
    );
}
#[tokio::test]
async fn lifecycle_precompleted_shutdown_skips_initialization_and_binding() {
    let trace = Arc::new(Mutex::new(Vec::new()));
    let address = unused_local_address();
    let host = ApplicationHost::new("already-stopped")
        .with_lifecycle(lifecycle("unused", trace.clone(), false, None))
        .http();
    host.serve_with_shutdown(address, async {}).await.unwrap();
    assert!(trace.lock().unwrap().is_empty());
    assert!(tokio::net::TcpStream::connect(address).await.is_err());
}

struct ShutdownAtRecoverCompletion {
    signal: Mutex<Option<tokio::sync::oneshot::Sender<()>>>,
    cleaned: Arc<AtomicUsize>,
}
#[tonic::async_trait]
impl ApplicationLifecycle for ShutdownAtRecoverCompletion {
    async fn initialize(&self) -> Result<(), Status> {
        Ok(())
    }
    async fn recover(&self) -> Result<(), Status> {
        self.signal
            .lock()
            .unwrap()
            .take()
            .unwrap()
            .send(())
            .unwrap();
        Ok(())
    }
    async fn shutdown(&self) -> Result<(), Status> {
        self.cleaned.fetch_add(1, Ordering::SeqCst);
        Ok(())
    }
}
#[tokio::test]
async fn lifecycle_final_hook_shutdown_is_observed_before_bind() {
    // An occupied address makes an attempted bind distinguishable from cancellation.
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let (tx, rx) = tokio::sync::oneshot::channel();
    let cleaned = Arc::new(AtomicUsize::new(0));
    let host = ApplicationHost::new("final-hook-shutdown")
        .with_lifecycle(ShutdownAtRecoverCompletion {
            signal: Mutex::new(Some(tx)),
            cleaned: cleaned.clone(),
        })
        .http();
    host.serve_with_shutdown(listener.local_addr().unwrap(), async { rx.await.unwrap() })
        .await
        .unwrap();
    assert_eq!(cleaned.load(Ordering::SeqCst), 1);
}
#[tokio::test]
async fn lifecycle_empty_registry_precompleted_shutdown_skips_bind() {
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let host = ApplicationHost::new("empty-stopped").http();
    host.serve_with_shutdown(listener.local_addr().unwrap(), async {})
        .await
        .unwrap();
}

#[tokio::test]
async fn http_normal_shutdown_reports_first_cleanup_error_and_drains_later_hooks() {
    let address = unused_local_address();
    let trace = Arc::new(Mutex::new(Vec::new()));
    let (tx, rx) = tokio::sync::oneshot::channel();
    let host = ApplicationHost::new("http-cleanup")
        .with_lifecycle(CleanupFailureLifecycle {
            trace: trace.clone(),
        })
        .with_lifecycle(lifecycle("later", trace.clone(), false, None))
        .http();
    let server = tokio::spawn(host.serve_with_shutdown(address, async { rx.await.unwrap() }));
    tokio::time::timeout(Duration::from_secs(2), async {
        loop {
            if tokio::net::TcpStream::connect(address).await.is_ok() {
                break;
            }
            tokio::task::yield_now().await;
        }
    })
    .await
    .unwrap();
    tx.send(()).unwrap();
    let error = tokio::time::timeout(Duration::from_secs(2), server)
        .await
        .unwrap()
        .unwrap()
        .unwrap_err();
    assert!(matches!(
        error,
        ApplicationHostError::Lifecycle {
            phase: ApplicationLifecyclePhase::Shutdown,
            component: 0,
            ..
        }
    ));
    assert_eq!(
        *trace.lock().unwrap(),
        vec![
            "initialize:later",
            "recover:later",
            "shutdown:failure",
            "shutdown:later"
        ]
    );
    assert!(tokio::net::TcpStream::connect(address).await.is_err());
}
