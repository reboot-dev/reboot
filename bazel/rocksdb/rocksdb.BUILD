load("@rules_foreign_cc//foreign_cc:defs.bzl", "cmake")

filegroup(
    name = "all",
    srcs = glob(["**"]),
    visibility = ["//visibility:public"],
)

cmake(
    name = "rocksdb",
    # Build rocksdb in parallel! This may "overload" the system as
    # bazel won't know how many CPUs we are using but until
    # https://github.com/bazelbuild/rules_foreign_cc/issues/329 is
    # resolved there doesn't appear to be a better way and since
    # rocksdb is such a long pole in the tent we'd rather have it
    # overlap with other builds for some time but get the parallel
    # speedup once it's the only thing left running.
    build_args = [
        "--",  # <- Pass remaining options to the native tool.
        # We should be able to get the number of cores both on
        # Linux and OSX.
        "-j `getconf _NPROCESSORS_ONLN`",
    ],
    cache_entries = {
        "CMAKE_BUILD_TYPE": "Release",
        # We need to use position independent code in order to support
        # linking this library into a shared library/object which is
        # necessary, for example, when using 'pybind_extension' (to
        # embed a C++ library/module into Python).
        #
        # The `-include cstdint` flag forces inclusion of <cstdint> to
        # fix builds with strict clang 20+ which don't implicitly
        # include standard integer types.
        "CMAKE_CXX_FLAGS": "-fPIC -include cstdint",
        "CMAKE_C_FLAGS": "-fPIC -include stdint.h",
        # Force install to lib/ instead of lib64/ for compatibility
        # with both Debian/Ubuntu (which use lib/) and RedHat-based
        # systems like AlmaLinux (which use lib64/).
        "CMAKE_INSTALL_LIBDIR": "lib",
        # We turn off failing on warnings by default because newer
        # versions of clang require using '--ld-path=' instead of
        # '-fuse-ld=' which it looks like 'rules_foreign_cc' and or
        # this 'cmake' target use by default.
        "FAIL_ON_WARNINGS": "OFF",
        # By default, RocksDB uses all CPU features of the compilation
        # host, which will not result in a portable binary. See:
        # https://github.com/facebook/rocksdb/blob/7622029101e8e93d89b6d3778a53ff0f68580067/INSTALL.md?plain=1#L23-L31
        "PORTABLE": "haswell",
        # By default, RTTI is only enabled in debug mode, but implementing a
        # SliceTransform (and putting it in a shared_pointer in order to use
        # it in an Options struct) seems to require it.
        "USE_RTTI": "ON",
        "WITH_ALL_TESTS": "OFF",
        # Turn off building all 'tools' and 'tests' to speed up the
        # build (we're just after the static library to link against).
        "WITH_BENCHMARK_TOOLS": "OFF",
        "WITH_CORE_TOOLS": "OFF",
        "WITH_TESTS": "OFF",
        "WITH_TOOLS": "OFF",
        "WITH_TRACE_TOOLS": "OFF",
    },
    lib_source = ":all",
    out_static_libs = ["librocksdb.a"],
    tags = ["no-cache"],
    visibility = ["//visibility:public"],
    deps = [
        "@com_github_gflags_gflags//:gflags",
    ],
)
