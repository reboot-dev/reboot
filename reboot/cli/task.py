import grpc
import re
import uuid
from rbt.v1alpha1 import tasks_pb2, tasks_pb2_grpc
from reboot.cli import terminal
from reboot.cli.rc import ArgumentParser, add_common_channel_args
from rebootdev.aio.external import ExternalContext
from rebootdev.aio.headers import AUTHORIZATION_HEADER
from rebootdev.aio.types import StateRef, StateTypeName
from rebootdev.time import DateTimeWithTimeZone
from tabulate import tabulate  # type: ignore[import]
from typing import Optional


def register_task(parser: ArgumentParser):
    """Register the 'task' subcommand with the given parser."""

    def _add_common_args(subcommand):
        add_common_channel_args(subcommand)

        # Should be able to use 'rbt task' with 'rbt dev run' without an admin
        # secret.
        subcommand.add_argument(
            '--admin-credential',
            type=str,
            help=(
                "the admin credential to use for authentication; not necessary "
                "when running 'rbt dev', but must be set in production."
            ),
        )

    list_command = parser.subcommand('task list')
    _add_common_args(list_command)

    cancel_command = parser.subcommand('task cancel')
    _add_common_args(cancel_command)

    cancel_command.add_argument(
        '--state-type',
        type=str,
        help="the state type of the service which holds the task",
        required=True,
    )

    cancel_command.add_argument(
        '--state-id',
        type=str,
        help="the state ID which holds the task",
        required=True,
    )

    cancel_command.add_argument(
        '--task-uuid',
        type=str,
        help="the UUID of the task to cancel",
        required=True,
    )


def _get_metadata(args) -> Optional[tuple[tuple[str, str]]]:
    """Get the metadata for the gRPC call."""
    if args.admin_credential is None:
        return None

    # This token should match what the user stored in their prod secrets.
    return ((AUTHORIZATION_HEADER, f"Bearer {args.admin_credential}"),)


def _get_tasks_stub(args) -> tasks_pb2_grpc.TasksStub:
    """Get a stub for the tasks service."""
    context = ExternalContext(
        name="reboot-cli",
        url=args.application_url,
    )
    return tasks_pb2_grpc.TasksStub(context.legacy_grpc_channel())


async def task_list(args) -> None:
    """Implementation of the 'tasks list' subcommand."""

    stub = _get_tasks_stub(args)
    metadata = _get_metadata(args)
    try:
        tasks = await stub.ListTasks(
            tasks_pb2.ListTasksRequest(),
            metadata=metadata,
        )
    except grpc.aio.AioRpcError as e:
        terminal.fail(f"Failed to list pending tasks: {e.details()}")

    def state_name_for_task_id(task_id: tasks_pb2.TaskId) -> str:
        state_type = task_id.state_type
        state_ref = StateRef.from_maybe_readable(task_id.state_ref)

        return f"{state_type}('{state_ref.id}')"

    def human_readable_timestamp(datetime: DateTimeWithTimeZone) -> str:
        now = DateTimeWithTimeZone.now()

        diff = datetime - now

        seconds = int(diff.total_seconds())

        if seconds == 0:
            return "just now"

        past = False

        if seconds < 0:
            seconds = abs(seconds)
            past = True

        message = ""

        if seconds < 60:
            message = f"{seconds} seconds"
        elif seconds < 3600:
            message = f"{seconds // 60} minutes"
        elif seconds < 86400:
            message = f"{seconds // 3600} hours"
        else:
            message = f"{seconds // 86400} days"

        if past:
            return f"{message} ago"

        return f"in {message}"

    def parse_relative_time(when_str):
        if when_str == "just now":
            # "just now" is the most recent, so we assign it 0 seconds
            return 0

        match = re.search(
            r"(\d+)\s+(second|minute|hour|day)(s?)\s*(ago|in)?",
            when_str,
        )

        if not match:
            return float('inf')

        value, unit, _, direction = match.groups()
        value = int(value)

        seconds = 0
        if "second" in unit:
            seconds = value
        elif "minute" in unit:
            seconds = value * 60
        elif "hour" in unit:
            seconds = value * 3600
        elif "day" in unit:
            seconds = value * 86400

        return -seconds if direction == "ago" else seconds

    table_headers = [
        "task ID",
        "on",
        "method",
        "status",
        "when",
        "scheduled",
        "iterations",
        "failures",
    ]

    COLUMN_STATUS = 3
    COLUMN_WHEN = 4

    table_data = []

    earliest_completed_task_timestamp_or_now = DateTimeWithTimeZone.now()
    for task in tasks.tasks:
        table_data.append(
            [
                task.task_id.task_uuid.hex(),
                state_name_for_task_id(task.task_id),
                task.method,
                tasks_pb2.TaskInfo.Status.Name(task.status),
                human_readable_timestamp(
                    DateTimeWithTimeZone.from_protobuf_timestamp(
                        task.occurred_at
                    )
                ),
                human_readable_timestamp(
                    DateTimeWithTimeZone.from_protobuf_timestamp(
                        task.scheduled_at
                    )
                ) if task.status in [
                    tasks_pb2.TaskInfo.Status.SCHEDULED,
                    tasks_pb2.TaskInfo.Status.SCHEDULED_RETRY,
                    tasks_pb2.TaskInfo.Status.SCHEDULED_ITERATION,
                ] else "N/A",
                task.iterations if task.iterations > 0 else "N/A",
                f'{task.num_runs_failed_recently} or more',
            ]
        )
        if task.status == tasks_pb2.TaskInfo.Status.COMPLETED:
            earliest_completed_task_timestamp_or_now = min(
                earliest_completed_task_timestamp_or_now,
                DateTimeWithTimeZone.from_protobuf_timestamp(task.occurred_at)
            )

    # This list should have all possible values from `tasks.proto`'s
    # `TaskInfo.Status` enum (i.e. everything except `UNKNOWN`).
    status_priority = {
        # Tasks that are "done" come at the top.
        "COMPLETED": 0,
        "CANCELLED": 1,
        # Tasks that are "active" come next.
        "STARTED": 2,
        # Then tasks that were "active", but are currently waiting.
        "SCHEDULED_RETRY": 3,
        "SCHEDULED_ITERATION": 4,
        # Finally, tasks that are waiting to run for the first time.
        "SCHEDULED": 5,
    }

    sorted_table_data = sorted(
        table_data,
        key=lambda row: (
            # Ascending by status priority.
            status_priority[row[COLUMN_STATUS]],
            # Descending by parsed seconds.
            parse_relative_time(row[COLUMN_WHEN]),
        )
    )

    table = tabulate(
        sorted_table_data,
        headers=table_headers,
        tablefmt="simple",
    )
    terminal.info(table)

    # We are using the earliest __completed__ task timestamp (or now) here,
    # because if a task is not yet completed, but has started earlier it may be
    # in cache even if the completed one will be evicted.
    terminal.info(
        f"NOTE: omitted all tasks that "
        f"finished before {earliest_completed_task_timestamp_or_now}"
    )


async def task_cancel(args) -> None:
    """Implementation of the 'tasks cancel' subcommand."""

    stub = _get_tasks_stub(args)
    metadata = _get_metadata(args)
    task_uuid = uuid.UUID(args.task_uuid)
    task_id = tasks_pb2.TaskId(
        state_type=args.state_type,
        state_ref=StateRef.from_id(
            StateTypeName(args.state_type), args.state_id
        ).to_str(),
        task_uuid=task_uuid.bytes,
    )

    try:
        cancel_task_response = await stub.CancelTask(
            tasks_pb2.CancelTaskRequest(task_id=task_id),
            metadata=metadata,
        )

        if cancel_task_response.status == tasks_pb2.CancelTaskResponse.Status.OK:
            terminal.info("Task cancelled.")
        elif cancel_task_response.status == tasks_pb2.CancelTaskResponse.Status.NOT_FOUND:
            terminal.fail("Task is not running.")
        elif cancel_task_response.status == tasks_pb2.CancelTaskResponse.Status.CANCELLING:
            terminal.fail("Task is cancelling.")
    except grpc.aio.AioRpcError as e:
        terminal.fail(f"Failed to cancel task: {e.details()}")
