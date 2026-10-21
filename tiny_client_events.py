import pathlib,json,subprocess as s,time
E=pathlib.Path(__file__).resolve().parent/'tiny-runtime-results'
d=json.loads((E/'owner.json').read_text());cid=d['external_client_id']
f=(E/'client-exec-events.jsonl').open('w')
p=s.Popen(['ssh','root@2.29.27.53',"docker events --filter container="+cid+" --filter event=exec_start --filter event=exec_die --format '{{json .}}'"],stdout=f,stderr=s.PIPE,text=True)
while True:
 time.sleep(1)
 try:
  if 'end' in json.loads((E/'owner.json').read_text()):break
 except (ValueError,OSError):pass
p.terminate();_,err=p.communicate(timeout=20);f.close()
(E/'client-event-owner.json').write_text(json.dumps({'pid':p.pid,'exit':p.returncode,'stderr':err}))
