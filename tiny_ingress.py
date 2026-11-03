"""Scoped app-only ingress correction for Docker internal bridge publishing."""
import subprocess as s,json,threading,time,pathlib
E=pathlib.Path(__file__).resolve().parent/'tiny-runtime-results'
p=s.Popen(['ssh','root@2.31.73.10','docker events --filter type=container --filter event=start --filter label=owner=tiny-20261020 --format \'{{json .}}\''],stdout=s.PIPE,text=True)
receipts=[]
def consume():
 for line in p.stdout:
  ev=json.loads(line);a=ev['Actor'];name=a['Attributes'].get('name','')
  if not name.endswith('-app') or not name.startswith('tiny-'):continue
  cid=a['ID'];i=json.loads(s.check_output(['ssh','root@2.31.73.10','docker inspect '+cid],text=True))[0]
  assert i['Config']['Labels']['owner']=='tiny-20261020'
  if 'tiny-app-ingress' in i['NetworkSettings']['Networks']:continue
  q=s.run(['ssh','root@2.31.73.10','docker network connect tiny-app-ingress '+cid],capture_output=True,text=True)
  receipts.append({'id':cid,'name':name,'exit':q.returncode,'stdout':q.stdout,'stderr':q.stderr,'time':time.time()})
  (E/'ingress-correction.json').write_text(json.dumps(receipts,indent=2))
t=threading.Thread(target=consume);t.start()
while True:
 time.sleep(1)
 try:
  d=json.loads((E/'owner.json').read_text())
  if 'end' in d:break
 except (ValueError,OSError):pass
p.terminate();p.wait(timeout=15);t.join(timeout=15)
(E/'ingress-owner.json').write_text(json.dumps({'pid':p.pid,'exit':p.returncode,'thread_joined':not t.is_alive(),'connections':receipts},indent=2))
