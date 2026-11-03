"""Read-only final custody/readback proof for the exact replacement."""
import hashlib
import json
from pathlib import Path
import subprocess as sp
R=Path('/root/tiny-repeat-repaired-20261020')
d=json.loads((R/'results/owner.json').read_text())
assert d['owner_pid']==863395 and d['owner_ppid']==1
assert d['gate']=='awaiting-parent-timing-clearance' and not any(d[k] for k in ['children','stacks','commands'])
assert not (R/'TIMING-CLEARANCE.json').exists()
assert not Path('/proc/863395/task/863395/children').read_text().strip()
for name,sha in d['source_sha256'].items():assert hashlib.sha256((R/name).read_bytes()).hexdigest()==sha
c=d['config'];base=['ssh','-i',c['control_ssh_key'],'-o','BatchMode=yes','root@'+c['ip']]
assert not sp.check_output(base+['docker ps -q'],text=True).strip()
rows=[]
for name in ['fault-inspect','fault-spawn','fault-deadline','results-smoke']:
    owner=json.loads((R/name/'owner.json').read_text())
    assert owner['all_original_unix_children_joined'] and 'end' in owner
    containers=[x for stack in owner['stacks'] for x in stack['containers']]
    ids=list({x['id'] for x in containers})
    states={x['Id']:x for x in json.loads(sp.check_output(base+['docker inspect '+' '.join(ids)],text=True))}
    for r in containers:
        s=states[r['id']]['State']
        assert r['retired'] and not s['Running'] and s['Pid']==0
        if r.get('original_wait_qualified',True):
            assert r['original_wait']['joined'] and r['original_wait']['exit']==0
            assert int(r['wait_output'])==s['ExitCode']
        else:assert 'original_wait' not in r and r['stopped_confirmed']
    rows.append(dict(test=name,owner_pid=owner['owner_pid'],owner_ppid=owner['owner_ppid'],
                     containers=[dict(id=x['id'],role=x['role'],exit=states[x['id']]['State']['ExitCode'],original_wait_qualified=x.get('original_wait_qualified',True)) for x in containers],
                     all_original_children_joined=True))
service=sp.check_output(['systemctl','show','tiny-repeat-owner-repaired-20261020','-p','MainPID','-p','ActiveState','-p','RuntimeMaxUSec','-p','InvocationID'],text=True)
print(json.dumps(dict(waiting_owner=d,service=service,tests=rows,all_exact_containers_stopped=True,no_clearance=True),indent=2))
