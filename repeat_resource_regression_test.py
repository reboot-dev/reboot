"""Regression mutations of retained real smoke; fixture labels are not results."""
import copy
import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess as sp
import tempfile
from tiny_repeat_analyze import read_jsonl, validate_resource
R=Path(__file__).resolve().parent
raw=R/'controller-smoke-evidence/repeat-controller-smoke-rust-resources.log'
sha=hashlib.sha256(raw.read_bytes()).hexdigest()
rows=read_jsonl(raw)
for row in rows:validate_resource(row,boundary=True)
valid=next(r for r in rows if r['containers'])
with tempfile.TemporaryDirectory(prefix='repeat-schema-red-',dir=str(R.parent)) as tmp:
    p=Path(tmp)/'old.py';p.write_bytes(sp.check_output(['git','show','9110b751:tiny_repeat_analyze.py']))
    spec=importlib.util.spec_from_file_location('old',p);old=importlib.util.module_from_spec(spec);spec.loader.exec_module(old)
    cases=[]
    for key in ['stack','system_services','host_stat','host_swaps','host_vmstat']:
        r=copy.deepcopy(valid);del r[key];cases.append((key,r))
    cid=next(iter(valid['containers']))
    for key in ['processes','memory.stat']:
        r=copy.deepcopy(valid);del r['containers'][cid][key];cases.append((key,r))
    r=copy.deepcopy(valid);r['containers'][cid]['cpu.stat']='usage_usec 0\n';cases.append(('missing_throttle_counters',r))
    outcomes=[]
    for name,r in cases:
        old.validate_resource(r)
        try:validate_resource(r)
        except ValueError:pass
        else:raise AssertionError('new accepted '+name)
        outcomes.append(dict(mutation=name,old='RED accepted',new='GREEN rejected'))
    p=Path(tmp)/'malformed.jsonl';p.write_text(json.dumps(valid)+'\n{"partial":')
    before=p.read_bytes()
    try:read_jsonl(p)
    except json.JSONDecodeError:pass
    else:raise AssertionError('malformed line accepted')
    assert p.read_bytes()==before
    # Only explicit empty no-stack boundary may omit the whole stack.
    boundary=copy.deepcopy(valid);boundary.pop('stack');boundary['containers']={}
    validate_resource(boundary,boundary=True)
    try:validate_resource(boundary)
    except ValueError:pass
    else:raise AssertionError('steady-state accepted no stack')
assert hashlib.sha256(raw.read_bytes()).hexdigest()==sha
print(json.dumps(dict(real_smoke_records=len(rows),mutations=outcomes,malformed_raw_preserved=True,explicit_boundary_mode=True,benchmark_claim=False),indent=2))
