"""The `reboot[dev]` extra: what a development environment installs
beyond the `reboot` runtime, and what to say when it is missing."""

import importlib.util

# The extra, spelled the way a project's dependencies spell it.
DEV_EXTRA = 'reboot[dev]'


def dev_extra_installed() -> bool:
    """Whether the packages the extra installs are importable, told by
    the one `reboot.bdd` cannot do without."""
    return importlib.util.find_spec('pytest_bdd') is not None


def missing_dev_extra(who_needs_it: str) -> str:
    """The message for a development environment without the extra,
    naming who needs it, e.g. '`rbt dashboard` needs it'."""
    return (
        f"The `{DEV_EXTRA}` extra is not installed; {who_needs_it}. Add "
        f"`{DEV_EXTRA}`, pinned like `reboot`, to your project's development "
        "dependencies and install again."
    )
