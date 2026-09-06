"""Recording a scenario's browsers: a video of each user's browser
and a screenshot after each user's step that opened the app and after
each assertion step, kept beside the feature file the way
`reboot.bdd.recordings` lays them out, so that they are versioned
with the scenarios they show.

Every browser scenario is recorded. The browser is paced so that a
viewer can follow the video, by `--recording-slowmo`, a pause after
each browser operation, and `--recording-dwell`, how long an
assertion step's result stays on screen before the next step changes
it; `0` for either records without that pacing. Only the browser's
operations are paced: the page, its rendering and its calls to the
backend run at full speed.
"""
import os
import pytest
import shutil
from dataclasses import dataclass, field
from pathlib import Path
from rbt.v1alpha1.bdd.feature_pb2 import Background, Feature, Scenario
from reboot.bdd import feature as bdd_feature
from reboot.bdd import recordings
from typing import Optional

# The size Playwright records at: the default viewport, so that the
# videos show what the screenshots show.
VIDEO_SIZE = {'width': 1280, 'height': 720}

# The default pacing, in milliseconds: how long Playwright waits after
# each browser operation, and how long an assertion step's result
# stays on screen after the step passes.
DEFAULT_SLOW_MO_MS = 500
DEFAULT_ASSERTION_DWELL_MS = 1000


def pytest_addoption(parser: pytest.Parser) -> None:
    group = parser.getgroup('recordings')
    group.addoption(
        '--recording-slowmo',
        type=int,
        default=DEFAULT_SLOW_MO_MS,
        help='Milliseconds Playwright waits after each browser operation '
        f'while recording (default {DEFAULT_SLOW_MO_MS}); `--slowmo` '
        'takes precedence when given',
    )
    group.addoption(
        '--recording-dwell',
        type=int,
        default=DEFAULT_ASSERTION_DWELL_MS,
        help="Milliseconds an assertion step's result stays on screen "
        f'after the step passes (default {DEFAULT_ASSERTION_DWELL_MS})',
    )


@dataclass
class Recording:
    """The scenario being recorded, as the feature file declares it
    now, and where its recordings go."""

    # The scenario, as `reboot.bdd.feature` parses it, whose steps
    # carry the lines a running step is matched to.
    scenario: Scenario

    # The digest directory the run's recordings go in.
    directory: Path

    # How long an assertion step's result stays on screen, in
    # milliseconds.
    dwell_ms: int

    # The users a step has opened the app for so far: the step that
    # opens it for a user shows where that user starts.
    opened: set[str] = field(default_factory=set)

    def position(self, line: int) -> Optional[int]:
        """The position, counting from one, of the scenario's own step
        written on the given line; `None` for a line of no step of
        its own, such as a background's."""
        for position, step in enumerate(self.scenario.steps, start=1):
            if step.line == line:
                return position
        return None


def _feature_path(feature_filename: str) -> Path:
    """Where the feature file's recordings are laid out from. The
    file itself, except under a Bazel test, whose source tree is read
    only and which keeps whatever a test writes under
    `TEST_UNDECLARED_OUTPUTS_DIR`."""
    feature = Path(feature_filename)
    outputs = os.environ.get('TEST_UNDECLARED_OUTPUTS_DIR')
    if outputs is not None:
        return Path(outputs) / feature.relative_to(Path.cwd())
    return feature


def _scenarios_and_backgrounds(
    feature: Feature,
) -> list[tuple[Scenario, list[Background]]]:
    """Each scenario of the feature with the backgrounds it runs
    under: the feature's, then its rule's."""
    feature_backgrounds = (
        [feature.background] if feature.HasField('background') else []
    )
    result: list[tuple[Scenario, list[Background]]] = [
        (scenario, feature_backgrounds) for scenario in feature.scenarios
    ]
    for rule in feature.rules:
        rule_backgrounds = feature_backgrounds + (
            [rule.background] if rule.HasField('background') else []
        )
        result.extend(
            (scenario, rule_backgrounds) for scenario in rule.scenarios
        )
    return result


def _sweep(feature: Feature, feature_filename: str) -> None:
    """Removes what earlier runs left that the feature file no longer
    accounts for: the directory of any scenario it no longer
    declares."""
    recordings_directory = recordings.recordings_directory(
        _feature_path(feature_filename)
    )
    declared = {
        recordings.scenario_slug(scenario.name)
        for scenario, _ in _scenarios_and_backgrounds(feature)
        if scenario.HasField('name')
    }
    for child in recordings_directory.glob('*'):
        if child.is_dir() and child.name not in declared:
            shutil.rmtree(child)


@pytest.fixture
def recording(request: pytest.FixtureRequest) -> Recording:
    """Where the running scenario's recordings go: its digest
    directory, made afresh, beside its feature file, after sweeping
    what earlier runs left that the feature file no longer accounts
    for, and the scenario's own earlier digest, so that it has one."""
    running = request.node.obj.__scenario__
    feature_filename = running.feature.filename
    parsed = bdd_feature.parse(Path(feature_filename).read_text())
    assert parsed is not None, f"{feature_filename} declares no feature"
    for scenario, backgrounds in _scenarios_and_backgrounds(parsed):
        if scenario.name == running.name:
            break
    else:
        raise AssertionError(
            f"{feature_filename} declares no scenario named {running.name!r}"
        )
    _sweep(parsed, feature_filename)
    directory = recordings.recording_directory(
        _feature_path(feature_filename),
        scenario,
        backgrounds,
    )
    shutil.rmtree(directory.parent, ignore_errors=True)
    directory.mkdir(parents=True)
    return Recording(
        scenario=scenario,
        directory=directory,
        dwell_ms=request.config.getoption('--recording-dwell'),
    )


@pytest.fixture(scope='session')
def browser_type_launch_args(
    browser_type_launch_args: dict,
    pytestconfig: pytest.Config,
) -> dict:
    """pytest-playwright's launch arguments, paced by
    `--recording-slowmo` unless its own `--slowmo` was given."""
    if 'slow_mo' in browser_type_launch_args:
        return browser_type_launch_args
    return {
        **browser_type_launch_args,
        'slow_mo':
            pytestconfig.getoption('--recording-slowmo'),
    }
