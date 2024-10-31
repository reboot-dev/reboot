"""Rules for detecting the host architecture. We use this later to determine
which toolchains to pick on a cross-compile step."""

def _detect_host_arch_impl(repository_ctx):
    arch = repository_ctx.execute(["uname", "-m"])

    if arch.return_code != 0:
        fail("Failed to execute \"uname -m\": " + arch.stderr.strip())

    output = arch.stdout.strip()
    arch_content = ""

    if "x86_64" == output or "amd64" == output:
        arch_content = "x86_64"
    elif "arm64" == output or "aarch64" == output:
        # Save the original output, since Python wheel naming uses 'aarch64'
        # for Linux and 'arm64' for macOS.
        arch_content = output
    else:
        fail("Unsupported architecture: " + output)

    # Since the 'select' mechanism is not supported in repository rules,
    # we have to write the host architecture to a file and load it from there.
    repository_ctx.file("BUILD", "")
    repository_ctx.file("host_arch.bzl", "host_arch = '{}'".format(arch_content))

detect_host_arch = repository_rule(
    implementation = _detect_host_arch_impl,
    local = True,
)
