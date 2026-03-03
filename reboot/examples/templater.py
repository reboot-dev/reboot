import sys
import yaml
from pathlib import Path
from reboot.templates.tools import (
    render_ci_template_path,
    render_template_path,
)


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
