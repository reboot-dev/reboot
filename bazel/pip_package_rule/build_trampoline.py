"""
This is a trampoline script that we use to run the `build` module from
`setuptools` in a Bazel rule. This is necessary because `setuptools` does not
support running in a non-writable working directory, the default working
directory in `bazel` is not writable, and `bazel` doesn't give us a better way
to switch the working directory.

The trampoline also does some additional verification that the build is being
done correctly, where those checks can't be done in the rule itself.
"""
import argparse
import os
import platform
import re
# NOTE: Part of setuptools.
from build.__main__ import main as build_main  # type: ignore[import]


class MissingDependenciesError(ValueError):
    pass


def normalize_package_name(name) -> str:
    """Normalize a Python package name.

    Borrowed from:
      https://packaging.python.org/en/latest/specifications/name-normalization/#valid-non-normalized-names
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
    package_name = re.match("^([\w._-]+)", line, flags=re.IGNORECASE)
    if package_name is None:
        raise ValueError(f"Could not find package name in line: '{line}'")

    return package_name.group(1)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--working-directory",
        type=str,
        help="the working directory to run the build in",
        required=True,
    )
    parser.add_argument(
        "--input-directory",
        type=str,
        help="the input directory to run the build from, relative to the "
        "working directory",
        required=True,
    )
    parser.add_argument(
        "--output-directory",
        type=str,
        help="the output directory to build into, relative to the working "
        "directory.",
        required=True,
    )
    parser.add_argument(
        "--verify-python-version",
        type=str,
        help="verify that the running Python version matches this expected "
        "<major>.<minor> version",
        required=True,
    )
    parser.add_argument(
        "--requirements-txt",
        type=str,
        help="the path to the requirements.txt file",
        required=True,
    )
    parser.add_argument(
        "--verify-dependency-in-requirements",
        type=str,
        action="append",
        help="verify that the given dependency is in the requirements.txt file",
        required=False,
    )
    args = parser.parse_args()

    # Verify that the running Python version matches the expected version. Since
    # the Python version will get encoded into the output wheel's filename, we
    # must predict it correctly. This will catch if we change Python versions
    # without changing the expected version in the rule.
    python_major_minor = platform.python_version().rsplit(".", 1)[0]
    if args.verify_python_version != python_major_minor:
        raise ValueError(
            f"Expected Python version {args.verify_python_version}, but "
            f"running Python version {python_major_minor}. Inspect the "
            "`_python_version` attribute of the `pip_package` rule; it is "
            "probably out of date."
        )

    # Verify that all of the given dependencies are in the requirements.txt.
    # This will catch if the requirements.txt given to the rule is out of date
    # relative to the dependencies in the rule. That is particularly plausible
    # if the dependency tree use a different `requirement.txt` than the
    # `pip_package`, or if the tree even uses multiple different
    # `requirement.txt`s.
    #
    # We can only do this check here, not in the rule itself, because the rule
    # fundamentally isn't able to read the `requirements.txt` file.
    missing_dependencies = [
        normalize_package_name(dep)
        for dep in args.verify_dependency_in_requirements
    ]
    with open(args.requirements_txt) as requirements_txt:
        for line in requirements_txt:
            if line.startswith("#"):
                continue
            dependency = normalize_package_name(find_package_name(line))
            try:
                # This dependency is no longer missing!
                missing_dependencies.remove(dependency)
            except ValueError:
                # Turns out we don't need this dependency. That's fine.
                pass
    if len(missing_dependencies) > 0:
        raise MissingDependenciesError(
            f"Expected dependencies {missing_dependencies} to be in the "
            f"`requirements.txt` file, but they were not. Inspect the "
            "`requirements.txt` of the `pip_package` rule; it is probably "
            "out of date."
        )

    # This is the main reason this trampoline exists: we need to change the
    # working directory before we can run the build. This is because Python's
    # `build` will output temporary artifacts to the current working directory,
    # and the default working directory in `bazel` is not writable.
    os.chdir(args.working_directory)

    # Now we can run the build as normal, passing in the input and output
    # directories.
    build_main(
        cli_args=[args.input_directory, f"--outdir={args.output_directory}"]
    )
