import sys
import yaml
from jinja2 import Environment, FileSystemLoader, StrictUndefined
from pathlib import Path
from reboot.templates.tools import render_template_path

_CI_GENERATED_HEADER = (
    "# This file is generated from a template in `ci/templates/`.\n"
    "# Do not edit it directly.\n"
    "# Run `bazel run //:ci_workflows` to regenerate it after editing the template.\n\n"
)


def render_ci_template_path(template_path: str, template_input: dict) -> str:
    """Renders a CI template at the given full `template_path`.

    Uses `<< >>` for variables and `<% %>` for block tags instead
    of `{{ }}` and `{% %}` to avoid conflicts with GitHub Actions'
    `${{ }}` expression syntax.

    Prepends a header comment warning that the file is generated and
    should not be edited directly.
    """
    path = Path(template_path)
    env = Environment(
        loader=FileSystemLoader(str(path.parent)),
        variable_start_string='<<',
        variable_end_string='>>',
        block_start_string='<%',
        block_end_string='%>',
        undefined=StrictUndefined,
        lstrip_blocks=True,
        trim_blocks=True,
        keep_trailing_newline=True,
    )
    template = env.get_template(path.name)
    return _CI_GENERATED_HEADER + template.render(template_input)


def templater(
    dest: Path,
    template: Path,
    yaml_inputs: Path,
    mode: str = 'standard',
) -> None:
    inputs = yaml.safe_load(yaml_inputs.read_bytes())
    if mode == 'ci':
        output = render_ci_template_path(str(template), inputs)
    else:
        output = render_template_path(str(template), inputs)
    dest.write_text(output)


if __name__ == '__main__':
    _, dest, template, yaml_inputs = sys.argv[:4]
    mode = sys.argv[4] if len(sys.argv) > 4 else 'standard'
    templater(Path(dest), Path(template), Path(yaml_inputs), mode)
