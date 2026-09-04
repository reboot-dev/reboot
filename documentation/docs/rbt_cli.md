# The `rbt` CLI

`rbt` is Reboot's command line tool. It ships with the Reboot library
rather than being installed separately — see
[Develop locally](/develop_locally#the-rbt-cli) for how to run it in
Python and Node.js projects.

Every command reads its flags from an
[`.rbtrc`](/develop_locally#rbtrc-and-flags) file, so you rarely type
more than the command itself.

## Commands

| Command | What it does |
| --- | --- |
| `rbt generate` | Generate server, client, and React code from your API definitions. |
| `rbt dev run` | Run your application for development, regenerating code and restarting on change. |
| `rbt dev expunge` | Delete the state a named development application has persisted. |
| `rbt dashboard` | Serve the developer dashboard, which watches your API directory as you write it. |
| `rbt inspect type list` | List the state types a running application serves. |
| `rbt inspect state list` | List the state IDs of one type. |
| `rbt inspect state get` | Print one instance's state as JSON. |
| `rbt task list` / `rbt task cancel` | List and cancel an application's [tasks](/tasks). |
| `rbt export` / `rbt import` | Export application data to, or import it from, JSON-lines files. |
| `rbt serve run` | Run your application in production on [your own infrastructure](/deploy_on_your_own). |
| `rbt cloud up` / `rbt cloud down` | Deploy to, or terminate on, [Reboot Cloud](/deploy_on_reboot_cloud). |
| `rbt cloud logs` | Stream a deployed application's logs. |
| `rbt cloud secret set` / `list` / `delete` | Manage a deployed application's [secrets](/secrets). |

Add `--help` to any of them for the full flag list.

:::tip Inspecting state
`rbt inspect` works against a local `rbt dev run` backend and against
a deployed Reboot Cloud application (via `--application-url` and
`--admin-credential`). During local development there is also a web
view at
[http://localhost:9991/__/inspect](http://localhost:9991/__/inspect).
:::

## Bring your own certificate with `rbt dev run`
By default `rbt dev run` backends use plain HTTP, not HTTPS. This makes for
easier development, but due to web browser limitations the number of connections
to the backend over HTTP will be limited - beyond 200 connections it is required
to use HTTPS. To enable HTTPS you must provide your own TLS certificate when
running `rbt dev run`.

### Generating a Certificate with [mkcert](https://github.com/FiloSottile/mkcert)

You can use `mkcert` to issue a certificate. Follow these steps:

* Install `mkcert`: Refer to the instructions in the [`mkcert README`](https://github.com/FiloSottile/mkcert/blob/master/README.md) for installation.
* Install the root certificate: Run the following command: `mkcert -install`.
* Issue a certificate: `mkcert localhost`.

:::note
Running `mkcert <domain>` will issue a certificate for the specified domain. For
local development, it is recommended to include `localhost` in the certificate's
Subject Alternative Names. If you use a custom domain, ensure it points to
`127.0.0.1` in your `/etc/hosts` file for `rbt dev run` to work.
:::

### Configuring `rbt dev run` with the Certificate

Once the certificate is issued, configure `rbt dev run` with the following flags:

* `--tls-certificate=<path>` - The path to the certificate file (e.g. `localhost.pem`).
* `--tls-key=<path>` - The path to the key file (e.g. `localhost-key.pem`).
* `--tls-root-certificate=<path>` - The path to the root certificate file (e.g. `rootCA.pem`).
  To locate the root certificate, use: `mkcert -CAROOT`.

### Updating Reboot React Endpoint

:::note
Make sure to update the [`RebootClientProvider's
url`](https://github.com/reboot-dev/reboot-hello/blob/main/web/src/index.tsx#L16)
to use HTTPS when using a custom certificate.
:::

This setup ensures secure local development with custom certificates and enables
compatibility with `rbt dev run`.
