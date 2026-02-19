"""Rules to improve `py_web_test_suite`."""

load("@io_bazel_rules_webtesting//web:py.bzl", "py_web_test_suite")

def py_web_test_suite_env(
        name,
        main,
        env = None,
        data = None,
        srcs = None,
        tags = None,
        py_test_tags = None,
        size = "medium",
        **kwargs):
    """Wraps `py_web_test_suite` to support environment variables.

    `py_web_test_suite` does not pass environment variables (even
    though you can pass it an `env` kwarg). This macro writes the
    environment variable into a file that gets included in `data` and
    uses a "trampoline" `main` which reads the file and adds the
    environment variables before executing the actual `main`.

    Bug filed for when we can remove all of this:
      https://github.com/bazelbuild/rules_webtesting/issues/472

    Args:
      name: Name of the target.
      main: Name of main Python file to run.
      env: A dictionary of environment variables to set when running the test.
      data: List of data dependencies.
      srcs: List of sources.
      tags: List of tags to apply to the test.
      py_test_tags: A list of test tag strings to use for the py_test target.
      size: The size of the test. Defaults to "medium".
      **kwargs: All other arguments are passed through to `py_web_test_suite` unmodified.

    """

    # We use 'chromium-local' as a browser and apply 'tags' and
    # 'py_test_tags' according to the 'chromium-local' browser,
    # other browsers are currently not supported.
    browsers = kwargs.get("browsers", None)
    if browsers != ["@io_bazel_rules_webtesting//browsers:chromium-local"]:
        fail("Only 'chromium-local' is supported as a browser.")

    env = env or dict()

    env_string = ""
    for key, value in env.items():
        env_string += "{key}={value}\n".format(key = key, value = value)

    # TODO(benh): consider wrapping `py_web_test_suite` with something
    # like `py_web_test_suite_with_env` so that it is useful even for
    # cases when we aren't using local Kubernetes.
    native.genrule(
        name = name + "-env",
        srcs = [main],
        outs = [":" + name + "_py_web_test_suite_env"],
        cmd = """
        echo 'PY_WEB_TEST_SUITE_ENV_MAIN=$(rootpath {main})' > $@
        echo -n '{env_string}' >> $@
        """.format(main = main, env_string = env_string),
    )

    data = data or []
    data.append(":" + name + "_py_web_test_suite_env")

    srcs = srcs or []
    srcs.append(Label("//tests/reboot/react:py_web_test_suite_env_trampoline.py"))

    # `py_web_test_suite_env()` expects either `tags` to be `None` or
    # `tags` to have "native".
    if tags == None:
        tags = ["native"]
    elif "native" not in tags:
        tags.append("native")

    # `py_web_test_suite_env()` expects either `py_test_tags` to be `None` or
    # `py_test_tags` to have "manual" and "noci".
    if py_test_tags == None or py_test_tags == []:
        py_test_tags = ["manual", "noci"]
    else:
        if "manual" not in py_test_tags:
            py_test_tags.append("manual")
        if "noci" not in py_test_tags:
            py_test_tags.append("noci")

    py_web_test_suite(
        name = name,

        # Pass on data.
        data = data,

        # Pass on srcs.
        srcs = srcs,

        # Pass on size.
        size = size,

        # Our indirect `main` which trampolines into the actual `main`
        # after setting up the environment variables.
        main = Label("//tests/reboot/react:py_web_test_suite_env_trampoline.py"),
        tags = tags,
        py_test_tags = py_test_tags,

        # Pass on all user arguments (including deps, ...).
        **kwargs
    )
