"""Records each browser scenario: a video of the run and a screenshot
after each of its assertion steps, kept beside the feature file the
way `reboot.bdd.recordings` lays them out, so that they are versioned
with the scenarios they show.

A spike of what `reboot.bdd` would do for every browser scenario.
"""
import os
import pytest
import shutil
from pathlib import Path
from reboot.bdd import recordings
from typing import Iterator

# The size Playwright records at: the default viewport, so that the
# video shows what the screenshots show.
VIDEO_SIZE = {'width': 1280, 'height': 720}


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
    one: a `Then`, or an `And` or `But` continuing one."""
    page = step_func_args.get('page')
    if page is None or step.type != 'then':
        return
    directory = _scenario_directory(feature.filename, scenario.name)
    directory.mkdir(parents=True, exist_ok=True)
    page.screenshot(
        path=str(directory / recordings.screenshot_filename(step.line_number)),
    )
