"""Secured generated workflow over real CXX/RocksDB, persisted checkpoint restart."""
import hashlib,json,os,socket,subprocess,sys,tempfile,time
from pathlib import Path
binary=Path(sys.argv[1]);native=Path(os.environ['REBOOT_NATIVE2PC_CXX_DATABASE'])
result={'complete':False,'commands':[],'processes':[]}
def port():
 with socket.socket() as s:s.bind(('127.0.0.1',0));return s.getsockname()[1]
def run(*args):
 cmd=[str(binary),*map(str,args)];p=subprocess.run(cmd,capture_output=True,text=True,timeout=15)
 result['commands'].append({'command':cmd,'exit':p.returncode,'stdout':p.stdout,'stderr':p.stderr});assert p.returncode==0,result['commands'][-1];return p.stdout.strip()
with tempfile.TemporaryDirectory(prefix='rust-secured-workflow-cxx-') as d:
 work=Path(d);owned=[];dbport=port();appport=port();dbendpoint=f'http://127.0.0.1:{dbport}';endpoint=f'http://127.0.0.1:{appport}'
 def spawn(cmd):
  log=work/f'process-{len(owned)}.log';f=log.open('wb');p=subprocess.Popen(list(map(str,cmd)),stdout=f,stderr=f);owned.append((p,f,log,cmd));return p
 def stop(p,marker=None):
  if p.poll() is None:
   if marker:marker.touch()
   else:p.kill()
   p.wait(timeout=15)
 def listen(p,n):
  deadline=time.monotonic()+15
  while time.monotonic()<deadline:
   assert p.poll() is None,(p.returncode,owned[-1][2].read_text())
   try:
    with socket.create_connection(('127.0.0.1',n),timeout=.1):return
   except OSError:time.sleep(.025)
  raise AssertionError('listener deadline')
 def host():
  marker=work/f'shutdown-{len(owned)}';p=spawn([binary,'user-workflow-serve',dbendpoint,f'127.0.0.1:{appport}',marker,work/'revoked',work/'events',work/'pause']);listen(p,appport);return p,marker
 def database():
  p=spawn([native,work/'rocksdb',work/'server-info.pb',dbport]);listen(p,dbport);return p
 def events():return (work/'events').read_text().splitlines() if (work/'events').exists() else []
 def wait_event(name):
  deadline=time.monotonic()+15
  while time.monotonic()<deadline:
   assert h.poll() is None
   if name in events():return
   time.sleep(.025)
  raise AssertionError((name,events()))
 try:
  run('info',work/'server-info.pb');(work/'pause').touch();db=database();h,shutdown=host()
  handle=run('user-workflow-exercise',endpoint,work/'revoked',work/'events',dbendpoint);wait_event('first-ack')
  first=json.loads(run('user-workflow-inspect',dbendpoint,handle));assert {k:first[k] for k in ['status','has_terminal','checkpoints']}=={'status':1,'has_terminal':False,'checkpoints':1},first
  assert events().count('first')==1 and events().count('schedule')==1 and events().count('second')==0,events()
  stop(h,shutdown);assert h.returncode==0;stop(db)
  (work/'pause').unlink();db=database();h,shutdown=host();wait_event('second-ack')
  deadline=time.monotonic()+15
  while True:
   final=json.loads(run('user-workflow-inspect',dbendpoint,handle))
   if final['status']==2:break
   assert time.monotonic()<deadline,final;time.sleep(.025)
  assert {k:final[k] for k in ['status','has_terminal','checkpoints']}=={'status':2,'has_terminal':True,'checkpoints':2},final
  assert set(first['records']).issubset(final['records']) and len(set(final['records']))==2,final
  assert 'secured_workflow_recovered=5,5,1' in run('user-workflow-restart',endpoint,work/'revoked',handle)
  assert events().count('first')==1 and events().count('second')==1 and events().count('schedule')==1 and events().count('body')==2,events()
  result.update(handle=handle,before=first,after=final,events=events());stop(h,shutdown);assert h.returncode==0;stop(db);result['complete']=True
 finally:
  for p,f,log,cmd in owned:
   stop(p);f.close();result['processes'].append({'pid':p.pid,'command':list(map(str,cmd)),'exit':p.returncode,'log':log.read_text(errors='replace')})
  result.update(all_owned_pids_absent=all(not Path(f'/proc/{p.pid}').exists() for p,_,_,_ in owned),binary_sha256=hashlib.sha256(binary.read_bytes()).hexdigest(),database_sha256=hashlib.sha256(native.read_bytes()).hexdigest())
  Path(os.environ.get('SECURED_WORKFLOW_EVIDENCE','/tmp/reboot-rust-secured-workflow-proof.json')).write_text(json.dumps(result,indent=2))
assert result['complete'] and result['all_owned_pids_absent'],result
print(json.dumps({'complete':result['complete'],'owned_pids_absent':result['all_owned_pids_absent']}))
