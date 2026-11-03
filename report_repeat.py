"""Package completed-repeat evidence; a failed strict gate remains failed."""
import collections,datetime,hashlib,json,math,shutil,statistics,subprocess,tarfile
from pathlib import Path
O=Path('repeat-results-20261020');E=Path('closure/results');d=json.loads((E/'owner.json').read_text());s=json.loads((O/'summary.json').read_text())
def save(n,x):(O/n).write_text(json.dumps(x,indent=2)+'\n')
def digest(p):return hashlib.file_digest(p.open('rb'),'sha256').hexdigest()
# Verify frozen executed controller bytes against owner, not current branch labels.
for name,h in d['source_sha256'].items():assert digest(Path('closure')/name)==h
for name in ('strict-analyzer-output.log','independent-audit-output.log','retention-output.log'):shutil.copyfile(Path('closure')/name,O/name)
raw=[]
with tarfile.open('closure/actual-evidence.tar.gz','r:gz') as t:
 for m in t:
  if m.isfile():raw.append(dict(path=m.name,bytes=m.size,sha256=hashlib.file_digest(t.extractfile(m),'sha256').hexdigest()))
save('raw-manifest.json',dict(archive='actual-evidence.tar.gz',sha256=digest(Path('closure/actual-evidence.tar.gz')),members=len(raw),files=raw))
# Preserve all setup/repair/review evidence separately, without rewriting prior partial.
setup=[p for p in Path('.').iterdir() if p.is_file() and (p.name.startswith(('repeat-','repair-','ingress-','failed-preflight-')) or p.name.endswith('CHECKPOINT.md')) and p.name not in ('repeat-cleanup.json',)]
setup += [p for n in ('repair-local-evidence','controller-detached-evidence','controller-smoke-evidence','controller-selftest','lifecycle-selftest','lifecycle-selftest-fixed','repair-lifecycle-selftest','repair-owner-selftest') for p in Path(n).rglob('*') if p.is_file()]
with tarfile.open(O/'setup-and-review-evidence.tar.gz','w:gz') as t:
 for p in sorted(set(setup)):t.add(p,arcname=str(p),recursive=False)
setupmanifest=[]
with tarfile.open(O/'setup-and-review-evidence.tar.gz','r:gz') as t:
 for m in t:
  if m.isfile():setupmanifest.append(dict(path=m.name,bytes=m.size,sha256=hashlib.file_digest(t.extractfile(m),'sha256').hexdigest()))
save('setup-manifest.json',setupmanifest)
shutil.copyfile('closure/actual-evidence.tar.gz',O/'actual-evidence.tar.gz')
shutil.copyfile('repeat-provider-attempts.jsonl',O/'provider-attempts.jsonl')
resources=[json.loads(line) for p in E.glob('*-resources.log') for line in p.read_text().splitlines()]
def counters(text):return {a:int(b) for a,b in (l.split() for l in text.splitlines())}
def psi(text):return {line.split()[0]:{k:float(v) for k,v in (q.split('=') for q in line.split()[1:])} for line in text.splitlines()}
mem_psi=max(psi(r['host_memory_psi'])['some']['avg10'] for r in resources);cpu_psi=max(psi(r['host_cpu_psi'])['some']['avg10'] for r in resources)
telemetry=dict(samples=len(resources),host_memory_PSI_some_avg10_max=mem_psi,host_cpu_PSI_some_avg10_max=cpu_psi,host_memory_PSI_full_avg10_max=max(psi(r['host_memory_psi'])['full']['avg10'] for r in resources),host_oom_kill_counter_bounds=[min(counters(r['host_vmstat'])['oom_kill'] for r in resources),max(counters(r['host_vmstat'])['oom_kill'] for r in resources)],stack_swap_bytes_max=max(int(r['stack']['memory.swap.current']) for r in resources if r['stack']),stack_oom_events_max=max(counters(r['stack']['memory.events'])['oom'] for r in resources if r['stack']),service_names=sorted(resources[0]['system_services']))
save('host-telemetry.json',telemetry)
ev=[json.loads(x) for x in (E/'events.jsonl').read_text().splitlines()]
soaks=[]
for run in d['stacks'][:2]:
 starts=[x for x in ev if x['kind']=='client_start' and x.get('label','').startswith(run['label']+'-soak-')];ends=[x for x in ev if x['kind']=='client_end' and x.get('label') in {z['label'] for z in starts}]
 soaks.append(dict(label=run['label'],iterations=len(starts),elapsed_seconds=max(x['time'] for x in ends)-min(x['time'] for x in starts)))
save('soak-verification.json',soaks)
# Before/after retained-state response bytes are not normalized away.
retained=[]
for p in sorted(E.glob('*-verify-before.log')):
 a=json.loads(p.read_text());q=E/p.name.replace('-verify-before.log','-verify-after.log');b=json.loads(q.read_text());assert a==b
 retained.append(dict(before=p.name,after=q.name,exact_equal=True,sha256=digest(p)))
save('retained-restart-verification.json',retained)
prov=dict(measured_sdk='d3b0642d0cb9962c839cfb57ebfd33f2a3cca389',not_measured='later published typed 9318 SDK; no inference from later builds',controller_commit='101953bbe720945181c2a3caff7aadf3c62f4c36',bundle_prerequisite='6e3538ce0b85fcc9b481cf6bffb695a5724426d4',source_sha256=d['source_sha256'],images=d['images'],timing_clearance=d['timing_clearance'],runtime_environment=d['environment'],external_client_host='CCX43 171072439 / 2.29.27.53; target CPX02 171353819 / 2.31.73.10',client_cpuset='14',cpu_limits='One actual target vCPU shared by OS/Docker/all containers; NanoCpus/CpuQuota/CpuPeriod=0 (no per-container cap), tinyrepeat.slice MemoryMax=infinity / MemorySwapMax=0. Not a lower-limit exercise.',retention=json.loads((O/'durable-retention.json').read_text()),setup_attempts='Prior controller atomic-write interruption (original partial remains immutable); first detached owner retired for custody/schema repair; RED inspect/spawn/deadline drills then GREEN; ingress public-key setup preflight failure, then detached fatal/live regressions and narrow independent parent PASS. These are setup/review attempts, not extra benchmark repetitions.',strict_acceptance=False,telem=telemetry)
save('provenance.json',prov)
def fmt(v):return f'{v:.2f}'
report=['# CPX02 repeat — all three repetitions completed; strict telemetry gate FAILED','',
'**Status: measurement execution complete, not an accepted clean benchmark.** Owner completed exit 0 with failures=[]; the unchanged strict analyzer exited 1 on actual raw data. No acceptance rule or raw record was repaired. Prior partial report remains untouched.','',
'## Observed three-repetition results (descriptive, not accepted)','','Medians below are over three per-run values. Throughput bounds are min–max; latency uses nearest-rank p50/p95/p99, then median across runs (not pooled). Each workload has concurrency 8 and 64-byte payload. These are WAN/application-only SSH-tunnel measurements, not language-only or local saturation limits.','','| Stack | Workload | Whole cgroup MiB | RSS sum MiB | Successful RPC/s [min–max] | p50 / p95 / p99 ms |','|---|---|---:|---:|---:|---:|']
for a in s['aggregates']:
 z=a['stats'];report.append('| '+a['language']+' | '+a['case']+' | '+fmt(z['whole_cgroup_MiB']['median'])+' | '+fmt(z['rss_sum_MiB']['median'])+' | '+fmt(z['successful_rps']['median'])+' ['+fmt(z['successful_rps']['min'])+'–'+fmt(z['successful_rps']['max'])+'] | '+' / '.join(fmt(z[k]['median']) for k in ('p50_ms','p95_ms','p99_ms'))+' |')
report += ['','Full min/median/max for **every numeric metric**, all 24 individual cases, and qualification resource coverage are in [summary.json](summary.json). Rust is smaller here but slower on all four workloads. Do not attribute either result solely to language: Rust is app + native engine (+ one-shot config); Python has the combined native/proxy/launcher stack.','',
'## Blocking defect and complete evidence accounting','',
'- Strict command: `python3 tiny_repeat_analyze.py closure/results`; **exit 1**: `ValueError: sampler errors (raw preserved; no silent repair)`. See [strict-analyzer-output.log](strict-analyzer-output.log).',
'- `repeat-perf-3-rust-resources.log` line **1104**, time **1792494669.8538582**: container `37164b2753e9d8ecb86c87d46db065dd3dbb114108a0595153bae65c37b3f825`, PID107199, `StopIteration()`. It occurs during engine shutdown, after the final retained verification and application retirement. This does **not** waive the full-resource-schema requirement.',
'- Exactly **24 timed cases**, **138000 successful timed RPCs**, zero timed RPC errors, with incremental JSONL equal to final raw samples. All six performance runs and both qualifications completed. Raw JSON responses, concurrent response ordering, transcripts, logs and executed source remain in the archive.',
'- **9180** resource records audited; exactly one schema failure above. All non-readiness client intervals are bracketed, covered by exact container IDs, and have no resource-schema errors. All phase maximum gaps are below 0.261 seconds (250ms nominal). Expected failed readiness retries lack a client_end event; every such attempt is enumerated rather than treated as a completed interval.',
'- [independent-audit-output.log](independent-audit-output.log) and [summary.json](summary.json) retain defects; independent audit exit0 means accounting completed, **not benchmark acceptance**. Unchanged analyzer self-tests are supplementary, never the real-results gate.','',
'## Retirement, correctness and resources','',
'- Owner866962 is absent; exact systemd unit MainPID0/inactive/ExecMainStatus0. Original exit receipt: completed, exit0, all_original_unix_children_joined=true. All **445 original Unix children joined**, all **28 container lifecycle records** (including restart epochs) have Pid0, exact wait-output/State exit-code equality, no OOM; **16 unique stack container IDs** independently re-inspected. Rust/config/engine exit0; Python app and external client exit143 from expected stop. Application waits joined before engine waits in each epoch. See retirement.json and fresh readbacks.',
'- Correctness: **21 deterministic records exact + 1 concurrent membership/multiplicity record equal**; concurrent raw order differs and is retained, not falsely claimed exact. Each performance retained state is byte-exact before/after full restart (six pairs). Soak iteration counts/durations are in soak-verification.json.',
'- Target: actual one-vCPU CPX02, **932.4921875 MiB MemTotal**, Ubuntu24.04.4, kernel6.8.0-138, Docker29.1.3, cgroupv2. No host swap, no stack swap, no observed OOM counter increase. Host OS, Docker/containerd and SSH included in host telemetry; service cgroup footprint separately retained.','- Whole cgroup memory means `tinyrepeat.slice memory.current`; container sums and process RSS are separate fields. RSS may double-count shared pages. Maxima are sampled at nominal250ms, **not exact peaks**. `memory.peak` is cumulative across slice lifetimes and is not substituted for the sampled per-workload maximum. Observed footprint is not tested minimum RAM.',
'- External client on existing CCX43 cpuset14, separate machine from target; no client stealing a target CPU. Frozen parent clearance records retired heavy owner and no heavy-suite overlap. Client CPU is not proof of a throughput ceiling. Resource intervals include initialization/controller overhead; RPC denominator is raw RPC-loop seconds.',
'- No per-container CPU quota, shared physical VM vCPU cap1. No lower-memory run was performed; no minimum-fit claim. Host pressure and MemAvailable are disclosed rather than hidden.','',
'### Full-phase resource coverage','','| Phase | Samples | Max gap s | Max whole cgroup MiB | Min host MemAvailable MiB | Max service cgroups MiB |','|---|---:|---:|---:|---:|---:|']
for r in s['phase_resources']:report.append(f"| {r['label']} | {r['samples']} | {r['max_gap_seconds']:.6f} | {r['max_stack_MiB']:.2f} | {r['min_MemAvailable_MiB']:.2f} | {r['max_service_MiB']:.2f} |")
report+=['',f"Host memory PSI some/full avg10 sampled maxima: {telemetry['host_memory_PSI_some_avg10_max']:.2f}/{telemetry['host_memory_PSI_full_avg10_max']:.2f}; CPU PSI some avg10 max {telemetry['host_cpu_PSI_some_avg10_max']:.2f}. Host oom_kill counter bounds {telemetry['host_oom_kill_counter_bounds']}. See host-telemetry.json.",'','## Immutable version and retention','','Measured SDK **d3b0642d0cb9962c839cfb57ebfd33f2a3cca389**; controller **101953bbe720945181c2a3caff7aadf3c62f4c36**. Not the later published typed9318 build. Exact image IDs:','']
for k,v in d['images'].items():report.append(f'- {k}: `{v}`')
report += ['','Durable unpaid-storage host: **Omarchy**, `/home/ladin/.cache/hermes-reboot-parity/tiny-repeat-20261020/completed-closure/`. Actual raw archive with executed source: `actual-evidence.tar.gz`; setup/review/failure evidence: `setup-and-review-evidence.tar.gz`. Exhaustive member paths, sizes and SHA256 are in raw-manifest.json and setup-manifest.json. All **21 named volumes / 238 files** retained in all-volumes.tar.gz with independently verified member hashes. Image archive reuses `/home/ladin/.cache/hermes-reboot-parity/tiny-20261020/images.docker-save.tar.gz`; all28 OCI blobs hash-verified and index IDs equal measured runtime IDs. No image duplication/build/registry deploy. Durable retention readback reports over417GB free.','',
'## Cleanup and attempt accounting','','Only new VM171353819 / Primary IPv4 156610171 deleted after durable readback. Both provider GETs returned404 at **'+json.loads((O/'cleanup.json').read_text())['time']+'**. Initial guarded deletion hit asynchronous auto-delete IP still assigned after server404; the guard stopped safely. Subsequent exact GET confirmed provider auto-deleted IP. No unsafe detach/delete workaround. Full provider requests/status/action receipts are in provider-attempts.jsonl. Existing CCX43 171072439 labels/identity preserved; expiry20Oct20:46:13CEST unchanged. Jobs9b15327c9788/b0002ef1b3de unchanged, allowed to no-op on exact404. No capacity/expiry extension.','',
'Prior setup failures and review drills are preserved separately, not renamed benchmark failures: atomic-ledger interruption of original partial; custody/schema RED drills and repaired GREEN; detached ingress public-key preflight failure and live/fatal regressions; narrow independent delta PASS before fresh parent timing clearance. Full three repetitions were actually run after repair, not reconstructed from earlier partial.','',
'## Reproduction / handoff','','From this repository run `python3 close_repeat.py` for non-mutating independent accounting; the unchanged strict analyzer must still fail on the archived defect. Normal Git bundle is generated with prerequisite **6e3538ce0b85fcc9b481cf6bffb695a5724426d4**, not a shallow/truncated replacement. Bundle hash and final durable file readback are in the external closure-manifest.json (outside the commit to avoid circular hashes). No push. Parent independent read-only review remains a separate step; this closure does not invent its verdict.','']
(O/'REPORT.md').write_text('\n'.join(report))
print('Report/manifest/provenance generated; strict acceptance remains FALSE;',len(raw),'raw files;',len(setupmanifest),'setup files')
