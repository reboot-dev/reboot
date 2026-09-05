"""The pytest plugin the `reboot` distribution registers: with the
`reboot[pytest-bdd]` extra installed, every test run gets the
`reboot.bdd` steps and fixtures, and with `playwright` and
`pytest-playwright` installed too, the web app's steps."""

import importlib.util

if importlib.util.find_spec('pytest_bdd') is not None:
    from reboot.bdd.steps import *  # noqa: F401,F403

    if (
        importlib.util.find_spec('playwright') is not None and
        importlib.util.find_spec('pytest_playwright') is not None
    ):
        from reboot.bdd.web import *  # noqa: F401,F403
