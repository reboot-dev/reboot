import unittest
from google.protobuf.descriptor_pb2 import FileDescriptorSet
from reboot.aio.servicers import Serviceable
from reboot.controller.config_extractor import LocalConfigExtractor
from reboot.naming import ensure_valid_application_id, is_valid_application_id
from tests.reboot.greeter_servicers import MyGreeterServicer


class TestLocalConfigExtractor(unittest.IsolatedAsyncioTestCase):

    def setUp(self) -> None:
        # It is awkward to have to create a full Server object to get the
        # correct servicers instances.
        # TODO: Factor out servicer instance creation into a more stand-alone
        # function.
        self.serviceables: list[Serviceable] = [
            Serviceable.from_servicer_type(MyGreeterServicer)
        ]

        self.local_config_extractor = LocalConfigExtractor(
            application_id=ensure_valid_application_id("arealtestid")
        )

    def test_config_from_serviceables(self):
        application_config = self.local_config_extractor.config_from_serviceables(
            self.serviceables,
            servers=None,
            allowed_origins=None,
        )
        self.assertTrue(
            is_valid_application_id(application_config.application_id())
        )
        self.assertFalse(application_config.spec.HasField('servers'))
        # `allowed_origins=None` means "no opinion", which must remain
        # distinguishable from an explicit (even empty) allow-list.
        self.assertFalse(application_config.spec.HasField('allowed_origins'))

        application_config = self.local_config_extractor.config_from_serviceables(
            self.serviceables,
            servers=2,
            allowed_origins=['https://app.example.com'],
        )
        self.assertEqual(2, application_config.spec.servers)
        self.assertTrue(application_config.spec.HasField('allowed_origins'))
        self.assertEqual(
            ['https://app.example.com'],
            list(application_config.spec.allowed_origins.origins),
        )

        # An explicit empty allow-list stays present-but-empty.
        application_config = self.local_config_extractor.config_from_serviceables(
            self.serviceables,
            servers=None,
            allowed_origins=[],
        )
        self.assertTrue(application_config.spec.HasField('allowed_origins'))
        self.assertEqual(
            [],
            list(application_config.spec.allowed_origins.origins),
        )

        # Tests file_descriptor_set from servicers. This is a quick sanity check
        # that the serialized format of the file_descriptor_set makes some
        # sense. It catches cases like when we accidentally base64-encode the
        # bytes in the `ApplicationConfig`.
        self.assertNotEqual(
            b'', application_config.spec.file_descriptor_set,
            "ApplicationConfig's 'file_descriptor_set' is empty."
        )
        # The following will throw if the format of `file_descriptor_set` is
        # invalid.
        file_descriptor_set = FileDescriptorSet()
        file_descriptor_set.ParseFromString(
            application_config.spec.file_descriptor_set
        )


if __name__ == '__main__':
    unittest.main()

if __name__ == '__main__':
    unittest.main()
