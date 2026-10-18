"""Public `rbt dev run` lifecycle for the generated cursor/results fixture.

This is an initial parent-owned acceptance harness.  It deliberately records a
bounded public-CLI result only; it does not claim full native/public
qualification merely because this script exits successfully.
"""
import hashlib
import json
import os
from pathlib import Path
import re
import signal
import socket
import subprocess
import sys
import tempfile
import time

from rust_examples_runtime import record_runtime_launch, select_runtime
from rust_process_ownership import (
    RequestedShutdown,
    discover_owned,
    enable_subreaper,
    process_start,
    protected_owned_exit,
)

if not __debug__:
    raise RuntimeError("public cursor proof requires Python assertions enabled")

enable_subreaper()
ROOT = Path(__file__).resolve().parents[3]
FIXTURE = ROOT / "reboot/rust/tests/fixtures/workflow_cursor_results_app"
PROBE = FIXTURE / "public_probe.py"
RBT, ENV, runtime = select_runtime(os.environ)
TARGET = Path(os.environ["CARGO_TARGET_DIR"])
STAGE = Path(tempfile.mkdtemp(prefix="reboot-rust-cursor-public-"))
STATE_DIRECTORY = STAGE / "rbt-state"
RESULT = STAGE / "result.json"
owned = {}
durable_state_identity = None
evidence = {
    "passed": False,
    "qualification": "not claimed; initial public lifecycle draft",
    "state_directory": str(STATE_DIRECTORY),
    "runtime": runtime,
    "sessions": [],
    "commands": [],
}
RESULT.write_text(json.dumps(evidence, indent=2))


def freeze_sources():
    """Freeze the actual public CLI, SDK, fixture, and parent harness bytes."""
    roots = (ROOT / "reboot/cli", ROOT / "reboot/rust", FIXTURE, Path(__file__))
    files = []
    for root in roots:
        if root.is_file():
            files.append(root)
        else:
            files.extend(path for path in root.rglob("*") if path.is_file())
    excluded = {"target", ".rbt", "__pycache__"}
    return {
        str(path): hashlib.sha256(path.read_bytes()).hexdigest()
        for path in sorted(set(files))
        if not excluded.intersection(path.parts)
    }


def write_evidence():
    RESULT.write_text(json.dumps(evidence, indent=2, sort_keys=True))


def fresh_port():
    with socket.socket() as listener:
        listener.bind(("127.0.0.1", 0))
        return listener.getsockname()[1]


def command(*args, timeout=240):
    """Run an owned short-lived public client command and retain its identity."""
    process = subprocess.Popen(
        [str(value) for value in args], cwd=FIXTURE, env=ENV,
        stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
    )
    starttime = process_start(process.pid)
    assert starttime, ("client start identity unavailable", process.pid)
    owned[str(process.pid)] = starttime
    row = {"argv": [str(value) for value in args], "pid": process.pid,
           "process_starttime": starttime}
    evidence["commands"].append(row)
    try:
        stdout, stderr = process.communicate(timeout=timeout)
    except subprocess.TimeoutExpired:
        row.update(timeout=True, live=True)
        write_evidence()
        raise
    row.update(exit=process.returncode, stdout=stdout, stderr=stderr)
    write_evidence()
    assert process.returncode == 0, row
    return stdout.strip()


def database_endpoint(database_pid):
    args = Path(f"/proc/{database_pid}/cmdline").read_bytes().split(b"\0")
    # The Rust Database public executable is DB ROCKSDB SERVER_INFO PORT.
    assert len(args) >= 4 and args[3].isdigit(), args
    return "http://127.0.0.1:" + args[3].decode()


def start(name, *, pause="", iteration=0):
    """Start exactly one real public CLI supervisor and identify both children."""
    port = fresh_port()
    launch_env = ENV.copy()
    event_path = STAGE / f"{name}.events"
    launch_env.update(
        CURSOR_PAUSE=pause,
        CURSOR_PAUSE_ITERATION=str(iteration),
        CURSOR_EVENTS=str(event_path),
        CURSOR_FAIL_AFTER_B="0",
    )
    record_runtime_launch(RESULT, evidence, launch_env, RBT, name)
    log_path = STAGE / f"{name}.log"
    log = log_path.open("w")
    process = subprocess.Popen(
        [str(RBT), f"--state-directory={STATE_DIRECTORY}", "dev", "run",
         "--rust-allow-insecure-database", f"--port={port}"],
        cwd=FIXTURE, env=launch_env, stdout=log, stderr=subprocess.STDOUT,
    )
    starttime = process_start(process.pid)
    assert starttime, ("rbt start identity unavailable", process.pid)
    owned[str(process.pid)] = starttime
    record = {"name": name, "pid": process.pid, "process_starttime": starttime,
              "port": port, "log": str(log_path), "events": str(event_path)}
    evidence["sessions"].append(record)
    owner = RequestedShutdown(
        process, log, record,
        expected_exits=(0, 128 + signal.SIGTERM, -signal.SIGTERM),
    )
    deadline = time.monotonic() + 240
    while time.monotonic() < deadline:
        text = log_path.read_text(errors="replace")
        assert process.poll() is None, text
        if "SERVING (canonical gRPC health check)" in text:
            children = [int(value) for value in re.findall(
                r"Rust (?:Database|app) PID=(\d+)", text)]
            assert len(children) == 2 and len(set(children)) == 2, text
            starts = {str(pid): process_start(pid) for pid in children}
            assert all(starts.values()), (children, starts, text)
            record["children"] = children
            record["child_starttimes"] = starts
            owned.update(starts)
            database = re.search(r"Rust Database PID=(\d+)", text)
            assert database is not None, text
            record["database_url"] = database_endpoint(int(database.group(1)))
            database_args = Path(f"/proc/{database.group(1)}/cmdline").read_bytes().split(b"\0")
            record["rocksdb"] = database_args[1].decode()
            record["server_info"] = database_args[2].decode()
            global durable_state_identity
            identity = (record["rocksdb"], record["server_info"])
            if durable_state_identity is None:
                durable_state_identity = identity
            else:
                assert durable_state_identity == identity, (
                    "restart changed durable Database identity",
                    durable_state_identity,
                    identity,
                )
            record["app_url"] = f"http://127.0.0.1:{port}"
            write_evidence()
            return owner, record
        time.sleep(0.1)
    record["timeout"] = True
    write_evidence()
    raise TimeoutError(f"{name} readiness timed out; exact owners retained")


def wait_for_park(record, name, iteration):
    """Require the app to reach the exact durable pause before inspecting it."""
    marker = f"park:{name}:{iteration}"
    events = Path(record["events"])
    deadline = time.monotonic() + 240
    while time.monotonic() < deadline:
        text = events.read_text(errors="replace") if events.exists() else ""
        if marker in text.splitlines():
            record["park"] = marker
            record["event_log"] = text
            write_evidence()
            return
        time.sleep(0.1)
    record["park_timeout"] = marker
    write_evidence()
    raise TimeoutError(f"fixture did not reach {marker}")


def stop(owner, record):
    """Only intentional supervisor retirement uses RequestedShutdown."""
    owner.close()
    record["children_absent"] = all(
        process_start(pid) != starttime
        for pid, starttime in record["child_starttimes"].items()
    )
    assert record["children_absent"], record
    write_evidence()


def probe(phase, record, handle=None):
    args = [sys.executable, "-E", str(PROBE), str(CLIENT), record["app_url"],
            record["database_url"], phase]
    if handle is not None:
        args.append(handle)
    return command(*args, timeout=240)


def expect_started_failure():
    """The final recovery must be an exact app-child natural failure, not a kill."""
    port = fresh_port()
    name = "started-recovery-failure"
    launch_env = ENV.copy()
    launch_env.update(CURSOR_PAUSE="", CURSOR_PAUSE_ITERATION="0", CURSOR_FAIL_AFTER_B="0")
    record_runtime_launch(RESULT, evidence, launch_env, RBT, name)
    log_path = STAGE / f"{name}.log"
    log = log_path.open("w")
    process = subprocess.Popen(
        [str(RBT), f"--state-directory={STATE_DIRECTORY}", "dev", "run",
         "--rust-allow-insecure-database", f"--port={port}"],
        cwd=FIXTURE, env=launch_env, stdout=log, stderr=subprocess.STDOUT,
    )
    starttime = process_start(process.pid)
    assert starttime
    owned[str(process.pid)] = starttime
    record = {"name": name, "pid": process.pid, "process_starttime": starttime,
              "port": port, "log": str(log_path), "app_url": f"http://127.0.0.1:{port}",
              "expected_natural_failure": True}
    evidence["sessions"].append(record)
    deadline = time.monotonic() + 60
    app_pid = database_pid = None
    while time.monotonic() < deadline:
        text = log_path.read_text(errors="replace")
        children = [int(value) for value in re.findall(
            r"Rust (?:Database|app) PID=(\d+)", text)]
        app_match = re.search(r"Rust app PID=(\d+)", text)
        database_match = re.search(r"Rust Database PID=(\d+)", text)
        if app_match and database_match and len(children) == 2 and len(set(children)) == 2:
            starts = {str(pid): process_start(pid) for pid in children}
            assert all(starts.values()), (children, starts, text)
            record["children"] = children
            record["child_starttimes"] = starts
            owned.update(starts)
            app_pid = int(app_match.group(1))
            database_pid = int(database_match.group(1))
            record["app_child"] = app_pid
            record["app_child_starttime"] = starts[str(app_pid)]
            record["database_child"] = database_pid
            record["database_child_starttime"] = starts[str(database_pid)]
            database_args = Path(f"/proc/{database_pid}/cmdline").read_bytes().split(b"\0")
            record["rocksdb"] = database_args[1].decode()
            record["server_info"] = database_args[2].decode()
            assert (record["rocksdb"], record["server_info"]) == durable_state_identity
            break
        assert process.poll() is None, text
        time.sleep(0.1)
    assert app_pid is not None and database_pid is not None, log_path.read_text(errors="replace")
    status = process.wait(timeout=max(1, deadline - time.monotonic()))
    log.close()
    text = log_path.read_text(errors="replace")
    record.update(
        exit=status,
        children_absent=all(process_start(pid) != starttime for pid, starttime in record["child_starttimes"].items()),
    )
    # This is the fixture's deliberate at-most-once recovery diagnostic.
    assert status != 0 and record["children_absent"], record
    assert "FailedPrecondition" in text, text
    assert "at-most-once block Started without Stored; callback will not run again" in text, text
    write_evidence()
    return record


def inspect_unresolved_after_cli_exit(record, handle):
    """Inspect the exact retired CLI state without starting a replacement app."""
    assert record["children_absent"], record
    port = fresh_port()
    argv = [ENV["RBT_RUST_DATABASE_BINARY"], record["rocksdb"], record["server_info"], str(port)]
    log_path = STAGE / "unresolved-database-only.log"
    log = log_path.open("w")
    database = subprocess.Popen(argv, cwd=FIXTURE, env=ENV, stdout=log, stderr=subprocess.STDOUT)
    starttime = process_start(database.pid)
    assert starttime, ("database-only start identity unavailable", database.pid)
    owned[str(database.pid)] = starttime
    inspection = {"name": "unresolved-database-only", "pid": database.pid,
                  "process_starttime": starttime, "argv": argv, "log": str(log_path),
                  "database_url": f"http://127.0.0.1:{port}"}
    evidence.setdefault("database_only_inspections", []).append(inspection)
    owner = RequestedShutdown(database, log, inspection, expected_exits=(0, -signal.SIGTERM))
    try:
        deadline = time.monotonic() + 10
        while True:
            assert database.poll() is None, log_path.read_text(errors="replace")
            try:
                with socket.create_connection(("127.0.0.1", port), timeout=.2):
                    break
            except OSError:
                assert time.monotonic() < deadline, "database-only inspector startup timeout"
                time.sleep(.05)
        observed = Path(f"/proc/{database.pid}/cmdline").read_bytes().split(b"\0")[:-1]
        assert observed == [os.fsencode(arg) for arg in argv], observed
        probe_args = [sys.executable, "-E", str(PROBE), str(CLIENT), record["app_url"],
                      inspection["database_url"], "unresolved", handle]
        command(*probe_args, timeout=240)
        inspection["probe_phase"] = "unresolved"
    finally:
        owner.close()
        inspection["process_absent"] = process_start(database.pid) != starttime
        assert inspection["process_absent"], inspection
        write_evidence()


CLIENT = TARGET / "debug/client"
try:
    assert FIXTURE.is_dir() and PROBE.is_file(), FIXTURE
    evidence["source_hashes"] = freeze_sources()
    write_evidence()
    # Build both explicitly declared fixture bins before public rbt owns app launch.
    command("cargo", "build", "--manifest-path", FIXTURE / "Cargo.toml", "--locked", "--bins")
    assert CLIENT.is_file() and os.access(CLIENT, os.X_OK), CLIENT

    owner, record = start("stored", pause="stored", iteration=0)
    try:
        handle = probe("initialize", record)
        assert handle, "start-run did not return a workflow handle"
        wait_for_park(record, "stored", 0)
        probe("stored", record, handle)
    finally:
        stop(owner, record)

    owner, record = start("cursor", pause="entry", iteration=1025)
    try:
        wait_for_park(record, "entry", 1025)
        probe("cursor", record, handle)
    finally:
        stop(owner, record)

    owner, record = start("break", pause="break", iteration=1029)
    try:
        wait_for_park(record, "break", 1029)
        probe("break", record, handle)
    finally:
        stop(owner, record)

    owner, record = start("complete")
    try:
        probe("complete", record, handle)
    finally:
        stop(owner, record)

    owner, record = start("started", pause="b-committed", iteration=0)
    try:
        uncertain_handle = probe("uncertain-schedule", record)
        assert uncertain_handle, "uncertain schedule did not return a workflow handle"
        wait_for_park(record, "b-committed", 0)
        probe("started", record, uncertain_handle)
    finally:
        stop(owner, record)
    recovery = expect_started_failure()
    inspect_unresolved_after_cli_exit(recovery, uncertain_handle)

    evidence["source_unchanged"] = freeze_sources() == evidence["source_hashes"]
    assert evidence["source_unchanged"]
    evidence["checks_passed"] = True
except BaseException as error:
    evidence["failure"] = repr(error)
    write_evidence()
    raise
finally:
    def observe_final():
        evidence["owned_before_retention"] = dict(discover_owned(owned, os.getpid()))
        write_evidence()

    protected_owned_exit(owned, STAGE / "retained-owners.json", observe_final, root_pid=os.getpid())
    evidence["live_owned_processes"] = dict(discover_owned(owned, os.getpid()))
    evidence["owned_process_starttimes"] = dict(owned)
    evidence["passed"] = bool(evidence.get("checks_passed")) and not evidence["live_owned_processes"]
    write_evidence()

assert evidence["passed"]
print("CURSOR_RESULTS_PUBLIC_LIFECYCLE_RECORDED", RESULT, flush=True)
