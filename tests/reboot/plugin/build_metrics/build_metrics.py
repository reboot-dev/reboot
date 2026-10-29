"""How a build went, read from its coding agent's session transcript.

A change to the plugin's skills changes how builds go: how many
questions come before any code, how long until the design is shown,
the API written and a scenario passing. These numbers come from a
build's transcript, never from someone's memory of it, so two builds
of the same prompt, before and after a change, can be compared.

Two agents are read, each from its own record of a session:

* Claude Code: `~/.claude/projects/<project>/<session>.jsonl`;
* Codex: `~/.codex/sessions/<date>/rollout-<...>.jsonl`.

Both formats are the agents' own and undocumented, so each adapter
(`claude_events`, `codex_events`) reads only the fields it needs into
the same few `Event`s and skips anything it doesn't understand. Every
number is then worked out from the events alone (`measure`).

A Claude Code session's sub-agents (`<session>/subagents/agent-*.jsonl`,
a frontend built in parallel, say) are read with it: what they write and
run counts toward the moments below, on the session's clock, while what
they read is counted apart (`sub_agent_words`), since it never enters
the main conversation.

Times are active seconds: from the first event, less the time spent
waiting for the person to answer a question, and less the time from
the build ending its turn (the Claude app's `wrap_up`) to the person's
next prompt. A build is not slower for waiting on a person. -1 means
the moment never came.

What each moment is taken to be:

* the design: the go-ahead question (`GO_AHEAD`) asked once the
  design has been shown in a message, the moment it is shown for a
  decision; failing that, the first message headed "the proposed
  design"; failing that, the first message of `DESIGN_WORDS` words or
  more;
* an edit: the first tool call that writes a file;
* the feature file: the first write of a `.feature` file;
* the API file: the first write of a Python file under `api/`;
* the servicers: the first write of a Python file under `servicers/`;
* a passing scenario: the first tool result that reports `N passed`
  and nothing failed, or a test run's record with `'passed': N` and
  `'failed': 0` (a run in the background is read back that way);
* the first page: the first write of a `.tsx` file under `frontend/`;
* the handoff: the first message with a "Your turn" section, where the
  person first tries what was built.
"""

import json
import re
from collections.abc import Iterable, Iterator
from dataclasses import dataclass, field, replace
from datetime import datetime
from pathlib import Path

DESIGN_WORDS = 200
DESIGN_HEADING = "the proposed design"
# The question that asks for the go-ahead on a shown design, in either
# of the skills' wordings.
GO_AHEAD = ("Ready to build?", "How should it be built?", "Build on this design?")
FEATURE_FILE = re.compile(r"\.feature$")
SERVICER_FILE = re.compile(r"(?:^|/)servicers/\S+\.py$")
PAGE_FILE = re.compile(r"(?:^|/)frontend/\S+\.tsx$")
HANDOFF = "Your turn"

API_FILE = re.compile(r"(?:^|/)api/\S+\.py$")
PASSED = re.compile(r"\b(\d+) passed\b")
FAILED = re.compile(r"\b\d+ (?:failed|errors?)\b")
# A test run's record, as Python or JSON: `{'passed': 11, 'failed': 0`.
RECORD = re.compile(
    r"""["']passed["']\s*:\s*(\d+)\s*,\s*["']failed["']\s*:\s*(\d+)"""
)
TRACEBACK = "Traceback (most recent call last)"


@dataclass(frozen=True)
class Event:
    """One thing that happened in a session, whichever agent ran it.

    `kind` is one of:

    * "say": a message to the person (`text`);
    * "call": a tool call (`id`, `name`, the files it `writes`,
      `questions`, how many it asks the person, and `text`, what they
      ask);
    * "result": a tool call's result (`id`, `text`, `failed`);
    * "load": a skill or an `AGENTS.md` taken in (`text`, and `source`,
      where a skill came from);
    * "start": the session's first moment.

    `sub` marks an event from one of the session's sub-agents: it counts
    toward the build's moments, but not toward what the person was asked
    or shown, nor the main conversation's reading.
    """

    at: datetime
    kind: str
    id: str = ""
    name: str = ""
    text: str = ""
    writes: tuple[str, ...] = ()
    questions: int = 0
    failed: bool = False
    source: str = ""
    sub: bool = False


@dataclass
class Metrics:
    agent: str = ""
    plugin: str = ""
    questions: int = 0
    design_s: int = -1
    edit_s: int = -1
    feature_s: int = -1
    api_s: int = -1
    servicers_s: int = -1
    green_s: int = -1
    page_s: int = -1
    handoff_s: int = -1
    calls_before_edit: int = 0
    passed: int = 0
    errors: int = 0
    error_lines: list[str] = field(default_factory=list)
    words_before_api: int = 0
    # What the session's sub-agents took in (skills, files, results):
    # read outside the main conversation, so it is never sent again on
    # its later turns.
    sub_agent_words: int = 0
    # Whether an `AGENTS.md` was taken in: Codex records it, Claude Code
    # doesn't (`claude_events`).
    map_loaded: bool = False


# -- Reading a transcript. --


def lines(path: Path) -> Iterator[dict]:
    """Each line that is a JSON object; anything else is skipped."""
    with path.open(encoding="utf-8", errors="replace") as file:
        for line in file:
            try:
                record = json.loads(line)
            except json.JSONDecodeError:
                continue
            if isinstance(record, dict):
                yield record


def parse_time(record: dict) -> datetime | None:
    stamp = str(record.get("timestamp") or "")
    try:
        # Python 3.10, which Reboot supports, doesn't read a final "Z".
        return datetime.fromisoformat(
            stamp.replace("Z", "+00:00")  # noqa: FURB162
        )
    except ValueError:
        return None


def text_of(content: object) -> str:
    """The text in a message's or a tool result's content."""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts = []
        for block in content:
            if isinstance(block, dict):
                parts.append(text_of(block.get("text", block.get("content"))))
            else:
                parts.append(text_of(block))
        return "\n".join(parts)
    return ""


def plugin_source(base: str) -> str:
    """Where a skill came from, by the folder it was loaded from."""
    if "local-agent-mode-sessions" in base:
        return "Claude app upload"
    installed = re.search(
        r"/(?:plugins/(?:cache|marketplaces)|\.tmp/marketplaces)/([^/]+)",
        base,
    )
    if installed:
        return f"{installed.group(1)} (installed)"
    return Path(base).name


def agent_of(path: Path) -> str:
    """"codex" when the transcript is Codex's, else "claude"."""
    for record in lines(path):
        if record.get("type") in ("session_meta", "response_item"):
            return "codex"
        if record.get("type") in ("user", "assistant"):
            return "claude"
    return "claude"


# -- Claude Code. --

CLAUDE_SKILL = re.compile(
    r"Base directory for this skill: (\S[^\n]*?)/skills/"
)
# A file written from a shell: `cat > api/x/v1/x.py <<EOF`. Not `=>`,
# `->` or `>>`'s second `>`.
SHELL_WRITE = re.compile(r"(?<![=\->])>\s*([\w./-]+\.\w+)")
CLAUDE_EDITS = ("Write", "Edit", "MultiEdit", "NotebookEdit")
# A tool call the person declined is not an error of the build's.
DECLINED = "doesn't want to proceed"


def claude_events(path: Path) -> Iterator[Event]:
    for record in lines(path):
        at = parse_time(record)
        if at is None:
            continue
        message = record.get("message")
        content = message.get("content") if isinstance(message, dict) else None
        if record.get("type") == "assistant" and isinstance(content, list):
            for block in content:
                if isinstance(block, dict):
                    yield from _claude_assistant(at, block)
        elif record.get("type") == "user":
            blocks = content if isinstance(content, list) else [content]
            for block in blocks:
                yield from _claude_user(at, block)


def _claude_assistant(at: datetime, block: dict) -> Iterator[Event]:
    if block.get("type") == "text":
        yield Event(at, "say", text=str(block.get("text", "")))
        return
    if block.get("type") != "tool_use":
        return
    name = str(block.get("name"))
    args = block.get("input")
    args = args if isinstance(args, dict) else {}
    writes: tuple[str, ...] = ()
    if name in CLAUDE_EDITS:
        writes = (str(args.get("file_path") or args.get("notebook_path")),)
    elif name == "Bash":
        writes = tuple(SHELL_WRITE.findall(str(args.get("command", ""))))
    questions = 0
    asked = ""
    if name == "AskUserQuestion":
        items = args.get("questions") or []
        questions = len(items)
        asked = "\n".join(
            str(item.get("question", ""))
            for item in items
            if isinstance(item, dict)
        )
    yield Event(
        at,
        "call",
        id=str(block.get("id")),
        name=name,
        text=asked,
        writes=writes,
        questions=questions,
    )


def _claude_user(at: datetime, block: object) -> Iterator[Event]:
    if isinstance(block, dict) and block.get("type") == "tool_result":
        text = text_of(block.get("content"))
        failed = bool(block.get("is_error")) and DECLINED not in text
        yield Event(
            at,
            "result",
            id=str(block.get("tool_use_id")),
            text=text,
            failed=failed,
        )
        return
    # A skill's body arrives as the person's text.
    text = text_of(block.get("text") if isinstance(block, dict) else block)
    # Claude Code keeps a project's `CLAUDE.md` out of the transcript, so
    # `map_loaded` is only ever known for Codex.
    skill = CLAUDE_SKILL.search(text)
    if skill:
        yield Event(at, "load", text=text, source=skill.group(1))


# -- Codex. --

# Codex writes files with patches: `*** Add File: <path>` or `*** Update
# File: <path>`, inside a tool call's input, where a script may hold the
# patch as an escaped string, so a path also ends at a literal `\n`.
PATCH_FILE = re.compile(r"\*\*\* (?:Add|Update) File: (.+?)(?:\\n|\n|$)")
CODEX_AGENTS_MD = "# AGENTS.md instructions for"
CODEX_SKILL_ROOT = re.compile(r"`r\d+` = `([^`]+)`")
CODEX_CALLS = ("custom_tool_call", "function_call")
CODEX_RESULTS = ("custom_tool_call_output", "function_call_output")


def codex_events(path: Path) -> Iterator[Event]:
    for record in lines(path):
        at = parse_time(record)
        payload = record.get("payload")
        if at is None or not isinstance(payload, dict):
            continue
        if record.get("type") != "response_item":
            continue
        kind = payload.get("type")
        if kind == "message":
            yield from _codex_message(at, payload)
        elif kind in CODEX_CALLS:
            source = payload.get("input") or payload.get("arguments") or ""
            source = source if isinstance(source, str) else json.dumps(source)
            name = str(payload.get("name"))
            writes = tuple(p.strip() for p in PATCH_FILE.findall(source))
            for command in _codex_commands(source):
                writes += tuple(SHELL_WRITE.findall(command))
            questions = source.count("request_user_input")
            yield Event(
                at,
                "call",
                id=str(payload.get("call_id")),
                name=name,
                text=source if questions else "",
                writes=writes,
                questions=questions,
            )
        elif kind in CODEX_RESULTS:
            text = text_of(payload.get("output"))
            yield Event(
                at,
                "result",
                id=str(payload.get("call_id")),
                text=text,
            )


# The shell commands in a call: a code-mode script's `cmd: "..."`, or a
# function call's JSON `cmd`. Only these can write a file from a shell;
# the rest of a script is JavaScript, where `=>` is not a redirect.
CODEX_CMD = re.compile(r'cmd\s*:\s*"((?:[^"\\]|\\.)*)"')


def _codex_commands(source: str) -> list[str]:
    commands = CODEX_CMD.findall(source)
    try:
        arguments = json.loads(source)
    except json.JSONDecodeError:
        return commands
    if isinstance(arguments, dict):
        command = arguments.get("cmd") or arguments.get("command")
        if isinstance(command, list):
            command = " ".join(str(part) for part in command)
        if isinstance(command, str):
            commands.append(command)
    return commands


def _codex_message(at: datetime, payload: dict) -> Iterator[Event]:
    role = payload.get("role")
    text = text_of(payload.get("content"))
    if role == "assistant":
        yield Event(at, "say", text=text)
    elif role == "user" and text.lstrip().startswith(CODEX_AGENTS_MD):
        yield Event(at, "load", text=text, source="AGENTS.md")
    elif role == "developer":
        for root in CODEX_SKILL_ROOT.findall(text):
            if "reboot" in root:
                yield Event(at, "load", source=root)


def sub_agents(path: Path) -> list[Path]:
    """A Claude Code session's sub-agent transcripts, which it keeps
    beside its own: `<session>/subagents/agent-<id>.jsonl`."""
    folder = path.parent / path.stem / "subagents"
    return sorted(folder.glob("agent-*.jsonl"))


def events(path: Path) -> list[Event]:
    """The session's events, its sub-agents' among them, in the order
    they happened, after a "start" event at the session's first
    timestamp, whatever record holds it (the person's prompt, usually).
    Codex keeps no sub-agent transcripts of this kind."""
    codex = agent_of(path) == "codex"
    read = codex_events if codex else claude_events
    times = (parse_time(record) for record in lines(path))
    start = min((t for t in times if t is not None), default=None)
    found = list(read(path))
    if not codex:
        for sub in sub_agents(path):
            found += [replace(e, sub=True) for e in claude_events(sub)]
    found.sort(key=lambda e: e.at)
    return ([Event(start, "start")] if start else []) + found


# -- Working out the numbers. --


class _Clock:
    """Active seconds since the first event, less the waits."""

    def __init__(self, start: datetime) -> None:
        self.start = start
        self.waits: list[tuple[datetime, datetime]] = []

    def active(self, at: datetime) -> int:
        waited = sum(
            (min(end, at) - begin).total_seconds()
            for begin, end in self.waits
            if begin < at
        )
        return max(0, round((at - self.start).total_seconds() - waited))


# A moment set by the first write of a file its pattern matches.
WRITTEN = (
    ("feature_s", FEATURE_FILE),
    ("servicers_s", SERVICER_FILE),
    ("page_s", PAGE_FILE),
)


def measure(stream: Iterable[Event], agent: str = "") -> Metrics:
    metrics = Metrics(agent=agent)
    clock: _Clock | None = None
    asked: dict[str, datetime] = {}
    # When the build ended its turn (the Claude app's `wrap_up`), until
    # its next word or call: time the build wasn't running. The person's
    # prompt itself isn't the mark, since the app adds user records of
    # its own (a working-directory notice) seconds after the turn ends.
    turn_ended: datetime | None = None
    # The design's three readings, best first (the module's docstring).
    go_ahead_s = heading_s = long_s = -1
    for event in stream:
        clock = clock or _Clock(event.at)
        api_written = metrics.api_s >= 0
        if event.sub and event.kind in ("result", "load"):
            # A sub-agent's reading stays out of the main conversation.
            metrics.sub_agent_words += len(event.text.split())
        if event.sub and event.kind == "say":
            continue  # a sub-agent's words go to the build, not the person
        if not event.sub and event.kind in ("say", "call"):
            if turn_ended is not None:
                clock.waits.append((turn_ended, event.at))
                turn_ended = None
            if event.kind == "call" and event.name.endswith("wrap_up"):
                turn_ended = event.at
        if event.kind == "say":
            if long_s < 0 and len(event.text.split()) >= DESIGN_WORDS:
                long_s = clock.active(event.at)
            if heading_s < 0 and DESIGN_HEADING in event.text:
                heading_s = clock.active(event.at)
            if metrics.handoff_s < 0 and HANDOFF in event.text:
                metrics.handoff_s = clock.active(event.at)
        elif event.kind == "call":
            if event.questions and not event.sub:
                asked[event.id] = event.at
                if not api_written:
                    metrics.questions += event.questions
                if (
                    go_ahead_s < 0 and (heading_s >= 0 or long_s >= 0) and
                    any(q in event.text for q in GO_AHEAD)
                ):
                    go_ahead_s = clock.active(event.at)
            if event.writes and metrics.edit_s < 0:
                metrics.edit_s = clock.active(event.at)
            if metrics.edit_s < 0 and not event.sub:
                metrics.calls_before_edit += 1
            if not api_written and any(
                API_FILE.search(path) for path in event.writes
            ):
                metrics.api_s = clock.active(event.at)
            for key, pattern in WRITTEN:
                if getattr(metrics, key) < 0 and any(
                    pattern.search(path) for path in event.writes
                ):
                    setattr(metrics, key, clock.active(event.at))
        elif event.kind == "result":
            _result(metrics, clock, asked, event)
        elif event.kind == "load":
            if event.source == "AGENTS.md":
                metrics.map_loaded = True
            elif not metrics.plugin:
                metrics.plugin = plugin_source(event.source)
            if not api_written and not event.sub:
                metrics.words_before_api += len(event.text.split())
    metrics.design_s = next(
        (s for s in (go_ahead_s, heading_s, long_s) if s >= 0), -1
    )
    return metrics


def _result(
    metrics: Metrics,
    clock: _Clock,
    asked: dict[str, datetime],
    event: Event,
) -> None:
    question = asked.pop(event.id, None)
    if question is not None:
        clock.waits.append((question, event.at))
        return
    if metrics.api_s < 0 and not event.sub:
        metrics.words_before_api += len(event.text.split())
    if event.failed or TRACEBACK in event.text:
        metrics.errors += 1
        texts = [line.strip() for line in event.text.splitlines()]
        last = next((line for line in reversed(texts) if line), "")
        if len(metrics.error_lines) < 20:
            metrics.error_lines.append(last[:200])
    counts = PASSED.findall(event.text)
    if counts:
        metrics.passed = int(counts[-1])
        if metrics.green_s < 0 and not FAILED.search(event.text):
            metrics.green_s = clock.active(event.at)
    records = RECORD.findall(event.text)
    if records:
        passed, failed = (int(n) for n in records[-1])
        metrics.passed = passed
        if metrics.green_s < 0 and passed and not failed:
            metrics.green_s = clock.active(event.at)


def read(path: Path) -> Metrics:
    """How the build in the transcript at `path` went."""
    return measure(events(path), agent=agent_of(path))


# -- Comparing two builds. --

# A time may run this much over the baseline's before it counts as
# worse: two builds of one prompt never take exactly as long.
SLACK = 1.10

# Each compared number and its label.
COMPARED = (
    ("questions", "Questions before code"),
    ("design_s", "Active time to the design"),
    ("feature_s", "Active time to the feature file"),
    ("api_s", "Active time to the API file"),
    ("servicers_s", "Active time to the servicers"),
    ("green_s", "Active time to the first passing scenario"),
    ("page_s", "Active time to the first page"),
    ("handoff_s", "Active time to the first handoff"),
    ("words_before_api", "Words taken in before the API file"),
    ("errors", "Errors hit"),
)

# The numbers a change to the skills must not make worse.
GATED = ("questions", "design_s", "api_s", "green_s")


def worse(key: str, value: int, baseline: int) -> bool:
    """Whether `value` is worse than the baseline's. A moment that
    never came (-1) is worse when the baseline reached it."""
    if baseline < 0:
        return False
    if value < 0:
        return True
    if key in ("questions", "errors"):
        return value > baseline
    return value > baseline * SLACK


def worse_on(build: Metrics, baseline: Metrics) -> list[str]:
    return [
        key for key, _ in COMPARED
        if worse(key, getattr(build, key), getattr(baseline, key))
    ]
