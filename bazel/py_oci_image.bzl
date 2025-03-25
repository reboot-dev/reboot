"""Replacement for py3_image from rules_docker."""

load("@rules_oci//oci:defs.bzl", "oci_image", "oci_tarball")
load("@rules_pkg//pkg:tar.bzl", "pkg_tar")
load("@rules_python//python:defs.bzl", "py_binary")

def py_oci_image(name, main, srcs, deps, base, env = None, **kwargs):
    """Constructs an OCI container image wrapping a py_binary target.

    Args:
        name: Name of the rule.
        main: Main Python file to execute.
        srcs: Python source files.
        deps: Dependencies of the image.
        base: Base image to use.
        env: Environment variables to be set in the image.
        **kwargs: See py_binary.
    """
    binary_name = name + "_binary"
    layer_name = name + "_layer"
    tarball_name = name + "_tarball"
    tar_name = tarball_name + "_tar"
    output_name = name + ".tar"

    py_binary(
        name = binary_name,
        main = main,
        srcs = srcs,
        deps = deps,
        **kwargs
    )

    # Create a tarball with the Python binary and its dependencies to be used as
    # a layer.
    pkg_tar(
        name = layer_name,
        srcs = [":" + binary_name],
        include_runfiles = True,
        strip_prefix = ".",
        package_dir = "/app/reboot/" + name,
    )

    # Create the OCI image with the Python layer. This creates an "OCI layout"
    # as a directory tree.
    visibility = kwargs.get("visibility", None)
    oci_image(
        name = name,
        base = base,
        tars = [":" + layer_name],
        env = env,
        entrypoint = ["/usr/bin/python", "/app/reboot/{}/{}".format(name, binary_name)],
        visibility = visibility,
    )

    # The `oci_tarball` docs say that it does not produce a tarball by default
    # (rather, "an mtree specification file"), but that does not seem to be the
    # case. However, the tarball is placed at an odd path, so we copy it to the
    # location where other rules expect to find it.
    oci_tarball(
        name = tarball_name,
        image = ":" + name,
        repo_tags = [name + ":latest"],
    )

    # TODO: The `oci_tarball` docs say that the "tarball" output group needs to
    # be to specified to produce a tar file, but that does not seem to be true.
    native.filegroup(
        name = tar_name,
        srcs = [":" + tarball_name],
    )

    # Copy the tar file to the location where other rules expect to find it.
    #
    # TODO: symlinking would be more efficient but it fails for unclear reasons
    # ("dangling symlink").
    native.genrule(
        name = tarball_name + "_copy",
        srcs = [":" + tar_name],
        outs = [output_name],
        cmd = "cp $(location {}) $(OUTS)".format(tar_name),
        visibility = visibility,
    )
