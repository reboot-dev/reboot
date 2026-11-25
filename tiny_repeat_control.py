"""Bounded single-owner process custody and atomic evidence (stdlib only)."""
import hashlib
import json
import os
from pathlib import Path
import signal
import subprocess as sp
import threading
import time
import traceback
from typing import Any


def atomic(path, value):
    path = Path(path)
    temporary = path.with_name(path.name + '.new')
    with temporary.open('w') as f:
        json.dump(value, f, indent=2)
        f.flush()
        os.fsync(f.fileno())
    os.replace(temporary, path)
    fd = os.open(path.parent, os.O_DIRECTORY)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


class Owner:
    def __init__(self, directory, seconds, cleanup_seconds=240, outer_deadline_epoch=None):
        self.directory = Path(directory)
        self.directory.mkdir(parents=True, exist_ok=False)
        now = time.time()
        # Reserve cleanup inside the existing outer bound, not after it.
        outer = outer_deadline_epoch if outer_deadline_epoch is not None else now + seconds
        seconds = min(seconds, outer-now)
        reserve = min(cleanup_seconds, seconds/2)
        self.outer_deadline = time.monotonic() + seconds
        self.deadline = self.outer_deadline - reserve
        self.cleaning = False
        self.lock = threading.RLock()
        self.children = []
        self.ledger: dict[str, Any] = dict(owner_pid=os.getpid(), owner_ppid=os.getppid(),
                           start=now, deadline_epoch=now+seconds-reserve,
                           outer_deadline_epoch=now+seconds, cleanup_reserved_seconds=reserve,
                           complete=False, commands=[], children=[], failures=[], stacks=[])
        self.save()
        self.timer = threading.Timer(seconds-reserve, self.expire)
        self.timer.daemon = True
        self.timer.start()
        signal.signal(signal.SIGTERM, self.interrupted)
        signal.signal(signal.SIGINT, self.interrupted)

    def interrupted(self, number, frame):
        self.begin_cleanup()
        raise TimeoutError('owner interrupted: signal '+str(number))

    def expire(self):
        os.kill(os.getpid(), signal.SIGTERM)

    def begin_cleanup(self):
        self.cleaning = True
        self.timer.cancel()
        self.ledger['cleanup_started'] = time.time()
        self.save()

    def allowance(self, requested):
        bound = self.outer_deadline if self.cleaning else self.deadline
        remaining = bound-time.monotonic()
        if remaining <= 0:
            raise TimeoutError('cleanup deadline' if self.cleaning else 'workload deadline')
        return min(requested, remaining)

    def save(self):
        with self.lock:
            atomic(self.directory/'owner.json', self.ledger)

    def event(self, kind, **values):
        with self.lock:
            row = dict(kind=kind, time=time.time(), monotonic_ns=time.monotonic_ns(), **values)
            with (self.directory/'events.jsonl').open('a') as f:
                f.write(json.dumps(row)+'\n')
                f.flush()
                os.fsync(f.fileno())
        return row

    def spawn(self, argv, name, input_pipe=False):
        self.allowance(1)
        # Retain output immediately: even timeout/failure has an exact log.
        path = self.directory/(name+'.log')
        f = path.open('wb')
        row: dict[str, Any] = dict(name=name, argv=argv, started=time.time(), log=path.name, joined=False)
        self.ledger['children'].append(row)
        self.save()
        try:
            p = sp.Popen(argv, stdin=sp.PIPE if input_pipe else sp.DEVNULL,
                         stdout=f, stderr=sp.STDOUT, start_new_session=True)
        except BaseException:
            row['spawn_failure'] = traceback.format_exc()
            f.close()
            self.save()
            raise
        row['pid'] = p.pid
        self.children.append((row, p, f))
        self.event('spawn', name=name, pid=p.pid, argv=argv)
        self.save()
        return row, p, f

    def join(self, child, timeout: float=60, stop=False, input_bytes=None):
        row, p, f = child
        if row['joined']:
            return row
        if input_bytes is not None and p.poll() is None:
            p.stdin.write(input_bytes)
            p.stdin.flush()
            p.stdin.close()
        if stop and p.poll() is None:
            os.killpg(p.pid, signal.SIGTERM)
        try:
            code = p.wait(timeout=0 if p.poll() is not None else self.allowance(timeout))
        except sp.TimeoutExpired:
            row['join_timeout'] = True
            os.killpg(p.pid, signal.SIGKILL)
            code = p.wait(timeout=max(.01,min(5,self.outer_deadline-time.monotonic())))
        f.close()
        row.update(joined=True, exit=code, ended=time.time())
        self.event('join', name=row['name'], pid=p.pid, exit=code)
        self.save()
        return row

    def run(self, argv, name=None, timeout: float=300, check=True):
        allowance = self.allowance(timeout)
        if name is None:
            name = 'command-'+str(len(self.ledger['commands']))
        row = dict(name=name, argv=argv, started=time.time())
        self.ledger['commands'].append(row)
        self.save()
        child = self.spawn(argv, name)
        result = self.join(child, timeout=allowance)
        output = (self.directory/result['log']).read_text(errors='replace')
        row.update(ended=time.time(), exit=result['exit'], log=result['log'])
        self.save()
        if result.get('join_timeout'):
            raise TimeoutError((name, argv, timeout, output[-2000:]))
        if check and result['exit']:
            raise RuntimeError((name, argv, result['exit'], output[-4000:]))
        return output

    def finish(self):
        # Call after app-before-engine cleanup; this is an emergency final join,
        # not a substitute for exact Docker terminal-state verification.
        if not self.cleaning:
            self.begin_cleanup()
        self.timer.cancel()
        failures = []
        for child in reversed(self.children):
            if not child[0]['joined']:
                try:
                    self.join(child, stop=True)
                except BaseException:
                    failures.append(traceback.format_exc())
        self.ledger['failures'].extend(failures)
        self.ledger['all_original_unix_children_joined'] = all(c[0]['joined'] for c in self.children)
        self.ledger['end'] = time.time()
        self.save()


def self_test(directory):
    o = Owner(directory, 20)
    try:
        c = o.spawn(['python3', '-c', 'import time; print("alive",flush=True); time.sleep(60)'], 'child')
        o.run(['python3', '-c', 'print("command")'])
        try:
            o.run(['python3', '-c', 'import time;time.sleep(60)'], 'timeout', timeout=.1)
        except TimeoutError:
            o.event('expected_timeout')
        else:
            raise AssertionError('timeout accepted')
        # Concurrent reads of every incremental atomic ledger must be valid.
        failures = []
        def read_loop():
            for _ in range(300):
                try:
                    d = json.loads((o.directory/'owner.json').read_text())
                    assert d['owner_pid'] == os.getpid()
                except BaseException as error:
                    failures.append(repr(error))
        t = threading.Thread(target=read_loop)
        t.start()
        for i in range(30):
            o.ledger['step'] = i
            o.save()
        t.join()
        assert not failures, failures
        raise RuntimeError('injected workload failure')
    except RuntimeError as error:
        assert str(error) == 'injected workload failure'
        o.ledger['expected_failure_finally'] = True
    finally:
        o.finish()
    assert o.ledger['all_original_unix_children_joined']
    assert all(c['joined'] for c in o.ledger['children'])
    print(json.dumps(dict(self_test=True, owner_pid=os.getpid(), original_children=len(o.children),
                         all_joined=True, atomic_reads=300, timeout_rejected=True,
                         injected_failure_finally=True)), flush=True)


if __name__ == '__main__':
    import sys
    self_test(sys.argv[1])
