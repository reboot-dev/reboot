"""Exercise the exact immutable replacement source, independently of its gate."""
import hashlib
import json
from pathlib import Path
import subprocess as sp
import sys
import time
R=Path('/root/tiny-repeat-repaired-20261020')
expected=json.loads((R/'results/owner.json').read_text())['source_sha256']
for name,sha in expected.items():assert hashlib.sha256((R/name).read_bytes()).hexdigest()==sha
end=time.monotonic()+600
while sp.run(['systemctl','is-active','tiny-repeat-repair-faults-20261020'],capture_output=True,text=True).stdout.strip()=='active':
    assert time.monotonic()<end
    time.sleep(2)
results=[]
for mode in ['inspect','spawn','deadline','smoke']:
    script='tiny_repeat_smoke.py' if mode=='smoke' else 'tiny_repeat_faulttest.py'
    argv=[sys.executable,str(R/script)]+([] if mode=='smoke' else [mode])
    with (R/('final-'+mode+'.log')).open('wb') as f:
        p=sp.run(argv,stdout=f,stderr=sp.STDOUT,timeout=210)
    results.append(dict(mode=mode,exit=p.returncode))
    (R/'final-suite.json').write_text(json.dumps(results,indent=2))
    assert p.returncode==0,(mode,p.returncode)
    c=json.loads((R/'config.json').read_text())
    out=sp.check_output(['ssh','-i',c['control_ssh_key'],'-o','BatchMode=yes','root@'+c['ip'],'docker ps -q'],text=True)
    assert not out.strip(),out
for name,sha in expected.items():assert hashlib.sha256((R/name).read_bytes()).hexdigest()==sha
print(json.dumps(dict(exact_replacement_source_tested=True,results=results)),flush=True)
