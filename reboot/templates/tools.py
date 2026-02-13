import os
from jinja2 import StrictUndefined, Template


def _load_template(template_path: str) -> Template:
    """
    Loads a jinja2 template at the given full `template_path`, with the
    standard settings that our templates expect.
    """
    with open(template_path, 'r') as template_file:
        return Template(
            template_file.read(),
            # Please tell us if we're making a mistake.
            undefined=StrictUndefined,
            # The following whitespace settings make Jinja templates render the
            # way we intuitively expected them to: no crazy indentation, and no
            # newlines just because the template had an inline {% instruction %}
            # at that spot.
            lstrip_blocks=True,
            trim_blocks=True,
            keep_trailing_newline=True
        )


def render_template_path(template_path: str, template_input: dict) -> str:
    """Renders the template at the given full `template_path`."""
    template = _load_template(template_path)
    return template.render(template_input)


def _template_path(template_filename: str) -> str:
    """Produces a correct path to a template in the `reboot/templates` folder."""
    template_folder = os.path.dirname(__file__)
    return os.path.join(template_folder, template_filename)


def render_template(template_filename: str, template_input: dict) -> str:
    """Renders a template from the 'reboot/templates' folder."""
    return render_template_path(
        _template_path(template_filename), template_input
    )
