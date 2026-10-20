"""Run on existing CCX43 under a durable service; never builds an image.

Only inputs: config.json with exact new tiny host identity, frozen app/client files.
All subprocesses (ingress, samples, original waits, commands) belong to this owner.
"""
import hashlib
import json
import os
from pathlib import Path
import shlex
import subprocess as sp
import sys
import time
import traceback
import uuid
from tiny_repeat_control import Owner, atomic

ROOT = Path(__file__).resolve().parent
PY = '/opt/rbt.runfiles/python3_10_12_x86_64-unknown-linux-gnu/bin/python3'
IMAGES = {'rust':'sha256:3dcf9d9976f76a63b3a290ef6cf15329f1f6148692c72604e5dc797a237f7db4',
          'python':'sha256:28241a509e8dbedda24bd2033ce556cc5648ddd02ef80bd349e417586fb84925',
          'engine':'sha256:1a73705b0771f9c861d9ba96509806849423a3d8bbff140b1261da76280460cd'}
COUNTS = {'reader':10000,'single_send':1000,'many_send':2000,'replay':10000}


class Benchmark:
    def __init__(self, config):
        self.config = config
        assert config['server_id'] != 171335411 and config['primary_ip_id'] != 156588567
        assert config['labels']['run'] == 'tiny-repeat-20261020'
        assert config['ip'] != '2.29.27.53'  # provider may recycle the deleted VM's address
        self.host = 'root@'+config['ip']
        self.o = Owner(ROOT/config.get('results_name','results'), config['owner_seconds'],
                       outer_deadline_epoch=config.get('outer_deadline_epoch'))
        self.o.ledger.update(config=config, images=IMAGES, key=self.key(),
                             source_sha256={p.name:hashlib.sha256(p.read_bytes()).hexdigest()
                                            for p in ROOT.glob('tiny_repeat_*.py')})
        self.active = []
        self.sam = None
        self.tunnel = None
        self.client_id = None
        self.client_wait = None
        self.row = None
        self.prefix = 'tinyrepeat'
        self.o.save()

    @staticmethod
    def key():
        return str(uuid.UUID(int=(((time.time_ns()//1000000)+3600000)<<80)|(7<<76)|(2<<62)))

    def tiny_argv(self, args):
        return ['ssh','-i',self.config['control_ssh_key'],'-o','BatchMode=yes','-o','StrictHostKeyChecking=accept-new','-o','ConnectTimeout=10',self.host,shlex.join([str(a) for a in args])]

    def tiny(self, *args, **kw):
        return self.o.run(self.tiny_argv(args), **kw)

    def local(self, *args, **kw):
        return self.o.run(list(args), **kw)

    def inspect(self, cid):
        return json.loads(self.tiny('docker','inspect',cid))[0]

    def start(self, role, image, extra, command=()):
        name = self.row['label']+'-'+role
        cid = self.tiny('docker','run','-d','--pull=never','--init',
                        '--cgroup-parent=tinyrepeat.slice',
                        '--label','owner=tiny-repeat-20261020','--name',name,*extra,image,*command).strip()
        # Persist exact ID before any later operation can fail.
        r = dict(name=name,id=cid,role=role,custody='UNRESOLVED',original_wait_qualified=False)
        self.row['containers'].append(r)
        self.active.append((r, None))
        self.o.save()
        self.arm(r)
        return cid

    def arm(self, r):
        if not any(a is r for a,c in self.active):
            r.update(custody='UNRESOLVED', original_wait_qualified=False)
            self.active.append((r, None))
            self.o.save()
        i = self.inspect(r['id'])
        assert i['State']['StartedAt'] != '0001-01-01T00:00:00Z'
        assert i['Image'] == IMAGES['engine' if r['role']=='engine' else self.row['language']]
        assert i['Config']['Labels']['owner']=='tiny-repeat-20261020'
        r['initial'] = i
        child = self.o.spawn(self.tiny_argv(['docker','wait',r['id']]), 'wait-'+str(len(self.o.children)))
        r['wait_child_name'] = child[0]['name']
        self.active = [(a,child if a is r else c) for a,c in self.active]
        r.update(custody='ARMED', original_wait_qualified=True)
        self.o.save()

    def retire(self):
        # Config first where present, then application BEFORE native engine.
        failures = []
        order = {'config':0,'app':1,'engine':2}
        for r, child in sorted(self.active, key=lambda rc:order[rc[0]['role']]):
            if r['role']=='engine' and any(a['role']=='app' and not a.get('stopped_confirmed') for a,c in self.active):
                failures.append('engine retained because application retirement is unresolved')
                continue
            try:
                i = self.inspect(r['id'])
                if i['State']['Running']:
                    self.tiny('docker','stop','-t','30',r['id'],timeout=90)
                terminal = self.inspect(r['id'])
                r['terminal'] = terminal
                assert not terminal['State']['Running'] and terminal['State']['Pid']==0
                r['stopped_confirmed'] = True
                if child is None:
                    r.update(custody='STOPPED_UNQUALIFIED', original_wait_qualified=False,
                             retired=True, original_wait_unqualified_reason='arm failed before original wait existed')
                    self.o.event('container_stopped_unqualified',id=r['id'],role=r['role'])
                    continue
                result = self.o.join(child, timeout=90)
                r['original_wait'] = dict(result)
                r['wait_output'] = (self.o.directory/result['log']).read_text().strip()
                assert result['exit']==0 and not result.get('join_timeout')
                assert int(r['wait_output']) == terminal['State']['ExitCode']
                assert not terminal['State']['Running'] and terminal['State']['Pid']==0
                r['retired'] = True
                r['custody'] = 'RETIRED'
                r['log_file'] = 'container-'+r['id']+'.log'
                self.tiny('docker','logs',r['id'],name=r['log_file'][:-4],check=False)
                self.o.event('container_retired',id=r['id'],role=r['role'])
            except BaseException:
                r['retirement_failure'] = traceback.format_exc()
                failures.append(r['retirement_failure'])
            finally:
                self.o.save()
        self.active = [(r,child) for r,child in self.active if not r.get('retired')]
        if failures:
            raise RuntimeError(failures)

    def stop_stack(self):
        failure = None
        try:
            self.retire()
        except BaseException:
            failure = traceback.format_exc()
        finally:
            if self.sam:
                result = self.o.join(self.sam,input_bytes=b'stop\n',timeout=30)
                self.sam = None
                assert result['exit']==0 and not result.get('join_timeout'), result
        if failure:
            raise RuntimeError(failure)

    def stack(self, lang, label):
        assert not self.active
        assert not self.tiny('docker','ps','-q').strip(), 'unexpected tiny workload'
        self.row = dict(language=lang,label=label,containers=[],cases={},complete=False)
        self.o.ledger['stacks'].append(self.row)
        self.o.save()
        self.tiny('systemctl','set-property','--runtime','tinyrepeat.slice','MemoryMax=infinity','MemorySwapMax=0')
        network = label+'-private'
        volume = label+'-state'
        self.tiny('docker','network','create','--internal','--label','owner=tiny-repeat-20261020',network)
        self.tiny('docker','volume','create','--label','owner=tiny-repeat-20261020',volume)
        self.row.update(network=network,volume=volume)
        self.sam = self.o.spawn(self.tiny_argv(['python3','-u','/root/tiny_repeat_sampler.py']),label+'-resources',True)
        if lang=='rust':
            cid=self.start('config',IMAGES[lang],['--network',network,'-v',volume+':/state'],['--server-info','/state/server-info.pb'])
            end = time.monotonic()+45
            while self.inspect(cid)['State']['Running']:
                assert time.monotonic()<end, 'config timeout'
                time.sleep(.5)
            assert self.inspect(cid)['State']['ExitCode']==0
            self.retire()
            engine=self.start('engine',IMAGES['engine'],['--network',network,'--network-alias','database','-v',volume+':/state'],['/state/rocksdb','/state/server-info.pb','20000'])
            end=time.monotonic()+100
            while self.inspect(engine)['State'].get('Health',{}).get('Status')!='healthy':
                assert self.inspect(engine)['State']['Running'] and time.monotonic()<end
                time.sleep(1)
            app=self.start('app',IMAGES[lang],['--network',network,'-p','127.0.0.1:50052:9990','-e','RBT_NAME=hello-image-qualified','-e','RBT_RUST_DATABASE_URL=http://database:20000','-e','RBT_RUST_LISTEN_ADDR=0.0.0.0:9990'])
        else:
            app=self.start('app',IMAGES[lang],['--network',network,'-p','127.0.0.1:50052:9991','-v',volume+':/state'])
        # Synchronous correction: engine remains exclusively internal.
        self.tiny('docker','network','connect','tinyrepeat-app-ingress',app)
        self.row['app_ingress_inspect']=self.inspect(app)
        self.ready(label+'-boot')

    def client(self, script, prefix, mode=None, label=None, timeout=1800):
        args=['docker','exec','-e','TINY_RAW_PATH=/evidence/'+label+'-rpc.jsonl',self.client_id,PY,'/bench/'+script,'127.0.0.1:50052',prefix]
        if script=='shared_probe.py':
            args += [self.o.ledger['key']] + ([mode] if mode else [])
        else:
            args += [mode,self.o.ledger['key']]
        begin=self.o.event('client_start',label=label,argv=args)
        output=self.o.run(args,name=label,timeout=timeout)
        self.o.event('client_end',label=label,start_time=begin['time'])
        return output

    def ready(self, label):
        deadline=time.monotonic()+110
        attempt=0
        while True:
            try:
                out=self.client('shared_probe.py','unused','--boot',label+'-'+str(attempt),timeout=80)
                assert json.loads(out.split('TRANSCRIPT=')[-1])['complete']
                return
            except Exception:
                self.o.event('readiness_retry',label=label,traceback=traceback.format_exc())
                assert time.monotonic()<deadline, 'readiness deadline'
                assert all(self.inspect(r['id'])['State']['Running'] for r,c in self.active)
                attempt+=1
                time.sleep(1)

    def restart(self, label):
        rows = [r for r,c in self.active]
        self.retire()
        # Start engine before app, the inverse of orderly stop.
        for r in sorted(rows,key=lambda r:r['role']!='engine'):
            new=dict(name=r['name'],id=r['id'],role=r['role'],restart=True)
            self.row['containers'].append(new)
            self.active.append((new,None))
            new.update(custody='UNRESOLVED',original_wait_qualified=False)
            self.o.save()
            self.tiny('docker','start',r['id'])
            self.arm(new)
        self.ready(label)

    def case(self, prefix, case, label):
        out=self.client('benchmark/client.py',prefix,case,label)
        r=json.loads(out)
        assert r['case']==case and r['requests']==COUNTS[case] and r['errors']==0
        from tiny_repeat_analyze import validate
        validate(r,COUNTS[case])
        self.row['cases'][case]={k:v for k,v in r.items() if k!='samples'}
        self.o.save()
        print(json.dumps(dict(run=self.row['label'],case=case,rps=r['successful_rps'])),flush=True)

    def preflight(self):
        # No compiler/cache mutation. Heavy validation is an explicit coordination gate.
        heavy=[]
        for p in Path('/proc').iterdir():
            if p.name.isdigit():
                try:
                    name=(p/'comm').read_text().strip()
                except FileNotFoundError:
                    continue
                if name in ['cargo','rustc','rust-lld','bazel','cc1plus','clang++']:
                    heavy.append(dict(pid=p.name,name=name))
        assert not heavy, ('CCX43 heavy owner active; coordinate timing with parent',heavy)
        assert not self.local('docker','ps','-q').strip(), 'existing external docker workload'
        for lang,image in IMAGES.items():
            i=json.loads(self.tiny('docker','image','inspect',image))[0]
            assert i['Id']==image
        assert json.loads(self.local('docker','image','inspect',IMAGES['python']))[0]['Id']==IMAGES['python']
        assert len(self.tiny('cat','/proc/swaps').splitlines())==1
        self.o.ledger['environment']={key:self.tiny('sh','-c',cmd) for key,cmd in {
            'date':'date -Is','meminfo':'cat /proc/meminfo','swaps':'cat /proc/swaps',
            'uname':'uname -a','docker':'docker info','cpu':'lscpu','cgroup':'cat /proc/self/cgroup'}.items()}
        # Bound cross-host clock offset using midpoint and SSH RTT uncertainty.
        clocks=[]
        for _ in range(5):
            lo=time.time();remote=float(self.tiny('date','+%s.%N'));hi=time.time()
            clocks.append(dict(local_lo=lo,remote=remote,local_hi=hi,offset_lo=remote-hi,offset_hi=remote-lo))
        self.o.ledger['clock_bounds']=clocks
        assert all(abs((x['offset_lo']+x['offset_hi'])/2)<2 for x in clocks)
        self.o.save()
        existing=self.tiny('docker','network','ls','--filter','name=^tinyrepeat-app-ingress$','--format','{{.ID}}').strip()
        if existing:
            network=json.loads(self.tiny('docker','network','inspect',existing))[0]
            assert network['Labels']['owner']=='tiny-repeat-20261020' and network['Internal'] is False
        else:
            self.tiny('docker','network','create','--label','owner=tiny-repeat-20261020','tinyrepeat-app-ingress')
        self.client_id=self.local('docker','run','-d','--pull=never','--init','--name','tiny-repeat-20261020-client',
                                 '--network','host','--cpuset-cpus',self.config['client_cpu'],
                                 '--entrypoint',PY,'--no-healthcheck','-v',str(ROOT/'bench')+':/bench:ro','-v',str(self.o.directory)+':/evidence',
                                 IMAGES['python'],'-c','import time;time.sleep(18000)').strip()
        self.o.ledger['client_id']=self.client_id
        self.o.save()
        initial=json.loads(self.local('docker','inspect',self.client_id))[0]
        assert initial['State']['Running'] and initial['Image']==IMAGES['python']
        self.o.ledger['client_initial']=initial
        self.client_wait=self.o.spawn(['docker','wait',self.client_id],'external-client-original-wait')
        self.tunnel=self.o.spawn(['ssh','-i',self.config['ssh_key'],'-o','BatchMode=yes',
                                 '-o','StrictHostKeyChecking=accept-new','-o','ExitOnForwardFailure=yes',
                                 '-o','ServerAliveInterval=15','-o','ServerAliveCountMax=3','-N',
                                 '-L','127.0.0.1:50052:127.0.0.1:50052',self.host],'app-only-tunnel')
        time.sleep(2)
        assert self.tunnel[1].poll() is None
        self.o.save()

    def execute(self):
        transcripts={}
        try:
            self.o.ledger['gate']='awaiting-parent-timing-clearance'
            self.o.save()
            # Parent coordinates worker47180e96's exclusive heavy-cache/native
            # suite. No workload starts merely because one process snapshot is quiet.
            while not (ROOT/'TIMING-CLEARANCE.json').exists():
                self.o.allowance(2)
                time.sleep(2)
            clearance=json.loads((ROOT/'TIMING-CLEARANCE.json').read_text())
            assert clearance['heavy_owner_retired'] is True
            assert clearance['no_heavy_suite_overlap'] is True
            self.o.ledger['timing_clearance']=clearance
            self.o.ledger['gate']='preflight'
            self.o.save()
            self.preflight()
            self.o.ledger['gate']='qualification'
            self.o.save()
            for lang in ['rust','python']:
                label='repeat-qualification-'+lang
                self.stack(lang,label)
                try:
                    out=self.client('shared_probe.py','repeat-common',label=label+'-correctness')
                    transcripts[lang]=json.loads(out.split('TRANSCRIPT=')[-1])
                    assert transcripts[lang]['complete']
                    self.restart(label+'-restart-ready')
                    out=self.client('shared_probe.py','repeat-common','--restart',label+'-retained')
                    assert json.loads(out.split('TRANSCRIPT=')[-1])['complete']
                    prefix='soak'
                    assert json.loads(self.client('benchmark/client.py',prefix,'seed',label+'-seed'))['seeded']
                    end=time.monotonic()+300
                    iterations=0
                    while time.monotonic()<end:
                        case='reader' if iterations%2==0 else 'replay'
                        self.case(prefix,case,label+'-soak-'+str(iterations))
                        iterations+=1
                    self.row.update(soak_iterations=iterations,soak_elapsed_min=300,complete=True)
                finally:
                    self.stop_stack()
            sys.path.insert(0,str(ROOT/'bench'))
            from transcript_comparison import compare_transcripts
            comparison=compare_transcripts(transcripts['rust'],transcripts['python'])
            assert comparison['records_each']==22 and comparison['deterministic_records_exact']==21
            self.o.ledger['comparison']=comparison
            self.o.save()
            for rep in range(1,4):
                self.o.ledger['gate']='performance-repetition-'+str(rep)
                self.o.save()
                for lang in (['rust','python'] if rep%2 else ['python','rust']):
                    label='repeat-perf-'+str(rep)+'-'+lang
                    print('CURRENT '+label,flush=True)
                    self.stack(lang,label)
                    try:
                        prefix='perf-'+str(rep)
                        assert json.loads(self.client('benchmark/client.py',prefix,'seed',label+'-seed'))['seeded']
                        for case in COUNTS:
                            self.case(prefix,case,label+'-'+case)
                        before=json.loads(self.client('benchmark/client.py',prefix,'verify',label+'-verify-before'))
                        self.restart(label+'-restart-ready')
                        after=json.loads(self.client('benchmark/client.py',prefix,'verify',label+'-verify-after'))
                        assert before==after
                        self.row.update(retained=after,complete=True)
                    finally:
                        self.stop_stack()
            self.o.ledger['complete']=True
        except BaseException:
            self.o.ledger['failures'].append(traceback.format_exc())
            print(traceback.format_exc(),flush=True)
            if self.row:
                self.row['failure']=traceback.format_exc()
        finally:
            # Every independent cleanup attempted, even after another fails.
            self.o.begin_cleanup()
            for attempt in range(3):
                if not self.active:
                    break
                try:
                    self.retire()
                except BaseException:
                    self.o.event('cleanup_retry',attempt=attempt,traceback=traceback.format_exc())
            for name, action in [('stack',self.stop_stack),('external-client',self.stop_client),('tunnel',self.stop_tunnel)]:
                try:
                    action()
                except BaseException:
                    self.o.ledger['failures'].append(name+': '+traceback.format_exc())
                    self.o.ledger['complete']=False
                    self.o.save()
            self.o.finish()
        return 0 if self.o.ledger['complete'] and not self.o.ledger['failures'] else 1

    def stop_client(self):
        if self.client_id:
            self.local('docker','stop','-t','15',self.client_id,timeout=60)
            result=self.o.join(self.client_wait,timeout=60)
            terminal=json.loads(self.local('docker','inspect',self.client_id))[0]
            output=(self.o.directory/result['log']).read_text().strip()
            self.o.ledger['client_terminal']=terminal
            self.o.ledger['client_wait']=dict(result)
            assert result['exit']==0 and int(output)==terminal['State']['ExitCode']
            assert not terminal['State']['Running'] and terminal['State']['Pid']==0

    def stop_tunnel(self):
        if self.tunnel:
            self.o.join(self.tunnel,stop=True,timeout=30)


if __name__=='__main__':
    config=json.loads((ROOT/'config.json').read_text())
    sys.exit(Benchmark(config).execute())
