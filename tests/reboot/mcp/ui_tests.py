"""A UI's cache-bust token follows the page a host is given, which
embeds the URL the application was reached at; and that URL is what a
proxy in front of the application says it is."""
import tempfile
import unittest
from pathlib import Path
from reboot.mcp.context import reboot_url_from_request
from reboot.mcp.ui import compute_ui_cache_bust
from starlette.requests import Request


def _request(headers: dict[str, str]) -> Request:
    return Request(
        {
            'type':
                'http',
            'method':
                'POST',
            'scheme':
                'http',
            'path':
                '/mcp/',
            'query_string':
                b'',
            'headers':
                [
                    (name.lower().encode(), value.encode())
                    for name, value in headers.items()
                ],
        }
    )


class CacheBustTest(unittest.TestCase):

    def test_token_changes_with_the_url(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'ui').mkdir()
            (root / 'ui' /
             'index.html').write_text('<html><head></head></html>')

            def token(url: str | None) -> str:
                return compute_ui_cache_bust(
                    root, 'ui', 'show', artifact_path='ui', reboot_url=url
                )

            self.assertEqual(token(None), token(None))
            self.assertEqual(
                token('https://a.example'), token('https://a.example')
            )
            self.assertNotEqual(
                token('https://a.example'), token('https://b.example')
            )
            self.assertNotEqual(token('https://a.example'), token(None))
            self.assertEqual(len(token('https://a.example')), 12)


class RebootUrlTest(unittest.TestCase):

    def test_host_header(self) -> None:
        self.assertEqual(
            reboot_url_from_request(_request({'Host': 'localhost:9991'})),
            'http://localhost:9991',
        )

    def test_forwarded_headers_win(self) -> None:
        self.assertEqual(
            reboot_url_from_request(
                _request(
                    {
                        'Host': '127.0.0.1:9991',
                        'X-Forwarded-Host': 'app.example',
                        'X-Forwarded-Proto': 'https',
                    }
                )
            ),
            'https://app.example',
        )

    def test_no_request_or_host(self) -> None:
        with self.assertRaises(RuntimeError):
            reboot_url_from_request(None)
        with self.assertRaises(RuntimeError):
            reboot_url_from_request(_request({}))


if __name__ == '__main__':
    unittest.main()
