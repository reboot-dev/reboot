import reboot.cli.common.cli as cli
import unittest
from rbt.cloud.v1alpha1.application.application_pb2 import (
    AddCustomDomainResponse,
    CustomDomainInfo,
    ListCustomDomainsResponse,
)
from rbt.cloud.v1alpha1.custom_domain.custom_domain_pb2 import CustomDomain
from reboot.cli.commands.cloud.domain import (
    cloud_domain_add,
    cloud_domain_status,
)
from reboot.cli.common.rc import ArgumentParser
from tests.reboot.cli.mock_exit import (
    MockExitException,
    mock_raise_instead_of_exit,
)
from unittest.mock import AsyncMock, MagicMock, patch


@patch('argparse.ArgumentParser.exit', mock_raise_instead_of_exit)
class CloudDomainTestCase(unittest.IsolatedAsyncioTestCase):

    async def test_add_requires_hostname(self) -> None:
        parser: ArgumentParser = cli.create_parser(
            argv=[
                'rbt',
                'cloud',
                'domain',
                'add',
                '--api-key=test-key',
                '--application-name=my-app',
            ]
        )
        with self.assertRaises(MockExitException) as e:
            parser.parse_args()

        self.assertEqual(e.exception.status, 2)
        self.assertIn('hostname', e.exception.message)

    async def test_add_prints_the_cname_record(self) -> None:
        parser: ArgumentParser = cli.create_parser(
            argv=[
                'rbt',
                'cloud',
                'domain',
                'add',
                '--api-key=test-key',
                '--application-name=my-app',
                'api.example.com',
            ]
        )
        args, _ = parser.parse_args()
        self.assertEqual(args.hostname, 'api.example.com')

        mock_add = AsyncMock(
            return_value=AddCustomDomainResponse(
                hostname='api.example.com',
                cname_target='ax9393.prod1.rbt.cloud',
                status=CustomDomain.Status.WAITING_FOR_DNS,
            )
        )
        mock_info = MagicMock()
        # `_parse_common_cloud_args` would hit the Reboot Cloud API to
        # authenticate the API key; stub it out so this unit test can
        # run without a live cloud.
        with (
            patch(
                'reboot.cli.commands.cloud.domain._parse_common_cloud_args',
                new_callable=AsyncMock,
                return_value=(None, 'test/my-app', None),
            ),
            patch(
                'reboot.cli.commands.cloud.domain.Application.ref',
                return_value=MagicMock(add_custom_domain=mock_add),
            ),
            patch('reboot.cli.commands.cloud.domain.terminal.info', mock_info),
        ):
            await cloud_domain_add(args)

        mock_add.assert_awaited_once()
        self.assertEqual(
            mock_add.call_args.kwargs['hostname'], 'api.example.com'
        )
        printed = mock_info.call_args[0][0]
        self.assertIn(
            'api.example.com  CNAME  ax9393.prod1.rbt.cloud', printed
        )

    async def test_status_fails_for_unknown_hostname(self) -> None:
        parser: ArgumentParser = cli.create_parser(
            argv=[
                'rbt',
                'cloud',
                'domain',
                'status',
                '--api-key=test-key',
                '--application-name=my-app',
                'other.example.com',
            ]
        )
        args, _ = parser.parse_args()

        mock_list = AsyncMock(
            return_value=ListCustomDomainsResponse(
                domains=[
                    CustomDomainInfo(
                        hostname='api.example.com',
                        status=CustomDomain.Status.ACTIVE,
                        cname_target='ax9393.prod1.rbt.cloud',
                    )
                ]
            )
        )
        mock_fail = MagicMock()
        mock_fail.side_effect = SystemExit(1)
        with (
            self.assertRaises(SystemExit),
            patch(
                'reboot.cli.commands.cloud.domain._parse_common_cloud_args',
                new_callable=AsyncMock,
                return_value=(None, 'test/my-app', None),
            ),
            patch(
                'reboot.cli.commands.cloud.domain.Application.ref',
                return_value=MagicMock(list_custom_domains=mock_list),
            ),
            patch('reboot.cli.commands.cloud.domain.terminal.fail', mock_fail),
        ):
            await cloud_domain_status(args)

        mock_fail.assert_called_once()
        self.assertIn('other.example.com', mock_fail.call_args[0][0])


if __name__ == '__main__':
    unittest.main()
