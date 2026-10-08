#!/usr/bin/env python3
"""Check ledger freshness/references, not behavioral truth or broad SDK parity.

No files are changed. Refresh the embedded fingerprint only after claim review
and relevant acceptance; this script intentionally has no auto-update mode.
"""
import hashlib
import json
from pathlib import Path
import re
import subprocess
import unittest

ROOT = Path(__file__).resolve().parents[3]
SDK = ROOT / 'reboot/rust'
OBSOLETE = (
    'PARITY-MAP.md', 'APP-DX.md', 'WORKFLOWS.md', 'REACTIVE-LOCAL.md',
    'SORTED-MAP-PREREQUISITE.md', 'TASK-DECLARED-RESULT-CANDIDATE.md',
    'CROSS_ACTOR_PARTICIPANT_ENLISTMENT_CONTRACT.md',
    'CROSS_ACTOR_TRANSACTIONAL_STUB_CONTRACT.md',
)

def source_manifest():
    paths = subprocess.check_output(['git', 'ls-files', '-co', '--exclude-standard', '-z'], cwd=ROOT).decode().split('\0')
    selected = []
    for name in paths:
        if not name:
            continue
        suffix = Path(name).suffix
        if (name.startswith('reboot/rust/') and suffix in {'.rs', '.proto', '.toml', '.lock', '.py'} and name != 'reboot/rust/tests/verify_parity_documentation.py') or (
            name.startswith('rbt/') and suffix == '.proto'
        ) or (name.startswith('reboot/cli/commands/init/') and suffix in {'.py', '.j2'}) or name in {
            'reboot/cli/commands/dev.py', 'reboot/cli/commands/rust_dev.py',
            'reboot/server/database.cc', 'reboot/server/database.h',
            'tests/reboot/cli/rust_app_dx_test.py', 'tests/reboot/cli/rust_app_dx_e2e.py',
            'tests/reboot/cli/rust_batch_ledger_e2e.py',
        }:
            selected.append(name)
    return {name: hashlib.sha256((ROOT / name).read_bytes()).hexdigest() for name in sorted(selected)}

def fingerprint(manifest):
    return hashlib.sha256(json.dumps(manifest, sort_keys=True, separators=(',', ':')).encode()).hexdigest()

def headings(text):
    counts = {}
    anchors = set()
    for line in text.splitlines():
        match = re.match(r'^#{1,6} (.+?)\s*#*$', line)
        if not match:
            continue
        base = re.sub(r'[^\w\- ]', '', match.group(1).lower()).replace(' ', '-')
        index = counts.get(base, 0)
        anchors.add(base if index == 0 else f'{base}-{index}')
        counts[base] = index + 1
    return anchors

def check_links(text, directory):
    checked = 0
    for target in re.findall(r'\]\(([^\s)]+)\)', text):
        if re.match(r'^[a-zA-Z][a-zA-Z0-9+.-]*:', target):
            continue
        name, _, anchor = target.partition('#')
        path = directory / name if name else directory / 'PARITY.md'
        if not path.exists():
            raise ValueError(f'broken link: {target}')
        if anchor:
            if path.suffix != '.md' or anchor not in headings(path.read_text()):
                raise ValueError(f'broken anchor: {target}')
        checked += 1
    return checked

def check_fingerprint(text, actual):
    matches = re.findall(r'<!-- parity-source-sha256: ([0-9a-f]{64}) -->', text)
    if matches != [actual]:
        raise ValueError('missing, duplicate or stale parity source fingerprint: re-audit before refresh')

class CheckerTests(unittest.TestCase):
    def test_real_links(self):
        self.assertGreater(check_links((SDK / 'PARITY.md').read_text(), SDK), 0)
    def test_broken_link_rejected(self):
        with self.assertRaisesRegex(ValueError, 'broken link'):
            check_links('[negative](no-such-source-file.rs)', SDK)
    def test_broken_anchor_rejected(self):
        with self.assertRaisesRegex(ValueError, 'broken anchor'):
            check_links('[negative](PARITY.md#no-such-heading)', SDK)
    def test_missing_fingerprint_rejected(self):
        with self.assertRaises(ValueError):
            check_fingerprint('', 'a' * 64)
    def test_changed_source_rejected(self):
        old = fingerprint({'source.rs': 'a' * 64})
        changed = fingerprint({'source.rs': 'b' * 64})
        with self.assertRaises(ValueError):
            check_fingerprint(f'<!-- parity-source-sha256: {old} -->', changed)
    def test_duplicate_fingerprint_rejected(self):
        marker = f'<!-- parity-source-sha256: {"a" * 64} -->'
        with self.assertRaises(ValueError):
            check_fingerprint(marker + marker, 'a' * 64)

def main():
    suite = unittest.defaultTestLoader.loadTestsFromTestCase(CheckerTests)
    result = unittest.TextTestRunner(verbosity=2).run(suite)
    if not result.wasSuccessful():
        raise SystemExit(1)
    for name in OBSOLETE:
        if (SDK / name).exists():
            raise ValueError(f'obsolete competing ledger still exists: {name}')
    text = (SDK / 'PARITY.md').read_text()
    for name in OBSOLETE:
        if name in text or name in (SDK / 'README.md').read_text():
            raise ValueError(f'stale ledger reference: {name}')
    manifest = source_manifest()
    check_fingerprint(text, fingerprint(manifest))
    count = check_links(text, SDK) + check_links((SDK / 'README.md').read_text(), SDK)
    print(json.dumps({'self_tests': result.testsRun, 'source_files': len(manifest),
                      'local_links_checked': count, 'obsolete_ledgers_absent': len(OBSOLETE),
                      'source_fingerprint_matches': True, 'behavioral_proof': False}))

if __name__ == '__main__':
    main()
