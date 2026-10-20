"""One authorized CPX02; fresh 21% VAT+IPv4 cap; exact-ID guards and Jean cron."""
import datetime
from decimal import Decimal
import json
import os
from pathlib import Path
import stat
import sys
import urllib.error
import urllib.request

ROOT=Path(__file__).resolve().parent
IDENTITY=ROOT/'repeat-identity.json'
SECRET=Path('/home/openclaw/.hermes/profiles/jean/secrets/hetzner-ci.env')


def api(path,method='GET',data=None):
    assert stat.S_IMODE(SECRET.stat().st_mode)==0o600
    vals=dict(l.strip().split('=',1) for l in SECRET.read_text().splitlines() if '=' in l and not l.startswith('#'))
    token=next(v.strip('\"\'') for k,v in vals.items() if 'TOKEN' in k)
    q=urllib.request.Request('https://api.hetzner.cloud/v1/'+path,method=method,
        data=json.dumps(data).encode() if data is not None else None,
        headers={'Authorization':'Bearer '+token,'Content-Type':'application/json'})
    try:
        with urllib.request.urlopen(q,timeout=40) as r:
            body=r.read();status=r.status
    except urllib.error.HTTPError as error:
        status=error.code;body=error.read()
    result=json.loads(body) if body else {}
    with (ROOT/'repeat-provider-attempts.jsonl').open('a') as f:
        f.write(json.dumps(dict(time=datetime.datetime.now(datetime.timezone.utc).isoformat(),path=path,method=method,status=status,data=result))+'\n')
        f.flush();os.fsync(f.fileno())
    if status not in [200,201,202,204,404]:raise RuntimeError((status,result))
    return status,result


def create():
    from tiny_repeat_control import atomic
    assert not IDENTITY.exists() and not (ROOT/'repeat-created.json').exists()
    _,data=api('server_types?name=cpx02');types=data['server_types']
    assert len(types)==1 and types[0]['name']=='cpx02'
    t=types[0]
    assert t['cores']==1 and t['memory']==1 and any(l['name']=='fsn1' and l['available'] for l in t['locations'])
    p=next(p for p in t['prices'] if p['location']=='fsn1')
    _,pr=api('pricing');v4=next(p for p in pr['pricing']['primary_ips'] if p['type']=='ipv4')
    ipprice=next(p for p in v4['prices'] if p['location']=='fsn1')
    gross=(Decimal(p['price_hourly']['net'])+Decimal(ipprice['price_hourly']['net']))*Decimal('1.21')*24
    assert gross<=Decimal('.31')
    _,servers=api('servers')
    assert not any(s['labels'].get('run')=='tiny-repeat-20261020' for s in servers['servers'])
    _,keys=api('ssh_keys');key=next(k for k in keys['ssh_keys'] if k['id']==131472941)
    assert Path('/home/openclaw/.ssh/id_ed25519.pub').read_text().split()[:2]==key['public_key'].split()[:2]
    now=datetime.datetime.now(datetime.timezone.utc);expiry=now+datetime.timedelta(hours=23,minutes=55)
    labels={'owner':'jean','purpose':'reboot-tiny-repeat','ephemeral':'true','run':'tiny-repeat-20261020',
            'expires':expiry.strftime('%Y-%m-%d'),'expiry-unix':str(int(expiry.timestamp()))}
    atomic(ROOT/'repeat-price.json',dict(observed_at=now.isoformat(),gross_24h_eur=str(gross),VAT='21%',type=t,ipv4=ipprice))
    print('Fresh CPX02 fsn1 available, 24h gross incl IPv4+21% VAT EUR '+str(gross),flush=True)
    _,r=api('servers','POST',{'name':'jean-reboot-tiny-repeat-20261020','server_type':'cpx02','location':'fsn1',
        'image':'ubuntu-24.04','ssh_keys':[key['id']],'labels':labels,'start_after_create':True,'automount':False,
        'public_net':{'enable_ipv4':True,'enable_ipv6':False},
        'user_data':'#cloud-config\nssh_pwauth: false\ndisable_root: false\n'})
    atomic(ROOT/'repeat-created.json',dict(response=r,expiry=expiry.isoformat(),gross_24h_eur=str(gross)))
    sid=r['server']['id'];assert sid!=171335411
    _,readback=api('servers/'+str(sid));s=readback['server'];pid=s['public_net']['ipv4']['id'];assert pid!=156588567
    identity=dict(server_id=sid,primary_ip_id=pid,ip=s['public_net']['ipv4']['ip'],expiry=expiry.isoformat(),
                  labels=labels,server=s,gross_24h_eur=str(gross))
    atomic(IDENTITY,identity)
    api('primary_ips/'+str(pid),'PUT',{'labels':labels,'auto_delete':True})
    _,ipr=api('primary_ips/'+str(pid));identity['primary_ip']=ipr['primary_ip']
    assert identity['primary_ip']['labels']==labels and identity['primary_ip']['assignee_id']==sid
    assert s['labels']==labels and s['server_type']['name']=='cpx02' and s['location']['name']=='fsn1'
    atomic(IDENTITY,identity)
    os.environ['HERMES_HOME']='/home/openclaw/.hermes/profiles/jean'
    sys.path.insert(0,'/home/openclaw/.hermes/profiles/jean/hermes-agent')
    from cron.jobs import create_job,get_job
    prompt=f'''Authorized exact-ID expiry cleanup of repeat CPX02. At {expiry.isoformat()}, run python3 {ROOT}/tiny_repeat_provider.py delete using recorded {IDENTITY}. Scope ONLY new server {sid} and Primary IPv4 {pid} with exact recorded ownership labels, cpx02 fsn1 IP {identity['ip']}. Script GET-verifies identity before DELETE and confirms both API404. NEVER touch old deleted server171335411/IP156588567, existing CCX43 171072439, unknown resources, or change retention. Preserve cleanup receipt. On guard mismatch stop and notify Vlad. Load ephemeral-cloud-benchmarking and scheduled-agent-job-operations. No extension. Work should already have been durably archived; expiry is a hard maximum, not permission to postpone deletion.'''
    deletion=create_job(prompt=prompt,schedule=expiry.isoformat(),name=f'Delete repeat CPX02 exact {sid}',repeat=1,deliver='local',model='gpt-6.1-sol',provider='openai-codex')
    atomic(ROOT/'repeat-deletion-job.json',get_job(deletion['id']))
    reminder=create_job(prompt=f'Repeat CPX02 exact server{sid}/IP{pid} expires at {expiry.isoformat()} in30minutes. Read {IDENTITY}. Check owner and durable backup; preserve results and stop before expiry. No extension. Do not touch CCX43 retention. If exact server404, no action.',schedule=(expiry-datetime.timedelta(minutes=30)).isoformat(),name=f'Repeat CPX02 expiry reminder {sid}',repeat=1,deliver='local',model='gpt-6.1-sol',provider='openai-codex')
    identity['jobs']=[get_job(deletion['id']),get_job(reminder['id'])]
    assert all(j['enabled'] and j['state']=='scheduled' for j in identity['jobs'])
    atomic(IDENTITY,identity)
    print(json.dumps({k:identity[k] for k in ['server_id','primary_ip_id','ip','expiry','gross_24h_eur']}))
    print('guarded cron readback',deletion['id'],reminder['id'])


def delete():
    from tiny_repeat_control import atomic
    d=json.loads(IDENTITY.read_text());sid=d['server_id'];pid=d['primary_ip_id']
    assert sid not in [171335411,171072439] and pid!=156588567
    assert d['labels']['run']=='tiny-repeat-20261020'
    status,data=api('servers/'+str(sid))
    if status!=404:
        s=data['server'];assert s['id']==sid and s['labels']==d['labels'] and s['server_type']['name']=='cpx02' and s['location']['name']=='fsn1'
        assert s['public_net']['ipv4']['id']==pid and s['public_net']['ipv4']['ip']==d['ip']
        status,ip=api('primary_ips/'+str(pid));assert status==200 and ip['primary_ip']['labels']==d['labels'] and ip['primary_ip']['assignee_id']==sid
        api('servers/'+str(sid),'DELETE')
        import time
        for _ in range(120):
            status,_=api('servers/'+str(sid))
            if status==404:break
            time.sleep(2)
        assert status==404
    status,data=api('primary_ips/'+str(pid))
    if status!=404:
        i=data['primary_ip'];assert i['id']==pid and i['ip']==d['ip'] and i['labels']==d['labels'] and i['assignee_id'] is None
        api('primary_ips/'+str(pid),'DELETE')
    assert api('servers/'+str(sid))[0]==404 and api('primary_ips/'+str(pid))[0]==404
    atomic(ROOT/'repeat-cleanup.json',dict(server_id=sid,primary_ip_id=pid,both_api404=True,time=datetime.datetime.now(datetime.timezone.utc).isoformat()))
    print('Verified both exact resources API404',sid,pid)


if __name__=='__main__':
    if sys.argv[1]=='create':create()
    elif sys.argv[1]=='delete':delete()
    else:raise ValueError('create or delete required')
