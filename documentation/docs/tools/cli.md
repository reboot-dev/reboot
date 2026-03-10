# Using the `rbt` CLI

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
`127.0.0.1` in your `/etc/hosts` file for `rbt dev run` to work seamlessly.
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
<!-- TODO: https://github.com/reboot-dev/mono/issues/3363 -->
