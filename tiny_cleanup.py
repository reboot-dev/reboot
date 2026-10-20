"""Delete only the approved exact resources after independent durable verification."""
import pathlib,json,urllib.request,urllib.error,time,datetime
R=pathlib.Path(__file__).resolve().parent;P=R.parent
proof=json.loads((R/'durable-verification.json').read_text())
assert proof['verified'] and all(proof['checks'][k]['verified'] for k in ['images','build-proof','runtime-evidence','volumes','bundle'])
ns={};exec((P/'tiny-preflight.py').read_text().split("out={'observed_at'")[0],ns);token=ns['token']
identity=json.loads((P/'tiny-identity.json').read_text());assert identity['server_id']==171335411 and identity['primary_ip_id']==156588567 and identity['ip']=='2.31.73.10'
receipt={'started':datetime.datetime.now(datetime.timezone.utc).isoformat(),'authority':{'server':171335411,'primary_ip':156588567},'requests':[]}
def req(path,method='GET'):
 q=urllib.request.Request('https://api.hetzner.cloud/v1/'+path,method=method,headers={'Authorization':'Bearer '+token})
 try:
  with urllib.request.urlopen(q,timeout=40) as r:
   body=r.read();status=r.status;data=json.loads(body) if body else None
 except urllib.error.HTTPError as e:
  status=e.code;body=e.read()
  try:data=json.loads(body)
  except ValueError:data={'body':body.decode(errors='replace')}
 receipt['requests'].append({'path':path,'method':method,'status':status,'data':data,'time':time.time()})
 # Preserve each actual request, including errors, before the next action.
 with (R/'tiny-cleanup-attempts.jsonl').open('a') as f:f.write(json.dumps(receipt['requests'][-1])+'\n')
 if status not in [200,201,202,204,404]:raise RuntimeError({'path':path,'method':method,'status':status,'data':data})
 return status,data
status,data=req('servers/171335411')
if status!=404:
 s=data['server'];assert s['id']==171335411 and s['labels']==identity['labels'] and s['server_type']['name']=='cpx02' and s['location']['name']=='fsn1' and s['public_net']['ipv4']['ip']=='2.31.73.10' and s['public_net']['ipv4']['id']==156588567
 status,ip=req('primary_ips/156588567');assert status==200 and ip['primary_ip']['labels']==identity['labels'] and ip['primary_ip']['assignee_id']==171335411
 req('servers/171335411','DELETE')
 for _ in range(120):
  status,_=req('servers/171335411')
  if status==404:break
  time.sleep(2)
 assert status==404
status,ip=req('primary_ips/156588567')
if status!=404:
 i=ip['primary_ip'];assert i['id']==156588567 and i['ip']=='2.31.73.10' and i['labels']==identity['labels'] and i['assignee_id'] in [None,171335411]
 req('primary_ips/156588567','DELETE')
 for _ in range(60):
  status,_=req('primary_ips/156588567')
  if status==404:break
  time.sleep(2)
 assert status==404
assert req('servers/171335411')[0]==404 and req('primary_ips/156588567')[0]==404
receipt['verified_both_404']=True
out=R/'reboot/rust/tests/fixtures/reboot_examples/hello-constructors/image/tiny-results/cleanup.json'
out.write_text(json.dumps(receipt,indent=2));print(json.dumps({'server':171335411,'primary_ip':156588567,'both_api_404':True,'receipt':str(out)}))
