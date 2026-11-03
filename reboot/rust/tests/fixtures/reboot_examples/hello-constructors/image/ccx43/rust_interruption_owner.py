import os,subprocess,json,time,signal,traceback,shutil,hashlib
from pathlib import Path
E=Path('/home/benchbuild/.cache/hello-image-evidence');S=E/'image-interruption-3';S.mkdir(exist_ok=False);proof=S/'proof';proof.mkdir();shutil.copy2('/home/benchbuild/.cache/hello-database-proxy.py',proof/'proxy.py')
r={'pid':os.getpid(),'containers':{},'waits':[],'commands':[],'complete':False,'terminal':False};waits={};cancel=False

def save():(S/'owner.json').write_text(json.dumps(r,indent=2))
def run(cmd):
 child=subprocess.Popen(cmd,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True);out,_=child.communicate(timeout=45);r['commands'].append({'argv':cmd,'pid':child.pid,'exit':child.returncode,'output':out});save()
 if child.returncode:raise RuntimeError(out)
 return out

def create(name,image,args=[],options=[]):
 cid=run(['docker','create','--name','hello-image-interrupt3-'+name,'--init','--network','hello-image-qualification_private']+options+[image]+args).strip();r['containers'][name]=cid;save();return cid

def arm(name):
 child=subprocess.Popen(['docker','wait',r['containers'][name]],stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True);waits[name]=child;r['waits'].append({'name':name,'pid':child.pid,'container':r['containers'][name]});save()
def join(name):
 child=waits.pop(name);out,_=child.communicate(timeout=35);item=next(x for x in reversed(r['waits']) if x['pid']==child.pid);item.update(wait_exit=child.returncode,container_exit=out.strip(),joined=True)
 state=json.loads(run(['docker','inspect','--format','{{json .State}}',r['containers'][name]]));assert not state['Running'] and str(state['ExitCode'])==out.strip(),state
 item['terminal_state_readback']=state;save();return out.strip()
def start(name):
 out=run(['docker','start',r['containers'][name]]);arm(name);return out
def stop(name):run(['docker','stop','--timeout','25',r['containers'][name]]);return join(name)
def wait_health(name):
 deadline=time.monotonic()+30
 while time.monotonic()<deadline:
  if cancel:raise InterruptedError()
  if run(['docker','inspect','--format','{{.State.Health.Status}}',r['containers'][name]]).strip()=='healthy':return
  time.sleep(.5)
 raise TimeoutError(name)
def on_signal(sig,frame):
 global cancel
 cancel=True
signal.signal(signal.SIGTERM,on_signal);signal.signal(signal.SIGINT,on_signal)
try:
 volume='hello-image-interruption-state-3';run(['docker','volume','create',volume])
 create('config','hello-rust:qualification',['--server-info','/state/server-info.pb'],['-v',volume+':/state']);start('config');assert join('config')=='0'
 create('database','hello-database:qualification',['/state/rocksdb','/state/server-info.pb','20000'],['-v',volume+':/state']);start('database')
 create('proxy','hello-python:qualification',['/proof/proxy.py'],['--entrypoint','/opt/rbt.runfiles/python3_10_12_x86_64-unknown-linux-gnu/bin/python3','-v',str(proof)+':/proof']);start('proxy');time.sleep(2)
 create('app','hello-rust:qualification',options=['-e','RBT_NAME=hello-image-interruption','-e','RBT_RUST_DATABASE_URL=http://hello-image-interrupt3-proxy:20001','-e','RBT_RUST_LISTEN_ADDR=0.0.0.0:9990']);start('app')
 deadline=time.monotonic()+30
 while not (proof/'after-create').exists():
  if time.monotonic()>deadline or cancel:raise TimeoutError('durable Create ACK')
  time.sleep(.1)
 assert run(['docker','inspect','--format','{{.State.Health.Status}}',r['containers']['app']]).strip()!='healthy'
 r['durable_create_marker']=(proof/'after-create').read_text();r['not_ready_at_interruption']=True;save()
 run(['docker','kill','--signal','KILL',r['containers']['app']]);assert join('app')=='137'
 # Same release image, exact container, same RocksDB volume and stable identity.
 start('app');wait_health('app')
 reference=json.loads((E/'stack/owner.json').read_text())['containers']['python']
 command=['docker','exec',reference,'/opt/rbt.runfiles/python3_10_12_x86_64-unknown-linux-gnu/bin/python3','/opt/shared-probe.py','hello-image-interrupt3-app:9990','unused',str(__import__('uuid').uuid4()),'--boot']
 r['recovery_probe']=run(command)
 assert stop('app')=='0';assert stop('database')=='0';start('database');start('app');wait_health('app');r['second_boot_probe']=run(command)
 create('failed-start','hello-rust:qualification',options=['-e','RBT_RUST_DATABASE_URL=http://127.0.0.1:1','-e','RBT_RUST_LISTEN_ADDR=0.0.0.0:9990']);start('failed-start')
 assert join('failed-start')!='0'
 assert run(['docker','inspect','--format','{{.State.Health.Status}}',r['containers']['failed-start']]).strip()!='healthy'
 r['startup_engine_failure_closed']=True
 r['complete']=True
except BaseException:r['failure']=traceback.format_exc()
finally:
 for name in ['app','proxy','database','config']:
  if name in waits:
   try:stop(name)
   except Exception:r.setdefault('cleanup_errors',[]).append(traceback.format_exc())
 for name,cid in r['containers'].items():
  try:(S/(name+'.log')).write_text(run(['docker','logs',cid]));(S/(name+'-inspect.json')).write_text(run(['docker','inspect',cid]))
  except Exception:r.setdefault('cleanup_errors',[]).append(traceback.format_exc())
 r['terminal']=True;r['all_waits_joined']=all(x.get('joined') for x in r['waits']);save()
