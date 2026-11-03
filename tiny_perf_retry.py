"""One replacement alternating pair; retain and exclude failed first pair."""
import pathlib,json,subprocess as sp,shlex,time,uuid,traceback,ast
ROOT=pathlib.Path(__file__).resolve().parent
original=json.loads((ROOT/'tiny-runtime-results/owner.json').read_text());assert original['complete']
source=(ROOT/'tiny_runtime.py').read_text().split('\nKEY=',1)[0].replace("E=ROOT/'tiny-runtime-results'", "E=ROOT/'tiny-retry-results'")
source=source.replace('timeout=240','timeout=900')
source=source.replace('  return row,(sam,f)', "  tiny('docker','network','connect','tiny-app-ingress',app)\n  row['network_inspect']=json.loads(tiny('docker','inspect',app))[0]\n  return row,(sam,f)")
exec(compile(source,str(ROOT/'tiny_runtime.py'),'exec'))
KEY=original['key'];ledger['key']=KEY;ledger['replacement_for']='pair 1: Python replay exceeded 240-second command deadline; entire pair excluded'
load=original['external_client_id'];ssh(CLIENT,['docker','start',load]);ledger['external_client_id']=load
wait=sp.Popen(['ssh',CLIENT,'docker wait '+load],stdout=sp.PIPE,stderr=sp.STDOUT,text=True)
tunnel_code="import subprocess,sys; p=subprocess.Popen(['ssh','-i','/root/.ssh/tiny-20261020-client','-o','ExitOnForwardFailure=yes','-N','-L','127.0.0.1:50051:127.0.0.1:50051','root@2.31.73.10']); print(p.pid,flush=True); sys.stdin.readline(); p.terminate(); print(p.wait(timeout=30),flush=True)"
tunnel=sp.Popen(['ssh',CLIENT,shlex.join(['python3','-u','-c',tunnel_code])],stdin=sp.PIPE,stdout=sp.PIPE,stderr=sp.PIPE,text=True);ledger['tunnel_pid']=tunnel.stdout.readline().strip();save();time.sleep(2)
# Reuse the exact independent observer code, not a different accounting algorithm.
module=ast.parse((ROOT/'tiny_resources.py').read_text());code=next(ast.literal_eval(n.value) for n in module.body if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='code' for t in n.targets))
rf=(E/'per-container-resources.jsonl').open('w');rp=sp.Popen(['ssh',TINY,shlex.join(['python3','-u','-c',code])],stdin=sp.PIPE,stdout=rf,stderr=sp.PIPE,text=True)
ef=(E/'client-exec-events.jsonl').open('w');ep=sp.Popen(['ssh',CLIENT,"docker events --filter container="+load+" --filter event=exec_start --filter event=exec_die --format '{{json .}}'"],stdout=ef,stderr=sp.PIPE,text=True)
try:
 for lang in ['python','rust']:
  label='perf-4-'+lang;s=None;print('CURRENT '+label,flush=True)
  try:
   row,s=stack(lang,label);ready(label+'-boot',KEY);prefix='perf-4';json.loads(client('client.py',prefix,KEY,'seed'));row['cases']={}
   for case in ['reader','single_send','many_send','replay']:
    out=client('client.py',prefix,KEY,case);(E/(label+'-'+case+'.json')).write_text(out);r=json.loads(out);assert r['errors']==0;row['cases'][case]={k:v for k,v in r.items() if k!='samples'}
    print(json.dumps({'label':label,'case':case,'rps':r['successful_rps'],'p95_ms':r['p95_ms']}),flush=True)
   before=json.loads(client('client.py',prefix,KEY,'verify'));restart(row,KEY,label+'-restart');after=json.loads(client('client.py',prefix,KEY,'verify'));assert before==after;row.update(retained=after,complete=True)
  except BaseException:ledger['stacks'][-1]['failure']=traceback.format_exc();print(traceback.format_exc(),flush=True)
  finally:
   retire()
   if s:stop_sample(s)
   save()
 ledger['complete']=True
except BaseException:ledger['fatal']=traceback.format_exc();print(ledger['fatal'],flush=True)
finally:
 retire();ssh(CLIENT,['docker','stop','-t','10',load]);o,_=wait.communicate(timeout=30);ledger['external_client_wait']={'exit':wait.returncode,'output':o};ledger['external_client_terminal']=json.loads(ssh(CLIENT,['docker','inspect',load]))[0]
 out,err=tunnel.communicate('stop\n',timeout=60);ledger['tunnel_retirement']={'exit':tunnel.returncode,'output':out,'stderr':err}
 o,err=rp.communicate('stop\n',timeout=30);rf.close();ledger['resource_observer']={'exit':rp.returncode,'stderr':err}
 ep.terminate();o,err=ep.communicate(timeout=30);ef.close();ledger['event_observer']={'exit':ep.returncode,'stderr':err}
 ledger['end']=time.time();save()
print(json.dumps({'complete':ledger['complete']}),flush=True)
