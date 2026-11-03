#!/usr/bin/env python3
"""Parent-invoked exact native test launcher, never a native child manager.
Run under the parent's real task-owned private namespace/custodian. No port/PID
lookup, native spawning, generic kills, timeouts masquerading as completion.
"""
import argparse
import json
import os
from pathlib import Path
import re
import subprocess
import sys
from urllib.parse import urlparse

HERE = Path(__file__).resolve().parent

def require_environment(environ):
    if environ.get("REBOOT_CONSTRUCTOR_NATIVE_AUTHORITY") != "parent-owned-private-pristine-single-shard":
        raise ValueError("real parent-owned private pristine single-shard native authority required")
    endpoint = environ.get("REBOOT_CONSTRUCTOR_NATIVE_DATABASE_ENDPOINT", "")
    parsed = urlparse(endpoint)
    if parsed.scheme != "http" or parsed.hostname != "127.0.0.1" or not parsed.port or parsed.path not in ("", "/") or parsed.query or parsed.fragment or parsed.username or parsed.password:
        raise ValueError("explicit task-owned loopback canonical Database endpoint required")
    if not re.fullmatch(r"[A-Za-z0-9-]+", environ.get("REBOOT_CONSTRUCTOR_NATIVE_RUN", "")):
        raise ValueError("nonempty source/native/process correlation run identifier required")
    injections = [key for key in environ if key.startswith("REBOOT_TEST_")]
    if injections:
        raise ValueError("production test hook injection forbidden: " + ", ".join(injections))

def verify_inventory(output, expected):
    actual = [line.removesuffix(": test") for line in output.splitlines() if line.endswith(": test")]
    if len(actual) != len(set(actual)) or sorted(actual) != sorted(expected):
        raise ValueError(f"compiled exact test inventory mismatch (including zero-match): expected {expected!r}; actual {actual!r}")

def verify_one_result(output):
    if not re.search(r"test result: ok\. 1 passed; 0 failed; 0 ignored;", output):
        raise ValueError("exact test must execute once; a zero-match, ignored or filtered result is not acceptance")

def main(argv=None):
    inventory = json.loads((HERE / "test-inventory.json").read_text())
    expected = inventory["tests"]
    if inventory["count"] != len(expected) or len(set(expected)) != len(expected):
        raise ValueError("source inventory count/dedup mismatch")
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--inventory", action="store_true", help="print SOURCE inventory only, without Cargo/native calls")
    parser.add_argument("--test", choices=expected, help="one exact test; one test process; parent owns native lifecycle")
    args = parser.parse_args(argv)
    if args.inventory:
        print(json.dumps(inventory, indent=2))
        return 0
    if not args.test:
        parser.error("--test is required; broad all-tests native execution is deliberately unavailable")
    require_environment(os.environ)  # Reject missing environment BEFORE any compiler/subprocess.
    command = ["cargo", "test", "--locked", "--offline", "--manifest-path", str(HERE / "Cargo.toml"), "--lib"]
    listing = subprocess.run(command + ["--", "--list"], text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    print(listing.stdout, end="", flush=True)
    if listing.returncode:
        return listing.returncode
    verify_inventory(listing.stdout, expected)
    result = subprocess.run(command + [args.test, "--", "--ignored", "--exact", "--nocapture", "--test-threads=1"], text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    print(result.stdout, end="", flush=True)
    if result.returncode:
        return result.returncode
    verify_one_result(result.stdout)
    print("EXACT_NATIVE_TEST_EXECUTED_ONCE; parent must independently retain source/native/process evidence")
    return 0

if __name__ == "__main__":
    try:
        sys.exit(main())
    except ValueError as error:
        sys.exit(str(error))
