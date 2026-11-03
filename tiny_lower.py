"""Lower aggregate budgets only after both no-cap stacks have qualified."""
import pathlib,json,subprocess as sp,shlex,time,uuid,traceback
ROOT=pathlib.Path(__file__).resolve().parent
original=json.loads((ROOT/'tiny-runtime-results/owner.json').read_text())
assert original['complete'] and sorted(original['qualified'])==['python','rust']
source=(ROOT/'tiny_runtime.py').read_text().split('\nKEY=',1)[0]
source=source.replace("E=ROOT/'tiny-runtime-results'", "E=ROOT/'tiny-lower-results'")
# Scoped app-only ingress is an explicit part of this owner, not a sidecar engine port.
source=source.replace('  return row,(sam,f)', "  tiny('docker','network','connect','tiny-app-ingress',app)\n  row['network_inspect']=json.loads(tiny('docker','inspect',app))[0]\n  return row,(sam,f)")
exec(compile(source,str(ROOT/'tiny_runtime.py'),'exec'))
ledger['source_parent_owner_sha256']=__import__('hashlib').sha256((ROOT/'tiny_runtime.py').read_bytes()).hexdigest()
KEY=original['key'];TUNNEL=None
load=original['external_client_id'];ledger['external_client_id']=load
ssh(CLIENT,['docker','start',load])
loadwait=sp.Popen(['ssh',CLIENT,'docker wait '+load],stdout=sp.PIPE,stderr=sp.STDOUT,text=True)
tunnel_code="import subprocess,sys; p=subprocess.Popen(['ssh','-i','/root/.ssh/tiny-20261020-client','-o','ExitOnForwardFailure=yes','-N','-L','127.0.0.1:50051:127.0.0.1:50051','root@2.31.73.10']); print(p.pid,flush=True); sys.stdin.readline(); p.terminate(); print(p.wait(timeout=30),flush=True)"
TUNNEL=sp.Popen(['ssh',CLIENT,shlex.join(['python3','-u','-c',tunnel_code])],stdin=sp.PIPE,stdout=sp.PIPE,stderr=sp.PIPE,text=True)
ledger['tunnel_pid']=TUNNEL.stdout.readline().strip();save();time.sleep(2)
try:
 failed=set();comparisons={}
 # Descending aggregate candidates; stop an implementation after a failed cap.
 # Rust's observed footprint is lower, so its exercised candidates begin at 256 MiB.
 for mib in [768,512,256,128]:
  for lang in ['rust','python']:
   if lang in failed or (lang=='rust' and mib>256):continue
   label=f'lower-{mib}-{lang}';prefix=f'lower-{mib}';s=None
   print('CURRENT '+label,flush=True)
   try:
    row,s=stack(lang,label,str(mib)+'M');ready(label+'-boot',KEY)
    transcript=probe(label+'-correctness',prefix,KEY)
    comparisons.setdefault(mib,{})[lang]=transcript
    json.loads(client('client.py',prefix,KEY,'seed'));row['cases']={}
    for case in ['reader','single_send','many_send','replay']:
     out=client('client.py',prefix,KEY,case);(E/(label+'-'+case+'.json')).write_text(out);r=json.loads(out);assert r['errors']==0;row['cases'][case]={k:v for k,v in r.items() if k!='samples'}
    before=json.loads(client('client.py',prefix,KEY,'verify'))
    # Bounded read/replay soak, no silent unbounded writer growth.
    end=time.monotonic()+120;iterations=0;start_soak=time.monotonic()
    while time.monotonic()<end:
     case='reader' if iterations%2==0 else 'replay';out=client('client.py',prefix,KEY,case);(E/(label+'-soak-'+str(iterations)+'.json')).write_text(out);assert json.loads(out)['errors']==0;iterations+=1
    row['soak_elapsed_seconds']=time.monotonic()-start_soak;row['soak_iterations']=iterations
    restart(row,KEY,label+'-restart')
    probe(label+'-restart',prefix,KEY,'--restart')
    after=json.loads(client('client.py',prefix,KEY,'verify'));assert before==after
    row.update(retained=after,passed=True)
   except BaseException:
    failed.add(lang);ledger['stacks'][-1]['failure']=traceback.format_exc();print(traceback.format_exc(),flush=True)
   finally:
    retire()
    if s:stop_sample(s)
    save()
  if len(failed)==2:break
 sys.path.insert(0,str(SRC));from transcript_comparison import compare_transcripts
 ledger['comparisons']={str(mib):compare_transcripts(v['rust'],v['python']) for mib,v in comparisons.items() if len(v)==2}
 ledger['complete']=True
except BaseException:ledger['fatal']=traceback.format_exc();print(ledger['fatal'],flush=True)
finally:
 retire();tiny('systemctl','set-property','--runtime','tiny.slice','MemoryMax=infinity')
 ssh(CLIENT,['docker','stop','-t','10',load]);o,_=loadwait.communicate(timeout=30);ledger['external_client_wait']={'output':o,'exit':loadwait.returncode};ledger['external_client_terminal']=json.loads(ssh(CLIENT,['docker','inspect',load]))[0]
 if TUNNEL:
  out,err=TUNNEL.communicate('stop\n',timeout=60);ledger['tunnel_retirement']={'exit':TUNNEL.returncode,'output':out,'stderr':err}
 ledger['end']=time.time();save()
print(json.dumps({k:ledger.get(k) for k in ['complete','fatal']}),flush=True)
