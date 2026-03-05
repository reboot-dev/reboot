#!/usr/bin/env python3
"""A sample plugin to demonstrate the use of pyprotoc-plugin."""
import os
from google.protobuf.descriptor_pb2 import FileDescriptorProto
from pyprotoc_plugin.helpers import add_template_path, load_template
from pyprotoc_plugin.plugins import ProtocPlugin


class SampleProtocPlugin(ProtocPlugin):
    """A sample plugin that generates clients for every input service."""

    def __init__(self):
        self._files_to_generate = []
        self._message_imports = {}

    def process_file(self, proto_file: FileDescriptorProto):
        # Examine the proto file to find services and messages.
        proto_data = {
            'proto_name':
                proto_file.name,
            'proto_package':
                os.path.dirname(proto_file.name).replace('/', '.'),
            'proto_module':
                os.path.basename(proto_file.name).replace('.proto', '_pb2'),
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

        # Map messages to files.
        for message in proto_file.message_type:
            self._message_imports[message.name] = (
                f'from {proto_data["proto_package"]}.{proto_data["proto_module"]} import {message.name}'
            )

    def finalize(self) -> None:
        # Generate service clients.
        for template_data in self._files_to_generate:
            output_file_name = template_data['proto_name'].replace(
                '.proto', '_sample_generated_out.py'
            )
            template_data['message_imports'] = '\n'.join(
                self._message_imports.values()
            )

            template = load_template('sample_template.j2')
            content = template.render(**template_data)
            self.response.file.add(name=output_file_name, content=content)

        super().finalize()


if __name__ == '__main__':
    add_template_path(os.path.dirname(__file__))
    SampleProtocPlugin.execute()
