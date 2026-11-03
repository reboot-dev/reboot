"""Finite actual CPX02 qualification; external CCX43 client; immutable images."""
import subprocess as sp, json, time, os, sys, uuid, traceback, threading, hashlib
from pathlib import Path
ROOT=Path(__file__).resolve().parent
SRC=ROOT/'reboot/rust/tests/fixtures/reboot_examples/hello-constructors/image'
E=ROOT/'tiny-runtime-results'; E.mkdir(exist_ok=True)
TINY='root@2.31.73.10'; CLIENT='root@2.29.27.53'
REMOTE='/home/benchbuild/.cache/tiny-current-src/reboot/rust/tests/fixtures/reboot_examples/hello-constructors/image'
PY='/opt/rbt.runfiles/python3_10_12_x86_64-unknown-linux-gnu/bin/python3'
IM={'rust':'sha256:3dcf9d9976f76a63b3a290ef6cf15329f1f6148692c72604e5dc797a237f7db4','python':'sha256:28241a509e8dbedda24bd2033ce556cc5648ddd02ef80bd349e417586fb84925','engine':'sha256:1a73705b0771f9c861d9ba96509806849423a3d8bbff140b1261da76280460cd'}
import shlex
ledger={'images':IM,'stacks':[],'commands':[],'complete':False,'start':time.time(),'owner_pid':os.getpid()}
lock=threading.Lock(); active=[]
def save():
 with lock: (E/'owner.json').write_text(json.dumps(ledger,indent=2))
def ssh(host,args,check=True,timeout=240):
 cmd=['ssh','-o','BatchMode=yes','-o','ConnectTimeout=15',host,shlex.join([str(x) for x in args])]
 p=sp.Popen(cmd,stdout=sp.PIPE,stderr=sp.STDOUT,text=True)
 try: out,_=p.communicate(timeout=timeout)
 except BaseException:
  p.terminate(); out,_=p.communicate(timeout=30); raise
 ledger['commands'].append({'host':host,'argv':args,'pid':p.pid,'exit':p.returncode,'output':out});save()
 if check and p.returncode: raise RuntimeError((host,args,p.returncode,out[-8000:]))
 return out
def tiny(*args,**kw):return ssh(TINY,list(args),**kw)
def inspect(cid):return json.loads(tiny('docker','inspect',cid))[0]
def start(role,image,extra=(),command=()):
 cid=tiny('docker','run','-d','--pull=never','--init','--cgroup-parent=tiny.slice','--name',role,'--label','owner=tiny-20261020',*extra,image,*command).strip()
 i=inspect(cid); assert i['State']['StartedAt']!='0001-01-01T00:00:00Z'
 p=sp.Popen(['ssh',TINY,'docker wait '+cid],stdout=sp.PIPE,stderr=sp.STDOUT,text=True)
 row={'name':role,'id':cid,'initial':i,'wait_pid':p.pid};ledger['stacks'][-1]['containers'].append(row);active.append((row,p));save();return cid

def retire():
 while active:
  row,p=active.pop()
  try:
   i=inspect(row['id'])
   if i['State']['Running']:tiny('docker','stop','-t','30',row['id'],timeout=60)
   out,_=p.communicate(timeout=70);i=inspect(row['id'])
   row.update(terminal=i,wait_exit=p.returncode,wait_output=out,joined=True)
   (E/(row['name']+'-'+str(len(ledger['commands']))+'.log')).write_text(tiny('docker','logs',row['id'],check=False))
   assert p.returncode==0 and int(out.strip())==i['State']['ExitCode'] and not i['State']['Running'] and i['State']['Pid']==0
  finally:save()

def client(script,prefix,key,mode=None,timeout=240):
 args=['docker','exec','tiny-20261020-client',PY,'/bench/'+('benchmark/client.py' if script=='client.py' else script),'127.0.0.1:50051',prefix]
 if script=='shared_probe.py':args +=[key]+([mode] if mode else [])
 else:args +=[mode,key]
 return ssh(CLIENT,args,timeout=timeout)
def probe(label,prefix,key,mode=None):
 out=client('shared_probe.py',prefix,key,mode);(E/(label+'.log')).write_text(out)
 r=json.loads(out.split('TRANSCRIPT=')[-1]);assert r['complete'];return r

def ready(label,key):
 end=time.monotonic()+100
 while True:
  try:return probe(label,'unused',key,'--boot')
  except Exception:
   states=[inspect(r['id'])['State'] for r,p in active]
   if any(not x['Running'] for x in states if x['ExitCode']!=0 or x['OOMKilled']):raise
   if time.monotonic()>end:raise
   time.sleep(1)

def sampler(label):
 code="""import time,json,select,sys,pathlib
p=pathlib.Path('/sys/fs/cgroup/tiny.slice')
while True:
 d={'time':time.time(),'monotonic_ns':time.monotonic_ns(),'host_meminfo':pathlib.Path('/proc/meminfo').read_text(),'host_memory_psi':pathlib.Path('/proc/pressure/memory').read_text(),'host_cpu_psi':pathlib.Path('/proc/pressure/cpu').read_text()}
 for n in ['memory.current','memory.peak','memory.events','memory.swap.current','memory.swap.max','memory.pressure','cpu.stat','cpu.pressure','memory.max']:
  try:d[n]=(p/n).read_text()
  except OSError:pass
 print(json.dumps(d),flush=True)
 if select.select([sys.stdin],[],[],.25)[0]:break
"""
 f=(E/(label+'-resources.jsonl')).open('w')
 p=sp.Popen(['ssh',TINY,shlex.join(['python3','-u','-c',code])],stdin=sp.PIPE,stdout=f,stderr=sp.PIPE,text=True)
 return p,f

def stack(lang,label,budget=None,volume=None):
 assert not tiny('docker','ps','-q').strip()
 row={'language':lang,'label':label,'budget':budget,'containers':[]};ledger['stacks'].append(row);save()
 tiny('systemctl','set-property','--runtime','tiny.slice','MemoryMax='+str(budget or 'infinity'))
 network='tiny-'+label
 tiny('docker','network','create','--internal','--label','owner=tiny-20261020',network)
 volume=volume or network+'-state'
 if not tiny('docker','volume','ls','--format','{{.Name}}','--filter','name=^'+volume+'$').strip():tiny('docker','volume','create','--label','owner=tiny-20261020',volume)
 row['volume']=volume
 sam,f=sampler(label)
 try:
  if lang=='rust':
   config=start(network+'-config',IM['rust'],['--network',network,'-v',volume+':/state'],['--server-info','/state/server-info.pb'])
   end=time.monotonic()+30
   while inspect(config)['State']['Running']:
    assert time.monotonic()<end;time.sleep(.2)
   assert inspect(config)['State']['ExitCode']==0
   # Join config before starting the measured stack; config remains in ledger.
   retire()
   engine=start(network+'-engine',IM['engine'],['--network',network,'--network-alias','database','-v',volume+':/state'],['/state/rocksdb','/state/server-info.pb','20000'])
   end=time.monotonic()+90
   while inspect(engine)['State'].get('Health',{}).get('Status')!='healthy':
    i=inspect(engine);assert i['State']['Running'],i['State'];assert time.monotonic()<end;time.sleep(.4)
   app=start(network+'-app',IM['rust'],['--network',network,'-p','127.0.0.1:50051:9990','-e','RBT_NAME=hello-image-qualified','-e','RBT_RUST_DATABASE_URL=http://database:20000','-e','RBT_RUST_LISTEN_ADDR=0.0.0.0:9990'])
  else:
   app=start(network+'-app',IM['python'],['--network',network,'-p','127.0.0.1:50051:9991','-v',volume+':/state'])
  return row,(sam,f)
 except BaseException:
  row['startup_failure']=traceback.format_exc();retire();sam.communicate('stop\n',timeout=30);f.close();save();raise

def stop_sample(s):
 p,f=s;out,err=p.communicate('stop\n',timeout=30);f.close();assert p.returncode==0,err

def restart(row,key,label):
 old=[(r['name'],r['id']) for r,p in active];retire()
 for name,cid in old:
  tiny('docker','start',cid);i=inspect(cid)
  p=sp.Popen(['ssh',TINY,'docker wait '+cid],stdout=sp.PIPE,stderr=sp.STDOUT,text=True)
  r={'name':name,'id':cid,'restart':True,'initial':i,'wait_pid':p.pid};row['containers'].append(r);active.append((r,p));save()
 ready(label+'-ready',key)

KEY=str(uuid.UUID(int=(((time.time_ns()//1000000)+3600000)<<80)|(7<<76)|(2<<62)))
ledger['key']=KEY
TUNNEL=None
try:
 ledger['environment']={cmd:tiny('sh','-c',cmd) for cmd in ['date -Is','uname -a','cat /proc/meminfo','cat /proc/swaps','systemctl show tiny.slice','docker info','docker ps -a --no-trunc']}
 assert not tiny('docker','ps','-q').strip()
 # External load generator is the immutable Python package, not on the tiny host.
 load=ssh(CLIENT,['docker','run','-d','--pull=never','--init','--name','tiny-20261020-client','--network','host','--cpuset-cpus','8,10','--entrypoint',PY,'--no-healthcheck','-v',REMOTE+':/bench:ro',IM['python'],'-c','import time;time.sleep(14400)']).strip();ledger['external_client_id']=load
 # The remote shell owns and joins the forwarding child; closing stdin ends it.
 tunnel_code="import subprocess,sys,json; p=subprocess.Popen(['ssh','-i','/root/.ssh/tiny-20261020-client','-o','StrictHostKeyChecking=accept-new','-o','ExitOnForwardFailure=yes','-N','-L','127.0.0.1:50051:127.0.0.1:50051','root@2.31.73.10']); print(p.pid,flush=True); sys.stdin.readline(); p.terminate(); print(p.wait(timeout=30),flush=True)"
 TUNNEL=sp.Popen(['ssh',CLIENT,shlex.join(['python3','-u','-c',tunnel_code])],stdin=sp.PIPE,stdout=sp.PIPE,stderr=sp.PIPE,text=True)
 ledger['tunnel_pid']=TUNNEL.stdout.readline().strip();save();time.sleep(2)
 transcripts={};passed=[]
 for lang in ['rust','python']:
  print('CURRENT correctness '+lang,flush=True);s=None
  try:
   row,s=stack(lang,'qualification-'+lang);ready('boot-'+lang,KEY)
   transcripts[lang]=probe('correctness-'+lang,'tiny-common',KEY)
   restart(row,KEY,'restart-'+lang)
   row['restart_probe']=probe('restart-'+lang,'tiny-common',KEY,'--restart')
   # Bounded five-minute read/replay soak with raw per-RPC records.
   prefix='soak';json.loads(client('client.py',prefix,KEY,'seed'))
   end=time.monotonic()+300;iterations=0
   while time.monotonic()<end:
    case='reader' if iterations%2==0 else 'replay'
    out=client('client.py',prefix,KEY,case);(E/(lang+'-soak-'+str(iterations)+'.json')).write_text(out);assert json.loads(out)['errors']==0
    iterations+=1
   row.update(soak_seconds=300,soak_iterations=iterations,qualified=True);passed.append(lang)
  except BaseException:row=ledger['stacks'][-1];row['failure']=traceback.format_exc();print(row['failure'],flush=True)
  finally:
   retire()
   if s:stop_sample(s)
   save()
 if len(transcripts)==2:
  sys.path.insert(0,str(SRC));from transcript_comparison import compare_transcripts
  ledger['comparison']=compare_transcripts(transcripts['rust'],transcripts['python']);save()
 # Identical four workloads, three alternating repetitions, only qualified stacks.
 for rep in range(3):
  for lang in (['rust','python'] if rep%2==0 else ['python','rust']):
   if lang not in passed:continue
   label=f'perf-{rep+1}-{lang}';print('CURRENT '+label,flush=True);s=None
   try:
    row,s=stack(lang,label);ready(label+'-boot',KEY);prefix='perf-'+str(rep+1)
    json.loads(client('client.py',prefix,KEY,'seed'));row['cases']={}
    for case in ['reader','single_send','many_send','replay']:
     # Warmup omitted: same fixed workload and fresh persisted actors on both.
     out=client('client.py',prefix,KEY,case);(E/(label+'-'+case+'.json')).write_text(out);r=json.loads(out);assert r['errors']==0;row['cases'][case]={k:v for k,v in r.items() if k!='samples'}
     print(json.dumps({'run':label,'case':case,'rps':r['successful_rps'],'p95':r['p95_ms']}),flush=True)
    before=json.loads(client('client.py',prefix,KEY,'verify'));restart(row,KEY,label+'-restart');after=json.loads(client('client.py',prefix,KEY,'verify'));assert before==after;row.update(retained=after,complete=True)
   except BaseException:ledger['stacks'][-1]['failure']=traceback.format_exc();print(traceback.format_exc(),flush=True)
   finally:
    retire()
    if s:stop_sample(s)
    save()
 ledger['qualified']=passed;ledger['complete']=True
except BaseException:ledger['fatal']=traceback.format_exc();print(ledger['fatal'],flush=True)
finally:
 retire()
 if 'external_client_id' in ledger:
  cid=ledger['external_client_id'];ssh(CLIENT,['docker','stop','-t','10',cid]);ledger['external_client_terminal']=json.loads(ssh(CLIENT,['docker','inspect',cid]))[0]
 if TUNNEL:
  out,err=TUNNEL.communicate('stop\n',timeout=60);ledger['tunnel_retirement']={'exit':TUNNEL.returncode,'output':out,'stderr':err}
 ledger['end']=time.time();save()
print(json.dumps({k:ledger.get(k) for k in ['complete','qualified','fatal']}),flush=True)
