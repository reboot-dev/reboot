"""Read-only verification of the complete original-root intent proof archive."""
import hashlib,json,pathlib,re,subprocess,sys,tarfile
archive,manifest,repo=map(pathlib.Path,sys.argv[1:4])
stage=sys.argv[4] if len(sys.argv)>4 else 'timestamp12'
assert re.fullmatch(r'[A-Za-z0-9_-]+',stage)
ledger=json.loads(manifest.read_text());assert archive.stat().st_size==ledger['archive_bytes']
h=hashlib.sha256()
with archive.open('rb') as data:
 while block:=data.read(1024*1024):h.update(block)
assert h.hexdigest()==ledger['archive_sha256']
expected={r['path']:r for r in ledger['files']};assert len(expected)==ledger['members']
source_paths={r['source'] for r in ledger['files']}
def assert_storage(proof):
 for child in proof['children']:
  if child.get('role')=='database':
   prefix=child['args'][1]+'/'
   assert prefix+'CURRENT' in source_paths,prefix
   assert any(p.startswith(prefix+'MANIFEST-') for p in source_paths),prefix
seen={};retained={}
with tarfile.open(archive,'r|xz') as stream:
 for member in stream:
  assert member.name in expected and member.name not in seen
  row=expected[member.name];assert member.mode==row['mode']
  if member.islnk():
   assert member.linkname in seen and row['hardlink']==member.linkname
   size,sha=seen[member.linkname]
   if member.linkname in retained:retained[member.name]=retained[member.linkname]
  else:
   assert member.isfile();data=stream.extractfile(member);h=hashlib.sha256();size=0;parts=[]
   keep=member.size<3*1024*1024 and member.name.endswith(('.json','.log','.py','.rs'))
   while block:=data.read(1024*1024):
    h.update(block);size+=len(block)
    if keep:parts.append(block)
   sha=h.hexdigest()
   if keep:retained[member.name]=b''.join(parts)
  assert (size,sha)==(row['bytes'],row['sha256']),(member.name,size,sha)
  seen[member.name]=(size,sha)
assert set(seen)==set(expected)
def load(path):return json.loads(retained['evidence/'+path])
# Source verification uses Git objects, not working-tree materialization.
owner=load(stage+'/owner.json');revision=owner['source_commit'];assert owner['complete'] and owner['source_unchanged']
parent=load(stage+'-parent.json')
assert parent['owner_waited'] and parent['owner_wait_returncode']==0 and parent['owner_pid']==owner['owner_pid']
assert all(c['waited_by_owner'] and c['exit']==c['expected'] for c in owner['children'])
postflight=load(stage+'-postflight.json')
assert postflight['complete'] and postflight['four_locks_available']
for name,sha in owner['source_inputs'].items():
 data=subprocess.check_output(['git','-C',str(repo),'show',revision+':'+name]);assert hashlib.sha256(data).hexdigest()==sha,name
 assert seen['evidence/source-objects/'+sha][1]==sha
parents=[p for p in expected if re.fullmatch(r'evidence/[^/]+-parent.json',p)]
for name in parents:
 row=json.loads(retained[name]);assert row['owner_waited']
for name in [p for p in expected if re.fullmatch(r'evidence/[^/]+/owner.json',p)]:
 row=json.loads(retained[name]);assert row['children'] and all(c['waited_by_owner'] for c in row['children'])
 for child in row['children']:
  log=name.rsplit('/',1)[0]+'/'+child['name']+'.log'
  assert seen[log][1]==child['log_sha256'],log
for name in [p for p in expected if p.endswith('-raw/receipt.json')]:
 row=json.loads(retained[name]);assert row['children'] and all(c['waited_by_parent'] for c in row['children']),name
positive=[]
for lang in ['mixed','pure']:
 row=load(stage+'/'+lang+'-focused-raw/receipt.json');assert row['complete'] and len(row['cases'])==6
 assert_storage(row)
 assert seen['evidence/'+stage+'/'+lang+'-binding/app'][1]==row['binary_sha256']
 assert seen['native/database'][1]==row['database_sha256']
 inputs=load(stage+'/'+lang+'-binding/inputs.json')
 assert inputs['application']['sha256']==row['binary_sha256']
 for item in inputs.values():
  size,sha=seen['evidence/'+stage+'/'+lang+'-binding/objects/'+item['sha256']]
  assert (size,sha)==(item['bytes'],item['sha256'])
 assert all(c['waited_by_parent'] for c in row['children'])
 positive += [(lang,c['case']) for c in row['cases']]
 roots=row['root_binding_restarts'][0];assert roots['original_root']==roots['recovered_root'] and roots['before']==roots['recovered']
 child=row['child_ack_root_intents'][0];assert child['retained']==child['after_replay'] and len(child['intent']['members'])==1
 remote=row['remote_intent_restarts'][0];assert remote['before']==remote['final'] and remote['original']==remote['recovered']
regression_executions=0
if 'evidence/regression13/owner.json' in expected:
 regression=load('regression13/owner.json');rp=load('regression13-parent.json')
 assert regression['complete'] and regression['source_unchanged'] and regression['source_commit']==revision
 assert regression['source_inputs']==owner['source_inputs']
 assert rp['owner_waited'] and rp['owner_wait_returncode']==0 and rp['owner_pid']==regression['owner_pid']
 assert load('regression13-postflight.json')['four_locks_available']
 for label,count,lang in [('mixed-remote',14,'mixed'),('pure-remote',14,'pure'),('transaction',7,'mixed')]:
  proof=load('regression13/'+label+'-raw/receipt.json')
  assert proof['complete'] and len(proof['cases'])==count
  assert_storage(proof)
  assert proof['binary_sha256']==seen['evidence/'+stage+'/'+lang+'-binding/app'][1]
  assert proof['database_sha256']==seen['native/database'][1]
  regression_executions+=count
red=load('red-root/mixed-focused-raw/receipt.json');assert not red['complete']
roots=red['root_binding_restarts'][0];assert roots['original_root']!=roots['recovered_root'] and roots['before']!=roots['recovered']
red_member=load('red-member/mixed-focused-raw/receipt.json');assert not red_member['complete'] and 'failure_snapshot' in red_member
for name in ['red-root','red-member']:
 mutation=load(name+'-mutation.json');assert mutation['source_commit']=='be968379a4db4f60156d8950a4441dd731bc92cc'
 mutant=load(name+'/owner.json');fixed=load('final6/owner.json')
 diffs={p for p in mutant['source_inputs'] if mutant['source_inputs'][p]!=fixed['source_inputs'][p]};assert diffs=={mutation['path']},diffs
 assert mutant['source_inputs'][mutation['path']]==mutation['mutant_sha256']
# The replay-cleanup fix changes runtime/generator bytes but NOT acceptance topology.
previous=load('final6/owner.json')
for name,sha in previous['source_inputs'].items():
 if name.startswith('reboot/rust/tests/fixtures/workflow_app/'):
  assert owner['source_inputs'][name]==sha,('negative-control topology changed',name)
sdk_log=retained['evidence/'+stage+'/all-targets.log'].decode()
if stage=='timestamp12':
 for test in ['nonzero_host_timestamps_refuse_before_intent_store','unversioned_intent_refuses_without_replacement_factory_or_write','arbitrary_root_context_cannot_certify_zero_timestamp_intent']:
  assert 'test runtime::canonical_root_attempt_tests::'+test+' ... ok' in sdk_log,test
 assert len(re.findall(r'test runtime::canonical_root_attempt_tests::[^\n]+ \.\.\. ok',sdk_log))==8
results=[]
for match in re.finditer(r'test result: ok\. (\d+) passed; (\d+) failed; (\d+) ignored;',retained['evidence/'+stage+'/all-targets.log'].decode()):
 results.append(tuple(map(int,match.groups())))
assert results and not sum(r[1] for r in results)
summary=dict(complete=True,archive_sha256=ledger['archive_sha256'],members=len(seen),frozen_inputs=len(owner['source_inputs']),tested_runtime=revision,opted_positive_executions=len(positive),current_regression_executions=regression_executions,sdk_pass_executions=sum(r[0] for r in results),sdk_ignored=sum(r[2] for r in results),historical_negative_controls=2,final_runtime_negative_controls=0,negative_control_runtime='be968379a4db4f60156d8950a4441dd731bc92cc',terminal_abort_convergence=False,automatic_startup_membership_recovery=False)
print(json.dumps(summary,indent=2))
