"""
Generates a set of golden `envoy.yaml` files, that:
1. Are sorted by key, for easy comparison with future generated files.
2. Cover different configuration scenarios.
"""
import asyncio
import os
import sys
import yaml
from google.protobuf.descriptor_pb2 import FileDescriptorSet
from pathlib import Path
from reboot.aio.types import ApplicationId
from reboot.helpers import add_file_descriptor_to_file_descriptor_set
from reboot.server.local_envoy import LocalEnvoy
from tests.reboot import greeter_pb2


async def _write_sorted_yaml(yaml_content: str, path: str):
    # Sort the generated YAML by key, making it possible to compare with future
    # generated files that happen to be generated in a different order (which
    # Envoy doesn't care about).
    data = yaml.safe_load(yaml_content)
    sorted_content = yaml.dump(data, sort_keys=True)
    # Tell Prettier to not care about the format of this file.
    sorted_content = "# prettier-ignore\n" + sorted_content
    with open(path, "w") as f:
        f.write(sorted_content)


class NoopLocalEnvoy(LocalEnvoy):

    def _start(self):
        pass

    def _stop(self):
        pass

    def _register_xds_port(self):
        # Pretend that we've picked a port for xDS, instead of actually doing
        # so.
        self._xds_port = 1337

    @property
    def public_port(self) -> int:
        return 0

    @property
    def trusted_port(self) -> int:
        return 0


async def main(path: str):
    file_descriptor_set = FileDescriptorSet()
    add_file_descriptor_to_file_descriptor_set(
        return_set=file_descriptor_set,
        file_descriptor=greeter_pb2.DESCRIPTOR,
        # The routable service names only get used to add gRPC/JSON transcoding
        # annotations, which we don't need for this test.
        routable_service_names=None,
    )

    yaml_content = NoopLocalEnvoy(
        admin_listen_host="127.0.0.1",
        admin_port=9901,
        xds_listen_host="127.0.0.1",
        xds_connect_host="my.hostname",
        trusted_host="127.0.0.1",
        trusted_port=9992,
        public_port=9991,
        application_id=ApplicationId("testing"),
        file_descriptor_set=file_descriptor_set,
        use_tls=True,
        observed_dir=Path(os.path.join("my", "envoy", "dir")),
    )._generate_envoy_yaml()

    await _write_sorted_yaml(yaml_content, path)


if __name__ == "__main__":
    output_path = sys.argv[1]
    asyncio.run(main(output_path))
