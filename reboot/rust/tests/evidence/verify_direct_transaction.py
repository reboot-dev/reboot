#!/usr/bin/env python3
"""Read-only off-host source, native-ledger and artifact verification."""
import hashlib,json,re,sys,tarfile
from pathlib import Path

def verify(archive, local=None):
 with tarfile.open(archive,'r:gz') as tar:
  members={m.name:m for m in tar.getmembers()}
  assert len(members)==len(tar.getmembers())
  assert all(m.isfile() and not m.name.startswith('/') and '..' not in Path(m.name).parts for m in members.values())
  def data(name):return tar.extractfile(members[name]).read()
  def js(name):return json.loads(data(name))
  hashes=js('archive-file-hashes.json');assert set(hashes)==set(members)-{'archive-file-hashes.json'}
  for name,wanted in hashes.items():
   h=hashlib.sha256()
   with tar.extractfile(members[name]) as f:
    for part in iter(lambda:f.read(1024*1024),b''):h.update(part)
   assert h.hexdigest()==wanted,name
  q=js('qualification.json');assert q['complete'] and q['source_commit'] and not q['fresh_cpp_build']
  owner=js(q['final_run']+'/owner.json')
  assert owner['complete'] and owner['source_unchanged'] and owner['children']
  assert q['source_commit']==owner['source_commit']
  assert all(c['waited_by_owner'] and c['exit']==c['expected'] and hashes[q['final_run']+'/'+c['name']+'.log']==c['log_sha256'] for c in owner['children'])
  manifest=js('complete-source-inputs.json');checked=0
  for name,h in manifest.items():
   assert hashes['source-objects/'+h]==h,name
   if local and name.startswith('source/'):
    p=Path(local)/name.removeprefix('source/')
    if p.is_file():assert hashlib.sha256(p.read_bytes()).hexdigest()==h,name;checked+=1
  for rel,h in owner['source_inputs'].items():assert manifest['source/'+rel]==h,rel
  for label,artifact in q['artifacts'].items():assert manifest['artifact/'+label]==artifact['sha256']
  assert q['artifacts']['database']['sha256']=='619002c569e9841144a8bbedf4f2ce6a753bb0e6b103af71883d91d43f413803'
  receipts=[]
  for name in members:
   if re.fullmatch(re.escape(q['final_run'])+r'/[^/]+-raw/receipt.json',name):
    d=js(name);assert d['children'] and d['all_original_children_waited']
    assert all(c['waited_by_parent'] and c['parent_pid']==d['parent_pid'] for c in d['children'])
    receipts.append((name,d))
  assert len(receipts)==q['native_receipts']
  assert sum(len(d['children']) for _,d in receipts)==q['original_driver_child_waits']
  positive=sum(len(d.get('cases',[])) for _,d in receipts if d['complete']);assert positive==q['native_positive_cases']
  direct=next(d for n,d in receipts if n.endswith('/direct-raw/receipt.json'))
  assert direct['complete'] and len(direct['cases'])==9
  assert {c['case'] for c in direct['cases']}=={'success','scheduled','cancel','replay','ack-restart','target-ack-loss','authorization-reject','running-cancel','rollback'}
  assert direct['actual_target_ack_loss']['actual_target_ack']
  for c in direct['cases']:
   if c['case'] not in ['cancel','replay']:
    assert len(c['final']['source_checkpoints'])==1
  assert direct['binary_sha256']==q['artifacts']['final-app']['sha256']
  for n,d in receipts:
   if d['complete']:assert d['binary_sha256']==q['artifacts']['final-app']['sha256'],n
  admission=next(d for n,d in receipts if n.endswith('/old-admission-raw/receipt.json'))
  assert not admission['complete']
  assert any(b'canonical task admission is unsupported by transaction adapters' in data(str(Path(q['final_run'])/'old-admission-raw'/Path(c['log']).name)) for c in admission['children'])
  replay=next(d for n,d in receipts if n.endswith('/skip-replay-raw/receipt.json'))
  assert not replay['complete'] and replay['failure_snapshot']['values']==[17,17]
  for name in ['parent-error','parent-signal']:
   d=next(d for n,d in receipts if n.endswith('/'+name+'-raw/receipt.json'));assert not d['complete'] and d['error']
  mutation=js('mutations.json')
  for name,d in mutation.items():
   before=data('source-objects/'+d['original_sha256']);after=data('source-objects/'+d['modified_sha256']);assert before!=after
   assert manifest['source/reboot/rust/src/codegen.rs']==d['original_sha256']
  assert b'transaction_task_schedule_guard(flow.runtime_module)' in data('source-objects/'+mutation['old-admission-fence']['modified_sha256'])
  assert b'automatic_idempotency.as_ref().filter(|_| false)' in data('source-objects/'+mutation['skip-target-receipt-replay']['modified_sha256'])
  for gate,key in [('all-targets','sdk'),('doctests','doctests'),('fixture-tests','consumer')]:
   rows=re.findall(rb'test result: ok\. (\d+) passed; (\d+) failed; (\d+) ignored;',data(q['final_run']+'/'+gate+'.log'))
   assert rows and all(int(f)==0 for _,f,_ in rows)
   result=dict(passed=sum(int(p) for p,_,_ in rows),ignored=sum(int(i) for _,_,i in rows));assert result==q[key]
  retirement=js('retirement.json');assert retirement['four_cache_locks_acquired'] and retirement['all_receipt_children_absent'] and retirement['owner_proc_absent']
  assert 'MainPID=0' in retirement['unit'] and 'ActiveState=inactive' in retirement['unit'] and 'Result=success' in retirement['unit']
  return dict(accepted=True,native_positive_cases=positive,native_receipts=len(receipts),original_driver_child_waits=q['original_driver_child_waits'],sdk=q['sdk'],doctests=q['doctests'],consumer=q['consumer'],local_source_inputs_checked=checked,source_commit=q['source_commit'],source_objects=q['source_objects'],retained_artifacts=len(q['artifacts']),archive_members=len(members))
if __name__=='__main__':
 print(json.dumps(verify(sys.argv[1],Path(__file__).resolve().parents[4]),indent=2))
