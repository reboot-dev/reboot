"""Test-only pause of the original generated public constructor stub.
Application and generated source bytes remain unchanged. All persistence remains
in the supported Python runtime's real native Database.
"""
import sys
from pathlib import Path
root=Path('/opt/rbt.runfiles')
if root.exists():
 sys.path[:0]=[str(root/'com_github_reboot_dev_reboot'),str(root/'com_google_protobuf'),str(root/'googleapis'),str(root/'buf_deps_envoy'),'/example/hello-constructors/backend/api']+[str(p) for p in root.glob('rbt_pypi_*/site-packages')]
 import asyncio
 from hello_constructors.v1.hello_rbt import Hello
 original=Hello.create
 async def create(*args,**kwargs):
  result=await original(*args,**kwargs)
  marker=Path('/proof/after-create')
  if not marker.exists():
   marker.write_text('actual original generated Hello.create returned after native durable ACK')
   print('ORIGINAL_PYTHON_CREATE_ACK_PARKED',flush=True)
   await asyncio.Future()
  return result
 Hello.create=staticmethod(create)
