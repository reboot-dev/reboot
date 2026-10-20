"""Read-only verification of the frozen transaction foundation raw archive."""
import hashlib,json,re,sys,tarfile
from pathlib import Path
archive=Path(sys.argv[1]);local=Path(__file__).resolve().parents[4]
with tarfile.open(archive,'r:gz') as tar:
 members=[m for m in tar.getmembers() if m.isfile()];names=[m.name for m in members];assert len(names)==len(set(names))
 def raw(name):return tar.extractfile(name).read()
 def data(name):return json.loads(raw(name))
 file_hashes=data('archive-file-hashes.json');assert set(file_hashes)==set(names)-{'archive-file-hashes.json'}
 for name,sha in file_hashes.items():assert hashlib.sha256(raw(name)).hexdigest()==sha,name
 q=data('final4/qualification.json');g=data('final4/green-gates.json');assert q['complete'] and g['complete'] and g['source_unchanged'];assert all(x['accepted'] and x['waited_by_original_parent'] for x in g['gates'])
 for gate in g['gates']:assert hashlib.sha256(raw('final4/green-'+gate['name']+'.log')).hexdigest()==gate['log_sha256']
 expected={'success','concurrent-root','ack-restart','target-ack-loss','payload-reject','authorization-reject','rollback'}
 d=data('final4/native-transaction-raw/receipt.json');assert d['complete'];assert len(d['cases'])==len(expected) and {c['case'] for c in d['cases']}==expected
 for case in d['cases']:
  n=case['case'];v=0 if n=='rollback' else 7 if n=='success' else 10
  assert case['final']['value']==case['final']['leaf']==v
  assert len(case['final']['pending'])==(0 if n=='rollback' else 1 if n=='success' else 2)
 assert len(g['mutants'])==2
 red=next(m for m in g['mutants'] if m['name']=='skip-target-receipt-replay');assert red['failure_snapshot']['value']==red['failure_snapshot']['leaf']==17
 native_receipts=[]
 for name in names:
  if name.endswith('/receipt.json'):
   r=data(name);assert r['children'] and all(c['waited_by_parent'] for c in r['children']);native_receipts.append((name,len(r['children'])))
 assert sum(n for _,n in native_receipts)==q['all_retained_original_child_waits']
 inputs=data('final4/complete-source-inputs.json');checked_local=0
 for name,sha in inputs.items():
  assert hashlib.sha256(raw('source-objects/'+sha)).hexdigest()==sha
  if name.startswith('source/'):
   p=local/name.removeprefix('source/')
   if p.is_file():assert hashlib.sha256(p.read_bytes()).hexdigest()==sha,name;checked_local+=1
 for m in g['mutants']:
  prefix='final4/mutant-'+m['name']
  assert hashlib.sha256(raw(prefix+'/original.rs')).hexdigest()==m['original_sha256']
  assert hashlib.sha256(raw(prefix+'/modified.rs')).hexdigest()==m['modified_sha256']
  assert raw(prefix+'/mutation.diff')
 results=re.findall(r'test result: ok\. (\d+) passed; (\d+) failed; (\d+) ignored;',raw('final4/green-all-targets.log').decode())
 assert results and all(int(f)==0 for _,f,_ in results)
 retirement=data('final4-outer-retirement.json');assert retirement['owner_proc_absent'] and 'MainPID=0' in retirement['unit']
 assert not q['fresh_cpp_build']
 assert q['source_commit']=='50da3fe53a821d1c11b449e9e8c6bf4de24cdf21'
 assert q['gates']==g and q['owner']==data('final4.json')
 owner=q['owner'];assert owner['complete'] and owner['source_unchanged']
 assert owner['children']==[dict(pid=g['original_parent_pid'],waited_by_owner=True,wait_returncode=0)]
 expected_gates={'mutant-missing-root-receipt-binding-build','mutant-missing-root-receipt-binding','mutant-skip-target-receipt-replay-build','mutant-skip-target-receipt-replay','sdk-package-clean','fixture-build','all-targets','sdk-clippy','fixture-clippy','doctests','fixture-tests','native-transaction','parent-error','parent-signal','native-outbound','native-outbound-ack','native-canonical','native-generic'}
 assert len(g['gates'])==len(expected_gates) and {x['name'] for x in g['gates']}==expected_gates
 for gate in g['gates']:
  assert (gate['exit']==0 if gate['expected_exit']==0 else gate['exit']!=0)
 for label in ['native-transaction','parent-error','parent-signal']:
  r=data('final4/'+label+'-raw/receipt.json')
  assert r['parent_pid']==next(x['pid'] for x in g['gates'] if x['name']==label)
  assert r['binary_sha256']==g['binary_sha256'] and r['database_sha256']==q['database_sha256']
  if label!='native-transaction':assert not r['complete'] and not r['cases'] and r['all_original_children_waited']
 assert 'requested native original-parent error drill' in data('final4/parent-error-raw/receipt.json')['error']
 assert 'transaction proof parent terminated' in data('final4/parent-signal-raw/receipt.json')['error']
 missing=data('final4/mutant-missing-root-receipt-binding-raw/receipt.json')
 assert missing['failure_snapshot']['value']==missing['failure_snapshot']['leaf']==0
 assert 'transaction-apply' not in missing['failure_events']
 for mutant in g['mutants']:
  assert data('final4/mutant-'+mutant['name']+'-raw/receipt.json')['binary_sha256']==mutant['binary_sha256']
 failed=data('final1/green-gates.json');assert not failed['complete']
 assert next(x for x in failed['gates'] if x['name']=='fixture-clippy')['exit']==101
 failed2=data('final2/green-gates.json');assert not failed2['complete'] and failed2['source_unchanged']
 assert next(x for x in failed2['gates'] if x['name']=='native-outbound-ack')['exit']==1
 assert data('final2-retirement-before-final3.json')['all_receipt_children_absent']
 failed3=data('final3/green-gates.json');assert not failed3['complete'] and failed3['source_unchanged']
 assert next(x for x in failed3['gates'] if x['name']=='native-outbound-ack')['exit']==1
 assert data('final3-retirement-before-final4.json')['all_receipt_children_absent']
 assert b'left == right' in raw('final3/green-native-outbound-ack.log')
 old=data('final2/green-source-inputs.json');current=data('final4/green-source-inputs.json')
 changed={k for k in set(old)|set(current) if old.get(k)!=current.get(k)}
 assert changed=={'reboot/rust/tests/fixtures/workflow_app/src/crosspath.rs'},changed
 assert hashlib.sha256(raw('final2-crosspath-original.rs')).hexdigest()==old[next(iter(changed))]
 for name,sha in data('final2-failed-file-hashes.json').items():
  if name in names:assert hashlib.sha256(raw(name)).hexdigest()==sha,name
 custody=data('final4-custody-readback.json');assert custody['cache_locks_acquired'] and custody['all_gate_pids_absent'] and all(r['all_absent'] for r in custody['receipts'])
 prior=data('prior-registration-custody/readback.json');assert sum(r['cases'] for r in prior['rows'])==70 and sum(r['waits'] for r in prior['rows'])==1761
 assert data('prior-retirement-final4.json')['owner_proc_absent']
 deadline=data('deadline-drill.json');assert deadline['complete'] and deadline['real_wait_timeout'] and deadline['waited_by_original_parent'] and deadline['wait_returncode']==1 and deadline['all_original_grandchildren_absent']
 dr=data('deadline-raw/receipt.json');assert dr['parent_pid']==deadline['child_pid'] and not dr['complete'] and dr['all_original_children_waited']
 assert dr['binary_sha256']==g['binary_sha256'] and dr['database_sha256']==q['database_sha256']
 assert hashlib.sha256(raw('final4/complete-source-inputs.json')).hexdigest()==q['manifest_sha256']
 print(json.dumps(dict(accepted=True,archive_sha256=hashlib.sha256(archive.read_bytes()).hexdigest(),archive_bytes=archive.stat().st_size,archive_files=len(members),native_transaction_cases=len(d['cases']),retained_native_receipts=len(native_receipts),retained_original_child_waits=sum(n for _,n in native_receipts),source_inputs=len(inputs),locally_checked_inputs=checked_local,sdk_all_targets_passed=sum(int(p) for p,_,_ in results),sdk_all_targets_ignored=sum(int(i) for _,_,i in results),mutants=2,source_commit=q['source_commit'],fresh_cpp_build=False),indent=2))
