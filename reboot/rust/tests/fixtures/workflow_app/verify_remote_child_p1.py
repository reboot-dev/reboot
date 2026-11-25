"""Read-only, stdlib verification of the final-topology P1 evidence pack.

Usage: python3 verify_remote_child_p1.py ARCHIVE MANIFEST [CHECKOUT]
Checks every retained byte/mode, source variant, build binding, actual wait,
canonical Task terminal, and the replay-bypass wrong durable root/child result.
Does not rerun native workloads or treat a failing process alone as a RED.
"""
import hashlib
import json
from pathlib import Path
import sys
import tarfile

BASE = 'home/benchbuild/.cache/transaction-remote-child-20261021-evidence/'
EXPECTED_CASES = {
    'ack-restart', 'error-ack-restart', 'authorization-reject', 'payload-reject',
    'target-ack-loss', 'error-target-ack-loss', 'receipt-ack-loss',
    'abort-ack-loss', 'source-ack-loss', 'terminal-ack-loss',
}


def wire(data):
    """Decode protobuf wire scalars/bytes without generated runtime dependencies."""
    pos = 0
    result = {}

    def varint():
        nonlocal pos
        value = shift = 0
        while True:
            assert pos < len(data) and shift < 70
            byte = data[pos]
            pos += 1
            value |= (byte & 127) << shift
            if byte < 128:
                return value
            shift += 7

    while pos < len(data):
        tag = varint()
        field, kind = tag >> 3, tag & 7
        assert field
        if kind == 0:
            value = varint()
        elif kind == 2:
            size = varint()
            value = data[pos:pos + size]
            assert len(value) == size
            pos += size
        else:
            raise AssertionError(('unexpected wire kind', kind))
        result.setdefault(field, []).append(value)
    return result


def verify(archive, manifest, checkout=None):
    m = json.loads(manifest.read_text())
    assert archive.stat().st_size == m['archive_bytes']
    with archive.open('rb') as f:
        assert hashlib.file_digest(f, 'sha256').hexdigest() == m['archive_sha256']
    expected = {r['archive_path']: r for r in m['files']}
    assert len(expected) == len(m['files'])
    seen, bodies = {}, {}
    with tarfile.open(archive, 'r|xz') as tar:
        for entry in tar:
            assert entry.name not in seen
            row = expected[entry.name]
            if entry.islnk():
                digest, size = seen[entry.linkname]
                if entry.linkname in bodies:
                    bodies[entry.name] = bodies[entry.linkname]
            else:
                assert entry.isfile()
                h, size, chunks = hashlib.sha256(), 0, []
                retain = entry.size < 10 * 1024 * 1024
                f = tar.extractfile(entry)
                assert f is not None
                for chunk in iter(lambda: f.read(1024 * 1024), b''):
                    h.update(chunk)
                    size += len(chunk)
                    if retain:
                        chunks.append(chunk)
                digest = h.hexdigest()
                if retain:
                    bodies[entry.name] = b''.join(chunks)
            assert (digest, size) == (row['sha256'], row['bytes']), entry.name
            assert bool(entry.mode & 0o111) == bool(row['mode'] & 0o111)
            seen[entry.name] = digest, size
    assert set(seen) == set(expected)

    def record(path):
        return json.loads(bodies[BASE + path])

    source_maps, gates, joins, hashes = {}, [], 0, {}
    for variant in ['skip-target-receipt', 'base-runtime', 'green']:
        stage = 'p1-final-' + variant
        owner = record(stage + '/owner.json')
        parent = record(stage + '-parent.json')
        assert owner['complete'] and owner['source_unchanged'] and owner['four_locks']
        assert owner['source_commit'] == 'b20ada237d7071c9d47755ca739abfd3f077a19c'
        assert parent['owner_waited'] and parent['owner_wait_returncode'] == 0
        assert parent['owner_pid'] == owner['owner_pid']
        source_maps[variant] = owner['source_inputs']
        for rel, h in owner['source_inputs'].items():
            assert seen[BASE + 'source-objects/' + h][0] == h
            if checkout and variant == 'green':
                assert hashlib.sha256((checkout / rel).read_bytes()).hexdigest() == h, rel
        assert owner['children']
        for child in owner['children']:
            assert child['waited_by_owner'] and child['exit'] == child['expected']
            assert seen[BASE + stage + '/' + child['name'] + '.log'][0] == child['log_sha256']
            gates.append((stage, child['name'], child['exit']))
        for mode in (['mixed', 'pure'] if variant == 'green' else ['mixed']):
            binding = record(stage + '/' + mode + '-binding/inputs.json')
            for value in binding.values():
                assert seen[BASE + stage + '/' + mode + '-binding/objects/' + value['sha256']] == (value['sha256'], value['bytes'])
            binary = binding['application']['sha256']
            assert seen[BASE + stage + '/' + mode + '-binding/app'][0] == binary
            driver = record(stage + '/' + mode + '-remote-raw/receipt.json')
            assert driver['binary_sha256'] == binary
            assert driver['database_sha256'] == seen['home/benchbuild/.cache/hello-image-evidence/rust-context/database'][0]
            assert driver['fresh_cpp_build'] is False
            assert driver['children'] and driver['all_original_children_waited']
            assert all(c['waited_by_parent'] for c in driver['children'])
            joins += len(driver['children'])
            hashes[variant + '/' + mode] = binary
            if variant != 'green':
                assert not driver['complete'] and not driver['cases']
                snap = driver['failure_snapshot']
                values = [x['value'] for x in snap]
                task = wire(bytes.fromhex(snap[0]['tasks'][0]))
                if variant == 'skip-target-receipt':
                    assert values == [17, 17] and task[3] == [2]
                    response = wire(task[6][0])
                    assert response[1] == [b'type.googleapis.com/workflow.v1.Value']
                    assert wire(response[2][0])[1] == [17]
                    assert "'17'" in driver['error']
                else:
                    assert values == [0, 0] and task[3] == [1]
                    assert 6 not in task and 9 not in task
                    logs = [bodies[c['log'].lstrip('/')] for c in driver['children']]
                    assert any(b'receipt-bound root composition requires registered same-host dispatch' in log for log in logs)
                    assert 'transaction-child' not in driver['failure_events']
            else:
                assert driver['complete']
                cases = driver['cases']
                assert len(cases) == len(EXPECTED_CASES)
                assert {c['case'] for c in cases} == EXPECTED_CASES
                for case in cases:
                    final = case['final']
                    assert not any(x['participants'] for x in final)
                    task = wire(bytes.fromhex(final[0]['tasks'][0]))
                    assert task[3] == [2] and (6 in task) != (9 in task)
                    if case['case'] in {'ack-restart', 'authorization-reject', 'payload-reject', 'target-ack-loss'}:
                        assert [x['value'] for x in final] == [10, 10]
                        assert case['result'] == {'response': {'value': '7'}}
                    else:
                        assert [x['value'] for x in final] == ([3, 3] if case['before'] else [0, 0])
                        assert case['result']['declared']
                        assert case['result']['observed'] == 7 and case['result']['required'] == 4242
    mutations = record('p1-mutations.json')
    for variant, rel in [('skip-target-receipt', 'reboot/rust/src/codegen.rs'), ('base-runtime', 'reboot/rust/src/runtime.rs')]:
        green, red = source_maps['green'], source_maps[variant]
        assert green.keys() == red.keys()
        assert [r for r in green if green[r] != red[r]] == [rel]
        assert mutations[variant]['original_sha256'] == green[rel]
        assert mutations[variant]['modified_sha256'] == red[rel]
        if variant == 'base-runtime':
            # git show be870386:reboot/rust/src/runtime.rs, independently hashed.
            assert red[rel] == '7520cb62591b80c49fcf1ec14ff488867b8b148089d680c77491474e466544f2'
        if variant == 'skip-target-receipt':
            original = bodies[BASE + 'source-objects/' + green[rel]]
            modified = bodies[BASE + 'source-objects/' + red[rel]]
            old = b'if let Some(idempotency) = &automatic_idempotency {{ let replay_after_admission = async'
            assert original.count(old) == 1
            assert modified == original.replace(old, old.replace(b' {{', b' && false {{', 1))
    post = record('p1-postflight.json')
    assert post['four_locks_observed_available'] and all(post['pid_absence'].values())
    assert len(gates) == 12
    return dict(acceptance=True, archive_sha256=m['archive_sha256'], verified_members=len(seen),
                owner_gates=len(gates), green_case_executions=20, unique_green_cases=len(EXPECTED_CASES),
                driver_child_waits=joins, executable_hashes=hashes, source_inputs=len(source_maps['green']),
                control_wrong_values=[17, 17], base_rejection_values=[0, 0])


if __name__ == '__main__':
    print(json.dumps(verify(Path(sys.argv[1]), Path(sys.argv[2]),
                            Path(sys.argv[3]) if len(sys.argv) > 3 else None), indent=2))
