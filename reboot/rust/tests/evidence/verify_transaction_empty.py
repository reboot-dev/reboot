"""Read-only verification of the additive canonical Empty consumer/native proof."""
import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys
import tarfile

archive = Path(sys.argv[1])
local = Path(__file__).resolve().parents[4]
SOURCE = "9128343ff044701d4d9461383065ee3b31cd5ea0"
OLD = "625fdf94e9028d84348a00d1401e84d06a1580a3"
PRIOR = "5428d231fee7acbeafc1b8ce0207912ec19737c4b96885e55cd016f90c2fcb2d"

def sha(raw):
    return hashlib.sha256(raw).hexdigest()

with tarfile.open(archive, "r:gz") as tar:
    members = [m for m in tar.getmembers() if m.isfile()]
    names = [m.name for m in members]
    assert len(names) == len(set(names))

    def raw(name):
        member = tar.extractfile(name)
        assert member is not None, name
        return member.read()

    def data(name):
        return json.loads(raw(name))

    hashes = data("archive-file-hashes.json")
    assert set(hashes) == set(names) - {"archive-file-hashes.json"}
    for name, digest in hashes.items():
        assert sha(raw(name)) == digest, name
    q = data("qualification2/qualification.json")
    g = data("qualification2/green-gates.json")
    owner = data("additive2.json")
    assert q["source_commit"] == SOURCE and q["old_source_commit"] == OLD
    assert q["predecessor_archive_sha256"] == PRIOR
    assert q["gates"] == g and q["owner"] == owner
    assert q["complete"] and g["complete"] and g["source_unchanged"]
    assert owner["complete"] and owner["source_unchanged"]
    assert owner["children"] == [dict(pid=g["original_parent_pid"], waited_by_owner=True, wait_returncode=0)]
    expected = {
        "old-source-consumer-red", "sdk-package-clean", "fixture-build", "all-targets",
        "sdk-clippy", "fixture-clippy", "doctests", "fixture-tests", "native-transaction",
        "parent-error", "parent-signal", "native-outbound", "native-outbound-ack",
        "native-canonical", "native-generic",
    }
    assert len(g["gates"]) == len(expected) and {x["name"] for x in g["gates"]} == expected
    for gate in g["gates"]:
        assert gate["accepted"] and gate["waited_by_original_parent"]
        assert gate["exit"] == (101 if gate["name"] == "old-source-consumer-red" else 1 if gate["name"] in {"parent-error", "parent-signal"} else 0)
        assert sha(raw("qualification2/green-" + gate["name"] + ".log")) == gate["log_sha256"]
    red = raw("qualification2/green-old-source-consumer-red.log")
    assert b"expected `()`, found `Empty`" in red or b"expected `Empty`, found `()`" in red
    assert g["exact_old_source_red"]
    inputs = data("qualification2/complete-source-inputs.json")
    assert sha(raw("qualification2/complete-source-inputs.json")) == q["manifest_sha256"]
    checked = 0
    for name, digest in inputs.items():
        content = raw("source-objects/" + digest)
        assert sha(content) == digest
        if name.startswith("source/"):
            p = local / name.removeprefix("source/")
            if p.is_file():
                assert sha(p.read_bytes()) == digest, name
                checked += 1
        if name.startswith("old-source/"):
            rel = name.removeprefix("old-source/")
            assert subprocess.check_output(["git", "show", OLD + ":" + rel], cwd=local) == content
    assert set(q["red_differing_files"]) == {"reboot/rust/src/codegen.rs", "reboot/rust/src/workflow_transaction_codegen.rs"}
    generated = [raw("source-objects/" + h).decode() for n, h in inputs.items() if n.startswith("generated/") and n.endswith("workflow.reboot.rs")]
    assert len(generated) == 1
    section = generated[0].split("impl EmptyTransactionMethodsWorkflowTransactionRef {", 1)[1].split("\n}\n", 1)[0]
    assert "request: ()) -> Result<(), tonic::Status>" in section
    assert "request: proto::Empty) -> Result<proto::Empty, tonic::Status>" in section
    assert 'response_type: "type.googleapis.com/google.protobuf.Empty"' in section
    assert 'response_type: "type.googleapis.com/workflow.v1.Empty"' in section
    assert "pub async fn create" not in section
    rows = []
    for name in names:
        if name.endswith("/receipt.json"):
            r = data(name)
            assert r["children"] and all(c["waited_by_parent"] for c in r["children"])
            if "binary_sha256" in r:
                assert r["binary_sha256"] == g["binary_sha256"]
            if "database_sha256" in r:
                assert r["database_sha256"] == q["database_sha256"]
            rows.append(dict(path=name, complete=r["complete"], cases=len(r.get("cases", [])), waits=len(r["children"])))
    assert sorted(rows, key=lambda r:r["path"]) == sorted(q["receipts"], key=lambda r:r["path"])
    d = data("qualification2/native-transaction-raw/receipt.json")
    expected_cases = {"success", "concurrent-root", "ack-restart", "target-ack-loss", "payload-reject", "authorization-reject", "rollback"}
    assert d["complete"] and len(d["cases"]) == len(expected_cases) and {c["case"] for c in d["cases"]} == expected_cases
    for case in d["cases"]:
        value = 0 if case["case"] == "rollback" else 7 if case["case"] == "success" else 10
        assert case["final"]["value"] == case["final"]["leaf"] == value
        assert len(case["final"]["pending"]) == (0 if case["case"] == "rollback" else 1 if case["case"] == "success" else 2)
    for label, error in [("parent-error", "requested native original-parent error drill"), ("parent-signal", "transaction proof parent terminated")]:
        r = data("qualification2/" + label + "-raw/receipt.json")
        assert not r["complete"] and not r["cases"] and r["all_original_children_waited"] and error in r["error"]
        assert r["parent_pid"] == next(x["pid"] for x in g["gates"] if x["name"] == label)
    for name, key in [("all-targets", "sdk"), ("doctests", "doctests"), ("fixture-tests", "consumer")]:
        results = re.findall(r"test result: ok\. (\d+) passed; (\d+) failed; (\d+) ignored;", raw("qualification2/green-" + name + ".log").decode())
        assert results and all(int(f) == 0 for _, f, _ in results)
        assert q[key] == dict(passed=sum(int(p) for p, _, _ in results), ignored=sum(int(i) for _, _, i in results))
    assert q["consumer"]["passed"] > 0
    assert b"generated_transaction_canonical_empty_and_local_collision_compile ... ok" in raw("qualification2/green-fixture-tests.log")
    failed_inputs = data("qualification/green-source-inputs.json")
    current_inputs = data("qualification2/green-source-inputs.json")
    differences = {k for k in set(failed_inputs) | set(current_inputs) if failed_inputs.get(k) != current_inputs.get(k)}
    assert differences == {"reboot/rust/src/codegen.rs"}
    for name, digest in failed_inputs.items():
        key = "failed-source/" + name
        if key in inputs:
            assert inputs[key] == digest
    assert raw("source-objects/" + inputs["failed-source/reboot/rust/src/codegen.rs"]) == subprocess.check_output(["git", "show", "bebd8e6d3c98bbfd6556857ec4fffb6349ebfffe:reboot/rust/src/codegen.rs"], cwd=local)
    failed = data("qualification/green-gates.json")
    assert not failed["complete"] and failed["source_unchanged"]
    assert failed["gates"][-1]["name"] == "fixture-clippy" and failed["gates"][-1]["exit"] == 101
    assert b"unit_arg" in raw("qualification/green-fixture-clippy.log")
    failed_retirement = data("attempt1-retirement-before-attempt2.json")
    assert failed_retirement["owner_proc_absent"] and failed_retirement["all_gate_pids_absent"] and failed_retirement["four_cache_locks_reacquired"]
    prior = data("prelaunch-retirement-additive2.json")
    assert prior["all_prior_original_children_waited_and_absent"] and prior["four_cache_locks_acquired"]
    assert prior["prior_owner"]["owner_pid"] == 1645682
    assert prior["prior_owner"]["children"] == [dict(pid=1645683, waited_by_owner=True, wait_returncode=0)]
    retirement = data("retirement.json")
    assert retirement["owner_proc_absent"] and retirement["all_gate_pids_absent"] and retirement["all_receipt_children_absent"] and retirement["four_cache_locks_acquired"]
    assert all(s in retirement["unit"] for s in ["MainPID=0", "ActiveState=inactive", "Result=success", "ExecMainStatus=0"])
    assert not q["fresh_cpp_build"]
    positives = sum(r["cases"] for r in rows if r["complete"])
    waits = sum(r["waits"] for r in rows)
    assert positives == q["native_positive_cases"] and waits == q["original_driver_child_waits"]
    print(json.dumps(dict(accepted=True, source_commit=SOURCE, archive_sha256=sha(archive.read_bytes()), archive_bytes=archive.stat().st_size, archive_files=len(names), native_positive_cases=positives, transaction_cases=len(d["cases"]), native_receipts=len(rows), original_driver_child_waits=waits, gates=len(expected), sdk=q["sdk"], doctests=q["doctests"], consumer=q["consumer"], source_inputs=len(inputs), locally_checked_inputs=checked, binary_sha256=g["binary_sha256"], database_sha256=q["database_sha256"], fresh_cpp_build=False), indent=2))
