"""
# Description of the 'benchmark' macro, which executes a 'harness.ts' statistics
# collection script on a given benchmark script.
"""

load("@com_github_reboot_dev_reboot//reboot:versions.bzl", "REBOOT_VERSION")

dev_reboot_env = {
    "REBOOT_API_NPM_PACKAGE": "$(location @com_github_reboot_dev_reboot//rbt/v1alpha1:reboot-dev-reboot-api)",
    "REBOOT_NPM_PACKAGE": "$(location //reboot/nodejs:reboot-dev-reboot-" + REBOOT_VERSION + ".tgz)",
    "REBOOT_WHL_FILE": "$(location //reboot:reboot.dev)",
}

dev_reboot_packages = [
    "@com_github_reboot_dev_reboot//rbt/v1alpha1:reboot-dev-reboot-api",
    "//reboot:reboot.dev",
    "//reboot/nodejs:reboot-dev-reboot-" + REBOOT_VERSION + ".tgz",
]

def _validate_env(env):
    """
    Validate that the environment variables, specific for the 'dev_reboot' are not set.

    When using the default dev Reboot library, the environment variables list
    must not contain:

      * REBOOT_API_NPM_PACKAGE
      * REBOOT_NPM_PACKAGE
      * REBOOT_WHL_FILE

    Args:
      env: The environment variables to validate.
    """

    for key in dev_reboot_env.keys():
        if key in env:
            fail("The 'use_reboot_dev' flag is set to 'True', which means that " +
                 "the default dev Reboot library environment should be used. " +
                 "The environment variable '%s' must not be set." % key)

def _merge_dicts(dict1, dict2):
    """
    Merge two dictionaries.

    Args:
      dict1: The first dictionary.
      dict2: The second dictionary.

    Returns:
      The merged dictionary.
    """

    return {k: v for d in [dict1, dict2] for k, v in d.items()}

def benchmark(
        name,
        working_directory,
        script,
        duration,
        partitions,
        concurrency,
        srcs,
        package_json,
        protos,
        rbtrc,
        data = [],
        env = {},
        tags = [
            "exclusive",
            "macos_not_supported",
        ],
        # The bootstrap script uses the 'env' variables to properly install the
        # dev version of Reboot library, so if a user will override env, they
        # should also provide the necessary packages in the 'data' attribute and
        # provide the 'env' attribute with the necessary variables.
        # To detect if the user wants to use the default dev-reboot environment,
        # we use this flag and if it's set to 'True', we will add the necessary
        # packages to the 'data' attribute and the necessary variables to the
        # 'env' attribute.
        use_dev_reboot = True,
        report_directory = ""):
    """
    Like `sh_binary`, but in a given working directory.

    Specifically, this macro will:
      * `cd` into the directory given by the `working-directory` argument.

    Args:
      name: The name of the target.
      working_directory: The working directory to use.
      script: The benchmark script from the working directory.
      duration: The duration of benchmark script.
      partitions: Maximum number of partitions to use.
      concurrency: Maximum number of concurrent requests.
      srcs: The source files to include in the target, which are required to run `rbt dev run`.
      package_json: The package.json file to include in the target.
      protos: The proto files to include in the target.
      rbtrc: The .rbtrc file to include in the target.
      data: The data files to make available to the script.
      env: The environment variables to set for the script.
      tags: Bazel tags to apply to the target.
      use_dev_reboot: Whether to use the default dev-reboot environment.
      report_directory: The directory to write the report to.
    """

    if working_directory == "":
        fail("working_directory must be non-empty")
    if script == "":
        fail("script must be non-empty")
    if duration == "":
        fail("duration must be non-empty")
    if partitions == "":
        fail("partitions must be non-empty")
    if concurrency == "":
        fail("concurrency must be non-empty")

    if use_dev_reboot:
        _validate_env(env)

    final_data = ["//reboot/benchmarks/bazel:harness.ts"]

    if use_dev_reboot:
        final_env = _merge_dicts(dev_reboot_env, env)

        # TODO: This `sh_library` is a necessary indirection until Bazel 6, because a `sh_binary`
        # does not actually force a `data` attribute to build, but a `sh_library` does. We can
        # remove the indirection once we upgrade. See https://github.com/bazelbuild/bazel/issues/12348

        native.sh_library(
            # Using the 'name' prefix to avoid name conflicts if multiple
            # benchmarks are defined in the same BUILD file.
            name = name + "_dev_reboot_packages",
            data = dev_reboot_packages,
        )

        # We need a 'sh_library' target in the data attribute to force the data
        # to be built and available to the script, also we have to list the
        # names of the Reboot library targets in the data, to make '$(location
        # ...)' work.

        alias_reboot_dev_packages_label = ":" + name + "_dev_reboot_packages"

        final_data += dev_reboot_packages + [
            alias_reboot_dev_packages_label,
        ] + data
    else:
        final_data += data
        final_env = env

    final_data += srcs + protos + [
        rbtrc,
        package_json,
        script,
    ]

    native.sh_binary(
        name = name,
        srcs = ["//reboot/benchmarks/bazel:benchmark_launcher.sh"],
        args = [
            "'%s'" % name,
            "'%s'" % working_directory,
            "'%s'" % script,
            "'%s'" % duration,
            "'%s'" % partitions,
            "'%s'" % concurrency,
            "'%s'" % report_directory,
        ],
        data = final_data,
        env = final_env,
        tags = tags,
    )
