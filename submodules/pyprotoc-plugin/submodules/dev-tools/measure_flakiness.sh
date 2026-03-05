#!/bin/bash
#
# Measures the flakiness (the percentage of failures) of the given command.
#
# Usage: [RUN_COUNT=XXX] measure_flakiness.sh $COMMAND_TO_RUN

run_count=${RUN_COUNT:-10}
if [ ${run_count} -le 0 ]; then
    echo "RUN_COUNT must be positive"
    exit 1
fi
echo "Running the following command ${run_count} times to measure flakiness: ${@}"
 
failure_count=0
for (( i=0; i<${run_count}; i++ ))
do
    echo "Run $((i + 1)) of ${run_count}"
    if ! ${@};
    then
        failure_count=$((failure_count + 1))
    fi
done

success_count=$((run_count - failure_count))
# Round up when dividing so 0.1% flaky is reported as 1%, not 0%. See
# https://stackoverflow.com/a/2395294
flaky_percentage=$(((failure_count * 100 + run_count - 1) / run_count))
echo "${success_count}/${run_count} runs succeeded (${flaky_percentage}% flaky)"
