#!/usr/bin/env python3

import aiofiles
import importlib
import os
import pydantic_core
import types
from importlib import import_module
from pydantic.fields import FieldInfo
from reboot.api import (
    API,
    COLLECTION_TYPE,
    PRIMITIVE_TYPE,
    MethodModel,
    Model,
    UserPydanticError,
    get_field_tag,
    snake_to_camel,
)
from reboot.fail import fail
from typing import (
    Any,
    Literal,
    Optional,
    Type,
    Union,
    cast,
    get_args,
    get_origin,
)


def collect_all_error_models(
    pydantic_files: list[str],
) -> set[tuple[str, str]]:
    """
    Pre-scan all pydantic files to collect error model identifiers.

    Returns a set of `(module_path, model_name)` tuples for all error
    models used in any API's method errors.
    """
    error_models: set[tuple[str, str]] = set()

    for file_path in pydantic_files:
        module_path = file_path.rsplit('.py', 1)[0].replace(os.sep, '.')
        module = import_module(module_path)

        api = getattr(module, 'api', None)
        if api is None:
            # If no API is defined, skip this file.
            continue

        for type_obj in api.get_types().values():
            for method_spec in type_obj.methods.values():
                if not isinstance(method_spec, MethodModel):
                    continue
                for error_model in method_spec.errors:
                    error_models.add(
                        (error_model.__module__, error_model.__name__)
                    )

    return error_models


def _module_to_ts_import_alias(module_path: str) -> str:
    """
    Convert a module path to a valid TypeScript import alias.

    Example:
        "shared_module.shared" -> "shared_module_shared_rbt_types"
    """
    return module_path.replace('.', '_') + '_rbt_types'


def _compute_relative_import_path(
    from_module: str,
    to_module: str,
    js_extension: bool,
) -> str:
    """
    Compute the relative import path from one module to another.

    Example:
        from_module = "api.servicer_api"
        to_module = "api.shared_module.shared"
        returns: "./shared_module/shared_rbt_types"
    """
    # Convert module paths to file paths.
    from_path = from_module.replace('.', os.sep)
    to_path = to_module.replace('.', os.sep)

    from_dir = os.path.dirname(from_path)
    relative_path = os.path.relpath(to_path, from_dir)

    # Add "./" prefix if the path doesn't start with "../", so that
    # it's a valid TypeScript relative import.
    if not relative_path.startswith('../'):
        relative_path = './' + relative_path

    extension = ".js" if js_extension else ""
    return f"{relative_path}_rbt_types{extension}"


def _collect_external_references(
    field_type: Any | None,
    current_module: str,
    external_imports: dict[str, set[str]],
    visited: set[type],
) -> None:
    """
    Recursively collect all external `Model` references from a type.

    Args:
        field_type: The type annotation to analyze.
        current_module: The module being processed.
        external_imports: Dict mapping module path to set of `Model` names.
        visited: Set of already visited types to avoid infinite recursion.
    """
    if field_type is None:
        return

    origin = get_origin(field_type)
    args = get_args(field_type)

    if origin is Union or origin is types.UnionType:
        for arg in args:
            if arg is not type(None):
                _collect_external_references(
                    arg,
                    current_module,
                    external_imports,
                    visited,
                )
    elif origin is list:
        assert len(args) == 1
        _collect_external_references(
            args[0],
            current_module,
            external_imports,
            visited,
        )
    elif origin is dict:
        assert len(args) == 2
        _collect_external_references(
            args[1],
            current_module,
            external_imports,
            visited,
        )
    elif isinstance(field_type, type) and issubclass(field_type, Model):
        model_type = cast(Type[Model], field_type)

        if model_type in visited:
            return
        visited.add(model_type)

        model_module = model_type.__module__
        if model_module != current_module:
            # Track for imports but don't recurse for external models.
            if model_module not in external_imports:
                external_imports[model_module] = set()
            external_imports[model_module].add(model_type.__name__)
        else:
            # Recurse into local model fields.
            for field_info in model_type.model_fields.values():
                _collect_external_references(
                    field_info.annotation,
                    current_module,
                    external_imports,
                    visited,
                )


def _collect_models_in_module(
    module: types.ModuleType,
    module_path: str,
) -> list[Type[Model]]:
    """
    Collect all `Model` subclasses defined in the given module.
    """
    models: list[Type[Model]] = []
    for _, obj in module.__dict__.items():
        if (
            isinstance(obj, type) and issubclass(obj, Model) and
            obj is not Model and obj.__module__ == module_path
        ):
            models.append(obj)
    return models


def pydantic_to_zod(
    input: (
        Type[Model] | type[str] | type[int] | type[float] | type[bool] |
        PRIMITIVE_TYPE | COLLECTION_TYPE | None
    ),
    path: str,
    external_refs: dict[str, str],
    tag: Optional[int] = None,
    method_request: bool = False,
    field_info: Optional[FieldInfo] = None,
    is_error: bool = False,
) -> str:
    if input is None:
        if method_request:
            # For method requests, we use an empty object schema for now.
            return 'z.object({})'
        # Currently only used for methods with no response.
        return 'z.void()'

    origin = get_origin(input)
    args = get_args(input)

    if origin is Union or origin is types.UnionType:
        non_none_args = [arg for arg in args if arg is not type(None)]

        # Check if this is a discriminated union.
        discriminator = None
        if field_info is not None:
            discriminator = getattr(field_info, 'discriminator', None)

        if discriminator is not None:
            # This is a discriminated union.
            # Generate `z.discriminatedUnion('discriminator', [option1, option2, ...])`.
            camel_discriminator = snake_to_camel(discriminator)
            option_schemas = []
            for option_type in non_none_args:
                assert isinstance(option_type,
                                  type) and issubclass(option_type, Model)
                option_zod = pydantic_to_zod(
                    option_type,
                    f"{path}.{{{discriminator}}}",
                    external_refs=external_refs,
                )
                option_schemas.append(option_zod)

            options_str = ',\n    '.join(option_schemas)
            output = (
                f"z.discriminatedUnion('{camel_discriminator}', "
                f"[\n    {options_str},\n  ])"
            )

            if type(None) in args:
                # This is an `Optional` discriminated union.
                output += '.optional()'

            if tag is not None:
                output += f'.meta({{ tag: {tag} }})'
            return output
        else:
            # If `discriminated_union_info` is `None`, that means that
            # the corresponding `FieldInfo` does not have a `discriminator`
            # and we can treat this as an `Optional[T]`.
            assert len(non_none_args) == 1

            # Generate the inner type without the tag, then add
            # `.optional()` and finally `.meta()`. This ensures meta is
            # on the outermost schema, which is required by `protoToZod`
            # and `zodToProtoJson` converters.
            inner = pydantic_to_zod(
                non_none_args[0],
                path,
                tag=None,
                external_refs=external_refs,
            )
            output = inner + '.optional()'
            if tag is not None:
                output += f'.meta({{ tag: {tag} }})'
            return output

    if isinstance(input, type) and issubclass(input, Model):
        # Check if this is an external model that should be referenced.
        model_name = input.__name__
        if model_name in external_refs:
            import_alias = external_refs[model_name]
            output = f'{import_alias}.{model_name}Schema'
            if tag is not None:
                output += f'.meta({{ tag: {tag} }})'
            return output

        # Help 'mypy' narrow the type.
        input_model: Type[Model] = input
        input_fields = input_model.model_fields
        if not input_fields:
            output = 'z.object({})'
        else:
            output_fields = []

            if is_error:
                # For error types, we need to add a literal field to
                # distinguish between different error types.
                output_fields.append(f'type: z.literal("{input.__name__}")')
            for field_name, field_info in input_fields.items():
                output_field_name = snake_to_camel(field_name)
                field_type = field_info.annotation
                field_tag = get_field_tag(field_info)

                assert field_tag is not None

                zod_object_field = pydantic_to_zod(
                    field_type,
                    f"{path}.{field_name}",
                    field_info=field_info,
                    external_refs=external_refs,
                )

                if field_info.default_factory is not None:
                    field_origin = get_origin(field_type)
                    if field_origin is list:
                        zod_object_field += '.default(reboot_api.EMPTY_ARRAY)'
                    else:
                        assert field_origin is dict
                        zod_object_field += '.default(reboot_api.EMPTY_RECORD)'

                # Now check for other primitive types.
                if field_info.default is not pydantic_core.PydanticUndefined:
                    if field_type is str:
                        zod_object_field += '.default("")'
                    elif field_type is bool:
                        zod_object_field += '.default(false)'
                    elif field_type is int or field_type is float:
                        zod_object_field += '.default(0)'
                    else:
                        field_origin = get_origin(field_type)
                        if field_origin is Literal:
                            # For Literal types, the default is the first
                            # literal value.
                            first_literal = get_args(field_type)[0]
                            zod_object_field += f'.default("{first_literal}")'
                        else:
                            assert (
                                field_origin is Union or
                                field_origin is types.UnionType
                            )
                            zod_object_field += '.default(undefined)'

                # Add the `tag` metadata after setting defaults, since
                # the converters expect it on the outermost schema.
                zod_object_field += f'.meta({{ tag: {field_tag} }})'
                output_fields.append(
                    f'{output_field_name}: {zod_object_field}'
                )

            output = 'z.object({\n    ' + ',\n    '.join(
                output_fields
            ) + ',\n  })'

        # The 'tag' might be missing if it is a nested type inside a
        # collection.
        if tag is not None:
            output += f'.meta({{ tag: {tag} }})'
        return output
    elif origin is dict:
        assert len(args) == 2
        key_type = args[0]
        value_type = args[1]

        assert key_type == str

        zod_value = pydantic_to_zod(
            value_type,
            f"{path}.[value]",
            external_refs=external_refs,
        )
        output = f'z.record(z.string(), {zod_value})'

        # The 'tag' might be missing if it is a nested type inside a
        # collection.
        if tag is not None:
            output += f'.meta({{ tag: {tag} }})'
        return output
    elif origin is list:
        assert len(args) == 1
        item_type = args[0]

        zod_item = pydantic_to_zod(
            item_type,
            f"{path}.[item]",
            external_refs=external_refs,
        )

        output = f'z.array({zod_item})'
        # The 'tag' might be missing if it is a nested type inside a
        # collection.
        if tag is not None:
            output += f'.meta({{ tag: {tag} }})'

        return output
    elif origin is Literal:
        for literal_value in args:
            if not isinstance(literal_value, str):
                fail(
                    f"Unexpected literal `{literal_value}` at `{path}`; "
                    f"only string literals are currently supported"
                )

        literal_values = ', '.join(f'"{v}"' for v in args)
        output = f'z.literal([{literal_values}])'

        # The 'tag' might be missing if it is a nested type inside a
        # collection.
        if tag is not None:
            output += f'.meta({{ tag: {tag} }})'

        return output
    else:
        if input is str:
            output = 'z.string()'
        elif input is int:
            output = 'z.number()'
        elif input is float:
            output = 'z.number()'
        elif input is bool:
            output = 'z.boolean()'
        else:
            fail(f"Unsupported type {input} at {path}")

        # The 'tag' might be missing if it is a nested type inside a
        # collection.
        if tag is not None:
            output += f'.meta({{ tag: {tag} }})'

        return output


async def generate_zod_file_from_api(
    filename: str,
    output_directory: str,
    js_extension: bool,
    global_error_models: set[tuple[str, str]],
) -> str:
    """
    Generate a Zod types file from a Pydantic API definition file.

    This function handles both:
    - Files with an `api` object (generates API structure + all local
      `Model`s)
    - Files without an `api` object (generates just the local `Model`s)

    In both cases, external `Model` references are properly imported and
    referenced.
    """
    # In the 'rbt generate' we add every directory which contains schema
    # files to the 'sys.path', so we can directly import the file as a
    # module now.
    module_path = filename.rsplit('.py', 1)[0].replace(os.sep, '.')
    try:
        module = importlib.import_module(module_path)
    except ImportError as e:
        fail(f"Failed to import module {module_path}: {e}")
    except UserPydanticError as e:
        fail(str(e))

    models_in_module = _collect_models_in_module(module, module_path)

    api: Optional[API] = getattr(module, 'api', None)

    # If no `Model`s and no API, nothing to generate.
    if len(models_in_module) == 0 and api is None:
        fail(
            f"File '{filename}' does not define an `api` schema "
            "or any Reboot `Model`."
        )

    external_imports: dict[str, set[str]] = {}
    visited: set[type] = set()
    for model_type in models_in_module:
        _collect_external_references(
            model_type,
            module_path,
            external_imports,
            visited,
        )

    # Also collect from API types (`state`, `request`, `response`,
    # `errors`) in case they reference external models not used in local
    # `Model` definitions.
    if api is not None:
        for type_obj in api.get_types().values():
            _collect_external_references(
                type_obj.state,
                module_path,
                external_imports,
                visited,
            )
            for method_spec in type_obj.methods.values():
                if not isinstance(method_spec, MethodModel):
                    continue
                if method_spec.request is not None:
                    _collect_external_references(
                        method_spec.request,
                        module_path,
                        external_imports,
                        visited,
                    )
                if method_spec.response is not None:
                    _collect_external_references(
                        method_spec.response,
                        module_path,
                        external_imports,
                        visited,
                    )
                for error_model in method_spec.errors:
                    _collect_external_references(
                        error_model,
                        module_path,
                        external_imports,
                        visited,
                    )

    # Build the `external_refs` dict for `Model` name -> import alias.
    external_refs: dict[str, str] = {}
    for external_module, model_names in external_imports.items():
        import_alias = _module_to_ts_import_alias(external_module)
        for model_name in model_names:
            external_refs[model_name] = import_alias

    zod_file_name = filename.replace('.py', '_rbt_types.ts')
    zod_file_path = os.path.join(output_directory, zod_file_name)
    os.makedirs(os.path.dirname(zod_file_path), exist_ok=True)

    async with aiofiles.open(zod_file_path, 'w') as zod:
        await zod.write('import { z } from "zod/v4";\n')
        # Import Reboot API even if no `api` is defined, since the
        # default converters use `reboot_api.EMPTY_ARRAY` and
        # `reboot_api.EMPTY_RECORD`.
        await zod.write(
            'import * as reboot_api from "@reboot-dev/reboot-api";\n'
        )

        # Write imports for external models first.
        for external_module in sorted(external_imports.keys()):
            relative_path = _compute_relative_import_path(
                module_path, external_module, js_extension
            )
            import_alias = _module_to_ts_import_alias(external_module)
            await zod.write(
                f'import * as {import_alias} from "{relative_path}";\n'
            )

        await zod.write('\n')

        # Track which `Model`s we've already generated to avoid duplicates.
        generated_models: set[str] = set()

        # Generate schemas for all local `Model`s.
        for model_type in models_in_module:
            model_name = model_type.__name__
            if model_name in generated_models:
                continue
            generated_models.add(model_name)

            # Check if this model is used as an error (needs `type`
            # discriminator field). Check both global pre-scan and current
            # file's API.
            is_error = (module_path, model_name) in global_error_models

            await zod.write(f'export const {model_name}Schema = ')
            model_zod = pydantic_to_zod(
                model_type,
                f"{model_name}",
                external_refs=external_refs,
                is_error=is_error,
            )
            await zod.write(f'{model_zod};\n\n')
            await zod.write(
                f'export type {model_name} = '
                f'z.infer<typeof {model_name}Schema>;\n\n'
            )

        if api is not None:
            await _generate_api_schemas(
                zod,
                api,
                external_refs,
                generated_models,
                module_path,
            )

    return zod_file_name


async def _generate_api_schemas(
    zod: aiofiles.threadpool.text.AsyncTextIOWrapper,
    api: API,
    external_refs: dict[str, str],
    generated_models: set[str],
    module_path: str,
) -> None:
    """
    Generate API-specific schema.

    Only generates schemas for types that weren't already generated as
    local `Model`s. For none responses, use `z.void()` inline instead of
    creating a standalone type.
    """

    def get_schema_ref(model: type) -> str:
        model_name = model.__name__
        if model.__module__ != module_path and model_name in external_refs:
            return f'{external_refs[model_name]}.{model_name}Schema'
        return f'{model_name}Schema'

    def get_request_ref(
        type_name: str, method_name: str, request: type | None
    ) -> str:
        if request is None:
            camel_method_name = snake_to_camel(method_name)
            upper_camel = camel_method_name[0].upper() + camel_method_name[1:]
            return f'{type_name}{upper_camel}RequestSchema'
        return get_schema_ref(request)

    def get_response_ref(response: type | None) -> str:
        if response is None:
            return 'z.void()'
        return get_schema_ref(response)

    # Generate request schema for `None`, other `Model`s are already
    # generated above. Response `None` types are inlined as `z.void()`.
    for type_name, type_obj in api.get_types().items():
        for method_name, method_spec in type_obj.methods.items():
            if not isinstance(method_spec, MethodModel):
                continue
            if method_spec.request is None:
                # Generate a named schema for empty request object.
                camel_method_name = snake_to_camel(method_name)
                upper_camel = camel_method_name[0].upper(
                ) + camel_method_name[1:]

                request_name = f'{type_name}{upper_camel}Request'

                if request_name not in generated_models:
                    generated_models.add(request_name)
                    await zod.write(
                        f'export const {request_name}Schema = z.object({{}});\n\n'
                    )
                    await zod.write(
                        f'export type {request_name} = '
                        f'z.infer<typeof {request_name}Schema>;\n\n'
                    )

    # Generate the API structure with types inlined to avoid name
    # collisions.
    await zod.write('export const api = {\n')

    for type_name, type_obj in api.get_types().items():
        state_schema_ref = get_schema_ref(type_obj.state)

        await zod.write(f'  {type_name}: {{\n')
        await zod.write(f'    state: {state_schema_ref},\n')
        await zod.write('    methods: {\n')

        for method_name, method_spec in type_obj.methods.items():
            if not isinstance(method_spec, MethodModel):
                continue
            camel_method_name = snake_to_camel(method_name)
            method_kind = method_spec.kind.value

            request_schema_ref = get_request_ref(
                type_name,
                method_name,
                method_spec.request,
            )
            response_schema_ref = get_response_ref(method_spec.response)

            await zod.write(
                f'      {camel_method_name}: reboot_api.{method_kind}({{\n'
            )

            if method_spec.factory:
                assert method_kind in ['writer', 'transaction']
                await zod.write('        factory: {},\n')

            await zod.write(f'        request: {request_schema_ref},\n')
            await zod.write(f'        response: {response_schema_ref},\n')

            if method_spec.errors:
                await zod.write('        errors: [\n')
                error_tag = 1
                for error_model in method_spec.errors:
                    error_schema_ref = get_schema_ref(error_model)
                    await zod.write(
                        f'          {error_schema_ref}'
                        f'.meta({{ tag: {error_tag} }}),\n'
                    )
                    error_tag += 1
                await zod.write('        ] as const\n')

            await zod.write('      }),\n')

        await zod.write('    },\n')
        await zod.write('  },\n')

    await zod.write('};\n')
