import argparse
import sys
import unittest
from tests.reboot.test_helpers import read_lines_from_file


class ProtocGenerationTest(unittest.TestCase):

    def test_equivalence_to_golden_file(self) -> None:
        """ Test that the golden and the generated file are equivalent.
        """
        golden_file_content = read_lines_from_file(args.golden_file)
        generated_file_content = read_lines_from_file(args.generated_file)

        self.assertListEqual(
            golden_file_content, generated_file_content,
            "Goldens did not match; consider running `make goldens` to update "
            "the golden files."
        )


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--golden_file', required=True, type=str)
    parser.add_argument('--generated_file', required=True, type=str)
    parser.add_argument('unittest_args', nargs='*')
    args = parser.parse_args()

    sys.argv[1:] = args.unittest_args
    unittest.main()
