"""Bounded generated transitive readers over an existing real C++ Database.

Every launched process is owned and waited by this parent. Database bytes are
retained across restart; subscription registrations are deliberately rebuilt.
No distributed subscription or durable pending-wait claim is made.
"""
import hashlib
import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import tempfile
import time


def main():
    binary = Path(sys.argv[1]).resolve()
    native = Path(os.environ["REBOOT_NATIVE2PC_CXX_DATABASE"]).resolve()
    evidence = Path(os.environ["TRANSITIVE_EVIDENCE"]).resolve()
    evidence.mkdir(parents=True, exist_ok=True)
    result = {"complete": False, "children": [], "binary_sha256": digest(binary),
              "database_sha256": digest(native), "scope": "same-host same-sidecar acyclic transitive readers; reconnect rebuilds watches"}
    owned = []
    work = Path(tempfile.mkdtemp(prefix="transitive-rocks-", dir=evidence))

    def spawn(args, label):
        log = evidence / f"{len(owned):02d}-{label}.log"
        handle = log.open("wb")
        child = subprocess.Popen(list(map(str, args)), stdout=handle, stderr=handle)
        row = {"pid": child.pid, "parent_pid": os.getpid(), "args": list(map(str, args)), "log": str(log)}
        owned.append((child, handle, row))
        return child

    def stop(child, shutdown=None):
        if child.returncode is None:
            if shutdown is not None:
                shutdown.touch()
            else:
                child.kill()  # only a direct child still owned by this parent
        child.wait(timeout=15)

    def run(args, label):
        child = spawn(args, label)
        assert child.wait(timeout=30) == 0, f"{label} failed; see {owned[-1][2]['log']}"

    def listen(child, port):
        until = time.monotonic() + 15
        while time.monotonic() < until:
            assert child.poll() is None, f"child exited: {child.pid}"
            try:
                with socket.create_connection(("127.0.0.1", port), timeout=.1):
                    return
            except OSError:
                time.sleep(.02)
        raise AssertionError("listener startup timeout")

    dbport, appport = port(), port()
    endpoint = f"http://127.0.0.1:{appport}"
    def database():
        child = spawn([native, work / "rocksdb", work / "server-info.pb", dbport], "database")
        listen(child, dbport)
        return child

    def host():
        shutdown = work / f"shutdown-{len(owned)}"
        stats = work / f"stats-{len(owned)}"
        child = spawn([binary, "transitive-serve", f"http://127.0.0.1:{dbport}",
                       f"127.0.0.1:{appport}", shutdown, stats], "host")
        listen(child, appport)
        return child, shutdown, stats

    try:
        run([binary, "info", work / "server-info.pb"], "server-info")
        db = database()
        app, shutdown, stats = host()
        run([binary, "transitive-exercise", endpoint, stats], "exercise")
        stop(app, shutdown)
        assert app.returncode == 0
        stop(db)
        # A fresh C++ process opens the exact retained RocksDB.
        db = database()
        app, shutdown, stats = host()
        run([binary, "transitive-restart", endpoint, stats], "restart")
        stop(app, shutdown)
        assert app.returncode == 0
        stop(db)
        result["complete"] = True
    finally:
        for child, handle, row in reversed(owned):
            if child.returncode is None:
                child.kill()
            row["wait_returncode"] = child.wait(timeout=15)
            row["waited_by_parent"] = True
            handle.close()
            row["log_sha256"] = digest(Path(row["log"]))
        result["children"] = [row for _, _, row in owned]
        result["child_count"] = len(owned)
        result["all_children_joined"] = all(p.returncode is not None for p, _, _ in owned)
        (evidence / "receipt.json").write_text(json.dumps(result, indent=2) + "\n")
    print(json.dumps({k: result[k] for k in ["complete", "child_count", "all_children_joined"]}))


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def port():
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


if __name__ == "__main__":
    main()
