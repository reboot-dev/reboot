"""Independently verify additive FINAL-runtime causal RED/restored GREEN bytes.

Usage: python3 verify_final_canonical_root_intent_archive.py ARCHIVE MANIFEST SOURCE_GIT
This does not consume or relabel any historical qualification receipt.
"""
import hashlib
import json
import pathlib
import subprocess
import sys
import tarfile
import uuid

archive, manifest, repo = map(pathlib.Path, sys.argv[1:4])
ledger = json.loads(manifest.read_text())
assert archive.stat().st_size == ledger['archive_bytes']
h = hashlib.sha256()
with archive.open('rb') as data:
    while block := data.read(1024 * 1024):
        h.update(block)
assert h.hexdigest() == ledger['archive_sha256']
expected = {row['path']: row for row in ledger['files']}
assert len(expected) == ledger['members']
seen, retained = {}, {}
with tarfile.open(archive, 'r|xz') as stream:
    for member in stream:
        assert member.name in expected and member.name not in seen
        row = expected[member.name]
        assert member.mode == row['mode']
        if member.issym():
            assert member.linkname == row['symlink']
            size, sha = 0, hashlib.sha256(member.linkname.encode()).hexdigest()
        elif member.islnk():
            assert member.linkname in seen and row['hardlink'] == member.linkname
            size, sha = seen[member.linkname]
            if member.linkname in retained:
                retained[member.name] = retained[member.linkname]
        else:
            assert member.isfile()
            h, size, parts = hashlib.sha256(), 0, []
            keep = member.size < 3 * 1024 * 1024 and member.name.endswith(('.json', '.log', '.py', '.rs'))
            data = stream.extractfile(member)
            assert data is not None
            while block := data.read(1024 * 1024):
                h.update(block)
                size += len(block)
                if keep:
                    parts.append(block)
            sha = h.hexdigest()
            if keep:
                retained[member.name] = b''.join(parts)
        assert (size, sha) == (row['bytes'], row['sha256']), member.name
        seen[member.name] = size, sha
assert set(seen) == set(expected)
source_paths = {row['source'] for row in ledger['files']}


def load(path):
    return json.loads(retained['evidence/' + path])


def wire(data):
    """Decode protobuf fields independently, including timestamp-version tag 6."""
    fields, pos = {}, 0

    def varint():
        nonlocal pos
        value, shift = 0, 0
        while True:
            byte = data[pos]
            pos += 1
            value |= (byte & 127) << shift
            if byte < 128:
                return value
            shift += 7
            assert shift < 70

    while pos < len(data):
        tag = varint()
        number, kind = tag >> 3, tag & 7
        assert number > 0
        if kind == 0:
            value = varint()
        elif kind == 2:
            count = varint()
            value = data[pos:pos + count]
            assert len(value) == count
            pos += count
        else:
            raise AssertionError(('unexpected protobuf wire type', kind))
        fields.setdefault(number, []).append(value)
    return fields


def intent(snapshot):
    rows = [wire(bytes.fromhex(raw)) for raw in snapshot[0]['receipts']]
    rows = [row for row in rows if row.get(8, [b''])[0].startswith(b'reboot.canonical.root-attempt.v1\0')]
    assert len(rows) == 1
    row = rows[0]
    assert not any(field in row for field in (3, 6, 7))
    record = wire(row[2][0])
    assert record.get(6) == [1], 'not a fresh final-format verified-zero intent'
    assert len(record[1][0]) == 16 and len(record[2][0]) == 16
    return dict(root=str(uuid.UUID(bytes=record[1][0])), members=record.get(4, []))


runtime = 'b2771aed29fd28bc5e3ed3122e10c63f10cd9ffe'
stages = ['final-red-root14', 'final-red-member15', 'final-restored16']
batch = load('final-causal-batch.json')
assert not batch['complete'] and batch['source_restored']
assert [row['stage'] for row in batch['children']] == stages
assert all(row['waited'] for row in batch['children'])
assert [row['exit'] for row in batch['children']] == [0, 0, 1]
owners = {}
for stage in stages + ['final-regression19']:
    owner, parent = load(stage + '/owner.json'), load(stage + '-parent.json')
    restored_with_failed_regression = stage == 'final-restored16'
    assert owner['source_commit'] == runtime and owner['source_unchanged']
    assert owner['complete'] == (not restored_with_failed_regression)
    assert owner['four_locks'] and owner['retired'] and owner['retired_parents']
    assert owner['children'] and all(c['waited_by_owner'] for c in owner['children'])
    if restored_with_failed_regression:
        assert all(c['exit'] == c['expected'] for c in owner['children'][:-1])
        assert owner['children'][-1]['name'] == 'mixed-remote' and owner['children'][-1]['exit'] == 1
    else:
        assert all(c['exit'] == c['expected'] for c in owner['children'])
    assert parent['owner_waited'] and parent['owner_wait_returncode'] == (1 if restored_with_failed_regression else 0)
    assert parent['owner_pid'] == owner['owner_pid']
    assert load(stage + '-postflight.json')['four_locks_available']
    for child in owner['children']:
        assert seen['evidence/' + stage + '/' + child['name'] + '.log'][1] == child['log_sha256']
    owners[stage] = owner
fixed = owners[stages[2]]['source_inputs']
for failed_stage in ['final-regression17', 'final-regression18']:
    rejected = load(failed_stage + '-admission-failure.json')
    parent = load(failed_stage + '-parent.json')
    assert rejected['no_build_or_native_children'] and not rejected['complete']
    assert parent['owner_waited'] and parent['owner_wait_returncode'] == 1
assert load('final-regression18/owner.json')['children'] == []
budget = load('final-regression19-budget.json')
assert budget['no_cargo_commands'] and budget['available_bytes'] > budget['peak_growth_bytes'] + budget['free_floor_bytes']
assert budget['peak_growth_bytes'] == 2 * budget['prior_native_matrix_bytes'] + 4 * 1024**3
assert budget['whole_batch_growth_to_date_bytes'] + budget['peak_growth_bytes'] < budget['whole_batch_growth_ceiling_bytes']
assert load('final-regression19-postflight.json')['current_target_bytes'] == budget['target_ceiling_bytes']
local_binding = load('final-causal-local-bindings.json')
assert local_binding['local_head'] == 'e8fdf8d2eb35903a4516f84ab597dd5b0aef01fe'
assert local_binding['tested_runtime'] == runtime and local_binding['exact_head_bound_runtime_inputs'] == len(fixed)
for name, sha in fixed.items():
    for revision in [runtime, local_binding['local_head']]:
        data = subprocess.check_output(['git', '-C', str(repo), 'show', revision + ':' + name])
        assert hashlib.sha256(data).hexdigest() == sha, (revision, name)
    assert seen['source/' + name][1] == sha
    assert seen['evidence/source-objects/' + sha][1] == sha
for stage, old, new, case in [
    (stages[0], '    Ok(found)', '    Ok(None)', 'root-binding-restart'),
    (stages[1], '        self.persist(&record).await?;', '        // Negative control: omit durable membership Store ACK.', 'remote-intent-restart'),
]:
    mutation = load(stage + '-mutation.json')
    assert mutation['source_commit'] == runtime
    assert (mutation['old'], mutation['new'], mutation['case']) == (old, new, case)
    path = mutation['path']
    assert path == 'reboot/rust/src/canonical_root_attempt.rs'
    changed = {p for p in fixed if fixed[p] != owners[stage]['source_inputs'][p]}
    assert changed == {path}
    original = subprocess.check_output(['git', '-C', str(repo), 'show', runtime + ':' + path])
    assert original.decode().count(old) == 1
    mutant = original.decode().replace(old, new).encode()
    assert hashlib.sha256(original).hexdigest() == mutation['fixed_sha256'] == fixed[path]
    assert hashlib.sha256(mutant).hexdigest() == mutation['mutant_sha256'] == owners[stage]['source_inputs'][path]
    assert seen['evidence/source-objects/' + mutation['mutant_sha256']][1] == mutation['mutant_sha256']


def proof(stage, label, lang, binding_stage=None):
    row = load(stage + '/' + label + '-raw/receipt.json')
    binding_stage = binding_stage or stage
    assert row['children'] and all(child['waited_by_parent'] for child in row['children'])
    assert row['binary_sha256'] == seen['evidence/' + binding_stage + '/' + lang + '-binding/app'][1]
    assert row['database_sha256'] == seen['native/database'][1]
    binding = load(binding_stage + '/' + lang + '-binding/inputs.json')
    assert binding['application']['sha256'] == row['binary_sha256']
    for item in binding.values():
        assert seen['evidence/' + binding_stage + '/' + lang + '-binding/objects/' + item['sha256']] == (item['bytes'], item['sha256'])
    for child in row['children']:
        if child.get('role') == 'database':
            prefix = child['args'][1] + '/'
            assert prefix + 'CURRENT' in source_paths
            assert any(p.startswith(prefix + 'MANIFEST-') for p in source_paths)
    return row


red_root = proof(stages[0], 'mixed-focused', 'mixed')
assert not red_root['complete'] and red_root['cases'] == []
assert red_root['error'] == "AssertionError('recovery replaced original root UUID')"
root = red_root['root_binding_restarts'][0]
assert root['original_root'] != root['recovered_root'] and root['before'] != root['recovered']
assert intent(root['before'])['root'] == root['original_root']
assert intent(root['recovered'])['root'] == root['recovered_root']
red_member = proof(stages[1], 'mixed-focused', 'mixed')
assert not red_member['complete'] and red_member['cases'] == []
assert red_member['error'] == 'AssertionError()'
snapshot = red_member['failure_snapshot']
assert intent(snapshot)['members'] == []
assert [row['value'] for row in snapshot] == [0, 0]
assert red_member['failure_events'].count('transaction-apply') == 1
assert red_member['failure_events'].count('transaction-child') == 0
marker = 'evidence/' + stages[1] + '/mixed-focused-raw/remote-intent-restart/remote-intent'
assert seen[marker] == (36, hashlib.sha256(intent(snapshot)['root'].encode()).hexdigest()), 'pre-network marker does not bind the durable root'
assert "assert len(intent['members'])==1 and intent['members'][0]['state_ref']==leaf" in retained['evidence/' + stages[1] + '/mixed-focused.log'].decode()
assert len({seen['evidence/' + stage + '/mixed-binding/app'][1] for stage in stages}) == 3

focused = ['root-binding-restart', 'remote-intent-restart', 'success', 'child-ack-loss', 'ack-restart', 'target-ack-loss']
positive = []
for lang in ['mixed', 'pure']:
    row = proof(stages[2], lang + '-focused', lang)
    assert row['complete'] and [c['case'] for c in row['cases']] == focused
    positive += [(lang, c['case']) for c in row['cases']]
    root = row['root_binding_restarts'][0]
    assert root['original_root'] == root['recovered_root'] and root['before'] == root['recovered']
    assert intent(root['before'])['root'] == root['original_root']
    remote = row['remote_intent_restarts'][0]
    assert remote['original'] == remote['recovered'] and remote['before'] == remote['final']
    assert len(intent(remote['before'])['members']) == 1
    ack = row['child_ack_root_intents'][0]
    assert ack['retained'] == ack['after_replay'] and len(intent(ack['retained'])['members']) == 1
regression = []
assert owners['final-regression19']['source_inputs'] == fixed
failed_regression = proof(stages[2], 'mixed-remote', 'mixed')
assert not failed_regression['complete'] and len(failed_regression['cases']) == 9
assert 'StatusCode.CANCELLED' in failed_regression['error'] and 'Timeout expired' in failed_regression['error']
assert 'grpc.StatusCode.DEADLINE_EXCEEDED' in retained['evidence/' + stages[2] + '/mixed-remote.log'].decode()
for label, count, lang in [('mixed-remote', 14, 'mixed'), ('pure-remote', 14, 'pure'), ('transaction', 7, 'mixed')]:
    row = proof('final-regression19', label, lang, stages[2])
    assert row['complete'] and len(row['cases']) == count
    assert len({c['case'] for c in row['cases']}) == count
    regression += [(label, c['case']) for c in row['cases']]
print(json.dumps(dict(complete=True, archive_sha256=ledger['archive_sha256'], members=len(seen), frozen_inputs=len(fixed), tested_runtime=runtime, final_runtime_causal_negative_controls=2, historical_controls_counted=0, restored_opted_positive_executions=len(positive), restored_regression_executions=len(regression), restored_native_executions=len(positive) + len(regression), automatic_startup_membership_recovery=False, terminal_abort_convergence=False), indent=2))
