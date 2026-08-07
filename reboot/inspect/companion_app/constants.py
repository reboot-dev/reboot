"""Values shared between the companion application and the CLI.

Kept apart from `main.py` so that reading them does not drag in the
application and everything it serves with.
"""

# Where the companion serves the dashboard, relative to its own
# address.
DASHBOARD_PATH = '/dashboard'

# The `Dashboard` state recording whether a dashboard has ever been
# opened for the application under development. One companion serves
# one application today, so one state suffices; key it by application
# id if that ever changes.
DASHBOARD_ID = 'dashboard'

# The `Presence` state the dashboard page subscribes to, recording who
# is looking at a dashboard right now. Not currently used to decide
# whether to open one -- see `DashboardServicer`.
#
# The page names this same value independently, in `main.tsx`, since
# TypeScript cannot read it from here.
PRESENCE_ID = 'dashboard'
