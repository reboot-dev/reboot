## The `rbt cloud` commands moved to the `reboot-cloud` package

`rbt cloud up`, `rbt cloud down`, `rbt cloud logs` and `rbt cloud secret ...` are now provided by the separate `reboot-cloud`
package, which must be installed at exactly the same version as
`reboot`. Without it, `rbt cloud ...` fails with a message that names
the package.

If the application deploys to Reboot Cloud (it has a `cloud up` line
in `.rbtrc`, or its scripts, CI workflows or docs run `rbt cloud`),
add `reboot-cloud` wherever `reboot` is pinned, with the same pin:

- `pyproject.toml`: next to `"reboot==X.Y.Z"` add
  `"reboot-cloud==X.Y.Z"`.
- `requirements.txt`: next to `reboot==X.Y.Z` add
  `reboot-cloud==X.Y.Z`.
- A `Dockerfile` or CI step that runs `pip install reboot==X.Y.Z`
  only to deploy: add `reboot-cloud==X.Y.Z` to the same command.

Applications that run `rbt` through `npx` need no change; the
`@reboot-dev/reboot` package installs both.
