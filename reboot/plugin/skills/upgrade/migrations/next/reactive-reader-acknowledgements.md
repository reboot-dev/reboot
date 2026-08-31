## Reactive readers now acknowledge every response

A backend from this version stops producing responses for a reactive
read until the client acknowledges the previous one, so that a client
that can't keep up skips ahead to the latest state instead of working
through every state it missed. A frontend built against an older
version doesn't send those acknowledgements, so it receives one
reactive response and then never updates again.

Clients from this version work against both an old and a new backend,
so if the application deploys its frontend separately from its backend,
deploy the frontend first (or deploy both at once). If the backend goes
out first, any already-running browser tab keeps showing stale data
until it is reloaded against the new frontend.
