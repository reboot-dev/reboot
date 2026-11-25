"""Read-only byte/custody/native-authority verification; stdlib only.
Usage: python3 verify_remote_terminal_recovery.py ARCHIVE MANIFEST [CHECKOUT]
Acceptance applies to the bounded post-handoff seam, NOT full task convergence.
"""
import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys
import tarfile
from verify_remote_child_p1 import wire

BASE = 'home/benchbuild/.cache/remote-authority-recovery-20261021-evidence/'
DATABASE = 'home/benchbuild/.cache/hello-image-evidence/rust-context/database'
QUALIFIED = {
 'final1': ['all-targets','sdk-clippy','doctests','mixed-build','mixed-capture','mixed-clippy','mixed-consumer-tests','mixed-remote','mixed-authority','mixed-direct'],
 'final2': ['mixed-declared','mixed-successor','mixed-successor-abort','pure-build','pure-capture','pure-clippy','pure-consumer-tests'],
 'final3': ['pure-remote','pure-authority','pure-direct','pure-declared','pure-successor','pure-successor-abort'],
 'drills': ['parent-error','parent-signal'],
 'red1': ['mixed-build','mixed-capture','commit-red','abort-red'],
}

def verify(archive, manifest, checkout=None):
 m = json.loads(manifest.read_text())
 assert m['source_commit'] == 'b12ec0965eb1e9afd766a5db5fe14613d47e5a19'
 assert m['all_failed_executables_retained'] and not m['fresh_cpp_build']
 assert archive.stat().st_size == m['archive_bytes']
 with archive.open('rb') as f: assert hashlib.file_digest(f,'sha256').hexdigest() == m['archive_sha256']
 expected={r['archive_path']:r for r in m['files']};assert len(expected)==len(m['files'])
 seen,bodies={},{}
 with tarfile.open(archive,'r|gz') as tar:
  for e in tar:
   assert e.name not in seen
   r=expected[e.name]
   if e.islnk():
    digest,size=seen[e.linkname]
    if e.linkname in bodies:bodies[e.name]=bodies[e.linkname]
   else:
    assert e.isfile();h=hashlib.sha256();size=0;parts=[];retain=e.size<12*1024*1024
    f=tar.extractfile(e);assert f is not None
    for chunk in iter(lambda:f.read(1024*1024),b''):
     h.update(chunk);size+=len(chunk)
     if retain:parts.append(chunk)
    digest=h.hexdigest()
    if retain:bodies[e.name]=b''.join(parts)
   assert (digest,size)==(r['sha256'],r['bytes']),e.name
   assert e.mode&0o777 == r['mode'],e.name
   seen[e.name]=(digest,size)
 assert set(seen)==set(expected)
 def record(rel):return json.loads(bodies[BASE+rel])
 gates=[];sources={}
 for stage,names in QUALIFIED.items():
  owner=record(stage+'/owner.json');parent=record(stage+'-parent.json')
  assert owner['four_locks'] and owner['source_unchanged'] and owner['children']
  assert parent['owner_waited'] and parent['owner_pid']==owner['owner_pid']
  assert all(c['waited_by_owner'] for c in owner['children'])
  selected=[c for c in owner['children'] if c['name'] in names]
  assert {c['name'] for c in selected}==set(names)
  for c in selected:
   assert c['exit']==c['expected']
   assert seen[BASE+stage+'/'+c['name']+'.log'][0]==c['log_sha256']
   gates.append((stage,c['name'],c['exit']))
  sources[stage]=owner['source_inputs']
  for rel,h in owner['source_inputs'].items():assert seen[BASE+'source-objects/'+h][0]==h
 green=sources['final1']
 assert green==sources['final2']==sources['final3']==sources['drills']
 assert green.keys()==sources['red1'].keys()
 assert [r for r in green if green[r]!=sources['red1'][r]]==['reboot/rust/src/durable_coordinator.rs']
 mutation=record('mutation.json')
 assert mutation['red_sha256']==sources['red1'][mutation['file']]
 assert mutation['green_sha256']==green[mutation['file']]
 if checkout:
  base_bytes=subprocess.check_output(['git','-C',str(checkout),'show','048223cf764ed19f0cca7bdbcace5aaecd013dce:reboot/rust/src/durable_coordinator.rs'])
  assert hashlib.sha256(base_bytes).hexdigest()==mutation['red_sha256']
  for rel,h in green.items():
   p=checkout/rel
   data=p.read_bytes() if p.is_file() else subprocess.check_output(['git','-C',str(checkout),'show','HEAD:'+rel])
   assert hashlib.sha256(data).hexdigest()==h,rel
 hashes={}
 for stage,mode in [('red1','mixed'),('final1','mixed'),('final2','pure')]:
  binding=record(stage+'/'+mode+'-binding/inputs.json')
  for value in binding.values():
   assert seen[BASE+stage+'/'+mode+'-binding/objects/'+value['sha256']]==(value['sha256'],value['bytes'])
  assert seen[BASE+stage+'/'+mode+'-binding/app'][0]==binding['application']['sha256']
  hashes[mode if stage!='red1' else 'base-coordinator-mixed']=binding['application']['sha256']
 joins=0;positive=[];drivers=[]
 for stage in QUALIFIED:
  for name in QUALIFIED[stage]:
   path=BASE+stage+'/'+name+'-raw/receipt.json'
   if path not in bodies:continue
   d=json.loads(bodies[path]);drivers.append((stage,name));assert d['children'] and d['all_original_children_waited']
   assert d['database_sha256']==seen[DATABASE][0] and not d['fresh_cpp_build']
   assert all(c['waited_by_parent'] for c in d['children'])
   joins+=len(d['children'])
   for c in d['children']:
    assert c['parent_pid']==d['parent_pid']
    assert c['log'].lstrip('/') in seen
   if name in ['commit-red','abort-red']:
    assert not d['complete']
    a=d['authority_attempts'][-1];r=a['readback'];root=r['root_transaction_id']
    assert len(r['coordinators'])==1 and r['coordinators'][0]['root_transaction_id']==root
    outcome=1 if name=='commit-red' else 2
    assert wire(wire(bytes.fromhex(r['decision']))[1][0])[2]==[outcome]
    denied=[json.loads(x) for x in a['denied_decisions'].splitlines()]
    assert denied and all(wire(bytes.fromhex(x['request']))[1][0].hex()==root.replace('-','') for x in denied)
    t=wire(bytes.fromhex(r['state'][0]['tasks'][0]));assert t[3]==[1] and 6 not in t and 9 not in t
    assert [s['value'] for s in r['state']]==([7,7] if outcome==1 else [0,0])
   elif name.startswith('parent-'):
    assert not d['complete'] and not d['cases']
   else:
    assert d['complete']
    mode='pure' if name.startswith('pure-') else 'mixed'
    assert d['binary_sha256']==hashes[mode]
    for case in d['cases']:
     positive.append((name.split('-',1)[1],case['case'],mode))
     if name.endswith('-authority'):
      r=case['recovered'];f=case['final'];commit=case['case']=='authority-commit-ack-loss'
      assert r['root_transaction_id']==case['original_root_transaction_id']
      assert r['decision']==case['lost_ack']['decision'] and r['coordinators']==[]
      assert [s['value'] for s in r['state']]==([7,7] if commit else [0,0])
      assert not any(s['participants'] for s in r['state'])
      t=wire(bytes.fromhex(f['state'][0]['tasks'][0]))
      assert t[3]==([2] if commit else [1])
      if commit:
       any_=wire(t[6][0]);assert any_[1]==[b'type.googleapis.com/workflow.v1.Value']
       assert wire(any_[2][0])[1]==[7]
      else:assert 6 not in t and 9 not in t and len(f['state'][0]['pending'])==1 and not f['state'][1]['pending']
      assert case['events'].count('transaction-apply')==1 and case['events'].count('transaction-child')==1
     if name.endswith('-remote'):
      t=wire(bytes.fromhex(case['final'][0]['tasks'][0]))
      if case['case']=='child-ack-loss':assert t[3]==[1] and 6 not in t and 9 not in t
      else:
       assert t[3]==[2] and (6 in t)!=(9 in t)
       if 9 in t:
        any_=wire(t[9][0]);assert any_[1]==[b'type.googleapis.com/google.rpc.Status']
        status=wire(any_[2][0]);assert status[1]==[10]
        detail=wire(status[3][0]);assert detail[1]==[b'type.googleapis.com/workflow.v1.BelowThreshold']
        assert wire(detail[2][0])=={1:[4242],2:[7]}
 post=record('postflight.json');assert post['four_locks_observed_available'] and all(post['pid_absence'].values())
 log=bodies[BASE+'final1/all-targets.log'].decode()
 results=[tuple(map(int,x)) for x in re.findall(r'test result: ok\. (\d+) passed; \d+ failed; (\d+) ignored;',log)]
 return dict(bounded_seam_acceptance=True,full_pre_handoff_task_convergence=False,
  archive_sha256=m['archive_sha256'],verified_members=len(seen),source_inputs=len(green),qualified_owner_gates=len(gates),
  qualified_native_driver_count=len(drivers),qualified_original_child_waits=joins,
  positive_native_case_executions=len(positive),unique_native_scenario_paths=len({(a,b) for a,b,_ in positive}),
  positive_case_keys=positive,source_backed_reds=2,sdk_all_target_pass_executions=sum(a for a,_ in results),
  sdk_ignored_executions=sum(b for _,b in results),doctests=8,executable_hashes=hashes,
  aborted_original_native_attempt_resolved=True,aborted_source_task_terminal=False)

if __name__=='__main__':
 print(json.dumps(verify(Path(sys.argv[1]),Path(sys.argv[2]),Path(sys.argv[3]) if len(sys.argv)>3 else None),indent=2))
