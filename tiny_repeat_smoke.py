"""Actual Docker custody failure drill, NOT a timing or correctness benchmark."""
import json
from pathlib import Path
import time
import traceback
from tiny_repeat_owner import Benchmark,IMAGES,ROOT

config=json.loads((ROOT/'config.json').read_text())
config.update(results_name='results-smoke',owner_seconds=600)
b=Benchmark(config)
# No load generator and no SDK build/cache use during the heavy worker's suite.
b.ready=lambda label: None
try:
    for image in IMAGES.values():
        assert json.loads(b.tiny('docker','image','inspect',image))[0]['Id']==image
    assert len(b.tiny('cat','/proc/swaps').splitlines())==1
    b.tiny('docker','network','create','--label','owner=tiny-repeat-20261020','tinyrepeat-app-ingress')
    b.stack('rust','repeat-controller-smoke-rust')
    time.sleep(3)
    assert all(b.inspect(r['id'])['State']['Running'] for r,c in b.active)
    b.o.ledger['expected_workload_failure']='injected after real engine and application start'
    raise RuntimeError('expected injected smoke failure')
except RuntimeError as error:
    if str(error)!='expected injected smoke failure':
        b.o.ledger['failures'].append(traceback.format_exc())
finally:
    try:
        b.stop_stack()
    except BaseException:
        b.o.ledger['failures'].append(traceback.format_exc())
    b.o.finish()
assert not b.o.ledger['failures'],b.o.ledger['failures']
assert b.o.ledger['all_original_unix_children_joined']
assert all(c['retired'] and c['original_wait']['joined'] for r in b.o.ledger['stacks'] for c in r['containers'])
print(json.dumps({'actual_container_custody_smoke':True,'original_waits_joined':True,'injected_failure_cleanup':True,'benchmark_claim':False}),flush=True)
