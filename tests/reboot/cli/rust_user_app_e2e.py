"""Unmodified public secured-user scaffold, actual CLI and CXX/RocksDB.

Run under the shared acceptance runner's exclusive target lock. OpenSSL creates
runtime-only credentials; logs/results never contain tokens or signing keys.
"""
from pathlib import Path
import base64
import hashlib
import json
import os
import re
import signal
import subprocess
import tempfile
import time
import uuid
import urllib.error
import grpc
from grpc_tools import protoc
from rust_process_ownership import RequestedShutdown
from rbt.v1alpha1 import database_pb2, database_pb2_grpc

ROOT = Path(__file__).resolve().parents[3]
PARENT = Path(os.environ.get('RUST_DX_STAGE', '/tmp'))
PARENT.mkdir(parents=True, exist_ok=True)
STAGE = Path(tempfile.mkdtemp(prefix='reboot-rust-public-user-', dir=PARENT))
APP = STAGE / 'app'
APP.mkdir()
TARGET = Path(os.environ['CARGO_TARGET_DIR'])
RBT = os.environ['RUST_DX_RBT']
PORT = int(os.environ.get('RUST_USER_PORT', '12993'))
ENV = dict(os.environ, RBT_RUST_URL=f'http://127.0.0.1:{PORT}', RBT_RUST_DATABASE_BINARY=os.environ['REBOOT_NATIVE2PC_CXX_DATABASE'])
import sys
CHECKPOINT = '--checkpoint-fixture' in sys.argv
WORKFLOWS = '--workflows' in sys.argv or CHECKPOINT
if WORKFLOWS: ENV['RBT_USER_WORKFLOW_OWNER']='owner'
RESULT = STAGE / 'result.json'
proof = {'commands': [], 'sessions': [], 'passed': False, 'workflows': WORKFLOWS, 'checkpoint_fixture': CHECKPOINT}
sessions = []
timeout_seen = False
http_sessions = []


def run(args, env=ENV, expected=0, timeout=240):
    global timeout_seen
    p = subprocess.Popen([str(a) for a in args], cwd=APP, env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    try:
        out, err = p.communicate(timeout=timeout)
    except subprocess.TimeoutExpired:
        timeout_seen = True
        proof['timeout_pid'] = p.pid
        RESULT.write_text(json.dumps(proof,indent=2))
        raise
    # Never record environment values: those include credentials.
    proof['commands'].append({'args': [str(a) for a in args], 'exit': p.returncode, 'stdout': out, 'stderr': err})
    RESULT.write_text(json.dumps(proof,indent=2))
    assert p.returncode == expected, (args, p.returncode, out, err)
    return out.strip(), err


private = STAGE / 'signing.pem'
public = STAGE / 'verification.pem'
run(['openssl', 'genpkey', '-algorithm', 'RSA', '-pkeyopt', 'rsa_keygen_bits:2048', '-out', private])
run(['openssl', 'pkey', '-pubout', '-in', private, '-out', public])
ENV.update(RBT_USER_RSA_PUBLIC_KEY_FILE=str(public), RBT_USER_JWT_ISSUER='https://issuer.example', RBT_USER_JWT_AUDIENCE='user-app')


def token(**changes):
    claims = dict(iss=ENV['RBT_USER_JWT_ISSUER'], aud=ENV['RBT_USER_JWT_AUDIENCE'], sub='owner', exp=int(time.time())+3600)
    claims.update(changes)
    def part(value):
        return base64.urlsafe_b64encode(json.dumps(value).encode()).rstrip(b'=')
    payload = part({'alg': 'RS256', 'typ': 'JWT'}) + b'.' + part(claims)
    signature = subprocess.run(['openssl', 'dgst', '-sha256', '-sign', str(private)], input=payload, capture_output=True, check=True).stdout
    return (payload + b'.' + base64.urlsafe_b64encode(signature).rstrip(b'=')).decode()


run([RBT, 'init', '--backend=rust', '--frontend=none', '--application-name=user_app', '--rust-example=secured-user', f'--rust-sdk={ROOT / "reboot/rust"}'])
# Default gates use the unmodified scaffold. The separate fixture gate alone
# instruments a local pause, never seeds actors or alters runtime authorities.
if CHECKPOINT:
    import rust_user_checkpoint_fixture as checkpoint_fixture
    pause=checkpoint_fixture.instrument(APP,STAGE,proof)
    ENV['RUST_USER_FIXTURE_PAUSE']=str(pause)
proof['scaffold_hashes'] = {str(p.relative_to(APP)): hashlib.sha256(p.read_bytes()).hexdigest() for p in APP.rglob('*') if p.is_file()}
manifest = APP / 'backend/Cargo.toml'
run(['cargo', 'clippy', '--manifest-path', manifest, '--all-targets', '--', '-D', 'warnings'])
run(['cargo', 'build', '--manifest-path', manifest, '--bins'])
run(['cargo', 'fmt', '--manifest-path', manifest, '--', '--check'])
http_config = dict(ENV, RBT_USER_HTTP_LISTEN_ADDR=f'127.0.0.1:{PORT+1}',
                   RBT_USER_HTTP_RPC_URL=f'http://127.0.0.1:{PORT}', RBT_USER_HTTP_OWNER_ID='owner')
for field in ['RBT_USER_HTTP_LISTEN_ADDR','RBT_USER_HTTP_RPC_URL','RBT_USER_HTTP_OWNER_ID']:
    invalid=dict(http_config)
    invalid.pop(field)
    run([TARGET/'debug/app','--user-http'],env=invalid,expected=1,timeout=10)
for upstream in ['http://127.0.0.1', 'http://127.0.0.1:0', f'http://127.0.0.1:{PORT+1}',
                 f'http://127.0.0.1:{PORT}/path', f'http://127.0.0.1:{PORT}?query',
                 f'http://user@127.0.0.1:{PORT}', f'http://192.0.2.1:{PORT}']:
    run([TARGET/'debug/app','--user-http'],env=dict(http_config,RBT_USER_HTTP_RPC_URL=upstream),expected=1,timeout=10)
run([TARGET/'debug/app','--user-http'],env=dict(http_config,RBT_USER_HTTP_LISTEN_ADDR=f'0.0.0.0:{PORT+1}'),expected=1,timeout=10)
client = TARGET / 'debug/client'
ref = run([client, 'state-ref', 'owner'])[0]
workflow_ref = run([client, 'workflow-state-ref', 'owner'])[0]
other_workflow_ref = run([client, 'workflow-state-ref', 'other'])[0]
# Inspectors are independent readers only; public Create owns construction.
import grpc_tools
py = STAGE / 'python'
py.mkdir()
assert protoc.main(['protoc', '-I'+str(APP/'api'), '-I'+str(ROOT), '-I'+str(Path(grpc_tools.__file__).parent/'_proto'), '--python_out='+str(py), str(APP/'api/user_app/v1/hello_world.proto'), str(APP/'api/user_app/v1/user_workflows.proto')]) == 0
import sys
sys.path.insert(0,str(py))
from user_app.v1 import hello_world_pb2


class Session:
    def __init__(self, name):
        self.path = STAGE / (name+'.log')
        self.log = self.path.open('w')
        self.p = subprocess.Popen([RBT, 'dev', 'run', '--rust-allow-insecure-database', f'--port={PORT}'], cwd=APP, env=ENV, stdout=self.log, stderr=subprocess.STDOUT, start_new_session=True)
        self.children = []
        self.data = {'pid': self.p.pid, 'log': str(self.path)}
        proof['sessions'].append(self.data)
        sessions.append(self)
        end = time.monotonic()+240
        while time.monotonic()<end:
            text = self.path.read_text()
            self.children = [int(n) for n in re.findall(r'Rust (?:Database|app) PID=(\d+)',text)]
            assert self.p.poll() is None,text
            if 'SERVING (canonical gRPC health check)' in text:
                assert len(self.children)==2,text
                self.data['children']=self.children[:]
                fields=Path(f'/proc/{self.children[0]}/cmdline').read_bytes().split(b'\0')
                self.database_port=int(fields[3])
                return
            time.sleep(.1)
        global timeout_seen
        timeout_seen=True
        raise TimeoutError(str(self.path))

    def close(self):
        global timeout_seen
        if self.p.poll() is None:
            self.p.send_signal(signal.SIGTERM)
        try:
            status=self.p.wait(timeout=15)
        except subprocess.TimeoutExpired:
            timeout_seen=True
            self.data['timeout']=True
            raise
        self.log.close()
        self.data.update(exit=status,children_absent=all(not Path(f'/proc/{p}').exists() for p in self.children))
        # Python reports a signal exit as negative; shell wrappers conventionally use 128 + signal.
        assert status in (-signal.SIGTERM, 128 + signal.SIGTERM) and self.data['children_absent'],self.data


class HttpSession:
    def __init__(self, name):
        self.log = (STAGE / (name+'-http.log')).open('w')
        env = dict(ENV, RBT_USER_HTTP_LISTEN_ADDR=f'127.0.0.1:{PORT+1}',
                   RBT_USER_HTTP_RPC_URL=f'http://127.0.0.1:{PORT}', RBT_USER_HTTP_OWNER_ID='owner')
        self.p = subprocess.Popen([TARGET/'debug/app','--user-http'], cwd=APP, env=env,
                                  stdout=self.log, stderr=subprocess.STDOUT)
        self.record={'pid':self.p.pid}
        proof.setdefault('http_cleanup',[]).append(self.record)
        self.shutdown=RequestedShutdown(self.p,self.log,self.record)
        http_sessions.append(self)
        deadline = time.monotonic()+15
        while time.monotonic()<deadline:
            assert self.p.poll() is None, 'HTTP host exited before readiness'
            try:
                if http_call('/user',None)[0] == 401:return
            except (OSError, urllib.error.URLError):pass
            time.sleep(.05)
        global timeout_seen
        timeout_seen=True
        proof['http_timeout_pid']=self.p.pid
        raise TimeoutError('HTTP readiness')

    def close(self):
        global timeout_seen
        try:
            self.shutdown.close()
        except subprocess.TimeoutExpired:
            timeout_seen=True
            proof['http_timeout_pid']=self.p.pid
            raise

def http_call(path,credential,body=None,extra=None):
    import urllib.request
    headers=dict(extra or {})
    if credential is not None:headers['Authorization']='Bearer '+credential
    request=urllib.request.Request(f'http://127.0.0.1:{PORT+1}'+path,
                                   data=body.encode() if body is not None else None,headers=headers)
    try:
        with urllib.request.urlopen(request,timeout=8) as reply:status,value=reply.status,reply.read().decode()
    except urllib.error.HTTPError as error:status,value=error.code,error.read().decode()
    proof.setdefault('http_calls',[]).append({'path':path,'status':status,'value':value})
    return status,value


def raw_http(headers,body=b'',expected=400):
    import socket
    with socket.create_connection(('127.0.0.1',PORT+1),timeout=4) as connection:
        connection.sendall(b'POST /user/greet HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n'+headers+b'\r\n'+body)
        result=b''
        while True:
            chunk=connection.recv(4096)
            if not chunk:break
            result+=chunk
        status=int(result.split(b' ',2)[1])
        assert status==expected, result
        proof.setdefault('raw_http_statuses',[]).append(status)


def call(command, credential, key=None, denied=None):
    env=dict(ENV)
    env.pop('RBT_USER_BEARER_TOKEN',None)
    if credential is not None:
        env['RBT_USER_BEARER_TOKEN']=credential
    args=[client,command,ref]+([key] if key else [])
    out,err=run(args,env=env,expected=1 if denied else 0,timeout=15)
    if denied:
        assert denied in err,(command,err)
    return out


def state(session, expected):
    with grpc.insecure_channel(f'127.0.0.1:{session.database_port}') as channel:
        response=database_pb2_grpc.DatabaseStub(channel).Load(database_pb2.LoadRequest(actors=[database_pb2.Actor(state_type='user_app.v1.HelloWorld',state_ref=ref)]),timeout=3)
    if expected is None:
        assert not response.actors,response
    else:
        assert len(response.actors)==1,response
        actor=response.actors[0]
        assert actor.state_type=='user_app.v1.HelloWorld' and actor.state_ref==ref,response
        assert hello_world_pb2.HelloWorld.FromString(actor.state).number_of_greetings==expected,response
    proof.setdefault('canonical_reads',[]).append({'expected':expected,'response_hex':response.SerializeToString().hex()})


def workflow(command, credential, *args, denied=None, target=None):
    env=dict(ENV)
    env.pop('RBT_USER_BEARER_TOKEN',None)
    if credential is not None: env['RBT_USER_BEARER_TOKEN']=credential
    out,err=run([client,'workflow-'+command,target or workflow_ref,*args],env=env,expected=1 if denied else 0,timeout=45 if command=='wait' else 15)
    if denied: assert denied in err,(command,err)
    return out


def transaction_ingress(credential):
    from user_app.v1 import user_workflows_pb2 as proto
    with grpc.insecure_channel(f'127.0.0.1:{PORT}') as channel:
        for method in ['Participant/Prepare','Participant/Commit','Participant/Abort','Participant/RelinquishOwnership','Coordinator/Watch']:
            try:
                channel.unary_unary('/rbt.v1alpha1.'+method)(b'',timeout=3)
                raise AssertionError('public transaction control mounted: '+method)
            except grpc.RpcError as error:
                assert error.code()==grpc.StatusCode.UNIMPLEMENTED,(method,error)
        for field in ['x-reboot-transaction-ids','x-reboot-transaction-coordinator-state-type','x-reboot-transaction-coordinator-state-ref','x-reboot-transaction-retry-age','x-reboot-transaction-coordinator-read-only-aware']:
            for method,body in [('Apply',proto.UserApply(amount=99)),('Inspect',proto.WorkflowEmpty())]:
                try:
                    channel.unary_unary('/user_app.v1.OwnerTransactionsMethods/'+method)(body.SerializeToString(),metadata=[('authorization','Bearer '+credential),('x-reboot-state-ref',workflow_ref),(field,'forged')],timeout=3)
                    raise AssertionError('inbound transaction metadata admitted')
                except grpc.RpcError as error:
                    assert error.code()==grpc.StatusCode.PERMISSION_DENIED,(field,method,error)
        valid_inbound=[('x-reboot-transaction-ids',json.dumps([str(uuid.uuid4())])),('x-reboot-transaction-coordinator-state-type','user_app.v1.OwnerWorkflows'),('x-reboot-transaction-coordinator-state-ref',workflow_ref)]
        for method,body in [('Apply',proto.UserApply(amount=99)),('Inspect',proto.WorkflowEmpty())]:
            try:
                channel.unary_unary('/user_app.v1.OwnerTransactionsMethods/'+method)(body.SerializeToString(),metadata=[('authorization','Bearer '+credential),('x-reboot-state-ref',workflow_ref)]+valid_inbound,timeout=3)
                raise AssertionError('valid inbound transaction metadata admitted')
            except grpc.RpcError as error:
                assert error.code()==grpc.StatusCode.PERMISSION_DENIED,(method,error)
    proof.setdefault('transaction_ingress_checks',0)
    proof['transaction_ingress_checks']+=1


def workflow_state(session, expected, target=None, transaction=0):
    with grpc.insecure_channel(f'127.0.0.1:{session.database_port}') as channel:
        response=database_pb2_grpc.DatabaseStub(channel).Load(database_pb2.LoadRequest(actors=[database_pb2.Actor(state_type='user_app.v1.OwnerWorkflows',state_ref=target or workflow_ref)]),timeout=3)
    if expected is None: assert not response.actors,response
    else:
        from user_app.v1 import user_workflows_pb2
        assert len(response.actors)==1,response
        actor=response.actors[0]
        assert actor.state_type=='user_app.v1.OwnerWorkflows' and actor.state_ref==(target or workflow_ref),response
        value=user_workflows_pb2.OwnerWorkflows.FromString(actor.state)
        assert (value.first,value.second,value.schedules)==expected,value
        assert value.transaction_value==transaction,value
    proof.setdefault('workflow_canonical_reads',[]).append({'expected':expected,'response_hex':response.SerializeToString().hex()})


if CHECKPOINT: Session=checkpoint_fixture.session_class(globals())
transaction_key=''

try:
    first=Session('first')
    bad_config = dict(ENV, RBT_RUST_DATABASE_URL=f'http://127.0.0.1:{first.database_port}', RBT_RUST_LISTEN_ADDR=f'127.0.0.1:{PORT+1}', RBT_RUST_UNAUTHORIZED_DEVELOPMENT='1')
    bad_config.pop('RBT_USER_RSA_PUBLIC_KEY_FILE')
    _, config_error = run([TARGET / 'debug/app'], env=bad_config, expected=1, timeout=10)
    assert 'NotPresent' in config_error, config_error
    invalid_key = STAGE / 'invalid-public.pem'
    invalid_key.write_text('-----BEGIN RSA PUBLIC KEY-----\nMAA=\n-----END RSA PUBLIC KEY-----')
    bad_config['RBT_USER_RSA_PUBLIC_KEY_FILE']=str(invalid_key)
    _, config_error = run([TARGET / 'debug/app'], env=bad_config, expected=1, timeout=10)
    assert 'expected RSA public verification key' in config_error,config_error
    owner=token(user_id='not-owner')
    wrong=token(sub='other',user_id='owner')
    for credential,code in [(None,'Unauthenticated'),('unsigned','Unauthenticated'),(wrong,'PermissionDenied'),(token(exp=1),'Unauthenticated'),(token(iss='other'),'Unauthenticated'),(token(aud='other'),'Unauthenticated')]:
        for method in ['create','greet','read']:
            call(method,credential,denied=code)
    if WORKFLOWS:
        for credential,code in [(None,'Unauthenticated'),('unsigned','Unauthenticated'),(wrong,'PermissionDenied'),(token(exp=1),'Unauthenticated')]:
            workflow('create',credential,str(uuid.uuid4()),denied=code)
            workflow('read',credential,denied=code)
            workflow('wait',credential,str(uuid.uuid4()),denied=code)
            workflow('apply',credential,str(uuid.uuid4()),'5','false',denied=code)
            workflow('inspect',credential,denied=code)
        workflow('create',wrong,str(uuid.uuid4()),target=other_workflow_ref,denied='PermissionDenied')
        workflow_state(first,None,target=other_workflow_ref)
        workflow_state(first,None)
        workflow('apply',owner,str(uuid.uuid4()),'5','false',denied='FailedPrecondition')
        workflow('inspect',owner,denied='FailedPrecondition')
        workflow_state(first,None)
        transaction_ingress(owner)
        workflow_state(first,None)
        workflow_create_key=str(uuid.uuid4())
        assert workflow('create',owner,workflow_create_key)=='created'
        workflow('set-claims',owner,denied='PermissionDenied')
        workflow_state(first,(0,0,0))
        workflow('run',owner,denied='PermissionDenied')
        workflow_state(first,(0,0,0))
        transaction_key=str(uuid.uuid4())
        assert workflow('apply',owner,transaction_key,'5','false')=='5'
        assert workflow('apply',owner,transaction_key,'5','false')=='5'
        assert workflow('apply',owner,str(uuid.uuid4()),'3','false')=='8'
        workflow('apply',owner,str(uuid.uuid4()),'99','true',denied='InvalidArgument')
        workflow('apply',owner,str(uuid.uuid4()),str(2**63-1),'false',denied='OutOfRange')
        for credential,code in [(None,'Unauthenticated'),('unsigned','Unauthenticated'),(wrong,'PermissionDenied'),(token(exp=1),'Unauthenticated')]:
            workflow('apply',credential,transaction_key,'5','false',denied=code)
            workflow('inspect',credential,denied=code)
        # Single-participant identity preflight rejects foreign actor targets
        # before policy evaluation; this is not evidence of owner-policy denial.
        workflow('apply',wrong,str(uuid.uuid4()),'5','false',target=other_workflow_ref,denied='InvalidArgument')
        workflow_state(first,None,target=other_workflow_ref)
        assert workflow('apply',owner,transaction_key,'5','false')=='5'
        assert workflow('inspect',owner)=='8'
        workflow_state(first,(0,0,0),transaction=8)
    http_first=HttpSession('first')
    for credential,status in [(None,401),('unsigned',401),(token(exp=1),401),(wrong,403)]:
        assert http_call('/user',credential)[0]==status
        assert http_call('/user/create',credential,str(uuid.uuid4()))[0]==status
        assert http_call('/user/greet',credential,str(uuid.uuid4()))[0]==status
    assert http_call('/user',None,extra={'x-reboot-state-ref':ref,'x-reboot-application-id':'forged','x-reboot-internal':'true'})[0]==401
    assert http_call('/user',owner)[0]==409
    assert http_call('/user/greet',owner,'invalid')[0]==400
    assert http_call('/user/greet',owner,'x'*1025)[0]==400
    raw_http(b'Content-Length: 36\r\nAuthorization: Bearer '+owner.encode()+b'\r\nAuthorization: Bearer unsigned\r\n')
    raw_http(b'Content-Length: 36\r\nAuthorization: Bearer '+owner.encode()+b'\r\n',expected=408)
    raw_http(b'Transfer-Encoding: chunked\r\nAuthorization: Bearer '+owner.encode()+b'\r\n',b'401\r\n'+b'x'*1025+b'\r\n0\r\n\r\n')
    state(first,None)
    call('read',owner,denied='FailedPrecondition')
    call('greet',owner,denied='FailedPrecondition')
    state(first,None)
    create_key=str(uuid.uuid4())
    assert http_call('/user/create',owner,create_key)==(200,'0')
    assert call('create',owner,create_key)=='0'
    call('create',owner,str(uuid.uuid4()),denied='FailedPrecondition')
    state(first,0)
    key=str(uuid.uuid4())
    assert http_call('/user/greet',owner,key)==(200,'1')
    assert call('greet',owner,key)=='1'
    assert call('greet',owner)=='2'
    call('greet',wrong,key,denied='PermissionDenied')
    call('set-claims',owner,denied='PermissionDenied')
    for credential in [None,'unsigned',token(exp=1),token(nbf='future'),token(iss=['https://issuer.example'])]:
        call('greet',credential,key,denied='Unauthenticated')
        call('read',credential,denied='Unauthenticated')
    assert call('read',owner)=='2'
    for credential,status in [(None,401),('unsigned',401),(token(exp=1),401),(wrong,403)]:
        assert http_call('/user/create',credential,create_key)[0]==status
    state(first,2)
    assert http_call('/user',owner,extra={'x-reboot-state-ref':'other','x-reboot-application-id':'forged'})==(200,'2')
    assert http_call('/user/greet',owner,key)==(200,'1')
    assert http_call('/user/create',owner,str(uuid.uuid4()))[0]==409
    state(first,2)
    http_first.close()
    assert call('read',owner)=='2'
    if WORKFLOWS:
        schedule_key=str(uuid.uuid4())
        not_before='0' if CHECKPOINT else str(int(time.time())+15)
        task=workflow('schedule',owner,schedule_key,not_before,'7')
        uuid.UUID(task)
        assert workflow('schedule',owner,schedule_key,not_before,'7')==task
        workflow('schedule',wrong,schedule_key,not_before,'7',denied='PermissionDenied')
        if CHECKPOINT:
            deadline=time.monotonic()+15
            while True:
                read=workflow('read',owner)
                if json.loads(read)=={'first':7,'second':0,'schedules':1}: break
                assert time.monotonic()<deadline,read
                time.sleep(.05)
            workflow_state(first,(7,0,1),transaction=8)
            proof['checkpoint_before_stop']=checkpoint_fixture.inspect(first,workflow_ref,task)
        else:
            workflow_state(first,(0,0,1),transaction=8)
    first.close()
    if WORKFLOWS and not CHECKPOINT:
        stopped_at=time.time()
        assert stopped_at < int(not_before),(stopped_at,not_before)
        proof['workflow_shutdown_before_eligibility']={'stopped_at':stopped_at,'not_before':int(not_before)}
    second=Session('restart')
    if CHECKPOINT:
        assert checkpoint_fixture.inspect(second,workflow_ref,task)==proof['checkpoint_before_stop']
        workflow_state(second,(7,0,1),transaction=8)
        proof['checkpoint_after_restart_paused']=checkpoint_fixture.inspect(second,workflow_ref,task)
        pause.unlink()
    if WORKFLOWS:
        for credential,code in [(None,'Unauthenticated'),('unsigned','Unauthenticated'),(wrong,'PermissionDenied'),(token(exp=1),'Unauthenticated')]:
            workflow('wait',credential,task,denied=code)
            workflow('schedule',credential,schedule_key,not_before,'7',denied=code)
        assert workflow('wait',owner,task)=='{"first":7,"second":7}'
        assert workflow('wait',owner,task)=='{"first":7,"second":7}'
        assert workflow('schedule',owner,schedule_key,not_before,'7')==task
        assert workflow('create',owner,workflow_create_key)=='created'
        for credential,code in [(None,'Unauthenticated'),('unsigned','Unauthenticated'),(wrong,'PermissionDenied'),(token(exp=1),'Unauthenticated')]:
            workflow('apply',credential,transaction_key,'5','false',denied=code)
            workflow('inspect',credential,denied=code)
        assert workflow('apply',owner,transaction_key,'5','false')=='5'
        assert workflow('inspect',owner)=='8'
        workflow_state(second,(7,7,1),transaction=8)
        assert workflow('apply',owner,str(uuid.uuid4()),'2','false')=='10'
        assert workflow('inspect',owner)=='10'
        transaction_ingress(owner)
        workflow_state(second,(7,7,1),transaction=10)
        proof['transaction_historical_response']=5
        proof['transaction_current_value']=10
        workflow_state(second,None,target=other_workflow_ref)
        proof['workflow_task']=task
        if CHECKPOINT:
            final=checkpoint_fixture.inspect(second,workflow_ref,task,completed=True)
            assert final['records']['first-effect']==proof['checkpoint_before_stop']['records']['first-effect']
            proof['checkpoint_completed']=final
    http_second=HttpSession('restart')
    for credential,status in [(None,401),('unsigned',401),(token(exp=1),401),(wrong,403)]:
        assert http_call('/user',credential)[0]==status
        assert http_call('/user/greet',credential,key)[0]==status
        assert http_call('/user/create',credential,create_key)[0]==status
    state(second,2)
    assert http_call('/user/create',owner,create_key)==(200,'0')
    assert http_call('/user/greet',owner,key)==(200,'1')
    assert http_call('/user',owner)==(200,'2')
    for credential in [None,'unsigned',token(exp=1),token(nbf=None)]:
        call('greet',credential,key,denied='Unauthenticated')
        call('read',credential,denied='Unauthenticated')
    assert call('create',owner,create_key)=='0'
    call('create',owner,str(uuid.uuid4()),denied='FailedPrecondition')
    state(second,2)
    call('greet',wrong,key,denied='PermissionDenied')
    assert call('greet',owner,key)=='1'
    assert call('read',owner)=='2'
    state(second,2)
    second.close()
    assert http_call('/user',owner)[0]==503
    assert http_call('/user/greet',owner,key)[0]==503
    http_second.close()
    assert all(hashlib.sha256((APP/p).read_bytes()).hexdigest()==h for p,h in proof['scaffold_hashes'].items())
    proof['passed']=True
    print('SIGNED_USER_PUBLIC_CLI_ACCEPTED',STAGE,flush=True)
finally:
    errors=[]
    if not timeout_seen:
        for session in http_sessions:
            try:session.close()
            except Exception as e:errors.append(str(e))
        for session in sessions:
            if session.p is None or session.p.poll() is None or (CHECKPOINT and session.db.poll() is None):
                try:session.close()
                except Exception as e:errors.append(str(e))
    proof['cleanup_errors']=errors
    RESULT.write_text(json.dumps(proof,indent=2))
    assert not errors,errors
