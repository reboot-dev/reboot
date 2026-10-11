//! Clone-ready Tonic service templates. These are trusted host composition,
//! not dispatch tickets or an authorization/readiness exemption.
use std::convert::Infallible;
use std::future::Future;
use std::pin::Pin;
use std::sync::{Arc, Mutex};
use std::task::{Context, Poll};
use tonic::body::BoxBody;
use tower::Service;

type Request = http::Request<BoxBody>;
type Response = http::Response<BoxBody>;
pub type LocalServiceFuture = Pin<Box<dyn Future<Output = Result<Response, Infallible>> + Send>>;
pub type BoxLocalService = Box<
    dyn Service<Request, Response = Response, Error = Infallible, Future = LocalServiceFuture>
        + Send,
>;

struct EraseFuture<S>(S);
impl<S> Service<Request> for EraseFuture<S>
where
    S: Service<Request, Response = Response, Error = Infallible> + Send + 'static,
    S::Future: Send + 'static,
{
    type Response = Response;
    type Error = Infallible;
    type Future = LocalServiceFuture;
    fn poll_ready(&mut self, cx: &mut Context<'_>) -> Poll<Result<(), Infallible>> {
        self.0.poll_ready(cx)
    }
    fn call(&mut self, request: Request) -> Self::Future {
        Box::pin(self.0.call(request))
    }
}
trait CloneTemplate: Send + Sync {
    fn service(&self) -> BoxLocalService;
}
struct Template<S>(Mutex<S>);
impl<S> CloneTemplate for Template<S>
where
    S: Service<Request, Response = Response, Error = Infallible> + Clone + Send + 'static,
    S::Future: Send + 'static,
{
    fn service(&self) -> BoxLocalService {
        // Never retain the template lock while readiness or user code is polled.
        let service = self
            .0
            .lock()
            .expect("local service template poisoned")
            .clone();
        Box::new(EraseFuture(service))
    }
}
/// A template for the actual configured Tonic adapter. A cloned service must be
/// polled ready and then called on that SAME instance. This is not an internal
/// dispatch API: normal generated authentication/admission remains in force.
#[doc(hidden)]
#[derive(Clone)]
pub struct RegisteredServiceTemplate {
    service: Arc<dyn CloneTemplate>,
    inbound_factory: Option<Arc<dyn crate::runtime::InboundTransactionStartFactory>>,
}
impl RegisteredServiceTemplate {
    pub fn new<S>(service: S) -> Self
    where
        S: Service<Request, Response = Response, Error = Infallible> + Clone + Send + 'static,
        S::Future: Send + 'static,
    {
        Self {
            service: Arc::new(Template(Mutex::new(service))),
            inbound_factory: None,
        }
    }
    pub fn clone_service(&self) -> BoxLocalService {
        self.service.service()
    }
    /// Retain the actual configured allocator. This does not allocate a child,
    /// validate a ticket or grant execution authority.
    pub fn with_inbound_factory(
        mut self,
        factory: Arc<dyn crate::runtime::InboundTransactionStartFactory>,
    ) -> Self {
        self.inbound_factory = Some(factory);
        self
    }
    /// Trusted composition access, not an authorized local dispatch operation.
    pub fn inbound_factory(
        &self,
    ) -> Option<Arc<dyn crate::runtime::InboundTransactionStartFactory>> {
        self.inbound_factory.clone()
    }
}
/// Generated composition uses the very same configured adapter to create its
/// local Tonic service. No independent handler/policy/factory triples.
#[doc(hidden)]
pub trait GeneratedLocalTransactionService:
    crate::registered_local::GeneratedLocalTransactionAdapter + Clone
{
    type Service: Service<Request, Response = Response, Error = Infallible> + Clone + Send + 'static;
    fn local_service(&self) -> Self::Service;
    /// The same allocator used by this adapter's normal inbound path.
    fn local_inbound_factory(&self) -> Arc<dyn crate::runtime::InboundTransactionStartFactory>;
}

#[cfg(test)]
mod tests {
    use super::*;
    #[derive(Default)]
    struct ReadyService {
        ready: bool,
        calls: Arc<std::sync::atomic::AtomicUsize>,
    }
    impl Clone for ReadyService {
        fn clone(&self) -> Self {
            Self {
                ready: false,
                calls: self.calls.clone(),
            }
        }
    }
    impl Service<Request> for ReadyService {
        type Response = Response;
        type Error = Infallible;
        type Future = std::future::Ready<Result<Response, Infallible>>;
        fn poll_ready(&mut self, _: &mut Context<'_>) -> Poll<Result<(), Infallible>> {
            self.ready = true;
            Poll::Ready(Ok(()))
        }
        fn call(&mut self, _: Request) -> Self::Future {
            assert!(
                std::mem::take(&mut self.ready),
                "must call same readied clone"
            );
            self.calls.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
            std::future::ready(Ok(http::Response::new(tonic::body::empty_body())))
        }
    }
    #[tokio::test]
    async fn erased_services_preserve_readiness_and_release_template_lock() {
        let source = ReadyService::default();
        let calls = source.calls.clone();
        let template = RegisteredServiceTemplate::new(source);
        for _ in 0..2 {
            let mut service = template.clone_service();
            std::future::poll_fn(|cx| service.poll_ready(cx))
                .await
                .unwrap();
            // A separate clone can be obtained with a ready instance still live.
            let _other = template.clone_service();
            service
                .call(http::Request::new(tonic::body::empty_body()))
                .await
                .unwrap();
        }
        assert_eq!(calls.load(std::sync::atomic::Ordering::SeqCst), 2);
    }
}
