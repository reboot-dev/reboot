#!/usr/bin/env node

// NOTE: Yarn doesn't add transitive binary dependencies to PATH!!!
// Thus this script which "proxies" to `protoc-gen-es`.
import "@bufbuild/protoc-gen-es/bin/protoc-gen-es";
