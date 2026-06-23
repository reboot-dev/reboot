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

# Codespaces-specific GitHub auth: Codespaces provides HTTPS-only
# credentials and a `GITHUB_TOKEN` scoped to a single repo, so here we
# rewrite SSH remotes to HTTPS and register `gh` as the git credential
# helper. Gated on `CODESPACES` alone because other environments bring
# their own git credentials — DevPod injects them, and a local
# devcontainer uses the host's.
if [[ "${CODESPACES:-}" == "true" ]]; then
  # Use HTTPS instead of SSH for git operations on this workstation: in
  # Codespaces we have credentials ONLY for HTTPS. See:
  #   https://docs.github.com/en/codespaces/codespaces-reference/security-in-codespaces#authentication
  #   https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/creating-a-personal-access-token#using-a-token-on-the-command-line
  git config --global url."https://github.com/".insteadOf "git@github.com:"

  # Register `gh` as a git credential helper so we can push to every
  # repo our GitHub user can access, not only the one this workstation
  # was created for.
  gh auth setup-git
fi

# A separate, broader block: on any managed workstation (Codespaces or
# DevPod), install a per-terminal reminder to run `gh auth login` when
# the `gh` CLI isn't authenticated. It's its own `if` because `gh` CLI
# auth is useful on DevPod too (for `gh`/agent commands), whereas the
# HTTPS rewrite and credential helper above are Codespaces-only. On
# DevPod plain `git` is authenticated by DevPod's injected credentials,
# so this is purely a `gh`-CLI reminder — the sourced script's
# `unset GITHUB_TOKEN` is a no-op there (that variable exists only in
# Codespaces). Gated to managed workstations so a plain local
# devcontainer isn't nagged.
if [[ "${CODESPACES:-}" == "true" || "${DEVPOD:-}" == "true" ]]; then
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
