import argparse
from reboot.cli.commands.cloud.domain import (
    cloud_domain_add,
    cloud_domain_list,
    cloud_domain_remove,
    cloud_domain_status,
    register_cloud_domain,
)
from reboot.cli.commands.cloud.down import cloud_down, register_cloud_down
from reboot.cli.commands.cloud.logs import cloud_logs, register_cloud_logs
from reboot.cli.commands.cloud.secrets import (
    cloud_secret_delete,
    cloud_secret_list,
    cloud_secret_set,
    register_cloud_secret,
)
from reboot.cli.commands.cloud.up import cloud_up, register_cloud_up
from reboot.cli.common.rc import ArgumentParser
from typing import Optional


def cloud_subcommands() -> list[str]:
    return [
        'cloud down',
        'cloud up',
        'cloud secret set',
        'cloud secret list',
        'cloud secret delete',
        'cloud domain add',
        'cloud domain list',
        'cloud domain status',
        'cloud domain remove',
        'cloud logs',
    ]


def register_cloud(parser: ArgumentParser) -> None:
    register_cloud_secret(parser)
    register_cloud_domain(parser)
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
    elif args.subcommand == 'cloud domain add':
        await cloud_domain_add(args)
        return 0
    elif args.subcommand == 'cloud domain list':
        await cloud_domain_list(args)
        return 0
    elif args.subcommand == 'cloud domain status':
        await cloud_domain_status(args)
        return 0
    elif args.subcommand == 'cloud domain remove':
        await cloud_domain_remove(args)
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
