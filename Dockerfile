# This Dockerfile defines a number of images, namely:
#
# respect-current-minimum:
#   A common base image, containing the minimum needed for running our code.
#   In the future this image might be merged with `respect-build-common` if we
#   base `respect-base-image` on a different (more lightweight) image.
#
# respect-base-image:
#   The image we use in `bazel` as our base image. This is the one we ship and
#   move around in our cluster.
#
# respect-build-common:
#   Adds all the tooling necessary to actually build and deploy respect. This
#   serves as the base image for our development.
#
# codespace-workstation:
#   The image extends `respect-build-common` and adds all the github specific
#   modifications and hooks that allow us to use it with codespaces.
#
# reboot-envoy:
#   Used when we run Envoy in a Docker container. Based on the upstream
#   istio/proxyv2 image, with some minor extensions.

# The following ARGs must be defined before the first FROM, since they'll
# parameterize a FROM.

# Latest version as of 2025-02-06. Keep in sync with `ISTIO_VERSION` in
# `infrastructure/clusters/resources/istio.py`.
ARG ISTIO_VERSION=1.29.0

# This version should match `ENVOY_VERSION` in
# `public/reboot/settings.py` and
# `reboot/containers/reboot-base/Dockerfile`.
ARG ENVOY_VERSION=1.30.2

# Clang version used for C++ compilation on the host and in the
# manylinux-builder container.
ARG CLANG_VERSION=20

###############################################################################
# Use a specific ubuntu version so we're not surprised by silent changes to gcc
# versions (and thus C++ feature support). We additionally care about the `glibc`
# version which is in use, as it becomes a minimum version in our `manylinux`
# published wheels.

# Jammy comes with:
# * gcc 11
# * glibc 2.35
FROM ubuntu:jammy-20251001 AS respect-current-minimum

ARG TARGETARCH

# Ubuntu Jammy does not have Python installed, so we use the ppa to install it.
ARG PYTHON_VERSION=3.10

# Install tzdata package to provide timezone files that tzlocal depends on.
# Without this, /etc/localtime symlink to /usr/share/zoneinfo/Etc/UTC breaks,
# causing "tzlocal() does not support non-zoneinfo timezones" errors.
RUN apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    curl gpg gpg-agent software-properties-common tzdata \
    && rm -rf /var/lib/apt/lists/*

RUN add-apt-repository ppa:deadsnakes/ppa \
    && apt-get update \
    && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    python${PYTHON_VERSION} \
    python${PYTHON_VERSION}-dev \
    python${PYTHON_VERSION}-venv \
    && rm -rf /var/lib/apt/lists/*

RUN update-alternatives --install /usr/bin/python usr-bin-python /usr/bin/python${PYTHON_VERSION} 3 \
    && update-alternatives --install /usr/local/bin/python usr-local-bin-python /usr/bin/python${PYTHON_VERSION} 3 \
    && update-alternatives --install /usr/local/bin/python3 usr-local-bin-python3 /usr/bin/python${PYTHON_VERSION} 3 \
    # Confirm that python3 is installed and that it has the expected version.
    && python3 --version | grep -Eq "^Python ${PYTHON_VERSION}.*" \
    # And that "python" (aka python3) is installed and has the expected version.
    && python --version | grep -Eq "^Python ${PYTHON_VERSION}.*"

# Ensure pip is installed and up to date.
RUN curl -sS https://bootstrap.pypa.io/get-pip.py | python \
    && update-alternatives --install /usr/local/bin/pip pip /usr/local/bin/pip3 3

ENV TINI_VERSION=v0.19.0
ADD https://github.com/krallin/tini/releases/download/${TINI_VERSION}/tini-${TARGETARCH} /usr/bin/tini
RUN chmod +x /usr/bin/tini

# Installs `wget` and `curl` to aid debugging and to install other
# tools, with ca-certificates to make https calls. The `tini` package is
# installed to help with signal handling in the container. Git is used by `rbt` and
# must be on the PATH.
RUN apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    ca-certificates \
    wget \
    curl \
    git \
    && rm -rf /var/lib/apt/lists/*

# Install `grpcurl`, which is very helpful for debugging. See:
#   https://github.com/fullstorydev/grpcurl
ARG GRPCURL_VERSION=1.9.2
RUN if [ "${TARGETARCH}" = "amd64" ]; then \
    wget https://github.com/fullstorydev/grpcurl/releases/download/v${GRPCURL_VERSION}/grpcurl_${GRPCURL_VERSION}_linux_x86_64.tar.gz \
    && tar -xvf ./grpcurl_${GRPCURL_VERSION}_linux_x86_64.tar.gz grpcurl \
    && rm ./grpcurl_${GRPCURL_VERSION}_linux_x86_64.tar.gz \
    && chmod +x grpcurl \
    && mv ./grpcurl /usr/local/bin/grpcurl; \
    fi

ENTRYPOINT ["/usr/bin/tini", "--"]

###############################################################################
# Create an image that can be used by bazel as the base image.
FROM respect-current-minimum AS respect-base-image
# TODO: The `respect-base-image` is used and shipped a lot. We might want to
# try and slim it down as it dramatically reduces load times in our cluster.
# Using an alpine image did not work, but the difference between 10s of MBs vs
# 100s of MB is significant! Especially as images are currently aggressively
# copied around our cluster (3 containers) and for every images (typically ~7).
# There is no reason that `respect-base-image` is based on
# `respect-current-minimum` or a fullblown ubuntu image. There is a lot in
# there we don't need.
#
# NOTE: We can not use `scratch` without at at least adding an empty file. If
# we don't add anything to scratch, docker will complain that the image is
# (indeed) empty.
#
# NOTE: We can not use python:x.y.z-alpine as something or someone is looking
# for python in /usr/bin/python (and similar for python3). This can be
# symlinked away but isn't a sufficient fix. e.g., RUN ln -s
#   /usr/local/bin/python /usr/bin/python RUN ln -s /usr/local/bin/python3
#   /usr/bin/python3
#
# NOTE: Alpine-bazel combo seems to not provide sufficient libraries out of the
# gate. The earliest we blow up is when trying to import psutils and not
# finding it. Maybe this is misconfiguration on our side, but I will not spend
# more time investigating now.


###############################################################################
# Add build tools necessary for building respect.
FROM respect-current-minimum AS respect-build-common

ARG ISTIO_VERSION
ARG TARGETARCH
ARG CLANG_VERSION
ARG ENVOY_VERSION
# Docker version format is Ubuntu-style:
#    [epoch]:[version]-[revision]-[ubuntu-suffix]
ARG DOCKER_VERSION=5:29.1.2-1~ubuntu.22.04~jammy

RUN apt-get update \
    # Install various prerequisite packages need for building as well as
    # packages that aid developing and debugging.
    #
    # As the list/version of packages is not changing too often, we optimize
    # for image layer size and run all `apt` related commands (that includes
    # the invocation of `llvm.sh`) in one `RUN` statement.
    #
    # If you are adding packages to the list below, please add a comment here
    # as well.
    #
    # Additional mandatory packages we install:
    #  * build-essential: get gcc and std headers.
    #  * ca-certificates: dependency for curl to make https calls.
    #  * curl: not strictly needed (while-false: I think) outside of image
    #    building but small (~100kb) and useful for debugging. Might be used
    #    internally by bazel to fetch `http_archives`.
    #  * gnupg: for image and package signing.
    #  * lsb-release: to allow install scripts/(debugging )developers to figure
    #    out what system they are on.
    #  * make: required to build cc_image targets (alexmc: I think!).
    #  * openssh-client: much needed dependency of `git`.
    #  * python3-dev: python source code needed for building grpc bindings.
    #  * python3-distutils: for building and compiling python packages.
    #  * wget: see `curl`.
    #  * jq: used by our tests to parse JSON output from `kubectl`.
    #
    # Additional optional packages we install:
    #  * gdb: debugger
    #  * htop: replacement for top.
    #  * iputils-ping: to get `ping`.
    #  * vim: it's vi improved!
    #
    && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    # Mandatory packages:
    build-essential \
    ca-certificates \
    curl \
    gnupg \
    gnupg-agent \
    apt-transport-https \
    lsb-release \
    make \
    openssh-client \
    python3-dev \
    python3-distutils \
    software-properties-common \
    sudo \
    wget \
    jq \
    # For our build of `lzma` to work, libraries provided by `gettext` are needed.
    gettext \
    # Optional packages:
    bash-completion \
    gdb \
    htop \
    iputils-ping \
    vim \
    zsh \
    # Install clang. Instructions:
    # https://apt.llvm.org/
    && wget -O - https://apt.llvm.org/llvm-snapshot.gpg.key | apt-key add - \
    && add-apt-repository "deb http://apt.llvm.org/jammy/ llvm-toolchain-jammy-${CLANG_VERSION} main" \
    && apt-get update \
    && apt install -y clang-${CLANG_VERSION} \
    # Make clang mean clang-xx.
    && ln -s /usr/bin/clang-${CLANG_VERSION} /usr/bin/clang \
    # Install clang-format and symlink to `clang-format`.
    && DEBIAN_FRONTEND=noninteractive apt-get install -y clang-format-${CLANG_VERSION} \
    && ln -s /usr/bin/clang-format-${CLANG_VERSION} /usr/bin/clang-format \
    # As of ~2023 we also need to explicitly include
    # 'libclang-rt-${CLANG_VERSION}-dev' so that we can
    # build with '--config=asan'.
    && DEBIAN_FRONTEND=noninteractive apt-get install -y libclang-rt-${CLANG_VERSION}-dev \
    # Install Docker from the official Docker repository. Instructions:
    #   https://docs.docker.com/engine/install/ubuntu/#install-using-the-repository
    && install -m 0755 -d /etc/apt/keyrings \
    && curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc \
    && chmod a+r /etc/apt/keyrings/docker.asc \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "${UBUNTU_CODENAME:-$VERSION_CODENAME}") stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null \
    && apt-get update \
    && DEBIAN_FRONTEND=noninteractive apt-get install -y docker-ce=${DOCKER_VERSION} docker-ce-cli=${DOCKER_VERSION} containerd.io docker-buildx-plugin docker-compose-plugin \
    # Cleanup.
    && apt-get purge --auto-remove -y \
    && rm -rf /var/lib/apt/lists/*

# Install Bazel.
ARG BAZELISK_VERSION=v1.27.0
RUN wget -O /usr/local/bin/bazel https://github.com/bazelbuild/bazelisk/releases/download/${BAZELISK_VERSION}/bazelisk-linux-${TARGETARCH} \
    && chmod +x /usr/local/bin/bazel

# Install k3d.io which we'll use to run integration tests.
# See https://k3d.io/v5.8.3/#install-specific-release
ARG K3D_VERSION=v5.8.3
RUN curl -s https://raw.githubusercontent.com/k3d-io/k3d/main/install.sh | TAG=${K3D_VERSION} bash
# The version of Kubernetes used by k3d is determined by the version of k3s it
# installs, which is determined by the version of k3d. Confirm that the expected
# Kubernetes version is indeed that k3d's default.
ARG KUBERNETES_VERSION=v1.31.5
RUN k3d version | grep -q "k3s version ${KUBERNETES_VERSION}-k3s"

# Install kubectl which we'll use to run integration tests. Must be compatible
# (+/- 1 version) with the Kubernetes used by the k3d installation above.
# See https://kubernetes.io/docs/tasks/tools/install-kubectl-linux/#install-kubectl-binary-with-curl-on-linux
ARG KUBECTL_VERSION=$KUBERNETES_VERSION
RUN curl -LO  https://dl.k8s.io/release/${KUBECTL_VERSION}/bin/linux/${TARGETARCH}/kubectl \
    && chmod +x kubectl \
    && mv kubectl /usr/local/bin/kubectl

# Install Istio.
# See https://istio.io/latest/docs/setup/getting-started/
RUN curl -L https://istio.io/downloadIstio | ISTIO_VERSION=${ISTIO_VERSION} sh - \
    && mv istio-${ISTIO_VERSION}/bin/istioctl /usr/local/bin/istioctl \
    && chmod +x /usr/local/bin/istioctl \
    && rm -rf istio-${ISTIO_VERSION}

# Install Skaffold as per instructions here:
#   https://skaffold.dev/docs/install/
# Latest version as of 2023-04-17.
ARG SKAFFOLD_VERSION=2.3.1
RUN curl -Lo skaffold https://storage.googleapis.com/skaffold/releases/v${SKAFFOLD_VERSION}/skaffold-linux-${TARGETARCH} \
    && chmod +x skaffold && mv skaffold /usr/local/bin/

# Skaffold will call kustomize via the `kustomize build` command; however, we
# get our `kustomize` from `kubectl kustomize`. So we need to alias `kustomize
# build` to `kubectl kustomize` in a way that works for all users of the system.
# We do this via a small wrapper script.
COPY .devcontainer/kustomize_wrapper.sh /usr/local/bin/kustomize

# Install crane based on instructions here:
#   https://github.com/google/go-containerregistry/tree/main/cmd/crane#install-from-releases
# We use crane to move container images built by Bazel into Kubernetes clusters.
# Latest version as of 2023-08-29.
ARG CRANE_VERSION=0.16.1
RUN set -e; \
    if [ "${TARGETARCH}" = "amd64" ]; then \
    ARCH_SUFFIX="x86_64"; \
    elif [ "${TARGETARCH}" = "arm64" ]; then \
    ARCH_SUFFIX="arm64"; \
    else \
    echo "Unsupported arch: ${TARGETARCH}" && exit 1; \
    fi; \
    curl -sL "https://github.com/google/go-containerregistry/releases/download/v${CRANE_VERSION}/go-containerregistry_linux_${ARCH_SUFFIX}.tar.gz" > go-containerregistry.tar.gz \
    && tar -zxvf go-containerregistry.tar.gz -C /usr/local/bin/ crane \
    && rm go-containerregistry.tar.gz

# Install the Groundcover CLI based on instructions here:
#   https://github.com/groundcover-com/cli#from-the-binary-releases
ARG GROUNDCOVER_VERSION=0.21.0
RUN curl -SsL https://github.com/groundcover-com/cli/releases/download/v${GROUNDCOVER_VERSION}/groundcover_${GROUNDCOVER_VERSION}_linux_${TARGETARCH}.tar.gz -o /tmp/groundcover.tar.gz \
    && tar -zxf /tmp/groundcover.tar.gz -C /usr/bin \
    && chmod +x /usr/bin/groundcover

# Install the Envoy binary, so we can run the tests that use
# local-binary Envoy rather than Docker-based Envoy.
RUN set -e; \
    if [ "${TARGETARCH}" = "amd64" ]; then \
    ARCH_SUFFIX="x86_64"; \
    elif [ "${TARGETARCH}" = "arm64" ]; then \
    ARCH_SUFFIX="aarch_64"; \
    else \
    echo "Unsupported arch: ${TARGETARCH}" && exit 1; \
    fi; \
    BINARY_NAME="envoy-${ENVOY_VERSION}-linux-${ARCH_SUFFIX}"; \
    wget https://github.com/envoyproxy/envoy/releases/download/v${ENVOY_VERSION}/${BINARY_NAME}; \
    chmod +x ${BINARY_NAME}; \
    mv ${BINARY_NAME} /usr/local/bin/envoy

# Ensure presence of relevant system groups.
RUN groupadd -f --system docker
RUN groupadd -f --system ssh
RUN groupadd -f --system wheel


###############################################################################
# Create the image for our github codespaces. Most of the content here is taken
# from various microsoft and github resources linked below.
FROM respect-build-common AS codespace-workstation

ARG TARGETARCH

# Register relevant parameters for user creation.
ARG UNAME=vscode
ARG UID=1000
ARG GID=1000

# Codespace'ify this image
# Download script and run it with vscode options.
# For reference of options, see:
#   https://github.com/microsoft/vscode-dev-containers/blob/v0.209.6/containers/ubuntu/.devcontainer/base.Dockerfile
# For reference on script run, see:
#   https://github.com/microsoft/vscode-dev-containers/tree/main/script-library
# For further info, see:
#   https://github.com/microsoft/vscode-dev-containers/blob/main/script-library/docs/docker.md
#
# Default to bash shell and set env var for the docker-init we are about to
# start.
ENV SHELL=/bin/bash \
    DOCKER_BUILDKIT=1

ARG VSCODE_SCRIPTS_COMMIT=ef146121026c67d41bbca80d9af482f20f89f9e0
RUN apt-get update && export DEBIAN_FRONTEND=noninteractive  \
    && apt-get -y install --no-install-recommends curl ca-certificates \
    && bash -c "$(curl -fsSL "https://raw.githubusercontent.com/microsoft/vscode-dev-containers/${VSCODE_SCRIPTS_COMMIT}/script-library/common-debian.sh")" -- "true" "${UNAME}" "${UID}" "${GID}" "true" \
    && apt-get clean -y && rm -rf /var/lib/apt/lists/*

# Finish setting up user account:
# * enable password-less sudo for users in group `wheel`; and
# * add users to relevant groups for ssh, docker and sudo.
RUN echo '%wheel ALL=(ALL) NOPASSWD:ALL' >> /etc/sudoers
RUN usermod -a -G ssh,docker,wheel ${UNAME}

# Set entrypoint and command as part of the codespaceifying. See links above.
ENTRYPOINT ["/usr/local/share/ssh-init.sh", "/usr/local/share/docker-init.sh"]
CMD ["sleep", "infinity"]

# Install GitHub CLI through Codespace's preferred mechanism.
# https://github.com/microsoft/vscode-dev-containers/blob/main/script-library/docs/github-cli.md
RUN apt-get update && export DEBIAN_FRONTEND=noninteractive  \
    && bash -c "$(curl -fsSL "https://raw.githubusercontent.com/microsoft/vscode-dev-containers/main/script-library/github-debian.sh")" \
    && rm -rf /var/lib/apt/lists/*

# Ensure we have the most up to date version of the public key for
# 'https://cli.github.com/packages' since it has changed.
#
# See 'https://github.com/cli/cli/issues/6175' as well as the
# instructions for getting the most up to date public key from:
# https://github.com/cli/cli/commit/23933fd527b9f0e96faab24ac8ede8f8d9233448
#
# TODO(benh): do we need this once/if the 'FROM' gets updated correctly?
#
# TODO(gorm,rjh): try out whether this is still needed.
RUN curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg \
    && chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | tee /etc/apt/sources.list.d/github-cli.list > /dev/null

# Install buildifier from this releases page:
#   https://github.com/bazelbuild/buildtools/releases
#
# We use the latest Buildifier version that matches our Bazel major version.
ARG BUILDIFIER_VERSION=6.4.0
RUN wget https://github.com/bazelbuild/buildtools/releases/download/v${BUILDIFIER_VERSION}/buildifier-linux-${TARGETARCH} \
    && chmod +x ./buildifier-linux-${TARGETARCH} \
    && mv ./buildifier-linux-${TARGETARCH} /usr/local/bin/buildifier

# Install `npm` as per these installation instructions:
#   https://github.com/nodesource/distributions#installation-instructions
# Note: We need this to install prettier.
ARG NODE_MAJOR=20
ARG NPM_VERSION=11.5.1
RUN mkdir -p /etc/apt/keyrings \
    && curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg \
    && echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_$NODE_MAJOR.x nodistro main" | tee /etc/apt/sources.list.d/nodesource.list \
    && apt-get update \
    && DEBIAN_FRONTEND=noninteractive apt-get install -y nodejs \
    && npm install -g npm@${NPM_VERSION} \
    && rm -rf /var/lib/apt/lists/*

# Install prettier, markdown-autodocs, and ibazel (a tool for automatically
# rebuilding Bazel targets when their sources/dependencies change).
ARG PRETTIER_VERSION=2.7.1
ARG MARKDOWN_AUTODOCS_VERSION=1.0.133
ARG IBAZEL_VERSION=0.26.10
RUN npm install -g prettier@${PRETTIER_VERSION} markdown-autodocs@${MARKDOWN_AUTODOCS_VERSION} @bazel/ibazel@${IBAZEL_VERSION}

# Install bash-completion so tab autocomplete works for git and other commands.
RUN apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install bash-completion -y \
    && rm -rf /var/lib/apt/lists/*

# Install...
#  * `yapf`, `mypy`, `isort` and `ruff` for linting and formatting of Python
#    code. Keep the version of `mypy` in sync with `mypy-requirements.in`.
#  * `build`, Python's package-builder-frontend.
#  * `uv`, a fast Python package installer and resolver.
RUN pip install yapf==0.40.2 mypy==1.18.1 isort==5.12.0 ruff==0.1.14 build==1.0.3 uv==0.9.18

# Install and setup fish (shell used on codespaces).
# NOTE: We do this as it is done here:
#  https://github.com/devcontainers/images/blob/main/src/universal/.devcontainer/Dockerfile
# ...but, it is unclear if it is needed.
# TODO(gorm,rjh): try out whether this is still needed.
RUN apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -yq fish \
    && FISH_PROMPT="function fish_prompt\n    set_color green\n    echo -n (whoami)\n    set_color normal\n    echo -n \":\"\n    set_color blue\n    echo -n (pwd)\n    set_color normal\n    echo -n \"> \"\nend\n" \
    && printf "$FISH_PROMPT" >> /etc/fish/functions/fish_prompt.fish \
    && printf "if type code-insiders > /dev/null 2>&1; and not type code > /dev/null 2>&1\n  alias code=code-insiders\nend" >> /etc/fish/conf.d/code_alias.fish \
    && rm -rf /var/lib/apt/lists/*

# Install Chrome - needed for @io_bazel_rules_webtesting.
# We need 'google-chrome-stable' for test purposes, we do not run tests on arm64
# (currently).
RUN if [ "${TARGETARCH}" = "amd64" ]; then \
    wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | apt-key add - \
    && sh -c 'echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google.list' \
    && apt-get update -qqy \
    && DEBIAN_FRONTEND=noninteractive apt-get install -qqy google-chrome-stable; \
    fi

# Install the AWS command line tool. AWS apparently does not provide different
# packages for their specific CLI versions, but they guarantee backwards
# compatibility throughout the major version:
#   https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html
RUN set -e; \
    if [ "${TARGETARCH}" = "amd64" ]; then \
    ARCH_SUFFIX="x86_64"; \
    elif [ "${TARGETARCH}" = "arm64" ]; then \
    ARCH_SUFFIX="aarch64"; \
    else \
    echo "Unsupported arch: ${TARGETARCH}" && exit 1; \
    fi; \
    curl "https://awscli.amazonaws.com/awscli-exe-linux-${ARCH_SUFFIX}.zip" -o "awscliv2.zip" \
    && unzip awscliv2.zip \
    && ./aws/install \
    && rm awscliv2.zip

# Install `aws-iam-authenticator`, which `kubectl` uses to authenticate with
# AWS.
ARG AWS_IAM_AUTHENTICATOR_VERSION=0.6.11
RUN curl -Lo aws-iam-authenticator https://github.com/kubernetes-sigs/aws-iam-authenticator/releases/download/v${AWS_IAM_AUTHENTICATOR_VERSION}/aws-iam-authenticator_${AWS_IAM_AUTHENTICATOR_VERSION}_linux_${TARGETARCH} \
    && chmod +x ./aws-iam-authenticator \
    && mv ./aws-iam-authenticator /usr/local/bin/

# Install Pulumi, an Infrastructure-as-Code tool.
#
# Even if we don't use Pulumi CLI directly as humans, the Pulumi SDK (used by
# our code) requires that it is present.
ARG PULUMI_VERSION=3.220.0
RUN set -e; \
    if [ "${TARGETARCH}" = "amd64" ]; then \
    ARCH_SUFFIX="x64"; \
    elif [ "${TARGETARCH}" = "arm64" ]; then \
    ARCH_SUFFIX="arm64"; \
    else \
    echo "Unsupported arch: ${TARGETARCH}" && exit 1; \
    fi; \
    ARCHIVE_NAME="pulumi-v${PULUMI_VERSION}-linux-${ARCH_SUFFIX}.tar.gz"; \
    wget https://get.pulumi.com/releases/sdk/${ARCHIVE_NAME} \
    && tar -xvf ${ARCHIVE_NAME} \
    && mv ./pulumi/* /usr/local/bin/ \
    && rm ${ARCHIVE_NAME}

# Install Rye as the target user. We configure rye to use uv, to only install
# Python inside of a project directory, and pre-fetch a few commonly used Python
# versions. (The last is optional but enables the Python versions to be cached
# in the Docker image).
USER $UNAME
RUN curl -sSf https://raw.githubusercontent.com/astral-sh/rye/main/scripts/install.sh | RYE_VERSION="0.31.0" RYE_INSTALL_OPTION="--yes" bash \
    && "$HOME/.rye/shims/rye" config --set-bool behavior.use-uv=true \
    && "$HOME/.rye/shims/rye" config --set-bool behavior.global-python=false \
    && "$HOME/.rye/shims/rye" fetch cpython@3.10.13 \
    && "$HOME/.rye/shims/rye" fetch cpython@3.11.8 \
    && "$HOME/.rye/shims/rye" fetch cpython@3.12.2

# Bazel's `--incompatible_strict_action_env` causes a hardcoded PATH to be used which
# does not include the path where `rye` is installed. Rather than changing Bazel's PATH,
# we ensure that `rye` is accessible on it.
# TODO: See https://github.com/reboot-dev/mono/issues/2652.
RUN sudo ln -s "$HOME/.rye/shims/rye" /usr/local/bin/rye
RUN echo "source \"$HOME/.rye/env\"" >> "$HOME/.bashrc"
# Then return to root.
USER root

# Install Helm.
ARG HELM_VERSION=3.15.4
RUN wget https://get.helm.sh/helm-v${HELM_VERSION}-linux-${TARGETARCH}.tar.gz \
    && tar --to-stdout -xvf ./helm-v${HELM_VERSION}-linux-${TARGETARCH}.tar.gz linux-${TARGETARCH}/helm > /usr/local/bin/helm \
    && rm ./helm-v${HELM_VERSION}-linux-${TARGETARCH}.tar.gz \
    && chmod +x /usr/local/bin/helm

# Install the Helm chart-testing tool.
ARG CHART_TESTING_VERSION=3.11.0
RUN wget https://github.com/helm/chart-testing/releases/download/v${CHART_TESTING_VERSION}/chart-testing_${CHART_TESTING_VERSION}_linux_${TARGETARCH}.tar.gz \
    && tar --to-stdout -xvf ./chart-testing_${CHART_TESTING_VERSION}_linux_${TARGETARCH}.tar.gz ct > /usr/local/bin/ct \
    && rm ./chart-testing_${CHART_TESTING_VERSION}_linux_${TARGETARCH}.tar.gz \
    && chmod +x /usr/local/bin/ct

# Install `pnpm` at a version compatible with our `aspect_rules_js`.
ARG PNPM_VERSION=8.15.8
RUN curl -fsSL https://get.pnpm.io/install.sh | env PNPM_VERSION=${PNPM_VERSION} sh -

# Install additional npm packages: `corepack` in order to get `yarn`, and the
# Firebase CLI.
ARG FIREBASE_VERSION=13.26.0
RUN npm install -g corepack firebase-tools@${FIREBASE_VERSION} \
    && corepack enable

# Install Claude Code. We're not worried about breaking changes in this
# tool (we don't use its API or CLI, it's human-driven) so we don't need
# to pin its version, and in fact leave its default auto-update function
# enabled.
RUN curl -fsSL https://claude.ai/install.sh | bash

###############################################################################
# The following is a partial copy-paste from
# `reboot/containers/reboot-base/Dockerfile`; keep these in sync!
#
# TODO(rjh): instead of copy-pasting, can we share code?
FROM envoyproxy/envoy:v${ENVOY_VERSION} AS reboot-envoy

### Reboot requirements.
# Reboot is built on Python, so we need to install it.

# Ubuntu Jammy's default Python version is 3.10, which is also Reboot's
# required Python version.
ARG PYTHON_VERSION=3.10

# Installs:
# * `curl` to support debugging.
# * `python3` itself.
# * `python3-pip` to allow installing of python packages.
# * `python3-dev` and `build-essential` to allow `node-gyp` to build native Node
#                 modules, notably `@reboot-dev/reboot`.
# * `python-is-python3` to make sure we're using python3 (not python2).
# * `tini` to provide an entrypoint with proper signal handling in the
#         container, which is important for graceful shutdowns and
#         proper handling of signals like `SIGTERM` and `SIGINT`.
# * `git` since the Reboot CLI relies on it to do its `.rbtrc` logic.
# * `netcat-openbsd` to provide `nc` which is used in some of our tests.
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
    netcat-openbsd \
    # Confirm that python3 is installed and that it has the expected version.
    && python3 --version | grep -Eq "^Python ${PYTHON_VERSION}.*" \
    # And that "python" (aka python3) is installed and has the expected version.
    && python --version | grep -Eq "^Python ${PYTHON_VERSION}.*" \
    # Clean up, leaving a smaller layer.
    && rm -rf /var/lib/apt/lists/*

# Envoy's default entrypoint would run the customer-supplied `CMD` under
# the `envoy` user. Some serving platforms (e.g. Fly.io) mount volumes
# in the expectation that we are `root`. We must therefore override the
# entrypoint with a custom one that runs as `root`.
ENTRYPOINT ["/usr/bin/tini", "--"]


########################################################################
# A manylinux-based image for building C++ code with maximum
# compatibility.
#
# This image uses `manylinux_2_34` (glibc 2.34, AlmaLinux 9) as the
# base, which produces binaries compatible with a wide range of Linux
# distributions including Ubuntu 22.04+, Debian 12+, and similar.
#
# We install Clang to match our main build environment, plus Bazel and
# Python 3.10 for building the reboot wheel.
#
# NOTE: because the `manylinux` images have architecture-specific names
#       that don't match Docker's `TARGETARCH` argument we use two
#       `FROM` statements to rename these to `TARGETARCH`-compatible
#       names.
FROM quay.io/pypa/manylinux_2_34_x86_64 AS manylinux-builder-amd64
FROM quay.io/pypa/manylinux_2_34_aarch64 AS manylinux-builder-arm64

# Select the appropriate base image based on `TARGETARCH`.
ARG TARGETARCH
FROM manylinux-builder-${TARGETARCH} AS manylinux-builder

ARG TARGETARCH
ARG CLANG_VERSION

# Install basic build dependencies.
RUN dnf install -y \
    git \
    wget \
    which \
    patch \
    zip \
    unzip \
    && dnf clean all

# Install Clang from the AlmaLinux AppStream repo.
#
# We create symlinks at /usr/lib/llvm-${CLANG_VERSION}/bin/ to match
# the host workstation's paths, so Bazel's auto-detected toolchain works
# in both environments.
RUN dnf install -y clang gcc-c++ && dnf clean all \
    && mkdir -p /usr/lib/llvm-${CLANG_VERSION}/bin \
    && ln -sf /usr/bin/clang /usr/lib/llvm-${CLANG_VERSION}/bin/clang \
    && ln -sf /usr/bin/clang++ /usr/lib/llvm-${CLANG_VERSION}/bin/clang++ \
    && mkdir -p /usr/lib/llvm-${CLANG_VERSION}/lib \
    && ln -sf /usr/lib/clang /usr/lib/llvm-${CLANG_VERSION}/lib/clang

# The `manylinux` image comes with multiple Python versions. We'll use
# 3.10 to match our main build environment. Set up symlinks so `python`
# and `python3` point to Python 3.10.
RUN ln -sf /opt/python/cp310-cp310/bin/python /usr/local/bin/python \
    && ln -sf /opt/python/cp310-cp310/bin/python /usr/local/bin/python3 \
    && ln -sf /opt/python/cp310-cp310/bin/pip /usr/local/bin/pip \
    && ln -sf /opt/python/cp310-cp310/bin/pip /usr/local/bin/pip3

# Install Bazel via Bazelisk.
ARG BAZELISK_VERSION=v1.27.0
RUN set -e; \
    if [ "${TARGETARCH}" = "amd64" ]; then \
    ARCH_SUFFIX="amd64"; \
    elif [ "${TARGETARCH}" = "arm64" ]; then \
    ARCH_SUFFIX="arm64"; \
    else \
    echo "Unsupported arch: ${TARGETARCH}" && exit 1; \
    fi; \
    wget -O /usr/local/bin/bazel https://github.com/bazelbuild/bazelisk/releases/download/${BAZELISK_VERSION}/bazelisk-linux-${ARCH_SUFFIX} \
    && chmod +x /usr/local/bin/bazel

# Install Python build dependencies.
RUN pip install build wheel auditwheel

# Set up environment for Bazel to use Clang.
ENV CC=/usr/bin/clang
ENV CXX=/usr/bin/clang++
# Force include <cstdint> to fix RocksDB build with strict clang 20.
ENV CFLAGS="-include cstdint"
ENV CXXFLAGS="-include cstdint"

# Create a non-root user for running Bazel. rules_python's hermetic
# Python interpreter refuses to run as root.
ARG BUILDER_UID=1000
ARG BUILDER_GID=1000
RUN groupadd -g ${BUILDER_GID} builder \
    && useradd -m -u ${BUILDER_UID} -g ${BUILDER_GID} builder

USER builder
WORKDIR /workspace


########################################################################
# A manylinux-based image for running tests with the built binaries.
#
# This extends `manylinux-builder` by adding the Envoy binary, enabling
# tests to run with `REBOOT_LOCAL_ENVOY_MODE=executable`.
FROM manylinux-builder AS manylinux-runner

ARG TARGETARCH
ARG ENVOY_VERSION

# Switch to root to install Envoy system-wide.
USER root

# Install the Envoy binary for running tests with executable Envoy mode.
RUN set -e; \
    if [ "${TARGETARCH}" = "amd64" ]; then \
    ARCH_SUFFIX="x86_64"; \
    elif [ "${TARGETARCH}" = "arm64" ]; then \
    ARCH_SUFFIX="aarch_64"; \
    else \
    echo "Unsupported arch: ${TARGETARCH}" && exit 1; \
    fi; \
    BINARY_NAME="envoy-${ENVOY_VERSION}-linux-${ARCH_SUFFIX}"; \
    wget https://github.com/envoyproxy/envoy/releases/download/v${ENVOY_VERSION}/${BINARY_NAME}; \
    chmod +x ${BINARY_NAME}; \
    mv ${BINARY_NAME} /usr/local/bin/envoy

# Install Node.js (which includes npm) for running JavaScript-based tests.
RUN dnf install -y nodejs && dnf clean all

# Install Rye for the builder user. We use `sudo` to create a symlink in
# /usr/local/bin so it's accessible on the PATH regardless of the user.
USER builder
RUN curl -sSf https://raw.githubusercontent.com/astral-sh/rye/main/scripts/install.sh | RYE_VERSION="0.31.0" RYE_INSTALL_OPTION="--yes" bash \
    && "$HOME/.rye/shims/rye" config --set-bool behavior.use-uv=true \
    && "$HOME/.rye/shims/rye" config --set-bool behavior.global-python=false

USER root
RUN ln -s /home/builder/.rye/shims/rye /usr/local/bin/rye

# Switch back to the builder user for running tests.
USER builder
