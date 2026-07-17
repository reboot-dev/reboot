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

    # If Ctrl-C is pressed, we should check if the harness process is
    # running and kill it.
    if [ -n "$HARNESS_TEE_PID" ]; then
        # If it is the cleanup in between iterations, no running
        # harness is expected.

        kill_process $HARNESS_PID "$quiet" "Killing harness process with PID $HARNESS_PID"
        kill_process $HARNESS_TEE_PID "$quiet" "Killing harness tee process with PID $HARNESS_TEE_PID"

        rm $PIPE || true
    fi

    if [ -n "$TEE_PID" ]; then
        if [ -z "$RBT_DEV_RUN_PID" ]; then
            # Since the TEE_PID is set, we know that the 'rbt dev run'
            # process should be started, but the PID is not set, try
            # to get the PID from the output file.
            RBT_DEV_RUN_PID=$(cat "$RUN_PID_FILE")
        fi

        if [ "$quiet" = "false" ]; then
            echo "Killing 'rbt dev run' process with PID $RBT_DEV_RUN_PID"
        fi

        # Kill the whole process group of the 'rbt dev run' process.
        kill -SIGINT -- -$RBT_DEV_RUN_PID || true
        wait $RBT_DEV_RUN_PID 2>/dev/null || true

        kill_process $TEE_PID "$quiet" "Killing tee process with PID $TEE_PID"
    fi
}

# If Ctrl-C is pressed during the script execution, we should
# kill the `rbt dev run` process, the 'harness' process and the 'tee'
# processes.
trap cleanup EXIT

BENCHMARK_NAME=$1
WORKING_DIRECTORY=$2
SCRIPT=$3
DURATION=$4
PARTITIONS=$5
CONCURRENCY=$6
REPORT_DIRECTORY=$7

HARNESS_PATH="$(pwd)/reboot/benchmarks/bazel/harness.py"

# Execute the benchmark inside the tempdir, and copy all files
# (including hidden files) from the working directory, while breaking
# symlinks. We do this to prevent mutations of lockfiles or state, and
# to prevent module lookups outside of the test sandbox.
export SANDBOX_ROOT="$(pwd)/"
BENCHMARK_TMPDIR=$(mktemp -d)
cd $BENCHMARK_TMPDIR

shopt -s dotglob
cp -rL "${SANDBOX_ROOT}${WORKING_DIRECTORY}/"* .
shopt -u dotglob

echo
echo "Running benchmark in ${BENCHMARK_TMPDIR} at ${SCRIPT} for ${DURATION} with 1 - ${PARTITIONS} partitions and 1 - ${CONCURRENCY} concurrency"
echo

if [[ -z "$REBOOT_WHL_FILE" ]]; then
    echo "REBOOT_WHL_FILE must be set to the Reboot wheel to install"
    exit 1
fi

REBOOT_WHL_FILE="${SANDBOX_ROOT}${REBOOT_WHL_FILE}"

# Bootstrap a virtual environment containing the development version
# of the Reboot wheel; it provides `rbt`, the `reboot` library for the
# harness, and the Python that `rbt dev run` uses to run the
# application. Prefer `uv` when available since it is much faster.
if command -v uv >/dev/null 2>&1; then
    uv venv --quiet .venv
    VIRTUAL_ENV="${BENCHMARK_TMPDIR}/.venv" uv pip install --quiet "$REBOOT_WHL_FILE"
else
    python3 -m venv .venv
    .venv/bin/pip install --quiet "$REBOOT_WHL_FILE"
fi

source .venv/bin/activate

# Create a temporary file for our results.
RESULTS_FILE=$(mktemp)

echo "Results file is $RESULTS_FILE"

cp $HARNESS_PATH .

for ((partitions = 1; partitions <= PARTITIONS; partitions *= 2)); do
    for ((concurrency = partitions; concurrency <= CONCURRENCY; concurrency *= 2)); do

        # Always start without any data.
        rbt dev expunge --yes || true

        # Create a temporary file for output from `rbt dev run`.
        RBT_DEV_RUN_OUTPUT_FILE=$(mktemp)

        # Do not TTY, since it will block the execution of the script
        # in the Bazel environment.
        export REBOOT_USE_TTY="false"

        RUN_PID_FILE=$(mktemp)

        # Launch in a subshell so we can capture the PID of
        # 'rbt dev run'.
        (
            # Start a new session; echo the PID of rbt into a file.
            setsid sh -c 'echo $$ > '"$RUN_PID_FILE"'; exec rbt dev run --servers="$1"' _ "$partitions" 2>&1
        ) | tee "$RBT_DEV_RUN_OUTPUT_FILE" &
        TEE_PID=$!

        # Wait until the run_pid file is populated.
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

        # Create a temporary file for output from running the
        # benchmark in the script.
        SCRIPT_OUTPUT_FILE=$(mktemp)

        # Run the "harness" and tee the output to the console and a
        # file. The PYTHONPATH makes both the API definitions and the
        # generated code importable by benchmark scripts.
        PIPE=$(mktemp -u)
        mkfifo $PIPE
        PYTHONPATH="${BENCHMARK_TMPDIR}/api:${BENCHMARK_TMPDIR}/backend/api" \
            python harness.py "$SCRIPT" "$DURATION" "$partitions" "$concurrency" > "$PIPE" 2>&1 &
        HARNESS_PID=$!

        # Start tee to read from the FIFO and write to the output file.
        tee "$SCRIPT_OUTPUT_FILE" < "$PIPE" &
        HARNESS_TEE_PID=$!

        wait $HARNESS_PID 2>/dev/null && HARNESS_EXIT_CODE=0 || HARNESS_EXIT_CODE=$?

        # Cleanup quietly in between iterations.
        cleanup "true"

        # Fail fast: a failing benchmark script will fail on every
        # following iteration too, so there is no point in running
        # them.
        if [ "$HARNESS_EXIT_CODE" -ne 0 ]; then
            echo "Harness failed with exit code ${HARNESS_EXIT_CODE}:"
            cat $SCRIPT_OUTPUT_FILE
            HARNESS_TEE_PID=""
            TEE_PID=""
            exit $HARNESS_EXIT_CODE
        fi

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

# Clean up the PID variables so that the cleanup function does not try
# to kill the processes again.
HARNESS_TEE_PID=""
TEE_PID=""

# Save the report to the report directory if specified, otherwise save
# to the 'WORKING_DIRECTORY/reports' in the workspace that `bazel run`
# was invoked from.
if [ -z "$REPORT_DIRECTORY" ]; then
    REPORT_DIRECTORY="${BUILD_WORKSPACE_DIRECTORY}/${WORKING_DIRECTORY}/reports"
fi

mkdir -p $REPORT_DIRECTORY

BENCHMARK_REPORT_FILE="${REPORT_DIRECTORY}/${BENCHMARK_NAME}_$(date --iso=seconds).txt"

echo "REPORT FILE: $BENCHMARK_REPORT_FILE"

SYSTEM_INFO=$(uname -a)
CURRENT_DATETIME=$(date +"%Y-%m-%d %H:%M:%S")
CPU_MODEL=$(lscpu | grep "Model name" | awk -F ':' '{gsub(/^[ \t]+|[ \t]+$/, "", $2); print $2}')

{
    echo "System Info: $SYSTEM_INFO"
    echo "Date & Time: $CURRENT_DATETIME"
    echo "CPU Model: $CPU_MODEL"
  } > "$BENCHMARK_REPORT_FILE"

cat $RESULTS_FILE >> $BENCHMARK_REPORT_FILE
