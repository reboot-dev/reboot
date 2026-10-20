"""Independent raw-sample verification; rejects missing/incomplete perf evidence."""
import json,math,statistics,sys,hashlib,datetime
from pathlib import Path
ROOT=Path(__file__).resolve().parent;E=ROOT/'tiny-runtime-results'
def stamp(s):return datetime.datetime.fromisoformat(s.replace('Z','+00:00')).timestamp()
def counter(s):return dict((a,int(b)) for a,b in (l.split() for l in s.splitlines()))
def validate(r,expected):
 s=r['samples'];assert len(s)==r['requests']==expected and [v[0] for v in s]==list(range(expected))
 errors=sum(v[3] is not None for v in s);assert errors==r['errors']==0
 vals=sorted(v[2]/1e6 for v in s)
 for p,k in [(.5,'p50_ms'),(.95,'p95_ms'),(.99,'p99_ms')]:assert vals[math.ceil(p*len(vals))-1]==r[k]
 assert math.isclose((expected-errors)/r['seconds'],r['successful_rps'])
 return {k:r[k] for k in ['requests','errors','seconds','successful_rps','p50_ms','p95_ms','p99_ms']}
def analyze():
 d=json.loads((E/'owner.json').read_text());assert d['complete'] and len(d['qualified'])==2
 runs=[r for r in d['stacks'] if r['label'].startswith('perf-')];assert len(runs)==6 and all(r.get('complete') for r in runs)
 resources=[json.loads(l) for l in (E/'per-container-resources.jsonl').read_text().splitlines()]
 events=[json.loads(l) for l in (E/'client-exec-events.jsonl').read_text().splitlines()]
 starts=[e for e in events if e['Action'].startswith('exec_start')]
 dies={e['Actor']['Attributes'].get('execID'):e for e in events if e['Action'].startswith('exec_die')}
 counts={'reader':10000,'single_send':1000,'many_send':2000,'replay':10000};rows=[]
 for run in runs:
  initial=[r for r in run['containers'] if not r.get('restart') and not r['name'].endswith('-config')]
  ids=[r['id'] for r in initial];begin=max(stamp(r['initial']['State']['StartedAt']) for r in initial);end=min(stamp(r['terminal']['State']['FinishedAt']) for r in initial)
  host=[json.loads(l) for l in (E/(run['label']+'-resources.jsonl')).read_text().splitlines()]
  for case,count in counts.items():
   p=E/(run['label']+'-'+case+'.json');r=json.loads(p.read_text());row=validate(r,count)
   row.update(language=run['language'],repetition=int(run['label'].split('-')[1]),case=case)
   matching=[e for e in starts if begin<=e['timeNano']/1e9<=end and e['Action'].rstrip().endswith(' '+d['key']) and (' perf-'+str(row['repetition'])+' '+case+' ') in e['Action']]
   assert len(matching)==1,(run['label'],case,matching,starts[:2])
   ev=matching[0];evend=dies[ev['Actor']['Attributes']['execID']];lo=ev['timeNano']/1e9;hi=evend['timeNano']/1e9
   samples=[s for s in resources if lo<=s['time']<=hi and all(cid in s['containers'] for cid in ids)];assert len(samples)>=2
   row['resource_interval_seconds']=samples[-1]['time']-samples[0]['time'];row['resource_interval_includes_client_import']=True
   row['max_sampled_stack_cgroup_bytes']=max(sum(int(s['containers'][cid]['memory.current']) for cid in ids) for s in samples)
   row['max_sampled_stack_rss_sum_bytes']=max(sum(s['containers'][cid]['rss_sum_bytes'] for cid in ids) for s in samples)
   row['stack_cpu_seconds']=sum(counter(samples[-1]['containers'][cid]['cpu.stat'])['usage_usec']-counter(samples[0]['containers'][cid]['cpu.stat'])['usage_usec'] for cid in ids)/1e6
   hs=[s for s in host if lo<=s['time']<=hi];assert hs
   row['min_host_memavailable_bytes']=min(int(next(l for l in s['host_meminfo'].splitlines() if l.startswith('MemAvailable:')).split()[1])*1024 for s in hs)
   rows.append(row)
 aggregates=[]
 for lang in ['rust','python']:
  for case in counts:
   rr=[r for r in rows if r['language']==lang and r['case']==case];assert len(rr)==3
   aggregates.append({'language':lang,'case':case,**{k:statistics.median(r[k] for r in rr) for k in ['successful_rps','p50_ms','p95_ms','p99_ms','max_sampled_stack_cgroup_bytes','max_sampled_stack_rss_sum_bytes']},'rps_min':min(r['successful_rps'] for r in rr),'rps_max':max(r['successful_rps'] for r in rr)})
 out={'verified':True,'images':d['images'],'correctness':d['comparison'],'rows':rows,'aggregates':aggregates,'percentile':'nearest rank; aggregates are medians of three per-run percentiles, not pooled','resource_interval':'250ms sampling; exact-container sums; interval uses external Docker exec start/die timestamps and includes client import/initialization; clocks checked separately'}
 (E/'summary.json').write_text(json.dumps(out,indent=2));print(json.dumps(aggregates,indent=2));return out
if __name__=='__main__':
 if '--self-test' in sys.argv:
  for r,n in [({'samples':[],'requests':0},1),({'samples':[[1,0,100,None,0]],'requests':1},1)]:
   try:validate(r,n)
   except (AssertionError,KeyError):pass
   else:raise AssertionError('bad sample accepted')
  print('invalid/incomplete sample rejection: PASS')
 else:analyze()
