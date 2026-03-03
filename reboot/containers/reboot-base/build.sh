#!/bin/bash

set -e # Exit if a command exits with an error.
set -u # Treat expanding an unset variable as an error.

if [ -z "${REBOOT_VERSION:-}" ]; then
    echo "REBOOT_VERSION is not set. We tag the Docker image with the version of the Reboot library used to build it. Please set REBOOT_VERSION to the version of the Reboot library you are using."
    exit 1
fi

CPU_ARCH=$(uname -m)
if [ "$CPU_ARCH" != "x86_64" ] && [ "$CPU_ARCH" != "arm64" ] && [ "$CPU_ARCH" != "aarch64" ]; then
    echo "Unsupported CPU architecture: $CPU_ARCH"
    exit 1
fi

DOCKER_IMAGE_NAME="ghcr.io/reboot-dev/reboot-base:$REBOOT_VERSION"

# The following is a helper that lets the 'reboot-base' Docker image use
# unpublished versions of the Reboot library.
absolute_whl_path=""
if [ -v REBOOT_WHL_FILE ]; then
  absolute_whl_path=$(readlink --canonicalize-existing $REBOOT_WHL_FILE)
fi

absolute_npm_package_path=""
if [ -v REBOOT_NPM_PACKAGE ]; then
  absolute_npm_package_path=$(readlink --canonicalize-existing $REBOOT_NPM_PACKAGE)
fi

absolute_api_npm_package_path=""
if [ -v REBOOT_API_NPM_PACKAGE ]; then
  absolute_api_npm_package_path=$(readlink --canonicalize-existing $REBOOT_API_NPM_PACKAGE)
fi

# Since Docker can't follow symlinks to files outside the build context, we
# can't build the Docker image in a directory where the Dockerfile is a symlink.
# That situation occurs when e.g. running this test on Bazel. Follow the symlink
# back to the original directory and build from there.
pushd $(dirname $(readlink --canonicalize ./reboot/containers/reboot-base/Dockerfile ))
  # Make sure there are no leftover wheels from previous builds that may have
  # used 'REBOOT_WHL_FILE'.
  rm -rf ./.unpublished-reboot-libraries/

  if [[ "$PUSH_REBOOT_BASE" == "true" ]]; then
    # We want to release a multiarch Docker image for 'reboot-base'
    # to provide the same name for linux/amd64 and linux/arm64.
    # We can do that release *only* when both linux/amd64 and linux/arm64
    # wheels files are available on PYPI, otherwise the following will fail.
    BUILDER_NAME="multiarch-builder"

    # Register the binfmt_misc handlers for the QEMU emulators.
    # This is needed to build multiarch images on non-native architectures.
    docker run --privileged --rm tonistiigi/binfmt --install all

    if ! docker buildx inspect "${BUILDER_NAME}" >/dev/null 2>&1; then
      echo "Creating new builder: ${BUILDER_NAME}"
      docker buildx create --use --name "${BUILDER_NAME}" --driver docker-container
    else
      echo "Reusing existing builder: ${BUILDER_NAME}"
      docker buildx use "${BUILDER_NAME}"
    fi

    docker buildx inspect --bootstrap

    docker buildx build \
        --platform linux/amd64,linux/arm64 \
        -t "$DOCKER_IMAGE_NAME" \
        --build-arg REBOOT_VERSION=$REBOOT_VERSION \
        --push \
        .

    echo "Release complete!"
    exit 0
  fi

  extra_build_args=""

  if [ -v REBOOT_WHL_FILE ]; then
    # Place the wheel package in a place where the Docker build process can
    # reach it. That means placing it in the build context, meaning the
    # directory containing the `Dockerfile`, or a subdirectory. We'll create
    # the '.unpublished-reboot-libraries' directory for this purpose, if it does not
    # exist yet.
    mkdir -p ./.unpublished-reboot-libraries
    cp "$absolute_whl_path" ./.unpublished-reboot-libraries/
    # Make sure the wheel is readable by the Docker build process, and
    # overwritable by ourselves for future builds.
    chmod 664 ./.unpublished-reboot-libraries/*.whl
    extra_build_args="--build-arg REBOOT_WHL_FILE_NAME=/build/.unpublished-reboot-libraries/$(basename $REBOOT_WHL_FILE)"
  fi

  if [ -v REBOOT_NPM_PACKAGE ]; then
    mkdir -p ./.unpublished-reboot-libraries
    cp -r "$absolute_npm_package_path" ./.unpublished-reboot-libraries/
    chmod 664 ./.unpublished-reboot-libraries/*.tgz
  fi

  if [ -v REBOOT_API_NPM_PACKAGE ]; then
    mkdir -p ./.unpublished-reboot-libraries
    cp -r "$absolute_api_npm_package_path" ./.unpublished-reboot-libraries/
    chmod 664 ./.unpublished-reboot-libraries/*.tgz
  fi

  # Build the Docker image with this machine's specific Reboot library
  # version and CPU architecture.
  docker build \
      -t $DOCKER_IMAGE_NAME \
      --build-arg REBOOT_VERSION=$REBOOT_VERSION \
      $extra_build_args \
      .

popd
