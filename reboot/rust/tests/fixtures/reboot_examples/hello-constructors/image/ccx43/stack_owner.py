"""Durable finite Docker owner: exact container IDs, wait handles and cleanup."""
import subprocess,json,time,os,signal,traceback
from pathlib import Path
E=Path('/home/benchbuild/.cache/hello-image-evidence'); S=E/'stack';S.mkdir(exist_ok=False)
C=['docker','compose','-f','/home/benchbuild/.cache/hello-image-src/reboot/rust/tests/fixtures/reboot_examples/hello-constructors/image/compose.yaml']
r={'owner_pid':os.getpid(),'containers':{},'waits':[],'commands':[],'terminal':False}; waits={}; stop=False

def save(): (S/'owner.json').write_text(json.dumps(r,indent=2))
def run(cmd):
 p=subprocess.Popen(cmd,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True)
 out,_=p.communicate(timeout=120);r['commands'].append({'argv':cmd,'pid':p.pid,'exit':p.returncode,'output':out});save()
 if p.returncode: raise RuntimeError(out)
 return out

def arm(name):
 cid=r['containers'][name];p=subprocess.Popen(['docker','wait',cid],stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True);waits[name]=p
 r['waits'].append({'name':name,'container':cid,'pid':p.pid});save()
def join(name):
 p=waits.pop(name);out,_=p.communicate(timeout=40)
 rec=next(x for x in reversed(r['waits']) if x['pid']==p.pid);rec.update(wait_exit=p.returncode,container_exit=out.strip(),joined=True)
 state=json.loads(run(['docker','inspect','--format','{{json .State}}',r['containers'][name]]))
 assert not state['Running'] and str(state['ExitCode'])==out.strip(),state
 rec['terminal_state_readback']=state;save()
def handle(sig,frame):
 global stop
 stop=True
signal.signal(signal.SIGTERM,handle);signal.signal(signal.SIGINT,handle)
try:
 run(C+['create'])
 for name in ['config','database','rust','python']:
  r['containers'][name]=run(C+['ps','--all','-q',name]).strip();assert r['containers'][name]
 save();run(C+['up','--detach','--no-recreate','--wait','--wait-timeout','60'])
 for name in ['config','database','rust','python']:arm(name)
 join('config')
 (S/'ready-for-commands').touch();save()
 deadline=time.monotonic()+10800
 while not stop and time.monotonic()<deadline:
  requests=sorted(S.glob('request-[0-9][0-9][0-9].json'))
  for request in requests:
   done=request.with_suffix('.done.json')
   if done.exists():continue
   task=json.loads(request.read_text());result={}
   try:
    action=task['action']
    if action=='stop-owner':stop=True
    elif action=='run':result['output']=run(task['argv'])
    elif action=='stop':
     name=task['service'];result['output']=run(['docker','stop','--time','25',r['containers'][name]]);join(name)
    elif action=='start':
     name=task['service'];result['output']=run(['docker','start',r['containers'][name]]);arm(name)
    else:raise ValueError(action)
    result['ok']=True
   except Exception as ex:result.update(ok=False,error=str(ex))
   done.write_text(json.dumps(result,indent=2))
  time.sleep(.2)
except BaseException:
 r['failure']=traceback.format_exc()
finally:
 for name,cid in r['containers'].items():
  if name not in waits:
   state=json.loads(run(['docker','inspect','--format','{{json .State}}',cid]))
   if state['Running']:arm(name)
 for name in ['rust','python','database','config']:
  if name in waits:
   try:run(['docker','stop','--time','25',r['containers'][name]]);join(name)
   except Exception: r.setdefault('cleanup_errors',[]).append(traceback.format_exc())
 for name,cid in r['containers'].items():
  try:(S/(name+'-final-inspect.json')).write_text(run(['docker','inspect',cid]));(S/(name+'.log')).write_text(run(['docker','logs',cid]))
  except Exception:r.setdefault('cleanup_errors',[]).append(traceback.format_exc())
 r['terminal']=True;r['all_waits_joined']=all(x.get('joined') for x in r['waits']);save()
