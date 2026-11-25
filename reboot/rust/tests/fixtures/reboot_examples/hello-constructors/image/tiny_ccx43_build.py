import os,subprocess,json,hashlib,time,fcntl,shutil
from pathlib import Path
S=Path('/home/benchbuild/.cache/tiny-current-src'); E=Path('/home/benchbuild/.cache/tiny-current-evidence');I=S/'reboot/rust/tests/fixtures/reboot_examples/hello-constructors/image'
locks=[]
for name in ['/home/benchbuild/reboot-rust/.cargo-target-acceptance/owner.lock','/home/benchbuild/.cache/tiny-current-evidence/build.lock']:
 f=open(name,'a');fcntl.flock(f,fcntl.LOCK_EX|fcntl.LOCK_NB);locks.append(f)
os.environ.update(CARGO_HOME='/home/benchbuild/.cargo',CARGO_TARGET_DIR='/home/benchbuild/.cache/hello-image-target',PATH='/home/benchbuild/.cargo/bin:'+os.environ['PATH'])
def sha(p):
 h=hashlib.sha256()
 with open(p,'rb') as f:
  for b in iter(lambda:f.read(1024*1024),b''):h.update(b)
 return h.hexdigest()
def run(cmd):
 with (E/('command-'+str(len(R['commands']))+'.log')).open('w') as f:
  p=subprocess.Popen(cmd,cwd=S,stdout=f,stderr=subprocess.STDOUT);r={'argv':cmd,'pid':p.pid,'start':time.time()};R['commands'].append(r);save();r['exit']=p.wait();r['end']=time.time();save();assert r['exit']==0,r
R={'source':'d3b0642d0cb9962c839cfb57ebfd33f2a3cca389','python_example':'5c332a2910122d6035799bfaf2a314bf1de830b8','sdk_native':'8574ccb0df9893274e69d1a19eca469dad56d779','commands':[],'complete':False}
def save():(E/'build.json').write_text(json.dumps(R,indent=2))
R['source_files']={str(p.relative_to(S)):sha(p) for p in S.rglob('*') if p.is_file()};save()
run(['cargo','test','--locked','--offline','--manifest-path',str(I.parent/'backend/Cargo.toml'),'--test','application','--','--test-threads=1'])
run(['cargo','build','--release','--locked','--offline','--manifest-path',str(I.parent/'backend/Cargo.toml'),'--bins'])
C=E/'rust-context';C.mkdir();target=Path(os.environ['CARGO_TARGET_DIR'])/'release'
for src,name in [(target/'app','app'),(target/'client','probe'),(Path('/lib/x86_64-linux-gnu/libgcc_s.so.1'),'libgcc_s.so.1'),(I/'Dockerfile','Dockerfile')]:shutil.copy2(src,C/name)
R['rust_binary_hashes']={p.name:sha(p) for p in C.iterdir()};save()
run(['docker','build','--pull=false','--network=none','--label','org.opencontainers.image.revision='+R['source'],'-t','hello-rust:tiny-current',str(C)])
# Fresh package of existing pinned Bazel SDK/native artifacts, original vendored example.
C=E/'python-context';C.mkdir();old=Path('/home/benchbuild/.cache/hello-image-evidence/python-context')
for name in ['rbt','rbt.runfiles','envoy']:
 src=old/name
 if src.is_dir():shutil.copytree(src,C/name,symlinks=False,ignore=shutil.ignore_patterns('__pycache__'))
 else:shutil.copy2(src,C/name)
shutil.copytree(I.parent/'upstream',C/'example',ignore=shutil.ignore_patterns('__pycache__','.rbt'))
# Preserve compatible generated API from frozen qualified context; original main/schema remain newly copied.
api=C/'example/hello-constructors/backend/api'
if api.exists():shutil.rmtree(api)
shutil.copytree(old/'example/hello-constructors/backend/api',api,ignore=shutil.ignore_patterns('__pycache__'))
shutil.copy2(I/'Python.Dockerfile',C/'Dockerfile');shutil.copy2(I/'python_entrypoint.py',C/'entrypoint.py')
R['python_files']={str(p.relative_to(C)):sha(p) for p in C.rglob('*') if p.is_file()};save()
run(['docker','build','--pull=false','--network=none','--label','org.opencontainers.image.revision='+R['source'],'--label','reboot.python-example='+R['python_example'],'--label','reboot.sdk-native='+R['sdk_native'],'-t','hello-python:tiny-current',str(C)])
R['images']=json.loads(subprocess.check_output(['docker','image','inspect','hello-rust:tiny-current','hello-python:tiny-current','hello-database:qualification'],text=True))
R['source_frozen']=all(sha(S/n)==h for n,h in R['source_files'].items());assert R['source_frozen'];R['complete']=True;save()
