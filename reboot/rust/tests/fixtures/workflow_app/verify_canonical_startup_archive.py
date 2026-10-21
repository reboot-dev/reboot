"""Read-only full-byte verification of canonical startup owner qualification.
Usage: python3 verify_canonical_startup_archive.py ARCHIVE MANIFEST SOURCE_GIT
No extraction, receipt repair, filtering of failures, or native execution.
"""
import hashlib,json,pathlib,re,subprocess,sys,tarfile
A,M,G=map(pathlib.Path,sys.argv[1:4]);manifest=json.loads(M.read_text())
def digest(p):
 h=hashlib.sha256()
 with p.open('rb') as f:
  while b:=f.read(1024*1024):h.update(b)
 return h.hexdigest()
assert A.stat().st_size==manifest['archive_bytes'] and digest(A)==manifest['archive_sha256']
rows={r['path']:r for r in manifest['files']};assert len(rows)==len(manifest['files'])==manifest['members']
seen={};small={}
with tarfile.open(A,'r|xz') as archive:
 for member in archive:
  assert member.name in rows and member.name not in seen
  assert not pathlib.PurePosixPath(member.name).is_absolute() and '..' not in pathlib.PurePosixPath(member.name).parts
  row=rows[member.name];assert member.mode==row['mode']
  if member.issym():
   assert member.linkname==row['symlink'] and hashlib.sha256(member.linkname.encode()).hexdigest()==row['sha256']
  elif member.islnk():
   assert member.linkname==row['hardlink'] and member.linkname in seen
   original=seen[member.linkname]
   assert (original['sha256'],original['bytes'],original['mode'])==(row['sha256'],row['bytes'],row['mode'])
   if member.linkname in small:small[member.name]=small[member.linkname]
  else:
   assert member.isfile() and member.size==row['bytes'];h=hashlib.sha256();data=[];retain=row['bytes']<8*1024*1024
   f=archive.extractfile(member);assert f is not None
   while b:=f.read(1024*1024):
    h.update(b)
    if retain:data.append(b)
   assert h.hexdigest()==row['sha256'],member.name
   if retain:small[member.name]=b''.join(data)
  seen[member.name]=row
assert set(seen)==set(rows)
def blob(p):return small[p]
def obj(p):return json.loads(blob(p))
def git(rev,p):return subprocess.check_output(['git','--git-dir='+str(G),'show',rev+':'+p])
base=obj('evidence/local-git-inputs.json');commit=base['commit'];assert len(base['inputs'])==501
for p,h in base['inputs'].items():
 assert hashlib.sha256(git(commit,p)).hexdigest()==h,p
 assert rows['source/'+p]['sha256']==h,p
batch=obj('evidence/final-batch.json');assert not batch['complete'] and batch['source_restored']
for c in batch['children']:assert c['waited'] and c['exit']==(1 if c['stage']=='restored8' else 0)
assert obj('evidence/restore9-resume.json')['source_unchanged']
# Retain failed harness/compiler attempts as failures, and independently check
# every original wait ledger, not just successful final stage totals.
all_owners={}
for path in rows:
 parts=path.split('/')
 if len(parts)==3 and parts[0]=='evidence' and parts[2]=='owner.json':
  r=obj(path);all_owners[parts[1]]=r
  for child in r['children']:
   assert child['waited_by_owner']
   assert rows['evidence/'+parts[1]+'/'+child['name']+'.log']['sha256']==child['log_sha256']
  parent=obj('evidence/'+parts[1]+'-parent.json')
  assert parent['owner_pid']==r['owner_pid'] and parent['owner_waited']
  assert (parent['owner_wait_returncode']==0)==bool(r['complete'])
 if len(parts)==4 and parts[0]=='evidence' and parts[2].endswith('-raw') and parts[3]=='receipt.json':
  r=obj(path);assert r['all_original_children_waited']
  for child in r['children']:assert child['waited_by_parent']
stages=['focused5','red-admission6','red-claim7','restored8','restored10'];owners={}
for stage in stages:
 r=obj('evidence/'+stage+'/owner.json');owners[stage]=r
 assert r['complete']==(stage!='restored8') and r['source_unchanged'] and r['four_locks']
 parent=obj('evidence/'+stage+'-parent.json');assert parent['owner_waited'] and parent['owner_wait_returncode']==(1 if stage=='restored8' else 0)
 post=obj('evidence/'+('restored10' if stage=='restored8' else stage)+'-postflight.json');assert post['complete'] and post['four_locks_available'] and post['available_bytes']>8589934592
 for c in r['children']:
  assert c['waited_by_owner']
  if stage=='restored8' and c['name']=='pure-startup':
   assert c is r['children'][-1] and c['exit']==1 and b'AddrInUse' in blob('evidence/restored8/pure-startup.log')
  else:assert c['exit']==c['expected']
  assert rows['evidence/'+stage+'/'+c['name']+'.log']['sha256']==c['log_sha256']
 for p,h in r['source_inputs'].items():assert rows['evidence/source-objects/'+h]['sha256']==h
 assert set(r['source_inputs'])==set(base['inputs'])
 if stage not in ['red-admission6','red-claim7']:assert r['source_inputs']==base['inputs']
# Decode fields directly from retained canonical protobuf bytes, independently
# of the fixture's projected JSON or generated descriptor inspector.
def wire(data):
 def number(i):
  value=shift=0
  while True:
   x=data[i];i+=1;value|=(x&127)<<shift
   if not x&128:return value,i
   shift+=7;assert shift<70
 fields={};i=0
 while i<len(data):
  key,i=number(i);tag,kind=key>>3,key&7
  if kind==0:value,i=number(i)
  elif kind==2:n,i=number(i);value=data[i:i+n];i+=n;assert len(value)==n
  else:raise AssertionError(('unsupported inspection wire type',kind))
  fields.setdefault(tag,[]).append(value)
 return fields
DOMAIN=b'reboot.canonical.root-attempt.v1\0'
def intent_from_snapshot(snapshot):
 found=[]
 for raw in snapshot[0]['receipts']:
  mutation=wire(bytes.fromhex(raw))
  if mutation.get(8,[b''])[0].startswith(DOMAIN):found.append(wire(mutation.get(2,[b''])[0]))
 assert len(found)==1
 f=found[0];assert f.get(6)==[1] and len(f[1][0])==16 and len(f[7][0])==16
 import uuid
 root=uuid.UUID(bytes=f[1][0]);receipt=uuid.UUID(bytes=f[7][0]);assert root.int and receipt.int
 # Reconstruct the exact Rust UUID-v5 domain, without its runtime helper.
 mutation=next(wire(bytes.fromhex(raw)) for raw in snapshot[0]['receipts'] if wire(bytes.fromhex(raw)).get(8,[b''])[0].startswith(DOMAIN))
 assert len(mutation[8][0])==len(DOMAIN)+32 and 3 not in mutation and 6 not in mutation and 7 not in mutation
 def v5(namespace,name):return uuid.UUID(bytes=hashlib.sha1(namespace.bytes+name).digest()[:16],version=5)
 identity=str(len(mutation[4][0])).encode()+b':'+mutation[4][0]+b':'+mutation[5][0]
 assert mutation[1][0]==v5(v5(receipt,DOMAIN),identity).bytes
 source_task=wire(bytes.fromhex(snapshot[0]['tasks'][0]));task_id=wire(source_task[1][0]);assert f[2][0]==task_id[3][0]
 assert source_task.get(3)==[1] and 6 not in source_task and 9 not in source_task
 members=[wire(m) for m in f.get(4,[])];keys=[(m[1][0],m[2][0],m[3][0]) for m in members]
 assert len(keys)<=1024 and keys==sorted(set(keys)) and all(all(k) for k in keys)
 return f
for stage,oracle in [('red-admission6','startup ownership let normal writer escape'),('red-claim7','startup recovery claim missing from durable intent')]:
 mutation=obj('evidence/'+stage+'-mutation.json');path=mutation['file'];fixed=git(commit,path);mutant=fixed.decode().replace(mutation['old'],mutation['new']).encode()
 assert fixed.decode().count(mutation['old'])==1 and hashlib.sha256(fixed).hexdigest()==mutation['fixed_sha256'] and hashlib.sha256(mutant).hexdigest()==mutation['mutant_sha256']
 changed=[p for p,h in owners[stage]['source_inputs'].items() if h!=base['inputs'][p]];assert changed==[path]
 assert blob('evidence/source-objects/'+mutation['mutant_sha256'])==mutant
 log=blob('evidence/'+stage+'/mixed-startup.log').decode();assert oracle in log
 receipt=obj('evidence/'+stage+'/mixed-startup-raw/receipt.json');assert not receipt['complete'] and receipt['all_original_children_waited']
 if stage=='red-admission6':
  actual=receipt['startup_ownership'][-1]['durable'];assert [x['value'] for x in actual]==[1,1];f=intent_from_snapshot(actual);assert f.get(8)==[1]
 else:
  actual=receipt['startup_attempts'][-1]['native'];assert [x['value'] for x in actual]==[0,0];f=intent_from_snapshot(actual);assert 8 not in f
expected={'mixed-startup':4,'pure-startup':4,'mixed-focused':6,'pure-focused':6,'mixed-remote':14,'pure-remote':14,'legacy7':7}
case_executions=joins=0
for label,count in expected.items():
 stage='restored8' if label in ['mixed-startup','mixed-focused'] else 'restored10'
 receipt=obj('evidence/'+stage+'/'+label+'-raw/receipt.json');assert receipt['complete'] and receipt['all_original_children_waited']
 assert len(receipt['cases'])==count;case_executions+=count
 for child in receipt['children']:assert child['waited_by_parent'];joins+=1
 mode='pure' if label.startswith('pure') else 'mixed'
 assert receipt['binary_sha256']==rows['evidence/restored8/'+mode+'-binding/app']['sha256']
 assert receipt['database_sha256']==rows['native/database']['sha256']=='619002c569e9841144a8bbedf4f2ce6a753bb0e6b103af71883d91d43f413803'
 if label.endswith('startup'):
  assert {c['case'] for c in receipt['cases']}=={'startup-root-binding','startup-predispatch','startup-child-ack','startup-authority-abort'}
  for c in receipt['cases']:
   if c['case'] in ['startup-root-binding','startup-predispatch']:
    assert len(c['observations'])==2
    for observation in c['observations']:
     assert observation['writer_status']=='DEADLINE_EXCEEDED' and [x['value'] for x in observation['durable']]==[0,0]
     f=intent_from_snapshot(observation['durable']);assert f.get(8)==[1] and 9 not in f and observation['native_authority']==''
   elif c['case']=='startup-child-ack':
    assert len(c['restarts'])==2
    for restart in c['restarts']:
     f=intent_from_snapshot(restart['native']);assert f.get(8)==[1] and f.get(9)==[1]
     assert restart['authority']==c['native_original_authority'] and [x['value'] for x in restart['native']]==[0,0]
    response=wire(bytes.fromhex(c['native_original_authority']));decision=wire(response[1][0]);assert decision[2]==[2] and 3 not in decision
   else:
    f=intent_from_snapshot(c['recovered']['state']);assert f.get(8)==[1] and f.get(9)==[1]
    assert c['recovered']['decision']==c['lost_ack']['decision']
restored_matrix_executions=case_executions
for mode in ['mixed','pure']:
 receipt=obj('evidence/restored10/'+mode+'-commit-raw/receipt.json')
 assert receipt['complete'] and receipt['all_original_children_waited'] and len(receipt['cases'])==3
 assert {c['case'] for c in receipt['cases']}=={'success','ack-restart','target-ack-loss'}
 assert receipt['binary_sha256']==rows['evidence/restored8/'+mode+'-binding/app']['sha256']
 assert receipt['database_sha256']==rows['native/database']['sha256']
 for case in receipt['cases']:
  task=wire(bytes.fromhex(case['final'][0]['tasks'][0]));assert task.get(3)==[2] and 9 not in task
  response=wire(task[6][0]);assert response[1]==[b'type.googleapis.com/workflow.v1.Value'] and wire(response[2][0])[1]==[7]
 for child in receipt['children']:assert child['waited_by_parent'];joins+=1
 case_executions+=len(receipt['cases'])
# Exact generated binding files, executable modes, native RocksDB and all failed
# attempts are covered by full-member checks above, not omitted by case filtering.
assert any('root-rocksdb/CURRENT' in p for p in rows) and any('child-rocksdb/CURRENT' in p for p in rows)
assert any('root-rocksdb/MANIFEST-' in p for p in rows) and any('child-rocksdb/MANIFEST-' in p for p in rows)
logs=blob('evidence/restored8/all-targets.log').decode();results=[tuple(map(int,m)) for m in re.findall(r'test result: ok\. (\d+) passed; (\d+) failed; (\d+) ignored',logs)]
assert results and all(failed==0 for passed,failed,ignored in results)
for name in ['sdk-clippy','mixed-clippy','pure-clippy']:
 child=next(c for c in owners['restored8']['children'] if c['name']==name);assert '-D' in child['args'] and 'warnings' in child['args'] and child['exit']==0
print(json.dumps(dict(complete=True,archive_sha256=manifest['archive_sha256'],members=len(rows),source_commit=commit,frozen_inputs=len(base['inputs']),final_runtime_causal_RED=2,restored_matrix_executions=restored_matrix_executions,additional_opted_Commit_replay_executions=case_executions-restored_matrix_executions,final_native_case_executions=case_executions,final_driver_child_joins=joins,SDK_pass_executions=sum(p for p,f,i in results),SDK_ignored=sum(i for p,f,i in results),automatic_original_startup_admission=True,known_native_Abort_membership_retirement=True,unknown_authority='owned Pending',source_Abort_Task_bridge=False),indent=2))
