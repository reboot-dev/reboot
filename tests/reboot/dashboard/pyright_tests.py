import unittest
from pathlib import Path
from reboot.dashboard.backend.pyright import filename_from_uri


class FilenameFromUriTest(unittest.TestCase):

    def test_round_trips_what_as_uri_encodes(self) -> None:
        # Pyright answers with the file's percent-encoded URI, the
        # spelling `Path.as_uri()` sends it, so a space, a `#`, a `%`
        # and a non-ASCII character all have to come back as the
        # characters they were (#275).
        for filename in [
            Path('/Users/me/project foo/backend/api/foo/v1/foo_rbt.py'),
            Path('/Users/me/project#1/backend/api/foo/v1/foo_rbt.py'),
            Path('/Users/me/100%/backend/api/foo/v1/foo_rbt.py'),
            Path('/Users/me/projekt-ö/backend/api/foo/v1/foo_rbt.py'),
            Path('/Users/me/project-foo/backend/api/foo/v1/foo_rbt.py'),
        ]:
            self.assertEqual(filename_from_uri(filename.as_uri()), filename)


if __name__ == '__main__':
    unittest.main(verbosity=2)
