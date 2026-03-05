"""
A sample library rule generated using pyprotoc-plugin.
"""

load("//:rules.bzl", "create_protoc_plugin_rule")

py_sample_library = create_protoc_plugin_rule(
    plugin_label = "//tests/python:protoc-gen-sample",
    extensions = ["_sample_generated_out.py"],
)
