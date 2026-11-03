"""Recovery-only retirement; never claims original Unix wait custody."""
import subprocess as s,json,pathlib,time,shlex,hashlib,datetime,os
R=pathlib.Path(__file__).resolve().parent; E=R/'tiny-recovery-results';E.mkdir(exist_ok=True)
receipt={'start':time.time(),'original_custody_recovered':False,'commands':[],'containers':[],'reason':'Prior worker failed; original owner.json is zero bytes; original wait parents lost. New recovery waits are not original waits.'}
def save():
 p=E/'recovery.json';q=p.with_suffix('.pending');q.write_text(json.dumps(receipt,indent=2));q.replace(p)
def remote(host,args):
 p=s.run(['ssh','-o','BatchMode=yes',host,shlex.join(args)],capture_output=True,text=True,timeout=90)
 receipt['commands'].append({'time':time.time(),'host':host,'args':args,'exit':p.returncode,'stdout':p.stdout,'stderr':p.stderr});save();assert p.returncode==0,p.stderr;return p.stdout
# Snapshot unmodified local evidence inventory first.
manifest={}
for p in list((R/'tiny-runtime-results').glob('*'))+list(R.glob('tiny_*.py'))+list(R.glob('tiny-*.log')):
 if p.is_file():manifest[str(p.relative_to(R))]={'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'mtime_ns':p.stat().st_mtime_ns}
(E/'interrupted-source-manifest.json').write_text(json.dumps(manifest,indent=2))
for host,label in [('root@2.31.73.10','tiny'),('root@2.29.27.53','client')]:
 ids=remote(host,['docker','ps','-aq','--no-trunc','--filter',('label=owner=tiny-20261020' if label=='tiny' else 'name=^tiny-20261020-client')]).split()
 inv=json.loads(remote(host,['docker','inspect',*ids])) if ids else []
 (E/(label+'-before.json')).write_text(json.dumps(inv,indent=2))
 if label=='tiny':
  receipt['tiny_environment']=remote(host,['sh','-c','date -Is; cat /proc/meminfo; cat /proc/swaps; systemctl show tiny.slice; cat /sys/fs/cgroup/tiny.slice/memory.events; ps -eo pid,ppid,lstart,args'])
  volumes=remote(host,['docker','volume','ls','-q','--filter','label=owner=tiny-20261020']).split()
  receipt['volumes']=json.loads(remote(host,['docker','volume','inspect',*volumes])) if volumes else []
 else:receipt['client_processes']=remote(host,['docker','top','6f1396a784142150186652052d1a9ba24d8fcd7b4ab45fac63bfaccc5530149d','-eo','pid,ppid,lstart,args'])
 # Application before engine; all other stopped objects remain untouched.
 for i in sorted(inv,key=lambda i: i['Name'].endswith('-engine')):
  if label=='tiny':assert i['Config']['Labels'].get('owner')=='tiny-20261020'
  else:assert i['Id'] in ['6f1396a784142150186652052d1a9ba24d8fcd7b4ab45fac63bfaccc5530149d','21fdc1c1fa86981acd721bfd8a70232309c676b5590749d02dea8daaa57cd473']
  cid=i['Id']; row={'id':cid,'host':host,'before':i,'original_wait_joined':False};receipt['containers'].append(row)
  if i['State']['Running']:
   wait=s.Popen(['ssh',host,'docker wait '+cid],stdout=s.PIPE,stderr=s.PIPE,text=True);row['recovery_wait_pid']=wait.pid
   remote(host,['docker','stop','-t','20',cid]);out,err=wait.communicate(timeout=50)
   terminal=json.loads(remote(host,['docker','inspect',cid]))[0]
   row.update(recovery_wait_exit=wait.returncode,recovery_wait_output=out,recovery_wait_stderr=err,terminal=terminal)
   assert wait.returncode==0 and int(out.strip())==terminal['State']['ExitCode'] and not terminal['State']['Running'] and terminal['State']['Pid']==0
  else:row['terminal']=i
  logs=remote(host,['docker','logs',cid]);(E/(label+'-'+cid+'.log')).write_text(logs);save()
 receipt[label+'_after']=remote(host,['docker','ps','-a','--no-trunc'])
receipt['original_controller_waits_after']={str(pid):pathlib.Path('/proc/'+str(pid)).exists() for pid in [2685054,2685756]}
receipt['end']=time.time();receipt['recovery_retirement_verified']=True;save();print(json.dumps({'receipt':str(E/'recovery.json'),'original_custody_recovered':False,'recovery_retirement_verified':True,'volumes':len(receipt['volumes'])}))
