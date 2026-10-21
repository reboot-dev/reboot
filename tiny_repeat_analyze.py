"""Strict independent analyzer for one complete repeat; never repairs evidence."""
import copy
import json
import math
from pathlib import Path
import statistics
import sys

COUNTS={'reader':10000,'single_send':1000,'many_send':2000,'replay':10000}


def require(condition, message):
    if not condition:
        raise ValueError(message)


def number(value):
    require(isinstance(value,(int,float)) and not isinstance(value,bool) and math.isfinite(value), 'nonfinite/non-numeric value')
    return value


def counters(text):
    require(isinstance(text,str) and bool(text.strip()),'missing counter text')
    result={}
    for line in text.splitlines():
        parts=line.split()
        require(len(parts)==2 and parts[0] not in result,'malformed counter record')
        require(parts[1].isdigit(),'malformed counter value')
        result[parts[0]]=int(parts[1])
    return result


def validate(r, expected):
    require(isinstance(r,dict),'sample result not object')
    samples=r.get('samples')
    require(isinstance(samples,list) and len(samples)==expected and expected>0,'incomplete sample count')
    require(r.get('requests')==expected and r.get('errors')==0,'request/error count')
    latencies=[]
    for i,s in enumerate(samples):
        require(isinstance(s,list) and len(s)==5,'malformed RPC sample')
        require(s[0]==i and s[3] is None,'ordinal/error sample')
        require(number(s[1])>=0 and number(s[2])>0,'negative RPC times')
        require(isinstance(s[4],int) and s[4]>=0,'invalid response byte count')
        latencies.append(s[2]/1e6)
    seconds=number(r.get('seconds'))
    require(seconds>0,'nonpositive wall time')
    for p,key in [(0.5,'p50_ms'),(.95,'p95_ms'),(.99,'p99_ms')]:
        require(sorted(latencies)[math.ceil(p*expected)-1]==number(r.get(key)),'incorrect percentile '+key)
    require(math.isclose(expected/seconds,number(r.get('successful_rps')),rel_tol=1e-10),'incorrect throughput')
    require(max(s[1]+s[2] for s in samples)<=seconds*1e9+1e6,'RPC bounds exceed measured wall time')
    return {k:r[k] for k in ['requests','errors','seconds','successful_rps','p50_ms','p95_ms','p99_ms']}


def host_memory(text):
    require(isinstance(text,str),'meminfo not string')
    result={}
    for line in text.splitlines():
        a=line.split()
        require(len(a) in [2,3] and a[0].endswith(':') and a[1].isdigit(),'malformed meminfo')
        require(len(a)==2 or a[2]=='kB','malformed meminfo units')
        result[a[0][:-1]]=int(a[1])*(1024 if len(a)==3 else 1)
    require(all(k in result for k in ['MemTotal','MemAvailable','SwapTotal','SwapFree']),'incomplete meminfo')
    require(result['SwapTotal']==0,'host has swap')
    return result


def validate_resource(r, boundary=False):
    from tiny_repeat_schema import validate as strict_validate
    return strict_validate(r, boundary)


def read_jsonl(path):
    lines=path.read_text().splitlines()
    require(bool(lines),'empty '+str(path))
    return [json.loads(line) for line in lines]


def analyze(directory):
    E=Path(directory)
    d=json.loads((E/'owner.json').read_text())
    require(d.get('complete') is True and not d['failures'],'incomplete/failing owner')
    require(d.get('all_original_unix_children_joined') is True and 'end' in d,'owner not retired')
    require(all(c['joined'] and 'exit' in c for c in d['children']),'unjoined original child')
    perf=[r for r in d['stacks'] if r['label'].startswith('repeat-perf-')]
    require(len(perf)==6 and all(r['complete'] for r in perf),'six complete performance runs required')
    expected={(i,l) for i in range(1,4) for l in ['rust','python']}
    require({(int(r['label'].split('-')[2]),r['language']) for r in perf}==expected,'missing/duplicate performance run')
    require(d['comparison']['records_each']==22 and d['comparison']['deterministic_records_exact']==21 and d['comparison']['concurrent_membership_multiplicity_equal'],'startup comparison')
    qualification=[r for r in d['stacks'] if r['label'].startswith('repeat-qualification-')]
    require(len(qualification)==2 and all(r['complete'] and r['soak_iterations']>=2 for r in qualification),'missing soak/qualification')
    for run in d['stacks']:
        require(all(c.get('retired') is True and c['original_wait']['joined'] for c in run['containers']),'container original custody incomplete')
        roles=[c['role'] for c in run['containers'] if not c.get('restart') and c['role']!='config']
        require(sorted(roles)==(['app','engine'] if run['language']=='rust' else ['app']),'stack topology')
        require(all(c['terminal']['State']['OOMKilled'] is False for c in run['containers']),'container OOM')
    require(d['client_terminal']['State']['Pid']==0 and not d['client_terminal']['State']['Running'],'client retirement')
    events=read_jsonl(E/'events.jsonl')
    clocks=d['clock_bounds']
    offset_lo=max(x['offset_lo'] for x in clocks);offset_hi=min(x['offset_hi'] for x in clocks)
    require(offset_lo<=offset_hi,'clock bounds do not intersect')
    rows=[]
    phase_resources=[]
    # Validate every phase, including qualification/soak and restart boundaries.
    for run in d['stacks']:
        resources=[validate_resource(r, boundary=True) for r in read_jsonl(E/(run['label']+'-resources.log'))]
        require(len(resources)>=2,'empty phase resource coverage')
        require(all(0<b['time']-a['time']<2 and b['monotonic_ns']>a['monotonic_ns'] for a,b in zip(resources,resources[1:])), 'phase resource gap/order')
        starts=[e for e in events if e['kind']=='client_start' and e.get('label','').startswith(run['label']) and '-boot-' not in e['label'] and '-restart-ready-' not in e['label']]
        require(bool(starts),'missing qualification/performance client intervals')
        ids={c['id'] for c in run['containers'] if c['role']!='config'}
        for start in starts:
            ends=[e for e in events if e['kind']=='client_end' and e.get('label')==start['label']]
            require(len(ends)==1,'incomplete phase interval')
            lo=start['time']+offset_hi;hi=ends[0]['time']+offset_lo
            # Include nearest bracketing samples for sub-250ms correctness calls.
            before=[s for s in resources if s['time']<=lo]
            after=[s for s in resources if s['time']>=hi]
            require(before and after,'unbracketed phase interval')
            samples=[before[-1]]+[s for s in resources if lo<s['time']<hi]+[after[0]]
            require(lo-samples[0]['time']<2 and samples[-1]['time']-hi<2,'phase boundary gap')
            require(all(ids<=s['containers'].keys() for s in samples),'phase exact-container coverage')
            for s in samples:validate_resource(s)
        if run in qualification:
            soak=[s for s in starts if '-soak-' in s['label']]
            require(len(soak)==run['soak_iterations'] and len(soak)>=2,'soak interval count')
            ends=[e['time'] for e in events if e['kind']=='client_end' and e.get('label') in {s['label'] for s in soak}]
            require(max(ends)-min(s['time'] for s in soak)>=300,'short soak')
        active=[s for s in resources if ids<=s['containers'].keys()]
        require(active,'missing active phase resources')
        phase_resources.append(dict(label=run['label'],samples=len(resources),
            max_sampled_whole_stack_bytes=max(int(s['stack']['memory.current']) for s in active),
            max_sampled_services_bytes=max(sum(int(v['memory.current']) for v in s['system_services'].values()) for s in active),
            min_host_memavailable_bytes=min(host_memory(s['host_meminfo'])['MemAvailable'] for s in active),
            whole_stack_growth_bytes=int(active[-1]['stack']['memory.current'])-int(active[0]['stack']['memory.current'])))
    for run in perf:
        resources=[validate_resource(r, boundary=True) for r in read_jsonl(E/(run['label']+'-resources.log'))]
        ids=[c['id'] for c in run['containers'] if c['role']!='config' and not c.get('restart')]
        for case,count in COUNTS.items():
            label=run['label']+'-'+case
            raw=json.loads((E/(label+'.log')).read_text())
            r=validate(raw,count)
            incremental=read_jsonl(E/(label+'-rpc.jsonl'))
            require(sorted(incremental,key=lambda s:s[0])==raw['samples'],'incremental RPC evidence mismatch')
            require(raw['case']==case and raw['concurrency']==8 and raw['payload_bytes']==64,'workload mismatch')
            start=[e for e in events if e['kind']=='client_start' and e.get('label')==label]
            end=[e for e in events if e['kind']=='client_end' and e.get('label')==label]
            require(len(start)==len(end)==1,'missing/duplicate case interval')
            lo=start[0]['time']+offset_hi;hi=end[0]['time']+offset_lo
            samples=[s for s in resources if lo<=s['time']<=hi]
            require(len(samples)>=2,'insufficient resource coverage')
            require(all(all(cid in s['containers'] for cid in ids) for s in samples),'missing exact-container samples')
            require(not any(s['errors'] for s in samples),'resource sampler errors inside workload')
            require(samples[0]['time']-lo<2 and hi-samples[-1]['time']<2,'resource boundary gap')
            gaps=[b['time']-a['time'] for a,b in zip(samples,samples[1:])]
            require(max(gaps)<2,'resource sampling gap >=2s')
            r.update(language=run['language'],repetition=int(run['label'].split('-')[2]),case=case,
                     max_sampled_stack_cgroup_bytes=max(sum(int(s['containers'][cid]['memory.current']) for cid in ids) for s in samples),
                     max_sampled_stack_rss_sum_bytes=max(sum(s['containers'][cid]['rss_sum_bytes'] for cid in ids) for s in samples),
                     max_sampled_host_used_bytes=max(host_memory(s['host_meminfo'])['MemTotal']-host_memory(s['host_meminfo'])['MemAvailable'] for s in samples),
                     min_host_memavailable_bytes=min(host_memory(s['host_meminfo'])['MemAvailable'] for s in samples),
                     resource_interval_seconds=samples[-1]['time']-samples[0]['time'],
                     maximum_sample_gap_seconds=max(gaps),
                     stack_cpu_seconds=sum(counters(samples[-1]['containers'][cid]['cpu.stat'])['usage_usec']-counters(samples[0]['containers'][cid]['cpu.stat'])['usage_usec'] for cid in ids)/1e6,
                     cgroup_growth_bytes=sum(int(samples[-1]['containers'][cid]['memory.current'])-int(samples[0]['containers'][cid]['memory.current']) for cid in ids))
            rows.append(r)
    aggregates=[]
    for lang in ['rust','python']:
        for case in COUNTS:
            rr=[r for r in rows if r['language']==lang and r['case']==case]
            require(len(rr)==3,'three repetitions required')
            keys=['successful_rps','p50_ms','p95_ms','p99_ms','max_sampled_stack_cgroup_bytes','max_sampled_stack_rss_sum_bytes','max_sampled_host_used_bytes']
            aggregates.append(dict(language=lang,case=case,**{k:statistics.median(r[k] for r in rr) for k in keys},rps_min=min(r['successful_rps'] for r in rr),rps_max=max(r['successful_rps'] for r in rr)))
    return dict(verified=True,images=d['images'],comparison=d['comparison'],rows=rows,aggregates=aggregates,phase_resources=phase_resources,
                percentile='nearest rank, median of per-run percentiles; not pooled',
                resources='250ms nominal sampled maxima; resource interval includes client initialization, RPC denominator does not; RSS can double count shared pages; footprint not minimum RAM',
                clock_offset_bounds=[offset_lo,offset_hi])


def self_test():
    valid=dict(samples=[[0,0,1000000,None,0],[1,1000000,2000000,None,0]],requests=2,errors=0,seconds=.004,
               successful_rps=500,p50_ms=1,p95_ms=2,p99_ms=2)
    validate(valid,2)
    bad=[]
    for field,value in [('samples',[]),('samples',[[0,0,1,None,0]]),('samples',[[0,0,1,None,0],[1,0,1]]),
                        ('errors',1),('seconds',0),('seconds',float('nan')),('successful_rps',999),('p99_ms',0)]:
        r=copy.deepcopy(valid);r[field]=value;bad.append(r)
    bad.append(dict(valid,samples=[[0,0,1000000,None,0],[0,1000000,2000000,None,0]]))
    bad.append(dict(valid,samples=[[0,0,1000000,'TIMEOUT','error'],[1,1000000,2000000,None,0]]))
    for i,r in enumerate(bad):
        try: validate(r,2)
        except ValueError: pass
        else: raise AssertionError('negative RPC accepted '+str(i))
    for r in [{},{'time':0,'monotonic_ns':0,'containers':{},'errors':[],'host_meminfo':'bad'},
              {'time':'bad','monotonic_ns':0,'containers':{},'errors':[]}]:
        try: validate_resource(r)
        except ValueError: pass
        else: raise AssertionError('malformed resource accepted')
    for text in ['','usage_usec','usage_usec NaN','a 1\na 2','a -1']:
        try:counters(text)
        except ValueError:pass
        else:raise AssertionError('malformed counters accepted')
    print(json.dumps(dict(analyzer_negative_tests=True,rpc_rejections=len(bad),resource_rejections=3,counter_rejections=5)))


if __name__=='__main__':
    if sys.argv[1]=='--self-test':self_test()
    else:
        output=analyze(sys.argv[1])
        from tiny_repeat_control import atomic
        atomic(Path(sys.argv[1])/'summary.json',output)
        print(json.dumps(output['aggregates'],indent=2))
