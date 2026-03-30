#!/usr/bin/env tsx

import {
  ALLOWED_DEFAULT_BY_CONSTRUCTOR_NAME,
  toCamelCase,
  toPascalCase,
  toSnakeCase,
  typeSchema,
  ZOD_ERROR_NAMES,
} from "@reboot-dev/reboot-api";
import { strict as assert } from "assert";
import chalk from "chalk";
import { mkdtemp } from "fs/promises";
import * as fs from "node:fs";
import * as os from "os";
import * as path from "path";
import { z } from "zod/v4";

// Expected usage: zod-to-proto filesDirectory path/relative/to/filesDirectory/to/file.ts ...
const args = process.argv.slice(2);

const filesDirectory = args[0];
const files = args.slice(1);

// TODO:
//
// z.date (use well-known proto)
// z.enum (only support number enums)
// "recursive types"
// z.map (use protobuf map and only allow the mapped types that protobuf supports)
// z.set (use protobuf repeated but the fact that we must take a `Set` will ensure it's a set, and we could add annotations to do proto validations for other languages)
// z.tuple
//
// UNREPRESENTABLE:
//
// z.union is unlikely because if it is not "flattened" we won't know
// which fields to set when there are multiple possible "correct" fields
//
// z.intersection (suggest destructuring as that's what Zod suggests)

const Z_JSON_GETTER_TO_STRING = (
  z.json() as z.ZodType as z.ZodLazy
)._zod.def.getter.toString();

const iszjson = (schema: z.ZodType) => {
  return (
    schema instanceof z.ZodLazy &&
    schema._zod.def.getter?.toString() === Z_JSON_GETTER_TO_STRING
  );
};

const generate = (
  proto,
  {
    schema,
    path,
    name,
    state = false,
  }: {
    schema: z.ZodType;
    path: string;
    name?: string;
    state?: boolean;
  }
) => {
  if (schema instanceof z.ZodObject) {
    assert(name !== undefined);

    proto.write(`message ${name} {`);

    if (state) {
      proto.write(`option (rbt.v1alpha1.state) = {};`);
    }

    const tags = new Map<number, string>();

    const shape = schema._zod.def.shape;

    for (const key in shape) {
      // TODO: ensure `key` is PascalCase.
      let value = shape[key];

      if (value === undefined || value._zod.def === undefined) {
        // TODO: is this expected or possible or should we raise here
        // instead?
        continue;
      }

      const meta = value.meta();

      if (meta === undefined || !("tag" in meta)) {
        console.error(
          chalk.stderr.bold.red(
            `Missing tag for property '${key}'; all properties of your object schemas must be tagged for backwards compatibility`
          )
        );
        process.exit(-1);
      }

      const { tag } = meta;

      if (tags.has(tag)) {
        // TODO: give "path" to this property.
        console.error(
          chalk.stderr.bold.red(
            `Trying to use tag '${tag}' with property '${key}' already used by '${tags.get(
              tag
            )}'`
          )
        );
        process.exit(-1);
      }

      tags.set(tag, key);

      const field = toSnakeCase(key);

      // A field is "required" means that validation will fail if the
      // field is not provided, i.e., it does not have a `default` value
      // and is not `optional`. If a field was `optional` the default
      // value `undefined` is applied.
      const isRequired =
        !(value instanceof z.ZodOptional) && !(value instanceof z.ZodDefault);

      if (value instanceof z.ZodPipe) {
        value = value.in;
      } else if (value instanceof z.ZodOptional) {
        value = value._zod.def.innerType;
      } else if (value instanceof z.ZodDefault) {
        const firstDefaultValue = value._zod.def.defaultValue;
        const secondDefaultValue = value._zod.def.defaultValue;

        switch (typeof firstDefaultValue) {
          case "object":
            if (firstDefaultValue === secondDefaultValue) {
              console.error(
                chalk.stderr.bold.red(
                  `'${path}.${key}' has a default value of type ` +
                    `${
                      Array.isArray(firstDefaultValue) ? "array" : "object"
                    } which ` +
                    `is dangerous and not supported, please use a ` +
                    `primitive type (e.g., string, number, boolean) ` +
                    `which is immutable or pass a function that creates ` +
                    `a new ${
                      Array.isArray(firstDefaultValue) ? "array" : "object"
                    } ` +
                    `each time (for example \`reboot_api.EMPTY_ARRAY\` or ` +
                    `\`reboot_api.EMPTY_RECORD\`).`
                )
              );
              process.exit(-1);
            }
            // Otherwise, if objects are different, that means that
            // the default value is a function that returns a new
            // object each time, which is fine.
            break;

          default:
            break;
        }

        value = value._zod.def.innerType;
      }

      const requiredString = ` [(rbt.v1alpha1.field).required = ${
        isRequired ? "true" : "false"
      }];`;

      if (value._zod.def.type === "string") {
        proto.write(`optional string ${field} = ${tag}` + requiredString);
      } else if (value._zod.def.type === "number") {
        proto.write(`optional double ${field} = ${tag}` + requiredString);
      } else if (value._zod.def.type === "bigint") {
        proto.write(`optional int64 ${field} = ${tag}` + requiredString);
      } else if (value._zod.def.type === "boolean") {
        proto.write(`optional bool ${field} = ${tag}` + requiredString);
      } else if (value._zod.def.type === "literal") {
        // Make the name of this nested type be the PascalCase property
        // TODO: ensure `key` is already camelCase.
        const typeName = key.charAt(0).toUpperCase() + key.slice(1);

        proto.write(`enum ${typeName} {`);

        let i = 0;

        for (const literal of value._zod.def.values) {
          if (typeof literal !== "string") {
            console.error(
              chalk.stderr.bold.red(
                `Unexpected literal '${literal}' for property '${key}'; only 'string' literals are currently supported`
              )
            );
            process.exit(-1);
          }

          // According to Protobuf `enum` rules:
          // `enum` values use C++ scoping rules, meaning that
          // `enum` values are siblings of their type, not
          // children of it.
          // That means we need to prefix the `enum` values
          // with the `enum` type name to avoid name conflicts.
          // It is safe here, since we preserve the original
          // order of the literals and during the conversion
          // from Pydantic model to Protobuf and back we
          // operate with the indexes of the literals, not
          // their names.
          proto.write(`${typeName}_${literal} = ${i++};`);
        }

        proto.write(`}`);

        proto.write(`optional ${typeName} ${field} = ${tag}` + requiredString);
      } else if (value._zod.def.type === "array") {
        // Make the name of this nested type be the PascalCase property
        // TODO: ensure `key` is already camelCase.
        const typeName = key.charAt(0).toUpperCase() + key.slice(1) + "Array";

        proto.write(`message ${typeName} {`);

        generate(proto, { schema: value, path: `${path}.${key}` });

        proto.write(`}`);

        proto.write(`optional ${typeName} ${field} = ${tag}` + requiredString);
      } else if (value._zod.def.type === "record") {
        // Make the name of this nested type be the PascalCase property
        // TODO: ensure `key` is already camelCase.
        const typeName = key.charAt(0).toUpperCase() + key.slice(1) + "Record";

        proto.write(`message ${typeName} {`);

        generate(proto, { schema: value, path: `${path}.${key}` });

        proto.write(`}`);

        proto.write(`optional ${typeName} ${field} = ${tag}` + requiredString);
      } else if (value instanceof z.ZodDiscriminatedUnion) {
        // `instanceof` b.c. type = "union".
        // Make the name of this nested type be the PascalCase property
        // TODO: ensure `key` is already camelCase.
        const typeName = key.charAt(0).toUpperCase() + key.slice(1);

        generate(proto, {
          schema: value,
          path: `${path}.${key}`,
          name: typeName,
        });

        proto.write(`optional ${typeName} ${field} = ${tag}` + requiredString);
      } else if (value._zod.def.type === "object") {
        // Make the name of this nested type be the PascalCase property.
        const typeName = key.charAt(0).toUpperCase() + key.slice(1);

        generate(proto, {
          schema: value,
          path: `${path}.${key}`,
          name: typeName,
        });

        proto.write(`optional ${typeName} ${field} = ${tag}` + requiredString);
      } else if (value._zod.def.type === "custom" && "protobuf" in meta) {
        const typeName = meta.protobuf;
        proto.write(`optional ${typeName} ${field} = ${tag}` + requiredString);
      } else if (iszjson(value as z.ZodType)) {
        proto.write(
          `optional google.protobuf.Value ${field} = ${tag}` + requiredString
        );
      } else {
        console.error(
          chalk.stderr.bold.red(
            `'${path}.${key}' has type '${value._zod.def.type}' which is not (yet) supported, please reach out to the maintainers!`
          )
        );
        process.exit(-1);
      }
    }

    proto.write(`}\n`);
  } else if (schema instanceof z.ZodRecord) {
    const keyType = schema.keyType;

    // To account for all possible "string" types in Zod, e.g.,
    // `z.uuid()`, `z.email()`, etc, we can't use `instanceof`.
    if (keyType._zod.def.type !== "string") {
      console.error(
        chalk.stderr.bold.red(
          `Unexpected record key type '${keyType._zod.def.type}' at '${path}'; only 'string' key types are currently supported for records`
        )
      );
      process.exit(-1);
    }

    const valueType = schema.valueType;

    if (valueType instanceof z.ZodOptional) {
      console.error(
        chalk.stderr.bold.red(
          `Record at '${path}' has _optional_ value type which is not supported`
        )
      );
      process.exit(-1);
    } else if (valueType instanceof z.ZodDefault) {
      console.error(
        chalk.stderr.bold.red(
          `Record at '${path}' has _default_ value type which is not supported`
        )
      );
      process.exit(-1);
    }

    const typeName = (() => {
      // To account for all possible "string" types in Zod, e.g.,
      // `z.uuid()`, `z.email()`, etc, we can't use `instanceof`.
      if (valueType._zod.def.type === "string") {
        return "string";
      } else if (valueType instanceof z.ZodNumber) {
        return "double";
      } else if (valueType instanceof z.ZodBigInt) {
        return "int64";
      } else if (valueType instanceof z.ZodBoolean) {
        return "bool";
      } else if (valueType instanceof z.ZodObject) {
        return "Value";
      } else if (valueType instanceof z.ZodRecord) {
        return "Value";
      } else if (valueType instanceof z.ZodArray) {
        return "Value";
      } else if (valueType instanceof z.ZodDiscriminatedUnion) {
        return "Value";
      } else if (valueType instanceof z.ZodCustom) {
        const meta = valueType.meta();
        if (valueType instanceof z.ZodCustom && "protobuf" in meta) {
          return meta.protobuf as string;
        }
      } else if (iszjson(valueType as z.ZodType)) {
        return "google.protobuf.Value";
      }
      console.error(
        chalk.stderr.bold.red(
          `Record at '${path}' has value type '${valueType._zod.def.type}' which is not (yet) supported`
        )
      );
      process.exit(-1);
    })();

    if (valueType instanceof z.ZodObject) {
      generate(proto, {
        schema: valueType,
        path: `${path}.[value]`,
        name: typeName,
      });
    } else if (valueType instanceof z.ZodRecord) {
      proto.write(`message ${typeName} {`);
      generate(proto, {
        schema: valueType,
        path: `${path}.[value]`,
      });
      proto.write(`}`);
    } else if (valueType instanceof z.ZodArray) {
      proto.write(`message ${typeName} {`);
      generate(proto, {
        schema: valueType,
        path: `${path}.[value]`,
      });
      proto.write(`}`);
    } else if (valueType instanceof z.ZodDiscriminatedUnion) {
      generate(proto, {
        schema: valueType,
        path: `${path}.[value]`,
        name: typeName,
      });
    }

    proto.write(`map <string, ${typeName}> record = 1;`);
  } else if (schema instanceof z.ZodArray) {
    const item = schema.element;

    if (item instanceof z.ZodOptional) {
      console.error(
        chalk.stderr.bold.red(
          `Array at '${path}' has _optional_ item type which is not supported`
        )
      );
      process.exit(-1);
    } else if (item instanceof z.ZodDefault) {
      console.error(
        chalk.stderr.bold.red(
          `Array at '${path}' has _default_ item type which is not supported`
        )
      );
      process.exit(-1);
    }

    const typeName = (() => {
      // To account for all possible "string" types in Zod, e.g.,
      // `z.uuid()`, `z.email()`, etc, we can't use `instanceof`.
      if (item._zod.def.type === "string") {
        return "string";
      } else if (item instanceof z.ZodNumber) {
        return "double";
      } else if (item instanceof z.ZodBigInt) {
        return "int64";
      } else if (item instanceof z.ZodBoolean) {
        return "bool";
      } else if (item instanceof z.ZodObject) {
        return "Item";
      } else if (item instanceof z.ZodRecord) {
        return "Item";
      } else if (item instanceof z.ZodArray) {
        return "Item";
      } else if (item instanceof z.ZodDiscriminatedUnion) {
        return "Item";
      } else if (item instanceof z.ZodCustom) {
        const meta = item.meta();
        if (item instanceof z.ZodCustom && "protobuf" in meta) {
          return meta.protobuf as string;
        }
      } else if (iszjson(item as z.ZodType)) {
        return "google.protobuf.Value";
      }
      console.error(
        chalk.stderr.bold.red(
          `Array at '${path}' has item type '${item._zod.def.type}' which is not (yet) supported`
        )
      );
      process.exit(-1);
    })();

    if (item instanceof z.ZodObject) {
      generate(proto, {
        schema: item,
        path: `${path}.[item]`,
        name: typeName,
      });
    } else if (item instanceof z.ZodRecord) {
      proto.write(`message ${typeName} {`);
      generate(proto, {
        schema: item,
        path: `${path}.[item]`,
      });
      proto.write(`}`);
    } else if (item instanceof z.ZodArray) {
      proto.write(`message ${typeName} {`);
      generate(proto, {
        schema: item,
        path: `${path}.[item]`,
      });
      proto.write(`}`);
    } else if (item instanceof z.ZodDiscriminatedUnion) {
      generate(proto, {
        schema: item,
        path: `${path}.[item]`,
        name: typeName,
      });
    }

    proto.write(`repeated ${typeName} items = 1;`);
  } else if (schema instanceof z.ZodDiscriminatedUnion) {
    assert(name !== undefined);

    proto.write(`message ${name} {`);

    const discriminator = schema._zod.def.discriminator;

    const literals = new Set<string>();
    const tags = new Map<number, [string, string]>();

    for (const option of schema.options) {
      if (!(option instanceof z.ZodObject)) {
        console.error(
          chalk.stderr.bold.red(
            `Discriminated union at '${path}' has option of type '${option._zod.def.type}', should be 'object'`
          )
        );
        process.exit(-1);
      }

      if (!(discriminator in option.shape)) {
        console.error(
          chalk.stderr.bold.red(
            `Discriminated union at '${path}' has option missing discriminator '${discriminator}'`
          )
        );
        process.exit(-1);
      }

      if (!(option.shape[discriminator] instanceof z.ZodLiteral)) {
        console.error(
          chalk.stderr.bold.red(
            `Discriminated union at '${path}' has option with unexpected discriminator '${discriminator}'; only 'string' literals are currently supported`
          )
        );
        process.exit(-1);
      }

      for (const literal of option.shape[discriminator]._zod.def.values) {
        if (typeof literal !== "string") {
          console.error(
            chalk.stderr.bold.red(
              `Discriminated union at '${path}' has option with unexpected discriminator '${discriminator}'; only 'string' literals are currently supported`
            )
          );
          process.exit(-1);
        }
      }

      // Can only support one value because of how we name
      // things. Could consider using the `tag` to name things instead
      // so that the literal values could change, but it makes the
      // proto less readable in places like the inspect page.
      if (option.shape[discriminator]._zod.def.values.length !== 1) {
        console.error(
          chalk.stderr.bold.red(
            `Discriminated union at '${path}' has option with more than one discriminator '${discriminator}' literals, only one is currently supported`
          )
        );
        process.exit(-1);
      }

      const literal = option.shape[discriminator]._zod.def.values[0];

      if (literals.has(literal)) {
        console.error(
          chalk.stderr.bold.red(
            `Discriminated union at '${path}' has an option that is reusing the literal '${literal}' for discrimniator '${discriminator}'`
          )
        );
        process.exit(-1);
      }

      literals.add(literal);

      // Make the name of this nested type be the PascalCase property.
      const typeName = literal.charAt(0).toUpperCase() + literal.slice(1);

      const meta = option.meta();

      if (meta === undefined || !("tag" in meta)) {
        console.error(
          chalk.stderr.bold.red(
            `Missing tag for discriminated union option at '${path}'; all discriminated union options must be tagged for backwards compatibility`
          )
        );
        process.exit(-1);
      }

      const { tag } = meta as { tag: number };

      if (tags.has(tag)) {
        console.error(
          chalk.stderr.bold.red(
            `Trying to use already used tag '${tag}' in discriminated union`
          )
        );
        process.exit(-1);
      }

      tags.set(tag, [toSnakeCase(literal), typeName]);

      const omit = {};
      omit[discriminator] = true;

      generate(proto, {
        schema: option.omit(omit),
        path: `${path}.{ ${discriminator}: "${literal}", ... }`,
        name: typeName,
      });
    }

    proto.write(`oneof ${discriminator} {`);

    for (const [tag, [literal, typeName]] of tags) {
      proto.write(`${typeName} ${literal} = ${tag};`);
    }

    proto.write(`}`);

    proto.write(`}`);
  } else {
    throw new Error(`Unexpected type '${schema._zod.def.type}'`);
  }
};

const validateProperDefaultSpecified = (schema: z.ZodType, path: string) => {
  if (schema instanceof z.ZodObject) {
    const shape = schema._zod.def.shape;
    for (const key in shape) {
      validateProperDefaultSpecified(shape[key], `${path}.${key}`);
    }
  } else if (schema instanceof z.ZodRecord) {
    validateProperDefaultSpecified(
      schema.valueType as z.ZodType,
      `${path}.[value]`
    );
  } else if (schema instanceof z.ZodArray) {
    validateProperDefaultSpecified(
      schema.element as z.ZodType,
      `${path}.[item]`
    );
  } else if (schema instanceof z.ZodDiscriminatedUnion) {
    for (const option of schema.options) {
      // NOTE: The path in the error will be something like:
      // `api.typeName.methods.methodName.errors.[object Object].field`.
      validateProperDefaultSpecified(option as z.ZodType, `${path}.${option}`);
    }
  } else if (schema instanceof z.ZodDefault) {
    const innerType = schema._zod.def.innerType;
    const isOptional = innerType instanceof z.ZodOptional;
    const isObject = innerType instanceof z.ZodObject;
    const defaultValue = schema._zod.def.defaultValue;

    // TODO: Write the document about why it is challenging
    // to have default values in the distributed systems
    // and attach the link to the error message.
    if (innerType instanceof z.ZodDiscriminatedUnion) {
      // Discriminated unions cannot have default values,
      // because its options will be always different
      // `z.object` types and we don't support that currently.
      console.error(
        chalk.stderr.bold.red(
          `'${path}' is a discriminated union type and cannot have a ` +
            `\`default\` value.`
        )
      );
      process.exit(-1);
    } else if (isObject && !isOptional) {
      console.error(
        chalk.stderr.bold.red(
          `'${path}' is a non-optional object type and cannot have a ` +
            `\`default\` value. Use \`optional()\` for object types with empty default.`
        )
      );
      process.exit(-1);
    } else if (defaultValue === undefined && !isOptional) {
      console.error(
        chalk.stderr.bold.red(
          `'${path}' is a non-optional type and cannot have an ` +
            `\`undefined\` default value. Change the \`default\` or make the ` +
            `field \`optional()\`.`
        )
      );
      process.exit(-1);
    } else if (defaultValue !== undefined && isOptional) {
      console.error(
        chalk.stderr.bold.red(
          `'${path}' is an \`optional\` type and can only have ` +
            `\`undefined\` default value.`
        )
      );
      process.exit(-1);
    } else if (isOptional) {
      // If the field is `optional` and uses `default=undefined`,
      // it is valid, check the inner type recursively.
      validateProperDefaultSpecified(innerType as z.ZodType, path);
      return;
    }

    const isEmptyArray =
      innerType instanceof z.ZodArray &&
      Array.isArray(defaultValue) &&
      defaultValue.length === 0;
    const isEmptyRecord =
      innerType instanceof z.ZodRecord &&
      typeof defaultValue === "object" &&
      defaultValue !== null &&
      Object.keys(defaultValue).length === 0;

    const innerTypeConstructorName = innerType.constructor.name;
    const allowedDefault =
      // Return `undefined` if not found.
      ALLOWED_DEFAULT_BY_CONSTRUCTOR_NAME[innerTypeConstructorName];

    if (innerType instanceof z.ZodArray) {
      if (!isEmptyArray) {
        console.error(
          chalk.stderr.bold.red(
            `'${path}' is an \`array\` with an unsupported default value. ` +
              `Only empty default value is supported. Use ` +
              `\`reboot_api.EMPTY_ARRAY\` to safely specify an empty array default.`
          )
        );
        process.exit(-1);
      }
    } else if (innerType instanceof z.ZodRecord) {
      if (!isEmptyRecord) {
        console.error(
          chalk.stderr.bold.red(
            `'${path}' is a \`record\` with an unsupported default value. ` +
              `Only empty default value is supported. Use ` +
              `\`reboot_api.EMPTY_RECORD\` to safely specify an empty record default.`
          )
        );
        process.exit(-1);
      }
    } else if (innerType instanceof z.ZodLiteral) {
      // For Literal types, the default value must be the first literal
      // value in the list (according to how Protobuf `enum`s work).
      const firstLiteralValue = innerType._zod.def.values[0];
      if (defaultValue !== firstLiteralValue) {
        console.error(
          chalk.stderr.bold.red(
            `'${path}' is a \`literal\` with an unsupported default value. ` +
              `Only the first literal value \`${firstLiteralValue}\` is ` +
              `supported as the default.`
          )
        );
        process.exit(-1);
      }
    } else if (allowedDefault === undefined) {
      console.error(
        chalk.stderr.bold.red(
          `'${path}' uses \`default\` which is not supported for type ` +
            `\`${innerTypeConstructorName}\`. Only ` +
            `${Object.keys(ALLOWED_DEFAULT_BY_CONSTRUCTOR_NAME)
              .map((name) => `\`${name}\``)
              .join(", ")}` +
            `, \`ZodArray\`, \`ZodRecord\`, \`ZodLiteral\`, and \`optional\` ` +
            `types can have a \`default\` currently.`
        )
      );
      process.exit(-1);
    } else if (defaultValue !== allowedDefault) {
      console.error(
        chalk.stderr.bold.red(
          `'${path}' has an unsupported default value. ` +
            `Supported default value for type \`${innerTypeConstructorName}\` is ` +
            `\`${JSON.stringify(allowedDefault)}\`.`
        )
      );
      process.exit(-1);
    }

    validateProperDefaultSpecified(innerType as z.ZodType, path);
  }
};

const main = async () => {
  // We generate the `.proto` files in a temporary directory.
  const generatedProtosDirectory = await mkdtemp(
    path.join(os.tmpdir(), "protos-")
  );

  const cwd = process.cwd();

  let protoFileGenerated = false;

  for (const file of files) {
    const module = await import(`${path.join(cwd, filesDirectory, file)}`);
    const api = module.api;
    if (api === undefined) {
      // Skipping the file if it does not export `api`.
      // We will error out from 'protoc' if none of the files
      // exported `api`.
      continue;
    }

    // Get '.proto' file name, i.e., by changing '.ts' to '.proto'.
    //
    // NOTE: there is an prerequisite invariant here that the paths
    // are already in the correct form, hence why we have to join with
    // all of `cwd`, `filesDirectory`, and `file` above.
    const parsed = path.parse(file);
    parsed.ext = ".proto";
    parsed.base = parsed.name + parsed.ext;

    const name = `${path.format(parsed)}`;

    fs.mkdirSync(path.dirname(path.join(generatedProtosDirectory, name)), {
      recursive: true,
    });

    const proto = fs.createWriteStream(
      path.join(generatedProtosDirectory, name)
    );

    proto.write(`syntax = "proto3";\n`);
    proto.write(`package ${parsed.dir.replace(/\//g, ".")};\n`);
    proto.write(`import "google/protobuf/empty.proto";\n`);
    proto.write(`import "google/protobuf/struct.proto";\n`);
    proto.write(`import "rbt/v1alpha1/options.proto";\n`);
    // Including 'rbt/v1alpha1/tasks.proto' preemptively to support
    // protobuf messages like `TaskId`.
    proto.write(`import "rbt/v1alpha1/tasks.proto";\n`);

    // Determine the zod file path to write to the proto option.
    // When running in Bazel tests, use a relative path because we will
    // invoke that script in the temporary directory on a copy of the
    // input Zod file, saving the original directory structure.
    // NOTE: While generating the proto files for tests in Bazel the
    // generated file will be placed in the same folder as the input
    // Zod file.
    let zodFilePath: string;
    if (process.env.REBOOT_BAZEL_GENERATED) {
      // In Bazel, use a relative path from `filesDirectory`.
      zodFilePath = path.join(filesDirectory, file);
    } else {
      // For CLI usage, use the full absolute path.
      zodFilePath = path.join(cwd, filesDirectory, file);
    }

    proto.write(`option (rbt.v1alpha1.file).zod = "${zodFilePath}";\n`);

    for (const typeName in api) {
      // TODO: ensure `typeName` is PascalCase.
      const result = typeSchema.safeParse(api[typeName]);

      if (!result.success) {
        console.error(
          chalk.stderr.bold.red(
            `'api.${typeName}' in '${path.join(
              filesDirectory,
              file
            )}' could not be validated! Please try again after correcting the following errors: \n\n${z.prettifyError(
              result.error
            )}\n`
          )
        );
        // Check if we have any 'not instance of ZodType' errors,
        // possibly indicating that 'zod/v4' is not being
        // used. Unfortunately Zod does not provide a way to check
        // what version of the library is being used, so this is just
        // best effort.
        for (const issue of result.error.issues) {
          if (JSON.stringify(issue).includes("not instance of ZodType")) {
            console.error(
              chalk.stderr.bold.red(
                `NOTE: Reboot requires 'zod/v4', are you using it?\n`
              )
            );
            break;
          }
        }
        process.exit(-1);
      }

      // Doing 'as any' here because Typescript can't figure out the
      // inferred Zod type if we import from another module and will
      // throw 'TS2589: Type instantiation is excessively deep and
      // possibly infinite.' error.
      // It is safe to do so, because right before that we call
      // 'safeParse()', which ensures that the type is correct.
      const type = result.data as any;

      validateProperDefaultSpecified(
        type.state instanceof z.ZodObject ? type.state : z.object(type.state),
        `api.${typeName}.state`
      );

      generate(proto, {
        schema:
          type.state instanceof z.ZodObject ? type.state : z.object(type.state),
        path: `api.${typeName}.state`,
        name: typeName,
        state: true,
      });

      const errorsToGenerate = [];

      for (const methodName in type.methods) {
        // TODO: ensure `methodName` is PascalCase.
        const { request, response } = type.methods[methodName];

        validateProperDefaultSpecified(
          request instanceof z.ZodObject ? request : z.object(request),
          `api.${typeName}.methods.${methodName}.request`
        );

        const requestTypeName = `${typeName}${toPascalCase(methodName)}Request`;
        generate(proto, {
          schema: request instanceof z.ZodObject ? request : z.object(request),
          path: `api.${typeName}.methods.${methodName}.request`,
          name: requestTypeName,
        });

        if (response instanceof z.ZodVoid) {
          continue;
        }

        validateProperDefaultSpecified(
          response instanceof z.ZodObject ? response : z.object(response),
          `api.${typeName}.methods.${methodName}.response`
        );

        const responseTypeName = `${typeName}${toPascalCase(
          methodName
        )}Response`;
        generate(proto, {
          schema:
            response instanceof z.ZodObject ? response : z.object(response),
          path: `api.${typeName}.methods.${methodName}.response`,
          name: responseTypeName,
        });
      }

      proto.write(`service ${typeName}Methods {\n`);

      for (const methodName in type.methods) {
        if (methodName !== toCamelCase(methodName)) {
          console.error(
            chalk.stderr.bold.red(
              `'api.${typeName}' in '${path.join(
                filesDirectory,
                file
              )}' has a method name '${methodName}' that is not camelCase, please rename it to be camelCase (e.g., '${toCamelCase(
                methodName
              )}')\n`
            )
          );
          process.exit(-1);
        }
        const method = type.methods[methodName];

        const requestTypeName = `${typeName}${toPascalCase(methodName)}Request`;

        const responseTypeName =
          method.response instanceof z.ZodVoid
            ? `google.protobuf.Empty`
            : `${typeName}${toPascalCase(methodName)}Response`;

        proto.write(
          [
            `  rpc ${toPascalCase(methodName)}(${requestTypeName})`,
            `      returns (${responseTypeName}) {`,
            `    option (rbt.v1alpha1.method) = {`,
            `      ${method.kind}: {`,
          ].join(`\n`)
        );

        if (method.kind === "writer" || method.kind === "transaction") {
          if (method.factory !== undefined) {
            proto.write(`        constructor: {},\n`);
          }
        }

        proto.write(`      },\n`);

        if (method.errors !== undefined) {
          const errors =
            method.errors instanceof z.ZodDiscriminatedUnion
              ? method.errors
              : z.discriminatedUnion(
                  "type",
                  method.errors as unknown as readonly [
                    z.core.$ZodTypeDiscriminable,
                    ...z.core.$ZodTypeDiscriminable[]
                  ]
                );

          validateProperDefaultSpecified(
            errors,
            `api.${typeName}.methods.${methodName}.errors`
          );

          const path = `api.${typeName}.methods.${methodName}.errors`;
          const name = `${typeName}${toPascalCase(methodName)}Errors`;

          errorsToGenerate.push(() => {
            generate(proto, { schema: errors, path, name });
          });

          // In addition to all the checks we get above when calling
          // `generate()`, we also want to make sure that none of the
          // gRPC or Reboot error types conflict.
          for (const option of errors.options as z.ZodObject[]) {
            const literal = option.shape.type._zod.def.values[0];

            if (ZOD_ERROR_NAMES.includes(literal)) {
              console.error(
                chalk.stderr.bold.red(
                  `'${path}' uses '${literal}' as an error 'type' that conflicts with system errors, please use a different literal!\n`
                )
              );
              process.exit(-1);
            }
          }

          // And finally, we need to add this protobuf message to the
          // `errors` option for this method in the `.proto` file.
          proto.write(`      errors: ["${name}"],\n`);
        }

        proto.write([`    };`, `  }`].join(`\n`));
      }

      proto.write(`}\n`);

      // Generate all the errors we need at the top-level.
      errorsToGenerate.forEach((generate) => generate());
    }

    proto.end();

    // Need to wait for the file to be written (TODO: wait for all of
    // them via `Promise.all`).
    await new Promise<void>((resolve, reject) => {
      proto.on("finish", () => resolve());
      proto.on("error", (err) => reject(err));
    });

    protoFileGenerated = true;
  }

  if (protoFileGenerated) {
    // If at least one proto file was generated, we write the
    // directory to the stdout, so Python 'generate' script can
    // glob inside it and adjust the 'protoc' generation command.
    console.log(`${generatedProtosDirectory}`);
  }

  process.exit(0);
};

main();
