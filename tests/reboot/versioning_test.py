import unittest
from reboot.versioning import version_less_than


class VersionLessThanTest(unittest.TestCase):

    def test_simple_less_than(self):
        self.assertTrue(version_less_than('0.1.0', '0.2.0'))
        self.assertTrue(version_less_than('0.38.0', '0.39.0'))

    def test_simple_not_less_than(self):
        self.assertFalse(version_less_than('0.2.0', '0.1.0'))
        self.assertFalse(version_less_than('0.39.0', '0.38.0'))

    def test_equal_versions(self):
        self.assertFalse(version_less_than('0.39.0', '0.39.0'))
        self.assertFalse(version_less_than('1.0.0', '1.0.0'))

    def test_major_version_comparison(self):
        self.assertTrue(version_less_than('0.99.99', '1.0.0'))
        self.assertFalse(version_less_than('1.0.0', '0.99.99'))

    def test_minor_version_comparison(self):
        self.assertTrue(version_less_than('1.0.0', '1.1.0'))
        self.assertFalse(version_less_than('1.1.0', '1.0.0'))

    def test_patch_version_comparison(self):
        self.assertTrue(version_less_than('1.0.0', '1.0.1'))
        self.assertFalse(version_less_than('1.0.1', '1.0.0'))

    def test_double_digit_components(self):
        # This is the case that was buggy with string comparison.
        self.assertFalse(version_less_than('0.100.0', '0.39.0'))
        self.assertTrue(version_less_than('0.39.0', '0.100.0'))

    def test_triple_digit_components(self):
        self.assertFalse(version_less_than('0.100.100', '0.99.99'))
        self.assertTrue(version_less_than('0.99.99', '0.100.100'))

    def test_invalid_version_wrong_parts(self):
        with self.assertRaises(ValueError) as error:
            version_less_than('0.1', '0.2.0')
        self.assertIn("must have exactly 3 parts", str(error.exception))
        self.assertIn("0.1", str(error.exception))

    def test_invalid_version_too_many_parts(self):
        with self.assertRaises(ValueError) as error:
            version_less_than('0.1.0.0', '0.2.0')
        self.assertIn("must have exactly 3 parts", str(error.exception))

    def test_invalid_version_second_arg(self):
        with self.assertRaises(ValueError) as error:
            version_less_than('0.1.0', '0.2')
        self.assertIn("must have exactly 3 parts", str(error.exception))
        self.assertIn("0.2", str(error.exception))

    def test_invalid_version_non_integer_component(self):
        with self.assertRaises(ValueError):
            version_less_than('0.1.abc', '0.2.0')

    def test_empty_version_a_is_lowest(self):
        # Empty version_a is treated as lowest possible version.
        self.assertTrue(version_less_than('', '0.0.0'))
        self.assertTrue(version_less_than('', '0.39.0'))
        self.assertTrue(version_less_than('', '1.0.0'))

    def test_empty_version_a_with_empty_version_b(self):
        # Empty compared to empty is not less than.
        self.assertFalse(version_less_than('', ''))


if __name__ == '__main__':
    unittest.main()
