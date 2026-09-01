"""Reads a pydantic API file's `api = API(...)` into the grammar of
`rbt/v1alpha1/api/api.proto`.

Read off the `API` object, into the closed set of forms a declaration
takes: state types, their methods and UIs, what those take, return
and raise, and the schema of every model mentioned. What `rbt
generate` prints proto from; what the dashboard describes an API
with.
"""
import hashlib
import os
from rbt.v1alpha1.api import api_pb2
from rbt.v1alpha1.api.schema_pb2 import Reference
from reboot.api import API, UI, MethodKind, MethodModel, Resource, Tool
from reboot.pydantic_schema import Schemas, reference_name, schema_of
from reboot.settings import AUTO_CONSTRUCT_STATE_TYPE
from types import MappingProxyType


def api_of(api: API, *, filename: str) -> api_pb2.API:
    """Returns what `api`, as `filename` under an API directory,
    declares: its state types in declaration order, each with its
    state model, methods and UIs; the data types those mention; and
    the schema of every model, by reference name. `filename` names
    the file in a failure and decides the package and module."""
    package = os.path.dirname(filename).replace(os.sep, '.')
    module = filename.rsplit('.py', 1)[0].replace(os.sep, '.')

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

        for method_name, method_spec in regular_methods.items():
            method = api_pb2.Method(
                name=method_name,
                factory=method_spec.factory,
                request=(
                    Reference(name=reference_name(method_spec.request))
                    if method_spec.request is not None else None
                ),
                response=(
                    Reference(name=reference_name(method_spec.response))
                    if method_spec.response is not None else None
                ),
                errors=[
                    Reference(name=reference_name(error))
                    for error in method_spec.errors
                ],
                description=method_spec.description,
            )
            # A kind's message declares nothing yet; setting it is what
            # selects the arm.
            match method_spec.kind:
                case MethodKind.READER:
                    method.reader.CopyFrom(api_pb2.Reader())
                case MethodKind.WRITER:
                    method.writer.CopyFrom(api_pb2.Writer())
                case MethodKind.TRANSACTION:
                    method.transaction.CopyFrom(api_pb2.Transaction())
                case MethodKind.WORKFLOW:
                    method.workflow.CopyFrom(api_pb2.Workflow())

            # MCP options for exposing method as tool/resource.
            if method_spec.mcp is not None:
                mcp = method_spec.mcp
                if isinstance(mcp, Tool):
                    method.mcp.tool.CopyFrom(
                        api_pb2.Tool(name=mcp.name, title=mcp.title)
                    )
                elif isinstance(mcp, Resource):
                    method.mcp.resource.CopyFrom(
                        api_pb2.Resource(name=mcp.name, title=mcp.title)
                    )

            # Appended once whole: the container keeps a copy, so a
            # message appended earlier would not see its MCP set.
            state_type.methods.append(method)

    # Every model that is not a state model is a data type, in the
    # order the schemas were filed.
    state_models = {state_type.reference.name for state_type in state_types}
    data_types = [
        Reference(name=name) for name in schemas if name not in state_models
    ]

    return api_pb2.API(
        filename=filename,
        package=package,
        module=module,
        state_types=state_types,
        data_types=data_types,
        schemas=dict(schemas),
    )


def api_digest(api: api_pb2.API) -> str:
    """Returns the hex SHA-256 of what an API file declares, serialized
    deterministically, which is what says whether generated code came
    from the file as it is: `rbt generate` records it in what it
    writes, and the dashboard compares."""
    return hashlib.sha256(api.SerializeToString(deterministic=True)
                         ).hexdigest()
