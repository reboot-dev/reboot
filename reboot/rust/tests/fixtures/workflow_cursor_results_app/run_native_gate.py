"""Runnable Linux native gate. Requires current built app and native Database.

  CURSOR_APP_BIN=/absolute/app REBOOT_NATIVE2PC_CXX_DATABASE=/absolute/database \
    python3 run_native_gate.py

Defaults to 10000 iterations. Holds an exclusive original-owner lock through
public acceptance subreaper retention, including setup/evidence failures. No
container, infrastructure, build, broad kill, or automatic escalation occurs.
"""
import contextlib
import fcntl
import hashlib
import json
import os
from pathlib import Path
import runpy
import signal
import sys
import tempfile
import traceback

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[4]
sys.path.insert(0, str(ROOT / 'tests/reboot/cli'))
sys.path.insert(0, str(HERE))
from rust_process_ownership import enable_subreaper, protected_owned_exit
import cursor_custody


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    if not __debug__:
        raise RuntimeError('gate requires assertions enabled')
    explicit = os.environ.get('CURSOR_GATE_DIR')
    if explicit:
        stage = Path(explicit).resolve()
        stage.mkdir(exist_ok=False)
    else:
        stage = Path(tempfile.mkdtemp(prefix='cursor-native-gate-'))
    lock = (stage / 'owner.lock').open('x')
    fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    report = {'complete': False, 'stage': str(stage), 'pid': os.getpid()}
    target = stage / 'gate.json'

    def save():
        target.write_text(json.dumps(report, indent=2) + '\n')

    previous_handlers = {}

    def cancel(signum, frame):
        # Latch only. Arbitrary asynchronous exceptions could interrupt child
        # acquisition or exact receipt publication. Safe ownership/wait boundaries
        # observe cancellation; retention never unwinds on repeated signals.
        reason = f'owner received signal {signum}; reconciliation required'
        cursor_custody._owner.cancellation = reason
        cursor_custody._owner.failure = cursor_custody._owner.failure or reason
        report.setdefault('signals', []).append(signum)
        report['complete'] = False

    save()
    print('CURSOR_NATIVE_GATE', target, flush=True)
    try:
        for sig in (signal.SIGTERM, signal.SIGINT):
            previous_handlers[sig] = signal.signal(sig, cancel)
        enable_subreaper()
        cursor_custody.check_cancelled()
        cursor_custody._owner.active_gate = True
        binary = Path(sys.argv[1] if len(sys.argv) > 1 else os.environ['CURSOR_APP_BIN']).resolve(strict=True)
        database = Path(os.environ['REBOOT_NATIVE2PC_CXX_DATABASE']).resolve(strict=True)
        for path in (binary, database):
            if not path.is_file() or not os.access(path, os.X_OK):
                raise RuntimeError(f'not an executable file: {path}')
        if not all(hasattr(os, name) for name in ('pidfd_open', 'P_PIDFD', 'waitid')):
            raise RuntimeError('Linux pidfd/waitid Python support required')
        os.environ['REBOOT_NATIVE2PC_CXX_DATABASE'] = str(database)
        scenario = os.environ.get('NATIVE_GATE_SCENARIO', 'cursor')
        if scenario not in ('cursor', 'revision'):
            raise RuntimeError(f'unsupported native gate scenario: {scenario}')
        report['scenario'] = scenario
        if scenario == 'revision':
            driver = HERE.parent / 'workflow_app/prove_revision.py'
            stage_key, evidence_key = 'WORKFLOW_REVISION_STAGE', 'WORKFLOW_CONTROL_EVIDENCE'
            # Supply the original already-active module, never a second owner.
            os.environ['WORKFLOW_CUSTODY_MODULE'] = cursor_custody.__name__
        else:
            driver = HERE / 'prove_cursor.py'
            stage_key, evidence_key = 'CURSOR_STAGE', 'CURSOR_EVIDENCE'
        os.environ.setdefault(stage_key, str(stage / 'work'))
        os.environ.setdefault(evidence_key, str(stage / 'evidence.json'))
        os.environ.setdefault('CURSOR_ITERATIONS', '10000')
        evidence = Path(os.environ[evidence_key])
        if Path(os.environ[stage_key]).exists() or evidence.exists():
            raise RuntimeError('fresh exclusive scenario stage and evidence required')
        sources = [p for tree in (ROOT / 'reboot/rust', ROOT / 'rbt')
                   for p in tree.rglob('*') if p.is_file() and
                   p.suffix in ('.py', '.rs', '.proto', '.toml', '.lock') and
                   not {'target', '__pycache__'}.intersection(p.parts)]
        sources += [ROOT / 'reboot/server/database.cc', ROOT / 'reboot/server/database.h',
                    ROOT / 'tests/reboot/cli/rust_process_ownership.py', binary, database]
        revision = cursor_custody.run(['git', '-C', str(ROOT), 'rev-parse', 'HEAD'])
        if revision.returncode != 0:
            raise RuntimeError('cannot record source revision')
        report['revision'] = revision.stdout.strip()
        report['binary_source_association'] = 'operator-supplied; executable hashes alone do not attest source build'
        report['source_hashes'] = {str(p): sha(p) for p in sorted(set(sources))}
        report['iterations'] = int(os.environ['CURSOR_ITERATIONS'])
        save()
        sys.argv = [str(driver), str(binary)]
        with (stage / 'driver.log').open('x') as log, contextlib.redirect_stdout(log), contextlib.redirect_stderr(log):
            runpy.run_path(str(driver), run_name='__main__')
        proof = json.loads(evidence.read_text())
        if not proof['complete'] or not proof.get(
                'all_owned_children_joined' if scenario == 'cursor' else 'native_proof', False):
            raise RuntimeError('driver evidence incomplete')
        for child in cursor_custody.children:
            child.assert_joined()
        if cursor_custody._owner.failure is not None:
            raise RuntimeError('sticky custody failure')
        if any(sha(Path(p)) != digest for p, digest in report['source_hashes'].items()):
            raise RuntimeError('frozen source/executable changed')
        report['body_passed'] = True
    except BaseException as error:
        report['failure'] = repr(error)
        report['traceback'] = traceback.format_exc()
        raise
    finally:
        # Exact waits above are receipt authority. Existing public ownership
        # retention catches acquisition failures/adopted descendants without
        # synthesizing receipts or signalling anything inferred from a name.
        try:
            protected_owned_exit(cursor_custody._owner.owned,
                                 stage / 'retained-owners.json', save,
                                 root_pid=os.getpid())
            report['complete'] = bool(report.get('body_passed') and
                                      cursor_custody._owner.failure is None and
                                      all(c.joined_exact and c.failure is None
                                          for c in cursor_custody.children))
        finally:
            report['children'] = [c.row for c in cursor_custody.children]
            report['custody_failure'] = cursor_custody._owner.failure
            report['artifact_hashes'] = {str(p): sha(p) for p in stage.rglob('*') if p.is_file() and p not in (target, stage / 'owner.lock')}
            save()
            # Keep the flock descriptor alive until all retention is finished.
            lock.close()
            cursor_custody._owner.active_gate = False
            for sig, handler in previous_handlers.items():
                signal.signal(sig, handler)
    if not report['complete']:
        raise RuntimeError('gate incomplete; see sticky ownership failure')
    print('CURSOR_NATIVE_ACCEPTED', target)


if __name__ == '__main__':
    main()
