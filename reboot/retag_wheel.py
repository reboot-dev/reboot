"""
Retag a built wheel with a new version, writing a new wheel file.

Given an input wheel and a version suffix, produces a new wheel whose
version is the original version with the suffix appended (e.g. `1.0.4`
plus suffix `+dev.123` becomes `1.0.4+dev.123`). Updates the wheel
filename, the `*.dist-info/` directory name, the optional `*.data/`
directory name, the `Version:` line in `METADATA`, and the hashes in
`RECORD` so that the wheel remains internally consistent.

Used by `stage_and_publish_local.sh` to give every locally-published
build of `:reboot.dev` a unique version number, so that downstream
tools (`uv`, `pip`) treat each rebuild as a new release.
"""
import argparse
import base64
import hashlib
import re
import zipfile
from pathlib import Path

# A wheel filename is `<name>-<version>-<pythontag>-<abitag>-<platformtag>.whl`.
# Distribution names and versions are constrained not to contain `-`, so we
# split on the first two dashes to capture name and version.
_WHEEL_FILENAME_RE = re.compile(
    r"^(?P<name>[^-]+)-(?P<version>[^-]+)-(?P<tags>.+)\.whl$"
)


def _record_hash(data: bytes) -> str:
    """Compute the SHA-256 hash in the form used by a wheel `RECORD` line."""
    digest = hashlib.sha256(data).digest()
    encoded = base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")
    return f"sha256={encoded}"


def retag_wheel(
    input_wheel: Path,
    version_suffix: str,
    output_directory: Path,
) -> Path:
    """Produce a new wheel with `version_suffix` appended to its version.

    Returns the path of the newly-written wheel.
    """
    match = _WHEEL_FILENAME_RE.match(input_wheel.name)
    if match is None:
        raise ValueError(
            f"Could not parse wheel filename: {input_wheel.name!r}"
        )
    name = match["name"]
    old_version = match["version"]
    tags = match["tags"]
    new_version = old_version + version_suffix

    old_dist_info = f"{name}-{old_version}.dist-info"
    new_dist_info = f"{name}-{new_version}.dist-info"
    # Wheels may also have a `<name>-<version>.data/` directory for
    # files installed outside `site-packages` (scripts, headers, etc.).
    old_data = f"{name}-{old_version}.data"
    new_data = f"{name}-{new_version}.data"

    output_directory.mkdir(parents=True, exist_ok=True)
    output_wheel = output_directory / f"{name}-{new_version}-{tags}.whl"

    # We rebuild the wheel from scratch so that the new `RECORD` reflects
    # the new file paths and the updated `METADATA` hash. We preserve each
    # entry's `ZipInfo` (notably `external_attr`, which holds the Unix file
    # mode) so that executable bits on scripts like `protoc_gen_es_with_deps.cjs`
    # survive the retag. Using `writestr(filename, data)` with a bare string
    # would drop those mode bits and yield `0o600`, breaking `os.execl` on
    # files that the wheel intended to be executable.
    rewritten: list[tuple[zipfile.ZipInfo, bytes]] = []
    with zipfile.ZipFile(input_wheel, "r") as zin:
        for info in zin.infolist():
            new_path = info.filename
            if new_path.startswith(old_dist_info + "/"):
                new_path = new_dist_info + new_path[len(old_dist_info):]
            elif new_path.startswith(old_data + "/"):
                new_path = new_data + new_path[len(old_data):]
            data = zin.read(info.filename)
            # `METADATA` records the version in a `Version:` header; rewrite
            # it so that pip/uv see the new version.
            if new_path == f"{new_dist_info}/METADATA":
                data = re.sub(
                    rb"(?m)^Version:.*$",
                    f"Version: {new_version}".encode("utf-8"),
                    data,
                    count=1,
                )
            new_info = zipfile.ZipInfo(
                filename=new_path, date_time=info.date_time
            )
            new_info.external_attr = info.external_attr
            new_info.compress_type = zipfile.ZIP_DEFLATED
            rewritten.append((new_info, data))

    record_path = f"{new_dist_info}/RECORD"
    record_lines = []
    for info, data in rewritten:
        if info.filename == record_path:
            # The `RECORD` file's own entry has empty hash and size,
            # since hashing it would be self-referential.
            record_lines.append(f"{info.filename},,")
        else:
            record_lines.append(
                f"{info.filename},{_record_hash(data)},{len(data)}"
            )
    new_record = ("\n".join(record_lines) + "\n").encode("utf-8")

    with zipfile.ZipFile(output_wheel, "w", zipfile.ZIP_DEFLATED) as zout:
        for info, data in rewritten:
            if info.filename == record_path:
                zout.writestr(info, new_record)
            else:
                zout.writestr(info, data)
        # If the original wheel had no `RECORD`, we still need to write one.
        if not any(i.filename == record_path for i, _ in rewritten):
            record_info = zipfile.ZipInfo(filename=record_path)
            # Regular non-executable file: `0o644` shifted into the high
            # 16 bits of `external_attr`, where `zipfile` stores Unix mode.
            record_info.external_attr = 0o644 << 16
            record_info.compress_type = zipfile.ZIP_DEFLATED
            zout.writestr(record_info, new_record)

    return output_wheel


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--input-wheel",
        type=Path,
        required=True,
        help="path to the wheel to retag",
    )
    parser.add_argument(
        "--version-suffix",
        type=str,
        required=True,
        help="suffix to append to the wheel's version (e.g. `+dev.123`)",
    )
    parser.add_argument(
        "--output-directory",
        type=Path,
        required=True,
        help="directory to write the retagged wheel into",
    )
    args = parser.parse_args()
    output = retag_wheel(
        args.input_wheel, args.version_suffix, args.output_directory
    )
    # Print the new wheel path so callers can capture it from stdout.
    print(output)
