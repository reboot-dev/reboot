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

# The `Schema` state holding the shape of the application under
# development, as the companion last saw it.
SCHEMA_ID = 'schema'

# Carries the address of the application under development into the
# companion, which serves it to the dashboard. The dashboard is served
# by the companion, so it has no other way to learn where the
# application it describes actually is.
ENVVAR_RBT_APPLICATION_URL = 'RBT_APPLICATION_URL'

# The `Presence` state the dashboard page subscribes to, recording who
# is looking at a dashboard right now. Not currently used to decide
# whether to open one -- see `DashboardServicer`.
#
# The page names this and `CONFIG_PATH` independently, in
# `frontend/src/constants.ts`, since TypeScript cannot read them from
# here. Keep the two in step.
PRESENCE_ID = 'dashboard'
