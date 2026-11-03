import json,time,sys
from pathlib import Path
S=Path('/home/benchbuild/.cache/hello-image-evidence/stack')
r=json.loads((S/'owner.json').read_text());assert not r['terminal']
next_id=max([int(p.stem.split('-')[1]) for p in S.glob('request-[0-9][0-9][0-9].json')]+[0])+1
for task in json.loads(sys.argv[1]):
 p=S/f'request-{next_id:03}.json';p.write_text(json.dumps(task));d=p.with_suffix('.done.json');deadline=time.monotonic()+140
 while not d.exists():
  if time.monotonic()>deadline:raise TimeoutError(str(p))
  time.sleep(.2)
 print(d.name,d.read_text(),flush=True);next_id+=1
