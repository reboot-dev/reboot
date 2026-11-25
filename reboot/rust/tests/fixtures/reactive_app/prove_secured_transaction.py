"""Secured generated transactions over real CXX/RocksDB, persisted checkpoint restart."""
import hashlib,json,os,socket,subprocess,sys,tempfile,time
from contextlib import nullcontext
from process_cleanup import ProcessCleanup
from pathlib import Path
binary=Path(sys.argv[1]);native=Path(os.environ['REBOOT_NATIVE2PC_CXX_DATABASE'])
subprocess.run([sys.executable,str(Path(__file__).with_name('process_cleanup_test.py'))],check=True)
result={'complete':False,'commands':[],'processes':[]}
def port():
 with socket.socket() as s:s.bind(('127.0.0.1',0));return s.getsockname()[1]
def run(*args):
 cmd=[str(binary),*map(str,args)];p=subprocess.run(cmd,capture_output=True,text=True,timeout=15)
 result['commands'].append({'command':cmd,'exit':p.returncode,'stdout':p.stdout,'stderr':p.stderr});assert p.returncode==0,result['commands'][-1];return p.stdout.strip()
with nullcontext(tempfile.mkdtemp(prefix='rust-secured-transaction-cxx-')) as d:
 work=Path(d);owned=[];dbport=port();appport=port();dbendpoint=f'http://127.0.0.1:{dbport}';endpoint=f'http://127.0.0.1:{appport}'
 def spawn(cmd):
  log=work/f'process-{len(owned)}.log';f=log.open('wb');p=subprocess.Popen(list(map(str,cmd)),stdout=f,stderr=f);owned.append((p,f,log,cmd));return p
 cleanup=ProcessCleanup()
 stop=cleanup.stop
 def listen(p,n):
  deadline=time.monotonic()+15
  while time.monotonic()<deadline:
   assert p.poll() is None,(p.returncode,owned[-1][2].read_text())
   try:
    with socket.create_connection(('127.0.0.1',n),timeout=.1):return
   except OSError:time.sleep(.025)
  raise AssertionError('listener deadline')
 def host():
  marker=work/f'shutdown-{len(owned)}';p=spawn([binary,'user-txn-serve',dbendpoint,f'127.0.0.1:{appport}',marker,work/'revoked',work/'events']);listen(p,appport);return p,marker
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
  run('info',work/'server-info.pb');db=database();h,shutdown=host()
  assert 'secured_transaction_before_restart=18' in run('user-txn-exercise',endpoint,work/'revoked',work/'events',dbendpoint)
  assert events().count('create')==1 and events().count('apply')==3 and events().count('inspect-fresh')==1,events()
  stop(h,shutdown);assert h.returncode==0;stop(db)
  db=database();h,shutdown=host()
  assert 'secured_transaction_recovered=18,replay=15' in run('user-txn-restart',endpoint,work/'revoked',work/'events')
  assert events().count('create')==1 and events().count('apply')==3 and events().count('inspect-fresh')==2,events()
  result.update(events=events());stop(h,shutdown);assert h.returncode==0;stop(db);result['complete']=True
 finally:
  result['processes'],result['cleanup_errors']=cleanup.collect(owned)
  result['work_directory']=str(work)
  result.update(all_owned_pids_absent=all(not Path(f'/proc/{p.pid}').exists() for p,_,_,_ in owned),binary_sha256=hashlib.sha256(binary.read_bytes()).hexdigest(),database_sha256=hashlib.sha256(native.read_bytes()).hexdigest())
  Path(os.environ.get('SECURED_TRANSACTION_EVIDENCE','/tmp/reboot-rust-secured-transaction-proof.json')).write_text(json.dumps(result,indent=2))
assert result['complete'] and result['all_owned_pids_absent'] and not result['cleanup_errors'],result
print(json.dumps({'complete':result['complete'],'owned_pids_absent':result['all_owned_pids_absent']}))
