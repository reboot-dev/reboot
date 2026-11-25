"""Finite CCX43-only Docker benchmark owner. No build/pull/prune/removal."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import threading
import time
import traceback
import uuid

IMAGES = {
    'rust': 'sha256:f2b48e8e9ef922b0aadc558c3c4e4c8db0b19ab712fc53f7ed75bf7e6e45fc06',
    'database': 'sha256:1a73705b0771f9c861d9ba96509806849423a3d8bbff140b1261da76280460cd',
    'python': 'sha256:3e48dc3ed3642bd468e4a700acf8bdedb95fee038fda13c0749f01e381f67194',
}
PYTHON = '/opt/rbt.runfiles/python3_10_12_x86_64-unknown-linux-gnu/bin/python3'
CASES = ['reader', 'single_send', 'many_send', 'replay']
HERE = Path(__file__).resolve().parent


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--out', required=True, type=Path)
    parser.add_argument('--name', required=True)
    args = parser.parse_args()
    assert subprocess.check_output(['hostname'], text=True).strip() == 'jean-reboot-rust-validation-ccx43'
    assert args.name.startswith('hello-bench-')
    E = args.out.resolve(); E.mkdir(parents=True, exist_ok=False)
    ledger = {'owner_pid': os.getpid(), 'commands': [], 'containers': [], 'runs': [], 'complete': False}
    active = []
    command_lock = threading.Lock()

    def save():
        (E / 'owner.json').write_text(json.dumps(ledger, indent=2))

    def run(argv, timeout=240, check=True):
        p = subprocess.Popen(argv, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
        try:
            output, _ = p.communicate(timeout=timeout)
        except BaseException:
            p.terminate(); p.communicate(timeout=30); raise
        with command_lock:
            ledger['commands'].append({'argv': argv, 'pid': p.pid, 'unix_wait_exit': p.returncode, 'output': output})
            save()
        if check and p.returncode:
            raise RuntimeError((argv, p.returncode, output))
        return output

    def inspect(cid):
        return json.loads(run(['docker', 'inspect', cid]))[0]

    def start(name, image, network, cpus, memory, command=(), extra=()):
        argv = ['docker', 'run', '--detach', '--pull=never', '--init', '--name', name,
                '--label', 'owner=' + args.name, '--network', network, '--cpuset-cpus', '8,10' if name.endswith('-client') else '0,2,4,6',
                '--cpus', str(cpus), '--memory', memory, '--memory-swap', memory]
        argv += list(extra) + [IMAGES[image]] + list(command)
        cid = run(argv).strip()
        # The exact started container, not a merely created container, is waited.
        inspection = inspect(cid)
        assert inspection['Id'] == cid and inspection['State']['StartedAt'] != '0001-01-01T00:00:00Z'
        wait = subprocess.Popen(['docker', 'wait', cid], stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
        item = {'name': name, 'id': cid, 'image': inspection['Image'], 'initial_inspect': inspection, 'docker_wait_pid': wait.pid, 'joined': False}
        ledger['containers'].append(item); active.append((item, wait)); save()
        return cid

    def retire():
        # Reverse startup order: loadgen, app, engine, config.
        failures = []
        while active:
            item, waiter = active.pop()
            try:
                state = inspect(item['id'])['State']
                if state['Running']:
                    run(['docker', 'stop', '--time', '30', item['id']], timeout=60)
                output, _ = waiter.communicate(timeout=60)
                terminal = inspect(item['id'])
                item.update(joined=True, docker_wait_unix_exit=waiter.returncode, docker_wait_output=output.strip(), terminal_inspect=terminal)
                assert waiter.returncode == 0 and int(output.strip()) == terminal['State']['ExitCode']
                assert not terminal['State']['Running'] and terminal['State']['Pid'] == 0 and not terminal['State']['OOMKilled']
                expected = 143 if item['name'].endswith(('-python', '-client')) else 0
                assert terminal['State']['ExitCode'] == expected, (item['name'], terminal['State'])
                (E / (item['name'] + '.log')).write_text(run(['docker', 'logs', item['id']], check=False))
            except BaseException:
                failures.append(traceback.format_exc())
            save()
        if failures:
            raise RuntimeError(failures)

    def client(cid, endpoint, prefix, mode, key, suffix=''):
        raw = run(['docker', 'exec', cid, PYTHON, '/bench/client.py', endpoint, prefix, mode, key] + ([suffix] if suffix else []))
        return json.loads(raw)

    def stack(lang, label):
        # Never coexist with another owner's running stack; stopped unknown resources are untouched.
        assert not run(['docker', 'ps', '-q']).strip(), 'Competing running Docker owner'
        network = args.name + '-' + label
        run(['docker', 'network', 'create', '--internal', '--label', 'owner=' + args.name, network])
        volume = network + '-state'
        assert not run(['docker', 'volume', 'ls', '--format', '{{.Name}}', '--filter', 'name=^' + volume + '$']).strip()
        run(['docker', 'volume', 'create', '--label', 'owner=' + args.name, volume])
        if lang == 'rust':
            start(network+'-config', 'rust', network, 1, '1g', ['--server-info', '/state/server-info.pb'], ['-v', volume+':/state'])
            # Ensure config has completed before engine starts. Its Docker wait remains owned.
            deadline = time.monotonic()+30
            while inspect(active[-1][0]['id'])['State']['Running']:
                assert time.monotonic() < deadline; time.sleep(.1)
            assert inspect(active[-1][0]['id'])['State']['ExitCode'] == 0
            start(network+'-database', 'database', network, 3, '3g', ['/state/rocksdb', '/state/server-info.pb', '20000'], ['-v', volume+':/state', '--network-alias', 'database'])
            deadline = time.monotonic()+60
            while inspect(active[-1][0]['id'])['State'].get('Health', {}).get('Status') != 'healthy':
                assert time.monotonic() < deadline; time.sleep(.2)
            app = start(network+'-rust', 'rust', network, 1, '1g', extra=['--network-alias', 'rust', '-e', 'RBT_NAME=hello-image-qualified', '-e', 'RBT_RUST_DATABASE_URL=http://database:20000', '-e', 'RBT_RUST_LISTEN_ADDR=0.0.0.0:9990'])
            endpoint = 'rust:9990'
        else:
            app = start(network+'-python', 'python', network, 4, '4g', extra=['-v', volume+':/state', '--network-alias', 'python'])
            endpoint = 'python:9991'
        load = start(network+'-client', 'python', network, 2, '1g', ['-c', 'import time; time.sleep(3600)'], ['--entrypoint', PYTHON, '--no-healthcheck', '-v', str(HERE)+':/bench:ro'])
        # Read-only canonical boot request; retries are readiness, not measurements.
        deadline = time.monotonic()+90
        while True:
            raw = run(['docker', 'exec', load, PYTHON, '/bench/shared_probe.py', endpoint, 'unused', KEY, '--boot'], check=False)
            if '"complete": true' in raw:
                break
            assert time.monotonic() < deadline, raw; time.sleep(.5)
        return load, endpoint, app, volume

    def snapshot(cids):
        values = {}
        for cid, cg in cids.items():
            stat = {k: int(v) for k, v in (line.split() for line in (cg/'cpu.stat').read_text().splitlines())}
            rss = 0; pids = (cg/'cgroup.procs').read_text().split()
            for pid in pids:
                try:
                    for line in Path('/proc/'+pid+'/status').read_text().splitlines():
                        if line.startswith('VmRSS:'): rss += int(line.split()[1]) * 1024
                except FileNotFoundError:
                    pass
            values[cid] = {'cpu': stat, 'memory_current_bytes': int((cg/'memory.current').read_text()), 'rss_sum_bytes': rss, 'processes': len(pids)}
        return {'monotonic_ns': time.monotonic_ns(), 'containers': values}

    def measured(load, endpoint, prefix, case, path):
        groups = {}
        roles = {}
        for item, waiter in active:
            if item['name'].endswith('-config'): continue
            pid = inspect(item['id'])['State']['Pid']
            cg = Path('/sys/fs/cgroup') / Path('/proc/'+str(pid)+'/cgroup').read_text().strip().split('::',1)[1].lstrip('/')
            groups[item['id']] = cg
            roles[item['id']] = 'loadgen' if item['id'] == load else 'server'
        stop = threading.Event(); samples = [snapshot(groups)]
        def sampling():
            while not stop.wait(.25):
                samples.append(snapshot(groups))
        thread = threading.Thread(target=sampling); thread.start()
        try:
            result = client(load, endpoint, prefix, case, KEY)
        finally:
            stop.set(); thread.join(); samples.append(snapshot(groups))
            (E/(path+'-resources.json')).write_text(json.dumps({'roles': roles, 'samples': samples}))
        elapsed = (samples[-1]['monotonic_ns']-samples[0]['monotonic_ns'])/1e9
        resources = {}
        for role in ['server','loadgen']:
            ids = [cid for cid in groups if roles[cid] == role]
            cpu = sum(samples[-1]['containers'][cid]['cpu']['usage_usec']-samples[0]['containers'][cid]['cpu']['usage_usec'] for cid in ids)/1e6
            resources[role] = {'cpu_seconds': cpu, 'average_cpu_cores': cpu/elapsed,
                'max_sampled_rss_sum_bytes': max(sum(s['containers'][cid]['rss_sum_bytes'] for cid in ids) for s in samples),
                'max_sampled_cgroup_memory_bytes': max(sum(s['containers'][cid]['memory_current_bytes'] for cid in ids) for s in samples),
                'nr_throttled_delta': sum(samples[-1]['containers'][cid]['cpu']['nr_throttled']-samples[0]['containers'][cid]['cpu']['nr_throttled'] for cid in ids)}
        result['resources'] = resources
        (E/(path+'.json')).write_text(json.dumps(result))
        return {k:v for k,v in result.items() if k != 'samples'}

    def interrupted(sig, frame):
        raise KeyboardInterrupt('owner signal '+str(sig))
    signal.signal(signal.SIGTERM, interrupted); signal.signal(signal.SIGINT, interrupted)
    KEY = str(uuid.UUID(int=(((time.time_ns()//1000000)+3600000)<<80)|(7<<76)|(2<<62)))
    ledger['key_base'] = KEY
    try:
        ledger['initial_running_containers'] = run(['docker','ps','--no-trunc'])
        assert not run(['docker','ps','-q']).strip()
        ledger['environment'] = {command[0]:run(command) for command in [
            ['uname','-a'],['lscpu'],['free','-b'],['df','-h'],['docker','version'],['docker','info'],['date','--iso-8601=seconds'],['ps','-eo','pid,pcpu,pmem,args','--sort=-pcpu']]}
        ledger['images'] = {name:json.loads(run(['docker','image','inspect',image]))[0] for name,image in IMAGES.items()}
        ledger['source_sha256'] = {p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in HERE.iterdir() if p.is_file()}
        # Both image preflights complete and compare BEFORE timed work begins.
        transcripts = []
        for lang in ['rust','python']:
            load, endpoint, app, volume = stack(lang, 'preflight-'+lang)
            raw = run(['docker','exec',load,PYTHON,'/bench/shared_probe.py',endpoint,'benchmark-preflight',KEY])
            (E/('preflight-'+lang+'.log')).write_text(raw)
            transcript = json.loads(raw.split('TRANSCRIPT=')[-1]); assert transcript['complete']
            transcripts.append(transcript)
            retire()
        sys.path.insert(0,str(HERE))
        from transcript_comparison import compare_transcripts
        comparison = compare_transcripts(*transcripts)
        (E/'preflight-comparison.json').write_text(json.dumps(comparison,indent=2))
        ledger['preflight'] = comparison; save()
        for rep in range(3):
            for lang in (['rust','python'] if rep % 2 == 0 else ['python','rust']):
                label = f'r{rep+1}-{lang}'
                print('CURRENT '+label, flush=True)
                load, endpoint, app, volume = stack(lang,label)
                prefix = 'benchmark-r'+str(rep+1)
                client(load, endpoint, prefix, 'seed', KEY)
                row = {'repetition':rep+1,'language':lang,'volume':volume,'cases':{}}
                for case in CASES:
                    warm = client(load,endpoint,prefix,case,KEY,'--warmup')
                    (E/(label+'-'+case+'-warmup.json')).write_text(json.dumps(warm))
                    row['cases'][case] = measured(load,endpoint,prefix,case,label+'-'+case)
                    print(json.dumps({'run':label,'case':case,**{k:v for k,v in row['cases'][case].items() if k in ['successful_rps','p50_ms','p95_ms','p99_ms','errors']}}),flush=True)
                row['before_restart'] = client(load,endpoint,prefix,'verify',KEY)
                ledger['runs'].append(row); save()
                # Retained-volume full stack stop/start with independent exact-ID waits.
                old = [(item['name'],item['id']) for item,waiter in active if not item['name'].endswith('-config')]
                retire()
                for name,cid in old:
                    run(['docker','start',cid])
                    initial = inspect(cid)
                    waiter = subprocess.Popen(['docker','wait',cid],stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True)
                    item = {'name':name,'id':cid,'restart':True,'initial_inspect':initial,'docker_wait_pid':waiter.pid,'joined':False}
                    ledger['containers'].append(item);active.append((item,waiter));save()
                deadline = time.monotonic()+90
                while True:
                    raw = run(['docker','exec',load,PYTHON,'/bench/shared_probe.py',endpoint,'unused',KEY,'--boot'],check=False)
                    if '"complete": true' in raw: break
                    assert time.monotonic()<deadline;time.sleep(.5)
                row['after_restart'] = client(load,endpoint,prefix,'verify',KEY)
                assert row['before_restart'] == row['after_restart']
                save();retire()
        assert len(ledger['runs']) == 6
        ledger['complete'] = True
    except BaseException:
        ledger['failure'] = traceback.format_exc()
        raise
    finally:
        try:
            retire()
        except BaseException:
            ledger['cleanup_failure'] = traceback.format_exc()
        ledger['all_waits_joined'] = all(x['joined'] for x in ledger['containers'])
        ledger['final_running_containers'] = run(['docker','ps','--no-trunc'])
        ledger['terminal'] = True;save()
    assert ledger['complete'] and ledger['all_waits_joined'] and not ledger.get('cleanup_failure')
    print('BENCHMARK_COMPLETE '+str(E), flush=True)

if __name__ == '__main__':
    main()
