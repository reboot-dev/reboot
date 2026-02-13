import psutil
from pathlib import Path
from reboot.cli import terminal


def cgroups_enabled() -> bool:
    cgroups_path = Path('/proc/self/cgroup')
    return (
        cgroups_path.exists() and len(cgroups_path.read_text().strip()) > 0
    )


def detect_cores(*, flag_name: str) -> int:
    """Returns the number of cores available for this process.

    TODO: Fails if the process is in a cgroup, because it is very challenging to
    accurately determine the number of available cores in that case.
    See https://bugs.python.org/issue36054 for more information, but note that
    the referenced JDK code no longer aligns with e.g. Ubuntu 22.04, and there
    weren't useful implementations on pypi at time of writing (for example:
    `cgroupspy` expected a completely different layout in `/sys/fs/cgroup`).
    """
    if cgroups_enabled():
        terminal.fail(
            "This process is running in a cgroup, which makes it difficult to "
            f"automatically choose a `{flag_name}` value. Please explicitly set "
            f"`{flag_name}`: see `--help` for more information."
        )
    try:
        if cpu_affinity := getattr(psutil.Process(), 'cpu_affinity', None):
            # CPU affinity is not defined on macOS.
            available_cpu_count = len(cpu_affinity())
            terminal.verbose(
                f"Detected {available_cpu_count} available cores with cpu_affinity."
            )
        else:
            available_cpu_count = psutil.cpu_count(logical=False)
            terminal.verbose(
                f"Detected {available_cpu_count} available cores with cpu_count."
            )

        if available_cpu_count < 1:
            raise ValueError(f"Unexpected CPU count: {available_cpu_count}.")
    except Exception as e:
        terminal.fail(
            f"Failed to detect CPU count: {e}.\n\n"
            "Please report this issue to the maintainers! In the meantime, "
            f"you can use `{flag_name}` to explicitly set this value."
        )

    return available_cpu_count
