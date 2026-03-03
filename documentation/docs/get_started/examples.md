# Examples

## `prosemirror-zod`

[`reboot-dev/reboot-prosemirror-zod`](https://github.com/reboot-dev/reboot-prosemirror-zod) - _TypeScript backend, React frontend_

This example demonstrates integeration with the popular
[ProseMirror](https://prosemirror.net) library.

It demonstrates:

* how to _sync_ betweeen a React frontend and a Reboot backend
* how to run a long-lived control loop using a `workflow` method, which takes checkpoints of the ProseMirror document

## `bank-zod`

[`reboot-dev/reboot-bank-zod`](https://github.com/reboot-dev/reboot-bank-zod) - _TypeScript backend, React frontend_

The `bank` example demonstrates a multiple user "bank", with signup,
transfers, and interest calculations. It strikes a good balance between simplicity and
real-world utility.

It demonstrates:
* a debit/credit transaction that atomically moves funds between users (the canonical transaction example!)
* different [data types](/develop/define/overview) on the backend
* a task to give users interest
* a reactive frontend

## `bank-pydantic`

[`reboot-dev/reboot-bank-pydantic`](https://github.com/reboot-dev/reboot-bank-pydantic) - _Python backend, React frontend_

The `bank` example demonstrates a multiple user "bank", with signup,
transfers, and interest calculations. It strikes a good balance between simplicity and
real-world utility.

It demonstrates:
* a debit/credit transaction that atomically moves funds between users (the canonical transaction example!)
* different [data types](/develop/define/overview) on the backend
* a task to give users interest
* a reactive frontend
<!-- TODO: Deep link to the task, transaction, and mailgun integration. #3515. -->

## `bank`

[`reboot-dev/reboot-bank`](https://github.com/reboot-dev/reboot-bank) - _Python backend, React frontend_

The `bank` example demonstrates a multiple user "bank", with signup,
transfers, and interest calculations. It strikes a good balance between simplicity and
real-world utility.

It demonstrates:
* a debit/credit transaction that atomically moves funds between users (the canonical transaction example!)
* different [data types](/develop/define/overview) on the backend
* use of the [Mailgun integration](/library_services/mailgun) to send an email (transactionally!) as part of
  user signup
* a task to give users interest
* a reactive frontend
<!-- TODO: Deep link to the task, transaction, and mailgun integration. #3515. -->

## `counter`

[reboot-dev/reboot-counter](https://github.com/reboot-dev/reboot-counter) - _TypeScript backend, React frontend_

The `counter` example is our most concise demonstration
of a Reboot transaction and reactive frontend.

It includes:
* a reactive frontend
* multiple instances of the same [data type](/develop/define/overview)
* a simple [transaction](/develop/define/methods#kinds) that
  [atomically moves counts between counters](https://github.com/reboot-dev/reboot-counter/blob/ae017cbe980a1f1cbb6002c28828d333e26b7a64/backend/src/counter_servicer.ts#L36-L58)

## `hello`

[reboot-dev/reboot-hello](https://github.com/reboot-dev/reboot-hello) - _Python backend, React frontend_

The [`chat_room` example](https://github.com/reboot-dev/reboot-hello) demonstrates
the simplest possible chat app: a single user, and a [singleton](/develop/call/overview#state-ids)
"chat room". It contains:
* a reactive frontend: open two browsers pointed at the same backend and see messages flow!
* [optimistic updates](/develop/call/from_react#optimistic-updates): sent messages are
  [rendered as pending](https://github.com/reboot-dev/reboot-hello/blob/9f8bea8992c6b4a11fa16bd60429abc4d5adc42d/web/src/App.tsx#L75-L83)
  until they have been reflected in state received from the backend.
* a `Dockerfile` that shows
  [how to publish a Reboot app to the Reboot Cloud](https://github.com/reboot-dev/reboot-hello?tab=readme-ov-file#running-on-the-reboot-cloud).

Because of `chat_room`'s simplicity, it does not use any [transactions](/develop/define/methods#kinds) --
see the [`bank`](#bank) or [`counter`](#counter) examples for those.


## `boutique`

[reboot-dev/reboot-boutique](https://github.com/reboot-dev/reboot-boutique) - _Python backend, React frontend_

The [`boutique` example](https://github.com/reboot-dev/reboot-boutique) is our largest
example. It demonstrates a fairly complete web-shop, factored out into many components which would
likely be maintained by separate teams.

It was originally forked from
[GoogleCloudPlatform/microservices-demo](https://github.com/GoogleCloudPlatform/microservices-demo),
and demonstrates how Reboot makes it simple to write correct microservice applications.

Of particular note, it has:
* a more complex React frontend
* many different [data types](/develop/define/overview) and API interactions
* a multi-faceted ["checkout" method](https://github.com/reboot-dev/reboot-boutique/blob/7480e9d6b0a72c560a54f73571c49b10d3fa5478/backend/src/checkout/servicer.py#L45-L149)
  which transactionally composes method calls to many other services. Use of a transaction
  is critical in this case, because if any of the methods involved in the transaction fail,
  then the entire transaction is aborted, atomically
* calls to Reboot-hosted gRPC services

The boutique is our largest example, so consider visiting the [`hello`](#hello),
[`counter`](#counter), or [`bank`](#bank) examples first to get your feet wet!
