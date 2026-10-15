import pathlib, json, hashlib, time, subprocess, os, fcntl, shutil
import sys
targeted = '--targeted-user-batch' in sys.argv
probe = len(sys.argv) > 1 and sys.argv[1] == "--ownership-failure-probe"
mode = sys.argv[4] if probe and len(sys.argv) > 4 else "none"
root=pathlib.Path(__file__).resolve().parents[3]
target=pathlib.Path(os.environ.get('CARGO_TARGET_DIR','/tmp/reboot-rust-workflow-loop3-target'))
stage=pathlib.Path(sys.argv[2]) if probe else pathlib.Path('/tmp/reboot-rust-user-http-full-audit-'+str(time.time_ns()))
stage.mkdir(exist_ok=probe)
lock=open((stage if probe else target)/'owner.lock','a'); fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
import importlib.util
helper=pathlib.Path(sys.argv[3]) if probe else root/'tests/reboot/cli/rust_process_ownership.py'
spec=importlib.util.spec_from_file_location('ownership',helper)
assert spec is not None and spec.loader is not None
ownership=importlib.util.module_from_spec(spec);spec.loader.exec_module(ownership)
ownership.enable_subreaper()
def identity(pid):
    try:
        t=pathlib.Path(f'/proc/{pid}/stat').read_text().rsplit(') ',1)[1].split()
        return int(t[1]),t[19]
    except (FileNotFoundError,ProcessLookupError): return None
def sample(parent,owned):
    ownership.discover_owned(owned, os.getpid())
def budget():
    if probe:return (0,shutil.disk_usage(stage).free)
    size=int(subprocess.check_output(['du','-sb',str(target)]).split()[0]);free=shutil.disk_usage('/tmp').free
    # Preserve the original default; operators explicitly pass an approved ceiling.
    ceiling=int(os.environ.get('RUST_DX_TARGET_CEILING_BYTES','10000000000'))
    assert ceiling>0,ceiling
    assert size<=ceiling and free>=8*1024**3,(size,free,ceiling)
    return size,free
results=[]
try:
    if probe:
        manifest={}
        env=dict(os.environ, RUST_OWNERSHIP_RELEASE=str(stage/'release-child'))
        commands=[('forced_failure',[sys.executable,'-c',
            'import os,time\npid=os.fork()\nif pid==0:\n while not os.path.exists(os.environ["RUST_OWNERSHIP_RELEASE"]):time.sleep(.01)\nos._exit(0 if pid==0 else '+('0' if mode=='success' else '7')+')'])]
    else:
        budget()
        paths=[p for d in ['reboot/rust','reboot/cli/commands/init/templates','tests/reboot/cli'] for p in (root/d).rglob('*') if p.is_file() and p.suffix!='.pyc' and not {'target','__pycache__','.rbt'}.intersection(p.parts)]
        paths += [root/'reboot/cli/commands'/p for p in ['rust_dev.py','dev.py','init/init.py','init/rust_init.py']]
        from rust_examples_runtime import executable_identity
        selected_database = executable_identity(os.environ.get('RBT_RUST_DATABASE_BINARY'), 'RBT_RUST_DATABASE_BINARY')
        database = pathlib.Path(selected_database['path'])
        if 'REBOOT_NATIVE2PC_CXX_DATABASE' in os.environ:
            native_database = executable_identity(os.environ['REBOOT_NATIVE2PC_CXX_DATABASE'], 'REBOOT_NATIVE2PC_CXX_DATABASE')
            if native_database['path'] != str(database):
                raise ValueError('Native and public gates must select the same Database executable')
        paths += [database,root/'rbt/v1alpha1/database.proto',root/'rbt/v1alpha1/tasks.proto']
        paths += [pathlib.Path(__file__).resolve()]
        manifest={str(p):hashlib.sha256(p.read_bytes()).hexdigest() for p in paths}
        (stage/'frozen-source.json').write_text(json.dumps(manifest,indent=2))
        (stage/'owner.json').write_text(json.dumps({'runner_pid':os.getpid(),'runner_start':identity(os.getpid())[1]}))
        print('STAGE',stage,flush=True)
        overlay=stage/'overlay';(overlay/'reboot').mkdir(parents=True)
        (overlay/'reboot/__init__.py').write_text('from pkgutil import extend_path\n__path__ = extend_path(__path__, __name__)\n')
        (overlay/'reboot/cli').symlink_to(root/'reboot/cli',target_is_directory=True)
        python=os.environ.get('RUST_DX_PYTHON','/tmp/reboot-rust-app-dx-loop2-venv310/bin/python')
        for package in ['rbt','rbt/v1alpha1']:
            (overlay/package).mkdir(exist_ok=True)
            (overlay/package/'__init__.py').write_text('from pkgutil import extend_path\n__path__ = extend_path(__path__, __name__)\n')
        grpc_include=subprocess.check_output([python,'-c','from pathlib import Path; import grpc_tools; print(Path(grpc_tools.__file__).parent / "_proto")'],text=True).strip()
        subprocess.run([python,'-m','grpc_tools.protoc','-I'+str(root),'-I'+grpc_include,'--python_out='+str(overlay),'--grpc_python_out='+str(overlay),str(root/'rbt/v1alpha1/database.proto'),str(root/'rbt/v1alpha1/tasks.proto')],check=True)
        env=dict(os.environ,CARGO_TARGET_DIR=str(target),CARGO_BUILD_JOBS='2',CARGO_INCREMENTAL='0',CARGO_PROFILE_DEV_DEBUG='0',CARGO_PROFILE_TEST_DEBUG='0',PYTHONPATH=str(overlay),REBOOT_NATIVE2PC_CXX_DATABASE=str(database),RBT_RUST_DATABASE_BINARY=str(database))
        env.update(RUST_DX_STAGE=str(stage/'greeting'),RUST_DX_TARGET=str(target),RUST_DX_DATABASE_BINARY=str(database),RUST_DX_RBT=os.environ.get('RUST_DX_RBT','/tmp/reboot-rust-app-dx-loop2-venv310/bin/rbt'),RUST_DX_PORT=os.environ.get('RUST_DX_PORT','12991'))
        commands=[
         ('sdk_all_targets',['cargo','test','--manifest-path','reboot/rust/Cargo.toml','--locked','--all-features','--all-targets']),
         ('sdk_strict_clippy',['cargo','clippy','--manifest-path','reboot/rust/Cargo.toml','--locked','--all-features','--all-targets','--','-D','warnings']),
         ('consumer_strict_clippy',['cargo','clippy','--manifest-path','reboot/rust/tests/fixtures/reactive_app/Cargo.toml','--locked','--all-targets','--','-D','warnings']),
         ('cli_unit',[python,'-m','unittest','discover','-s','tests/reboot/cli','-p','rust_app_dx_test.py','-v']),
         ('greeting_public',[python,str(root/'tests/reboot/cli/rust_app_dx_e2e.py')]),
        ]
        commands.insert(3, ('native4', ['cargo','test','--manifest-path','reboot/rust/Cargo.toml','--locked','--all-features','--test','reactive_native_restart','--','--ignored','--test-threads=1','--nocapture']))
        commands.insert(5, ('user_public',[python,str(root/'tests/reboot/cli/rust_user_app_e2e.py')]))
        commands.insert(6, ('user_workflows_public',[python,str(root/'tests/reboot/cli/rust_user_app_e2e.py'),'--workflows']))
        commands.insert(7, ('user_checkpoint_fixture',[python,str(root/'tests/reboot/cli/rust_user_app_e2e.py'),'--checkpoint-fixture']))
        commands.extend([
         ('native_local11', ['cargo','test','--manifest-path','reboot/rust/Cargo.toml','--locked','--all-features','--test','generated_cxx_database_process','registered_same_host_generated_','--','--ignored','--test-threads=1','--nocapture']),
         ('native_fixture_strict_clippy', ['cargo','clippy','--manifest-path','reboot/rust/tests/fixtures/generated_cxx_database_process/Cargo.toml','--locked','--all-targets','--','-D','warnings']),
        ])
        commands.extend([
         ('upstream_schema_strict_clippy', ['cargo','clippy','--manifest-path','reboot/rust/tests/fixtures/reboot_examples/Cargo.toml','--locked','--all-targets','--','-D','warnings']),
         ('upstream_tasks_native', ['cargo','test','--manifest-path','reboot/rust/tests/fixtures/reboot_examples/Cargo.toml','--locked','--features','native-test-support','--test','hello_tasks_native','--','--ignored','--test-threads=1','--nocapture']),
         ('upstream_consumer_tests', ['cargo','test','--manifest-path','reboot/rust/tests/fixtures/reboot_examples/imported_error/Cargo.toml','--locked']),
         ('upstream_consumer_strict_clippy', ['cargo','clippy','--manifest-path','reboot/rust/tests/fixtures/reboot_examples/imported_error/Cargo.toml','--locked','--all-targets','--','-D','warnings']),
         ('upstream_constructor_strict_clippy', ['cargo','clippy','--manifest-path','reboot/rust/tests/fixtures/reboot_examples/hello-constructors/backend/Cargo.toml','--locked','--all-targets','--','-D','warnings']),
         ('upstream_constructors_public', [python, str(root/'tests/reboot/cli/rust_examples_constructor_e2e.py')]),
         ('upstream_tasks_public', [python, str(root/'tests/reboot/cli/rust_examples_tasks_e2e.py')]),
        ])
        if targeted: commands=[item for item in commands if item[0] in ['user_workflows_public','user_checkpoint_fixture']]
        commands.insert(0, ('ownership_regressions',[python,str(root/'tests/reboot/cli/rust_process_ownership_test.py')]))
    for name,cmd in commands:
        budget();assert all(hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest()==h for p,h in manifest.items())
        item={'suite':name,'command':cmd,'log':str(stage/(name+'.log')),'owned_process_starttimes':{}}
        results.append(item);print('GATE',name,flush=True)
        with open(item['log'],'w') as log:
            child=subprocess.Popen(cmd,cwd=root,env=env,stdout=log,stderr=subprocess.STDOUT,start_new_session=True)
            item['pid']=child.pid
            while True:
                if not probe:sample(child.pid,item['owned_process_starttimes'])
                (stage/'running.json').write_text(json.dumps(results,indent=2))
                code=child.poll()
                if code is not None:break
                time.sleep(.1)
        item['exit']=code
        item['live_owned_processes']=[pid for pid,start in item['owned_process_starttimes'].items() if identity(pid) and identity(pid)[1]==start]
        item['source_mismatch']=[p for p,h in manifest.items() if hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest()!=h]
        (stage/'running.json').write_text(json.dumps(results,indent=2));print('RESULT',name,code,'LIVE',item['live_owned_processes'],flush=True)
        if probe:(stage/'probe-gate-exited.json').write_text(json.dumps({'exit':code}))
        assert code==0 and not item['live_owned_processes'] and not item['source_mismatch'],item
        budget()
    if not probe and not targeted:
        proof=json.loads((stage/'greeting/acceptance-result.json').read_text())
        assert proof['passed'] and proof['frozen_sources_match_end']
        users=[json.loads(p.read_text()) for p in (stage/'greeting').glob('reboot-rust-public-user-*/result.json')]
        assert len(users)==3 and {(u['workflows'],u['checkpoint_fixture']) for u in users}=={(False,False),(True,False),(True,True)}
        assert all(u['passed'] and not u['cleanup_errors'] for u in users)
        import re
        constructor_gate = next(item for item in results if item['suite'] == 'upstream_constructors_public')
        handles = re.findall(r'^UPSTREAM_CONSTRUCTORS_ACCEPTED (.+)$', pathlib.Path(constructor_gate['log']).read_text(), re.MULTILINE)
        assert len(handles) == 1, handles
        constructor_proof = json.loads(pathlib.Path(handles[0]).read_text())
        assert constructor_proof['passed'] and len(constructor_proof['sessions']) == 2
        assert all(s['requested_shutdown'] and s['children_absent'] for s in constructor_proof['sessions'])
        assert len(constructor_proof['commands']) == 8 and all(c['exit'] == 0 for c in constructor_proof['commands'])
        assert all(hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest() == h for p,h in constructor_proof['source_hashes'].items())
        assert len(results) == 19, len(results)
        tasks_public_gate = next(item for item in results if item['suite'] == 'upstream_tasks_public')
        handles = re.findall(r'^UPSTREAM_TASKS_ACCEPTED (.+)$', pathlib.Path(tasks_public_gate['log']).read_text(), re.MULTILINE)
        assert len(handles) == 1, handles
        tasks_public_proof = json.loads(pathlib.Path(handles[0]).read_text())
        assert tasks_public_proof['passed'] and tasks_public_proof['pending_at_shutdown_exact']
        assert not tasks_public_proof['live_owned_processes']
        assert len(tasks_public_proof['sessions']) == 3
        assert all(s['requested_shutdown'] and s['children_absent'] for s in tasks_public_proof['sessions'])
        assert tasks_public_proof['missing_pending_at_shutdown_exact']
        assert len(tasks_public_proof['shutdown_inspections']) == 2
        assert all(s['requested_shutdown'] and s['process_absent'] for s in tasks_public_proof['shutdown_inspections'])
        assert len(tasks_public_proof['commands']) == 9 and all(c['exit'] == 0 for c in tasks_public_proof['commands'])
        assert tasks_public_proof['invocation_counts'] == {'Send': 4, 'WarningBefore': 5, 'WarningAfter': 5, 'Erase': 4}
        output = '\n'.join(c['stdout'] for c in tasks_public_proof['commands'])
        for marker in ['MISSING_IDS_PENDING_AT_SHUTDOWN_EXACT', 'MISSING_IDS_PUBLIC_PENDING_RETRY_ACCEPTED missing-seed', 'MISSING_IDS_PUBLIC_PENDING_RETRY_ACCEPTED missing-recover']:
            assert marker in output, marker
        assert all(hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest() == h for p,h in tasks_public_proof['source_hashes'].items())
        tasks_gate = next(item for item in results if item['suite'] == 'upstream_tasks_native')
        assert re.findall(r'test result: (ok|FAILED)\. (\d+) passed; (\d+) failed; (\d+) ignored;', pathlib.Path(tasks_gate['log']).read_text()) == [('ok', '4', '0', '0')]
        assert 'test local_retry::native_missing_ids_retry_then_ordinary_writer_insertion_completes_once ...' in pathlib.Path(tasks_gate['log']).read_text()
        for item in results:
            if item['suite'] in ['sdk_all_targets','native4','native_local11']:
                item['summaries']=re.findall(r'test result: (ok|FAILED)\. (\d+) passed; (\d+) failed; (\d+) ignored;',pathlib.Path(item['log']).read_text())
                assert item['summaries'] and all(v[0]=='ok' and v[2]=='0' for v in item['summaries'])
                if item['suite']=='native4':assert item['summaries'][-1]==('ok','4','0','0')
                elif item['suite']=='native_local11':assert item['summaries'][-1]==('ok','11','0','0')
                else:assert sum(int(v[1]) for v in item['summaries'])>0
    if not probe and targeted:
        users=[json.loads(p.read_text()) for p in (stage/'greeting').glob('reboot-rust-public-user-*/result.json')]
        assert len(users)==2 and {(u['workflows'],u['checkpoint_fixture']) for u in users}=={(True,False),(True,True)}
        assert all(u['passed'] and not u['cleanup_errors'] for u in users)
    final_budget=budget()
finally:
    # Subreaper discovery in retention covers unrecorded adopted orphans too.
    owned = {pid: start for item in results for pid, start in item['owned_process_starttimes'].items()}
    if probe and mode == 'observe':
        original=ownership.discover_owned
        failures=[3]
        def injected_observation(*args,**kwargs):
            if failures[0]:
                failures[0]-=1
                raise OSError('injected observation failure')
            return original(*args,**kwargs)
        ownership.discover_owned=injected_observation
    if probe and mode == 'evidence':
        original_write=pathlib.Path.write_text
        failures=[3]
        def injected_evidence(path,*args,**kwargs):
            if path.name=='retained-owners.json.tmp' and failures[0]:
                failures[0]-=1
                raise OSError('injected evidence failure')
            return original_write(path,*args,**kwargs)
        pathlib.Path.write_text=injected_evidence
    if probe and mode == 'snapshot':
        original=ownership.discover_owned
        failures=[2]
        def injected_snapshot(*args,**kwargs):
            if failures[0]:
                failures[0]-=1
                return {}
            return original(*args,**kwargs)
        ownership.discover_owned=injected_snapshot
    if probe and mode == 'stderr':
        original=ownership.discover_owned
        original_stderr=sys.stderr
        failures=[1]
        class ClosedDiagnostic:
            def write(self,value):raise BrokenPipeError('closed diagnostic')
            def flush(self):raise BrokenPipeError('closed diagnostic')
        def injected_stderr(*args,**kwargs):
            if failures[0]:
                failures[0]-=1
                sys.stderr=ClosedDiagnostic()
                raise OSError('injected observation failure with closed stderr')
            sys.stderr=original_stderr
            return original(*args,**kwargs)
        ownership.discover_owned=injected_stderr
    ownership.retain_until_owned_exit(owned, stage/'retained-owners.json', root_pid=os.getpid())

(stage/'accepted.json').write_text(json.dumps({'accepted':True,'gates':results,'greeting_result':str(stage/'greeting/acceptance-result.json'),'budget':final_budget,'fixture':probe,'publication_eligible':not targeted and not probe},indent=2))
print('TARGETED_USER_BATCH_ACCEPTED' if targeted else 'PUBLICATION_GATES_ACCEPTED',stage,flush=True)
