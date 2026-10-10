import os
import unittest
from reboot.aio.auth.allowed_origins import (
    is_allowed_origin,
    portless_dev_origins,
)
from reboot.settings import (
    ENVVAR_RBT_DEV,
    ENVVAR_RBT_NAME,
    ENVVAR_RBT_PORTLESS,
)
from unittest.mock import patch


class AllowedOriginsTest(unittest.TestCase):

    def test_portless_origins_are_exact(self) -> None:
        with patch.dict(
            os.environ,
            {
                ENVVAR_RBT_DEV: 'true',
                ENVVAR_RBT_PORTLESS: 'true',
                ENVVAR_RBT_NAME: 'bank',
            },
        ):
            self.assertEqual(
                portless_dev_origins(),
                ['https://bank.localhost', 'https://vite.bank.localhost'],
            )
            for origin in portless_dev_origins():
                self.assertTrue(is_allowed_origin(origin, allowed_origins=[]))
            # A frontend registered under any other name is refused:
            # the two names can't silently drift apart.
            self.assertFalse(
                is_allowed_origin(
                    'https://other.localhost', allowed_origins=[]
                )
            )
            # The plain localhost origins stay trusted under `rbt dev`.
            self.assertTrue(
                is_allowed_origin('http://localhost:5173', allowed_origins=[])
            )

    def test_no_portless_origins_without_the_flag(self) -> None:
        with patch.dict(
            os.environ,
            {
                ENVVAR_RBT_DEV: 'true',
                ENVVAR_RBT_NAME: 'bank'
            },
            clear=False,
        ):
            os.environ.pop(ENVVAR_RBT_PORTLESS, None)
            self.assertEqual(portless_dev_origins(), [])
            self.assertFalse(
                is_allowed_origin(
                    'https://bank.localhost', allowed_origins=[]
                )
            )


if __name__ == '__main__':
    unittest.main()
