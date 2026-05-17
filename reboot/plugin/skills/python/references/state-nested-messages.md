---
title: Compose State with Nested Messages
impact: MEDIUM
impactDescription: Flat-only state forces unwieldy parallel field naming as state grows
tags: state, nested, messages, sub-objects, structure
---

## Compose State with Nested Messages

> **Critical:** only **non-state** messages should be nested fields.
> Don't put a state message (one with `option (rbt.v1alpha1.state) = {}`)
> inside another state message — store its **string ID** instead and
> reference via `ref(id)`. Pydantic equivalent: don't use a state-Model
> as a field type.

A state message's fields can themselves be proto messages. Use nested
messages to group related fields and keep the state shape readable.

**Incorrect (parallel flat fields):**

```proto
message Order {
  option (rbt.v1alpha1.state) = {};
  string shipping_street = 1;
  string shipping_city = 2;
  string shipping_zip = 3;
  string billing_street = 4;
  string billing_city = 5;
  string billing_zip = 6;
}
```

**Correct (nested message):**

```proto
message Address {
  string street = 1;
  string city = 2;
  string zip = 3;
}

message Order {
  option (rbt.v1alpha1.state) = {};
  Address shipping = 1;
  Address billing = 2;
}
```

## Nested Messages from Other Files

Cross-file nesting works through `import`. From a multi-proto layout:

```proto
// api/chat/v1/message.proto
syntax = "proto3";
package chat.v1;

message Message {
  string author = 1;
  string body = 2;
}
```

```proto
// api/chat/v1/channel.proto
syntax = "proto3";
package chat.v1;

import "rbt/v1alpha1/options.proto";
import "chat/v1/message.proto";

message Channel {
  option (rbt.v1alpha1.state) = {};
  string name = 1;
  repeated Message messages = 2;
}
```

## Mutating Nested Messages

Inside a writer/transaction, assign sub-messages directly or assign
field-by-field:

```python
async def update_shipping(
    self, context: WriterContext, request: UpdateShippingRequest,
) -> UpdateShippingResponse:
    self.state.shipping.street = request.street
    self.state.shipping.city = request.city
    self.state.shipping.zip = request.zip
    return UpdateShippingResponse()
```

Or replace the whole nested message:

```python
self.state.shipping = Address(
    street=request.street, city=request.city, zip=request.zip,
)
```

## Avoid Nesting State Messages Inside State Messages

Only **non-state** messages should be used as nested fields. A nested
`message Foo { option (rbt.v1alpha1.state) = {}; ... }` would mean "state
inside state", which Reboot does not model that way. Instead, keep the
nested actor as its own state machine and store its **ID** (a string) in
the parent.
