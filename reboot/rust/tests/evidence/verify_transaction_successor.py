"""Read-only verifier for the retained transaction-successor native archive.

Pass the retained .tar.gz for streaming verification without extracting large
executables, or an extracted evidence root. No Cargo, server, network, or
generated JSON overwrite is performed.
"""
import hashlib
import json
import re
import sys
import fnmatch
import tarfile
from pathlib import Path, PurePosixPath


class ArchivePath:
    """Stream hashes once; retain only small JSON/log inputs, never binaries."""
    def __init__(self, archive, name=''):
        self.archive = archive
        self.key = name

    def __truediv__(self, other):
        return ArchivePath(self.archive, str(PurePosixPath(self.key) / other))

    @property
    def parent(self):
        return ArchivePath(self.archive, str(PurePosixPath(self.key).parent))

    @property
    def name(self):
        return PurePosixPath(self.key).name

    def relative_to(self, root):
        return PurePosixPath(self.key).relative_to(root.key or '.')

    def is_file(self):
        return self.key in self.archive.hashes

    def read_text(self):
        return self.archive.text[self.key].decode()

    def glob(self, pattern):
        prefix = self.key + '/' if self.key else ''
        return [ArchivePath(self.archive, key) for key in self.archive.hashes
                if key.startswith(prefix)
                and key[len(prefix):].count('/') == pattern.count('/')
                and fnmatch.fnmatchcase(key[len(prefix):], pattern)]

    def __str__(self):
        return self.key

    def __lt__(self, other):
        return self.key < other.key


class Archive:
    def __init__(self, path):
        self.hashes = {}
        self.text = {}
        with tarfile.open(path, 'r|gz') as archive:
            for member in archive:
                name = str(PurePosixPath(member.name))
                assert not name.startswith('/') and '..' not in PurePosixPath(name).parts
                if member.islnk():
                    target = str(PurePosixPath(member.linkname))
                    assert name not in self.hashes and target in self.hashes
                    self.hashes[name] = self.hashes[target]
                    if target in self.text:
                        self.text[name] = self.text[target]
                    continue
                if not member.isfile():
                    continue
                assert name not in self.hashes, name
                keep = name.endswith(('.json', '.log'))
                h = hashlib.sha256()
                chunks = []
                stream = archive.extractfile(member)
                for chunk in iter(lambda: stream.read(1024 * 1024), b''):
                    h.update(chunk)
                    if keep:
                        chunks.append(chunk)
                self.hashes[name] = h.hexdigest()
                if keep:
                    self.text[name] = b''.join(chunks)


def digest(path):
    if isinstance(path, ArchivePath):
        return path.archive.hashes[path.key]
    h = hashlib.sha256()
    with path.open('rb') as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b''):
            h.update(chunk)
    return h.hexdigest()


def message(data):
    """Decode canonical protobuf wire fields independently of fixture assertions."""
    position = 0
    fields = {}

    def varint():
        nonlocal position
        value = 0
        for shift in range(0, 70, 7):
            assert position < len(data)
            byte = data[position]
            position += 1
            value |= (byte & 127) << shift
            if byte < 128:
                return value
        raise AssertionError('oversized varint')

    while position < len(data):
        tag = varint()
        number, wire = tag >> 3, tag & 7
        assert number
        if wire == 0:
            value = varint()
        elif wire == 2:
            length = varint()
            assert position + length <= len(data)
            value = data[position:position + length]
            position += length
        else:
            raise AssertionError(('unexpected wire type', wire))
        fields.setdefault(number, []).append(value)
    return fields


def one(fields, tag):
    assert len(fields.get(tag, [])) == 1, (tag, fields)
    return fields[tag][0]


def verify(root):
    def load(relative):
        return json.loads((root / relative).read_text())

    inventory = load('inventory.json')
    assert inventory
    for relative, expected in inventory.items():
        path = root / relative
        assert path.is_file() and digest(path) == expected, relative

    final = load('final1/owner.json')
    assert final['complete'] and final['source_unchanged'] and final['four_locks']
    assert final['base'] == 'd3160c1b833ee4ec5267ceca432c392981c7e1d5'
    assert final['children'] and all(c['waited_by_owner'] and c['exit'] == c['expected'] for c in final['children'])
    parent = load('final1-parent.json')
    assert parent['owner_pid'] == final['owner_pid'] and parent['owner_waited'] and parent['owner_wait_returncode'] == 0
    for relative, expected in final['source_inputs'].items():
        assert digest(root / 'source-objects' / expected) == expected, relative
    retirement = load('retirement.json')
    assert retirement['four_cache_locks_acquired'] and retirement['all_receipt_children_absent'] and retirement['all_owners_and_gate_children_absent']
    for stage in ['owner-error', 'owner-signal']:
        fault = load(stage + '/owner.json')
        waited = load(stage + '-parent.json')
        assert not fault['complete'] and fault['source_unchanged']
        assert waited['owner_pid'] == fault['owner_pid'] and waited['owner_waited'] and waited['owner_wait_returncode'] == 1
        assert fault['children'] and all(c['waited_by_owner'] for c in fault['children'])
        assert fault['children'][0]['exit'] == (1 if stage == 'owner-error' else -15)

    waits = 0
    positive_cases = 0
    receipts = []
    for path in sorted((root / 'final1').glob('*-raw/receipt.json')):
        receipt = json.loads(path.read_text())
        assert receipt['children']
        assert all(c['waited_by_parent'] and 'wait_returncode' in c for c in receipt['children'])
        assert receipt['database_sha256'] == digest(root / 'native/database')
        flavor = 'pure' if path.parent.name.startswith(('pure-', 'parent-')) else 'mixed'
        assert receipt['binary_sha256'] == digest(root / 'final1' / (flavor + '-binding') / 'app')
        waits += len(receipt['children'])
        if not path.parent.name.startswith('parent-'):
            assert receipt['complete'], path
            positive_cases += len(receipt['cases'])
        receipts.append(dict(path=str(path.relative_to(root)), cases=len(receipt['cases']), waits=len(receipt['children'])))

    successor_cases = []
    abort_cases = []
    for flavor in ['pure', 'mixed']:
        inputs = load('final1/' + flavor + '-binding/inputs.json')
        binding = root / 'final1' / (flavor + '-binding')
        for expected in inputs.values():
            assert digest(binding / 'objects' / expected['sha256']) == expected['sha256']
        assert digest(binding / 'app') == inputs['application']['sha256']
        receipt = load('final1/' + flavor + '-successor-raw/receipt.json')
        assert receipt['binary_sha256'] == inputs['application']['sha256']
        assert [c['case'] for c in receipt['cases']] == ['live', 'restart', 'successor-ack-restart']
        successor_cases.extend(receipt['cases'])
        for case in receipt['cases']:
            staged = message(bytes.fromhex(case['successor']))
            completed = case['completed']
            assert case['staged']['values'] == [7, 7] and completed['values'] == [18, 18] and not completed['pending']
            assert one(staged, 2) == b'Apply' and one(staged, 3) == 1
            assert one(message(one(staged, 4)), 1) == 11
            terminal = message(bytes.fromhex(completed['tasks'][0]))
            assert one(terminal, 1) == one(staged, 1) and one(terminal, 3) == 2
            assert one(terminal, 5) == one(staged, 5) and 9 not in terminal
            result = message(one(terminal, 6))
            assert one(result, 1) == b'type.googleapis.com/workflow.v1.Value'
            assert one(message(one(result, 2)), 1) == 18
            events = case['events']
            assert events.count('transaction-apply') == 2 and events.count('transaction-child') == 2
            starts = [int(line.split(':')[1]) for line in events if line.startswith('transaction-successor-enter:')]
            assert len(starts) == 2 and min(starts) >= one(message(one(staged, 5)), 1)
            target_records = [message(bytes.fromhex(raw)) for raw in completed['receipts']]
            assert len(case['source_checkpoints']) == 2
            identities = [bytes.fromhex(case['admission']['task_id']), one(staged, 1)]
            for raw, identity in zip(case['source_checkpoints'], identities):
                source = message(bytes.fromhex(raw))
                task_id = message(identity)
                assert one(source, 4) == one(task_id, 1) and one(source, 5) == one(task_id, 2)
                assert one(source, 6) == one(task_id, 3)
                matching = [m for m in target_records if one(m, 1) == one(source, 1)]
                assert len(matching) == 1 and 6 not in matching[0] and len(one(source, 6)) == 16 and len(one(source, 8)) == 32
                assert one(matching[0], 4) == one(source, 4) and one(matching[0], 5) == one(source, 5)
                # The bounded transaction-root receipt deliberately has no
                # task_ids (runtime.rs::validate_bound_root_effects). Successors
                # are separately canonical durable tasks, not ordinary-writer
                # checkpoint IDs retrofitted into this transaction contract.
                assert matching[0].get(3, []) == []
                outer = message(one(source, 2))
                assert one(outer, 1) == b'type.googleapis.com/reboot.rust.workflow.AtMostOnceResultV1'
                checkpoint = message(one(outer, 2))
                assert one(checkpoint, 1) == 1 and one(checkpoint, 2) == 2 and 4 not in checkpoint
                saved = message(one(checkpoint, 3))
                assert one(saved, 1) == b'type.googleapis.com/workflow.v1.Value' and one(saved, 2) == one(matching[0], 2)
            if case['case'] == 'successor-ack-restart':
                interrupted = case['interrupted_successor']
                assert interrupted['values'] == [18, 18] and len(interrupted['pending']) == 1
                assert one(message(bytes.fromhex(interrupted['tasks'][0])), 3) == 1
        aborted = load('final1/' + flavor + '-successor-abort-raw/receipt.json')
        assert len(aborted['cases']) == 1
        abort_cases.extend(aborted['cases'])
        case = aborted['cases'][0]
        assert case['final']['values'] == [0, 0] and not case['final']['pending'] and not case['final']['participants']
        assert case['result']['declared'] and case['result']['required'] == 4242 and case['result']['observed'] == 7
        terminal = message(bytes.fromhex(case['final']['tasks'][0]))
        assert one(terminal, 3) == 2 and 6 not in terminal
        error = message(one(terminal, 9))
        assert one(error, 1) == b'type.googleapis.com/google.rpc.Status'
        assert one(error, 2).hex() == case['result']['error']
        status = message(one(error, 2))
        assert one(status, 1) == 10
        detail = message(one(status, 3))
        assert one(detail, 1) == b'type.googleapis.com/workflow.v1.BelowThreshold'
        payload = message(one(detail, 2))
        assert one(payload, 1) == 4242 and one(payload, 2) == 7
        assert case['events'].count('transaction-declared-child-staged') == 1
        assert not any(event.startswith('transaction-successor-enter:') for event in case['events'])

    red = load('red1/owner.json')
    assert red['complete'] and red['source_unchanged'] and all(c['waited_by_owner'] and c['exit'] == c['expected'] for c in red['children'])
    for name in ['ignore-due', 'skip-target-receipt']:
        mutation = load('mutants/mutations.json')[name]
        assert digest(root / 'mutants' / (name + '.original')) == mutation['original_sha256']
        assert digest(root / 'mutants' / (name + '.modified')) == mutation['modified_sha256']
        failed = load('red1/' + name + '-raw/receipt.json')
        binding = root / 'red1' / (name + '-binding')
        inputs = load('red1/' + name + '-binding/inputs.json')
        assert any('workflow.reboot.rs' in key for key in inputs)
        for expected in inputs.values():
            assert digest(binding / 'objects' / expected['sha256']) == expected['sha256']
        assert digest(binding / 'app') == failed['binary_sha256'] == inputs['application']['sha256']
        assert failed['database_sha256'] == digest(root / 'native/database')
        assert digest(root / 'mutants' / name / mutation['path']) == mutation['modified_sha256']
        assert not failed['complete'] and failed['all_original_children_waited']
        assert all(c['waited_by_parent'] for c in failed['children'])
        if name == 'skip-target-receipt':
            assert failed['failure_snapshot']['values'] == [29, 29]
        else:
            assert failed['failure_snapshot']['values'] == [18, 18]

    counts = {}
    for gate, key in [('all-targets', 'sdk'), ('doctests', 'doctests'), ('pure-consumer-tests', 'pure_consumer'), ('mixed-consumer-tests', 'mixed_consumer')]:
        text = (root / 'final1' / (gate + '.log')).read_text()
        matches = re.findall(r'test result: ok\. (\d+) passed; (\d+) failed; (\d+) ignored;', text)
        assert matches and all(int(failed) == 0 for _, failed, _ in matches)
        counts[key] = dict(passed=sum(int(passed) for passed, _, _ in matches), ignored=sum(int(ignored) for _, _, ignored in matches))
    return dict(accepted=True, source_commit=final['source_commit'], gates=len(final['children']), native_positive_case_executions=positive_cases, new_successor_scenarios=len(successor_cases)+len(abort_cases), successor_execution_cases=len(successor_cases), abort_nonescape_cases=len(abort_cases), successor_root_handler_entries=sum(c['events'].count('transaction-apply') for c in successor_cases), successor_leaf_handler_entries=sum(c['events'].count('transaction-child') for c in successor_cases), original_driver_child_waits=waits, native_receipts=receipts, counts=counts, inventory_files=len(inventory), fresh_cpp_build=False)


if __name__ == '__main__':
    path = Path(sys.argv[1]).resolve()
    root = ArchivePath(Archive(path)) if path.is_file() else path
    print(json.dumps(verify(root), indent=2))
