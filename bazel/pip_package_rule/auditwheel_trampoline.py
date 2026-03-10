import auditwheel.main
import os
import sys


def _add_patchelf_to_path():
    # For auditwheel to work, it must have `patchelf` in its path.
    # We know that `patchelf` (the package) is in the PYTHONPATH, because it was
    # in our `requirements.txt`. That doesn't put its script on our PATH (alas),
    # but we can figure out where to find its script and add it to the PATH
    # ourselves before invoking `auditwheel`.
    found_patchelf = False

    # Old way (`rules_python` version around 0.4.0) of finding `patchelf`.
    # TODO(rjh): remove this once we're no longer using such an old
    #            `rules_python`.
    for path in sys.path:  # `sys.path` == the PYTHONPATH.
        if "patchelf" in path:
            # The script is in a `*.data` directory. Find it.
            for root, _, files in os.walk(path):
                if "patchelf" in files:
                    os.environ["PATH"] = (
                        root + ":" + os.environ.get("PATH", "")
                    )
                    found_patchelf = True
                    break

    # New way (`rules_python` version around 0.27.0) of finding `patchelf`.
    # TODO(rjh): this is present for forwards compatibility; make it the only
    #            way (and remove these caveats) once `rules_python` is updated.
    if found_patchelf:
        return

    # We've installed the `patchelf` binary into the Bazel workspace via the
    # `patchelf` pip requirement provided by `rules_python`. However,
    # `rules_python` isn't expecting us to use a binary package in this way,
    # so it has placed the binary in a place that's exceptionally annoying
    # to find. We can find it by:
    # 0. Looking at the current working directory, which gives us a path
    #    into Bazel's workspace.
    # 1. Finding the parent of the 'sandbox' directory, which is the root in
    #    which Bazel installs things.
    # 2. Going into the 'external' directory, which is where `rules_python`
    #    installs its packages.
    # 3. Knowing that the `patchelf` package gets installed in a directory
    #    named `pip_package_rule_pypi_patchelf`.
    # 4. Going into the `bin` directory, which is where we'll find the
    #    actual binary.
    #
    # TODO(rjh): this is a very brittle way of finding `patchelf`. Can we
    #            work with the maintainers of `rules_python` to get a better
    #            way?
    cwd_list = os.getcwd().split("/")
    bazel_root_path_list = cwd_list[:cwd_list.index("sandbox")]
    patchelf_bin_path = "/".join(
        bazel_root_path_list +
        ["external", "pip_package_rule_pypi_patchelf", "bin"]
    )
    # Sanity check: did we indeed find the `patchelf` binary?
    for root, _, files in os.walk(patchelf_bin_path):
        if "patchelf" in files:
            os.environ["PATH"] = (root + ":" + os.environ.get("PATH", ""))
            found_patchelf = True
            break

    if not found_patchelf:
        # This would be a bug in the `pip_package_rule`.
        raise RuntimeError(
            "Could not find 'patchelf' in PYTHONPATH or suspected location "
            f"('{patchelf_bin_path}')."
        )


if __name__ == "__main__":
    if sys.platform == 'linux':
        # 'patchelf' is only available on Linux.
        _add_patchelf_to_path()

    sys.exit(auditwheel.main.main())
