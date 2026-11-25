"""Read-only verification of the retained ordinary-registration-race checkpoint.

Usage: python verify_ordinary_registration_race.py [evidence-directory]
Does not rebuild, contact a host, generate JSON, or modify retained evidence.
"""
import hashlib
import io
import json
from pathlib import Path
import subprocess
import sys
import tarfile

EVIDENCE = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).resolve().parent
REPOSITORY = Path(__file__).resolve().parents[4]
PREFIX = "ordinary-registration-race-20261020"


def member(archive: tarfile.TarFile, name: str):
    stream = archive.extractfile(name)
    assert stream is not None, name
    return stream


def sha(data):
    return hashlib.sha256(data).hexdigest()


receipt = json.loads((EVIDENCE / (PREFIX + "-archive.json")).read_text())
archive = EVIDENCE / (PREFIX + "-raw.tar.gz")
assert sha(archive.read_bytes()) == receipt["archive_sha256"]
assert archive.stat().st_size == receipt["bytes"]
with tarfile.open(archive) as bundle:
    names = bundle.getnames()
    assert len(names) == len(set(names)) == receipt["file_members"]
    inventory = json.load(member(bundle, "archive-members.json"))
    assert set(names) == set(inventory) | {"archive-members.json"}
    for name, pin in inventory.items():
        data = member(bundle, name).read()
        assert len(data) == pin["bytes"] and sha(data) == pin["sha256"], name
    qualification = json.load(member(bundle, "qualification.json"))
    assert qualification["complete"]
    assert sha(member(bundle, "qualification.json").read()) == receipt["qualification_sha256"]
    objects = json.load(member(bundle, "source-objects.json"))
    for name, pin in objects.items():
        data = member(bundle, pin["member"]).read()
        assert sha(data) == pin["sha256"] and len(data) == pin["bytes"], name
    manifest = json.load(member(bundle, "registration-green2-source-inputs.json"))
    checked = 0
    for name, expected in manifest.items():
        if name.startswith("source/"):
            assert sha((REPOSITORY / name.removeprefix("source/")).read_bytes()) == expected, name
            checked += 1
    for mode in ["red", "green"]:
        gates = qualification[mode + "_gates"]
        assert gates["complete"] and gates["source_unchanged"]
        assert all(g["accepted"] and g["waited_by_original_parent"] for g in gates["gates"])
    red_root = "registration-red1-running-raw/running-absent-owner/"
    red_events = member(bundle, red_root + "events").read().decode().splitlines()
    assert red_events.count("ordinary-reader-entered") == 2
    assert red_root + "race/shared-queued" in names
    assert red_root + "race/suppressed" not in names
    for case in ["running-absent-owner", "running-absent-ack-loss", "running-absent-drop"]:
        root = "registration-green2-running-raw/" + case + "/"
        events = member(bundle, root + "events").read().decode().splitlines()
        assert events.count("ordinary-reader-entered") == events.count("ordinary-reader-retired") == 1
        assert root + "race/suppressed" in names and root + "race/shared-queued" not in names
    native_count = child_count = 0
    for gate, pin in qualification["native"].items():
        raw = json.load(member(bundle, "registration-green2-" + gate + "-raw/receipt.json"))
        assert raw["complete"] and raw["children"]
        assert all(c["waited_by_parent"] for c in raw["children"])
        assert len({(c["parent_pid"], c["pid"]) for c in raw["children"]}) == len(raw["children"])
        assert raw["binary_sha256"] == qualification["green_gates"]["fixture_binary_sha256"]
        assert len(raw["cases"]) == pin["cases"] and len(raw["children"]) == pin["original_child_waits"]
        native_count += len(raw["cases"])
        child_count += len(raw["children"])
    assert native_count == qualification["native_case_total"]
    assert child_count == qualification["native_original_wait_total"]
    for item in qualification["attempt_retirement"]:
        raw = json.load(member(bundle, item["receipt"]))
        assert all(c["waited_by_parent"] for c in raw["children"])
        assert len(raw["children"]) == item["original_child_waits"]
    with tarfile.open(fileobj=io.BytesIO(member(bundle, "registration-red-inputs.tar").read())) as red:
        inputs = json.load(member(red, "inputs.json"))
        assert inputs["candidate_commit"] == qualification["base_commit"]
        for path, pins in inputs["files"].items():
            key = path.replace("/", "-")
            parent = subprocess.check_output(["git", "-C", str(REPOSITORY), "show", inputs["candidate_commit"] + ":" + path])
            assert parent == member(red, key + ".candidate").read()
            for label, expected in pins.items():
                assert sha(member(red, key + "." + label).read()) == expected
            assert pins["red"] == objects["red/source/" + path]["sha256"]
print(json.dumps(dict(verified=True, archive_sha256=receipt["archive_sha256"],
                     members_verified=len(names), local_source_inputs_verified=checked,
                     native_cases=native_count, original_native_child_waits=child_count,
                     independent_review=qualification["independent_review"]), indent=2))
