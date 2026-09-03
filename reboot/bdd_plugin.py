"""The pytest plugin the `reboot` distribution registers: with the
`reboot[pytest-bdd]` extra installed, every test run gets the
`reboot.bdd` steps and fixtures."""

import importlib.util

if importlib.util.find_spec('pytest_bdd') is not None:
    from reboot.bdd.steps import *  # noqa: F401,F403
