"""Real SSH/preflight/readiness drill. Never invokes a benchmark case."""
import json
from pathlib import Path
import sys
import tiny_repeat_owner as m
base=m.ROOT
config=json.loads((base/'config.json').read_text())
mode=sys.argv[1]
root=base/('regression-'+mode)
root.mkdir()
(root/'bench').symlink_to(base/'bench',target_is_directory=True)
m.ROOT=root
config.update(results_name='results',owner_seconds=600)
if mode=='fatal':
    # Real authentication failure with a nonexistent identity; no fake connection.
    config['ssh_key']='/root/.ssh/does-not-exist-tiny-repeat-regression'
    (root/'TIMING-CLEARANCE.json').write_text(json.dumps(dict(heavy_owner_retired=True,no_heavy_suite_overlap=True,review='FAULT TEST ONLY: must fail preflight before workloads')))
    class Fatal(m.Benchmark):
        def stack(self,*a):
            raise AssertionError('fault test must never reach stack')
    b=Fatal(config)
    assert b.execute()==1
    d=json.loads((root/'results/owner.json').read_text())
    receipt=json.loads((root/'results/exit-receipt.json').read_text())
    assert d['gate']=='failed' and d['failure_gate']=='preflight' and d['end']
    assert d['all_original_unix_children_joined'] and not d['stacks']
    assert 'app-only SSH tunnel exited' in d['failures'][0]
    assert receipt['exit_status']==1 and receipt['all_original_unix_children_joined']
    assert d['client_terminal']['State']['Pid']==0
else:
    b=m.Benchmark(config)
    try:
        b.preflight()
        assert b.tunnel[1].poll() is None
        for lang in ['rust','python']:
            b.stack(lang,'ingress-regression-'+lang)
            assert b.tunnel[1].poll() is None
            app=[r for r,c in b.active if r['role']=='app'][0]
            inspection=b.inspect(app['id'])
            assert all(k in ['9990/tcp','9991/tcp'] for k in inspection['HostConfig']['PortBindings'])
            if lang=='rust':
                engine=[r for r,c in b.active if r['role']=='engine'][0]
                i=b.inspect(engine['id'])
                assert not i['HostConfig']['PortBindings']
                assert len(i['NetworkSettings']['Networks'])==1
                n=json.loads(b.tiny('docker','network','inspect',b.row['network']))[0]
                assert n['Internal'] is True
            b.restart('ingress-regression-'+lang+'-restart')
            b.stop_stack()
    finally:
        b.o.begin_cleanup()
        for action in [b.stop_stack,b.stop_client,b.stop_tunnel]:
            action()
        b.o.finish()
    assert b.o.ledger['all_original_unix_children_joined']
    assert not b.o.ledger['failures']
    assert all(r['retired'] and r['original_wait']['joined'] for s in b.o.ledger['stacks'] for r in s['containers'])
print(json.dumps(dict(mode=mode,passed=True,benchmark=False)),flush=True)
