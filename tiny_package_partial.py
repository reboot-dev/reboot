import pathlib,tarfile,hashlib,json,subprocess,shlex
R=pathlib.Path(__file__).resolve().parent;O=R/'reboot/rust/tests/fixtures/reboot_examples/hello-constructors/image/tiny-results';Q=R/'tiny-recovery-results'
files=[p for base in ['tiny-runtime-results','tiny-recovery-results','tiny-runtime-setup-failed'] for p in (R/base).glob('**/*') if p.is_file()]+list(R.glob('tiny_*.py'))+list(R.glob('tiny-*.log'))
source=O.parent
files += [source/'benchmark/client.py',source/'shared_probe.py',source/'transcript_comparison.py',source/'tiny-build-receipt.json',source/'tiny-checkpoint-20261020.json']
files=[p for p in files if p.is_file()]
manifest={str(p.relative_to(R)):{'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in files}
(O/'raw-manifest.json').write_text(json.dumps(manifest,indent=2))
with tarfile.open(O/'raw-evidence.tar.gz','w:gz') as t:
 for p in files:t.add(p,arcname=str(p.relative_to(R)))
 t.add('/home/openclaw/.hermes/profiles/jean/cache/delegation/live/deleg_57bdebfb/task-0.log',arcname='prior-worker-transcript.log')
with tarfile.open(O/'raw-evidence.tar.gz') as t:
 for name,v in manifest.items():assert hashlib.sha256(t.extractfile(name).read()).hexdigest()==v['sha256']
print(json.dumps({'archive_bytes':(O/'raw-evidence.tar.gz').stat().st_size,'archive_sha256':hashlib.sha256((O/'raw-evidence.tar.gz').read_bytes()).hexdigest(),'verified_members':len(manifest)},indent=2))
