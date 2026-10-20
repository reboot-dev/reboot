"""Retain and independently read back final local-only benchmark closure."""
import datetime,hashlib,json,shlex,subprocess
from pathlib import Path
O=Path('repeat-results-20261020');R='/home/ladin/.cache/hermes-reboot-parity/tiny-repeat-20261020/completed-closure';baseline='6e3538ce0b85fcc9b481cf6bffb695a5724426d4'
head=subprocess.check_output(['git','rev-parse','HEAD']).decode().strip()
subprocess.run(['git','merge-base','--is-ancestor',baseline,head],check=True)
bundle=Path('repeat-completed.bundle')
assert not bundle.exists(),'Never overwrite a prior bundle'
subprocess.run(['git','bundle','create',str(bundle),baseline+'..HEAD'],check=True)
v=subprocess.run(['git','bundle','verify',str(bundle)],capture_output=True,text=True,check=True)
Path('closure/bundle-verify.log').write_text(v.stdout+v.stderr)
files=[p for p in O.iterdir() if p.is_file()]+[bundle,Path('close_repeat.py'),Path('retain_repeat.py'),Path('report_repeat.py'),Path('publish_repeat_closure.py'),Path('closure/bundle-verify.log')]
manifest=dict(time=datetime.datetime.now(datetime.timezone.utc).isoformat(),local_only_commit=head,bundle_prerequisite=baseline,report='repeat-results-20261020/REPORT.md',remote_root=R,files={p.name:dict(bytes=p.stat().st_size,sha256=hashlib.file_digest(p.open('rb'),'sha256').hexdigest()) for p in files})
for p in files:
 with p.open('rb') as f:subprocess.run(['ssh','omarchy-jean','cat > '+shlex.quote(R+'/'+p.name)],stdin=f,check=True)
code='''import hashlib,json,pathlib,tarfile,shutil
R=pathlib.Path(%r);expected=%r;file_count=len(expected)
for name,meta in expected.items():
 p=R/name;assert p.stat().st_size==meta['bytes'];assert hashlib.file_digest(p.open('rb'),'sha256').hexdigest()==meta['sha256']
for arc,manifest in [('actual-evidence.tar.gz','raw-manifest.json'),('setup-and-review-evidence.tar.gz','setup-manifest.json'),('all-volumes.tar.gz','volume-content-manifest.json')]:
 data=json.loads((R/manifest).read_text());expected=data['files'] if isinstance(data,dict) else data;actual=[]
 with tarfile.open(R/arc,'r:gz') as t:
  for m in t:
   if m.isfile():actual.append(dict(path=m.name,bytes=m.size,sha256=hashlib.file_digest(t.extractfile(m),'sha256').hexdigest()))
 assert actual==expected
print(json.dumps(dict(all_file_hashes_verified=True,files=file_count,all_raw_setup_volume_members_verified=True,free_bytes=shutil.disk_usage(R).free)))
'''%(R,manifest['files'])
verified=json.loads(subprocess.check_output(['ssh','omarchy-jean','python3 -c '+shlex.quote(code)]))
manifest['independent_remote_readback']=verified
p=Path('closure-manifest.json');p.write_text(json.dumps(manifest,indent=2)+'\n')
with p.open('rb') as f:subprocess.run(['ssh','omarchy-jean','cat > '+shlex.quote(R+'/'+p.name)],stdin=f,check=True)
remote=subprocess.check_output(['ssh','omarchy-jean','sha256sum '+shlex.quote(R+'/'+p.name)]).decode().split()[0]
assert remote==hashlib.file_digest(p.open('rb'),'sha256').hexdigest()
print(json.dumps(dict(commit=head,bundle=manifest['files'][bundle.name],manifest_sha256=remote,durable=R,verified=verified),indent=2))
