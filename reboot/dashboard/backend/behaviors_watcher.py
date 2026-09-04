"""Watches the developer's `.feature` files and updates what they
declare.

Every feature file under the working directory is read and parsed
again on every change: the files are small, and parsing them all is
cheaper than tracking which one an event was about, so a burst of
saves loses nothing however many events the watch failed to hear.

Each file is parsed by `reboot.bdd.feature`, whose package imports
pytest-bdd and whose parser is `gherkin-official`; both arrive with
`reboot[pytest-bdd]`. Without the extra, each feature file found is
recorded with an error saying to install it, so the page can say
why it shows no behaviors.
"""
from functools import partial
from pathlib import Path
from rbt.dashboard.v1.dashboard_rbt import Dashboard
from rbt.v1alpha1.bdd.feature_pb2 import Feature
from reboot.aio.contexts import WorkflowContext
from reboot.aio.workflows import at_least_once
from reboot.cli.common.watch import file_watcher
from typing import Mapping

try:
    from reboot.bdd import feature
    _extra_installed = True
except ImportError:
    _extra_installed = False

# The glob every scenario file matches, which is the extension
# `pytest-bdd` and every other Gherkin tool reads.
FEATURE_GLOB = '**/*.feature'


def _feature_files(directory: Path) -> list[Path]:
    """Every feature file under the working directory, sorted, with
    hidden directories and `node_modules` left out: a `.venv` or
    `node_modules` carries installed packages' feature files, which
    are not the developer's."""
    return sorted(
        path for path in directory.glob(FEATURE_GLOB) if not any(
            part == 'node_modules' or part.startswith('.')
            for part in path.relative_to(directory).parts
        )
    )


async def _read_and_parse(*, directory: Path) -> dict[str, Feature]:
    """What every feature file under the working directory declares
    now, keyed by path relative to it, with a file that could not be
    read or parsed carrying why instead.

    Memoized by the caller per iteration, so everything returned is
    a plain value pickle can keep.
    """
    features: dict[str, Feature] = {}
    for path in _feature_files(directory):
        filename = str(path.relative_to(directory))
        if not _extra_installed:
            features[filename] = Feature(
                error='Reading `.feature` files needs the packages '
                '`reboot[pytest-bdd]` installs; install the extra to see '
                'behaviors here.'
            )
            continue
        try:
            source = path.read_text()
        except OSError as error:
            features[filename] = Feature(error=str(error))
            continue
        parsed = feature.parse(source)
        if parsed is not None:
            features[filename] = parsed
    return features


async def watch(context: WorkflowContext) -> None:
    """Keeps the behaviors state matching what the feature files
    declare, until cancelled.

    The working directory is where `rbt dashboard` runs, which is
    where the developer's project is: feature files have no `.rbtrc`
    entry naming where they live, so everywhere under the project is
    where to look.
    """
    directory = Path.cwd()

    # What a previous run recorded: an unchanged set of files calls
    # for no update after a restart.
    state = await Dashboard.ref().always().read(context)
    features: Mapping[str, Feature] = dict(state.features)

    # Whether this process has yet to wait for a save: a restart is
    # itself a reason to read the files again.
    restarted = True

    with file_watcher() as watcher:
        async for _ in context.loop('Read what changed'):
            # The loop opens the watch before it reads anything, so a
            # save made during a read resolves `event` instead of
            # firing between watches, where nothing would notice it.
            async with watcher.watch(
                [FEATURE_GLOB],
                root_dir=str(directory),
            ) as event:

                # Memoized per iteration.
                features_now = await at_least_once(
                    'Read and parse',
                    context,
                    partial(_read_and_parse, directory=directory),
                )

                # An update wakes every browser reading `Get`, so one
                # is only made for a difference.
                if features_now != features:
                    await Dashboard.ref(
                    ).per_iteration('Update').UpdateBehaviors(
                        context,
                        features=features_now,
                    )
                    features = features_now

                # A restarted workflow may be in an iteration that has
                # already memoized `_read_and_parse`, so it goes to the
                # next iteration immediately rather than waiting on an
                # `event` while changes made since sit unread. Worst
                # case `features_now` matched `features` and the next
                # iteration just waits on its own `event`.
                if restarted:
                    restarted = False
                    continue

                await event
