import argparse
from enum import Enum
from rbt.cloud.v1alpha1.application.application_rbt import Application
from rbt.cloud.v1alpha1.logs.logs_pb2 import LogsRequest, Source
from rbt.v1alpha1.errors_pb2 import (
    PermissionDenied,
    StateNotConstructed,
    Unavailable,
)
from reboot.aio.aborted import Aborted
from reboot.aio.backoff import Backoff
from reboot.aio.external import ExternalContext
from reboot.cli import terminal
from reboot.cli.cloud.common import (
    _add_common_cloud_args,
    _parse_common_cloud_args,
)
from reboot.cli.rc import ArgumentParser
from reboot.naming import OrganizationName, QualifiedApplicationName, UserId
from reboot.time import DateTimeWithTimeZone
from typing import Optional


class SourceType(Enum):
    SERVER = 'server'
    CONFIG = 'config'
    ALL = 'all'


def register_cloud_logs(parser: ArgumentParser) -> None:
    logs_subcommand = parser.subcommand('cloud logs')
    _add_common_cloud_args(logs_subcommand)

    logs_subcommand.add_argument(
        '--follow',
        type=bool,
        default=False,
        help='if true, follows the logs as they are produced',
    )

    # Filters.
    logs_subcommand.add_argument(
        '--revisions',
        type=str,
        # We default to ">=latest" rather than "latest" because the user
        # may also use "--follow", in which case they presumably want to
        # see all logs from the latest revision _and_ any that are upped
        # in the future. If they really don't want to follow future
        # revisions they can specify just "latest" manually.
        default=">=latest",
        help='the revision number(s) to get logs for. '
        'May specify a single number (e.g. "4"), several comma-separated '
        'numbers (e.g. "4,7"), or a from-range using ">=" (e.g. ">=4" for logs '
        'at and beyond revision 4). '
        'May use "latest" to replace a number. '
        'Default: ">=latest".',
    )
    logs_subcommand.add_argument(
        '--source',
        type=str,
        choices=[value.name.lower() for value in SourceType],
        # We default to `server` because, under normal circumstances,
        # developers don't care about the logs of their config runs. If a config
        # run fails, its `rbt cloud up` will already print those logs. If the
        # config run succeeds, its logs are mostly irrelevant.
        default=SourceType.SERVER.name.lower(),
        help="which sources to show logs from; defaults to "
        f"'{SourceType.SERVER.name.lower()}'",
    )
    logs_subcommand.add_argument(
        '--last',
        type=int,
        default=None,
        help='if set, only show the last N log lines. If not set, show all '
        'log lines.',
    )

    # Presentation.
    logs_subcommand.add_argument(
        '--show-revision',
        type=bool,
        default=None,
        help='if true, show the revision number of the log line in the logs. '
        'If false, never do so. If unset, will show revision numbers if there '
        'may be more than one revision in the logs.',
    )
    logs_subcommand.add_argument(
        '--show-source',
        type=bool,
        default=None,
        help='if true, show information about the source of the log '
        'line in the logs. If false, never do so. If unset, will show source '
        'information if there may be more than one type of source in the logs.',
    )
    logs_subcommand.add_argument(
        '--show-timestamp',
        type=bool,
        default=False,
        help='if true, includes timestamp in the logs',
    )


def parse_revisions(
    revisions: str,
) -> list[LogsRequest.RevisionFilter]:
    """
    Parse a revisions string (e.g. "0, >=4")

    Parses these into `LogsRequest.RevisionFilter` protos, which can be
    sent to the Reboot Cloud.
    """
    original_revisions = revisions

    filters: list[LogsRequest.RevisionFilter] = []

    for revision in revisions.split(","):
        revision = revision.strip()
        operator: LogsRequest.RevisionFilter.Operator.ValueType = LogsRequest.RevisionFilter.Operator.EQUAL
        right_hand_revision_number: Optional[int] = None
        right_hand_latest: Optional[bool] = None

        if revision.startswith(">="):
            revision = revision.removeprefix(">=")
            operator = LogsRequest.RevisionFilter.Operator.GREATER_THAN_OR_EQUAL
        elif revision.startswith("="):
            # Equal is the default operator; simply remove the prefix.
            # Support both `=` and `==` as prefixes.
            revision = revision.removeprefix("=")
            revision = revision.removeprefix("=")

        if revision == "latest":
            right_hand_latest = True
        else:
            try:
                right_hand_revision_number = int(revision)
            except ValueError:
                terminal.fail(
                    f"Invalid revision number '{revision}' in "
                    f"--revision='{original_revisions}'; expected a "
                    "number or 'latest'."
                )

        filter = LogsRequest.RevisionFilter()
        filter.operator = operator
        if right_hand_latest is not None:
            filter.right_hand_latest = right_hand_latest
        else:
            assert right_hand_revision_number is not None
            filter.right_hand_revision_number = right_hand_revision_number

        filters.append(filter)

    return filters


def _may_select_multiple_revisions(
    revision_filters: list[LogsRequest.RevisionFilter],
    follow: bool,
) -> bool:
    """
    Returns True if the `revisions` may pass logs for multiple revisions.
    """
    assert len(revision_filters) > 0, "Must have at least one revision filter"
    if len(revision_filters) > 1:
        # TODO: it's possible for a user to write e.g. "0,0", and
        #       ideally we'd understand that that's a single revision,
        #       but it's not a big deal.
        return True

    # Special case: ">=latest" is a single revision, EXCEPT if we're
    # following.
    revision_filter = revision_filters[0]
    if (
        revision_filter.operator
        == LogsRequest.RevisionFilter.Operator.GREATER_THAN_OR_EQUAL and
        revision_filter.right_hand_latest
    ):
        return follow

    # Otherwise, it's down to the operator.
    return revision_filter.operator != LogsRequest.RevisionFilter.Operator.EQUAL


async def cloud_logs(args: argparse.Namespace) -> None:
    """Implementation of the 'cloud logs' subcommand"""
    user_id, qualified_application_name, organization_name = (
        await _parse_common_cloud_args(args)
    )

    source = SourceType[args.source.upper()]
    await _cloud_logs(
        user_id=user_id,
        organization_name=organization_name,
        qualified_application_name=qualified_application_name,
        source=source,
        name=args.application_name,
        cloud_url=args.cloud_url,
        api_key=args.api_key,
        revisions=args.revisions,
        last=args.last,
        show_revision=args.show_revision,
        show_source=args.show_source,
        show_timestamp=args.show_timestamp,
        follow=args.follow,
    )


async def _cloud_logs(
    *,
    user_id: UserId,
    organization_name: Optional[OrganizationName],
    qualified_application_name: QualifiedApplicationName,
    source: SourceType,
    name: str,
    cloud_url: str,
    api_key: str,
    revisions: str,
    last: Optional[int],
    show_revision: Optional[bool],
    show_source: Optional[bool],
    show_timestamp: bool,
    follow: bool,
) -> None:
    context = ExternalContext(
        name="cloud-logs",
        url=cloud_url,
        bearer_token=api_key,
    )

    application = Application.ref(qualified_application_name)

    revision_filters = parse_revisions(revisions)
    show_revision = (
        # Obey explicit user instructions.
        show_revision if show_revision is not None
        # If there are no explicit instructions, show revision numbers
        # if we request logs for more than one revision.
        else _may_select_multiple_revisions(
            revision_filters=revision_filters,
            follow=follow,
        )
    )
    show_source = (
        # Obey explicit user instructions.
        show_source if show_source is not None
        # If there are no explicit instructions, show sources if we request
        # logs from multiple source types
        else source == SourceType.ALL
    )

    proto_sources = (
        [Source.SERVER] if source == SourceType.SERVER else
        ([Source.CONFIG_RUN] if source == SourceType.CONFIG else [])
    )

    # If the user specified `--follow`, we assume that they only want
    # the last few lines of old logs before the new logs start. They can
    # manually override this by specifying `--last` to get more lines.
    if follow and last is None:
        last = 20

    # We'll retry in the event of `Unavailable` after a backoff, but
    # not if we've already gotten some logs because then we want to
    # exit so the logs don't show up weirdly.
    #
    # ISSUE(https://github.com/reboot-dev/mono/issues/4599): retry even
    # after the first logs have been delivered, e.g. during `--follow`.
    started = False
    backoff = Backoff()
    while not started:
        try:
            printed_lines = 0
            async for response in application.Logs(
                context,
                follow=follow,
                revisions=revision_filters,
                last=last,
                sources=proto_sources,
            ):
                started = True
                for record in response.records:
                    printed_lines += 1

                    extra_info: list[str] = []
                    if show_timestamp:
                        # Print the timestamp in the local timezone.
                        timestamp = DateTimeWithTimeZone.from_protobuf_timestamp(
                            record.timestamp
                        )
                        extra_info.append(f"{timestamp.astimezone()}")
                    if show_source:
                        # Print the source of the log line.
                        if record.WhichOneof("source") == "server_id":
                            # The server ID is in fully-qualified format,
                            # including the application ID (e.g.
                            # 'a12345678-c000001'). The application ID isn't
                            # interesting here; strip it.
                            server_id = record.server_id.split("-")[-1]
                            extra_info.append(f"server={server_id}")
                        elif record.WhichOneof("source") == "config_run_id":
                            config_run_id = record.config_run_id.removeprefix(
                                "config-run-"
                            )
                            # Add two spaces of padding after the config run ID
                            # to make the text the same length as when we show
                            # a server ID.
                            extra_info.append(f"config={config_run_id}")
                        else:
                            extra_info.append("source=???")
                    if show_revision:
                        extra_info.append(f"revision={record.revision_number}")

                    line = ""
                    if extra_info:
                        line = f"[{', '.join(extra_info)}] "

                    line += record.text
                    print(line)
            if source == SourceType.SERVER and printed_lines == 0:
                # The user isn't seeing any output, and it's possible
                # that we filtered out some log lines. Print a message
                # to that effect.
                terminal.warn(
                    "Serving servers had no logs matching the requested "
                    "filters. Lines from non-serving sources were filtered "
                    "out; use `--source=all` to see them."
                )
            break

        except Aborted as aborted:
            match aborted.error:
                case StateNotConstructed():  # type: ignore[misc]
                    if organization_name is None:
                        terminal.fail(
                            f"User '{user_id}' does not have an "
                            f"application named '{name}'. If the "
                            "application belongs to an organization, "
                            "try adding --organization=<name>."
                        )
                    else:
                        terminal.fail(
                            f"Organization '{organization_name}' does not have an "
                            f"application named '{name}'"
                        )
                case Unavailable():  # type: ignore[misc]
                    if started:
                        terminal.fail(
                            "\n... connection interrupted, please try again"
                        )
                    await backoff()
                    continue
                case PermissionDenied():  # type: ignore[misc]
                    # Invariant for applications before organizations were
                    # added was that users _always_ had admin permissions
                    # for their own applications so we should only get
                    # `PermissionDenied` for applications launched after
                    # organizations were introduced.
                    assert organization_name is not None
                    terminal.fail(
                        f"User '{user_id}' does not have permission to view the "
                        f"logs of application '{name}' in the organization "
                        f"'{organization_name}'; are you a member of the organization?"
                    )
                case _:
                    # There are no other expected errors for
                    # `Logs()`. Most notably, `PermissionDenied` can't
                    # happen, since the application we're attempting
                    # to call `Logs()` on is by definition owned by
                    # the user.
                    terminal.fail(f"\nUnexpected error: {aborted}")
