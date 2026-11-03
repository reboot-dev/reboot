"""Linux direct-child custody for the cursor gate; no PID-only signals or kills.

The gate runs this module in the original subreaper process. All reservations,
including failed pidfd acquisitions, remain in children until actual waitpid
receipts discharge them. Timeouts preserve ownership for the public acceptance
retention helper. Popen.poll/wait/communicate are deliberately not used: their
ECHILD handling is not an exact-child receipt.
"""
import os
from pathlib import Path
import signal
import subprocess
import tempfile
import time
from types import SimpleNamespace

CONTRACT = 'cursor-exact-child-v2'
children = []
_owner = SimpleNamespace(failure=None, cancellation=None, direct=[], owned={}, active_gate=False)


def check_cancelled():
    # Signal handlers only latch cancellation: never interrupt Popen/pidfd/wait
    # acquisition or unwind protected retention at an arbitrary instruction.
    if _owner.cancellation is not None:
        raise RuntimeError(_owner.cancellation)


def _fail(child, error):
    child.failure = repr(error)
    _owner.failure = _owner.failure or child.failure
    return error


class Child:
    def __init__(self, argv, **kwargs):
        check_cancelled()
        self.argv = list(map(str, argv))
        self.joined_exact = False
        self.returncode = None
        self.failure = None
        self.fd = None
        self.receipt = None
        self.requested_shutdown = False
        self.timed_out = False
        self.process = None
        self.row = {'argv': self.argv, 'joined': False, 'fd': None}
        children.append(self)
        _owner.direct.append(self.row)  # Reservation precedes launch/acquisition.
        try:
            self.process = subprocess.Popen(self.argv, **kwargs)
            self.row['pid'] = self.process.pid
            # Unreaped direct child cannot have its PID recycled during acquire.
            self.fd = os.pidfd_open(self.process.pid)
            self.row['fd'] = self.fd
            stat = Path(f'/proc/{self.process.pid}/stat').read_text().rsplit(') ', 1)[1].split()
            if int(stat[1]) != os.getpid():
                raise RuntimeError('not the original direct-child parent')
            _owner.owned[str(self.process.pid)] = stat[19]
        except BaseException as error:
            raise _fail(self, error)

    def _ready(self):
        if self.failure or self.fd is None:
            raise RuntimeError('unknown exact-child custody; owner retained')
        try:
            return os.waitid(os.P_PIDFD, self.fd, os.WEXITED | os.WNOHANG | os.WNOWAIT)
        except BaseException as error:
            raise _fail(self, error)

    def require_owned_alive(self):
        check_cancelled()
        if self.joined_exact or self._ready() is not None:
            raise RuntimeError('owned child exited before readiness/shutdown')

    def join(self, timeout):
        if self.joined_exact:
            return self
        if self.process is None or self.fd is None:
            raise RuntimeError('missing direct-child acquisition; owner retained')
        deadline = time.monotonic() + timeout
        while True:
            status = self._ready()
            if status is not None:
                try:
                    pid, raw = os.waitpid(self.process.pid, 0)
                    if pid != self.process.pid or status.si_pid != pid:
                        raise RuntimeError('exact wait identity mismatch')
                    self.returncode = os.waitstatus_to_exitcode(raw)
                    self.process.returncode = self.returncode
                    self.receipt = {'pid': pid, 'wait_status': raw,
                                    'si_code': status.si_code, 'si_status': status.si_status}
                    os.close(self.fd)
                    self.fd = None
                    self.joined_exact = True
                    self.row.update(joined=True, fd=None, receipt=self.receipt,
                                    exit=self.returncode)
                    return self
                except BaseException as error:
                    raise _fail(self, error)
            check_cancelled()
            if time.monotonic() >= deadline:
                self.timed_out = True
                raise TimeoutError('exact child timeout; retained without escalation')
            time.sleep(.01)

    def retire(self, shutdown=None, timeout=15):
        if self.joined_exact:
            return self
        check_cancelled()
        if self._ready() is not None:
            self.join(timeout)  # Keep the exact receipt, but not shutdown credit.
            raise _fail(self, RuntimeError(
                f'owned child exited before requested shutdown: {self.returncode}'))
        if self.timed_out:
            raise RuntimeError('timed-out live owner retained; no shutdown escalation')
        if not self.requested_shutdown:
            shutdown = shutdown or getattr(self, 'shutdown', None)
            if shutdown is not None:
                Path(shutdown).touch(exist_ok=False)
            else:
                if self.fd is None:
                    raise RuntimeError('missing signal authority')
                signal.pidfd_send_signal(self.fd, signal.SIGTERM)
            self.requested_shutdown = True
        return self.join(timeout)

    def join_failure(self, timeout=15):
        self.join(timeout)
        self.natural_exit = not self.requested_shutdown
        if not self.natural_exit or self.returncode == 0:
            raise _fail(self, RuntimeError('expected nonzero natural child failure'))
        return self

    def assert_joined(self):
        if not (self.joined_exact and self.failure is None and self.fd is None
                and self.receipt is not None and self.row.get('joined') is True
                and 'fd' in self.row and self.row['fd'] is None):
            raise RuntimeError('exact join/descriptor obligation retained')


def spawn(argv, **kwargs):
    return Child(argv, **kwargs)


def run(argv, timeout=15):
    # Files avoid pipe deadlock while preserving exact wait authority.
    with tempfile.TemporaryFile() as out, tempfile.TemporaryFile() as err:
        child = spawn(argv, stdout=out, stderr=err)
        child.join(timeout)
        out.seek(0)
        err.seek(0)
        return SimpleNamespace(returncode=child.returncode, joined_exact=child.joined_exact,
                               stdout=out.read().decode(errors='replace'),
                               stderr=err.read().decode(errors='replace'))
