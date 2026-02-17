"""
Tooling to build pip packages.

The main entrypoint of this file is the `pip_package` rule. It outputs a built
`.whl` (Wheel) file that can be uploaded to PyPI and `pip install`ed.

Under the hood, there are three components to be aware of:
  1. An Aspect that analyzes each target in the dependency tree and
     determines what files each contributes to the package. Read more about
     Bazel Aspects here:
       https://bazel.build/extending/aspects
  2. A Rule, which takes the information fed to it by the Aspect, assembles
     the package's files in the right place, and builds the package.
  3. A Macro, which simply wraps the Rule with a few default values that can
     only be provided via Macro rather than as default values on the Rule.
"""

# TODO(rjh): `rules_python` comes with a `py_wheel` rule that doesn't meet
#            our needs. Most notably, it doesn't support packages with
#            native extensions. Consider whether we can contribute some of the
#            work in this file back to `rules_python` to improve its `py_wheel`
#            and reduce our maintenance burden.

# TODO(rjh): The contents of this file are currently tested via the tests for
#            the following pip packages:
#              * `//reboot:reboot`
#            These cover a lot of edge cases, but the coverage is pretty
#            indirect, in that errors in the rule may only cause some runtime
#            failure when the built package is run. It also ties this rule to
#            this repo, whereas otherwise it could be completely stand-alone.
#            Investigate using Skylib to test this file directly:
#              https://bazel.build/rules/testing#testing-rules

load("@host_arch_detector//:host_arch.bzl", "host_arch")

def _debug_print(*args, **kwargs):
    """A helper to print information only while debugging.

    The `print` function is forbidden by Buildifier's style checks, since
    it's a debug-only function. Instead we use `_debug_print`, which leaves its
    single `print` statement commented out so that Buildifier doesn't complain,
    but allows us to quickly re-enable all debug prints by uncommenting this one
    line.
    """

    # We need to do something with `*args` and `*kwargs` to avoid a lint error
    # when the `print(*args, **kwargs)` is commented out.
    for _ in args:
        pass
    for _ in kwargs:
        pass

    # print(*args, **kwargs)

####################### The aspect ######################

# The PipPackageInfo provider is how the Aspect communicates information about
# the files that targets contribute to the package.
PipPackageInfo = provider(
    doc = "Information about a target's contribution to a pip package.",
    fields = {
        "data_depset": "Non-Python (data) files contributed by the target",
        "is_platform_dependent": "Whether the package contains platform-dependent " +
                                 "binary data",
        "is_pyabi_dependent": "Whether the package contains Python-ABI-dependent " +
                              "binary data",
        "path_map": "Dict mapping path prefixes as they arein source tree to " +
                    "what they should be in the package layout",
        "pypi_dependencies": "The PyPI dependencies of this target. " +
                             "Maps: [package name -> True]; is a dict for " +
                             "deduplication purposes.",
        "source_depset": "Python files contributed by the target",
    },
)

# Provider for passing wheel metadata from _pip_package to _pip_package_audited.
PipPackageWheelInfo = provider(
    doc = "Information about a built pip package wheel.",
    fields = {
        "abi_tag": "The ABI tag (e.g., none, cp310)",
        "cpu_architecture_name": "The CPU architecture name for manylinux tag",
        "distribution_tag": "The distribution name tag",
        "needs_auditwheel": "Whether auditwheel should be run on this wheel",
        "platform_tag": "The platform tag (e.g., any, linux_x86_64)",
        "python_tag": "The Python version tag (e.g., py3, cp310)",
        "version_tag": "The version tag",
        "wheel": "The built wheel file",
    },
)

def _pypi_package_name(target, ctx):
    """Returns the name of the PyPI package providing this target, if any.

    If this target is not from a PyPI package, returns None.
    """

    # Old style (using `rules_python` with a version number like 0.4.0) PyPI
    # packages can be spotted from their Bazel package name.
    if target.label.package.startswith("pypi__"):
        pip_package_name = target.label.package.removeprefix("pypi__")
        return pip_package_name

    # New style (using `rules_python` with a version number like 0.27.0) PyPI
    # packages can be spotted from the fact that they include a `*.dist-info`
    # directory; e.g. we can expect a file like:
    #   '[...]/MarkupSafe-2.1.3.dist-info/METADATA'
    for data_target in getattr(ctx.rule.attr, "data", []):
        for data_file in data_target.files.to_list():
            if data_file.path.endswith(".dist-info/METADATA"):
                # Get the package path component, e.g. 'MarkupSafe-2.1.3.dist-info'
                package_path_component = data_file.path.split("/")[-2]

                # Get just the package name, without version number. This split
                # is safe, since dashes are not allowed in Python package names.
                pip_package_name = package_path_component.split("-")[0]
                return pip_package_name

    # This target does not seem to come from a PyPI package.
    return None

def _analyze_pip_package_deps_and_data(target, ctx):
    """
    Implementation of the aspect.

    The aspect is executed on every target in the dependency tree, and answers
    the following questions about each target:
    * What files produced by this target should be included in the package as
      source files?
    * What files consumed as data by this target should be included in the
      package as data files?
    * Are any of the data files platform-dependent binary files?
    * Are there files that are currently in the wrong directory, that should be
      mapped to a different directory in the package?
    * What PyPI packages does this target depend on?
    """
    pypi_package_name = _pypi_package_name(target, ctx)
    if pypi_package_name != None:
        # Targets loaded from PyPI do not contribute files to the package;
        # they'll be loaded from PyPI via the `requirements.txt` file instead.
        # We do want to record the dependency on this PyPI package.
        _debug_print("Package %s is from PyPI" % target.label)
        return [PipPackageInfo(
            source_depset = depset(),
            data_depset = depset(),
            path_map = {},
            is_platform_dependent = False,
            is_pyabi_dependent = False,
            pypi_dependencies = {pypi_package_name: True},
        )]

    # To assemble a `PipPackageInfo` for this target, we'll combine information
    # from two sources:
    # 1. Information directly from this target.
    # 2. Information from the transitive dependencies of this target, which have
    #    already been analyzed and have `PipPackageInfo`s of their own.
    #
    # We'll gather the following information for this target.
    source_files = []  # Type: list[File].
    data_files = []  # Type: list[File].
    path_map = {}  # Type: dict[str, str], source path -> desired package path.
    is_platform_dependent = False  # Whether any `data` is platform-dependent.
    is_pyabi_dependent = False  # Whether any `data` is Python-ABI-dependent.

    # The transitive dependencies of this target will have already been
    # analyzed, and their `source_paths`s and `data_paths`s will each already
    # have been combined into one `depset` per target. We'll collect all of this
    # transitive information in the following:
    transitive_source_depsets = []  # Type: list[depset].
    transitive_data_depsets = []  # Type: list[depset].
    transitive_path_map = {}  # Type: dict[str, str].
    transitive_is_platform_dependent = False
    transitive_is_pyabi_dependent = False

    # Maps: [package name -> True].
    # Is a dict only for deduplication purposes.
    transitive_pypi_dependencies = {}

    # The aspect is run on the entire dependency graph, starting at the leaves
    # and working towards the root(s). The rule that will eventually consume
    # this information only gets the `PipPackageInfo` from its direct
    # dependencies, the root(s), so we must propagate information up the DAG as
    # we go.
    #
    # Specifically, we say that:
    #   * A target contributes the files it itself contributes, PLUS the files
    #     any of its transitive dependencies contribute.
    #   * A target contributes binary data if it itself does so, OR if any of
    #     its transitive dependencies do.
    #
    # To compute this, we must therefore first discover what the transitive
    # dependencies have computed.
    #
    # For almost all targets the `deps` are called `deps`, but `py_grpc_library`
    # rules under the hood call their `deps` `py_deps`; we inspect both.
    deps = (
        getattr(ctx.rule.attr, "deps", []) +
        getattr(ctx.rule.attr, "py_deps", [])
    )
    for dep in deps:
        if PipPackageInfo in dep:
            transitive_source_depsets.append(dep[PipPackageInfo].source_depset)
            transitive_data_depsets.append(dep[PipPackageInfo].data_depset)
            transitive_path_map.update(dep[PipPackageInfo].path_map)
            transitive_is_platform_dependent = (
                transitive_is_platform_dependent or
                dep[PipPackageInfo].is_platform_dependent
            )
            transitive_is_pyabi_dependent = (
                transitive_is_pyabi_dependent or
                dep[PipPackageInfo].is_pyabi_dependent
            )
            transitive_pypi_dependencies.update(dep[PipPackageInfo].pypi_dependencies)

    # Determine whether this target produces platform-dependent binary data.
    #
    # Note that this does not ask "does this target _use_" platform-dependent
    # data, but "does this target _produce_" it. While we really only care about
    # binary data when the produced data also gets contributed to the package,
    # at use-time we can only know whether data is platform-dependent if we mark
    # it as such now, at produce-time.
    #
    # The only way we know to detect whether a rule produces platform-dependent
    # binary output is to look at its `kind`. Bazel does have the concept of
    # "executable" labels, but doesn't surface that concept to our aspect, and
    # even if it did it wouldn't tell us about platform-dependent builds like
    # "pybind_extension", which is _not_ executable but _is_ a binary.
    PLATFORM_DEPENDENT_TARGET_KINDS = [
        "cc_binary",
        "pybind_extension",
    ]
    PYABI_DEPENDENT_TARGET_KINDS = [
        "pybind_extension",
    ]
    is_platform_dependent = ctx.rule.kind in PLATFORM_DEPENDENT_TARGET_KINDS
    is_pyabi_dependent = ctx.rule.kind in PYABI_DEPENDENT_TARGET_KINDS

    if target.label.workspace_name != "":
        _debug_print("Target %s is in external workspace %s" % (
            target.label,
            target.label.workspace_name,
        ))

        # When the Python code imports other Python code from a different
        # (external) workspace that is NOT a PyPI package, we must also include
        # all of that code in the package. However, Bazel places these external
        # workspaces in a different part of the tree; instead of `package/name`
        # (our desired layout in the pip distribution) their location in Bazel's
        # file tree is `../workspace_name/package/name`. We therefore need to
        # note a necessary path change, mapping the Bazel path to the
        # distribution path.
        path_map["../" + target.label.workspace_name + "/"] = ""

    if PyInfo not in target:
        # Our Pip package will only contain two kinds of files:
        # 1. Python files (sources for a Python rule).
        # 2. Data files (anything used as `data` by a Python rule).
        #
        # If this is not a Python rule, then this rule doesn't contribute any
        # files to the package (directly). It is, however, possible that this is
        # e.g. a `cc_binary` whose output files are used as `data` by a Python
        # rule. In that case it is that Python rule that will contribute the
        # files, but we must record _now_ that these files contain binary data;
        # that information will otherwise not be available to the Python rule.
        #
        # It is is also possible that a non-Python rule has Python dependencies
        # that are relied upon by another Python rule. We must therefore also
        # forward any `PipPackageInfo` that we find.
        _debug_print("Target %s of kind %s is not a Python target" % (
            target.label,
            ctx.rule.kind,
        ))

        path_map.update(transitive_path_map)
        return [PipPackageInfo(
            source_depset = depset(transitive = transitive_source_depsets),
            data_depset = depset(transitive = transitive_data_depsets),
            path_map = path_map,
            is_platform_dependent = is_platform_dependent or transitive_is_platform_dependent,
            is_pyabi_dependent = is_pyabi_dependent or transitive_is_pyabi_dependent,
            pypi_dependencies = transitive_pypi_dependencies,
        )]

    # Data files that will be contributed to the distribution are files that are
    # consumed by a Python target (e.g. a `.txt` file, or a binary `.so` file.
    #
    # Record any data files that this Python target contributes to the package.
    for data_target in getattr(ctx.rule.attr, "data", []):
        data_files.extend(data_target.files.to_list())

        # If the data file we're picking up here contains platform-dependent
        # binary information, this aspect's analysis of the target that built it
        # will have marked it as such. If so, we must mark ourselves as a
        # platform-dependent in turn.
        if (
            PipPackageInfo in data_target and
            data_target[PipPackageInfo].is_platform_dependent
        ):
            is_platform_dependent = True
        if (
            PipPackageInfo in data_target and
            data_target[PipPackageInfo].is_pyabi_dependent
        ):
            is_pyabi_dependent = True

    # Source files that will be contributed to the distribution are source files
    # produced by a Python target (".py" files, either directly included as
    # sources or generated by code generation).
    for file in target[DefaultInfo].files.to_list():
        if ctx.rule.kind == "py_proto_library":
            if file.short_path.startswith("../com_google_protobuf"):
                # Proto rules insert the whole `google.protobuf` package into
                # the source tree. We don't need it, since we expect that those
                # dependencies are fetched separately when they're actually
                # accessed, e.g. from PyPI, so we omit the files from the
                # package.
                _debug_print("Skipping proto file %s" % file.short_path)
                continue

        source_files.append(file)

    _debug_print("For %s..." % target)
    _debug_print("  Kind: %s" % ctx.rule.kind)
    _debug_print("  Files: %s" % source_files)
    _debug_print("  Data: %s" % data_files)
    _debug_print("  Is platform dependent: %s" % is_platform_dependent)
    _debug_print("  Is Python ABI dependent: %s" % is_pyabi_dependent)

    path_map.update(transitive_path_map)
    return [PipPackageInfo(
        source_depset = depset(source_files, transitive = transitive_source_depsets),
        data_depset = depset(data_files, transitive = transitive_data_depsets),
        path_map = path_map,
        is_platform_dependent = is_platform_dependent or transitive_is_platform_dependent,
        is_pyabi_dependent = is_pyabi_dependent or transitive_is_pyabi_dependent,
        pypi_dependencies = transitive_pypi_dependencies,
    )]

analyze_pip_package_deps_and_data = aspect(
    implementation = _analyze_pip_package_deps_and_data,
    # Defines the set of attributes on a rule that this aspect will recurse into.
    attr_aspects = [
        # We want to traverse down the entire dependency tree to find any
        # relevant Python source files.
        "deps",
        # `py_grpc_library` rules under the hood call their deps `py_deps`, so
        # we must traverse into that attribute as well.
        "py_deps",
        # Data dependencies may be simple files, but may also be generated
        # output produced by targets; we need to run our aspect on such targets
        # to determine whether the produced output is binary data.
        "data",
    ],
)

####################### The rule ######################

def _wheel_filename(distribution_tag, version_tag, python_tag, abi_tag, platform_tag):
    """Constructs a Python compatibility tag.

    The compatibility tag format is documented at:
      https://packaging.python.org/en/latest/specifications/platform-compatibility-tags/
    """
    return "%s-%s-%s-%s-%s.whl" % (
        distribution_tag,
        version_tag,
        python_tag,
        abi_tag,
        platform_tag,
    )

def _manylinux_platform_tag(glibc_version, cpu_architecture_name):
    """Makes a manylinux tag for the given glibc version and CPU architecture.

    The manylinux tag format is documented at:
      https://www.python.org/dev/peps/pep-0600
    """
    return "manylinux_%s_%s" % (
        glibc_version.replace(".", "_"),
        cpu_architecture_name,
    )

def _staging_path(file, path_maps):
    """
    Given a Bazel `file` object, returns the "staging path".

    The "staging path" is the path that the file should get staged at in the
    package in order to get built into the distribution the right way.
    """
    staged_path = file.short_path
    for mapped_path, replacement in path_maps.items():
        if staged_path.startswith(mapped_path):
            staged_path = staged_path.replace(mapped_path, replacement)
            break
    return staged_path

def _pip_package_impl(ctx):
    """
    The implementation of the `pip_package` Rule.

    The `pip_package` rule is the main entrypoint of this file. It takes the
    information produced by the aspect (above), and uses it to build a pip
    package (`.whl` file).
    """

    # We may have multiple `deps`, each of which has its own `PipPackageInfo`.
    # Combine those into one set of source files, data files, and so forth.
    source_depsets = []
    data_depsets = []
    path_maps = {}
    is_platform_dependent = False
    is_pyabi_dependent = False

    # Maps: [package name -> True].
    # Is a dict only for deduplication purposes.
    pypi_dependencies = {}
    for dep in ctx.attr.deps:
        if PipPackageInfo not in dep:
            _debug_print("Target %s does not have PipPackageInfo" % dep)
            continue
        source_depsets.append(dep[PipPackageInfo].source_depset)
        data_depsets.append(dep[PipPackageInfo].data_depset)
        path_maps.update(dep[PipPackageInfo].path_map)
        _debug_print("Dependency %s is platform dependent? %s" % (
            dep,
            dep[PipPackageInfo].is_platform_dependent,
        ))
        is_platform_dependent = is_platform_dependent or dep[PipPackageInfo].is_platform_dependent
        _debug_print("Dependency %s is Python ABI dependent? %s" % (
            dep,
            dep[PipPackageInfo].is_pyabi_dependent,
        ))
        is_pyabi_dependent = is_pyabi_dependent or dep[PipPackageInfo].is_pyabi_dependent
        pypi_dependencies.update(dep[PipPackageInfo].pypi_dependencies)

    source_depset = depset(transitive = source_depsets)
    data_depset = depset(transitive = data_depsets)
    _debug_print("Sources: %s" % source_depset)
    _debug_print("Data: %s" % data_depset)
    _debug_print("Path map: %s" % path_maps)
    _debug_print("PyPI dependencies: %s" % list(pypi_dependencies.keys()))
    _debug_print("Is platform dependent: %s" % is_platform_dependent)
    _debug_print("Is Python ABI dependent: %s" % is_pyabi_dependent)

    # We would love to simply use files as already laid out in Bazel's tree
    # structure, but that doesn't fly:
    #   * Bazel separates generated files and source files into separate
    #     directories, whereas we want to intermingle them in the package.
    #   * Bazel places files from this workspace in very different folders than
    #     files from other workspaces. We want to put them all in the same
    #     package.
    #   * We need to generate a few files, like `pyproject.toml`, that don't
    #     currently exist in the source tree.
    # The solution is to copy all the files into a staging directory, and then
    # build there. The layout we've chosen for that staging directory is the
    # following:
    #
    #   bazel-bin/
    #     <package this rule is used from>/
    #       .pip_package_name_of_rule/
    #         pyproject.toml
    #         README.md
    #         src/
    #           python_package_one/**
    #           python_package_two/**
    #
    # We run the build in `.../.pip_package_name_of_rule/`; the `src/` directory
    # is a standard convention that `setuptools` recognizes by default, and
    # allows us to have multiple top-level packages in the same built
    # distribution.
    #
    # Once we have all of these files in the right place we enumerate them in
    # `package_files` so that we can tell Bazel the full set of files that will
    # get included in the package.
    STAGING_DIRECTORY_NAME = ".pip_package_" + ctx.attr.name
    package_files = []
    seen_staged_paths = {}
    for file in source_depset.to_list() + data_depset.to_list():
        staged_path = _staging_path(file, path_maps)

        # Deduplicate files that map to the same staged path. This
        # can happen when the same physical file is reachable via
        # both a local workspace symlink and an external repository
        # (e.g., `//reboot/...` vs
        # `@com_github_reboot_dev_reboot//reboot/...`).
        if staged_path in seen_staged_paths:
            continue
        seen_staged_paths[staged_path] = True

        # TODO(rjh): use a symlink instead of a copy to make this faster?
        copy = ctx.actions.declare_file(
            "%s/src/%s" % (STAGING_DIRECTORY_NAME, staged_path),
        )
        ctx.actions.run_shell(
            mnemonic = "CopyToStaging",
            command = "mkdir -p %s; cp %s %s" % (copy.dirname, file.path, copy.path),
            inputs = [file],
            outputs = [copy],
        )
        package_files.append(copy)

    # With the sources and data files in place, we now need to generate (or copy
    # into place) the metadata files required to build a pip package.
    metadata_files = []

    ### README.md
    input_readme_md = ctx.file.readme_md
    staged_readme_md = ctx.actions.declare_file(
        "%s/README.md" % STAGING_DIRECTORY_NAME,
    )
    ctx.actions.run_shell(
        mnemonic = "StageReadme",
        command = "cp %s %s" % (input_readme_md.path, staged_readme_md.path),
        inputs = [input_readme_md],
        outputs = [staged_readme_md],
    )
    metadata_files.append(staged_readme_md)

    ### LICENSE
    input_license = ctx.file.license_txt
    staged_license = ctx.actions.declare_file(
        "%s/LICENSE" % STAGING_DIRECTORY_NAME,
    )
    ctx.actions.run_shell(
        mnemonic = "StageLicense",
        command = "cp %s %s" % (input_license.path, staged_license.path),
        inputs = [input_license],
        outputs = [staged_license],
    )
    metadata_files.append(staged_license)

    ### requirements.txt
    #
    # We have two sources of truth for dependencies:
    # 1. The `requirements.txt` file the user provides. This is the source that
    #    is leading, because it is the only source that tells us the original
    #    acceptable version _ranges_, as well as any other constraints the user
    #    may have specified. The Bazel view of the dependencies has only the
    #    single fetched version used at this point in time, and does not record
    #    constraints.
    # 2. The `PipPackageInfo` provided by the aspect. This source is incomplete
    #    (since it's missing version information), but is the only source that's
    #    not subject to human error. While the user's `requirements.txt` can
    #    fail to capture all of the `requirement()`s in the dependency tree, our
    #    `PipPackageInfo` captures exactly the set of `requirement()`s needed by
    #    our package.
    #
    # To have the best of both worlds, we'll base the `pyproject.toml` off the
    # `requirements.txt` provided by the user (as configured in the template),
    # but then verify that that file contains every dependency that the
    # `PipPackageInfo` says we need; we do that check in the trampoline below.
    input_requirements_txt = ctx.file.requirements_txt
    staged_requirements_txt = ctx.actions.declare_file(
        "%s/requirements.txt" % STAGING_DIRECTORY_NAME,
    )
    ctx.actions.run_shell(
        mnemonic = "StageRequirements",
        command = "cp %s %s" % (
            input_requirements_txt.path,
            staged_requirements_txt.path,
        ),
        inputs = [input_requirements_txt],
        outputs = [staged_requirements_txt],
    )
    metadata_files.append(staged_requirements_txt)

    ### pyproject.toml
    # The `pyproject.toml` file is the main configuration file that will control
    # the build; it will get generated based on the information we're gathering.

    # Classifiers are short strings that describe the package. The user might
    # have set some, but we'll add some more.
    classifiers = ctx.attr.classifiers + []  # `+ []` to copy immutable list.

    if is_platform_dependent:
        if ctx.attr.os_name == "linux":
            classifiers.append("Operating System :: POSIX :: Linux")
        elif ctx.attr.os_name == "macosx_13_0":
            classifiers.append("Operating System :: MacOS :: MacOS X")
        else:
            fail("Unsupported OS: %s" % ctx.attr.os_name)
    else:
        classifiers.append("Operating System :: OS Independent")

    if ctx.attr._python_version.startswith("3"):
        classifiers.append("Programming Language :: Python :: 3")
    else:
        fail("Unsupported Python version: %s" % ctx.attr._python_version)

    # The data files are organized into packages together with the source files,
    # but `setuptools` won't automatically pick them up (since they're not `.py`
    # files). Instead, we must explicitly tell `setuptools` which data files to
    # include for each package. The instruction for it is one line per package,
    # in a shape like:
    #   "package.name" = ["data_file_one.txt", "data_file_two.so"]
    #
    # To generate these lines, we must first group the data files by package.
    package_to_data_files = {}
    for file in data_depset.to_list():
        staged_path = _staging_path(file, path_maps)
        package_path, file_basename = staged_path.rsplit("/", 1)
        package_name = package_path.replace("/", ".")
        if package_name not in package_to_data_files:
            package_to_data_files[package_name] = []
        package_to_data_files[package_name].append(file_basename)

    package_data = ""
    for package_path, files in package_to_data_files.items():
        package_data += '"%s" = %s\n' % (package_path, files)

    # Scripts are defined in the `pyproject.toml` one-per-line.
    scripts = ""
    for script_name, script_entry_point in ctx.attr.scripts.items():
        scripts += '%s = "%s"\n' % (script_name, script_entry_point)

    version = ctx.attr.version
    license = ctx.attr.license
    pyproject_toml_file = ctx.actions.declare_file("%s/pyproject.toml" % STAGING_DIRECTORY_NAME)
    ctx.actions.expand_template(
        template = ctx.file._toml_template,
        output = pyproject_toml_file,
        substitutions = {
            "{CLASSIFIERS}": str(classifiers),
            "{DESCRIPTION}": ctx.attr.description,
            "{LICENSE}": license,
            "{NAME}": ctx.attr.distribution_name,
            "{PACKAGE_DATA}": package_data,
            "{SCRIPTS}": scripts,
            "{VERSION}": version,
        },
    )
    metadata_files.append(pyproject_toml_file)

    ### The compatibility tags.
    # The filename of the built `.whl` file is built up out of a set of tags,
    # which indicate the platform(s) the distribution is compatible with.
    # Their format is documented here:
    #   https://packaging.python.org/en/latest/specifications/platform-compatibility-tags/#use
    # The following are the default tags for a Python 3.* package that's
    # otherwise platform-independent.
    distribution_tag = ctx.attr.distribution_name
    version_tag = version
    python_tag = "py3"
    abi_tag = "none"
    platform_tag = "any"

    ### setup.py
    # If this target contains binary data, we must inform `setuptools` of that.
    # Unfortunately that's not just a mere setting in a config file; we must add
    # our custom `setup.py`.
    if is_platform_dependent or is_pyabi_dependent:
        if is_pyabi_dependent:
            # By building a platform-dependent distribution the Python version tag
            # changes to e.g. "cp310", short for "CPython 3.10".
            python_tag = "cp%s" % (ctx.attr._python_version.replace(".", ""))

            # Since `setuptools` doesn't actually do the compilation for us the
            # compilation flags tag merely changes to match the Python version
            # tag.
            abi_tag = python_tag

        # Platform-dependent binaries means a platform-dependent tag.
        platform_tag = ctx.attr.os_name + "_" + ctx.attr.cpu_architecture_name

        setup_py_file = ctx.actions.declare_file("%s/setup.py" % STAGING_DIRECTORY_NAME)
        ctx.actions.expand_template(
            template = ctx.file._setup_py_template,
            output = setup_py_file,
            substitutions = {
                "{DISTCLASS_ARG}": "distclass=BinaryDistribution," if is_pyabi_dependent else "",
                "{PLATFORM}": repr(platform_tag),
            },
        )
        metadata_files.append(setup_py_file)

    # We can now know the name of the `.whl` file we'll build.
    built_whl = ctx.actions.declare_file(_wheel_filename(
        distribution_tag,
        version_tag,
        python_tag,
        abi_tag,
        platform_tag,
    ))

    # We're ready to start building!
    #
    # One cannot, however, simply invoke `setuptools` from Bazel; `setuptools`
    # (and particularly its `build` frontend), expects to be in a writable
    # working directory, which Bazel doesn't provide. We use a little trampoline
    # program to work around that; it will put us in a writable working
    # directory.
    working_directory = ctx.bin_dir.path + "/"
    input_directory = pyproject_toml_file.dirname.removeprefix(working_directory)
    output_directory = built_whl.dirname.removeprefix(working_directory)
    ctx.actions.run(
        mnemonic = "PythonBuildWheel",
        executable = ctx.executable._build_tool,
        arguments = [
            "--working-directory",
            working_directory,
            "--input-directory",
            input_directory,
            "--output-directory",
            output_directory,
            "--verify-python-version",
            ctx.attr._python_version,
            "--requirements-txt",
            staged_requirements_txt.path,
        ] + [
            "--verify-dependency-in-requirements=%s" % dependency
            for dependency in pypi_dependencies.keys()
        ],
        inputs = metadata_files + package_files,
        outputs = [built_whl],
    )

    # Determine if auditwheel should be run on this wheel. Auditwheel is
    # needed for Linux platform-dependent wheels being released to PyPI.
    needs_auditwheel = (
        (is_platform_dependent or is_pyabi_dependent) and
        ctx.attr.os_name == "linux"
    )

    return [
        DefaultInfo(files = depset([built_whl])),
        PipPackageWheelInfo(
            wheel = built_whl,
            distribution_tag = distribution_tag,
            version_tag = version_tag,
            python_tag = python_tag,
            abi_tag = abi_tag,
            platform_tag = platform_tag,
            needs_auditwheel = needs_auditwheel,
            cpu_architecture_name = ctx.attr.cpu_architecture_name,
        ),
    ]

_pip_package = rule(
    implementation = _pip_package_impl,
    attrs = {
        "classifiers": attr.string_list(
            doc = "The classifiers to use for the pip package.",
            mandatory = False,
        ),
        "cpu_architecture_name": attr.string(
            doc = "The name of the CPU architecture this pip package is " +
                  "built on. E.g. `x86_64`.",
            mandatory = True,
        ),
        "deps": attr.label_list(
            aspects = [analyze_pip_package_deps_and_data],
            doc = "The `py_library` targets being packaged into this pip " +
                  "package.",
            mandatory = True,
        ),
        "description": attr.string(
            doc = "A short description of the pip package being built.",
            mandatory = True,
        ),
        "distribution_name": attr.string(
            doc = "The name of the distribution to generate.",
            mandatory = True,
        ),
        "license": attr.string(
            doc = "The license to use for the pip package.",
            mandatory = True,
        ),
        "license_txt": attr.label(
            allow_single_file = True,
            doc = "The `LICENSE.txt` file for the pip package",
            mandatory = True,
        ),
        "os_name": attr.string(
            doc = "The name of the operating system this pip package is " +
                  "built on. E.g. `linux`.",
            mandatory = True,
        ),
        "readme_md": attr.label(
            allow_single_file = True,
            doc = "The file that will be used as the README.md file in the " +
                  "pip package.",
            mandatory = True,
        ),
        "requirements_txt": attr.label(
            allow_single_file = True,
            doc = "The `requirements.txt` file that determines the " +
                  "dependencies this pip package will have.",
            mandatory = True,
        ),
        "scripts": attr.string_dict(
            default = {},
            doc = "The scripts (AKA executables) that will be installed by " +
                  "this pip package. The keys are the names of the scripts, " +
                  "and the values are the entry points that will be invoked " +
                  "when the script is run.",
        ),
        "version": attr.string(
            doc = "The version number of the pip package being built. " +
                  "E.g. `1.2.3`.",
            mandatory = True,
        ),
        "_build_tool": attr.label(
            # A pointer to the build trampoline program. See the
            # `_pip_package_impl` and the program itself for more info.
            default = Label("//bazel/pip_package_rule:build_trampoline"),
            executable = True,
            cfg = "exec",
        ),
        # TODO(rjh): Can we auto-detect this when Bazel is just using the system
        #            Python? Could we do it if we moved to a hermetic Python?
        "_python_version": attr.string(
            default = "3.10",
        ),
        "_setup_py_template": attr.label(
            # A pointer to the template for the `setup.py` file.
            default = Label("//bazel/pip_package_rule:setup.py.template"),
            allow_single_file = True,
        ),
        "_toml_template": attr.label(
            # A pointer to the template for the `pyproject.toml` file.
            default = Label("//bazel/pip_package_rule:pyproject.toml.template"),
            allow_single_file = True,
        ),
    },
)

def _pip_package_audited_impl(ctx):
    """
    Runs auditwheel on a pip package wheel to produce a manylinux wheel.

    This rule takes a wheel produced by `_pip_package` and, if the wheel
    contains platform-dependent code on Linux, runs `auditwheel` on it to
    produce a manylinux-compatible wheel. If auditwheel is not needed (e.g.,
    pure Python packages or non-Linux platforms), it simply returns the input
    wheel unchanged.
    """
    wheel_info = ctx.attr.wheel[PipPackageWheelInfo]
    input_wheel = wheel_info.wheel

    if not wheel_info.needs_auditwheel:
        # Auditwheel not needed; just return the input wheel as-is.
        return [
            DefaultInfo(files = depset([input_wheel])),
        ]

    ### Auditwheel and "manylinux".
    #
    # To upload binary distributions for Linux to PyPI they must be
    # "manylinux" compatible; "manylinux" is most usefully documented in:
    #   * https://peps.python.org/pep-0513 (concept).
    #   * https://peps.python.org/pep-0600 (modern tags).
    # TL;DR: it's a set of rules that ensure that a binary distribution will
    # run on a wide variety of Linux machines, despite varying `glibc`
    # versions and shared libraries present. The "manylinux" tag you choose
    # for your package indicates the minimum `glibc` version needed, e.g.:
    #   "manylinux_2_35_[...]" --> glibc >= 2.35.
    #
    # The "manylinux" rules are enforced by `auditwheel`. It serves three
    # purposes:
    #   1. Validate that the binary distribution being built is compatible
    #      with the "manylinux" tag being claimed.
    #   2. Patch shared libraries not guaranteed by "manylinux" into the
    #      distribution, so that they become effectively static. This is
    #      only relevant if the distribution's binaries aren't already
    #      statically linked.
    #   3. Re-tag the `.whl` package with its new "manylinux" tag; this is
    #      essentially just a filename change.
    manylinux_platform_tag = _manylinux_platform_tag(
        ctx.attr._glibc_version,
        wheel_info.cpu_architecture_name,
    )
    audited_whl = ctx.actions.declare_file(_wheel_filename(
        wheel_info.distribution_tag,
        wheel_info.version_tag,
        wheel_info.python_tag,
        wheel_info.abi_tag,
        manylinux_platform_tag,
    ))
    ctx.actions.run(
        mnemonic = "PythonAuditWheel",
        executable = ctx.executable._auditwheel_tool,
        arguments = [
            # The "repair" command is the one that performs the three tasks
            # mentioned above.
            "repair",
            # The platform we're building for.
            "--plat=%s" % manylinux_platform_tag,
            # Only use the requested platform tag, not "higher priority"
            # compatible tags. This ensures predictable output filenames.
            "--only-plat",
            # The output directory for the audited wheel.
            "-w=%s" % audited_whl.dirname,
            # The input wheel.
            input_wheel.path,
        ],
        inputs = [input_wheel],
        outputs = [audited_whl],
    )

    return [
        DefaultInfo(files = depset([audited_whl])),
    ]

_pip_package_audited = rule(
    implementation = _pip_package_audited_impl,
    attrs = {
        "wheel": attr.label(
            doc = "The `_pip_package` target whose wheel will be audited.",
            mandatory = True,
            providers = [PipPackageWheelInfo],
        ),
        "_auditwheel_tool": attr.label(
            # A pointer to the `auditwheel` trampoline program.
            default = Label("//bazel/pip_package_rule:auditwheel_trampoline"),
            executable = True,
            cfg = "exec",
        ),
        # To remain compatible with older Linuxes, we must use an old
        # glibc. Most notably: Amazon Linux 2023 (as used by e.g. Vercel
        # builders) needs 2.34.
        "_glibc_version": attr.string(
            default = "2.34",
        ),
    },
)

def _pip_package_publish_impl(ctx):
    """
    Publishes a given `pip_package` to PyPI.
    """

    # Find the file we're publishing.
    whl_to_publish = ctx.attr.pip_package.files.to_list()[0]

    # To publish the wheel, we're going to use the twine trampoline we've been
    # given. We need to forward its runfiles, so they'll be available when it
    # executes.
    twine_trampoline_executable = ctx.attr._twine_tool.files_to_run.executable
    runfiles = ctx.runfiles(
        # We'll need the pip package itself available at runtime.
        [whl_to_publish],
    ).merge(
        # And we'll need the `twine` trampoline and everything it needs to run.
        ctx.attr._twine_tool[DefaultInfo].default_runfiles,
    )

    # Since this is an _executable_ rule, we can't just run `twine`; we have to
    # produce an executable that will run `twine`. The easiest way of doing that
    # is by producing a small shell script.
    output_executable = ctx.actions.declare_file(
        "publish_%s.sh" %
        whl_to_publish.basename,
        sibling = whl_to_publish,
    )
    ctx.actions.write(
        output = output_executable,
        content = "#!/bin/bash\n" +
                  "set -e\n" +
                  "TWINE_USERNAME=__token__ %s upload %s\n" % (
                      twine_trampoline_executable.short_path,
                      whl_to_publish.short_path,
                  ),
        is_executable = True,
    )

    return [
        DefaultInfo(
            executable = output_executable,
            runfiles = runfiles,
        ),
    ]

_pip_package_publish = rule(
    implementation = _pip_package_publish_impl,
    executable = True,
    attrs = {
        "pip_package": attr.label(
            doc = "The `pip_package` rule that will be published.",
            mandatory = True,
        ),
        "_twine_tool": attr.label(
            # A pointer to the `twine` trampoline program that exists to give us
            # a runnable label for the `twine` program.
            default = Label("//bazel/pip_package_rule:twine_trampoline"),
            executable = True,
            cfg = "exec",
        ),
    },
)

def pip_package(name, visibility, tags = [], **kwargs):
    """
    Builds a pip package.

    See `_pip_package` for more information.

    This macro creates three targets:
      * `name.dev`: Builds the wheel without auditwheel processing. Use this
        during development for faster builds.
      * `name`: Runs auditwheel on the `.dev` wheel to produce a manylinux
        wheel suitable for release. Tagged "manual" since auditwheel requires
        a specific glibc version.
      * `name.publish`: An executable target that uploads the wheel to PyPI.

    Args:
      name: Name of the target.
      visibility: Bazel visibility.
      tags: Tags to apply to all targets. The `name` target will also get the
            "manual" tag, since auditwheel may fail on workstations with a
            too-new `glibc`.
      **kwargs: All other arguments are passed through to `_pip_package`
                unmodified.

    """
    distribution_name = name.replace("-", "_")
    dev_name = "%s.dev" % name

    # The development wheel is the base; it builds the wheel without
    # auditwheel processing. This is faster to build and works on any
    # workstation.
    _pip_package(
        name = dev_name,
        distribution_name = distribution_name,
        # Translate from Bazel's platform name to Python's CPU architecture
        # name.
        cpu_architecture_name = host_arch,
        # Translate from Bazel's platform name to Python's operating system
        # name.
        #
        # This code is trying to guess what "tag" the wheel `build` tool will
        # pick for its output file. If we guess wrong bazel will throw an
        # error, saying the expected output file was not created. Since
        # `build`'s mechanism to pick the architecture name is undocumented,
        # we can only go by observation.
        os_name = select(
            {
                "@platforms//os:linux": "linux",
                # The 'macosx_13_0' tag is what we get running on a GitHub
                # Actions M1 runner.
                "@platforms//os:osx": "macosx_13_0",
            },
        ),
        tags = tags,
        visibility = visibility,
        **kwargs
    )

    # The release target runs auditwheel on the development wheel to produce
    # a manylinux wheel. It is tagged "manual" so that it is not built by
    # wildcards like `//reboot/...`, because auditwheel may fail on
    # workstations with a too-new `glibc`.
    _pip_package_audited(
        name = name,
        wheel = dev_name,
        tags = tags + ["manual"],
        visibility = visibility,
    )

    # The `<name>.publish` target is a `bazel run`nable (executable) target
    # that allows the user to upload their built pip package to PyPI. This
    # naming matches that of the official `rules_python`'s implementation of
    # `py_wheel`.
    #
    # This builds the release (audited) package, so is subject to a `glibc`
    # check to ensure we don't release customer-incompatible packages. It is
    # tagged "manual" because it depends on the audited wheel, which requires
    # a specific glibc version.
    _pip_package_publish(
        name = name + ".publish",
        pip_package = name,
        tags = tags + ["manual"],
    )
