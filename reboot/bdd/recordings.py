"""Where a scenario's browser recordings are kept: the video of its
last run and a screenshot after each of its assertion steps.

They live beside the feature file, in a directory named after it, so
that they are checked in with it: anyone who checks out the project
sees how each scenario looked without running it, and a version's
recordings sit in history next to that version's scenarios.

    backend/tests/web.feature
    backend/tests/web.recordings/
      opening-a-first-account/
        scenario.webm
        14.png

A scenario's directory is named by its name, lowercased with every
run of characters that are not letters or digits made one dash, and
each screenshot by the line of its step in the feature file. The
recordings of a scenario outline's examples all name the same files,
so the last example's are the ones kept.
"""
import re
from pathlib import Path

# The suffix of the directory beside a feature file that keeps its
# scenarios' recordings, in place of `.feature`.
RECORDINGS_SUFFIX = '.recordings'

# The video of a scenario's run, in the scenario's directory.
VIDEO_FILENAME = 'scenario.webm'


def recordings_directory(feature: Path) -> Path:
    """The directory beside the given feature file that keeps its
    scenarios' recordings."""
    return feature.with_suffix(RECORDINGS_SUFFIX)


def scenario_slug(name: str) -> str:
    """The given scenario name as a directory name."""
    return re.sub(r'[^a-z0-9]+', '-', name.lower()).strip('-')


def scenario_directory(feature: Path, scenario_name: str) -> Path:
    """The directory that keeps the recordings of the named scenario
    of the given feature file."""
    return recordings_directory(feature) / scenario_slug(scenario_name)


def screenshot_filename(line: int) -> str:
    """The screenshot taken after the step on the given line."""
    return f'{line}.png'
