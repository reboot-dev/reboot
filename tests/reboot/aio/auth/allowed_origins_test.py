import os
import unittest
from reboot.aio.auth.allowed_origins import (
    frontend_dev_origin,
    is_allowed_origin,
)
from reboot.settings import ENVVAR_RBT_DEV, ENVVAR_RBT_FRONTEND_URL
from unittest.mock import patch


class AllowedOriginsTest(unittest.TestCase):

    def test_the_frontend_dev_server_origin_is_the_frontend_urls(self) -> None:
        """Exactly the dev server `rbt dev run` routes to."""
        with patch.dict(
            os.environ,
            {
                ENVVAR_RBT_DEV: 'true',
                ENVVAR_RBT_FRONTEND_URL: 'https://frontend-bank.localhost',
            },
        ):
            self.assertEqual(
                frontend_dev_origin(), 'https://frontend-bank.localhost'
            )

    def test_no_frontend_dev_server_origin_without_a_frontend_url(
        self
    ) -> None:
        with patch.dict(os.environ, {ENVVAR_RBT_DEV: 'true'}):
            os.environ.pop(ENVVAR_RBT_FRONTEND_URL, None)
            self.assertIsNone(frontend_dev_origin())

    def test_no_frontend_dev_server_origin_outside_rbt_dev(self) -> None:
        with patch.dict(
            os.environ,
            {ENVVAR_RBT_FRONTEND_URL: 'https://frontend-bank.localhost'},
        ):
            os.environ.pop(ENVVAR_RBT_DEV, None)
            self.assertIsNone(frontend_dev_origin())

    def test_named_origins_are_trusted_only_when_listed(self) -> None:
        """No `.localhost` name is trusted by pattern: the application's
        own comes from the request, the frontend's from the list."""
        with patch.dict(os.environ, {ENVVAR_RBT_DEV: 'true'}):
            self.assertFalse(
                is_allowed_origin(
                    'https://frontend-bank.localhost', allowed_origins=[]
                )
            )
            self.assertTrue(
                is_allowed_origin(
                    'https://frontend-bank.localhost',
                    allowed_origins=['https://frontend-bank.localhost'],
                )
            )
            self.assertTrue(
                is_allowed_origin(
                    'https://bank.localhost',
                    allowed_origins=[],
                    own_origin='https://bank.localhost',
                )
            )
            # The plain localhost origins stay trusted under `rbt dev`.
            self.assertTrue(
                is_allowed_origin('http://localhost:5173', allowed_origins=[])
            )


if __name__ == '__main__':
    unittest.main()
