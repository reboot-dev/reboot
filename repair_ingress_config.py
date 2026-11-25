"""Narrow repair of invalid authorized_keys permitlisten; no new listeners."""
from pathlib import Path
import subprocess as sp
import time
p=Path('/root/.ssh/authorized_keys')
old=p.read_text()
lines=old.splitlines()
matched=[l for l in lines if l.endswith(' tiny-repeat-ingress-20261020')]
assert len(matched)==1 and 'permitlisten="none",' in matched[0]
backup=p.with_name('authorized_keys.pre-ingress-repair-20261020')
assert not backup.exists()
backup.write_text(old);backup.chmod(0o600)
# PermitListen is an sshd_config directive, not an authorized_keys port value.
f=Path('/etc/ssh/sshd_config.d/00-tiny-repeat-no-reverse.conf')
assert not f.exists()
f.write_text('Match User root Address 2.29.27.53\n    PermitListen none\nMatch all\n')
sp.run(['/usr/sbin/sshd','-t'],check=True)
effective=sp.check_output(['/usr/sbin/sshd','-T','-C','user=root,addr=2.29.27.53,host=2.29.27.53'],text=True)
assert 'permitlisten none\n' in effective
new=old.replace(matched[0],matched[0].replace('permitlisten="none",',''))
tmp=p.with_name('authorized_keys.new');tmp.write_text(new);tmp.chmod(0o600);tmp.replace(p)
sp.run(['systemctl','reload','ssh'],check=True)
print('removed invalid key port specification; effective PermitListen none; app-only permitopen retained',flush=True)
