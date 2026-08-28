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
from rbt.v1alpha1.pydantic.schema_pb2 import Reference
from reboot.api import API, UI, MethodModel, Resource, Tool
from reboot.pydantic_schema import Schemas, reference_name, schema_of
from reboot.settings import AUTO_CONSTRUCT_STATE_TYPE
from types import MappingProxyType


def _api_of(api: API, filename: str) -> api_pb2.API:
    """Reads what `api`, as `filename` under an API directory,
    declares: its state types, their methods and UIs, and the schema
    of every model those mention."""
    package = os.path.dirname(filename).replace(os.sep, '.')  # noqa: F841
    module = filename.rsplit('.py', 1)[0].replace(os.sep, '.')  # noqa: F841

    # Every schema read so far, so that a model several methods share
    # is read once.
    schemas: Schemas = MappingProxyType({})

    state_types: list[api_pb2.StateType] = []

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

        uis: list[api_pb2.UI] = []
        for method_name, ui_method in ui_methods.items():
            uis.append(
                api_pb2.UI(
                    name=method_name,
                    path=ui_method.path,
                    request=(
                        Reference(name=reference_name(ui_method.request))
                        if ui_method.request is not None else None
                    ),
                    title=ui_method.title,
                    description=ui_method.description,
                    artifact_path=ui_method.artifact_path,
                )
            )

        # The state model's schema goes in `schemas`, the state type
        # referring to it by name.
        _, schemas = schema_of(
            type_obj.state, path=f"api.{type_name}.state", schemas=schemas
        )
        state_type = api_pb2.StateType(
            name=type_name,
            reference=Reference(name=reference_name(type_obj.state)),
            description=type_obj.description,
            auto_construct=type_name == AUTO_CONSTRUCT_STATE_TYPE,
            uis=uis,
        )
        state_types.append(state_type)

        # Generate request messages for UI methods that
        # have a request type. UI methods with
        # `request=None` have no input parameters.
        for method_name, ui_method in ui_methods.items():
            if ui_method.request is not None:
                # The UI's request model's schema goes in `schemas`,
                # the UI referring to it by name.
                _, schemas = schema_of(
                    ui_method.request,
                    path=f"api.{type_name}.methods.{method_name}.request",
                    schemas=schemas,
                )

        # Generate request/response messages for
        # regular methods.
        for method_name, method_spec in regular_methods.items():
            if method_spec.request is not None:
                # The request model's schema goes in `schemas`, the
                # method referring to it by name.
                _, schemas = schema_of(
                    method_spec.request,
                    path=f"api.{type_name}.methods.{method_name}.request",
                    schemas=schemas,
                )

            if method_spec.response is not None:
                # The response model's schema goes in `schemas`, the
                # method referring to it by name.
                _, schemas = schema_of(
                    method_spec.response,
                    path=f"api.{type_name}.methods.{method_name}.response",
                    schemas=schemas,
                )

        for method_name, method_spec in regular_methods.items():
            if method_spec.errors:
                for error_model in method_spec.errors:
                    error_type_name = error_model.__name__
                    # The error model's schema goes in `schemas`, the
                    # method referring to it by name.
                    _, schemas = schema_of(
                        error_model,
                        path=f"api.{type_name}.methods.{method_name}."
                        f"errors.{error_type_name}",
                        schemas=schemas,
                    )

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
