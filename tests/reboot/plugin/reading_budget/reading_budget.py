"""The plugin's reading path: what a build that follows the skills reads.

Everything a build reads stays in its context and is sent again on
every later turn, so the size of this path is a cost every build pays.
For each front door the path is:

* the `SKILL.md` of every skill the build is told to load
  (`SKILLS_LOADED`), and
* every reference its front door's reading list names: the
  "Which References to Read, and When" section of that front door's
  `SKILL.md`, grouped under "**Before the ...**" headings.

A reference the list makes conditional ("only when you declared a
`Workflow`") is read only by some builds. `CONDITIONAL` names each one
with the words that make it so, and the minimal path leaves them out.
"""

import re
from collections.abc import Iterator
from dataclasses import dataclass
from pathlib import Path

FRONT_DOORS = ("web-app", "mcp-ui")

# The skills a build of each front door is told to load, from the
# prompt to the handoff: the `app` router, the front door, the
# `dashboard` (step 3 of the front door's build), the `feature`
# workflow and `run`. `python` is not on the list: the `app` skill says
# a front door doesn't need it, and its references come in through the
# reading list instead.
SKILLS_LOADED = {
    door: ("app", door, "dashboard", "feature", "run") for door in FRONT_DOORS
}

# Every reference a reading list makes conditional, with the words in
# its entry that say so. `reading_budget_test` checks that each entry
# still says it, so rewording an entry can't silently move the budget.
CONDITIONAL = {
    "web-app":
        {
            "python/references/api-errors.md":
                "when the API declares",
            "python/references/servicer-workflow.md":
                "only when",
            "python/references/auth-external-api-calls.md":
                "calling an external",
            "python/references/stdlib-oauth-tokens.md":
                "calling an external",
            "python/references/testing-harness.md":
                "custom steps",
            "python/references/testing-external-context.md":
                "custom steps",
        },
    "mcp-ui":
        {
            "python/references/api-errors.md": "when the API declares",
            "python/references/servicer-workflow.md": "only when",
            "mcp-ui/references/auth-custom-oauth-provider.md": "when none of",
            "mcp-ui/references/auth-store-tokens.md": "when the",
            "mcp-ui/references/pop-out-to-web-app.md": "only when",
            "python/references/testing-harness.md": "custom steps",
            "python/references/testing-external-context.md": "custom steps",
        },
}

READING_LIST = "## Which References to Read, and When"

# "**Before the API definition:**", "**Before running the app**": a
# step's heading, and the step's name.
STEP = re.compile(r"\*\*Before (?:the |running )?([^*:(]+)")

# A reference named in an entry: `python/references/rpc-calls.md`,
# `references/react-client.md` (the front door's own), or a brace list,
# `python/references/servicer-{reader,writer}.md`.
REFERENCE = re.compile(
    r"(?:\.\./)?(?:(?P<skill>[a-z-]+)/)?references/"
    r"(?P<name>[A-Za-z0-9_-]*(?:\{[^}]+\})?[A-Za-z0-9_-]*)\.md"
)

# A bare file name in backticks, `testing-external-context.md`, which
# the list uses after naming a reference's folder once.
BARE_REFERENCE = re.compile(r"`(?P<name>[a-z]+-[a-z0-9-]+)\.md`")


@dataclass(frozen=True)
class Entry:
    """One reference on a reading list."""

    step: str
    path: str  # relative to the skills folder; empty when unresolved
    named: str  # as the list names it
    text: str  # the entry it is named in


def words(file: Path) -> int:
    return len(file.read_text(encoding="utf-8").split())


def expand(name: str) -> list[str]:
    """`servicer-{reader,writer}` -> `servicer-reader`, `servicer-writer`."""
    match = re.search(r"\{([^}]+)\}", name)
    if match is None:
        return [name]
    head, tail = name[:match.start()], name[match.end():]
    return [head + part.strip() + tail for part in match.group(1).split(",")]


def section(markdown: str) -> str:
    """The reading-list section of a front door's `SKILL.md`."""
    start = markdown.find(READING_LIST)
    if start < 0:
        return ""
    end = markdown.find("\n## ", start + len(READING_LIST))
    return markdown[start:] if end < 0 else markdown[start:end]


def entries(text: str) -> Iterator[tuple[str, str]]:
    """(step, entry) for each entry of a reading-list section: a bullet
    with its continuation lines, or one sentence of prose under a step.
    Callouts (`>`) name references to avoid, so they are skipped."""
    step = ""
    bullet: list[str] = []
    prose: list[str] = []

    def flush() -> Iterator[tuple[str, str]]:
        if bullet:
            yield step, " ".join(bullet)
            bullet.clear()
        if prose:
            for sentence in re.split(r"(?<=[.;])\s+", " ".join(prose)):
                yield step, sentence
            prose.clear()

    for line in text.splitlines():
        heading = STEP.match(line)
        if heading:
            yield from flush()
            step = heading.group(1).strip().rstrip(":").lower()
            # What follows the heading on its line, past its closing
            # `:**`, is the step's first prose.
            rest = line[heading.end():].lstrip(":* ")
            if rest:
                prose.append(rest)
        elif line.startswith("- "):
            yield from flush()
            bullet.append(line[2:])
        elif line.startswith("  ") and bullet:
            bullet.append(line.strip())
        elif line.startswith(">"):
            yield from flush()
        elif line.strip():
            if bullet:
                yield from flush()
            if step:
                prose.append(line.strip())
        else:
            yield from flush()
    yield from flush()


def resolve(skills: Path, door: str, skill: str | None, name: str) -> str:
    """A named reference's path under `skills`, or "" when there is none.
    Without a skill, `references/x.md` is the front door's own, else the
    `python` skill's."""
    owners = [skill] if skill else [door, "python"]
    for owner in owners:
        path = f"{owner}/references/{name}.md"
        if (skills / path).is_file():
            return path
    return ""


def reading_list(skills: Path, door: str) -> list[Entry]:
    """Every reference the front door's reading list names, in order,
    each once."""
    markdown = (skills / door / "SKILL.md").read_text(encoding="utf-8")
    found: list[Entry] = []
    seen: set[str] = set()
    for step, text in entries(section(markdown)):
        named = [(m["skill"], m["name"]) for m in REFERENCE.finditer(text)]
        named += [(None, m["name"]) for m in BARE_REFERENCE.finditer(text)]
        for skill, raw in named:
            for name in expand(raw):
                path = resolve(skills, door, skill, name)
                key = path or f"{skill or '?'}/references/{name}.md"
                if key in seen:
                    continue
                seen.add(key)
                found.append(Entry(step, path, key, text))
    return found


@dataclass(frozen=True)
class ReadingPath:
    """A front door's reading path, in words."""

    door: str
    skills: int
    references: int
    conditional: int

    @property
    def minimal(self) -> int:
        return self.skills + self.references

    @property
    def everything(self) -> int:
        return self.skills + self.references + self.conditional


def reading_path(skills: Path, door: str) -> ReadingPath:
    conditional = CONDITIONAL[door]
    skill_words = sum(
        words(skills / name / "SKILL.md") for name in SKILLS_LOADED[door]
    )
    always = 0
    sometimes = 0
    for entry in reading_list(skills, door):
        if not entry.path:
            continue
        if entry.path in conditional:
            sometimes += words(skills / entry.path)
        else:
            always += words(skills / entry.path)
    return ReadingPath(door, skill_words, always, sometimes)
