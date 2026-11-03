"""Verify additive legacy transaction evidence without extracting or rebuilding."""
import hashlib
import json
import pathlib
import sys
import tarfile

base = pathlib.Path(sys.argv[1])
archive = base / 'legacy7-restore2-additive.tar.gz'
verification = json.loads((base / 'legacy7-offhost-verification.json').read_text())
assert verification['archive_sha256'] == '4894428866a069ce7dee9f8ac3387f2939979de748d22255248a3a0479af7c04'
manifest = json.loads((base / 'legacy7-restore2-archive-manifest.json').read_text())
with archive.open('rb') as stream:
    assert hashlib.file_digest(stream, 'sha256').hexdigest() == verification['archive_sha256']
assert archive.stat().st_size == verification['archive_bytes']
rows = {row['archive_path']: row for row in manifest['files']}
assert len(rows) == len(manifest['files']) == 840
prefix = 'home/benchbuild/.cache/remote-authority-recovery-20261021-evidence/'
source_prefix = 'home/benchbuild/.cache/remote-authority-recovery-20261021-green5-src/'
records = {}
seen = set()
with tarfile.open(archive) as tar:
    for member in tar:
        assert member.name in rows and member.name not in seen
        seen.add(member.name)
        stream = tar.extractfile(member)
        assert stream is not None
        data = stream.read()
        assert len(data) == rows[member.name]['bytes']
        assert hashlib.sha256(data).hexdigest() == rows[member.name]['sha256']
        if member.name.endswith('.json'):
            records[member.name] = json.loads(data)
assert seen == set(rows)
stage = prefix + 'legacy7-20261021-restore2/'
owner = records[stage + 'owner.json']
parent = records[prefix + 'legacy7-20261021-restore2-parent.json']
receipt = records[stage + 'transaction-raw/receipt.json']
assert owner['complete'] and owner['source_unchanged'] and owner['four_locks']
assert parent['owner_waited'] and parent['owner_wait_returncode'] == 0
assert owner['owner_pid'] == parent['owner_pid']
assert len(owner['children']) == 1
assert owner['children'][0]['pid'] == receipt['parent_pid']
assert owner['children'][0]['exit'] == 0 and owner['children'][0]['waited_by_owner']
assert owner['children'][0]['log_sha256'] == rows[stage + 'transaction.log']['sha256']
assert receipt['complete'] and receipt['all_original_children_waited']
assert [case['case'] for case in receipt['cases']] == [
    'success', 'concurrent-root', 'ack-restart', 'target-ack-loss',
    'payload-reject', 'authorization-reject', 'rollback']
assert len(receipt['children']) == 100
assert all(child['waited_by_parent'] for child in receipt['children'])
assert receipt['binary_sha256'] == rows[prefix + 'final1/mixed-binding/app']['sha256'] == '091fadaf8c763ca6de035ff4d52008998752537ed58663b077c93cd63cd09f3e'
assert receipt['database_sha256'] == rows['home/benchbuild/.cache/hello-image-evidence/rust-context/database']['sha256'] == '619002c569e9841144a8bbedf4f2ce6a753bb0e6b103af71883d91d43f413803'
assert rows[source_prefix + 'reboot/rust/tests/fixtures/workflow_app/prove_transaction.py']['sha256'] == '771e94cdaf0e65a73be2ad0ab5ab974324b49eb8e5d655df82a74fe4d81c44a4'
assert owner['source_inputs'] == records[prefix + 'final1/owner.json']['source_inputs']
assert len(owner['source_inputs']) == 491
for name, digest in owner['source_inputs'].items():
    assert rows[source_prefix + name]['sha256'] == digest
# Actual native storage, not just a receipt reporting a database process.
for case in receipt['cases']:
    for database in ['rocksdb', 'target-rocksdb']:
        root = stage + 'transaction-raw/' + case['case'] + '/' + database + '/'
        assert any(name.startswith(root) and name.endswith('/CURRENT') for name in rows)
        assert any(name.startswith(root) and '/MANIFEST-' in name for name in rows)
post = records[prefix + 'legacy7-restore2-postflight.json']
assert post['available_bytes'] > 8589934592 and post['four_locks_available']
assert post['all_original_waits'] and post['source_unchanged']
assert set(post['all_pids_absent']) == {parent['parent_pid'], owner['owner_pid'], receipt['parent_pid'], *[child['pid'] for child in receipt['children']]}
cleanup = records[prefix + 'approved-incremental-cleanup-20261021.json']
assert cleanup['deleted'] and cleanup['path_absent']
assert cleanup['available_after'] - cleanup['available_before'] == cleanup['actual_net_recovered_bytes'] == 5579587584
print(json.dumps(dict(complete=True, cases=7, driver_children=100, members=len(rows), frozen_inputs=491, no_rebuild=True, publication='requires independent parent rereview')))
