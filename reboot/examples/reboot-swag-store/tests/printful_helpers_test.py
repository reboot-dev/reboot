"""Pure-function unit tests for the Printful client
helpers. No Reboot runtime or network required."""

import unittest
from printful import _extract_size_color


class TestExtractSizeColor(unittest.TestCase):

    def test_prefers_structured_fields(self) -> None:
        sv = {
            "name": "Ignore / Me / Completely",
            "product": {
                "size": "M",
                "color": "Navy"
            },
        }
        self.assertEqual(_extract_size_color(sv), ("M", "Navy"))

    def test_name_three_parts_color_then_size(self) -> None:
        sv = {
            "name": "Unisex Staple T-Shirt / Black / L",
            "product": {},
        }
        self.assertEqual(_extract_size_color(sv), ("L", "Black"))

    def test_name_two_parts_size_only(self) -> None:
        sv = {
            "name": "Unisex Staple T-Shirt / XL",
            "product": {},
        }
        self.assertEqual(_extract_size_color(sv), ("XL", ""))

    def test_name_two_parts_color_only(self) -> None:
        sv = {
            "name": "Mug / Grey Melange",
            "product": {},
        }
        self.assertEqual(
            _extract_size_color(sv),
            ("", "Grey Melange"),
        )

    def test_name_two_parts_one_size_treated_as_size(self) -> None:
        sv = {
            "name": "Bucket Hat / One Size",
            "product": {},
        }
        self.assertEqual(_extract_size_color(sv), ("One Size", ""))

    def test_empty_when_unparseable(self) -> None:
        sv = {"name": "Single Thing", "product": {}}
        self.assertEqual(_extract_size_color(sv), ("", ""))

    def test_missing_product_field(self) -> None:
        sv = {"name": "Tee / Red / M"}
        self.assertEqual(_extract_size_color(sv), ("M", "Red"))


if __name__ == "__main__":
    unittest.main()
