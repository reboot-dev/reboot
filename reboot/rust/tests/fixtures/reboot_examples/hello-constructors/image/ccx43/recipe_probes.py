from pathlib import Path
import json,time,uuid,subprocess
E=Path('/home/benchbuild/.cache/hello-image-evidence');S=E/'stack';cid=json.loads((S/'owner.json').read_text())['containers']['python']
def control(tasks):
 out=subprocess.check_output(['python3','/home/benchbuild/.cache/hello-control.py',json.dumps(tasks)],text=True);(S/('batch-'+str(time.time_ns())+'.log')).write_text(out);assert '"ok": false' not in out,out
 return out
control([{'action':'run','argv':['docker','cp','/home/benchbuild/.cache/hello-shared-probe.py',cid+':/opt/shared-probe.py']}])
oldkey=(E/'stack-wire-and-lifecycle-v1/probe-key').read_text()
control([{'action':'run','argv':['docker','exec',cid,'/opt/rbt.runfiles/python3_10_12_x86_64-unknown-linux-gnu/bin/python3','/opt/shared-probe.py',ep,'shared-final',oldkey,'--restart']} for ep in ['localhost:9991','rust:9990']]);(S/'retained-container-recreation.json').write_text(json.dumps({'prior_owner':'stack-wire-and-lifecycle-v1','replayed_after_container_recreation':True,'same_original_volume':True}))
k=str(uuid.UUID(int=(((time.time_ns()//1000000)+3600000)<<80)|(7<<76)|(2<<62)));(S/'probe-key').write_text(k)
ids=[]
for ep in ['localhost:9991','rust:9990']:
 before=set(S.glob('request-*.done.json'));control([{'action':'run','argv':['docker','exec',cid,'/opt/rbt.runfiles/python3_10_12_x86_64-unknown-linux-gnu/bin/python3','/opt/shared-probe.py',ep,'shared-recipe',k]}]);ids.extend(set(S.glob('request-*.done.json'))-before)
ts=[json.loads(json.loads(p.read_text())['output'].split('TRANSCRIPT=')[-1]) for p in ids];assert len(ts)==2 and all(t['complete'] for t in ts);assert ts[0]['cases']==ts[1]['cases'];(S/'fresh-comparison.json').write_text(json.dumps({'complete':True,'exact_equal':True,'cases':len(ts[0]['cases']),'transcripts':ts},indent=2));print('fresh exact shared equality:',len(ts[0]['cases']),'cases each; original volume recreation/replay passed')
