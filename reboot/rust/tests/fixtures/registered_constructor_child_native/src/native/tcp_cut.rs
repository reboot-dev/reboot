//! Task-owned sockets only. Transparent bytes, then actual TCP connection drop.
//! No HTTP/2 frame rewriting, status substitution, native child or port authority.
use super::*;
pub(super) struct TcpCut {
    pub(super) endpoint: String,
    cut: Option<tokio::sync::oneshot::Sender<()>>,
    server: tokio::task::JoinHandle<Result<usize, std::io::Error>>,
}
impl TcpCut {
    pub(super) async fn start(upstream: String) -> Self {
        let address = upstream.strip_prefix("http://").expect("fixture loopback HTTP upstream").to_owned();
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let endpoint = format!("http://{}", listener.local_addr().unwrap());
        let (cut, mut stopped) = tokio::sync::oneshot::channel();
        let server = tokio::spawn(async move {
            let mut connections = tokio::task::JoinSet::new();
            let mut accepted = 0;
            loop {
                tokio::select! {
                    _ = &mut stopped => break,
                    incoming = listener.accept() => {
                        let (mut caller, _) = incoming?;
                        let address = address.clone();
                        accepted += 1;
                        connections.spawn(async move {
                            let mut upstream = tokio::net::TcpStream::connect(address).await?;
                            tokio::io::copy_bidirectional(&mut caller, &mut upstream).await.map(|_| ())
                        });
                    },
                    ended = connections.join_next(), if !connections.is_empty() => {
                        // Closed socket forwarding errors are expected transport facts.
                        if let Some(Err(error)) = ended { return Err(std::io::Error::other(error)); }
                    },
                }
            }
            drop(listener); // No new connections can repair the deliberately cut authority.
            connections.abort_all();
            while let Some(result) = connections.join_next().await {
                if let Err(error) = result { assert!(error.is_cancelled()); }
            }
            Ok(accepted)
        });
        Self { endpoint, cut: Some(cut), server }
    }
    pub(super) async fn cut_and_join(&mut self) {
        self.cut.take().expect("cut once").send(()).unwrap();
        let accepted = bounded(&mut self.server).await.unwrap().unwrap();
        assert!(accepted > 0, "cannot claim TCP loss without actual accepted sidecar connection");
    }
}
impl Drop for TcpCut {
    fn drop(&mut self) {
        if let Some(cut) = self.cut.take() { let _ = cut.send(()); }
        self.server.abort(); // Panic cleanup only; successful path explicitly joined above.
    }
}
