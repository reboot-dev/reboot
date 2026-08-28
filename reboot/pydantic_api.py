"""Reads a pydantic API file's `api = API(...)` into the grammar of
`rbt/v1alpha1/pydantic/api.proto`.

Read off the `API` object, into the closed set of forms a declaration
takes: state types, their methods and UIs, what those take, return
and raise, and the schema of every model mentioned. What `rbt
generate` prints proto from; what the dashboard describes an API
with.
"""
import os
from rbt.v1alpha1.pydantic import api_pb2
from reboot.api import API, UI, MethodModel, Resource, Tool
from reboot.pydantic_schema import Schemas, schema_of
from types import MappingProxyType


def _api_of(api: API, filename: str) -> api_pb2.API:
    """Reads what `api`, as `filename` under an API directory,
    declares: its state types, their methods and UIs, and the schema
    of every model those mention."""
    package_name = os.path.dirname(filename).replace(os.sep, '.')  # noqa: F841

    # Every schema read so far, so that a model several methods share
    # is read once.
    schemas: Schemas = MappingProxyType({})

    raise NotImplementedError("the API")

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

        for method_name, ui_method in ui_methods.items():
            raise NotImplementedError("a UI")

        schema, schemas = schema_of(
            type_obj.state, path=f"api.{type_name}.state", schemas=schemas
        )
        raise NotImplementedError("the state type")

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
                raise NotImplementedError("a UI's request")

        # Generate request/response messages for
        # regular methods.
        for method_name, method_spec in regular_methods.items():
            if method_spec.request is not None:
                schema, schemas = schema_of(
                    method_spec.request,
                    path=f"api.{type_name}.methods.{method_name}.request",
                    schemas=schemas,
                )
                raise NotImplementedError("a method's request")

            if method_spec.response is not None:
                schema, schemas = schema_of(
                    method_spec.response,
                    path=f"api.{type_name}.methods.{method_name}.response",
                    schemas=schemas,
                )
                raise NotImplementedError("a method's response")

        for method_name, method_spec in regular_methods.items():
            if method_spec.errors:
                for error_model in method_spec.errors:
                    error_type_name = error_model.__name__
                    schema, schemas = schema_of(
                        error_model,
                        path=f"api.{type_name}.methods.{method_name}."
                        f"errors.{error_type_name}",
                        schemas=schemas,
                    )
                    raise NotImplementedError("a method's error")

                raise NotImplementedError("a method's errors")

        for method_name, method_spec in regular_methods.items():
            raise NotImplementedError("a method")

            # MCP options for exposing method as tool/resource.
            if method_spec.mcp is not None:
                mcp = method_spec.mcp
                if isinstance(mcp, Tool):
                    raise NotImplementedError("a method's MCP tool")
                elif isinstance(mcp, Resource):
                    raise NotImplementedError("a method's MCP resource")

    raise NotImplementedError("the API's data types and schemas")
