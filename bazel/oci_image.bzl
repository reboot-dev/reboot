"""Replacement for py3_image from rules_docker."""

load("@rules_oci//oci:defs.bzl", "oci_image", "oci_tarball")
load("@rules_pkg//pkg:tar.bzl", "pkg_tar")
load("@rules_python//python:defs.bzl", "py_binary")

def oci_image_with_tar(name, visibility, **kwargs):
    """Constructs an OCI container image and a tarball of it.

    Args:
        name: Name of the rule.
        visibility: Visibility of the rule.
        **kwargs: See oci_image.
    """
    oci_image(
        name = name,
        visibility = visibility,
        **kwargs
    )

    _oci_image_tar(name, ":" + name, visibility)

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
    oci_image_with_tar(
        name = name,
        base = base,
        tars = [":" + layer_name],
        env = env,
        entrypoint = ["/usr/bin/python", "/app/reboot/{}/{}".format(name, binary_name)],
        visibility = visibility,
    )

def _oci_image_tar(name, oci_image, visibility):
    oci_tarball(
        name = name + "_tarball",
        image = oci_image,
        repo_tags = [name + ":latest"],
    )

    # Copy the tar file to the location where other rules expect to find it.
    #
    # TODO: symlinking would be more efficient but it fails for unclear reasons
    # ("dangling symlink").
    native.genrule(
        name = name + "_tarball_copy",
        srcs = [":" + name + "_tarball"],
        outs = [name + ".tar"],
        cmd = "cp $(location {}_tarball) $(OUTS)".format(name),
        visibility = visibility,
    )
