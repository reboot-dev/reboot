# macOS source-build toolchain

Use Bazelisk with this checkout's `.bazeliskrc` (Bazel 8.7.0). The build still
uses legacy `WORKSPACE.bazel`; moving to Bazel 9 is not a fix for this workspace.

## `dyld: missing LC_UUID load command ... local_config_apple_cc/wrapped_clang`

This is a compiler-bootstrap failure, not an Abseil compilation error. dyld
rejects the compiler wrapper before it can execute Clang.

The dependency chain is:

1. `bazel/repos.bzl` pins gRPC **1.71.0**.
2. `bazel/deps.bzl` calls `grpc_deps()`, whose
   [`grpc_deps.bzl`](https://github.com/grpc/grpc/blob/v1.71.0/bazel/grpc_deps.bzl)
   conditionally declares `build_bazel_apple_support` at **1.17.1** (and
   `rules_cc` at 0.0.17).
3. `bazel/extra_deps.bzl` calls `grpc_extra_deps()`, which calls
   `apple_support_dependencies()`. That calls `apple_cc_configure()` and creates
   `local_config_apple_cc`.
4. apple_support 1.17.1's
   [`crosstool/osx_cc_configure.bzl`](https://github.com/bazelbuild/apple_support/blob/1.17.1/crosstool/osx_cc_configure.bzl)
   builds `wrapped_clang` using `-Wl,-no_uuid` and `-Wl,-no_adhoc_codesign`, then
   manually signs it. `wrapped_clang_pp` points to the same wrapper. The missing
   UUID is incompatible with newer macOS dyld requirements.

The `submodules/dev-tools` pin supplies development configuration, **not** this
Apple toolchain version. Upgrading Bazel alone does not update gRPC's pin.
[Bazel issue 27026](https://github.com/bazelbuild/bazel/issues/27026) describes the
same symptom for the older, built-in `local_config_cc` implementation;
[Bazel PR 27014](https://github.com/bazelbuild/bazel/pull/27014) fixes its
`xcode_locator`, not this separately pinned Apple wrapper.

## Narrow repository fix

`WORKSPACE.bazel` declares the same apple_support 1.17.1 release archive **before**
the conditional transitive declarations, applying
`bazel/apple_support_preserve_uuid.patch`. It backports
[apple_support PR 373 / commit 44c43c715aa58d16dc713ec0daa0a4373c39245a](https://github.com/bazelbuild/apple_support/commit/44c43c715aa58d16dc713ec0daa0a4373c39245a)
to the older helper location. It removes both linker workarounds and the manual
re-signing step, allowing normal linker UUID generation and ad-hoc signing.
The upstream change had moved to `universal_exec_tool.bzl`; its patch cannot be
applied verbatim to 1.17.1. No other dependency versions change.

After obtaining this source change, run from the Reboot checkout on the Mac:

```sh
cd "$REBOOT_ACP_CHECKOUT"
git submodule update --init --recursive
bazel version                         # Expect Bazel 8.7.0 via Bazelisk.
bazel sync --configure                # Reconfigure repository-rule toolchains.
bazel build @com_google_absl//absl/base:log_severity
wrapper="$(bazel info output_base)/external/local_config_apple_cc/wrapped_clang"
otool -l "$wrapper" | grep -A2 LC_UUID
codesign --verify --verbose "$wrapper"
```

`otool` should show an `LC_UUID` for each of the arm64 and x86_64 slices.
The small Abseil build must actually succeed; inspecting the wrapper alone is
not native-build acceptance. Then retry the dashboard from the application
checkout (the launcher preserves the caller's directory):

```sh
"$REBOOT_ACP_CHECKOUT/rbt.sh" dashboard \
  --agent-config="$HOME/local-acp/agents.json" \
  --port=9871
```

Do not edit generated external repositories, delete caches, or disable OS
security. The supported `bazel sync --configure` command regenerates configured
repositories from source. These commands are the macOS verification procedure;
Linux source validation does **not** establish macOS 27 / Xcode 27.1 support or
prove the complete native dashboard build.

## Source validation on any host

Download the exact unmodified upstream release, then validate its checksum,
patch application without fuzz/offset, declaration ordering, helper-only scope,
universal compiler argv, linker defaults, and compile-error propagation:

```sh
archive="${TMPDIR:-.}/apple_support.1.17.1.tar.gz"
curl -fL \
  https://storage.googleapis.com/grpc-bazel-mirror/github.com/bazelbuild/apple_support/releases/download/1.17.1/apple_support.1.17.1.tar.gz \
  -o "$archive"
python3 bazel/tests/apple_support_patch_test.py "$archive"
python3 tests/reboot/cli/source_launcher_tests.py
git diff --check
```

The test executes the helper's Python-compatible syntax with a recording
repository context. It is a source/argv regression check, not a Bazel interpreter,
Xcode linker, code-signature, dyld, or native runtime test.
