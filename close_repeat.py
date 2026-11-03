"""Regenerate derived closure JSON files in repeat-results-20261020 (overwrites them).

This is a writing report-generation command, not a read-only verifier. It does
not edit raw evidence or change strict acceptance rules.
"""
import collections,datetime,hashlib,json,math,statistics,subprocess
from pathlib import Path
import tiny_repeat_analyze as strict
E=Path('closure/results'); O=Path('repeat-results-20261020');O.mkdir(exist_ok=True)
def save(name,obj): (O/name).write_text(json.dumps(obj,indent=2)+'\n')
def load(p):return json.loads(p.read_text())
def lines(p):return [json.loads(x) for x in p.read_text().splitlines()]
d=load(E/'owner.json');ev=lines(E/'events.jsonl');issues=[]
try:strict.analyze(E);strict_ok=True
except Exception as e:strict_ok=False;issues.append({'strict_analyzer':repr(e)})
lo=max(c['offset_lo'] for c in d['clock_bounds']);hi=min(c['offset_hi'] for c in d['clock_bounds'])
assert lo<=hi
children=d['children'];assert all(c['joined'] and 'exit' in c for c in children)
retired=[]
for run in d['stacks']:
 for c in run['containers']:
  s=c['terminal']['State'];assert s['Pid']==0 and not s['Running'] and not s['OOMKilled']
  assert c['retired'] and c['original_wait']['joined'] and int(c['wait_output'])==s['ExitCode']
  retired.append(dict(label=run['label'],id=c['id'],role=c['role'],restart=c.get('restart',False),exit_code=s['ExitCode'],original_wait=c['original_wait']))
 # Recorded order for every shutdown must retire app before engine, with restart epochs separate.
 epochs=collections.defaultdict(list)
 for c in run['containers']:epochs[bool(c.get('restart'))].append(c)
 for cs in epochs.values():
  apps=[c for c in cs if c['role']=='app'];eng=[c for c in cs if c['role']=='engine']
  if eng:
   assert max(c['original_wait']['ended'] for c in apps)<min(c['original_wait']['ended'] for c in eng)
assert d['client_terminal']['State']['Pid']==0 and d['client_wait']['joined']
assert int((E/d['client_wait']['log']).read_text().strip())==d['client_terminal']['State']['ExitCode']
save('retirement.json',dict(original_children_joined=len(children),container_lifecycles=len(retired),unique_stack_container_ids=len({c['id'] for c in retired}),app_before_engine=True,records=retired,client=d['client_terminal']['State'],exit_receipt=load(E/'exit-receipt.json')))
# Independently compare the actual raw public responses, not owner booleans.
transcripts=[]
for lang in ('rust','python'):
 text=(E/f'repeat-qualification-{lang}-correctness.log').read_text().splitlines()
 transcripts.append(json.loads(next(x[len('TRANSCRIPT='):] for x in text if x.startswith('TRANSCRIPT=')))['cases'])
a,b=transcripts
assert len(a)==len(b)==22 and a.keys()==b.keys()
assert sum(a[k]==b[k] for k in a if k!='isolation')==21
assert collections.Counter(a['isolation']['response']['messages'])==collections.Counter(b['isolation']['response']['messages'])
save('independent-correctness.json',dict(records_each=22,deterministic_exact=21,unordered_record='isolation',membership_multiplicity_equal=True,raw_order_equal=a['isolation']==b['isolation'],raw_messages=[a['isolation']['response']['messages'],b['isolation']['response']['messages']]))
rows=[];phase=[];resource_issues=[];coverage=[];allresources=[]
for run in d['stacks']:
 label=run['label'];rs=lines(E/(label+'-resources.log')); allresources+=rs
 gaps=[b['time']-a['time'] for a,b in zip(rs,rs[1:])]
 for i,r in enumerate(rs):
  try:strict.validate_resource(r,boundary=True)
  except Exception as e:resource_issues.append(dict(file=label+'-resources.log',line=i+1,time=r.get('time'),error=repr(e),raw_errors=r.get('errors')))
 ids={c['id'] for c in run['containers'] if c['role']!='config'}
 starts=[e for e in ev if e['kind']=='client_start' and e.get('label','').startswith(label)]
 for st in starts:
  ends=[x for x in ev if x['kind']=='client_end' and x.get('label')==st['label']]
  if len(ends)!=1:
   coverage.append(dict(label=st['label'],samples=0,failures=['client interval missing end event'],readiness_attempt=('-boot-' in st['label'] or '-restart-ready-' in st['label'])))
   continue
  a=st['time']+hi;b=ends[0]['time']+lo
  before=[s for s in rs if s['time']<=a];after=[s for s in rs if s['time']>=b]
  ss=([before[-1]] if before else [])+[s for s in rs if a<s['time']<b]+([after[0]] if after else [])
  failures=[]
  if not before or not after:failures.append('unbracketed')
  for s in ss:
   try:strict.validate_resource(s)
   except Exception as e:failures.append(repr(e))
   if not ids<=s['containers'].keys():failures.append('missing exact IDs')
  coverage.append(dict(label=st['label'],samples=len(ss),failures=failures))
 active=[r for r in rs if ids<=r['containers'].keys()]
 phase.append(dict(label=label,samples=len(rs),max_gap_seconds=max(gaps),nominal_sampling_ms=250,soak_iterations=run.get('soak_iterations'),soak_elapsed_min=run.get('soak_elapsed_min'),max_stack_MiB=max(int(r['stack']['memory.current']) for r in active)/2**20,min_MemAvailable_MiB=min(strict.host_memory(r['host_meminfo'])['MemAvailable'] for r in active)/2**20,max_service_MiB=max(sum(int(s['memory.current']) for s in r['system_services'].values()) for r in active)/2**20))
 if not label.startswith('repeat-perf-'):continue
 for case,count in strict.COUNTS.items():
  raw=load(E/(label+'-'+case+'.log'));inc=lines(E/(label+'-'+case+'-rpc.jsonl'))
  # Independent nearest-rank calculations, not summary-field reuse.
  assert len(raw['samples'])==count and sorted(inc,key=lambda x:x[0])==raw['samples']
  assert all(s[0]==i and s[3] is None for i,s in enumerate(raw['samples']))
  lat=sorted(s[2]/1e6 for s in raw['samples']);qs={f'p{p}_ms':lat[math.ceil(p/100*count)-1] for p in (50,95,99)}
  assert all(qs[k]==raw[k] for k in qs)
  rps=count/raw['seconds'];assert math.isclose(rps,raw['successful_rps'],rel_tol=1e-12)
  st=next(x for x in ev if x['kind']=='client_start' and x.get('label')==label+'-'+case);en=next(x for x in ev if x['kind']=='client_end' and x.get('label')==label+'-'+case)
  ss=[s for s in rs if st['time']+hi<=s['time']<=en['time']+lo]
  assert len(ss)>=2
  for s in ss:strict.validate_resource(s)
  origids={c['id'] for c in run['containers'] if c['role']!='config' and not c.get('restart')}
  assert all(origids<=s['containers'].keys() for s in ss)
  rows.append(dict(language=run['language'],case=case,repetition=int(label.split('-')[2]),requests=count,errors=0,seconds=raw['seconds'],successful_rps=rps,**qs,
   whole_cgroup_MiB=max(int(s['stack']['memory.current']) for s in ss)/2**20,
   container_sum_cgroup_MiB=max(sum(int(s['containers'][i]['memory.current']) for i in origids) for s in ss)/2**20,
   rss_sum_MiB=max(sum(s['containers'][i]['rss_sum_bytes'] for i in origids) for s in ss)/2**20,
   host_used_MiB=max(strict.host_memory(s['host_meminfo'])['MemTotal']-strict.host_memory(s['host_meminfo'])['MemAvailable'] for s in ss)/2**20,
   min_MemAvailable_MiB=min(strict.host_memory(s['host_meminfo'])['MemAvailable'] for s in ss)/2**20,
   max_service_MiB=max(sum(int(v['memory.current']) for v in s['system_services'].values()) for s in ss)/2**20,
   client_cpu_cores=raw['client_process_cpu_cores'],max_gap_seconds=max(b['time']-a['time'] for a,b in zip(ss,ss[1:]))))
assert len(rows)==24
ag=[]
for lang in ('rust','python'):
 for case in strict.COUNTS:
  rr=[r for r in rows if r['language']==lang and r['case']==case];assert len(rr)==3
  keys=[k for k in rr[0] if k not in ('language','case','repetition')]
  ag.append(dict(language=lang,case=case,stats={k:dict(median=statistics.median(r[k] for r in rr),min=min(r[k] for r in rr),max=max(r[k] for r in rr)) for k in keys}))
save('summary.json',dict(accepted=False,strict_analyzer_passed=strict_ok,issues=issues,resource_issues=resource_issues,raw_timed_cases=len(rows),total_timed_requests=sum(r['requests'] for r in rows),repetitions=3,rows=rows,aggregates=ag,phase_resources=phase,interval_coverage=coverage,percentile='nearest rank; median and bounds across three per-run values, not pooled',resources='whole tinyrepeat.slice cgroup and container sums separately; RSS sum can double count shared pages; nominal 250ms sampled maxima not exact peaks; host includes OS/Docker; footprint not minimum RAM',images=d['images'],comparison=d['comparison'],clock_offset_bounds=[lo,hi],all_resource_samples=len(allresources)))
print(json.dumps(dict(strict_passed=strict_ok,resource_issues=resource_issues,coverage_failures=[c for c in coverage if c['failures']],cases=len(rows),requests=sum(r['requests'] for r in rows),samples=len(allresources)),indent=2))
for a in ag:
 s=a['stats'];print(a['language'],a['case'],*[round(s[k]['median'],3) for k in ('successful_rps','p50_ms','p95_ms','p99_ms','whole_cgroup_MiB','rss_sum_MiB')])
