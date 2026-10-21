"""Linux acceptance ownership: never kill preserved timeout owners."""
import ctypes
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import time


def enable_subreaper():
    """Dedicated runner adopts orphan descendants; sampling is not containment."""
    libc = ctypes.CDLL(None, use_errno=True)
    if libc.prctl(36, 1, 0, 0, 0) != 0:  # PR_SET_CHILD_SUBREAPER
        raise OSError(ctypes.get_errno(), 'cannot enable child subreaper')


def process_info(pid):
    try:
        fields = Path(f'/proc/{pid}/stat').read_text().rsplit(') ', 1)[1].split()
        return fields[19], fields[1], fields[0]
    except (FileNotFoundError, ProcessLookupError):
        return None


def process_start(pid):
    info = process_info(pid)
    return info[0] if info else None


def discover_owned(owned, root_pid=None):
    """Track exact survivors and descendants adopted by the dedicated subreaper."""
    rows = {}
    for entry in Path('/proc').iterdir():
        if entry.name.isdigit():
            info = process_info(entry.name)
            if info:
                rows[entry.name] = info
    live = {str(pid): str(start) for pid, start in owned.items()
            if str(pid) in rows and rows[str(pid)][0] == str(start)}
    parents = set(live)
    if root_pid is not None:
        parents.add(str(root_pid))
    while True:
        additions = {pid: start for pid, (start, parent, _) in rows.items()
                     if parent in parents and pid not in live and pid != str(root_pid)}
        if not additions:
            break
        live.update(additions)
        parents.update(additions)
        owned.update(additions)
    return live


def retain_until_owned_exit(owned, evidence, interval=0.1, root_pid=None):
    """Caller retains flock. Observation/write errors cannot unwind live ownership.

    root_pid must be the dedicated process which enabled subreaper before launch.
    Reap only naturally exited zombies parented by this process, never live owners.
    Persistent observation errors intentionally require operator reconciliation.
    Any retention error remains a failed run even after ownership clears.
    """
    if root_pid != os.getpid():
        raise ValueError('retention requires the dedicated current subreaper PID')
    state = ctypes.c_int()
    libc = ctypes.CDLL(None, use_errno=True)
    if libc.prctl(37, ctypes.byref(state), 0, 0, 0) != 0 or state.value != 1:
        raise RuntimeError('initialize dedicated subreaper before launching subprocesses')
    evidence = Path(evidence)
    failed = False
    while True:
        try:
            live = discover_owned(owned, root_pid)
            if root_pid == os.getpid():
                for pid, start in list(live.items()):
                    info = process_info(pid)
                    if info and info == (start, str(root_pid), 'Z'):
                        try:
                            os.waitpid(int(pid), os.WNOHANG)
                        except ChildProcessError:
                            pass
                live = discover_owned(owned, root_pid)
            if not live:
                # A torn parent-tree snapshot can disconnect a newly adopted
                # orphan. Independently inspect all task child lists before
                # all-clear; no new launches occur during this boundary.
                children = set()
                for task in Path(f'/proc/{root_pid}/task').iterdir():
                    try:
                        children.update((task/'children').read_text().split())
                    except FileNotFoundError:
                        if task.exists():
                            raise
                if not children:
                    break
                for pid in children:
                    info = process_info(pid)
                    if info:
                        owned[pid] = info[0]
                continue
            pending = evidence.with_suffix(evidence.suffix + '.tmp')
            pending.write_text(json.dumps({'publication_blocked': True,
                                          'live_owned_process_starttimes': live}, indent=2))
            pending.replace(evidence)
        except (Exception, KeyboardInterrupt, SystemExit) as error:
            failed = True
            # Do not leak command/environment/token data in recovery diagnostics.
            try:
                print(f'OWNERSHIP_RECONCILIATION_ERROR {type(error).__name__}; '
                      f'lock retained by PID {os.getpid()}', file=sys.stderr, flush=True)
            except (Exception, KeyboardInterrupt, SystemExit):
                pass
        try:
            time.sleep(interval)
        except (KeyboardInterrupt, SystemExit):
            failed = True
    if failed:
        raise RuntimeError('retention failed; tracked/adopted owners subsequently reconciled')


def protected_owned_exit(owned, evidence, observe, root_pid=None):
    """Even preliminary receipt/discovery failure must enter retaining ownership.

    The observer may fail, but retention always runs before that failure escapes.
    Call only from the dedicated subreaper after the final subprocess launch.
    """
    try:
        observe()
    finally:
        retain_until_owned_exit(owned, evidence, root_pid=root_pid)


class RequestedShutdown:
    """A repeated intentional close is safe; a preexisting exit is not shutdown proof."""
    def __init__(self, process, log, record, expected_exits=(0,)):
        self.process = process
        self.expected_exits = expected_exits
        self.log = log
        self.record = record
        self.closed = False
        self.timed_out = False

    def close(self, timeout=15):
        if self.closed:
            return
        if self.timed_out:
            raise RuntimeError('timed-out owner preserved; reconcile before retry')
        status = self.process.poll()
        if status is not None:
            self.record.update(exit=status, unexpected_exit=True)
            self.log.close()
            self.closed = True
            raise RuntimeError(f'HTTP host exited before requested shutdown: {status}')
        self.process.send_signal(signal.SIGTERM)
        try:
            status = self.process.wait(timeout=timeout)
        except subprocess.TimeoutExpired:
            self.timed_out = True
            self.record.update(timeout=True, pid=self.process.pid)
            raise
        self.log.close()
        self.closed = True
        self.record.update(exit=status, requested_shutdown=True)
        if status not in self.expected_exits:
            raise RuntimeError(f'HTTP requested shutdown returned {status}')
