"""Owned two-actor generated WorkflowWriterRef/C++ RocksDB proof.
Never retries a mutating ingress RPC, never seeds task/state/receipts.
All children are original subprocess children, waited by this exact parent.
"""
import hashlib
import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import time
import uuid

BIN = Path(sys.argv[1]).resolve()
DB = Path(os.environ['REBOOT_NATIVE2PC_CXX_DATABASE']).resolve()
ROOT = Path(sys.argv[2]).resolve()
ROOT.mkdir(parents=True, exist_ok=False)
children, commands, cases = [], [], []
receipt = {'complete': False, 'parent_pid': os.getpid(), 'binary': str(BIN), 'database': str(DB)}

def port():
    with socket.socket() as s:
        s.bind(('127.0.0.1', 0))
        return s.getsockname()[1]

def spawn(args, env=None):
    log = ROOT / f'{len(children):02d}.log'
    with log.open('wb') as out:
        p = subprocess.Popen(list(map(str, args)), stdout=out, stderr=out, env=env)
    children.append({'process': p, 'pid': p.pid, 'parent_pid': os.getpid(), 'command': list(map(str, args)), 'log': str(log)})
    return p

def stop(p, crash=False, shutdown=None):
    if p.poll() is None:
        if crash:
            p.kill()  # exact child created above, never a PID lookup
        elif shutdown:
            shutdown.touch()
        else:
            p.terminate()
    p.wait(timeout=15)
    entry = next(c for c in children if c['process'] is p)
    entry.update(wait_returncode=p.returncode, waited_by_parent=True)

def run(*args, good=True):
    p = spawn([BIN, *args])
    stop_wait(p)
    entry = next(c for c in children if c['process'] is p)
    text = Path(entry['log']).read_text()
    commands.append({'args': list(map(str, args)), 'exit': p.returncode, 'output': text})
    if good:
        assert p.returncode == 0, commands[-1]
    return text.strip()

def stop_wait(p):
    p.wait(timeout=15)
    next(c for c in children if c['process'] is p).update(wait_returncode=p.returncode, waited_by_parent=True)

def wait_until(predicate, owner=None):
    end = time.monotonic() + 15
    while time.monotonic() < end:
        if predicate():
            return
        if owner and owner.poll() is not None:
            raise AssertionError(('owner exited', owner.returncode, Path(next(c['log'] for c in children if c['process'] is owner)).read_text()))
        time.sleep(.02)
    raise AssertionError('bounded observation timeout')

def listening(p, n):
    def probe():
        try:
            with socket.create_connection(('127.0.0.1', n), timeout=.1):
                return True
        except OSError:
            return False
    wait_until(probe, p)

try:
    for case in ['ack-crash', 'payload-reject', 'destination-reject', 'authorization-reject', 'local-retry', 'handler-error', 'cancel']:
        work = ROOT / case
        work.mkdir()
        events = work / 'events'
        dbport, appport = port(), port()
        dburl, appurl = f'http://127.0.0.1:{dbport}', f'http://127.0.0.1:{appport}'
        run('info', work / 'info.pb')
        def database():
            p = spawn([DB, work / 'rocksdb', work / 'info.pb', str(dbport)])
            listening(p, dbport)
            return p
        def host(extra=None, expect_failure=False):
            env = os.environ.copy()
            env.update(WORKFLOW_BODY_MODE='outbound', WORKFLOW_BODY_EVENTS=str(events), OUTBOUND_ENDPOINT=appurl)
            env.update(extra or {})
            shutdown = work / f'shutdown-{len(children)}'
            p = spawn([BIN, 'serve', dburl, f'127.0.0.1:{appport}', shutdown], env)
            if not expect_failure:
                listening(p, appport)
            return p, shutdown
        def lines():
            return events.read_text().splitlines() if events.exists() else []
        def ready():
            # Only READ-ONLY probes are retried during host admission/recovery.
            out = run('read', appurl, good=False)
            return '"schedules"' in out or 'StateNotConstructed' in out or 'must be constructed' in out or 'state must' in out
        database_process = database()
        barrier = work / 'target-ack'
        extra = {'REBOOT_TEST_OUTBOUND_WRITER_AFTER_TARGET_ACK': str(barrier)} if case.endswith('reject') or case == 'ack-crash' else {}
        if case == 'local-retry':
            extra['OUTBOUND_RETRY_LOCAL'] = '1'
        p, shutdown = host(extra)
        wait_until(ready, p)
        run('create', appurl, str(uuid.uuid4()))
        run('remote-create', appurl, str(uuid.uuid4()))
        key = str(uuid.uuid4())
        amount = -1 if case == 'handler-error' else 999 if case == 'cancel' else 7
        acknowledged_target = None
        task = run('schedule', appurl, key, '0', str(amount))
        if case == 'local-retry':
            assert json.loads(run('wait', appurl, task)) == {'first': 7, 'second': 0}
            assert lines().count('remote-handler') == 1
            assert lines().count('remote-authorize') == 2
            assert lines().count('outbound-returned') == 2
        elif case == 'handler-error':
            stop_wait(p)
            assert p.returncode != 0
            assert lines().count('remote-handler') == 1 and 'outbound-returned' not in lines()
        elif case == 'cancel':
            wait_until(lambda: 'remote-parked' in lines(), p)
            stop(p, shutdown=shutdown)
            assert p.returncode == 0
            assert 'outbound-returned' not in lines()
        else:
            wait_until(barrier.exists, p)
            assert lines().count('remote-handler') == 1 and 'outbound-returned' not in lines()
            assert run('remote-query', appurl) == '7', 'target ACK must be observable before caller success'
            acknowledged_target = json.loads(run('remote-inspect', dburl))
            assert acknowledged_target['value'] == 7 and len(acknowledged_target['records']) == 2
            # Crash both exact children; retain the same RocksDB directory.
            stop(p, crash=True)
            stop(database_process, crash=True)
            database_process = database()
            pending = json.loads(run('inspect-reader-outcome', dburl, task))
            assert pending['status'] == 1 and not pending['has_terminal'] and len(pending['checkpoints']) == 1
            if case.endswith('reject'):
                changed = {'OUTBOUND_AMOUNT': '8'} if case == 'payload-reject' else {'OUTBOUND_TARGET_ID': 'other'} if case == 'destination-reject' else {'OUTBOUND_BEARER': 'denied'}
                p, shutdown = host(changed, expect_failure=True)
                stop_wait(p)
                assert p.returncode != 0
                log = Path(next(c['log'] for c in children if c['process'] is p)).read_text()
                assert ('fingerprint' in log.lower() or 'contract' in log.lower() or 'provenance collision' in log.lower()) if case != 'authorization-reject' else 'outbound metadata denied' in log
                assert lines().count('remote-handler') == 1
                # Durable intent and task remain unchanged after failed retry.
                assert json.loads(run('inspect-reader-outcome', dburl, task)) == pending
            p, shutdown = host()
            wait_until(lambda: 'outbound-returned' in lines(), p)
            assert json.loads(run('wait', appurl, task)) == {'first': 7, 'second': 0}
            assert run('remote-query', appurl) == '7'
            assert lines().count('remote-handler') == 1
            wires = [s for s in lines() if s.startswith('remote-wire:')]
            assert len(wires) >= 2 and len(set(wires)) == 1, wires
            assert wires[0].split(':')[1] == task
        if p.poll() is None:
            stop(p, shutdown=shutdown)
            assert p.returncode == 0
        stop(database_process, crash=True)
        database_process = database()
        # A fresh serving host is unnecessary for durable readback after failure;
        # canonical source task/journal is read from the restarted native service.
        final = json.loads(run('inspect-reader-outcome', dburl, task))
        assert final['status'] == (1 if case in ['handler-error', 'cancel'] else 2), final
        target_final = json.loads(run('remote-inspect', dburl))
        assert target_final['value'] == (0 if case in ['handler-error', 'cancel'] else 7)
        assert len(target_final['records']) == (1 if case in ['handler-error', 'cancel'] else 2)
        if acknowledged_target is not None:
            assert target_final == acknowledged_target, 'target state/full receipt bytes changed on replay'
        stop(database_process, crash=True)
        cases.append({'case': case, 'task': task, 'events': lines(), 'durable_after_restart': final, 'target_after_restart': target_final})
    receipt['complete'] = True
finally:
    for child in children:
        p = child['process']
        if 'waited_by_parent' not in child:
            stop(p, crash=True)
    for child in children:
        child.pop('process')
        child['log_sha256'] = hashlib.sha256(Path(child['log']).read_bytes()).hexdigest()
    receipt.update(children=children, commands=commands, cases=cases,
                   binary_sha256=hashlib.sha256(BIN.read_bytes()).hexdigest(),
                   database_sha256=hashlib.sha256(DB.read_bytes()).hexdigest())
    (ROOT / 'receipt.json').write_text(json.dumps(receipt, indent=2))
print(json.dumps({'complete': receipt['complete'], 'cases': len(cases), 'children': len(children)}))
