import os
import sys
from jinja2 import StrictUndefined, Template

ENV_TEMPLATE_PATH = 'TEMPLATE_PATH'


def resolve_template_path(template_name: str) -> str:
    global ENV_TEMPLATE_PATH

    template_path = os.environ.get(ENV_TEMPLATE_PATH, None)
    if template_path is None:
        template_path = ':'.join(
            [
                '.',
                os.path.join(__file__, '..'),
                os.path.join(__file__, '../templates/')
            ]
        )

    valid_paths = [
        os.path.abspath(path) for path in [
            os.path.join(path_segment, template_name)
            for path_segment in template_path.split(':')
        ] if os.path.exists(path)
    ]

    if len(valid_paths) == 0:
        print(
            [
                os.path.abspath(path) for path in [
                    os.path.join(path_segment, template_name)
                    for path_segment in template_path.split(':')
                ]
            ], file=sys.stderr
        )
        raise RuntimeError(f'Template {template_name} could not be resolved.')

    return valid_paths[0]


def add_template_path(path: str) -> None:
    global ENV_TEMPLATE_PATH

    template_path = os.environ.get(ENV_TEMPLATE_PATH, '')

    new_template_path = ':'.join(
        p for p in [os.path.abspath(path), template_path] if len(p)
    )

    os.environ[ENV_TEMPLATE_PATH] = new_template_path


def load_template(template_name: str, **template_options) -> Template:
    template_path = resolve_template_path(template_name) \
        if not os.path.exists(template_name) else template_name

    with open(template_path, 'r') as template_file:
        return Template(
            template_file.read(),
            undefined=StrictUndefined,
            **template_options,
        )
