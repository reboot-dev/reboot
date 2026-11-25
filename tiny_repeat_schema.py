"""Fail-closed raw telemetry schema; boundary is explicit, never inferred."""
import re
from tiny_repeat_analyze import require, number, counters, host_memory

CPU = {'usage_usec','user_usec','system_usec','nr_periods','nr_throttled','throttled_usec'}
EVENTS = {'low','high','max','oom','oom_kill'}
MEM = {'anon','file','kernel','kernel_stack','pagetables','sock','shmem','slab','pgfault','pgmajfault'}

def integer(text):
    require(isinstance(text,str) and text.strip().isdigit(), 'missing/malformed integer')
    return int(text)

def counterset(text, keys):
    values=counters(text)
    require(keys <= values.keys(), 'missing required counter '+str(keys-values.keys()))
    return values

def psi(text):
    require(isinstance(text,str), 'missing PSI')
    rows={}
    for line in text.splitlines():
        a=line.split(); require(len(a)==5 and a[0] not in rows, 'malformed PSI')
        values=dict(x.split('=') for x in a[1:])
        require(set(values)=={'avg10','avg60','avg300','total'},'PSI fields')
        require(all(number(float(v))>=0 for v in values.values()),'negative PSI')
        rows[a[0]]=values
    require(set(rows)=={'some','full'}, 'missing PSI scope')

def group(v, stack=False):
    require(isinstance(v,dict),'missing cgroup')
    for k in ['memory.current','memory.peak','memory.swap.current']:
        integer(v.get(k))
    for k in ['memory.max','memory.swap.max']:
        require(isinstance(v.get(k),str) and (v[k].strip()=='max' or v[k].strip().isdigit()),'missing cgroup limit')
    require(integer(v['memory.swap.current'])==0, 'swap used')
    if stack: require(v['memory.swap.max'].strip()=='0','whole-stack swap guard')
    counterset(v.get('cpu.stat'),CPU)
    e=counterset(v.get('memory.events'),EVENTS)
    require(e['oom']==e['oom_kill']==0,'OOM event')
    counterset(v.get('memory.stat'),MEM)
    psi(v.get('memory.pressure'));psi(v.get('cpu.pressure'))
    require(isinstance(v.get('cgroup.procs'),str),'missing process census')
    pids=v['cgroup.procs'].split()
    require(all(p.isdigit() for p in pids) and len(pids)==len(set(pids)), 'malformed process census')
    if not stack:
        processes=v.get('processes')
        require(isinstance(processes,dict) and set(processes)==set(pids),'missing process records')
        rss=0
        for pid,p in processes.items():
            require(isinstance(p,dict) and isinstance(p.get('status'),str) and isinstance(p.get('stat'),str),'missing process status/stat')
            require(p['stat'].startswith(pid+' (') and len(p['stat'].rsplit(')',1)[-1].split())>=22,'malformed process stat')
            status={a.split(':',1)[0]:a.split(':',1)[1].strip() for a in p['status'].splitlines() if ':' in a}
            require(status.get('Pid')==pid,'process PID mismatch')
            require(re.fullmatch(r'\d+\s+kB',status.get('VmRSS','')) is not None,'missing RSS')
            require(re.fullmatch(r'0\s+kB',status.get('VmSwap','')) is not None,'process swap')
            rss+=int(status['VmRSS'].split()[0])*1024
        require(type(v.get('rss_sum_bytes')) is int and v['rss_sum_bytes']==rss,'RSS census mismatch')

def validate(r, boundary=False):
    require(isinstance(r,dict), 'resource not object')
    number(r.get('time'));number(r.get('monotonic_ns'))
    require(isinstance(r.get('errors'),list) and isinstance(r.get('containers'),dict),'resource envelope')
    require(not r['errors'],'sampler errors (raw preserved; no silent repair)')
    host_memory(r.get('host_meminfo'))
    require(isinstance(r.get('host_swaps'),str) and r['host_swaps'].splitlines()==['Filename\t\t\t\tType\t\tSize\t\tUsed\t\tPriority'],'missing/active swap census')
    for k in ['host_memory_psi','host_cpu_psi']:psi(r.get(k))
    stat=r.get('host_stat');require(isinstance(stat,str),'missing host CPU')
    lines=[l.split() for l in stat.splitlines()]
    require(bool(lines) and lines[0][0]=='cpu' and len(lines[0])>=9 and all(x.isdigit() for x in lines[0][1:]),'malformed host CPU')
    vm=counterset(r.get('host_vmstat'),{'pswpin','pswpout','oom_kill','pgfault','pgmajfault'})
    require(vm['pswpin']==vm['pswpout']==vm['oom_kill']==0,'host swap/OOM history')
    services=r.get('system_services');require(isinstance(services,dict),'missing services')
    require({'docker.service','containerd.service','ssh.service'}<=services.keys(),'missing service counter')
    for v in services.values():
        integer(v.get('memory.current'));counterset(v.get('cpu.stat'),CPU)
    if boundary and not r['containers'] and 'stack' not in r:
        return r  # only known no-stack startup/retirement boundary
    group(r.get('stack'),True)
    for cid,v in r['containers'].items():
        require(re.fullmatch('[0-9a-f]{64}',cid) is not None,'container ID')
        group(v)
    return r
