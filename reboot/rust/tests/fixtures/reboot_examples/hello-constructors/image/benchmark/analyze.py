"""Offline, fail-closed verification and compact aggregation of retained raw evidence."""
import argparse
import hashlib
import json
import math
from pathlib import Path
import statistics

COUNTS = {'reader': 10000, 'single_send': 1000, 'many_send': 2000, 'replay': 10000}


def percentile(values, fraction):
    assert values and 0 < fraction <= 1
    return sorted(values)[math.ceil(len(values) * fraction) - 1]


def analyze(evidence):
    evidence = Path(evidence)
    owner = json.loads((evidence / 'owner.json').read_text())
    assert owner['complete'] and owner['terminal'] and owner['all_waits_joined']
    assert not owner.get('failure') and not owner.get('cleanup_failure')
    assert len(owner['final_running_containers'].strip().splitlines()) == 1
    assert len(owner['runs']) == 6
    identities = set()
    for container in owner['containers']:
        assert container['joined'] and container['docker_wait_unix_exit'] == 0
        state = container['terminal_inspect']['State']
        assert not state['Running'] and state['Pid'] == 0 and not state['OOMKilled']
        assert int(container['docker_wait_output']) == state['ExitCode']
        assert container['terminal_inspect']['HostConfig']['PortBindings'] in ({}, None)
        identities.add(container['id'])
    results = []
    all_requests = 0
    for language in ['python', 'rust']:
        runs = [r for r in owner['runs'] if r['language'] == language]
        assert sorted(r['repetition'] for r in runs) == [1, 2, 3]
        for run in runs:
            assert run['before_restart'] == run['after_restart']
        for case, count in COUNTS.items():
            rows = []
            for run in runs:
                label = 'r'+str(run['repetition'])+'-'+language+'-'+case
                raw = json.loads((evidence / (label + '.json')).read_text())
                assert raw['case'] == case and raw['requests'] == count and raw['errors'] == 0
                assert len(raw['samples']) == count
                assert sorted(s[0] for s in raw['samples']) == list(range(count))
                assert all(s[3] is None for s in raw['samples'])
                if case == 'reader':
                    assert all(s[4] == 1056 for s in raw['samples'])
                else:
                    assert all(s[4] == 0 for s in raw['samples'])
                for fraction, field in [(.5, 'p50_ms'), (.95, 'p95_ms'), (.99, 'p99_ms')]:
                    assert raw[field] == percentile([s[2]/1e6 for s in raw['samples']], fraction)
                assert raw['successful_rps'] == count/raw['seconds']
                assert raw['concurrency'] == 8 and raw['payload_bytes'] == 64
                all_requests += count
                rows.append({key:value for key,value in raw.items() if key != 'samples'})
            results.append({'language':language,'case':case,'repetitions':3,'requests_per_repetition':count,
                'errors':0,'median_successful_rps':statistics.median(r['successful_rps'] for r in rows),
                'min_successful_rps':min(r['successful_rps'] for r in rows),'max_successful_rps':max(r['successful_rps'] for r in rows),
                'median_p50_ms':statistics.median(r['p50_ms'] for r in rows),'median_p95_ms':statistics.median(r['p95_ms'] for r in rows),'median_p99_ms':statistics.median(r['p99_ms'] for r in rows),
                'median_server_cpu_cores':statistics.median(r['resources']['server']['average_cpu_cores'] for r in rows),
                'max_server_rss_sum_bytes':max(r['resources']['server']['max_sampled_rss_sum_bytes'] for r in rows),
                'max_server_cgroup_memory_bytes':max(r['resources']['server']['max_sampled_cgroup_memory_bytes'] for r in rows),
                'max_client_cpu_cores':max(r['client_process_cpu_cores'] for r in rows),
                'max_client_cgroup_cpu_cores':max(r['resources']['loadgen']['average_cpu_cores'] for r in rows),
                'max_client_rss_sum_bytes':max(r['resources']['loadgen']['max_sampled_rss_sum_bytes'] for r in rows),
                'client_nr_throttled':sum(r['resources']['loadgen']['nr_throttled_delta'] for r in rows),
                'runs':rows})
    ratios = {}
    for case in COUNTS:
        vals = {r['language']:r['median_successful_rps'] for r in results if r['case'] == case}
        ratios[case] = vals['rust']/vals['python']
    return {'complete':True,'timed_requests':all_requests,'timed_case_runs':len(owner['runs'])*len(COUNTS),'errors':0,
            'preflight':owner['preflight'],'retained_state_verified_runs':6,'exact_container_ids':len(identities),
            'docker_wait_children_joined':len(owner['containers']),'results':results,'rust_over_python_median_rps':ratios,
            'evidence_sha256':{p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(evidence.iterdir()) if p.is_file() and p.name != 'summary.json'}}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('evidence')
    args = parser.parse_args()
    result = analyze(args.evidence)
    path = Path(args.evidence)/'summary.json'
    path.write_text(json.dumps(result, indent=2))
    print(json.dumps({k:v for k,v in result.items() if k not in ['evidence_sha256','results']}, indent=2))
    for row in result['results']:
        print(json.dumps({k:v for k,v in row.items() if k != 'runs'}))

if __name__ == '__main__':
    main()
