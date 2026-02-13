import sys
import yaml
from pathlib import Path
from reboot.templates.tools import render_template_path


def templater(dest: Path, template: Path, yaml_inputs: Path) -> None:
    inputs = yaml.safe_load(yaml_inputs.read_bytes())
    output = render_template_path(str(template), inputs)
    dest.write_text(output)


if __name__ == '__main__':
    _, dest, template, yaml_inputs = sys.argv
    templater(Path(dest), Path(template), Path(yaml_inputs))
