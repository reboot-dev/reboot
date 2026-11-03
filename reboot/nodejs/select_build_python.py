"""Select a Python 3.10 development runtime for the Bazel Node addon.

Keep a compatible runner Python when available: tests historically depend on
that exact installation. Otherwise use the explicitly supplied Bazel runtime,
never an arbitrary newer Python from PATH.
"""

import os
import pathlib
import shutil
import subprocess
import sys


_PROBE = """
import json, os, pathlib, sys, sysconfig
config = pathlib.Path(sysconfig.get_path('scripts', scheme='posix_prefix')) / 'python3.10-config'
header = pathlib.Path(sysconfig.get_path('include')) / 'Python.h'
print(json.dumps({'version': list(sys.version_info[:2]),
                  'executable': os.path.realpath(sys.executable),
                  'config': str(config), 'header': str(header)}))
"""


def probe(python):
    import json

    result = subprocess.run(
        [python, '-c', _PROBE], check=True, text=True, capture_output=True)
    return json.loads(result.stdout)


def select(fallback):
    ambient = shutil.which('python3')
    selected = None
    if ambient:
        try:
            candidate = probe(ambient)
            if candidate['version'] == [3, 10]:
                selected = candidate
        except (OSError, ValueError, subprocess.CalledProcessError):
            pass
    if selected is None:
        selected = probe(fallback)
    if selected['version'] != [3, 10]:
        raise ValueError('Node addon requires Python 3.10; incompatible build runtime')
    if not pathlib.Path(selected['header']).is_file():
        raise ValueError('Python 3.10 development header missing: ' + selected['header'])
    config = selected['config']
    if not os.access(config, os.X_OK):
        raise ValueError('Python 3.10 development config missing or not executable: ' + config)
    # Fail before npm with a useful error, not a later gyp shell failure.
    subprocess.run([config, '--cflags', '--ldflags', '--embed'],
                   check=True, capture_output=True)
    return selected['executable']


if __name__ == '__main__':
    try:
        print(select(sys.argv[1]))
    except (OSError, ValueError, subprocess.CalledProcessError) as error:
        sys.exit('Cannot build Reboot Node addon: ' + str(error))
