#!/usr/bin/env python3
"""A sample plugin to demonstrate the use of pyprotoc-plugin."""
import os
from google.protobuf.descriptor_pb2 import FileDescriptorProto
from pyprotoc_plugin.helpers import add_template_path, load_template
from pyprotoc_plugin.plugins import ProtocPlugin


class SampleCppProtocPlugin(ProtocPlugin):
    """A sample plugin that generates clients for every input service."""

    def __init__(self):
        self._files_to_generate = []

    def process_file(self, proto_file: FileDescriptorProto):
        # Examine the proto file to find services and messages.
        proto_data = {
            'proto_name':
                proto_file.name,
            'services':
                [
                    {
                        'name':
                            service.name,
                        'methods':
                            [
                                {
                                    'name':
                                        method.name,
                                    'input_type':
                                        method.input_type.removeprefix('.'),
                                    'output_type':
                                        method.output_type.removeprefix('.'),
                                } for method in service.method
                            ],
                    } for service in proto_file.service
                ]
        }

        # We'll produce clients for any files containing services.
        if proto_data['services']:
            self._files_to_generate.append(proto_data)

    def finalize(self) -> None:
        # Generate service clients.
        for template_data in self._files_to_generate:
            output_file_dir = template_data['proto_name'].replace(
                '.proto', '_generated'
            ).split('/')[-1]

            template = load_template('cpp_template.j2')
            content = template.render(
                include_path=template_data['proto_name'].replace(
                    '.proto', '.pb.h'
                ), **template_data
            )

            # Equals to 'proto_file_name_generated.h'
            output_file_name = output_file_dir + '.h'
            # Equals to 'proto_file_name_generated/proto_file_generated.h'
            output_file_path = output_file_dir + '/' + output_file_name

            self.response.file.add(name=output_file_path, content=content)

        super().finalize()


if __name__ == '__main__':
    add_template_path(os.path.dirname(__file__))
    SampleCppProtocPlugin.execute()
