"""Real generated workflow application + native CXX/RocksDB process proof.
No task/state Store seeding: Create and ScheduleWork are generated public RPCs.
"""
import hashlib
import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import tempfile
import time
import uuid

BIN = Path(sys.argv[1])
DB = Path(os.environ["REBOOT_NATIVE2PC_CXX_DATABASE"])
commands = []
processes = []
snapshots = []

def port():
    # Stay below Linux ephemeral outbound ports; reject occupied listeners.
    for p in range(21000, 28000):
        with socket.socket() as s:
            try:
                s.bind(("127.0.0.1", p))
                if p not in used:
                    used.add(p)
                    return p
            except OSError:
                pass
    raise AssertionError("no test port")

used = set()

def run(*args, ok=True):
    command = [str(BIN), *map(str,args)]
    result = subprocess.run(command, capture_output=True, text=True, timeout=15)
    commands.append({"command":command,"exit":result.returncode,"stdout":result.stdout,"stderr":result.stderr})
    if ok:
        assert result.returncode == 0, commands[-1]
    else:
        assert result.returncode != 0, commands[-1]
    return result.stdout.strip()

def spawn(command, env=None):
    log = open(work / ("process-%d.log" % len(processes)), "wb")
    p = subprocess.Popen(list(map(str, command)), stdout=log, stderr=log, env=env)
    processes.append({"pid":p.pid,"command":list(map(str,command)),"process":p,"log":log})
    return p

def stop(p, graceful=False, shutdown=None):
    if p.poll() is None:
        if graceful:
            assert shutdown is not None
            shutdown.touch()
        else:
            p.kill()
        p.wait(timeout=15)

def wait_port(p,n):
    deadline=time.monotonic()+10
    while time.monotonic()<deadline:
        assert p.poll() is None, (p.pid,p.returncode)
        try:
            with socket.create_connection(("127.0.0.1",n),timeout=.1):
                return
        except OSError:
            time.sleep(.025)
    raise AssertionError("no process listener")

def read(expected):
    deadline=time.monotonic()+10
    while time.monotonic()<deadline:
        try:
            got=json.loads(run("read",app))
            if got == expected:
                snapshots.append(got)
                return got
        except AssertionError:
            pass
        time.sleep(.025)
    raise AssertionError(("state mismatch",expected,commands[-1]))

result: dict = {"complete":False}
with tempfile.TemporaryDirectory(prefix="rust-workflow-cxx-") as d:
    work=Path(d)
    db_port=port(); app_port=port()
    database="http://127.0.0.1:%d"%db_port
    app="http://127.0.0.1:%d"%app_port
    run("info",work/"server-info.pb")
    def start_db():
        p=spawn([DB,work/"rocksdb",work/"server-info.pb",db_port]);wait_port(p,db_port);return p
    def start_host(marker=None):
        shutdown=work/("shutdown-%d"%len(processes))
        env=os.environ.copy()
        if marker:
            env["WORKFLOW_FIRST_ACK"]=str(marker)
        p=spawn([BIN,"serve",database,"127.0.0.1:%d"%app_port,shutdown],env);wait_port(p,app_port)
        # Public reader may initially reject recovering readiness; no fake health.
        deadline=time.monotonic()+10
        while time.monotonic()<deadline:
            r=subprocess.run([str(BIN),"read",app],capture_output=True,text=True,timeout=2)
            if r.returncode==0 or "must be constructed" in r.stderr or "state must" in r.stderr:
                return p,shutdown
            time.sleep(.025)
        return p,shutdown
    try:
        db=start_db(); host,shutdown=start_host()
        run("create",app,uuid.uuid4())
        read({"first":0,"second":0,"schedules":0})
        assert run("direct",app)=="denied"
        # Future timestamp persists before execution and across an actual restart.
        key=str(uuid.uuid4()); future=int(time.time())+4
        handle=run("schedule",app,key,future,7)
        assert run("schedule",app,key,future,7)==handle
        run("schedule",app,key,future,8,ok=False)
        assert run("method-collision",app,key)=="collision denied"
        assert run("wrong-scope",app)=="wrong scope denied"
        before=json.loads(run("inspect",database,handle))
        assert before=={"status":1,"iteration":0,"step_mutations":0,"timestamp":future},before
        read({"first":0,"second":0,"schedules":1})
        stop(host);stop(db);db=start_db()
        marker=work/"first-ack";host,shutdown=start_host(marker)
        assert time.time()<future, "test did not exercise before-due restart"
        read({"first":0,"second":0,"schedules":1})
        assert not marker.exists()
        deadline=time.monotonic()+10
        while not marker.exists():
            assert host.poll() is None
            assert time.monotonic()<deadline
            time.sleep(.025)
        assert time.time()>=future
        # Read works while workflow awaits: no exclusive actor lease across body.
        read({"first":7,"second":0,"schedules":1})
        after_first=json.loads(run("inspect",database,handle))
        assert after_first=={"status":1,"iteration":0,"step_mutations":1,"timestamp":future},after_first
        # Actual process kill at first ACK, native restart then workflow recovery.
        stop(host);stop(db);db=start_db();host,shutdown=start_host()
        assert json.loads(run("wait",app,handle))=={"first":7,"second":7}
        read({"first":7,"second":7,"schedules":1})
        completed=json.loads(run("inspect",database,handle))
        assert completed=={"status":2,"iteration":0,"step_mutations":2,"timestamp":future},completed
        assert run("schedule",app,key,future,7)==handle
        # Further restart proves terminal and response durable (not only state).
        stop(host,True,shutdown);stop(db);db=start_db();host,shutdown=start_host()
        assert json.loads(run("wait",app,handle))=={"first":7,"second":7}
        read({"first":7,"second":7,"schedules":1})
        assert json.loads(run("inspect",database,handle))==completed
        assert run("schedule",app,key,future,7)==handle
        stop(host,True,shutdown)
        # Graceful cancellation of a parked workflow after a durable named step.
        marker2=work/"cancel-first-ack";host,shutdown=start_host(marker2)
        key2=str(uuid.uuid4());handle2=run("schedule",app,key2,0,3)
        deadline=time.monotonic()+10
        while not marker2.exists():
            assert host.poll() is None
            assert time.monotonic()<deadline
            time.sleep(.025)
        read({"first":10,"second":7,"schedules":2})
        stopped_checkpoint=json.loads(run("inspect",database,handle2))
        assert stopped_checkpoint=={"status":1,"iteration":0,"step_mutations":1,"timestamp":0}
        stop(host,True,shutdown);assert host.returncode==0
        stop(db);db=start_db();host,shutdown=start_host()
        assert json.loads(run("wait",app,handle2))=={"first":10,"second":10}
        read({"first":10,"second":10,"schedules":2})
        assert json.loads(run("inspect",database,handle2))=={"status":2,"iteration":0,"step_mutations":2,"timestamp":0}
        stop(host,True,shutdown);assert host.returncode==0;stop(db)
        result["graceful_pending_checkpoint"]=stopped_checkpoint
        result.update(complete=True,handle=handle,checkpoints=[before,after_first,completed],snapshots=snapshots)
    finally:
        for entry in processes:
            stop(entry["process"])
            entry["exit"]=entry["process"].returncode
            entry["log"].close()
            entry["log_text"]=Path(entry["log"].name).read_text(errors="replace")
            del entry["process"];del entry["log"]
        result.update(commands=commands,processes=processes,all_owned_pids_absent=all(not Path("/proc/%d"%e["pid"]).exists() for e in processes),binary_sha256=hashlib.sha256(BIN.read_bytes()).hexdigest(),database_sha256=hashlib.sha256(DB.read_bytes()).hexdigest())
        output=Path(os.environ.get("WORKFLOW_EVIDENCE","/tmp/reboot-rust-workflow-loop3-cxx-proof.json"))
        output.write_text(json.dumps(result,indent=2))
print(json.dumps({"complete":result["complete"],"commands":len(commands),"processes":len(processes),"owned_pids_absent":result["all_owned_pids_absent"]}))
