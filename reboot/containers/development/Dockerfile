# This file provides a container suitable for development of a Reboot
# application.
#
# Note that this Dockerfile produces a regular Docker container that can be used
# for development; it does NOT (by itself) produce a "Dev Container". To produce
# a Dev Container, the `.devcontainer/devcontainer.json` file uses this
# Dockerfile as a starting point and then adds additional features.

FROM ubuntu:jammy-20240808

################### Container for development work #####################
# The following sections are required to get a working container that can be
# used for any kind of development, not just Reboot development.

### Basic tools.
#
# Installs:
# * `wget` and `curl` to install other tools, with `ca-certificates` to make
#   https calls.
# * `gnupg` to allow us to verify the integrity of downloaded files.
# * `sudo` to allow administrative actions by our future non-root user.
RUN apt-get update && apt-get install -y --no-install-recommends \
  ca-certificates \
  wget \
  curl \
  gnupg \
  sudo \
  # Clean up, leaving a smaller layer.
  && rm -rf /var/lib/apt/lists/*

### Docker-in-Docker
# Docker-in-Docker  (AKA "dind") is required for any development using
# containers that use bind-mounts, since the alternative, Docker-on-Docker
# (where /var/run/docker.sock is mounted), will root bind-mounts on the host,
# instead of in the container where the actual development is happening.
#
# We install Docker-in-Docker using the same script that Dev Containers use. See
# the Dev Container feature's documentation for more information:
#   https://github.com/devcontainers/features/tree/main/src/docker-in-docker
#
# Our addition is that we set an entrypoint that starts Docker before the user
# is handed control; see the final notes below.
ARG DIND_VERSION=2.6.0
RUN curl https://raw.githubusercontent.com/devcontainers/features/feature_docker-in-docker_${DIND_VERSION}/src/docker-in-docker/install.sh -o /tmp/install_dind.sh \
  && chmod +x /tmp/install_dind.sh \
  && /tmp/install_dind.sh \
  && rm /tmp/install_dind.sh

### Non-root user.
#
# This follows suggestions from:
#   https://code.visualstudio.com/remote/advancedcontainers/add-nonroot-user
ARG USERNAME=dev
# ATTENTION: the following UID and GID are NOT the final values. They will have
#            to be adjusted at container startup-time, to match the UID and GID
#            of the user running the container. If we don't then the user inside
#            the container will read/write mounted volumes (like the working
#            directory) with different permissions/ownership than the user
#            outside the container, which leads to all sorts of nasty problems.
#            In a Dev Container, this is handled by the Dev Container CLI
#            (and/or VSCode). In a standalone container, this is handled by the
#            `container-startup.sh` script loaded above.
#
# This not-quite-final UID/GID situation has a lot of impact on how we set up
# the rest of this container: changing a UID/GID involves (as a fixed part of
# `usermod --uid`) a `chown -R /home/$USERNAME`. That process would be VERY
# time-consuming (prohibitively so at container-start-time) if file-rich tools
# like `npm` and `pip` (and especially the packages installed by them) were
# present in the user's home directory. We therefore install those tools
# globally.
ARG UID=1000
ARG GID=1000

# Ensure presence of relevant system groups.
RUN groupadd -f --system docker
RUN groupadd -f --system ssh
RUN groupadd -f --system wheel

# Use Codespace tooling to improve the "livability" of this image. Amongst other
# things this creates a non-root user and sets up good integration between
# VSCode and `git`.
#
# For reference of options, see:
#   https://github.com/microsoft/vscode-dev-containers/blob/v0.209.6/containers/ubuntu/.devcontainer/base.Dockerfile
# For reference on script run, see:
#   https://github.com/microsoft/vscode-dev-containers/tree/main/script-library
# For further info, see:
#   https://github.com/microsoft/vscode-dev-containers/blob/main/script-library/docs/docker.md
#
# Default to bash shell and set env var for the docker-init we are about to
# start.
ENV SHELL=/bin/bash
ENV DOCKER_BUILDKIT=1
ARG VSCODE_SCRIPTS_COMMIT=ef146121026c67d41bbca80d9af482f20f89f9e0
# Some users prefer `zsh` over `bash`. We're happy to support that.
ARG INSTALL_ZSH=true
# We're happy with the versions of the packages that we have.
ARG UPGRADE_PACKAGES=false
# Do NOT install `oh-my-zsh` - it puts a lot of files in the user's home
# directory, which will cause a LONG delay when `chown`ing that directory if the
# user's UID/GID need to change at startup-time (see comments above).
ARG INSTALL_OH_MYS=false
RUN apt-get update && export DEBIAN_FRONTEND=noninteractive  \
  && bash -c "$(curl -fsSL "https://raw.githubusercontent.com/microsoft/vscode-dev-containers/${VSCODE_SCRIPTS_COMMIT}/script-library/common-debian.sh")" \
  -- "${INSTALL_ZSH}" "${USERNAME}" "${UID}" "${GID}" "${UPGRADE_PACKAGES}" "${INSTALL_OH_MYS}" \
  # Clean up, leaving a smaller layer.
  && rm -rf /var/lib/apt/lists/*

# Finish setting up user account:
# * Enable password-less `sudo` for users in group `wheel`; and...
# * Add users to relevant groups for `ssh`, `docker` and `sudo`.
RUN echo '%wheel ALL=(ALL) NOPASSWD:ALL' >> /etc/sudoers
RUN usermod -a -G ssh,docker,wheel ${USERNAME}
WORKDIR /home/$USERNAME

# Create a writable working directory for the developer. This point is moot when
# using a Dev Container (it does that for you), but is important when using a
# standalone (non-Dev-Container) image.
RUN mkdir -p /workspaces \
  && chown -R $USERNAME /workspaces

# Install GitHub CLI through Codespace's preferred mechanism.
# https://github.com/microsoft/vscode-dev-containers/blob/main/script-library/docs/github-cli.md
RUN apt-get update && export DEBIAN_FRONTEND=noninteractive  \
  && bash -c "$(curl -fsSL "https://raw.githubusercontent.com/microsoft/vscode-dev-containers/main/script-library/github-debian.sh")" \
  # Clean up, leaving a smaller layer.
  && rm -rf /var/lib/apt/lists/*


################### Reboot-specific tooling #####################
# The following sections make the container suitable for Reboot development.

### Python + ecosystem.
# Reboot is built on Python, so we need to install Python and some of its
# surrounding tools.
#
# Jammy's default Python version is 3.10, which is also Reboot's minimum
# Python version.
ARG PYTHON_VERSION=3.10

# Installs:
# * `python3` itself.
# * `python3-venv` to let Python tools create virtual environments.
# * `python3-pip` to allow installing of python packages.
# * `python3-dev` to allow PyPI source packages to build their wheel (essential
#                 for e.g. `psutil` on MacOS).
# * `build-essential` to allow PyPI source packages to build their wheel.
# * `python-is-python3` to make sure we're using python3 (not python2).
RUN apt-get update && apt-get install -y --no-install-recommends \
  python3 \
  python3-venv \
  python3-pip \
  python3-dev \
  build-essential \
  python-is-python3 \
  # Confirm that python3 is installed and that it has the expected version.
  && python3 --version | grep -Eq "^Python ${PYTHON_VERSION}.*" \
  # And that "python" (aka python3) is installed and has the expected version.
  && python --version | grep -Eq "^Python ${PYTHON_VERSION}.*" \
  # Clean up, leaving a smaller layer.
  && rm -rf /var/lib/apt/lists/*

# Install tooling useful to Python developers.
RUN pip install mypy==1.18.1

# Add the user's local bin directory to the PATH. Nothing is installed there
# _yet_, but given that the user won't have permissions to write to the system's
# bin directories, `pip` will place future user-installed scripts there.
RUN echo "export PATH=/home/$USERNAME/.local/bin:\$PATH" >> /home/$USERNAME/.bashrc

### Node.js + ecosystem.
# We obtain Node via the Node Version Manager (to allow us to easily switch Node
# versions), following these instructions:
#   https://github.com/nvm-sh/nvm#installing-and-updating
ARG NVM_VERSION=0.39.5
ARG NODE_MAJOR_VERSION=20
ARG NVM_DIR=/usr/local/nvm

RUN mkdir $NVM_DIR && \
  curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v${NVM_VERSION}/install.sh | NVM_DIR="$NVM_DIR" bash && \
  . "$NVM_DIR/nvm.sh" && \
  nvm install ${NODE_MAJOR_VERSION}

# Have the non-root user load `nvm` on login.
RUN echo ". $NVM_DIR/nvm.sh" >> /home/$USERNAME/.bashrc

# Install Rye as the target user. We configure rye to use uv and to only install
# Python inside of a project directory.
USER $USERNAME
RUN curl -sSf https://raw.githubusercontent.com/astral-sh/rye/main/scripts/install.sh | RYE_VERSION="0.31.0" RYE_INSTALL_OPTION="--yes" bash \
    && "$HOME/.rye/shims/rye" config --set-bool behavior.use-uv=true \
    && "$HOME/.rye/shims/rye" config --set-bool behavior.global-python=false

# Bazel's `--incompatible_strict_action_env` causes a hardcoded PATH to be used which
# does not include the path where `rye` is installed. Rather than changing Bazel's PATH,
# we ensure that `rye` is accessible on it.
# TODO: See https://github.com/reboot-dev/mono/issues/2652.
RUN sudo ln -s "$HOME/.rye/shims/rye" /usr/local/bin/rye
RUN echo "source \"$HOME/.rye/env\"" >> "$HOME/.bashrc"
# Then return to root.
USER root

################### Container startup sequence, ONLY for non-Dev-Container #######################

# This section is ONLY relevant for non-Dev-Container images. Dev Containers
# override the entrypoint we set below and instead manage the same functionality
# in their own way.
#
# When the container starts (as root), it needs to do a few things:
# 1. Switch the UID/GID of the non-root user we created above to match the
#    UID/GID of the host system's user.
# 2. Start Docker.
# 3. Hand control to the non-root user, running whatever command they requested.
COPY container-startup.sh /usr/local/share/
ENTRYPOINT ["/usr/local/share/container-startup.sh"]

# If the user doesn't request any other command, give them a shell.
CMD ["/bin/bash"]

