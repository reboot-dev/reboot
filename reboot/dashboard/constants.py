"""Values shared between the dashboard application and the CLI.

Kept apart from `main.py` so that reading them does not drag in the
application and everything it serves with.
"""

# Where the dashboard application serves its page, relative to its
# own address.
DASHBOARD_PATH = '/dashboard'

# The dashboard application's port. Deliberately not adjacent to
# `rbt dev run`'s default port of 9991: VS Code forwards a port
# upward when the one it wants is already taken on the developer's
# machine, so a second dev container serving on 9991 arrives on
# 9992. A dashboard sitting there could be reached in place of
# somebody else's backend, which half-works and is far more
# confusing than not working at all. 9871 is below 9991 so upward
# forwarding never reaches it, outside the 999x band (9990 k3d and
# WildFly, 9993 ZeroTier, 9997 Splunk), clear of
# 9000/9090/9200/9222/9229, hard to confuse with 9991 when reading
# logs, and outside the Linux ephemeral range.
DEFAULT_DASHBOARD_PORT = 9871

# The `API` state holding the shape the developer's API files
# declare, as the dashboard application last read them.
API_ID = 'api'

# The `Preferences` state holding what the developer has said about
# opening dashboards: the dashboard's banner writes it and `rbt dev
# run` reads it.
PREFERENCES_ID = 'preferences'

# The `OrderedMap` of changes to the developer's API files, keyed by
# uuidv7 so a reverse range is newest first.
CHANGELOG_ID = 'changelog'

# The directory the developer's API files are in, as the `.rbtrc`
# spells it for `rbt generate`. Separate from the application's URL
# because the files are there long before anything is serving, and
# the dashboard is meant to be startable that early.
ENVVAR_RBT_API_DIRECTORY = 'RBT_API_DIRECTORY'

# The `Presence` state the dashboard page subscribes to, recording who
# is looking at a dashboard right now. `rbt dev run` reads it to decide
# whether to open one.
#
# The page names this, `API_ID` and `PREFERENCES_ID` independently,
# in `frontend/src/constants.ts`, since TypeScript cannot read them
# from here. Keep the two in step.
PRESENCE_ID = 'dashboard'
