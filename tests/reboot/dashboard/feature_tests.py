"""Runs the dashboard's `.feature` files with the built-in steps."""

# The star import below is how a test module gets the built-in steps
# and their fixtures, but 'ruff' doesn't like it, so we need to
# silence their error.
#
# ruff: noqa: F403

from pytest_bdd import scenarios
from reboot.bdd.steps import *

scenarios('preferences.feature')
