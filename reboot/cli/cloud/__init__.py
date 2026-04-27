import argparse
from reboot.cli.cloud.down import cloud_down, register_cloud_down
from reboot.cli.cloud.logs import cloud_logs, register_cloud_logs
from reboot.cli.cloud.secrets import (
    cloud_secret_delete,
    cloud_secret_list,
    cloud_secret_set,
    register_cloud_secret,
)
from reboot.cli.cloud.up import cloud_up, register_cloud_up
from reboot.cli.rc import ArgumentParser
from typing import Optional


def cloud_subcommands() -> list[str]:
    return [
        'cloud down',
        'cloud up',
        'cloud secret set',
        'cloud secret list',
        'cloud secret delete',
        'cloud logs',
    ]


def register_cloud(parser: ArgumentParser) -> None:
    register_cloud_secret(parser)
    register_cloud_down(parser)
    register_cloud_logs(parser)
    register_cloud_up(parser)


async def handle_cloud_subcommand(
    args: argparse.Namespace,
) -> Optional[int]:
    if args.subcommand == 'cloud secret set':
        await cloud_secret_set(args)
        return 0
    elif args.subcommand == 'cloud secret list':
        await cloud_secret_list(args)
        return 0
    elif args.subcommand == 'cloud secret delete':
        await cloud_secret_delete(args)
        return 0
    elif args.subcommand == 'cloud up':
        return await cloud_up(args)
    elif args.subcommand == 'cloud down':
        await cloud_down(args)
        return 0
    elif args.subcommand == 'cloud logs':
        await cloud_logs(args)
        return 0
    return None
