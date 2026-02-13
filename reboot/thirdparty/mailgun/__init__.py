# We "re-export" settings to simplify user code but 'ruff' doesn't
# like that so we need to silence their error.
#
# ruff: noqa: F403
from reboot.thirdparty.mailgun.settings import *


def servicers():
    """Returns the servicers necessary to use the third-party mailgun
    integration.
    """
    # NOTE: need to lazily import this because otherwise the import
    # system runs into a kind of circular dependency issue.
    from reboot.thirdparty.mailgun.servicers import (  # type: ignore[import]
        MessageServicer,
    )
    return [MessageServicer]
