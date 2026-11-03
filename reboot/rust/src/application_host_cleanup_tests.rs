#[cfg(test)]
mod participant_cleanup_supervision_tests {
    use super::*;

    #[derive(Clone)]
    struct EmptyService;
    impl NamedService for EmptyService {
        const NAME: &'static str = "cleanup.Empty";
    }
    impl Service<HttpRequest<BoxBody>> for EmptyService {
        type Response = HttpResponse<BoxBody>;
        type Error = Infallible;
        type Future = std::future::Ready<Result<Self::Response, Self::Error>>;
        fn poll_ready(&mut self, _: &mut Context<'_>) -> Poll<Result<(), Self::Error>> {
            Poll::Ready(Ok(()))
        }
        fn call(&mut self, _: HttpRequest<BoxBody>) -> Self::Future {
            std::future::ready(Ok(tonic::Status::unimplemented("unused").into_http()))
        }
    }
    struct ChildDrop(Arc<std::sync::atomic::AtomicBool>);
    impl Drop for ChildDrop {
        fn drop(&mut self) {
            self.0.store(true, std::sync::atomic::Ordering::Release);
        }
    }
    async fn child(binding: &ParticipantCleanupBinding) -> Arc<std::sync::atomic::AtomicBool> {
        let dropped = Arc::new(std::sync::atomic::AtomicBool::new(false));
        let mark = dropped.clone();
        let (enter, entered) = tokio::sync::oneshot::channel();
        binding.reserve().unwrap().submit(async move {
            let _drop = ChildDrop(mark);
            enter.send(()).unwrap();
            std::future::pending::<()>().await;
        });
        entered.await.unwrap();
        dropped
    }
    #[tokio::test]
    async fn application_host_cleanup_timeout_returns_failure_after_abort_and_join() {
        let host = ApplicationHost::new("timeout").add_service(EmptyService);
        let binding = host.participant_cleanup.clone();
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let (stop, stopped) = tokio::sync::oneshot::channel();
        let serving = tokio::spawn(host.serve_with_listener_shutdown(listener, async {
            let _ = stopped.await;
        }));
        let dropped = child(&binding).await;
        stop.send(()).unwrap();
        let error = tokio::time::timeout(std::time::Duration::from_secs(7), serving)
            .await
            .unwrap()
            .unwrap()
            .unwrap_err();
        assert!(
            matches!(error, ApplicationHostError::ParticipantCleanup(ref status) if status.code() == tonic::Code::DeadlineExceeded)
        );
        assert!(dropped.load(std::sync::atomic::Ordering::Acquire));
        assert!(binding.reserve().is_err());
    }
    #[tokio::test]
    async fn application_host_cleanup_panic_returns_failure_after_abort_and_join_sibling() {
        let host = ApplicationHost::new("panic").add_service(EmptyService);
        let binding = host.participant_cleanup.clone();
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let (stop, stopped) = tokio::sync::oneshot::channel();
        let serving = tokio::spawn(host.serve_with_listener_shutdown(listener, async {
            let _ = stopped.await;
        }));
        let dropped = child(&binding).await;
        binding
            .reserve()
            .unwrap()
            .submit(async { panic!("controlled cleanup panic") });
        stop.send(()).unwrap();
        let error = tokio::time::timeout(std::time::Duration::from_secs(2), serving)
            .await
            .unwrap()
            .unwrap()
            .unwrap_err();
        assert!(
            matches!(error, ApplicationHostError::ParticipantCleanup(ref status) if status.code() == tonic::Code::Internal)
        );
        assert!(dropped.load(std::sync::atomic::Ordering::Acquire));
    }
    #[tokio::test]
    async fn host_cleanup_cap_covers_producers_queue_and_children_and_seal_accepts_late_drop() {
        let binding = ParticipantCleanupBinding::new();
        let mut driver = binding.start();
        let mut producers = Vec::new();
        for _ in 0..MAX_HOST_PARTICIPANT_CLEANUPS {
            producers.push(binding.reserve().unwrap());
        }
        assert!(binding.reserve().is_err());
        let late = producers.pop().unwrap();
        drop(producers);
        let (done, completed) = tokio::sync::oneshot::channel();
        let mut finishing = Box::pin(driver.finish());
        std::future::poll_fn(|cx| {
            assert!(finishing.as_mut().poll(cx).is_pending());
            Poll::Ready(())
        })
        .await;
        assert!(binding.reserve().is_err());
        late.submit(async move {
            done.send(()).unwrap();
        });
        completed.await.unwrap();
        finishing.await.unwrap();
        assert_eq!(
            binding.0.permits.available_permits(),
            MAX_HOST_PARTICIPANT_CLEANUPS
        );
    }
}
