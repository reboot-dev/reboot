#!/bin/bash
set -euo pipefail


if [[ "$1" == "cloud" && "$2" == "up" ]]; then
    # When 'rbt cloud up' is run, it will build an application's `Dockerfile`. That
    # `Dockerfile` is likely based on (`FROM`) the `reboot-base` image. To show
    # our local code changes in the application being built, we must build that
    # `reboot-base` image locally first.
    bazel run //reboot/containers/reboot-base:dev
fi

(bazel build --check_up_to_date //reboot/cli:rbt >/dev/null 2>&1 \
     || (bazel build //reboot/cli:rbt && echo -e '\n\n')) \
    && PATH=$PATH:"$(dirname $0)"/bazel-bin/reboot/cli/rbt.runfiles/com_github_reboot_dev_reboot/reboot:"$(dirname $0)"/bazel-bin/reboot/cli/rbt.runfiles/com_github_reboot_dev_reboot/protoc_gen_mypy_plugin \
           "$(dirname $0)"/bazel-bin/reboot/cli/rbt "$@"
