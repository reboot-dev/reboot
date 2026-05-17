---
title: Structure `.proto` Files for Reboot
impact: CRITICAL
impactDescription: Proto layout determines generated import paths and code-gen behavior
tags: proto, package, syntax, imports, layout
---

## Structure `.proto` Files for Reboot

> **Critical:** declare a `package` and import
> `rbt/v1alpha1/options.proto` — without these, code generation can't
> emit Reboot extensions. The file path under `api/` mirrors the
> package (e.g. `package x.y.v1` lives at `api/x/y/v1/<name>.proto`).
> No hand-written `__init__.py` in `api/`.

Reboot reads `.proto` files from the directory configured by `generate <dir>`
in `.rbtrc` (canonical: `api/`). Files must use proto3 syntax, declare a
package, and import `rbt/v1alpha1/options.proto` to access Reboot's `state`
and `method` options.

The package determines the generated Python import path. A `.proto` declared
as `package chat_room.v1;` and located at `api/chat_room/v1/chat_room.proto`
generates `chat_room.v1.chat_room_rbt`.

**Incorrect (no package, no Reboot import):**

```proto
syntax = "proto3";

message ChatRoom {
  repeated string messages = 1;
}
```

**Correct (matches the [`reboot-hello`](https://github.com/reboot-dev/reboot-hello) example, `api/chat_room/v1/chat_room.proto`):**

```proto
syntax = "proto3";

package chat_room.v1;

import "rbt/v1alpha1/options.proto";

message ChatRoom {
  option (rbt.v1alpha1.state) = {};
  repeated string messages = 1;
}

service ChatRoomMethods {
  rpc Messages(MessagesRequest) returns (MessagesResponse) {
    option (rbt.v1alpha1.method).reader = {};
  }
  rpc Send(SendRequest) returns (SendResponse) {
    option (rbt.v1alpha1.method).writer = {};
  }
}

message MessagesRequest {}
message MessagesResponse { repeated string messages = 1; }
message SendRequest { string message = 1; }
message SendResponse {}
```

## File and Directory Layout

The path under `api/` mirrors the package. For `package x.y.v1`, the file
lives at `api/x/y/v1/<name>.proto`.

```
api/
  chat_room/
    v1/
      chat_room.proto   # package chat_room.v1;
```

## No `__init__.py` Inside `api/`

`api/` holds `.proto` files and (after generation) generated Python under
`backend/api/`. Do not place hand-written `__init__.py` files in either
tree — `rbt generate` manages this.

## Multiple Protos Compose via `import`

A larger app splits its API across files in the same package. Cross-file
references use `import` and the fully qualified package name:

```proto
// api/chat/v1/message.proto
syntax = "proto3";
package chat.v1;
message Message { string body = 1; }
```

```proto
// api/chat/v1/channel.proto
syntax = "proto3";
package chat.v1;

import "rbt/v1alpha1/options.proto";
import "chat/v1/message.proto";

message Channel {
  option (rbt.v1alpha1.state) = {};
  repeated Message messages = 1;
}
```
