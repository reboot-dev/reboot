"""Generated typed Rust reactive API over real CXX/RocksDB; no data seeding."""
import hashlib,json,os,socket,subprocess,sys,tempfile,time,urllib.request,urllib.error
from pathlib import Path
binary=Path(sys.argv[1]);native=Path(os.environ["REBOOT_NATIVE2PC_CXX_DATABASE"])
result={"complete":False,"commands":[],"processes":[]}
def port():
 with socket.socket() as s:
  s.bind(("127.0.0.1",0));return s.getsockname()[1]
def run(*args):
 command=[str(binary),*map(str,args)];p=subprocess.run(command,capture_output=True,text=True,timeout=10)
 result["commands"].append({"command":command,"exit":p.returncode,"stdout":p.stdout,"stderr":p.stderr});assert p.returncode==0,result["commands"][-1];return p.stdout
with tempfile.TemporaryDirectory(prefix="rust-secured-user-cxx-") as d:
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
  p=spawn([binary,"user-serve",f"http://127.0.0.1:{dbport}",f"127.0.0.1:{appport}",shutdown,work/"revoked",work/"mutations",stats]);listen(p,appport);return p,shutdown,stats
 try:
  run("info",work/"server-info.pb");db=database();h,shutdown,stats=host()
  assert "secured_user_revoked_snapshot_and_replay=6" in run("user-exercise",endpoint,work/"revoked",work/"mutations",stats)
  stop(h,shutdown);assert h.returncode==0;stop(db)
  db=database();h,shutdown,stats=host()
  assert "secured_user_restart_replay_no_mutation=7" in run("user-restart",endpoint,work/"revoked",work/"mutations",stats)
  httpport=port();httpendpoint=f"http://127.0.0.1:{httpport}"
  def http_host():
   marker=work/f"http-shutdown-{len(owned)}"
   p=spawn([binary,"user-http",endpoint,f"127.0.0.1:{httpport}",marker]);listen(p,httpport);return p,marker
  def http(path,token=None,key=None,expected=200,body=None):
   headers={"x-forged-user-id":"alice","x-reboot-internal-call":"true","x-reboot-application-id":"secured-user-app"}
   if token:headers["Authorization"]="Bearer "+token
   payload=(body if body is not None else key).encode() if key is not None or body is not None else None
   request=urllib.request.Request(httpendpoint+path,data=payload,headers=headers)
   try:
    with urllib.request.urlopen(request,timeout=10) as response:status=response.status;text=response.read().decode()
   except urllib.error.HTTPError as error:status=error.code;text=error.read().decode()
   result["commands"].append({"http_path":path,"token":token,"key":key,"status":status,"body":text});assert status==expected,result["commands"][-1];return text
  hh,http_shutdown=http_host()
  assert http("/owner","owner")=="7"
  httpkey="00000000-0000-4000-8000-000000000456"
  before=(work/"mutations").read_text()
  for token,status in [(None,401),("payload-forgery",401),("other",403),("reject",401)]:
   http("/owner",token,expected=status);http("/owner/increment",token,httpkey,expected=status)
  http("/owner/increment","owner",body="x"*1025,expected=400)
  http("/owner/setclaims","owner",httpkey,expected=403)
  assert (work/"mutations").read_text()==before
  assert http("/owner/increment","owner",httpkey)=="8"
  before=(work/"mutations").read_text()
  assert http("/owner/increment","owner",httpkey)=="8"
  assert (work/"mutations").read_text()==before
  stop(hh,http_shutdown);assert hh.returncode==0;assert h.poll() is None
  hh,http_shutdown=http_host();assert http("/owner","owner")=="8"
  (work/"revoked").write_text("revoked")
  http("/owner/increment","owner",httpkey,expected=403)
  stop(h,shutdown);stop(hh,http_shutdown);assert hh.returncode==0;assert h.returncode==0;stop(db)
  db=database();h,shutdown,stats=host();hh,http_shutdown=http_host()
  http("/owner/increment","owner",httpkey,expected=403)
  assert (work/"mutations").read_text()==before
  (work/"revoked").unlink()
  assert http("/owner/increment","owner",httpkey)=="8"
  assert http("/owner","owner")=="8"
  assert (work/"mutations").read_text()==before
  stop(h,shutdown);stop(hh,http_shutdown);assert hh.returncode==0;assert h.returncode==0;stop(db);result["complete"]=True

 finally:
  for p,f,log,command in owned:
   stop(p);f.close();text=log.read_text(errors="replace");result["processes"].append({"pid":p.pid,"command":command,"exit":p.returncode,"log":text,"sha256":hashlib.sha256(log.read_bytes()).hexdigest()})
  result.update(all_owned_pids_absent=all(not Path(f"/proc/{p.pid}").exists() for p,_,_,_ in owned),binary_sha256=hashlib.sha256(binary.read_bytes()).hexdigest(),database_sha256=hashlib.sha256(native.read_bytes()).hexdigest())
  Path(os.environ.get("SECURED_USER_EVIDENCE","/tmp/reboot-rust-secured-user-cxx-proof.json")).write_text(json.dumps(result,indent=2))
print(json.dumps({"complete":result["complete"],"owned_pids_absent":result["all_owned_pids_absent"]}))
