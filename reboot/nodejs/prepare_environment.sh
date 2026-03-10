#!/bin/bash

OS=$(node -p "require('os').platform()")
ARCH=$(node -p "process.arch")

if [[ "$OS" != "darwin" && "$OS" != "linux" ]]; then
  echo "❌ Unsupported OS: $OS. Only 'darwin' and 'linux' are supported."
  exit 1
fi

# See https://gregoryszorc.com/docs/python-build-standalone/main/running.html.
# We use `gnu` (rather than `musl`) because we need a libc that we can install
# our native python extension on.
#
# NOTE: Although that page recommends using `x86_64_v3` for Linux, we have
# encountered CPUs and/or GCC installs which do not support `x86-64-v3` (or v2)
# as the `-march`. Consequently, we use `x86_64` instead.
BASE_URL="https://github.com/indygreg/python-build-standalone/releases/download/20240814/cpython-3.10.14+20240814"

case "${OS}-${ARCH}" in
  'darwin-arm64')
    TAR_URL="${BASE_URL}-aarch64-apple-darwin-install_only.tar.gz"
    ;;
  'darwin-x64')
    TAR_URL="${BASE_URL}-x86_64-apple-darwin-install_only.tar.gz"
    ;;
  'linux-arm64')
    TAR_URL="${BASE_URL}-aarch64-unknown-linux-gnu-install_only.tar.gz"
    ;;
  'linux-x64')
    TAR_URL="${BASE_URL}-x86_64-unknown-linux-gnu-install_only.tar.gz"
    ;;
  *)
    echo "❌ Unsupported OS/ARCH: ${OS}-${ARCH}"
    exit 1
    ;;
esac

# The 'node-gyp' requirements check.
# https://github.com/nodejs/node-gyp?tab=readme-ov-file#installation

# Make sure 'make' is installed.
if ! command -v make &> /dev/null; then
  echo "❌ 'make' is not installed. Please install it to continue."
  exit 1
fi

# Make sure proper C/C++ compilers are installed.
# 'node-gyp' configure generates the Makefile which is used by make later.
# https://github.com/nodejs/node-gyp/blob/7d883b5cf4c26e76065201f85b0be36d5ebdcc0e/gyp/pylib/gyp/generator/make.py
#
# Only perform toolchain autodetect if CC or CXX are not already set.
if [ -z "${CC:-}" ] || [ -z "${CXX:-}" ]; then
  if command -v gcc &> /dev/null && command -v g++ &> /dev/null; then
    export CC=gcc
    export CXX=g++
  elif command -v clang &> /dev/null && command -v clang++ &> /dev/null; then
    export CC=clang
    export CXX=clang++
  else
    if [[ "$OS" == "linux" ]]; then
      echo "❌ Neither 'clang' nor 'gcc' are installed. Please install a C/C++ compiler to continue."
    else
      echo "❌ Neither 'clang' nor 'gcc' are installed. Please install Xcode Command Line Tools to continue."
    fi
    exit 1
  fi

  # Try to compile a simple C++ program which imports some standard libraries
  # to ensure that the compiler is working correctly.
  $CXX dummy.cc || {
    echo "❌ Failed to find the standard C++ library. Make sure you have a working C++ compiler installed."
    exit 1
  }

  # To be available in the 'install' phase.
  # node-gyp will use these environment variables to generate the
  # correct Makefile.
  rm -f .reboot_cc_env .reboot_cxx_env
  echo "$CC" >> .reboot_cc_env
  echo "$CXX" >> .reboot_cxx_env
fi

curl -s -L "$TAR_URL" | tar -xzf -

DOWNLOADED_PYTHON=$(echo $(pwd)/python/bin/python3)

# To be available in the 'install' phase.
rm -f .reboot_python_env
echo "$DOWNLOADED_PYTHON" >> .reboot_python_env
