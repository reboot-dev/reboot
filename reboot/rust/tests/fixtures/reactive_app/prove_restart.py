"""Generated typed Rust reactive API over real CXX/RocksDB; no data seeding."""
import hashlib,json,os,socket,subprocess,sys,tempfile,time
from pathlib import Path
binary=Path(sys.argv[1]);native=Path(os.environ["REBOOT_NATIVE2PC_CXX_DATABASE"])
result={"complete":False,"commands":[],"processes":[]}
def port():
 with socket.socket() as s:
  s.bind(("127.0.0.1",0));return s.getsockname()[1]
def run(*args):
 command=[str(binary),*map(str,args)];p=subprocess.run(command,capture_output=True,text=True,timeout=10)
 result["commands"].append({"command":command,"exit":p.returncode,"stdout":p.stdout,"stderr":p.stderr});assert p.returncode==0,result["commands"][-1];return p.stdout
with tempfile.TemporaryDirectory(prefix="rust-reactive-cxx-") as d:
 work=Path(d); owned=[];dbport=port();appport=port();endpoint=f"http://127.0.0.1:{appport}"
 def spawn(command):
  log=work/f"process-{len(owned)}.log";f=log.open("wb");p=subprocess.Popen(list(map(str,command)),stdout=f,stderr=f);owned.append((p,f,log,list(map(str,command))));return p
 def stop(p,shutdown=None):
  if p.poll() is None:
   if shutdown:shutdown.touch()
   else:p.kill()
   p.wait(timeout=10)
 def listen(p,port):
  deadline=time.monotonic()+10
  while time.monotonic()<deadline:
   assert p.poll() is None,(p.pid,p.returncode)
   try:
    with socket.create_connection(("127.0.0.1",port),timeout=.1):return
   except OSError:time.sleep(.025)
  raise AssertionError("listener not ready")
 def database():
  p=spawn([native,work/"rocksdb",work/"server-info.pb",dbport]);listen(p,dbport);return p
 def host():
  shutdown=work/f"shutdown-{len(owned)}";stats=work/f"stats-{len(owned)}"
  p=spawn([binary,"serve",f"http://127.0.0.1:{dbport}",f"127.0.0.1:{appport}",shutdown,stats]);listen(p,appport);return p,shutdown,stats
 try:
  run("info",work/"server-info.pb");db=database();h,shutdown,stats=host()
  ready=work/"driver-ready";driver=spawn([binary,"exercise",endpoint,stats,ready]);deadline=time.monotonic()+30
  while not ready.exists():
   assert driver.poll() is None;assert time.monotonic()<deadline;time.sleep(.01)
  stop(h,shutdown);assert h.returncode==0;assert driver.wait(timeout=10)==0;stop(db)
  db=database();h,shutdown,stats=host();assert "restart_subscription=103" in run("restart",endpoint)
  stop(h,shutdown);assert h.returncode==0;stop(db);result["complete"]=True
 finally:
  for p,f,log,command in owned:
   stop(p);f.close();text=log.read_text(errors="replace");result["processes"].append({"pid":p.pid,"command":command,"exit":p.returncode,"log":text,"sha256":hashlib.sha256(log.read_bytes()).hexdigest()})
  result.update(all_owned_pids_absent=all(not Path(f"/proc/{p.pid}").exists() for p,_,_,_ in owned),binary_sha256=hashlib.sha256(binary.read_bytes()).hexdigest(),database_sha256=hashlib.sha256(native.read_bytes()).hexdigest())
  Path(os.environ.get("REACTIVE_EVIDENCE","/tmp/reboot-rust-reactive-loop4-cxx-proof.json")).write_text(json.dumps(result,indent=2))
print(json.dumps({"complete":result["complete"],"owned_pids_absent":result["all_owned_pids_absent"]}))
