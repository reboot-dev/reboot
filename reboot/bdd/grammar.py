"""The grammar of the built-in steps: the regular expressions that
match a step's text, and a parse of a step's text into its syntax
tree, which built-in step it is and the parts the step takes, as
`rbt/v1alpha1/bdd/grammar.proto` declares them.

Kept apart from the steps themselves so that reading a step needs
nothing of pytest-bdd: the dashboard reads `.feature` files with this
same grammar, which is what lets it say that a span is a state type
rather than guess from its spelling.
"""
import re
from rbt.v1alpha1.bdd.grammar_pb2 import (
    AbortsWith,
    ApplicationIsUp,
    Assertion,
    Assignment,
    AttemptAbortsWith,
    Attempts,
    BuiltInSyntax,
    ChecksInWebApp,
    ClicksInWebApp,
    Containing,
    Element,
    Equals,
    EventuallyHas,
    FillsInWebApp,
    Gets,
    GetsCreatedVia,
    Has,
    HasBearerToken,
    HasSavedAs,
    IsAnAuthenticatedUser,
    OfLength,
    OpensWebApp,
    PressesInWebApp,
    ResultHas,
    ResultingIsSavedAs,
    Save,
    SavesTextInWebAppAs,
    SeesEnabledInWebApp,
    SeesInWebApp,
    SeesWebAppAt,
    SelectsInWebApp,
    SharedContext,
    State,
    TaskCompletes,
    Value,
)
from typing import Optional

# A property path in step text: a leading field, then dotted fields,
# bracketed list indices, and bracketed map keys.
PATH = r'\w+(?:\.\w+|\[\d+\]|\["[^"]*"\])*'

# One 'path=value' property clause: the property's path and value
# in backticks, the value being anything up to the closing backtick.
# The groupless form embeds in step patterns and deliberately also
# matches lexical near-misses (':' for '=', spaces around the '=',
# an empty value) so that those route to a step whose parser
# raises the fix; the compiled form is the strict shape, for
# extraction.
PROPERTY_CLAUSE = rf'`{PATH}\s*[:=]\s*[^`]*`'
PROPERTY_PATTERN = re.compile(rf'`(?P<path>{PATH})=(?P<value>\S[^`]*)`')

# One saving clause: the (possibly dotted) property path in
# backticks, saved under a backticked name. The groupless form
# embeds in step patterns and deliberately also matches lexical
# near-misses ('saved to', a quoted or '$'-prefixed name) so that
# those route to a step whose parser raises the fix; the compiled
# form is the strict shape, for extraction.
SAVE_CLAUSE = rf'`{PATH}`\s+saved\s+(?:as|to)\s+(?:`\w+`|"?\$?\w+"?)'
SAVE_PATTERN = re.compile(rf'`(?P<path>{PATH})` saved as `(?P<saved>\w+)`')

# One containing clause: asserts a substring of a string, an element
# of a list, or a key of a map; the argument is a backticked JSON
# value, the same grammar as a property's value. The groupless form
# embeds in step patterns and also matches 'contains' and a bare
# argument, so those near-misses route to a step whose parser raises
# the fix; the compiled form is the strict shape, for extraction.
CONTAINING_CLAUSE = (
    rf'`{PATH}`\s+contain(?:s|ing)\s+'
    r'(?:`[^`]*`|"(?:[^"\\]|\\.)*"|\$?[-+.\w{{}}]+)'
)
CONTAINING_PATTERN = re.compile(
    rf'`(?P<path>{PATH})` containing `(?P<argument>\S[^`]*)`'
)

# One length clause: asserts the length of a string, list, or map;
# the length is a backticked value too, so it can recall a save. The
# groupless form embeds in step patterns and also matches a missing
# 'of' or a bare length, for diagnosis; the compiled form is the
# strict shape, for extraction.
LENGTH_CLAUSE = rf'`{PATH}`\s+(?:of\s+)?length\s+(?:`[^`]*`|\S+)'
LENGTH_PATTERN = re.compile(
    rf'`(?P<path>{PATH})` of length `(?P<length>\S[^`]*)`'
)

# What separates two clauses in step text: a comma, an 'and', or a
# comma followed by an 'and'.
SEPARATOR = r'\s*(?:,\s*and|,|and)\s+'

# A clause list of only 'path=value' properties: what a call's
# 'with' passes.
PROPERTY_CLAUSES = rf'{PROPERTY_CLAUSE}(?:{SEPARATOR}{PROPERTY_CLAUSE})*'

# One asserting clause: an equality or a predicate.
ASSERT_CLAUSE = (rf'(?:{PROPERTY_CLAUSE}|{CONTAINING_CLAUSE}|{LENGTH_CLAUSE})')

# A clause list of asserting clauses: what a Then 'has' and an
# abort's 'with' assert.
ASSERT_CLAUSES = rf'{ASSERT_CLAUSE}(?:{SEPARATOR}{ASSERT_CLAUSE})*'

# A clause list of only saving clauses: what a Given or When 'has'
# saves.
SAVE_CLAUSES = rf'{SAVE_CLAUSE}(?:{SEPARATOR}{SAVE_CLAUSE})*'

# A clause list mixing both kinds, which no step accepts; it exists
# so the mistake gets a pointed error instead of an unmatched step.
# A property value can never contain a backtick, so the lookaheads
# can only hit an actual clause of each kind.
CLAUSE = rf'(?:{ASSERT_CLAUSE}|{SAVE_CLAUSE})'
MIXED_CLAUSES = (
    rf'(?=.*`\s+saved\s)'
    rf'(?=.*(?:`{PATH}\s*[:=]|`{PATH}`\s+contain|'
    rf'`{PATH}`\s+(?:of\s+)?length))'
    rf'{CLAUSE}(?:{SEPARATOR}{CLAUSE})*'
)

# The 'the `Account` for "alice"' phrase naming the state a step acts
# on.
STATE = r'the `(?P<state_type>[\w.]+)` for "(?P<state_id>[^"]*)"'

# The user a step calls as, 'as "alice" ' at the step's start; a step
# without it calls anonymously.
AS = r'(?:as "(?P<user>[^"]*)" )?'

# A step's optional trailing property list.
PROPERTIES = rf'(?: with (?P<clauses>{PROPERTY_CLAUSES}))?'

# The shape of each built-in step's text: what the step registers
# with pytest-bdd, and what `read` reads a step by. Named for the
# phrase that distinguishes the step.
APPLICATION_IS_UP = r'the (?:"(?P<name>[^"]*)" )?application is up$'
IS_AN_AUTHENTICATED_USER = r'"(?P<user_id>[^"]*)" is an authenticated user$'
HAS_BEARER_TOKEN = (
    r'"(?P<user_id>[^"]*)" has the bearer token "(?P<bearer_token>[^"]*)"$'
)
SHARED_CONTEXT = rf'{AS}a shared context$'
GETS_CREATED_VIA = (
    rf'{AS}(?:a|an) `(?P<state_type>[\w.]+)` for "(?P<state_id>[^"]*)" '
    rf'gets created via `(?P<method>\w+)`{PROPERTIES}$'
)
GETS = (
    rf'{AS}{STATE} gets (?:a|an) `(?P<method>\w+)`{PROPERTIES}'
    r'(?: spawned with its task id saved as `(?P<task>\w+)`)?$'
)
ATTEMPTS = rf'{AS}{STATE} attempts (?:a|an) `(?P<method>\w+)`{PROPERTIES}$'
TASK_COMPLETES = (
    rf'{AS}the `(?P<method>\w+)` task with id "<(?P<name>\w+)>" '
    r'of the `(?P<state_type>[\w.]+)` completes within (?P<within>.+)$'
)
ATTEMPT_ABORTS_WITH = (
    r'the attempt aborts with `(?P<error_type>\w+)`'
    rf'(?: with (?P<clauses>{ASSERT_CLAUSES}))?$'
)
HAS = rf'{AS}`(?P<method>\w+)` on {STATE} has (?P<clauses>{ASSERT_CLAUSES})$'
EVENTUALLY_HAS = (
    rf'{AS}`(?P<method>\w+)` on {STATE} '
    rf'eventually has (?P<clauses>{ASSERT_CLAUSES}) within (?P<within>.+)$'
)
HAS_SAVED_AS = (
    rf'{AS}`(?P<method>\w+)` on {STATE} has (?P<clauses>{SAVE_CLAUSES})$'
)
ABORTS_WITH = (
    rf'{AS}`(?P<method>\w+)` on {STATE} aborts with `(?P<error_type>\w+)`'
    rf'(?: with (?P<clauses>{ASSERT_CLAUSES}))?$'
)
RESULT_HAS = rf'the result has (?P<clauses>{ASSERT_CLAUSES})$'

# The web app's steps: what a named user does in it and sees in it.
USER = r'"(?P<user>[^"]*)"'
# What an element may be, as a step writes it: each of `Element.Role`
# in lower case, so that the proto is the one list.
ROLES = tuple(
    name.lower()
    for name, number in Element.Role.items()
    if number != Element.Role.ROLE_UNSPECIFIED
)
ELEMENT = rf'the "(?P<name>[^"]*)" (?P<role>{"|".join(ROLES)})'
WEB_APP = 'in the web app'
OPENS_WEB_APP = rf'{USER} opens the web app(?: at "(?P<path>[^"]*)")?$'
CLICKS_IN_WEB_APP = rf'{USER} clicks {ELEMENT} {WEB_APP}$'
FILLS_IN_WEB_APP = (
    rf'{USER} fills "(?P<label>[^"]*)" {WEB_APP} with `(?P<value>[^`]*)`$'
)
SELECTS_IN_WEB_APP = (
    rf'{USER} selects "(?P<option>[^"]*)" in "(?P<label>[^"]*)" {WEB_APP}$'
)
CHECKS_IN_WEB_APP = (
    rf'{USER} (?P<action>checks|unchecks) "(?P<label>[^"]*)" {WEB_APP}$'
)
PRESSES_IN_WEB_APP = rf'{USER} presses "(?P<key>[^"]*)" {WEB_APP}$'
SEES_IN_WEB_APP = (
    rf'{USER} (?:(?P<eventually>eventually )?sees|(?P<negated>does not see)) '
    rf'"(?P<text>[^"]*)"(?: in {ELEMENT})? {WEB_APP}'
    r'(?: within (?P<within>.+))?$'
)
SEES_ENABLED_IN_WEB_APP = (
    rf'{USER} sees {ELEMENT} {WEB_APP} is (?P<state>enabled|disabled)$'
)
SEES_WEB_APP_AT = rf'{USER} sees the web app at "(?P<path>[^"]*)"$'
SAVES_TEXT_IN_WEB_APP_AS = (
    rf'{USER} saves the text of the "(?P<test_id>[^"]*)" element {WEB_APP} '
    r'as `(?P<name>\w+)`$'
)
RESULTING_IS_SAVED_AS = (
    rf'the resulting `(?P<property_name>{PATH})` is saved as `(?P<name>\w+)`$'
)

# The seconds a wait bound says, e.g. '30 seconds'.
_SECONDS = re.compile(r'(?P<seconds>\d+(?:\.\d+)?) seconds?')


def _value(text: str) -> Value:
    return Value(json=text)


def _state(match: re.Match[str]) -> State:
    return State(type=match['state_type'], id=match['state_id'])


def _element(match: re.Match[str]) -> Optional[Element]:
    """The element a step names, `None` when its optional element is
    not written."""
    if match['name'] is None:
        return None
    return Element(
        role=Element.Role.Value(match['role'].upper()),
        name=match['name'],
    )


def _clauses(clauses: Optional[str]) -> list[str]:
    """Each clause of a clause list, as written; none for an absent
    list."""
    if clauses is None:
        return []
    return [clause_match[0] for clause_match in re.finditer(CLAUSE, clauses)]


def _assignments(clauses: Optional[str]) -> list[Assignment]:
    assignments = []
    for clause in _clauses(clauses):
        property_match = PROPERTY_PATTERN.fullmatch(clause)
        assert property_match is not None, clause
        assignments.append(
            Assignment(
                path=property_match['path'],
                value=_value(property_match['value']),
            )
        )
    return assignments


def _assertions(clauses: Optional[str]) -> list[Assertion]:
    assertions = []
    for clause in _clauses(clauses):
        property_match = PROPERTY_PATTERN.fullmatch(clause)
        if property_match is not None:
            assertions.append(
                Assertion(
                    equals=Equals(
                        path=property_match['path'],
                        value=_value(property_match['value']),
                    )
                )
            )
            continue
        containing_match = CONTAINING_PATTERN.fullmatch(clause)
        if containing_match is not None:
            assertions.append(
                Assertion(
                    containing=Containing(
                        path=containing_match['path'],
                        argument=_value(containing_match['argument']),
                    )
                )
            )
            continue
        length_match = LENGTH_PATTERN.fullmatch(clause)
        assert length_match is not None, clause
        assertions.append(
            Assertion(
                of_length=OfLength(
                    path=length_match['path'],
                    length=_value(length_match['length']),
                )
            )
        )
    return assertions


def _saves(clauses: Optional[str]) -> list[Save]:
    saves = []
    for clause in _clauses(clauses):
        save_match = SAVE_PATTERN.fullmatch(clause)
        assert save_match is not None, clause
        saves.append(Save(path=save_match['path'], name=save_match['saved']))
    return saves


def _seconds(within: str) -> Optional[float]:
    """The seconds a wait bound says, and `None` for a bound that is
    not of the form the grammar defines."""
    seconds_match = _SECONDS.fullmatch(within)
    if seconds_match is None:
        return None
    return float(seconds_match['seconds'])


def parse(text: str) -> Optional[BuiltInSyntax]:
    """The syntax tree of the step's text, and `None` for a text the
    grammar does not define, such as a step a project defines
    itself."""
    match = re.match(APPLICATION_IS_UP, text)
    if match is not None:
        application_is_up = ApplicationIsUp()
        if match['name'] is not None:
            application_is_up.name = match['name']
        return BuiltInSyntax(application_is_up=application_is_up)
    match = re.match(IS_AN_AUTHENTICATED_USER, text)
    if match is not None:
        return BuiltInSyntax(
            is_an_authenticated_user=IsAnAuthenticatedUser(
                user_id=match['user_id']
            )
        )
    match = re.match(HAS_BEARER_TOKEN, text)
    if match is not None:
        return BuiltInSyntax(
            has_bearer_token=HasBearerToken(
                user_id=match['user_id'],
                bearer_token=match['bearer_token'],
            )
        )
    match = re.match(SHARED_CONTEXT, text)
    if match is not None:
        return BuiltInSyntax(shared_context=SharedContext(user=match['user']))
    match = re.match(GETS_CREATED_VIA, text)
    if match is not None:
        return BuiltInSyntax(
            gets_created_via=GetsCreatedVia(
                state=_state(match),
                method=match['method'],
                assignments=_assignments(match['clauses']),
                user=match['user'],
            )
        )
    match = re.match(GETS, text)
    if match is not None:
        gets = Gets(
            state=_state(match),
            method=match['method'],
            assignments=_assignments(match['clauses']),
            user=match['user'],
        )
        if match['task'] is not None:
            gets.task_id_saved_as = match['task']
        return BuiltInSyntax(gets=gets)
    match = re.match(ATTEMPTS, text)
    if match is not None:
        return BuiltInSyntax(
            attempts=Attempts(
                state=_state(match),
                method=match['method'],
                assignments=_assignments(match['clauses']),
                user=match['user'],
            )
        )
    match = re.match(TASK_COMPLETES, text)
    if match is not None:
        seconds = _seconds(match['within'])
        if seconds is None:
            return None
        return BuiltInSyntax(
            task_completes=TaskCompletes(
                method=match['method'],
                task_id_saved_as=match['name'],
                state_type=match['state_type'],
                seconds=seconds,
                user=match['user'],
            )
        )
    match = re.match(ATTEMPT_ABORTS_WITH, text)
    if match is not None:
        return BuiltInSyntax(
            attempt_aborts_with=AttemptAbortsWith(
                error_type=match['error_type'],
                assertions=_assertions(match['clauses']),
            )
        )
    match = re.match(HAS, text)
    if match is not None:
        return BuiltInSyntax(
            has=Has(
                method=match['method'],
                state=_state(match),
                assertions=_assertions(match['clauses']),
                user=match['user'],
            )
        )
    match = re.match(EVENTUALLY_HAS, text)
    if match is not None:
        seconds = _seconds(match['within'])
        if seconds is None:
            return None
        return BuiltInSyntax(
            eventually_has=EventuallyHas(
                method=match['method'],
                state=_state(match),
                assertions=_assertions(match['clauses']),
                seconds=seconds,
                user=match['user'],
            )
        )
    match = re.match(HAS_SAVED_AS, text)
    if match is not None:
        return BuiltInSyntax(
            has_saved_as=HasSavedAs(
                method=match['method'],
                state=_state(match),
                saves=_saves(match['clauses']),
                user=match['user'],
            )
        )
    match = re.match(ABORTS_WITH, text)
    if match is not None:
        return BuiltInSyntax(
            aborts_with=AbortsWith(
                method=match['method'],
                state=_state(match),
                error_type=match['error_type'],
                assertions=_assertions(match['clauses']),
                user=match['user'],
            )
        )
    match = re.match(RESULT_HAS, text)
    if match is not None:
        return BuiltInSyntax(
            result_has=ResultHas(assertions=_assertions(match['clauses']))
        )
    match = re.match(OPENS_WEB_APP, text)
    if match is not None:
        return BuiltInSyntax(
            opens_web_app=OpensWebApp(user=match['user'], path=match['path'])
        )
    match = re.match(CLICKS_IN_WEB_APP, text)
    if match is not None:
        return BuiltInSyntax(
            clicks_in_web_app=ClicksInWebApp(
                user=match['user'],
                element=_element(match),
            )
        )
    match = re.match(FILLS_IN_WEB_APP, text)
    if match is not None:
        return BuiltInSyntax(
            fills_in_web_app=FillsInWebApp(
                user=match['user'],
                label=match['label'],
                value=_value(match['value']),
            )
        )
    match = re.match(SELECTS_IN_WEB_APP, text)
    if match is not None:
        return BuiltInSyntax(
            selects_in_web_app=SelectsInWebApp(
                user=match['user'],
                option=match['option'],
                label=match['label'],
            )
        )
    match = re.match(CHECKS_IN_WEB_APP, text)
    if match is not None:
        return BuiltInSyntax(
            checks_in_web_app=ChecksInWebApp(
                user=match['user'],
                label=match['label'],
                checked=match['action'] == 'checks',
            )
        )
    match = re.match(PRESSES_IN_WEB_APP, text)
    if match is not None:
        return BuiltInSyntax(
            presses_in_web_app=PressesInWebApp(
                user=match['user'],
                key=match['key'],
            )
        )
    match = re.match(SEES_IN_WEB_APP, text)
    if match is not None:
        seconds = None
        if match['within'] is not None:
            seconds = _seconds(match['within'])
            if seconds is None:
                return None
        return BuiltInSyntax(
            sees_in_web_app=SeesInWebApp(
                user=match['user'],
                text=match['text'],
                within=_element(match),
                negated=match['negated'] is not None,
                seconds=seconds,
            )
        )
    match = re.match(SEES_ENABLED_IN_WEB_APP, text)
    if match is not None:
        return BuiltInSyntax(
            sees_enabled_in_web_app=SeesEnabledInWebApp(
                user=match['user'],
                element=_element(match),
                enabled=match['state'] == 'enabled',
            )
        )
    match = re.match(SEES_WEB_APP_AT, text)
    if match is not None:
        return BuiltInSyntax(
            sees_web_app_at=SeesWebAppAt(
                user=match['user'],
                path=match['path'],
            )
        )
    match = re.match(SAVES_TEXT_IN_WEB_APP_AS, text)
    if match is not None:
        return BuiltInSyntax(
            saves_text_in_web_app_as=SavesTextInWebAppAs(
                user=match['user'],
                test_id=match['test_id'],
                name=match['name'],
            )
        )
    match = re.match(RESULTING_IS_SAVED_AS, text)
    if match is not None:
        return BuiltInSyntax(
            resulting_is_saved_as=ResultingIsSavedAs(
                save=Save(path=match['property_name'], name=match['name'])
            )
        )
    return None
