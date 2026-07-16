from reboot.api import API, Type
from tests.reboot.documentation.errors_pydantic import (
    AccountMethods,
    AccountState,
)

api = API(
    Account=Type(
        state=AccountState,
        methods=AccountMethods,
    ),
)
