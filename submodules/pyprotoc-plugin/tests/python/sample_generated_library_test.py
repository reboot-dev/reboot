import unittest
from tests.python import sample_messages_pb2
from tests.python.sample_service_sample_generated_out import (
    SampleServiceCustomClient,
)


class TestSampleGeneratedLibrary(unittest.TestCase):
    """Tests the sample python client we generated for a proto service."""

    def test_generated_client(self):
        client = SampleServiceCustomClient()
        # We can call a generated (no-op) method.
        client.CallSampleMethod(sample_messages_pb2.SampleInput())


if __name__ == '__main__':
    unittest.main()
