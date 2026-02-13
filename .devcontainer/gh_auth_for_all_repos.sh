#!/bin/bash
#
# Make it possible for us to push commits to all repos that we have access to as
# our GitHub user, not just to `reboot-dev/mono`. Our default GitHub
# Codespaces git authentication mechanism (based on `GITHUB_TOKEN`) only has
# permissions to push to the repository the codespace is created for, not the
# submodules or anything else. See:
#   https://github.com/reboot-dev/mono/issues/100
#
# To authenticate our codespace to be able to push elsewhere, we...
#  * Set up `gh` as a credential helper once (during setup in `git_config.sh`).
#  * Unset `GITHUB_TOKEN`, so it uses the credential helper instead (for every
#    terminal start, in this script).
#  * Tells the user to run `gh auth login` if they haven't yet (for every
#    terminal start, in this script).

# NOTE: do NOT use `set -e` or `set -u` here, as this script is expected to be
#       `source`d every time a new terminal starts, and the setting will persist
#       for the entire lifetime of the terminal.

# In every terminal we DON'T want to have `GITHUB_TOKEN` set, as it will
# override any authentication we may have done with `gh auth login`.
unset GITHUB_TOKEN

# Now check that we've authenticated to GitHub.
RED='\033[0;31m'
NC='\033[0m' # No Color
gh auth status > /dev/null 2>&1 || {
  echo -e "${RED}ATTENTION:${NC} you haven't authenticated to GitHub yet. Please run:"
  echo "  gh auth login"
}
