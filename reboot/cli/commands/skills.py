import argparse
from importlib import resources
from reboot.cli.common.rc import ArgumentParser
from typing import Optional


_SKILLS_DIRECTORY = ('cli', 'skills')


def _skills_root():
    root = resources.files('reboot')
    for component in _SKILLS_DIRECTORY:
        root = root.joinpath(component)
    return root


def _skill_names() -> list[str]:
    return sorted(
        entry.name
        for entry in _skills_root().iterdir()
        if entry.is_dir() and entry.joinpath('SKILL.md').is_file()
    )


def _skill_description(skill_name: str) -> str:
    lines = _skills_root().joinpath(skill_name, 'SKILL.md').read_text().splitlines()
    in_frontmatter = False
    for line in lines:
        if line == '---':
            if in_frontmatter:
                break
            in_frontmatter = True
        elif in_frontmatter and line.startswith('description:'):
            return line.removeprefix('description:').strip().strip('"')
    return ''


def skills_subcommands() -> list[str]:
    return [
        'skills list',
        'skills get',
    ]


def register_skills(parser: ArgumentParser) -> None:
    """Register commands for the version-matched skills bundled with rbt."""
    get = parser.subcommand('skills get')
    get.add_argument(
        'name',
        type=str,
        help='bundled skill to print',
    )


def _get_skill(name: str):
    if name not in _skill_names():
        available = ', '.join(_skill_names())
        raise ValueError(f"unknown bundled skill '{name}' (available: {available})")
    return _skills_root().joinpath(name, 'SKILL.md')


async def handle_skills_subcommand(args: argparse.Namespace) -> Optional[int]:
    if args.subcommand == 'skills list':
        for name in _skill_names():
            print(f'{name}\t{_skill_description(name)}')
        return 0
    elif args.subcommand == 'skills get':
        content = _get_skill(args.name).read_text()
        print(content, end='' if content.endswith('\n') else '\n')
        return 0
    return None
