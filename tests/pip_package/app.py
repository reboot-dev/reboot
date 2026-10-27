"""An application whose `BUILD.bazel` declares a dependency on another
workspace's code."""


def greeting() -> str:
    return "hello"
