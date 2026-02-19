# Side-effects

## What is a side-effect?

A side-effect is an interaction with the world outside of Reboot that might make a change
to external state. Examples include executing write calls to an external API, sending
an email or other message, charging a payment card, etc.

We call them "side"-effects in this case because the primary "effect" of running Reboot
methods is to update Reboot's own state. But that doesn't make them any less important!
That's why Reboot makes it easy to safely execute side-effects.

## Safely executing side-effects

Reboot [methods](/develop/define/methods) can be composed
according to a safety hierarchy, which enables simple, safe, and
powerful APIs.

In order to enable that composition, Reboot methods must:
1. Isolate any side-effects that they need to execute to [tasks](/develop/tasks).
2. Ensure that the side-effects executed by their tasks are idempotent.

## Third-party APIs

When interacting with external third-party APIs, first always [check](/library_services/overview)
whether Reboot already includes an integration for that API. Reboot integrations implement
the advice on this page to correctly and safely retry external API calls. We welcome
contributions of integrations for commonly used APIs!

## Validation

In order to validate that side-effects are properly handled, Reboot always executes your
Reboot [methods](/develop/define/methods) twice [^1] when running in development
mode. The second method execution acts as a reminder that all external calls you make in
Reboot must be able to safely and correctly execute (at least) twice, because in production
it may be necessary for Tasks to rerun in response to temporary failures.

When re-executing a method, Reboot will log a message referring you to this page.

### Fixing failures caused by validation

If side-effect validation causes your non-Task Reader, Writer, or Transaction to incorrectly
re-execute work (effectively: if you notice it happening at all!), then it's likely that you
are executing a side-effect in the wrong place: you should move side-effect execution to
a Task.

If, on the other hand, side-effect validation causes your Task to fail to re-execute correctly,
then the side-effects of your Task need to be adjusted to be made idempotent. Some examples:
* If you are using an external API to "create" an object, and the API would fail if an object
  already existed, you should adjust your effect to succeed if the object already exists.
* If you are interacting with an external API that supports providing an idempotency key, you
  should ensure that your Reboot state stores the idempotency key that you will use each time
  your Task runs.

### Configuring validation

Running with validation enabled helps to increase your confidence that your Reboot app
is ready for production. If you need to temporarily disable or increase the verbosity of
validation, you can do so with:
* the `rbt dev run --effect-validation={enabled,quiet,disabled}` flag for `rbt
  dev run`
* the `Reboot.up(..., effect_validation=...)` argument in unit tests

[^1] Thanks to the React developers for popularizing this method of effect detection!
