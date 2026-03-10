# Keep in sync with top-level `Dockerfile` and `reboot/settings.py`.
ARG ENVOY_VERSION=1.30.2

FROM envoyproxy/envoy:v${ENVOY_VERSION}

### Reboot requirements.
# Reboot is built on Python and Node.js, so we need to install those.

# Ubuntu Jammy's default Python version is 3.10, which is also Reboot's
# required Python version.
ARG PYTHON_VERSION=3.10

# Installs:
# * `curl` to support installation of `nvm` (below).
# * `python3` itself.
# * `python3-pip` to allow installing of python packages.
# * `python3-dev` and `build-essential` to allow `node-gyp` to build native Node
#                 modules, notably `@reboot-dev/reboot`.
# * `python-is-python3` to make sure we're using python3 (not python2).
# * `tini` to provide an entrypoint with proper signal handling in the
#         container, which is important for graceful shutdowns and
#         proper handling of signals like `SIGTERM` and `SIGINT`.
# * `git` since the Reboot CLI relies on it to do its `.rbtrc` logic.
#
# TODO(rjh): we can probably reduce the final image size somewhat if we do
#            multi-stage builds, in which e.g. `python3-dev` and
#            `build-essential` are only installed during a build stage, and are
#            absent in the final runtime container - at the expense of a more
#            complex Dockerfile.
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    python3 \
    python3-pip \
    python3-dev \
    build-essential \
    python-is-python3 \
    tini \
    git \
    # Confirm that python3 is installed and that it has the expected version.
    && python3 --version | grep -Eq "^Python ${PYTHON_VERSION}.*" \
    # And that "python" (aka python3) is installed and has the expected version.
    && python --version | grep -Eq "^Python ${PYTHON_VERSION}.*" \
    # Clean up, leaving a smaller layer.
    && rm -rf /var/lib/apt/lists/*

# Passed in by the `reboot-base` build script.
ARG REBOOT_VERSION
ARG REBOOT_WHL_FILE_NAME

# We must use 'ENV' (rather than 'export' or writing to the '.bashrc' file)
# to be able to use an environment variable in non-interactive shell sessions.
ENV REBOOT_WHL_FILE=${REBOOT_WHL_FILE_NAME}
ENV REBOOT_BASE_IMAGE_VERSION=${REBOOT_VERSION}

# We obtain Node via the Node Version Manager, following these instructions:
#   https://github.com/nvm-sh/nvm#installing-and-updating
ARG NVM_VERSION=0.39.5
ARG NODE_VERSION=20.19.0
ARG NVM_DIR=/usr/local/nvm

RUN mkdir $NVM_DIR && \
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v${NVM_VERSION}/install.sh | \
    NVM_DIR="$NVM_DIR" PROFILE=/dev/null bash && \
    . "$NVM_DIR/nvm.sh" && \
    nvm install ${NODE_VERSION}

# Add the Node.js binary to the `PATH`, but also keep the original `PATH`.
# Both the Python and Node.js Reboot packages provide an `rbt` binary, and both
# will be installed in this base container. The Python binary should be used by
# default in a terminal (therefore must continue to be first in the `PATH`)
# while for the Node.js variant users will run `npx rbt ...`, which will locate
# its 'rbt' binary in the `node_modules/` directory.
ENV PATH="${PATH}:${NVM_DIR}/versions/node/v${NODE_VERSION}/bin/"

WORKDIR /build

### Install the Reboot unpublished packages.
#
# During Reboot's own development, we may have unpublished Reboot packages
# that we'd like to test. We place these in the following
# directory and install them. Because we also pin the version of
# the package in the constraint file (see below), we are confident
# that a later `pip install` of the user's `requirements.txt` won't
# override this installation.
#
# Since the following COPY uses a wildcard Docker is OK with the directory not
# existing at all, or being empty. The COPY will simply do nothing in those
# cases.
#
# We put both unpublished Python wheel file and unpublished @reboot-dev/reboot
# *.tgz file in the .unpublished-reboot-libraries/ directory.
COPY .unpublished-*-libraries/* .unpublished-reboot-libraries/

# We pin the version of `reboot` that `pip` will allow installation of,
# to ensure that any subsequent `pip install` in the user's `Dockerfile` will
# not change the version of `reboot` that is installed. It also ensures
# that any provided unpublished `*.whl` file has the expected version.
RUN echo "reboot==${REBOOT_VERSION}" > /build/constraints.txt
ENV PIP_CONSTRAINT=/build/constraints.txt

# If `.unpublished-reboot-libraries/*.whl` was empty or did not exist, the following
# `ls` will fail and instead of `pip install`ing the unpublished package we will
# `pip install` the PYPI released one.
RUN (ls .unpublished-reboot-libraries/*.whl && pip install .unpublished-reboot-libraries/*.whl) \
    || pip install reboot==$REBOOT_VERSION

# TODO: already run a "warmup" of `rbt generate` (e.g. `rbt generate
# --prepare-only`) to install the required NPM packages now, saving our
# customers time on every `docker build`.

# Envoy's default entrypoint would run the customer-supplied `CMD` under
# the `envoy` user. Some serving platforms (e.g. Fly.io) mount volumes
# in the expectation that we are `root`. We must therefore override the
# entrypoint with a custom one that runs as `root`.
ENTRYPOINT ["/usr/bin/tini", "--"]
