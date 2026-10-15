"""SOURCE ONLY. Run only inside cursor444_gate's existing configured owner.
Expected JSON: cursor486 report plus canonical_inputs (see HANDOFF.md).
No host, info generator, task producer, alternate supervisor or custody fallback.
"""
from pathlib import Path
import sys
if not __debug__:
    raise RuntimeError('assertions required')
from supervision_reference import *
import shutil
import stat

TERMINAL = 'ae6dd3be-4b94-4b24-9880-e76578c49d62'
PENDING = 'f497952f-9499-4847-80bc-ca52022c69f2'
work = Path(os.environ['CURSOR_STAGE'])
evidence = Path(os.environ['CURSOR_EVIDENCE'])
work.mkdir(exist_ok=False)

def require(ok, message):
    if not ok:
        raise RuntimeError(message)

def sha(path):
    h = hashlib.sha256()
    with Path(path).open('rb') as f:
        for block in iter(lambda: f.read(1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()

def manifest(root):
    require(root.is_dir() and not root.is_symlink(), 'regular dataset directory required')
    rows = {}
    for p in sorted(root.rglob('*')):
        mode = p.lstat().st_mode
        require(stat.S_ISDIR(mode) or stat.S_ISREG(mode), 'dataset symlink/special file refused')
        if stat.S_ISREG(mode):
            rows[str(p.relative_to(root))] = sha(p)
    require(rows, 'empty dataset refused')
    return rows

def pinned_source(pin):
    p = Path(pin['path'])
    require(p.is_file() and not p.is_symlink() and sha(p) == pin['sha256'], 'source pin mismatch')
    return p.read_text()

cleanup_errors = []
result.update(body_passed=False, scope='independent post-run database-only canonical readback; not public acceptance',
              native_acceptance=False, public_acceptance=False)
try:
    adapter = custody()  # ONLY existing gate-configured bridge, no owner creation.
    require(adapter._owner is not None and not adapter.children and not adapter._owner.direct,
            'fresh configured original owner required')
    source = Path(os.environ['CANONICAL_INPUT_ROCKSDB'])
    info = Path(os.environ['CANONICAL_SERVER_INFO'])
    expected_path = Path(os.environ['CANONICAL_EXPECTED'])
    require(all(p.is_absolute() for p in (source, info, expected_path, work, evidence)), 'absolute paths required')
    require(not work.resolve().is_relative_to(source.resolve()) and
            not source.resolve().is_relative_to(work.resolve()), 'input/work overlap refused')
    expected_hash = sha(expected_path)
    expected = json.loads(expected_path.read_text())
    original = expected['driver_evidence']
    require(expected['verification']['driver_native_scenarios_verified'] is True and original['complete'] is True,
            'qualified original report required')
    require(sha(BIN) == original['binary_sha256'] == expected['verification']['app_sha256'] and
            sha(DB) == original['database_sha256'], 'must reuse exact accepted app and native database bytes')
    pins = expected['canonical_inputs']
    main = pinned_source(pins['main_rs'])
    inspect_source = pinned_source(pins['inspect_rs'])
    construction = '''db::ServerInfo {
                shard_infos: vec![db::ShardInfo {
                    shard_id: "s000000000".into(),
                    shard_first_key: vec![],
                }],
            }'''
    require(construction in main and 'if mode == "info" || mode == "--server-info"' in main,
            'actual original single-shard info source construction missing')
    require('if mode == "inspect"' in main and 'return inspect().await;' in main and
            'DatabaseClient::connect(arg(2))' in inspect_source and
            'uuid::Uuid::parse_str(&arg(3))?' in inspect_source and
            'workflow_iteration: Some(arg(4).parse()?)' in inspect_source,
            'actual inspect command source contract mismatch')
    result['source_checks'] = {'main_rs': pins['main_rs'], 'inspect_rs': pins['inspect_rs'],
        'single_shard_construction': 'source assertion only; original info bytes copied, not regenerated',
        'shard_id': 's000000000', 'shard_first_key_hex': ''}
    completed = original['scenarios'][0]['completed']
    pending = original['scenarios'][1]['pending']
    for task, iteration, snapshot in ((TERMINAL, '1029', completed), (PENDING, '0', pending)):
        require(any(c['exit'] == 0 and c['command'][1] == 'inspect' and
                    c['command'][3:] == [task, iteration] and json.loads(c['stdout']) == snapshot
                    for c in original['commands'] if len(c['command']) == 5),
                'original successful inspect command/snapshot missing')
    global_keys = ('consumed', 'concurrent', 'after', 'a_state', 'b_state', 'b_commits')
    terminal_expected = dict(completed)
    terminal_expected.update({k: pending[k] for k in global_keys})
    require({k: pending[k] for k in ('consumed', 'concurrent', 'after', 'b_commits')} ==
            {'consumed': 1030, 'concurrent': 3, 'after': 1, 'b_commits': 1031}, 'global expectations mismatch')
    require(pending['status'] == 1 and pending['iteration'] == 0 and pending['terminal'] is False and
            len(pending['records']) == 1 and pending['records'][0]['phase'] == 1 and
            pending['records'][0]['type'] == 'type.googleapis.com/reboot.rust.workflow.AtMostOnceResultV1' and
            not any(r['phase'] == 2 for r in pending['records']), 'Started/noStored expectations mismatch')
    require(completed['status'] == 2 and completed['iteration'] == 1029 and completed['terminal'] is True,
            'terminal expectations mismatch')
    before = manifest(source)
    require(before == pins['rocksdb_manifest'], 'historical dataset pin mismatch')
    require(info.is_file() and not info.is_symlink() and sha(info) == pins['server_info_sha256'], 'original info pin mismatch')
    # copyfile streams bytes into NEW inodes; never copytree hardlinks or reuse input.
    destination = work / 'rocksdb'
    destination.mkdir()
    for name, digest in before.items():
        src, dst = source / name, destination / name
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(src, dst, follow_symlinks=False)
        require(dst.is_file() and not dst.is_symlink() and sha(dst) == digest and
                (src.stat().st_dev, src.stat().st_ino) != (dst.stat().st_dev, dst.stat().st_ino),
                'independent dataset byte copy failed')
    shutil.copyfile(info, work / 'server-info.pb', follow_symlinks=False)
    require(sha(work / 'server-info.pb') == pins['server_info_sha256'], 'copied info mismatch')
    require(manifest(destination) == before and manifest(source) == before, 'prelaunch copy/input drift')
    result['inputs'] = {'expected_sha256': expected_hash, 'rocksdb': str(source),
        'rocksdb_manifest': before, 'server_info': str(info), 'server_info_sha256': sha(info),
        'copy_before_database_start': True, 'copy_method': 'copyfile; distinct inodes, no hardlinks'}
    dp = port()
    endpoint = 'http://127.0.0.1:%d' % dp
    db = spawn([DB, destination, work / 'server-info.pb', dp])
    listener(db, dp)
    terminal_actual = json.loads(run('inspect', endpoint, TERMINAL, 1029))
    require(terminal_actual == terminal_expected, 'terminal task/records or latest global actors differ')
    pending_actual = json.loads(run('inspect', endpoint, PENDING, 0))
    require(pending_actual == pending, 'whole pending canonical snapshot differs')
    db.require_owned_alive()
    result['snapshots'] = {'terminal': terminal_actual, 'pending': pending_actual}
    result['verification'] = {'terminal_task_and_records_preserved': True,
        'global_actors_equal_later_pending': True, 'whole_pending_equal': True,
        'raw_task_and_started_record_equal': True, 'no_stored': True,
        'fresh_cli_process_per_inspect': True, 'sdk_host_started': False}
    result['body_passed'] = True
except BaseException as error:
    result['failure'] = repr(error)
    raise
finally:
    try:
        cleanup_errors.extend(cleanup_sdk_reservations())
    except BaseException as error:
        cleanup_errors.append(repr(error))
    for entry in sorted(processes, key=lambda e: e['command'][0] == str(DB)):
        try:
            stop(entry['process'])  # actual SDK barrier + healthy intentional SIGTERM/CLD_EXITED 0
            entry['exit'] = entry['process'].returncode
        except BaseException as error:
            cleanup_errors.append(repr(error))
        finally:
            entry['joined_exact'] = entry['process'].joined_exact
            try:
                entry['log'].close()
                entry['log_text'] = Path(entry['log'].name).read_text(errors='replace')
            except BaseException as error:
                cleanup_errors.append(repr(error))
    all_joined = False
    try:
        custody().require_all_joined()  # includes short CLI and failed spawn reservations
        sdk_exact_join_barrier()
        all_joined = True
        result['custody'] = custody()._owner.evidence()
        result['child_receipts'] = [{'command': c.argv, 'joined_exact': c.joined_exact,
            'exit': c.returncode, 'signals': c.signals, 'failure': c.failure,
            'policy_failure': c.policy_failure, 'receipt': vars(c.receipt) if c.receipt else None}
            for c in custody().children]
        if 'before' in globals():
            require(manifest(source) == before and sha(info) == pins['server_info_sha256'] and
                    sha(expected_path) == expected_hash, 'historical inputs changed')
            result['historical_inputs_unchanged'] = True
        result['binary_sha256'] = sha(BIN)
        result['database_sha256'] = sha(DB)
    except BaseException as error:
        cleanup_errors.append(repr(error))
    result.update(commands=commands, processes=[{k: v for k, v in e.items() if k not in ('process', 'log')}
        for e in processes], cleanup_errors=cleanup_errors, event_files={}, all_owned_children_joined=all_joined)
    result['complete'] = bool(result['body_passed'] and all_joined and not cleanup_errors)
    with evidence.open('x') as output:
        output.write(json.dumps(result, indent=2) + '\n')
        output.flush()
        os.fsync(output.fileno())
    if not result['complete']:
        raise RuntimeError('canonical verifier incomplete; parent gate retains unknown custody')
print(json.dumps({'complete': result['complete'], 'inspections': len(commands)}))
