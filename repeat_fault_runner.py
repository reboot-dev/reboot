"""Durable sequential old/new actual-container fault suite; never clears timing."""
import json
from pathlib import Path
import subprocess as sp
import sys
import time
root=Path(__file__).resolve().parent
out=[]
for version in ['red','green']:
    for mode in ['inspect','spawn','deadline']:
        directory=root/version
        with (root/(version+'-'+mode+'.log')).open('wb') as f:
            p=sp.run([sys.executable,str(directory/'tiny_repeat_faulttest.py'),mode],stdout=f,stderr=sp.STDOUT,timeout=200)
        out.append(dict(version=version,mode=mode,exit=p.returncode,expected=(p.returncode!=0 if version=='red' else p.returncode==0)))
        (root/'suite.json').write_text(json.dumps(out,indent=2))
        # Never start the next fault while any tiny container remains running.
        config=json.loads((directory/'config.json').read_text())
        p=sp.run(['ssh','-i',config['control_ssh_key'],'-o','BatchMode=yes','root@'+config['ip'],'docker ps -q'],capture_output=True,text=True,check=True)
        assert not p.stdout.strip(),p.stdout
print(json.dumps(out),flush=True)
assert all(x['expected'] for x in out)
