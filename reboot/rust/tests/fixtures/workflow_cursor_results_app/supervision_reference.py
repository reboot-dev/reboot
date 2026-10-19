"""Cursor scenario helpers using the checked-in original direct-child owner.

Run via run_native_gate.py, which holds the exclusive lock and uses the public
acceptance subreaper/retention route. No PID-only signal or ECHILD fallback.
"""
import hashlib,json,os,socket,sys,time,uuid,importlib
from pathlib import Path
BIN=Path(sys.argv[1]);DB=Path(os.environ['REBOOT_NATIVE2PC_CXX_DATABASE'])
commands=[];processes=[];used=set();result={'complete':False}
_custody=None

def custody():
 global _custody
 if _custody is None:
  name=os.environ.get('CURSOR_CUSTODY_MODULE', 'cursor_custody')
  if name != 'cursor_custody':raise RuntimeError('gate requires checked-in original custody owner')
  adapter=importlib.import_module(name)
  if adapter.CONTRACT != 'cursor-exact-child-v2':
   raise RuntimeError('unsupported custody contract')
  if not adapter._owner.active_gate:
   raise RuntimeError('run via run_native_gate.py; original lock/subreaper required')
  _custody=adapter
 return _custody

def port():
 for n in range(21000,28000):
  with socket.socket() as s:
   try:s.bind(('127.0.0.1',n))
   except OSError:continue
   if n not in used:used.add(n);return n
 raise RuntimeError('no ports')

def run(*args):
 c=[str(BIN),*map(str,args)]
 # Adapter must own and exactly join even these short-lived clients, including
 # timeout/failure paths, before returning or raising with ownership retained.
 r=custody().run(c,timeout=15)
 commands.append({'command':c,'exit':r.returncode,'stdout':r.stdout,'stderr':r.stderr})
 assert r.joined_exact and r.returncode==0,commands[-1]
 return r.stdout.strip()

def spawn(c,env=None):
 # The driver sets work after import; do not duplicate mutable global state.
 work=Path(os.environ['CURSOR_STAGE'])
 log=open(work/('process-%d.log'%len(processes)),'wb')
 try:p=custody().spawn(list(map(str,c)),stdout=log,stderr=log,env=env)
 except BaseException:
  log.close();raise
 processes.append({'command':list(map(str,c)),'process':p,'log':log,'expected_exit':'healthy'})
 return p

def sdk_exact_join_barrier():
 # Global adapter reservations include failed spawn and short-lived clients that
 # never reached processes. No signal to Database without their actual receipts.
 adapter=custody()
 owner=adapter._owner
 if owner is None or owner.failure is not None:
  raise RuntimeError('SDK barrier: original owner unknown; Database retained')
 sdk=[c for c in adapter.children if c.argv[0]!=str(DB)]
 for child in sdk:
  child.assert_joined()
 # Every owner reservation must be represented; unknown rows are never skipped.
 if any(not any(c.row is row for c in adapter.children) for row in owner.direct):
  raise RuntimeError('SDK barrier: unrepresented owner reservation retained')
 return True

def cleanup_sdk_reservations():
 errors=[]
 for child in custody().children:
  if child.argv[0]==str(DB) or child.joined_exact:continue
  try:child.retire(timeout=15)
  except BaseException as error:errors.append(repr(error))
 return errors

def stop(p,shutdown=None):
 if p.argv[0]==str(DB):sdk_exact_join_barrier()
 entry=next(e for e in processes if e['process'] is p)
 # Idempotent exact-child retirement; adapter escalates only on still-proven
 # ownership, joins, and never maps ECHILD/unknown to a successful receipt.
 p.retire(shutdown=shutdown,timeout=15)
 assert p.joined_exact
 if entry['expected_exit']=='healthy':assert p.returncode==0

def expected_host_failure(p,diagnostic):
 entry=next(e for e in processes if e['process'] is p)
 # No listener prerequisite, shutdown request, or forced kill before this join.
 receipt=p.join_failure(timeout=15)
 assert receipt.joined_exact and p.joined_exact
 assert receipt.natural_exit and receipt.returncode!=0
 entry['log'].flush()
 text=Path(entry['log'].name).read_text(errors='replace')
 assert diagnostic in text,text
 entry['expected_exit']='started-failure'
 return {'exit':receipt.returncode,'diagnostic':diagnostic,'log':text,'joined_exact':True,'natural_exit':True}

def until(f,timeout=10):
 deadline=time.monotonic()+timeout
 while time.monotonic()<deadline:
  if f():return
  time.sleep(.02)
 raise RuntimeError('bounded wait timed out (not semantic failure evidence)')

def listener(p,n):
 def ready():
  p.require_owned_alive()
  try:
   with socket.create_connection(('127.0.0.1',n),timeout=.1):return True
  except OSError:return False
 until(ready)

def events():
 # The selected host changes on restart; driver owns that selection.
 import __main__
 path=__main__.eventpath
 return path.read_text().splitlines() if path.exists() else []
