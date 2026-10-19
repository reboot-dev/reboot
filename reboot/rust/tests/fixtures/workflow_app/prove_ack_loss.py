"""Native Store-ACK loss at target, source Started, and source Stored.
The exact parent owns/waits every host, proxy, Database, and inspection child.
Run with a Python that has grpcio. No mutating RPC is transparently retried.
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

BIN, ROOT = Path(sys.argv[1]).resolve(), Path(sys.argv[2]).resolve()
DB = Path(os.environ['REBOOT_NATIVE2PC_CXX_DATABASE']).resolve()
ROOT.mkdir(parents=True, exist_ok=False)
children, cases = [], []
receipt = dict(complete=False, parent_pid=os.getpid(), children=children, cases=cases)


def port():
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        return sock.getsockname()[1]


def spawn(args, env=None):
    log = ROOT / f'{len(children):03d}.log'
    with log.open('wb') as output:
        child = subprocess.Popen(list(map(str, args)), env=env, stdout=output, stderr=output)
    children.append(dict(process=child, pid=child.pid, parent_pid=os.getpid(),
                         args=list(map(str, args)), log=str(log)))
    return child


def row(child):
    return next(item for item in children if item['process'] is child)


def wait(child):
    child.wait(timeout=30)
    row(child).update(wait_returncode=child.returncode, waited_by_parent=True)


def stop(child):
    if child.poll() is None:
        child.kill()  # only the original exact Popen child, never a PID lookup
    wait(child)


def run(*args, good=True):
    child = spawn([BIN, *args])
    wait(child)
    text = Path(row(child)['log']).read_text().strip()
    if good:
        assert child.returncode == 0, text
    return text


def until(predicate, owner=None):
    end = time.monotonic() + 30
    while time.monotonic() < end:
        if predicate():
            return
        if owner is not None and owner.poll() is not None:
            raise AssertionError(Path(row(owner)['log']).read_text())
        time.sleep(.02)
    raise AssertionError('bounded observation timed out')


def listening(child, number):
    def probe():
        try:
            with socket.create_connection(('127.0.0.1', number), timeout=.1):
                return True
        except OSError:
            return False
    until(probe, child)


try:
    for boundary in ['target', 'started', 'stored']:
        work = ROOT / boundary
        work.mkdir()
        events = work / 'events'
        dp, pp, sp, tp = port(), port(), port(), port()
        dburl, proxyurl, sourceurl, targeturl = [f'http://127.0.0.1:{n}' for n in [dp, pp, sp, tp]]
        run('info', work / 'info.pb')
        def database():
            child = spawn([DB, work / 'rocksdb', work / 'info.pb', dp])
            listening(child, dp)
            return child
        def host(target=False, extra=None, expect_failure=False):
            env = os.environ.copy() | dict(WORKFLOW_BODY_MODE='outbound', WORKFLOW_BODY_EVENTS=str(events), OUTBOUND_ENDPOINT=targeturl)
            env.update(extra or {})
            child = spawn([BIN, 'serve-target' if target else 'serve', proxyurl,
                           f'127.0.0.1:{tp if target else sp}', work / f'shutdown-{len(children)}'], env)
            if not expect_failure:
                listening(child, tp if target else sp)
            return child
        def lines():
            return events.read_text().splitlines() if events.exists() else []
        def inspect():
            return json.loads(run('remote-inspect', dburl))
        database_child = database()
        proxy = spawn([sys.executable, Path(__file__).with_name('database_ack_proxy.py'),
                       f'127.0.0.1:{dp}', f'127.0.0.1:{pp}', boundary, work])
        listening(proxy, pp)
        target = host(True)
        source = host()
        def ready():
            result = run('read', sourceurl, good=False)
            return any(marker in result for marker in ['"schedules"', 'StateNotConstructed', 'must be constructed'])
        until(ready, source)
        run('create', sourceurl, str(uuid.uuid4()))
        run('remote-create', targeturl, str(uuid.uuid4()))
        initial = inspect()
        task = run('schedule', sourceurl, str(uuid.uuid4()), '0', '7')
        until((work / 'ack-observed.json').exists, source)
        observed = json.loads((work / 'ack-observed.json').read_text())
        assert observed['real_store_ack_observed'] and not observed['downstream_success_delivered']
        retained = inspect()  # independent direct connection, bypasses proxy
        pending = json.loads(run('inspect-reader-outcome', dburl, task))
        assert pending['status'] == 1 and not pending['has_terminal'] and len(pending['checkpoints']) == 1
        assert 'outbound-returned' not in lines()
        if boundary == 'started':
            assert retained == initial and 'remote-handler' not in lines()
        else:
            assert retained['value'] == 7 and len(retained['records']) == 2
            assert lines().count('remote-handler') == 1
        (work / 'release').touch()  # return transport error, never the ACK
        wait(source)
        assert source.returncode != 0 and 'outbound-returned' not in lines()
        assert json.loads(run('inspect-reader-outcome', dburl, task)) == pending
        if boundary == 'target':
            # The target host itself survives; a NEW mutation must fail closed
            # after unknown ACK instead of clearing its uncertain actor gate.
            failed = run('remote-apply', targeturl, str(uuid.uuid4()), '1', good=False)
            assert 'actor commit outcome uncertain' in failed, failed
            assert inspect() == retained and lines().count('remote-handler') == 1
        stop(target)
        stop(proxy)
        stop(database_child)
        database_child = database()
        # Restart proxy with its one-shot fault already disarmed.
        proxy = spawn([sys.executable, Path(__file__).with_name('database_ack_proxy.py'),
                       f'127.0.0.1:{dp}', f'127.0.0.1:{pp}', 'disabled', work])
        listening(proxy, pp)
        target = host(True)
        # Changed payload cannot bypass the retained Started/Stored contract.
        changed = host(extra={'OUTBOUND_AMOUNT': '8'}, expect_failure=True)
        wait(changed)
        assert changed.returncode != 0
        assert json.loads(run('inspect-reader-outcome', dburl, task)) == pending
        assert inspect() == retained
        denied = host(extra={'OUTBOUND_BEARER': 'denied'}, expect_failure=True)
        wait(denied)
        assert denied.returncode != 0
        assert 'outbound metadata denied' in Path(row(denied)['log']).read_text()
        assert json.loads(run('inspect-reader-outcome', dburl, task)) == pending
        assert inspect() == retained
        source = host()
        until(lambda: 'outbound-returned' in lines(), source)
        assert json.loads(run('wait', sourceurl, task)) == {'first': 7, 'second': 0}
        assert lines().count('remote-handler') == 1
        wires = [line for line in lines() if line.startswith('remote-wire:')]
        assert wires and len(set(wires)) == 1 and wires[0].split(':')[1] == task
        recovered = inspect()
        assert recovered['value'] == 7 and len(recovered['records']) == 2
        if boundary != 'started':
            assert recovered == retained, 'full durable target receipts changed on replay'
        stop(source)
        stop(target)
        stop(proxy)
        stop(database_child)
        database_child = database()
        assert inspect() == recovered
        final = json.loads(run('inspect-reader-outcome', dburl, task))
        assert final['status'] == 2 and final['has_terminal']
        stop(database_child)
        cases.append(dict(boundary=boundary, task=task, ack=observed, before_restart=pending,
                          after_restart=final, retained_target=retained, final_target=recovered,
                          events=lines()))
    receipt['complete'] = True
finally:
    for child in children:
        if 'waited_by_parent' not in child:
            stop(child['process'])
    for child in children:
        child.pop('process')
        child['log_sha256'] = hashlib.sha256(Path(child['log']).read_bytes()).hexdigest()
    receipt.update(binary_sha256=hashlib.sha256(BIN.read_bytes()).hexdigest(),
                   database_sha256=hashlib.sha256(DB.read_bytes()).hexdigest(),
                   source_sha256={p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in [Path(__file__), Path(__file__).with_name('database_ack_proxy.py')]})
    (ROOT / 'receipt.json').write_text(json.dumps(receipt, indent=2))
print(json.dumps(dict(complete=receipt['complete'], cases=len(cases), children=len(children))))
