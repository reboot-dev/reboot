"""Independent exact-target readback; never changes a Docker/provider resource."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('evidence', type=Path)
    args = parser.parse_args()
    e = args.evidence
    owner = json.loads((e/'owner.json').read_text())
    assert owner['complete'] and owner['terminal'] and owner['all_waits_joined']
    ids = sorted({c['id'] for c in owner['containers']})
    current = json.loads(subprocess.check_output(['docker','inspect',*ids],text=True))
    GiB = 1024**3
    for c in current:
        assert not c['State']['Running'] and c['State']['Pid'] == 0 and not c['State']['OOMKilled']
        config = c['HostConfig']; name = c['Name']
        assert config['PortBindings'] in ({},None)
        kind = name.rsplit('-',1)[1]
        cores, memory = {'rust':(1,GiB),'database':(3,3*GiB),'python':(4,4*GiB),'config':(1,GiB),'client':(2,GiB)}[kind]
        assert config['NanoCpus'] == cores*10**9 and config['Memory'] == memory and config['MemorySwap'] == memory
        assert config['CpusetCpus'] == ('8,10' if kind == 'client' else '0,2,4,6')
        assert c['State']['ExitCode'] == (143 if kind in ['python','client'] else 0)
        expected_image = owner['images']['python' if kind in ['python','client'] else 'rust' if kind == 'config' else kind]['Id']
        assert c['Image'] == expected_image
    assert not subprocess.check_output(['docker','ps','-q'],text=True).strip()
    volumes = sorted({mount['Name'] for c in current for mount in c['Mounts'] if mount['Type'] == 'volume'})
    volume_readbacks = json.loads(subprocess.check_output(['docker','volume','inspect',*volumes],text=True))
    assert len(volumes) == 8
    owners = {c['Config']['Labels']['owner'] for c in current}
    assert len(owners) == 1 and next(iter(owners)).startswith('hello-bench-')
    assert all(v['Labels'].get('owner') in owners for v in volume_readbacks)
    r = {'exact_targets_stopped':True,'exact_container_ids':ids,'containers':current,'owned_volumes_preserved':volume_readbacks,
         'running_container_ids':[], 'remote_owner_pid':owner['owner_pid'],'remote_owner_proc_absent':not Path('/proc/'+str(owner['owner_pid'])).exists(),
         'boot_id':Path('/proc/sys/kernel/random/boot_id').read_text().strip(),
         'timestamp':subprocess.check_output(['date','--iso-8601=seconds'],text=True).strip()}
    assert r['remote_owner_proc_absent']
    (e/'postflight-readback.json').write_text(json.dumps(r,indent=2))
    print(json.dumps({k:v for k,v in r.items() if k not in ['containers','owned_volumes_preserved','exact_container_ids']},indent=2))

if __name__ == '__main__':
    main()
