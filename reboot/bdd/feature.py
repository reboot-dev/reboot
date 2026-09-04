"""What a `.feature` file declares, as `rbt/v1alpha1/bdd/feature.proto`
declares it: the feature, its rules, their scenarios, and each step
parsed by the built-in steps' grammar.

Parsing is `gherkin-official`'s, which arrives with
`reboot[pytest-bdd]`, as does this package.
"""
import gherkin.errors
import gherkin.parser
import gherkin.token_scanner
from rbt.v1alpha1.bdd.feature_pb2 import (
    Background,
    Examples,
    Feature,
    Rule,
    Scenario,
    Step,
    Table,
)
from reboot.bdd import grammar
from textwrap import dedent
from typing import Any, Optional


def _description(parsed: dict[str, Any]) -> Optional[str]:
    """The prose under a heading, dedented, since the parser keeps
    each line's indentation, which on the page would read as
    accidental; `None` for a heading with none under it, which the
    parser reports as an empty string."""
    description = dedent(parsed['description']).strip()
    return description if description != '' else None


def _name(parsed: dict[str, Any]) -> Optional[str]:
    """What a heading names, and `None` for a bare heading naming
    nothing, which the parser reports as an empty string."""
    return parsed['name'] if parsed['name'] != '' else None


def _tags(parsed: dict[str, Any]) -> list[str]:
    return [tag['name'] for tag in parsed['tags']]


def _table(rows: list[dict[str, Any]]) -> Table:
    return Table(
        rows=[
            Table.Row(cells=[cell['value']
                             for cell in row['cells']])
            for row in rows
        ]
    )


def _step(parsed: dict[str, Any]) -> Step:
    return Step(
        keyword=parsed['keyword'].strip(),
        text=parsed['text'],
        doc_string=(
            parsed['docString']['content'] if 'docString' in parsed else None
        ),
        table=(
            _table(parsed['dataTable']['rows'])
            if 'dataTable' in parsed else None
        ),
        built_in=grammar.parse(parsed['text']),
    )


def _background(parsed: dict[str, Any]) -> Background:
    return Background(
        keyword=parsed['keyword'],
        name=_name(parsed),
        description=_description(parsed),
        steps=[_step(step) for step in parsed['steps']],
    )


def _examples(parsed: dict[str, Any]) -> Examples:
    rows = []
    if parsed.get('tableHeader') is not None:
        rows.append(parsed['tableHeader'])
    rows.extend(parsed.get('tableBody', []))
    return Examples(
        keyword=parsed['keyword'],
        name=_name(parsed),
        table=_table(rows),
    )


def _scenario(parsed: dict[str, Any]) -> Scenario:
    return Scenario(
        keyword=parsed['keyword'],
        name=_name(parsed),
        description=_description(parsed),
        tags=_tags(parsed),
        steps=[_step(step) for step in parsed['steps']],
        line=parsed['location']['line'],
        examples=[_examples(examples) for examples in parsed['examples']],
    )


def _rule(parsed: dict[str, Any]) -> Rule:
    background: Optional[Background] = None
    scenarios: list[Scenario] = []
    for child in parsed['children']:
        if 'background' in child:
            background = _background(child['background'])
        elif 'scenario' in child:
            scenarios.append(_scenario(child['scenario']))
    return Rule(
        keyword=parsed['keyword'],
        name=_name(parsed),
        description=_description(parsed),
        tags=_tags(parsed),
        background=background,
        scenarios=scenarios,
    )


def parse(source: str) -> Optional[Feature]:
    """What one feature file declares: a `Feature` carrying only why
    the source could not be parsed when it could not be, and `None`
    for a source that declares no feature at all, such as one holding
    only comments."""
    try:
        document = gherkin.parser.Parser().parse(
            gherkin.token_scanner.TokenScanner(source)
        )
    except gherkin.errors.CompositeParserException as error:
        return Feature(error=str(error))
    parsed = document.get('feature')
    if parsed is None:
        return None
    background: Optional[Background] = None
    scenarios: list[Scenario] = []
    rules: list[Rule] = []
    for child in parsed['children']:
        if 'background' in child:
            background = _background(child['background'])
        elif 'scenario' in child:
            scenarios.append(_scenario(child['scenario']))
        elif 'rule' in child:
            rules.append(_rule(child['rule']))
    return Feature(
        keyword=parsed['keyword'],
        name=_name(parsed),
        description=_description(parsed),
        tags=_tags(parsed),
        background=background,
        scenarios=scenarios,
        rules=rules,
    )
