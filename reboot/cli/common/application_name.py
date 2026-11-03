"""An application's name under `rbt dev run`, with its variant.

`--application-name` names an application: its state lives at
`.rbt/dev/<name>/`, and under `--portless` it is `https://<name>.localhost`,
its frontend `https://frontend-<name>.localhost` and its dashboard
`https://dashboard-<name>.localhost`. `RBT_APPLICATION_VARIANT` in the
environment appends a variant to that name, `<name>-<variant>`,
everywhere it is used, so that two checkouts, git worktrees or
branches of one application run side by side, or take turns, each
with its own state and its own URLs, while the `.rbtrc`, which is the
same in every checkout and branch, names the application once.

The variant is only ever read from the environment, by `rbt dev run`,
`rbt dev expunge` and `rbt dashboard`, which qualify the application's
name with it, and by the frontend's `npm run dev`, whose `portless`
script appends `${RBT_APPLICATION_VARIANT:+-$RBT_APPLICATION_VARIANT}`
to its name: a flag or a `.rbtrc` line would reach `rbt` but not the
frontend, so there is none, and a worktree's `.envrc` is where the
variant lives.
"""

import os
import re
from reboot.cli.common.rc import BaseTransformer, TransformerError
from reboot.settings import ENVVAR_RBT_APPLICATION_VARIANT

# A variant is part of a hostname label under `--portless`, so it is
# spelled like one: lowercase letters, digits and hyphens, neither
# first nor last a hyphen. A label is at most 63 characters, and the
# longest one made of the name is the dashboard's.
_VARIANT = re.compile(r'^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$')
_LABEL_MAX_LENGTH = 63
_LONGEST_PREFIX = 'dashboard-'


def application_name_with_variant(name: str) -> str:
    """The application's `name` with the environment's variant
    (`RBT_APPLICATION_VARIANT`) appended, `<name>-<variant>`, once the
    variant has been checked; `name` as it is when the environment sets
    no variant (an empty value counts as none). Raises
    `TransformerError`, saying what to change, when the variant is not
    spelled like a hostname label, or when `<name>-<variant>` does not
    fit in one with the longest prefix a name gets."""
    variant = os.environ.get(ENVVAR_RBT_APPLICATION_VARIANT) or None
    if variant is None:
        return name
    if not _VARIANT.match(variant):
        raise TransformerError(
            f'`{ENVVAR_RBT_APPLICATION_VARIANT}={variant}` is not a valid '
            'variant: a variant is part of a hostname under `--portless`, '
            'so it can only have lowercase letters, digits and hyphens, '
            'and can not start or end with a hyphen (e.g., '
            f'`{ENVVAR_RBT_APPLICATION_VARIANT}=fix-269`).'
        )
    longest = f'{_LONGEST_PREFIX}{name}-{variant}'
    if len(longest) > _LABEL_MAX_LENGTH:
        raise TransformerError(
            f'`{ENVVAR_RBT_APPLICATION_VARIANT}={variant}` is too long: '
            f'`{longest}` is {len(longest)} characters, and a hostname '
            f'label can have at most {_LABEL_MAX_LENGTH}; shorten the '
            'variant (or the application name).'
        )
    return f'{name}-{variant}'


class ApplicationNameWithVariant(BaseTransformer):
    """The transformer of `--application-name`: a non-empty name, with
    the environment's variant appended (see
    `application_name_with_variant`), so that the parsed
    `args.application_name` is the name everything downstream uses,
    for the state directory, the portless names and the messages
    alike. An application without a name has nothing to append to,
    and the variant does nothing."""

    def __init__(self, argument: str):
        self._argument = argument

    def transform(self, value: str) -> str:
        if not value.strip():
            raise TransformerError(
                f"The argument '{self._argument}' must be a non-empty string"
            )
        return application_name_with_variant(value)
