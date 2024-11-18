#!/usr/bin/env node

// --------------------------------------------------------------------
// NOTE: this is based off of
// https://github.com/bufbuild/protobuf-es/issues/435.
// --------------------------------------------------------------------

const { runNodeJs } = require("@bufbuild/protoplugin");
const { CodeGeneratorResponse } = require("@bufbuild/protobuf");
const { execSync } = require("node:child_process");

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
    });
    return CodeGeneratorResponse.fromBinary(resBytes);
  },
});
