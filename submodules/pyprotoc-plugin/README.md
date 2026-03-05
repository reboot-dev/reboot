# pyprotoc_plugin

The package provides a small `python3` library as well as some `bazel` templates to
make it easier for developers using `bazel` to write `protoc` plugins and generate custom code from protobuf files.

## Requirements

`pyprotoc_plugin` works with Python `>=3.9`.

The `requirements_lock.txt` is used at `pip_parse`, to correctly update it (pick all transitive dependencies), run
`bazel run :requirements.update`.

## Creating a plugin

A `protoc` plugin is any executable, named `protoc-gen-.*`, that can read and write `protoc` compatible input and output from `stdin` and `stdout`.

The minimum viable `protoc`-plugin would be something like

```python
#!/usr/bin/env python3
from pyprotoc_plugin.plugins import ProtocPlugin
from google.protobuf.descriptor_pb2 import FileDescriptorProto

class NopPlugin(ProtocPlugin):

    def process_file(self, proto_file: FileDescriptorProto) -> None:
        # Do nothing (for now).
        pass


if __name__ == '__main__':
    NopPlugin.execute()

```

The method `process_file` is called once for each `.proto` provided in the input stream by `protoc`.

The base class `ProtocPlugin` exposes wrappers of the input stream and output stream through the attributes `self.request` and `self.response`.
The `self.response` has helper methods for writing out files:

```python
    ...
    def my_custom_output_example(self, output_file_name: str, content: str) -> None:
        output_file = self.response.file.add()
        output_file.name = output_file_name
        output_file.content = content
    ...
```

### Working with Jinja templates

To make generating files easier, the package also provides helpers for using `jinja2` templates.
Templates are loaded from the template path through the helper function `load_template`. The template path defaults to the environment variable `TEMPLATE_PATH` but can be programatically altered, for instance through the helper function `add_template_path`.

Assuming that there is a template to be loaded at `/some/path/some_template.j2`, this can be achieved programatically by calling `add_template_path('/some/path/')` prior to `load_template('some_template.j2')`.

More explicitly, one could do something like this to load, render and output the result:

```python
#!/usr/bin/env python3
from pyprotoc_plugin.plugins import ProtocPlugin
from google.protobuf.descriptor_pb2 import FileDescriptorProto

class MyTemplatePlugin(ProtocPlugin):

    def process_file(self, proto_file: FileDescriptorProto) -> None:
        # Do cool stuff, analyze proto file, make coffee, call a friend, etc.
        ...
        # `template` is now a (not entirely vanilla) jinja2 template.
        template = load_template('some_template.j2')
        # ... that can be rendered using keyword arguments for variable substitution
        content = template.render(**my_dictionary_of_template_variables)
        # ... and used as output
        output_file = self.response.file.add()
        output_file.content = content


if __name__ == '__main__':
    add_template_path('/some/path/')
    MyTemplatePlugin.execute()
```

## Integrating with `bazel`

Before you are ready to use your plugin with `bazel` a few tweaks needs to be made.

### Setting up dependencies

First you need to set up your project to depend on this repository. We suggest that you do so by copying `bazel/repos.bzl` to your workspace and import it from there.

### Registering a plugin

Assuming that we'd like to use the plugin `protoc-gen-jonathan.py` as a `protoc` plugin in `bazel`, the first thing to do is registering it as a `py_binary` with `bazel`, giving the target a name compliant with what `protoc` will accept as a name (i.e. like `/protoc-gen-[^_\.-]*/`).

If the plugin uses templates, these must be registered as data dependencies.

```python
load("@rules_python//python:defs.bzl", "py_binary")

py_binary(
    name = "protoc-gen-jonathan",
    srcs = ["protoc-gen-jonathan.py"],
    data = [
        "//templates:jonathan.cc.j2",
        "//templates:jonathan.h.j2",
    ],
    srcs_version = "PY3",
    visibility = ["//visibility:public"],
    deps = [
        "@com_github_reboot_dev_pyprotoc_plugin//pyprotoc_plugin",
    ],
)
```

### Using the plugin

With the plugin registered with bazel, it is time to generate the `bazel` rule that will allow you to generate your desired output files.

This is done by creating a new `.bzl` file in your repo (e.g., `rules.bzl`), with the following content:

```python
load("@com_github_reboot_dev_pyprotoc_plugin//:rules.bzl", "create_protoc_plugin_rule")

cc_jonathan_library = create_protoc_plugin_rule(
    "@your_repo_name//path:protoc-gen-jonathan",
    extensions=(".h", ".cc"),
)

```

The first argument has to be the fully qualified label of your `protoc` plugin in order for `bazel` to properly resolve this.

The second argument, `extensions`, is where you effectively define the output files that the generated `bazel` rule promises to provide:
the rule generation will assume that any `.proto` file passed explicitly to a `cc_jonathan_library` will have outputs with the same name/path, but with the extension substituted with the contents of `extensions`.
I.e., if you specify `.foo` and `.bar`, the resulting rule will assume that the output from running on `path/potato.proto` is the two files `path/potato.foo` and `path/potato.bar`.

Note: As a developer, you should assume the same output naming and use the relative paths too. This is a bit crude, but there is no good, safe or standard way of passing arguments from `protoc` to a `protoc` plugin and even less so from `bazel`.

Finally, to put your plugin and the generated rule into action and use it like this:

```python
load("@your_repo_name//:rules.bzl", "cc_jonathan_library")

# Create .proto label for further use
proto_library(
    name = "potato_proto",
    srcs = [":potato_proto.proto"],
    visibility = ["//visibility:public"],
    deps = [
        # Well known protos should be included as deps in the
        # proto_library rules of the source files importing them.
        # A list of all @com_google_protobuf well known protos can
        # seen with:
        # `bazel query 'kind(proto_library, @com_google_protobuf//:all)'`
        "@com_google_protobuf//:any_proto",
    ],
)

# Generate files using `protoc` plugin
cc_jonathan_library(
    name = "potato_jonathan_generated",
    visibility = ["//visibility:public"],
    srcs = ["potato.proto"],
    deps = [
        ":potato_proto",
        # Well known protos should be included as deps in the
        # proto_library rules of the source files importing them.
        # A list of all @com_google_protobuf well known protos can
        # seen with:
        # `bazel query 'kind(proto_library, @com_google_protobuf//:all)'`
        "@com_google_protobuf//:any_proto",
    ],
)

# Use the generated files to build a cc_library
cc_library(
    name = "potato_jonathan_library",
    srcs = [":potato_jonathan_generated"],
    visibility = ["//visibility:public"],
    deps = [
        ...
    ],
)

```
