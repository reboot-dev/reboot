"""Writes a requirements file with the packages of the given extras
requirements files removed, so that those packages ship as a wheel's
optional-dependency extras instead of its dependencies."""

import argparse
import re


def normalize_package_name(name: str) -> str:
    """
    Normalizes the package name per
    https://packaging.python.org/en/latest/specifications/name-normalization/#normalization
    """
    return re.sub(r"[-_.]+", "-", name).lower()


def find_package_name(line: str) -> str:
    """
    Given a line like:
    ```
    my-cool_pAcKaG3.n4me==1.2.3 # some comment.
    ```
    Returns "my-cool.pAcKaG3.n4me".
    """
    package_name = re.match("^([\\w._-]+)", line, flags=re.IGNORECASE)
    if package_name is None:
        raise ValueError(f"Could not find package name in line: '{line}'")

    return package_name.group(1)


def requirement_packages(filename: str) -> set[str]:
    """The normalized package names the requirements file pins."""
    packages = set()
    with open(filename) as requirements:
        for line in requirements:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            packages.add(normalize_package_name(find_package_name(line)))
    return packages


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--requirements-txt", type=str, required=True)
    parser.add_argument("--output", type=str, required=True)
    parser.add_argument(
        "--extra-requirements-txt",
        type=str,
        action="append",
        default=[],
        help="requirements file whose packages become an extra, so "
        "they are removed from the output; every one of its packages "
        "must be present in --requirements-txt",
    )
    args = parser.parse_args()

    extras_packages = set()
    for filename in args.extra_requirements_txt:
        extras_packages.update(requirement_packages(filename))

    missing = extras_packages - requirement_packages(args.requirements_txt)
    if missing:
        raise ValueError(
            f"Expected the extras packages {sorted(missing)} to also be "
            f"in '{args.requirements_txt}', which stays the complete "
            "list, but they were not"
        )

    with open(args.requirements_txt) as requirements:
        with open(args.output, "w") as output:
            for line in requirements:
                stripped = line.strip()
                if stripped and not stripped.startswith("#"):
                    package = normalize_package_name(
                        find_package_name(stripped)
                    )
                    if package in extras_packages:
                        continue
                output.write(line)


if __name__ == "__main__":
    main()
