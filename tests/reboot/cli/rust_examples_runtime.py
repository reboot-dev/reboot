"""Fail-closed executable selection for the public Rust example runners.

A digest identifies bytes only; it does not establish source or wire compatibility.
Callers must freeze these executables for the duration of the run. Validation and
hashing before launch detect changes, but are not an atomic exec/attestation API.
"""
import hashlib
import json
import os
from pathlib import Path

DEFAULT_RBT = '/tmp/reboot-rust-app-dx-loop2-venv310/bin/rbt'


def executable_identity(value, variable):
    if not isinstance(value, str) or not value or '\0' in value:
        raise ValueError(f'{variable} must name an absolute executable file')
    path = Path(value)
    if not path.is_absolute():
        raise ValueError(f'{variable} must be absolute: {value!r}')
    try:
        path = path.resolve(strict=True)
        if not path.is_file() or not os.access(path, os.X_OK):
            raise ValueError(f'{variable} is not an executable regular file: {value!r}')
        digest = hashlib.sha256()
        with path.open('rb') as source:
            for chunk in iter(lambda: source.read(1024 * 1024), b''):
                digest.update(chunk)
    except (OSError, RuntimeError) as error:
        raise ValueError(f'{variable} cannot use executable {value!r}: {error}') from error
    return {'requested_path': value, 'path': str(path), 'sha256': digest.hexdigest()}


def select_runtime(environ):
    """Require caller native selection; an explicitly invalid RBT never falls back."""
    env = dict(environ)
    native = executable_identity(env.get('RBT_RUST_DATABASE_BINARY'),
                                 'RBT_RUST_DATABASE_BINARY')
    rbt = executable_identity(env.get('RBT', DEFAULT_RBT), 'RBT')
    env['RBT_RUST_DATABASE_BINARY'] = native['path']
    env['RBT'] = rbt['path']
    provenance = {'database': native, 'rbt': rbt,
                  'compatibility': 'not established by executable hashes'}
    return Path(rbt['path']), env, provenance


def record_runtime_launch(result, evidence, env, rbt, label):
    """Persist exact selection before launch, rejecting drift from initial hashes."""
    current = {
        'database': executable_identity(env.get('RBT_RUST_DATABASE_BINARY'),
                                        'RBT_RUST_DATABASE_BINARY'),
        'rbt': executable_identity(str(rbt), 'RBT'),
    }
    for name, identity in current.items():
        expected = evidence['runtime'][name]
        if any(identity[key] != expected[key] for key in ('path', 'sha256')):
            raise ValueError(f'{name} executable changed since selection; refusing launch')
    record = {'label': label, **current}
    evidence.setdefault('runtime_launches', []).append(record)
    result.write_text(json.dumps(evidence, indent=2))
    print('RUST_EXAMPLES_RUNTIME ' + json.dumps(record, sort_keys=True), flush=True)
