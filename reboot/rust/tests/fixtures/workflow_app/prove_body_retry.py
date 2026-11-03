"""Real generated public scheduling + CXX/RocksDB bounded body resumption.
No state/task seeding, fake Database or retry of mutating client calls.
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
import uuid

BIN = Path(sys.argv[1])
DB = Path(os.environ["REBOOT_NATIVE2PC_CXX_DATABASE"])
processes = []
commands = []
cases = []
used = set()
result: dict = {"complete": False}

def port():
    for n in range(28000, 31000):
        with socket.socket() as s:
            try:
                s.bind(("127.0.0.1", n))
                if n not in used:
                    used.add(n)
                    return n
            except OSError:
                pass
    raise AssertionError("no fixture port")

def run(*args):
    command = [str(BIN), *map(str, args)]
    r = subprocess.run(command, capture_output=True, text=True, timeout=15)
    commands.append({"command": command, "exit": r.returncode, "stdout": r.stdout, "stderr": r.stderr})
    assert r.returncode == 0, commands[-1]
    return r.stdout.strip()

def spawn(command, env=None):
    path = work / f"process-{len(processes)}.log"
    with path.open("wb") as log:
        p = subprocess.Popen(list(map(str, command)), stdout=log, stderr=log, env=env)
    processes.append({"pid": p.pid, "process": p, "log": str(path), "command": list(map(str, command))})
    return p

def wait_port(p, n):
    deadline = time.monotonic() + 10
    while time.monotonic() < deadline:
        assert p.poll() is None, (p.pid, p.returncode)
        try:
            with socket.create_connection(("127.0.0.1", n), timeout=.1):
                return
        except OSError:
            time.sleep(.01)
    raise AssertionError("listener timeout")

def stop(p, shutdown=None):
    if p.poll() is None:
        if shutdown is not None:
            shutdown.touch()
        else:
            p.terminate()
        p.wait(timeout=15)

def events():
    return event_path.read_text().splitlines() if event_path.exists() else []

def wait_event(name):
    deadline = time.monotonic() + 10
    while name not in events():
        assert host.poll() is None
        assert time.monotonic() < deadline, events()
        time.sleep(.01)

with tempfile.TemporaryDirectory(prefix="rust-workflow-loop84-cxx-") as d:
    work = Path(d)
    try:
        for mode in ["once", "always", "transport", "swallowed", "caught-probes", "dropped-step", "broken-pipe", "cancel", "load-failure", "finish-failure", "cancel-backoff", "aba-backoff", "root-backoff"]:
            root = work / mode
            root.mkdir()
            event_path = root / "events"
            db_port, app_port = port(), port()
            database, app = f"http://127.0.0.1:{db_port}", f"http://127.0.0.1:{app_port}"
            run("info", root / "server-info.pb")
            def start_db():
                p = spawn([DB, root / "rocksdb", root / "server-info.pb", db_port])
                wait_port(p, db_port)
                return p
            def start_host(body_mode):
                shutdown = root / f"shutdown-{len(processes)}"
                env = os.environ.copy()
                env.pop("WORKFLOW_FIRST_ACK", None)
                env["WORKFLOW_BODY_EVENTS"] = str(event_path)
                env.pop("REBOOT_TEST_WORKFLOW_RETRY_PAUSE", None)
                if body_mode in ["cancel-backoff", "aba-backoff", "root-backoff"]:
                    env["WORKFLOW_BODY_MODE"] = "once"
                    env["REBOOT_TEST_WORKFLOW_RETRY_PAUSE"] = str(root / "retry-pause")
                elif body_mode:
                    env["WORKFLOW_BODY_MODE"] = body_mode
                else:
                    env.pop("WORKFLOW_BODY_MODE", None)
                p = spawn([BIN, "serve", database, f"127.0.0.1:{app_port}", shutdown], env)
                wait_port(p, app_port)
                # Read-only readiness probe; never retry Create or ScheduleWork.
                deadline = time.monotonic() + 10
                while time.monotonic() < deadline:
                    r = subprocess.run([str(BIN), "read", app], capture_output=True, text=True, timeout=2)
                    if r.returncode == 0 or "state must" in r.stderr or "must be constructed" in r.stderr:
                        return p, shutdown
                    assert p.poll() is None
                    time.sleep(.01)
                raise AssertionError("public readiness timeout")
            db = start_db()
            host, shutdown = start_host(mode)
            run("create", app, uuid.uuid4())
            key = str(uuid.uuid4())
            handle = run("schedule", app, key, 0, 7)
            if mode == "once":
                assert json.loads(run("wait", app, handle)) == {"first": 7, "second": 7}
                assert host.poll() is None
                assert events() == ["body", "first-handler", "body-failure", "body", "second-handler"], events()
                assert json.loads(run("read", app)) == {"first": 7, "second": 7, "schedules": 1}
                assert run("schedule", app, key, 0, 7) == handle
                # Unrelated subsequent generated work and public reads stay ready.
                other = run("schedule", app, uuid.uuid4(), 0, 3)
                assert json.loads(run("wait", app, other)) == {"first": 10, "second": 10}
                assert host.poll() is None
                before = json.loads(run("inspect", database, handle))
                assert before == {"status": 2, "iteration": 0, "step_mutations": 2, "timestamp": 0}
                stop(host, shutdown)
                assert host.returncode == 0
            elif mode in ["cancel-backoff", "aba-backoff", "root-backoff"]:
                deadline = time.monotonic() + 10
                while not (root / "retry-pause").exists():
                    assert host.poll() is None
                    assert time.monotonic() < deadline
                    time.sleep(.005)
                assert events() == ["body", "first-handler", "body-failure"]
                if mode == "cancel-backoff":
                    stop(host, shutdown)
                    assert host.returncode == 0
                else:
                    (root / "retry-pause.release").write_text("aba" if mode == "aba-backoff" else "root-drop")
                    host.wait(timeout=10)
                    assert host.returncode != 0
                    log = Path(next(e["log"] for e in processes if e["pid"] == host.pid)).read_text()
                    if mode == "aba-backoff":
                        assert "owner changed during admission" in log, log
                    else:
                        # Concurrent owner supervision may observe the root's
                        # sticky uncertainty before the parked body's scope check.
                        assert any(message in log for message in (
                            "durable task outcome uncertain",
                            "scheduling root outcome uncertain; restart host through durable recovery",
                        )), log
                assert events().count("body") == 1
                before = json.loads(run("inspect", database, handle))
            elif mode in ["load-failure", "finish-failure"]:
                wait_event("database-pause")
                stop(db)
                Path(str(event_path) + ".release").touch()
                host.wait(timeout=10)
                assert host.returncode != 0
                assert events().count("body") == 1, events()
                db = start_db()
                before = json.loads(run("inspect", database, handle))
            elif mode == "cancel":
                wait_event("parked")
                stop(host, shutdown)
                assert host.returncode == 0
                assert events() == ["body", "first-handler", "parked"]
                before = json.loads(run("inspect", database, handle))
            else:
                host.wait(timeout=10)
                assert host.returncode != 0, "existing supervised failure contract must remain"
                expected = 3 if mode == "always" else 1
                assert events().count("body") == expected, events()
                assert events().count("first-handler") == 1, events()
                assert events().count("second-handler") == 0, events()
                if mode == "caught-probes":
                    log = Path(next(e["log"] for e in processes if e["pid"] == host.pid)).read_text()
                    assert "unclean workflow attempt cannot complete successfully" in log, log
                before = json.loads(run("inspect", database, handle))
            first_events = events()
            if mode != "once":
                assert before == {"status": 1, "iteration": 0, "step_mutations": 2 if mode == "finish-failure" else 1, "timestamp": 0}, before
            # Restart both host and native RocksDB: pending bodies resume through
            # acknowledged named checkpoints; completed workflows do not dispatch.
            stop(db)
            db = start_db()
            host, shutdown = start_host(None)
            expected_value = 10 if mode == "once" else 7
            assert json.loads(run("wait", app, handle)) == {"first": 7, "second": 7}
            assert json.loads(run("read", app)) == {"first": expected_value, "second": expected_value, "schedules": 2 if mode == "once" else 1}
            after = json.loads(run("inspect", database, handle))
            assert after == {"status": 2, "iteration": 0, "step_mutations": 2, "timestamp": 0}
            assert events().count("first-handler") == (2 if mode == "once" else 1), events()
            assert events().count("second-handler") == (2 if mode == "once" else 1), events()
            assert run("schedule", app, key, 0, 7) == handle
            stop(host, shutdown)
            assert host.returncode == 0
            stop(db)
            cases.append({"mode": mode, "before": before, "after": after, "first_events": first_events, "all_events": events()})
        result["complete"] = True
    finally:
        for entry in processes:
            stop(entry["process"])
            entry["exit"] = entry.pop("process").returncode
            entry["log_text"] = Path(entry["log"]).read_text(errors="replace")
        result.update(cases=cases, processes=processes, commands=commands,
                      all_owned_pids_absent=all(not Path(f"/proc/{e['pid']}").exists() for e in processes),
                      binary_sha256=hashlib.sha256(BIN.read_bytes()).hexdigest(),
                      database_sha256=hashlib.sha256(DB.read_bytes()).hexdigest())
        Path(os.environ.get("WORKFLOW_RETRY_EVIDENCE", "/tmp/reboot-rust-workflow-loop84-body-proof.json")).write_text(json.dumps(result, indent=2))
print(json.dumps({"complete": result["complete"], "cases": len(cases), "owned_pids_absent": result["all_owned_pids_absent"]}))
