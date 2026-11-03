import pathlib,subprocess as s,json
E=pathlib.Path(__file__).resolve().parent/'tiny-runtime-results'
cid=json.loads((E/'owner.json').read_text())['external_client_id']
i=json.loads(s.check_output(['ssh','root@2.29.27.53','docker inspect '+cid],text=True))[0];assert i['State']['Running']
p=s.Popen(['ssh','root@2.29.27.53','docker wait '+cid],stdout=s.PIPE,stderr=s.PIPE,text=True)
o,err=p.communicate();i=json.loads(s.check_output(['ssh','root@2.29.27.53','docker inspect '+cid],text=True))[0]
r={'id':cid,'wait_pid':p.pid,'exit':p.returncode,'output':o,'stderr':err,'terminal':i};(E/'external-client-custody.json').write_text(json.dumps(r,indent=2))
assert p.returncode==0 and int(o.strip())==i['State']['ExitCode'] and not i['State']['Running'] and i['State']['Pid']==0
