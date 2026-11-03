"""Preserve exact tiny VM evidence before its authorized deletion."""
import datetime,hashlib,json,shlex,subprocess,tarfile
from pathlib import Path
O=Path('repeat-results-20261020');R='/home/ladin/.cache/hermes-reboot-parity/tiny-repeat-20261020/completed-closure'
def cmd(host,s):return subprocess.check_output(['ssh','-o','BatchMode=yes',host,s])
def save(n,b): (O/n).write_bytes(b)
def upload(p):
 with p.open('rb') as f:subprocess.run(['ssh','omarchy-jean','cat > '+shlex.quote(R+'/'+p.name)],stdin=f,check=True)
def sha(p):return hashlib.file_digest(p.open('rb'),'sha256').hexdigest()
d=json.loads(Path('closure/results/owner.json').read_text());ids=sorted({c['id'] for r in d['stacks'] for c in r['containers']})
exact=json.loads(cmd('root@2.31.73.10','docker inspect '+' '.join(ids)))
assert {x['Id'] for x in exact}==set(ids)
assert all(not x['State']['Running'] and x['State']['Pid']==0 and not x['State']['OOMKilled'] for x in exact)
save('fresh-exact-container-readback.json',json.dumps(exact,indent=2).encode())
client=json.loads(cmd('root@2.29.27.53','docker inspect '+d['client_id']))[0];assert client['State']['Pid']==0
save('fresh-client-readback.json',json.dumps(client,indent=2).encode())
save('fresh-owner-service.txt',cmd('root@2.29.27.53','systemctl show tiny-repeat-owner-ingress-fixed-20261020.service -p MainPID -p ActiveState -p ExecMainStatus; test ! -e /proc/866962'))
vols=cmd('root@2.31.73.10','docker volume ls -q').decode().split();assert set(r['volume'] for r in d['stacks'])<=set(vols)
save('volume-inspect.json',cmd('root@2.31.73.10','docker volume inspect '+' '.join(vols)))
# Entire named volumes, including setup and fault-test state, not only benchmark state.
assert not cmd('root@2.31.73.10','docker ps -q').strip()
args=' '.join(shlex.quote(v) for v in vols)
with (O/'all-volumes.tar.gz').open('wb') as f:subprocess.run(['ssh','root@2.31.73.10','tar -C /var/lib/docker/volumes -czf - '+args],stdout=f,check=True)
manifest=[]
with tarfile.open(O/'all-volumes.tar.gz','r:gz') as t:
 for m in t:
  if m.isfile():manifest.append(dict(path=m.name,bytes=m.size,sha256=hashlib.file_digest(t.extractfile(m),'sha256').hexdigest()))
save('volume-content-manifest.json',json.dumps(dict(volumes=vols,files=manifest),indent=2).encode())
cmd('omarchy-jean','mkdir -p '+shlex.quote(R)+'; df -B1 /home/ladin')
for p in [Path('closure/actual-evidence.tar.gz'),O/'all-volumes.tar.gz',O/'volume-content-manifest.json',O/'volume-inspect.json']:upload(p)
# Reuse already durable immutable image archive, no duplicate image trees.
remote='''import hashlib,json,tarfile,pathlib,shutil
R=pathlib.Path(%r);p=pathlib.Path('/home/ladin/.cache/hermes-reboot-parity/tiny-20261020/images.docker-save.tar.gz')
blobs=[]
with tarfile.open(p,'r:gz') as t:
 index=json.load(t.extractfile('index.json'))
 for m in t:
  if m.isfile() and m.name.startswith('blobs/sha256/'):
   h=hashlib.file_digest(t.extractfile(m),'sha256').hexdigest();assert h==m.name.split('/')[-1];blobs.append(h)
 ids=sorted(x['digest'] for x in index['manifests']);assert ids==%r
vf=json.loads((R/'volume-content-manifest.json').read_text())['files'];actual=[]
with tarfile.open(R/'all-volumes.tar.gz','r:gz') as t:
 for m in t:
  if m.isfile():actual.append(dict(path=m.name,bytes=m.size,sha256=hashlib.file_digest(t.extractfile(m),'sha256').hexdigest()))
assert actual==vf
files={}
for name in ['actual-evidence.tar.gz','all-volumes.tar.gz','volume-content-manifest.json','volume-inspect.json']:
 q=R/name;files[name]=dict(sha256=hashlib.file_digest(q.open('rb'),'sha256').hexdigest(),bytes=q.stat().st_size)
print(json.dumps(dict(files=files,image_archive=dict(path=str(p),sha256=hashlib.file_digest(p.open('rb'),'sha256').hexdigest(),bytes=p.stat().st_size,all_blob_hashes_verified=len(blobs),runtime_image_ids=ids),volume_contents_verified=len(actual),free_bytes=shutil.disk_usage(R).free),indent=2))
'''%(R,sorted(d['images'].values()))
receipt=cmd('omarchy-jean','python3 -c '+shlex.quote(remote));save('durable-retention.json',receipt)
r=json.loads(receipt)
for name,v in r['files'].items():
 p=Path('closure')/name if name=='actual-evidence.tar.gz' else O/name
 assert sha(p)==v['sha256'] and p.stat().st_size==v['bytes']
upload(O/'durable-retention.json')
print(receipt.decode())
