"""One tiny-host sampler, 250ms nominal; explicit transient/malformed errors."""
import json
from pathlib import Path
import select
import sys
import time
from typing import Any

ROOT = Path('/sys/fs/cgroup/tinyrepeat.slice')
FIELDS = ['memory.current', 'memory.peak', 'memory.events', 'memory.stat',
          'memory.swap.current', 'memory.swap.max', 'memory.max', 'cpu.stat',
          'memory.pressure', 'cpu.pressure', 'cgroup.procs']


def snapshot():
    d: dict[str, Any] = dict(time=time.time(), monotonic_ns=time.monotonic_ns(), containers={}, errors=[])
    for name, path in [('host_meminfo', '/proc/meminfo'), ('host_memory_psi', '/proc/pressure/memory'),
                       ('host_cpu_psi', '/proc/pressure/cpu'), ('host_stat', '/proc/stat'),
                       ('host_vmstat', '/proc/vmstat'), ('host_swaps', '/proc/swaps')]:
        d[name] = Path(path).read_text()
    if ROOT.exists():
        d['stack'] = {n: (ROOT/n).read_text() for n in FIELDS if (ROOT/n).exists()}
        for p in ROOT.glob('docker-*.scope'):
            cid = p.name[7:-6]
            try:
                v: dict[str, Any] = {n: (p/n).read_text() for n in FIELDS}
                rss = 0
                processes = {}
                for pid in v['cgroup.procs'].split():
                    try:
                        status = Path('/proc/'+pid+'/status').read_text()
                        procstat = Path('/proc/'+pid+'/stat').read_text()
                        rss += int(next(l for l in status.splitlines() if l.startswith('VmRSS:')).split()[1])*1024
                        processes[pid] = dict(status=status, stat=procstat)
                    except (OSError, StopIteration) as error:
                        d['errors'].append(dict(container=cid, pid=pid, error=repr(error)))
                v.update(rss_sum_bytes=rss, processes=processes)
                d['containers'][cid] = v
            except OSError as error:
                d['errors'].append(dict(container=cid, error=repr(error)))
    d['system_services'] = {}
    for service in ['docker.service', 'containerd.service', 'ssh.service']:
        p = Path('/sys/fs/cgroup/system.slice')/service
        if p.exists():
            d['system_services'][service] = {n: (p/n).read_text() for n in ['memory.current','cpu.stat']}
    return d


if __name__ == '__main__':
    due = time.monotonic()
    while True:
        print(json.dumps(snapshot()), flush=True)
        due += .25
        delay = max(0, due-time.monotonic())
        if select.select([sys.stdin], [], [], delay)[0]:
            break
        if time.monotonic()-due > 1:
            due = time.monotonic()
