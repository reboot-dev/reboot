# Non-local development

Reboot provides an [excellent local development
experience](/develop_locally#running-your-app-for-development), allowing you to
develop apps on your machine that seamlessly transfer to production. For some
applications, however, purely local development is not sufficient. You may for
example want to try your Reboot application on your phone, or you may want to
test it with somebody who is not sitting at your computer.

## Deploying to a dedicated testing environment
You may [deploy your Reboot application](/deploy_on_your_own) to a testing
environment. This works just like deploying to production, but the deployment is
kept private (typically by using a different domain name).

This approach gives you a production-like environment to test with, but does not
support convenient features like live-updating of your application.

## Tunnels
You can use a third-party "development tunnel" to give your normal local
development environment an internet-public URL. How to configure these tunnels
is dependent on the tunnel service you choose, but whichever you pick you need
exactly one, in front of the backend.

That is because `rbt dev run` serves the whole application from one origin:
with `--web-app` it serves the web app at `/` from the frontend's dev server,
next to the API and the MCP Apps (see [Develop
locally](/develop_locally#named-local-urls-with---portless)). The tunnel's
public URL is therefore the whole app, and nothing in the frontend has to
change: the frontend's `RebootClientProvider` uses the page's own origin when
it is given no `url`, which through the tunnel is the tunnel.

### cloudflared

[cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/)
provides free "quick tunnels" with no account required. Under [`rbt dev run
--portless`](/develop_locally#named-local-urls-with---portless), the default,
point it at the backend's name through the portless proxy, so it needs no port
and keeps working across restarts of `rbt dev run`:

```sh
cloudflared tunnel --metrics localhost:4040 \
    --url https://127.0.0.1:443 \
    --http-host-header <app>.localhost \
    --origin-server-name <app>.localhost \
    --origin-ca-pool ~/.portless/ca.pem
```

(`443` is `PORTLESS_PORT` if you moved the proxy.) Without portless, point it
at the backend's port instead:

```sh
cloudflared tunnel --metrics localhost:4040 --url http://localhost:9991
```

Either way `cloudflared` prints the tunnel's `https://*.trycloudflare.com` URL,
and the `--metrics` endpoint, `http://localhost:4040/quicktunnel`, returns it
too.

### ngrok

[ngrok](https://ngrok.com) requires an account. After installing `ngrok`, sign
in at [dashboard.ngrok.com](https://dashboard.ngrok.com/get-started/your-authtoken)
to grab your authtoken, then run:

```sh
ngrok config add-authtoken <YOUR_TOKEN>
```

`ngrok` tunnels to a port, so give the backend one it can count on. Under
`--portless` the backend is on a free port unless you pass `--port`, so either
run with `rbt dev run --port=9991` or with the plain-port configuration,
`rbt dev run --config=ports`. Then start the tunnel in a new terminal:

```sh
ngrok http 9991
```

:::info
If you are not a paying customer of `ngrok`, free tunnels serve an HTML
interstitial on first request. Visit the tunnel's URL in your web browser once
to accept traffic being sent to it, else your app won't work. The interstitial
also breaks [`UI`](/frontends/ui_methods) methods rendered inside Claude; use
`cloudflared` for those.
:::

### Telling `rbt dev run` about the tunnel

Pass the tunnel's URL to `rbt dev run` as `--tunnel-url=<url>`. For an MCP
App the setup wizard then shows and verifies that tunnel, rather than looking
for one through `cloudflared`'s and `ngrok`'s local APIs, which with several
apps up can find another app's tunnel. Tunnels pass the public hostname on as
`X-Forwarded-Host`, which the OAuth and MCP endpoints use for the URLs they
hand a client.

You may now open the tunnel's URL from anywhere on the internet, and the web
app will talk to the backend through it.

### Signing in through a tunnel

If your application signs users in, a tunnel in front of the backend needs no
`allowed_origins` entry: the web app is served from the backend's own origin,
and the backend's own origin is always trusted (see
[`allowed_origins`](/users/oauth#allowed_origins)).

Your identity provider does have to accept the new callback URL, so add
`https://<your-tunnel>/__/oauth/callback` to its authorized redirect URIs. A
tunnel that hands out a fresh hostname on every run means redoing this each
time; a tunnel with a stable hostname is worth it if you do this often.

### A frontend on its own origin

If instead you open the frontend's dev server directly, at its own URL rather
than through the backend, the frontend is on a different origin from the
backend and needs a second tunnel of its own. Point the frontend at the
backend's tunnel in its `.env` file:

```
VITE_REBOOT_URL=https://43ee-20-61-126-210.ngrok-free.app
```

(restarting the dev server for the change to take effect), and, if your
application signs users in, add the frontend's tunnel origin to
[`allowed_origins`](/users/oauth#allowed_origins), since under `rbt dev run`
only `http://localhost`, `http://127.0.0.1`, and the dev server named by
`--frontend-url` are trusted automatically:

```python
oauth=OAuth(
    provider=...,
    allowed_origins=["https://<your-frontend-tunnel>"],
)
```
