"""Finite review execution; existing exact-ID owner is a waited child, not a daemon."""
import subprocess,json,time,uuid,sys,traceback,hashlib,shutil,os
from pathlib import Path
R=Path('/home/benchbuild/.cache/hello-image-review-src')
P=R/'reboot/rust/tests/fixtures/reboot_examples/hello-constructors/image'
E=Path('/home/benchbuild/.cache/hello-image-evidence')
S=E/'stack-review-correction'
assert not S.exists()
# Freeze corrected sources separately; historical source/evidence remain untouched.
F=E/'review-correction-source-v1';F.mkdir(exist_ok=False)
for n in ['shared_probe.py','transcript_comparison.py','test_transcript_comparison.py','compose.review-correction.yaml']:
 shutil.copy2(P/n,F/n)
shutil.copy2(P/'ccx43/review_stack_owner.py',F/'review_stack_owner.py')
unit=subprocess.run([sys.executable,'-m','unittest','discover','-s',str(P),'-p','test_transcript_comparison.py','-v'],capture_output=True,text=True)
(F/'unit-tests.log').write_text(unit.stdout+unit.stderr);assert unit.returncode==0
pins=json.loads((E/'qualification-final.json').read_text())['images']
for image in pins:
 observed=json.loads(subprocess.check_output(['docker','image','inspect',image['id']],text=True))[0]
 assert observed['Id']==image['id']
# New compose uses original immutable image IDs, never a build/pull.
s=(P/'compose.review-correction.yaml').read_text()
for image in pins: s=s.replace(image['tags'][0],image['id'])
(P/'compose.review-correction.yaml').write_text(s);(F/'compose.review-correction.yaml').write_text(s)
owner_log=F/'owner-process.log'
result={'scope':'narrow image transcript comparator correction; not benchmark or full SDK parity','image_ids':[x['id'] for x in pins],'owner_exact_parent_wait':False}
with owner_log.open('w') as out:
 owner=subprocess.Popen([sys.executable,str(P/'ccx43/review_stack_owner.py')],stdout=out,stderr=subprocess.STDOUT)
 def command(task):
  index=len(list(S.glob('request-[0-9][0-9][0-9].json')))+1
  request=S/f'request-{index:03}.json';request.write_text(json.dumps(task));done=request.with_suffix('.done.json')
  deadline=time.monotonic()+150
  while not done.exists():
   assert owner.poll() is None, ('owner died',owner.returncode)
   if time.monotonic()>deadline:raise TimeoutError(request)
   time.sleep(.1)
  response=json.loads(done.read_text());assert response['ok'],response
  return response
 def run(argv):return command({'action':'run','argv':argv})['output']
 try:
  deadline=time.monotonic()+120
  while not (S/'ready-for-commands').exists():
   assert owner.poll() is None, ('owner died',owner.returncode)
   if time.monotonic()>deadline:raise TimeoutError('owner ready')
   time.sleep(.2)
  receipt=json.loads((S/'owner.json').read_text());cid=receipt['containers']['python']
  for n in ['shared_probe.py','transcript_comparison.py']:run(['docker','cp',str(F/n),cid+':/opt/'+n])
  key=str(uuid.UUID(int=(((time.time_ns()//1000000)+3600000)<<80)|(7<<76)|(2<<62)))
  (S/'probe-key').write_text(key)
  sys.path.insert(0,str(P));from transcript_comparison import compare_transcripts
  def probes(mode):
   ts=[]
   for name,endpoint in [('python','localhost:9991'),('rust','rust:9990')]:
    argv=['docker','exec',cid,'/opt/rbt.runfiles/python3_10_12_x86_64-unknown-linux-gnu/bin/python3','/opt/shared_probe.py',endpoint,'shared-review-correction',key]
    if mode!='fresh':argv+=['--restart']
    raw=run(argv);(S/(mode+'-'+name+'.log')).write_text(raw)
    t=json.loads(raw.split('TRANSCRIPT=')[-1]);assert t['complete'];ts.append(t)
    (S/(mode+'-'+name+'.json')).write_text(json.dumps(t,ensure_ascii=False,indent=2))
   if mode=='fresh':comparison=compare_transcripts(*ts)
   else:
    assert ts[0]['cases']==ts[1]['cases']
    comparison={'complete':True,'records_each':len(ts[0]['cases']),'deterministic_records_exact':len(ts[0]['cases']),'exact_deterministic_cases_equal':True,'same_actor_prefix_and_keys':True}
   (S/(mode+'-comparison.json')).write_text(json.dumps(comparison,ensure_ascii=False,indent=2));return comparison
  result['fresh']=probes('fresh')
  for n in ['rust','python','database']:command({'action':'stop','service':n})
  for n in ['database','rust','python']:command({'action':'start','service':n})
  # Read-only readiness retry; mutations/replays below execute once only.
  deadline=time.monotonic()+60
  while True:
   try:
    run(['docker','exec',cid,'/opt/rbt.runfiles/python3_10_12_x86_64-unknown-linux-gnu/bin/python3','/opt/shared_probe.py','localhost:9991','unused',key,'--boot'])
    run(['docker','exec',cid,'/opt/rbt.runfiles/python3_10_12_x86_64-unknown-linux-gnu/bin/python3','/opt/shared_probe.py','rust:9990','unused',key,'--boot'])
    break
   except AssertionError:
    if time.monotonic()>deadline:raise
    time.sleep(1)
  result['retained_volume_full_stack_restart']=probes('retained-restart')
  result['complete']=True
 except BaseException:
  result['failure']=traceback.format_exc();raise
 finally:
  if owner.poll() is None:
   try:command({'action':'stop-owner'})
   except BaseException:owner.terminate()
  owner.wait(timeout=180)
  result.update(owner_exact_parent_wait=True,owner_pid=owner.pid,owner_exit=owner.returncode)
  r=json.loads((S/'owner.json').read_text());assert r['terminal'] and r['all_waits_joined'] and not r.get('failure') and not r.get('cleanup_errors'),r
  result['custody']={'docker_wait_children':len(r['waits']),'all_waits_joined':r['all_waits_joined'],'containers':r['containers'],'terminal':r['terminal']}
  for name,cid in r['containers'].items():
   inspection=json.loads(subprocess.check_output(['docker','inspect',cid],text=True))[0]
   assert not inspection['State']['Running'] and inspection['State']['Pid']==0
   assert inspection['HostConfig']['PortBindings'] in ({},None)
   (S/(name+'-terminal-readback.json')).write_text(json.dumps(inspection,indent=2))
  result['custody']['all_exact_targets_stopped_readback']=True
  result['source_sha256']={f.name:hashlib.sha256(f.read_bytes()).hexdigest() for f in F.iterdir() if f.suffix in ['.py','.yaml']}
  result['evidence_sha256']={str(f.relative_to(S)):hashlib.sha256(f.read_bytes()).hexdigest() for f in S.iterdir() if f.is_file() and f.name!='review-result.json'}
  (S/'review-result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2))
print(json.dumps(result,ensure_ascii=False,indent=2))
