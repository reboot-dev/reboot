"""Prepare retained source-only negative controls; never edit accepted source."""
import difflib,hashlib,json,shutil,sys
from pathlib import Path
root,out=map(lambda p:Path(p).resolve(),sys.argv[1:3])
out.mkdir(parents=True,exist_ok=False)
source=root/'reboot/rust/src/codegen.rs';before=source.read_text()
start=before.index('    let task_guard = if !flow.factory && !flow.declared_error {',before.index('fn emit_exclusive_transaction_method'))
end=before.index('    // Transaction metadata selects',start)
old='if let Some(idempotency) = &automatic_idempotency {{ let replay_after_admission'
assert before.count(old)==1
changes={
 'old-admission-fence':before[:start]+'    let task_guard = transaction_task_schedule_guard(flow.runtime_module);\n'+before[end:],
 'skip-target-receipt-replay':before.replace(old,'if let Some(idempotency) = &automatic_idempotency.as_ref().filter(|_| false) {{ let replay_after_admission'),
}
receipt={}
for name,after in changes.items():
 tree=out/name
 shutil.copytree(root,tree,symlinks=True,ignore=shutil.ignore_patterns('target','.git','__pycache__'))
 target=tree/'reboot/rust/src/codegen.rs';target.write_text(after)
 retained=out/(name+'-mutation');retained.mkdir()
 (retained/'original.rs').write_text(before);(retained/'modified.rs').write_text(after)
 (retained/'mutation.diff').write_text(''.join(difflib.unified_diff(before.splitlines(True),after.splitlines(True),fromfile='original.rs',tofile='modified.rs')))
 receipt[name]=dict(original_sha256=hashlib.sha256(before.encode()).hexdigest(),modified_sha256=hashlib.sha256(after.encode()).hexdigest(),tree=str(tree),changed_files=['reboot/rust/src/codegen.rs'])
 for rel in [p.relative_to(root) for p in (root/'reboot/rust').rglob('*') if p.is_file() and p.suffix in ['.rs','.proto','.py','.lock','.toml'] and 'target' not in p.parts]:
  if str(rel)!='reboot/rust/src/codegen.rs':assert (root/rel).read_bytes()==(tree/rel).read_bytes()
(out/'mutations.json').write_text(json.dumps(receipt,indent=2))
print(json.dumps(receipt))
