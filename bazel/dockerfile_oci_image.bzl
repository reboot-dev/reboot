"""Repository rule for building an OCI image from a Dockerfile and saving it
   into a tar file.

This rule uses "docker buildx" to build the image and save it as a tar file.
Unlike `dockerfile_image` in rules_docker, the image is not added to any image
store automatically, but that can be done subsequently if desired.

The tar file is written to @repo-name//image:dockerfile_image.tar to maintain
compatibility with rules_docker.
"""

def _create_builder_if_not_exists(ctx):
    """Create a `docker-container` builder, if one doesn't exist yet.

    Annoyingly, creating a tar file via `docker buildx` is not supported by the
    default `docker` BuildKit driver, so we create a new `docker-container`
    driver, if necessary.
    """
    result = ctx.execute(["docker", "buildx", "inspect", "rbt-container-builder"])

    if result.return_code:
        # There might be multiple invocations of this rule in parallel, so we
        # might attempt to create the builder multiple times if there is a race.
        # That should be safe, so we just ignore any errors here.
        ctx.execute([
            "docker",
            "buildx",
            "create",
            "--driver=docker-container",
            "--name=rbt-container-builder",
        ])

def _impl(ctx):
    """Core implementation of dockerfile_oci_image."""
    _create_builder_if_not_exists(ctx)

    dockerfile_path = ctx.path(ctx.attr.dockerfile)
    image_tar = "dockerfile_image.tar"
    dest_path = "image/{}".format(image_tar)

    ctx.file("image/BUILD", """
package(default_visibility = ["//visibility:public"])
exports_files(["{}"])
""".format(image_tar))

    # TODO: Using `output=type=oci` results in an error about a missing
    # `manifest.json` when using `oci_image`.
    command = ["docker", "build"]
    command.extend([
        "--builder=rbt-container-builder",
        "--output=type=docker,dest=" + dest_path,
        "-f",
        str(dockerfile_path),
    ])
    if ctx.attr.target:
        command.extend(["--target", ctx.attr.target])

    # Use the directory containing the Dockerfile as the Docker build context
    command.append(str(dockerfile_path.dirname))

    build_result = ctx.execute(command)
    if build_result.return_code:
        fail("docker buildx command failed: {} ({})".format(
            build_result.stderr,
            " ".join(command),
        ))

dockerfile_oci_image = repository_rule(
    attrs = {
        "dockerfile": attr.label(
            allow_single_file = True,
            mandatory = True,
            doc = "The label for the Dockerfile to build the image from.",
        ),
        "target": attr.string(
            doc = "Specify which intermediate stage to finish at, passed to `--target`.",
        ),
    },
    implementation = _impl,
)
