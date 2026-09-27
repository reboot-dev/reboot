"""Where `protoc` finds the `.proto` files a developer imports but
did not write: Reboot's own, and `google.protobuf`'s."""
from importlib import resources


def reboot_proto_paths() -> list[str]:
    """Returns every directory holding Reboot's `rbt/...` protos,
    sorted, so that developers don't need to provide their own."""
    # We want to find all Python `site-packages`/`dist-packages` directories
    # that (may) contain a 'rbt/v1alpha1' directory, which is where we'll find
    # our protos.
    #
    # We can look for Python packages like a 'rbt' folder via the `resources`
    # module; the resulting path is a `MultiplexedPath`, since there may be
    # multiple.
    #
    # HOWEVER, the `resources` module does NOT work well when all subpaths of
    # one `rbt/` folder are ALSO present in another `rbt/` folder - e.g. if we
    # have two `rbt/v1alpha1` folders in two separate locations (in two Bazel
    # repos, say), we will get just one of those `rbt/v1alpha1` folders, and
    # thereby maybe only ever see one of the `rbt/` folders too (if there's
    # nothing unique inside it). So instead of looking for `rbt/` (which only
    # contains `v1alpha1/`, which is not unique) we look for its sibling path
    # `reboot/`, which contains a lot of unique names in every place it is
    # present.
    #
    # The paths we get don't contain a `parent` attribute, since there isn't one
    # answer. Instead we use `iterdir()` to get all of the children of all
    # 'reboot' folders, and then dedupe parents-of-the-parents-of-those-children
    # (via the `set`), which gives us the 'rbt' folders' parents' paths.
    reboot_parent_paths: set[str] = set()
    for resource in resources.files('reboot').iterdir():
        with resources.as_file(resource) as path:
            reboot_parent_paths.add(str(path.parent.parent))

    if len(reboot_parent_paths) == 0:
        raise FileNotFoundError(
            "Failed to find 'rbt' resource path. "
            "Please report this bug to the maintainers."
        )

    return sorted(reboot_parent_paths)


def google_proto_path() -> str:
    """Returns the directory holding the `google.protobuf.*` protos,
    which we conveniently have packaged in our Python package, so
    that developers don't need to provide them."""
    return str(resources.files('grpc_tools').joinpath('_proto'))
