"""Independent 250ms exact-container resource observer; no workload processes."""
import subprocess as s,time,pathlib,json,shlex
E=pathlib.Path(__file__).resolve().parent/'tiny-runtime-results'
code="""import pathlib,time,json,select,sys
root=pathlib.Path('/sys/fs/cgroup/tiny.slice')
while True:
 d={'time':time.time(),'monotonic_ns':time.monotonic_ns(),'containers':{}}
 for p in root.glob('docker-*.scope'):
  try:
   v={n:(p/n).read_text() for n in ['memory.current','memory.peak','memory.events','memory.stat','memory.swap.current','memory.swap.max','cpu.stat','cgroup.procs']}
   rss=0
   for pid in v['cgroup.procs'].split():
    try:
     for l in pathlib.Path('/proc/'+pid+'/status').read_text().splitlines():
      if l.startswith('VmRSS:'):rss+=int(l.split()[1])*1024
    except OSError:pass
   v['rss_sum_bytes']=rss;d['containers'][p.name[7:-6]]=v
  except OSError:pass
 print(json.dumps(d),flush=True)
 if select.select([sys.stdin],[],[],.25)[0]:break
"""
f=(E/'per-container-resources.jsonl').open('w')
p=s.Popen(['ssh','root@2.31.73.10',shlex.join(['python3','-u','-c',code])],stdin=s.PIPE,stdout=f,stderr=s.PIPE,text=True)
while True:
 time.sleep(1)
 try:
  if 'end' in json.loads((E/'owner.json').read_text()):break
 except (ValueError,OSError):pass
out,err=p.communicate('stop\n',timeout=30);f.close()
(E/'resource-observer-owner.json').write_text(json.dumps({'pid':p.pid,'exit':p.returncode,'stderr':err}))
