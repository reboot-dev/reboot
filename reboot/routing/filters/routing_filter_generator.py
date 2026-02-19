"""Generates Lua routing filter code for Envoy."""
import rbt.v1alpha1.placement_planner_pb2 as placement_planner_pb2
import reboot.templates.tools as template_tools
from reboot.controller.servers import ServerSpec
from reboot.routing.filters.lua import MANGLED_HTTP_PATH_FILENAME, load_lua


def generate_lua_routing_filter(
    servers: list[placement_planner_pb2.Server] | list[ServerSpec],
) -> str:
    """Generates Lua code for Envoy's `inline_code` routing filter block.

    NOTE: will generate this code with a base indentation of 0; you
    must indent it appropriately to make it part of valid YAML.
    """
    mangled_http_path_filter = load_lua(MANGLED_HTTP_PATH_FILENAME)

    template_input = {
        "servers": servers,
        "mangled_http_path_filter": mangled_http_path_filter,
    }
    return template_tools.render_template(
        "routing_filter.lua.j2", template_input
    )
