import os
import unittest
from reboot.cli.common.application_name import (
    ApplicationNameWithVariant,
    application_name_with_variant,
)
from reboot.cli.common.rc import TransformerError
from reboot.settings import ENVVAR_RBT_APPLICATION_VARIANT
from unittest.mock import patch


class ApplicationNameTest(unittest.TestCase):
    """The environment's `RBT_APPLICATION_VARIANT` is appended to
    `--application-name`, and is spelled like the hostname label it
    becomes part of."""

    def setUp(self) -> None:
        os.environ.pop(ENVVAR_RBT_APPLICATION_VARIANT, None)

    def _with(self, variant: str):
        return patch.dict(
            os.environ, {ENVVAR_RBT_APPLICATION_VARIANT: variant}
        )

    def test_without_a_variant_the_name_is_as_it_is(self) -> None:
        self.assertEqual(application_name_with_variant('bank'), 'bank')
        with self._with(''):  # Empty counts as none.
            self.assertEqual(application_name_with_variant('bank'), 'bank')

    def test_the_variant_is_appended(self) -> None:
        for variant in ['fix-269', 'a', '2026']:
            with self._with(variant):
                self.assertEqual(
                    application_name_with_variant('bank'), f'bank-{variant}'
                )

    def test_anything_else_fails_saying_why(self) -> None:
        for variant in [
            'Fix-269',  # Uppercase.
            'fix_269',  # Underscore.
            '-fix',  # Leading hyphen.
            'fix-',  # Trailing hyphen.
            'fix.269',  # A dot would be another label.
            'fix 269',
        ]:
            with self._with(variant):
                with self.assertRaises(
                    TransformerError, msg=variant
                ) as raised:
                    application_name_with_variant('bank')
            self.assertIn('lowercase letters', raised.exception.message)

    def test_a_name_that_no_longer_fits_a_label_fails(self) -> None:
        # `dashboard-` + name + `-` + variant must fit in 63.
        fits = 'x' * (63 - len('dashboard-bank-'))
        with self._with(fits):
            self.assertEqual(
                application_name_with_variant('bank'), f'bank-{fits}'
            )
        with self._with(fits + 'x'):
            with self.assertRaises(TransformerError) as raised:
                application_name_with_variant('bank')
        self.assertIn('too long', raised.exception.message)

    def test_the_transformer_wants_a_name_and_appends_the_variant(
        self
    ) -> None:
        """What the parser applies to `--application-name`."""
        transformer = ApplicationNameWithVariant('--application-name')
        self.assertEqual(transformer.transform('bank'), 'bank')
        with self.assertRaises(TransformerError):
            transformer.transform('  ')
        with self._with('fix-269'):
            self.assertEqual(transformer.transform('bank'), 'bank-fix-269')


if __name__ == '__main__':
    unittest.main()
