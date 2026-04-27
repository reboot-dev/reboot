#!/bin/bash
#
# Set common git config settings. Unfortunately, git can't be configured to use
# a default config file that's checked into a repository: see
# https://stackoverflow.com/a/18330114.

set -e # Exit if a command exits with an error.
set -u # Treat expanding an unset variable as an error.

# When Copilot edits our repo, it checks out our code as one user, then
# edits it as another. We need to tell git that this is okay.
git config --global --add safe.directory $(pwd)

# Avoid having to type `git push --set-upstream my_branch origin/my_branch`
# every time we create a new branch that we want to push to GitHub, by making
# the upstream default to the same name as the local branch. That way, we
# can simply type `git push -u` and it will set the upstream if needed.
git config --global push.default current

# When doing `git pull`, default to `git pull --recurse-submodules`. We use
# submodules liberally in Respect, and having to type `--recurse-submodules`
# is a penguin we have to keep track of all the time. In the unlikely event
# that we don't want to pull the latest submodules we can still pass
# `--no-recurse-submodules` to `git pull`.
git config --global submodule.recurse true

# Use diff3 as our conflict resolution strategy, following recommendations such as:
#  https://blog.nilbus.com/take-the-pain-out-of-git-conflict-resolution-use-diff3/
# and
#  https://stackoverflow.com/questions/27417656/should-diff3-be-default-conflictstyle-on-git
git config --global merge.conflictstyle diff3

# Do some extra work to pre-configure GitHub authentication when running
# in a codespace. Skip this for a local devcontainer.
if [[ "${CODESPACES:-}" == "true" ]]; then
  # Use HTTPS instead of SSH for git operations on this workstation: in
  # Codespaces we have credentials ONLY for HTTPS. See:
  #   https://docs.github.com/en/codespaces/codespaces-reference/security-in-codespaces#authentication
  #   https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/creating-a-personal-access-token#using-a-token-on-the-command-line
  git config --global url."https://github.com/".insteadOf "git@github.com:"

  # Make it possible for us to push commits to all repos, not just to
  # `reboot-dev/mono`. To do so, we...
  # 1. Set the `gh` (GitHub CLI) tool as a `git` credential helper.
  gh auth setup-git

  # 2. Set up a script that on every terminal start:
  #    * Unsets `GITHUB_TOKEN`, so it uses the credential helper instead.
  #    * Tells the user to run `gh auth login` if they haven't yet.
  grep -q "gh_auth_for_all_repos.sh" ~/.bashrc \
    || { \
      echo "" >> ~/.bashrc \
        && echo "# Installed by .devcontainer/git_config.sh" >> ~/.bashrc \
        && echo "source .devcontainer/gh_auth_for_all_repos.sh" >> ~/.bashrc \
    ;}

fi

# Install a script that on every terminal start checks if the precommit
# hook is installed, and if not installs it.
grep -q "install_precommit_hook.sh" ~/.bashrc \
  || { \
    echo "" >> ~/.bashrc \
      && echo "# Installed by .devcontainer/git_config.sh" >> ~/.bashrc \
      && echo "source .devcontainer/install_precommit_hook.sh" >> ~/.bashrc \
  ;}
