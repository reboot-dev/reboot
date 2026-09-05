"""Where a scenario's browser recordings are kept: the video of its
last run and a screenshot after each of its assertion steps.

They live beside the feature file, in a directory named after it, so
that they are checked in with it: anyone who checks out the project
sees how each scenario looked without running it, and a version's
recordings sit in history next to that version's scenarios.

    backend/tests/web.feature
    backend/tests/web.recordings/
      opening-a-first-account/
        3f9c2a1b7d4e6f80/
          scenario.webm
          2.png

A scenario's directory is named by its name, lowercased with every
run of characters that are not letters or digits made one dash. In
it is one directory named by the digest of what the scenario runs:
its name, the steps of the backgrounds it runs under, its own steps
and its examples. A run replaces the scenario's directory, so it
holds one digest directory, and the recordings are current exactly
when that digest is the current scenario's; an older digest means
they show an earlier version. A screenshot is named by its step's
position among the scenario's own steps, counting from one. The
recordings of a scenario outline's examples all name the same files,
so the last example's are the ones kept.
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

# The video of a scenario's run, in the scenario's digest directory.
VIDEO_FILENAME = 'scenario.webm'

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


def screenshot_filename(position: int) -> str:
    """The screenshot taken after the step at the given position among
    the scenario's own steps, counting from one."""
    return f'{position}.png'
