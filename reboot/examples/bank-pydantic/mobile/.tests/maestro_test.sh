#!/bin/bash

# Native end-to-end test for the bank-pydantic mobile app. Unlike
# `react_native_test.sh` (which only generates + type-checks), this
# runs the REAL app on a real Android runtime (Hermes) and drives a
# real user flow against a real Reboot backend, using Maestro:
#
#   backend (rbt dev run, :9991) ──┐
#   headless Android emulator ─────┼──> Expo Go loads the app
#   `npx expo start --android`  ───┘     (EXPO_PUBLIC_REBOOT_URL=10.0.2.2:9991)
#   `maestro test .maestro/flow.yaml` drives it and asserts that
#   creating customers, opening accounts, and transferring funds
#   round-trips through the backend and re-renders.
#
# Requirements (baked into the devcontainer image's `Dockerfile`):
# a JDK, the Android SDK + emulator + a system image, Maestro, and
# `/dev/kvm` access (the `vscode` user is in the `kvm` group). This is
# intentionally NOT hermetic and is tagged `manual`/`local`/`exclusive`
# in BUILD.bazel: it needs the host's `/dev/kvm` and a single emulator,
# so it can't run on remote executors.

set -e # Exit if a command exits with an error.
set -u # Treat expanding an unset variable as an error.
set -x # Echo executed commands to help debug failures.

EXAMPLE_ROOT="$(pwd)"
AVD_NAME="rbt_e2e_bank_pydantic"
SYSTEM_IMAGE="system-images;android-34;google_apis;x86_64"

# Bazel runs tests with a sanitized environment, so `HOME` may be
# unset. uv, npm, Expo, Maestro, and the emulator's AVD all need it;
# default it to the devcontainer user's home (where the image installs
# Maestro and where the AVD is created).
export HOME="${HOME:-/home/vscode}"

# Bazel's sanitized `PATH` doesn't include the Android SDK or Maestro,
# so locate them explicitly rather than relying on the image's `ENV`.
# The devcontainer image installs the SDK to `/opt/android-sdk` and
# Maestro to `~/.maestro`; fall back to a `~/android-sdk` install if
# present.
if [ -z "${ANDROID_HOME:-}" ]; then
  if [ -d /opt/android-sdk ]; then
    ANDROID_HOME=/opt/android-sdk
  else
    ANDROID_HOME="${HOME}/android-sdk"
  fi
fi
export ANDROID_HOME
export ANDROID_SDK_ROOT="${ANDROID_HOME}"
export PATH="${ANDROID_HOME}/cmdline-tools/latest/bin:${ANDROID_HOME}/platform-tools:${ANDROID_HOME}/emulator:${HOME}/.maestro/bin:${PATH}"

# The long-running background processes redirect their output to these
# files (so their detached children can't hold `bazel test`'s output
# pipe open; see the emulator launch below). That redirection means a
# failure in any of them is otherwise invisible, so `cleanup` dumps
# these logs whenever we exit non-zero.
RBT_LOG=/tmp/rbt.log
EMULATOR_LOG=/tmp/emulator.log
EXPO_LOG=/tmp/expo.log

# Best-effort cleanup of the long-running processes we start. The
# emulator and Expo are each launched with `setsid` so they lead their
# own process group; we kill the whole group (the negative PID), because
# they spawn children (`qemu`, Metro's `node`) that outlive their parent
# and would otherwise keep Bazel's output pipe open. The backend needs
# gentler handling — see `cleanup`.
emulator_pid=""
expo_pid=""
backend_pid=""
kill_group() {
  [ -n "$1" ] && kill -TERM "-$1" 2> /dev/null || true
}
cleanup() {
  # Capture the exit status before running anything else. If we're
  # exiting because a step failed, surface the redirected logs — they're
  # the only record of what the background processes were doing.
  local status=$?
  if [ "${status}" -ne 0 ]; then
    for log in "${RBT_LOG}" "${EMULATOR_LOG}" "${EXPO_LOG}"; do
      [ -f "${log}" ] || continue
      echo "===== tail of ${log} (script exiting with ${status}) =====" >&2
      tail -n 50 "${log}" >&2 || true
    done
  fi
  kill_group "${expo_pid}"
  # `rbt dev run` runs its app server and Envoy proxy in a separate
  # session and only tears them down on SIGINT — a SIGTERM kills it
  # abruptly and orphans Envoy on :9991. We launched it so `backend_pid`
  # is rbt's own PID; interrupt it, give it a moment to stop its
  # children, then force-kill anything left (including a stray Envoy).
  if [ -n "${backend_pid}" ]; then
    kill -INT "${backend_pid}" 2> /dev/null || true
    for _ in $(seq 1 10); do
      kill -0 "${backend_pid}" 2> /dev/null || break
      sleep 1
    done
    kill -KILL "${backend_pid}" 2> /dev/null || true
  fi
  for envoy_pid in $(pgrep -x envoy 2> /dev/null); do
    kill -KILL "${envoy_pid}" 2> /dev/null || true
  done
  adb -s emulator-5554 emu kill 2> /dev/null || true
  kill_group "${emulator_pid}"
}
# Run `cleanup` on normal exit, and also on the signals Bazel sends when
# it kills the test (notably when it hits its own per-test timeout);
# otherwise a hung setup step would be terminated without the redirected
# logs ever being printed.
trap cleanup EXIT
trap 'exit 143' TERM
trap 'exit 130' INT

# Set up the Python backend exactly like the sibling example tests: a
# fresh venv with the locally built wheel (in Bazel), then `rbt dev
# run`, which also generates the mobile client into `mobile/src/api/`.
if [[ -n "${REBOOT_WHL_FILE:-}" ]]; then
  uv add --no-sync "${SANDBOX_ROOT}${REBOOT_WHL_FILE}"
fi
rm -rf .venv
uv sync
source .venv/bin/activate
RBT_FLAGS="--state-directory=$(mktemp -d)"
# `rbt dev run` exits when its stdin reaches EOF, so keep stdin open with
# a FIFO we hold open through `${RBT_STDIN_FD}`. Launching rbt directly
# (rather than behind a `tail | rbt` pipeline) makes `$!` rbt's own PID,
# which `cleanup` needs so it can SIGINT rbt for a graceful shutdown that
# also stops its Envoy proxy. Output goes to a log file so rbt's
# (separate-session) children can't hold Bazel's output pipe open.
RBT_STDIN_FIFO="$(mktemp -u)"
mkfifo "${RBT_STDIN_FIFO}"
exec {RBT_STDIN_FD}<>"${RBT_STDIN_FIFO}"
rm -f "${RBT_STDIN_FIFO}"
rbt ${RBT_FLAGS} dev run <&"${RBT_STDIN_FD}" > "${RBT_LOG}" 2>&1 &
backend_pid=$!
# Wait for the backend to serve traffic on the default port 9991.
until curl -s -o /dev/null --max-time 3 http://localhost:9991/; do
  sleep 1
done

# Install the mobile app's JS dependencies, overlaying the locally
# built Reboot npm packages in Bazel (same as `react_native_test.sh`).
cd mobile
if [[ -n "${REBOOT_NPM_PACKAGE:-}" ]]; then
  npm install --no-save \
    "${SANDBOX_ROOT}${REBOOT_NPM_PACKAGE}" \
    "${SANDBOX_ROOT}${REBOOT_API_NPM_PACKAGE}" \
    "${SANDBOX_ROOT}${REBOOT_WEB_NPM_PACKAGE}" \
    "${SANDBOX_ROOT}${REBOOT_REACT_NPM_PACKAGE}"
else
  npm install
fi
cd "${EXAMPLE_ROOT}"

# Create the AVD if it does not exist, then boot a headless,
# KVM-accelerated emulator and wait for it to finish booting.
if ! avdmanager list avd 2> /dev/null | grep -q "Name: ${AVD_NAME}"; then
  echo no | avdmanager create avd -n "${AVD_NAME}" -k "${SYSTEM_IMAGE}" \
    -d pixel_6 --force
fi
# Redirect the emulator's output to a file rather than letting it
# inherit our stdout/stderr. The emulator spawns helpers (`qemu`,
# `crashpad_handler`, `netsimd`) that detach into their own sessions, so
# `cleanup`'s process-group kill doesn't reap them; if they held our
# stdout/stderr, those open pipes would keep `bazel test` blocked long
# after the flow passed.
setsid emulator -avd "${AVD_NAME}" -no-window -no-audio -no-snapshot \
  -no-boot-anim -gpu swiftshader_indirect -accel on \
  > "${EMULATOR_LOG}" 2>&1 &
emulator_pid=$!
adb wait-for-device
until [ "$(adb shell getprop sys.boot_completed 2> /dev/null | tr -d '\r')" = "1" ]; do
  sleep 1
done

# Load the app via Expo Go, pointed at the backend on the emulator's
# host alias (`10.0.2.2`). `expo start --android` installs Expo Go and
# opens the project.
cd mobile
export EXPO_PUBLIC_REBOOT_URL="http://10.0.2.2:9991"
export EXPO_NO_TELEMETRY=1
setsid npx expo start --android > "${EXPO_LOG}" 2>&1 &
expo_pid=$!
# Wait for Metro to bundle and the app to load on the emulator.
until grep -q "Android Bundled" "${EXPO_LOG}" 2> /dev/null; do
  sleep 1
done

# Drive the real app and assert the create/open/transfer round-trips.
maestro test .maestro/flow.yaml
