import os,subprocess,json,time,signal,traceback,shutil
from pathlib import Path
E=Path('/home/benchbuild/.cache/hello-image-evidence');S=E/'python-image-interruption-4';S.mkdir(exist_ok=False);proof=S/'proof';proof.mkdir();shutil.copy2('/home/benchbuild/.cache/hello-python-sitecustomize.py',proof/'sitecustomize.py')
r={'pid':os.getpid(),'commands':[],'waits':[],'complete':False,'terminal':False};wait=None;cid=None;cancel=False
def cancel_signal(sig,frame):
 global cancel
 cancel=True
signal.signal(signal.SIGTERM,cancel_signal);signal.signal(signal.SIGINT,cancel_signal)

def save():(S/'owner.json').write_text(json.dumps(r,indent=2))
def run(cmd):
 child=subprocess.Popen(cmd,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True);out,_=child.communicate(timeout=45);r['commands'].append({'argv':cmd,'pid':child.pid,'exit':child.returncode,'output':out});save()
 if child.returncode:raise RuntimeError(out)
 return out

def arm():
 global wait
 wait=subprocess.Popen(['docker','wait',cid],stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True);r['waits'].append({'pid':wait.pid,'container':cid});save()
def join():
 global wait
 out,_=wait.communicate(timeout=35);r['waits'][-1].update(joined=True,wait_exit=wait.returncode,container_exit=out.strip());wait=None
 state=json.loads(run(['docker','inspect','--format','{{json .State}}',cid]));assert not state['Running'] and str(state['ExitCode'])==out.strip(),state
 r['waits'][-1]['terminal_state_readback']=state;save();return out.strip()
def start():run(['docker','start',cid]);arm()
def stop():run(['docker','stop','--timeout','25',cid]);return join()
def probe():
 reference=json.loads((E/'stack/owner.json').read_text())['containers']['python'];cmd=['docker','exec',reference,'/opt/rbt.runfiles/python3_10_12_x86_64-unknown-linux-gnu/bin/python3','/opt/shared-probe.py','hello-image-pyinterrupt4:9991','unused',str(__import__('uuid').uuid4()),'--boot']
 # Explicit read-only readiness retry; never retry tested mutations.
 deadline=time.monotonic()+30
 while time.monotonic()<deadline:
  try:return run(cmd)
  except RuntimeError:time.sleep(.5)
 raise TimeoutError('Python initialized boot')
try:
 volume='hello-python-interruption-state-4';run(['docker','volume','create',volume]);cid=run(['docker','create','--name','hello-image-pyinterrupt4','--init','--network','hello-image-qualification_private','-v',volume+':/state','-v',str(proof)+':/proof','-e','PYTHONPATH=/proof:/example/hello-constructors/backend/api','hello-python:qualification']).strip();r['container']=cid;start()
 deadline=time.monotonic()+40
 while not (proof/'after-create').exists():
  if time.monotonic()>deadline or cancel:raise TimeoutError('Python durable Create ACK marker')
  time.sleep(.1)
 r['durable_create_marker']=(proof/'after-create').read_text();save();run(['docker','kill','--signal','KILL',cid]);assert join()=='137'
 start();r['recovery_probe']=probe();assert stop() in ['0','143'];start();r['second_boot_probe']=probe();r['complete']=True
except BaseException:r['failure']=traceback.format_exc()
finally:
 if wait is not None:
  try:stop()
  except Exception:r['cleanup_error']=traceback.format_exc()
 if cid:
  try:(S/'python.log').write_text(run(['docker','logs',cid]));(S/'inspect.json').write_text(run(['docker','inspect',cid]))
  except Exception:r['inspection_error']=traceback.format_exc()
 r['terminal']=True;r['all_waits_joined']=all(x.get('joined') for x in r['waits']);save()
