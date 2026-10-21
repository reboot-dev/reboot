#!/usr/bin/env python3
"""Build locked release artifacts and hash-pinned native/Python example images.
Run on the authorized Linux/amd64 qualification host, not a workstation.
"""
import argparse,hashlib,json,os,shutil,subprocess
from pathlib import Path
HERE=Path(__file__).resolve().parent
ROOT=next(p for p in HERE.parents if (p/'reboot/rust/Cargo.toml').exists())
def sha(p):
 h=hashlib.sha256()
 with open(p,'rb') as f:
  for chunk in iter(lambda:f.read(1024*1024),b''):h.update(chunk)
 return h.hexdigest()
def command(argv,**kwargs):return subprocess.check_output([str(x) for x in argv],text=True,**kwargs)
def main():
 p=argparse.ArgumentParser(__doc__)
 p.add_argument('--out',type=Path,required=True)
 p.add_argument('--database',type=Path,required=True)
 p.add_argument('--database-sha256',required=True)
 p.add_argument('--engine-source',required=True)
 p.add_argument('--rbt',type=Path,required=True)
 p.add_argument('--python-sdk-source',required=True)
 p.add_argument('--envoy',type=Path,required=True)
 p.add_argument('--envoy-sha256',default='c994c452de131f59c9ec9f4a2fffcc65039f250a38b6279870bb95dac21db0fa')
 p.add_argument('--offline',action='store_true')
 p.add_argument('--generator-path',required=True,help='Pinned SDK Bazel plugin directory plus matching mypy-protobuf tools, colon separated')
 a=p.parse_args()
 if command(['uname','-m']).strip()!='x86_64':raise SystemExit('this artifact recipe is pinned to Linux/amd64')
 if not command(['rustc','--version']).startswith('rustc 1.99.1 '):raise SystemExit('requires pinned rustc 1.99.1')
 for artifact,expected in [(a.database,a.database_sha256),(a.envoy,a.envoy_sha256)]:
  if not artifact.is_file() or sha(artifact)!=expected:raise SystemExit('missing or incompatible hash-pinned artifact: '+str(artifact))
 runfiles=Path(str(a.rbt)+'.runfiles');assert runfiles.is_dir()
 a.out.mkdir(exist_ok=False,parents=True);rust=a.out/'rust';python=a.out/'python';rust.mkdir();python.mkdir()
 manifest=HERE.parent/'backend/Cargo.toml'
 subprocess.run(['cargo','build','--release','--locked']+(['--offline'] if a.offline else [])+['--manifest-path',str(manifest),'--bins'],check=True,cwd=ROOT)
 target=Path(os.environ.get('CARGO_TARGET_DIR',str(HERE.parent/'backend/target'))).resolve()/'release'
 for source,name in [(target/'app','app'),(target/'client','probe'),(a.database,'database'),(Path('/lib/x86_64-linux-gnu/libstdc++.so.6'),'libstdc++.so.6'),(Path('/lib/x86_64-linux-gnu/libgcc_s.so.1'),'libgcc_s.so.1')]:shutil.copy2(source,rust/name)
 for name in ['Dockerfile','Database.Dockerfile']:shutil.copy2(HERE/name,rust/name)
 shutil.copy2(a.rbt,python/'rbt');shutil.copytree(runfiles,python/'rbt.runfiles',symlinks=False,ignore=shutil.ignore_patterns('__pycache__','MANIFEST','_repo_mapping'))
 shutil.copytree(HERE.parent/'upstream',python/'example',ignore=shutil.ignore_patterns('__pycache__','.rbt'))
 # Use supported rbt generation, unchanged upstream schema and original main.py.
 generated=python/'example/hello-constructors/backend/api';generated.mkdir(parents=True,exist_ok=True)
 env=dict(os.environ,PATH=a.generator_path+':'+os.environ['PATH'])
 subprocess.run([str(a.rbt.resolve()),'generate'],cwd=python/'example/hello-constructors',env=env,check=True)
 shutil.copy2(a.envoy,python/'envoy');shutil.copy2(HERE/'python_entrypoint.py',python/'entrypoint.py');shutil.copy2(HERE/'Python.Dockerfile',python/'Dockerfile')
 receipt={'source':command(['git','rev-parse','HEAD'],cwd=ROOT).strip(),'rustc':command(['rustc','--version','--verbose']),'cargo':command(['cargo','--version']),'engine_source':a.engine_source,'engine_sha256':a.database_sha256,'python_sdk_source':a.python_sdk_source,'envoy_sha256':a.envoy_sha256,'files':{}}
 for directory in [rust,python]:
  receipt['files'][directory.name]={str(f.relative_to(directory)):sha(f) for f in directory.rglob('*') if f.is_file()}
 for image,context,dockerfile in [('hello-rust:qualification',rust,'Dockerfile'),('hello-database:qualification',rust,'Database.Dockerfile'),('hello-python:qualification',python,'Dockerfile')]:
  subprocess.run(['docker','build','--platform=linux/amd64','--pull=false','--network=none','-f',str(context/dockerfile),'-t',image,str(context)],check=True)
 receipt['images']=json.loads(command(['docker','image','inspect','hello-rust:qualification','hello-database:qualification','hello-python:qualification']))
 (a.out/'build-receipt.json').write_text(json.dumps(receipt,indent=2)+'\n')
 print(a.out/'build-receipt.json')
if __name__=='__main__':main()
