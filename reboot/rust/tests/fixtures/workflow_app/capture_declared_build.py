"""Capture exact emitted inputs and executable for one original Cargo build."""
import hashlib,json,shutil,sys
from pathlib import Path
log,binary,output=map(Path,sys.argv[1:]);output.mkdir(exist_ok=False);objects=output/'objects';objects.mkdir();names={}
def retain(name,path):
 data=path.read_bytes();h=hashlib.sha256(data).hexdigest();target=objects/h
 if not target.exists():target.write_bytes(data)
 names[name]=dict(sha256=h,bytes=len(data),executable=path.stat().st_mode&0o111!=0)
for line in log.read_text().splitlines():
 try:row=json.loads(line)
 except json.JSONDecodeError:continue
 if row.get('reason')=='build-script-executed':
  root=Path(row['out_dir'])
  for p in root.rglob('*.rs'):retain(row['package_id']+'/'+str(p.relative_to(root)),p)
retain('application',binary)
assert any('workflow.reboot.rs' in name for name in names),names
(output/'inputs.json').write_text(json.dumps(names,indent=2));shutil.copy2(binary,output/'app');print(json.dumps(dict(names=len(names),binary=names['application'])))
