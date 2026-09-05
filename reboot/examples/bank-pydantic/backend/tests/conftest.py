"""Records each browser scenario: a video of the run and a screenshot
after each of its assertion steps, kept beside the feature file the
way `reboot.bdd.recordings` lays them out, so that they are versioned
with the scenarios they show.

A spike of what `reboot.bdd` would do for every browser scenario.
"""
import os
import pytest
import shutil
from dataclasses import dataclass
from pathlib import Path
from playwright.sync_api import Locator
from reboot.bdd import recordings
from typing import Iterator, Optional

# The size Playwright records at: the default viewport, so that the
# video shows what the screenshots show.
VIDEO_SIZE = {'width': 1280, 'height': 720}

# How long Playwright waits after each browser operation, so that a
# viewer of the video can follow each click and keystroke, and how
# long an assertion step's result stays on screen after the step
# passes, so that it can be seen before the next step changes it.
# Both in milliseconds, and both `0` for a run that records without
# pacing.
DEFAULT_SLOW_MO_MS = 500
DEFAULT_ASSERTION_DWELL_MS = 1000

# The outline drawn around the element an assertion step looked at
# while its screenshot is taken and its result dwells on screen.
OUTLINE = '3px solid #f59e0b'


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
class Asserted:
    """What the scenario's latest assertion step looked at in the
    browser, so that its screenshot can show it."""

    # The element the step asserted on; `None` before any step has,
    # or when the step asserted on the page as a whole.
    element: Optional[Locator] = None


@pytest.fixture
def asserted() -> Asserted:
    return Asserted()


def _scenario_directory(feature_filename: str, scenario_name: str) -> Path:
    """Where the named scenario's recordings go. Beside the feature
    file, except under a Bazel test, whose source tree is read only
    and which keeps whatever a test writes under
    `TEST_UNDECLARED_OUTPUTS_DIR`."""
    feature = Path(feature_filename)
    outputs = os.environ.get('TEST_UNDECLARED_OUTPUTS_DIR')
    if outputs is not None:
        feature = Path(outputs) / feature.relative_to(Path.cwd())
    return recordings.scenario_directory(feature, scenario_name)


def _scenario_of(request: pytest.FixtureRequest):
    """The pytest-bdd scenario the requesting test runs."""
    return request.node.obj.__scenario__


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


@pytest.fixture
def browser_context_args(
    browser_context_args: dict,
    request: pytest.FixtureRequest,
) -> Iterator[dict]:
    """pytest-playwright's context arguments plus recording the
    scenario's video into its directory, emptied first so that nothing
    from an earlier run outlives the scenario that made it. Once the
    context has closed, the video Playwright named at random is
    renamed to the scenario's."""
    scenario = _scenario_of(request)
    directory = _scenario_directory(scenario.feature.filename, scenario.name)
    shutil.rmtree(directory, ignore_errors=True)
    directory.mkdir(parents=True)
    yield {
        **browser_context_args,
        'record_video_dir': str(directory),
        'record_video_size': VIDEO_SIZE,
    }
    videos = sorted(directory.glob('*.webm'), key=os.path.getmtime)
    for video in videos[:-1]:
        video.unlink()
    if videos:
        videos[-1].rename(directory / recordings.VIDEO_FILENAME)


def pytest_bdd_after_step(
    request: pytest.FixtureRequest,
    feature,
    scenario,
    step,
    step_func,
    step_func_args: dict,
) -> None:
    """Screenshots the browser after each assertion step that drives
    one, a `Then` or an `And` or `But` continuing one, with the element
    the step asserted on scrolled to the middle of the view and
    outlined, then leaves it on screen for `--recording-dwell`."""
    page = step_func_args.get('page')
    if page is None or step.type != 'then':
        return
    asserted = step_func_args.get('asserted')
    element = asserted.element if asserted is not None else None
    if element is not None:
        # A small element, such as a figure, is outlined just outside
        # its box; a large one, such as a table, just inside, since a
        # container that scrolls would clip an outline outside it.
        element.evaluate(
            'element => {'
            '  element.scrollIntoView({block: "center", inline: "nearest"});'
            f'  element.style.outline = "{OUTLINE}";'
            '  element.style.outlineOffset = '
            '    element.getBoundingClientRect().height > 60 ? "-3px" : "4px";'
            '}'
        )
    directory = _scenario_directory(feature.filename, scenario.name)
    directory.mkdir(parents=True, exist_ok=True)
    page.screenshot(
        path=str(directory / recordings.screenshot_filename(step.line_number)),
    )
    page.wait_for_timeout(request.config.getoption('--recording-dwell'))
    if element is not None:
        element.evaluate(
            'element => {'
            '  element.style.outline = "";'
            '  element.style.outlineOffset = "";'
            '}'
        )
