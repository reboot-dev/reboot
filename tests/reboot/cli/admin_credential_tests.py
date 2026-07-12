import argparse
import unittest
from reboot.cli.common.admin_credential import resolve_admin_credential
from reboot.settings import (
    ENVVAR_REBOOT_ADMIN_CREDENTIAL,
    ENVVAR_REBOOT_CLOUD_API_KEY,
)
from unittest import mock

CLOUD_URL = 'https://abc123.prod1.rbt.cloud:9991'
CLOUD_URL_NO_SCHEME = 'abc123.prod1.rbt.cloud:9991'
LOCAL_URL = 'http://localhost:9991'


def _args(application_url, *, admin_credential=None, api_key=None):
    return argparse.Namespace(
        application_url=application_url,
        admin_credential=admin_credential,
        api_key=api_key,
    )


class ResolveAdminCredentialTest(unittest.TestCase):

    def _resolve(self, args, env=None):
        with mock.patch.dict('os.environ', env or {}, clear=True):
            return resolve_admin_credential(args)

    def test_defaults_to_dev(self) -> None:
        self.assertEqual(self._resolve(_args(LOCAL_URL)), 'dev')

    def test_admin_credential_flag(self) -> None:
        self.assertEqual(
            self._resolve(_args(LOCAL_URL, admin_credential='secret')),
            'secret',
        )

    def test_admin_credential_env(self) -> None:
        self.assertEqual(
            self._resolve(
                _args(LOCAL_URL),
                env={ENVVAR_REBOOT_ADMIN_CREDENTIAL: 'env-secret'},
            ),
            'env-secret',
        )

    def test_admin_credential_flag_beats_env(self) -> None:
        self.assertEqual(
            self._resolve(
                _args(LOCAL_URL, admin_credential='flag-secret'),
                env={ENVVAR_REBOOT_ADMIN_CREDENTIAL: 'env-secret'},
            ),
            'flag-secret',
        )

    def test_api_key_flag_on_cloud(self) -> None:
        self.assertEqual(
            self._resolve(_args(CLOUD_URL, api_key='key')),
            'key',
        )

    def test_application_url_requires_scheme(self) -> None:
        with self.assertRaises(SystemExit):
            self._resolve(_args(CLOUD_URL_NO_SCHEME, api_key='key'))

    def test_api_key_env_on_cloud(self) -> None:
        self.assertEqual(
            self._resolve(
                _args(CLOUD_URL),
                env={ENVVAR_REBOOT_CLOUD_API_KEY: 'env-key'},
            ),
            'env-key',
        )

    def test_admin_credential_flag_beats_api_key_env_on_cloud(self) -> None:
        self.assertEqual(
            self._resolve(
                _args(CLOUD_URL, admin_credential='secret'),
                env={ENVVAR_REBOOT_CLOUD_API_KEY: 'env-key'},
            ),
            'secret',
        )

    def test_api_key_env_ignored_on_non_cloud(self) -> None:
        self.assertEqual(
            self._resolve(
                _args(LOCAL_URL),
                env={ENVVAR_REBOOT_CLOUD_API_KEY: 'env-key'},
            ),
            'dev',
        )

    def test_api_key_flag_rejected_on_non_cloud(self) -> None:
        with self.assertRaises(SystemExit):
            self._resolve(_args(LOCAL_URL, api_key='key'))

    def test_flags_are_mutually_exclusive(self) -> None:
        with self.assertRaises(SystemExit):
            self._resolve(
                _args(CLOUD_URL, admin_credential='secret', api_key='key')
            )


if __name__ == '__main__':
    unittest.main()
