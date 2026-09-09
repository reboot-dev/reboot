"""Where a scenario's browser recordings are kept: a video of each
user's browser in its last run, and a screenshot after each user's
step that opened the app and after each of its assertion steps.

They live beside the feature file, in a directory named after it and
ignored by git: running a scenario makes them, the dashboard shows
the last run's, and a project that wants a version's recordings in
history beside that version's scenarios may choose to check them in.

    backend/tests/web.feature
    backend/tests/web.recordings/
      opening-a-first-account/
        3f9c2a1b7d4e6f80/
          alice.webm
          1.png
          5.png

A scenario's directory is named by its name, lowercased with every
run of characters that are not letters or digits made one dash. In
it is one directory named by the digest of what the scenario runs:
its name, the steps of the backgrounds it runs under, its own steps
and its examples. A run replaces the scenario's directory, so it
holds one digest directory, and the recordings are current exactly
when that digest is the current scenario's; an older digest means
they show an earlier version. A video is named by the user whose
browser it shows, and a screenshot by its step's position among the
scenario's own steps, counting from one. The recordings of a
scenario outline's examples all name the same files, so the last
example's are the ones kept.
"""
import hashlib
import json
import re
from pathlib import Path
from rbt.v1alpha1.bdd.feature_pb2 import Background, Scenario, Step, Table
from typing import Optional, Sequence

# The suffix of the directory beside a feature file that keeps its
# scenarios' recordings, in place of `.feature`.
RECORDINGS_SUFFIX = '.recordings'

# The suffix of a video of one user's browser in a scenario's run, in
# the scenario's digest directory.
VIDEO_SUFFIX = '.webm'

# How many hex digits of the digest name the directory: enough that
# two versions of one scenario never share a name, short enough to
# read.
_DIGEST_LENGTH = 16


def recordings_directory(feature: Path) -> Path:
    """The directory beside the given feature file that keeps its
    scenarios' recordings."""
    return feature.with_suffix(RECORDINGS_SUFFIX)


def scenario_slug(name: str) -> str:
    """The given scenario name as a directory name."""
    return re.sub(r'[^a-z0-9]+', '-', name.lower()).strip('-')


def scenario_directory(feature: Path, scenario_name: str) -> Path:
    """The directory of the named scenario of the given feature file,
    which holds the digest directory of its recordings."""
    return recordings_directory(feature) / scenario_slug(scenario_name)


def _table(table: Optional[Table]) -> Optional[list[list[str]]]:
    return None if table is None else [list(row.cells) for row in table.rows]


def _step(step: Step) -> list:
    return [
        step.keyword,
        step.text,
        step.doc_string if step.HasField('doc_string') else None,
        _table(step.table if step.HasField('table') else None),
    ]


def digest(scenario: Scenario, backgrounds: Sequence[Background]) -> str:
    """The digest of what the given scenario runs, under the given
    backgrounds: its name, their steps, its steps, and its examples.
    Its keyword, description and tags are left out, since changing
    them changes nothing a recording shows."""
    # The digest is of a hand-picked list of strings rather than of the
    # messages' serialized bytes, for two reasons. The messages carry
    # more than what the scenario runs: each step's line number, its
    # parsed built-in syntax, and the videos and screenshots the
    # dashboard attaches once it has found this very directory, so a
    # comment added above the scenario, a change to the grammar's
    # messages, or a recording being made would each change the bytes
    # while changing nothing a recording shows. And the digest names a
    # directory that outlives the run that made it and is read back
    # after upgrades, or for years where a project checks it in, while
    # protobuf's deterministic serialization is only stable within one
    # library and one schema: a field added to `Step` or a newer
    # runtime would make every recording in every project look stale.
    # A JSON list of the same strings is the same bytes everywhere.
    canonical = json.dumps(
        [
            scenario.name,
            [
                _step(step)
                for background in backgrounds
                for step in background.steps
            ],
            [_step(step) for step in scenario.steps],
            [_table(examples.table) for examples in scenario.examples],
        ],
        ensure_ascii=True,
        separators=(',', ':'),
    )
    return hashlib.sha256(canonical.encode()).hexdigest()[:_DIGEST_LENGTH]


def recording_directory(
    feature: Path,
    scenario: Scenario,
    backgrounds: Sequence[Background],
) -> Path:
    """The directory of the recordings of the given scenario of the
    given feature file as it is now."""
    return scenario_directory(feature, scenario.name) / digest(
        scenario,
        backgrounds,
    )


def video_filename(user: str) -> str:
    """The video of the named user's browser, named by the user the
    way a scenario is named by its name."""
    return scenario_slug(user) + VIDEO_SUFFIX


def screenshot_filename(position: int) -> str:
    """The screenshot taken after the step at the given position among
    the scenario's own steps, counting from one."""
    return f'{position}.png'
