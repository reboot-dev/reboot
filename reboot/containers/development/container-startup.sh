#!/bin/bash

set -e # Exit if a command exits with an error.

# Match UID and GID with host user to avoid permission issues. If the container
# user's UID/GID doesn't match the host user's UID/GID, the container will
# read/write with different permissions than the host user, which will likely
# cause errors.
#
# Note that this is only necessary when running a regular Docker container, it
# is done for us automatically when running a Dev Container.
if [ -z "$HOST_UID" ]; then
  echo 'HOST_UID environment variable is required; please set it using:'
  echo '  --env "HOST_UID=$(id -u)"'
  exit 1
fi
if [ -z "$HOST_GID" ]; then
  echo 'HOST_GID environment variable is required; please set it using:'
  echo '  --env "HOST_GID=$(id -u)"'
  exit 1
fi

# From here on, accessing an unknown environment variable is an error.
set -u

LOCAL_UID=$(id -u dev)
LOCAL_GID=$(id -g dev)
if [ "$HOST_UID" != "$LOCAL_UID" ]; then
  usermod --uid "$HOST_UID" dev
fi
if [ "$HOST_GID" != "$LOCAL_GID" ]; then
  # Passing '--non-unique' allows the 'dev' group to share a GID with other
  # groups. This is important when the container is given a 'HOST_GID' that
  # already exists in the container, but is not the GID of the 'dev' group.
  groupmod --non-unique --gid "$HOST_GID" dev
fi

# Make sure that the /workspaces/ folder remains writable for the user, even now
# that they've changed UID/GID.
# Attention: NOT recursive, so that we don't affect permissions on a mounted
# volume.
chown dev:dev /workspaces

# Start Docker-in-Docker, in the background.
/usr/local/share/docker-init.sh >/var/log/docker-init.stdout 2>/var/log/docker-init.stderr &

# Execute what was passed as arguments to this script, as the `dev` user.
# Getting the quoting just right is tricky: to make sure that the command is
# passed on exactly as we got it, we use `printf` to re-quote every argument.
#
# Pass the command to `bash -i` to run; the `-i` will load the user's profile
# (notably their `.bashrc`), which is required for anything to run `npm`.
#
# Preserve environment variables, since some may have been set by the user,
# but unset `HOME` so `dev` sets its own.
#
# Ask `su` to do this on a "pseudo-terminal" (--pty) to avoid errors in case of
# an interactive shell.
unset HOME
COMMAND=$(printf "'%s' " "$@")
su dev --preserve-environment --pty --command "bash -i -c \"$COMMAND\""
