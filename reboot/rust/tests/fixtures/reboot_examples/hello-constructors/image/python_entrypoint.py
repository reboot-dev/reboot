#!/opt/rbt.runfiles/python3_10_12_x86_64-unknown-linux-gnu/bin/python3
import os,secrets
from pathlib import Path
p=Path('/state/crypto-root-keys')
if not p.exists():
    fd=os.open(p,os.O_CREAT|os.O_EXCL|os.O_WRONLY,0o600)
    with os.fdopen(fd,'w') as f: f.write('v1:'+secrets.token_hex(32))
os.environ['REBOOT_CRYPTO_ROOT_KEYS']=p.read_text()
os.execv('/opt/rbt',['/opt/rbt','serve','run','--python','--application=backend/src/main.py','--application-name=hello-python','--state-directory=/state','--servers=1','--port=9991','--tls=external'])
