"""Reads a pydantic API file's `api = API(...)` into the grammar of
`rbt/v1alpha1/pydantic/api.proto`.

Read off the `API` object, into the closed set of forms a declaration
takes: state types, their methods and UIs, what those take, return
and raise, and the schema of every model mentioned. What `rbt
generate` prints proto from; what the dashboard describes an API
with.
"""
import os
from reboot.api import (
    API,
    UI,
    MethodModel,
    Resource,
    Tool,
    to_pascal_case,
    to_snake_case,
)
from reboot.pydantic_schema import Schemas, schema_of
from reboot.pydantic_schema_to_proto import (
    _PER_USER_ID,
    _escape_string_for_proto,
    _ProtoText,
    generate,
)
from reboot.settings import AUTO_CONSTRUCT_STATE_TYPE
from types import MappingProxyType


async def _api_of(api: API, filename: str) -> str:
    """Returns the proto that `api`, as `filename` under an API
    directory declares it, generates to: what `protoc` is handed."""
    package_name = os.path.dirname(filename).replace(os.sep, '.')

    generated_errors_names = set()

    # Every schema read so far, so that a model several methods share
    # is read once.
    schemas: Schemas = MappingProxyType({})

    proto = _ProtoText()

    await proto.write('syntax = "proto3";\n')
    await proto.write(f'package {package_name};\n')
    await proto.write('import "google/protobuf/empty.proto";\n')
    await proto.write('import "google/protobuf/struct.proto";\n')
    await proto.write('import "rbt/v1alpha1/options.proto";\n')
    await proto.write('import "rbt/v1alpha1/tasks.proto";\n')
    await proto.write(
        f"option (rbt.v1alpha1.file).pydantic = "
        f"\"{filename.rsplit('.py', 1)[0].replace(os.sep, '.')}\";\n"
    )

    await proto.write('\n')

    for type_name, type_obj in api.get_types().items():
        # Separate UI methods from regular methods.
        regular_methods = {
            n: m
            for n, m in type_obj.methods.items()
            if isinstance(m, MethodModel)
        }
        ui_methods = {
            n: m for n, m in type_obj.methods.items() if isinstance(m, UI)
        }

        # Build UIs list from UI methods.
        uis = []
        for method_name, ui_method in ui_methods.items():
            uis.append(
                {
                    'name':
                        method_name,
                    'title':
                        # The title can contain `\` character, so we
                        # need to escape it for proto string literal.
                        _escape_string_for_proto(ui_method.title)
                        if ui_method.title is not None else
                        method_name.replace('_', ' ').title(),
                    'description':
                        # The description can contain `\` character,
                        # so we need to escape it for proto string
                        # literal.
                        _escape_string_for_proto(
                            ui_method.description
                        ) if ui_method.description is not None else None,
                    'path':
                        ui_method.path,
                    'request_message':
                        ui_method.request.__name__
                        if ui_method.request is not None else None,
                    'artifact_path':
                        ui_method.artifact_path,
                }
            )

        schema, schemas = schema_of(
            type_obj.state, path=f"api.{type_name}.state", schemas=schemas
        )
        await generate(
            proto,
            schema,
            name=type_name,
            schemas=schemas,
            state=True,
            uis=uis if uis else None,
            auto_construct=_PER_USER_ID
            if type_name == AUTO_CONSTRUCT_STATE_TYPE else None,
            description=type_obj.description,
        )
        await proto.write('\n')

        # Generate request messages for UI methods that
        # have a request type. UI methods with
        # `request=None` have no input parameters.
        for method_name, ui_method in ui_methods.items():
            if ui_method.request is not None:
                schema, schemas = schema_of(
                    ui_method.request,
                    path=f"api.{type_name}.methods.{method_name}.request",
                    schemas=schemas,
                )
                await generate(
                    proto,
                    schema,
                    name=ui_method.request.__name__,
                    schemas=schemas,
                    add_type_string_annotation_to_proto=True,
                )
                await proto.write('\n')

        # Generate request/response messages for
        # regular methods.
        for method_name, method_spec in regular_methods.items():
            if method_spec.request is not None:
                request_type_name = f"{type_name}{to_pascal_case(method_name)}Request"

                schema, schemas = schema_of(
                    method_spec.request,
                    path=f"api.{type_name}.methods.{method_name}.request",
                    schemas=schemas,
                )
                await generate(
                    proto,
                    schema,
                    name=request_type_name,
                    schemas=schemas,
                    add_type_string_annotation_to_proto=True,
                )
                await proto.write('\n')

            if method_spec.response is not None:
                response_type_name = f"{type_name}{to_pascal_case(method_name)}Response"

                schema, schemas = schema_of(
                    method_spec.response,
                    path=f"api.{type_name}.methods.{method_name}.response",
                    schemas=schemas,
                )
                await generate(
                    proto,
                    schema,
                    name=response_type_name,
                    schemas=schemas,
                )
                await proto.write('\n')

        for method_name, method_spec in regular_methods.items():
            if method_spec.errors:
                for error_model in method_spec.errors:
                    error_type_name = error_model.__name__
                    if error_type_name in generated_errors_names:
                        continue
                    generated_errors_names.add(error_type_name)
                    schema, schemas = schema_of(
                        error_model,
                        path=f"api.{type_name}.methods.{method_name}."
                        f"errors.{error_type_name}",
                        schemas=schemas,
                    )
                    await generate(
                        proto,
                        schema,
                        name=error_type_name,
                        schemas=schemas,
                    )
                    await proto.write('\n')

                # Match the Zod errors definition by creating a
                # top-level message for the method which has declared errors.
                # That message will have a 'oneof' field with all possible
                # error types.
                await proto.write('\n')
                await proto.write(
                    f'message {type_name}{to_pascal_case(method_name)}Errors {{ oneof type {{\n'
                )

                error_tag = 1
                for error_model in method_spec.errors:
                    error_type_name = error_model.__name__
                    await proto.write(
                        f'  {error_type_name} {to_snake_case(error_type_name)} = {error_tag} '
                        f' [ (rbt.v1alpha1.field).pydantic_type = "{error_model.__module__}.{error_type_name}"];\n'
                    )
                    error_tag += 1
                await proto.write('}}\n\n')

        # Generate RPC service block (regular methods
        # only — UI methods have no RPC).
        await proto.write(f"service {type_name}Methods {{\n")

        for method_name, method_spec in regular_methods.items():
            if method_spec.request is None:
                request_type_name = "google.protobuf.Empty"
            else:
                request_type_name = f"{type_name}{to_pascal_case(method_name)}Request"

            if method_spec.response is None:
                response_type_name = "google.protobuf.Empty"
            else:
                response_type_name = f"{type_name}{to_pascal_case(method_name)}Response"

            await proto.write(
                f"  rpc {to_pascal_case(method_name)}({request_type_name})\n"
            )
            await proto.write(f"      returns ({response_type_name}) {{\n")
            await proto.write("    option (rbt.v1alpha1.method) = {\n")
            await proto.write(f"      {method_spec.kind.value}: {{\n")

            if method_spec.factory:
                await proto.write("        constructor: {},\n")

            await proto.write("      },\n")

            if method_spec.errors:
                await proto.write(
                    f"      errors: [\"{type_name}{to_pascal_case(method_name)}Errors\"],\n"
                )

            # What the author said the method does, written
            # whether or not the method is exposed to MCP.
            if method_spec.description is not None:
                # The description can contain `\` character, so we
                # need to escape it for proto string literal.
                await proto.write(
                    "      description: "
                    f'"{_escape_string_for_proto(method_spec.description)}",\n'
                )

            # MCP options for exposing method as tool/resource.
            if method_spec.mcp is not None:
                mcp = method_spec.mcp
                mcp_fields = []
                if isinstance(mcp, Tool):
                    mcp_fields.append("tool: true")
                elif isinstance(mcp, Resource):
                    mcp_fields.append("resource: true")
                if mcp.name is not None:
                    # The name can contain `\` character, so we need
                    # to escape it for proto string literal.
                    mcp_fields.append(
                        f'name: "{_escape_string_for_proto(mcp.name)}"'
                    )
                if mcp.title is not None:
                    # The title can contain `\` character, so we need
                    # to escape it for proto string literal.
                    mcp_fields.append(
                        f'title: "{_escape_string_for_proto(mcp.title)}"'
                    )
                if mcp_fields:
                    await proto.write(
                        f"      mcp: {{ {', '.join(mcp_fields)} }},\n"
                    )

            await proto.write("    };\n")
            await proto.write("  }\n")

        await proto.write("}\n\n")

    return ''.join(proto.parts)
