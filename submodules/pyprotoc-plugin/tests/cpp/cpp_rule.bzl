"""
A sample library rule generated using pyprotoc-plugin.
"""

load("//:rules.bzl", "create_protoc_plugin_rule")

cc_generate_library = create_protoc_plugin_rule(
    plugin_label = "//tests/cpp:protoc-gen-headers",
)
