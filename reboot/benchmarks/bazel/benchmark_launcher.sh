#!/bin/bash
#
# See `benchmark.bzl` for documentation about the purpose of
# this script. This script should only be invoked from that file.

kill_process() {
    local pid=$1
    local quiet=${2:-false}
    local message=${3:-"Killing process with PID $pid"}

    if [ "$quiet" = "false" ]; then
        echo "$message"
    fi

    kill -SIGINT $pid || true
    wait $pid 2>/dev/null || true
}

cleanup() {
    local quiet=${1:-false}

    if [ "$quiet" = "true" ]; then
        echo "Cleaning up quietly..."
    else
        echo "Cleaning up..."
    fi

    # If Ctrl-C is pressed, we should check if the harness process is running
    # and kill it.
    if [ -n "$HARNESS_TEE_PID" ]; then
        # If it is the cleanup in between iterations, no running harness is
        # expected.

        kill_process $HARNESS_PID "$quiet" "Killing harness process with PID $HARNESS_PID"
        kill_process $HARNESS_TEE_PID "$quiet" "Killing harness tee process with PID $HARNESS_TEE_PID"

        rm $PIPE || true
    fi

    if [ -n "$TEE_PID" ]; then
        if [ -z "$RBT_DEV_RUN_PID" ]; then
            # Since the TEE_PID is set, we know that the 'npx rbt dev run'
            # process should be started, but the PID is not set, try to get the
            # PID from the output file.
            RBT_DEV_RUN_PID=$(cat "$RUN_PID_FILE")
        fi

        if [ "$quiet" = "false" ]; then
            echo "Killing 'npx rbt dev run' process with PID $RBT_DEV_RUN_PID"
        fi

        # Kill the whole process group of the 'npx rbt dev run' process.
        kill -SIGINT -- -$RBT_DEV_RUN_PID || true
        wait $RBT_DEV_RUN_PID 2>/dev/null || true

        kill_process $TEE_PID "$quiet" "Killing tee process with PID $TEE_PID"
    fi
}

# If Ctrl-C is pressed during the script execution, we should
# kill the `npx rbt dev run` process, the 'harness' process and the 'tee'
# processes.
#
# NOTE: It is possible that Ctrl-C might be pressed in a specific moment,
# so after the script exits, the docker container might be still running.
trap cleanup EXIT

BENCHMARK_NAME=$1
WORKING_DIRECTORY=$2
SCRIPT=$3
DURATION=$4
PARTITIONS=$5
CONCURRENCY=$6
REPORT_DIRECTORY=$7

HARNESS_PATH="$(pwd)/reboot/benchmarks/bazel/harness.ts"

# Execute the benchmark inside the tempdir, and copy all files (including hidden
# files) from the working directory, while breaking symlinks. We do this to
# prevent mutations of lockfiles or state, and to prevent node.js or build tools
# like esbuild/swc/etc from executing module lookups outside of the test sandbox.
#   see https://nodejs.org/api/cli.html#cli_preserve_symlinks
export SANDBOX_ROOT="$(pwd)/"
BENCHMARK_TMPDIR=$(mktemp -d)
cd $BENCHMARK_TMPDIR

shopt -s dotglob
cp -rL "${SANDBOX_ROOT}${WORKING_DIRECTORY}/"* .
shopt -u dotglob

echo
echo "Running benchmark in ${BENCHMARK_TMPDIR} at ${SCRIPT} for ${DURATION} with 1 - ${PARTITIONS} partitions and 1 - ${CONCURRENCY} concurrency"
echo

if [[ -n "$REBOOT_NPM_PACKAGE" ]]; then
  # TODO: Invariant, we assume that if REBOOT_NPM_PACKAGE is set, then
  # REBOOT_API_NPM_PACKAGE and REBOOT_WHL_FILE are also set.
  REBOOT_WHL_FILE="${SANDBOX_ROOT}${REBOOT_WHL_FILE}"

  # Manually install the Reboot nodejs packages. This allows us to
  # install unreleased versions of the packages during tests.
  # Install that packages before doing 'npm install' to ensure that
  # we are not installing the Reboot packages twice later.
  npm install --no-save \
    ${SANDBOX_ROOT}$REBOOT_NPM_PACKAGE \
    ${SANDBOX_ROOT}$REBOOT_API_NPM_PACKAGE
fi

npm install
# Install the `tsx` package explicitly to not require it in the `package.json`.
npm install --no-save tsx@4.19.2

# Create a temporary file for our results.
RESULTS_FILE=$(mktemp)

echo "Results file is $RESULTS_FILE"

cp $HARNESS_PATH .

for ((partitions = 1; partitions <= PARTITIONS; partitions *= 2)); do
    for ((concurrency = partitions; concurrency <= CONCURRENCY; concurrency++)); do

        # Always start without any data.
        npx rbt dev expunge --yes || true

        # Create a temporary file for output from `npx rbt dev run`.
        RBT_DEV_RUN_OUTPUT_FILE=$(mktemp)

        # Do not TTY, since it will block the execution of the script in the
        # Bazel environment.
        export REBOOT_USE_TTY="false"

        RUN_PID_FILE=$(mktemp)

        # Launch in a subshell so we can capture the PID of 'npx rbt dev run'.
        (
            # Start a new session; echo the PID of npx into a file.
            setsid sh -c 'echo $$ > '"$RUN_PID_FILE"'; exec npx rbt dev run --servers="$1"' _ "$partitions" 2>&1
        ) | tee "$RBT_DEV_RUN_OUTPUT_FILE" &
        TEE_PID=$!

        # Wait until the run_pid file is populated
        while [ ! -s "$RUN_PID_FILE" ]; do
            sleep 0.1
        done

        # Wait until the application is serving traffic.
        while true; do
            if grep -q "Application is serving traffic ..." "$RBT_DEV_RUN_OUTPUT_FILE"; then
                break
            fi
            sleep 1
        done

        RBT_DEV_RUN_PID=$(cat "$RUN_PID_FILE")

        # Create a temporary file for output from running the benchmark in the script.
        SCRIPT_OUTPUT_FILE=$(mktemp)

        # Run the "harness" using `tsx` and tee the output to the console and a
        # file.
        PIPE=$(mktemp -u)
        mkfifo $PIPE
        npx tsx harness.ts "$SCRIPT" "$DURATION" "$partitions" "$concurrency" > "$PIPE" 2>&1 &
        HARNESS_PID=$!

        # Start tee to read from the FIFO and write to the output file.
        tee "$SCRIPT_OUTPUT_FILE" < "$PIPE" &
        HARNESS_TEE_PID=$!

        wait $HARNESS_PID 2>/dev/null || true

        # Cleanup quietly in between iterations.
        cleanup "true"

        # Append the results, depending on if we are the first time
        # running for this value of $partitions or not.
        if (( concurrency == partitions )); then
            echo >> $RESULTS_FILE
            echo "PARTITIONS=$partitions" >> $RESULTS_FILE
            echo >> $RESULTS_FILE
            tail -n 2 $SCRIPT_OUTPUT_FILE >> $RESULTS_FILE
        else
            tail -n 1 $SCRIPT_OUTPUT_FILE >> $RESULTS_FILE
        fi
    done
done

echo
echo "RESULTS:"
echo
cat $RESULTS_FILE

rm -rf $BENCHMARK_TMPDIR

# Clean up the PID variables so that the cleanup function does not try to kill
# the processes again.
HARNESS_TEE_PID=""
TEE_PID=""

# Save the report to the report directory if specified, otherwise save to the
# 'WORKING_DIRECTORY/reports'.
if [ -z "$REPORT_DIRECTORY" ]; then
    REPORT_DIRECTORY="/workspaces/mono/${WORKING_DIRECTORY}/reports"
fi

mkdir -p $REPORT_DIRECTORY

BENCHMARK_REPORT_FILE="${REPORT_DIRECTORY}/${BENCHMARK_NAME}_$(date --iso=seconds).txt"

echo "REPORT FILE: $BENCHMARK_REPORT_FILE"

# TODO: Collect the CPU and RAM usage information, since the results might be
# skewed if the system is under heavy load.
SYSTEM_INFO=$(uname -a)
CURRENT_DATETIME=$(date +"%Y-%m-%d %H:%M:%S")
CPU_MODEL=$(lscpu | grep "Model name" | awk -F ':' '{gsub(/^[ \t]+|[ \t]+$/, "", $2); print $2}')

{
    echo "System Info: $SYSTEM_INFO"
    echo "Date & Time: $CURRENT_DATETIME"
    echo "CPU Model: $CPU_MODEL"
  } > "$BENCHMARK_REPORT_FILE"

cat $RESULTS_FILE >> $BENCHMARK_REPORT_FILE
