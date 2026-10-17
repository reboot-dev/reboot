#!/usr/bin/env node

// --------------------------------------------------------------------
// NOTE: this is based off of
// https://github.com/bufbuild/protobuf-es/issues/435.
// --------------------------------------------------------------------

const { runNodeJs } = require("@bufbuild/protoplugin");
const { CodeGeneratorResponse } = require("@bufbuild/protobuf");
const { execSync } = require("node:child_process");

// Matches the unannotated `bytes` field `protoc-gen-es` emits in a
// generated `.ts` file, e.g. `  taskUuid = new Uint8Array(0);`.
const BYTES_FIELD_REGEX = /^(\s+[A-Za-z_$][\w$]*) = new Uint8Array\(0\);$/gm;

runNodeJs({
  name: "protoc-gen-es-with-deps",
  version: "v0.0.1",
  run(request) {
    request.fileToGenerate = request.protoFile
      .map((file) => file.name ?? "")
      .filter((file) => !file.startsWith("google/protobuf/"));
    const resBytes = execSync("protoc-gen-es", {
      encoding: "buffer",
      input: request.toBinary(),
      // Node's default `maxBuffer` is 1 MiB, which large applications'
      // generated code easily exceeds, causing `ENOBUFS`. `run()` must
      // be synchronous so we can't stream; don't cap the buffer instead.
      maxBuffer: Infinity,
    });
    const response = CodeGeneratorResponse.fromBinary(resBytes);
    for (const file of response.file) {
      if (file.name.endsWith(".ts") && !file.name.endsWith(".d.ts")) {
        // Since TypeScript 5.7 `Uint8Array` is generic and
        // `new Uint8Array(0)` is inferred as `Uint8Array<ArrayBuffer>`,
        // whereas a `.d.ts` that declares a field as `Uint8Array` means
        // `Uint8Array<ArrayBufferLike>`. A `bytes` field in a message
        // generated as `.ts` (e.g., `rbt.v1alpha1.TaskId` in a user's
        // `api/`) thus no longer accepts the same message generated as
        // `.d.ts` (e.g., the `TaskId` that `@reboot-dev/reboot-api`
        // ships and that `schedule()` returns), nor a `Buffer`.
        // Annotate the field as `Uint8Array` so that the `.ts` and
        // `.d.ts` forms of a message agree on every TypeScript version.
        //
        // A singular `bytes` field is the only place where
        // `protoc-gen-es` leaves a `Uint8Array` type to inference, as
        // `  data = new Uint8Array(0);`. Every other shape of `bytes`
        // field is already emitted with the annotation:
        //
        //   data?: Uint8Array;                         // optional
        //   data: Uint8Array[] = [];                   // repeated
        //   data: { [key: string]: Uint8Array } = {};  // map value
        //   value: Uint8Array;                         // oneof member
        //   data?: Uint8Array;                         // BytesValue
        //
        // So are the `fromBinary(bytes: Uint8Array, ...)` signature and
        // the `default: new Uint8Array([...])` of a proto2 field, which
        // lives in the typed `fields` metadata, not on the class.
        file.content = file.content.replace(
          BYTES_FIELD_REGEX,
          "$1: Uint8Array = new Uint8Array(0);"
        );
      }
    }
    return response;
  },
});
