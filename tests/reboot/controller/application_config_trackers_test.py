import unittest
import unittest.mock
from rbt.v1alpha1 import application_config_pb2
from reboot.aio.types import ApplicationId
from reboot.controller.application_config import (
    ApplicationConfig,
    LocalApplicationConfig,
)
from reboot.controller.application_config_trackers import (
    LocalApplicationConfigTracker,
)


class TestLocalApplicationConfigTracker(unittest.IsolatedAsyncioTestCase):

    def setUp(self) -> None:
        self.application_config = LocalApplicationConfig(
            application_id=ApplicationId('some_application_id'),
            spec=application_config_pb2.ApplicationConfig.Spec(
                file_descriptor_set='file_descriptor_set'.encode(),
                container_image_name='container_image_name',
            ),
        )
        self.application_config_tracker = LocalApplicationConfigTracker()

    async def test_on_configs_change(self):
        """Test that the ApplicationConfigTracker calls the provided callback when
        the set of configs change.
        """
        config_tracker = self.application_config_tracker
        callback = unittest.mock.AsyncMock()
        config_tracker.on_configs_change(callback)
        await self.application_config_tracker.add_config(
            self.application_config
        )
        callback.assert_called_once()
        await self.application_config_tracker.delete_config(
            self.application_config
        )
        self.assertEqual(callback.call_count, 2)

    async def test_get_configs(self):
        """Test that the fetched list of configs reflects the expected state
        after adds/deletes."""
        config_tracker = self.application_config_tracker
        await self.application_config_tracker.add_config(
            self.application_config
        )
        self.assertCountEqual(
            await config_tracker.get_application_configs(), {
                self.application_config.application_id():
                    self.application_config
            }
        )
        second_config = LocalApplicationConfig(
            application_id=ApplicationId('some_application_id_2'),
            spec=ApplicationConfig.Spec(
                file_descriptor_set='file_descriptor_set_2'.encode(),
                container_image_name='container_image_name_2',
            ),
        )
        await self.application_config_tracker.add_config(second_config)
        self.assertCountEqual(
            await config_tracker.get_application_configs(), {
                self.application_config.application_id():
                    self.application_config,
                second_config.application_id():
                    second_config
            }
        )
        await self.application_config_tracker.delete_config(
            self.application_config
        )
        self.assertCountEqual(
            await config_tracker.get_application_configs(),
            {second_config.application_id(): second_config}
        )


if __name__ == '__main__':
    unittest.main()
