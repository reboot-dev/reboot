"""
Produces a file (at the given `outfile` location) that contains YAML that will
configure a "standalone" (= not running on Kubernetes/Istio) Envoy to serve a
simple webserver with our routing filter in front. The routing filter will have
a few basic entries suitable for testing.
"""
import argparse
import os
import reboot.templates.tools as template_tools
from rbt.v1alpha1.database_pb2 import ShardInfo
from reboot.aio.types import ApplicationId, ServiceName
from reboot.controller.servers import ServerSpec
from reboot.routing.filters.routing_filter_generator import (
    generate_lua_routing_filter,
)
from tests.reboot.settings import REBOOT_VERSION_BEFORE_SHARDED_DATABASE


def generate_standalone_envoy_routing_filter() -> str:
    """
    Renders the `standalone_envoy_config.yaml.j2` template, generating the
    YAML this file promises to produce (see file docstring).
    """
    template_path = os.path.join(
        os.path.dirname(__file__), 'standalone_envoy_config.yaml.j2'
    )

    # The `standalone_envoy_config.yaml.j2` template wants to be fed the
    # generated Lua code line-by-line so it can produce correct indentation.
    # More details on that in the template itself.
    filter_code_lines = generate_lua_routing_filter(
        [
            ServerSpec(
                id='server_1234',
                replica_index=0,
                shards=[ShardInfo(shard_id="shard1", shard_first_key=b"")],
                application_id=ApplicationId('application1'),
                service_names=[ServiceName('tests.reboot.Greeter')],
                reboot_version=REBOOT_VERSION_BEFORE_SHARDED_DATABASE,
            ),
            ServerSpec(
                id='server_2345',
                replica_index=0,
                shards=[ShardInfo(shard_id="shard2", shard_first_key=b"8")],
                application_id=ApplicationId('application2'),
                service_names=[
                    ServiceName('tests.reboot.Greeter'),
                    ServiceName('foo.AnotherService')
                ],
                reboot_version=REBOOT_VERSION_BEFORE_SHARDED_DATABASE,
            ),
        ]
    ).splitlines()

    template_input = {
        'filter_code_lines': filter_code_lines,
    }
    return template_tools.render_template_path(template_path, template_input)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('outfile')
    args = parser.parse_args()

    filename = args.outfile
    with open(filename, 'w') as f:
        f.write(generate_standalone_envoy_routing_filter())

    print(f'Wrote standalone Envoy configuration filter to {filename}')


if __name__ == '__main__':
    main()
