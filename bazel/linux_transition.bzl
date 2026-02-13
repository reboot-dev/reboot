"""We run 'local_envoy_nanny' in a Linux Docker container, so to support
native MacOS builds we need to cross-compile it for Linux.
We apply a transition to the 'cc_binary' rule to make sure we compile the target
for Linux and use a Linux toolchain."""

load("@host_arch_detector//:host_arch.bzl", "host_arch")

def _linux_transition_impl(_settings, _attr):
    if host_arch == "arm64" or host_arch == "aarch64":
        platform_setting = "@zig_sdk//platform:linux_arm64"

        # 'musl' is a lightweight alternative to 'glibc' that is used in
        # Linux Docker containers and is preferred for static linking.
        toolchain_setting = "@zig_sdk//toolchain:linux_arm64_musl"
    elif host_arch == "x86_64":
        platform_setting = "@zig_sdk//platform:linux_x86_64"

        # See note on 'musl' above.
        toolchain_setting = "@zig_sdk//toolchain:x86_64-linux-musl"
    else:
        fail("Unsupported host architecture: %s" % host_arch)

    return {
        "//command_line_option:extra_toolchains": toolchain_setting,
        "//command_line_option:incompatible_enable_cc_toolchain_resolution": "true",
        "//command_line_option:platforms": platform_setting,
    }

linux_transition = transition(
    implementation = _linux_transition_impl,
    inputs = [],
    outputs = [
        "//command_line_option:extra_toolchains",
        "//command_line_option:incompatible_enable_cc_toolchain_resolution",
        "//command_line_option:platforms",
    ],
)

def _cc_binary_linux_impl(ctx):
    cc_target = ctx.attr.data[0][DefaultInfo]

    files = cc_target.files
    runfiles = cc_target.default_runfiles

    return [DefaultInfo(files = files, runfiles = runfiles)]

cc_binary_linux = rule(
    implementation = _cc_binary_linux_impl,
    cfg = linux_transition,
    attrs = {
        "data": attr.label(cfg = linux_transition),
        # Allow all packages to use this transition; see:
        # https://docs.bazel.build/versions/3.5.0/skylark/config.html#user-defined-transitions.
        "_allowlist_function_transition": attr.label(
            default = "@bazel_tools//tools/allowlists/function_transition_allowlist",
        ),
    },
)
