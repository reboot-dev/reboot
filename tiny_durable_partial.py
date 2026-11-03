import pathlib,json,subprocess as s,shlex,hashlib,tarfile,time
R=pathlib.Path(__file__).resolve().parent;O=R/'reboot/rust/tests/fixtures/reboot_examples/hello-constructors/image/tiny-results';D='/home/ladin/.cache/hermes-reboot-parity/tiny-20261020'
def ssh(h,code):return s.check_output(['ssh',h,shlex.join(['python3','-c',code])],text=True)
# Record current image inspect and source-side stopped volume contents before deletion.
ids=['sha256:3dcf9d9976f76a63b3a290ef6cf15329f1f6148692c72604e5dc797a237f7db4','sha256:28241a509e8dbedda24bd2033ce556cc5648ddd02ef80bd349e417586fb84925','sha256:1a73705b0771f9c861d9ba96509806849423a3d8bbff140b1261da76280460cd']
images=json.loads(s.check_output(['ssh','root@2.31.73.10','docker image inspect '+' '.join(ids)],text=True));(O/'image-readback.json').write_text(json.dumps(images,indent=2))
code="import pathlib,hashlib,json;root=pathlib.Path('/var/lib/docker/volumes');names="+repr([v['Name'] for v in json.loads((R/'tiny-recovery-results/recovery.json').read_text())['volumes']])+";print(json.dumps({str(p.relative_to(root)):hashlib.sha256(p.read_bytes()).hexdigest() for n in names for p in (root/n).rglob('*') if p.is_file()}))"
manifest=json.loads(ssh('root@2.31.73.10',code));(O/'volume-content-manifest.json').write_text(json.dumps(manifest,indent=2))
# Small result upload, no image staging on the controller.
p=s.Popen(['tar','-C',str(O),'-czf','-','.'],stdout=s.PIPE)
r=s.run(['ssh','omarchy-jean','mkdir -p '+D+'/partial-results; tar -C '+D+'/partial-results -xzf -'],stdin=p.stdout);p.stdout.close();assert p.wait()==r.returncode==0
code="""import pathlib,tarfile,json,hashlib
D=pathlib.Path("""+repr(D)+""")
checks={}
for key,name,expected in [('images','images.docker-save.tar.gz','f444904864b2c2bc0ca658ff4ffa4df40ad4de7838f2aee1827fb9f16b2b0349'),('build-proof','build-proof.tar.gz','28f9449617acecb2f304f664372ff53a21de759ac5d10e95db73e38b53691e66')]:
 p=D/name;actual=hashlib.sha256(p.read_bytes()).hexdigest();assert actual==expected
 checks[key]={'verified':True,'sha256':actual,'bytes':p.stat().st_size}
t=tarfile.open(D/'images.docker-save.tar.gz');index=json.load(t.extractfile('index.json'));assert {m['digest'] for m in index['manifests']}==set("""+repr(ids)+""")
for m in t.getmembers():
 if m.isfile() and m.name.startswith('blobs/sha256/'):
  assert hashlib.sha256(t.extractfile(m).read()).hexdigest()==m.name.split('/')[-1]
checks['images']['all_oci_blobs_verified']=True
v=tarfile.open(D/'interrupted-volumes.tar.gz');manifest=json.loads((D/'partial-results/volume-content-manifest.json').read_text());actual={m.name:hashlib.sha256(v.extractfile(m).read()).hexdigest() for m in v.getmembers() if m.isfile()};assert actual==manifest
checks['volumes']={'verified':True,'files':len(actual),'sha256':hashlib.sha256((D/'interrupted-volumes.tar.gz').read_bytes()).hexdigest()}
p=D/'partial-results/raw-evidence.tar.gz';t=tarfile.open(p);manifest=json.loads((D/'partial-results/raw-manifest.json').read_text())
for name,row in manifest.items():assert hashlib.sha256(t.extractfile(name).read()).hexdigest()==row['sha256']
checks['runtime-evidence']={'verified':True,'members':len(manifest),'sha256':hashlib.sha256(p.read_bytes()).hexdigest()}
print(json.dumps({'verified':True,'checks':checks},indent=2))
"""
proof=json.loads(ssh('omarchy-jean',code));proof['observed_at']=time.time();(R/'durable-verification.json').write_text(json.dumps(proof,indent=2));(O/'durable-verification.json').write_text(json.dumps(proof,indent=2));print(json.dumps(proof,indent=2))
