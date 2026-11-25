"""Q2 native scenario. Uses the parent's existing exact-child runtime, never Popen.

Entry point: WORKFLOW_CONTROL_SCENARIO=revision prove_control_flow.py APP_BIN.
Requires WORKFLOW_REVISION_STAGE (new directory), WORKFLOW_CONTROL_EVIDENCE
(new file), REBOOT_NATIVE2PC_CXX_DATABASE, and WORKFLOW_CUSTODY_MODULE naming
an already loaded cursor-exact-child-v2 runtime in its original active gate.
The outer runtime retains its lock/container on uncertain cleanup. This driver
neither creates a supervisor nor releases the outer runtime's ownership.
"""
import hashlib
import importlib
import json
import os
from pathlib import Path
import socket
import sys
import time
import uuid


def main():
    if not __debug__:
        raise RuntimeError('optimized Python is not accepted')
    name = os.environ.get('WORKFLOW_CUSTODY_MODULE')
    if not name or name not in sys.modules:
        raise RuntimeError('BLOCKED: parent must supply its already loaded exact-child runtime via WORKFLOW_CUSTODY_MODULE')
    custody = importlib.import_module(name)
    if custody.CONTRACT != 'cursor-exact-child-v2' or not custody._owner.active_gate:
        raise RuntimeError('BLOCKED: original exact-child runtime gate is not active')
    binary = Path(sys.argv[1]).resolve(strict=True)
    database_binary = Path(os.environ['REBOOT_NATIVE2PC_CXX_DATABASE']).resolve(strict=True)
    stage = Path(os.environ['WORKFLOW_REVISION_STAGE'])
    evidence = Path(os.environ['WORKFLOW_CONTROL_EVIDENCE'])
    if stage.exists() or evidence.exists():
        raise RuntimeError('stage and evidence must be fresh')
    stage.mkdir(parents=True)
    commands, hosts, cases = [], [], []
    result: dict = {'complete': False, 'native_proof': False}
    original_kind = os.environ.get('WORKFLOW_REFERENCE_KIND')

    def run(*args):
        argv = [str(binary), *map(str, args)]
        receipt = custody.run(argv, timeout=15)
        commands.append(dict(command=argv, exit=receipt.returncode,
                             stdout=receipt.stdout, stderr=receipt.stderr))
        assert receipt.joined_exact and receipt.returncode == 0, commands[-1]
        return receipt.stdout.strip()

    def until(predicate):
        deadline = time.monotonic() + 10
        while time.monotonic() < deadline:
            if predicate():
                return
            time.sleep(.02)
        raise RuntimeError('bounded wait expired; not semantic acceptance')

    def port():
        with socket.socket() as sock:
            sock.bind(('127.0.0.1', 0))
            return sock.getsockname()[1]

    def start(argv, logpath, env=None, shutdown=None):
        log = logpath.open('xb')
        try:
            child = custody.spawn(list(map(str, argv)), stdout=log, stderr=log, env=env)
        except BaseException:
            log.close()
            raise
        hosts.append((child, log, shutdown))
        return child

    def listener(child, number):
        def ready():
            child.require_owned_alive()
            try:
                with socket.create_connection(('127.0.0.1', number), timeout=.1):
                    return True
            except OSError:
                return False
        until(ready)

    def sdk_barrier():
        owner = custody._owner
        assert owner is not None and owner.failure is None
        assert all(any(child.row is row for child in custody.children) for row in owner.direct)
        for child in custody.children:
            if child.argv[0] != str(database_binary):
                child.assert_joined()

    def stop(child, shutdown=None):
        if child.argv[0] == str(database_binary):
            sdk_barrier()
        child.retire(shutdown=shutdown, timeout=15)
        child.assert_joined()
        assert child.returncode == 0

    try:
        for kind in ('plain', 'escaped', 'composed'):
            os.environ['WORKFLOW_REFERENCE_KIND'] = kind
            work = stage / kind
            work.mkdir()
            dp, ap = port(), port()
            while ap == dp:
                ap = port()
            database, app = f'http://127.0.0.1:{dp}', f'http://127.0.0.1:{ap}'
            run('info', work / 'server-info.pb')

            def startdb(index):
                child = start([database_binary, work / 'rocksdb', work / 'server-info.pb', dp],
                              work / f'database-{index}.log')
                listener(child, dp)
                return child

            def starthost(index):
                events = work / f'events-{index}'
                shutdown = work / f'shutdown-{index}'
                env = os.environ.copy()
                env.update(WORKFLOW_BODY_MODE='revision', WORKFLOW_BODY_EVENTS=str(events))
                child = start([binary, 'serve', database, f'127.0.0.1:{ap}', shutdown],
                              work / f'host-{index}.log', env, shutdown)
                listener(child, ap)
                # Readiness is read-only and may be retried. Never retry the
                # constructor, scheduler, or the signal writer under acceptance.
                def ready():
                    receipt = custody.run([str(binary), 'read', app], timeout=2)
                    commands.append(dict(command=[str(binary), 'read', app],
                                         exit=receipt.returncode, stdout=receipt.stdout,
                                         stderr=receipt.stderr, readiness_probe=True))
                    assert receipt.joined_exact
                    return receipt.returncode == 0 or 'must be constructed' in receipt.stderr or 'state must' in receipt.stderr
                until(ready)
                return child, shutdown, events

            db = startdb(0)
            host, shutdown, events = starthost(0)
            run('create', app, uuid.uuid4())
            handle = run('schedule', app, uuid.uuid4(), 0, 7)
            until(lambda: events.exists() and 'revision-parked' in events.read_text().splitlines())
            assert 'revision-woke' not in events.read_text().splitlines()
            stored = run('inspect-reference', database, handle)
            if kind == 'plain':
                assert '/' not in stored and '\\' not in stored
            elif kind == 'escaped':
                assert '/' not in stored and '\\' in stored
            else:
                assert stored.count('/') == 1 and '\\' in stored
            assert f'revision-identity:{stored}' in events.read_text().splitlines()
            assert json.loads(run('inspect-state', database)) == {'first': 0, 'second': 0, 'schedules': 1}
            stop(host, shutdown)
            stop(db)
            db = startdb(1)
            host, shutdown, events = starthost(1)
            until(lambda: events.exists() and 'revision-parked' in events.read_text().splitlines())
            assert run('inspect-reference', database, handle) == stored
            assert f'revision-identity:{stored}' in events.read_text().splitlines()
            assert 'revision-woke' not in events.read_text().splitlines()
            pending = json.loads(run('inspect-reader-outcome', database, handle))
            assert pending == {'status': 1, 'has_terminal': False, 'checkpoints': []}, pending
            recovered_state = json.loads(run('inspect-state', database))
            assert recovered_state == {'first': 0, 'second': 0, 'schedules': 1}, recovered_state
            signal_key = str(uuid.uuid4())  # fresh ordinary generated First RPC, sent once
            assert run('signal', app, signal_key, 7) == '7'
            assert json.loads(run('wait', app, handle)) == {'first': 7, 'second': 0}
            lines = events.read_text().splitlines()
            assert lines.count('revision-parked') == lines.count('revision-woke') == 1
            assert lines.count('first-handler') == 1, 'the fresh signal must dispatch exactly once'
            assert lines.index('revision-parked') < lines.index('first-handler') < lines.index('revision-woke') < lines.index('revision-readback-ack')
            state = json.loads(run('inspect-state', database))
            assert state == {'first': 7, 'second': 0, 'schedules': 1}
            terminal = json.loads(run('inspect-reader-outcome', database, handle))
            assert terminal['status'] == 2 and terminal['has_terminal']
            assert len(terminal['checkpoints']) == 1
            stop(host, shutdown)
            stop(db)
            cases.append(dict(kind=kind, stored_state_ref=stored, handle=handle,
                              signal_key=signal_key, state=state, terminal=terminal,
                              events=lines, pending_before_writer=True))
        assert len(cases) == 3
        result.update(complete=True, native_proof=True)
    finally:
        # Every SDK reservation (including failed clients) must be retired and
        # genuinely joined before the Database can receive a shutdown request.
        # Failures remain sticky in the original runtime; never synthesize joins.
        errors = []
        for child in custody.children:
            if child.argv[0] == str(database_binary):
                continue
            try:
                shutdown = next((s for c, _, s in hosts if c is child), None)
                child.retire(shutdown=shutdown, timeout=15)
                child.assert_joined()
            except BaseException as error:
                errors.append(repr(error))
        try:
            sdk_barrier()
            for child, _, _ in hosts:
                if child.argv[0] == str(database_binary):
                    stop(child)
        except BaseException as error:
            errors.append(repr(error))
        for _, log, _ in hosts:
            log.close()
        if original_kind is None:
            os.environ.pop('WORKFLOW_REFERENCE_KIND', None)
        else:
            os.environ['WORKFLOW_REFERENCE_KIND'] = original_kind
        if errors:
            result.update(complete=False, native_proof=False)
        result.update(cases=cases, commands=commands, cleanup_errors=errors,
                      binary_sha256=hashlib.sha256(binary.read_bytes()).hexdigest(),
                      database_sha256=hashlib.sha256(database_binary.read_bytes()).hexdigest(),
                      custody_contract=custody.CONTRACT,
                      child_receipts=[child.row for child in custody.children])
        with evidence.open('x') as output:
            json.dump(result, output, indent=2)
            output.write('\n')
        if errors:
            raise RuntimeError(f'exact-child cleanup failed; outer owner retained: {errors}')
    print(json.dumps({'complete': result['complete'], 'cases': len(cases)}))


if __name__ == '__main__':
    main()
