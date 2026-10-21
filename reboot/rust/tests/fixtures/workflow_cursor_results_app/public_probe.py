"""Public rbt lifecycle probes; parent owns existing public process supervisor.
Usage: public_probe.py BIN ENDPOINT DATABASE_URL PHASE [HANDLE]
Phases are invoked between parent-supervised real rbt retirement/restarts.
No lifecycle simulation, fake server, or background launcher is supplied here.
"""
import json,subprocess,sys,uuid
from pathlib import Path
if not __debug__:raise RuntimeError('proof requires assertions enabled')
binary,app,database,phase=sys.argv[1:5]
handle=sys.argv[5] if len(sys.argv)>5 else None
def run(*args):
 r=subprocess.run([binary,*map(str,args)],capture_output=True,text=True,timeout=15)
 assert r.returncode==0,{'args':args,'exit':r.returncode,'stdout':r.stdout,'stderr':r.stderr}
 return r.stdout.strip()
def inspect(i):return json.loads(run('inspect',database,handle,i))
if phase=='initialize':
 run('create',app,uuid.uuid4(),uuid.uuid4());print(run('start-run',app,uuid.uuid4(),1030))
elif phase=='stored':
 assert run('concurrent',app,uuid.uuid4())=='1'
 s=inspect(0);assert s['status']==1 and s['iteration']==0 and s['b_commits']==1
 replies=[r for r in s['records'] if r['phase']==2 and r['result_type']=='type.googleapis.com/cursor.v1.EffectReply']
 assert len(replies)==1 and replies[0]['reply']=={'iteration':0,'ordinal':1,'proof':'committed:0:1'}
 print(json.dumps(s,sort_keys=True))
elif phase=='cursor':
 s=inspect(1025);assert s['status']==1 and s['iteration']==1025 and s['b_commits']==1025
 assert json.loads(run('read-state',app))=={'consumed':1025,'concurrent':1,'after':0,'commits':1025}
 print(json.dumps(s,sort_keys=True))
elif phase=='break':
 assert run('concurrent',app,uuid.uuid4())=='2'
 s=inspect(1029);assert s['status']==1 and s['iteration']==1029 and s['b_commits']==1030
 saved=[r for r in s['records'] if r['phase']==2 and r['result_type']=='type.googleapis.com/cursor.v1.Result']
 assert len(saved)==1 and saved[0]['reply']=={'cursor':1029,'ordinal':1030,'proof':'committed:1029:1030'}
 print(json.dumps(s,sort_keys=True))
elif phase=='complete':
 assert json.loads(run('wait',app,handle))=={'cursor':1029,'ordinal':1030,'proof':'committed:1029:1030'}
 assert json.loads(run('read-state',app))=={'consumed':1030,'concurrent':2,'after':1,'commits':1030}
 s=inspect(1029);assert s['terminal'] and s['iteration']==1029;print(json.dumps(s,sort_keys=True))
elif phase=='uncertain-schedule':print(run('start-run',app,uuid.uuid4(),1))
elif phase=='started':
 assert run('concurrent',app,uuid.uuid4())=='3'
 s=inspect(0);assert s['status']==1 and s['iteration']==0 and s['b_commits']==1031
 assert len([r for r in s['records'] if r['phase']==1 and r['type']=='type.googleapis.com/reboot.rust.workflow.AtMostOnceResultV1'])==1 and not any(r['phase']==2 for r in s['records'])
 print(json.dumps(s,sort_keys=True))
elif phase=='unresolved':
 # Parent must establish exact-child natural failure + specific host log
 # diagnostic separately; this phase is ONLY a Database equality snapshot.
 s=inspect(0)
 assert {k:s[k] for k in ('consumed','concurrent','after','b_commits')}=={'consumed':1030,'concurrent':3,'after':1,'b_commits':1031}
 print(json.dumps(s,sort_keys=True))
elif phase=='disk':print(json.dumps(inspect(sys.argv[6]),sort_keys=True))
else:raise SystemExit('unknown phase')
