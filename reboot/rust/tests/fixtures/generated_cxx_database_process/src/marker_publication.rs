use std::{
    io::{self, Write},
    path::Path,
};

/// Publish complete readiness bytes, not a power-loss durability guarantee.
/// Each caller must supply its own same-directory temporary pathname.
pub fn publish(marker: &Path, pending: &Path, bytes: &[u8]) -> io::Result<()> {
    publish_before_rename(marker, pending, bytes, || Ok(()))
}

fn publish_before_rename(
    marker: &Path,
    pending: &Path,
    bytes: &[u8],
    before_rename: impl FnOnce() -> io::Result<()>,
) -> io::Result<()> {
    let mut file = std::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(pending)?;
    let result = (|| {
        file.write_all(bytes)?;
        drop(file);
        before_rename()?;
        std::fs::rename(pending, marker)
    })();
    if result.is_err() {
        // Never remove another publisher's file after a failed exclusive open.
        let _ = std::fs::remove_file(pending);
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::mpsc;

    #[test]
    fn concurrent_publishers_keep_complete_independent_files() {
        let dir = std::env::temp_dir().join(format!("reboot-marker-proof-{}", std::process::id()));
        std::fs::create_dir(&dir).unwrap();
        let marker = dir.join("ready");
        let a = dir.join("ready.a.pending");
        let b = dir.join("ready.b.pending");
        let payload_a = vec![b'A'; 32768];
        let payload_b = vec![b'B'; 32768];
        let (entered_tx, entered_rx) = mpsc::channel();
        let (release_a, wait_a) = mpsc::channel();
        let (release_b, wait_b) = mpsc::channel();
        std::thread::scope(|scope| {
            let entered_a = entered_tx.clone();
            let (marker_a, pending_a, bytes_a) = (&marker, &a, &payload_a);
            let (marker_b, pending_b, bytes_b) = (&marker, &b, &payload_b);
            let first = scope.spawn(move || {
                publish_before_rename(marker_a, pending_a, bytes_a, || {
                    entered_a.send(()).unwrap();
                    wait_a.recv().unwrap();
                    Ok(())
                })
            });
            let second = scope.spawn(move || {
                publish_before_rename(marker_b, pending_b, bytes_b, || {
                    entered_tx.send(()).unwrap();
                    wait_b.recv().unwrap();
                    Ok(())
                })
            });
            for _ in 0..2 {
                entered_rx
                    .recv_timeout(std::time::Duration::from_secs(5))
                    .unwrap();
            }
            assert!(!marker.exists());
            assert_eq!(std::fs::read(&a).unwrap(), payload_a);
            assert_eq!(std::fs::read(&b).unwrap(), payload_b);
            release_a.send(()).unwrap();
            first.join().unwrap().unwrap();
            assert_eq!(std::fs::read(&marker).unwrap(), payload_a);
            assert_eq!(std::fs::read(&b).unwrap(), payload_b);
            release_b.send(()).unwrap();
            second.join().unwrap().unwrap();
            assert_eq!(std::fs::read(&marker).unwrap(), payload_b);
            assert!(!a.exists() && !b.exists());
        });
        // Exclusive creation must preserve a pre-existing file verbatim.
        std::fs::write(&a, b"owned by someone else").unwrap();
        assert_eq!(
            publish(&marker, &a, b"replacement").unwrap_err().kind(),
            io::ErrorKind::AlreadyExists
        );
        assert_eq!(std::fs::read(&a).unwrap(), b"owned by someone else");
        std::fs::remove_dir_all(dir).unwrap();
    }
}
