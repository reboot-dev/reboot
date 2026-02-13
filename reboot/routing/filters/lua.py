import jinja2
import os

FILTERS_DIRECTORY = os.path.dirname(__file__)

# Lua template filenames.
ADD_HEADER_X_REBOOT_APPLICATION_ID_TEMPLATE_FILENAME = 'add_header_x_reboot_application_id.lua.j2'
COMPUTE_HEADER_X_REBOOT_SERVER_ID_TEMPLATE_FILENAME = 'compute_header_x_reboot_server_id.lua.j2'

# Non-template Lua filenames.
MANGLED_HTTP_PATH_FILENAME = 'mangled_http_path.lua'
REMOVE_JSON_TRAILERS_FILENAME = 'remove_json_trailers.lua'


def load_lua(filename: str) -> str:
    assert filename in [
        MANGLED_HTTP_PATH_FILENAME,
        REMOVE_JSON_TRAILERS_FILENAME,
        # Add additional future non-template Lua filenames here.
    ]
    with open(os.path.join(FILTERS_DIRECTORY, filename), 'r') as f:
        return f.read()


def render_lua_template(filename: str, template_input: dict) -> str:
    assert filename in [
        ADD_HEADER_X_REBOOT_APPLICATION_ID_TEMPLATE_FILENAME,
        COMPUTE_HEADER_X_REBOOT_SERVER_ID_TEMPLATE_FILENAME,
        # Add additional future Lua template filenames here.
    ]
    env = jinja2.Environment(loader=jinja2.FileSystemLoader(FILTERS_DIRECTORY))
    template = env.get_template(filename)
    return template.render(template_input)
