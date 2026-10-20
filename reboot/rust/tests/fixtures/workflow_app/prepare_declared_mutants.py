"""Exact-source negative controls; retain bytes before any build or native run."""
import difflib,hashlib,json,shutil,sys
from pathlib import Path
source,root=map(lambda x:Path(x).resolve(),sys.argv[1:3]);root.mkdir(exist_ok=False)
mutations={
 'old-declared-admission-fence':('reboot/rust/src/codegen.rs','if !flow.factory && !flow.writer {','if !flow.factory && !flow.writer && !flow.declared_error {'),
 'skip-aborted-result-replay':('reboot/rust/src/declared_transaction_store.rs','return Err(acknowledged_declared_transaction_status(status));','return Ok(None);'),
}
manifest={}
for name,(relative,old,new) in mutations.items():
 target=root/name;shutil.copytree(source,target,symlinks=True,ignore=shutil.ignore_patterns('target','.git','__pycache__'))
 path=target/relative;before=path.read_bytes();text=before.decode();assert text.count(old)==1,(name,text.count(old));after=text.replace(old,new).encode();path.write_bytes(after)
 (root/(name+'.original')).write_bytes(before);(root/(name+'.modified')).write_bytes(after)
 diff=''.join(difflib.unified_diff(text.splitlines(True),after.decode().splitlines(True),fromfile='original/'+relative,tofile='mutated/'+relative));(root/(name+'.diff')).write_text(diff)
 manifest[name]=dict(path=relative,original_sha256=hashlib.sha256(before).hexdigest(),modified_sha256=hashlib.sha256(after).hexdigest(),source=str(target))
(root/'mutations.json').write_text(json.dumps(manifest,indent=2));print(json.dumps(manifest))
