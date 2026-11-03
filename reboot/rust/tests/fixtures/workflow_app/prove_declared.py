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

def wire(data):
    def varint(pos):
        n = 0
        for shift in range(0, 70, 7):
            b = data[pos]; pos += 1; n |= (b & 127) << shift
            if b < 128:
                return n, pos
        raise AssertionError('bad varint')
    pos, fields = 0, {}
    while pos < len(data):
        key, pos = varint(pos)
        if key & 7 == 0:
            value, pos = varint(pos)
        else:
            assert key & 7 == 2
            size, pos = varint(pos); value = data[pos:pos+size]; pos += size
        fields.setdefault(key >> 3, []).append(value)
    return fields

def source_error(snapshot):
    matches = []
    for row in snapshot['checkpoints']:
        checkpoint = wire(wire(wire(bytes.fromhex(row['record']))[2][0])[2][0])
        if checkpoint.get(4) == [1]:
            assert checkpoint[1] == [1] and checkpoint[2] == [2]
            assert wire(checkpoint[3][0])[2] == [expected]
            matches.append(row)
    assert len(matches) == 1
    return matches[0]

def field(number, value):
    def varint(n):
        out = bytearray()
        while n > 127:
            out.append((n & 127) | 128); n >>= 7
        out.append(n)
        return bytes(out)
    return varint(number << 3 | (2 if isinstance(value, bytes) else 0)) + (varint(len(value)) + value if isinstance(value, bytes) else varint(value))

# Independently encoded expected google.rpc.Status, including an unknown field.
expected = (field(1, 9) + field(2, b'rich declared refusal') + field(3,
    field(1, b'type.googleapis.com/workflow.v1.BelowThreshold') + field(2, field(1, 7))) + field(3,
    field(1, b'type.googleapis.com/workflow.v1.Value') + field(2, field(1, 99))) + field(100, 7))
try:
    for case in ['target-ack-crash', 'source-stored-crash', 'payload-reject', 'authorization-reject', 'local-retry', 'same-attempt', 'framework-not-declared']:
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
            env.update(WORKFLOW_BODY_MODE='outbound', WORKFLOW_BODY_EVENTS=str(events), OUTBOUND_ENDPOINT=appurl, OUTBOUND_DECLARED='1')
            env.update(extra or {})
            shutdown = work / f'shutdown-{len(children)}'
            p = spawn([BIN, 'serve', dburl, f'127.0.0.1:{appport}', shutdown], env)
            if not expect_failure:
                listening(p, appport)
            return p, shutdown
        def lines():
            return events.read_text().splitlines() if events.exists() else []
        def ready():
            out = run('read', appurl, good=False)
            return any(s in out for s in ['"schedules"', 'StateNotConstructed', 'must be constructed', 'state must'])
        database_process = database()
        barrier = work / 'ack-barrier'
        extra = {}
        target = None
        final_target = None
        before = None
        if case == 'source-stored-crash':
            extra['OUTBOUND_CAUGHT_BARRIER'] = str(barrier)
        elif case in ['target-ack-crash', 'payload-reject', 'authorization-reject']:
            extra['REBOOT_TEST_OUTBOUND_WRITER_AFTER_TARGET_ACK'] = str(barrier)
        elif case == 'local-retry':
            extra['OUTBOUND_RETRY_LOCAL'] = '1'
        elif case == 'same-attempt':
            extra['OUTBOUND_REPEAT_DECLARED'] = '1'
        elif case == 'framework-not-declared':
            extra['OUTBOUND_UNDECLARED_STATUS'] = '1'
        p, shutdown = host(extra)
        wait_until(ready, p)
        run('create', appurl, str(uuid.uuid4()))
        run('remote-create', appurl, str(uuid.uuid4()))
        task = run('schedule', appurl, str(uuid.uuid4()), '0', '7')
        if case == 'framework-not-declared':
            stop_wait(p)
            assert p.returncode != 0
            assert not any(s.startswith('caught-declared:') for s in lines())
            assert 'outbound-returned' not in lines()
            target = json.loads(run('remote-inspect', dburl))
            assert target['value'] == 0 and len(target['records']) == 1, target
        elif case not in ['local-retry', 'same-attempt']:
            wait_until(barrier.exists, p)
            assert lines().count('remote-declared-handler') == 1
            assert 'remote-handler' not in lines() and 'outbound-returned' not in lines()
            target = json.loads(run('remote-inspect', dburl))
            assert target['value'] == 0 and len(target['records']) == 2, target
            assert sum(expected in bytes.fromhex(row) for row in target['records']) == 1
            before = json.loads(run('inspect-reader-outcome', dburl, task))
            assert before['status'] == 1 and not before['has_terminal'] and len(before['checkpoints']) == 1
            if case == 'source-stored-crash':
                source_error(before)
                caught = [s.split(':',1)[1] for s in lines() if s.startswith('caught-declared:')]
                assert caught == [expected.hex()], caught
            stop(p, crash=True)
            stop(database_process, crash=True)
            database_process = database()
            assert json.loads(run('remote-inspect', dburl)) == target
            assert json.loads(run('inspect-reader-outcome', dburl, task)) == before
            if case.endswith('reject'):
                change = {'OUTBOUND_AMOUNT': '8'} if case == 'payload-reject' else {'OUTBOUND_BEARER': 'denied'}
                p, shutdown = host(change, expect_failure=True)
                stop_wait(p)
                assert p.returncode != 0
                assert json.loads(run('remote-inspect', dburl)) == target
                assert json.loads(run('inspect-reader-outcome', dburl, task)) == before
                log = Path(next(c['log'] for c in children if c['process'] is p)).read_text()
                assert ('contract' in log or 'provenance collision' in log or 'fingerprint' in log) if case == 'payload-reject' else 'outbound metadata denied' in log
            p, shutdown = host()
        if case != 'framework-not-declared':
            assert json.loads(run('wait', appurl, task)) == {'first':7,'second':0}
            assert lines().count('remote-declared-handler') == 1, lines()
            assert lines().count('remote-handler') == 1, lines()
            caught = [s.split(':',1)[1] for s in lines() if s.startswith('caught-declared:')]
            assert caught and all(s == expected.hex() for s in caught), caught
            if case == 'local-retry':
                assert len(caught) == 2 and lines().count('outbound-returned') == 2
            if case == 'same-attempt':
                assert len(caught) == 2 and lines().count('outbound-returned') == 1
            final_target = json.loads(run('remote-inspect', dburl))
            assert final_target['value'] == 7 and len(final_target['records']) == 3
            assert sum(expected in bytes.fromhex(row) for row in final_target['records']) == 1
            if case not in ['local-retry', 'same-attempt']:
                assert set(target['records']) <= set(final_target['records'])
            stop(p, shutdown=shutdown)
            assert p.returncode == 0
        stop(database_process, crash=True)
        database_process = database()
        final = json.loads(run('inspect-reader-outcome', dburl, task))
        target_final = json.loads(run('remote-inspect', dburl))
        assert final['status'] == (1 if case == 'framework-not-declared' else 2)
        assert lines().count('remote-declared-handler') == 1
        if case != 'framework-not-declared':
            saved_error = source_error(final)
            if case == 'source-stored-crash':
                assert saved_error == source_error(before), 'full error checkpoint changed on replay'
            assert target_final == final_target
            # Completed durable task must not redispatch either handler.
            saved_lines = lines()
            p, shutdown = host()
            assert json.loads(run('wait', appurl, task)) == {'first':7,'second':0}
            stop(p, shutdown=shutdown)
            assert lines() == saved_lines
            assert json.loads(run('inspect-reader-outcome', dburl, task)) == final
        stop(database_process, crash=True)
        cases.append({'case':case,'task':task,'events':lines(),'durable_after_restart':final,'target_after_restart':target_final,'expected_status_hex':expected.hex()})
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
