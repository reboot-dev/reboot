---
title: Implement `authorizer()` on Every Servicer
impact: HIGH
impactDescription: Without an explicit authorizer, calls to the Servicer are denied
tags: servicer, authorizer, allow, auth, authorizers
---

## Implement `authorizer()` on Every Servicer

> **Critical:** every Servicer needs `def authorizer(self)`. It returns
> a constructed rule **instance** (`return allow()`), not a class
> (`return allow` is a bug). Without an authorizer, calls fail.

Every Servicer must implement `def authorizer(self)` returning an
authorizer instance. Reboot evaluates the authorizer before each method
call; without one, calls fail. For development the simplest choice is
`allow()`, which permits all callers.

**Incorrect (Servicer with no authorizer):**

```python
class ChatRoomServicer(ChatRoom.Servicer):

    async def messages(self, context, request):
        return MessagesResponse(messages=self.state.messages)
    # Missing `authorizer()` — calls will be denied.
```

**Correct (canonical authorizer shape):**

```python
from reboot.aio.auth.authorizers import allow


class ChatRoomServicer(ChatRoom.Servicer):

    def authorizer(self):
        return allow()

    async def messages(
        self, context: ReaderContext,
    ) -> ChatRoom.MessagesResponse:
        return ChatRoom.MessagesResponse(messages=self.state.messages)
```

## `allow()` Is the Default for Examples and Local Dev

Production applications should compose authorizers that gate based on the
caller's identity, the actor ID, or method-level rules. The Reboot
authorizer module exposes the building blocks; the local-dev shortcut is
`allow()`.

## One Authorizer per Servicer

`def authorizer(self)` returns a single rule that applies to every
method on the Servicer. Per-method differentiation (e.g. allow reads but
gate writes) requires a custom authorizer subclass — see
`auth-custom-predicates.md`.

## `authorizer()` Returns an Instance, Not a Class

Common mistake: returning a class. The method must return a constructed
authorizer object, e.g. `return allow()`, not `return allow`.

```python
# Incorrect:
def authorizer(self):
    return allow

# Correct:
def authorizer(self):
    return allow()
```
