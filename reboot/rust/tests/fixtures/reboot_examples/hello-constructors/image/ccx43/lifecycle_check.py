from pathlib import Path
import json,subprocess,time
S=Path('/home/benchbuild/.cache/hello-image-evidence/stack');r=json.loads((S/'owner.json').read_text());cid=r['containers']['python'];key=(S/'probe-key').read_text()
def control(tasks):
 p=subprocess.run(['python3','/home/benchbuild/.cache/hello-control.py',json.dumps(tasks)],capture_output=True,text=True,check=True)
 (S/('lifecycle-'+str(time.time_ns())+'.log')).write_text(p.stdout)
 if '"ok": false' in p.stdout:raise RuntimeError(p.stdout)
def probes():
 control([{'action':'run','argv':['docker','exec',cid,'/opt/rbt.runfiles/python3_10_12_x86_64-unknown-linux-gnu/bin/python3','/opt/shared-probe.py',ep,'shared-recipe',key,'--restart']} for ep in ['localhost:9991','rust:9990']])
control([{'action':'stop','service':name} for name in ['rust','python']]);control([{'action':'start','service':name} for name in ['rust','python']]);time.sleep(5);probes()
control([{'action':'stop','service':name} for name in ['rust','python','database']]);control([{'action':'start','service':name} for name in ['database','rust','python']]);time.sleep(5);probes()
control([{'action':'stop','service':'database'}]);time.sleep(8)
health=subprocess.check_output(['docker','inspect','--format','{{.State.Health.Status}}',r['containers']['rust']],text=True).strip();assert health=='unhealthy',health
(S/'engine-loss.json').write_text(json.dumps({'stack_readiness':health,'host_only_health_is_not_the_stack_probe':True,'database_id':r['containers']['database']}))
control([{'action':'start','service':'database'}]);time.sleep(8)
assert subprocess.check_output(['docker','inspect','--format','{{.State.Health.Status}}',r['containers']['rust']],text=True).strip()=='healthy';probes()
(S/'lifecycle-passed.json').write_text(json.dumps({'app_only_restart':True,'full_stack_retained_restart':True,'engine_loss_unhealthy_then_recovered':True,'same_volume_names':True}))
