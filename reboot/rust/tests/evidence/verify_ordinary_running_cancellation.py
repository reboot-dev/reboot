"""Read-only offhost verifier: never extract or rewrite the archive/evidence.

Usage: python verify_ordinary_running_cancellation.py REPOSITORY ARCHIVE ARCHIVE_RECEIPT
Prints a JSON verification receipt to stdout. Uses only the Python standard library.
"""

import difflib
import datetime
import hashlib
import json
from pathlib import Path
import re
import sys
import subprocess
import tarfile

repo, archive, receipt_path = map(Path, sys.argv[1:])

def sha(data):
    return hashlib.sha256(data).hexdigest()

receipt = json.loads(receipt_path.read_text())
assert sha(archive.read_bytes()) == receipt['archive_sha256']
assert archive.stat().st_size == receipt['bytes']
with tarfile.open(archive) as tar:
    members = tar.getmembers()
    names = [m.name for m in members]
    assert len(set(names)) == len(names) == receipt['file_members']
    assert all(m.isfile() and not Path(m.name).is_absolute() and '..' not in Path(m.name).parts for m in members)
    contents = {}
    for member in members:
        stream = tar.extractfile(member)
        assert stream is not None
        contents[member.name] = stream.read()
    inventory = json.loads(contents['archive-members.json'])
    assert set(names) == set(inventory) | {'archive-members.json'}
    for name, expected in inventory.items():
        assert len(contents[name]) == expected['bytes'] and sha(contents[name]) == expected['sha256'], name
        if name.endswith('.json'):
            assert contents[name], name
            json.loads(contents[name])
    def load(name):
        return json.loads(contents[name])
    qualification = load('qualification.json')
    assert qualification['complete'] and qualification['all_original_children_retired']
    assert sha(contents['qualification.json']) == receipt['qualification_sha256']
    manifest = load('greenfinal5-source-inputs.json')
    assert sha(contents['greenfinal5-source-inputs.json']) == receipt['source_manifest_sha256'] == qualification['source_manifest_sha256']
    objects = load('source-objects.json')
    local_sources = 0
    for key, expected in objects.items():
        assert expected['sha256'] == manifest[key]
        value = contents[expected['member']]
        assert len(value) == expected['bytes'] and sha(value) == expected['sha256']
        if key.startswith('source/'):
            local = repo / key.removeprefix('source/')
            assert local.is_file() and sha(local.read_bytes()) == expected['sha256'], str(local)
            local_sources += 1
    assert len(manifest) == qualification['source_input_count']
    assert len({o['sha256'] for o in objects.values()}) == qualification['source_object_count']
    for name, expected in qualification['generated_rust_outputs'].items():
        assert sha(contents[name]) == expected['sha256']
    gates = qualification['gates']
    assert gates['complete'] and gates['source_unchanged']
    assert all(g['accepted'] and g['waited_by_original_parent'] and (g['exit'] == 0 if g['expected_exit'] == 0 else g['exit'] != 0) for g in gates['gates'])
    for name in ['sdk-clippy', 'fixture-clippy']:
        gate = next(g for g in gates['gates'] if g['name'] == name)
        assert '-D' in gate['command'] and 'warnings' in gate['command'] and '--all-targets' in gate['command']
    assert gates['gates'][0]['name'] == 'sdk-package-clean'
    all_targets = re.findall(r'test result: (\w+)\. (\d+) passed; (\d+) failed; (\d+) ignored;', contents['greenfinal5-all-targets.log'].decode())
    assert all_targets and all(m[0] == 'ok' and int(m[2]) == 0 for m in all_targets)
    assert sum(int(m[1]) for m in all_targets) == qualification['all_targets']['total_passed']
    assert sum(int(m[3]) for m in all_targets) == qualification['all_targets']['total_ignored']
    for suite, expected in qualification['additional_test_suites'].items():
        results = re.findall(r'test result: (\w+)\. (\d+) passed; (\d+) failed; (\d+) ignored;', contents[f'greenfinal5-{suite}.log'].decode())
        assert results and all(v[0]=='ok' and int(v[2])==0 for v in results)
        assert sum(int(v[1]) for v in results)==expected['passed'] and sum(int(v[3]) for v in results)==expected['ignored']
    assert {name: data['cases'] for name, data in qualification['native'].items()} == {
        'running': 6, 'generic': 12, 'workflow-writer': 2, 'canonical': 11,
        'migration': 1, 'lifecycle': 19, 'spawn': 16,
    }
    cases = waits = 0
    owned = []
    for folder, expected in qualification['native'].items():
        name = f'greenfinal5-{folder}-raw/receipt.json'
        raw = load(name)
        assert sha(contents[name]) == expected['receipt_sha256']
        assert raw['complete'] and raw['children'] and raw.get('all_original_children_waited', True)
        assert raw['binary_sha256'] == qualification['fixture_binary_sha256']
        assert raw['database_sha256'] == qualification['native_database_sha256']
        assert len(raw['cases']) == expected['cases'] and len(raw['children']) == expected['original_child_waits']
        assert all(c['waited_by_parent'] and c['parent_pid'] == raw['parent_pid'] for c in raw['children'])
        assert len({c['pid'] for c in raw['children']}) == len(raw['children'])
        owned.extend((raw['parent_pid'], c['pid']) for c in raw['children'])
        cases += len(raw['cases']); waits += len(raw['children'])
    assert len(set(owned)) == len(owned)
    assert cases == qualification['native_case_total'] and waits == qualification['native_original_wait_total']
    generic = load('greenfinal5-generic-raw/receipt.json')
    expected_values = {'success': (7, 1), 'concurrent': (7, 1), 'auth': (7, 1), 'writer-ack-loss': (7, 1), 'completion-ack-loss': (7, 1), 'checkpoint-restart': (10, 2), 'chain-checkpoint-restart': (12, 3), 'framework-error': (0, 1), 'future-cancel': (0, 0), 'admission-ack-loss': (0, 0), 'reader': (0, 0), 'declared-error': (0, 0)}
    assert {c['case'] for c in generic['cases']} == set(expected_values)
    for case in generic['cases']:
        value, calls = expected_values[case['case']]
        assert case['snapshot']['value'] == value and case['events'].count('remote-handler') == calls
        if case['case'] == 'declared-error':
            assert case['events'].count('remote-declared-handler') == 1
    running = load('greenfinal5-running-raw/receipt.json')
    assert {c['case'] for c in running['cases']} == {'running-writer','running-reader','running-readers-two','running-cancel-ack-loss','running-after-store','running-cancel-drop'}
    for case in running['cases']:
        assert case['snapshot']['value'] == (10 if case['case']=='running-after-store' else 3)
        assert 'ordinary-body-escaped' not in case['events']
        assert case['events'].count('remote-handler') == (1 if case['case'] in ['running-reader','running-readers-two'] else 2)
        if case['case']=='running-readers-two':
            assert case['events'].count('ordinary-reader-entered')==case['events'].count('ordinary-reader-retired')==2
        if case['case']!='running-after-store':
            assert ('ordinary-reader-retired' if case['case'] in ['running-reader','running-readers-two'] else 'ordinary-writer-retired') in case['events']
    mutant_results = []
    for mutant in qualification['mutants']['mutants']:
        prefix = 'mutant-' + mutant['name'] + '/'
        assert mutant['accepted_red'] and mutant['parent_commit']=='837c7e1f6ad1a50408b1ef41424d768759249f09'
        inputs=load(prefix+'source-inputs.json')
        differences=sorted(k for k in set(inputs['green'])|set(inputs['mutant']) if inputs['green'].get(k)!=inputs['mutant'].get(k))
        assert differences==inputs['differences']==mutant['source_differences']==sorted('reboot/rust/'+c['relative'] for c in mutant['changes'])
        assert all(manifest['source/'+k]==v for k,v in inputs['green'].items())
        for change in mutant['changes']:
            relative=change['relative'];key=relative.replace('/','-')
            green=contents[prefix+key+'.green'];parent=contents[prefix+key+'.parent']
            assert green==(repo/'reboot/rust'/relative).read_bytes()
            actual_parent=subprocess.check_output(['git','show',mutant['parent_commit']+':reboot/rust/'+relative],cwd=repo)
            assert parent==actual_parent and sha(parent)==change['parent_sha256'] and sha(green)==change['green_sha256']
            patch=''.join(difflib.unified_diff(green.decode().splitlines(True),parent.decode().splitlines(True),fromfile='green/'+relative,tofile='parent/'+relative)).encode()
            assert patch==contents[prefix+key+'.diff'] and sha(patch)==change['diff_sha256']
        for case in mutant['cases']:
            raw=load(prefix+case['case']+'-raw/receipt.json')
            assert case['accepted_red'] and not raw['complete'] and raw['error']=='FutureTimeoutError()' and raw['all_original_children_waited']
            assert raw['binary_sha256']==mutant['binary_sha256']
            assert all(c['waited_by_parent'] for c in raw['children']) and len(raw['children'])==case['original_waits']
        mutant_results.append(dict(name=mutant['name'],exact_parent_source=True,source_differences=differences,native_red_cases=[c['case'] for c in mutant['cases']]))
    for fault in ['error', 'signal']:
        raw = load(f'greenfinal5-parent-{fault}-raw/receipt.json')
        assert not raw['complete'] and raw['all_original_children_waited']
        assert all(c['waited_by_parent'] for c in raw['children'])
        assert {'application', 'database'} <= {c['role'] for c in raw['children']}
        assert ('injected generic parent failure' if fault == 'error' else 'native lifecycle parent termination') in raw['error']
    for stage, owner in qualification['owners'].items():
        assert 'MainPID=0' in owner['systemd'] and 'ActiveState=inactive' in owner['systemd'] and 'Result=success' in owner['systemd']
    print(json.dumps({'verified': True, 'verified_at': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'archive_sha256': receipt['archive_sha256'], 'archive_bytes': receipt['bytes'], 'members_verified': len(members), 'local_source_inputs_verified': local_sources, 'archived_source_objects_verified': qualification['source_object_count'], 'native_cases': cases, 'original_native_child_waits': waits, 'all_targets': qualification['all_targets'], 'native_red_mutants': mutant_results, 'all_original_children_retired': True, 'native_cpp_reused': True, 'large_executables_included': False}, indent=2))
