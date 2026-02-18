"""
# Bazel, when executing an `sh_test` target, instead of invoking the script
# given to it in the `srcs` attribute, instead creates a _copy_ of that script,
# places that copy in the same directory as the BUILD target, and then invokes
# that copy. That messes with the script's ability to know its own identity.
#
# In addition, Bazel will use its own working directory, not configurable via a
# normal `sh_test` target, whereas our scripts may prefer a different working
# directory.
#
# This file provides a solution for these issues.
#
"""

def sh_test_in_working_directory(
        name,
        working_directory,
        script,
        data,
        setup_script = None,
        env = {},
        tags = [],
        size = None):
    """
    Like `sh_test`, but in a given working directory.

    Specifically, there are two differences relative to `sh_test`; this macro
    will:
      * `cd` into the directory given by the `working-directory` argument.
      * Run the target `script` in its original location, instead of making a
        copy in a different location.

    Args:
      name: The name of the target.
      working_directory: The working directory to use.
      script: The script to run from the working directory.
      data: The data files to make available to the script.
      setup_script: A script to run before the main script, won't be run in the
        working directory.
      env: The environment variables to set for the script.
      tags: Bazel tags to apply to the target.
      size: The size of the target.
    """
    if working_directory == "":
        fail("working_directory must be specified")
    if script == "":
        fail("script must be specified")
    native.sh_test(
        name = name,
        srcs = ["//tests:sh_test_in_working_directory_launcher.sh"],
        args = [
            "'%s'" % working_directory,
            "'%s'" % script,
            "'%s'" % setup_script if setup_script else "''",
        ],
        data = data,
        env = env,
        tags = tags,
        size = size,
    )
